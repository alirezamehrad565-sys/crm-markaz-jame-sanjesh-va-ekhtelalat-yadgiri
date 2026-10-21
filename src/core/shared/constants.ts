/**
 * زیرساخت مشترک — زمان تهران، کدملی، اسکیمای Zod و ثابت‌ها — ثابت‌های مشترک
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مقادیر ثابت سراسری سیستم — منبع یکتای حقیقت
// این ماژول هیچ side-effect ندارد.

export const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled',
  CANCELLED: 'cancelled'
} as const;

export const ATTENDANCE_STATUS = {
  PENDING: 'pending',
  PRESENT: 'present',
  ABSENT: 'absent',
  /** — حاضر با تأخیر: دانش‌آموز آمده ولی دیررس — غیبت حساب نمی‌شود */
  LATE: 'late',
  CANCELLED: 'cancelled'
} as const;

/**
 * — نقش‌های کارکنان. «supervisor» (ناظر اداره) نقش مؤثر است:
 * در DB ستون role فقط سه مقدار CHECK-دار می‌گیرد و role_ext='supervisor'
 * نقش مؤثر را گسترش می‌دهد (COALESCE(role_ext, role)) — مایگریشن 0028.
 */
export const STAFF_ROLES = ['manager', 'therapist', 'secretary', 'supervisor'] as const;

export const SCHOOL_KINDS = ['school', 'kindergarten'] as const;

/** اندازه شبکه زمان‌بندی (دقیقه) — قانون ۱۱ سند معماری */
export const SLOT_MINUTES = 15;

/** حداقل/حداکثر مدت یک نوبت (دقیقه) */
export const MIN_APPOINTMENT_MINUTES = 15;
export const MAX_APPOINTMENT_MINUTES = 240;

// ───────────── نوع نوبت ─────────────

/**
 * نوع جلسه — ستون `appointments.session_type`.
 * منبع: جدول ۴ اساس‌نامه (نحوهٔ ارائه مداخلات + زمان‌بندی):
 * - مداخلات کاردرمانی و گفتاردرمانی انفرادی ۴۵ دقیقه / گروهی ۶۰ دقیقه
 * - توانبخشی خانواده‌محور ۶۰ دقیقه / مداخلات آموزشی و معاون ۵۰ دقیقه
 * «کاردرمانی ذهنی» = توانبخشی شناختی با پروتکل خودش (پیش‌فرض ۴۵ دقیقه مثل انفرادی).
 * بدون CHECK در SQL (الگوی D7) — اعتبارسنجی با Zod.
 * durationMin = پیش‌فرض فرم (انتخاب نوع، مدت را ست می‌کند؛ قابل تغییر).
 */
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

// ───────────── مسیر پرونده ─────────────

/**
 * مسیر پرونده — ستون `students.pathway`.
 * تعیین در پذیرش/تعریف پرونده + قابل تغییر دستی توسط مدیر/منشی/درمانگرِ مسئول.
 * NULL = هنوز تعیین نشده — تب تفسیر بالینی در حالت پیش‌فرض (مسیر یادگیری) باز می‌شود.
 */
export const STUDENT_PATHWAYS = ['learning', 'rehab'] as const;

export type StudentPathway = (typeof STUDENT_PATHWAYS)[number];

export const STUDENT_PATHWAY_LABELS: Record<StudentPathway, string> = {
  learning: 'مسیر اختلال یادگیری',
  rehab: 'مسیر توانبخشی ذهنی-جسمی'
};

// ───────────── پروتکل مداخله ─────────────

/**
 * پروتکل مداخله — ستون `students.protocol`.
 * فلو دوفازی: شناسایی (ورودی مشترک) ← نتیجهٔ نیاز ویژه ← فعال شدن پروتکل در فاز مداخله.
 * NULL = هنوز در فاز شناسایی (پروتکل تعیین نشده).
 * بدون CHECK در SQL (الگوی D7) — اعتبارسنجی با Zod.
 */
export const STUDENT_PROTOCOLS = ['learning', 'slow_learner', 'mental_ot', 'rehab'] as const;

