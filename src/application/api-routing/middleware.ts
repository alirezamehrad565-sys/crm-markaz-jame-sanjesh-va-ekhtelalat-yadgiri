/**
 * میان‌افزار سراسری — ۱.۲۷.۸۰ (architecture-001 — sdt157): از بدنهٔ createApp منتقل شد.
 * هر بلاک میان‌افزار یک نصب‌کنندهٔ مستقل است و ترتیبِ فراخوانی در installGlobalMiddleware
 * عیناً همان ترتیب قبلی است (در Hono ترتیب ثبت = رفتار زمان اجرا). state سطل‌های
 * محدودساز per-isolate در هر فراخوانیِ نصب‌کننده ساخته می‌شود (نه module-level) تا
 * قرارداد per-isolate و چرخهٔ createApp دست‌نخورده بماند. گیت auth/ناظر این‌جا نیست —
 * چون «بعد از» روت‌های عمومی و «قبل از» روت‌های محافظت‌شده ثبت می‌شود و همین ترتیبِ
 * میان‌روت در createApp (index.ts) نگه داشته شده است.
 */
import { runWithRequestId } from '@core/audit';
import { parseApiRateLimitPerMin, parseTokenGetRateLimitPerMin, makeKeyedRateLimiter, API_RATE_LIMIT_WINDOW_MS } from '@app/http';
import { RateLimitError } from '@core/errors';
import { maskSensitivePath } from '@core/shared/log-mask'; // security-005 (۱.۲۷.۷۸) — مسیرِ لاگ ماسک می‌شود
import type { AppHono } from '@core/shared';
import type { Services } from './composition';

/** تزریق logger به زمینهٔ هر درخواست — اولین حلقهٔ زنجیره */
function installLoggerContext(app: AppHono, services: Services): void {
  app.use('*', async (c, next) => {
    c.set('logger', services.logger);
    return next();
  });
}

/* ف۵ (P2-13) — request-id سراسری: هر درخواست /api/* شناسهٔ همبستگی `req-<uuid>` می‌گیرد که
   در سه‌جا می‌نشیند: هدر پاسخ X-Request-Id، فیلد request_id پاکت خطا (errorHandler) و
   ردیف‌های audit_log همان درخواست (زمینهٔ AsyncLocalStorage در @core/audit — همهٔ
   audit.logهای از اعماق سرویس‌ها بدون تغییر امضا شامل می‌شوند). میدل‌ور اولِ /api/* است
   تا هر چیزی که بعدش می‌آید — حتی خطا — شناسه را داشته باشد. */
function installRequestId(app: AppHono): void {
  app.use('/api/*', async (c, next) => {
    const requestId = `req-${crypto.randomUUID()}`;
    c.set('requestId', requestId);
    try {
      return await runWithRequestId(requestId, () => next());
    } finally {
      // با finally حتی روی مسیر خطا (۴xx/۵xx) هدر می‌نشیند
      c.header('X-Request-Id', requestId);
    }
  });
}

/* ف۵ (P2-15) — محدودسازی نرخ نوشتنی /api/* per-IP (پنجرهٔ ثابت درون‌حافظهٔ per-isolate):
   پیش‌فرض ۲۴۰ نوشتنی در دقیقه بر IP — سخاوتمندانه تا کاربرد عادی هرگز ۴۲۹ نبیند؛
   env اختیاری API_RATE_LIMIT_PER_MIN («۰» = خاموش با یک لاگ). مستثنی‌ها:
   ① /api/auth/login — throttle اختصاصی دوبل خودش را دارد (login_throttle: ۵/۱۵دقیقه بر
     شناسه + ۲۰/۱۵دقیقه بر IP) و سقف سراسری روی مسیر ورود، قفل‌شدن دفتر پشت NAT واحد را
     به‌همراه دارد؛ ② مسیرهای /public (تله‌متری rum/client-errors) در این میدل‌ور نیستند و
     limiter خودشان را دارند. محدودیت صادقانه: شمارنده per-isolate است — جزئیات در
     @app/http/rate-limit و سند طرح §۴ آیتم ۱۵. */
