/**
 * آزمون مرزی جدول‌های نُرم وکسلر — ۱.۲۷.۸۳ (sdt160: بستن testing-007)
 * done_when: «تبدیل نمرهٔ خامِ حدی/مرزی» — سقف/کف هر جدول، clamp بالایی، گاردهای زیر کف و
 * NaN، پنج باند FSIQ، کلاس توصیفی و rawRange. مقادیر مرزی با اجرای واقعی جدول‌ها استخراج و
 * پین شده‌اند (probe 1.27.83).
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore — باندل خالص JS موتور (خارج از tsconfig)
import {
  bandForAge, scaledFor, convertIndex, fsiqBandOf, descriptiveClass, num, rawRange,
  validateWechslerInput, NORMS
} from '../engine.js';

describe('مرزهای جدول نُرم وکسلر (testing-007 — ۱.۲۷.۸۳)', () => {
  it('bandForAge — کف sq-6 و سقف sq-14 با clamp (بدون خطا)', () => {
    expect(bandForAge(3)).toBe('sq-6');
    expect(bandForAge(6)).toBe('sq-6');
    expect(bandForAge(10)).toBe('sq-10');
    expect(bandForAge(16)).toBe('sq-14');
    expect(bandForAge(20)).toBe('sq-14');
  });

  it('scaledFor — اولین/آخرین سطر جدول + clamp بالایی + گارد زیر کف و NaN', () => {
    expect(scaledFor({ BD: 0 }, 6).BD).toBe(2);      // سطر اول sq-6 BD
    expect(scaledFor({ BD: 50 }, 6).BD).toBe(19);    // سطر آخر (سقف خام ۵۰)
    expect(scaledFor({ BD: 51 }, 6).BD).toBe(19);    // بالای سقف → clamp به آخرین سطر
    expect(scaledFor({ BD: -1 }, 6).BD).toBe(0);     // زیر کف → 0
    expect(scaledFor({ BD: Number.NaN }, 6).BD).toBe(0);
    expect(scaledFor({}, 6).BD).toBe(0);             // خام ناموجود → 0
  });

  it('convertIndex — مرزهای FSIQ (۱..۱۵۸) و GAI (۶..۱۱۵) با clamp و null زیر کف', () => {
    expect(convertIndex('FSIQ', 1)).toMatchObject({ sum: 1, scaled: 0, percentile: 0 });
    expect(convertIndex('FSIQ', 158)?.scaled).toBe(145);
    expect(convertIndex('FSIQ', 159)?.scaled).toBe(145); // بالای سقف → clamp
    expect(convertIndex('FSIQ', Number.NaN)).toBeUndefined();
    expect(convertIndex('GAI', 5)).toBeUndefined();      // زیر کف جدول → سطر نیست
    expect(convertIndex('GAI', 6)?.scaled).toBe(40);
    expect(convertIndex('GAI', 115)?.scaled).toBe(160);
  });

  it('rawRange — سقف خامِ جدول‌ها (مبنای اعتبارسنجی ورودی)', () => {
    expect(rawRange('sq-6', 'BD')).toEqual([0, 50]);
    expect(rawRange('sq-14', 'CA')).toEqual([0, 124]);
  });

  it('fsiqBandOf — مرزهای دقیق هفت باند + گاردهای NaN/منفی/فراسقف', () => {
    expect(fsiqBandOf(69)).toBe('ID');
    expect(fsiqBandOf(70)).toBe('BIF');
    expect(fsiqBandOf(84)).toBe('BIF');
    expect(fsiqBandOf(85)).toBe('LOW_BORDER');
    expect(fsiqBandOf(89)).toBe('LOW_BORDER');
    expect(fsiqBandOf(90)).toBe('AVERAGE');
    expect(fsiqBandOf(109)).toBe('AVERAGE');
    expect(fsiqBandOf(110)).toBe('HIGH_AVERAGE');
    expect(fsiqBandOf(119)).toBe('HIGH_AVERAGE');
    expect(fsiqBandOf(120)).toBe('SUPERIOR');
    expect(fsiqBandOf(129)).toBe('SUPERIOR');
    expect(fsiqBandOf(130)).toBe('GIFTED');
    expect(fsiqBandOf(Number.NaN)).toBe('ID');
    expect(fsiqBandOf(-5)).toBe('ID');
    expect(fsiqBandOf(250)).toBe('GIFTED');
  });

  it('descriptiveClass — مرزهای کلاس‌های توصیفی (برچسب‌های کاربر-رو؛ پینِ رفتار واقعی ۱.۲۷.۸۳)', () => {
    expect(descriptiveClass(131)).toBe('قوت هنجاری خیلی بالا');
    expect(descriptiveClass(130)).toBe('قوت هنجاری و بالاتر از متوسط');
    expect(descriptiveClass(116)).toBe('قوت هنجاری و بالاتر از متوسط');
    expect(descriptiveClass(115.5)).toBe('قوت هنجاری و بالاتر از متوسط');
    expect(descriptiveClass(85)).toBe('محدوده نرمال دامنه متوسط');
    expect(descriptiveClass(84.9)).toBe('محدوده نرمال دامنه متوسط');
    expect(descriptiveClass(70)).toBe('ضعف هنجاری پایین تر از متوسط');
    expect(descriptiveClass(69)).toBe('ضعف هنجاری و خیلی پایین');
  });

  it('num — پارس نرم: بولی، اعشار و خراب (بلاک HTML علامت حذف می‌شود → ۰)', () => {
    expect(num('12')).toBe(12);
    expect(num(true)).toBe(1);
    expect(num('1.5')).toBe(1.5);
    expect(num('x')).toBe(0);
    expect(num(null)).toBe(0);
    expect(num('<b>3</b>')).toBe(0); // [<>. ] حذف می‌شوند؛ «b3/b» عدد نیست → ۰ (پینِ رفتار واقعی)
  });

  it('جدول‌های NORMS — قرارداد ساختاری (باند سن و شاخص‌ها سرِ جایشان)', () => {
    expect(Object.keys(NORMS.bands)).toEqual(['sq-6', 'sq-7', 'sq-8', 'sq-9', 'sq-10', 'sq-11', 'sq-12', 'sq-13', 'sq-14']);
    expect(Object.keys(NORMS.indices)).toEqual(['VCI', 'PRI', 'WMI', 'PSI', 'FSIQ', 'GAI']);
    const bdRows = NORMS.bands['sq-6'].BD;
    expect(bdRows[0]).toEqual([0, 1]);
    expect(bdRows[bdRows.length - 1]).toEqual([50, 19]);
  });

  it('validateWechslerInput — خام اعشاری/خارج بازه/خالی با بازهٔ rawRange', () => {
    const nonInt = validateWechslerInput({ raw: { BD: 1.5 }, testDate: [1405, 9, 4], birthDate: [1399, 6, 1] } as never);
    expect(nonInt.ok).toBe(false);
    expect(JSON.stringify(nonInt.errors)).toContain('raw_range');
    const over = validateWechslerInput({ raw: { BD: 999 }, testDate: [1405, 9, 4], birthDate: [1399, 6, 1] } as never);
    expect(over.ok).toBe(false);
    expect(JSON.stringify(over.errors)).toContain('50'); // سقف جدول sq-6 BD در پیام
    const empty = validateWechslerInput({ raw: {}, testDate: [1405, 9, 4], birthDate: [1399, 6, 1] } as never);
    expect(empty.ok).toBe(false);
    expect(JSON.stringify(empty.errors)).toContain('no_data');
  });
});
