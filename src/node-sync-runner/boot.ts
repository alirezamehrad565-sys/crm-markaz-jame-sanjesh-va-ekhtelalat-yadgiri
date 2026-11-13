/**
 * rust-f14 — ماشهٔ بوت همگام‌سازی جبرانی سینک نود (فقط-دسکتاپ)
 *
 * سند: docs/rust/node-sync.md §استقرار · بریف rust-f14
 * سناریو: درمانگر هفته‌ها اپ را باز نکرده؛ با بوت (app.js → maybeRunSetup پس از ورود) این
 * ماژول یک‌بار «همگام‌سازی جبرانی» دوطرفه می‌زند و بعدش تیک‌های عادی ۳۰دقیقه‌ای همان
 * هماهنگ‌ساز ادامه می‌یابد.
 * قواعد سخت:
 *  • یک‌بار در هر فرایند — فراخوانی دوم (مثلاً «ویرایش اتصال» که maybeRunSetup را دوباره
 *    می‌زند) کاری نمی‌کند.
 *  • fire-and-forget — هیچ awaitی مسیر بوت/ویزار را نگه نمی‌دارد و هیچ خطایی آن را نمی‌بندد:
 *    همه‌چیز در try/catch است، خطا فقط warn + وضعیت error در انبار پیشرفت می‌شود.
 *  • اعتبار از «اتصال ابر» (record + مخزن امن) می‌آید؛ راز هرگز انبار نمی‌شود — همان قرارداد
 *    panel.ts. اعتبار ناقص = runner خودش offline را آینه می‌کند (بدون هیچ fetch).
 */
import { createNodeSyncRunner, CATCHUP_STATE_KEY } from './runner.js';
import type { CatchUpStateV1, NodeSyncRunner, RunnerFetch } from './runner.js';
import { createSyncCoordinator, COORD_INTERVAL_MS_DEFAULT } from './coordinator.js';
import type { SyncCoordinator } from './coordinator.js';
import type { NodeSyncStore } from '../node-sync-client/client.js';

export interface BootCatchUpDeps {
  /** اعتبار از اتصال ابر — در لحظهٔ بوت خوانده می‌شود (راز در انبار نمی‌نشیند) */
  getCreds: () => Promise<{ baseUrl: string | null; nodeCode: string | null; nodeKey: string | null }>;
  /** انبار پیشرفت — هم‌انبار cursor/مُهر/وضعیت client و هماهنگ‌ساز (پیش‌فرض localStorage) */
  progressStorage?: NodeSyncStore;
  /** توکن سشن کارمند برای مسیر استقرار/آینهٔ وضعیت (کلید cs.token پوسته) */
  tokenProvider: () => string | null;
  /** fetch تزریق‌پذیر — قرارداد string-input هم‌سازگار با FetchLike اتصال ابر */
  fetchFn?: RunnerFetch;
  now?: () => Date;
  /** فقط آزمون — جایگزین سازندهٔ هماهنگ‌ساز برای شبیه‌سازی پرتاب */
  coordinatorFactory?: (runner: NodeSyncRunner) => SyncCoordinator;
}

let bootCatchUpStarted = false;

/** بازنشانی گارد «یک‌بار در فرایند» — فقط آزمون */
export function resetNodeSyncBootCatchUpForTests(): void {
  bootCatchUpStarted = false;
}

/**
 * شروع catch-up بوت — بلافاصله برمی‌گردد (شروع شد/نشد) و کار واقعی در پس‌زمینه است.
 * { started: false } یعنی در این فرایند قبلاً شروع شده — دوباره اجرا نمی‌شود.
 */
export function startNodeSyncBootCatchUp(deps: BootCatchUpDeps): { started: boolean } {
  if (bootCatchUpStarted) return { started: false };
  bootCatchUpStarted = true;
  const nowFn = deps.now ?? (() => new Date());

  // fire-and-forget — هیچ خطایی بوت را نمی‌بندد (حکم م۲۱۰: خطا فقط warn + وضعیت نرم)
  void (async () => {
    try {
      const creds = await deps.getCreds();
      const runner = createNodeSyncRunner({
        baseUrl: creds.baseUrl,
        nodeCode: creds.nodeCode,
        nodeKey: creds.nodeKey,
        progressStorage: deps.progressStorage,
        tokenProvider: deps.tokenProvider,
        fetchFn: deps.fetchFn,
        now: deps.now
      });
      const coordinator = deps.coordinatorFactory
        ? deps.coordinatorFactory(runner)
        : createSyncCoordinator({
            runner,
            progressStorage: deps.progressStorage,
            now: deps.now,
            intervalMs: COORD_INTERVAL_MS_DEFAULT
          });
      coordinator.start(); // تیک‌های عادی ۳۰دقیقه‌ای از همین بوت ادامه می‌یابد
      await coordinator.runCatchUp(); // یک‌بار در بوت — قرارداد نرم؛ خودش وضعیت/آینه را می‌نویسد
    } catch (err) {
      // خطای catch-up بوت هرگز بوت را نمی‌شکند — فقط warn + وضعیت error در انبار پیشرفت
      try {
        const g = globalThis as { localStorage?: NodeSyncStore };
        const progress = deps.progressStorage ?? g.localStorage;
        progress?.setItem(
          CATCHUP_STATE_KEY,
          JSON.stringify({
            v: 1,
            state: 'error',
            started_at: null,
            last_run_at: nowFn().toISOString(),
            pages_last_run: 0,
            items_pulled_last_run: 0,
            batches_last_run: 0,
            items_pushed_last_run: 0,
            last_error_kind: 'network',
            last_error_at: nowFn().toISOString()
          } satisfies CatchUpStateV1)
        );
      } catch {
        // نرم — انبار ناموفق هم چیزی را نمی‌شکند
      }
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[node-sync] همگام‌سازی جبرانی بوت ناموفق بود — نرم ادامه می‌دهیم: ${message}`);
    }
  })();

  return { started: true };
}
