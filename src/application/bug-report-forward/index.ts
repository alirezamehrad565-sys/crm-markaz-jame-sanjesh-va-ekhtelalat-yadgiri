// ─── چرخهٔ دوطرفهٔ گزارش باگ ↔ پشتیبانی CP (۱.۲۵.۵۷ — هم‌قرارداد CP m8) ───
//
// قرارداد CP ۱.۱۲.۰/m7+m8 (بازخوانی از مخزن CP):
//   POST {cpOrigin}/api/node/feedback — تحویل گزارش (idempotent با id خود گزارش)
//     هدرها: X-CP-Node-Code · Authorization: Bearer <کلید نود> · X-CP-Node-Version
//     بدنه:  { id, areas[], severity, description?, page?, app_version?, reporter_name?, created_at }
//     پاسخ:  201 {ok,data:{id,duplicate}} — 200 با duplicate:true یعنی تکراری (باز هم تحویل‌شده)
//   GET {cpOrigin}/api/node/feedback/replies?since= — pull پاسخ‌های پشتیبانی (m8)
//     پاسخ: {ok,data:{server_time, items:[{id,status,reply_text,reply_by,reply_at,updated_at}]}}
//     آیتم‌ها با شناسهٔ خودِ گزارش (node_report_id سمت CP) برمی‌گردند — UPSERT مستقیم.
//
// همان الگوی cp-report/cp-content: بدون env کامل (CP_SYNC_URL/CP_NODE_CODE/CP_NODE_KEY) =
// خاموشی کامل (kill switch بدون دیپلوی). گیت ۵دقیقه‌ای مشترک کرون/فرصت‌طلب با مُهر settings —
// pull و push هر دو زیر همان گیت‌اند تا دوباره‌کاری صفر باشد.
// هرگز throw نمی‌کند — خطا فقط لاگ و forward_error روی ردیف است؛ تلاش دورهٔ بعد.
import { APP_VERSION } from '@core/version';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { createBugReportService } from '@domain/bug-reports';
import type { BugReportRecord } from '@domain/bug-reports';

export const BUG_REPORT_ATTEMPT_KEY = 'bug_report.forward_attempt_at';
export const BUG_REPORT_REPLY_SINCE_KEY = 'bug_report.reply_since_at'; // ۱.۲۵.۵۷ — مُهر since مکالمه
export const BUG_REPORT_MIN_INTERVAL_MS = 5 * 60_000;
export const BUG_REPORT_TIMEOUT_MS = 15_000;
export const BUG_REPORT_BATCH_MAX = 20;

export interface BugReportForwardConfig {
  cpOrigin: string | null;
  cpNodeCode: string | null;
  cpNodeKey: string | null;
}

type Stringish = string | undefined | null;

function clean(v: Stringish): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
}

/** https://center-system…/… → origin؛ بی‌شکل = null (خاموشی) */
export function cpOriginFrom(v: Stringish): string | null {
  const raw = clean(v);
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function buildBugReportConfig(env: {
  CP_SYNC_URL?: Stringish;
  CP_NODE_CODE?: Stringish;
  CP_NODE_KEY?: Stringish;
}): BugReportForwardConfig {
  return {
    cpOrigin: cpOriginFrom(env.CP_SYNC_URL),
    cpNodeCode: clean(env.CP_NODE_CODE),
    cpNodeKey: clean(env.CP_NODE_KEY)
  };
}

export type BugReportForwardResult =
  | { status: 'skipped' }
  | { status: 'done'; sent: number; failed: number; remaining: number; pulled: number };

function nodeHeaders(config: BugReportForwardConfig): Record<string, string> {
  return {
    'X-CP-Node-Code': config.cpNodeCode as string,
    Authorization: `Bearer ${config.cpNodeKey}`,
    'X-CP-Node-Version': APP_VERSION,
    'content-type': 'application/json'
  };
}

/** مسیر اتصال: Service Binding اگر هست (۱.۲۵.۵۸ — fetch عمومیِ هم‌زونِ ورکر به ورکر
 *  روی workers.dev با خطای ۱۰۴۲ کلادفلر بسته می‌شود — همان درس ۱.۲۵.۳۵c سینک اعلان؛
 *  چرخهٔ گزارش باگ هم از همان الگو پیروی می‌کند)؛ وگرنه fetch عمومی/تزریق‌شده برای سلف‌هاست و تست */
function cpFetchOf(
  deps: { binding?: Fetcher | null; fetchFn?: typeof fetch }
): (url: string, init: RequestInit) => Promise<Response> {
  if (deps.binding) return (url, init) => deps.binding!.fetch(url, init);
  const doFetch = deps.fetchFn ?? fetch;
  return (url, init) => doFetch(url, init);
}

/** بدنهٔ هم‌قرارداد NodeFeedbackSubmitSchema — محدوده‌ها سمت سرویس/مسیر گرفته شده‌اند */
function feedbackBodyOf(rec: BugReportRecord): Record<string, unknown> {
  return {
    id: rec.id,
    areas: rec.areas,
    severity: rec.severity,
    description: rec.description,
    page: rec.page,
    app_version: rec.appVersion,
    reporter_name: rec.staffName,
    created_at: rec.createdAt
  };
}

async function readSettingsIso(db: DbClient, key: string): Promise<string | null> {
  const row = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ? LIMIT 1', [key]);
  if (!row) return null;
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (typeof parsed === 'string' && parsed.length > 0) return parsed; // هم‌قرارداد مُهرهای cp-*
  } catch {
    // مقدار خراب = انگار مُهری نیست
  }
  return null;
}

