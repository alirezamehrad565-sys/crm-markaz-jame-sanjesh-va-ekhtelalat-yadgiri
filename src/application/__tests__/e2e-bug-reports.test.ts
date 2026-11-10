/**
 * e2e گزارش باگ به پشتیبانی CP (بازاعمال ۱.۲۵.۵۱ روی درخت ۱.۲۵.۵۳)
 * مسیرهای /api/bug-reports + چرخهٔ ارسال @app/bug-report-forward با fetch ساختگی.
 * قرارداد گیرندهٔ CP (m7): POST /api/node/feedback — 201 تازه / 200 تکراری.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createTestApp, asRole, type TestApp } from '../../test/harness';
import type { Api } from '../../test/harness';
import { runBugReportForward, buildBugReportConfig, BUG_REPORT_ATTEMPT_KEY } from '@app/bug-report-forward';
import { createDb } from '@core/db';
import { createLogger } from '@core/logger';

let app: TestApp;
let api: Api; // مدیر
let therapist: Api;

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

beforeAll(async () => {
  app = createTestApp();
  api = await asRole(app, 'manager');
  therapist = await asRole(app, 'therapist');
});

describe('POST /api/bug-reports — صف محلی گزارش', () => {
  it('بدون توکن → 401', async () => {
    const res = await app.app.request('/api/bug-reports', { method: 'POST', body: '{}' }, app.env as never);
    expect(res.status).toBe(401);
  });

  it('ثبت سادهٔ درمانگر → 201 با وضعیت open و پاک‌سازی بخش ناشناخته', async () => {
    const res = await therapist.post('/api/bug-reports', {
      areas: ['appointments', 'not-a-real-area'],
      severity: 'major',
      description: 'کلیک روی ذخیره هیچ کاری نمی‌کند',
      page: '#/appointments'
    });
    expect(res.status).toBe(201);
    const rec = dataOf<{ id: string; status: string; areas: string[]; staff_name: string | null }>(res);
    expect(rec.status).toBe('open');
    expect(rec.areas).toEqual(['appointments']);
    expect(rec.staff_name).toBeTruthy();
    expect(rec.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('بدون بخش و بدون توضیح → 400', async () => {
    const res = await api.post('/api/bug-reports', { areas: [], severity: 'minor' });
    expect(res.status).toBe(400);
    const body = res.body as { error?: string };
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('بخش ناشناختهٔ تنها (بعد از پاک‌سازی خالی) و بی‌توضیح → 400', async () => {
    const res = await api.post('/api/bug-reports', { areas: ['nope'], severity: 'minor' });
    expect(res.status).toBe(400);
  });

  it('بخش ناشناختهٔ تنها با توضیح → 201 و پاک‌سازی کامل بخش‌ها', async () => {
    const res = await api.post('/api/bug-reports', { areas: ['nope'], severity: 'minor', description: 'توضیح کلی' });
    expect(res.status).toBe(201);
    expect(dataOf<{ areas: string[] }>(res).areas).toEqual([]);
  });

  it('فهرست، گزارش ثبت‌شده را می‌دهد', async () => {
    const res = await api.get('/api/bug-reports');
    expect(res.status).toBe(200);
    const items = dataOf<Array<{ severity: string; page: string | null; areas: string[] }>>(res);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((i) => i.severity === 'major' && i.areas.includes('appointments'))).toBe(true);
  });
});

describe('چرخهٔ ارسال به CP — runBugReportForward', () => {
  function envOf(app: TestApp): Record<string, string | undefined> {
    return (app.env ?? {}) as Record<string, string | undefined>;
  }

  function configWith(env: Record<string, string | undefined>, extra?: Partial<Record<string, string>>) {
    return buildBugReportConfig({
      CP_SYNC_URL: extra?.CP_SYNC_URL ?? env.CP_SYNC_URL,
      CP_NODE_CODE: extra?.CP_NODE_CODE ?? env.CP_NODE_CODE,
      CP_NODE_KEY: extra?.CP_NODE_KEY ?? env.CP_NODE_KEY
    });
  }

  it('بدون env کامل → skipped (kill switch)', async () => {
    const res = await runBugReportForward({
      db: app.db,
      logger: createLogger('test'),
      config: { cpOrigin: null, cpNodeCode: null, cpNodeKey: null }
    });
    expect(res).toEqual({ status: 'skipped' });
  });

  it('ارسال موفق: بدنهٔ هم‌قرارداد + status sent + مُهر settings', async () => {
    await api.post('/api/bug-reports', { areas: ['games'], severity: 'critical', description: 'کارت بازی باز نمی‌شود' });

    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true, data: { id: 'fb-x', duplicate: false } }), { status: 201 });
    });

    const config = configWith(envOf(app), {
      CP_SYNC_URL: 'https://network-control-plane.sanjeshm.workers.dev',
      CP_NODE_CODE: 'demo-a',
      CP_NODE_KEY: 'demo-key'
    });
    const now = () => new Date('2026-11-10T08:00:00Z');
    const res = await runBugReportForward({
      db: app.db,
      logger: createLogger('test'),
      config,
      fetchFn: fetchMock as unknown as typeof fetch,
      now
    });
    // سه ردیف در صف است (آزمون‌های قبل + این یکی) — همه در همین دوره می‌روند
    expect(res).toMatchObject({ status: 'done', sent: 3, failed: 0 });
    expect(calls.length).toBe(3);
    expect(calls[0].url).toBe('https://network-control-plane.sanjeshm.workers.dev/api/node/feedback');
    /* ترتیب هم‌ثانیه‌ها با id تصادفی است — گزارش بحرانی games را از میان سه بدنه پیدا کن */
    const bodies = calls.map((c) => JSON.parse(String(c.init.body)) as { areas: string[]; severity: string; created_at: string; page: string | null });
    const gamesIdx = bodies.findIndex((b) => b.severity === 'critical');
    expect(gamesIdx).toBeGreaterThanOrEqual(0);
    const headers = calls[gamesIdx].init.headers as Record<string, string>;
    expect(headers['X-CP-Node-Code']).toBe('demo-a');
    expect(headers.Authorization).toBe('Bearer demo-key');
    expect(headers['X-CP-Node-Version']).toBeTruthy();
    expect(bodies[gamesIdx].areas).toEqual(['games']);
    expect(bodies[gamesIdx].created_at).toBeTruthy();
    expect(bodies[gamesIdx].page).toBeNull(); // در این آزمون page نفرستادیم

    const list = dataOf<Array<{ status: string; forwarded_at: string | null }>>(
      await api.get('/api/bug-reports')
    );
    expect(list[0].status).toBe('sent');
    expect(list[0].forwarded_at).toBe('2026-11-10 08:00:00');

    const stamp = app.db
      .queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [BUG_REPORT_ATTEMPT_KEY]);
    expect(stamp).toBeTruthy();
  });

  it('پاسخ 500 → ردیف open می‌ماند با forward_error', async () => {
    await api.post('/api/bug-reports', { areas: ['students'], severity: 'minor' });
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }));
    const res = await runBugReportForward({
      db: app.db,
      logger: createLogger('test'),
      config: configWith(envOf(app), {
        CP_SYNC_URL: 'https://cp.example',
        CP_NODE_CODE: 'a',
        CP_NODE_KEY: 'b'
      }),
      fetchFn: fetchMock as unknown as typeof fetch,
      now: () => new Date('2026-11-10T09:00:00Z')
    });
    expect(res).toMatchObject({ status: 'done', sent: 0, failed: 1 });
    const list = dataOf<Array<{ status: string; forward_error: string | null; areas: string[] }>>(await api.get('/api/bug-reports'));
    const target = list.find((i) => i.areas.includes('students'))!;
    expect(target.status).toBe('open');
    expect(target.forward_error).toContain('HTTP 500');
  });

  it('گیت ۵دقیقه‌ای: صف غیرخالی و تلاش زودهنگام → skipped بدون fetch', async () => {
    await api.post('/api/bug-reports', { areas: ['other'], description: 'صف برای گیت' });
    const fetchMock = vi.fn(async () => new Response('down', { status: 500 }));
    const cfg = configWith(envOf(app), { CP_SYNC_URL: 'https://cp.example', CP_NODE_CODE: 'a', CP_NODE_KEY: 'b' });
    const t1 = new Date('2026-11-10T10:00:00Z');
    const first = await runBugReportForward({
      db: app.db, logger: createLogger('test'), config: cfg, fetchFn: fetchMock as unknown as typeof fetch, now: () => t1
    });
    expect(first).toMatchObject({ status: 'done', failed: 2 }); // ردیف آزمون 500 + ردیف تازه هر دو در صف می‌مانند
    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await runBugReportForward({
      db: app.db, logger: createLogger('test'), config: cfg, fetchFn: fetchMock as unknown as typeof fetch,
      now: () => new Date(t1.getTime() + 60_000)
    });
    expect(second).toEqual({ status: 'skipped' });
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // fetch تازه‌ای نشده
  });
});
