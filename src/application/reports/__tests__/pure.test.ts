import { describe, it, expect } from 'vitest';
import { buildDaySeries, buildPerStaff, buildTopStudents, safeRate, daysBetween } from '../pure';

const TZ_OFFSET = 210 * 60 * 1000; // تهران +03:30

function tehranIso(ymd: string, hour = 10): string {
  const h = Math.floor(hour);
  return new Date(Date.parse(`${ymd}T${String(h).padStart(2, '0')}:00:00.000Z`) - TZ_OFFSET).toISOString();
}

describe('daysBetween', () => {
  it('تعداد روز شامل دو سر', () => {
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(1);
    expect(daysBetween('2026-09-01', '2026-09-30')).toBe(30);
  });
});

describe('buildDaySeries', () => {
  it('همه روزهای بازه را می‌سازد حتی خالی', () => {
    const series = buildDaySeries([], '2026-10-01', '2026-10-03');
    expect(series).toHaveLength(3);
    expect(series[1]).toEqual({ date: '2026-10-02', total: 0, cancelled: 0 });
  });

  it('نوبت‌ها به روز تهران درست تخصیص می‌شوند', () => {
    const series = buildDaySeries(
      [
        { startAt: tehranIso('2026-10-06', 9), status: 'scheduled' },
        { startAt: tehranIso('2026-10-06', 14), status: 'cancelled' },
        { startAt: tehranIso('2026-10-07', 10), status: 'scheduled' }
      ],
      '2026-10-06',
      '2026-10-07'
    );
    expect(series[0]).toEqual({ date: '2026-10-06', total: 2, cancelled: 1 });
    expect(series[1]).toEqual({ date: '2026-10-07', total: 1, cancelled: 0 });
  });
});

describe('buildPerStaff', () => {
  it('جلسه/ساعت/لغوشده هر همکار', () => {
    const rows = [
      { appointmentId: '1', staffId: 's1', startAt: tehranIso('2026-10-06', 9), endAt: tehranIso('2026-10-06', 10), status: 'scheduled' },
      { appointmentId: '2', staffId: 's1', startAt: tehranIso('2026-10-06', 11), endAt: tehranIso('2026-10-06', 12), status: 'cancelled' },
      { appointmentId: '3', staffId: 's2', startAt: tehranIso('2026-10-06', 9), endAt: tehranIso('2026-10-06', 9), status: 'scheduled' }
    ];
    const out = buildPerStaff(rows, new Map([['s1', 'دکتر الف'], ['s2', 'دکتر ب']]), new Map());
    expect(out).toHaveLength(2);
    const s1 = out.find((r) => r.staffId === 's1')!;
    expect(s1.sessions).toBe(1);
    expect(s1.cancelled).toBe(1);
    expect(s1.hours).toBe(1);
    const total = out.reduce((a, r) => a + r.sessions, 0);
    expect(total).toBe(2);
  });
});

describe('buildTopStudents', () => {
  it('رتبه‌بندی با شمار غیبت — لغوشده‌ها حذف', () => {
    const rows = [
      { studentId: 'a', studentName: 'علی', attendance: 'present', apptStatus: 'scheduled' },
      { studentId: 'a', studentName: 'علی', attendance: 'present', apptStatus: 'scheduled' },
      { studentId: 'a', studentName: 'علی', attendance: 'absent', apptStatus: 'scheduled' },
      { studentId: 'b', studentName: 'زهرا', attendance: 'present', apptStatus: 'scheduled' },
      { studentId: 'b', studentName: 'زهرا', attendance: 'pending', apptStatus: 'cancelled' }
    ];
    const out = buildTopStudents(rows);
    expect(out[0].studentId).toBe('a');
    expect(out[0].sessions).toBe(3);
    expect(out[0].absents).toBe(1);
    const b = out.find((r) => r.studentId === 'b')!;
    expect(b.sessions).toBe(1); // لغوشده حذف شد
  });

  it('محدودیت limit', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      studentId: `s${i}`,
      studentName: `نام ${i}`,
      attendance: 'present',
      apptStatus: 'scheduled'
    }));
    expect(buildTopStudents(rows, 10)).toHaveLength(10);
  });
});

describe('safeRate', () => {
  it('صفر روی مخرج صفر', () => {
    expect(safeRate(1, 0)).toBe(0);
  });
  it('گرد به سه اعشار', () => {
    expect(safeRate(1, 3)).toBe(0.333);
    expect(safeRate(2, 4)).toBe(0.5);
  });
});
