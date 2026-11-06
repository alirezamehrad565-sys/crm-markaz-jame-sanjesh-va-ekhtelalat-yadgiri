// routes.ts — API پرسنلی /api/games/* و زنجیرهٔ عمومی /m/:token + /api/m/:token/*
// زنجیرهٔ عمومی باید «پیش از» گیت authMiddleware در api-routing ثبت شود — قرارداد §۵ نقشهٔ راه.
import { z } from 'zod';
import type { AppHono } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { AppError } from '@core/errors';
import type { GamesService } from './types';
import { renderGamesPage } from './page';

const MetricSchema = z.object({
  id: z.string().trim().min(3).max(64),
  title_fa: z.string().trim().min(1).max(120),
  unit: z.enum(['percent', 'count', 'ms', 'score']),
  higher_is_better: z.boolean(),
  source: z.enum(['auto', 'human']),
  formula: z.enum([
    'accuracy', 'numline_error', 'median_rt', 'commission', 'omission',
    'correct_go_pct', 'correct_nogo_pct', 'commission_pct', 'omission_pct', 'none'
  ])
});

const GoalSchema = z.object({
  id: z.string().trim().min(3).max(64),
  title_fa: z.string().trim().min(1).max(120),
  package_id: z.string().trim().min(2).max(64),
  metric_id: z.string().trim().min(3).max(64),
  age_min: z.number().int().min(2).max(25).nullable().optional(),
  age_max: z.number().int().min(2).max(25).nullable().optional()
});

const PackageSchema = z.object({
  package_id: z.string().trim().min(2).max(64),
  version: z.string().trim().regex(/^\d+\.\d+\.\d+$/, 'نسخه semver'),
  title_fa: z.string().trim().min(1).max(160),
  evidence_level: z.enum(['A', 'B', 'C']),
  dose: z.object({
    days_per_week: z.number().int().min(1).max(7),
    minutes: z.number().int().min(1).max(120),
    max_missions_per_day: z.number().int().min(1).max(10),
    min_weeks: z.number().int().min(1).max(52)
  }),
  body: z.record(z.unknown())
});

const PrescriptionSchema = z.object({
  child_id: z.string().min(1),
  package_id: z.string().trim().min(2).max(64),
  package_version: z.string().trim().regex(/^\d+\.\d+\.\d+$/),
  goal_id: z.string().trim().min(3).max(64),
  pathway_id: z.string().nullable().optional(),
  dose_override: z.record(z.unknown()).nullable().optional(),
  suggested_by: z.enum(['recommender', 'therapist']).optional()
});

const PrescriptionStatusSchema = z.object({ action: z.enum(['pause', 'resume', 'stop', 'complete']) });

const MissionSchema = z.object({
  prescription_id: z.string().min(1),
  mission_ref: z.string().trim().min(1).max(64),
  scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ YYYY-MM-DD')
});

const PublishSchema = z.object({ reviewed_by: z.string().nullable().optional() });

const FinishSchema = z.object({
  session_evidence: z.object({
    pause_count: z.number().min(0).max(1000).nullable().optional(),
    pause_total_ms: z.number().min(0).max(3_600_000).nullable().optional()
  }).nullable().optional()
});

const AttemptSchema = z.object({
  item_id: z.string().trim().min(1).max(64),
  response: z.unknown().optional(),
  rt_ms: z.number().min(0).max(120000).nullable().optional(),
  idem_key: z.string().trim().min(8).max(100)
});

