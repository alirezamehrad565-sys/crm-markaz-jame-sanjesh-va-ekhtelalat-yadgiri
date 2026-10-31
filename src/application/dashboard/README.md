# Module: application/dashboard

Module: `@app/dashboard`
Responsibility: کارت‌های عملیاتی مدیر (M2) — نوبت‌های امروز، نرخ غیبت، حضورهای pending، تداخل‌های فعال، نوبت بعدی و خلاصه دانش‌آموزان + خلاصه دوره‌ای.
Public API:
- `createDashboardService({ db, appointments, attendance, conflicts, students })` → `DashboardService`
- `registerRoutes(app, service)` — ۲ endpoint
- توابع pure: `computeStatusCounts`، `computeStaffCards`، `computeAttendanceStats`، `groupByDay`، `findNextAppointment`
Owns: هیچ جدولی (read-only)
Depends On: `@domain/appointment-core`، `@domain/attendance`، `@domain/conflict-engine`، `@domain/student-profile` (همه فقط از index.ts و read-only)، `@core/auth` (لیست کارکنان)، `@core/shared`
Internal Structure: `kpis.ts` (pure)، `service.ts`، `routes.ts`، `__tests__/kpis.test.ts`
Testing: تست‌های pure محاسبات KPI با داده‌های mock — بدون دیتابیس
Boundaries:
- هیچ write به هیچ جدولی.
- خواندن داده دانش‌آموزان/مدارس فقط از طریق `studentProfile.getDirectoryStats()` (آمار تجمیعی بدون PII).
- مرز روزها با منطقه زمانی Asia/Tehran (`tehranDayRange`) — قانون ۱۰.
