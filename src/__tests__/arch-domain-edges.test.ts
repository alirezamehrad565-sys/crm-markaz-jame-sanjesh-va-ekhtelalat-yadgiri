/**
 * گیت یال‌های دامنه — ۱.۲۷.۸۴ (sdt161: architecture-003 + architecture-005)
 * دو قرارداد ساختاری را دائمی می‌کند:
 * ① در src/domain هیچ `from '@app/` نیست (sdt160: document-requests با تزریق تابع؛
 *    sdt161: pageParams به @core/shared رفت).
 * ② یال‌های domain→domain فقط از دفتر مصوب docs/rust/design.md §۱۱ می‌آیند —
 *    گیت کد↔سند را هم‌خوان نگه می‌دارد؛ یال تازهٔ بی‌مجوز قرمز است.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../..');
const DOMAIN = join(ROOT, 'src/domain');

/** یال‌های مصوب — باید عیناً در docs/rust/design.md §۱۱ هم بیاید */
const APPROVED_EDGES: Record<string, string> = {
  'appointment-core→assessment-blocks': 'سد بلوک سنجش — خواست کارفرما (۱.۲۷.۱۴/۱۵)',
  'clinical-engine→case-events': 'فقط-تایپ — قرارداد رویداد پرونده',
  'clinical-engine→case-formulation': 'اجرایی — خط لولهٔ صورت‌بندی مورد',
  'working-day→attendance': 'فقط-تایپ — وضعیت حضور'
};

function domainFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (p.endsWith('.ts') && !p.includes('__tests__')) out.push(p);
    }
  };
  walk(DOMAIN);
  return out;
}

describe('گیت یال‌های دامنه (architecture-003/005 — ۱.۲۷.۸۴)', () => {
  it('هیچ فایلی از src/domain به @app وابسته نیست (architecture-003)', () => {
    const offenders = domainFiles()
      .map((f) => ({ f: relative(ROOT, f), src: readFileSync(f, 'utf8') }))
      .filter((x) => /from '@app\//.test(x.src))
      .map((x) => x.f);
    expect(offenders, `این فایل‌های دامنه هنوز به @app وابسته‌اند: ${offenders.join(', ')} — تزریق تابع یا انتقال به @core/shared (الگوی formulationOt/http-params)`).toEqual([]);
  });

  it('یال‌های domain→domain فقط از دفتر مصوب می‌آیند (architecture-005)', () => {
    const found: Record<string, number> = {};
    for (const f of domainFiles()) {
      const cur = relative(DOMAIN, f).split('/')[0];
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/from '@domain\/([a-z-]+)'/g)) {
        const other = m[1];
        if (other !== cur) {
          const edge = `${cur}→${other}`;
          found[edge] = (found[edge] ?? 0) + 1;
        }
      }
    }
    const unknown = Object.keys(found).filter((e) => !(e in APPROVED_EDGES));
    expect(unknown, `یال تازهٔ بی‌مجوز: ${unknown.join(', ')} — یا بردار (shared/تزریق) یا در design.md §۱۱ و همین دفتر با دلیل ثبت کن`).toEqual([]);
    const stale = Object.keys(APPROVED_EDGES).filter((e) => !(e in found));
    expect(stale, `یال مصوب اما دیگر در کد نیست — دفتر فقط-کاهش‌پذیر است: ${stale.join(', ')}`).toEqual([]);
  });

  it('هیچ فایل src/ با مسیر نسبی به worker/ import ندارد (architecture-006 — ۱.۲۷.۸۴)', () => {
    const SRC = join(ROOT, 'src');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!p.endsWith('.ts') && !p.endsWith('.js')) continue;
        if (p.includes('__tests__')) continue;
        if (/from ['"][^'"]*worker\//.test(readFileSync(p, 'utf8'))) offenders.push(relative(ROOT, p));
      }
    };
    walk(SRC);
    expect(offenders, `این فایل‌های src هنوز به worker/ وابسته‌اند: ${offenders.join(', ')} — از @core/scoring و... بخوانید`).toEqual([]);
  });

  it('دفتر مصوب در design.md §۱۱ با همین گیت هم‌خوان است', () => {
    const doc = readFileSync(join(ROOT, 'docs/rust/design.md'), 'utf8');
    const missing = Object.keys(APPROVED_EDGES).filter((e) => !doc.includes(e));
    expect(missing, `این یال‌ها در سند معماری ثبت نشده‌اند: ${missing.join(', ')}`).toEqual([]);
  });
});
