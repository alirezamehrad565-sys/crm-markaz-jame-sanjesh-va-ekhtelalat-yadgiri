import { NewDayNoteSchema, WorkingDayQuerySchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { AppHono } from '@core/shared';
import type { WorkingDayService } from './service';

export function registerWorkingDayRoutes(app: AppHono, service: WorkingDayService): void {
  app.get('/api/working-day', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const q = WorkingDayQuerySchema.parse({ date: c.req.query('date') || undefined });
    const board = await service.getBoard(q.date, actor);
    return c.json({ data: board }, 200);
  });

  app.post('/api/working-day/notes', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewDayNoteSchema.parse(await c.req.json<unknown>());
    const note = await service.addNote(body.date, body.body, actor);
    return c.json({ data: note }, 201);
  });

  app.delete('/api/working-day/notes/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    await service.deleteNote(c.req.param('id'), actor);
    return c.json({ data: { ok: true } }, 200);
  });
}
