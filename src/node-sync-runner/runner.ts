/**
 * rust-f9 — زمان‌بند سینک محتوا از ابر (سمت فرانت‌اند میز — چانک فقط-دسکتاپ)
 *
 * حلقهٔ گم‌شدهٔ فاز ۴: کلاینت node-sync-client ساخته و در drill اثبات شده بود اما به
 * چرخهٔ اجرا سیم نشده بود. این ماژول:
 *  ۱) با همان اعتبار «اتصال ابر» (record + مخزن امن) یک client می‌سازد — cursor و مُهر
 *     تلاش در انبار پیشرفت (localStorage شکل) می‌مانند، راز هرگز آنجا نمی‌رود.
 *  ۲) syncNow: pull فرصت‌طلب صفحه‌به‌صفحه (سقف maxPages) و استقرار هر صفحه در موتور محلی
 *     با POST /api/internal/sync/ingest (توکن سشن کارمند) — همه‌چیز نرم (قرارداد drill §۳-۱۱):
 *     هیچ تابعی throw نمی‌کند؛ خطا در وضعیت می‌نشیند و دورهٔ بعد دوباره تلاش می‌شود.
 *  ۳) وضعیت «آخرین همگامی» در انبار پیشرفت — نشانگر پنل تنظیمات همان را می‌خواند.
 * فهرست سفید سه‌لایه دست‌نخورده: ابر (pull) ← کلاینت (client.ts) ← سرور میز (internal-sync).
 */
import { createNodeSyncClient } from '../node-sync-client/client.js';
import type { NodeSyncStore } from '../node-sync-client/client.js';

/** کلید وضعیت آخرین همگامی در انبار پیشرفت */
export const SYNC_STATUS_KEY = 'nodesync:last-status-v1';
/** سقف صفحات در هر دورهٔ syncNow — جلوگیری از حلقهٔ بی‌پایان روی cursor خراب ابر */
export const SYNC_MAX_PAGES_DEFAULT = 20;

export interface SyncStatusV1 {
  v: 1;
  /** آخرین دورهٔ کامل موفق (ISO) */
  last_ok_at: string | null;
  /** خطای نرم آخرین دورهٔ ناموفق */
  last_error: string | null;
  last_error_at: string | null;
  /** جمع آیتم‌های آخرین دورهٔ موفق */
  items_last_run: number;
  by_domain: Record<string, number>;
}

export type SyncNowOutcome =
  | { status: 'ok'; items: number; pages: number; by_domain: Record<string, number> }
  | { status: 'unconfigured' }
  | { status: 'auth_error' }
  | { status: 'http_error'; http: number; code: string | null }
  | { status: 'network_error'; message: string }
  | { status: 'ingest_error'; http: number; message: string | null };

/** قرارداد fetch زمان‌بند — پاسخ کامل Response یا ساده‌شدهٔ FetchLike (فقط status مصرف می‌شود) */
export type RunnerFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response | { ok: boolean; status: number; json?: () => Promise<unknown> }>;

export interface NodeSyncRunnerOptions {
  baseUrl: string | null;
  nodeCode: string | null;
  nodeKey: string | null;
  /** انبار پیشرفت (cursor/مُهر/وضعیت) — پیش‌فرض localStorage وگرنه حافظهٔ فرایند */
  progressStorage?: NodeSyncStore;
  /** توکن سشن کارمند برای مسیر استقرار موتور (کلید cs.token پوسته) */
  tokenProvider?: () => string | null;
  /** fetch تزریق‌پذیر — قرارداد string-input (سازگار FetchLike اتصال ابر) */
  fetchFn?: RunnerFetch;
  now?: () => Date;
  maxPages?: number;
  /** مسیر استقرار — پیش‌فرض /api/internal/sync/ingest (همان مبدا) */
  ingestPath?: string;
}

export interface NodeSyncRunner {
  configured(): boolean;
  status(): SyncStatusV1;
  syncNow(): Promise<SyncNowOutcome>;
  resetStatus(): void;
}

function memoryStore(): NodeSyncStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

function defaultProgressStorage(): NodeSyncStore {
  const g = globalThis as { localStorage?: NodeSyncStore };
  return g.localStorage ?? memoryStore();
}

function emptyStatus(): SyncStatusV1 {
  return { v: 1, last_ok_at: null, last_error: null, last_error_at: null, items_last_run: 0, by_domain: {} };
}

function readStatus(storage: NodeSyncStore): SyncStatusV1 {
  try {
    const raw = storage.getItem(SYNC_STATUS_KEY);
    if (!raw) return emptyStatus();
    const p = JSON.parse(raw) as Partial<SyncStatusV1>;
    if (p?.v !== 1) return emptyStatus();
    return { ...emptyStatus(), ...p, v: 1 };
  } catch {
    return emptyStatus();
  }
}

