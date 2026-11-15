/**
 * EXP-2 — ماتریس تزریق خرابی در CI (فایل تازه؛ هارنس مشترک + پسوند catchup-fault-harness.ts)
 *
 * ماتریس = ۴ کلاس خرابی × ۲ جهت (pull و push) — ۸ سلول؛ هر سلول چند «مورد»:
 *   • خرابی در فراخوانی ۱ (اولین تماس جهت)
 *   • خرابی در فراخوانی ۳ (وسط جریان — ۱۲۰ آیتم pull = ۳ صفحه، ۲۵۰ آیتم push = ۳ بسته)
 *   • کلاس «۵۰۰ تصادفی»: ۵ دانهٔ PRNG قطعی — هر دانه ۱ تا ۳ نقطهٔ خرابی میان فراخوانی‌های
 *     دورهٔ نخست (پوشش خرابی‌های تصادفی وسط جبران؛ پوشش کامل ۱–۴ نقطه‌ای نزد EXP-3 است)
 * جمع موارد: ۱۰ pull + ۱۰ push + ۱ ترکیبی = ۲۱ مورد روی ۸ سلول.
 *
 * نامتغیرهای هر مورد (ادعای §EXP-2):
 *   • هیچ crash و هیچ حلقهٔ خطا: runner.catchUp قرارداداً هیچ throwی ندارد و با تکرار
 *     محدود (پس از برطرف‌شدن خرابی‌ها) همگرا می‌شود و به وضعیت synced می‌نشیند.
 *   • صفر ردیف دوبله: صندوق محلی و ابر هر کدام دقیقاً به‌اندازهٔ آیتم‌های یکتا ردیف دارند
 *     (قرارداد PK) — دوباره‌ارسالی‌ها فقط شمارش duplicates را بالا می‌برند.
 *   • صفر گم‌شدگی: هر آیتم بذرشده در سمت مقابل حاضر است.
 *   • همگرایی پس از پاک‌شدن خرابی‌ها + سکون: یک دورهٔ اضافه پس از همگرایی هیچ انتقالی
 *     ندارد (cursor/watermark درست بسته شده‌اند).
 *   • قرارداد cursor/ack (کلاس ۴): آیتم‌های ackشده هم گم نمی‌شوند هم دوبله اعمال نمی‌شوند —
 *     ردیف‌های ackشده همان دورهٔ خراب روی سرور نشسته‌اند، cursor/watermark جلو نرفته،
 *     دورهٔ بعد همان‌ها دوباره می‌روند و PK می‌شمارد (duplicates > 0، ردیف یکتا).
 */

import { describe, expect, it } from 'vitest';
import type { CatchUpOutcome, NodeSyncRunner } from '../runner';
import { memStore, seedPullItems, seedOutboxItems, catchupStateOf } from './catchup-harness';
import type { NodeSyncStore } from '../../node-sync-client/client';
import { makeFaultWorld, randomFaultPositions, type FaultSpec, type FaultTarget, type FaultKind, type FaultWorld } from './catchup-fault-harness';

/** اندازهٔ جهان — قطعی و ثابت در همهٔ موارد */
const PULL_SEED = 120; // سه صفحهٔ ۵۰+۵۰+۲۰ در هارنس (سقف صفحهٔ سناریو = ۵۰)
const PUSH_SEED = 250; // صفحهٔ outbox ۲۰۰ + برگ دوم ۵۱ → سه بستهٔ push (۱۰۰+۱۰۰+۵۱)

/** سقف دوره‌های تکرار تا همگرایی — خرابی‌ها یک‌بار مصرف‌اند؛ چند دوره بیشتر نمی‌خواهد */
const MAX_RUNS = 10;

/** جهان بذرشده + runner — مشترک همهٔ اجراها */
function seededWorld(specs: FaultSpec[]): { world: FaultWorld; store: ReturnType<typeof memStore>; runner: NodeSyncRunner } {
  const world = makeFaultWorld(specs);
  const store = memStore();
  world.center.pullItems = seedPullItems(PULL_SEED, 'announcements');
  world.engine.outbox = seedOutboxItems(PUSH_SEED, 'client_errors');
  const runner = world.makeRunner(store);
  return { world, store, runner };
}

