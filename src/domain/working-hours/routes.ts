/**
 * ماژول ساعات کاری — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Working-hours REST endpoints — no business logic here

import type { AppHono } from '@core/shared';
import { NewWorkingHourSchema, ReplaceWeekSchema, UuidSchema } from '@core/shared';
import { getAuthContext } from '@core/auth';
import { ValidationError } from '@core/errors';
import type { WorkingHoursService } from './types';

export function registerRoutes(app: AppHono, service: WorkingHoursService): void {
  // ─── list (by staff, or everything) ───
  app.get('/api/working-hours', async (c) => {
    const staffId = c.req.query('staff_id');
    if (staffId) {
      UuidSchema.parse(staffId);
      const items = await service.listForStaff(staffId);
      return c.json({ data: items }, 200);
    }
    const items = await service.listAll();
    return c.json({ data: items }, 200);
  });

  // ─── add single range ───
  app.post('/api/working-hours', async (c) => {
    const actor = getAuthContext(c);
    const body = NewWorkingHourSchema.parse(await c.req.json<unknown>());
    const item = await service.add(
      body.staff_id,
      { weekday: body.weekday, startMinute: body.start_minute, endMinute: body.end_minute },
      actor
    );
    return c.json({ data: item }, 201);
  });

  // ─── bulk replace weekly plan (must be registered before /:id if any) ───
  app.put('/api/working-hours/staff/:staffId', async (c) => {
    const actor = getAuthContext(c);
    const staffId = UuidSchema.parse(c.req.param('staffId'));
    const body = ReplaceWeekSchema.parse(await c.req.json<unknown>());
    const items = await service.replaceWeek(
      staffId,
      body.items.map((r) => ({ weekday: r.weekday, startMinute: r.start_minute, endMinute: r.end_minute })),
      actor
    );
    return c.json({ data: items }, 200);
  });

  // ─── delete single range ───
  app.delete('/api/working-hours/:id', async (c) => {
    const actor = getAuthContext(c);
    await service.remove(c.req.param('id'), actor);
    return c.body(null, 204);
  });
}
