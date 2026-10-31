import type { AppHono } from '@core/shared';
import { LoginSchema } from '@core/shared';
import { findStaffByUsername, signSessionJwt, verifyPassword, hashPassword, isLegacyPasswordHash, resolveSessionSecret, getAuthContext } from '@core/auth';
import { AuthError, RateLimitError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';

const LOGIN_MAX_FAILURES = 5; // بر اساس نام کاربری — 
const LOGIN_IP_MAX_FAILURES = 20; // بر اساس IP (سخت‌گیرتر از ۵ نیست — NAT دفتر قفل نشود) — 
const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_WINDOW_MS = LOGIN_WINDOW_MINUTES * 60 * 1000;

// هم‌زمان‌سازی زمان پاسخ: برای «کاربر ناموجود» هم یک PBKDF2 واقعی اجرا می‌شود
// تا مهاجم نتواند با تایمینگ وجود/عدم‌وجود نام کاربری را حدس بزند.
// رمز ساختگی per-isolate تصادفی است و هیچ‌کس آن را نمی‌داند.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(crypto.randomUUID() + crypto.randomUUID());
  return dummyHashPromise;
}

function windowFloorIso(): string {
  return new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
}

async function throttleRemainingSeconds(db: D1Database, identity: string, maxFailures: number): Promise<number> {
  const row = await db
    .prepare('SELECT fail_count, window_start FROM login_throttle WHERE identity = ? LIMIT 1')
    .bind(identity)
    .first<{ fail_count: number; window_start: string }>();
  if (!row) return 0;
  const started = Date.parse(row.window_start);
  if (!Number.isFinite(started)) return 0;
  const elapsed = Date.now() - started;
  if (elapsed >= LOGIN_WINDOW_MS) return 0;
  if (row.fail_count < maxFailures) return 0;
  return Math.max(1, Math.ceil((LOGIN_WINDOW_MS - elapsed) / 1000));
}

