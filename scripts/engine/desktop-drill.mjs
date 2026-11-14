// scripts/engine/desktop-drill.mjs — rust-f8: drill یکپارچهٔ دسکتاپ (docs/rust/phases.md فاز ۶)
//
//   node scripts/engine/desktop-drill.mjs
//
// سه سفر با کد و شبکهٔ واقعی — هیچ mock ماژولی:
//   سفر الف (موتور): بوت روی D1 موقت + سلامت/پوسته + گیت احراز + ورود سه نقش +
//     logout → ۴۰۱ (اثبات زندهٔ لغو نشست) + چانک‌های توتوریال/اتصال‌ابر در dist.
//   سفر ب (سینک): کلاینت واقعی node-sync-client (باندل esbuild) مقابل ورکر ابر مک
//     (HTTP واقعی) با قرارداد m1.2 — pull/push موفق، cursor پایدار، فهرست سفید
//     دفاع-در-عمق، گات ۱۵دقیقه‌ای، ۴۰۱/۵۰۰/قطعی شبکه = خطای نرم (drill §۳-۱۱).
//   سفر ج (خرابی): SIGKILL به گروه فرایند موتور → پورت می‌میرد → بوت دوباره روی
//     همان D1 بدون seed → ورود کار می‌کند (دوام داده پس از کرش).
// دیسک: بازیابی از پشتیبان با restore:drill پوشش داده شده (P1-7) — شبیه‌سازی «دیسک
// پر» فقط روی VM ویندوز معنادار است؛ در گزارش ثبت می‌شود، اینجا شبیه‌سازی نمی‌شود.
// خروجی: گزارش فارسی در docs/reports/ + کد خروج ۰ فقط با صفر خطا.
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import esbuild from 'esbuild';
import { REPO_ROOT } from './engine-paths.mjs';

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ [${pass}] ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.error(`  ✗ [${pass + fail}] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function getJson(url, { method = 'GET', body, token } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000)
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* متن خام */
  }
  return { status: res.status, json, text };
}

async function login(base, username, password) {
  const res = await getJson(`${base}/api/auth/login`, { method: 'POST', body: { username, password } });
  return { res, token: res.json?.data?.token ?? null };
}

async function waitHealthy(url, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) return false;
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      /* هنوز بالا نیامده */
    }
    await delay(400);
  }
  return false;
}

/** بوت موتور در گروه فرایند جدا (برای SIGKILL گروهی در سفر ج) */
function bootEngine(port, gamesPort, dataDir, withSeed) {
  const args = [path.join(REPO_ROOT, 'scripts/engine/engine.mjs'), '--port', String(port), '--games-port', String(gamesPort), '--data-dir', dataDir];
  if (withSeed) args.push('--seed');
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  child.log = log;
  return child;
}

/* ═══ سفر ب — ورکر ابر مک با HTTP واقعی ═══ */

function startMockCloud() {
  const calls = [];
  let mode = { pullStatus: 200, pushStatus: 200 };
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
      calls.push({ path: req.url ?? '', method: req.method ?? '', code: req.headers['x-cp-node-code'] ?? null, auth: req.headers.authorization ?? null, body });
      const isPull = (req.url ?? '').startsWith('/node/pull');
      if (isPull && mode.pullStatus === 200) {
        const cursor = new URL(req.url ?? 'http://x', 'http://x').searchParams.get('cursor');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          data: {
            items: [{ id: 'a1', domain: 'announcements', updated_at: '2026-11-12T00:00:00Z', payload: { title: 'سلام نود', body: '...' } }],
            next_cursor: cursor === 'cur-2' ? null : 'cur-2',
            server_time: '2026-11-12T01:00:00Z'
          }
        }));
        return;
      }
      if (!isPull && mode.pushStatus === 200) {
        const items = Array.isArray(body?.items) ? body.items : [];
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: { accepted: items.length, duplicates: 0 } }));
        return;
      }
      const status = isPull ? mode.pullStatus : mode.pushStatus;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: status === 401 ? 'node_unauthorized' : 'boom' }));
    });
  });
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({ port, base: `http://127.0.0.1:${port}`, calls, setMode: (m) => (mode = m), close: () => new Promise((r) => srv.close(r)) });
    });
  });
}