/** نمای HTML گزارش درمانگر — داده‌محور، بدون هیچ برچسب بالینی (فاز ۸) */
function renderReportHtml(report: import('./report').ChildGameReport, childId: string): string {
  const esc = (s: unknown): string =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sessionRows = report.sessions.map((s) => {
    const sum = (s.computed?.summary ?? {}) as { totals?: Record<string, number>; pct?: Record<string, number | null>; rt?: { median_rt?: number | null } };
    const attemptCount = s.raw.attempt_count;
    return `<tr><td>${esc(s.session_id.slice(0, 8))}</td><td>${esc(s.purpose)}</td><td>${esc(s.computed?.validity)}</td>` +
      `<td>${esc(s.computed?.quality_verdict)}</td><td>${esc(sum.totals?.total ?? '—')}</td>` +
      `<td>${esc(sum.pct?.correct_go ?? '—')}</td><td>${esc(sum.pct?.correct_nogo ?? '—')}</td>` +
      `<td>${esc(sum.pct?.commission ?? '—')}</td><td>${esc(sum.pct?.omission ?? '—')}</td><td>${esc(attemptCount)}</td></tr>`;
  }).join('');
  const compareRows = report.comparison.by_metric.map((m) =>
    `<tr><td>${esc(m.metric_id)}</td><td>${esc(m.unit)}</td><td>${m.points.map((p) => esc(p.value)).join(' → ') || '—'}</td></tr>`
  ).join('');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex, nofollow" />
<title>گزارش بازی — کودک ${esc(childId.slice(0, 8))}</title>
<style>
  body { font-family: Tahoma, sans-serif; background: #F5F0E5; color: #153E50; margin: 0; padding: 24px; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; background: #fff; border-radius: 10px; overflow: hidden; }
  th, td { border: 1px solid #E3DCC9; padding: 8px 10px; font-size: 13px; text-align: center; }
  th { background: #153E50; color: #fff; }
  .muted { color: #6E7B76; font-size: 12px; }
</style></head><body>
<h1>گزارش جلسه‌های بازی — کودک ${esc(childId.slice(0, 8))}</h1>
<p class="muted">${esc(report.session_count)} جلسه · تولید ${esc(report.generated_at)} · این گزارش هیچ تفسیر بالینی تولید نمی‌کند — تفسیر با درمانگر است.</p>
<h2>خلاصهٔ محاسبه‌شدهٔ جلسه‌ها</h2>
<table><thead><tr><th>جلسه</th><th>حالت</th><th>اعتبار</th><th>کیفیت</th><th>آزمون</th><th>گو درست٪</th><th>نوگو درست٪</th><th>کمیسیون٪</th><th>اُمیشن٪</th><th>پاسخ خام</th></tr></thead>
<tbody>${sessionRows || '<tr><td colspan="10">جلسه‌ای ثبت نشده</td></tr>'}</tbody></table>
<h2>مقایسهٔ جلسه‌ها (قدیمی → جدید)</h2>
<table><thead><tr><th>سنجه</th><th>واحد</th><th>سری زمانی</th></tr></thead>
<tbody>${compareRows || '<tr><td colspan="3">سنجه‌ای ثبت نشده</td></tr>'}</tbody></table>
<h2>لایهٔ خام</h2>
<p class="muted">${esc(report.sessions.reduce((a, s) => a + s.raw.attempts.length, 0))} پاسخ خام با شواهد نمایش (مُهر زمان/افت فریم/لمس‌ها) در خروجی JSON همین مسیر در دسترس است — تفکیک خام/محاسبه‌شده حفظ شده.</p>
</body></html>`;
}

/** ثبت مسیرهای پرسنلی — پشت authMiddleware (در api-routing بعد از گیت‌ها) */
export function registerGamesRoutes(app: AppHono, service: GamesService): void {
  app.get('/api/games/metrics', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    return c.json({ data: await service.listMetrics() }, 200);
  });

  app.post('/api/games/metrics', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = MetricSchema.parse(await c.req.json<unknown>());
    const created = await service.upsertMetric({
      id: body.id, titleFa: body.title_fa, unit: body.unit,
      higherIsBetter: body.higher_is_better, source: body.source, formula: body.formula
    }, actor);
    return c.json({ data: created }, 201);
  });

  app.get('/api/games/goals', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    return c.json({ data: await service.listGoals() }, 200);
  });

  app.post('/api/games/goals', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = GoalSchema.parse(await c.req.json<unknown>());
    const created = await service.upsertGoal({
      id: body.id, titleFa: body.title_fa, packageId: body.package_id, metricId: body.metric_id,
      ageMin: body.age_min ?? null, ageMax: body.age_max ?? null
    }, actor);
    return c.json({ data: created }, 201);
  });

  app.get('/api/games/packages', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const status = c.req.query('status');
    return c.json({ data: await service.listPackages((status || undefined) as Parameters<typeof service.listPackages>[0]) }, 200);
  });

  app.post('/api/games/packages', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = PackageSchema.parse(await c.req.json<unknown>());
    const created = await service.upsertPackage({
      packageId: body.package_id, version: body.version, titleFa: body.title_fa,
      evidenceLevel: body.evidence_level, dose: body.dose, body: body.body as never
    }, actor);
    return c.json({ data: { id: created.id, version: created.version, status: created.status } }, 201);
  });

  app.post('/api/games/packages/:id/:version/publish', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = PublishSchema.parse((await c.req.json<unknown>().catch(() => ({}))) ?? {});
    const published = await service.publishPackage(c.req.param('id'), c.req.param('version'), body.reviewed_by ?? null, actor);
    return c.json({ data: { id: published.id, version: published.version, status: published.status, reviewedBy: published.reviewedBy } }, 200);
  });

  app.post('/api/games/prescriptions', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = PrescriptionSchema.parse(await c.req.json<unknown>());
    const created = await service.createPrescription({
      childId: body.child_id, packageId: body.package_id, packageVersion: body.package_version,
      goalId: body.goal_id, pathwayId: body.pathway_id ?? null,
      doseOverride: (body.dose_override as never) ?? null, suggestedBy: body.suggested_by
    }, actor);
    return c.json({ data: created }, 201);
  });

  app.get('/api/games/prescriptions', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const childId = c.req.query('child_id');
    return c.json({ data: await service.listPrescriptions(childId || undefined) }, 200);
  });

  app.post('/api/games/prescriptions/:id/status', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = PrescriptionStatusSchema.parse(await c.req.json<unknown>());
    return c.json({ data: await service.setPrescriptionStatus(c.req.param('id'), body.action, actor) }, 200);
  });

  app.post('/api/games/missions', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = MissionSchema.parse(await c.req.json<unknown>());
    const created = await service.scheduleMission({
      prescriptionId: body.prescription_id, missionRef: body.mission_ref, scheduledFor: body.scheduled_for
    }, actor);
    return c.json({ data: created }, 201);
  });

  app.get('/api/games/missions', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const prescriptionId = c.req.query('prescription_id');
    if (!prescriptionId) return c.json({ error: { code: 'VALIDATION', message: 'prescription_id لازم است' } }, 400);
    return c.json({ data: await service.listMissions(prescriptionId) }, 200);
  });

  app.post('/api/games/missions/:id/link', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    return c.json({ data: await service.issueLink(c.req.param('id'), actor) }, 201);
  });

  app.post('/api/games/links/:jti/revoke', requireRole('manager', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    return c.json({ data: await service.revokeLink(c.req.param('jti'), actor) }, 200);
  });

  app.get('/api/games/missions/:id/sessions', requireRole('manager', 'therapist'), async (c) => {
    return c.json({ data: await service.getSessionDetail(c.req.param('id')) }, 200);
  });

  // گزارش درمانگر (فاز ۸) — JSON پیش‌فرض؛ ?format=html نمای چاپ‌پذیر؛ بدون برچسب بالینی
  app.get('/api/games/children/:childId/report', requireRole('manager', 'therapist'), async (c) => {
    const report = await service.getChildReport(c.req.param('childId'));
    if (c.req.query('format') === 'html') {
      return new Response(renderReportHtml(report, c.req.param('childId')), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
      });
    }
    return c.json({ data: report }, 200);
  });
}

/** ثبث زنجیرهٔ عمومی — فقط پیش از authMiddleware فراخوانی شود (قرارداد §۵؛ بدون احراز هویت، توکن خودِ لینک) */
export function registerGamesPublicRoutes(app: AppHono, service: GamesService): void {
  // صفحهٔ سه‌حالته — CSP سخت‌گیرانه، بدون تحلیل‌گر و منبع بیرونی (§۱۱)
  app.get('/m/:token', async (c) => {
    let model;
    try {
      model = await service.getState(c.req.param('token'));
    } catch {
      model = { state: 'expired' as const, missionRef: '', missionTitle: '', packageTitle: '', expiresAt: '' };
    }
    return new Response(renderGamesPage(model, c.req.param('token')), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy': "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
      }
    });
  });

  const jsonHeaders = { 'Cache-Control': 'no-store' } as const;

  app.get('/api/m/:token/state', async (c) => {
    try {
      return c.json({ data: await service.getState(c.req.param('token')) }, 200, jsonHeaders);
    } catch (err) {
      return publicError(c, err);
    }
  });

  app.post('/api/m/:token/start', async (c) => {
    try {
      return c.json({ data: await service.start(c.req.param('token')) }, 200, jsonHeaders);
    } catch (err) {
      return publicError(c, err);
    }
  });

  app.get('/api/m/:token/next-item', async (c) => {
    try {
      return c.json({ data: await service.nextItem(c.req.param('token')) }, 200, jsonHeaders);
    } catch (err) {
      return publicError(c, err);
    }
  });

  app.post('/api/m/:token/attempts', async (c) => {
    try {
      const body = AttemptSchema.parse(await c.req.json<unknown>());
      return c.json({ data: await service.submitAttempt(c.req.param('token'), { ...body, response: body.response ?? {} }) }, 200, jsonHeaders);
    } catch (err) {
      return publicError(c, err);
    }
  });

  app.post('/api/m/:token/finish', async (c) => {
    try {
      const body = FinishSchema.parse((await c.req.json<unknown>().catch(() => ({}))) ?? {});
      return c.json({ data: await service.finish(c.req.param('token'), body.session_evidence ?? undefined) }, 200, jsonHeaders);
    } catch (err) {
      return publicError(c, err);
    }
  });

  app.post('/api/m/:token/parent-gate', async (c) => {
    try {
      const body = await c.req.json<{ solve?: boolean }>().catch(() => ({}) as { solve?: boolean });
      return c.json({ data: await service.parentGate(c.req.param('token'), body?.solve === true) }, 200, jsonHeaders);
    } catch (err) {
      return publicError(c, err);
    }
  });

  app.post('/api/m/:token/confirm', async (c) => {
    try {
      return c.json({ data: await service.confirm(c.req.param('token')) }, 200, jsonHeaders);
    } catch (err) {
      return publicError(c, err);
    }
  });
}

function publicError(c: { json: (body: unknown, status: number, headers?: Record<string, string>) => Response }, err: unknown): Response {
  // پاکت تخت هم‌سان با error-handler سامانه؛ بدون هیچ اطلاعات بالینی
  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message }, err.status as 400 | 404 | 409, { 'Cache-Control': 'no-store' });
  }
  const message = err instanceof Error ? err.message : 'خطای غیرمنتظره';
  return c.json({ error: 'VALIDATION_ERROR', message }, 400, { 'Cache-Control': 'no-store' });
}
