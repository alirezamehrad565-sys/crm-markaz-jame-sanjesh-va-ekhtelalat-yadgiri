/**
 * composition root — ۱.۲۷.۸۰ (architecture-001 — sdt157): تفکیک سه نقشِ api-routing.
 * این ماژول فقط «ترکیب» است: قرارداد وابستگی‌ها (AppDeps)، شکل سرویس‌ها (Services) و
 * ساخت و سیم‌کشی ۴۸ سرویس + نصب ۸ ناظر. ترتیبِ ساخت قفل است (حلقه‌ها با تزریق setter/تابع
 * باز می‌شوند — بند ۳/۴ سند رفاکس): exerciseStorage → بانک‌های پیوست؛ followups →
 * caseEvents/waitlist/sessionNotes؛ workingHours → settings؛ notifyCore → documentRequests
 * → notify؛ otEngine → clinicalEngine. میان‌افزار سراسری در ./middleware و رجیستری مسیرها
 * در ./routes است؛ createApp باریک در ./index.
 */
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { CASE_EVENT_FILL_EXPIRY_HOURS, faDigits } from '@core/shared';
import { createInternalChannel, createNotifyService } from '@core/notify';
import type { NotifyService } from '@core/notify';
import { createR2ObjectStore, createChunkedD1ObjectStore } from '@core/storage';
import type { ObjectStore, R2LikeBucket } from '@core/storage';
import { createBaleMediaFetcher } from '@core/notify';
import type { MediaFetcher } from '@core/notify';

