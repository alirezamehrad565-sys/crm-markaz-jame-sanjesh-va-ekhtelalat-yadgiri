import { z } from 'zod';
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  EDUCATION_HISTORY_LEVEL_MAX,
  EDUCATION_HISTORY_NOTE_MAX,
  EDUCATION_HISTORY_SCHOOL_MAX,
  EDUCATION_HISTORY_YEAR_MAX,
  KNOWLEDGE_BODY_MAX,
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_TITLE_MAX,
  APPOINTMENT_STATUS,
  APPOINTMENT_OPS_STATUSES,
  ATTENDANCE_STATUS,
  CLASS_NAME_MAX,
  DAY_NOTE_BODY_MAX,
  EXERCISE_DESCRIPTION_MAX,
  EXERCISE_FORMATS,
  EXERCISE_PACKAGE_TITLE_MAX,
  EXERCISE_TITLE_MAX,
  MAX_EXERCISE_PACKAGE_ITEMS,
  MAX_EXERCISE_PACKAGE_TAGS,
  MAX_EXERCISE_BATCH_ITEMS,
  EXERCISE_BATCH_NOTE_MAX,
  FOLLOWUP_ENTITY_TYPES,
  FOLLOWUP_STATUSES,
  FOLLOWUP_TITLE_MAX,
  MAX_APPOINTMENT_MINUTES,
  MAX_FILE_BYTES,
  MAX_TAGS_PER_STUDENT,
  MIN_APPOINTMENT_MINUTES,
  NEXT_ACTION_VALUES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  SCHOOL_KINDS,
  SCREENING_TARGETS_MAX,
  SEARCH_QUERY_MAX_LENGTH,
  SESSION_NOTE_MAX,
  SESSION_TYPE_KEYS,
  SLOT_MINUTES,
  STUDENT_CASE_STATUSES,
  STUDENT_PATHWAYS,
  SPECIAL_NEED_SEVERITIES,
  SPECIAL_NEED_TYPES,
  STUDENT_GRADES,
  STAFF_ATTENDANCE_MAX_RANGE_DAYS,
  STAFF_ATTENDANCE_NOTE_MAX,
  STAFF_ATTENDANCE_STATUSES,
  STAFF_PASSWORD_MAX,
  STAFF_PASSWORD_MIN,
  STAFF_PHONE_MAX,
  STAFF_ROLES,
  STAFF_USERNAME_MAX,
  STAFF_USERNAME_MIN,
  TODO_BOXES,
  TODO_CHECKLIST_ITEM_MAX,
  TODO_CHECKLIST_MAX,
  TODO_NOTE_MAX,
  TODO_PRIORITIES,
  TODO_STATUSES,
  TODO_TITLE_MAX,
  TAG_CATEGORIES,
  TEACHER_NAME_MAX,
  WAITLIST_LIST_LIMIT,
  WAITLIST_NAME_MAX,
  WAITLIST_NOTE_MAX,
  WAITLIST_PRIORITIES,
  WAITLIST_SERVICE_TYPE_MAX,
  WAITLIST_SOURCES,
  WAITLIST_STATUSES
} from './constants';
import { isValidIranianNationalId, normalizeNationalId } from './national-id';
import { isOnGrid, tehranTodayYmd } from './time';

export const UuidSchema = z.string().uuid('شناسه معتبر نیست');

export const IsoDateTimeSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'زمان باید ISO معتبر باشد');

export const SlotAlignedTimeSchema = IsoDateTimeSchema.refine(
  (v) => isOnGrid(v, 15),
  'زمان باید روی شبکه ۱۵ دقیقه‌ای باشد'
);

export const NationalIdSchema = z
  .string()
  .transform((v) => normalizeNationalId(v))
  .refine((v) => isValidIranianNationalId(v), 'کد ملی معتبر نیست');

export const StaffRoleSchema = z.enum(STAFF_ROLES);
export const SchoolKindSchema = z.enum(SCHOOL_KINDS);
export const AppointmentStatusSchema = z.enum([
  APPOINTMENT_STATUS.SCHEDULED,
  APPOINTMENT_STATUS.CANCELLED
]);
export const AttendanceStatusSchema = z.enum([
  ATTENDANCE_STATUS.PENDING,
  ATTENDANCE_STATUS.PRESENT,
  ATTENDANCE_STATUS.ABSENT,
  ATTENDANCE_STATUS.CANCELLED
]);

export const TehranYmdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ باید به قالب YYYY-MM-DD باشد');

export const AppointmentStudentRefSchema = z.object({
  student_id: UuidSchema,
  facet_id: z.string().min(1).max(64).optional()
});

export const NewAppointmentSchema = z
  .object({
    staff_id: UuidSchema,
    start_at: IsoDateTimeSchema,
    end_at: IsoDateTimeSchema,
    students: z.array(AppointmentStudentRefSchema).max(20).default([]),
    note: z.string().max(2000).nullish(),
    session_type: z.enum(SESSION_TYPE_KEYS).nullish()
  })
  .refine((v) => Date.parse(v.end_at) > Date.parse(v.start_at), {
    message: 'زمان پایان باید بعد از زمان شروع باشد',
    path: ['end_at']
  })
  .refine(
    (v) => {
      const minutes = (Date.parse(v.end_at) - Date.parse(v.start_at)) / 60000;
      return minutes >= MIN_APPOINTMENT_MINUTES && minutes <= MAX_APPOINTMENT_MINUTES;
    },
    {
      message: `مدت نوبت باید بین ${MIN_APPOINTMENT_MINUTES} تا ${MAX_APPOINTMENT_MINUTES} دقیقه باشد`
    }
  );

