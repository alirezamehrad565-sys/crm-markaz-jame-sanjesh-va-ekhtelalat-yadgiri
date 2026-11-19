#!/usr/bin/env node
// فاز D-۲ چهارگانهٔ دسکتاپ (server-cloud-update-design.md §۳-۱) — ساخت latest.json برای
// tauri-plugin-updater از نسخهٔ APP_VERSION + مسیر نصاب NSIS + امضای minisign اختیاری.
// مصرف در CI (desktop-build با ورودی release=true):
//   node scripts/make-latest-json.mjs --installer <Setup.exe> [--sig <Setup.exe.sig>] --out latest.json
// نکته: URL دارایی = ریلیز draft با تگ vX — تا publish دستی کارفرما، کانال خودکار نمی‌بیند؛
// کانال دستی (check_updates + مرورگر) همیشه مستقل کار می‌کند (درس ریسک ۴ — AV ایران).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

function die(msg) {
  console.error(`خطا: ${msg}`);
  process.exit(1);
}

function argOf(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const installer = argOf('--installer');
const sigPath = argOf('--sig');
const outPath = argOf('--out') ?? 'latest.json';
if (!installer || !existsSync(resolve(installer))) die('مسیر نصاب با --installer معتبر نیست');

// نسخه از منبع حقیقت (src/core/version.ts) — نه از package.json
const versionSrc = readFileSync(resolve('src/core/version.ts'), 'utf8');
const m = versionSrc.match(/APP_VERSION = '([^']+)'/);
if (!m) die('APP_VERSION در src/core/version.ts پیدا نشد');
const version = m[1];

// owner/repo از ریموت گیت‌هاب — اعتبار URL هرگز چاپ/نوشته نمی‌شود
let slug = null;
try {
  const url = execFileSync('git', ['config', '--get', 'remote.origin.url'], { encoding: 'utf8' }).trim();
  const sm = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (sm) slug = `${sm[1]}/${sm[2]}`;
} catch { /* بی‌ریموت — با --repo بدهید */ }
slug = argOf('--repo') ?? slug;
if (!slug) die('owner/repo یافت نشد — ریموت origin یا --repo را مشخص کنید');

let signature = '';
if (sigPath) {
  if (!existsSync(resolve(sigPath))) die('فایل امضا با --sig پیدا نشد');
  signature = readFileSync(resolve(sigPath), 'utf8').trim();
} else {
  console.warn('هشدار: امضا داده نشد — latest.json بی‌امضا ساخته شد (کانال خودکار نصب را رد می‌کند؛ کانال دستی سالم است)');
}

const latest = {
  version,
  notes: `نسخهٔ ${version} — یادداشت کامل در بدنهٔ ریلیز گیت‌هاب`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url: `https://github.com/${slug}/releases/download/v${version}/${basename(installer)}`
    }
  }
};

writeFileSync(resolve(outPath), `${JSON.stringify(latest, null, 2)}\n`, 'utf8');
console.log(`latest.json ساخته شد — نسخهٔ ${version} · ${basename(installer)} · ${slug} · امضا: ${signature ? 'دارد' : 'ندارد'}`);
