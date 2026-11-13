// scripts/engine/config.mjs — تولید کانفیگ capnp-text برای workerd (فاز ۲ خط rust — موتور محلی)
//
// طراحی: docs/rust/design.md §۴. چیدمان عین miniflare است (بدون اجرای miniflare):
//   D1 فایل‌محور  = دیسک + Durable Object (database.worker.js مینیفلر) + ورکر ورودی هر دیتابیس
//                  + بایند wrapped با ماژول داخلی `cloudflare-internal:d1-api` (پشتیبانی بومی workerd)
//   assets        = سه ورکر سبک مینیفلر (assets-kv / assets / router) + مانیفست دودویی هم‌الگوریتم
//   ورکر اصلی     = worker/bundle.js — ورکر بازی‌ها = worker/games-bundle.js روی پورت ۸۷۸۸
// همهٔ بایندها فقط روی 127.0.0.1 هستند (design.md §۸ — هیچ پورتی روی شبکه باز نیست).
//
// خروجی: رشتهٔ capnp-text استاندارد (workerd کانفیگ را فقط به‌صورت capnp-text می‌پذیرد، نه JSON).
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mime from 'mime';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MINIFLARE_WORKERS = path.join(REPO_ROOT, 'node_modules/miniflare/dist/src/workers');

/** مجوزهای ورکر DO مینیفلر — هم‌مقادیر miniflare برای پایداری مسیر فایل‌های SQLite */
const DO_COMPAT_DATE = '2023-07-24';
const D1_OBJECT_CLASS = 'D1DatabaseObject';
const D1_UNIQUE_KEY = `miniflare-${D1_OBJECT_CLASS}`;

// ثابت‌های مانیفست دارایی‌ها — عین miniflare (src/plugins/assets):
const HEADER_SIZE = 20;
const PATH_HASH_SIZE = 16;
const CONTENT_HASH_SIZE = 16;
const TAIL_SIZE = 8;
const CONTENT_HASH_OFFSET = PATH_HASH_SIZE;
const ENTRY_SIZE = PATH_HASH_SIZE + CONTENT_HASH_SIZE + TAIL_SIZE;
const IGNORED_ASSET_FILES = new Set(['.assetsignore', '_redirects', '_headers']);

/** به‌رسانی رشتهٔ JS به متن capnp — کوتیشن/بک‌اسلش/کنترل‌ها؛ بایت‌های UTF-8 چندبایتی دست‌نخورده می‌مانند */
function capnpText(value) {
  let out = '"';
  for (const byte of Buffer.from(value, 'utf8')) {
    if (byte === 0x22) out += '\\"';
    else if (byte === 0x5c) out += '\\\\';
    else if (byte === 0x0a) out += '\\n';
    else if (byte === 0x0d) out += '\\r';
    else if (byte === 0x09) out += '\\t';
    else if (byte < 0x20 || byte === 0x7f) out += `\\x${byte.toString(16).padStart(2, '0')}`;
    else out += String.fromCharCode(byte);
  }
  return `${out}"`;
}

/** به‌رسانی دادهٔ دودویی به متن capnp — همهٔ بایت‌ها با \xNN */
function capnpData(bytes) {
  let out = '"';
  for (const byte of bytes) out += `\\x${byte.toString(16).padStart(2, '0')}`;
  return `${out}"`;
}

function jsonBinding(name, value) {
  return `(name = ${capnpText(name)}, json = ${capnpText(JSON.stringify(value))})`;
}

function textBinding(name, value) {
  return `(name = ${capnpText(name)}, text = ${capnpText(value)})`;
}

function serviceBinding(name, serviceName) {
  return `(name = ${capnpText(name)}, service = (name = ${capnpText(serviceName)}))`;
}

async function readWorkerFile(relativePath) {
  return fs.readFile(path.join(MINIFLARE_WORKERS, relativePath), 'utf8');
}

