#!/usr/bin/env node
/**
 * EXP-5 — سنجهٔ کارایی همگام‌سازی جبرانی (catch-up) — اسکریپت نود خام (خارج از vitest)
 *
 * اجرا: node scripts/bench-catchup.mjs [--n=5000]   (پیش‌فرض ۵۰۰۰)
 *
 * همان فیکسچر آزمون‌ها را مصرف می‌کند (src/node-sync-runner/__tests__/catchup-harness.ts —
 * ابر کلیدsetی درون‌حافظه‌ای + صندوق/outbox فیک) و با esbuildِ موجود در node_modules (وابستگی
 * transitivِ vitest — وابستگی تازه نصب نمی‌شود) باندلش می‌کند تا نود خام بتواند TS را بخواند.
 * سناریو: n رکورد سمت مرکز (pull) + n رکورد صندوق خروج محلی (push) — سپس «یک» دورهٔ
 * catchUp با سقف‌های پیش‌فرض و چاپ جدول فارسی: تعداد رکورد، زمان pull، زمان push، زمان کل،
 * همگرایی ✓/✗. زمان‌سنجی فازها با مُهر تکمیلِ فراخوانی‌های /node/pull و /node/push فیک.
 */
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = join(ROOT, 'src/node-sync-runner/__tests__/catchup-harness.ts');

// ─── پرچم --n (پیش‌فرض ۵۰۰۰) ───
function parseN(argv) {
  for (const a of argv) {
    const m = /^--n=(\d+)$/.exec(a);
    if (m) return Math.max(1, Number(m[1]));
    if (a === '--n') {
      const i = argv.indexOf(a);
      const v = Number(argv[i + 1]);
      if (Number.isFinite(v) && v >= 1) return Math.floor(v);
    }
  }
  return 5000;
}

const N = parseN(process.argv.slice(2));

// ─── ارقام فارسی و ممیز فارسی برای جدول ───
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const fa = (v) => String(v).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
const faMs = (ms) => `${fa((Math.round(ms * 100) / 100).toFixed(2)).replace('.', '٫')} میلی‌ثانیه`;

// ─── باندل فیکسچر TS با esbuild موجود در node_modules → فایل موقت ESM ───
async function bundleHarness() {
  const dir = await mkdtemp(join(tmpdir(), 'bench-catchup-'));
  const entry = join(dir, 'entry.ts');
  const outfile = join(dir, 'harness.mjs');
  await writeFile(
    entry,
    [
      `import * as H from ${JSON.stringify(HARNESS)};`,
      'export const { makeWorld, seedPullItems, seedOutboxItems, memStore, carryOverState, catchupStateOf } = H;'
    ].join('\n'),
    'utf8'
  );
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
    legalComments: 'none'
  });
  return { dir, url: pathToFileURL(outfile).href };
}

