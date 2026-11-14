/**
 * گیت‌های قرارداد سهمیهٔ روزانهٔ مرکز و هم‌راستاسازی (rust-f15) — سمت ورکر
 * قرارداد: GET /api/central/quota (فقط-مدیر، پاکت خام هشت‌کلیدی) · GET /node/reconcile (احراز نود) ·
 * شمارش برآوردی pull/push/login با UPSERT تک‌دستوری هم‌روز روی quota_usage (0113).
 * همهٔ تست‌ها با اپ کامل (createTestApp — /node و /api/central/quota روی مسیر تولید سوارند) و
 * MockD1 (SQLite واقعی)؛ مرزهای سطح‌بندی ۷۹.۹/۸۰/۹۴.۹/۹۵/۹۵.۱ هم در تابع محض و هم e2e.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createTestApp, asRole, Api, MANAGER_ID, type TestApp } from '../../test/harness';
import { registerCentralQuotaRoutes } from '../app';
import {
  QUOTA_LIMITS,
  NODE_PULL_ROWS_WRITTEN_EST,
  NODE_PULL_ROWS_READ_EST,
  NODE_PUSH_ROWS_WRITTEN_EST,
  NODE_PUSH_ROWS_READ_EST,
  LOGIN_ROWS_WRITTEN_EST,
  LOGIN_ROWS_READ_EST,
  quotaLevelFor,
  quotaPercent
} from '../index';

let A: TestApp;

beforeEach(() => {
  A = createTestApp();
});

const FAKE_CTX = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RawOutcome {
  status: number;
  body: unknown;
  requestId: string | null;
  cacheControl: string | null;
}

/** درخواست خام نودی (بدون سشن) — هم‌الگوی node-sync.test.ts */
async function nodeReq(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string> = {},
  body?: unknown
): Promise<RawOutcome> {
  const res = await A.app.request(
    url,
    {
      method,
      headers: body !== undefined ? { ...headers, 'content-type': 'application/json' } : headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    },
    A.env as never,
    FAKE_CTX
  );
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }
  return {
    status: res.status,
    body: parsed,
    requestId: res.headers.get('x-request-id'),
    cacheControl: res.headers.get('cache-control')
  };
}

function nodeHeaders(code: string, key: string): Record<string, string> {
  return { 'x-cp-node-code': code, authorization: `Bearer ${key}` };
}

/** ثبت نود با ورود مدیر — کلید plaintext فقط همین‌جا در دست تست است */
async function registerNode(nodeCode = 'DESKTOP:quota-node-1'): Promise<{ code: string; key: string }> {
  const api = await asRole(A, 'manager');
  const res = await api.post('/node/register', { node_code: nodeCode, label: 'میز سهمیه' });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  const body = res.body as { data: { node_code: string; node_key: string } };
  return { code: body.data.node_code, key: body.data.node_key };
}

/** ردیف شمارندهٔ امروز — برای ادعاهای دلتا و upsert هم‌روز */
async function quotaRow(): Promise<{ day: string; requests: number; rows_written: number; rows_read_est: number } | null> {
  return A.db.queryOne<{ day: string; requests: number; rows_written: number; rows_read_est: number }>(
    'SELECT day, requests, rows_written, rows_read_est FROM quota_usage WHERE day = ?',
    [todayUtc()]
  );
}

/** بازگرداندن مُهر تلاش push به عقب — عبور از گات ۱۵دقیقه‌ای (هم‌الگوی node-sync.test.ts) */
async function rewindPushSeal(nodeCode: string, minutesAgo = 16): Promise<void> {
  const past = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  await A.db.execute(`UPDATE sync_nodes SET last_push_attempt_at = ? WHERE node_code = ?`, [past, nodeCode]);
}

