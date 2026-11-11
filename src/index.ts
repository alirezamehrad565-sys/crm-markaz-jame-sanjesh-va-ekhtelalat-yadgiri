import { createApp, createServices } from '@app/api-routing';
import { createDb } from '@core/db';
import { createAuditWriter, parseAuditRetentionDays } from '@core/audit';
import { createLogger } from '@core/logger';
import { BATCH_CRON, DIGEST_CRON, REMINDER_HORIZON_HOURS, CP_SYNC_CRON } from '@core/shared';
import {
  buildCpSyncConfig,
  syncCpAnnouncements,
  cpSyncOpportunistic,
  stampCpSyncAttempt
} from '@app/cp-sync/announcements';
import { buildCpReportConfig, pushCpReport, cpReportOpportunistic } from '@app/cp-report/ingest';
import { buildCpContentConfig, runCpContentCycle, cpContentOpportunistic } from '@app/cp-content/sync';
import { buildBugReportConfig, runBugReportForward } from '@app/bug-report-forward'; // بازاعمال ۱.۲۵.۵۱ — گزارش باگ به پشتیبانی CP
import { createContentScoreService } from '@domain/content-score'; // ۱.۲۵.۴۸ m6

export interface Env {
  DB: D1Database;
  ENV: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  BALE_BOT_TOKEN?: string;
  BALE_WEBHOOK_SECRET?: string;
  CLINIC_NAME?: string;
  AUTH_SECRET?: string;
  EXERCISE_FILES?: unknown;
  PUBLIC_BASE_URL?: string;
  // — سینک اعلان از کنترل‌پلین (m1.5)؛ هر چهار مقدار خالی = خاموش کامل —
  CP_SYNC_URL?: string;
  CP_NODE_CODE?: string;
  CP_NODE_KEY?: string;
  CP_SYNC_STAFF_ID?: string;
  /** Service Binding به ورکر کنترل‌پلین (هم‌حساب) — fetch عمومیِ هم‌زون ۱۰۴۲ می‌دهد */
  CP?: Fetcher;
  /**
   * ف۴ — سقف نگه‌داری audit_log بر حسب روز (اختیاری؛ پیش‌فرض ۱۸۰؛ صفر = پاکسازی خاموش).
   * فقط مصرف کرون شبانهٔ digest است؛ مقادیر نامعتبر/منفی با پیش‌فرض جایگزین می‌شوند.
   */
  AUDIT_LOG_RETENTION_DAYS?: number;
}

/* ۱.۲۵.۵۷ — توکن بات دو منبع دارد: env اولویت، سپس settings.bale_bot_token (ثبت کاربر).
   کش ۶۰ثانیه‌ایِ isolate تا هر درخواست یک خواندن DB اضافه نکند؛ ثبت توکن تازه حداکثر
   یک دقیقه بعد روی همان isolate هم می‌نشیند. هرگز در پاسخ GET نمی‌رود. */
const BALE_TOKEN_CACHE_TTL_MS = 60_000;
let baleTokenCache: { token: string | null; at: number } | null = null;

