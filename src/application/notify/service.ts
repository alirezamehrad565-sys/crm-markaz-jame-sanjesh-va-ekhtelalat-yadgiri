/**
 * اعلان‌های کاربردی و بات‌های نقش‌آگاه بله — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// سرویس کاربردی اعلان‌ها — ارکستراسیون هسته notify با سرویس‌های دامنه
// شامل: لیست/آمار صف، prefs، کد اتصال بات، هندلر webhook، cron یادآوری‌ها

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { ConflictError, NotFoundError } from '@core/errors';
import type {
  AuthContext,
  BotLinkRecord,
  ClassBotLinkRecord,
  DispatchSummary,
  NotificationPrefs,
  NotificationRecord,
  NotificationStatus,
  ReminderEnqueueSummary,
  StaffBotLinkRecord,
  Appointment,
  FollowUp,
  Todo
} from '@core/shared';
import {
  LINK_CODE_LENGTH,
  REMINDER_HORIZON_HOURS,
  addDaysYmd,
  addMinutes,
  faDigits,
  jalaliFullLabel,
  iranianWeekdayOfYmd,
  tehranRange,
  tehranTimeLabel,
  tehranTodayYmd,
  tehranYmdOf
} from '@core/shared';
import { listStaff } from '@core/auth';
import type { AppointmentService } from '@domain/appointment-core';
import type { StudentProfileService } from '@domain/student-profile';
import {
  createBaleChannel,
  generateLinkCode,
  parseBotUpdate,
  renderScheduleMessage,
  renderTemplate,
  rowToBotLink,
  rowToPrefs,
  rowToStaffBotLink,
  rowToClassBotLink,
  selectBotLinkByCode,
  selectBotLinks,
  selectPrefs,
  selectPrefsMany,
  selectStaffChats,
  selectStaffLinkByCode,
  selectStaffLinks,
  selectClassLinkByCode,
  selectClassLinks,
  selectClassChats,
  linkBotLink,
  insertBotLink,
  insertStaffLink,
  linkStaffLink,
  insertClassLink,
  linkClassLink,
  resolveChatOwner,
  upsertPrefs,
  insertBotLinkLinked,
  selectBotLinkIdFor,
  selectStudentIdsByChat,
  insertStaffLinkLinked,
  selectStaffLinkIdFor,
  normalizePhoneDigits
} from '@core/notify';
import type { BotLinkRow, NotifyService, NotifyListFilters, PrefsRow, SendResult, StaffBotLinkRow, ClassBotLinkRow, InlineButton, IdentityFormat, AttendanceChildSummary } from '@core/notify';
import { renderDigestBody, renderFollowupsMessage, renderAttendanceSummary, renderCenterStatus, renderSearchResults, renderCenterSchedule, renderWaitlistList, renderScreeningGoal } from '@core/notify';
import type { FollowUpsService } from '@domain/followups';
import { followUpGroupOf } from '@domain/followups';
import { orderWaitlist } from '@domain/waitlist';
import type { ScreeningService } from '@domain/screening';
import { goalsQueryWindow, summarizeScreeningGoals } from '../dashboard/screening-goal';
import { buildScheduleEntries, planLifecycleNotifications } from './lifecycle';
import type { LifecycleEvent } from './lifecycle';
import { computeBatchSendAt, isCreatedTemplate } from './batch';
import type { SettingsService } from '@app/settings';
import { buildEnqueueSummary, planReminders } from './reminders';
import { groupFollowUpsForBot, followupsNudgeBody } from './digest';
import type { DigestSummary } from './digest';
import { createExerciseBankBot } from './exercise-bank-bot';
import type { ExerciseBankBot } from './exercise-bank-bot';
import { createExerciseSubmissionBot } from './exercise-submission-bot';
import type { ExerciseSubmissionBot } from './exercise-submission-bot';
import { createWaitlistIntakeBot, readWlIntakeState, clearWlIntakeState } from './waitlist-intake-bot';
import type { WaitlistIntakeBot } from './waitlist-intake-bot';
import { createStudentActionsBot, readStuMsgState, clearStuState } from './student-actions-bot';
import { createCaseEventsBot } from './case-events-bot';
import type { StudentActionsBot } from './student-actions-bot';
import { createAwarenessBot } from './awareness-bot';
import type { AwarenessBot, AwBotReply } from './awareness-bot';
import type { AwSection } from '@core/notify';
import type { ExerciseBankService } from '@domain/exercise-bank';
import type { MediaFetcher, BotMedia } from '@core/notify';

export interface NotifyAppDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** هسته صف (core/notify) */
  notify: NotifyService;
  appointments: AppointmentService;
  students: StudentProfileService;
  /** — پیگیری‌ها («پیگیری‌های من» + تکمیل از بات + یادآور صبحگاهی) */
  followups: FollowUpsService;
  /** — تنظیمات مرکز (نام مرکز، پرچم‌های اعلان، ساعت پیش‌فرض یادآوری) */
  settings: SettingsService;
  /** توکن بله — در صورت وجود، کانال bale ثبت می‌شود */
  baleToken?: string | null;
  /** — دریافت یوزرنیم بات از Bale getMe (تزریقی برای تست؛ پیش‌فرض fetch واقعی) */
  botUsernameFetcher?: (token: string, fetchImpl?: typeof fetch) => Promise<string | null>;
  /** secret مسیر webhook — در صورت نبود، webhook غیرفعال (404) است */
  webhookSecret?: string | null;
  /** fallback نام مرکز از env */
  clinicName?: string;
  /** — بانک تمرین (در نبود آن، دستورهای exb پاسخ «غیرفعال» می‌دهند) */
  exerciseBank?: ExerciseBankService | null;
  /** — آدرس عمومی برای لینک دانلود کاربرگ در پیام خانواده */
  publicBaseUrl?: string | null;
  /** — دریافت رسانه از بله برای حلقهٔ بازگشت (بدون توکن بله null) */
  mediaFetcher?: MediaFetcher | null;
  /** — رویدادهای پرونده (ویزارد رویداد بات + چک‌لیست خانواده) — در نبود آن جریان tl/clf غیرفعال */
  caseEvents?: import('@domain/case-events').CaseEventsService | null;
  /** — سنجش روزانه («هدف سنجش» = همان اعداد داشبورد) — در نبود آن دستور پاسخ «در دسترس نیست» می‌دهد */
  screening?: ScreeningService | null;
  now?: () => Date;
}

export interface UpsertPrefsInput {
  channel?: NotificationPrefs['channel'];
  chatId?: string | null;
  remindersEnabled?: boolean;
  reminderHoursBefore?: number;
}

/** بازیگر سیستم برای عملیات بات (لغو نوبت توسط همکار از داخل بات) */
const BOT_ACTOR: AuthContext = {
  staffId: 'bale-bot',
  email: 'bale-bot@system.local',
  role: 'manager',
  displayName: 'بات بله'
};

/** برچسب فارسی نقش کارمند — در پیام اتصال بات */
const STAFF_ROLE_LABEL: Record<string, string> = {
  manager: 'سمت: مدیر مرکز',
  therapist: 'سمت: همکار (متخصص)',
  secretary: 'سمت: منشی',
  supervisor: 'سمت: ناظر اداره'
};

/**
 * — دریافت یوزرنیم بات از Bale getMe — برای ساخت لینک اتصال خودکار.
 * یوزرنیم نامعتبر/ناموفق → null (تماس‌کننده fallback «/link CODE» می‌دهد)
 */
