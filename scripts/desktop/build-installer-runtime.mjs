// scripts/desktop/build-installer-runtime.mjs — مونتاژ رانتایم نصاب میز (rust-f13 — گیت فاز ۲ ردیف ۹)
//
//   node scripts/desktop/build-installer-runtime.mjs --target x86_64-pc-windows-msvc [--check]
//
// v1.27.۰۳ — تعویض موتور دسکتاپ: workerd از مسیر نصاب حذف شد (issueهای باز upstream
// workerd#4668/#7581 — کرش init ویندوزی؛ گزارش نصاب واقعی کارفرما: حتی با redist تازه‌تر
// از نسخهٔ بسته، همین کرش تکرار شد). موتور تازه: سایدکار node + engine-server.js
// (باندل engine.mjs با حالت adapter درون‌پروسه‌ای) + باندل‌های همان ورکرها به‌صورت فایل.
// کارها (بدون هیچ عملیات Cloudflare؛ دانلود فقط از nodejs.org رسمی):
//   ① دانلود سایدکار node نسخهٔ pinned (zip ویندوز / tar لینوکس) → binaries/node-<target>
//   ② کپی public/ (خروجی build:client) → resources/engine/public — سرویس استاتیک adapter
//   ③ d1-seed: دیتابیس مایگریت‌شده (+ seed نمایشی) در چیدمان قطعی miniflare — بوت نخست lib.rs
//     کپی می‌کند؛ shim D1 (node:sqlite) همین فایل را باز می‌کند — دادهٔ کارفرما سازگار می‌ماند
//   ④ کپی engine-server.js + باندل‌های ورکر (worker/games-bundle.js) → resources/engine
//   ⑤ دارایی‌های «ساخت سرور مرکزی» (central-worker.js + schema.sql) — بدون تغییر v1.26.0
//   ⑥ ثبت هش‌ها در engine-runtime-manifest.json (معیار «ثبت هش» گیت ردیف ۹) — v1.27.۰۵: این
//     فایل داخل resources/engine می‌نشیند تا glob resources نصاب آن را شحنه کند و پوستهٔ Rust
//     (engine.rs — PRECHECK) در بوت، هش سه فایل رانتایم و نسخهٔ سایدکار node را تطبیق دهد
// با --check: همهٔ خروجی‌ها و هش‌های manifest دوباره وارسی می‌شوند (بدون دانلود).
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { installerPaths, MANIFEST_NAME } from './config.mjs';
import { applyMigrations } from '../engine/apply-migrations.mjs';
import { seedDemo } from '../engine/seed-demo.mjs';
import { d1SqlitePath } from '../engine/engine-paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const P = installerPaths(ROOT);

/** v1.27.۰۳ — نسخهٔ pinned سایدکار node (LTS Jod — node:sqlite از 22.5 در این خط است) */
export const PINNED_NODE_VERSION = '22.23.5';

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else {
        files += 1;
        bytes += statSync(p).size;
      }
    }
  };
  walk(dir);
  return { files, bytes };
}

/** نام سایدکار node با پسوند هدف — هم‌قرارداد با find_node_binary در engine.rs */
function nodeSidecarFileName(target) {
  const ext = target.includes('windows') ? '.exe' : '';
  return `node-${target}${ext}`;
}

/**
 * ① دانلود سایدکار node از dist رسمی nodejs.org — zip ویندوز (node.exe داخل ریشهٔ بسته)،
 * tar.gz لینوکس (bin/node داخل بسته). امضای PE/ELF و حداقل حجم وارسی می‌شود.
 */
