// مسیرهای پنل سلامت: GET /api/health/panel — فقط‌مدیر (هم‌الگوی GET /api/client-errors)
import type { AppHono } from '@core/shared';
import { requireRole } from '@core/auth';
import type { HealthService } from './service';

export function registerHealthRoutes(app: AppHono, service: HealthService): void {
  app.get('/api/health/panel', requireRole('manager'), async (c) => {
    const data = await service.panel();
    c.header('Cache-Control', 'no-store');
    return c.json({ data }, 200);
  });
}
