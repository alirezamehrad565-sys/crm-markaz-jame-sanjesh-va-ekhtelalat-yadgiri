/**
 * کلاینت سینک نود دسکتاپ (rust-f4) — ماژول خالص TS بدون وابستگی
 * سند قرارداد: docs/rust/node-sync.md · طراحی: docs/rust/design.md §۵ · drill: §۳-۱۱
 *
 * جای مصرف: پوستهٔ دسکتاپ (فاز ۲ خط rust) — هر دورهٔ سینک پس از ورود موفق/شبانه.
 * اصول:
 *  • fetch تزریق‌پذیر (آزمون با makeFetch؛ محیط واقعی fetch سراسری) و ذخیره‌سازی
 *    تزریق‌پذیر با اینترفیس سازگار localStorage (کلید نود + cursor + مُهر تلاش).
 *  • فهرست سفید سمت کلاینت هم اعمال می‌شود (دفاع در عمق): آیتم‌های دامنهٔ ممنوع
 *    هرگز از میز خارج نمی‌شوند — سرور مرجع است، این لایه پیش‌فیلتر است.
 *  • قرارداد خطای نرم: هیچ تابعی هرگز throw نمی‌کند — همه‌چیز در خروجی وضعیت است؛
 *    قطع شبکه/۴۰۱/۴۰۴ فقط خروجی نرم می‌دهد و دورهٔ بعد دوباره تلاش می‌شود (حکم م۲۱۰).
 *  • کلید غایب = unconfigured بدون هیچ fetch (drill §۳-۱۱).
 *  • مُهر تلاش push سمت کلاینت هم ۱۵ دقیقه است (هم‌الگوی m1.5؛ مُهر قبل از ارسال).
 *  • هدرها عین قرارداد cp-*: X-CP-Node-Code + Authorization: Bearer + X-CP-Node-Version.
 * فهرست سفیدها آینهٔ سمت ورکر است — دو سمت باید همیشه با هم تغییر کنند (سند §۴).
 */

/** دامنه‌های مجاز pull — آینهٔ NODE_PULL_DOMAINS سمت ورکر (docs/rust/node-sync.md) */
export const NODE_PULL_DOMAINS = ['announcements', 'packages', 'library'] as const;
/** دامنه‌های مجاز push — آینهٔ NODE_PUSH_DOMAINS سمت ورکر */
export const NODE_PUSH_DOMAINS = ['usage_summary', 'client_errors', 'health_ping'] as const;

export const NODE_PULL_DOMAIN_SET: ReadonlySet<string> = new Set(NODE_PULL_DOMAINS);
export const NODE_PUSH_DOMAIN_SET: ReadonlySet<string> = new Set(NODE_PUSH_DOMAINS);

/** حداقل فاصلهٔ دو push — هم‌ریتم گات ۱۵دقیقه‌ای ورکر (م۱.۵) */
export const NODE_PUSH_MIN_INTERVAL_MS = 15 * 60_000;

/** ذخیره‌ساز تزریق‌شده — همان شکل localStorage؛ روی میز می‌تواند فروشگاه Tauri باشد */
export interface NodeSyncStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** آیتم push از دید کلاینت — دامنه رشته است تا پیش‌فیلتر بتواند ممنوع را ببیند */
export interface NodePushItemInput {
  id: string;
  domain: string;
  at?: string | null;
  payload: Record<string, unknown>;
}

export interface NodePullItem {
  id: string;
  domain: string;
  updated_at: string;
  payload: Record<string, unknown>;
}

/** همهٔ خروجی‌ها نرم‌اند — هیچ وضعیتی throw نمی‌شود (قرارداد خطای نرم drill §۳-۱۱) */
export type PullOutcome =
  | { status: 'ok'; items: NodePullItem[]; nextCursor: string | null; serverTime: string | null }
  | { status: 'unconfigured' }
  | { status: 'auth_error' }
  | { status: 'network_error'; message: string }
  | { status: 'http_error'; http: number; code: string | null };

export type PushOutcome =
  | { status: 'ok'; accepted: number; duplicates: number; rejectedDomains: string[] }
  | { status: 'throttled'; retryAfterS: number | null; rejectedDomains: string[] }
  | { status: 'skipped'; reason: 'interval_gate'; rejectedDomains: string[] }
  | { status: 'rejected_domains'; domains: string[] }
  | { status: 'unconfigured'; rejectedDomains: string[] }
  | { status: 'auth_error'; rejectedDomains: string[] }
  | { status: 'network_error'; message: string; rejectedDomains: string[] }
  | { status: 'http_error'; http: number; code: string | null; rejectedDomains: string[] };