/** الگوریتم مانیفست دارایی‌ها — عین miniflare buildAssetManifest */
async function buildAssetManifest(directory) {
  const files = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        files.push(path.relative(directory, path.join(dir, entry.name)));
      }
    }
  }
  await walk(directory);
  const manifest = [];
  const assetsReverseMap = {};
  for (const relativeFile of files) {
    const normalized = `/${relativeFile.split(path.sep).join('/')}`;
    if (IGNORED_ASSET_FILES.has(path.basename(normalized))) continue;
    const absPath = path.join(directory, relativeFile);
    const stat = await fs.stat(absPath);
    if (stat.isSymbolicLink() || stat.isDirectory()) continue;
    const pathHash = createHash('sha256').update(normalized).digest().subarray(0, PATH_HASH_SIZE);
    const contentHash = createHash('sha256').update(`${absPath}${stat.mtimeMs}`).digest().subarray(0, PATH_HASH_SIZE);
    manifest.push({ pathHash, contentHash });
    let contentType = mime.getType(absPath);
    if (contentType && contentType.startsWith('text/') && !contentType.includes('charset')) {
      contentType = `${contentType}; charset=utf-8`;
    }
    assetsReverseMap[contentHash.toString('hex')] = { filePath: relativeFile, contentType };
  }
  // مرتب‌سازی باینری بر pathHash — عین comparisonFn مینیفلر (جست‌وجوی دودویی سمت ورکر assets)
  manifest.sort((a, b) => Buffer.compare(a.pathHash, b.pathHash));
  const encoded = Buffer.alloc(HEADER_SIZE + manifest.length * ENTRY_SIZE);
  manifest.forEach((entry, i) => {
    const offset = HEADER_SIZE + i * ENTRY_SIZE;
    entry.pathHash.copy(encoded, offset);
    entry.contentHash.copy(encoded, offset + CONTENT_HASH_OFFSET);
  });
  return { encodedAssetManifest: encoded, assetsReverseMap };
}

/** بایند D1 بومی workerd — wrapped روی ماژول داخلی cloudflare-internal:d1-api */
function d1Binding(bindingName, dbServiceName) {
  return `(name = ${capnpText(bindingName)}, wrapped = (moduleName = "cloudflare-internal:d1-api", innerBindings = [${serviceBinding('fetcher', dbServiceName)}]))`;
}

async function moduleEntry(name, contents) {
  return `(name = ${capnpText(name)}, esModule = ${capnpText(contents)})`;
}

/**
 * ساخت کانفیگ کامل موتور محلی.
 * @param {object} opts
 * @param {number} opts.port             پورت ورکر اصلی (بایند 127.0.0.1)
 * @param {number} opts.gamesPort        پورت سرویس بازی‌ها (پیش‌فرض ۸۷۸۸)
 * @param {string} opts.dataDir          پوشهٔ داده (فایل SQLite + بلاف‌ها + کانفیگ)
 * @param {string} opts.authSecret       runtime-secret مشترک دو ورکر (seed در settings هم می‌شود)
 */
export async function buildEngineConfig(opts) {
  const { port, gamesPort = 8788, dataDir, authSecret } = opts;
  return buildCapnpConfig({
    port,
    gamesPort,
    dataDir,
    publicDir: path.join(REPO_ROOT, 'public'),
    authSecret,
    env: 'development',
  });
}

// rust-f13 — قالب capnp نصاب میز (گیت فاز ۲ ردیف ۹): همان شکل خروجی موتور محلی، ولی سه
// مقدارِ وابسته به ماشینِ نصب با توکن جای‌گذاری می‌شوند و lib.rs پوسته در بوت آن‌ها را با
// مقادیر واقعی (data dir کاربر / public داخل resources / راز per-install) جایگزین و capnp
// نهایی را در data dir می‌نویسد — Rust هیچ دانشی از ساختار capnp ندارد، فقط جایگزینی رشته.
// ENV = production: دور زدن توسعه (X-Dev-Staff-Id) در نصب واقعی خاموش است؛ راز از فایل داده.
export const DATA_DIR_TOKEN = '__CENTER_DATA_DIR__';
export const PUBLIC_DIR_TOKEN = '__CENTER_PUBLIC_DIR__';
export const AUTH_SECRET_TOKEN = '__CENTER_AUTH_SECRET__';
export const INSTALLER_MAIN_PORT = 8787;
export const INSTALLER_GAMES_PORT = 8788;