export type StudentProtocol = (typeof STUDENT_PROTOCOLS)[number];

export const STUDENT_PROTOCOL_LABELS: Record<StudentProtocol, string> = {
  learning: 'پروتکل اختلال یادگیری',
  slow_learner: 'پروتکل دیرآموز',
  mental_ot: 'پروتکل کاردرمانی ذهنی',
  rehab: 'پروتکل توانبخشی ذهنی-جسمی'
};

/** نوع نوبت پیش‌فرض هر پروتکل — انتخاب در فرم نوبت می‌تواند تغییر کند */
export const PROTOCOL_DEFAULT_SESSION_TYPE: Record<StudentProtocol, SessionTypeKey> = {
  learning: 'individual',
  slow_learner: 'individual',
  mental_ot: 'mental_ot',
  rehab: 'individual'
};

/** گام‌های اطلاعاتی هر پروتکل — نمایش در کارت پروتکل فاز مداخله */
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

/**
 * پیشنهاد پیش‌فرض «نیاز ویژه → پروتکل».
 * نگاشت صرفاً «پیشنهاد» است و UI آن را پیش‌پر می‌کند — تصمیم نهایی با درمانگر است.
 * other پیشنهاد ندارد (null).
 */
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

/** منطقه زمانی نمایش — قانون ۱۰ سند معماری */
export const DISPLAY_TIMEZONE = 'Asia/Tehran';

/** آفست ثابت تهران (UTC+03:30) — ایران از ۱۴۰۱ ساعت تابستانی ندارد */
export const TEHRAN_OFFSET_MINUTES = 210;

/** طول صفحه پیش‌فرض pagination */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ───────────── Notifications ─────────────

export const NOTIFICATION_CHANNELS = ['bale', 'internal'] as const;

export const NOTIFICATION_STATUSES = ['pending', 'sent', 'failed', 'skipped'] as const;

/** قالب‌های پیام — منبع یکتا برای NotifyService و routes */
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

  // ─── فاز ۴ — هماهنگی داخلی (Todo) ───
  'todo_assigned',

  // ─── بات اطلاع‌رسان: خلاصهٔ روز + یادآور پیگیری + پاسخ‌های بات ───
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

  // ─── بات نقش‌آگاه: راهنمای نقش‌محور + جستجوی دانش‌آموز + برنامهٔ مرکز ───
  'bot_help_guest',
  'bot_help_office',
  'bot_help_therapist',
  'bot_help_class',
  'bot_help_parent',
  'bot_search_denied',
  'bot_center_denied',

  // ─── لیست انتظار ↔ بات: اعلان «نوبت خالی شد» به دفتر + دستور «لیست انتظار» ───
  'waitlist_slot_freed',
  'bot_waitlist_denied',

  // ─── بانک تمرین: تکلیف به خانواده + پاسخ‌های بات ───
  'homework_assigned',
  'bot_exercise_denied',
  'bot_exercise_disabled',
  'bot_exercise_empty',
  'bot_exercise_sent',

  // ─── حلقهٔ بازگشت فایل: اعلان به کارکنان + پاسخ‌های بات ───
  'homework_returned',
  'bot_submission_received',
  'bot_submission_no_pending',
  'bot_submission_unavailable',
  'bot_submission_failed',
  'bot_submission_too_large',
  'bot_submission_bad_type',
  'bot_submission_denied',

  // ─── دکمه‌های ثابت ناوبری بات + «درباره مرکز» ───
  'bot_about',

  // ─── ثبت متقاضی لیست انتظار توسط معلم مدرسه ───
  'bot_wl_denied_staff',
  'bot_wl_family_call',
  'bot_wl_guest_link',
  'bot_wl_cancelled',
  'bot_wl_done',
  'bot_wl_link_lost',

  // ─── بات نقش‌محور CRM: عموم/معلم/صف اعلان/ناظر اداره ───
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

  // ─── بات نقش‌محور نسخهٔ ۲: عموم کامل + حلقهٔ پیام خانواده ───
  'bot_services',
  'bot_auth_guide',
  'bot_pending_homework',
  'bot_family_message',
  'bot_class_activity',

  // ─── تایم‌لاین و گزارش‌نویسی: چک‌لیست خانواده + تصحیح تمرین ───
  'bot_checklist_assigned',
  'bot_checklist_result',
  'homework_graded',
  'bot_case_event_denied',
  'bot_family_message_sent',
  'bot_case_events_disabled',

  // ─── موتور تشخیص و مداخله: ارسال چک‌لیست با یک کلیک (لینک امن وب‌فرم) ───
  'bot_checklist_link',

  // ─── T7 m150-b: فرم جامع معلم — پیام معلم‌محور لینک گره‌خورده به نام معلم ───
  'bot_teacher_package_link',

  // ─── m151 — مدارک بله: درخواست مدارک از خانواده + پاسخ‌های بات ───
  'doc_request_sent',
  'bot_doc_received',
  'bot_doc_bad_type',
  'bot_doc_too_large',
  'bot_doc_failed',

  // — ترمیم خطای پایه: قالب در کد مصرف می‌شد ولی در فهرست منبع جا افتاده بود
  'bot_goal_denied'
] as const;

