/**
 * گیت B1 (front-12801) — سخت‌سازی صفحهٔ ورود و بوت (ممیزی امنیتی/UX):
 * ① ۴۲۹ استاندارد: errorHandler هدر Retry-After را برای RateLimitError ست می‌کند —
 *    قبلاً فقط details در بدنه بود و throttle صفحهٔ ورود هدر را ست نمی‌کرد.
 * ② بوت روی ۴۰۱/۴۰۳ پیش از رندر صفحهٔ ورود clearSession می‌زند — هدر X-Dev-Staff-Id
 *    فاسد دوباره فرستاده نمی‌شود.
 * ③ قفل مشغولی دکمهٔ ورود با dataset.busy + aria-busy (هم‌الگوی ui.lockBtn) —
 *    دوبارکلیک/دوبار Enter فراخوانی دوم را نمی‌گذرد.
 * ④ کلید نمایش رمز: aria-pressed دوسویه + aria-label «نمایش رمز»/«پنهان‌سازی رمز» —
 *    type ورودی بین password/text می‌چرخد و dir=ltr دست نمی‌خورد.
 * ⑤ برچسب شمارش معکوس فارسی روی دکمهٔ ورود پس از ۴۲۹-with-retry-after (api.js بازهٔ
 *    را از هدر Retry-After یا details.retryAfterSeconds روی خطا می‌گذارد).
 * ⑥ خطای بوت غیر-احرازی (۵۰۰/شبکه): کارت «ارتباط با سرور برقرار نشد» + «تلاش دوباره» —
 *    پوستهٔ مرده نمی‌ماند. کد مردهٔ cs.loginOk و export بی‌مصرف { submit } حذف شده‌اند.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت B1 — سخت‌سازی صفحهٔ ورود (front-12801)', () => {
  const login = read('public/assets/js/login.js');
  const app = read('public/assets/js/app.js');
  const api = read('public/assets/js/api.js');
  const errorHandler = read('src/application/http/error-handler.ts');

  it('① هدر Retry-After برای RateLimitError ست می‌شود', () => {
    expect(errorHandler).toContain("if (err instanceof RateLimitError) c.header('Retry-After', String(err.retryAfterSeconds));");
  });

  it('② روی ۴۰۱/۴۰۳ بوت، clearSession پیش از رندر صفحهٔ ورود می‌آید', () => {
    const idx401 = app.indexOf("if (err.status === 401 || err.status === 403) {");
    expect(idx401).toBeGreaterThan(-1);
    const idxClear = app.indexOf('clearSession();', idx401);
    expect(idxClear).toBeGreaterThan(-1);
    // پاک‌سازی نشست فاسد پیش از هر چیز دیگر در شاخهٔ ۴۰۱
    expect(app.slice(idx401, idxClear)).not.toContain('renderLoginPage');
  });

  it('③ قفل مشغولی دکمهٔ ورود: dataset.busy + aria-busy', () => {
    expect(login).toContain("btn.dataset.busy === '1'"); // گارد دوبارسپاری (الگوی ui.lockBtn)
    expect(login).toContain("btn.setAttribute('aria-busy', 'true')");
    expect(login).toContain('delete btn.dataset.busy');
  });

  it('④ کلید نمایش رمز: aria-pressed دوسویه + تغییر type', () => {
    expect(login).toContain("'aria-pressed'");
    expect(login).toContain('نمایش رمز');
    expect(login).toContain('پنهان‌سازی رمز');
    expect(login).toContain("passInput.type = show ? 'text' : 'password'");
    expect(login).toContain("class: 'btn btn--ghost btn--icon login__eye'");
    expect(login).toContain("class: 'login__pass-wrap'");
  });

  it('⑤ برچسب شمارش معکوس ۴۲۹ فارسی است و از بازهٔ خطا تغذیه می‌شود', () => {
    expect(login).toContain('تلاش مجدد پس از');
    expect(login).toContain('fa(remaining)');
    expect(api).toContain('err.retryAfterSeconds = waitS'); // api.js بازهٔ را روی خطا می‌گذارد
    expect(api).toContain("res.headers.get('retry-after')");
  });

  it('⑥ خطای بوت غیر-احرازی: کارت خطا + تلاش دوباره (بدون پوستهٔ مرده)', () => {
    expect(app).toContain('renderBootError');
    expect(app).toContain('ERROR_TEXT.NETWORK');
    expect(app).toContain('تلاش دوباره');
    expect(api).toContain('ارتباط با سرور برقرار نشد');
  });

  it('⑦ کد مرده حذف شده: cs.loginOk نوشته نمی‌شود و export بی‌مصرف { submit } نیست', () => {
    expect(login).not.toContain('cs.loginOk');
    expect(login).not.toContain('sessionStorage.setItem');
    expect(login).not.toContain('return { submit }');
    // onSuccess پیش از reload فقط وضعیت می‌گذارد — بدون toast و بازسازی منو (reload همه را دور می‌ریخت)
    expect(app).not.toContain('خوش آمدید');
  });
});
