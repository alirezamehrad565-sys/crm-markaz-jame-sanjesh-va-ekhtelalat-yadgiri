// آزمون مسیرهای پشتیبان‌گیری روی خودِ باندل بازسازی‌شده
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MANAGER_ID = '00000000-0000-0000-0000-000000000001';

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const f of readdirSync(path.join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
  }
  db.exec(readFileSync(path.join(ROOT, 'scripts/seed-dev.sql'), 'utf8'));
  return db;
}
function execStmt(store, sql, params) {
  const stmt = store.prepare(sql);
  const norm = params.map((p) => (p instanceof Uint8Array ? Buffer.from(p).toString('base64') : p));
  if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)/i.test(sql)) return { rows: stmt.all(...norm), changes: 0 };
  const info = stmt.run(...norm);
  return { rows: [], changes: info.changes };
}
class Stmt {
  constructor(store, sql, params) { this.store = store; this.sql = sql; this.params = params; }
  bind(...p) { return new Stmt(this.store, this.sql, p); }
  async all() { return { results: execStmt(this.store, this.sql, this.params).rows ?? [], meta: {} }; }
  async first() { return execStmt(this.store, this.sql, this.params).rows[0] ?? null; }
  async run() { return { success: true, meta: { changes: execStmt(this.store, this.sql, this.params).changes } }; }
}
class MockD1 {
  constructor(store) { this.store = store; }
  prepare(sql) { return new Stmt(this.store, sql, []); }
  async batch(statements) {
    const out = [];
    this.store.exec('BEGIN IMMEDIATE');
    try {
      for (const s of statements) out.push({ success: true, meta: { changes: execStmt(this.store, s.sql, s.params).changes } });
      this.store.exec('COMMIT');
      return out;
    } catch (err) { this.store.exec('ROLLBACK'); throw err; }
  }
}

const bundlePath = process.argv[2] ?? 'worker/bundle.js';
const mod = await import(pathToFileURL(path.resolve(ROOT, bundlePath)).href);
const worker = mod.default;
const sqlStore = makeDb();
const env = { DB: new MockD1(sqlStore), ENV: 'development', CF_ACCESS_TEAM_DOMAIN: '' };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const H = { 'X-Dev-Staff-Id': MANAGER_ID, Accept: 'application/json', 'Content-Type': 'application/json' };
const lines = [];
const req = async (method, p, body) => {
  const res = await worker.fetch(new Request(`https://x.test${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined }), env, ctx);
  return { status: res.status, text: await res.text() };
};

// ۱) وضعیت
let r = await req('GET', '/api/backup/status');
lines.push(`status → ${r.status} ${r.status === 200 ? '✓' : '✗ ' + r.text.slice(0, 200)}`);

// ۲) خروجی
r = await req('GET', '/api/backup/export');
const backup = JSON.parse(r.text);
lines.push(`export → ${r.status} — ${backup.format}/v${backup.format_version} — ${Object.keys(backup.tables).length} جدول ✓`);

// ۳) inspect
r = await req('POST', '/api/backup/inspect', backup);
const summary = JSON.parse(r.text).data;
lines.push(`inspect → ${r.status} — سازگار=${summary.schemaCompatible} ردیف=${summary.totalRows} ✓`);

// ۴) تخریب + بازیابی
sqlStore.exec("DELETE FROM students WHERE id = '20000000-0000-0000-0000-000000000001'");
const gone = (sqlStore.prepare('SELECT COUNT(*) c FROM students').get()).c;
r = await req('POST', '/api/backup/restore', { backup, confirm: true });
const report = JSON.parse(r.text).data;
const back = (sqlStore.prepare('SELECT COUNT(*) c FROM students').get()).c;
lines.push(`restore → ${r.status} — ردیف=${report?.totalRows} — دانش‌آموز قبل=${gone} بعد=${back} ${back > gone ? '✓' : '✗'}`);

// ۵) بدون تأیید
r = await req('POST', '/api/backup/restore', { backup });
lines.push(`restore-بدون-tأیید → ${r.status} (انتظار ۴۰۰) ${r.status === 400 ? '✓' : '✗'}`);

writeFileSync('/tmp/backup-bundle-report.txt', lines.join('\n') + '\n', 'utf8');
const ok = lines.every((l) => !l.includes('✗'));
console.log(ok ? '✅ همهٔ مسیرهای پشتیبان روی باندل سالم‌اند' : '❌ شکست — گزارش را ببینید');
process.exit(ok ? 0 : 1);
