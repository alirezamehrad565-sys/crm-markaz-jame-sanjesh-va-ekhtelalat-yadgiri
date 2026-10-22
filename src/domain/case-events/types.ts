/**
 * ماژول رویدادساز (فرم/پرسش‌نامه/چک‌لیست) — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// رویدادهای پرونده (تایم‌لاین + گزارش‌نویسی جلسات)
// کاتالوگ انواع با فرم‌ساز پنل ساخته می‌شود (تصمیم ۱ طراحی) و هر رویداد
// با payload ساخت‌یافته روی تایم‌لاین دانش‌آموز می‌نشیند (تصمیم ۲ — ثبت هنگام گزارش).

import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';

/** دستهٔ رویداد — enum منبع حقیقت این‌جاست (الگوی D7 — بدون CHECK در SQL) */
export const CASE_EVENT_CATEGORIES = ['session', 'checklist', 'note'] as const;
export type CaseEventCategory = (typeof CASE_EVENT_CATEGORIES)[number];

/** — مخاطب چک‌لیست: خانواده (بله ولیّ‌ها) / معلم (چت کلاس) / هر دو */
export const CASE_EVENT_AUDIENCES = ['family', 'teacher', 'both'] as const;
export type CaseEventAudience = (typeof CASE_EVENT_AUDIENCES)[number];

export const CASE_EVENT_AUDIENCE_LABELS: Record<CaseEventAudience, string> = {
  family: 'خانواده',
  teacher: 'معلم کلاس',
  both: 'خانواده و معلم'
};

export const CASE_EVENT_CATEGORY_LABELS: Record<CaseEventCategory, string> = {
  session: 'جلسه',
  checklist: 'چک‌لیست',
  note: 'یادداشت'
};

/** نوع فیلد فرم — فرم‌ساز پنل و ویزارد بات هر دو از همین قرارداد مصرف می‌کنند
 *: +single — گزینه‌ای با نمرهٔ اختصاصی هر گزینه (فقط دستهٔ چک‌لیست — روان‌سنجی)
 *: +heading — سربرگ بخش‌بندی فرم‌های بلند (شرح‌حال) — بدون مقدار، فقط رندر؛
 * در چک‌لیست مجاز نیست (چک‌لیست فقط آیتم نمره‌دار — pure.validateTypeDefinition)
 */
export const CASE_EVENT_FIELD_TYPES = ['text', 'longtext', 'number', 'select', 'scale', 'single', 'heading'] as const;
export type CaseEventFieldType = (typeof CASE_EVENT_FIELD_TYPES)[number];

/** — گزینهٔ نمره‌دار — نمره از نگاه خانواده پنهان است (روان‌سنجی) */
export interface CaseEventScoredOption {
  label: string;
  score: number;
}

/** — زیرمقیاس چک‌لیست (JSON در case_event_types.subscales)
 * excludeFromTotal: مثل مقیاس نقاط قوت SDQ که نباید در نمرهٔ کل دشواری‌ها جمع شود
 */
export interface CaseEventSubscale {
  id: string;
  name: string;
  excludeFromTotal?: boolean;
  /** باندهای مستقل زیرمقیاس (صعودی بر حسب max — می‌تواند جهت معکوس داشته باشد) */
  bands?: CaseEventBand[] | null;
}

/** — رنگ استاندارد باند برای نمایش و تفسیر خودکار */
export const CASE_EVENT_BAND_COLORS = ['ok', 'warn', 'danger'] as const;
export type CaseEventBandColor = (typeof CASE_EVENT_BAND_COLORS)[number];

/** وضعیت رویداد — ماتریس ترنزیشن در pure.ts — پیش‌نویس گزارش جلسه */
export const CASE_EVENT_STATUSES = ['draft', 'completed', 'pending_family', 'cancelled'] as const;
export type CaseEventStatus = (typeof CASE_EVENT_STATUSES)[number];

export const CASE_EVENT_STATUS_LABELS: Record<CaseEventStatus, string> = {
  draft: 'پیش‌نویس',
  completed: 'ثبت‌شده',
  pending_family: 'در انتظار خانواده',
  cancelled: 'لغوشده'
};

