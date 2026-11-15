import { describe, it, expect } from 'vitest';
import { weekStartOfYmd, buildWeeklyTrend, avgWaitDaysOf, safeRateOrNull } from '../pure';

describe('weekStartOfYmd (شنبه‌محور)', () => {
  it('W1: شنبه همان روز است', () => {
    expect(weekStartOfYmd('2026-10-03')).toBe('2026-10-03');
  });

  it('W2: وسط هفته به شنبهٔ همان هفته برمی‌گردد', () => {
    expect(weekStartOfYmd('2026-10-05')).toBe('2026-10-03');
    expect(weekStartOfYmd('2026-10-09')).toBe('2026-10-03');
  });

  it('W3: یکشنبه به شنبهٔ قبل برمی‌گردد (هفته شنبه شروع می‌شود)', () => {
    expect(weekStartOfYmd('2026-10-04')).toBe('2026-10-03');
  });
});

describe('buildWeeklyTrend', () => {
  const base = '2026-10-03'; // شنبه

  it('W4: هفتهٔ خالی صفر می‌دهد — بدون پرش هفته', () => {
    const weeks = buildWeeklyTrend([], [], base, '2026-10-16'); // دو هفته
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toEqual({ weekStart: base, sessions: 0, completed: 0, cancelled: 0, attendanceRate: null });
  });

  it('W5: نوبت‌ها به هفتهٔ درست می‌روند — لغوشده جزو sessions نیست', () => {
    const appts = [
      { startAt: '2026-10-03T06:00:00.000Z', status: 'scheduled' }, // شنبه هفتهٔ ۱
      { startAt: '2026-10-04T06:00:00.000Z', status: 'scheduled' }, // یکشنبه هفتهٔ ۱
      { startAt: '2026-10-05T06:00:00.000Z', status: 'cancelled' }, // لغوشده هفتهٔ ۱
      { startAt: '2026-10-09T06:00:00.000Z', status: 'scheduled' }, // جمعه هفتهٔ ۱
      { startAt: '2026-10-10T06:00:00.000Z', status: 'scheduled' }  // شنبهٔ بعد — خارج از سبد
    ];
    const weeks = buildWeeklyTrend(appts, [], base, '2026-10-09');
    expect(weeks).toHaveLength(1);
    expect(weeks[0].sessions).toBe(3);
    expect(weeks[0].cancelled).toBe(1);
  });

  it('W5b: «جلسات تکمیل‌شده» بر پایهٔ حضور — همهٔ دانش‌آموزان حاضر/تأخیر = تکمیل؛ غایب یا درانتظار = نه', () => {
    const appts = [
      { startAt: '2026-10-03T06:00:00.000Z', status: 'scheduled' }, // همه حاضر → تکمیل
      { startAt: '2026-10-04T06:00:00.000Z', status: 'scheduled' }, // یک غایب → نه
      { startAt: '2026-10-05T06:00:00.000Z', status: 'cancelled' }, // لغوشده → نه حتی با حاضر
      { startAt: '2026-10-06T06:00:00.000Z', status: 'scheduled' }  // درانتظار → نه
    ];
    const att = [
      { appointmentId: 'a1', startAt: '2026-10-03T06:00:00.000Z', attendance: 'present', apptStatus: 'scheduled' },
      { appointmentId: 'a1', startAt: '2026-10-03T06:00:00.000Z', attendance: 'late', apptStatus: 'scheduled' },
      { appointmentId: 'a2', startAt: '2026-10-04T06:00:00.000Z', attendance: 'present', apptStatus: 'scheduled' },
      { appointmentId: 'a2', startAt: '2026-10-04T06:00:00.000Z', attendance: 'absent', apptStatus: 'scheduled' },
      { appointmentId: 'a3', startAt: '2026-10-05T06:00:00.000Z', attendance: 'present', apptStatus: 'cancelled' },
      { appointmentId: 'a4', startAt: '2026-10-06T06:00:00.000Z', attendance: 'pending', apptStatus: 'scheduled' }
    ];
    const weeks = buildWeeklyTrend(appts, att, base, base);
    expect(weeks[0].completed).toBe(1);
  });

  it('W6: نرخ حضور هفته = present/(present+absent) — نوبت لغوشده لحاظ نمی‌شود', () => {
    const appts = [{ startAt: '2026-10-03T06:00:00.000Z', status: 'scheduled' }];
    const att = [
      { appointmentId: 'a1', startAt: '2026-10-03T06:00:00.000Z', attendance: 'present', apptStatus: 'scheduled' },
      { appointmentId: 'a1', startAt: '2026-10-03T06:00:00.000Z', attendance: 'absent', apptStatus: 'scheduled' },
      { appointmentId: 'a1', startAt: '2026-10-03T06:00:00.000Z', attendance: 'pending', apptStatus: 'scheduled' },
      { appointmentId: 'a2', startAt: '2026-10-03T06:00:00.000Z', attendance: 'present', apptStatus: 'cancelled' } // لغوشده — نادیده
    ];
    const weeks = buildWeeklyTrend(appts, att, base, base);
    expect(weeks[0].attendanceRate).toBeCloseTo(1 / 2, 3);
  });

  it('W7: نوبت خارج از بازه نادیده گرفته می‌شود', () => {
    const appts = [
      { startAt: '2026-09-20T06:00:00.000Z', status: 'scheduled' }, // قبل از بازه
      { startAt: '2026-10-03T06:00:00.000Z', status: 'scheduled' }
    ];
    const weeks = buildWeeklyTrend(appts, [], base, base);
    expect(weeks[0].sessions).toBe(1);
  });
});

describe('نرخ‌ها و میانگین', () => {
  it('W8: safeRateOrNull — مخرج صفر → null (الگوی «—» نمایشی)', () => {
    expect(safeRateOrNull(1, 2)).toBe(0.5);
    expect(safeRateOrNull(5, 0)).toBeNull();
  });

  it('W9: avgWaitDaysOf — میانگین با یک رقم اعشار', () => {
    const v = avgWaitDaysOf([
      { createdAt: '2026-10-01T00:00:00.000Z', admittedAt: '2026-10-03T00:00:00.000Z' }, // 2 روز
      { createdAt: '2026-10-01T00:00:00.000Z', admittedAt: '2026-10-04T00:00:00.000Z' }  // 3 روز
    ]);
    expect(v).toBe(2.5);
  });

  it('W10: avgWaitDaysOf — جفت نامعتبر نادیده؛ خالی → null', () => {
    expect(avgWaitDaysOf([])).toBeNull();
    const v = avgWaitDaysOf([
      { createdAt: '2026-10-05T00:00:00.000Z', admittedAt: '2026-10-01T00:00:00.000Z' }, // قبل از ثبت — نادیده
      { createdAt: '2026-10-01T00:00:00.000Z', admittedAt: '2026-10-11T00:00:00.000Z' }  // 10 روز
    ]);
    expect(v).toBe(10);
  });
});
