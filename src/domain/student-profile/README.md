# Module: domain/student-profile

Module: `@domain/student-profile`
Responsibility: مدیریت پروفایل دانش‌آموزان و مدارس — CRUD، جستجو با pagination، غیرفعال‌سازی (بدون حذف فیزیکی) و اعتبارسنجی کد ملی.
Public API:
- `createStudentProfileService({ db, audit, logger })` → `StudentProfileService`
- `registerRoutes(app, service)` — ۱۱ endpoint
Owns: جدول‌های `students` و `schools` (write کامل)
Depends On: `@core/shared`، `@core/db`، `@core/audit`، `@core/logger`، `@core/errors`، `@app/http` (فقط helper صفحه‌بندی)
Internal Structure: `types.ts`، `repository.ts`، `service.ts`، `routes.ts`
Testing: ۱۰ تست national-id (checksum رسمی ایران) + endpointها با curl در dev
Boundaries:
- کد ملی با checksum رسمی اعتبارسنجی و نرمال می‌شود (ارقام فارسی/عربی → انگلیسی + padding).
- هیچ حذف فیزیکی — فقط `active = 0`.
- خواندگان مجاز students/schools: همه ماژول‌های domain (read-only) — از طریق API این ماژول.
- `getDirectoryStats()` فقط آمار تجمیعی (بدون PII) برای dashboard برمی‌گرداند.
