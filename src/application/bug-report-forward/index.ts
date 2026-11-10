// ─── ارسال گزارش باگ به پشتیبانی CP (بازاعمال ۱.۲۵.۵۱ — هم‌قرارداد گیرندهٔ m7) ───
//
// قرارداد گیرنده (استخراج از ورکر زندهٔ CP ۱.۱۱.۰/m7):
//   POST {cpOrigin}/api/node/feedback
//   هدرها: X-CP-Node-Code · Authorization: Bearer <کلید نود> · X-CP-Node-Version
//   بدنه:  { id, areas[], severity, description?, page?, app_version?, reporter_name?, created_at }
//   پاسخ:  201 {ok,data:{id,duplicate}} — 200 با duplicate:true یعنی تکراری (باز هم تحویل‌شده)
//
// همان الگوی cp-report/cp-content: بدون env کامل (CP_SYNC_URL/CP_NODE_CODE/CP_NODE_KEY) =
// خاموشی کامل (kill switch بدون دیپلوی). گیت ۵دقیقه‌ای مشترک کرون/فرصت‌طلب با مُهر settings.
// هرگز throw نمی‌کند — خطا فقط لاگ و forward_error روی ردیف است؛ تلاش دورهٔ بعد.
import { APP_VERSION } from '@core/version';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { createBugReportService } from '@domain/bug-reports';
import type { BugReportRecord } from '@domain/bug-reports';

export const BUG_REPORT_ATTEMPT_KEY = 'bug_report.forward_attempt_at';
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
  | { status: 'done'; sent: number; failed: number; remaining: number };

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
 * یک دورهٔ کامل ارسال — از کرون و دروازهٔ فرصت‌طلب صدا زده می‌شود؛ گیت ۵دقیقه‌ای مشترک.
 * ترتیب قدیمی‌ترین اول؛ سقف ۲۰ ردیف در هر دوره تا انبار صف نشود.
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
  const doFetch = deps.fetchFn ?? fetch;

  // گشت بی‌کار: اگر صف خالی است بدون مُهر و بدون نوشتن برمی‌گردیم (صدها دروازهٔ بی‌دلیل ممنوع)
  const service = createBugReportService(db, silentAudit());
  const open = await service.listOpen(BUG_REPORT_BATCH_MAX);
  if (open.length === 0) return { status: 'done', sent: 0, failed: 0, remaining: 0 };

  // مُهر تلاش — کرون و فرصت‌طلب دوباره‌کاری نکنند (force = کرون)
  const lastIso = await readSettingsIso(db, BUG_REPORT_ATTEMPT_KEY);
  const last = lastIso ? Date.parse(lastIso) : 0;
  if (!deps.force && Number.isFinite(last) && now().getTime() - last < BUG_REPORT_MIN_INTERVAL_MS) {
    return { status: 'skipped' };
  }
  await writeSettingsIso(db, BUG_REPORT_ATTEMPT_KEY, now().toISOString());

  const url = `${config.cpOrigin}/api/node/feedback`;
  let sent = 0;
  let failed = 0;
  for (const rec of open) {
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers: {
          'X-CP-Node-Code': config.cpNodeCode,
          Authorization: `Bearer ${config.cpNodeKey}`,
          'X-CP-Node-Version': APP_VERSION,
          'content-type': 'application/json'
        },
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
  logger.info('bug_report.forward.done', { sent, failed, remaining });
  return { status: 'done', sent, failed, remaining };
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
