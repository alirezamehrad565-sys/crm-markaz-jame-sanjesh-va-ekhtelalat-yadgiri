import { z } from 'zod';
import type { AppHono } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { ClinicalEngineService } from './service';
import {
  DECISION_NOTE_MAX,
  PATHWAY_SESSION_ITEMS_MAX,
  PATHWAY_SESSION_ITEM_TEXT_MAX,
  PATHWAY_SESSION_NOTE_MAX,
  PATHWAY_SESSION_PLAN_MAX,
  PATHWAY_SESSION_TITLE_MAX,
  PATHWAY_TEMPLATE_DESC_MAX,
  PATHWAY_TEMPLATE_KEY_RE,
  PATHWAY_TEMPLATE_SESSIONS_MAX
} from './service';
import { PATHWAY_ITEM_TYPES, PATHWAY_SESSION_STATUSES } from './types';

const TARGET_KEY_MAX = 40;
const STEP_KEY_MAX = 80;
const TEMPLATE_KEY_MAX = 60;

export const ClinicalStepToggleSchema = z.object({
  step_key: z.string().min(1).max(STEP_KEY_MAX)
});

export const ClinicalPathCreateSchema = z
  .object({
    target_key: z.string().min(2).max(TARGET_KEY_MAX).nullish(),
    template_key: z.string().min(4).max(TEMPLATE_KEY_MAX).nullish(),
    note: z.string().max(DECISION_NOTE_MAX).nullish(),
    exercise_ids: z.array(z.string().min(1)).max(20).nullish()
  })
  .superRefine((v, ctx) => {
    if (!v.target_key && !v.template_key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'هدف درمانی یا قالب مسیر لازم است',
        path: ['target_key']
      });
    }
  });

export const PathSessionItemSchema = z.object({
  type: z.enum(PATHWAY_ITEM_TYPES),
  text: z.string().min(1).max(PATHWAY_SESSION_ITEM_TEXT_MAX)
});

export const PathSessionAddSchema = z.object({
  title: z.string().min(2).max(PATHWAY_SESSION_TITLE_MAX),
  plan: z.string().max(PATHWAY_SESSION_PLAN_MAX).nullish(),
  items: z.array(PathSessionItemSchema).max(PATHWAY_SESSION_ITEMS_MAX).nullish()
});

export const PathSessionUpdateSchema = z.object({
  status: z.enum(PATHWAY_SESSION_STATUSES).nullish(),
  title: z.string().min(2).max(PATHWAY_SESSION_TITLE_MAX).nullish(),
  plan: z.string().max(PATHWAY_SESSION_PLAN_MAX).nullish(),
  note: z.string().max(PATHWAY_SESSION_NOTE_MAX).nullish(),
  items: z.array(PathSessionItemSchema).max(PATHWAY_SESSION_ITEMS_MAX).nullish()
});

export const PathwayTemplateSessionSchema = z.object({
  title: z.string().min(2).max(PATHWAY_SESSION_TITLE_MAX),
  items: z.array(PathSessionItemSchema).max(PATHWAY_SESSION_ITEMS_MAX)
});

export const PathwayTemplateUpsertSchema = z.object({
  title: z.string().min(2).max(PATHWAY_SESSION_TITLE_MAX),
  description: z.string().max(PATHWAY_TEMPLATE_DESC_MAX).nullish(),
  protocol: z.enum(['learning', 'slow_learner', 'mental_ot', 'rehab']).nullish(),
  target_key: z.string().min(2).max(TARGET_KEY_MAX).nullish(),
  steps: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        title: z.string().min(1).max(PATHWAY_SESSION_TITLE_MAX),
        hint: z.string().max(200).nullish()
      })
    )
    .max(12)
    .nullish(),
  sessions: z.array(PathwayTemplateSessionSchema).max(PATHWAY_TEMPLATE_SESSIONS_MAX).nullish(),
  active: z.boolean().nullish()
});

