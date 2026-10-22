import type {
  AdvancedWeekPoint,
  ReportDayPoint,
  ReportStaffRow,
  ReportStudentRow,
  StaffRole
} from '@core/shared';
import { addDaysYmd, iranianWeekdayOfYmd, tehranYmdOf } from '@core/shared';

export interface ApptMinuteRow {
  appointmentId: string;
  staffId: string;
  startAt: string;
  endAt: string;
  status: string;
}

export interface StudentSessionRow {
  studentId: string;
  studentName: string;
  attendance: string;
  apptStatus: string;
}

export function daysBetween(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000)) + 1);
}

export function buildDaySeries(
  appointments: Array<{ startAt: string; status: string }>,
  from: string,
  to: string
): ReportDayPoint[] {
  const n = daysBetween(from, to);
  const map = new Map<string, ReportDayPoint>();
  let cur = from;
  for (let i = 0; i < n; i++) {
    map.set(cur, { date: cur, total: 0, cancelled: 0 });
    cur = new Date(Date.parse(cur) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  for (const a of appointments) {
    const ymd = tehranYmdOf(a.startAt);
    const point = map.get(ymd);
    if (!point) continue;
    point.total++;
    if (a.status === 'cancelled') point.cancelled++;
  }
  return [...map.values()];
}

export function buildPerStaff(rows: ApptMinuteRow[], names: Map<string, string>, roles: Map<string, StaffRole>): ReportStaffRow[] {
  const by = new Map<string, { sessions: number; cancelled: number; minutes: number }>();
  for (const r of rows) {
    const cur = by.get(r.staffId) ?? { sessions: 0, cancelled: 0, minutes: 0 };
    if (r.status === 'cancelled') {
      cur.cancelled++;
    } else {
      cur.sessions++;
      const mins = Math.max(0, (Date.parse(r.endAt) - Date.parse(r.startAt)) / 60000);
      cur.minutes += mins;
    }
    by.set(r.staffId, cur);
  }
  const out: ReportStaffRow[] = [];
  for (const [staffId, v] of by) {
    out.push({
      staffId,
      staffName: names.get(staffId) ?? '—',
      role: roles.get(staffId) ?? 'therapist',
      sessions: v.sessions,
      hours: Math.round((v.minutes / 60) * 10) / 10,
      cancelled: v.cancelled
    });
  }
  out.sort((a, b) => b.sessions - a.sessions);
  return out;
}

export function buildTopStudents(rows: StudentSessionRow[], limit = 10): ReportStudentRow[] {
  const by = new Map<string, ReportStudentRow & { _name: string }>();
  for (const r of rows) {
    if (r.apptStatus === 'cancelled') continue;
    const cur = by.get(r.studentId) ?? {
      studentId: r.studentId,
      studentName: r.studentName,
      sessions: 0,
      absents: 0,
      _name: r.studentName
    };
    cur.sessions++;
    if (r.attendance === 'absent') cur.absents++;
    by.set(r.studentId, cur);
  }
  return [...by.values()]
    .sort((a, b) => b.sessions - a.sessions || b.absents - a.absents)
    .slice(0, limit)
    .map(({ studentId, studentName, sessions, absents }) => ({ studentId, studentName, sessions, absents }));
}

export function safeRate(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 1000) / 1000;
}

export function safeRateOrNull(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 1000;
}

export interface TrendAppointmentRow {
  startAt: string;
  status: string;
  opsStatus: string | null;
}

export interface TrendAttendanceRow {
  startAt: string;
  attendance: string;
  apptStatus: string;
}

export function weekStartOfYmd(ymd: string): string {
  const wd = iranianWeekdayOfYmd(ymd); // 0..6
  return addDaysYmd(ymd, -wd);
}

export function buildWeeklyTrend(
  appointments: TrendAppointmentRow[],
  attendance: TrendAttendanceRow[],
  fromYmd: string,
  toYmd: string
): AdvancedWeekPoint[] {
  const weekKeys: string[] = [];
  const weeks = new Map<string, { sessions: number; completed: number; cancelled: number; present: number; absent: number }>();
  let cur = weekStartOfYmd(fromYmd);
  const last = weekStartOfYmd(toYmd);
  let guard = 0;
  while (guard++ < 120) {
    weekKeys.push(cur);
    weeks.set(cur, { sessions: 0, completed: 0, cancelled: 0, present: 0, absent: 0 });
    if (cur === last) break;
    cur = addDaysYmd(cur, 7);
  }

  const bucketOf = (iso: string): { sessions: number; completed: number; cancelled: number; present: number; absent: number } | undefined => {
    const wk = weekStartOfYmd(tehranYmdOf(iso));
    return weeks.get(wk);
  };

  for (const a of appointments) {
    const b = bucketOf(a.startAt);
    if (!b) continue;
    if (a.status === 'cancelled') b.cancelled++;
    else b.sessions++;
    if (a.opsStatus === 'completed') b.completed++;
  }
  for (const r of attendance) {
    if (r.apptStatus === 'cancelled') continue;
    const b = bucketOf(r.startAt);
    if (!b) continue;
    if (r.attendance === 'present') b.present++;
    else if (r.attendance === 'absent') b.absent++;
  }

  return weekKeys.map((k) => {
    const w = weeks.get(k)!;
    return {
      weekStart: k,
      sessions: w.sessions,
      completed: w.completed,
      cancelled: w.cancelled,
      attendanceRate: safeRateOrNull(w.present, w.present + w.absent)
    };
  });
}

export function avgWaitDaysOf(pairs: Array<{ createdAt: string; admittedAt: string }>): number | null {
  if (pairs.length === 0) return null;
  let sum = 0;
  let n = 0;
  for (const p of pairs) {
    const from = Date.parse(p.createdAt);
    const to = Date.parse(p.admittedAt);
    if (Number.isNaN(from) || Number.isNaN(to) || to < from) continue;
    sum += (to - from) / 86_400_000;
    n++;
  }
  if (n === 0) return null;
  return Math.round((sum / n) * 10) / 10;
}
