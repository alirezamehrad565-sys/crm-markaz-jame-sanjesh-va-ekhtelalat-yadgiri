/**
 * سرویس جستجوی سراسری — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// GET /api/search?q=… — جستجوی سراسری (فقط خواندنی، همه کارکنان)

import type { AppHono } from '@core/shared';
import type { SearchService } from './service';

export function registerSearchRoutes(app: AppHono, service: SearchService): void {
  app.get('/api/search', async (c) => {
    const q = c.req.query('q') ?? '';
    const data = await service.globalSearch(q);
    return c.json({ data }, 200);
  });
}
