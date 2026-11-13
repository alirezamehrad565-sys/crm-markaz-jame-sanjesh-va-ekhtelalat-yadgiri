/**
 * rust-f14 — قرارداد وضعیت سینک نود برای UI میز: GET/POST /api/node-sync/status
 *
 * وضعیت هماهنگ‌ساز/catch-up (mode/state/cursor/مُهرها) ذهنِ فرانت‌اند است — در انبار پیشرفت
 * localStorage پوستهٔ میز می‌نشیند و موتور محلی (workerd) به آن دسترسی ندارد. پس:
 *  • فرانت‌اند پس از هر دورهٔ سینک/catch-up اسنپ‌شات خود را با POST روی همین مسیر «آینه»
 *    می‌کند (runner.mirrorStatus — فقط-افزودنی و نرم).
 *  • GET همان آینهٔ اعتبارسنجی‌شده را با شمارش زندهٔ pending_push از DB موتور برمی‌گرداند —
 *    این شکل، قرارداد ثابت UI است و نام فیلدها نباید تغییر کند.
 * جای ثبت: در api-routing «بعد از» گیت authMiddleware/supervisorGate (احراز سشن کارمند) و با
 * گیت زمان‌اجرای میز CENTER_DESKTOP_ENGINE عین internal-sync — در تولید وب binding غایب است
 * → ۴۰۴ کم‌دست (باندل یکسان، شاخهٔ زمان‌اجرای خاموش).
 * نسخهٔ مرکز: از موج ۱ (۱-۳/۱-۴) هر پاسخ موفق pull/push سمت مرکز center_version/
 * min_node_version/server_ts دارد؛ runner آن را در انبار پیشرفت ثبت و با آینهٔ POST می‌فرستد →
 * version/clock_drift_minutes/clock_warning/last_catchup در همین پاکت GET می‌آیند؛ آینهٔ قدیمیِ
 * بدونِ این فیلدها هم پذیرفته می‌شود (اختیاری در اسکیما) و در GET پیش‌فرض نرم می‌گیرد.
 * EXP-1 (نسخهٔ ۳): فیلد تازهٔ reconciliation — نتیجهٔ آخرین آشتی‌ساز (مقایسهٔ فقط-گزارشی
 * شمارش/بیشینهٔ updated_at دامنه‌های سفید pull بین مرکز و صندوق محلی)؛ همان قرارداد
 * اختیاری-در-POST / null-در-GET فیلدهای موج ۱ را دارد و نام هیچ فیلد قدیمی عوض نمی‌شود.
 *
 * pending_push: شمارش دقیق «آنچه پوش بعدی می‌فرستد» — client_errors با occurred_at بعد از
 * watermark آینه (تنها دامنهٔ pushable که در DB محلی ردیف دارد؛ سقف ۲۰۰ صفحهٔ outbox ندارد)
 * + دو بکت لحظه‌ای health_ping (ساعتی) و usage_summary (روزانه) وقتی atشان از watermark
 * جلوتر است — دقیقاً همان قاعدهٔ includePing/includeUsage در buildOutboxPage.
 */
import { z } from 'zod';
import type { Context } from 'hono';
import type { AppHono, AppBindings, AppVariables } from '@core/shared';
import { getAuthContext } from '@core/auth';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { NotFoundError, ValidationError } from '@core/errors';

type Env = { Bindings: AppBindings; Variables: AppVariables };

/** کلید آینهٔ وضعیت در جدول settings موتور محلی (هم‌الگوی sys_* — KV عمومی همان جدول) */
export const NODE_SYNC_STATUS_MIRROR_KEY = 'nodesync:status-mirror-v1';

/** enumهای قرارداد — mode از CoordinatorState، state از CatchUpState، kind از SyncFailureKind */
const SYNC_MODES = ['auto', 'quarantined', 'paused_version'] as const;
const SYNC_STATES = ['idle', 'catching_up', 'synced', 'error', 'offline'] as const;
const FAILURE_KINDS = ['none', 'network', 'server', 'throttled', 'auth', 'version', 'ingest', 'unconfigured'] as const;

