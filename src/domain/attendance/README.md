# Module: domain/attendance

Module: `@domain/attendance`
Responsibility: ثبت وضعیت حضور هر دانش‌آموز در نوبت (present / absent / cancelled)، لیست ثبت‌های معوق، و آمار نرخ غیبت.
Public API:
- `createAttendanceService({ db, audit, logger })` → `AttendanceService { mark, listPending, getStats }`
- `registerRoutes(app, service)` — ۳ endpoint
Owns: فقط ستون‌های `attendance` و `note` در جدول `appointment_students`
Depends On: `@core/shared`، `@core/db`، `@core/audit`، `@core/logger`، `@core/errors`
Internal Structure: `service.ts`، `routes.ts`
Testing: mark present/absent/cancelled، mark روی نوبت cancelled → خطا، listPending، stats
Boundaries:
- هیچ write به جدول‌های دیگر — حتی `appointments`.
- خواندن نوبت فقط SQL join read-only (مالکیت نوشتن دست‌نخورده).
- mark روی نوبت گذشته مجاز؛ روی نوبت لغوشده ممنوع.
