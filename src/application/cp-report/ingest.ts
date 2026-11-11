/**
 * گزارش‌دهی تجمیعی نود → کنترل‌پلین — «فاز غنی‌سازی» پلهٔ ۱
 * قرارداد: درگاه موجودِ `POST /api/node/ingest` در CP (m1.2) — صفر تغییر سمت CP.
 *
 * قانون طلایی (سند نقشه‌برداری §۱۱): «تجمیع در نود، فقط عدد در CP» —
 * payload فقط شمارنده/درصد/p75 است؛ هیچ رکورد خام، هیچ متن، هیچ شناسهٔ دانش‌آموز.
 * رشتهٔ خطاهای client_errors هرگز از مرز عبور نمی‌کند — فقط COUNT.
 *
 * مسیر انتقال: Service Binding «CP» اگر موجود باشد (هم‌قرارداد cp-sync؛ fetch عمومی
 * هم‌زونِ ورکرها 1042 می‌دهد)، وگرنه fetch عمومی. منشأ آدرس: origin مسیر سینک اعلان
 * (CP_SYNC_URL) + `/api/node/ingest` — متغیر env تازه‌ای نمی‌خواهد.
 *
 * خاموشی کامل (kill switch بدون دیپلوی): هر سه متغیر CP_SYNC_URL / CP_NODE_CODE /
 * CP_NODE_KEY لازم است — هر کدام خالی باشد این ماژول صفر کار می‌کند.
 *
 * ریتم: حداکثر یک push در ۲۴ ساعت (تجمیع روزانه؛ سند نقشه‌برداری §۱۲ فاز ۱).
 * مُهر تلاش مشترک cron و دروازهٔ فرصت‌طلب تا هرگز دوباره‌کاری نشود؛ خطا کرش نمی‌کند
 * — log.warn و تلاش در دورهٔ بعد.
 */
import { APP_VERSION } from '@core/version';
import { tehranTodayYmd, tehranDayRange } from '@core/shared';
// ۱.۲۵.۶۷ — CP-2: مُهرهای سینک از ماژول‌های مالکشان — snapshot سلامت از «دادهٔ واقعی موجود» پر می‌شود نه null
import { CP_SYNC_SETTINGS_KEY } from '@app/cp-sync/announcements';
import { CP_CONTENT_SYNC_KEY } from '@app/cp-content/sync';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';

/** مُهر «آخرین push موفق» (ISO UTC) */
export const CP_REPORT_PUSH_KEY = 'cp_report.last_push_at';
/** مُهر «آخرین تلاش» — رگولاتور مشترک cron و دروازهٔ فرصت‌طلب */
export const CP_REPORT_ATTEMPT_KEY = 'cp_report.last_attempt_at';
/** شمارندهٔ seq رویدادها — صعودی و یکتا در طول عمر نود (قرارداد ingest m1.2) */
export const CP_REPORT_SEQ_KEY = 'cp_report.last_seq';
/** حداقل فاصلهٔ دو push — ۲۴ ساعت (تجمیع روزانه) */
export const CP_REPORT_MIN_INTERVAL_MS = 24 * 60 * 60_000;
/** سقف خواندن ردیف‌های RUM برای محاسبهٔ p75 (حفاظ حافظه؛ مرکزهای کوچک هرگز نمی‌خورند) */
export const RUM_SAMPLE_CAP = 5_000;
/** مهلت یک push */
export const CP_REPORT_TIMEOUT_MS = 15_000;

export interface CpReportConfig {
  ingestUrl: string | null;
  cpNodeCode: string | null;
  cpNodeKey: string | null;
}

type Stringish = string | undefined | null;

function clean(v: Stringish): string | null {
  const s = v?.trim();
  return s ? s : null;
}

/** origin آدرس سینک اعلان + مسیر ingest — ورودی خراب = null (خاموش) */
export function ingestUrlFrom(baseUrl: Stringish): string | null {
  const s = clean(baseUrl);
  if (!s) return null;
  try {
    return new URL(s).origin + '/api/node/ingest';
  } catch {
    return null;
  }
}

