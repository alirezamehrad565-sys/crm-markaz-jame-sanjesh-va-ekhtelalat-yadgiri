#!/usr/bin/env node
// دودِ باندل مستقل بازی‌ها — worker/games-bundle.js روی D1 شبیه‌سازی‌شده بالا می‌آید و پروب می‌شود.
// استفاده: node scripts/games-bundle-smoke.mjs   (پس از build-worker-games.mjs)
// هم‌الگوی bundle-smoke.mjs ولی برای بستهٔ بازی‌ها: سلامت ماژول + گیت احراز + API پرسنلی.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MIGRATIONS_DIR = path.resolve(ROOT, 'migrations');
const SEED = path.resolve(ROOT, 'scripts/seed-dev.sql');
const BUNDLE = path.join(ROOT, 'worker', 'games-bundle.js');
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

// [متد، مسیر، staffId، بدنه، انتظار وضعیت، انتظارهای روی متن پاسخ]
const CASES = [
  ['GET', '/health', null, null, 200, ['"module":"games"', '"ok":true']],
  ['GET', '/api/games/packages', null, null, 401, null],
  ['GET', '/api/games/packages', MANAGER_ID, null, 200, ['"data"']],
  ['GET', '/api/me', MANAGER_ID, null, 200, ['"role"']]
];

const mod = await import(pathToFileURL(BUNDLE).href);
const worker = mod.default;
const db = new MockD1(makeDb());
const env = { DB: db, ENV: 'development', CF_ACCESS_TEAM_DOMAIN: '', API_RATE_LIMIT_PER_MIN: '0' };
const ctx = { waitUntil() {}, passThroughOnException() {} };

const logLines = [];
let failed = false;
for (const [method, urlPath, staffId, reqBody, wantStatus, wantSubstrings] of CASES) {
  const headers = { Accept: 'application/json' };
  if (staffId) headers['X-Dev-Staff-Id'] = staffId;
  if (reqBody) headers['Content-Type'] = 'application/json';
  const res = await worker.fetch(new Request(`https://x.test${urlPath}`, {
    method, headers, body: reqBody ? JSON.stringify(reqBody) : undefined
  }), env, ctx);
  const text = await res.text();
  const okStatus = res.status === wantStatus;
  const okSubs = !wantSubstrings || wantSubstrings.every((s) => text.includes(s));
  if (!okStatus || !okSubs) {
    failed = true;
    logLines.push(`✗ ${method} ${urlPath} → ${res.status} (انتظار ${wantStatus}) :: ${text.slice(0, 200)}`);
  } else {
    logLines.push(`✓ ${method} ${urlPath} → ${res.status}`);
  }
}
logLines.push(failed ? '❌ باندل مستقل بازی‌ها قرمز است' : '✅ باندل مستقل بازی‌ها سبز است');
writeFileSync('/tmp/games-bundle-smoke-report.txt', logLines.join('\n') + '\n', 'utf8');
console.log(logLines.join('\n'));
process.exit(failed ? 1 : 0);
