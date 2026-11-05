// آزمون برابری عملکردی دو باندل (قدیم ↔ بازسازی‌شده) روی یک D1 شبیه‌سازی‌شده
// استفاده: node scripts/bundle-smoke.mjs <bundleOld> <bundleNew>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MIGRATIONS_DIR = path.resolve(ROOT, 'migrations');
const SEED = path.resolve(ROOT, 'scripts/seed-dev.sql');
const MANAGER_ID = '00000000-0000-0000-0000-000000000001';

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const f of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
  }
  db.exec(readFileSync(SEED, 'utf8'));
  return db;
}

function normalizeParam(p) {
  if (p === undefined) return null;
  if (typeof p === 'boolean') return p ? 1 : 0;
  if (p instanceof Uint8Array) return Buffer.from(p).toString('base64');
  return p;
}

function execStmt(store, sql, params) {
  const stmt = store.prepare(sql);
  const norm = params.map(normalizeParam);
  if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)/i.test(sql)) {
    return { rows: stmt.all(...norm), changes: 0 };
  }
  const info = stmt.run(...norm);
  return { rows: [], changes: info.changes };
}

class Stmt {
  constructor(store, sql, params) { this.store = store; this.sql = sql; this.params = params; }
  bind(...params) { return new Stmt(this.store, this.sql, params); }
  async all() { return { results: execStmt(this.store, this.sql, this.params).rows ?? [], meta: {} }; }
  async first() { const r = execStmt(this.store, this.sql, this.params).rows; return r[0] ?? null; }
  async raw() { return execStmt(this.store, this.sql, this.params).rows.map((r) => Object.values(r)); }
  async run() { const i = execStmt(this.store, this.sql, this.params); return { success: true, meta: { changes: i.changes, last_row_id: 0, duration: 0 } }; }
}

class MockD1 {
  constructor(store) { this.store = store; }
  prepare(sql) { return new Stmt(this.store, sql, []); }
  async batch(statements) {
    const out = [];
    this.store.exec('BEGIN IMMEDIATE');
    try {
      for (const s of statements) {
        const i = execStmt(this.store, s.sql, s.params);
        out.push({ success: true, meta: { changes: i.changes } });
      }
      this.store.exec('COMMIT');
      return out;
    } catch (err) { this.store.exec('ROLLBACK'); throw err; }
  }
}

const CASES = [
  ['GET', '/health', null, null],
  ['GET', '/api/me', MANAGER_ID, null],
  ['POST', '/api/auth/login', null, { username: 'manager', password: '1234' }],
  ['GET', '/api/students', MANAGER_ID, null],
  ['GET', '/api/schools', MANAGER_ID, null],
  ['GET', '/api/settings', MANAGER_ID, null],
  ['GET', '/api/reports', MANAGER_ID, null],
  ['GET', '/api/dashboard/today', MANAGER_ID, null],
  ['GET', '/api/case-event-types', MANAGER_ID, null],
  ['GET', '/api/students', null, null], // بدون احراز → 401
  ['GET', '/api/scoring/board', MANAGER_ID, null] // لایهٔ امتیاز
];

async function probe(bundlePath) {
  const mod = await import(pathToFileURL(path.resolve(bundlePath)).href);
  const worker = mod.default;
  const db = new MockD1(makeDb());
  const env = { DB: db, ENV: 'development', CF_ACCESS_TEAM_DOMAIN: '' };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const out = [];
  for (const [method, urlPath, staffId, body] of CASES) {
    const headers = { Accept: 'application/json' };
    if (staffId) headers['X-Dev-Staff-Id'] = staffId;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await worker.fetch(new Request(`https://x.test${urlPath}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined
    }), env, ctx);
    const text = await res.text();
    let norm = text;
    try { norm = JSON.stringify(JSON.parse(text)); } catch { /* متن خام */ }
    norm = norm.replace(/"ts":"[^"]*"/g, '"ts":"<TS>"');
    out.push(`${method} ${urlPath} → ${res.status} :: ${norm.slice(0, 4000)}`);
  }
  return out;
}

const [oldPath, newPath] = process.argv.slice(2);
const logLines = [];
const a = await probe(oldPath);
const b = await probe(newPath);
let same = true;
for (let i = 0; i < a.length; i++) {
  if (a[i] !== b[i]) {
    same = false;
    logLines.push(`✗ تفاوت در [${i}] ${a[i].split(' → ')[0]}`);
    logLines.push(`  قدیم: ${a[i].slice(0, 300)}`);
    logLines.push(`  جدید: ${b[i].slice(0, 300)}`);
  } else {
    logLines.push(`✓ ${a[i].split(' :: ')[0]}`);
  }
}
logLines.push(same ? '✅ باندل بازسازی‌شده از نظر رفتار با باندل زنده برابر است' : '❌ باندل‌ها برابر نیستند — بازسازی تایید نمی‌شود');
writeFileSync('/tmp/bundle-smoke-report.txt', logLines.join('\n') + '\n', 'utf8');
process.exit(same ? 0 : 1);
