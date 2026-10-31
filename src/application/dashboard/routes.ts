import type { AppHono } from '@core/shared';
import { DashboardSummaryQuerySchema, DashboardTodayQuerySchema } from '@core/shared';
import { getAuthContext } from '@core/auth';
import type { DashboardService } from './service';

export function registerRoutes(app: AppHono, service: DashboardService): void {
  app.get('/api/dashboard/today', async (c) => {
    const query = DashboardTodayQuerySchema.parse({
      date: c.req.query('date') || undefined
    });
    const data = await service.getTodayCards(query.date);
    return c.json({ data }, 200);
  });

  app.get('/api/dashboard/summary', async (c) => {
    const query = DashboardSummaryQuerySchema.parse({
      from: c.req.query('from') || '',
      to: c.req.query('to') || ''
    });
    const data = await service.getPeriodSummary(query.from, query.to);
    return c.json({ data }, 200);
  });

  app.get('/api/dashboard/screening-goal', async (c) => {
    const data = await service.getScreeningGoal();
    return c.json({ data }, 200);
  });

  app.get('/api/dashboard/me', async (c) => {
    const actor = getAuthContext(c);
    const data = await service.getMyStats(actor.staffId);
    return c.json({ data }, 200);
  });
}
