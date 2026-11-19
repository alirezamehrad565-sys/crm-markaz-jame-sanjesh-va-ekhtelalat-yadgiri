// scripts/engine/adapter/server.mjs — موتور درون‌پروسه‌ای مرکز جامع (v1.27.03)
//
// جایگزین workerd در مسیر دسکتاپ: دو سرور HTTP در همین فرایند Node —
//   پورت اصلی: استاتیک public/ (مسیر مینیفلر: دارایی اول، ورکر بعد) → ورکر Hono
//   پورت بازی‌ها: مستقیم ورکر Hono بازی‌ها
// بایندینگ‌ها عین کانفیگ capnp قبلی (منبع: کانفیگ واقعی نصاب کارفرما):
//   main : DB, ENV, CF_ACCESS_TEAM_DOMAIN, CLINIC_NAME, PUBLIC_BASE_URL,
//          AUTH_SECRET, CENTER_DESKTOP_ENGINE, GAMES_HEALTH_URL
//   games: DB, ENV, CF_ACCESS_TEAM_DOMAIN, PUBLIC_BASE_URL, AUTH_SECRET
// DB = shim کامل D1 روی node:sqlite (./d1.mjs) روی همان فایل پشتهٔ D1 — دادهٔ کاربر حفظ است.
import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeD1 } from './d1.mjs';
import { bootUrlsOf, defaultPublicBaseOf, lanIPv4sOf } from './lan.mjs'; // v1.27.20 — بایند LAN + نشانی موبایل‌ها · ۱.۲۷.۲۱ — LAN_INFO برای پنل

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.csv': 'text/csv; charset=utf-8',
  '.zip': 'application/zip',
};

/** دارایی استاتیک از public — اگر مسیر فایل واقعی بود Response بده، وگرنه null (→ ورکر) */
function serveStatic(publicDir, pathname, method) {
  let p = pathname;
  try { p = decodeURIComponent(p); } catch { return null; }
  if (p === '/' || p === '') p = '/index.html';
  const base = path.normalize(publicDir + path.sep);
  const abs = path.normalize(path.join(publicDir, p));
  // سد سرریز مسیر — فقط زیر public مجاز است
  if (abs !== path.normalize(publicDir) && !abs.startsWith(base)) return null;
  let file = abs;
  try {
    if (statSync(file).isDirectory()) {
      const idx = path.join(file, 'index.html');
      if (!existsSync(idx)) return null;
      file = idx;
    }
  } catch {
    return null;
  }
  if (!existsSync(file)) return null;
  const ext = path.extname(file).toLowerCase();
  const headers = {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    // دارایی هش‌دار مسیر /assets/ قابل کش دائمی؛ index.html همیشه تازه
    'cache-control': p.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
  const body = method === 'HEAD' ? undefined : readFileSync(file);
  return new Response(body, { status: 200, headers });
}

/** Request استاندارد web از req نودی — بدنه کامل بافر می‌شود (دسکتاپ تک‌کاربره، حجم‌ها کوچک) */
async function toWebRequest(req, url) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === 'set-cookie') continue; // اپ از Bearer استفاده می‌کند؛ کوکی ورودی موضوعیت ندارد
    headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
  }
  const method = req.method.toUpperCase();
  let body;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const buf = Buffer.concat(chunks);
    if (buf.length > 0) body = buf;
  }
  return new Request(url, { method, headers, body });
}

/** Response web → پاسخ نودی — Set-Cookie چندتایی و پخش جریان بدنه */
async function writeWebResponse(res, response) {
  const headers = { ...Object.fromEntries(response.headers) };
  const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  res.writeHead(response.status, response.statusText || undefined, headers);
  for (const c of setCookies) res.appendHeader('set-cookie', c);
  if (reqHead(res.req?.method)) {
    res.end();
    return;
  }
  if (response.body) {
    try {
      for await (const chunk of response.body) res.write(chunk);
    } catch (e) {
      // قطع جریان (مثلاً بستن صفحه در میانهٔ دانلود) — خطای بنویس رد می‌شود
      if (!res.writableEnded) try { res.end(); } catch { /* بسته است */ }
      throw e;
    }
  }
  res.end();
}
const reqHead = (m) => String(m ?? '').toUpperCase() === 'HEAD';

