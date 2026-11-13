/**
 * گیت‌های کلاینت سینک نود دسکتاپ (rust-f4) — ماژول خالص src/node-sync-client
 * قرارداد آزمون: fetch تزریق‌پذیر (الگوی makeFetch) + ذخیره‌ساز تزریق‌شده سازگار localStorage.
 * تمرکز: drill §۳-۱۱ — کلید غایب/شبکه قطع = خطای نرم (بدون throw خام)؛ فهرست سفید سمت
 * کلاینت؛ مُهر تلاش push سمت کلاینت؛ ماندگاری cursor.
 */
import { describe, it, expect } from 'vitest';
import {
  createNodeSyncClient,
  NODE_PULL_DOMAINS,
  NODE_PUSH_DOMAINS,
  NODE_PUSH_MIN_INTERVAL_MS
} from '../index';
import type { NodeSyncStore } from '../index';

/** ذخیره‌ساز حافظه‌ای با همان اینترفیس localStorage */
function memStore(initial: Record<string, string> = {}): NodeSyncStore & { dump(): Record<string, string> } {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    dump: () => Object.fromEntries(m.entries())
  };
}

const CODE = 'DESKTOP:install-1';
const KEY = 'nk_live_abcabcabcabcabcabcabcabcabcabcabcabcabc';

/** هارنس fetch ساختگی — هم‌الگوی makeFetch آزمون‌های cp-* */
function makeFetch(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn: typeof fetch = async (url, init) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    return responder(call.url, call.init);
  };
  return { calls, fn };
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function clientOf(store: NodeSyncStore, fetchFn: typeof fetch, overrides: Record<string, unknown> = {}) {
  return createNodeSyncClient({
    baseUrl: 'https://hub.example.com/',
    storage: store,
    nodeCodeKey: 'nodesync:node-code',
    nodeKeyKey: 'nodesync:node-key',
    fetchFn,
    clientVersion: '1.25.75',
    ...overrides
  });
}

function configuredStore(): NodeSyncStore & { dump(): Record<string, string> } {
  return memStore({
    'nodesync:node-code': CODE,
    'nodesync:node-key': KEY
  });
}

describe('node-sync-client: کلید غایب — drill §۳-۱۱', () => {
  it('بدون کلید/کد → unconfigured و صفر fetch (نه فقط خطا — هیچ تماس شبکه‌ای)', async () => {
    const { calls, fn } = makeFetch(() => okJson({ data: {} }));
    const store = memStore({ 'nodesync:node-code': CODE }); // کلید غایب
    const client = clientOf(store, fn);
    const p = await client.pull();
    expect(p.status).toBe('unconfigured');
    const push = await client.push({ items: [{ id: 'evt-1', domain: 'health_ping', payload: { ok: true } }] });
    expect(push.status).toBe('unconfigured');
    expect(calls.length).toBe(0);
    expect(client.credentials()).toEqual({ nodeCode: CODE, hasKey: false });
  });

  it('credentials بدون هیچ شبکه‌ای وضعیت محلی را می‌دهد', () => {
    const { fn } = makeFetch(() => okJson({ data: {} }));
    const client = clientOf(configuredStore(), fn);
    expect(client.credentials()).toEqual({ nodeCode: CODE, hasKey: true });
  });
});