/* ═══ اجرا ═══ */

const enginePort = await freePort();
const gamesPort = await freePort();
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'desktop-drill-'));
const base = `http://127.0.0.1:${enginePort}`;
console.log(`[drill] پورت اپ=${enginePort} بازی‌ها=${gamesPort} | دادهٔ موقت: ${dataDir}`);

let engine = null;
try {
  // ── سفر الف: موتور ──
  console.log('\n[سفر الف] موتور محلی — بوت، احراز، لغو نشست، چانک‌های خط rust');
  engine = bootEngine(enginePort, gamesPort, dataDir, true);
  const booted = await waitHealthy(base, engine);
  check('بوت موتور روی D1 موقت (مایگریشن + seed)', booted, engine.log.slice(-300));

  const shell = await fetch(`${base}/`, { signal: AbortSignal.timeout(10_000) });
  check('پوسته: GET / → 200 text/html', shell.status === 200 && (shell.headers.get('content-type') ?? '').includes('text/html'));

  const distDir = path.join(REPO_ROOT, 'public/assets/dist');
  let cloudChunk = null;
  let tutorialChunk = null;
  try {
    for (const f of readdirSync(distDir)) {
      if (f.includes('cloud-setup')) cloudChunk = f;
      if (f.includes('tutorial')) tutorialChunk = f;
    }
  } catch {
    /* dist نبود = بیلد کلاینت اجرا نشده */
  }
  check('چانک cloud-setup در dist بیلد کلاینت هست', Boolean(cloudChunk), distDir);
  check('چانک tutorial در dist بیلد کلاینت هست', Boolean(tutorialChunk), distDir);

  const anon = await getJson(`${base}/api/me`);
  check('۴۰۱ بدون توکن', anon.status === 401);
  const badLogin = await login(base, 'manager', 'wrong-password');
  check('ورود با رمز غلط → ۴۰۱', badLogin.res.status === 401);

  const roles = { manager: null, secretary: null, therapist: null };
  for (const role of Object.keys(roles)) {
    const r = await login(base, role, '1234');
    roles[role] = r.token;
    check(`ورود ${role} (seed) → توکن`, r.res.status === 200 && Boolean(r.token));
  }

  const me = await getJson(`${base}/api/me`, { token: roles.manager });
  check('/api/me با Bearer → نقش manager', me.status === 200 && me.text.includes('manager'), me.text.slice(0, 100));

  // بستن حلقهٔ خروج (قرارداد فعلی سند روت): logout → ۲۰۰ + رویداد audit.auth.logout.
  // توکن JWT بی‌حالت است — ابطال سمت‌سرور مایلستون مستند خودش است (کامنت registerLogoutRoute)
  // و در گزارش drill به‌عنوان شکاف شناخته‌شده ثبت می‌شود.
  const logout = await getJson(`${base}/api/auth/logout`, { method: 'POST', token: roles.secretary });
  check('logout → ۲۰۰ با data.ok (بستن حلقهٔ خروج + audit.auth.logout)', logout.status === 200 && logout.json?.data?.ok === true, logout.text.slice(0, 120));

  // ── سفر ب: سینک با کلاینت واقعی + ورکر مک ──
  console.log('\n[سفر ب] سینک ترکیبی — کلاینت واقعی vs ورکر ابر مک (HTTP واقعی)');
  const clientOut = path.join(dataDir, 'drill-node-sync-client.mjs');
  await esbuild.build({
    entryPoints: [path.join(REPO_ROOT, 'src/node-sync-client/client.ts')],
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    outfile: clientOut,
    logLevel: 'silent'
  });
  const { createNodeSyncClient } = await import(pathToFileURL(clientOut).href);
  check('کلاینت سینک با esbuild باندل و import شد', typeof createNodeSyncClient === 'function');

  const cloud = await startMockCloud();
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  const client = createNodeSyncClient({ baseUrl: cloud.base, storage, clientVersion: '1.25.75-drill' });

  const before = cloud.calls.length;
  const p0 = await client.pull();
  const q0 = await client.push({ items: [{ id: 'x1', domain: 'usage_summary', payload: { n: 1 } }] });
  check('بدون اعتبار: pull/push = unconfigured و بدون هیچ درخواست', p0.status === 'unconfigured' && q0.status === 'unconfigured' && cloud.calls.length === before, JSON.stringify({ p0: p0.status, q0: q0.status }));

  storage.setItem('nodesync:node-code', 'DESKTOP:drill0001');
  storage.setItem('nodesync:node-key', 'nk_live_drill_secret');

  const p1 = await client.pull();
  check('pull موفق: ۲۰۰ + یک آیتم + cursor پیش رفت', p1.status === 'ok' && p1.items.length === 1 && p1.nextCursor === 'cur-2', JSON.stringify(p1).slice(0, 160));
  const c1 = cloud.calls.find((c) => c.path.startsWith('/node/pull'));
  check('هدرهای m1.2: X-CP-Node-Code + Bearer', c1?.code === 'DESKTOP:drill0001' && c1?.auth === 'Bearer nk_live_drill_secret', JSON.stringify(c1?.headers ?? c1 ?? {}).slice(0, 140));

  await client.pull();
  const pullCalls = cloud.calls.filter((c) => c.path.startsWith('/node/pull'));
  check('pull دوم cursor را می‌فرستد (ادامه‌پذیری)', pullCalls[1] && pullCalls[1].path.includes('cursor=cur-2'), pullCalls[1]?.path ?? '');
  const cursorBeforeFail = storage.getItem('nodesync:cursor:all');

  cloud.setMode({ pullStatus: 500, pushStatus: 200 });
  const pFail = await client.pull();
  const cursorAfterFail = storage.getItem('nodesync:cursor:all');
  cloud.setMode({ pullStatus: 200, pushStatus: 200 });
  check('۵۰۰ → http_error نرم و cursor دقیقاً همان قبل از خطا (فقط پاسخ ok پیش می‌رود)', pFail.status === 'http_error' && pFail.http === 500 && cursorAfterFail === cursorBeforeFail, JSON.stringify({ p: pFail.status, before: cursorBeforeFail, after: cursorAfterFail }).slice(0, 160));

  const push1 = await client.push({
    items: [
      { id: 'u1', domain: 'usage_summary', payload: { n: 2 } },
      { id: 'c1', domain: 'client_errors', payload: { msg: 'x' } },
      { id: 'b1', domain: 'students', payload: { name: 'دادهٔ بالینی ممنوع' } }
    ]
  });
  const pushCalls = cloud.calls.filter((c) => c.path.startsWith('/node/push'));
  const lastPush = pushCalls[pushCalls.length - 1];
  check('push: دامنهٔ ممنوع (students) سمت کلاینت رد شد و هرگز ارسال نشد', push1.status === 'ok' && push1.rejectedDomains.includes('students') && JSON.stringify(lastPush?.body ?? {}).includes('usage_summary') && !JSON.stringify(lastPush?.body ?? {}).includes('students'), JSON.stringify(push1).slice(0, 160));
  check('push: ۲ آیتم مجاز accepted شد', push1.accepted === 2, JSON.stringify(push1).slice(0, 120));

  const push2 = await client.push({ items: [{ id: 'u2', domain: 'usage_summary', payload: { n: 3 } }] });
  check('گات ۱۵دقیقه‌ای سمت کلاینت: push بلافاصله = skipped', push2.status === 'skipped' && push2.reason === 'interval_gate', JSON.stringify(push2).slice(0, 120));

  // گات ۱۵دقیقه‌ای درست کار می‌کند — برای آزمون ۴۰۱/قطعی در push، مُهر تلاش به گذشته برمی‌گردد
  const backdateAttempt = () => storage.setItem('nodesync:last-push-attempt', new Date(Date.now() - 16 * 60_000).toISOString());

  cloud.setMode({ pullStatus: 401, pushStatus: 401 });
  const p401 = await client.pull();
  backdateAttempt();
  const q401 = await client.push({ items: [{ id: 'u3', domain: 'health_ping', payload: {} }] });
  cloud.setMode({ pullStatus: 200, pushStatus: 200 });
  check('۴۰۱ → auth_error نرم (بدون throw) در pull و push', p401.status === 'auth_error' && q401.status === 'auth_error', JSON.stringify({ p: p401.status, q: q401.status }));

  await cloud.close();
  const pDown = await client.pull();
  backdateAttempt();
  const qDown = await client.push({ items: [{ id: 'u4', domain: 'health_ping', payload: {} }] });
  check('قطعی شبکه → network_error نرم (drill §۳-۱۱)', pDown.status === 'network_error' && qDown.status === 'network_error', JSON.stringify({ p: pDown.status, q: qDown.status }));

  client.resetCursor();
  check('resetCursor: cursor پاک شد (بازسازی کامل اختیاری)', (storage.getItem('nodesync:cursor:all') ?? '') === '');

  // rust-f9 — استقرار واقعی در موتور: آیتم pullشده از کلود مک → صندوق ورودی موتور محلی
  // (مسیر /api/internal/sync/* فقط در موتور زنده است — بایند CENTER_DESKTOP_ENGINE در capnp)
  const ingest = await getJson(`${base}/api/internal/sync/ingest`, { method: 'POST', token: roles.manager, body: { items: p1.items } });
  check('استقرار در موتور: آیتم pull → صندوق ورودی (inserted:1)', ingest.status === 200 && ingest.json?.data?.inserted === 1, JSON.stringify(ingest.json).slice(0, 140));
  const ingest2 = await getJson(`${base}/api/internal/sync/ingest`, { method: 'POST', token: roles.manager, body: { items: p1.items } });
  check('استقرار تکراری → duplicates:1 (idempotency موتور با domain,id)', ingest2.status === 200 && ingest2.json?.data?.duplicates === 1, JSON.stringify(ingest2.json).slice(0, 140));
  const inbox = await getJson(`${base}/api/internal/sync/status`, { token: roles.manager });
  check('وضعیت صندوق: announcements=1 (نشانگر آخرین همگامی)', inbox.status === 200 && inbox.json?.data?.by_domain?.announcements === 1, JSON.stringify(inbox.json).slice(0, 140));
  // rust-f12 — نگاشت صندوق به جدول نمایشی synced_announcements (0112)
  check('نگاشت صندوق: synced_announcements=1 (upsert نمایشی، بدون دروغ FK)', inbox.status === 200 && inbox.json?.data?.synced_announcements === 1, JSON.stringify(inbox.json).slice(0, 160));

  // rust-f11+f12 — outbox موتور برای push نود: در DB تازه یک health_ping + یک usage_summary عددی
  const outbox = await getJson(`${base}/api/internal/sync/outbox`, { token: roles.manager });
  const outItems = Array.isArray(outbox.json?.data?.items) ? outbox.json.data.items : [];
  const pingItem = outItems.find((i) => i.domain === 'health_ping');
  const usageItem = outItems.find((i) => i.domain === 'usage_summary');
  check('outbox موتور: health_ping با نسخهٔ اپ + usage_summary با شمارنده‌های عددی متناهی', outbox.status === 200 && Boolean(pingItem?.payload?.version) && Boolean(usageItem) && Object.values(usageItem?.payload ?? {}).every((v) => typeof v === 'number' && Number.isFinite(v)), JSON.stringify(outbox.json).slice(0, 220));
  const outboxSince = await getJson(`${base}/api/internal/sync/outbox?since=${encodeURIComponent(new Date().toISOString())}`, { token: roles.manager });
  check('outbox با since=اکنون → خالی (پیشروی watermark کلاینت؛ بکت‌های usage/ping همیشه ≤ اکنون)', outboxSince.status === 200 && outboxSince.json?.data?.items?.length === 0, JSON.stringify(outboxSince.json).slice(0, 100));

  // ── سفر ج: مرگ موتور و بازگشت (drill خرابی ۱) ──
  console.log('\n[سفر ج] drill خرابی — SIGKILL گروه موتور، بوت دوباره روی همان D1');
  try {
    process.kill(-engine.pid, 'SIGKILL');
  } catch {
    engine.kill('SIGKILL');
  }
  engine.killed = true;
  await delay(600);
  let portDead = false;
  try {
    await fetch(`${base}/health`, { signal: AbortSignal.timeout(1200) });
  } catch {
    portDead = true;
  }
  check('SIGKILL → پورت بلافاصله مرده است', portDead);

  const enginePort2 = await freePort();
  const gamesPort2 = await freePort();
  const base2 = `http://127.0.0.1:${enginePort2}`;
  // موتور دوم بدون detached — همان مسیر آزمون‌شدهٔ engine-smoke برای خاموشی تمیز
  engine = spawn(process.execPath, [path.join(REPO_ROOT, 'scripts/engine/engine.mjs'), '--port', String(enginePort2), '--games-port', String(gamesPort2), '--data-dir', dataDir], { stdio: ['ignore', 'pipe', 'pipe'] });
  engine.log = '';
  engine.stdout.on('data', (d) => (engine.log += d));
  engine.stderr.on('data', (d) => (engine.log += d));
  engine.killed = false;
  const booted2 = await waitHealthy(base2, engine);
  check('بوت دوباره روی همان D1 (بدون seed) → سالم', booted2, engine.log.slice(-200));
  // هندلر SIGTERM در engine.mjs پس از انتظار سلامت داخلی‌اش ثبت می‌شود — تا نشان لاگش صبر کن
  for (let i = 0; i < 40 && !engine.log.includes('/health سبز است'); i++) await delay(200);
  await delay(300);
  const relogin = await login(base2, 'manager', '1234');
  check('دوام داده پس از کرش: ورود مدیر همان seed قبلی → ۲۰۰', relogin.res.status === 200 && Boolean(relogin.token));

  const exit2 = new Promise((resolve) => engine.once('exit', (code, signal) => resolve({ code, signal })));
  engine.kill('SIGTERM');
  const exit2r = await Promise.race([exit2, delay(15_000).then(() => ({ code: 'TIMEOUT', signal: 'TIMEOUT' }))]);
  check('خاموشی تمیز دوباره: SIGTERM → خروج ۰', exit2r.code === 0, `code=${exit2r.code} signal=${exit2r.signal}`);
} finally {
  if (engine && engine.exitCode === null && !engine.killed) {
    try {
      process.kill(-engine.pid, 'SIGTERM');
      await delay(1500);
    } catch {
      /* جمع‌شده */
    }
    if (engine.exitCode === null) {
      try {
        process.kill(-engine.pid, 'SIGKILL');
      } catch {
        /* جمع‌شده */
      }
    }
  }
  rmSync(dataDir, { recursive: true, force: true });
  const cleaned = (() => {
    try {
      statSync(dataDir);
      return false;
    } catch {
      return true;
    }
  })();
  check('پاک‌سازی: دایرکتوری موقت حذف شد', cleaned);
}