export const UpdateAppointmentSchema = z.object({
  note: z.string().max(2000).nullish(),
  version: z.number().int().positive()
});

export const MoveAppointmentSchema = z.object({
  start_at: SlotAlignedTimeSchema,
  version: z.number().int().positive()
});

export const ResizeAppointmentSchema = z.object({
  end_at: IsoDateTimeSchema,
  version: z.number().int().positive()
});

export const CancelAppointmentSchema = z.object({
  version: z.number().int().positive()
});

export const OpsStatusSchema = z.enum(APPOINTMENT_OPS_STATUSES);

export const SetOpsStatusSchema = z.object({
  ops_status: OpsStatusSchema
});

export const CopyWeekSchema = z.object({
  source_monday: TehranYmdSchema,
  target_monday: TehranYmdSchema,
  staff_id: UuidSchema.optional(),
  dry_run: z.boolean().optional().default(false)
});

export const MarkAttendanceSchema = z.object({
  status: z.enum([ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.LATE, ATTENDANCE_STATUS.ABSENT, ATTENDANCE_STATUS.CANCELLED]),
  note: z.string().max(1000).optional()
});

export const GuardianPhoneSchema = z
  .string()
  .transform((v) => {
    let s = String(v ?? '')
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[\s\-().]/g, '');
    if (s.startsWith('+98')) s = '0' + s.slice(3);
    else if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2);
    return s;
  })
  .refine((v) => /^09\d{9}$/.test(v), 'شماره موبایل ولیّ معتبر نیست — باید ۱۱ رقم و با ۰۹ شروع شود');

export const NewSchoolSchema = z.object({
  name: z.string().min(2).max(200),
  kind: SchoolKindSchema.default('school'),
  gender_type: z.enum(['male', 'female', 'mixed']).optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  principal_name: z.string().max(120).optional(),
  principal_phone: z.string().max(20).optional(),
  code: z
    .string()
    .transform((v) => v.trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))
    .pipe(z.string().max(20))
    .optional(),
  notes: z.string().trim().max(500, 'یادداشت حداکثر ۵۰۰ نویسه است').optional()
});

export const UpdateSchoolSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  kind: SchoolKindSchema.optional(),
  gender_type: z.enum(['male', 'female', 'mixed']).optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  principal_name: z.string().max(120).optional(),
  principal_phone: z.string().max(20).optional(),
  code: z
    .string()
    .transform((v) => v.trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))
    .pipe(z.string().max(20))
    .optional(),
  notes: z.string().trim().max(500, 'یادداشت حداکثر ۵۰۰ نویسه است').optional()
});

export const NewClassSchema = z.object({
  school_id: UuidSchema,
  name: z.string().trim().min(2, 'نام کلاس حداقل ۲ نویسه است').max(CLASS_NAME_MAX),
  teacher_name: z.string().trim().max(TEACHER_NAME_MAX).optional(),
  teacher_phone: z.string().max(20).optional()
});

export const UpdateClassSchema = z.object({
  name: z.string().trim().min(2, 'نام کلاس حداقل ۲ نویسه است').max(CLASS_NAME_MAX).optional(),
  teacher_name: z.string().trim().max(TEACHER_NAME_MAX).nullable().optional(),
  teacher_phone: z.string().max(20).nullable().optional()
});

export const PathwaySchema = z.enum(STUDENT_PATHWAYS);

export const NewStudentSchema = z
  .object({
    national_id: NationalIdSchema.optional(),
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    birth_date: TehranYmdSchema.optional(),
    gender: z.enum(['male', 'female']).optional(),
    grade: z.enum(STUDENT_GRADES).optional(),
    school_id: UuidSchema.optional(),
    class_id: UuidSchema.optional(),
    guardian_name: z.string().max(100).optional(),
    guardian_relation: z.string().max(50).optional(),
    guardian_phone: GuardianPhoneSchema.optional(),
    owner_staff_id: UuidSchema.optional(),
    archived: z.boolean().optional(),
    pathway: PathwaySchema.optional()
  })
  .superRefine((v, ctx) => {
    if (!v.archived && !v.national_id) {
      ctx.addIssue({ code: 'custom', path: ['national_id'], message: 'کد ملی برای دانش‌آموز فعال الزامی است — بدون کد ملی فقط در «آرشیو» امکان‌پذیر است' });
    }
  });

export const UpdateStudentSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  birth_date: TehranYmdSchema.optional(),
  gender: z.enum(['male', 'female']).optional(),
  grade: z.enum(STUDENT_GRADES).optional(),
  school_id: UuidSchema.nullable().optional(),
  class_id: UuidSchema.nullable().optional(),
  guardian_name: z.string().max(100).optional(),
  guardian_relation: z.string().max(50).optional(),
  guardian_phone: GuardianPhoneSchema.optional(),
  national_id: NationalIdSchema.optional()
});

