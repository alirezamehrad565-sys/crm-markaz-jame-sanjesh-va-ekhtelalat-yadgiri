#!/usr/bin/env node
// گیت ساختار دسکتاپ (فاز ۱) — سلامت scaffold خط rust بدون نیاز به toolchain Rust
// استفاده: node scripts/desktop-check.mjs   (npm run desktop:check)
// بررسی‌ها: فایل‌های الزامی، پارس JSON/Cargo، هم‌گامی نسخه با APP_VERSION،
// آیکن واقعی (سربرگ ICO)، capabilities، اسکریپت‌های npm، gitignore بیلد.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
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
  // M4 — سلامت مستقل Games Worker: پروب جداگانهٔ gamesPort در حلقهٔ نگهبان + سیاست Degraded
  // (۳ دَور پیاپی با اپ سالم → Degraded؛ ~۶ دَور → ری‌استارت یک‌باره) + رویداد/فاز تازه در lib.rs
  engineSrc.includes('GAMES_DEGRADED_ROUNDS') && engineSrc.includes('GAMES_RESTART_ROUNDS') && engineSrc.includes('health_once(games_port)')
    ? ok('engine.rs: پروب مستقل بازی‌ها + سیاست DEGRADED (M4) سیم است')
    : bad('engine.rs: پروب مستقل بازی‌ها/سیاست DEGRADED (M4) غایب است');
  libSrc.includes('engine:degraded') && libSrc.includes('EnginePhase::Degraded') && libSrc.includes('DegradedRecovered')
    ? ok('lib.rs: رویداد engine:degraded + فاز Degraded (M4) سیم است')
    : bad('lib.rs: رویداد/فاز Degraded (M4) غایب است');
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
  // ۱.۲۷.۲۱ — پین بایند به‌روز شد: از ۱.۲۷.۱۸ بایند از پارامتر host می‌آید (engine.rs پاس می‌دهد 0.0.0.0)
  for (const t of ['startAdapterEngine', 'serveStatic', 'createServer', 'srv.listen(p, host', 'CLINIC_NAME', 'AUTH_SECRET', 'LAN_INFO']) {
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
  // M4 — پروب مستقل gamesPort در smoke (هر دو حالت workerd/adapter) + گوش‌دادن بنر Degraded در پنل سلامت
  smoke.includes('سلامت مستقل gamesPort')
    ? ok('engine-smoke: پروب مستقل gamesPort در هر دو حالت سیم است (M4 — پاریتی ۲۸/۲۸)')
    : bad('engine-smoke: پروب مستقل gamesPort (M4) غایب است');
  const hpSrc = readFileSync(path.join(ROOT, 'public', 'assets', 'js', 'views', 'health-panel.js'), 'utf8');
  hpSrc.includes("listen('engine:degraded'") && hpSrc.includes("listen('engine:degraded_recovered'")
    ? ok('health-panel: بنر Degraded/بازگشت (engine:degraded) سیم است')
    : bad('health-panel: گوش‌دادن engine:degraded غایب است');
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
  // ⑨-الف v1.27.۱۲ — قلاب نصاب فقط «بستن موتور جامانده» است؛ نصب VC++/redist در هوک همچنان ممنوع
  // (نیت پین قدیمی حفظ شده: redist سیستم کارفرما تازه‌تر از بسته بود — هیچ نصب VC++ی نباید برگردد)
  const hookPath = path.join(T, 'installer-hooks.nsh');
  const hasHook = existsSync(hookPath);
  const hookText = hasHook ? readFileSync(hookPath, 'utf8') : '';
  hookText.includes('vc_redist') || hookText.includes('aka.ms') || hookText.includes('vcredist')
    ? bad('installer-hooks.nsh هنوز نصب VC++/redist دارد — ممنوع (نیت پین v1.27.03)')
    : ok('هوک نصاب بدون redist است');
  conf?.bundle?.windows?.nsis?.installerHooks
    ? hasHook && hookText.includes('NSIS_HOOK_PREINSTALL')
      ? ok('قلاب نصاب وصل است — بستن موتور جامانده پیش از کپی (v1.27.12)')
      : bad('installerHooks در conf هست ولی installer-hooks.nsh با NSIS_HOOK_PREINSTALL نیست')
    : hasHook
      ? bad('installer-hooks.nsh هست ولی conf به آن وصل نیست')
      : ok('tauri.conf فاقد installerHooks است و هوکی وجود ندارد');
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

// ⑪ پین‌های P2 — چرخش لاگ (ریسک ۹) + تکی‌نمونه/ثبت نصب (ریسک ۱۰ و ردیف ۱۱) + cargo test در CI
// + drill خرابی هش: شبیه‌ساز دوم با --corrupt (دو فراخوانی پشت‌سرهم — عادی در ⑩، drill این‌جا).
// پین‌ها سخت و کامل‌اند: تا merge سه تغییر هم‌زمان (engine.rs / lib.rs / Cargo.toml) قرمزند و
// بعد از merge هر سه باید همه سبز شوند — گارد موقت/هشدارِ نرم عمداً ندارد.
try {
  const engineSrc11 = readFileSync(path.join(T, 'src', 'engine.rs'), 'utf8');
  engineSrc11.includes('rotate_engine_log')
    ? ok('engine.rs: rotate_engine_log سیم است (چرخش لاگ — ریسک ۹)')
    : bad('engine.rs: rotate_engine_log غایب است (چرخش لاگ — ریسک ۹؛ تا merge تغییر هم‌زمان engine.rs)');
  const libSrc11 = readFileSync(path.join(T, 'src', 'lib.rs'), 'utf8');
  for (const t of ['tauri_plugin_single_instance::init', 'install-manifest.json', 'write_install_manifest']) {
    libSrc11.includes(t)
      ? ok(`lib.rs: ${t} سیم است (تکی‌نمونه + ثبت نصب — ریسک ۱۰ و ردیف ۱۱)`)
      : bad(`lib.rs: ${t} غایب است (تکی‌نمونه/ثبت نصب — ریسک ۱۰/۱۱؛ تا merge تغییر هم‌زمان lib.rs)`);
  }
  const cargo11 = readFileSync(path.join(T, 'Cargo.toml'), 'utf8');
  cargo11.includes('tauri-plugin-single-instance')
    ? ok('Cargo.toml: وابستگی tauri-plugin-single-instance ثبت شده است')
    : bad('Cargo.toml: tauri-plugin-single-instance غایب است (تا merge تغییر هم‌زمان Cargo.toml)');
  const wf11 = readFileSync(path.join(ROOT, '.github', 'workflows', 'desktop-build.yml'), 'utf8');
  wf11.includes('cargo test --all-targets')
    ? ok('CI دسکتاپ: گام cargo test --all-targets سیم است')
    : bad('CI دسکتاپ: cargo test --all-targets در گردش‌کار نیست');
  // drill خرابی — شبیه‌ساز با --corrupt: گیت هش باید دام را بگیرد (exit≠0 → قرمز)
  const simC = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'desktop', 'installer-sim.mjs'), '--corrupt'], {
    cwd: ROOT, encoding: 'utf8', timeout: 120_000,
  });
  const simCOut = `${simC.stdout || ''}${simC.stderr || ''}`;
  for (const l of simCOut.split('\n')) {
    if (l.startsWith('✗ ')) { failed = true; lines.push(l); }
    else if (l.includes('drill') || l.startsWith('  ✓') || l.startsWith('  ↯')) lines.push(l);
  }
  simC.status === 0
    ? ok('drill خرابی: شبیه‌ساز --corrupt سبز است — گیت هش دام را گرفت')
    : bad(`drill خرابی قرمز است (exit=${simC.status}) — گیت هش از خرابی گذشت یا drill شکست خورد`);
  // فاز A — قرارداد وضعیت/ری‌استارت موتور در دسکتاپ (تغییرات هم‌زمان عامل R و عامل F):
  // پین‌های زیر سخت‌اند (رشتهٔ دقیق) و تا merge دو عامل قرمزند — قرمزیِ آن‌ها در این مرحله انتظار است.
  // تنها استثنا: پین capabilities «نرم هوشمند» است؛ چون نام دقیق مجوز فرمان‌های تازه در الگوی
  // Tauri v2 هنوز قطعی نیست (allow-engine-status یا allow_engine_status — با خط‌تیره یا زیرخط)،
  // حضور یکی از دو الگوی engine-status / engine_status پس از merge عامل R کافی است.
  for (const t of ['engine_status', 'engine_restart', 'open_data_dir', 'engine:status']) {
    libSrc11.includes(t)
      ? ok(`lib.rs: ${t} سیم است (فاز A — فرمان/رویداد موتور)`)
      : bad(`lib.rs: ${t} غایب است (فاز A — تا merge تغییر هم‌زمان عامل R در lib.rs)`);
  }
  const bootA = readFileSync(path.join(ROOT, 'desktop', 'src-tauri', 'boot-dist', 'index.html'), 'utf8');
  for (const t of ['engine:status', 'boot-server-pill']) {
    bootA.includes(t)
      ? ok(`صفحهٔ بوت: ${t} سیم است (فاز A)`)
      : bad(`صفحهٔ بوت: ${t} غایب است (فاز A — تا merge تغییر هم‌زمان عامل F در boot-dist)`);
  }
  const hpA = readFileSync(path.join(ROOT, 'public', 'assets', 'js', 'views', 'health-panel.js'), 'utf8');
  hpA.includes('serverStateView')
    ? ok('health-panel: serverStateView سیم است (فاز A)')
    : bad('health-panel: serverStateView غایب است (فاز A — تا merge تغییر هم‌زمان عامل F)');
  const testA = path.join(ROOT, 'src', '__tests__', 'front-server-status.test.ts');
  existsSync(testA) && readFileSync(testA, 'utf8').includes('serverStateView')
    ? ok('آزمون front-server-status.test.ts حاضر است و serverStateView را پوشش می‌دهد (فاز A)')
    : bad('src/__tests__/front-server-status.test.ts موجود نیست یا serverStateView را ندارد (فاز A — تا merge عامل F)');
  const capA = readFileSync(path.join(T, 'capabilities', 'default.json'), 'utf8');
  capA.includes('engine_status') || capA.includes('engine-status')
    ? ok('capabilities: مجوز فرمان‌های موتور (engine_status یا engine-status) ثبت شده است (فاز A)')
    : bad('capabilities/default.json مجوز فرمان‌های موتور را ندارد — پس از merge عامل R باید الگوی allow-engine-status یا allow_engine_status در permissions باشد (پین نرم هوشمند فاز A: یکی از دو الگو کافی است)');

  // فاز B — قرارداد هم‌گامی دوسویهٔ میز↔ابر «instance-sync» (سند §۲-۴/§۲-۵؛ تغییرات هم‌زمان
  // سه عامل: بک‌اند instance-sync / پوستهٔ Rust / فرانت پنل سلامت). پین‌های زیر سخت‌اند و
  // تا merge عامل‌های موازی قرمزند — قرمزیِ آن‌ها در این مرحله انتظار است و پس از merge
  // هر سه باید همه سبز شوند. عمداً هیچ پین نرم/هشدارِ موقتی این‌جا نیست.
  const pinB = (file, tokens, label) => {
    let src = null;
    try { src = readFileSync(file, 'utf8'); } catch { /* غایب — پیام پایین */ }
    if (src === null) {
      bad(`${label} یافت نشد: ${file} (فاز B — تا merge عامل موازی)`);
      return;
    }
    for (const t of tokens) {
      src.includes(t)
        ? ok(`${label}: ${t} سیم است (فاز B)`)
        : bad(`${label}: رشتهٔ ${t} غایب است (فاز B — تا merge عامل موازی)`);
    }
  };
  const IS_DIR = path.join(ROOT, 'src', 'application', 'instance-sync');
  pinB(path.join(IS_DIR, 'service.ts'), ['rowWinner', 'instanceState'], 'instance-sync/service.ts');
  pinB(path.join(IS_DIR, 'tables.ts'), ['SYNC_TABLES'], 'instance-sync/tables.ts');
  // ③ مایگریشن هم‌گامی — کشف داینامیک با readdirSync (الگوی apply-migrations): پین به شمارهٔ
  // مایگریشن گره نمی‌خورد؛ نام فایل (با شماره) در پیام می‌آید تا قرمزی قابل ردیابی باشد.
  try {
    const migDir = path.join(ROOT, 'migrations');
    const migFiles = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    const mig = migFiles.find((f) => {
      const c = readFileSync(path.join(migDir, f), 'utf8');
      return c.includes('_sync_deleted') && c.includes('_sync_conflicts') && c.includes('_sync_state');
    });
    mig
      ? ok(`مایگریشن هم‌گامی ${mig} سه قرارداد _sync_deleted/_sync_conflicts/_sync_state را دارد (فاز B)`)
      : bad(`مایگریشن فاز B با _sync_deleted/_sync_conflicts/_sync_state در migrations/ یافت نشد (بررسی‌شده ${migFiles.length} فایل sql — تا merge عامل موازی)`);
  } catch (e) {
    bad(`کشف مایگریشن فاز B خطا داد: ${e instanceof Error ? e.message : String(e)}`);
  }
  pinB(path.join(IS_DIR, 'runner.ts'), ['runCloudSync', 'ENGINE_CLOUD_SECRET', 'cloud-config.json'], 'instance-sync/runner.ts');
  pinB(path.join(IS_DIR, 'desktop-routes.ts'), ['instance-sync/status', 'instance-sync/clone'], 'instance-sync/desktop-routes.ts');
  pinB(path.join(T, 'src', 'lib.rs'), ['cloud_secret_set', 'ENGINE_CLOUD_SECRET', 'cloud-sync-secret'], 'lib.rs');
  pinB(path.join(T, 'Cargo.toml'), ['keyring'], 'Cargo.toml');
  pinB(path.join(ROOT, 'public', 'assets', 'js', 'views', 'health-panel.js'), ['cloudSyncStateView'], 'health-panel');
  pinB(path.join(ROOT, 'src', '__tests__', 'front-cloud-sync.test.ts'), ['cloudSyncStateView'], 'آزمون front-cloud-sync.test.ts');
  pinB(path.join(IS_DIR, '__tests__', 'two-instance-sync.test.ts'), ['rowWinner'], 'آزمون two-instance-sync.test.ts');
  pinB(path.join(ROOT, 'worker', 'central-bundle.js'), ['instance-sync'], 'worker/central-bundle.js');

  // فاز C — ویزارد «پیکربندی اولیه اتصال ابری» (سند §۲-۵/§۶ فاز C؛ عامل فرانت): پین‌های سخت
  // رشته‌ای — هم‌الگوی pinB فاز B. view تازهٔ ویزارد + روت/بنر/هدایت اولین اجرا در app.js +
  // لینک پانویس boot-dist در حالت «موتور آماده» + آزمون خالص. عمداً فقط همین پین‌ها — هیچ چیز دیگر.
  pinB(path.join(ROOT, 'public', 'assets', 'js', 'views', 'cloud-setup.js'), ['cloudSetupView', 'provision'], 'cloud-setup (ویزارد فاز C)');
  pinB(path.join(ROOT, 'public', 'assets', 'js', 'app.js'), ['/#/cloud-setup'], 'app.js (روت/بنر فاز C)');
  pinB(path.join(ROOT, 'desktop', 'src-tauri', 'boot-dist', 'index.html'), ['پیکربندی اتصال ابری'], 'boot-dist (لینک فاز C)');
  pinB(path.join(ROOT, 'src', '__tests__', 'front-cloud-setup.test.ts'), ['cloudSetupView'], 'آزمون front-cloud-setup.test.ts');
} catch (e) {
  bad(`گیت پین‌های P2 خطا داد: ${e instanceof Error ? e.message : String(e)}`);
}

