/**
 * رجیستری مسیرها — ۱.۲۷.۸۰ (architecture-001 — sdt157): از بدنهٔ createApp منتقل شد.
 * دو تابعِ مرزیِ ثبت (عمومی/محافظت‌شده) با مرزِ گیت auth — ترتیبِ فراخوانی در index.ts این
 * مرز را نگه می‌دارد و گروه‌های درونی جابه‌جا نکنند. هر گروه دامنه‌ای یک ثبت‌کنندهٔ مستقل
 * است؛ افزودن یک ماژول دامنه فقط یک ورودی به گروه مربوط است (done_when یافتهٔ ممیزی).
 * سرویس‌ها از composition می‌آیند — این‌جا هیچ سرویسی ساخته نمی‌شود؛ منطق تجمیعیِ
 * داشبورد هم به سرویس @app/dashboard/kpi-source منتقل شده است (فاز F).
 */
import { APP_VERSION } from '@core/version';
import { getAuthContext } from '@core/auth';
import { ConflictCheckSchema, FEATURES } from '@core/shared';
import type { AppHono } from '@core/shared';
import { registerRoutes as appointmentRoutes } from '@domain/appointment-core';
import { registerAssessmentBlockRoutes } from '@domain/assessment-blocks';
import { registerRoutes as attendanceRoutes, registerStaffAttendanceRoutes as staffAttendanceRoutes } from '@domain/attendance';
import { registerWorkingDayRoutes } from '@domain/working-day';
import { registerRoutes as studentProfileRoutes } from '@domain/student-profile';
import { registerStudentTimelineRoutes } from '@app/student-timeline';
import { registerReportExportRoutes } from '@app/report-export'; // ۱.۲۷.۵۳ — موج ۳ ارتقای پرونده: snapshot خروجی‌ها
import { registerSpecialNeedsRoutes } from '@app/special-needs';
import { registerWaitlistRoutes } from '@domain/waitlist';
import { registerFormBuilderRoutes } from '@domain/form-builder';
import { registerFollowUpRoutes } from '@domain/followups';
import { registerTodoRoutes } from '@domain/todos';
import { registerExerciseBankRoutes } from '@domain/exercise-bank';
import { registerRoutes as documentRequestRoutes } from '@domain/document-requests';
import { registerCaseEventsRoutes, registerCaseEventPublicRoutes } from '@domain/case-events';
import { registerGamesRoutes, registerGamesPublicRoutes } from '@domain/games';
import { registerClinicalEngineRoutes } from '@domain/clinical-engine';
import { registerOtEngineRoutes } from '@domain/ot-engine';
import { registerRoutes as tagRoutes } from '@domain/tags';
import { registerScreeningRoutes } from '@domain/screening';
import { registerAnnouncementRoutes } from '@domain/announcements';
import { registerKnowledgeRoutes } from '@domain/knowledge';
import { registerClearbookRoutes } from '@domain/clearbook';
import { registerDocsRoutes } from '@domain/docs';
import { registerCenterKpiRoutes } from '@domain/center-kpi';
import { registerNetworkContentRoutes } from '@domain/network-content';
import { registerBugReportRoutes } from '@domain/bug-reports';
import { registerContentScoreRoutes } from '@domain/content-score';
import { registerFinanceRoutes } from '@domain/finance';
import { registerRoutes as staffRoutes } from '@domain/staff';
import { registerRoutes as workingHoursRoutes } from '@domain/working-hours';
import { registerClientErrorsRoutes } from '@app/client-errors';
import { registerHealthRoutes } from '@app/health';
import { registerSystemRoutes, registerSystemPublicRoutes } from '@app/system';
import { registerEngineCapabilitiesRoutes } from '@app/engine-capabilities';
import { registerGrowthRoutes } from '@app/growth';
import { registerImportRoutes } from '@app/excel-import';
import { registerRoutes as dashboardRoutes } from '@app/dashboard';
import { registerRoutes as notifyRoutes } from '@app/notify';
import { registerAuthRoutes, registerLogoutRoute } from '@app/auth';
import { registerSetupStatusRoutes, registerSetupCompleteRoutes } from '@app/setup/routes';
import { registerSettingsRoutes } from '@app/settings';
import { registerBackupRoutes } from '@app/backup';
import { registerRumRoutes } from '@app/rum';
import { registerKeysRoutes } from '@app/keys';
import { registerSearchRoutes } from '@app/search';
import { registerRoutes as reportRoutes } from '@app/reports';
import { registerSessionNoteRoutes } from '@app/session-notes';
import { createNodeSyncApp, registerCentralQuotaRoutes, registerCentralNodesMapRoutes } from '../../node-sync/app'; // rust-f4 — زیراپ سینک نودهای دسکتاپ؛ rust-f15 — دید سهمیهٔ روزانه فقط-مدیر؛ EXP-8 — نقشهٔ معماری فقط-مدیر
import { registerInternalSyncRoutes } from '../../internal-sync'; // rust-f9 — استقرار سینک (فقط-موتور، گیت env)
import { registerNodeSyncStatusRoute } from '../../node-sync-runner/status'; // rust-f14 — وضعیت سینک نود برای UI میز
import { createInstanceSyncApp } from '../../application/instance-sync/index'; // فاز B — هستهٔ هم‌گامی دوسویه نمونه‌ها (§۲-۴؛ گیت Bearer runtime-secret خودش)
import { registerDesktopRoutes } from '@app/instance-sync/desktop-routes'; // فاز B — هم‌گامی میز↔ابر + کلون (سند §۲-۲/§۲-۴)
import type { AppDeps, Services } from './composition';

