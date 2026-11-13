/**
 * rust-f14 — آزمون قرارداد GET/POST /api/node-sync/status + استثنای جبرانی گات push
 * اپ کامل روی MockD1 (هم‌الگوی node-sync.test.ts)؛ گیت زمان‌اجرای میز با env هارنس روشن می‌شود
 * (فقط در کانفیگ capnp موتور بایند است — در وب ۴۰۴ کم‌دست).
 * پوشش: شکل دقیق پاکت GET (نام فیلدها = قرارداد UI نسخهٔ ۳ — دوازده فیلد شامل reconciliation) · آینهٔ POST → بازتاب در GET ·
 * pending_push از DB با watermark · سن cursor · هندشیک نسخه/اختلاف ساعت/خلاصهٔ جبران (موج ۱) ·
 * سازگاری عقب با آینهٔ قدیمیِ بدونِ فیلدهای تازه · ۴۰۱ سشن · ۴۰۴ وب · ۴۰۰ بدنهٔ خراب ·
 * هدر X-CP-Node-Catchup گات ۱۵دقیقه‌ای push را فقط برای دورهٔ جبرانی می‌گشاید.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, asRole, type TestApp } from '../../test/harness';
import { NODE_SYNC_STATUS_MIRROR_KEY } from '../../node-sync-runner/status';

let A: TestApp;

beforeEach(() => {
  A = createTestApp();
  A.env.CENTER_DESKTOP_ENGINE = '1'; // بایند فقط در کانفیگ capnp موتور محلی (config.mjs)
});

const FAKE_CTX = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;

async function seedClientError(id: string, occurredAtSql: string): Promise<void> {
  await A.db.execute(`INSERT INTO client_errors (id, occurred_at, message) VALUES (?, ?, 'خطای آزمون')`, [
    id,
    occurredAtSql
  ]);
}

function nowIso(): string {
  return new Date().toISOString();
}

function sqlStamp(iso: string): string {
  return iso.slice(0, 19).replace('T', ' ');
}

// ───────────────────────── شکل پاکت GET — قرارداد ثابت UI ─────────────────────────

describe('GET /api/node-sync/status — شکل دقیق قرارداد UI نسخهٔ ۳ (موج ۱ + EXP-1)', () => {
  it('پاکت پیش‌فرض: دقیقاً همین دوازده فیلد با مقادیر خالی نرم', async () => {
    const api = await asRole(A, 'manager');
    const res = await api.get('/api/node-sync/status');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as Record<string, unknown>).sort()).toEqual(
      [
        'clock_drift_minutes',
        'clock_warning',
        'last_catchup',
        'last_error',
        'last_pull_cursor_age_days',
        'last_pull_ok_at',
        'last_push_ok_at',
        'mode',
        'pending_push',
        'reconciliation',
        'state',
        'version'
      ].sort()
    );
    const body = res.body as Record<string, unknown>;
    expect(body.mode).toBe('auto');
    expect(body.state).toBe('idle');
    expect(body.version).toBeNull(); // هنوز هیچ هندشیک نسخه‌ای دیده نشده
    expect(body.clock_drift_minutes).toBeNull(); // ساعت مرجع مرکز هنوز ندیده شده
    expect(body.clock_warning).toBe(false);
    expect(body.last_catchup).toBeNull(); // هنوز هیچ دورهٔ جبرانی کامل نبوده
    expect(body.reconciliation).toBeNull(); // EXP-1 — هنوز هیچ آشتی‌سازی نبوده
    expect(body.last_error).toBeNull();
    expect(body.last_pull_cursor_age_days).toBeNull();
    expect(body.last_push_ok_at).toBeNull();
    expect(body.last_pull_ok_at).toBeNull();
    expect(typeof body.pending_push).toBe('number');
  });

  it('بدون سشن → ۴۰۱؛ در تولید وب (بدون گیت میز) → ۴۰۴ کم‌دست', async () => {
    const anon = await A.app.request('/api/node-sync/status', { method: 'GET' }, A.env as never);
    expect(anon.status).toBe(401);

    const web = createTestApp(); // env بدون CENTER_DESKTOP_ENGINE — رفتار تولید وب
    const api = await asRole(web, 'manager');
    const res = await api.get('/api/node-sync/status');
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe('NOT_FOUND');
  });
});

// ───────────────────────── آینهٔ POST → بازتاب در GET ─────────────────────────

describe('POST /api/node-sync/status — آینهٔ اسنپ‌شات فرانت‌اند', () => {
  const FOURTEEN_DAYS_AGO = new Date(Date.now() - 14 * 86_400_000).toISOString();

  function mirrorBody() {
    return {
      v: 1,
      mode: 'quarantined',
      state: 'error',
      last_pull_cursor_at: FOURTEEN_DAYS_AGO,
      last_push_ok_at: FOURTEEN_DAYS_AGO,
      last_pull_ok_at: FOURTEEN_DAYS_AGO,
      last_error_kind: 'auth',
      last_error_at: nowIso(),
      push_watermark: nowIso(),
      client_version: null,
      updated_at: nowIso()
    };
  }

  it('اسنپ‌شات معتبر ذخیره و دقیقاً در GET بازتاب می‌یابد — mode/state/last_error/سن cursor', async () => {
    const api = await asRole(A, 'manager');
    const post = await api.post('/api/node-sync/status', mirrorBody());
    expect(post.status).toBe(200);

    const res = await api.get('/api/node-sync/status');
    expect(res.status).toBe(200);
    const body = res.body as {
      mode: string;
      state: string;
      last_error: { kind: string; at: string } | null;
      last_pull_cursor_age_days: number | null;
      last_push_ok_at: string | null;
      last_pull_ok_at: string | null;
      version: null;
    };
    expect(body.mode).toBe('quarantined');
    expect(body.state).toBe('error');
    expect(body.last_error).toEqual({ kind: 'auth', at: expect.any(String) });
    expect(body.last_pull_cursor_age_days).not.toBeNull();
    expect(body.last_pull_cursor_age_days ?? 0).toBeGreaterThan(13.9);
    expect(body.last_pull_cursor_age_days ?? 99).toBeLessThan(14.1);
    expect(body.last_push_ok_at).toBe(FOURTEEN_DAYS_AGO);
    expect(body.last_pull_ok_at).toBe(FOURTEEN_DAYS_AGO);
    expect(body.version).toBeNull();
  });

  it('موج ۱ — هندشیک نسخه/اختلاف ساعت/خلاصهٔ جبران در POST ذخیره و در GET دقیق بازتاب می‌یابد', async () => {
    const api = await asRole(A, 'manager');
    const post = await api.post('/api/node-sync/status', {
      ...mirrorBody(),
      version: { client: '1.26.0', center: '1.26.2', compatible: false },
      clock_drift_minutes: 17,
      clock_warning: true,
      last_catchup: { at: nowIso(), pulled: 300, pushed: 500 }
    });
    expect(post.status).toBe(200);
    const res = await api.get('/api/node-sync/status');
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.version).toEqual({ client: '1.26.0', center: '1.26.2', compatible: false });
    expect(body.clock_drift_minutes).toBe(17);
    expect(body.clock_warning).toBe(true);
    expect(body.last_catchup).toEqual({ at: expect.any(String), pulled: 300, pushed: 500 });
  });

  it('موج ۱ — آینهٔ قدیمیِ بدونِ فیلدهای تازه پذیرفته می‌شود؛ GET برای غایب‌ها پیش‌فرض نرم می‌گذارد (سازگاری عقب)', async () => {
    const api = await asRole(A, 'manager');
    const post = await api.post('/api/node-sync/status', mirrorBody()); // بدون version/clock_*/last_catchup
    expect(post.status).toBe(200);
    const res = await api.get('/api/node-sync/status');
    const body = res.body as Record<string, unknown>;
    expect(body.version).toBeNull();
    expect(body.clock_drift_minutes).toBeNull();
    expect(body.clock_warning).toBe(false);
    expect(body.last_catchup).toBeNull();
    expect(body.reconciliation).toBeNull(); // EXP-1 — آینهٔ بدون reconciliation = null نرم
  });

  it('EXP-1 — آشتی‌ساز در POST ذخیره و در GET دقیق بازتاب می‌یابد (هم‌خوان و ناهم‌خوان)', async () => {
    const api = await asRole(A, 'manager');
    const post = await api.post('/api/node-sync/status', {
      ...mirrorBody(),
      reconciliation: { at: nowIso(), ok: false, differences: 1, detail: [{ domain: 'library', center: 40, local: 39 }] }
    });
    expect(post.status).toBe(200);
    const res = await api.get('/api/node-sync/status');
    expect((res.body as { reconciliation: unknown }).reconciliation).toEqual({
      at: expect.any(String),
      ok: false,
      differences: 1,
      detail: [{ domain: 'library', center: 40, local: 39 }]
    });

    // هم‌خوانی کامل — detail=null در پاکت GET
    const okPost = await api.post('/api/node-sync/status', {
      ...mirrorBody(),
      reconciliation: { at: nowIso(), ok: true, differences: 0, detail: null }
    });
    expect(okPost.status).toBe(200);
    const res2 = await api.get('/api/node-sync/status');
    expect((res2.body as { reconciliation: unknown }).reconciliation).toEqual({
      at: expect.any(String),
      ok: true,
      differences: 0,
      detail: null
    });
  });

  it('EXP-1 — آشتی‌ساز خراب (ردیف بیش از سقف ۵ یا شمارندهٔ منفی) → ۴۰۰ و آینهٔ قبلی باقی', async () => {
    const api = await asRole(A, 'manager');
    await api.post('/api/node-sync/status', mirrorBody());
    const tooMany = await api.post('/api/node-sync/status', {
      ...mirrorBody(),
      reconciliation: {
        at: nowIso(),
        ok: false,
        differences: 6,
        detail: [1, 2, 3, 4, 5, 6].map((i) => ({ domain: `d${i}`, center: i, local: 0 }))
      }
    });
    expect(tooMany.status).toBe(400);
    const negative = await api.post('/api/node-sync/status', {
      ...mirrorBody(),
      reconciliation: { at: nowIso(), ok: true, differences: -1, detail: null }
    });
    expect(negative.status).toBe(400);
    const res = await api.get('/api/node-sync/status');
    expect((res.body as { reconciliation: unknown }).reconciliation).toBeNull(); // آینهٔ قبلیِ بدون reconciliation باقی است
  });

  it('موج ۱ — فیلد تازهٔ خراب (ناسازگار یا شمارندهٔ منفی) → ۴۰۰ و آینهٔ قبلی دست‌نخورده', async () => {
    const api = await asRole(A, 'manager');
    await api.post('/api/node-sync/status', mirrorBody());
    const badCount = await api.post('/api/node-sync/status', {
      ...mirrorBody(),
      last_catchup: { at: nowIso(), pulled: -1, pushed: 0 }
    });
    expect(badCount.status).toBe(400);
    const badVersion = await api.post('/api/node-sync/status', {
      ...mirrorBody(),
      version: { client: 'x', center: 'y', compatible: 'نه' }
    });
    expect(badVersion.status).toBe(400);
    const res = await api.get('/api/node-sync/status');
    expect((res.body as { version: unknown }).version).toBeNull(); // آینهٔ قبلیِ بدون version باقی است
  });

  it('pending_push از DB محلی با watermark حساب می‌شود — فقط client_errors بعد از watermark', async () => {
    const api = await asRole(A, 'manager');
    // watermark = اکنون؛ سه خطا با occurred_at بعد از آن → pending = ۳
    // (بکت ساعتی ping و بکت روزانه usage از watermark جلوتر نیستند → صفر)
    const waterIso = nowIso();
    const futureSql = sqlStamp(new Date(Date.now() + 60_000).toISOString());
    await seedClientError('ce-1', futureSql);
    await seedClientError('ce-2', futureSql);
    await seedClientError('ce-3', futureSql);

    const post = await api.post('/api/node-sync/status', { ...mirrorBody(), push_watermark: waterIso });
    expect(post.status).toBe(200);
    const res = await api.get('/api/node-sync/status');
    expect((res.body as { pending_push: number }).pending_push).toBe(3);
  });

  it('pending_push بدون watermark = همهٔ ردیف‌های client_errors محلی', async () => {
    const api = await asRole(A, 'manager');
    await seedClientError('ce-all-1', sqlStamp(new Date(Date.now() - 86_400_000).toISOString()));
    await seedClientError('ce-all-2', sqlStamp(new Date(Date.now() - 86_400_000).toISOString()));
    const res = await api.get('/api/node-sync/status');
    const pending = (res.body as { pending_push: number }).pending_push;
    expect(pending).toBeGreaterThanOrEqual(2);
  });

  it('بدنهٔ خارج از قرارداد → ۴۰۰ VALIDATION_ERROR و آینهٔ قبلی دست‌نخورده', async () => {
    const api = await asRole(A, 'manager');
    await api.post('/api/node-sync/status', mirrorBody());
    const bad = await api.post('/api/node-sync/status', { v: 1, mode: 'نه-مود', state: 'error' });
    expect(bad.status).toBe(400);
    expect((bad.body as { error: string }).error).toBe('VALIDATION_ERROR');
    const res = await api.get('/api/node-sync/status');
    expect((res.body as { mode: string }).mode).toBe('quarantined'); // آینهٔ قبلی باقی است
  });

  it('آینه در جدول settings با کلید اختصاصی می‌نشیند (بدون مایگریشن تازه)', async () => {
    const api = await asRole(A, 'manager');
    await api.post('/api/node-sync/status', mirrorBody());
    const row = await A.db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
      NODE_SYNC_STATUS_MIRROR_KEY
    ]);
    expect(row).not.toBeNull();
    const stored = JSON.parse(row?.value ?? '{}') as Record<string, unknown>;
    expect(stored.v).toBe(1);
    expect(stored.state).toBe('error');
  });
});

