/**
 * فیکسچر مشترک همگام‌سازی جبرانی (rust-f14 + EXP-3) — سیم‌کشی شبکهٔ درون‌حافظه‌ای
 *
 * استخراج‌شده از catchup.test.ts تا آزمون مبتنی بر خاصیت (catchup-property.test.ts) و
 * سنجهٔ کارایی (scripts/bench-catchup.mjs) دقیقاً «همان قرارداد» آزمون‌های موجود را مصرف
 * کنند — نه یک تقلید واگرا:
 *  • ابر — cursor کلیدsetی (base64url {d,t,i}) روی اجتماع مرتب، سقف صفحه ۵۰؛ push با
 *    idempotency جفت (node,id) و شمارش duplicates؛ درخواست بدون هدر جبرانی زیر گات
 *    ۱۵دقیقه‌ای می‌ماند (شبیه‌سازی سمت ابر).
 *  • موتور محلی — صندوق ورودی با PK (domain,id) و شمارش درج/دوباره؛ outbox با since اید
 *    و سقف ۲۰۰ آیتم؛ مسیر آینهٔ وضعیت ضبط می‌شود.
 *  • EXP-1 — مسیر آشتی‌ساز /node/reconcile هم شبیه‌سازی می‌شود: پاسخ از وضعیت واقعی
 *    pullItems و pushEventsِ همین فیک محاسبه می‌شود (نه عدد ساختگی) تا مقایسهٔ runner
 *    همیشه با حقیقتِ همین جهان سروکار داشته باشد.
 *  • carryOverState — انتقال وضعیت جهان به جهانِ «ترمیم‌شده» پس از قطعی (همان الگوی
 *    دستی آزمون‌های resume؛ برای حلقه‌های تصادفی EXP-3 عمومی شده است).
 */
import { createNodeSyncRunner, CATCHUP_STATE_KEY } from '../runner';
import type { CatchUpStateV1, NodeSyncRunner } from '../runner';
import type { NodeSyncStore, NodePullItem } from '../../node-sync-client/client';

// ─── کمک‌سازهای cursor — همان فرمت سمت ورکر (base64url JSON {d,t,i}) ───

export function encodeCursor(d: string, t: string, i: string): string {
  const json = JSON.stringify({ d, t, i });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let k = 0; k < bytes.length; k += 1) bin += String.fromCharCode(bytes[k]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCursor(raw: string): { d: string; t: string; i: string } | null {
  try {
    const norm = raw.replace(/-/g, '+').replace(/_/g, '/');
    const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
    const bin = atob(norm + pad);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as { d: string; t: string; i: string };
  } catch {
    return null;
  }
}

export function memStore(): NodeSyncStore & { dump: () => Map<string, string> } {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), dump: () => m };
}

// ─── فیک مرکز + موتور محلی — قرارداد واقعی، شبکهٔ درون‌حافظه‌ای ───

export interface PullRecord { id: string; domain: string; updated_at: string; payload: Record<string, unknown> }
export interface OutboxRecord { id: string; domain: string; at: string; payload: Record<string, unknown> }

/** موج ۱ — پاکت هندشیک مرکز (۱-۳/۱-۴): نسخه‌ها + انحراف ساعت مرکز از ساعت دستگاه آزمون */
export interface HandshakeOpt { centerVersion: string; minNodeVersion: string; serverTsOffsetMs?: number }

