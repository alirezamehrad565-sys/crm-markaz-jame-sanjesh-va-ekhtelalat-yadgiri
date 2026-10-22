export const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled',
  CANCELLED: 'cancelled'
} as const;

export const ATTENDANCE_STATUS = {
  PENDING: 'pending',
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  CANCELLED: 'cancelled'
} as const;

export const STAFF_ROLES = ['manager', 'therapist', 'secretary', 'supervisor'] as const;

export const SCHOOL_KINDS = ['school', 'kindergarten'] as const;

export const SLOT_MINUTES = 15;

export const MIN_APPOINTMENT_MINUTES = 15;
export const MAX_APPOINTMENT_MINUTES = 240;

export const SESSION_TYPE_KEYS = ['individual', 'group', 'family_ed', 'teacher_ed', 'mental_ot'] as const;

export type SessionTypeKey = (typeof SESSION_TYPE_KEYS)[number];

export const SESSION_TYPES: readonly { key: SessionTypeKey; label: string; durationMin: number; hint: string }[] = [
  { key: 'individual', label: 'مداخله فردی', durationMin: 45, hint: 'جلسهٔ یک‌به‌یک درمانگر با دانش‌آموز' },
  { key: 'group', label: 'مداخله گروهی', durationMin: 60, hint: 'جلسهٔ گروهی — چند دانش‌آموز با هم' },
  { key: 'family_ed', label: 'آموزش خانواده‌محور', durationMin: 60, hint: 'آموزش و توانمندسازی خانواده' },
  { key: 'teacher_ed', label: 'آموزش آموزگاران', durationMin: 50, hint: 'آموزش و توانمندسازی آموزگاران و کارکنان مدارس' },
  { key: 'mental_ot', label: 'کاردرمانی ذهنی', durationMin: 45, hint: 'توانبخشی شناختی با پروتکل کاردرمانی ذهنی' }
];

export function sessionTypeOf(key: string | null | undefined): { key: SessionTypeKey; label: string; durationMin: number; hint: string } | undefined {
  return SESSION_TYPES.find((t) => t.key === key);
}

export const STUDENT_PATHWAYS = ['learning', 'rehab'] as const;

export type StudentPathway = (typeof STUDENT_PATHWAYS)[number];

export const STUDENT_PATHWAY_LABELS: Record<StudentPathway, string> = {
  learning: 'مسیر اختلال یادگیری',
  rehab: 'مسیر توانبخشی ذهنی-جسمی'
};

export const STUDENT_PROTOCOLS = ['learning', 'slow_learner', 'mental_ot', 'rehab'] as const;

export type StudentProtocol = (typeof STUDENT_PROTOCOLS)[number];

export const STUDENT_PROTOCOL_LABELS: Record<StudentProtocol, string> = {
  learning: 'پروتکل اختلال یادگیری',
  slow_learner: 'پروتکل دیرآموز',
  mental_ot: 'پروتکل کاردرمانی ذهنی',
  rehab: 'پروتکل توانبخشی ذهنی-جسمی'
};

export const PROTOCOL_DEFAULT_SESSION_TYPE: Record<StudentProtocol, SessionTypeKey> = {
  learning: 'individual',
  slow_learner: 'individual',
  mental_ot: 'mental_ot',
  rehab: 'individual'
};

