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

  it('۲) ریل: پیگیری‌ها خانهٔ ۳ است و اطلاعات پایه از ریل حذف شده', () => {
    const sections = view.slice(view.indexOf('function refSections()'), view.indexOf('function syncSectionUrl'));
    const keys = [...sections.matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]);
    expect(keys).toEqual(['timeline', 'clinical', 'followups', 'narrative', 'snapshot', 'sessions', 'exercises', 'games', 'comms']);
  });

  it('۳) کارت پیگیری تک‌منبع: ایستگاه follow و بخش کشو هر دو از buildFollowupsCard می‌خوانند', () => {
    expect(view).toContain('function buildFollowupsCard()');
    expect(view).toContain('return buildFollowupsCard();');
    expect(view).toContain('function renderFollowupsSection(box)');
    expect(view).toContain('followups: renderFollowupsSection,');
    expect(view).not.toContain('buildNextApptCard'); // کارت مردهٔ پوستهٔ کلاسیک حذف شد
  });

  it('۴) پنل فشرده/کامل: mount همان renderInfoTab + Esc + سوییچ در نوار هویت', () => {
    expect(view).toContain("dispatchTab('info', infoDetailMount)");
    expect(view).toContain("const infoEsc = (e) => { if (e.key === 'Escape' && infoDetailOpen) toggleInfoDetail(false); };");
    expect(view).toContain("class: 'btn btn--soft btn--sm idbar__detail-btn'");
    expect(view).toContain("'اطلاعات کامل'");
    expect(view).toMatch(/if \(infoDetailMounted && keys\.includes\('info'\)\) dispatchTab\('info', infoDetailMount\);/);
  });

  it('۵) موبایل: منوی تمام‌عرض + sticky تک‌ردیفه + مسئول فقط در حالت کامل', () => {
    const base = read('public/assets/css/base.css');
    expect(css).toMatch(/\.dd__panel \{\s*position: fixed;\s*inset-inline: 12px;/);
    expect(css).toMatch(/\.hub__sticky \{ flex-wrap: nowrap; overflow-x: auto; \}/);
    expect(css).toMatch(/\.idbar__owner \{ display: none; \}/);
    expect(css).toMatch(/\.idbar--detailed \.idbar__owner \{ display: flex; flex-wrap: wrap; \}/);
    expect(css).toMatch(/\.infopanel \{/);
    /* سرریز افقی سند از کشوی بیرون‌صفحه — clip روی body (روی html کنار overflow-y:scroll به auto تبدیل می‌شد) */
    expect(base).toMatch(/body \{\s*overflow-x: clip;\s*\}/);
  });

  it('۶) پالت: پیگیری‌ها و اطلاعات پایهٔ نوار بالا', () => {
    expect(gsearch).toContain("title: 'پیگیری‌ها'");
    expect(gsearch).toContain("title: 'اطلاعات پایه — نوار بالا'");
  });
});

describe('۱.۲۷.۶۷ (sdt145) — ردیف فشردهٔ «همه‌چیز» نوار بالا + بلور یکدست', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const css = read('public/assets/css/views.css');
  const comp = read('public/assets/css/components.css');
  const base = read('public/assets/css/base.css');

  it('۷) نوار فشرده همهٔ داده‌ها را یک‌جا دارد — تماس ولی/معلم کلیک‌پذیر، ولی، نسبت، معلم، مدرسه/کلاس، تولد، کد ملی، ثبت', () => {
    expect(view).toContain("class: 'idbar__facts'");
    expect(view).toContain('callBadge(student.guardianPhone');
    expect(view).toContain('callBadge(student.teacherPhone');
    expect(view).toContain('icon(\'school\', 12)');
    expect(view).toContain('relationLabel(student.guardianRelation)');
    expect(css).toMatch(/\.idbar__facts \{/);
    /* در حالت کامل، پنل زیر نوار همان فیلدها را می‌دهد — ردیف فشرده تکرار نمی‌شود */
    expect(css).toMatch(/\.idbar--detailed \.idbar__facts \{ display: none; \}/);
  });

  it('۸) بلور پس‌زمینه یکدست و حرفه‌ای: کشو، مودال و سایدبار همه ۱۲px + اشباع ۱٫۲۵', () => {
    expect(css).toMatch(/\.refdrawer__backdrop \{[\s\S]*?backdrop-filter: blur\(12px\) saturate\(1\.25\);/);
    expect(comp).toMatch(/\.modal-overlay \{[\s\S]*?backdrop-filter: blur\(12px\) saturate\(1\.25\);/);
    expect(base).toMatch(/\.sidebar-backdrop \{[\s\S]*?backdrop-filter: blur\(12px\) saturate\(1\.25\);/);
    expect(css).not.toMatch(/rgb\(0 0 0 \/ \.38\)/); // پردهٔ میراثی جایش را توکن تم داد
  });
});
