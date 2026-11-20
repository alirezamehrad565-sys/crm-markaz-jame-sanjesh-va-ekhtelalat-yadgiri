#!/usr/bin/env node
// dev شبکه‌ای — v1.27.20: همان wrangler dev اما با بایند LAN (خواست کارفرما: موبایل‌های هم‌شبکه)
// استفاده: npm run dev  — معادل «wrangler dev --ip 0.0.0.0 --port 8787» + چاپ نشانی موبایل‌ها
import { spawn } from 'node:child_process';
import { bootUrlsOf } from './engine/adapter/lan.mjs';

const PORT = 8787;
for (const url of bootUrlsOf('0.0.0.0', PORT)) console.log(`نشانی: ${url}`);
console.log('اگر از موبایل/دستگاه دیگر باز نشد: در فایروال ویندوز برای Node (یا پورت 8787) اجازهٔ ورودی بدهید');
console.log('— wrangler dev در حال بالا آمدن… (D1/دارایی‌ها محلی؛ همین نسخهٔ سرویس‌دهندهٔ تولید)');

const child = spawn('npx', ['wrangler', 'dev', '--ip', '0.0.0.0', '--port', String(PORT)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 1));
process.on('SIGINT', () => {
  try { child.kill('SIGINT'); } catch { /* بسته است */ }
});
