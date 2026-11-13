// scripts/engine/engine.mjs — CLI موتور محلی مرکز جامع (فاز ۲ خط rust — docs/rust/design.md §۴)
//
//   node scripts/engine/engine.mjs --port 8787 --data-dir <مسیر> [--games-port 8788] [--seed]
//
// ترتیب: بررسی فضای دیسک → مایگریشن → بررسی یکپارچگی DB (quick_check) → (اختیاری) seed نمایشی
// → کشف پورت آزاد (اگر پورت خواسته‌شده اشغال بود، خودکار پورت دیگری) → تولید کانفیگ capnp-text
// → spawn workerd → انتظار /health (۳۰ ثانیه) → اجرا تا سیگنال؛ خاموشی تمیز با SIGTERM/SIGINT
// (+ چک‌پوینت WAL هنگام خاموشی) و چک‌پوینت شبانهٔ WAL هر ۲۴ ساعت.
// هر دو بایند فقط روی 127.0.0.1 هستند (design.md §۸).
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, openSync, promises as fsPromises, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildEngineConfig } from './config.mjs';
import { REPO_ROOT, d1SqlitePath } from './engine-paths.mjs';
import { applyMigrations } from './apply-migrations.mjs';

function parseArgs(argv) {
  const out = { port: 8787, gamesPort: 8788, dataDir: path.join(REPO_ROOT, 'engine-data'), seed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--games-port') out.gamesPort = Number(argv[++i]);
    else if (a === '--data-dir') out.dataDir = path.resolve(argv[++i]);
    else if (a === '--seed') out.seed = true;
    else if (a === '--help') out.help = true;
  }
  return out;
}

// ─── خودآزمایی‌های پیش از بوت (additive — رفتار قبلی و پیش‌فرض‌های CLI دست‌نخورده) ───

// ارقام فارسی برای پیام‌های کاربر-رو
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);

/** حداقل فضای آزاد مجاز روی دیسک داده — زیر این مرز بوت نمی‌کنیم */
const MIN_FREE_BYTES = 200 * 1024 * 1024;
/** بازهٔ چک‌پوینت شبانهٔ WAL */
const NIGHTLY_CHECKPOINT_MS = 24 * 60 * 60 * 1000;

/** یک پورت آزاد از هستهٔ سیستم بگیر (هم‌الگوی engine-smoke.mjs::freePort) */
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

/** آیا این پورت روی 127.0.0.1 آزاد است؟ (پروب واقعی bind) */
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

/**
 * پورت نهایی سرویس: اگر پورت خواسته‌شده آزاد بود همان را بده؛ وگرنه یک پورت آزاد بگیر و
 * فقط در لاگ خبر بده (پیش‌فرض‌های CLI عوض نمی‌شوند — «دوباره‌تلاش» اپ موتور است نه پورت).
 */
async function resolvePort(requested, service = '') {
  if (await isPortFree(requested)) return requested;
  const alt = await freePort();
  const serviceName = service ? `سرویس ${service}` : 'سرویس';
  console.log(`[engine] پورت ${faNum(requested)} اشغال بود — ${serviceName} روی پورت ${faNum(alt)} راه افتاد`);
  return alt;
}

/**
 * بررسی فضای آزاد روی همان حجمی که data-dir در آن است (fs.statfs — از node 18.15).
 * اگر statfs در این نسخهٔ node نبود یا شکست خورد، بررسی بی‌سر‌وصدا رد می‌شود (گرس‌هندل).
 * زیر ۲۰۰ مگابایت: پیام روشن فارسی + خروج غیرصفر — بوت را شروع نمی‌کنیم.
 */
async function assertDiskFree(dataDir) {
  if (typeof fsPromises.statfs !== 'function') return;
  let stat;
  try {
    stat = await fsPromises.statfs(dataDir);
  } catch {
    return; // مسیر عجیب/فایل‌سیستم ناشناخته — مانع بوت نیست
  }
  const freeBytes = Number(stat.bavail) * Number(stat.bsize);
  if (freeBytes >= MIN_FREE_BYTES) return;
  const freeMb = Math.floor(freeBytes / (1024 * 1024));
  console.error(`[engine] فضای دیسک کم است: فقط ${faNum(freeMb)} مگابایت آزاد — دست‌کم ۲۰۰ مگابایت آزاد کنید`);
  console.error(`[engine] پوشهٔ داده: ${dataDir}`);
  process.exit(1);
}

