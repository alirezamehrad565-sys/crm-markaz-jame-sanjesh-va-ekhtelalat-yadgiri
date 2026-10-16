/**
 * سرویس کلیدهای API — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مسیرهای REST کلیدهای API — فقط مدیر (RBAC)
// هیچ business logic اینجا نیست؛ فقط wire + Zod

import type { AppHono } from '@core/shared';
import { NewApiKeySchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { KeysService } from './service';

export function registerKeysRoutes(app: AppHono, service: KeysService): void {
  // ─── فهرست کلیدها (فقط مدیر) ───
  app.get('/api/keys', requireRole('manager'), async (c) => {
    const data = await service.list();
    return c.json({ data }, 200);
  });

  // ─── ساخت کلید جدید (فقط مدیر) — token فقط در همین پاسخ ───
  app.post('/api/keys', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewApiKeySchema.parse(await c.req.json<unknown>());
    const data = await service.create(body.name, body.role, actor);
    return c.json({ data }, 201);
  });

  // ─── ابطال کلید (فقط مدیر) ───
  app.post('/api/keys/:id/revoke', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.revoke(c.req.param('id'), actor);
    return c.json({ data }, 200);
  });
}
