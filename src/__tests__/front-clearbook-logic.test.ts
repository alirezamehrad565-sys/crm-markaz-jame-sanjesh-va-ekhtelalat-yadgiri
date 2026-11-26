/**
 * آزمون رفتاری منطق تقویم شمسی دفترچهٔ شفاف — ۱.۲۷.۸۲ (sdt159: بستن testing-002)
 * قرارداد سال تحصیلی (مهر تا شهریور) و اسکلت ماه‌های خط زمانی — همه اجراشده در node.
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore — ماژول وانیل فرانت خارج از tsconfig است
import { STATUS_LABELS, jalaliPartsOf, ymdOfJalali, schoolYearOf, schoolYearBounds, schoolYearLabel, monthKeyOf, monthLabelOf, dateLabelOf, rangeLabel, monthSpanBetween } from '../../public/assets/js/views/clearbook.js';

describe('منطق خالص تقویم شمسی دفترچهٔ شفاف (clearbook.js — behavioral)', () => {
  it('گرد رفت جلالی↔گرگوری روی چند تاریخ مرزی', () => {
    for (const ymd of ['2026-11-25', '2025-03-21', '2024-02-29', '2025-09-23', '2026-09-22', '2025-12-22']) {
      expect(ymdOfJalali(jalaliPartsOf(ymd))).toBe(ymd);
    }
    expect(jalaliPartsOf('2026-11-25')).toEqual({ jy: 1405, jm: 9, jd: 4 }); // ۴ آذر ۱۴۰۵
  });

  it('قرارداد سال تحصیلی مهر–شهریور: مهر سال جاری، شهریورِ پیش از مهر سال قبل', () => {
    expect(schoolYearOf('2025-10-01')).toBe(1404); // ۱ مهر ۱۴۰۴
    expect(schoolYearOf('2025-10-31')).toBe(1404); // آبان
    expect(schoolYearOf('2025-09-10')).toBe(1403); // ۱۹ شهریور ۱۴۰۳ → سال قبل
    expect(schoolYearBounds(1404)).toEqual({ from: '2025-09-23', to: '2026-09-22' });
    expect(schoolYearLabel(1404)).toBe('۱۴۰۴–۰۵');
  });

  it('کلید/برچسب ماه و روز — رقم فارسی و نام ماه', () => {
    expect(monthKeyOf('2026-11-25')).toBe('1405-09');
    expect(monthLabelOf('2026-11-25')).toBe('آذر ۱۴۰۵');
    expect(dateLabelOf('2026-11-25')).toBe('۱۴۰۵/۰۹/۰۴');
  });

  it('rangeLabel — سه شکل قراردادی: تک‌روز، هم‌ماه، بین‌ماهی', () => {
    expect(rangeLabel('2026-11-25', undefined)).toBe('۱۴۰۵/۰۹/۰۴');
    expect(rangeLabel('2026-11-25', '2026-11-25')).toBe('۱۴۰۵/۰۹/۰۴');
    expect(rangeLabel('2026-10-23', '2026-11-05')).toBe('۱ تا ۱۴۰۵/۰۸/۱۴'); // هم‌ماه (۱ آبان تا ۱۴ آبان)
    expect(rangeLabel('2026-11-01', '2026-11-25')).toBe('۱۴۰۵/۰۸/۱۰ تا ۱۴۰۵/۰۹/۰۴'); // بین‌ماهی
  });

  it('monthSpanBetween — اولِ هر ماه تا سقف ۱۴ + گاردهای ورودی خراب', () => {
    const span = monthSpanBetween('2026-01-01', '2027-01-01');
    expect(span).toHaveLength(13);
    expect(span[0]).toBe('2025-12-22'); // ۱ دی ۱۴۰۴
    expect(span.every((d: string) => ymdOfJalali(jalaliPartsOf(d)) === d)).toBe(true);
    const long = monthSpanBetween('2024-01-01', '2027-01-01');
    expect(long).toHaveLength(14); // سقف قراردادی اسکلت خط زمانی
    expect(monthSpanBetween('2027-01-01', '2026-01-01')).toEqual([]); // بازهٔ معکوس
    expect(monthSpanBetween('', '2026-01-01')).toEqual([]);
  });

  it('STATUS_LABELS — سه وضعیت قراردادی طرح‌ها', () => {
    expect(STATUS_LABELS).toEqual({ planned: 'برنامه‌ریزی‌شده', active: 'در جریان', done: 'تکمیل' });
  });
});
