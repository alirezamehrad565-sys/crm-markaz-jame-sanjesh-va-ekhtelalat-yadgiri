/**
 * گیت فرانت ۱.۲۵.۸۱ — «پیش‌نمایش از نگاه خانواده» در فرم‌ساز + برداشتن سقف ۴۵ آیتمی
 * خواست کارفرما: «یکی از همکار‌ها می‌خواد تو فرم‌ها و پرسشنامه‌ها پرسشنامه طراحی کنه،
 * پرسشنامه‌ش ۱۰۰ ایتمه ولی محدودیت ۴۵ ایتمه — درستش کن؛ یه گزینه پیش‌نمایش بزار که همکار
 * ببینه خانواده دقیقاً چی می‌بینه و بعد از پر کردن چه جوابی می‌ده؛ نتایج امتحانی جایی
 * ذخیره نشه». این گیت سیم‌کشی را پین می‌کند:
 * ① دکمهٔ «پیش‌نمایش از نگاه خانواده» در نوار کنش مودال فرم‌ساز (قبل از ذخیره)
 * ② definitionPayload واحد — save و پیش‌نمایش از یک سازنده (پیش‌نمایش = عین ذخیره)
 * ③ فرم POST مخفی به /public/case-events/preview با توکن نشست (مسیر /public سرِتیت هدر ندارد)
 * ④ نقطهٔ پایانی تحلیل = مسیر خالص بدون نوشتنی؛ توکن با verifySessionJwt تأیید می‌شود
 * ⑤ سقف آیتم = ۱۲۰ (پرسش‌نامهٔ ۱۰۰ ایتمی می‌گذرد) با پیام فارسی
 * الگو: front-12561.test.ts — گیت محتوایی سورس‌خوان
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت فرانت ۱.۲۵.۸۱ — پیش‌نمایش از نگاه خانواده + سقف ۱۰۰ آیتمی', () => {
  const view = read('public/assets/js/views/case-event-types.js');
  const routes = read('src/domain/case-events/routes.ts');
  const pure = read('src/domain/case-events/pure.ts');
  const previewPage = read('src/domain/case-events/preview-form.ts');
  const publicForm = read('src/domain/case-events/public-form.ts');
  const version = read('src/core/version.ts');

  it('① دکمهٔ پیش‌نمایش در نوار کنش فرم‌ساز، پیش از دکمهٔ ذخیره', () => {
    expect(view).toContain("'پیش‌نمایش از نگاه خانواده'");
    const actionsIdx = view.indexOf('actions: [');
    const previewBtnIdx = view.indexOf('openFamilyPreview()');
    const saveBtnIdx = view.indexOf("lockBtn(e.currentTarget, () => save(closeModal))");
    expect(actionsIdx).toBeGreaterThan(-1);
    expect(previewBtnIdx).toBeGreaterThan(actionsIdx);
    expect(saveBtnIdx).toBeGreaterThan(previewBtnIdx); // ترتیب: پیش‌نمایش → ذخیره → انصراف
  });

  it('② save و پیش‌نمایش از یک definitionPayload می‌خوانند — پیش‌نمایش = عین ذخیره', () => {
    expect(view).toContain('function definitionPayload()');
    expect(view).toContain('const payload = definitionPayload();');
    const builderIdx = view.indexOf('function definitionPayload()');
    const saveUseIdx = view.indexOf('const payload = definitionPayload();');
    expect(builderIdx).toBeGreaterThan(-1);
    expect(saveUseIdx).toBeGreaterThan(builderIdx);
  });

  it('③ فرم POST مخفی با توکن نشست به /public/case-events/preview — تب تازه', () => {
    expect(view).toContain("action: '/public/case-events/preview'");
    expect(view).toContain("target: '_blank'");
    expect(view).toContain("hidden('token', getToken() ?? '')");
    expect(view).toContain("import { api, getToken } from '../api.js'");
  });

  it('④ نقطهٔ پایانی تحلیل = خالص و بدون نوشتنی؛ توکن با verifySessionJwt + نقش مجاز', () => {
    expect(routes).toContain("/public/case-events/preview/analyze");
    expect(routes).toContain('هیچ نوشتنی');
    expect(routes).toContain('verifySessionJwt');
    expect(routes).toContain("STAFF_ROLES = ['manager', 'secretary', 'therapist']");
    expect(routes).toContain('analyzeChecklist(def.fields, def.bands ?? null, numericValues, def.subscales ?? null)');
    // عین مسیر fillByFamily — نگاشت عددی فقط از آیتم‌های نمره‌دار
    expect(routes).toContain(".filter(([k]) => scoredKeys.has(k))");
  });

  it('⑤ سقف آیتم = ۱۲۰ با ریشهٔ گزارش همکار + پیام فارسی zod', () => {
    expect(pure).toContain('export const FIELDS_MAX = 120;');
    expect(pure).toContain('۱۰۰ ایتمی');
    expect(pure).toContain('حداکثر ${faNum(FIELDS_MAX)} آیتم در هر قالب مجاز است');
  });

  it('⑥ صفحهٔ پیش‌نمایش بنر «ذخیره نمی‌شود» دارد و بخش‌بندی مشترک می‌خواند', () => {
    expect(previewPage).toContain('هیچ پاسخی جایی ذخیره نمی‌شود');
    expect(previewPage).toContain('familySectionsOf');
    expect(previewPage).toContain('/public/case-events/preview/analyze');
    expect(publicForm).toContain('export function familySectionsOf');
    // نسخه
    expect(version).toContain("APP_VERSION = '1.27.65'");
  });
});
