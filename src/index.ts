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
import { runAlertCycle } from '@app/health/alerts'; // ف۵ (P0-3) — هشدار خودکار روی چرخهٔ digest
import { cutoffIso, cutoffYmd, pruneOrphanExerciseChunks, pruneRowsOlderThan } from '@core/db/retention'; // data-002/004 (۱.۲۷.۸۳)

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
  // — سینک اعلان از شبکهٔ مراکز (m1.5)؛ هر چهار مقدار خالی = خاموش کامل —
  CP_SYNC_URL?: string;
  CP_NODE_CODE?: string;
  CP_NODE_KEY?: string;
  CP_SYNC_STAFF_ID?: string;
  /** Service Binding به ورکر شبکهٔ مراکز (هم‌حساب) — fetch عمومیِ هم‌زون ۱۰۴۲ می‌دهد */
  CP?: Fetcher;
  /**
   * ف۴ — سقف نگه‌داری audit_log بر حسب روز (اختیاری؛ پیش‌فرض ۱۸۰؛ صفر = پاکسازی خاموش).
   * فقط مصرف کرون شبانهٔ digest است؛ مقادیر نامعتبر/منفی با پیش‌فرض جایگزین می‌شوند.
   */
  AUDIT_LOG_RETENTION_DAYS?: number;
  /** ف۵ (P0-3) — آستانهٔ هشدار خطاهای مرورگر در ۲۴ ساعت (اختیاری؛ پیش‌فرض ۱۰۰؛ صفر = هر خطا هشدار) */
  ALERT_CLIENT_ERRORS_MAX?: number;
  /** ف۵ (P0-3) — kill-switch هشدار خودکار؛ رشتهٔ راستین («۱»/«true») ارزیابی را کامل خاموش می‌کند */
  ALERTS_DISABLED?: string;
  /** ENG-4 (۱.۲۶.۴) — نشانی /health ورکر بازی‌ها؛ فقط در کانفیگ موتور محلی بسته می‌شود (config.mjs) */
  GAMES_HEALTH_URL?: string;
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
  // ف۵ — همان سه‌متایی CP که fetch می‌سازد تا ارزیابی هشدار وضعیت واقعی لینک را ببیند
  const cpContentCfg = buildCpContentConfig(env);
  const services = createServices({
    db,
    audit,
    logger,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    ...(await buildRuntimeEnv(env, db)),
    // پنل سلامتِ همین چرخه برای ارزیابی هشدار باید وضعیت واقعی CP را ببیند، نه خاموش‌نما
    // (قرارداد خاموشی سه‌متغیره دست‌نخورده می‌ماند)
    cpSyncUrl: env.CP_SYNC_URL ?? null,
    cpNodeCode: cpContentCfg.cpNodeCode,
    cpNodeKey: cpContentCfg.cpNodeKey,
    clientErrorsMax: env.ALERT_CLIENT_ERRORS_MAX ?? null
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
    // ۱.۲۷.۸۳ (data-004) — هر جدول در نگه‌دارندهٔ خودش: خطای یک جدول بقیه را نمی‌بُرد
    const out: Record<string, number | null> = {};
    const step = async (name: string, fn: () => Promise<number>): Promise<void> => {
      try {
        out[name] = await fn();
      } catch (err: unknown) {
        logger.error('retention.failed', { table: name, error: err instanceof Error ? err.message : String(err) });
        out[name] = null;
      }
    };
    await step('client_errors', () => services.clientErrors.pruneOld());
    await step('rum_events', () => services.rum.pruneOld());
    await step('audit_log', () => audit.pruneOld());
    // data-004 (۱.۲۷.۸۳) — سه جدولی که تا امروز بی‌پاکسازی رشد می‌کردند؛ عمرها در TABLE_POLICIES ثبت است
    await step('node_push_events', () => pruneRowsOlderThan(db, 'node_push_events', 'received_at', cutoffIso(90, Date.now())));
    await step('node_sync_inbox', () => pruneRowsOlderThan(db, 'node_sync_inbox', 'received_at', cutoffIso(90, Date.now())));
    await step('quota_usage', () => pruneRowsOlderThan(db, 'quota_usage', 'day', cutoffYmd(400, Date.now())));
    // data-002 (۱.۲۷.۸۳) — سوییپ شبانهٔ chunkهای یتیم تمرین (key بدون attachment زنده)
    await step('exercise_file_chunks_orphans', () => pruneOrphanExerciseChunks(db));
    return out;
  })();
  // ف۴ — گزارش رشد جدول‌ها: شمارش ردیف‌ها فقط همین‌جا (کرون، هرگز مسیر درخواست نیست)؛
  // مُهر ۲۴ساعتهٔ growth.last_snapshot_at دوباره‌کاری را می‌بندد
  const growth = await services.growth.captureDaily().catch((err: unknown) => {
    logger.error('growth.snapshot.failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  // ف۵ (P0-3 حداقلی) — ارزیابی هشدار خودکار بعد از شمارش رشد، در همان چرخهٔ شبانه:
  // ① رانش مُهر تلاش/موفقیت درگاه‌های CP نسبت به آستانه‌های §۳-۱۱ ② جهش خطاهای مرورگر در ۲۴ ساعت
  // (env اختیاری ALERT_CLIENT_ERRORS_MAX)؛ kill-switch: ALERTS_DISABLED. وقتی هشدار باشد:
  // logger.error با کد alert.* + پیام فارسی در صف اعلان برای مدیر(ها) روی همان کانال دایجست.
  const alerts = await runAlertCycle({
    db,
    health: services.health,
    notify: services.notify,
    logger,
    clientErrorsMax: env.ALERT_CLIENT_ERRORS_MAX,
    alertsDisabled: env.ALERTS_DISABLED
  }).catch((err: unknown) => {
    logger.error('alert.cycle.failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  logger.info('digest.cycle.done', { summary, dispatch, gamesMaintenance, retention, growth, alerts });
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
// ۱.۲۶.۴ — پیش از ارسال، «آخرین پشتیبان تأییدشده» در آرشیو محلی (settings) تازه می‌شود تا
// دکمهٔ «دریافت پشتیبان فوری» (GET /api/backup/download) همیشه پشتیبانِ شب‌گذشته را داشته باشد.
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

  const archive = await services.backup.archiveLatest({ staffId: 'system' }).catch((err: unknown) => {
    logger.error('backup.archive.failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  const outcome = await services.backup.runScheduledAutoSend().catch((err: unknown) => {
    logger.error('backup.auto.failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  logger.info('backup.auto.cycle.done', { archive, outcome });
}

/**
 * architecture-009 (۱.۲۷.۸۵) — چهار جفتِ «دروازهٔ فرصت‌طلب + چرخهٔ کرون» یک شکل‌اند: مُهر ۶۰ثانیه‌ای
 * روی isolate + waitUntil(op({db, logger, config, binding})). کارخانه هر جفت را یک‌بار تعریف می‌کند؛
 * لاگ چرخه هم شکل قبل می‌ماند («<name>.cycle.done» + status + فیلدهای اختصاصی هر گیت).
 */
interface OpDeps<C> {
  db: ReturnType<typeof createDb>;
  logger: ReturnType<typeof createLogger>;
  config: C;
  /** Service Binding به ورکر شبکهٔ مراکز — همان env.CP */
  binding: Fetcher | null;
  /** فقط گیت bug-report: چرخهٔ کرون با force اجرا می‌شود */
  force?: boolean;
}

interface OpportunisticGate {
  probe: (env: Env, ctx: ExecutionContext) => void;
  runCycle: (env: Env) => Promise<void>;
}

function makeOpportunisticGate<C, P, S extends { status: string }>(
  name: string,
  spec: {
    config: (env: Env) => C;
    probeOp: (deps: OpDeps<C>) => Promise<P>;
    cycleOp: (deps: OpDeps<C>) => Promise<S>;
    /** فیلدهای اختصاصی لاگ چرخه — status خودکار اضافه می‌شود */
    logFields: (result: S) => Record<string, unknown>;
    /** پیش از op چرخهٔ کرون — فقط cp-sync (مُهر تلاش مشترک کرون/فرصت‌طلب) */
    stamp?: (db: ReturnType<typeof createDb>) => Promise<void>;
    /** فقط bug-report — چرخهٔ کرون با force: true */
    force?: boolean;
  }
): OpportunisticGate {
  let probeAt = 0;
  return {
    probe(env, ctx) {
      const t = Date.now();
      if (t - probeAt < 60_000) return;
      probeAt = t;
      ctx.waitUntil(
        spec.probeOp({
          db: createDb(env.DB),
          logger: createLogger('sync'),
          config: spec.config(env),
          binding: env.CP ?? null
        }).catch(() => undefined)
      );
    },
    async runCycle(env) {
      const db = createDb(env.DB);
      const logger = createLogger('sync');
      if (spec.stamp) await spec.stamp(db).catch(() => undefined);
      const result = await spec.cycleOp({
        db,
        logger,
        config: spec.config(env),
        binding: env.CP ?? null,
        ...(spec.force ? { force: true } : {})
      });
      logger.info(`${name}.cycle.done`, { status: result.status, ...spec.logFields(result) });
    }
  };
}

/* چهار گیت — ترتیب، مُهر ۶۰ثانیه‌ای و لاگ عین قبل */
const cpSyncGate = makeOpportunisticGate('cp_sync', {
  config: buildCpSyncConfig,
  probeOp: cpSyncOpportunistic,
  cycleOp: syncCpAnnouncements,
  logFields: (result) => ({ applied: result.applied ?? 0 }),
  stamp: stampCpSyncAttempt
});
const cpReportGate = makeOpportunisticGate('cp_report', {
  config: buildCpReportConfig,
  probeOp: cpReportOpportunistic,
  cycleOp: pushCpReport,
  logFields: (result) => ({ seq: result.seq ?? 0 })
});
const cpContentGate = makeOpportunisticGate('cp_content', {
  config: buildCpContentConfig,
  probeOp: cpContentOpportunistic,
  cycleOp: runCpContentCycle,
  logFields: (result) => ({ pushed: result.pushed ?? 0, applied: result.applied ?? 0 })
});
const bugReportGate = makeOpportunisticGate('bug_report', {
  config: buildBugReportConfig,
  probeOp: runBugReportForward,
  cycleOp: runBugReportForward,
  logFields: (result) => ({
    sent: result.status === 'done' ? result.sent : 0,
    failed: result.status === 'done' ? result.failed : 0,
    pulled: result.status === 'done' ? result.pulled : 0
  }),
  force: true
});

/* architecture-009 — نگاشت رویداد کرون سینک → گیت‌ها (ترتیب اجرای چهار چرخه عین قبل) */
const CRON_GATES: Partial<Record<string, readonly OpportunisticGate[]>> = {
  [CP_SYNC_CRON]: [cpSyncGate, cpReportGate, cpContentGate, bugReportGate]
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    cpSyncGate.probe(env, ctx); // فرصت‌طلب؛ بدون env خالی است و فوراً برمی‌گردد
    cpReportGate.probe(env, ctx); // گزارش‌دهی تجمیعی روزانه به CP — گیت ۲۴ساعتهٔ درونی
    cpContentGate.probe(env, ctx); // کتابخانهٔ شبکه — push همرسانی + pull برگزیده‌ها (گیت ۱۵دقیقه‌ای)
    bugReportGate.probe(env, ctx); // گزارش باگ → پشتیبانی CP — گیت ۵دقیقه‌ای درونی (بازاعمال ۱.۲۵.۵۱)
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
      envName: env.ENV ?? null, // ۱.۲۵.۶۷ — پنل سلامت
      clientErrorsMax: env.ALERT_CLIENT_ERRORS_MAX ?? null, // ف۵ (P0-3) — آستانهٔ هشدار خطاهای مرورگر
      gamesHealthUrl: env.GAMES_HEALTH_URL ?? null // ENG-4 (۱.۲۶.۴) — پایش ورکر بازی‌ها
    });
    return app.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // architecture-009 — چهار چرخهٔ سینک CP روی نگاشت گیت‌ها (کرون ۱۵دقیقه‌ای موجود؛ ترتیب عین قبل)
    const gates = CRON_GATES[event.cron];
    if (gates) {
      for (const gate of gates) ctx.waitUntil(gate.runCycle(env));
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
