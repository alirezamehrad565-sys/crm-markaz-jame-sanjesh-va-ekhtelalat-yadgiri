/**
 * EXP-3 — آزمون مبتنی بر خاصیت (property-based) برای همگام‌سازی جبرانی — fast-check
 *
 * سناریوهای تصادفی: شمارش تصادفی عملیات در هر دو سمت (سه دامنهٔ سفید pull، دو دامنهٔ پوش)،
 * قطعی تصادفی وسط دورهٔ جبرانی (pull/push/استقرار)، و تعداد تصادفی «قطع/اتصال دوباره».
 * نامتغیر پس از همگرایی (ادعای بریف EXP-3):
 *  ۱) شمارش محلی هر دامنه == شمارش مرکز همان دامنه؛
 *  ۲) صفر ردیف دوباره (قرارداد PK — صندوق و ابر هر کدام دقیقاً به‌اندازهٔ آیتم‌های یکتا)؛
 *  ۳) صفر عملیات گم‌شده (هر آیتم بذرشده در سمت مقابل حاضر است).
 * و به‌عنوان پوشش EXP-1: پس از همگرایی، آشتی‌ساز هم‌خوانی کامل گزارش می‌کند (ok=true،
 * differences=0) — چون پاسخ آشتی‌سازِ فیک از حقیقتِ همان جهان محاسبه می‌شود.
 * فیکسچرها عین catchup.test.ts هستند (catchup-harness.ts) — نه تقلید واگرا.
 * بودجهٔ زمان: numRuns=۲۵ با اندازه‌های متعارف — دور از سقف ~۹۰ ثانیه (اجرای واقعی <۱ ثانیه).
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { RECONCILE_KEY } from '../runner';
import { makeWorld, carryOverState, memStore, seedPullItems, seedOutboxItems, catchupStateOf } from './catchup-harness';
import type { PullRecord, OutboxRecord } from './catchup-harness';

/** دامنه‌های سفید pull و پوشِ سناریو — آینهٔ فهرست سفید کلاینت */
const PULL_DOMAINS = ['announcements', 'packages', 'library'] as const;
const PUSH_DOMAINS = ['client_errors', 'health_ping'] as const;

/** شمارش هر دامنهٔ pull/پوش در جهان — اندازه‌های متعارف برای بودجهٔ زمان */
const pullCountsArb = fc.record({
  announcements: fc.integer({ min: 0, max: 80 }),
  packages: fc.integer({ min: 0, max: 80 }),
  library: fc.integer({ min: 0, max: 80 })
});
const pushCountsArb = fc.record({
  client_errors: fc.integer({ min: 0, max: 80 }),
  health_ping: fc.integer({ min: 0, max: 40 })
});

/** قطعی تصادفی وسط دوره — هر کدام اختیاری با نقطهٔ پرتاب ۱ تا ۴ */
const failureArb = fc.record({
  pullFail: fc.option(fc.integer({ min: 1, max: 4 }), { nil: null, freq: 2 }),
  pushFail: fc.option(fc.integer({ min: 1, max: 3 }), { nil: null, freq: 2 }),
  ingestFail: fc.option(fc.integer({ min: 1, max: 3 }), { nil: null, freq: 2 })
});

/** تعداد دورهای «قطع → اتصال دوباره» پس از نخستین ترمیم — صفر تا دو */
const reconnectsArb = fc.integer({ min: 0, max: 2 });

