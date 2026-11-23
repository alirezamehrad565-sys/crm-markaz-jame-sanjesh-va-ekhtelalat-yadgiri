import { describe, it, expect } from 'vitest';
import { schoolYearOfYmd, currentSchoolYear } from '../time';

/* سال تحصیلی مهر-محور — منبع یگانهٔ جداسازی سال جریان پذیرش (۱.۲۷.۳۳) */
describe('سال تحصیلی مهر-محور', () => {
  it('مهر به بعد → سال جلالی جاری', () => {
    expect(schoolYearOfYmd('2026-09-25')).toBe(1405); // مهر
    expect(schoolYearOfYmd('2026-11-20')).toBe(1405); // آبان
    expect(schoolYearOfYmd('2026-12-31')).toBe(1405); // دی... اسفند نه — دی هم در سال جاری است
    expect(schoolYearOfYmd('2026-01-10')).toBe(1404); // دی ۱۴۰۴ (ژانویهٔ گریگوری)
  });

  it('فروردین تا شهریور → سال قبل', () => {
    expect(schoolYearOfYmd('2026-03-25')).toBe(1404); // فروردین ۱۴۰۵ → سال تحصیلی ۱۴۰۴
    expect(schoolYearOfYmd('2026-09-01')).toBe(1404); // شهریور — پایان سال ۱۴۰۴
    expect(schoolYearOfYmd('2026-08-20')).toBe(1404); // مرداد
  });

  it('currentSchoolYear رشتهٔ سالِ امروزِ تهران است', () => {
    expect(currentSchoolYear(new Date('2026-11-20T09:00:00Z'))).toBe('1405');
    expect(currentSchoolYear(new Date('2026-06-15T09:00:00Z'))).toBe('1404'); // خرداد ۱۴۰۵ → سال تحصیلی ۱۴۰۴
  });
});
