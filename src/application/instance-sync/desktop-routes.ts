/**
 * فاز B — مسیرهای UI هم‌گامی میز↔ابر (docs/rust/server-cloud-update-design.md §۲-۴/§۲-۵)
 *
 * جای ثبت: در api-routing «بعد از» گیت authMiddleware/supervisorGate — احراز این مسیرها
 * سشن کارمند است (هم‌الگوی internal-sync و node-sync-runner/status). گیت زمان‌اجرای میز
 * CENTER_DESKTOP_ENGINE عین همان الگو: در تولید وب binding غایب است → ۴۰۴ کم‌دست
 * (باندل یکسان، شاخهٔ زمان‌اجرای خاموش).
 *
 * دسترسی‌ها (قرارداد مأموریت فاز B — «تغییرپذیرها فقط-مدیر»):
 *   • GET  /api/instance-sync/status  — هر سشن (خواندنی)
 *   • GET  /api/instance-sync/backups — هر سشن (خواندنی)
 *   • POST /api/instance-sync/run-now — فقط-مدیر (درس موج قبل ④: ۴۰۱ وسط سناریو از گیت
 *     همین دکمه بود — فراخوانی با سشن غیرمدیر/بی‌سشن رد می‌شود؛ این‌جا قرارداد صریح شده)
 *   • POST /api/instance-sync/config  — فقط-مدیر (وارسی https؛ secret این‌جا نیست)
 *   • DELETE /api/instance-sync/config — فقط-مدیر (cursorها باقی؛ audit cloud.unlink)
 *   • POST /api/instance-sync/clone   — فقط-مدیر (بدون confirm روی DB غیر-خالی → ۴۰۹)
 *   • POST /api/instance-sync/provision/verify — فقط-مدیر (وارسی توکن CF + فهرست حساب‌ها؛ فاز C)
 *   • POST /api/instance-sync/provision — فقط-مدیر (ساخت خودکار ورکر ابری؛ binding غایب → ۵۰۱)
 *
 * هیچ secretی در هیچ پاسخی نمی‌آید — status فقط secret_present بولین می‌دهد.
 * زمان‌بند دوره‌ای: یک‌بار در ثبت این مسیرها بر فرایند بیدار می‌شود (پرچم ماژول + گارد
 * محیط تست در runner.startCloudSyncScheduler) و env را از نخستین درخواست ضبط می‌کند.
 */
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppHono, AppBindings, AppVariables } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { createDb } from '@core/db';
import type { DbClient } from '@core/db';
import { createAuditWriter } from '@core/audit';
import { createLogger } from '@core/logger';
import type { Logger } from '@core/logger';
import { NotFoundError } from '@core/errors';
import { createBackupService } from '@app/backup';
import type { AuditWriter } from '@core/audit';
import type { BackupService } from '@app/backup/service';
import {
  buildCloudSyncStatus,
  captureCloudEnv,
  cloneFromCloud,
  listCloudBackups,
  parseCloudConfigPayload,
  readCloudConfig,
  runCloudSync,
  startCloudSyncScheduler,
  unlinkCloudConfig
} from './runner';
import type { CloudFsIO, CloudSyncDeps } from './runner';
// فاز C (A1) — کلاینت ساخت خودکار ورکر ابری (گام‌های CF API — سند first-run-and-cloud §۳)
import { provisionCloudWorker, verifyCloudToken } from './provision';
import type { CloudProvisionIO, ProvisionResult, VerifyCloudResult } from './provision';

type Env = { Bindings: AppBindings; Variables: AppVariables };

export interface DesktopRoutesDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** سرویس پشتیبان موجود — بکاپ پیش از اعمال و کلون با همان export/inspect/restore */
  backup: BackupService;
}

/** گیت زمان‌اجرای میز — در تولید وب binding غایب است و مسیر ۴۰۴ کم‌دست می‌دهد */
function requireDesktopEngine(c: Context<Env>): void {
  if ((c.env as unknown as Record<string, unknown> | undefined)?.CENTER_DESKTOP_ENGINE !== '1') {
    throw new NotFoundError('مسیر یافت نشد');
  }
}

function envOf(c: Context<Env>): Record<string, unknown> {
  return (c.env ?? {}) as unknown as Record<string, unknown>;
}

