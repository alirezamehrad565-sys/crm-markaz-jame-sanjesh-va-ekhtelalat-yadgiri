import type { AppHono } from '@core/shared';
import { NewApiKeySchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { KeysService } from './service';

export function registerKeysRoutes(app: AppHono, service: KeysService): void {
  app.get('/api/keys', requireRole('manager'), async (c) => {
    const data = await service.list();
    return c.json({ data }, 200);
  });

  app.post('/api/keys', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewApiKeySchema.parse(await c.req.json<unknown>());
    const data = await service.create(body.name, body.role, actor);
    return c.json({ data }, 201);
  });

  app.post('/api/keys/:id/revoke', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.revoke(c.req.param('id'), actor);
    return c.json({ data }, 200);
  });
}
