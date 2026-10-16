/**
 * ماژول کارکنان — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Staff REST endpoints — no business logic here, just wire to service

import type { AppHono } from '@core/shared';
import { NewStaffSchema, UpdateStaffSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { NotFoundError } from '@core/errors';
import type { StaffService } from './types';

export function registerRoutes(app: AppHono, service: StaffService): void {
  app.get('/api/staff', async (c) => {
    const activeRaw = c.req.query('active');
    const items = await service.list({
      active: activeRaw === undefined ? undefined : activeRaw === 'true'
    });
    return c.json({ data: items }, 200);
  });

  app.get('/api/staff/:id', async (c) => {
    const member = await service.getById(c.req.param('id'));
    if (!member) throw new NotFoundError('کارمند');
    return c.json({ data: member }, 200);
  });

  // تنظیم کارکنان فقط مدیر (تفکیک نقش‌ها: معلم/منشی فقط مشاهده برای فرم‌ها)
  app.post('/api/staff', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewStaffSchema.parse(await c.req.json<unknown>());
    const member = await service.create(
      {
        fullName: body.full_name,
        phone: body.phone,
        nationalId: body.national_id,
        username: body.username,
        password: body.password,
        role: body.role,
        notifyEnabled: body.notify_enabled
      },
      actor
    );
    return c.json({ data: member }, 201);
  });

  app.patch('/api/staff/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateStaffSchema.parse(await c.req.json<unknown>());
    const member = await service.update(
      c.req.param('id'),
      {
        fullName: body.full_name,
        phone: body.phone,
        nationalId: body.national_id,
        username: body.username,
        password: body.password,
        role: body.role,
        notifyEnabled: body.notify_enabled
      },
      actor
    );
    return c.json({ data: member }, 200);
  });

  app.post('/api/staff/:id/activate', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const member = await service.setActive(c.req.param('id'), true, actor);
    return c.json({ data: member }, 200);
  });

  app.post('/api/staff/:id/deactivate', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const member = await service.setActive(c.req.param('id'), false, actor);
    return c.json({ data: member }, 200);
  });

  // حذف کامل همکار ثبت‌شدهٔ اشتباه — فقط مدیر؛ گاردها در سرویس (409)
  app.delete('/api/staff/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    await service.remove(c.req.param('id'), actor);
    return c.body(null, 204);
  });
}