async function downloadNodeSidecar(target) {
  const isWin = target.includes('windows');
  const version = PINNED_NODE_VERSION;
  const distUrl = isWin
    ? `https://nodejs.org/dist/v${version}/node-v${version}-win-x64.zip`
    : `https://nodejs.org/dist/v${version}/node-v${version}-linux-x64.tar.gz`;
  console.log(`[runtime] دانلود سایدکار node v${version} (${isWin ? 'win-x64' : 'linux-x64'})…`);
  const res = await fetch(distUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`دانلود node ناموفق: HTTP ${res.status} — ${distUrl}`);
  const archive = path.join(os.tmpdir(), `node-v${version}-${target}${isWin ? '.zip' : '.tar.gz'}`);
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));

  const extractDir = mkdtempSync(path.join(os.tmpdir(), 'node-extract-'));
  execFileSync('tar', ['-xf', archive, '-C', extractDir]);
  const binPath = isWin
    ? path.join(extractDir, `node-v${version}-win-x64`, 'node.exe')
    : path.join(extractDir, `node-v${version}-linux-x64`, 'bin', 'node');
  if (!existsSync(binPath)) throw new Error(`باینری node داخل بسته یافت نشد: ${binPath}`);
  if (readFileSync(binPath).subarray(0, 4).toString('hex') !== (isWin ? '4d5a9000' : '7f454c46')) {
    throw new Error('فایل node امضای PE/ELF ندارد — دانلود نامعتبر');
  }

  mkdirSync(P.sidecarDir, { recursive: true });
  const sidecar = path.join(P.sidecarDir, nodeSidecarFileName(target));
  rmSync(sidecar, { force: true });
  cpSync(binPath, sidecar);
  if (!isWin) execFileSync('chmod', ['0755', sidecar]);
  rmSync(extractDir, { recursive: true, force: true });
  rmSync(archive, { force: true });
  return { sidecar, bytes: statSync(sidecar).size };
}

/** d1-seed: مایگریشن‌های رسمی + seed نمایشی، بعد checkpoint تا فایل sqlite تکی و تمیز باشد */
function buildD1Seed() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'center-d1seed-'));
  const dbPath = d1SqlitePath(tmp);
  const d1Dir = path.join(tmp, 'd1');
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const mig = applyMigrations(dbPath);
  const seeded = seedDemo(dbPath);
  // WAL را ادغام کن تا d1-seed فقط فایل اصلی را حمل کند
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  for (const suffix of ['-wal', '-shm']) {
    rmSync(dbPath + suffix, { force: true });
  }
  rmSync(P.d1SeedDir, { recursive: true, force: true });
  mkdirSync(path.dirname(P.d1SeedDir), { recursive: true });
  cpSync(d1Dir, P.d1SeedDir, { recursive: true });
  // مسیر نسبی sqlite داخل چیدمان DO (ساختار زیرپوشه حفظ می‌شود)
  const seedSqlite = path.join(P.d1SeedDir, path.relative(d1Dir, dbPath));
  rmSync(tmp, { recursive: true, force: true });
  return { appliedCount: mig.appliedCount, total: mig.total, seededUsers: seeded.usersCreated, seedSqlite };
}

