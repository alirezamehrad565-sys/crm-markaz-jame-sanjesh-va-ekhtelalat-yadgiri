/**
 * rust-f14 — آزمون همگام‌سازی جبرانی (catch-up) — سناریوی «دو هفته آفلاین»
 *
 * اپ میز هفته‌ها بسته بوده: ۳۰۰ آیتم pull سمت ابر (صفحهٔ ۵۰تایی — صفحه‌به‌صفحه با cursor
 * کلیدsetی) + ۵۰۰ آیتم صندوق خروج محلی (بسته‌های ≤۱۰۰تایی تا تخلیهٔ کامل). کلود و موتور
 * محلی فِیک‌اند اما قرارداد واقعی را پیاده می‌کنند:
 *  • ابر — cursor کلیدsetی (base64url {d,t,i}) روی اجتماع مرتب، سقف صفحه ۵۰؛ push با
 *    idempotency جفت (node,id) و شمارش duplicates؛ درخواست بدون هدر جبرانی زیر گات ۱۵دقیقه‌ای
 *    می‌ماند (شبیه‌سازی سمت ابر).
 *  • موتور محلی — صندوق ورودی با PK (domain,id) و شمارش درج/دوباره؛ outbox با since اکید
 *    و سقف ۲۰۰ آیتم؛ مسیر آینهٔ وضعیت ضبط می‌شود.
 * ادعاها: صفر اتلاف + صفر ردیف دوباره + resume دقیق بعد از قطعی وسط راه + سقف‌های سالم +
 * هیچ مسیری throw نمی‌کند.
 */
import { describe, it, expect } from 'vitest';
import { createNodeSyncRunner, CATCHUP_CURSOR_KEY, CATCHUP_STATE_KEY, PUSH_WATERMARK_KEY } from '../runner';
import type { CatchUpOutcome, CatchUpStateV1, NodeSyncRunner } from '../runner';
import { createSyncCoordinator } from '../coordinator';
import type { NodeSyncStore, NodePullItem } from '../../node-sync-client/client';

// ─── کمک‌سازهای cursor — همان فرمت سمت ورکر (base64url JSON {d,t,i}) ───

function encodeCursor(d: string, t: string, i: string): string {
  const json = JSON.stringify({ d, t, i });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let k = 0; k < bytes.length; k += 1) bin += String.fromCharCode(bytes[k]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCursor(raw: string): { d: string; t: string; i: string } | null {
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

function memStore(): NodeSyncStore & { dump: () => Map<string, string> } {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), dump: () => m };
}

// ─── فیک مرکز + موتور محلی — قرارداد واقعی، شبکهٔ درون‌حافظه‌ای ───

interface PullRecord { id: string; domain: string; updated_at: string; payload: Record<string, unknown> }
interface OutboxRecord { id: string; domain: string; at: string; payload: Record<string, unknown> }

