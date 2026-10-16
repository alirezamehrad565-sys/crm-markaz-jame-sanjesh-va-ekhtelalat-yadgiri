/**
 * احراز هویت هسته — JWT، رمز، کلید API و گارد نقش — میدلور گارد احراز هویت و نقش
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Auth middleware: verify JWT Cloudflare Access → resolve email به staff → inject AuthContext
// Dev bypass: در ENV=development با هدر X-Dev-Staff-Id (بدون JWT) برای تست محلی
// استثنای Webhook: مسیرهای /webhook/* از auth مستثنی هستند (در api-routing رجیستر نمی‌شود)

import type { Context, MiddlewareHandler } from 'hono';
import type { AppBindings, AppVariables, AuthContext } from '@core/shared';
import { FEATURES } from '@core/shared';
import { AuthError, ForbiddenError } from '@core/errors';
import { verifyAccessToken } from './jwt';
import { verifySessionJwt } from './session-jwt';
import { resolveSessionSecret } from './runtime-secret';
import { getStaffById, resolveStaffByEmail } from './staff';
import { findApiKeyByHash, hashApiKey, looksLikeApiKey, touchApiKeyLastUsed } from './api-keys';

type Env = { Bindings: AppBindings; Variables: AppVariables };

const DEV_STAFF_HEADER = 'X-Dev-Staff-Id';
const ACCESS_JWT_HEADER = 'Cf-Access-Jwt-Assertion';
const API_KEY_HEADER = 'X-Api-Key';

export function authMiddleware(): MiddlewareHandler<Env> {
  return async (c: Context<Env>, next) => {
    const env = c.env;
    const db = env.DB;

    // ─── Dev bypass (فقط development) ───
    if (env.ENV === 'development') {
      const devStaffId = c.req.header(DEV_STAFF_HEADER);
      if (devStaffId) {
        const staff = await getStaffById(db, devStaffId);
        if (!staff || staff.active !== 1) {
          throw new AuthError('کاربر یافت نشد یا غیرفعال است');
        }
        c.set('authContext', {
          staffId: staff.id,
          email: staff.email,
          role: staff.role,
          displayName: staff.full_name
        } satisfies AuthContext);
        return next();
      }
    }

    // ─── کلید API (سرویس‌های خارجی/اتوماسیون) ───
    // ترتیب احراز: dev bypass → API key → JWT (Cloudflare Access)
    // فعلاً قطع است (FEATURES.apiKeys = false) — کاربر به‌صورت دستی تنظیم می‌کند
    const apiKey = FEATURES.apiKeys ? c.req.header(API_KEY_HEADER) : undefined;
    if (apiKey) {
      if (!looksLikeApiKey(apiKey)) {
        throw new AuthError('شکل کلید API معتبر نیست');
      }
      const keyHash = await hashApiKey(apiKey);
      const keyRow = await findApiKeyByHash(db, keyHash);
      if (!keyRow || keyRow.active !== 1) {
        throw new AuthError('کلید API نامعتبر یا باطل‌شده است');
      }
      const owner = await getStaffById(db, keyRow.created_by);
      if (!owner || owner.active !== 1) {
        throw new AuthError('مالک کلید فعال نیست');
      }
      // آخرین استفاده — best-effort خارج از مسیر پاسخ
      c.executionCtx.waitUntil(touchApiKeyLastUsed(db, keyRow.id));
      c.set('authContext', {
        staffId: owner.id,
        email: `api-key+${keyRow.prefix}@keys.local`,
        role: keyRow.role,
        displayName: `کلید: ${keyRow.name}`
      } satisfies AuthContext);
      return next();
    }

    // ─── توکن نشست صفحه ورود (Authorization: Bearer — HS256 خود سیستم) ───
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const sessionToken = authHeader.slice(7).trim();
      // کلید امضا از resolver (env → dev → secret ران‌تایم) — بدون fallback هاردکد در تولید
      const payload = await verifySessionJwt(sessionToken, await resolveSessionSecret(env));
      if (payload) {
        const staff = await getStaffById(db, payload.sub);
        if (!staff || staff.active !== 1) {
          throw new AuthError('کاربر یافت نشد یا غیرفعال است');
        }
        c.set('authContext', {
          staffId: staff.id,
          email: staff.email,
          role: staff.role,
          displayName: staff.full_name
        } satisfies AuthContext);
        return next();
      }
      // توکن نامعتبر → به مسیر Cloudflare Access می‌افتد (و 401 می‌گیرد)
    }

    // ─── مسیر production: JWT حتماً verify ───
    const token = c.req.header(ACCESS_JWT_HEADER);
    if (!token) {
      throw new AuthError('توکن دسترسی موجود نیست');
    }

    const payload = await verifyAccessToken(token, env.CF_ACCESS_TEAM_DOMAIN);
    if (!payload) {
      throw new AuthError('توکن دسترسی نامعتبر است');
    }

    const staff = await resolveStaffByEmail(db, payload.email);
    if (!staff || staff.active !== 1) {
      // ایمیل موجود نیست یا staff inactive → 401
      throw new AuthError('کاربر مجاز نیست');
    }

    c.set('authContext', {
      staffId: staff.id,
      email: staff.email,
      role: staff.role,
      displayName: staff.full_name
    } satisfies AuthContext);

    return next();
  };
}

export function requireRole(...roles: string[]): MiddlewareHandler<Env> {
  return async (c: Context<Env>, next) => {
    const ctx = c.get('authContext');
    if (!ctx) throw new AuthError();
    if (roles.length > 0 && !roles.includes(ctx.role)) {
      // ۴۰۳ (نه ۴۰۱) — کاربر شناخته شده است ولی نقشش مجاز نیست
      throw new ForbiddenError('نقش کاربر مجاز نیست');
    }
    return next();
  };
}

/**
 * — دیوار ناظر اداره (deny-by-default).
 * ناظر فقط خواندنِ داشبورد تجمیعی + پروفایل خودش را دارد؛ هر مسیر دیگر ۴۰۳ است.
 * چون بیشتر مسیرهای API «هر احرازشده» را می‌پذیرند، این گیت باید بلافاصله بعد از
 * authMiddleware بنشیند تا requireRoleهای «باز» ناظر را رد نکنند.
 * هر دسترسی ناظر در audit_log ثبت می‌شود (خودِ مرکز ببیند ناظر کی چه دید).
 */
