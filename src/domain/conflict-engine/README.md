# Module: domain/conflict-engine

Module: `@domain/conflict-engine`
Responsibility: تشخیص تداخل نوبت‌ها — Pure function. بدون side-effect، بدون database write. هشدار نرم برمی‌گرداند و هرگز جلوی عملیات را نمی‌گیرد.
Public API:
- `createConflictEngine({ db })` → `ConflictEngine { checkOverlap(proposed), findConflicts(staffId, from, to) }`
- `findOverlaps(existing, proposed)` — هسته pure (بدون دیتابیس)
Owns: هیچ جدولی
Depends On: `@core/db` (فقط type)، `@core/shared` (تایپ‌ها)
Internal Structure: `engine.ts` (pure)، `service.ts` (wrapper دیتابیس‌خوان)، `__tests__/engine.test.ts`
Testing: هم‌پوشانی مرز دقیق (end==start → بدون تداخل)، نوبت لغوشده حساب نمی‌شود، exclude_id، چندتداخلی
Boundaries:
- هیچ write به دیتابیس.
- مصرف‌کنندگان (appointment-core، dashboard) فقط از طریق `index.ts` استفاده می‌کنند.
- حل وابستگی چرخه‌ای با appointment-core: appointment-core از این ماژول به‌صورت read-only استفاده می‌کند و engine از appointment-core هیچ استفاده‌ای نمی‌کند.
