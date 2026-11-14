// scripts/desktop/update-verify.mjs — تأیید دو مرحله‌ای ارتقای میز (VER-2 — نقد شکست وسط ارتقا)
//
// یافتهٔ بررسی (گزارش کار): «به‌روزرسانی میز» در مخزن مسیر واقعی و سیم‌شده‌ای ندارد —
// نصاب NSIS یک‌بار نصب می‌کند و هیچ updater/هوک ارتقایی برای میز وجود ندارد؛ تنها جریان
// ارتقای موجود «مرکز» است (npm run update → scripts/update-remote.mjs) که گام پشتیبان +
// دروازهٔ سلامت ×۳ + رولبک را خودش دارد. پس منطق VER-2 این‌جا به‌صورت ماژول + CLI
// قابل‌استفاده ساخته شد تا نصاب/هوک آیندهٔ میز فقط آن را صدا بزند (هوک نصاب = پیگیری).
//
// تأیید دو مرحله‌ای (مطابق سطر VER-2 نقد):
//   مرحلهٔ ۱ — «نصب»: باندل/کد نسخهٔ جدید در پوشهٔ نامزد (candidate) استاند می‌شود —
//             نسخهٔ زنده هیچ‌وقت بازنویسی نمی‌شود.
//   مرحلهٔ ۲ — «اجرا → مهر»: بکاپ خودکار از پایگاه (همان نویسندهٔ db-snapshot موتور) →
//             بوت واقعی موتور از نامزد روی پورت/دادهٔ موقت + دروازهٔ سلامت ×۳ و برابری
//             نسخه → فقط در صورت سبزی، «مهر» نوشته و نامزد به‌جای نسخهٔ زنده می‌نشیند
//             (نسخهٔ زندهٔ کهنه به live.retired-<ts> جابه‌جا می‌شود تا برگشت ممکن بماند).
// هر شکست → پاک‌سازی نامزد + پیام فارسی + خروج ۱؛ نسخهٔ زنده و داده دست‌نخورده می‌مانند.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeSnapshot } from '../engine/db-snapshot.mjs';
import { d1SqlitePath } from '../engine/engine-paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);

