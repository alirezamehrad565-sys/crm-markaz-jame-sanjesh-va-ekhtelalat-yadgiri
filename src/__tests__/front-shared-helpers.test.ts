/**
 * گیت ۱.۲۵.۰۲ — یکسان‌سازی هلپرهای تکراری فرانت (دستهٔ D/E منوی ارتقا)
 *
 * کلاس بدهی: سه نسخهٔ collapseRemove (ui/appointments/working-day)، چهار نسخهٔ sizeLabel
 * (knowledge-admin/docs/clearbook فارسی + exercises لاتین) و دو کپی واژه‌نامهٔ نیاز ویژه
 * (student-profile/special-needs) — هر پراکندگی خطر واگرایی رفتار و واژه‌هاست.
 *
 * قفل می‌کند: تک‌منبعی تعریف‌ها + تست واحد واقعی sizeLabelها + سازگاری قرارداد undo
 * (۱.۱۹.۰ روز کاری به rm?.undo() تکیه دارد — بازگشت { undo } از ui.js باید حفظ شود).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// @ts-ignore — فایل‌های js فرانت خارج از include تایپ‌اسکریپت‌اند
import { sizeLabel, sizeLabelEn } from '../../public/assets/js/format.js';
// @ts-ignore
import { SPECIAL_NEED_TYPE_LABELS, SPECIAL_NEED_SEVERITY_LABELS, SPECIAL_NEED_SEVERITY_TONES } from '../../public/assets/js/taxonomy.js';

const FRONT = join(__dirname, '../../public/assets/js');
const read = (p: string) => readFileSync(join(FRONT, p), 'utf8');

describe('۱.۲۵.۰۲ — sizeLabel (تست واحد واقعی)', () => {
  test('ورودی نامعتبر → رشتهٔ خالی (قرارداد هر چهار نسخهٔ قبلی)', () => {
    expect(sizeLabel(undefined)).toBe('');
    expect(sizeLabel(null)).toBe('');
    expect(sizeLabelEn(undefined)).toBe('');
  });

  test('بایت و کیلوبایت — فارسی', () => {
    expect(sizeLabel(0)).toContain('بایت');
    expect(sizeLabel(512)).toContain('بایت');
    expect(sizeLabel(1024)).toContain('کیلوبایت');
    expect(sizeLabel(2 * 1024)).toContain('کیلوبایت');
  });

  test('مگابایت با یک رقم اعشار (زیر ۱۰) و گرد (بالای ۱۰) — فارسی', () => {
    expect(sizeLabel(1.5 * 1024 * 1024)).toContain('مگابایت');
    const m = sizeLabel(1.25 * 1024 * 1024);
    expect(m).toMatch(/۱\.۳/); // Math.round(12.5)/10=۱.۳ — جداکنندهٔ اعشار پس از fa() نقطهٔ ASCII می‌ماند
    expect(sizeLabel(15 * 1024 * 1024)).toMatch(/۱۵ مگابایت/); // ≥۱۰ گرد
  });

  test('واریانت لاتین (بانک کارت‌ها) — واحدهای MB/KB/B', () => {
    expect(sizeLabelEn(1024)).toContain('KB');
    expect(sizeLabelEn(512)).toContain('B');
    expect(sizeLabelEn(3 * 1024 * 1024)).toContain('MB');
  });

  test('ارقام فارسی در خروجی (fa) — رقم لاتین نباید بنشیند', () => {
    expect(sizeLabel(1024)).toMatch(/[۰-۹]/);
    expect(sizeLabelEn(1024)).toMatch(/[۰-۹]/);
  });
});

describe('۱.۲۵.۰۲ — واژه‌نامهٔ نیاز ویژه (تک‌منبع taxonomy.js)', () => {
  test('ده نوع + سه شدت با کلیدهای سرور', () => {
    expect(Object.keys(SPECIAL_NEED_TYPE_LABELS).sort()).toEqual(
      ['adhd', 'anxiety', 'autism', 'dyscalculia', 'dysgraphia', 'dyslexia', 'motor_coordination', 'other', 'slow_learner', 'speech_language'].sort()
    );
    expect(SPECIAL_NEED_SEVERITY_LABELS).toEqual({ mild: 'خفیف', moderate: 'متوسط', severe: 'شدید' });
    expect(SPECIAL_NEED_SEVERITY_TONES).toEqual({ mild: 'neutral', moderate: 'warning', severe: 'error' });
  });
});

describe('۱.۲۵.۰۲ — تک‌منبعی تعریف‌ها (گیت استاتیک)', () => {
  test('collapseRemove فقط در ui.js تعریف می‌شود — دو نسخهٔ محلی حذف شده‌اند', () => {
    expect(read('ui.js')).toMatch(/export function collapseRemove\(/);
    expect(read('views/appointments.js')).not.toMatch(/function collapseRemove\(/);
    expect(read('views/working-day.js')).not.toMatch(/function collapseRemove\(/);
    // هر دو آن را از جعبه‌ابزار مشترک وارد می‌کنند
    expect(read('views/appointments.js')).toMatch(/import \{[^}]*collapseRemove[^}]*\} from '\.\.\/ui\.js'/);
    expect(read('views/working-day.js')).toMatch(/import \{[^}]*collapseRemove[^}]*\} from '\.\.\/ui\.js'/);
  });

  test('قرارداد undo روز کاری حفظ شده — بازگشت { undo } در ui.js', () => {
    const ui = read('ui.js');
    const fn = ui.match(/export function collapseRemove\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn).toMatch(/undo\(\)/);          // شیء بازگشتی undo دارد
    expect(fn).toMatch(/parent\.insertBefore\(elm, next\)/); // بازگشت به جایگاه اصلی
    // روز کاری هنوز به rm?.undo() تکیه دارد و دست‌نخورده است
    expect(read('views/working-day.js')).toMatch(/rm\?\.undo\(\)/);
  });

  test('sizeLabel فقط در format.js — چهار نسخهٔ محلی حذف شده‌اند', () => {
    expect(read('format.js')).toMatch(/export function sizeLabel\(/);
    expect(read('format.js')).toMatch(/export function sizeLabelEn\(/);
    for (const f of ['knowledge-admin.js', 'views/docs.js', 'views/clearbook.js', 'views/exercises.js']) {
      expect(read(f)).not.toMatch(/function sizeLabel\(/);
    }
    // واریانت لاتین بانک کارت‌ها با import مستقیم حفظ شده (بدون تغییر بصری)
    expect(read('views/exercises.js')).toMatch(/import \{[^}]*sizeLabelEn[^}]*\} from '\.\.\/format\.js'/);
  });

  test('واژه‌نامهٔ نیاز ویژه فقط در taxonomy.js — دو کپی حذف شده‌اند', () => {
    const tax = read('taxonomy.js');
    expect(tax).toMatch(/export const SPECIAL_NEED_TYPE_LABELS/);
    expect(tax).toMatch(/export const SPECIAL_NEED_SEVERITY_LABELS/);
    expect(tax).toMatch(/export const SPECIAL_NEED_SEVERITY_TONES/);
    expect(read('views/student-profile.js')).not.toMatch(/const SPECIAL_NEED_TYPE_LABELS = \{/);
    expect(read('views/special-needs.js')).not.toMatch(/const TYPE_LABELS = \{/);
    // هر دو نما از واژه‌نامهٔ مشترک وارد می‌کنند
    expect(read('views/student-profile.js')).toMatch(/import \{ SPECIAL_NEED_TYPE_LABELS[^}]*\} from '\.\.\/taxonomy\.js'/);
    expect(read('views/special-needs.js')).toMatch(/import \{ SPECIAL_NEED_TYPE_LABELS[^}]*\} from '\.\.\/taxonomy\.js'/);
  });
});