export const PROTOCOL_STEPS: Record<StudentProtocol, { key: string; title: string; hint: string }[]> = {
  learning: [
    { key: 'observe', title: 'مشاهده و ثبت', hint: 'شرح‌حال، چک‌لیست‌های رفتاری و مشاهدهٔ کلاس' },
    { key: 'assess', title: 'ارزیابی تخصصی', hint: 'پروب‌های خواندن/نوشتن/حساب + وکسلر + ملاک‌های DSM' },
    { key: 'intervene', title: 'مداخله و جلسات', hint: 'مسیر هدف با تمرین‌های بانک + جلسات فردی/گروهی' },
    { key: 'monitor', title: 'پایش و گزارش', hint: 'پروب دوره‌ای، بازسنجی ۴–۶ هفته و گزارش خانواده' }
  ],
  slow_learner: [
    { key: 'baseline', title: 'ارزیابی پایه', hint: 'وکسلر + ارزیابی مهارتی ۷ حیطه‌ای — نقطهٔ شروع واقعی' },
    { key: 'goals', title: 'اهداف کوچک و واقع‌بینانه', hint: 'هدف‌های قابل دستیابی دوره‌ای، نه مقایسه با هم‌سال' },
    { key: 'repeat', title: 'تکرار ساخت‌یافته و چندحسی', hint: 'تمرین‌های کوتاه با تکرار بیشتر و ورودی چندحسی' },
    { key: 'home', title: 'تمرین روزانهٔ خانگی', hint: 'تکلیف کوتاه روزانه از بانک تمرین + گزارش خانواده' },
    { key: 'review', title: 'بازبینی دوره‌ای و جلسهٔ مشترک', hint: 'جلسهٔ خانواده‌محور + آموزش آموزگاران' }
  ],
  mental_ot: [
    { key: 'profile', title: 'پروفایل مهارتی', hint: 'ارزیابی مهارتی ۷ حیطه‌ای — حین ارزیابی، مداخله هم انجام می‌شود' },
    { key: 'resume', title: 'پیشروی مهارت‌به‌مهارت', hint: 'از نقطهٔ فعلی هر حیطه ادامه — جلسهٔ بعد از همان‌جا' },
    { key: 'family', title: 'خانواده و آموزگاران', hint: 'جلسهٔ خانواده‌محور + آموزش آموزگاران با گزارش پیشرفت حیطه‌ای' },
    { key: 'reassess', title: 'بازسنجی حیطه‌ای', hint: 'مقایسهٔ پروفایل با جلسهٔ اول — ۸ تا ۱۲ جلسه' }
  ],
  rehab: [
    { key: 'baseline', title: 'ارزیابی پایه', hint: 'ارزیابی شناختی/حرکتی/خودیاری + وکسلر ۴' },
    { key: 'goals', title: 'هدف توانبخشی', hint: 'هدف شناختی/حرکتی/خودیاری/خانواده‌محور از دانش‌نامه' },
    { key: 'intervene', title: 'جلسات و مداخله', hint: 'جلسات با نوع نوبت مناسب + تمرین خانگی' },
    { key: 'monitor', title: 'پایش و بازسنجی', hint: 'بازسنجی ۴–۶ هفته و گزارش دوره‌ای' }
  ]
};

export const NEED_PROTOCOL_SUGGESTIONS: Record<string, { protocol: StudentProtocol; secondary: StudentProtocol | null } | null> = {
  dyslexia: { protocol: 'learning', secondary: null },
  dysgraphia: { protocol: 'learning', secondary: null },
  dyscalculia: { protocol: 'learning', secondary: null },
  adhd: { protocol: 'mental_ot', secondary: 'learning' },
  autism: { protocol: 'mental_ot', secondary: 'rehab' },
  speech_language: { protocol: 'mental_ot', secondary: null },
  anxiety: { protocol: 'mental_ot', secondary: null },
  motor_coordination: { protocol: 'mental_ot', secondary: 'rehab' },
  slow_learner: { protocol: 'slow_learner', secondary: 'mental_ot' },
  intellectual_disability: { protocol: 'slow_learner', secondary: 'rehab' },
  global_developmental_delay: { protocol: 'rehab', secondary: 'mental_ot' },
  social_communication: { protocol: 'mental_ot', secondary: null },
  tic: { protocol: 'mental_ot', secondary: null },
  other: null
};

export const DISPLAY_TIMEZONE = 'Asia/Tehran';

export const TEHRAN_OFFSET_MINUTES = 210;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const NOTIFICATION_CHANNELS = ['bale', 'internal'] as const;

export const NOTIFICATION_STATUSES = ['pending', 'sent', 'failed', 'skipped'] as const;