/**
 * فاز B — CloudFsIO: پل فایل‌سیستم dataDir برای اپ (docs/rust/server-cloud-update-design.md §۲-۴).
 * باندل ورکر هرگز node:fs import نمی‌کند (باید در workerd هم باندل‌پذیر بماند) — پس فایل‌های
 * ابری (cloud-config.json + sync-state.json + پشتیبان‌های cloud-sync-pre-* و cloud-sync-clone-*)
 * فقط از طریق همین آبجکت تزریقی در binding CLOUD_FS خوانده/نوشته می‌شوند؛ در حالت workerd
 * (توسعه) غایب است → اپ «configured=false» می‌دهد و هم‌گامی ابری خاموش می‌ماند.
 * سد نام فایل: فقط همین الگوها مجازند — هیچ مسیر دیگری از اپ به dataDir باز نمی‌شود.
 * نوشتن اتمیک: tmp هم‌نام + rename (هر دو زیر dataDir و یک volume — عین الگوی install-manifest).
 */
const CLOUD_FILE_RE = /^(cloud-config\.json|sync-state\.json|cloud-sync-(pre|clone)-[A-Za-z0-9._-]+\.json)$/;
function makeCloudFsIO(dataDir) {
  if (!dataDir) return null;
  const safeName = (name) => typeof name === 'string' && CLOUD_FILE_RE.test(name);
  return {
    readText: async (name) => {
      if (!safeName(name)) throw new Error(`نام فایل ابری مجاز نیست: ${String(name).slice(0, 64)}`);
      try { return readFileSync(path.join(dataDir, name), 'utf8'); } catch { return null; }
    },
    writeText: async (name, text) => {
      if (!safeName(name)) throw new Error(`نام فایل ابری مجاز نیست: ${String(name).slice(0, 64)}`);
      const target = path.join(dataDir, name);
      const tmp = `${target}.tmp`;
      writeFileSync(tmp, String(text), 'utf8');
      try {
        // انتقال اتمیک tmp → مقصد (libuv با REPLACE_EXISTING جایگزین می‌کند؛ هر دو زیر dataDir
        // و روی یک volume اند) — یا محتوای کامل تازه یا قبلی دست‌نخورده
        renameSync(tmp, target);
      } catch (err) {
        try { unlinkSync(tmp); } catch { /* ماندهٔ tmp باقی نماند */ }
        throw err;
      }
    },
    remove: async (name) => {
      if (!safeName(name)) throw new Error(`نام فایل ابری مجاز نیست: ${String(name).slice(0, 64)}`);
      try { unlinkSync(path.join(dataDir, name)); } catch { /* غایب = حذف‌شده */ }
    },
    list: async (prefix) => {
      try {
        return readdirSync(dataDir)
          .filter((n) => typeof n === 'string' && n.startsWith(prefix) && CLOUD_FILE_RE.test(n))
          .sort()
          .reverse(); // تازه‌ترین (بزرگ‌ترین مُهر) اول — مصرف چرخش/فهرست
      } catch {
        return [];
      }
    },
    dir: () => dataDir,
  };
}

/**
 * فاز C (A1) — CloudProvision: پل دارایی‌های «ساخت خودکار ورکر ابری» برای اپ
 * (docs/rust/first-run-and-cloud.md §۳ — جدول گام‌های CF API).
 * فقط دو فایل ثابتِ «ساخت سرور مرکزی» خوانده می‌شود: central-worker.js و schema.sql —
 * ساختهٔ build-installer-runtime در نصب (resources/engine/central) و در توسعه schema.sql
 * موقتِ تجمیع migrations/ که engine.mjs می‌سازد. سد امنیتی عین CLOUD_FILE_RE اما ساده‌تر:
 * اپ هیچ مسیری نمی‌فرستد و همین‌جا هیچ مسیر دلخواهی باز نمی‌شود — دو خوانندهٔ بی‌آرگومان
 * روی دو مسیری که فقط سمت موتور (engine.mjs) حل شده‌اند. هر دو فایل حاضر نبودند → null
 * → اپ روی مسیر provision «۵۰۱ — فقط در نسخهٔ دسکتاپ» می‌دهد (حالت workerd همیشه null).
 * فاز D1 (B2) — خوانندهٔ سوم اختیاری readWebAssets (makeWebAssetsReader): فایل‌های public
 * برای آپلود Workers Static Assets؛ غایب/null → ساخت بدون وب (سازگار عقب، خطا نیست).
 */