export function createNodeSyncRunner(opts: NodeSyncRunnerOptions): NodeSyncRunner {
  const progress = opts.progressStorage ?? defaultProgressStorage();
  const now = opts.now ?? (() => new Date());
  const maxPages = Math.max(1, opts.maxPages ?? SYNC_MAX_PAGES_DEFAULT);
  const ingestPath = opts.ingestPath ?? '/api/internal/sync/ingest';
  const fetchFn = opts.fetchFn ?? ((input: string, init?: RequestInit) => fetch(input, init));

  // انبار اعتبار برای client — راز از options می‌آید (هرگز در انبار نمی‌نشیند)،
  // cursor/مُهر از انبار پیشرفت خوانده/نوشته می‌شوند (کلیدهای استاندارد client).
  const credsStorage: NodeSyncStore = {
    getItem: (k) => {
      if (k === 'nodesync:node-code') return opts.nodeCode?.trim() || null;
      if (k === 'nodesync:node-key') return opts.nodeKey?.trim() || null;
      return progress.getItem(k);
    },
    setItem: (k, v) => progress.setItem(k, v)
  };

  const client = createNodeSyncClient({
    baseUrl: opts.baseUrl ?? '',
    storage: credsStorage,
    // runner فقط URL رشته‌ای می‌سازد — سازگاری نوع با قرارداد typeof fetch کلاینت
    fetchFn: fetchFn as unknown as typeof fetch,
    now
  });

  function writeStatus(next: SyncStatusV1): void {
    progress.setItem(SYNC_STATUS_KEY, JSON.stringify(next));
  }

  return {
    configured() {
      return Boolean(opts.baseUrl && opts.nodeCode && opts.nodeKey);
    },

    status() {
      return readStatus(progress);
    },

    resetStatus() {
      writeStatus(emptyStatus());
    },

    async syncNow() {
      if (!opts.baseUrl || !opts.nodeCode || !opts.nodeKey) return { status: 'unconfigured' };

      const token = opts.tokenProvider?.() ?? null;
      let items = 0;
      let pages = 0;
      const by_domain: Record<string, number> = {};

      for (let page = 0; page < maxPages; page++) {
        const pull = await client.pull();
        if (pull.status !== 'ok') {
          const st = readStatus(progress);
          let message: string;
          if (pull.status === 'network_error') message = pull.message;
          else if (pull.status === 'http_error') message = `HTTP ${pull.http}${pull.code ? ` (${pull.code})` : ''}`;
          else message = pull.status;
          writeStatus({ ...st, last_error: message, last_error_at: now().toISOString() });
          if (pull.status === 'auth_error') return { status: 'auth_error' };
          if (pull.status === 'network_error') return { status: 'network_error', message: pull.message };
          if (pull.status === 'http_error') return { status: 'http_error', http: pull.http, code: pull.code };
          return { status: 'auth_error' }; // دست‌نیافتنی با اعتبار تنظیم‌شده — برای کامل بودن نوع
        }

        if (pull.items.length > 0) {
          if (!token) {
            const st = readStatus(progress);
            writeStatus({ ...st, last_error: 'توکن سشن در دسترس نیست', last_error_at: now().toISOString() });
            return { status: 'ingest_error', http: 0, message: 'توکن سشن در دسترس نیست' };
          }
          let res: { status: number };
          try {
            res = await fetchFn(ingestPath, {
              method: 'POST',
              headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ items: pull.items })
            });
          } catch (err) {
            const st = readStatus(progress);
            const message = err instanceof Error ? err.message : String(err);
            writeStatus({ ...st, last_error: `استقرار: ${message}`, last_error_at: now().toISOString() });
            return { status: 'ingest_error', http: 0, message };
          }
          if (res.status !== 200) {
            const st = readStatus(progress);
            writeStatus({ ...st, last_error: `استقرار: HTTP ${res.status}`, last_error_at: now().toISOString() });
            return { status: 'ingest_error', http: res.status, message: `HTTP ${res.status}` };
          }
          for (const it of pull.items) by_domain[it.domain] = (by_domain[it.domain] ?? 0) + 1;
          items += pull.items.length;
        }

        pages += 1;
        if (!pull.nextCursor) break;
      }

      const st = readStatus(progress);
      writeStatus({
        ...st,
        last_ok_at: now().toISOString(),
        last_error: null,
        last_error_at: null,
        items_last_run: items,
        by_domain
      });
      return { status: 'ok', items, pages, by_domain };
    }
  };
}
