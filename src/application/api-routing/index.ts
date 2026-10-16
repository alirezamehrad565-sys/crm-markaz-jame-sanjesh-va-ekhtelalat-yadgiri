/**
 * اتصال همهٔ ماژول‌ها به ورودی Worker (composition root) — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Composition root — ساخت همه سرویس‌ها و رجیستر مسیرها روی یک Hono app
// هیچ logic کسب‌وکاری در این لایه نیست.

import { Hono } from 'hono';
import type { AppHono, AuthContext } from '@core/shared';
import { APP_VERSION, APP_MILESTONE } from '@core/version';
import { authMiddleware, supervisorGate } from '@core/auth';
import { createDb } from '@core/db';
import type { DbClient } from '@core/db';
import { createAuditWriter } from '@core/audit';
import type { AuditWriter } from '@core/audit';
import { createLogger } from '@core/logger';
import type { Logger } from '@core/logger';
import { ConflictCheckSchema } from '@core/shared';
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
import { createExerciseBankService, registerExerciseBankRoutes } from '@domain/exercise-bank';
import type { ExerciseBankService } from '@domain/exercise-bank';
import { createCaseEventsService, registerCaseEventsRoutes, registerCaseEventPublicRoutes } from '@domain/case-events';
import type { CaseEventsService } from '@domain/case-events';
import { createClinicalEngineService, registerClinicalEngineRoutes } from '@domain/clinical-engine';
import type { ClinicalEngineService } from '@domain/clinical-engine';
import { createOtEngineService, registerOtEngineRoutes } from '@domain/ot-engine';
import type { OtEngineService } from '@domain/ot-engine';
import { CASE_EVENT_FILL_EXPIRY_HOURS } from '@core/shared';
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
import { createStaffService, registerRoutes as staffRoutes } from '@domain/staff';
import type { StaffService } from '@domain/staff';
import { createWorkingHoursService, registerRoutes as workingHoursRoutes } from '@domain/working-hours';
import type { WorkingHoursService } from '@domain/working-hours';
import { createDashboardService, registerRoutes as dashboardRoutes } from '@app/dashboard';
import type { DashboardService } from '@app/dashboard';
import { createNotifyAppService, registerRoutes as notifyRoutes } from '@app/notify';
import { createBaleMediaFetcher } from '@core/notify';
import type { MediaFetcher } from '@core/notify';
import type { NotifyAppService } from '@app/notify';
import { createSettingsService, registerSettingsRoutes } from '@app/settings';
import type { SettingsService } from '@app/settings';
import { createKeysService, registerKeysRoutes } from '@app/keys';
import type { KeysService } from '@app/keys';
import { createSearchService, registerSearchRoutes } from '@app/search';
import type { SearchService } from '@app/search';
import { createReportService, registerRoutes as reportRoutes } from '@app/reports';
import type { ReportService } from '@app/reports';
import { createSessionNotesService, registerSessionNoteRoutes } from '@app/session-notes';
import type { SessionNotesService } from '@app/session-notes';
import { registerAuthRoutes } from '@app/auth';
import { FEATURES } from '@core/shared';

import { errorHandler } from '@app/http';

export interface AppDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  teamDomain: string;
  /** — پیکربندی اعلان‌ها (اختیاری) */
  baleToken?: string | null;
  webhookSecret?: string | null;
  clinicName?: string;
  /** — دریافت رسانهٔ بله (حلقهٔ بازگشت) — پیش‌فرض: ساخته از baleToken؛ تزریق برای تست */
  mediaFetcher?: MediaFetcher | null;
  /** — binding اختیاری R2 برای فایل تمرین‌ها؛ نبود → ذخیرهٔ D1 */
  exerciseBucket?: unknown;
  /** — secret امضای لینک دانلود خانواده (fallback: webhookSecret) */
  downloadSecret?: string | null;
  /** — آدرس عمومی سامانه برای لینک دانلود (fallback: خالی) */
  publicBaseUrl?: string | null;
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
  reports: ReportService;
  waitlist: WaitlistService;
  followups: FollowUpsService;
  sessionNotes: SessionNotesService;
  todos: TodosService;
  exerciseBank: ExerciseBankService;
  caseEvents: CaseEventsService;
  clinicalEngine: ClinicalEngineService;
  otEngine: OtEngineService;
}

