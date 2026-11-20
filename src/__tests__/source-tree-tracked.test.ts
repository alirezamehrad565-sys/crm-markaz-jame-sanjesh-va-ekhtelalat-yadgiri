/**
 * گیت یکپارچگی درخت سورس (۱.۲۷.۴۵) — هیچ فایل سورسی حق ندارد بی‌صدا از گیت بیفتد
 *
 * ریشهٔ این گیت: قانون .gitignore «core» (مخصوص core-dump کرش) بی‌لنگر بود و هر
 * مسیر به‌نام core در هر عمقی را می‌گرفت — فایل تازهٔ src/core/security/timing.ts
 * از گیت افتاد، بیلد داکر (که از سورس می‌سازد) سرخ شد و CF سالم ماند چون باندلِ
 * کامیت‌شده را سرو می‌کند. از این به بعد: هر import داخل src/ باید به فایلی
 * برسد که «هست روی دیسک» و «ردیابی‌شده در گیت» است.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(__dirname, '../..');
const SRC = join(ROOT, 'src');

function* walkTs(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      yield* walkTs(p);
    } else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) {
      yield p;
    }
  }
}

/** مسیر ایمپورت نسبی/ایلیاس را به مسیر مطلق فایل TS/JS درخت می‌برد (اگر داخل src باشد) */
function resolveImport(fromFile: string, spec: string): string | null {
  let target: string | null = null;
  if (spec.startsWith('.')) target = resolve(dirname(fromFile), spec);
  else if (spec.startsWith('@/')) target = join(ROOT, 'src', spec.slice(2));
  else if (spec.startsWith('@core/')) target = join(ROOT, 'src/core', spec.slice(6));
  else if (spec.startsWith('@domain/')) target = join(ROOT, 'src/domain', spec.slice(8));
  else if (spec.startsWith('@app/')) target = join(ROOT, 'src/application', spec.slice(5));
  else return null; // node: یا بستهٔ npm — خارج از دامنهٔ این گیت
  for (const cand of [target, `${target}.ts`, join(target, 'index.ts')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

describe('گیت ۱.۲۷.۴۵ — هیچ سورسی بی‌صدا از گیت نمی‌افتد', () => {
  const tracked = new Set(
    execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  );

  it('هر import داخل src/ به فایلی می‌رسد که روی دیسک هست و در گیت ردیابی می‌شود', () => {
    const problems: string[] = [];
    for (const file of walkTs(SRC)) {
      const rel = file.slice(ROOT.length + 1);
      const src = readFileSync(file, 'utf8');
      const specs = [...src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of specs) {
        const target = resolveImport(file, spec);
        if (!target) continue;
        const targetRel = target.slice(ROOT.length + 1);
        if (!tracked.has(targetRel)) {
          problems.push(`${rel} → «${spec}» به ${targetRel} می‌رسد که روی دیسک هست اما در گیت نیست (اگر عمدی است: import را حذف کنید یا قانون .gitignore را لنگر بزنید)`);
        }
      }
    }
    expect(problems, problems.slice(0, 8).join('\n')).toEqual([]);
  });

  it('فایل ریشه‌ایای که شکست داکر ساخت، اکنون ردیابی‌شده است', () => {
    expect(tracked.has('src/core/security/timing.ts')).toBe(true);
    expect(readFileSync(join(ROOT, '.gitignore'), 'utf8')).toMatch(/^\/core$/m); // قانون لنگر شده
  });
});