export type NodeSyncMode = (typeof SYNC_MODES)[number];
export type NodeSyncUiState = (typeof SYNC_STATES)[number];
export type NodeSyncFailureKind = (typeof FAILURE_KINDS)[number];

/**
 * آینهٔ وضعیت که فرانت‌اند با POST می‌فرستد — شکل سازنده‌اش NodeSyncStatusMirror در
 * runner.ts است (بدون zod، برای چانک فرانت‌اند)؛ اینجا سمت موتور سفت اعتبارسنجی می‌شود.
 * موج ۱ (۱-۳/۱-۴): فیلدهای تازه «اختیاری» تعریف شده‌اند تا آینهٔ قدیمیِ بدونِ آن‌ها (آپدیت
 * میانهٔ مسیر) همچنان پذیرفته شود — GET برای غایب‌ها پیش‌فرض نرم می‌گذارد.
 */
export const NodeSyncStatusMirrorSchema = z.object({
  v: z.literal(1),
  mode: z.enum(SYNC_MODES),
  state: z.enum(SYNC_STATES),
  last_pull_cursor_at: z.iso.datetime().nullable(),
  last_push_ok_at: z.iso.datetime().nullable(),
  last_pull_ok_at: z.iso.datetime().nullable(),
  last_error_kind: z.enum(FAILURE_KINDS).nullable(),
  last_error_at: z.iso.datetime().nullable(),
  push_watermark: z.iso.datetime().nullable(),
  client_version: z.string().max(50).nullable(),
  // ─── موج ۱ — هندشیک نسخه (۱-۴)، ساعت مرجع مرکز (۱-۳)، خلاصهٔ جبران کامل ───
  version: z
    .object({
      client: z.string().min(1).max(50),
      center: z.string().min(1).max(50),
      compatible: z.boolean()
    })
    .nullable()
    .optional(),
  clock_drift_minutes: z.number().int().min(0).max(525_600).nullable().optional(),
  clock_warning: z.boolean().optional(),
  last_catchup: z
    .object({
      at: z.iso.datetime(),
      pulled: z.number().int().min(0),
      pushed: z.number().int().min(0)
    })
    .nullable()
    .optional(),
  // ─── EXP-1 (نسخهٔ ۳) — نتیجهٔ آخرین آشتی‌ساز؛ آینهٔ قدیمیِ بدونِ آن هم پذیرفته می‌شود ───
  reconciliation: z
    .object({
      at: z.iso.datetime(),
      ok: z.boolean(),
      differences: z.number().int().min(0),
      // سقف ۵ ردیف ناهم‌خوانی — آینهٔ RECONCILE_MAX_DETAIL سمت runner
      detail: z
        .array(
          z.object({
            domain: z.string().min(1).max(40),
            center: z.number().int().min(0),
            local: z.number().int().min(0)
          })
        )
        .max(5)
        .nullable()
    })
    .nullable()
    .optional(),
  updated_at: z.iso.datetime()
});

export type NodeSyncStatusMirror = z.infer<typeof NodeSyncStatusMirrorSchema>;

/** شکل هندشیک نسخهٔ دیده‌شده — موج ۱ (۱-۴) */
export interface NodeSyncVersionInfo {
  /** نسخهٔ خود نود (APP_VERSION runner هنگام ثبت) */
  client: string;
  /** نسخهٔ خود مرکز از پاسخ pull/push */
  center: string;
  /** client ≥ min_node_version مرکز */
  compatible: boolean;
}

/** خلاصهٔ دورهٔ جبرانی کامل — موج ۱ (بقیهٔ ۱-۱) */
export interface NodeSyncCatchupSummary {
  at: string;
  pulled: number;
  pushed: number;
}

/** EXP-1 (نسخهٔ ۳) — نتیجهٔ آخرین آشتی‌ساز: فقط-گزارش، بدون هیچ اصلاحی سمت نود */
export interface NodeSyncReconciliationInfo {
  /** لحظهٔ مقایسه (ISO دستگاه نود) */
  at: string;
  /** true = همهٔ دامنه‌ها هم‌شمار */
  ok: boolean;
  /** تعداد دامنه‌های ناهم‌خوان */
  differences: number;
  /** حداکثر ۵ ردیف {domain, center, local}؛ هم‌خوانی کامل = null */
  detail: Array<{ domain: string; center: number; local: number }> | null;
}

