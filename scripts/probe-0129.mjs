// diag — find failing statement in 0129
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
const db = new DatabaseSync(':memory:');
const files = readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort().filter((f) => f !== '0129_system_exercise_cards.sql');
for (const f of files) db.exec(readFileSync('migrations/' + f, 'utf8'));
const text = readFileSync('migrations/0129_system_exercise_cards.sql', 'utf8');
const stmts = text.split(/;\s*\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('--'));
let i = 0, bad = 0;
for (const s of stmts) {
  i++;
  try { db.exec(s + ';'); }
  catch (e) {
    bad++;
    console.log('stmt', i, 'FAIL:', e.message);
    console.log('HEAD:', s.slice(0, 100));
    const q = (s.match(/'/g) || []).length;
    console.log('QUOTES:', q, q % 2 === 1 ? 'ODD -> broken string' : '');
  }
}
console.log('checked', i, 'statements,', bad, 'bad');
