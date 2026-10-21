/**
 * ماژول پروندهٔ دانش‌آموز — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تایپ‌های عمومی ماژول student-profile — مالک جدول‌های students و schools

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext, SchoolKind, SpecialNeedSeverity, SpecialNeedType, StaffRole, StudentCaseStatus, StudentPathway, TagRef } from '@core/shared';

/** مدرسه/مهدکودک ( + مدیر + کد رسمی و یادداشت) */
export interface School {
  id: string;
  name: string;
  kind: SchoolKind;
  genderType: string | null;
  phone: string | null;
  address: string | null;
  /** — مدیر مدرسه (نام و تلفن برای ارتباط مرکز با مدرسه) */
  principalName: string | null;
  principalPhone: string | null;
  /** — کد رسمی مدرسه در نظام آموزش‌وپرورش (یکتا؛ خالی = بدون کد) */
  code: string | null;
  /** — یادداشت آزاد مرکز دربارهٔ مدرسه */
  notes: string | null;
  active: boolean;
}

/** کلاس مدرسه — هر کلاس یک معلم با نام و تلفن دارد */
export interface SchoolClass {
  id: string;
  schoolId: string;
  schoolName?: string;
  name: string;
  teacherName: string | null;
  teacherPhone: string | null;
  active: boolean;
  /** تعداد دانش‌آموز فعال کلاس — فقط در فهرست پر می‌شود */
  studentCount?: number;
}

export interface Student {
  id: string;
  /** — پرونده‌های بدون کد ملی (آرشیو) نگه‌دارندهٔ یکتای «NAS-…» دارند */
  nationalId: string | null;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  gender: 'male' | 'female' | null;
  grade: string | null;
  schoolId: string | null;
  /** — کلاس مدرسه (برای اعلان معلم و KPI همکاری) */
  classId: string | null;
  className: string | null;
  teacherName: string | null;
  /** — تلفن معلم از کلاس — برای باجت تماس با معلم در پروفایل */
  teacherPhone: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  guardianPhone: string | null;
  active: boolean;
  createdAt: string;
  /** برچسب‌های فعال — فقط در پاسخ فهرست/جستجو پر می‌شود */
  tags?: TagRef[];
  /** — وضعیت پذیرش (projection از waitlist): waiting = منتظر دریافت خدمت، admitted = پذیرش شده */
  waitStatus?: 'waiting' | 'admitted' | null;
  /** — شروع انتظار (ISO) — فقط وقتی waitStatus = waiting */
  waitSince?: string | null;
  /** فاز ۶ — وضعیت پرونده (§12.1/§14.2، D5) — NULL = بدون وضعیت ثبت‌شده */
  caseStatus?: StudentCaseStatus | null;
  /** — مسیر پرونده (learning = اختلال یادگیری / rehab = توانبخشی ذهنی-جسمی) — NULL = تعیین‌نشده */
  pathway?: StudentPathway | null;
  /** -c — مسئول پرونده (سپردن رسمی پرونده به درمانگر) — NULL = بدون مسئول */
  ownerStaffId?: string | null;
  ownerName?: string | null;
  /** فاز ۷ — نیاز ویژهٔ شناسایی‌شده (§12، D3) — NULL = ثبت‌نشده؛ نوع/شدت/زمان شناسایی */
  specialNeedType?: SpecialNeedType | null;
  specialNeedSeverity?: SpecialNeedSeverity | null;
  identifiedAt?: string | null;
  /** — شمارش ارزیابی‌های فعال — فقط در پاسخ فهرست/جستجو پر می‌شود (الگوی برای برچسب‌ها) */
  assessmentCount?: number;
}

export interface NewSchoolInput {
  name: string;
  kind: SchoolKind;
  genderType?: string;
  phone?: string;
  address?: string;
  principalName?: string;
  principalPhone?: string;
  /** */
  code?: string;
  notes?: string;
}

export interface UpdateSchoolInput {
  name?: string;
  kind?: SchoolKind;
  genderType?: string;
  phone?: string;
  address?: string;
  principalName?: string;
  principalPhone?: string;
  /** */
  code?: string;
  notes?: string;
}

export interface NewClassInput {
  schoolId: string;
  name: string;
  teacherName?: string;
  teacherPhone?: string;
}

export interface UpdateClassInput {
  name?: string;
  teacherName?: string | null;
  teacherPhone?: string | null;
}

export interface NewStudentInput {
  /** — اختیاری: در آرشیو می‌تواند خالی باشد (نگه‌دارندهٔ «NAS-…» ثبت می‌شود) */
  nationalId?: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  gender?: 'male' | 'female';
  grade?: string;
  schoolId?: string;
  classId?: string;
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
  /** — مسئول پرونده در لحظهٔ تعریف (هم‌راستا با «دیگه نیاز به ثبت مجدد نباشه») */
  ownerStaffId?: string;
  /** — ثبت مستقیم در آرشیو (دیتابیس دانش‌آموزان نیاز ویژهٔ شهر) — active=0 */
  archived?: boolean;
  /** — مسیر پرونده در لحظهٔ تعریف (پذیرش) — اختیاری؛ بعداً قابل تغییر */
  pathway?: StudentPathway;
}