/** روت‌های عمومیِ درون‌خطی: سلامت واقعی (EXP-4) + دو مسیر عمومی لینک‌دار */
function registerPublicInlineRoutes(app: AppHono, services: Services): void {
  // — : سلامت واقعی = دسترسی D1 هم آزموده می‌شود؛ خرابی → 503 تا مانیتور بیرونی متوجه شود.
  // EXP-4 (رصد بیرونی مرکز): این مسیر «عمومی و بی‌احراز» است و شکل پاسخ حداقلی و قراردادی
  // {ok, version, server_ts} — نه فیلد بیشتر (بدون هیچ نشت داده؛ جزئیات db/ping بیرون نمی‌رود).
  // مصرف‌کنندگان: Cloudflare Health Check / uptime-check بیرونی (سند راهنمای ادمین §EXP-4)،
  // دروازهٔ سلامت ×۳ scripts/update-remote.mjs (فقط res.ok و "version" می‌خواند) و انتظار
  // سبزشدن موتور محلی در scripts/engine/engine.mjs (فقط res.ok). server_ts هم‌قرارداد
  // پاسخ‌های سینک است تا ساعت مرجع مرکز از همین مسیر هم خواندنی باشد.
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
        version: APP_VERSION,
        server_ts: new Date().toISOString()
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
}

/** ماژول‌های عمومی و subappهایی که احرازِ خودشان را دارند — همگی پیش از گیت auth */
function registerPublicModules(app: AppHono, services: Services): void {
  // ۱.۲۵.۰۷ — زنجیرهٔ عمومی بازی (/m/:token و /api/m/:token/*): باید «پیش از» گیت authMiddleware
  // ثبت شود تا توکنِ خودِ لینک جای احراز هویت بنشیند (قرارداد §۵ نقشهٔ راه؛ بدون هیچ اطلاعات بالینی در خطا)
  registerGamesPublicRoutes(app, services.games);

  registerAuthRoutes(app, { audit: services.audit, logger: services.logger });

  // v1.26.0 — وضعیت راه‌اندازی نخست: عمومی و سبک (دو بولین) — راهنمای «manager / 1234»
  // در صفحهٔ ورود فقط تا پایان راه‌اندازی نمایش داده می‌شود (هم در وب هم میز بی‌ضرر است).
  registerSetupStatusRoutes(app, { logger: services.logger });

  // ۱.۲۶.۴ — وضعیت مُهر ری‌استارت برای ناظر بیرونی (قبل از گیت auth؛ ناظر سشن اپ ندارد)
  registerSystemPublicRoutes(app, { db: services.db });

  // ۱.۲۷.۱۳ — پایانهٔ قابلیت‌های موتور (P0-1 ممیزی §۱): عمومی و سبک، پیش از گیت auth —
  // پوستهٔ Rust و صفحهٔ بوت سشن اپ ندارند؛ پاسخ فقط نسخهٔ باندل + نقشهٔ مسیرهای عمومی است
  // (بدون هیچ دادهٔ کاربر — سنت حداقلی EXP-4). خودآزمایی بوت (P0-2) همین نسخه را با
  // CARGO_PKG_VERSION مقایسه می‌کند و هشدار ناهم‌نسخه‌ای پنل سلامت با اولویت از همین می‌خورد.
  registerEngineCapabilitiesRoutes(app);

  /* rust-f4 — زیراپ سینک نودهای دسکتاپ (/node/*): «پیش از» گیت authMiddleware ثبت می‌شود
     (زنجیرهٔ عمومی §۵)؛ احراز مسیرهای نودی خودش node_code+node_key است و مسیرهای مدیریتی
     درون زیراپ با همان گیت سشن بسته می‌شوند. سند: docs/rust/node-sync.md */
  app.route('/node', createNodeSyncApp({ db: services.db, audit: services.audit, logger: services.logger }));

  /* فاز B — هستهٔ هم‌گامی دوسویه نمونه‌ها (/api/instance-sync/*): «پیش از» گیت authMiddleware
     ثبت می‌شود — احراز این مسیرها خودش Bearer runtime-secret (helper handshake مرکز↔نمونه‌ها
     resolveSessionSecret از @core/auth) + هدر X-Device-Id است (سند §۲-۴؛ هر دو سو — ابر و موتور
     محلی — همین باندل را سرو می‌کنند). مسیرهای UI پنل همین قرارداد، جدا و بعد از گیت‌ها ثبت
     می‌شوند (registerDesktopRoutes پایین‌تر). */
  app.route('/api/instance-sync', createInstanceSyncApp({ db: services.db, logger: services.logger }));
}

