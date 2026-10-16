/**
 * ماژول هستهٔ نوبت‌دهی — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// ۱۱ endpoint نوبت — بدون business logic، فقط wire به service
// سرویس قبلاً در composition root (api-routing) ساخته شده و تزریق می‌شود.

import {
  CancelAppointmentSchema,
  CopyWeekSchema,
  MoveAppointmentSchema,
  NewAppointmentSchema,
  ResizeAppointmentSchema,
  SetOpsStatusSchema,
  UpdateAppointmentSchema
} from '@core/shared';
import type { AppHono, CopyWeekInput } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AppointmentService } from './types';

export function registerRoutes(app: AppHono, service: AppointmentService): void {
  // ─── copy-week (باید قبل از /:id رجیستر شود) ───
  app.post('/api/appointments/copy-week', async (c) => {
    const actor = getAuthContext(c);
    const body = CopyWeekSchema.parse(await c.req.json<unknown>());
    const input: CopyWeekInput = {
      sourceMonday: body.source_monday,
      targetMonday: body.target_monday,
      staffId: body.staff_id,
      dryRun: body.dry_run
    };
    const result = await service.copyWeek(input, actor);
    return c.json({ data: result }, 200);
  });

  app.post('/api/appointments/copy-week/:batchId/undo', async (c) => {
    const actor = getAuthContext(c);
    const result = await service.undoCopyWeek(c.req.param('batchId'), actor);
    return c.json({ data: result }, 200);
  });

  // ─── فاز ۵: دانش‌آموزانِ همکار جاری — منبع picker «نوبت‌دهی من» ───
  // خواندن آزاد؛ خروجی همیشه نسبت به خودِ بازیگر اشتقاق می‌یابد (D4)
  app.get('/api/appointments/my-students', async (c) => {
    const actor = getAuthContext(c);
    const items = await service.listMyStudents(actor);
    return c.json({ data: items }, 200);
  });

  // ─── create ───
  app.post('/api/appointments', async (c) => {
    const actor = getAuthContext(c);
    const body = NewAppointmentSchema.parse(await c.req.json<unknown>());
    const input = {
      staffId: body.staff_id,
      startAt: body.start_at,
      endAt: body.end_at,
      students: body.students.map((s) => ({ studentId: s.student_id, facetId: s.facet_id })),
      note: body.note,
      sessionType: body.session_type ?? null
    };
    const { appointment, warnings } = await service.create(input, actor);
    return c.json({ data: appointment, warnings }, 201);
  });

  // ─── list / get ───
  // بازگردانی به مدل به دستور کاربر: دفتر (مدیر/منشی) کل مرکز را می‌بیند
  // (فیلتر اختیاری staff_id)؛ درمانگر فقط برنامهٔ خودش (خواندن هم scope می‌خورد، نه فقط نوشتن) —
  // هم‌سو با گارد assertAppointmentScope. که فقط-درمانگر بود، پس گرفته شد.
  app.get('/api/appointments', async (c) => {
    const actor = getAuthContext(c);
    const id = c.req.query('id');
    if (id) {
      const appointment = await service.getById(id);
      if (!appointment) throw new NotFoundError('نوبت');
      if (actor.role === 'therapist' && appointment.staffId !== actor.staffId) {
        throw new ForbiddenError('شما فقط به نوبت‌های خودتان دسترسی دارید');
      }
      return c.json({ data: appointment }, 200);
    }
    let staffId = c.req.query('staff_id') || undefined;
    if (actor.role === 'therapist') {
      if (staffId && staffId !== actor.staffId) {
        throw new ForbiddenError('شما فقط به نوبت‌های خودتان دسترسی دارید');
      }
      staffId = actor.staffId; // بدون staff_id هم فقط برنامهٔ خودش
    }
    const items = await service.list({
      staffId,
      from: c.req.query('from'),
      to: c.req.query('to')
    });
    return c.json({ data: items }, 200);
  });

  // ─── update note ───
  app.patch('/api/appointments/:id', async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateAppointmentSchema.parse(await c.req.json<unknown>());
    const appointment = await service.update(c.req.param('id'), { note: body.note }, body.version, actor);
    return c.json({ data: appointment }, 200);
  });

  // ─── move ───
  app.patch('/api/appointments/:id/move', async (c) => {
    const actor = getAuthContext(c);
    const body = MoveAppointmentSchema.parse(await c.req.json<unknown>());
    const { appointment, warnings } = await service.move(c.req.param('id'), body.start_at, body.version, actor);
    return c.json({ data: appointment, warnings }, 200);
  });

  // ─── resize ───
  app.patch('/api/appointments/:id/resize', async (c) => {
    const actor = getAuthContext(c);
    const body = ResizeAppointmentSchema.parse(await c.req.json<unknown>());
    const { appointment, warnings } = await service.resize(c.req.param('id'), body.end_at, body.version, actor);
    return c.json({ data: appointment, warnings }, 200);
  });

  // ─── cancel ───
  app.post('/api/appointments/:id/cancel', async (c) => {
    const actor = getAuthContext(c);
    const body = CancelAppointmentSchema.parse(await c.req.json<unknown>());
    const appointment = await service.cancel(c.req.param('id'), body.version, actor);
    return c.json({ data: appointment }, 200);
  });

  // ─── restore ───
  app.post('/api/appointments/:id/restore', async (c) => {
    const actor = getAuthContext(c);
    const body = CancelAppointmentSchema.parse(await c.req.json<unknown>());
    const appointment = await service.restore(c.req.param('id'), body.version, actor);
    return c.json({ data: appointment }, 200);
  });

  // ─── حذف کامل نوبت ثبت‌شدهٔ اشتباه (نه لغو — پاک‌شدن از تقویم) ───
  // scope داخل سرویس: دفتر هر نوبت، درمانگر فقط خودش؛ گاردهای تاریخچه در سرویس (409)
  app.delete('/api/appointments/:id', async (c) => {
    const actor = getAuthContext(c);
    await service.remove(c.req.param('id'), actor);
    return c.body(null, 204);
  });

  // ─── فاز ۱: وضعیت عملیاتی (بورد) — دفتر هر نوبت؛ درمانگر فقط نوبت‌های خودش
  // (گارد مالکیت در سرویس — assertAppointmentScope)؛ بدون version (D1) و بدون اعلان (D6) ───
  app.post('/api/appointments/:id/ops-status', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = SetOpsStatusSchema.parse(await c.req.json<unknown>());
    const appointment = await service.setOpsStatus(c.req.param('id'), body.ops_status, actor);
    return c.json({ data: appointment }, 200);
  });

  // ─── add / remove student ───
  app.post('/api/appointments/:id/students', async (c) => {
    const actor = getAuthContext(c);
    const body = (await c.req.json<unknown>()) as { student_id?: string; facet_id?: string };
    if (!body.student_id) {
      throw new ValidationError('student_id الزامی است');
    }
    await service.addStudent(c.req.param('id'), body.student_id, body.facet_id, actor);
    return c.body(null, 204);
  });

  app.delete('/api/appointments/:id/students/:studentId', async (c) => {
    const actor = getAuthContext(c);
    await service.removeStudent(c.req.param('id'), c.req.param('studentId'), actor);
    return c.body(null, 204);
  });
}
