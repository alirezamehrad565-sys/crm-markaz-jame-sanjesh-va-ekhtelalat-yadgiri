import type { AppHono } from '@core/shared';
import type { SearchService } from './service';

export function registerSearchRoutes(app: AppHono, service: SearchService): void {
  app.get('/api/search', async (c) => {
    const q = c.req.query('q') ?? '';
    const data = await service.globalSearch(q);
    return c.json({ data }, 200);
  });
}
