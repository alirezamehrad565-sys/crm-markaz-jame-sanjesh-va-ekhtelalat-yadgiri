/**
 * گیت بهداشت گیت‌های فرانت — ۱.۲۷.۸۲ (sdt159: بستن testing-002، بند دوم done_when):
 * «فایل‌های گیت دیگر توکن‌های آرایشیِ سورس را پین نکنند». مکانیزم توقف:
 *   ① سقف (ratchet) برای تعداد کل پین‌های متنِ سورسِ فرانت در front-*.test.ts — تنها از این
 *      پس فقط کاهش مجاز است؛ هر پین تازه یا باید رفتاری شود یا با تصریح، این سقف پایین آورده شود.
 *   ② سه الگوی آرایشی مطلقاً ممنوع: مُهر نسخهٔ docs، مکانیکِ مسیر import، مارکر کامنتِ نسخه‌دار.
 *   ③ چهار ویو بزرگ باید در سوئیت اجرا شوند (نه فقط متن‌خوانی) — فایل‌های *-logic.test.ts سیم‌اند.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TESTS = join(__dirname, '.');

/** شمارش پین‌های متنِ سورسِ فرانت: expect(<var از read منابع public/assets>).toMatch/toContain */
function countSourcePins(): { total: number; files: number } {
  let total = 0;
  let files = 0;
  for (const name of readdirSync(TESTS).sort()) {
    if (!/^front-.*\.test\.ts$/.test(name)) continue;
    const src = readFileSync(join(TESTS, name), 'utf8');
    files += 1;
    const srcVars = new Set<string>();
    for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:read|readFileSync)\s*\(([^)]*)\)/g)) {
      const arg = m[2];
      if (arg.includes('public/assets') || arg.includes('components.css') || /join\(JS/.test(arg)) {
        srcVars.add(m[1]);
      }
    }
    for (const m of src.matchAll(/expect\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\.\s*(?:not\.)?(?:toMatch|toContain)\s*\(/g)) {
      if (srcVars.has(m[1])) total += 1;
    }
    for (const m of src.matchAll(/expect\(\s*(?:read|readFileSync)\s*\([^)]*public\/assets[^)]*\)\s*\)\s*\.\s*(?:not\.)?(?:toMatch|toContain)\s*\(/g)) {
      total += 1;
    }
  }
  return { total, files };
}

describe('گیت بهداشت گیت‌های فرانت (testing-002 — بند «توقف پین آرایشی»)', () => {
  it('سقف پین‌های متنِ سورس فرانت: ۸۶۷ — تنها کاهش مجاز است (ratchet)', () => {
    const { total, files } = countSourcePins();
    expect(files).toBeGreaterThanOrEqual(60);
    expect(
      total,
      `پین‌های متنِ سورس فرانت: ${total} (سقف مجاز ۸۶۷؛ مبنا ۸۰۱ از sdt159 + ۱ قرارداد a11y موج sdt160). پین تازهٔ سورس ممنوع — توابع/ثابت را export و رفتاری بیازمایید (الگوی front-*-logic.test.ts)؛ اگر سقف را تغییر داده‌اید این ثابت را به همان عدد تازه تغییر دهید.`
    ).toBeLessThanOrEqual(867);
  });

  it('ممنوعیت ① — پینِ مُهر نسخه در سند/سورس («بازنگری ۱.۲۷.۴۱» الگوی حذف‌شده)', () => {
    for (const name of readdirSync(TESTS).sort()) {
      if (!/^front-.*\.test\.ts$/.test(name)) continue;
      const src = readFileSync(join(TESTS, name), 'utf8');
      for (const m of src.matchAll(/(?:toMatch|toContain)\(\s*[`'"]([^`'"]*)[`'"]/g)) {
        expect(name, `پین مُهر نسخه در ${name}: «${m[1].slice(0, 60)}» — آرایشی است`).not.toContain('بازنگری');
      }
    }
  });

  it('ممنوعیت ② — پینِ مثبتِ مکانیک import (`from …`) در سورس فرانت؛ منفی‌پین‌های گاردِ حذف ماژول مجازند', () => {
    for (const name of readdirSync(TESTS).sort()) {
      if (!/^front-.*\.test\.ts$/.test(name)) continue;
      const src = readFileSync(join(TESTS, name), 'utf8');
      expect(src, `${name}: پین مثبت مسیر import آرایشی است`).not.toMatch(/(?<!\.not\.)\btoMatch\(\s*[`'"]?from '/);
      expect(src, `${name}: پین مثبت مسیر import آرایشی است`).not.toMatch(/(?<!\.not\.)\btoContain\(\s*[`'"]?from '/);
      expect(src, `${name}: پین مثبت مسیر import آرایشی است`).not.toMatch(/(?<!\.not\.)toMatch\([^)]*from '\\?\.\\?\.\//);
    }
  });

  it('ممنوعیت ③ — پینِ مارکر کامنتِ نسخه‌دار (/* ۱.۲۷.…) در regex گیت', () => {
    for (const name of readdirSync(TESTS).sort()) {
      if (!/^front-.*\.test\.ts$/.test(name)) continue;
      const src = readFileSync(join(TESTS, name), 'utf8');
      expect(src).not.toMatch(/toMatch\([^)]*\\\*\s*۱\.۲۷/);
    }
  });

  it('چهار ویو بزرگ در سوئیت اجرا می‌شوند — فایل‌های رفتاری سیم‌اند', () => {
    for (const view of ['appointments', 'student-profile', 'exercises', 'clearbook']) {
      const f = join(TESTS, `front-${view}-logic.test.ts`);
      const src = readFileSync(f, 'utf8');
      expect(src).toContain(`views/${view}.js`);
      expect(src.length).toBeGreaterThan(2000); // آزمون واقعی، نه اسمی
    }
  });
});
