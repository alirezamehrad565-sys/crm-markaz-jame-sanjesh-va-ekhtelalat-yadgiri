/**
 * ماژول اعلان مدیر — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مسیرهای اعلان‌ها (بدون business logic)
// نکته RBAC: همه تغییرها فقط مدیر؛ مشاهده پنل همه؛ نسخه عمومی /public (بدون auth در api-routing)

import { NewAnnouncementSchema, SendAnnouncementSchema, UpdateAnnouncementSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { AppHono } from '@core/shared';
import type { AnnouncementService } from './service';

export function registerAnnouncementRoutes(app: AppHono, service: AnnouncementService): void {
  // ساخت اعلان (مدیر)
  app.post('/api/announcements', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewAnnouncementSchema.parse(await c.req.json<unknown>());
    const result = await service.create(
      { title: body.title, body: body.body, showLogin: body.show_login, showPanel: body.show_panel },
      actor
    );
    return c.json({ data: result }, 201);
  });

  // فهرست مدیریتی — همه اعلان‌ها (مدیر)
  app.get('/api/announcements/manage', requireRole('manager'), async (c) => {
    const items = await service.listAll();
    return c.json({ data: items }, 200);
  });

  // بنر پنل کارمندان (هر کاربر احرازشده)
  app.get('/api/announcements', async (c) => {
    const items = await service.listPanel();
    return c.json({ data: items }, 200);
  });

  // ویرایش اعلان (مدیر)
  app.patch('/api/announcements/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateAnnouncementSchema.parse(await c.req.json<unknown>());
    const result = await service.update(
      c.req.param('id'),
      {
        title: body.title,
        body: body.body,
        showLogin: body.show_login,
        showPanel: body.show_panel,
        active: body.active
      },
      actor
    );
    return c.json({ data: result }, 200);
  });

  // حذف اعلان (مدیر)
  app.delete('/api/announcements/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const result = await service.remove(c.req.param('id'), actor);
    return c.json({ data: result }, 200);
  });

  // ارسال با بات به همکاران یا خانواده‌ها (مدیر)
  app.post('/api/announcements/:id/send', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = SendAnnouncementSchema.parse(await c.req.json<unknown>());
    const result = await service.sendViaBot(c.req.param('id'), body.target, actor);
    return c.json({ data: result }, 200);
  });
}
