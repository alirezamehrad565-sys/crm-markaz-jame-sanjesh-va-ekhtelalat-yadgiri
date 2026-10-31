# Module: domain/announcements (M10)

Module: `@domain/announcements`
Responsibility: اعلان‌های مدیر — نمایش در صفحه ورود (عمومی)، بنر پنل کارمندان، و ارسال گروهی با بات بله به همکاران و خانواده‌ها.
Public API:
- `createAnnouncementService({ db, audit, logger, notify, baleEnabled, clinicName })`
- `registerAnnouncementRoutes(app, service)`
Owns: جدول `announcements` (write)، صف اعلان‌ها از طریق هسته `@core/notify`
Depends On: `@core/shared`, `@core/db`, `@core/audit`, `@core/logger`, `@core/errors`, `@core/notify`
Internal Structure: `service.ts`، `routes.ts`
Testing: create/update/delete + RBAC، listPublic فقط show_login، ارسال بات با dedup_key
Boundaries:
- ساخت/ویرایش/حذف/ارسال فقط مدیر (requireRole) — نمایش پنل همه کاربران احرازشده.
- نسخه عمومی (`/public/announcements`) فقط title/body/createdAt برمی‌گرداند.
- dedup_key ارسال بات: `announcement:{id}:{target}:{chatId}` → ارسال تکراری پیام دوبل نمی‌سازد.
- حذف اعلان hard delete است + audit (اعلان محتوای عملیاتی است، نه رکورد مالی).