export async function buildInstallerCapnpTemplate({ publicDir }) {
  return buildCapnpConfig({
    port: INSTALLER_MAIN_PORT,
    gamesPort: INSTALLER_GAMES_PORT,
    dataDir: DATA_DIR_TOKEN,
    publicDir,
    authSecret: AUTH_SECRET_TOKEN,
    env: 'production',
  });
}

async function buildCapnpConfig(opts) {
  const { port, gamesPort = 8788, dataDir, publicDir, authSecret, env } = opts;
  const d1DiskPath = path.join(dataDir, 'd1');
  const { encodedAssetManifest, assetsReverseMap } = await buildAssetManifest(publicDir);

  // ماژول‌های مینیفلر — database.worker (D1)، object-entry و سه ورکر assets از توزیع مینیفلر خوانده می‌شوند
  const [databaseWorker, objectEntryWorker, assetsKvWorker, assetWorker, routerWorker, sharedModule, zodModule] = await Promise.all([
    readWorkerFile('d1/database.worker.js'),
    readWorkerFile('shared/object-entry.worker.js'),
    readWorkerFile('assets/assets-kv.worker.js'),
    readWorkerFile('assets/assets.worker.js'),
    readWorkerFile('assets/router.worker.js'),
    readWorkerFile('shared/index.worker.js'),
    readWorkerFile('shared/zod.worker.js'),
  ]);
  const [mainBundle, gamesBundle] = await Promise.all([
    fs.readFile(path.join(REPO_ROOT, 'worker/bundle.js'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'worker/games-bundle.js'), 'utf8'),
  ]);

  const assetConfig = {
    account_id: 'local',
    script_id: 'main',
    html_handling: 'auto-trailing-slash',
    not_found_handling: 'none',
  };
  const routerConfig = { account_id: 'local', script_id: 'main', has_user_worker: true, invoke_user_worker_ahead_of_assets: false };

  // بایندهای مشترک دیتابیس و متغیرهای محیطی دو ورکر
  const d1Service = 'd1:db:main';
  const mainVars = [
    textBinding('ENV', env),
    textBinding('CF_ACCESS_TEAM_DOMAIN', ''),
    textBinding('CLINIC_NAME', 'مرکز جامع'),
    textBinding('PUBLIC_BASE_URL', `http://127.0.0.1:${port}`),
    textBinding('AUTH_SECRET', authSecret),
    // rust-f9 — گیت زمان‌اجرای میز: مسیرهای /api/internal/sync/* فقط در موتور محلی زنده‌اند؛
    // در تولید وب این binding وجود ندارد → ۴۰۴ کم‌دست (باندل یکسان، رفتار تولید دست‌نخورده)
    textBinding('CENTER_DESKTOP_ENGINE', '1'),
  ];
  const gamesVars = [
    textBinding('ENV', env),
    textBinding('CF_ACCESS_TEAM_DOMAIN', ''),
    textBinding('PUBLIC_BASE_URL', `http://127.0.0.1:${port}`),
    textBinding('AUTH_SECRET', authSecret),
  ];

  const services = [
    // ورکر اصلی — باندل کامل اپ
    `(name = "main", worker = (compatibilityDate = "2025-01-01", compatibilityFlags = ["nodejs_compat"], bindings = [${d1Binding('DB', d1Service)}, ${serviceBinding('ASSETS', 'assets:main')}, ${mainVars.join(', ')}], modules = [${await moduleEntry('bundle.js', mainBundle)}]))`,
    // ورکر بازی‌ها — بستهٔ مستقل ۱.۲۵.۷۵ با همان runtime-secret
    `(name = "games", worker = (compatibilityDate = "2025-01-01", compatibilityFlags = ["nodejs_compat"], bindings = [${d1Binding('DB', d1Service)}, ${gamesVars.join(', ')}], modules = [${await moduleEntry('games-bundle.js', gamesBundle)}]))`,
    // پشتهٔ D1 فایل‌محور — دیسک + DO + ورکر ورودی (چیدمان عین miniflare)
    `(name = "d1:storage", disk = (path = ${capnpText(d1DiskPath)}, writable = true))`,
    `(name = "d1:db", worker = (compatibilityDate = ${capnpText(DO_COMPAT_DATE)}, compatibilityFlags = ["nodejs_compat", "experimental"], modules = [${await moduleEntry('database.worker.js', databaseWorker)}], durableObjectNamespaces = [(className = ${capnpText(D1_OBJECT_CLASS)}, uniqueKey = ${capnpText(D1_UNIQUE_KEY)})], durableObjectStorage = (localDisk = "d1:storage"), bindings = [${serviceBinding('MINIFLARE_BLOBS', 'd1:storage')}]))`,
    `(name = ${capnpText(d1Service)}, worker = (compatibilityDate = ${capnpText(DO_COMPAT_DATE)}, bindings = [(name = "MINIFLARE_NAMESPACE", text = "main"), (name = "MINIFLARE_OBJECT", durableObjectNamespace = (className = ${capnpText(D1_OBJECT_CLASS)}, serviceName = "d1:db"))], modules = [${await moduleEntry('object-entry.worker.js', objectEntryWorker)}]))`,
    // پشتهٔ assets — کشیدن از دیسک public با مانیفست دودویی هم‌الگوریتم مینیفلر
    `(name = "assets:storage", disk = (path = ${capnpText(publicDir)}, writable = true))`,
    `(name = "assets-kv:main", worker = (compatibilityDate = ${capnpText(DO_COMPAT_DATE)}, compatibilityFlags = ["nodejs_compat"], bindings = [${serviceBinding('MINIFLARE_BLOBS', 'assets:storage')}, ${jsonBinding('ASSETS_REVERSE_MAP', assetsReverseMap)}], modules = [${await moduleEntry('assets-kv-worker.mjs', assetsKvWorker)}]))`,
    `(name = "assets:main", worker = (compatibilityDate = "2024-07-31", compatibilityFlags = ["nodejs_compat"], bindings = [(name = "ASSETS_KV_NAMESPACE", kvNamespace = "assets-kv:main"), (name = "ASSETS_MANIFEST", data = ${capnpData(encodedAssetManifest)}), ${jsonBinding('CONFIG', assetConfig)}], modules = [${await moduleEntry('asset-worker.mjs', assetWorker)}]))`,
    `(name = "assets:router:main", worker = (compatibilityDate = "2024-07-31", compatibilityFlags = ["nodejs_compat", "no_nodejs_compat_v2"], bindings = [${serviceBinding('ASSET_WORKER', 'assets:main')}, ${serviceBinding('USER_WORKER', 'main')}, ${jsonBinding('CONFIG', routerConfig)}], modules = [${await moduleEntry('router-worker.mjs', routerWorker)}]))`,
  ];

  // ماژول‌های سراسری مینیفلر — وابستگی‌های database.worker.js
  const extensions = `(modules = [${await moduleEntry('miniflare:shared', sharedModule)}, ${await moduleEntry('miniflare:zod', zodModule)}])`;

  const sockets = [
    `(name = "main", address = "127.0.0.1:${port}", http = (), service = (name = "assets:router:main"))`,
    `(name = "games", address = "127.0.0.1:${gamesPort}", http = (), service = (name = "games"))`,
  ];

  return `using W = import "/workerd/workerd.capnp";\nconst config :W.Config = (\n  services = [\n    ${services.join(',\n    ')}\n  ],\n  sockets = [\n    ${sockets.join(',\n    ')}\n  ],\n  extensions = [${extensions}]\n);\n`;
}

export { REPO_ROOT };
