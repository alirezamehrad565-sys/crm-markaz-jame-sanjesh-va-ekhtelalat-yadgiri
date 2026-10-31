# Module: core/shared

Module: `@core/shared`
Responsibility: تعریف انواع داده‌ای مشترک، Zod schemas، ثابت‌ها و توابع زمانی pure. هیچ side-effect ندارد.
Public API: schemas, types, constants, time helpers (`tehranTodayYmd`, `tehranDayRange`, `isOnGrid`, …), national-id helpers (`isValidIranianNationalId`, `normalizeNationalId`)
Owns: هیچ جدولی
Depends On: هیچ ماژولی (فقط zod)
Internal Structure:
- `constants.ts` — مقادیر ثابت (شبکه ۱۵ دقیقه‌ای، وضعیت‌ها، آفست تهران)
- `types.ts` — TypeScript types مشترک + AppBindings/AppVariables
- `schemas.ts` — Zod schemas (منبع یکتای اعتبارسنجی)
- `time.ts` — توابع زمانی pure (ISO UTC ذخیره، نمایش Asia/Tehran)
- `national-id.ts` — checksum رسمی کد ملی ایران
- `__tests__/national-id.test.ts` — ۱۰ تست اعتبارسنجی کد ملی
Testing: تست‌های national-id با Vitest (pure)
Boundaries: هیچ import از لایه‌های بالاتر. هیچ runtime logic سنگین. هیچ side-effect.
