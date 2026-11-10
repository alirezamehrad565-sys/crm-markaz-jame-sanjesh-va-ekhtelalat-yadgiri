// ─── گزارش باگ سامانه به پشتیبانی CP: مسیرها ───
// بازاعمال ۱.۲۵.۵۱ روی درخت ۱.۲۵.۵۳. ثبت گزارش حق همهٔ همکاران فعال مرکز است
// (مدیر/منشی/درمانگر) — گزارش باگ دادهٔ پرونده نیست؛ فهرست هم برای همین سه نقش باز است.
// قرارداد CP در @app/bug-report-forward — این مسیر فقط صف محلی می‌سازد و فوراً پاسخ می‌دهد.
import type { AppHono } from '@core/shared';
import { z } from 'zod';
import { getAuthContext, requireRole } from '@core/auth';
import {
  BUG_REPORT_AREA_IDS,
  BUG_REPORT_AREAS_MAX,
  BUG_REPORT_AREA_ID_MAX,
  BUG_REPORT_DESCRIPTION_MAX,
  BUG_REPORT_PAGE_MAX,
  BUG_REPORT_VERSION_MAX,
  BUG_REPORT_SEVERITIES
} from '@core/shared';
import type { BugReportService } from './types';

const BugReportCreateSchema = z
  .object({
    /* بخش‌های ناشناخته رد نمی‌شوند — پاک‌سازی می‌شوند (CP هر رشته‌ای را با برچسب خام می‌پذیرد) */
    areas: z
      .array(z.string().trim().min(1).max(BUG_REPORT_AREA_ID_MAX))
      .max(BUG_REPORT_AREAS_MAX)
      .default([])
      .transform((list) => list.filter((a) => (BUG_REPORT_AREA_IDS as readonly string[]).includes(a))),
    severity: z.enum(BUG_REPORT_SEVERITIES).default('major'),
    description: z.string().trim().max(BUG_REPORT_DESCRIPTION_MAX).optional().nullable(),
    page: z.string().trim().max(BUG_REPORT_PAGE_MAX).optional().nullable(),
    app_version: z.string().trim().max(BUG_REPORT_VERSION_MAX).optional().nullable()
  })
  .superRefine((v, ctx) => {
    if (v.areas.length === 0 && !(v.description != null && v.description.length > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['areas'], message: 'حداقل یک بخش یا توضیح لازم است' });
    }
  });

export function registerBugReportRoutes(app: AppHono, service: BugReportService): void {
  const colleague = requireRole('manager', 'secretary', 'therapist');

  app.post('/api/bug-reports', colleague, async (c) => {
    const ctx = getAuthContext(c);
    const actor = { id: ctx.staffId, name: ctx.displayName };
    const input = BugReportCreateSchema.parse(await c.req.json<unknown>());
    const rec = await service.create(actor, {
      areas: input.areas,
      severity: input.severity,
      description: input.description ?? null,
      page: input.page ?? null,
      appVersion: input.app_version ?? null
    });
    return c.json({ data: shape(rec) }, 201);
  });

  app.get('/api/bug-reports', colleague, async (c) => {
    const items = await service.list({ limit: 100 });
    return c.json({ data: items.map(shape) }, 200);
  });
}

function shape(rec: {
  id: string;
  staffName: string | null;
  areas: string[];
  severity: string;
  description: string | null;
  page: string | null;
  appVersion: string | null;
  status: string;
  forwardError: string | null;
  createdAt: string;
  forwardedAt: string | null;
  replyText: string | null;
  replyBy: string | null;
  replyAt: string | null;
}) {
  return {
    id: rec.id,
    staff_name: rec.staffName,
    areas: rec.areas,
    severity: rec.severity,
    description: rec.description,
    page: rec.page,
    app_version: rec.appVersion,
    status: rec.status,
    forward_error: rec.forwardError,
    created_at: rec.createdAt,
    forwarded_at: rec.forwardedAt,
    reply_text: rec.replyText,
    reply_by: rec.replyBy,
    reply_at: rec.replyAt
  };
}