export const NOTIFICATION_TEMPLATES = [
  'appointment_reminder',
  'appointment_created',
  'appointment_changed',
  'appointment_cancelled',
  'staff_appointment_created',
  'staff_appointment_changed',
  'staff_appointment_cancelled',
  'bot_welcome',
  'bot_help',
  'bot_link_success',
  'bot_link_invalid',
  'bot_link_already',
  'bot_myid',
  'generic',
  'announcement',
  'attendance_absent',
  'staff_attendance_nudge',
  'teacher_appointment_created',
  'teacher_appointment_changed',
  'teacher_appointment_cancelled',
  'teacher_report',
  'bot_identify_staff',
  'bot_identify_students',
  'bot_identify_notfound',
  'bot_identify_invalid',
  'bot_identify_ambiguous',
  'bot_cancel_ask',
  'bot_cancel_success',
  'bot_cancel_conflict',
  'bot_cancel_rejected',

  'todo_assigned',

  'digest_staff',
  'digest_family',
  'digest_class',
  'followup_nudge',
  'reassessment_due',
  'bot_followup_done',
  'bot_followup_rejected',
  'bot_followups_denied',
  'bot_attendance_denied',
  'bot_status_denied',

  'bot_help_guest',
  'bot_help_office',
  'bot_help_therapist',
  'bot_help_class',
  'bot_help_parent',
  'bot_search_denied',
  'bot_center_denied',

  'waitlist_slot_freed',
  'bot_waitlist_denied',

  'homework_assigned',
  'bot_exercise_denied',
  'bot_exercise_disabled',
  'bot_exercise_empty',
  'bot_exercise_sent',

  'homework_returned',
  'bot_submission_received',
  'bot_submission_no_pending',
  'bot_submission_unavailable',
  'bot_submission_failed',
  'bot_submission_too_large',
  'bot_submission_bad_type',
  'bot_submission_denied',

  'bot_about',

  'bot_wl_denied_staff',
  'bot_wl_family_call',
  'bot_wl_guest_link',
  'bot_wl_cancelled',
  'bot_wl_done',
  'bot_wl_link_lost',

  'bot_contact',
  'bot_public_files',
  'bot_my_students',
  'bot_my_students_denied',
  'bot_outbox',
  'bot_outbox_denied',
  'bot_outbox_flushed',
  'bot_family_link_denied',
  'bot_kpi',
  'bot_kpi_denied',
  'bot_help_supervisor',

  'bot_services',
  'bot_auth_guide',
  'bot_pending_homework',
  'bot_family_message',
  'bot_class_activity',

  'bot_checklist_assigned',
  'bot_checklist_result',
  'homework_graded',
  'bot_case_event_denied',
  'bot_family_message_sent',
  'bot_case_events_disabled',

  'bot_checklist_link',

  'bot_teacher_package_link',

  'doc_request_sent',
  'bot_doc_received',
  'bot_doc_bad_type',
  'bot_doc_too_large',
  'bot_doc_failed',

  'bot_goal_denied'
] as const;

export const MAX_DISPATCH_ATTEMPTS = 5;

export const REMINDER_HORIZON_HOURS = 24;

export const DEFAULT_REMINDER_HOURS_BEFORE = 2;

export const REMINDER_CRONS = ['0 17 * * *', '30 6 * * *'] as const;

export const BATCH_CRON = '30 14 * * *' as const;

export const BATCH_MIN_LEAD_HOURS = 12;

export const DIGEST_CRON = '0 4 * * *' as const;

export const LINK_CODE_LENGTH = 6;

export const DEFAULT_CLINIC_NAME = 'مرکز جامع';

export const SETTING_KEYS = {
  CENTER_HOURS: 'center_hours',
  CLINIC_NAME: 'clinic_name',
  DEFAULT_REMINDER_HOURS: 'default_reminder_hours',
  NOTIFY_ON_CREATE: 'notify_on_create',
  NOTIFY_ON_MOVE: 'notify_on_move',
  NOTIFY_ON_CANCEL: 'notify_on_cancel',
  NOTIFY_DIGEST: 'notify_digest',
  NOTIFY_WAITLIST: 'notify_waitlist',
  EXERCISE_BANK_ENABLED: 'exercise_bank_enabled',
  SCREENING_TARGETS: 'screening_targets',
  CLINIC_PHONE: 'clinic_phone',
  NOTIFY_BATCH_HOUR: 'notify_batch_hour',
  SCORING_CONFIG: 'scoring_config',
  BOT_USERNAME: 'bot_username'
} as const;

export const DEFAULT_SETTINGS = {
  [SETTING_KEYS.CLINIC_NAME]: DEFAULT_CLINIC_NAME,
  [SETTING_KEYS.DEFAULT_REMINDER_HOURS]: DEFAULT_REMINDER_HOURS_BEFORE,
  [SETTING_KEYS.NOTIFY_ON_CREATE]: true,
  [SETTING_KEYS.NOTIFY_ON_MOVE]: true,
  [SETTING_KEYS.NOTIFY_ON_CANCEL]: true,
  [SETTING_KEYS.NOTIFY_DIGEST]: true,
  [SETTING_KEYS.NOTIFY_WAITLIST]: true,
  [SETTING_KEYS.EXERCISE_BANK_ENABLED]: true,
  [SETTING_KEYS.SCREENING_TARGETS]: [],
  [SETTING_KEYS.CLINIC_PHONE]: '',
  [SETTING_KEYS.NOTIFY_BATCH_HOUR]: 18,
  [SETTING_KEYS.BOT_USERNAME]: ''
} as const;

