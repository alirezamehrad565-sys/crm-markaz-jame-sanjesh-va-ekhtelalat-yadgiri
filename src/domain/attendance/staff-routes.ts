/**
 * ماژول حضور و غیاب — مسیرهای REST حضور کارکنان
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مسیرهای حضور و غیاب همکاران (بدون business logic)
// RBAC: ثبت/اصلاح فقط مدیر و منشی — مشاهده برای همه نقش‌ها

import { MarkStaffAttendanceSchema, StaffAttendanceQuerySchema, StaffAttendanceDayQuerySchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { AppHono } from '@core/shared';
import type { StaffAttendanceService } from './staff';

export function registerStaffAttendanceRoutes(app: AppHono, service: StaffAttendanceService): void {
  // ثبت/اصلاح وضعیت روزانه یک همکار (upsert)
  app.put('/api/staff-attendance', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = MarkStaffAttendanceSchema.parse(await c.req.json<unknown>());
    const result = await service.mark(
      { staffId: body.staff_id, date: body.date, status: body.status, note: body.note },
      actor
    );
    return c.json({ data: result }, 200);
  });

  // فهرست رکوردهای یک بازه (اختیاری: یک همکار)
  app.get('/api/staff-attendance', async (c) => {
    const q = StaffAttendanceQuerySchema.parse({
      from: c.req.query('from') ?? '',
      to: c.req.query('to') ?? '',
      staff_id: c.req.query('staff_id') || undefined
    });
    const items = await service.list({ from: q.from, to: q.to, staffId: q.staff_id });
    return c.json({ data: items }, 200);
  });

  // خلاصه یک روز (شمارش هر وضعیت + بدون ثبت)
  app.get('/api/staff-attendance/day-summary', async (c) => {
    const q = StaffAttendanceDayQuerySchema.parse({ date: c.req.query('date') || undefined });
    const summary = await service.daySummary(q.date);
    return c.json({ data: summary }, 200);
  });

  // خلاصه تجمعی هر همکار در یک بازه (برای گزارش)
  app.get('/api/staff-attendance/range-summary', async (c) => {
    const q = StaffAttendanceQuerySchema.parse({
      from: c.req.query('from') ?? '',
      to: c.req.query('to') ?? ''
    });
    const items = await service.rangeSummary(q.from, q.to);
    return c.json({ data: items }, 200);
  });
}
