import { describe, it, expect } from 'vitest';
import {
  mergeTimelineEvents,
  filterTimelineEvents,
  paginateTimeline,
  deriveNextAction,
  appointmentEventState,
  parseCompositeRef,
  jalaliDateTimeLabel,
  periodizeTimeline,
  CASE_STATUS_LABELS_FA
} from '../pure';
import type { TimelineEvent } from '../types';

function ev(at: string, kind: TimelineEvent['kind'], title = 't', refId?: string, extra: Partial<TimelineEvent> = {}): TimelineEvent {
  return { at, kind, title, subtitle: null, actor: null, ref: refId ? { type: 'x', id: refId } : null, ...extra };
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

  it('موج ۲ — جست‌وجوی q روی title/subtitle/actor (متن فارسی و لاتین)', () => {
    const evs = [
      ev('2025-01-05T10:00:00Z', 'appointment', 'جلسه — حضور ثبت شد'),
      Object.assign(ev('2025-02-05T10:00:00Z', 'case_event', 'رویداد: چک‌لیست', 'ce1'), { subtitle: 'تمرین تنفس', actor: 'معلم: سارا' }),
      Object.assign(ev('2025-03-05T10:00:00Z', 'session_note', 'گزارش جلسه ثبت شد', 'n1'), { actor: 'دکتر رضایی' })
    ];
    expect(filterTimelineEvents(evs, { q: 'تنفس' }).map((x) => x.title)).toEqual(['رویداد: چک‌لیست']);
    expect(filterTimelineEvents(evs, { q: 'رضا' })).toHaveLength(1);
    expect(filterTimelineEvents(evs, { q: 'حضور' })).toHaveLength(1);
    expect(filterTimelineEvents(evs, { q: '   ' })).toHaveLength(3); // فقط فاصله = بی‌فیلتر
    expect(filterTimelineEvents(evs, { q: 'چیزی-که-نیست' })).toHaveLength(0);
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

describe('appointmentEventState — ماتریس عنوان وضعیت جلسه (۱.۱۸.۰: فقط حضور و غیاب)', () => {
  const base = { startAt: '2025-01-01T10:00:00Z', endAt: '2025-01-01T10:45:00Z' };

  it('لغو شده', () => {
    expect(appointmentEventState({ ...base, status: 'cancelled', attendance: 'cancelled' }).title).toBe('نوبت لغو شد');
  });
  it('غایب → عدم حضور', () => {
    expect(appointmentEventState({ ...base, status: 'scheduled', attendance: 'absent' }).title).toBe('جلسه — عدم حضور');
  });
  it('تأخیر → حضور با تأخیر', () => {
    expect(appointmentEventState({ ...base, status: 'scheduled', attendance: 'late' }).title).toBe('جلسه — حضور با تأخیر');
  });
  it('حاضر → حضور ثبت شد با مدت', () => {
    const out = appointmentEventState({ ...base, status: 'scheduled', attendance: 'present' });
    expect(out.title).toBe('جلسه — حضور ثبت شد');
    expect(out.subtitle).toContain('۴۵ دقیقه');
  });
  /* ۱.۲۷.۵۹ — نقد پرونده: جلسهٔ گذشتهٔ بدون ثبت حضور دیگر «در انتظار برگزاری» نیست */
  it('گذشتهٔ بدون ثبت حضور → حضور ثبت نشده (۱.۲۷.۵۹)', () => {
    const out = appointmentEventState({ ...base, status: 'scheduled', attendance: 'pending' }, Date.parse('2025-02-01T00:00:00Z'));
    expect(out.title).toBe('جلسه — حضور ثبت نشده');
    expect(out.subtitle).toContain('برگزار شد');
  });
  it('آیندهٔ بدون ثبت حضور → نوبت جلسه (در انتظار برگزاری)', () => {
    const out = appointmentEventState({ ...base, status: 'scheduled', attendance: 'pending' }, Date.parse('2024-12-01T00:00:00Z'));
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

describe('periodizeTimeline — فصل‌بندی قطعی روایت (موج ۱ طرح D)', () => {
  const NOW = '2025-06-01T00:00:00Z';

  it('سفر کامل: غربال→ارزیابی→طرح→درمان→بازسنجی→درمان ۲', () => {
    const events = [
      ev('2025-01-01T00:00:00Z', 'student_created', 'پرونده تشکیل شد'),
      ev('2025-01-05T00:00:00Z', 'waitlist', 'وارد لیست انتظار شد', 'w1', { boundary: 'screening' }),
      ev('2025-01-20T00:00:00Z', 'waitlist', 'پذیرش شد — پرونده فعال شد', 'w1', { boundary: 'assessment', milestone: true }),
      ev('2025-02-01T00:00:00Z', 'clinical_path', 'مسیر مداخله ساخته شد', 'p1', { boundary: 'plan' }),
      ev('2025-02-05T00:00:00Z', 'appointment', 'جلسه — حضور ثبت شد'),
      ev('2025-02-12T00:00:00Z', 'appointment', 'جلسه — حضور ثبت شد'),
      ev('2025-03-01T00:00:00Z', 'committee', 'تصمیم کمیسیون: مصوب', 'c1', { boundary: 'review', milestone: true }),
      ev('2025-03-10T00:00:00Z', 'appointment', 'جلسه — حضور ثبت شد')
    ];
    const chs = periodizeTimeline(events, { nowIso: NOW });
    expect(chs.map((c) => c.phase)).toEqual(['screening', 'assessment', 'plan', 'treatment', 'review', 'treatment']);
    // رویدادِ پیش از اولین مرز به اولین فصل می‌پیوندد — نه فصل ساختگی «پراکنده»
    expect(chs[0].from).toBe('2025-01-01T00:00:00Z');
    expect(chs[3].run).toBe(1);
    expect(chs[5].run).toBe(2);
    for (let i = 0; i < chs.length - 1; i++) expect(chs[i].to).toBe(chs[i + 1].from); // پیوستگی
    expect(chs[chs.length - 1].to).toBe(NOW);
    expect(chs.every((c) => c.eventCount > 0)).toBe(true);
  });

  it('شکاف ۲۱+ روزهٔ جلسات پیاپی درمان را می‌شکند؛ فاصلهٔ کوتاه همان دوره می‌ماند', () => {
    const events = [
      ev('2025-01-01T00:00:00Z', 'waitlist', 'وارد لیست انتظار شد', 'w1', { boundary: 'screening' }),
      ev('2025-01-10T00:00:00Z', 'waitlist', 'پذیرش شد', 'w1', { boundary: 'assessment' }),
      ev('2025-01-15T00:00:00Z', 'appointment', 'جلسه'),
      ev('2025-03-01T00:00:00Z', 'appointment', 'جلسه'), // ~۴۵ روز بعد — دورهٔ تازه
      ev('2025-03-08T00:00:00Z', 'appointment', 'جلسه') // ۷ روز بعد — ادامهٔ همان دوره
    ];
    const chs = periodizeTimeline(events, { nowIso: NOW });
    expect(chs.map((c) => c.phase)).toEqual(['screening', 'assessment', 'treatment', 'treatment']);
    expect(chs.filter((c) => c.phase === 'treatment').map((c) => c.run)).toEqual([1, 2]);
  });

  it('بدون هیچ مرزی → تک‌فصل «ثبت‌های پراکنده» (بدون عنوان بالینی ساختگی)', () => {
    const events = [
      ev('2025-01-01T00:00:00Z', 'student_created'),
      ev('2025-01-10T00:00:00Z', 'appointment'),
      ev('2025-01-20T00:00:00Z', 'session_note')
    ];
    const chs = periodizeTimeline(events, { nowIso: NOW });
    expect(chs).toHaveLength(1);
    expect(chs[0].phase).toBe('scattered');
    expect(chs[0].from).toBe('2025-01-01T00:00:00Z');
    expect(chs[0].to).toBe(NOW);
  });

  it('جلسهٔ تنها با نبود مرز، فصل درمان نمی‌سازد (فقط از plan/assessment/review)', () => {
    const chs = periodizeTimeline([ev('2025-01-01T00:00:00Z', 'appointment')], { nowIso: NOW });
    expect(chs).toHaveLength(1);
    expect(chs[0].phase).toBe('scattered');
  });

  it('مرز روی فصل هم‌نام فصل تازه نمی‌سازد — فصل ادامه می‌یابد', () => {
    const chs = periodizeTimeline([
      ev('2025-01-01T00:00:00Z', 'waitlist', 'وارد لیست انتظار شد', 'w1', { boundary: 'screening' }),
      ev('2025-01-08T00:00:00Z', 'waitlist', 'وارد لیست انتظار شد', 'w2', { boundary: 'screening' }),
      ev('2025-02-01T00:00:00Z', 'waitlist', 'پذیرش شد', 'w2', { boundary: 'assessment' })
    ], { nowIso: NOW });
    expect(chs.map((c) => c.phase)).toEqual(['screening', 'assessment']);
  });

  it('خط زمانی خالی → هیچ فصلی', () => {
    expect(periodizeTimeline([], { nowIso: NOW })).toEqual([]);
  });

  it('ورودی مرتب‌نشده هم قطعی فصل‌بندی می‌شود (مرتب‌سازی صعودی داخلی)', () => {
    const chs = periodizeTimeline([
      ev('2025-02-01T00:00:00Z', 'clinical_path', 'مسیر مداخله ساخته شد', 'p1', { boundary: 'plan' }),
      ev('2025-01-01T00:00:00Z', 'student_created')
    ], { nowIso: NOW });
    expect(chs[0].from).toBe('2025-01-01T00:00:00Z');
    expect(chs[0].phase).toBe('plan');
  });
});
