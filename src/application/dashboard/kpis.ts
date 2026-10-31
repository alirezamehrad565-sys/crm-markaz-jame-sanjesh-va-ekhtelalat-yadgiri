import type {
  Appointment,
  DashboardStaffCard,
  DashboardSummaryDay,
  AttendanceStats,
  StaffRole,
  TherapistScoreEntry
} from '@core/shared';
import { tehranYmdOf } from '@core/shared';

export interface StaffInfo {
  name: string;
  role: StaffRole;
}

export function computeStatusCounts(appointments: Appointment[]): {
  total: number;
  scheduled: number;
  cancelled: number;
} {
  let scheduled = 0;
  let cancelled = 0;
  for (const a of appointments) {
    if (a.status === 'cancelled') cancelled++;
    else scheduled++;
  }
  return { total: appointments.length, scheduled, cancelled };
}

export function computeStaffCards(
  appointments: Appointment[],
  staffInfo: Map<string, StaffInfo>
): DashboardStaffCard[] {
  const byStaff = new Map<string, { total: number; scheduled: number; cancelled: number }>();
  for (const a of appointments) {
    const cur = byStaff.get(a.staffId) ?? { total: 0, scheduled: 0, cancelled: 0 };
    cur.total++;
    if (a.status === 'cancelled') cur.cancelled++;
    else cur.scheduled++;
    byStaff.set(a.staffId, cur);
  }
  const cards: DashboardStaffCard[] = [];
  for (const [staffId, counts] of byStaff) {
    const info = staffInfo.get(staffId);
    cards.push({
      staffId,
      staffName: info?.name ?? '—',
      role: info?.role ?? 'therapist',
      ...counts
    });
  }
  cards.sort((a, b) => b.total - a.total);
  return cards;
}

export function computeAttendanceStats(appointments: Appointment[]): AttendanceStats {
  let present = 0;
  let absent = 0;
  let late = 0;
  let pending = 0;
  let cancelled = 0;
  for (const a of appointments) {
    for (const s of a.students) {
      switch (s.attendance) {
        case 'present': present++; break;
        case 'late': late++; break; //
        case 'absent': absent++; break;
        case 'pending': pending++; break;
        case 'cancelled': cancelled++; break;
      }
    }
  }
  const denominator = present + late + absent;
  return {
    present,
    absent,
    late,
    pending,
    cancelled,
    absenceRate: denominator > 0 ? absent / denominator : 0
  };
}

export function groupByDay(appointments: Appointment[]): DashboardSummaryDay[] {
  const byDay = new Map<string, { total: number; scheduled: number; cancelled: number }>();
  for (const a of appointments) {
    const ymd = tehranYmdOf(a.startAt);
    const cur = byDay.get(ymd) ?? { total: 0, scheduled: 0, cancelled: 0 };
    cur.total++;
    if (a.status === 'cancelled') cur.cancelled++;
    else cur.scheduled++;
    byDay.set(ymd, cur);
  }
  return [...byDay.entries()]
    .sort(([d1], [d2]) => (d1 < d2 ? -1 : d1 > d2 ? 1 : 0))
    .map(([date, counts]) => ({ date, ...counts }));
}

export function findNextAppointment(
  appointments: Appointment[],
  nowIso: string
): { id: string; staffId: string; startAt: string; endAt: string } | null {
  const now = Date.parse(nowIso);
  let best: Appointment | null = null;
  for (const a of appointments) {
    if (a.status !== 'scheduled') continue;
    if (Date.parse(a.startAt) < now) continue;
    if (!best || Date.parse(a.startAt) < Date.parse(best.startAt)) best = a;
  }
  return best ? { id: best.id, staffId: best.staffId, startAt: best.startAt, endAt: best.endAt } : null;
}

export const SCORE_WEIGHTS = { sessions: 2, exercises: 3, events: 1, followups: 1 } as const;

export interface TherapistActivityCounts {
  sessions: number;
  exercises: number;
  events: number;
  followups: number;
}

export function scoreOf(c: TherapistActivityCounts): number {
  return c.sessions * SCORE_WEIGHTS.sessions + c.exercises * SCORE_WEIGHTS.exercises + c.events * SCORE_WEIGHTS.events + c.followups * SCORE_WEIGHTS.followups;
}

export function computeScoreboard(
  therapists: Array<{ id: string; name: string }>,
  counts: Map<string, TherapistActivityCounts>
): TherapistScoreEntry[] {
  const entries: TherapistScoreEntry[] = therapists.map((t) => {
    const c = counts.get(t.id) ?? { sessions: 0, exercises: 0, events: 0, followups: 0 };
    return {
      staffId: t.id,
      staffName: t.name,
      sessions: c.sessions,
      exercises: c.exercises,
      events: c.events,
      followups: c.followups,
      score: scoreOf(c),
      rank: 1
    };
  });

  entries.sort((a, b) => b.score - a.score || b.sessions - a.sessions || a.staffName.localeCompare(b.staffName, 'fa'));

  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].score === entries[i - 1].score) {
      entries[i].rank = entries[i - 1].rank;
    } else {
      entries[i].rank = i + 1;
    }
  }
  return entries;
}

export function countSessionsPerStaff(appointments: Appointment[]): Map<string, number> {
  const byStaff = new Map<string, number>();
  for (const a of appointments) {
    if (a.status === 'cancelled') continue;
    if (!a.students.some((s) => s.attendance === 'present' || s.attendance === 'late')) continue;
    byStaff.set(a.staffId, (byStaff.get(a.staffId) ?? 0) + 1);
  }
  return byStaff;
}
