/**
 * rust-f14 — آزمون ماشهٔ بوت catch-up: یک‌بار در بوت، fire-and-forget، هیچ خطایی بوت را
 * نمی‌بندد. هماهنگ‌ساز با factory تزریقی جایگزین می‌شود (قرارداد deps فقط-آزمون) تا پرتاب
 * در runCatchUp/getCreds شبیه‌سازی شود. هیچ setTimeout واقعی در مسیر داوری نیست.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  startNodeSyncBootCatchUp,
  resetNodeSyncBootCatchUpForTests,
  CATCHUP_STATE_KEY,
  COORD_INTERVAL_MS_DEFAULT
} from '../index';
import { createNodeSyncRunner } from '../runner';
import type { CatchUpOutcome, NodeSyncRunner } from '../runner';
import { createSyncCoordinator } from '../coordinator';
import type { SyncCoordinator } from '../coordinator';
import type { NodeSyncStore } from '../../node-sync-client/client';

function memStore(): NodeSyncStore & { dump: () => Map<string, string> } {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), dump: () => m };
}

/** فلاش میکروتسک‌ها — ادامهٔ زنجیرهٔ fire-and-forget بدون تایمر واقعی */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function fakeCoordinator(hooks: {
  onStart?: () => void;
  runCatchUp?: () => Promise<{ catchup: CatchUpOutcome }>;
}): SyncCoordinator & { starts: number; catchUpCalls: number } {
  const self = {
    starts: 0,
    catchUpCalls: 0,
    start() {
      self.starts += 1;
      hooks.onStart?.();
    },
    stop() {
      // بدون تایمر واقعی — نه چیزی هست که لغو شود
    },
    async runNow() {
      throw new Error('نباید در آزمون بوت صدا شود');
    },
    async runCatchUp() {
      self.catchUpCalls += 1;
      if (hooks.runCatchUp) return hooks.runCatchUp();
      return { catchup: emptyOk() };
    },
    notifyCredentialsChanged() {
      // نرم
    },
    state() {
      return {
        v: 1 as const,
        mode: 'auto' as const,
        consecutive_failures: 0,
        next_attempt_at: null,
        backoff_ms: 0,
        last_error_kind: 'none' as const,
        last_run_at: null,
        updated_at: null
      };
    }
  };
  return self as unknown as SyncCoordinator & { starts: number; catchUpCalls: number };
}

function emptyOk(): CatchUpOutcome {
  return {
    status: 'ok',
    phase: 'done',
    http: null,
    code: null,
    message: null,
    pages: 0,
    items_pulled: 0,
    by_domain: {},
    batches: 0,
    items_pushed: 0,
    duplicates_pushed: 0,
    pull_done: true,
    push_done: true
  };
}

const creds = () => Promise.resolve({ baseUrl: 'https://center.test', nodeCode: 'DESKTOP:t', nodeKey: 'nk' });
const token = () => 'sess-token';
const noopFetch = (async () => new Response(JSON.stringify({ data: { ok: true } }), { status: 200 })) as never;

beforeEach(() => {
  resetNodeSyncBootCatchUpForTests();
});

