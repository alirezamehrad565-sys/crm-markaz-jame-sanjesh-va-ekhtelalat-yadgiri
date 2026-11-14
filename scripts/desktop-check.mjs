#!/usr/bin/env node
// گیت ساختار دسکتاپ (فاز ۱) — سلامت scaffold خط rust بدون نیاز به toolchain Rust
// استفاده: node scripts/desktop-check.mjs   (npm run desktop:check)
// بررسی‌ها: فایل‌های الزامی، پارس JSON/Cargo، هم‌گامی نسخه با APP_VERSION،
// آیکن واقعی (سربرگ ICO)، capabilities، اسکریپت‌های npm، gitignore بیلد.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PINNED_WORKERD_VERSION } from './desktop/config.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const T = path.join(ROOT, 'desktop', 'src-tauri');
const lines = [];
let failed = false;
const ok = (msg) => lines.push(`✓ ${msg}`);
const bad = (msg) => { failed = true; lines.push(`✗ ${msg}`); };
const mustExist = (p, label) => existsSync(p) ? ok(`${label} موجود است`) : bad(`${label} یافت نشد: ${p}`);

// ① فایل‌های الزامی اسکلت
for (const rel of [
  'desktop/src-tauri/tauri.conf.json', 'desktop/src-tauri/Cargo.toml', 'desktop/src-tauri/build.rs',
  'desktop/src-tauri/src/main.rs', 'desktop/src-tauri/src/lib.rs',
  'desktop/src-tauri/capabilities/default.json', 'desktop/src-tauri/icons/icon.ico',
  'desktop/src-tauri/icons/icon.png', 'desktop/README.md', 'docs/rust/design.md', 'docs/rust/phases.md'
]) mustExist(path.join(ROOT, rel), rel);

// ② هم‌گامی نسخه — یک شماره، یک حقیقت (D7 design.md)
const appVersion = readFileSync(path.join(ROOT, 'src', 'core', 'version.ts'), 'utf8')
  .match(/APP_VERSION = '([^']+)'/)?.[1];
let conf = null;
try {
  conf = JSON.parse(readFileSync(path.join(T, 'tauri.conf.json'), 'utf8'));
  conf.version === appVersion
    ? ok(`نسخهٔ tauri.conf.json هم‌گام است (${appVersion})`)
    : bad(`نسخهٔ tauri.conf.json (${conf.version}) با APP_VERSION (${appVersion}) هم‌گام نیست`);
} catch { bad('tauri.conf.json پارس نشد'); }
const cargo = readFileSync(path.join(T, 'Cargo.toml'), 'utf8');
const cargoVer = cargo.match(/^version = "([^"]+)"/m)?.[1];
cargoVer === appVersion
  ? ok('نسخهٔ Cargo.toml هم‌گام است')
  : bad(`نسخهٔ Cargo.toml (${cargoVer}) با APP_VERSION (${appVersion}) هم‌گام نیست`);

// ③ قراردادهای فاز ۲ + v1.26.0 — صفحهٔ بوت و productName ASCII
if (conf) {
  conf.build?.frontendDist === 'boot-dist'
    ? ok('frontendDist = boot-dist (صفحهٔ بوت — v1.26.0)')
    : bad('frontendDist باید boot-dist باشد (صفحهٔ بوت؛ سایت از resources سرو می‌شود)');
  const prod = typeof conf.productName === 'string' ? conf.productName : '';
  /^[\x20-\x7E]+$/.test(prod) && prod.length > 0
    ? ok(`productName ASCII است (${prod}) — مسیر نصب یونیکد workerd را می‌کشد`)
    : bad(`productName باید ASCII باشد — فعلی: «${prod}»`);
  conf.build?.devUrl === 'http://127.0.0.1:8787'
    ? ok('devUrl = loopback:8787')
    : bad('devUrl باید http://127.0.0.1:8787 باشد');
  conf.bundle?.targets?.includes('nsis')
    ? ok('هدف بسته‌بندی NSIS فعال است')
    : bad('NSIS در bundle.targets نیست');
}
existsSync(path.join(ROOT, 'public', 'index.html'))
  ? ok('خروجی کلاینت (public/index.html) حاضر است')
  : bad('public/index.html نیست — build:client را اجرا کنید');
