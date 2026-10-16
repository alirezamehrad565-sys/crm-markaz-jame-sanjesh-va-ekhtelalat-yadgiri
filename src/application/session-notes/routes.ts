/**
 * سرویس گزارش جلسه و اقدام بعدی — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فاز ۲ — دو endpoint گزارش جلسه (بدون business logic؛ قواعد نویسنده در سرویس)
// PUT /api/appointments/:id/students/:studentId/note → نویسنده: همکار نوبت/مدیر
// GET /api/appointments/:id/students/:studentId/note → همهٔ نقش‌های داخلی

import { SaveSessionNoteSchema } from '@core/shared';
import type { AppHono } from '@core/shared';
import { getAuthContext } from '@core/auth';
import type { SessionNotesService } from './service';

export function registerSessionNoteRoutes(app: AppHono, service: SessionNotesService): void {
  // ذخیره/جایگزینی گزارش جلسه — قاعدهٔ نویسنده و نوبت لغوشده در سرویس
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

  // خواندن گزارش جلسه — آزاد داخل مرکز (§8.2)
  app.get('/api/appointments/:id/students/:studentId/note', async (c) => {
    const data = await service.get(c.req.param('id'), c.req.param('studentId'));
    return c.json({ data }, 200);
  });
}
