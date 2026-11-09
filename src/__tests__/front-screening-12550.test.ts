/* گیت ۱.۲۵.۵۰ — سنجش روزانه: ① دو پنجرهٔ ثبت روزانه در دسکتاپ هم‌اندازه ② دو فیلد اختیاری زیر
   ثبت سریع (تاریخ تولد با تقویم جلالی + نمرهٔ آمادگی تحصیلی ۰..۱۰۰) ③ خروجی CSV گزارش مدیر
   به‌صورت جدول محوری — هر برچسب یک ستون مستقل. الگو: گیت‌های front-* موجود (پین ساختاری). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const JS = join(__dirname, '../../public/assets/js');
const CSS = join(__dirname, '../../public/assets/css');
const read = (p: string): string => readFileSync(p, 'utf8');

describe('گیت ۱.۲۵.۵۰ — هم‌اندازه‌شدن دو پنجرهٔ ثبت روزانه در دسکتاپ', () => {
  const css = read(join(CSS, 'components.css'));

  it('grid دسکتاپ دیگر ۵fr/۷fr نامتقارن نیست — دو ستون برابر', () => {
    expect(css).toMatch(/\.sanj-daily\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/@media \(min-width: 1080px\)\s*\{\s*\/\*[^*]*\*\/\s*\.sanj-daily\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)/);
    expect(css).not.toMatch(/5fr\)\s*minmax\(0,\s*7fr\)/);
  });
});

describe('گیت ۱.۲۵.۵۰ — دو فیلد اختیاری زیر ثبت سریع', () => {
  const screening = read(join(JS, 'views/screening.js'));

  it('تاریخ تولد با همان تقویم جلالی ماژول (jalaliDateInput) ساخته می‌شود', () => {
    expect(screening).toMatch(/const birthInput = jalaliDateInput\(\{ value: '' \}\)/);
    expect(screening).toMatch(/birthInput\.root/);
  });

  it('نمرهٔ آمادگی تحصیلی — عددی با سقف ۱۰۰ و کف صفر', () => {
    expect(screening).toMatch(/نمرهٔ آمادگی تحصیلی/);
    expect(screening).toMatch(/const readinessInput = el\('input', \{[^}]*type: 'number'[^}]*min: '0'[^}]*max: '100'/s);
  });

  it('اعتبارسنجی سمت کلاینت: عدد صحیح ۰..۱۰۰ — خارج از رنج ثبت نمی‌شود', () => {
    expect(screening).toMatch(/Number\.isInteger\(score\) \|\| score < 0 \|\| score > 100/);
    expect(screening).toMatch(/نمرهٔ آمادگی تحصیلی باید عددی بین ۰ تا ۱۰۰ باشد/);
  });

  it('بدنهٔ POST/PATCH هر دو فیلد را با قرارداد snake_case می‌فرستد', () => {
    expect(screening).toMatch(/birth_date: extra\.birthDate/);
    expect(screening).toMatch(/readiness_score: extra\.readinessScore/);
  });

  it('جریان ویرایش: بارگذاری مقادیر فعلی و خالی‌شدن در خروج از ویرایش و بعد از ثبت', () => {
    expect(screening).toMatch(/setExtraValues\(e\); \/\* ۱\.۲۵\.۵۰/);
    expect(screening).toMatch(/setExtraValues\(null\)/);
    expect(screening).toMatch(/birthInput\.getYmd\(\)/);
  });

  it('فیلدها در ردیف لیست فقط وقتی ثبت‌شده‌اند نمایش داده می‌شوند', () => {
    expect(screening).toMatch(/e\.birthDate \? ` • تولد \$\{formatJalaliNumeric\(e\.birthDate\)\}` : ''/);
    expect(screening).toMatch(/` • آمادگی \$\{fa\(e\.readinessScore\)\}`/);
  });
});

describe('گیت ۱.۲۵.۵۰ — CSV گزارش مدیر: هر برچسب یک ستون', () => {
  const screening = read(join(JS, 'views/screening.js'));

  it('ستون‌های برچسب از دادهٔ همان خروجی ساخته می‌شوند (ثابت‌ها اول، آزادها بعداً)', () => {
    expect(screening).toMatch(/PREDEFINED\.filter\(\(t\) => present\.has\(t\.label\)\)\.map\(\(t\) => t\.label\)/);
    expect(screening).toMatch(/\.filter\(\(t\) => !KIND_BY_LABEL\.has\(t\)\)/);
    expect(screening).toMatch(/counts\.get\(b\) \?\? 0\) - \(counts\.get\(a\)/);
  });

  it('سربرگ CSV: ستون‌های ثابت + تولد + آمادگی + پخش ستون‌های برچسب', () => {
    expect(screening).toMatch(/'تاریخ تولد',/);
    expect(screening).toMatch(/'نمره آمادگی تحصیلی',/);
    expect(screening).toMatch(/\.\.\.tagColumns/);
  });

  it('خانهٔ ستون هر برچسب: ✓ برای حضور، خالی برای نبود — ستون «برچسب‌ها»ی چسبان حذف شده', () => {
    expect(screening).toMatch(/tagColumns\.map\(\(t\) => \(e\.tags\.includes\(t\) \? '✓' : ''\)\)/);
    expect(screening).not.toMatch(/e\.tags\.join\(' \| '\)/);
  });
});