function makeWorld(opts?: {
  /** پرتاب خطای شبکه در فراخوانی n-ام pull */
  throwOnPullPage?: number;
  /** پرتاب خطای شبکه در فراخوانی n-ام push */
  throwOnPushBatch?: number;
  /** پرتاب خطا در فراخوانی n-ام استقرار (موتور محلی) */
  throwOnIngest?: number;
}) {
  const center = {
    pullItems: [] as PullRecord[],
    pullUrls: [] as string[],
    pullCalls: 0,
    pushCalls: 0,
    pushIdsByCall: [] as string[][],
    pushHadCatchupHeader: [] as boolean[],
    pushEvents: new Map<string, true>(), // PK (node_code, id)
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
          server_time: '2026-11-13T10:00:00Z'
        }
      };
      return new Response(JSON.stringify(body), { status: 200 });
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
          accepted += 1;
        }
      }
      center.accepted += accepted;
      center.duplicates += duplicates;
      return new Response(JSON.stringify({ data: { accepted, duplicates, throttled: false } }), { status: 200 });
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

    if (url.includes('/api/node-sync/status')) {
      engine.mirrors.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  function makeRunner(store: ReturnType<typeof memStore>) {
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

function seedPullItems(count: number): PullRecord[] {
  const base = Date.parse('2026-10-27T00:00:00Z'); // دو هفته پیش — آیتم‌های انباشته در غیاب اپ
  const items: PullRecord[] = [];
  for (let i = 1; i <= count; i += 1) {
    items.push({
      id: `ann-${String(i).padStart(3, '0')}`,
      domain: 'announcements',
      updated_at: new Date(base + i * 1000).toISOString(),
      payload: { title: `اعلان ${i}`, body: 'متن', show_login: true, show_panel: true, active: true, created_at: new Date(base + i * 1000).toISOString() }
    });
  }
  return items;
}

function seedOutboxItems(count: number): OutboxRecord[] {
  const base = Date.parse('2026-10-27T00:00:00Z');
  const items: OutboxRecord[] = [];
  for (let i = 1; i <= count; i += 1) {
    items.push({
      id: `err-${String(i).padStart(4, '0')}`,
      domain: 'client_errors',
      at: new Date(base + i * 1000).toISOString(),
      payload: { message: `خطای صفحهٔ ${i}`, app_version: '1.26.0' }
    });
  }
  return items;
}

function catchupStateOf(store: ReturnType<typeof memStore>): CatchUpStateV1 {
  const raw = store.dump().get(CATCHUP_STATE_KEY);
  expect(raw).toBeTruthy();
  return JSON.parse(raw ?? '{}') as CatchUpStateV1;
}

// ───────────────────────── سناریوی دو هفته آفلاین — همگرایی کامل ─────────────────────────

describe('catch-up: دو هفته آفلاین — همگرایی کامل دوطرفه (صفر اتلاف، صفر دوباره)', () => {
  it('۳۰۰ آیتم ابر در صندوق + ۵۰۰ آیتم صندوق در ابر — کامل، بدون دوباره، بدون کم‌وش', async () => {
    const world = makeWorld();
    world.center.pullItems = seedPullItems(300);
    world.engine.outbox = seedOutboxItems(500);
    const store = memStore();
    const runner = world.makeRunner(store);

    const out = await runner.catchUp();

    expect(out.status).toBe('ok');
    expect(out.phase).toBe('done');
    expect(out.pull_done).toBe(true);
    expect(out.push_done).toBe(true);
    expect(out.items_pulled).toBe(300);
    expect(out.pages).toBe(6); // ۳۰۰ آیتم در صفحات ۵۰تایی
    expect(out.by_domain.announcements).toBe(300);
    expect(out.batches).toBeGreaterThanOrEqual(5); // ۵۰۰ آیتم در بسته‌های ≤۱۰۰
    expect(out.items_pushed).toBeGreaterThanOrEqual(500);

    // صندوق ورودی محلی — دقیقاً ۳۰۰ ردیف یکتا (PK دوباره‌ها را می‌کشد)
    expect(world.engine.inbox.size).toBe(300);
    expect(world.engine.ingestDuplicates).toBe(0);
    for (let i = 1; i <= 300; i += 1) {
      expect(world.engine.inbox.has(`announcements:ann-${String(i).padStart(3, '0')}`)).toBe(true);
    }

    // ابر — دقیقاً ۵۰۰ رویداد یکتا (PK (node_code,id) دوباره‌ها را می‌کشد)
    expect(world.center.pushEvents.size).toBe(500);
    for (let i = 1; i <= 500; i += 1) {
      expect(world.center.pushEvents.has(`err-${String(i).padStart(4, '0')}`)).toBe(true);
    }
    // همهٔ بسته‌های push با هدر جبرانی رفته‌اند — گات ۱۵دقیقه‌ای فقط تیک دوره‌ای را می‌بندد
    expect(world.center.pushHadCatchupHeader.length).toBeGreaterThan(0);
    expect(world.center.pushHadCatchupHeader.every((h) => h === true)).toBe(true);

    // cursor دقیق در پایان داده می‌ماند (نه '') — دورهٔ بعد فقط تازه‌ترها می‌گیرند
    const cursorRaw = store.dump().get(CATCHUP_CURSOR_KEY) ?? '';
    const cur = decodeCursor(cursorRaw);
    expect(cur?.i).toBe('ann-300'); // آخرین آیتم تحویل‌شده
    // watermark پوش هم جلو رفته است
    expect(store.dump().get(PUSH_WATERMARK_KEY)).toBeTruthy();

    // وضعیت دوره — synced
    const st = catchupStateOf(store);
    expect(st.state).toBe('synced');
    expect(st.items_pulled_last_run).toBe(300);
    expect(st.pages_last_run).toBe(6);
    expect(st.last_error_kind).toBeNull();

    // وضعیت runner (پنل) — آخرین همگامی موفق + پوش موفق
    const rs = runner.status();
    expect(rs.last_ok_at).toBeTruthy();
    expect(rs.last_push_ok_at).toBeTruthy();
    expect(rs.items_last_run).toBe(300);
    expect(rs.last_error).toBeNull();

    // آینهٔ وضعیت به موتور محلی — آخرین اسنپ‌شات synced
    expect(world.engine.mirrors.length).toBeGreaterThan(0);
    const lastMirror = world.engine.mirrors[world.engine.mirrors.length - 1];
    expect(lastMirror.state).toBe('synced');
    expect(lastMirror.mode).toBe('auto');
    expect(lastMirror.v).toBe(1);
  });

  it('دورهٔ دوم بعد از همگرایی — هیچ تازه‌ای نیست: صفر pull دوباره، صفر push، synced می‌ماند', async () => {
    const world = makeWorld();
    world.center.pullItems = seedPullItems(300);
    world.engine.outbox = seedOutboxItems(500);
    const store = memStore();
    const runner = world.makeRunner(store);

    await runner.catchUp();
    const pullCallsAfterFirst = world.center.pullCalls;
    const pushCallsAfterFirst = world.center.pushCalls;

    const out2 = await runner.catchUp();

    expect(out2.status).toBe('ok');
    expect(out2.pull_done).toBe(true);
    expect(out2.push_done).toBe(true);
    expect(out2.items_pulled).toBe(0); // cursor دقیقِ پایان داده — هیچ تازه‌ای نیست
    expect(out2.pages).toBe(1); // فقط یک صفحهٔ خالی برای دیدن سیگنال پایان
    expect(out2.items_pushed).toBe(0); // outbox خالی
    expect(world.center.pullCalls).toBe(pullCallsAfterFirst + 1);
    expect(world.center.pushCalls).toBe(pushCallsAfterFirst); // push اصلاً زده نشد
    expect(world.engine.inbox.size).toBe(300); // بدون ردیف دوباره
    expect(world.center.pushEvents.size).toBe(500);
    expect(catchupStateOf(store).state).toBe('synced');
  });
});

// ───────────────────────── قطعی وسط راه — resume دقیق، بدون اتلاف/دوباره ─────────────────────────

describe('catch-up: قطعی شبکه وسط راه — resume دقیق از همان نقطه', () => {
  it('قطعی بعد از صفحهٔ ۳ pull و بعد از بستهٔ ۲ push → committedها می‌مانند → دورهٔ بعد همگرا', async () => {
    const world = makeWorld({ throwOnPullPage: 3, throwOnPushBatch: 2 });
    world.center.pullItems = seedPullItems(300);
    world.engine.outbox = seedOutboxItems(500);
    const store = memStore();
    const runner = world.makeRunner(store);

    const out1 = await runner.catchUp();

    // pull: دو صفحهٔ کامل متعهد شده، صفحهٔ ۳ در راه قطع شده
    expect(out1.status).toBe('network_error');
    expect(out1.pull_done).toBe(false);
    expect(out1.pages).toBe(2);
    expect(out1.items_pulled).toBe(100);
    expect(world.engine.inbox.size).toBe(100); // فقط صفحات متعهدشده
    // push: بستهٔ ۱ پذیرفته، بستهٔ ۲ در راه قطع شده — watermark جلو نرفته
    expect(out1.batches).toBe(1);
    expect(world.center.pushEvents.size).toBe(100);
    expect(store.dump().get(PUSH_WATERMARK_KEY) ?? null).toBeNull();
    // cursor بعد از تعهد صفحهٔ ۲ ذخیره شده — نه جلوتر نه عقب‌تر
    const cur1 = decodeCursor(store.dump().get(CATCHUP_CURSOR_KEY) ?? '');
    expect(cur1?.i).toBe('ann-100'); // آخرین آیتم صفحهٔ ۲
    expect(catchupStateOf(store).state).toBe('error');
    expect(catchupStateOf(store).last_error_kind).toBe('network_error');

    // ── دورهٔ بعد: شبکه سالم — از همان نقطه ادامه می‌دهد ──
    const healed = makeWorld();
    healed.center.pullItems = world.center.pullItems;
    healed.engine.outbox = world.engine.outbox;
    healed.engine.inbox = world.engine.inbox; // صندوق همان صندوق است
    healed.center.pushEvents = world.center.pushEvents; // ابر همان ابر است
    healed.center.accepted = world.center.accepted;
    healed.center.duplicates = world.center.duplicates;
    healed.engine.ingestDuplicates = world.engine.ingestDuplicates;
    healed.engine.ingestCalls = world.engine.ingestCalls;
    healed.center.pushCalls = world.center.pushCalls;
    healed.center.pullCalls = world.center.pullCalls;
    const runner2 = healed.makeRunner(store);

    const out2 = await runner2.catchUp();

    expect(out2.status).toBe('ok');
    expect(out2.pull_done).toBe(true);
    expect(out2.push_done).toBe(true);
    // pull فقط از صفحهٔ ۳ ادامه دارد — cursor دقیق، هیچ صفحهٔ متعهدی دوباره نیامده
    expect(out2.pages).toBe(4); // صفحات ۳ تا ۶ از ۶ صفحه
    expect(out2.items_pulled).toBe(200);
    const firstResumeUrl = healed.center.pullUrls[0];
    expect(firstResumeUrl).toContain('cursor=');
    expect(decodeCursor(new URL(firstResumeUrl).searchParams.get('cursor') ?? '')?.i).toBe('ann-100');
    expect(world.engine.ingestDuplicates).toBe(0); // صفر دوباره‌سازی در صندوق — PK کار کرد
    expect(world.engine.inbox.size).toBe(300); // همگرایی کامل pull

    // push: بستهٔ ackشدهٔ قبلی دوباره رفته و ابر با PK «دوباره» شمرده — بدون ردیف دوباره
    expect(world.center.pushEvents.size).toBe(500); // همگرایی کامل push — صفر ردیف دوباره
    expect(healed.center.duplicates).toBeGreaterThan(0); // دوباره‌ها شمرده شدند نه بازنویسی/گم
    const ids = [...world.center.pushEvents.keys()];
    expect(new Set(ids).size).toBe(500);
    // watermark جلو رفته و وضعیت synced
    expect(store.dump().get(PUSH_WATERMARK_KEY)).toBeTruthy();
    expect(catchupStateOf(store).state).toBe('synced');
    expect(runner2.status().last_error).toBeNull();
  });

  it('قطعی در استقرار موتور (ingest) — cursor جلو نمی‌رود و همان صفحه کامل دوباره می‌آید', async () => {
    const world = makeWorld({ throwOnIngest: 1 });
    world.center.pullItems = seedPullItems(120);
    world.engine.outbox = [];
    const store = memStore();
    const runner = world.makeRunner(store);

    const out1 = await runner.catchUp();
    expect(out1.status).toBe('ingest_error');
    expect(out1.pages).toBe(0); // هیچ صفحه‌ای متعهد نشد
    expect(world.engine.inbox.size).toBe(0);
    expect(store.dump().get(CATCHUP_CURSOR_KEY) ?? null).toBeNull(); // cursor هرگز نوشته نشد
    expect(catchupStateOf(store).state).toBe('error');

    const healed = makeWorld();
    healed.center.pullItems = world.center.pullItems;
    healed.engine.inbox = world.engine.inbox;
    healed.engine.ingestDuplicates = world.engine.ingestDuplicates;
    const runner2 = healed.makeRunner(store);
    const out2 = await runner2.catchUp();
    expect(out2.status).toBe('ok');
    expect(out2.pages).toBe(3); // ۱۲۰ آیتم در ۳ صفحهٔ ۵۰تایی (۲+۱)
    expect(out2.items_pulled).toBe(120);
    expect(world.engine.inbox.size).toBe(120);
    expect(world.engine.ingestDuplicates).toBe(0);
  });
});

// ───────────────────────── سقف‌های سالم و وضعیت ─────────────────────────

describe('catch-up: سقف‌ها، اعتبار و قرارداد نرم', () => {
  it('سقف صفحات در یک دوره — progress محفوظ می‌ماند و دورهٔ بعد ادامه می‌دهد', async () => {
    const world = makeWorld();
    world.center.pullItems = seedPullItems(300);
    world.engine.outbox = [];
    const store = memStore();
    const runner = world.makeRunner(store);

    const out1 = await runner.catchUp({ maxPages: 2 });
    expect(out1.status).toBe('ok'); // خطا نیست — فقط سقف
    expect(out1.pull_done).toBe(false);
    expect(out1.pages).toBe(2);
    expect(out1.items_pulled).toBe(100);
    expect(catchupStateOf(store).state).toBe('catching_up'); // ادامه در دورهٔ بعد

    const out2 = await runner.catchUp(); // بدون سقف — ادامه
    expect(out2.pull_done).toBe(true);
    expect(out2.pages).toBe(4);
    expect(world.engine.inbox.size).toBe(300);
    expect(world.engine.ingestDuplicates).toBe(0);
    expect(catchupStateOf(store).state).toBe('synced');
  });

  it('اعتبار ناقص → unconfigured نرم + وضعیت offline + صفر درخواست', async () => {
    const world = makeWorld();
    world.center.pullItems = seedPullItems(10);
    const store = memStore();
    const runner = createNodeSyncRunner({
      baseUrl: null,
      nodeCode: null,
      nodeKey: null,
      progressStorage: store,
      fetchFn: world.fetch as never,
      tokenProvider: () => 'sess-token'
    });
    const out = await runner.catchUp();
    expect(out.status).toBe('unconfigured');
    expect(catchupStateOf(store).state).toBe('offline');
    expect(world.center.pullCalls).toBe(0);
    expect(world.engine.ingestCalls).toBe(0);
  });

  it('هیچ مسیری throw نمی‌کند — کلود کاملاً مرده هم خروجی نرم می‌دهد', async () => {
    const deadFetch = (async () => {
      throw new Error('socket destroyed');
    }) as typeof fetch;
    const runner = createNodeSyncRunner({
      baseUrl: 'https://center.test',
      nodeCode: 'DESKTOP:t',
      nodeKey: 'nk',
      progressStorage: memStore(),
      fetchFn: deadFetch,
      tokenProvider: () => 'sess-token'
    });
    const out = await runner.catchUp(); // پرتاب = شکست آزمون
    expect(out.status).toBe('network_error');
    expect(out.pull_done).toBe(false);
  });

  it('پوش ۴۲۶/NODE_MIN_VERSION → version_error نرم (سیم قرنطینهٔ نسخه)', async () => {
    let pushTries = 0;
    const gated = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/node/pull')) {
        return new Response(JSON.stringify({ error: 'NODE_MIN_VERSION', message: 'نسخهٔ نود قدیمی است' }), { status: 426 });
      }
      if (url.includes('/node/push')) {
        pushTries += 1;
        return new Response(JSON.stringify({ data: { accepted: 0, duplicates: 0, throttled: false } }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    const runner = createNodeSyncRunner({
      baseUrl: 'https://center.test',
      nodeCode: 'DESKTOP:t',
      nodeKey: 'nk',
      progressStorage: memStore(),
      fetchFn: gated,
      tokenProvider: () => 'sess-token'
    });
    const out = await runner.catchUp();
    expect(out.status).toBe('version_error');
    expect(out.phase).toBe('pull');
    // قرنطینهٔ نسخه push را هم نگذشت — هیچ بستهٔ push ای بعد از pull
    expect(pushTries).toBe(0);
  });
});

// ───────────────────────── هماهنگ‌ساز — runCatchUp و ماتریس خرابی ─────────────────────────

describe('هماهنگ‌ساز — runCatchUp: همان ماتریس خرابی روی دورهٔ جبرانی', () => {
  function fakeCatchUpRunner(outcomes: CatchUpOutcome[]): NodeSyncRunner & { catchUpCalls: number } {
    const state = { calls: 0 };
    const runner = {
      calls: 0,
      configured: () => true,
      status: () => ({
        v: 1 as const,
        last_ok_at: null,
        last_error: null,
        last_error_at: null,
        items_last_run: 0,
        by_domain: {},
        last_push_ok_at: null,
        last_push_error: null
      }),
      resetStatus: () => undefined,
      async syncNow() {
        return { status: 'ok' as const, items: 0, pages: 1, by_domain: {} };
      },
      async pushNow() {
        return { status: 'ok' as const, sent: 0 };
      },
      mirrorStatus: () => undefined,
      async catchUp() {
        const o = outcomes[Math.min(state.calls, outcomes.length - 1)];
        state.calls += 1;
        return o;
      }
    };
    return runner as unknown as NodeSyncRunner & { catchUpCalls: number };
  }

  function emptyOutcome(status: CatchUpOutcome['status']): CatchUpOutcome {
    return {
      status,
      phase: 'pull',
      http: null,
      code: null,
      message: null,
      pages: 0,
      items_pulled: 0,
      by_domain: {},
      batches: 0,
      items_pushed: 0,
      duplicates_pushed: 0,
      pull_done: false,
      push_done: false
    };
  }

  it('ok → بازگشت به auto و ریست شکست‌ها؛ آینهٔ وضعیت صدا خورد', async () => {
    const runner = fakeCatchUpRunner([{ ...emptyOutcome('ok'), phase: 'done', pull_done: true, push_done: true }]);
    const store = memStore();
    const coord = createSyncCoordinator({ runner, progressStorage: store, now: () => new Date(0), jitter: () => 1, scheduleFn: () => () => undefined });
    const r = await coord.runCatchUp();
    expect(r.catchup.status).toBe('ok');
    const st = coord.state();
    expect(st.mode).toBe('auto');
    expect(st.consecutive_failures).toBe(0);
    expect(st.last_error_kind).toBe('none');
    expect(st.next_attempt_at).not.toBeNull();
  });

  it('auth_error → قرنطینه؛ version_error → paused_version؛ ۴۲۶ در http_error هم نسخه است', async () => {
    const runner = fakeCatchUpRunner([emptyOutcome('auth_error'), emptyOutcome('version_error'), { ...emptyOutcome('http_error'), http: 426 }]);
    const store = memStore();
    const coord = createSyncCoordinator({ runner, progressStorage: store, now: () => new Date(0), jitter: () => 1, scheduleFn: () => () => undefined });

    await coord.runCatchUp();
    expect(coord.state().mode).toBe('quarantined');
    expect(coord.state().next_attempt_at).toBeNull();

    await coord.runCatchUp();
    expect(coord.state().mode).toBe('paused_version');
    expect(coord.state().last_error_kind).toBe('version');

    await coord.runCatchUp();
    expect(coord.state().mode).toBe('paused_version');
  });

  it('network_error → backoff نمایی؛ ingest_error → backoff کوتاه ۶۰s؛ هر دو auto می‌مانند', async () => {
    const runner = fakeCatchUpRunner([emptyOutcome('network_error'), emptyOutcome('ingest_error')]);
    const store = memStore();
    const coord = createSyncCoordinator({ runner, progressStorage: store, now: () => new Date(0), jitter: () => 1, scheduleFn: () => () => undefined, intervalMs: 1_800_000 });

    await coord.runCatchUp();
    expect(coord.state().mode).toBe('auto');
    expect(coord.state().backoff_ms).toBe(30_000);
    expect(coord.state().consecutive_failures).toBe(1);

    await coord.runCatchUp();
    expect(coord.state().last_error_kind).toBe('ingest');
    expect(coord.state().backoff_ms).toBe(60_000);
    expect(coord.state().mode).toBe('auto');
  });

  it('push_failed با کد auth_error → قرنطینه حتی وقتی pull در دورهٔ جبرانی ok بوده', async () => {
    const runner = fakeCatchUpRunner([{ ...emptyOutcome('push_failed'), code: 'auth_error', phase: 'push', pull_done: true }]);
    const store = memStore();
    const coord = createSyncCoordinator({ runner, progressStorage: store, now: () => new Date(0), jitter: () => 1, scheduleFn: () => () => undefined });
    await coord.runCatchUp();
    expect(coord.state().mode).toBe('quarantined');
    expect(coord.state().last_error_kind).toBe('auth');
  });

  it('runner بدون catchUp → خروجی نرم بدون throw و بدون تغییر وضعیت به خرابی', async () => {
    const bare = {
      configured: () => true,
      status: () => ({ v: 1 as const, last_ok_at: null, last_error: null, last_error_at: null, items_last_run: 0, by_domain: {}, last_push_ok_at: null, last_push_error: null }),
      resetStatus: () => undefined,
      syncNow: async () => ({ status: 'ok' as const, items: 0, pages: 1, by_domain: {} }),
      pushNow: async () => ({ status: 'ok' as const, sent: 0 })
    } as unknown as NodeSyncRunner;
    const coord = createSyncCoordinator({ runner: bare, progressStorage: memStore(), now: () => new Date(0), scheduleFn: () => () => undefined });
    const r = await coord.runCatchUp();
    expect(r.catchup.status).toBe('network_error');
    expect(r.catchup.message).toContain('دورهٔ جبرانی');
  });
});
