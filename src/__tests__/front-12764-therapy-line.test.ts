/**
 * گیت ۱.۲۷.۶۴/۶۹ — «گزارش از دل گام» (موج ۳) در پوستهٔ تازهٔ میز پرونده.
 * قراردادها:
 *  ① گام‌های خط درمان از تابع خالص therapy-line.js — clinical-insights همان دادهٔ خودش را می‌دهد؛
 *    در پوستهٔ ۱.۲۷.۶۹ گام‌ها داخل کارت بالینی زندگی می‌کنند (بدون هاب sticky و بدون onTherapyLine بی‌مصرف).
 *  ② فلوی ایستگاه‌ها حذف شده — ماژول station-state و بج‌های شمارشی سرصفه کنار رفتند (گیت ۱۲۷۶۲).
 *  ③ تب کلاسیک ui.tabs: setActive با openRef همگام است؛ بدون فلش/اسکرول اجباری بالینی.
 *  ④ دیپ‌لینک ?tab=/?section= فوری باز می‌شود، نه بعد از رسیدن دادهٔ موازی.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — ماژول خالص پوسته (بدون وابستگی) مستقیم وارد می‌شود
import { therapyLineOf } from '../../public/assets/js/profile/therapy-line.js';
const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const typesById = new Map([
  ['anamnesis-v1', { id: 't1', category: 'intervention' }],
  ['ce-probe-read-v1', { id: 't2' }],
  ['ce-probe-writing-v1', { id: 't3' }],
  ['check-family-v1', { id: 't4', category: 'checklist', audience: 'family' }]
]);

describe('therapyLineOf — خط درمان از دل گام (موج ۳)', () => {
  it('۱) شرح‌حال ثبت‌شده + دو از سه پروب + یک چک‌لیست — شمارش‌ها دقیق است', () => {
    const out = therapyLineOf({
      events: [
        { eventTypeId: 't1', status: 'done' },
        { eventTypeId: 't2', status: 'done' },
        { eventTypeId: 't3', status: 'done' },
        { eventTypeId: 't4', status: 'done' },
        { eventTypeId: 't9', status: 'done' } // نوع ناشناس — شمرده نمی‌شود
      ],
      typesById,
      anamnesisTypeId: 't1',
      paths: [{ sessions: [{ status: 'done' }, { status: 'planned' }] }],
      checklistKeys: ['check-family-v1', 'check-teacher-v1'],
      probeTypeKeys: ['ce-probe-read-v1', 'ce-probe-writing-v1', 'ce-probe-math-v1']
    });
    expect(out[0]).toMatchObject({ key: 'anamnesis', done: true, doneCount: 1, total: 1 });
    expect(out[1]).toMatchObject({ key: 'probes', done: false, doneCount: 2, total: 3 });
    expect(out[2]).toMatchObject({ key: 'checklists', done: false, doneCount: 1, total: 2 });
    expect(out[3]).toMatchObject({ key: 'paths', done: false, doneCount: 1, total: 2 });
  });

  it('۲) رویداد لغوشده گام را پر نمی‌کند', () => {
    const out = therapyLineOf({
      events: [{ eventTypeId: 't1', status: 'cancelled' }],
      typesById,
      anamnesisTypeId: 't1',
      probeTypeKeys: ['ce-probe-read-v1']
    });
    expect(out[0]).toMatchObject({ done: false, doneCount: 0 });
  });

  it('۳) همهٔ گام‌ها تمام → done=true (چیپ سبز)', () => {
    const out = therapyLineOf({
      events: [{ eventTypeId: 't1', status: 'done' }, { eventTypeId: 't2', status: 'done' }],
      typesById,
      anamnesisTypeId: 't1',
      probeTypeKeys: ['ce-probe-read-v1'],
      checklistKeys: []
    });
    expect(out[0]).toMatchObject({ done: true });
    expect(out[1]).toMatchObject({ done: true, doneCount: 1, total: 1 });
    expect(out[2]).toMatchObject({ done: false, doneCount: 0, total: 0 }); // چک‌لیستی تعریف نشده — صفر صادقانه
  });

  it('۴) خالی مطلق — هیچ گامی ادعای انجام ندارد', () => {
    const out = therapyLineOf({});
    expect(out.every((s: { done: boolean; doneCount: number }) => s.done === false && s.doneCount === 0)).toBe(true);
  });
});

describe('ساختار ۱.۲۷.۶۴/۶۹ — پوستهٔ میز پرونده (بررسی منبع)', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const clx = read('public/assets/js/clinical-insights.js');
  const gsearch = read('public/assets/js/global-search.js');
  const css = read('public/assets/css/views.css');

  it('۶) گام‌ها تک‌منبع از therapyLineOf در clinical-insights؛ پروفایل دیگر callback بی‌مصرف نمی‌گذرد', () => {
    expect(clx).toContain("import { therapyLineOf } from './profile/therapy-line.js';");
    expect(clx).toMatch(/onTherapyLine\(therapyLineOf\(\{[\s\S]*?probeTypeKeys: PROBE_AREAS\.map/);
    expect(view).toContain('renderClinicalTab(box, { student });'); // پوستهٔ ۱.۲۷.۶۹: بدون هاب
    expect(view).not.toContain('onTherapyLine');
    for (const sym of ['hub__stitle', 'chip--', 'buildHubSticky'])
      expect(view).not.toContain(sym);
  });

  it('۷) ماژول ایستگاه حذف شده — هیچ خط سرصفه/بج شمارشی باقی نیست', () => {
    expect(view).not.toContain('stationBadge');
    expect(css).not.toMatch(/\.stbadge|\.workbar|\.hub-flash|\.chip--ok/);
  });

  it('۸) تب کلاسیک: setActive همگام با openRef — بدون فلش/اسکرول اجباری بالینی', () => {
    expect(view).toContain('tabBar.setActive(key);');
    expect(view).not.toContain("key === 'clinical') {");
    expect(css).not.toContain('.hub-flash');
  });

  it('۹) کشوی دیپ‌لینک فوری باز می‌شود (بدون انتظار دادهٔ موازی)', () => {
    expect(view).toMatch(/openRef\(landing\.drawer\s*\?\? \(\(ctx\.query\?\.tab \?\? ctx\.query\?\.section\) === 'clinical'/);
  });

  it('۱۰) پالت ⌘K: بخش‌های پروندهٔ باز بالای نتایج سراسری', () => {
    expect(gsearch).toMatch(/function localProfileSections\(\)/);
    expect(gsearch).toMatch(/'همین پرونده'/);
    expect(gsearch).toMatch(/if \(item\.hash\) \{/);
  });
});
