/* اسکرین‌شات قبل/بعد از بهبود تقویم نوبت‌ها (موبایل + دسکتاپ) — محیط ایزولهٔ محلی */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || '/tmp/shots-cal/before';
require('fs').mkdirSync(OUT, { recursive: true });

async function login(page, username, password) {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1700);
  await page.getByPlaceholder('مثلاً manager').fill(username);
  await page.getByPlaceholder('••••••').fill(password);
  await page.locator('form button[type="submit"], form .btn--primary, .btn--primary').first().click();
  await page.waitForTimeout(4200);
}

async function goCal(page, tag, fullPage = true) {
  await page.evaluate(() => { location.hash = '#/appointments'; });
  await page.waitForTimeout(3400);
  await page.screenshot({ path: `${OUT}/cal-${tag}-fold.png` });
  if (fullPage) await page.screenshot({ path: `${OUT}/cal-${tag}-full.png`, fullPage: true });
  // وضعیت گرید برای گزارش
  const info = await page.evaluate(() => {
    const gi = document.querySelector('.grid-inner');
    const gs = document.querySelector('.grid-scroll');
    if (!gi) return { found: false };
    return {
      found: true,
      viewMode: (document.querySelector('.mode-seg .seg__btn.is-active') || {}).textContent?.trim() ?? '?',
      scrollW: gs ? gs.scrollWidth : null,
      clientW: gs ? gs.clientWidth : null,
      hOverflow: gs ? gs.scrollWidth > gs.clientWidth + 1 : null,
      cols: gi.style.gridTemplateColumns || getComputedStyle(gi).gridTemplateColumns.slice(0, 120),
      cards: document.querySelectorAll('.grid-appt').length
    };
  });
  console.log(tag, JSON.stringify(info));
}

(async () => {
  const browser = await chromium.launch();

  // — موبایل (مثل گوشی کاربر — لمسی/باریک)
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const mp = await mctx.newPage();
  const merr = [];
  mp.on('console', (m) => { if (m.type() === 'error') merr.push(m.text().slice(0, 160)); });
  mp.on('pageerror', (e) => merr.push('PAGEERROR: ' + String(e).slice(0, 160)));
  await login(mp, 'local-mgr2', 'Local-Test-1405!x');
  await goCal(mp, 'mobile-default');
  // سوئیچ دستی به هفته (وضعیت قدیمی موبایل)
  await mp.evaluate(() => {
    const btns = [...document.querySelectorAll('.mode-seg .seg__btn')];
    const wk = btns.find((b) => b.textContent.trim() === 'هفته');
    wk?.click();
  });
  await mp.waitForTimeout(2500);
  await goCal(mp, 'mobile-week-forced');

  console.log('mobile console errors:', merr.length ? merr.join(' | ') : 'none');

  // — دسکتاپ
  const dctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const dp = await dctx.newPage();
  const derr = [];
  dp.on('console', (m) => { if (m.type() === 'error') derr.push(m.text().slice(0, 160)); });
  dp.on('pageerror', (e) => derr.push('PAGEERROR: ' + String(e).slice(0, 160)));
  await login(dp, 'local-mgr2', 'Local-Test-1405!x');
  await goCal(dp, 'desktop-default');
  console.log('desktop console errors:', derr.length ? derr.join(' | ') : 'none');

  await browser.close();
  console.log('DONE →', OUT);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
