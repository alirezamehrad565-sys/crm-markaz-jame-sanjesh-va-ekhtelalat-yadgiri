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
 *
 * فیکسچرها (شبکهٔ درون‌حافظه‌ای، cursor کلیدsetی، صندوق/outbox فیک) به catchup-harness.ts
 * منتقل شده‌اند تا آزمون مبتنی بر خاصیت (EXP-3) و سنجهٔ کارایی دقیقاً همین قرارداد را
 * مصرف کنند — رفتار آزمون‌های این فایل بایت‌به‌بایت همان است.
 */
import { describe, it, expect } from 'vitest';
import { createNodeSyncRunner, CATCHUP_CURSOR_KEY, CATCHUP_STATE_KEY, PUSH_WATERMARK_KEY, NODE_VERSION_KEY, RECONCILE_KEY, LOCAL_MAX_KEY } from '../runner';
import type { CatchUpOutcome, CatchUpStateV1, NodeSyncRunner } from '../runner';
import { createSyncCoordinator } from '../coordinator';
import { APP_VERSION } from '../../core/version';
import {
  encodeCursor,
  decodeCursor,
  memStore,
  makeWorld,
  carryOverState,
  seedPullItems,
  seedOutboxItems,
  catchupStateOf
} from './catchup-harness';

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
    // وضعیت جهان (صندوق/ابر/شمارنده‌ها) به جهانِ ترمیم‌شده منتقل می‌شود — شبکه تازه است، داده نه
    const healed = makeWorld();
    carryOverState(world, healed);
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

// ───────────────────────── موج ۱ — هندشیک نسخه (۱-۴)، ساعت مرجع مرکز (۱-۳)، خلاصهٔ تکمیل جبران ─────────────────────────

