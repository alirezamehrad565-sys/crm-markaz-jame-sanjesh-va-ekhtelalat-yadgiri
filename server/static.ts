/**
 * سروِ فایل‌های استاتیک برای بستر سلف‌هاست — بازسازی رفتار Workers Assets
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 *
 * • قواعد کش/امنیت از همان `public/_headers` خوانده می‌شود (تک منبع حقیقت — parse در بوت)
 * • ETag قوی بر اساس (size,mtime) + پاسخ 304 بر اساس If-None-Match درخواست
 * • محافظت از path traversal؛ `_headers` و dotfileها هرگز سرو نمی‌شوند
 * • مسیر ناشناخته → null (درخواست به worker می‌رسد و 404 JSON همان پروداکشن برمی‌گردد)
 */
import { statSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export interface StaticRule {
  pattern: RegExp;
  headers: Record<string, string>;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm'
};

/** الگوی _headers (مثل /assets/*) به regex لنگردار — * = هر چیزی */
export function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** پارسر فایل _headers — قواعد به‌ترتیب؛ کامنت‌ها (#) و خطوط خالی نادیده */
export function parseHeadersFile(content: string): StaticRule[] {
  const rules: StaticRule[] = [];
  let current: StaticRule | null = null;
  for (const raw of content.split('\n')) {
    const line = raw.trimEnd();
    if (line.trim().length === 0 || line.trim().startsWith('#')) continue;
    if (/^\s/.test(raw)) {
      // خط هدر (تودرتو) — متعلق به آخرین قاعده
      const idx = line.indexOf(':');
      if (current === null || idx <= 0) continue;
      current.headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    } else {
      current = { pattern: patternToRegex(line.trim()), headers: {} };
      rules.push(current);
    }
  }
  return rules;
}

export interface StaticServer {
  /**
   * پاسخ استاتیک یا null اگر مسیر فایل استاتیک نبود.
   * @param ifNoneMatch مقدار هدر If-None-Match درخواست (برای 304)
   */
  handle(pathname: string, method: string, ifNoneMatch?: string | null): Response | null;
}

export function createStaticServer(publicDir: string): StaticServer {
  const headersFile = path.join(publicDir, '_headers');
  const rules: StaticRule[] = existsSync(headersFile)
    ? parseHeadersFile(readFileSync(headersFile, 'utf8'))
    : [];

  function headersFor(servedPath: string, base: Record<string, string>): Record<string, string> {
    // همهٔ قواعد منطبق به‌ترتیب اعمال می‌شوند؛ قاعدهٔ بعدی (خاص‌تر) بازنویسی می‌کند — مثل Cloudflare
    const merged: Record<string, string> = { ...base };
    for (const rule of rules) {
      if (rule.pattern.test(servedPath)) Object.assign(merged, rule.headers);
    }
    return merged;
  }

  function notFound(): Response {
    return new Response('not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }

  function handle(pathname: string, method: string, ifNoneMatch?: string | null): Response | null {
    if (method !== 'GET' && method !== 'HEAD') return null;

    // مسیر امن: decode + جلوگیری از خروج از ریشه
    let rel: string;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return notFound();
    }
    if (rel === '/') rel = '/index.html';
    if (rel.includes('\0') || rel.includes('..')) return notFound();

    const filePath = path.resolve(publicDir, rel.slice(1));
    if (filePath !== publicDir && !filePath.startsWith(publicDir + path.sep)) return notFound();
    const base = path.basename(filePath);
    if (base === '_headers' || base.startsWith('.')) return notFound();

    let st: import('node:fs').Stats;
    try {
      st = statSync(filePath);
    } catch {
      return null; // فایل استاتیک نیست → worker تصمیم بگیرد (404 JSON، parity با پروداکشن)
    }
    if (!st.isFile()) return null;

    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const ext = path.extname(filePath).toLowerCase();
    const type = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    const headers = headersFor(
      pathname,
      { 'Content-Type': type, ETag: etag, 'Content-Length': String(st.size) }
    );

    if (ifNoneMatch !== undefined && ifNoneMatch !== null && ifNoneMatch.includes(etag)) {
      return new Response(null, { status: 304, headers });
    }
    if (method === 'HEAD') return new Response(null, { status: 200, headers });

    const body = readFileSync(filePath);
    return new Response(new Uint8Array(body), { status: 200, headers });
  }

  return { handle };
}
