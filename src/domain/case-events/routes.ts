import type { AppHono, AppBindings } from '@core/shared';
import { getAuthContext, requireRole, verifySessionJwt, resolveSessionSecret, getStaffById, readSessionCookie } from '@core/auth';
import type { StaffRow } from '@core/auth';
import { AuthError, ForbiddenError, ValidationError } from '@core/errors';
import { CaseEventTypeInputSchema, CaseEventTypeUpdateSchema, SurveyCreateSchema, teacherBindingOfPayload, analyzeChecklist, buildSummary } from './pure';
import type { CaseEventsService, CaseEventTypeInput } from './types';
import { renderFillFormPage, familySectionsOf } from './public-form';
import { renderPreviewPage, renderPreviewErrorPage } from './preview-form';
import { PUBLIC_PAGE_CSP } from '@core/shared/csp'; // ۱.۲۷.۸۲ (security-007/ADR-004): پرکردن شکاف CSP صفحات عمومی فرم
import { batteryCategoryOf } from '@domain/clinical-engine/instruments'; /* ۱.۲۷.۸۸ — ممیزی روان‌سنجی: دستهٔ کتابخانهٔ باتری از رجیستری JSON */

export function registerCaseEventsRoutes(app: AppHono, service: CaseEventsService): void {

  app.get('/api/case-events/types', async (c) => {
    const items = await service.listTypes({
      activeOnly: c.req.query('active') === undefined ? false : c.req.query('active') === 'true',
      category: (c.req.query('category') || undefined) as never
    });
    /* ۱.۲۷.۸۸ — دستهٔ کتابخانهٔ باتری از رجیستری JSON باتری (کلید محور) به پاسخ اضافه می‌شود؛
       فقط بلوک‌های باتری مقدار دارند و قالب‌های دیگر null می‌گیرند — ستون DB ندارد. */
    return c.json({ data: items.map((it) => ({ ...it, batteryCategory: batteryCategoryOf(it.key) })) }, 200);
  });

  app.post('/api/case-events/types', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = CaseEventTypeInputSchema.parse(await c.req.json<unknown>());
    const item = await service.createType({ ...body, category: body.category as CaseEventTypeInput['category'] }, actor);
    return c.json({ data: item }, 201);
  });

  app.patch('/api/case-events/types/:id', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = CaseEventTypeUpdateSchema.parse(await c.req.json<unknown>());
    const item = await service.updateType(c.req.param('id'), body as Partial<CaseEventTypeInput>, actor);
    return c.json({ data: item }, 200);
  });

  app.post('/api/case-events/types/:id/deactivate', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    await service.deactivateType(c.req.param('id'), actor);
    return c.json({ ok: true }, 200);
  });

  app.delete('/api/case-events/types/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    await service.deleteType(c.req.param('id'), actor);
    return c.json({ ok: true }, 200);
  });

  app.get('/api/students/:id/case-events/suggest', async (c) => {
    const items = await service.suggestTypesForStudent(c.req.param('id'));
    return c.json({ data: items }, 200);
  });

  app.get('/api/case-events/pending', async (c) => {
    const items = await service.listPendingChecklists();
    return c.json({ data: items }, 200);
  });

  /* ۱.۲۵.۵۹ — نظرسنجی رضایت مرکز/درمانگر: ساخت گروهی فقط مدیر
     ۱.۲۵.۶۰ — فهرست هم فقط مدیر (ماژول مستقل «نظرسنجی خانواده‌ها») */
  app.post('/api/case-events/surveys', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = SurveyCreateSchema.parse(await c.req.json<unknown>());
    const result = await service.createSurveyEvents({
      studentIds: body.student_ids,
      therapistId: body.therapist_id ?? null,
      kind: body.kind ?? 'discharge'
    }, actor);
    return c.json({ data: result }, 201);
  });

  app.get('/api/case-events/surveys', requireRole('manager'), async (c) => {
    const items = await service.listSurveys();
    return c.json({ data: items }, 200);
  });

  /* ۱.۲۵.۶۱ — تابلوی شاخص‌های نظرسنجی: پنجرهٔ جاری/قبل + روند + تفکیک فرم + کارنامهٔ درمانگران + تم‌ها — فقط مدیر */
  app.get('/api/case-events/surveys/insights', requireRole('manager'), async (c) => {
    const raw = Number(c.req.query('days') ?? 30);
    const days = raw === 7 || raw === 90 ? raw : 30;
    const data = await service.surveyInsights(days);
    return c.json({ data }, 200);
  });

  app.post('/api/case-events/:id/send', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ audience?: string; note?: string; teacher_name?: string; teacher_id?: string }>().catch(() => null);
    const audience = body?.audience === 'family' || body?.audience === 'teacher' || body?.audience === 'both' ? body.audience : null;
    const result = await service.sendChecklistLink(
      c.req.param('id'),
      { audience, note: body?.note ?? null, teacherName: body?.teacher_name ?? null, teacherId: body?.teacher_id ?? null },
      actor
    );
    return c.json({ data: result }, 200);
  });

  app.post('/api/case-events/:id/teacher-link', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ teacher_name?: string; teacher_id?: string }>().catch(() => null);
    const result = await service.issueTeacherFillLink(
      c.req.param('id'),
      { teacherName: body?.teacher_name ?? null, teacherId: body?.teacher_id ?? null },
      actor
    );
    return c.json({ data: result }, 200);
  });

  app.get('/api/students/:id/case-events', async (c) => {
    const items = await service.listEventsByStudent(c.req.param('id'), {
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined
    });
    return c.json({ data: items }, 200);
  });

  app.get('/api/case-events/by-appointments', async (c) => {
    const ids = (c.req.query('ids') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const map = await service.listEventsByAppointments(ids);
    const out: Record<string, unknown[]> = {};
    for (const [k, v] of map) out[k] = v;
    return c.json({ data: out }, 200);
  });

  app.get('/api/case-events/:id', async (c) => {
    const item = await service.getEventById(c.req.param('id'));
    if (!item) return c.json({ error: { code: 'NOT_FOUND', message: 'رویداد یافت نشد' } }, 404);
    return c.json({ data: item }, 200);
  });

  app.get('/api/appointments/:id/case-events', async (c) => {
    const items = await service.listEventsByAppointment(c.req.param('id'));
    return c.json({ data: items }, 200);
  });

  app.post('/api/students/:id/case-events', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ eventTypeId?: string; appointmentId?: string | null; occurredAt?: string | null; values?: Record<string, string | number | null>; draft?: boolean }>();
    const item = await service.createEvent(
      {
        eventTypeId: body.eventTypeId ?? '',
        studentId: c.req.param('id'),
        appointmentId: body.appointmentId ?? null,
        occurredAt: body.occurredAt ?? null,
        values: body.values ?? {},
        draft: body.draft ?? false
      },
      actor
    );
    return c.json({ data: item }, 201);
  });

  app.post('/api/students/:id/case-events/sensory-chip', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ levels?: Record<string, unknown> }>().catch(() => null);
    const item = await service.createSensoryChipEvent(c.req.param('id'), { levels: body?.levels ?? {} }, actor);
    return c.json({ data: item }, 201);
  });

  app.post('/api/students/:id/case-events/read-core', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ levels?: Record<string, unknown> }>().catch(() => null);
    const item = await service.createReadCoreEvent(c.req.param('id'), { levels: body?.levels ?? {} }, actor);
    return c.json({ data: item }, 201);
  });

  app.post('/api/students/:id/case-events/probe', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ area?: string; values?: Record<string, unknown> }>().catch(() => null);
    const item = await service.createProbeEvent(c.req.param('id'), { area: body?.area ?? '', values: body?.values ?? {} }, actor);
    return c.json({ data: item }, 201);
  });

  app.post('/api/students/:id/case-events/rehab-fx', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ values?: Record<string, unknown> }>().catch(() => null);
    const item = await service.createRehabFxEvent(c.req.param('id'), { values: body?.values ?? {} }, actor);
    return c.json({ data: item }, 201);
  });

  app.patch('/api/case-events/:id', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ values?: Record<string, string | number | null>; summary?: string }>();
    const item = await service.updateEvent(c.req.param('id'), { values: body.values, summary: body.summary }, actor);
    return c.json({ data: item }, 200);
  });

  app.post('/api/case-events/:id/finalize', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const item = await service.finalizeEvent(c.req.param('id'), actor);
    return c.json({ data: item }, 200);
  });

  app.post('/api/case-events/:id/cancel', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const item = await service.cancelEvent(c.req.param('id'), actor);
    return c.json({ data: item }, 200);
  });

  app.delete('/api/case-events/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    await service.deleteEvent(c.req.param('id'), actor);
    return c.json({ ok: true }, 200);
  });

  app.post('/api/case-events/:id/files', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ filename?: string; mime_type?: string; content_b64?: string }>();
    const file = await service.addEventFile(
      c.req.param('id'),
      { filename: body.filename ?? '', mimeType: body.mime_type ?? '', contentB64: body.content_b64 ?? '' },
      actor
    );
    return c.json({ data: file }, 201);
  });

  app.get('/api/case-events/:id/files', async (c) => {
    const items = await service.listEventFiles(c.req.param('id'));
    return c.json({ data: items }, 200);
  });

  app.get('/api/case-events/:id/files/:fileId', async (c) => {
    const file = await service.getEventFile(c.req.param('id'), c.req.param('fileId'));
    return new Response(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
        'Cache-Control': 'private, no-store'
      }
    });
  });

  app.delete('/api/case-events/:id/files/:fileId', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    await service.deleteEventFile(c.req.param('id'), c.req.param('fileId'), actor);
    return c.json({ ok: true }, 200);
  });
}

