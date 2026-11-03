/* اسکرین‌شات تم تاریک (همان تم گوشی کاربر) + نمای درمانگر */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8787';
const OUT = process.env.OUT || '/tmp/shots-wd/after';
require('fs').mkdirSync(OUT, { recursive: true });
async function login(page, u, p) {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1700);
  await page.getByPlaceholder('مثلاً manager').fill(u);
  await page.getByPlaceholder('••••••').fill(p);
  await page.locator('.btn--primary').first().click();
  await page.waitForTimeout(4200);
}
(async () => {
  const browser = await chromium.launch();
  // — موبایل تاریک
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mp = await m.newPage();
  await mp.addInitScript(() => { try { localStorage.setItem('cs.theme', 'dark'); } catch {} });
  await login(mp, 'local-mgr2', 'Local-Test-1405!x');
  await mp.evaluate(() => { location.hash = '#/working-day'; });
  await mp.waitForTimeout(3200);
  await mp.screenshot({ path: `${OUT}/wd-dark-mobile-full.png`, fullPage: true });
  await mp.evaluate(() => { const c = document.querySelector('.wd-appt'); if (c) c.scrollIntoView({ block: 'center' }); });
  await mp.waitForTimeout(400);
  await mp.screenshot({ path: `${OUT}/wd-dark-mobile-card.png` });
  // — دسکتاپ تاریک
  const d = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const dp = await d.newPage();
  await dp.addInitScript(() => { try { localStorage.setItem('cs.theme', 'dark'); } catch {} });
  await login(dp, 'local-mgr2', 'Local-Test-1405!x');
  await dp.evaluate(() => { location.hash = '#/working-day'; });
  await dp.waitForTimeout(3200);
  await dp.screenshot({ path: `${OUT}/wd-dark-desktop.png` });
  await dp.screenshot({ path: `${OUT}/wd-dark-desktop-full.png`, fullPage: true });
  // — نمای درمانگر (روشن)
  const th = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const tp = await th.newPage();
  await login(tp, 'local-ther2', 'Local-Test-1405!x');
  await tp.evaluate(() => { location.hash = '#/working-day'; });
  await tp.waitForTimeout(3200);
  await tp.screenshot({ path: `${OUT}/wd-therapist-desktop.png` });
  await browser.close();
  console.log('DONE dark + therapist');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
