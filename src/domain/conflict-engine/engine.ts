/**
 * موتور تشخیص تداخل نوبت — موتور اصلی
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تشخیص تداخل — Pure function. بدون side-effect، بدون database write.
// قاعده: دو نوبت غیرلغوشده هم‌پوشان برای یک متخصص → هشدار نرم (ConflictWarning[])
// هم‌پوشانی: start_a < end_b AND end_a > start_b (مرز دقیق = بدون تداخل)

export interface ExistingAppointment {
  id: string;
  staffId: string;
  startAt: string; // ISO UTC
  endAt: string;   // ISO UTC
  status: string;  // 'scheduled' | 'cancelled'
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

/**
 * هسته pure الگوریتم — بدون دیتابیس، مستقیماً قابل تست.
 * نوبت‌های cancelled حساب نمی‌شوند؛ excludeId نادیده گرفته می‌شود.
 */
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

    // هم‌پوشانی: start_a < end_b AND end_a > start_b
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
