/* form-builder/routes.ts — مسیرهای فرم‌ساز (v1.27.34)
 * ادمین: CRUD فرم + صندوق پاسخ‌ها (مدیر/منشی می‌نویسند؛ درمانگر و ناظر می‌خوانند).
 * عمومی: صفحهٔ تعاملی GET /public/form/:slug (بدون لاگین، no-store/noindex — الگوی referral-page)
 * و ثبت پاسخ POST /public/form/:slug/submit با سقف نرخ درون‌حافظه (الگوی §RUM قرارداد). */
import type { AppHono } from '@core/shared';
import { FormResponseSubmitSchema, FormUpsertSchema, FORM_RATE_PER_HOUR } from '@core/shared';
import { RateLimitError } from '@core/errors';
import { getAuthContext, requireRole } from '@core/auth';
import { renderFormPage, renderFormNotFoundPage } from './form-page';
import type { FormBuilderService } from './types';

/* سقف نرخ ثبت پاسخ عمومی — پنجرهٔ یک‌ساعته به‌ازای هر IP (بدون ردپای دائمی) */
const formHits = new Map<string, { count: number; resetAt: number }>();

function formRateGuard(ip: string): void {
  const nowMs = Date.now();
  const windowMs = 3600_000;
  const cur = formHits.get(`ip:${ip}`);
  if (!cur || cur.resetAt < nowMs) {
    formHits.set(`ip:${ip}`, { count: 1, resetAt: nowMs + windowMs });
  } else if (cur.count >= FORM_RATE_PER_HOUR) {
    throw new RateLimitError(3600, 'تعداد ثبت‌ها در این ساعت زیاد است — کمی بعد تلاش کنید');
  } else {
    cur.count += 1;
  }
  if (formHits.size > 5000) {
    for (const [key, val] of formHits) {
      if (val.resetAt < nowMs) formHits.delete(key);
    }
  }
}

function clientIp(c: { req: { header(name: string): string | undefined } }): string {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local'
  ).slice(0, 64);
}

const PAGE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src https://cdn.jsdelivr.net"
};

export function registerFormBuilderRoutes(app: AppHono, service: FormBuilderService): void {
  /* ─── عمومی ─── */
  app.get('/public/form/:slug', async (c) => {
    const slug = c.req.param('slug').slice(0, 60);
    const form = await service.getBySlugPublished(slug);
    const html = form ? renderFormPage({ form }) : renderFormNotFoundPage();
    return new Response(html, { status: form ? 200 : 404, headers: PAGE_HEADERS });
  });

  app.post('/public/form/:slug/submit', async (c) => {
    const raw = await c.req.text();
    if (raw.length > 8192) {
      return c.json({ error: 'VALIDATION_ERROR', message: 'حجم اطلاعات بیش از حد مجاز است' }, 400);
    }
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      return c.json({ error: 'VALIDATION_ERROR', message: 'بدنهٔ درخواست JSON معتبر نیست' }, 400);
    }
    const body = FormResponseSubmitSchema.parse(parsedBody);
    formRateGuard(clientIp(c));
    const slug = c.req.param('slug').slice(0, 60);
    const created = await service.submitResponse(
      slug,
      {
        answers: body.answers,
        respondent_name: body.respondent_name,
        respondent_phone: body.respondent_phone ?? null,
        token: body.token
      },
      { ip: clientIp(c) }
    );
    return c.json({ data: created }, 201);
  });

  /* ─── ادمین ─── */
  app.get('/api/forms', async (c) => {
    const items = await service.list();
    return c.json({ data: items }, 200);
  });

  app.get('/api/forms/:id', async (c) => {
    const item = await service.getById(c.req.param('id'));
    return c.json({ data: item }, 200);
  });

  app.post('/api/forms', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = FormUpsertSchema.parse(await c.req.json<unknown>());
    const created = await service.create(body, actor);
    return c.json({ data: created }, 201);
  });

  app.patch('/api/forms/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = FormUpsertSchema.parse(await c.req.json<unknown>());
    const updated = await service.update(c.req.param('id'), body, actor);
    return c.json({ data: updated }, 200);
  });

  app.delete('/api/forms/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    await service.remove(c.req.param('id'), actor);
    return c.body(null, 204);
  });

  app.get('/api/forms/:id/responses', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const items = await service.listResponses(
      c.req.param('id'),
      c.req.query('status') || undefined
    );
    return c.json({ data: items }, 200);
  });

  app.post('/api/forms/:id/responses/:rid/seen', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const item = await service.markResponseSeen(c.req.param('rid'), actor);
    return c.json({ data: item }, 200);
  });
}
