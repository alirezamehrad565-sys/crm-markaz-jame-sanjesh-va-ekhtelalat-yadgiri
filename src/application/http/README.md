# Module: application/http

Module: `@app/http`
Responsibility: نگاشت خطا → HTTP Response و helperهای پاسخ استاندارد (`{ data, meta }`) و pagination.
Public API: `errorHandler(err, c)`، `ok(data, meta?)`، `paginate(items, page, pageSize, total)`، `pageParams(query)`
Owns: هیچ جدولی
Depends On: `@core/errors`، `@core/shared`، zod
Internal Structure: `responses.ts`، `error-handler.ts`
Testing: نگاشت هر AppError به status صحیح؛ ZodError → 400
Boundaries: هیچ logic کسب‌وکاری. قانون ۱۸: `Cache-Control: no-store` روی همه پاسخ‌های API در api-routing اعمال می‌شود.