import { createConflictEngine } from '@domain/conflict-engine';
import type { ConflictEngine } from '@domain/conflict-engine';
import { createAppointmentService } from '@domain/appointment-core';
import type { AppointmentService } from '@domain/appointment-core';
import { createAssessmentBlockService } from '@domain/assessment-blocks'; // ۱.۲۷.۱۴ — بلوک نوبت سنجش (خواست کارفرما)
import type { AssessmentBlockService } from '@domain/assessment-blocks';
import { createAttendanceService } from '@domain/attendance';
import type { AttendanceService } from '@domain/attendance';
import { createStaffAttendanceService } from '@domain/attendance';
import type { StaffAttendanceService } from '@domain/attendance';
import { createWorkingDayService } from '@domain/working-day';
import type { WorkingDayService } from '@domain/working-day';
import { createStudentProfileService } from '@domain/student-profile';
import type { StudentProfileService } from '@domain/student-profile';
import { createStudentTimelineService } from '@app/student-timeline';
import type { StudentTimelineService } from '@app/student-timeline';
import { createReportExportService } from '@app/report-export'; // ۱.۲۷.۵۳ — موج ۳ ارتقای پرونده: اسناد خروجی نسخه‌دار (طرح C)
import { createSpecialNeedsService } from '@app/special-needs';
import type { SpecialNeedsService } from '@app/special-needs';
import { createWaitlistService } from '@domain/waitlist';
import type { WaitlistService } from '@domain/waitlist';
import { createFormBuilderService } from '@domain/form-builder'; // ۱.۲۷.۳۴ — فرم‌ساز تعاملی عمومی
import type { FormBuilderService } from '@domain/form-builder';
import { createFollowUpsService } from '@domain/followups';
import type { FollowUpsService } from '@domain/followups';
import { createTodosService } from '@domain/todos';
import type { TodosService } from '@domain/todos';
import { createExerciseBankService, sendBaleDocument } from '@domain/exercise-bank';
import type { ExerciseBankService, ExerciseFileSender } from '@domain/exercise-bank';
import { createDocumentRequestService } from '@domain/document-requests';
import type { DocumentRequestService } from '@domain/document-requests';
import { createCaseEventsService } from '@domain/case-events';
import type { CaseEventsService } from '@domain/case-events';
import { createGamesService } from '@domain/games'; // بستر بک‌اند بازی (۱.۲۵.۰۷)
import type { GamesService } from '@domain/games';
import { createClinicalEngineService } from '@domain/clinical-engine';
import type { ClinicalEngineService } from '@domain/clinical-engine';
import { createOtEngineService } from '@domain/ot-engine';
import type { OtEngineService } from '@domain/ot-engine';
import { createTagService } from '@domain/tags';
import type { TagService } from '@domain/tags';
import { createScreeningService } from '@domain/screening';
import type { ScreeningService } from '@domain/screening';
import { createAnnouncementService } from '@domain/announcements';
import type { AnnouncementService } from '@domain/announcements';
import { createKnowledgeService } from '@domain/knowledge';
import type { KnowledgeService } from '@domain/knowledge';
import { createClearbookService } from '@domain/clearbook';
import type { ClearbookService } from '@domain/clearbook';
import { createDocsService } from '@domain/docs'; // نمون‌برگ‌ها و اسناد خام
import type { DocsService } from '@domain/docs';
import { createCenterKpiService } from '@domain/center-kpi'; // ۱.۲۵.۴۶ — شاخص‌های مرکز
import type { CenterKpiService } from '@domain/center-kpi';
import { createNetworkContentService } from '@domain/network-content'; // ۱.۲۵.۴۶ — کتابخانهٔ شبکه
import type { NetworkContentService } from '@domain/network-content';
import { createBugReportService } from '@domain/bug-reports'; // بازاعمال ۱.۲۵.۵۱ — گزارش باگ به پشتیبانی CP
import type { BugReportService } from '@domain/bug-reports';
import { createClientErrorsService } from '@app/client-errors'; // ۱.۲۵.۶۶ — لولهٔ خطای مرورگر
import type { ClientErrorsService } from '@app/client-errors';
import { createHealthService } from '@app/health'; // ۱.۲۵.۶۷ — پنل سلامت (CP-3 ف۱)
import type { HealthService } from '@app/health';
import { createGrowthService } from '@app/growth'; // ف۴ — گزارش رشد جدول‌ها (بهداشت داده)
import type { GrowthService } from '@app/growth';
import { createContentScoreService } from '@domain/content-score'; // ۱.۲۵.۴۸ m6 — امتیاز شناسنامه
import type { ContentScoreService } from '@domain/content-score';
import { fetchCpContentFile } from '@app/cp-content/sync';
import { createFinanceService } from '@domain/finance'; // بودجه و مالی مرکز
import type { FinanceService } from '@domain/finance';
import { createStaffService } from '@domain/staff';
import type { StaffService } from '@domain/staff';
import { createWorkingHoursService } from '@domain/working-hours';
import type { WorkingHoursService } from '@domain/working-hours';
import { createDashboardService } from '@app/dashboard';
import type { DashboardService } from '@app/dashboard';
import { createDashboardKpiService } from '../dashboard/kpi-source'; // ۱.۲۷.۸۰ — تجمیع KPI (architecture-001)
import type { DashboardKpiService } from '../dashboard/kpi-source';
import { createNotifyAppService } from '@app/notify';
import { enqueueToMany } from '@app/notify/enqueue-to-many'; // architecture-002 + performance-002 (۱.۲۷.۸۳)
import type { NotifyAppService } from '@app/notify';
import { createSettingsService } from '@app/settings';
import type { SettingsService } from '@app/settings';
import { createBackupService } from '@app/backup';
import type { BackupService, BackupDocumentSender } from '@app/backup';
import { createKeysService } from '@app/keys';
import type { KeysService } from '@app/keys';
import { createSearchService } from '@app/search';
import type { SearchService } from '@app/search';
import { createReportService } from '@app/reports';
import type { ReportService } from '@app/reports';
import { createSessionNotesService } from '@app/session-notes';
import type { SessionNotesService } from '@app/session-notes';
import { createRumService } from '@app/rum'; // پایش کارایی (RUM)
import type { RumService } from '@app/rum';

export interface AppDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  teamDomain: string;
  baleToken?: string | null;
  webhookSecret?: string | null;
  clinicName?: string;
  mediaFetcher?: MediaFetcher | null;
  exerciseBucket?: unknown;
  downloadSecret?: string | null;
  publicBaseUrl?: string | null;
  backupDocumentSender?: BackupDocumentSender | null; // تزریق ارسال‌کنندهٔ آزمایشی
  exerciseFileSender?: ExerciseFileSender | null; // تزریق ارسال‌کنندهٔ فایل تمرین (تست/سلف‌هاست)
  // 1.25.48 m6 — اتصال CP برای دانلود فایل برگزیده‌ها (خاموش اگر env سینک خالی است)
  cpSyncUrl?: string | null;
  cpNodeCode?: string | null;
  cpNodeKey?: string | null;
  /** ۱.۲۵.۶۷ — نام محیط برای پنل سلامت (ENV رانتایم) */
  envName?: string | null;
  /** ف۵ (P0-3) — آستانهٔ هشدار خطاهای مرورگر در ۲۴ ساعت (env اختیاری ALERT_CLIENT_ERRORS_MAX؛ پیش‌فرض ۱۰۰) */
  clientErrorsMax?: number | string | null;
  /** ENG-4 (۱.۲۶.۴) — نشانی /health ورکر بازی‌ها (binding GAMES_HEALTH_URL؛ فقط در موتور محلی) */
  gamesHealthUrl?: string | null;
}

