import { describe, expect, it } from 'vitest';
import { planLifecycleNotifications, buildScheduleEntries } from '../lifecycle';
import { renderScheduleMessage, renderTemplate } from '@core/notify';
import type { Appointment, CenterHourRange } from '@core/shared';
import { findOverlap } from '@domain/working-hours/rules';

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    staffId: 'staff-1',
    startAt: '2026-10-05T06:30:00.000Z', // 10:00 تهران
    endAt: '2026-10-05T07:30:00.000Z',   // 11:00 تهران
    status: 'scheduled',
    note: null,
    version: 1,
    batchId: null,
    createdBy: 'staff-1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    students: [
      { studentId: 'stu-1', facetId: null, attendance: 'pending', note: null },
      { studentId: 'stu-2', facetId: null, attendance: 'pending', note: null }
    ],
    ...overrides
  };
}

const NAMES = new Map([
  ['stu-1', 'علی رضایی'],
  ['stu-2', 'سارا محمدی']
]);

const TARGETS = new Map([
  ['stu-1', { channel: 'bale' as const, chatId: '111' }],
  ['stu-2', { channel: 'internal' as const, chatId: '222' }]
]);

describe('planLifecycleNotifications', () => {
  it('creates one parent plan per student + one staff plan', () => {
    const plans = planLifecycleNotifications({
      event: 'created',
      appointment: makeAppointment(),
      staffName: 'استاد کریم',
      studentNames: NAMES,
      studentTargets: TARGETS,
      staffChats: ['999'],
      enabled: true,
      clinicName: 'مرکز جامع'
    });

    expect(plans).toHaveLength(3);

    const parentPlans = plans.filter((p) => p.studentId !== null);
    expect(parentPlans).toHaveLength(2);
    expect(parentPlans.map((p) => p.recipient).sort()).toEqual(['111', '222']);
    for (const p of parentPlans) {
      expect(p.template).toBe('appointment_created');
      expect(p.payload.dateYmd).toBe('2026-10-05');
      expect(p.payload.timeLabel).toBe('10:00');
    }

    const staffPlans = plans.filter((p) => p.staffId !== null);
    expect(staffPlans).toHaveLength(1);
    expect(staffPlans[0]!.template).toBe('staff_appointment_created');
    expect(staffPlans[0]!.payload.studentsLine).toBe('علی رضایی، سارا محمدی');
  });

  it('uses changed templates + old time for moved events', () => {
    const plans = planLifecycleNotifications({
      event: 'moved',
      appointment: makeAppointment(),
      previous: { startAt: '2026-10-04T06:30:00.000Z', endAt: '2026-10-04T07:30:00.000Z' },
      staffName: 'استاد کریم',
      studentNames: NAMES,
      studentTargets: TARGETS,
      staffChats: ['999'],
      enabled: true
    });

    for (const p of plans.filter((x) => x.studentId !== null)) {
      expect(p.template).toBe('appointment_changed');
      expect(p.payload.oldDateYmd).toBe('2026-10-04');
      expect(p.payload.oldTimeLabel).toBe('10:00');
    }
    expect(plans.find((p) => p.staffId !== null)!.template).toBe('staff_appointment_changed');
  });

  it('returns nothing when the settings flag is off', () => {
    const plans = planLifecycleNotifications({
      event: 'cancelled',
      appointment: makeAppointment(),
      staffName: '',
      studentNames: NAMES,
      studentTargets: TARGETS,
      staffChats: ['999'],
      enabled: false
    });
    expect(plans).toEqual([]);
  });

  it('skips students without chat and cancelled attendance', () => {
    const plans = planLifecycleNotifications({
      event: 'created',
      appointment: makeAppointment({
        students: [
          { studentId: 'stu-1', facetId: null, attendance: 'pending', note: null }, // بدون chat
          { studentId: 'stu-2', facetId: null, attendance: 'cancelled', note: null }
        ]
      }),
      staffName: 'استاد',
      studentNames: NAMES,
      studentTargets: new Map(), // هیچ ولیّی chat متصل ندارد
      staffChats: [],
      enabled: true
    });

    expect(plans).toHaveLength(0);
  });

  it('dedup key differs per event and per previous time', () => {
    const base = {
      appointment: makeAppointment(),
      staffName: '',
      studentNames: NAMES,
      studentTargets: TARGETS,
      staffChats: ['999'],
      enabled: true
    };
    const a = planLifecycleNotifications({ ...base, event: 'created' });
    const b = planLifecycleNotifications({
      ...base,
      event: 'moved',
      previous: { startAt: '2026-10-04T06:30:00.000Z', endAt: '2026-10-04T07:30:00.000Z' }
    });
    const c = planLifecycleNotifications({
      ...base,
      event: 'moved',
      previous: { startAt: '2026-10-03T06:30:00.000Z', endAt: '2026-10-03T07:30:00.000Z' }
    });

    expect(a[0]!.dedupKey).not.toBe(b[0]!.dedupKey);
    expect(b[0]!.dedupKey).not.toBe(c[0]!.dedupKey);
  });
});

