import type { AppHono } from '@core/shared';
import {
  NewWaitlistSchema,
  PublicReferralSubmissionSchema,
  ReferralRejectSchema,
  StudentWaitStatusSchema,
  UpdateWaitlistSchema,
  WaitlistCallSchema,
  WaitlistReorderSchema,
  WaitlistScheduleSchema,
  REFERRAL_RATE_PER_CHAT,
  REFERRAL_RATE_PER_HOUR
} from '@core/shared';
import { RateLimitError } from '@core/errors';
import { getAuthContext, requireRole } from '@core/auth';
import { renderReferralPage } from './referral-page';
import { GUIDE_SLUGS, renderGuidePage } from './guide-page'; // ۱.۲۷.۳۸ — فایل راهنمای عمومی هر دسته
import type { WaitlistService } from './types';

/* محدودساز نرخ درون‌حافظهٔ فرم عمومی (بدون ردپای دائمی — الگوی §RUM قرارداد design.md):
 * پنجرهٔ یک‌ساعته؛ IP برای معرفی‌های عمومی و توکن بات برای معرفی‌های چت‌بسته. */
const referralHits = new Map<string, { count: number; resetAt: number }>();

function referralRateGuard(ip: string, chatKey: string | null): void {
  const nowMs = Date.now();
  const windowMs = 3600_000;
  const hit = (key: string, max: number): void => {
    const cur = referralHits.get(key);
    if (!cur || cur.resetAt < nowMs) {
      referralHits.set(key, { count: 1, resetAt: nowMs + windowMs });
      return;
    }
    if (cur.count >= max) {
      throw new RateLimitError(3600, 'تعداد معرفی‌ها در این ساعت زیاد است — کمی بعد تلاش کنید یا با مرکز تماس بگیرید');
    }
    cur.count += 1;
  };
  hit(`ip:${ip}`, REFERRAL_RATE_PER_HOUR);
  if (chatKey) hit(`chat:${chatKey}`, REFERRAL_RATE_PER_CHAT);
  /* هرس فرصت‌طلب پنجره‌های گذشته تا Map بی‌حد بزرگ نشود */
  if (referralHits.size > 5000) {
    for (const [key, val] of referralHits) {
      if (val.resetAt < nowMs) referralHits.delete(key);
    }
  }
}

