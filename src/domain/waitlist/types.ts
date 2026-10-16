/**
 * ماژول لیست انتظار — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تایپ‌های ماژول لیست انتظار (فاز W)
// مالک WRITE جدول waitlist — هیچ جدول دیگری را مستقیم نمی‌نویسد؛
// ساخت پرونده/نوبت از طریق createStudentWithin/createWithinTx در همان تراکنش انجام می‌شود.

import type { AuthContext, ConflictWarning, Appointment, WaitlistBadge, WaitlistEntry, WaitlistPriority, WaitlistSource, WaitlistStatus } from '@core/shared';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { Student, StudentProfileService } from '../student-profile/types';
import type { AppointmentService } from '../appointment-core/types';
import type { FollowUpsService } from '../followups/types';

export interface NewWaitlistInput {
  firstName: string;
  lastName: string;
  /** موبایل ولیّ نرمال‌شده 09xxxxxxxxx */
  phone: string;
  nationalId?: string;
  birthDate?: string;
  schoolId?: string;
  classId?: string;
  source: WaitlistSource;
  serviceType?: string;
  note?: string;
  priority: WaitlistPriority;
  /** — پروندهٔ متصل: مشخصات هویتی از خود پرونده پر می‌شود */
  studentId?: string;
}

export interface UpdateWaitlistInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  nationalId?: string | null;
  birthDate?: string | null;
  schoolId?: string | null;
  classId?: string | null;
  source?: WaitlistSource;
  serviceType?: string | null;
  note?: string | null;
  /** اولویت با PATCH قابل تغییر است (وضعیت فقط endpoint اختصاصی) */
  priority?: WaitlistPriority;
}

export interface WaitlistListFilters {
  status?: WaitlistStatus;
  priority?: WaitlistPriority;
  q?: string;
}

/** — ورود/خروج پروندهٔ دانش‌آموز از لیست انتظار (تیک «منتظر دریافت خدمت») */
export interface StudentWaitStatusInput {
  awaiting: boolean;
  source: WaitlistSource;
  serviceType?: string;
  priority: WaitlistPriority;
}

export interface WaitlistScheduleInput {
  staffId: string;
  startAt: string;
  endAt: string;
  /** پروندهٔ موجود صریح (اولویت اول تطبیق) */
  studentId?: string;
  /** کد ملی برای تطبیق یا ساخت پروندهٔ جدید */
  nationalId?: string;
  note?: string;
}

export interface WaitlistScheduleResult {
  entry: WaitlistEntry;
  appointment: Appointment;
  student: Student;
  warnings: ConflictWarning[];
}

export interface WaitlistDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** فقط همین متدها — ایجاد نوبت/پرونده بدون duplicate منطق */
  appointments: Pick<AppointmentService, 'createWithinTx' | 'getById' | 'notifyCreated'>;
  students: Pick<StudentProfileService, 'createStudentWithin' | 'getStudentById'>;
  /** فاز ۳ — هوک رد/نیامد → پیگیری با مسئول/مهلت (پیشنهاد کاربر؛ §37) */
  followups: Pick<FollowUpsService, 'createWithinTx'>;
}

export interface WaitlistService {
  list(filters: WaitlistListFilters): Promise<WaitlistEntry[]>;
  getById(id: string): Promise<WaitlistEntry | null>;
  create(input: NewWaitlistInput, actor: AuthContext): Promise<WaitlistEntry>;
  update(id: string, patch: UpdateWaitlistInput, actor: AuthContext): Promise<WaitlistEntry>;
  /** ثبت تماس — waiting/called → called؛ شمارنده + زمان + یادداشت append */
  call(id: string, note: string | undefined, actor: AuthContext): Promise<WaitlistEntry>;
  /** تبدیل اتمیک به نوبت — پروندهٔ موجود یا ساخت پرونده + نوبت، همه در یک تراکنش */
  schedule(id: string, input: WaitlistScheduleInput, actor: AuthContext): Promise<WaitlistScheduleResult>;
  /** — تیک «منتظر دریافت خدمت» روی پرونده: ساخت/به‌روزرسانی/لغو ورودیِ متصل در یک تراکنش */
  setStudentWaiting(studentId: string, input: StudentWaitStatusInput, actor: AuthContext): Promise<WaitlistEntry | null>;
  /** رد توسط مرکز — دلیل اختیاری به note append می‌شود */
  reject(id: string, reason: string | undefined, actor: AuthContext): Promise<WaitlistEntry>;
  /** مراجعه‌کننده نیامد (از waiting/called/scheduled) */
  noShow(id: string, actor: AuthContext): Promise<WaitlistEntry>;
  /** انصراف خانواده (از waiting/called/scheduled) */
  cancel(id: string, actor: AuthContext): Promise<WaitlistEntry>;
  /** — بازگشت خروجِ اشتباه به صف انتظار (از rejected/no_show/cancelled — نه admitted) */
  reopen(id: string, note: string | undefined, actor: AuthContext): Promise<WaitlistEntry>;
  /** قفل ترتیب دستی — ترتیب idهای داده‌شده حاکم می‌شود */
  reorder(ids: string[], actor: AuthContext): Promise<WaitlistEntry[]>;
  /** بازگشت به ترتیب خودکار — پاک‌کردن همهٔ manual_order */
  autoOrder(actor: AuthContext): Promise<WaitlistEntry[]>;
  /** شمارنده‌های منو/بورد — overdue بر اساس WAITLIST_ALERT_DAYS */
  badge(): Promise<WaitlistBadge>;
  /** حذف نرم — ردیف در تاریخچه می‌ماند */
  softDelete(id: string, actor: AuthContext): Promise<void>;

  /**
   * ناظر حضور (best-effort؛ هرگز عملیات اصلی را شکست نمی‌دهد):
   * حضور «حاضر» روی نوبتِ متصل → وضعیت ورودی admitted (ماتریس فاز W)
   */
  onAttendanceMarked(appointmentId: string, studentId: string, status: string): Promise<void>;
}
