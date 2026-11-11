/**
 * سینک کتابخانهٔ شبکه با کنترل‌پلین (CP) — محور دوم «فاز غنی‌سازی»
 * سند مرجع قرارداد: docs/cp-node-content-hub.md (نسخهٔ نود: 1.25.46)
 *
 * دو جهت با یک ریتم و یک مُهر تلاش مشترک:
 *  ① push همرسانی‌های محلی (status='queued'، origin='local')
 *     → POST {origin}/api/node/content/submit — دسته‌ای ≤ ۲۰ آیتم
 *     → پاسخ ok یعنی CP پذیرفته (صف کیوریشن) → ردیف‌ها 'submitted' می‌شوند.
 *  ② pull برگزیده‌های توزیع‌شده
 *     → GET {origin}/api/node/content/sync?since=<آخرین سینک −۶۰s>
 *     → فقط ردیف‌های با پیشوند «cp-content-» نوشته می‌شوند (فیلتر JS + گارد SQL
 *       — دو لایه دفاع، هم‌شکل قرارداد اعلان‌ها)؛ active:false = بایگانی.
 *
 * اصول (همان هفت‌گانهٔ سوارسازی):
 *  • هیچ پورت ورودی و webhook جدیدی نیست؛ مسیر انتقال Service Binding «CP»
 *    اگر موجود باشد، وگرنه fetch عمومی (سلف‌هاست و نود بیرونی هم‌قرارداد).
 *  • متغیر env تازه‌ای معرفی نمی‌شود — منشأ آدرس = origin همان CP_SYNC_URL
 *    و کلید همان CP_NODE_CODE/CP_NODE_KEY؛ هر سه خالی = خاموش کامل (kill switch).
 *  • خطای شبکه/۴۰۱/۴۰۴ کرش نمی‌کند: log.warn و تلاش در دورهٔ بعد (استقلال نود).
 *  • CP هنوز این دو درگاه را ندارد؟ پاسخ ۴۰۴ فقط warn است — با راه‌اندازی CP،
 *    همین کد بدون تغییر شروع به کار می‌کند.
 *
 * ریتم: حداکثر یک دورهٔ کامل (push+pull) در ۱۵ دقیقه — هم‌ریتم سینک اعلان؛
 * مُهر مشترک cron (CP_SYNC_CRON) و دروازهٔ فرصت‌طلب از دوباره‌کاری می‌بندد.
 */
import { z } from 'zod';
import { APP_VERSION } from '@core/version';
import { createAuditWriter } from '@core/audit';
import { createContentScoreService } from '@domain/content-score';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';

/** مُهر «آخرین تلاش دورهٔ کامل» — رگولاتور مشترک cron و دروازهٔ فرصت‌طلب */
export const CP_CONTENT_ATTEMPT_KEY = 'cp_content.last_attempt_at';
/** مُهر «آخرین pull موفق برگزیده‌ها» (ISO UTC از server_time CP) */
export const CP_CONTENT_SYNC_KEY = 'cp_content.last_sync_at';
/** مُهر «آخرین push موفق همرسانی‌ها» */
export const CP_CONTENT_PUSH_KEY = 'cp_content.last_push_at';
/** حداقل فاصلهٔ دو دوره — ۱۵ دقیقه (هم‌ریتم سینک اعلان) */
export const CP_CONTENT_MIN_INTERVAL_MS = 15 * 60_000;
/** پیشوند شناسهٔ برگزیده‌های شبکه — مرز «متعلق به CP» */
export const CP_CONTENT_ID_PREFIX = 'cp-content-';
/** since را ۶۰ ثانیه عقب‌تر می‌فرستیم (هم‌قرارداد سینک اعلان) */
export const CP_CONTENT_LOOKBACK_MS = 60_000;
/** سقف زمان یک fetch */
export const CP_CONTENT_TIMEOUT_MS = 15_000;
/** حداکثر آیتم در هر دستهٔ push (فقط همرسانی) */
export const CP_CONTENT_BATCH_MAX = 20;
/**
 * ۱.۲۵.۶۷ — رفع CP-1: سقف پاسخ pull جدا از ثابت دستهٔ push است.
 * تا ۱.۲۵.۶۶ اسکیمای pull با همان CP_CONTENT_BATCH_MAX=۲۰ بسته بود در حالی که
 * قرارداد (cp-node-content-hub.md §۵) و رفتار CP سمت خودش (LIMIT ۱۰۰ —
 * cp-repo pure.ts:21 / service.ts:924) سقف ۱۰۰ می‌گویند؛ از آیتم ۲۱ به بعد
 * هر pull برای همیشه payload_invalid می‌شد (دور بی‌نهایت — مُهر sync فقط روی
 * موفقیت پیش می‌رود). درس ثبت‌شده در طرح ارتقا §۳-۶: ثابت‌های قراردادی با
 * نامِ جهت (PULL/PUSH) تعریف شوند، نه ثابت مشترک.
 */