/** تکرار catchUp تا همگرایی (یا سقف) — قرارداد نرم: هیچ throwی مجاز نیست */
async function runToConvergence(runner: NodeSyncRunner): Promise<{ runs: number; outcome: CatchUpOutcome }> {
  let runs = 0;
  let outcome = await runner.catchUp();
  runs += 1;
  while (!(outcome.status === 'ok' && outcome.pull_done && outcome.push_done) && runs < MAX_RUNS) {
    outcome = await runner.catchUp();
    runs += 1;
  }
  return { runs, outcome };
}

/** اجرای کامل یک مورد ماتریس: نخستین دورهٔ خراب + همگرایی */
async function runMatrixCase(specs: FaultSpec[]): Promise<{
  runs: number;
  outcome: CatchUpOutcome;
  firstOutcome: CatchUpOutcome;
  world: FaultWorld;
  store: ReturnType<typeof memStore>;
}> {
  const { world, store, runner } = seededWorld(specs);
  const firstOutcome = await runner.catchUp();
  const { runs, outcome } = await runToConvergence(runner);
  return { runs: runs + 1, outcome, firstOutcome, world, store };
}

/** نامتغیرهای پایانی مشترک همهٔ سلول‌ها — همگرایی، صفر دوبله، صفر گم‌شدگی، سکون */
async function assertConvergence(world: FaultWorld, store: ReturnType<typeof memStore>, outcome: CatchUpOutcome): Promise<void> {
  // همگرایی: دورهٔ پایانی ok با هر دو جهت کامل — هیچ حلقهٔ خطا و هیچ throwی (قرارداد نرم)
  expect(outcome.status).toBe('ok');
  expect(outcome.pull_done).toBe(true);
  expect(outcome.push_done).toBe(true);
  expect(catchupStateOf(store).state).toBe('synced');

  // صفر ردیف دوبله: هر سمت دقیقاً به‌اندازهٔ آیتم‌های یکتا
  expect(world.engine.inbox.size).toBe(PULL_SEED);
  expect(world.center.pushEvents.size).toBe(PUSH_SEED);

  // صفر گم‌شدگی: هر آیتم بذرشده در سمت مقابل حاضر است
  for (let i = 1; i <= PULL_SEED; i += 1) {
    expect(world.engine.inbox.has(`announcements:ann-${String(i).padStart(3, '0')}`)).toBe(true);
  }
  for (let i = 1; i <= PUSH_SEED; i += 1) {
    expect(world.center.pushEvents.has(`err-${String(i).padStart(4, '0')}`)).toBe(true);
  }

  // سکون: یک دورهٔ اضافه هیچ انتقالی ندارد — cursor/watermark درست بسته شده‌اند
  const runner = world.makeRunner(store);
  const steady = await runner.catchUp();
  expect(steady.status).toBe('ok');
  expect(steady.items_pulled).toBe(0);
  expect(steady.items_pushed).toBe(0);
  expect(world.engine.inbox.size).toBe(PULL_SEED);
  expect(world.center.pushEvents.size).toBe(PUSH_SEED);
}

/** اثبات تزریق: مشخصه‌های خواسته‌شده واقعاً گرفته‌اند (تست بی‌اثر نمی‌گذرد) */
function expectFired(world: FaultWorld, kind: FaultKind, target: FaultTarget, count: number): void {
  const hits = world.fired.filter((f) => f.endsWith(`:${kind}`) && f.startsWith(`${target}@`));
  expect(hits.length).toBe(count);
}

/* ─── سلول‌های ماتریس — جهت pull (صفحهٔ pull؛ کلاس ۴ روی ack استقرار) ─────────────── */