export interface ScreeningTargetConfig {
  year: number;
  month: number | null;
  target: number;
  title?: string | null;
  from?: string | null;
  to?: string | null;
}

export const SCREENING_TARGETS_MAX = 60;

export const DEFAULT_CENTER_HOURS: { weekday: number; startMinute: number; endMinute: number }[] = [
  { weekday: 0, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 2, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 3, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 4, startMinute: 9 * 60, endMinute: 13 * 60 }
];

export const CALENDAR_DAY_START_MINUTE = 6 * 60;  // 06:00
export const CALENDAR_DAY_END_MINUTE = 22 * 60;   // 22:00

export const ANNOUNCEMENT_TITLE_MAX = 120;

export const ANNOUNCEMENT_BODY_MAX = 2000;

export const KNOWLEDGE_TITLE_MAX = 140;

export const KNOWLEDGE_BODY_MAX = 6000;

export const KNOWLEDGE_CATEGORIES = ['tip', 'protocol', 'article', 'news'] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  tip: 'نکتهٔ آموزشی',
  protocol: 'پروتکل درمانی',
  article: 'مقاله',
  news: 'خبر مرکز'
};

export const STAFF_ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'leave', 'sick'] as const;

export const STAFF_ATTENDANCE_NOTE_MAX = 300;
export const STAFF_ATTENDANCE_TODAY_ONLY = true;

export const STAFF_ATTENDANCE_MAX_RANGE_DAYS = 366;

export const TAG_CATEGORIES = ['disorder', 'grade', 'school_type', 'custom'] as const;

export const MAX_TAGS_PER_STUDENT = 30;

export const MAX_FILE_BYTES = 512 * 1024;

export const ALLOWED_FILE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv'
] as const;

export const EXERCISE_FORMATS = ['worksheet', 'game', 'instruction'] as const;

export const EXERCISE_TITLE_MAX = 150;

export const EXERCISE_DESCRIPTION_MAX = 2000;

export const MAX_EXERCISE_FILE_BYTES = 512 * 1024;

export const MAX_EXERCISE_PANEL_FILE_BYTES = 50 * 1024 * 1024;

export const MAX_EXERCISE_FILES_PER_UPLOAD = 10;

export const MAX_EXERCISE_UPLOAD_CHUNK_BYTES = 1024 * 1024;

export const MAX_EXERCISE_ATTACHMENT_COUNT = 20;

export const EXERCISE_PACKAGE_TITLE_MAX = 150;

export const MAX_EXERCISE_PACKAGE_TAGS = 10;

export const MAX_EXERCISE_PACKAGE_ITEMS = 30;

export const MAX_EXERCISE_BATCH_ITEMS = 20;

export const EXERCISE_BATCH_NOTE_MAX = 500;

export const MAX_EXERCISE_BATCH_LINKS = 10;

export const ALLOWED_EXERCISE_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime', //.mov
  'video/x-m4v', //.
  'video/x-msvideo', //.avi
  'video/avi',
  'video/x-matroska', //.mkv
  'video/3gpp', //.3gp
  'video/x-ms-wmv', //.wmv
  'video/mpeg'
] as const;

export const ALLOWED_EXERCISE_FILE_MIME_TYPES = [
  ...ALLOWED_FILE_MIME_TYPES,
  'text/html',
  ...ALLOWED_EXERCISE_VIDEO_MIME_TYPES
] as const;

export const EXB_PAGE_SIZE = 5;

export const EXB_STUDENTS_PAGE_SIZE = 6;

export const EXB_DOWNLOAD_TTL_SECONDS = 7 * 24 * 60 * 60;

export const SUBMISSION_ATTACH_WINDOW_HOURS = 48;

export const SUBMISSION_NOTE_MAX = 500;

export const CASE_EVENT_FILL_EXPIRY_HOURS = 168;

export const EXERCISE_FEEDBACK_MAX = 1000;
export const EXERCISE_FEEDBACK_MIN = 2;

export const CLASS_NAME_MAX = 120;