/** حداکثر تلاش ارسال پیش از skipped شدن رکورد */
export const MAX_DISPATCH_ATTEMPTS = 5;

/** افق زمانی صف‌گذاری یادآوری (ساعت) — cron هر بار ۲۴h جلو را نگاه می‌کند */
export const REMINDER_HORIZON_HOURS = 24;

/** پیش‌فرض «چند ساعت قبل از نوبت» برای یادآوری */
export const DEFAULT_REMINDER_HOURS_BEFORE = 2;

/** برنامه cron یادآوری‌ها — 20:30 و 10:00 به وقت تهران (17:00Z و 06:30Z) */
export const REMINDER_CRONS = ['0 17 * * *', '30 6 * * *'] as const;

/**
 * — cron «ساعت ارسال» پیش‌نویس‌ها — 18:00 تهران (14:30Z).
 * اگر notify_batch_hour تغییر کند، همین خط هم باید هم‌گام شود (سند DEPLOY).
 */
export const BATCH_CRON = '30 14 * * *' as const;

/**
 * — حداقل فاصلهٔ اعلان‌دار از «ساعت ارسال» — اگر نوبت کمتر از این ساعت
 * بعد از ساعت ارسال شروع شود، اعلانش به‌جای صف، فوری می‌رود.
 */
export const BATCH_MIN_LEAD_HOURS = 12;

/** — cron «خلاصهٔ روز» بات — 07:30 تهران (04:00Z — تهران بدون DST) */
export const DIGEST_CRON = '0 4 * * *' as const;

/** طول کد اتصال بات (A-Z بدون اعداد گمراه‌کننده) */
export const LINK_CODE_LENGTH = 6;

/** نام پیش‌فرض مرکز در قالب پیام‌ها (قابل بازنویسی با var) */
export const DEFAULT_CLINIC_NAME = 'مرکز جامع';

// ───────────── Settings ─────────────

/** کلیدهای جدول settings — منبع یکتای نام کلیدها */
export const SETTING_KEYS = {
  CENTER_HOURS: 'center_hours',
  CLINIC_NAME: 'clinic_name',
  DEFAULT_REMINDER_HOURS: 'default_reminder_hours',
  NOTIFY_ON_CREATE: 'notify_on_create',
  NOTIFY_ON_MOVE: 'notify_on_move',
  NOTIFY_ON_CANCEL: 'notify_on_cancel',
  NOTIFY_DIGEST: 'notify_digest',
  NOTIFY_WAITLIST: 'notify_waitlist',
  /** — کلید قطع بانک تمرین (جریان بات + ثبت تکلیف؛ پنل کارکنان می‌ماند) */
  EXERCISE_BANK_ENABLED: 'exercise_bank_enabled',
  /** — شاخص سنجش (هدفگذاری غربال) — آرایهٔ بازه‌های سال/ماه شمسی */
  SCREENING_TARGETS: 'screening_targets',
  /** — شماره تماس عمومی مرکز (بات عموم مردم + دربارهٔ مرکز) */
  CLINIC_PHONE: 'clinic_phone',
  /** — «ساعت ارسال» پیش‌نویس اعلان ثبت نوبت — 0..23 تهران (پیش‌فرض 18) */
  NOTIFY_BATCH_HOUR: 'notify_batch_hour',
  /** — پیکربندی امتیازدهی همکاران (تاریخ شروع شمارش + وزن‌های فرمول — فقط مدیر) */
  SCORING_CONFIG: 'scoring_config',
  /** — یوزرنیم بات بله برای ساخت لینک اتصال (ble.ir/<bot>?start=CODE) */
  BOT_USERNAME: 'bot_username'
} as const;