export interface UpdateStudentInput {
  firstName?: string;
  lastName?: string;
  /** — فقط «اولین ثبت» کد ملی پروندهٔ نگه‌دارنده‌دار (NAS-…) مجاز است */
  nationalId?: string;
  birthDate?: string;
  gender?: 'male' | 'female';
  grade?: string;
  schoolId?: string | null;
  classId?: string | null;
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
}

export interface StudentSearchFilters {
  query?: string;
  schoolId?: string;
  grade?: string;
  /** فیلتر بر اساس برچسب */
  tagId?: string;
  active?: boolean;
  /** — فیلتر مسئول پرونده (دفتر: لیست دانش‌آموزهای یک همکار) */
  ownerId?: string;
  /** — دامنهٔ نقش درمانگر: فقط پرونده‌های مسئولِ خودش یا با سابقهٔ جلسه با خودش
   * (هم‌ارز derivation «دانش‌آموزان من» — به دستور کاربر: دانش‌آموز به هر همکاری
   * داده شد تو لیست دانش‌آموزهای همان معلم نشان داده شود) */
  staffScope?: string;
  page: number;
  pageSize: number;
}

export interface StudentDirectoryStats {
  totalStudents: number;
  totalSchools: number;
  activeSchools: number;
}

/**
 * — سابقهٔ تحصیلی سال‌به‌سال (به‌خصوص پرونده‌های آرشیو که از سال‌های قبل می‌آیند):
 * کجا درس خوانده، سطح/پایهٔ همان سال، توضیحات — مدخل‌ها با فرم پنجرهٔ «تاریخچهٔ تحصیلی»
 * پشت‌سرهم اضافه می‌شوند.
 */
export interface EducationHistoryEntry {
  id: string;
  studentId: string;
  /** سال تحصیلی آزاد — مثل «۱۴۰۲–۱۴۰۳» */
  studyYear: string;
  schoolName: string | null;
  level: string | null;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface NewEducationHistoryInput {
  studyYear: string;
  schoolName?: string;
  level?: string;
  notes?: string;
}

/** نوبت از دید یک دانش‌آموز خاص — برای صفحه پروفایل */
export interface StudentAppointment {
  appointmentId: string;
  staffId: string;
  staffName: string | null;
  startAt: string;
  endAt: string;
  status: string;
  myAttendance: string;
  note: string | null;
}

/** — T7 (m150-b): معلم روی پروندهٔ دانش‌آموز — چند معلم = چند لینک مستقل فرم جامع معلم
 * مکملِ فیلد تک‌معلمِ کلاس (classes.teacher_name) — آن فیلد هرگز حذف/تغییر نمی‌کند.
 */
export interface StudentTeacher {
  id: string;
  studentId: string;
  /** نام و نام خانوادگی — پاسخ فرم معلم با همین نام روی پرونده می‌نشیند («پاسخ معلم: X») */
  name: string;
  /** برچسب کلاس/درس (آزاد — مثل «چهارم ب — ریاضی») */
  classLabel: string | null;
  /** راه ارتباطی (تلفن/بله) */
  contact: string | null;
  createdAt: string;
}

export interface NewStudentTeacherInput {
  name: string;
  classLabel?: string;
  contact?: string;
}

export interface StudentProfileDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface StudentProfileService {
  // ─── Schools ───
  createSchool(input: NewSchoolInput, actor: AuthContext): Promise<School>;
  listSchools(filters: { kind?: SchoolKind; active?: boolean }): Promise<School[]>;
  getSchoolById(id: string): Promise<School | null>;
  updateSchool(id: string, patch: UpdateSchoolInput, actor: AuthContext): Promise<School>;
  deactivateSchool(id: string, actor: AuthContext): Promise<School>;
  /** — حذف کامل مدرسهٔ خالی (بدون دانش‌آموز/کلاس) — ارجاع دارد → ConflictError */
  deleteSchool(id: string, actor: AuthContext): Promise<void>;

  // ─── Classes ───
  createClass(input: NewClassInput, actor: AuthContext): Promise<SchoolClass>;
  listClasses(filters: { schoolId?: string; active?: boolean }): Promise<SchoolClass[]>;
  getClassById(id: string): Promise<SchoolClass | null>;
  updateClass(id: string, patch: UpdateClassInput, actor: AuthContext): Promise<SchoolClass>;
  deactivateClass(id: string, actor: AuthContext): Promise<SchoolClass>;
  /** — حذف کامل کلاس خالی (بدون دانش‌آموز) — ارجاع دارد → ConflictError */
  deleteClass(id: string, actor: AuthContext): Promise<void>;
  /** شناسه‌های دانش‌آموزان فعال یک کلاس (برای برنامه معلم در بات) */
  listStudentIdsByClass(classId: string): Promise<string[]>;
  /** نقشه دانش‌آموز → کلاس‌اش (برای اعلان معلم مدرسه) */
  getClassesForStudents(studentIds: string[]): Promise<Map<string, { classId: string; className: string; teacherName: string | null }>>;

