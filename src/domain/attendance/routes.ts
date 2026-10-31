import { MarkAttendanceSchema } from '@core/shared';
import { getAuthContext } from '@core/auth';
import type { AppHono } from '@core/shared';
import type { AttendanceService } from './service';

export function registerRoutes(app: AppHono, service: AttendanceService): void {
  app.patch('/api/attendance/:appointmentId/:studentId', async (c) => {
    const actor = getAuthContext(c);
    const body = MarkAttendanceSchema.parse(await c.req.json<unknown>());
    const result = await service.mark(
      c.req.param('appointmentId'),
      c.req.param('studentId'),
      body.status,
      body.note,
      actor
    );
    return c.json({ data: result }, 200);
  });

  app.get('/api/attendance/pending', async (c) => {
    const actor = getAuthContext(c);
    let staffId = c.req.query('staff_id');
    if (actor.role === 'therapist') staffId = actor.staffId;
    const items = await service.listPending(staffId);
    return c.json({ data: items }, 200);
  });

  app.get('/api/attendance/stats', async (c) => {
    const actor = getAuthContext(c);
    let staffId = c.req.query('staff_id') ?? '';
    if (actor.role === 'therapist') staffId = actor.staffId;
    const from = c.req.query('from') ?? '1970-01-01T00:00:00.000Z';
    const to = c.req.query('to') ?? '9999-12-31T23:59:59.999Z';
    const stats = await service.getStats(staffId, from, to);
    return c.json({ data: stats }, 200);
  });
}
