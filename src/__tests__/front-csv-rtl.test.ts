// آزمون‌های خروجی CSV راست‌چین (۱.۲۷.۱۴ — خواست کارفرما):
// helper خالص csv-rtl.js (RLM روی متن / عدد بدون RLM / نقل‌قول) + پین‌های سیم‌کشی
// سه خروجی (سنجش روزانه، گزارش دورهٔ پیشرفته، حضور همکاران) + ستون «جزئیات» آخرِ جدول
// @ts-ignore — فایل .js فرانت، خارج از include تایپ‌اسکریپت است (import تک‌خطی تا @ts-ignore نشتی را بپوشاند)
import { csvCell, csvRow } from '../../public/assets/js/csv-rtl.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RLM = '\u200F';
const ROOT = join(import.meta.dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('csv-rtl — سلول و ردیف (تابع خالص)', () => {
  it('متن فارسی/مختلط → پیشوند RLM؛ خالی → خالی', () => {
    expect(csvCell('علی رضایی')).toBe(RLM + 'علی رضایی');
    expect(csvCell('2026-10-12 (نکته)')).toBe(RLM + '2026-10-12 (نکته)');
    expect(csvCell('')).toBe('');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(NaN)).toBe('');
  });

  it('عدد (number یا رشتهٔ عددی خالص) → بدون RLM تا اکسل عدد ببیند', () => {
    expect(csvCell(42)).toBe('42');
    expect(csvCell(-3.5)).toBe('-3.5');
    expect(csvCell('120')).toBe('120');
    expect(csvCell('1200.5')).toBe('1200.5');
  });

  it('csvRow: سلول‌های نقل‌قول‌دار با ویرگول/کوتیشن/خط جدید', () => {
    expect(csvRow(['علی', 45, ''])).toBe(`${RLM}علی,45,`);
    expect(csvRow(['دارای, ویرگول'])).toBe(`"${RLM}دارای, ویرگول"`); // کامای ASCII نیازمند نقل‌قول
    expect(csvRow(['او گفت "سلام"'])).toBe(`"${RLM}او گفت ""سلام"""`);
    expect(csvRow(['دو\nسطر'])).toBe(`"${RLM}دو\nسطر"`);
  });
});

describe('پین‌های سیم‌کشی خروجی‌های CSV', () => {
  it('سنجش روزانه (screening.js): ستون «جزئیات» آخرِ CSV و جدول روی صفحه', () => {
    const src = read('public/assets/js/views/screening.js');
    expect(src).toMatch(/from '\.\.\/csv-rtl\.js'/);
    expect(src).toMatch(/downloadCsv\(`sanjesh-/);
    // ستون جزئیات در CSV — بعد از همهٔ ستون‌های برچسب
    expect(src).toMatch(/\.\.\.tagColumns,\s*\n?\s*'جزئیات'/);
    // ستون جزئیات در جدول صفحه (آخرین ستون buildEntriesTable)
    expect(src).toMatch(/label: 'جزئیات', \/\* ۱\.۲۷\.۱۴/);
  });

  it('گزارش مدیر (reports.js): هر دو خروجی تحلیل پیشرفته و حضور همکاران از csv-rtl می‌روند', () => {
    const src = read('public/assets/js/views/reports.js');
    expect(src).toMatch(/from '\.\.\/csv-rtl\.js'/);
    expect(src).toMatch(/downloadCsv\(`advanced-report-/);
    expect(src).toMatch(/downloadCsv\(`staff-attendance-/);
    expect(src).toMatch(/csvRow\(\['# روند هفتگی'\]\)/);
    // Blob دستی قدیمی نباید مانده باشد — همه از helper می‌روند
    expect(src).not.toMatch(/new Blob\(\['\\uFEFF'/);
  });

  it('تقویم (appointments.js): بلوک سنجش سیم است — سایهٔ گرید + گارد سلول + مودال مدیر', () => {
    const src = read('public/assets/js/views/appointments.js');
    expect(src).toMatch(/api\.get\('\/api\/assessment-blocks'\)/);
    expect(src).toMatch(/openAssessmentBlockModal/);
    expect(src).toMatch(/isBlockedMinute\(ymd, m\)/);
    expect(src).toMatch(/api\.post\('\/api\/assessment-blocks'/);
    expect(src).toMatch(/'نوبت سنجش'/);
  });

  it('CSS گرید: سایهٔ کهربایی .grid-assess تعریف شده است', () => {
    const css = read('public/assets/css/views.css');
    expect(css).toMatch(/\.grid-assess \{/);
  });
});