export const NewEducationHistorySchema = z.object({
  study_year: z
    .string()
    .trim()
    .min(2, 'سال تحصیلی حداقل ۲ نویسه است')
    .max(EDUCATION_HISTORY_YEAR_MAX, 'سال تحصیلی بیش از حد طولانی است'),
  school_name: z.string().trim().max(EDUCATION_HISTORY_SCHOOL_MAX).optional(),
  level: z.string().trim().max(EDUCATION_HISTORY_LEVEL_MAX).optional(),
  notes: z.string().trim().max(EDUCATION_HISTORY_NOTE_MAX).optional()
});

const StaffUsernameSchema = z
  .string()
  .trim()
  .min(STAFF_USERNAME_MIN, `نام کاربری باید حداقل ${STAFF_USERNAME_MIN} نویسه باشد`)
  .max(STAFF_USERNAME_MAX, 'نام کاربری بیش از حد طولانی است')
  .regex(/^[A-Za-z0-9._-]+$/, 'نام کاربری فقط حروف لاتین، عدد و ._ـ- مجاز است');

const StaffPhoneSchema = z
  .string()
  .trim()
  .min(7, 'شماره تلفن کوتاه است')
  .max(STAFF_PHONE_MAX, 'شماره تلفن بیش از حد طولانی است')
  .regex(/^[0-9+\s-]+$/, 'شماره تلفن فقط رقم و + است');

export const StaffPasswordSchema = z
  .string()
  .min(STAFF_PASSWORD_MIN, `رمز باید حداقل ${STAFF_PASSWORD_MIN} نویسه باشد`)
  .max(STAFF_PASSWORD_MAX, 'رمز بیش از حد طولانی است');

export const NewStaffSchema = z.object({
  full_name: z.string().min(2, 'نام باید حداقل ۲ نویسه باشد').max(200),
  phone: StaffPhoneSchema,
  national_id: NationalIdSchema,
  username: StaffUsernameSchema,
  password: StaffPasswordSchema.optional(),
  role: StaffRoleSchema,
  notify_enabled: z.boolean().optional()
});

export const UpdateStaffSchema = z.object({
  full_name: z.string().min(2, 'نام باید حداقل ۲ نویسه باشد').max(200).optional(),
  phone: StaffPhoneSchema.optional(),
  national_id: NationalIdSchema.optional(),
  username: StaffUsernameSchema.optional(),
  password: StaffPasswordSchema.optional(),
  role: StaffRoleSchema.optional(),
  notify_enabled: z.boolean().optional()
});

export const LoginSchema = z.object({
  username: z.string().trim().min(1, 'نام کاربری الزامی است').max(100),
  password: z.string().min(1, 'رمز عبور الزامی است').max(STAFF_PASSWORD_MAX)
});

const gridMinute = (label: string) =>
  z
    .number()
    .int(`${label} باید عدد صحیح باشد`)
    .refine((m) => m % SLOT_MINUTES === 0, `${label} باید مضرب ${SLOT_MINUTES} دقیقه باشد`);

function normalizeRangeKeys(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  const r = raw as Record<string, unknown>;
  if (r.start_minute === undefined && r.startMinute !== undefined) {
    return { ...r, start_minute: r.startMinute, end_minute: r.endMinute };
  }
  return raw;
}

const WorkingHourRangeBase = z.object({
  weekday: z
    .number()
    .int()
    .min(0, 'روز هفته بین ۰ تا ۶ است')
    .max(6, 'روز هفته بین ۰ تا ۶ است'),
  start_minute: gridMinute('زمان شروع').refine(
    (m) => m >= 0 && m < 1440,
    'زمان شروع باید کمتر از ۲۴:۰۰ باشد'
  ),
  end_minute: gridMinute('زمان پایان').refine(
    (m) => m > 0 && m <= 1440,
    'زمان پایان باید بین ۰۰:۰۱ تا ۲۴:۰۰ باشد'
  )
});

export const WorkingHourRangeSchema = z.preprocess(
  normalizeRangeKeys,
  WorkingHourRangeBase.refine((v) => v.end_minute > v.start_minute, {
    message: 'زمان پایان باید بعد از زمان شروع باشد',
    path: ['end_minute']
  })
);

export const NewWorkingHourSchema = z.preprocess(
  normalizeRangeKeys,
  WorkingHourRangeBase.extend({ staff_id: UuidSchema }).refine((v) => v.end_minute > v.start_minute, {
    message: 'زمان پایان باید بعد از زمان شروع باشد',
    path: ['end_minute']
  })
);

export const ReplaceWeekSchema = z.object({
  items: z.array(WorkingHourRangeSchema).max(70, 'حداکثر ۷۰ بازه در هفته مجاز است')
});

export const DashboardTodayQuerySchema = z.object({
  date: TehranYmdSchema.optional().default(() => tehranTodayYmd())
});

export const DashboardSummaryQuerySchema = z
  .object({
    from: TehranYmdSchema,
    to: TehranYmdSchema
  })
  .refine((v) => v.from <= v.to, { message: 'بازه تاریخ نامعتبر است', path: ['to'] })
  .refine(
    (v) => Date.parse(v.to) - Date.parse(v.from) <= 366 * 24 * 60 * 60 * 1000,
    { message: 'بازه بیش از یک سال است', path: ['to'] }
  );

export const ConflictCheckSchema = z.object({
  staff_id: UuidSchema,
  start_at: IsoDateTimeSchema,
  end_at: IsoDateTimeSchema,
  exclude_id: UuidSchema.optional()
});

export const NotificationListQuerySchema = z.object({
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  student_id: UuidSchema.optional(),
  appointment_id: UuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50)
});