export const CP_CONTENT_PULL_MAX = 100;

export interface CpContentConfig {
  /** origin CP (استخراج از CP_SYNC_URL) — بدون مسیر */
  cpOrigin: string | null;
  cpNodeCode: string | null;
  cpNodeKey: string | null;
  /** سازندهٔ ردیف‌های cp در نود — همان CP_SYNC_STAFF_ID قرارداد اعلان (اختیاری) */
  cpSyncStaffId: string | null;
}

type Stringish = string | undefined | null;

function clean(v: Stringish): string | null {
  const s = v?.trim();
  return s ? s : null;
}

/** origin از آدرس سینک اعلان — ورودی خراب = null (خاموش) */
export function cpOriginFrom(baseUrl: Stringish): string | null {
  const s = clean(baseUrl);
  if (!s) return null;
  try {
    return new URL(s).origin;
  } catch {
    return null;
  }
}

export function buildCpContentConfig(env: {
  CP_SYNC_URL?: Stringish;
  CP_NODE_CODE?: Stringish;
  CP_NODE_KEY?: Stringish;
  CP_SYNC_STAFF_ID?: Stringish;
}): CpContentConfig {
  return {
    cpOrigin: cpOriginFrom(env.CP_SYNC_URL),
    cpNodeCode: clean(env.CP_NODE_CODE),
    cpNodeKey: clean(env.CP_NODE_KEY),
    cpSyncStaffId: clean(env.CP_SYNC_STAFF_ID)
  };
}

// ─── شکل قرارداد (snake_case، هم‌سند cp-node-content-hub.md) ───

/** آیتم همرسانی نود → CP (push) */
export interface CpContentSubmitItem {
  id: string;
  kind: 'exercise' | 'plan' | 'doc';
  title: string;
  summary: string;
  body: string;
  tags: string[];
  submitted_at: string;
  source_ref: string | null;
}

export interface CpContentSubmitPayload {
  items: CpContentSubmitItem[];
}

/** آیتم برگزیدهٔ CP → نود (pull) */
export interface CpContentSyncItem {
  id: string;
  kind: 'exercise' | 'plan' | 'doc';
  title: string;
  summary: string;
  body: string;
  tags: string[];
  active: boolean;
  source_center: string | null;
  created_at: string;
  updated_at: string;
}

const CpContentSyncItemSchema = z.object({
  // min(4) هم‌قرارداد اعلان‌ها: آیتم بی‌پیشوند باید از Zod رد شود تا فیلتر JS (لایهٔ دفاع اول) آن را ببیند و دور بریزد
  // 1.25.48 m6 — هم‌قرارداد با شکل واقعی CP (docs/cp-content-sharing.md): پنج گونهٔ کتابخانه
  // + شناسنامهٔ طراح/فایل/زیردسته/امتیاز؛ active از status CP مشتق می‌شود (retired = بایگانی).
  id: z.string().min(4).max(120),
  kind: z.enum(['exercise', 'card', 'document', 'plan', 'doc', 'clearbook']),
  title: z.string().min(1).max(300),
  summary: z.string().max(2000).nullable().default(null),
  body: z.string().max(12000).nullable().default(null),
  tags: z.array(z.string().max(60)).max(12).default([]),
  subcategory: z.string().max(40).nullable().default(null),
  author_name: z.string().max(120).nullable().default(null),
  co_author_name: z.string().max(120).nullable().default(null),
  file_name: z.string().max(200).nullable().default(null),
  file_size: z.number().int().min(0).max(100_000_000).nullable().default(null),
  external_url: z.string().max(500).nullable().default(null),
  quality: z.record(z.unknown()).nullable().default(null),
  status: z.enum(['collected', 'approved', 'rejected', 'retired', 'published']),
  source_center_code: z.string().max(60).nullable().default(null),
  source_center_name: z.string().max(120).nullable().default(null),
  created_at: z.string().min(10).max(40),
  updated_at: z.string().min(10).max(40)
});

