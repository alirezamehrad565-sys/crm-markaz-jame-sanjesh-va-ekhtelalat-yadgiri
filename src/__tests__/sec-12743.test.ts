/**
 * گیت امنیتی ۱.۲۷.۴۳ — حاصل ممیزی نشتی‌ها (scripts/sec-audit.mjs)
 *
 * پین‌های پایدار یافته‌های رفع‌شده تا رگرسیون نشت کند:
 * ① هیچ راز جایگزین ثابتی در کد اجرایی نیست ('insecure-dev-secret' و هم‌خانواده‌ها)
 * ② سکرت وبهوک با مقایسهٔ هم‌زمان‌ایمن (timingSafeEqualStr) و پشتیبانی هدر استاندارد
 * ③ جاسازی JSON در <script> صفحات عمومی با گریز </ و U+2028/2029 (الگوی safeJsonEmbed)
 * ④ بدنهٔ POST مسیرهای پیش‌نمایش عمومی سقف حجم دارد و پیش از هر خواندنی بررسی می‌شود
 * ⑤ لینک‌های دعوت با توکن در URL فقط با نشانگر __SEC_ACCEPT__ (magic-link تصادفی + انقضا)
 * ⑥ اسکنر نشتی در مخزن حاضر و پایدار است
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت امنیتی ۱.۲۷.۴۳ — نشتی راز', () => {
  it('بدنهٔ اجرایی هیچ راز جایگزین ثابتی ندارد', () => {
    const files = [
      'src/application/api-routing/index.ts',
      'src/index.ts',
      'src/core/auth/index.ts',
      'worker/entry.js'
    ];
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/insecure-dev-secret|change-me|default-secret|secret123/);
    }
  });

  it('راز دانلود بدون تنظیم سرور، تصادفیِ هر بوت است — نه رشتهٔ شناخته‌شده', () => {
    const src = read('src/application/api-routing/index.ts');
    expect(src).toMatch(/downloadSecret: deps\.downloadSecret \?\? deps\.webhookSecret \?\? \(crypto\.randomUUID\(\) \+ crypto\.randomUUID\(\)\)/);
  });

  it('سکرت وبهوک با مقایسهٔ هم‌زمان‌ایمن + هدر استاندارد', () => {
    expect(read('src/core/security/timing.ts')).toContain('timingSafeEqualStr');
    const svc = read('src/application/notify/service.ts');
    expect(svc).toContain('async isWebhookSecretValid');
    expect(svc).toContain('timingSafeEqualStr(secret, deps.webhookSecret)');
    const routes = read('src/application/notify/routes.ts');
    expect(routes).toContain("x-telegram-bot-api-secret-token");
    expect(routes).toMatch(/await service\.isWebhookSecretValid/);
  });
});

describe('گیت امنیتی ۱.۲۷.۴۳ — جاسازی اسکریپت و بدنهٔ عمومی', () => {
  it('صفحهٔ پیش‌نمایش فرم‌ساز JSON را با گریز </ جاسازی می‌کند', () => {
    const src = read('src/domain/case-events/preview-form.ts');
    expect(src).toMatch(/JSON\.stringify\(token\)\.replace\(\/</g);
    expect(src).toMatch(/JSON\.stringify\(JSON\.stringify\(def\)\)\.replace\(\/</g);
  });

  it('فرم عمومی منتشرشده هم‌چنان از safeJsonEmbed استفاده می‌کند (رگرسیون XSS نمی‌خورد)', () => {
    const src = read('src/domain/form-builder/form-page.ts');
    expect(src).toContain('function safeJsonEmbed');
    expect(src).toContain('window.__FORM__=${safeJsonEmbed(payload)}');
  });

  it('مسیرهای عمومی پیش‌نمایش: سقف ۵۱۲ کیلوبایت پیش از هر خواندنی بدنه', () => {
    const src = read('src/domain/case-events/routes.ts');
    expect(src).toContain('PREVIEW_BODY_MAX_BYTES = 512 * 1024');
    expect(src).toMatch(/previewBodyTooLarge\(c\)/);
    // ترتیب: گیت حجم پیش از هر c.req.json/formData در مسیر preview
    const previewBlock = src.slice(src.indexOf("app.post('/public/case-events/preview'"), src.indexOf("app.post('/public/case-events/preview/analyze'"));
    expect(previewBlock.indexOf('previewBodyTooLarge(c)')).toBeGreaterThan(-1);
    expect(previewBlock.indexOf('previewBodyTooLarge(c)')).toBeLessThan(previewBlock.indexOf('c.req.json'));
  });

  it('توکن‌های در-URL فقط با نشانگر پذیرش مستند (magic-link/HMAC با انقضا) مجازند', () => {
    const ce = read('src/domain/case-events/service.ts');
    expect(ce.match(/__SEC_ACCEPT__/g)?.length).toBe(3);
    expect(read('src/domain/exercise-bank/service.ts')).toMatch(/mintDownloadToken[\s\S]{0,400}__SEC_ACCEPT__/);
    // توکن دعوت تصادفیِ قوی است (UUID) و انقضا دارد
    expect(ce).toContain('fillToken = crypto.randomUUID()');
    expect(ce).toContain('fillExpiresAt');
  });
});

describe('گیت امنیتی ۱.۲۷.۴۳ — اسکنر پایدار', () => {
  it('اسکنر نشتی در scripts/ حاضر و خود-آگاه است', () => {
    const scanner = read('scripts/sec-audit.mjs');
    expect(scanner).toContain('S1 رازِ هاردکد');
    expect(scanner).toContain('const SELF =');
    expect(scanner).toContain('__SEC_ACCEPT__');
  });
});
