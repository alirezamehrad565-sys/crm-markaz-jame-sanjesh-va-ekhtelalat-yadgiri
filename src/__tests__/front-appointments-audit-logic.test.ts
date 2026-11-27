/**
 * آزمون رفتاری رفع‌های ممیزی صفحهٔ تقویم — ۱.۲۷.۸۸ (الگوی مرجع: front-appointments-logic —
 * توابع خالصِ appointments.js در node اجرا می‌شوند، نه فقط به‌صورت متن). تنها سد import:
 * خواند سطح‌ماژولِ sessionStorage در state — استاب سبک. پشتِ همین‌ها تست سرویس در
 * src/application/__tests__/audit-page-appointments.test.ts نشسته است.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('۱.۲۷.۸۸ — منطق رفع‌های ممیزی تقویم (behavioral)', () => {
  // @ts-ignore — ماژول وانیل فرانت خارج از tsconfig است
  let A: typeof import('../../public/assets/js/views/appointments.js');

  beforeAll(async () => {
    (globalThis as Record<string, unknown>).sessionStorage = {
      getItem: () => null, setItem: () => {}, removeItem: () => {}
    };
    // @ts-ignore — ماژول وانیل فرانت خارج از tsconfig است
    A = await import('../../public/assets/js/views/appointments.js');
  });
  afterAll(() => {
    delete (globalThis as Record<string, unknown>).sessionStorage;
  });

  /** حافظهٔ نشستِ آزمونی — فقط کلیدهای داده‌شده را می‌داند */
  const mem = (rows: Record<string, string>) => ({
    getItem: (k: string): string | null => (k in rows ? rows[k] : null),
    setItem: () => {},
    removeItem: () => {}
  });

  it('dropTargetStaff — ستون درمانگرِ دیگر هدف است؛ همان ستون، «سایر» و ستون بدون درمانگر هدف نیستند', () => {
    expect(A.dropTargetStaff('staff-b', 'staff-a')).toBe('staff-b');
    expect(A.dropTargetStaff('staff-a', 'staff-a')).toBeUndefined();
    expect(A.dropTargetStaff('_other', 'staff-a')).toBeUndefined();
    expect(A.dropTargetStaff(undefined, 'staff-a')).toBeUndefined();
    expect(A.dropTargetStaff('', 'staff-a')).toBeUndefined();
  });

  it('undoCopyMessage — با نوبتِ نگه‌داشته‌شده هشدار با هر دو تعداد؛ بدون آن پیام موفقیت', () => {
    const warn = A.undoCopyMessage(2, 1);
    expect(warn.type).toBe('warning');
    expect(warn.message).toContain('نوبت برگردانده شد');
    expect(warn.message).toContain('دست‌نخورده ماند');
    const ok = A.undoCopyMessage(3, 0);
    expect(ok.type).toBe('success');
    expect(ok.message).toContain('نوبت برگردانده شد');
    expect(ok.message).not.toContain('دست‌نخورده');
    expect(A.undoCopyMessage(0, 4).type).toBe('warning');
  });

  it('restoreLastBatchId — فقط دستهٔ همین کاربر؛ «null» و کلید غایب رد می‌شوند', () => {
    expect(A.restoreLastBatchId(mem({ cs: 'x', 'cs.lastBatchId': 'b-1', 'cs.lastBatchOwner': 's-1' }), 's-1')).toBe('b-1');
    expect(A.restoreLastBatchId(mem({ 'cs.lastBatchId': 'b-1', 'cs.lastBatchOwner': 's-1' }), 's-2')).toBeNull();
    expect(A.restoreLastBatchId(mem({ 'cs.lastBatchId': 'b-1', 'cs.lastBatchOwner': 's-1' }), undefined)).toBeNull();
    expect(A.restoreLastBatchId(mem({ 'cs.lastBatchId': 'null', 'cs.lastBatchOwner': 's-1' }), 's-1')).toBeNull();
    expect(A.restoreLastBatchId(mem({ 'cs.lastBatchOwner': 's-1' }), 's-1')).toBeNull();
  });
});