export function registerWaitlistRoutes(app: AppHono, service: WaitlistService): void {
  app.get('/api/waitlist', async (c) => {
    const status = c.req.query('status') as never | undefined;
    const priority = c.req.query('priority') as never | undefined;
    const q = c.req.query('q') ?? undefined;
    const items = await service.list({
      status,
      priority,
      q: q || undefined
    });
    return c.json({ data: items }, 200);
  });

  app.get('/api/waitlist/badge', async (c) => {
    const badge = await service.badge();
    return c.json({ data: badge }, 200);
  });

  /* ─── اینباکس معرفی (v1.27.33) — قبل از GET /:id ثبت می‌شود تا «referrals» به‌عنوان id پارس نشود ─── */
  app.get('/api/waitlist/referrals', async (c) => {
    const items = await service.listReferrals({
      status: c.req.query('status') || undefined,
      year: c.req.query('year') || undefined
    });
    return c.json({ data: items }, 200);
  });

  app.post('/api/waitlist/referrals/:id/accept', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const entry = await service.acceptReferral(c.req.param('id'), actor);
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist/referrals/:id/reject', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = ReferralRejectSchema.parse(await c.req.json<unknown>());
    const item = await service.rejectReferral(c.req.param('id'), body.reason, actor);
    return c.json({ data: item }, 200);
  });

  app.post('/api/waitlist/reorder', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = WaitlistReorderSchema.parse(await c.req.json<unknown>());
    const items = await service.reorder(body.ids, actor);
    return c.json({ data: items }, 200);
  });

  app.post('/api/waitlist/auto-order', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const items = await service.autoOrder(actor);
    return c.json({ data: items }, 200);
  });

  app.get('/api/waitlist/:id', async (c) => {
    const entry = await service.getById(c.req.param('id'));
    if (!entry) {
      return c.json({ error: 'NOT_FOUND', message: 'ورودی لیست انتظار یافت نشد' }, 404);
    }
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewWaitlistSchema.parse(await c.req.json<unknown>());
    const entry = await service.create(
      {
        firstName: body.first_name,
        lastName: body.last_name,
        phone: body.phone,
        nationalId: body.national_id,
        birthDate: body.birth_date,
        schoolId: body.school_id,
        classId: body.class_id,
        source: body.source,
        serviceType: body.service_type,
        note: body.note,
        priority: body.priority,
        studentId: body.student_id
      },
      actor
    );
    return c.json({ data: entry }, 201);
  });

  app.post('/api/students/:id/wait-status', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = StudentWaitStatusSchema.parse(await c.req.json<unknown>());
    const entry = await service.setStudentWaiting(
      c.req.param('id'),
      {
        awaiting: body.awaiting,
        source: body.source,
        serviceType: body.service_type,
        priority: body.priority
      },
      actor
    );
    return c.json({ data: entry }, 200);
  });

  app.patch('/api/waitlist/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateWaitlistSchema.parse(await c.req.json<unknown>());
    const entry = await service.update(
      c.req.param('id'),
      {
        firstName: body.first_name,
        lastName: body.last_name,
        phone: body.phone,
        nationalId: body.national_id,
        birthDate: body.birth_date,
        schoolId: body.school_id,
        classId: body.class_id,
        source: body.source,
        serviceType: body.service_type,
        note: body.note,
        priority: body.priority
      },
      actor
    );
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist/:id/call', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = WaitlistCallSchema.parse(await c.req.json<unknown>());
    const entry = await service.call(c.req.param('id'), body.note, actor);
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist/:id/schedule', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = WaitlistScheduleSchema.parse(await c.req.json<unknown>());
    const result = await service.schedule(
      c.req.param('id'),
      {
        staffId: body.staff_id,
        startAt: body.start_at,
        endAt: body.end_at,
        studentId: body.student_id,
        nationalId: body.national_id,
        note: body.note
      },
      actor
    );
    return c.json({ data: result }, 201);
  });

  app.post('/api/waitlist/:id/reject', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = WaitlistCallSchema.parse(await c.req.json<unknown>());
    const entry = await service.reject(c.req.param('id'), body.note, actor);
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist/:id/no-show', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const entry = await service.noShow(c.req.param('id'), actor);
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist/:id/cancel', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const entry = await service.cancel(c.req.param('id'), actor);
    return c.json({ data: entry }, 200);
  });

  app.post('/api/waitlist/:id/reopen', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = WaitlistCallSchema.parse(await c.req.json<unknown>());
    const entry = await service.reopen(c.req.param('id'), body.note, actor);
    return c.json({ data: entry }, 200);
  });

  app.delete('/api/waitlist/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    await service.softDelete(c.req.param('id'), actor);
    return c.body(null, 204);
  });

  /* ─── فرم عمومی معرفی به مرکز (v1.27.33 — REFERRAL-DESIGN.md) ───
   * صفحهٔ تعاملی بدون لاگین (الگوی family-sheet: no-store + noindex)؛ توکن اختیاریِ بات
   * برای بستن معرفی به چت معرف. بدنهٔ >۸KB اصلاً پارس نمی‌شود؛ سقف نرخ IP/چت. */
  app.get('/public/referral', (c) => {
    const token = (c.req.query('token') ?? '').slice(0, 200) || null;
    const html = renderReferralPage({ token });
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'"
      }
    });
  });

  /* ─── فایل راهنمای عمومی هر دسته (۱.۲۷.۳۸) — لینکِ «توضیحات بیشتر» صفحه‌های آگاهی ───
   * همان قرارداد سروِ /public/referral (no-store + noindex + CSP)؛ بدون دادهٔ بالینی؛
   * اسلاگ ناشناخته → ۴۰۴ ساده. سه دسته: delayed / learning-disorder / intellectual */
  app.get('/public/guide/:slug', (c) => {
    const slug = c.req.param('slug');
    if (!(GUIDE_SLUGS as readonly string[]).includes(slug)) {
      return new Response('یافت نشد', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    const html = renderGuidePage(slug);
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'"
      }
    });
  });

  app.post('/public/referrals', async (c) => {
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
    const body = PublicReferralSubmissionSchema.parse(parsedBody);
    const ip = (
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      'local'
    ).slice(0, 64);
    referralRateGuard(ip, body.token ?? null);
    const created = await service.submitReferral(
      {
        role: body.role,
        referrer_name: body.referrer_name,
        referrer_phone: body.referrer_phone,
        school_text: body.school_text,
        grade_text: body.grade_text,
        class_text: body.class_text,
        token: body.token,
        children: body.children
      },
      {}
    );
    return c.json({ data: created }, 201);
  });
}