function installWriteRateLimit(app: AppHono, services: Services): void {
  const apiRateLimiter = makeKeyedRateLimiter(API_RATE_LIMIT_WINDOW_MS);
  let rateLimitDisabledLogged = false;
  app.use('/api/*', async (c, next) => {
    if (c.req.method !== 'POST' && c.req.method !== 'PUT' && c.req.method !== 'PATCH' && c.req.method !== 'DELETE') {
      return next(); // فقط متدهای نوشتنی — خواندنی‌ها بی‌سقف می‌مانند (کش no-store خودشان را دارند)
    }
    if (c.req.path === '/api/auth/login') return next(); // مستثنی مستند — throttle اختصاصی دارد

    // env در هر درخواست از bindings خوانده می‌شود (wrangler var/secret رشته می‌دهد)؛
    // کلید سطل، سقف را هم شامل است تا تغییر env سطل تازه بسازد نه بازنویسی سطل قدیم
    const perMin = parseApiRateLimitPerMin(c.env?.API_RATE_LIMIT_PER_MIN);
    if (perMin <= 0) {
      if (!rateLimitDisabledLogged) {
        rateLimitDisabledLogged = true;
        services.logger.child('http').warn('api_rate_limit.disabled', {
          reason: 'API_RATE_LIMIT_PER_MIN=0'
        });
      }
      return next();
    }
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
}

/* ف۵ (security-008 — ۱.۲۷.۷۸-B1) — سقف خواندنی‌های توکن‌دارِ عمومی per-IP: صفحهٔ /m/:token و
   API زنجیرهٔ عمومی /api/m/* با «توکنِ خودِ لینک» کار می‌کنند (bearer هم‌ارز) و تا امروز بی‌سقف
   بودند؛ این دروازهٔ سخاوتمندانهٔ سوم (۱۲۰/دقیقه بر IP) فقط رگبار ماشینی روی لینک‌های عمومی را
   می‌بندد و کاربرد عادی هرگز ۴۲۹ نمی‌بیند. env اختیاری API_TOKEN_GET_RATE_LIMIT_PER_MIN
   («۰» = خاموش با یک لاگ). همان محدودیت صادقانهٔ per-isolate در @app/http/rate-limit ثبت است —
   کاهش قطعی روی دامنهٔ اختصاصی با WAF rate-limit کلادفلر ممکن است. */
function installTokenGetRateLimit(app: AppHono, services: Services): void {
  const tokenGetLimiter = makeKeyedRateLimiter(API_RATE_LIMIT_WINDOW_MS);
  let tokenGetDisabledLogged = false;
  app.use('*', async (c, next) => {
    if (c.req.method !== 'GET') return next();
    const p = c.req.path;
    if (!/^\/m\/[^/]+/.test(p) && !p.startsWith('/api/m/')) return next(); // فقط لینک‌های عمومی توکن‌دار
    const perMin = parseTokenGetRateLimitPerMin(c.env?.API_TOKEN_GET_RATE_LIMIT_PER_MIN);
    if (perMin <= 0) {
      if (!tokenGetDisabledLogged) {
        tokenGetDisabledLogged = true;
        services.logger.child('http').warn('api_token_get_rate_limit.disabled', {
          reason: 'API_TOKEN_GET_RATE_LIMIT_PER_MIN=0'
        });
      }
      return next();
    }
    const ip = (c.req.header('cf-connecting-ip') ?? 'unknown').slice(0, 64);
    if (!tokenGetLimiter.allow(`tg:${perMin}:${ip}`, perMin)) {
      c.header('Retry-After', String(Math.ceil(API_RATE_LIMIT_WINDOW_MS / 1000)));
      throw new RateLimitError(
        Math.ceil(API_RATE_LIMIT_WINDOW_MS / 1000),
        'درخواست‌های لینک عمومی بیش از حد مجاز است — کمی بعد دوباره تلاش کنید'
      );
    }
    return next();
  });
}

/** هدرهای امنیتی و کنترل کش — پس از پاسخ (await next سپس set header) */
function installSecurityAndCacheHeaders(app: AppHono): void {
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff'); // جلوی MIME-sniffing مرورگر
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin'); // نشت URL در Referrer ممنوع
    c.header('X-Frame-Options', 'DENY'); // جاسازی اپ در iframe سایت‌های دیگر ممنوع (clickjacking)
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); // سنسورها برای اپ لازم نیست
    c.header('Cross-Origin-Opener-Policy', 'same-origin'); // ایزوله‌سازی کانتکست بین‌پنجره‌ای
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); // HTTPS اجباری مرورگر
  });

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  app.use('/public/exercise-files/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
  });
  app.use('/public/announcements', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=60');
  });
}

/** لاگ درخواست با ماسک مسیر — آخرین حلقهٔ زنجیره تا زمان کل مسیر اندازه‌گیری شود */
function installRequestLogger(app: AppHono, services: Services): void {
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    services.logger.child('http').info('request', {
      method: c.req.method,
      path: maskSensitivePath(c.req.path), // security-005 (۱.۲۷.۷۸) — توکن لینک عمومی و سکرت وب‌هوک به لاگ نمی‌روند
      status: c.res.status,
      ms: Date.now() - start
    });
  });
}

/** نصب هشت بلاک میان‌افزار سراسری — ترتیب عیناً مانند نسخهٔ پیش از رفاکس */
export function installGlobalMiddleware(app: AppHono, services: Services): void {
  installLoggerContext(app, services);
  installRequestId(app);
  installWriteRateLimit(app, services);
  installTokenGetRateLimit(app, services);
  installSecurityAndCacheHeaders(app);
  installRequestLogger(app, services);
}