/** تعریف یک فیلد فرم (JSON در case_event_types.fields)
 * — نمره‌گذاری حرفه‌ای روان‌سنجی:
 * - scoredOptions: فقط single — نمرهٔ اختصاصی هر گزینه
 * - reverse: فقط scale — آیتم مثبت‌گویی که معکوس نمره می‌گیرد (score = scaleMax - raw)
 * - critical: آیتم بحرانی — مستقل از جمع کل پرچم می‌زند (نشانهٔ خط قرمز بالینی)
 * - criticalMin: آستانهٔ پرچم (پیش‌فرض = ماکسیمم آیتم)
 * - subscaleId: عضویت در زیرمقیاس
 */
export interface CaseEventField {
  key: string;
  label: string;
  type: CaseEventFieldType;
  /** فقط select — گزینه‌های مجاز */
  options?: string[];
  /** فقط single — گزینه‌های نمره‌دار (نمره از گیرنده پنهان) */
  scoredOptions?: CaseEventScoredOption[];
  /** فقط scale — سقف نمره (پیش‌فرض ۳) */
  scaleMax?: number;
  /** — برچسب‌های کلامی نمرهٔ ۰ تا scaleMax (لنگر پاسخ مطابق ابزار مرجع).
   * مثال SDQ: «اصلاً درست نیست / تا حدی درست است / کاملاً درست است».
   * پنل و وب‌فرم با همین برچسب‌ها چیپ نمایش می‌دهند؛ نمرهٔ ذخیره‌شده عددی می‌ماند
   * و موتور نمره‌گذاری v2 بی‌تغییر است.
   */
  scaleLabels?: string[];
  required?: boolean;
  /** — آیتم معکوس (فقط scale) */
  reverse?: boolean;
  /** — آیتم بحرانی (فقط نوع نمره‌دار) */
  critical?: boolean;
  /** — آستانهٔ پرچم بحرانی (پیش‌فرض ماکسیمم آیتم) */
  criticalMin?: number;
  /** — زیرمقیاس */
  subscaleId?: string | null;
}

/** باند تحلیل چک‌لیست (JSON در case_event_types.bands) — صعودی بر حسب max
 *: +color (نمایش و تفسیر خودکار) +advice (توصیهٔ خودکار باند)
 */
export interface CaseEventBand {
  max: number;
  label: string;
  /** — ok | warn | danger */
  color?: CaseEventBandColor | null;
  /** — تفسیر/توصیهٔ خودکار باند (حداکثر ۴۰۰ نویسه) */
  advice?: string | null;
}

/** تحلیل چک‌لیست (JSON در case_events.analysis)
 * — فیلدهای v2 همه اختیاری‌اند تا رکوردهای قدیمی معتبر بمانند
 */
export interface CaseEventAnalysis {
  score: number;
  band: string | null;
  answered: number;
  total: number;
  /** حداکثر نمرهٔ ممکن — جمع ماکسیمم آیتم‌ها (برای نمایش «از N») */
  maxScore: number;
  /** — نمرهٔ هر زیرمقیاس + باند مستقل آن */
  subscaleScores?: CaseEventSubscaleScore[];
  /** — آیتم‌های بحرانی پرچم‌خورده */
  flags?: CaseEventFlag[];
  /** — تفسیر خودکار موتور تشخیص (متن فارسی) */
  interpretation?: string | null;
}

/** نمرهٔ یک زیرمقیاس در تحلیل */
export interface CaseEventSubscaleScore {
  id: string;
  name: string;
  score: number;
  max: number;
  band: string | null;
  color?: CaseEventBandColor | null;
}

/** یک آیتم بحرانی پرچم‌خورده */
export interface CaseEventFlag {
  key: string;
  label: string;
  value: number;
}

