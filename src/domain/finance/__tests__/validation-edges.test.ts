/**
 * آزمون مرزی گاردهای مالی — ۱.۲۷.۸۳ (sdt160: بستن testing-007)
 * چهار گارد خالص سرویس مالی: مبلغ صحیح-مثبت، قالب تاریخ، خالی‌ناپذیری و ترتیب بازهٔ بودجه.
 * پینِ رفتار «2024-13-99 می‌گذرد» ثبت ماهیت regex-محور گارد است (مسیرها Zod هم دارند).
 */
import { describe, it, expect } from 'vitest';
import { assertAmount, assertYmd, assertNonEmpty, assertBudgetRange } from '../service';

describe('گاردهای اعتبارسنجی مالی (testing-007 — ۱.۲۷.۸۳)', () => {
  it('assertAmount — فقط صحیح بزرگ‌تر از صفر', () => {
    expect(() => assertAmount(150_000)).not.toThrow();
    expect(() => assertAmount(0)).toThrow(/مبلغ/);
    expect(() => assertAmount(-1)).toThrow(/مبلغ/);
    expect(() => assertAmount(10.5)).toThrow(/مبلغ/);
    expect(() => assertAmount(Number.NaN)).toThrow(/مبلغ/);
    expect(() => assertAmount('12' as unknown as number)).toThrow(/مبلغ/);
  });

  it('assertYmd — قالب YYYY-MM-DD (regex) و پینِ رفتار regex-محور', () => {
    expect(() => assertYmd('2026-11-25', 'تاریخ')).not.toThrow();
    expect(() => assertYmd('2026-1-25', 'تاریخ')).toThrow(/YYYY-MM-DD/);
    expect(() => assertYmd('not-a-date', 'تاریخ')).toThrow(/YYYY-MM-DD/);
    // quirk ثبت‌شده: regex فقط قالب را می‌بیند — مسیر HTTP با Zod می‌بندد؛ تغییر رفتار تصمیم جدا می‌خواهد
    expect(() => assertYmd('2024-13-99', 'تاریخ')).not.toThrow();
  });

  it('assertNonEmpty — خالی/فقط فاصله رد می‌شود', () => {
    expect(() => assertNonEmpty('عنوان', 'عنوان')).not.toThrow();
    expect(() => assertNonEmpty('   ', 'عنوان')).toThrow(/خالی/);
    expect(() => assertNonEmpty('', 'عنوان')).toThrow(/خالی/);
    expect(() => assertNonEmpty(undefined as unknown as string, 'عنوان')).toThrow(/خالی/);
  });

  it('assertBudgetRange — «تا» پیش از «از» ممنوع؛ برابر و تک‌سرِ مجاز', () => {
    expect(() => assertBudgetRange('2026-01-01', '2026-01-31')).not.toThrow();
    expect(() => assertBudgetRange('2026-01-01', '2026-01-01')).not.toThrow();
    expect(() => assertBudgetRange('2026-01-01', null)).not.toThrow();
    expect(() => assertBudgetRange(null, '2026-01-01')).not.toThrow();
    expect(() => assertBudgetRange('2026-02-01', '2026-01-31')).toThrow(/بازهٔ بودجه/);
  });
});
