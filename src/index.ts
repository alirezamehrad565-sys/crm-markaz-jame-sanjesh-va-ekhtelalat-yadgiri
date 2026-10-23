import { createApp, createServices } from '@app/api-routing';
import { createDb } from '@core/db';
import { createAuditWriter } from '@core/audit';
import { createLogger } from '@core/logger';
import { BATCH_CRON, DIGEST_CRON, REMINDER_HORIZON_HOURS } from '@core/shared';

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
}

function buildEnv(env: Env) {
  return {
    baleToken: env.BALE_BOT_TOKEN ?? null,
    webhookSecret: env.BALE_WEBHOOK_SECRET ?? null,
    clinicName: env.CLINIC_NAME ?? undefined,
    exerciseBucket: env.EXERCISE_FILES ?? null,
    downloadSecret: env.AUTH_SECRET ?? env.BALE_WEBHOOK_SECRET ?? null,
    publicBaseUrl: env.PUBLIC_BASE_URL ?? null
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

// m180 — پشتیبان خودکار شبانه: اگر مدیر فعالش کرده باشد، فایل پشتیبان به
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

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
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
    return app.fetch(request, env, _ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === DIGEST_CRON) {
      ctx.waitUntil(runDigestCycle(env));
      ctx.waitUntil(runBackupAutoSendCycle(env)); // m180 — پشتیبان خودکار شبانه (اگر فعال باشد)
      return;
    }
    if (event.cron === BATCH_CRON) {
      ctx.waitUntil(runBatchDispatchCycle(env));
      return;
    }
    ctx.waitUntil(runNotificationCycle(env));
  }
};
