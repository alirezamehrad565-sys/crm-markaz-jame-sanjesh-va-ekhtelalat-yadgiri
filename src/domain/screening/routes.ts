import type { AppHono } from '@core/shared';
import { ScreeningCreateSchema, ScreeningQuerySchema, ScreeningUpdateSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { ScreeningService } from './service';

export function registerScreeningRoutes(app: AppHono, service: ScreeningService): void {
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

  app.get('/api/screening/tags', async (c) => {
    const data = await service.tagsSummary();
    return c.json({ data }, 200);
  });

  app.post('/api/screening', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = ScreeningCreateSchema.parse(await c.req.json<unknown>());
    const created = await service.create(
      { name: body.name, tags: body.tags, day: body.day },
      actor
    );
    return c.json({ data: created }, 201);
  });

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

  app.delete('/api/screening/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    await service.remove(c.req.param('id'), actor);
    return c.json({ data: { ok: true } }, 200);
  });
}
