import { MarkStaffAttendanceSchema, StaffAttendanceQuerySchema, StaffAttendanceDayQuerySchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { AppHono, AuthContext } from '@core/shared';
import type { StaffAttendanceService } from './staff';

/* SEC (ممیزی دسترسی) — خواندن حضور همکاران سقف‌دار است:
   دست کامل فقط دفتر (مدیر/منشی) و ناظر (نقش فقط-خواندنی مستندشده در supervisorGate؛
   گزارش حضور بخشی از پایش اوست). بقیهٔ نقش‌ها — درمانگر و هر نقش آینده — فقط
   رکوردهای خودشان؛ الگوی force-scope همان routes.ts (pending/stats) است.
   staff_id درخواستی نقش‌های سقف‌دار نادیده گرفته می‌شود؛ شکل پاسخ ثابت است. */
function scopedStaffFilter(actor: AuthContext, requested?: string): string | undefined {
  const fullAccess = actor.role === 'manager' || actor.role === 'secretary' || actor.role === 'supervisor';
  return fullAccess ? requested : actor.staffId;
}

export function registerStaffAttendanceRoutes(app: AppHono, service: StaffAttendanceService): void {
  app.put('/api/staff-attendance', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = MarkStaffAttendanceSchema.parse(await c.req.json<unknown>());
    const result = await service.mark(
      { staffId: body.staff_id, date: body.date, status: body.status, note: body.note },
      actor
    );
    return c.json({ data: result }, 200);
  });

  app.get('/api/staff-attendance', async (c) => {
    const actor = getAuthContext(c);
    const q = StaffAttendanceQuerySchema.parse({
      from: c.req.query('from') ?? '',
      to: c.req.query('to') ?? '',
      staff_id: c.req.query('staff_id') || undefined
    });
    const items = await service.list({ from: q.from, to: q.to, staffId: scopedStaffFilter(actor, q.staff_id) });
    return c.json({ data: items }, 200);
  });

  app.get('/api/staff-attendance/day-summary', async (c) => {
    const actor = getAuthContext(c);
    const q = StaffAttendanceDayQuerySchema.parse({ date: c.req.query('date') || undefined });
    const summary = await service.daySummary(q.date, scopedStaffFilter(actor));
    return c.json({ data: summary }, 200);
  });

  app.get('/api/staff-attendance/range-summary', async (c) => {
    const actor = getAuthContext(c);
    const q = StaffAttendanceQuerySchema.parse({
      from: c.req.query('from') ?? '',
      to: c.req.query('to') ?? ''
    });
    const items = await service.rangeSummary(q.from, q.to, scopedStaffFilter(actor));
    return c.json({ data: items }, 200);
  });
}
