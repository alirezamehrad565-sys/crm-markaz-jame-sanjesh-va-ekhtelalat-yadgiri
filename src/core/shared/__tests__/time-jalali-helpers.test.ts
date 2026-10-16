/**
 * تست‌های واحد — time-
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تست‌های کمکی‌های زمانی جدید (جلالی سمت سرور)
import { describe, expect, it } from 'vitest';
import {
  addDaysYmd,
  faDigits,
  iranianWeekdayOfYmd,
  jalaliFullLabel,
  jalaliLabel,
  minuteToLabel,
  toJalaliParts
} from '@core/shared';

describe('jalali helpers', () => {
  it('converts known gregorian dates to jalali', () => {
    // 2026-10-06 میلادی = ۱۴ مهر ۱۴۰۵
    const j = toJalaliParts(2026, 10, 6);
    expect(j.jy).toBe(1405);
    expect(j.jm).toBe(7);
    expect(j.jd).toBe(14);
  });

  it('handles nowruz boundary (2025-03-21 = 1 Farvardin 1404)', () => {
    const j = toJalaliParts(2025, 3, 21);
    expect(j.jy).toBe(1404);
    expect(j.jm).toBe(1);
    expect(j.jd).toBe(1);
  });

  it('formats jalali label with persian digits', () => {
    expect(jalaliLabel('2026-10-06')).toBe('۱۴ مهر ۱۴۰۵');
  });

  it('formats full label with weekday', () => {
    // 2026-10-06 سه‌شنبه است
    expect(jalaliFullLabel('2026-10-06')).toContain('سه‌شنبه');
    expect(jalaliFullLabel('2026-10-06')).toContain('۱۴ مهر ۱۴۰۵');
  });

  it('iranian weekday: saturday=0, friday=6', () => {
    // 2025-10-04 شنبه
    expect(iranianWeekdayOfYmd('2025-10-04')).toBe(0);
    // 2025-10-10 جمعه
    expect(iranianWeekdayOfYmd('2025-10-10')).toBe(6);
  });

  it('minuteToLabel pads and wraps', () => {
    expect(minuteToLabel(0)).toBe('00:00');
    expect(minuteToLabel(540)).toBe('09:00');
    expect(minuteToLabel(1440)).toBe('24:00');
  });

  it('faDigits converts latin digits', () => {
    expect(faDigits('09:30')).toBe('۰۹:۳۰');
    expect(faDigits(1405)).toBe('۱۴۰۵');
  });

  it('addDaysYmd stays consistent', () => {
    expect(addDaysYmd('2026-10-06', -6)).toBe('2026-09-30');
    expect(addDaysYmd('2026-10-06', 7)).toBe('2026-10-13');
  });
});
