/**
 * تست‌های واحد — pure
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// pure-screening.test.ts — منطق خالص سنجش روزانه
// پارس «نام + #برچسب»، resolve هشتگ کوتاه، sanitize، فیلتر OR، KPI

import { describe, it, expect } from 'vitest';
import {
  parseEntryInput,
  normalizeTagToken,
  resolveHashTag,
  sanitizeTags,
  mergeTags,
  normalizeName,
  applyTagFilter,
  screeningStats
} from '../pure';
import type { ScreeningEntry } from '../types';

const entry = (id: string, day: string, tags: string[]): ScreeningEntry => ({
  id,
  name: `دانش‌آموز ${id}`,
  day,
  tags,
  createdBy: 'staff',
  creatorName: 'مدیر',
  createdAt: '2026-01-01 08:00:00',
  updatedAt: '2026-01-01 08:00:00'
});

describe('پارس ورودی «نام + #برچسب»', () => {
  it('نام و برچسب‌ها را جدا می‌کند و خط‌زیر را فاصله می‌کند', () => {
    const p = parseEntryInput('آوا محمدی #مهدکودک_ستاره #مرضیه-احمدی');
    expect(p.name).toBe('آوا محمدی');
    expect(p.hashTags).toEqual(['مهدکودک ستاره', 'مرضیه احمدی']);
  });

  it('بدون هشتگ = فقط نام', () => {
    const p = parseEntryInput('  پارسا   رضایی  ');
    expect(p.name).toBe('پارسا رضایی');
    expect(p.hashTags).toEqual([]);
  });

  it('هشتگ فارسی ＃ و تکرار را پشتیبانی می‌کند', () => {
    const p = parseEntryInput('سارا #بینایی ＃بینایی');
    expect(p.hashTags).toEqual(['بینایی']);
  });

  it('نرمال‌سازی توکن', () => {
    expect(normalizeTagToken('مهدکودک_ستاره')).toBe('مهدکودک ستاره');
    expect(normalizeTagToken('a--b')).toBe('a b');
  });
});

describe('resolve هشتگ به برچسب ثابت', () => {
  it('تطابق کامل', () => {
    expect(resolveHashTag('ارجاع تخصصی بینایی')).toBe('ارجاع تخصصی بینایی');
  });
  it('تطابق کوتاه معتبر (≥۳ نویسه)', () => {
    expect(resolveHashTag('بینایی')).toBe('ارجاع تخصصی بینایی');
    expect(resolveHashTag('شنوایی')).toBe('ارجاع تخصصی شنوایی');
    expect(resolveHashTag('همکاری')).toBe('عدم همکاری');
  });
  it('برچسب آزاد دست‌نخورده می‌ماند', () => {
    expect(resolveHashTag('مهدکودک ستاره')).toBe('مهدکودک ستاره');
    expect(resolveHashTag('مرضیه احمدی')).toBe('مرضیه احمدی');
  });
});

describe('sanitize و merge', () => {
  it('غیر رشته‌ها، خالی‌ها و تکراری‌ها را حذف و سقف ۱۲ را رعایت می‌کند', () => {
    const tags = sanitizeTags(['a', 42, null, '', ' a ', ...Array.from({ length: 20 }, (_, i) => `t${i}`)]);
    expect(tags).not.toContain('');
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.length).toBeLessThanOrEqual(12);
  });

  it('merge: هشتگ resolve + تاگل‌ها بدون تکرار', () => {
    const parsed = parseEntryInput('آوا #بینایی');
    expect(mergeTags(parsed, ['بینایی', 'مهدکودک ستاره'])).toEqual([
      'ارجاع تخصصی بینایی',
      'مهدکودک ستاره'
    ]);
  });
});

describe('normalizeName', () => {
  it('نام معتبر نرمال می‌شود', () => {
    expect(normalizeName('  سارا   موسوی ')).toBe('سارا موسوی');
  });
  it('کوتاه‌تر از ۲ یا بلندتر از ۸۰ نامعتبر است', () => {
    expect(normalizeName('س')).toBe('');
    expect(normalizeName('x'.repeat(81))).toBe('');
  });
});

describe('فیلتر برچسب OR', () => {
  const list = [entry('1', '2026-01-01', []), entry('2', '2026-01-01', ['ارجاع هوش']), entry('3', '2026-01-02', ['مهدکودک ستاره'])];
  it('بدون فیلتر = همه', () => {
    expect(applyTagFilter(list, [])).toHaveLength(3);
  });
  it('هر یک از برچسب‌ها کافی است', () => {
    const out = applyTagFilter(list, ['ارجاع هوش', 'مهدکودک ستاره']);
    expect(out.map((e) => e.id)).toEqual(['2', '3']);
  });
});

describe('KPI مدیر', () => {
  const list = [
    entry('1', '2026-01-01', []),
    entry('2', '2026-01-01', ['ارجاع تخصصی بینایی', 'مرضیه احمدی']),
    entry('3', '2026-01-02', ['عدم همکاری']),
    entry('4', '2026-01-02', ['نداشتن ثبت‌نام']),
    // فقط برچسب آزاد (کارمند/مهدکودک) — از «عادی» خارج نمی‌شود
    entry('5', '2026-01-02', ['مهدکودک ستاره', 'سمیرا نوری'])
  ];

  it('شمارش‌ها و نرخ ارجاع درست است — عادی = بدون برچسب ثابت', () => {
    const s = screeningStats(list);
    expect(s.total).toBe(5);
    expect(s.normal).toBe(2);
    expect(s.referrals).toBe(1);
    expect(s.referralRate).toBe(20);
    expect(s.noCoop).toBe(1);
    expect(s.noReg).toBe(1);
  });

  it('perTag نزولی است و نقش برچسب آزاد/ثابت درست است', () => {
    const s = screeningStats(list);
    const vision = s.perTag.find((t) => t.label === 'ارجاع تخصصی بینایی');
    const kg = s.perTag.find((t) => t.label === 'مهدکودک ستاره');
    expect(vision?.kind).toBe('referral');
    expect(kg?.kind).toBe('custom');
  });

  it('byDay صعودی است', () => {
    const s = screeningStats(list);
    expect(s.byDay.map((d) => d.day)).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('لیست خالی = KPI صفر', () => {
    const s = screeningStats([]);
    expect(s).toMatchObject({ total: 0, normal: 0, referrals: 0, referralRate: 0 });
  });
});