async function insertAnnouncement(id: string, updatedAt: string): Promise<void> {
  await A.db.execute(
    `INSERT INTO announcements (id, title, body, show_login, show_panel, active, created_by, created_at, updated_at)
     VALUES (?, 'اعلان سهمیه', 'متن اعلان', 1, 1, 1, ?, ?, ?)`,
    [id, MANAGER_ID, updatedAt, updatedAt]
  );
}

async function seedReconcileFixtures(): Promise<void> {
  await insertAnnouncement('q-ann-1', '2026-11-01T10:00:00.000Z');
  await insertAnnouncement('q-ann-2', '2026-11-02T09:00:00.000Z');
  // بستهٔ منتشرشده + پیش‌نویس — پیش‌نویس در شرط پایهٔ دامنهٔ packages رد می‌شود (همان ردیف‌هایی که pull می‌دهد)
  await A.db.execute(
    `INSERT INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, updated_at)
     VALUES ('pkg-quota', '1.0.0', 'بستهٔ سهمیه', 'A', '{"days_per_week":2}', 'published', '{}', '2026-11-03 08:00:00')`
  );
  await A.db.execute(
    `INSERT INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, updated_at)
     VALUES ('pkg-draft', '0.9.0', 'پیش‌نویس', 'C', '{}', 'draft', '{}', '2026-11-06 12:00:00')`
  );
  // کتابخانه: ردیف cp فعال شمرده می‌شود؛ ردیف غیر-cp بیرون شرط پایهٔ دامنه است
  await A.db.execute(
    `INSERT INTO network_content (id, kind, title, summary, body, tags, origin, status, source_center, active, updated_at)
     VALUES ('q-lib-1', 'exercise', 'کتاب سهمیه', 'خلاصه', '{"steps":[1]}', '[]', 'cp', 'published', 'center', 1, '2026-11-04T07:30:00.000Z')`
  );
  await A.db.execute(
    `INSERT INTO network_content (id, kind, title, summary, body, tags, origin, status, source_center, active, updated_at)
     VALUES ('q-lib-local', 'document', 'محلی', 'خلاصه', '{}', '[]', 'local', 'published', 'local', 1, '2026-11-07T07:30:00.000Z')`
  );
}

/** ردیف ممیزی — بدون created_at صریح، پیش‌فرض datetime('now') می‌نشیند (ستون ذکر نمی‌شود) */
async function seedAudit(id: string, action: string, createdAt?: string): Promise<void> {
  if (createdAt) {
    await A.db.execute(
      `INSERT INTO audit_log (id, actor_id, action, resource_type, resource_id, created_at)
       VALUES (?, 'anonymous', ?, 'staff', 'quota-test', ?)`,
      [id, action, createdAt]
    );
  } else {
    await A.db.execute(
      `INSERT INTO audit_log (id, actor_id, action, resource_type, resource_id)
       VALUES (?, 'anonymous', ?, 'staff', 'quota-test')`,
      [id, action]
    );
  }
}

// ───────────────────────── GET /api/central/quota — قرارداد پاکت ─────────────────────────