// ⑫ v1.27.۱۳ — پایانهٔ قابلیت‌های موتور (P0-1 ممیزی §۱): مسیر عمومی /api/engine/capabilities —
// نسخهٔ باندل + نقشهٔ api؛ مصرف پوسته/صفحهٔ بوت/پنل سلامت. پین‌ها سخت‌اند: رشتهٔ مسیر هم در
// منبع TS هم در باندل worker (بازساخت الزامی) + آزمون e2e + مصرف فرانت + آزمون آن.
try {
  mustExist(path.join(ROOT, 'src', 'application', 'engine-capabilities', 'routes.ts'), 'engine-capabilities/routes.ts');
  mustExist(path.join(ROOT, 'src', 'application', 'engine-capabilities', 'index.ts'), 'engine-capabilities/index.ts');
  const capsSrc = readFileSync(path.join(ROOT, 'src', 'application', 'engine-capabilities', 'routes.ts'), 'utf8');
  capsSrc.includes("'/api/engine/capabilities'") && capsSrc.includes('APP_VERSION')
    ? ok('پایانهٔ قابلیت‌ها: مسیر عمومی با APP_VERSION منبع یکتا سیم است')
    : bad('engine-capabilities/routes.ts: مسیر/APP_VERSION غایب است');
  const routingSrc = readFileSync(path.join(ROOT, 'src', 'application', 'api-routing', 'index.ts'), 'utf8');
  routingSrc.includes('registerEngineCapabilitiesRoutes')
    ? ok('api-routing: ثبت پایانهٔ قابلیت‌ها سیم است (ناحیهٔ عمومی — پیش از گیت auth)')
    : bad('api-routing: registerEngineCapabilitiesRoutes غایب است');
  const workerBundle = readFileSync(path.join(ROOT, 'worker', 'bundle.js'), 'utf8');
  workerBundle.includes('/api/engine/capabilities')
    ? ok('باندل worker: مسیر قابلیت‌ها داخل باندل است (بازساخت شده)')
    : bad('worker/bundle.js: مسیر قابلیت‌ها نیست — build:worker را اجرا و commit کنید');
  mustExist(path.join(ROOT, 'src', 'application', '__tests__', 'e2e-engine-capabilities.test.ts'), 'آزمون e2e-engine-capabilities');
  const hpCaps = readFileSync(path.join(ROOT, 'public', 'assets', 'js', 'views', 'health-panel.js'), 'utf8');
  hpCaps.includes("api.get('/api/engine/capabilities')") && hpCaps.includes('engineCapabilitiesVersionView')
    ? ok('health-panel: مصرف پایانهٔ قابلیت‌ها با اولویت نسخه سیم است')
    : bad('health-panel: مصرف /api/engine/capabilities غایب است');
  mustExist(path.join(ROOT, 'src', '__tests__', 'front-engine-capabilities.test.ts'), 'آزمون front-engine-capabilities');
} catch (e) {
  bad(`گیت پایانهٔ قابلیت‌ها خطا داد: ${e instanceof Error ? e.message : String(e)}`);
}

