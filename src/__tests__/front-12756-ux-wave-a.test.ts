/**
 * گیت ۱.۲۷.۵۶ — موج A بازطراحی پرونده (برندهٔ مسابقهٔ شش‌طرح: «فلوهای هدایت‌شده» + تلفیق ۱/۵).
 * قاعدهٔ مرکزی: «هر عمل یک خانهٔ ثابت» — دوقلوها حذف، خانهٔ همیشه‌نمایان = ردیف اقدام کارت وضعیت.
 * اعتبارسنجی مرورگری واقعی روی سرور محلی انجام شد (snapshotهای accessibility قبل/بعد).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('موج A — هر عمل یک خانهٔ ثابت', () => {
  const view = read('public/assets/js/views/student-profile.js');

  it('ثبت رویداد فقط یک خانه دارد (ردیف اقدام کارت وضعیت) — سرصفه‌های تاریخچه و جلسات خالی‌اند', () => {
    expect((view.match(/ثبت رویداد پرونده/g) ?? []).length).toBe(1);
    expect(view).not.toContain("el('div', { class: 'card__title' }, 'تاریخچهٔ پرونده'),\n        canCreateCaseEvents()");
    expect(view).not.toContain("'نوبت‌ها و حضور'),\n          canReport");
  });

  it('گزارش به معلم یک خانهٔ ثابت در ردیف اقدام دارد — کارت گزارش‌های ارسالی فقط راهنماست', () => {
    // فقط یک دکمهٔ دکمه‌وار — رخداد دوم، عنوان مودال باز است نه دکمهٔ تکراری
    expect((view.match(/icon\('bot', 15\), 'ارسال گزارش به معلم مدرسه'/g) ?? []).length).toBe(1);
    expect(view).toContain('دکمهٔ ارسال تازه در ردیف اقدام کارت وضعیت بالای پرونده است.');
  });

  it('صدور گزارش قطعی از page-head جزیره‌ای به ردیف اقدام آمد', () => {
    expect(view).not.toContain("onclick: () => openSnapshotBuilder() }, icon('file', 15), 'صدور گزارش قطعی') : null");
    expect(view).toContain("onclick: () => openSnapshotBuilder()\n                        }, icon('file', 15), 'صدور گزارش قطعی')");
    expect(view).toContain("'بازگشت به فهرست'"); // page-head فقط ناوبری
  });

  it('ردیف اقدام با گیت per-item — منشی (canSendReport) هم گزارش و صدور می‌بیند', () => {
    expect(view).toContain('(canCreateCaseEvents() || canSendReport)');
    expect(view).toContain("canSendReport\n                      ? el('button', {\n                          class: 'btn btn--soft btn--sm',\n                          onclick: () => openTeacherReportModal(student)");
  });

  it('چیپ جلسه‌های بی‌گزارش کنار اقدام بعدی — از منبع واحد با برگهٔ جلسه', () => {
    expect(view).toContain('missingReportAppts()');
    expect(view).toContain('const missingReports = missingReportAppts();');
    expect(view).toContain('جلسهٔ بی‌گزارش`');
  });

  it('حضور از خود پرونده ثبت‌شدنی است — PATCH موجود، گیت سرور محترم', () => {
    expect(view).toContain("api.patch(`/api/attendance/${a.appointmentId}/${id}`, { status })");
    expect(view).toContain('openAttendanceModal');
    expect(view).toContain("[['present', 'حاضر'], ['late', 'حضور با تأخیر'], ['absent', 'غایب'], ['cancelled', 'لغو جلسه']]");
    expect(view).toContain("render: (a) => canReport && a.status === 'scheduled'");
  });

  it('گراف بوت دست‌نخورده — منطق تازهٔ حضور در چانک پرونده است نه app.js', () => {
    expect(read('public/assets/js/app.js')).not.toContain('openAttendanceModal');
    expect(read('public/assets/js/app.js')).not.toContain('missingReportAppts');
  });
});
