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
      c.executionCtx.waitUntil(touchApiKeyLastUsed(db, keyRow.id));
      c.set('authContext', {
        staffId: owner.id,
        email: `api-key+${keyRow.prefix}@keys.local`,
        role: keyRow.role,
        displayName: `کلید: ${keyRow.name}`
      } satisfies AuthContext);
      return next();
    }

    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const sessionToken = authHeader.slice(7).trim();
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
    }

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
      throw new ForbiddenError('نقش کاربر مجاز نیست');
    }
    return next();
  };
}

export function supervisorGate(audit: { log(entry: { actorId: string; action: string; resourceType: string; resourceId: string; changes?: unknown }): Promise<void> }): MiddlewareHandler<Env> {
  // ناظر: همهٔ GETهای /api/* باز است؛ هیچ متد نوشتنی (POST/PUT/PATCH/DELETE) عبور نمی‌کند.
  // فقط ردشدن‌ها audit می‌شوند — لاگِ هر GET سیل audit_log می‌آورد.
  return async (c: Context<Env>, next) => {
    const ctx = c.get('authContext');
    if (!ctx || ctx.role !== 'supervisor') return next();

    const path = new URL(c.req.url).pathname;
    const method = c.req.method.toUpperCase();
    const allowed = method === 'GET';

    if (!allowed) {
      try {
        await audit.log({
          actorId: ctx.staffId,
          action: 'supervisor.denied',
          resourceType: 'route',
          resourceId: `${method} ${path}`,
          changes: { role: { from: null, to: 'supervisor' } }
        });
      } catch {
      }
      throw new ForbiddenError('حساب ناظر فقط خواندنی است — ثبت یا تغییر اطلاعات مجاز نیست');
    }
    return next();
  };
}

export function getAuthContext(c: Context<Env>): AuthContext {
  const ctx = c.get('authContext');
  if (!ctx) throw new AuthError();
  return ctx;
}
