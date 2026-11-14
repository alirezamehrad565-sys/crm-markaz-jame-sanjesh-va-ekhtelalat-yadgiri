/**
 * rust-f9 + rust-f11 — آزمون زمان‌بند سینک فرانت‌اند (runner.ts)
 * fetch تزریق‌شده؛ انبار پیشرفت در حافظه — همان قرارداد نرم drill §۳-۱۱.
 * rust-f11: آزمون‌های pushNow (outbox موتور محلی → client.push → ابر) در describe جدا.
 */
import { describe, it, expect } from 'vitest';
import { createNodeSyncRunner, SYNC_STATUS_KEY, PUSH_WATERMARK_KEY } from '../runner';
import type { SyncStatusV1 } from '../runner';
import type { NodeSyncStore, NodePullItem } from '../../node-sync-client/client';

type FetchCall = { url: string; init: RequestInit };

/** آیتم outbox آزمون — هم‌شکل قرارداد GET /api/internal/sync/outbox */
type OutboxFixture = { id: string; domain: string; at: string | null; payload: Record<string, unknown> };

function memStore(): NodeSyncStore & { dump: () => Map<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    dump: () => m
  };
}

function pullItem(id: string, domain: string): NodePullItem {
  return { id, domain, updated_at: '2026-11-12T00:00:00Z', payload: { title: id } };
}