/**
 * بررسی یکپارچگی پایگاه داده با quick_check — بعد از باز شدن مایگریشن‌ها و قبل از spawn workerd.
 * اگر «ok» نبود یعنی فایل SQLite آسیب دیده؛ با پیام فارسیِ راهنما (بازگردانی آخرین پشتیبان)
 * خارج می‌شویم و workerd را اصلاً بالا نمی‌آوریم. کانکشن بازشده برای چک‌پوینت‌های WAL هم نگه داشته می‌شود.
 */
function openDbAndAssertIntegrity(dbPath) {
  let db;
  try {
    db = new DatabaseSync(dbPath);
  } catch {
    // حتی «باز کردن» هم ممکن نشد — فایل آن‌قدر آسیب دیده که SQLite آن را نمی‌شناسد
    console.error('[engine] پایگاه داده اصلاً باز نشد — فایل آن‌قدر آسیب دیده که SQLite آن را نمی‌شناسد');
    console.error('[engine] برای ادامه، آخرین پشتیبان را بازگردانید و دوباره تلاش کنید');
    process.exit(1);
  }
  try {
    const row = db.prepare('PRAGMA quick_check').get();
    const status = row ? String(Object.values(row)[0]) : '';
    if (status !== 'ok') {
      console.error(`[engine] پایگاه داده بررسی یکپارچگی را نگذراند (وضعیت: ${status || 'بدون پاسخ'})`);
      console.error('[engine] فایل پایگاه داده سالم نیست — برای ادامه، آخرین پشتیبان را بازگردانید و دوباره تلاش کنید');
      db.close();
      process.exit(1);
    }
  } catch (err) {
    console.error(`[engine] بررسی یکپارچگی پایگاه داده ممکن نشد: ${err.message}`);
    db.close();
    process.exit(1);
  }
  return db;
}

/** چک‌پوینت WAL — همه‌جا best-effort: خطا لاگ می‌شود، هیچ‌وقت پرتاب نمی‌شود */
function checkpointWal(db, reason) {
  if (!db) return;
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    console.log(`[engine] چک‌پوینت WAL انجام شد (${reason})`);
  } catch (err) {
    console.error(`[engine] چک‌پوینت WAL (${reason}) ناموفق بود — بی‌خطر و رد شد: ${err.message}`);
  }
}

/** runtime-secret مشترک دو ورکر: از settings می‌خواند و اگر نبود می‌سازد و می‌نویسد */
function resolveAuthSecret(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'sys_auth_secret' LIMIT 1`).get();
    if (row) {
      const parsed = JSON.parse(row.value);
      if (typeof parsed === 'string' && parsed) return parsed;
    }
    const secret = randomBytes(32).toString('hex');
    db.prepare(`INSERT INTO settings (key, value) VALUES ('sys_auth_secret', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(secret));
    return secret;
  } finally {
    db.close();
  }
}

