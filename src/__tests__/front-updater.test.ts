/**
 * آزمون کانال دستی OTA فاز D چهارگانهٔ دسکتاپ (server-cloud-update-design.md §۳-۱):
 * نگاشت پاسخ فرمان پوستهٔ check_updates → برچسب فارسی/کلاس رنگ/دکمهٔ دانلود —
 * تابع خالص بی‌DOM (الگوی front-sync-status.test.ts). قرارداد:
 * latest | available{version,notes} | error{message} | ورودی غایب/خراب → بی‌کرش.
 * قاعدهٔ سخت: دکمهٔ «دانلود نصاب از مرورگر» فقط در حالت available (هیچ دانلودی داخل اپ نیست).
 */
// @ts-ignore — فایل .js فرانت، خارج از include تایپ‌اسکریپت است (import تک‌خطی تا @ts-ignore نشتی را بپوشاند)
import { updateCheckView } from '../../public/assets/js/views/health-panel.js';

describe('فاز D — نمای «بررسی نسخهٔ تازه» (updateCheckView)', () => {
  it('به‌روز → سبز بدون دکمهٔ دانلود', () => {
    expect(updateCheckView({ state: 'latest', current: '1.27.23' })).toMatchObject({
      badge: 'badge--success',
      download: false
    });
  });

  it('نسخهٔ تازه → کهربایی با نسخه + یادداشت + دکمهٔ دانلود', () => {
    const v = updateCheckView({ state: 'available', current: '1.27.23', version: '1.27.24', notes: 'رفع عیب نوبت سنجش' });
    expect(v.badge).toBe('badge--warning');
    expect(v.download).toBe(true);
    expect(v.label).toContain('1.27.24');
    expect(v.sub).toContain('رفع عیب');
  });

  it('خطای پوسته → خنثی با پیام فارسی، بی‌دانلود', () => {
    const v = updateCheckView({ state: 'error', message: 'بررسی نشد — آفلاین؟ بعداً دوباره' });
    expect(v.badge).toBe('badge--neutral');
    expect(v.download).toBe(false);
    expect(v.label).toContain('آفلاین');
  });

  it('ورودی غایب/خراب → بی‌کرش و نامشخص', () => {
    expect(updateCheckView(null).download).toBe(false);
    expect(updateCheckView(undefined).badge).toBe('badge--neutral');
    expect(updateCheckView({}).label).toBeTruthy();
    expect(updateCheckView('garbage').badge).toBe('badge--neutral');
    expect(updateCheckView(42).download).toBe(false);
  });

  it('یادداشت بلند → بریده‌شده تا سقف ۱۶۰ نویسه (حفظ چیدمان کارت)', () => {
    const v = updateCheckView({ state: 'available', version: '2.0.0', notes: 'x'.repeat(400) });
    expect((v.sub ?? '').length).toBeLessThanOrEqual(160);
  });
});
