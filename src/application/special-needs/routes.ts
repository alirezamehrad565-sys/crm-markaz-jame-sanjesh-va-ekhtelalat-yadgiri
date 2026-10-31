import type { AppHono } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { SPECIAL_NEED_SEVERITIES } from '@core/shared';
import type { SpecialNeedsService } from './types';

export function registerSpecialNeedsRoutes(app: AppHono, service: SpecialNeedsService): void {
  app.get('/api/special-needs/grid', requireRole('manager', 'secretary'), async (c) => {
    const severityRaw = c.req.query('severity');
    const severity = severityRaw && (SPECIAL_NEED_SEVERITIES as readonly string[]).includes(severityRaw)
      ? (severityRaw as (typeof SPECIAL_NEED_SEVERITIES)[number])
      : undefined;
    const data = await service.grid(
      {
        schoolId: c.req.query('school_id') || undefined,
        grade: c.req.query('grade') || undefined,
        severity
      },
      getAuthContext(c)
    );
    return c.json({ data }, 200);
  });

  app.get('/api/schools/:id/overview', requireRole('manager', 'secretary'), async (c) => {
    const data = await service.schoolOverview(c.req.param('id'), getAuthContext(c));
    return c.json({ data }, 200);
  });
}