export async function fetchBaleBotUsername(token: string, fetchImpl?: typeof fetch): Promise<string | null> {
  const doFetch = fetchImpl ?? fetch;
  try {
    const res = await doFetch(`https://tapi.bale.ai/bot${token}/getMe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    const body = (await res.json().catch(() => ({}))) as { result?: { username?: unknown } };
    const username = body?.result?.username;
    if (typeof username !== 'string') return null;
    const clean = username.trim().replace(/^@/, '');
    return /^[A-Za-z0-9_]{2,64}$/.test(clean) ? clean : null;
  } catch {
    return null;
  }
}

export interface BotReply {
  text: string;
  buttons: InlineButton[][] | null;
  /** — کیبورد ثابت ناوبری (پایین چت) — در پاسخ‌های منو/راهنما/درباره
   * این کیبورد در چت «نصب» می‌ماند تا ارسال بعدی آن را عوض کند */
  keyboard?: string[][] | null;
}

/** — صندوق اعلان‌ها (Outbox پنل) */
export interface OutboxSummary {
  drafts: NotificationRecord[];
  ready: NotificationRecord[];
  failed: NotificationRecord[];
  counts: Record<NotificationStatus, number>;
}

/**
 * — کیبورد ثابت ناوبری بات نسخهٔ ۲ — ماتریس کامل هفت مخاطب:
 * مهمان → معرفی/خدمات/ارتباطی/احراز هویت (دقیقاً ۴ دکمه)
 * مدیر → همهٔ امکانات + KPI؛ منشی → همه به‌جز KPI
 * درمانگر → نوبت‌ها، پیگیری‌ها، دانش‌آموزان فعال، بانک تمرین، صف
 * معلم کلاس → نوبت‌های کلاس، دانش‌آموزان من، ثبت متقاضی، فعالیت، بانک تمرین، آگاهی‌ها
 * والد → نوبت‌های دانش‌آموز من، تمرین‌های انجام‌نشده، حضور فرزند
 * ناظر → فقط KPI
 * برچسب‌ها باید دقیقاً با برچسب‌های webhook.ts هم‌خوان باشند (پارس متنی).
 * سازگاری: همهٔ برچسب‌های نسخه‌های قبلی همچنان پارس می‌شوند.
 */
export function buildBotKeyboard(owner: { kind: string; role: string | null } | null): string[][] {
  const aboutRow = ['درباره مرکز', 'راهنما'];
  if (!owner) {
    // — عموم مردم: دقیقاً ۴ دکمهٔ دستور کاربر
    return [
      ['معرفی مرکز', 'خدمات مرکز'],
      ['راه‌های ارتباطی', 'احراز هویت']
    ];
  }
  if (owner.kind === 'staff') {
    if (owner.role === 'manager') {
      return [
        ['نوبت‌های من', 'پیگیری‌های من'],
        ['برنامه مرکز', 'لیست انتظار'],
        ['وضعیت مرکز', 'هدف سنجش'],
        ['بانک تمرین', 'دانش‌آموزان فعال'],
        ['اعلان‌های در صف', 'گزارش KPI'],
        aboutRow
      ];
    }
    if (owner.role === 'secretary') {
      return [
        ['نوبت‌های من', 'پیگیری‌های من'],
        ['برنامه مرکز', 'لیست انتظار'],
        ['وضعیت مرکز', 'هدف سنجش'],
        ['بانک تمرین', 'دانش‌آموزان فعال'],
        ['اعلان‌های در صف'],
        aboutRow
      ];
    }
    if (owner.role === 'therapist') {
      return [
        ['نوبت‌های من', 'پیگیری‌های من'],
        ['دانش‌آموزان فعال', 'بانک تمرین'],
        ['اعلان‌های در صف'],
        aboutRow
      ];
    }
    // — ناظر اداره: فقط KPI تجمیعی —: رفع تکرار «راهنما»
    if (owner.role === 'supervisor') {
      return [['گزارش KPI'], aboutRow];
    }
    return [['نوبت‌های من'], aboutRow];
  }
  if (owner.kind === 'class') {
    return [
      ['نوبت‌های کلاس من', 'دانش‌آموزان من'],
      ['ثبت متقاضی', 'فعالیت کلاس'],
      ['بانک تمرین', 'آگاهی‌های اختلالات'],
      aboutRow
    ];
  }
  // والد (student) —: نوبت‌های دانش‌آموز من + تمرین‌های انجام‌نشده —: چک‌لیست‌های من
  return [
    ['نوبت‌های دانش‌آموز من', 'تمرین‌های انجام‌نشده'],
    ['چک‌لیست‌های من', 'حضور فرزند'],
    aboutRow
  ];
}

export interface NotifyAppService {
  listNotifications(filters: NotifyListFilters): Promise<NotificationRecord[]>;
  /** — صندوق اعلان‌ها: پیش‌نویس‌ها + آماده‌ها + ناموفق‌ها + شمارش کل */
  outbox(): Promise<OutboxSummary>;
  /** — ارسال فوری یک رکورد (رهاسازی + dispatch) */
  releaseAndDispatch(id: string, actor: AuthContext): Promise<NotificationRecord | null>;
  /** — تلاش دوبارهٔ همهٔ ناموفق‌ها */
  retryFailed(actor: AuthContext): Promise<number>;
  stats(): Promise<Record<NotificationStatus, number>>;
  /** ارسال صف pending (trigger دستی یا cron) */
  dispatchPending(limit?: number): Promise<DispatchSummary>;
  /** صف‌گذاری یادآوری‌های بازه پیش‌رو — idempotent با dedup_key */
  enqueueUpcomingReminders(now?: Date, horizonHours?: number): Promise<ReminderEnqueueSummary>;
  getPrefs(studentId: string): Promise<NotificationPrefs | null>;
  upsertPrefs(studentId: string, input: UpsertPrefsInput, actor: AuthContext): Promise<NotificationPrefs>;
  /** ساخت کد اتصال بات برای یک دانش‌آموز */
  createLink(studentId: string, actor: AuthContext): Promise<BotLinkRecord>;
  listLinks(studentId: string | undefined, limit?: number): Promise<BotLinkRecord[]>;
  /** — ساخت کد اتصال بات برای یک کارمند (معلم) */
  createStaffLink(staffId: string, actor: AuthContext): Promise<StaffBotLinkRecord>;
  listStaffLinks(staffId: string | undefined, limit?: number): Promise<StaffBotLinkRecord[]>;
  /** — ساخت کد اتصال بات برای معلم مدرسه (اتصال به کلاس) */
  createClassLink(classId: string, actor: AuthContext): Promise<ClassBotLinkRecord>;
  listClassLinks(classId: string | undefined, limit?: number): Promise<ClassBotLinkRecord[]>;
  /** — لغو کد اتصال معلم (idempotent؛ در اتصال هم تأثیر فوری دارد) */
  revokeClassLink(id: string, actor: AuthContext): Promise<ClassBotLinkRecord>;
  /** — نام کاربری بات برای لینک اتصال خودکار (تنظیمات → Bale getMe) */
  resolveBotUsername(): Promise<{ username: string | null; source: 'stored' | 'detected' | 'none' }>;
  /** — پردازش کد اتصال (/link CODE یا پیلود /start CODE) — چندبارمصرف */
  processLinkCode(chatId: string, code: string): Promise<{ handled: boolean; reply: string | null; buttons?: InlineButton[][] | null; keyboard?: string[][] | null }>;
  /** — ارسال گزارش درباره دانش‌آموز به معلم مدرسه‌اش (چت متصل کلاس) */
  sendReportToStudentTeacher(studentId: string, text: string, actor: AuthContext): Promise<{ enqueued: number; className: string | null }>;
  /** هندلر webhook بله — خروجی: متن پاسخ برای ارسال به همان chat (+ دکمه‌های inline و کیبورد ثابت اختیاری) */
  handleBotUpdate(update: unknown): Promise<{ handled: boolean; reply: string | null; buttons?: InlineButton[][] | null; keyboard?: string[][] | null }>;
  /** — دستور /today و /week: متن برنامه کلاس‌ها برای یک chat متصل */
  handleScheduleCommand(chatId: string, scope: 'today' | 'week'): Promise<string>;
  /** ارسال مستقیم پاسخ بات به یک chat (اگر کانال بله فعال باشد) */
  replyToChat(chatId: string, text: string, buttons?: InlineButton[][] | null, keyboard?: string[][] | null): Promise<SendResult>;
  /** — «نوبت‌های من»: نوبت‌های پیش‌رو برای chat متصل (همکار با دکمه لغو، والد بدون دکمه) */
  handleMyNextCommand(chatId: string): Promise<BotReply>;
  /** — ورود خودکار با کد ملی/شماره تلفن: اتصال chat به کارمند یا دانش‌آموز(ان) */
  identifyAndReply(chatId: string, format: IdentityFormat, value: string): Promise<string>;
  /** — لغو دومرحله‌ای نوبت توسط همکار (ask = پرسش تأیید، do = اجرای cancel) */
  handleBotCancel(chatId: string, appointmentId: string, confirm: boolean): Promise<BotReply>;
  /** — «پیگیری‌های من»: فهرست گروه‌بندی‌شدهٔ پیگیری‌های باز مسئول + دکمهٔ انجام */
  handleFollowupsCommand(chatId: string): Promise<BotReply>;
  /** — تکمیل پیگیری از بات (فقط خودِ مسئول؛ بازیگر audit = bale-bot) */
  handleFollowupDone(chatId: string, followupId: string): Promise<BotReply>;
  /** — «حضور فرزند»: آمار ۳۰ روز اخیر هر فرزند متصل (والدین) */
  handleAttendanceSummary(chatId: string): Promise<BotReply>;
  /** — «وضعیت مرکز»: خلاصهٔ امروز برای مدیر/منشی */
  handleCenterStatus(chatId: string): Promise<BotReply>;
  /** — راهنمای نقش‌محور: هر مخاطب فقط دستورهای نقش خودش را می‌بیند */
  handleHelpCommand(chatId: string): Promise<string>;
  /** — جستجوی دانش‌آموز؛ فقط همکاران مرکز (همان مرز پنل؛ بدون PII) */
  handleSearchCommand(chatId: string, query: string): Promise<BotReply>;
  /** — «برنامهٔ مرکز»: برنامهٔ امروز همهٔ همکاران؛ فقط مدیر/منشی */
  handleCenterScheduleCommand(chatId: string): Promise<BotReply>;
  /** — «لیست انتظار»: متقاضیان باز به ترتیب پنل؛ فقط مدیر/منشی */
  handleWaitlistCommand(chatId: string): Promise<BotReply>;
  /** — «هدف سنجش»: تحقق اهداف غربال (همان اعداد داشبورد)؛ فقط مدیر/منشی */
  handleScreeningGoalCommand(chatId: string): Promise<BotReply>;
  // ─── بات نقش‌محور CRM ───
  /** — «شماره تماس»: عموم مردم (همه مخاطبان) */
  handleContactCommand(): Promise<BotReply>;
  /** — «خدمات مرکز»: چهار خدمت اصلی (همه مخاطبان) */
  handleServicesCommand(): Promise<BotReply>;
  /** — «احراز هویت»: راهنمای مسیرهای اتصال (همه مخاطبان) */
  handleAuthGuideCommand(): Promise<BotReply>;
  /** — «تمرین‌های انجام‌نشده»: تکلیف‌های باز فرزندان متصل (خانواده) */
  handlePendingHomeworkCommand(chatId: string): Promise<BotReply>;
  /** — «فایل‌های آموزشی»: عموم مردم — لینک صفحات HTML عمومی */
  handlePublicFilesCommand(): Promise<BotReply>;
  /** — «دانش‌آموزان من»: فهرست کلاس برای معلم مدرسه */
  handleMyStudentsCommand(chatId: string): Promise<BotReply>;
  /** — «اعلان‌های در صف»: شمارش پیش‌نویس/ناموفق؛ فقط همکاران مرکز */
  handleOutboxCommand(chatId: string): Promise<BotReply>;
  /** — «ارسال فوری صف» (callback دفتر) */
  handleOutboxFlush(chatId: string): Promise<BotReply>;
  /** — «گزارش KPI»: ناظر اداره (+ مدیر) — فقط تجمیعی */
  handleKpiCommand(chatId: string): Promise<BotReply>;
  /** — KPI هفتگی خودکار به ناظرها (شنبه‌ها در چرخهٔ خلاصهٔ روز) */
  enqueueWeeklyKpi(nowDate?: Date): Promise<number>;
  /** — متغیرهای KPI تجمیعی ۷ روز اخیر (مشترک بات/هفتگی) */
  buildKpiVars(nowDate?: Date): Promise<{ ymd: string; title: string; lines: string }>;
  /**
   * — اعلان «نوبت خالی شد» به دفتر (best-effort؛ در ناظر لغو وصل می‌شود):
   * فقط وقتی متقاضیِ بازی در لیست انتظار هست و پرچم notify_waitlist روشن است،
   * به همهٔ chatهای متصل مدیر/منشی با dedup «wl-free:{appointmentId}:{chatId}» پیام می‌رود.
   */
  notifyWaitlistSlotFreed(appointment: Appointment): Promise<void>;
  /** — خلاصهٔ روز بات: پوش صبحگاهی برنامهٔ امروز + یادآور پیگیری‌ها (cron؛ idempotent) */
  sendDailyDigest(nowDate?: Date): Promise<DigestSummary>;
  /** — یادآور پیگیری‌های عقب‌افتاده/امروز به مسئولان (بخشی از چرخهٔ خلاصهٔ روز) */
  enqueueFollowupNudges(nowDate?: Date): Promise<number>;
  /** — یادآور بازسنجی مسیرهای فعال با reassess_at ≤ ۷ روز به درمانگر مالک (بخشی از چرخهٔ خلاصهٔ روز) */
  enqueueReassessmentNudges(nowDate?: Date): Promise<number>;
  /** — resolve chat متصل با نقش کارمند (داخلی — برای گیت‌های نقش) */
  resolveOwner(chatId: string): Promise<{ kind: string; ref_id: string; role: string | null } | null>;
  /** — ناظر چرخه حیات نوبت (در api-routing به appointment service وصل می‌شود) */
  notifyAppointmentCreated(appointment: Appointment): Promise<void>;
  notifyAppointmentMoved(appointment: Appointment, previous: { startAt: string; endAt: string }): Promise<void>;
  notifyAppointmentCancelled(appointment: Appointment): Promise<void>;
  /** پیاده‌سازی مشترک هر سه رویداد (عمومی برای تست) */
  notifyLifecycle(event: LifecycleEvent, appointment: Appointment, previous?: { startAt: string; endAt: string }): Promise<void>;
  /** ارسال آزمایشی مستقیم (بدون صف) */
  sendTest(input: { channel: NotificationRecord['channel']; recipient: string; text?: string }, actor: AuthContext): Promise<SendResult>;
  /** آیا webhook پیکربندی شده است؟ */
  isWebhookEnabled(): boolean;
  isWebhookSecretValid(secret: string | undefined): boolean;
  /** — یادآوری هوشمند: اعلان غیبت دانش‌آموز به خانواده‌های متصل */
  notifyAttendanceMarked(appointmentId: string, studentId: string, status: string): Promise<void>;
  /** — یادآوری هوشمند: یادآور ثبت حضور و غیاب معوق به کارکنان (cron) */
  enqueuePendingAttendanceNudges(): Promise<number>;
  /** -c — اعلان «تمرین تصحیح شد» با بازخورد به چت‌های ولیّ (ناظر grade) */
  notifyHomeworkGraded(input: { studentId: string; studentName: string; exerciseTitle: string; feedback: string; gradedByName: string | null }): Promise<void>;
  /** فاز ۴ — اعلان «کار داخلی جدید» به مسئول آن (الگوی: بله اگر لینک فعال بود، وگرنه internal) */
  notifyTodoAssigned(todo: Todo): Promise<void>;
}

export function createNotifyAppService(deps: NotifyAppDeps): NotifyAppService {
  const { db, audit, logger, notify, appointments, students, followups } = deps;
  const log = logger.child('notifications');
  const now = deps.now ?? (() => new Date());
  // — دریافت یوزرنیم بات (تزریقی برای تست؛ پیش‌فرض Bale getMe واقعی)
  const resolveUsernameFromBale = deps.botUsernameFetcher ?? fetchBaleBotUsername;

  // ─── جریان «بانک تمرین» بات (در نبود سرویس، پاسخ «غیرفعال») ───
  const exbBot: ExerciseBankBot | null = deps.exerciseBank
    ? createExerciseBankBot({
        db,
        audit,
        logger,
        notify,
        settings: deps.settings,
        exerciseBank: deps.exerciseBank,
        publicBaseUrl: deps.publicBaseUrl ?? null,
        now
      })
    : null;

  // ─── حلقهٔ بازگشت فایل (سمت خانواده؛ در نبود بانک تمرین غیرفعال) ───
  const subBot: ExerciseSubmissionBot | null =
    deps.exerciseBank && deps.mediaFetcher
      ? createExerciseSubmissionBot({
          db,
          audit,
          logger,
          notify,
          settings: deps.settings,
          exerciseBank: deps.exerciseBank,
          mediaFetcher: deps.mediaFetcher,
          now
        })
      : null;

  // ─── ثبت متقاضی لیست انتظار توسط معلم مدرسه (فرم چندمرحله‌ای) ───
  const wlIntakeBot: WaitlistIntakeBot = createWaitlistIntakeBot({ db, audit, logger, now });

  // ─── منوی دانش‌آموز (همکاران) + فعالیت کلاس (معلم) ───
  const stuBot: StudentActionsBot = createStudentActionsBot({
    db,
    audit,
    logger,
    notify,
    settings: deps.settings,
    exerciseBank: deps.exerciseBank ?? null,
    publicBaseUrlEnv: deps.publicBaseUrl ?? null,
    now
  });

  // ─── ویزارد رویداد/گزارش (همکاران) + چک‌لیست خانواده ───
  const tlBot = createCaseEventsBot({
    db,
    audit,
    logger,
    notify,
    settings: deps.settings,
    caseEvents: deps.caseEvents ?? null,
    publicBaseUrlEnv: deps.publicBaseUrl ?? null,
    now
  });

  // ─── آگاهی‌های اختلالات (عمومی — بدون گیت داده) ───
  const awBot: AwarenessBot = createAwarenessBot({ publicBaseUrl: deps.publicBaseUrl ?? null });

  // ثبت کانال بله در صورت وجود توکن
  if (deps.baleToken) {
    notify.registerChannel(createBaleChannel({ token: deps.baleToken }));
  }

  async function studentNamesMap(studentIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const id of new Set(studentIds)) {
      const st = await students.getStudentById(id);
      if (st) map.set(id, `${st.firstName} ${st.lastName}`);
    }
    return map;
  }

  async function staffNamesMap(): Promise<Map<string, string>> {
    const rows = await listStaff(db, true);
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.id, r.full_name);
    return map;
  }

  // ─── لینک اتصال آمادهٔ ارسال (ble.ir/<bot>?start=CODE) ───

  /** پیش‌فرض یوزرنیم بات از env — اگر در تنظیمات ثبت نشده باشد */
  let botUsernameCache: string | null = null;
  async function botDeepLinkCache(): Promise<string | null> {
    if (botUsernameCache === null) {
      const stored = await deps.settings.getBotUsername().catch(() => '');
      botUsernameCache = stored || '';
    }
    return botUsernameCache ? `https://ble.ir/${botUsernameCache}` : null;
  }

  /** لینک کامل اتصال برای یک کد — بدون یوزرنیم ثبت‌شده = null (فقط کد نمایش داده می‌شود) */
  async function botDeepLink(code: string): Promise<string | null> {
    const base = await botDeepLinkCache();
    return base ? `${base}?start=${code}` : null;
  }

  return {
    async listNotifications(filters: NotifyListFilters): Promise<NotificationRecord[]> {
      return notify.list(filters);
    },

    /** — صندوق اعلان‌ها: پیش‌نویس‌ها (send_at آینده) + آماده‌ها + ناموفق‌ها */
    async outbox(): Promise<OutboxSummary> {
      const [pending, failed, counts] = await Promise.all([
        notify.list({ status: 'pending', limit: 100 }),
        notify.list({ status: 'failed', limit: 100 }),
        notify.stats()
      ]);
      return {
        drafts: pending.filter((n) => n.sendAt !== null),
        ready: pending.filter((n) => n.sendAt === null),
        failed,
        counts
      };
    },

    /** — ارسال فوری یک رکورد + dispatch — رکورد پس از ارسال برمی‌گردد */
    async releaseAndDispatch(id: string, actor: AuthContext): Promise<NotificationRecord | null> {
      const released = await notify.release(id);
      await audit.log({
        actorId: actor.staffId,
        action: 'notification.release',
        resourceType: 'notification',
        resourceId: id,
        changes: { released: { from: null, to: released } }
      });
      await notify.dispatchPending(50);
      return notify.getById(id);
    },

    /** — تلاش دوبارهٔ همهٔ ناموفق‌ها + dispatch */
    async retryFailed(actor: AuthContext): Promise<number> {
      const count = await notify.retryFailed(100);
      await audit.log({
        actorId: actor.staffId,
        action: 'notification.retry_failed',
        resourceType: 'notification',
        resourceId: 'outbox',
        changes: { requeued: { from: null, to: count } }
      });
      await notify.dispatchPending(100);
      return count;
    },

    async stats(): Promise<Record<NotificationStatus, number>> {
      return notify.stats();
    },

    async dispatchPending(limit = 50): Promise<DispatchSummary> {
      return notify.dispatchPending(limit);
    },

    async enqueueUpcomingReminders(nowDate = now(), horizonHours = REMINDER_HORIZON_HOURS): Promise<ReminderEnqueueSummary> {
      const nowIso = nowDate.toISOString();
      const horizonTo = addMinutes(nowIso, horizonHours * 60);

      //: نام مرکز و ساعت پیش‌فرض یادآوری از تنظیمات
      const [settingsFlags, clinicName] = await Promise.all([
        deps.settings.getNotifyFlags(),
        deps.settings.getClinicName()
      ]);

      // ۱) نوبت‌های بازه پیش‌رو — فقط از API عمومی دامنه (بدون SQL مستقیم روی appointments)
      const upcoming = await appointments.list({ from: nowIso, to: horizonTo });

      // ۲) prefs همه دانش‌آموزان درگیر (یک کوئری IN)
      const studentIds = [...new Set(upcoming.flatMap((a) => a.students.map((s) => s.studentId)))];
      const prefsRows = studentIds.length > 0
        ? await db.query<PrefsRow>(...spreadStmt(selectPrefsMany(studentIds)))
        : [];
      const prefsByStudent = new Map<string, NotificationPrefs>();
      for (const row of prefsRows) {
        const prefs = rowToPrefs(row);
        prefsByStudent.set(prefs.studentId, prefs);
      }

      // ۳) نام دانش‌آموزان و کارکنان برای متن پیام
      const [studentNames, staffNames] = await Promise.all([
        studentNamesMap(studentIds),
        staffNamesMap()
      ]);

      // ۴) برنامه‌ریزی pure
      const plan = planReminders({
        appointments: upcoming,
        prefsByStudent,
        studentNames,
        staffNames,
        nowIso,
        horizonHours,
        defaultHoursBefore: settingsFlags.defaultReminderHours,
        clinicName
      });

      // ۵) صف‌گذاری idempotent
      let enqueued = 0;
      let duplicates = 0;
      for (const p of plan.plans) {
        const outcome = await notify.enqueue({
          channel: p.channel,
          template: 'appointment_reminder',
          payload: p.payload,
          recipient: p.recipient,
          studentId: p.studentId,
          appointmentId: p.appointmentId,
          staffId: p.staffId,
          dedupKey: p.dedupKey
        });
        if (outcome.duplicate) duplicates += 1;
        else enqueued += 1;
      }

      const summary = buildEnqueueSummary(plan, enqueued, duplicates, nowIso, horizonTo);
      log.info('reminders.enqueued', { ...summary });

      await audit.log({
        actorId: 'system',
        action: 'notification.reminders.enqueue',
        resourceType: 'notification',
        resourceId: 'bulk',
        changes: {
          enqueued: { from: null, to: enqueued },
          duplicates: { from: null, to: duplicates },
          considered: { from: null, to: summary.considered }
        }
      });

      return summary;
    },

    async getPrefs(studentId: string): Promise<NotificationPrefs | null> {
      const row = await db.queryOne<PrefsRow>(...spreadStmt(selectPrefs(studentId)));
      return row ? rowToPrefs(row) : null;
    },

    async upsertPrefs(studentId: string, input: UpsertPrefsInput, actor: AuthContext): Promise<NotificationPrefs> {
      const existing = await this.getPrefs(studentId);
      const next = {
        studentId,
        channel: input.channel ?? existing?.channel ?? ('bale' as const),
        chatId: input.chatId !== undefined ? input.chatId : (existing?.chatId ?? null),
        remindersEnabled: input.remindersEnabled ?? existing?.remindersEnabled ?? true,
        reminderHoursBefore: input.reminderHoursBefore ?? existing?.reminderHoursBefore ?? 2
      };

      await db.execute(
        ...spreadStmt(
          upsertPrefs({
            studentId,
            channel: next.channel,
            chatId: next.chatId,
            remindersEnabled: next.remindersEnabled,
            reminderHoursBefore: next.reminderHoursBefore,
            nowIso: now().toISOString()
          })
        )
      );

      await audit.log({
        actorId: actor.staffId,
        action: 'notification.prefs.update',
        resourceType: 'notification_prefs',
        resourceId: studentId,
        changes: {
          channel: { from: existing?.channel ?? null, to: next.channel },
          remindersEnabled: { from: existing?.remindersEnabled ?? null, to: next.remindersEnabled },
          reminderHoursBefore: { from: existing?.reminderHoursBefore ?? null, to: next.reminderHoursBefore }
        }
      });

      const saved = await this.getPrefs(studentId);
      if (!saved) throw new Error('PREFS_SAVE_FAILED');
      return saved;
    },

    async createLink(studentId: string, actor: AuthContext): Promise<BotLinkRecord> {
      // دانش‌آموز باید واقعی باشد (404 به‌جای رکورد یتیم)
      const student = await students.getStudentById(studentId);
      if (!student) throw new NotFoundError('دانش‌آموز');

      const id = crypto.randomUUID();
      const code = generateLinkCode(LINK_CODE_LENGTH);
      await db.execute(
        ...spreadStmt(insertBotLink({ id, code, studentId, createdBy: actor.staffId, nowIso: now().toISOString() }))
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'notification.link.create',
        resourceType: 'bot_link',
        resourceId: id,
        changes: { studentId: { from: null, to: studentId } }
      });

      const row = await db.queryOne<BotLinkRow>(...spreadStmt(selectBotLinkByCode(code)));
      if (!row) throw new Error('LINK_CREATE_FAILED');
      const rec = rowToBotLink(row);
      rec.deepLink = await botDeepLink(code);
      return rec;
    },

    async listLinks(studentId: string | undefined, limit = 50): Promise<BotLinkRecord[]> {
      const rows = await db.query<BotLinkRow>(
        ...spreadStmt(selectBotLinks({ studentId, limit: Math.min(limit, 200) }))
      );
      const deep = await botDeepLinkCache();
      return rows.map((r) => {
        const rec = rowToBotLink(r);
        rec.deepLink = deep ? `${deep}?start=${r.code}` : null;
        return rec;
      });
    },

    // ───: کدهای اتصال بات کارکنان ───

    async createStaffLink(staffId: string, actor: AuthContext): Promise<StaffBotLinkRecord> {
      const member = await db.queryOne<{ id: string }>(`SELECT id FROM staff WHERE id = ?`, [staffId]);
      if (!member) throw new NotFoundError('کارمند');

      const id = crypto.randomUUID();
      const code = generateLinkCode(LINK_CODE_LENGTH);
      await db.execute(
        ...spreadStmt(insertStaffLink({ id, code, staffId, createdBy: actor.staffId, nowIso: now().toISOString() }))
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'notification.staff_link.create',
        resourceType: 'staff_bot_link',
        resourceId: id,
        changes: { staffId: { from: null, to: staffId } }
      });

      const row = await db.queryOne<StaffBotLinkRow>(...spreadStmt(selectStaffLinkByCode(code)));
      if (!row) throw new Error('STAFF_LINK_CREATE_FAILED');
      const rec = rowToStaffBotLink(row);
      rec.deepLink = await botDeepLink(code);
      return rec;
    },

    async listStaffLinks(staffId: string | undefined, limit = 50): Promise<StaffBotLinkRecord[]> {
      const rows = await db.query<StaffBotLinkRow>(
        ...spreadStmt(selectStaffLinks({ staffId, limit: Math.min(limit, 200) }))
      );
      const deep = await botDeepLinkCache();
      return rows.map((r) => {
        const rec = rowToStaffBotLink(r);
        rec.deepLink = deep ? `${deep}?start=${r.code}` : null;
        return rec;
      });
    },

    // ───: کدهای اتصال بات معلم مدرسه (به کلاس) ───

    async createClassLink(classId: string, actor: AuthContext): Promise<ClassBotLinkRecord> {
      const cls = await db.queryOne<{ id: string }>(`SELECT id FROM classes WHERE id = ? AND active = 1`, [classId]);
      if (!cls) throw new NotFoundError('کلاس');

      const id = crypto.randomUUID();
      const code = generateLinkCode(LINK_CODE_LENGTH);
      await db.execute(
        ...spreadStmt(insertClassLink({ id, code, classId, createdBy: actor.staffId, nowIso: now().toISOString() }))
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'notification.class_link.create',
        resourceType: 'class_bot_link',
        resourceId: id,
        changes: { classId: { from: null, to: classId } }
      });

      const row = await db.queryOne<ClassBotLinkRow>(...spreadStmt(selectClassLinkByCode(code)));
      if (!row) throw new Error('CLASS_LINK_CREATE_FAILED');
      const rec = rowToClassBotLink(row);
      rec.deepLink = await botDeepLink(code);
      return rec;
    },

    async listClassLinks(classId: string | undefined, limit = 50): Promise<ClassBotLinkRecord[]> {
      const rows = await db.query<ClassBotLinkRow>(
        ...spreadStmt(selectClassLinks({ classId, limit: Math.min(limit, 200) }))
      );
      const deep = await botDeepLinkCache();
      return rows.map((r) => {
        const rec = rowToClassBotLink(r);
        rec.deepLink = deep ? `${deep}?start=${r.code}` : null;
        return rec;
      });
    },

    // ───: مدیریت لینک معلم‌ها — مشاهده/لغو کد بدون تولید کد جدید ───

    async revokeClassLink(id: string, actor: AuthContext): Promise<ClassBotLinkRecord> {
      const row = await db.queryOne<ClassBotLinkRow>(`SELECT * FROM class_bot_links WHERE id = ?`, [id]);
      if (!row) throw new NotFoundError('کد اتصال معلم');
      if (row.status === 'revoked') return rowToClassBotLink(row); // idempotent

      await db.execute(
        `UPDATE class_bot_links SET status = 'revoked', updated_at = ? WHERE id = ?`,
        [now().toISOString(), id]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'notification.class_link.revoke',
        resourceType: 'class_bot_link',
        resourceId: id,
        changes: { status: { from: row.status, to: 'revoked' } }
      });

      const after = await db.queryOne<ClassBotLinkRow>(`SELECT * FROM class_bot_links WHERE id = ?`, [id]);
      return rowToClassBotLink(after ?? row);
    },

    async sendReportToStudentTeacher(studentId: string, text: string, actor: AuthContext): Promise<{ enqueued: number; className: string | null }> {
      const student = await students.getStudentById(studentId);
      if (!student) throw new NotFoundError('دانش‌آموز');
      if (!student.classId) throw new ConflictError('این دانش‌آموز کلاسی ندارد — اول در پروفایل، کلاس مدرسه را انتخاب کنید');

      const cls = await db.queryOne<{ name: string }>(`SELECT name FROM classes WHERE id = ?`, [student.classId]);
      const chatRows = await db.query<{ chat_id: string }>(...spreadStmt(selectClassChats(student.classId)));
      const targets = [...new Set(chatRows.map((r) => r.chat_id))];
      if (targets.length === 0) {
        throw new ConflictError('معلم این کلاس هنوز بات را متصل نکرده است — با ساخت «کد اتصال معلم» در بخش مدارس، او را متصل کنید');
      }

      const clinicName = await deps.settings.getClinicName();
      let enqueued = 0;
      for (const chatId of targets) {
        const outcome = await notify.enqueue({
          channel: notify.getChannel('bale') ? 'bale' : 'internal',
          template: 'teacher_report',
          recipient: chatId,
          studentId,
          payload: {
            studentName: `${student.firstName} ${student.lastName}`,
            className: cls?.name ?? '',
            extra: text,
            clinicName
          },
          dedupKey: `teacher-report:${studentId}:${now().toISOString()}:${chatId}`
        });
        if (!outcome.duplicate) enqueued++;
      }
      if (enqueued > 0) await notify.dispatchPending(50);

      await audit.log({
        actorId: actor.staffId,
        action: 'notification.teacher_report',
        resourceType: 'student',
        resourceId: studentId,
        changes: { enqueued: { from: null, to: enqueued }, classId: { from: null, to: student.classId } }
      });
      log.info('teacher.report.sent', { studentId, targets: targets.length, enqueued });
      return { enqueued, className: cls?.name ?? null };
    },

    async handleBotUpdate(update: unknown): Promise<{ handled: boolean; reply: string | null; buttons?: InlineButton[][] | null; keyboard?: string[][] | null }> {
      const cmd = parseBotUpdate(update);
      // — متن خام پیام (برای جریان فرم — چون parseBotUpdate متن آزاد فارسی را null می‌دهد)
      const rawText = extractMessageText(update);
      if (!cmd) {
        // متن آزاد بدون دستور — فرم ثبت متقاضی یا فرم پیام خانواده یا فرم رویداد
        if (rawText) {
          const chatId0 = extractChatIdOf(update) ?? '';
          const st = await readWlIntakeState(db, chatId0);
          if (st) {
            const out = await wlIntakeBot.feedInput(chatId0, rawText);
            if (out) return { handled: true, reply: out.text, buttons: out.buttons };
          }
          // — فرم پیام به خانواده: متن آزاد پیام
          const msgSt = await readStuMsgState(db, chatId0);
          if (msgSt) {
            const out = await stuBot.msgFeed(chatId0, rawText);
            if (out) return { handled: true, reply: out.text, buttons: out.buttons };
          }
          // — ویزارد رویداد: متن/عدد فیلد جاری
          const tlSt = await tlBot.readTlFormState(chatId0);
          if (tlSt) {
            const out = await tlBot.feedInput(chatId0, rawText);
            if (out) return { handled: true, reply: out.text, buttons: out.buttons };
          }
        }
        return { handled: false, reply: null };
      }

      // ─── جریان ثبت متقاضی: intercept قبل از switch ───
      // تأیید/انصراف با دکمه یا /cancel — همیشه خودش هندل می‌شود
      // — اگر فرم رویداد/چک‌لیست فعال است، /cancel آن را لغو می‌کند (اولویت با فرم فعال)
      if (cmd.kind === 'wl_intake_cancel') {
        // — اولویت لغو: فرم پیام خانواده → ویزارد رویداد → چک‌لیست → ثبت متقاضی
        const msgActive = await readStuMsgState(db, cmd.chatId);
        if (msgActive) {
          const out = await stuBot.msgAbort(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        const tlActive = await tlBot.readTlFormState(cmd.chatId);
        const clfActive = await tlBot.readClfFormState(cmd.chatId);
        if (tlActive) {
          const out = await tlBot.abortCreate(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        if (clfActive) {
          const out = await tlBot.abortFill(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
      }
      if (cmd.kind === 'wl_intake_confirm') {
        const out = await wlIntakeBot.confirm(cmd.chatId);
        return { handled: true, reply: out.text, buttons: out.buttons };
      }
      if (cmd.kind === 'wl_intake_abort' || cmd.kind === 'wl_intake_cancel') {
        const out = await wlIntakeBot.cancel(cmd.chatId);
        const ownerAfter = await this.resolveOwner(cmd.chatId);
        return { handled: true, reply: out.text, buttons: out.buttons, keyboard: buildBotKeyboard(ownerAfter) };
      }
      // شروع فرم — فقط معلم کلاس؛ بقیه پیام نقش خودشان را می‌گیرند
      if (cmd.kind === 'wl_intake_start') {
        const out = await wlIntakeBot.start(cmd.chatId);
        return { handled: true, reply: out.text, buttons: out.buttons };
      }
      // اگر فرمی در جریان است، ورودی متنی آزاد (عدد = identify، متن = unknown) به فرم می‌رود؛
      // هر دستور/لیبل منوی دیگر جریان را پاک می‌کند و عادی پردازش می‌شود
      const flowActive = await readWlIntakeState(db, cmd.chatId);
      if (flowActive) {
        if (cmd.kind === 'identify' || cmd.kind === 'unknown') {
          // — متن خام کامل (تاریخ ۱۳۹۷/۱۰/۲۵ توسط identify بدون جداکننده نمی‌آید)
          const input = rawText ?? (cmd.kind === 'unknown' ? cmd.text : cmd.value);
          const out = await wlIntakeBot.feedInput(cmd.chatId, input);
          if (out) return { handled: true, reply: out.text, buttons: out.buttons };
          return { handled: false, reply: null };
        }
        if (cmd.kind !== 'media_received' && cmd.kind !== 'sub_pick') {
          await clearWlIntakeState(db, cmd.chatId);
        }
      }

      // ─── فرم پیام به خانواده: ورودی متنی آزاد به فرم می‌رود ───
      const stuMsgActive = await readStuMsgState(db, cmd.chatId);
      if (stuMsgActive) {
        if (cmd.kind === 'identify' || cmd.kind === 'unknown') {
          const input = rawText ?? (cmd.kind === 'unknown' ? cmd.text : cmd.value);
          const out = await stuBot.msgFeed(cmd.chatId, input);
          if (out) return { handled: true, reply: out.text, buttons: out.buttons };
          return { handled: false, reply: null };
        }
        if (cmd.kind !== 'media_received' && cmd.kind !== 'sub_pick' && cmd.kind !== 'stu_msg_confirm' && cmd.kind !== 'stu_msg_abort') {
          await clearStuState(db, cmd.chatId);
        }
      }

      // ─── ویزارد رویداد: ورودی عددی/متن به فیلد جاری می‌رود؛ هر دستور/لیبل دیگر فرم را لغو می‌کند ───
      const tlFormActive = await tlBot.readTlFormState(cmd.chatId);
      if (tlFormActive) {
        if (cmd.kind === 'identify' || cmd.kind === 'unknown') {
          const input = rawText ?? (cmd.kind === 'unknown' ? cmd.text : cmd.value);
          const out = await tlBot.feedInput(cmd.chatId, input);
          if (out) return { handled: true, reply: out.text, buttons: out.buttons };
          return { handled: false, reply: null };
        }
        if (cmd.kind !== 'media_received' && cmd.kind !== 'sub_pick' && cmd.kind !== 'tl_do' && cmd.kind !== 'tl_no' && cmd.kind !== 'tl_skip' && cmd.kind !== 'tl_opt') {
          await tlBot.abortCreate(cmd.chatId);
        }
      }

      // ─── ویزارد چک‌لیست خانواده: اعداد/متن به آیتم جاری می‌رود ───
      const clfFormActive = await tlBot.readClfFormState(cmd.chatId);
      if (clfFormActive) {
        if (cmd.kind === 'identify' || cmd.kind === 'unknown') {
          // عدد فارسی/لاتین به‌عنوان پاسخ آیتم —: متن آزاد به‌جای سکوت راهنما می‌دهد
          const input = (rawText ?? (cmd.kind === 'unknown' ? cmd.text : cmd.value) ?? '').trim();
          const digits = input.replace(/[^۰-۹0-9]/g, '');
          const norm = digits.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
          if (norm.length > 0) {
            const out = await tlBot.answerItem(cmd.chatId, Number(norm));
            return { handled: true, reply: out.text, buttons: out.buttons };
          }
          return {
            handled: true,
            reply: '📝 پاسخ هر آیتم فقط با دکمه‌های نمره (۰ تا سقف آیتم) ثبت می‌شود — لطفاً از دکمه‌های زیر پیام قبلی استفاده کنید. برای خروج: /cancel',
            buttons: null
          };
        }
        if (cmd.kind !== 'media_received' && cmd.kind !== 'sub_pick' && cmd.kind !== 'clf_do' && cmd.kind !== 'clf_no' && cmd.kind !== 'clf_a') {
          await tlBot.abortFill(cmd.chatId);
        }
      }

      switch (cmd.kind) {
        case 'start': {
          // — پیلود دیپ‌لینک (ble.ir/<bot>?start=CODE) → اتصال با کد
          if (cmd.payload) {
            return await this.processLinkCode(cmd.chatId, cmd.payload);
          }
          // — کیبورد ثابت پس از /start — اگر chat قبلاً متصل است، کیبورد نقشش را می‌گیرد
          const owner0 = await this.resolveOwner(cmd.chatId);
          return { handled: true, reply: renderTemplate('bot_welcome', { clinicName: await deps.settings.getClinicName() }), keyboard: buildBotKeyboard(owner0) };
        }

        case 'help': {
          const ownerHelp = await this.resolveOwner(cmd.chatId);
          return { handled: true, reply: await this.handleHelpCommand(cmd.chatId), keyboard: buildBotKeyboard(ownerHelp) };
        }

        // — «درباره مرکز» (/about یا دکمهٔ متنی)
        case 'about': {
          const ownerAbout = await this.resolveOwner(cmd.chatId);
          return { handled: true, reply: renderTemplate('bot_about', { clinicName: await deps.settings.getClinicName() }), keyboard: buildBotKeyboard(ownerAbout) };
        }

        case 'myid':
          return { handled: true, reply: renderTemplate('bot_myid', { chatId: cmd.chatId }) };

        case 'unknown': {
          // — دستور ناشناخته هم راهنمای نقش‌محور می‌گیرد (نه منوی عمومی)
          const ownerUnknown = await this.resolveOwner(cmd.chatId);
          return { handled: true, reply: await this.handleHelpCommand(cmd.chatId), keyboard: buildBotKeyboard(ownerUnknown) };
        }

        case 'schedule':
          return { handled: true, reply: await this.handleScheduleCommand(cmd.chatId, cmd.scope) };

        // ───: «نوبت‌های من» ───
        case 'my_next': {
          const out = await this.handleMyNextCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        // ───: ورود خودکار با کد ملی/شماره تلفن ───
        case 'identify': {
          const reply = await this.identifyAndReply(cmd.chatId, cmd.format, cmd.value);
          // — پس از اتصال، کیبورد ثابت نقش جدید نصب می‌شود
          const ownerIdentify = await this.resolveOwner(cmd.chatId);
          return { handled: true, reply, keyboard: buildBotKeyboard(ownerIdentify) };
        }

        // ───: لغو دومرحله‌ای نوبت همکار ───
        case 'cancel_ask': {
          const out = await this.handleBotCancel(cmd.chatId, cmd.appointmentId, false);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'cancel_do': {
          const out = await this.handleBotCancel(cmd.chatId, cmd.appointmentId, true);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        // ───: امکانات سایت در بات ───
        case 'followups_me': {
          const out = await this.handleFollowupsCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'followup_done': {
          const out = await this.handleFollowupDone(cmd.chatId, cmd.followupId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'attendance_summary': {
          const out = await this.handleAttendanceSummary(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'center_status': {
          const out = await this.handleCenterStatus(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        // ───: بات نقش‌آگاه ───
        case 'search': {
          const out = await this.handleSearchCommand(cmd.chatId, cmd.query);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'center_schedule': {
          const out = await this.handleCenterScheduleCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'waitlist_list': {
          const out = await this.handleWaitlistCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        // ───: هماهنگی با سایت — شاخص سنجش ───
        case 'screening_goal': {
          const out = await this.handleScreeningGoalCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        // ───: بات نقش‌محور CRM ───
        case 'contact': {
          const out = await this.handleContactCommand();
          return { handled: true, reply: out.text, buttons: out.buttons, keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId)) };
        }
        case 'public_files': {
          const out = await this.handlePublicFilesCommand();
          return { handled: true, reply: out.text, buttons: out.buttons, keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId)) };
        }
        case 'my_students': {
          const out = await this.handleMyStudentsCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'outbox': {
          const out = await this.handleOutboxCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'outbox_flush': {
          const out = await this.handleOutboxFlush(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'kpi_report': {
          const out = await this.handleKpiCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        // ───: بات نقش‌محور نسخهٔ ۲ (کیبورد نقش در پاسخ دوباره نصب می‌شود) ───
        case 'services': {
          const out = await this.handleServicesCommand();
          return { handled: true, reply: out.text, buttons: out.buttons, keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId)) };
        }
        case 'auth_guide': {
          const out = await this.handleAuthGuideCommand();
          return { handled: true, reply: out.text, buttons: out.buttons, keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId)) };
        }
        case 'pending_homework': {
          const out = await this.handlePendingHomeworkCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'class_activity': {
          const out = await stuBot.classActivity(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'awareness_root': {
          const out: AwBotReply = await awBot.root();
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'awareness_section': {
          const out: AwBotReply = await awBot.section(cmd.section as AwSection, cmd.page);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'awareness_item': {
          const out: AwBotReply = await awBot.item(cmd.section as AwSection, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'stu_list': {
          const out = await stuBot.list(cmd.chatId, cmd.page ?? 1);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'stu_menu': {
          const out = await stuBot.menu(cmd.chatId, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'stu_send': {
          const out = await stuBot.sendExercises(cmd.chatId, cmd.stuIdx, cmd.page);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'stu_pick': {
          const out = await stuBot.pick(cmd.chatId, cmd.stuIdx, cmd.exIdx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'stu_yes': {
          const out = await stuBot.yes(cmd.chatId, cmd.stuIdx, cmd.exIdx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'stu_msg_start': {
          const out = await stuBot.msgStart(cmd.chatId, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'stu_msg_confirm': {
          const out = await stuBot.msgConfirm(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'stu_msg_abort': {
          const out = await stuBot.msgAbort(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'stu_hw': {
          const out = await stuBot.homework(cmd.chatId, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'stu_appts': {
          const out = await stuBot.appointments(cmd.chatId, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        // ─── نمای چرخهٔ پرونده در منوی دانش‌آموز ───
        case 'stu_hist': {
          const out = await tlBot.history(cmd.chatId, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'stu_ckl': {
          const out = await tlBot.checklists(cmd.chatId, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        // ───: ویزارد رویداد/گزارش (همکاران) ───
        case 'stu_tl': {
          const out = await tlBot.startCategory(cmd.chatId, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'tl_cat': {
          const out = await tlBot.startCategory(cmd.chatId, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'tl_types': {
          const out = await tlBot.listTypes(cmd.chatId, cmd.stuIdx, cmd.cat);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'tl_start': {
          const out = await tlBot.startForm(cmd.chatId, cmd.stuIdx, cmd.typeIdx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'tl_opt': {
          const out = await tlBot.optionPick(cmd.chatId, cmd.value);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'tl_skip': {
          const out = await tlBot.skipField(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'tl_do': {
          const out = await tlBot.confirmCreate(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'tl_no': {
          const out = await tlBot.abortCreate(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        // ───: چک‌لیست خانواده ───
        case 'clf_list': {
          const out = await tlBot.listMine(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'clf_fill': {
          const out = await tlBot.startFill(cmd.chatId, cmd.eventId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'clf_a': {
          const out = await tlBot.answerItem(cmd.chatId, cmd.value);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'clf_do': {
          const out = await tlBot.confirmFill(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'clf_no': {
          const out = await tlBot.abortFill(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        // ───: بانک تمرین — منوی تو‌در‌تو همکاران و معلمان ───
        case 'exb_root':
        case 'exb_cats':
        case 'exb_list':
        case 'exb_item':
        case 'exb_send':
        case 'exb_pick':
        case 'exb_yes':
        // ───: بسته‌های تمرینی ───
        case 'exb_pkg':
        case 'exb_pitem':
        case 'exb_psend':
        case 'exb_ppick':
        case 'exb_pyes': {
          if (!exbBot) {
            return { handled: true, reply: renderTemplate('bot_exercise_disabled') };
          }
          const out = cmd.kind === 'exb_root'
            ? await exbBot.root(cmd.chatId)
            : await exbBot.handle(cmd.chatId, cmd);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        // ───: حلقهٔ بازگشت فایل — رسانهٔ خانواده + انتخاب تکلیف ───
        case 'media_received': {
          if (!subBot) {
            return {
              handled: true,
              reply: deps.exerciseBank
                ? renderTemplate('bot_submission_unavailable')
                : renderTemplate('bot_exercise_disabled')
            };
          }
          const media: BotMedia = cmd.media;
          const out = await subBot.handleMedia(cmd.chatId, media, cmd.caption);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'sub_pick': {
          if (!subBot) {
            return { handled: true, reply: renderTemplate('bot_exercise_disabled') };
          }
          const out = await subBot.handlePick(cmd.chatId, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        case 'link':
          // — دستور /link CODE و پیلود /start هر دو به processLinkCode می‌روند
          return await this.processLinkCode(cmd.chatId, cmd.code);
      }
    },

    /**
     * — پردازش کد اتصال (از /link CODE یا پیلود دیپ‌لینک /start CODE)
     * چندبارمصرف: کد فعال همیشه کار می‌کند — همین چت = idempotent، چت تازه = انتقال اتصال؛
     * فقط کد لغوشدهٔ معلم (revoked) مرده می‌ماند.
     */
    async processLinkCode(chatId: string, code: string): Promise<{ handled: boolean; reply: string | null; buttons?: InlineButton[][] | null; keyboard?: string[][] | null }> {
      const cmd = { chatId, code };
      {
        //: اول کد کارمند، بعد کد کلاس (معلم مدرسه)، بعد کد دانش‌آموز
        const staffRow = await db.queryOne<StaffBotLinkRow>(...spreadStmt(selectStaffLinkByCode(cmd.code)));
        const staffLink = staffRow ? rowToStaffBotLink(staffRow) : null;

        if (staffLink) {
          // — چندبارمصرف: اتصال دوبارهٔ کد فعال (همین چت = idempotent، چت تازه = انتقال)
          const result = await db.execute(
            ...spreadStmt(linkStaffLink(staffLink.id, cmd.chatId, now().toISOString()))
          );
          const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
          if (changed > 0) {
            await audit.log({
              actorId: 'bale-bot',
              action: 'notification.bot.staff_link',
              resourceType: 'staff_bot_link',
              resourceId: staffLink.id,
              changes: { chatId: { from: staffLink.chatId, to: cmd.chatId }, staffId: { from: null, to: staffLink.staffId } }
            });
            const member = await listStaff(db, true).then((rows) => rows.find((r) => r.id === staffLink.staffId));
            const staffOwner = await this.resolveOwner(cmd.chatId);
            return {
              handled: true,
              reply: renderTemplate('bot_link_success', {
                studentName: member?.full_name ?? 'کارمند',
                extra: 'برنامه کلاس‌های خود را با /today و /week بگیرید.'
              }),
              keyboard: buildBotKeyboard(staffOwner)
            };
          }
          if (staffLink.chatId === cmd.chatId) {
            return { handled: true, reply: renderTemplate('bot_link_already'), keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId)) };
          }
          log.warn('bot.staff_link.revoked', { code: cmd.code });
          return { handled: true, reply: renderTemplate('bot_link_invalid') };
        }

        // — کد اتصال معلم مدرسه (به کلاس)
        const classRow = await db.queryOne<ClassBotLinkRow>(...spreadStmt(selectClassLinkByCode(cmd.code)));
        const classLink = classRow ? rowToClassBotLink(classRow) : null;

        if (classLink) {
          // — چندبارمصرف: اتصال دوبارهٔ کد فعال کلاس؛ کد لغوشده (changed=0) رد می‌شود
          const result = await db.execute(
            ...spreadStmt(linkClassLink(classLink.id, cmd.chatId, now().toISOString()))
          );
          const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
          if (changed > 0) {
            await audit.log({
              actorId: 'bale-bot',
              action: 'notification.bot.class_link',
              resourceType: 'class_bot_link',
              resourceId: classLink.id,
              changes: { chatId: { from: classLink.chatId, to: cmd.chatId }, classId: { from: null, to: classLink.classId } }
            });
            const cls = await db.queryOne<{ name: string; school_name: string }>(
              `SELECT c.name, sc.name AS school_name FROM classes c JOIN schools sc ON sc.id = c.school_id WHERE c.id = ?`,
              [classLink.classId]
            );
            return {
              handled: true,
              reply: renderTemplate('bot_link_success', {
                studentName: cls ? `کلاس ${cls.name} — ${cls.school_name}` : 'کلاس مدرسه',
                extra: 'اعلان مراجعه دانش‌آموزان کلاس شما ارسال می‌شود. برنامه کامل: /today و /week'
              }),
              keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId))
            };
          }
          // — کد لغوشده همیشه «معتبر نیست» (حتی همان چت قبلی)
          log.warn('bot.class_link.revoked', { code: cmd.code });
          return { handled: true, reply: renderTemplate('bot_link_invalid') };
        }

        const row = await db.queryOne<BotLinkRow>(...spreadStmt(selectBotLinkByCode(cmd.code)));
        const link = row ? rowToBotLink(row) : null;

        if (!link) {
          log.warn('bot.link.invalid', { code: cmd.code });
          return { handled: true, reply: renderTemplate('bot_link_invalid') };
        }

        // — چندبارمصرف: اتصال دوبارهٔ کد خانواده — چت تازه جایگزین چت قبلی می‌شود
        // (مثلاً شماره عوض شد یا بات را بلاک/آنبلاک کرده)؛ یادآورها به چت تازه می‌روند.
        const result = await db.execute(
          ...spreadStmt(linkBotLink(link.id, cmd.chatId, now().toISOString()))
        );
        const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
        if (changed === 0) {
          if (link.chatId === cmd.chatId) {
            return { handled: true, reply: renderTemplate('bot_link_already'), keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId)) };
          }
          log.warn('bot.link.failed', { code: cmd.code });
          return { handled: true, reply: renderTemplate('bot_link_invalid') };
        }

        // پس از لینک موفق: chat_id در prefs ثبت می‌شود (idempotent؛ ساعت پیش‌فرض از تنظیمات)
        const flags = await deps.settings.getNotifyFlags();
        await db.execute(
          ...spreadStmt(
            upsertPrefs({
              studentId: link.studentId,
              channel: 'bale',
              chatId: cmd.chatId,
              remindersEnabled: true,
              reminderHoursBefore: flags.defaultReminderHours,
              nowIso: now().toISOString()
            })
          )
        );

        await audit.log({
          actorId: 'bale-bot',
          action: 'notification.bot.link',
          resourceType: 'bot_link',
          resourceId: link.id,
          changes: { chatId: { from: link.chatId, to: cmd.chatId }, studentId: { from: null, to: link.studentId } }
        });

        const student = await students.getStudentById(link.studentId);
        const studentName = student ? `${student.firstName} ${student.lastName}` : '';
        const rebindNote = link.chatId && link.chatId !== cmd.chatId
          ? 'اتصال قبلی این پرونده به این گفتگو منتقل شد.'
          : 'برنامه کلاس‌های خود را با /today و /week بگیرید.';
        return {
          handled: true,
          reply: renderTemplate('bot_link_success', {
            studentName,
            extra: rebindNote
          }),
          keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId))
        };
      }
    },

    /** — نام کاربری بات برای ساخت لینک اتصال خودکار (ble.ir/<bot>?start=<code>)
     * ۱) مقدار ذخیره‌شدهٔ تنظیمات (کلید bot_username) ۲) تشخیص خودکار با Bale getMe + کش در تنظیمات */
    async resolveBotUsername(): Promise<{ username: string | null; source: 'stored' | 'detected' | 'none' }> {
      const stored = await deps.settings.getBotUsername();
      if (stored) return { username: stored, source: 'stored' };
      if (!deps.baleToken) return { username: null, source: 'none' };
      const detected = await resolveUsernameFromBale(deps.baleToken);
      if (!detected) return { username: null, source: 'none' };
      await deps.settings.setBotUsername(detected, BOT_ACTOR);
      await audit.log({
        actorId: 'bale-bot',
        action: 'settings.bot_username.detect',
        resourceType: 'settings',
        resourceId: 'bot_username',
        changes: { bot_username: { from: null, to: detected } }
      });
      log.info('bot_username.detected', { username: detected });
      return { username: detected, source: 'detected' };
    },

    /** — دستورهای /today و /week: برنامه کلاس‌های chat متصل (دانش‌آموز یا کارمند) */
    async handleScheduleCommand(chatId: string, scope: 'today' | 'week'): Promise<string> {
      const owner = await db.queryOne<{ kind: string; ref_id: string }>(
        ...spreadStmt(resolveChatOwner(chatId))
      );
      if (!owner) {
        return renderTemplate('bot_help_guest');
      }

      const clinicName = await deps.settings.getClinicName();
      const todayYmd = tehranTodayYmd();

      let fromYmd: string;
      let toYmd: string;
      let title: string;
      if (scope === 'today') {
        fromYmd = todayYmd;
        toYmd = todayYmd;
        title = `🗓 برنامه امروز شما — ${jalaliFullLabel(todayYmd)}`;
      } else {
        const weekday = iranianWeekdayOfYmd(todayYmd);
        fromYmd = addDaysYmd(todayYmd, -weekday);
        toYmd = addDaysYmd(fromYmd, 6);
        title = `🗓 برنامه این هفته شما — ${jalaliFullLabel(fromYmd)} تا ${jalaliFullLabel(toYmd)}`;
      }

      const { start, end } = tehranRange(fromYmd, toYmd);

      // — معلم مدرسه: برنامه نوبت‌های دانش‌آموزان کلاس‌اش
      if (owner.kind === 'class') {
        const studentIds = await students.listStudentIdsByClass(owner.ref_id);
        const merged: Appointment[] = [];
        const seen = new Set<string>();
        for (const sid of studentIds) {
          const list = await appointments.list({ studentId: sid, from: start, to: end });
          for (const a of list) {
            if (!seen.has(a.id)) {
              seen.add(a.id);
              merged.push(a);
            }
          }
        }
        const names = await studentNamesMap(studentIds);
        return renderScheduleMessage({
          title,
          entries: buildScheduleEntries(merged, { kind: 'staff', names }),
          clinicName
        });
      }

      const rangeAppointments =
        owner.kind === 'staff'
          ? await appointments.list({ staffId: owner.ref_id, from: start, to: end })
          : await appointments.list({ studentId: owner.ref_id, from: start, to: end });

      // فقط نوبت‌های در وضعیت scheduled در «برنامه» نمایش داده می‌شوند (لغوشده‌ها با برچسب)
      const names = new Map<string, string>();
      if (owner.kind === 'staff') {
        const studentIds = [...new Set(rangeAppointments.flatMap((a) => a.students.map((s) => s.studentId)))];
        for (const id of studentIds) {
          const st = await students.getStudentById(id);
          if (st) names.set(id, `${st.firstName} ${st.lastName}`);
        }
        return renderScheduleMessage({
          title,
          entries: buildScheduleEntries(rangeAppointments, { kind: 'staff', names }),
          clinicName
        });
      }

      const staffNames = await staffNamesMap();
      return renderScheduleMessage({
        title,
        entries: buildScheduleEntries(rangeAppointments, { kind: 'student', names: staffNames }),
        clinicName
      });
    },

    async replyToChat(chatId: string, text: string, buttons?: InlineButton[][] | null, keyboard?: string[][] | null): Promise<SendResult> {
      const channel = notify.getChannel('bale');
      if (!channel) {
        return { ok: false, error: 'CHANNEL_UNAVAILABLE' };
      }
      return channel.send({ to: chatId, text, buttons: buttons ?? undefined, keyboard: keyboard ?? undefined });
    },

    // ───────────── ورود خودکار + نوبت‌های من + لغو از بات ─────────────

    /** ورود خودکار: تطبیق کد ملی/تلفن با کارکنان و بعد دانش‌آموزان؛ اتصال idempotent */
    async identifyAndReply(chatId: string, format: IdentityFormat, value: string): Promise<string> {
      if (format === 'invalid') {
        return renderTemplate('bot_identify_invalid');
      }

      // کد ملی: تطبیق تلفن «۰+ارقام» هم امتحان می‌شود (موبایل بدون صفر اول)
      const nid = format === 'national_id' ? value : null;
      const phone = format === 'phone' ? normalizePhoneDigits(value) : '0' + value;

      const staffConds: string[] = [];
      const staffParams: unknown[] = [];
      if (nid) { staffConds.push('national_id = ?'); staffParams.push(nid); }
      if (phone) { staffConds.push('phone = ?'); staffParams.push(phone); }
      const staffRows = await db.query<{ id: string; full_name: string; role: string }>(
        `SELECT id, full_name, role FROM staff WHERE active = 1 AND (${staffConds.join(' OR ')})`,
        staffParams
      );

      if (staffRows.length === 1) {
        const member = staffRows[0];
        const existing = await db.queryOne<{ id: string }>(
          ...spreadStmt(selectStaffLinkIdFor(member.id, chatId))
        );
        if (!existing) {
          await db.execute(
            ...spreadStmt(
              insertStaffLinkLinked({
                id: crypto.randomUUID(),
                code: generateLinkCode(LINK_CODE_LENGTH),
                staffId: member.id,
                chatId,
                nowIso: now().toISOString()
              })
            )
          );
          await audit.log({
            actorId: 'bale-bot',
            action: 'notification.bot.staff_identify',
            resourceType: 'staff_bot_link',
            resourceId: member.id,
            changes: { chatId: { from: null, to: chatId }, staffId: { from: null, to: member.id } }
          });
          log.info('bot.identify.staff', { staffId: member.id });
        }
        return renderTemplate('bot_identify_staff', {
          name: member.full_name,
          roleLine: STAFF_ROLE_LABEL[member.role]
        });
      }

      if (staffRows.length > 1) {
        log.warn('bot.identify.staff_ambiguous', { count: staffRows.length });
        return renderTemplate('bot_identify_ambiguous');
      }

      // ─── دانش‌آموز(ان) — تلفن مشترک ولیّ → همهٔ فرزندان با هم متصل می‌شوند ───
      const studentConds: string[] = [];
      const studentParams: unknown[] = [];
      if (nid) { studentConds.push('national_id = ?'); studentParams.push(nid); }
      if (phone) { studentConds.push('guardian_phone = ?'); studentParams.push(phone); }
      const studentRows = await db.query<{ id: string; first_name: string; last_name: string }>(
        `SELECT id, first_name, last_name FROM students WHERE active = 1 AND (${studentConds.join(' OR ')})`,
        studentParams
      );

      if (studentRows.length === 0) {
        log.warn('bot.identify.notfound', { format });
        return renderTemplate('bot_identify_notfound');
      }

      // ─── قفل اتصال دوم خانواده (بستن حفرهٔ تصاحبهٔ اعلان) ───
      // اگر چتِ «دیگری» از قبل به یکی از این دانش‌آموزان متصل است، ورود با
      // کد ملی/تلفن رد می‌شود — وگرنه هر کسی شمارهٔ ولیّ را بداند می‌تواند
      // یادآور/اعلان‌ها را تصاحب کند. مسیر قانونی: /link با کدی که دفتر می‌سازد.
      const studentIds = studentRows.map((s) => s.id);
      const placeholders = studentIds.map(() => '?').join(',');
      const claimedRows = await db.query<{ student_id: string; chat_id: string }>(
        `SELECT student_id, chat_id FROM bot_links
          WHERE status = 'linked' AND chat_id IS NOT NULL AND chat_id != ?
            AND student_id IN (${placeholders})`,
        [chatId, ...studentIds]
      );
      if (claimedRows.length > 0) {
        await audit.log({
          actorId: 'bale-bot',
          action: 'notification.bot.family_link_denied',
          resourceType: 'bot_link',
          resourceId: claimedRows[0].student_id,
          changes: {
            chatId: { from: null, to: chatId },
            claimedBy: { from: null, to: claimedRows[0].chat_id }
          }
        });
        log.warn('bot.identify.family_link_denied', { claimed: claimedRows.length });
        return renderTemplate('bot_family_link_denied', { clinicName: await deps.settings.getClinicName() });
      }

      const flags = await deps.settings.getNotifyFlags();
      const nameLines: string[] = [];
      for (const s of studentRows) {
        const existing = await db.queryOne<{ id: string }>(
          ...spreadStmt(selectBotLinkIdFor(s.id, chatId))
        );
        if (!existing) {
          await db.execute(
            ...spreadStmt(
              insertBotLinkLinked({
                id: crypto.randomUUID(),
                code: generateLinkCode(LINK_CODE_LENGTH),
                studentId: s.id,
                chatId,
                nowIso: now().toISOString()
              })
            )
          );
          await audit.log({
            actorId: 'bale-bot',
            action: 'notification.bot.identify',
            resourceType: 'bot_link',
            resourceId: s.id,
            changes: { chatId: { from: null, to: chatId }, studentId: { from: null, to: s.id } }
          });
        }
        // prefs برای یادآوری — مثل مسیر /link (idempotent)
        await db.execute(
          ...spreadStmt(
            upsertPrefs({
              studentId: s.id,
              channel: 'bale',
              chatId,
              remindersEnabled: true,
              reminderHoursBefore: flags.defaultReminderHours,
              nowIso: now().toISOString()
            })
          )
        );
        nameLines.push(`• ${s.first_name} ${s.last_name}`);
      }
      log.info('bot.identify.students', { count: studentRows.length });
      return renderTemplate('bot_identify_students', { extra: nameLines.join('\n') });
    },

    /** «نوبت‌های من» — همکار: ۷ روز آینده با دکمه لغو؛ والد: ۱۴ روز آینده همهٔ فرزندان؛ معلم مدرسه: برنامه هفته */
    async handleMyNextCommand(chatId: string): Promise<BotReply> {
      const owner = await db.queryOne<{ kind: string; ref_id: string }>(
        ...spreadStmt(resolveChatOwner(chatId))
      );
      if (!owner) {
        return { text: renderTemplate('bot_help_guest'), buttons: null };
      }

      const clinicName = await deps.settings.getClinicName();
      const nowIso = now().toISOString();

      // معلم مدرسه (اتصال به کلاس) — همان برنامهٔ هفته
      if (owner.kind === 'class') {
        const text = await this.handleScheduleCommand(chatId, 'week');
        return { text, buttons: null };
      }

      // ─── همکار مرکز: نوبت‌های ۷ روز آینده + دکمهٔ لغو ───
      if (owner.kind === 'staff') {
        const list = await appointments.list({ staffId: owner.ref_id, from: nowIso, to: addMinutes(nowIso, 7 * 24 * 60) });
        const studentIds = [...new Set(list.flatMap((a) => a.students.map((s) => s.studentId)))];
        const names = await studentNamesMap(studentIds);
        const entries = buildScheduleEntries(list, { kind: 'staff', names });
        const title = `🗓 نوبت‌های پیش‌روی شما — از ${jalaliFullLabel(tehranYmdOf(nowIso))}`;
        const text = renderScheduleMessage({ title, entries, clinicName });

        const sorted = [...list].sort((a, b) => a.startAt.localeCompare(b.startAt));
        const buttons = sorted
          .filter((a) => a.status === 'scheduled')
          .slice(0, 8)
          .map((a) => [{ text: `لغو ${tehranTimeLabel(a.startAt)}`, callbackData: `ask:${a.id}` }]);
        return { text, buttons: buttons.length > 0 ? buttons : null };
      }

      // ─── والد: همهٔ فرزندان متصل (تلفن مشترک) — ۱۴ روز آینده ───
      const chatStudentRows = await db.query<{ student_id: string }>(
        ...spreadStmt(selectStudentIdsByChat(chatId))
      );
      const studentIds = [...new Set([...chatStudentRows.map((r) => r.student_id), owner.ref_id])];

      const merged: Appointment[] = [];
      const seen = new Set<string>();
      for (const sid of studentIds) {
        const list = await appointments.list({ studentId: sid, from: nowIso, to: addMinutes(nowIso, 14 * 24 * 60) });
        for (const a of list) {
          if (!seen.has(a.id)) {
            seen.add(a.id);
            merged.push(a);
          }
        }
      }
      merged.sort((a, b) => a.startAt.localeCompare(b.startAt));

      const [staffNames, studentNames] = await Promise.all([
        staffNamesMap(),
        studentNamesMap(studentIds)
      ]);
      const multi = studentIds.length > 1;
      const entries = merged.map((a) => ({
        timeLabel: tehranTimeLabel(a.startAt),
        title: staffNames.get(a.staffId) ?? 'متخصص',
        subtitle: multi
          ? `فرزند: ${a.students.map((s) => studentNames.get(s.studentId)).filter((n): n is string => Boolean(n)).join('، ') || '—'}`
          : undefined,
        cancelled: a.status === 'cancelled'
      }));

      let text = renderScheduleMessage({
        title: '🗓 نوبت‌های پیش‌روی شما',
        entries,
        clinicName
      });
      if (merged.length > 0) {
        text += '\n\nبرای تغییر یا لغو نوبت با دفتر مرکز در تماس باشید.';
      }
      return { text, buttons: null };
    },

    /** لغو نوبت توسط همکار: ask = پرسش تأیید با دکمه، do = cancel با version فعلی + اعلان خودکار خانواده */
    async handleBotCancel(chatId: string, appointmentId: string, confirm: boolean): Promise<BotReply> {
      const owner = await db.queryOne<{ kind: string; ref_id: string }>(
        ...spreadStmt(resolveChatOwner(chatId))
      );
      if (!owner || owner.kind !== 'staff') {
        return { text: renderTemplate('bot_cancel_rejected'), buttons: null };
      }

      const appt = await appointments.getById(appointmentId);
      if (!appt || appt.staffId !== owner.ref_id) {
        return { text: renderTemplate('bot_cancel_rejected'), buttons: null };
      }
      // نوبت لغوشده → rejected (نه conflict — تداخل یعنی تغییر هم‌زمان در پنل)
      if (appt.status !== 'scheduled') {
        return { text: renderTemplate('bot_cancel_rejected'), buttons: null };
      }

      const vars = {
        dateYmd: jalaliFullLabel(tehranYmdOf(appt.startAt)),
        timeLabel: tehranTimeLabel(appt.startAt),
        studentNames: await studentNamesMap(appt.students.map((s) => s.studentId)).then((m) =>
          appt.students.map((s) => m.get(s.studentId)).filter((n): n is string => Boolean(n)).join('، ')
        )
      };

      if (!confirm) {
        return {
          text: renderTemplate('bot_cancel_ask', vars),
          buttons: [[{ text: 'بله، لغو شود', callbackData: `cancel:${appt.id}` }]]
        };
      }

      try {
        await appointments.cancel(appt.id, appt.version, BOT_ACTOR);
      } catch (err) {
        if (err instanceof ConflictError) {
          log.warn('bot.cancel.conflict', { appointmentId });
          return { text: renderTemplate('bot_cancel_conflict'), buttons: null };
        }
        throw err;
      }
      log.info('bot.cancel.done', { appointmentId });
      return { text: renderTemplate('bot_cancel_success', vars), buttons: null };
    },

    // ───────────── بات اطلاع‌رسان: پیگیری‌ها + حضور فرزند + وضعیت مرکز + خلاصهٔ روز ─────────────

    /** resolve chat با نقش کارمند (برای گیت مدیر/منشی) */
    async resolveOwner(chatId: string): Promise<{ kind: string; ref_id: string; role: string | null } | null> {
      return db.queryOne<{ kind: string; ref_id: string; role: string | null }>(
        ...spreadStmt(resolveChatOwner(chatId))
      );
    },

    /** «پیگیری‌های من» — فقط همکاران مرکز؛ گروه‌بندی §13.4 + دکمهٔ انجام (حداکثر ۸) */
    async handleFollowupsCommand(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) {
        return { text: renderTemplate('bot_help_guest'), buttons: null };
      }
      if (owner.kind !== 'staff') {
        return { text: renderTemplate('bot_followups_denied'), buttons: null };
      }

      const [clinicName, list] = await Promise.all([
        deps.settings.getClinicName(),
        followups.list({ assigneeId: owner.ref_id, group: 'open' }, BOT_ACTOR)
      ]);
      const groups = groupFollowUpsForBot(list, now());
      const text = renderFollowupsMessage({
        title: `✅ پیگیری‌های روی میز شما — ${jalaliFullLabel(tehranTodayYmd(now()))}`,
        groups,
        clinicName
      });

      const ordered = [...groups.overdue, ...groups.today, ...groups.week, ...groups.open];
      const buttons = ordered
        .slice(0, 8)
        .map((it) => [{ text: 'انجام شد', callbackData: `fudone:${it.id}` }]);
      return { text, buttons: buttons.length > 0 ? buttons : null };
    },

    /** تکمیل پیگیری از بات — فقط خودِ مسئول؛ همان قواعد دامنه (open/in_progress → done) */
    async handleFollowupDone(chatId: string, followupId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner || owner.kind !== 'staff') {
        return { text: renderTemplate('bot_followup_rejected'), buttons: null };
      }

      const f = await followups.getById(followupId);
      if (!f || f.assigneeId !== owner.ref_id || (f.status !== 'open' && f.status !== 'in_progress')) {
        return { text: renderTemplate('bot_followup_rejected'), buttons: null };
      }

      try {
        await followups.update(followupId, { status: 'done' }, BOT_ACTOR);
      } catch (err) {
        if (err instanceof ConflictError) {
          log.warn('bot.followup.conflict', { followupId });
          return { text: renderTemplate('bot_followup_rejected'), buttons: null };
        }
        throw err;
      }
      log.info('bot.followup.done', { followupId, chatId });
      return { text: renderTemplate('bot_followup_done', { taskTitle: f.title }), buttons: null };
    },

    /** «حضور فرزند» — والدین: آمار ۳۰ روز اخیر جلسات هر فرزند متصل (شامل لغوشده‌ها) */
    async handleAttendanceSummary(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) {
        return { text: renderTemplate('bot_help_guest'), buttons: null };
      }

      let studentIds: string[] = [];
      if (owner.kind === 'student') {
        // همهٔ فرزندان این chat: bot_links + prefs (همان الگوی «نوبت‌های من»)
        const chatStudentRows = await db.query<{ student_id: string }>(
          ...spreadStmt(selectStudentIdsByChat(chatId))
        );
        const prefIds = await db.query<{ student_id: string }>(
          `SELECT student_id FROM notification_prefs WHERE chat_id = ? AND reminders_enabled = 1`,
          [chatId]
        );
        studentIds = [...new Set([...chatStudentRows.map((r) => r.student_id), ...prefIds.map((r) => r.student_id), owner.ref_id])];
      }
      if (studentIds.length === 0) {
        return { text: renderTemplate('bot_attendance_denied'), buttons: null };
      }

      const todayYmd = tehranTodayYmd(now());
      const fromYmd = addDaysYmd(todayYmd, -30);
      const { start, end } = tehranRange(fromYmd, todayYmd);
      const names = await studentNamesMap(studentIds);

      const children: AttendanceChildSummary[] = [];
      for (const sid of studentIds) {
        const rows = await db.query<{ attendance: string; cnt: number }>(
          `SELECT s.attendance, COUNT(*) AS cnt
             FROM appointment_students s
             JOIN appointments a ON a.id = s.appointment_id
            WHERE s.student_id = ? AND a.start_at >= ? AND a.start_at <= ?
            GROUP BY s.attendance`,
          [sid, start, end]
        );
        const c: AttendanceChildSummary = { name: names.get(sid) ?? '', present: 0, absent: 0, pending: 0, cancelled: 0 };
        for (const r of rows) {
          if (r.attendance === 'present') c.present += r.cnt;
          else if (r.attendance === 'late') c.present += r.cnt; // — تأخیر هم حضور است
          else if (r.attendance === 'absent') c.absent += r.cnt;
          else if (r.attendance === 'pending') c.pending += r.cnt;
          else if (r.attendance === 'cancelled') c.cancelled += r.cnt;
        }
        children.push(c);
      }

      const clinicName = await deps.settings.getClinicName();
      const text = renderAttendanceSummary({
        title: `📊 حضور فرزند — ۳۰ روز اخیر (از ${jalaliFullLabel(fromYmd)})`,
        children,
        clinicName
      });
      return { text, buttons: null };
    },

    /** «وضعیت مرکز» — فقط مدیر/منشی: جلسات/حضور/لیست انتظار/پیگیری‌های امروز در یک پیام */
    async handleCenterStatus(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) {
        return { text: renderTemplate('bot_help_guest'), buttons: null };
      }
      if (owner.kind !== 'staff' || (owner.role !== 'manager' && owner.role !== 'secretary')) {
        return { text: renderTemplate('bot_status_denied'), buttons: null };
      }

      const nowDate = now();
      const todayYmd = tehranTodayYmd(nowDate);
      const { start, end } = tehranRange(todayYmd, todayYmd);
      const nowIso = nowDate.toISOString();

      const [sessionRow, attRows, waitlistRow, overdueRow, todayRow, pendingCklRow, noReportRow, clinicName] = await Promise.all([
        db.queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM appointments WHERE status = 'scheduled' AND start_at >= ? AND start_at < ?`,
          [start, end]
        ),
        db.query<{ attendance: string; cnt: number }>(
          `SELECT s.attendance, COUNT(*) AS cnt
             FROM appointment_students s
             JOIN appointments a ON a.id = s.appointment_id
            WHERE a.start_at >= ? AND a.start_at < ? AND a.status != 'cancelled'
            GROUP BY s.attendance`,
          [start, end]
        ),
        db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM waitlist WHERE status IN ('waiting', 'called')`),
        db.queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM followups WHERE status IN ('open', 'in_progress') AND due_at IS NOT NULL AND due_at < ?`,
          [nowIso]
        ),
        db.queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM followups WHERE status IN ('open', 'in_progress') AND due_at IS NOT NULL AND due_at >= ? AND due_at <= ?`,
          [nowIso, end]
        ),
        // — سنجه‌های چرخهٔ پرونده
        db.queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n
             FROM case_events e JOIN case_event_types t ON t.id = e.event_type_id
            WHERE e.status = 'pending_family' AND t.family_fillable = 1`
        ),
        db.queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n
             FROM appointments a
            WHERE a.start_at >= ? AND a.start_at < ? AND a.status != 'cancelled'
              AND NOT EXISTS (
                SELECT 1 FROM case_events ce JOIN case_event_types ct ON ct.id = ce.event_type_id
                 WHERE ce.appointment_id = a.id AND ct.category = 'session' AND ce.status != 'cancelled'
              )
              AND NOT EXISTS (
                SELECT 1 FROM appointment_students aps
                 WHERE aps.appointment_id = a.id AND aps.session_note IS NOT NULL AND aps.session_note != ''
              )`,
          [start, end]
        ),
        deps.settings.getClinicName()
      ]);

      const text = renderCenterStatus({
        title: `🏥 وضعیت مرکز — ${jalaliFullLabel(todayYmd)}`,
        sessionsToday: sessionRow?.n ?? 0,
        presentToday: (attRows.find((r) => r.attendance === 'present')?.cnt ?? 0)
          + (attRows.find((r) => r.attendance === 'late')?.cnt ?? 0), // — تأخیر هم حضور
        absentToday: attRows.find((r) => r.attendance === 'absent')?.cnt ?? 0,
        waitlistOpen: waitlistRow?.n ?? 0,
        followupsOverdue: overdueRow?.n ?? 0,
        followupsToday: todayRow?.n ?? 0,
        pendingChecklists: pendingCklRow?.n ?? 0,
        sessionsWithoutReport: noReportRow?.n ?? 0,
        clinicName
      });
      return { text, buttons: null };
    },

    /**
     * — «هدف سنجش» (/goal) — هماهنگی بات با داشبورد سایت:
     * همان شمارنده‌های امروز/هفته/ماه و همان کارت‌های هدف (سال/ماه/بازهٔ سفارشی)
     * که داشبورد نشان می‌دهد — با همان گیت نقش (فقط مدیر/منشی) و همان احراز هویت.
     */
    async handleScreeningGoalCommand(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) {
        return { text: renderTemplate('bot_help_guest'), buttons: null };
      }
      if (owner.kind !== 'staff' || (owner.role !== 'manager' && owner.role !== 'secretary')) {
        return { text: renderTemplate('bot_goal_denied'), buttons: null };
      }
      if (!deps.screening) {
        return { text: '📊 شاخص سنجش این لحظه در دسترس نیست.', buttons: null };
      }

      const nowDate = now();
      const todayYmd = tehranTodayYmd(nowDate);

      const targets = await deps.settings.getScreeningTargets();
      const qw = goalsQueryWindow(targets, todayYmd);
      const dayCounts = await deps.screening.dayCounts(qw.fromYmd, qw.toYmd);

      const goals = summarizeScreeningGoals(targets, dayCounts, todayYmd);
      const todayCount = dayCounts.find((d) => d.day === todayYmd)?.count ?? 0;
      const weekStart = addDaysYmd(todayYmd, -6);
      const monthStart = addDaysYmd(todayYmd, -29);
      let weekCount = 0;
      let monthCount = 0;
      for (const d of dayCounts) {
        if (d.day >= weekStart && d.day <= todayYmd) weekCount += d.count;
        if (d.day >= monthStart && d.day <= todayYmd) monthCount += d.count;
      }

      const text = renderScreeningGoal({
        title: `📊 شاخص سنجش — ${jalaliFullLabel(todayYmd)}`,
        todayCount,
        weekCount,
        monthCount,
        goals,
        clinicName: await deps.settings.getClinicName()
      });
      return { text, buttons: null };
    },

    /**
     * — راهنمای نقش‌محور: هر مخاطب فقط دستورهای نقش خودش را می‌بیند.
     * اتصال‌نشده → راهنمای ورود؛ مدیر/منشی → منوی دفتر؛ متخصص → منوی همکار؛
     * معلم مدرسه → برنامه کلاس؛ والد → منوی خانواده.
     */
    async handleHelpCommand(chatId: string): Promise<string> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) return renderTemplate('bot_help_guest');

      if (owner.kind === 'staff') {
        if (owner.role === 'manager' || owner.role === 'secretary') return renderTemplate('bot_help_office');
        if (owner.role === 'therapist') return renderTemplate('bot_help_therapist');
        // — ناظر اداره: راهنمای اختصاصی
        if (owner.role === 'supervisor') return renderTemplate('bot_help_supervisor');
        return renderTemplate('bot_help'); // نقش ناشناخته — راهنمای عمومی
      }
      if (owner.kind === 'class') return renderTemplate('bot_help_class');
      return renderTemplate('bot_help_parent');
    },

    /**
     * — «جستجوی دانش‌آموز» (/search نام) — به ارث برده از جستجوی سراسری پنل.
     * گیت: فقط همکاران مرکز (همان مرز ورود به پنل). خروجی عمداً بدون national_id/تلفن —
     * PII در پنل می‌ماند (کانال بات احراز هویت ضعیف‌تری دارد — §6 BOT-FLOW).
     */
    async handleSearchCommand(chatId: string, rawQuery: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) return { text: renderTemplate('bot_help_guest'), buttons: null };
      if (owner.kind !== 'staff') return { text: renderTemplate('bot_search_denied'), buttons: null };
      // — ناظر اداره از دادهٔ اسم‌دار محروم است (فقط KPI تجمیعی)
      if (owner.role !== 'manager' && owner.role !== 'secretary' && owner.role !== 'therapist') {
        return { text: renderTemplate('bot_search_denied'), buttons: null };
      }

      const q = rawQuery.trim().replace(/\s+/g, ' ');
      if (q.length < 2) {
        // پرس‌وجوی کوتاه — همان راهنمای نقش (خط /search را دارد)
        return { text: await this.handleHelpCommand(chatId), buttons: null };
      }

      const pattern = `%${q}%`;
      const rows = await db.query<{ first_name: string; last_name: string; grade: string | null }>(
        `SELECT first_name, last_name, grade
           FROM students
          WHERE active = 1
            AND (first_name LIKE ? OR last_name LIKE ? OR (first_name || ' ' || last_name) LIKE ?)
          ORDER BY last_name, first_name
          LIMIT 5`,
        [pattern, pattern, pattern]
      );

      const clinicName = await deps.settings.getClinicName();
      const text = renderSearchResults({
        title: `🔎 جستجوی «${q}»`,
        items: rows.map((r) => ({ name: `${r.first_name} ${r.last_name}`, grade: r.grade })),
        clinicName
      });
      log.info('bot.search', { by: owner.ref_id, hits: rows.length });
      return { text, buttons: null };
    },

    /**
     * — «برنامهٔ مرکز» (/center) — به ارث برده از بورد «روز کاری» پنل.
     * فقط مدیر/منشی؛ برنامهٔ امروز همهٔ همکاران (سقف ۱۲ ردیف — کاملش در پنل).
     */
    async handleCenterScheduleCommand(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) return { text: renderTemplate('bot_help_guest'), buttons: null };
      if (owner.kind !== 'staff' || (owner.role !== 'manager' && owner.role !== 'secretary')) {
        return { text: renderTemplate('bot_center_denied'), buttons: null };
      }

      const todayYmd = tehranTodayYmd(now());
      const { start, end } = tehranRange(todayYmd, todayYmd);
      const list = await appointments.list({ from: start, to: end });

      const staffNames = await staffNamesMap();
      const studentIds = [...new Set(list.flatMap((a) => a.students.map((s) => s.studentId)))];
      const names = await studentNamesMap(studentIds);

      const rows = list.map((a) => ({
        timeLabel: tehranTimeLabel(a.startAt),
        staffName: staffNames.get(a.staffId) ?? '—',
        studentNames: a.students
          .filter((s) => s.attendance !== 'cancelled')
          .map((s) => names.get(s.studentId) ?? '')
          .filter((n) => n.length > 0),
        cancelled: a.status === 'cancelled'
      }));

      const clinicName = await deps.settings.getClinicName();
      const text = renderCenterSchedule({
        title: `📋 برنامهٔ مرکز — ${jalaliFullLabel(todayYmd)}`,
        rows,
        clinicName
      });
      log.info('bot.center_schedule', { by: owner.ref_id, rows: rows.length });
      return { text, buttons: null };
    },

    /**
     * — «لیست انتظار» (/waitlist یا «لیست انتظار») — به ارث برده از ماژول لیست انتظار پنل.
     * فقط مدیر/منشی؛ متقاضیانِ باز (waiting/called) با همان ترتیب پنل (orderWaitlist دامنه)
     * — سقف ۸ ردیف + شمارندهٔ کل.
     */
    async handleWaitlistCommand(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) return { text: renderTemplate('bot_help_guest'), buttons: null };
      // — درمانگر هم «لیست انتظار» را می‌بیند (فقط-خواندن؛ ثبت از سایت)
      if (owner.kind !== 'staff' || (owner.role !== 'manager' && owner.role !== 'secretary' && owner.role !== 'therapist')) {
        return { text: renderTemplate('bot_waitlist_denied'), buttons: null };
      }

      const rows = await db.query<{
        id: string;
        first_name: string;
        last_name: string;
        service_type: string | null;
        priority: 'normal' | 'urgent';
        status: 'waiting' | 'called';
        manual_order: number | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, first_name, last_name, service_type, priority, status, manual_order, created_at, updated_at
           FROM waitlist
          WHERE deleted_at IS NULL AND status IN ('waiting', 'called')`,
        []
      );

      const nowMs = now().getTime();
      // همان ترتیب پنل روی ردیف‌های اصلی (orderWaitlist permutation خالص است)
      const sortedRows = orderWaitlist(
        rows.map((r) => ({
          id: r.id,
          firstName: r.first_name,
          lastName: r.last_name,
          serviceType: r.service_type,
          priority: r.priority,
          status: r.status,
          manualOrder: r.manual_order,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }))
      );
      const clinicName = await deps.settings.getClinicName();
      const text = renderWaitlistList({
        title: `⏳ لیست انتظار — ${jalaliFullLabel(tehranTodayYmd(now()))}`,
        items: sortedRows.map((r) => ({
          name: `${r.firstName} ${r.lastName}`,
          service: r.serviceType,
          urgent: r.priority === 'urgent',
          daysWaiting: waitlistDaysOf(r.createdAt, nowMs)
        })),
        totalOpen: sortedRows.length,
        clinicName
      });
      log.info('bot.waitlist', { by: owner.ref_id, open: sortedRows.length });
      return { text, buttons: null };
    },

    // ═══════════════ — بات نقش‌محور CRM ═══════════════

    /** — «شماره تماس» — برای همهٔ مخاطبان (عموم/خانواده/معلم/همکار) */
    async handleContactCommand(): Promise<BotReply> {
      const [phone, clinicName] = await Promise.all([
        deps.settings.getClinicPhone(),
        deps.settings.getClinicName()
      ]);
      return { text: renderTemplate('bot_contact', { phone, clinicName }), buttons: null };
    },

    /** — «خدمات مرکز» — چهار خدمت اصلی؛ برای همهٔ مخاطبان */
    async handleServicesCommand(): Promise<BotReply> {
      return { text: renderTemplate('bot_services', { clinicName: await deps.settings.getClinicName() }), buttons: null };
    },

    /** — «احراز هویت» — راهنمای مسیرهای اتصال؛ برای همهٔ مخاطبان */
    async handleAuthGuideCommand(): Promise<BotReply> {
      return { text: renderTemplate('bot_auth_guide'), buttons: null };
    },

    /**
     * — «تمرین‌های انجام‌نشده» — تکلیف‌های باز همهٔ فرزندان متصل (خانواده).
     * مرز همان «نوبت‌های من»: bot_links + prefs + owner.ref_id.
     */
    async handlePendingHomeworkCommand(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) return { text: renderTemplate('bot_help_guest'), buttons: null };
      if (owner.kind !== 'student') {
        return { text: renderTemplate('bot_attendance_denied'), buttons: null };
      }
      if (!deps.exerciseBank) {
        return { text: renderTemplate('bot_exercise_disabled'), buttons: null };
      }

      const chatStudentRows = await db.query<{ student_id: string }>(
        ...spreadStmt(selectStudentIdsByChat(chatId))
      );
      const prefIds = await db.query<{ student_id: string }>(
        `SELECT student_id FROM notification_prefs WHERE chat_id = ? AND reminders_enabled = 1`,
        [chatId]
      );
      const studentIds = [...new Set([...chatStudentRows.map((r) => r.student_id), ...prefIds.map((r) => r.student_id), owner.ref_id])];

      const lines: string[] = [];
      let openTotal = 0;
      const multi = studentIds.length > 1;
      for (const sid of studentIds) {
        const list = await deps.exerciseBank.listAssignments({ studentId: sid, limit: 20 });
        const open = list.filter((a) => a.status === 'assigned');
        if (open.length === 0) continue;
        openTotal += open.length;
        for (const a of open.slice(0, 8)) {
          const who = multi ? `${a.studentName} — ` : '';
          lines.push(`• ${a.exerciseTitle}${who ? ` — ${who}` : ` — ${a.studentName}`}${a.createdAt ? ` (${jalaliFullLabel(tehranYmdOf(a.createdAt))})` : ''}`);
        }
      }

      log.info('bot.pending_homework', { chatId, students: studentIds.length, open: openTotal });
      return {
        text: renderTemplate('bot_pending_homework', {
          clinicName: await deps.settings.getClinicName(),
          list: openTotal > 0
            ? lines.join('\n')
            : '✅ تکلیف بازی برای فرزندان شما باز نیست — عالیت!',
          count: faDigits(String(openTotal))
        }),
        buttons: null
      };
    },

    /** — «فایل‌های آموزشی» — عموم مردم؛ لینک صفحات HTML عمومی سایت */
    async handlePublicFilesCommand(): Promise<BotReply> {
      const clinicName = await deps.settings.getClinicName();
      const base = (deps.publicBaseUrl ?? '').replace(/\/$/, '');
      const links = base
        ? [
            `${base}/downloads/training/rahnamaye-samaneh.html`,
            `${base}/downloads/training/faq-samaneh.html`,
            `${base}/downloads/dossiers/index.html`
          ].join('\n')
        : '';
      return { text: renderTemplate('bot_public_files', { clinicName, links }), buttons: null };
    },

    /** — «دانش‌آموزان من» — فهرست دانش‌آموزان کلاس برای معلم مدرسه */
    async handleMyStudentsCommand(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) return { text: renderTemplate('bot_help_guest'), buttons: null };
      if (owner.kind !== 'class') {
        return { text: renderTemplate('bot_my_students_denied'), buttons: null };
      }

      const cls = await db.queryOne<{ name: string; school_name: string }>(
        `SELECT c.name, sc.name AS school_name
           FROM classes c JOIN schools sc ON sc.id = c.school_id
          WHERE c.id = ?`,
        [owner.ref_id]
      );
      const rows = await db.query<{
        first_name: string;
        last_name: string;
        grade: string | null;
        case_status: string | null;
        special_need_type: string | null;
      }>(
        `SELECT first_name, last_name, grade, case_status, special_need_type
           FROM students
          WHERE class_id = ? AND active = 1
          ORDER BY last_name, first_name
          LIMIT 40`,
        [owner.ref_id]
      );

      const CASE_LABELS: Record<string, string> = {
        identified: 'شناسایی‌شده',
        awaiting_assessment: 'در انتظار ارزیابی',
        in_intervention: 'در مداخله',
        monitoring: 'پایش',
        archived: 'بایگانی'
      };
      const list = rows
        .map((r) => {
          const status = r.case_status ? (CASE_LABELS[r.case_status] ?? r.case_status) : 'بدون پرونده';
          return `• ${r.first_name} ${r.last_name}${r.grade ? ` (${r.grade})` : ''} — ${status}`;
        })
        .join('\n');

      log.info('bot.my_students', { classId: owner.ref_id, count: rows.length });
      return {
        text: renderTemplate('bot_my_students', {
          className: cls ? `${cls.name} — ${cls.school_name}` : 'کلاس',
          count: faDigits(rows.length),
          list: list || '—',
          clinicName: await deps.settings.getClinicName()
        }),
        buttons: null
      };
    },

    /** — «اعلان‌های در صف» — شمارش پیش‌نویس/ناموفق؛ فقط همکاران مرکز */
    async handleOutboxCommand(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) return { text: renderTemplate('bot_help_guest'), buttons: null };
      if (owner.kind !== 'staff' || (owner.role !== 'manager' && owner.role !== 'secretary' && owner.role !== 'therapist')) {
        return { text: renderTemplate('bot_outbox_denied'), buttons: null };
      }

      const draftRow = await db.queryOne<{ n: number; next: string | null }>(
        `SELECT COUNT(*) AS n, MIN(send_at) AS next FROM notifications WHERE status = 'pending' AND send_at IS NOT NULL`
      );
      const readyRow = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM notifications WHERE status = 'pending' AND send_at IS NULL`
      );
      const failedRow = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM notifications WHERE status = 'failed'`
      );

      const nextSend = draftRow?.next
        ? `${tehranTimeLabel(draftRow.next)} (${jalaliFullLabel(tehranYmdOf(draftRow.next))})`
        : null;
      const isOffice = owner.role === 'manager' || owner.role === 'secretary';
      log.info('bot.outbox', { by: owner.ref_id, drafts: draftRow?.n ?? 0, failed: failedRow?.n ?? 0 });

      return {
        text: renderTemplate('bot_outbox', {
          draftCount: faDigits(draftRow?.n ?? 0),
          nextSend,
          readyCount: faDigits(readyRow?.n ?? 0),
          failedCount: faDigits(failedRow?.n ?? 0),
          clinicName: await deps.settings.getClinicName()
        }),
        // «ارسال فوری» فقط دفتر — درمانگر فقط وضعیت را می‌بیند
        buttons: isOffice
          ? [[{ text: 'ارسال فوری صف', callbackData: 'outbox:flush' }]]
          : null
      };
    },

    /** — «ارسال فوری صف» — رهاسازی همهٔ پیش‌نویس‌ها + dispatch؛ فقط مدیر/منشی */
    async handleOutboxFlush(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) return { text: renderTemplate('bot_help_guest'), buttons: null };
      if (owner.kind !== 'staff' || (owner.role !== 'manager' && owner.role !== 'secretary')) {
        return { text: renderTemplate('bot_outbox_denied'), buttons: null };
      }

      const released = await notify.releaseAllDrafts();
      const summary = await notify.dispatchPending(100);
      await audit.log({
        actorId: owner.ref_id,
        action: 'notification.outbox.flush',
        resourceType: 'notification',
        resourceId: 'outbox',
        changes: { released: { from: null, to: released }, sent: { from: null, to: summary.sent } }
      });
      log.info('bot.outbox.flush', { by: owner.ref_id, released, sent: summary.sent });
      return {
        text: renderTemplate('bot_outbox_flushed', {
          released: faDigits(released),
          sent: faDigits(summary.sent),
          clinicName: await deps.settings.getClinicName()
        }),
        buttons: null
      };
    },

    /**
     * — «گزارش KPI» — ناظر اداره (و مدیر)؛ فقط تجمیعی بدون نام دانش‌آموز.
     * بازه: ۷ روز گذشته تهران.
     */
    async handleKpiCommand(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) return { text: renderTemplate('bot_help_guest'), buttons: null };
      if (owner.kind !== 'staff' || (owner.role !== 'supervisor' && owner.role !== 'manager')) {
        return { text: renderTemplate('bot_kpi_denied'), buttons: null };
      }

      const vars = await this.buildKpiVars();
      if (owner.role === 'supervisor') {
        await audit.log({
          actorId: owner.ref_id,
          action: 'supervisor.kpi.bot',
          resourceType: 'kpi',
          resourceId: vars.ymd,
          changes: undefined
        });
      }
      log.info('bot.kpi', { by: owner.ref_id });
      return {
        text: renderTemplate('bot_kpi', { ...vars, clinicName: await deps.settings.getClinicName() }),
        buttons: null
      };
    },

    /** — KPI هفتگی خودکار (شنبه‌ها) به همهٔ ناظرهای متصل */
    async enqueueWeeklyKpi(nowDate?: Date): Promise<number> {
      const chats = await db.query<{ chat_id: string }>(
        `SELECT DISTINCT l.chat_id
           FROM staff_bot_links l JOIN staff s ON s.id = l.staff_id
          WHERE l.status = 'linked' AND s.active = 1 AND s.role_ext = 'supervisor'`,
        []
      );
      if (chats.length === 0) return 0;

      const vars = await this.buildKpiVars(nowDate);
      const clinicName = await deps.settings.getClinicName();
      let enqueued = 0;
      for (const row of chats) {
        const outcome = await notify.enqueue({
          channel: notify.getChannel('bale') ? 'bale' : 'internal',
          template: 'bot_kpi',
          recipient: row.chat_id,
          payload: { ...vars, clinicName },
          dedupKey: `kpi-weekly:${vars.ymd}:${row.chat_id}`
        });
        if (!outcome.duplicate) enqueued += 1;
      }
      if (enqueued > 0) await notify.dispatchPending(50);
      log.info('kpi.weekly.enqueued', { chats: chats.length, enqueued });
      return enqueued;
    },

    /** — متغیرهای KPI تجمیعی ۷ روز اخیر (مشترک بات/هفتگی) */
    async buildKpiVars(nowDate?: Date): Promise<{
      ymd: string;
      title: string;
      lines: string;
    }> {
      const end = (nowDate ?? now()).toISOString();
      const start = addMinutes(end, -7 * 24 * 60);
      const ymd = tehranYmdOf(end);
      const startYmd = tehranYmdOf(start);

      const apptRow = await db.queryOne<{ total: number; cancelled: number }>(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
           FROM appointments
          WHERE start_at >= ? AND start_at <= ?`,
        [start, end]
      );
      const attRow = await db.queryOne<{ present: number; absent: number }>(
        `SELECT SUM(CASE WHEN aps.attendance = 'present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN aps.attendance = 'absent' THEN 1 ELSE 0 END) AS absent
           FROM appointment_students aps
           JOIN appointments a ON a.id = aps.appointment_id
          WHERE a.start_at >= ? AND a.start_at <= ?`,
        [start, end]
      );
      const waitlistRow = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM waitlist WHERE deleted_at IS NULL AND status IN ('waiting', 'called')`
      );
      const studentsRow = await db.queryOne<{ active: number; cases: number }>(
        `SELECT SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN active = 1 AND case_status IS NOT NULL THEN 1 ELSE 0 END) AS cases
           FROM students`
      );
      // ─── سنجه‌های چرخهٔ استاندارد پرونده ───
      const pendingChecklistRow = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n
           FROM case_events e JOIN case_event_types t ON t.id = e.event_type_id
          WHERE e.status = 'pending_family' AND t.family_fillable = 1`
      );
      const noReportRow = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n
           FROM appointments a
          WHERE a.start_at >= ? AND a.start_at <= ? AND a.status != 'cancelled'
            AND NOT EXISTS (
              SELECT 1 FROM case_events ce JOIN case_event_types ct ON ct.id = ce.event_type_id
               WHERE ce.appointment_id = a.id AND ct.category = 'session' AND ce.status != 'cancelled'
            )
            AND NOT EXISTS (
              SELECT 1 FROM appointment_students aps
               WHERE aps.appointment_id = a.id AND aps.session_note IS NOT NULL AND aps.session_note != ''
            )`,
        [start, end]
      );
      const ownerlessRow = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n
           FROM students s
          WHERE s.active = 1 AND s.owner_staff_id IS NULL
            AND EXISTS (SELECT 1 FROM appointment_students ax JOIN appointments a2 ON a2.id = ax.appointment_id WHERE ax.student_id = s.id AND a2.status != 'cancelled')`
      );

      const total = apptRow?.total ?? 0;
      const cancelled = apptRow?.cancelled ?? 0;
      const held = Math.max(total - cancelled, 0);
      const present = attRow?.present ?? 0;
      const absent = attRow?.absent ?? 0;
      const attTotal = present + absent;
      const attendanceRate = attTotal > 0 ? Math.round((present / attTotal) * 100) : null;

      const fa = (n: number) => faDigits(String(n));
      const lines = [
        `نوبت‌های ۷ روز اخیر: ${fa(total)} (برگزارشده: ${fa(held)} — لغوشده: ${fa(cancelled)})`,
        attendanceRate === null
          ? 'حضور و غیاب: ثبت‌نشده'
          : `نرخ حضور: ${fa(attendanceRate)}٪ (${fa(present)} حاضر / ${fa(absent)} غایب)`,
        `جلسات بدون گزارش (۷ روز): ${fa(noReportRow?.n ?? 0)}`,
        `چک‌لیست‌های در انتظار خانواده: ${fa(pendingChecklistRow?.n ?? 0)}`,
        `پروندهٔ فعال بدون مسئول: ${fa(ownerlessRow?.n ?? 0)}`,
        `لیست انتظار باز: ${fa(waitlistRow?.n ?? 0)}`,
        `دانش‌آموزان فعال: ${fa(studentsRow?.active ?? 0)} — با پروندهٔ نیاز ویژه: ${fa(studentsRow?.cases ?? 0)}`
      ].join('\n');

      return {
        ymd,
        title: `گزارش KPI — بازهٔ ${startYmd} تا ${ymd}`,
        lines
      };
    },

    /**
     * — اعلان «نوبت خالی شد» به دفتر (ناظر لغو — best-effort، هرگز cancel را شکست نمی‌دهد).
     * فقط وقتی متقاضیِ بازی در لیست انتظار هست و پرچم notify_waitlist روشن است؛
     * مقصد: همهٔ chatهای متصل مدیر/منشی؛ idempotent با dedup «wl-free:{appointmentId}:{chatId}»
     * — بازیابی + لغوی دوبارهٔ همان نوبت پیام تکراری نمی‌سازد (خودِ جای خالی یک‌بار اعلام می‌شود).
     */
    async notifyWaitlistSlotFreed(appointment: Appointment): Promise<void> {
      try {
        const flags = await deps.settings.getNotifyFlags();
        if (!flags.waitlistEnabled) return;

        const openRow = await db.queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM waitlist WHERE deleted_at IS NULL AND status IN ('waiting', 'called')`
        );
        const openCount = openRow?.n ?? 0;
        if (openCount === 0) return; // لیست انتظار خالی — پیام بی‌مصرف نیست

        const officeRows = await db.query<{ chat_id: string }>(
          `SELECT DISTINCT l.chat_id
             FROM staff_bot_links l JOIN staff s ON s.id = l.staff_id
            WHERE l.status = 'linked' AND s.active = 1 AND s.role_ext IS NULL
              AND s.role IN ('manager', 'secretary')`,
          []
        );
        if (officeRows.length === 0) return;

        const [staffNames, clinicName] = await Promise.all([
          staffNamesMap(),
          deps.settings.getClinicName()
        ]);
        const nameRows = await db.query<{ first_name: string; last_name: string }>(
          `SELECT first_name, last_name FROM waitlist
            WHERE deleted_at IS NULL AND status IN ('waiting', 'called')
            ORDER BY created_at LIMIT 3`,
          []
        );
        const namesLine =
          nameRows.map((r) => `${r.first_name} ${r.last_name}`).join('، ') || '';

        const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
        let enqueued = 0;
        let duplicates = 0;
        for (const { chat_id } of officeRows) {
          const outcome = await notify.enqueue({
            channel,
            template: 'waitlist_slot_freed',
            recipient: chat_id,
            staffId: appointment.staffId,
            appointmentId: appointment.id,
            payload: {
              staffName: staffNames.get(appointment.staffId) ?? '',
              dateYmd: tehranYmdOf(appointment.startAt),
              timeLabel: tehranTimeLabel(appointment.startAt),
              extra: namesLine ? `متقاضیان در انتظار: ${namesLine}` : undefined,
              clinicName
            },
            dedupKey: `wl-free:${appointment.id}:${chat_id}`
          });
          if (outcome.duplicate) duplicates += 1;
          else enqueued += 1;
        }
        if (enqueued > 0) await notify.dispatchPending(50);

        await audit.log({
          actorId: 'system',
          action: 'notification.waitlist_slot_freed',
          resourceType: 'appointment',
          resourceId: appointment.id,
          changes: {
            enqueued: { from: null, to: enqueued },
            duplicates: { from: null, to: duplicates },
            openWaitlist: { from: null, to: openCount }
          }
        });
        log.info('waitlist.slot_freed', { appointmentId: appointment.id, enqueued, duplicates });
      } catch (err) {
        // ناظر best-effort — شکست اعلان هرگز لغو نوبت را شکست نمی‌دهد
        log.warn('waitlist.slot_freed.failed', { appointmentId: appointment.id, error: String(err) });
      }
    },

    /**
     * خلاصهٔ روز — پوش صبحگاهی به همهٔ chatهای متصل:
     * همکار → برنامهٔ خودش، خانواده → نوبت‌های امروز فرزندان، معلم کلاس → مراجعه‌های امروز
     * + یادآور پیگیری‌های عقب‌افتاده/امروز. روزِ خالی → پوش نمی‌گیرد (بدون اسپم).
     * idempotent با dedup_key «digest:{date}:{chatId}».
     */
    async sendDailyDigest(nowDate = now()): Promise<DigestSummary> {
      const flags = await deps.settings.getNotifyFlags();
      const todayYmd = tehranTodayYmd(nowDate);
      const summary: DigestSummary = {
        dateYmd: todayYmd,
        flagEnabled: flags.digestEnabled,
        staffSent: 0,
        familySent: 0,
        classSent: 0,
        followupNudges: 0,
        reassessNudges: 0,
        enqueued: 0,
        duplicates: 0,
        skippedEmpty: 0,
        kpiSent: 0
      };

      // — گزارش KPI هفتگی ناظرهای اداره — فقط شنبه‌ها (مستقل از پرچم digest؛
      // idempotent با dedup «kpi-weekly:{ymd}:{chatId}» — اجرای مکرر پیام تکراری نمی‌سازد)
      if (iranianWeekdayOfYmd(todayYmd) === 0) {
        summary.kpiSent = await this.enqueueWeeklyKpi(nowDate).catch((err: unknown) => {
          log.error('kpi.weekly.failed', { error: err instanceof Error ? err.message : String(err) });
          return 0;
        });
      }

      if (!flags.digestEnabled) {
        log.info('digest.disabled', { dateYmd: todayYmd });
        return summary;
      }

      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const clinicName = await deps.settings.getClinicName();
      const { start, end } = tehranRange(todayYmd, todayYmd);
      const staffNames = await staffNamesMap();

      const enqueueDigest = async (
        template: 'digest_staff' | 'digest_family' | 'digest_class',
        chatId: string,
        extra: string
      ): Promise<boolean> => {
        const outcome = await notify.enqueue({
          channel,
          template,
          recipient: chatId,
          payload: { dateYmd: todayYmd, extra, clinicName },
          dedupKey: `digest:${todayYmd}:${chatId}`
        });
        if (outcome.duplicate) summary.duplicates += 1;
        else summary.enqueued += 1;
        return !outcome.duplicate;
      };

      // ─── ۱) همکاران — برنامهٔ خودشان (مثل /today) ───
      const staffChatRows = await db.query<{ staff_id: string; chat_id: string }>(
        `SELECT staff_id, chat_id FROM staff_bot_links WHERE status = 'linked' AND chat_id IS NOT NULL`
      );
      for (const row of staffChatRows) {
        const list = await appointments.list({ staffId: row.staff_id, from: start, to: end });
        const studentIds = [...new Set(list.flatMap((a) => a.students.map((s) => s.studentId)))];
        const names = await studentNamesMap(studentIds);
        const entries = buildScheduleEntries(list, { kind: 'staff', names });
        if (entries.length === 0) {
          summary.skippedEmpty += 1;
          continue;
        }
        if (await enqueueDigest('digest_staff', row.chat_id, renderDigestBody(entries))) summary.staffSent += 1;
      }

      // ─── ۲) خانواده‌ها — نوبت‌های امروز فرزندان (bot_links + prefs) ───
      const parentChatRows = await db.query<{ chat_id: string }>(
        `SELECT DISTINCT chat_id FROM bot_links WHERE status = 'linked' AND chat_id IS NOT NULL
          UNION
         SELECT DISTINCT chat_id FROM notification_prefs WHERE chat_id IS NOT NULL AND reminders_enabled = 1 AND channel = 'bale'`
      );
      for (const row of parentChatRows) {
        const chatStudentRows = await db.query<{ student_id: string }>(
          ...spreadStmt(selectStudentIdsByChat(row.chat_id))
        );
        const prefIds = await db.query<{ student_id: string }>(
          `SELECT student_id FROM notification_prefs WHERE chat_id = ? AND reminders_enabled = 1`,
          [row.chat_id]
        );
        const studentIds = [...new Set([...chatStudentRows.map((r) => r.student_id), ...prefIds.map((r) => r.student_id)])];
        if (studentIds.length === 0) {
          summary.skippedEmpty += 1;
          continue;
        }

        const merged: Appointment[] = [];
        const seen = new Set<string>();
        for (const sid of studentIds) {
          const list = await appointments.list({ studentId: sid, from: start, to: end });
          for (const a of list) {
            if (!seen.has(a.id)) {
              seen.add(a.id);
              merged.push(a);
            }
          }
        }
        merged.sort((a, b) => a.startAt.localeCompare(b.startAt));
        const studentNames = await studentNamesMap(studentIds);
        const multi = studentIds.length > 1;
        const entries = merged.map((a) => ({
          timeLabel: tehranTimeLabel(a.startAt),
          title: staffNames.get(a.staffId) ?? 'متخصص',
          subtitle: multi
            ? `فرزند: ${a.students.map((s) => studentNames.get(s.studentId)).filter((n): n is string => Boolean(n)).join('، ') || '—'}`
            : undefined,
          cancelled: a.status === 'cancelled'
        }));
        if (entries.length === 0) {
          summary.skippedEmpty += 1;
          continue;
        }
        if (await enqueueDigest('digest_family', row.chat_id, renderDigestBody(entries))) summary.familySent += 1;
      }

      // ─── ۳) معلمان کلاس — مراجعه‌های امروز دانش‌آموزان کلاس ───
      const classChatRows = await db.query<{ class_id: string; chat_id: string }>(
        `SELECT class_id, chat_id FROM class_bot_links WHERE status = 'linked' AND chat_id IS NOT NULL`
      );
      for (const row of classChatRows) {
        const classStudentIds = await students.listStudentIdsByClass(row.class_id);
        const merged: Appointment[] = [];
        const seen = new Set<string>();
        for (const sid of classStudentIds) {
          const list = await appointments.list({ studentId: sid, from: start, to: end });
          for (const a of list) {
            if (!seen.has(a.id)) {
              seen.add(a.id);
              merged.push(a);
            }
          }
        }
        merged.sort((a, b) => a.startAt.localeCompare(b.startAt));
        const names = await studentNamesMap(classStudentIds);
        const entries = merged.map((a) => ({
          timeLabel: tehranTimeLabel(a.startAt),
          title:
            a.students
              .map((s) => names.get(s.studentId) ?? '')
              .filter((n) => n.length > 0)
              .join('، ') || 'بدون دانش‌آموز',
          subtitle: undefined,
          cancelled: a.status === 'cancelled'
        }));
        if (entries.length === 0) {
          summary.skippedEmpty += 1;
          continue;
        }
        if (await enqueueDigest('digest_class', row.chat_id, renderDigestBody(entries))) summary.classSent += 1;
      }

      // ─── ۴) یادآور پیگیری‌های عقب‌افتاده/امروز به مسئولان ───
      summary.followupNudges = await this.enqueueFollowupNudges(nowDate);

      // ─── ۵) یادآور بازسنجی مسیرهای فعال (reassess_at ≤ ۷ روز) — فاز بهبود §۱۰.۳ ───
      summary.reassessNudges = await this.enqueueReassessmentNudges(nowDate);

      if (summary.enqueued > 0) {
        await notify.dispatchPending(100);
      }

      await audit.log({
        actorId: 'system',
        action: 'notification.digest',
        resourceType: 'notification',
        resourceId: todayYmd,
        changes: {
          staff: { from: null, to: summary.staffSent },
          family: { from: null, to: summary.familySent },
          class: { from: null, to: summary.classSent },
          followupNudges: { from: null, to: summary.followupNudges },
          reassessNudges: { from: null, to: summary.reassessNudges },
          skippedEmpty: { from: null, to: summary.skippedEmpty },
          duplicates: { from: null, to: summary.duplicates }
        }
      });
      log.info('digest.sent', { ...summary });
      return summary;
    },

    /** یادآور صبحگاهی پیگیری‌های عقب‌افتاده/امروز به مسئول (idempotent با dedup روزانه) */
    async enqueueFollowupNudges(nowDate = now()): Promise<number> {
      const flags = await deps.settings.getNotifyFlags();
      if (!flags.digestEnabled) return 0;

      const openList = await followups.list({ group: 'open' }, BOT_ACTOR);
      const byAssignee = new Map<string, FollowUp[]>();
      for (const f of openList) {
        const g = followUpGroupOf({ status: f.status, dueAt: f.dueAt }, nowDate);
        if (g !== 'overdue' && g !== 'today') continue;
        const arr = byAssignee.get(f.assigneeId);
        if (arr) arr.push(f);
        else byAssignee.set(f.assigneeId, [f]);
      }
      if (byAssignee.size === 0) return 0;

      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const todayYmd = tehranTodayYmd(nowDate);
      const clinicName = await deps.settings.getClinicName();
      let enqueued = 0;

      for (const [assigneeId, list] of byAssignee) {
        const chatRows = await db.query<{ chat_id: string }>(
          ...spreadStmt(selectStaffChats(assigneeId))
        );
        if (chatRows.length === 0) continue;
        const { extra } = followupsNudgeBody(list, nowDate);
        for (const r of chatRows) {
          const outcome = await notify.enqueue({
            channel,
            template: 'followup_nudge',
            recipient: r.chat_id,
            staffId: assigneeId,
            payload: { extra, clinicName },
            dedupKey: `fu-nudge:${todayYmd}:${assigneeId}:${r.chat_id}`
          });
          if (!outcome.duplicate) enqueued += 1;
        }
      }
      log.info('followup.nudge.enqueued', { assignees: byAssignee.size, enqueued });
      return enqueued;
    },

    /** یادآور روزانهٔ بازسنجی مسیرهای فعال — reassess_at ≤ ۷ روز به درمانگر مالک پرونده (idempotent با dedup روزانه) */
    async enqueueReassessmentNudges(nowDate = now()): Promise<number> {
      const flags = await deps.settings.getNotifyFlags();
      if (!flags.digestEnabled) return 0;

      const dueRows = await db.query<{ id: string; owner_id: string | null; student_name: string; reassess_at: string }>(
        `SELECT p.id, s.owner_staff_id AS owner_id, s.first_name || ' ' || s.last_name AS student_name, p.reassess_at
           FROM intervention_paths p
           JOIN students s ON s.id = p.student_id
          WHERE p.status = 'active' AND p.deleted_at IS NULL
            AND p.reassess_at IS NOT NULL AND p.reassess_at <= ?`,
        [new Date(nowDate.getTime() + 7 * 86400000).toISOString()]
      );
      if (dueRows.length === 0) return 0;

      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const todayYmd = tehranTodayYmd(nowDate);
      let enqueued = 0;
      for (const p of dueRows) {
        if (!p.owner_id) continue;
        const chatRows = await db.query<{ chat_id: string }>(
          ...spreadStmt(selectStaffChats(p.owner_id))
        );
        for (const r of chatRows) {
          const outcome = await notify.enqueue({
            channel,
            template: 'reassessment_due',
            recipient: r.chat_id,
            staffId: p.owner_id,
            payload: { studentName: p.student_name, dueYmd: p.reassess_at.slice(0, 10) },
            dedupKey: `reassess:${todayYmd}:${p.id}:${r.chat_id}`
          });
          if (!outcome.duplicate) enqueued += 1;
        }
      }
      log.info('reassessment.nudge.enqueued', { paths: dueRows.length, enqueued });
      return enqueued;
    },

    // ───: ناظر چرخه حیات نوبت — صف‌گذاری اعلان برای معلم و ولیّ هر دانش‌آموز ───

    async notifyAppointmentCreated(appointment: Appointment): Promise<void> {
      await this.notifyLifecycle('created', appointment);
    },

    async notifyAppointmentMoved(appointment: Appointment, previous: { startAt: string; endAt: string }): Promise<void> {
      await this.notifyLifecycle('moved', appointment, previous);
    },

    async notifyAppointmentCancelled(appointment: Appointment): Promise<void> {
      await this.notifyLifecycle('cancelled', appointment);
    },

    async notifyLifecycle(event: LifecycleEvent, appointment: Appointment, previous?: { startAt: string; endAt: string }): Promise<void> {
      const flags = await deps.settings.getNotifyFlags();
      const enabled =
        event === 'created' ? flags.onCreate : event === 'moved' ? flags.onMove : flags.onCancel;
      if (!enabled) return;

      // مقصدها
      const studentIds = [...new Set(appointment.students.map((s) => s.studentId))];
      const prefsRows = studentIds.length > 0
        ? await db.query<PrefsRow>(...spreadStmt(selectPrefsMany(studentIds)))
        : [];
      const studentTargets = new Map<string, { channel: 'bale' | 'internal'; chatId: string }>();
      for (const row of prefsRows) {
        const prefs = rowToPrefs(row);
        if (prefs.chatId) {
          studentTargets.set(prefs.studentId, { channel: prefs.channel, chatId: prefs.chatId });
        }
      }

      const staffChatRows = await db.query<{ chat_id: string }>(
        ...spreadStmt(selectStaffChats(appointment.staffId))
      );
      // اگر توکن بله تنظیم نشده باشد (dev)، پیام کارکنان روی کانال internal می‌رود تا گم نشود
      const staffChannel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const staffChats = staffChatRows.map((r) => r.chat_id);

      // — کلاس‌های دانش‌آموزان نوبت + chatهای متصل معلم مدرسه
      const classMap = await students.getClassesForStudents(studentIds);
      const classTargets = new Map<string, { channel: 'bale' | 'internal'; chatId: string; className: string }>();
      for (const [sid, info] of classMap) {
        const chats = await db.query<{ chat_id: string }>(...spreadStmt(selectClassChats(info.classId)));
        for (const r of chats) {
          classTargets.set(sid, { channel: staffChannel, chatId: r.chat_id, className: info.className });
        }
      }

      // اگر هیچ مقصدی نیست، کاری نکن (بدون رکورد بی‌مصرف در صف)
      if (studentTargets.size === 0 && staffChats.length === 0 && classTargets.size === 0) return;

      const [studentNames, staffNames, clinicName] = await Promise.all([
        studentNamesMap(studentIds),
        staffNamesMap(),
        deps.settings.getClinicName()
      ]);

      const plans = planLifecycleNotifications({
        event,
        appointment,
        previous,
        staffName: staffNames.get(appointment.staffId) ?? '',
        studentNames,
        studentTargets,
        staffChats,
        classTargets,
        staffChannel,
        enabled: true, // پرچم بالاتر بررسی شد
        clinicName
      });

      // — «ساعت ارسال» فقط برای اعلان‌های ثبت نوبت جدید (بقیه فوری)
      const batchHour = await deps.settings.getBatchHour();
      const nowIsoBatch = now().toISOString();

      let enqueued = 0;
      let duplicates = 0;
      for (const p of plans) {
        const sendAt =
          event === 'created' && isCreatedTemplate(p.template)
            ? computeBatchSendAt({ nowIso: nowIsoBatch, appointmentStartIso: appointment.startAt, batchHour })
            : null;
        const outcome = await notify.enqueue({
          channel: p.channel,
          template: p.template,
          payload: p.payload,
          recipient: p.recipient,
          studentId: p.studentId,
          staffId: p.staffId,
          appointmentId: p.appointmentId,
          dedupKey: p.dedupKey,
          sendAt
        });
        if (outcome.duplicate) duplicates += 1;
        else enqueued += 1;
      }

      if (enqueued > 0) {
        // dispatch فوری تا پیام «همان لحظه» برسد (خطا صف را خراب نمی‌کند)
        await notify.dispatchPending(50);
      }

      await audit.log({
        actorId: 'system',
        action: `notification.lifecycle.${event}`,
        resourceType: 'appointment',
        resourceId: appointment.id,
        changes: {
          enqueued: { from: null, to: enqueued },
          duplicates: { from: null, to: duplicates }
        }
      });
      log.info('lifecycle.notified', { event, appointmentId: appointment.id, enqueued, duplicates });
    },

    async sendTest(input, actor: AuthContext): Promise<SendResult> {
      const channel = notify.getChannel(input.channel);
      if (!channel) {
        return { ok: false, error: 'CHANNEL_UNAVAILABLE' };
      }
      const text = input.text?.trim() || renderTemplate('generic', { extra: 'پیام آزمایشی سامانه' });
      const result = await channel.send({ to: input.recipient, text });

      await audit.log({
        actorId: actor.staffId,
        action: 'notification.test.send',
        resourceType: 'notification',
        resourceId: input.channel,
        changes: { ok: { from: null, to: result.ok } }
      });
      return result;
    },

    isWebhookEnabled(): boolean {
      return Boolean(deps.webhookSecret);
    },

    // ───: یادآوری هوشمند ───

    async notifyAttendanceMarked(appointmentId, studentId, status) {
      // فقط غیبت به خانواده اعلان می‌شود (حاضر/لغو نیاز به اعلان ندارد)
      if (status !== 'absent') return;

      // جزئیات نوبت + دانش‌آموز
      const appt = await db.queryOne<{ start_at: string; status: string }>(
        `SELECT start_at, status FROM appointments WHERE id = ?`,
        [appointmentId]
      );
      if (!appt || appt.status === 'cancelled') return;

      // مقصدهای خانواده: bot_links متصل + chat_id دستی prefs (bale)
      const linkRows = await db.query<{ chat_id: string }>(
        `SELECT DISTINCT chat_id FROM bot_links
          WHERE student_id = ? AND status = 'linked' AND chat_id IS NOT NULL`,
        [studentId]
      );
      const prefRows = await db.query<{ chat_id: string }>(
        `SELECT chat_id FROM notification_prefs
          WHERE student_id = ? AND chat_id IS NOT NULL AND channel = 'bale'`,
        [studentId]
      );
      const targets = [...new Set([...linkRows.map((r) => r.chat_id), ...prefRows.map((r) => r.chat_id)])];
      if (targets.length === 0) return;

      const [names, clinicName] = await Promise.all([
        studentNamesMap([studentId]),
        deps.settings.getClinicName()
      ]);
      const studentName = names.get(studentId) ?? '';

      const payload = {
        studentName,
        dateYmd: tehranYmdOf(appt.start_at),
        timeLabel: tehranTimeLabel(appt.start_at),
        clinicName
      };

      let enqueued = 0;
      for (const chatId of targets) {
        const outcome = await notify.enqueue({
          channel: notify.getChannel('bale') ? 'bale' : 'internal',
          template: 'attendance_absent',
          recipient: chatId,
          studentId,
          appointmentId,
          payload,
          dedupKey: `att-absent:${appointmentId}:${studentId}:${chatId}`
        });
        if (!outcome.duplicate) enqueued++;
      }
      if (enqueued > 0) await notify.dispatchPending(50);

      await audit.log({
        actorId: 'system',
        action: 'notification.attendance_absent',
        resourceType: 'appointment_student',
        resourceId: `${appointmentId}/${studentId}`,
        changes: { enqueued: { from: null, to: enqueued }, targets: { from: null, to: targets.length } }
      });
      log.info('attendance.absent.notified', { appointmentId, targets: targets.length, enqueued });
    },

    /** -c — اعلان تصحیح تکلیف به خانواده (ناظر gradeAssignment) */
    async notifyHomeworkGraded(input) {
      const linkRows = await db.query<{ chat_id: string }>(
        `SELECT DISTINCT chat_id FROM bot_links
          WHERE student_id = ? AND status = 'linked' AND chat_id IS NOT NULL`,
        [input.studentId]
      );
      const prefRows = await db.query<{ chat_id: string }>(
        `SELECT chat_id FROM notification_prefs
          WHERE student_id = ? AND chat_id IS NOT NULL AND channel = 'bale'`,
        [input.studentId]
      );
      const targets = [...new Set([...linkRows.map((r) => r.chat_id), ...prefRows.map((r) => r.chat_id)])];
      if (targets.length === 0) return;

      const clinicName = await deps.settings.getClinicName();
      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      let enqueued = 0;
      for (const chatId of targets) {
        const outcome = await notify.enqueue({
          channel,
          template: 'homework_graded',
          recipient: chatId,
          studentId: input.studentId,
          payload: {
            studentName: input.studentName,
            exerciseTitle: input.exerciseTitle,
            feedback: input.feedback,
            senderName: input.gradedByName ?? undefined,
            clinicName
          },
          dedupKey: `hw-graded:${input.studentId}:${input.exerciseTitle}:${chatId}`
        });
        if (!outcome.duplicate) enqueued += 1;
      }
      if (enqueued > 0) await notify.dispatchPending(50);

      await audit.log({
        actorId: 'system',
        action: 'notification.homework_graded',
        resourceType: 'exercise_assignment',
        resourceId: input.studentId,
        changes: { enqueued: { from: null, to: enqueued }, targets: { from: null, to: targets.length } }
      });
      log.info('homework.graded.notified', { studentId: input.studentId, targets: targets.length, enqueued });
    },
    /** فاز ۴ — اعلان کار داخلی به مسئول (§9.5): فقط چت‌های متصل بله؛ بدون لینک، مقصدی نیست */
    async notifyTodoAssigned(todo: Todo): Promise<void> {
      const chatRows = await db.query<{ chat_id: string }>(
        ...spreadStmt(selectStaffChats(todo.assigneeId))
      );
      if (chatRows.length === 0) return;

      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const [allStaffNames, clinicName] = await Promise.all([
        staffNamesMap(),
        deps.settings.getClinicName()
      ]);
      const assigneeName = allStaffNames.get(todo.assigneeId) ?? '';
      const assignerName = allStaffNames.get(todo.assignerId) ?? '';

      const extraLines = [`ثبت‌کننده: ${assignerName || '—'}`];
      if (todo.dueAt) {
        extraLines.push(`مهلت: ${jalaliFullLabel(tehranYmdOf(todo.dueAt))} ساعت ${faDigits(tehranTimeLabel(todo.dueAt))}`);
      }

      let enqueued = 0;
      let duplicates = 0;
      for (const r of chatRows) {
        const outcome = await notify.enqueue({
          channel,
          template: 'todo_assigned',
          recipient: r.chat_id,
          staffId: todo.assigneeId,
          payload: {
            staffName: assigneeName,
            taskTitle: todo.title,
            extra: extraLines.join('\n'),
            clinicName
          },
          dedupKey: `todo-assigned:${todo.id}:${todo.assigneeId}`
        });
        if (outcome.duplicate) duplicates += 1;
        else enqueued += 1;
      }
      if (enqueued > 0) await notify.dispatchPending(50);
      log.info('todo.assigned.notified', { todoId: todo.id, enqueued, duplicates, channel });
    },

    async enqueuePendingAttendanceNudges() {
      // نوبت‌های تمام‌شده هفته اخیر که هنوز حضور و غیاب آن‌ها ثبت نشده
      // گروه‌بندی بر اساس کارمند نوبت → یک پیام روزانه برای هر کارمند (dedup با تاریخ امروز)
      const today = tehranTodayYmd();
      const weekAgo = addDaysYmd(today, -7);
      const range = tehranRange(weekAgo, today);

      const rows = await db.query<{ staff_id: string; n: number }>(
        `SELECT a.staff_id, COUNT(*) AS n
           FROM appointments a
           JOIN appointment_students s ON s.appointment_id = a.id
          WHERE a.status = 'scheduled'
            AND s.attendance = 'pending'
            AND a.end_at <= ?
            AND a.start_at >= ?
          GROUP BY a.staff_id`,
        [range.end, range.start]
      );
      if (rows.length === 0) return 0;

      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const staffNames = await staffNamesMap();
      let enqueued = 0;

      for (const row of rows) {
        const chatRows = await db.query<{ chat_id: string }>(
          ...spreadStmt(selectStaffChats(row.staff_id))
        );
        for (const chatRow of chatRows) {
          const outcome = await notify.enqueue({
            channel,
            template: 'staff_attendance_nudge',
            recipient: chatRow.chat_id,
            staffId: row.staff_id,
            payload: {
              staffName: staffNames.get(row.staff_id) ?? '',
              extra: `${faDigits(String(row.n))} نوبت از جلسات هفته اخیر شما بدون ثبت حضور دانش‌آموز است.`,
              clinicName: await deps.settings.getClinicName()
            },
            dedupKey: `att-nudge:${today}:${row.staff_id}:${chatRow.chat_id}`
          });
          if (!outcome.duplicate) enqueued++;
        }
      }
      if (enqueued > 0) await notify.dispatchPending(50);
      log.info('attendance.nudge.enqueued', { staff: rows.length, enqueued });
      return enqueued;
    },

    isWebhookSecretValid(secret: string | undefined): boolean {
      if (!deps.webhookSecret || !secret) return false;
      return secret === deps.webhookSecret;
    }
  };
}

// ───────────── helpers ─────────────

type Stmt = { sql: string; params: unknown[] };
/** — روز کاملِ سپری‌شده از ثبت ورودی لیست انتظار (created_at ممکن است naive یا ISO باشد) */
function waitlistDaysOf(createdAt: string, nowMs: number): number {
  const t = Date.parse(createdAt.includes('T') ? createdAt : createdAt.replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 86400000));
}

function spreadStmt(stmt: Stmt): [string, unknown[]] {
  return [stmt.sql, stmt.params];
}

/** — استخراج متن خام پیام بات (برای فرم‌های چندمرحله‌ای؛ parseBotUpdate متن آزاد را null می‌دهد) */
function extractMessageText(update: unknown): string | null {
  if (typeof update !== 'object' || update === null) return null;
  const u = update as { message?: { text?: unknown }; edited_message?: { text?: unknown } };
  const msg = u.message ?? u.edited_message;
  const t = msg?.text;
  return typeof t === 'string' && t.trim().length > 0 ? t.trim() : null;
}

/** — استخراج chat_id از آپدیت خام */
function extractChatIdOf(update: unknown): string | null {
  if (typeof update !== 'object' || update === null) return null;
  const u = update as { message?: { chat?: { id?: number | string } }; edited_message?: { chat?: { id?: number | string } }; callback_query?: { message?: { chat?: { id?: number | string } } } };
  const msg = u.message ?? u.edited_message ?? u.callback_query?.message;
  const id = msg?.chat?.id;
  return id === undefined || id === null ? null : String(id);
}
