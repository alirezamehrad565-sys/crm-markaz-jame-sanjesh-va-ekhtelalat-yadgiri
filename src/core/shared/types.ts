/**
 * زیرساخت مشترک — زمان تهران، کدملی، اسکیمای Zod و ثابت‌ها — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// TypeScript types مشترک بین ماژول‌ها

import type {
  APPOINTMENT_STATUS,
  APPOINTMENT_OPS_STATUSES,
  ATTENDANCE_STATUS,
  DAY_NOTE_KINDS,
  FOLLOWUP_STATUSES,
  NEXT_ACTION_VALUES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TEMPLATES,
  STAFF_ATTENDANCE_STATUSES,
  STAFF_ROLES,
  SCHOOL_KINDS,
  STUDENT_GRADES,
  ScreeningTargetConfig,
  TAG_CATEGORIES,
  TODO_BOXES,
  TODO_PRIORITIES,
  TODO_STATUSES
} from './constants';
import type { KnowledgeCategory } from './constants';
import type { Logger } from '@core/logger';

// بازنشر نوع هدفگذاری سنجش (تعریف اصلی در constants.ts)
export type { ScreeningTargetConfig };

export type StaffRole = (typeof STAFF_ROLES)[number];
export type StaffAttendanceStatus = (typeof STAFF_ATTENDANCE_STATUSES)[number];
// — انواع کمیسیون حذف شدند (ماژول قطع شد؛ جدول‌های DB برای دادهٔ تاریخی گزارش می‌مانند)
export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[keyof typeof APPOINTMENT_STATUS];
/** فاز ۱ — وضعیت عملیاتی نوبت (اختیاری؛ NULL/غایب = برنامه‌ریزی‌شدهٔ عادی) */
export type AppointmentOpsStatus = (typeof APPOINTMENT_OPS_STATUSES)[number];
/** فاز ۱ — نوع یادداشت روز کاری (تصمیم D2) */
export type DayNoteKind = (typeof DAY_NOTE_KINDS)[number];
/** فاز ۲ — اقدام بعدی جلسه (تصمیم D7)؛ 'none' = هیچ */
export type NextAction = (typeof NEXT_ACTION_VALUES)[number];
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];
export type SchoolKind = (typeof SCHOOL_KINDS)[number];
/** — پایه تحصیلی ثابت (لیبل فارسی) */
export type StudentGrade = (typeof STUDENT_GRADES)[number];

/** زمینه کاربر احراز هویت‌شده — از core/auth */
export interface AuthContext {
  staffId: string;
  email: string;
  role: StaffRole;
  displayName: string;
}

/** هشدار نرم تداخل — conflict-engine هرگز جلوی عملیات را نمی‌گیرد */
export interface ConflictWarning {
  type: 'overlap';
  appointmentId: string;
  staffId: string;
  existingStartAt: string;
  existingEndAt: string;
  proposedStartAt: string;
  proposedEndAt: string;
}

// ───────────── Appointments ─────────────

export interface AppointmentStudent {
  studentId: string;
  facetId: string | null;
  attendance: AttendanceStatus;
  note: string | null;
  /** فاز ۲ — گزارش جلسه (ستون session_note؛ NULL = ثبت‌نشده) */
  sessionNote?: string | null;
  /** فاز ۲ — اقدام بعدی (D7)؛ NULL = هیچ ('none') */
  nextAction?: NextAction | null;
}

export interface Appointment {
  id: string;
  staffId: string;
  startAt: string; // ISO UTC
  endAt: string;   // ISO UTC
  status: AppointmentStatus;
  /**
   * فاز ۱ (تصمیم D1) — وضعیت عملیاتی؛ جدا از status.
   * غایب/null = برنامه‌ریزی‌شدهٔ عادی. لغو همچنان فقط در status است.
   */
  opsStatus?: AppointmentOpsStatus | null;
  /** — نوع جلسه (جدول ۴ اساس‌نامه) — null = بدون نوع (نوبت‌های قدیمی) */
  sessionType?: import('./constants').SessionTypeKey | null;
  note: string | null;
  version: number;
  batchId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  students: AppointmentStudent[];
}

export interface NewAppointmentInput {
  staffId: string;
  startAt: string;
  endAt: string;
  students: { studentId: string; facetId?: string }[];
  /** — nullish: null هم «بدون توضیح» است (ارگونومی API) */
  note?: string | null;
  /** — نوع جلسه (جدول ۴ اساس‌نامه) — null = بدون نوع */
  sessionType?: import('./constants').SessionTypeKey | null;
}

export interface AppointmentUpdateInput {
  note?: string | null;
}

export interface CopyWeekInput {
  sourceMonday: string; // YYYY-MM-DD
  targetMonday: string; // YYYY-MM-DD
  staffId?: string;
  dryRun?: boolean;
}

export interface CopyWeekResult {
  batchId: string | null;
  copied: number;
  conflicts: ConflictWarning[];
  dryRun: boolean;
}