/** روت‌های عمومی و بی‌احراز — «پیش از» گیت auth (ترتیب در index.ts) */
export function registerPublicRoutes(app: AppHono, services: Services, deps: AppDeps): void {
  registerPublicInlineRoutes(app, services);
  registerPublicModules(app, services);
}

/** زیرساخت پست-گیت: خروج، پایان راه‌اندازی، سینک میز/ابر، دیدهای مدیریتی و /api/me */
function registerPostGateSystemRoutes(app: AppHono, services: Services, deps: AppDeps): void {
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

  // فاز B — رانر هم‌گامی میز↔ابر (سند §۲-۲/§۲-۴): شش مسیر UI /api/instance-sync/* + زمان‌بند
  // دوره‌ای بوت (فقط-فرایند؛ گارد محیط تست در خودش). بعد از گیت‌ها تا سشن بگیرد؛ خودش گیت
  // CENTER_DESKTOP_ENGINE دارد و تغییرپذیرها فقط-مدیرند (در تولید وب → ۴۰۴ کم‌دست).
  registerDesktopRoutes(app, {
    db: services.db,
    audit: services.audit,
    logger: services.logger,
    backup: services.backup
  });

  // rust-f15 — GET /api/central/quota: دید برآورد مصرف روزانهٔ سهمیه (فقط-مدیر؛ گیت سشن + نقش
  // مدیر درون خود روت). بعد از گیت‌های سراسری تا no-store و ۴۰۱ کم‌دست زنجیرهٔ عمومی برقرار بماند.
  registerCentralQuotaRoutes(app, { db: services.db });

  // EXP-8 — GET /api/central/nodes-map: نقشهٔ معماری مرکز↔نودها (فقط-مدیر؛ همان گیت quota؛
  // ?format=html صفحهٔ مدیریتی رندر-سروری بدون JavaScript). ثبت دو-خطی هم‌الگوی quota.
  registerCentralNodesMapRoutes(app, { db: services.db });

  app.get('/api/me', (c) => c.json({ data: c.get('authContext') }, 200));
}

