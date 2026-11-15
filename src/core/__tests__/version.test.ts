/**
 * موج ۱ (۱-۴) — آزمون هندشیک نسخه: مقایسهٔ سه‌بخشی عددی compareSemver (بدون وابستگی تازه)
 * و ثابت NODE_MIN_VERSION — قرارداد receiving-سرِ آماده از ۱.۲۶.۱ (۴۲۶/کد NODE_MIN_VERSION)
 * حالا در پاسخ‌های موفق pull/push هم حمل می‌شود (min_node_version).
 */
import { describe, it, expect } from 'vitest';
import { APP_VERSION, NODE_MIN_VERSION, compareSemver } from '../version';

describe('compareSemver — مقایسهٔ سه‌بخشی عددی نسخه', () => {
  it('مقایسهٔ کامل: جدیدتر/قدیمی‌تر/برابر', () => {
    expect(compareSemver('1.26.0', '1.26.0')).toBe(0);
    expect(compareSemver('1.26.1', '1.26.0')).toBe(1);
    expect(compareSemver('1.25.9', '1.26.0')).toBe(-1);
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1);
    expect(compareSemver('1.26.10', '1.26.9')).toBe(1); // عددی نه لغوی — ۱۰ > ۹
    expect(compareSemver('0.9.0', '1.0.0')).toBe(-1);
  });

  it('بخش غایب/غیرعددی = صفر — و پسوند پیش‌انتشار نرم دور ریخته می‌شود', () => {
    expect(compareSemver('1.26', '1.26.0')).toBe(0);
    expect(compareSemver('1.26.0-beta', '1.26.0')).toBe(0); // فقط سه‌بخشی عددی؛ پسوند نادیده
    expect(compareSemver('1.26.0-beta', '1.26.1')).toBe(-1);
    expect(compareSemver('v1.26.0', '1.26.0')).toBe(0); // پیشوند v نرم حذف می‌شود
    expect(compareSemver('', '0.0.0')).toBe(0);
    expect(compareSemver('garbage', '0.0.0')).toBe(0);
    expect(compareSemver('1.x.3', '1.0.4')).toBe(-1); // بخش غیرعددی = ۰
  });
});

describe('ثابت‌های هندشیک نسخه — هم‌قراردادی مرکز و نود', () => {
  it('NODE_MIN_VERSION سه‌بخشی معتبر است و نسخهٔ جاری نود با آن سازگار است', () => {
    expect(NODE_MIN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    // نسخهٔ جاری نود هرگز نباید از حداقل اعلامی مرکز عقب بیفتد — وگرنه هر نود تازه از بوت معلق می‌شود
    expect(compareSemver(APP_VERSION, NODE_MIN_VERSION)).toBeGreaterThanOrEqual(0);
  });
});
