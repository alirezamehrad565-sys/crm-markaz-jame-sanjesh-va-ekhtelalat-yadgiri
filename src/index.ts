import { createApp, createServices } from '@app/api-routing';
import { createDb } from '@core/db';
import { createAuditWriter } from '@core/audit';
import { createLogger } from '@core/logger';
import { BATCH_CRON, DIGEST_CRON, REMINDER_HORIZON_HOURS, CP_SYNC_CRON } from '@core/shared';
import {
  buildCpSyncConfig,
  syncCpAnnouncements,
  cpSyncOpportunistic,
  stampCpSyncAttempt
} from '@app/cp-sync/announcements';

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
  /** Service Binding به ورکر کنترل‌پلین (هم‌حساب) — fetch عمومیِ هم‌زون 1042 می‌دهد */
  CP?: Fetcher;
}

function buildEnv(env: Env) {
  return {
    baleToken: env.BALE_BOT_TOKEN ?? null,
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
    ...buildEnv(env)
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
  const audit = createAuditWriter(db);
  const logger = createLogger('cron.digest');
  const services = createServices({
    db,
    audit,
    logger,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    ...buildEnv(env)
  });

  const summary = await services.notify.sendDailyDigest(new Date()).catch((err: unknown) => {
    logger.error('digest.failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  const dispatch = await services.notify.dispatchPending(100);
  logger.info('digest.cycle.done', { summary, dispatch });
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
    ...buildEnv(env)
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
    ...buildEnv(env)
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    probeCpSync(env, ctx); // فرصت‌طلب؛ بدون env خالی است و فوراً برمی‌گردد
    const db = createDb(env.DB);
    const audit = createAuditWriter(db);
    const logger = createLogger('worker');
    const app = createApp({
      db,
      audit,
      logger,
      teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
      ...buildEnv(env)
    });
    return app.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === CP_SYNC_CRON) {
      ctx.waitUntil(runCpSyncCycle(env)); // سینک اعلان از کنترل‌پلین — خاموش اگر env خالی باشد
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