async function writeSettingsIso(db: DbClient, key: string, iso: string): Promise<void> {
  await db.execute(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [key, JSON.stringify(iso), 'bug-report-forward', new Date().toISOString().replace('T', ' ').slice(0, 19)]
  );
}

/**
 * یک دورهٔ کامل دوطرفه — از کرون و دروازهٔ فرصت‌طلب صدا زده می‌شود؛ گیت ۵دقیقه‌ای مشترک.
 * ۱) pull پاسخ‌های پشتیبانی با مُهر since — مُهر فقط روی موفقیت پیش می‌رود تا هیچ پاسخی گم نشود؛
 * ۲) push صف گزارش‌های باز، ترتیب قدیمی‌ترین اول؛ سقف ۲۰ ردیف در هر دوره تا انبار صف نشود.
 */
export async function runBugReportForward(deps: {
  db: DbClient;
  logger: Logger;
  config: BugReportForwardConfig;
  binding?: Fetcher | null;
  fetchFn?: typeof fetch;
  now?: () => Date;
  force?: boolean;
}): Promise<BugReportForwardResult> {
  const { db, logger, config } = deps;
  if (!config.cpOrigin || !config.cpNodeCode || !config.cpNodeKey) return { status: 'skipped' };
  const now = deps.now ?? (() => new Date());
  const doCpFetch = cpFetchOf(deps);
  const service = createBugReportService(db, silentAudit());

  // مُهر تلاش — کرون و فرصت‌طلب دوباره‌کاری نکنند (force = کرون)
  const lastIso = await readSettingsIso(db, BUG_REPORT_ATTEMPT_KEY);
  const last = lastIso ? Date.parse(lastIso) : 0;
  if (!deps.force && Number.isFinite(last) && now().getTime() - last < BUG_REPORT_MIN_INTERVAL_MS) {
    return { status: 'skipped' };
  }
  await writeSettingsIso(db, BUG_REPORT_ATTEMPT_KEY, now().toISOString());

  // ── ۱) pull پاسخ‌های پشتیبانی (m8) — گم‌نشدنِ پاسخ مهم‌تر از سرعت است ──
  let pulled = 0;
  try {
    const since = await readSettingsIso(db, BUG_REPORT_REPLY_SINCE_KEY);
    const repliesUrl = `${config.cpOrigin}/api/node/feedback/replies${since ? `?since=${encodeURIComponent(since)}` : ''}`;
    const res = await doCpFetch(repliesUrl, {
      method: 'GET',
      headers: nodeHeaders(config),
      signal: AbortSignal.timeout(BUG_REPORT_TIMEOUT_MS)
    });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { data?: { server_time?: string; items?: unknown[] } } | null;
      const items = Array.isArray(body?.data?.items) ? (body?.data?.items as never[]) : [];
      if (items.length > 0) {
        pulled = await service.applyReplies(items);
        logger.info('bug_report.replies.applied', { pulled });
      }
      // مُهر since فقط روی موفقیت پیش می‌رود — خطای UPSERT = دورهٔ بعد دوباره (idempotent)
      await writeSettingsIso(db, BUG_REPORT_REPLY_SINCE_KEY, body?.data?.server_time ?? now().toISOString());
    } else {
      logger.warn('bug_report.replies.pull_failed', { status: res.status });
    }
  } catch (err) {
    logger.warn('bug_report.replies.pull_error', { error: err instanceof Error ? err.message : String(err) });
  }

  // ── ۲) push صف گزارش‌های باز ──
  const open = await service.listOpen(BUG_REPORT_BATCH_MAX);
  const url = `${config.cpOrigin}/api/node/feedback`;
  let sent = 0;
  let failed = 0;
  for (const rec of open) {
    try {
      const res = await doCpFetch(url, {
        method: 'POST',
        headers: nodeHeaders(config),
        body: JSON.stringify(feedbackBodyOf(rec)),
        signal: AbortSignal.timeout(BUG_REPORT_TIMEOUT_MS)
      });
      if (res.ok) {
        // 201 تازه · 200 تکراری — هر دو یعنی CP آن را دارد
        await service.markSent(rec.id, now().toISOString().replace('T', ' ').slice(0, 19));
        sent += 1;
      } else {
        const text = (await res.text().catch(() => '')).slice(0, 200);
        await service.markForwardError(rec.id, `HTTP ${res.status} ${text}`);
        failed += 1;
      }
    } catch (err) {
      await service.markForwardError(rec.id, err instanceof Error ? err.message : String(err));
      failed += 1;
    }
  }
  const remaining = (await service.listOpen(1)).length;
  logger.info('bug_report.forward.done', { sent, failed, remaining, pulled });
  return { status: 'done', sent, failed, remaining, pulled };
}

/** دروازهٔ فرصت‌طلب روی ترافیک زنده — بدون env کامل = صفر بار اضافه */
export async function bugReportOpportunistic(deps: {
  db: DbClient;
  logger: Logger;
  config: BugReportForwardConfig;
  binding?: Fetcher | null;
  fetchFn?: typeof fetch;
  now?: () => Date;
}): Promise<BugReportForwardResult> {
  return runBugReportForward(deps);
}

function silentAudit() {
  return {
    log: async () => undefined,
    logInTransaction: async () => undefined
  };
}