/** ورودی: هر شیء حاوی سه کلید env (Env ورکر یا آبجکت تست) */
export function buildCpReportConfig(env: {
  CP_SYNC_URL?: Stringish;
  CP_NODE_CODE?: Stringish;
  CP_NODE_KEY?: Stringish;
}): CpReportConfig {
  return {
    ingestUrl: ingestUrlFrom(env.CP_SYNC_URL),
    cpNodeCode: clean(env.CP_NODE_CODE),
    cpNodeKey: clean(env.CP_NODE_KEY)
  };
}

// ─── شکل سیم ورودی ingest — هم‌قرارداد CP m1.2 (snake_case) ───

export interface CpReportEventInput {
  seq: number;
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  category: 'sync' | 'auth' | 'data' | 'bot' | 'storage' | 'ui' | 'cron';
  event: string;
  actor_ref?: string | null;
  subject_type?: string | null;
  subject_id?: string | null;
  payload?: Record<string, number | null> | null;
  node_run_id?: string | null;
}

export interface CpReportHealthInput {
  captured_at: string;
  reported_version?: string | null;
  outbox_depth?: number | null;
  unsynced_ops?: number | null;
  error_rate_1h?: number | null;
  error_rate_24h?: number | null;
  sync_lag_s?: number | null;
  extras?: Record<string, number> | null;
}

export interface CpReportPayloadInput {
  events: CpReportEventInput[];
  health?: CpReportHealthInput | null;
}

export type CpReportStatus = 'disabled' | 'ok' | 'error' | 'skipped';

export interface CpReportResult {
  status: CpReportStatus;
  /** تعداد رویداد اعمال‌شده — فقط در status=ok */
  applied?: number;
  /** seq رویدادِ ثبت‌شده — فقط در status=ok */
  seq?: number;
  detail?: string;
}

// ─── خواندن/نوشتن مُهرها ───

async function readSettingsRaw(db: DbClient, key: string): Promise<string | null> {
  const row = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

async function readSettingsIso(db: DbClient, key: string): Promise<string | null> {
  const raw = await readSettingsRaw(db, key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'string' && parsed.length > 0) return parsed;
  } catch {
    // مقدار خراب = انگار مُهری نیست
  }
  return null;
}

async function readSettingsInt(db: DbClient, key: string): Promise<number | null> {
  const raw = await readSettingsRaw(db, key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed;
  } catch {
    // مقدار خراب = صفر شروع می‌کنیم
  }
  return null;
}

