/**
 * playwright.config — لایهٔ E2E مرورگری (۱.۲۷.۸۴ — ADR-021، تصمیم تأییدشدهٔ کارفرما)
 * موتور محلی واقعی (workerd + D1 موقت + seed نمایشی) سِروِر پیش‌آمادهٔ آزمون است؛
 * سه سفر واقعی: ورود تا داشبورد · قرارداد امنیتی پاسخ‌ها · سلامت.
 * این گیت در CI گره نخورده (نیاز به مرورگر نصب‌شده دارد): `npm run e2e:browser`.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/browser',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8791',
    ...devices['Desktop Chrome'],
    locale: 'fa-IR'
  },
  webServer: {
    command: 'node scripts/engine/engine.mjs --port 8791 --games-port 8792 --bind 127.0.0.1 --seed',
    url: 'http://127.0.0.1:8791/health',
    reuseExistingServer: true,
    timeout: 180_000
  }
});