describe('EXP-2 — ماتریس خرابی، جهت pull', () => {
  it('① timeout — پاسخ دیرِ فراخوانی ۱ و فراخوانی ۳: همگرایی، صفر دوبله/گم‌شدگی', async () => {
    const result = await runMatrixCase([
      { kind: 'timeout', target: 'pull', call: 1, hangMs: 25 },
      { kind: 'timeout', target: 'pull', call: 3, hangMs: 25 }
    ]);
    expect(result.firstOutcome.status).toBe('ok'); // دیر ولی سالم — همان دوره پذیرفته شد
    expectFired(result.world, 'timeout', 'pull', 2);
    await assertConvergence(result.world, result.store, result.outcome);
  });

  it('② half_body — بدنهٔ بریدهٔ فراخوانی ۱ و ۳: رد نرم NODE_PULL_BODY_INVALID و همگرایی', async () => {
    const result = await runMatrixCase([
      { kind: 'half_body', target: 'pull', call: 1 },
      { kind: 'half_body', target: 'pull', call: 3 }
    ]);
    // دورهٔ خراب ok نیست — کلاینت با خطای نرم ایستاده، crash/crash-loop ندارد
    expect(result.firstOutcome.status).not.toBe('ok');
    expectFired(result.world, 'half_body', 'pull', 2);
    await assertConvergence(result.world, result.store, result.outcome);
  });

  it('③ server_500 — پنج دانهٔ PRNG قطعی (۱–۳ نقطهٔ تصادفی در دورهٔ نخست): همگرایی', async () => {
    for (const seed of [11, 23, 37, 41, 53]) {
      const positions = randomFaultPositions(seed);
      const specs = positions.map((call) => ({ kind: 'server_500' as const, target: 'pull' as const, call }));
      const result = await runMatrixCase(specs);
      expect(result.runs).toBeLessThanOrEqual(MAX_RUNS);
      expectFired(result.world, 'server_500', 'pull', positions.length);
      await assertConvergence(result.world, result.store, result.outcome);
    }
  });

  it('④ ack_then_disconnect روی ack استقرار — فراخوانی ۱: ردیف‌های ackشده نشسته‌اند ولی cursor نرفته؛ دورهٔ بعد دقیقاً همان‌ها دوباره می‌روند (بدون گم‌شدگی و دوبله)', async () => {
    // دورهٔ خراب تنها — برای دیدن وضعیت «هنگام» خرابی
    const once = seededWorld([{ kind: 'ack_then_disconnect', target: 'ingest', call: 1 }]);
    const first = await once.runner.catchUp();
    expect(first.status).toBe('ingest_error'); // پاسخ گم — کلاینت متعهد نشد
    expect(once.world.engine.inbox.size).toBe(50); // ولی ack ثبت شد: صفحهٔ ۱ (۵۰ ردیف) روی صندوق نشسته — گم نشده
    expect(catchupStateOf(once.store).last_error_kind).toBe('ingest_error');

    // ادامه تا همگرایی — همان جهان، بدون ساخت تازه (قرارداد carry-over)
    const resumed = await runToConvergence(once.runner);
    expect(resumed.outcome.status).toBe('ok');
    await assertConvergence(once.world, once.store, resumed.outcome);
    expect(once.world.engine.ingestDuplicates).toBe(50); // دوباره‌تحویلی شمرده شد، نه دوباره‌اعمالی
  });

  it('④ ack_then_disconnect روی ack استقرار — فراخوانی ۳ (آخرین صفحه): همان قرارداد', async () => {
    const result = await runMatrixCase([{ kind: 'ack_then_disconnect', target: 'ingest', call: 3 }]);
    expect(result.firstOutcome.status).toBe('ingest_error');
    await assertConvergence(result.world, result.store, result.outcome);
    expect(result.world.engine.ingestDuplicates).toBe(20); // صفحهٔ ۳ = ۲۰ آیتم باقیمانده — دوباره تحویل و با PK شمرده شد
  });
});

/* ─── سلول‌های ماتریس — جهت push (بستهٔ push به ابر؛ ack ابر قبل از watermark) ────── */

