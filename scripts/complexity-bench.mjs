#!/usr/bin/env node
// scripts/complexity-bench.mjs — بنچمارک کمپلکس‌بودن کد (۱.۲۷.۴۴)
//
// سؤال کارفرما: «چون AI همه‌چیز را از پایه می‌سازد، کد کمپلکس و ناخوانا نشده؟»
// این اسکریپت با عدد جواب می‌دهد — بدون وابستگی خارجی، روی کد اجرایی (بدون tests):
//   · LOC فایل + طول توابع (P50/P90/max) + شمار توابع بلند
//   · کمپلکسیتی سیکلوماتیک تقریبی هر تابع (تصمیم‌ها: if/for/while/case/catch/&&/||/?:)
//   · عمق تودرتویی بیشینهٔ هر تابع
//   · تکرار بلوکی بین‌فایلی (پنجرهٔ ۸خطی نرمال‌شده) = بوی «از پایه ساختن»
//   · سهم دو سبک UI: DOM کمکی el() در برابر HTML رشته‌ای
// حالت‌ها:
//   node scripts/complexity-bench.mjs              → گزارش + (اگر بیس‌لاین هست) مقایسه
//   node scripts/complexity-bench.mjs --baseline   → نوشتن/به‌روزرسانی بیس‌لاین
//   node scripts/complexity-bench.mjs --gate       → گیت رِچت: بدترشدن معنادار = خطا
// بیس‌لاین: scripts/complexity-baseline.json — عدد بد → بهتر شدن آزاد، بدترشدن > آستانه = fail.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, 'scripts/complexity-baseline.json');
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', 'test', 'target', 'resources', 'bundles']);
// باندل‌های worker/*.js خروجی esbuild و مینیفای‌شده‌اند — «سورس» نیستند و فقط عدد را می‌آلودند
const TARGETS = ['src', 'public/assets/js'];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      yield* walk(p);
    } else if (/\.(ts|js)$/.test(name) && !/\.test\.ts$|\.d\.ts$/.test(name)) {
      yield p;
    }
  }
}

