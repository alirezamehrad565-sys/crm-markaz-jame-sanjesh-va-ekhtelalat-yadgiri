// پروب وضعیت نماها — متن خروجی هر نما + خطاها
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8787';
const VIEWS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['#/schools', '#/students', '#/screening', '#/working-day', '#/finance', '#/case-event-types', '#/backup', '#/docs', '#/clearbook'];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  await page.getByPlaceholder('مثلاً manager').fill('local-test-mgr');
  await page.getByPlaceholder('••••••').fill('Local-Test-1405!x');
  await page.locator('form button[type="submit"], form .btn--primary, .btn--primary').first().click();
  await page.waitForTimeout(4200);
  for (const h of VIEWS) {
    errs.length = 0;
    await page.evaluate((x) => { location.hash = x; }, h);
    await page.waitForTimeout(2600);
    const txt = await page.evaluate(() => (document.querySelector('#outlet')?.textContent || '').slice(0, 260).replace(/\s+/g, ' '));
    const btns = await page.evaluate(() => [...document.querySelectorAll('#outlet button')].map((b) => (b.textContent || '').trim()).filter(Boolean).slice(0, 14));
    console.log(`\n### ${h}  (errs: ${errs.length ? errs.join(' | ') : '0'})`);
    console.log(`text: ${txt}`);
    console.log(`btns: ${btns.join(' · ')}`);
    await page.screenshot({ path: `/tmp/shots-124/probe${h.replace(/[^\w]/g, '_')}.png` });
  }
  await browser.close();
})();
