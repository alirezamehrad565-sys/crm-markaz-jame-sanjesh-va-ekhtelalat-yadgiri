import type { AppHono } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { CaseEventTypeInputSchema, CaseEventTypeUpdateSchema, packageComponentsOf, teacherBindingOfPayload } from './pure';
import type { CaseEventsService, CaseEventTypeInput, CaseEventTypeRecord } from './types';
import { renderFillFormPage, renderPackageFormPage } from './public-form';
import type { PackageFormModel, PackageToolBlock } from './public-form';

export function registerCaseEventsRoutes(app: AppHono, service: CaseEventsService): void {

  app.get('/api/case-events/types', async (c) => {
    const items = await service.listTypes({
      activeOnly: c.req.query('active') === undefined ? false : c.req.query('active') === 'true',
      category: (c.req.query('category') || undefined) as never
    });
    return c.json({ data: items }, 200);
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

  function packageModelOf(
    pkgType: CaseEventTypeRecord,
    comps: CaseEventTypeRecord[],
    studentName: string | null,
    teacherName: string | null = null
  ): PackageFormModel {
    const ctxFields = pkgType.fields
      .filter((f) => f.type === 'select' || f.type === 'text' || f.type === 'longtext')
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type as 'select' | 'text' | 'longtext',
        options: f.options,
        required: f.required
      }));
    const ctxTitle = pkgType.fields.find((f) => f.type === 'heading')?.label ?? 'زمینهٔ خانواده';
    const tools: PackageToolBlock[] = comps.map((comp, idx) => {
      const subscaleName = new Map((comp.subscales ?? []).map((s) => [s.id, s.name] as const));
      const sections: PackageToolBlock['sections'] = [];
      for (const f of comp.fields) {
        if (f.type !== 'scale' && f.type !== 'single') continue; // — فقط آیتم نمره‌دار به گیرنده می‌رسد
        const title = f.subscaleId ? subscaleName.get(f.subscaleId) ?? null : null;
        const item = {
          key: f.key, label: f.label, scaleMax: f.scaleMax,
          scoredOptions: f.scoredOptions?.map((o) => ({ label: o.label })),
          scaleLabels: f.scaleLabels
        };
        const last = sections[sections.length - 1];
        if (last && last.title === title) last.items.push(item);
        else sections.push({ title, items: [item] });
      }
      return {
        toolKey: comp.key,
        toolTitle: `بخش ${faNum(idx + 2)} از ${faNum(comps.length + 1)} — ${comp.title}`,
        toolIntro: comp.description ?? null,
        itemCount: sections.reduce((sum, s) => sum + s.items.length, 0),
        sections
      };
    });
    return {
      packageTitle: `${pkgType.icon ?? ''} ${pkgType.title}`.trim(),
      studentName: studentName ?? '',
      teacherLabel: teacherName ? `فرم شما — ${teacherName}` : null,
      description: pkgType.description ?? null,
      context: { title: ctxTitle, fields: ctxFields },
      tools
    };
  }

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

    if (type && packageComponentsOf(type.key)) {
      const comps = await service.listPackageComponentTypes(event.eventTypeId);
      if (!comps) {
        return c.html(fillErrorPage('این فرم پیدا نشد.'), 404);
      }
      return new Response(renderPackageFormPage(packageModelOf(type, comps, studentName, teacherName), token), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow'
        }
      });
    }

    const subscaleName = new Map((type?.subscales ?? []).map((s) => [s.id, s.name] as const));
    const sections: { title: string | null; items: { key: string; label: string; scaleMax?: number; scoredOptions?: { label: string }[]; scaleLabels?: string[] }[] }[] = [];
    for (const f of type?.fields ?? []) {
      if (f.type !== 'scale' && f.type !== 'single') continue; // — فقط آیتم نمره‌دار به گیرنده می‌رسد
      const title = f.subscaleId ? subscaleName.get(f.subscaleId) ?? null : null;
      const item = {
        key: f.key, label: f.label, scaleMax: f.scaleMax,
        scoredOptions: f.scoredOptions?.map((o) => ({ label: o.label })),
        scaleLabels: f.scaleLabels
      };
      const last = sections[sections.length - 1];
      if (last && last.title === title) {
        last.items.push(item);
      } else {
        sections.push({ title, items: [item] });
      }
    }
    const model = {
      typeTitle: `${event.typeIcon ?? ''} ${event.typeTitle}`.trim(),
      studentName: studentName ?? '',
      sections,
      audience: event.typeAudience ?? type?.audience ?? 'family',
      description: type?.description ?? null,
      teacherLabel: teacherName ? `فرم شما — ${teacherName}` : null
    };
    return new Response(renderFillFormPage(model, token), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow'
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
