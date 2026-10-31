import { Hono } from 'hono';
import type { AppHono, AuthContext } from '@core/shared';
import { APP_VERSION } from '@core/version';
import { authMiddleware, supervisorGate, getAuthContext } from '@core/auth';
import { createDb } from '@core/db';
import type { DbClient } from '@core/db';
import { createAuditWriter } from '@core/audit';
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
import { FEATURES } from '@core/shared';

import { errorHandler } from '@app/http';

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
  backup: BackupService;
  rum: RumService; // 
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

  appointments.setOpsObserver({
    onOpsStatusChanged: async (appointment, students, _from, to) => {
      if (to !== 'completed') return;
      for (const s of students) {
        await waitlist.onAttendanceMarked(appointment.id, s.studentId, 'present');
      }
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

  // اعتبارسنجی لینک کارت طرح درمان به بانک تمرین: تزریق تابع (نه وابستگی ماژولیِ domain→domain)
  const clinicalEngine = createClinicalEngineService({ db, audit, logger, exerciseIdsExist: (ids) => exerciseBank.idsExist(ids) });

  const otEngine = createOtEngineService({ db, audit, logger });

  // مکانیک پشتیبان‌گیری و بازیابی
  const backup = createBackupService({ db, audit, logger, baleToken: deps.baleToken ?? null, sender: deps.backupDocumentSender ?? null }); // ارسال به آیدی بله

  // تله‌متری کارایی: ثبت بی‌نام + جمع‌بندی صدک (نرخ درون‌حافظه، بدون IP/UA)
  const rum = createRumService({ db, logger });

  return { db, audit, logger, conflictEngine, appointments, attendance, staffAttendance, workingDay, studentProfile, studentTimeline, specialNeeds, staff, workingHours, settings, keys, tags, screening, search, notify, announcements, knowledge, clearbook, docs, finance, reports, waitlist, followups, sessionNotes, todos, exerciseBank, documentRequests, caseEvents, clinicalEngine, otEngine, backup, rum };
}

export function createApp(deps: AppDeps): AppHono {
  const services = createServices(deps);

  const app: AppHono = new Hono<{ Bindings: { DB: D1Database; ENV: string; CF_ACCESS_TEAM_DOMAIN: string }; Variables: { authContext: AuthContext; logger: Logger } }>();

  // — هوک تستی: دسترسی به سرویس‌ها برای e2e (مثلاً setFillObserver در آزمون )
  (app as unknown as { __services?: Services }).__services = services;

  app.use('*', async (c, next) => {
    c.set('logger', services.logger);
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

  registerAuthRoutes(app, { audit: services.audit, logger: services.logger });

  app.use('/api/*', authMiddleware());
  app.use('/api/*', supervisorGate(services.audit));

  // بستن حلقهٔ خروج: خروج احرازشده بعد از گیت ناظر سوار می‌شود؛ رویداد ممیزی actor درست دارد.
  // ناظر طبق از گیت رد می‌شود (۴۰۳) — رفتار فقط-خواندن دست‌نخورده می‌ماند.
  registerLogoutRoute(app, { audit: services.audit, logger: services.logger });

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
