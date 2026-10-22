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

export type { ScreeningTargetConfig };

export type StaffRole = (typeof STAFF_ROLES)[number];
export type StaffAttendanceStatus = (typeof STAFF_ATTENDANCE_STATUSES)[number];
export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[keyof typeof APPOINTMENT_STATUS];
export type AppointmentOpsStatus = (typeof APPOINTMENT_OPS_STATUSES)[number];
export type DayNoteKind = (typeof DAY_NOTE_KINDS)[number];
export type NextAction = (typeof NEXT_ACTION_VALUES)[number];
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];
export type SchoolKind = (typeof SCHOOL_KINDS)[number];
export type StudentGrade = (typeof STUDENT_GRADES)[number];

export interface AuthContext {
  staffId: string;
  email: string;
  role: StaffRole;
  displayName: string;
}

export interface ConflictWarning {
  type: 'overlap';
  appointmentId: string;
  staffId: string;
  existingStartAt: string;
  existingEndAt: string;
  proposedStartAt: string;
  proposedEndAt: string;
}

export interface AppointmentStudent {
  studentId: string;
  facetId: string | null;
  attendance: AttendanceStatus;
  note: string | null;
  sessionNote?: string | null;
  nextAction?: NextAction | null;
}

export interface Appointment {
  id: string;
  staffId: string;
  startAt: string; // ISO UTC
  endAt: string;   // ISO UTC
  status: AppointmentStatus;
  opsStatus?: AppointmentOpsStatus | null;
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
  note?: string | null;
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
  late: number;
  pending: number;
  cancelled: number;
  absenceRate: number; // 0..1
}

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

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
export type NotificationTemplateId = (typeof NOTIFICATION_TEMPLATES)[number];

export interface TemplateVars {
  studentName?: string;
  staffName?: string;
  dateYmd?: string;   // YYYY-MM-DD تهران
  timeLabel?: string; // HH:MM تهران
  clinicName?: string;
  code?: string;      // کد اتصال بات
  chatId?: string;
  extra?: string;
  oldDateYmd?: string;    // زمان قبلی برای «تغییر نوبت»
  oldTimeLabel?: string;
  studentsLine?: string;  // فهرست نام دانش‌آموزان نوبت (برای پیام کارمند)
  announcementTitle?: string; // عنوان اعلان مدیر
  className?: string;     // نام کلاس مدرسه
  teacherName?: string;   // نام معلم مدرسه
  name?: string;          // نام کارمند/شخص متصل‌شده
  roleLine?: string;      // خط سمت («سمت: همکار (متخصص)»)
  studentNames?: string;  // فهرست نام دانش‌آموزان پیام لغو بات
  taskTitle?: string;     // عنوان کار داخلی واگذارشده
  exerciseTitle?: string; // عنوان تمرین
  dueYmd?: string;        // تاریخ بازسنجی (YYYY-MM-DD)
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
  senderName?: string;    // نام فرستندهٔ پیام خانواده (bot_family_message)
  formTitle?: string;     // عنوان چک‌لیست/فرم (bot_checklist_assigned / bot_checklist_result)
  score?: string;         // امتیاز فارسی (bot_checklist_result)
  band?: string | null;   // باند تحلیل چک‌لیست (bot_checklist_result)
  feedback?: string;      // بازخورد تصحیح تکلیف (homework_graded)
}

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
  sendAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPrefs {
  studentId: string;
  channel: NotificationChannel;
  chatId: string | null;
  remindersEnabled: boolean;
  reminderHoursBefore: number;
  updatedAt: string;
}

export interface BotLinkRecord {
  id: string;
  code: string;
  studentId: string;
  chatId: string | null;
  status: 'pending' | 'linked';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deepLink?: string | null;
}

export interface StaffBotLinkRecord {
  id: string;
  code: string;
  staffId: string;
  chatId: string | null;
  status: 'pending' | 'linked';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deepLink?: string | null;
}

export interface ClassBotLinkRecord {
  id: string;
  code: string;
  classId: string;
  chatId: string | null;
  status: 'pending' | 'linked' | 'revoked';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  className?: string | null;
  schoolName?: string | null;
  deepLink?: string | null;
}

export type ChatOwner =
  | { kind: 'student'; studentId: string }
  | { kind: 'staff'; staffId: string }
  | { kind: 'class'; classId: string };

export interface CenterHourRange {
  weekday: number;      // 0 = شنبه … 6 = جمعه
  startMinute: number;  // دقیقه از نیمه‌شب تهران
  endMinute: number;
}

