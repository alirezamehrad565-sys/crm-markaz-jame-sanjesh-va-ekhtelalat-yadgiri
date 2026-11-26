/**
 * applyGenericChain — ۱.۲۷.۸۳ (sdt160: architecture-008)
 * تعریف یگانهٔ «زنجیرهٔ عمومی» زیراپ‌ها: request-id + محدودساز نوشتنی per-IP + no-store + 404.
 * سه کپیِ پیشین (اپ اصلی · games-standalone · node-sync) حذف و به همین تابع می‌روند؛ تفاوت‌های
 * مشروع به‌صورت پارامتر می‌آیند (مسیر request-id، مستثنی‌ها، پیشوند کلید، پیام ۴۲۹/۴۰۴).
 * ترتیب نصب و گیت‌های authِ بعدی دست‌نخورده می‌ماند — مبنای تست‌های ۴۰۱/۴۰۴/۴۲۹.
 */
import type { AppHono } from '@core/shared';
import { RateLimitError } from '@core/errors';
import { runWithRequestId } from '@core/audit';
import { API_RATE_LIMIT_WINDOW_MS, makeKeyedRateLimiter, parseApiRateLimitPerMin } from './rate-limit';

/** ف۵ (P2-13) — request-id سراسری: هدر X-Request-Id + زمینهٔ audit حتی روی خطا (finally) */
export function installRequestId(app: AppHono, path = '/api/*'): void {
  app.use(path, async (c, next) => {
    const requestId = `req-${crypto.randomUUID()}`;
    c.set('requestId', requestId);
    try {
      return await runWithRequestId(requestId, () => next());
    } finally {
      c.header('X-Request-Id', requestId);
    }
  });
}

export interface WriteLimitOptions {
  path?: string;
  /** مسیرهای مستثنی — پیش‌فرض ['/api/auth/login'] (throttle اختصاصی دوبل خودش را دارد) */
  exceptionPaths?: string[];
  /** پیشوند کلید سطل — node-sync از 'nodesync:' استفاده می‌کند */
  keyPrefix?: string;
  message?: string;
  /** هشدار یک‌بارهٔ خاموشی (env=۰) — اپ اصلی logger دارد؛ بازی‌ها بی‌لاگ */
  onDisabled?: () => void;
}

/** ف۵ (P2-15) — محدودساز نوشتنی per-IP (پنجرهٔ ثابت درون‌حافظهٔ per-isolate؛ سقف از env) */
export function installWriteRateLimit(app: AppHono, opts: WriteLimitOptions = {}): void {
  const path = opts.path ?? '/api/*';
  const exceptions = opts.exceptionPaths ?? ['/api/auth/login'];
  const keyPrefix = opts.keyPrefix ?? '';
  const message = opts.message ?? 'درخواست‌های نوشتنی بیش از حد مجاز است — کمی بعد دوباره تلاش کنید';
  const apiRateLimiter = makeKeyedRateLimiter(API_RATE_LIMIT_WINDOW_MS);
  let disabledLogged = false;
  app.use(path, async (c, next) => {
    if (c.req.method !== 'POST' && c.req.method !== 'PUT' && c.req.method !== 'PATCH' && c.req.method !== 'DELETE') {
      return next(); // فقط متدهای نوشتنی — خواندنی‌ها بی‌سقف می‌مانند (کش no-store خودشان را دارند)
    }
    if (exceptions.includes(c.req.path)) return next();
    // env در هر درخواست از bindings خوانده می‌شود؛ کلید سطل، سقف را هم شامل است تا تغییر env
    // سطل تازه بسازد نه بازنویسی سطل قدیم
    const perMin = parseApiRateLimitPerMin(c.env?.API_RATE_LIMIT_PER_MIN);
    if (perMin <= 0) {
      if (opts.onDisabled && !disabledLogged) {
        disabledLogged = true;
        opts.onDisabled();
      }
      return next();
    }
    const ip = (c.req.header('cf-connecting-ip') ?? 'unknown').slice(0, 64);
    if (!apiRateLimiter.allow(`${keyPrefix}${perMin}:${ip}`, perMin)) {
      c.header('Retry-After', String(Math.ceil(API_RATE_LIMIT_WINDOW_MS / 1000)));
      throw new RateLimitError(Math.ceil(API_RATE_LIMIT_WINDOW_MS / 1000), message);
    }
    return next();
  });
}


/** پاسخ‌های JSON زیراپ هرگز کش نمی‌شوند */
export function installNoStore(app: AppHono, path = '/api/*'): void {
  app.use(path, async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });
}

/** ۴۰۴ — اپ اصلی با پیام فارسی؛ node-sync عمداً کم‌دست بدون message (قرارداد §۵) */
export function installNotFound(app: AppHono, message?: string): void {
  app.notFound((c) =>
    c.json(message ? { error: 'NOT_FOUND', message } : { error: 'NOT_FOUND' }, 404)
  );
}

export interface GenericChainOptions {
  requestIdPath?: string;
  writeLimit?: WriteLimitOptions;
  noStorePath?: string;
  /** null = بدون ۴۰۴ سفارشی؛ undefined/شیء = با پیام اختیاری */
  notFound?: { message?: string } | null;
}

export function applyGenericChain(app: AppHono, opts: GenericChainOptions = {}): void {
  installRequestId(app, opts.requestIdPath ?? '/api/*');
  if (opts.writeLimit) installWriteRateLimit(app, opts.writeLimit);
  installNoStore(app, opts.noStorePath ?? '/api/*');
  if (opts.notFound !== null) installNotFound(app, opts.notFound?.message);
}