const CpContentSyncResponseSchema = z.object({
  data: z.object({
    server_time: z.string().min(10).max(40),
    items: z.array(CpContentSyncItemSchema).max(CP_CONTENT_PULL_MAX) // CP-1 — قرارداد §۵: ≤۱۰۰ (نه ثابت دستهٔ push)
  })
});

export type CpContentStatus = 'disabled' | 'ok' | 'error' | 'skipped';

export interface CpContentCycleResult {
  status: CpContentStatus;
  /** تعداد همرسانی push‌شده — فقط در ok */
  pushed?: number;
  /** تعداد برگزیدهٔ UPSERT‌شده — فقط در ok */
  applied?: number;
  detail?: string;
}

// ─── مُهرهای settings ───

async function readSettingsIso(db: DbClient, key: string): Promise<string | null> {
  const row = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return null;
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (typeof parsed === 'string' && parsed.length > 0) return parsed;
  } catch {
    // مقدار خراب = انگار مُهری نیست
  }
  return null;
}

async function writeSettings(db: DbClient, key: string, iso: string, updatedBy: string, nowIso: string): Promise<void> {
  await db.execute(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [key, JSON.stringify(iso), updatedBy, nowIso]
  );
}

export function shouldRunCpContent(lastAttemptIso: string | null, now: Date, minIntervalMs: number = CP_CONTENT_MIN_INTERVAL_MS): boolean {
  if (!lastAttemptIso) return true;
  const t = Date.parse(lastAttemptIso);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= minIntervalMs;
}

export async function stampCpContentAttempt(db: DbClient, at: Date = new Date()): Promise<void> {
  await writeSettings(db, CP_CONTENT_ATTEMPT_KEY, at.toISOString(), 'cp-content', at.toISOString());
}

// ─── ① push همرسانی‌های محلی ───

async function pushQueuedSubmissions(deps: {
  db: DbClient;
  log: Logger;
  config: CpContentConfig;
  binding?: Fetcher | null;
  fetchFn?: typeof fetch;
  nowIso: string;
}): Promise<number> {
  const { db, log, config, nowIso } = deps;
  const rows = await db.query<{
    id: string;
    kind: string;
    title: string;
    summary: string | null;
    body: string | null;
    tags: string | null;
    submitted_at: string | null;
    source_ref: string | null;
  }>(
    `SELECT id, kind, title, summary, body, tags, submitted_at, source_ref
     FROM network_content
     WHERE origin = 'local' AND status = 'queued'
     ORDER BY submitted_at ASC LIMIT ${CP_CONTENT_BATCH_MAX}`
  );
  if (rows.length === 0) return 0;

  let tags: string[] = [];
  const items: CpContentSubmitItem[] = rows.map((r) => {
    try {
      const parsed: unknown = r.tags ? JSON.parse(r.tags) : null;
      if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
    } catch {
      tags = [];
    }
    return {
      id: r.id,
      kind: r.kind === 'plan' || r.kind === 'doc' ? r.kind : 'exercise',
      title: r.title,
      summary: r.summary ?? '',
      body: r.body ?? '',
      tags,
      submitted_at: r.submitted_at ?? nowIso,
      source_ref: r.source_ref
    };
  });

  const url = `${config.cpOrigin}/api/node/content/submit`;
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'X-CP-Node-Code': config.cpNodeCode ?? '',
      Authorization: `Bearer ${config.cpNodeKey ?? ''}`,
      'X-CP-Node-Version': APP_VERSION,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ items }),
    signal: AbortSignal.timeout(CP_CONTENT_TIMEOUT_MS)
  };
  const res = deps.binding
    ? await deps.binding.fetch(url, init)
    : await (deps.fetchFn ?? fetch)(url, init);

  if (!res.ok) {
    let bodyHead = '';
    try {
      bodyHead = (await res.text()).slice(0, 180);
    } catch {
      bodyHead = '';
    }
    log.warn('cp_content.push_failed', { http: res.status, detail: 'cp_http_error', url, body_head: bodyHead });
    throw new Error(`http_${res.status}`);
  }

  // پذیرش CP → ردیف‌ها «submitted» می‌شوند؛ CP در پاسخش accepted را می‌شمارد
  await db.execute(
    `UPDATE network_content SET status = 'submitted', updated_at = ?
     WHERE origin = 'local' AND status = 'queued' AND id IN (${items.map(() => '?').join(', ')})`,
    [nowIso, ...items.map((i) => i.id)]
  );
  log.info('cp_content.push', { n: items.length });
  return items.length;
}

