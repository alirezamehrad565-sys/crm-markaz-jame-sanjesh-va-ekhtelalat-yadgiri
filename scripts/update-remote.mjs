#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import readline from 'node:readline/promises';

const DB_NAME = 'center-system-db';
const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000';
const WRANGLER_TOML = 'wrangler.toml';
const BACKUP_DIR = 'backups';

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const YES = args.has('--yes');
const BACKUP_ONLY = args.has('--backup-only');
const SKIP_BACKUP = args.has('--skip-backup');

function section(title) {
  console.log(`\n${'─'.repeat(64)}\n▶ ${title}\n${'─'.repeat(64)}`);
}

function run(cmd, cmdArgs) {
  if (DRY) {
    console.log(`   [dry-run] ${cmd} ${cmdArgs.join(' ')}`);
    return { status: 0 };
  }
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
  return { status: r.status ?? 1 };
}

function runCapture(cmd, cmdArgs) {
  try {
    const out = execFileSync(cmd, cmdArgs, {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 120_000
    });
    return out;
  } catch {
    return '';
  }
}

async function confirm(question) {
  if (YES || DRY) return true;
  const a = (await rl().question(`   ${question} (y/n) `)).trim().toLowerCase();
  return a === '' || a === 'y' || a === 'yes' || a === 'ب' || a === 'بله';
}

let _rl = null;
function rl() {
  if (!_rl) _rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return _rl;
}

function fail(msg) {
  console.error(`\n✋ ${msg}`);
  process.exit(1);
}

section('گام ۰ — پیش‌پرواز');

const root = process.cwd();
if (!existsSync(join(root, WRANGLER_TOML))) {
  fail('wrangler.toml پیدا نشد — این اسکریپت باید از ریشهٔ پوشهٔ باندل اجرا شود.');
}

const tomlText = readFileSync(join(root, WRANGLER_TOML), 'utf8');
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
let appVersion = pkgVersion;
try {
  const v = readFileSync(join(root, 'src/core/version.ts'), 'utf8');
  appVersion = v.match(/APP_VERSION = '([^']+)'/)?.[1] ?? pkgVersion;
} catch { /* فایل نسخه اختیاری است */ }
if (appVersion !== pkgVersion) {
  console.log(`⚠ هشدار: نسخهٔ src/core/version.ts (${appVersion}) با package.json (${pkgVersion}) یکی نیست — از version.ts استفاده می‌شود.`);
}
console.log(`   نسخهٔ این باندل: ${appVersion}`);

const whoami = DRY ? '' : runCapture('npx', ['wrangler', 'whoami']);
if (!DRY && !whoami.includes('You are logged')) {
  fail('به Cloudflare وارد نیستید — اول «npx wrangler login» را اجرا کنید و دوباره بیایید.');
}
console.log('   ورود Cloudflare: ✓');

// ساخت باندل کلاینت (boot.[hash] + چانک‌های نما): باید پیش از گات بودجه و انتشار تازه باشد
if (existsSync(join(root, 'scripts', 'build-client.mjs'))) {
  const build = run('node', [join(root, 'scripts', 'build-client.mjs')]);
  if (build.status !== 0) {
    fail('ساخت باندل کلاینت شکست خورد — خطای esbuild را ببینید (فرار اضطراری نیست؛ خطا را درست کنید).');
  }
}

// گات بودجهٔ کارایی: پیل بوت/CSS/فونت باید زیر سقف scripts/perf-budget.json بماند
if (args.has('--skip-perf')) {
  console.log('   (--skip-perf) گات بودجهٔ کارایی رد شد — ریسک با شماست.');
} else if (existsSync(join(root, 'scripts', 'perf-budget.mjs'))) {
  const perf = run('node', [join(root, 'scripts', 'perf-budget.mjs')]);
  if (perf.status !== 0) {
    fail('گات بودجهٔ کارایی قرمز شد — سقف‌ها را در scripts/perf-budget.json ببینید (فرار اضطراری: --skip-perf).');
  }
} else {
  console.log('   اسکریپت بودجهٔ کارایی در مخزن نیست — رد شد.');
}

