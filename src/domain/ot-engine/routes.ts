/**
 * موتور چک‌لیست کاردرمانی (OT) — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// REST موتور کاردرمانی ذهنی + گیت‌های شناسایی + نتیجهٔ نیاز ویژه
// فقط سیم به سرویس — RBAC مالک پرونده در سرویس چک می‌شود (هم‌الگوی موتور بالینی).

import { z } from 'zod';
import type { AppHono } from '@core/shared';
import { STUDENT_PROTOCOLS } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import type { OtEngineService } from './service';
import { OT_SKILL_STATUSES, OT_PROMPT_LEVELS } from './types';
import { OT_FOCUS_MAX, OT_HOMEWORK_MAX, OT_SKILL_NOTE_MAX, OT_SUMMARY_MAX, NEEDS_PLAN_MAX, NEEDS_TEXT_MAX } from './service';

const SKILL_ID_MAX = 40;

const OtSessionItemSchema = z
  .object({
    skill_id: z.string().min(4).max(SKILL_ID_MAX),
    status: z.enum(OT_SKILL_STATUSES),
    note: z.string().max(OT_SKILL_NOTE_MAX).nullish(),
    prompt_level: z.enum(OT_PROMPT_LEVELS).nullish()
  })
  .superRefine((val, ctx) => {
    // داوری کاردرمانی P0-2: «با کمک» بدون سطح راهنما پذیرفته نیست
    if (val.status === 'with_help' && !val.prompt_level) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['prompt_level'], message: 'برای «با کمک» انتخاب سطح راهنما الزامی است' });
    }
  });

export const OtSessionSaveSchema = z.object({
  items: z.array(OtSessionItemSchema).min(1).max(84),
  focus: z.string().max(OT_FOCUS_MAX).nullish(),
  summary: z.string().max(OT_SUMMARY_MAX).nullish(),
  homework: z.string().max(OT_HOMEWORK_MAX).nullish(),
  appointment_id: z.string().nullish()
});

export const NeedsSummarySchema = z.object({
  need_type: z.string().min(2).max(40),
  protocol: z.enum(STUDENT_PROTOCOLS),
  protocol_secondary: z.enum(STUDENT_PROTOCOLS).nullable().optional(),
  evidence: z.string().max(NEEDS_TEXT_MAX).nullish(),
  goals: z.string().max(NEEDS_TEXT_MAX).nullish(),
  session_plan: z.string().max(NEEDS_PLAN_MAX).nullish()
});

export function registerOtEngineRoutes(app: AppHono, service: OtEngineService): void {
  // گیت‌های شناسایی + فاز پرونده — خواندن: مدیر/منشی/درمانگرِ مسئول
  app.get('/api/students/:id/clinical-gates', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.getGates(c.req.param('id'), actor);
    return c.json({ data }, 200);
  });

  // پروفایل چک‌لیست ۷ حیطه‌ای — خواندن: مدیر/منشی/درمانگرِ مسئول
  app.get('/api/students/:id/ot/profile', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.getOtProfile(c.req.param('id'), actor);
    return c.json({ data }, 200);
  });

  // m162 — پیشرفت جلسه‌به‌جلسه (تایم‌لاین جلسات + خط پایهٔ عملکردی) — خواندن: مدیر/منشی/درمانگرِ مسئول
  app.get('/api/students/:id/ot/progress', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const data = await service.getOtProgress(c.req.param('id'), actor);
    return c.json({ data }, 200);
  });

  // ثبت جلسهٔ کاردرمانی ذهنی (دسته‌مهارت + گزارش جلسه) — فقط مدیر/درمانگرِ مسئول
  app.post('/api/students/:id/ot/sessions', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = OtSessionSaveSchema.parse(await c.req.json<unknown>());
    const data = await service.saveOtSession(
      c.req.param('id'),
      {
        items: body.items.map((it) => ({
          skillId: it.skill_id,
          status: it.status,
          note: it.note ?? null,
          promptLevel: it.prompt_level ?? null
        })),
        focus: body.focus ?? null,
        summary: body.summary ?? null,
        homework: body.homework ?? null,
        appointmentId: body.appointment_id ?? null
      },
      actor
    );
    return c.json({ data }, 201);
  });

  // نتیجهٔ نیاز ویژه — فعال‌سازی پروتکل مداخله — فقط مدیر/درمانگرِ مسئول
  app.post('/api/students/:id/needs-summary', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = NeedsSummarySchema.parse(await c.req.json<unknown>());
    const data = await service.setNeeds(
      c.req.param('id'),
      {
        needType: body.need_type,
        protocol: body.protocol,
        protocolSecondary: body.protocol_secondary ?? null,
        evidence: body.evidence ?? null,
        goals: body.goals ?? null,
        sessionPlan: body.session_plan ?? null
      },
      actor
    );
    return c.json({ data }, 201);
  });
}
