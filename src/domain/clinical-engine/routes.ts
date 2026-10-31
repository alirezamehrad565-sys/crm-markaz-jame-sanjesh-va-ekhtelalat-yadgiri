import { z } from 'zod';
import type { AppHono } from '@core/shared';
import { TehranYmdSchema } from '@core/shared'; // تاریخ بازهٔ گزارش با قالب YYYY-MM-DD
import { getAuthContext, requireRole } from '@core/auth';
import type { ClinicalEngineService } from './service';
import {
  DECISION_NOTE_MAX,
  PATH_PROBE_METRIC_MAX,
  PATH_PROBE_NOTE_MAX,
  PATH_PROBE_UNIT_MAX,
  PATH_PROBE_VALUE_MAX,
  PATHWAY_SESSION_CRITERION_MAX,
  PATHWAY_SESSION_ITEMS_MAX,
  PATHWAY_SESSION_ITEM_TEXT_MAX,
  PATHWAY_SESSION_NOTE_MAX,
  PATHWAY_SESSION_PLAN_MAX,
  PATHWAY_SESSION_TITLE_MAX,
  PATHWAY_TEMPLATE_DESC_MAX,
  PATHWAY_TEMPLATE_KEY_RE,
  PATHWAY_TEMPLATE_SESSIONS_MAX,
  PATHWAY_GOAL_MAX,
  CASE_AUDIT_NOTE_MAX
} from './service';
import { PATHWAY_ITEM_TYPES, PATHWAY_SESSION_STATUSES } from './types';
import type { PathSessionItem } from './types';

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
    exercise_ids: z.array(z.string().min(1)).max(20).nullish(),
    goal: z.string().max(PATHWAY_GOAL_MAX).nullish() // هدف اندازه‌پذیر (اختیاری)
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

// کارتِ جلسه: متن + تیک انجام + پیوند اختیاری به بانک تمرین
export const PathSessionItemSchema = z.object({
  type: z.enum(PATHWAY_ITEM_TYPES),
  text: z.string().min(1).max(PATHWAY_SESSION_ITEM_TEXT_MAX),
  done: z.boolean().nullish(),
  link_id: z.string().regex(/^[0-9a-fA-F][0-9a-fA-F-]{7,63}$/, 'شناسهٔ تمرین نامعتبر است').nullish()
});

export function itemInputsToDomain(items: z.infer<typeof PathSessionItemSchema>[] | null | undefined): PathSessionItem[] | null | undefined {
  if (items === undefined) return undefined;
  if (items === null) return null;
  return items.map((it) => ({ type: it.type, text: it.text, done: it.done ?? false, linkId: it.link_id ?? null }));
}

// جلسهٔ قالب: هدف/معیار اختیاری از zod به شکل دامنه
export function templateSessionInputsToDomain(sessions: z.infer<typeof PathwayTemplateSessionSchema>[] | null | undefined) {
  if (sessions === undefined) return undefined;
  if (sessions === null) return null;
  return sessions.map((s) => ({
    title: s.title,
    plan: s.plan ?? null,
    criterion: s.criterion ?? null,
    items: itemInputsToDomain(s.items) ?? []
  }));
}

export const PathSessionAddSchema = z.object({
  title: z.string().min(2).max(PATHWAY_SESSION_TITLE_MAX),
  plan: z.string().max(PATHWAY_SESSION_PLAN_MAX).nullish(),
  criterion: z.string().max(PATHWAY_SESSION_CRITERION_MAX).nullish(),
  items: z.array(PathSessionItemSchema).max(PATHWAY_SESSION_ITEMS_MAX).nullish()
});

export const PathSessionFidelitySchema = z.object({ // وفاداری اجرا: سه بولی
  protocol: z.boolean(),
  homework: z.boolean(),
  parent: z.boolean()
});

// حسابرسی موردی دو-ارزیاب
export const CaseAuditCreateSchema = z.object({
  student_id: z.string().min(8),
  reviewer_a: z.string().min(2).max(80),
  reviewer_b: z.string().min(2).max(80),
  target_key: z.string().max(40).nullish(),
  agreed: z.boolean(),
  note: z.string().max(CASE_AUDIT_NOTE_MAX).nullish()
});

