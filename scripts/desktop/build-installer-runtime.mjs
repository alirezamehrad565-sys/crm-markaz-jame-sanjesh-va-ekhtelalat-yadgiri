// scripts/desktop/build-installer-runtime.mjs — مونتاژ رانتایم نصاب میز (rust-f13 — گیت فاز ۲ ردیف ۹)
//
//   node scripts/desktop/build-installer-runtime.mjs --target x86_64-pc-windows-msvc [--check]
//
// کارها (بدون هیچ عملیات Cloudflare؛ دانلود فقط از رجیستری رسمی npm):
//   ① دانلود سایدکار workerd نسخهٔ pinned از بستهٔ رسمی npm هدف + sha256
//   ② کپی public/ (خروجی build:client) → resources/engine/public — دیسک assets worker
//   ③ d1-seed: دیتابیس مایگریت‌شده (+ seed نمایشی) در چیدمان قطعی miniflare — بوت نخست lib.rs کپی می‌کند
//     (در نصب کاربر Node وجود ندارد؛ مایگریشن باید زمان بسته‌بندی اعمال شده باشد)
//   ④ قالب capnp توکن‌دار (buildInstallerCapnpTemplate) — lib.rs در بوت توکن‌ها را جایگزین می‌کند
//   ⑤ ثبت هش‌ها در engine-runtime-manifest.json (معیار «ثبت هش» گیت ردیف ۹)
// با --check: همهٔ خروجی‌ها و هش‌های manifest دوباره وارسی می‌شوند (بدون دانلود).
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  PINNED_WORKERD_VERSION, TARGET_NPM_PACKAGE, sidecarFileName,
  installerPaths, CAPNP_TEMPLATE_NAME, MANIFEST_NAME,
} from './config.mjs';
import { buildInstallerCapnpTemplate } from '../engine/config.mjs';
import { applyMigrations } from '../engine/apply-migrations.mjs';
import { seedDemo } from '../engine/seed-demo.mjs';
import { d1SqlitePath } from '../engine/engine-paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const P = installerPaths(ROOT);

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

async function downloadSidecar(target) {
  const pkg = TARGET_NPM_PACKAGE[target];
  if (!pkg) throw new Error(`هدف ناشناخته: ${target} — مقصدهای پشتیبانی‌شده: ${Object.keys(TARGET_NPM_PACKAGE).join(', ')}`);
  const meta = await (await fetch(`https://registry.npmjs.org/${pkg}/${PINNED_WORKERD_VERSION}`)).json();
  if (!meta?.dist?.tarball) throw new Error(`بستهٔ ${pkg}@${PINNED_WORKERD_VERSION} در رجیستری یافت نشد`);
  console.log(`[runtime] دانلود سایدکار: ${pkg}@${PINNED_WORKERD_VERSION}`);
  const tgz = path.join(os.tmpdir(), `workerd-${target}-${PINNED_WORKERD_VERSION}.tgz`);
  const res = await fetch(meta.dist.tarball);
  if (!res.ok) throw new Error(`دانلود تاربال ناموفق: HTTP ${res.status}`);
  writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));

  const extractDir = mkdtempSync(path.join(os.tmpdir(), 'workerd-extract-'));
  execFileSync('tar', ['-xzf', tgz, '-C', extractDir]);
  const binName = target.includes('windows') ? 'workerd.exe' : 'workerd';
  const binPath = path.join(extractDir, 'package', 'bin', binName);
  if (!existsSync(binPath)) throw new Error(`باینری داخل تاربال یافت نشد: ${binPath}`);

  mkdirSync(P.sidecarDir, { recursive: true });
  const sidecar = path.join(P.sidecarDir, sidecarFileName(target));
  rmSync(sidecar, { force: true });
  cpSync(binPath, sidecar);
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

  if (checkOnly) {
    if (!existsSync(P.manifest)) throw new Error(`manifest نیست — ابتدا مونتاژ را اجرا کنید: ${P.manifest}`);
    const m = JSON.parse(readFileSync(P.manifest, 'utf8'));
    const files = [
      [m.workerd.sidecar, m.workerd.sha256],
      [m.capnpTemplate.path, m.capnpTemplate.sha256],
      [m.d1Seed.sqlite, m.d1Seed.sha256],
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

  // پیش‌نیازها
  const repoWorkerd = path.join(ROOT, 'node_modules', 'workerd', 'package.json');
  if (existsSync(repoWorkerd)) {
    const installed = JSON.parse(readFileSync(repoWorkerd, 'utf8')).version;
    if (installed !== PINNED_WORKERD_VERSION) {
      throw new Error(`ناهم‌گامی pin: node_modules/workerd=${installed} ولی pinned=${PINNED_WORKERD_VERSION} — config.mjs را هم‌گام کنید`);
    }
  }
  if (!existsSync(path.join(ROOT, 'public', 'index.html'))) {
    throw new Error('public/index.html نیست — ابتدا «npm run build:client» را اجرا کنید');
  }

  // ① سایدکار pinned
  const { sidecar, bytes } = await downloadSidecar(target);

  // ② کپی public برای دیسک assets
  rmSync(P.resourcesEngineDir, { recursive: true, force: true });
  mkdirSync(P.publicDir, { recursive: true });
  cpSync(path.join(ROOT, 'public'), P.publicDir, { recursive: true });
  const pub = dirStats(P.publicDir);

  // ③ d1-seed مایگریت‌شده + seed
  const seed = buildD1Seed();

  // ④ قالب capnp توکن‌دار — مانیفست دارایی‌ها از همان کپی داخل resources ساخته می‌شود
  const template = await buildInstallerCapnpTemplate({ publicDir: P.publicDir });
  writeFileSync(P.capnpTemplate, template);

  // ⑤ ثبت هش‌ها
  const manifest = {
    generatedAt: new Date().toISOString(),
    target,
    workerd: {
      version: PINNED_WORKERD_VERSION,
      npmPackage: TARGET_NPM_PACKAGE[target],
      sidecar: path.relative(ROOT, sidecar),
      sha256: sha256(sidecar),
      bytes,
    },
    capnpTemplate: { path: path.relative(ROOT, P.capnpTemplate), name: CAPNP_TEMPLATE_NAME, sha256: sha256(P.capnpTemplate), bytes: statSync(P.capnpTemplate).size },
    d1Seed: {
      dir: path.relative(ROOT, P.d1SeedDir),
      sqlite: path.relative(ROOT, seed.seedSqlite),
      sha256: sha256(seed.seedSqlite),
      migrationsApplied: seed.appliedCount,
      migrationsTotal: seed.total,
      seededUsers: seed.seededUsers,
    },
    public: { dir: path.relative(ROOT, P.publicDir), files: pub.files, bytes: pub.bytes },
  };
  writeFileSync(P.manifest, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[runtime] سایدکار: ${manifest.workerd.sidecar} — sha256=${manifest.workerd.sha256.slice(0, 16)}… (${bytes}B)`);
  console.log(`[runtime] قالب capnp: ${manifest.capnpTemplate.path} (${manifest.capnpTemplate.bytes}B)`);
  console.log(`[runtime] d1-seed: ${seed.appliedCount}/${seed.total} مایگریشن + ${seed.seededUsers} کاربر نمایشی`);
  console.log(`[runtime] public: ${pub.files} فایل (${pub.bytes}B) — manifest: ${MANIFEST_NAME} ✓`);
}

main().catch((err) => {
  console.error(`[runtime] ✗ ${err.message}`);
  process.exit(1);
});
