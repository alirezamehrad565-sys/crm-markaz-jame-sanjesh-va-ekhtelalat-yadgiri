/**
 * تست‌های واحد — pure
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تست pure توابع بورد روز کاری

import { describe, expect, it } from 'vitest';
import {
  groupAppointmentsByStaff,
  normalizeDayNoteBody,
  sessionStatsFromAppointments
} from '../pure';
import type { WorkingDayAppointment } from '@core/shared';

function appt(partial: Partial<WorkingDayAppointment>): WorkingDayAppointment {
  return {
    id: partial.id ?? crypto.randomUUID(),
    staffId: partial.staffId ?? '',
    startAt: partial.startAt ?? '2026-10-06T05:00:00.000Z',
    endAt: partial.endAt ?? '2026-10-06T05:30:00.000Z',
    status: partial.status ?? 'scheduled',
    note: partial.note ?? null,
    version: 1,
    students: partial.students ?? []
  };
}

describe('groupAppointmentsByStaff', () => {
  it('T1 — نوبت‌های همکار شناخته‌شده به ستون خودش می‌رود', () => {
    const staffIds = new Set(['s1', 's2']);
    const a = appt({ staffId: 's1', startAt: '2026-10-06T05:00:00.000Z' });
    const b = appt({ staffId: 's2', startAt: '2026-10-06T04:00:00.000Z' });
    const { byStaff, unassigned } = groupAppointmentsByStaff([a, b], staffIds);
    expect(byStaff.get('s1')).toEqual([a]);
    expect(byStaff.get('s2')).toEqual([b]);
    expect(unassigned).toHaveLength(0);
  });

  it('T2 — نوبت بی‌صاحب یا همکار ناشناخته → unassigned', () => {
    const staffIds = new Set(['s1']);
    const ghost = appt({ staffId: 'deleted-staff' });
    const none = appt({ staffId: '' });
    const { byStaff, unassigned } = groupAppointmentsByStaff([ghost, none], staffIds);
    expect(byStaff.size).toBe(0);
    expect(unassigned).toEqual([ghost, none]);
  });

  it('T3 — ترتیب داخل ستون بر اساس زمان شروع صعودی است', () => {
    const late = appt({ staffId: 's1', startAt: '2026-10-06T09:00:00.000Z' });
    const early = appt({ staffId: 's1', startAt: '2026-10-06T05:00:00.000Z' });
    const { byStaff } = groupAppointmentsByStaff([late, early], new Set(['s1']));
    expect(byStaff.get('s1')).toEqual([early, late]);
  });
});

describe('sessionStatsFromAppointments', () => {
  it('T4 — شمارش حاضر/غایب/درانتظار از نوبت‌های scheduled', () => {
    const stats = sessionStatsFromAppointments([
      appt({
        students: [
          { studentId: 'a', name: 'الف', attendance: 'present', phone: null},
          { studentId: 'b', name: 'ب', attendance: 'absent', phone: null},
          { studentId: 'c', name: 'پ', attendance: 'pending', phone: null}
        ]
      }),
      appt({
        students: [{ studentId: 'd', name: 'ت', attendance: 'present', phone: null}]
      })
    ]);
    expect(stats).toEqual({ total: 4, present: 2, absent: 1, pending: 1, cancelledAppointments: 0 });
  });

  it('T5 — نوبت لغوشده از آمار جلسات خارج و جداگانه شمرده می‌شود', () => {
    const stats = sessionStatsFromAppointments([
      appt({
        status: 'cancelled',
        students: [{ studentId: 'a', name: 'الف', attendance: 'cancelled', phone: null}]
      }),
      appt({
        students: [{ studentId: 'b', name: 'ب', attendance: 'present', phone: null}]
      })
    ]);
    expect(stats).toEqual({ total: 1, present: 1, absent: 0, pending: 0, cancelledAppointments: 1 });
  });

  it('T6 — نوبت بدون دانش‌آموز صفر شمرده می‌شود', () => {
    const stats = sessionStatsFromAppointments([appt({})]);
    expect(stats.total).toBe(0);
    expect(stats.pending).toBe(0);
  });
});

describe('normalizeDayNoteBody', () => {
  it('T7 — فاصله‌های تکراری و خطوط خالی اضافی فشرده می‌شوند', () => {
    expect(normalizeDayNoteBody('  سلام   دنیا  \n\n\n\nخط دوم   ')).toBe('سلام دنیا\n\nخط دوم');
  });

  it('T8 — CRLF به LF تبدیل می‌شود', () => {
    expect(normalizeDayNoteBody('خط یک\r\nخط دو')).toBe('خط یک\nخط دو');
  });

  it('T9 — متن فقط-فاصله خالی می‌شود (اعتبارسنجی min بعداً رد می‌کند)', () => {
    expect(normalizeDayNoteBody('   ')).toBe('');
  });
});