export function makeWorld(opts?: {
  /** پرتاب خطای شبکه در فراخوانی n-ام pull */
  throwOnPullPage?: number;
  /** پرتاب خطای شبکه در فراخوانی n-ام push */
  throwOnPushBatch?: number;
  /** پرتاب خطا در فراخوانی n-ام استقرار (موتور محلی) */
  throwOnIngest?: number;
  /** موج ۱ — پاکت هندشیک روی هر پاسخ pull/push (غایب = مرکز قدیمی بدون فیلد نسخه) */
  handshake?: HandshakeOpt;
  /** موج ۱ — بازنویسی هندشیک فقط برای پاسخ push (آشکارسازی ناسازگاری در فاز push) */
  pushHandshake?: HandshakeOpt;
}) {
  const center = {
    pullItems: [] as PullRecord[],
    pullUrls: [] as string[],
    pullCalls: 0,
    pushCalls: 0,
    pushIdsByCall: [] as string[][],
    pushHadCatchupHeader: [] as boolean[],
    pushEvents: new Map<string, true>(), // PK (node_code, id)
    /** EXP-3 — دامنهٔ هر رویداد پوش‌شده (id → domain) برای ادعای per-domain */
    pushDomainsById: new Map<string, string>(),
    accepted: 0,
    duplicates: 0,
    lastPushAt: null as string | null
  };
  const engine = {
    inbox: new Map<string, true>(), // PK (domain, id)
    ingestCalls: 0,
    ingestIdsByCall: [] as string[][],
    ingestDuplicates: 0,
    outbox: [] as OutboxRecord[],
    outboxSince: [] as (string | null)[],
    mirrors: [] as Record<string, unknown>[]
  };

  const PAGE_SIZE = 50; // قرارداد بریف — سقف صفحهٔ pull در سناریو
  const OUTBOX_PAGE = 200; // آینهٔ OUTBOX_MAX_ITEMS سمت موتور محلی

  /** موج ۱ — پاکت هندشیک در data پاسخ مرکز؛ غایب در opts = مرکز قدیمی بدون فیلد نسخه */
  const handshakeData = (h?: HandshakeOpt): Record<string, unknown> =>
    h
      ? {
          center_version: h.centerVersion,
          min_node_version: h.minNodeVersion,
          server_ts: new Date(Date.now() + (h.serverTsOffsetMs ?? 0)).toISOString()
        }
      : {};

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.includes('/node/pull')) {
      center.pullCalls += 1;
      center.pullUrls.push(url);
      if (opts?.throwOnPullPage === center.pullCalls) throw new Error('network down (pull)');
      const parsedUrl = new URL(url);
      const cursorRaw = parsedUrl.searchParams.get('cursor');
      // سقف صفحهٔ سناریو = ۵۰ — درخواست ۱۰۰تایی catch-up هم صفحات ۵۰تایی می‌گیرد (هم‌ریتم بریف)
      const limit = Math.min(Number(parsedUrl.searchParams.get('limit') ?? '50') || 50, PAGE_SIZE);
      // keyset واقعی: همهٔ مقایسه‌ها روی (updated_at, id) بعد از نقطهٔ cursor
      const sorted = [...center.pullItems].sort((a, b) => (a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : a.id < b.id ? -1 : 1));
      const cur = cursorRaw ? decodeCursor(cursorRaw) : null;
      const after = cur ? sorted.filter((it) => it.updated_at > cur.t || (it.updated_at === cur.t && it.id > cur.i)) : sorted;
      const page = after.slice(0, limit);
      const hasMore = after.length > page.length;
      const last = page.length > 0 ? page[page.length - 1] : null;
      const body = {
        data: {
          items: page,
          next_cursor: hasMore && last ? encodeCursor(last.domain, last.updated_at, last.id) : null,
          server_time: '2026-11-13T10:00:00Z',
          ...handshakeData(opts?.handshake)
        }
      };
      return new Response(JSON.stringify(body), { status: 200 });
    }

    if (url.includes('/node/reconcile')) {
      // EXP-1 — پاسخ آشتی‌ساز از حقیقتِ همین فیک محاسبه می‌شود: شمارش هر دامنهٔ pull از
      // pullItems و بیشینهٔ updated_at آن؛ بدنهٔ «لخت» {server_ts, domains} عین قرارداد
      // یخ‌زدهٔ /node/reconcile سمت مرکز (بدون پاکت {data:…}).
      const parsedUrl = new URL(url);
      const requested = (parsedUrl.searchParams.get('domains') ?? '').split(',').filter((d) => d.length > 0);
      const domains = requested.length > 0 ? requested : ['announcements', 'packages', 'library'];
      const domainsOut = domains.map((d) => {
        const items = center.pullItems.filter((it) => it.domain === d);
        let maxAt: string | null = null;
        for (const it of items) {
          if (maxAt === null || Date.parse(it.updated_at) > Date.parse(maxAt)) maxAt = it.updated_at;
        }
        return { domain: d, count: items.length, max_updated_at: maxAt };
      });
      return new Response(
        JSON.stringify({ server_ts: '2026-11-13T10:05:00.000Z', domains: domainsOut }),
        { status: 200 }
      );
    }

    if (url.includes('/node/push')) {
      center.pushCalls += 1;
      if (opts?.throwOnPushBatch === center.pushCalls) throw new Error('network down (push)');
      const hadHeader = init?.headers != null && (init.headers as Record<string, string>)['X-CP-Node-Catchup'] === '1';
      center.pushHadCatchupHeader.push(hadHeader);
      const body = JSON.parse(String(init?.body ?? '{}')) as { items: Array<{ id: string; domain: string; at?: string | null; payload: Record<string, unknown> }> };
      // گات ۱۵دقیقه‌ای سمت ابر — فقط برای درخواست «بدون» هدر جبرانی (قرارداد rust-f14)
      if (!hadHeader && center.lastPushAt && Date.parse(center.lastPushAt) + 15 * 60_000 > Date.now()) {
        return new Response(JSON.stringify({ data: { accepted: 0, duplicates: 0, throttled: true, retry_after_s: 900 } }), { status: 200 });
      }
      center.lastPushAt = new Date().toISOString();
      center.pushIdsByCall.push(body.items.map((it) => it.id));
      let accepted = 0;
      let duplicates = 0;
      for (const it of body.items) {
        if (center.pushEvents.has(it.id)) duplicates += 1;
        else {
          center.pushEvents.set(it.id, true);
          center.pushDomainsById.set(it.id, it.domain);
          accepted += 1;
        }
      }
      center.accepted += accepted;
      center.duplicates += duplicates;
      return new Response(
        JSON.stringify({ data: { accepted, duplicates, throttled: false, ...handshakeData(opts?.pushHandshake ?? opts?.handshake) } }),
        { status: 200 }
      );
    }

    if (url.includes('/api/internal/sync/ingest')) {
      engine.ingestCalls += 1;
      if (opts?.throwOnIngest === engine.ingestCalls) throw new Error('engine down (ingest)');
      const body = JSON.parse(String(init?.body ?? '{}')) as { items: NodePullItem[] };
      engine.ingestIdsByCall.push(body.items.map((it) => it.id));
      let inserted = 0;
      let duplicates = 0;
      for (const it of body.items) {
        const key = `${it.domain}:${it.id}`;
        if (engine.inbox.has(key)) duplicates += 1;
        else {
          engine.inbox.set(key, true);
          inserted += 1;
        }
      }
      engine.ingestDuplicates += duplicates;
      return new Response(JSON.stringify({ data: { inserted, updated: 0, duplicates, by_domain: {} } }), { status: 200 });
    }

    if (url.includes('/api/internal/sync/outbox')) {
      // مسیر outbox نسبی است (همان-مبدا) — since دستی از query خوانده می‌شود نه new URL
      const since = url.includes('since=') ? decodeURIComponent(url.split('since=')[1] ?? '') : null;
      engine.outboxSince.push(since);
      const sorted = [...engine.outbox].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
      const after = since ? sorted.filter((it) => Date.parse(it.at) > Date.parse(since)) : sorted;
      const page = after.slice(0, OUTBOX_PAGE);
      return new Response(JSON.stringify({ data: { items: page, generated_at: '2026-11-13T10:00:00Z' } }), { status: 200 });
    }

    if (url.includes('/api/internal/sync/status')) {
      // EXP-1 — شمارش صندوق محلی بر حسب دامنه (هم‌قرارداد internal-sync/routes.ts)
      const byDomain: Record<string, number> = {};
      for (const key of engine.inbox.keys()) {
        const d = key.slice(0, key.indexOf(':'));
        byDomain[d] = (byDomain[d] ?? 0) + 1;
      }
      return new Response(JSON.stringify({ data: { total: engine.inbox.size, by_domain: byDomain, synced_announcements: 0 } }), { status: 200 });
    }

    if (url.includes('/api/node-sync/status')) {
      engine.mirrors.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  function makeRunner(store: ReturnType<typeof memStore>): NodeSyncRunner {
    return createNodeSyncRunner({
      baseUrl: 'https://center.test',
      nodeCode: 'DESKTOP:test-node',
      nodeKey: 'nk_live_test',
      progressStorage: store,
      fetchFn: fakeFetch as never,
      tokenProvider: () => 'sess-token'
    });
  }

  return { center, engine, fetch: fakeFetch, makeRunner };
}