const { dir, url } = await bundleHarness();
try {
  const H = await import(url);

  // ─── جهان فیک با n رکورد در هر جهت + مُهر زمان فازها روی فراخوانی‌های شبکه ───
  const world = H.makeWorld();
  world.center.pullItems = H.seedPullItems(N);
  world.engine.outbox = H.seedOutboxItems(N);

  const T = { pullMs: 0, pushMs: 0 };
  const timedFetch = async (input, init) => {
    const urlStr = typeof input === 'string' ? input : String(input);
    const t0 = performance.now();
    const res = await world.fetch(input, init);
    const dt = performance.now() - t0;
    // تفکیک فازها بر پایهٔ مسیر: pull = خواندن ابر + استقرار در موتور محلی؛
    // push = صندوق خروج محلی + ارسال به ابر (همان دو فاز catchUp)
    if (urlStr.includes('/node/pull') || urlStr.includes('/api/internal/sync/ingest')) T.pullMs += dt;
    else if (urlStr.includes('/api/internal/sync/outbox') || urlStr.includes('/node/push')) T.pushMs += dt;
    return res;
  };

  // runner هم با esbuild باندل می‌شود — نود خام TS را مستقیم نمی‌خواند (importهای .js)
  const dirR = dir; // همان دیر موقت
  const entry2 = join(dirR, 'runner-entry.ts');
  const runnerOut = join(dirR, 'runner.mjs');
  await writeFile(
    entry2,
    `export { createNodeSyncRunner } from ${JSON.stringify(join(ROOT, 'src/node-sync-runner/runner.ts'))};`,
    'utf8'
  );
  await build({
    entryPoints: [entry2],
    outfile: runnerOut,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
    legalComments: 'none'
  });
  const { createNodeSyncRunner: makeRunner } = await import(pathToFileURL(runnerOut).href);

  const store = H.memStore();
  const runner = makeRunner({
    baseUrl: 'https://center.test',
    nodeCode: 'DESKTOP:bench-node',
    nodeKey: 'nk_live_bench',
    progressStorage: store,
    fetchFn: timedFetch,
    tokenProvider: () => 'sess-token'
  });

  // ─── دوره‌های catchUp تا تخلیهٔ کامل — یک دوره می‌تواند سقف سالم (۱۰۰ صفحه/۵۰ بسته) بخورد؛
  // همگرایی واقعی با «حقیقت داده» سنجیده می‌شود نه فقط پرچم آخرین دوره ───
  const MAX_ROUNDS = 10;
  let rounds = 0;
  let out = null;
  const wall0 = performance.now();
  for (; rounds < MAX_ROUNDS; rounds += 1) {
    out = await runner.catchUp();
    const drained = world.engine.inbox.size === world.center.pullItems.length
      && world.center.pushEvents.size === world.engine.outbox.length;
    if (out.status === 'ok' && out.pull_done && out.push_done && drained) break;
  }
  const totalMs = performance.now() - wall0;
  const pullMs = T.pullMs;
  const pushMs = T.pushMs;

  // ─── همگرایی: صندوق == مرکز و ابر == صندوق خروج (PKها صفر ردیف دوباره تضمین می‌کنند) ──
  const pullCount = world.center.pullItems.length;
  const pushCount = world.engine.outbox.length;
  const inboxOk = world.engine.inbox.size === pullCount;
  const pushOk = world.center.pushEvents.size === pushCount;
  const converged = Boolean(out) && out.status === 'ok' && out.pull_done && out.push_done && inboxOk && pushOk;

  // ─── جدول فارسی ───
  const W = [34, 30];
  const line = (l, r) => `│ ${l.padEnd(W[0])}│ ${String(r).padEnd(W[1])}│`;
  const rule = () => `├─${'─'.repeat(W[0])}┼─${'─'.repeat(W[1])}┤`;
  const rows = [
    ['تعداد رکورد', `${fa(N)} (pull: ${fa(pullCount)} · push: ${fa(pushCount)})`],
    ['زمان pull', faMs(pullMs)],
    ['زمان push', faMs(pushMs)],
    ['زمان کل', faMs(totalMs)],
    ['همگرایی', converged ? '✓ کامل — صفر اتلاف، صفر دوباره' : '✗ ناهم‌گرا'],
    ['دوره‌های جبرانی', `${fa(rounds + 1)} (سقف سالم ${fa(MAX_ROUNDS)})`],
    ['صفحات pull / بسته‌های push', `${fa(out.pages)} / ${fa(out.batches)}`],
    ['وضعیت دورهٔ آخر', out.status === 'ok' ? 'ok — هر دو جهت کامل' : String(out.status)]
  ];
  const top = `┌─${'─'.repeat(W[0])}┬─${'─'.repeat(W[1])}┐`;
  const head = line('سنجه', 'مقدار');
  const bottom = `└─${'─'.repeat(W[0])}┴─${'─'.repeat(W[1])}┘`;
  console.log('EXP-5 — سنجهٔ کارایی همگام‌سازی جبرانی (catch-up) — فیکسچر آزمون‌ها');
  console.log(top);
  console.log(head);
  console.log(rule());
  for (const [l, r] of rows) console.log(line(l, r));
  console.log(bottom);
  if (!converged) process.exitCode = 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
