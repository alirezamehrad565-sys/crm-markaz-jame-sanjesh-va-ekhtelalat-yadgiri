/**
 * EXP-8 — نقشهٔ معماری مرکز↔نودها (فقط سمت مرکز): GET /api/central/nodes-map
 *
 * قرارداد: گیت سشن + نقش مدیر (عین /api/central/quota)؛ JSON پاکت چهارکلیدی
 * {server_ts, nodes, quota, center_version}؛ وضعیت هر نود از مُهرهای واقعی رجیستری
 * sync_nodes مشتق می‌شود و فیلدهای بدون منبع مرکزی (pending_push، reconciliation_ok)
 * صادقانه null می‌مانند (آینهٔ وضعیت فقط سمت میز ذخیره می‌شود — rust-f14).
 * ?format=html = صفحهٔ مدیریتی رندر-سروری فارسی RTL بدون هیچ JavaScript (پیشینهٔ
 * text/html در ورکر: گزارش بازی‌ها) — آزمون دود: ردیف نود + راهنمای رنگ‌ها رندر شود.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, asRole, loginToken, type TestApp } from '../../test/harness';
import { APP_VERSION } from '@core/version';
import { nodeMapStateOf, nodeLastSeenOf, NODE_STALE_AFTER_MS } from '../index';

let A: TestApp;

beforeEach(() => {
  A = createTestApp();
});

const FAKE_CTX = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;

async function registerNode(nodeCode: string, label: string | null = null): Promise<{ code: string; key: string }> {
  const api = await asRole(A, 'manager');
  const res = await api.post('/node/register', { node_code: nodeCode, ...(label ? { label } : {}) });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  const body = res.body as { data: { node_code: string; node_key: string } };
  return { code: body.data.node_code, key: body.data.node_key };
}

/** درخواست نودی خام (مُهرها را زنده می‌گذارد) */
async function nodePull(code: string, key: string): Promise<number> {
  const res = await A.app.request(
    '/node/pull?domains=announcements',
    { headers: { 'x-cp-node-code': code, authorization: `Bearer ${key}` } },
    A.env as never,
    FAKE_CTX
  );
  await res.text();
  return res.status;
}

async function nodesMap(token: string, url = '/api/central/nodes-map'): Promise<{ status: number; body: unknown; text: string; contentType: string | null; cacheControl: string | null; csp: string | null }> {
  const res = await A.app.request(url, { headers: { authorization: `Bearer ${token}` } }, A.env as never, FAKE_CTX);
  const text = await res.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, text, contentType: res.headers.get('content-type'), cacheControl: res.headers.get('cache-control'), csp: res.headers.get('content-security-policy') };
}

/** مُهرهای رجیستری را مستقیم تنظیم می‌کند (صادقانه: همان ستون‌هایی که stampNode* می‌نویسد) */
async function stampNode(code: string, fields: { pull?: string | null; pushAttempt?: string | null; pushOk?: string | null }): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.pull !== undefined) { sets.push('last_pull_at = ?'); params.push(fields.pull); }
  if (fields.pushAttempt !== undefined) { sets.push('last_push_attempt_at = ?'); params.push(fields.pushAttempt); }
  if (fields.pushOk !== undefined) { sets.push('last_push_ok_at = ?'); params.push(fields.pushOk); }
  if (sets.length === 0) return;
  params.push(code);
  await A.db.execute(`UPDATE sync_nodes SET ${sets.join(', ')} WHERE node_code = ?`, params);
}

// ───────────────────────── احراز و قرارداد پاکت ─────────────────────────