/** پل فایل‌های ابری از binding — غایب در workerd/تولید وب → قابلیت خاموش */
function cloudFsOf(env: Record<string, unknown>): CloudFsIO | null {
  const fs = env.CLOUD_FS;
  return fs && typeof fs === 'object' ? (fs as CloudFsIO) : null;
}

/** پل دارایی‌های ساخت ورکر ابری از binding — غایب در workerd/تولید وب → مسیر provision «۵۰۱» می‌دهد */
function cloudProvisionOf(env: Record<string, unknown>): CloudProvisionIO | null {
  const p = env.CLOUD_PROVISION;
  if (!p || typeof p !== 'object') return null;
  const io = p as Partial<CloudProvisionIO>;
  return typeof io.readCentralWorker === 'function' && typeof io.readSchemaSql === 'function' ? (p as CloudProvisionIO) : null;
}

/** تزریق آزمون fetch (ابر فیک) — در تولید غایب است و fetch سراسری مصرف می‌شود */
function fetchImplOf(env: Record<string, unknown>): ((input: string, init?: RequestInit) => Promise<Response>) | undefined {
  const f = env.CLOUD_FETCH;
  return typeof f === 'function' ? (f as (input: string, init?: RequestInit) => Promise<Response>) : undefined;
}

/** deps کامل برای مسیرهای درخواست — env همین درخواست + سرویس‌های ثبت‌شده */
function requestDeps(c: Context<Env>, deps: DesktopRoutesDeps): CloudSyncDeps {
  const env = envOf(c);
  captureCloudEnv(env); // زمان‌بند env را از نخستین درخواست ضبط می‌کند (الگوی کش ماژول)
  return {
    db: deps.db,
    audit: deps.audit,
    logger: deps.logger.child('instance-sync'),
    fs: cloudFsOf(env),
    env,
    backup: deps.backup ?? null,
    // CLOUD_FETCH فقط در آزمون ست می‌شود (ابر فیک) — در تولید غایب است و fetch سراسری مصرف می‌شود
    fetchCloud:
      typeof env.CLOUD_FETCH === 'function' ? (env.CLOUD_FETCH as CloudSyncDeps['fetchCloud']) : undefined
  };
}

/** deps زمان‌بند — از env ضبط‌شده هر تیک سرویس تازه می‌سازد (هم‌الگوی چرخه‌های cron در src/index.ts) */
function schedulerDepsFromEnv(env: Record<string, unknown>): CloudSyncDeps {
  const db = createDb(env.DB as D1Database);
  const audit = createAuditWriter(db);
  const logger = createLogger('cloud-sync');
  const backup = createBackupService({ db, audit, logger, baleToken: null, sender: null });
  return { db, audit, logger, fs: cloudFsOf(env), env, backup };
}

const CloudConfigSchema = z.object({
  url: z.string().min(1, 'نشانی ابر لازم است'),
  interval_ms: z.number().int().positive().optional()
});

const CloneSchema = z.object({
  confirm: z.boolean().optional()
});

// فاز C (A1) — بدنهٔ ساخت ورکر ابری؛ توکن فقط به api.cloudflare.com می‌رود و هرگز ذخیره/لاگ نمی‌شود
const ProvisionVerifySchema = z.object({
  token: z.string().min(1, 'توکن کلادفلر لازم است')
});

const ProvisionSchema = z.object({
  token: z.string().min(1, 'توکن کلادفلر لازم است'),
  accountId: z.string().min(1).optional(),
  name: z.string().min(1, 'نام ورکر لازم است')
});

/** پاسخ قراردادی خطای ابر — ۵۰۲ برای offline/auth (ابر دور است، خطای درخواست نیست) */
function cloudError(c: Context<Env>, err: unknown): Response {
  const kind = err instanceof Error && 'kind' in err ? String((err as { kind: unknown }).kind) : 'offline';
  const message = err instanceof Error ? err.message : 'خطای ناشناختهٔ اتصال ابری';
  return c.json({ error: kind === 'auth' ? 'CLOUD_AUTH' : 'CLOUD_OFFLINE', message }, 502);
}

