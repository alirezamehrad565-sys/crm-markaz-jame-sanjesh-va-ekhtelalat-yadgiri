/**
 * ماژول هستهٔ نوبت‌دهی — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تایپ‌های عمومی ماژول appointment-core

import type { Appointment, AppointmentOpsStatus, AppointmentStudent, AuthContext, ConflictWarning, CopyWeekInput, CopyWeekResult, NewAppointmentInput } from '@core/shared';
import type { DbClient } from '@core/db';

export interface AppointmentUpdatePatch {
  /** — nullish: null هم «بدون توضیح» است */
  note?: string | null;
}

export interface ListFilters {
  staffId?: string;
  from?: string;
  to?: string;
  studentId?: string;
}

/**
 * فاز ۵ — دانش‌آموزِ همکار جاری (اشتقاق D4 از سابقهٔ نوبت) + وضعیت پذیرش (پروجکشن )
 */
export interface MyStudent {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  schoolId: string | null;
  schoolName: string | null;
  classId: string | null;
  className: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  /** پذیرش‌شده / منتظر دریافت خدمت / بدون لیست انتظار (متقاضیان قدیمی) */
  waitStatus: 'waiting' | 'admitted' | null;
  waitSince: string | null;
}

export interface AppointmentDeps {
  db: DbClient;
  audit: import('@core/audit').AuditWriter;
  logger: import('@core/logger').Logger;
}

/**
 * ناظر چرخه حیات نوبت — پس از موفقیت هر عملیات فراخوانی می‌شود.
 * اعلان‌ها در application/notify پیاده می‌شوند؛ خطای ناظر هرگز عملیات اصلی را برنمی‌گرداند.
 */
export interface AppointmentLifecycleObserver {
  onCreated(appointment: Appointment): Promise<void>;
  onMoved(appointment: Appointment, previous: { startAt: string; endAt: string }): Promise<void>;
  onCancelled(appointment: Appointment): Promise<void>;
}

/**
 * — ناظر وضعیت عملیاتی (بورد منشی) — بدون اعلان (D6).
 * مصرف‌کنندهٔ فعلی: پذیرش خودکار لیست انتظار هنگام اتمام جلسه (ops_status=completed).
 */
export interface AppointmentOpsObserver {
  onOpsStatusChanged(
    appointment: Appointment,
    students: Array<{ studentId: string }>,
    from: AppointmentOpsStatus | null,
    to: AppointmentOpsStatus
  ): Promise<void>;
}

/**
 * قرارداد سرویس نوبت — مالک WRITE جدول‌های appointments و appointment_students
 * (به‌جز ستون attendance که مالکش attendance است).
 */
export interface AppointmentService {
  create(input: NewAppointmentInput, actor: AuthContext): Promise<{ appointment: Appointment; warnings: ConflictWarning[] }>;
  /**
   * فاز W — ساخت نوبت داخل تراکنشِ فراخواننده (مثلاً waitlist.schedule):
   * اعتبارسنجی + INSERTها + audit در همان tx بافر می‌شوند؛ بدون read-back
   * (خواندن داخل تراکنش مقدار کهنه می‌دهد — پاسخ در حافظه ساخته می‌شود)
   * و بدون آتش‌زدن observer — بعد از commit با notifyCreated صدا زده شود.
   */
  createWithinTx(tx: DbClient, input: NewAppointmentInput, actor: AuthContext): Promise<{ appointment: Appointment; warnings: ConflictWarning[] }>;
  /** آتش‌زدن اعلان «نوبت جدید» از مسیر observer فعلی (بعد از commit فراخواننده) */
  notifyCreated(appointment: Appointment): Promise<void>;
  getById(id: string): Promise<Appointment | null>;
  list(filters: ListFilters): Promise<Appointment[]>;
  /**
   * فاز ۵ — دانش‌آموزانِ فعالِ مرتبط با همکار جاری (سابقهٔ نوبت) با badge پذیرش —
   * منبع picker «نوبت‌دهی من». پذیرش‌شده‌ها اول.
   */
  listMyStudents(actor: AuthContext): Promise<MyStudent[]>;
  update(id: string, patch: AppointmentUpdatePatch, version: number, actor: AuthContext): Promise<Appointment>;
  move(id: string, newStartAt: string, version: number, actor: AuthContext): Promise<{ appointment: Appointment; warnings: ConflictWarning[] }>;
  resize(id: string, newEndAt: string, version: number, actor: AuthContext): Promise<{ appointment: Appointment; warnings: ConflictWarning[] }>;
  cancel(id: string, version: number, actor: AuthContext): Promise<Appointment>;
  /** نوبت لغوشده را دوباره برقرار می‌کند */
  restore(id: string, version: number, actor: AuthContext): Promise<Appointment>;
  /**
   * — حذف کامل نوبت ثبت‌شدهٔ اشتباه (نه لغو). scope هم‌سوی cancel؛
   * سابقهٔ جلسه (حضور/یادداشت) یا گزارش جلسه → ConflictError؛
   * ورودی لیست انتظار متصل خودکار به صف برمی‌گردد؛ audit هم‌تراکنش.
   */
  remove(id: string, actor: AuthContext): Promise<void>;
  /**
   * فاز ۱ (تصمیم D1) — تغییر وضعیت عملیاتی روی بورد منشی.
   * ماتریس ترنزیشن در pure.ts؛ ترنزیشن نامعتبر → ConflictError با پیام actionable.
   * بدون version-check و بدون اعلان (D6)؛ audit هم‌تراکنش.
   */
  setOpsStatus(id: string, opsStatus: AppointmentOpsStatus, actor: AuthContext): Promise<Appointment>;
  addStudent(appointmentId: string, studentId: string, facetId: string | undefined, actor: AuthContext): Promise<void>;
  removeStudent(appointmentId: string, studentId: string, actor: AuthContext): Promise<void>;
  copyWeek(input: CopyWeekInput, actor: AuthContext): Promise<CopyWeekResult>;
  undoCopyWeek(batchId: string, actor: AuthContext): Promise<{ removed: number }>;

  /** حل وابستگی چرخه‌ای با conflict-engine (setter injection) */
  setConflictEngine(engine: {
    checkOverlap(proposed: {
      staffId: string;
      startAt: string;
      endAt: string;
      excludeId?: string;
    }): Promise<ConflictWarning[]>;
  }): void;

  /** ثبت ناظر چرخه حیات */
  setLifecycleObserver(observer: AppointmentLifecycleObserver): void;
  /** — ناظر وضعیت عملیاتی (پذیرش خودکار لیست انتظار؛ بدون اعلان) */
  setOpsObserver(observer: AppointmentOpsObserver): void;
}

export type { Appointment, AppointmentOpsStatus, AppointmentStudent, ConflictWarning, CopyWeekInput, CopyWeekResult, NewAppointmentInput };
