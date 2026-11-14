/**
 * EXP-2 — پسوند هارنس خرابی برای ماتریس تزریق خرابی (فایل تازه — catchup-harness.ts
 * دست‌نخورده می‌ماند؛ فقط مصرف و پوشش می‌شود)
 *
 * روی makeWorld هارنس مشترک یک «نقشهٔ خرابی» می‌پوشاند: هر گونه خرابی روی هدف مشخص
 * (pull / ingest / push) در فراخوانی n-ام آن هدف تزریق می‌شود و هر مشخصه دقیقاً یک‌بار
 * می‌گیرد — پس پس از نخستین وقوع، خرابی «برطرف» است و دورهٔ بعد باید همگرا شود.
 *
 * چهار کلاس خرابی §EXP-2:
 *   ① timeout            — پاسخ دیر می‌آید (آویزان‌شدن، سپس پاسخ کامل)؛ تأخیر کوچک برای
 *                          بودجهٔ زمان CI — قرارداد همان «دیر ولی سالم» است.
 *   ② half_body          — بدنهٔ JSON وسط جریان بریده می‌شود (پاسخ ۲۰۰ با بدنهٔ نیم‌سالم).
 *   ③ server_500         — پاسخ ۵۰۰ بدون هیچ اثری روی وضعیت سمت سرور.
 *   ④ ack_then_disconnect — سرور درخواست را کامل پردازش می‌کند (ack) ولی پاسخ در راه
 *                          گم می‌شود: کلاینت cursor/watermark را جلو نمی‌برد و همان
 *                          آیتم‌ها در دورهٔ بعد دوباره می‌روند — قرارداد cursor/ack.
 * اهداف per جهت:
 *   pull  → صفحهٔ pull (کلاس‌های ①②③) و ack استقرار صندوق (کلاس ۴ — cursor بعد از ۲۰۰
 *           استقرار جلو می‌رود؛ گم‌شدن پاسخ استقرار یعنی cursor نرفته ولی ردیف‌ها نشسته‌اند)
 *   push  → بستهٔ push (کلاس‌های ①②③④ — ack ابر قبل از پیشروی watermark)
 */

import { createNodeSyncRunner } from '../runner';
import type { NodeSyncRunner } from '../runner';
import { makeWorld } from './catchup-harness';
import type { NodeSyncStore } from '../../node-sync-client/client';

export type FaultKind = 'timeout' | 'half_body' | 'server_500' | 'ack_then_disconnect';
export type FaultTarget = 'pull' | 'ingest' | 'push';

/** یک مشخصهٔ خرابی: کلاس + هدف + شمارهٔ فراخوانی ۱-پایهٔ همان هدف */
export interface FaultSpec {
  kind: FaultKind;
  target: FaultTarget;
  call: number;
  /** فقط timeout — تأخیر پاسخ به میلی‌ثانیه (پیش‌فرض ۲۰ms برای بودجهٔ CI) */
  hangMs?: number;
}

/** تشخیص هدف از URL — همان قواعد مسیریابی هارنس مشترک */
function targetOf(url: string): FaultTarget | null {
  if (url.includes('/node/pull')) return 'pull';
  if (url.includes('/node/push')) return 'push';
  if (url.includes('/api/internal/sync/ingest')) return 'ingest';
  return null;
}

/** PRNG قطعی mulberry32 — برای موارد «۵۰۰ تصادفی» بدون Math.random */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * نقطه‌های «تصادفیِ قطعی» برای کلاس ۵۰۰: میان فراخوانی‌های دورهٔ نخست هدف (پنجرهٔ ۳ —
 * همه در یک دورهٔ catchUp رخ می‌دهند)، با احتمال ۵۵٪ و سقف ۳ نقطه. حداقل یک نقطه.
 * (پوشش کامل ۱–۴ نقطه‌ای به‌صورت دو جهته در ماتریس و پراپرتی‌تست EXP-3 هست.)
 */