// ───────────── Attendance ─────────────

export interface PendingAttendanceItem {
  appointmentId: string;
  studentId: string;
  studentName: string;
  staffId: string;
  startAt: string;
  endAt: string;
}

export interface AttendanceStats {
  present: number;
  absent: number;
  /** — حاضر با تأخیر (غیبت حساب نمی‌شود) */
  late: number;
  pending: number;
  cancelled: number;
  absenceRate: number; // 0..1
}

// ───────────── Pagination ─────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

// ───────────── Notifications ─────────────

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
export type NotificationTemplateId = (typeof NOTIFICATION_TEMPLATES)[number];

/** متغیرهای قالب پیام — همه اختیاری، هر قالب آن‌هایی را که لازم دارد مصرف می‌کند */
export interface TemplateVars {
  studentName?: string;
  staffName?: string;
  dateYmd?: string;   // YYYY-MM-DD تهران
  timeLabel?: string; // HH:MM تهران
  clinicName?: string;
  code?: string;      // کد اتصال بات
  chatId?: string;
  extra?: string;
  // ─── ───
  oldDateYmd?: string;    // زمان قبلی برای «تغییر نوبت»
  oldTimeLabel?: string;
  studentsLine?: string;  // فهرست نام دانش‌آموزان نوبت (برای پیام کارمند)
  // ─── ───
  announcementTitle?: string; // عنوان اعلان مدیر
  // ─── ───
  className?: string;     // نام کلاس مدرسه
  teacherName?: string;   // نام معلم مدرسه
  // ─── (پاسخ‌های بات) ───
  name?: string;          // نام کارمند/شخص متصل‌شده
  roleLine?: string;      // خط سمت («سمت: همکار (متخصص)»)
  studentNames?: string;  // فهرست نام دانش‌آموزان پیام لغو بات
  // ─── فاز ۴ (Todo) ───
  taskTitle?: string;     // عنوان کار داخلی واگذارشده
  // ─── (حلقهٔ بازگشت تکلیف) ───
  exerciseTitle?: string; // عنوان تمرین
  // ─── (یادآور بازسنجی مسیر مداخله — فاز بهبود) ───
  dueYmd?: string;        // تاریخ بازسنجی (YYYY-MM-DD)
  // ─── (بات نقش‌محور CRM — قالب‌های عمومی/صف/KPI) ───
  phone?: string;         // شمارهٔ تماس مرکز (bot_contact)
  links?: string;         // لینک‌های فایل‌های آموزشی (bot_public_files)
  count?: string;         // شمارش فارسی (bot_my_students)
  list?: string;          // فهرست چندخطی آماده (bot_my_students/bot_kpi)
  draftCount?: string;    // شمارش پیش‌نویس صف (bot_outbox)
  nextSend?: string | null; // ارسال بعدی صف (bot_outbox) — null یعنی خط حذف می‌شود
  readyCount?: string;    // آمادهٔ ارسال فوری (bot_outbox)
  failedCount?: string;   // ناموفق‌ها (bot_outbox)
  released?: string;      // رهاسازی‌شده (bot_outbox_flushed)
  sent?: string;          // ارسال‌شده (bot_outbox_flushed)
  title?: string;         // عنوان گزارش (bot_kpi)
  lines?: string;         // خطوط تجمیعی KPI (bot_kpi)
  // ─── (بات نقش‌محور نسخهٔ ۲) ───
  senderName?: string;    // نام فرستندهٔ پیام خانواده (bot_family_message)
  // ─── (تایم‌لاین و گزارش‌نویسی) ───
  formTitle?: string;     // عنوان چک‌لیست/فرم (bot_checklist_assigned / bot_checklist_result)
  score?: string;         // امتیاز فارسی (bot_checklist_result)
  band?: string | null;   // باند تحلیل چک‌لیست (bot_checklist_result)
  feedback?: string;      // بازخورد تصحیح تکلیف (homework_graded)
}

