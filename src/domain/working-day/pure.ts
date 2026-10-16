/**
 * ماژول بورد روز کاری — توابع خالص منطق محض (بدون I/O)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// + فاز ۱ — توابع pure بورد «مدیریت روز کاری» — بدون I/O و قابل تست

import type {
  AppointmentOpsStatus,
  AppointmentStatus,
  WorkingDayAppointment,
  WorkingDayOpsStats,
  WorkingDayQueueItem,
  WorkingDaySessionStats
} from '@core/shared';
import { OPS_QUEUE_WINDOW_MINUTES, OPS_TERMINAL_STATUSES } from '@core/shared';

/**
 * گروه‌بندی نوبت‌ها بر اساس ستون همکارها.
 * نوبت‌های همکارِ حاضر در ستون‌ها → byStaff؛ بقیه → unassigned (بی‌صاحب).
 * ترتیب داخل هر ستون: زمان شروع (صعودی) — ورودی باید مرتب باشد یا اینجا مرتب می‌شود.
 */
export function groupAppointmentsByStaff<T extends { staffId: string; startAt: string }>(
  appointments: T[],
  knownStaffIds: ReadonlySet<string>
): { byStaff: Map<string, T[]>; unassigned: T[] } {
  const byStaff = new Map<string, T[]>();
  const unassigned: T[] = [];

  const sorted = [...appointments].sort((a, b) =>
    a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0
  );

  for (const appt of sorted) {
    if (appt.staffId && knownStaffIds.has(appt.staffId)) {
      const list = byStaff.get(appt.staffId) ?? [];
      list.push(appt);
      byStaff.set(appt.staffId, list);
    } else {
      unassigned.push(appt);
    }
  }
  return { byStaff, unassigned };
}

/**
 * آمار حضور جلسات روز — از نوبت‌های بورد.
 * total = تعداد کل دانش‌آموزِ نوبت‌های scheduled (بدون لغوشده)
 * cancelledAppointments = تعداد نوبت‌های لغوشده (دانش‌آموزانشان شمرده نمی‌شود)
 */
export function sessionStatsFromAppointments(appointments: readonly WorkingDayAppointment[]): WorkingDaySessionStats {
  let present = 0;
  let absent = 0;
  let pending = 0;
  let total = 0;
  let cancelledAppointments = 0;

  for (const appt of appointments) {
    if (appt.status === 'cancelled') {
      cancelledAppointments++;
      continue;
    }
    for (const s of appt.students) {
      total++;
      if (s.attendance === 'present') present++;
      else if (s.attendance === 'absent') absent++;
      else if (s.attendance === 'pending') pending++;
    }
  }
  return { total, present, absent, pending, cancelledAppointments };
}

/** نرمال‌سازی متن توضیحات روز — فشرده‌سازی فاصله‌ها و خطوط خالی تکراری */
export function normalizeDayNoteBody(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ───────────── فاز ۱ — نوار وضعیت عملیاتی (§7.1) ─────────────

interface OpsSourceRow {
  status: AppointmentStatus;
  opsStatus?: AppointmentOpsStatus | null;
}

/** آیا نوبت به پایان فلوی عملیاتی رسیده؟ (پایان‌حالت‌ها = completed/no_show) */
export function isTerminalOps(ops: AppointmentOpsStatus | null | undefined): boolean {
  return ops !== null && ops !== undefined && (OPS_TERMINAL_STATUSES as readonly string[]).includes(ops);
}

/**
 * شمارش وضعیت عملیاتی نوبت‌های همان روز — از همان نوبت‌های بورد (Projection؛ بدون جدول جدید).
 * planned = scheduled بدون ops_status؛ cancelled از status.
 */
export function opsStatsFromAppointments(appointments: readonly OpsSourceRow[]): WorkingDayOpsStats {
  const stats: WorkingDayOpsStats = {
    planned: 0,
    checkedIn: 0,
    delayed: 0,
    inSession: 0,
    completed: 0,
    noShow: 0,
    cancelled: 0,
    total: appointments.length
  };
  for (const a of appointments) {
    if (a.status === 'cancelled') {
      stats.cancelled++;
      continue;
    }
    switch (a.opsStatus) {
      case 'checked_in': stats.checkedIn++; break;
      case 'delayed': stats.delayed++; break;
      case 'in_session': stats.inSession++; break;
      case 'completed': stats.completed++; break;
      case 'no_show': stats.noShow++; break;
      default: stats.planned++; break;
    }
  }
  return stats;
}

// ───────────── فاز ۱ — صف ۶۰ دقیقهٔ آینده (§7.2) ─────────────

interface QueueSourceRow {
  id: string;
  staffId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  opsStatus?: AppointmentOpsStatus | null;
  students: readonly { name: string }[];
}

/**
 * صف «اقدام‌های نزدیک» بورد منشی — derivation خالص از نوبت‌های بورد (بدون query/جدول جدید).
 * ورود: نوبت‌های scheduled که
 * - به فلوی عملیاتی رسیده‌اند و پایان‌حالت نیستند (آمده/تأخیر/در جلسه → هنوز اقدام لازم دارند)، یا
 * - بدون وضعیت عملیاتی‌اند و شروعشان تا windowMinutes دقیقهٔ آینده است (فرصت ثبت «آمد/تأخیر/نیامد»).
 * نوبت‌هایی که تمام‌شده/نیامد/لغوشده‌اند از صف خارج می‌شوند.
 * ترتیب: زمان شروع صعودی. staffNameOf برای نوبت بی‌صاحب «—» برمی‌گرداند.
 */
export function buildQueue(
  appointments: readonly QueueSourceRow[],
  nowIso: string,
  options: { windowMinutes?: number; staffNameOf: (staffId: string) => string }
): WorkingDayQueueItem[] {
  const windowMs = (options.windowMinutes ?? OPS_QUEUE_WINDOW_MINUTES) * 60_000;
  const deadline = Date.parse(nowIso) + windowMs;

  const items = appointments
    .filter((a) => {
      if (a.status === 'cancelled') return false;
      if (isTerminalOps(a.opsStatus)) return false;
      // started-but-open (آمده/تأخیر/در جلسه) همیشه در صف می‌ماند تا تکمیل شود؛
      // بدون‌وضعیت فقط وقتی که شروعش در پنجرهٔ آینده است
      if (a.opsStatus) return true;
      return Date.parse(a.startAt) <= deadline;
    })
    .sort((a, b) => (a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0))
    .map((a): WorkingDayQueueItem => ({
      appointmentId: a.id,
      staffId: a.staffId,
      staffName: options.staffNameOf(a.staffId),
      startAt: a.startAt,
      endAt: a.endAt,
      opsStatus: a.opsStatus ?? null,
      studentNames: a.students.map((s) => s.name)
    }));
  return items;
}