/** کلود مک دوصفحه‌ای + مسیر استقرار ضبط‌شده + outbox/push نود (rust-f11) */
function makeFetch(opts?: {
  pullStatus?: number;
  ingestStatus?: number;
  authError?: boolean;
  outboxStatus?: number;
  outboxItems?: OutboxFixture[];
  outboxGeneratedAt?: string;
  pushStatus?: number;
  /** پرتاب خطا به‌جای پاسخ — برای مسیر network_error نرم */
  throwOn?: 'outbox' | 'push';
}) {
  const calls: FetchCall[] = [];
  let pullNo = 0;
  const fn: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init: init ?? {} });
    if (url.includes('/node/pull')) {
      pullNo += 1;
      if (opts?.authError) return new Response(JSON.stringify({ error: 'node_unauthorized' }), { status: 401 });
      if (opts?.pullStatus && opts.pullStatus !== 200) {
        return new Response(JSON.stringify({ error: 'boom' }), { status: opts.pullStatus });
      }
      const body =
        pullNo === 1
          ? { data: { items: [pullItem('a1', 'announcements')], next_cursor: 'c2', server_time: 't1' } }
          : { data: { items: [pullItem('k1', 'library')], next_cursor: null, server_time: 't2' } };
      return new Response(JSON.stringify(body), { status: 200 });
    }
    if (url.includes('/api/internal/sync/ingest')) {
      if (opts?.ingestStatus && opts.ingestStatus !== 200) {
        return new Response(JSON.stringify({ error: 'no' }), { status: opts.ingestStatus });
      }
      return new Response(JSON.stringify({ data: { inserted: 1, updated: 0, duplicates: 0, by_domain: {} } }), { status: 200 });
    }
    if (url.includes('/api/internal/sync/outbox')) {
      if (opts?.throwOn === 'outbox') throw new Error('outbox down');
      if (opts?.outboxStatus && opts.outboxStatus !== 200) {
        return new Response(JSON.stringify({ error: 'outbox_boom' }), { status: opts.outboxStatus });
      }
      const body = { data: { items: opts?.outboxItems ?? [], generated_at: opts?.outboxGeneratedAt ?? '2026-11-12T10:00:00Z' } };
      return new Response(JSON.stringify(body), { status: 200 });
    }
    if (url.includes('/node/push')) {
      if (opts?.throwOn === 'push') throw new Error('push down');
      if (opts?.pushStatus && opts.pushStatus !== 200) {
        return new Response(JSON.stringify({ error: 'push_boom' }), { status: opts.pushStatus });
      }
      return new Response(JSON.stringify({ data: { accepted: (opts?.outboxItems ?? []).length, duplicates: 0 } }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetch: fn, calls };
}

describe('node-sync-runner (rust-f9)', () => {
  it('بدون اعتبار → unconfigured و بدون هیچ درخواستی', async () => {
    const { fetch, calls } = makeFetch();
    const store = memStore();
    const runner = createNodeSyncRunner({ baseUrl: null, nodeCode: null, nodeKey: null, progressStorage: store, fetchFn: fetch, tokenProvider: () => 'tok' });
    expect(runner.configured()).toBe(false);
    const out = await runner.syncNow();
    expect(out.status).toBe('unconfigured');
    expect(calls).toHaveLength(0);
  });

  it('دو صفحه pull + دو بار استقرار با توکن سشن → ok، جمع آیتم‌ها و دامنه‌ها درست', async () => {
    const { fetch, calls } = makeFetch();
    const store = memStore();
    const runner = createNodeSyncRunner({ baseUrl: 'http://cloud.test', nodeCode: 'DESKTOP:t1', nodeKey: 'nk', progressStorage: store, fetchFn: fetch, tokenProvider: () => 'sess-token' });
    expect(runner.configured()).toBe(true);
    const out = await runner.syncNow();
    expect(out.status).toBe('ok');
    if (out.status === 'ok') {
      expect(out.items).toBe(2);
      expect(out.pages).toBe(2);
      expect(out.by_domain.announcements).toBe(1);
      expect(out.by_domain.library).toBe(1);
    }
    const ingests = calls.filter((c) => c.url.includes('/api/internal/sync/ingest'));
    expect(ingests).toHaveLength(2);
    expect((ingests[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sess-token');
    const page2 = JSON.parse(String(ingests[1].init.body)) as { items: NodePullItem[] };
    expect(page2.items[0].id).toBe('k1'); // صفحهٔ دوم = آیتم بعد از cursor
    // cursor در انبار پیشرفت پیش رفته و در انتها خالی شده (پایان صفحه‌ها) — کلید استاندارد client
    const cursorKey = `nodesync:cursor:${['announcements', 'library', 'packages'].sort().join('+')}`;
    expect(store.dump().get(cursorKey)).toBe('');
    // وضعیت موفق ثبت شده است
    const st = JSON.parse(store.dump().get(SYNC_STATUS_KEY) ?? '{}') as SyncStatusV1;
    expect(st.v).toBe(1);
    expect(st.last_ok_at).toBeTruthy();
    expect(st.items_last_run).toBe(2);
    expect(st.last_error).toBeNull();
  });

  it('بدون توکن سشن → ingest_error نرم و خطا در وضعیت', async () => {
    const { fetch } = makeFetch();
    const store = memStore();
    const runner = createNodeSyncRunner({ baseUrl: 'http://cloud.test', nodeCode: 'DESKTOP:t1', nodeKey: 'nk', progressStorage: store, fetchFn: fetch, tokenProvider: () => null });
    const out = await runner.syncNow();
    expect(out.status).toBe('ingest_error');
    expect(runner.status().last_error).toContain('توکن');
  });

  it('pull ۵۰۰ → http_error نرم؛ cursor دست‌نخورده و last_error ثبت', async () => {
    const { fetch, calls } = makeFetch({ pullStatus: 500 });
    const store = memStore();
    const runner = createNodeSyncRunner({ baseUrl: 'http://cloud.test', nodeCode: 'DESKTOP:t1', nodeKey: 'nk', progressStorage: store, fetchFn: fetch, tokenProvider: () => 'tok' });
    const out = await runner.syncNow();
    expect(out.status).toBe('http_error');
    expect(calls.filter((c) => c.url.includes('/ingest'))).toHaveLength(0);
    const cursorKey = `nodesync:cursor:${['announcements', 'library', 'packages'].sort().join('+')}`;
    expect(store.dump().get(cursorKey) ?? null).toBeNull(); // هیچ okای نبوده — cursor هرگز نوشته نشده
    expect(runner.status().last_error).toContain('HTTP 500');
  });

  it('pull ۴۰۱ → auth_error نرم', async () => {
    const { fetch } = makeFetch({ authError: true });
    const runner = createNodeSyncRunner({ baseUrl: 'http://cloud.test', nodeCode: 'DESKTOP:t1', nodeKey: 'nk', progressStorage: memStore(), fetchFn: fetch, tokenProvider: () => 'tok' });
    const out = await runner.syncNow();
    expect(out.status).toBe('auth_error');
  });

  it('استقرار ۵۰۰ → ingest_error نرم (خطای موتور محلی هرگز throw نمی‌کند)', async () => {
    const { fetch, calls } = makeFetch({ ingestStatus: 500 });
    const runner = createNodeSyncRunner({ baseUrl: 'http://cloud.test', nodeCode: 'DESKTOP:t1', nodeKey: 'nk', progressStorage: memStore(), fetchFn: fetch, tokenProvider: () => 'tok' });
    const out = await runner.syncNow();
    expect(out.status).toBe('ingest_error');
    expect(calls.filter((c) => c.url.includes('/ingest'))).toHaveLength(1);
    expect(runner.status().last_error).toContain('استقرار');
  });

  it('resetStatus → وضعیت خالی', async () => {
    const { fetch } = makeFetch();
    const store = memStore();
    const runner = createNodeSyncRunner({ baseUrl: 'http://cloud.test', nodeCode: 'DESKTOP:t1', nodeKey: 'nk', progressStorage: store, fetchFn: fetch, tokenProvider: () => 'tok' });
    await runner.syncNow();
    runner.resetStatus();
    const st = runner.status();
    expect(st.last_ok_at).toBeNull();
    expect(st.items_last_run).toBe(0);
  });
});

describe('node-sync-runner pushNow (rust-f11)', () => {
  const E1: OutboxFixture = { id: 'e1', domain: 'client_errors', at: '2026-11-12T09:00:00Z', payload: { message: 'boom' } };
  const E2: OutboxFixture = { id: 'e2', domain: 'health_ping', at: '2026-11-12T09:30:00Z', payload: { ok: true } };

  function pushRunner(store: ReturnType<typeof memStore>, fetchFn: typeof fetch, nowFn?: () => Date) {
    return createNodeSyncRunner({
      baseUrl: 'http://cloud.test',
      nodeCode: 'DESKTOP:t1',
      nodeKey: 'nk',
      progressStorage: store,
      fetchFn,
      tokenProvider: () => 'sess-token',
      now: nowFn ?? (() => new Date())
    });
  }

  it('بدون اعتبار → unconfigured و بدون هیچ درخواستی', async () => {
    const { fetch, calls } = makeFetch();
    const runner = createNodeSyncRunner({ baseUrl: null, nodeCode: null, nodeKey: null, progressStorage: memStore(), fetchFn: fetch, tokenProvider: () => 'tok' });
    const out = await runner.pushNow();
    expect(out.status).toBe('unconfigured');
    expect(calls).toHaveLength(0);
  });

  it('outbox خالی → ok/sent:0، هیچ push ای زده نمی‌شود و watermark تا generated_at می‌رود', async () => {
    const { fetch, calls } = makeFetch({ outboxItems: [], outboxGeneratedAt: '2026-11-12T10:00:00Z' });
    const store = memStore();
    const runner = pushRunner(store, fetch);
    const out = await runner.pushNow();
    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(out.sent).toBe(0);
    expect(calls.filter((c) => c.url.includes('/api/internal/sync/outbox'))).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes('/node/push'))).toHaveLength(0);
    expect(calls[0].url).not.toContain('since='); // watermark اولیه غایب است
    expect(store.dump().get(PUSH_WATERMARK_KEY)).toBe('2026-11-12T10:00:00Z');
    expect(runner.status().last_push_ok_at).toBeTruthy();
    expect(runner.status().last_push_error).toBeNull();
  });

  it('دو آیتم → client.push با همان items صدا خورد → ok و watermark = at آیتم آخر', async () => {
    const { fetch, calls } = makeFetch({ outboxItems: [E1, E2] });
    const store = memStore();
    const runner = pushRunner(store, fetch, () => new Date('2026-11-12T12:00:00Z'));
    const out = await runner.pushNow();
    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(out.sent).toBe(2);
    const outboxCalls = calls.filter((c) => c.url.includes('/api/internal/sync/outbox'));
    expect(outboxCalls).toHaveLength(1);
    expect(outboxCalls[0].url).not.toContain('since=');
    // outbox فقط سشن کارمند می‌خواهد — نه اعتبار نود
    expect((outboxCalls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sess-token');
    // push از راه کلاینت — فقط items چک می‌شود؛ هدرهای نود کار خود client.ts است
    const pushCalls = calls.filter((c) => c.url.includes('/node/push'));
    expect(pushCalls).toHaveLength(1);
    const sent = JSON.parse(String(pushCalls[0].init.body)) as { items: OutboxFixture[] };
    expect(sent.items).toEqual([E1, E2]);
    expect(store.dump().get(PUSH_WATERMARK_KEY)).toBe('2026-11-12T09:30:00Z'); // at آیتم آخر
    expect(runner.status().last_push_ok_at).toBeTruthy();
    expect(runner.status().last_push_error).toBeNull();
  });

  it('دورهٔ دوم با گات ۱۵دقیقه‌ای کلاینت → skipped؛ watermark دست‌نخورده و since فرستاده می‌شود', async () => {
    const { fetch, calls } = makeFetch({ outboxItems: [E1, E2] });
    const store = memStore();
    const runner = pushRunner(store, fetch, () => new Date('2026-11-12T12:00:00Z')); // now ثابت → گات می‌گیرد
    const first = await runner.pushNow();
    expect(first.status).toBe('ok');
    expect(store.dump().get(PUSH_WATERMARK_KEY)).toBe('2026-11-12T09:30:00Z');
    const second = await runner.pushNow();
    expect(second.status).toBe('skipped');
    expect(store.dump().get(PUSH_WATERMARK_KEY)).toBe('2026-11-12T09:30:00Z'); // دست‌نخورده
    const outboxCalls = calls.filter((c) => c.url.includes('/api/internal/sync/outbox'));
    expect(outboxCalls).toHaveLength(2);
    expect(outboxCalls[1].url).toContain(`since=${encodeURIComponent('2026-11-12T09:30:00Z')}`);
    expect(calls.filter((c) => c.url.includes('/node/push'))).toHaveLength(1); // push دوم هرگز ارسال نشد
  });

  it('outbox ۵۰۰ → outbox_error نرم؛ بدون push و watermark دست‌نخورده', async () => {
    const { fetch, calls } = makeFetch({ outboxStatus: 500, outboxItems: [E1, E2] });
    const store = memStore();
    const runner = pushRunner(store, fetch);
    const out = await runner.pushNow();
    expect(out.status).toBe('outbox_error');
    if (out.status === 'outbox_error') expect(out.http).toBe(500);
    expect(calls.filter((c) => c.url.includes('/node/push'))).toHaveLength(0);
    expect(store.dump().get(PUSH_WATERMARK_KEY) ?? null).toBeNull();
    expect(runner.status().last_push_error).toContain('500');
  });

  it('push ۵۰۰ → push_failed نرم با کد پاکت خطا و watermark دست‌نخورده', async () => {
    const { fetch } = makeFetch({ outboxItems: [E1, E2], pushStatus: 500 });
    const store = memStore();
    const runner = pushRunner(store, fetch);
    const out = await runner.pushNow();
    expect(out.status).toBe('push_failed');
    if (out.status === 'push_failed') expect(out.code).toBe('push_boom');
    expect(store.dump().get(PUSH_WATERMARK_KEY) ?? null).toBeNull();
    expect(runner.status().last_push_error).toContain('HTTP 500');
    expect(runner.status().last_push_ok_at ?? null).toBeNull();
  });

  it('پرتاب fetch در outbox → network_error نرم', async () => {
    const { fetch } = makeFetch({ throwOn: 'outbox' });
    const store = memStore();
    const runner = pushRunner(store, fetch);
    const out = await runner.pushNow();
    expect(out.status).toBe('network_error');
    if (out.status === 'network_error') expect(out.message).toContain('outbox down');
    expect(store.dump().get(PUSH_WATERMARK_KEY) ?? null).toBeNull();
  });

  it('پرتاب fetch در push (وسط کلاینت) → network_error نرم', async () => {
    const { fetch } = makeFetch({ outboxItems: [E1, E2], throwOn: 'push' });
    const store = memStore();
    const runner = pushRunner(store, fetch);
    const out = await runner.pushNow();
    expect(out.status).toBe('network_error');
    if (out.status === 'network_error') expect(out.message).toContain('push down');
    expect(store.dump().get(PUSH_WATERMARK_KEY) ?? null).toBeNull();
  });

  it('هیچ مسیری throw نمی‌کند — چهار سناریوی خراب پشت‌سرهم نرم برمی‌گردند', async () => {
    const scenarios: Parameters<typeof makeFetch>[0][] = [{ outboxStatus: 503 }, { outboxItems: [E1], pushStatus: 500 }, { throwOn: 'outbox' }, { outboxItems: [E1], throwOn: 'push' }];
    for (const sc of scenarios) {
      const { fetch } = makeFetch(sc);
      const runner = pushRunner(memStore(), fetch);
      const out = await runner.pushNow(); // پرتاب = شکست آزمون
      expect(['outbox_error', 'push_failed', 'network_error']).toContain(out.status);
    }
  });
});