describe('GET /api/central/nodes-map — گیت و قرارداد پاکت EXP-8 (فقط-مدیر)', () => {
  it('بی‌احراز ۴۰۱ AUTH_ERROR و منشی ۴۰۳ FORBIDDEN — عین گیت quota', async () => {
    await registerNode('DESKTOP:map-auth-1');

    const anon = await A.app.request('/api/central/nodes-map', {}, A.env as never, FAKE_CTX);
    expect(anon.status).toBe(401);
    expect(((await anon.json()) as { error: string }).error).toBe('AUTH_ERROR');
    expect(anon.headers.get('x-request-id')).toMatch(/^req-/);

    const secretary = await asRole(A, 'secretary');
    const denied = await secretary.get('/api/central/nodes-map');
    expect(denied.status).toBe(403);
    expect((denied.body as { error: string }).error).toBe('FORBIDDEN');
  });

  it('مدیر: دقیقاً همین کلیدها — server_ts/nodes/quota/center_version؛ status پنج‌کلیدی با nullهای مستند', async () => {
    const token = await loginToken(A, 'manager');
    const reg = await registerNode('DESKTOP:map-shape-1', 'میز شعبهٔ یک');
    expect((await nodePull(reg.code, reg.key))).toBe(200); // مُهر last_pull_at زنده می‌شود

    const res = await nodesMap(token);
    expect(res.status).toBe(200);
    expect(res.cacheControl).toBe('no-store');

    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['center_version', 'nodes', 'quota', 'server_ts'].sort());
    expect(body.center_version).toBe(APP_VERSION);
    expect(Number.isNaN(Date.parse(body.server_ts as string))).toBe(false);

    const nodes = body.nodes as Array<Record<string, unknown>>;
    expect(nodes).toHaveLength(1);
    expect(Object.keys(nodes[0]).sort()).toEqual(['last_seen', 'name', 'node_id', 'registered_at', 'status'].sort());
    expect(nodes[0].node_id).toBe('DESKTOP:map-shape-1');
    expect(nodes[0].name).toBe('میز شعبهٔ یک');
    expect(typeof nodes[0].registered_at).toBe('string');

    const status = nodes[0].status as Record<string, unknown>;
    expect(Object.keys(status).sort()).toEqual(
      ['last_pull_ok_at', 'last_push_ok_at', 'pending_push', 'reconciliation_ok', 'state'].sort()
    );
    expect(status.state).toBe('synced'); // مُهر pull تازه → سبز
    expect(status.pending_push).toBeNull(); // انبار آینهٔ مرکز وجود ندارد — مستند
    expect(status.reconciliation_ok).toBeNull(); // نتیجهٔ آشتی‌ساز فقط سمت میز است — مستند
    expect(typeof status.last_pull_ok_at).toBe('string');
    expect(status.last_push_ok_at).toBeNull();

    const quota = body.quota as Record<string, unknown>;
    expect(Object.keys(quota).sort()).toEqual(
      ['day', 'percent_requests', 'percent_rows_read', 'percent_rows_written', 'level'].sort()
    );
    expect(quota.day).toBe(new Date().toISOString().slice(0, 10));
    expect(quota.level).toBe('ok');
  });

  it('برچسب ثبت‌نشده → name = خود node_code؛ ترتیب نودها = ترتیب listNodes (تازه‌ترین ثبت اول)', async () => {
    const token = await loginToken(A, 'manager');
    const first = await registerNode('DESKTOP:map-order-1');
    await registerNode('DESKTOP:map-order-2');
    expect((await nodePull(first.code, first.key))).toBe(200);

    const body = (await nodesMap(token)).body as { nodes: Array<{ node_id: string; name: string }> };
    expect(body.nodes.map((n) => n.node_id)).toEqual(['DESKTOP:map-order-2', 'DESKTOP:map-order-1']);
    expect(body.nodes.find((n) => n.node_id === 'DESKTOP:map-order-2')?.name).toBe('DESKTOP:map-order-2');
  });

  it('سهمیه از centralQuotaSnapshot می‌آید — درصد/سطح با ردیف دست‌کاری‌شده هم‌خوان', async () => {
    const token = await loginToken(A, 'manager');
    const today = new Date().toISOString().slice(0, 10);
    await A.db.execute(
      `INSERT INTO quota_usage (day, requests, rows_written, rows_read_est) VALUES (?, 85000, 82000, 4250000)
       ON CONFLICT(day) DO UPDATE SET requests = 85000, rows_written = 82000, rows_read_est = 4250000`,
      [today]
    );

    const body = (await nodesMap(token)).body as { quota: { percent_requests: number; percent_rows_written: number; percent_rows_read: number; level: string } };
    expect(body.quota.percent_requests).toBe(85);
    expect(body.quota.percent_rows_written).toBe(82);
    expect(body.quota.percent_rows_read).toBe(85);
    expect(body.quota.level).toBe('warn'); // هر سه بالای ۸۰ و زیر ۹۵ — سطح زرد
  });
});

