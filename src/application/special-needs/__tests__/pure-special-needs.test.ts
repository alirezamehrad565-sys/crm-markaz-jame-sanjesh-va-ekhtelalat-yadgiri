/**
 * تست‌های واحد — pure-special-needs
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// pure-special-needs.test.ts — فاز ۷: محاسبات قطعی گرید/توجه (بدون I/O)

import { describe, it, expect } from 'vitest';
import {
  deriveAttentionReasons,
  sortAttentionStudents,
  specialPercentage,
  attentionRatio,
  cellIntensity,
  sortGrades,
  mergeCells,
  emptyCell
} from '../pure';
import type { AttentionStudent } from '../types';

const NOW = '2026-10-07T10:00:00.000Z';
const daysAgo = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

describe('فاز ۷ — deriveAttentionReasons', () => {
  it('بدون هیچ ورودی خطر — خروجی خالی', () => {
    expect(
      deriveAttentionReasons(
        { caseStatus: null, waitStatus: null, lastSessionAt: null, nextSessionAt: null, openFollowups: [] },
        NOW
      )
    ).toEqual([]);
  });

  it('قاعدهٔ ۱ — پیگیری سررسیدگذشته', () => {
    const reasons = deriveAttentionReasons(
      {
        caseStatus: null,
        waitStatus: null,
        lastSessionAt: null,
        nextSessionAt: null,
        openFollowups: [{ id: 'f1', dueAt: daysAgo(2), createdAt: daysAgo(5) }]
      },
      NOW
    );
    expect(reasons).toEqual(['overdue_followup']);
  });

  it('قاعدهٔ ۲ — پیگیری باز بیش از ۳۰ روز (بدون مهلت) — overdue نمی‌گیرد', () => {
    const reasons = deriveAttentionReasons(
      {
        caseStatus: null,
        waitStatus: null,
        lastSessionAt: null,
        nextSessionAt: null,
        openFollowups: [{ id: 'f2', dueAt: null, createdAt: daysAgo(40) }]
      },
      NOW
    );
    expect(reasons).toEqual(['long_open_followup']);
  });

  it('قاعدهٔ ۳ — در انتظار ارزیابی', () => {
    const reasons = deriveAttentionReasons(
      { caseStatus: 'awaiting_assessment', waitStatus: null, lastSessionAt: null, nextSessionAt: null, openFollowups: [] },
      NOW
    );
    expect(reasons).toEqual(['awaiting_assessment']);
  });

  it('قاعدهٔ ۴ — پذیرش‌شده با جلسهٔ کهنه و بدون نوبت آینده', () => {
    const reasons = deriveAttentionReasons(
      {
        caseStatus: null,
        waitStatus: 'admitted',
        lastSessionAt: daysAgo(45),
        nextSessionAt: null,
        openFollowups: []
      },
      NOW
    );
    expect(reasons).toEqual(['no_recent_session']);
  });

  it('قاعدهٔ ۴ — نوبت آینده ثبت شده است → توجه نمی‌گیرد (نویز صفر)', () => {
    const reasons = deriveAttentionReasons(
      {
        caseStatus: null,
        waitStatus: 'admitted',
        lastSessionAt: daysAgo(45),
        nextSessionAt: daysAgo(-3),
        openFollowups: []
      },
      NOW
    );
    expect(reasons).toEqual([]);
  });

  it('قاعدهٔ ۴ — منتظر (پذیرش‌نشده) بدون سابقهٔ جلسه → توجه نمی‌گیرد', () => {
    const reasons = deriveAttentionReasons(
      { caseStatus: null, waitStatus: 'waiting', lastSessionAt: null, nextSessionAt: null, openFollowups: [] },
      NOW
    );
    expect(reasons).toEqual([]);
  });

  it('قاعدهٔ ۴ — پذیرش‌شده که هیچ جلسه‌ای نداشته → توجه می‌گیرد', () => {
    const reasons = deriveAttentionReasons(
      { caseStatus: null, waitStatus: 'admitted', lastSessionAt: null, nextSessionAt: null, openFollowups: [] },
      NOW
    );
    expect(reasons).toEqual(['no_recent_session']);
  });

  it('چند قاعده هم‌زمان — ترتیب ثابت طبق ATTENTION_REASONS', () => {
    const reasons = deriveAttentionReasons(
      {
        caseStatus: 'awaiting_assessment',
        waitStatus: 'admitted',
        lastSessionAt: daysAgo(50),
        nextSessionAt: null,
        openFollowups: [{ id: 'f3', dueAt: daysAgo(1), createdAt: daysAgo(35) }]
      },
      NOW
    );
    expect(reasons).toEqual(['overdue_followup', 'long_open_followup', 'awaiting_assessment', 'no_recent_session']);
  });

  it('مرز دقیق ۳۰ روز — هنوز کهنه محسوب نمی‌شود (strict >)', () => {
    const reasons = deriveAttentionReasons(
      { caseStatus: null, waitStatus: 'admitted', lastSessionAt: daysAgo(30), nextSessionAt: null, openFollowups: [] },
      NOW
    );
    expect(reasons).toEqual([]);
  });

  it('یک روز بعد از مرز — کهنه محسوب می‌شود', () => {
    const reasons = deriveAttentionReasons(
      { caseStatus: null, waitStatus: 'admitted', lastSessionAt: daysAgo(31), nextSessionAt: null, openFollowups: [] },
      NOW
    );
    expect(reasons).toEqual(['no_recent_session']);
  });
});

describe('فاز ۷ — sortAttentionStudents (قطعی)', () => {
  const s = (id: string, reasons: string[], lastName: string, type: string | null): AttentionStudent => ({
    id,
    firstName: 'نام',
    lastName,
    grade: null,
    schoolId: null,
    schoolName: null,
    classId: null,
    className: null,
    specialNeedType: type as AttentionStudent['specialNeedType'],
    specialNeedSeverity: null,
    caseStatus: null,
    reasons: reasons as AttentionStudent['reasons']
  });

  it('بیشترین دلیل اول؛ سپس نوع؛ سپس نام خانوادگی؛ tie-break id', () => {
    const sorted = sortAttentionStudents([
      s('id-1', ['awaiting_assessment'], 'کریمی', 'adhd'),
      s('id-2', ['awaiting_assessment', 'overdue_followup'], 'احمدی', 'adhd'),
      s('id-3', ['awaiting_assessment'], 'کریمی', 'autism'),
      s('id-4', [], 'آزاد', 'other')
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['id-2', 'id-1', 'id-3', 'id-4']); // adhd < autism در مقایسهٔ id فیلد
  });

  it('ورودی را تغییر نمی‌دهد (immutability)', () => {
    const input = [s('a', [], 'ب', null), s('b', ['awaiting_assessment'], 'آ', null)];
    const copy = [...input];
    sortAttentionStudents(input);
    expect(input).toEqual(copy);
  });
});

describe('فاز ۷ — متریک‌های heatmap', () => {
  it('specialPercentage — صفر مخرج = صفر', () => {
    expect(specialPercentage({ ...emptyCell() })).toBe(0);
    expect(specialPercentage({ total: 8, special: 2, attention: 0, bySeverity: {} })).toBe(25);
  });

  it('attentionRatio — صفر special = صفر؛ مقیاس ×۱۰', () => {
    expect(attentionRatio({ total: 5, special: 0, attention: 0, bySeverity: {} })).toBe(0);
    expect(attentionRatio({ total: 5, special: 4, attention: 2, bySeverity: {} })).toBe(5);
  });

  it('cellIntensity — مرزها و سقف ۴', () => {
    expect(cellIntensity(0, 10)).toBe(0);
    expect(cellIntensity(5, 0)).toBe(0);
    expect(cellIntensity(1, 10)).toBe(1);
    expect(cellIntensity(10, 10)).toBe(4);
    expect(cellIntensity(99, 10)).toBe(4);
  });

  it('sortGrades — پایه‌های شناخته‌شده به ترتیب خودشان، ناشناخته‌ها بعدش الفبایی', () => {
    expect(sortGrades(['دوم', 'نامعلوم', 'اول', 'آلفا'], ['پیش‌دبستانی', 'اول', 'دوم', 'سوم'])).toEqual([
      'اول',
      'دوم',
      'آلفا',
      'نامعلوم'
    ]);
  });

  it('mergeCells — bySeverity جمع می‌شود و صفرها حذف می‌مانند', () => {
    const a = { total: 3, special: 2, attention: 1, bySeverity: { mild: 1, severe: 1 } };
    const b = { total: 2, special: 1, attention: 0, bySeverity: { mild: 1 } };
    const merged = mergeCells(a, b);
    expect(merged).toEqual({ total: 5, special: 3, attention: 1, bySeverity: { mild: 2, severe: 1 } });
  });
});
