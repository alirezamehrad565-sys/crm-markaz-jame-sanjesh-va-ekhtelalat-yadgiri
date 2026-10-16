/**
 * سرویس تایم‌لاین پرونده — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فاز ۶ — GET /api/students/:id/timeline — خواندن آزاد داخل مرکز (هم‌سطح خواندن پرونده)

import type { AppHono } from '@core/shared';
import { getAuthContext } from '@core/auth';
import type { StudentTimelineService } from './types';
import { TIMELINE_KINDS } from './types';

export function registerStudentTimelineRoutes(app: AppHono, service: StudentTimelineService): void {
  app.get('/api/students/:id/timeline', async (c) => {
    const actor = getAuthContext(c);
    const kindsRaw = c.req.query('kinds');
    const kinds = kindsRaw
      ? (kindsRaw
          .split(',')
          .map((k) => k.trim())
          .filter((k): k is (typeof TIMELINE_KINDS)[number] => (TIMELINE_KINDS as readonly string[]).includes(k)))
      : undefined;

    const result = await service.list(c.req.param('id'), {
      from: c.req.query('from') || undefined,
      to: c.req.query('to') || undefined,
      kinds,
      limit: c.req.query('limit') ? Number.parseInt(c.req.query('limit')!, 10) : undefined,
      offset: c.req.query('offset') ? Number.parseInt(c.req.query('offset')!, 10) : undefined
    }, actor);

    return c.json({ data: result.events, nextAction: result.nextAction, meta: { hasMore: result.hasMore } }, 200);
  });
}