export interface Services {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  conflictEngine: ConflictEngine;
  appointments: AppointmentService;
  attendance: AttendanceService;
  staffAttendance: StaffAttendanceService;
  workingDay: WorkingDayService;
  studentProfile: StudentProfileService;
  studentTimeline: StudentTimelineService;
  specialNeeds: SpecialNeedsService;
  staff: StaffService;
  workingHours: WorkingHoursService;
  settings: SettingsService;
  keys: KeysService;
  tags: TagService;
  screening: ScreeningService;
  search: SearchService;
  notify: NotifyAppService;
  announcements: AnnouncementService;
  knowledge: KnowledgeService;
  clearbook: ClearbookService;
  docs: DocsService; //
  finance: FinanceService; //
  reports: ReportService;
  waitlist: WaitlistService;
  followups: FollowUpsService;
  sessionNotes: SessionNotesService;
  todos: TodosService;
  exerciseBank: ExerciseBankService;
  documentRequests: DocumentRequestService;
  caseEvents: CaseEventsService;
  clinicalEngine: ClinicalEngineService;
  reportExport: ReturnType<typeof createReportExportService>; // ۱.۲۷.۵۳ — موج ۳ ارتقای پرونده: اسناد خروجی نسخه‌دار
  otEngine: OtEngineService;
  games: GamesService; // ۱.۲۵.۰۷ — بستر بک‌اند بازی
  backup: BackupService;
  rum: RumService; //
  centerKpi: CenterKpiService; // ۱.۲۵.۴۶ — تابلوی شاخص‌های مرکز
  networkContent: NetworkContentService; // ۱.۲۵.۴۶ — کتابخانهٔ شبکه
  bugReports: BugReportService; // بازاعمال ۱.۲۵.۵۱ — گزارش باگ به پشتیبانی CP
  clientErrors: ClientErrorsService; // ۱.۲۵.۶۶ — لولهٔ خطای مرورگر
  health: HealthService; // ۱.۲۵.۶۷ — پنل سلامت (وضعیت سامانه + لینک CP — CP-3)
  growth: GrowthService; // ف۴ — گزارش رشد جدول‌ها (شمارش روزانه در کرون + خواندن فقط‌مدیر)
  contentScore: ContentScoreService; // ۱.۲۵.۴۸ m6 — امتیاز شناسنامه
  /* ۱.۲۷.۸۰ (architecture-001) — سه سرویس دو-ناقله که تا امروز درون بدنهٔ createApp ساخته
     می‌شدند + سرویس تازهٔ تجمیع KPI؛ حالا همه در composition root ساخته می‌شوند */
  dashboard: DashboardService;
  assessmentBlocks: AssessmentBlockService;
  formBuilder: FormBuilderService;
  dashboardKpi: DashboardKpiService;
}