mustExist(path.join(ROOT, 'desktop/src-tauri/boot-dist/index.html'), 'صفحهٔ بوت boot-dist/index.html');
try {
  const boot = readFileSync(path.join(ROOT, 'desktop', 'src-tauri', 'boot-dist', 'index.html'), 'utf8');
  boot.includes('desktop_status') && boot.includes('engine_retry')
    ? ok('صفحهٔ بوت: قرارداد desktop_status/engine_retry سیم است')
    : bad('صفحهٔ بوت: فرمان‌های desktop_status/engine_retry در آن نیست');
  boot.includes('پیام به سازنده')
    ? ok('صفحهٔ بوت: کنش «پیام به سازنده» هست')
    : bad('صفحهٔ بوت: کنش «پیام به سازنده» غایب است');
  // v1.27.01 — فونت وزیر باید در خود صفحهٔ بوت باندل باشد (نه Tahoma خام و نه CDN آنلاین)
  boot.includes('@font-face') && boot.includes('Vazirmatn') && boot.includes('fonts/vazirmatn-fa-regular.woff2')
    ? ok("صفحهٔ بوت: فونت وزیر متن (@font-face محلی) سیم است")
    : bad('صفحهٔ بوت: فونت وزیر در صفحهٔ بوت نیست — فونت خام Tahoma ممنوع');
  for (const f of ['vazirmatn-fa-regular.woff2', 'vazirmatn-fa-bold.woff2']) {
    existsSync(path.join(ROOT, 'desktop', 'src-tauri', 'boot-dist', 'fonts', f))
      ? ok(`صفحهٔ بوت: فونت ${f} باندل شده`)
      : bad(`صفحهٔ بوت: فونت ${f} در boot-dist/fonts نیست`);
  }
} catch { bad('صفحهٔ بوت خوانده نشد'); }

// ④ آیکن واقعی (سربرگ ICO: 00 00 01 00) و حجم معنادار
try {
  const ico = readFileSync(path.join(T, 'icons', 'icon.ico'));
  const magic = ico[0] === 0 && ico[1] === 0 && ico[2] === 1 && ico[3] === 0;
  magic && ico.length > 500
    ? ok(`icon.ico معتبر است (${ico.length}B)`)
    : bad(`icon.ico نامعتبر — magic=${magic} size=${ico.length}`);
} catch { bad('icon.ico خوانده نشد'); }

// ⑤ capabilities — پنجرهٔ main + هستهٔ مجوزها
try {
  const cap = JSON.parse(readFileSync(path.join(T, 'capabilities', 'default.json'), 'utf8'));
  cap.windows?.includes('main') && cap.permissions?.includes('core:default')
    ? ok('capabilities پیش‌فرض درست است')
    : bad('capabilities: پنجرهٔ main یا core:default غایب است');
} catch { bad('capabilities/default.json پارس نشد'); }

// ⑥ اسکریپت‌های npm + gitignore بیلد Rust
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
pkg.scripts?.['desktop:check']
  ? ok('npm run desktop:check سیم‌کشی شده است')
  : bad('اسکریپت desktop:check در package.json نیست');
const gitignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
gitignore.includes('desktop/src-tauri/target/')
  ? ok('gitignore بیلد Rust را پوشش می‌دهد')
  : bad('.gitignore شامل desktop/src-tauri/target/ نیست');

