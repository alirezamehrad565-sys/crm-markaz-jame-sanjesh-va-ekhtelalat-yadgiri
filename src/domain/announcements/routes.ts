import { NewAnnouncementSchema, SendAnnouncementSchema, UpdateAnnouncementSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { AppHono } from '@core/shared';
import type { AnnouncementService } from './service';

export function registerAnnouncementRoutes(app: AppHono, service: AnnouncementService): void {
  app.post('/api/announcements', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewAnnouncementSchema.parse(await c.req.json<unknown>());
    const result = await service.create(
      { title: body.title, body: body.body, showLogin: body.show_login, showPanel: body.show_panel },
      actor
    );
    return c.json({ data: result }, 201);
  });

  app.get('/api/announcements/manage', requireRole('manager'), async (c) => {
    const items = await service.listAll();
    return c.json({ data: items }, 200);
  });

  app.get('/api/announcements', async (c) => {
    const items = await service.listPanel();
    return c.json({ data: items }, 200);
  });

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

  app.delete('/api/announcements/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const result = await service.remove(c.req.param('id'), actor);
    return c.json({ data: result }, 200);
  });

  app.post('/api/announcements/:id/send', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = SendAnnouncementSchema.parse(await c.req.json<unknown>());
    const result = await service.sendViaBot(c.req.param('id'), body.target, actor);
    return c.json({ data: result }, 200);
  });
}