describe('node-sync-client: pull با cursor', () => {
  it('ok → items و ذخیرهٔ cursor؛ فراخوانی بعدی همان cursor را در URL می‌آورد', async () => {
    const store = configuredStore();
    const { calls, fn } = makeFetch(() =>
      okJson({ data: { items: [{ id: 'a1', domain: 'announcements', updated_at: '2026-11-01T10:00:00Z', payload: { title: 'اعلان' } }], next_cursor: 'CUR-1', server_time: '2026-11-12T08:00:00Z' } })
    );
    const client = clientOf(store, fn);
    const first = await client.pull({ domains: ['announcements'] });
    expect(first.status).toBe('ok');
    if (first.status === 'ok') {
      expect(first.items).toHaveLength(1);
      expect(first.items[0].payload).toMatchObject({ title: 'اعلان' });
      expect(first.nextCursor).toBe('CUR-1');
    }
    expect(calls[0].url).toContain('/node/pull?');
    expect(calls[0].url).toContain('domains=announcements');
    expect(calls[0].init.headers).toMatchObject({ 'X-CP-Node-Code': CODE, Authorization: `Bearer ${KEY}`, 'X-CP-Node-Version': '1.25.75' });
    expect(store.dump()['nodesync:cursor:announcements']).toBe('CUR-1');

    await client.pull({ domains: ['announcements'] });
    expect(calls[1].url).toContain('cursor=CUR-1');
  });

  it('cursor خالی بعد از پایان صفحه‌ها یعنی صفحهٔ نخست — پارامتر cursor حذف می‌شود', async () => {
    const store = configuredStore();
    store.setItem('nodesync:cursor:library', '');
    const { calls, fn } = makeFetch(() => okJson({ data: { items: [], next_cursor: null } }));
    const client = clientOf(store, fn);
    await client.pull({ domains: ['library'] });
    expect(calls[0].url).not.toContain('cursor=');
  });

  it('قطع شبکه → network_error نرم؛ هیچ throw ای به بیرون نمی‌رسد', async () => {
    const { fn } = makeFetch(() => { throw new Error('ECONNREFUSED'); });
    const client = clientOf(configuredStore(), fn);
    const out = await client.pull();
    expect(out.status).toBe('network_error');
    if (out.status === 'network_error') expect(out.message).toBe('ECONNREFUSED');
  });

  it('۴۰۱ → auth_error نرم (کلید چرخیده — دورهٔ بعد تلاش می‌شود)؛ ۴xx دیگر → http_error با کد پاکت', async () => {
    const store = configuredStore();
    const { calls, fn } = makeFetch((url) =>
      url.includes('domains=packages')
        ? new Response(JSON.stringify({ error: 'NODE_CURSOR_INVALID' }), { status: 400 })
        : new Response(JSON.stringify({ error: 'NODE_AUTH_FAILED' }), { status: 401 })
    );
    const client = clientOf(store, fn);
    const out = await client.pull();
    expect(out.status).toBe('auth_error');
    const other = await client.pull({ domains: ['packages'] });
    expect(other.status).toBe('http_error');
    if (other.status === 'http_error') {
      expect(other.http).toBe(400);
      expect(other.code).toBe('NODE_CURSOR_INVALID');
    }
    expect(calls.length).toBe(2);
  });
});

