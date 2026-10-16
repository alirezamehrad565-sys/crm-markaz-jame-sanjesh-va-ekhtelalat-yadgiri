/**
 * نقطهٔ ورود آینهٔ TS بک‌اند — همان رفتار worker/bundle.js برای تست
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Worker entry point — سیم‌کشی نهایی (مطابق docs/ARCHITECTURE.md بخش ۱۲.۱)
//: هندلر scheduled برای یادآوری‌ها (cron) اضافه شد.

import { createApp, createServices } from '@app/api-routing';
import { createDb } from '@core/db';
import { createAuditWriter } from '@core/audit';
import { createLogger } from '@core/logger';
import { BATCH_CRON, DIGEST_CRON, REMINDER_HORIZON_HOURS } from '@core/shared';

export interface Env {
  DB: D1Database;
  ENV: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  /** — توکن بات بله (secret؛ با wrangler secret put تنظیم شود) */
  BALE_BOT_TOKEN?: string;
  /** — secret مسیر webhook بات (secret؛ بدون آن webhook غیرفعال است) */
  BALE_WEBHOOK_SECRET?: string;
  /** — نام مرکز در متن پیام‌ها (اختیاری) */
  CLINIC_NAME?: string;
  /** — کلید امضای JWT نشست ورود (اختیاری؛ fallback توسعه‌ای) */
  AUTH_SECRET?: string;
  /** — binding اختیاری R2 برای فایل تمرین‌ها (بدون آن، ذخیرهٔ D1 پیش‌فرض است) */
  EXERCISE_FILES?: unknown;
  /** — آدرس عمومی سامانه برای لینک دانلود کاربرگ در پیام خانواده (اختیاری) */
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

/** یک چرخه کامل اعلان: صف‌گذاری یادآوری‌ها + ارسال صف pending */
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
  // یادآوری هوشمند: یادآور حضور و غیاب معوق به کارکنان (یک پیام در روز با dedup)
  const nudges = await services.notify.enqueuePendingAttendanceNudges().catch(() => 0);
  const dispatch = await services.notify.dispatchPending(100);
  logger.info('cycle.done', { ...summary, nudges, dispatch });
}

/** — چرخهٔ صبحگاهی «خلاصهٔ روز»: پوش برنامهٔ امروز به همهٔ chatهای متصل + یادآور پیگیری‌ها */
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

/** — چرخهٔ «ساعت ارسال» — dispatch فقط رکوردهای send_at <= now را می‌فرستد؛
 * پیش‌نویس‌های هنوز به موعد نرسیده دست‌نخورده می‌مانند (idempotent). */
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

  // ─── Cron: یادآوری نوبت‌ها + ارسال صف (قرارها در wrangler.toml) ───
  // cron «0 4 * * *» (07:30 تهران) = خلاصهٔ روز؛ بقیه = چرخهٔ یادآوری
  // cron «30 14 * * *» (18:00 تهران) = ساعت ارسال پیش‌نویس‌های اعلان نوبت
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === DIGEST_CRON) {
      ctx.waitUntil(runDigestCycle(env));
      return;
    }
    if (event.cron === BATCH_CRON) {
      ctx.waitUntil(runBatchDispatchCycle(env));
      return;
    }
    ctx.waitUntil(runNotificationCycle(env));
  }
};
