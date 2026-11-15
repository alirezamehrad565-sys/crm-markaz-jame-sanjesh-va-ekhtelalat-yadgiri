// مسیرهای گزارش رشد جدول‌ها: GET /api/growth/report — فقط‌مدیر (هم‌الگوی GET /api/health/panel)
// شمارش سنگین COUNT(*) فقط در کرون شبانه رخ می‌دهد؛ این مسیر فقط خواندن snapshotهاست
// (به‌همراه یک COUNT زندهٔ هر جدول — کمیاب و فقط‌مدیر، حکم §۳-۱۵).
import type { AppHono } from '@core/shared';
import { requireRole } from '@core/auth';
import type { GrowthService } from './service';

export function registerGrowthRoutes(app: AppHono, service: GrowthService): void {
  app.get('/api/growth/report', requireRole('manager'), async (c) => {
    const data = await service.report();
    c.header('Cache-Control', 'no-store');
    return c.json({ data }, 200);
  });
}
