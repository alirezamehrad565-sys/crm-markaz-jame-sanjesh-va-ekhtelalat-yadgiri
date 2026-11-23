import { faDigits, jalaliLabel, tehranTimeLabel, tehranYmdOf } from '@core/shared';
import type { TimelineChapter, TimelineEvent, TimelineFilters, TimelineKind, TimelineNextAction, TimelinePhase } from './types';
import { TIMELINE_KINDS } from './types';

export const CASE_STATUS_LABELS_FA: Record<string, string> = {
  identified: 'شناسایی‌شده',
  awaiting_assessment: 'در انتظار ارزیابی',
  in_intervention: 'در مداخله',
  monitoring: 'تحت پایش',
  archived: 'بایگانی'
};

export const SPECIAL_NEED_TYPE_LABELS_FA: Record<string, string> = {
  dyslexia: 'نارساخوانی (دیس‌لکسی)',
  dysgraphia: 'نارسانویسی (دیس‌گرافی)',
  dyscalculia: 'نارساریاضی (دیس‌کالکولی)',
  adhd: 'بیش‌فعالی و کم‌توجهی',
  autism: 'طیف اتیسم',
  speech_language: 'اختلال زبانی و بیان',
  anxiety: 'اضطراب',
  motor_coordination: 'اختلال هماهنگی حرکتی',
  slow_learner: 'دیرآموز',
  other: 'سایر'
};

export const SPECIAL_NEED_SEVERITY_LABELS_FA: Record<string, string> = {
  mild: 'خفیف',
  moderate: 'متوسط',
  severe: 'شدید'
};

export const NOTIFICATION_TITLES_FA: Record<string, string> = {
  appointment_reminder: 'یادآوری نوبت به خانواده ارسال شد',
  appointment_created: 'اعلان ثبت نوبت به خانواده ارسال شد',
  appointment_changed: 'اعلان تغییر نوبت به خانواده ارسال شد',
  appointment_cancelled: 'اعلان لغو نوبت به خانواده ارسال شد',
  attendance_absent: 'پیام غیبت به خانواده ارسال شد',
  teacher_report: 'گزارش برای معلم مدرسه ارسال شد',
  announcement: 'اطلاعیه مرکز ارسال شد',
  generic: 'پیام به خانواده ارسال شد'
};

export const COMMITTEE_DECISION_LABELS_FA: Record<string, string> = {
  pending: 'در انتظار تصمیم',
  approved: 'مصوب',
  rejected: 'رد شد',
  deferred: 'موکول شد'
};

export function jalaliLabelOf(ymd: string): string {
  return jalaliLabel(ymd);
}

export interface AppointmentStateInput {
  status: string; // مقادیر مجاز: scheduled | cancelled
  attendance: string; // مقادیر مجاز: pending | present | late | absent | cancelled
  startAt: string;
  endAt: string;
}

/* ۱.۱۸.۰ — سیستم موازی «وضعیت عملیاتی» (آمد/نیامد/شروع و اتمام جلسه) حذف شد؛
   عنوان رویداد نوبت فقط از حضور و غیاب واقعی دانش‌آموز ساخته می‌شود. */
export function appointmentEventState(a: AppointmentStateInput): { title: string; subtitle: string | null } {
  const durationMin = Math.max(0, Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000));
  const who = null; // staffName در service اضافه می‌شود
  void who;

  if (a.status === 'cancelled') {
    return { title: 'نوبت لغو شد', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه — لغو شده`) };
  }
  if (a.attendance === 'absent') {
    return { title: 'جلسه — عدم حضور', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه`) };
  }
  if (a.attendance === 'late') {
    return { title: 'جلسه — حضور با تأخیر', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه`) };
  }
  if (a.attendance === 'present') {
    return { title: 'جلسه — حضور ثبت شد', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه`) };
  }
  return { title: 'نوبت جلسه', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه — در انتظار برگزاری`) };
}

export function subtitleWith(staffName: string | null, detail: string | null): string | null {
  const parts = [staffName, detail].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(' — ') : null;
}

export function jalaliDateTimeLabel(isoUtc: string): string {
  const ymd = tehranYmdOf(isoUtc);
  const time = tehranTimeLabel(isoUtc);
  return `${jalaliLabel(ymd)} ${time}`;
}

export function mergeTimelineEvents(raw: readonly TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  const unique: TimelineEvent[] = [];
  for (const e of raw) {
    const key = `${e.at}|${e.kind}|${e.ref?.type ?? ''}|${e.ref?.id ?? ''}|${e.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(e);
  }
  return unique.sort((x, y) => {
    if (x.at !== y.at) return x.at < y.at ? 1 : -1; // نزولی
    if (x.kind !== y.kind) return x.kind < y.kind ? -1 : 1;
    const rx = x.ref?.id ?? '';
    const ry = y.ref?.id ?? '';
    if (rx !== ry) return rx < ry ? -1 : 1;
    return x.title < y.title ? -1 : x.title > y.title ? 1 : 0;
  });
}

