export interface ExistingAppointment {
  id: string;
  staffId: string;
  startAt: string; // زمان ISO UTC از سرور
  endAt: string;   // زمان ISO UTC از سرور
  status: string;  // مقادیر مجاز: scheduled | cancelled
}

export interface ProposedWindow {
  staffId: string;
  startAt: string;
  endAt: string;
  excludeId?: string;
}

export interface OverlapWarning {
  type: 'overlap';
  appointmentId: string;
  staffId: string;
  existingStartAt: string;
  existingEndAt: string;
  proposedStartAt: string;
  proposedEndAt: string;
}

export function findOverlaps(
  existing: ExistingAppointment[],
  proposed: ProposedWindow
): OverlapWarning[] {
  const warnings: OverlapWarning[] = [];
  const pStart = Date.parse(proposed.startAt);
  const pEnd = Date.parse(proposed.endAt);
  if (Number.isNaN(pStart) || Number.isNaN(pEnd) || pEnd <= pStart) return warnings;

  for (const appt of existing) {
    if (appt.status === 'cancelled') continue;
    if (appt.staffId !== proposed.staffId) continue;
    if (proposed.excludeId && appt.id === proposed.excludeId) continue;

    const aStart = Date.parse(appt.startAt);
    const aEnd = Date.parse(appt.endAt);
    if (Number.isNaN(aStart) || Number.isNaN(aEnd)) continue;

    const overlaps = aStart < pEnd && aEnd > pStart;
    if (overlaps) {
      warnings.push({
        type: 'overlap',
        appointmentId: appt.id,
        staffId: appt.staffId,
        existingStartAt: appt.startAt,
        existingEndAt: appt.endAt,
        proposedStartAt: proposed.startAt,
        proposedEndAt: proposed.endAt
      });
    }
  }
  return warnings;
}
