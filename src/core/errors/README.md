# Module: core/errors

Module: `@core/errors`
Responsibility: کلاس‌های خطای typed با نگاشت مشخص به HTTP status.
Public API: `AppError`, `ValidationError` (400), `AuthError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409 — با `currentVersion`)
Owns: هیچ جدولی
Depends On: هیچ
Internal Structure: `errors.ts`
Testing: پوشش داده‌شده در تست‌های سطح سرویس
Boundaries: فقط لایه‌های پایین‌تر مجاز به throw این خطاها هستند. نگاشت به Response در `@app/http` انجام می‌شود، نه اینجا.