describe('node-sync-client: push با فهرست سفید سمت کلاینت', () => {
  const okItem = { id: 'evt-1', domain: 'health_ping', payload: { ok: true } };
  const clinicalItem = { id: 'evt-2', domain: 'students', payload: { name: 'سارا' } }; // بالینی — ممنوع

  it('آیتم بالینی هرگز ارسال نمی‌شود؛ اگر همه ممنوع بودند هیچ fetch ای زده نمی‌شود', async () => {
    const { calls, fn } = makeFetch(() => okJson({ data: { accepted: 0, duplicates: 0, throttled: false } }));
    const client = clientOf(configuredStore(), fn);
    const out = await client.push({ items: [clinicalItem, { id: 'evt-3', domain: 'patients', payload: { x: 1 } }] });
    expect(out.status).toBe('rejected_domains');
    expect(calls.length).toBe(0); // هیچ بایتی از میز خارج نشد
  });

  it('push مخلوط → فقط سفیدها می‌روند و دامنه‌های ردشده گزارش می‌شوند', async () => {
    const { calls, fn } = makeFetch(() => okJson({ data: { accepted: 1, duplicates: 0, throttled: false } }));
    const client = clientOf(configuredStore(), fn);
    const out = await client.push({ items: [okItem, clinicalItem] });
    expect(out.status).toBe('ok');
    if (out.status === 'ok') {
      expect(out.accepted).toBe(1);
      expect(out.rejectedDomains).toEqual(['students']);
    }
    expect(calls.length).toBe(1);
    const sent = JSON.parse(String(calls[0].init.body)) as { items: Array<{ domain: string }> };
    expect(sent.items.map((i) => i.domain)).toEqual(['health_ping']); // فقط سفید
  });

  it('مُهر تلاش سمت کلاینت — تلاش دوم فوری = skipped بدون fetch؛ بعد از گات = ارسال', async () => {
    const store = configuredStore();
    const { calls, fn } = makeFetch(() => okJson({ data: { accepted: 1, duplicates: 0, throttled: false } }));
    let current = new Date('2026-11-12T08:00:00.000Z');
    const client = clientOf(store, fn, { now: () => current });

    const first = await client.push({ items: [okItem] });
    expect(first.status).toBe('ok');
    expect(store.dump()['nodesync:last-push-attempt']).toBe('2026-11-12T08:00:00.000Z');

    const second = await client.push({ items: [okItem] });
    expect(second.status).toBe('skipped');
    expect(calls.length).toBe(1); // fetch دوم زده نشد — نویز-سپر سمت کلاینت

    current = new Date(current.getTime() + NODE_PUSH_MIN_INTERVAL_MS + 1_000);
    const third = await client.push({ items: [okItem] });
    expect(third.status).toBe('ok');
    expect(calls.length).toBe(2);
  });

  it('قطع شبکه در push → network_error نرم؛ مُهر تلاش پیش از ارسال ثبت شده (هم‌الگوی m1.5)', async () => {
    const store = configuredStore();
    const { fn } = makeFetch(() => { throw new Error('network down'); });
    const client = clientOf(store, fn);
    const out = await client.push({ items: [okItem] });
    expect(out.status).toBe('network_error');
    if (out.status === 'network_error') expect(out.message).toBe('network down');
    expect(store.dump()['nodesync:last-push-attempt']).toBeTruthy(); // مُهر قبل از ارسال
  });

  it('پاسخ throttled سرور → وضعیت throttled با retry_after_s', async () => {
    const { fn } = makeFetch(() => okJson({ data: { accepted: 0, duplicates: 0, throttled: true, retry_after_s: 840 } }));
    const client = clientOf(configuredStore(), fn, { pushMinIntervalMs: 0 }); // گات کلاینت خاموش تا سرور دیده شود
    const out = await client.push({ items: [okItem] });
    expect(out.status).toBe('throttled');
    if (out.status === 'throttled') expect(out.retryAfterS).toBe(840);
  });
});

describe('node-sync-client: آینهٔ فهرست سفید', () => {
  it('فهرست‌های کلاینت عین فهرست‌های سند قراردادند (docs/rust/node-sync.md §۳)', () => {
    expect([...NODE_PULL_DOMAINS].sort()).toEqual(['announcements', 'library', 'packages']);
    expect([...NODE_PUSH_DOMAINS].sort()).toEqual(['client_errors', 'health_ping', 'usage_summary']);
  });
});

// ───────────────────────── EXP-1 — آشتی‌ساز (reconcile) ─────────────────────────

