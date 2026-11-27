/* Cross-check: group the REAL prod evidence (33 rows) with the view's actual grouping code. */
import { readFileSync } from 'node:fs';

const evidence = JSON.parse(readFileSync('/home/z/my-project/download/evidence/d1-inventory/prod-active-forms.json', 'utf8'));
const rows = evidence[0].results.filter((r) => r.active === 1).map((r) => ({ ...r, isSystem: r.is_system === 1 }));
console.log('active rows in evidence:', rows.length);

const ORDER = ['scale', 'criteria', 'monitor', 'session', 'note', 'custom'];
function formGroupOf(t) {
  if (!t || !t.isSystem) return 'custom';
  if (t.category === 'session' || t.category === 'note') return t.category;
  const key = String(t.key ?? '');
  if (/^ce-(sdq|scared|snap|dcdq)/.test(key)) return 'scale';
  if (/^ce-(sld|.*-criteria)/.test(key)) return 'criteria';
  if (/^ce-rehab/.test(key)) return 'session';
  return 'monitor';
}

const counts = {};
for (const r of rows) (counts[formGroupOf(r)] ??= []).push(r.key);
let total = 0;
for (const g of ORDER) {
  const items = counts[g] ?? [];
  total += items.length;
  console.log(`${g}: ${items.length}`, items.join(' '));
}
console.log('total:', total, '| family_fillable:', rows.filter((r) => r.family_fillable === 1).length);