export function registerCaseEventPublicRoutes(
  app: AppHono,
  service: CaseEventsService,
  helpers: { studentNameOf: (id: string) => Promise<string | null> }
): void {
  const FILL_PATH = '/public/case-events/:id/fill';

  app.get(FILL_PATH, async (c) => {
    const id = c.req.param('id');
    const token = c.req.query('token') ?? '';
    const event = await service.getEventById(id);
    if (!event) {
      return c.html(fillErrorPage('این فرم پیدا نشد.'), 404);
    }
    const valid = await service.verifyFillToken(id, token);
    if (!valid) {
      return c.html(fillErrorPage('پیوند این فرم معتبر نیست.'), 403);
    }
    if (event.status !== 'pending_family') {
      return c.html(fillErrorPage('این فرم قبلاً پاسخ گرفته یا فعال نیست. با تشکر از همراهی شما.'), 410);
    }
    const studentName = await helpers.studentNameOf(event.studentId);
    const type = await service.getTypeById(event.eventTypeId);
    const teacherName = teacherBindingOfPayload(event.payload)?.name ?? null;

    /* ۱.۲۵.۵۹ — کانون‌های پایش: اسنپ‌شات _monitor_focus (نوشته‌شده هنگام ارسال) بنر فرم را می‌سازد
       و زیرمقیاس‌های درگیر به ابتدای فرم می‌آیند؛ رویدادهای بدون اسنپ‌شات مثل قبل می‌مانند */
    let focusNote: string | null = null;
    const focusKeys = new Set<string>();
    const focusPayloadRaw = (event.payload as Record<string, { value?: unknown } | undefined> | null)?.['_monitor_focus']?.value;
    if (typeof focusPayloadRaw === 'string' && focusPayloadRaw.trim() !== '') {
      try {
        const focus = JSON.parse(focusPayloadRaw) as { items?: { key?: string; titleFa?: string }[] | null };
        const items = (focus.items ?? []).filter((i) => i.key);
        if (items.length > 0) {
          focusNote = items.map((i) => i.titleFa ?? i.key).join('، ');
          for (const i of items) focusKeys.add(i.key as string);
        }
      } catch { /* اسنپ‌شات معیوب = بدون بنر؛ فرم کامل عادی رندر می‌شود */ }
    }

    /* ۱.۲۵.۸۱ — بخش‌بندی فرم خانواده به تابع مشترک familySectionsOf منتقل شد؛ پیش‌نمایش
       فرم‌ساز (نقطه‌های پایانی preview پایین) از همین یک تابع می‌خواند تا «پیش‌نمایش = عین
       چیزی که خانواده می‌بیند» یک قاعدهٔ یکتا بماند. */
    const subscaleName = new Map((type?.subscales ?? []).map((s) => [s.id, s.name] as const));
    const sections = familySectionsOf(type?.fields ?? [], type?.subscales ?? null);
    /* ترتیب کانون‌محور: بخش‌های درگیر اول — بقیه به ترتیب کتابخانه */
    sections.sort((a, b) => {
      const keyOf = (s: { title: string | null }) => [...subscaleName.entries()].find(([, n]) => n === s.title)?.[0] ?? null;
      const ai = focusKeys.has(keyOf(a) ?? '') ? 0 : 1;
      const bi = focusKeys.has(keyOf(b) ?? '') ? 0 : 1;
      return ai - bi;
    });
    const model = {
      typeTitle: `${event.typeIcon ?? ''} ${event.typeTitle}`.trim(),
      studentName: studentName ?? '',
      sections,
      audience: event.typeAudience ?? type?.audience ?? 'family',
      description: type?.description ?? null,
      teacherLabel: teacherName ? `فرم شما — ${teacherName}` : null,
      focusNote
    };
    return new Response(renderFillFormPage(model, token), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy': PUBLIC_PAGE_CSP
      }
    });
  });

  app.post(FILL_PATH, async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ token?: string; answers?: Record<string, number | string> }>().catch(() => null);
    if (!body || !body.token || !body.answers) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'درخواست نامعتبر است' } }, 400);
    }
    const ok = await service.verifyFillToken(id, body.token);
    if (!ok) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'پیوند این فرم معتبر نیست' } }, 403);
    }
    try {
      const actor = { staffId: 'bale-bot', email: 'bale-bot@system.local', role: 'manager' as const, displayName: 'فرم خانواده' };
      await service.fillByFamily(id, { values: body.answers, sourceChatId: null, viaWeb: true }, actor);
      return c.json({ ok: true }, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ثبت انجام نشد';
      const code = message.includes('مهلت') ? 410 : 409;
      return c.json({ error: { code: 'CONFLICT', message } }, code);
    }
  });

  /* ۱.۲۵.۸۱ — «پیش‌نمایش از نگاه خانواده» در فرم‌ساز (خواست کارفرما): همکار با یک کلیک می‌بیند
     خانواده دقیقاً چه صفحه‌ای می‌بیند، فرم را تا آخر پر می‌کند و «چه جوابی می‌دهد» — همان
     تحلیلی که پس از ارسال واقعی در پرونده ثبت می‌شود. قراردادهای سخت:
     ① هیچ نوشتنی — نه db، نه audit، نه sync؛ فقط رندر HTML و محاسبهٔ خالص (analyzeChecklist).
     ② مسیر زیر /public است (میدل‌ور auth فقط /api را می‌پوشاند) پس توکن نشست کارمند در بدنه
        می‌آید (یا از کوکی نشست همان‌مبدأ — ۱.۲۷.۸۲/ADR-005) و عین مسیر Bearer میدل‌ور تأیید
        می‌شود: verifySessionJwt + کارمند فعال + نقش مجاز.
     ③ توکن فقط در پاسخِ همان تبِ خود همکار برمی‌گردد (no-store، noindex) — هیچ لاگی از آن نیست. */
  const STAFF_ROLES = ['manager', 'secretary', 'therapist'];
  async function previewStaffOf(env: AppBindings, token: string): Promise<StaffRow> {
    if (!token) throw new AuthError('توکن دسترسی موجود نیست');
    const payload = await verifySessionJwt(token, await resolveSessionSecret(env));
    if (!payload) throw new AuthError('توکن دسترسی نامعتبر است');
    const staff = await getStaffById(env.DB, payload.sub);
    if (!staff || staff.active !== 1) throw new AuthError('کاربر یافت نشد یا غیرفعال است');
    if (!STAFF_ROLES.includes(staff.role)) {
      throw new ForbiddenError('نقش کاربر مجاز نیست');
    }
    return staff;
  }

  /* ۱.۲۷.۴۳ — ممیزی نشتی‌ها: احراز «قبل از» خواندن بدنه + سقف حجم بدنهٔ عمومی (۴۱۳) */
  const PREVIEW_BODY_MAX_BYTES = 512 * 1024;
  const previewBodyTooLarge = (c: { req: { header: (k: string) => string | undefined } }): boolean => {
    const len = Number(c.req.header('content-length') ?? '0');
    return Number.isFinite(len) && len > PREVIEW_BODY_MAX_BYTES;
  };

  app.post('/public/case-events/preview', async (c) => {
    let definition: unknown = null;
    let token = '';
    if (previewBodyTooLarge(c)) { /* ۱.۲۷.۴۳ — سقف حجم پیش از هر خواندنی؛ احراز بلافاصله پس از پارس */
      return c.html(renderPreviewErrorPage('حجم درخواست زیاد است', 'تعریف قالب حداکثر ۵۱۲ کیلوبایت است.'), 413);
    }
    const ct = c.req.header('content-type') ?? '';
    if (ct.includes('application/json')) {
      const body = await c.req.json<{ definition?: unknown; token?: string }>().catch(() => null);
      definition = body?.definition ?? null;
      token = String(body?.token ?? token);
    } else {
      const form = await c.req.formData().catch(() => null);
      token = String(form?.get('token') ?? token);
      try { definition = JSON.parse(String(form?.get('definition') ?? 'null')); }
      catch { definition = null; }
    }
    await previewStaffOf(c.env, token || readSessionCookie(c.req.header('Cookie')) || ''); /* ۱.۲۷.۴۳ — احراز پس از پارس و پیش از هر رندر؛ ۱.۲۷.۸۲ — fallback کوکی نشست */
    const parsed = CaseEventTypeInputSchema.safeParse(definition);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue.path.length > 0 ? ` (فیلد: ${issue.path.join('.')})` : '';
      return c.html(
        renderPreviewErrorPage('تعریف قالب هنوز کامل نیست', `${issue.message}${where} — پیش‌نمایش فقط برای تعریف کامل معنا دارد.`),
        400,
        { 'Content-Security-Policy': PUBLIC_PAGE_CSP }
      );
    }
    return new Response(renderPreviewPage(parsed.data as CaseEventTypeInput, token), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy': PUBLIC_PAGE_CSP
      }
    });
  });

  app.post('/public/case-events/preview/analyze', async (c) => {
    if (previewBodyTooLarge(c)) {
      return c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'حداکثر ۵۱۲ کیلوبایت' } }, 413);
    }
    const raw = await c.req.text();
    type PreviewAnalyzeBody = { token?: string; definition?: unknown; answers?: Record<string, number | string> };
    let body: PreviewAnalyzeBody | null = null;
    try { body = JSON.parse(raw) as PreviewAnalyzeBody; } catch { body = null; }
    if (!body) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'درخواست نامعتبر است' } }, 400);
    }
    await previewStaffOf(c.env, String(body.token ?? '') || readSessionCookie(c.req.header('Cookie')) || '');
    const parsed = CaseEventTypeInputSchema.safeParse(body.definition);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue.path.length > 0 ? ` (${issue.path.join('.')})` : '';
      return c.json({ error: { code: 'VALIDATION', message: `${issue.message}${where}` } }, 400);
    }
    const def = parsed.data as CaseEventTypeInput;
    const values = body.answers ?? {};
    const displayPayload = (): Record<string, { value: string; label: string }> => {
      const payload: Record<string, { value: string; label: string }> = {};
      for (const f of def.fields) {
        const raw = values[f.key];
        if (raw === undefined || raw === null || String(raw).trim() === '') continue; // اختیاری خالی ثبت نمی‌شود
        const display = f.type === 'single' ? (f.scoredOptions?.[Number(raw)]?.label ?? String(raw)) : String(raw);
        payload[f.key] = { value: display, label: f.label };
      }
      return payload;
    };
    if (def.category !== 'checklist') {
      return c.json({
        ok: true, analysis: null, summary: null, payload: displayPayload(),
        note: 'این قالب خانواده‌پرکن نیست — نمرهٔ خودکار فقط برای چک‌لیست خانواده ساخته می‌شود.'
      }, 200);
    }
    /* عین مسیر fillByFamily (service.ts) — بدون هیچ نوشتنی: الزامی‌ها، نگاشت عددی، تحلیل و
       summary. نتیجه = دقیقاً همان شیئی که در ستون analysis پرونده می‌نشیند. */
    const scoredKeys = new Set(def.fields.filter((f) => f.type === 'scale' || f.type === 'single').map((f) => f.key));
    for (const f of def.fields) {
      if (f.type === 'longtext' || f.type === 'text') {
        if (f.required && String(values[f.key] ?? '').trim() === '') {
          throw new ValidationError(`آیتم «${f.label}» بی‌پاسخ مانده است`);
        }
        continue;
      }
      if (values[f.key] === undefined || values[f.key] === null) {
        throw new ValidationError(`آیتم «${f.label}» بی‌پاسخ مانده است`);
      }
    }
    const numericValues: Record<string, number> = Object.fromEntries(
      Object.entries(values)
        .filter(([k]) => scoredKeys.has(k))
        .map(([k, v]) => [k, Number(v)])
    );
    const analysis = analyzeChecklist(def.fields, def.bands ?? null, numericValues, def.subscales ?? null);
    const payload = displayPayload();
    const summary = buildSummary(payload, analysis);
    return c.json({ ok: true, analysis, summary, payload }, 200);
  });
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function faNum(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

function fillErrorPage(message: string): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>فرم در دسترس نیست</title>
<style>body{margin:0;background:#F7F3EA;color:#12384f;font-family:Tahoma,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.box{background:#fff;border-radius:16px;padding:28px;max-width:420px;text-align:center;box-shadow:0 1px 3px rgba(18,56,79,.08)}</style></head>
<body><div class="box"><h1 style="font-size:18px">چک‌لیست در دسترس نیست</h1><p style="font-size:14px;line-height:1.9">${esc(message)}</p></div></body></html>`;
}