  // ─── Students ───
  createStudent(input: NewStudentInput, actor: AuthContext): Promise<Student>;
  /**
   * فاز W — ساخت پرونده داخل تراکنشِ فراخواننده (waitlist.schedule):
   * اعتبارسنجی + INSERT + audit در همان tx بافر می‌شوند؛ پاسخ در حافظه
   * ساخته می‌شود (className/teacherName خالی — فقط برای اتصال نوبت کافی است).
   */
  createStudentWithin(tx: DbClient, input: NewStudentInput, actor: AuthContext): Promise<Student>;
  searchStudents(filters: StudentSearchFilters): Promise<{ items: Student[]; total: number }>;
  getStudentById(id: string): Promise<Student | null>;
  getStudentByNationalId(nationalId: string): Promise<Student | null>;
  updateStudent(id: string, patch: UpdateStudentInput, actor: AuthContext): Promise<Student>;
  deactivateStudent(id: string, actor: AuthContext): Promise<Student>;
  /** فعال‌سازی مجدد دانش‌آموز غیرفعال */
  activateStudent(id: string, actor: AuthContext): Promise<Student>;
  /** — حذف کامل پروندهٔ بدون سابقه — ارجاع دارد → ConflictError (راهنما: آرشیو) */
  deleteStudent(id: string, actor: AuthContext): Promise<void>;
  /**
   * فاز ۶ — تغییر وضعیت پرونده (D5) — فقط منشی/مدیر (RBAC در route)؛
   * همان مقدار = no-op بدون audit؛ تغییر با audit هم‌تراکنش student.case_status.changed.
   */
  changeCaseStatus(id: string, caseStatus: StudentCaseStatus, actor: AuthContext): Promise<Student>;
  /**
   * — تعیین/برداشتن مسیر پرونده (learning/rehab) — مدیر/منشی/درمانگرِ مسئول؛
   * همان مقدار = no-op بدون audit؛ تغییر با audit هم‌تراکنش student.pathway.changed.
   */
  changePathway(id: string, pathway: StudentPathway | null, actor: AuthContext): Promise<Student>;
  /**
   * -c — تعیین/برداشتن «مسئول پرونده» — فقط منشی/مدیر (RBAC در route)؛
   * همان مقدار = no-op بدون audit؛ تغییر با audit هم‌تراکنش student.owner.changed
   * — منبع رویداد تایم‌لاین.
   */
  changeOwner(id: string, ownerStaffId: string | null, actor: AuthContext): Promise<Student>;
  /**
   * فاز ۷ — ثبت/ویرایش نیاز ویژه (§12، D3) — فقط منشی/مدیر (RBAC در route)؛
   * همان مقدار = no-op بدون audit؛ تغییر با audit هم‌تراکنش student.special_need.changed
   * (فقط id فیلدها — §12.10). identified_at: اگر صریح بیاید همان؛ وگرنه در اولین
   * شناسایی (نوع قبلی NULL، جدید غیر NULL) «الان»؛ پاک‌کردن نوع → identified_at هم NULL.
   */
  changeSpecialNeed(
    id: string,
    patch: { specialNeedType: SpecialNeedType | null; specialNeedSeverity: SpecialNeedSeverity | null; identifiedAt?: string | null },
    actor: AuthContext
  ): Promise<Student>;

  /**
   * — تاریخچهٔ تحصیلی — خواندن همهٔ نقش‌ها؛ ثبت/حذف فقط دفتر (RBAC در route).
   */
  listEducationHistory(studentId: string): Promise<EducationHistoryEntry[]>;
  addEducationHistory(studentId: string, input: NewEducationHistoryInput, actor: AuthContext): Promise<EducationHistoryEntry>;
  deleteEducationHistory(studentId: string, entryId: string, actor: AuthContext): Promise<void>;

  /** نوبت‌های اخیر یک دانش‌آموز — join با staff برای نام */
  listStudentAppointments(studentId: string, filters?: { from?: string; to?: string; limit?: number }): Promise<StudentAppointment[]>;

  // ─── T7 (m150-b): معلم‌های دانش‌آموز — خواندن همهٔ نقش‌ها؛ ثبت/حذف سه نقش مرکز (RBAC در route) ───
  listStudentTeachers(studentId: string): Promise<StudentTeacher[]>;
  addStudentTeacher(studentId: string, input: NewStudentTeacherInput, actor: AuthContext): Promise<StudentTeacher>;
  deleteStudentTeacher(studentId: string, teacherId: string, actor: AuthContext): Promise<void>;

  // ─── read-only stats (برای dashboard) ───
  getDirectoryStats(): Promise<StudentDirectoryStats>;
}