describe('EXP-3 — خاصیت همگرایی catch-up: هم‌شماری، صفر دوباره، صفر اتلاف (۲۵ سناریوی تصادفی)', () => {
  it('هر سناریوی تصادفی پس از همگرایی: شمارش محلی == مرکز در هر دامنه، صفر ردیف دوباره، صفر گم‌شده', async () => {
    await fc.assert(
      fc.asyncProperty(pullCountsArb, pushCountsArb, failureArb, reconnectsArb, async (pullCounts, pushCounts, failure, reconnects) => {
        // ── بذر جهان نخست با قطعی تزریقی (نام‌های arbitrary → گزینه‌های makeWorld) ──
        const firstCfg =
          failure.pullFail === null && failure.pushFail === null && failure.ingestFail === null
            ? undefined
            : {
                throwOnPullPage: failure.pullFail ?? undefined,
                throwOnPushBatch: failure.pushFail ?? undefined,
                throwOnIngest: failure.ingestFail ?? undefined
              };
        const first = makeWorld(firstCfg);
        const pullItems: PullRecord[] = [];
        for (const d of PULL_DOMAINS) pullItems.push(...seedPullItems(pullCounts[d], d));
        const outboxItems: OutboxRecord[] = [];
        for (const d of PUSH_DOMAINS) outboxItems.push(...seedOutboxItems(pushCounts[d], d));
        first.center.pullItems = pullItems;
        first.engine.outbox = outboxItems;
        const store = memStore();
        const runner1 = first.makeRunner(store);
        await runner1.catchUp(); // دورهٔ نخست — شاید وسط راه قطع شود (تزریق)؛ هرگز throw نمی‌کند

        // ── ترمیم + دورهای قطع/وصل تصادفی — تا همگرایی با سقف سالم ──
        let world = first;
        for (let round = 0; round <= reconnects; round += 1) {
          if (round > 0) {
            // دور تازهٔ قطع: جهانِ شکسته روی وضعیت فعلی + یک دورهٔ جبرانیِ شاید‌قطع‌شده
            const broken = makeWorld(
              failure.pullFail === null && failure.pushFail === null && failure.ingestFail === null
                ? undefined
                : {
                    throwOnPullPage: failure.pullFail ?? undefined,
                    throwOnPushBatch: failure.pushFail ?? undefined,
                    throwOnIngest: failure.ingestFail ?? undefined
                  }
            );
            carryOverState(world, broken);
            const brokenRunner = broken.makeRunner(store);
            await brokenRunner.catchUp();
            const healedMid = makeWorld();
            carryOverState(broken, healedMid);
            world = healedMid;
          } else {
            const healed = makeWorld();
            carryOverState(world, healed);
            world = healed;
          }
          const runner = world.makeRunner(store);
          for (let i = 0; i < 8; i += 1) {
            const out = await runner.catchUp();
            if (out.status === 'ok' && out.pull_done && out.push_done) break; // همگرا شد
          }
        }

        // ── نامتغیر ۱ — همگرایی: وضعیت دوره synced است ──
        expect(catchupStateOf(store).state).toBe('synced');

        // ── نامتغیر ۲ — هم‌شمار بودن هر دامنه: شمارش محلی == شمارش مرکز ──
        const totalPull = pullItems.length;
        expect(world.engine.inbox.size).toBe(totalPull); // صفر ردیف دوباره در صندوق (PK)
        for (const d of PULL_DOMAINS) {
          const centerCount = pullItems.filter((it) => it.domain === d).length;
          let localCount = 0;
          for (const key of world.engine.inbox.keys()) {
            if (key.startsWith(`${d}:`)) localCount += 1;
          }
          expect(localCount).toBe(centerCount); // شمارش محلی == مرکز
        }

        // ── نامتغیر ۳ — صفر عملیات گم‌شده سمت pull: هر آیتم بذرشده در صندوق حاضر است ──
        for (const it of pullItems) {
          expect(world.engine.inbox.has(`${it.domain}:${it.id}`)).toBe(true);
        }

        // ── نامتغیر ۴ — صفر ردیف دوباره در ابر + صفر اتلاف سمت push ──
        const totalPush = outboxItems.length;
        expect(world.center.pushEvents.size).toBe(totalPush); // PK (node,id) — صفر ردیف دوباره
        for (const it of outboxItems) {
          expect(world.center.pushEvents.has(it.id)).toBe(true);
        }
        for (const d of PUSH_DOMAINS) {
          const seeded = outboxItems.filter((it) => it.domain === d).length;
          let pushed = 0;
          for (const dom of world.center.pushDomainsById.values()) {
            if (dom === d) pushed += 1;
          }
          expect(pushed).toBe(seeded); // هم‌شمار بودن هر دامنهٔ پوش
        }

        // ── EXP-1 — پس از همگرایی، آشتی‌ساز هم‌خوانی کامل گزارش می‌کند (فقط-گزارش) ──
        const raw = store.dump().get(RECONCILE_KEY);
        expect(raw).toBeTruthy();
        const rec = JSON.parse(raw ?? '{}') as { ok?: boolean; differences?: number; detail?: unknown };
        expect(rec.ok).toBe(true);
        expect(rec.differences).toBe(0);
        expect(rec.detail).toBeNull();
        const lastMirror = world.engine.mirrors[world.engine.mirrors.length - 1] as { reconciliation?: { ok?: boolean; differences?: number } | null };
        expect(lastMirror.reconciliation?.ok).toBe(true);
        expect(lastMirror.reconciliation?.differences).toBe(0);
      }),
      { numRuns: 25 }
    );
  });

  it('کالکشن: پس از همگرایی، دورهٔ بی‌خبر بعدی هیچ ردیف تازه‌ای نمی‌سازد (پایداری هم‌شمار)', async () => {
    await fc.assert(
      fc.asyncProperty(pullCountsArb, pushCountsArb, async (pullCounts, pushCounts) => {
        const world = makeWorld();
        const pullItems: PullRecord[] = [];
        for (const d of PULL_DOMAINS) pullItems.push(...seedPullItems(pullCounts[d], d));
        const outboxItems: OutboxRecord[] = [];
        for (const d of PUSH_DOMAINS) outboxItems.push(...seedOutboxItems(pushCounts[d], d));
        world.center.pullItems = pullItems;
        world.engine.outbox = outboxItems;
        const store = memStore();
        const runner = world.makeRunner(store);

        for (let i = 0; i < 8; i += 1) {
          const out = await runner.catchUp();
          if (out.status === 'ok' && out.pull_done && out.push_done) break;
        }
        expect(world.engine.inbox.size).toBe(pullItems.length);
        expect(world.center.pushEvents.size).toBe(outboxItems.length);

        // دورهٔ بی‌خبر — هیچ دوباره‌سازی و هیچ تغییر شمارشی
        const out2 = await runner.catchUp();
        expect(out2.status).toBe('ok');
        expect(out2.items_pulled).toBe(0);
        expect(out2.items_pushed).toBe(0);
        expect(world.engine.inbox.size).toBe(pullItems.length);
        expect(world.center.pushEvents.size).toBe(outboxItems.length);
        expect(catchupStateOf(store).state).toBe('synced');
      }),
      { numRuns: 25 }
    );
  });
});