export function createServices(deps: AppDeps): Services {
  const { db, audit, logger } = deps;

  const conflictEngine = createConflictEngine({ db });

  const appointments = createAppointmentService({ db, audit, logger });
  appointments.setConflictEngine(conflictEngine); // حل circular dependency

  const attendance = createAttendanceService({ db, audit, logger });
  const staffAttendance = createStaffAttendanceService({ db, audit, logger }); //
  const workingDay = createWorkingDayService({ db, audit, logger, staffAttendance }); // — بورد روز کاری
  const studentProfile = createStudentProfileService({ db, audit, logger });

  const studentTimeline = createStudentTimelineService(db);

  const specialNeeds = createSpecialNeedsService({ db });

  const followups = createFollowUpsService({ db, audit, logger });

  const todos = createTodosService({ db, audit, logger });

  const exerciseStorage: ObjectStore = deps.exerciseBucket
    ? createR2ObjectStore(deps.exerciseBucket as R2LikeBucket)
    : createChunkedD1ObjectStore(db);
  const exerciseFileSender: ExerciseFileSender | null =
    deps.exerciseFileSender !== undefined
      ? deps.exerciseFileSender
      : deps.baleToken
        ? async (chatId, file) => {
            const result = await sendBaleDocument({
              token: deps.baleToken as string,
              chatId,
              filename: file.filename,
              bytes: file.bytes,
              mime: file.mime,
              caption: file.caption ?? undefined
            });
            if (!result.ok) logger.warn('exercise.file.send_failed', { chatId, error: result.error });
            return result.ok;
          }
        : null;
  const exerciseBank = createExerciseBankService({
    db,
    audit,
    logger,
    storage: exerciseStorage,
    /* ۱.۲۷.۴۳ — راز دانلود هرگز رشتهٔ ثابت نیست: اگر AUTH/WEBHOOK تنظیم نشده باشد،
       تصادفیِ هر بوت می‌شود (توکن‌های دانلود TTL کوتاه دارند؛ تاثیر ری‌استارت پذیرفته است) */
    downloadSecret: deps.downloadSecret ?? deps.webhookSecret ?? (crypto.randomUUID() + crypto.randomUUID()),
    publicBaseUrl: deps.publicBaseUrl ?? null,
    fileSender: exerciseFileSender
  });

  const caseEvents = createCaseEventsService({
    db,
    audit,
    logger,
    fillExpiryHours: CASE_EVENT_FILL_EXPIRY_HOURS,
    followups,
    publicBaseUrl: deps.publicBaseUrl ?? null,
    studentNameOf: async (studentId) => {
      const row = await db.queryOne<{ name: string }>(
        `SELECT first_name || ' ' || last_name AS name FROM students WHERE id = ?`,
        [studentId]
      );
      return row?.name ?? null;
    }
  });

  const waitlist = createWaitlistService({
    db,
    audit,
    logger,
    appointments,
    students: studentProfile,
    followups
  });

  const tags = createTagService({ db, audit, logger });
  const search = createSearchService({ db, logger });

  const screening = createScreeningService({ db, audit, logger });

  const staff = createStaffService({ db, audit, logger });
  const workingHours = createWorkingHoursService({ db, audit, logger });

  const settings = createSettingsService({
    db,
    audit,
    logger,
    workingHours,
    envClinicName: deps.clinicName,
    baleConfigured: Boolean(deps.baleToken),
    webhookEnabled: Boolean(deps.webhookSecret)
  });

  const keys = createKeysService({ db, audit, logger });

  const notifyCore: NotifyService = createNotifyService({ db, logger });
  notifyCore.registerChannel(createInternalChannel(logger));

  const docMediaFetcher: MediaFetcher | null =
    deps.mediaFetcher !== undefined
      ? deps.mediaFetcher
      : deps.baleToken
        ? createBaleMediaFetcher({ token: deps.baleToken })
        : null;
  const documentRequests = createDocumentRequestService({
    db,
    audit,
    logger,
    storage: exerciseStorage,
    mediaFetcher: docMediaFetcher,
    notify: notifyCore,
    // architecture-002/003 (۱.۲۷.۸۳): به‌جای کل SettingsService از @app — تزریق تابعی همان
    // helper مشترک (الگوی formulationOt)
    getClinicName: () => settings.getClinicName(),
    enqueueMany: (inputs) => notifyCore.enqueueMany(inputs),
    flushPending: (limit?: number) => notifyCore.dispatchPending(limit)
  });

  const notify = createNotifyAppService({
    db,
    audit,
    logger,
    notify: notifyCore,
    appointments,
    students: studentProfile,
    followups,
    settings,
    baleToken: deps.baleToken ?? null,
    webhookSecret: deps.webhookSecret ?? null,
    clinicName: deps.clinicName,
    exerciseBank,
    documentRequests,
    publicBaseUrl: deps.publicBaseUrl ?? null,
    fileSender: exerciseFileSender,
    caseEvents,
    mediaFetcher:
      deps.mediaFetcher !== undefined
        ? deps.mediaFetcher
        : deps.baleToken
          ? createBaleMediaFetcher({ token: deps.baleToken })
          : null
  });

  appointments.setLifecycleObserver({
    onCreated: (a) => notify.notifyAppointmentCreated(a),
    onMoved: (a, prev) => notify.notifyAppointmentMoved(a, prev),
    onCancelled: (a) => notify.notifyAppointmentCancelled(a).then(() => notify.notifyWaitlistSlotFreed(a))
  });

  attendance.setObserver({
    onMarked: async (apptId, studentId, status) => {
      await notify.notifyAttendanceMarked(apptId, studentId, status);
      await waitlist.onAttendanceMarked(apptId, studentId, status);
    }
  });

  todos.setNotifier((todo) => notify.notifyTodoAssigned(todo));

  exerciseBank.setGradeObserver(async (record) => {
    await notify.notifyHomeworkGraded({
      studentId: record.studentId,
      studentName: record.studentName,
      exerciseTitle: record.exerciseTitle,
      feedback: record.feedback ?? '',
      gradedByName: record.gradedByName
    });
  });

  caseEvents.setSendObserver(async (input) => {
    /* architecture-002 + performance-002 (۱.۲۷.۸۳): حلقهٔ enqueue/flush فقط در enqueueToMany —
       رفت‌وبرگشت DB مستقل از تعداد گیرنده‌ها (SELECT dedup با IN + یک INSERT چندردیفی) */
    const channel: 'bale' | 'internal' = notifyCore.getChannel('bale') ? 'bale' : 'internal';
    const clinicName = await settings.getClinicName();
    return enqueueToMany(notifyCore, {
      channel,
      template: input.template,
      chats: input.chats,
      payloadFor: (chat) => ({ ...input.vars, clinicName }),
      dedupKeyFor: (chat) => `${input.dedupBase}:${chat}`,
      studentId: input.studentId
    });
  });

  // اعلان «نتیجهٔ چک‌لیست ثبت شد» به درمانگر ثبت‌کننده؛ هم پر کردن وب و هم بات را پوشش می‌دهد
  caseEvents.setFillObserver(async (input) => {
    try {
      if (!input.staffId) return;
      const linkRows = await db.query<{ chat_id: string }>(
        `SELECT chat_id FROM staff_bot_links WHERE staff_id = ? AND status = 'linked' AND chat_id IS NOT NULL`,
        [input.staffId]
      );
      const chats = linkRows.map((r) => r.chat_id).filter(Boolean);
      if (!chats.length) return;
      const student = await studentProfile.getStudentById(input.studentId);
      const studentName = student ? `${student.firstName} ${student.lastName}` : null;
      const channel: 'bale' | 'internal' = notifyCore.getChannel('bale') ? 'bale' : 'internal';
      const clinicName = await settings.getClinicName();
      await enqueueToMany(notifyCore, {
        channel,
        template: 'bot_checklist_result',
        chats,
        payloadFor: (chat) => ({
          studentName: studentName ?? undefined,
          formTitle: input.teacherName ? `${input.formTitle} (پاسخ معلم: ${input.teacherName})` : input.formTitle,
          score: input.score != null ? faDigits(String(input.score)) : undefined,
          band: input.band ?? undefined,
          clinicName
        }),
        dedupKeyFor: (chat) => `ce-result:${input.eventId}:${chat}`,
        studentId: input.studentId
      });
    } catch (err) {
      logger.warn('case-events.fill_observer_failed', { err: err instanceof Error ? err.message : String(err) });
    }
  });

  exerciseBank.setSendObserver(async (input) => {
    const channel: 'bale' | 'internal' = notifyCore.getChannel('bale') ? 'bale' : 'internal';
    const clinicName = await settings.getClinicName();
    return enqueueToMany(notifyCore, {
      channel,
      template: input.template,
      chats: input.chats,
      payloadFor: (chat) => ({ ...input.vars, clinicName }),
      dedupKeyFor: (chat) => `${input.dedupBase}:${chat}`,
      studentId: input.studentId
    });
  });

  const reports = createReportService({ db, logger });

  const sessionNotes = createSessionNotesService({ db, audit, logger, followups });

  const announcements = createAnnouncementService({
    db,
    audit,
    logger,
    notify: notifyCore,
    baleEnabled: Boolean(deps.baleToken),
    clinicName: deps.clinicName
  });

  const knowledge = createKnowledgeService({ db, audit, logger, storage: exerciseStorage });

  // کلر بوک مرکز: همان ذخیره‌ساز پیوست‌ها (R2 یا D1 تکه‌تکه)
  const clearbook = createClearbookService({ db, audit, logger, storage: exerciseStorage });

  // نمون‌برگ‌ها و اسناد خام + بودجه و مالی مرکز: همان ذخیره‌ساز پیوست‌ها
  const docs = createDocsService({ db, audit, logger, storage: exerciseStorage });
  const finance = createFinanceService({ db, audit, logger, storage: exerciseStorage });

  // ۱.۲۵.۰۵ — otEngine قبل از موتور بالینی ساخته می‌شود: زمینهٔ صورت‌بندی مورد (گیت‌ها + پروفایل OT)
  // با تزریق تابع داده می‌شود (قرارداد «نه وابستگی ماژولی domain→domain»)، مثل اعتبارسنجی لینک کارت
  const otEngine = createOtEngineService({ db, audit, logger });
  const clinicalEngine = createClinicalEngineService({
    db, audit, logger,
    publicBaseUrl: deps.publicBaseUrl ?? null, // ۱.۲۷.۲۷ — M4: پیوند برگهٔ پیشرفت خانواده
    exerciseIdsExist: (ids) => exerciseBank.idsExist(ids),
    formulationOt: {
      gatesOf: (studentId, actor) => otEngine.getGates(studentId, actor),
      otProfileOf: (studentId, actor) => otEngine.getOtProfile(studentId, actor)
    }
  });

  /* ۱.۲۵.۵۹ — کانون‌های پایش خانه: موتور بالینی به case-events تزریق می‌شود تا هنگام ارسال
     «پایش در خانه نسخهٔ ۲»، سازه‌های درگیرِ آخرین جمع‌بندی تشخیصی در رویداد اسنپ‌شات شود
     (قرارداد «نه وابستگی ماژولی domain→domain» — هم‌الگوی formulationOt) */
  caseEvents.setMonitorFocusProvider((studentId, actor) => clinicalEngine.homeMonitorFocusOf(studentId, actor));

  // ۱.۲۵.۰۷ — بستر بک‌اند بازی: پراپ بازی با تزریق تابع به مسیر مداخله می‌رود
  // (قرارداد «نه وابستگی ماژولی domain→domain» — هم‌الگوی formulationOt)
  const games = createGamesService({
    db, audit, logger,
    publicBaseUrl: deps.publicBaseUrl ?? null,
    injectPathProbe: (pathId, input, actor) => clinicalEngine.addPathProbe(pathId, input, actor)
  });

  // ۱.۲۷.۵۳ — موج ۳ ارتقای پرونده (طرح C «پروندهٔ ناشر»): قطعی‌سازی خروجی‌ها با snapshot-first؛
  // سازندهٔ گزارش تزریقی است (قرارداد «نه وابستگی ماژولی domain→domain» — هم‌الگوی formulationOt)
  const reportExport = createReportExportService({
    db, audit,
    buildReport: (pathId, actor) => clinicalEngine.getPathwayReport(pathId, { from: null, to: null }, actor)
  });

  // مکانیک پشتیبان‌گیری و بازیابی
  const backup = createBackupService({ db, audit, logger, baleToken: deps.baleToken ?? null, sender: deps.backupDocumentSender ?? null }); // ارسال به آیدی بله

  // تله‌متری کارایی: ثبت بی‌نام + جمع‌بندی صدک (نرخ درون‌حافظه، بدون IP/UA)
  const rum = createRumService({ db, logger });

  // ۱.۲۵.۶۶ — لولهٔ خطای مرورگر: تا امروز کلاینت به /api/client-errors پست می‌کرد و ۴۰۱ می‌گرفت
  const clientErrors = createClientErrorsService({ db, logger });

  // ۱.۲۵.۶۷ — پنل سلامت (ف۱ طرح ارتقا، CP-3): وضعیت سامانه + شش درگاه لینک CP از مُهرهای settings؛
  // ف۵ (P0-3) — همان پنل حالا آرایهٔ هشدارها را هم مشتق می‌کند (آستانهٔ خطاهای مرورگر از deps)
  // ENG-4 (۱.۲۶.۴) — ردیف تازهٔ بازی‌ها از پروب /health پورت دوم (binding GAMES_HEALTH_URL)
  const health = createHealthService({
    db,
    cpConfigured: Boolean(deps.cpSyncUrl && deps.cpNodeCode && deps.cpNodeKey),
    envName: deps.envName ?? null,
    clientErrorsMax: deps.clientErrorsMax ?? null,
    gamesHealthUrl: deps.gamesHealthUrl ?? null
  });

  // ف۴ — گزارش رشد جدول‌ها: شمارش روزانه فقط در کرون digest رخ می‌دهد؛ این سرویس در مسیر درخواست فقط می‌خواند
  const growth = createGrowthService({ db, logger });

  // ۱.۲۵.۴۶ — تابلوی شاخص‌های مرکز + کتابخانهٔ شبکه (محورهای کیفیِ غنی‌سازی CP)
  const centerKpi = createCenterKpiService({ db });
  const networkContent = createNetworkContentService({
    db,
    audit,
    // m6 — دانلود فقط-خواندنی فایل برگزیده‌ها با کلید نود (خاموش اگر env سینک خالی است)
    fetchCpFile: deps.cpSyncUrl
      ? (itemId) => {
          let origin: string | null = null;
          try { origin = new URL(deps.cpSyncUrl as string).origin; } catch { origin = null; }
          return fetchCpContentFile({
            config: { cpOrigin: origin, cpNodeCode: deps.cpNodeCode ?? null, cpNodeKey: deps.cpNodeKey ?? null, cpSyncStaffId: null },
            networkItemId: itemId
          }).catch(() => null);
        }
      : undefined
  });

  // m6 — مولد امتیاز شناسنامهٔ آیتم: خودِ سامانهٔ کلاینت (refs/uses از دادهٔ واقعی مرکز)
  const contentScore = createContentScoreService(db, audit);

  // بازاعمال ۱.۲۵.۵۱ — گزارش باگ به پشتیبانی CP (صف محلی؛ ارسال در @app/bug-report-forward)
  const bugReports = createBugReportService(db, audit);

  /* ۱.۲۷.۸۰ (architecture-001) — سه سرویسِ دو-ناقله (تا امروز درون بدنهٔ createApp ساخته
     می‌شدند) به composition root منتقل شدند؛ done_when: createApp دیگر سرویس نمی‌سازد. */
  const dashboard = createDashboardService({
    appointments,
    attendance,
    conflicts: conflictEngine,
    students: studentProfile,
    db,
    screening,
    settings
  });

  // ۱.۲۷.۱۴ — بلوک نوبت سنجش: GET همهٔ احرازشده‌ها (سایهٔ تقویم) + POST/DELETE فقط مدیر؛
  // سدِ سختِ ثبت/جابه‌جایی داخل سرویس نوبت (assertNoAssessmentBlockInRange) است
  const assessmentBlocks = createAssessmentBlockService({ db, audit, logger });

  // ۱.۲۷.۳۴ — فرم‌ساز تعاملی عمومی: CRUD فرم‌ها (مدیر/منشی) + صفحهٔ بدون‌لاگین /public/form/:slug
  // و ثبت پاسخ با سقف نرخ درون‌حافظه — ماژول مستقل @domain/form-builder (MIGRATIONS.md: 0120)
  const formBuilder = createFormBuilderService({ db, audit, logger });

  // ۱.۲۷.۸۰ — تجمیع KPI داشبورد (فاز F): از لایهٔ مسیریابی به سرویس منتقل شد — منابع موازی
  // همان ۱۱ منبع قبلی‌اند؛ scoring در خود kpi-source ایمپورت می‌شود نه در لایهٔ مسیریابی.
  const dashboardKpi = createDashboardKpiService({
    dashboard,
    knowledge,
    announcements,
    waitlist,
    appointments,
    followups,
    clinicalEngine
  });

  return { db, audit, logger, conflictEngine, appointments, attendance, staffAttendance, workingDay, studentProfile, studentTimeline, specialNeeds, staff, workingHours, settings, keys, tags, screening, search, notify, announcements, knowledge, clearbook, docs, finance, reports, waitlist, followups, sessionNotes, todos, exerciseBank, documentRequests, caseEvents, clinicalEngine, reportExport, otEngine, games, backup, rum, centerKpi, networkContent, bugReports, clientErrors, health, growth, contentScore, dashboard, assessmentBlocks, formBuilder, dashboardKpi };
}