describe('node-sync-client: reconcile — فقط-گزارش، قرارداد نرم', () => {
  it('پاسخ قراردادی → ok با ردیف‌های دامنه + server_ts؛ درخواست با همان اعتبار نود pull', async () => {
    // بدنهٔ «لخت» — عین قرارداد یخ‌زدهٔ /node/reconcile سمت مرکز (بدون پاکت {data:…})
    const { fn, calls } = makeFetch(() =>
      okJson({
        server_ts: '2026-11-13T10:05:00.000Z',
        domains: [
          { domain: 'announcements', count: 123, max_updated_at: '2026-11-12T08:00:00.000Z' },
          { domain: 'packages', count: 7, max_updated_at: null }
        ]
      })
    );
    const client = clientOf(configuredStore(), fn);
    const out = await client.reconcile();
    expect(out.status).toBe('ok');
    if (out.status === 'ok') {
      expect(out.serverTs).toBe('2026-11-13T10:05:00.000Z');
      expect(out.domains).toEqual([
        { domain: 'announcements', count: 123, max_updated_at: '2026-11-12T08:00:00.000Z' },
        { domain: 'packages', count: 7, max_updated_at: null }
      ]);
    }
    const url = new URL(calls[0]?.url ?? 'https://x.invalid');
    expect(url.pathname).toBe('/node/reconcile');
    expect(url.searchParams.get('domains')).toBe('announcements,packages,library'); // فهرست سفید کامل (ترتیب قرارداد کلاینت)
    expect((calls[0]?.init.headers as Record<string, string>)['X-CP-Node-Code']).toBe(CODE);
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  it('پاکت {data:…} هم پذیرفته می‌شود (هم‌ریتم بقیهٔ مسیرهای نود) — بدنهٔ لخت و پاکتی هر دو قراردادند', async () => {
    const { fn } = makeFetch(() =>
      okJson({
        data: {
          server_ts: '2026-11-13T10:05:00.000Z',
          domains: [{ domain: 'library', count: 3, max_updated_at: '2026-11-12T07:00:00.000Z' }]
        }
      })
    );
    const client = clientOf(configuredStore(), fn);
    const out = await client.reconcile();
    expect(out.status).toBe('ok');
    if (out.status === 'ok') {
      expect(out.serverTs).toBe('2026-11-13T10:05:00.000Z');
      expect(out.domains).toEqual([{ domain: 'library', count: 3, max_updated_at: '2026-11-12T07:00:00.000Z' }]);
    }
  });

  it('کلید غایب → unconfigured بدون هیچ fetch؛ ۴۰۱ → auth_error؛ شبکه قطع → network_error', async () => {
    const empty = clientOf(memStore(), makeFetch(() => okJson({ data: { domains: [] } })).fn);
    expect((await empty.reconcile()).status).toBe('unconfigured');

    const authz = clientOf(configuredStore(), makeFetch(() => new Response('nope', { status: 401 })).fn);
    expect((await authz.reconcile()).status).toBe('auth_error');

    const dead = clientOf(configuredStore(), makeFetch(() => { throw new Error('socket down'); }).fn);
    const deadOut = await dead.reconcile();
    expect(deadOut.status).toBe('network_error');
    if (deadOut.status === 'network_error') expect(deadOut.message).toBe('socket down');
  });

  it('بدنهٔ خارج از قرارداد → http_error با کد NODE_RECONCILE_BODY_INVALID؛ ردیف‌های مسموم حذف نرم می‌شوند', async () => {
    const bad = clientOf(configuredStore(), makeFetch(() => okJson({ data: { nope: true } })).fn);
    const badOut = await bad.reconcile();
    expect(badOut.status).toBe('http_error');
    if (badOut.status === 'http_error') expect(badOut.code).toBe('NODE_RECONCILE_BODY_INVALID');

    const partial = clientOf(
      configuredStore(),
      makeFetch(() =>
        okJson({
          data: {
            domains: [
              { domain: 'announcements', count: 5, max_updated_at: '2026-11-12T08:00:00.000Z' },
              { domain: 'خراب', count: -3, max_updated_at: null }, // شمارندهٔ منفی — حذف نرم
              { domain: 'بدون-شمارش', max_updated_at: null }, // بدون count — حذف نرم
              'رشتهٔ مسموم' // خارج از قرارداد — حذف نرم
            ]
          }
        })
      ).fn
    );
    const partialOut = await partial.reconcile();
    expect(partialOut.status).toBe('ok');
    if (partialOut.status === 'ok') {
      expect(partialOut.domains).toEqual([{ domain: 'announcements', count: 5, max_updated_at: '2026-11-12T08:00:00.000Z' }]);
    }
  });
});