// ─── ② pull برگزیده‌های توزیع‌شده ───

async function pullCuratedItems(deps: {
  db: DbClient;
  log: Logger;
  config: CpContentConfig;
  binding?: Fetcher | null;
  fetchFn?: typeof fetch;
  nowIso: string;
}): Promise<number> {
  const { db, log, config, nowIso } = deps;

  const lastIso = await readSettingsIso(db, CP_CONTENT_SYNC_KEY);
  let sinceIso: string | null = null;
  if (lastIso) {
    const t = Date.parse(lastIso);
    if (!Number.isNaN(t)) sinceIso = new Date(t - CP_CONTENT_LOOKBACK_MS).toISOString();
  }

  const url = `${config.cpOrigin}/api/node/content/sync${sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : ''}`;
  const init: RequestInit = {
    method: 'GET',
    headers: {
      'X-CP-Node-Code': config.cpNodeCode ?? '',
      Authorization: `Bearer ${config.cpNodeKey ?? ''}`,
      'X-CP-Node-Version': APP_VERSION
    },
    signal: AbortSignal.timeout(CP_CONTENT_TIMEOUT_MS)
  };
  const res = deps.binding
    ? await deps.binding.fetch(url, init)
    : await (deps.fetchFn ?? fetch)(url, init);

  if (!res.ok) {
    // ۴۰۴ یعنی CP هنوز درگاه را ندارد — warn و تلاش دورهٔ بعد (استقلال کامل نود)
    let bodyHead = '';
    try {
      bodyHead = (await res.text()).slice(0, 180);
    } catch {
      bodyHead = '';
    }
    log.warn('cp_content.pull_failed', { http: res.status, detail: 'cp_http_error', url, body_head: bodyHead });
    throw new Error(`http_${res.status}`);
  }

  const payload: unknown = await res.json();
  const parsed = CpContentSyncResponseSchema.safeParse(payload);
  if (!parsed.success) {
    log.warn('cp_content.pull_failed', { detail: 'cp_payload_invalid' });
    throw new Error('payload_invalid');
  }

  const items = parsed.data.data.items
    // لایهٔ دفاع اول: فقط پیشوند «cp-content-» — هرگز ردیف‌های محلی را نمی‌بینیم
    .filter((it) => it.id.startsWith(CP_CONTENT_ID_PREFIX))
    // قدیمی→جدید تا جدیدترین برنده باشد (هم‌قرارداد اعلان‌ها)
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));

  if (items.length > 0) {
    const createdBy = config.cpSyncStaffId ?? 'cp-content';
    const statements = items.map((it) =>
      db.prepare(
        `INSERT INTO network_content
           (id, kind, title, summary, body, tags, subcategory, author_name, co_author_name,
            file_name, file_size, external_url, quality, origin, status, source_center,
            active, synced_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cp', 'published', ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind,
           title = excluded.title,
           summary = excluded.summary,
           body = excluded.body,
           tags = excluded.tags,
           subcategory = excluded.subcategory,
           author_name = excluded.author_name,
           co_author_name = excluded.co_author_name,
           file_name = excluded.file_name,
           file_size = excluded.file_size,
           external_url = excluded.external_url,
           quality = excluded.quality,
           source_center = excluded.source_center,
           active = excluded.active,
           synced_at = excluded.synced_at,
           updated_at = excluded.updated_at
         -- گارد طلایی (لایهٔ دفاع دوم): هرگز ردیف‌های محلی (بدون پیشوند cp-content-) را بازنویسی نکن
         WHERE network_content.id LIKE 'cp-content-%'`,
        [
          it.id,
          it.kind,
          it.title,
          it.summary,
          it.body,
          JSON.stringify(it.tags),
          it.subcategory,
          it.author_name,
          it.co_author_name,
          it.file_name,
          it.file_size,
          it.external_url,
          JSON.stringify(it.quality ?? {}),
          it.source_center_name ?? it.source_center_code,
          it.status === 'retired' ? 0 : 1,
          nowIso,
          createdBy,
          it.created_at,
          it.updated_at
        ]
      )
    );
    await db.batch(statements);
  }

  await writeSettings(db, CP_CONTENT_SYNC_KEY, parsed.data.data.server_time, 'cp-content', nowIso);
  log.info('cp_content.pull', { n: items.length, received: parsed.data.data.items.length });
  return items.length;
}

