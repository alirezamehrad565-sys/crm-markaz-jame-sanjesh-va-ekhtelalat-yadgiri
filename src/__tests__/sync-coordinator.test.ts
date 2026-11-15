/**
 * v1.26.0 — آزمون هماهنگ‌ساز سینک (docs/rust/first-run-and-cloud.md §۴ ماتریس خرابی)
 * بدون شبکه واقعی — runner فِیک با خروجی‌های نرم؛ زمان‌سنج تزریق‌پذیر (بدون setTimeout واقعی).
 */
import { describe, expect, it } from 'vitest';
import { createSyncCoordinator, readCoordinatorState, SYNC_COORD_KEY } from '../node-sync-runner/coordinator.js';
import type { SyncCoordinator } from '../node-sync-runner/coordinator.js';
import type { NodeSyncRunner } from '../node-sync-runner/runner.js';

function fakeRunner(outcomes: Array<Partial<{ pull: string; http: number; code: string | null; push: string; pushCode: string | null }>>): NodeSyncRunner & { calls: number } {
  const state = {
    calls: 0,
    lastOkAt: null as string | null,
    lastError: null as string | null,
    lastErrorAt: null as string | null,
    itemsLastRun: 0,
    byDomain: {} as Record<string, number>,
    lastPushOkAt: null as string | null,
    lastPushError: null as string | null
  };
  const runner = {
    calls: 0,
    configured: () => true,
    status: () => ({
      v: 1 as const,
      last_ok_at: state.lastOkAt,
      last_error: state.lastError,
      last_error_at: state.lastErrorAt,
      items_last_run: state.itemsLastRun,
      by_domain: state.byDomain,
      last_push_ok_at: state.lastPushOkAt,
      last_push_error: state.lastPushError
    }),
    resetStatus: () => {},
    async syncNow() {
      const o = outcomes[Math.min(runner.calls, outcomes.length - 1)];
      runner.calls += 1;
      switch (o.pull) {
        case 'ok':
          return { status: 'ok' as const, items: 0, pages: 1, by_domain: {} };
        case 'unconfigured':
          return { status: 'unconfigured' as const };
        case 'auth_error':
          return { status: 'auth_error' as const };
        case 'network_error':
          return { status: 'network_error' as const, message: 'down' };
        case 'http_error':
          return { status: 'http_error' as const, http: o.http ?? 500, code: o.code ?? null };
        case 'ingest_error':
          return { status: 'ingest_error' as const, http: 500, message: 'ingest down' };
        default:
          return { status: 'ok' as const, items: 0, pages: 1, by_domain: {} };
      }
    },
    async pushNow() {
      const o = outcomes[Math.min(runner.calls - 1, outcomes.length - 1)];
      switch (o.push) {
        case 'ok':
          return { status: 'ok' as const, sent: 0 };
        case 'skipped':
          return { status: 'skipped' as const };
        case 'network_error':
          return { status: 'network_error' as const, message: 'down' };
        case 'outbox_error':
          return { status: 'outbox_error' as const, http: 500 };
        case 'push_failed':
          return { status: 'push_failed' as const, code: o.pushCode ?? null };
        default:
          return { status: 'ok' as const, sent: 0 };
      }
    }
  };
  return runner as unknown as NodeSyncRunner & { calls: number };
}

function fakeStore(): { store: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }; map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, store: { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) } };
}

/** زمان‌سنج دستی — هیچ setTimeout واقعی؛ تیک‌ها صریح */
function fakeSchedule(): { fn: (fn: () => void, ms: number) => () => void; tick(): void; lastDelay: number } {
  let pending: (() => void) | null = null;
  const s = {
    lastDelay: 0,
    fn: (fn: () => void, ms: number) => {
      pending = fn;
      s.lastDelay = ms;
      return () => {
        pending = null;
      };
    },
    tick() {
      const f = pending;
      pending = null;
      f?.();
    }
  };
  return s;
}

let clock = 0;
const now = () => new Date(clock);
const jitter = () => 1; // بدون لرزش — عدد دقیق برای آزمون