/** ساخت و سیم‌کشی همه سرویس‌ها — حل وابستگی چرخه‌ای با setter injection */
export function createServices(deps: AppDeps): Services {
  const { db, audit, logger } = deps;

  const conflictEngine = createConflictEngine({ db });

  const appointments = createAppointmentService({ db, audit, logger });
  appointments.setConflictEngine(conflictEngine); // حل circular dependency

  const attendance = createAttendanceService({ db, audit, logger });
  const staffAttendance = createStaffAttendanceService({ db, audit, logger }); //
  const workingDay = createWorkingDayService({ db, audit, logger, staffAttendance }); // — بورد روز کاری
  const studentProfile = createStudentProfileService({ db, audit, logger });

  // ─── فاز ۶: تایم‌لاین دانش‌آموز — Projection خالص (فقط db می‌خواند) ───
  const studentTimeline = createStudentTimelineService(db);

  // ─── فاز ۷: نیازهای ویژه + وضعیت همکاری مدرسه — Projection فقط-خواندنی (§12/§15) ───
  const specialNeeds = createSpecialNeedsService({ db });

  // ─── فاز ۳: بنیاد پیگیری — مالک جدول followups + مقصد هوک‌ها (جلسه/لیست انتظار) ───
  const followups = createFollowUpsService({ db, audit, logger });

  // ─── فاز ۴: کارهای داخلی منشی↔مدیر — اعلان todo_assigned بعد از notify وصل می‌شود ───
  const todos = createTodosService({ db, audit, logger });

  // ─── «کمیسیون» و «نمایشگر فعالیت» از کد قطع شدند (خواست کاربر) ───

  // ─── بانک تمرین — ObjectStore (R2 اگر binding بود، وگرنه D1 تکه‌تکه) ───
  // با آداپتر تکه‌تکه، فایل تا ۵۰ مگابایت بدون R2 در D1 ذخیره می‌شود؛
  // فعال‌شدن binding R2 در آینده فقط تعویض آداپتر است (بدون تغییر کد دیگر)
  const exerciseStorage: ObjectStore = deps.exerciseBucket
    ? createR2ObjectStore(deps.exerciseBucket as R2LikeBucket)
    : createChunkedD1ObjectStore(db);
  const exerciseBank = createExerciseBankService({
    db,
    audit,
    logger,
    storage: exerciseStorage,
    downloadSecret: deps.downloadSecret ?? deps.webhookSecret ?? 'insecure-dev-secret',
    // آدرس عمومی برای لینک دانلود فایل تمرین در پیام بستهٔ تکلیف
    publicBaseUrl: deps.publicBaseUrl ?? null
  });

  // ─── /: رویدادهای پرونده (گزارش جلسه/چک‌لیست/پیوست) + تایم‌لاین ───
  // publicBaseUrl برای ساخت لینک امن وب‌فرم (ارسال با یک کلیک)
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

  // ─── فاز W: لیست انتظار — تبدیل اتمیک متقاضی به پرونده + نوبت ───
  const waitlist = createWaitlistService({
    db,
    audit,
    logger,
    appointments,
    students: studentProfile,
    followups
  });

  // ─── برچسب‌گذاری دانش‌آموز + جستجوی سراسری ───
  const tags = createTagService({ db, audit, logger });
  const search = createSearchService({ db, logger });

  // ─── سنجش روزانه — غربال نوآموزان (بدون پروفایل: نام + برچسب) ───
  const screening = createScreeningService({ db, audit, logger });

  // ─── اعلان‌های مدیر (بعد از notifyCore چون از صف آن استفاده می‌کند) ───

  // ─── داده‌های پایه پنل مدیریت ───
  const staff = createStaffService({ db, audit, logger });
  const workingHours = createWorkingHoursService({ db, audit, logger });

  // ─── تنظیمات مرکز (مالک جدول settings) ───
  const settings = createSettingsService({
    db,
    audit,
    logger,
    workingHours,
    envClinicName: deps.clinicName,
    baleConfigured: Boolean(deps.baleToken),
    webhookEnabled: Boolean(deps.webhookSecret)
  });

  // ─── کلیدهای API ───
  const keys = createKeysService({ db, audit, logger });

  // ─── /: هسته notify + کانال‌ها ───
  const notifyCore: NotifyService = createNotifyService({ db, logger });
  // کانال internal همیشه هست — dev بدون توکن بله هم dispatch سبز می‌ماند
  notifyCore.registerChannel(createInternalChannel(logger));

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
    publicBaseUrl: deps.publicBaseUrl ?? null,
    // رویدادهای پرونده (ویزارد بات + چک‌لیست خانواده)
    caseEvents,
    // «هدف سنجش» بات = همان اعداد داشبورد (سنجش روزانه)
    screening,
    // حلقهٔ بازگشت: با توکن بله fetcher واقعی، در تست fetcher تزریقی، بدون هر دو null
    mediaFetcher:
      deps.mediaFetcher !== undefined
        ? deps.mediaFetcher
        : deps.baleToken
          ? createBaleMediaFetcher({ token: deps.baleToken })
          : null
  });

  // ─── ناظر چرخه حیات نوبت → اعلان خودکار به معلم و ولیّ‌ها ───
  //: بعد از اعلان لغو، «نوبت خالی شد» به دفتر (مدیر/منشی متصل) — best-effort با پرچم خودش
  appointments.setLifecycleObserver({
    onCreated: (a) => notify.notifyAppointmentCreated(a),
    onMoved: (a, prev) => notify.notifyAppointmentMoved(a, prev),
    onCancelled: (a) => notify.notifyAppointmentCancelled(a).then(() => notify.notifyWaitlistSlotFreed(a))
  });

  // ─── + فاز W: ناظر ثبت حضور → اعلان غیبت به خانواده + پذیرش خودکار لیست انتظار ───
  attendance.setObserver({
    onMarked: async (apptId, studentId, status) => {
      await notify.notifyAttendanceMarked(apptId, studentId, status);
      await waitlist.onAttendanceMarked(apptId, studentId, status);
    }
  });

  // ─── ناظر بورد منشی — اتمام جلسه (completed) = پذیرش خودکار متقاضیانِ متصل ───
  // بدون اعلان (D6). best-effort — خطا در همان ناظر جذب می‌شود.
  appointments.setOpsObserver({
    onOpsStatusChanged: async (appointment, students, _from, to) => {
      if (to !== 'completed') return;
      for (const s of students) {
        await waitlist.onAttendanceMarked(appointment.id, s.studentId, 'present');
      }
    }
  });

  // ─── فاز ۴: ناظر کار داخلی → اعلان todo_assigned به مسئول (§9.5؛ خطا عملیات را fail نمی‌کند) ───
  todos.setNotifier((todo) => notify.notifyTodoAssigned(todo));

  // ─── c — ناظر تصحیح تکلیف → اعلان «تمرین تصحیح شد» به خانواده (best-effort) ───
  exerciseBank.setGradeObserver(async (record) => {
    await notify.notifyHomeworkGraded({
      studentId: record.studentId,
      studentName: record.studentName,
      exerciseTitle: record.exerciseTitle,
      feedback: record.feedback ?? '',
      gradedByName: record.gradedByName
    });
  });

  // ─── ناظر ارسال چک‌لیست → پیام بله با لینک امن وب‌فرم (خانواده/معلم کلاس) ───
  // notifyCore (هستهٔ صف) مستقیم مصرف می‌شود — همان الگوی بات‌ها
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

  // ─── ناظر ارسال بستهٔ تکلیف → پیام بله با لینک‌های امن دانلود به ولیّ‌ها ───
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

  // ─── گزارش‌های دوره ───
  const reports = createReportService({ db, logger });

  // ─── فاز ۲: گزارش جلسه (مالک سه ستون session_note/next_action/session_type_id) ───
  // فاز ۳: هوک §37 وصل شد — ذخیرهٔ next_action=follow_up در همان تراکنش پیگیری می‌سازد
  const sessionNotes = createSessionNotesService({ db, audit, logger, followups });

  // ─── سرویس اعلان‌ها (باید بعد از notify باشد) ───
  const announcements = createAnnouncementService({
    db,
    audit,
    logger,
    notify: notifyCore,
    baleEnabled: Boolean(deps.baleToken),
    clinicName: deps.clinicName
  });

  // ─── سرویس دانش‌افزایی (خواندن همه؛ مدیریت دفتر) ───
  const knowledge = createKnowledgeService({ db, audit, logger });

  // ─── موتور بالینی — تفسیر زنده + مسیر مداخله + پروتکل قضاوت ───
  const clinicalEngine = createClinicalEngineService({ db, audit, logger });

  // ─── موتور فلو دوفازی شناسایی→مداخله + چک‌لیست ۷ حیطه‌ای کاردرمانی ذهنی ───
  const otEngine = createOtEngineService({ db, audit, logger });

  return { db, audit, logger, conflictEngine, appointments, attendance, staffAttendance, workingDay, studentProfile, studentTimeline, specialNeeds, staff, workingHours, settings, keys, tags, screening, search, notify, announcements, knowledge, reports, waitlist, followups, sessionNotes, todos, exerciseBank, caseEvents, clinicalEngine, otEngine };
}