/** نسخهٔ یک ریشهٔ کد از src/core/version.ts */
export function readVersionOf(root) {
  try {
    return readFileSync(path.join(root, 'src', 'core', 'version.ts'), 'utf8').match(/APP_VERSION = '([^']+)'/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** یک پورت آزاد از هستهٔ سیستم (هم‌الگوی engine.mjs) */
export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * گام «بکاپ خودکار پیش از ارتقا» — همان نویسندهٔ پشتیبان فایل‌سطح موتور (db-snapshot.mjs)
 * با تأیید quick_check و چرخش ۷ تایی. شکست پشتیبان = شکست کل ارتقا (داده مقدس است).
 */
export function preUpdateBackup(dataDir, opts = {}) {
  const dbPath = d1SqlitePath(dataDir);
  if (!existsSync(dbPath)) {
    return { ok: false, message: 'فایل پایگاه یافت نشد — پشتیبان پیش از ارتقا ممکن نشد؛ ارتقا متوقف شد' };
  }
  const snap = takeSnapshot(dbPath, dataDir, { log: opts.log ?? (() => {}) });
  if (!snap.ok) {
    return { ok: false, message: 'پشتیبان پیش از ارتقا تأیید نشد — ارتقا متوقف شد تا داده بی‌پشتیبان جلو نرود' };
  }
  return { ok: true, name: snap.name, path: snap.path, bytes: snap.bytes };
}

/**
 * گام «اجرا» — بوت واقعی موتور از ریشهٔ نامزد + دروازهٔ سلامت ×۳ (هم‌فلسفهٔ
 * update-remote.mjs) و برابری نسخهٔ زندهٔ پروب با نسخهٔ اعلامی نامزد.
 * probeFn تزریق‌پذیر است (آزمون‌ها پروب فیک می‌دهند)؛ پیش‌فرض: بوت واقعی engine.mjs نامزد.
 */
export async function runVerification(candidateRoot, opts = {}) {
  const probe = opts.probeFn ?? ((info) => bootProbe(candidateRoot, info));
  const expected = readVersionOf(candidateRoot);
  const rounds = [];
  for (let round = 1; round <= 3; round += 1) {
    const r = await probe({ round, expectedVersion: expected });
    rounds.push({ round, ok: Boolean(r?.ok), version: r?.version ?? null });
    if (!r?.ok) break;
  }
  const ok = rounds.length === 3 && rounds.every((r) => r.ok) && rounds[2].version === expected;
  return {
    ok,
    rounds,
    expectedVersion: expected,
    message: ok
      ? `نسخهٔ جدید روی موتور واقعی سبز شد (${expected}) — مهر ارتقا صادر می‌شود`
      : 'نسخهٔ جدید دروازهٔ سلامت را نگذراند — به نسخهٔ قبلی برگشتیم؛ گزارش خطای ارتقا را برای پشتیبانی بفرستید'
  };
}

/** پروب واقعی: بوت موتور از ریشهٔ نامزد روی پورت/دادهٔ موقت + خواندن نسخهٔ /health */
async function bootProbe(candidateRoot, info) {
  const { spawnSync } = await import('node:child_process');
  const os = await import('node:os');
  const fsMod = await import('node:fs');
  const engineScript = path.join(candidateRoot, 'scripts', 'engine', 'engine.mjs');
  if (!existsSync(engineScript)) {
    return { ok: false, version: null, detail: `scripts/engine/engine.mjs در نامزد نیست (${candidateRoot})` };
  }
  const port = await freePort();
  const dataDir = fsMod.mkdtempSync(path.join(os.tmpdir(), 'update-verify-'));
  const engineBin = path.join(candidateRoot, 'node_modules', 'workerd', 'bin', 'workerd');
  // پروب سبک: اجرای موتور نامزد با workerdِ نامزد (اگر نبود، workerd مخزن زنده از PATH/repo)
  const env = { ...process.env, CENTER_WORKERD_BIN: existsSync(engineBin) ? engineBin : process.env.CENTER_WORKERD_BIN ?? '' };
  const child = spawn(process.execPath, [engineScript, '--port', String(port), '--data-dir', dataDir], {
    cwd: candidateRoot,
    env,
    stdio: ['ignore', 'ignore', 'ignore']
  });
  let version = null;
  let ok = false;
  try {
    for (let i = 0; i < 60; i += 1) {
      if (child.exitCode !== null) break;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          const j = await res.json().catch(() => null);
          version = j?.version ?? null;
          ok = true;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  } finally {
    child.kill('SIGKILL');
    rmSync(dataDir, { recursive: true, force: true });
  }
  return { ok: ok && (info.expectedVersion === null || version === info.expectedVersion), version };
}

/** نوشتن «مهر» ارتقای تأییدشده — سند بوتِ verified bump در dataDir میز */
export function writeSeal(dataDir, seal) {
  const sealPath = path.join(dataDir, 'update-seal.json');
  writeFileSync(sealPath, JSON.stringify({ ...seal, sealed_at: new Date().toISOString() }, null, 2), 'utf8');
  return sealPath;
}

/** خواندن مهر — برای نمایش/بازرسی */
export function readSeal(dataDir) {
  try {
    return JSON.parse(readFileSync(path.join(dataDir, 'update-seal.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * ارتقای نسخهٔ زنده پس از مهر — کهنه به live.retired-<ts> می‌رود (حذف نمی‌شود)،
 * نامزد جای آن می‌نشیند. هر شکست جابه‌جایی → پیام فارسی، وضعیت نیمه‌تمام نمی‌ماند.
 */
export function promoteCandidate(candidateRoot, liveRoot, opts = {}) {
  const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const retired = `${liveRoot}.retired-${stamp}`;
  if (existsSync(retired)) return { ok: false, message: `پوشهٔ بازنشستهٔ قبلی هم‌نام موجود است: ${retired} — اول آن را جابه‌جا کنید` };
  try {
    renameSync(liveRoot, retired);
    renameSync(candidateRoot, liveRoot);
    return { ok: true, retired, message: `نسخهٔ جدید جایگزین شد — نسخهٔ قبلی در ${retired} نگه‌داری می‌شود` };
  } catch (err) {
    // برگشت وضعیت: نامزد برگردد، زندهٔ کهنه سر جایش
    try {
      if (!existsSync(liveRoot) && existsSync(retired)) renameSync(retired, liveRoot);
    } catch { /* بهترین‌تلاش */ }
    return { ok: false, message: `جابه‌جایی نسخهٔ جدید ناموفق بود: ${err?.message ?? err} — نسخهٔ قبلی سر جایش ماند` };
  }
}

/**
 * ارکستراسیون کامل دو مرحله‌ای — «نصب → اجرا → مهر» با بکاپ خودکار و برگشت امن.
 * probeFn برای آزمون تزریق‌پذیر است. هرگز نسخهٔ زنده را پیش از مهر بازنویسی نمی‌کند.
 */
export async function applyDesktopUpdate(opts = {}) {
  const log = opts.log ?? ((m) => console.log(`[update] ${m}`));
  const candidateRoot = opts.candidateRoot;
  const liveRoot = opts.liveRoot;
  const dataDir = opts.dataDir;
  const dryRun = opts.dryRun === true;

  if (!candidateRoot || !existsSync(candidateRoot)) {
    return { ok: false, phase: 'input', message: 'پوشهٔ نامزد ارتقا یافت نشد — مسیر را بررسی کنید' };
  }
  const fromVersion = readVersionOf(liveRoot);
  const toVersion = readVersionOf(candidateRoot);
  log(`ارتقای میز: ${fromVersion ?? '?'} → ${toVersion ?? '?'} (تأیید دو مرحله‌ای)`);

  // مرحلهٔ ۰ — بکاپ خودکار پیش از هر تغییر (reuse نویسندهٔ پشتیبان موتور)
  const backup = preUpdateBackup(dataDir, { log });
  if (!backup.ok) {
    return { ok: false, phase: 'backup', message: backup.message, fromVersion, toVersion };
  }
  log(`پشتیبان پیش از ارتقا: ${backup.name}`);

  // مرحلهٔ ۱+۲ — اجرای نامزد + دروازهٔ سلامت ×۳
  const verification = await runVerification(candidateRoot, { probeFn: opts.probeFn });
  log(verification.message);
  if (!verification.ok) {
    // برگشت: نامزد استاند بوده و هرگز زنده را بازنویسی نکرده — فقط پاک‌سازی
    if (!opts.keepCandidate) rmSync(candidateRoot, { recursive: true, force: true });
    return {
      ok: false,
      phase: 'verify',
      message: 'ارتقا تأیید سلامت را نگذراند — به نسخهٔ قبلی برگشتیم؛ داده‌های شما دست‌نخورده ماند',
      verification,
      fromVersion,
      toVersion,
      backup: backup.name
    };
  }

  // مهر — پس از گذر دروازه؛ سپس جایگزینی
  const seal = {
    from_version: fromVersion,
    to_version: toVersion,
    verified: true,
    health_rounds: verification.rounds,
    backup: backup.name
  };
  if (dryRun) {
    return { ok: true, phase: 'dry-run', seal, message: 'dry-run — مهر و جایگزینی انجام نشد', verification };
  }
  const sealPath = writeSeal(dataDir, seal);
  log(`مهر ارتقا نوشته شد: ${sealPath}`);
  if (liveRoot && existsSync(liveRoot)) {
    const promote = promoteCandidate(candidateRoot, liveRoot);
    if (!promote.ok) return { ok: false, phase: 'promote', message: promote.message, sealPath, fromVersion, toVersion };
    log(promote.message);
    return { ok: true, phase: 'done', sealPath, retired: promote.retired, fromVersion, toVersion };
  }
  return { ok: true, phase: 'sealed-only', sealPath, fromVersion, toVersion, message: 'مهر نوشته شد — liveRoot داده نشد تا جایگزینی انجام شود' };
}

/* اجرای مستقیم به‌عنوان CLI */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const argOf = (name) => {
    const i = args.indexOf(name);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };
  const candidateRoot = argOf('--candidate');
  const liveRoot = argOf('--live');
  const dataDir = argOf('--data-dir') ?? path.join(ROOT, 'engine-data');
  const dryRun = args.includes('--dry-run');
  applyDesktopUpdate({ candidateRoot, liveRoot, dataDir, dryRun })
    .then((r) => {
      console.log(`[update] نتیجه: ${r.ok ? 'سبز' : 'سرخ'} — فاز: ${r.phase}`);
      console.log(`[update] ${r.message}`);
      if (!r.ok) process.exit(1);
    })
    .catch((err) => {
      console.error(`[update] خطای ناگهانی: ${err?.message ?? err}`);
      process.exit(1);
    });
}