export const UpsertPrefsSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS).optional(),
  chat_id: z.string().min(1).max(64).nullable().optional(),
  reminders_enabled: z.boolean().optional(),
  reminder_hours_before: z.number().int().min(1).max(48).optional()
});

export const CreateLinkSchema = z.object({
  student_id: UuidSchema
});

export const TestMessageSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  recipient: z.string().min(1).max(64),
  text: z.string().min(1).max(1000).optional()
});

export const ReplaceCenterHoursSchema = z.object({
  items: z.array(WorkingHourRangeSchema).max(70, 'حداکثر ۷۰ بازه در هفته مجاز است')
});

export const UpdateSettingsSchema = z.object({
  clinic_name: z.string().min(2, 'نام مرکز حداقل ۲ نویسه است').max(120).optional(),
  default_reminder_hours: z.number().int().min(1).max(48).optional(),
  notify_on_create: z.boolean().optional(),
  notify_on_move: z.boolean().optional(),
  notify_on_cancel: z.boolean().optional(),
  notify_digest: z.boolean().optional(),
  notify_waitlist: z.boolean().optional(),
  clinic_phone: z.string().max(30, 'شماره تماس حداکثر ۳۰ نویسه است').optional(),
  bot_username: z
    .string()
    .max(65, 'نام کاربری بات حداکثر ۶۴ نویسه است')
    .regex(/^@?[A-Za-z0-9_]*$/, 'نام کاربری بات فقط حروف لاتین، رقم و خط زیر است')
    .optional(),
  notify_batch_hour: z
    .number()
    .int()
    .min(0, 'ساعت ارسال باید بین ۰ تا ۲۳ باشد')
    .max(23, 'ساعت ارسال باید بین ۰ تا ۲۳ باشد')
    .optional(),
  screening_targets: z
    .array(
      z
        .object({
          year: z.number().int().min(1300, 'سال شمسی نامعتبر است').max(1500, 'سال شمسی نامعتبر است'),
          month: z.number().int().min(1).max(12).nullable(),
          target: z
            .number()
            .int('هدف باید عدد صحیح باشد')
            .min(1, 'هدف حداقل ۱ سنجش است')
            .max(1000000),
          title: z.string().trim().max(80, 'عنوان هدف حداکثر ۸۰ نویسه است').nullable().optional(),
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ شروع باید YYYY-MM-DD باشد').nullable().optional(),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ پایان باید YYYY-MM-DD باشد').nullable().optional()
        })
        .superRefine((v, ctx) => {
          const hasFrom = typeof v.from === 'string' && v.from.length > 0;
          const hasTo = typeof v.to === 'string' && v.to.length > 0;
          if (hasFrom !== hasTo) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'هر دو تاریخ «از» و «تا» باید با هم وارد شوند' });
            return;
          }
          if (hasFrom && hasTo) {
            if (v.month !== null && v.month !== undefined) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'بازهٔ سفارشی با «ماه» جمع‌شدنی نیست — یکی را انتخاب کنید' });
            }
            if (v.from! > v.to!) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد' });
            }
            const fy = Number(v.from!.slice(0, 4));
            if (!Number.isInteger(fy) || fy < 1900 || fy > 2100) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'سال بازهٔ سفارشی خارج از محدودهٔ مجاز است' });
            }
          }
        })
    )
    .max(SCREENING_TARGETS_MAX, `حداکثر ${SCREENING_TARGETS_MAX} بازه مجاز است`)
    .optional()
});

const ScoringWeightField = z
  .number({ invalid_type_error: 'وزن باید عدد باشد' })
  .int('وزن باید عدد صحیح باشد')
  .min(0, 'وزن نمی‌تواند منفی باشد')
  .max(10000, 'وزن حداکثر ۱۰۰۰۰ است');

export const ScoringWeightsSchema = z.object({
  exercises: ScoringWeightField,
  packages: ScoringWeightField,
  templates: ScoringWeightField,
  forms: ScoringWeightField,
  exerciseUses: ScoringWeightField,
  templateUses: ScoringWeightField,
  formFills: ScoringWeightField,
  exerciseRefs: ScoringWeightField,
  templateRefs: ScoringWeightField,
  formRefs: ScoringWeightField,
  base_action: ScoringWeightField,
  admin_cap: z
    .number({ invalid_type_error: 'سقف باید عدد باشد' })
    .int('سقف باید عدد صحیح باشد')
    .min(0, 'سقف نمی‌تواند منفی باشد')
    .max(100000, 'سقف حداکثر ۱۰۰۰۰۰ است')
});

export const ScoringConfigSchema = z.object({
  epoch_ymd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ شروع باید YYYY-MM-DD باشد')
    .refine((v) => {
      const y = Number(v.slice(0, 4));
      const m = Number(v.slice(5, 7));
      const d = Number(v.slice(8, 10));
      if (!Number.isInteger(y) || y < 2020 || y > 2100) return false;
      if (!Number.isInteger(m) || m < 1 || m > 12) return false;
      if (!Number.isInteger(d) || d < 1 || d > 31) return false;
      return !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
    }, 'تاریخ شروع نامعتبر است'),
  weights: ScoringWeightsSchema
});

export const NewApiKeySchema = z.object({
  name: z.string().trim().min(2, 'نام کلید حداقل ۲ نویسه است').max(60),
  role: StaffRoleSchema
});

