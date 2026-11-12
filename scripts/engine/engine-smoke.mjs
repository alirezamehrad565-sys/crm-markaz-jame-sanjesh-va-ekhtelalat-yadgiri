// scripts/engine/engine-smoke.mjs — گیت فاز ۲: موتور محلی روی D1 موقت (docs/rust/phases.md فاز ۲)
//
//   node scripts/engine/engine-smoke.mjs
//
// ۱۹ بررسی: دایرکتوری موقت/مایگریشن/seed/بوت/سلامت/پوسته/دارایی/۴۰۱/ورود غلط/ورود سه نقش/
// me/kpis/بسته‌های بازی/۴۰۴ کم‌دست §۵/سرویس بازی‌ها/توکن مشترک دو ورکر/خاموشی تمیز/پاک‌سازی.
// هیچ پورت پیش‌فرض ثابتی اشغال نمی‌کند — دو پورت آزاد تصادفی می‌گیرد.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { REPO_ROOT, d1SqlitePath } from './engine-paths.mjs';

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ [${pass}] ${name}`);
  } else {
    fail++;
    console.error(`  ✗ [${pass + fail}] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** یک پورت آزاد از هستهٔ سیستم بگیر */
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
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // متن خام (مثل index.html)
  }
  return { status: res.status, json, text, contentType: res.headers.get('content-type') ?? '' };
}

/** قرارداد احراز اپ: توکن نشست در بدنهٔ پاسخ ورود برگردانده می‌شود (Bearer) */
async function login(port, base, username, password) {
  const res = await getJson(`${base}/api/auth/login`, { method: 'POST', body: { username, password } });
  const token = res.json?.data?.token ?? null;
  return { res, token };
}

const enginePort = await freePort();
const gamesPort = await freePort();
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'engine-smoke-'));
const dbPath = d1SqlitePath(dataDir);
const base = `http://127.0.0.1:${enginePort}`;
const gamesBase = `http://127.0.0.1:${gamesPort}`;

console.log(`[smoke] پورت‌ها: اپ=${enginePort} بازی‌ها=${gamesPort} | دادهٔ موقت: ${dataDir}`);

// — بخش ۱: آماده‌سازی —
check('دایرکتوری موقت داده ساخته شد', dataDir.startsWith(os.tmpdir()));

const engine = spawn(process.execPath, [path.join(REPO_ROOT, 'scripts/engine/engine.mjs'), '--port', String(enginePort), '--games-port', String(gamesPort), '--data-dir', dataDir, '--seed'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let engineLog = '';
engine.stdout.on('data', (d) => (engineLog += d));
engine.stderr.on('data', (d) => (engineLog += d));

let booted = false;
for (let i = 0; i < 120 && !booted; i++) {
  if (engine.exitCode !== null) break;
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) booted = true;
  } catch {
    await delay(500);
  }
}
check('مایگریشن‌ها + seed در بوت موتور اعمال شد', booted && engineLog.includes('مایگریشن') && engineLog.includes('seed نمایشی'), engineLog.slice(-300));
check('بوت موتور روی D1 موقت — /health پاسخ داد', booted);

