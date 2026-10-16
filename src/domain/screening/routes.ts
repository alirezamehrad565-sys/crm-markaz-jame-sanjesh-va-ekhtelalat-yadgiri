/**
 * ماژول غربالگری — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// REST endpoints سنجش روزانه — بدون business logic
// RBAC:
// - خواندن (GET): هر سه نقش — درمانگر هم می‌تواند سابقهٔ غربال را ببیند
// - نوشتن (POST/PATCH/DELETE): فقط manager/secretary — همان قاعدهٔ «دفتر»
// (کاربر ماژول روزمره منشی و مدیر است؛ درمانگر در nav نمی‌بیند)

import type { AppHono } from '@core/shared';
import { ScreeningCreateSchema, ScreeningQuerySchema, ScreeningUpdateSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { ScreeningService } from './service';

export function registerScreeningRoutes(app: AppHono, service: ScreeningService): void {
  // ─── فهرست + KPI — فیلتر بازهٔ روز، جستجوی نام، فیلتر برچسب (OR) ───
  app.get('/api/screening', async (c) => {
    const q = ScreeningQuerySchema.parse({
      from: c.req.query('from') || undefined,
      to: c.req.query('to') || undefined,
      q: c.req.query('q') || undefined,
      tag: c.req.query('tag') || undefined
    });
    const data = await service.list({
      from: q.from,
      to: q.to,
      q: q.q,
      tags: q.tag
        ? q.tag
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined
    });
    return c.json({ data }, 200);
  });

  // ─── خلاصهٔ برچسب‌ها (برچسب‌های اخیر باکس ثبت + چیپ‌های فیلتر مدیر) ───
  app.get('/api/screening/tags', async (c) => {
    const data = await service.tagsSummary();
    return c.json({ data }, 200);
  });

  // ─── ثبت سریع نوآموز — فقط دفتر ───
  app.post('/api/screening', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = ScreeningCreateSchema.parse(await c.req.json<unknown>());
    const created = await service.create(
      { name: body.name, tags: body.tags, day: body.day },
      actor
    );
    return c.json({ data: created }, 201);
  });

  // ─── ویرایش نام/برچسب‌ها — فقط دفتر ───
  app.patch('/api/screening/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = ScreeningUpdateSchema.parse(await c.req.json<unknown>());
    const updated = await service.update(
      c.req.param('id'),
      { name: body.name, tags: body.tags },
      actor
    );
    return c.json({ data: updated }, 200);
  });

  // ─── حذف ردیف اشتباه — فقط دفتر (با audit) ───
  app.delete('/api/screening/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    await service.remove(c.req.param('id'), actor);
    return c.json({ data: { ok: true } }, 200);
  });
}