export const NewTagSchema = z.object({
  name: z.string().trim().min(2, 'نام برچسب حداقل ۲ نویسه است').max(60),
  category: z.enum(TAG_CATEGORIES),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'رنگ باید کد HEX معتبر باشد')
    .optional()
});

export const ReplaceStudentTagsSchema = z.object({
  tag_ids: z.array(UuidSchema).max(MAX_TAGS_PER_STUDENT, `حداکثر ${MAX_TAGS_PER_STUDENT} برچسب مجاز است`)
});

export const SearchQuerySchema = z.object({
  q: z.string().max(SEARCH_QUERY_MAX_LENGTH * 2, 'عبارت جستجو بیش از حد طولانی است').optional().default('')
});

export const MarkStaffAttendanceSchema = z.object({
  staff_id: UuidSchema,
  date: TehranYmdSchema,
  status: z.enum(STAFF_ATTENDANCE_STATUSES),
  note: z.string().trim().max(STAFF_ATTENDANCE_NOTE_MAX, 'یادداشت بیش از حد طولانی است').optional()
});

export const StaffAttendanceQuerySchema = z
  .object({
    from: TehranYmdSchema,
    to: TehranYmdSchema,
    staff_id: UuidSchema.optional()
  })
  .refine((v) => v.from <= v.to, { message: 'بازه تاریخ نامعتبر است', path: ['to'] })
  .refine(
    (v) => Date.parse(v.to) - Date.parse(v.from) <= STAFF_ATTENDANCE_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000,
    { message: 'بازه بیش از یک سال است', path: ['to'] }
  );

export const StaffAttendanceDayQuerySchema = z.object({
  date: TehranYmdSchema.optional().default(() => tehranTodayYmd())
});

export const ReportQuerySchema = z
  .object({
    from: TehranYmdSchema,
    to: TehranYmdSchema
  })
  .refine((v) => v.from <= v.to, { message: 'بازه تاریخ نامعتبر است', path: ['to'] })
  .refine(
    (v) => Date.parse(v.to) - Date.parse(v.from) <= 366 * 24 * 60 * 60 * 1000,
    { message: 'بازه بیش از یک سال است', path: ['to'] }
  );

export const NewAnnouncementSchema = z.object({
  title: z.string().trim().min(2, 'عنوان حداقل ۲ نویسه است').max(ANNOUNCEMENT_TITLE_MAX),
  body: z.string().trim().min(2, 'متن اعلان حداقل ۲ نویسه است').max(ANNOUNCEMENT_BODY_MAX),
  show_login: z.boolean().optional().default(false),
  show_panel: z.boolean().optional().default(false)
});

export const UpdateAnnouncementSchema = z.object({
  title: z.string().trim().min(2, 'عنوان حداقل ۲ نویسه است').max(ANNOUNCEMENT_TITLE_MAX).optional(),
  body: z.string().trim().min(2, 'متن اعلان حداقل ۲ نویسه است').max(ANNOUNCEMENT_BODY_MAX).optional(),
  show_login: z.boolean().optional(),
  show_panel: z.boolean().optional(),
  active: z.boolean().optional()
});

export const SendAnnouncementSchema = z.object({
  target: z.enum(['staff', 'families'])
});

export const NewKnowledgeSchema = z.object({
  title: z.string().trim().min(2, 'عنوان حداقل ۲ نویسه است').max(KNOWLEDGE_TITLE_MAX),
  body: z.string().trim().min(2, 'متن مقاله حداقل ۲ نویسه است').max(KNOWLEDGE_BODY_MAX),
  category: z.enum(KNOWLEDGE_CATEGORIES).optional().default('tip'),
  pinned: z.boolean().optional().default(false),
  published: z.boolean().optional().default(true)
});

export const UpdateKnowledgeSchema = z.object({
  title: z.string().trim().min(2, 'عنوان حداقل ۲ نویسه است').max(KNOWLEDGE_TITLE_MAX).optional(),
  body: z.string().trim().min(2, 'متن مقاله حداقل ۲ نویسه است').max(KNOWLEDGE_BODY_MAX).optional(),
  category: z.enum(KNOWLEDGE_CATEGORIES).optional(),
  pinned: z.boolean().optional(),
  published: z.boolean().optional()
});

export const CreateClassLinkSchema = z.object({
  class_id: UuidSchema
});

export const TeacherReportSchema = z.object({
  student_id: UuidSchema,
  text: z.string().trim().min(2, 'متن گزارش حداقل ۲ نویسه است').max(2000)
});

export const WorkingDayQuerySchema = z.object({
  date: TehranYmdSchema.optional().default(() => tehranTodayYmd())
});

export const NewDayNoteSchema = z.object({
  date: TehranYmdSchema,
  body: z
    .string()
    .trim()
    .min(2, 'متن توضیحات حداقل ۲ نویسه است')
    .max(DAY_NOTE_BODY_MAX, 'متن توضیحات بیش از حد طولانی است')
});

export const SaveSessionNoteSchema = z.object({
  session_note: z
    .string()
    .max(SESSION_NOTE_MAX, `متن گزارش جلسه بیش از ${SESSION_NOTE_MAX} نویسه است`)
    .default(''),
  next_action: z.enum(NEXT_ACTION_VALUES).default('none')
});

export const WaitlistSourceSchema = z.enum(WAITLIST_SOURCES);
export const WaitlistPrioritySchema = z.enum(WAITLIST_PRIORITIES);
export const WaitlistStatusSchema = z.enum(WAITLIST_STATUSES);