// ⑬ v1.27.۱۳ — خودآزمایی بوت (P0-2 ممیزی §۲): appVersion در manifest نصاب + وارسی در
// PRECHECK پوسته + engineVersion در قرارداد وضعیت + یادداشت صفحهٔ بوت. ناسازگاری رو به جلو
// (manifest کهنه بدون appVersion) با آزمون ⑩ engine.rs قفل شده است — پین‌ها سخت‌اند.
try {
  const bir13 = readFileSync(path.join(ROOT, 'scripts', 'desktop', 'build-installer-runtime.mjs'), 'utf8');
  bir13.includes('appVersion')
    ? ok('مونتاژ رانتایم: appVersion در manifest ثبت می‌شود (خودآزمایی بوت)')
    : bad('build-installer-runtime: فیلد appVersion در manifest نوشته نمی‌شود');
  const engineSrc13 = readFileSync(path.join(T, 'src', 'engine.rs'), 'utf8');
  engineSrc13.includes('manifest.get("appVersion")') && engineSrc13.includes('نصب ارتقا ناقص')
    ? ok('engine.rs: وارسی appVersion در PRECHECK سیم است (Repair + «دست‌نخورده»)')
    : bad('engine.rs: وارسی appVersion در verify_runtime_integrity غایب است');
  for (const t of ['test_verify_integrity_appversion_matching_is_ok', 'test_verify_integrity_appversion_mismatch_mentions_repair', 'test_verify_integrity_without_appversion_is_ok']) {
    engineSrc13.includes(t)
      ? ok(`engine.rs: آزمون ${t} حاضر است`)
      : bad(`engine.rs: آزمون ${t} غایب است (خودآزمایی بوت — P0-2)`);
  }
  const libSrc13 = readFileSync(path.join(T, 'src', 'lib.rs'), 'utf8');
  libSrc13.includes('engine_capabilities_version') && libSrc13.includes('engineVersion')
    ? ok('lib.rs: خواندن نسخهٔ موتور از پایانهٔ قابلیت‌ها + فیلد engineVersion در قرارداد سیم است')
    : bad('lib.rs: engine_capabilities_version/engineVersion در قرارداد وضعیت غایب است');
  const boot13 = readFileSync(path.join(ROOT, 'desktop', 'src-tauri', 'boot-dist', 'index.html'), 'utf8');
  boot13.includes('boot-gap') && boot13.includes('engineVersion')
    ? ok('صفحهٔ بوت: یادداشت ناهم‌نسخه‌ای موتور/پوسته (boot-gap) سیم است')
    : bad('boot-dist: بنر خودآزمایی ناهم‌نسخه‌ای غایب است');
} catch (e) {
  bad(`گیت خودآزمایی بوت خطا داد: ${e instanceof Error ? e.message : String(e)}`);
}

