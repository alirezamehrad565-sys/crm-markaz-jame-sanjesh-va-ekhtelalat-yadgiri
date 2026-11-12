/**
 * گیت‌های قرارداد سینک ترکیبی نودهای دسکتاپ (rust-f4) — سمت ورکر
 * سند مرجع: docs/rust/node-sync.md · طراحی: docs/rust/design.md §۵ · phases.md فاز ۴
 * همهٔ تست‌ها با اپ کامل (createTestApp — زیراپ /node روی همان مسیر تولید سوار است) و
 * MockD1 (SQLite واقعی)؛ تست مُهر تلاش با زیراپ مستقیم و ساعت تزریقی.
 * پوشش: احراز درست/رد کلید بد · سفید-فهرستی (patients → رد صریح) · idempotency ·
 * cursor صفحه‌بندی و پایداری · مُهر تلاش (پاسخ صامت/بدون رشد لاگ) · drill کلید غایب/
 * ۴۰۱ تمیز · ۴۰۴ کم‌دست · ثبت فقط-مدیر با audit.
 */
import { describe, it, expect } from 'vitest';
import { createTestApp, asRole, MANAGER_ID, type TestApp } from '../../test/harness';
import { createAuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import {
  createNodeSyncApp,
  NODE_PUSH_BODY_MAX_BYTES,
  decodeNodeCursor,
  encodeNodeCursor,
  generateNodeKey,
  shouldAttemptNodePush,
  timingSafeHexEqual
} from '../index';

const FAKE_CTX = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;

interface RawOutcome {
  status: number;
  body: unknown;
  requestId: string | null;
  cacheControl: string | null;
}

async function nodeReq(
  A: TestApp,
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
async function registerNode(
  A: TestApp,
  nodeCode = 'DESKTOP:test-node-1',
  label = 'میز پذیرش'
): Promise<{ code: string; key: string; fingerprint: string }> {
  const api = await asRole(A, 'manager');
  const res = await api.post('/node/register', { node_code: nodeCode, label });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  const body = res.body as { data: { node_code: string; node_key: string; key_fingerprint: string } };
  return { code: body.data.node_code, key: body.data.node_key, fingerprint: body.data.key_fingerprint };
}

async function insertAnnouncement(A: TestApp, id: string, updatedAt: string): Promise<void> {
  await A.db.execute(
    `INSERT INTO announcements (id, title, body, show_login, show_panel, active, created_by, created_at, updated_at)
     VALUES (?, 'اعلان سینک', 'متن اعلان', 1, 1, 1, ?, ?, ?)`,
    [id, MANAGER_ID, updatedAt, updatedAt]
  );
}

async function seedPullFixtures(A: TestApp): Promise<void> {
  await insertAnnouncement(A, 'ns-ann-1', '2026-11-01T10:00:00.000Z');
  await A.db.execute(
    `INSERT INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, updated_at)
     VALUES ('numsense', '1.2.0', 'حس عدد', 'A', '{"days_per_week":3}', 'published',
             '{"package_id":"numsense","missions":[{"id":"m1"}]}', '2026-11-02 09:00:00')`
  );
  await A.db.execute(
    `INSERT INTO network_content (id, kind, title, summary, body, tags, origin, status, source_center, active, updated_at)
     VALUES ('cp-content-9', 'exercise', 'بستهٔ برگزیده', 'خلاصه', '{"steps":[1]}', '["دقت"]', 'cp', 'published', 'sanjesh-center', 1, '2026-11-03 10:00:00')`
  );
}

/** بازگرداندن مُهر تلاش push به عقب — برای عبور از گات در e2e (هم‌الگوی «دورهٔ بعد») */
async function rewindPushSeal(A: TestApp, nodeCode: string, minutesAgo = 16): Promise<void> {
  const past = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  await A.db.execute(`UPDATE sync_nodes SET last_push_attempt_at = ? WHERE node_code = ?`, [past, nodeCode]);
}

function countingLogger(): { logger: Logger; names: string[] } {
  const names: string[] = [];
  const logger: Logger = {
    debug: () => undefined,
    info: (msg: string) => { names.push(msg); },
    warn: (msg: string) => { names.push(msg); },
    error: (msg: string) => { names.push(msg); },
    child: () => logger
  };
  return { logger, names };
}

// ───────────────────────── ثبت نود فقط-مدیر ─────────────────────────

describe('node-sync: ثبت نود فقط-مدیر (پیوند دستی)', () => {
  it('مدیر نود را ثبت می‌کند — plaintext فقط یک‌بار؛ در DB فقط هش؛ audit بدون کلید', async () => {
    const A = createTestApp();
    const api = await asRole(A, 'manager');
    const res = await api.post('/node/register', { node_code: 'DESKTOP:abc-123', label: 'میز درمانگر' });
    expect(res.status).toBe(201);
    const data = (res.body as { data: { node_code: string; node_key: string; key_fingerprint: string; created_at: string } }).data;
    expect(data.node_code).toBe('DESKTOP:abc-123');
    expect(data.node_key).toMatch(/^nk_live_[A-Za-z0-9]{40}$/);
    expect(data.key_fingerprint).toHaveLength(12);

    const row = await A.db.queryOne<{ key_hash: string; key_fingerprint: string; active: number }>(
      'SELECT key_hash, key_fingerprint, active FROM sync_nodes WHERE node_code = ?',
      ['DESKTOP:abc-123']
    );
    expect(row).not.toBeNull();
    expect(row?.key_hash).toHaveLength(64);
    expect(row?.key_hash).not.toBe(data.node_key); // plaintext هرگز ذخیره نمی‌شود
    expect(row?.key_fingerprint).toBe(data.key_fingerprint);
    expect(row?.active).toBe(1);

    const auditRow = await A.db.queryOne<{ changes: string }>(
      "SELECT changes FROM audit_log WHERE action = 'node.register' ORDER BY created_at DESC LIMIT 1"
    );
    expect(auditRow).not.toBeNull();
    expect(auditRow?.changes ?? '').toContain(data.key_fingerprint);
    expect(auditRow?.changes ?? '').not.toContain(data.node_key); // کلید در audit نیست
  });

  it('غیرمدیر ۴۰۳ و بی‌احراز ۴۰۱ می‌گیرد؛ کد بدشکل ۴۰۰؛ تکراری ۴۰۹', async () => {
    const A = createTestApp();
    const secretary = await asRole(A, 'secretary');
    const sRes = await secretary.post('/node/register', { node_code: 'DESKTOP:abc-123' });
    expect(sRes.status).toBe(403);

    const anon = await nodeReq(A, 'POST', '/node/register', {}, { node_code: 'DESKTOP:abc-123' });
    expect(anon.status).toBe(401);

    const manager = await asRole(A, 'manager');
    const bad = await manager.post('/node/register', { node_code: 'laptop-1' }); // بدون پیشوند DESKTOP:
    expect(bad.status).toBe(400);
    expect((bad.body as { error: string }).error).toBe('VALIDATION_ERROR');

    await manager.post('/node/register', { node_code: 'DESKTOP:abc-123' });
    const dup = await manager.post('/node/register', { node_code: 'DESKTOP:abc-123' });
    expect(dup.status).toBe(409);
    expect((dup.body as { error: string }).error).toBe('CONFLICT');
  });

  it('فهرست نودها فقط‌مدیر — بدون هش و بدون plaintext', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    const manager = await asRole(A, 'manager');
    const res = await manager.get('/node/nodes');
    expect(res.status).toBe(200);
    const nodes = (res.body as { data: { nodes: Array<Record<string, unknown>> } }).data.nodes;
    const mine = nodes.find((n) => n.node_code === reg.code);
    expect(mine).toBeTruthy();
    expect(mine?.key_fingerprint).toBe(reg.fingerprint);
    expect(JSON.stringify(res.body)).not.toContain(reg.key);
    expect(JSON.stringify(res.body)).not.toContain('key_hash');

    const secretary = await asRole(A, 'secretary');
    const denied = await secretary.get('/node/nodes');
    expect(denied.status).toBe(403);
  });

  it('rotate-key: کلید کهنه بی‌درنگ باطل و کلید تازه کار می‌کند (سیاست CP-6) + audit', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    const manager = await asRole(A, 'manager');

    const res = await manager.post('/node/rotate-key', { node_code: reg.code });
    expect(res.status).toBe(200);
    const newKey = (res.body as { data: { node_key: string; key_fingerprint: string } }).data.node_key;
    expect(newKey).not.toBe(reg.key);

    const oldPull = await nodeReq(A, 'GET', '/node/pull?domains=announcements', nodeHeaders(reg.code, reg.key));
    expect(oldPull.status).toBe(401);
    const newPull = await nodeReq(A, 'GET', '/node/pull?domains=announcements', nodeHeaders(reg.code, newKey));
    expect(newPull.status).toBe(200);

    const auditRow = await A.db.queryOne<{ action: string }>(
      "SELECT action FROM audit_log WHERE action = 'node.rotate_key' ORDER BY created_at DESC LIMIT 1"
    );
    expect(auditRow?.action).toBe('node.rotate_key');
  });

  it('revoke: نود باطل‌شده در نخستین درخواست ۴۰۱ می‌گیرد', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    const manager = await asRole(A, 'manager');
    const res = await manager.post('/node/revoke', { node_code: reg.code });
    expect(res.status).toBe(200);
    const pull = await nodeReq(A, 'GET', '/node/pull?domains=announcements', nodeHeaders(reg.code, reg.key));
    expect(pull.status).toBe(401);
  });
});

