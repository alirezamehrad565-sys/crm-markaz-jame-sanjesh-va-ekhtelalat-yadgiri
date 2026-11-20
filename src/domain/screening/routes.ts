import type { AppHono } from '@core/shared';
import { IqEvaluationCreateSchema, ScreeningCreateSchema, ScreeningQuerySchema, ScreeningUpdateSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { ScreeningService } from './service';

export function registerScreeningRoutes(app: AppHono, service: ScreeningService): void {
  app.get('/api/screening', async (c) => {
    const q = ScreeningQuerySchema.parse({
      from: c.req.query('from') || undefined,
      to: c.req.query('to') || undefined,
      q: c.req.query('q') || undefined,
      tag: c.req.query('tag') || undefined
    });
    const data = await service.list({
      from: q.from,
      to: q.to,
      q: q.q,
      tags: q.tag
        ? q.tag
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined
    });
    return c.json({ data }, 200);
  });

  app.get('/api/screening/tags', async (c) => {
    const data = await service.tagsSummary();
    return c.json({ data }, 200);
  });

  app.post('/api/screening', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = ScreeningCreateSchema.parse(await c.req.json<unknown>());
    const created = await service.create(
      {
        name: body.name,
        tags: body.tags,
        day: body.day,
        birth_date: body.birth_date ?? null,       /* ۱.۲۵.۵۰ */
        readiness_score: body.readiness_score ?? null, /* ۱.۲۵.۵۰ */
        note: body.note ?? null                    /* ۱.۲۵.۵۷ */
      },
      actor
    );
    return c.json({ data: created }, 201);
  });

  app.patch('/api/screening/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = ScreeningUpdateSchema.parse(await c.req.json<unknown>());
    const updated = await service.update(
      c.req.param('id'),
      {
        name: body.name,
        tags: body.tags,
        birth_date: body.birth_date,       /* ۱.۲۵.۵۰ — undefined = دست‌نخورده؛ null = پاک‌کردن */
        readiness_score: body.readiness_score,
        note: body.note                    /* ۱.۲۵.۵۷ — undefined = دست‌نخورده؛ null = پاک‌کردن */
      },
      actor
    );
    return c.json({ data: updated }, 200);
  });

  app.delete('/api/screening/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    await service.remove(c.req.param('id'), actor);
    return c.json({ data: { ok: true } }, 200);
  });

  /* ─── نتیجهٔ ارزیابی تخصصی «اظهارنظر و پیشنهاد» (v1.27.33) ───
   * GET برای بارگذاری مقادیر قبلی در ویرایش (ناظر هم می‌بیند)؛ POST مدیر/منشی/درمانگر —
   * ثبت بدون انتخاب گزینهٔ ۱..۷ سمت کلاینت غیرفعال است و اینجا zod رد می‌کند. */
  app.get('/api/screening/:id/iq-evaluation', async (c) => {
    const data = await service.getIqEvaluation(c.req.param('id'));
    return c.json({ data }, 200);
  });

  app.post('/api/screening/:id/iq-evaluation', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = IqEvaluationCreateSchema.parse(await c.req.json<unknown>());
    const saved = await service.saveIqEvaluation(
      c.req.param('id'),
      {
        result_option: body.result_option,
        autism_referral: body.autism_referral,
        leiter_score: body.leiter_score ?? null,
        wechsler_verbal_score: body.wechsler_verbal_score ?? null,
        goodenough_score: body.goodenough_score ?? null,
        clinical_observations: body.clinical_observations ?? null
      },
      actor
    );
    return c.json({ data: saved }, 200);
  });
}
