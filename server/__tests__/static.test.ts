/**
 * تست سروِ استاتیک سلف‌هاست — پارسر _headers، کش، 304 و امنیت مسیر
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { createStaticServer, parseHeadersFile, patternToRegex } from '../static';

const dirs: string[] = [];

function tempPublic(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'static-'));
  dirs.push(dir);
  writeFileSync(path.join(dir, 'index.html'), '<html>shell</html>');
  writeFileSync(path.join(dir, 'sw.js'), 'self_version=1');
  writeFileSync(path.join(dir, '_headers'), [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '/',
    '  Cache-Control: no-cache',
    '/index.html',
    '  Cache-Control: no-cache',
    '/assets/js/*',
    '  Cache-Control: public, max-age=300, must-revalidate',
    ''
  ].join('\n'));
  mkdirSync(path.join(dir, 'assets', 'js'), { recursive: true });
  writeFileSync(path.join(dir, 'assets', 'js', 'app.js'), 'export {}');
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('parseHeadersFile', () => {
  it('۱ — قواعد به‌ترتیب پارس می‌شوند و کامنت/خالی نادیده است', () => {
    const rules = parseHeadersFile('# comment\n/*\n  A: 1\n  # inner comment\n/x/*\n  B: 2\n');
    expect(rules).toHaveLength(2);
    // تابعی: /* همه‌چیز زیر ریشه را می‌گیرد
    expect(rules[0]?.pattern.test('/')).toBe(true);
    expect(rules[0]?.pattern.test('/index.html')).toBe(true);
    expect(rules[0]?.headers).toEqual({ A: '1' });
    expect(rules[1]?.headers).toEqual({ B: '2' });
  });

  it('۲ — patternToRegex لنگردار است', () => {
    expect(patternToRegex('/assets/*').test('/assets/js/app.js')).toBe(true);
    expect(patternToRegex('/assets/*').test('/assetsx/js')).toBe(false);
    expect(patternToRegex('/').test('/')).toBe(true);
    expect(patternToRegex('/').test('/index.html')).toBe(false);
  });
});

describe('createStaticServer', () => {
  it('۳ — index.html با no-cache و nosniff سرو می‌شود', () => {
    const srv = createStaticServer(tempPublic());
    const res = srv.handle('/', 'GET', null);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(res?.headers.get('content-type')).toContain('text/html');
    expect(res?.headers.get('cache-control')).toBe('no-cache'); // قاعدهٔ خاص‌تر برنده
    expect(res?.headers.get('x-content-type-options')).toBe('nosniff'); // قاعدهٔ /* باقی می‌ماند
    expect(res?.headers.get('etag')).toBeTruthy();
  });

  it('۴ — ETag/304 و HEAD', async () => {
    const dir = tempPublic();
    const srv = createStaticServer(dir);
    const first = srv.handle('/sw.js', 'GET', null);
    const etag = first?.headers.get('etag') ?? '';
    expect(etag).toBeTruthy();
    const again = srv.handle('/sw.js', 'GET', etag);
    expect(again?.status).toBe(304);
    const head = srv.handle('/sw.js', 'HEAD', null);
    expect(head?.status).toBe(200);
    const body = await head?.text();
    expect(body).toBe('');
  });

  it('۵ — JS با قاعدهٔ /assets/js/* کش ۵ دقیقه‌ای می‌گیرد', () => {
    const srv = createStaticServer(tempPublic());
    const res = srv.handle('/assets/js/app.js', 'GET', null);
    expect(res?.headers.get('cache-control')).toBe('public, max-age=300, must-revalidate');
  });

  it('۶ — traversal، _headers و dotfile سرو نمی‌شوند', () => {
    const dir = tempPublic();
    const srv = createStaticServer(dir);
    expect(srv.handle('/../etc/passwd', 'GET', null)?.status).toBe(404);
    expect(srv.handle('/%2e%2e/secret', 'GET', null)?.status).toBe(404);
    expect(srv.handle('/_headers', 'GET', null)?.status).toBe(404);
    writeFileSync(path.join(dir, '.env'), 'SECRET=1');
    expect(srv.handle('/.env', 'GET', null)?.status).toBe(404);
  });

  it('۷ — مسیر ناشناخته → null (رفتن به worker)', () => {
    const srv = createStaticServer(tempPublic());
    expect(srv.handle('/api/students', 'GET', null)).toBeNull();
    expect(srv.handle('/health', 'GET', null)).toBeNull();
    expect(srv.handle('/nope.txt', 'GET', null)).toBeNull();
  });
});
