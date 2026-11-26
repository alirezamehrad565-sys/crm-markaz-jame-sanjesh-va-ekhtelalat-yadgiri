/**
 * سفر ۲ — قرارداد امنیتی پاسخ‌های موتور محلی (۱.۲۷.۸۴)
 * همان گیت‌های csp/request-id که e2e-های سرویس پین کرده‌اند، این‌بار از بیرونِ مرورگر واقعی:
 * JSON API ها CSP سختگیرانه دارند، X-Request-Id روی خطا می‌نشیند و سلامت پاکت کامل می‌دهد.
 */
import { test, expect } from '@playwright/test';

test('۴۰۱ JSON با CSP سختگیرانه + X-Request-Id', async ({ request }) => {
  const res = await request.get('/api/me');
  expect(res.status()).toBe(401);
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(res.headers()['x-request-id']).toMatch(/^req-/);
  const body = (await res.json()) as { error?: string };
  expect(body.error).toBe('AUTH_ERROR'); // قرارداد واقعی پاکت ۴۰۱ (pin)
});

test('سلامت موتور: پاکت ok/نسخه/زمان سرور', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { ok: boolean; version: string; server_ts: string };
  expect(body.ok).toBe(true);
  expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(Number.isNaN(Date.parse(body.server_ts))).toBe(false);
});

test('صفحهٔ اپ تا فرم ورود بوت می‌شود و CSS خود را می‌گیرد', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  // فرم ورود رندرِ runtime است — منتظر بوت واقعی SPA می‌مانیم (نه متن شلِ ثابت)
  await expect(page.locator('#login-username')).toBeVisible({ timeout: 15_000 });
  const cssRes = await page.request.get('/assets/css/base.css');
  expect(cssRes.status()).toBe(200);
});
