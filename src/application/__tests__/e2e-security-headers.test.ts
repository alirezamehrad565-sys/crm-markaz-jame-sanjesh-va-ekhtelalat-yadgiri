/**
 * تست‌های e2e — security-headers
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-security-headers.test.ts — هدرهای امنیتی سراسری + سیاست کش مسیرهای عمومی
// همهٔ درخواست‌ها از روی اپ واقعی Hono می‌گذرند؛ هدرها مستقیم از Response خوانده می‌شوند.

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api } from '../../test/harness';

/** درخواست خام به اپ واقعی — برای خواندن همهٔ هدرهای پاسخ */
async function rawRequest(A: ReturnType<typeof createTestApp>, url: string): Promise<Response> {
  const fakeCtx = {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined
  } as unknown as ExecutionContext;
  return A.app.request(url, { method: 'GET' }, A.env as never, fakeCtx);
}

describe('هدرهای امنیتی سراسری (Worker)', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    A = createTestApp();
  });

  it('پاسخ /api/* (۴۰۱ بدون توکن) — هر ۶ هدر امنیتی حاضر است', async () => {
    const res = await rawRequest(A, '/api/me');
    expect(res.status).toBe(401);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('پاسخ /api/* موفق (۲۰۰) — Cache-Control: no-store روی مسیر لاگین', async () => {
    const api = new Api(A);
    const login = await api.post('/api/auth/login', { username: 'manager', password: '1234' });
    expect(login.status).toBe(200);
    // login از همان خط لولهٔ /api/* می‌گذرد → no-store
    expect(login.cacheControl).toBe('no-store');
  });

  it('مسیر ناشناختهٔ API (۴۰۱ — احراز قبل از ۴۰۴) — هدرهای امنیتی حاضرند', async () => {
    // /api/* ناشناخته اول ۴۰۱ می‌گیرد (وجود/نبود مسیر فاش نمی‌شود) — رفتار درست
    const res = await rawRequest(A, '/api/no-such-route');
    expect(res.status).toBe(401);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('مسیر ناشناختهٔ غیر-API (۴۰۴ JSON از notFound) — هدرهای امنیتی حاضرند', async () => {
    const res = await rawRequest(A, '/no-such-page');
    expect(res.status).toBe(404);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });
});

describe('سیاست کش مسیرهای عمومی', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    A = createTestApp();
  });

  it('GET /health — Cache-Control: no-store', async () => {
    const res = await rawRequest(A, '/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('GET /public/announcements — کش عمومی ۶۰ ثانیه‌ای + هدرهای امنیتی', async () => {
    const res = await rawRequest(A, '/public/announcements');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('GET /public/exercise-files/:id (توکن نامعتبر → ۴۰۴) — private, no-store (دادهٔ شخصی خانواده)', async () => {
    const res = await rawRequest(A, '/public/exercise-files/00000000-0000-0000-0000-0000000000ff?token=bad');
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