// ⑭ v1.27.۱۳ — Windows Job Object (P0-3 ممیزی §۳): پایان «موتور جامانده» — کودک در Job با
// KILL_ON_JOB_CLOSE؛ FFI خالص بدون crate تازه (قاعدهٔ Cargo). کامپایل ویندوز در CI؛ جاب
// لینوکسی CI این ماژول را نمی‌بیند (cfg(windows)) و بدون آن کامپایل می‌شود.
try {
  mustExist(path.join(T, 'src', 'job_object.rs'), 'job_object.rs');
  const jobSrc = readFileSync(path.join(T, 'src', 'job_object.rs'), 'utf8');
  jobSrc.includes('JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE') && jobSrc.includes('AssignProcessToJobObject')
    ? ok('job_object.rs: FFI خالص Job Object با KILL_ON_JOB_CLOSE سیم است')
    : bad('job_object.rs: FFI/ثابت KILL_ON_JOB_CLOSE غایب است');
  jobSrc.includes('extern "system"') && !jobSrc.includes('windows-sys')
    ? ok('job_object.rs: بدون crate تازه (قاعدهٔ Cargo — فقط FFI دستی kernel32)')
    : bad('job_object.rs: وابستگی تازه (windows-sys) بدون توجیه وارد شده است');
  const engineSrc14 = readFileSync(path.join(T, 'src', 'engine.rs'), 'utf8');
  engineSrc14.includes('EngineChild') && engineSrc14.includes('close_job') && engineSrc14.includes('JobGuard::assign')
    ? ok('engine.rs: کودک درون EngineChild — اتصال Job در spawn و بستن در kill/Drop سیم است')
    : bad('engine.rs: اتصال Job Object در spawn_engine/kill_child غایب است');
  const libSrc14 = readFileSync(path.join(T, 'src', 'lib.rs'), 'utf8');
  libSrc14.includes('mod job_object')
    ? ok('lib.rs: ماژول job_object ثبت شده است (cfg(windows))')
    : bad('lib.rs: mod job_object غایب است');
} catch (e) {
  bad(`گیت Job Object خطا داد: ${e instanceof Error ? e.message : String(e)}`);
}

