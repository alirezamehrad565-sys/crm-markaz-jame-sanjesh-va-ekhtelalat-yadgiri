/**
 * تست‌های واحد — pure
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// pure.test.ts — فاز ۳: ماتریس ترنزیشن، مهلت پیش‌فرض، گروه‌بندی §13.4 با مرزهای تهران
// now ثابت: 2026-10-07T08:00:00Z = چهارشنبه ۱۱:۳۰ تهران
// todayEnd = 2026-10-07T20:29:59.999Z · weekEnd = 2026-10-14T20:29:59.999Z (+۷ روز تهران)

import { describe, it, expect } from 'vitest';
import type { FollowUpStatus } from '@core/shared';
import { FOLLOWUP_STATUSES } from '@core/shared';
import { canTransition, defaultDueAt, followUpGroupOf, groupBoundaries, FOLLOWUP_TRANSITIONS } from '../pure';

const NOW = new Date('2026-10-07T08:00:00.000Z');
const TODAY_END = '2026-10-07T20:29:59.999Z';
const WEEK_END = '2026-10-14T20:29:59.999Z';

describe('فاز ۳ — ماتریس ترنزیشن وضعیت', () => {
  it('مسیر مجاز: open→in_progress/done/cancelled و in_progress→done/cancelled', () => {
    expect(canTransition('open', 'in_progress')).toBe(true);
    expect(canTransition('open', 'done')).toBe(true);
    expect(canTransition('open', 'cancelled')).toBe(true);
    expect(canTransition('in_progress', 'done')).toBe(true);
    expect(canTransition('in_progress', 'cancelled')).toBe(true);
  });

  it('غیرمجاز: پرش open→(open)، برگشت از in_progress، و پایان‌حالت‌های بسته', () => {
    expect(canTransition('open', 'open')).toBe(false);
    expect(canTransition('in_progress', 'open')).toBe(false);
    expect(canTransition('in_progress', 'in_progress')).toBe(false);
    for (const from of ['done', 'cancelled'] as FollowUpStatus[]) {
      for (const to of FOLLOWUP_STATUSES) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it('ماتریس exhaustیو است — هر وضعیت لیست ترنزیشن دارد و مقصدها معتبرند', () => {
    const keys = Object.keys(FOLLOWUP_TRANSITIONS) as FollowUpStatus[];
    expect(keys.sort()).toEqual([...FOLLOWUP_STATUSES].sort());
    for (const [from, targets] of Object.entries(FOLLOWUP_TRANSITIONS)) {
      for (const to of targets) {
        expect(FOLLOWUP_STATUSES).toContain(to);
        expect(to === from).toBe(false);
      }
      expect((FOLLOWUP_STATUSES as readonly string[]).includes(from)).toBe(true);
    }
  });
});

describe('فاز ۳ — مهلت پیش‌فرض و مرزهای گروه‌ها', () => {
  it('defaultDueAt = دقیقاً +۷ روز', () => {
    expect(defaultDueAt(NOW)).toBe('2026-10-14T08:00:00.000Z');
  });

  it('groupBoundaries — پایان روز تهران و پایان هفته (+۷ روز) با آفست ۳:۳۰', () => {
    const b = groupBoundaries(NOW);
    expect(b.nowIso).toBe('2026-10-07T08:00:00.000Z');
    expect(b.todayEnd).toBe(TODAY_END);
    expect(b.weekEnd).toBe(WEEK_END);
  });
});

describe('فاز ۳ — گروه‌بندی §13.4 (پارتیشن قطعی)', () => {
  it('overdue = باز ∧ due_at<now — حتی در_progress', () => {
    expect(followUpGroupOf({ status: 'open', dueAt: '2026-10-07T07:59:59.999Z' }, NOW)).toBe('overdue');
    expect(followUpGroupOf({ status: 'in_progress', dueAt: '2020-01-01T00:00:00.000Z' }, NOW)).toBe('overdue');
  });

  it('today = now تا پایان روز تهران (شامل خودِ now و خودِ todayEnd)', () => {
    expect(followUpGroupOf({ status: 'open', dueAt: '2026-10-07T08:00:00.000Z' }, NOW)).toBe('today');
    expect(followUpGroupOf({ status: 'open', dueAt: '2026-10-07T12:00:00.000Z' }, NOW)).toBe('today');
    expect(followUpGroupOf({ status: 'open', dueAt: TODAY_END }, NOW)).toBe('today');
  });

  it('week = بعد از امروز تا پایان روز +۷ تهران (شامل weekEnd)', () => {
    expect(followUpGroupOf({ status: 'open', dueAt: '2026-10-07T20:30:00.000Z' }, NOW)).toBe('week');
    expect(followUpGroupOf({ status: 'open', dueAt: '2026-10-11T00:00:00.000Z' }, NOW)).toBe('week');
    expect(followUpGroupOf({ status: 'open', dueAt: WEEK_END }, NOW)).toBe('week');
  });

  it('future = بعد از هفته', () => {
    expect(followUpGroupOf({ status: 'open', dueAt: '2026-10-14T20:30:00.000Z' }, NOW)).toBe('future');
    expect(followUpGroupOf({ status: 'open', dueAt: '2026-11-01T00:00:00.000Z' }, NOW)).toBe('future');
  });

  it('بازِ بی‌مهلت فقط در گروه open؛ بسته‌ها هیچ گروهی', () => {
    expect(followUpGroupOf({ status: 'open', dueAt: null }, NOW)).toBe('open');
    expect(followUpGroupOf({ status: 'in_progress', dueAt: null }, NOW)).toBe('open');
    expect(followUpGroupOf({ status: 'done', dueAt: '2020-01-01T00:00:00.000Z' }, NOW)).toBeNull();
    expect(followUpGroupOf({ status: 'cancelled', dueAt: null }, NOW)).toBeNull();
  });
});
