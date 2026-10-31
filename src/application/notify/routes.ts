import type { AppHono } from '@core/shared';
import { z } from 'zod';
import {
  NotificationListQuerySchema,
  TestMessageSchema,
  UpsertPrefsSchema,
  CreateLinkSchema,
  CreateClassLinkSchema,
  TeacherReportSchema,
  FamilyReportSchema,
  UuidSchema
} from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { ValidationError } from '@core/errors';
import type { NotifyAppService } from './service';

export function registerRoutes(app: AppHono, service: NotifyAppService): void {
  app.get('/api/notifications', async (c) => {
    const query = NotificationListQuerySchema.parse({
      status: c.req.query('status') || undefined,
      student_id: c.req.query('student_id') || undefined,
      appointment_id: c.req.query('appointment_id') || undefined,
      limit: c.req.query('limit') || undefined
    });
    const data = await service.listNotifications({
      status: query.status,
      studentId: query.student_id,
      appointmentId: query.appointment_id,
      limit: query.limit
    });
    return c.json({ data }, 200);
  });

  app.get('/api/notifications/stats', async (c) => {
    const data = await service.stats();
    return c.json({ data }, 200);
  });

  app.get('/api/notifications/outbox', requireRole('manager', 'secretary'), async (c) => {
    const data = await service.outbox();
    return c.json({ data }, 200);
  });

  app.post('/api/notifications/:id/release', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const data = await service.releaseAndDispatch(id, actor);
    return c.json({ data }, 200);
  });

  app.post('/api/notifications/failed/retry', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.retryFailed(actor);
    return c.json({ data }, 200);
  });

  app.post('/api/notifications/dispatch', requireRole('manager'), async (c) => {
    const data = await service.dispatchPending(50);
    return c.json({ data }, 200);
  });

  app.post('/api/notifications/reminders/enqueue', requireRole('manager'), async (c) => {
    const data = await service.enqueueUpcomingReminders();
    return c.json({ data }, 200);
  });

  app.post('/api/notifications/digest', requireRole('manager'), async (c) => {
    const data = await service.sendDailyDigest();
    return c.json({ data }, 200);
  });

  app.get('/api/notifications/prefs/:studentId', async (c) => {
    const studentId = UuidSchema.parse(c.req.param('studentId'));
    const data = await service.getPrefs(studentId);
    return c.json({ data }, 200);
  });

  app.put('/api/notifications/prefs/:studentId', async (c) => {
    const actor = getAuthContext(c);
    const studentId = UuidSchema.parse(c.req.param('studentId'));
    const body = UpsertPrefsSchema.parse(await c.req.json<unknown>());
    const data = await service.upsertPrefs(
      studentId,
      {
        channel: body.channel,
        chatId: body.chat_id ?? undefined,
        remindersEnabled: body.reminders_enabled,
        reminderHoursBefore: body.reminder_hours_before
      },
      actor
    );
    return c.json({ data }, 200);
  });

  app.post('/api/notifications/links', requireRole('manager', 'secretary', 'therapist'), async (c) => { // درمانگر هم می‌تواند لینک دعوت خانواده بسازد
    const actor = getAuthContext(c);
    const body = CreateLinkSchema.parse(await c.req.json<unknown>());
    const data = await service.createLink(body.student_id, actor);
    return c.json({ data }, 201);
  });

  app.get('/api/notifications/links', async (c) => {
    const studentId = c.req.query('student_id') || undefined;
    if (studentId) UuidSchema.parse(studentId);
    const data = await service.listLinks(studentId);
    return c.json({ data }, 200);
  });

  app.post('/api/notifications/staff-links', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = z.object({ staff_id: UuidSchema }).parse(await c.req.json<unknown>());
    const data = await service.createStaffLink(body.staff_id, actor);
    return c.json({ data }, 201);
  });

  app.get('/api/notifications/staff-links', async (c) => {
    const staffId = c.req.query('staff_id') || undefined;
    if (staffId) UuidSchema.parse(staffId);
    const data = await service.listStaffLinks(staffId);
    return c.json({ data }, 200);
  });

  app.get('/api/notifications/bot-username', requireRole('manager', 'secretary', 'therapist'), async (c) => { // 
    const data = await service.resolveBotUsername();
    return c.json({ data }, 200);
  });

  app.post('/api/notifications/class-links', requireRole('manager', 'secretary', 'therapist'), async (c) => { // درمانگر هم می‌تواند کد اتصال معلم بسازد
    const actor = getAuthContext(c);
    const body = CreateClassLinkSchema.parse(await c.req.json<unknown>());
    const data = await service.createClassLink(body.class_id, actor);
    return c.json({ data }, 201);
  });

  app.get('/api/notifications/class-links', async (c) => {
    const classId = c.req.query('class_id') || undefined;
    if (classId) UuidSchema.parse(classId);
    const data = await service.listClassLinks(classId);
    return c.json({ data }, 200);
  });

  app.delete('/api/notifications/class-links/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const data = await service.revokeClassLink(id, actor);
    return c.json({ data }, 200);
  });

  app.post('/api/notifications/teacher-report', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = TeacherReportSchema.parse(await c.req.json<unknown>());
    const data = await service.sendReportToStudentTeacher(body.student_id, body.text, actor);
    return c.json({ data }, 201);
  });

  // پیام آزاد به خانواده (گفتگوهای متصل خانواده در بله)
  app.post('/api/notifications/family-report', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = FamilyReportSchema.parse(await c.req.json<unknown>());
    const data = await service.sendReportToStudentFamily(body.student_id, body.text, actor);
    return c.json({ data }, 201);
  });

  app.post('/api/notifications/test', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = TestMessageSchema.parse(await c.req.json<unknown>());
    const result = await service.sendTest(
      { channel: body.channel, recipient: body.recipient, text: body.text },
      actor
    );
    return c.json({ data: result }, result.ok ? 200 : 502);
  });

  app.post('/webhook/bale/:secret', async (c) => {
    if (!service.isWebhookEnabled()) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'webhook غیرفعال است' } }, 404);
    }
    if (!service.isWebhookSecretValid(c.req.param('secret'))) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'secret نامعتبر است' } }, 403);
    }

    let update: unknown;
    try {
      update = await c.req.json<unknown>();
    } catch {
      throw new ValidationError('بدنه درخواست JSON معتبر نیست');
    }

    const { handled, reply, buttons, keyboard } = await service.handleBotUpdate(update);
    let sent: boolean | null = null;
    if (reply && update && typeof update === 'object') {
      const chatId = extractChatId(update);
      if (chatId) {
        const result = await service.replyToChat(chatId, reply, buttons, keyboard);
        sent = result.ok;
      }
    }

    return c.json({ ok: true, handled, sent, reply, buttons, keyboard }, 200);
  });
}

function extractChatId(update: object): string | null {
  const u = update as { message?: unknown; edited_message?: unknown; callback_query?: { message?: { chat?: { id?: number | string } } } };
  const msg = (u.message ?? u.edited_message ?? u.callback_query?.message) as { chat?: { id?: number | string } } | undefined;
  const id = msg?.chat?.id;
  return id === undefined || id === null ? null : String(id);
}