// ⑦ rust-f13 + v1.27.۰۳ — رانتایم نصاب: سایدکار node پین‌شده + باندل engine-server + بوت lib.rs
// (workerd فقط موتور «توسعه» است — در نصاب دیگر هیچ نقشی ندارد)
try {
  const installedW = JSON.parse(readFileSync(path.join(ROOT, 'node_modules', 'workerd', 'package.json'), 'utf8')).version;
  installedW === PINNED_WORKERD_VERSION
    ? ok(`pin موتور توسعهٔ workerd هم‌گام است (${PINNED_WORKERD_VERSION})`)
    : bad(`pin workerd (${PINNED_WORKERD_VERSION}) با مخزن (${installedW}) ناهم‌گام است — npm i`);
  conf?.bundle?.externalBin?.includes('binaries/node')
    ? ok('externalBin = binaries/node در tauri.conf (موتور دسکتاپ = سایدکار node)')
    : bad('externalBin باید binaries/node باشد');
  conf?.bundle?.externalBin?.includes('binaries/workerd')
    ? bad('externalBin هنوز workerd دارد — موتور دسکتاپ باید node باشد')
    : ok('externalBin فاقد workerd است — باینری بومی کرش‌ساز از نصاب حذف شد');
  conf?.bundle?.resources?.includes('resources/engine/**/*')
    ? ok('resources = resources/engine/**/* در tauri.conf')
    : bad('resources = resources/engine/**/* در tauri.conf نیست');
  // v1.27.۰۵ — manifest رانتایم باید داخل resources/engine نوشته شود (با glob resources شحنه
  // می‌شود) و مونتاژ باید فیلدهای engineServer و nodeVersion را بنویسد — PRECHECK پوستهٔ Rust
  // (engine.rs) در بوت هش سه فایل رانتایم و نسخهٔ سایدکار node را با این فیلدها تطبیق می‌دهد.
  const cfgSrc = readFileSync(path.join(ROOT, 'scripts', 'desktop', 'config.mjs'), 'utf8');
  cfgSrc.includes("manifest: path.join(tauri, RESOURCES_ENGINE_DIR, MANIFEST_NAME)")
    ? ok('config.mjs: manifest داخل resources/engine نوشته می‌شود — نصاب آن را شحنه می‌کند')
    : bad('config.mjs: manifest بیرون resources/engine است — نصب‌شده نمی‌تواند هش رانتایم را تطبیق دهد');
  const birSrc = readFileSync(path.join(ROOT, 'scripts', 'desktop', 'build-installer-runtime.mjs'), 'utf8');
  birSrc.includes('engineServer') && birSrc.includes('sha256(engineServerDst)')
    ? ok('مونتاژ رانتایم: هش engineServer در manifest ثبت می‌شود')
    : bad('مونتاژ رانتایم: فیلد engineServer.sha256 در manifest نوشته نمی‌شود');
  birSrc.includes('nodeVersion: PINNED_NODE_VERSION')
    ? ok('مونتاژ رانتایم: nodeVersion در manifest ثبت می‌شود (تطبیق نسخهٔ سایدکار در PRECHECK)')
    : bad('مونتاژ رانتایم: فیلد nodeVersion در manifest نوشته نمی‌شود');
  mustExist(path.join(ROOT, 'scripts', 'desktop', 'build-installer-runtime.mjs'), 'build-installer-runtime.mjs');
  const libSrc = readFileSync(path.join(T, 'src', 'lib.rs'), 'utf8');
  for (const t of ['EngineLaunch', 'd1-seed', 'CENTER_ENGINE_REPO', 'engine-server.js']) {
    libSrc.includes(t) ? ok(`lib.rs: ${t} سیم است`) : bad(`lib.rs: ${t} غایب است`);
  }
  libSrc.includes('engine.log') ? ok('lib.rs: دم لاگ engine.log سیم است') : bad('lib.rs: نام لاگ engine.log نیست');
  for (const t of ['desktop_status', 'engine_retry', 'open_data_dir']) {
    libSrc.includes(t) ? ok(`فرمان ${t} در lib.rs سیم است`) : bad(`فرمان ${t} در lib.rs نیست`);
  }
  libSrc.includes('EnginePhase::Failed')
    ? ok('وضعیت صریح Failed{message, log_tail} در lib.rs هست')
    : bad('وضعیت صریح بوت (EnginePhase::Failed) در lib.rs نیست');
  existsSync(path.join(T, 'src', 'cf_deploy.rs'))
    ? ok('cf_deploy.rs (ماژول کلادفلر) موجود است')
    : bad('cf_deploy.rs نیست — ماژول کلادفلر v1.26.0 غایب است');
  const engineSrc = readFileSync(path.join(T, 'src', 'engine.rs'), 'utf8');
  // v1.27.۰۴ — قرارداد spawn ضد-EISDIR: main نسبی + cwd صریح + پیش‌بازرسی + لاگ خط فرمان
  for (const t of ['find_node_binary', 'engine-config.json', 'engine.log', '--engine', 'adapter', 'CREATE_NO_WINDOW', 'current_dir', 'Result<PathBuf, String>', 'نصب رانتایم ناقص']) {
    engineSrc.includes(t) ? ok(`engine.rs: ${t.replace('Result<PathBuf, String>', 'find_node_binary → Result')} سیم است`) : bad(`engine.rs: ${t} غایب است`);
  }
  const libSrcAll = libSrc;
  libSrcAll.includes('find_node_binary()?')
    ? ok('lib.rs: خطای find_node_binary صریح به کاربر می‌رسد (?)')
    : bad('lib.rs: خروجی Result از find_node_binary مصرف نشده');
  const wf = readFileSync(path.join(ROOT, '.github', 'workflows', 'desktop-build.yml'), 'utf8');
  wf.includes('build-installer-runtime.mjs')
    ? ok('گردش‌کار CI گام مونتاژ رانتایم نصاب را دارد')
    : bad('گردش‌کار CI گام مونتاژ رانتایم نصاب را ندارد');
  gitignore.includes('desktop/src-tauri/binaries/') && gitignore.includes('desktop/src-tauri/resources/')
    ? ok('gitignore خروجی‌های رانتایم نصاب را پوشش می‌دهد')
    : bad('.gitignore خروجی‌های رانتایم نصاب را پوشش نمی‌دهد');
} catch (e) {
  bad(`بخش rust-f13 خطا داد: ${e instanceof Error ? e.message : String(e)}`);
}

