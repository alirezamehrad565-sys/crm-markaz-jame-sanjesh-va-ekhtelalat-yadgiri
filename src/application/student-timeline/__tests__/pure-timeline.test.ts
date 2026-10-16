/**
 * تست‌های واحد — pure-timeline
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// pure-timeline.test.ts — فاز ۶: merge قطعی، فیلتر، صفحه‌بندی، «اقدام بعدی»، ماتریس عنوان جلسه

import { describe, it, expect } from 'vitest';
import {
  mergeTimelineEvents,
  filterTimelineEvents,
  paginateTimeline,
  deriveNextAction,
  appointmentEventState,
  parseCompositeRef,
  jalaliDateTimeLabel,
  CASE_STATUS_LABELS_FA
} from '../pure';
import type { TimelineEvent } from '../types';

function ev(at: string, kind: TimelineEvent['kind'], title = 't', refId?: string): TimelineEvent {
  return { at, kind, title, subtitle: null, actor: null, ref: refId ? { type: 'x', id: refId } : null };
}

describe('mergeTimelineEvents — ترتیب قطعی', () => {
  it('at نزولی (جدیدترین اول)', () => {
    const merged = mergeTimelineEvents([ev('2025-01-01T00:00:00Z', 'student_created'), ev('2025-03-01T00:00:00Z', 'exercise'), ev('2025-02-01T00:00:00Z', 'tags')]);
    expect(merged.map((e) => e.at)).toEqual(['2025-03-01T00:00:00Z', '2025-02-01T00:00:00Z', '2025-01-01T00:00:00Z']);
  });

  it('tie-break: kind صعودی سپس ref.id صعودی', () => {
    const merged = mergeTimelineEvents([
      ev('2025-01-01T00:00:00Z', 'tags', 't', 'b'),
      ev('2025-01-01T00:00:00Z', 'followup', 't', 'c'),
      ev('2025-01-01T00:00:00Z', 'exercise', 't', 'a')
    ]);
    expect(merged.map((e) => [e.kind, e.ref?.id])).toEqual([
      ['exercise', 'a'],
      ['followup', 'c'],
      ['tags', 'b']
    ]);
  });

  it('حذف duplicate کامل (at+kind+ref+title) و بدون تغییر ورودی', () => {
    const input = [ev('2025-01-01T00:00:00Z', 'student_created'), ev('2025-01-01T00:00:00Z', 'student_created')];
    const merged = mergeTimelineEvents(input);
    expect(merged).toHaveLength(1);
    expect(input).toHaveLength(2); // ورودی دست‌نخورده
  });
});

describe('filterTimelineEvents — from/to/kinds', () => {
  const events = [
    ev('2025-01-05T10:00:00Z', 'appointment', 'a1'),
    ev('2025-02-05T10:00:00Z', 'exercise', 'a2'),
    ev('2025-03-05T10:00:00Z', 'session_note', 'a3')
  ];

  it('بازه from/to', () => {
    const out = filterTimelineEvents(events, { from: '2025-01-10T00:00:00Z', to: '2025-02-10T00:00:00Z' });
    expect(out.map((e) => e.title)).toEqual(['a2']);
  });

  it('فیلتر kinds — kind نامعتبر نادیده گرفته می‌شود (whitelist)', () => {
    const out = filterTimelineEvents(events, { kinds: ['exercise', 'not_a_kind' as never] });
    expect(out.map((e) => e.title)).toEqual(['a2']);
  });

  it('بدون فیلتر = همه', () => {
    expect(filterTimelineEvents(events, {})).toHaveLength(3);
  });
});

describe('paginateTimeline', () => {
  const events = Array.from({ length: 7 }, (_, i) => ev(`2025-01-0${i + 1}T00:00:00Z`, 'tags', `t${i}`));

  it('پیش‌فرض صفحه اول با limit', () => {
    const { page, hasMore } = paginateTimeline(events, 3, 0);
    expect(page).toHaveLength(3);
    expect(hasMore).toBe(true);
  });

  it('صفحه آخر — hasMore=false و صفحهٔ کوتاه', () => {
    const { page, hasMore } = paginateTimeline(events, 3, 6);
    expect(page).toHaveLength(1);
    expect(hasMore).toBe(false);
  });

  it('سقف ۲۰۰ اعمال می‌شود', () => {
    const big = Array.from({ length: 300 }, (_, i) => ev(`2025-01-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`, 'tags'));
    const { page } = paginateTimeline(big, 500, 0);
    expect(page).toHaveLength(200);
  });
});

describe('deriveNextAction — قاعدهٔ قطعی §14', () => {
  it('نوبت آینده مقدم بر پیگیری است', () => {
    const out = deriveNextAction(
      { id: 'a1', startAt: '2099-01-01T10:00:00Z', staffName: 'دکتر علی رضایی' },
      [{ id: 'f1', title: 'تماس با خانواده', dueAt: '2020-01-01T00:00:00Z' }]
    );
    expect(out?.type).toBe('appointment');
    expect(out?.title).toContain('دکتر علی رضایی');
  });

  it('بدون نوبت — بازترین پیگیری (earliest due_at؛ NULL در انتها)', () => {
    const out = deriveNextAction(null, [
      { id: 'f3', title: 'بدون مهلت', dueAt: null },
      { id: 'f2', title: 'مهلت دور', dueAt: '2099-06-01T00:00:00Z' },
      { id: 'f1', title: 'معوق', dueAt: '2020-01-01T00:00:00Z' }
    ]);
    expect(out?.type).toBe('followup');
    expect(out?.id).toBe('f1');
  });

  it('tie-break با id برای قطعیت', () => {
    const out = deriveNextAction(null, [
      { id: 'fb', title: 'x', dueAt: '2099-01-01T00:00:00Z' },
      { id: 'fa', title: 'y', dueAt: '2099-01-01T00:00:00Z' }
    ]);
    expect(out?.id).toBe('fa');
  });

  it('هیچ‌کدام → null', () => {
    expect(deriveNextAction(null, [])).toBeNull();
  });
});

describe('appointmentEventState — ماتریس عنوان وضعیت جلسه', () => {
  const base = { startAt: '2025-01-01T10:00:00Z', endAt: '2025-01-01T10:45:00Z' };

  it('لغو شده', () => {
    expect(appointmentEventState({ ...base, status: 'cancelled', opsStatus: null, attendance: 'cancelled' }).title).toBe('نوبت لغو شد');
  });
  it('no_show عملیاتی و غیبت قدیمی (بدون ops) هر دو عدم حضور', () => {
    expect(appointmentEventState({ ...base, status: 'scheduled', opsStatus: 'no_show', attendance: 'pending' }).title).toBe('جلسه — عدم حضور');
    expect(appointmentEventState({ ...base, status: 'scheduled', opsStatus: null, attendance: 'absent' }).title).toBe('جلسه — عدم حضور');
  });
  it('completed → برگزار شد با مدت', () => {
    const out = appointmentEventState({ ...base, status: 'scheduled', opsStatus: 'completed', attendance: 'present' });
    expect(out.title).toBe('جلسه برگزار شد');
    expect(out.subtitle).toContain('۴۵ دقیقه');
  });
  it('in_session / checked_in / delayed', () => {
    expect(appointmentEventState({ ...base, status: 'scheduled', opsStatus: 'in_session', attendance: 'present' }).title).toBe('جلسه در جریان است');
    expect(appointmentEventState({ ...base, status: 'scheduled', opsStatus: 'checked_in', attendance: 'present' }).title).toBe('جلسه — حضور ثبت شد');
    expect(appointmentEventState({ ...base, status: 'scheduled', opsStatus: 'delayed', attendance: 'pending' }).title).toBe('جلسه — تأخیر در شروع');
  });
  it('حضور قدیمی بدون ops → حضور ثبت شد', () => {
    expect(appointmentEventState({ ...base, status: 'scheduled', opsStatus: null, attendance: 'present' }).title).toBe('جلسه — حضور ثبت شد');
  });
  it('پیش‌فرض → نوبت جلسه (در انتظار برگزاری)', () => {
    const out = appointmentEventState({ ...base, status: 'scheduled', opsStatus: null, attendance: 'pending' });
    expect(out.title).toBe('نوبت جلسه');
    expect(out.subtitle).toContain('در انتظار برگزاری');
  });
});

describe('ابزارها', () => {
  it('parseCompositeRef — کامپوزیت معتبر/نامعتبر', () => {
    expect(parseCompositeRef('appt-1/student-2')).toEqual({ appointmentId: 'appt-1', studentId: 'student-2' });
    expect(parseCompositeRef('no-slash')).toBeNull();
    expect(parseCompositeRef('/only-suffix')).toBeNull();
    expect(parseCompositeRef('only-prefix/')).toBeNull();
  });

  it('jalaliDateTimeLabel — خروجی فارسی با ارقام فارسی', () => {
    const label = jalaliDateTimeLabel('2025-10-07T06:30:00Z'); // ۱۵ مهر ۱۴۰۴ ۱۰:۰۰ تهران
    expect(label).toMatch(/مهر/);
    expect(label).toMatch(/[۰-۹]/);
  });

  it('لیبل وضعیت پرونده کامل است (۵ مقدار §12.1)', () => {
    expect(Object.keys(CASE_STATUS_LABELS_FA)).toHaveLength(5);
    expect(CASE_STATUS_LABELS_FA.in_intervention).toBe('در مداخله');
  });
});
