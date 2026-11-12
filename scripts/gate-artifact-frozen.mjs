#!/usr/bin/env node
// گیت هم‌گامی آرتیفکت-منجمد — پس از بازیابی م۵ (منبع = باندل زندهٔ ۱.۲۵.۷۲)
// تا بازسازی کامل سورس (بدهی ثبت‌شده در CHANGELOG)، آرتیفکت‌های کامیت‌شده مرجع‌اند و
// هیچ چیز نباید آن‌ها را بی‌سر و صدا بازسازی کند. این گیت در CI و پیش از انتشار می‌دود.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = process.cwd();
let bad = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); bad += 1; };
const ok = (m) => console.log(`  ✓ ${m}`);

// ۱) نسخهٔ version.ts باید در باندل ورکر حاضر باشد
const version = readFileSync(join(root, 'src/core/version.ts'), 'utf8').match(/APP_VERSION = '([^']+)'/)?.[1];
const bundle = readFileSync(join(root, 'worker/bundle.js'), 'utf8');
if (!version) fail('src/core/version.ts نسخه ندارد');
else if (bundle.includes(version)) ok(`باندل ورکر نسخهٔ ${version} را دارد`);
else fail(`باندل ورکر نسخهٔ ${version} را ندارد — باندل کهنه است؛ هرگز بازسازی نکن، sync-artifacts-from-prod بزن`);

// ۲) نشانگرهای ویژگی‌های واقعی ۱.۲۵.۷۲ (که در سورسِ عقب موجود نیستند)
for (const marker of ['cp_seal_drift', 'health/panel', 'client-errors', 'X-Request-Id']) {
  if (bundle.includes(marker)) ok(`نشانگر ${marker} در باندل هست`);
  else fail(`نشانگر ${marker} در باندل نیست — باندل با سورسِ عقب بازسازی شده!`);
}

// ۳) boot در index.html همان مانیفست dist باشد
const html = readFileSync(join(root, 'public/index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'public/assets/dist/build-manifest.json'), 'utf8'));
const htmlBoot = html.match(/assets\/dist\/(boot\.[A-Z0-9]+\.js)/)?.[1];
if (!manifest.boot) fail('build-manifest.json برچسب boot ندارد');
else if (htmlBoot === manifest.boot) ok(`boot هم‌گام: ${manifest.boot}`);
else fail(`boot ناهمگام — index.html: ${htmlBoot ?? 'هیچ'} ≠ مانیفست: ${manifest.boot}`);

// ۴) sw.js نسخه‌خور با version.ts
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');
const swV = sw.match(/VERSION\s*=\s*'v([^']+)'/)?.[1];
if (swV === version) ok(`sw.js نسخهٔ v${version}`);
else fail(`sw.js نسخهٔ v${swV ?? '?'} ≠ ${version}`);

// ۵) فایل‌های boot/bootImports/مانیفست واقعاً روی دیسک‌اند (fresh-clone پروف)
for (const f of [manifest.boot, ...(manifest.bootImports ?? [])]) {
  if (existsSync(join(root, 'public/assets/dist', f))) ok(`dist/${f} حاضر`);
  else fail(`dist/${f} غایب — fresh-clone خراب می‌شود`);
}

if (bad) {
  console.error(`\nگیت آرتیفکت-منجمد: ${bad} خطا — انتشار ممنوع.`);
  process.exit(1);
}
console.log('\nگیت آرتیفکت-منجمد: سبز ✓');