/** پاکت GET — قرارداد ثابت UI نسخهٔ ۳ (موج ۱ + EXP-1)؛ نام فیلدهای موجود نباید تغییر کند */
export interface NodeSyncStatusPayload {
  mode: NodeSyncMode;
  state: NodeSyncUiState;
  pending_push: number;
  last_pull_cursor_age_days: number | null;
  last_push_ok_at: string | null;
  last_pull_ok_at: string | null;
  last_error: { kind: Exclude<NodeSyncFailureKind, 'none'>; at: string } | null;
  /** موج ۱ (۱-۴) — آخرین هندشیک نسخه از پاسخ‌های مرکز؛ هنوز هندشیک ندیده = null */
  version: NodeSyncVersionInfo | null;
  /** موج ۱ (۱-۳) — قدر مطلق اختلاف ساعت دستگاه با مرکز به دقیقه؛ ناشناخته = null */
  clock_drift_minutes: number | null;
  /** موج ۱ (۱-۳) — اختلاف بیش از ۲ دقیقه (اطلاعاتی؛ رفتار سینک عوض نمی‌کند) */
  clock_warning: boolean;
  /** موج ۱ — خلاصهٔ آخرین دورهٔ جبرانی کامل {at, pulled, pushed}؛ هیچ دورهٔ کاملی نبوده = null */
  last_catchup: NodeSyncCatchupSummary | null;
  /** EXP-1 — نتیجهٔ آخرین آشتی‌ساز؛ هنوز هیچ مقایسه‌ای نبوده یا آینهٔ قدیمی = null */
  reconciliation: NodeSyncReconciliationInfo | null;
}

export interface NodeSyncStatusRouteDeps {
  db: DbClient;
  logger: Logger;
}

/** گیت زمان‌اجرای میز — در تولید وب binding غایب است و مسیر ۴۰۴ کم‌دست می‌دهد */
function requireDesktopEngine(c: Context<Env>): void {
  if ((c.env as unknown as Record<string, unknown>)?.CENTER_DESKTOP_ENGINE !== '1') {
    throw new NotFoundError('مسیر یافت نشد');
  }
}

