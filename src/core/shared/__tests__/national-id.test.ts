/**
 * تست‌های واحد — national-id
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// ۱۰ تست اعتبارسنجی کد ملی ایران — checksum رسمی

import { describe, expect, it } from 'vitest';
import { isValidIranianNationalId, normalizeNationalId } from '../national-id';

describe('national-id', () => {
  it('T1: کد ملی معتبر 0012345679 → true', () => {
    expect(isValidIranianNationalId('0012345679')).toBe(true);
  });

  it('T2: کد با checksum غلط → false', () => {
    expect(isValidIranianNationalId('0012345678')).toBe(false);
  });

  it('T3: همه ارقام یکسان → false', () => {
    expect(isValidIranianNationalId('1111111111')).toBe(false);
    expect(isValidIranianNationalId('0000000000')).toBe(false);
  });

  it('T4: کد ۸ رقمی بعد از padding checksum ندارد → false', () => {
    // 12345678 → 0012345678 (padding) → checksum غلط
    expect(normalizeNationalId('12345678')).toBe('0012345678');
    expect(isValidIranianNationalId('12345678')).toBe(false);
  });

  it('T5: طول بیشتر از ۱۰ → false', () => {
    expect(isValidIranianNationalId('00123456791')).toBe(false);
  });

  it('T6: ارقام فارسی خودکار تبدیل و تأیید می‌شوند', () => {
    expect(normalizeNationalId('۰۰۱۲۳۴۵۶۷۹')).toBe('0012345679');
    expect(isValidIranianNationalId('۰۰۱۲۳۴۵۶۷۹')).toBe(true);
  });

  it('T7: ارقام عربی خودکار تبدیل و تأیید می‌شوند', () => {
    expect(normalizeNationalId('٠٠١٢٣٤٥٦٧٩')).toBe('0012345679');
    expect(isValidIranianNationalId('٠٠١٢٣٤٥٦٧٩')).toBe(true);
  });

  it('T8: padding با صفر — 9 رقمی معتبر 123456789+چک → true', () => {
    // 0123456789 با checksum رسمی معتبر است
    expect(normalizeNationalId('123456789')).toBe('0123456789');
    expect(isValidIranianNationalId('123456789')).toBe(true);
  });

  it('T9: کاراکتر غیررقمی → false', () => {
    expect(isValidIranianNationalId('00123abcde')).toBe(false);
    expect(isValidIranianNationalId('')).toBe(false);
  });

  it('T10: نمونه‌های معتبر تولیدشده با الگوریتم → true', () => {
    // این کدها با الگوریتم checksum تولید و تأیید شده‌اند
    expect(isValidIranianNationalId('1043321810')).toBe(true);
    expect(isValidIranianNationalId('9600133891')).toBe(true);
    expect(isValidIranianNationalId('0838637949')).toBe(true);
  });
});