// ───────────────────────── احراز نود (هم‌قرارداد cp-link) ─────────────────────────

describe('node-sync: احراز نود — ۴۰۱ تمیز و یک‌شکل', () => {
  it('بدون هدر / کلید غلط / کد ناشناس — همه یک پاکت NODE_AUTH_FAILED با request-id', async () => {
    const A = createTestApp();
    await registerNode(A);
    for (const headers of [
      {},
      nodeHeaders('DESKTOP:test-node-1', 'nk_live_wrongkey_wrongkey_wrongkey_wrong'),
      nodeHeaders('DESKTOP:ghost-node', 'nk_live_somethingelse_somethingelse_someth')
    ]) {
      const res = await nodeReq(A, 'GET', '/node/pull?domains=announcements', headers);
      expect(res.status).toBe(401);
      expect((res.body as { error: string }).error).toBe('NODE_AUTH_FAILED');
      // پاسخ تمیز: هیچ نشانه‌ای از علت رد، و هیچ نشانی از داده‌ها
      expect(JSON.stringify(res.body)).not.toContain('announcements');
      expect(res.requestId).toMatch(/^req-/);
      expect(res.cacheControl).toBe('no-store');
    }
  });

  it('drill کلید غایب روی ۴۰۱ تمیز — هیچ مسیری نمی‌شکند (حکم م۲۱۰: نود فقط warn و دورهٔ بعد)', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    const res = await nodeReq(A, 'GET', '/node/pull', nodeHeaders(reg.code, reg.key));
    expect(res.status).toBe(200);
    const bad = await nodeReq(A, 'GET', '/node/pull', nodeHeaders(reg.code, ''));
    expect(bad.status).toBe(401);
    expect((bad.body as { error: string }).error).toBe('NODE_AUTH_FAILED');
  });

  it('گیت سشن کارمندان روی مسیر نود ننشسته — زیراپ پیش از authMiddleware است (زنجیرهٔ §۵)', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    // توکن بیرحمانهٔ سشن‌نما: اگر گیت سشن روی /node/* بود، ۴۰۱ AUTH_ERROR می‌داد
    const res = await nodeReq(A, 'GET', '/node/pull?domains=announcements', {
      authorization: 'Bearer not-a-session-token'
    });
    expect(res.status).toBe(401);
    expect((res.body as { error: string }).error).toBe('NODE_AUTH_FAILED');
    // و با اعتبار نود، حتی بدون هیچ سشنی، درگاه باز است
    const ok = await nodeReq(A, 'GET', '/node/pull?domains=announcements', nodeHeaders(reg.code, reg.key));
    expect(ok.status).toBe(200);
  });
});

