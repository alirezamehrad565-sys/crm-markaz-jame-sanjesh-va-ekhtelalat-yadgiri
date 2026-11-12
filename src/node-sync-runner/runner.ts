/**
 * rust-f9 + rust-f11 — زمان‌بند سینک میز: pull محتوا از ابر + push نود (چانک فقط-دسکتاپ)
 *
 * حلقهٔ گم‌شدهٔ فاز ۴: کلاینت node-sync-client ساخته و در drill اثبات شده بود اما به
 * چرخهٔ اجرا سیم نشده بود. این ماژول:
 *  ۱) با همان اعتبار «اتصال ابر» (record + مخزن امن) یک client می‌سازد — cursor و مُهر
 *     تلاش در انبار پیشرفت (localStorage شکل) می‌مانند، راز هرگز آنجا نمی‌رود.
 *  ۲) syncNow: pull فرصت‌طلب صفحه‌به‌صفحه (سقف maxPages) و استقرار هر صفحه در موتور محلی
 *     با POST /api/internal/sync/ingest (توکن سشن کارمند) — همه‌چیز نرم (قرارداد drill §۳-۱۱):
 *     هیچ تابعی throw نمی‌کند؛ خطا در وضعیت می‌نشیند و دورهٔ بعد دوباره تلاش می‌شود.
 *  ۳) وضعیت «آخرین همگامی» در انبار پیشرفت — نشانگر پنل تنظیمات همان را می‌خواند.
 *  ۴) pushNow (rust-f11): پوش نود جدا از pull — آیتم‌های قابل‌پوش را از outbox موتور محلی
 *     می‌خواند (GET /api/internal/sync/outbox?since=watermark — همان مبدا، فقط توکن سشن
 *     کارمند) و با client.push به ابر می‌فرستد؛ watermark خودش در انبار پیشرفت است و
 *     گات ۱۵دقیقه‌ای + فهرست سفید سمت کلاینت سر جایشان اعتبار دارند. همه‌چیز نرم — هیچ throwی.
 * فهرست سفید سه‌لایه دست‌نخورده: ابر (pull) ← کلاینت (client.ts) ← سرور میز (internal-sync).
 * push مسیر معکوس است: موتور محلی (outbox) → client.push (پیش‌فیلتر فهرست سفید) → ابر (node/push).
 */
import { createNodeSyncClient } from '../node-sync-client/client.js';
import type { NodeSyncStore } from '../node-sync-client/client.js';

/** کلید وضعیت آخرین همگامی در انبار پیشرفت */
export const SYNC_STATUS_KEY = 'nodesync:last-status-v1';
/** سقف صفحات در هر دورهٔ syncNow — جلوگیری از حلقهٔ بی‌پایان روی cursor خراب ابر */
export const SYNC_MAX_PAGES_DEFAULT = 20;
/** کلید watermark پوش در انبار پیشرفت — ISO آخرین push موفق (rust-f11) */
export const PUSH_WATERMARK_KEY = 'nodesync:push-watermark-v1';
/** مسیر outbox موتور محلی — قرارداد ثابت rust-f11 (همان مبدا؛ فقط توکن سشن کارمند) */
const OUTBOX_PATH = '/api/internal/sync/outbox';

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
  /** rust-f11 — آخرین دورهٔ push موفق به ابر (ISO) — اختیاری برای سازگاری رو به جلو */
  last_push_ok_at?: string | null;
  /** rust-f11 — خطای نرم آخرین push ناموفق (outbox/پوش) */
  last_push_error?: string | null;
}

export type SyncNowOutcome =
  | { status: 'ok'; items: number; pages: number; by_domain: Record<string, number> }
  | { status: 'unconfigured' }
  | { status: 'auth_error' }
  | { status: 'http_error'; http: number; code: string | null }
  | { status: 'network_error'; message: string }
  | { status: 'ingest_error'; http: number; message: string | null };

/** نتیجهٔ نرم pushNow (rust-f11) — هیچ مسیری throw نمی‌کند (قرارداد drill §۳-۱۱) */
export type PushNowOutcome =
  | { status: 'unconfigured' }
  | { status: 'ok'; sent: number }
  | { status: 'skipped' }
  | { status: 'push_failed'; code: string | null }
  | { status: 'network_error'; message: string }
  | { status: 'outbox_error'; http: number };

