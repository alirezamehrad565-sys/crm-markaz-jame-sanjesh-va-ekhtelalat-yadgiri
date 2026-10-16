/**
 * تست‌های واحد — reminders
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تست pure برنامه‌ریز یادآوری — بدون دیتابیس

import { describe, expect, it } from 'vitest';
import type { Appointment, NotificationPrefs } from '@core/shared';
import {
  buildEnqueueSummary,
  planReminders,
  reminderDedupKey,
  summarizeSkips
} from '../reminders';

// 2026-10-11T10:00:00Z → تهران 13:30
const NOW = '2026-10-11T10:00:00.000Z';
// 2026-10-12T06:00:00Z → تهران 2026-10-12 ساعت 09:30 (۲۰ ساعت بعد از NOW)
const START = '2026-10-12T06:00:00.000Z';

function appt(overrides: Partial<Appointment> & { id: string }): Appointment {
  return {
    staffId: 'staff-1',
    startAt: START,
    endAt: '2026-10-12T06:30:00.000Z',
    status: 'scheduled',
    note: null,
    version: 1,
    batchId: null,
    createdBy: 'staff-1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    students: [{ studentId: 'st-1', facetId: null, attendance: 'pending', note: null }],
    ...overrides
  };
}

function prefs(overrides: Partial<NotificationPrefs> = {}): NotificationPrefs {
  return {
    studentId: 'st-1',
    channel: 'bale',
    chatId: 'chat-123',
    remindersEnabled: true,
    reminderHoursBefore: 2,
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides
  };
}

function plan(list: Appointment[], prefList: NotificationPrefs[] = [prefs()]) {
  return planReminders({
    appointments: list,
    prefsByStudent: new Map(prefList.map((p) => [p.studentId, p])),
    studentNames: new Map([['st-1', 'علی محمدی']]),
    staffNames: new Map([['staff-1', 'دکتر علی رضایی']]),
    nowIso: NOW,
    horizonHours: 24,
    clinicName: 'مرکز جامع'
  });
}

describe('planReminders (pure)', () => {
  it('T1: مسیر خوشبین — plan کامل با payload درست تهران', () => {
    const r = plan([appt({ id: 'a1' })]);
    expect(r.considered).toBe(1);
    expect(r.plans).toHaveLength(1);
    expect(r.skips).toHaveLength(0);

    const p = r.plans[0];
    expect(p.appointmentId).toBe('a1');
    expect(p.studentId).toBe('st-1');
    expect(p.channel).toBe('bale');
    expect(p.recipient).toBe('chat-123');
    expect(p.dedupKey).toBe('reminder:a1:st-1');
    expect(p.payload.studentName).toBe('علی محمدی');
    expect(p.payload.staffName).toBe('دکتر علی رضایی');
    expect(p.payload.dateYmd).toBe('2026-10-12'); // روز تهران
    expect(p.payload.timeLabel).toBe('09:30');    // 06:00Z + 3:30
  });

  it('T2: reminders_enabled=false → رد با دلیل disabled', () => {
    const r = plan([appt({ id: 'a1' })], [prefs({ remindersEnabled: false })]);
    expect(r.plans).toHaveLength(0);
    expect(r.skips).toEqual([{ appointmentId: 'a1', studentId: 'st-1', reason: 'disabled' }]);
  });

  it('T3: بدون prefs یا بدون chat_id → رد با دلیل no_chat', () => {
    const none = plan([appt({ id: 'a1' })], []);
    expect(none.plans).toHaveLength(0);
    expect(none.skips[0].reason).toBe('no_chat');

    const noChat = plan([appt({ id: 'a1' })], [prefs({ chatId: null })]);
    expect(noChat.skips[0].reason).toBe('no_chat');
  });

  it('T4: فاصله کمتر از reminder_hours_before → رد با دلیل too_soon', () => {
    // شروع فقط ۱ ساعت بعد از NOW — pref با ۳ ساعت قبل → too_soon
    const soon = appt({ id: 'a1', startAt: '2026-10-11T11:00:00.000Z' });
    const r = plan([soon], [prefs({ reminderHoursBefore: 3 })]);
    expect(r.skips[0].reason).toBe('too_soon');
    expect(r.plans).toHaveLength(0);
  });

  it('T5: نوبت خارج از افق ۲۴ ساعته → رد با دلیل too_soon', () => {
    const far = appt({ id: 'a2', startAt: '2026-10-13T06:00:00.000Z' }); // ۴۴h بعد
    const r = plan([far]);
    expect(r.skips[0].reason).toBe('too_soon');
  });

  it('T6: نوبت گذشته → رد با دلیل too_soon', () => {
    const past = appt({ id: 'a3', startAt: '2026-10-10T06:00:00.000Z' });
    const r = plan([past]);
    expect(r.skips[0].reason).toBe('too_soon');
  });

  it('T7: نوبت cancelled → همه دانش‌آموزان رد با دلیل cancelled و counted نمی‌شوند', () => {
    const r = plan([appt({ id: 'a4', status: 'cancelled' })]);
    expect(r.considered).toBe(0);
    expect(r.plans).toHaveLength(0);
    expect(r.skips[0].reason).toBe('cancelled');
  });

  it('T8: حضور cancelled دانش‌آموز → رد و از considered خارج', () => {
    const r = plan([
      appt({
        id: 'a5',
        students: [
          { studentId: 'st-1', facetId: null, attendance: 'cancelled', note: null },
          { studentId: 'st-2', facetId: null, attendance: 'pending', note: null }
        ]
      })
    ], [prefs(), prefs({ studentId: 'st-2', chatId: 'chat-2' })]);
    expect(r.considered).toBe(1); // فقط st-2
    expect(r.skips).toHaveLength(1);
    expect(r.skips[0].reason).toBe('cancelled');
    expect(r.plans[0].studentId).toBe('st-2');
    expect(r.plans[0].recipient).toBe('chat-2');
  });

  it('T9: کانال prefs (internal) جایگزین پیش‌فرض می‌شود', () => {
    const r = plan([appt({ id: 'a6' })], [prefs({ channel: 'internal' })]);
    expect(r.plans[0].channel).toBe('internal');
  });

  it('T10: dedup key — الگوی ثابت reminder:{appt}:{student}', () => {
    expect(reminderDedupKey('APT', 'ST')).toBe('reminder:APT:ST');
  });

  it('T11: summarizeSkips و buildEnqueueSummary — شمارش درست دلایل', () => {
    const skips = [
      { appointmentId: 'a', studentId: 's1', reason: 'disabled' as const },
      { appointmentId: 'a', studentId: 's2', reason: 'no_chat' as const },
      { appointmentId: 'b', studentId: 's3', reason: 'too_soon' as const },
      { appointmentId: 'c', studentId: 's4', reason: 'cancelled' as const }
    ];
    const s = summarizeSkips(skips);
    expect(s).toEqual({ skippedDisabled: 1, skippedNoChat: 1, skippedTooSoon: 1, cancelled: 1 });

    const summary = buildEnqueueSummary(
      { plans: [{ appointmentId: 'a', studentId: 's1', staffId: 'x', channel: 'bale', recipient: 'c', dedupKey: 'd', payload: {} }], skips, considered: 4 },
      3,
      1,
      NOW,
      '2026-10-12T10:00:00.000Z'
    );
    expect(summary.enqueued).toBe(3);
    expect(summary.duplicates).toBe(1);
    expect(summary.skippedDisabled).toBe(1);
    expect(summary.horizonFrom).toBe(NOW);
  });
});
