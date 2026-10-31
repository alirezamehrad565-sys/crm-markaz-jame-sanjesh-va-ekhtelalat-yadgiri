import { describe, expect, it } from 'vitest';
import { addDaysYmd, tehranTimeLabel } from '../time';

describe('tehranTimeLabel (pure)', () => {
  it('T1: 06:00Z → 09:30 تهران', () => {
    expect(tehranTimeLabel('2026-10-12T06:00:00.000Z')).toBe('09:30');
  });

  it('T2: 20:30Z → 00:00 روز بعد تهران (رفتار مثبت آفست)', () => {
    expect(tehranTimeLabel('2026-10-11T20:30:00.000Z')).toBe('00:00');
  });

  it('T3: ورودی نامعتبر → خطا', () => {
    expect(() => tehranTimeLabel('not-a-date')).toThrow('INVALID_DATE');
  });
});

describe('addDaysYmd (pure)', () => {
  it('T4: روز عادی +۱', () => {
    expect(addDaysYmd('2026-10-12', 1)).toBe('2026-10-13');
  });

  it('T5: مرز ماه', () => {
    expect(addDaysYmd('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('T6: مرز سال', () => {
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('T7: سال کبیسه', () => {
    expect(addDaysYmd('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysYmd('2026-02-28', 1)).toBe('2026-03-01'); // 2026 کبیسه نیست
  });

  it('T8: روزهای منفی (دیروز)', () => {
    expect(addDaysYmd('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('T9: قالب نامعتبر → خطا', () => {
    expect(() => addDaysYmd('2026/10/12', 1)).toThrow('INVALID_DATE');
  });
});