describe('موج ۱ — هندشیک نسخه و ساعت مرکز در دورهٔ جبرانی', () => {
  function versionSeenOf(store: ReturnType<typeof memStore>): Record<string, unknown> {
    const raw = store.dump().get(NODE_VERSION_KEY);
    expect(raw).toBeTruthy();
    return JSON.parse(raw ?? '{}') as Record<string, unknown>;
  }

  it('پاسخ‌های سازگار pull/push → هندشیک در انبار می‌نشیند و آینهٔ status آن را می‌برد (compatible=true، بی‌هشدار ساعت)', async () => {
    const world = makeWorld({ handshake: { centerVersion: '1.26.0', minNodeVersion: '1.26.0' } });
    world.center.pullItems = seedPullItems(3);
    world.engine.outbox = seedOutboxItems(2);
    const store = memStore();
    const runner = world.makeRunner(store);

    const out = await runner.catchUp();
    expect(out.status).toBe('ok');

    const hs = versionSeenOf(store);
    expect(hs.client).toBe(APP_VERSION);
    expect(hs.center).toBe('1.26.0');
    expect(hs.min_node).toBe('1.26.0');
    expect(hs.compatible).toBe(true);
    expect(typeof hs.server_ts).toBe('string'); // ساعت مرجع مرکز (۱-۳)
    expect(hs.clock_drift_minutes).toBe(0); // ساعت فیک همان لحظه — اختلاف ~۰
    expect(hs.clock_warning).toBe(false);

    const mirror = world.engine.mirrors[world.engine.mirrors.length - 1] as Record<string, unknown>;
    expect(mirror.version).toEqual({ client: APP_VERSION, center: '1.26.0', compatible: true });
    expect(mirror.clock_drift_minutes).toBe(0);
    expect(mirror.clock_warning).toBe(false);
  });

  it('ناسازگاری در پاسخ pull (APP_VERSION < min_node_version) → version_error قبل از استقرار، push نمی‌رود، هماهنگ‌ساز paused_version می‌شود', async () => {
    const world = makeWorld({ handshake: { centerVersion: '9.0.0', minNodeVersion: '9.0.0' } });
    world.center.pullItems = seedPullItems(10);
    world.engine.outbox = seedOutboxItems(5);
    const store = memStore();
    const runner = world.makeRunner(store);
    const coord = createSyncCoordinator({ runner, progressStorage: store, scheduleFn: () => () => undefined });

    const r = await coord.runCatchUp();

    expect(r.catchup.status).toBe('version_error');
    expect(r.catchup.phase).toBe('pull');
    expect(r.catchup.message).toContain('حداقل نسخهٔ مجاز مرکز'); // پیام فارسی با شماره‌ها
    expect(world.engine.ingestCalls).toBe(0); // هیچ صفحه‌ای استقرار نیافت — گیت پیش از تعهد
    expect(world.center.pushCalls).toBe(0); // فاز push هم skip شد (هم‌رفتار مسیر ۴۲۶)
    expect(coord.state().mode).toBe('paused_version');
    expect(coord.state().last_error_kind).toBe('version');

    const hs = versionSeenOf(store);
    expect(hs.compatible).toBe(false);
    expect(hs.center).toBe('9.0.0');
    expect(hs.min_node).toBe('9.0.0');
    // آینهٔ آخر (بعد از داوری هماهنگ‌ساز) — نسخهٔ ناسازگار + مود paused_version برای ردیف قرمز UI
    const mirror = world.engine.mirrors[world.engine.mirrors.length - 1] as Record<string, unknown>;
    expect(mirror.mode).toBe('paused_version');
    expect(mirror.version).toEqual({ client: APP_VERSION, center: '9.0.0', compatible: false });
    // وضعیت catch-up هم error با kind نسخه است
    expect(catchupStateOf(store).state).toBe('error');
    expect(catchupStateOf(store).last_error_kind).toBe('version_error');
  });

  it('ناسازگاری که فقط در پاسخ push آشکار می‌شود → version_error در فاز push؛ watermark جلو نمی‌رود', async () => {
    const world = makeWorld({
      handshake: { centerVersion: '1.26.0', minNodeVersion: '1.26.0' }, // pull سازگار
      pushHandshake: { centerVersion: '9.0.0', minNodeVersion: '9.0.0' } // push ناسازگار
    });
    world.center.pullItems = seedPullItems(2);
    world.engine.outbox = seedOutboxItems(5); // یک بستهٔ ≤۱۰۰ — همان بسته ناسازگاری را می‌بیند
    const store = memStore();
    const runner = world.makeRunner(store);
    const coord = createSyncCoordinator({ runner, progressStorage: store, scheduleFn: () => () => undefined });

    const r = await coord.runCatchUp();

    expect(r.catchup.status).toBe('version_error');
    expect(r.catchup.phase).toBe('push');
    expect(world.center.pushCalls).toBe(1); // یک بسته رفت و پاسخ ناسازگار آمد
    // فیکِ مرکز بدنه را پذیرفته (۲۰۰ با پاکت ناسازگار) — از دید runner این «ack» رد شد:
    // watermark جلو نرفته تا بسته در دورهٔ بعدِ سازگار دوباره برود و ابر با PK بشمارد
    expect(world.center.pushEvents.size).toBe(5);
    expect(store.dump().get(PUSH_WATERMARK_KEY) ?? null).toBeNull(); // watermark محفوظ — دورهٔ بعد دوباره
    expect(coord.state().mode).toBe('paused_version');
    expect(versionSeenOf(store).compatible).toBe(false);
    expect((versionSeenOf(store).center as string)).toBe('9.0.0'); // نسخهٔ تازه‌ترین پاسخ برنده است
  });

  it('اختلاف ساعت مرکز > ۲ دقیقه → clock_warning=true و clock_drift_minutes عددی؛ اختلاف جزئی بی‌هشدار — و رفتار سینک عوض نمی‌شود', async () => {
    // ۳۰ دقیقه جلوتر از دستگاه — هشدار زرد (۱-۳) ولی دورهٔ جبرانی همچنان ok کامل می‌شود
    const world = makeWorld({ handshake: { centerVersion: '1.26.0', minNodeVersion: '1.26.0', serverTsOffsetMs: 30 * 60_000 } });
    world.center.pullItems = seedPullItems(1);
    const store = memStore();
    const runner = world.makeRunner(store);
    const out = await runner.catchUp();
    expect(out.status).toBe('ok');
    expect(out.pull_done).toBe(true);

    const hs = versionSeenOf(store);
    expect(hs.clock_drift_minutes).toBe(30);
    expect(hs.clock_warning).toBe(true);
    const mirror = world.engine.mirrors[world.engine.mirrors.length - 1] as Record<string, unknown>;
    expect(mirror.clock_drift_minutes).toBe(30);
    expect(mirror.clock_warning).toBe(true);

    // ۱۰ ثانیه — گرد به صفر دقیقه، بی‌هشدار
    const calm = makeWorld({ handshake: { centerVersion: '1.26.0', minNodeVersion: '1.26.0', serverTsOffsetMs: 10_000 } });
    calm.center.pullItems = seedPullItems(1);
    const store2 = memStore();
    const runner2 = calm.makeRunner(store2);
    expect((await runner2.catchUp()).status).toBe('ok');
    const hs2 = versionSeenOf(store2);
    expect(hs2.clock_drift_minutes).toBe(0);
    expect(hs2.clock_warning).toBe(false);
  });
});

