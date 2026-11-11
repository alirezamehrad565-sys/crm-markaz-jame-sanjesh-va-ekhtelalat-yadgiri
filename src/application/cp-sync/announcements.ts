/**
 * سینک اعلان‌ها از کنترل‌پلین شبکه (CP) — قرارداد m1.5
 * سند مرجع: cp-node-announcement-sync.md (CP v1.5.0)
 *
 * اصول:
 *  • جهت داده یک‌طرفه CP → نود با pull؛ هیچ پورت ورودی و هیچ webhook جدیدی نداریم.
 *  • چهار متغیر env: CP_SYNC_URL / CP_NODE_CODE / CP_NODE_KEY / CP_SYNC_STAFF_ID
 *    — هر کدام خالی باشد سینک کاملاً خاموش است (kill switch بدون دیپلوی).
 *  • قانون طلایی: فقط ردیف‌های با پیشوند `cp-` نوشته می‌شوند؛ اعلان‌های محلی مدیر مرکز
 *    هرگز بازنویسی نمی‌شوند (فیلتر JS + گارد SQL — دو لایه دفاع).
 *  • `active:false` رسیده از CP یعنی بایگانی — حذف فیزیکی ممنوع.
 *  • خطای شبکه/۴۰۱ کرش نمی‌کند: log.warn و تلاش در دورهٔ بعد.
 *  • هیچ مایگریشنی لازم نیست؛ شکل ردیف همان جدول `announcements` موجود است.
 */
import { z } from 'zod';
import { APP_VERSION } from '@core/version';
import { CP_SYNC_CRON } from '@core/shared';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
// ۱.۲۵.۶۸ — CP-5: سقف بدنهٔ پاسخ پیش از parse (طرح ارتقا §۳-۵/§۴ آیتم ۲۴)
import { readJsonCapped, readTextCapped, CpBodyTooLargeError } from '@app/cp-link/body';

/** کلید settings برای «آخرین سینک موفق» (ISO UTC) */
export const CP_SYNC_SETTINGS_KEY = 'cp_sync.last_sync_at';
/** کلید settings برای «آخرین تلاش سینک» — رگولاتور مشترک cron و دروازهٔ فرصت‌طلب */
export const CP_SYNC_ATTEMPT_KEY = 'cp_sync.last_attempt_at';
/** حداقل فاصلهٔ دو تلاش سینک — ۱۵ دقیقه (هم‌ریتم قرارداد) */
export const CP_SYNC_MIN_INTERVAL_MS = 15 * 60_000;
/** پیشوند شناسهٔ اعلان‌های شبکه‌ای — مرزِ «متعلق به CP» */
export const CP_ID_PREFIX = 'cp-';
/** since را ۶۰ ثانیه عقب‌تر می‌فرستیم (توصیهٔ صریح قرارداد §۲) */
export const CP_SYNC_LOOKBACK_MS = 60_000;
/** سقف زمان یک fetch سینک */
export const CP_SYNC_TIMEOUT_MS = 15_000;
/** عبارت cron سینک — هر ۱۵ دقیقه (هم در wrangler و هم سلف‌هاست) — تعریف اصلی: @core/shared */
export { CP_SYNC_CRON };

export interface CpSyncConfig {
  cpSyncUrl: string | null;
  cpNodeCode: string | null;
  cpNodeKey: string | null;
  cpSyncStaffId: string | null;
}

type Stringish = string | undefined | null;

/** رشتهٔ خالی/فاصله‌دار = تنظیم‌نشده (هم‌قرارداد buildEnv سامانه) */
function clean(v: Stringish): string | null {
  const s = v?.trim();
  return s ? s : null;
}

/** ورودی: هر شیء حاوی چهار کلید env (مثل Env ورکر یا آبجکت تست) */
export function buildCpSyncConfig(env: {
  CP_SYNC_URL?: Stringish;
  CP_NODE_CODE?: Stringish;
  CP_NODE_KEY?: Stringish;
  CP_SYNC_STAFF_ID?: Stringish;
}): CpSyncConfig {
  return {
    cpSyncUrl: clean(env.CP_SYNC_URL),
    cpNodeCode: clean(env.CP_NODE_CODE),
    cpNodeKey: clean(env.CP_NODE_KEY),
    cpSyncStaffId: clean(env.CP_SYNC_STAFF_ID)
  };
}

