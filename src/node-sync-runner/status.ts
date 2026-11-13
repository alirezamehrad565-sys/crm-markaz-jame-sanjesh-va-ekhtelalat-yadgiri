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
 * نسخهٔ مرکز: قرارداد فعلی /node/pull هیچ فیلد نسخه‌ای حمل نمی‌کند (سند node-sync §۲) →
 * version همیشه null؛ هیچ endpoint تازه‌ای سمت مرکز ساخته نمی‌شود (بند ۴ بریف).
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
  updated_at: z.iso.datetime()
});

export type NodeSyncStatusMirror = z.infer<typeof NodeSyncStatusMirrorSchema>;

/** پاکت GET — قرارداد ثابت UI؛ نام فیلدها نباید تغییر کند */
export interface NodeSyncStatusPayload {
  mode: NodeSyncMode;
  state: NodeSyncUiState;
  pending_push: number;
  last_pull_cursor_age_days: number | null;
  last_push_ok_at: string | null;
  last_pull_ok_at: string | null;
  last_error: { kind: Exclude<NodeSyncFailureKind, 'none'>; at: string } | null;
  /** قرارداد فعلی نسخهٔ مرکز را حمل نمی‌کند → null تا وقتی پروتکل نسخه بگیرد */
  version: null;
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
      version: null // قرارداد فعلی نسخهٔ مرکز را در پاسخ pull حمل نمی‌کند — بند ۴ بریف
    };
    return c.json(payload, 200);
  });
}