// ─── دورهٔ کامل + دروازهٔ فرصت‌طلب ───

export type CpContentProbeResult = CpContentCycleResult | { status: 'skipped' };

/** دروازهٔ فرصت‌طلب روی مسیر fetch — بدون env کامل = صفر بار اضافه */
export async function cpContentOpportunistic(deps: {
  db: DbClient;
  logger: Logger;
  config: CpContentConfig;
  binding?: Fetcher | null;
  fetchFn?: typeof fetch;
  now?: () => Date;
  minIntervalMs?: number;
}): Promise<CpContentProbeResult> {
  const { db, logger, config } = deps;
  if (!config.cpOrigin || !config.cpNodeCode || !config.cpNodeKey) {
    return { status: 'skipped' };
  }
  const now = deps.now ?? (() => new Date());
  const last = await readSettingsIso(db, CP_CONTENT_ATTEMPT_KEY);
  if (!shouldRunCpContent(last, now(), deps.minIntervalMs ?? CP_CONTENT_MIN_INTERVAL_MS)) {
    return { status: 'skipped' };
  }
  return runCpContentCycle({ db, logger, config, binding: deps.binding, fetchFn: deps.fetchFn, now: deps.now });
}

/**
 * یک دورهٔ کامل کتابخانهٔ شبکه (push همرسانی‌ها + pull برگزیده‌ها) —
 * از scheduled (کرون ۱۵دقیقه‌ای موجود) و دروازهٔ فرصت‌طلب صدا زده می‌شود؛
 * گیت ۱۵دقیقه‌ای مشترک دوباره‌کاری را می‌بندد. هرگز throw نمی‌کند.
 * ترتیب: اول push (صف مرکز زودتر می‌رود) بعد pull — خطای هر کدام خطای دیگری نیست.
 */
/** دانلود فقط-خواندنی فایل آیتم از CP (1.25.48 m6) — در لحظهٔ نیاز؛ بایت در CP می‌ماند.
 *  مسیر قراردادی: GET /api/node/content/items/:id/file با همان کلید نود؛ شناسهٔ ذخیره‌شدهٔ
 *  نود «cp-content-cc-…» است و پیشوند این‌جا جدا می‌شود. */