export interface ScoringWeights {
  exercises: number;
  packages: number;
  templates: number;
  forms: number;
  exerciseUses: number;
  templateUses: number;
  formFills: number;
  exerciseRefs: number;
  templateRefs: number;
  formRefs: number;
  baseAction: number;
  adminCap: number;
}

export interface ScoringConfig {
  epochYmd: string;
  epochUtc: string;
  weights: ScoringWeights;
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
  notifyDigest: boolean;
  notifyWaitlist: boolean;
  screeningTargets: ScreeningTargetConfig[];
  clinicPhone: string;
  notifyBatchHour: number;
  botUsername: string;
  meta: {
    baleConfigured: boolean;
    webhookEnabled: boolean;
  };
}

export type TagCategory = (typeof TAG_CATEGORIES)[number];

export interface TagRecord {
  id: string;
  name: string;
  category: TagCategory;
  color: string | null;
  active: boolean;
  usageCount?: number;
}

export interface TagRef {
  id: string;
  name: string;
  category: TagCategory;
  color: string | null;
}

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

export interface DispatchResult {
  id: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface DispatchSummary {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

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

export interface AppBindings {
  DB: D1Database;
  ENV: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  AUTH_SECRET?: string;
}

export interface AppVariables {
  authContext: AuthContext;
  logger: Logger;
}

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

export interface DashboardScreeningGoalMonth {
  month: number;
  label: string;
  done: number;
}

export interface DashboardScreeningGoalItem {
  key: string;
  mode: 'year' | 'month' | 'custom';
  title: string | null;
  periodLabel: string;
  fromYmd: string;
  toYmd: string;
  target: number;
  done: number;
  percent: number;
  remaining: number;
  status: 'active' | 'upcoming' | 'past';
}

export interface DashboardScreeningGoal {
  todayYmd: string; // YYYY-MM-DD Tehran
  jalaliYear: number;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  yearDone: number;
  yearNormal: number;
  yearReferrals: number;
  referralRate: number | null;
  target: number | null;
  targetPercent: number | null;
  targetRemaining: number | null;
  monthlyTarget: number | null;
  monthlyDone: number;
  months: DashboardScreeningGoalMonth[];
  goals: DashboardScreeningGoalItem[];
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  role: StaffRole;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface ApiKeyCreated {
  record: ApiKeyRecord;
  token: string;
}

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

export interface ReportSchoolRow {
  schoolId: string;
  name: string;
  students: number;
}

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
    late: number;
    pending: number;
    cancelled: number;
    absenceRate: number;
  };
  staffAttendance: {
    present: number;
    absent: number;
    late: number;
    leave: number;
    sick: number;
    unmarked: number;
    attendanceRate: number; // (present + late) / کل ثبت‌شده‌ها
  };
  newStudents: number;
  byDay: ReportDayPoint[];
  perStaff: ReportStaffRow[];
  waitSchedule: {
    avgDays: number | null;
    scheduled: number;
  };
  perStudent: {
    avgSessions: number | null;
    students: number;
    sessions: number;
  };
  practical: {
    exercises: number;
    packages: number;
    templates: number;
    forms: number;
    score: number;
  };
  topStudents: ReportStudentRow[];
  topTags: ReportTagRow[];
  schools: ReportSchoolRow[];
}

export interface AdvancedWeekPoint {
  weekStart: string;
  sessions: number;
  completed: number;
  cancelled: number;
  attendanceRate: number | null;
}

export interface WaitlistFunnel {
  total: number;
  open: number;
  scheduled: number;
  admitted: number;
  rejected: number;
  noShow: number;
  cancelled: number;
  avgWaitDays: number | null;
  conversionRate: number | null;
}

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
    coverageRate: number | null;
  };
  sessionNotes: {
    sessions: number;
    withNote: number;
    coverageRate: number | null;
  };
  followups: {
    open: number;
    overdue: number;
    doneInPeriod: number;
    cancelledInPeriod: number;
    completionRate: number | null;
  };
  committee: {
    heldMeetings: number;
    itemsTotal: number;
    itemsDecided: number;
    approved: number;
    approvalRate: number | null;
  };
}

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