async function resolveBaleToken(db: ReturnType<typeof createDb>, envToken: string | null | undefined): Promise<string | null> {
  const envClean = envToken?.trim() ?? '';
  if (envClean) return envClean; // env همیشه برنده است و کش نمی‌خواهد
  const now = Date.now();
  if (baleTokenCache && now - baleTokenCache.at < BALE_TOKEN_CACHE_TTL_MS) return baleTokenCache.token;
  let token: string | null = null;
  try {
    const row = await db.queryOne<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'bale_bot_token' LIMIT 1`,
      []
    );
    if (row) {
      const parsed: unknown = JSON.parse(row.value);
      if (typeof parsed === 'string' && parsed.trim().length > 0) token = parsed.trim();
    }
  } catch {
    // DB خوانده نشد = بدون توکن؛ دورهٔ بعد دوباره
  }
  baleTokenCache = { token, at: now };
  return token;
}

/** هم‌قرارداد buildEnv قبلی — فقط baleToken حالا ناهمگام و دو-منبعی است */
async function buildRuntimeEnv(env: Env, db: ReturnType<typeof createDb>) {
  return {
    baleToken: await resolveBaleToken(db, env.BALE_BOT_TOKEN),
    webhookSecret: env.BALE_WEBHOOK_SECRET ?? null,
    clinicName: env.CLINIC_NAME ?? undefined,
    exerciseBucket: env.EXERCISE_FILES ?? null,
    downloadSecret: env.AUTH_SECRET ?? env.BALE_WEBHOOK_SECRET ?? null,
    // رشتهٔ خالی/فاصله‌دار = تنظیم‌نشده (نه پاس‌دادن به پایین‌دست)
    publicBaseUrl: env.PUBLIC_BASE_URL?.trim() || null
  };
}

async function runNotificationCycle(env: Env): Promise<void> {
  const db = createDb(env.DB);
  const audit = createAuditWriter(db);
  const logger = createLogger('cron.notify');
  const services = createServices({
    db,
    audit,
    logger,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    ...(await buildRuntimeEnv(env, db))
  });

  const summary = await services.notify.enqueueUpcomingReminders(
    new Date(),
    REMINDER_HORIZON_HOURS
  );
  const nudges = await services.notify.enqueuePendingAttendanceNudges().catch(() => 0);
  const dispatch = await services.notify.dispatchPending(100);
  logger.info('cycle.done', { ...summary, nudges, dispatch });
}

async function runDigestCycle(env: Env): Promise<void> {
  const db = createDb(env.DB);
  // ف۴ — نویسندهٔ audit با سقف نگه‌داری env ساخته می‌شود تا پاکسازی شبانه همان سقف را اجرا کند
  const audit = createAuditWriter(db, { retentionDays: parseAuditRetentionDays(env.AUDIT_LOG_RETENTION_DAYS) });
  const logger = createLogger('cron.digest');
  const services = createServices({
    db,
    audit,
    logger,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    ...(await buildRuntimeEnv(env, db))
  });

  const summary = await services.notify.sendDailyDigest(new Date()).catch((err: unknown) => {
    logger.error('digest.failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  const dispatch = await services.notify.dispatchPending(100);
  // نگهداشت دوره‌ای بازی‌ها (G1 / P2-3) — سوییپ مأموریت رهاشده + پاکسازی لینک/توکن منقضی؛
  // تا امروز فقط lazy هنگام فهرست درمانگر پاک می‌شد و توکن‌های منقضی هرگز جمع نمی‌شدند
  const gamesMaintenance = await services.games.maintenance().catch((err: unknown) => {
    logger.error('games.maintenance.failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  // ۱.۲۵.۶۶ — نگه‌داری تله‌متری: خطاهای کلاینت (جدول 0106) و رویدادهای RUM بیشتر از ۹۰ روز حذف می‌شوند؛
  // هر دو جدول تا امروز بی‌پاکسازی بودند و بی‌کران رشد می‌کردند
  // ف۴ — audit_log به همان بلوک پیوست شد (پیش‌فرض ۱۸۰ روز؛ env اختیاری؛ صفر = خاموش)
  const retention = await (async () => {
    try {
      const clientErrors = await services.clientErrors.pruneOld();
      const rumEvents = await services.rum.pruneOld();
      const auditLog = await audit.pruneOld();
      return { client_errors: clientErrors, rum_events: rumEvents, audit_log: auditLog };
    } catch (err: unknown) {
      logger.error('retention.failed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  })();
  // ف۴ — گزارش رشد جدول‌ها: شمارش ردیف‌ها فقط همین‌جا (کرون، هرگز مسیر درخواست نیست)؛
  // مُهر ۲۴ساعتهٔ growth.last_snapshot_at دوباره‌کاری را می‌بندد
  const growth = await services.growth.captureDaily().catch((err: unknown) => {
    logger.error('growth.snapshot.failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  logger.info('digest.cycle.done', { summary, dispatch, gamesMaintenance, retention, growth });
}

async function runBatchDispatchCycle(env: Env): Promise<void> {
  const db = createDb(env.DB);
  const audit = createAuditWriter(db);
  const logger = createLogger('cron.batch');
  const services = createServices({
    db,
    audit,
    logger,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    ...(await buildRuntimeEnv(env, db))
  });

  const dispatch = await services.notify.dispatchPending(100);
  logger.info('batch.cycle.done', { dispatch });
}

// پشتیبان خودکار شبانه: اگر مدیر فعالش کرده باشد، فایل پشتیبان به
// مقصدهای بلهٔ انتخاب‌شده فرستاده می‌شود (همان cron دیجست، بعد از آن اجرا می‌شود)
async function runBackupAutoSendCycle(env: Env): Promise<void> {
  const db = createDb(env.DB);
  const audit = createAuditWriter(db);
  const logger = createLogger('cron.backup');
  const services = createServices({
    db,
    audit,
    logger,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    ...(await buildRuntimeEnv(env, db))
  });

  const outcome = await services.backup.runScheduledAutoSend().catch((err: unknown) => {
    logger.error('backup.auto.failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  logger.info('backup.auto.cycle.done', { outcome });
}

/** چرخهٔ سینک اعلان CP — کرون اختصاصی یا سلف‌هاست؛ مُهر تلاش مشترک با دروازهٔ فرصت‌طلب */
async function runCpSyncCycle(env: Env): Promise<void> {
  const db = createDb(env.DB);
  const logger = createLogger('sync');
  await stampCpSyncAttempt(db).catch(() => undefined);
  const result = await syncCpAnnouncements({
    db,
    logger,
    config: buildCpSyncConfig(env),
    binding: env.CP ?? null
  });
  logger.info('cp_sync.cycle.done', { status: result.status, applied: result.applied ?? 0 });
}

/**
 * دروازهٔ فرصت‌طلب سینک CP روی هر درخواست — چون پلن Free کلادفلر سقف ۵ کرون در حساب دارد
 * و این حساب پر است، به‌جای کرون پنجم هر دورهٔ سینک روی خودِ ترافیک زنده سوار می‌شود:
 * هر isolate حداکثر یک‌بار در دقیقه settings را می‌خواند و تلاش‌ها ۱۵ دقیقه فاصله دارند.
 * env خالی = صفر بار اضافه (اولین گارد قبل از هر خواندنی برمی‌گردد).
 */
let cpSyncProbeAt = 0;
function probeCpSync(env: Env, ctx: ExecutionContext): void {
  const t = Date.now();
  if (t - cpSyncProbeAt < 60_000) return;
  cpSyncProbeAt = t;
  ctx.waitUntil(
    cpSyncOpportunistic({
      db: createDb(env.DB),
      logger: createLogger('sync'),
      config: buildCpSyncConfig(env),
      binding: env.CP ?? null
    }).catch(() => undefined)
  );
}

/** چرخهٔ گزارش‌دهی تجمیعی نود → CP (فاز غنی‌سازی) — گیت ۲۴ساعتهٔ درونی دارد؛ خاموش اگر env خالی باشد */
async function runCpReportCycle(env: Env): Promise<void> {
  const db = createDb(env.DB);
  const logger = createLogger('sync');
  const result = await pushCpReport({
    db,
    logger,
    config: buildCpReportConfig(env),
    binding: env.CP ?? null
  });
  logger.info('cp_report.cycle.done', { status: result.status, seq: result.seq ?? 0 });
}

/** دروازهٔ فرصت‌طلب گزارش‌دهی — همان الگوی cp-sync؛ گیت ۲۴ساعتهٔ مشترک دوباره‌کاری را می‌بندد */
let cpReportProbeAt = 0;
function probeCpReport(env: Env, ctx: ExecutionContext): void {
  const t = Date.now();
  if (t - cpReportProbeAt < 60_000) return;
  cpReportProbeAt = t;
  ctx.waitUntil(
    cpReportOpportunistic({
      db: createDb(env.DB),
      logger: createLogger('sync'),
      config: buildCpReportConfig(env),
      binding: env.CP ?? null
    }).catch(() => undefined)
  );
}

/**
 * چرخهٔ کتابخانهٔ شبکه (محور دوم غنی‌سازی): push همرسانی‌ها + pull برگزیده‌ها —
 * قرارداد docs/cp-node-content-hub.md؛ بدون env تازه (همان کلید نود م۱.۲)؛
 * گیت ۱۵دقیقه‌ای درونی دارد؛ CP بدون درگاه = فقط warn و تلاش دورهٔ بعد.
 */
async function runCpContentCycleWrap(env: Env): Promise<void> {
  const db = createDb(env.DB);
  const logger = createLogger('sync');
  const result = await runCpContentCycle({
    db,
    logger,
    config: buildCpContentConfig(env),
    binding: env.CP ?? null
  });
  logger.info('cp_content.cycle.done', {
    status: result.status,
    pushed: result.pushed ?? 0,
    applied: result.applied ?? 0
  });
  // 1.25.48 m6 — مولد امتیاز داخل هستهٔ چرخه اجرا می‌شود (هم کرون و هم مسیر فرصت‌طلب را پوشش می‌دهد).
}

/** دروازهٔ فرصت‌طلب کتابخانهٔ شبکه — همان الگوی cp-sync/cp-report */
let cpContentProbeAt = 0;
function probeCpContent(env: Env, ctx: ExecutionContext): void {
  const t = Date.now();
  if (t - cpContentProbeAt < 60_000) return;
  cpContentProbeAt = t;
  ctx.waitUntil(
    cpContentOpportunistic({
      db: createDb(env.DB),
      logger: createLogger('sync'),
      config: buildCpContentConfig(env),
      binding: env.CP ?? null
    }).catch(() => undefined)
  );
}

/** چرخهٔ ارسال گزارش باگ به پشتیبانی CP (بازاعمال ۱.۲۵.۵۱) — گیت ۵دقیقه‌ای درونی، خاموش بدون env */
async function runBugReportForwardWrap(env: Env): Promise<void> {
  const db = createDb(env.DB);
  const logger = createLogger('sync');
  const result = await runBugReportForward({
    db,
    logger,
    config: buildBugReportConfig(env),
    binding: env.CP ?? null,
    force: true
  });
  logger.info('bug_report.cycle.done', {
    status: result.status,
    sent: result.status === 'done' ? result.sent : 0,
    failed: result.status === 'done' ? result.failed : 0,
    pulled: result.status === 'done' ? result.pulled : 0
  });
}

/** دروازهٔ فرصت‌طلب ارسال گزارش باگ — همان الگوی cp-sync/cp-report/cp-content */
let bugReportProbeAt = 0;
function probeBugReportForward(env: Env, ctx: ExecutionContext): void {
  const t = Date.now();
  if (t - bugReportProbeAt < 60_000) return;
  bugReportProbeAt = t;
  ctx.waitUntil(
    runBugReportForward({
      db: createDb(env.DB),
      logger: createLogger('sync'),
      config: buildBugReportConfig(env),
      binding: env.CP ?? null
    }).catch(() => undefined)
  );
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    probeCpSync(env, ctx); // فرصت‌طلب؛ بدون env خالی است و فوراً برمی‌گردد
    probeCpReport(env, ctx); // گزارش‌دهی تجمیعی روزانه به CP — گیت ۲۴ساعتهٔ درونی
    probeCpContent(env, ctx); // کتابخانهٔ شبکه — push همرسانی + pull برگزیده‌ها (گیت ۱۵دقیقه‌ای)
    probeBugReportForward(env, ctx); // گزارش باگ → پشتیبانی CP — گیت ۵دقیقه‌ای درونی (بازاعمال ۱.۲۵.۵۱)
    const db = createDb(env.DB);
    const audit = createAuditWriter(db);
    const logger = createLogger('worker');
    const cpContentCfg = buildCpContentConfig(env);
    const app = createApp({
      db,
      audit,
      logger,
      teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
      ...(await buildRuntimeEnv(env, db)),
      cpSyncUrl: env.CP_SYNC_URL ?? null,
      cpNodeCode: cpContentCfg.cpNodeCode,
      cpNodeKey: cpContentCfg.cpNodeKey,
      envName: env.ENV ?? null // ۱.۲۵.۶۷ — پنل سلامت
    });
    return app.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === CP_SYNC_CRON) {
      ctx.waitUntil(runCpSyncCycle(env)); // سینک اعلان از کنترل‌پلین — خاموش اگر env خالی باشد
      ctx.waitUntil(runCpReportCycle(env)); // گزارش‌دهی تجمیعی — گیت ۲۴ساعتهٔ مشترک، دوباره‌کاری صفر
      ctx.waitUntil(runCpContentCycleWrap(env)); // کتابخانهٔ شبکه — گیت ۱۵دقیقه‌ای مشترک، دوباره‌کاری صفر
      ctx.waitUntil(runBugReportForwardWrap(env)); // گزارش باگ → پشتیبانی CP — گیت ۵دقیقه‌ای مشترک (بازاعمال ۱.۲۵.۵۱)
      return;
    }
    if (event.cron === DIGEST_CRON) {
      ctx.waitUntil(runDigestCycle(env));
      ctx.waitUntil(runBackupAutoSendCycle(env)); // پشتیبان خودکار شبانه (اگر فعال باشد)
      return;
    }
    if (event.cron === BATCH_CRON) {
      ctx.waitUntil(runBatchDispatchCycle(env));
      return;
    }
    ctx.waitUntil(runNotificationCycle(env));
  }
};