async function recordLoginFailure(db: D1Database, identity: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO login_throttle (identity, fail_count, window_start)
       VALUES (?, 1, ?)
       ON CONFLICT(identity) DO UPDATE SET
         fail_count = CASE
           WHEN login_throttle.window_start <= ? THEN 1
           ELSE login_throttle.fail_count + 1
         END,
         window_start = CASE
           WHEN login_throttle.window_start <= ? THEN excluded.window_start
           ELSE login_throttle.window_start
         END`
    )
    .bind(identity, new Date().toISOString(), windowFloorIso(), windowFloorIso())
    .run();
}

async function clearThrottle(db: D1Database, identity: string): Promise<void> {
  try {
    await db.prepare('DELETE FROM login_throttle WHERE identity = ? OR window_start <= ?').bind(identity, windowFloorIso()).run();
  } catch {
  }
}

export interface AuthRoutesDeps {
  audit: AuditWriter;
  logger: Logger;
}

export function registerAuthRoutes(app: AppHono, deps: AuthRoutesDeps): void {
  app.post('/api/auth/login', async (c) => {
    const body = LoginSchema.parse(await c.req.json<unknown>());

    const identity = body.username.trim().toLowerCase();
    const ip = (c.req.header('cf-connecting-ip') ?? 'unknown').slice(0, 64);
    const ipKey = `ip:${ip}`;

    // دو لایه throttle: نام کاربری (۵/۱۵دقیقه) + IP (۲۰/۱۵دقیقه) تا چرخش نام کاربری bypass نشود
    const blockedFor = await throttleRemainingSeconds(c.env.DB, identity, LOGIN_MAX_FAILURES);
    if (blockedFor > 0) {
      await deps.audit.log({
        actorId: 'anonymous',
        action: 'auth.login_throttled',
        resourceType: 'staff',
        resourceId: identity,
        changes: { retryAfterSeconds: { from: null, to: blockedFor }, scope: { from: null, to: 'identity' } }
      });
      throw new RateLimitError(
        blockedFor,
        `تلاش‌های ناموفق بیش از حد مجاز است — ${Math.ceil(blockedFor / 60)} دقیقه دیگر دوباره تلاش کنید`
      );
    }
    const ipBlockedFor = await throttleRemainingSeconds(c.env.DB, ipKey, LOGIN_IP_MAX_FAILURES);
    if (ipBlockedFor > 0) {
      await deps.audit.log({
        actorId: 'anonymous',
        action: 'auth.login_throttled',
        resourceType: 'staff',
        resourceId: ipKey,
        changes: { retryAfterSeconds: { from: null, to: ipBlockedFor }, scope: { from: null, to: 'ip' } }
      });
      throw new RateLimitError(
        ipBlockedFor,
        `تلاش‌های ناموفق بیش از حد مجاز است — ${Math.ceil(ipBlockedFor / 60)} دقیقه دیگر دوباره تلاش کنید`
      );
    }

    const staff = await findStaffByUsername(c.env.DB, body.username);

    if (!staff || staff.active !== 1) {
      // PBKDF2 ساختگی برای هم‌زمان‌سازی زمان پاسخ با مسیر «رمز اشتباه»
      await verifyPassword(body.password, await getDummyHash());
      await recordLoginFailure(c.env.DB, identity);
      await recordLoginFailure(c.env.DB, ipKey);
      await deps.audit.log({
        actorId: 'anonymous',
        action: 'auth.login_failed',
        resourceType: 'staff',
        resourceId: staff?.id ?? 'unknown',
        changes: { reason: { from: null, to: staff ? 'inactive' : 'not_found' } }
      });
      throw new AuthError('نام کاربری یا رمز عبور اشتباه است');
    }

    const ok = await verifyPassword(body.password, staff.password_hash ?? '');
    if (!ok) {
      await recordLoginFailure(c.env.DB, identity);
      await recordLoginFailure(c.env.DB, ipKey);
      await deps.audit.log({
        actorId: staff.id,
        action: 'auth.login_failed',
        resourceType: 'staff',
        resourceId: staff.id,
        changes: { reason: { from: null, to: 'bad_password' } }
      });
      throw new AuthError('نام کاربری یا رمز عبور اشتباه است');
    }

    await clearThrottle(c.env.DB, identity);

    if (staff.password_hash && isLegacyPasswordHash(staff.password_hash)) {
      try {
        const upgraded = await hashPassword(body.password);
        await c.env.DB.prepare('UPDATE staff SET password_hash = ? WHERE id = ?')
          .bind(upgraded, staff.id)
          .run();
        deps.logger.child('auth').info('login.password_upgraded', { staffId: staff.id });
      } catch (err) {
        deps.logger.child('auth').warn('login.password_upgrade_failed', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    const { token, expiresAt } = await signSessionJwt(
      { id: staff.id, fullName: staff.full_name, role: staff.role, email: staff.email },
      await resolveSessionSecret(c.env)
    );

    await deps.audit.log({
      actorId: staff.id,
      action: 'auth.login',
      resourceType: 'staff',
      resourceId: staff.id
    });

    deps.logger.child('auth').info('login.ok', { role: staff.role });

    return c.json(
      {
        data: {
          token,
          expiresAt,
          staff: {
            id: staff.id,
            fullName: staff.full_name,
            role: staff.role,
            username: staff.username,
            email: staff.email
          }
        }
      },
      200
    );
  });

}

// بستن حلقهٔ خروج: لاگین رویداد ممیزی داشت ولی خروج stub بی‌اثر بود. این روت بعد از
// authMiddleware/supervisorGate در api-routing سوار می‌شود: کاربر احرازشده رویداد «auth.logout» می‌سازد،
// ناشناس ۴۰۱ می‌گیرد (کلاینت محلی پاک می‌کند و نمی‌سوزد) و ناظر طبق از گیت رد می‌شود.
// توکن JWT بی‌حالت است — ابطال سمت‌سرورِ توکن بیرون‌رفته مایگریشن ابطال می‌خواهد و مایلستون خودش را.
export function registerLogoutRoute(app: AppHono, deps: AuthRoutesDeps): void {
  app.post('/api/auth/logout', async (c) => {
    const ctx = getAuthContext(c);
    await deps.audit.log({
      actorId: ctx.staffId,
      action: 'auth.logout',
      resourceType: 'staff',
      resourceId: ctx.staffId
    });
    deps.logger.child('auth').info('logout.ok', { role: ctx.role });
    return c.json({ data: { ok: true } }, 200);
  });
}