let dbId = tomlText.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ?? '';
if (DRY && (dbId === PLACEHOLDER_ID || dbId === '')) {
  console.log('   [dry-run] database_id جای‌نگهدار است — در اجرای واقعی از حساب Cloudflare پیدا و درج می‌شد.');
} else if (dbId === PLACEHOLDER_ID || dbId === '') {
  console.log('   database_id در wrangler.toml جای‌نگهدار است — از حساب Cloudflare پرسیده می‌شود…');
  const listRaw = DRY ? '' : runCapture('npx', ['wrangler', 'd1', 'list', '--json']);
  const found = listRaw.match(/\{[^{}]*"name"\s*:\s*"center-system-db"[^{}]*\}/)?.[0];
  const uuid = found?.match(/"uuid"\s*:\s*"([0-9a-f-]{36})"/i)?.[1];
  if (!uuid) {
    fail([
      'دیتابیس center-system-db در این حساب پیدا نشد.',
      '   • اگر تازه حساب عوض کرده‌اید، اول دیتابیس را بسازید: npx wrangler d1 create center-system-db',
      '   • یا database_id واقعی را دستی داخل wrangler.toml بگذارید.'
    ].join('\n'));
  }
  if (DRY) {
    console.log(`   [dry-run] database_id = ${uuid} در wrangler.toml درج می‌شد.`);
  } else {
    writeFileSync(join(root, WRANGLER_TOML), tomlText.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${uuid}"`), 'utf8');
    console.log(`   database_id واقعی درج شد: ${uuid} ✓`);
  }
  dbId = uuid;
} else {
  console.log(`   database_id: ✓ (${dbId.slice(0, 8)}…`);
}

const pendingRaw = DRY ? '' : runCapture('npx', ['wrangler', 'd1', 'migrations', 'list', DB_NAME, '--remote']);
if (DRY) {
  console.log('   [dry-run] فهرست مایگریشن‌های در انتظار از Cloudflare پرسیده می‌شد.');
} else {
  const hasPending = !/no pending migrations/i.test(pendingRaw) && pendingRaw.includes('.sql');
  if (!hasPending) {
    console.log('   مایگریشن‌های در انتظار: هیچ — پایگاه دادهٔ تولید به‌روز است ✓');
  } else {
    const pendingNames = [...pendingRaw.matchAll(/\d{4}_[a-z0-9_]+\.sql/gi)].map((m) => m[0]);
    console.log(`   مایگریشن‌های در انتظار اعمال روی تولید: ${pendingNames.length || '?'}`);
    pendingNames.forEach((n) => console.log(`     • ${n}`));
  }
}

if (BACKUP_ONLY) {
  section('حالت backup-only — فقط پشتیبان‌گیری');
} else {
  section('گام ۱ — پشتیبان‌گیری دیتابیس تولید');
}
if (SKIP_BACKUP && !BACKUP_ONLY) {
  console.log('   (--skip-backup) پشتیبان رد شد — ریسک با شماست.');
} else {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = join(BACKUP_DIR, `backup-${stamp}.sql`);
  if (!DRY) mkdirSync(join(root, BACKUP_DIR), { recursive: true });
  console.log(`   مقصد: ${backupPath}`);
  const r = run('npx', ['wrangler', 'd1', 'export', DB_NAME, '--remote', '--output', backupPath]);
  if (r.status !== 0) {
    fail('پشتیبان‌گیری ناموفق بود. برای حفاظت داده‌ها ادامهٔ چرخه متوقف شد.\n   • دسترسی/شبکه را چک کنید و دوباره تلاش کنید، یا با --skip-backup رد شوید (توصیه نمی‌شود).');
  }
  console.log('   پشتیبان‌گیری: ✓');
}
if (BACKUP_ONLY) {
  console.log('\n✅ پشتیبان‌گیری تمام شد.');
  process.exit(0);
}

section('گام ۲ — اعمال مایگریشن‌های دیتابیس (فقط جدیدها)');
console.log('   جدول d1_migrations مایگریشن‌های اعمال‌شده را ردیابی می‌کند؛');
console.log('   بنابراین این گام روی پایگاهِ به‌روز عملاً هیچ‌کاری نمی‌کند — امن است.');
if (!(await confirm('مایگریشن‌های جدید اعمال شود؟'))) {
  fail('کاربر متوقف کرد — دیتابیس دست‌نخورده ماند.');
}
console.log('   (توجه: wrangler ممکن است خودش یک تأیید بپرسد — y بزنید)');
if (run('npx', ['wrangler', 'd1', 'migrations', 'apply', DB_NAME, '--remote']).status !== 0) {
  fail('مایگریشن ناموفق بود — دیتابیس را دستکاری نکنید؛ از فایل پشتیبان بخش قبل می‌توان بازیابی کرد. خطا را برای تحلیل برای من بفرستید.');
}
console.log('   مایگریشن: ✓');

section('گام ۳ — انتشار نسخهٔ جدید Worker');
if (!(await confirm('نسخهٔ جدید منتشر شود (wrangler deploy)؟'))) {
  fail('کاربر متوقف کرد — انتشار انجام نشد.');
}

const deployOut = DRY ? '' : (() => {
  const r = spawnSync('npx', ['wrangler', 'deploy', '--var', 'ENV:production'], {
    stdio: ['inherit', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
    encoding: 'utf8'
  });
  return r.status === 0 ? (r.stdout ?? '') : null;
})();
if (DRY) {
  console.log('   [dry-run] npx wrangler deploy --var ENV:production');
} else if (deployOut === null) {
  fail('deploy ناموفق بود — خروجی wrangler را بررسی کنید (معمولاً مشکل شبکه یا سهمیه است).');
} else {
  console.log('   deploy: ✓');
}

section('گام ۴ — تأیید استقرار (GET /health)');
const publicBase = tomlText.match(/PUBLIC_BASE_URL\s*=\s*"([^"]+)"/)?.[1] ?? '';
const deployedUrl = deployOut.match(/https:\/\/[a-z0-9-]+\.workers\.dev/i)?.[0] ?? '';
const baseUrl = publicBase || deployedUrl;
if (!baseUrl) {
  console.log('   آدرس عمومی پیدا نشد — دستی چک کنید:');
  console.log(`   curl https://<دامنه-ورکر>/health   → باید version: "${appVersion}" بدهد`);
} else {
  const url = `${baseUrl.replace(/\/$/, '')}/health`;
  console.log(`   پرس‌وجو: ${url}`);
  if (DRY) {
    console.log('   [dry-run] درخواست سلامت اجرا نمی‌شود.');
  } else {
    let ok = false, body = '';
    for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 1 ? 2000 : 5000));
      try {
        const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
        body = await res.text();
        ok = res.ok;
      } catch { ok = false; }
    }
    if (!ok) {
      console.log('   ⚠ /health پاسخ نداد — اغلب تأخیر شبکه است؛ ۳۰ ثانیه بعد دستی چک کنید:');
      console.log(`     curl ${url}`);
    } else {
      const live = body.match(/"version"\s*:\s*"([^"]+)"/)?.[1] ?? '?';
      if (live === appVersion) {
        console.log(`   ✅ نسخهٔ زنده: ${live} — به‌روزرسانی با موفقیت نشست.`);
      } else {
        console.log(`   ⚠ نسخهٔ زنده (${live}) با باندل (${appVersion}) یکی نیست —`);
        console.log('     اگر چند ثانیه قبل deploy شده، کش edge را صبر کنید؛ اگر ماند، deploy را دوباره اجرا کنید.');
      }
    }
  }
}

section('جمع‌بندی');
console.log(`   • نسخهٔ باندل: ${appVersion} — دامنه: ${baseUrl || '<دامنهٔ ورکر>'}`);
console.log('   • بازگشت کد (rollback): باندل قبلی را باز کنید و فقط «npx wrangler deploy --var ENV:production» بزنید.');
console.log(`   • بازگشت دیتابیس: فایل پشتیبان در ${BACKUP_DIR}/ — پیش از بازیابی برای من بنویسید تا راهنمایی کنم.`);
console.log('   • چک‌لیست کامل: docs/UPDATE.md');