// ───────────────────────── مشتق وضعیت از مُهرهای رجیستری ─────────────────────────

describe('status.state از مُهرهای واقعی رجیستری — synced/stale/revoked/never_seen و last_seen', () => {
  it('هرگز تماس نبوده → never_seen؛ مُهر تازهٔ pull → synced؛ مُهر قدیمی → stale؛ باطل → revoked', async () => {
    const token = await loginToken(A, 'manager');
    await registerNode('DESKTOP:map-never');
    const fresh = await registerNode('DESKTOP:map-fresh');
    const stale = await registerNode('DESKTOP:map-stale');
    const revoked = await registerNode('DESKTOP:map-revoked');

    expect((await nodePull(fresh.code, fresh.key))).toBe(200);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
    // مُهر قدیمی مستقیم روی رجیستری (همان ستون‌هایی که stampNode* می‌نویسد)
    await stampNode(stale.code, { pull: twoDaysAgo, pushAttempt: twoDaysAgo, pushOk: twoDaysAgo });

    const api = await asRole(A, 'manager');
    const revRes = await api.post('/node/revoke', { node_code: revoked.code });
    expect(revRes.status).toBe(200);

    const body = (await nodesMap(token)).body as { nodes: Array<{ node_id: string; status: { state: string; last_pull_ok_at: string | null } }> };
    const stateOf = (id: string): string => body.nodes.find((n) => n.node_id === id)?.status.state ?? '?';
    expect(stateOf('DESKTOP:map-never')).toBe('never_seen');
    expect(stateOf('DESKTOP:map-fresh')).toBe('synced');
    expect(stateOf('DESKTOP:map-stale')).toBe('stale');
    expect(stateOf('DESKTOP:map-revoked')).toBe('revoked');
  });

  it('last_seen = تازه‌ترین مُهر تماس (push_ok جدیدتر از pull برنده می‌شود)', async () => {
    const token = await loginToken(A, 'manager');
    const reg = await registerNode('DESKTOP:map-lastseen');
    const pullAt = new Date(Date.now() - 3600_000).toISOString();
    const pushOkAt = new Date(Date.now() - 60_000).toISOString();
    await stampNode(reg.code, { pull: pullAt, pushOk: pushOkAt });

    const body = (await nodesMap(token)).body as { nodes: Array<{ node_id: string; last_seen: string | null; status: { last_pull_ok_at: string | null; last_push_ok_at: string | null } }> };
    const node = body.nodes.find((n) => n.node_id === reg.code);
    expect(node?.last_seen).toBe(pushOkAt);
    expect(node?.status.last_pull_ok_at).toBe(pullAt);
    expect(node?.status.last_push_ok_at).toBe(pushOkAt);
  });

  it('توابع محض: مرز stale دقیقاً NODE_STALE_AFTER_MS و مُهر خراب نادیده گرفته می‌شود', () => {
    expect(NODE_STALE_AFTER_MS).toBe(24 * 3600_000);
    const now = new Date('2026-11-14T10:00:00.000Z');
    const exactlyStale = new Date(now.getTime() - NODE_STALE_AFTER_MS - 1).toISOString();
    const justFresh = new Date(now.getTime() - NODE_STALE_AFTER_MS + 60_000).toISOString();
    expect(nodeMapStateOf(true, exactlyStale, now)).toBe('stale');
    expect(nodeMapStateOf(true, justFresh, now)).toBe('synced');
    expect(nodeMapStateOf(false, justFresh, now)).toBe('revoked');
    expect(nodeMapStateOf(true, null, now)).toBe('never_seen');
    expect(nodeMapStateOf(true, 'نامعتبر', now)).toBe('never_seen');

    expect(nodeLastSeenOf(null, null, null)).toBeNull();
    expect(nodeLastSeenOf('2026-11-13T08:00:00Z', 'نامعتبر', '2026-11-14T07:30:00Z')).toBe('2026-11-14T07:30:00Z');
    expect(nodeLastSeenOf('2026-11-13T08:00:00Z', null, null)).toBe('2026-11-13T08:00:00Z');
  });
});

