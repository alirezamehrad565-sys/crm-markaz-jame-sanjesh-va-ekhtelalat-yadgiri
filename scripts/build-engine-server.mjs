#!/usr/bin/env node
// scripts/build-engine-server.mjs — باندل تک‌فایلی موتور دسکتاپ (v1.27.03)
//
// engine.mjs (با --engine adapter) + adapter/server.mjs + adapter/d1.mjs و همهٔ ماژول‌های
// عملیاتی (مایگریشن/پشتیبان/رویدادهای انسانی/ناظر بازی‌ها) را در «scripts/engine/engine-server.js»
// می‌بندد — تنها فایلی که نصاب دسکتاپ برای موتور لازم دارد (کنار node.exe سایدکار).
// باندل‌های ورکر (worker/bundle.js و worker/games-bundle.js) عمداً داخل باندل نیستند:
// در زمان اجرا با --main-bundle/--games-bundle از resources داینامیک import می‌شوند تا
// بازسازی باندل ورکر به بازسازی موتور وابسته نباشد.
import { build } from 'esbuild';
import { statSync } from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = path.join(root, 'scripts/engine/engine-server.js');

await build({
  entryPoints: [path.join(root, 'scripts/engine/engine-server-entry.mjs')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'info',
});

const bytes = statSync(out).size;
console.log(`✓ engine-server.js بسته شد — ${bytes} bytes`);
