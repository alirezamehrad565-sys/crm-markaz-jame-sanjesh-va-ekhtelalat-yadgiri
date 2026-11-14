// games-standalone — اپ مستقل ماژول بازی‌های درمانی (۱.۲۵.۷۵)
// هدف: همان بک‌اند بازی (src/domain/games) در یک ورکرِ مستقل قابل‌بسته‌بندی — بدون تکرار منطق.
// قراردادها عین اپ اصلی (src/application/api-routing) است تا رفتار هر دو بسته یکسان بماند:
//   ① زنجیرهٔ عمومی /m/:token و /api/m/:token/* «پیش از» گیت authMiddleware ثبت می‌شود (قرارداد §۵ نقشهٔ راه).
//   ② API پرسنلی /api/games/* پشت همان دو گیت (احراز + ناظر) می‌نشیند.
//   ③ request-id سراسری، محدودساز نوشتنی per-IP، هدرهای امنیتی و no-store — همگی هم‌الگوی اپ اصلی.
// آنچه عمداً نیست: CP (سینک/گزارش/کتابخانه)، کرون‌ها، داشبورد و بقیهٔ ماژول‌ها — ورکر بازی فقط بازی است.
// مسیر rust: این ماژول واحد بسته‌بندی بازی‌ها برای میزبان محلی Tauri/Rust است (worker/games-bundle.js).
import { Hono } from 'hono';
import type { AppHono, AppBindings, AppVariables } from '@core/shared';
import { APP_VERSION } from '@core/version';
import { authMiddleware, supervisorGate } from '@core/auth';
import type { DbClient } from '@core/db';
import { runWithRequestId } from '@core/audit';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { createGamesService, registerGamesRoutes, registerGamesPublicRoutes } from '@domain/games';
import type { PathProbeInjector } from '@domain/games';
import { registerAuthRoutes, registerLogoutRoute } from '@app/auth';
import { errorHandler, parseApiRateLimitPerMin, makeKeyedRateLimiter, API_RATE_LIMIT_WINDOW_MS } from '@app/http';
import { RateLimitError } from '@core/errors';

export interface GamesAppDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** مبنای ساخت لینک عمومی مأموریت‌ها (/m/:token) — همان نقش PUBLIC_BASE_URL در اپ اصلی */
  publicBaseUrl?: string | null;
  /** تزریق اختیاری پروب به مسیر مداخله بالینی — در بستهٔ مستقل خالی می‌ماند (سرویس بدون آن هم درست است) */
  injectPathProbe?: PathProbeInjector;
}

export function createGamesApp(deps: GamesAppDeps): AppHono {
  const { db, audit, logger } = deps;
  const games = createGamesService({
    db,
    audit,
    logger,
    publicBaseUrl: deps.publicBaseUrl ?? null,
    ...(deps.injectPathProbe ? { injectPathProbe: deps.injectPathProbe } : {})
  });

  const app: AppHono = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

  // هوک تستی — هم‌الگوی __services اپ اصلی
  (app as unknown as { __games?: ReturnType<typeof createGamesService> }).__games = games;

  app.use('*', async (c, next) => {
    c.set('logger', logger);
    return next();
  });

  // ف۵ (P2-13) — request-id سراسری /api/* — هم‌الگوی اپ اصلی (هدر X-Request-Id + زمینهٔ audit)
  app.use('/api/*', async (c, next) => {
    const requestId = `req-${crypto.randomUUID()}`;
    c.set('requestId', requestId);
    try {
      return await runWithRequestId(requestId, () => next());
    } finally {
      c.header('X-Request-Id', requestId);
    }
  });

  // ف۵ (P2-15) — محدودساز نوشتنی per-IP — همان سقف و همان مستثنی login؛ سقف از env خوانده می‌شود
  const apiRateLimiter = makeKeyedRateLimiter(API_RATE_LIMIT_WINDOW_MS);
  app.use('/api/*', async (c, next) => {
    if (c.req.method !== 'POST' && c.req.method !== 'PUT' && c.req.method !== 'PATCH' && c.req.method !== 'DELETE') {
      return next();
    }
    if (c.req.path === '/api/auth/login') return next();
    const perMin = parseApiRateLimitPerMin(c.env?.API_RATE_LIMIT_PER_MIN);
    if (perMin <= 0) return next();
    const ip = (c.req.header('cf-connecting-ip') ?? 'unknown').slice(0, 64);
    if (!apiRateLimiter.allow(`${perMin}:${ip}`, perMin)) {
      c.header('Retry-After', String(Math.ceil(API_RATE_LIMIT_WINDOW_MS / 1000)));
      throw new RateLimitError(
        Math.ceil(API_RATE_LIMIT_WINDOW_MS / 1000),
        'درخواست‌های نوشتنی بیش از حد مجاز است — کمی بعد دوباره تلاش کنید'
      );
    }
    return next();
  });

  // هدرهای امنیتی — همان بستهٔ اپ اصلی
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('X-Frame-Options', 'DENY');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    c.header('Cross-Origin-Opener-Policy', 'same-origin');
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  });

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    logger.child('http').info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - start
    });
  });

  // سلامت ماژول — سبک‌تر از اپ اصلی: D1 + نسخه + نشانِ ماژول
  // ENG-4 (۱.۲۶.۴) — قرارداد پایش ورکر دوم: فیلدهای worker/server_ts/boot_ts فقط-افزودنی
  // هستند (ok/db/module/version/ts دست‌نخورده می‌مانند). boot_ts = زمان بالاآمدن همین نمونهٔ
  // ماژول؛ پس از هر ری‌استارت نگهبان تازه می‌شود و پنل سلامت آن را last_restart می‌خواند.
  const BOOT_TS = new Date().toISOString();
  app.get('/health', async (c) => {
    let dbOk = true;
    try {
      await db.queryOne('SELECT 1 AS ok');
    } catch {
      dbOk = false;
    }
    const now = new Date().toISOString();
    return c.json(
      {
        ok: dbOk,
        db: dbOk ? 'up' : 'down',
        module: 'games',
        version: APP_VERSION,
        ts: now,
        worker: 'games',
        server_ts: now,
        boot_ts: BOOT_TS
      },
      dbOk ? 200 : 503,
      { 'Cache-Control': 'no-store' }
    );
  });

  // ① زنجیرهٔ عمومی بازی — باید پیش از گیت auth ثبت شود (قرارداد §۵؛ توکن لینک جای احراز می‌نشیند)
  registerGamesPublicRoutes(app, games);

  // ورود/خروج مستقل — توکن همان قرارداد اپ اصلی را دارد (همان AUTH_SECRET / runtime-secret)؛
  // یعنی توکن صادرشده از هرکدام از دو بسته، در دیگری هم معتبر است.
  registerAuthRoutes(app, { audit, logger });

  app.use('/api/*', authMiddleware());
  app.use('/api/*', supervisorGate(audit));

  registerLogoutRoute(app, { audit, logger });

  app.get('/api/me', (c) => c.json({ data: c.get('authContext') }, 200));

  // ② API پرسنلی بازی‌ها — عین همان ثبت‌نام اپ اصلی
  registerGamesRoutes(app, games);

  app.onError(errorHandler);
  app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'مسیر درخواستی یافت نشد' }, 404));

  return app;
}