/** مقدار پیش‌فرض تنظیمات — وقتی کلیدی در DB نیست این‌ها اعمال می‌شوند */
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

/** — هدفگذاری سنجش برای یک بازهٔ شمسی — month=null یعنی کل سال */
export interface ScreeningTargetConfig {
  /** سال شمسی (مثلاً ۱۴۰۵) — در بازهٔ سفارشی به‌صورت خودکار از «از» استخراج می‌شود */
  year: number;
  /** ماه شمسی ۱..۱۲ — null یعنی کل سال یا بازهٔ سفارشی */
  month: number | null;
  /** تعداد سنجش هدف */
  target: number;
  /** — عنوان اختیاری هدف (مثلاً «کمپین پاییزه») — همپوشانی بازه‌ها مجاز است */
  title?: string | null;
  /** — بازهٔ سفارشی: شروع (YYYY-MM-DD میلادی) — null = حالت سال/ماه */
  from?: string | null;
  /** — بازهٔ سفارشی: پایان شمول (YYYY-MM-DD میلادی) — null = حالت سال/ماه */
  to?: string | null;
}

/** حداکثر ردیف هدفگذاری سنجش (سال×ماه×بازهٔ سفارشی) */
export const SCREENING_TARGETS_MAX = 60;

/** بازه کاری پیش‌فرض مرکز — شنبه تا چهارشنبه ۹ تا ۱۷، پنجشنبه ۹ تا ۱۳ (دقیقه از نیمه‌شب) */
export const DEFAULT_CENTER_HOURS: { weekday: number; startMinute: number; endMinute: number }[] = [
  { weekday: 0, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 2, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 3, startMinute: 9 * 60, endMinute: 17 * 60 },
  { weekday: 4, startMinute: 9 * 60, endMinute: 13 * 60 }
];

/** ساعات نمایش تقویم — پنجره روز در نمای هفتگی */
export const CALENDAR_DAY_START_MINUTE = 6 * 60;  // 06:00
export const CALENDAR_DAY_END_MINUTE = 22 * 60;   // 22:00

// ───────────── Announcements ─────────────

/** محدودیت طول عنوان اعلان */
export const ANNOUNCEMENT_TITLE_MAX = 120;

/** محدودیت طول متن اعلان */
export const ANNOUNCEMENT_BODY_MAX = 2000;

// ───────────── Knowledge ─────────────

/** محدودیت طول عنوان مقالهٔ دانش */
export const KNOWLEDGE_TITLE_MAX = 140;

/** محدودیت طول متن مقالهٔ دانش */
export const KNOWLEDGE_BODY_MAX = 6000;

/** دسته‌های مقالهٔ دانش‌افزایی — ماتریس در کد (بدون CHECK در SQL) */
export const KNOWLEDGE_CATEGORIES = ['tip', 'protocol', 'article', 'news'] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

/** برچسب فارسی دسته‌ها — UI و اعتبارسنجی پیام‌ها */
export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  tip: 'نکتهٔ آموزشی',
  protocol: 'پروتکل درمانی',
  article: 'مقاله',
  news: 'خبر مرکز'
};

// ───────────── Staff attendance ─────────────

/** وضعیت‌های حضور روزانه همکار */
export const STAFF_ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'leave', 'sick'] as const;

