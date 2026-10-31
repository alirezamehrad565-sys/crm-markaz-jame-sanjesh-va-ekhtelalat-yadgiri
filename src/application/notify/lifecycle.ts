import type {
  Appointment,
  NotificationChannel,
  NotificationTemplateId,
  TemplateVars
} from '@core/shared';
import { tehranTimeLabel, tehranYmdOf } from '@core/shared';

export type LifecycleEvent = 'created' | 'moved' | 'cancelled';

export interface LifecycleNotifyPlan {
  appointmentId: string;
  channel: NotificationChannel;
  template: NotificationTemplateId;
  recipient: string;
  payload: TemplateVars;
  studentId: string | null;
  staffId: string | null;
  dedupKey: string;
}

export interface PlanLifecycleInput {
  event: LifecycleEvent;
  appointment: Appointment;
  previous?: { startAt: string; endAt: string };
  staffName: string;
  studentNames: Map<string, string>;
  studentTargets: Map<string, { channel: NotificationChannel; chatId: string }>;
  staffChats: string[];
  classTargets?: Map<string, { channel: NotificationChannel; chatId: string; className: string }>;
  staffChannel?: NotificationChannel;
  enabled: boolean;
  clinicName?: string;
}

const PARENT_TEMPLATE: Record<LifecycleEvent, NotificationTemplateId> = {
  created: 'appointment_created',
  moved: 'appointment_changed',
  cancelled: 'appointment_cancelled'
};

const STAFF_TEMPLATE: Record<LifecycleEvent, NotificationTemplateId> = {
  created: 'staff_appointment_created',
  moved: 'staff_appointment_changed',
  cancelled: 'staff_appointment_cancelled'
};

const TEACHER_TEMPLATE: Record<LifecycleEvent, NotificationTemplateId> = {
  created: 'teacher_appointment_created',
  moved: 'teacher_appointment_changed',
  cancelled: 'teacher_appointment_cancelled'
};

export function planLifecycleNotifications(input: PlanLifecycleInput): LifecycleNotifyPlan[] {
  if (!input.enabled) return [];

  const appt = input.appointment;
  const dateYmd = tehranYmdOf(appt.startAt);
  const timeLabel = tehranTimeLabel(appt.startAt);
  const oldDateYmd = input.previous ? tehranYmdOf(input.previous.startAt) : undefined;
  const oldTimeLabel = input.previous ? tehranTimeLabel(input.previous.startAt) : undefined;

  const studentsLine = appt.students
    .filter((s) => s.attendance !== 'cancelled')
    .map((s) => input.studentNames.get(s.studentId) ?? '')
    .filter((n) => n.length > 0)
    .join('، ');

  const plans: LifecycleNotifyPlan[] = [];

  const studentGetsNotice = (attendance: string): boolean =>
    input.event === 'cancelled' ? true : attendance !== 'cancelled';

  for (const s of appt.students) {
    if (!studentGetsNotice(s.attendance)) continue;
    const target = input.studentTargets.get(s.studentId);
    if (!target) continue;

    plans.push({
      appointmentId: appt.id,
      channel: target.channel,
      template: PARENT_TEMPLATE[input.event],
      recipient: target.chatId,
      payload: {
        studentName: input.studentNames.get(s.studentId) ?? '',
        staffName: input.staffName,
        dateYmd,
        timeLabel,
        oldDateYmd,
        oldTimeLabel,
        clinicName: input.clinicName
      },
      studentId: s.studentId,
      staffId: null,
      dedupKey: `lc:${input.event}:${appt.id}:${input.previous?.startAt ?? ''}:${target.chatId}`
    });
  }

  const staffChannel: NotificationChannel = input.staffChannel ?? 'bale';
  for (const chatId of input.staffChats) {
    plans.push({
      appointmentId: appt.id,
      channel: staffChannel,
      template: STAFF_TEMPLATE[input.event],
      recipient: chatId,
      payload: {
        staffName: input.staffName,
        studentsLine,
        dateYmd,
        timeLabel,
        oldDateYmd,
        oldTimeLabel,
        clinicName: input.clinicName
      },
      studentId: null,
      staffId: appt.staffId,
      dedupKey: `lc:${input.event}:${appt.id}:${input.previous?.startAt ?? ''}:staff:${chatId}`
    });
  }

  for (const s of appt.students) {
    if (!studentGetsNotice(s.attendance)) continue;
    const target = input.classTargets?.get(s.studentId);
    if (!target) continue;

    plans.push({
      appointmentId: appt.id,
      channel: target.channel,
      template: TEACHER_TEMPLATE[input.event],
      recipient: target.chatId,
      payload: {
        studentName: input.studentNames.get(s.studentId) ?? '',
        className: target.className,
        staffName: input.staffName,
        dateYmd,
        timeLabel,
        oldDateYmd,
        oldTimeLabel,
        clinicName: input.clinicName
      },
      studentId: s.studentId,
      staffId: null,
      dedupKey: `lc:${input.event}:${appt.id}:${input.previous?.startAt ?? ''}:class:${target.chatId}`
    });
  }

  return plans;
}

export function buildScheduleEntries(
  appointments: Appointment[],
  viewer: { kind: 'student' | 'staff'; names: Map<string, string> }
): { timeLabel: string; title: string; subtitle?: string; cancelled: boolean }[] {
  const sorted = [...appointments].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const entries: { timeLabel: string; title: string; subtitle?: string; cancelled: boolean }[] = [];

  for (const a of sorted) {
    const timeLabel = tehranTimeLabel(a.startAt);

    if (viewer.kind === 'student') {
      const staffName = viewer.names.get(a.staffId) ?? 'متخصص';
      entries.push({
        timeLabel,
        title: staffName,
        subtitle: undefined,
        cancelled: a.status === 'cancelled'
      });
    } else {
      const names = a.students
        .filter((s) => s.attendance !== 'cancelled')
        .map((s) => viewer.names.get(s.studentId) ?? '')
        .filter((n) => n.length > 0);
      entries.push({
        timeLabel,
        title: names.length > 0 ? names.join('، ') : 'بدون دانش‌آموز',
        subtitle: undefined,
        cancelled: a.status === 'cancelled'
      });
    }
  }

  return entries;
}
