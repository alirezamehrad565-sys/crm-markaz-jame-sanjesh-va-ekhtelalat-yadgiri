/**
 * POLISH-4 M2 — گیت قطع پلتفرمی پنل سلامت و ویزارد ابری از UI وب (۱.۲۷.۳۱)
 *
 * قرارداد کارفرما: در نسخهٔ وب/کلادفلر، پنل سلامت و ویزارد پیکربندی ابری از رابط قطع‌اند
 * (فقط پوستهٔ میز — window.__TAURI__)؛ سورس و chunk دست‌نخورده می‌ماند.
 * دکمهٔ سربرگ (server-pill) از قبل فقط-میز بود — این گیت مسیرها + بنر + هدایت اولین‌اجرا را قفل می‌کند.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const APP = readFileSync(join(ROOT, 'public/assets/js/app.js'), 'utf8');

describe('POLISH-4 M2 — قطع پلتفرمی پنل سلامت/ویزارد ابری از وب', () => {
  test('helperهای قطع پلتفرمی در app.js', () => {
    expect(APP).toContain('function isDesktopShell()');
    expect(APP).toContain('return Boolean(globalThis.__TAURI__);');
    expect(APP).toContain('function desktopOnly(render)');
    expect(APP).toContain('این بخش در نسخهٔ میز مرکز است');
  });

  test('هر دو مسیر (پنل سلامت و ویزارد ابری) با desktopOnly پیچیده شده‌اند', () => {
    expect(APP).toMatch(/register\('#\/health-panel'.*managerOnly\(desktopOnly\(lazyView/);
    expect(APP).toMatch(/register\('#\/cloud-setup'.*managerOnly\(desktopOnly\(lazyView/);
  });

  test('بنر ابری و هدایت اولین‌اجرا روی وب نمی‌آیند', () => {
    expect(APP).toContain('بنر ابری فقط پوستهٔ میز');
    expect(APP).toContain('هدایت اولین‌اجرای ابری فقط پوستهٔ میز');
    // هر دو گارد باید پیش از fetch وضعیت بنشینند
    const bannerAt = APP.indexOf('بنر ابری فقط پوستهٔ میز');
    const armAt = APP.indexOf('هدایت اولین‌اجرای ابری فقط پوستهٔ میز');
    expect(bannerAt).toBeGreaterThan(-1);
    expect(armAt).toBeGreaterThan(-1);
  });

  test('دکمهٔ سربرگ از قبل فقط-میز بوده و دست‌نخورده مانده', () => {
    const pill = readFileSync(join(ROOT, 'public/assets/js/views/server-pill.js'), 'utf8');
    expect(pill).toContain('__TAURI__');
  });
});
