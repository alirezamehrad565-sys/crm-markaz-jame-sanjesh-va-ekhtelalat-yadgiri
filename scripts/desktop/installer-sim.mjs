#!/usr/bin/env node
// scripts/desktop/installer-sim.mjs — شبیه‌ساز بوت نصاب با تیپل واقعی lib.rs (v1.27.۰۵ — گیت قرارداد)
//
//   node scripts/desktop/installer-sim.mjs
//
// کلاس خطای نسخهٔ بستهٔ ۱.۲۷.۰۴: تیپل شاخهٔ نصاب lib.rs دنبال resources/engine/central/worker.js
// بود در حالی که مونتاژ باندل‌ها را در bundles/ می‌گذارد — و همهٔ آزمون‌های dev سبز بودند چون
// مسیرها را دستی می‌دادند. این شبیه‌ساز مسیرها را **از خود lib.rs استخراج** می‌کند (عین رشته‌های
// engine_res.join(...))، هم‌مدیدی بایتِ باندل‌های مونت‌شده با خروجی esbuild را وارسی می‌کند و
// موتور را عین قرارداد spawn_engine (main نسبی + cwd صریح + engine-config.json + stderr→engine.log)
// بوت می‌کند. هر تغییر مسیر در lib.rs یا مونتاژ که هم‌گام نشود، همین‌جا قرمز می‌شود.
// نکته: نودِ شبیه‌سازی process.execPath است — هویت سایدکار جداگانه با هش manifest پوشش داده می‌شود.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ENGINE_RES = path.join(ROOT, 'desktop', 'src-tauri', 'resources', 'engine');
const CONFIG_TIMEOUT_MS = 30_000;

const checks = [];
let failed = false;
const ok = (m) => checks.push(`✓ ${m}`);
const bad = (m) => { failed = true; checks.push(`✗ ${m}`); };
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