function findWorkerdBinary() {
  const candidates = [
    path.join(REPO_ROOT, 'node_modules/workerd/bin/workerd'),
    path.join(REPO_ROOT, 'node_modules/@cloudflare/workerd-linux-64/bin/workerd'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('باینری workerd پیدا نشد — npm install را اجرا کنید');
}

async function waitHealth(url, child, timeoutMs = 30_000) {
  const started = Date.now();
  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`workerd پیش از آماده شدن خارج شد (کد ${child.exitCode}) — لاگ: dataDir/workerd.log`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // هنوز بالا نیامده — دوباره
    }
    if (Date.now() - started > timeoutMs) throw new Error(`/health بعد از ${timeoutMs}ms پاسخ نداد — لاگ: dataDir/workerd.log`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function runEngine(opts) {
  const dbPath = d1SqlitePath(opts.dataDir);
  mkdirSync(opts.dataDir, { recursive: true });

  // ۰) خودآزمایی دیسک — قبل از هر نوشتن دیگری (زیر ۲۰۰ مگابایت آزاد: پیام فارسی + خروج غیرصفر)
  await assertDiskFree(opts.dataDir);

  // ۱) مایگریشن idempotent با همان migrations/ رسمی — اگر فایل داده حتی باز نشد یا
  // مایگریشن روی فایل آسیب‌دیده شکست خورد، با پیام فارسی خارج می‌شویم (نه کرش خام node)
  let mig;
  try {
    mig = applyMigrations(dbPath);
  } catch {
    console.error('[engine] پایگاه داده برای مایگریشن باز نشد — فایل داده سالم نیست');
    console.error('[engine] برای ادامه، آخرین پشتیبان را بازگردانید و دوباره تلاش کنید');
    process.exit(1);
  }
  console.log(`[engine] مایگریشن‌ها: ${mig.appliedCount} اعمال شد (از ${mig.total})`);

  // ۱٫۵) بررسی یکپارچگی DB (quick_check) — بعد از باز شدن مایگریشن‌ها، قبل از seed و workerd؛
  // کانکشن باز می‌ماند تا چک‌پوینت‌های WAL (خاموشی/شبانه) از همین هندل بروند
  const walDb = openDbAndAssertIntegrity(dbPath);

  // ۲) seed نمایشی — فقط با --seed یا اجرای اول
  if (opts.seed || !existsSync(dbPath)) {
    const { seedDemo } = await import('./seed-demo.mjs');
    const s = seedDemo(dbPath);
    console.log(`[engine] seed نمایشی: ${s.usersCreated} کاربر (manager/secretary/therapist — رمز ۱۲۳۴)`);
  }

  // ۳) secret مشترک + کانفیگ capnp-text — پورت‌ها همین‌جا قطعی می‌شوند: اگر پورت خواسته‌شده
  // اشغال بود، خودکار پورت آزاد می‌گیریم و فقط در لاگ خبر می‌دهیم (پیش‌فرض‌های CLI ثابت می‌مانند)
  const port = await resolvePort(opts.port);
  const gamesPort = await resolvePort(opts.gamesPort, 'بازی‌ها');
  const authSecret = resolveAuthSecret(dbPath);
  const configText = await buildEngineConfig({ port, gamesPort, dataDir: opts.dataDir, authSecret });
  const configPath = path.join(opts.dataDir, 'workerd.capnp');
  writeFileSync(configPath, configText);

  // ۴) spawn workerd — لاگ در dataDir/workerd.log
  const bin = findWorkerdBinary();
  const logFd = openSync(path.join(opts.dataDir, 'workerd.log'), 'a');
  const child = spawn(bin, ['serve', '--experimental', `--import-path=${path.join(REPO_ROOT, 'node_modules/workerd')}`, configPath], { stdio: ['ignore', logFd, logFd] });
  const base = `http://127.0.0.1:${port}`;
  console.log(`[engine] workerd بالا آمد — اپ: ${base} | بازی‌ها: http://127.0.0.1:${gamesPort} | داده: ${opts.dataDir}`);

  // ۵) خاموشی تمیز — هندل‌های SIGTERM/SIGINT و خروج ناگهانی همین‌جا و «قبل از انتظار سلامت»
  // ثبت می‌شوند تا سیگنال حین بوت هم به «خاموشی تمیز + چک‌پوینت WAL» برسد، نه خروج خام node
  let shuttingDown = false;
  let nightlyCheckpoint = null;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[engine] خاموشی تمیز (${signal})...`);
    if (nightlyCheckpoint) clearInterval(nightlyCheckpoint);
    child.kill('SIGTERM');
    const forceTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => {
      clearTimeout(forceTimer);
      console.log('[engine] workerd خاموش شد');
      checkpointWal(walDb, 'خاموشی تمیز');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  child.once('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[engine] workerd ناگهان خارج شد (کد ${code} سیگنال ${signal})`);
      process.exit(1);
    }
  });

  // ۶) انتظار سلامت — اگر بوت شکست خورد و هندل DB موجود است، اول چک‌پوینت WAL بی‌خطر
  try {
    await waitHealth(`${base}/health`, child);
  } catch (err) {
    checkpointWal(walDb, 'پس از شکست بوت');
    throw err;
  }
  console.log('[engine] /health سبز است');

  // چک‌پوینت شبانهٔ WAL — هر ۲۴ ساعت حین کار؛ best-effort (خطا لاگ می‌شود نه پرتاب) و
  // unref تا تایمر جلوی خروج طبیعی فرایند را نگیرد
  nightlyCheckpoint = setInterval(() => checkpointWal(walDb, 'شبانه'), NIGHTLY_CHECKPOINT_MS);
  nightlyCheckpoint.unref();
  return child;
}

// اجرای مستقیم
if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('استفاده: node scripts/engine/engine.mjs --port 8787 --data-dir <مسیر> [--games-port 8788] [--seed]');
  } else {
    await runEngine(opts);
  }
}