async function writeSettings(db: DbClient, key: string, jsonValue: string, nowIso: string): Promise<void> {
  await db.execute(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES (?, ?, 'cp-report', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = 'cp-report', updated_at = excluded.updated_at`,
    [key, jsonValue, nowIso]
  );
}

/**
 * ۱.۲۵.۶۷ — CP-2 (طرح ارتقا §۳-۶.۲): snapshot سلامتِ گزارش روزانه از مُهرها و صف‌های واقعی پر می‌شود —
 * تا ۱.۲۵.۶۶ به‌جز reported_version همه‌اش null بود در حالی که همهٔ داده‌هایش همین حالا در
 * settings/جدول‌ها هست (مُهرهای سینک، forward_error صف باگ از 0101). CP می‌تواند روی لینک هشدار بدهد.
 * هم‌قرارداد CpReportHealthInput (snake_case) — هرگز throw نمی‌کند (حکم ماتریس خرابی §۳-۵).
 */
async function collectHealthSnapshot(db: DbClient, at: Date): Promise<CpReportHealthInput> {
  // sync_lag_s: کهنگی «تازه‌ترین موفقیتِ pull» بین دو درگاه CP→نود (اعلان‌ها، برگزیده‌ها) —
  // کوچک‌ترین فاصله از حال = تازه‌ترین؛ هیچ موفقیتی ثبت نشده = null (پیش از نخستین سینک)
  let syncLagS: number | null = null;
  for (const iso of [
    await readSettingsIso(db, CP_SYNC_SETTINGS_KEY),
    await readSettingsIso(db, CP_CONTENT_SYNC_KEY)
  ]) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) continue;
    const lag = Math.max(0, Math.round((at.getTime() - t) / 1000));
    if (syncLagS === null || lag < syncLagS) syncLagS = lag;
  }

  // unsynced_ops: همرسانی‌های محلی هنوز نرفته به CP (status='queued') — عمق صف همرسانی
  const queuedRow = await db
    .queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM network_content WHERE origin = 'local' AND status = 'queued'")
    .catch(() => null); // جدول غایب (نصب بسیار قدیمی) = صفر — استقلال

  // outbox_depth: گزارش‌های باگ باز/شکست‌خوردهٔ ارسال (صف forward از 0101)
  const outboxRow = await db
    .queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM bug_reports WHERE status = 'open' OR forward_error IS NOT NULL")
    .catch(() => null);

  // error_rate_24h: نسبت گزارش‌های ۲۴ساعته‌ای که ارسالشان به CP شکسته —
  // مخرج = گزارش‌های ساخته‌شدهٔ ۲۴ساعته (created_at هم‌فرمت datetime('now')؛ سرویس bug-reports)
  const errRow = await db
    .queryOne<{ total: number; failed: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN forward_error IS NOT NULL THEN 1 ELSE 0 END) AS failed
         FROM bug_reports
        WHERE created_at >= datetime('now', '-24 hours')`
    )
    .catch(() => null);
  const total24 = errRow?.total ?? 0;
  const failed24 = errRow?.failed ?? 0;
  const errorRate24h = total24 > 0 ? Math.round((failed24 / total24) * 1000) / 10 : null;

  return {
    captured_at: at.toISOString(),
    reported_version: APP_VERSION,
    outbox_depth: outboxRow?.n ?? null,
    unsynced_ops: queuedRow?.n ?? null,
    error_rate_1h: null, // نرخ یک‌ساعته مبنای دیتایی پایداری ندارد — سند CP-2 فقط ۲۴ساعته را ثبت کرد
    error_rate_24h: errorRate24h,
    sync_lag_s: syncLagS,
    extras: null
  };
}

export function shouldPushCpReport(
  lastAttemptIso: string | null,
  now: Date,
  minIntervalMs: number = CP_REPORT_MIN_INTERVAL_MS
): boolean {
  if (!lastAttemptIso) return true;
  const t = Date.parse(lastAttemptIso);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= minIntervalMs;
}

export async function stampCpReportAttempt(db: DbClient, at: Date = new Date()): Promise<void> {
  await writeSettings(db, CP_REPORT_ATTEMPT_KEY, JSON.stringify(at.toISOString()), at.toISOString());
}

// ─── تجمیع فقط-عددی (هیچ رشته‌ای از دادهٔ عملیاتی عبور نمی‌کند) ───

/** p75 با روش nearest-rank روی آرایهٔ مرتب‌شده */
export function percentile75(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil(0.75 * sorted.length) - 1;
  return sorted[Math.min(Math.max(idx, 0), sorted.length - 1)] ?? null;
}

/** هر مقدار یا ۰ یا عدد — قرارداد سفت payload */
export interface KpiBucket {
  students_active: number;
  students_archived: number;
  appointments_today: number;
  appointments_cancelled_today: number;
  attendance_pending_overdue: number;
  client_errors_1h: number;
  client_errors_24h: number;
  rum_events_24h: number;
  rum_lcp_p75: number | null;
  rum_cls_p75: number | null;
  rum_inp_p75: number | null;
}

const RUM_SAMPLE_SQL = `SELECT metric, value FROM rum_events
  WHERE ts >= ? AND metric IN ('LCP','CLS','INP') ORDER BY metric, value LIMIT ${RUM_SAMPLE_CAP}`;

export async function collectKpiBucket(db: DbClient, now: Date = new Date()): Promise<KpiBucket> {
  const nowIso = now.toISOString();
  const day = tehranDayRange(tehranTodayYmd(now));

  const [students, appts, overdue, errs, rum] = await Promise.all([
    db.queryOne<{ a: number | null; ar: number | null }>(
      `SELECT COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) AS a,
              COALESCE(SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END), 0) AS ar
       FROM students`
    ),
    db.queryOne<{ t: number | null; c: number | null }>(
      `SELECT COALESCE(SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END), 0) AS t,
              COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS c
       FROM appointments WHERE start_at >= ? AND start_at <= ?`,
      [day.start, day.end]
    ),
    db.queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c
       FROM appointment_students aps JOIN appointments a ON a.id = aps.appointment_id
       WHERE aps.attendance = 'pending' AND a.end_at < ?`,
      [nowIso]
    ),
    db.queryOne<{ h1: number | null; h24: number | null }>(
      `SELECT COALESCE(SUM(CASE WHEN occurred_at >= datetime('now', '-1 hour') THEN 1 ELSE 0 END), 0) AS h1,
              COALESCE(SUM(CASE WHEN occurred_at >= datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS h24
       FROM client_errors WHERE occurred_at >= datetime('now', '-24 hours')`
    ),
    (async () => {
      const sinceIso = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
      const [rows, count] = await Promise.all([
        db.query<{ metric: string; value: number }>(RUM_SAMPLE_SQL, [sinceIso]),
        db.queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM rum_events WHERE ts >= ?', [sinceIso])
      ]);
      const byMetric = new Map<string, number[]>();
      for (const r of rows) {
        const arr = byMetric.get(r.metric) ?? [];
        arr.push(Number(r.value));
        byMetric.set(r.metric, arr);
      }
      return { byMetric, count: count?.c ?? 0 };
    })()
  ]);

  const p75Of = (m: string): number | null => {
    const arr = rum.byMetric.get(m);
    if (!arr || arr.length === 0) return null;
    const v = percentile75(arr);
    return v === null ? null : m === 'CLS' ? Math.round(v * 1000) / 1000 : Math.round(v);
  };

  return {
    students_active: students?.a ?? 0,
    students_archived: students?.ar ?? 0,
    appointments_today: appts?.t ?? 0,
    appointments_cancelled_today: appts?.c ?? 0,
    attendance_pending_overdue: overdue?.c ?? 0,
    client_errors_1h: errs?.h1 ?? 0,
    client_errors_24h: errs?.h24 ?? 0,
    rum_events_24h: rum.count,
    rum_lcp_p75: p75Of('LCP'),
    rum_cls_p75: p75Of('CLS'),
    rum_inp_p75: p75Of('INP')
  };
}

// ─── دروازهٔ فرصت‌طلب + یک دورهٔ کامل push ───

export type CpReportProbeResult = CpReportResult | { status: 'skipped' };

/** دروازهٔ فرصت‌طلب روی مسیر fetch — همان الگوی cp-sync؛ بدون env = صفر بار اضافه */
export async function cpReportOpportunistic(deps: {
  db: DbClient;
  logger: Logger;
  config: CpReportConfig;
  binding?: Fetcher | null;
  fetchFn?: typeof fetch;
  now?: () => Date;
  minIntervalMs?: number;
}): Promise<CpReportProbeResult> {
  const { db, logger, config } = deps;
  if (!config.ingestUrl || !config.cpNodeCode || !config.cpNodeKey) {
    return { status: 'skipped' };
  }
  const now = deps.now ?? (() => new Date());
  const last = await readSettingsIso(db, CP_REPORT_ATTEMPT_KEY);
  if (!shouldPushCpReport(last, now(), deps.minIntervalMs ?? CP_REPORT_MIN_INTERVAL_MS)) {
    return { status: 'skipped' };
  }
  return pushCpReport({ db, logger, config, binding: deps.binding, fetchFn: deps.fetchFn, now: deps.now });
}

/**
 * یک دورهٔ گزارش‌دهی — از scheduled (کرون ۱۵دقیقه‌ای موجود) و دروازهٔ فرصت‌طلب صدا زده
 * می‌شود؛ گیت ۲۴ساعتهٔ درونی دوباره‌کاری را می‌بندد. هرگز throw نمی‌کند.
 */
export async function pushCpReport(deps: {
  db: DbClient;
  logger: Logger;
  config: CpReportConfig;
  binding?: Fetcher | null;
  fetchFn?: typeof fetch;
  now?: () => Date;
  minIntervalMs?: number;
}): Promise<CpReportResult> {
  const { db, logger, config } = deps;
  const log = logger.child('cp-report');

  // ۱) خاموشِ کامل — هر سه متغیر لازم (kill switch بدون دیپلوی)
  if (!config.ingestUrl || !config.cpNodeCode || !config.cpNodeKey) {
    return { status: 'disabled' };
  }

  const now = deps.now ?? (() => new Date());

  try {
    // ۲) گیت ۲۴ساعته — مشترک بین cron و فرصت‌طلب (مُهر تلاش قبل از کار، مثل cp-sync)
    const lastIso = await readSettingsIso(db, CP_REPORT_ATTEMPT_KEY);
    if (!shouldPushCpReport(lastIso, now(), deps.minIntervalMs ?? CP_REPORT_MIN_INTERVAL_MS)) {
      return { status: 'skipped' };
    }
    await stampCpReportAttempt(db, now());

    // ۳) تجمیع فقط-عددی از جدول‌های واقعی نود
    const at = now();
    const atIso = at.toISOString();
    const kpi = await collectKpiBucket(db, at);

    // ۴) seq صعودی + رویداد واحد kpi_daily + اسنپ‌شات سلامت (نسخهٔ گزارش‌شده)
    const lastSeq = (await readSettingsInt(db, CP_REPORT_SEQ_KEY)) ?? 0;
    const seq = lastSeq + 1;
    const body: CpReportPayloadInput = {
      events: [
        {
          seq,
          ts: atIso,
          level: 'info',
          category: 'data',
          event: 'cp_report.kpi_daily',
          payload: kpi as unknown as Record<string, number | null>
        }
      ],
      health: await collectHealthSnapshot(db, at)
    };

    // ۵) push با کلید نود m1.2 — binding اگر هست، وگرنه HTTPS عمومی
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'X-CP-Node-Code': config.cpNodeCode,
        Authorization: `Bearer ${config.cpNodeKey}`,
        'X-CP-Node-Version': APP_VERSION,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CP_REPORT_TIMEOUT_MS)
    };
    const res = deps.binding
      ? await deps.binding.fetch(config.ingestUrl, init)
      : await (deps.fetchFn ?? fetch)(config.ingestUrl, init);

    if (!res.ok) {
      let bodyHead = '';
      try {
        bodyHead = (await res.text()).slice(0, 180);
      } catch {
        bodyHead = '';
      }
      log.warn('cp_report.push_failed', {
        http: res.status,
        detail: 'cp_http_error',
        url: config.ingestUrl,
        body_head: bodyHead
      });
      return { status: 'error', detail: `http_${res.status}` };
    }

    // ۶) موفق — مُهر push و seq
    await writeSettings(db, CP_REPORT_PUSH_KEY, JSON.stringify(atIso), atIso);
    await writeSettings(db, CP_REPORT_SEQ_KEY, JSON.stringify(seq), atIso);
    log.info('cp_report.push', { seq, students_active: kpi.students_active });
    return { status: 'ok', applied: 1, seq };
  } catch (err) {
    log.warn('cp_report.push_failed', {
      detail: 'exception',
      error: err instanceof Error ? err.message : String(err)
    });
    return { status: 'error', detail: 'exception' };
  }
}
