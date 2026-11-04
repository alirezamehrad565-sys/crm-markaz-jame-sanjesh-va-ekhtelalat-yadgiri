/* راستی‌آزمایی رفتاری ۱.۲۶.۰ — تقویم نوبت‌ها (فقط محیط ایزولهٔ محلی) */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

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

  /* ————— موبایل (لمسی/باریک) ————— */
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const mp = await mctx.newPage();
  const merr = [];
  mp.on('pageerror', (e) => merr.push(String(e).slice(0, 140)));
  await login(mp, 'local-mgr2', 'Local-Test-1405!x');

  // ۱ — پیش‌فرض موبایل = هفته + صفر اسکرول افقی
  await mp.evaluate(() => { location.hash = '#/appointments'; });
  await mp.waitForTimeout(3400);
  const d1 = await mp.evaluate(() => {
    const gs = document.querySelector('.grid-scroll');
    const mode = document.querySelector('.mode-seg .seg__btn.is-active')?.textContent?.trim();
    return { mode, noOvf: gs && gs.scrollWidth <= gs.clientWidth + 1, heads: document.querySelectorAll('button.grid-head').length };
  });
  check('موبایل: پیش‌فرض «هفته» و صفر اسکرول افقی', d1.mode === 'هفته' && d1.noOvf && d1.heads === 7, JSON.stringify(d1));

  // ۲ — قرص فشرده: نام/چیپ/ساعت پایان پنهان، ساعت شروع نمایان
  const d2 = await mp.evaluate(() => {
    const card = document.querySelector('.grid-appt:not(.is-short)');
    if (!card) return { ok: false };
    const vis = (sel) => {
      const n = card.querySelector(sel);
      return !n || getComputedStyle(n).display === 'none';
    };
    const time = card.querySelector('.grid-appt__time');
    const end = card.querySelector('.appt-end');
    return {
      ok: vis('.grid-appt__title') && vis('.st-chip') && (end ? getComputedStyle(end).display === 'none' : true) && time && getComputedStyle(time).display !== 'none',
      timeText: time?.textContent?.trim().slice(0, 12)
    };
  });
  check('موبایل: قرص فشرده فقط ساعت شروع دارد', d2.ok, d2.timeText ?? '');

  // ۳ — تپ سربرگ امروز → نمای روز همان روز
  const todayHead = mp.locator('button.grid-head.is-today');
  await todayHead.click();
  await mp.waitForTimeout(2600);
  const d3 = await mp.evaluate(() => {
    const mode = document.querySelector('.mode-seg .seg__btn.is-active')?.textContent?.trim();
    const title = document.querySelector('.week-bar__title')?.textContent?.trim() ?? '';
    const staffCols = document.querySelectorAll('.grid-day[data-ymd]').length;
    return { mode, title: title.slice(0, 30), staffCols, persisted: sessionStorage.getItem('cs.apptViewMode') };
  });
  check('موبایل: تپ سربرگ امروز → نمای روز همان روز + حفظ انتخاب در نشست', d3.mode === 'روز' && d3.staffCols >= 1 && d3.persisted === 'day', JSON.stringify(d3));

  // ۴ — بازگشت به هفته از سگمنت
  await mp.evaluate(() => {
    const btns = [...document.querySelectorAll('.mode-seg .seg__btn')];
    btns.find((b) => b.textContent.trim() === 'هفته')?.click();
  });
  await mp.waitForTimeout(2600);
  const d4 = await mp.evaluate(() => {
    const mode = document.querySelector('.mode-seg .seg__btn.is-active')?.textContent?.trim();
    const gs = document.querySelector('.grid-scroll');
    return { mode, heads: document.querySelectorAll('button.grid-head').length, noOvf: gs && gs.scrollWidth <= gs.clientWidth + 1 };
  });
  check('موبایل: سگمنت «هفته» برمی‌گردد و گرید فشرده می‌ماند', d4.mode === 'هفته' && d4.heads === 7 && d4.noOvf, JSON.stringify(d4));

  // ۵ — تپ کارت → مودال جزئیات (بدون خطای صفحه) — کلیک واقعی DOM (درس گردانه‌های قبلی)
  await mp.evaluate(() => {
    const cards = [...document.querySelectorAll('.grid-appt')];
    const card = cards.find((c) => !c.classList.contains('is-short')) ?? cards[0];
    card.scrollIntoView({ block: 'center' });
    card.click();
  });
  await mp.waitForTimeout(1800);
  const d5 = await mp.evaluate(() => {
    const modal = document.querySelector('.modal');
    return { open: Boolean(modal), title: modal?.querySelector('.modal__title, h3, h2')?.textContent?.trim().slice(0, 40) ?? '' };
  });
  check('موبایل: تپ قرص → مودال جزئیات نوبت', d5.open, d5.title);
  await mp.keyboard.press('Escape');
  await mp.waitForTimeout(600);

  // ۶ — FAB نوبت جدید + دکمه‌های فقط-آیکن در نوار
  const d6 = await mp.evaluate(() => {
    const fab = document.querySelector('.week-bar .appt-fab');
    const fabFixed = fab ? getComputedStyle(fab).position === 'fixed' : false;
    const copyBtn = [...document.querySelectorAll('.week-bar .btn')].find((b) => b.getAttribute('aria-label') === 'کپی از هفته قبل');
    const txtHidden = copyBtn ? getComputedStyle(copyBtn.querySelector('.btn__txt')).display === 'none' : false;
    return { fabFixed, txtHidden };
  });
  check('موبایل: FAB شناور + کپی/برگردان فقط-آیکن', d6.fabFixed && d6.txtHidden, JSON.stringify(d6));

  // ۷ — سربرگ‌ها هنگام اسکرول عمودی زیر topbar می‌چسبند
  await mp.evaluate(() => { window.scrollTo(0, 500); });
  await mp.waitForTimeout(700);
  const d7 = await mp.evaluate(() => {
    const head = document.querySelector('button.grid-head');
    const r = head.getBoundingClientRect();
    const tb = document.querySelector('.topbar').getBoundingClientRect();
    return { headTop: Math.round(r.top), tbBottom: Math.round(tb.bottom), stuck: Math.abs(r.top - tb.bottom) < 4 };
  });
  check('موبایل: سربرگ هفته چسبان زیر topbar هنگام اسکرول', d7.stuck, `headTop=${d7.headTop} tbBottom=${d7.tbBottom}`);
  await mp.evaluate(() => { window.scrollTo(0, 0); });

  // ۸ — ماندگاری انتخاب: رفرش سخت → همچنان هفته (انتخاب آخر = week)
  await mp.reload({ waitUntil: 'domcontentloaded' });
  await mp.waitForTimeout(4200);
  const d8 = await mp.evaluate(() => {
    const mode = document.querySelector('.mode-seg .seg__btn.is-active')?.textContent?.trim();
    return { mode, persisted: sessionStorage.getItem('cs.apptViewMode') };
  });
  check('موبایل: بعد از رفرش، انتخاب نشست (هفته) حفظ می‌شود', d8.mode === 'هفته', JSON.stringify(d8));

  console.log('mobile pageerrors:', merr.length ? merr.join(' | ') : 'none');

  /* ————— دسکتاپ ————— */
  const dctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const dp = await dctx.newPage();
  const derr = [];
  dp.on('pageerror', (e) => derr.push(String(e).slice(0, 140)));
  await login(dp, 'local-mgr2', 'Local-Test-1405!x');

  // ۹ — دسکتاپ: کل هفته بدون اسکرول افقی + سربرگ‌های دکمه‌ای
  await dp.evaluate(() => { location.hash = '#/appointments'; });
  await dp.waitForTimeout(3400);
  const k9 = await dp.evaluate(() => {
    const gs = document.querySelector('.grid-scroll');
    const mode = document.querySelector('.mode-seg .seg__btn.is-active')?.textContent?.trim();
    const abbrHidden = getComputedStyle(document.querySelector('.gh-wd__abbr')).display === 'none';
    const fullShown = getComputedStyle(document.querySelector('.gh-wd__full')).display !== 'none';
    return { mode, noOvf: gs && gs.scrollWidth <= gs.clientWidth + 1, abbrHidden, fullShown };
  });
  check('دسکتاپ: هفتهٔ کامل بدون اسکرول افقی + نام کامل روزها', k9.mode === 'هفته' && k9.noOvf && k9.abbrHidden && k9.fullShown, JSON.stringify(k9));

  // ۱۰ — دسکتاپ: کلیک سربرگ یک روز → نمای روز؛ برگشت با سگمنت
  await dp.locator('button.grid-head[data-head-ymd]').nth(2).click();
  await dp.waitForTimeout(2600);
  const k10a = await dp.evaluate(() => {
    const mode = document.querySelector('.mode-seg .seg__btn.is-active')?.textContent?.trim();
    const title = document.querySelector('.week-bar__title')?.textContent ?? '';
    return { mode, title: title.trim().slice(0, 36) };
  });
  await dp.evaluate(() => {
    const btns = [...document.querySelectorAll('.mode-seg .seg__btn')];
    btns.find((b) => b.textContent.trim() === 'هفته')?.click();
  });
  await dp.waitForTimeout(2600);
  const k10b = await dp.evaluate(() => {
    const gs = document.querySelector('.grid-scroll');
    const gutter = document.querySelector('.grid-gutter');
    return {
      mode: document.querySelector('.mode-seg .seg__btn.is-active')?.textContent?.trim(),
      heads: document.querySelectorAll('button.grid-head').length,
      noOvf: gs && gs.scrollWidth <= gs.clientWidth + 1,
      gutterSticky: gutter ? getComputedStyle(gutter).position === 'sticky' : false
    };
  });
  check('دسکتاپ: کلیک سربرگ → روزِ همان روز («' + k10a.title + '») و برگشت به هفته سالم', k10a.mode === 'روز' && k10b.mode === 'هفته' && k10b.heads === 7 && k10b.noOvf && k10b.gutterSticky, JSON.stringify(k10b));

  // ۱۱ — جریان پیوسته: ایجاد نوبت از FAB دسکتاپ نیست؛ از دکمهٔ نوار — ایجاد/حذف بدون rebuild
  const barBtn = dp.locator('.week-bar .appt-fab');
  const fabVisibleDesktop = await barBtn.isVisible().catch(() => false);
  const k11 = await dp.evaluate(() => {
    const fab = document.querySelector('.week-bar .appt-fab');
    return fab ? getComputedStyle(fab).position : 'none';
  });
  check('دسکتاپ: «نوبت جدید» در نوار می‌ماند (FAB فقط موبایل)', k11 === 'static' || k11 === 'relative', `position=${k11}`);

  console.log('desktop pageerrors:', derr.length ? derr.join(' | ') : 'none');

  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  console.log(`\nنتیجه: ${pass}/${results.length}`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
