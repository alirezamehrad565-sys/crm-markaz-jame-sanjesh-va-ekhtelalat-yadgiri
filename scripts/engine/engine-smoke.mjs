// scripts/engine/engine-smoke.mjs — گیت فاز ۲: موتور محلی روی D1 موقت (docs/rust/phases.md فاز ۲)
//
//   node scripts/engine/engine-smoke.mjs
//
// ۱۹ بررسی: دایرکتوری موقت/مایگریشن/seed/بوت/سلامت/پوسته/دارایی/۴۰۱/ورود غلط/ورود سه نقش/
// me/kpis/بسته‌های بازی/۴۰۴ کم‌دست §۵/سرویس بازی‌ها/توکن مشترک دو ورکر/خاموشی تمیز/پاک‌سازی.
// هیچ پورت پیش‌فرض ثابتی اشغال نمی‌کند — دو پورت آزاد تصادفی می‌گیرد.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
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

// v1.27.۰۳ — دو حالت گیت: workerd (پیش‌فرض توسعه) و adapter (موتور درون‌پروسه‌ای دسکتاپ —
// همان چیزی که نصاب اجرا می‌کند). هر دو باید ۲۷/۲۷ سبز شوند.
const adapterMode = process.env.SMOKE_ENGINE === 'adapter';
console.log(`[smoke] حالت موتور: ${adapterMode ? 'adapter (درون‌پروسه‌ای — بدون workerd)' : 'workerd (توسعه)'}`);
console.log(`[smoke] پورت‌ها: اپ=${enginePort} بازی‌ها=${gamesPort} | دادهٔ موقت: ${dataDir}`);

// — بخش ۱: آماده‌سازی —
check('دایرکتوری موقت داده ساخته شد', dataDir.startsWith(os.tmpdir()));

