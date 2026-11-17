// src/domain/assessment-blocks/routes.ts — ۱.۲۷.۱۴ بلوک نوبت سنجش (خواست کارفرما)
// GET برای همهٔ کاربرانِ احرازشده (تقویم باید سایهٔ بلوک را برای همه نشان دهد)؛
// POST/PATCH/DELETE فقط مدیر — هم‌الگوی requireRole('manager') در ماژول‌های دیگر.
// ۱.۲۷.۱۵ — خواست کارفرما: کارت گرد درگ‌پذیر به‌ازای هر درمانگر → POST فن‌اوت می‌شود
// (برای هر درمانگر یک ردیف مستقل) و PATCH برای جابه‌جایی/کش/جزئیات همان کارت می‌آید.
import type { AppHono } from '@core/shared';
import { AssessmentBlockCreateSchema, AssessmentBlockPatchSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { AssessmentBlockService } from './types';

export function registerAssessmentBlockRoutes(app: AppHono, service: AssessmentBlockService): void {
  app.get('/api/assessment-blocks', async (c) => {
    getAuthContext(c);
    const items = await service.list(c.req.query('from') || undefined, c.req.query('to') || undefined);
    return c.json({ data: items }, 200);
  });

  app.post('/api/assessment-blocks', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = AssessmentBlockCreateSchema.parse(await c.req.json<unknown>());
    const blocks = await service.create(
      {
        date: body.date,
        startMinute: body.start_minute,
        endMinute: body.end_minute,
        therapistIds: body.therapist_ids,
        note: body.note ?? null
      },
      actor
    );
    return c.json({ data: blocks }, 201);
  });

  /* ۱.۲۷.۱۵ — پچ کارت سنجش: درگ/دراپ روی تقویم، کش‌دادن پایان، پرتاب به ستون درمانگر دیگر
     و ذخیرهٔ جزئیات از مودال کلیکِ کارت — قفل خوش‌بینانهٔ نسخه، فقط مدیر. */
  app.patch('/api/assessment-blocks/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = AssessmentBlockPatchSchema.parse(await c.req.json<unknown>());
    const block = await service.update(
      c.req.param('id'),
      {
        date: body.date,
        startMinute: body.start_minute,
        endMinute: body.end_minute,
        staffId: body.staff_id,
        note: body.note === undefined ? undefined : (body.note ?? null),
        version: body.version
      },
      actor
    );
    return c.json({ data: block }, 200);
  });

  app.delete('/api/assessment-blocks/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    await service.remove(c.req.param('id'), actor);
    return c.body(null, 204);
  });
}
