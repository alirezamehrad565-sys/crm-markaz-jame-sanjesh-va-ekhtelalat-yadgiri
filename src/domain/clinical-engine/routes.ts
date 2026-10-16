/**
 * موتور بالینی — باتری‌ها، قواعد، روایت و اهداف مداخله — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// REST موتور بالینی — فقط سیم به سرویس، بدون business logic
// RBAC در سرویس چک می‌شود (مالک پرونده)؛ این‌جا گیت نقش coarse: خواندن نقش‌های مرکز،
// نوشتن فقط مدیر/درمانگر — منشی مشاهده‌گر است (پلن §۷ و §۱۱).

import { z } from 'zod';
import type { AppHono } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { ClinicalEngineService } from './service';
import { DECISION_NOTE_MAX } from './service';

const TARGET_KEY_MAX = 40;
const STEP_KEY_MAX = 80;

/** — علامت‌زدن/لغو گام چک‌لیست مسیر مداخله */
export const ClinicalStepToggleSchema = z.object({
  step_key: z.string().min(1).max(STEP_KEY_MAX)
});

export const ClinicalPathCreateSchema = z.object({
  target_key: z.string().min(2).max(TARGET_KEY_MAX),
  note: z.string().max(DECISION_NOTE_MAX).nullish(),
  exercise_ids: z.array(z.string().min(1)).max(20).nullish()
});

export const ClinicalPathDecisionSchema = z
  .object({
    action: z.enum(['confirm', 'edit', 'reject', 'need_info']),
    note: z.string().max(DECISION_NOTE_MAX).nullish(),
    target_key: z.string().min(2).max(TARGET_KEY_MAX).nullish(),
    exercise_ids: z.array(z.string().min(1)).max(20).nullish()
  })
  .superRefine((v, ctx) => {
    if (v.action === 'edit' && !v.target_key) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'اصلاح فرضیه بدون هدف جدید مجاز نیست', path: ['target_key'] });
    }
  });

export function registerClinicalEngineRoutes(app: AppHono, service: ClinicalEngineService): void {
  // ─── تفسیر زندهٔ موتور (پلن §۵) — خواندن: مدیر/منشی/درمانگرِ مسئول ───
  app.get('/api/students/:id/clinical-insights', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.getInsights(c.req.param('id'), actor);
    return c.json({ data }, 200);
  });

  // ─── دانش‌نامهٔ اهداف (فرم پنل/بات) ───
  app.get('/api/clinical-targets', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const data = await service.listTargets();
    return c.json({ data }, 200);
  });

  // ─── مسیرهای مداخله ───
  app.get('/api/students/:id/clinical-paths', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.listPaths(c.req.param('id'), actor);
    return c.json({ data }, 200);
  });

  app.get('/api/clinical-paths/:id', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.getPath(c.req.param('id'), actor);
    return c.json({ data }, 200);
  });

  // ساخت مسیر — فقط مدیر/درمانگر (مالک در سرویس چک می‌شود)
  app.post('/api/students/:id/clinical-paths', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = ClinicalPathCreateSchema.parse(await c.req.json<unknown>());
    const data = await service.createPath(
      c.req.param('id'),
      { targetKey: body.target_key, note: body.note ?? null, exerciseIds: body.exercise_ids ?? null },
      actor
    );
    return c.json({ data }, 201);
  });

  // پروتکل قضاوت (پلن §۷): تأیید/اصلاح/رد/نیاز به اطلاعات — فقط مدیر/درمانگرِ مسئول
  app.post('/api/clinical-paths/:id/decision', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = ClinicalPathDecisionSchema.parse(await c.req.json<unknown>());
    const data = await service.decidePath(
      c.req.param('id'),
      { action: body.action, note: body.note ?? null, targetKey: body.target_key ?? null, exerciseIds: body.exercise_ids ?? null },
      actor
    );
    return c.json({ data }, 200);
  });

  // چک‌لیست مراحل مسیر فعال (toggle) — فقط مدیر/درمانگرِ مسئول
  app.post('/api/clinical-paths/:id/steps/toggle', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = ClinicalStepToggleSchema.parse(await c.req.json<unknown>());
    const data = await service.toggleStep(c.req.param('id'), body.step_key, actor);
    return c.json({ data }, 200);
  });
}