/** حداکثر طول یادداشت حضور */
export const STAFF_ATTENDANCE_NOTE_MAX = 300;
/** — ثبت حضور همکاران فقط برای همان روز (امروز تهران) مجاز است */
export const STAFF_ATTENDANCE_TODAY_ONLY = true;

/** حداکثر طول بازه گزارش حضور (روز) */
export const STAFF_ATTENDANCE_MAX_RANGE_DAYS = 366;

// ───────────── Tags ─────────────

/** دسته‌های برچسب دانش‌آموز — نوع اختلال / پایه / نوع مدرسه / سفارشی */
export const TAG_CATEGORIES = ['disorder', 'grade', 'school_type', 'custom'] as const;

/** حداکثر برچسب روی یک دانش‌آموز */
export const MAX_TAGS_PER_STUDENT = 30;

// ───────────── پیوست‌ها ─────────────

/** حداکثر حجم هر فایل پیوست (بایت) — ۵۱۲KB */
export const MAX_FILE_BYTES = 512 * 1024;

/** MIME typeهای مجاز پیوست — سند و تصویر؛ اجرایی/اسکریپت ممنوع */
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

// ───────────── بانک تمرین ─────────────

/** قالب تمرین — کاربرگ/بازی/دستورالعمل خانه */
export const EXERCISE_FORMATS = ['worksheet', 'game', 'instruction'] as const;

/** حداکثر طول عنوان تمرین */
export const EXERCISE_TITLE_MAX = 150;

/** حداکثر طول توضیح تمرین */
export const EXERCISE_DESCRIPTION_MAX = 2000;

/** حداکثر حجم فایل تمرین روی آداپتر D1 (بایت) — سازگار با سقف پارامتر D1 */
export const MAX_EXERCISE_FILE_BYTES = 512 * 1024;

/** — حداکثر حجم هر فایل تمرین روی آداپتر R2 (بایت) — تصمیم کاربر: ۵۰ مگابایت */
export const MAX_EXERCISE_PANEL_FILE_BYTES = 50 * 1024 * 1024;

/** — حداکثر تعداد فایل در هر بار بارگذاری چندفایلی */
export const MAX_EXERCISE_FILES_PER_UPLOAD = 10;

/** — حجم هر تکه در بارگذاری پیوستهٔ فایل‌های بزرگ (بایت) — هر درخواست HTTP یک تکه؛
 * اتصال پارامتر بزرگ به D1 پرهزینهٔ CPU است (~۲۰۰ns/بایت) و سقف CPU درخواست را می‌سوزاند */
export const MAX_EXERCISE_UPLOAD_CHUNK_BYTES = 1024 * 1024;

/** — حداکثر تعداد پیوست برای هر تمرین */
export const MAX_EXERCISE_ATTACHMENT_COUNT = 20;

// ─── بستهٔ تمرینی + بستهٔ تکلیف ───

/** حداکثر طول عنوان بستهٔ تمرینی */
export const EXERCISE_PACKAGE_TITLE_MAX = 150;

/** حداکثر تعداد برچسب برای هر بستهٔ تمرینی */
export const MAX_EXERCISE_PACKAGE_TAGS = 10;

/** حداکثر تعداد تمرین در یک بستهٔ تمرینی */
export const MAX_EXERCISE_PACKAGE_ITEMS = 30;

/** حداکثر تعداد تمرین در هر ارسال تکی (بدون بسته) از پنل */
export const MAX_EXERCISE_BATCH_ITEMS = 20;

/** حداکثر طول یادداشت بستهٔ تکلیف */
export const EXERCISE_BATCH_NOTE_MAX = 500;

/** حداکثر لینک دانلود در یک پیام خانواده (بقیه با «و N فایل دیگر…» جمع می‌شود) */
export const MAX_EXERCISE_BATCH_LINKS = 10;


/** — MIME مجاز ویدیویی برای فایل تمرین (ویدیوی دستورالعمل خانه) */
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

/** MIME مجاز فایل تمرین — پیوست‌ها + HTML کاربرگ + ویدیو */
export const ALLOWED_EXERCISE_FILE_MIME_TYPES = [
  ...ALLOWED_FILE_MIME_TYPES,
  'text/html',
  ...ALLOWED_EXERCISE_VIDEO_MIME_TYPES
] as const;

