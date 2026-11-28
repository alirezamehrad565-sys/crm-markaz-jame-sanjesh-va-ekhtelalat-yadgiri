/**
 * آزمون رفتاری دسته‌بندی کشویی کتابخانهٔ فرم‌ها (case-event-types.js) — خواست کارفرمای ۱.۲۷.۹۴:
 * «۳۳+ فرم، فهرست تخت طولانی است؛ دسته‌بندی کشویی با سربرگ فارسی می‌خواهیم». منطق خالصِ
 * categoryGroups / formCategoryOf / typeMatchesFilter در node اجرا می‌شود — نه فقط متن‌خوانی.
 * ۳۳ کلید واقعیِ پروداکشن (کلید + دستهٔ seed + مخاطب) با خروجی read-only اکسپورت
 * پروداکشن هم‌رقم شده‌اند: checklist×۲۲، session×۷، note×۴.
 * الگوی مرجع: front-appointments-logic.test.ts — استاب سبک sessionStorage/localStorage.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

interface TypeLike {
  key: string;
  category: string;
  isSystem: boolean;
  audience: string;
  active: boolean;
  title: string;
}

const C = (key: string, category: string, isSystem: boolean, audience = 'family'): TypeLike =>
  ({ key, category, isSystem, audience, active: true, title: `قالب آزمون ${key}` });

/* ۳۳ قالب فعال پروداکشن — دقیقاً همان کلیدها و دسته‌های seed سطرهای ACTIVE */
const PROD_33: TypeLike[] = [
  // ورودی و سوابق — ۱
  C('ce-anamnesis-v3', 'session', true),
  // سنجش‌های SLD — ۷ (ملاک‌های خواندن/نوشتن/حساب + کلاسی معلم + سه پروب درمانگر)
  C('ce-sld-calc-v1', 'checklist', true, 'both'),
  C('ce-sld-class-t-v1', 'checklist', true, 'teacher'),
  C('ce-sld-read-v1', 'checklist', true, 'both'),
  C('ce-sld-wri-v1', 'checklist', true, 'both'),
  C('ce-probe-calc-v1', 'session', true),
  C('ce-probe-read-v1', 'session', true),
  C('ce-probe-write-v1', 'session', true),
  // مقیاس‌های معلم/والد — ۶
  C('ce-dcdq-v1', 'checklist', true),
  C('ce-scared-p-v1', 'checklist', true),
  C('ce-sdq-p-v1', 'checklist', true),
  C('ce-sdq-t-v1', 'checklist', true, 'teacher'),
  C('ce-snap-iv-p-v1', 'checklist', true),
  C('ce-snap-iv-t-v1', 'checklist', true, 'teacher'),
  // خانواده و خانه — ۲
  C('ce-home-monitor-v2', 'checklist', true),
  C('ce-id-adapt-v1', 'checklist', true),
  // پایش و پیگیری — ۳
  C('ce-followup-3m-v1', 'checklist', true),
  C('ce-survey-discharge-v1', 'checklist', true),
  C('ce-survey-progress-v1', 'checklist', true),
  // ابزارهای هم‌بودی و افتراق — ۳
  C('ce-asd-criteria-v1', 'checklist', true, 'both'),
  C('ce-odd-criteria-v1', 'checklist', true, 'both'),
  C('ce-speech-criteria-v1', 'checklist', true, 'both'),
  // ثبت جلسه و جمع‌بندی درمانگر — ۱۰
  C('ce-rehab-adl-v1', 'checklist', true, 'staff'),
  C('ce-rehab-cog-v1', 'checklist', true, 'staff'),
  C('ce-rehab-motor-v1', 'checklist', true, 'staff'),
  C('ce-clinical-suspicion-v1', 'note', true, 'staff'),
  C('ce-hypothesis-log-v1', 'note', true),
  C('ce-needs-v1', 'note', true, 'staff'),
  C('ce-results-v1', 'note', true, 'staff'),
  C('ce-ot-session-v1', 'session', true, 'staff'),
  C('ce-wechsler-w4-v1', 'session', true, 'staff'),
  C('intervention', 'session', true),
  // ابزارهای سفارشی مرکز — ۱
  C('t-9fa42a382d', 'checklist', false) // فرم ارزیابی عملکرد حسی — سفارشی مرکز
]; // — ۳۳ ردیف واقعی: ۲۲ checklist + ۴ note + ۷ session