export interface CaseEventTypeRecord {
  id: string;
  key: string;
  title: string;
  /** — معرفی روایی فرم (یک تا دو جملهٔ ساده برای انتخابگر و سربرگ فرم) */
  description: string | null;
  category: CaseEventCategory;
  icon: string | null;
  familyFillable: boolean;
  fields: CaseEventField[];
  bands: CaseEventBand[] | null;
  /** — زیرمقیاس‌های چک‌لیست (null = بدون زیرمقیاس — سازگار با قالب‌های قدیمی) */
  subscales: CaseEventSubscale[] | null;
  /** — برچسب‌های اختلال/پایهٔ قالب (tag id) — مبنای پیشنهاد هوشمند */
  tags: string[];
  /** — مخاطب چک‌لیست */
  audience: CaseEventAudience;
  active: boolean;
  /** — ابزار سیستمی باتری بالینی: از پنل قابل ویرایش/غیرفعال‌سازی/حذف نیست (فقط نسخهٔ کد) */
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

/** پیوست رویداد پرونده */
export interface CaseEventFileMeta {
  id: string;
  caseEventId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdBy: string | null;
  createdAt: string;
}

export interface CaseEventRecord {
  id: string;
  eventTypeId: string;
  typeTitle: string;
  typeCategory: CaseEventCategory;
  typeIcon: string | null;
  typeBands: CaseEventBand[] | null;
  /** — مخاطب نوع (family | teacher | both) — برای شفافیت «چه کسی فرم را پر می‌کند» */
  typeAudience: CaseEventAudience;
  /** — آیا گیرنده (خانواده/معلم) می‌تواند خودش پر کند؟ — سه‌هدف درمانگر/خانواده/معلم */
  typeFamilyFillable: boolean;
  studentId: string;
  staffId: string | null;
  staffName: string | null;
  appointmentId: string | null;
  occurredAt: string;
  status: CaseEventStatus;
  payload: Record<string, { value: string; label: string }> | null;
  analysis: CaseEventAnalysis | null;
  summary: string | null;
  fillExpiresAt: string | null;
  /** — آخرین ارسال پیام بله + شمارش کل */
  sentAt: string | null;
  sentCount: number;
  createdAt: string;
  /** فقط در جزئیات — متادیتای پیوست‌ها (بدون محتوا) */
  files?: CaseEventFileMeta[];
}

export interface CaseEventTypeInput {
  title: string;
  /** — معرفی روایی فرم (اختیاری) */
  description?: string | null;
  category: CaseEventCategory;
  icon?: string | null;
  familyFillable?: boolean;
  fields: CaseEventField[];
  bands?: CaseEventBand[] | null;
  /** — زیرمقیاس‌های چک‌لیست */
  subscales?: CaseEventSubscale[] | null;
  /** — برچسب‌های قالب (tag id) */
  tags?: string[] | null;
  /** — مخاطب چک‌لیست (پیش‌فرض family) */
  audience?: CaseEventAudience | null;
}

export interface CaseEventInput {
  eventTypeId: string;
  studentId: string;
  appointmentId?: string | null;
  /** ISO UTC — پیش‌فرض اکنون */
  occurredAt?: string | null;
  /** مقادیر فرم به شکل {key: مقدار خام} — سرور به payload نهایی با label نگاشت می‌کند */
  values: Record<string, string | number | null>;
  /** — true = ذخیرهٔ پیش‌نویس (فیلدهای الزامی فعلاً چک نمی‌شوند؛ finalizeEvent اعتبارسنجی نهایی) */
  draft?: boolean;
}

export interface NewCaseEventFileInput {
  filename: string;
  mimeType: string;
  /** base64 خالص (بدون پیشوند data-URL) */
  contentB64: string;
}

/** محتوای باینری پیوست برای دانلود */
export interface CaseEventFileContent extends CaseEventFileMeta {
  bytes: Uint8Array;
}

export interface CaseEventDeps {
  db: DbClient;
  audit: import('@core/audit').AuditWriter;
  logger: import('@core/logger').Logger;
  /** انقضای توکن وب‌فرم خانواده (ساعت) — پیش‌فرض ۱۶۸ = ۷ روز */
  fillExpiryHours?: number;
  /** — هوک «اقدام بعدی»: ورود به follow_up در فیلد next_action → ساخت پیگیری در همان تراکنش */
  followups?: Pick<import('@domain/followups').FollowUpsService, 'createWithinTx'>;
  /** — نام دانش‌آموز برای عنوان پیگیری خودکار */
  studentNameOf?: (studentId: string) => Promise<string | null>;
  /** — آدرس عمومی سایت برای ساخت لینک وب‌فرم */
  publicBaseUrl?: string | null;
  now?: () => Date;
}

export interface CaseEventsService {
  // ─── کاتالوگ انواع ───
  listTypes(filters: { activeOnly?: boolean; category?: CaseEventCategory }): Promise<CaseEventTypeRecord[]>;
  getTypeById(id: string): Promise<CaseEventTypeRecord | null>;
  createType(input: CaseEventTypeInput, actor: AuthContext): Promise<CaseEventTypeRecord>;
  updateType(id: string, input: Partial<CaseEventTypeInput>, actor: AuthContext): Promise<CaseEventTypeRecord>;
  deactivateType(id: string, actor: AuthContext): Promise<boolean>;
  /** — حذف قالب (فقط مدیر) — فقط وقتی هیچ رویدادی به آن وصل نباشد؛ وگرنه غیرفعال‌سازی */
  deleteType(id: string, actor: AuthContext): Promise<boolean>;

