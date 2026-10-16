/**
 * سرویس گزارش‌ها (دوره، تحلیل پیشرفته، مدارس) — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// + — endpoint گزارش دوره و تحلیل پیشرفته (فقط مدیر و منشی — داده‌های مرکزی)

import type { AppHono } from '@core/shared';
import { ReportQuerySchema } from '@core/shared';
import { requireRole } from '@core/auth';
import type { ReportService } from './service';

export function registerRoutes(app: AppHono, service: ReportService): void {
  app.get('/api/reports', requireRole('manager', 'secretary'), async (c) => {
    const query = ReportQuerySchema.parse({
      from: c.req.query('from') || '',
      to: c.req.query('to') || ''
    });
    const data = await service.getReport(query.from, query.to);
    return c.json({ data }, 200);
  });

  // تحلیل پیشرفته: روند هفتگی، قیف لیست انتظار، پوشش‌ها — همان RBAC و همان Schema بازه
  app.get('/api/reports/advanced', requireRole('manager', 'secretary'), async (c) => {
    const query = ReportQuerySchema.parse({
      from: c.req.query('from') || '',
      to: c.req.query('to') || ''
    });
    const data = await service.getAdvancedReport(query.from, query.to);
    return c.json({ data }, 200);
  });
}
