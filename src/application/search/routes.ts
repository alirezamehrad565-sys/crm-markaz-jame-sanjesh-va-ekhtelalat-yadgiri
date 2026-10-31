import type { AppHono } from '@core/shared';
import { getAuthContext } from '@core/auth';
import type { SearchService } from './service';

export function registerSearchRoutes(app: AppHono, service: SearchService): void {
  app.get('/api/search', async (c) => {
    const q = c.req.query('q') ?? '';
    // نقش کاربر برای گیت گروه «اسناد» (فقط مدیر/منشی)
    const actorRole = getAuthContext(c)?.role ?? null;
    const data = await service.globalSearch(q, actorRole);
    return c.json({ data }, 200);
  });
}
