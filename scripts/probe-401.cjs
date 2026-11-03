/* کدام درخواست ۴۰۱ می‌دهد؟ — فقط محیط ایزولهٔ محلی */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8787';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const p = await ctx.newPage();
  const fails = [];
  p.on('response', (r) => { if (r.status() >= 400) fails.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  await p.getByPlaceholder('مثلاً manager').fill('local-mgr2');
  await p.getByPlaceholder('••••••').fill('Local-Test-1405!x');
  await p.locator('.btn--primary').first().click();
  await p.waitForTimeout(3500);
  await p.evaluate(() => { location.hash = '#/working-day'; });
  await p.waitForTimeout(3500);
  console.log('failed requests:\n' + (fails.length ? fails.join('\n') : 'NONE'));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
