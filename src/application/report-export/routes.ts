import type { AppHono } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { ReportExportService2 } from './service';

/* دسترسی اسناد خروجی = همان سه‌گانهٔ گزارش‌های بالینی (الگوی مسیر /api/clinical-paths/:id/report)؛
   بدون نقش تازه. خانواده/معلم فقط از مسیرهای موجود خودشان می‌خوانند و در این route نیستند. */
const REPORT_ROLES = ['manager', 'secretary', 'therapist'] as const;

export function registerReportExportRoutes(app: AppHono, service: ReportExportService2): void {
  app.post('/api/students/:id/report-snapshots', requireRole(...REPORT_ROLES), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<unknown>() as { path_id?: unknown };
    if (typeof body?.path_id !== 'string' || body.path_id.length === 0) {
      return c.json({ error: 'VALIDATION', message: 'شناسهٔ مسیر مداخله الزامی است' }, 400);
    }
    const created = await service.create(c.req.param('id'), { pathId: body.path_id }, actor);
    return c.json({ data: created }, 201);
  });

  app.get('/api/students/:id/report-snapshots', requireRole(...REPORT_ROLES), async (c) => {
    getAuthContext(c);
    const items = await service.list(c.req.param('id'));
    return c.json({ data: items }, 200);
  });

  app.get('/api/students/:id/report-snapshots/:sid', requireRole(...REPORT_ROLES), async (c) => {
    getAuthContext(c);
    const item = await service.getOne(c.req.param('id'), c.req.param('sid'));
    return c.json({ data: item }, 200);
  });
}
