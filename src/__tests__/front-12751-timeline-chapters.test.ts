/**
 * گیت موج ۱ طرح ارتقای پرونده (۱.۲۷.۵۱) — «فصل‌های پرونده» (طرح D، PROFILE-UPGRADE-DESIGN §۵):
 * ① سرور: periodizeTimeline خالص + مرزها/milestone در سرویس + chapters در پاسخ route
 * ② کلاینت: ریل فصل‌ها + سرصفهٔ آمار-و-نقل + ستارهٔ لحظهٔ کلیدی — بدون endpoint تازه و بدون CSS بحرانی تازه
 * منطق فصل‌بندی خودش در pure-timeline.test.ts پوشش دارد؛ اینجا فقط قرارداد سیم‌کشی پین می‌شود.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('قرارداد فصل‌های روایت — سرور', () => {
  const pure = read('src/application/student-timeline/pure.ts');
  const service = read('src/application/student-timeline/service.ts');
  const routes = read('src/application/student-timeline/routes.ts');
  const types = read('src/application/student-timeline/types.ts');

  it('periodizeTimeline خالص با قاعدهٔ شکاف ۲۱ روزه و برچسب فارسی فازها', () => {
    expect(pure).toContain('export function periodizeTimeline');
    expect(pure).toContain('export const TREATMENT_GAP_DAYS = 21');
    expect(pure).toContain("scattered: 'ثبت‌های پراکنده'");
  });

  it('مرزها از رویدادهای واقعی می‌آیند: پذیرش=assessment، مسیر=plan/review، تصمیم کمیسیون/وضعیت=review', () => {
    expect(service).toContain("boundary: 'screening'");
    expect(service).toContain("boundary: 'assessment', milestone: true");
    expect(service).toContain("boundary: 'plan'");
    expect(service).toContain("boundary: 'review'");
  });

  it('وکسلر از engine_output به milestone روایت می‌آید', () => {
    expect(service).toContain("pp?.['engine_output']");
    expect(service).toContain('نیم‌رخ وکسلر — FSIQ');
  });

  it('chapters در TimelineResult اختیاری است و route فقط پاس‌ترو می‌کند', () => {
    expect(types).toContain('chapters?: TimelineChapter[]');
    expect(routes).toContain('chapters: result.chapters');
    // تعهد موج ۱: هیچ SQL تازه‌ای اضافه نشده — شمارش db.query همان پایهٔ قبل از موج است (۱۲)
    expect((service.match(/db\.query</g) ?? []).length).toBe(12);
  });
});

describe('قرارداد فصل‌های روایت — کلاینت', () => {
  const view = read('public/assets/js/views/student-profile.js');

  it('ریل فصل‌ها با نمای بازهٔ from/to (پارامتر موجود سرور)', () => {
    expect(view).toContain('function paintRail()');
    expect(view).toContain("'همهٔ دوره‌ها'");
    expect(view).toContain('query.from = state.range.from');
  });

  it('سرصفهٔ آمار-و-نقل هر فصل در جریان رویدادها (هم در append)', () => {
    expect(view).toContain('function chapterHeader(');
    expect(view).toContain('state.lastChapterId');
    expect(view).toContain("el('div', { class: 'card__body' }, rail, searchInput, chips, list, moreBtn)"); // موج ۲: جست‌وجو هم نشست
  });

  it('ستارهٔ لحظهٔ کلیدی روی رویدادهای milestone', () => {
    expect(view).toContain("e.milestone ? el('span', { title: e.milestoneLabel ?? 'لحظهٔ کلیدی روایت پرونده'");
  });

  it('بدون import تازه در app.js — گراف بوت دست‌نخورده', () => {
    expect(read('public/assets/js/app.js')).not.toContain('chapter');
  });
});