export function registerDesktopRoutes(app: AppHono, deps: DesktopRoutesDeps): void {
  // زمان‌بند هم‌گامی دوره‌ای — فقط یک‌بار بر فرایند؛ داخل خودش گارد محیط تست دارد
  // (در vitest هیچ تایمری ساخته نمی‌شود — درس موج قبل ④: تداخل زمان‌بند با سناریوها)
  startCloudSyncScheduler(schedulerDepsFromEnv, deps.logger);

  // GET وضعیت — قرارداد ثابت UI: {configured, url, device_id, secret_present, running,
  // interval_ms, last_sync, conflicts_total, clock_warning, schema_match}
  app.get('/api/instance-sync/status', async (c) => {
    requireDesktopEngine(c);
    getAuthContext(c); // یکدستی ۴۰۱ سشن — هم‌الگوی internal-sync/status
    const status = await buildCloudSyncStatus(requestDeps(c, deps));
    return c.json({ data: status }, 200);
  });

  // POST هم‌گام‌سازی اکنون — فقط-مدیر (ریشهٔ تاریخی ۴۰۱/۴۰۳ وسط سناریوها همین گیت است)
  app.post('/api/instance-sync/run-now', requireRole('manager'), async (c) => {
    requireDesktopEngine(c);
    getAuthContext(c);
    const result = await runCloudSync(requestDeps(c, deps), 'manual');
    if (result.kind === 'in_flight') {
      return c.json({ error: 'CLOUD_SYNC_IN_FLIGHT', message: 'هم‌گام‌سازی ابری در جریان است — چند لحظه بعد دوباره تلاش کنید' }, 409);
    }
    if (result.kind === 'unconfigured' || result.kind === 'no_secret') {
      return c.json(
        { error: result.kind === 'no_secret' ? 'CLOUD_NO_SECRET' : 'CLOUD_UNCONFIGURED', message: result.error ?? 'اتصال ابری آماده نیست' },
        400
      );
    }
    return c.json(
      { data: { result: result.kind, pulled: result.pulled, pushed: result.pushed, conflicts_new: result.conflicts_new, duration_ms: result.duration_ms, error: result.error } },
      200
    );
  });

  // POST پیکربندی اتصال — فقط-مدیر؛ وارسی https؛ device_id موجود حفظ می‌شود یا UUID تازه
  // (راز این‌جا نیست — راز فقط از پوستهٔ میز در مخزن امن سیستم‌عامل ست می‌شود)
  app.post('/api/instance-sync/config', requireRole('manager'), async (c) => {
    requireDesktopEngine(c);
    const actor = getAuthContext(c);
    const parsed = CloudConfigSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION_ERROR', message: 'پیکربندی اتصال ابری نامعتبر است' }, 400);
    }
    const cloudDeps = requestDeps(c, deps);
    if (!cloudDeps.fs) {
      return c.json({ error: 'CLOUD_FS_UNAVAILABLE', message: 'پل فایل‌های ابری در دسترس نیست — هم‌گامی ابری فقط در موتور محلی معنا دارد' }, 400);
    }
    const normalized = parseCloudConfigPayload({ url: parsed.data.url, interval_ms: parsed.data.interval_ms });
    if (!normalized) {
      return c.json({ error: 'CLOUD_URL_INVALID', message: 'نشانی ابر باید یک نشانی https معتبر باشد' }, 400);
    }
    const existing = await readCloudConfig(cloudDeps.fs).catch(() => null);
    const config = {
      url: normalized.url,
      device_id: existing?.device_id ?? crypto.randomUUID(),
      interval_ms: normalized.interval_ms
    };
    await cloudDeps.fs.writeText('cloud-config.json', JSON.stringify(config, null, 2) + '\n');
    cloudDeps.logger.info('cloud.config.saved', { staffId: actor.staffId, url: config.url, interval_ms: config.interval_ms });
    return c.json({ data: { ok: true, url: config.url, device_id: config.device_id, interval_ms: config.interval_ms } }, 200);
  });

  // DELETE حذف اتصال — فقط-مدیر؛ cursorها عمداً باقی می‌مانند (اتصال دوباره از سرِ امن)
  app.delete('/api/instance-sync/config', requireRole('manager'), async (c) => {
    requireDesktopEngine(c);
    const actor = getAuthContext(c);
    const cloudDeps = requestDeps(c, deps);
    await unlinkCloudConfig(cloudDeps, actor.staffId);
    return c.json({ data: { ok: true, cursors_kept: true } }, 200);
  });

  // POST کلون ابر→میز — فقط-مدیر؛ بدون confirm روی DB غیر-خالی → ۴۰۹ فارسی (ConflictError)
  app.post('/api/instance-sync/clone', requireRole('manager'), async (c) => {
    requireDesktopEngine(c);
    getAuthContext(c);
    const parsed = CloneSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION_ERROR', message: 'بدنهٔ کلون نامعتبر است' }, 400);
    }
    const cloudDeps = requestDeps(c, deps);
    try {
      const outcome = await cloneFromCloud(cloudDeps, { confirm: parsed.data.confirm === true });
      return c.json({ data: outcome }, 200);
    } catch (err) {
      if (err instanceof Error && err.name === 'CloudSyncError') return cloudError(c, err);
      throw err; // ConflictError → ۴۰۹ و ValidationError → ۴۰۰ از errorHandler سراسری
    }
  });

  // GET فهرست پشتیبان‌های ابری محلی (pre چرخشی + clone بی‌چرخش)
  app.get('/api/instance-sync/backups', async (c) => {
    requireDesktopEngine(c);
    getAuthContext(c);
    const listing = await listCloudBackups(requestDeps(c, deps));
    return c.json({ data: listing }, 200);
  });

  // ─── فاز C (A1) — ساخت خودکار ورکر ابری (سند first-run-and-cloud §۳) ───
  // هر دو فقط-مدیر. هیچ نوشتن وضعیت محلی این‌جا نیست — ذخیرهٔ config همچنان مسیر POST /config
  // است؛ این دو فقط می‌سازند و برمی‌گردانند. binding CLOUD_PROVISION در workerd/تولید وب غایب
  // است → «۵۰۱ — فقط در نسخهٔ دسکتاپ» (بدون گیت ۴۰۴؛ قرارداد صریح مأموریت فاز C).

  // POST وارسی توکن + فهرست حساب‌ها [{id,name}] — بدون هیچ پرویژن؛ مبنای انتخاب accountId
  app.post('/api/instance-sync/provision/verify', requireRole('manager'), async (c) => {
    getAuthContext(c);
    const parsed = ProvisionVerifySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION_ERROR', message: 'بدنهٔ وارسی نامعتبر است — token لازم است' }, 400);
    }
    const result: VerifyCloudResult = await verifyCloudToken({
      fetchImpl: fetchImplOf(envOf(c)),
      token: parsed.data.token
    });
    if (!result.ok) {
      return c.json(
        { error: 'CLOUD_PROVISION_FAILED', message: result.message, data: { step: result.step, errors: result.errors ?? [] } },
        400
      );
    }
    return c.json({ data: { accounts: result.accounts } }, 200);
  });

  // POST ساخت کامل ورکر ابری (D1 + اسکیما + دیپلوی + secret + دامنه + سلامت) — فقط-مدیر
  app.post('/api/instance-sync/provision', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const parsed = ProvisionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION_ERROR', message: 'بدنهٔ ساخت ورکر نامعتبر است — token و name لازم است' }, 400);
    }
    const provision = cloudProvisionOf(envOf(c));
    if (!provision) {
      return c.json({ error: 'CLOUD_PROVISION_UNAVAILABLE', message: 'ساخت ورکر فقط در نسخهٔ دسکتاپ ممکن است' }, 501);
    }
    const [centralWorker, schemaSql] = await Promise.all([provision.readCentralWorker(), provision.readSchemaSql()]);
    if (!centralWorker || !schemaSql) {
      return c.json(
        { error: 'CLOUD_PROVISION_UNAVAILABLE', message: 'باندل مرکزی یا اسکیمای نصب در دسترس نیست — ساخت ورکر ممکن نشد' },
        501
      );
    }
    // لاگ فقط رویدادهای بی‌راز (redaction در خود provision.ts تضمین شده — پیام‌ها هرگز secret ندارند)
    const result: ProvisionResult = await provisionCloudWorker({
      fetchImpl: fetchImplOf(envOf(c)),
      centralWorker,
      schemaSql,
      name: parsed.data.name,
      token: parsed.data.token,
      accountId: parsed.data.accountId,
      log: (message) => deps.logger.info('cloud.provision.step', { staffId: actor.staffId, detail: message })
    });
    if (!result.ok) {
      return c.json(
        { error: 'CLOUD_PROVISION_FAILED', message: result.message, data: { step: result.step, steps: result.steps } },
        400
      );
    }
    return c.json({ data: result }, 200);
  });
}
