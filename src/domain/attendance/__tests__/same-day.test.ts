import { describe, it, expect } from 'vitest';
import { canMarkDate } from '../staff';

describe('canMarkDate', () => {
  it('امروز مجاز است', () => {
    expect(canMarkDate('2026-10-06', '2026-10-06')).toBe(true);
  });

  it('گذشته مجاز نیست', () => {
    expect(canMarkDate('2026-10-05', '2026-10-06')).toBe(false);
  });

  it('آینده مجاز نیست — پیش‌ثبت مرخصی دیگر ممکن نیست', () => {
    expect(canMarkDate('2026-10-07', '2026-10-06')).toBe(false);
  });

  it('رشته نامرتبط نامعتبر است', () => {
    expect(canMarkDate('', '2026-10-06')).toBe(false);
    expect(canMarkDate('2026/10/06', '2026-10-06')).toBe(false);
  });
});
