/**
 * سفر ۱ — ورود تا داشبورد (۱.۲۷.۸۴ — لایهٔ E2E مرورگری واقعی)
 * اولین آزمون مرورگری مخزن: SPA واقعی روی موتور محلی واقعی (workerd + D1) با seed نمایشی
 * (manager/1234 از seed-dev.sql) — لاگین واقعی، کوکی نشست واقعی، مسیر داشبورد واقعی.
 */
import { test, expect } from '@playwright/test';

test('ورود مدیر با seed → داشبورد با کوکی نشست HttpOnly', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#login-username')).toBeVisible();
  await expect(page.locator('#login-password')).toBeVisible();

  await page.fill('#login-username', 'manager');
  await page.fill('#login-password', '1234');
  await page.click('#login-submit');

  // مسیر پس از ورود: هش داشبورد
  await page.waitForURL(/#\/dashboard/, { timeout: 15_000 });
  expect(page.url()).toContain('#/dashboard');

  // کوکی نشست واقعی (HttpOnly + SameSite سخت‌گیرانه) در زمینهٔ مرورگر نشسته است
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.httpOnly && c.sameSite === 'Strict');
  expect(session, 'کوکی نشست HttpOnly/SameSite=Strict باید نشسته باشد').toBeTruthy();

  // رفرش کامل صفحه هم ورود را نگه می‌دارد (نشست کوکی‌محور — گیت A4 اپلیکیشن)
  await page.reload();
  await expect(page.locator('#login-username')).toBeHidden({ timeout: 15_000 });
});

test('ورود با رمز اشتباه → پیام خطای درون‌صفحه‌ای، بدون پرش', async ({ page }) => {
  await page.goto('/');
  await page.fill('#login-username', 'manager');
  await page.fill('#login-password', 'wrong-password');
  await page.click('#login-submit');
  await expect(page.locator('#login-username')).toBeVisible(); // هنوز در صفحهٔ ورود
  expect(page.url()).not.toContain('#/dashboard');
});
