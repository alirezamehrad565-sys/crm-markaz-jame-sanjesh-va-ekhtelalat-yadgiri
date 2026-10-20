/**
 * سرویس داشبورد و KPI ها — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// endpointهای داشبورد — فقط خواندنی، دسترسی همه نقش‌های احراز شده

import type { AppHono } from '@core/shared';
import { DashboardSummaryQuerySchema, DashboardTodayQuerySchema } from '@core/shared';
import { getAuthContext } from '@core/auth';
import type { DashboardService } from './service';

export function registerRoutes(app: AppHono, service: DashboardService): void {
  // کارت‌های عملیاتی امروز (یا تاریخ مشخص)
  app.get('/api/dashboard/today', async (c) => {
    const query = DashboardTodayQuerySchema.parse({
      date: c.req.query('date') || undefined
    });
    const data = await service.getTodayCards(query.date);
    return c.json({ data }, 200);
  });

  // خلاصه دوره
  app.get('/api/dashboard/summary', async (c) => {
    const query = DashboardSummaryQuerySchema.parse({
      from: c.req.query('from') || '',
      to: c.req.query('to') || ''
    });
    const data = await service.getPeriodSummary(query.from, query.to);
    return c.json({ data }, 200);
  });

  // گزارش کوتاه سنجش + نمودار تحقق هدفگذاری (سال شمسی جاری)
  app.get('/api/dashboard/screening-goal', async (c) => {
    const data = await service.getScreeningGoal();
    return c.json({ data }, 200);
  });

  // — m140: GET /api/dashboard/leaderboard حذف شد — مسیر مرده بود (هیچ مصرف‌کنندهٔ
  // فرانت ندارد؛ تابلوی پیشرفت زنده = /api/scoring/board، کارنامه = /api/dashboard/me)

  // کارنامهٔ شخصی همکار («کارنامهٔ من») — همهٔ نقش‌های دارای حساب همکار
  app.get('/api/dashboard/me', async (c) => {
    const actor = getAuthContext(c);
    const data = await service.getMyStats(actor.staffId);
    return c.json({ data }, 200);
  });
}
