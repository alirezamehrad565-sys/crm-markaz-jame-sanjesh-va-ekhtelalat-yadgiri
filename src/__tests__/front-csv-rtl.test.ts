// آزمون‌های خروجی CSV راست‌چین (۱.۲۷.۱۴ — خواست کارفرما):
// helper خالص csv-rtl.js (RLM روی متن / عدد بدون RLM / نقل‌قول) + پین‌های سیم‌کشی
// سه خروجی (سنجش روزانه، گزارش دورهٔ پیشرفته، حضور همکاران) + ستون «جزئیات» آخرِ جدول
// @ts-ignore — فایل .js فرانت، خارج از include تایپ‌اسکریپت است (import تک‌خطی تا @ts-ignore نشتی را بپوشاند)
import { csvCell, csvRow, csvTable } from '../../public/assets/js/csv-rtl.js';
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

describe('csvTable — جدول هم‌عرض (۱.۲۷.۱۵ خواست کارفرما: عرض هر ستون = بزرگ‌ترین دادهٔ همان ستون)', () => {
  it('پرکردن هر خانه تا عرض ستون؛ RLM در عرض شمرده نمی‌شود؛ عدد هم تراز می‌شود', () => {
    const out = csvTable([['نام', 'مدت'], ['علی رضایی', 45], ['مریم', 120]]);
    expect(out[0]).toBe(`${RLM}نام${' '.repeat(6)},${RLM}مدت`);
    expect(out[1]).toBe(`${RLM}علی رضایی,45 `);
    expect(out[2]).toBe(`${RLM}مریم${' '.repeat(5)},120`);
  });

  it('ردیف کم‌ستون با خانهٔ خالیِ هم‌عرض کامل می‌شود (همهٔ ردیف‌ها یک عرض)', () => {
    const out = csvTable([['الف', 'ب'], ['یک', 'دو'], ['سه']]);
    expect(out[0]).toBe(`${RLM}الف,${RLM}ب `);
    expect(out[1]).toBe(`${RLM}یک ,${RLM}دو`);
    expect(out[2]).toBe(`${RLM}سه ,  `);
  });

  it('نقل‌قول نیاز هم‌چنان رعایت می‌شود (کاما داخل خانهٔ پددار)', () => {
    const out = csvTable([['الف'], ['دارای, کاما']]);
    expect(out[1]).toBe(`"${RLM}دارای, کاما"`);
  });
});

describe('پین‌های سیم‌کشی خروجی‌های CSV', () => {
  it('سنجش روزانه (screening.js): ستون «جزئیات» آخرِ CSV و جدول روی صفحه + جدول هم‌عرض (۱.۲۷.۱۵)', () => {
    const src = read('public/assets/js/views/screening.js');
    /* testing-002: پین مکانیک import (`from '../csv-rtl.js'`) آرایشی است — مصرفِ helperها با پین‌های پایین‌تر گرفته می‌شود */
    expect(src).toMatch(/downloadCsv\(`sanjesh-/);
    expect(src).toMatch(/csvTable\(\[/);
    // ستون جزئیات در CSV — بعد از همهٔ ستون‌های برچسب
    expect(src).toMatch(/\.\.\.tagColumns,\s*\n?\s*'جزئیات'/);
    // ستون جزئیات در جدول صفحه (آخرین ستون buildEntriesTable) — بدون پینِ مارکر کامنت
    expect(src).toMatch(/label: 'جزئیات'/);
  });

  it('گزارش مدیر (reports.js): هر دو خروجی تحلیل پیشرفته و حضور همکاران از csv-rtl می‌روند + جدول هم‌عرض', () => {
    const src = read('public/assets/js/views/reports.js');
    expect(src).toMatch(/downloadCsv\(`advanced-report-/);
    expect(src).toMatch(/downloadCsv\(`staff-attendance-/);
    expect(src).toMatch(/csvRow\(\['# روند هفتگی'\]\)/);
    expect(src).toMatch(/csvTable\(\[/);
    // Blob دستی قدیمی نباید مانده باشد — همه از helper می‌روند
    expect(src).not.toMatch(/new Blob\(\['\\uFEFF'/);
  });

  it('تقویم (appointments.js): بلوک سنجش سیم است — سایهٔ گرید + گارد سلول/درگ/فرم بر پایهٔ درمانگرِ درگیر + مودال مدیر', () => {
    const src = read('public/assets/js/views/appointments.js');
    expect(src).toMatch(/api\.get\('\/api\/assessment-blocks'\)/);
    expect(src).toMatch(/openAssessmentBlockModal/);
    expect(src).toMatch(/isBlockedMinute\(ymd, m, state\.staffFilter\)/);
    expect(src).toMatch(/isBlockedMinute\(ymd, m, values\.staff_id\)/);
    expect(src).toMatch(/staffId: a\.staffId/);
    expect(src).toMatch(/api\.post\('\/api\/assessment-blocks'/);
    expect(src).toMatch(/'نوبت سنجش'/);
  });

  it('CSS گرید: سایهٔ کهربایی .grid-assess تعریف شده است', () => {
    const css = read('public/assets/css/views.css');
    expect(css).toMatch(/\.grid-assess \{/);
  });
});
