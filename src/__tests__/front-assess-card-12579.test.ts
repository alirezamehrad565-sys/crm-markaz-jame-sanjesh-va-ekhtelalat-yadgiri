// پین‌های ۱.۲۵.۷۹ — بازطراحی فلوی نوبت سنجش در تقویم (خواست کارفرما):
// ① هر درمانگرِ درگیر «کارت گرد معمولی» هم‌شکل بقیهٔ کارت‌ها (grid-appt--assess + hueClass) — درگ‌پذیر و کلیک‌پذیر
// ② دراپ کارت با kind: 'assessment-block' → PATCH /api/assessment-blocks/:id (روز/ساعت/ستون درمانگر دیگر)
// ③ کلیک روی کارت → مودال جزئیات: «ذخیره جزئیات» + «حذف بازهٔ سنجش» — حذف دیگر از فرم ساختن نیست
// ④ ساخت چنددرمانگره با یک دکمه (چیپ‌های چندانتخابی) — سرور فن‌اوت می‌کند؛ مایگریشن ۰۱۱۰ ردیف‌های قدیمی را شکست
// @ts-ignore — فایل .js فرانت، خارج از include تایپ‌اسکریپت است
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const appts = read('public/assets/js/views/appointments.js');
const css = read('public/assets/css/views.css');
const mig = read('migrations/0110_assessment_blocks_per_therapist.sql');
const migDoc = read('docs/MIGRATIONS.md');

describe('۱.۲۵.۷۹ — کارت نوبت سنجش روی گرید (عین کارت‌های عادی)', () => {
  it('کارت گرد هم‌شکل بقیه: grid-appt--assess + hueClass درمانگر + برچسب «سنجش»', () => {
    expect(appts).toMatch(/class: `grid-appt grid-appt--assess \$\{hueClass\(therapistId\)\}`/);
    expect(appts).toMatch(/`سنجش \$\{minuteToLabel\(b\.startMinute\)\}–\$\{minuteToLabel\(b\.endMinute\)\}`/);
    expect(appts).toMatch(/dataset: \{ blockId: b\.id, version: String\(b\.version\) \}/);
    expect(css).toMatch(/\.grid-appt--assess\s*\{/);
  });

  it('درگ‌پذیر فقط برای مدیر + payload تفکیک‌شده + PATCH در دراپ (روز/ساعت/درمانگر)', () => {
    expect(appts).toMatch(/draggable: isManager \? 'true' : null/);
    expect(appts).toMatch(/kind: 'assessment-block'/);
    expect(appts).toMatch(/fromMinute: b\.startMinute/);
    expect(appts).toMatch(/payload\.kind === 'assessment-block'/);
    expect(appts).toMatch(/api\.patch\(`\/api\/assessment-blocks\/\$\{payload\.id\}`/);
    expect(appts).toMatch(/staff_id: targetStaff/);
    // درگ بی‌اثر (همان روز/همان دقیقه/همان ستون) PATCH نمی‌زند
    expect(appts).toMatch(/if \(targetYmd === payload\.fromYmd && snapped === payload\.fromMinute && !targetStaff\) return;/);
  });

  it('نمای روزانه: کارت در ستون همان درمانگر؛ ردیف بدون درمانگر: سایهٔ راه‌راه باقی می‌ماند', () => {
    expect(appts).toMatch(/if \(opts\.staff && opts\.staff !== sid\) continue;/);
    expect(appts).toMatch(/if \(b\.therapistIds\.length === 0\) \{/);
    expect(css).toMatch(/\.grid-assess\s*\{/);
    // شمارندهٔ سرستون کارت سنجش را «نوبت» نمی‌شمارد
    expect(appts).toMatch(/:scope > \.grid-appt:not\(\.grid-appt--assess\)/);
  });
});

describe('۱.۲۵.۷۹ — مودال جزئیات و حذف از کلیکِ کارت', () => {
  it('کلیک کارت → مودال جزئیات: ذخیره جزئیات (PATCH note) + حذف بازهٔ سنجش (danger)', () => {
    expect(appts).toMatch(/function openAssessmentBlockDetailModal\(blockId\)/);
    expect(appts).toMatch(/openAssessmentBlockDetailModal\(b\.id\)/);
    expect(appts).toMatch(/note: noteTa\.value \|\| null, version: b\.version/);
    expect(appts).toMatch(/class: 'btn btn--danger'/);
    expect(appts).toMatch(/'حذف بازهٔ سنجش'/);
    expect(appts).toMatch(/'جزئیات بازهٔ سنجش ذخیره شد'/);
    expect(appts).toMatch(/'بازهٔ سنجش حذف شد — کارت از تقویم برداشته شد'/);
  });

  it('فرم «نوبت سنجش» دیگر فهرست حذف ندارد؛ چیپ‌ها چنددرمانگره‌اند + پیام فن‌اوت', () => {
    expect(appts).not.toMatch(/بازه‌های رزروشدهٔ سنجش/);
    expect(appts).toMatch(/درمانگران درگیر — برای هر نفر یک کارت مستقل ثبت می‌شود \(اختیاری\)/);
    expect(appts).toMatch(/کارت نوبت سنجش ثبت شد — برای هر درمانگر یک کارت مستقل روی تقویم نشست/);
  });
});

describe('۱.۲۵.۷۹ — مایگریشن تفکیک ردیف‌های چنددرمانگره', () => {
  it('0110 ردیف‌های چنددرمانگره را به کارت مستقل می‌شکند و در سند ثبت است', () => {
    expect(mig).toMatch(/json_each\(ab\.therapist_ids\)/);
    expect(mig).toMatch(/json_array\(je\.value\)/);
    expect(mig).toMatch(/deleted_at IS NULL/);
    expect(migDoc).toMatch(/0110_assessment_blocks_per_therapist\.sql/);
  });
});
