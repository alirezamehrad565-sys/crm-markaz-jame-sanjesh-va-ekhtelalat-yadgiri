/**
 * گیت ۱.۲۷.۷۳ (sdt151) — سرچ هوشمند به بقیهٔ منوها (خواست کارفرما):
 * ① پالت ⌘K در پروندهٔ باز: «اسم دانش‌آموز» بالای بخش‌های «همین پرونده» (قبلاً برعکس بود).
 * ② اکشن مستقیم روی نتیجه: doc → «پرینت خام» (بایت احرازشده → تب جدید، همان الگوی previewFile)؛
 *    student → دیپ‌لینک اقدام با ?action=event|teacher-report|definite که پروفایل کلاسیک
 *    همان مودال ردیف وضعیت را باز می‌کند. staff/school/tag/waitlist ناوبری قبلی.
 * ③ CSS: چیپ اکشن gsearch__act (hover مجزا، جداسازی از ناوبری ردیف با stopPropagation).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('سرچ هوشمند — ۱.۲۷.۷۳', () => {
  const gs = read('public/assets/js/global-search.js');
  const prof = read('public/assets/js/views/student-profile.js');
  const css = read('public/assets/css/components.css');

  it('① ترتیب پالت: گروه دانش‌آموز اول، بعد «همین پرونده»', () => {
    expect(gs).toContain("const studentIdx = groups.findIndex((g) => g.type === 'student');");
    expect(gs).toContain('if (studentGroup) pushGroup(studentGroup);');
    const orderIdx = gs.indexOf('if (studentGroup) pushGroup(studentGroup);');
    const localIdx = gs.indexOf("nodes.push(el('div', { class: 'gsearch__group-label' }, icon('compass', 14), 'همین پرونده'));");
    expect(orderIdx).toBeGreaterThan(0);
    expect(orderIdx).toBeLessThan(localIdx);
  });

  it('② اکشن‌های مستقیم: پرینت خام سند + دیپ‌لینک اقدام دانش‌آموز', () => {
    expect(gs).toContain('async function printDocRaw(docId)');
    expect(gs).toContain('`/api/docs/${docId}/files/${file.id}?inline=1`'); // بایت احرازشده
    expect(gs).toContain("setTimeout(() => URL.revokeObjectURL(objUrl), 60000);");
    expect(gs).toContain("if (item.type === 'doc') return [{ icon: 'printer', label: 'پرینت خام', run: () => printDocRaw(item.id) }];");
    expect(gs).toContain('hash: `#/students/${item.id}?action=event`');
    expect(gs).toContain('hash: `#/students/${item.id}?action=teacher-report`');
    expect(gs).toContain('hash: `#/students/${item.id}?action=definite`');
    // جداسازی کلیک اکشن از ناوبری ردیف
    expect(gs).toContain('onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); a.hash ? go({ hash: a.hash }) : a.run(); }');
  });

  it('③ پروفایل: ?action= همان مودال ردیف وضعیت را باز می‌کند (با گارد نقش)', () => {
    expect(prof).toContain("if (deepAction === 'event' && canManageCase) openCaseEventForm({ student, onSaved: onCaseEventSaved });");
    expect(prof).toContain("else if (deepAction === 'teacher-report' && canSendReport) openTeacherReportModal(student);");
    expect(prof).toContain("else if (deepAction === 'definite' && canSendReport) openSnapshotBuilder();");
    expect(prof).toContain("const deepAction = ctx.query?.action;");
  });

  it('④ CSS: چیپ اکشن پالت', () => {
    expect(css).toMatch(/\.gsearch__act \{[\s\S]*?width: 26px;[\s\S]*?cursor: pointer;/);
    expect(css).toContain('.gsearch__act:hover { background: var(--surface-3); color: var(--primary); }');
  });
});