try {
  if (booted) {
    // — بخش ۲: سلامت و پوسته —
    const health = await getJson(`${base}/health`);
    check('/health → 200 با ok:true و db:up', health.status === 200 && health.json?.ok === true && health.json?.db === 'up', JSON.stringify(health.json));
    const shell = await fetch(`${base}/`, { signal: AbortSignal.timeout(10_000) });
    check('پوسته: GET / → 200 text/html', shell.status === 200 && (shell.headers.get('content-type') ?? '').includes('text/html'));
    const sw = await fetch(`${base}/sw.js`, { signal: AbortSignal.timeout(10_000) });
    check('پوسته: دارایی /sw.js → 200', sw.status === 200);

    // — بخش ۳: گیت احراز —
    const anon = await getJson(`${base}/api/me`);
    check('۴۰۱ بدون توکن: /api/me', anon.status === 401);
    const badLogin = await login(enginePort, base, 'manager', 'wrong-password');
    check('ورود با رمز غلط → ۴۰۱', badLogin.res.status === 401);

    // — بخش ۴: ورود سه نقش —
    const manager = await login(enginePort, base, 'manager', '1234');
    check('ورود مدیر (seed) → ۲۰۰ + توکن نشست', manager.res.status === 200 && Boolean(manager.token));
    const secretary = await login(enginePort, base, 'secretary', '1234');
    check('ورود منشی (seed) → ۲۰۰', secretary.res.status === 200 && Boolean(secretary.token));
    const therapist = await login(enginePort, base, 'therapist', '1234');
    check('ورود درمانگر (seed) → ۲۰۰', therapist.res.status === 200 && Boolean(therapist.token));

    const me = await getJson(`${base}/api/me`, { token: manager.token });
    check('/api/me با Bearer → ۲۰۰ با نقش manager', me.status === 200 && JSON.stringify(me.json ?? {}).includes('manager'), me.text.slice(0, 120));

    const kpis = await getJson(`${base}/api/dashboard/kpis?from=2026-11-01&to=2026-11-12`, { token: manager.token });
    check('/api/dashboard/kpis → ۲۰۰', kpis.status === 200, kpis.text.slice(0, 120));

    // — بخش ۵: بازی‌ها و ۴۰۴ کم‌دست §۵ —
    const gamesAnon = await getJson(`${base}/api/games/packages`);
    check('بسته‌های بازی بدون احراز → ۴۰۱ (اپ اصلی)', gamesAnon.status === 401);
    const low = await getJson(`${base}/api/m/does-not-exist/next-item`);
    check('۴۰۴ کم‌دست §۵: پیوند بازی ناشناخته', low.status === 404, low.text.slice(0, 120));

    // — بخش ۶: سرویس بازی‌ها روی پورت جدا —
    const gamesHealth = await getJson(`${gamesBase}/health`);
    check('سرویس بازی‌ها: /health → ۲۰۰ با db:up', gamesHealth.status === 200 && gamesHealth.json?.db === 'up', JSON.stringify(gamesHealth.json));
    const gamesLogin = await login(gamesPort, gamesBase, 'manager', '1234');
    const gamesPkgs = gamesLogin.res.status === 200
      ? await getJson(`${gamesBase}/api/games/packages`, { token: gamesLogin.token })
      : { status: 0 };
    check('توکن مشترک دو ورکر: ورود روی سرویس بازی + بسته‌ها → ۲۰۰', gamesLogin.res.status === 200 && gamesPkgs.status === 200, `login=${gamesLogin.res.status} pkgs=${gamesPkgs.status} ${gamesPkgs.text?.slice(0, 120) ?? ''}`);
  } else {
    for (const name of ['/health', 'پوسته', 'sw.js', '۴۰۱', 'ورود غلط', 'ورود مدیر', 'ورود منشی', 'ورود درمانگر', '/api/me', 'kpis', 'بسته‌ها ۴۰۱', '۴۰۴ §۵', 'بازی‌ها health', 'توکن مشترک']) {
      check(name, false, 'موتور بوت نشد');
    }
  }

  // — بخش ۷: خاموشی تمیز —
  const exited = new Promise((resolve) => engine.once('exit', (code, signal) => resolve({ code, signal })));
  engine.kill('SIGTERM');
  const exit = await Promise.race([exited, delay(15_000).then(() => ({ code: null, signal: 'TIMEOUT' }))]);
  check('خاموشی تمیز: SIGTERM → خروج موفق engine و workerd', exit.code === 0, `code=${exit.code} signal=${exit.signal}`);
} finally {
  // — بخش ۸: پاک‌سازی —
  if (engine.exitCode === null) engine.kill('SIGKILL');
  await delay(300);
  rmSync(dataDir, { recursive: true, force: true });
  check('پاک‌سازی: دایرکتوری موقت حذف شد', !mkDirExists(dataDir));
}

function mkDirExists(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

console.log(`\n[smoke] نتیجه: ${pass} سبز، ${fail} سرخ ${fail === 0 ? '— گیت فاز ۲ سبز است' : '— ناکام'}`);
process.exit(fail === 0 ? 0 : 1);
