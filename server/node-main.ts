/**
 * نقطهٔ ورود سلف‌هاست (Node.js) — همان worker با درایور SQLite محلی
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 *
 * معماری (docs/DOCKERIZE.md):
 *   درخواست ← HTTP (@hono/node-server) ← استاتیک (public/_headers) → worker.fetch (src/index.ts)
 *   کرون‌ها  ← startCrons (همان ۴ عبارت پروداکشن) → worker.scheduled
 *   دیتابیس  ← NodeD1 روی node:sqlite (WAL) در DATA_DIR/app.db
 */
import { serve } from '@hono/node-server';
import worker from '../src/index';
import type { Env } from '../src/index';
import { NodeD1 } from '@core/db/node-d1';
import { applySelfhostMigrations } from '@core/db/selfhost-migrate';
import { createLogger } from '@core/logger';
import { APP_VERSION, APP_MILESTONE } from '@core/version';
import { loadSelfhostConfig } from './env';
import { createStaticServer } from './static';
import { startCrons, ALL_CRONS } from './crons';

const log = createLogger('selfhost');
const cfg = loadSelfhostConfig();

// ——— دیتابیس ———
const d1 = NodeD1.open(cfg.dbPath);
const migration = applySelfhostMigrations(d1.rawStore, cfg.migrationsDir, (m) => log.info('migrate', { m }));

// ——— env مشابه Workers ———
const workerEnv = {
  DB: d1 as unknown as D1Database,
  ENV: 'production',
  CF_ACCESS_TEAM_DOMAIN: '',
  BALE_BOT_TOKEN: cfg.baleBotToken,
  BALE_WEBHOOK_SECRET: cfg.baleWebhookSecret,
  CLINIC_NAME: cfg.clinicName,
  AUTH_SECRET: cfg.authSecret,
  PUBLIC_BASE_URL: cfg.publicBaseUrl
} satisfies Env;

const ctx = {
  waitUntil(p: Promise<unknown>): void {
    void Promise.resolve(p).catch((err: unknown) => {
      log.error('waitUntil.failed', { error: err instanceof Error ? err.message : String(err) });
    });
  },
  passThroughOnException(): void {
    // بدون همتا در Node — Workers API برای parity
  }
};

// ——— کرون‌ها ———
const crons = startCrons(
  (event) => worker.scheduled(event as ScheduledEvent, workerEnv as Env, ctx as unknown as ExecutionContext),
  (msg, meta) => log.info(msg, meta)
);

// ——— استاتیک ———
const staticServer = createStaticServer(cfg.publicDir);

// ——— HTTP ———
async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // تریگر دستی کرون — فقط با CRON_MANUAL=1 (آزمون/نگهداری)
  if (cfg.manualCron && url.pathname === '/__scheduled') {
    const expr = url.searchParams.get('cron') ?? ALL_CRONS[0];
    const ok = await crons.trigger(expr);
    return Response.json({ ok, cron: expr }, { status: ok ? 200 : 400 });
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    const st = staticServer.handle(url.pathname, request.method, request.headers.get('if-none-match'));
    if (st !== null) return st;
  }

  return worker.fetch(request, workerEnv as Env, ctx as unknown as ExecutionContext);
}

const server = serve({ fetch: handle, port: cfg.port, hostname: cfg.host }, (info) => {
  log.info('selfhost.up', {
    version: APP_VERSION,
    milestone: APP_MILESTONE,
    port: info.port,
    dataDir: cfg.dataDir,
    migrations: { applied: migration.applied.length, assumedFromSchema: migration.assumedFromSchema },
    bale: Boolean(cfg.baleBotToken),
    manualCron: cfg.manualCron
  });
  console.log(`✓ مرکز جامع ${APP_VERSION}/${APP_MILESTONE} — http://localhost:${info.port}`);
});

// ——— خاموشی نرم ———
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('selfhost.shutdown', { signal });
  crons.stop();
  server.close(() => undefined);
  d1.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', { error: reason instanceof Error ? reason.message : String(reason) });
});
