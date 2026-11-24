/**
 * گیت ۱.۲۷.۶۹ — حذف ماژول فلوی ایستگاه‌ها (sdt147 — خواست کارفرما: «ماژول پیگیری آماده‌سازی برگزاری رو نمی‌خوام»).
 * قراردادها:
 *  ① ماژول خالص station-state.js با کل UI ایستگاهی (نوار فلو، بج‌های شمارشی، نوار کار، هاب) حذف شد — کد مرده نمی‌ماند.
 *  ② هیچ فایلی دیگر آن را ایمپورت نمی‌کند.
 *  ③ قابلیت واقعی همان‌جا که بود می‌ماند: پیگیری‌ها (تب مستقل) و بایگانی جلسات/حضور (تب مستقل).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('حذف ماژول فلوی آماده‌سازی/برگزاری — ۱.۲۷.۶۹', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const css = read('public/assets/css/views.css');

  it('① ماژول station-state و قاعدهٔ وضعیت میز (desk-state) از درخت کد کنار رفتند', () => {
    expect(existsSync(join(ROOT, 'public/assets/js/profile/station-state.js'))).toBe(false);
    expect(existsSync(join(ROOT, 'public/assets/js/profile/desk-state.js'))).toBe(false);
  });

  it('② هیچ فایل جاوااسکریپتی دیگر stationBadge/computeDeskState را ایمپورت نمی‌کند', () => {
    for (const f of ['views/student-profile.js', 'views/appointments.js', 'views/dashboard.js',
      'profile/landing.js', 'profile/therapy-line.js', 'profile/registry.js']) {
      const src = read(`public/assets/js/${f}`);
      expect(src).not.toContain("from '../profile/station-state.js'");
      expect(src).not.toContain("from './profile/station-state.js'");
      expect(src).not.toContain("from '../profile/desk-state.js'");
      expect(src).not.toContain("from './profile/desk-state.js'");
    }
  });

  it('③ پروفایل هیچ UI ایستگاهی ندارد؛ قابلیت‌های واقعی تب مستقل‌شان می‌ماند', () => {
    for (const sym of ['stationBadge', 'STATION_LABEL', 'STATION_ORDER', 'stbadge'])
      expect(view).not.toContain(sym);
    expect(view).toContain('sessions: renderSessionsTab'); // بایگانی جلسات = تب مستقل
    /* ۱.۲۷.۷۱ — قرارداد کلاسیک ۱.۲۷.۵۷: پیگیری‌ها = فیلتر اکشن‌محور تاریخچه (صف باز + ثبت نتیجه) */
    expect(view).toContain("const queueMode = state.filter === 'followups';");
    expect(view).toContain('function buildNextActionBlock(nextAction)');
    expect(view).not.toContain('buildFollowupsCard');
    for (const sym of ['.stbadge', '.workbar', '.flowstep'])
      expect(css).not.toContain(sym);
  });
});
