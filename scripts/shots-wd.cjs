/* اسکرین‌شات قبل/بعد از بازطراحی روز کاری — محیط ایزولهٔ محلی */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || '/tmp/shots-wd/before';
require('fs').mkdirSync(OUT, { recursive: true });

async function login(page, username, password) {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1700);
  await page.getByPlaceholder('مثلاً manager').fill(username);
  await page.getByPlaceholder('••••••').fill(password);
  await page.locator('form button[type="submit"], form .btn--primary, .btn--primary').first().click();
  await page.waitForTimeout(4200);
}

(async () => {
  const browser = await chromium.launch();

  // — موبایل (مثل گوشی کاربر)
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mp = await mctx.newPage();
  const merr = [];
  mp.on('console', (m) => { if (m.type() === 'error') merr.push(m.text().slice(0, 160)); });
  mp.on('pageerror', (e) => merr.push('PAGEERROR: ' + String(e).slice(0, 160)));
  await login(mp, 'local-mgr2', 'Local-Test-1405!x');
  await mp.evaluate(() => { location.hash = '#/working-day'; });
  await mp.waitForTimeout(3200);
  await mp.screenshot({ path: `${OUT}/wd-mobile-fold.png` });
  await mp.screenshot({ path: `${OUT}/wd-mobile-full.png`, fullPage: true });
  // کارت نوبت زوم‌شده — ناحیهٔ درمانگر اول
  await mp.evaluate(() => {
    const card = document.querySelector('.wd-appt');
    if (card) card.scrollIntoView({ block: 'center' });
  });
  await mp.waitForTimeout(500);
  await mp.screenshot({ path: `${OUT}/wd-mobile-card.png` });
  console.log('mobile console errors:', merr.length ? merr.join(' | ') : 'none');

  // — دسکتاپ
  const dctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const dp = await dctx.newPage();
  const derr = [];
  dp.on('console', (m) => { if (m.type() === 'error') derr.push(m.text().slice(0, 160)); });
  dp.on('pageerror', (e) => derr.push('PAGEERROR: ' + String(e).slice(0, 160)));
  await login(dp, 'local-mgr2', 'Local-Test-1405!x');
  await dp.evaluate(() => { location.hash = '#/working-day'; });
  await dp.waitForTimeout(3200);
  await dp.screenshot({ path: `${OUT}/wd-desktop.png` });
  await dp.screenshot({ path: `${OUT}/wd-desktop-full.png`, fullPage: true });
  console.log('desktop console errors:', derr.length ? derr.join(' | ') : 'none');

  await browser.close();
  console.log('DONE →', OUT);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
