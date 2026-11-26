/**
 * گیت ۱.۲۷.۷۸ (sdt155) — موج B2 «جستجوی هوشمند بانک کارت‌های آماده» (هم‌الگوی B3 پیام ۱۶):
 * ① شرط q سرور با هستهٔ مشترک fa-search (لیست و شمارش یک قرارداد)، ② آینهٔ کلاینت با
 * faNormalize، ③ منبع آینه (format.js) سرِ جایش است، ④ e2e فارسی سرِ جایش است،
 * ⑤ قرارداد fa-search پین می‌ماند.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت B2 — جستجوی هوشمند کارت‌های آماده ۱.۲۷.۷۸', () => {
  const service = read('src/domain/exercise-bank/service.ts');
  const view = read('public/assets/js/views/exercises.js');
  const format = read('public/assets/js/format.js');
  const faSearch = read('src/core/shared/fa-search.ts');

  it('① شرط q لیست با هستهٔ مشترک است — هم‌سطحِ چسبیدهٔ title+description با پارامتر یکتا', () => {
    expect(service).toContain('const like = likePattern(sanitizeFaQuery(filters.q));');
    expect(service).toContain('faHaystackExpr("(e.title || \' \' || COALESCE(e.description, \'\'))")');
    expect(service).toContain("conds.push(`(${hay} LIKE ? ESCAPE '\\\\')`);");
    expect(service).not.toContain('conds.push("(e.title LIKE ?'); // الگوی خامِ لیست بازنگشته
  });

  it('② آینهٔ کلاینت matchesFilter با faNormalize است — toLowerCase خام بازنگشته', () => {
    /* ۱.۲۷.۸۲ (testing-002): فیلتر به matchesFilterCore پارامتری بالاکش شد — رفتارش در
       front-exercises-logic.test.ts اجرا می‌شود (ی/ي هم‌ارز)؛ اینجا فقط سیمِ آینه پین است */
    expect(view).toContain("faNormalize(`${ex.title ?? ''} ${ex.description ?? ''}`)");
    expect(view).toContain('matchesFilterCore(ex, state.format, state.published, state.q)');
    expect(view).not.toContain('state.q.toLowerCase()');
  });

  it('③ منبع آینه: format.js faNormalize را صادر می‌کند و قاعدهٔ نیم‌فاصله دارد', () => {
    expect(format).toContain('export function faNormalize');
    expect(format).toContain('\\u200c');
  });

  it('④ e2e فارسی بانک کارت‌ها سرِ جای خودش است (هفت سناریو)', () => {
    const e2e = read('src/application/__tests__/exercises-search-fa.test.ts');
    const its = e2e.match(/\bit\(/g) ?? [];
    expect(its.length).toBeGreaterThanOrEqual(7);
    expect(e2e).toContain('wildcard «%»');
  });

  it('⑤ قرارداد fa-search پین است — چهار صادری و قاعدهٔ ZWNJ/ارقام', () => {
    expect(faSearch).toContain('export function faNormalize');
    expect(faSearch).toContain('export function sanitizeFaQuery');
    expect(faSearch).toContain('export function likePattern');
    expect(faSearch).toContain('export function faHaystackExpr');
    expect(faSearch).toContain("['\\u200c', '']");
  });
});