describe('planLifecycleNotifications — معلم مدرسه', () => {
  const CLASS_TARGETS = new Map([
    ['stu-1', { channel: 'bale' as const, chatId: '777', className: 'کلاس دوم الف' }]
  ]);

  it('creates a teacher plan per connected class chat with class template', () => {
    const plans = planLifecycleNotifications({
      event: 'created',
      appointment: makeAppointment(),
      staffName: 'استاد کریم',
      studentNames: NAMES,
      studentTargets: new Map(),
      staffChats: [],
      classTargets: CLASS_TARGETS,
      enabled: true,
      clinicName: 'مرکز جامع'
    });

    expect(plans).toHaveLength(1);
    const t = plans[0]!;
    expect(t.template).toBe('teacher_appointment_created');
    expect(t.recipient).toBe('777');
    expect(t.studentId).toBe('stu-1');
    expect(t.staffId).toBeNull();
    expect(t.payload.className).toBe('کلاس دوم الف');
    expect(t.payload.studentName).toBe('علی رضایی');
    expect(t.dedupKey).toContain(':class:777');
  });

  it('skips cancelled students for teacher plans too', () => {
    const appt = makeAppointment({
      students: [{ studentId: 'stu-1', facetId: null, attendance: 'cancelled', note: null }]
    });
    const plans = planLifecycleNotifications({
      event: 'moved',
      appointment: appt,
      previous: { startAt: '2026-10-04T06:30:00.000Z', endAt: '2026-10-04T07:30:00.000Z' },
      staffName: '',
      studentNames: NAMES,
      studentTargets: new Map(),
      staffChats: [],
      classTargets: CLASS_TARGETS,
      enabled: true
    });
    expect(plans).toHaveLength(0);
  });

  it('uses changed template + old time for moved event with class target', () => {
    const plans = planLifecycleNotifications({
      event: 'moved',
      appointment: makeAppointment(),
      previous: { startAt: '2026-10-04T06:30:00.000Z', endAt: '2026-10-04T07:30:00.000Z' },
      staffName: '',
      studentNames: NAMES,
      studentTargets: new Map(),
      staffChats: [],
      classTargets: CLASS_TARGETS,
      enabled: true
    });
    expect(plans[0]!.template).toBe('teacher_appointment_changed');
    expect(plans[0]!.payload.oldDateYmd).toBe('2026-10-04');
  });

  it('renders teacher templates with class name and clinic', () => {
    const created = renderTemplate('teacher_appointment_created', {
      studentName: 'علی', className: 'دوم الف', dateYmd: '2026-10-05', timeLabel: '10:00', clinicName: 'مرکز جامع'
    });
    expect(created).toContain('علی');
    expect(created).toContain('دوم الف');
    expect(created).toContain('مرکز جامع');
    const report = renderTemplate('teacher_report', {
      studentName: 'علی', className: 'دوم الف', extra: 'گزارش جلسه امروز', clinicName: 'مرکز جامع'
    });
    expect(report).toContain('گزارش جلسه امروز');
  });
});

describe('buildScheduleEntries + renderScheduleMessage', () => {
  it('builds staff-view entries grouped by names', () => {
    const entries = buildScheduleEntries([makeAppointment()], { kind: 'staff', names: NAMES });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.timeLabel).toBe('10:00');
    expect(entries[0]!.title).toBe('علی رضایی، سارا محمدی');
    expect(entries[0]!.cancelled).toBe(false);
  });

  it('builds student-view entries with staff name', () => {
    const staffNames = new Map([['staff-1', 'استاد کریم']]);
    const entries = buildScheduleEntries([makeAppointment()], { kind: 'student', names: staffNames });
    expect(entries[0]!.title).toBe('استاد کریم');
  });

  it('renders empty schedule with hint', () => {
    const msg = renderScheduleMessage({ title: 'برنامه امروز شما', entries: [] });
    expect(msg).toContain('موردی برای این بازه ثبت نشده است');
  });

  it('renders entries with time and cancelled marker', () => {
    const msg = renderScheduleMessage({
      title: 'برنامه امروز شما',
      entries: [
        { timeLabel: '10:00', title: 'علی', cancelled: false },
        { timeLabel: '12:00', title: 'سارا', cancelled: true }
      ]
    });
    expect(msg).toContain('۱۰:۰۰  علی');
    expect(msg).toContain('۱۲:۰۰  سارا (لغوشده)');
  });
});

describe('center hours overlap rule ( settings)', () => {
  it('rejects overlapping center hour ranges', () => {
    const items: CenterHourRange[] = [
      { weekday: 0, startMinute: 540, endMinute: 1020 },
      { weekday: 0, startMinute: 960, endMinute: 1080 }
    ];
    expect(findOverlap(items)).not.toBeNull();
  });

  it('allows disjoint ranges on same weekday', () => {
    const items: CenterHourRange[] = [
      { weekday: 0, startMinute: 540, endMinute: 720 },
      { weekday: 0, startMinute: 780, endMinute: 1020 }
    ];
    expect(findOverlap(items)).toBeNull();
  });
});
