/**
 * سرویس تایم‌لاین پرونده — توابع خالص منطق محض (بدون I/O)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فاز ۶ — merge قطعی و بی‌side-effect رویدادهای تایم‌لاین (§11.2/§11.6)
// هیچ I/O ندارد — ورودی رویدادهای خام از service می‌آید؛ خروجی پاسخ نهایی

import { faDigits, jalaliLabel, tehranTimeLabel, tehranYmdOf } from '@core/shared';
import type { TimelineEvent, TimelineFilters, TimelineKind, TimelineNextAction } from './types';
import { TIMELINE_KINDS } from './types';

// ───────────── لیبل‌های فارسی (نمایشی — قرارداد یکسان با فرانت) ─────────────

/** لیبل وضعیت پرونده (§12.1) — در subtitle رویداد case_status مصرف می‌شود */
export const CASE_STATUS_LABELS_FA: Record<string, string> = {
  identified: 'شناسایی‌شده',
  awaiting_assessment: 'در انتظار ارزیابی',
  in_intervention: 'در مداخله',
  monitoring: 'تحت پایش',
  archived: 'بایگانی'
};

/** لیبل نوع نیاز ویژه (فاز ۷ — §12، D3) — هم‌تراز taxonomy برچسب‌های disorder */
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

/** لیبل شدت نیاز ویژه (فاز ۷) */
export const SPECIAL_NEED_SEVERITY_LABELS_FA: Record<string, string> = {
  mild: 'خفیف',
  moderate: 'متوسط',
  severe: 'شدید'
};

/** عنوان پیام خانواده بر اساس template — فقط قالب‌های سمت خانواده */
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

/** — برچسب وضعیت تصمیم کمیسیون (در subtitle رویداد committee مصرف می‌شود) */
export const COMMITTEE_DECISION_LABELS_FA: Record<string, string> = {
  pending: 'در انتظار تصمیم',
  approved: 'مصوب',
  rejected: 'رد شد',
  deferred: 'موکول شد'
};

/** — برچسب جلالی تاریخ خالص YYYY-MM-DD میلادی (جلسهٔ کمیسیون) */
export function jalaliLabelOf(ymd: string): string {
  return jalaliLabel(ymd);
}

// ───────────── عنوان وضعیت جلسه از دادهٔ فعلی نوبت ─────────────

export interface AppointmentStateInput {
  status: string; // scheduled | cancelled
  opsStatus: string | null; // checked_in | delayed | in_session | completed | no_show | null
  attendance: string; // pending | present | absent | cancelled
  startAt: string;
  endAt: string;
}

/**
 * عنوان/زیرعنوان رویداد جلسه — از وضعیت فعلی نوبت (row-based).
 * attendance.mark و cancel/restore به‌صورت state در همین رویداد ادغام می‌شوند
 * (انحراف مستند از Spec: دو رویداد برای یک جلسه ساخته نمی‌شود — روایت تمیز).
 */
export function appointmentEventState(a: AppointmentStateInput): { title: string; subtitle: string | null } {
  const durationMin = Math.max(0, Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000));
  const who = null; // staffName در service اضافه می‌شود
  void who;

  if (a.status === 'cancelled') {
    return { title: 'نوبت لغو شد', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه — لغو شده`) };
  }
  if (a.opsStatus === 'no_show' || (a.opsStatus === null && a.attendance === 'absent')) {
    return { title: 'جلسه — عدم حضور', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه`) };
  }
  // حاضر با تأخیر (فقط وقتی وضعیت عملیاتی ندارد؛ وگرنه وضعیت عملیاتی ملاک است)
  if (a.opsStatus === null && a.attendance === 'late') {
    return { title: 'جلسه — حضور با تأخیر', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه`) };
  }
  if (a.opsStatus === 'completed') {
    return { title: 'جلسه برگزار شد', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه — حاضر`) };
  }
  if (a.opsStatus === 'in_session') {
    return { title: 'جلسه در جریان است', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه`) };
  }
  if (a.opsStatus === 'checked_in' || a.attendance === 'present') {
    return { title: 'جلسه — حضور ثبت شد', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه`) };
  }
  if (a.opsStatus === 'delayed') {
    return { title: 'جلسه — تأخیر در شروع', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه`) };
  }
  return { title: 'نوبت جلسه', subtitle: subtitleWith(null, `${faDigits(durationMin)} دقیقه — در انتظار برگزاری`) };
}

/** ترکیب نام همکار با جزئیات — «علی محمدی — ۴۵ دقیقه» */
export function subtitleWith(staffName: string | null, detail: string | null): string | null {
  const parts = [staffName, detail].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(' — ') : null;
}

/** برچسب فارسی تاریخ‌وقت از ISO UTC — «۲۲ مهر ۱۴۰۵ ۱۰:۰۰» */
export function jalaliDateTimeLabel(isoUtc: string): string {
  const ymd = tehranYmdOf(isoUtc);
  const time = tehranTimeLabel(isoUtc);
  return `${jalaliLabel(ymd)} ${time}`;
}

// ───────────── merge قطعی ─────────────

/**
 * مرتب‌سازی قطعی: at نزولی → kind صعودی → ref.id صعودی؛ حذف duplicateهای کامل
 * (at+kind+ref یکسان). هرگز ورودی را تغییر نمی‌دهد.
 */
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

/** فیلتر from/to/kinds — kinds نامعتبر نادیده گرفته می‌شود (whitelist) */
export function filterTimelineEvents(events: readonly TimelineEvent[], filters: TimelineFilters): TimelineEvent[] {
  const validKinds = filters.kinds
    ? new Set<TimelineKind>(filters.kinds.filter((k): k is TimelineKind => (TIMELINE_KINDS as readonly string[]).includes(k)))
    : null;
  return events.filter((e) => {
    if (filters.from && e.at < filters.from) return false;
    if (filters.to && e.at > filters.to) return false;
    if (validKinds && !validKinds.has(e.kind)) return false;
    return true;
  });
}

/** صفحه‌بندی — limit پیش‌فرض ۵۰، سقف ۲۰۰ */
export function paginateTimeline(events: readonly TimelineEvent[], limit?: number, offset?: number): { page: TimelineEvent[]; limit: number; offset: number; hasMore: boolean } {
  const lim = Math.min(Math.max(1, limit ?? 50), 200);
  const off = Math.max(0, offset ?? 0);
  const page = events.slice(off, off + lim);
  return { page, limit: lim, offset: off, hasMore: off + page.length < events.length };
}

// ───────────── «اقدام بعدی» (§14 — derivation از دادهٔ موجود) ─────────────

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

/**
 * قاعدهٔ قطعی:
 * ۱) نوبت آیندهٔ scheduled نزدیک‌تر → «جلسه بعدی — نام همکار»
 * ۲) وگرنه بازترین follow-up (due_at نهNULL: از قدیمی‌ترین؛ NULL در انتها؛ tie-break id)
 * ۳) هیچ → null
 */
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

/** پارس resource_id کامپوزیت «appointmentId/studentId» (attendance/session_note) */
export function parseCompositeRef(resourceId: string): { appointmentId: string; studentId: string } | null {
  const idx = resourceId.indexOf('/');
  if (idx <= 0 || idx === resourceId.length - 1) return null;
  return { appointmentId: resourceId.slice(0, idx), studentId: resourceId.slice(idx + 1) };
}