export const PathSessionUpdateSchema = z.object({
  status: z.enum(PATHWAY_SESSION_STATUSES).nullish(),
  title: z.string().min(2).max(PATHWAY_SESSION_TITLE_MAX).nullish(),
  plan: z.string().max(PATHWAY_SESSION_PLAN_MAX).nullish(),
  criterion: z.string().max(PATHWAY_SESSION_CRITERION_MAX).nullish(),
  outcome: z.string().max(PATHWAY_SESSION_CRITERION_MAX).nullish(),
  note: z.string().max(PATHWAY_SESSION_NOTE_MAX).nullish(),
  items: z.array(PathSessionItemSchema).max(PATHWAY_SESSION_ITEMS_MAX).nullish(),
  fidelity: PathSessionFidelitySchema.nullish() // 
});

export const PathwayTemplateSessionSchema = z.object({
  title: z.string().min(2).max(PATHWAY_SESSION_TITLE_MAX),
  plan: z.string().max(PATHWAY_SESSION_PLAN_MAX).nullish(),
  criterion: z.string().max(PATHWAY_SESSION_CRITERION_MAX).nullish(),
  items: z.array(PathSessionItemSchema).max(PATHWAY_SESSION_ITEMS_MAX)
});

// جابه‌جایی جلسات مسیر: ترتیب کامل شناسه‌ها
export const SessionsReorderSchema = z.object({
  session_ids: z.array(z.string().min(1)).min(1).max(200)
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

// پرسش گزارش دوره‌ای طرح درمان: from/to اختیاری (YYYY-MM-DD)؛ غیبت هر دو یعنی کل دوره
export const PathwayReportQuerySchema = z
  .object({
    from: TehranYmdSchema.nullish(),
    to: TehranYmdSchema.nullish()
  })
  .superRefine((v, ctx) => {
    if (v.from && v.to && v.from > v.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'تاریخ «از» بعد از «تا» است', path: ['from'] });
    }
  });

// پرسش فهرست پراپ‌ها: فیلتر اختیاری سنجه + ملاک تسلط (۱۵۰۰)؛ coerce برای ورود عدد از query string
export const PathProbeListQuerySchema = z.object({
  metric: z.string().trim().min(1).max(PATH_PROBE_METRIC_MAX).optional(),
  threshold: z.coerce.number().finite().min(1).max(100).optional()
});

// ثبت پراپ پیشروی: سنجه/واحد/یادداشت رشتهٔ تریم‌شده، اندازهٔ ۰..۱۰۰۰۰، مهر ISO با آفست اختیاری
export const PathProbeAddSchema = z.object({
  metric: z.string().trim().min(2).max(PATH_PROBE_METRIC_MAX),
  value: z.number().finite().min(0).max(PATH_PROBE_VALUE_MAX),
  unit: z.string().trim().min(1).max(PATH_PROBE_UNIT_MAX).nullish(),
  session_id: z.string().min(1).nullish(),
  taken_at: z.string().datetime({ offset: true }).nullish(),
  note: z.string().trim().max(PATH_PROBE_NOTE_MAX).nullish()
});