/** تعداد آیتم هر صفحهٔ لیست تمرین در بات */
export const EXB_PAGE_SIZE = 5;

/** تعداد دانش‌آموز هر صفحهٔ انتخاب در بات */
export const EXB_STUDENTS_PAGE_SIZE = 6;

/** عمر لینک دانلود خانواده (ثانیه) — ۷ روز */
export const EXB_DOWNLOAD_TTL_SECONDS = 7 * 24 * 60 * 60;

/** پنجرهٔ پیوست صفحهٔ بعدی نتیجه به آخرین تکلیف بازگشتی (ساعت) — */
export const SUBMISSION_ATTACH_WINDOW_HOURS = 48;

/** حداکثر طول کپشن (نکتهٔ خانواده همراه فایل بازگشتی) */
export const SUBMISSION_NOTE_MAX = 500;

// ───────────── تایم‌لاین و گزارش‌نویسی ─────────────

/** انقضای توکن وب‌فرم چک‌لیست خانواده (ساعت) — ۷ روز */
export const CASE_EVENT_FILL_EXPIRY_HOURS = 168;

/** سقف بازخورد تصحیح تکلیف (تصمیم ۵ طراحی — وضعیت + متن) */
export const EXERCISE_FEEDBACK_MAX = 1000;
export const EXERCISE_FEEDBACK_MIN = 2;

// ───────────── Classes و معلم مدرسه ─────────────

/** حداکثر طول نام کلاس */
export const CLASS_NAME_MAX = 120;

/** حداکثر طول نام معلم مدرسه */
export const TEACHER_NAME_MAX = 120;

/** حداکثر تعداد کلاس هر مدرسه */
export const MAX_CLASSES_PER_SCHOOL = 60;

/** حداکثر طول عبارت جستجوی سراسری */
export const SEARCH_QUERY_MIN_LENGTH = 2;

/** حداکثر طول عبارت جستجوی سراسری */
export const SEARCH_QUERY_MAX_LENGTH = 60;

// ───────────── Working Day ─────────────

/** حداکثر طول متن توضیحات روز کاری */
export const DAY_NOTE_BODY_MAX = 2000;

// ───────────── Board Ops (فاز ۱ — بورد منشی) ─────────────

/**
 * وضعیت‌های عملیاتی نوبت (تصمیم D1) — ستون additive جدا از status.
 * NULL = برنامه‌ریزی‌شدهٔ عادی؛ completed/no_show پایان‌حالت‌اند.
 * تغییر وضعیت اعلان نمی‌سازد (تصمیم D6) و audit هم‌تراکنش دارد.
 */
export const APPOINTMENT_OPS_STATUSES = [
  'checked_in',
  'delayed',
  'in_session',
  'completed',
  'no_show'
] as const;

/** وضعیت عملیاتی نوبت (فاز ۱) */
export type AppointmentOpsStatus = (typeof APPOINTMENT_OPS_STATUSES)[number];

/** پایان‌حالت‌ها — بعد از آن‌ها هیچ ترنزیشن عملیاتی مجاز نیست */
export const OPS_TERMINAL_STATUSES = ['completed', 'no_show'] as const;

/** پنجرهٔ صف بورد منشی (دقیقه) — §7.2 */
export const OPS_QUEUE_WINDOW_MINUTES = 60;

/** نوع یادداشت روز کاری — انسانی/سیستمی (تصمیم D2) */
export const DAY_NOTE_KINDS = ['human', 'system'] as const;

// ───────────── Session Notes (فاز ۲ — گزارش جلسه) ─────────────

/**
 * اقدام بعدی (تصمیم D7 — §8.5/§13.5) — enum در constants تا توسعه‌پذیر بماند
 * (بدون CHECK در SQL). 'none' یعنی هیچ اقدامی — در DB به‌صورت NULL ذخیره می‌شود.
 * در فاز ۳، ذخیرهٔ follow_up هوک ساخت پیگیری می‌گیرد (همان endpoint — نه بازنویسی).
 */