export const PathwayTemplateCreateSchema = PathwayTemplateUpsertSchema.extend({
  key: z.string().regex(PATHWAY_TEMPLATE_KEY_RE, 'کلید قالب: ۴ تا ۶۰ نویسهٔ لاتین کوچک، رقم یا خط تیره')
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
  app.get('/api/students/:id/clinical-insights', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.getInsights(c.req.param('id'), actor);
    return c.json({ data }, 200);
  });

  app.get('/api/students/:id/checklist-plan', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.getChecklistPlan(c.req.param('id'), actor);
    return c.json({ data }, 200);
  });

  app.get('/api/clinical-targets', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const data = await service.listTargets();
    return c.json({ data }, 200);
  });

  app.get('/api/students/:id/clinical-paths', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.listPaths(c.req.param('id'), actor);
    return c.json({ data }, 200);
  });

  app.post('/api/students/:id/clinical-paths', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = ClinicalPathCreateSchema.parse(await c.req.json<unknown>());
    const data = await service.createPath(
      c.req.param('id'),
      { targetKey: body.target_key ?? null, templateKey: body.template_key ?? null, note: body.note ?? null, exerciseIds: body.exercise_ids ?? null },
      actor
    );
    return c.json({ data }, 201);
  });

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

  app.post('/api/clinical-paths/:id/steps/toggle', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = ClinicalStepToggleSchema.parse(await c.req.json<unknown>());
    const data = await service.toggleStep(c.req.param('id'), body.step_key, actor);
    return c.json({ data }, 200);
  });

  // ─── قالب‌های مسیر (m187 — بازگردانی از باندل اصلی) ───
  app.get('/api/pathway-templates', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const data = await service.listPathTemplates();
    return c.json({ data }, 200);
  });

  app.post('/api/pathway-templates', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = PathwayTemplateCreateSchema.parse(await c.req.json<unknown>());
    const data = await service.upsertPathTemplate(
      {
        isUpdate: false,
        key: body.key,
        title: body.title,
        description: body.description ?? null,
        protocol: body.protocol ?? null,
        targetKey: body.target_key ?? null,
        steps: body.steps ?? null,
        sessions: body.sessions ?? null,
        active: body.active ?? null
      },
      actor
    );
    return c.json({ data }, 201);
  });

  app.patch('/api/pathway-templates/:key', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = PathwayTemplateUpsertSchema.parse(await c.req.json<unknown>());
    const data = await service.upsertPathTemplate(
      {
        isUpdate: true,
        key: c.req.param('key'),
        title: body.title,
        description: body.description,
        protocol: body.protocol,
        targetKey: body.target_key,
        steps: body.steps,
        sessions: body.sessions,
        active: body.active
      },
      actor
    );
    return c.json({ data }, 200);
  });

  // ─── جلسات مسیر (پروتکل جلسه‌به‌جلسه) ───
  app.post('/api/clinical-paths/:id/sessions', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = PathSessionAddSchema.parse(await c.req.json<unknown>());
    const data = await service.addPathSession(
      c.req.param('id'),
      { title: body.title, plan: body.plan ?? null, items: body.items ?? null },
      actor
    );
    return c.json({ data }, 201);
  });

  app.patch('/api/clinical-paths/:id/sessions/:sid', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = PathSessionUpdateSchema.parse(await c.req.json<unknown>());
    const data = await service.updatePathSession(
      c.req.param('id'),
      c.req.param('sid'),
      { status: body.status ?? null, title: body.title ?? null, plan: body.plan ?? null, note: body.note ?? null, items: body.items },
      actor
    );
    return c.json({ data }, 200);
  });

  app.delete('/api/clinical-paths/:id/sessions/:sid', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    await service.deletePathSession(c.req.param('id'), c.req.param('sid'), actor);
    return c.json({ data: { ok: true } }, 200);
  });
}
