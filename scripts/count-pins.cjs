/* Replicates countSourcePins from src/__tests__/front-gate-hygiene.test.ts to report exact counts. */
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const TESTS = '/home/z/my-project/gh-work/src/__tests__';
let total = 0;
const perFile = [];
for (const name of readdirSync(TESTS).sort()) {
  if (!/^front-.*\.test\.ts$/.test(name)) continue;
  const src = readFileSync(join(TESTS, name), 'utf8');
  let n = 0;
  const srcVars = new Set();
  for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:read|readFileSync)\s*\(([^)]*)\)/g)) {
    const arg = m[2];
    if (arg.includes('public/assets') || arg.includes('components.css') || /join\(JS/.test(arg)) {
      srcVars.add(m[1]);
    }
  }
  for (const m of src.matchAll(/expect\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\.\s*(?:not\.)?(?:toMatch|toContain)\s*\(/g)) {
    if (srcVars.has(m[1])) n += 1;
  }
  for (const m of src.matchAll(/expect\(\s*(?:read|readFileSync)\s*\([^)]*public\/assets[^)]*\)\s*\)\s*\.\s*(?:not\.)?(?:toMatch|toContain)\s*\(/g)) {
    n += 1;
  }
  if (n > 0) perFile.push(`${name}: ${n}`);
  total += n;
}
console.log(perFile.join('\n'));
console.log('TOTAL:', total);
