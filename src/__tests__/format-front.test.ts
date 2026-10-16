/**
 * تست‌های واحد — format-front
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// format-front.test.ts — تست هلپرهای نمایش زمان فرانت (format.js بدون DOM)
// هدف: نمایش زمان نباید به TZ مرورگر وابسته باشد (یافتهٔ ثبت‌شدهٔ ).
// format.js در public/assets/js است — عمداً خارج از تایپ‌چک TS؛ import با @ts-ignore.
// @ts-ignore — فایل.js فرانت، خارج از include تایپ‌اسکریپت است
import { enDigits, jalaliMonthLength, parseJalaliInput, toUtcIso, tehranTimeOfIso, tehranYmdOfIso } from '../../public/assets/js/format.js';

describe('toUtcIso (نرمال‌ساز ضد-TZ)', () => {
  test('ISO کامل با Z — بدون تغییر معنا', () => {
    expect(toUtcIso('2026-10-08T06:00:00.000Z').toISOString()).toBe('2026-10-08T06:00:00.000Z');
  });

  test('ISO با آفست عددی — تبدیل درست به UTC', () => {
    expect(toUtcIso('2026-10-08T09:30:00+03:30').toISOString()).toBe('2026-10-08T06:00:00.000Z');
  });

  test('قرارداد SQLite datetime(now) — فاصله + بدون منطقه = UTC', () => {
    expect(toUtcIso('2026-10-08 06:00:00').toISOString()).toBe('2026-10-08T06:00:00.000Z');
    expect(toUtcIso('2026-10-08 06:00:00.123').toISOString()).toBe('2026-10-08T06:00:00.123Z');
  });

  test('naive با T بدون منطقه — UTC فرض می‌شود (قرارداد بک‌اند)', () => {
    expect(toUtcIso('2026-10-08T06:00:00').toISOString()).toBe('2026-10-08T06:00:00.000Z');
  });

  test('تاریخ خالص — نیمه‌شب UTC', () => {
    expect(toUtcIso('2026-10-08').toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });

  test('Date ورودی — همان شیء (بدون کپی)', () => {
    const d = new Date('2026-10-08T06:00:00.000Z');
    expect(toUtcIso(d)).toBe(d);
  });

  test('ورودی نامعتبر — Invalid Date بدون throw (رفتار قبلی حفظ)', () => {
    expect(() => toUtcIso('').getTime()).not.toThrow();
    expect(Number.isNaN(toUtcIso('').getTime())).toBe(true);
    expect(Number.isNaN(toUtcIso('not-a-date').getTime())).toBe(true);
  });
});

describe('tehranTimeOfIso با همهٔ قالب‌ها یکسان است', () => {
  test('ISO کامل → ۰۹:۳۰ تهران', () => {
    expect(tehranTimeOfIso('2026-10-08T06:00:00.000Z')).toBe('09:30');
  });

  test('SQLite naive (فاصله) → همان نتیجهٔ ISO کامل', () => {
    expect(tehranTimeOfIso('2026-10-08 06:00:00')).toBe('09:30');
  });

  test('naive با T → همان نتیجه', () => {
    expect(tehranTimeOfIso('2026-10-08T06:00:00')).toBe('09:30');
  });

  test('مستقل از TZ محلی: محاسبه با آفست ثابت +03:30', () => {
    // ۲۰:۳۰ UTC = ۲۴:۰۰ تهران → مرز روز
    expect(tehranTimeOfIso('2026-10-08T20:30:00.000Z')).toBe('00:00');
  });
});

describe('tehranYmdOfIso با قالب‌های naive', () => {
  test('عبور از نیمه‌شب تهران (۲۰:۳۰ UTC → روز بعد)', () => {
    expect(tehranYmdOfIso('2026-10-08T20:30:00.000Z')).toBe('2026-10-09');
  });

  test('SQLite naive همان روز را می‌دهد', () => {
    expect(tehranYmdOfIso('2026-10-08 20:30:00')).toBe('2026-10-09');
    expect(tehranYmdOfIso('2026-10-08 05:00:00')).toBe('2026-10-08');
  });

  test('تاریخ خالص — بدون شیفت روز', () => {
    expect(tehranYmdOfIso('2026-10-08')).toBe('2026-10-08');
  });
});

// ─────────────── ویجت تاریخ: تایپ آزاد + رقم‌ها ───────────────

describe('enDigits (نرمال‌سازی رقم کاربر)', () => {
  test('رقم فارسی → لاتین', () => {
    expect(enDigits('۱۴۰۲/۰۵/۱۴')).toBe('1402/05/14');
  });

  test('رقم عربی → لاتین', () => {
    expect(enDigits('١٤٠٢/٠٥/١٤')).toBe('1402/05/14');
  });

  test('ترکیبی و غیررقمی دست‌نخورده', () => {
    expect(enDigits('۱۴۰۲+٢٠٢۶abc')).toBe('1402+2026abc');
    expect(enDigits('1402')).toBe('1402');
  });
});

describe('parseJalaliInput (ورودی آزاد تاریخ تقویم فرم‌ها)', () => {
  test('خالی/فقط فاصله → رشتهٔ خالی (نه خطا)', () => {
    expect(parseJalaliInput('')).toBe('');
    expect(parseJalaliInput('   ')).toBe('');
    expect(parseJalaliInput(null)).toBe('');
  });

  test('قالب‌های مجاز همگی یک نتیجه — ۱۴۰۲/۵/۱۴ = 2023-08-05', () => {
    const expected = '2023-08-05';
    expect(parseJalaliInput('۱۴۰۲/۵/۱۴')).toBe(expected);
    expect(parseJalaliInput('1402/05/14')).toBe(expected);
    expect(parseJalaliInput('۱۴۰۲-۰۵-۱۴')).toBe(expected);
    expect(parseJalaliInput('۱۴۰۲.۵.۱۴')).toBe(expected);
    expect(parseJalaliInput('۱۴۰۲ ۵ ۱۴')).toBe(expected);
    expect(parseJalaliInput('۱۴۰۲،۵،۱۴')).toBe(expected);
    expect(parseJalaliInput('۱۴۰۲۰۵۱۴')).toBe(expected); // فشردهٔ ۸رقمی
    expect(parseJalaliInput('١٤٠٢/٥/١٤')).toBe(expected); // رقم عربی
  });

  test('مرز ماه/روز — ۱۴۰۲/۸/۵ = 2023-10-27 (آبان)', () => {
    expect(parseJalaliInput('1402-8-5')).toBe('2023-10-27');
  });

  test('روز نامعتبر: ۳۰ اسفند سال غیرکبیسه رد می‌شود (گردش کامل)', () => {
    expect(parseJalaliInput('1402/12/30')).toBeNull(); // ۱۴۰۲ کبیسه نیست
    expect(parseJalaliInput('1403/12/30')).toBe('2025-03-20'); // ۱۴۰۳ کبیسه است
  });

  test('ورودی‌های نامعتبر → null', () => {
    expect(parseJalaliInput('abc')).toBeNull();
    expect(parseJalaliInput('1402/13/01')).toBeNull(); // ماه ۱۳
    expect(parseJalaliInput('1402/0/5')).toBeNull(); // ماه صفر
    expect(parseJalaliInput('1402/5/32')).toBeNull();
    expect(parseJalaliInput('1402/5')).toBeNull(); // ناقص
    expect(parseJalaliInput('02/05/14')).toBeNull(); // سال ۲رقمی
    expect(parseJalaliInput('1402051')).toBeNull(); // فشردهٔ ۷رقمی مبهم
    expect(parseJalaliInput('1200/1/1')).toBeNull(); // خارج از بازهٔ ۱۳۰۰–۱۵۰۰
    expect(parseJalaliInput('2026/01/01')).toBeNull(); // سال میلادی تایپ‌شده
  });
});

describe('jalaliMonthLength (کبیسهٔ واقعی)', () => {
  test('نیمهٔ اول ۳۱ روز، نیمهٔ دوم ۳۰ روز', () => {
    expect(jalaliMonthLength(1404, 1)).toBe(31);
    expect(jalaliMonthLength(1404, 6)).toBe(31);
    expect(jalaliMonthLength(1404, 7)).toBe(30);
    expect(jalaliMonthLength(1404, 11)).toBe(30);
  });

  test('اسفند: ۱۴۰۳ کبیسه (۳۰)، ۱۴۰۲ غیرکبیسه (۲۹)', () => {
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1402, 12)).toBe(29);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
  });
});