describe('موج ۱ — خلاصهٔ تکمیل جبران (بقیهٔ ۱-۱)', () => {
  it('دورهٔ کامل با دستاورد → last_catchup {at, pulled, pushed} در وضعیت catch-up و آینهٔ status می‌نشیند', async () => {
    const world = makeWorld();
    world.center.pullItems = seedPullItems(7);
    world.engine.outbox = seedOutboxItems(3);
    const store = memStore();
    const runner = world.makeRunner(store);

    await runner.catchUp();

    const st = catchupStateOf(store);
    expect(st.state).toBe('synced');
    expect(st.last_catchup).not.toBeNull();
    expect(st.last_catchup?.pulled).toBe(7); // آیتم‌های استقراریافته در صندوق
    expect(st.last_catchup?.pushed).toBe(3); // آیتم‌های محلی ackشدهٔ ابر
    expect(typeof st.last_catchup?.at).toBe('string');
    expect(Number.isNaN(Date.parse(st.last_catchup?.at ?? ''))).toBe(false);

    const mirror = world.engine.mirrors[world.engine.mirrors.length - 1] as Record<string, unknown>;
    expect(mirror.last_catchup).toEqual({ at: st.last_catchup?.at, pulled: 7, pushed: 3 });
  });

  it('دورهٔ دوم بی‌خبر (۰/۰) — synced می‌ماند ولی خلاصهٔ معنادار قبلی پاک نمی‌شود', async () => {
    const world = makeWorld();
    world.center.pullItems = seedPullItems(4);
    world.engine.outbox = seedOutboxItems(2);
    const store = memStore();
    const runner = world.makeRunner(store);

    await runner.catchUp();
    const first = catchupStateOf(store).last_catchup;
    expect(first?.pulled).toBe(4);

    const out2 = await runner.catchUp(); // هیچ تازه‌ای نیست — ۰/۰
    expect(out2.status).toBe('ok');
    expect(out2.items_pulled).toBe(0);
    expect(out2.items_pushed).toBe(0);
    const st2 = catchupStateOf(store);
    expect(st2.state).toBe('synced');
    expect(st2.last_catchup).toEqual(first); // خلاصهٔ دورهٔ پرکار حفظ شد
  });

  it('دورهٔ خطاخورده خلاصهٔ قبلی را بازنویسی نمی‌کند', async () => {
    // نخستین دوره: قطعی در pull و push — هیچ دورهٔ کاملی نبوده، خلاصه‌ای هم نیست و watermark جلو نرفته
    const world = makeWorld({ throwOnPullPage: 1, throwOnPushBatch: 1 });
    world.center.pullItems = seedPullItems(10);
    world.engine.outbox = seedOutboxItems(3);
    const store = memStore();
    const runner = world.makeRunner(store);
    expect((await runner.catchUp()).status).toBe('network_error');
    expect(catchupStateOf(store).last_catchup).toBeNull();

    // دورهٔ سالم بعدی کامل همگرا می‌شود و خلاصه می‌سازد
    const healed = makeWorld();
    healed.center.pullItems = world.center.pullItems;
    healed.engine.outbox = world.engine.outbox;
    const runner2 = healed.makeRunner(store);
    expect((await runner2.catchUp()).status).toBe('ok');
    const good = catchupStateOf(store).last_catchup;
    expect(good?.pulled).toBe(10);
    expect(good?.pushed).toBe(3);

    // قطعی تازه در pull — خلاصهٔ معنادار حفظ می‌ماند (بازنویسی با null نیست)
    const broken = makeWorld({ throwOnPullPage: 1 });
    broken.center.pullItems = [];
    const runner3 = broken.makeRunner(store);
    expect((await runner3.catchUp()).status).toBe('network_error');
    expect(catchupStateOf(store).last_catchup).toEqual(good);
  });
});