export interface NodeSyncClientOptions {
  /** مبدأ ورکر — مثل https://center.example.com (بدون /node) */
  baseUrl: string;
  /** ذخیره‌ساز کلید نود/cursor/مُهر — سازگار localStorage */
  storage: NodeSyncStore;
  /** کلید نود از ذخیره‌ساز خوانده می‌شود (هرگز در options پاس نمی‌شود) */
  nodeCodeKey?: string;
  nodeKeyKey?: string;
  /** fetch تزریق‌پذیر — پیش‌فرض fetch سراسری؛ آزمون makeFetch می‌فرستد */
  fetchFn?: typeof fetch;
  /** تزریق زمان — فقط آزمون */
  now?: () => Date;
  /** بازنویسی گات ۱۵دقیقه‌ای سمت کلاینت — فقط آزمون */
  pushMinIntervalMs?: number;
  /** نشان نسخهٔ نود در هدر X-CP-Node-Version (اختیاری) */
  clientVersion?: string;
}

const CODE_KEY_DEFAULT = 'nodesync:node-code';
const KEY_KEY_DEFAULT = 'nodesync:node-key';
const ATTEMPT_KEY = 'nodesync:last-push-attempt';

export interface NodeSyncClient {
  /** pull فرصت‌طلب با cursor پایدار — cursor فقط بعد از پاسخ ok جلو می‌رود */
  pull(args?: { domains?: readonly string[]; limit?: number }): Promise<PullOutcome>;
  /** push با پیش‌فیلتر فهرست سفید — آیتم ممنوع هرگز ارسال نمی‌شود */
  push(args: { items: readonly NodePushItemInput[] }): Promise<PushOutcome>;
  /** وضعیت اعتبار ثبت‌شده محلی — بدون هیچ شبکه */
  credentials(): { nodeCode: string | null; hasKey: boolean };
  /** پاک‌کردن cursor یک دامنه‌مجموعه (بازسازی کامل اختیاری) */
  resetCursor(domains?: readonly string[]): void;
}

