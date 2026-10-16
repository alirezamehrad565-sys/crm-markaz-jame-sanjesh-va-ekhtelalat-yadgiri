/**
 * تست‌های واحد — time-
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// time-.test.ts — تبدیل شمسی→میلادی (jalaliToGregorianYmd) — مبنای «ابتدای سال شمسی» در شاخص سنجش داشبورد

import { describe, it, expect } from 'vitest';
import { jalaliToGregorianYmd, toJalaliParts } from '../time';

describe('jalaliToGregorianYmd', () => {
  it('۱ فروردین سال‌های شناخته‌شده به میلادی درست تبدیل می‌شود', () => {
    // نوروز ۱۴۰۳ = 2024-03-20 (سال کبیسه)، نوروز ۱۴۰۴ = 2025-03-21، نوروز ۱۴۰۵ = 2026-03-21
    expect(jalaliToGregorianYmd(1403, 1, 1)).toBe('2024-03-20');
    expect(jalaliToGregorianYmd(1404, 1, 1)).toBe('2025-03-21');
    expect(jalaliToGregorianYmd(1405, 1, 1)).toBe('2026-03-21');
  });

  it('برگشت‌پذیری با toJalaliParts — نمونه‌ها در طول سال', () => {
    const samples: [number, number, number][] = [
      [1404, 1, 1],
      [1404, 7, 18],
      [1404, 12, 29],
      [1403, 12, 30], // آخرین روز سال کبیسه
      [1405, 3, 31],
      [1405, 10, 10]
    ];
    for (const [jy, jm, jd] of samples) {
      const gy = jalaliToGregorianYmd(jy, jm, jd);
      const [g1, g2, g3] = gy.split('-').map(Number);
      const back = toJalaliParts(g1, g2, g3);
      expect(back).toEqual({ jy, jm, jd });
    }
  });

  it('قالب خروجی همیشه YYYY-MM-DD صفرپرشده است', () => {
    const ymd = jalaliToGregorianYmd(1405, 1, 5);
    expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