async function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes('--check');
  const targetIdx = argv.indexOf('--target');
  const target = targetIdx >= 0 ? argv[targetIdx + 1] : 'x86_64-pc-windows-msvc';
  const centralDir = path.join(P.resourcesEngineDir, 'central'); // v1.26.0 — ورکر مرکزی + اسکیما
  const bundlesDir = path.join(P.resourcesEngineDir, 'bundles'); // v1.27.۰۳ — باندل‌های ورکر (فایل)
  const engineServer = path.join(P.resourcesEngineDir, 'engine-server.js');

  if (checkOnly) {
    if (!existsSync(P.manifest)) throw new Error(`manifest نیست — ابتدا مونتاژ را اجرا کنید: ${P.manifest}`);
    const m = JSON.parse(readFileSync(P.manifest, 'utf8'));
    // v1.27.۰۵ — pin نسخهٔ سایدکار هم باید در manifest ثبت و هم‌گام باشد (PRECHECK پوسته)
    if (m.nodeVersion !== PINNED_NODE_VERSION) {
      throw new Error(`nodeVersion manifest (${m.nodeVersion}) با pin (${PINNED_NODE_VERSION}) هم‌گام نیست`);
    }
    const files = [
      [m.node.sidecar, m.node.sha256],
      [m.d1Seed.sqlite, m.d1Seed.sha256],
      [m.bundles.main, m.bundles.mainSha256],
      [m.bundles.games, m.bundles.gamesSha256],
      [m.engineServer.path, m.engineServer.sha256],
      [m.central.worker, m.central.workerSha256],
      [m.central.schema, m.central.schemaSha256],
    ];
    for (const [rel, expected] of files) {
      const abs = path.join(ROOT, rel);
      if (!existsSync(abs)) throw new Error(`خروجی گم‌شده: ${rel}`);
      const actual = sha256(abs);
      if (actual !== expected) throw new Error(`ناهم‌گامی هش: ${rel}`);
    }
    console.log('[runtime] --check: همهٔ خروجی‌ها و هش‌ها معتبرند ✓');
    return;
  }

  // پیش‌نیازها — باندل موتور و باندل‌های ورکر باید از پیش ساخته و کامیت شده باشند
  for (const [file, hint] of [
    ['scripts/engine/engine-server.js', 'npm run build:engine-server'],
    ['worker/bundle.js', 'npm run build:worker (scripts/build-worker-bundle.mjs)'],
    ['worker/games-bundle.js', 'npm run build:games-worker'],
  ]) {
    if (!existsSync(path.join(ROOT, file))) throw new Error(`${file} نیست — ابتدا «${hint}» را اجرا و commit کنید`);
  }
  if (!existsSync(path.join(ROOT, 'public', 'index.html'))) {
    throw new Error('public/index.html نیست — ابتدا «npm run build:client» را اجرا کنید');
  }

  // ① سایدکار node pinned
  const { sidecar, bytes } = await downloadNodeSidecar(target);

  // ② کپی public برای سرویس استاتیک adapter
  rmSync(P.resourcesEngineDir, { recursive: true, force: true });
  mkdirSync(P.publicDir, { recursive: true });
  cpSync(path.join(ROOT, 'public'), P.publicDir, { recursive: true });
  const pub = dirStats(P.publicDir);

  // ③ d1-seed مایگریت‌شده + seed
  const seed = buildD1Seed();

  // ④ v1.27.۰۳ — باندل موتور + باندل‌های ورکر به‌صورت فایل (adapter داینامیک import می‌کند)
  const engineServerDst = path.join(P.resourcesEngineDir, 'engine-server.js');
  cpSync(path.join(ROOT, 'scripts/engine/engine-server.js'), engineServerDst);
  const engineServerBytes = statSync(engineServerDst).size;
  mkdirSync(bundlesDir, { recursive: true });
  const mainBundle = path.join(bundlesDir, 'worker.js');
  const gamesBundle = path.join(bundlesDir, 'games.js');
  cpSync(path.join(ROOT, 'worker', 'bundle.js'), mainBundle);
  cpSync(path.join(ROOT, 'worker', 'games-bundle.js'), gamesBundle);
  for (const [f, probe] of [[mainBundle, 'fetch'], [gamesBundle, 'fetch']]) {
    if (!readFileSync(f, 'utf8').includes(probe)) throw new Error(`باندل ورکر ناقص — پروب غایب: ${f}`);
  }
  const mainBundleBytes = statSync(mainBundle).size;
  const gamesBundleBytes = statSync(gamesBundle).size;

  // ⑤ v1.26.0 — دارایی‌های «ساخت سرور مرکزی»: central-worker.js + schema.sql (docs/rust/first-run-and-cloud.md §۳)
  //   باندل مرکزی از منبع «commit» شده است (worker/central-bundle.js — بازسازی: scripts/build-central-bundle.mjs
  //   در محیط توسعه/لینوکس)؛ اینجا فقط کپی + دود پروب تا روی ویندوز به .bin/esbuild نیاز نباشد.
  rmSync(centralDir, { recursive: true, force: true });
  mkdirSync(centralDir, { recursive: true });
  const centralWorkerSrc = path.join(ROOT, 'worker', 'central-bundle.js');
  if (!existsSync(centralWorkerSrc)) {
    throw new Error('worker/central-bundle.js نیست — scripts/build-central-bundle.mjs را در محیط لینوکس/توسعه اجرا و commit کنید');
  }
  const centralBody = readFileSync(centralWorkerSrc, 'utf8');
  for (const probe of ['/healthz', '/admin/setup', '/admin/announcements', '"/pull"', '"/push"', '"/register"', 'NODE_SETUP_TOKEN']) {
    if (!centralBody.includes(probe)) throw new Error(`باندل مرکزی ناقص — پروب غایب: ${probe}`);
  }
  const centralWorker = path.join(centralDir, 'central-worker.js');
  cpSync(centralWorkerSrc, centralWorker);
  const migDir = path.join(ROOT, 'migrations');
  const migFiles = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
  let schema = `-- schema.sql — تجمیع ${migFiles.length} مایگریشن رسمی (ساخته‌شده در build-installer-runtime)\n`;
  schema += `-- مقصد: پایگاه markaz-central روی حساب کلادفلر کاربر — این فایل را دستی ویرایش نکنید.\n`;
  for (const f of migFiles) {
    schema += `\n-- ===== migration: ${f} =====\n` + readFileSync(path.join(migDir, f), 'utf8') + '\n';
  }
  const centralSchema = path.join(centralDir, 'schema.sql');
  writeFileSync(centralSchema, schema, 'utf8');
  const centralWorkerBytes = statSync(centralWorker).size;
  const centralSchemaBytes = statSync(centralSchema).size;

  // ⑥ ثبت هش‌ها
  const manifest = {
    generatedAt: new Date().toISOString(),
    target,
    // v1.27.۰۵ — نسخهٔ pinned سایدکار در سطح بالا؛ PRECHECK پوسته (engine.rs) خروجی
    // «node --version» سایدکار نصب‌شده را با همین فیلد تطبیق می‌دهد (هم‌مقدار node.version)
    nodeVersion: PINNED_NODE_VERSION,
    node: {
      version: PINNED_NODE_VERSION,
      sidecar: path.relative(ROOT, sidecar),
      sha256: sha256(sidecar),
      bytes,
      source: 'https://nodejs.org/dist/',
    },
    engineServer: { path: path.relative(ROOT, engineServerDst), sha256: sha256(engineServerDst), bytes: engineServerBytes },
    bundles: {
      dir: path.relative(ROOT, bundlesDir),
      main: path.relative(ROOT, mainBundle),
      mainSha256: sha256(mainBundle),
      mainBytes: mainBundleBytes,
      games: path.relative(ROOT, gamesBundle),
      gamesSha256: sha256(gamesBundle),
      gamesBytes: gamesBundleBytes,
    },
    d1Seed: {
      dir: path.relative(ROOT, P.d1SeedDir),
      sqlite: path.relative(ROOT, seed.seedSqlite),
      sha256: sha256(seed.seedSqlite),
      migrationsApplied: seed.appliedCount,
      migrationsTotal: seed.total,
      seededUsers: seed.seededUsers,
    },
    public: { dir: path.relative(ROOT, P.publicDir), files: pub.files, bytes: pub.bytes },
    central: {
      dir: path.relative(ROOT, centralDir),
      worker: path.relative(ROOT, centralWorker),
      workerSha256: sha256(centralWorker),
      workerBytes: centralWorkerBytes,
      schema: path.relative(ROOT, centralSchema),
      schemaSha256: sha256(centralSchema),
      schemaBytes: centralSchemaBytes,
      migrations: migFiles.length,
    },
  };
  writeFileSync(P.manifest, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[runtime] سایدکار node: ${manifest.node.sidecar} — sha256=${manifest.node.sha256.slice(0, 16)}… (${bytes}B)`);
  console.log(`[runtime] engine-server: ${manifest.engineServer.path} (${engineServerBytes}B)`);
  console.log(`[runtime] باندل‌ها: main (${mainBundleBytes}B) + games (${gamesBundleBytes}B)`);
  console.log(`[runtime] d1-seed: ${seed.appliedCount}/${seed.total} مایگریشن + ${seed.seededUsers} کاربر نمایشی`);
  console.log(`[runtime] public: ${pub.files} فایل (${pub.bytes}B) — manifest: ${MANIFEST_NAME} ✓`);
  console.log(`[runtime] central: worker (${centralWorkerBytes}B) + schema (${migFiles.length} مایگریشن، ${centralSchemaBytes}B) ✓`);
}

main().catch((err) => {
  console.error(`[runtime] ✗ ${err.message}`);
  process.exit(1);
});
