/**
 * تست‌های واحد — staff
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تست pure تجمیع حضور و غیاب همکاران

import { describe, it, expect } from 'vitest';
import { aggregateDay, aggregateRange, daysInRange, countDaysInclusive } from '../staff';

type Row = Parameters<typeof aggregateDay>[1][number];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'r1',
    staff_id: 's1',
    date: '2026-10-01',
    status: 'present',
    note: null,
    updated_at: '2026-10-01T06:00:00.000Z',
    ...overrides
  };
}

const STAFF = [
  { id: 's1', displayName: 'مدیر مرکز', role: 'manager' },
  { id: 's2', displayName: 'درمانگر الف', role: 'therapist' },
  { id: 's3', displayName: 'منشی', role: 'secretary' }
];

describe('countDaysInclusive / daysInRange', () => {
  it('تعداد روز بازه شامل دو سر درست است', () => {
    expect(countDaysInclusive('2026-10-01', '2026-10-01')).toBe(1);
    expect(countDaysInclusive('2026-10-01', '2026-10-31')).toBe(31);
  });

  it('بازه معکوس فهرست خالی می‌دهد', () => {
    expect(daysInRange('2026-10-05', '2026-10-01')).toEqual([]);
  });

  it('daysInRange همه روزهای بازه را صعودی می‌دهد', () => {
    expect(daysInRange('2026-02-28', '2026-03-02')).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
  });
});

describe('aggregateDay', () => {
  it('شمارش هر وضعیت و unmarked درست است', () => {
    const rows = [
      row({ staff_id: 's1', status: 'present' }),
      row({ staff_id: 's2', status: 'absent' }),
      row({ staff_id: 's3', status: 'leave' })
    ];
    const s = aggregateDay('2026-10-01', rows, 5);
    expect(s.present).toBe(1);
    expect(s.absent).toBe(1);
    expect(s.late).toBe(0);
    expect(s.leave).toBe(1);
    expect(s.sick).toBe(0);
    expect(s.unmarked).toBe(2); // ۵ کارمند فعال − ۳ ثبت‌شده
    expect(s.totalActiveStaff).toBe(5);
  });

  // تأخیر وضعیت مستقل است و در خلاصهٔ روز شمرده می‌شود
  it('تأخیر جداگانه شمرده می‌شود و unmarked را پر می‌کند', () => {
    const rows = [
      row({ staff_id: 's1', status: 'late' }),
      row({ staff_id: 's2', status: 'present' })
    ];
    const s = aggregateDay('2026-10-01', rows, 3);
    expect(s.late).toBe(1);
    expect(s.present).toBe(1);
    expect(s.unmarked).toBe(1);
  });

  it('رکوردهای روزهای دیگر نادیده گرفته می‌شوند', () => {
    const rows = [row({ date: '2026-10-02', status: 'sick' })];
    const s = aggregateDay('2026-10-01', rows, 2);
    expect(s.sick).toBe(0);
    expect(s.unmarked).toBe(2);
  });

  it('ثبت تکراری یک همکار unmarked را منفی نمی‌کند', () => {
    const rows = [
      row({ staff_id: 's1', status: 'present' }),
      row({ staff_id: 's1', status: 'absent' }) // اصلاح → هنوز یک نفر
    ];
    const s = aggregateDay('2026-10-01', rows, 1);
    expect(s.unmarked).toBe(0);
    expect(s.absent).toBe(1);
  });
});

describe('aggregateRange', () => {
  it('خلاصه هر همکار با unmarked اولیه = تعداد روزها', () => {
    const rows = [
      row({ staff_id: 's1', status: 'present' }),
      row({ staff_id: 's2', status: 'sick' })
    ];
    const out = aggregateRange('2026-10-01', '2026-10-10', rows, STAFF);
    expect(out).toHaveLength(3);
    const s1 = out.find((p) => p.staffId === 's1')!;
    expect(s1.present).toBe(1);
    expect(s1.unmarked).toBe(9); // ۱۰ روز − ۱ ثبت
    const s2 = out.find((p) => p.staffId === 's2')!;
    expect(s2.sick).toBe(1);
    expect(s2.unmarked).toBe(9);
    const s3 = out.find((p) => p.staffId === 's3')!;
    expect(s3.present + s3.absent + s3.late + s3.leave + s3.sick).toBe(0);
    expect(s3.unmarked).toBe(10);
  });

  it('نقش نامعتبر به therapist امن می‌شود', () => {
    const out = aggregateRange('2026-10-01', '2026-10-01', [], [
      { id: 'sx', displayName: 'نامشخص', role: 'hacker' }
    ]);
    expect(out[0].role).toBe('therapist');
  });
});
