#!/usr/bin/env node
/**
 * گیت رجیستری مسیرها — ۱.۲۷.۸۱ (sdt158): بستن architecture-004 با «گزینهٔ الف» Decide
 * (ADR-012): قرارداد «routes.ts در دامنه» تثبیت می‌شود و این مانیفست نقطهٔ واحدِ کشف
 * مسیرها می‌گردد (done_when بند اول یافته). اسکن سورس: فراخوانی‌های ثبت هونو با گیرندهٔ
 * app. در src (بدون __tests__)، حذف خطوط کامنت، گشودن ثابت‌های لفظی محلی (مثل FILL_PATH).
 * zone هر ماژول از محل فراخوانی register آن در api-routing/routes.ts مشتق می‌شود
 * (اجزای عمومیِ زنجیره پیش از گیت auth + دو mount زیراپ) — نه از حدس دستی.
 *
 *   node scripts/check-route-registry.mjs            → مقایسه با مانیفست؛ واگرایی = exit 1
 *   node scripts/check-route-registry.mjs --update   → بازنویسی مانیفست (هم‌الگوی migrations-manifest)
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep, dirname, posix } from 'node:path';

const ROOT = process.cwd();
const MANIFEST_PATH = join(ROOT, 'docs', 'route-registry.json');
const UPDATE = process.argv.includes('--update');
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/* ---------- پیمایش src (بدون آزمون‌ها و ساخت‌ها) ---------- */
function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === '__tests__' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|js)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** حذف خطوط کامنت (// و * و /* آغازین) — ثبت مسیر داخل کامنت نباید شمرده شود */
const stripComments = (src) =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');

const CALL_RE = /\bapp\.(get|post|put|patch|delete|route)\(\s*(?:(['"`])([^'"`]+)\2|([A-Z][A-Z0-9_]+))\s*[,)]/g;
const CONST_RE = /\bconst\s+([A-Z][A-Z0-9_]+)\s*=\s*(['"`])([^'"`]+)\2/g;

function layerOf(rel) {
  if (rel.startsWith('src/domain/')) return 'domain';
  if (rel.startsWith('src/application/')) return 'application';
  return 'other';
}

/* ---------- اسکن ثبت‌ها ---------- */
const modules = new Map(); // rel → { file, layer, entries:Set<'GET /p'>, mounts:Set<string> }
for (const abs of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, abs).split(sep).join('/');
  const src = readFileSync(abs, 'utf8');
  const body = stripComments(src);
  const consts = {};
  for (const m of body.matchAll(CONST_RE)) consts[m[1]] = m[3];
  const mod = { file: rel, layer: layerOf(rel), entries: new Set(), mounts: new Set() };
  for (const m of body.matchAll(CALL_RE)) {
    const [, method, , quoted, bare] = m;
    const raw = quoted ?? bare;
    let path = raw;
    if (!path.startsWith('/') && consts[path] !== undefined) path = consts[path]; // ثابت محلی (مثل FILL_PATH)
    if (method === 'route') mod.mounts.add(path);
    else mod.entries.add(`${method.toUpperCase()} ${path}`);
  }
  if (mod.entries.size || mod.mounts.size) modules.set(rel, mod);
}

/* ---------- مشتق zone از محل فراخوانی register در api-routing/routes.ts ---------- */
const routerSrc = stripComments(
  readFileSync(join(ROOT, 'src/application/api-routing/routes.ts'), 'utf8')
);

/** گشودن مسیر ایمپورت: فایل مشخص یا پوشهٔ ماژول (barrel دامنه) */
function resolveTarget(spec) {
  let base;
  if (spec.startsWith('.')) base = posix.normalize(posix.join('src/application/api-routing', spec));
  else if (spec.startsWith('@domain/')) base = `src/domain/${spec.slice('@domain/'.length)}`;
  else if (spec.startsWith('@app/')) base = `src/application/${spec.slice('@app/'.length)}`;
  else if (spec.startsWith('@sync/')) base = `src/${spec.slice('@sync/'.length)}`; /* architecture-007 (۱.۲۷.۸۴) — خانوادهٔ سینک با alias mount می‌شود */
  else return null;
  // تک‌فایلِ مستقیم مقدم است (مثل '@app/instance-sync/desktop-routes' یا '../node-sync/app')
  const fileHit = [`${base}.ts`, base].find((c) => existsSync(join(ROOT, c)) && statSync(join(ROOT, c)).isFile());
  if (fileHit) return { kind: 'file', path: fileHit };
  // barrel ماژول: کوشهٔ دامنه به همهٔ فایل‌های روتِ ثبتِ همان پوشه تعمیم می‌یابد
  if (existsSync(join(ROOT, `${base}/routes.ts`)) || existsSync(join(ROOT, `${base}/index.ts`))) {
    return { kind: 'dir', path: base };
  }
  return null;
}

const importMap = new Map(); // نام نماد (پس از alias) → اطلاعات هدف
for (const m of routerSrc.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm)) {
  const info = resolveTarget(m[2]);
  if (!info) continue;
  for (const n of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
    importMap.set(n.includes(' as ') ? n.split(/\s+as\s+/)[1].trim() : n, info);
  }
}

/** برش بدنهٔ توابع سطح‌بالای routes.ts (توابع پشت‌سرهم با comment بلوکی بین‌شان) */
function functionBodies(src) {
  const out = new Map();
  const marks = [...src.matchAll(/^(?:export\s+)?function\s+(\w+)/gm)].map((m) => ({
    name: m[1],
    at: m.index
  }));
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].at : src.length;
    out.set(marks[i].name, src.slice(marks[i].at, end));
  }
  return out;
}
const bodies = functionBodies(routerSrc);
const PUBLIC_COMPOSERS = ['registerPublicRoutes', 'registerPublicInlineRoutes', 'registerPublicModules'];
const PROTECTED_COMPOSERS = [
  'registerProtectedRoutes',
  'registerPostGateSystemRoutes',
  'registerClinicalDomainRoutes',
  'registerContentDomainRoutes',
  'registerConflictRoutes',
  'registerDashboardTailRoutes'
];
const publicFiles = new Set();
const protectedFiles = new Set();

/** فایل‌های تحت‌پوشش یک هدف ایمپورت: خود فایل (+routes.ts خواهر index) یا همهٔ routesهای پوشه */
function filesOf(info) {
  if (!info) return [];
  if (info.kind === 'file') {
    const out = [info.path];
    if (info.path.endsWith('/index.ts')) {
      const sib = info.path.replace(/\/index\.ts$/, '/routes.ts');
      if (existsSync(join(ROOT, sib))) out.push(sib);
    }
    return out;
  }
  return [...modules.values()]
    .filter((m) => m.file.startsWith(`${info.path}/`) && (m.file.endsWith('/routes.ts') || /-routes\.ts$/.test(m.file)))
    .map((m) => m.file);
}

for (const [group, sink] of [
  [PUBLIC_COMPOSERS, publicFiles],
  [PROTECTED_COMPOSERS, protectedFiles]
]) {
  for (const name of group) {
    const body = bodies.get(name) ?? '';
    for (const [alias, info] of importMap) {
      if (new RegExp(`\\b${alias}\\s*\\(`).test(body)) {
        for (const f of filesOf(info)) sink.add(f);
      }
    }
    // mount زیراپ: فایل سازندهٔ زیراپ به زنجیرهٔ محل mount می‌رود
    for (const m of body.matchAll(/app\.route\(\s*['"`][^'"`]+['"`]\s*,\s*([A-Za-z]\w*)\(/g)) {
      for (const f of filesOf(importMap.get(m[1]))) sink.add(f);
    }
  }
}

const ROUTER_FILE = 'src/application/api-routing/routes.ts';
for (const mod of modules.values()) {
  if (mod.file === ROUTER_FILE) mod.zone = 'router';
  else if (mod.file.includes('games-standalone')) mod.zone = 'games-worker';
  else if (publicFiles.has(mod.file) && protectedFiles.has(mod.file)) mod.zone = 'public+protected';
  else if (publicFiles.has(mod.file)) mod.zone = 'public';
  else if (protectedFiles.has(mod.file)) mod.zone = 'protected';
  else mod.zone = 'standalone';
}

/* ---------- ساخت مدل نهایی ---------- */
const sorted = [...modules.values()].sort((a, b) => (a.file < b.file ? -1 : 1));
const counts = (set, prefix = '') =>
  Object.fromEntries(METHODS.map((k) => [k, [...set].filter((e) => e.startsWith(k.toUpperCase() + ' ')).length]));
const byMethod = Object.fromEntries(METHODS.map((k) => [k, 0]));
const byLayer = { domain: 0, application: 0, other: 0 };
let total = 0;
const modulesOut = sorted.map((mod) => {
  const entries = [...mod.entries].sort();
  for (const e of entries) byMethod[e.slice(0, e.indexOf(' ')).toLowerCase()] += 1;
  byLayer[mod.layer] += entries.length;
  total += entries.length;
  return {
    file: mod.file,
    layer: mod.layer,
    zone: mod.zone,
    counts: counts(mod.entries),
    mounts: [...mod.mounts].sort(),
    endpoints: entries
  };
});
const actual = {
  version: 1,
  generator: 'scripts/check-route-registry.mjs — ۱.۲۷.۸۱ (sdt158) — نقطهٔ واحد کشف مسیرها (architecture-004 گزینهٔ الف)',
  summary: { totalEndpoints: total, byMethod, byLayer },
  modules: modulesOut
};

/* ---------- مقایسه/نوشتن ---------- */
if (UPDATE) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(actual, null, 2) + '\n');
  console.log(`✓ مانیفست رجیستری مسیرها نوشته شد — ${total} ثبت در ${modulesOut.length} ماژول`);
  process.exit(0);
}
if (!existsSync(MANIFEST_PATH)) {
  console.error('❌ docs/route-registry.json نیست — با --update بسازید');
  process.exit(1);
}
const recorded = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const problems = [];
const recByFile = new Map(recorded.modules.map((m) => [m.file, m]));
const actByFile = new Map(actual.modules.map((m) => [m.file, m]));
for (const [file, rec] of recByFile) {
  if (!actByFile.has(file)) problems.push(`حذف‌شده: ${file}`);
}
for (const [file, act] of actByFile) {
  const rec = recByFile.get(file);
  if (!rec) {
    problems.push(`تازه: ${file} (${act.endpoints.length} ثبت)`);
    continue;
  }
  const recSet = new Set(rec.endpoints);
  const actSet = new Set(act.endpoints);
  const added = [...actSet].filter((e) => !recSet.has(e));
  const removed = [...recSet].filter((e) => !actSet.has(e));
  if (added.length) problems.push(`${file} — افزوده: ${added.join('، ')}`);
  if (removed.length) problems.push(`${file} — حذف‌شده: ${removed.join('، ')}`);
  if (JSON.stringify(rec.zone) !== JSON.stringify(act.zone)) problems.push(`${file} — zone: ${rec.zone} → ${act.zone}`);
}
const s = recorded.summary;
if (s.totalEndpoints !== total) problems.push(`summary.totalEndpoints: ${s.totalEndpoints} → ${total}`);
if (problems.length) {
  console.error(`❌ گیت رجیستری مسیرها سرخ — مانیفست با سورس هم‌گام نیست (${problems.length}):`);
  for (const p of problems.slice(0, 25)) console.error('  •', p);
  if (problems.length > 25) console.error(`  … و ${problems.length - 25} مورد دیگر`);
  console.error('  پس از بررسی، با node scripts/check-route-registry.mjs --update مانیفست را تازه کنید');
  process.exit(1);
}
console.log(`✓ گیت رجیستری مسیرها سبز است — ${total} ثبت در ${modulesOut.length} ماژول (domain ${byLayer.domain} · application ${byLayer.application} · other ${byLayer.other})`);