function makeCloudProvision(centralWorkerPath, schemaSqlPath, webAssetsReader) {
  if (!centralWorkerPath || !schemaSqlPath) return null;
  const fileOk = (p) => {
    try { return statSync(p).isFile(); } catch { return false; }
  };
  if (!fileOk(centralWorkerPath) || !fileOk(schemaSqlPath)) return null;
  return {
    readCentralWorker: async () => {
      try { return readFileSync(centralWorkerPath, 'utf8'); } catch { return null; }
    },
    readSchemaSql: async () => {
      try { return readFileSync(schemaSqlPath, 'utf8'); } catch { return null; }
    },
    ...(typeof webAssetsReader === 'function' ? { readWebAssets: webAssetsReader } : {}),
  };
}

// فاز D1 (B2) — سدهای سخت آپلود دارایی‌های وب (آینهٔ گارد حجم assets.ts در provision)
const WEB_ASSETS_MAX_FILES = 250;
const WEB_ASSETS_MAX_FILE_BYTES = 8 * 1024 * 1024;
const WEB_ASSETS_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

/**
 * فاز D1 (B2) — خوانندهٔ دارایی‌های وب برای آپلود Workers Static Assets (binding webAssetsReader).
 * پیمایش فقط-خواندنیِ بازگشتی publicDir — خروجی فایل‌های واقعی زیر پوشهٔ داده‌شده با مسیر نسبی
 * posix و بایت‌های node:fs (Buffer → Uint8Array). سدها: هر گام walk با resolve بررسی می‌شود که
 * زیر publicDir بماند (خروج از مرز → null) و محدودیت‌های سخت ۲۵۰ فایل / ۸ مگابایت هر فایل /
 * ۲۰ مگابایت مجموع رعایت شود — عبور از هر مرز → کل دارایی null (وب نمی‌آید و provision بدون
 * دارایی ادامه می‌یابد؛ سازگار عقب). پوشه‌های .git و هر نام نقطه‌دار رد می‌شوند؛ symlink
 * خوانده نمی‌شود (Dirent روی پیوند، فایل نیست) — فقط فایل واقعی زیر همان پوشه.
 */
export function makeWebAssetsReader(publicDir) {
  if (!publicDir) return null;
  const base = path.resolve(publicDir);
  return async function readWebAssets() {
    const files = [];
    let totalBytes = 0;
    let refused = '';
    const underBase = (abs) => abs === base || abs.startsWith(base + path.sep);
    const relOf = (abs) => path.relative(base, abs).split(path.sep).join('/');
    const visit = (dir) => {
      if (refused) return;
      if (files.length >= WEB_ASSETS_MAX_FILES) {
        refused = 'شمار فایل‌های public از ۲۵۰ گذشت';
        return;
      }
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return; // پوشهٔ ناخوانا — همین شاخه بخشی از دارایی نیست
      }
      for (const e of entries) {
        if (refused) return;
        if (e.name.startsWith('.')) continue; // مخفی نقطه‌دار + .git
        const abs = path.resolve(dir, e.name);
        if (!underBase(abs)) {
          refused = 'مسیری بیرون از پوشهٔ public دیده شد';
          return;
        }
        if (e.isDirectory()) {
          visit(abs);
          continue;
        }
        if (!e.isFile()) continue;
        let size = 0;
        try { size = statSync(abs).size; } catch { continue; }
        if (size > WEB_ASSETS_MAX_FILE_BYTES) {
          refused = `فایل «${relOf(abs)}» از سقف ۸ مگابایت بزرگ‌تر است`;
          return;
        }
        if (totalBytes + size > WEB_ASSETS_MAX_TOTAL_BYTES) {
          refused = 'مجموع دارایی‌های public از سقف ۲۰ مگابایت گذشت';
          return;
        }
        let buf;
        try { buf = readFileSync(abs); } catch { continue; } // فایل حین پیمایش رفت — رد
        totalBytes += size;
        files.push({ path: relOf(abs), bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) });
      }
    };
    visit(base);
    if (refused) {
      console.warn(`[engine] دارایی‌های وب بارگذاری نشد — ${refused} (provision بدون وب ادامه می‌یابد)`);
      return null;
    }
    return files;
  };
}