/** آیتم outbox موتور محلی — هم‌شکل قرارداد GET /api/internal/sync/outbox (rust-f11) */
interface OutboxItem {
  id: string;
  domain: string;
  at: string | null;
  payload: Record<string, unknown>;
}

/** قرارداد fetch زمان‌بند — پاسخ کامل Response یا ساده‌شدهٔ FetchLike (فقط status مصرف می‌شود) */
export type RunnerFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response | { ok: boolean; status: number; json?: () => Promise<unknown> }>;

/** پاسخ fetch زمان‌بند پس از await — Response واقعی یا FetchLike ساده‌شدهٔ RunnerFetch */
type RunnerFetchRes = Awaited<ReturnType<RunnerFetch>>;

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
  /** rust-f11 — پوش نود: outbox موتور محلی → client.push → ابر؛ جدا از syncNow و جدا از watermark pull */
  pushNow(): Promise<PushNowOutcome>;
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
  return {
    v: 1,
    last_ok_at: null,
    last_error: null,
    last_error_at: null,
    items_last_run: 0,
    by_domain: {},
    last_push_ok_at: null,
    last_push_error: null
  };
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

/**
 * پارس دفاعی بدنهٔ outbox (rust-f11) — null یعنی بدنه خارج از قرارداد → خطای نرم.
 * آیتم خراب تک‌تک دور انداخته می‌شود تا یک عضو مسموم همهٔ پوش را نکشد.
 */
function parseOutbox(parsed: unknown): { items: OutboxItem[]; generatedAt: string | null } | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const data = (parsed as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const d = data as { items?: unknown; generated_at?: unknown };
  if (!Array.isArray(d.items)) return null;
  const items: OutboxItem[] = [];
  for (const raw of d.items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id.length === 0) continue;
    if (typeof r.domain !== 'string' || r.domain.length === 0) continue;
    if (!r.payload || typeof r.payload !== 'object' || Array.isArray(r.payload)) continue;
    items.push({
      id: r.id,
      domain: r.domain,
      at: typeof r.at === 'string' ? r.at : null,
      payload: r.payload as Record<string, unknown>
    });
  }
  return {
    items,
    generatedAt: typeof d.generated_at === 'string' && d.generated_at.length > 0 ? d.generated_at : null
  };
}