describe('GET /api/central/quota — قرارداد پاکت rust-f15 (فقط-مدیر)', () => {
  it('مدیر: دقیقاً همین کلیدها با estimated:true و روز UTC؛ تنها تلاش ورودِ خودِ تست شمرده شده', async () => {
    const api = await asRole(A, 'manager'); // یک تلاش ورود موفق — فقط این در شمارنده است
    const res = await api.get('/api/central/quota');
    expect(res.status).toBe(200);
    expect(res.cacheControl).toBe('no-store');

    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ['day', 'estimated', 'failed_logins_24h', 'level', 'limits', 'percent', 'requests', 'rows_read_est', 'rows_written'].sort()
    );
    expect(Object.keys(body.limits as Record<string, unknown>).sort()).toEqual(['requests', 'rows_read', 'rows_written'].sort());
    expect(Object.keys(body.percent as Record<string, unknown>).sort()).toEqual(['requests', 'rows_read', 'rows_written'].sort());
    expect(body.limits).toEqual({ requests: 100000, rows_written: 100000, rows_read: 5000000 });
    expect(body.estimated).toBe(true);
    expect(body.day).toBe(todayUtc());
    expect(body.level).toBe('ok');
    expect(typeof body.failed_logins_24h).toBe('number');

    // تنها رویداد شمردهٔ اپ تازه = همین ورود مدیر (ثابت‌های برآوردی هندلر ورود)
    expect(body.requests).toBe(1);
    expect(body.rows_written).toBe(LOGIN_ROWS_WRITTEN_EST);
    expect(body.rows_read_est).toBe(LOGIN_ROWS_READ_EST);
    expect(body.percent).toEqual({ requests: 0, rows_written: 0, rows_read: 0 });
  });

  it('بی‌احراز ۴۰۱ AUTH_ERROR و منشی ۴۰۳ FORBIDDEN — گیت سشن + نقش مدیر', async () => {
    const anon = await nodeReq('GET', '/api/central/quota');
    expect(anon.status).toBe(401);
    expect((anon.body as { error: string }).error).toBe('AUTH_ERROR');
    expect(anon.requestId).toMatch(/^req-/);

    const secretary = await asRole(A, 'secretary');
    const denied = await secretary.get('/api/central/quota');
    expect(denied.status).toBe(403);
    expect((denied.body as { error: string }).error).toBe('FORBIDDEN');
  });

  it('درصد = مقدار/سقف×۱۰۰ با یک اعشار — نمونهٔ قرارداد (۱۲۳۴/۵۶۷۸/۹۰۰۰۰)', async () => {
    const api = await asRole(A, 'manager');
    await A.db.execute(
      `UPDATE quota_usage SET requests = 1234, rows_written = 5678, rows_read_est = 90000 WHERE day = ?`,
      [todayUtc()]
    );
    const res = await api.get('/api/central/quota');
    expect(res.status).toBe(200);
    const body = res.body as {
      requests: number;
      rows_written: number;
      rows_read_est: number;
      percent: Record<string, number>;
      level: string;
    };
    expect(body.requests).toBe(1234);
    expect(body.rows_written).toBe(5678);
    expect(body.rows_read_est).toBe(90000);
    expect(body.percent).toEqual({ requests: 1.2, rows_written: 5.7, rows_read: 1.8 });
    expect(body.level).toBe('ok'); // همه زیر ۸۰
  });

  it('مرزهای سطح‌بندی روی پاکت زنده: ۷۹.۹=ok، ۸۰=warn، ۹۴.۹=warn، ۹۵=danger، ۹۵.۱=danger', async () => {
    const api = await asRole(A, 'manager');
    const setRow = (requests: number, rowsWritten: number, rowsRead: number): Promise<void> =>
      A.db.execute(`UPDATE quota_usage SET requests = ?, rows_written = ?, rows_read_est = ? WHERE day = ?`, [
        requests,
        rowsWritten,
        rowsRead,
        todayUtc()
      ]).then(() => undefined);

    await setRow(79900, 0, 0); // ۷۹.۹٪
    expect(((await api.get('/api/central/quota')).body as { level: string }).level).toBe('ok');

    await setRow(79900, 80000, 0); // ۸۰٪ روی rows_written
    expect(((await api.get('/api/central/quota')).body as { level: string }).level).toBe('warn');

    await setRow(79900, 94900, 0); // ۹۴.۹٪ — هنوز زیر danger
    expect(((await api.get('/api/central/quota')).body as { level: string }).level).toBe('warn');

    await setRow(79900, 95000, 0); // ۹۵٪ روی rows_written
    expect(((await api.get('/api/central/quota')).body as { level: string }).level).toBe('danger');

    await setRow(0, 0, 4000000); // ۸۰٪ روی rows_read — «هر» بعد کافی است
    expect(((await api.get('/api/central/quota')).body as { level: string }).level).toBe('warn');

    await setRow(0, 0, 4755000); // ۹۵.۱٪ روی rows_read
    const danger = (await api.get('/api/central/quota')).body as { level: string; percent: Record<string, number> };
    expect(danger.level).toBe('danger');
    expect(danger.percent.rows_read).toBe(95.1);
  });

  it('failed_logins_24h = شمار auth.login_failed در audit_logِ ۲۴ساعت اخیر (نه throttle نه بقیهٔ رویدادها)', async () => {
    const api = await asRole(A, 'manager');
    await seedAudit('q-fail-1', 'auth.login_failed');
    await seedAudit('q-fail-2', 'auth.login_failed');
    await seedAudit('q-fail-old', 'auth.login_failed', '2020-01-01 00:00:00'); // بیرون پنجرهٔ ۲۴ساعت
    await seedAudit('q-ok-1', 'auth.login');
    await seedAudit('q-thr-1', 'auth.login_throttled');

    const res = await api.get('/api/central/quota');
    expect(res.status).toBe(200);
    expect((res.body as { failed_logins_24h: number }).failed_logins_24h).toBe(2);
  });

  it('روزِ شمارندهٔ خالی = صفر نرم — با ساعت تزریقی روی زیراپ مستقل (ثبت روت هم‌الگوی تولید)', async () => {
    // ردیف امروز نوشته می‌شود ولی snapshot با now تزریقیِ فردا می‌خواند → ردیف «فردا» غایب است
    await A.db.execute(
      `INSERT INTO quota_usage (day, requests, rows_written, rows_read_est) VALUES (?, 5, 5, 5)`,
      [todayUtc()]
    );
    const tomorrow = new Date(Date.now() + 24 * 60 * 60_000);
    const app = new Hono<{ Bindings: Record<string, unknown>; Variables: Record<string, unknown> }>();
    registerCentralQuotaRoutes(app as never, { db: A.db, now: () => tomorrow });
    // گیت سشن با مسیر توسعهٔ X-Dev-Staff-Id (هم‌الگوی authMiddleware) — مدیرِ seed
    const res = await app.request(
      '/api/central/quota',
      { headers: { 'x-dev-staff-id': MANAGER_ID } },
      A.env as never,
      FAKE_CTX
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { day: string; requests: number; rows_written: number; rows_read_est: number; level: string };
    expect(body.day).toBe(tomorrow.toISOString().slice(0, 10));
    expect(body.requests).toBe(0);
    expect(body.rows_written).toBe(0);
    expect(body.rows_read_est).toBe(0);
    expect(body.level).toBe('ok');
  });
});

