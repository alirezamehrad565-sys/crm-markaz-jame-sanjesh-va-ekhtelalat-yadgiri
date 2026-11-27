/* Diagnose which migration fails to apply on a fresh in-memory DB (read-only check). */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = '/home/z/my-project/gh-work/migrations';
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
for (const f of files) {
  const sql = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
  try {
    db.exec(sql);
  } catch (err) {
    console.log('FAILED:', f, '→', err instanceof Error ? err.message : String(err));
    // Show INSERT lines whose value count may mismatch
    const lines = sql.split('\n');
    lines.forEach((l, i) => {
      if (/INSERT/i.test(l)) console.log(`  line ${i + 1}: ${l.slice(0, 160)}`);
    });
    break;
  }
}
console.log('done');
