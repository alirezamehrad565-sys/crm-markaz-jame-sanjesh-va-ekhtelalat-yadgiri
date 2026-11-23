// ۱.۲۷.۶۰ — رگرسیون نقد پرونده: قاعدهٔ جدول ۵ («وضعیت میز») روی تابع خالصِ واقعی پوسته — نه خواندن متن کد
import { describe, it, expect } from 'vitest';
// @ts-expect-error — ماژول خالص پوسته (بدون وابستگی) مستقیم وارد می‌شود
import { computeDeskState } from '../../public/assets/js/profile/desk-state.js';

const NOW = Date.parse('2026-11-23T10:00:00Z');
const appt = (startAt: string, myAttendance = 'pending', appointmentId = `a-${startAt}`) => ({
  appointmentId,
  status: 'scheduled',
  startAt,
  myAttendance
});

describe('computeDeskState — جدول ۵ نقد (قاعدهٔ وضعیت میز)', () => {
  it('۱) جلسهٔ گذشته با حضور ثبت‌نشده → برگزاری؛ قدیمی‌ترین جلسه هدف است', () => {
    const out = computeDeskState({
      appointments: [appt('2026-11-24T09:30:00Z', 'pending', 'future'), appt('2026-11-20T09:30:00Z', 'pending', 'old'), appt('2026-11-19T09:30:00Z', 'pending', 'older')],
      nowMs: NOW
    });
    expect(out.station).toBe('hold');
    expect(out.target?.appointmentId).toBe('older');
    expect(out.action).toContain('حضور');
  });

  it('۲) جلسهٔ حاضر بدون گزارش → ثبت گزارش؛ قدیمی‌ترین اول و غیبت شمرده نمی‌شود', () => {
    const out = computeDeskState({
      appointments: [appt('2026-11-18T09:30:00Z', 'present', 'r2'), appt('2026-11-10T09:30:00Z', 'absent', 'abs'), appt('2026-11-05T09:30:00Z', 'present', 'r1')],
      reportApptIds: [],
      nowMs: NOW
    });
    expect(out.station).toBe('log');
    expect(out.target?.appointmentId).toBe('r1');
  });

  it('۳) پیگیریِ عقب‌افتاده → پیگیری (وقتی جلسه‌ها تمیزند)', () => {
    const out = computeDeskState({
      appointments: [appt('2026-11-24T09:30:00Z', 'pending', 'fut')],
      openFollowups: [{ title: 'تماس با ولی', dueAt: '2026-11-01T00:00:00Z' }],
      nowMs: NOW
    });
    expect(out.station).toBe('follow');
    expect(out.action).toContain('عقب‌افتاده');
  });

  it('۴) جلسهٔ پیش‌رو در ۴۸ ساعت → آماده‌سازی (فرود درمانگر دیگر مستقیم «برگزاری» نیست)', () => {
    const out = computeDeskState({ appointments: [appt('2026-11-24T09:30:00Z', 'pending', 'fut')], nowMs: NOW });
    expect(out.station).toBe('ready');
    expect(out.target?.appointmentId).toBe('fut');
  });

  it('۵) هیچ‌کدام → آماده‌سازی بدون هدف (پروندهٔ تازه؛ بدون «ادامه از جلسهٔ قبل»)', () => {
    const out = computeDeskState({ appointments: [], openFollowups: [], nowMs: NOW });
    expect(out.station).toBe('ready');
    expect(out.target).toBeNull();
  });
});
