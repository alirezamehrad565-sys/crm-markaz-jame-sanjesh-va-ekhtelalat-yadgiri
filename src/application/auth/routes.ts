/**
 * ورود و نشست پنل — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// صفحه ورود با رمز: POST /api/auth/login
// خارج از authMiddleware رجیستر می‌شود (مثل /health و /public/announcements)
// جریان: username/password → verify (PBKDF2 یا legacy SHA-256) → JWT نشست (HS256, ۳۰ روز)
// ارتقای شفاف: هش legacy (SHA-256 بدون salt) در اولین ورود موفق به PBKDF2 ارتقا می‌یابد
// هم‌سنگ باندل زنده: throttle ورود (۵ تلاش ناموفق در ۱۵ دقیقه به‌ازای هر username)
// + کلید امضا از resolveSessionSecret (بدون fallback هاردکد در تولید)

import type { AppHono } from '@core/shared';
import { LoginSchema } from '@core/shared';
import { findStaffByUsername, signSessionJwt, verifyPassword, hashPassword, isLegacyPasswordHash, resolveSessionSecret } from '@core/auth';
import { AuthError, RateLimitError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';

// ─── پارامترهای throttle ورود (هم‌نام باندل زنده) ───
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_WINDOW_MS = LOGIN_WINDOW_MINUTES * 60 * 1000;

function windowFloorIso(): string {
  return new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
}

/** ثانیه‌های باقی‌ماندهٔ قفل — ۰ یعنی قفل نیست */
async function throttleRemainingSeconds(db: D1Database, identity: string): Promise<number> {
  const row = await db
    .prepare('SELECT fail_count, window_start FROM login_throttle WHERE identity = ? LIMIT 1')
    .bind(identity)
    .first<{ fail_count: number; window_start: string }>();
  if (!row) return 0;
  const started = Date.parse(row.window_start);
  if (!Number.isFinite(started)) return 0;
  const elapsed = Date.now() - started;
  if (elapsed >= LOGIN_WINDOW_MS) return 0;
  if (row.fail_count < LOGIN_MAX_FAILURES) return 0;
  return Math.max(1, Math.ceil((LOGIN_WINDOW_MS - elapsed) / 1000));
}

/** ثبت تلاش ناموفق — پنجرهٔ لغزان ۱۵ دقیقه‌ای به‌ازای identity (upsert) */
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

/** پاک‌سازی throttle پس از ورود موفق (و ردیف‌های منقضی — best-effort) */
async function clearThrottle(db: D1Database, identity: string): Promise<void> {
  try {
    await db.prepare('DELETE FROM login_throttle WHERE identity = ? OR window_start <= ?').bind(identity, windowFloorIso()).run();
  } catch {
    /* پاک‌سازی هرگز ورود موفق را شکست نمی‌دهد */
  }
}

export interface AuthRoutesDeps {
  audit: AuditWriter;
  logger: Logger;
}

export function registerAuthRoutes(app: AppHono, deps: AuthRoutesDeps): void {
  app.post('/api/auth/login', async (c) => {
    const body = LoginSchema.parse(await c.req.json<unknown>());

    // throttle ورود: قبل از هر کوئری staff (بدون نشت وجود/نبود کاربر)
    const identity = body.username.trim().toLowerCase();
    const blockedFor = await throttleRemainingSeconds(c.env.DB, identity);
    if (blockedFor > 0) {
      await deps.audit.log({
        actorId: 'anonymous',
        action: 'auth.login_throttled',
        resourceType: 'staff',
        resourceId: identity,
        changes: { retryAfterSeconds: { from: null, to: blockedFor } }
      });
      throw new RateLimitError(
        blockedFor,
        `تلاش‌های ناموفق بیش از حد مجاز است — ${Math.ceil(blockedFor / 60)} دقیقه دیگر دوباره تلاش کنید`
      );
    }

    const staff = await findStaffByUsername(c.env.DB, body.username);

    if (!staff || staff.active !== 1) {
      await recordLoginFailure(c.env.DB, identity);
      await deps.audit.log({
        actorId: 'anonymous',
        action: 'auth.login_failed',
        resourceType: 'staff',
        resourceId: staff?.id ?? 'unknown',
        changes: { reason: { from: null, to: staff ? 'inactive' : 'not_found' } }
      });
      // پیام عامدانه کلی — فاش کردن وجود/نبود کارمند لازم نیست
      throw new AuthError('نام کاربری یا رمز عبور اشتباه است');
    }

    const ok = await verifyPassword(body.password, staff.password_hash ?? '');
    if (!ok) {
      await recordLoginFailure(c.env.DB, identity);
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

    // ارتقای شفاف هش legacy → PBKDF2 (به‌محض اولین ورود موفق؛ best-effort)
    if (staff.password_hash && isLegacyPasswordHash(staff.password_hash)) {
      try {
        const upgraded = await hashPassword(body.password);
        await c.env.DB.prepare('UPDATE staff SET password_hash = ? WHERE id = ?')
          .bind(upgraded, staff.id)
          .run();
        deps.logger.child('auth').info('login.password_upgraded', { staffId: staff.id });
      } catch (err) {
        // ارتقا هرگز ورود را شکست نمی‌دهد — در ورود بعدی دوباره تلاش می‌شود
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

  // خروج سمت سرور معنای واقعی ندارد (توکن stateless است) — برای تقارن API نگه داشته شد
  app.post('/api/auth/logout', (c) => c.json({ data: { ok: true } }, 200));
}