export function createNodeSyncClient(opts: NodeSyncClientOptions): NodeSyncClient {
  const storage = opts.storage;
  const fetchFn = opts.fetchFn ?? fetch;
  const now = opts.now ?? (() => new Date());
  const minIntervalMs = opts.pushMinIntervalMs ?? NODE_PUSH_MIN_INTERVAL_MS;
  const codeKey = opts.nodeCodeKey ?? CODE_KEY_DEFAULT;
  const keyKey = opts.nodeKeyKey ?? KEY_KEY_DEFAULT;
  const base = opts.baseUrl.replace(/\/+$/, '');

  function readCreds(): { nodeCode: string | null; nodeKey: string | null } {
    const code = storage.getItem(codeKey)?.trim() || null;
    const key = storage.getItem(keyKey)?.trim() || null;
    return { nodeCode: code, nodeKey: key };
  }

  function cursorKeyFor(domains: readonly string[]): string {
    return `nodesync:cursor:${domains.length > 0 ? [...domains].sort().join('+') : 'all'}`;
  }

  function domainKeyOf(domains?: readonly string[]): string[] {
    const requested = domains && domains.length > 0 ? [...domains] : [...NODE_PULL_DOMAINS];
    return requested;
  }

  async function rawRequest(
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<{ http: number; body: unknown; networkError: string | null }> {
    try {
      const res = await fetchFn(url, {
        method,
        headers: body !== undefined ? { ...headers, 'content-type': 'application/json' } : headers,
        body
      });
      let parsed: unknown = null;
      try {
        const text = await res.text();
        if (text.length > 0) parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = null; // بدنهٔ خراب = null؛ وضعیت HTTP خودش گویاست
      }
      return { http: res.status, body: parsed, networkError: null };
    } catch (err) {
      return { http: 0, body: null, networkError: err instanceof Error ? err.message : String(err) };
    }
  }

  function errorEnvelopeOf(body: unknown): string | null {
    if (body && typeof body === 'object' && 'error' in (body as Record<string, unknown>)) {
      const code = (body as Record<string, unknown>).error;
      return typeof code === 'string' ? code : null;
    }
    return null;
  }

  return {
    credentials() {
      const { nodeCode, nodeKey } = readCreds();
      return { nodeCode, hasKey: Boolean(nodeKey) };
    },

    resetCursor(domains) {
      // خالی = بدون cursor → دورهٔ بعد صفحهٔ نخست (بازسازی کامل اختیاری)
      storage.setItem(cursorKeyFor(domainKeyOf(domains)), '');
    },

    async pull(args) {
      try {
        const domains = domainKeyOf(args?.domains);
        const { nodeCode, nodeKey } = readCreds();
        if (!nodeCode || !nodeKey) return { status: 'unconfigured' };

        const cursorStoreKey = cursorKeyFor(domains);
        const cursor = storage.getItem(cursorStoreKey);
        const url = new URL(`${base}/node/pull`);
        url.searchParams.set('domains', domains.join(','));
        if (cursor) url.searchParams.set('cursor', cursor);
        if (args?.limit && args.limit > 0) url.searchParams.set('limit', String(Math.min(args.limit, 100)));

        const r = await rawRequest('GET', url.toString(), {
          'X-CP-Node-Code': nodeCode,
          Authorization: `Bearer ${nodeKey}`,
          ...(opts.clientVersion ? { 'X-CP-Node-Version': opts.clientVersion } : {})
        });
        if (r.networkError !== null) return { status: 'network_error', message: r.networkError };
        if (r.http === 401) return { status: 'auth_error' };
        if (r.http !== 200) {
          return { status: 'http_error', http: r.http, code: errorEnvelopeOf(r.body) };
        }
        const data = (r.body as { data?: { items?: unknown; next_cursor?: unknown; server_time?: unknown } } | null)?.data;
        const items = Array.isArray(data?.items) ? (data?.items as NodePullItem[]) : [];
        const nextCursor = typeof data?.next_cursor === 'string' ? (data?.next_cursor as string) : null;
        // cursor فقط بعد از پاسخ کامل ok ذخیره می‌شود — قطعی وسط راه = تکرار همان صفحه
        storage.setItem(cursorStoreKey, nextCursor ?? '');
        return {
          status: 'ok',
          items,
          nextCursor,
          serverTime: typeof data?.server_time === 'string' ? (data?.server_time as string) : null
        };
      } catch (err) {
        return { status: 'network_error', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async push(args) {
      try {
        const items = [...(args?.items ?? [])];
        // ۱) فهرست سفید سمت کلاینت — دامنهٔ ممنوع هرگز از میز خارج نمی‌شود (دفاع در عمق)
        const allowed = items.filter((it) => NODE_PUSH_DOMAIN_SET.has(it.domain));
        const rejectedDomains = [...new Set(items.filter((it) => !NODE_PUSH_DOMAIN_SET.has(it.domain)).map((it) => it.domain))];
        if (allowed.length === 0) {
          return rejectedDomains.length > 0
            ? { status: 'rejected_domains', domains: rejectedDomains }
            : { status: 'rejected_domains', domains: [] };
        }

        // ۲) اعتبار محلی — کلید غایب = هیچ fetch ای هم زده نمی‌شود (drill §۳-۱۱)
        const { nodeCode, nodeKey } = readCreds();
        if (!nodeCode || !nodeKey) return { status: 'unconfigured', rejectedDomains };

        // ۳) گات ۱۵دقیقه‌ای سمت کلاینت — مُهر قبل از ارسال (هم‌الگوی m1.5؛ خطا = دورهٔ بعد)
        const at = now();
        const last = storage.getItem(ATTEMPT_KEY);
        const lastT = last ? Date.parse(last) : Number.NaN;
        if (!Number.isNaN(lastT) && at.getTime() - lastT < minIntervalMs) {
          return { status: 'skipped', reason: 'interval_gate', rejectedDomains };
        }
        storage.setItem(ATTEMPT_KEY, at.toISOString());

        // ۴) ارسال — خطای شبکه/HTTP هرگز throw نمی‌شود
        const r = await rawRequest(
          'POST',
          `${base}/node/push`,
          {
            'X-CP-Node-Code': nodeCode,
            Authorization: `Bearer ${nodeKey}`,
            ...(opts.clientVersion ? { 'X-CP-Node-Version': opts.clientVersion } : {})
          },
          JSON.stringify({ items: allowed })
        );
        if (r.networkError !== null) return { status: 'network_error', message: r.networkError, rejectedDomains };
        if (r.http === 401) return { status: 'auth_error', rejectedDomains };
        if (r.http !== 200) return { status: 'http_error', http: r.http, code: errorEnvelopeOf(r.body), rejectedDomains };

        const data = (r.body as { data?: { accepted?: unknown; duplicates?: unknown; throttled?: unknown; retry_after_s?: unknown } } | null)?.data;
        if (data?.throttled === true) {
          return {
            status: 'throttled',
            retryAfterS: typeof data.retry_after_s === 'number' ? data.retry_after_s : null,
            rejectedDomains
          };
        }
        return {
          status: 'ok',
          accepted: typeof data?.accepted === 'number' ? data.accepted : 0,
          duplicates: typeof data?.duplicates === 'number' ? data.duplicates : 0,
          rejectedDomains
        };
      } catch (err) {
        return { status: 'network_error', message: err instanceof Error ? err.message : String(err), rejectedDomains: [] };
      }
    }
  };
}
