/**
 * گیت ۱.۲۷.۶۶ (sdt144) — درخواست کارفرما بعد از موج ۴:
 * ① «پیگیری» که فقط در ایستگاه پیگیری/ارتباطات زندگی می‌کرد، خانهٔ ۳ ریل شد (تو ۴ تای بالا)
 *    و کارت پیگیری تک‌منبع شد — ایستگاه follow و بخش کشو هر دو از buildFollowupsCard می‌خوانند.
 * ② «تب اطلاعات اولیه» با نوار بالای صفحه ادغام شد: ریل دکمهٔ info ندارد؛ سوییچ
 *    «اطلاعات کامل» زیر نوار هویت همان رندرر تب اطلاعات را mount تنبل می‌کند (Esc می‌بندد).
 * ③ موبایل: منوهای بازشو تمام‌عرضِ مهارشده (دیگر از لبه بریده نمی‌شوند)، چیپ‌های sticky هاب
 *    تک‌ردیفهٔ اسکرول‌شونده، و ویرایشگر مسئول/وضعیت فقط در حالت کامل دیده می‌شود.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — تابع خالص فرود پوسته (بدون وابستگی) مستقیم وارد می‌شود
import { resolveWorkshopLanding } from '../../public/assets/js/profile/landing.js';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('landing — خانهٔ تازهٔ پیگیری‌ها و اطلاعات پایه (۱.۲۷.۶۶)', () => {
  const clinical = { canSeeClinical: true, canSeeGames: true };
  it('۱) ?section=followups → کشوی پیگیری‌ها؛ ?section=info → پنل نوار بالا (فرود بی‌پارامتر دست‌نخورده)', () => {
    expect(resolveWorkshopLanding({ ...clinical, query: { section: 'followups' } })).toMatchObject({ drawer: 'followups' });
    expect(resolveWorkshopLanding({ ...clinical, query: { section: 'info' } })).toMatchObject({ drawer: 'info' });
    expect(resolveWorkshopLanding({ ...clinical, query: {} })).toMatchObject({ drawer: null });
    expect(resolveWorkshopLanding({ ...clinical, query: { tab: 'followups' } })).toMatchObject({ drawer: 'timeline' }); // قرارداد قدیمی
  });
});

describe('ساختار sdt144 — بررسی منبع', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const css = read('public/assets/css/views.css');
  const gsearch = read('public/assets/js/global-search.js');

  it('۲) تب‌های کلاسیک به‌ترتیب RTL — برچسب کوتاه (۱.۲۷.۷۱)', () => {
    const items = view.slice(view.indexOf('function tabItems()'), view.indexOf('let tabBar = tabs('));
    const keys = [...items.matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]);
    expect(keys).toEqual(['info', 'clinical', 'narrative', 'timeline', 'sessions', 'exercises', 'games', 'comms']);
  });

  it('۳) پیگیری‌ها در قرارداد کلاسیک: صف اکشن‌محور تاریخچه + بلوک اقدام بعدی (۱.۲۷.۷۱)', () => {
    expect(view).toContain("const queueMode = state.filter === 'followups';");
    expect(view).toContain('function buildNextActionBlock(nextAction)');
    expect(view).not.toContain('buildFollowupsCard');
  });

  it('۴) ویرایشگر مسئول/وضعیت در قرارداد کلاسیک داخل کارت وضعیت است (۱.۲۷.۷۱)', () => {
    expect(view).toContain('function buildOwnerEditor(student, onSaved)');
    expect(view).toContain('canManageCase ? buildOwnerEditor(student, onOwnerSaved) : null');
    expect(view).not.toContain('idbar__detail-btn');
    expect(view).not.toContain('toggleInfoDetail');
    expect(view).not.toContain('tabowner');
  });

  it('۵) موبایل: منوی تمام‌عرض + sticky تک‌ردیفه + مسئول فقط در حالت کامل', () => {
    const base = read('public/assets/css/base.css');
    expect(css).toMatch(/\.dd__panel \{\s*position: fixed;\s*inset-inline: 12px;/);
    /* ۱.۲۷.۶۹ — نوار تب کلاسیک ui.tabs (تک‌ردیفهٔ اسکرول با markScrollable) */
    expect(css).toMatch(/\.tabs \{/);
    /* سرریز افقی سند از کشوی بیرون‌صفحه — clip روی body (روی html کنار overflow-y:scroll به auto تبدیل می‌شد) */
    expect(base).toMatch(/body \{\s*overflow-x: clip;\s*\}/);
  });

  it('۶) پالت ⌘K: بخش‌های پرونده با دیپ‌لینک کلاسیک ?tab= (۱.۲۷.۷۱)', () => {
    expect(gsearch).toContain("title: 'پیگیری‌ها'");
    expect(gsearch).toContain("title: 'اطلاعات پایه'");
    expect(gsearch).toContain('?tab=timeline&filter=followups');
  });
});

describe('۱.۲۷.۶۷ (sdt145) — ردیف فشردهٔ «همه‌چیز» نوار بالا + بلور یکدست', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const css = read('public/assets/css/views.css');
  const comp = read('public/assets/css/components.css');
  const base = read('public/assets/css/base.css');

  it('۷) داده‌های هویتی در قرارداد کلاسیک: تماس ولی/معلم کلیک‌پذیر در کارت اطلاعات پایه (۱.۲۷.۷۱)', () => {
    expect(view).toContain('callBadge(student.guardianPhone');
    expect(view).toContain('callBadge(student.teacherPhone');
    expect(view).toContain('relationLabel(student.guardianRelation)');
    expect(css).not.toMatch(/\.idbar__facts \{/); // نوار هویت ۱.۲۷.۶۷ با پوستهٔ کلاسیک کنار رفت
  });

  it('۸) بلور پس‌زمینه یکدست و حرفه‌ای: مودال و سایدبار ۱۲px + اشباع ۱٫۲۵ — کشو کلاً حذف شد', () => {
    expect(css).not.toMatch(/\.refdrawer/);
    expect(comp).toMatch(/\.modal-overlay \{[\s\S]*?backdrop-filter: blur\(12px\) saturate\(1\.25\);/);
    expect(base).toMatch(/\.sidebar-backdrop \{[\s\S]*?backdrop-filter: blur\(12px\) saturate\(1\.25\);/);
    expect(css).not.toMatch(/rgb\(0 0 0 \/ \.38\)/); // پردهٔ میراثی جایش را توکن تم داد
  });
});
