/**
 * گیت فرانت ۱.۲۵.۵۷ — هفت خواستهٔ کارفرما را پین می‌کند:
 *   ① «گزارش به پشتیبانی» با آیکن عنکبوت + نمای ساده‌شده + پاسخ پشتیبانی
 *   ② مرز شیفت عصر از ۱۳:۰۰
 *   ③ توکن بات از کاربر + متن قابل ویرایش «دربارهٔ مرکز» + کشوی کم‌رنگ توضیح
 *   ④ دفتر حضور همکاران فقط با روزهای کاریِ خودش
 *   ⑤ آمادگی تحصیلی از ۳۴ + توضیحات اختیاری سنجش
 *   کلی ① کشو توضیح کم‌رنگ (hint-collapse)  ·  کلی ② پورتال منوی ⋯ به body
 * الگو: front-reports-12556.test.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const JS = join(ROOT, 'public/assets/js');
const read = (p: string) => readFileSync(join(JS, p), 'utf8');

describe('گیت فرانت ۱.۲۵.۵۷ — هفت خواستهٔ کارفرما', () => {
  const app = read('app.js');
  const ui = read('ui.js');
  const bug = read('views/bug-report.js');
  const wh = read('views/working-hours.js');
  const settings = read('views/settings.js');
  const reports = read('views/reports.js');
  const screening = read('views/screening.js');

  test('① سایدبار: عنکبوت + «گزارش به پشتیبانی»؛ نمای ساده با بلوک پاسخ پشتیبانی', () => {
    expect(app).toMatch(/\{ hash: '#\/bug-report', label: 'گزارش به پشتیبانی', icon: 'spider', group: 'مرکز' \}/);
    expect(ui).toMatch(/spider: '<circle cx="12" cy="11" r="3\.2"\/>/);
    expect(bug).toMatch(/'گزارش به پشتیبانی'/);
    /* ساده‌سازی: فیلد readonly صفحه و خط «گزارش‌دهنده» حذف شده‌اند؛ ارسال خودکار می‌ماند */
    expect(bug).not.toMatch(/readonly: true/);
    expect(bug).not.toMatch(/گزارش‌دهنده: \$\{/);
    expect(bug).toMatch(/page: location\.hash \|\| null/);
    expect(bug).toMatch(/app_version: clientVersion\(\)/);
    /* پاسخ پشتیبانی: بلوک + نشان */
    expect(bug).toMatch(/پاسخ پشتیبانی/);
    expect(bug).toMatch(/'پاسخ داده شد'/);
    expect(bug).toMatch(/replyBlock\(rec\)/);
  });

  test('② مرز شیفت عصر از ۱۳:۰۰', () => {
    expect(wh).toMatch(/const SHIFT_BREAK_MINUTE = 13 \* 60;/);
    expect(wh).not.toMatch(/14 \* 60/);
  });

  test('③ توکن بات از کاربر + «دربارهٔ مرکز» قابل ویرایش + کشوی کم‌رنگ توضیح', () => {
    expect(settings).toMatch(/api\.put\('\/api\/settings\/bot-token', \{ token \}\)/);
    expect(settings).toMatch(/api\.put\('\/api\/settings\/bot-token', \{ clear: true \}\)/);
    expect(settings).toMatch(/openBotAboutForm/);
    expect(settings).toMatch(/bot_about: \(values\.bot_about \?\? ''\)\.trim\(\)/);
    /* توکن هرگز نمایش داده نمی‌شود — فقط وضعیت */
    expect(settings).not.toMatch(/baleBotToken/);
    /* کلی ① — توضیح بلند داخل کشو است */
    expect(settings).toMatch(/el\('details', \{ class: 'hint-collapse' \}/);
    expect(reports).not.toMatch(/hint-collapse/);
    expect(settings).toMatch(/'توضیح اعلان‌ها'/);
  });

  test('④ دفتر حضور: فقط روزهای کاری هر همکار (نقشهٔ weekday از /api/working-hours)', () => {
    expect(reports).toMatch(/function buildStaffWorkdaysMap\(workHours\)/);
    expect(reports).toMatch(/api\.get\('\/api\/working-hours'\)/);
    expect(reports).toMatch(/wd\.has\(iranianWeekdayOfYmd\(d\)\)/);
    expect(reports).toMatch(/att-ledger__strip/);
    expect(reports).toMatch(/'روزهای کاری'/);
    /* CSV: روز غیرِکاری خالی + ستون روزهای کاری */
    expect(reports).toMatch(/if \(!dayMark\.has\(d\)\) return '';/);
    expect(reports).toMatch(/\['همکار', 'نقش', 'روزهای کاری',/);
  });

  test('⑤ آمادگی تحصیلی از ۳۴ + توضیحات اختیاری سنجش', () => {
    expect(screening).toMatch(/max: '34'/);
    expect(screening).toMatch(/score > 34/);
    expect(screening).toMatch(/const noteInput = el\('textarea'/);
    expect(screening).toMatch(/maxlength: 500/);
    expect(screening).toMatch(/note: extra\.note/);
  });

  test('کلی ② — منوی ⋯ به document.body پورتال می‌شود و هنگام بستن به خانه برمی‌گردد', () => {
    expect(ui).toMatch(/document\.body\.appendChild\(pop\); \/\/ پورتال/);
    expect(ui).toMatch(/if \(pop\.parentElement !== root\) root\.appendChild\(pop\);/);
    expect(ui).toMatch(/!root\.contains\(e\.target\) && !pop\.contains\(e\.target\)/);
    /* کِلَمپ دوم عمودی برای منوی بلندتر از فضا */
    expect(ui).toMatch(/window\.innerHeight - h - 8/);
  });

  test('CSS پشتیبان ۱.۲۵.۵۷ در components.css است', () => {
    const css = readFileSync(join(ROOT, 'public/assets/css/components.css'), 'utf8');
    expect(css).toMatch(/\.hint-collapse \{/);
    expect(css).toMatch(/\.att-ledger \{/);
    expect(css).toMatch(/\.att-ledger__strip \{/);
  });

  test('مایگریشن‌های 0102/0103 در مخزن‌اند و additive هستند', () => {
    expect(existsSync(join(ROOT, 'migrations/0102_bug_report_replies.sql'))).toBe(true);
    expect(existsSync(join(ROOT, 'migrations/0103_screening_note.sql'))).toBe(true);
    const m102 = readFileSync(join(ROOT, 'migrations/0102_bug_report_replies.sql'), 'utf8');
    const m103 = readFileSync(join(ROOT, 'migrations/0103_screening_note.sql'), 'utf8');
    expect(m102).toMatch(/ADD COLUMN reply_text/);
    expect(m102).toMatch(/ADD COLUMN reply_by/);
    expect(m102).toMatch(/ADD COLUMN reply_at/);
    expect(m103).toMatch(/ALTER TABLE screening_entries ADD COLUMN note TEXT/);
  });
});
