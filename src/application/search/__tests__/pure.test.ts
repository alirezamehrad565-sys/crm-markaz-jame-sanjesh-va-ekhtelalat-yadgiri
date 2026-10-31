import { describe, expect, it } from 'vitest';
import { SEARCH_QUERY_MAX_LENGTH } from '@core/shared';
import {
  capItems,
  isSearchable,
  likePattern,
  orderGroups,
  sanitizeSearchQuery,
  toLatinDigits
} from '../pure';
import type { SearchGroup } from '@core/shared';

describe('toLatinDigits', () => {
  it('T1: ارقام فارسی → لاتین', () => {
    expect(toLatinDigits('۰۰۱۲۳۴۵۶۷۹')).toBe('0012345679');
  });

  it('T2: ارقام عربی → لاتین', () => {
    expect(toLatinDigits('٠١٢٣')).toBe('0123');
  });

  it('T3: متن بدون رقم دست‌نخورده می‌ماند', () => {
    expect(toLatinDigits('علی رضایی')).toBe('علی رضایی');
  });
});

describe('sanitizeSearchQuery', () => {
  it('T4: wildcard های LIKE حذف و فاصله‌ها فروکاسته می‌شوند', () => {
    expect(sanitizeSearchQuery('  علی%%رضایی__  ')).toBe('علی رضایی');
  });

  it('T5: ارقام فارسی برای جستجوی کد ملی لاتین می‌شوند', () => {
    expect(sanitizeSearchQuery('۰۰۱۲۳۴۵۶۷۹')).toBe('0012345679');
  });

  it('T6: سقف طول اعمال می‌شود', () => {
    const long = 'ا'.repeat(SEARCH_QUERY_MAX_LENGTH + 20);
    expect(sanitizeSearchQuery(long).length).toBe(SEARCH_QUERY_MAX_LENGTH);
  });

  it('T7: ورودی خالی/undefined → رشته خالی', () => {
    expect(sanitizeSearchQuery(undefined)).toBe('');
    expect(sanitizeSearchQuery(null)).toBe('');
    expect(sanitizeSearchQuery('   ')).toBe('');
  });
});

describe('isSearchable', () => {
  it('T8: حداقل طول — ۱ نویسه کافی نیست', () => {
    expect(isSearchable('ع', 2)).toBe(false);
    expect(isSearchable('علی', 2)).toBe(true);
    expect(isSearchable('', 2)).toBe(false);
  });
});

describe('likePattern', () => {
  it('T9: wildcard wrapper', () => {
    expect(likePattern('علی')).toBe('%علی%');
  });
});

describe('orderGroups', () => {
  it('T10: ترتیب ثابت student→staff→school→tag و حذف گروه‌های خالی', () => {
    const groups: SearchGroup[] = [
      { type: 'tag', items: [{ type: 'tag', id: 't1', title: 'اضطراب', subtitle: null }] },
      { type: 'staff', items: [{ type: 'staff', id: 's1', title: 'مریم', subtitle: null }] },
      { type: 'student', items: [{ type: 'student', id: 'st1', title: 'علی', subtitle: null }] }
    ];
    const ordered = orderGroups(groups);
    expect(ordered.map((g) => g.type)).toEqual(['student', 'staff', 'tag']);
  });

  it('T11: گروه خالی حذف می‌شود', () => {
    const groups: SearchGroup[] = [
      { type: 'student', items: [] },
      { type: 'school', items: [{ type: 'school', id: 'sc1', title: 'شهید مفتح', subtitle: null }] }
    ];
    expect(orderGroups(groups).map((g) => g.type)).toEqual(['school']);
  });

  it('T12: ورودی خالی → خالی', () => {
    expect(orderGroups([])).toEqual([]);
  });
});

describe('capItems', () => {
  it('T13: سقف نتایج گروه', () => {
    const items = [1, 2, 3, 4, 5].map((n) => ({ type: 'student' as const, id: String(n), title: String(n), subtitle: null }));
    expect(capItems(items, 3)).toHaveLength(3);
    expect(capItems(items, 10)).toHaveLength(5);
  });
});
