# Module: core/audit

Module: `@core/audit`
Responsibility: ثبت تغییرات در جدول `audit_log` به‌صورت append-only و هم‌تراکنش با تغییر اصلی.
Public API: `createAuditWriter(db)` → `AuditWriter { log(entry), logInTransaction(tx, entry) }`
Owns: جدول `audit_log` (فقط INSERT — UPDATE/DELETE هرگز)
Depends On: `@core/db`
Internal Structure: `writer.ts`
Testing: هم‌تراکنش بودن و append-only بودن در تست‌های integration آینده
Boundaries:
- فراخواننده مسئول تعیین action و changes است (بدون PII).
- `logInTransaction` باید همیشه به‌جای `log` در عملیات write استفاده شود تا integrity حفظ شود.