// ───────────────────────── استثنای جبرانی گات push (rust-f14) ─────────────────────────

describe('گات ۱۵دقیقه‌ای push — هدر X-CP-Node-Catchup فقط دورهٔ جبرانی را می‌گشاید', () => {
  function nodeHeaders(code: string, key: string): Record<string, string> {
    return { 'x-cp-node-code': code, authorization: `Bearer ${key}` };
  }

  it('push دوم بدون هدر → throttled صامت؛ همان لحظه با هدر جبرانی → پذیرش کامل', async () => {
    const api = await asRole(A, 'manager');
    const reg = await api.post('/node/register', { node_code: 'DESKTOP:catchup-1' });
    expect(reg.status).toBe(201);
    const { node_code, node_key } = (reg.body as { data: { node_code: string; node_key: string } }).data;

    const push = (extraHeaders: Record<string, string>, id: string) =>
      A.app.request(
        '/node/push',
        {
          method: 'POST',
          headers: { ...nodeHeaders(node_code, node_key), 'content-type': 'application/json', ...extraHeaders },
          body: JSON.stringify({ items: [{ id, domain: 'health_ping', payload: { ok: true } }] })
        },
        A.env as never
      );

    const r1 = await push({}, 'ping-1');
    expect(((await r1.json()) as { data: { accepted: number } }).data.accepted).toBe(1);

    // تیک دوره‌ای فوری — زیر گات: پاسخ صامت، بدون ردیف تازه
    const r2 = await push({}, 'ping-2');
    const d2 = (await r2.json()) as { data: { accepted: number; throttled: boolean } };
    expect(d2.data.throttled).toBe(true);
    expect(d2.data.accepted).toBe(0);

    // دورهٔ جبرانی — هدر rust-f14 گات را می‌گشاید (مُهر تلاش/idempotency همان‌جا اجرا می‌شوند)
    const r3 = await push({ 'x-cp-node-catchup': '1' }, 'ping-2');
    const d3 = (await r3.json()) as { data: { accepted: number; throttled: boolean } };
    expect(d3.data.throttled).toBe(false);
    expect(d3.data.accepted).toBe(1);

    const rows = await A.db.query('SELECT id FROM node_push_events WHERE node_code = ?', [node_code]);
    expect(rows).toHaveLength(2); // ping-1 و ping-2 — بدون ردیف دوباره
  });
});