/**
 * EXP-3 — انتقال وضعیت از جهان قطع‌شده به جهانِ ترمیم‌شده: شبکه تازه می‌آید ولی صندوق،
 * ابر و شمارنده‌ها همان‌ها می‌مانند (همان الگوی دستی آزمون‌های resume در catchup.test.ts).
 */
export function carryOverState(
  from: ReturnType<typeof makeWorld>,
  to: ReturnType<typeof makeWorld>
): void {
  to.center.pullItems = from.center.pullItems;
  to.engine.outbox = from.engine.outbox;
  to.engine.inbox = from.engine.inbox;
  to.center.pushEvents = from.center.pushEvents;
  to.center.pushDomainsById = from.center.pushDomainsById;
  to.center.accepted = from.center.accepted;
  to.center.duplicates = from.center.duplicates;
  to.engine.ingestDuplicates = from.engine.ingestDuplicates;
  to.engine.ingestCalls = from.engine.ingestCalls;
  to.engine.ingestIdsByCall = from.engine.ingestIdsByCall;
  to.center.pushCalls = from.center.pushCalls;
  to.center.pullCalls = from.center.pullCalls;
  to.center.pushIdsByCall = from.center.pushIdsByCall;
  to.center.pushHadCatchupHeader = from.center.pushHadCatchupHeader;
  to.center.lastPushAt = from.center.lastPushAt;
  to.engine.outboxSince = from.engine.outboxSince;
}

