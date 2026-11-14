// scripts/engine/engine.mjs — CLI موتور محلی مرکز جامع (فاز ۲ خط rust — docs/rust/design.md §۴)
//
//   node scripts/engine/engine.mjs --port 8787 --data-dir <مسیر> [--games-port 8788] [--seed]
//
// ترتیب: بررسی فضای دیسک → بررسی یکپارچگی DB و (در صورت خرابی) بازسازی خودکار بی‌صدا از
// پشتیبان تأییدشده (باقی‌ماندهٔ موج ۳ / DB-1) → مایگریشن → بررسی یکپارچگی دوباره → پشتیبان
// فایل‌سطح بوت → (اختیاری) seed نمایشی → کشف پورت آزاد (اگر پورت خواسته‌شده اشغال بود، خودکار
// پورت دیگری) → تولید کانفیگ capnp-text → spawn workerd → انتظار /health (۳۰ ثانیه) → اجرا تا
// سیگنال؛ خاموشی تمیز با SIGTERM/SIGINT (+ چک‌پوینت WAL هنگام خاموشی) و چک‌پوینت/پشتیبان/
// چرخش لاگ شبانهٔ هر ۲۴ ساعت. ناظر زمان اجرا (داخل همین فرایند): ری‌استارت درخواستی از پنل
// (مهر «خروج عمدی» — واچ‌داگ حساب نمی‌کند)، پایش ورکر بازی‌ها با بک‌آف/کاپ هم‌فلسفهٔ نگهبان
// Rust (ENG-4)، چرخش لاگ ۵ مگابایتی و ریختن رویدادهای انسانی فارسی در events-fa.log (۴-۳).
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
import { ensureDbIntegrityOrRestore, takeSnapshot, writeAuditRow } from './db-snapshot.mjs';
import { pushHumanEventDb, drainQueueToLog, rotateFileIfNeeded } from './human-log.mjs';
import { nextAction as gamesNextAction, GAMES_FAIL_THRESHOLD, restartMessage } from './games-watchdog.mjs';

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
/** بازهٔ چک‌پوینت شبانهٔ WAL + پشتیبان شبانه + چرخش لاگ شبانه */
const NIGHTLY_CHECKPOINT_MS = 24 * 60 * 60 * 1000;
/** کلید مُهر «خروج عمدی / ری‌استارت درخواستی از پنل» در جدول settings (۴-۲) */
const RESTART_MARKER_KEY = 'sys_restart_scheduled';
// ENG-4 — آینهٔ سلامت بازی‌ها برای پنل اپ (workerd به loopback نمی‌رسد؛ ناظر می‌نویسد)
const GAMES_HEALTH_MIRROR_KEY = 'sys_games_health';
/** کلید آینهٔ وضعیت سینک (rust-f14) — برای رویدادهای انسانی «سینک موفق/قطع» خوانده می‌شود */
const SYNC_MIRROR_KEY = 'nodesync:status-mirror-v1';
/** گام پایش زمان اجرا (ری‌استارت درخواستی/سلامت بازی‌ها/صف رویدادها) */
const RUNTIME_POLL_MS = 5_000;

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
  const workerdLogPath = path.join(opts.dataDir, 'workerd.log');
  const eventsLogPath = path.join(opts.dataDir, 'events-fa.log');

  // ۰) خودآزمایی دیسک — قبل از هر نوشتن دیگری (زیر ۲۰۰ مگابایت آزاد: پیام فارسی + خروج غیرصفر)
  await assertDiskFree(opts.dataDir);

  // ۰٫۵) بررسی یکپارچگی DB و بازسازی خودکار بی‌صدا از پشتیبان (باقی‌ماندهٔ موج ۳ / DB-1) —
  // پیش از مایگریشن، چون روی فایلِ آسیب‌دیده مایگریشن هم شکست می‌خورد. در حالت خراب:
  // کپی نشانهٔ <name>.corrupt-<UTCts>.bak → بازیابی تازه‌ترین پشتیبان تأییدشده → quick_check
  // دوباره؛ گذر: ادامهٔ بوت با پیام فارسی + ردیف audit؛ ناگزیر: بوت متوقف با پیام فارسی.
  const pre = ensureDbIntegrityOrRestore(dbPath, opts.dataDir);
  if (pre.restored) {
    pushHumanEventDb(pre.db, pre.restored.message, 'engine');
    console.log(`[engine] ${pre.restored.message}`);
    pre.db.close();
  }

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

  // ۲٫۵) پشتیبان فایل‌سطح بوت (لایهٔ محلی بازیابی خودکار) + چرخش لاگ موتور (۴-۳) + رویداد انسانی
  // — بعد از seed تا پشتیبانِ بوت همه‌چیزِ همین اجرا را داشته باشد
  rotateFileIfNeeded(workerdLogPath);
  const bootSnap = takeSnapshot(dbPath, opts.dataDir);
  if (bootSnap.ok) {
    pushHumanEventDb(walDb, 'پشتیبان فایل‌سطح پایگاه گرفته شد', 'engine');
    try {
      writeAuditRow(walDb, 'db.backup_file', 'database', bootSnap.name, { bytes: bootSnap.bytes, phase: 'boot' });
    } catch { // ثبت audit بهترین‌تلاش است؛ بوت را نگه نمی‌دارد
    }
  }
  drainQueueToLog(walDb, eventsLogPath);

  // ۳) secret مشترک + کانفیگ capnp-text — پورت‌ها همین‌جا قطعی می‌شوند: اگر پورت خواسته‌شده
  // اشغال بود، خودکار پورت آزاد می‌گیریم و فقط در لاگ خبر می‌دهیم (پیش‌فرض‌های CLI ثابت می‌مانند)
  const port = await resolvePort(opts.port);
  const gamesPort = await resolvePort(opts.gamesPort, 'بازی‌ها');
  const authSecret = resolveAuthSecret(dbPath);
  const configText = await buildEngineConfig({ port, gamesPort, dataDir: opts.dataDir, authSecret });
  const configPath = path.join(opts.dataDir, 'workerd.capnp');
  writeFileSync(configPath, configText);

  // ۴) spawn workerd — لاگ در dataDir/workerd.log (چرخش ۵MB×۷ پیش از باز شدن پیوست انجام شد)
  const bin = findWorkerdBinary();
  const logFd = openSync(workerdLogPath, 'a');
  const base = `http://127.0.0.1:${port}`;
  const gamesBase = `http://127.0.0.1:${gamesPort}`;

  // کودک جاری بین بوت/ری‌استارت‌های ناظر جابه‌جا می‌شود؛ هندل‌های خروج هر بار دوباره بسته می‌شوند
  let child = null;
  let shuttingDown = false;
  let restartingNow = false;

  const spawnChild = () =>
    spawn(bin, ['serve', '--experimental', `--import-path=${path.join(REPO_ROOT, 'node_modules/workerd')}`, configPath], { stdio: ['ignore', logFd, logFd] });

  const attachChildHandlers = () => {
    child.once('exit', (code, signal) => {
      // حین ری‌استارت درخواستی/ناظرِ بازی‌ها، خروج کودکِ کهنه طبیعی است — فرایند موتور نمی‌میرد
      if (shuttingDown || restartingNow) return;
      console.error(`[engine] workerd ناگهان خارج شد (کد ${code} سیگنال ${signal})`);
      process.exit(1);
    });
  };
  child = spawnChild();
  attachChildHandlers();
  console.log(`[engine] workerd بالا آمد — اپ: ${base} | بازی‌ها: ${gamesBase} | داده: ${opts.dataDir}`);

  // ۵) خاموشی تمیز — هندل‌های SIGTERM/SIGINT و خروج ناگهانی همین‌جا و «قبل از انتظار سلامت»
  // ثبت می‌شوند تا سیگنال حین بوت هم به «خاموشی تمیز + چک‌پوینت WAL» برسد، نه خروج خام node
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

  // ۶) انتظار سلامت — اگر بوت شکست خورد و هندل DB موجود است، اول چک‌پوینت WAL بی‌خطر
  try {
    await waitHealth(`${base}/health`, child);
  } catch (err) {
    checkpointWal(walDb, 'پس از شکست بوت');
    throw err;
  }
  console.log('[engine] /health سبز است');

  // پاک‌سازی مُهر ری‌استارتِ مصرف‌شده — بوت سالم یعنی ری‌استارتِ درخواستیِ قبلی کامل شده است
  // (نویسندهٔ مُهر: POST /api/system/restart — ۴-۲؛ مُهر تازه فقط پیشِ ری‌استارتِ بعدی می‌آید)
  try {
    walDb.prepare('DELETE FROM settings WHERE key = ?').run(RESTART_MARKER_KEY);
  } catch { /* بهترین‌تلاش */ }

  // ─── ۷) ناظر زمان اجرا — ری‌استارت درخواستی از پنل (۴-۲)، پایش ورکر بازی‌ها (ENG-4)،
  // ریختن صف رویدادهای انسانی در فایل (۴-۳) و رویداد سینک از آینهٔ وضعیت ───

  /**
   * ری‌استارت تمیز workerd در همان فرایند ناظر — خروج کودک کهنه «عمدی» است (پرچم
   * restartingNow) و هیچ حساب کرشی برآن نوشته نمی‌شود؛ همان مهر «خروج عمدی» ۱.۲۶.۲.
   */
  const respawnWorkerd = async (reason) => {
    if (restartingNow || shuttingDown) return;
    restartingNow = true;
    try {
      // تا ۳ تلاش — شکست گذرای spawn/پورت نباید کل موتور را بیندازد؛ مُهر تا موفقیت می‌ماند
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          console.log(`[engine] ری‌استارت تمیز workerd (${reason}) — تلاش ${attempt}/3...`);
          const old = child;
          await new Promise((resolve) => {
            if (old.exitCode !== null || old.signalCode !== null) return resolve();
            const forceTimer = setTimeout(() => { try { old.kill('SIGKILL'); } catch { /* رفته است */ } }, 5000);
            old.once('exit', () => { clearTimeout(forceTimer); resolve(); });
          });
          checkpointWal(walDb, `پیش از ری‌استارت (${reason})`);
          child = spawnChild();
          attachChildHandlers();
          await waitHealth(`${base}/health`, child);
          try {
            walDb.prepare('DELETE FROM settings WHERE key = ?').run(RESTART_MARKER_KEY);
          } catch { /* بهترین‌تلاش */ }
          // رویداد انسانی مرجع ری‌استارت پنل — سمت ناظر نوشته می‌شود تا همیشه در events-fa.log بنشیند
          pushHumanEventDb(walDb, 'راه‌اندازی دوبارهٔ سامانه از پنل', 'engine');
          drainQueueToLog(walDb, eventsLogPath);
          console.log('[engine] ری‌استارت کامل شد — /health سبز است');
          return;
        } catch (err) {
          console.error(`[engine] تلاش ${attempt}/3 ری‌استارت ناکام ماند: ${err?.message ?? err}`);
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
        }
      }
      console.error('[engine] هر ۳ تلاش ری‌استارت ناکام بود — برای مداخلهٔ نگهبان بیرونی (Rust) خارج می‌شود');
      try { writeAuditRow(walDb, 'system.respawn_failed', 'system', 'engine', { reason }); } catch { /* بهترین‌تلاش */ }
      process.exit(1);
    } finally {
      restartingNow = false;
    }
  };

  // وضعیت پایش بازی‌ها — آینهٔ ماشین وضعیت engine_watchdog.rs (بک‌آف ۲/۵/۱۰، کاپ ۳، پنجرهٔ ۱۰د)
  let gamesHistory = [];
  let gamesFails = 0;
  let gamesGiveUp = false;
  let lastSyncKey = null;

  /** رویداد انسانی تغییر وضعیت سینک — فقط روی گذار، نه هر پایش (۴-۳) */
  const syncEventMaybe = () => {
    try {
      const row = walDb.prepare('SELECT value FROM settings WHERE key = ?').get(SYNC_MIRROR_KEY);
      if (!row?.value) return;
      const mirror = JSON.parse(row.value);
      const key = `${mirror.state ?? ''}|${mirror.last_error_kind ?? ''}`;
      if (key === lastSyncKey) return;
      const first = lastSyncKey === null;
      lastSyncKey = key;
      if (first) return; // نخستین مشاهدهٔ هر بوت = مبنای گذارهای بعدی، نه رویداد تازه
      if (mirror.state === 'synced') pushHumanEventDb(walDb, 'هم‌گام‌سازی با مرکز موفق بود', 'sync');
      else if (mirror.state === 'error' || mirror.state === 'offline') {
        pushHumanEventDb(walDb, 'هم‌گام‌سازی با مرکز قطع شد — ثبت‌ها همین‌جا محفوظ است', 'sync');
      } else if (mirror.state === 'paused_version') {
        pushHumanEventDb(walDb, 'هم‌گام‌سازی متوقف شد — اول مرکز را به‌روزرسانی کنید', 'sync');
      }
    } catch { /* آینهٔ ناقص = بدون رویداد */ }
  };

  /** یک گام پایش — ری‌استارت درخواستی اولویت دارد؛ سپس سلامت بازی‌ها با اپِ سالم */
  const runtimePoll = async () => {
    if (shuttingDown || restartingNow) return;
    // ① ری‌استارت درخواستی از پنل — مُهر settings (durable؛ حتی اگر isolate اپ بازچرخیده باشد)
    try {
      const row = walDb.prepare('SELECT value FROM settings WHERE key = ?').get(RESTART_MARKER_KEY);
      if (row) {
        pushHumanEventDb(walDb, 'راه‌اندازی دوبارهٔ سامانه از پنل', 'engine');
        try {
          writeAuditRow(walDb, 'system.restart', 'system', 'engine', { via: 'panel' });
        } catch { /* بهترین‌تلاش */ }
        await respawnWorkerd('درخواست پنل');
        return;
      }
    } catch { /* خواندن مُهر ناموفق — پایش بازی‌ها ادامه می‌یابد */ }

    // ② ENG-4 — مرگ ورکر بازی‌ها: پایش پورت بازی‌ها ناسالم با پورت اصلی سالم؛
    // تصمیم با همان ماشین وضعیت نگهبان Rust (بک‌آف/کاپ/پنجره) و ری‌استارتِ کل workerd
    // (تک‌راهِ موجود: بازی‌ها سرویس داخل همان پروسهٔ workerd است — گزارش در games-watchdog.mjs)
    let mainOk = false;
    let gamesOk = false;
    try {
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2_500) });
      const j = await r.json().catch(() => null);
      mainOk = r.ok && j?.ok === true;
    } catch { mainOk = false; }
    let gamesBootTs = null;
    try {
      const r = await fetch(`${gamesBase}/health`, { signal: AbortSignal.timeout(2_500) });
      const j = await r.json().catch(() => null);
      gamesOk = r.ok && j?.ok === true;
      gamesBootTs = typeof j?.boot_ts === 'string' ? j.boot_ts : null;
    } catch { gamesOk = false; }
    // آینهٔ سلامت بازی‌ها در settings — پنل اپ (workerd) همین را می‌خواند (ENG-4)
    try {
      const snap = JSON.stringify({ ok: gamesOk, boot_ts: gamesBootTs, checked_at: new Date().toISOString(), port: gamesPort });
      walDb
        .prepare(`INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, datetime('now'))
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`)
        .run(GAMES_HEALTH_MIRROR_KEY, snap);
    } catch { /* بهترین‌تلاش */ }

    if (gamesOk) {
      // سالم شد — رشتهٔ خرابی بسته می‌شود (شمارش برای حادثهٔ بعدی از صفر)
      if (gamesFails > 0 || gamesHistory.length > 0 || gamesGiveUp) {
        console.log('[engine] ورکر بازی‌ها دوباره سالم است — شمارش نگهبان از صفر');
      }
      gamesFails = 0;
      gamesHistory = [];
      gamesGiveUp = false;
    } else if (mainOk) {
      gamesFails += 1;
      if (gamesFails >= GAMES_FAIL_THRESHOLD && !gamesGiveUp) {
        gamesFails = 0;
        const now = Date.now();
        let decision = gamesNextAction(gamesHistory, now, now);
        if (decision.kind === 'reset_window') {
          gamesHistory = [];
          console.log('[engine] پنجرهٔ ۱۰ دقیقه‌ای نگهبان بازی‌ها گذشت — شمارش تلاش‌ها از صفر');
          decision = gamesNextAction(gamesHistory, now, now);
        }
        if (decision.kind === 'give_up') {
          gamesGiveUp = true;
          console.error('[engine] نگهبان بازی‌ها تسلیم شد — ۳ تلاش در پنجرهٔ ۱۰ دقیقه بی‌نتیجه بود؛ بخش اداری سالم مانده و بازی‌ها تا تلاش دوباره از پنل در دسترس نیست');
          pushHumanEventDb(walDb, 'ورکر بازی‌ها پس از ۳ تلاش بالا نیامد — بقیهٔ سامانه سالم است؛ با پشتیبانی تماس بگیرید', 'engine');
          try {
            writeAuditRow(walDb, 'system.games_worker_down', 'system', 'games', { attempts: gamesHistory.length });
          } catch { /* بهترین‌تلاش */ }
        } else if (decision.kind === 'restart') {
          const attempt = gamesHistory.length + 1;
          console.log(`[engine] ورکر بازی‌ها ناسالم است — ری‌استارت تا ${decision.delay_ms / 1000} ثانیه دیگر (تلاش ${attempt})`);
          gamesHistory.push({ at_ms: now, delay_ms: decision.delay_ms });
          pushHumanEventDb(walDb, restartMessage(attempt), 'engine');
          try {
            writeAuditRow(walDb, 'system.games_worker_restart', 'system', 'games', { attempt, delay_ms: decision.delay_ms });
          } catch { /* بهترین‌تلاش */ }
          await new Promise((r) => setTimeout(r, decision.delay_ms));
          if (shuttingDown || restartingNow) return;
          await respawnWorkerd(`نگهبان بازی‌ها — تلاش ${attempt}`);
          return;
        }
      }
    }
    // اگر اپ اصلی هم ناسالم بود: مرگ کل پروسهٔ workerd است — هندل خروج کودک همان‌جا برخورد می‌کند
    // (و پس از خروج ناگهانی، فرایند engine با پیام فارسی تمام می‌شود؛ نگهبان تائوری سمت Rust یا
    // دوباره‌اجراکنندهٔ بیرونی دوباره بالا می‌آورد)

    // ③ صف رویدادهای انسانی → فایل گردش‌پذیر (۴-۳)
    drainQueueToLog(walDb, eventsLogPath);
    // ④ رویداد سینک از آینهٔ وضعیت — فقط روی گذار
    syncEventMaybe();
  };

  const safeRuntimePoll = () => runtimePoll().catch((err) => console.error(`[engine] خطای گذرای پایش نادیده گرفته شد: ${err?.message ?? err}`));
  const runtimePoller = setInterval(safeRuntimePoll, RUNTIME_POLL_MS);
  void safeRuntimePoll(); // نخستین آینهٔ سلامت بی‌درنگ — ردیف بازی‌های پنل از لحظهٔ صفر واقعی است
  runtimePoller.unref(); // هیچ‌وقت جلوی خروج طبیعی فرایند را نگیرد

  // چک‌پوینت شبانهٔ WAL + پشتیبان شبانه + چرخش لاگ — هر ۲۴ ساعت حین کار؛ best-effort و unref
  nightlyCheckpoint = setInterval(() => {
    checkpointWal(walDb, 'شبانه');
    const snap = takeSnapshot(dbPath, opts.dataDir);
    if (snap.ok) pushHumanEventDb(walDb, 'پشتیبان شبانهٔ پایگاه گرفته شد', 'engine');
    rotateFileIfNeeded(workerdLogPath);
    drainQueueToLog(walDb, eventsLogPath);
  }, NIGHTLY_CHECKPOINT_MS);
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
