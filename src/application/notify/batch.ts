import { BATCH_MIN_LEAD_HOURS, TEHRAN_OFFSET_MINUTES } from '@core/shared';

export type BatchSendAt = string | null;

export function tehranTodayBatchInstant(nowMs: number, hour: number): number {
  const tehranNowMs = nowMs + TEHRAN_OFFSET_MINUTES * 60_000;
  const ymd = new Date(tehranNowMs).toISOString().slice(0, 10);
  const batchUtcMs = Date.parse(`${ymd}T00:00:00.000Z`) - TEHRAN_OFFSET_MINUTES * 60_000 + hour * 3_600_000;
  return batchUtcMs;
}

export function computeBatchSendAt(input: {
  nowIso: string;
  appointmentStartIso: string;
  batchHour: number;
}): BatchSendAt {
  const nowMs = Date.parse(input.nowIso);
  const batchMs = tehranTodayBatchInstant(nowMs, input.batchHour);

  if (batchMs <= nowMs) return null;

  const startMs = Date.parse(input.appointmentStartIso);
  if (!Number.isFinite(startMs)) return null;
  if (startMs - batchMs < BATCH_MIN_LEAD_HOURS * 3_600_000) return null;

  return new Date(batchMs).toISOString();
}

export function isCreatedTemplate(template: string): boolean {
  return (
    template === 'appointment_created' ||
    template === 'staff_appointment_created' ||
    template === 'teacher_appointment_created'
  );
}
