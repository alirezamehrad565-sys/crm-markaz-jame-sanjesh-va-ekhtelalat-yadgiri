#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE); // deploy127/
const SRC_DIR = join(ROOT, 'src');
const BUNDLE_FILE = join(ROOT, 'worker', 'bundle.js');
const REPORT_FILE = join(HERE, 'route-diff-report.txt');

const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'all', 'on'];

function walkTs(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules' || e.name === '.git') continue;
      walkTs(p, out);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && !e.name.endsWith('.test.ts')) {
      out.push(p);
    }
  }
  return out;
}

function canonicalizePath(rawPath) {
  let p = rawPath.trim();
  if (p === '') return null;
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/{2,}/g, '/');
  p = p.replace(/:[A-Za-z_$][\w$]*\{[^}]*\}/g, ':param'); // :id{[0-9]+}
  p = p.replace(/:[A-Za-z_$][\w$]*/g, ':param');          // :id
  return p;
}

function shapeKey(method, rawPath) {
  let p = rawPath.trim();
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/{2,}/g, '/');
  p = p.replace(/:[A-Za-z_$][\w$]*\{[^}]*\}/g, '\u0001'); // any constrained param
  p = p.replace(/:[A-Za-z_$][\w$]*/g, '\u0001');          // any plain param
  return `${method} ${p}`;
}

function parseStringLiteral(line, i) {
  const q = line[i];
  if (q !== '"' && q !== "'" && q !== '`') return null;
  if (q === '`' && line.includes('${', i)) return { unresolved: true };
  let j = i + 1;
  let out = '';
  while (j < line.length) {
    const ch = line[j];
    if (ch === '\\') {
      out += ch + (line[j + 1] ?? '');
      j += 2;
      continue;
    }
    if (ch === q) return { value: out, end: j };
    out += ch;
    j += 1;
  }
  return null; // unterminated on this line
}

