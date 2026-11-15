// آزمون‌های فرانتِ پایانهٔ قابلیت‌های موتور (۱.۲۷.۱۳ — P0-1 سند ممیزی §۱):
// استخراج نسخه از پاکت capabilities (تابع خالص) + پین‌های سیم‌کشی reload در health-panel.js
// الگوی آزمون‌های front-*: import از فایل .js فرانت با @ts-ignore تک‌خطی + پین سورس
// @ts-ignore — فایل .js فرانت، خارج از include تایپ‌اسکریپت است (import تک‌خطی تا @ts-ignore نشتی را بپوشاند)
import { engineCapabilitiesVersionView } from '../../public/assets/js/views/health-panel.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(import.meta.dirname, '../../public/assets/js/views/health-panel.js'), 'utf8');

describe('پایانهٔ قابلیت‌های موتور — استخراج نسخه (تابع خالص)', () => {
  it('پاکت معلوم {ok:true, version} → نسخه', () => {
    expect(engineCapabilitiesVersionView({ ok: true, version: '1.27.13' })).toBe('1.27.13');
    expect(engineCapabilitiesVersionView({ ok: true, version: ' ۱.۲۷.۱۳ ' })).toBe('۱.۲۷.۱۳');
  });

  it('پاکت ناآشنا/خرابی/کوتاه → null — پنل هرگز نمی‌شکند', () => {
    expect(engineCapabilitiesVersionView(null)).toBe(null);
    expect(engineCapabilitiesVersionView(undefined)).toBe(null);
    expect(engineCapabilitiesVersionView({})).toBe(null);
    expect(engineCapabilitiesVersionView({ ok: false, version: '1.27.13' })).toBe(null);
    expect(engineCapabilitiesVersionView({ ok: true, version: '' })).toBe(null);
    expect(engineCapabilitiesVersionView({ ok: true, version: '   ' })).toBe(null);
    expect(engineCapabilitiesVersionView({ ok: true })).toBe(null);
    expect(engineCapabilitiesVersionView('1.27.13')).toBe(null);
  });
});

describe('پین‌های سیم‌کشی reload در health-panel.js', () => {
  it('فراخوانی عمومی پایانه در Promise.allSettled ثبت است', () => {
    expect(SRC).toMatch(/api\.get\('\/api\/engine\/capabilities'\)/);
  });

  it('اولویت نسخه: capabilities ← panel ← feed — هر سه منبع در زنجیرهٔ engineVersionText', () => {
    expect(SRC).toMatch(/engineCapabilitiesVersionView\(caps\)/);
    expect(SRC).toMatch(/capsOut\.status === 'fulfilled'/);
  });
});
