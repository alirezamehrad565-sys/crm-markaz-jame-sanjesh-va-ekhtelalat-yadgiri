import type {
  AppointmentOpsStatus,
  AppointmentStatus,
  WorkingDayAppointment,
  WorkingDayOpsStats,
  WorkingDayQueueItem,
  WorkingDaySessionStats
} from '@core/shared';
import { OPS_QUEUE_WINDOW_MINUTES, OPS_TERMINAL_STATUSES } from '@core/shared';

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

export function normalizeDayNoteBody(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface OpsSourceRow {
  status: AppointmentStatus;
  opsStatus?: AppointmentOpsStatus | null;
}

export function isTerminalOps(ops: AppointmentOpsStatus | null | undefined): boolean {
  return ops !== null && ops !== undefined && (OPS_TERMINAL_STATUSES as readonly string[]).includes(ops);
}

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

interface QueueSourceRow {
  id: string;
  staffId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  opsStatus?: AppointmentOpsStatus | null;
  students: readonly { name: string }[];
}

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
