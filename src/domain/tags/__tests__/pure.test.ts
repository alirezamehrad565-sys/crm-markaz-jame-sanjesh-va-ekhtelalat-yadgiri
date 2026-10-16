/**
 * تست‌های واحد — pure
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تست‌های pure ماژول برچسب‌ها — بدون دیتابیس

import { describe, expect, it } from 'vitest';
import type { TagRef } from '@core/shared';
import { diffStudentTags, normalizeTagName } from '../pure';

function tag(id: string, name: string, category: TagRef['category'] = 'custom'): TagRef {
  return { id, name, category, color: null };
}

describe('normalizeTagName', () => {
  it('T1: فاصله‌های تکراری فروکاسته و ابتدا/انتها پاک می‌شود', () => {
    expect(normalizeTagName('  نارساخوانی   دیس‌لکسی  ')).toBe('نارساخوانی دیس‌لکسی');
  });

  it('T2: متن بدون تغییر نویسه‌های فارسی حفظ می‌شود', () => {
    expect(normalizeTagName('بیش‌فعالی و کم‌توجهی (ADHD)')).toBe('بیش‌فعالی و کم‌توجهی (ADHD)');
  });
});

describe('diffStudentTags', () => {
  it('T3: افزوده‌شده‌ها و حذف‌شده‌ها بر اساس id محاسبه و نام برمی‌گردد', () => {
    const current = [tag('a', 'نارساخوانی', 'disorder'), tag('b', 'دولتی', 'school_type')];
    const next = [tag('b', 'دولتی', 'school_type'), tag('c', 'سوم', 'grade')];
    const diff = diffStudentTags(current, next);
    expect(diff.added).toEqual(['سوم']);
    expect(diff.removed).toEqual(['نارساخوانی']);
  });

  it('T4: بدون تغییر — خالی', () => {
    const current = [tag('a', 'اضطراب', 'disorder')];
    expect(diffStudentTags(current, [...current])).toEqual({ added: [], removed: [] });
    expect(diffStudentTags([], [])).toEqual({ added: [], removed: [] });
  });

  it('T5: حذف کامل و افزودن کامل', () => {
    const one = [tag('a', 'طیف اتیسم', 'disorder')];
    expect(diffStudentTags(one, [])).toEqual({ added: [], removed: ['طیف اتیسم'] });
    expect(diffStudentTags([], one)).toEqual({ added: ['طیف اتیسم'], removed: [] });
  });

  it('T6: آیتم تکراری در ورودی، diff را نمی‌شکند (set semantics)', () => {
    const next = [tag('a', 'اضطراب'), tag('a', 'اضطراب')];
    const diff = diffStudentTags([], next);
    // next دارای id تکراری است — added بر اساس نام دوبار می‌آید؛ ولی سرویس قبل از diff یکتا می‌کند
    expect(diff.added.length).toBe(2);
    expect(diffStudentTags(next, next)).toEqual({ added: [], removed: [] });
  });
});
