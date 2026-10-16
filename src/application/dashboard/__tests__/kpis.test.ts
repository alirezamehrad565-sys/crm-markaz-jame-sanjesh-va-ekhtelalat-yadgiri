/**
 * تست‌های واحد — kpis
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تست‌های pure محاسبات KPI داشبورد — بدون دیتابیس

import { describe, expect, it } from 'vitest';
import type { Appointment } from '@core/shared';
import {
  computeAttendanceStats,
  computeStaffCards,
  computeStatusCounts,
  computeScoreboard,
  countSessionsPerStaff,
  findNextAppointment,
  groupByDay,
  scoreOf,
  SCORE_WEIGHTS
} from '../kpis';
import type { StaffInfo, TherapistActivityCounts } from '../kpis';

function appt(overrides: Partial<Appointment> & { id: string }): Appointment {
  return {
    staffId: 'staff-1',
    startAt: '2026-10-12T06:00:00.000Z',
    endAt: '2026-10-12T06:30:00.000Z',
    status: 'scheduled',
    note: null,
    version: 1,
    batchId: null,
    createdBy: 'staff-1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    students: [],
    ...overrides
  };
}

describe('dashboard KPIs (pure)', () => {
  it('T1: شمارش وضعیت — scheduled/cancelled درست شمرده می‌شوند', () => {
    const rows = [
      appt({ id: 'a1' }),
      appt({ id: 'a2', status: 'cancelled' }),
      appt({ id: 'a3' })
    ];
    expect(computeStatusCounts(rows)).toEqual({ total: 3, scheduled: 2, cancelled: 1 });
  });

  it('T2: کارت‌های کارکنان — گروه‌بندی و مرتب‌سازی نزولی', () => {
    const rows = [
      appt({ id: 'a1', staffId: 's1' }),
      appt({ id: 'a2', staffId: 's1' }),
      appt({ id: 'a3', staffId: 's2' }),
      appt({ id: 'a4', staffId: 's2', status: 'cancelled' })
    ];
    const info = new Map<string, StaffInfo>([
      ['s1', { name: 'دکتر علی', role: 'therapist' }],
      ['s2', { name: 'مریم', role: 'therapist' }]
    ]);
    const cards = computeStaffCards(rows, info);
    expect(cards).toHaveLength(2);
    expect(cards[0].staffId).toBe('s1');
    expect(cards[0].total).toBe(2);
    expect(cards[0].scheduled).toBe(2);
    expect(cards[1].cancelled).toBe(1);
  });

  it('T3: آمار حضور و نرخ غیبت — absent/(present+absent)', () => {
    const rows = [
      appt({
        id: 'a1',
        students: [
          { studentId: 'st1', facetId: null, attendance: 'present', note: null },
          { studentId: 'st2', facetId: null, attendance: 'absent', note: null },
          { studentId: 'st3', facetId: null, attendance: 'pending', note: null }
        ]
      }),
      appt({
        id: 'a2',
        students: [{ studentId: 'st4', facetId: null, attendance: 'present', note: null }]
      })
    ];
    const stats = computeAttendanceStats(rows);
    expect(stats.present).toBe(2);
    expect(stats.absent).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.absenceRate).toBeCloseTo(1 / 3, 5);
  });

  it('T4: نرخ غیبت بدون داده → صفر (نه NaN)', () => {
    expect(computeAttendanceStats([]).absenceRate).toBe(0);
  });

  it('T5: گروه‌بندی روزانه با مرز تهران — 2026-10-12T20:14Z همان ۱۲ اکتبر تهران است', () => {
    // 2026-10-12T20:14:00Z = 2026-10-12 23:44 تهران → همان روز
    // 2026-10-12T20:45:00Z = 2026-10-13 00:15 تهران → روز بعد!
    const rows = [
      appt({ id: 'a1', startAt: '2026-10-12T20:14:00.000Z' }),
      appt({ id: 'a2', startAt: '2026-10-12T20:45:00.000Z' })
    ];
    const days = groupByDay(rows);
    expect(days).toHaveLength(2);
    expect(days[0].date).toBe('2026-10-12');
    expect(days[1].date).toBe('2026-10-13');
  });

  it('T6: نوبت بعدی — اولین scheduled در آینده، لغوشده و گذشته نادیده', () => {
    const now = '2026-10-12T10:00:00.000Z';
    const rows = [
      appt({ id: 'past', startAt: '2026-10-12T08:00:00.000Z', endAt: '2026-10-12T08:30:00.000Z' }),
      appt({ id: 'cancelled', startAt: '2026-10-12T10:15:00.000Z', endAt: '2026-10-12T10:45:00.000Z', status: 'cancelled' }),
      appt({ id: 'next2', startAt: '2026-10-12T11:00:00.000Z', endAt: '2026-10-12T11:30:00.000Z' }),
      appt({ id: 'next1', startAt: '2026-10-12T10:15:00.000Z', endAt: '2026-10-12T10:45:00.000Z' })
    ];
    const next = findNextAppointment(rows, now);
    expect(next?.id).toBe('next1');
  });
});

// ───────────── تابلوی رقابتی (pure) ─────────────

describe('scoreboard (pure)', () => {
  const T = (id: string, name: string) => ({ id, name });
  const C = (sessions: number, exercises: number, events: number, followups: number): TherapistActivityCounts => ({
    sessions, exercises, events, followups
  });

  it('S1: امتیاز ترکیبی — وزن‌ها دقیق اعمال می‌شوند', () => {
    expect(SCORE_WEIGHTS).toEqual({ sessions: 2, exercises: 3, events: 1, followups: 1 });
    expect(scoreOf(C(2, 1, 3, 4))).toBe(2 * 2 + 1 * 3 + 3 * 1 + 4 * 1);
  });

  it('S2: رتبه‌بندی استاندارد — هم‌امتیاز رتبهٔ یکسان، بعدی پرش می‌کند', () => {
    const entries = computeScoreboard(
      [T('a', 'آ'), T('b', 'ب'), T('c', 'پ'), T('d', 'ت')],
      new Map([
        ['a', C(3, 0, 0, 0)], // 6
        ['b', C(0, 2, 0, 0)], // 6
        ['c', C(5, 0, 0, 0)], // 10
        ['d', C(0, 0, 0, 0)] // 0
      ])
    );
    expect(entries[0].staffId).toBe('c'); // 10
    expect(entries[0].rank).toBe(1);
    expect(entries[1].staffId).toBe('a'); // 6 — هم‌امتیاز با b (سپس جلسات بیشتر)
    expect(entries[2].staffId).toBe('b');
    expect(entries[1].rank).toBe(2);
    expect(entries[2].rank).toBe(2); // هم‌امتیاز = رتبهٔ یکسان
    expect(entries[3].rank).toBe(4); // پرش از ۲ به ۴ (استاندارد مسابقه)
  });

  it('S3: درمانگرِ غایب در counts هم صفر امتیاز می‌گیرد و در تابلو می‌ماند', () => {
    const entries = computeScoreboard([T('x', 'خ')], new Map());
    expect(entries).toHaveLength(1);
    expect(entries[0].score).toBe(0);
    expect(entries[0].rank).toBe(1);
  });

  it('S4: شمارش جلسات — فقط غیرلغوشده با حداقل یک «حاضر»', () => {
    const rows = [
      appt({ id: 'a1', students: [{ studentId: 's1', facetId: null, attendance: 'present', note: null, sessionNote: null, nextAction: null }] }),
      appt({ id: 'a2', students: [{ studentId: 's1', facetId: null, attendance: 'pending', note: null, sessionNote: null, nextAction: null }] }),
      appt({ id: 'a3', status: 'cancelled', students: [{ studentId: 's1', facetId: null, attendance: 'present', note: null, sessionNote: null, nextAction: null }] }),
      appt({ id: 'a4', staffId: 'staff-2', students: [{ studentId: 's2', facetId: null, attendance: 'present', note: null, sessionNote: null, nextAction: null }] })
    ];
    const byStaff = countSessionsPerStaff(rows);
    expect(byStaff.get('staff-1')).toBe(1);
    expect(byStaff.get('staff-2')).toBe(1);
  });
});