// ─── بذرها — دامنه‌پارامتر برای EXP-3؛ فراخوانی‌های فعلی آزمون‌ها بدون تغییر می‌مانند ───

const SEED_BASE = Date.parse('2026-10-27T00:00:00Z'); // دو هفته پیش — آیتم‌های انباشته در غیاب اپ

export function seedPullItems(count: number, domain = 'announcements'): PullRecord[] {
  // پیشوند آی‌دی دامنهٔ پیش‌فرض عین قرارداد قبلی آزمون‌هاست (ann-…) تا ادعاهای موجود
  // دست‌نخورده بمانند؛ دامنه‌های تازهٔ EXP-3 پیشوند خودشان را می‌گیرند.
  const idPrefix = domain === 'announcements' ? 'ann' : domain;
  const items: PullRecord[] = [];
  for (let i = 1; i <= count; i += 1) {
    items.push({
      id: `${idPrefix}-${String(i).padStart(3, '0')}`,
      domain,
      updated_at: new Date(SEED_BASE + i * 1000).toISOString(),
      payload:
        domain === 'announcements'
          ? { title: `اعلان ${i}`, body: 'متن', show_login: true, show_panel: true, active: true, created_at: new Date(SEED_BASE + i * 1000).toISOString() }
          : { ref: `${domain}-${i}`, created_at: new Date(SEED_BASE + i * 1000).toISOString() }
    });
  }
  return items;
}

export function seedOutboxItems(count: number, domain = 'client_errors'): OutboxRecord[] {
  const idPrefix = domain === 'client_errors' ? 'err' : domain;
  const items: OutboxRecord[] = [];
  for (let i = 1; i <= count; i += 1) {
    items.push({
      id: `${idPrefix}-${String(i).padStart(4, '0')}`,
      domain,
      at: new Date(SEED_BASE + i * 1000).toISOString(),
      payload: domain === 'client_errors' ? { message: `خطای صفحهٔ ${i}`, app_version: '1.26.0' } : { ref: i, kind: domain }
    });
  }
  return items;
}

export function catchupStateOf(store: ReturnType<typeof memStore>): CatchUpStateV1 {
  const raw = store.dump().get(CATCHUP_STATE_KEY);
  if (!raw) throw new Error('وضعیت catch-up در انبار نیست');
  return JSON.parse(raw) as CatchUpStateV1;
}
