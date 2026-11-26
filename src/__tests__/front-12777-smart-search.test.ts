/**
 * گیت ۱.۲۷.۷۷ (sdt154) — موج B3 «جستجوی هوشمند + کارت» از بازخورد کارفرما (پیام ۱۶):
 * ① نرمال‌سازی فارسی تنها منبعِ سمت سرور دارد (@core/shared/fa-search) و pure.ts فقط re-export است،
 * ② شرط متنی لیست/شمارش از یک قرارداد مشترک studentTextCondition می‌آید (نام کامل + ولیّ + کد ملی + تلفن)،
 * ③ جستجوی سراسری هم‌قرارداد شد، ④ آینهٔ کلاینت همان قواعد را از format.js مصرف می‌کند،
 * ⑤ کارت: نام سرِ خانه + ستون ولیّ با نامِ اصلی + وضعیت پرونده کنار وضعیت فعال.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت B3 — جستجوی هوشمند و کارت ۱.۲۷.۷۷', () => {
  const faSearch = read('src/core/shared/fa-search.ts');
  const pure = read('src/application/search/pure.ts');
  const repository = read('src/domain/student-profile/repository.ts');
  const studentService = read('src/domain/student-profile/service.ts');
  const globalService = read('src/application/search/service.ts');
  const format = read('public/assets/js/format.js');
  const students = read('public/assets/js/views/students.js');

  it('① قواعد فارسی در هستهٔ مشترک است و pure فقط سازگاری re-export می‌کند', () => {
    expect(faSearch).toContain("replace(/[يى]/g, 'ی')");
    expect(faSearch).toContain("replace(/ك/g, 'ک')");
    expect(faSearch).toContain("replace(/[أإآ]/g, 'ا')");
    expect(faSearch).toContain('.replace(/\\u200c/g, \'\')');
    expect(pure).toContain("export { toLatinDigits, likePattern, faNormalize, sanitizeFaQuery, faHaystackExpr } from '@core/shared'");
  });

  it('② لیست و شمارش یک قرارداد studentTextCondition دارند (نام کامل/ولیّ/کد ملی/تلفن)', () => {
    expect(repository).toContain("faHaystackExpr(`(${p}first_name || ' ' || ${p}last_name)`)");
    expect(repository).toContain("faHaystackExpr(`${p}guardian_name`)");
    expect(repository).toContain('OR ${p}guardian_phone LIKE ?');
    expect(repository).toMatch(/studentTextCondition\(\s*filters\.query,\s*'s\.'/);
    expect(studentService).toMatch(/studentTextCondition\(filters\.query,\s*''\)/);
    expect(studentService).not.toContain('(first_name LIKE ? OR last_name LIKE ? OR national_id LIKE ?)');
  });

  it('③ جستجوی سراسری نرمال فارسی می‌گیرد', () => {
    expect(globalService).toContain('sanitizeFaQuery(rawQuery)');
    expect(globalService).toMatch(/\$\{faHaystackExpr\('first_name'\)\}/);
    expect(globalService).toMatch(/\$\{faHaystackExpr\('full_name'\)\}/);
  });

  it('④ آینهٔ کلاینت هم‌قواعد است', () => {
    expect(format).toContain("replace(/[يى]/g, 'ی')");
    expect(students).toContain("import { fa, faNormalize, gradeLabel, isPlaceholderNid } from '../format.js'");
    expect(students).toContain('const q = faNormalize(local.query);');
    expect(students).toContain("faNormalize(`${s.guardianName ?? ''} ${s.guardianPhone ?? ''}`)");
  });

  it('⑤ کارت: ولیّ با نامِ اصلی و وضعیت پرونده کنار وضعیت فعال', () => {
    expect(students).toContain("{ key: 'guardianPhone', label: 'ولیّ'");
    expect(students).toContain("s.guardianName ? el('div', { class: 'cell-main' }, s.guardianName) : null");
    expect(students).toContain('CASE_STATUS_LABELS[s.caseStatus]');
    expect(students).toContain("identified: 'شناسایی‌شده'");
    expect(students).toContain("in_intervention: 'در مداخله'");
  });
});