// ─── اسکیمای پاسخ CP — قرارداد §۲ سند m1.5 ───

const CpSyncItemSchema = z.object({
  id: z.string().min(4).max(120),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  show_login: z.boolean(),
  show_panel: z.boolean(),
  active: z.boolean(),
  created_at: z.string().min(10).max(40),
  updated_at: z.string().min(10).max(40)
});

const CpSyncResponseSchema = z.object({
  data: z.object({
    server_time: z.string().min(10).max(40),
    items: z.array(CpSyncItemSchema).max(100)
  })
});

export type CpSyncStatus = 'disabled' | 'ok' | 'error';

export interface CpSyncResult {
  status: CpSyncStatus;
  /** تعداد ردیف اعمال‌شده (UPSERT) — فقط در status=ok */
  applied?: number;
  /** تعداد آیتم دریافتی از CP */
  received?: number;
  /** کد خطای ریز برای لاگ عملیاتی */
  detail?: string;
}

function boolToInt(b: boolean): 0 | 1 {
  return b ? 1 : 0;
}

/** آدرس درخواست با دلتای since (بدون since اگر سینک موفق قبلی نداریم) */
function buildRequestUrl(baseUrl: string, sinceIso: string | null): string {
  if (!sinceIso) return baseUrl;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}since=${encodeURIComponent(sinceIso)}`;
}

async function readLastSyncAt(db: DbClient): Promise<string | null> {
  return readSettingsIso(db, CP_SYNC_SETTINGS_KEY);
}

async function writeLastSyncAt(db: DbClient, iso: string): Promise<void> {
  await db.execute(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES (?, ?, 'cp-sync', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = 'cp-sync', updated_at = excluded.updated_at`,
    [CP_SYNC_SETTINGS_KEY, JSON.stringify(iso), iso]
  );
}

async function readSettingsIso(db: DbClient, key: string): Promise<string | null> {
  const row = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return null;
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (typeof parsed === 'string' && parsed.length > 0) return parsed;
  } catch {
    // مقدار خراب = انگار سینک قبلی نداریم
  }
  return null;
}

