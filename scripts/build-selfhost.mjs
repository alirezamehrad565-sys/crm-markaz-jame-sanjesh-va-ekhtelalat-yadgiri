/**
 * بیلد لایهٔ سلف‌هاست — باندل کردن ورودی Node (سرور + CLI) با esbuild
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 *
 * خروجی: dist/server.js (سرور HTTP + کرون) و dist/cli.js (نگهداری/بازیابی)
 * وابستگی‌های npm (hono/zod/@hono/node-server) داخل باندل قرار می‌گیرند تا ایمیج
 * ران‌تایم بدون node_modules باشد؛ فقط ماژول‌های بومی node: بیرونی می‌مانند.
 */
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  tsconfig: 'tsconfig.json',
  sourcemap: false,
  logLevel: 'info',
  packages: undefined, // همه باندل می‌شوند؛ node: builtins با platform=node خودکار external اند
  external: ['@cloudflare/workers-types']
};

await Promise.all([
  build({
    ...common,
    entryPoints: ['server/node-main.ts'],
    outfile: 'dist/server.js'
  }),
  build({
    ...common,
    entryPoints: ['server/cli.ts'],
    outfile: 'dist/cli.js'
  })
]);

console.log('✓ dist/server.js + dist/cli.js ساخته شد');
