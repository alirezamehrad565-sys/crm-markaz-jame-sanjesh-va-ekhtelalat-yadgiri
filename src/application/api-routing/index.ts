import { Hono } from 'hono';
import type { AppHono, AppBindings, AppVariables } from '@core/shared';
import { APP_VERSION } from '@core/version';
import { authMiddleware, supervisorGate, getAuthContext } from '@core/auth';
import { createDb } from '@core/db';
import type { DbClient } from '@core/db';
import { createAuditWriter, runWithRequestId } from '@core/audit';
import type { AuditWriter } from '@core/audit';
import { createLogger } from '@core/logger';
import type { Logger } from '@core/logger';
import { ConflictCheckSchema, DashboardSummaryQuerySchema, DashboardTodayQuerySchema } from '@core/shared';
import { createInternalChannel, createNotifyService } from '@core/notify';
import type { NotifyService } from '@core/notify';

import { createConflictEngine } from '@domain/conflict-engine';
import type { ConflictEngine } from '@domain/conflict-engine';
import { createAppointmentService, registerRoutes as appointmentRoutes } from '@domain/appointment-core';
import type { AppointmentService } from '@domain/appointment-core';
import { createAttendanceService, registerRoutes as attendanceRoutes } from '@domain/attendance';
import type { AttendanceService } from '@domain/attendance';
import { createStaffAttendanceService, registerStaffAttendanceRoutes as staffAttendanceRoutes } from '@domain/attendance';
import type { StaffAttendanceService } from '@domain/attendance';
import { createWorkingDayService, registerWorkingDayRoutes } from '@domain/working-day';
import type { WorkingDayService } from '@domain/working-day';
import { createStudentProfileService, registerRoutes as studentProfileRoutes } from '@domain/student-profile';
import type { StudentProfileService } from '@domain/student-profile';
import { createStudentTimelineService, registerStudentTimelineRoutes } from '@app/student-timeline';
import type { StudentTimelineService } from '@app/student-timeline';
import { createSpecialNeedsService, registerSpecialNeedsRoutes } from '@app/special-needs';
import type { SpecialNeedsService } from '@app/special-needs';
import { createWaitlistService, registerWaitlistRoutes } from '@domain/waitlist';
import type { WaitlistService } from '@domain/waitlist';
import { createFollowUpsService, registerFollowUpRoutes } from '@domain/followups';
import type { FollowUpsService } from '@domain/followups';
import { createTodosService, registerTodoRoutes } from '@domain/todos';
import type { TodosService } from '@domain/todos';
import { createExerciseBankService, registerExerciseBankRoutes, sendBaleDocument } from '@domain/exercise-bank';
import type { ExerciseBankService, ExerciseFileSender } from '@domain/exercise-bank';
import { createDocumentRequestService, registerRoutes as documentRequestRoutes } from '@domain/document-requests';
import type { DocumentRequestService } from '@domain/document-requests';
import { createCaseEventsService, registerCaseEventsRoutes, registerCaseEventPublicRoutes } from '@domain/case-events';
import { createGamesService, registerGamesRoutes, registerGamesPublicRoutes } from '@domain/games'; // بستر بک‌اند بازی (۱.۲۵.۰۷)
import type { GamesService } from '@domain/games';
import type { CaseEventsService } from '@domain/case-events';
import { createClinicalEngineService, registerClinicalEngineRoutes } from '@domain/clinical-engine';
import type { ClinicalEngineService } from '@domain/clinical-engine';
import { createOtEngineService, registerOtEngineRoutes } from '@domain/ot-engine';
import type { OtEngineService } from '@domain/ot-engine';
import { CASE_EVENT_FILL_EXPIRY_HOURS, faDigits } from '@core/shared';
import { createR2ObjectStore, createChunkedD1ObjectStore } from '@core/storage';
import type { ObjectStore, R2LikeBucket } from '@core/storage';
import { createTagService, registerRoutes as tagRoutes } from '@domain/tags';
import type { TagService } from '@domain/tags';
import { createScreeningService, registerScreeningRoutes } from '@domain/screening';
import type { ScreeningService } from '@domain/screening';
import { createAnnouncementService, registerAnnouncementRoutes } from '@domain/announcements';
import type { AnnouncementService } from '@domain/announcements';
import { createKnowledgeService, registerKnowledgeRoutes } from '@domain/knowledge';
import type { KnowledgeService } from '@domain/knowledge';
import { createClearbookService, registerClearbookRoutes } from '@domain/clearbook';
import type { ClearbookService } from '@domain/clearbook';
import { createDocsService, registerDocsRoutes } from '@domain/docs'; // نمون‌برگ‌ها و اسناد خام
import type { DocsService } from '@domain/docs';
import { createCenterKpiService, registerCenterKpiRoutes } from '@domain/center-kpi'; // ۱.۲۵.۴۶ — شاخص‌های مرکز
import type { CenterKpiService } from '@domain/center-kpi';
import { createNetworkContentService, registerNetworkContentRoutes } from '@domain/network-content'; // ۱.۲۵.۴۶ — کتابخانهٔ شبکه
import { createBugReportService, registerBugReportRoutes } from '@domain/bug-reports'; // بازاعمال ۱.۲۵.۵۱ — گزارش باگ به پشتیبانی CP
import type { BugReportService } from '@domain/bug-reports';
import { createClientErrorsService, registerClientErrorsRoutes } from '@app/client-errors'; // ۱.۲۵.۶۶ — لولهٔ خطای مرورگر
import type { ClientErrorsService } from '@app/client-errors';
import { createHealthService, registerHealthRoutes } from '@app/health'; // ۱.۲۵.۶۷ — پنل سلامت (CP-3 ف۱)
import type { HealthService } from '@app/health';
import { createGrowthService, registerGrowthRoutes } from '@app/growth'; // ف۴ — گزارش رشد جدول‌ها (بهداشت داده)
import type { GrowthService } from '@app/growth';
import { createContentScoreService, registerContentScoreRoutes } from '@domain/content-score'; // ۱.۲۵.۴۸ m6 — امتیاز شناسنامه
import type { ContentScoreService } from '@domain/content-score';
import { fetchCpContentFile } from '@app/cp-content/sync';
import type { NetworkContentService } from '@domain/network-content';
import { createFinanceService, registerFinanceRoutes } from '@domain/finance'; // بودجه و مالی مرکز
import type { FinanceService } from '@domain/finance';
import { registerImportRoutes } from '@app/excel-import'; // درون‌ریزی اکسل
import { createStaffService, registerRoutes as staffRoutes } from '@domain/staff';
import type { StaffService } from '@domain/staff';
import { createWorkingHoursService, registerRoutes as workingHoursRoutes } from '@domain/working-hours';
import type { WorkingHoursService } from '@domain/working-hours';
import { createDashboardService, registerRoutes as dashboardRoutes } from '@app/dashboard';
import type { DashboardService } from '@app/dashboard';
import { handleScoring } from '../../../worker/scoring.js'; // تلفیق KPI: تابلو از لایهٔ scoring
import { createNotifyAppService, registerRoutes as notifyRoutes } from '@app/notify';
import { createBaleMediaFetcher } from '@core/notify';
import type { MediaFetcher } from '@core/notify';
import type { NotifyAppService } from '@app/notify';
import { createSettingsService, registerSettingsRoutes } from '@app/settings';
import type { SettingsService } from '@app/settings';
import { createBackupService, registerBackupRoutes } from '@app/backup';
import type { BackupService, BackupDocumentSender } from '@app/backup';
import { createKeysService, registerKeysRoutes } from '@app/keys';
import type { KeysService } from '@app/keys';
import { createSearchService, registerSearchRoutes } from '@app/search';
import type { SearchService } from '@app/search';
import { createReportService, registerRoutes as reportRoutes } from '@app/reports';
import type { ReportService } from '@app/reports';
import { createSessionNotesService, registerSessionNoteRoutes } from '@app/session-notes';
import type { SessionNotesService } from '@app/session-notes';
import { createRumService, registerRumRoutes } from '@app/rum'; // پایش کارایی (RUM)
import type { RumService } from '@app/rum';
import { registerAuthRoutes, registerLogoutRoute } from '@app/auth';
import { registerSetupStatusRoutes, registerSetupCompleteRoutes } from '@app/setup/routes'; // v1.26.0 — راه‌اندازی نخست
import { FEATURES } from '@core/shared';
import { createNodeSyncApp } from '../../node-sync/app'; // rust-f4 — زیراپ سینک نودهای دسکتاپ
import { registerInternalSyncRoutes } from '../../internal-sync'; // rust-f9 — استقرار سینک (فقط-موتور، گیت env)
import { registerNodeSyncStatusRoute } from '../../node-sync-runner/status'; // rust-f14 — وضعیت سینک نود برای UI میز

