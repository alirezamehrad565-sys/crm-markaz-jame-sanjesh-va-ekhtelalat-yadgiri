// — m186: جداسازی فرم‌های جامع (ce-comp-family-v2 / ce-comp-teacher-v2) از باتری
// ابزارهای واقعیِ درون باتری کامپوزیت (sdq-p، id-adapt، sld-class-t) به فایل‌های مقصدی منتقل و
// خود battery-composite.json حذف می‌شود. اجرای یک‌باره — idempotent نیست.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('src/domain/clinical-engine');
const load = (f) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8'));

const composite = load('battery-composite.json');
const screening = load('battery-screening.json');
const specific = load('battery-specific.json');

const KEYS_MOVE = ['ce-sdq-p-v1', 'ce-id-adapt-v1', 'ce-sld-class-t-v1'];
const moved = [];
for (const key of KEYS_MOVE) {
  const def = composite.find((d) => d.key === key);
  if (!def) throw new Error(`${key} در battery-composite.json نیست`);
  moved.push(def);
}
const removed = composite.filter((d) => !KEYS_MOVE.includes(d.key));
if (removed.length !== 2 || !removed.every((d) => ['ce-comp-family-v2', 'ce-comp-teacher-v2'].includes(d.key))) {
  throw new Error('composite فقط باید دو فرم جامع داشته باشد: ' + removed.map((d) => d.key).join(', '));
}

for (const def of moved) {
  const target = def.key === 'ce-sdq-p-v1' ? screening : specific;
  if (target.some((d) => d.key === def.key)) continue; // idempotent
  target.push(def);
}

writeFileSync(path.join(DIR, 'battery-screening.json'), JSON.stringify(screening, null, 2) + '\n');
writeFileSync(path.join(DIR, 'battery-specific.json'), JSON.stringify(specific, null, 2) + '\n');
unlinkSync(path.join(DIR, 'battery-composite.json'));
console.log('OK — sdq-p/id-adapt/sld-class-t منتقل شدند؛ battery-composite.json حذف شد');
console.log('screening:', screening.map((d) => d.key).join(', '));
console.log('specific:', specific.map((d) => d.key).join(', '));
