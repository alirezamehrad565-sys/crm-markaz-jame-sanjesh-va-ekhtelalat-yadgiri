import { describe, it, expect } from 'vitest';
import type { TodoStatus } from '@core/shared';
import { TODO_STATUSES } from '@core/shared';
import { canTransition, computeBadge, isTodoOverdue, TODO_TRANSITIONS } from '../pure';

const NOW = new Date('2026-10-07T08:00:00.000Z');

describe('فاز ۴ — ماتریس ترنزیشن وضعیت', () => {
  it('مسیر مجاز: pending→done', () => {
    expect(canTransition('pending', 'done')).toBe(true);
  });

  it('غیرمجاز: پرش pending→pending و پایان‌حالت بستهٔ done', () => {
    expect(canTransition('pending', 'pending')).toBe(false);
    for (const to of TODO_STATUSES) {
      expect(canTransition('done', to)).toBe(false);
    }
  });

  it('ماتریس exhaustیو است — هر وضعیت لیست ترنزیشن دارد و مقصدها معتبرند', () => {
    const keys = Object.keys(TODO_TRANSITIONS) as TodoStatus[];
    expect(keys.sort()).toEqual([...TODO_STATUSES].sort());
    for (const [from, targets] of Object.entries(TODO_TRANSITIONS)) {
      for (const to of targets) {
        expect(TODO_STATUSES).toContain(to);
        expect(to === from).toBe(false);
      }
      expect((TODO_STATUSES as readonly string[]).includes(from)).toBe(true);
    }
  });
});

describe('فاز ۴ — عقب‌افتادگی computed (بدون ستون)', () => {
  it('عقب‌افتاده = باز ∧ مهلت‌دار ∧ مهلت گذشته', () => {
    expect(isTodoOverdue({ status: 'pending', dueAt: '2026-10-07T07:59:59.999Z' }, NOW)).toBe(true);
    expect(isTodoOverdue({ status: 'pending', dueAt: '2020-01-01T00:00:00.000Z' }, NOW)).toBe(true);
  });

  it('مرز دقیق: خودِ now عقب‌افتاده نیست (≥)', () => {
    expect(isTodoOverdue({ status: 'pending', dueAt: '2026-10-07T08:00:00.000Z' }, NOW)).toBe(false);
    expect(isTodoOverdue({ status: 'pending', dueAt: '2026-10-07T08:00:00.001Z' }, NOW)).toBe(false);
  });

  it('انجام‌شده/بی‌مهلت/مهلت خراب هرگز عقب‌افتاده نیستند', () => {
    expect(isTodoOverdue({ status: 'done', dueAt: '2020-01-01T00:00:00.000Z' }, NOW)).toBe(false);
    expect(isTodoOverdue({ status: 'pending', dueAt: null }, NOW)).toBe(false);
    expect(isTodoOverdue({ status: 'pending', dueAt: 'not-a-date' }, NOW)).toBe(false);
  });
});

describe('فاز ۴ — شمارش‌های badge §9', () => {
  it('urgent و overdue مستقل شمرده می‌شوند؛ done و بی‌مهلتِ عادی حذف می‌شوند', () => {
    const badge = computeBadge(
      [
        { status: 'pending', priority: 'urgent', dueAt: '2026-10-10T10:00:00.000Z' }, // فوری آینده
        { status: 'pending', priority: 'normal', dueAt: '2026-10-07T07:00:00.000Z' }, // عقب‌افتادهٔ عادی
        { status: 'pending', priority: 'normal', dueAt: '2026-10-10T10:00:00.000Z' }, // عادی آینده
        { status: 'pending', priority: 'normal', dueAt: null },                       // بی‌مهلت عادی
        { status: 'done', priority: 'urgent', dueAt: '2020-01-01T00:00:00.000Z' }     // انجام‌شدهٔ فوری
      ],
      NOW
    );
    expect(badge).toEqual({ urgent: 1, overdue: 1, attention: 2 });
  });

  it('هم‌پوشانی: کارِ فوریِ عقب‌افتاده در attention یک‌بار شمرده می‌شود (بدون دوبارشماری badge منو)', () => {
    const badge = computeBadge(
      [
        { status: 'pending', priority: 'urgent', dueAt: '2026-10-01T00:00:00.000Z' },
        { status: 'pending', priority: 'urgent', dueAt: '2026-10-02T00:00:00.000Z' }
      ],
      NOW
    );
    expect(badge.urgent).toBe(2);
    expect(badge.overdue).toBe(2);
    expect(badge.attention).toBe(2);
  });

  it('فهرست خالی → badge صفر', () => {
    expect(computeBadge([], NOW)).toEqual({ urgent: 0, overdue: 0, attention: 0 });
  });
});