describe('EXP-2 — ماتریس خرابی، جهت push', () => {
  it('① timeout — پاسخ دیرِ بستهٔ ۱ و بستهٔ ۳: همگرایی، صفر دوبله/گم‌شدگی', async () => {
    const result = await runMatrixCase([
      { kind: 'timeout', target: 'push', call: 1, hangMs: 25 },
      { kind: 'timeout', target: 'push', call: 3, hangMs: 25 }
    ]);
    expect(result.firstOutcome.status).toBe('ok');
    expectFired(result.world, 'timeout', 'push', 2);
    await assertConvergence(result.world, result.store, result.outcome);
  });

  it('② half_body — بدنهٔ بریدهٔ پاسخ push (بستهٔ ۱ و ۳): توقف محافظه‌کارانه (NODE_PUSH_BODY_INVALID) و همگرایی', async () => {
    const result = await runMatrixCase([
      { kind: 'half_body', target: 'push', call: 1 },
      { kind: 'half_body', target: 'push', call: 3 }
    ]);
    expect(result.firstOutcome.status).not.toBe('ok');
    expectFired(result.world, 'half_body', 'push', 2);
    await assertConvergence(result.world, result.store, result.outcome);
  });

  it('③ server_500 — پنج دانهٔ PRNG قطعی (۱–۳ نقطهٔ تصادفی در دورهٔ نخست): همگرایی', async () => {
    for (const seed of [7, 19, 29, 43, 61]) {
      const positions = randomFaultPositions(seed);
      const specs = positions.map((call) => ({ kind: 'server_500' as const, target: 'push' as const, call }));
      const result = await runMatrixCase(specs);
      expect(result.runs).toBeLessThanOrEqual(MAX_RUNS);
      expectFired(result.world, 'server_500', 'push', positions.length);
      await assertConvergence(result.world, result.store, result.outcome);
    }
  });

  it('④ ack_then_disconnect روی push — بستهٔ ۱: ابر ۱۰۰ آیتم ack کرده ولی watermark نرفته؛ دورهٔ بعد همان‌ها دوباره می‌روند (بدون گم‌شدگی و دوبله)', async () => {
    const once = seededWorld([{ kind: 'ack_then_disconnect', target: 'push', call: 1 }]);
    const first = await once.runner.catchUp();
    expect(first.status).toBe('network_error'); // پاسخ ابر گم — watermark متعهد نشد
    expect(once.world.center.pushEvents.size).toBe(100); // ولی ack ثبت شد: بستهٔ ۱ (۱۰۰ رویداد) روی ابر نشسته — گم نشده

    const resumed = await runToConvergence(once.runner);
    expect(resumed.outcome.status).toBe('ok');
    await assertConvergence(once.world, once.store, resumed.outcome);
    expect(once.world.center.duplicates).toBeGreaterThanOrEqual(100); // دوباره‌ارسالی با PK شمرده شد، نه دوباره‌نویسی
  });

  it('④ ack_then_disconnect روی push — بستهٔ ۳ (آخرین بستهٔ ۵۱تایی): همان قرارداد', async () => {
    const result = await runMatrixCase([{ kind: 'ack_then_disconnect', target: 'push', call: 3 }]);
    expect(result.firstOutcome.status).toBe('network_error');
    await assertConvergence(result.world, result.store, result.outcome);
    // ۵۱ دوباره‌ارسالی + ۱ قلم مرزی watermark (پایان صفحهٔ پر با -۱ms عمداً دوباره می‌رود)
    expect(result.world.center.duplicates).toBe(52);
  });
});

/* ─── سناریوی ترکیبی — خرابی هم‌زمان در هر دو جهت، وسط یک دورهٔ واحد ──────────────── */

describe('EXP-2 — سناریوی ترکیبی', () => {
  it('خرابی تصادفی هم‌زمان در هر دو جهت (دانه‌های مستقل PRNG برای pull و push): همگرایی و نامتغیرها', async () => {
    const pullSpots = randomFaultPositions(101);
    const pushSpots = randomFaultPositions(202);
    const specs: FaultSpec[] = [
      ...pullSpots.map((call) => ({ kind: 'server_500' as const, target: 'pull' as const, call })),
      ...pushSpots.map((call) => ({ kind: 'ack_then_disconnect' as const, target: 'push' as const, call }))
    ];
    const result = await runMatrixCase(specs);
    expect(result.runs).toBeLessThanOrEqual(MAX_RUNS);
    expectFired(result.world, 'server_500', 'pull', pullSpots.length);
    expectFired(result.world, 'ack_then_disconnect', 'push', pushSpots.length);
    await assertConvergence(result.world, result.store, result.outcome);
  });
});