describe('هماهنگ‌ساز سینک — ماتریس خرابی', () => {
  it('خطای شبکه → backoff نمایی ۳۰s → ۶۰s → ۱۲۰s و ادامهٔ خودکار', async () => {
    const runner = fakeRunner([
      { pull: 'network_error' }, { pull: 'network_error' }, { pull: 'network_error' }
    ]);
    const { store } = fakeStore();
    const sched = fakeSchedule();
    const coord: SyncCoordinator = createSyncCoordinator({
      runner, progressStorage: store, now, jitter, scheduleFn: sched.fn,
      intervalMs: 1_800_000, baseBackoffMs: 30_000, maxBackoffMs: 6 * 3_600_000
    });
    coord.start();

    const r1 = await coord.runNow();
    expect(r1.pull.status).toBe('network_error');
    let st = coord.state();
    expect(st.mode).toBe('auto');
    expect(st.consecutive_failures).toBe(1);
    expect(st.last_error_kind).toBe('network');
    expect(st.backoff_ms).toBe(30_000);

    await coord.runNow();
    st = coord.state();
    expect(st.backoff_ms).toBe(60_000);

    await coord.runNow();
    st = coord.state();
    expect(st.backoff_ms).toBe(120_000);
    expect(st.next_attempt_at).not.toBeNull();
    expect(readCoordinatorState(store).mode).toBe('auto');
  });

  it('auth_error → قرنطینه: بدون تلاش خودکار، خروج با notifyCredentialsChanged', async () => {
    const runner = fakeRunner([{ pull: 'auth_error' }, { pull: 'ok' }]);
    const { store } = fakeStore();
    const sched = fakeSchedule();
    const coord = createSyncCoordinator({ runner, progressStorage: store, now, jitter, scheduleFn: sched.fn });
    coord.start();

    await coord.runNow();
    expect(coord.state().mode).toBe('quarantined');
    expect(coord.state().next_attempt_at).toBeNull();
    // حتی بعد از تیک زمان‌سنج هم تلاش خودکار نه — تیک فقط وقتی auto برنامه‌ریزی شده
    expect(sched.lastDelay).toBeGreaterThanOrEqual(1000);

    coord.notifyCredentialsChanged();
    expect(coord.state().mode).toBe('auto');
    // تلاش فوری برنامه‌ریزی شده (۱ ثانیه بعد)
    expect(coord.state().next_attempt_at).not.toBeNull();
  });

  it('HTTP 426 → paused_version تا آپدیت', async () => {
    const runner = fakeRunner([{ pull: 'http_error', http: 426, code: 'NODE_MIN_VERSION' }]);
    const { store } = fakeStore();
    const coord = createSyncCoordinator({ runner, progressStorage: store, now, jitter, scheduleFn: fakeSchedule().fn });
    await coord.runNow();
    expect(coord.state().mode).toBe('paused_version');
    expect(coord.state().last_error_kind).toBe('version');
  });

  it('موفقیت → ریست شکست‌ها و بازگشت به دورهٔ پایه؛ push هم دور می‌شود', async () => {
    const runner = fakeRunner([{ pull: 'network_error' }, { pull: 'ok', push: 'ok' }]);
    const { store } = fakeStore();
    const coord = createSyncCoordinator({ runner, progressStorage: store, now, jitter, scheduleFn: fakeSchedule().fn, intervalMs: 1_800_000 });
    await coord.runNow(); // شکست
    await coord.runNow(); // موفق + پوش ok
    const st = coord.state();
    expect(st.mode).toBe('auto');
    expect(st.consecutive_failures).toBe(0);
    expect(st.backoff_ms).toBe(1_800_000);
    expect(st.last_error_kind).toBe('none');
  });

  it('ingest_error → backoff کوتاه ۶۰s (بدون قرنطینه)', async () => {
    const runner = fakeRunner([{ pull: 'ingest_error' }]);
    const { store } = fakeStore();
    const coord = createSyncCoordinator({ runner, progressStorage: store, now, jitter, scheduleFn: fakeSchedule().fn });
    await coord.runNow();
    const st = coord.state();
    expect(st.mode).toBe('auto');
    expect(st.backoff_ms).toBe(60_000);
    expect(st.last_error_kind).toBe('ingest');
  });

  it('push با auth_error → قرنطینه حتی وقتی pull ok است', async () => {
    const runner = fakeRunner([{ pull: 'ok', push: 'push_failed', pushCode: 'auth_error' }]);
    const { store } = fakeStore();
    const coord = createSyncCoordinator({ runner, progressStorage: store, now, jitter, scheduleFn: fakeSchedule().fn });
    await coord.runNow();
    expect(coord.state().mode).toBe('quarantined');
    expect(coord.state().last_error_kind).toBe('auth');
  });
});
