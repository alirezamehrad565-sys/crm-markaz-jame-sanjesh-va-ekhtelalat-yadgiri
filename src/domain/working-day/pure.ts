import type {
  AppointmentStatus,
  WorkingDayAppointment,
  WorkingDaySessionStats
} from '@core/shared';

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
