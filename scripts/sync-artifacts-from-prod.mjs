#!/usr/bin/env node
// همگام‌سازی آرتیفکت مخزن با تولید زنده — بازیابی م۵ (منبع واقعی = باندل زندهٔ ۱.۲۵.۷۲)
// استفاده: node scripts/sync-artifacts-from-prod.mjs [--apply]
// بدون --apply فقط گزارش تفاوت می‌دهد (dry-run).
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://center-system.sanjeshm.workers.dev';
const APPLY = process.argv.includes('--apply');
const root = process.cwd();
const distDir = join(root, 'public', 'assets', 'dist');

function fetchBuf(path) {
  return execFileSync('curl', ['-s', '--max-time', '60', `${BASE}${path}`], {
    maxBuffer: 20 * 1024 * 1024,
  });
}

const log = (...a) => console.log(...a);
const changes = [];

// ۱) مانیفست زنده
const manifest = JSON.parse(fetchBuf('/assets/dist/build-manifest.json').toString());
const liveFiles = new Set([manifest.boot, ...(manifest.bootImports ?? [])]);
for (const o of manifest.outputs ?? []) liveFiles.add(o.name);
log(`مانیفست زنده: boot=${manifest.boot} — ${liveFiles.size} فایل`);

// ۲) باندل ورکر زنده — از دانلود API کلادفلر (multipart) بخش entry.js استخراج می‌شود
import { existsSync } from 'node:fs';
const deployedPath = '/tmp/deployed-now.js';
if (!existsSync(deployedPath)) {
  console.error('فایل /tmp/deployed-now.js نیست — اول با API کلادفلر دانلودش کن:');
  console.error('  curl -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/scripts/center-system" -o /tmp/deployed-now.js');
  process.exit(1);
}
function extractEntryJs(rawBuf) {
  const raw = rawBuf.toString('latin1');
  if (!raw.startsWith('--')) return rawBuf; // اسکریپت خام — نه multipart
  const boundary = raw.split('\n', 1)[0].trim().replace(/^--/, '');
  const tokens = raw.split(`--${boundary}`);
  for (const t of tokens.slice(1)) {
    if (t.startsWith('--')) break; // closing --
    const body = t.replace(/^\r?\n/, '');
    const sep = body.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
    const [head, ...rest] = body.split(sep);
    if (/name="entry\.js"/.test(head)) {
      return Buffer.from(rest.join(sep).replace(/\r?\n$/, ''), 'latin1');
    }
  }
  throw new Error('بخش entry.js در multipart پیدا نشد');
}
const workerBundle = extractEntryJs(readFileSync(deployedPath));
const localBundle = readFileSync(join(root, 'worker', 'bundle.js'));
if (!workerBundle.equals(localBundle)) {
  changes.push(`worker/bundle.js: ${localBundle.length} → ${workerBundle.length} بایت`);
  if (APPLY) writeFileSync(join(root, 'worker', 'bundle.js'), workerBundle);
}

// ۳) فایل‌های dist زنده
const localFiles = new Set(readdirSync(distDir));
for (const name of [...liveFiles].sort()) {
  const buf = fetchBuf(`/assets/dist/${name}`);
  const p = join(distDir, name);
  let same = false;
  try { same = buf.equals(readFileSync(p)); } catch { same = false; }
  if (!same) {
    changes.push(`dist/${name}: ${same === false && existsSync(p) ? 'به‌روزرسانی' : 'افزودن'} (${buf.length} بایت)`);
    if (APPLY) writeFileSync(p, buf);
  }
  localFiles.delete(name);
}
// حذف فایل‌های محلی که در مجموعهٔ زنده نیستند (به‌جز خود مانیفست و build-manifest)
for (const name of [...localFiles].sort()) {
  if (name === 'build-manifest.json') continue;
  changes.push(`dist/${name}: حذف (در تولید زنده نیست)`);
  if (APPLY) unlinkSync(join(distDir, name));
}

// ۴) مانیفست محلی — بایت‌به‌بایت با زنده
const liveManifest = fetchBuf('/assets/dist/build-manifest.json');
if (!liveManifest.equals(readFileSync(join(distDir, 'build-manifest.json')))) {
  changes.push('dist/build-manifest.json: به‌روزرسانی');
  if (APPLY) writeFileSync(join(distDir, 'build-manifest.json'), liveManifest);
}

// ۵) index.html و sw.js زنده
for (const [urlPath, localPath] of [['/', 'public/index.html'], ['/sw.js', 'public/sw.js']]) {
  const buf = fetchBuf(urlPath);
  let local;
  try { local = readFileSync(join(root, localPath)); } catch { local = Buffer.alloc(0); }
  if (!buf.equals(local)) {
    changes.push(`${localPath}: ${local.length} → ${buf.length} بایت`);
    if (APPLY) writeFileSync(join(root, localPath), buf);
  }
}

log(changes.length ? changes.map((c, i) => `${i + 1}. ${c}`).join('\n') : 'هیچ تفاوتی نیست — مخزن هم‌گام است.');
log(APPLY ? `اعمال شد: ${changes.length} تغییر` : 'حالت dry-run — با --apply اعمال کن.');
if (changes.length && !APPLY) process.exit(2);
