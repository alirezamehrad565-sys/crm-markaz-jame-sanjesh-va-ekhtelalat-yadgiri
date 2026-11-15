/**
 * گیت UI میز بازی‌ها — فاز ۱ بازطراحی رابط کاربری بازی درمانی.
 * قفل ساختار تازه در برابر رگرسیون: سلسله‌مراتب کارت، نوار ابزار بانک، دسته‌بندی حوزهٔ
 * شناختی، جزئیات بازی، خلاصهٔ ارسال و وضعیت خالی آموزندهٔ گزارش؛ هم‌زمان نگه‌داشت
 * واژه‌نامهٔ ۱.۲۵.۲۶ («ارسال به دانش‌آموز») و ممنوعیت بازگشت چیدمان‌های بی‌سلسله‌مراتب.
 * منطق/API هرگز این‌جا قفل نمی‌شود — فقط نمایش.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const gamesView = readFileSync(join(ROOT, 'public/assets/js/views/games.js'), 'utf8');
const gamesConsole = readFileSync(join(ROOT, 'public/assets/js/games-console.js'), 'utf8');
const viewsCss = readFileSync(join(ROOT, 'public/assets/css/views.css'), 'utf8');

describe('گیت UI میز بازی‌ها (فاز ۱ بازطراحی)', () => {
  test('نمای بازی‌ها هر سه تب را با واژه‌نامهٔ ۱.۲۵.۲۶ می‌سازد', () => {
    expect(gamesView).toContain("label: 'بانک بازی‌ها'");
    expect(gamesView).toContain("label: 'ارسال به دانش‌آموز'");
    expect(gamesView).toContain("label: 'گزارش'");
    // واژه‌نامهٔ قدیمی ممنوع — در متن UI (رشته‌ها)، نه کامنت‌ها
    expect(gamesView).not.toContain('تجویز تازه');
    expect(gamesView).not.toContain("'تجویز'");
    expect(gamesConsole).not.toMatch(/label: 'تجویز تازه'/);
  });

  test('کارت بازی سلسله‌مراتب تازه را دارد — نه چیدمان flex درون‌خطی قدیمی', () => {
    expect(gamesView).toContain("class: 'card gmk-card'");
    expect(gamesView).toContain("class: 'gmk-card__title'");
    expect(gamesView).toContain("class: 'gmk-card__facts'");
    expect(gamesView).toContain("class: 'gmk-card__meta'");
    expect(gamesView).toContain("class: 'gmk-card__actions'");
    // چیدمان قدیمی: card-body با style درون‌خطی در کارت بسته — نباید برگردد
    expect(gamesView).not.toContain("el('div', { class: 'card-body', style: 'display:flex");
  });

  test('شناسهٔ بسته هرگز فارسی‌نما نمی‌شود و ایزولهٔ لترال است (رفع سرریز موبایل)', () => {
    // کلاس ایزولهٔ لترال روی شناسه
    expect(gamesView).toContain("class: 'gmk-id'");
    // شناسهٔ خام از fa() عبور نمی‌کند (bug ۱.۲۵.۲۶: attention۲)
    expect(gamesView).not.toMatch(/fa\(pkg\.id\)/);
    expect(gamesConsole).not.toMatch(/fa\(rx\.packageId\)/);
  });

  test('نوار ابزار بانک: جست‌وجو + فیلتر حوزه + فیلتر وضعیت + شمارنده', () => {
    expect(gamesView).toContain("class: 'gmk-toolbar'");
    expect(gamesView).toContain("'aria-label': 'جست‌وجوی بازی'");
    expect(gamesView).toContain("'aria-label': 'فیلتر حوزهٔ شناختی'");
    expect(gamesView).toContain("'aria-label': 'فیلتر وضعیت انتشار'");
    expect(gamesView).toContain("'data-count': ''");
  });

  test('دسته‌بندی حوزهٔ شناختی: نقشهٔ هدف‌ها، ترتیب پایدار، گروه‌بندی واقعی', () => {
    expect(gamesView).toContain('DOMAIN_BY_GOAL');
    expect(gamesView).toContain('DOMAIN_ORDER');
    expect(gamesView).toContain('function groupedDeck');
    // حوزهٔ شناختی از هدف — نه از هیچ فیلد ساختگی
    expect(gamesView).toContain('function domainOf');
    // سطح دشواری توصیف ساختار است نه قضاوت
    expect(gamesView).toContain('function difficultyOf');
    expect(gamesView).toContain('مرحلهٔ پیشرفتی');
  });

  test('مودال جزئیات بازی: مشخصات نسخه + هدف‌ها + مأموریت‌ها + ارسال به دانش‌آموز', () => {
    expect(gamesView).toContain('function openPkgDetails');
    expect(gamesView).toContain('جزئیات بازی');
    expect(gamesView).toContain('هدف‌های درمانی');
    expect(gamesView).toContain('گروه سنی');
    expect(gamesView).toContain('سطح دشواری');
    // ارسال از جزئیات با همان مودال رسمی میز (نه مسیر موازی)
    expect(gamesView).toMatch(/prescribeModal\(\{ childId: null, childName: '', onCreated: onDone \}\)/);
  });

  test('قابلیت‌های پیشین حذف نشده‌اند: پیش‌نمایش/انتشار/بازنشستگی/دیپ‌لینک', () => {
    expect(gamesView).toContain("api.post('/api/games/preview'");
    expect(gamesView).toContain('/publish`');
    expect(gamesView).toContain('/retire`');
    expect(gamesView).toContain("params.get('child')");
    expect(gamesView).toContain("isManager()");
    // مدیریت با rowMenu یکدست — نه دکمه‌های پراکندهٔ قدیمی
    expect(gamesView).toMatch(/rowMenu\(\{ label: 'مدیریت بازی'/);
    expect(gamesView).not.toContain("'بازنشستگی')\n      : null,\n    retired");
  });

  test('میز ارسال: خلاصهٔ سه‌سنجه‌ای + تول‌بار یکدست + پیگیری منظم', () => {
    expect(gamesConsole).toContain("'data-rx-summary': ''");
    expect(gamesConsole).toContain("kpi('ارسال فعال'");
    expect(gamesConsole).toContain("kpi('مأموریت در جریان'");
    expect(gamesConsole).toContain("kpi('نیازمند پیگیری'");
    expect(gamesConsole).toContain("class: 'gmk-toolbar'");
    expect(gamesConsole).toContain("class: 'gmk-followup__row'");
  });

  test('گزارش بدون کودک: وضعیت خالی آموزنده — صفحهٔ خالی ممنوع', () => {
    expect(gamesConsole).toContain("class: 'gmk-guides'");
    expect(gamesConsole).toContain('چه چیزی گزارش می‌شود');
    expect(gamesConsole).toContain('سه سنجهٔ کیفیت جلسه');
    // انتخابگر دانش‌آموز حفظ شده
    expect(gamesConsole).toMatch(/renderGamesReportPanel\(container, \{ childId: s\.id/);
  });

  test('CSS فضانام gmk با رسپانسیو موبایل مستقل و بدون fallback hex', () => {
    expect(viewsCss).toContain('.gmk-deck { display: grid; gap: var(--sp-3); grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); }');
    expect(viewsCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.gmk-deck \{ grid-template-columns: 1fr; \}/);
    expect(viewsCss).toMatch(/\.gmk-toolbar__actions \.btn \{ flex: 1; justify-content: center; \}/);
    // بهداشت: بدون fallback هگز در گمک
    const gmkBlock = viewsCss.slice(viewsCss.indexOf('میز بازی‌ها (gmk)'));
    expect(gmkBlock).not.toMatch(/var\(--[\w-]+,\s*#/);
    // کف فونت: هیچ px زیر ۱۲ در گمک (token-محور)
    expect(gmkBlock).not.toMatch(/font-size:\s*\d+px/);
  });

  test('برچسب‌های عملیاتی میز که قفل هستند دست‌نخورده مانده‌اند', () => {
    expect(gamesConsole).toContain("'مأموریت‌ها و لینک'");
    expect(gamesConsole).toContain('نیازمند پیگیری');
    expect(gamesConsole).toContain("'ارسال به دانش‌آموز'");
    expect(gamesConsole).toContain('این گزارش فقط داده و پرچم کیفیت است');
  });
});
