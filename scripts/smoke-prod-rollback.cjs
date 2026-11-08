/* دودِتستِ فقط-خواندنیِ پروداکشن پس از بازگشت ۱.۲۵.۰ — بدون ورود، بدون داده */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'https://center-system.sanjeshm.workers.dev';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
  await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  const boot = await p.evaluate(() => ({
    hasLoginForm: !!document.querySelector('form'),
    usernameField: !!document.querySelector('input[autocomplete], input[type="text"]'),
    appMounted: !!document.querySelector('#app, #root, body > *'),
    title: document.title.slice(0, 60),
    assetV: Array.from(document.querySelectorAll('link[href*="v="], script[src*="v="]')).map((n) => (n.href || n.src).match(/v=([0-9.]+)/)?.[1]).filter(Boolean).slice(0, 3),
  }));
  await p.screenshot({ path: '/tmp/prodcheck/login-mobile.png' });
  console.log(JSON.stringify(boot, null, 1));
  console.log('errors:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
  if (errs.length) process.exit(2);
  console.log('SMOKE-OK');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
