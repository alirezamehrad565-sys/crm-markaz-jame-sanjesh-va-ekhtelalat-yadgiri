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
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeD1 } from './d1.mjs';

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
 * بالا آوردن هر دو سرویس در همین فرایند. برمی‌گرداند { close } — engine.mjs در
 * ری‌استارت پنل/نگهبان بازی‌ها close و دوباره startAdapterEngine می‌زند.
 */
export async function startAdapterEngine(opts) {
  const { port, gamesPort, dbPath, mainBundle, gamesBundle, publicDir, log } = opts;
  const bindings = opts.bindings ?? {};
  const mainMod = await import(pathToFileURL(mainBundle).href);
  const gamesMod = await import(pathToFileURL(gamesBundle).href);
  if (typeof mainMod.default?.fetch !== 'function' || typeof gamesMod.default?.fetch !== 'function') {
    throw new Error('باندل ورکر شکل موردانتظار ({ fetch }) ندارد — بازسازی باندل‌ها لازم است');
  }

  const DB = makeD1(dbPath, { log });
  const mainEnv = {
    DB,
    ENV: 'production',
    CF_ACCESS_TEAM_DOMAIN: bindings.cfAccessTeamDomain ?? '',
    CLINIC_NAME: bindings.clinicName ?? 'مرکز جامع',
    PUBLIC_BASE_URL: bindings.publicBaseUrl ?? `http://127.0.0.1:${port}`,
    AUTH_SECRET: bindings.authSecret,
    CENTER_DESKTOP_ENGINE: '1',
    GAMES_HEALTH_URL: bindings.gamesHealthUrl ?? `http://127.0.0.1:${gamesPort}/health`,
  };
  const gamesEnv = {
    DB,
    ENV: 'production',
    CF_ACCESS_TEAM_DOMAIN: bindings.cfAccessTeamDomain ?? '',
    PUBLIC_BASE_URL: bindings.publicBaseUrl ?? `http://127.0.0.1:${port}`,
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
    srv.listen(p, '127.0.0.1', () => {
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