// ───────────────────────── pull — سفیدفهرستی و cursor ─────────────────────────

describe('node-sync: pull سفیدفهرستی و پاکت', () => {
  it('دامنهٔ بالینی patients → رد صریح ۴۰۳ با کد NODE_DOMAIN_FORBIDDEN', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    const res = await nodeReq(A, 'GET', '/node/pull?domains=patients', nodeHeaders(reg.code, reg.key));
    expect(res.status).toBe(403);
    const body = res.body as { error: string; details: { domains: string[] } };
    expect(body.error).toBe('NODE_DOMAIN_FORBIDDEN');
    expect(body.details.domains).toEqual(['patients']);
    // مخلوط: یکی سفید، یکی ممنوع → باز هم رد صریح (fail-closed)
    const mixed = await nodeReq(A, 'GET', '/node/pull?domains=announcements,students', nodeHeaders(reg.code, reg.key));
    expect(mixed.status).toBe(403);
    expect((mixed.body as { details: { domains: string[] } }).details.domains).toEqual(['students']);
  });

  it('pull پیش‌فرض هر سه دامنهٔ سفید با شکل پاکت درست', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    await seedPullFixtures(A);
    const res = await nodeReq(A, 'GET', '/node/pull', nodeHeaders(reg.code, reg.key));
    expect(res.status).toBe(200);
    const data = (res.body as { data: { items: Array<{ id: string; domain: string; updated_at: string; payload: Record<string, unknown> }>; next_cursor: string | null; server_time: string } }).data;
    const ann = data.items.find((it) => it.domain === 'announcements');
    const pkg = data.items.find((it) => it.domain === 'packages');
    const lib = data.items.find((it) => it.domain === 'library');
    expect(ann).toBeTruthy();
    expect(pkg).toBeTruthy();
    expect(lib).toBeTruthy();

    expect(ann?.payload).toMatchObject({ title: 'اعلان سینک', show_login: true, show_panel: true });
    expect(ann?.updated_at).toBe('2026-11-01T10:00:00Z'); // نرمال ISO — با فرمت‌های دوگانهٔ ستون‌ها یکدست
    expect(pkg?.id).toBe('numsense@1.2.0');
    expect(pkg?.payload).toMatchObject({ title_fa: 'حس عدد', evidence_level: 'A', status: 'published' });
    expect((pkg?.payload.dose as Record<string, unknown>).days_per_week).toBe(3);
    expect(lib?.payload).toMatchObject({ kind: 'exercise', title: 'بستهٔ برگزیده', source_center: 'sanjesh-center' });
    expect(lib?.payload.tags).toEqual(['دقت']);
    expect(data.next_cursor).toBeNull(); // کمتر از حد صفحه — پایان
    expect(data.server_time).toBeTruthy();
  });

  it('فیلتر domains=announcements فقط همان دامنه را می‌دهد', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    await seedPullFixtures(A);
    const res = await nodeReq(A, 'GET', '/node/pull?domains=announcements', nodeHeaders(reg.code, reg.key));
    const data = (res.body as { data: { items: Array<{ domain: string }> } }).data;
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.every((it) => it.domain === 'announcements')).toBe(true);
  });

  it('cursor صفحه‌بندی — سه صفحه، بدون دوباره، مجموع کامل؛ cursor خراب ۴۰۰', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    for (let i = 1; i <= 5; i += 1) {
      await insertAnnouncement(A, `ns-page-${i}`, `2026-11-01T10:0${i}:00.000Z`);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const url = `/node/pull?domains=announcements&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await nodeReq(A, 'GET', url, nodeHeaders(reg.code, reg.key));
      expect(res.status).toBe(200);
      const data = (res.body as { data: { items: Array<{ id: string }>; next_cursor: string | null } }).data;
      seen.push(...data.items.map((it) => it.id));
      cursor = data.next_cursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5); // هیچ دوباره‌ای
    expect(seen.sort()).toEqual(['ns-page-1', 'ns-page-2', 'ns-page-3', 'ns-page-4', 'ns-page-5']);

    const badCursor = await nodeReq(
      A,
      'GET',
      `/node/pull?domains=announcements&cursor=${encodeURIComponent('not-a-cursor!')}`,
      nodeHeaders(reg.code, reg.key)
    );
    expect(badCursor.status).toBe(400);
    expect((badCursor.body as { error: string }).error).toBe('NODE_CURSOR_INVALID');
  });

  it('پایداری cursor — درج آیتم تازه بین صفحات نه skip می‌دهد نه دوباره (کلیدset)', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    for (let i = 1; i <= 4; i += 1) {
      await insertAnnouncement(A, `ns-stable-${i}`, `2026-11-01T10:0${i}:00.000Z`);
    }
    const page1 = await nodeReq(A, 'GET', '/node/pull?domains=announcements&limit=2', nodeHeaders(reg.code, reg.key));
    const d1 = (page1.body as { data: { items: Array<{ id: string }>; next_cursor: string } }).data;
    expect(d1.items.map((i) => i.id)).toEqual(['ns-stable-1', 'ns-stable-2']);
    // درج تازه وسط صفحه‌بندی — بزرگ‌تر از همه؛ باید در انتها بیاید نه وسط
    await insertAnnouncement(A, 'ns-stable-new', '2026-11-09T10:00:00.000Z');
    const page2 = await nodeReq(A, 'GET', `/node/pull?domains=announcements&limit=10&cursor=${encodeURIComponent(d1.next_cursor)}`, nodeHeaders(reg.code, reg.key));
    const d2 = (page2.body as { data: { items: Array<{ id: string }>; next_cursor: string | null } }).data;
    expect(d2.items.map((i) => i.id)).toEqual(['ns-stable-3', 'ns-stable-4', 'ns-stable-new']);
    expect(d2.next_cursor).toBeNull();
  });
});

// ───────────────────────── push — سفیدفهرستی، idempotency، مُهر تلاش ─────────────────────────

describe('node-sync: push سفیدفهرستی و idempotency', () => {
  function pushBody() {
    return {
      items: [
        { id: 'evt-usage-1', domain: 'usage_summary', at: '2026-11-12T08:00:00.000Z', payload: { sessions: 12, minutes: 240 } },
        { id: 'evt-err-1', domain: 'client_errors', payload: { message: 'TypeError: x is undefined', stack: 'at f()', app_version: '1.25.75' } },
        { id: 'evt-ping-1', domain: 'health_ping', payload: { ok: true, version: '1.25.75', counters: { restarts: 0 } } }
      ]
    };
  }

  it('push سالم → accepted؛ ردیف‌ها در node_push_events؛ مُهر ok ثبت می‌شود', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    const res = await nodeReq(A, 'POST', '/node/push', nodeHeaders(reg.code, reg.key), pushBody());
    expect(res.status).toBe(200);
    const data = (res.body as { data: { accepted: number; duplicates: number; throttled: boolean } }).data;
    expect(data).toMatchObject({ accepted: 3, duplicates: 0, throttled: false });

    const rows = await A.db.query<{ domain: string; payload: string }>('SELECT domain, payload FROM node_push_events WHERE node_code = ?', [reg.code]);
    expect(rows).toHaveLength(3);
    const usage = JSON.parse(rows.find((r) => r.domain === 'usage_summary')?.payload ?? '{}') as Record<string, unknown>;
    expect(usage).toMatchObject({ sessions: 12, minutes: 240 });

    const node = await A.db.queryOne<{ last_push_ok_at: string | null; last_pull_at: string | null }>(
      'SELECT last_push_ok_at, last_pull_at FROM sync_nodes WHERE node_code = ?',
      [reg.code]
    );
    expect(node?.last_push_ok_at).toBeTruthy();
    expect(node?.last_pull_at).toBeNull(); // pull هنوز نداشته
  });

  it('idempotency — push دوباره با همان (node_code,id) → بدون دوپلیکیکت', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    await nodeReq(A, 'POST', '/node/push', nodeHeaders(reg.code, reg.key), pushBody());
    await rewindPushSeal(A, reg.code); // عبور از گات ۱۵دقیقه‌ای برای رسیدن به لایهٔ idempotency
    const res = await nodeReq(A, 'POST', '/node/push', nodeHeaders(reg.code, reg.key), pushBody());
    expect(res.status).toBe(200);
    const data = (res.body as { data: { accepted: number; duplicates: number } }).data;
    expect(data.accepted).toBe(0);
    expect(data.duplicates).toBe(3);
    const rows = await A.db.query('SELECT id FROM node_push_events WHERE node_code = ?', [reg.code]);
    expect(rows).toHaveLength(3); // هیچ ردیف تازه‌ای
  });

  it('دامنهٔ بالینی patients در push → ۴۰۳ صریح و صفر ردیف (fail-closed)', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    const res = await nodeReq(A, 'POST', '/node/push', nodeHeaders(reg.code, reg.key), {
      items: [
        { id: 'clinical-1', domain: 'patients', payload: { name: 'علی' } },
        { id: 'clinical-2', domain: 'students', payload: { name: 'سارا' } }
      ]
    });
    expect(res.status).toBe(403);
    const body = res.body as { error: string; details: { domains: string[] } };
    expect(body.error).toBe('NODE_DOMAIN_FORBIDDEN');
    expect(body.details.domains.sort()).toEqual(['patients', 'students']);
    const rows = await A.db.query('SELECT id FROM node_push_events');
    expect(rows).toHaveLength(0); // حتی یک بایت هم نوشته نشد
  });

  it('payload نامعتبر بر حسب دامنه → ۴۰۰ VALIDATION_ERROR (usage_summary فقط-عددی)', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    const res = await nodeReq(A, 'POST', '/node/push', nodeHeaders(reg.code, reg.key), {
      items: [{ id: 'evt-bad-1', domain: 'usage_summary', payload: { sessions: 'خیلی' } }]
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('VALIDATION_ERROR');
  });

  it('سقف بدنهٔ push → ۴۰۰ NODE_BODY_TOO_LARGE', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    const res = await nodeReq(A, 'POST', '/node/push', {
      ...nodeHeaders(reg.code, reg.key),
      'content-length': String(NODE_PUSH_BODY_MAX_BYTES + 1)
    }, { items: [{ id: 'evt-x', domain: 'health_ping', payload: { ok: true } }] });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('NODE_BODY_TOO_LARGE');
  });
});

// ───────────────────────── مُهر تلاش (نویز-سپر m1.5) ─────────────────────────

describe('node-sync: مُهر تلاش push — زیر گات پاسخ صامت و بدون رشد لاگ', () => {
  it('e2e: push دوم زیر ۱۵ دقیقه → ۲۰۰ throttled؛ صفر ردیف تازه؛ audit_log رشد نمی‌کند', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    const pushBodyOf = () => ({ items: [{ id: 'ping-x', domain: 'health_ping', payload: { ok: true } }] });
    const first = await nodeReq(A, 'POST', '/node/push', nodeHeaders(reg.code, reg.key), pushBodyOf());
    expect((first.body as { data: { throttled: boolean } }).data.throttled).toBe(false);

    const rowsBefore = (await A.db.query('SELECT id FROM node_push_events')).length;
    const auditBefore = (await A.db.query('SELECT id FROM audit_log')).length;

    const second = await nodeReq(A, 'POST', '/node/push', nodeHeaders(reg.code, reg.key), pushBodyOf());
    expect(second.status).toBe(200);
    const data = (second.body as { data: { accepted: number; throttled: boolean; retry_after_s: number | null } }).data;
    expect(data.throttled).toBe(true);
    expect(data.accepted).toBe(0);
    expect(data.retry_after_s).toBeGreaterThan(0);

    expect((await A.db.query('SELECT id FROM node_push_events')).length).toBe(rowsBefore); // بدون رشد داده
    expect((await A.db.query('SELECT id FROM audit_log')).length).toBe(auditBefore); // بدون رشد ممیزی
  });

  it('ساعت تزریقی: زیر گات = صامت (بدون هیچ لاگ/نوشتن)؛ روی گات = پذیرش — همان الگوی m1.5', async () => {
    const A = createTestApp();
    const reg = await registerNode(A);
    const { logger, names } = countingLogger();
    let current = new Date('2026-11-12T08:00:00.000Z');
    const app = createNodeSyncApp({ db: A.db, audit: createAuditWriter(A.db), logger, now: () => current });

    const callPush = async (): Promise<Response> =>
      app.request('/push', {
        method: 'POST',
        headers: nodeHeaders(reg.code, reg.key),
        body: JSON.stringify({ items: [{ id: 'ping-1', domain: 'health_ping', payload: { ok: true } }] })
      });

    // تلاش اول — پذیرش + لاگ
    const r1 = await callPush();
    expect(((await r1.json()) as { data: { throttled: boolean } }).data.throttled).toBe(false);
    expect(names.filter((n) => n === 'node_sync.push')).toHaveLength(1);
    expect(names.some((n) => n === 'node_sync.auth_failed')).toBe(false);

    // تلاش دوم بعد از ۱ دقیقه — صامت: نه لاگ، نه نوشتن
    current = new Date('2026-11-12T08:01:00.000Z');
    const r2 = await callPush();
    expect(((await r2.json()) as { data: { throttled: boolean } }).data.throttled).toBe(true);
    expect(names).toHaveLength(1); // رشد لاگ صفر

    // ردیف تازه‌ای هم نیست
    const rows = await A.db.query('SELECT id FROM node_push_events WHERE node_code = ?', [reg.code]);
    expect(rows).toHaveLength(1);

    // دورهٔ بعد (۱۶ دقیقه بعد) — دوباره پذیرش و لاگ
    current = new Date('2026-11-12T08:16:00.000Z');
    const r3 = await callPush();
    expect(((await r3.json()) as { data: { throttled: boolean } }).data.throttled).toBe(false);
    expect(names.filter((n) => n === 'node_sync.push')).toHaveLength(2);
  });

  it('shouldAttemptNodePush — مُهر غایب/خراب = اجازه؛ زیر گات = رد (هم‌قرارداد shouldAttemptCpSync)', () => {
    const now = new Date('2026-11-12T08:00:00.000Z');
    expect(shouldAttemptNodePush(null, now)).toBe(true);
    expect(shouldAttemptNodePush('garbage', now)).toBe(true);
    expect(shouldAttemptNodePush(new Date(now.getTime() - 14 * 60_000).toISOString(), now)).toBe(false);
    expect(shouldAttemptNodePush(new Date(now.getTime() - 15 * 60_000).toISOString(), now)).toBe(true);
    expect(shouldAttemptNodePush(new Date(now.getTime() - 16 * 60_000).toISOString(), now)).toBe(true);
  });
});

// ───────────────────────── استقلال و ۴۰۴ کم‌دست ─────────────────────────

describe('node-sync: ۴۰۴ کم‌دست و ابزارهای محض', () => {
  it('مسیر ناشناختهٔ زیر /node → ۴۰۴ بدون هیچ جزئیات مسیر', async () => {
    const A = createTestApp();
    const res = await nodeReq(A, 'GET', '/node/definitely-not-here');
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe('NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toContain('definitely-not-here'); // کم‌دست
  });

  it('timingSafeHexEqual — درست/غلط/طول‌متفاوت', () => {
    expect(timingSafeHexEqual('aabb', 'aabb')).toBe(true);
    expect(timingSafeHexEqual('aabb', 'aabc')).toBe(false);
    expect(timingSafeHexEqual('aabb', 'aab')).toBe(false);
  });

  it('cursor codec — رفت و برگشت؛ خراب → null؛ گارد طول', () => {
    const cur = { d: 'announcements', t: '2026-11-01T10:00:00Z', i: 'ns-ann-1' };
    const enc = encodeNodeCursor(cur);
    expect(decodeNodeCursor(enc)).toEqual(cur);
    expect(decodeNodeCursor('')).toBeNull();
    expect(decodeNodeCursor(undefined)).toBeNull();
    expect(decodeNodeCursor('!!!not-base64!!!')).toBeNull();
    expect(decodeNodeCursor(encodeNodeCursor({ d: 'x', t: '', i: 'y' }))).toBeNull(); // t خالی نامعتبر
    expect(decodeNodeCursor('a'.repeat(600))).toBeNull();
  });

  it('generateNodeKey — پیشوند nk_live_، هش ۶۴ کاراکتر، اثر انگشت ۱۲', async () => {
    const k = await generateNodeKey();
    expect(k.token).toMatch(/^nk_live_[A-Za-z0-9]{40}$/);
    expect(k.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(k.fingerprint).toBe(k.keyHash.slice(0, 12));
    const k2 = await generateNodeKey();
    expect(k2.token).not.toBe(k.token); // یکتایی
  });
});
