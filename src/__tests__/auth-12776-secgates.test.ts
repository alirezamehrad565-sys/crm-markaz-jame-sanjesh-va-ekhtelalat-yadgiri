/**
 * گیت ۱.۲۷.۷۶ (sdt153) — موج اصلاح امنیتی از ممیزی project-context:
 * ① security-002: impersonation dev دوبُعدی شد (ENV=development + DEV_IMPERSONATION=1 از .dev.vars).
 * ② security-003: اتصال sid↔sub در middleware + fail-closed راز نشست تولید (ساخت بی‌سروصدا حذف).
 * ③ security-004: گیت نقش روی students create/patch/deactivate/activate و setup/complete.
 * ④ testing-006: شش گیت سندشده اکنون در CI سیم هستند.
 * ⑤ testing-001: تست verifyAccessToken (سنجش با گیت اجرایی جداگانهٔ cf-access-jwt.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت امنیتی ۱.۲۷.۷۶', () => {
  const middleware = read('src/core/auth/middleware.ts');
  const secret = read('src/core/auth/runtime-secret.ts');
  const authIndex = read('src/core/auth/index.ts');
  const studentRoutes = read('src/domain/student-profile/routes.ts');
  const setupRoutes = read('src/application/setup/routes.ts');
  const ci = read('.github/workflows/ci.yml');
  const harness = read('src/test/harness.ts');
  const varsExample = read('.dev.vars.example');

  it('① impersonation دوبعدی: ENV + DEV_IMPERSONATION', () => {
    expect(middleware).toContain("env.ENV === 'development' && env.DEV_IMPERSONATION === '1'");
    expect(harness).toContain('DEV_IMPERSONATION');
    expect(varsExample).toContain('DEV_IMPERSONATION=1');
  });

  it('② اتصال sid↔sub + fail-closed راز تولید', () => {
    expect(middleware).toContain('staff_id FROM auth_sessions WHERE sid = ?');
    expect(middleware).toContain('session.staff_id !== payload.sub');
    expect(secret).toContain('npx wrangler secret put AUTH_SECRET');
    expect(secret).not.toContain('getOrCreateRuntimeSecret');
    expect(authIndex).not.toContain('getOrCreateRuntimeSecret');
  });

  it('③ گیت نقش روی روت‌های نوشتنی دانش‌آموز و setup/complete', () => {
    expect(studentRoutes).toContain("app.post('/api/students', requireRole('manager', 'secretary', 'therapist')");
    expect(studentRoutes).toContain("app.patch('/api/students/:id', requireRole('manager', 'secretary', 'therapist')");
    expect(studentRoutes).toContain("app.post('/api/students/:id/deactivate', requireRole('manager', 'secretary')");
    expect(studentRoutes).toContain("app.post('/api/students/:id/activate', requireRole('manager', 'secretary')");
    expect(setupRoutes).toContain("app.post('/api/setup/complete', requireRole('manager')");
  });

  it('④ شش گیت سندشده در CI سیم شده‌اند', () => {
    expect(ci).toContain('node scripts/complexity-bench.mjs --gate');
    expect(ci).toContain('node scripts/ui-voice-check.mjs');
    expect(ci).toContain('node scripts/contrast-check.mjs');
    expect(ci).toContain('node scripts/sec-audit.mjs');
    expect(ci).toContain('node scripts/games-bundle-smoke.mjs');
    expect(ci).toContain('npm run desktop:check');
  });
});