describe('ماشهٔ بوت catch-up — یک‌بار، فوری بازگشت، مهار کامل خطا', () => {
  it('هماهنگ‌ساز شروع می‌شود و runCatchUp دقیقاً یک‌بار در پس‌زمینه اجرا می‌شود؛ فراخوانی بلافاصله برمی‌گردد', async () => {
    const gate = deferred();
    const coord = fakeCoordinator({
      runCatchUp: async () => {
        await gate.promise;
        return { catchup: emptyOk() };
      }
    });
    const store = memStore();
    const started = startNodeSyncBootCatchUp({
      getCreds: creds,
      progressStorage: store,
      tokenProvider: token,
      fetchFn: noopFetch,
      coordinatorFactory: () => coord
    });
    // شروع همگام است — بوت منتظر نمی‌ماند (کار واقعی در پس‌زمینه است)
    expect(started).toEqual({ started: true });

    await flush();
    expect(coord.starts).toBe(1); // تیک‌های عادی از همین بوت برنامه‌ریزی شد
    expect(coord.catchUpCalls).toBe(1); // دورهٔ جبرانی در پس‌زمینه اجرا شده
    gate.resolve();
    await flush();
    expect(coord.catchUpCalls).toBe(1); // و فقط یک‌بار
  });

  it('فراخوانی دوم در همان فرایند کاری نمی‌کند (یک‌بار در بوت)', async () => {
    const coord = fakeCoordinator({});
    const store = memStore();
    const deps = { getCreds: creds, progressStorage: store, tokenProvider: token, fetchFn: noopFetch, coordinatorFactory: () => coord };
    expect(startNodeSyncBootCatchUp(deps).started).toBe(true);
    await flush();
    expect(startNodeSyncBootCatchUp(deps).started).toBe(false);
    await flush();
    expect(coord.starts).toBe(1);
    expect(coord.catchUpCalls).toBe(1);
  });

  it('پرتاب در runCatchUp → هیچ unhandled rejection، وضعیت error در انبار، بوت ادامه می‌یابد', async () => {
    const coord = fakeCoordinator({
      runCatchUp: async () => {
        throw new Error('کابوس catch-up');
      }
    });
    const store = memStore();
    const started = startNodeSyncBootCatchUp({
      getCreds: creds,
      progressStorage: store,
      tokenProvider: token,
      fetchFn: noopFetch,
      coordinatorFactory: () => coord
    });
    expect(started.started).toBe(true); // بوت متوقف نشد
    await flush();
    expect(coord.catchUpCalls).toBe(1);
    const st = JSON.parse(store.dump().get(CATCHUP_STATE_KEY) ?? '{}') as { state: string; last_error_kind: string | null };
    expect(st.state).toBe('error'); // وضعیت نرم در انبار — UI می‌بیند
    expect(st.last_error_kind).toBe('network');
  });

  it('پرتاب در getCreds → همان مهار: وضعیت error، بدون شکستن بوت', async () => {
    const store = memStore();
    const started = startNodeSyncBootCatchUp({
      getCreds: async () => {
        throw new Error('مخزن امن قفل است');
      },
      progressStorage: store,
      tokenProvider: token,
      fetchFn: noopFetch
    });
    expect(started.started).toBe(true);
    await flush();
    const st = JSON.parse(store.dump().get(CATCHUP_STATE_KEY) ?? '{}') as { state: string };
    expect(st.state).toBe('error');
  });

  it('مسیر پیش‌فرض (هماهنگ‌ساز واقعی + اعتبار ناقص) → offline نرم، بدون هیچ fetch مرکز', async () => {
    const store = memStore();
    const calls: string[] = [];
    const countingFetch = (async (input: RequestInfo | URL) => {
      calls.push(typeof input === 'string' ? input : input.toString());
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const started = startNodeSyncBootCatchUp({
      getCreds: () => Promise.resolve({ baseUrl: null, nodeCode: null, nodeKey: null }),
      progressStorage: store,
      tokenProvider: token,
      fetchFn: countingFetch as never
    });
    expect(started.started).toBe(true);
    await flush();
    const st = JSON.parse(store.dump().get(CATCHUP_STATE_KEY) ?? '{}') as { state: string };
    expect(st.state).toBe('offline');
    // تیک عادی هم با وضعیت خالی برنامه‌ریزی شده — بوت بدون اعتبار فقط آرام می‌ماند
    expect(COORD_INTERVAL_MS_DEFAULT).toBe(30 * 60_000);
    // هیچ fetch مرکزی نیست (drill §۳-۱۱) — تنها فراخوانی ممکن، آینهٔ وضعیت همان-مبداست
    expect(calls.filter((u) => u.includes('/node/'))).toHaveLength(0);
  });

  it('مسیر پیش‌فرض با هماهنگ‌ساز واقعی و runner واقعی — runCatchUp از runner.catchUp می‌گذرد', async () => {
    const store = memStore();
    const calls: string[] = [];
    const countingFetch = (async (input: RequestInfo | URL) => {
      calls.push(typeof input === 'string' ? input : input.toString());
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    let seenRunner: NodeSyncRunner | null = null;
    let coordRef: SyncCoordinator | null = null;
    const started = startNodeSyncBootCatchUp({
      getCreds: () => Promise.resolve({ baseUrl: 'https://center.test', nodeCode: 'DESKTOP:t', nodeKey: 'nk' }),
      progressStorage: store,
      tokenProvider: token,
      fetchFn: countingFetch as never,
      coordinatorFactory: (runner: NodeSyncRunner) => {
        seenRunner = runner;
        coordRef = createSyncCoordinator({ runner, progressStorage: store, scheduleFn: () => () => undefined });
        return coordRef;
      }
    });
    expect(started.started).toBe(true);
    await flush();
    expect(seenRunner !== null).toBe(true);
    const seen: NodeSyncRunner = seenRunner as unknown as NodeSyncRunner;
    expect(typeof seen.catchUp).toBe('function'); // runner واقعی به هماهنگ‌ساز داده شده
    expect(calls.some((u) => u.includes('/node/pull'))).toBe(true); // pull واقعی از runner واقعی
    expect(coordRef !== null).toBe(true);
  });

  it('createNodeSyncRunner قراردادهای تازه را دارد — catchUp/mirrorStatus روی interface', async () => {
    const runner = createNodeSyncRunner({ baseUrl: null, nodeCode: null, nodeKey: null, progressStorage: memStore() });
    expect(typeof runner.catchUp).toBe('function');
    expect(typeof runner.mirrorStatus).toBe('function');
    const out = await runner.catchUp();
    expect(out.status).toBe('unconfigured');
  });
});