export function filterTimelineEvents(events: readonly TimelineEvent[], filters: TimelineFilters): TimelineEvent[] {
  const validKinds = filters.kinds
    ? new Set<TimelineKind>(filters.kinds.filter((k): k is TimelineKind => (TIMELINE_KINDS as readonly string[]).includes(k)))
    : null;
  /* موج ۲ — جست‌وجوی متنی روی title/subtitle/actor (همان سه فیلد نرمال سرور)؛
     LIKE ساده با الگوی search/service.ts — بدون پرواز به متن کامل payload */
  const q = filters.q?.trim().toLowerCase();
  return events.filter((e) => {
    if (filters.from && e.at < filters.from) return false;
    if (filters.to && e.at > filters.to) return false;
    if (validKinds && !validKinds.has(e.kind)) return false;
    if (q) {
      const hay = `${e.title ?? ''}\n${e.subtitle ?? ''}\n${e.actor ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function paginateTimeline(events: readonly TimelineEvent[], limit?: number, offset?: number): { page: TimelineEvent[]; limit: number; offset: number; hasMore: boolean } {
  const lim = Math.min(Math.max(1, limit ?? 50), 200);
  const off = Math.max(0, offset ?? 0);
  const page = events.slice(off, off + lim);
  return { page, limit: lim, offset: off, hasMore: off + page.length < events.length };
}

export interface NextAppointmentCandidate {
  id: string;
  startAt: string;
  staffName: string | null;
}

export interface NextFollowUpCandidate {
  id: string;
  title: string;
  dueAt: string | null;
}

export function deriveNextAction(
  nextAppointment: NextAppointmentCandidate | null,
  openFollowups: readonly NextFollowUpCandidate[]
): TimelineNextAction | null {
  if (nextAppointment) {
    return {
      type: 'appointment',
      at: nextAppointment.startAt,
      title: nextAppointment.staffName ? `جلسه بعدی — ${nextAppointment.staffName}` : 'جلسه بعدی',
      id: nextAppointment.id
    };
  }
  if (openFollowups.length > 0) {
    const sorted = [...openFollowups].sort((a, b) => {
      const da = a.dueAt ?? '9999-12-31T23:59:59.999Z';
      const db = b.dueAt ?? '9999-12-31T23:59:59.999Z';
      if (da !== db) return da < db ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const f = sorted[0];
    return { type: 'followup', at: f.dueAt, title: `پیگیری: ${f.title}`, id: f.id };
  }
  return null;
}

export function parseCompositeRef(resourceId: string): { appointmentId: string; studentId: string } | null {
  const idx = resourceId.indexOf('/');
  if (idx <= 0 || idx === resourceId.length - 1) return null;
  return { appointmentId: resourceId.slice(0, idx), studentId: resourceId.slice(idx + 1) };
}

/* ═══ موج ۱ — فصل‌بندی روایت پرونده (طرح D «فصل‌های پرونده» §۲) ═══
   اصل: قطعی و deterministic از مرزهای رویدادِ موجود — بدون جدول تازه، بدون LLM، بدون قضاوت بالینی.
   ورودی: خط زمانی merge‌شده (رویدادها فیلد داخلی boundary را از سرویس دارند)؛ خروجی: فصل‌های پیوسته.
   قواعد:
   · مرز صریح (screening/assessment/plan/review) فصل تازه می‌گشاید؛ رویدادهای پیش از اولین مرز
     به اولین فصل می‌پیوندند (نه فصل ساختگی «پراکنده»)؛
   · آغاز جلسات/تمرین پس از plan/assessment/review یعنی دورهٔ درمان (شمارندهٔ run)؛
   · شکاف بیش از ۲۱ روز میان دو جلسهٔ پیاپیِ درون درمان، فصل درمان را می‌شکند (دورهٔ تازه)؛
   · اگر هیچ مرزی در کل خط زمانی نباشد → یک فصل «ثبت‌های پراکنده» (صادقانه، بدون عنوان بالینی ساختگی). */
export const TIMELINE_PHASE_LABELS_FA: Record<TimelinePhase, string> = {
  screening: 'غربال و ورود',
  assessment: 'ارزیابی',
  plan: 'طرح درمان',
  treatment: 'دورهٔ درمان',
  review: 'بازسنجی و تصمیم',
  scattered: 'ثبت‌های پراکنده'
};

export const TREATMENT_GAP_DAYS = 21;
const TREATMENT_GAP_MS = TREATMENT_GAP_DAYS * 86_400_000;

export interface PeriodizeOptions {
  nowIso?: string;
}

export function periodizeTimeline(events: readonly TimelineEvent[], opts: PeriodizeOptions = {}): TimelineChapter[] {
  const asc = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  if (asc.length === 0) return [];
  const nowIso = opts.nowIso ?? new Date().toISOString();

  interface Seg { phase: TimelinePhase; run?: number; from: string; count: number }
  const segs: Seg[] = [];
  let phase: TimelinePhase | null = null;
  let run = 0;
  let lastApptAt: string | null = null;

  const openSeg = (p: TimelinePhase, at: string): void => {
    phase = p;
    const seg: Seg = { phase: p, from: at, count: 0 };
    if (p === 'treatment') {
      run += 1;
      seg.run = run;
    }
    segs.push(seg);
  };

  for (const e of asc) {
    let want: TimelinePhase | null = null;
    if (e.boundary === 'screening' || e.boundary === 'assessment' || e.boundary === 'plan' || e.boundary === 'review') {
      want = e.boundary;
    } else if ((e.kind === 'appointment' || e.kind === 'exercise') && (phase === 'plan' || phase === 'assessment' || phase === 'review')) {
      want = 'treatment';
    }

    let opened = false;
    if (phase === null) {
      // پیش از اولین مرز فاز نداریم؛ مرز واقعی فصل می‌گشاید، وگرنه فصل موقت «scattered»
      // که با رسیدن اولین مرز ادغام می‌شود (from فصل اول در پاسخ نهایی به آغاز خط زمانی برمی‌گردد).
      openSeg(want ?? 'scattered', e.at);
      opened = true;
    } else if (want && want !== phase) {
      if (phase === 'scattered' && segs.length === 1 && segs[0].phase === 'scattered') segs.pop();
      openSeg(want, e.at);
      opened = true;
    }
    if (!opened && phase === 'treatment' && e.kind === 'appointment' && lastApptAt !== null
      && Date.parse(e.at) - Date.parse(lastApptAt) > TREATMENT_GAP_MS) {
      openSeg('treatment', e.at); // شکاف دراز — دورهٔ درمان تازه (run بعدی)
    }

    const seg = segs[segs.length - 1];
    seg.count += 1;
    if (e.kind === 'appointment') lastApptAt = e.at;
  }

  // هیچ مرزی نیامده بود — تک‌فصل صادقانه
  if (segs.length === 1 && segs[0].phase === 'scattered') {
    return [buildChapter('ch-1', segs[0], asc[0].at, nowIso, asc.length)];
  }

  return segs.map((seg, i) => {
    const from = i === 0 ? asc[0].at : seg.from;
    const to = i === segs.length - 1 ? nowIso : segs[i + 1].from;
    return buildChapter(`ch-${i + 1}`, seg, from, to, seg.count);
  });
}

function buildChapter(id: string, seg: { phase: TimelinePhase; run?: number; from: string; count: number }, from: string, to: string, eventCount: number): TimelineChapter {
  return {
    id,
    phase: seg.phase,
    ...(seg.run !== undefined ? { run: seg.run } : {}),
    from,
    to,
    eventCount,
    summary: {
      sessions: 0,
      attended: 0,
      absent: 0,
      cancelledSessions: 0,
      pendingSessions: 0,
      exercisesAssigned: 0,
      exercisesSubmitted: 0,
      exercisesCorrected: 0,
      followupsCreated: 0,
      committeeDecisions: 0,
      caseEvents: 0,
      milestones: 0
    },
    trend: { attendancePct: null, scores: [] }
  };
}