const engineArgs = [path.join(REPO_ROOT, 'scripts/engine/engine.mjs'), '--port', String(enginePort), '--games-port', String(gamesPort), '--data-dir', dataDir, '--seed'];
if (adapterMode) {
  engineArgs.push(
    '--engine', 'adapter',
    '--main-bundle', path.join(REPO_ROOT, 'worker/bundle.js'),
    '--games-bundle', path.join(REPO_ROOT, 'worker/games-bundle.js'),
    '--public-dir', path.join(REPO_ROOT, 'public'),
  );
}
const engine = spawn(process.execPath, engineArgs, {
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
    check('/health → 200 با قرارداد رصد بیرونی {ok, version, server_ts}', health.status === 200 && health.json?.ok === true && typeof health.json?.version === 'string' && typeof health.json?.server_ts === 'string', JSON.stringify(health.json));
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

    // — بخش ۶ب: نجات و پایش (۱.۲۶.۴ — ENG-4 + ۴-۲ + ۴-۳) —
    const gamesHealth2 = await getJson(`${gamesBase}/health`);
    check('سلامت بازی‌ها: worker:"games" + server_ts (قرارداد ENG-4)', gamesHealth2.status === 200 && gamesHealth2.json?.worker === 'games' && typeof gamesHealth2.json?.server_ts === 'string' && typeof gamesHealth2.json?.boot_ts === 'string', JSON.stringify(gamesHealth2.json));
    const panel = await getJson(`${base}/api/health/panel`, { token: manager.token });
    check('پنل سلامت: ردیف تازهٔ games با پورت واقعی (فقط-افزودنی)', panel.status === 200 && panel.json?.data?.games?.ok === true && panel.json?.data?.games?.port === gamesPort, JSON.stringify(panel.json?.data?.games));
    const download = await fetch(`${base}/api/backup/download`, { headers: { Authorization: `Bearer ${manager.token}` }, signal: AbortSignal.timeout(30_000) });
    const dlDisp = download.headers.get('content-disposition') ?? '';
    check('دریافت پشتیبان فوری: octet-stream + نام backup-<UTCts>.db', download.status === 200 && (download.headers.get('content-type') ?? '').includes('application/octet-stream') && /^attachment; filename="backup-\d{14}\.db"$/.test(dlDisp), `${download.status} ${dlDisp}`);
    const pkgRes = await fetch(`${base}/api/support/error-package`, { headers: { Authorization: `Bearer ${manager.token}` }, signal: AbortSignal.timeout(30_000) });
    const pkgBytes = pkgRes.status === 200 ? Buffer.from(await pkgRes.arrayBuffer()) : Buffer.alloc(0);
    const pkgOk = pkgRes.status === 200 && pkgBytes[0] === 0x50 && pkgBytes[1] === 0x4b && pkgBytes[2] === 0x03 && pkgBytes[3] === 0x04 && /^attachment; filename="error-package-\d{8}-\d{6}\.zip"$/.test(pkgRes.headers.get('content-disposition') ?? '');
    // یافتن EOCD در انتهای بسته (توضیح بعد از EOCD نداریم)
    const eocdIdx = pkgBytes.length >= 22 ? pkgBytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) : -1;
    check('گزارش خطا: zip معتبر (PK\x05\x06) با نام قراردادی', pkgOk && eocdIdx > 0 && pkgBytes[eocdIdx + 10] === 5, `${pkgRes.status} len=${pkgBytes.length}`);
    const restart1 = await getJson(`${base}/api/system/restart`, { method: 'POST', token: manager.token });
    check('ری‌استارت از پنل: {ok:true, scheduled:true}', restart1.status === 200 && restart1.json?.ok === true && restart1.json?.scheduled === true, JSON.stringify(restart1.json));
    const restart2 = await getJson(`${base}/api/system/restart`, { method: 'POST', token: manager.token });
    check('ری‌استارت دوباره حین نوبت: already:true', restart2.status === 200 && restart2.json?.already === true, JSON.stringify(restart2.json));
    // ناظر engine.mjs مُهر را می‌بیند، workerd را تمیز ری‌استارت می‌کند و مُهر را می‌بلعد
    let restarted = false;
    for (let i = 0; i < 40 && !restarted; i += 1) {
      await delay(1000);
      try {
        const st = await getJson(`${base}/api/system/restart-status`);
        if (st.status === 200 && st.json?.scheduled === false && st.json?.ok === true) restarted = true;
      } catch { /* حین ری‌استارت موتور پایین است */ }
    }
    check('ناظر: ری‌استارت تمیز کامل شد و مُهر مصرف شد (restart-status سبز)', restarted);
    const eventsLog = path.join(dataDir, 'events-fa.log');
    let eventsOk = false;
    try { eventsOk = readFileSync(eventsLog, 'utf8').includes('راه‌اندازی دوبارهٔ سامانه از پنل'); } catch { eventsOk = false; }
    check('لاگ رویدادهای انسانی: events-fa.log با رویداد ری‌استارت پنل', eventsOk, eventsLog);
  } else {
    for (const name of ['/health', 'پوسته', 'sw.js', '۴۰۱', 'ورود غلط', 'ورود مدیر', 'ورود منشی', 'ورود درمانگر', '/api/me', 'kpis', 'بسته‌ها ۴۰۱', '۴۰۴ §۵', 'بازی‌ها health', 'توکن مشترک', 'سلامت بازی‌ها ENG-4', 'پنل games', 'دریافت پشتیبان', 'گزارش خطا zip', 'ری‌استارت پنل', 'already', 'ناظر ری‌استارت', 'رویدادهای انسانی']) {
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
  if (process.env.SMOKE_KEEP) {
    check('پاک‌سازی: با SMOKE_KEEP نگه داشته شد (دیباگ)', true);
  } else {
    rmSync(dataDir, { recursive: true, force: true });
    check('پاک‌سازی: دایرکتوری موقت حذف شد', !mkDirExists(dataDir));
  }
}

function mkDirExists(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

console.log(`\n[smoke] نتیجه (${adapterMode ? 'adapter' : 'workerd'}): ${pass} سبز، ${fail} سرخ ${fail === 0 ? '— گیت فاز ۲ سبز است' : '— ناکام'}`);
process.exit(fail === 0 ? 0 : 1);