/** خواندن نرم آینه از settings — ردیف غایب/JSON خراب/اسکیمای ناهمخوان = null */
async function readMirror(db: DbClient): Promise<NodeSyncStatusMirror | null> {
  try {
    const row = await db.queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [NODE_SYNC_STATUS_MIRROR_KEY]
    );
    if (!row) return null;
    const parsed = NodeSyncStatusMirrorSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** UPSERT نرم آینه — settings جدول KV عمومی است (هم‌الگوی sys_auth_secret در engine.mjs) */
async function writeMirror(db: DbClient, mirror: NodeSyncStatusMirror): Promise<void> {
  await db.execute(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [NODE_SYNC_STATUS_MIRROR_KEY, JSON.stringify(mirror)]
  );
}

/**
 * شمارش pending_push — دقیقاً «آنچه پوش بعدی می‌فرستد»:
 *  • client_errors با occurred_at > watermark (برش ISO به فرمت 'YYYY-MM-DD HH:MM:SS' جدول
 *    0057 — هم‌الگوی sinceToSqlCutoff در outbox.ts تا مقایسهٔ لغوی درست بماند)؛
 *  • بدون watermark = هیچ پوشی نبوده → همهٔ ردیف‌ها pending هستند؛
 *  • +۱ برای بکت ساعتی health_ping و +۱ برای بکت روزانه usage_summary وقتی atشان از
 *    watermark جلوتر است — همان قاعدهٔ Date.parse در buildOutboxPage.
 * خطا/جدول غایب = صفر نرم — status هرگز نمی‌شکند.
 */
async function pendingPushCount(db: DbClient, watermark: string | null): Promise<number> {
  let count = 0;
  try {
    if (watermark) {
      const cutoff = watermark.slice(0, 19).replace('T', ' ');
      const row = await db.queryOne<{ n: number }>(
        'SELECT COUNT(*) AS n FROM client_errors WHERE occurred_at > ?',
        [cutoff]
      );
      count += Number(row?.n ?? 0);
    } else {
      const row = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM client_errors');
      count += Number(row?.n ?? 0);
    }
  } catch {
    // نرم — صفر
  }
  try {
    const nowIso = new Date().toISOString();
    const hourBucket = `${nowIso.slice(0, 13)}:00:00Z`; // at بکت ping — هم‌فرمول outbox.ts
    const dayBucket = `${nowIso.slice(0, 10)}T00:00:00Z`; // at بکت usage
    const ahead = (at: string): boolean => !watermark || Date.parse(at) > Date.parse(watermark);
    if (ahead(hourBucket)) count += 1;
    if (ahead(dayBucket)) count += 1;
  } catch {
    // نرم — بکت‌ها لحظه‌ساخت‌اند؛ نبودشان شمارش را نمی‌شکند
  }
  return count;
}

/** سن cursor pull بر حسب روز (یک رقم اعشار؛ منفی‌ها = لغزش ساعت → صفر) */
function cursorAgeDays(cursorAt: string, nowMs: number): number | null {
  const t = Date.parse(cursorAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round(((nowMs - t) / 86_400_000) * 10) / 10);
}

export function registerNodeSyncStatusRoute(app: AppHono, deps: NodeSyncStatusRouteDeps): void {
  const log = deps.logger.child('node-sync-status');

  // POST — آینهٔ اسنپ‌شات فرانت‌اند (runner.mirrorStatus پس از هر دورهٔ سینک/catch-up)
  app.post('/api/node-sync/status', async (c) => {
    requireDesktopEngine(c);
    getAuthContext(c); // هم‌الگوی internal-sync — گیت سشن برای یکدستی ۴۰۱
    const parsed = NodeSyncStatusMirrorSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError('اسنپ‌شات وضعیت سینک نامعتبر است');
    await writeMirror(deps.db, parsed.data);
    log.info('status_mirror.ok', { state: parsed.data.state, mode: parsed.data.mode });
    return c.json({ data: { ok: true } }, 200);
  });

  // GET — قرارداد ثابت UI (نام فیلدها همان بریف rust-f14)
  app.get('/api/node-sync/status', async (c) => {
    requireDesktopEngine(c);
    getAuthContext(c); // یکدستی ۴۰۱ سشن — هم‌الگوی internal-sync/status
    const mirror = await readMirror(deps.db);
    const nowMs = Date.now();
    const errorKind = mirror?.last_error_kind ?? null;
    const payload: NodeSyncStatusPayload = {
      mode: mirror?.mode ?? 'auto',
      state: mirror?.state ?? 'idle',
      pending_push: await pendingPushCount(deps.db, mirror?.push_watermark ?? null),
      last_pull_cursor_age_days: mirror?.last_pull_cursor_at ? cursorAgeDays(mirror.last_pull_cursor_at, nowMs) : null,
      last_push_ok_at: mirror?.last_push_ok_at ?? null,
      last_pull_ok_at: mirror?.last_pull_ok_at ?? null,
      last_error:
        errorKind && errorKind !== 'none' && mirror?.last_error_at
          ? { kind: errorKind as Exclude<NodeSyncFailureKind, 'none'>, at: mirror.last_error_at }
          : null,
      // ─── موج ۱ — آینهٔ غایب/قدیمی = پیش‌فرض نرم (اسنپ‌شات تازه از runner می‌آید) ───
      version: mirror?.version ?? null,
      clock_drift_minutes: mirror?.clock_drift_minutes ?? null,
      clock_warning: mirror?.clock_warning === true,
      last_catchup: mirror?.last_catchup ?? null,
      // ─── EXP-1 (نسخهٔ ۳) — آشتی‌ساز؛ آینهٔ قدیمی بدونِ این فیلد = null نرم ───
      reconciliation: mirror?.reconciliation ?? null
    };
    return c.json(payload, 200);
  });
}
