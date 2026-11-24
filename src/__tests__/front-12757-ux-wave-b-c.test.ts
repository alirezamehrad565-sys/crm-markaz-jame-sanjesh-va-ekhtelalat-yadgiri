/**
 * گیت ۱.۲۷.۵۷ — موج B و C بازطراحی پرونده:
 * B: prefill «ادامه از جلسهٔ قبل» (اجازه‌محور — فقط فیلدهای خالی) + فصل جاری در کارت وضعیت.
 * C: چاپ A4 از snapshot (snapshot-first) + پیش‌نمایش پیش از صدور (بج وضعیت + شمار جلسات).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('موج B — فلوی جلسه', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const ce = read('public/assets/js/case-events.js');

  it('پرونده فقط ارجاع می‌فرستد؛ حل فیلدها در کتابخانهٔ انواع است', () => {
    expect(view).toContain('previousSessionEvent');
    expect(view).toContain('{ eventTypeId: ev.eventTypeId, at: ev.occurredAt ?? ev.createdAt, payload: ev.payload ?? {} }');
    expect(ce).toContain('previousEventRef = null');
    expect(ce).toContain('const t = types.find((x) => x.id === previousEventRef.eventTypeId) ?? null;');
  });

  it('بلوک ادامه از جلسهٔ قبل: پیش‌نمایش + بردن مقادیر فقط به فیلدهای خالی', () => {
    expect(ce).toContain("'بردن مقادیر جلسهٔ قبل به فرم'");
    expect(ce).toContain('ادامه از جلسهٔ قبل — ');
    expect(ce).toContain('if (!input || input.value) continue;');
    expect(ce).toContain('در گزارش قبلی پاسخی ثبت نشده بود.');
  });

  it('فرم مستقیم از خانهٔ جلسات؛ انتخاب‌گر ثانویه با defaultTypeId/pickerTitle در خود فرم (نقد §۶ + ۱.۲۷.۶۹)', () => {
    expect((view.match(/previousEventRef: previousSessionEvent\(/g) ?? []).length).toBe(1);
    expect((view.match(/defaultTypeKey: 'intervention'/g) ?? []).length).toBe(2);
    const form = read('public/assets/js/case-events.js');
    expect(form).toContain('defaultTypeId = null, defaultTypeKey = null');
    expect(form).toContain('pickerTitle = null');
    expect(form).toContain('defaultTypeId'); // مسیر «نوع جلسهٔ قبل» در فرم زنده است
  });

  it('فصل جاری در کارت وضعیت — یک منبع با فصل‌بندی تاریخچه، بعد از رسیدن داده', () => {
    // ۱.۲۷.۵۷ — E2E مرورگری: برچسب فصل باید از تابع سطح closure بیاید (نسخهٔ محلیِ تب، ReferenceError می‌داد)
    expect(view).toContain('فصل جاری: ${chapterLabelOf(timeline.meta.chapters.at(-1))}');
    expect(view).toContain('const chapterLabelOf = (ch) => {');
    expect(view).toContain('auxDone && Array.isArray(timeline?.meta?.chapters) && timeline.meta.chapters.length > 0');
  });

  it('ارجاع جلسهٔ قبل مستقل از ترتیب نوبت‌ها و با فیلد زمان درست (E2E: occurredAt نه at)', () => {
    expect(view).toContain('Date.parse(a.startAt) < Date.parse(cur.startAt)');
    expect(view).toContain('at: ev.occurredAt ?? ev.createdAt');
    expect(view).not.toContain('at: ev.at,');
  });
});

describe('موج C — گزارش قطعی', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const css = read('public/assets/css/views.css');

  it('چاپ A4 از snapshot: snapshot-first، سربرگ سند، پاکسازی پس از چاپ', () => {
    expect(view).toContain("function printSnapshot(rec, variant, contentNode)");
    expect(view).toContain('contentNode.cloneNode(true)');
    expect(view).toContain("'چاپ A4'");
    expect(view).toContain("icon('printer', 14)");
    expect(css).toContain('#print-root');
    expect(css).toContain('body > *:not(#print-root) { display: none !important; }');
  });

  it('پیش‌نمایش پیش از صدور: بج وضعیت با برچسب فارسی هم‌منبع + شمار جلسات مسیر', () => {
    expect(view).toContain('PATH_STATUS_LABEL[p.status] ?? p.status');
    expect(view).toContain('جلسهٔ ثبت‌شده در این مسیر');
    // نشتی کلید خام انگلیسی بسته شد (E2E: statusBadge کلید «suggested» را خام نشان می‌داد)
    expect(view).not.toContain('statusBadge(p.status)');
    expect(view).not.toContain("[p.templateTitle, p.status].filter(Boolean).join(' — ')");
  });
});