export const NewWaitlistSchema = z.object({
  first_name: z.string().min(1, 'نام لازم است').max(WAITLIST_NAME_MAX),
  last_name: z.string().min(1, 'نام خانوادگی لازم است').max(WAITLIST_NAME_MAX),
  phone: GuardianPhoneSchema,
  national_id: NationalIdSchema.optional(),
  birth_date: TehranYmdSchema.optional(),
  school_id: UuidSchema.optional(),
  class_id: UuidSchema.optional(),
  source: WaitlistSourceSchema.default('self'),
  service_type: z.string().max(WAITLIST_SERVICE_TYPE_MAX).optional(),
  note: z.string().max(WAITLIST_NOTE_MAX).optional(),
  priority: WaitlistPrioritySchema.default('normal'),
  student_id: UuidSchema.optional()
});

export const UpdateWaitlistSchema = z.object({
  first_name: z.string().min(1).max(WAITLIST_NAME_MAX).optional(),
  last_name: z.string().min(1).max(WAITLIST_NAME_MAX).optional(),
  phone: GuardianPhoneSchema.optional(),
  national_id: NationalIdSchema.nullable().optional(),
  birth_date: TehranYmdSchema.nullable().optional(),
  school_id: UuidSchema.nullable().optional(),
  class_id: UuidSchema.nullable().optional(),
  source: WaitlistSourceSchema.optional(),
  service_type: z.string().max(WAITLIST_SERVICE_TYPE_MAX).nullable().optional(),
  note: z.string().max(WAITLIST_NOTE_MAX).nullable().optional(),
  priority: WaitlistPrioritySchema.optional()
});

export const WaitlistCallSchema = z.object({
  note: z.string().max(WAITLIST_NOTE_MAX).optional()
});

export const StudentWaitStatusSchema = z.object({
  awaiting: z.boolean(),
  source: WaitlistSourceSchema.default('self'),
  service_type: z.string().max(WAITLIST_SERVICE_TYPE_MAX).optional(),
  priority: WaitlistPrioritySchema.default('normal')
});

export const WaitlistScheduleSchema = z.object({
  staff_id: UuidSchema,
  start_at: SlotAlignedTimeSchema,
  end_at: SlotAlignedTimeSchema,
  student_id: UuidSchema.optional(),
  national_id: NationalIdSchema.optional(),
  note: z.string().max(500).optional()
});

export const WaitlistReorderSchema = z.object({
  ids: z.array(UuidSchema).min(1, 'فهرست ترتیب خالی است').max(WAITLIST_LIST_LIMIT)
});

export const FollowUpStatusSchema = z.enum(FOLLOWUP_STATUSES);
export const FollowUpEntityTypeSchema = z.enum(FOLLOWUP_ENTITY_TYPES);

export const NewFollowUpSchema = z.object({
  entity_type: FollowUpEntityTypeSchema,
  entity_id: z.string().min(1, 'شناسهٔ موجودیت لازم است').max(64),
  student_id: UuidSchema.nullable().optional(),
  title: z
    .string()
    .trim()
    .min(2, 'عنوان پیگیری حداقل ۲ نویسه است')
    .max(FOLLOWUP_TITLE_MAX, `عنوان پیگیری بیش از ${FOLLOWUP_TITLE_MAX} نویسه است`),
  assignee_id: UuidSchema,
  due_at: IsoDateTimeSchema.nullable().optional()
});

export const UpdateFollowUpSchema = z
  .object({
    status: FollowUpStatusSchema.optional(),
    assignee_id: UuidSchema.optional(),
    due_at: IsoDateTimeSchema.nullable().optional()
  })
  .refine(
    (v) => v.status !== undefined || v.assignee_id !== undefined || v.due_at !== undefined,
    { message: 'حداقل یکی از وضعیت/مسئول/مهلت باید ارسال شود' }
  );

export const TodoPrioritySchema = z.enum(TODO_PRIORITIES);
export const TodoStatusSchema = z.enum(TODO_STATUSES);
export const TodoBoxSchema = z.enum(TODO_BOXES);

export const TodoDueAtSchema = z
  .string()
  .trim()
  .min(1, 'مهلت خالی است')
  .max(40, 'مهلت نامعتبر است')
  .refine(
    (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isNaN(Date.parse(v)),
    { message: 'مهلت باید تاریخ (YYYY-MM-DD) یا زمان ISO معتبر باشد' }
  );

export const TodoChecklistItemSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'مورد چک‌لیست خالی است')
    .max(TODO_CHECKLIST_ITEM_MAX, `مورد چک‌لیست بیش از ${TODO_CHECKLIST_ITEM_MAX} نویسه است`),
  done: z.boolean()
});

export const NewTodoSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'عنوان کار حداقل ۲ نویسه است')
    .max(TODO_TITLE_MAX, `عنوان کار بیش از ${TODO_TITLE_MAX} نویسه است`),
  note: z
    .string()
    .trim()
    .max(TODO_NOTE_MAX, `توضیح بیش از ${TODO_NOTE_MAX} نویسه است`)
    .nullable()
    .optional(),
  assignee_id: UuidSchema,
  due_at: TodoDueAtSchema.nullable().optional(),
  priority: TodoPrioritySchema.optional(),
  checklist: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'مورد چک‌لیست خالی است')
        .max(TODO_CHECKLIST_ITEM_MAX, `مورد چک‌لیست بیش از ${TODO_CHECKLIST_ITEM_MAX} نویسه است`)
    )
    .max(TODO_CHECKLIST_MAX, `چک‌لیست بیش از ${TODO_CHECKLIST_MAX} مورد ندارد`)
    .optional()
});

