import type { AppHono } from '@core/shared';
import {
  NewWaitlistSchema,
  StudentWaitStatusSchema,
  UpdateWaitlistSchema,
  WaitlistCallSchema,
  WaitlistReorderSchema,
  WaitlistScheduleSchema
} from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { WaitlistService } from './types';

export function registerWaitlistRoutes(app: AppHono, service: WaitlistService): void {
  app.get('/api/waitlist', async (c) => {
    const status = c.req.query('status') as never | undefined;
    const priority = c.req.query('priority') as never | undefined;
    const q = c.req.query('q') ?? undefined;
    const items = await service.list({
      status,
      priority,
      q: q || undefined
    });
    return c.json({ data: items }, 200);
  });

  app.get('/api/waitlist/badge', async (c) => {
    const badge = await service.badge();
    return c.json({ data: badge }, 200);
  });

  app.post('/api/waitlist/reorder', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = WaitlistReorderSchema.parse(await c.req.json<unknown>());
    const items = await service.reorder(body.ids, actor);
    return c.json({ data: items }, 200);
  });

  app.post('/api/waitlist/auto-order', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const items = await service.autoOrder(actor);
    return c.json({ data: items }, 200);
  });

  app.get('/api/waitlist/:id', async (c) => {
    const entry = await service.getById(c.req.param('id'));
    if (!entry) {
      return c.json({ error: 'NOT_FOUND', message: 'ورودی لیست انتظار یافت نشد' }, 404);
    }
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewWaitlistSchema.parse(await c.req.json<unknown>());
    const entry = await service.create(
      {
        firstName: body.first_name,
        lastName: body.last_name,
        phone: body.phone,
        nationalId: body.national_id,
        birthDate: body.birth_date,
        schoolId: body.school_id,
        classId: body.class_id,
        source: body.source,
        serviceType: body.service_type,
        note: body.note,
        priority: body.priority,
        studentId: body.student_id
      },
      actor
    );
    return c.json({ data: entry }, 201);
  });

  app.post('/api/students/:id/wait-status', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = StudentWaitStatusSchema.parse(await c.req.json<unknown>());
    const entry = await service.setStudentWaiting(
      c.req.param('id'),
      {
        awaiting: body.awaiting,
        source: body.source,
        serviceType: body.service_type,
        priority: body.priority
      },
      actor
    );
    return c.json({ data: entry }, 200);
  });

  app.patch('/api/waitlist/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateWaitlistSchema.parse(await c.req.json<unknown>());
    const entry = await service.update(
      c.req.param('id'),
      {
        firstName: body.first_name,
        lastName: body.last_name,
        phone: body.phone,
        nationalId: body.national_id,
        birthDate: body.birth_date,
        schoolId: body.school_id,
        classId: body.class_id,
        source: body.source,
        serviceType: body.service_type,
        note: body.note,
        priority: body.priority
      },
      actor
    );
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist/:id/call', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = WaitlistCallSchema.parse(await c.req.json<unknown>());
    const entry = await service.call(c.req.param('id'), body.note, actor);
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist/:id/schedule', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = WaitlistScheduleSchema.parse(await c.req.json<unknown>());
    const result = await service.schedule(
      c.req.param('id'),
      {
        staffId: body.staff_id,
        startAt: body.start_at,
        endAt: body.end_at,
        studentId: body.student_id,
        nationalId: body.national_id,
        note: body.note
      },
      actor
    );
    return c.json({ data: result }, 201);
  });

  app.post('/api/waitlist/:id/reject', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = WaitlistCallSchema.parse(await c.req.json<unknown>());
    const entry = await service.reject(c.req.param('id'), body.note, actor);
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist/:id/no-show', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const entry = await service.noShow(c.req.param('id'), actor);
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist/:id/cancel', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const entry = await service.cancel(c.req.param('id'), actor);
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist/:id/reopen', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = WaitlistCallSchema.parse(await c.req.json<unknown>());
    const entry = await service.reopen(c.req.param('id'), body.note, actor);
    return c.json({ data: entry }, 200);
  });

  app.delete('/api/waitlist/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    await service.softDelete(c.req.param('id'), actor);
    return c.body(null, 204);
  });
}
