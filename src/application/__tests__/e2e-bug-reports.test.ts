/**
 * e2e گزارش باگ به پشتیبانی CP (بازاعمال ۱.۲۵.۵۱؛ ۱.۲۵.۵۷ — چرخهٔ دوطرفه m8)
 * مسیرهای /api/bug-reports + چرخهٔ ارسال/دریافت @app/bug-report-forward با fetch ساختگی.
 * قرارداد CP m7+m8: POST /api/node/feedback — 201 تازه / 200 تکراری؛
 * GET /api/node/feedback/replies?since= — pull پاسخ پشتیبانی با کلید خود گزارش.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createTestApp, asRole, type TestApp } from '../../test/harness';
import type { Api } from '../../test/harness';
import { runBugReportForward, buildBugReportConfig, BUG_REPORT_ATTEMPT_KEY, BUG_REPORT_REPLY_SINCE_KEY } from '@app/bug-report-forward';
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
      if (String(url).includes('/api/node/feedback/replies')) {
        /* pull پاسخ‌ها — در این آزمون پاسخی نیست */
        return new Response(JSON.stringify({ ok: true, data: { server_time: '2026-11-10T08:00:01Z', items: [] } }), { status: 200 });
      }
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
    // چرخهٔ دوطرفه ۱.۲۵.۵۷: اول pull پاسخ‌ها، بعد سه POST — همه در همین دوره
    expect(res).toMatchObject({ status: 'done', sent: 3, failed: 0, pulled: 0 });
    expect(calls.length).toBe(4);
    expect(calls[0].url).toBe('https://network-control-plane.sanjeshm.workers.dev/api/node/feedback/replies');
    expect(calls[0].init.method).toBe('GET');
    const postCalls = calls.slice(1);
    expect(postCalls.every((c) => c.url === 'https://network-control-plane.sanjeshm.workers.dev/api/node/feedback')).toBe(true);
    /* ترتیب هم‌ثانیه‌ها با id تصادفی است — گزارش بحرانی games را از میان سه بدنه پیدا کن */
    const bodies = postCalls.map((c) => JSON.parse(String(c.init.body)) as { areas: string[]; severity: string; created_at: string; page: string | null });
    const gamesIdx = bodies.findIndex((b) => b.severity === 'critical');
    expect(gamesIdx).toBeGreaterThanOrEqual(0);
    const headers = postCalls[gamesIdx].init.headers as Record<string, string>;
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
    /* مُهر since هم پیش رفته (pull موفق با server_time) */
    const since = await app.db
      .queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [BUG_REPORT_REPLY_SINCE_KEY]);
    expect(JSON.parse(since!.value)).toBe('2026-11-10T08:00:01Z');
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

  it('۱.۲۵.۵۷ — pull پاسخ پشتیبانی: آیتم‌ها با کلید خودِ گزارش UPSERT می‌شوند و مُهر since پیش می‌رود', async () => {
    const list = dataOf<Array<{ id: string; reply_text: string | null }>>(
      await api.get('/api/bug-reports')
    );
    const target = list.find((i) => i.reply_text === null) ?? list[0];
    expect(target).toBeTruthy();

    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes('/api/node/feedback/replies')) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              server_time: '2026-11-10T12:00:00Z',
              items: [
                {
                  id: target.id,
                  status: 'read',
                  reply_text: 'بررسی شد — در نسخهٔ بعد رفع می‌شود',
                  reply_by: 'پشتیبانی شبکه',
                  reply_at: '2026-11-10T11:30:00Z',
                  updated_at: '2026-11-10T11:30:00Z'
                }
              ]
            }
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true, data: { id: 'fb-x', duplicate: false } }), { status: 201 });
    });

    const res = await runBugReportForward({
      db: app.db,
      logger: createLogger('test'),
      config: configWith(envOf(app), { CP_SYNC_URL: 'https://cp.example', CP_NODE_CODE: 'a', CP_NODE_KEY: 'b' }),
      fetchFn: fetchMock as unknown as typeof fetch,
      now: () => new Date('2026-11-10T12:00:00Z')
    });
    expect(res).toMatchObject({ status: 'done', pulled: 1 });

    const after = dataOf<Array<{ id: string; reply_text: string | null; reply_by: string | null; reply_at: string | null }>>(
      await api.get('/api/bug-reports')
    ).find((x) => x.id === target.id);
    expect(after?.reply_text).toBe('بررسی شد — در نسخهٔ بعد رفع می‌شود');
    expect(after?.reply_by).toBe('پشتیبانی شبکه');
    expect(after?.reply_at).toBe('2026-11-10T11:30:00Z');

    /* مُهر since = server_time — دورهٔ بعد فقط تازه‌ترها را می‌گیرد */
    const since = await app.db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [BUG_REPORT_REPLY_SINCE_KEY]);
    expect(JSON.parse(since!.value)).toBe('2026-11-10T12:00:00Z');
    /* درگاه pull همان مسیر رسمی CP است (since ممکن است از دورهٔ قبل همراه بیاید) */
    expect(String(fetchMock.mock.calls[0][0]).startsWith('https://cp.example/api/node/feedback/replies')).toBe(true);
  });

  it('۱.۲۵.۵۷ — گارد تازگی: پاسخ قدیمی‌تر از reply_at فعلی بازنویسی نمی‌شود و since پارامتر دورهٔ بعد است', async () => {
    const list = dataOf<Array<{ id: string; reply_at: string | null }>>(await api.get('/api/bug-reports'));
    const replied = list.find((i) => i.reply_at === '2026-11-10T11:30:00Z');
    expect(replied).toBeTruthy();

    let seenSince: string | null = null;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/api/node/feedback/replies')) {
        seenSince = new URL(u).searchParams.get('since');
        /* پاسخ قدیمی‌تر (۱۰:۰۰ < ۱۱:۳۰ فعلی) — گارد تازگی نباید ردیف را عوض کند */
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              server_time: '2026-11-10T18:00:00Z',
              items: [
                { id: replied!.id, status: 'read', reply_text: 'متن قدیمی', reply_by: 'قدیمی', reply_at: '2026-11-10T10:00:00Z', updated_at: '2026-11-10T10:00:00Z' }
              ]
            }
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true, data: { id: 'fb-x', duplicate: false } }), { status: 201 });
    });

    const res = await runBugReportForward({
      db: app.db,
      logger: createLogger('test'),
      config: configWith(envOf(app), { CP_SYNC_URL: 'https://cp.example', CP_NODE_CODE: 'a', CP_NODE_KEY: 'b' }),
      fetchFn: fetchMock as unknown as typeof fetch,
      now: () => new Date('2026-11-10T18:00:00Z')
    });
    expect(res).toMatchObject({ status: 'done' });
    expect(seenSince).toBe('2026-11-10T12:00:00Z'); // مُهر دورهٔ قبل

    const after = dataOf<Array<{ id: string; reply_text: string | null }>>(
      await api.get('/api/bug-reports')
    ).find((x) => x.id === replied!.id);
    expect(after?.reply_text).toBe('بررسی شد — در نسخهٔ بعد رفع می‌شود'); // متن تازه سرِ جایش
  });

  it('۱.۲۵.۵۸ — Service Binding اولویت دارد: pull/push از binding.fetch می‌رود نه fetch عمومی (خطای ۱۰۴۲ هم‌زون)', async () => {
    await api.post('/api/bug-reports', { areas: ['appointments'], severity: 'minor', description: 'برای مسیر binding' });
    const calls: string[] = [];
    const bindingFetch = vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      if (String(url).includes('/api/node/feedback/replies')) {
        return new Response(JSON.stringify({ ok: true, data: { server_time: '2026-11-10T20:00:00Z', items: [] } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, data: { id: 'fb-x', duplicate: false } }), { status: 201 });
    });
    const publicFetch = vi.fn(async () => new Response('blocked 1042', { status: 500 }));

    const res = await runBugReportForward({
      db: app.db,
      logger: createLogger('test'),
      config: configWith(envOf(app), { CP_SYNC_URL: 'https://cp.example', CP_NODE_CODE: 'a', CP_NODE_KEY: 'b' }),
      binding: { fetch: bindingFetch as unknown as Fetcher['fetch'] } as unknown as Fetcher,
      fetchFn: publicFetch as unknown as typeof fetch,
      now: () => new Date('2026-11-10T20:00:00Z')
    });
    expect(res).toMatchObject({ status: 'done', sent: 1, failed: 0 });
    expect(calls.length).toBe(2); // ۱ pull + ۱ push — همه از binding
    expect(calls[0].startsWith('https://cp.example/api/node/feedback/replies')).toBe(true); // since از دورهٔ قبل همراه است
    expect(publicFetch).not.toHaveBeenCalled(); // fetch عمومی هرگز مصرف نشد
  });
});
