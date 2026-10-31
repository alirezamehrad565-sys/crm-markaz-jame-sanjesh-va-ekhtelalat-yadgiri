import type { AppHono } from '@core/shared';
import { ReportQuerySchema } from '@core/shared';
import { requireRole } from '@core/auth';
import type { ReportService } from './service';

export function registerRoutes(app: AppHono, service: ReportService): void {
  app.get('/api/reports', requireRole('manager', 'secretary', 'supervisor'), async (c) => { // ناظر فقط-خواندن
    const query = ReportQuerySchema.parse({
      from: c.req.query('from') || '',
      to: c.req.query('to') || ''
    });
    const data = await service.getReport(query.from, query.to);
    return c.json({ data }, 200);
  });

  app.get('/api/reports/advanced', requireRole('manager', 'secretary', 'supervisor'), async (c) => { // ناظر فقط-خواندن
    const query = ReportQuerySchema.parse({
      from: c.req.query('from') || '',
      to: c.req.query('to') || ''
    });
    const data = await service.getAdvancedReport(query.from, query.to);
    return c.json({ data }, 200);
  });
}
