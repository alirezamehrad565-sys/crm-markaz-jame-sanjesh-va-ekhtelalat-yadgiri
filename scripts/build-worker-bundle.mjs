#!/usr/bin/env node
// ساخت باندل ورکر از منبع (src/) با esbuild — جایگزین «ویرایش جراحی» worker/bundle.js
// استفاده: node scripts/build-worker-bundle.mjs
// سپس برای اطمینان: node scripts/bundle-smoke.mjs worker/bundle.js worker/bundle.js  (همیشه بدون خطا)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'worker', 'bundle.js');

const esbuild = path.join(root, 'node_modules', '.bin', 'esbuild');
const args = [
  path.join(root, 'worker', 'src-entry.mjs'),
  '--bundle',
  '--format=esm',
  '--platform=neutral',
  '--target=es2022',
  '--keep-names',
  `--outfile=${out}`
];
execFileSync(esbuild, args, { stdio: 'inherit' });

// سربرگ توضیحی فارسی + یادداشت «دست نزنید — از منبع ساخته می‌شود»
const banner = `/**
 * بک‌اند کامل سامانه (Hono + D1) — ساخته‌شده از منبع با scripts/build-worker-bundle.mjs
 * ⚠ این فایل را دستی ویرایش نکنید — تغییرها را در src/ بدهید و باندل را بازسازی کنید.
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
`;
const body = readFileSync(out, 'utf8');
writeFileSync(out, banner + body, 'utf8');

const version = readFileSync(path.join(root, 'src', 'core', 'version.ts'), 'utf8')
  .match(/APP_VERSION = '([^']+)'/)?.[1] ?? '?';
const size = Buffer.byteLength(body, 'utf8');
console.log(`✓ worker/bundle.js بازسازی شد — نسخهٔ ${version} — ${(size / 1024 / 1024).toFixed(2)}MB`);