/**
 * بالا آوردن هر دو سرویس در همین فرایند. برمی‌گرداند { close } — engine.mjs در
 * ری‌استارت پنل/نگهبان بازی‌ها close و دوباره startAdapterEngine می‌زند.
 */
export async function startAdapterEngine(opts) {
  const { port, gamesPort, dbPath, mainBundle, gamesBundle, publicDir, log, bind } = opts;
  const host = bind ?? '127.0.0.1'; // v1.27.۱۸ — بایند شبکه‌ای (0.0.0.0) از موتور؛ پیش‌فرض لوکال
  const bindings = opts.bindings ?? {};
  const mainMod = await import(pathToFileURL(mainBundle).href);
  const gamesMod = await import(pathToFileURL(gamesBundle).href);
  if (typeof mainMod.default?.fetch !== 'function' || typeof gamesMod.default?.fetch !== 'function') {
    throw new Error('باندل ورکر شکل موردانتظار ({ fetch }) ندارد — بازسازی باندل‌ها لازم است');
  }

  const DB = makeD1(dbPath, { log });
  // فاز B — راز ابری passthrough از env پروسهٔ موتور (تزریق پوستهٔ Rust) + پل فایل‌های ابری
  // CloudFsIO روی dataDir — باندل ورکر هرگز node:fs import نمی‌کند؛ فقط از همین binding می‌خواند
  const cloudFs = makeCloudFsIO(bindings.dataDir);
  // ۱.۲۷.۲۱ — LAN_INFO برای پنل نجات: IPهای خصوصی LAN (همان lan.mjs بوت) + پورت‌های واقعی همین
  //   بوت → درگاه GET /api/system/lan فقط‌مدیر؛ کارت «سرور محلی» پنل دیگر به 127.0.0.1 بسنده
  //   نمی‌کند و موبایلِ همان وای‌فای نشانی چاپ‌شده در بوت را زنده از خود پنل می‌گیرد.
  const lanIps = lanIPv4sOf();
  const lanInfo = {
    host,
    port,
    games_port: gamesPort,
    lan_ips: lanIps,
    main_urls: lanIps.map((ip) => `http://${ip}:${port}`),
    local_url: `http://127.0.0.1:${port}`,
    games_urls: lanIps.map((ip) => `http://${ip}:${gamesPort}`),
    games_local_url: `http://127.0.0.1:${gamesPort}`,
    boot_at: new Date().toISOString(),
  };
  const mainEnv = {
    DB,
    ENV: 'production',
    CF_ACCESS_TEAM_DOMAIN: bindings.cfAccessTeamDomain ?? '',
    CLINIC_NAME: bindings.clinicName ?? 'مرکز جامع',
    PUBLIC_BASE_URL: bindings.publicBaseUrl ?? defaultPublicBaseOf(host, port),
    AUTH_SECRET: bindings.authSecret,
    CENTER_DESKTOP_ENGINE: '1',
    GAMES_HEALTH_URL: bindings.gamesHealthUrl ?? `http://127.0.0.1:${gamesPort}/health`,
    CLOUD_FS: cloudFs,
    // فاز C — دارایی‌های «ساخت ورکر ابری» (central-worker.js + schema.sql)؛ در workerd غایب است → اپ ۵۰۱ می‌دهد
    // فاز D1 — خوانندهٔ سوم webAssetsReader (فایل‌های public برای Static Assets) از bindings می‌آید
    CLOUD_PROVISION: makeCloudProvision(bindings.centralWorkerPath, bindings.centralSchemaPath, bindings.webAssetsReader),
    ENGINE_CLOUD_SECRET: typeof bindings.engineCloudSecret === 'string' ? bindings.engineCloudSecret : '',
    LAN_INFO: JSON.stringify(lanInfo),
  };
  const gamesEnv = {
    DB,
    ENV: 'production',
    CF_ACCESS_TEAM_DOMAIN: bindings.cfAccessTeamDomain ?? '',
    PUBLIC_BASE_URL: bindings.publicBaseUrl ?? defaultPublicBaseOf(host, port),
    AUTH_SECRET: bindings.authSecret,
  };

  /** ctx ورکر — waitUntil پس از پاسخ جمع می‌شود (پس‌زمینه نباید پاسخ را بلوک کند) */
  const makeCtx = () => {
    const pending = [];
    return {
      waitUntil: (p) => pending.push(Promise.resolve(p).catch(() => {})),
      passThroughOnException: () => {},
      abort: () => {},
      done: () => Promise.allSettled(pending),
    };
  };

  const mainServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    try {
      let response = null;
      // مسیر مینیفلر (invoke_user_worker_ahead_of_assets=false): دارایی اول برای GET/HEAD
      if (req.method === 'GET' || req.method === 'HEAD') {
        response = serveStatic(publicDir, url.pathname, req.method);
      }
      if (!response) {
        const request = await toWebRequest(req, url);
        const ctx = makeCtx();
        response = await mainMod.default.fetch(request, mainEnv, ctx);
        await ctx.done();
      }
      if (!response) response = new Response(JSON.stringify({ ok: false, error: 'no response from worker' }), { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } });
      await writeWebResponse(res, response);
    } catch (err) {
      log?.(`خطای پردازش درخواست ${req.method} ${url.pathname}: ${err?.stack ?? err}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'internal engine error' }));
      } else {
        try { res.end(); } catch { /* بسته است */ }
      }
    }
  });

  const gamesServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${gamesPort}`);
    try {
      const request = await toWebRequest(req, url);
      const ctx = makeCtx();
      const response = await gamesMod.default.fetch(request, gamesEnv, ctx);
      await ctx.done();
      await writeWebResponse(res, response ?? new Response('no response from games worker', { status: 500 }));
    } catch (err) {
      log?.(`خطای پردازش بازی‌ها ${req.method} ${url.pathname}: ${err?.stack ?? err}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'internal games engine error' }));
      } else {
        try { res.end(); } catch { /* بسته است */ }
      }
    }
  });

  const listen = (srv, p, name) => new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(p, host, () => {
      log?.(`سرویس ${name} روی پورت ${p} راه افتاد`);
      resolve();
    });
  });

  await listen(mainServer, port, 'اصلی');
  try {
    await listen(gamesServer, gamesPort, 'بازی‌ها');
  } catch (err) {
    try { mainServer.close(); mainServer.closeAllConnections(); } catch { /* بهترین‌تلاش */ }
    throw err;
  }

  // v1.27.20 — نشانی‌های بوت: با بایند LAN نشانی موبایل‌ها چاپ می‌شود + خط راهنمای فایروال
  for (const url of bootUrlsOf(host, port)) log?.(`نشانی سرویس اصلی: ${url}`);
  if (host === '0.0.0.0' || host === '::') {
    log?.('اگر از موبایل/دستگاه دیگر باز نشد: در فایروال ویندوز برای Node (یا پورت 8787) اجازهٔ ورودی بدهید');
  }

  return {
    close: async () => {
      await Promise.allSettled([
        new Promise((r) => { try { mainServer.closeAllConnections(); mainServer.close(() => r()); } catch { r(); } }),
        new Promise((r) => { try { gamesServer.closeAllConnections(); gamesServer.close(() => r()); } catch { r(); } }),
      ]);
      DB.close();
    },
  };
}
