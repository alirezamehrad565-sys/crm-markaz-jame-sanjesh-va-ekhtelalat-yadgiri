#!/usr/bin/env node
// باندل کلاینت نام‌دار
//
// چرا باندل کامل با splitting و نه فقط «باندل پوسته»؟
//   نماها ui.js/api.js/format.js/state.js را جدا import می‌کنند؛ اگر فقط پوسته باندل شود،
//   این ماژول‌ها دو بار اجرا می‌شوند (دو نمونهٔ session = باگ واقعی). esbuild با splitting:true
//   ماژول‌های مشترک را یک‌بار در چانک مشترک می‌گذارد — تک‌نمونه‌ای بودن ماژول‌ها حفظ می‌شود.
//
// خروجی:
//   public/assets/dist/boot.[hash].js      — ورودی پوسته (app.js + گراف ایگر)
//   public/assets/dist/[name].[hash].js    — چانک‌های نما (dynamic import) + چانک‌های مشترک
//   public/assets/dist/build-manifest.json — مانیفست برای گات بودجه (perf-budget.mjs)
//   index.html: تگ اسکریپت app.js?v= → boot.[hash].js + modulepreload چانک‌های استاتیک بوت
//
// استفاده: node scripts/build-client.mjs [--outdir <dir>] [--html <file>] [--no-html] [--quiet]
//   پرچم‌ها برای آزمون (خروجی موقت بدون دست‌زدن به index.html واقعی).

import { rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PUB = resolve(ROOT, 'public');

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const QUIET = argv.includes('--quiet');
const NO_HTML = argv.includes('--no-html');
const OUT_DIR = resolve(ROOT, argOf('--outdir') ?? 'public/assets/dist');
const HTML_FILE = resolve(ROOT, argOf('--html') ?? 'public/index.html');
const ENTRY = resolve(PUB, 'assets/js/app.js');

const say = (...m) => { if (!QUIET) console.log(...m); };

if (!existsSync(ENTRY)) {
  console.error(`✋ ورودی پیدا نشد: ${ENTRY}`);
  process.exit(1);
}

// — پاک‌سازی خروجی قبلی (نام‌های hashدار قدیمی نباید بمانند)
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

let result;
try {
  result = await esbuild.build({
    entryPoints: [ENTRY],
    outdir: OUT_DIR,
    entryNames: 'boot.[hash]',
    chunkNames: '[name].[hash]',
    bundle: true,
    splitting: true,
    format: 'esm',
    target: ['es2020'],
    platform: 'browser',
    minify: true,
    charset: 'utf8',
    legalComments: 'inline', // سرشناسی MIT (web-vitals) باید بماند
    metafile: true,
    logLevel: 'silent',
    sourcemap: false // منبع خام خودش عمومی است (assets/js) — نقشهٔ جدا اضافه نمی‌کند
  });
} catch (err) {
  console.error('✋ esbuild شکست خورد:');
  for (const e of err?.errors ?? []) console.error(`   • ${e.text}${e.location ? ` — ${e.location.file}:${e.location.line}` : ''}`);
  process.exit(1);
}

for (const w of result.warnings ?? []) {
  console.warn(`⚠ esbuild: ${w.text}${w.location ? ` — ${w.location.file}:${w.location.line}` : ''}`);
}

// — تحلیل metafile: ورودی بوت + چانک‌های استاتیکش (همان‌هایی که لحظهٔ بوت لازم‌اند)
const outputs = result.metafile.outputs;
const bootKey = Object.keys(outputs).find((k) => outputs[k].entryPoint && outputs[k].entryPoint.endsWith('app.js'));
if (!bootKey) { console.error('✋ خروجی boot در metafile پیدا نشد.'); process.exit(1); }
const bootFile = basename(bootKey);
const bootImportNames = (outputs[bootKey].imports ?? [])
  .filter((i) => i.kind === 'import-statement') // esbuild 0.28: کلید «kind» است نه importKind
  .map((i) => basename(i.path));

const outFiles = Object.keys(outputs).filter((k) => !outputs[k].entryPoint || k === bootKey);
const manifest = {
  _comment: 'مانیفست باندل کلاینت؛ گات بودجه (perf-budget.mjs) از این می‌خواند. فایل ساخته‌شده است — دستی ویرایش نشود.',
  boot: bootFile,
  bootImports: bootImportNames,
  outputs: [],
  totals: { files: 0, raw: 0, gz: 0 }
};

let totalRaw = 0, totalGz = 0;
const rows = [];
for (const k of Object.keys(outputs).sort()) {
  if (!k.endsWith('.js')) continue;
  const abs = resolve(ROOT, k);
  const buf = readFileSync(abs);
  const gz = gzipSync(buf, { level: 9 }).length;
  const isBoot = k === bootKey;
  const isBootDep = bootImportNames.includes(basename(k));
  rows.push({ name: basename(k), raw: buf.length, gz, role: isBoot ? 'boot' : isBootDep ? 'boot-dep' : 'lazy' });
  totalRaw += buf.length; totalGz += gz;
}
manifest.outputs = rows;
manifest.totals = { files: rows.length, raw: totalRaw, gz: totalGz };
writeFileSync(resolve(OUT_DIR, 'build-manifest.json'), JSON.stringify(manifest, null, 2));

// — بازنویسی index.html: تگ اسکریپت ورودی → boot.[hash].js + modulepreload چانک‌های بوت
//   idempotent: هم تگ قدیمی app.js?v= و هم بلاکِ ساخته‌شدهٔ اجرای قبلی (preload+کامنت+تگ boot) را می‌گیرد
if (!NO_HTML) {
  const htmlPath = HTML_FILE;
  const html = readFileSync(htmlPath, 'utf8');
  const RE_BLOCK = new RegExp(
    '(?:[ \\t]*<link rel="modulepreload" href="/assets/dist/[^"]*" />\\n?)*' +
    '[ \\t]*<!--[^\n]*[^\\n]*-->\\n?' +
    '[ \\t]*<script type="module" src="(?:/assets/js/app\\.js\\?v=[^"]*|/assets/dist/boot\\.[A-Za-z0-9_-]+\\.js)"></script>'
  );
  if (!RE_BLOCK.test(html)) {
    console.error('✋ تگ اسکریپت ورودی در index.html پیدا نشد — الگوی انتظاری عوض شده است.');
    process.exit(1);
  }
  const preloads = bootImportNames
    .map((n) => `  <link rel="modulepreload" href="/assets/dist/${n}" />`)
    .join('\n');
  const tag = `${preloads}\n <!-- ورودی باندل نام‌دار (hashدار؛ کش یک‌ساله immutable در _headers) — با build-client.mjs بازسازی می‌شود -->\n <script type="module" src="/assets/dist/${bootFile}"></script>`;
  writeFileSync(htmlPath, html.replace(RE_BLOCK, tag));
  say(`   index.html → boot/${bootFile} + ${bootImportNames.length} modulepreload`);
}

// — خودآزمایی: هیچ خروجی xlsx در dist نیست (وندور سنگین باید script-injected بماند)
const xlsxOut = rows.filter((r) => /xlsx/i.test(r.name));
if (xlsxOut.length) {
  console.error('✋ xlsx وارد گراف باندل شده — باید on-demand (تزریق script) بماند.');
  process.exit(1);
}

const bootRow = rows.find((r) => r.role === 'boot');
const bootDepsGz = rows.filter((r) => r.role === 'boot-dep').reduce((s, r) => s + r.gz, 0);
say(`   boot: ${bootRow.name} — ${(bootRow.gz / 1024).toFixed(1)}KB gz (+ چانک بوت ${(bootDepsGz / 1024).toFixed(1)}KB)`);
say(`   کل باندل: ${manifest.totals.files} فایل — ${(totalRaw / 1024).toFixed(0)}KB خام → ${(totalGz / 1024).toFixed(0)}KB gzip`);

// — گیت داخلی: بوت (باندل + چانک‌های لحظهٔ بوت) نباید از خط پایهٔ pre-bundle بزرگ‌تر شود
if (bootRow.gz + bootDepsGz > 413550) {
  console.error('✋ پیل بوت باندل‌شده از خط پایهٔ ۴۱۳٬۵۵۰ بایت gzip بزرگ‌تر شد — انتظار −۸۰٪ بود.');
  process.exit(1);
}
say('   build-client: ✓');
