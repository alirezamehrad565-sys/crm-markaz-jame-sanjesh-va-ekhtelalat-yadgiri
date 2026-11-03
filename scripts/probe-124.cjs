// پروب سریع: بعد از لاگین به هر نما می‌رویم و محتوای outlet را می‌سنجیم
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8787';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('مثلاً manager').fill('local-test-mgr');
  await page.getByPlaceholder('••••••').fill('Local-Test-1405!x');
  await page.locator('form button[type="submit"], form .btn--primary, .btn--primary').first().click();
  await page.waitForTimeout(4200);
  console.log('hash after login:', await page.evaluate(() => location.hash));
  for (const h of ['#/dashboard', '#/my-todos', '#/waitlist', '#/screening']) {
    await page.evaluate((x) => { location.hash = x; }, h);
    await page.waitForTimeout(1800);
    const len = await page.evaluate(() => (document.querySelector('#outlet')?.textContent || '').length);
    const txt = await page.evaluate(() => (document.querySelector('#outlet')?.textContent || '').slice(0, 90).replace(/\s+/g, ' '));
    console.log(`${h} → chars=${len} | «${txt}»`);
  }
  console.log('console errors:', errs.length ? errs.slice(0, 6).join(' || ') : 'NONE');
  await browser.close();
})();