  // ─── رویدادها ───
  listEventsByStudent(studentId: string, filters?: { limit?: number }): Promise<CaseEventRecord[]>;
  /** — رویدادهای متصل به یک نوبت (نشانگر «گزارش ثبت‌شده» در پنل) */
  listEventsByAppointment(appointmentId: string): Promise<CaseEventRecord[]>;
  /** — رویدادهای چند نوبت یک‌جا (نشانگر گزارش در «گزارش جلسات من») */
  listEventsByAppointments(appointmentIds: string[]): Promise<Map<string, CaseEventRecord[]>>;
  getEventById(id: string): Promise<CaseEventRecord | null>;
  createEvent(input: CaseEventInput, actor: AuthContext): Promise<CaseEventRecord>;
  /**
   * — T9/m152: ثبت چیپ غربالگری حسی (ابزار میکروی دوکلیکی تب شناسایی).
   * مسیر اختصاصی — رویداد completed با تحلیل باند ساخته می‌شود (نه pending_family)؛
   * type با کلید ce-sensory-chip-v1 در همان فراخوانی idempotent ensure می‌شود (بدون مایگریشن).
   */
  createSensoryChipEvent(studentId: string, input: { levels: Record<string, unknown> }, actor: AuthContext): Promise<CaseEventRecord>;
  updateEvent(id: string, input: { values?: Record<string, string | number | null>; summary?: string }, actor: AuthContext): Promise<CaseEventRecord>;
  /** — نهایی‌سازی پیش‌نویس: اعتبارسنجی الزامی + هوک اقدام بعدی */
  finalizeEvent(id: string, actor: AuthContext): Promise<CaseEventRecord>;
  cancelEvent(id: string, actor: AuthContext): Promise<CaseEventRecord>;
  /** — حذف نرم رویداد (فقط مدیر) — از همهٔ فهرست‌ها/تایم‌لاین/صف پنهان می‌شود؛ audit می‌ماند */
  deleteEvent(id: string, actor: AuthContext): Promise<void>;

  // ─── پیوست‌ها ───
  addEventFile(eventId: string, input: NewCaseEventFileInput, actor: AuthContext): Promise<CaseEventFileMeta>;
  listEventFiles(eventId: string): Promise<CaseEventFileMeta[]>;
  getEventFile(eventId: string, fileId: string): Promise<CaseEventFileContent>;
  deleteEventFile(eventId: string, fileId: string, actor: AuthContext): Promise<void>;

  // ─── حلقهٔ خانواده ───
  /** چت‌های ولیِّ متصل یک دانش‌آموز (bot_links + notification_prefs) */
  guardianChats(studentId: string): Promise<string[]>;
  /** — چت‌های معلم کلاسِ دانش‌آموز (class_bot_links متصل) */
  teacherChats(studentId: string): Promise<string[]>;

