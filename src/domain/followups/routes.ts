import type { AppHono } from '@core/shared';
import { NewFollowUpSchema, UpdateFollowUpSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { FollowUpsService } from './types';

export function registerFollowUpRoutes(app: AppHono, service: FollowUpsService): void {
  app.get('/api/followups', async (c) => {
    const actor = getAuthContext(c);
    const mine = c.req.query('mine');
    const group = c.req.query('group') as never | undefined;
    const items = await service.list(
      {
        mine: mine === '1' || mine === 'true',
        group: group || undefined,
        entityType: c.req.query('entity_type') || undefined,
        entityId: c.req.query('entity_id') || undefined,
        studentId: c.req.query('student_id') || undefined
      },
      actor
    );
    return c.json({ data: items }, 200);
  });

  app.post('/api/followups', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewFollowUpSchema.parse(await c.req.json<unknown>());
    const created = await service.create(
      {
        entityType: body.entity_type,
        entityId: body.entity_id,
        studentId: body.student_id ?? null,
        title: body.title,
        assigneeId: body.assignee_id,
        dueAt: body.due_at ?? undefined
      },
      actor
    );
    return c.json({ data: created }, 201);
  });

  app.get('/api/followups/:id', async (c) => {
    const item = await service.getById(c.req.param('id'));
    if (!item) {
      return c.json({ error: 'NOT_FOUND', message: 'پیگیری یافت نشد' }, 404);
    }
    return c.json({ data: item }, 200);
  });

  app.patch('/api/followups/:id', async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateFollowUpSchema.parse(await c.req.json<unknown>());
    const updated = await service.update(
      c.req.param('id'),
      {
        status: body.status,
        assigneeId: body.assignee_id,
        dueAt: body.due_at === undefined ? undefined : body.due_at
      },
      actor
    );
    return c.json({ data: updated }, 200);
  });
}