// ① استخراج تیپل نصاب از خود lib.rs — گیت مسیرها را hardcode نمی‌کند؛ حقیقت از سورس می‌آید
const libSrc = readFileSync(path.join(ROOT, 'desktop', 'src-tauri', 'src', 'lib.rs'), 'utf8');
const joins = [...libSrc.matchAll(/engine_res\.join\("([^"]+)"\)/g)].map((m) => m[1]);
const [serverRel, mainRel, gamesRel, publicRel] = joins;
if (!serverRel || !mainRel || !gamesRel || !publicRel) {
  bad(`تیپل نصاب lib.rs استخراج نشد — engine_res.join ها: ${JSON.stringify(joins)}`);
} else {
  ok(`تیپل نصاب lib.rs استخراج شد: ${serverRel} | ${mainRel} | ${gamesRel} | ${publicRel}`);
  mainRel.startsWith('bundles/')
    ? ok('باندل اصلی در شاخهٔ نصاب زیر bundles/ است')
    : bad(`باندل اصلی نصاب خارج از bundles/ است (${mainRel}) — عین رگرسیون ۱.۲۷.۰۴`);
  gamesRel.startsWith('bundles/')
    ? ok('باندل بازی‌ها در شاخهٔ نصاب زیر bundles/ است')
    : bad(`باندل بازی‌ها نصاب خارج از bundles/ است (${gamesRel})`);
}

// ② مونتاژ رانتایم — اگر resources خالی است، همان مونتاژ رسمی اجرا می‌شود (خروجی CI گام مونتاژ دارد)
if (!existsSync(path.join(ENGINE_RES, 'engine-server.js'))) {
  const target = process.platform === 'win32' ? 'x86_64-pc-windows-msvc' : 'x86_64-unknown-linux-gnu';
  checks.push(`… resources/engine خالی است — مونتاژ رسمی اجرا می‌شود (--target ${target})`);
  try {
    execFileSync(process.execPath, [path.join(HERE, 'build-installer-runtime.mjs'), '--target', target], { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    bad(`مونتاژ رانتایم شکست خورد: ${e.message}`);
  }
}

// ③ هم‌مدیدی بایت فایل‌های مونت‌شده با خروجی esbuild — قرارداد «مونتاژ از باندل تازه» در هر دو سمت
const pairs = [
  [path.join(ROOT, 'worker', 'bundle.js'), path.join(ENGINE_RES, mainRel ?? 'bundles/worker.js'), 'باندل اصلی'],
  [path.join(ROOT, 'worker', 'games-bundle.js'), path.join(ENGINE_RES, gamesRel ?? 'bundles/games.js'), 'باندل بازی‌ها'],
];
for (const [src, dst, label] of pairs) {
  try {
    if (!existsSync(src)) { bad(`${label}: خروجی esbuild در مخزن نیست (${src}) — بیلد باندل را اجرا کنید`); continue; }
    if (!existsSync(dst)) { bad(`${label}: در resources مونت نشده (${dst}) — تیپل lib.rs با مونتاژ ناهم‌گام است`); continue; }
    sha256(src) === sha256(dst) && statSync(dst).size > 0
      ? ok(`${label}: نسخهٔ مونت‌شده عین باندل تازه است (${statSync(dst).size}B)`)
      : bad(`${label}: هش نسخهٔ مونت‌شده با باندل تازه فرق دارد — مونتاژ کهنه است؛ mount را دوباره اجرا کنید`);
  } catch (e) {
    bad(`${label}: وارسی هش شکست خورد — ${e.message}`);
  }
}
existsSync(path.join(ENGINE_RES, 'engine-server.js'))
  ? ok('engine-server.js در resources/engine هست')
  : bad('engine-server.js در resources/engine نیست');
existsSync(path.join(ENGINE_RES, publicRel ?? 'public', 'index.html'))
  ? ok('public/index.html در resources هست')
  : bad('public/index.html در resources نیست');

// ④ بوت با همان قرارداد spawn_engine — اگر تیپل/فایل‌ها خراب بودند اصلاً بوت نکنیم (خطای نام‌وبنام بالا آمده)
if (!failed) {
  const dataDir = path.join(os.tmpdir(), `installer-sim-data-${process.pid}`);
  rmSync(dataDir, { recursive: true, force: true });
  const logPath = path.join(dataDir, 'engine.log');
  const args = [
    'engine-server.js', // main نسبی — عین spawn_engine (ضد-EISDIR)
    '--engine', 'adapter',
    '--data-dir', dataDir,
    '--port', '8787',
    '--games-port', '8788', // اگر اشغال بود موتور پورت آزاد می‌گیرد و نهایی را در کانفیگ می‌نویسد
    '--main-bundle', path.join(ENGINE_RES, mainRel),
    '--games-bundle', path.join(ENGINE_RES, gamesRel),
    '--public-dir', path.join(ENGINE_RES, publicRel),
  ];
  let child = null;
  try {
    mkdirSync(dataDir, { recursive: true }); // عین create_dir_all بوت در lib.rs — قبل از باز شدن engine.log
    // بوت نخست lib.rs: اگر dataDir\d1 نیست، d1-seed مایگریت‌شده کپی می‌شود — بدون آن shim D1
    // دیتابیس ندارد و adapter بوت نمی‌کند (نکتهٔ دیباگ شبیه‌ساز)
    const seedDir = path.join(ENGINE_RES, 'd1-seed');
    if (!existsSync(path.join(dataDir, 'd1')) && existsSync(seedDir)) {
      cpSync(seedDir, path.join(dataDir, 'd1'), { recursive: true });
    }
    const logFd = openSync(logPath, 'a'); // stderr → engine.log — عین spawn_engine
    child = spawn(process.execPath, args, { cwd: ENGINE_RES, stdio: ['ignore', 'ignore', logFd] });
    const configPath = path.join(dataDir, 'engine-config.json');
    const deadline = Date.now() + CONFIG_TIMEOUT_MS;
    let cfg = null;
    while (Date.now() < deadline && !cfg) {
      await new Promise((r) => setTimeout(r, 250));
      try { cfg = JSON.parse(readFileSync(configPath, 'utf8')); } catch { /* هنوز نیامده */ }
    }
    if (cfg && cfg.port && cfg.gamesPort) {
      ok(`engine-config.json آمد — پورت‌های نهایی: ${cfg.port}/${cfg.gamesPort}`);
      const health = async (port, label) => {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/health`);
          res.ok ? ok(`/health ورکر ${label} پاسخ 200 داد`) : bad(`/health ورکر ${label} status=${res.status}`);
        } catch (e) {
          bad(`/health ورکر ${label} در دسترس نیست — ${e.message}`);
        }
      };
      await health(cfg.port, 'اصلی');
      await health(cfg.gamesPort, 'بازی‌ها'); // پروب مستقل — پیش‌نیاز FSM و DEGRADED فاز بعد
      try {
        const res = await fetch(`http://127.0.0.1:${cfg.port}/`);
        const text = await res.text();
        res.ok && text.length > 500
          ? ok('پوستهٔ استاتیک از public سرو شد')
          : bad(`سرو استاتیک ناموفق — status=${res.status} len=${text.length}`);
      } catch (e) {
        bad(`سرو استاتیک شکست خورد — ${e.message}`);
      }
    } else {
      bad(`engine-config.json در مهلت ${CONFIG_TIMEOUT_MS / 1000} ثانیه نیامد — بوت شبیه‌ساز شکست`);
      try {
        checks.push('… دم engine.log:\n' + readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(-12).join('\n'));
      } catch { /* لاگ هم نیست */ }
    }
  } catch (e) {
    bad(`بوت شبیه‌ساز خطا داد — ${e.message}`);
  } finally {
    if (child) { try { child.kill('SIGTERM'); } catch { /* کودک از قبل مرده */ } }
    await new Promise((r) => setTimeout(r, 400));
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ویندوز گاهی قفل می‌کند — بی‌ضرر */ }
  }
}

console.log(checks.join('\n'));
console.log(
  failed
    ? '❌ شبیه‌ساز نصاب قرمز است — قرارداد مسیر lib.rs ↔ مونتاژ شکسته است'
    : '✅ شبیه‌ساز نصاب سبز است — بوت با تیپل واقعی lib.rs موفق بود (engine-config.json + سلامت هر دو ورکر + سرو استاتیک)',
);
process.exit(failed ? 1 : 0);