// ───────────────────────── سطح‌بندی و درصد — توابع محض ─────────────────────────

describe('سطح‌بندی سهمیه — توابع محض (مرزهای قرارداد ۷۹.۹/۸۰/۹۵/۹۵.۱)', () => {
  it('quotaLevelFor — danger اگر «هر» درصد ≥ ۹۵؛ warn اگر ≥ ۸۰؛ وگرنه ok', () => {
    expect(quotaLevelFor({ requests: 79.9, rows_written: 79.9, rows_read: 79.9 })).toBe('ok');
    expect(quotaLevelFor({ requests: 80, rows_written: 79.9, rows_read: 79.9 })).toBe('warn');
    expect(quotaLevelFor({ requests: 80, rows_written: 94.9, rows_read: 0 })).toBe('warn');
    expect(quotaLevelFor({ requests: 95, rows_written: 0, rows_read: 0 })).toBe('danger');
    expect(quotaLevelFor({ requests: 95.1, rows_written: 0, rows_read: 0 })).toBe('danger');
    expect(quotaLevelFor({ requests: 0, rows_written: 0, rows_read: 95.1 })).toBe('danger'); // هر بعد
    expect(quotaLevelFor({ requests: 100, rows_written: 100, rows_read: 100 })).toBe('danger');
  });

  it('quotaPercent — گرد به یک اعشار (نمونه‌های قرارداد)', () => {
    expect(quotaPercent(1234, 100000)).toBe(1.2);
    expect(quotaPercent(5678, 100000)).toBe(5.7);
    expect(quotaPercent(90000, 5000000)).toBe(1.8);
    expect(quotaPercent(0, 100000)).toBe(0);
    expect(quotaPercent(79900, 100000)).toBe(79.9);
    expect(quotaPercent(95000, 100000)).toBe(95);
    expect(quotaPercent(4755000, 5000000)).toBe(95.1);
  });

  it('ثابت‌های سقف و برآورد هندلرها — سقف‌های «تقریبی» پلن رایگان و جمع برآوردی مثبت', () => {
    expect(QUOTA_LIMITS).toEqual({ requests: 100000, rows_written: 100000, rows_read: 5000000 });
    expect(NODE_PULL_ROWS_WRITTEN_EST).toBeGreaterThan(0);
    expect(NODE_PULL_ROWS_READ_EST).toBeGreaterThan(0);
    expect(NODE_PUSH_ROWS_WRITTEN_EST).toBeGreaterThan(0);
    expect(NODE_PUSH_ROWS_READ_EST).toBeGreaterThan(0);
    expect(LOGIN_ROWS_WRITTEN_EST).toBeGreaterThan(0);
    expect(LOGIN_ROWS_READ_EST).toBeGreaterThan(0);
  });
});

