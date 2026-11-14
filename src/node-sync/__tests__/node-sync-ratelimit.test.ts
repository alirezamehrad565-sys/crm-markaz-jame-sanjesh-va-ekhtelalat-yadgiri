/**
 * EXP-7 — محدودساز نرخ per-node روی /node/pull، /node/push و /node/reconcile (سمت ورکر)
 *
 * قرارداد: پنجرهٔ لغزان per-node درون‌حافظه (پیش‌فرض ۱۲۰ درخواست در دقیقه بر node_code؛
 * env «۰» = خاموش)؛ عبور از سقف = ۴۲۹ با پاکت استاندارد RATE_LIMITED + Retry-After و
 * «یک ردیف audit به‌ازای هر ۴۲۹». قرارداد پاسخ pull/push/reconcile زیر سقف دست‌نخورده
 * می‌ماند — این لایه فقط مسیر ۴۲۹ تازه اضافه می‌کند. کلیدها مستقل‌اند (نودهای مختلف
 * هم‌پوشانی سهمیه ندارند) و مسیرهای غیرنودی (مدیریتی) از این گیت عبور می‌کنند.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createTestApp, silentLogger, asRole, type TestApp } from '../../test/harness';
import { createAuditWriter } from '@core/audit';
import { errorHandler } from '@app/http';
import {
  makeNodeSlidingWindowLimiter,
  parseNodeRateLimitPerMin,
  NODE_RATE_LIMIT_PER_MIN_DEFAULT,
  NODE_RATE_LIMIT_PER_MIN_MAX,
  NODE_RATE_LIMIT_WINDOW_MS
} from '../index';
import { createNodeSyncApp } from '../app';

let A: TestApp;

beforeEach(() => {
  A = createTestApp();
});

const FAKE_CTX = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;

interface RawOutcome {
  status: number;
  body: unknown;
  requestId: string | null;
  retryAfter: string | null;
  cacheControl: string | null;
}

/** درخواست خام نودی (بدون سشن) — هم‌الگوی node-sync-quota.test.ts */
async function nodeReq(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string> = {},
  body?: unknown,
  env: Record<string, unknown> = A.env as unknown as Record<string, unknown>
): Promise<RawOutcome> {
  const res = await A.app.request(
    url,
    {
      method,
      headers: body !== undefined ? { ...headers, 'content-type': 'application/json' } : headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    },
    env as never,
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
    retryAfter: res.headers.get('retry-after'),
    cacheControl: res.headers.get('cache-control')
  };
}

function nodeHeaders(code: string, key: string): Record<string, string> {
  return { 'x-cp-node-code': code, authorization: `Bearer ${key}` };
}

/** ثبت نود با ورود مدیر — کلید plaintext فقط همین‌جا در دست تست است */
async function registerNode(nodeCode: string, label = 'میز محدودساز'): Promise<{ code: string; key: string }> {
  const api = await asRole(A, 'manager');
  const res = await api.post('/node/register', { node_code: nodeCode, label });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  const body = res.body as { data: { node_code: string; node_key: string } };
  return { code: body.data.node_code, key: body.data.node_key };
}

