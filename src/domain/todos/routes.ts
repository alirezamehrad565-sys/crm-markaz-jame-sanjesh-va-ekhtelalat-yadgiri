import type { AppHono } from '@core/shared';
import { NewTodoSchema, UpdateTodoSchema } from '@core/shared';
import { z } from 'zod';
import { getAuthContext, requireRole } from '@core/auth';
import type { TodosService } from './types';

const TodoChecklistOpSchema = z
  .object({
    text: z.string().trim().min(1).max(200).optional(),
    index: z.number().int().min(0).optional(),
    done: z.boolean().optional()
  })
  .refine((v) => v.text !== undefined || (v.index !== undefined && v.done !== undefined), {
    message: 'برای افزودن مورد «text» و برای تغییر وضعیت «index» و «done» لازم است'
  });

export function registerTodoRoutes(app: AppHono, service: TodosService): void {
  app.get('/api/todos', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const box = c.req.query('box') === 'outbox' ? 'outbox' : 'inbox';
    const result = await service.list({ box }, actor);
    return c.json({ data: result.data, badge: result.badge }, 200);
  });

  app.post('/api/todos', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewTodoSchema.parse(await c.req.json<unknown>());
    const created = await service.create(
      {
        title: body.title,
        note: body.note ?? null,
        assigneeId: body.assignee_id,
        dueAt: body.due_at ?? undefined,
        priority: body.priority,
        checklist: body.checklist
      },
      actor
    );
    return c.json({ data: created }, 201);
  });

  app.patch('/api/todos/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateTodoSchema.parse(await c.req.json<unknown>());
    const updated = await service.update(
      c.req.param('id'),
      {
        title: body.title,
        note: body.note,
        dueAt: body.due_at === undefined ? undefined : body.due_at,
        priority: body.priority,
        checklist: body.checklist,
        deleted: body.deleted
      },
      actor
    );
    return c.json({ data: updated }, 200);
  });

  app.post('/api/todos/:id/complete', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const updated = await service.complete(c.req.param('id'), actor);
    return c.json({ data: updated }, 200);
  });

  app.post('/api/todos/:id/checklist', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = TodoChecklistOpSchema.parse(await c.req.json<unknown>());
    const updated =
      body.text !== undefined
        ? await service.addChecklistItem(c.req.param('id'), body.text, actor)
        : await service.toggleChecklistItem(c.req.param('id'), body.index!, body.done!, actor);
    return c.json({ data: updated }, 200);
  });
}