/** بزرگ‌ترین at معتبر آیتم‌ها — items صعودی‌اند ولی برای دفاع max حسابی می‌گیریم (rust-f11) */
function maxAtOf(items: readonly OutboxItem[]): string | null {
  let best: string | null = null;
  let bestT = Number.NaN;
  for (const it of items) {
    if (!it.at) continue;
    const t = Date.parse(it.at);
    if (Number.isNaN(t)) continue;
    if (Number.isNaN(bestT) || t > bestT) {
      bestT = t;
      best = it.at;
    }
  }
  return best;
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

  // ---- push (rust-f11): watermark پوش و ثبت وضعیت آن در همان SyncStatusV1 ----

  function readWatermark(): string | null {
    try {
      const raw = progress.getItem(PUSH_WATERMARK_KEY);
      return raw && !Number.isNaN(Date.parse(raw)) ? raw : null; // watermark خراب = ندیده بگیر
    } catch {
      return null;
    }
  }

  function writeWatermark(v: string): void {
    try {
      progress.setItem(PUSH_WATERMARK_KEY, v);
    } catch {
      // انبار ناموفق = نرم — دورهٔ بعد همان آیتم‌ها دوباره می‌روند (ابر duplicate را می‌شمارد)
    }
  }

  /** ثبت یک دورهٔ push موفق (حتی با sent:0) — خطای قبلی پاک می‌شود */
  function recordPushOk(): void {
    try {
      const st = readStatus(progress);
      writeStatus({ ...st, last_push_ok_at: now().toISOString(), last_push_error: null });
    } catch {
      // نرم — ثبت وضعیت هرگز pushNow را نمی‌کشد
    }
  }

  /** ثبت شکست نرم push/outbox — last_push_ok_at دست‌نخورده می‌ماند */
  function recordPushError(message: string): void {
    try {
      const st = readStatus(progress);
      writeStatus({ ...st, last_push_error: message });
    } catch {
      // نرم
    }
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
    },

    // rust-f11 — پوش نود: outbox موتور محلی → client.push → ابر. جدا از syncNow؛
    // خطای outbox/پوش هرگز throw نمی‌شود و watermark فقط با موفقیت جلو می‌رود.
    async pushNow() {
      if (!opts.baseUrl || !opts.nodeCode || !opts.nodeKey) return { status: 'unconfigured' };

      // ۱) outbox موتور محلی — همان مبدا، فقط توکن سشن کارمند (نه اعتبار نود)؛ از watermark
      const since = readWatermark();
      const token = opts.tokenProvider?.() ?? null;
      if (!token) {
        recordPushError('توکن سشن در دسترس نیست');
        return { status: 'outbox_error', http: 0 };
      }
      let res: RunnerFetchRes;
      try {
        res = await fetchFn(`${OUTBOX_PATH}${since ? `?since=${encodeURIComponent(since)}` : ''}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        recordPushError(`outbox: ${message}`);
        return { status: 'network_error', message };
      }
      if (res.status !== 200) {
        recordPushError(`outbox: HTTP ${res.status}`);
        return { status: 'outbox_error', http: res.status };
      }

      // ۲) پارس دفاعی بدنه — بدنهٔ خراب/خارج از قرارداد = خطای نرم outbox
      let parsed: unknown = null;
      try {
        if ('json' in res && typeof res.json === 'function') parsed = await res.json();
      } catch {
        parsed = null; // بدنهٔ خوانا نیست → پایین‌تر به‌عنوان outbox_error نرم دیده می‌شود
      }
      const box = parseOutbox(parsed);
      if (!box) {
        recordPushError(`outbox: HTTP ${res.status} (بدنهٔ خارج از قرارداد)`);
        return { status: 'outbox_error', http: res.status };
      }

      // ۳) outbox خالی → بدون هیچ push؛ watermark تا generated_at می‌رود
      if (box.items.length === 0) {
        if (box.generatedAt) writeWatermark(box.generatedAt);
        recordPushOk();
        return { status: 'ok', sent: 0 };
      }

      // ۴) push از راه کلاینت — گات ۱۵دقیقه‌ای و فهرست سفید همان‌جا اعمال می‌شود
      const push = await client.push({ items: box.items });
      if (push.status === 'ok') {
        // watermark = بزرگ‌ترین at آیتم‌های فرستاده (نبود at معتبر → generated_at)
        const mark = maxAtOf(box.items) ?? box.generatedAt;
        if (mark) writeWatermark(mark);
        recordPushOk();
        return { status: 'ok', sent: box.items.length };
      }
      if (push.status === 'skipped') {
        return { status: 'skipped' }; // گات کلاینت — watermark دست‌نخورده، دورهٔ بعد
      }

      // ۵) بقیهٔ وضعیت‌های client.push = شکست نرم — watermark دست‌نخورده می‌ماند
      if (push.status === 'network_error') {
        recordPushError(`push: ${push.message}`);
        return { status: 'network_error', message: push.message };
      }
      let code: string | null;
      if (push.status === 'http_error') {
        code = push.code;
        recordPushError(`push: HTTP ${push.http}${push.code ? ` (${push.code})` : ''}`);
      } else if (push.status === 'throttled') {
        code = 'throttled';
        recordPushError(`push: throttled${push.retryAfterS !== null ? ` (retry_after_s=${push.retryAfterS})` : ''}`);
      } else if (push.status === 'rejected_domains') {
        code = 'rejected_domains';
        recordPushError(`push: rejected_domains (${push.domains.join(',')})`);
      } else if (push.status === 'auth_error') {
        code = 'auth_error';
        recordPushError('push: auth_error');
      } else {
        code = 'unconfigured'; // دست‌نیافتنی — runner خودش اعتبار را پیش‌تر چک کرده
        recordPushError('push: unconfigured');
      }
      return { status: 'push_failed', code };
    }
  };
}
