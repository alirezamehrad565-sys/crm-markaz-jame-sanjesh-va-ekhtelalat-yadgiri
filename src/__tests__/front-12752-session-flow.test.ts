/**
 * گیت موج ۲ طرح ارتقای پرونده (۱.۲۷.۵۲) — جریان کار روزمره (طرح‌های D+B+E، PROFILE-UPGRADE-DESIGN §۵):
 * ① جست‌وجوی q سرور-محور در روایت ② «جدیدها» با seen-at محلی ③ صف پیگیری اکشن‌محور (بج سررسیده + ثبت نتیجه)
 * ④ برگهٔ جلسه برای متخصص/منشی/مدیر با صفر fetch تازه + لندینگ نقش‌محور درمانگرِ مسئول.
 * منطق سرور در pure-timeline.test.ts پوشش دارد؛ اینجا قرارداد سیم‌کشی پین می‌شود.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('موج ۲ — سرور', () => {
  const routes = read('src/application/student-timeline/routes.ts');
  const service = read('src/application/student-timeline/service.ts');
  const types = read('src/application/student-timeline/types.ts');

  it('q از route به فیلترها می‌رسد و در TimelineFilters تایپ دارد', () => {
    expect(routes).toContain("q: c.req.query('q') || undefined");
    expect(types).toContain('q?: string');
    expect(types).toContain('dueAt?: string | null');
    expect(types).toContain('open?: boolean');
  });

  it('رویدادهای پیگیری سررسید و باز/بسته می‌گیرند (از FOLLOWUP_OPEN_STATUSES موجود)', () => {
    expect(service).toContain('dueAt: fu.due_at, open');
    expect(service).toContain('(FOLLOWUP_OPEN_STATUSES as readonly string[]).includes(fu.status)');
  });
});

describe('موج ۲ — کلاینت', () => {
  const view = read('public/assets/js/views/student-profile.js');

  it('جست‌وجو با debounce ۳۰۰ms و حداقل ۲ نویسه — بدون endpoint تازه', () => {
    expect(view).toContain("placeholder: 'جست‌وجو در روایت (عنوان، توضیح، ثبت‌کننده)…'");
    expect(view).toContain('state.q = v.length >= 2 ? v : null;');
    expect(view).toContain('if (state.q) query.q = state.q;');
  });

  it('صف پیگیری: ترتیب سررسیدی + بج سررسیده/باز + ثبت نتیجه با PATCH موجود', () => {
    expect(view).toContain('const queueMode = state.filter === \'followups\';');
    expect(view).toContain("'سررسیده‌گذشته'");
    expect(view).toContain("api.patch(`/api/followups/${e.ref?.id}`, { status: 'done' })");
    expect(view).toContain("'ثبت نتیجه'");
  });

  it('برگهٔ جلسه: سه‌سؤالِ قبل از جلسه با صفر fetch تازه و بدون حالت ساختگی', () => {
    expect(view).toContain('function buildSessionSheet()');
    expect(view).toContain('if (!canCreateCaseEvents()) return null;');
    expect(view).toContain('if (!upcoming && missingReports.length === 0 && !openFollowup) return null;');
    expect(view).toContain("'معلقی نیست — گزارش جلسات و پیگیری‌های این پرونده به‌روز است.'");
    expect(view).toContain('ادامه از جلسهٔ قبل — ');
    expect(view).toContain('el(\'div\', { class: \'card__body\' },\n          buildSessionSheet(),');
  });

  it('لندینگ نقش‌محور فقط برای درمانگرِ مسئول با نوبت امروز/فردا و بدون دیپ‌لینک', () => {
    expect(view).toContain('const isProfileOwner = () =>');
    expect(view).toContain('if (!requestedTab && !pendingTab && isProfileOwner()');
    expect(view).toContain('2 * 86_400_000');
  });

  it('جدیدها با seen-at محلی و بدون جدول/endpoint', () => {
    expect(view).toContain("const seenKey = `cs.profile.seen.${id}`;");
    expect(view).toContain('const isNewEvent = (e) => Boolean(seenAt && e.at > seenAt);');
    expect(view).toContain("'جدید'");
  });
});
