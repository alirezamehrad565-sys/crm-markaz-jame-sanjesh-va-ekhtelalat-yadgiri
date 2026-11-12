/**
 * rust-f9 — آزمون زمان‌بند سینک فرانت‌اند (runner.ts)
 * fetch تزریق‌شده؛ انبار پیشرفت در حافظه — همان قرارداد نرم drill §۳-۱۱.
 */
import { describe, it, expect } from 'vitest';
import { createNodeSyncRunner, SYNC_STATUS_KEY } from '../runner';
import type { SyncStatusV1 } from '../runner';
import type { NodeSyncStore, NodePullItem } from '../../node-sync-client/client';

type FetchCall = { url: string; init: RequestInit };

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

/** کلود مک دوصفحه‌ای + مسیر استقرار ضبط‌شده */
function makeFetch(opts?: { pullStatus?: number; ingestStatus?: number; authError?: boolean }) {
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
