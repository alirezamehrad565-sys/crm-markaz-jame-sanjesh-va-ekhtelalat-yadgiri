# Module: core/auth

Module: `@core/auth`
Responsibility: verify JWT کلادفلر اکسس، resolve ایمیل به ردیف staff، inject زمینه احراز هویت (AuthContext)، و خواندن‌های read-only جدول staff.
Public API:
- `authMiddleware()` — middleware استاندارد
- `requireRole(...roles)` — محدودسازی نقش
- `getAuthContext(c)` — خواندن زمینه از Context
- `resolveStaffByEmail(db, email)`, `getStaffById(db, id)`, `listStaff(db, onlyActive?)`
- `resetJwksCache()` — فقط تست
Owns: خواندن جدول `staff` (مالک نوشتن: manual / future module)
Depends On: `@core/errors`، `@core/shared` (تایپ‌ها)، htmx `hono` (middleware)
Internal Structure: `jwt.ts` (verify RS256 با WebCrypto + cache کلید عمومی ۵ دقیقه)، `staff.ts`، `middleware.ts`
Testing: JWT معتبر → 200، JWT جعلی → 401، ایمیل ناموجود → 401، staff inactive → 401
Boundaries:
- اعتماد به هدر بدون verify هرگز ممنوع.
- `staff.active = 0` → 401.
- مسیرهای `/webhook/*` از auth مستثنی هستند.
- در `ENV=development` هدر `X-Dev-Staff-Id` bypass می‌کند (فقط محلی).
