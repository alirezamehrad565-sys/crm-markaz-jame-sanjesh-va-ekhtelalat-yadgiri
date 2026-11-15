import type { AppHono } from '@core/shared';
import { requireRole } from '@core/auth';
import type { CenterKpiService } from './types';
import { isKpiDays } from './types';

// ─── شاخص‌های مرکز: مسیرها — فقط مدیر و منشی (تابلوی عملیاتی مرکز) ───

export function registerCenterKpiRoutes(app: AppHono, service: CenterKpiService): void {
  const office = requireRole('manager', 'secretary');

  app.get('/api/kpi/summary', office, async (c) => {
    const rawDays = Number(c.req.query('days') ?? 30);
    const days = isKpiDays(rawDays) ? rawDays : 30;
    const data = await service.summary(days);
    return c.json({ data }, 200);
  });
}