/** دامنه‌های بالینی: نوبت/حضور/پرونده/انتظار/فرم/پیگیری/رویداد/موتور بالینی/خروجی نسخه‌دار/بازی */
function registerClinicalDomainRoutes(app: AppHono, services: Services, deps: AppDeps): void {
  appointmentRoutes(app, services.appointments);
  // ۱.۲۷.۱۴ — بلوک نوبت سنجش (سرویس در composition ساخته می‌شود — architecture-001)
  registerAssessmentBlockRoutes(app, services.assessmentBlocks);
  attendanceRoutes(app, services.attendance);
  staffAttendanceRoutes(app, services.staffAttendance); //: حضور و غیاب همکاران
  registerWorkingDayRoutes(app, services.workingDay); //: بورد روز کاری
  studentProfileRoutes(app, services.studentProfile);
  registerStudentTimelineRoutes(app, services.studentTimeline); // فاز ۶: تایم‌لاین §11
  registerSpecialNeedsRoutes(app, services.specialNeeds); // فاز ۷: نیازهای ویژه §12 + وضعیت مدرسه §15

  registerWaitlistRoutes(app, services.waitlist, { publicBaseUrl: deps.publicBaseUrl ?? null }); /* ۱.۲۷.۴۴ */

  // ۱.۲۷.۳۴ — فرم‌ساز تعاملی عمومی (سرویس در composition ساخته می‌شود — architecture-001)
  registerFormBuilderRoutes(app, services.formBuilder);

  registerFollowUpRoutes(app, services.followups);

  registerTodoRoutes(app, services.todos);

  registerExerciseBankRoutes(app, services.exerciseBank);

  documentRequestRoutes(app, services.documentRequests);

  registerCaseEventsRoutes(app, services.caseEvents);

  registerClinicalEngineRoutes(app, services.clinicalEngine);

  registerReportExportRoutes(app, services.reportExport); // ۱.۲۷.۵۳ — موج ۳ ارتقای پرونده: snapshot خروجی‌ها

  registerGamesRoutes(app, services.games); // ۱.۲۵.۰۷ — API پرسنلی بازی‌ها

  registerOtEngineRoutes(app, services.otEngine);
  registerCaseEventPublicRoutes(app, services.caseEvents, {
    studentNameOf: async (id) => {
      const st = await services.studentProfile.getStudentById(id);
      return st ? `${st.firstName} ${st.lastName}` : null;
    }
  });
}

/** دامنه‌های محتوایی/اداری: برچسب تا کلیدهای API و زیرساخت پایش */
function registerContentDomainRoutes(app: AppHono, services: Services, deps: AppDeps): void {
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
  registerSystemRoutes(app, {
    db: services.db,
    audit: services.audit,
    logger: services.logger,
    envName: deps.envName ?? null
  }); // ۱.۲۶.۴ — POST /api/system/restart + GET /api/support/error-package (فقط‌مدیر، ۴-۲)
  registerGrowthRoutes(app, services.growth); // ف۴ — گزارش رشد جدول‌ها (GET /api/growth/report فقط‌مدیر)

  registerContentScoreRoutes(app, { contentScore: services.contentScore }); // ۱.۲۵.۴۸ m6 — امتیاز شناسنامه

  if (FEATURES.apiKeys) registerKeysRoutes(app, services.keys);
}

/** موتور تعارض نوبت — دو مسیر درون‌خطی سبک (منطق در @domain/conflict-engine) */
function registerConflictRoutes(app: AppHono, services: Services): void {
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
}

/* فاز F: تلفیق KPI داشبورد — یک رفت‌وبرگشت HTTP و یک بررسی auth به‌جای ۱۱ GET هم‌زمان.
   ۱.۲۷.۸۰ (architecture-001) — منطق تجمیع به سرویس @app/dashboard/kpi-source منتقل شد؛
   این هندلر فقط پرس‌وجو را می‌گیرد و زمینهٔ scoring (url/headers/env) را پاس می‌دهد.
   endpointهای قدیمی دست‌نخورده‌اند (انتقال تدریجی — design.md §API). */
function registerDashboardTailRoutes(app: AppHono, services: Services): void {
  dashboardRoutes(app, services.dashboard);

  app.get('/api/dashboard/kpis', async (c) => {
    const data = await services.dashboardKpi.getKpis(
      getAuthContext(c),
      {
        date: c.req.query('date') || undefined,
        from: c.req.query('from') || '',
        to: c.req.query('to') || '',
        apptFrom: c.req.query('appt_from') || undefined,
        apptTo: c.req.query('appt_to') || undefined
      },
      { url: c.req.url, headers: c.req.raw.headers, env: c.env }
    );
    return c.json({ data }, 200);
  });

  notifyRoutes(app, services.notify);
}

/** روت‌های محافظت‌شده — «پس از» گیت auth + گیت ناظر (ترتیب در index.ts) */
export function registerProtectedRoutes(app: AppHono, services: Services, deps: AppDeps): void {
  registerPostGateSystemRoutes(app, services, deps);
  registerClinicalDomainRoutes(app, services, deps);
  registerContentDomainRoutes(app, services, deps);
  registerConflictRoutes(app, services);
  registerDashboardTailRoutes(app, services);
}
