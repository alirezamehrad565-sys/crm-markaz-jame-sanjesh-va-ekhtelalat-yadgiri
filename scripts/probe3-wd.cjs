const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8787';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1700);
  await page.getByPlaceholder('مثلاً manager').fill('local-mgr2');
  await page.getByPlaceholder('••••••').fill('Local-Test-1405!x');
  await page.locator('.btn--primary').first().click();
  await page.waitForTimeout(4000);
  await page.evaluate(() => { location.hash = '#/working-day'; });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const card = document.querySelector('.wd-appt[data-appt-id="e0000000-0000-4000-8000-000000000001"]');
    const meta = card?.querySelector('.wd-appt__meta');
    const cs = meta ? getComputedStyle(meta) : null;
    return {
      anchored: card?.dataset.apptId ?? null,
      metaChildren: meta ? [...meta.children].map((c) => `${c.tagName}.${c.className}=${(c.textContent||'').slice(0,14)}`) : null,
      flexWrap: cs?.flexWrap,
      metaHeight: meta?.offsetHeight,
      studentRowH: card?.querySelector('.wd-appt__student')?.offsetHeight,
      cardH: card?.offsetHeight
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