export async function fetchCpContentFile(deps: {
  config: CpContentConfig;
  networkItemId: string;
  binding?: Fetcher | null;
  fetchFn?: typeof fetch;
}): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const { config } = deps;
  if (!config.cpOrigin || !config.cpNodeCode || !config.cpNodeKey) return null;
  const ccId = deps.networkItemId.startsWith(CP_CONTENT_ID_PREFIX)
    ? deps.networkItemId.slice(CP_CONTENT_ID_PREFIX.length)
    : deps.networkItemId;
  try {
    const url = `${config.cpOrigin}/api/node/content/items/${encodeURIComponent(ccId)}/file`;
    const init: RequestInit = {
      method: 'GET',
      headers: {
        'X-CP-Node-Code': config.cpNodeCode,
        Authorization: `Bearer ${config.cpNodeKey}`,
        'X-CP-Node-Version': APP_VERSION
      }
    };
    const res = deps.binding
      ? await deps.binding.fetch(url, init)
      : await (deps.fetchFn ?? fetch)(url, init);
    if (!res.ok) return null;
    return { bytes: await res.arrayBuffer(), mime: res.headers.get('content-type') ?? 'application/octet-stream' };
  } catch {
    return null;
  }
}

export async function runCpContentCycle(deps: {
  db: DbClient;
  logger: Logger;
  config: CpContentConfig;
  binding?: Fetcher | null;
  fetchFn?: typeof fetch;
  now?: () => Date;
  minIntervalMs?: number;
}): Promise<CpContentCycleResult> {
  const { db, logger, config } = deps;
  const log = logger.child('cp-content');

  // ۱) خاموشِ کامل — هر سه متغیر لازم (kill switch بدون دیپلوی؛ env تازه نداریم)
  if (!config.cpOrigin || !config.cpNodeCode || !config.cpNodeKey) {
    return { status: 'disabled' };
  }

  const now = deps.now ?? (() => new Date());
  const nowIso = now().toISOString();

  let pushed = 0;
  let applied = 0;
  const errors: string[] = [];

  try {
    // ۲) گیت ۱۵دقیقه‌ای — مُهر تلاش قبل از کار (هم‌الگوی cp-sync و cp-report)
    const lastIso = await readSettingsIso(db, CP_CONTENT_ATTEMPT_KEY);
    if (!shouldRunCpContent(lastIso, now(), deps.minIntervalMs ?? CP_CONTENT_MIN_INTERVAL_MS)) {
      return { status: 'skipped' };
    }
    await stampCpContentAttempt(db, now());

    // ۳) push همرسانی‌های محلی — خطایش مانع pull نمی‌شود
    try {
      pushed = await pushQueuedSubmissions({ db, log, config, binding: deps.binding, fetchFn: deps.fetchFn, nowIso });
      await writeSettings(db, CP_CONTENT_PUSH_KEY, nowIso, 'cp-content', nowIso);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    // ۴) pull برگزیده‌های توزیع‌شده
    try {
      applied = await pullCuratedItems({ db, log, config, binding: deps.binding, fetchFn: deps.fetchFn, nowIso });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    // ۵) 1.25.48 m6 — مولد امتیاز شناسنامهٔ آیتم: خودِ سامانهٔ کلاینت؛ در همهٔ مسیرهای چرخه
    // (کرون + فرصت‌طلب) اجرا می‌شود؛ خطایش مانع سینک نیست و هرگز کرش نمی‌کند.
    try {
      const score = await createContentScoreService(db, createAuditWriter(db)).refresh();
      log.info('content_score.cycle', { exercises: score.exercises, templates: score.templates, ms: score.durationMs });
    } catch (err) {
      log.warn('content_score.cycle_failed', { error: err instanceof Error ? err.message : String(err) });
    }

    if (errors.length === 2) {
      return { status: 'error', detail: errors.join('|') };
    }
    return {
      status: errors.length === 0 ? 'ok' : 'error',
      pushed,
      applied,
      detail: errors.length > 0 ? errors.join('|') : undefined
    };
  } catch (err) {
    log.warn('cp_content.cycle_failed', {
      detail: 'exception',
      error: err instanceof Error ? err.message : String(err)
    });
    return { status: 'error', detail: 'exception' };
  }
}