/** رکورد صف اعلان — نگاشت 1:1 به جدول notifications */
export interface NotificationRecord {
  id: string;
  channel: NotificationChannel;
  template: NotificationTemplateId;
  recipient: string | null;
  studentId: string | null;
  appointmentId: string | null;
  staffId: string | null;
  payload: TemplateVars;
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  dedupKey: string | null;
  /** — ساعت ارسال (ISO UTC)؛ NULL = فوری — dispatchPending فقط send_at <= now را می‌فرستد */
  sendAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** تنظیمات اعلان هر دانش‌آموز */
export interface NotificationPrefs {
  studentId: string;
  channel: NotificationChannel;
  chatId: string | null;
  remindersEnabled: boolean;
  reminderHoursBefore: number;
  updatedAt: string;
}

/** اتصال گفتگوی بات ↔ دانش‌آموز */
export interface BotLinkRecord {
  id: string;
  code: string;
  studentId: string;
  chatId: string | null;
  status: 'pending' | 'linked';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** — لینک آمادهٔ ارسال (ble.ir/<bot>?start=CODE) — با یوزرنیم ثبت‌شده پر می‌شود */
  deepLink?: string | null;
}

/** اتصال گفتگوی بات ↔ کارمند */
export interface StaffBotLinkRecord {
  id: string;
  code: string;
  staffId: string;
  chatId: string | null;
  status: 'pending' | 'linked';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** — لینک آمادهٔ ارسال (ble.ir/<bot>?start=CODE) — با یوزرنیم ثبت‌شده پر می‌شود */
  deepLink?: string | null;
}

/** اتصال گفتگوی بات ↔ کلاس مدرسه */
export interface ClassBotLinkRecord {
  id: string;
  code: string;
  classId: string;
  chatId: string | null;
  status: 'pending' | 'linked' | 'revoked';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** — فقط در فهرست مدیریت (بدون class_id) پر می‌شود */
  className?: string | null;
  schoolName?: string | null;
  /** — لینک آمادهٔ ارسال (ble.ir/<bot>?start=CODE) — با یوزرنیم ثبت‌شده پر می‌شود */
  deepLink?: string | null;
}

/** نتیجه resolve یک chat بله به پرونده (دانش‌آموز، کارمند یا کلاس مدرسه) */
export type ChatOwner =
  | { kind: 'student'; studentId: string }
  | { kind: 'staff'; staffId: string }
  | { kind: 'class'; classId: string };

// ───────────── Settings ─────────────

export interface CenterHourRange {
  weekday: number;      // 0 = شنبه … 6 = جمعه
  startMinute: number;  // دقیقه از نیمه‌شب تهران
  endMinute: number;
}

/** — هدفگذاری سنجش یک بازهٔ شمسی (month=null یعنی کل سال) — نوع در constants.ts */

/** — وزن‌های فرمول امتیازدهی (تنظیمات ← «امتیازبندی همکاران») */
export interface ScoringWeights {
  /** تولید محتوا */
  exercises: number;
  packages: number;
  templates: number;
  forms: number;
  /** استفاده از محتوا */
  exerciseUses: number;
  templateUses: number;
  formFills: number;
  /** ارجاع — مصرف توسط همکار دیگر */
  exerciseRefs: number;
  templateRefs: number;
  formRefs: number;
  /** وزن یکنواخت هر اقدام پایهٔ سامانه (پرونده، نوبت، گزارش، …) — پیش‌فرض ۱ */
  baseAction: number;
  /** سقف امتیاز فعالیت اداری مدیر/منشی در هر دوره — پیش‌فرض ۲۰ */
  adminCap: number;
}

/** — پیکربندی امتیازدهی همکاران (GET/PUT /api/settings/scoring — فقط مدیر) */
export interface ScoringConfig {
  /** تاریخ شروع شمارش امتیاز — YYYY-MM-DD میلادیِ روز تهران (نیمه‌شب تهران = cutoff) */
  epochYmd: string;
  /** cutoff UTC معادل — «YYYY-MM-DD HH:MM:SS» (برای موتور scoring) */
  epochUtc: string;
  /** وزن‌های مؤثر فعلی (پیش‌فرض + ذخیره‌شده) */
  weights: ScoringWeights;
  /** پیش‌فرض‌های موتور — برای دکمهٔ «بازنشانی» فرم */
  defaults: {
    epochYmd: string;
    weights: ScoringWeights;
  };
}

export interface CenterSettings {
  centerHours: CenterHourRange[];
  clinicName: string;
  defaultReminderHours: number;
  notifyOnCreate: boolean;
  notifyOnMove: boolean;
  notifyOnCancel: boolean;
  /** — خلاصهٔ روز بات (پوش صبحگاهی برنامهٔ امروز) */
  notifyDigest: boolean;
  /** — اعلان «نوبت خالی شد» به دفتر (مدیر/منشی) برای پیگیری لیست انتظار */
  notifyWaitlist: boolean;
  /** — شاخص سنجش: بازه‌های هدف (سال/ماه شمسی) */
  screeningTargets: ScreeningTargetConfig[];
  /** — شماره تماس عمومی مرکز (بات عموم مردم)؛ خالی = هنوز ثبت نشده */
  clinicPhone: string;
  /** — «ساعت ارسال» پیش‌نویس اعلان ثبت نوبت — 0..23 تهران */
  notifyBatchHour: number;
  /** — یوزرنیم بات بله برای ساخت لینک اتصال؛ خالی = لینک ساخته نمی‌شود */
  botUsername: string;
  /** وضعیت زیرساخت اعلان (فقط خواندنی — از env) */
  meta: {
    baleConfigured: boolean;
    webhookEnabled: boolean;
  };
}

// ───────────── Tags ─────────────

export type TagCategory = (typeof TAG_CATEGORIES)[number];

/** رکورد کامل برچسب — GET /api/tags (با شمارش استفاده) */
export interface TagRecord {
  id: string;
  name: string;
  category: TagCategory;
  color: string | null;
  active: boolean;
  /** چند دانش‌آموز این برچسب را دارند */
  usageCount?: number;
}

/** نسخه سبک برچسب — برای پیوست به دانش‌آموز */
export interface TagRef {
  id: string;
  name: string;
  category: TagCategory;
  color: string | null;
}

// ───────────── Global search ─────────────

export type SearchEntityType = 'student' | 'staff' | 'school' | 'tag' | 'waitlist';

export interface SearchItem {
  type: SearchEntityType;
  id: string;
  title: string;
  subtitle: string | null;
}

export interface SearchGroup {
  type: SearchEntityType;
  items: SearchItem[];
}

export interface GlobalSearchResult {
  query: string;
  groups: SearchGroup[];
}

/** نتیجه dispatch یک رکورد */
export interface DispatchResult {
  id: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/** خلاصه یک اجرای dispatchPending */
export interface DispatchSummary {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

/** خلاصه صف‌گذاری یادآوری‌های یک اجرای cron */
export interface ReminderEnqueueSummary {
  horizonFrom: string;  // ISO UTC
  horizonTo: string;    // ISO UTC
  considered: number;   // جفت‌های نوبت×دانش‌آموز بررسی‌شده
  enqueued: number;
  duplicates: number;
  skippedDisabled: number;
  skippedNoChat: number;
  skippedTooSoon: number;
}

// ───────────── Hono app types (Layer 1 infrastructure types) ─────────────

export interface AppBindings {
  DB: D1Database;
  ENV: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  /** — کلید امضای JWT نشست صفحه ورود (پیش‌فرض توسعه‌ای اگر خالی باشد) */
  AUTH_SECRET?: string;
}

export interface AppVariables {
  authContext: AuthContext;
  logger: Logger;
}

// ───────────── Dashboard ─────────────

export interface DashboardStaffCard {
  staffId: string;
  staffName: string;
  role: StaffRole;
  total: number;
  scheduled: number;
  cancelled: number;
}

export interface DashboardTodayCards {
  date: string; // YYYY-MM-DD (Tehran)
  rangeStartAt: string; // ISO UTC
  rangeEndAt: string;   // ISO UTC
  appointments: {
    total: number;
    scheduled: number;
    cancelled: number;
  };
  perStaff: DashboardStaffCard[];
  pendingAttendance: number;
  absenceRate: number;
  /** — additive: آمار کامل حضور برای تمایز «صفر واقعی» از «بدون داده» */
  attendance: AttendanceStats;
  activeConflicts: number;
  nextAppointment: {
    id: string;
    staffId: string;
    startAt: string;
    endAt: string;
  } | null;
  studentsSummary: {
    totalStudents: number;
    totalSchools: number;
    activeSchools: number;
  };
}

export interface DashboardSummaryDay {
  date: string; // YYYY-MM-DD Tehran
  total: number;
  scheduled: number;
  cancelled: number;
}

export interface DashboardPeriodSummary {
  from: string; // YYYY-MM-DD Tehran
  to: string;   // YYYY-MM-DD Tehran
  appointments: {
    total: number;
    scheduled: number;
    cancelled: number;
  };
  attendance: {
    present: number;
    absent: number;
    pending: number;
    cancelled: number;
    absenceRate: number;
  };
  perStaff: DashboardStaffCard[];
  byDay: DashboardSummaryDay[];
}

// ───────────── Dashboard — شاخص سنجش ─────────────

export interface DashboardScreeningGoalMonth {
  /** ماه شمسی ۱..۱۲ */
  month: number;
  label: string;
  done: number;
}

/** — یک هدف سنجش مستقل (سال/ماه/بازهٔ سفارشی) — مشترک بین داشبورد و بات */
export interface DashboardScreeningGoalItem {
  /** کلید پایدار برای رندر و حذف تکراری */
  key: string;
  /** year = کل سال · month = یک ماه · custom = بازهٔ سفارشی */
  mode: 'year' | 'month' | 'custom';
  /** عنوان اختصاصی — null = برچسب خودکار از بازه */
  title: string | null;
  /** برچسب فارسی بازه: «سال ۱۴۰۵» / «مرداد ۱۴۰۵» / «۱۴۰۵/۰۵/۰۱ تا ۱۴۰۵/۰۷/۱۵» */
  periodLabel: string;
  fromYmd: string;
  toYmd: string;
  target: number;
  done: number;
  /** درصد تحقق ۰..۱۰۰ (سقف ۱۰۰) */
  percent: number;
  remaining: number;
  /** active = امروز داخل بازه · upcoming = شروع نشده · past = تمام‌شده */
  status: 'active' | 'upcoming' | 'past';
}

/** گزارش کوتاه سنجش + نمودار تحقق هدفگذاری — GET /api/dashboard/screening-goal */
export interface DashboardScreeningGoal {
  todayYmd: string; // YYYY-MM-DD Tehran
  /** سال شمسی جاری (مثلاً ۱۴۰۵) */
  jalaliYear: number;
  todayCount: number;
  /** ۷ روز اخیر (شامل امروز) */
  weekCount: number;
  /** ۳۰ روز اخیر (شامل امروز) */
  monthCount: number;
  /** جمع سنجش از ابتدای سال شمسی تا امروز */
  yearDone: number;
  /** عادی = بدون برچسب ثابت (تعریف ) — در بازهٔ سال جاری */
  yearNormal: number;
  yearReferrals: number;
  /** درصد ارجاع سال (۰..۱۰۰) — null وقتی سنجشی نیست */
  referralRate: number | null;
  /** هدف سال جاری از تنظیمات — null یعنی هدفگذاری نشده */
  target: number | null;
  /** درصد تحقق ۰..۱۰۰ (سقف ۱۰۰) */
  targetPercent: number | null;
  targetRemaining: number | null;
  /** هدف ماه جاری (اگر جداگانه تنظیم شده باشد) */
  monthlyTarget: number | null;
  monthlyDone: number;
  /** سنجش هر ماه شمسی سال جاری — تا ماه جاری */
  months: DashboardScreeningGoalMonth[];
  /** — همهٔ هدف‌های تعریف‌شده (سال/ماه/سفارشی) با پیشرفت مستقل هرکدام — مرتب: فعال ← آینده ← گذشته */
  goals: DashboardScreeningGoalItem[];
}

// ───────────── API Keys ─────────────

/** رکورد امن کلید — هرگز شامل hash یا token نیست */
export interface ApiKeyRecord {
  id: string;
  name: string;
  /** پیشوند نمایشی مثل ck_a1b2c3d4 — بدون بخش محرمانه */
  prefix: string;
  role: StaffRole;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/** پاسخ ساخت کلید — token فقط همین یک‌بار برگردانده می‌شود */
export interface ApiKeyCreated {
  record: ApiKeyRecord;
  /** کلید کامل — نمایش یک‌بارمصرف */
  token: string;
}

// ───────────── Reports ─────────────

export interface ReportDayPoint {
  date: string; // YYYY-MM-DD Tehran
  total: number;
  cancelled: number;
}

export interface ReportStaffRow {
  staffId: string;
  staffName: string;
  role: StaffRole;
  sessions: number;
  hours: number;       // ساعت اعشاری
  cancelled: number;
}

export interface ReportStudentRow {
  studentId: string;
  studentName: string;
  sessions: number;
  absents: number;
}

export interface ReportTagRow {
  tagId: string;
  name: string;
  category: TagCategory;
  count: number;
}

/** — گزارش مدارس ساده‌شده: فقط مدارسی که دانش‌آموز فعال دارند + تعداد */
export interface ReportSchoolRow {
  schoolId: string;
  name: string;
  students: number;
}

/** گزارش چاپی دوره — */
export interface PeriodReport {
  from: string;
  to: string;
  generatedAt: string;
  appointments: {
    total: number;
    scheduled: number;
    cancelled: number;
    cancellationRate: number; // 0..1
    hours: number;            // مجموع ساعت جلسات برنامه‌ریزی‌شده
    avgPerDay: number;
  };
  attendance: {
    present: number;
    absent: number;
    /** — حاضر با تأخیر */
    late: number;
    pending: number;
    cancelled: number;
    absenceRate: number;
  };
  staffAttendance: {
    present: number;
    absent: number;
    /** — تأخیر در حضور */
    late: number;
    leave: number;
    sick: number;
    unmarked: number;
    attendanceRate: number; // (present + late) / کل ثبت‌شده‌ها
  };
  newStudents: number;
  byDay: ReportDayPoint[];
  perStaff: ReportStaffRow[];
  /** — میانگین زمان انتظار تا نوبت‌دهی (از ثبت در لیست انتظار تا ثبت نوبت) */
  waitSchedule: {
    /** میانگین روز تا نوبت‌دهی برای نوبت‌دهی‌های درون بازه — بدون داده → null */
    avgDays: number | null;
    /** شمار نوبت‌دهی‌های درون بازه (پایهٔ میانگین) */
    scheduled: number;
  };
  /** — میانگین جلسات مداخله به ازای هر دانش‌آموزِ تحت خدمت در بازه */
  perStudent: {
    avgSessions: number | null;
    students: number;
    sessions: number;
  };
  /** — نمرهٔ مشارکت عملی تیم: تولید تمرین/بسته/قالب/فرم در بازه (وزن‌ها فقط سرور — scoring.js) */
  practical: {
    exercises: number;
    packages: number;
    templates: number;
    forms: number;
    score: number;
  };
  topStudents: ReportStudentRow[];
  topTags: ReportTagRow[];
  /** — مدارس مبدأ دانش‌آموزان فعال (فقط مدارس دارای دانش‌آموز، نزولی بر تعداد) */
  schools: ReportSchoolRow[];
}

// ───────────── Advanced Report ─────────────

/** نقطهٔ روند هفتگی — هفتهٔ شنبه‌محور */
export interface AdvancedWeekPoint {
  /** YYYY-MM-DD شنبهٔ شروع هفته (تهران) */
  weekStart: string;
  /** جلسات غیرلغوشده */
  sessions: number;
  /** جلسات برگزارشده (ops_status = completed) */
  completed: number;
  /** لغوشده */
  cancelled: number;
  /** نرخ حضور جلسات هفته — present/(present+absent)؛ بدون داده → null */
  attendanceRate: number | null;
}

/** قیف لیست انتظار — توزیع وضعیت + تبدیل */
export interface WaitlistFunnel {
  total: number;
  open: number;
  scheduled: number;
  admitted: number;
  rejected: number;
  noShow: number;
  cancelled: number;
  /** میانگین روز تا پذیرش (created_at → اولین audit admitted) — بدون داده → null */
  avgWaitDays: number | null;
  /** admitted/(admitted+rejected+noShow+cancelled) — بدون داده → null */
  conversionRate: number | null;
}

/** خروجی تحلیل پیشرفته — همهٔ بخش‌ها Projection فقط-خواندنی */
export interface AdvancedReport {
  from: string;
  to: string;
  generatedAt: string;
  weeks: AdvancedWeekPoint[];
  waitlist: WaitlistFunnel;
  assessments: {
    activeStudents: number;
    withFinal: number;
    withAny: number;
    without: number;
    /** withAny/activeStudents — بدون دانش‌آموز فعال → null */
    coverageRate: number | null;
  };
  sessionNotes: {
    /** جلسات (نوبت×دانش‌آموز) غیرلغوشدهٔ بازه */
    sessions: number;
    withNote: number;
    /** با/کل — بدون داده → null */
    coverageRate: number | null;
  };
  followups: {
    open: number;
    overdue: number;
    doneInPeriod: number;
    cancelledInPeriod: number;
    /** doneInPeriod/(doneInPeriod+open) — مخرج صفر → null */
    completionRate: number | null;
  };
  committee: {
    /** جلسات برگزارشده با تاریخ در بازه */
    heldMeetings: number;
    itemsTotal: number;
    itemsDecided: number;
    approved: number;
    /** approved/itemsTotal — بدون مصوبه → null */
    approvalRate: number | null;
  };
}

// ───────────── Announcements ─────────────

/** رکورد کامل اعلان — فقط مدیر می‌بیند */
export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  showLogin: boolean;
  showPanel: boolean;
  botSentStaff: boolean;
  botSentFamilies: boolean;
  active: boolean;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** نسخه عمومی برای بنر صفحه ورود — حداقل فیلدها */
export interface AnnouncementPublic {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

/** خروجی ارسال با بات */
export interface AnnouncementSendSummary {
  target: 'staff' | 'families';
  recipients: number;
  dispatch: DispatchSummary;
}

// ───────────── Knowledge ─────────────

/** مقالهٔ دانش‌افزایی — خواندن همهٔ همکاران؛ مدیریت دفتر */
export interface KnowledgeRecord {
  id: string;
  title: string;
  body: string;
  category: KnowledgeCategory;
  pinned: boolean;
  published: boolean;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** امتیاز یک درمانگر در تابلوی رقابتی — */
export interface TherapistScoreEntry {
  staffId: string;
  staffName: string;
  /** جلسات برگزارشده (حداقل یک «حاضر») در بازه */
  sessions: number;
  /** تمرین افزوده به بانک تمرین در بازه */
  exercises: number;
  /** رویداد پروندهٔ ثبت‌شده در بازه */
  events: number;
  /** پیگیری ثبت‌شده در بازه */
  followups: number;
  /** امتیاز ترکیبی — فرمول شفاف: sessions×2 + exercises×3 + events×1 + followups×1 */
  score: number;
  /** رتبهٔ ۱ مبنا — هم‌امتیازها رتبهٔ یکسان می‌گیرند */
  rank: number;
}

/** تابلوی رقابتی درمانگران — ماه جلالی جاری */
export interface TherapistScoreboard {
  from: string;
  to: string;
  jalaliLabel: string;
  entries: TherapistScoreEntry[];
  /** نقطهٔ بازیگر جاری — درمانگر نبودن null */
  me: { staffId: string; rank: number; of: number; score: number } | null;
}

/** آمار شخصی درمانگر برای «کارنامهٔ من» — */
export interface MyPerformanceStats {
  staffId: string;
  from: string;
  to: string;
  jalaliLabel: string;
  sessions: number;
  sessionsPrev: number;
  exercises: number;
  exercisesPrev: number;
  events: number;
  eventsPrev: number;
  followups: number;
  followupsPrev: number;
  score: number;
  scorePrev: number;
  /** جلسات «حاضر» بدون یادداشت جلسه — نردبان گزارش‌نویسی */
  missingNotes: number;
  rank: { position: number; of: number } | null;
  nextAppointment: { id: string; startAt: string; endAt: string; studentNames: string[] } | null;
  /**
   * — تاریخچهٔ امتیاز ۶ ماه اخیر (۵ ماه کامل قبل + ماه جاری تا امروز؛ قدیم→جدید)
   * برای رینگ «بهترین ماهِ من» و اعداد مقایسه‌ای داشبورد — بدون فیلد اضافه‌ای در DB.
   */
  history?: { label: string; score: number }[];
}

// ───────────── Staff attendance ─────────────

export interface StaffAttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  role: StaffRole;
  date: string; // YYYY-MM-DD به وقت تهران (میلادی؛ نمایش جلالی در UI)
  status: StaffAttendanceStatus;
  note: string | null;
  updatedAt: string;
}

/** خلاصه یک روز برای همه کارکنان فعال */
export interface StaffAttendanceDaySummary {
  date: string;
  present: number;
  absent: number;
  /** — تأخیر در حضور */
  late: number;
  leave: number;
  sick: number;
  unmarked: number;
  totalActiveStaff: number;
}

/** خلاصه تجمعی یک همکار در یک بازه */
export interface StaffAttendancePersonSummary {
  staffId: string;
  staffName: string;
  role: StaffRole;
  present: number;
  absent: number;
  /** — تأخیر در حضور */
  late: number;
  leave: number;
  sick: number;
  unmarked: number;
}

// ───────────── Working Day ─────────────

/** توضیحات (لاگ) روز کاری — هر ثبت با نویسنده و زمان */
export interface DayNote {
  id: string;
  date: string; // YYYY-MM-DD به وقت تهران
  body: string;
  createdBy: string;
  creatorName: string;
  createdAt: string;
  /** فاز ۱ (تصمیم D2) — human (پیش‌فرض) یا system (Projectionهای آینده) */
  kind?: DayNoteKind;
}

/** دانش‌آموز روی کارت نوبتِ بورد روز کاری */
export interface WorkingDayAppointmentStudent {
  studentId: string;
  name: string;
  attendance: AttendanceStatus;
  /** — موبایل ولیّ برای تماس سریع از روی بورد (null = ثبت‌نشده) */
  phone: string | null;
}

/** نوبت روی بورد روز کاری — با version برای ویرایش توضیحات */
export interface WorkingDayAppointment {
  id: string;
  staffId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  /** فاز ۱ (تصمیم D1) — غایب/null = برنامه‌ریزی‌شدهٔ عادی */
  opsStatus?: AppointmentOpsStatus | null;
  note: string | null;
  version: number;
  students: WorkingDayAppointmentStudent[];
}

/** ستون یک همکار روی بورد روز کاری */
export interface WorkingDayStaffColumn {
  staffId: string;
  fullName: string;
  role: StaffRole;
  /** وضعیت حضور همان روز — بدون ثبت = null */
  attendance: { status: StaffAttendanceStatus; note: string | null; updatedAt: string } | null;
  /** بازه‌های کاری آن روز هفته از برنامه هفتگی همکار */
  dayHours: { startMinute: number; endMinute: number }[];
  appointments: WorkingDayAppointment[];
}

/** آمار حضور جلسات (دانش‌آموزان) همان روز */
export interface WorkingDaySessionStats {
  total: number;
  present: number;
  absent: number;
  pending: number;
  cancelledAppointments: number;
}

/**
 * فاز ۱ — شمارش وضعیت عملیاتی نوبت‌های همان روز (نوار وضعیت بالای بورد §7.1).
 * planned = نوبت‌های scheduled بدون ops_status؛ cancelled از status می‌آید.
 */
export interface WorkingDayOpsStats {
  planned: number;
  checkedIn: number;
  delayed: number;
  inSession: number;
  completed: number;
  noShow: number;
  cancelled: number;
  /** همهٔ نوبت‌های روز (شامل لغوشده) */
  total: number;
}

/** فاز ۱ — یک ردیف صف ۶۰ دقیقهٔ آینده بورد منشی (§7.2) */
export interface WorkingDayQueueItem {
  appointmentId: string;
  staffId: string;
  /** نام همکار — برای نوبت بی‌صاحب «—» */
  staffName: string;
  startAt: string;
  endAt: string;
  opsStatus: AppointmentOpsStatus | null;
  /** نام دانش‌آموزان نوبت به ترتیب ثبت */
  studentNames: string[];
}

/** بورد کامل «مدیریت روز کاری در یک نگاه» */
export interface WorkingDayBoard {
  date: string;
  /** ۰=شنبه … ۶=جمعه (هفته ایرانی) */
  weekday: number;
  isToday: boolean;
  summary: StaffAttendanceDaySummary;
  sessionStats: WorkingDaySessionStats;
  /** فاز ۱ — شمارش وضعیت عملیاتی نوبت‌های همان روز (نوار وضعیت بالای بورد) */
  opsStats: WorkingDayOpsStats;
  /** فاز ۱ — صف ۶۰ دقیقهٔ آینده؛ فقط برای امروز پر می‌شود (روزهای دیگر خالی) */
  queue: WorkingDayQueueItem[];
  /** فاز ۱ — تعداد ارزیابی‌های فعال با performed_at همان روز */
  assessmentsToday: number;
  staff: WorkingDayStaffColumn[];
  /** نوبت‌های بی‌صاحب (staff_id خالی یا همکار غیرفعال/حذف‌شده) */
  unassigned: WorkingDayAppointment[];
  notes: DayNote[];
}

// ───────────── Waitlist (فاز W — لیست انتظار) ─────────────

export type WaitlistSource = 'self' | 'school' | 'teacher' | 'doctor' | 'other';
export type WaitlistPriority = 'normal' | 'urgent';
export type WaitlistStatus =
  | 'waiting'
  | 'called'
  | 'scheduled'
  | 'admitted'
  | 'rejected'
  | 'no_show'
  | 'cancelled';

/** یک ورودی لیست انتظار — متقاضی پیش از پذیرش */
export interface WaitlistEntry {
  id: string;
  firstName: string;
  lastName: string;
  /** موبایل ولیّ نرمال‌شده 09xxxxxxxxx */
  phone: string;
  nationalId: string | null;
  birthDate: string | null;
  schoolId: string | null;
  classId: string | null;
  /** نام مدرسه/کلاس — از join (فقط نمایش) */
  schoolName: string | null;
  className: string | null;
  source: WaitlistSource;
  serviceType: string | null;
  note: string | null;
  priority: WaitlistPriority;
  status: WaitlistStatus;
  manualOrder: number | null;
  callCount: number;
  lastCallAt: string | null;
  scheduledAppointmentId: string | null;
  admittedStudentId: string | null;
  /** — پروندهٔ متصل (تیک «منتظر دریافت خدمت»)؛ نام/تلفن نمایشی از خود پرونده می‌آید */
  studentId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** شمارنده‌های منو/بورد */
export interface WaitlistBadge {
  /** waiting/called که از آستانهٔ هشدار گذشته‌اند */
  overdue: number;
  /** تعداد waiting با اولویت urgent */
  urgent: number;
  /** کل ورودی‌های باز (waiting + called) */
  waiting: number;
}

// ───────────── Follow-ups (فاز ۳ — بنیاد پیگیری) ─────────────

/** وضعیت پیگیری */
export type FollowUpStatus = (typeof FOLLOWUP_STATUSES)[number];

/** گروه‌بندی «اقدام بعدی» (§13.4) — overdue computed است، نه ستون */
export type FollowUpGroup = 'overdue' | 'today' | 'week' | 'future' | 'open';

/** رکورد پیگیری — شکل پاسخ API (نام‌ها از join، فقط نمایش) */
export interface FollowUp {
  id: string;
  /** appointment | student | waitlist |... (enum توسعه‌پذیر در constants — D7) */
  entityType: string;
  entityId: string;
  /** پروندهٔ متصل — اختیاری */
  studentId: string | null;
  /** نام دانش‌آموز از join (فقط نمایش) */
  studentName: string | null;
  title: string;
  assigneeId: string;
  /** نام مسئول از join (فقط نمایش) */
  assigneeName: string | null;
  createdBy: string;
  createdByName: string | null;
  /** ISO UTC نرمال‌شده؛ NULL = بدون مهلت */
  dueAt: string | null;
  status: FollowUpStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ───────────── Todos (فاز ۴ — هماهنگی داخلی منشی↔مدیر) ─────────────

/** وضعیت کار داخلی */
export type TodoStatus = (typeof TODO_STATUSES)[number];

/** اولویت کار داخلی */
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

/** صندوق فهرست — inbox = روی میز من (assignee) · outbox = واگذارشدهٔ من (assigner) */
export type TodoBox = (typeof TODO_BOXES)[number];

/** — یک مورد چک‌لیست کار */
export interface TodoChecklistItem {
  text: string;
  done: boolean;
}

/** رکورد کار داخلی — شکل پاسخ API (نام‌ها از join، فقط نمایش) */
export interface Todo {
  id: string;
  title: string;
  note: string | null;
  /** — چک‌لیست کار؛ null = بدون چک‌لیست (ترتیب موارد حفظ می‌شود) */
  checklist: TodoChecklistItem[] | null;
  assignerId: string;
  /** نام ثبت‌کننده از join (فقط نمایش) */
  assignerName: string | null;
  assigneeId: string;
  /** نام مسئول انجام از join (فقط نمایش) */
  assigneeName: string | null;
  /** ISO UTC نرمال‌شده؛ NULL = بدون مهلت */
  dueAt: string | null;
  priority: TodoPriority;
  status: TodoStatus;
  completedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * شمارش‌های badge صندوق inbox — overdue و attention هر دو computed هستند
 * (ستون denormalized نداریم). attention = شمار یکتای باز∧(فوری∨عقب‌افتاده)
 * و همان عددی است که badge قرمز منو نشان می‌دهد.
 */
export interface TodoBadge {
  urgent: number;
  overdue: number;
  attention: number;
}
