/**
 * گیت فرانت ۱.۲۵.۷۱ — قطع دو ماژول تشخیصی از UI به درخواست کارفرما:
 *   «کدهای دو ماژول پنل سلامت و خطای مرورگر حذف نشن، فقط از UI و سایدبار قطع بشن تا نمایش داده نشه»
 *
 * قرارداد این گیت (هم‌الگوی قطع ۱۲۵۵۶ برای «کتابخانهٔ شبکه»):
 *   ① سایدبار و روتر: هیچ ثبت فعالِ NAV/روت برای #/health و #/client-errors نباشد — هش مستقیم ۴۰۴ می‌دهد.
 *   ② کد حذف نشده باشد: سورس دو نما، ماژول سرور health/client-errors، و سیم‌کشی api-routing سرِ جای خود باشند
 *      تا بازگشت با برگرداندن دو خط NAV و دو register از کامیت ۱.۲۵.۷۰ ممکن باشد.
 *   ③ لولهٔ داده زنده باشد: گزارشگر خطای مرورگر روی /public/client-errors همچنان فعال بماند —
 *      قطع فقط «نمایش» است، نه جمع‌آوری تله‌متری و نه هشدارهای شبانه.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const JS = join(ROOT, 'public/assets/js');
const SRC = join(ROOT, 'src');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const app = readFileSync(join(JS, 'app.js'), 'utf8');
const routing = read('src/application/api-routing/index.ts');

describe('گیت فرانت ۱.۲۵.۷۱ — قطع دو ماژول تشخیصی از UI بدون حذف کد', () => {
  test('① سایدبار و روتر: هیچ ثبت فعالی برای دو مسیر باقی نمانده باشد', () => {
    expect(app).not.toMatch(/\{ hash: '#\/health'/);
    expect(app).not.toMatch(/\{ hash: '#\/client-errors'/);
    expect(app).not.toMatch(/register\('#\/health'/);
    expect(app).not.toMatch(/register\('#\/client-errors'/);
    /* توضیح قطع در سورس بماند تا رد کارفرما پیدا باشد */
    expect(app).toMatch(/۱\.۲۵\.۷۱ — «پنل سلامت» و «خطاهای مرورگر» از سایدبار و روتر قطع شدند/);
  });

  test('② کد حذف نشده: سورس نماها و ماژول‌های سرور سرِ جای خودشان‌اند', () => {
    expect(existsSync(join(JS, 'views/health-panel.js'))).toBe(true);
    expect(existsSync(join(JS, 'views/client-errors.js'))).toBe(true);
    expect(existsSync(join(SRC, 'application/health'))).toBe(true);
    expect(existsSync(join(SRC, 'application/client-errors'))).toBe(true);
    /* خروجی نماها هم‌نام قرارداد قبلی بماند تا بازگشت یک‌خطی باشد */
    const healthView = readFileSync(join(JS, 'views/health-panel.js'), 'utf8');
    const errorsView = readFileSync(join(JS, 'views/client-errors.js'), 'utf8');
    expect(healthView).toMatch(/renderHealthPanel/);
    expect(errorsView).toMatch(/renderClientErrors/);
  });

  test('③ سیم‌کشی سرور و لولهٔ داده زنده: دو مسیر API ثبت‌شده و گزارشگر مرورگر فعال', () => {
    expect(routing).toMatch(/registerHealthRoutes\(app/);
    expect(routing).toMatch(/registerClientErrorsRoutes\(app/);
    /* گزارشگر خطای مرورگر در app.js همچنان به /public/client-errors پست می‌کند */
    expect(app).toMatch(/fetch\('\/public\/client-errors'/);
  });
});