export const NEXT_ACTION_VALUES = ['none', 'follow_up', 'next_appointment', 'contact', 'referral'] as const;

/** حداکثر طول متن گزارش جلسه */
export const SESSION_NOTE_MAX = 2000;

/**
 * پایه‌های تحصیلی ثابت — آموزش‌وپرورش ایران، حداکثر ششم ابتدایی.
 * مقدار ذخیره‌شده در DB همان لیبل فارسی است (فیلتر/جستجو برابرِ دقیق کار می‌کند).
 */
export const STUDENT_GRADES = ['پیش‌دبستانی', 'اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم'] as const;

// ───────────── آرشیو انعطاف‌پذیر + تاریخچهٔ تحصیلی ─────────────

/**
 * پیشوند نگه‌دارندهٔ کد ملی — پرونده‌های ثبت‌شده بدون کد ملی (آرشیو) یک مقدار
 * یکتای «NAS-…» می‌گیرند تا قید NOT NULL UNIQUE ستون حفظ شود؛ کد ملی واقعی
 * هرگز با «NAS-» شروع نمی‌شود و هر زمان از پروفایل/ویرایش قابل ثبت است.
 */
export const PLACEHOLDER_NATIONAL_ID_PREFIX = 'NAS-';

/** سقف طول فیلدهای تاریخچهٔ تحصیلی (student_education_history) */
export const EDUCATION_HISTORY_YEAR_MAX = 20;
export const EDUCATION_HISTORY_SCHOOL_MAX = 200;
export const EDUCATION_HISTORY_LEVEL_MAX = 100;
export const EDUCATION_HISTORY_NOTE_MAX = 1000;

// ───────────── Staff v۲ / صفحه ورود ─────────────

export const STAFF_USERNAME_MIN = 3;
export const STAFF_USERNAME_MAX = 40;
export const STAFF_PHONE_MAX = 20;
export const STAFF_PASSWORD_MIN = 4;
export const STAFF_PASSWORD_MAX = 64;

// ───────────── Follow-ups (فاز ۳ — بنیاد پیگیری) ─────────────

/**
 * وضعیت‌های پیگیری — تغییر فقط از PATCH با ماتریس pure.ts.
 * overdue ستون ندارد — computed است: open/in_progress ∧ due_at<now (§13.4)
 */
export const FOLLOWUP_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;

/** وضعیت‌های باز — در گروه‌بندی‌ها و شمارنده‌ها لحاظ می‌شوند */
export const FOLLOWUP_OPEN_STATUSES = ['open', 'in_progress'] as const;

/**
 * موجودیت‌های مقصد پیگیری — بدون CHECK در SQL تا فازهای بعد
 * (مثلاً booking_request فاز ۵) بدون migration اضافه شوند (الگوی D7).
 */
export const FOLLOWUP_ENTITY_TYPES = ['appointment', 'student', 'waitlist', 'case_event'] as const;

/** حداکثر طول عنوان پیگیری */
export const FOLLOWUP_TITLE_MAX = 200;

/** مهلت پیش‌فرض پیگیری‌های خودکار (هوک جلسه/لیست انتظار) — روز */
export const FOLLOWUP_DEFAULT_DUE_DAYS = 7;

/** حداکثر تعداد ردیف پاسخ فهرست پیگیری */
export const FOLLOWUP_LIST_LIMIT = 500;

// ───────────── Waitlist (فاز W — لیست انتظار) ─────────────

/** منبع ارجاع متقاضی */
export const WAITLIST_SOURCES = ['self', 'school', 'teacher', 'doctor', 'other'] as const;

/** اولویت — urgent بالای لیست */
export const WAITLIST_PRIORITIES = ['normal', 'urgent'] as const;

/** وضعیت‌های عملیاتی — تغییر فقط از endpointهای اختصاصی */
export const WAITLIST_STATUSES = [
  'waiting',
  'called',
  'scheduled',
  'admitted',
  'rejected',
  'no_show',
  'cancelled'
] as const;