export function createApp(deps: AppDeps): AppHono {
  const services = createServices(deps);

  const app: AppHono = new Hono<{ Bindings: { DB: D1Database; ENV: string; CF_ACCESS_TEAM_DOMAIN: string }; Variables: { authContext: AuthContext; logger: Logger } }>();

  // logger در Variables — برای errorHandler و ماژول‌ها
  app.use('*', async (c, next) => {
    c.set('logger', services.logger);
    return next();
  });

  // ─── هدرهای امنیتی سراسری (پاسخ‌های Worker — API و مسیرهای عمومی) ───
  // فایل‌های استاتیک معادل این‌ها را از public/_headers می‌گیرند.
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff'); // جلوی MIME-sniffing مرورگر
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin'); // نشت URL در Referrer ممنوع
    c.header('X-Frame-Options', 'DENY'); // جاسازی اپ در iframe سایت‌های دیگر ممنوع (clickjacking)
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); // سنسورها برای اپ لازم نیست
    c.header('Cross-Origin-Opener-Policy', 'same-origin'); // ایزوله‌سازی کانتکست بین‌پنجره‌ای
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); // HTTPS اجباری مرورگر
  });

  // قانون ۱۸: Cache-Control: no-store روی همه پاسخ‌های API
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  // ─── سیاست کش مسیرهای عمومی (خارج از /api/* هستند) ───
  // فایل خانواده (لینک امضاشدهٔ تکلیف) — دادهٔ شخصی است؛ هیچ کشی (حتی مرورگر) مجاز نیست
  app.use('/public/exercise-files/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
  });
  // اعلان‌های عمومی صفحه ورود — غیرحساس؛ کش ۶۰ ثانیه‌ای برای کاهش بار D1
  app.use('/public/announcements', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=60');
  });

  // request logger — بدون PII
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

  // ─── Health (بدون auth) — وضعیت زیرساخت + نسخهٔ سامانه؛ هیچ کشی نباید نگهش دارد ───
  // نسخه اینجا برگردانده می‌شود تا پس از هر deploy بتوان با
  // `curl https://<دامنه>/health` تأیید کرد نسخهٔ جدید واقعاً زنده است.
  app.get('/health', (c) => c.json(
    {
      ok: true,
      version: APP_VERSION,
      milestone: APP_MILESTONE,
      ts: new Date().toISOString()
    },
    200,
    { 'Cache-Control': 'no-store' }
  ));

  // ─── اعلان‌های عمومی صفحه ورود (بدون auth — خارج از /api/*) ───
  app.get('/public/announcements', async (c) => {
    const items = await services.announcements.listPublic();
    return c.json({ data: items }, 200);
  });

  // ─── دانلود خانواده با لینک امضاشده (بدون auth — توکن HMAC ۷روزه) ───
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
        // هم‌سنگ باندل زنده: محتوای آپلودی در origin سندباکس‌شده اجرا می‌شود؛
        // HTML/SVG آپلودی به داده‌های نشست همین origin دسترسی ندارد.
        'Content-Security-Policy': 'sandbox allow-scripts allow-popups'
      }
    });
  });

  // ─── صفحه ورود (بدون auth — باید قبل از authMiddleware رجیستر شود) ───
  registerAuthRoutes(app, { audit: services.audit, logger: services.logger });

  // ─── Auth ───
  app.use('/api/*', authMiddleware());
  // دیوار ناظر اداره (deny-by-default) — بلافاصله بعد از auth
  app.use('/api/*', supervisorGate(services.audit));

  // ─── Me ───
  app.get('/api/me', (c) => c.json({ data: c.get('authContext') }, 200));

  // ─── Domain routes ───
  appointmentRoutes(app, services.appointments);
  attendanceRoutes(app, services.attendance);
  staffAttendanceRoutes(app, services.staffAttendance); //: حضور و غیاب همکاران
  registerWorkingDayRoutes(app, services.workingDay); //: بورد روز کاری
  studentProfileRoutes(app, services.studentProfile);
  registerStudentTimelineRoutes(app, services.studentTimeline); // فاز ۶: تایم‌لاین §11
  registerSpecialNeedsRoutes(app, services.specialNeeds); // فاز ۷: نیازهای ویژه §12 + وضعیت مدرسه §15

  // ─── فاز W: لیست انتظار ───
  registerWaitlistRoutes(app, services.waitlist);

  // ─── فاز ۳: بنیاد پیگیری ───
  registerFollowUpRoutes(app, services.followups);

  // ─── فاز ۴: کارهای داخلی منشی↔مدیر ───
  registerTodoRoutes(app, services.todos);

  // ─── بانک تمرین + حلقهٔ تکلیف ───
  registerExerciseBankRoutes(app, services.exerciseBank);

  // ─── رویدادهای پرونده (فرم‌ساز + رویدادها) + وب‌فرم خانواده ───
  registerCaseEventsRoutes(app, services.caseEvents);

  // ─── موتور بالینی — تفسیر + مسیر مداخله + تصمیم ───
  registerClinicalEngineRoutes(app, services.clinicalEngine);

  // ─── گیت‌های شناسایی + چک‌لیست کاردرمانی ذهنی + نتیجهٔ نیاز ویژه ───
  registerOtEngineRoutes(app, services.otEngine);
  registerCaseEventPublicRoutes(app, services.caseEvents, {
    studentNameOf: async (id) => {
      const st = await services.studentProfile.getStudentById(id);
      return st ? `${st.firstName} ${st.lastName}` : null;
    }
  });

  // ─── برچسب‌ها + جستجوی سراسری ───
  tagRoutes(app, services.tags);
  registerSearchRoutes(app, services.search);

  // ─── پرونده ارزیابی ───

  // ─── سنجش روزانه — غربال نوآموزان ───
  registerScreeningRoutes(app, services.screening);

  // ─── اعلان‌های مدیر ───
  registerAnnouncementRoutes(app, services.announcements);

  // ─── دانش‌افزایی ───
  registerKnowledgeRoutes(app, services.knowledge);

  // ─── گزارش‌های دوره ───
  reportRoutes(app, services.reports);

  // ─── فاز ۲: گزارش جلسه ───
  registerSessionNoteRoutes(app, services.sessionNotes);

  // ─── staff + working hours (base data) ───
  staffRoutes(app, services.staff);
  workingHoursRoutes(app, services.workingHours);

  // ─── تنظیمات ───
  registerSettingsRoutes(app, services.settings);

  // ─── کلیدهای API — فعلاً قطع است (FEATURES.apiKeys = false)
  // کد و تست‌ها سر جایشان هستند؛ برای اتصال مجدد فقط فلگ را true کنید
  if (FEATURES.apiKeys) registerKeysRoutes(app, services.keys);

  // ─── Conflict debug endpoints ───
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

  // ─── Dashboard ( + شاخص سنجش) ───
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

  // ─── Notifications + Bale webhook ───
  notifyRoutes(app, services.notify);

  // ─── Error handler ───
  app.onError(errorHandler);

  // ─── ۴۰۴ JSON برای مسیرهای ناشناخته (به‌جای متن ساده Hono) ───
  app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'مسیر درخواستی یافت نشد' }, 404));

  return app;
}