export const UpdateTodoSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, 'عنوان کار حداقل ۲ نویسه است')
      .max(TODO_TITLE_MAX, `عنوان کار بیش از ${TODO_TITLE_MAX} نویسه است`)
      .optional(),
    note: z
      .string()
      .trim()
      .max(TODO_NOTE_MAX, `توضیح بیش از ${TODO_NOTE_MAX} نویسه است`)
      .nullable()
      .optional(),
    due_at: TodoDueAtSchema.nullable().optional(),
    priority: TodoPrioritySchema.optional(),
    checklist: z.array(TodoChecklistItemSchema).max(TODO_CHECKLIST_MAX, `چک‌لیست بیش از ${TODO_CHECKLIST_MAX} مورد ندارد`).nullable().optional(),
    deleted: z.boolean().optional()
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.note !== undefined ||
      v.due_at !== undefined ||
      v.priority !== undefined ||
      v.checklist !== undefined ||
      v.deleted !== undefined,
    { message: 'حداقل یک فیلد برای ویرایش لازم است' }
  );

export const CaseStatusSchema = z.enum(STUDENT_CASE_STATUSES);

export const ChangeCaseStatusSchema = z.object({
  case_status: CaseStatusSchema
});

export const ChangePathwaySchema = z.object({
  pathway: PathwaySchema.nullable()
});

export const ChangeOwnerSchema = z.object({
  owner_staff_id: UuidSchema.nullable()
});

export const SpecialNeedTypeSchema = z.enum(SPECIAL_NEED_TYPES);
export const SpecialNeedSeveritySchema = z.enum(SPECIAL_NEED_SEVERITIES);

export const ChangeSpecialNeedSchema = z.object({
  special_need_type: SpecialNeedTypeSchema.nullable(),
  special_need_severity: SpecialNeedSeveritySchema.nullable(),
  identified_at: IsoDateTimeSchema.nullable().optional()
}).refine(
  (v) => !(v.special_need_type === null && v.special_need_severity !== null),
  { message: 'شدت بدون نوع نیاز ویژه معنا ندارد' }
);

export const ExerciseFormatSchema = z.enum(EXERCISE_FORMATS);

export const ExerciseFileSchema = z.object({
  filename: z.string().trim().min(1, 'نام فایل الزامی است').max(200, 'نام فایل حداکثر ۲۰۰ نویسه است'),
  mime_type: z.string().trim().min(3, 'نوع فایل الزامی است').max(120),
  content_b64: z.string().min(1, 'محتوای فایل الزامی است').max(1_200_000, 'حجم فایل بیش از حد مجاز است')
});

export const NewExerciseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'عنوان تمرین حداقل ۲ نویسه است')
    .max(EXERCISE_TITLE_MAX, `عنوان تمرین بیش از ${EXERCISE_TITLE_MAX} نویسه است`),
  description: z
    .string()
    .trim()
    .max(EXERCISE_DESCRIPTION_MAX, `توضیح بیش از ${EXERCISE_DESCRIPTION_MAX} نویسه است`)
    .nullable()
    .optional(),
  format: ExerciseFormatSchema.default('worksheet'),
  external_url: z
    .string()
    .trim()
    .max(500, 'لینک بیش از ۵۰۰ نویسه است')
    .refine((v) => v === '' || /^https?:\/\//i.test(v), 'لینک باید با http:// یا https:// شروع شود')
    .nullable()
    .optional(),
  tag_ids: z.array(UuidSchema).max(10, 'حداکثر ۱۰ برچسب برای هر تمرین').optional().default([]),
  co_created_by: UuidSchema.nullable().optional(),
  published: z.boolean().optional().default(true),
  file: ExerciseFileSchema.nullable().optional()
});

export const UpdateExerciseSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, 'عنوان تمرین حداقل ۲ نویسه است')
      .max(EXERCISE_TITLE_MAX, `عنوان تمرین بیش از ${EXERCISE_TITLE_MAX} نویسه است`)
      .optional(),
    description: z
      .string()
      .trim()
      .max(EXERCISE_DESCRIPTION_MAX, `توضیح بیش از ${EXERCISE_DESCRIPTION_MAX} نویسه است`)
      .nullable()
      .optional(),
    format: ExerciseFormatSchema.optional(),
    external_url: z
      .string()
      .trim()
      .max(500, 'لینک بیش از ۵۰۰ نویسه است')
      .refine((v) => v === '' || /^https?:\/\//i.test(v), 'لینک باید با http:// یا https:// شروع شود')
      .nullable()
      .optional(),
    tag_ids: z.array(UuidSchema).max(10, 'حداکثر ۱۰ برچسب برای هر تمرین').optional(),
    co_created_by: UuidSchema.nullable().optional(),
    published: z.boolean().optional()
  })
  .strip()
  .refine(
    (v) => v.title !== undefined || v.description !== undefined || v.format !== undefined || v.external_url !== undefined || v.tag_ids !== undefined || v.co_created_by !== undefined || v.published !== undefined,
    { message: 'حداقل یک فیلد برای ویرایش لازم است' }
  );

