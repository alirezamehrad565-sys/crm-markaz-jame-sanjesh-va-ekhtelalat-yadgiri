#!/usr/bin/env node
// ساخت باندل مستقل ماژول بازی‌ها با esbuild — هم‌الگوی build-worker-bundle.mjs
// استفاده: node scripts/build-worker-games.mjs
// سپس برای اطمینان: node scripts/games-bundle-smoke.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'worker', 'games-bundle.js');

const esbuild = path.join(root, 'node_modules', '.bin', 'esbuild');
const args = [
  path.join(root, 'src', 'games-worker.ts'),
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
 * بک‌اند مستقل ماژول بازی‌های درمانی (Hono + D1) — ساخته‌شده از منبع با scripts/build-worker-games.mjs
 * ⚠ این فایل را دستی ویرایش نکنید — تغییرها را در src/games-worker.ts و src/application/games-standalone بدهید و باندل را بازسازی کنید.
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
`;
const body = readFileSync(out, 'utf8');
writeFileSync(out, banner + body, 'utf8');

const version = readFileSync(path.join(root, 'src', 'core', 'version.ts'), 'utf8')
  .match(/APP_VERSION = '([^']+)'/)?.[1] ?? '?';
const size = Buffer.byteLength(body, 'utf8');
console.log(`✓ worker/games-bundle.js بازسازی شد — نسخهٔ ${version} — ${(size / 1024 / 1024).toFixed(2)}MB`);