// ⑮ گیت زبان کاربر — اسکن رشته‌های رندرشوندهٔ UI (روایت بازآرایی / ژاژخان فنی / توکن ممنوعه)
try {
  const { spawnSync: ss15 } = await import('node:child_process');
  const r15 = ss15('node', [path.join(T, 'scripts', 'ui-voice-check.mjs')], { timeout: 60_000, encoding: 'utf8' });
  (r15.stdout || '').split('\n').filter(Boolean).slice(-3).forEach((l) => lines.push('  ' + l));
  r15.status === 0 ? ok('گیت زبان کاربر سبز است (صفر یافته)') : bad(`گیت زبان کاربر قرمز است (exit=${r15.status})`);
} catch (e) {
  bad(`اجرای گیت زبان کاربر خطا داد: ${e instanceof Error ? e.message : String(e)}`);
}

// ⑯ گیت کنتراست AA — جفت‌های توکن رنگی در هر دو تم (۴٫۵ متن عادی / ۳ مؤلفه و مرز)
try {
  const { spawnSync: ss16 } = await import('node:child_process');
  const r16 = ss16('node', [path.join(T, 'scripts', 'contrast-check.mjs')], { timeout: 60_000, encoding: 'utf8' });
  (r16.stdout || '').split('\n').filter((l) => l.includes('✗') || l.includes('گیت')).slice(0, 8).forEach((l) => lines.push('  ' + l));
  r16.status === 0 ? ok('گیت کنتراست AA سبز است (صفر تخلف)') : bad(`گیت کنتراست AA قرمز است (exit=${r16.status})`);
} catch (e) {
  bad(`اجرای گیت کنتراست خطا داد: ${e instanceof Error ? e.message : String(e)}`);
}

lines.push(failed ? '❌ گیت ساختار دسکتاپ قرمز است' : '✅ گیت ساختار دسکتاپ سبز است');
writeFileSync('/tmp/desktop-check-report.txt', lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exit(failed ? 1 : 0);