export interface AnnouncementPublic {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface AnnouncementSendSummary {
  target: 'staff' | 'families';
  recipients: number;
  dispatch: DispatchSummary;
}

export interface KnowledgeFileMeta {
  id: string;
  filename: string;
  mime: string;
  size: number;
}

export interface KnowledgeRecord {
  id: string;
  title: string;
  body: string;
  category: KnowledgeCategory;
  pinned: boolean;
  published: boolean;
  attachments: KnowledgeFileMeta[];
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TherapistScoreEntry {
  staffId: string;
  staffName: string;
  sessions: number;
  exercises: number;
  events: number;
  followups: number;
  score: number;
  rank: number;
}

export interface TherapistScoreboard {
  from: string;
  to: string;
  jalaliLabel: string;
  entries: TherapistScoreEntry[];
  me: { staffId: string; rank: number; of: number; score: number } | null;
}

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
  missingNotes: number;
  rank: { position: number; of: number } | null;
  nextAppointment: { id: string; startAt: string; endAt: string; studentNames: string[] } | null;
  history?: { label: string; score: number }[];
}

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

export interface StaffAttendanceDaySummary {
  date: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  sick: number;
  unmarked: number;
  totalActiveStaff: number;
}

export interface StaffAttendancePersonSummary {
  staffId: string;
  staffName: string;
  role: StaffRole;
  present: number;
  absent: number;
  late: number;
  leave: number;
  sick: number;
  unmarked: number;
}

export interface DayNote {
  id: string;
  date: string; // YYYY-MM-DD به وقت تهران
  body: string;
  createdBy: string;
  creatorName: string;
  createdAt: string;
  kind?: DayNoteKind;
}

export interface WorkingDayAppointmentStudent {
  studentId: string;
  name: string;
  attendance: AttendanceStatus;
  phone: string | null;
}

export interface WorkingDayAppointment {
  id: string;
  staffId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  opsStatus?: AppointmentOpsStatus | null;
  note: string | null;
  version: number;
  students: WorkingDayAppointmentStudent[];
}

export interface WorkingDayStaffColumn {
  staffId: string;
  fullName: string;
  role: StaffRole;
  attendance: { status: StaffAttendanceStatus; note: string | null; updatedAt: string } | null;
  dayHours: { startMinute: number; endMinute: number }[];
  appointments: WorkingDayAppointment[];
}

export interface WorkingDaySessionStats {
  total: number;
  present: number;
  absent: number;
  pending: number;
  cancelledAppointments: number;
}

export interface WorkingDayOpsStats {
  planned: number;
  checkedIn: number;
  delayed: number;
  inSession: number;
  completed: number;
  noShow: number;
  cancelled: number;
  total: number;
}

export interface WorkingDayQueueItem {
  appointmentId: string;
  staffId: string;
  staffName: string;
  startAt: string;
  endAt: string;
  opsStatus: AppointmentOpsStatus | null;
  studentNames: string[];
}

export interface WorkingDayBoard {
  date: string;
  weekday: number;
  isToday: boolean;
  summary: StaffAttendanceDaySummary;
  sessionStats: WorkingDaySessionStats;
  opsStats: WorkingDayOpsStats;
  queue: WorkingDayQueueItem[];
  assessmentsToday: number;
  staff: WorkingDayStaffColumn[];
  unassigned: WorkingDayAppointment[];
  notes: DayNote[];
}

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

export interface WaitlistEntry {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  nationalId: string | null;
  birthDate: string | null;
  schoolId: string | null;
  classId: string | null;
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
  studentId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WaitlistBadge {
  overdue: number;
  urgent: number;
  waiting: number;
}

export type FollowUpStatus = (typeof FOLLOWUP_STATUSES)[number];

export type FollowUpGroup = 'overdue' | 'today' | 'week' | 'future' | 'open';

export interface FollowUp {
  id: string;
  entityType: string;
  entityId: string;
  studentId: string | null;
  studentName: string | null;
  title: string;
  assigneeId: string;
  assigneeName: string | null;
  createdBy: string;
  createdByName: string | null;
  dueAt: string | null;
  status: FollowUpStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TodoStatus = (typeof TODO_STATUSES)[number];

export type TodoPriority = (typeof TODO_PRIORITIES)[number];

export type TodoBox = (typeof TODO_BOXES)[number];

export interface TodoChecklistItem {
  text: string;
  done: boolean;
}

export interface Todo {
  id: string;
  title: string;
  note: string | null;
  checklist: TodoChecklistItem[] | null;
  assignerId: string;
  assignerName: string | null;
  assigneeId: string;
  assigneeName: string | null;
  dueAt: string | null;
  priority: TodoPriority;
  status: TodoStatus;
  completedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TodoBadge {
  urgent: number;
  overdue: number;
  attention: number;
}
