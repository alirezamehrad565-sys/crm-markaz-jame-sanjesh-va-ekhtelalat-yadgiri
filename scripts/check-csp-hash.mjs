#!/usr/bin/env node
/**
 * گیت دیسدیپلین هش CSP — طرح ارتقا §۴ آیتم ۱۱ (ف۲).
 * هر بلاک <script> inline در public/index.html باید sha256-اش در public/_headers
 * (script-src) باشد؛ و هر هش ثبت‌شده در _headers باید متعلق به یک بلاک inline موجود
 * باشد — بلاکِ تغییرکرده با هش کهنه = صف امنیتی شکسته در تولید، همان ریسکی که این
 * گیت پیش از دیپلوی می‌گیرد.
 * اجرا: node scripts/check-csp-hash.mjs — خروج ۰ = سبز، ۱ = قرمز.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'public', 'index.html');
const HEADERS = join(ROOT, 'public', '_headers');

const html = readFileSync(INDEX, 'utf8');
const headersText = readFileSync(HEADERS, 'utf8');

// هش‌های ثبت‌شده در CSP (script-src)
const cspLine = headersText
  .split('\n')
  .map((l) => l.trim())
  .find((l) => l.startsWith('Content-Security-Policy:'));
if (!cspLine) {
  console.error('✗ Content-Security-Policy در public/_headers پیدا نشد.');
  process.exit(1);
}
const pinned = [...cspLine.matchAll(/'sha256-([^']+)'/g)].map((m) => m[1]);

// بلاک‌های inline واقعی (script بدون src)
const inlineHashes = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html)) !== null) {
  const hash = createHash('sha256').update(m[1]).digest('base64');
  inlineHashes.push(hash);
}

if (inlineHashes.length === 0) {
  console.error('✗ هیچ بلاک <script> inline در public/index.html پیدا نشد — هش‌های CSP بی‌مصدرند.');
  process.exit(1);
}

let failed = false;
for (const h of inlineHashes) {
  if (!pinned.includes(h)) {
    console.error(`✗ بلاک inline در index.html هشِ 'sha256-${h}' است ولی در _headers نیست.`);
    failed = true;
  }
}
for (const p of pinned) {
  if (!inlineHashes.includes(p)) {
    console.error(`✗ هش 'sha256-${p}' در _headers هست ولی هیچ بلاک inline هم‌هش در index.html نیست (هش کهنه).`);
    failed = true;
  }
}

if (failed) {
  console.error('   رفع: هش CSP را با «sha256 الگوریتم روی متنِ دقیق بلاک» دوباره محاسبه و در _headers ثبت کنید.');
  process.exit(1);
}
console.log(`✓ گیت هش CSP سبز شد — ${inlineHashes.length} بلاک inline ↔ ${pinned.length} هش ثبت‌شده، کامل و بی‌هشِ کهنه.`);