  // ─── موتور تشخیص و مداخله ───
  /** قالب‌های چک‌لیست مناسب دانش‌آموز — مرتب بر اساس هم‌پوشانی برچسب‌ها */
  suggestTypesForStudent(studentId: string): Promise<ChecklistSuggestion[]>;
  /** صف چک‌لیست‌های در انتظار پاسخ (پنل — رویدادساز تب دوم) */
  listPendingChecklists(): Promise<PendingChecklist[]>;
  /**
   * — ارسال با یک کلیک: پیام بله با لینک امن وب‌فرم برای خانواده/معلم.
   * T7: teacherName/teacherId اختیاری — لینک به نام معلم گره می‌خورد و پاسخ‌ها «پاسخ معلم: X» می‌گیرند؛
   * قالب پیام بله هم bot_teacher_package_link می‌شود.
   * خروجی: { sent, targets, link } — sent از طریق observer (notify) واقعی شمرده می‌شود؛ link برای کپی.
   */
  sendChecklistLink(eventId: string, input: { audience?: CaseEventAudience | null; note?: string | null; teacherName?: string | null; teacherId?: string | null }, actor: AuthContext): Promise<{ sent: number; targets: string[]; link: string | null }>;
  /**
   * — T7: صدور/کپی لینک امن به‌ازای یک معلم مشخص — بدون ارسال بله (مدرسه بدون چت متصل هم کار می‌کند).
   * نام معلم را به رویداد لنگر می‌بندد؛ لینک مستقل به‌ازای هر معلم = چند معلم، چند لینک.
   */
  issueTeacherFillLink(eventId: string, input: { teacherName?: string | null; teacherId?: string | null }, actor: AuthContext): Promise<{ link: string; teacherName: string }>;
  /** — سیم اعلان (observer — الگوی setGradeObserver): enqueue + dispatch → تعداد واقعی ارسال */
  setSendObserver(fn: SendObserver | null): void;
  /** اعتبارسنجی گیت خانواده: آیا این چت به این دانش‌آموز متصل است؟ */
  assertFamilyChat(studentId: string, chatId: string): Promise<boolean>;
  /** تطبیق توکن وب‌فرم (نه انقضا/وضعیت — آن‌ها در مسیر و fill چک می‌شوند) */
  verifyFillToken(id: string, token: string): Promise<boolean>;
  /** ساخت لینک وب‌فرم برای پیام خانواده — فقط چک‌لیست در انتظار؛ وگرنه null */
  mintFillLink(id: string, publicBaseUrl: string): Promise<string | null>;
  /**
   * — T5: رکورد کامپوننت‌های پکیج به‌ترتیب قرارداد (فرم عمومی پکیجی).
   * اگر نوع پکیج نباشد → null؛ کامپوننتِ غایب/غیرفعال → خطا.
   */
  listPackageComponentTypes(typeId: string): Promise<CaseEventTypeRecord[] | null>;
  /** ثبت پاسخ‌های خانواده (بات یا وب) — تحلیل + وضعیت + audit هم‌تراکنش */
  fillByFamily(id: string, input: { values: Record<string, number | string>; sourceChatId: string | null; viaWeb: boolean }, actor: AuthContext): Promise<CaseEventRecord>;
}

// ─── شکل‌های موتور تشخیص و مداخله ───

/** یک قالب پیشنهادی با برچسب‌های مشترک با دانش‌آموز */
export interface ChecklistSuggestion {
  type: CaseEventTypeRecord;
  /** برچسب‌های مشترک قالب و دانش‌آموز (نمایش badge «مناسب برچسب‌های او») */
  matched: { id: string; name: string }[];
  /** ترتیب پیشنهاد — صفر یعنی بدون تطابق برچسب (در ادامهٔ فهرست) */
  score: number;
}

/** ردیف صف «در انتظار پاسخ» */
export interface PendingChecklist {
  id: string;
  studentId: string;
  studentName: string;
  typeId: string;
  typeTitle: string;
  typeIcon: string | null;
  typeAudience: CaseEventAudience;
  occurredAt: string;
  fillExpiresAt: string | null;
  sentAt: string | null;
  sentCount: number;
  /** انقضا گذشته؟ (پنل قرمز نشان می‌دهد) */
  expired: boolean;
}

/** ناظر ارسال — در api-routing به notify وصل می‌شود؛ تعداد واقعی ارسال را برمی‌گرداند */
export interface SendObserverInput {
  studentId: string;
  chats: string[];
  template: 'bot_checklist_link' | 'bot_teacher_package_link';
  vars: import('@core/shared').TemplateVars;
  dedupBase: string;
}
export type SendObserver = (input: SendObserverInput) => Promise<number>;