// ⑧ v1.27.۰۳ — موتور درون‌پروسه‌ای (adapter): shim D1 روی node:sqlite + سرورهای HTTP در همین
// فرایند + قرارداد engine-config.json — ریشهٔ کرش ویندوزی (باینری بومی workerd) از مسیر حذف شد.
try {
  mustExist(path.join(ROOT, 'scripts/engine/adapter/server.mjs'), 'adapter/server.mjs');
  mustExist(path.join(ROOT, 'scripts/engine/adapter/d1.mjs'), 'adapter/d1.mjs');
  const d1 = readFileSync(path.join(ROOT, 'scripts', 'engine', 'adapter', 'd1.mjs'), 'utf8');
  for (const t of ["from 'node:sqlite'", 'DatabaseSync', 'prepare(', 'batch(', 'exec(', 'last_row_id']) {
    d1.includes(t) ? ok(`d1.mjs: ${t.replace("'node:sqlite'", 'node:sqlite')} سیم است`) : bad(`d1.mjs: ${t} غایب است`);
  }
  const srv = readFileSync(path.join(ROOT, 'scripts', 'engine', 'adapter', 'server.mjs'), 'utf8');
  for (const t of ['startAdapterEngine', 'serveStatic', 'createServer', "listen(p, '127.0.0.1'", 'CLINIC_NAME', 'AUTH_SECRET']) {
    srv.includes(t) ? ok(`server.mjs: ${t} سیم است`) : bad(`server.mjs: ${t} غایب است`);
  }
  const em = readFileSync(path.join(ROOT, 'scripts', 'engine', 'engine.mjs'), 'utf8');
  for (const t of ["--engine adapter", 'engine-config.json', 'respawnAdapter', 'startAdapterEngine']) {
    em.includes(t) ? ok(`engine.mjs: ${t} سیم است`) : bad(`engine.mjs: ${t} غایب است`);
  }
  const am = readFileSync(path.join(ROOT, 'scripts', 'engine', 'apply-migrations.mjs'), 'utf8');
  am.includes('existsSync(dir)')
    ? ok('apply-migrations: نبود پوشهٔ migrations در نصاب تحمل می‌شود (d1-seed از پیش مایگریت است)')
    : bad('apply-migrations بدون پوشهٔ migrations می‌میرد — نصاب بوت نمی‌شود');
  mustExist(path.join(ROOT, 'scripts/engine/engine-server.js'), 'باندل engine-server.js');
  const es = readFileSync(path.join(ROOT, 'scripts', 'engine', 'engine-server.js'), 'utf8');
  es.includes('startAdapterEngine') && es.includes('engine-config.json')
    ? ok('باندل engine-server موتور adapter را در خود دارد')
    : bad('باندل engine-server کهنه است — build:engine-server را دوباره بزنید');
  // v1.27.۰۵ — تک‌بوت: گارد «اجرای مستقیم» engine.mjs در باندل باید خاموش باشد؛ وگرنه در posix
  // file://argv[1] با import.meta.url باندل تصادفی برابر می‌شود و runEngine دو بار می‌گشت
  // (دو موتور در یک پروسه — یافتهٔ installer-sim؛ روی ویندوز ورود بی‌شرط تنها بوت‌کننده است).
  const bes = readFileSync(path.join(ROOT, 'scripts', 'build-engine-server.mjs'), 'utf8');
  em.includes("typeof IS_ENGINE_BUNDLE === 'undefined'") && bes.includes("IS_ENGINE_BUNDLE: 'true'")
    ? ok('تک‌بوت: گارد اجرای مستقیم در باندل با IS_ENGINE_BUNDLE خاموش می‌شود')
    : bad('تک‌بوت: قرارداد IS_ENGINE_BUNDLE سیم نیست — باندل posix دو موتور می‌سازد');
  const smoke = readFileSync(path.join(ROOT, 'scripts', 'engine', 'engine-smoke.mjs'), 'utf8');
  smoke.includes('SMOKE_ENGINE') && smoke.includes('--engine')
    ? ok('engine-smoke: گیت دوهاته workerd/adapter سیم است')
    : bad('engine-smoke: حالت adapter سیم نیست');
} catch (e) {
  bad(`گیت adapter خطا داد: ${e instanceof Error ? e.message : String(e)}`);
}