function extractFromText(text, opts = {}) {
  const routes = [];
  const unresolvedConst = [];
  const unparsable = [];
  const constTable = new Map(); // NAME -> path (file-local, e.g. FILL_PATH)
  const honoVars = new Set();   // `const sub = new Hono()` (for app.route resolution)
  const mounts = new Map();     // subVar -> [prefixes]  (from app.route('/p', sub))

  const lines = text.split('\n');

  lines.forEach((line, idx) => {
    let m = line.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])(.*?)\2\s*;?\s*$/);
    if (m && m[3].startsWith('/')) {
      constTable.set(m[1], m[3]);
      return;
    }
    m = line.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Hono\s*\(/);
    if (m) {
      honoVars.add(m[1]);
      return;
    }
    m = line.match(/^\s*([\w$]+)\.route\(\s*(['"`])(\/[^'"`]+)\2\s*,\s*([\w$]+)\s*\)/);
    if (m && honoVars.has(m[4])) {
      const prefixes = mounts.get(m[4]) ?? [];
      prefixes.push(m[3]);
      mounts.set(m[4], prefixes);
    }
  });

  const re = new RegExp(`^\\s*([\\w$]+)\\.(${METHODS.join('|')})\\(\\s*`);
  lines.forEach((line, idx) => {
    const m = line.match(re);
    if (!m) return;
    const receiver = m[1];
    const method = m[2].toUpperCase();
    const lineNo = idx + 1;
    const isRootApp = /^app\d*$/.test(receiver); // app, app2 … (esbuild renames on collision)
    const isSubApp = honoVars.has(receiver);
    if (!isRootApp && !isSubApp) return; // Map/Header/etc. .get(...) — not a route

    let i = m[0].length;
    while (i < line.length && /\s/.test(line[i])) i += 1;

    let rawPath = null;
    let bad = false;

    if (i < line.length && (line[i] === '"' || line[i] === "'" || line[i] === '`')) {
      const lit = parseStringLiteral(line, i);
      if (lit?.value !== undefined) rawPath = lit.value;
      else bad = true;
    } else if (i < line.length && /[A-Za-z_$]/.test(line[i])) {
      const id = line.slice(i).match(/[A-Za-z_$][\w$]*/)?.[0];
      if (id && constTable.has(id)) rawPath = constTable.get(id);
      else if (id) {
        unresolvedConst.push({ method, id, line: lineNo, receiver });
        bad = true;
      } else bad = true;
    } else {
      bad = true;
    }

    if (bad || rawPath === null) {
      unparsable.push({ method, receiver, line: lineNo, text: line.trim().slice(0, 120) });
      return;
    }

    if (isSubApp) {
      const prefixes = mounts.get(receiver);
      if (prefixes && prefixes.length) {
        for (const prefix of prefixes) {
          routes.push({ method, path: joinPrefix(prefix, rawPath), line: lineNo, receiver });
        }
        return;
      }
      routes.push({ method, path: rawPath, line: lineNo, receiver, unmounted: true });
      return;
    }

    if (!isRootApp) return; // some other object's .get(...) — not a route
    routes.push({ method, path: rawPath, line: lineNo, receiver });
  });

  return { routes, unresolvedConst, unparsable };
}

function joinPrefix(prefix, path) {
  if (prefix.endsWith('/')) prefix = prefix.slice(0, -1);
  if (path === '/') return prefix || '/';
  return prefix + path;
}

function collect(files) {
  const map = new Map(); // canonical key -> { key, method, path, origins: [label] }
  const shapeMap = new Map(); // shape key -> Set of canonical keys
  const duplicates = [];
  const anomalies = { unresolvedConst: [], unparsable: [] };
  let rawCount = 0;

  for (const rel of files) {
    const label = rel;
    let text;
    try {
      text = readFileSync(join(ROOT, rel), 'utf8');
    } catch (err) {
      anomalies.unparsable.push({ method: '-', receiver: '-', line: 0, text: `${rel}: unreadable (${err.message})` });
      continue;
    }
    const { routes, unresolvedConst, unparsable } = extractFromText(text);
    for (const u of unresolvedConst) anomalies.unresolvedConst.push({ ...u, file: label });
    for (const u of unparsable) anomalies.unparsable.push({ ...u, file: label });

    for (const r of routes) {
      rawCount += 1;
      const canon = canonicalizePath(r.path);
      if (!canon) {
        anomalies.unparsable.push({ method: r.method, receiver: r.receiver, line: r.line, file: label, text: r.path });
        continue;
      }
      const key = `${r.method} ${canon}`;
      const sk = shapeKey(r.method, r.path);
      if (!shapeMap.has(sk)) shapeMap.set(sk, new Set());
      shapeMap.get(sk).add(key);
      if (map.has(key)) {
        if (map.get(key).origins[0].file === label) {
          duplicates.push(`${key} @ ${label}:${r.line}`);
        }
        map.get(key).origins.push({ file: label, line: r.line });
      } else {
        map.set(key, { key, method: r.method, path: canon, origins: [{ file: label, line: r.line }] });
      }
    }
  }
  return { map, shapeMap, duplicates, anomalies, rawCount };
}

const srcFilesAbs = walkTs(SRC_DIR);
const srcFilesRel = srcFilesAbs.map((p) => (p.startsWith(ROOT + sep) ? p.slice(ROOT.length + 1) : p));
const src = collect(srcFilesRel);

const bundleRel = 'worker/bundle.js';
const bundle = collect([bundleRel]);

const onlyInBundle = [];
const onlyInSrc = [];
const common = [];
const paramDrift = [];

for (const [key, entry] of bundle.map) {
  if (src.map.has(key)) common.push({ key, src: src.map.get(key), bundle: entry });
  else onlyInBundle.push(entry);
}
for (const [key, entry] of src.map) {
  if (!bundle.map.has(key)) onlyInSrc.push(entry);
}

for (const [sk, srcKeys] of src.shapeMap) {
  const bKeys = bundle.shapeMap.get(sk);
  if (!bKeys) continue;
  for (const s of srcKeys) {
    for (const b of bKeys) {
      if (s !== b && src.map.has(s) && bundle.map.has(b)) {
        paramDrift.push({ shape: sk.replace(/\u0001/g, ':param'), src: s, bundle: b });
      }
    }
  }
}

const sortByKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
onlyInBundle.sort(sortByKey);
onlyInSrc.sort(sortByKey);
common.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
paramDrift.sort((a, b) => (a.shape < b.shape ? -1 : 1));

function areaOf(key) {
  const parts = key.split(' ')[1].split('/').filter(Boolean);
  const a = parts.slice(0, 2).join('/');
  return '/' + a;
}
const bundleOnlyByArea = new Map();
for (const r of onlyInBundle) {
  const a = areaOf(r.key);
  bundleOnlyByArea.set(a, (bundleOnlyByArea.get(a) ?? 0) + 1);
}
const areas = [...bundleOnlyByArea.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

const L = [];
const out = (s = '') => L.push(s);
const originsStr = (origins) => origins.map((o) => `${o.file}:${o.line}`).join(', ');

out('════════════════════════════════════════════════════════════════════════');
out(' Route Diff Report — deploy127 (src/**/*.ts  vs  worker/bundle.js)');
out('════════════════════════════════════════════════════════════════════════');
out(`Generated : ${new Date().toISOString()}`);
out(`SRC files : ${srcFilesRel.length} TypeScript files under src/ (tests excluded)`);
out(`BUNDLE    : ${bundleRel}`);
out('Rules     : line-anchored `app.<method>(` registrations; file-local const');
out('            paths resolved (e.g. FILL_PATH); params canonicalized to :param;');
out('            app.route() static prefixes resolved best-effort; app.use()');
out('            middleware NOT counted; comments never matched.');
out('');
out('── Totals ──────────────────────────────────────────────────────────────');
out(`SRC registrations (raw)        : ${String(src.rawCount).padStart(4)}  (unique: ${src.map.size})`);
out(`BUNDLE registrations (raw)     : ${String(bundle.rawCount).padStart(4)}  (unique: ${bundle.map.size})`);
out('');
out(`ONLY_IN_BUNDLE (extraction backlog) : ${onlyInBundle.length}`);
out(`ONLY_IN_SRC (stale/dead candidates) : ${onlyInSrc.length}`);
out(`COMMON                              : ${common.length}`);
out('');

out('── ONLY_IN_BUNDLE (routes that exist only in the live bundle) ──────────');
if (!onlyInBundle.length) out('  (none)');
for (const r of onlyInBundle) out(`  ${r.key}   [${originsStr(r.origins)}]`);
out('');

out('── ONLY_IN_SRC (routes that exist only in src — stale/dead-code candidates) ──');
if (!onlyInSrc.length) out('  (none)');
for (const r of onlyInSrc) out(`  ${r.key}   [${originsStr(r.origins)}]`);
out('');

out(`── COMMON (${common.length}) ────────────────────────────────────────────────`);
for (const c of common) {
  const nSrc = c.src.origins.length;
  const nBundle = c.bundle.origins.length;
  out(`  ${c.key}   [src ×${nSrc} | bundle ×${nBundle}]`);
}
out('');

out('── Bundle-only routes grouped by area ──────────────────────────────────');
if (!areas.length) out('  (none)');
for (const [a, n] of areas) out(`  ${a.padEnd(40)} ${n}`);
out('');

out('── Anomalies ───────────────────────────────────────────────────────────');
out(`Param-name drift (same shape, different param names): ${paramDrift.length}`);
for (const d of paramDrift) out(`  shape ${d.shape}\n    src   : ${d.src}\n    bundle: ${d.bundle}`);
out(`Duplicate registrations (same key, same side, same file): ${src.duplicates.length + bundle.duplicates.length}`);
for (const d of [...src.duplicates, ...bundle.duplicates]) out(`  ${d}`);
out(`Unresolvable first-arg constants: ${src.anomalies.unresolvedConst.length + bundle.anomalies.unresolvedConst.length}`);
for (const u of [...src.anomalies.unresolvedConst, ...bundle.anomalies.unresolvedConst]) {
  out(`  ${u.file}:${u.line}  ${u.method} ${u.id}`);
}
out(`Unparsable app.<method>( lines: ${src.anomalies.unparsable.length + bundle.anomalies.unparsable.length}`);
for (const u of [...src.anomalies.unparsable, ...bundle.anomalies.unparsable]) {
  out(`  ${u.file ?? '-'}:${u.line ?? '-'}  ${u.text}`);
}
out('');
out('End of report.');

const report = L.join('\n') + '\n';

if (process.argv.includes('--json')) {
  const json = {
    generatedAt: new Date().toISOString(),
    totals: {
      srcRaw: src.rawCount,
      srcUnique: src.map.size,
      bundleRaw: bundle.rawCount,
      bundleUnique: bundle.map.size,
      onlyInBundle: onlyInBundle.length,
      onlyInSrc: onlyInSrc.length,
      common: common.length
    },
    onlyInBundle: onlyInBundle.map((r) => ({ route: r.key, origins: r.origins })),
    onlyInSrc: onlyInSrc.map((r) => ({ route: r.key, origins: r.origins })),
    common: common.map((c) => c.key),
    anomalies: { paramDrift, duplicates: [...src.duplicates, ...bundle.duplicates], ...src.anomalies, ...bundle.anomalies }
  };
  console.log(JSON.stringify(json, null, 2));
} else {
  console.log(report);
}

writeFileSync(REPORT_FILE, report, 'utf8');
if (!process.argv.includes('--json')) {
  console.error(`\n[route-diff] report written to ${REPORT_FILE}`);
}