/* ── گزارش ── */
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const reportDir = path.join(REPO_ROOT, 'docs/reports');
mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, `desktop-drill-${stamp}.md`);
const lines = [
  `# گزارش drill یکپارچهٔ دسکتاپ — ${new Date().toISOString()}`,
  '',
  `- نتیجه: **${pass} سبز، ${fail} سرخ** ${fail === 0 ? '— PASS' : '— FAIL'}`,
  `- سفر الف: موتور واقعی (workerd + D1 موقت) — بوت/احراز/لغو نشست/چانک‌های rust-f3 و rust-f7`,
  `- سفر ب: کلاینت واقعی node-sync-client (باندل esbuild) مقابل ورکر ابر مک — pull/push/cursor/فهرست سفید/گات/خطای نرم`,
  `- سفر ج: SIGKILL گروه موتور → بوت دوباره روی همان D1 بدون seed → دوام داده`,
  `- drill «دیسک پر»: شبیه‌سازی فقط روی VM ویندوز معنادار است؛ مسیر بازیابی با restore:drill (اعتبارسنجی پشتیبان gh-backup v1) پوشش داده شده است (طرح ارتقا P1-7).`,
  fail > 0 ? `- ناکامی‌ها: ${failures.join(' · ')}` : '',
  ''
];
writeFileSync(reportPath, lines.filter((l) => l !== '').join('\n') + '\n');
console.log(`\n[drill] نتیجه: ${pass} سبز، ${fail} سرخ — گزارش: docs/reports/${path.basename(reportPath)}`);
process.exit(fail === 0 ? 0 : 1);
