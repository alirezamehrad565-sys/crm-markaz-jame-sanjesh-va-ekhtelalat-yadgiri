/**
 * گیت یال‌های خانوادهٔ سینک — ۱.۲۷.۸۴ (sdt161: architecture-007)
 * قرارداد: پنج پوشهٔ خانواده فقط با aliasهای @sync/* به هم می‌رسند؛ جهت‌های مجاز در
 * docs/rust/node-sync.md §«یال‌های مجاز» ثبت است و این گیت کد↔سند را هم‌خوان نگه می‌دارد.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../..');
const FAMILY = ['internal-sync', 'node-sync', 'node-sync-client', 'node-sync-runner', 'cloud-setup'];

/** یال‌های مجاز — عیناً در docs/rust/node-sync.md §یال‌های مجاز */
const APPROVED_EDGES: Record<string, string> = {
  'internal-sync→node-sync': 'آینهٔ فهرست سفید و قرارداد صندوق',
  'node-sync-runner→node-sync-client': 'رانر روی کلاینت سینک',
  'node-sync-runner→cloud-setup': 'DOM سازندهٔ پنل سینک',
  'node-sync→@app/http': 'زنجیرهٔ عمومی میزبان'
};

function familyFiles(): { file: string; src: string; dir: string }[] {
  const out: { file: string; src: string; dir: string }[] = [];
  for (const dir of FAMILY) {
    const walk = (d: string): void => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (p.endsWith('.ts') && !p.includes('__tests__')) {
          out.push({ file: relative(ROOT, p), src: readFileSync(p, 'utf8'), dir });
        }
      }
    };
    walk(join(ROOT, 'src', dir));
  }
  return out;
}

describe('گیت یال‌های خانوادهٔ سینک (architecture-007 — ۱.۲۷.۸۴)', () => {
  it('هیچ import نسبی بین پوشه‌های خانواده نیست — فقط alias @sync/*', () => {
    const offenders = familyFiles()
      .filter((x) => new RegExp(`from '\\.\\./(${FAMILY.join('|')})(/|';)`)
        .test(x.src.replace(/from '@sync\/[a-z-]+\/?[^']*/g, '')))
      .map((x) => x.file);
    expect(offenders, `import نسبی بین‌خانواده‌ای: ${offenders.join(', ')} — از @sync/* استفاده کنید`).toEqual([]);
  });

  it('هیچ فایل خانواده به @domain وابسته نیست', () => {
    const offenders = familyFiles().filter((x) => x.src.includes("from '@domain/")).map((x) => x.file);
    expect(offenders, `خانوادهٔ سینک به domain وابسته شد: ${offenders.join(', ')}`).toEqual([]);
  });

  it('یال‌های اجرایی موجود فقط از دفتر مجاز می‌آیند', () => {
    const found: string[] = [];
    for (const x of familyFiles()) {
      if (x.dir === 'internal-sync' && /from '@sync\/node-sync\b/.test(x.src)) found.push('internal-sync→node-sync');
      if (x.dir === 'node-sync-runner' && /from '@sync\/node-sync-client\b/.test(x.src)) found.push('node-sync-runner→node-sync-client');
      if (x.dir === 'node-sync-runner' && /from '@sync\/cloud-setup\b/.test(x.src)) found.push('node-sync-runner→cloud-setup');
      if (x.dir === 'node-sync' && /from '@app\/http\b/.test(x.src)) found.push('node-sync→@app/http');
    }
    const unknown = [...new Set(found)].filter((e) => !(e in APPROVED_EDGES));
    expect(unknown, `یال تازهٔ بی‌مجوز: ${unknown.join(', ')}`).toEqual([]);
  });

  it('api-routing خانواده را فقط با alias mount می‌کند', () => {
    const routes = readFileSync(join(ROOT, 'src/application/api-routing/routes.ts'), 'utf8');
    const rel = routes.match(/from '\.\.\/\.\.\/(node-sync|internal-sync|node-sync-runner)[^']*/g);
    expect(rel, `mount نسبی ممنوع — @sync/* لازم است: ${rel?.join(', ')}`).toBeNull();
    expect(routes).toContain("from '@sync/node-sync/app'");
    expect(routes).toContain("from '@sync/internal-sync'");
    expect(routes).toContain("from '@sync/node-sync-runner/status'");
  });

  it('دفتر مجاز در docs/rust/node-sync.md با همین گیت هم‌خوان است', () => {
    const doc = readFileSync(join(ROOT, 'docs/rust/node-sync.md'), 'utf8');
    const missing = Object.keys(APPROVED_EDGES).filter((e) => !doc.includes(e));
    expect(missing, `این یال‌ها در سند سینک ثبت نشده‌اند: ${missing.join(', ')}`).toEqual([]);
  });
});
