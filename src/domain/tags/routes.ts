/**
 * ماژول برچسب‌گذاری — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// REST endpoints برچسب‌ها — بدون business logic، فقط سیم به سرویس
// RBAC: خواندن برای همه کارکنان؛ ساخت فقط مدیر و درمانگر (m166 — خواست کاربر:
// «تو این قسمت همکار درمانگر باید بتونه برچسب اضافه کنه»)؛ غیرفعال‌سازی فقط مدیر.

import type { AppHono, TagCategory } from '@core/shared';
import { NewTagSchema, ReplaceStudentTagsSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { TagService } from './types';

export function registerRoutes(app: AppHono, service: TagService): void {
  app.get('/api/tags', async (c) => {
    const category = c.req.query('category') as TagCategory | undefined;
    const activeRaw = c.req.query('active');
    const items = await service.list({
      category,
      active: activeRaw === undefined ? undefined : activeRaw === 'true'
    });
    return c.json({ data: items }, 200);
  });

  // — m166: درمانگر هم می‌تواند برچسب (دستهٔ سفارشی) بسازد — بانک تمرین و پروفایل
  app.post('/api/tags', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewTagSchema.parse(await c.req.json<unknown>());
    const tag = await service.create(
      { name: body.name, category: body.category, color: body.color },
      actor
    );
    return c.json({ data: tag }, 201);
  });

  app.post('/api/tags/:id/deactivate', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const tag = await service.deactivate(c.req.param('id'), actor);
    return c.json({ data: tag }, 200);
  });

  // ───────────── برچسب‌های دانش‌آموز ─────────────

  app.get('/api/students/:id/tags', async (c) => {
    const items = await service.forStudent(c.req.param('id'));
    return c.json({ data: items }, 200);
  });

  app.put('/api/students/:id/tags', async (c) => {
    const actor = getAuthContext(c);
    const body = ReplaceStudentTagsSchema.parse(await c.req.json<unknown>());
    const items = await service.replaceForStudent(c.req.param('id'), body.tag_ids, actor);
    return c.json({ data: items }, 200);
  });
}
