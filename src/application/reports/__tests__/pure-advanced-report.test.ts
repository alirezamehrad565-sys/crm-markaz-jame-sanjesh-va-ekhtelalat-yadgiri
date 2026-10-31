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
      { startAt: '2026-10-03T06:00:00.000Z', status: 'scheduled', opsStatus: 'completed' }, // شنبه هفتهٔ ۱
      { startAt: '2026-10-04T06:00:00.000Z', status: 'scheduled', opsStatus: null },        // یکشنبه هفتهٔ ۱
      { startAt: '2026-10-05T06:00:00.000Z', status: 'cancelled', opsStatus: null },        // لغوشده هفتهٔ ۱
      { startAt: '2026-10-09T06:00:00.000Z', status: 'scheduled', opsStatus: 'completed' }, // جمعه هفتهٔ ۱
      { startAt: '2026-10-10T06:00:00.000Z', status: 'scheduled', opsStatus: 'completed' }  // شنبهٔ بعد — خارج از سبد
    ];
    const weeks = buildWeeklyTrend(appts, [], base, '2026-10-09');
    expect(weeks).toHaveLength(1);
    expect(weeks[0].sessions).toBe(3);
    expect(weeks[0].cancelled).toBe(1);
    expect(weeks[0].completed).toBe(2);
  });

  it('W6: نرخ حضور هفته = present/(present+absent) — نوبت لغوشده لحاظ نمی‌شود', () => {
    const appts = [{ startAt: '2026-10-03T06:00:00.000Z', status: 'scheduled', opsStatus: null }];
    const att = [
      { startAt: '2026-10-03T06:00:00.000Z', attendance: 'present', apptStatus: 'scheduled' },
      { startAt: '2026-10-03T06:00:00.000Z', attendance: 'absent', apptStatus: 'scheduled' },
      { startAt: '2026-10-03T06:00:00.000Z', attendance: 'pending', apptStatus: 'scheduled' },
      { startAt: '2026-10-03T06:00:00.000Z', attendance: 'present', apptStatus: 'cancelled' } // لغوشده — نادیده
    ];
    const weeks = buildWeeklyTrend(appts, att, base, base);
    expect(weeks[0].attendanceRate).toBeCloseTo(1 / 2, 3);
  });

  it('W7: نوبت خارج از بازه نادیده گرفته می‌شود', () => {
    const appts = [
      { startAt: '2026-09-20T06:00:00.000Z', status: 'scheduled', opsStatus: null }, // قبل از بازه
      { startAt: '2026-10-03T06:00:00.000Z', status: 'scheduled', opsStatus: null }
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