export const ReassignExerciseSchema = z.object({
  staffId: UuidSchema,
  reason: z.string().trim().max(500, 'دلیل انتقال بیش از ۵۰۰ نویسه است').optional()
});

export const ReplaceExerciseFileSchema = z.object({
  filename: z.string().trim().min(1, 'نام فایل الزامی است').max(200, 'نام فایل حداکثر ۲۰۰ نویسه است'),
  mime_type: z.string().trim().min(3, 'نوع فایل الزامی است').max(120),
  content_b64: z.string().min(1, 'محتوای فایل الزامی است').max(1_200_000, 'حجم فایل بیش از حد مجاز است')
});

export const NewExercisePackageSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'عنوان بسته حداقل ۲ نویسه است')
    .max(EXERCISE_PACKAGE_TITLE_MAX, `عنوان بسته بیش از ${EXERCISE_PACKAGE_TITLE_MAX} نویسه است`),
  description: z
    .string()
    .trim()
    .max(EXERCISE_DESCRIPTION_MAX, `توضیح بیش از ${EXERCISE_DESCRIPTION_MAX} نویسه است`)
    .nullable()
    .optional(),
  exercise_ids: z
    .array(UuidSchema)
    .min(1, 'حداقل یک تمرین برای بسته لازم است')
    .max(MAX_EXERCISE_PACKAGE_ITEMS, `حداکثر ${MAX_EXERCISE_PACKAGE_ITEMS} تمرین در هر بسته`),
  tag_ids: z.array(UuidSchema).max(MAX_EXERCISE_PACKAGE_TAGS, `حداکثر ${MAX_EXERCISE_PACKAGE_TAGS} برچسب برای هر بسته`).optional().default([]),
  published: z.boolean().optional().default(true)
});

export const UpdateExercisePackageSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, 'عنوان بسته حداقل ۲ نویسه است')
      .max(EXERCISE_PACKAGE_TITLE_MAX, `عنوان بسته بیش از ${EXERCISE_PACKAGE_TITLE_MAX} نویسه است`)
      .optional(),
    description: z
      .string()
      .trim()
      .max(EXERCISE_DESCRIPTION_MAX, `توضیح بیش از ${EXERCISE_DESCRIPTION_MAX} نویسه است`)
      .nullable()
      .optional(),
    exercise_ids: z
      .array(UuidSchema)
      .min(1, 'حداقل یک تمرین برای بسته لازم است')
      .max(MAX_EXERCISE_PACKAGE_ITEMS, `حداکثر ${MAX_EXERCISE_PACKAGE_ITEMS} تمرین در هر بسته`)
      .optional(),
    tag_ids: z.array(UuidSchema).max(MAX_EXERCISE_PACKAGE_TAGS, `حداکثر ${MAX_EXERCISE_PACKAGE_TAGS} برچسب برای هر بسته`).optional(),
    published: z.boolean().optional()
  })
  .refine(
    (v) => v.title !== undefined || v.description !== undefined || v.exercise_ids !== undefined || v.tag_ids !== undefined || v.published !== undefined,
    { message: 'حداقل یک فیلد برای ویرایش لازم است' }
  );

export const CreateExerciseBatchSchema = z
  .object({
    package_id: UuidSchema.nullable().optional(),
    exercise_ids: z
      .array(UuidSchema)
      .max(MAX_EXERCISE_BATCH_ITEMS, `حداکثر ${MAX_EXERCISE_BATCH_ITEMS} تمرین در هر ارسال`)
      .optional()
      .default([]),
    note: z
      .string()
      .trim()
      .max(EXERCISE_BATCH_NOTE_MAX, `یادداشت بیش از ${EXERCISE_BATCH_NOTE_MAX} نویسه است`)
      .nullable()
      .optional()
  })
  .refine((v) => Boolean(v.package_id) || v.exercise_ids.length > 0, {
    message: 'یا بستهٔ آماده را انتخاب کنید یا حداقل یک تمرین'
  });

export const SCREENING_NAME_MAX = 80;
export const SCREENING_TAGS_MAX = 12;

const ScreeningTagSchema = z
  .string()
  .trim()
  .min(1, 'برچسب خالی مجاز نیست')
  .max(60, 'برچسب حداکثر ۶۰ نویسه است');

export const ScreeningCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'نام و فامیل حداقل ۲ نویسه است')
    .max(SCREENING_NAME_MAX, `نام و فامیل حداکثر ${SCREENING_NAME_MAX} نویسه است`),
  tags: z.array(ScreeningTagSchema).max(SCREENING_TAGS_MAX, `حداکثر ${SCREENING_TAGS_MAX} برچسب`).default([]),
  day: TehranYmdSchema.optional()
});

export const ScreeningUpdateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'نام و فامیل حداقل ۲ نویسه است')
      .max(SCREENING_NAME_MAX, `نام و فامیل حداکثر ${SCREENING_NAME_MAX} نویسه است`)
      .optional(),
    tags: z.array(ScreeningTagSchema).max(SCREENING_TAGS_MAX, `حداکثر ${SCREENING_TAGS_MAX} برچسب`).optional()
  })
  .refine((v) => v.name !== undefined || v.tags !== undefined, {
    message: 'حداقل یک فیلد برای ویرایش لازم است'
  });

export const ScreeningQuerySchema = z.object({
  from: TehranYmdSchema.optional(),
  to: TehranYmdSchema.optional(),
  q: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(800).optional()
});