/** مُهر «آخرین تلاش» — مشترک بین کرون و دروازهٔ فرصت‌طلب تا کار دوباره نشود */
export async function stampCpSyncAttempt(db: DbClient, at: Date = new Date()): Promise<void> {
  await db.execute(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES (?, ?, 'cp-sync', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = 'cp-sync', updated_at = excluded.updated_at`,
    [CP_SYNC_ATTEMPT_KEY, JSON.stringify(at.toISOString()), at.toISOString()]
  );
}

/** آیا از آخرین تلاش به اندازهٔ کافی گذشته؟ (تازگی ناشناس/خراب = اجازهٔ تلاش) */
export function shouldAttemptCpSync(
  lastAttemptIso: string | null,
  now: Date,
  minIntervalMs: number = CP_SYNC_MIN_INTERVAL_MS
): boolean {
  if (!lastAttemptIso) return true;
  const t = Date.parse(lastAttemptIso);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= minIntervalMs;
}

export type CpSyncProbeResult = CpSyncResult | { status: 'skipped' };

/**
 * دروازهٔ فرصت‌طلب سینک CP روی مسیر fetch — جایگزین کرون پنجم
 * (سقف پلن Free کلادفلر: ۵ کرون در کل حساب؛ این مسیر بدون کرون تازه کار می‌کند).
 * هر درخواست فقط یک مقایسهٔ in-memory می‌پردازد؛ حداکثر یک‌بار در دقیقه
 * settings خوانده می‌شود و هر تلاش با مُهر مشترک، ۱۵ دقیقه فاصله می‌گیرد.
 * فعال‌سازی بعدی با کرون اختصاصی (پلن بالاتر) هم‌ساز است: مُهر مشترک است.
 */
export async function cpSyncOpportunistic(deps: {
  db: DbClient;
  logger: Logger;
  config: CpSyncConfig;
  /** Service Binding «CP» — اگر موجود باشد به‌جای fetch عمومی */
  binding?: Fetcher | null;
  fetchFn?: typeof fetch;
  now?: () => Date;
  minIntervalMs?: number;
}): Promise<CpSyncProbeResult> {
  const { db, logger, config } = deps;
  // بدون env کامل: هیچ خواندنی هم ندارد — صفر بار اضافه روی مسیر درخواست
  if (!config.cpSyncUrl || !config.cpNodeCode || !config.cpNodeKey || !config.cpSyncStaffId) {
    return { status: 'skipped' };
  }
  const now = deps.now ?? (() => new Date());
  const last = await readSettingsIso(db, CP_SYNC_ATTEMPT_KEY);
  if (!shouldAttemptCpSync(last, now(), deps.minIntervalMs ?? CP_SYNC_MIN_INTERVAL_MS)) {
    return { status: 'skipped' };
  }
  await stampCpSyncAttempt(db, now());
  return syncCpAnnouncements({
    db,
    logger,
    config,
    binding: deps.binding,
    fetchFn: deps.fetchFn,
    now: deps.now
  });
}

/**
 * یک دورهٔ سینک اعلان CP — هر ۱۵ دقیقه از scheduled/selfhost-crons صدا زده می‌شود.
 * هرگز throw نمی‌کند؛ خطا = result با status:'error' و log.warn.
 *
 * مسیر اتصال: اگر deps.binding (Service Binding ورکر به ورکر — خطای 1042 کلادفلر
 * fetch عمومیِ هم‌زون را می‌بندد) موجود بود از همان استفاده می‌شود؛ وگرنه fetch عمومی
 * با CP_SYNC_URL — یعنی سلف‌هاست و نود بیرونی با همان قرارداد HTTPS کار می‌کنند.
 */
export async function syncCpAnnouncements(deps: {
  db: DbClient;
  logger: Logger;
  config: CpSyncConfig;
  /** Service Binding «CP» در ورکر (هم‌حساب) — null/undefined = fetch عمومی */
  binding?: Fetcher | null;
  /** تزریق fetch برای تست */
  fetchFn?: typeof fetch;
  now?: () => Date;
}): Promise<CpSyncResult> {
  const { db, logger, config } = deps;
  const log = logger.child('cp-sync');

  // ۱) خاموشِ کامل — هر چهار متغیر باید ست باشند (قرارداد §۳-۱)
  if (!config.cpSyncUrl || !config.cpNodeCode || !config.cpNodeKey || !config.cpSyncStaffId) {
    return { status: 'disabled' };
  }

  try {
    // ۲) دلتا: آخرین سینک موفق − ۶۰ ثانیه
    const lastIso = await readLastSyncAt(db);
    let sinceIso: string | null = null;
    if (lastIso) {
      const t = Date.parse(lastIso);
      if (!Number.isNaN(t)) sinceIso = new Date(t - CP_SYNC_LOOKBACK_MS).toISOString();
    }

    // ۳) pull از CP با کلید نود m1.2 — service binding اگر هست، وگرنه HTTPS عمومی
    const url = buildRequestUrl(config.cpSyncUrl, sinceIso);
    const init: RequestInit = {
      method: 'GET',
      headers: {
        'X-CP-Node-Code': config.cpNodeCode,
        Authorization: `Bearer ${config.cpNodeKey}`,
        'X-CP-Node-Version': APP_VERSION
      },
      signal: AbortSignal.timeout(CP_SYNC_TIMEOUT_MS)
    };
    const res = deps.binding
      ? await deps.binding.fetch(url, init)
      : await (deps.fetchFn ?? fetch)(url, init);

    if (!res.ok) {
      // تشخیص عملیاتی: URL و آغاز بدنهٔ پاسخ در لاگ می‌آید (بدنهٔ خطای CP راز ندارد)
      // ۱.۲۵.۶۸ — CP-5: بدنهٔ خطا هم با سقف خوانده می‌شود؛ پاسخ عظیم isolate را نمی‌بلعد
      let bodyHead = '';
      try {
        bodyHead = (await readTextCapped(res)).slice(0, 180);
      } catch {
        bodyHead = '';
      }
      log.warn('announcement.cp_sync_failed', {
        http: res.status,
        detail: 'cp_http_error',
        url: config.cpSyncUrl, // کل URL درخواست‌شده — راز ندارد (کلید در هدر است)
        body_head: bodyHead
      });
      return { status: 'error', detail: `http_${res.status}` };
    }

    // ۱.۲۵.۶۸ — CP-5: سقف بدنهٔ پاسخ پیش از parse — پاسخ عظیم = warn و دورهٔ بعد
    let payload: unknown;
    try {
      payload = await readJsonCapped(res);
    } catch (err) {
      if (err instanceof CpBodyTooLargeError) {
        log.warn('announcement.cp_sync_failed', {
          detail: 'cp_body_too_large',
          limit: err.limitBytes,
          received: err.receivedBytes
        });
        return { status: 'error', detail: 'body_too_large' };
      }
      throw err;
    }
    const parsed = CpSyncResponseSchema.safeParse(payload);
    if (!parsed.success) {
      log.warn('announcement.cp_sync_failed', { detail: 'cp_payload_invalid' });
      return { status: 'error', detail: 'payload_invalid' };
    }

    const items = parsed.data.data.items
      // ۴) فقط آیتم‌های `cp-` — قانون طلایی (لایهٔ دفاع اول)
      .filter((it) => it.id.startsWith(CP_ID_PREFIX))
      // ۵) ترتیب اعمال قدیمی→جدید (CP نزولی می‌فرستد؛ معکوس می‌کنیم تا جدیدترین برنده باشد)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at));

    if (items.length > 0) {
      // حساب سازنده باید از قبل موجود باشد (FK جدول announcements)
      const staff = await db.queryOne<{ id: string }>(
        'SELECT id FROM staff WHERE id = ? AND active = 1',
        [config.cpSyncStaffId]
      );
      if (!staff) {
        log.warn('announcement.cp_sync_failed', { detail: 'cp_staff_missing' });
        return { status: 'error', detail: 'staff_missing' };
      }

      const statements = items.map((it) =>
        db.prepare(
          `INSERT INTO announcements
             (id, title, body, show_login, show_panel, bot_sent_staff, bot_sent_families,
              active, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             body = excluded.body,
             show_login = excluded.show_login,
             show_panel = excluded.show_panel,
             active = excluded.active,
             updated_at = excluded.updated_at
           -- گارد طلایی: هرگز اعلان‌های محلی (بدون پیشوند cp-) را بازنویسی نکن (لایهٔ دفاع دوم)
           WHERE announcements.id LIKE 'cp-%'`,
          [
            it.id,
            it.title,
            it.body,
            boolToInt(it.show_login),
            boolToInt(it.show_panel),
            boolToInt(it.active),
            config.cpSyncStaffId,
            it.created_at,
            it.updated_at
          ]
        )
      );
      await db.batch(statements);
    }

    // ۶) ثبت آخرین سینک موفق + لاگ — رسید به CP خودکار است (دفتر تحویل سمت CP ثبت می‌شود)
    const serverTime = parsed.data.data.server_time;
    await writeLastSyncAt(db, serverTime);
    log.info('announcement.cp_sync', { n: items.length, received: parsed.data.data.items.length });
    return { status: 'ok', applied: items.length, received: parsed.data.data.items.length };
  } catch (err) {
    // خطای شبکه/timeout/parse — کرش ممنوع؛ دورهٔ بعد تلاش می‌شود
    log.warn('announcement.cp_sync_failed', {
      error: err instanceof Error ? err.message : String(err)
    });
    return { status: 'error', detail: 'network_or_unexpected' };
  }
}
