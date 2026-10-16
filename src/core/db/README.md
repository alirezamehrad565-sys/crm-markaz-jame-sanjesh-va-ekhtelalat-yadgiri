# Module: core/db

Module: `@core/db`
Responsibility: wrapper روی D1 binding — query پارامتری، batch، و transaction واقعی با الگوی collector + `d1.batch()` (atomic).
Public API: `createDb(d1, logger?)` → `DbClient { query, queryOne, execute, batch, transaction }`
Owns: جدول `schema_migrations` (نسخه‌برداری schema فقط با migration خط فرمان انجام می‌شود)
Depends On: `@core/logger` (فقط برای لاگ خطای batch)، `@core/errors`، `@core/shared` (تایپ‌های پایه در عمل، برای جلوگیری از وابستگی معکوس مستقیماً import نمی‌کند)
Internal Structure: `client.ts`
Testing: پارامتری بودن کوئری‌ها و atomic بودن transaction در تست‌های integration آینده (Miniflare)
Boundaries:
- هیچ business logic.
- هیچ آگاهی از جدول‌های domain.
- تراکنش D1 اتمیک است: در صورت شکست یکی از statementها همه rollback می‌شوند.
