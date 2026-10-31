# Module: domain/appointment-core

Module: `@domain/appointment-core`
Responsibility: چرخه حیات کامل نوبت — ساخت، ویرایش، جابه‌جایی، تغییر مدت، لغو، کپی هفته و بازگردانی.
Public API:
- `createAppointmentService({ db, audit, logger })` → `AppointmentService`
- `registerRoutes(app, getService)` — ۱۱ endpoint
- `service.setConflictEngine(engine)` — حل وابستگی چرخه‌ای (setter injection)
Owns:
- جدول `appointments` (write کامل)
- جدول `appointment_students` (write همه ستون‌ها به‌جز attendance — attendance مالکش `attendance` است)
Depends On: `@core/shared`، `@core/db`، `@core/audit`، `@core/logger`، `@core/errors`، `@domain/conflict-engine` (read-only)
Internal Structure: `types.ts`، `repository.ts` (SQL پارامتری)، `service.ts`، `week-copy.ts`، `routes.ts`
Testing: CRUD کامل، move با تداخل، resize، cancel، version 409، week copy + undo، add/remove student، validation (integration آینده + هسته pure در conflict-engine)
Boundaries:
- version اجباری برای update/move/resize/cancel — قدیمی → 409 با current_version
- audit هم‌تراکنش با تغییر
- هیچ منطق تداخلی در این ماژول — فقط مصرف read-only conflict-engine
- هشدار تداخل در پاسخ create/move/resize برگردانده می‌شود (`warnings`)