export function randomFaultPositions(seed: number, window = 3, maxSpots = 3): number[] {
  const rnd = mulberry32(seed);
  const spots: number[] = [];
  for (let call = 1; call <= window; call += 1) {
    if (spots.length >= maxSpots) break;
    if (rnd() < 0.55) spots.push(call);
  }
  if (spots.length === 0) spots.push(1);
  return spots;
}

/** نتیجهٔ makeFaultWorld — هم‌شکل makeWorld + گزارش خرابی‌های مصرف‌شده */
export interface FaultWorld {
  center: ReturnType<typeof makeWorld>['center'];
  engine: ReturnType<typeof makeWorld>['engine'];
  fetch: typeof fetch;
  makeRunner: (store: NodeSyncStore) => NodeSyncRunner;
  /** مشخصه‌هایی که واقعاً تزریق شده‌اند — هر مورد «هدف@شماره» (برای اثبات تزریق) */
  fired: string[];
}

const HANG_MS_DEFAULT = 20;

export function makeFaultWorld(specs: FaultSpec[]): FaultWorld {
  const base = makeWorld();
  const fired: string[] = [];
  // مصرف یک‌بار: کلید «کلاس|هدف|شماره» → هر مشخصه فقط در نخستین فراخوانی منطبق می‌گیرد
  const consumed = new Set<string>();
  const counters: Record<FaultTarget, number> = { pull: 0, ingest: 0, push: 0 };

  const faultedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const target = targetOf(url);
    if (target === null) return base.fetch(input as never, init);

    counters[target] += 1;
    const call = counters[target];
    const spec = specs.find((s) => s.target === target && s.call === call);
    const key = `${target}|${call}`;
    if (!spec || consumed.has(key)) return base.fetch(input as never, init);
    consumed.add(key);
    fired.push(`${target}@${call}:${spec.kind}`);

    if (spec.kind === 'timeout') {
      // ① آویزان‌شدن، سپس پاسخ کامل (دیر ولی سالم — کلاینت باید پذیرشش کند)
      await new Promise((r) => setTimeout(r, spec.hangMs ?? HANG_MS_DEFAULT));
      return base.fetch(input as never, init);
    }

    if (spec.kind === 'half_body') {
      // ② پاسخ واقعی سرور، ولی بدنه وسط جریان بریده می‌شود → json نیم‌سالم
      const res = await base.fetch(input as never, init);
      const text = await res.text();
      const cut = Math.max(1, Math.floor(text.length / 2));
      return new Response(text.slice(0, cut), { status: res.status });
    }

    if (spec.kind === 'server_500') {
      // ③ ۵۰۰ بدون هیچ اثری روی وضعیت سمت سرور (درگاه رد کرد، چیزی ثبت نشد)
      return new Response(JSON.stringify({ error: 'INTERNAL_ERROR', message: 'خطای سرور — تزریق آزمون EXP-2' }), { status: 500 });
    }

    // ④ ack_then_disconnect — سرور کامل پردازش می‌کند (وضعیت عوض می‌شود؛ ack ثبت است)
    //    ولی پاسخ هرگز به کلاینت نمی‌رسد → cursor/watermark جلو نمی‌رود.
    await base.fetch(input as never, init);
    throw new Error(`disconnect after server ack — تزریق آزمون EXP-2 (${target}@${call})`);
  }) as typeof fetch;

  // runner با همان قرارداد makeRunner هارنس مشترک ساخته می‌شود — تنها تفاوت: fetchFn
  // همان fetch خرابی‌دار است (makeRunner اصلی به fetch بی‌خرابی بسته است).
  function makeRunner(store: NodeSyncStore): NodeSyncRunner {
    return createNodeSyncRunner({
      baseUrl: 'https://center.test',
      nodeCode: 'DESKTOP:test-node',
      nodeKey: 'nk_live_test',
      progressStorage: store,
      fetchFn: faultedFetch as never,
      tokenProvider: () => 'sess-token'
    });
  }

  return { center: base.center, engine: base.engine, fetch: faultedFetch, makeRunner, fired };
}
