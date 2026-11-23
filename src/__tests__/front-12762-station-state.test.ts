/**
 * گیت موج ۱ (۱.۲۷.۶۲) — «کارگاه درمان»: نوار ابزار ایستگاه تک‌خطی + نوار کار تاشو.
 * منبع: docs/PROFILE-REDESIGN-PROGRAM.md (موج ۱).
 * قراردادها:
 *  ① بج شمارشی هر ایستگاه از تابع خالص stationBadge می‌آید — نوار ابزار و پنل ایستگاه دو حرف نمی‌زنند.
 *  ② ایستگاه «آماده‌سازی» بج شمارشی ندارد (خط مانده‌اش از نما می‌آید) — شمارشِ بی‌معنا نمی‌گیرد.
 *  ③ نوار کار تاشو: پیش‌فرض باز؛ بستن = فقط نوار ابزار (کروم حداقلی، گیت ≤۱۶۰px).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — ماژول خالص پوسته (بدون وابستگی) مستقیم وارد می‌شود
import { stationBadge } from '../../public/assets/js/profile/station-state.js';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const NOW = Date.parse('2026-11-23T10:00:00Z');
const appt = (startAt: string, myAttendance = 'pending', appointmentId = `a-${startAt}`) => ({
  appointmentId,
  status: 'scheduled',
  startAt,
  myAttendance
});

describe('stationBadge — بج شمارشی نوار ابزار (موج ۱)', () => {
  it('۱) برگزاری: شمار حضورهای ثبت‌نشدهٔ گذشته؛ آینده و غیبت شمرده نمی‌شوند', () => {
    const out = stationBadge('hold', {
      appointments: [appt('2026-11-20T09:00:00Z', 'pending', 'p1'), appt('2026-11-19T09:00:00Z', 'pending', 'p2'), appt('2026-11-18T09:00:00Z', 'absent', 'ab'), appt('2026-11-24T09:00:00Z', 'pending', 'fut')],
      nowMs: NOW
    });
    expect(out).toEqual({ n: 2, tone: 'warning', line: '2 حضور ثبت‌نشده' });
  });

  it('۲) برگزاری تمیز → موفق با صفر', () => {
    const out = stationBadge('hold', { appointments: [appt('2026-11-20T09:00:00Z', 'present', 'r1')], nowMs: NOW });
    expect(out).toEqual({ n: 0, tone: 'success', line: 'حضور جلسات به‌روز است' });
  });

  it('۳) ثبت گزارش: فقط حاضر/تأخیرِ بی‌گزارش؛ غیبت و گزارش‌دار حذف می‌شوند', () => {
    const out = stationBadge('log', {
      appointments: [appt('2026-11-18T09:00:00Z', 'present', 'm1'), appt('2026-11-15T09:00:00Z', 'late', 'm2'), appt('2026-11-10T09:00:00Z', 'absent', 'ab'), appt('2026-11-05T09:00:00Z', 'present', 'ok')],
      reportedApptIds: ['ok'],
      nowMs: NOW
    });
    expect(out).toEqual({ n: 2, tone: 'error', line: '2 جلسهٔ بی‌گزارش' });
  });

  it('۴) پیگیری: عقب‌افتاده اولویت دارد و فقط شمار عقب‌افتاده‌ها را می‌گوید', () => {
    const out = stationBadge('follow', {
      openFollowups: [{ dueAt: '2026-11-01T00:00:00Z' }, { dueAt: '2026-11-02T00:00:00Z' }, { dueAt: '2026-12-01T00:00:00Z' }, { dueAt: null }],
      nowMs: NOW
    });
    expect(out).toEqual({ n: 2, tone: 'error', line: '2 پیگیری عقب‌افتاده' });
  });

  it('۵) پیگیری باز بدون عقب‌افتاده → هشدار؛ بدون پیگیری → موفق صفر', () => {
    expect(stationBadge('follow', { openFollowups: [{ dueAt: '2026-12-01T00:00:00Z' }], nowMs: NOW })).toMatchObject({ n: 1, tone: 'warning' });
    expect(stationBadge('follow', { openFollowups: [], nowMs: NOW })).toMatchObject({ n: 0, tone: 'success' });
  });

  it('۶) آماده‌سازی بج شمارشی ندارد (شمارش بی‌معنا نمی‌گیرد)', () => {
    expect(stationBadge('ready', { appointments: [], nowMs: NOW })).toBeNull();
  });
});

describe('ساختار موج ۱ — نوار ابزار + نوار کار در پوسته (بررسی منبع، الگوی گیت ۱۲۷۵۸)', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const css = read('public/assets/css/views.css');

  it('نوار ابزار: بج از stationBadge، tooltip خط مانده، بدون متن دومرحله‌ای در DOM', () => {
    expect(view).toContain("import { stationBadge } from '../profile/station-state.js'");
    expect(view).toMatch(/stbadge stbadge--\$\{st\.tone\}/);
    expect(view).toMatch(/title: `\$\{STATION_LABEL\[key\]\} — \$\{stationRemLine\(key\)\}`/);
    expect(view).not.toMatch(/flowstep__rem/); // خط مانده دیگر در DOM نیست — فقط tooltip
  });

  it('نوار کار تاشو: پیش‌فرض باز، toggling با aria-expanded، renderDesk از آن عبور می‌کند', () => {
    /* ۱.۲۷.۶۳ — موج ۲: در کارگاه نوار کار پیش‌فرض جمع است (تفسیر بالینی قهرمان فولد اول)؛ پوستهٔ کلاسیک باز */
    expect(view).toContain('let workbarCollapsed = isWorkshop;');
    expect(view).toMatch(/function buildWorkbar\(key\)/);
    expect(view).toMatch(/'aria-expanded': String\(!workbarCollapsed\)/);
    expect(view).toMatch(/deskMain\.replaceChildren\(buildWorkbar\(activeStation\)\)/);
  });

  it('CSS: استایل stbadge/workbar با توکن‌های تم (روشن/تیره) ثبت شده است', () => {
    expect(css).toMatch(/\.stbadge--error \{ background: var\(--error-soft\); color: var\(--on-error-soft\); \}/);
    expect(css).toMatch(/\.workbar__body \{ border-top: 1px dashed var\(--border\)/);
    expect(css).toMatch(/۱\.۲۷\.۶۲ — موج ۱ «کارگاه درمان»/);
  });
});
