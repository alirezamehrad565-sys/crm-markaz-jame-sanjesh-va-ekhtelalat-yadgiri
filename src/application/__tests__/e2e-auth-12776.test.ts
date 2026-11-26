/**
 * e2e امنیتی ۱.۲۷.۷۶ (sdt153) — بستن دو یافتهٔ ممیزی روی مسیر واقعی API:
 * ① security-002: هدر X-Dev-Staff-Id حتی در ENV=development وقتی DEV_IMPERSONATION تنظیم
 *    نشده باشد impersonation نمی‌کند (اپ جدا با devImpersonation:false).
 * ② security-003: توکن امضاشده با راز مشترک ولی sid نشستِ کاربر دیگر (اتصال sid↔sub) رد می‌شود.
 * ③ security-004: deactivate/activate دانش‌آموز برای درمانگر ۴۰۳ می‌دهد (مدیر/منشی مجاز).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { DEV_AUTH_SECRET, signSessionJwt } from '@core/auth';
import { createTestApp, Api, asRole, loginToken, createStudent, ALI_ID, MANAGER_ID } from '../../test/harness';
import type { TestApp } from '../../test/harness';

describe('impersonation dev — بسته با نبودن DEV_IMPERSONATION (SEC-12776)', () => {
  let A: TestApp;
  beforeAll(() => {
    A = createTestApp(undefined, { devImpersonation: false });
  });

  it('هدر X-Dev-Staff-Id به authContext نمی‌رسد — ۴۰۱ توکن دسترسی موجود نیست', async () => {
    const res = await A.app.request(
      '/api/students',
      { headers: { 'X-Dev-Staff-Id': MANAGER_ID } },
      A.env as never
    );
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).toContain('توکن دسترسی موجود نیست');
  });

  it('همان درخواست در اپ پیش‌فرض هارنس (DEV_IMPERSONATION=1) impersonation می‌کند', async () => {
    const B = createTestApp();
    const res = await B.app.request(
      '/api/students',
      { headers: { 'X-Dev-Staff-Id': MANAGER_ID } },
      B.env as never
    );
    expect(res.status).toBe(200);
  });
});

describe('اتصال sid↔sub — توکن امضاشده با نشست کاربر دیگر (SEC-12776)', () => {
  it('۴۰۱ «نشست به کاربر دیگری تعلق دارد»', async () => {
    const A = createTestApp();
    const token = await loginToken(A, 'manager');
    const payloadB64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4))) as { sid: string };
    // توکن معتبرِ امضاشده با همان راز، ولی sub = علی با sid نشستِ مدیر
    const forged = (
      await signSessionJwt(
        { id: ALI_ID, fullName: 'علی', role: 'therapist', email: 'ali@test.example.com' },
        DEV_AUTH_SECRET,
        { sid: payload.sid }
      )
    ).token;
    const api = new Api(A).withToken(forged);
    const res = await api.get('/api/students');
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).toContain('تعلق دارد');
  });

  it('توکن سالمِ همان نشست پاس می‌کند (کنترل مثبت)', async () => {
    const A = createTestApp();
    const api = new Api(A).withToken(await loginToken(A, 'manager'));
    const res = await api.get('/api/students');
    expect(res.status).toBe(200);
  });
});

describe('گیت نقش دانش‌آموز (SEC-12776)', () => {
  it('deactivate برای درمانگر ۴۰۳ و برای مدیر ۲۰۰ است', async () => {
    const A = createTestApp();
    const manager = await asRole(A, 'manager');
    const created = await createStudent(manager);
    const therapist = await asRole(A, 'therapist');
    const denied = await therapist.post(`/api/students/${created.id}/deactivate`);
    expect(denied.status).toBe(403);
    const allowed = await manager.post(`/api/students/${created.id}/deactivate`);
    expect(allowed.status).toBe(200);
    const reactivated = await manager.post(`/api/students/${created.id}/activate`);
    expect(reactivated.status).toBe(200);
  });

  it('setup/complete برای درمانگر ۴۰۳ می‌دهد (فقط manager)', async () => {
    const A = createTestApp();
    const therapist = await asRole(A, 'therapist');
    const denied = await therapist.post('/api/setup/complete', { close_demo: false });
    expect(denied.status).toBe(403);
  });
});