// ⑨ v1.27.۰۳ — نصاب: سایدکار node از nodejs.org رسمی + حذف قطعی redist و هوک VC++
// (گزارش کارفرما: redist سیستمش 14.52 تازه‌تر از نسخهٔ بسته بود — دانگرید رد شد؛ کرش هم
// باقی بود → راه‌حل درست حذف وابستگی بومی بود نه تعویض redist)
try {
  const bir = readFileSync(path.join(ROOT, 'scripts', 'desktop', 'build-installer-runtime.mjs'), 'utf8');
  bir.includes('nodejs.org/dist/') && bir.includes('PINNED_NODE_VERSION') && bir.includes('nodeSidecarFileName')
    ? ok('دانلود سایدکار node از dist رسمی در مونتاژ رانتایم سیم است')
    : bad('دانلود سایدکار node در build-installer-runtime نیست');
  bir.includes('engine-server.js') && bir.includes("bundlesDir")
    ? ok('کپی engine-server + باندل‌های ورکر در مونتاژ رانتایم سیم است')
    : bad('کپی engine-server/باندل‌ها در مونتاژ رانتایم نیست');
  bir.includes('vc_redist') || bir.includes('aka.ms')
    ? bad('مونتاژ رانتایم هنوز redist دارد — باید حذف شده باشد')
    : ok('redist از مونتاژ رانتایم حذف شده است');
  existsSync(path.join(T, 'installer-hooks.nsh'))
    ? bad('installer-hooks.nsh باید حذف شده باشد (نصب VC++ دیگر معنا ندارد)')
    : ok('هوک VC++ حذف شده است');
  conf?.bundle?.windows?.nsis?.installerHooks
    ? bad('tauri.conf هنوز installerHooks دارد')
    : ok('tauri.conf فاقد installerHooks است');
  conf?.bundle?.resources?.some((r) => r.includes('redist'))
    ? bad('tauri.conf هنوز resources/redist دارد')
    : ok('resources/redist از tauri.conf حذف شده است');
  const libSrc3 = readFileSync(path.join(T, 'src', 'lib.rs'), 'utf8');
  libSrc3.includes('boot_failure_message') && libSrc3.includes('engine.log')
    ? ok('پیام شکست بوت راهنمای engine.log می‌دهد')
    : bad('پیام شکست بوت به engine.log ارجاع ندارد');
} catch (e) {
  bad(`گیت سایدکار node خطا داد: ${e instanceof Error ? e.message : String(e)}`);
}

