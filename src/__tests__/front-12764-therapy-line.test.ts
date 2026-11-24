/**
 * گیت موج ۳ (۱.۲۷.۶۴) — «گزارش از دل گام» + نقد فلوی موج ۲.
 * منبع: docs/PROFILE-REDESIGN-PROGRAM.md §۵ (موج ۳) + سند نقد اسکرین‌شات‌های ۱۴۰۵/۰۹/۰۲.
 * قراردادها:
 *  ① گام‌های خط درمان از تابع خالص therapy-line.js — clinical-insights همان دادهٔ خودش را می‌دهد
 *    (onTherapyLine)؛ چیپ‌های هاب و کارت‌های گام تک‌منبع‌اند و صفر fetch تازه دارند.
 *  ② پروندهٔ بدون هیچ نوبتی دیگر بج «به‌روز ✓» نمی‌گیرد — حالت تهی خنثی است (خطِ سبزِ دروغین ممنوع).
 *  ③ خط سرصفهٔ برگزاری/ثبت گزارش از stationBadge می‌آید — سرصفه و پنل ایستگاه دو حرف نمی‌زنند.
 *  ④ ریل لبه: بخش باز «is-active» دارد؛ کلیک «تفسیر و طرح درمان» به هاب اسکرول و فلش می‌کند.
 *  ⑤ کشوی دیپ‌لینک فوری باز می‌شود، نه بعد از رسیدن دادهٔ موازی.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — ماژول خالص پوسته (بدون وابستگی) مستقیم وارد می‌شود
import { therapyLineOf } from '../../public/assets/js/profile/therapy-line.js';
// @ts-expect-error — ماژول خالص پوسته
import { stationBadge } from '../../public/assets/js/profile/station-state.js';

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

describe('stationBadge — نقد «بج سبزِ دروغین» (۱.۲۷.۶۴)', () => {
  it('۵) پروندهٔ بدون هیچ نوبتی → خنثی، نه ✓ به‌روز', () => {
    expect(stationBadge('hold', { appointments: [], nowMs: 0 })).toEqual({ n: null, tone: 'neutral', line: 'نوبتی ثبت نشده — از «تقویم نوبت‌ها» نوبت بسازید' });
    expect(stationBadge('log', { appointments: [], nowMs: 0 })).toEqual({ n: null, tone: 'neutral', line: 'نوبتی ثبت نشده — گزارشی در کار نیست' });
  });
});

describe('ساختار موج ۳ — پوسته (بررسی منبع)', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const clx = read('public/assets/js/clinical-insights.js');
  const gsearch = read('public/assets/js/global-search.js');
  const css = read('public/assets/css/views.css');

  it('۶) onTherapyLine: رندرر بالینی گام‌ها را به sticky هاب می‌دهد؛ sticky با چیپ‌های گام جان می‌گیرد', () => {
    expect(clx).toContain("import { therapyLineOf } from './profile/therapy-line.js';");
    expect(clx).toMatch(/onTherapyLine\(therapyLineOf\(\{[\s\S]*?probeTypeKeys: PROBE_AREAS\.map/);
    expect(view).toMatch(/onTherapyLine: \(steps\) => \{/);
    expect(view).toMatch(/chips\.push\(el\('span', \{ class: 'hub__stitle' \}, 'گام‌های درمان:'\)/);
    expect(view).toMatch(/chip--\$\{tone\}/);
  });

  it('۷) خط سرصفهٔ hold/log از stationBadge می‌آید (تک‌منبع) و حالت تهی بج سبز نمی‌گیرد', () => {
    expect(view).toMatch(/return stationBadge\('hold', \{ appointments, reportedApptIds: reportedApptIds\(\), openFollowups, nowMs: Date\.now\(\) \}\)\.line;/);
    expect(view).toMatch(/st && st\.tone !== 'neutral' \? el\('span', \{ class: 'stbadge stbadge--ok'/);
  });

  it('۸) تب‌ها: is-active نمای فعال + اسکرول/فلش کارت فعال برای «تفسیر و طرح درمان» (۱.۲۷.۶۸)', () => {
    expect(view).toMatch(/ptabs\.querySelectorAll\('\.ptab'\)\.forEach\(\(b\) => \{/);
    expect(view).toMatch(/if \(key === 'clinical'\) \{\s*\n\s*tabMount\.scrollIntoView\(/);
    expect(css).toMatch(/\.hub-flash \{ animation: hub-flash 1\.2s ease; \}/);
    expect(css).toMatch(/\.chip--ok \{ background: var\(--success-soft\)/);
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
