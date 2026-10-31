import type { AppointmentOpsStatus } from '@core/shared';

export type OpsFrom = 'none' | AppointmentOpsStatus;

export const OPS_STATUS_TRANSITIONS: Record<OpsFrom, AppointmentOpsStatus[]> = {
  none: ['checked_in', 'delayed', 'no_show'],
  checked_in: ['in_session', 'no_show'],
  delayed: ['checked_in', 'in_session', 'no_show'],
  in_session: ['completed'],
  completed: [],
  no_show: []
};

export function canTransitionOps(from: OpsFrom, to: AppointmentOpsStatus): boolean {
  return OPS_STATUS_TRANSITIONS[from].includes(to);
}

export function opsFromDb(value: AppointmentOpsStatus | null | undefined): OpsFrom {
  return value ?? 'none';
}

export function opsTransitionMessage(from: OpsFrom, to: AppointmentOpsStatus): string {
  const allowed = OPS_STATUS_TRANSITIONS[from];
  if (allowed.length === 0) {
    if (from === 'completed') return 'این نوبت «انجام شد» ثبت شده و وضعیت عملیاتی‌اش دیگر تغییر نمی‌کند';
    return 'برای این نوبت «نیامد» ثبت شده و وضعیت عملیاتی‌اش دیگر تغییر نمی‌کند';
  }
  const labels: Record<AppointmentOpsStatus, string> = {
    checked_in: 'آمد',
    delayed: 'تأخیر',
    in_session: 'شروع جلسه',
    completed: 'انجام شد',
    no_show: 'نیامد'
  };
  return `این تغییر مجاز نیست — برای وضعیت فعلی فقط این اقدام‌ها مجاز است: ${allowed
    .map((s) => `«${labels[s]}»`)
    .join('، ')}`;
}