// ⑩ v1.27.۰۵ — گیت قرارداد مسیر رانتایم: تیپل نصاب lib.rs ↔ مونتاژ (کلاس خطای نسخهٔ بستهٔ ۱.۲۷.۰۴).
// ریشهٔ آن خطا: شاخهٔ نصاب lib.rs دنبال central/worker.js و central/games.js بود در حالی که
// مونتاژ باندل‌های موتور را در bundles/ می‌گذارد — و هیچ آزمونی این قرارداد را نمی‌پوشاند.
// از این پس: پین رشته‌ای دو سمت + شبیه‌ساز بوت که مسیرها را از خود lib.rs استخراج می‌کند
// (installer-sim.mjs) — هر ناهم‌گامی آینده همین‌جا قرمز می‌شود، نه روی ماشین کارفرما.
try {
  const libSrc5 = readFileSync(path.join(T, 'src', 'lib.rs'), 'utf8');
  // کامنت‌های تاریخی (مثل شرح خطای ۱.۲۷.۰۴) مسیرهای کهنه را یاد می‌کنند — فقط کد باید سنجیده شود
  const libCode5 = libSrc5.replace(/\/\/[^\n]*/g, '');
  libCode5.includes('engine_res.join("bundles/worker.js")') && libCode5.includes('engine_res.join("bundles/games.js")')
    ? ok('lib.rs: تیپل نصاب به bundles/ اشاره می‌کند (هم‌گام با مونتاژ)')
    : bad('lib.rs: تیپل نصاب bundles/ را ندارد — رگرسیون ۱.۲۷.۰۴');
  libCode5.includes('central/worker.js') || libCode5.includes('central/games.js')
    ? bad('lib.rs: هنوز مسیر central/ برای باندل‌های موتور دارد — عین خطای ۱.۲۷.۰۴')
    : ok('lib.rs: هیچ مسیر central/ برای باندل‌های موتور باقی نیست');
  const bir5 = readFileSync(path.join(ROOT, 'scripts', 'desktop', 'build-installer-runtime.mjs'), 'utf8');
  bir5.includes("path.join(bundlesDir, 'worker.js')") && bir5.includes("path.join(bundlesDir, 'games.js')")
    ? ok('مونتاژ رانتایم مقصد bundles/ را دارد (هم‌گام با تیپل lib.rs)')
    : bad('مونتاژ رانتایم مقصد bundles/ ندارد — با تیپل lib.rs ناهم‌گام است');
  const sim = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'desktop', 'installer-sim.mjs')], {
    cwd: ROOT, encoding: 'utf8', timeout: 120_000,
  });
  const simOut = `${sim.stdout || ''}${sim.stderr || ''}`;
  for (const l of simOut.split('\n')) {
    if (l.startsWith('✗ ')) { failed = true; lines.push(l); }
    else if (l.startsWith('✓ ') || l.startsWith('… ')) lines.push(l);
  }
  sim.status === 0
    ? ok('شبیه‌ساز نصاب: بوت با تیپل واقعی lib.rs موفق بود')
    : bad(`شبیه‌ساز نصاب قرمز است (exit=${sim.status}) — قرارداد مسیر lib.rs ↔ مونتاژ شکسته است`);
} catch (e) {
  bad(`گیت قرارداد رانتایم خطا داد: ${e instanceof Error ? e.message : String(e)}`);
}

lines.push(failed ? '❌ گیت ساختار دسکتاپ قرمز است' : '✅ گیت ساختار دسکتاپ سبز است');
writeFileSync('/tmp/desktop-check-report.txt', lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exit(failed ? 1 : 0);
