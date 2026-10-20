/**
 * سرویس تایم‌لاین پرونده — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فاز ۶ — تایم‌لاین دانش‌آموز (§11) — Projection خالص؛ هیچ جدولی مالک نمی‌شود (§4)
// منابع: appointments(+ops_status/attendance)، audit_log (whitelist §11.2)،
// notifications (sent)، followups — merge قطعی در pure.ts
// kind 'assessment' حذف شد (assessments در case-events ادغام شد)

import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';

/** انواع رویداد تایم‌لاین — whitelist §11.2 (رویدادهای generic هرگز) — کمیسیون — تکلیف/بازگشت — رویداد پرونده */
export const TIMELINE_KINDS = [
  'student_created',
  'case_status',
  'special_need',
  'tags',
  'waitlist',
  'appointment',
  'appointment_moved',
  'session_note',
  'followup',
  'notification',
  'committee',
  'exercise',
  'clinical_path',
  'case_event'
] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number];

/** رویداد تایم‌لاین — پاسخ عین §11.6 */
export interface TimelineEvent {
  /** ISO UTC — لحظهٔ رویداد */
  at: string;
  kind: TimelineKind;
  title: string;
  subtitle?: string | null;
  /** نام بازیگر (از staff) — بازیگر سیستمی/بات → null */
  actor?: string | null;
  /** ارجاع برای deep-link فرانت */
  ref?: { type: string; id: string } | null;
}

/** «اقدام بعدی» پروفایل زنده (§14) — derivation از دادهٔ موجود */
export interface TimelineNextAction {
  type: 'appointment' | 'followup';
  /** ISO UTC — زمان نوبت یا مهلت پیگیری */
  at: string | null;
  title: string;
  id: string;
}

export interface TimelineFilters {
  /** ISO UTC — فقط رویدادهای >= from */
  from?: string;
  /** ISO UTC — فقط رویدادهای <= to */
  to?: string;
  /** فیلتر انواع (comma-separated از TIMELINE_KINDS) — پیش‌فرض همه */
  kinds?: TimelineKind[];
  /** پیش‌فرض ۵۰ — سقف ۲۰۰ */
  limit?: number;
  /** برای صفحه‌بندی «نمایش بیشتر» */
  offset?: number;
}

export interface StudentTimelineDeps {
  db: DbClient;
}

export interface TimelineResult {
  events: TimelineEvent[];
  nextAction: TimelineNextAction | null;
  /** آیا رویدادهای بیشتری برای صفحه بعد هست (صفحه‌بندی «نمایش بیشتر») */
  hasMore: boolean;
}

export interface StudentTimelineService {
  /** merge قطعی رویدادهای whitelist + «اقدام بعدی» — 404 بیرون اینجا مدیریت می‌شود */
  list(studentId: string, filters: TimelineFilters, actor: AuthContext): Promise<TimelineResult>;
}