describe('دسته‌بندی کشویی کتابخانهٔ فرم‌ها (case-event-types.js — behavioral)', () => {
  // @ts-ignore — ماژول وانیل فرانت خارج از tsconfig است
  let V: typeof import('../../public/assets/js/views/case-event-types.js');

  beforeAll(async () => {
    (globalThis as Record<string, unknown>).sessionStorage = {
      getItem: () => null, setItem: () => {}, removeItem: () => {}
    };
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => null, setItem: () => {}, removeItem: () => {}
    };
    // @ts-ignore — ماژول وانیل فرانت خارج از tsconfig است
    V = await import('../../public/assets/js/views/case-event-types.js');
  });
  afterAll(() => {
    delete (globalThis as Record<string, unknown>).sessionStorage;
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('۳۳ قالب واقعی → ۸ دسته با شمارش‌های دقیق، بدون گم‌شدن یا تکرار', () => {
    const groups = V.categoryGroups(PROD_33) as Array<{ id: string; label: string; items: TypeLike[] }>;
    expect(groups.map((g) => g.id)).toEqual(
      ['intake', 'sld', 'scales', 'family', 'monitor', 'comorbid', 'clinic', 'custom']);
    expect(groups.map((g) => g.items.length)).toEqual([1, 7, 6, 2, 3, 3, 10, 1]);
    const total = groups.reduce((s, g) => s + g.items.length, 0);
    expect(total).toBe(33); // هیچ قالبی گم نشده
    const keys = groups.flatMap((g) => g.items.map((t) => t.key));
    expect(new Set(keys).size).toBe(33); // و هیچ قالبی دوبار نیامده
    for (const g of groups) expect(g.label.length).toBeGreaterThan(0); // سربرگ فارسی
  });

  it('formCategoryOf — مشتق از خانوادهٔ واقعی کلیدها، نه طبقه‌بندی موازی', () => {
    // ورودی و سوابق — گفت‌وگوی اول و بستهٔ جامع
    expect(V.formCategoryOf(C('ce-anamnesis-v3', 'session', true))).toBe('intake');
    expect(V.formCategoryOf(C('ce-comp-family-v2', 'session', true))).toBe('intake');
    expect(V.formCategoryOf(C('ce-comp-teacher-v2', 'session', true))).toBe('intake');
    // سنجش‌های SLD — ملاک‌ها + پروب‌ها
    expect(V.formCategoryOf(C('ce-sld-read-v1', 'checklist', true))).toBe('sld');
    expect(V.formCategoryOf(C('ce-sld-class-t-v1', 'checklist', true))).toBe('sld');
    expect(V.formCategoryOf(C('ce-probe-calc-v1', 'session', true))).toBe('sld');
    // مقیاس‌های معلم/والد
    expect(V.formCategoryOf(C('ce-sdq-p-v1', 'checklist', true))).toBe('scales');
    expect(V.formCategoryOf(C('ce-snap-iv-t-v1', 'checklist', true))).toBe('scales');
    expect(V.formCategoryOf(C('ce-dcdq-v1', 'checklist', true))).toBe('scales');
    expect(V.formCategoryOf(C('quick-multi-v1', 'checklist', true))).toBe('scales');
    // خانواده و خانه
    expect(V.formCategoryOf(C('ce-home-monitor-v2', 'checklist', true))).toBe('family');
    expect(V.formCategoryOf(C('ce-id-adapt-v1', 'checklist', true))).toBe('family');
    // پایش و پیگیری — نظرسنجی‌ها و پیگیری ۳–۶ماهه
    expect(V.formCategoryOf(C('ce-survey-discharge-v1', 'checklist', true))).toBe('monitor');
    expect(V.formCategoryOf(C('ce-followup-3m-v1', 'checklist', true))).toBe('monitor');
    // ابزارهای هم‌بودی و افتراق — ملاک‌های DSM چندمنبعی
    expect(V.formCategoryOf(C('ce-asd-criteria-v1', 'checklist', true))).toBe('comorbid');
    expect(V.formCategoryOf(C('ce-odd-criteria-v1', 'checklist', true))).toBe('comorbid');
    expect(V.formCategoryOf(C('ce-speech-criteria-v1', 'checklist', true))).toBe('comorbid');
    // ثبت جلسه و جمع‌بندی درمانگر — وکسلر/کاردرمانی/لج‌ها
    expect(V.formCategoryOf(C('ce-results-v1', 'note', true))).toBe('clinic');
    expect(V.formCategoryOf(C('ce-wechsler-w4-v1', 'session', true))).toBe('clinic');
    expect(V.formCategoryOf(C('ce-rehab-motor-v1', 'checklist', true))).toBe('clinic');
    expect(V.formCategoryOf(C('intervention', 'session', true))).toBe('clinic');
    // سفارشی مرکز (t-*) همیشه دستهٔ خودش — حتی اگر دسته‌اش هر چه باشد
    expect(V.formCategoryOf(C('t-9fa42a382d', 'checklist', false))).toBe('custom');
    expect(V.formCategoryOf(C('t-new-one', 'session', false))).toBe('custom');
    // قالب سیستمی آیندهٔ ناشناخته → سطل امن «پایش/نظرسنجی»، نه گم‌شدن
    expect(V.formCategoryOf(C('ce-future-tool-v1', 'checklist', true))).toBe('monitor');
    expect(V.formCategoryOf(undefined as unknown as TypeLike)).toBe('custom');
  });

  it('فیلتر دسته — چیپ هر دسته فقط همان دسته را می‌گذارد؛ «همه» ۳۳تای کامل', () => {
    const all = (grp: string) => PROD_33.filter((t) => V.typeMatchesFilter(t, { grp, aud: 'all', q2: '' }));
    expect(all('all').length).toBe(33);
    expect(all('scales').map((t) => t.key).sort()).toEqual(
      ['ce-dcdq-v1', 'ce-scared-p-v1', 'ce-sdq-p-v1', 'ce-sdq-t-v1', 'ce-snap-iv-p-v1', 'ce-snap-iv-t-v1'].sort());
    expect(all('comorbid').every((t) => V.formCategoryOf(t) === 'comorbid')).toBe(true);
    expect(all('comorbid').length).toBe(3);
    expect(all('custom').map((t) => t.key)).toEqual(['t-9fa42a382d']);
    // فیلترها روی هم جمع می‌شوند: دستهٔ scales + مخاطب معلم
    const scalesTeacher = PROD_33.filter((t) => V.typeMatchesFilter(t, { grp: 'scales', aud: 'teacher', q2: '' }));
    expect(scalesTeacher.map((t) => t.key).sort()).toEqual(['ce-sdq-t-v1', 'ce-snap-iv-t-v1'].sort());
  });

  it('فیلتر مخاطب و جستجو — هر دو مخاطب و مخالفِ عنوان حذف می‌شوند؛ غیرفعال هرگز', () => {
    const aud = (a: string) => PROD_33.filter((t) => V.typeMatchesFilter(t, { grp: 'all', aud: a, q2: '' }));
    const bothCount = PROD_33.filter((t) => t.audience === 'both').length;
    expect(aud('teacher').length).toBe(bothCount + PROD_33.filter((t) => t.audience === 'teacher').length); // both هم می‌آید
    expect(aud('staff').length).toBe(bothCount + PROD_33.filter((t) => t.audience === 'staff').length); // معناشناسی موجود: both با هر چیپ مخاطب می‌آید
    const search = PROD_33.filter((t) => V.typeMatchesFilter({ ...t, title: 'پرسش‌نامهٔ رفتار کودک — فرم خانواده (SDQ)' }, { grp: 'all', aud: 'all', q2: 'رفتار کودک' }));
    expect(search.length).toBe(33); // همهٔ ردیف‌ها همان عنوان را دارند
    expect(PROD_33.filter((t) => V.typeMatchesFilter({ ...t, title: 'گزارش جلسهٔ مداخله' }, { grp: 'all', aud: 'all', q2: 'رفتار کودک' })).length).toBe(0);
    const inactive = V.typeMatchesFilter({ ...PROD_33[0], active: false }, { grp: 'all', aud: 'all', q2: '' });
    expect(inactive).toBe(false); // قالب غیرفعال هیچ‌جا رندر نمی‌شود — رفتار ۱.۲۷.۴۰ دست‌نخورده
  });

  it('ترتیب درون‌دسته‌ای = ترتیب ورودی سرور — دست‌نخورده', () => {
    const groups = V.categoryGroups(PROD_33) as Array<{ id: string; items: TypeLike[] }>;
    const sld = groups.find((g) => g.id === 'sld') as { items: TypeLike[] };
    expect(sld.items.map((t) => t.key)).toEqual(
      ['ce-sld-calc-v1', 'ce-sld-class-t-v1', 'ce-sld-read-v1', 'ce-sld-wri-v1', 'ce-probe-calc-v1', 'ce-probe-read-v1', 'ce-probe-write-v1']);
    const clinic = groups.find((g) => g.id === 'clinic') as { items: TypeLike[] };
    expect(clinic.items.map((t) => t.key)).toEqual(
      ['ce-rehab-adl-v1', 'ce-rehab-cog-v1', 'ce-rehab-motor-v1', 'ce-clinical-suspicion-v1', 'ce-hypothesis-log-v1', 'ce-needs-v1', 'ce-results-v1', 'ce-ot-session-v1', 'ce-wechsler-w4-v1', 'intervention']);
  });
});
