# Module: core/audit

Module: `@core/audit`
Responsibility: ثبت تغییرات در جدول `audit_log` به‌صورت append-only و هم‌تراکنش با تغییر اصلی + نگه‌داری دوره‌ای (ف۴).
Public API: `createAuditWriter(db, opts?)` → `AuditWriter { log(entry), logInTransaction(tx, entry), pruneOld() }`
Owns: جدول `audit_log` (INSERT در مسیرهای معمول — DELETE فقط از `pruneOld` در چرخهٔ کرون شبانه)
Depends On: `@core/db`
Internal Structure: `writer.ts`
Testing: هم‌تراکنش بودن و append-only بودن در تست‌های integration آینده؛ نگه‌داری در `__tests__/audit-retention.test.ts`
Boundaries:
- فراخواننده مسئول تعیین action و changes است (بدون PII).
- `logInTransaction` باید همیشه به‌جای `log` در عملیات write استفاده شود تا integrity حفظ شود.
- `pruneOld` فقط از کرون شبانه صدا زده می‌شود (پیش‌فرض ۱۸۰ روز؛ env اختیاری `AUDIT_LOG_RETENTION_DAYS`؛ صفر = خاموش).
