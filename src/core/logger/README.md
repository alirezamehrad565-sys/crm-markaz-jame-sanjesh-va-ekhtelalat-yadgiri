# Module: core/logger

Module: `@core/logger`
Responsibility: لاگ ساختاریافته JSON با scope. هیچ PII (کد ملی، نام، تلفن، ایمیل) در لاگ نوشته نمی‌شود — قانون ۹.
Public API: `createLogger(scope)` → `{ debug, info, warn, error, child }`
Owns: هیچ جدولی
Depends On: هیچ
Internal Structure: `logger.ts`
Testing: لاگ‌ها در تست‌ها بررسی مستقیم نمی‌شوند (side-effect کنسول)
Boundaries: هرگز exception پرتاب نمی‌کند. در production سطح حداقل info است.
