import { z } from 'zod';
import { requireRole, getAuthContext } from '@core/auth';
import type { AppHono } from '@core/shared';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { IMPORT_ROWS_MAX } from './registry';
import { faDigits } from '@core/shared';
import { createImportService } from './service';

// ─── درون‌ریزی اکسل: مسیرها ───
//   GET  /api/import/registry            → موجودیت‌های مجاز نقش فعلی + ستون‌ها
//   POST /api/import/:entity/validate    → وضعیت هر ردیف (افزودن/ویرایش/خطا)
//   POST /api/import/:entity/commit      → ثبت تراکنشی ردیف‌های معتبر
// دسترسی نهایی per-entity در سرویس کنترل می‌شود (مدارس: فقط مدیر؛ تقویم اجرایی: مدیر+منشی)

const ImportRowsSchema = z.object({
  rows: z
    .array(z.record(z.unknown()))
    .min(1, 'هیچ ردیفی برای درون‌ریزی ارسال نشده است')
    .max(IMPORT_ROWS_MAX, `حداکثر ${faDigits(IMPORT_ROWS_MAX)} ردیف در هر بار درون‌ریزی مجاز است`)
});

export function registerImportRoutes(
  app: AppHono,
  deps: { db: DbClient; audit: AuditWriter; logger: Logger }
): void {
  const service = createImportService(deps);
  const gate = requireRole('manager', 'secretary');

  app.get('/api/import/registry', gate, async (c) => {
    const actor = getAuthContext(c);
    return c.json({ data: service.registryFor(actor.role) }, 200);
  });

  app.post('/api/import/:entity/validate', gate, async (c) => {
    const actor = getAuthContext(c);
    const body = ImportRowsSchema.parse(await c.req.json<unknown>());
    const result = await service.validate(c.req.param('entity'), actor.role, body.rows);
    return c.json({ data: result }, 200);
  });

  app.post('/api/import/:entity/commit', gate, async (c) => {
    const actor = getAuthContext(c);
    const body = ImportRowsSchema.parse(await c.req.json<unknown>());
    const result = await service.commit(c.req.param('entity'), body.rows, actor);
    return c.json({ data: result }, 200);
  });
}