// ───────────────────────── EXP-1 — آشتی‌ساز (reconcile) ─────────────────────────

describe('EXP-1 — آشتی‌ساز: مقایسهٔ فقط-گزارشی پس از دورهٔ کامل جبرانی', () => {
  it('همگرایی کامل → هم‌خوانی: RECONCILE_KEY با ok=true می‌نشیند، بیشینهٔ محلی ثبت می‌شود و آینهٔ وضعیت reconciliation دارد', async () => {
    const world = makeWorld();
    world.center.pullItems = seedPullItems(120);
    world.engine.outbox = seedOutboxItems(30);
    const store = memStore();
    const runner = world.makeRunner(store);

    const out = await runner.catchUp();
    expect(out.status).toBe('ok');

    // نتیجهٔ آشتی‌ساز در انبار — هم‌خوانی کامل
    const raw = store.dump().get(RECONCILE_KEY);
    expect(raw).toBeTruthy();
    const rec = JSON.parse(raw ?? '{}') as { v: number; ok: boolean; differences: number; detail: unknown; at: string };
    expect(rec.v).toBe(1);
    expect(rec.ok).toBe(true);
    expect(rec.differences).toBe(0);
    expect(rec.detail).toBeNull();
    expect(Number.isNaN(Date.parse(rec.at))).toBe(false);

    // بیشینهٔ محلی مشاهده‌شده = updated_at آخرین آیتم همان دامنه (آینهٔ MAX(updated_at) صندوق)
    const localMax = JSON.parse(store.dump().get(LOCAL_MAX_KEY) ?? '{}') as Record<string, string>;
    expect(localMax.announcements).toBe('2026-10-27T00:02:00.000Z'); // ann-120 — آخرین آیتم

    // آینهٔ آخر به موتور محلی reconciliation هم می‌برد
    const mirror = world.engine.mirrors[world.engine.mirrors.length - 1] as Record<string, unknown>;
    expect(mirror.reconciliation).toEqual({ v: 1, at: rec.at, ok: true, differences: 0, detail: null });
  });

  it('حذف ردیف در مرکز (شبیه‌سازی شمارش ناهم‌خوان) → گزارش ناهم‌خوانی با {domain, center, local}، بدون هیچ اصلاح محلی', async () => {
    const world = makeWorld();
    world.center.pullItems = seedPullItems(300);
    world.engine.outbox = [];
    const store = memStore();
    const runner = world.makeRunner(store);
    expect((await runner.catchUp()).status).toBe('ok');
    const before = store.dump().get(RECONCILE_KEY);
    expect(before).toBeTruthy();

    // مرکز ۵۰ ردیف کم می‌شود (حذف سمت مرکز) — صندوق محلی دست می‌خورد؟ نه: فقط گزارش
    world.center.pullItems = world.center.pullItems.slice(0, 250);
    const out2 = await runner.catchUp(); // هیچ تازه‌ای برای cursor — دورهٔ synced تازه
    expect(out2.status).toBe('ok');
    expect(out2.items_pulled).toBe(0);
    expect(world.engine.inbox.size).toBe(300); // هیچ اصلاحی محلی رخ نداده — فقط گزارش

    const rec = JSON.parse(store.dump().get(RECONCILE_KEY) ?? '{}') as { ok: boolean; differences: number; detail: Array<{ domain: string; center: number; local: number }> };
    expect(rec.ok).toBe(false);
    expect(rec.differences).toBe(1);
    expect(rec.detail).toEqual([{ domain: 'announcements', center: 250, local: 300 }]);
  });

  it('لغزش مُهر (شمارش برابر، بیشینهٔ updated_at متفاوت) → همان دامنه ناهم‌خوان گزارش می‌شود', async () => {
    const world = makeWorld();
    world.center.pullItems = seedPullItems(150);
    world.engine.outbox = [];
    const store = memStore();
    const runner = world.makeRunner(store);
    expect((await runner.catchUp()).status).toBe('ok');

    // مُهر آخرین ردیف مرکز به عقب کشیده می‌شود — قبل از cursor است و دوباره نمی‌آید؛
    // شمارش برابر می‌ماند ولی بیشینهٔ مرکز از بیشینهٔ محلی عقب می‌افتد → ناهم‌خوانی
    world.center.pullItems[149].updated_at = '2026-10-20T00:00:00.000Z';
    expect((await runner.catchUp()).status).toBe('ok');

    const rec = JSON.parse(store.dump().get(RECONCILE_KEY) ?? '{}') as { ok: boolean; differences: number; detail: Array<{ domain: string; center: number; local: number }> };
    expect(rec.ok).toBe(false);
    expect(rec.differences).toBe(1);
    expect(rec.detail).toEqual([{ domain: 'announcements', center: 150, local: 150 }]);
  });

  it('درگاه شمارش محلی/مرکز در دسترس نیست → نتیجهٔ قبلی دست‌نخورده می‌ماند و دورهٔ جبرانی سالم می‌ماند', async () => {
    const world = makeWorld();
    world.center.pullItems = seedPullItems(60);
    const store = memStore();
    const runner = world.makeRunner(store);
    expect((await runner.catchUp()).status).toBe('ok');
    const firstRec = store.dump().get(RECONCILE_KEY);
    expect(firstRec).toBeTruthy();

    // شمارش صندوق محلی ۴۰۴ می‌دهد — آشتی‌ساز نرم عقب می‌نشیند، نتیجهٔ قبلی پاک نمی‌شود
    const blindLocal = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/internal/sync/status')) return new Response('not found', { status: 404 });
      return world.fetch(input as string, init);
    }) as typeof fetch;
    const blindRunner = createNodeSyncRunner({
      baseUrl: 'https://center.test',
      nodeCode: 'DESKTOP:test-node',
      nodeKey: 'nk_live_test',
      progressStorage: store,
      fetchFn: blindLocal as never,
      tokenProvider: () => 'sess-token'
    });
    const out = await blindRunner.catchUp();
    expect(out.status).toBe('ok');
    expect(out.pull_done).toBe(true);
    expect(store.dump().get(RECONCILE_KEY)).toBe(firstRec); // نتیجهٔ قبلی محفوظ

    // مرکز هم در دسترس نباشد — همان ماندگاری نرم
    const deadCenter = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/node/reconcile')) throw new Error('socket down (reconcile)');
      return world.fetch(input as string, init);
    }) as typeof fetch;
    const deadRunner = createNodeSyncRunner({
      baseUrl: 'https://center.test',
      nodeCode: 'DESKTOP:test-node',
      nodeKey: 'nk_live_test',
      progressStorage: store,
      fetchFn: deadCenter as never,
      tokenProvider: () => 'sess-token'
    });
    expect((await deadRunner.catchUp()).status).toBe('ok');
    expect(store.dump().get(RECONCILE_KEY)).toBe(firstRec);
  });

  it('دورهٔ ناقص (سقف صفحات) آشتی‌ساز را نمی‌زند — فقط دورهٔ synced می‌زند', async () => {
    const world = makeWorld();
    world.center.pullItems = seedPullItems(300); // ۶ صفحهٔ ۵۰تایی
    const store = memStore();
    const runner = world.makeRunner(store);

    const out1 = await runner.catchUp({ maxPages: 2 });
    expect(out1.status).toBe('ok');
    expect(catchupStateOf(store).state).toBe('catching_up');
    expect(store.dump().get(RECONCILE_KEY) ?? null).toBeNull(); // هنوز هیچ آشتی‌سازی

    expect((await runner.catchUp()).status).toBe('ok');
    expect(catchupStateOf(store).state).toBe('synced');
    const rec = JSON.parse(store.dump().get(RECONCILE_KEY) ?? '{}') as { ok: boolean };
    expect(rec.ok).toBe(true);
  });
});