// ───────────────────────── صفحهٔ HTML رندر-سروری (?format=html) ─────────────────────────

describe('GET /api/central/nodes-map?format=html — صفحهٔ مدیریتی بدون JavaScript (دود)', () => {
  it('مدیر: text/html با dir=rtl، ردیف نودها، نوار سهمیه و راهنمای رنگ‌ها — بدون هیچ <script', async () => {
    const token = await loginToken(A, 'manager');
    const fresh = await registerNode('DESKTOP:map-html-fresh', 'میز HTML سبز');
    const stale = await registerNode('DESKTOP:map-html-stale', 'میز HTML زرد');
    expect((await nodePull(fresh.code, fresh.key))).toBe(200);
    await stampNode(stale.code, { pull: new Date(Date.now() - 3 * 24 * 3600_000).toISOString() });

    const res = await nodesMap(token, '/api/central/nodes-map?format=html');
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/html');
    expect(res.cacheControl).toBe('no-store');
    expect(res.text).toContain('dir="rtl"');
    expect(res.text).toContain('lang="fa"');
    expect(res.text).not.toContain('<script');
    expect(res.text.toLowerCase()).not.toContain('onload=');

    // ردیف هر دو نود + وضعیت‌های رنگی + راهنما + نوار سهمیه
    expect(res.text).toContain('میز HTML سبز');
    expect(res.text).toContain('میز HTML زرد');
    expect(res.text).toContain('DESKTOP:map-html-fresh');
    expect(res.text).toContain('هم‌گام');
    expect(res.text).toContain('بی‌تماس');
    expect(res.text).toContain('راهنمای رنگ‌ها');
    expect(res.text).toContain('سهمیهٔ روز');
    expect(res.text).toContain('مرکز ↔ نودها');
    // CSP سخت بدون اسکریپت — هم‌خانوادهٔ پیشینهٔ text/html ورکر (هدر پاسخ، نه بدنه)
    expect(res.csp).toContain("default-src 'none'");
    expect(res.csp).not.toContain('script-src');
    // گریز HTML: برچسب با کاراکتر خاص به‌درستی گریز می‌شود
    const sneaky = await asRole(A, 'manager');
    await sneaky.post('/node/register', { node_code: 'DESKTOP:map-html-esc', label: '<b>&مخفی' });
    const esc = await nodesMap(token, '/api/central/nodes-map?format=html');
    expect(esc.text).toContain('&lt;b&gt;&amp;مخفی');
    expect(esc.text).not.toContain('<b>&مخفی');
  });

  it('گیت HTML هم همان گیت سشن است — بی‌احراز ۴۰۱ و فهرست خالی پیام نرم دارد', async () => {
    const anon = await A.app.request('/api/central/nodes-map?format=html', {}, A.env as never, FAKE_CTX);
    expect(anon.status).toBe(401);

    const token = await loginToken(A, 'manager');
    const empty = await nodesMap(token, '/api/central/nodes-map?format=html');
    expect(empty.status).toBe(200);
    expect(empty.text).toContain('هنوز نودی ثبت نشده است');
  });
});
