/**
 * آزمون رفتاری گروه‌بندی کتابخانهٔ فرم‌ها (case-event-types.js) — خواست کارفرما:
 * «۳۳ فرم داریم، دسته‌بندی درستی نداره، تعدادشون زیاده». منطق خالصِ groupTypes /
 * formGroupOf / typeMatchesFilter در node اجرا می‌شود — نه فقط متن‌خوانی.
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
  // مقیاس‌ها و پرسشنامه‌های استاندارد — ۶
  C('ce-asd-criteria-v1', 'checklist', true, 'both'),
  C('ce-dcdq-v1', 'checklist', true),
  C('ce-followup-3m-v1', 'checklist', true),
  C('ce-home-monitor-v2', 'checklist', true),
  C('ce-id-adapt-v1', 'checklist', true),
  C('ce-odd-criteria-v1', 'checklist', true, 'both'),
  C('ce-rehab-adl-v1', 'checklist', true, 'staff'),
  C('ce-rehab-cog-v1', 'checklist', true, 'staff'),
  C('ce-rehab-motor-v1', 'checklist', true, 'staff'),
  C('ce-scared-p-v1', 'checklist', true),
  C('ce-sdq-p-v1', 'checklist', true),
  C('ce-sdq-t-v1', 'checklist', true, 'teacher'),
  C('ce-sld-calc-v1', 'checklist', true, 'both'),
  C('ce-sld-class-t-v1', 'checklist', true, 'teacher'),
  C('ce-sld-read-v1', 'checklist', true, 'both'),
  C('ce-sld-wri-v1', 'checklist', true, 'both'),
  C('ce-snap-iv-p-v1', 'checklist', true),
  C('ce-snap-iv-t-v1', 'checklist', true, 'teacher'),
  C('ce-speech-criteria-v1', 'checklist', true, 'both'),
  C('ce-survey-discharge-v1', 'checklist', true),
  C('ce-survey-progress-v1', 'checklist', true),
  C('t-9fa42a382d', 'checklist', false), // فرم ارزیابی عملکرد حسی — سفارشی مرکز
  // گزارش‌ها و جمع‌بندی بالینی — ۴
  C('ce-clinical-suspicion-v1', 'note', true, 'staff'),
  C('ce-hypothesis-log-v1', 'note', true),
  C('ce-needs-v1', 'note', true, 'staff'),
  C('ce-results-v1', 'note', true, 'staff'),
  // ثبت جلسه و آزمون‌های درمانگر (شامل ابزارهای توانبخشی) — ۷
  C('ce-anamnesis-v3', 'session', true),
  C('ce-ot-session-v1', 'session', true, 'staff'),
  C('ce-probe-calc-v1', 'session', true),
  C('ce-probe-read-v1', 'session', true),
  C('ce-probe-write-v1', 'session', true),
  C('ce-wechsler-w4-v1', 'session', true, 'staff'),
  C('intervention', 'session', true)
]; // — ۳۳ ردیف واقعی: ۲۲ checklist + ۴ note + ۷ session

describe('گروه‌بندی کتابخانهٔ فرم‌ها (case-event-types.js — behavioral)', () => {
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

  it('۳۳ قالب واقعی → ۶ گروه با شمارش‌های دقیق، بدون گم‌شدن یا تکرار', () => {
    const groups = V.groupTypes(PROD_33) as Array<{ id: string; label: string; items: TypeLike[] }>;
    expect(groups.map((g) => g.id)).toEqual(['scale', 'criteria', 'monitor', 'session', 'note', 'custom']);
    expect(groups.map((g) => g.items.length)).toEqual([6, 7, 5, 10, 4, 1]);
    const total = groups.reduce((s, g) => s + g.items.length, 0);
    expect(total).toBe(33); // هیچ قالبی گم نشده
    const keys = groups.flatMap((g) => g.items.map((t) => t.key));
    expect(new Set(keys).size).toBe(33); // و هیچ قالبی دوبار نیامده
    for (const g of groups) expect(g.label.length).toBeGreaterThan(0); // سربرگ فارسی
  });

  it('formGroupOf — مشتق از مقادیر واقعی، نه طبقه‌بندی موازی', () => {
    // دسته‌های seed سیستمی عیناً همان گروه‌اند
    expect(V.formGroupOf(C('ce-anamnesis-v3', 'session', true))).toBe('session');
    expect(V.formGroupOf(C('ce-results-v1', 'note', true))).toBe('note');
    // سطل checklist با خانوادهٔ واقعی کلیدها می‌شکند
    expect(V.formGroupOf(C('ce-sdq-p-v1', 'checklist', true))).toBe('scale');
    expect(V.formGroupOf(C('ce-snap-iv-t-v1', 'checklist', true))).toBe('scale');
    expect(V.formGroupOf(C('ce-dcdq-v1', 'checklist', true))).toBe('scale');
    expect(V.formGroupOf(C('ce-asd-criteria-v1', 'checklist', true))).toBe('criteria');
    expect(V.formGroupOf(C('ce-sld-class-t-v1', 'checklist', true))).toBe('criteria');
    expect(V.formGroupOf(C('ce-speech-criteria-v1', 'checklist', true))).toBe('criteria');
    expect(V.formGroupOf(C('ce-survey-discharge-v1', 'checklist', true))).toBe('monitor');
    expect(V.formGroupOf(C('ce-home-monitor-v2', 'checklist', true))).toBe('monitor');
    // ابزارهای ارزیابی توانبخشی — ثبت درمانگر، نه پایش خانواده
    expect(V.formGroupOf(C('ce-rehab-adl-v1', 'checklist', true))).toBe('session');
    expect(V.formGroupOf(C('ce-rehab-motor-v1', 'checklist', true))).toBe('session');
    // سفارشی مرکز (t-*) همیشه گروه خودش — حتی اگر دسته‌اش هر چه باشد
    expect(V.formGroupOf(C('t-9fa42a382d', 'checklist', false))).toBe('custom');
    expect(V.formGroupOf(C('t-new-one', 'session', false))).toBe('custom');
    // چک‌لیست سیستمی آیندهٔ ناشناخته → پایش/نظرسنجی (سطل امن)، نه گم‌شدن
    expect(V.formGroupOf(C('ce-future-tool-v1', 'checklist', true))).toBe('monitor');
    expect(V.formGroupOf(undefined as unknown as TypeLike)).toBe('custom');
  });

  it('فیلتر گروه — چیپ هر گروه فقط همان گروه را می‌گذارد؛ «همه» ۳۳تای کامل', () => {
    const all = (grp: string) => PROD_33.filter((t) => V.typeMatchesFilter(t, { grp, aud: 'all', q2: '' }));
    expect(all('all').length).toBe(33);
    expect(all('scale').map((t) => t.key).sort()).toEqual(
      ['ce-dcdq-v1', 'ce-scared-p-v1', 'ce-sdq-p-v1', 'ce-sdq-t-v1', 'ce-snap-iv-p-v1', 'ce-snap-iv-t-v1'].sort());
    expect(all('criteria').every((t) => V.formGroupOf(t) === 'criteria')).toBe(true);
    expect(all('criteria').length).toBe(7);
    expect(all('custom').map((t) => t.key)).toEqual(['t-9fa42a382d']);
    // فیلترها روی هم جمع می‌شوند: گروه scale + مخاطب معلم
    const scaleTeacher = PROD_33.filter((t) => V.typeMatchesFilter(t, { grp: 'scale', aud: 'teacher', q2: '' }));
    expect(scaleTeacher.map((t) => t.key).sort()).toEqual(['ce-sdq-t-v1', 'ce-snap-iv-t-v1'].sort());
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

  it('ترتیب درون‌گروهی = ترتیب ورودی سرور — دست‌نخورده', () => {
    const groups = V.groupTypes(PROD_33) as Array<{ id: string; items: TypeLike[] }>;
    const session = groups.find((g) => g.id === 'session') as { items: TypeLike[] };
    expect(session.items.map((t) => t.key)).toEqual(
      ['ce-rehab-adl-v1', 'ce-rehab-cog-v1', 'ce-rehab-motor-v1', 'ce-anamnesis-v3', 'ce-ot-session-v1', 'ce-probe-calc-v1', 'ce-probe-read-v1', 'ce-probe-write-v1', 'ce-wechsler-w4-v1', 'intervention']);
  });
});