import { errorHandler, parseApiRateLimitPerMin, makeKeyedRateLimiter, API_RATE_LIMIT_WINDOW_MS } from '@app/http';
import { RateLimitError } from '@core/errors';

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
    downloadSecret: deps.downloadSecret ?? deps.webhookSecret ?? 'insecure-dev-secret',
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
    settings
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
    const channel: 'bale' | 'internal' = notifyCore.getChannel('bale') ? 'bale' : 'internal';
    const clinicName = await settings.getClinicName();
    let sent = 0;
    for (const chat of input.chats) {
      const outcome = await notifyCore.enqueue({
        channel,
        template: input.template,
        recipient: chat,
        studentId: input.studentId,
        payload: { ...input.vars, clinicName },
        dedupKey: `${input.dedupBase}:${chat}`
      });
      if (!outcome.duplicate) sent += 1;
    }
    if (sent > 0) await notifyCore.dispatchPending(50);
    return sent;
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
      let sent = 0;
      for (const chat of chats) {
        const outcome = await notifyCore.enqueue({
          channel,
          template: 'bot_checklist_result',
          recipient: chat,
          studentId: input.studentId,
          payload: {
            studentName: studentName ?? undefined,
            formTitle: input.teacherName ? `${input.formTitle} (پاسخ معلم: ${input.teacherName})` : input.formTitle,
            score: input.score != null ? faDigits(String(input.score)) : undefined,
            band: input.band ?? undefined,
            clinicName
          },
          dedupKey: `ce-result:${input.eventId}:${chat}`
        });
        if (!outcome.duplicate) sent += 1;
      }
      if (sent > 0) await notifyCore.dispatchPending(50);
    } catch (err) {
      logger.warn('case-events.fill_observer_failed', { err: err instanceof Error ? err.message : String(err) });
    }
  });

  exerciseBank.setSendObserver(async (input) => {
    const channel: 'bale' | 'internal' = notifyCore.getChannel('bale') ? 'bale' : 'internal';
    const clinicName = await settings.getClinicName();
    let sent = 0;
    for (const chat of input.chats) {
      const outcome = await notifyCore.enqueue({
        channel,
        template: input.template,
        recipient: chat,
        studentId: input.studentId,
        payload: { ...input.vars, clinicName },
        dedupKey: `${input.dedupBase}:${chat}`
      });
      if (!outcome.duplicate) sent += 1;
    }
    if (sent > 0) await notifyCore.dispatchPending(50);
    return sent;
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

  // مکانیک پشتیبان‌گیری و بازیابی
  const backup = createBackupService({ db, audit, logger, baleToken: deps.baleToken ?? null, sender: deps.backupDocumentSender ?? null }); // ارسال به آیدی بله

  // تله‌متری کارایی: ثبت بی‌نام + جمع‌بندی صدک (نرخ درون‌حافظه، بدون IP/UA)
  const rum = createRumService({ db, logger });

  // ۱.۲۵.۶۶ — لولهٔ خطای مرورگر: تا امروز کلاینت به /api/client-errors پست می‌کرد و ۴۰۱ می‌گرفت
  const clientErrors = createClientErrorsService({ db, logger });

  // ۱.۲۵.۶۷ — پنل سلامت (ف۱ طرح ارتقا، CP-3): وضعیت سامانه + شش درگاه لینک CP از مُهرهای settings؛
  // ف۵ (P0-3) — همان پنل حالا آرایهٔ هشدارها را هم مشتق می‌کند (آستانهٔ خطاهای مرورگر از deps)
  const health = createHealthService({
    db,
    cpConfigured: Boolean(deps.cpSyncUrl && deps.cpNodeCode && deps.cpNodeKey),
    envName: deps.envName ?? null,
    clientErrorsMax: deps.clientErrorsMax ?? null
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

  return { db, audit, logger, conflictEngine, appointments, attendance, staffAttendance, workingDay, studentProfile, studentTimeline, specialNeeds, staff, workingHours, settings, keys, tags, screening, search, notify, announcements, knowledge, clearbook, docs, finance, reports, waitlist, followups, sessionNotes, todos, exerciseBank, documentRequests, caseEvents, clinicalEngine, otEngine, games, backup, rum, centerKpi, networkContent, bugReports, clientErrors, health, growth, contentScore };
}

export function createApp(deps: AppDeps): AppHono {
  const services = createServices(deps);

  const app: AppHono = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

  // — هوک تستی: دسترسی به سرویس‌ها برای e2e (مثلاً setFillObserver در آزمون )
  (app as unknown as { __services?: Services }).__services = services;

  app.use('*', async (c, next) => {
    c.set('logger', services.logger);
    return next();
  });

  /* ف۵ (P2-13) — request-id سراسری: هر درخواست /api/* شناسهٔ همبستگی `req-<uuid>` می‌گیرد که
     در سه‌جا می‌نشیند: هدر پاسخ X-Request-Id، فیلد request_id پاکت خطا (errorHandler) و
     ردیف‌های audit_log همان درخواست (زمینهٔ AsyncLocalStorage در @core/audit — همهٔ
     audit.logهای از اعماق سرویس‌ها بدون تغییر امضا شامل می‌شوند). میدل‌ور اولِ /api/* است
     تا هر چیزی که بعدش می‌آید — حتی خطا — شناسه را داشته باشد. */
  app.use('/api/*', async (c, next) => {
    const requestId = `req-${crypto.randomUUID()}`;
    c.set('requestId', requestId);
    try {
      return await runWithRequestId(requestId, () => next());
    } finally {
      // با finally حتی روی مسیر خطا (۴xx/۵xx) هدر می‌نشیند
      c.header('X-Request-Id', requestId);
    }
  });

  /* ف۵ (P2-15) — محدودسازی نرخ نوشتنی /api/* per-IP (پنجرهٔ ثابت درون‌حافظهٔ per-isolate):
     پیش‌فرض ۲۴۰ نوشتنی در دقیقه بر IP — سخاوتمندانه تا کاربرد عادی هرگز ۴۲۹ نبیند؛
     env اختیاری API_RATE_LIMIT_PER_MIN («۰» = خاموش با یک لاگ). مستثنی‌ها:
     ① /api/auth/login — throttle اختصاصی دوبل خودش را دارد (login_throttle: ۵/۱۵دقیقه بر
       شناسه + ۲۰/۱۵دقیقه بر IP) و سقف سراسری روی مسیر ورود، قفل‌شدن دفتر پشت NAT واحد را
       به‌همراه دارد؛ ② مسیرهای /public (تله‌متری rum/client-errors) در این میدل‌ور نیستند و
       limiter خودشان را دارند. محدودیت صادقانه: شمارنده per-isolate است — جزئیات در
       @app/http/rate-limit و سند طرح §۴ آیتم ۱۵. */
  const apiRateLimiter = makeKeyedRateLimiter(API_RATE_LIMIT_WINDOW_MS);
  let rateLimitDisabledLogged = false;
  app.use('/api/*', async (c, next) => {
    if (c.req.method !== 'POST' && c.req.method !== 'PUT' && c.req.method !== 'PATCH' && c.req.method !== 'DELETE') {
      return next(); // فقط متدهای نوشتنی — خواندنی‌ها بی‌سقف می‌مانند (کش no-store خودشان را دارند)
    }
    if (c.req.path === '/api/auth/login') return next(); // مستثنی مستند — throttle اختصاصی دارد

    // env در هر درخواست از bindings خوانده می‌شود (wrangler var/secret رشته می‌دهد)؛
    // کلید سطل، سقف را هم شامل است تا تغییر env سطل تازه بسازد نه بازنویسی سطل قدیم
    const perMin = parseApiRateLimitPerMin(c.env?.API_RATE_LIMIT_PER_MIN);
    if (perMin <= 0) {
      if (!rateLimitDisabledLogged) {
        rateLimitDisabledLogged = true;
        services.logger.child('http').warn('api_rate_limit.disabled', {
          reason: 'API_RATE_LIMIT_PER_MIN=0'
        });
      }
      return next();
    }
    const ip = (c.req.header('cf-connecting-ip') ?? 'unknown').slice(0, 64);
    if (!apiRateLimiter.allow(`${perMin}:${ip}`, perMin)) {
      c.header('Retry-After', String(Math.ceil(API_RATE_LIMIT_WINDOW_MS / 1000)));
      throw new RateLimitError(
        Math.ceil(API_RATE_LIMIT_WINDOW_MS / 1000),
        'درخواست‌های نوشتنی بیش از حد مجاز است — کمی بعد دوباره تلاش کنید'
      );
    }
    return next();
  });

  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff'); // جلوی MIME-sniffing مرورگر
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin'); // نشت URL در Referrer ممنوع
    c.header('X-Frame-Options', 'DENY'); // جاسازی اپ در iframe سایت‌های دیگر ممنوع (clickjacking)
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); // سنسورها برای اپ لازم نیست
    c.header('Cross-Origin-Opener-Policy', 'same-origin'); // ایزوله‌سازی کانتکست بین‌پنجره‌ای
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); // HTTPS اجباری مرورگر
  });

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  app.use('/public/exercise-files/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
  });
  app.use('/public/announcements', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=60');
  });

  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    services.logger.child('http').info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - start
    });
  });

  // — : سلامت واقعی = دسترسی D1 هم آزموده می‌شود؛ خرابی → 503 تا مانیتور بیرونی متوجه شود
  app.get('/health', async (c) => {
    let dbOk = true;
    try {
      await services.db.queryOne('SELECT 1 AS ok');
    } catch {
      dbOk = false;
    }
    return c.json(
      {
        ok: dbOk,
        db: dbOk ? 'up' : 'down',
        version: APP_VERSION,
        ts: new Date().toISOString()
      },
      dbOk ? 200 : 503,
      { 'Cache-Control': 'no-store' }
    );
  });

  app.get('/public/announcements', async (c) => {
    const items = await services.announcements.listPublic();
    return c.json({ data: items }, 200);
  });

  app.get('/public/exercise-files/:id', async (c) => {
    const file = await services.exerciseBank.getPublicFile(c.req.param('id'), c.req.query('token') ?? '');
    if (!file) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'فایل یافت نشد یا پیوند منقضی شده است' } }, 404);
    }
    const asciiFallback = file.filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    const mime = file.mime === 'text/html' ? 'text/html; charset=utf-8' : file.mime;
    return new Response(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'Content-Security-Policy': 'sandbox allow-scripts allow-popups'
      }
    });
  });

  // ۱.۲۵.۰۷ — زنجیرهٔ عمومی بازی (/m/:token و /api/m/:token/*): باید «پیش از» گیت authMiddleware
  // ثبت شود تا توکنِ خودِ لینک جای احراز هویت بنشیند (قرارداد §۵ نقشهٔ راه؛ بدون هیچ اطلاعات بالینی در خطا)
  registerGamesPublicRoutes(app, services.games);

  registerAuthRoutes(app, { audit: services.audit, logger: services.logger });

  // v1.26.0 — وضعیت راه‌اندازی نخست: عمومی و سبک (دو بولین) — راهنمای «manager / 1234»
  // در صفحهٔ ورود فقط تا پایان راه‌اندازی نمایش داده می‌شود (هم در وب هم میز بی‌ضرر است).
  registerSetupStatusRoutes(app, { logger: services.logger });

  /* rust-f4 — زیراپ سینک نودهای دسکتاپ (/node/*): «پیش از» گیت authMiddleware ثبت می‌شود
     (زنجیرهٔ عمومی §۵)؛ احراز مسیرهای نودی خودش node_code+node_key است و مسیرهای مدیریتی
     درون زیراپ با همان گیت سشن بسته می‌شوند. سند: docs/rust/node-sync.md */
  app.route('/node', createNodeSyncApp({ db: services.db, audit: services.audit, logger: services.logger }));

  app.use('/api/*', authMiddleware());
  app.use('/api/*', supervisorGate(services.audit));

  // بستن حلقهٔ خروج: خروج احرازشده بعد از گیت ناظر سوار می‌شود؛ رویداد ممیزی actor درست دارد.
  // ناظر طبق از گیت رد می‌شود (۴۰۳) — رفتار فقط-خواندن دست‌نخورده می‌ماند.
  registerLogoutRoute(app, { audit: services.audit, logger: services.logger });

  // v1.26.0 — پایان راه‌اندازی نخست (بستن حساب‌های نمایشی) — فقط-مدیر؛
  // مدیریت کارکنان از مسیرهای موجود @domain/staff (registerRoutes) استفاده می‌کند — همان‌جا سوار است.
  registerSetupCompleteRoutes(app, { db: services.db, audit: services.audit, logger: services.logger });

  // rust-f9 — استقرار سینک نود در میز: بعد از گیت‌ها تا سشن بگیرد؛ خودش گیت زمان‌اجرای
  // CENTER_DESKTOP_ENGINE دارد (در تولید وب binding غایب است → ۴۰۴ کم‌دست، باندل یکسان).
  registerInternalSyncRoutes(app, { db: services.db, logger: services.logger });

  // rust-f14 — قرارداد وضعیت سینک نود برای UI میز: GET /api/node-sync/status (آینهٔ وضعیت
  // هماهنگ‌ساز/catch-up + شمارش pending_push از DB) و POST همان مسیر برای آینهٔ اسنپ‌شات
  // فرانت‌اند (runner.mirrorStatus). بعد از گیت‌ها تا سشن بگیرد؛ خودش گیت زمان‌اجرای
  // CENTER_DESKTOP_ENGINE دارد (در تولید وب → ۴۰۴ کم‌دست، باندل یکسان).
  registerNodeSyncStatusRoute(app, { db: services.db, logger: services.logger });

  app.get('/api/me', (c) => c.json({ data: c.get('authContext') }, 200));

  appointmentRoutes(app, services.appointments);
  attendanceRoutes(app, services.attendance);
  staffAttendanceRoutes(app, services.staffAttendance); //: حضور و غیاب همکاران
  registerWorkingDayRoutes(app, services.workingDay); //: بورد روز کاری
  studentProfileRoutes(app, services.studentProfile);
  registerStudentTimelineRoutes(app, services.studentTimeline); // فاز ۶: تایم‌لاین §11
  registerSpecialNeedsRoutes(app, services.specialNeeds); // فاز ۷: نیازهای ویژه §12 + وضعیت مدرسه §15

  registerWaitlistRoutes(app, services.waitlist);

  registerFollowUpRoutes(app, services.followups);

  registerTodoRoutes(app, services.todos);

  registerExerciseBankRoutes(app, services.exerciseBank);

  documentRequestRoutes(app, services.documentRequests);

  registerCaseEventsRoutes(app, services.caseEvents);

  registerClinicalEngineRoutes(app, services.clinicalEngine);

  registerGamesRoutes(app, services.games); // ۱.۲۵.۰۷ — API پرسنلی بازی‌ها

  registerOtEngineRoutes(app, services.otEngine);
  registerCaseEventPublicRoutes(app, services.caseEvents, {
    studentNameOf: async (id) => {
      const st = await services.studentProfile.getStudentById(id);
      return st ? `${st.firstName} ${st.lastName}` : null;
    }
  });

  tagRoutes(app, services.tags);
  registerSearchRoutes(app, services.search);

  registerScreeningRoutes(app, services.screening);

  registerAnnouncementRoutes(app, services.announcements);

  registerKnowledgeRoutes(app, services.knowledge);

  registerClearbookRoutes(app, services.clearbook); // کلر بوک مرکز

  registerDocsRoutes(app, services.docs); // نمون‌برگ‌ها و اسناد خام
  registerFinanceRoutes(app, services.finance); // بودجه و مالی مرکز (فقط مدیر)

  registerImportRoutes(app, { db: services.db, audit: services.audit, logger: services.logger }); // درون‌ریزی اکسل

  reportRoutes(app, services.reports);

  registerSessionNoteRoutes(app, services.sessionNotes);

  staffRoutes(app, services.staff);
  workingHoursRoutes(app, services.workingHours);

  registerSettingsRoutes(app, services.settings);

  registerBackupRoutes(app, services.backup); // پشتیبان‌گیری و بازیابی

  registerRumRoutes(app, services.rum); // تله‌متری کارایی (نوشتن عمومی /public/rum، جمع‌بندی فقط‌مدیر)

  registerCenterKpiRoutes(app, services.centerKpi); // ۱.۲۵.۴۶ — شاخص‌های مرکز (مدیر/منشی)
  registerNetworkContentRoutes(app, services.networkContent); // ۱.۲۵.۴۶ — کتابخانهٔ شبکه

  registerBugReportRoutes(app, services.bugReports); // بازاعمال ۱.۲۵.۵۱ — گزارش باگ به پشتیبانی CP

  registerClientErrorsRoutes(app, services.clientErrors); // ۱.۲۵.۶۶ — لولهٔ خطای مرورگر (POST عمومی /public/client-errors، خواندن فقط‌مدیر)
  registerHealthRoutes(app, services.health); // ۱.۲۵.۶۷ — پنل سلامت (GET /api/health/panel فقط‌مدیر)
  registerGrowthRoutes(app, services.growth); // ف۴ — گزارش رشد جدول‌ها (GET /api/growth/report فقط‌مدیر)

  registerContentScoreRoutes(app, { contentScore: services.contentScore }); // ۱.۲۵.۴۸ m6 — امتیاز شناسنامه

  if (FEATURES.apiKeys) registerKeysRoutes(app, services.keys);

  app.get('/api/conflicts', async (c) => {
    const staffId = c.req.query('staff_id') ?? '';
    const from = c.req.query('from') ?? '1970-01-01T00:00:00.000Z';
    const to = c.req.query('to') ?? '9999-12-31T23:59:59.999Z';
    const data = await services.conflictEngine.findConflicts(staffId, from, to);
    return c.json({ data }, 200);
  });

  app.post('/api/conflicts/check', async (c) => {
    const body = ConflictCheckSchema.parse(await c.req.json<unknown>());
    const data = await services.conflictEngine.checkOverlap({
      staffId: body.staff_id,
      startAt: body.start_at,
      endAt: body.end_at,
      excludeId: body.exclude_id
    });
    return c.json({ data }, 200);
  });

  const dashboard = createDashboardService({
    appointments: services.appointments,
    attendance: services.attendance,
    conflicts: services.conflictEngine,
    students: services.studentProfile,
    db: services.db,
    screening: services.screening,
    settings: services.settings
  });
  dashboardRoutes(app, dashboard);

  /* فاز F: تلفیق KPI داشبورد — یک رفت‌وبرگشت HTTP و یک بررسی auth به‌جای ۱۱ GET هم‌زمان.
     همان کارگرهای سرویس‌های موجود، موازی؛ شکست تک‌بخشی → null (همان قرارداد safe() کلاینت).
     endpointهای قدیمی دست‌نخورده می‌مانند (انتقال تدریجی — design.md §API).
     تابلوی پیشرفت از لایهٔ scoring (worker/scoring — نقطهٔ تلاقی خودش در ورکر) با بازسازی Request صدا
     زده می‌شود تا auth، دوره و بوک‌مارک نشست همان مسیر همیشگی را طی کند. */
  app.get('/api/dashboard/kpis', async (c) => {
    const actor = getAuthContext(c);
    const role = actor.role;
    const isTherapist = role === 'therapist';
    const isOffice = role === 'manager' || role === 'secretary';
    const isManager = role === 'manager';

    const date = DashboardTodayQuerySchema.parse({ date: c.req.query('date') || undefined }).date;
    const range = DashboardSummaryQuerySchema.parse({
      from: c.req.query('from') || '',
      to: c.req.query('to') || ''
    });

    const part = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

    const scoringP = part(
      handleScoring(
        new Request(new URL('/api/scoring/board?period=month', c.req.url), { headers: c.req.raw.headers }),
        c.env
      ).then(async (res) => {
        if (!res.ok) return null;
        const body = (await res.json().catch(() => null)) as { data?: unknown } | null;
        return body?.data ?? null;
      })
    );

    const [today, summary, goal, scoring, me, knowledge, announcements, waitlist, dayAppts, followups, validation] =
      await Promise.all([
        isTherapist ? Promise.resolve(null) : part(dashboard.getTodayCards(date)),
        isTherapist ? Promise.resolve(null) : part(dashboard.getPeriodSummary(range.from, range.to)),
        isOffice ? part(dashboard.getScreeningGoal()) : Promise.resolve(null),
        scoringP,
        part(dashboard.getMyStats(actor.staffId)),
        part(services.knowledge.listPublished()),
        part(services.announcements.listPanel()),
        isOffice ? part(services.waitlist.list({})) : Promise.resolve(null),
        isOffice
          ? part(services.appointments.list({ from: c.req.query('appt_from') || undefined, to: c.req.query('appt_to') || undefined }))
          : Promise.resolve(null),
        isOffice ? part(services.followups.list({ group: 'open' }, actor)) : Promise.resolve(null),
        isManager
          ? part(
              Promise.all([
                part(services.clinicalEngine.getValidationKpis(actor)),
                part(services.clinicalEngine.listCaseAudits(actor, null))
              ]).then(([k, a]) => (k ? { kpis: k, audits: a ?? [] } : null))
            )
          : Promise.resolve(null)
      ]);

    return c.json({ data: { today, summary, goal, scoring, me, knowledge, announcements, waitlist, dayAppts, followups, validation } }, 200);
  });

  notifyRoutes(app, services.notify);

  app.onError(errorHandler);

  app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'مسیر درخواستی یافت نشد' }, 404));

  return app;
}