// ───────────────────────── شمارش سهمیه — pull/push/login با UPSERT هم‌روز ─────────────────────────

describe('شمارش سهمیه — هر pull/pushِ احرازشده و هر تلاش ورود (+upsert هم‌روز)', () => {
  it('دو pull → requests+۲ و برآورد ردیف‌ها؛ همه در «یک» ردیف همان روز (upsert جمع‌کننده)', async () => {
    const reg = await registerNode(); // یک ورود مدیر → requests=1
    const before = await quotaRow();
    expect(before).toMatchObject({ requests: 1, rows_written: LOGIN_ROWS_WRITTEN_EST, rows_read_est: LOGIN_ROWS_READ_EST });

    await nodeReq('GET', '/node/pull?domains=announcements', nodeHeaders(reg.code, reg.key));
    await nodeReq('GET', '/node/pull', nodeHeaders(reg.code, reg.key)); // بدون domains = هر سه دامنه

    const after = await quotaRow();
    expect(after?.requests).toBe(3); // ۱ ورود + ۲ pull
    expect(after?.rows_written).toBe(LOGIN_ROWS_WRITTEN_EST + 2 * NODE_PULL_ROWS_WRITTEN_EST);
    expect(after?.rows_read_est).toBe(LOGIN_ROWS_READ_EST + 2 * NODE_PULL_ROWS_READ_EST);

    const rows = await A.db.query<{ day: string }>('SELECT day FROM quota_usage');
    expect(rows).toHaveLength(1); // upsert هم‌روز — نه ردیف تازه
    expect(rows[0]).toMatchObject({ day: todayUtc() });
  });

  it('push روی گات → شمارش می‌خورد؛ پاسخ صامت زیر گات → بدون نوشتن سهمیه (قرارداد m1.5)', async () => {
    const reg = await registerNode();
    await rewindPushSeal(reg.code);
    const pushBody = () => ({
      items: [{ id: 'q-evt-1', domain: 'health_ping', payload: { ok: true } }]
    });

    const ok = await nodeReq('POST', '/node/push', nodeHeaders(reg.code, reg.key), pushBody());
    expect(ok.status).toBe(200);
    const afterOk = await quotaRow();
    expect(afterOk?.requests).toBe(2); // ورود + pushِ روی گات
    expect(afterOk?.rows_written).toBe(LOGIN_ROWS_WRITTEN_EST + NODE_PUSH_ROWS_WRITTEN_EST);
    expect(afterOk?.rows_read_est).toBe(LOGIN_ROWS_READ_EST + NODE_PUSH_ROWS_READ_EST);

    const gated = await nodeReq('POST', '/node/push', nodeHeaders(reg.code, reg.key), pushBody());
    expect(gated.status).toBe(200);
    expect(((gated.body as { data: { throttled: boolean } }).data).throttled).toBe(true);
    const afterGated = await quotaRow();
    expect(afterGated?.requests).toBe(2); // زیر گات پاسخ صامت — سهمیه هم اضافه نمی‌شود
    expect(afterGated?.rows_written).toBe(LOGIN_ROWS_WRITTEN_EST + NODE_PUSH_ROWS_WRITTEN_EST);
  });

  it('تلاش ورود ناموفق هم شمرده می‌شود (موفق/ناموفق = تلاش) — و در failed_logins_24h می‌نشیند', async () => {
    const okLogin = await new Api(A).post('/api/auth/login', { username: 'manager', password: '1234' });
    expect(okLogin.status).toBe(200);
    const badLogin = await new Api(A).post('/api/auth/login', { username: 'manager', password: 'رمز-غلط' });
    expect(badLogin.status).toBe(401);

    const row = await quotaRow();
    expect(row).toMatchObject({ requests: 2, rows_written: 2 * LOGIN_ROWS_WRITTEN_EST, rows_read_est: 2 * LOGIN_ROWS_READ_EST });

    // دید مدیر با همان توکن ورود اول (بدون تلاش ورود اضافه) — شمارش ناموفق در پاکت دیده می‌شود
    const token = (okLogin.body as { data: { token: string } }).data.token;
    const res = await A.app.request(
      '/api/central/quota',
      { headers: { authorization: `Bearer ${token}` } },
      A.env as never,
      FAKE_CTX
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { requests: number; failed_logins_24h: number; percent: Record<string, number> };
    expect(body.requests).toBe(2);
    expect(body.failed_logins_24h).toBe(1);
    expect(body.percent.requests).toBe(0); // ۲ از ۱۰۰هزار — ۰ با یک اعشار
  });

  it('بدنهٔ خرابِ ورود (VALIDATION_ERROR) تلاش نیست و شمرده نمی‌شود؛ ثبت نود مدیریتی هم در سهمیه نیست', async () => {
    const bad = await new Api(A).post('/api/auth/login', { username: '' });
    expect(bad.status).toBe(400);
    expect(await quotaRow()).toBeNull(); // هیچ شمارشی نبوده

    const reg = await registerNode(); // ورود مدیر = ۱؛ ثبت نود (POST /node/register) شمرده نمی‌شود
    const row = await quotaRow();
    expect(row).toMatchObject({ requests: 1, rows_written: LOGIN_ROWS_WRITTEN_EST, rows_read_est: LOGIN_ROWS_READ_EST });
    expect(reg.code).toBe('DESKTOP:quota-node-1');
  });
});

// ───────────────────────── GET /node/reconcile — احراز، سفیدفهرست، شمارش ─────────────────────────

describe('GET /node/reconcile — قرارداد rust-f15 (احراز نود + فهرست سفید pull)', () => {
  it('بی‌هدر / کلید غلط → ۴۰۱ NODE_AUTH_FAILED با request-id و no-store (عین احراز pull)', async () => {
    await registerNode();
    for (const headers of [
      {},
      nodeHeaders('DESKTOP:quota-node-1', 'nk_live_wrongkey_wrongkey_wrongkey_wrong'),
      nodeHeaders('DESKTOP:ghost-node', 'nk_live_somethingelse_somethingelse_someth')
    ]) {
      const res = await nodeReq('GET', '/node/reconcile?domains=announcements', headers);
      expect(res.status).toBe(401);
      expect((res.body as { error: string }).error).toBe('NODE_AUTH_FAILED');
      expect(res.requestId).toMatch(/^req-/);
      expect(res.cacheControl).toBe('no-store');
    }
  });

  it('دامنهٔ بیرون فهرست سفید → ۴۰۰ با پاکت NODE_DOMAIN_FORBIDDEN و فهرست دامنه‌های ممنوع', async () => {
    const reg = await registerNode();
    const res = await nodeReq('GET', '/node/reconcile?domains=patients', nodeHeaders(reg.code, reg.key));
    expect(res.status).toBe(400);
    const body = res.body as { error: string; message: string; details: { domains: string[] } };
    expect(body.error).toBe('NODE_DOMAIN_FORBIDDEN');
    expect(body.details.domains).toEqual(['patients']);

    const mixed = await nodeReq('GET', '/node/reconcile?domains=announcements,students', nodeHeaders(reg.code, reg.key));
    expect(mixed.status).toBe(400);
    expect((mixed.body as { details: { domains: string[] } }).details.domains).toEqual(['students']);
  });

  it('count/max_updated_at بر حسب دامنه — روی همان ردیف‌هایی که pull می‌دهد؛ MAX نرمال ISO ثانیه‌ای', async () => {
    const reg = await registerNode();
    await seedReconcileFixtures();
    const res = await nodeReq(
      'GET',
      '/node/reconcile?domains=announcements,packages,library',
      nodeHeaders(reg.code, reg.key)
    );
    expect(res.status).toBe(200);
    const body = res.body as {
      server_ts: string;
      domains: Array<{ domain: string; count: number; max_updated_at: string | null }>;
    };
    expect(Number.isNaN(Date.parse(body.server_ts))).toBe(false);
    expect(body.domains).toEqual([
      { domain: 'announcements', count: 2, max_updated_at: '2026-11-02T09:00:00Z' },
      { domain: 'packages', count: 1, max_updated_at: '2026-11-03T08:00:00Z' }, // پیش‌نویس شمرده نمی‌شود؛ فرمت فضایی هم نرمال می‌شود
      { domain: 'library', count: 1, max_updated_at: '2026-11-04T07:30:00Z' } // ردیف غیر-cp شمرده نمی‌شود
    ]);
  });

  it('ترتیب دامنه‌های درخواستی حفظ می‌شود؛ بدون domains = هر سه دامنهٔ سفید', async () => {
    const reg = await registerNode();
    await seedReconcileFixtures();
    const ordered = await nodeReq('GET', '/node/reconcile?domains=library,announcements', nodeHeaders(reg.code, reg.key));
    const orderedBody = (ordered.body as { domains: Array<{ domain: string }> }).domains.map((d) => d.domain);
    expect(orderedBody).toEqual(['library', 'announcements']);

    const all = await nodeReq('GET', '/node/reconcile', nodeHeaders(reg.code, reg.key));
    expect(all.status).toBe(200);
    expect((all.body as { domains: Array<{ domain: string }> }).domains.map((d) => d.domain)).toEqual([
      'announcements',
      'packages',
      'library'
    ]);
  });

  it('جدول خالی → count صفر و max_updated_at null (صفر نرم، نه خطا)', async () => {
    const reg = await registerNode();
    const res = await nodeReq('GET', '/node/reconcile?domains=packages', nodeHeaders(reg.code, reg.key));
    expect(res.status).toBe(200);
    expect((res.body as { domains: Array<{ domain: string; count: number; max_updated_at: string | null }> }).domains).toEqual([
      { domain: 'packages', count: 0, max_updated_at: null }
    ]);
  });

  it('reconcile در سهمیه شمرده نمی‌شود (خواندنی نودی سبک) — شمارنده فقط تلاش ورودِ ثبت نود می‌ماند', async () => {
    const reg = await registerNode(); // یک ورود مدیر → requests=1
    await seedReconcileFixtures();
    const res = await nodeReq('GET', '/node/reconcile?domains=announcements', nodeHeaders(reg.code, reg.key));
    expect(res.status).toBe(200);
    const row = await quotaRow();
    expect(row).toMatchObject({ requests: 1, rows_written: LOGIN_ROWS_WRITTEN_EST, rows_read_est: LOGIN_ROWS_READ_EST });
  });
});