// اصلاح پراپ: هر کلیدی غایب باشد یعنی مقدار قبلی دست‌نخورده (درس عبور nullish عیناً)
export const PathProbeUpdateSchema = z.object({
  value: z.number().finite().min(0).max(PATH_PROBE_VALUE_MAX).nullish(),
  unit: z.string().trim().min(1).max(PATH_PROBE_UNIT_MAX).nullish(),
  note: z.string().trim().max(PATH_PROBE_NOTE_MAX).nullish(),
  session_id: z.string().min(1).nullish()
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

export const PathGoalSchema = z.object({
  goal: z.string().max(PATHWAY_GOAL_MAX).nullish() // متن هدف SMART؛ null یعنی حذف هدف
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
      { targetKey: body.target_key ?? null, templateKey: body.template_key ?? null, note: body.note ?? null, exerciseIds: body.exercise_ids ?? null, goal: body.goal ?? null },
      actor
    );
    return c.json({ data }, 201);
  });

  // هدف‌گذاری/ویرایش هدف مسیر پس از ساخت (SMART)
  app.patch('/api/clinical-paths/:id/goal', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = PathGoalSchema.parse(await c.req.json<unknown>());
    const data = await service.updatePathGoal(c.req.param('id'), body.goal ?? null, actor);
    return c.json({ data }, 200);
  });

  // اعتبارسنجی بیرونی: KPIها (فقط مدیر) + حسابرسی موردی
  app.get('/api/validation-kpis', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.getValidationKpis(actor);
    return c.json({ data }, 200);
  });

  app.get('/api/case-audits', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const studentId = c.req.query('student_id')?.trim() || null;
    const data = await service.listCaseAudits(actor, studentId);
    return c.json({ data }, 200);
  });

  app.post('/api/case-audits', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = CaseAuditCreateSchema.parse(await c.req.json<unknown>());
    const data = await service.createCaseAudit(
      { studentId: body.student_id, reviewerA: body.reviewer_a, reviewerB: body.reviewer_b, targetKey: body.target_key ?? null, agreed: body.agreed, note: body.note ?? null },
      actor
    );
    return c.json({ data }, 201);
  });

  // کارت‌های قبلی تیم (کتابخانهٔ استفادهٔ مجدد — حذف دوباره‌کاری)
  app.get('/api/clinical-cards', requireRole('manager', 'therapist'), async (c) => {
    const data = await service.listRecentCards();
    return c.json({ data }, 200);
  });

  // گزارش دوره‌ای طرح درمان: تجمیع جلسات/کارت‌ها با بازهٔ اختیاری — فقط‌خواندنی
  app.get('/api/clinical-paths/:id/report', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const q = PathwayReportQuerySchema.parse({ from: c.req.query('from') ?? null, to: c.req.query('to') ?? null });
    const data = await service.getPathwayReport(c.req.param('id'), { from: q.from ?? null, to: q.to ?? null }, actor);
    return c.json({ data }, 200);
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

  // ─── پراپ‌های پیشروی مسیر (سری زمانی سنجه‌ها) ───
  app.post('/api/clinical-paths/:id/probes', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = PathProbeAddSchema.parse(await c.req.json<unknown>());
    const data = await service.addPathProbe(
      c.req.param('id'),
      { metric: body.metric, value: body.value, unit: body.unit ?? null, sessionId: body.session_id ?? null, takenAt: body.taken_at ?? null, note: body.note ?? null },
      actor
    );
    return c.json({ data }, 201);
  });

  app.get('/api/clinical-paths/:id/probes', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const q = PathProbeListQuerySchema.parse({
      metric: c.req.query('metric') ?? undefined,
      threshold: c.req.query('threshold') ?? undefined
    });
    const data = await service.listPathProbes(c.req.param('id'), actor, { metric: q.metric ?? null, threshold: q.threshold ?? null });
    return c.json({ data }, 200);
  });

  app.patch('/api/clinical-paths/:id/probes/:pid', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = PathProbeUpdateSchema.parse(await c.req.json<unknown>());
    // فیلدهای اختیاری عیناً عبور می‌کنند: کلید غایب = دست‌نخوردن مقدار قبلی
    const data = await service.updatePathProbe(
      c.req.param('id'),
      c.req.param('pid'),
      { value: body.value, unit: body.unit, note: body.note, sessionId: body.session_id },
      actor
    );
    return c.json({ data }, 200);
  });

  // ─── قالب‌های مسیر (بازگردانی از باندل اصلی) ───
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
        sessions: templateSessionInputsToDomain(body.sessions) ?? null, // در ساخت، غایب = خالی
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
        // عیناً عبور: sessions غایب یعنی جلسات قبلی دست‌نخورده (مثل قبل از بازسازی)
        sessions: templateSessionInputsToDomain(body.sessions),
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
      { title: body.title, plan: body.plan ?? null, criterion: body.criterion ?? null, items: itemInputsToDomain(body.items) ?? null },
      actor
    );
    return c.json({ data }, 201);
  });

  // جابه‌جایی جلسات (درگ‌ودراپ) — ترتیب کامل با یک فراخوان
  app.post('/api/clinical-paths/:id/sessions/reorder', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = SessionsReorderSchema.parse(await c.req.json<unknown>());
    const data = await service.reorderPathSessions(c.req.param('id'), body.session_ids, actor);
    return c.json({ data }, 200);
  });

  app.patch('/api/clinical-paths/:id/sessions/:sid', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = PathSessionUpdateSchema.parse(await c.req.json<unknown>());
    // فیلدهای اختیاری عیناً عبور می‌کنند: کلید غایب = دست‌نخوردن مقدار قبلی
    // (اصلاح باگ : «?? null» باعث می‌شد toggle وضعیت، هدف/یادداشت جلسه را پاک کند)
    const data = await service.updatePathSession(
      c.req.param('id'),
      c.req.param('sid'),
      {
        status: body.status ?? null,
        title: body.title,
        plan: body.plan,
        criterion: body.criterion,
        outcome: body.outcome,
        note: body.note,
        items: itemInputsToDomain(body.items),
        fidelity: body.fidelity // عیناً عبور: کلید غایب = undefined = دست‌نخوردن قبلی (قرارداد )
      },
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