/** وضعیت‌های «در انتظار» — در شمارنده‌های بورد/badge لحاظ می‌شوند */
export const WAITLIST_OPEN_STATUSES = ['waiting', 'called'] as const;

/** — وضعیت‌های «هنوز در صف نوبت‌دهی/پذیرش» شامل scheduled (منتظر اولین جلسه) */
export const WAITLIST_QUEUE_STATUSES = ['waiting', 'called', 'scheduled'] as const;

export const WAITLIST_NAME_MAX = 120;
export const WAITLIST_SERVICE_TYPE_MAX = 120;
export const WAITLIST_NOTE_MAX = 1000;
export const WAITLIST_LIST_LIMIT = 500;

/** آستانهٔ هشدار badge — waiting/called قدیمی‌تر از این روزها */
export const WAITLIST_ALERT_DAYS = 7;

// ───────────── اتصال دانش‌آموز به لیست انتظار (تیک «منتظر دریافت خدمت») ─────────────
// source/priority/service_type از همان WAITLIST_* استفاده می‌کنند


// ───────────── Todos (فاز ۴ — هماهنگی داخلی منشی↔مدیر) ─────────────

/**
 * وضعیت کار داخلی — تغییر فقط از endpoint اختصاصی complete (ماتریس pure.ts)؛
 * حذف نرم (deleted_at) بخشی از PATCH است و status را تغییر نمی‌دهد.
 */
export const TODO_STATUSES = ['pending', 'done'] as const;

/** اولویت کار — urgent در شمارش badge و ترتیب فهرست بالاتر می‌آید */
export const TODO_PRIORITIES = ['normal', 'urgent'] as const;

/** صندوق‌های فهرست — inbox = کارهای روی میز من، outbox = کارهای واگذارشدهٔ من */
export const TODO_BOXES = ['inbox', 'outbox'] as const;

export const TODO_TITLE_MAX = 200;
export const TODO_NOTE_MAX = 1000;
export const TODO_LIST_LIMIT = 200;
/** — چک‌لیست کار: حداکثر ۲۰ مورد و ۲۰۰ نویسه برای هر مورد */
export const TODO_CHECKLIST_MAX = 20;
export const TODO_CHECKLIST_ITEM_MAX = 200;

// ───────────── Case Status (فاز ۶ — §12.1/§14.2، تصمیم D5) ─────────────

/**
 * چرخهٔ وضعیت پرونده — یک ستون `students.case_status` (تصمیم D5).
 * «نیازمند پیگیری» (§14.2) حالت ذخیره‌شده نیست — از وجود follow-up باز مشتق می‌شود (§19).
 * بدون CHECK در SQL (الگوی D7) — اعتبارسنجی با Zod.
 */
export const STUDENT_CASE_STATUSES = [
  'identified',
  'awaiting_assessment',
  'in_intervention',
  'monitoring',
  'archived'
] as const;

/** وضعیت پرونده دانش‌آموز (فاز ۶) */
export type StudentCaseStatus = (typeof STUDENT_CASE_STATUSES)[number];

// ───────────── Special Needs (فاز ۷ — §12، تصمیم D3) ─────────────

/**
 * نوع نیاز ویژه — ستون ساختاریافتهٔ `students.special_need_type` (تصمیم D3).
 * هم‌تراز taxonomy نه‌گانهٔ برچسب‌های disorder (0006_tags.sql + 0041_tag_slow_learner.sql) + «سایر».
 * برچسب‌ها منبع حقیقت نمی‌مانند برای گرید — فقط taxonomy آزاد فیلترپذیر.
 * بدون CHECK در SQL (الگوی D7) — اعتبارسنجی با Zod.
 */
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

/** نوع نیاز ویژه (فاز ۷) */
export type SpecialNeedType = (typeof SPECIAL_NEED_TYPES)[number];

/** شدت نیاز ویژه — سه سطح استاندارد بالینی */
export const SPECIAL_NEED_SEVERITIES = ['mild', 'moderate', 'severe'] as const;

/** شدت نیاز ویژه (فاز ۷) */
export type SpecialNeedSeverity = (typeof SPECIAL_NEED_SEVERITIES)[number];
