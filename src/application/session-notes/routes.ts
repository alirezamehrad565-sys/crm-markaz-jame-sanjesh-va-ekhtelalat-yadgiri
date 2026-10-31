import { SaveSessionNoteSchema } from '@core/shared';
import type { AppHono } from '@core/shared';
import { getAuthContext } from '@core/auth';
import type { SessionNotesService } from './service';

export function registerSessionNoteRoutes(app: AppHono, service: SessionNotesService): void {
  app.put('/api/appointments/:id/students/:studentId/note', async (c) => {
    const actor = getAuthContext(c);
    const body = SaveSessionNoteSchema.parse(await c.req.json<unknown>());
    const saved = await service.save(
      c.req.param('id'),
      c.req.param('studentId'),
      { sessionNote: body.session_note, nextAction: body.next_action },
      actor
    );
    return c.json({ data: saved }, 200);
  });

  app.get('/api/appointments/:id/students/:studentId/note', async (c) => {
    const data = await service.get(c.req.param('id'), c.req.param('studentId'));
    return c.json({ data }, 200);
  });
}