export const TEACHER_NAME_MAX = 120;

export const MAX_CLASSES_PER_SCHOOL = 60;

export const SEARCH_QUERY_MIN_LENGTH = 2;

export const SEARCH_QUERY_MAX_LENGTH = 60;

export const DAY_NOTE_BODY_MAX = 2000;

export const APPOINTMENT_OPS_STATUSES = [
  'checked_in',
  'delayed',
  'in_session',
  'completed',
  'no_show'
] as const;

export type AppointmentOpsStatus = (typeof APPOINTMENT_OPS_STATUSES)[number];

export const OPS_TERMINAL_STATUSES = ['completed', 'no_show'] as const;

export const OPS_QUEUE_WINDOW_MINUTES = 60;

export const DAY_NOTE_KINDS = ['human', 'system'] as const;

export const NEXT_ACTION_VALUES = ['none', 'follow_up', 'next_appointment', 'contact', 'referral'] as const;

export const SESSION_NOTE_MAX = 2000;

export const STUDENT_GRADES = ['پیش‌دبستانی', 'اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم'] as const;

export const PLACEHOLDER_NATIONAL_ID_PREFIX = 'NAS-';

export const EDUCATION_HISTORY_YEAR_MAX = 20;
export const EDUCATION_HISTORY_SCHOOL_MAX = 200;
export const EDUCATION_HISTORY_LEVEL_MAX = 100;
export const EDUCATION_HISTORY_NOTE_MAX = 1000;

export const STAFF_USERNAME_MIN = 3;
export const STAFF_USERNAME_MAX = 40;
export const STAFF_PHONE_MAX = 20;
export const STAFF_PASSWORD_MIN = 4;
export const STAFF_PASSWORD_MAX = 64;

export const FOLLOWUP_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;

export const FOLLOWUP_OPEN_STATUSES = ['open', 'in_progress'] as const;

export const FOLLOWUP_ENTITY_TYPES = ['appointment', 'student', 'waitlist', 'case_event'] as const;

export const FOLLOWUP_TITLE_MAX = 200;

export const FOLLOWUP_DEFAULT_DUE_DAYS = 7;

export const FOLLOWUP_LIST_LIMIT = 500;

export const WAITLIST_SOURCES = ['self', 'school', 'teacher', 'doctor', 'other'] as const;

export const WAITLIST_PRIORITIES = ['normal', 'urgent'] as const;

export const WAITLIST_STATUSES = [
  'waiting',
  'called',
  'scheduled',
  'admitted',
  'rejected',
  'no_show',
  'cancelled'
] as const;

export const WAITLIST_OPEN_STATUSES = ['waiting', 'called'] as const;

export const WAITLIST_QUEUE_STATUSES = ['waiting', 'called', 'scheduled'] as const;

export const WAITLIST_NAME_MAX = 120;
export const WAITLIST_SERVICE_TYPE_MAX = 120;
export const WAITLIST_NOTE_MAX = 1000;
export const WAITLIST_LIST_LIMIT = 500;

export const WAITLIST_ALERT_DAYS = 7;

export const TODO_STATUSES = ['pending', 'done'] as const;

export const TODO_PRIORITIES = ['normal', 'urgent'] as const;

export const TODO_BOXES = ['inbox', 'outbox'] as const;

export const TODO_TITLE_MAX = 200;
export const TODO_NOTE_MAX = 1000;
export const TODO_LIST_LIMIT = 200;
export const TODO_CHECKLIST_MAX = 20;
export const TODO_CHECKLIST_ITEM_MAX = 200;

export const STUDENT_CASE_STATUSES = [
  'identified',
  'awaiting_assessment',
  'in_intervention',
  'monitoring',
  'archived'
] as const;

export type StudentCaseStatus = (typeof STUDENT_CASE_STATUSES)[number];

export const SPECIAL_NEED_TYPES = [
  'dyslexia',
  'dysgraphia',
  'dyscalculia',
  'adhd',
  'autism',
  'speech_language',
  'anxiety',
  'motor_coordination',
  'slow_learner',
  'other'
] as const;

export type SpecialNeedType = (typeof SPECIAL_NEED_TYPES)[number];

export const SPECIAL_NEED_SEVERITIES = ['mild', 'moderate', 'severe'] as const;

export type SpecialNeedSeverity = (typeof SPECIAL_NEED_SEVERITIES)[number];
