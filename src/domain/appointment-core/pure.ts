/**
 * ماژول هستهٔ نوبت‌دهی — توابع خالص منطق محض (بدون I/O)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فاز ۱ (بورد منشی) — منطق خالص وضعیت عملیاتی نوبت (تصمیم D1)
// ماتریس ترنزیشن فقط همین‌جاست؛ SQL هیچ قاعده‌ای ندارد.
// قواعد کلیدی:
// - NULL (برنامه‌ریزی‌شدهٔ عادی) نقطهٔ شروع است — اینجا با 'none' نمایش داده می‌شود
// - completed/no_show پایان‌حالت‌اند
// - لغو (status='cancelled') مسیر جدا دارد و در این ماتریس نیست
// - تغییر وضعیت اعلان نمی‌سازد (تصمیم D6) و version نمی‌زند (last-write-wins + audit)

import type { AppointmentOpsStatus } from '@core/shared';

/** حالت شروع — نوبت بدون ops_status (NULL در DB) */
export type OpsFrom = 'none' | AppointmentOpsStatus;

/**
 * ماتریس ترنزیشن‌های مجاز (Master Spec v2.0 §7.4 / REMAKE-PLAN D1):
 * none → checked_in | delayed | no_show
 * checked_in → in_session | no_show
 * delayed → checked_in | in_session | no_show
 * in_session → completed
 * completed → (پایان‌حالت)
 * no_show → (پایان‌حالت)
 */
export const OPS_STATUS_TRANSITIONS: Record<OpsFrom, AppointmentOpsStatus[]> = {
  none: ['checked_in', 'delayed', 'no_show'],
  checked_in: ['in_session', 'no_show'],
  delayed: ['checked_in', 'in_session', 'no_show'],
  in_session: ['completed'],
  completed: [],
  no_show: []
};

/** آیا ترنزیشن مجاز است؟ (from='none' یعنی NULL در DB) */
export function canTransitionOps(from: OpsFrom, to: AppointmentOpsStatus): boolean {
  return OPS_STATUS_TRANSITIONS[from].includes(to);
}

/** تبدیل مقدار DB به حالت ماتریس — NULL → 'none' */
export function opsFromDb(value: AppointmentOpsStatus | null | undefined): OpsFrom {
  return value ?? 'none';
}

/**
 * پیام actionable برای ترنزیشن نامعتبر (§33 — خطا باید بگوید چه کاری مجاز است).
 * فقط برای ترنزیشن‌های نامعتبر صدا زده می‌شود.
 */
export function opsTransitionMessage(from: OpsFrom, to: AppointmentOpsStatus): string {
  const allowed = OPS_STATUS_TRANSITIONS[from];
  if (allowed.length === 0) {
    // پایان‌حالت‌ها
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