export function supervisorGate(audit: { log(entry: { actorId: string; action: string; resourceType: string; resourceId: string; changes?: unknown }): Promise<void> }): MiddlewareHandler<Env> {
  const ALLOWED_PREFIXES = ['/api/dashboard'];
  const ALLOWED_EXACT = ['/api/me'];

  return async (c: Context<Env>, next) => {
    const ctx = c.get('authContext');
    if (!ctx || ctx.role !== 'supervisor') return next();

    const path = new URL(c.req.url).pathname;
    const method = c.req.method.toUpperCase();
    const allowed =
      method === 'GET' &&
      (ALLOWED_EXACT.includes(path) || ALLOWED_PREFIXES.some((p) => path.startsWith(p)));

    try {
      await audit.log({
        actorId: ctx.staffId,
        action: allowed ? 'supervisor.access' : 'supervisor.denied',
        resourceType: 'route',
        resourceId: `${method} ${path}`,
        changes: { role: { from: null, to: 'supervisor' } }
      });
    } catch {
      /* audit هرگز مسیر را نمی‌شکند */
    }

    if (!allowed) {
      throw new ForbiddenError('دسترسی ناظر فقط به گزارش‌های تجمیعی مجاز است');
    }
    return next();
  };
}

export function getAuthContext(c: Context<Env>): AuthContext {
  const ctx = c.get('authContext');
  if (!ctx) throw new AuthError();
  return ctx;
}
