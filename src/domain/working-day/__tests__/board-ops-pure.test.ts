import { describe, expect, it } from 'vitest';
import { buildQueue, isTerminalOps, opsStatsFromAppointments } from '../pure';
import type { WorkingDayAppointment } from '@core/shared';

function appt(partial: Partial<WorkingDayAppointment>): WorkingDayAppointment {
  return {
    id: partial.id ?? crypto.randomUUID(),
    staffId: partial.staffId ?? 's1',
    startAt: partial.startAt ?? '2026-10-06T05:00:00.000Z',
    endAt: partial.endAt ?? '2026-10-06T05:30:00.000Z',
    status: partial.status ?? 'scheduled',
    opsStatus: partial.opsStatus ?? null,
    note: null,
    version: 1,
    students: partial.students ?? []
  };
}

const NOW = '2026-10-06T07:00:00.000Z'; // مرجع زمان صف

describe('opsStatsFromAppointments (نوار وضعیت §7.1)', () => {
  it('T10 — هر وضعیت در ستون خودش شمرده می‌شود', () => {
    const stats = opsStatsFromAppointments([
      appt({}),                                                  // برنامه‌ریزی‌شده
      appt({ opsStatus: 'checked_in' }),
      appt({ opsStatus: 'delayed' }),
      appt({ opsStatus: 'in_session' }),
      appt({ opsStatus: 'completed' }),
      appt({ opsStatus: 'no_show' }),
      appt({ status: 'cancelled' })                              // از status می‌آید
    ]);
    expect(stats).toEqual({
      planned: 1,
      checkedIn: 1,
      delayed: 1,
      inSession: 1,
      completed: 1,
      noShow: 1,
      cancelled: 1,
      total: 7
    });
  });

  it('T11 — نوبت لغوشده با ops_statusِ مانده فقط cancelled شمرده می‌شود', () => {
    const stats = opsStatsFromAppointments([
      appt({ status: 'cancelled', opsStatus: 'in_session' })
    ]);
    expect(stats.cancelled).toBe(1);
    expect(stats.inSession).toBe(0);
    expect(stats.total).toBe(1);
  });

  it('T12 — روز خالی همه صفر', () => {
    const stats = opsStatsFromAppointments([]);
    expect(stats.total).toBe(0);
    expect(stats.planned).toBe(0);
  });
});

describe('buildQueue (صف ۶۰ دقیقه §7.2)', () => {
  it('T13 — نوبت بدون وضعیت داخل پنجرهٔ ۶۰ دقیقه وارد صف می‌شود، بیرون پنجره نه', () => {
    const inside = appt({ startAt: '2026-10-06T07:30:00.000Z', endAt: '2026-10-06T08:15:00.000Z' });
    const outside = appt({ startAt: '2026-10-06T08:30:00.000Z', endAt: '2026-10-06T09:00:00.000Z' });
    const q = buildQueue([inside, outside], NOW, { staffNameOf: () => 'علی' });
    expect(q.map((i) => i.appointmentId)).toEqual([inside.id]);
  });

  it('T14 — نوبت‌های شروع‌شدهٔ باز (آمد/تأخیر/در جلسه) فارغ از زمان در صف می‌مانند', () => {
    const pastCheckedIn = appt({ startAt: '2026-10-06T05:00:00.000Z', opsStatus: 'checked_in' });
    const pastDelayed = appt({ startAt: '2026-10-06T05:15:00.000Z', opsStatus: 'delayed' });
    const pastInSession = appt({ startAt: '2026-10-06T05:30:00.000Z', opsStatus: 'in_session' });
    const q = buildQueue([pastCheckedIn, pastDelayed, pastInSession], NOW, { staffNameOf: () => 'علی' });
    expect(q).toHaveLength(3);
  });

  it('T15 — پایان‌حالت‌ها و لغوشده از صف خارج می‌شوند', () => {
    const done = appt({ opsStatus: 'completed' });
    const noShow = appt({ opsStatus: 'no_show' });
    const cancelled = appt({ status: 'cancelled' });
    const q = buildQueue([done, noShow, cancelled], NOW, { staffNameOf: () => 'علی' });
    expect(q).toHaveLength(0);
  });

  it('T16 — ترتیب زمان شروع صعودی + نگاشت نام همکار و دانش‌آموزان', () => {
    const later = appt({
      startAt: '2026-10-06T07:45:00.000Z',
      staffId: 's2',
      students: [{ studentId: 'd1', name: 'سارا کریمی', attendance: 'pending', phone: null}]
    });
    const earlier = appt({
      startAt: '2026-10-06T07:10:00.000Z',
      staffId: 's1',
      students: [{ studentId: 'a1', name: 'علی محمدی', attendance: 'pending', phone: null}]
    });
    const names = new Map([['s1', 'علی رضایی'], ['s2', 'مریم احمدی']]);
    const q = buildQueue([later, earlier], NOW, { staffNameOf: (id) => names.get(id) ?? '—' });
    expect(q.map((i) => i.appointmentId)).toEqual([earlier.id, later.id]);
    expect(q[0].staffName).toBe('علی رضایی');
    expect(q[1].staffName).toBe('مریم احمدی');
    expect(q[0].studentNames).toEqual(['علی محمدی']);
    expect(q[1].studentNames).toEqual(['سارا کریمی']);
  });

  it('T17 — همکار ناشناخته → «—»؛ پنجرهٔ سفارشی رعایت می‌شود', () => {
    const soon = appt({ startAt: '2026-10-06T08:45:00.000Z' }); // ۱۰۵ دقیقه بعد
    const q60 = buildQueue([soon], NOW, { staffNameOf: () => '—' });
    expect(q60).toHaveLength(0);
    const q120 = buildQueue([soon], NOW, { windowMinutes: 120, staffNameOf: () => '—' });
    expect(q60).toHaveLength(0);
    expect(q120).toHaveLength(1);
    expect(q120[0].staffName).toBe('—');
  });
});

describe('isTerminalOps', () => {
  it('T18 — فقط completed و no_show پایان‌حالت‌اند', () => {
    expect(isTerminalOps('completed')).toBe(true);
    expect(isTerminalOps('no_show')).toBe(true);
    expect(isTerminalOps('checked_in')).toBe(false);
    expect(isTerminalOps('delayed')).toBe(false);
    expect(isTerminalOps('in_session')).toBe(false);
    expect(isTerminalOps(null)).toBe(false);
    expect(isTerminalOps(undefined)).toBe(false);
  });
});
