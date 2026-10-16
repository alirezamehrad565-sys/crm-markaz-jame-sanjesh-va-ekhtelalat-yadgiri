/**
 * ماژول پایگاه دانش — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// دانش‌افزایی
// RBAC: خواندن همهٔ همکاران احرازشده؛ ساخت/ویرایش دفتر (مدیر/منشی)؛ حذف فقط مدیر

import type { AppHono } from '@core/shared';
import { NewKnowledgeSchema, UpdateKnowledgeSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { KnowledgeService } from './types';

export function registerKnowledgeRoutes(app: AppHono, service: KnowledgeService): void {
  // فهرست برای همهٔ همکاران (داشبورد → کارت دانش‌افزایی)
  app.get('/api/knowledge', async (c) => {
    const items = await service.listPublished();
    return c.json({ data: items }, 200);
  });

  // فهرست مدیریتی (تنظیمات → تب دانش)
  app.get('/api/knowledge/manage', requireRole('manager', 'secretary'), async (c) => {
    const items = await service.listAll();
    return c.json({ data: items }, 200);
  });

  // ساخت (دفتر)
  app.post('/api/knowledge', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewKnowledgeSchema.parse(await c.req.json<unknown>());
    const result = await service.create(
      { title: body.title, body: body.body, category: body.category, pinned: body.pinned, published: body.published },
      actor
    );
    return c.json({ data: result }, 201);
  });

  // ویرایش (دفتر)
  app.patch('/api/knowledge/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateKnowledgeSchema.parse(await c.req.json<unknown>());
    const result = await service.update(
      c.req.param('id'),
      {
        title: body.title,
        body: body.body,
        category: body.category,
        pinned: body.pinned,
        published: body.published
      },
      actor
    );
    return c.json({ data: result }, 200);
  });

  // حذف کامل (فقط مدیر — الگوی اعلان‌ها)
  app.delete('/api/knowledge/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const result = await service.remove(c.req.param('id'), actor);
    return c.json({ data: result }, 200);
  });
}