/* ── تجزیهٔ تابع‌ها: خط‌های function/method/arrow-assign و بستن با توازن آکولاد ── */
function analyzeFile(file) {
  const raw = readFileSync(file, 'utf8').split('\n');
  const src = raw.join('\n');
  const noComments = raw
    .map((l) => l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, ''))
    .join('\n');
  const loc = raw.filter((l) => l.trim().length > 0 && !/^\s*(\/\/|\*|\/\*)/.test(l)).length;

  const fns = [];
  const FN_HEAD = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|(\w+)\s*\(\s*[^)]*\)\s*:\s*[^{]+\{\s*$|\bconst\s+(\w+)\s*=\s*(?:async\s*)?\(/;
  const lines = noComments.split('\n');
  let cur = null;
  let depth = 0;
  let fnDepth = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!cur && FN_HEAD.test(line)) {
      cur = { name: (line.match(/function\s+(\w+)|(\w+)\s*\(\s*[^)]*\)\s*:/) || [line, line.trim().slice(0, 24)])[1] || line.trim().slice(0, 24), start: i, decisions: 0, maxDepth: 0 };
      fnDepth = depth;
    }
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (cur && depth <= fnDepth && fnDepth >= 0) {
          fns.push({ ...cur, length: i - cur.start + 1 });
          cur = null;
          fnDepth = -1;
        }
      } else if (ch !== undefined && cur) {
        if (depth - fnDepth > cur.maxDepth) cur.maxDepth = depth - fnDepth;
      }
    }
    if (cur) {
      cur.decisions += (line.match(/\b(if|for|while|case|catch)\b/g) || []).length;
      cur.decisions += (line.match(/&&|\|\|/g) || []).length;
      cur.decisions += (line.match(/\?[^.?:]/g) || []).length; // ternary
    }
  }
  if (cur) fns.push({ ...cur, length: lines.length - cur.start });

  return {
    file: path.relative(ROOT, file),
    loc,
    fns,
    maxFnLength: fns.reduce((m, f) => Math.max(m, f.length), 0),
    totalDecisions: fns.reduce((m, f) => m + f.decisions, 0),
    maxNesting: fns.reduce((m, f) => Math.max(m, f.maxDepth), 0),
    usesElHelper: /import\s*\{[^}]*\bel\b[^}]*\}\s*from/.test(src) || /\bel\(/.test(src),
    buildsHtmlStrings: (/(?:innerHTML|insertAdjacentHTML)/.test(src) || /return\s+`<[a-z]/.test(src) || /'<(div|section|table|form)/.test(src)),
    content: src
  };
}

/* ── تکرار بلوکی: پنجرهٔ ۸خطی نرمال‌شده ── */
function duplication(all) {
  const WIN = 8;
  const seen = new Map();
  let totalWindows = 0;
  let dupWindows = 0;
  const dupHotspots = new Map();
  for (const f of all) {
    const norm = f.content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('*'))
      .map((l) => l.replace(/\s+/g, ' ').replace(/['"`].*?['"`]/g, 'Q'));
    for (let i = 0; i + WIN <= norm.length; i++) {
      const h = norm.slice(i, i + WIN).join('\n');
      totalWindows++;
      if (seen.has(h)) {
        dupWindows++;
        dupHotspots.set(f.file, (dupHotspots.get(f.file) ?? 0) + 1);
      } else seen.set(h, f.file);
    }
  }
  return {
    ratio: totalWindows ? dupWindows / totalWindows : 0,
    hotspots: [...dupHotspots.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  };
}

const all = [];
for (const t of TARGETS) {
  const base = path.join(ROOT, t);
  if (existsSync(base)) for (const f of walk(base)) all.push(analyzeFile(f));
}

/* ── تجمیع ── */
const totalLoc = all.reduce((m, f) => m + f.loc, 0);
const allFns = all.flatMap((f) => f.fns.map((x) => ({ ...x, file: f.file })));
const lenSorted = allFns.map((f) => f.length).sort((a, b) => a - b);
const pct = (p) => (lenSorted.length ? lenSorted[Math.floor(p * (lenSorted.length - 1))] : 0);
const topFiles = [...all].sort((a, b) => b.loc - a.loc).slice(0, 12);
const worstFns = [...allFns].sort((a, b) => b.length * 1000 + b.decisions - (a.length * 1000 + a.decisions)).slice(0, 12);
const dup = duplication(all);
const elFiles = all.filter((f) => f.usesElHelper).length;
const htmlFiles = all.filter((f) => f.buildsHtmlStrings).length;
const godFiles = all.filter((f) => f.loc >= 600);
const longFns = allFns.filter((f) => f.length >= 80);

const summary = {
  files: all.length,
  totalLoc,
  fnCount: allFns.length,
  fnLen: { p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: lenSorted[lenSorted.length - 1] ?? 0 },
  fnsOver80: longFns.length,
  fnsOver150: allFns.filter((f) => f.length >= 150).length,
  filesOver600: godFiles.length,
  maxFileLoc: topFiles[0]?.loc ?? 0,
  topFilesSum: topFiles.reduce((m, f) => m + f.loc, 0),
  dupRatio: Number(dup.ratio.toFixed(4)),
  elFiles,
  htmlFiles
};

console.log('─── بنچمارک کمپلکسیتی ۱.۲۷.۴۴ ───');
console.log(`فایل: ${all.length} · LOC اجرایی: ${totalLoc} · تابع: ${allFns.length}`);
console.log(`طول تابع P50=${summary.fnLen.p50} · P90=${summary.fnLen.p90} · P99=${summary.fnLen.p99} · max=${summary.fnLen.max}`);
console.log(`توابع ≥۸۰خط: ${summary.fnsOver80} · ≥۱۵۰خط: ${summary.fnsOver150} · فایل ≥۶۰۰LOC: ${summary.filesOver600}`);
console.log(`تکرار بلوکی بین‌فایلی: ${(summary.dupRatio * 100).toFixed(1)}%`);
console.log(`سبک UI: el()-DOM در ${elFiles} فایل · HTML رشته‌ای در ${htmlFiles} فایل`);
console.log('۱۲ فایل بزرگ:', topFiles.map((f) => `${f.file.split('/').slice(-2).join('/')}:${f.loc}`).join(' · '));
console.log('-heavy توابع:');
for (const f of worstFns.slice(0, 10)) console.log(`  ${f.file.split('/').slice(-2).join('/')}::${f.name} — ${f.length}خط · تصمیم=${f.decisions} · تودرتویی=${f.maxDepth}`);
console.log('هات‌اسپات تکرار:', dup.hotspots.map(([f, n]) => `${f.split('/').slice(-1)[0]}:${n}`).join(' · '));

/* ── حالت‌ها ── */
const arg = process.argv[2] ?? '';
if (arg === '--baseline') {
  writeFileSync(BASELINE_PATH, JSON.stringify(summary, null, 2) + '\n');
  console.log('✓ بیس‌لاین نوشته شد →', path.relative(ROOT, BASELINE_PATH));
  process.exit(0);
}
if (arg === '--gate') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('گیت: بیس‌لاین نیست — اول با --baseline بسازید');
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const problems = [];
  if (summary.totalLoc > base.totalLoc * 1.02) problems.push(`LOC کل رشد کرد: ${base.totalLoc} → ${summary.totalLoc} (+${((summary.totalLoc / base.totalLoc - 1) * 100).toFixed(1)}%)`);
  if (summary.filesOver600 > base.filesOver600) problems.push(`فایل ≥۶۰۰LOC زیاد شد: ${base.filesOver600} → ${summary.filesOver600}`);
  if (summary.maxFileLoc > Math.max(600, base.maxFileLoc * 1.02)) problems.push(`بزرگ‌ترین فایل بزرگ‌تر شد: ${base.maxFileLoc} → ${summary.maxFileLoc}`);
  if (summary.fnsOver80 > base.fnsOver80) problems.push(`توابع ≥۸۰خط زیاد شد: ${base.fnsOver80} → ${summary.fnsOver80}`);
  if (summary.dupRatio > base.dupRatio * 1.1) problems.push(`تکرار بلوکی بدتر شد: ${(base.dupRatio * 100).toFixed(1)}% → ${(summary.dupRatio * 100).toFixed(1)}%`);
  if (problems.length) {
    console.error('گیت کمپلکسیتی سرخ:', problems.join(' · '));
    process.exit(1);
  }
  console.log('✓ گیت کمپلکسیتی سبز — هیچ سنجه‌ای بدتر از بیس‌لاین نشده');
  process.exit(0);
}
