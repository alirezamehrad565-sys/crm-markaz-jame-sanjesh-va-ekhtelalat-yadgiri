import type {
  Appointment,
  NotificationChannel,
  NotificationPrefs,
  ReminderEnqueueSummary,
  TemplateVars
} from '@core/shared';
import { DEFAULT_REMINDER_HOURS_BEFORE, tehranTimeLabel, tehranYmdOf } from '@core/shared';

export type ReminderSkipReason = 'disabled' | 'no_chat' | 'too_soon' | 'cancelled';

export interface ReminderPlan {
  appointmentId: string;
  studentId: string;
  staffId: string;
  channel: NotificationChannel;
  recipient: string;
  dedupKey: string;
  payload: TemplateVars;
}

export interface ReminderSkip {
  appointmentId: string;
  studentId: string;
  reason: ReminderSkipReason;
}

export interface ReminderPlanResult {
  plans: ReminderPlan[];
  skips: ReminderSkip[];
  considered: number;
}

export interface PlanRemindersInput {
  appointments: Appointment[];
  prefsByStudent: Map<string, NotificationPrefs>;
  studentNames: Map<string, string>;
  staffNames: Map<string, string>;
  nowIso: string;
  horizonHours: number;
  defaultHoursBefore?: number;
  clinicName?: string;
}

export function reminderDedupKey(appointmentId: string, studentId: string): string {
  return `reminder:${appointmentId}:${studentId}`;
}

export function planReminders(input: PlanRemindersInput): ReminderPlanResult {
  const nowMs = Date.parse(input.nowIso);
  const horizonMs = input.horizonHours * 60 * 60 * 1000;

  const plans: ReminderPlan[] = [];
  const skips: ReminderSkip[] = [];
  let considered = 0;

  for (const appointment of input.appointments) {
    if (appointment.status !== 'scheduled') {
      for (const s of appointment.students) {
        skips.push({ appointmentId: appointment.id, studentId: s.studentId, reason: 'cancelled' });
      }
      continue;
    }

    const startMs = Date.parse(appointment.startAt);
    const msUntilStart = startMs - nowMs;

    for (const s of appointment.students) {
      if (s.attendance === 'cancelled') {
        skips.push({ appointmentId: appointment.id, studentId: s.studentId, reason: 'cancelled' });
        continue;
      }
      considered += 1;

      if (msUntilStart <= 0 || msUntilStart > horizonMs) {
        skips.push({ appointmentId: appointment.id, studentId: s.studentId, reason: 'too_soon' });
        continue;
      }

      const pref = input.prefsByStudent.get(s.studentId) ?? null;
      if (pref && !pref.remindersEnabled) {
        skips.push({ appointmentId: appointment.id, studentId: s.studentId, reason: 'disabled' });
        continue;
      }

      const chatId = pref?.chatId ?? null;
      if (!chatId) {
        skips.push({ appointmentId: appointment.id, studentId: s.studentId, reason: 'no_chat' });
        continue;
      }

      const hoursBefore = pref?.reminderHoursBefore ?? input.defaultHoursBefore ?? DEFAULT_REMINDER_HOURS_BEFORE;
      if (msUntilStart < hoursBefore * 60 * 60 * 1000) {
        skips.push({ appointmentId: appointment.id, studentId: s.studentId, reason: 'too_soon' });
        continue;
      }

      plans.push({
        appointmentId: appointment.id,
        studentId: s.studentId,
        staffId: appointment.staffId,
        channel: pref?.channel ?? 'bale',
        recipient: chatId,
        dedupKey: reminderDedupKey(appointment.id, s.studentId),
        payload: {
          studentName: input.studentNames.get(s.studentId) ?? '',
          staffName: input.staffNames.get(appointment.staffId) ?? '',
          dateYmd: tehranYmdOf(appointment.startAt),
          timeLabel: tehranTimeLabel(appointment.startAt),
          clinicName: input.clinicName
        }
      });
    }
  }

  return { plans, skips, considered };
}

export function summarizeSkips(skips: ReminderSkip[]): {
  skippedDisabled: number;
  skippedNoChat: number;
  skippedTooSoon: number;
  cancelled: number;
} {
  let skippedDisabled = 0;
  let skippedNoChat = 0;
  let skippedTooSoon = 0;
  let cancelled = 0;
  for (const s of skips) {
    if (s.reason === 'disabled') skippedDisabled += 1;
    else if (s.reason === 'no_chat') skippedNoChat += 1;
    else if (s.reason === 'too_soon') skippedTooSoon += 1;
    else cancelled += 1;
  }
  return { skippedDisabled, skippedNoChat, skippedTooSoon, cancelled };
}

export function buildEnqueueSummary(
  result: ReminderPlanResult,
  enqueued: number,
  duplicates: number,
  horizonFrom: string,
  horizonTo: string
): ReminderEnqueueSummary {
  const s = summarizeSkips(result.skips);
  return {
    horizonFrom,
    horizonTo,
    considered: result.considered,
    enqueued,
    duplicates,
    skippedDisabled: s.skippedDisabled,
    skippedNoChat: s.skippedNoChat,
    skippedTooSoon: s.skippedTooSoon
  };
}