/** ردیف ممیزی محدودساز برای یک نود */
async function rateLimitedAuditRows(resourceId: string): Promise<number> {
  const row = await A.db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM audit_log WHERE action = 'node.rate_limited' AND resource_id = ?`,
    [resourceId]
  );
  return row?.n ?? 0;
}

// ───────────────────────── توابع محض — پنجرهٔ لغزان و پارس env ─────────────────────────

describe('پنجرهٔ لغزان per-node — توابع محض (EXP-7)', () => {
  it('رگبار تا سقف عبور می‌کند؛ مُهرهای کهنه با گذر پنجره بیرون می‌روند (بازنشانی پنجره)', () => {
    let nowMs = 1_000_000;
    const limiter = makeNodeSlidingWindowLimiter(1_000, { now: () => nowMs });
    // سه مجاز در پنجرهٔ ۱ثانیه‌ای، چهارمی رد
    expect(limiter.allow('k', 3)).toBe(true);
    expect(limiter.allow('k', 3)).toBe(true);
    expect(limiter.allow('k', 3)).toBe(true);
    expect(limiter.allow('k', 3)).toBe(false);
    // نیم‌راه پنجره: هنوز پر است
    nowMs += 500;
    expect(limiter.allow('k', 3)).toBe(false);
    // پنجره کامل گذشته: هر سه مُهر کهنه شده‌اند — دوباره باز
    nowMs += 600;
    expect(limiter.allow('k', 3)).toBe(true);
    expect(limiter.allow('k', 3)).toBe(true);
    expect(limiter.allow('k', 3)).toBe(true);
    expect(limiter.allow('k', 3)).toBe(false);
  });

  it('پنجره لغزان است نه ثابت — با خروج تدریجی مُهرها جا باز می‌شود', () => {
    let nowMs = 2_000_000;
    const limiter = makeNodeSlidingWindowLimiter(1_000, { now: () => nowMs });
    expect(limiter.allow('k', 2)).toBe(true); // t=2000000
    nowMs += 400;
    expect(limiter.allow('k', 2)).toBe(true); // t=2000400
    nowMs += 400;
    expect(limiter.allow('k', 2)).toBe(false); // هر دو مُهر هنوز داخل پنجره‌اند
    nowMs += 300; // مُهر اول (2000000) از پنجره بیرون افتاد
    expect(limiter.allow('k', 2)).toBe(true);
  });

  it('کلیدهای مختلف مستقل‌اند؛ فقط درخواست‌های پذیرفته‌شده شمرده می‌شوند', () => {
    let nowMs = 3_000_000;
    const limiter = makeNodeSlidingWindowLimiter(1_000, { now: () => nowMs });
    expect(limiter.allow('a', 1)).toBe(true);
    expect(limiter.allow('b', 1)).toBe(true);
    expect(limiter.allow('a', 1)).toBe(false);
    // ردشده‌ها شمرده نمی‌شوند — پنجره با گذر زمان آزاد می‌شود نه با رگبار ۴۲۹
    for (let i = 0; i < 20; i++) expect(limiter.allow('a', 1)).toBe(false);
    nowMs += 1_100;
    expect(limiter.allow('a', 1)).toBe(true);
  });

  it('سقف حافظهٔ کلیدها (maxKeys) — کلید ساکت‌شدهٔ کهنه بیرون می‌رود و کلید تازه جا می‌گیرد', () => {
    let nowMs = 4_000_000;
    const limiter = makeNodeSlidingWindowLimiter(1_000, { maxKeys: 2, now: () => nowMs });
    expect(limiter.allow('k1', 5)).toBe(true);
    expect(limiter.allow('k2', 5)).toBe(true);
    nowMs += 2_000; // هر دو ساکت‌شدهٔ کهنه — بُرش می‌خورند
    expect(limiter.allow('k3', 5)).toBe(true);
    expect(limiter.allow('k4', 5)).toBe(true);
    expect(limiter.allow('k5', 5)).toBe(true); // پرشدن دوباره → کهنه‌ترین (k3) بیرون می‌رود
    expect(limiter.allow('k6', 5)).toBe(true);
  });

  it('parseNodeRateLimitPerMin — قرارداد env: پیش‌فرض ۱۲۰، «۰»=خاموش، گیرهٔ ۱..۱۰۰۰۰', () => {
    expect(NODE_RATE_LIMIT_PER_MIN_DEFAULT).toBe(120);
    expect(NODE_RATE_LIMIT_PER_MIN_MAX).toBe(10_000);
    expect(NODE_RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(parseNodeRateLimitPerMin(undefined)).toBe(120);
    expect(parseNodeRateLimitPerMin('')).toBe(120);
    expect(parseNodeRateLimitPerMin('abc')).toBe(120);
    expect(parseNodeRateLimitPerMin('-3')).toBe(120);
    expect(parseNodeRateLimitPerMin('0')).toBe(0);
    expect(parseNodeRateLimitPerMin('7')).toBe(7);
    expect(parseNodeRateLimitPerMin('  7 ')).toBe(7);
    expect(parseNodeRateLimitPerMin('99999')).toBe(10_000);
  });
});

// ───────────────────────── e2e روی زیراپ واقعی (/node روی اپ کامل) ─────────────────────────

describe('محدودساز per-node روی مسیرهای نودی — ۴۲۹، استقلال کلید، بازنشانی، قرارداد سالم', () => {
  it('رگبار بالای سقف → ۴۲۹ با پاکت RATE_LIMITED فارسی + Retry-After + یک ردیف audit', async () => {
    const reg = await registerNode('DESKTOP:ratelimit-1');
    A.env.NODE_RATE_LIMIT_PER_MIN = '3';

    expect((await nodeReq('GET', '/node/pull?domains=announcements', nodeHeaders(reg.code, reg.key))).status).toBe(200);
    expect((await nodeReq('GET', '/node/pull?domains=announcements', nodeHeaders(reg.code, reg.key))).status).toBe(200);
    expect((await nodeReq('GET', '/node/pull?domains=announcements', nodeHeaders(reg.code, reg.key))).status).toBe(200);

    const blocked = await nodeReq('GET', '/node/pull?domains=announcements', nodeHeaders(reg.code, reg.key));
    expect(blocked.status).toBe(429);
    expect(blocked.retryAfter).toBe('60'); // پنجرهٔ پیش‌فرض ۶۰ثانیه
    expect(blocked.requestId).toMatch(/^req-/);
    const body = blocked.body as {
      error: string;
      message: string;
      request_id?: string;
      details?: { reason?: string; retryAfterSeconds?: number };
    };
    expect(body.error).toBe('RATE_LIMITED');
    expect(body.message).toContain('تعداد درخواست‌های نود بیش از حد مجاز است');
    expect(body.request_id).toBe(blocked.requestId);
    expect(body.details?.reason).toBe('rate_limited');
    expect(body.details?.retryAfterSeconds).toBe(60);

    // یک ردیف ممیزی به‌ازای هر ۴۲۹ — تلاش محدودشده مشکوک است
    expect(await rateLimitedAuditRows(reg.code)).toBe(1);
    await nodeReq('GET', '/node/pull', nodeHeaders(reg.code, reg.key));
    expect(await rateLimitedAuditRows(reg.code)).toBe(2);
  });

  it('۴۲۹ فقط از مسیر پرشدهٔ همان نود — کلید نود دیگر بی‌تأثیر می‌ماند', async () => {
    const reg1 = await registerNode('DESKTOP:ratelimit-a');
    const reg2 = await registerNode('DESKTOP:ratelimit-b');
    A.env.NODE_RATE_LIMIT_PER_MIN = '2';

    expect((await nodeReq('GET', '/node/pull', nodeHeaders(reg1.code, reg1.key))).status).toBe(200);
    expect((await nodeReq('GET', '/node/pull', nodeHeaders(reg1.code, reg1.key))).status).toBe(200);
    expect((await nodeReq('GET', '/node/pull', nodeHeaders(reg1.code, reg1.key))).status).toBe(429);

    // نود دوم همان لحظه آزاد است
    expect((await nodeReq('GET', '/node/pull', nodeHeaders(reg2.code, reg2.key))).status).toBe(200);
    expect((await nodeReq('GET', '/node/pull', nodeHeaders(reg2.code, reg2.key))).status).toBe(200);
    expect((await nodeReq('GET', '/node/pull', nodeHeaders(reg2.code, reg2.key))).status).toBe(429);
    // و نود اول همچنان محدود
    expect((await nodeReq('GET', '/node/pull', nodeHeaders(reg1.code, reg1.key))).status).toBe(429);
  });

  it('بازنشانی پنجره در e2e — با پنجرهٔ تزریقی کوتاه: رگبار → ۴۲۹ → گذر پنجره → سبز', async () => {
    const reg = await registerNode('DESKTOP:ratelimit-reset');
    const audit = createAuditWriter(A.db);
    // زیراپ مستقل با پنجرهٔ ۳۰۰میلی‌ثانیه‌ای (تزریق آزمون)؛ همان db/audit اپ کامل + errorHandler میزبان
    const standalone = new Hono();
    standalone.onError(errorHandler);
    standalone.route(
      '/node',
      createNodeSyncApp({ db: A.db, audit, logger: silentLogger('it-rl'), rateLimitWindowMs: 300 })
    );
    const env = { NODE_RATE_LIMIT_PER_MIN: '2' };

    const call = async (): Promise<Response> =>
      await standalone.request('/node/pull?domains=announcements', { headers: nodeHeaders(reg.code, reg.key) }, env as never, FAKE_CTX);

    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(429);
    // هنوز داخل پنجره — محدود
    await new Promise((r) => setTimeout(r, 120));
    expect((await call()).status).toBe(429);
    // گذر کامل پنجرهٔ لغزان — مُهرها کهنه می‌شوند و نود آزاد می‌شود
    await new Promise((r) => setTimeout(r, 350));
    expect((await call()).status).toBe(200);
  });

  it('زیر سقف، قرارداد pull/push/reconcile دست‌نخورده می‌ماند؛ مسیرهای مدیریتی گیت نودی ندارند', async () => {
    const reg = await registerNode('DESKTOP:ratelimit-contract');
    A.env.NODE_RATE_LIMIT_PER_MIN = '10';

    const pull = await nodeReq('GET', '/node/pull', nodeHeaders(reg.code, reg.key));
    expect(pull.status).toBe(200);
    const pullData = (pull.body as { data: Record<string, unknown> }).data;
    expect(Object.keys(pullData).sort()).toEqual(
      ['center_version', 'items', 'min_node_version', 'next_cursor', 'server_time', 'server_ts'].sort()
    );
    expect(pull.retryAfter).toBeNull(); // پاسخ موفق هیچ سرنخی از محدودساز ندارد

    const push = await nodeReq(
      'POST',
      '/node/push',
      nodeHeaders(reg.code, reg.key),
      { items: [{ id: 'rl-evt-1', domain: 'health_ping', payload: { ok: true } }] }
    );
    expect(push.status).toBe(200);
    expect(((push.body as { data: { accepted: number } }).data).accepted).toBe(1);

    const recon = await nodeReq('GET', '/node/reconcile?domains=announcements', nodeHeaders(reg.code, reg.key));
    expect(recon.status).toBe(200);

    // سقف تازه = سطل تازه (کلید سقف را هم شامل است)؛ با سقف «۱» نخستین مجاز، دومین رد می‌شود
    A.env.NODE_RATE_LIMIT_PER_MIN = '1';
    expect((await nodeReq('GET', '/node/pull', nodeHeaders(reg.code, reg.key))).status).toBe(200);
    expect((await nodeReq('GET', '/node/pull', nodeHeaders(reg.code, reg.key))).status).toBe(429);
    // مسیر مدیریتی (خواندنی) از گیت per-node عبور می‌کند
    const api = await asRole(A, 'manager');
    const nodes = await api.get('/node/nodes');
    expect(nodes.status).toBe(200);
  });

  it('env «۰» = خاموش؛ هدر غایب با کلید per-IP جدا شمرده می‌شود (فقط در حافظه، بی‌ثبت در audit)', async () => {
    const reg = await registerNode('DESKTOP:ratelimit-off');
    A.env.NODE_RATE_LIMIT_PER_MIN = '0';
    for (let i = 0; i < 10; i++) {
      expect((await nodeReq('GET', '/node/pull', nodeHeaders(reg.code, reg.key))).status).toBe(200);
    }

    // بدون هدر نود — کلید anon جدا؛ شمارش پیش از احراز است: تلاشِ ۴۰۱ هم سقف را پر می‌کند
    // (رگبار بی‌کلید پیش از پرس‌وجوی رجیستری بسته می‌شود)؛ audit آن 'unauthenticated' است (بدون IP)
    A.env.NODE_RATE_LIMIT_PER_MIN = '1';
    expect((await nodeReq('GET', '/node/pull')).status).toBe(401); // مجاز ولی بی‌اعتبار → ۴۰۱ احراز
    const blocked = await nodeReq('GET', '/node/pull');
    expect(blocked.status).toBe(429); // تلاش دوم داخل همان پنجره → ۴۲۹
    const row = await A.db.queryOne<{ resource_id: string; actor_id: string }>(
      `SELECT resource_id, actor_id FROM audit_log WHERE action = 'node.rate_limited' ORDER BY created_at DESC, id DESC LIMIT 1`
    );
    // هارنس IP واقعی ندارد → 'unknown' در کلید حافظه می‌ماند؛ در audit فقط برچسب بی‌هویت می‌نشیند
    expect(row?.resource_id).toBe('unauthenticated');
    expect(row?.actor_id).toBe('anonymous');
  });
});
