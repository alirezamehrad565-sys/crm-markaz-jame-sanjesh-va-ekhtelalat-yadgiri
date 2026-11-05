/* راستی‌آزمایی رفتاری بازطراحی ۱.۲۵.۰ — محیط ایزولهٔ محلی */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8787';
const OUT = '/tmp/shots-wd/after';
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  let reloads = 0;
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 140)));
  await page.addInitScript(() => {
    window.__nr = 0;
  });
  // شمارش reload واقعی: پیگیری navigation events
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) reloads++; });

  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1700);
  await page.getByPlaceholder('مثلاً manager').fill('local-mgr2');
  await page.getByPlaceholder('••••••').fill('Local-Test-1405!x');
  await page.locator('.btn--primary').first().click();
  await page.waitForTimeout(4000);
  await page.evaluate(() => { location.hash = '#/working-day'; });
  await page.waitForTimeout(3200);

  const t = (name, ok, note = '') => console.log(`${ok ? '✓' : '✗'} ${name}${note ? ' — ' + note : ''}`);

  // ۱) چیپ نوع جلسه حالا رندر می‌شود
  const chips = await page.evaluate(() => [...document.querySelectorAll('.wd-appt .st-chip')].map((c) => c.textContent));
  t('st-chip نوع جلسه روی کارت‌ها', chips.length >= 8, chips.join('،'));

  // ۲) لنگر data-appt-id روی کارت
  const anchored = await page.evaluate(() => [...document.querySelectorAll('.wd-appt')].filter((c) => c.dataset.apptId).length);
  t('لنگر data-appt-id روی همهٔ کارت‌ها', anchored >= 9, `${anchored}/9`);

  // ۳) سگمنت با وضعیت فعال در رندر
  const seg = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.wd-appt__student')];
    return {
      withActive: rows.filter((r) => r.querySelector('.wd-appt__sbtn.is-active')).length,
      pressed: rows.filter((r) => r.querySelector('.wd-appt__sbtn[aria-pressed="true"]')).length
    };
  });
  t('سگمنت حاضر/تأخیر/غایب با وضعیت فعال اولیه', seg.withActive >= 7 && seg.pressed >= 7, JSON.stringify(seg));

  // ۴) ثبت غایب روی «مریم صادقی» (حاضر) — باید درجا سلول قرمز شود، بدون رفرش
  const beforeNav = reloads;
  const markRes = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.wd-appt__student')];
    const row = rows.find((r) => r.querySelector('.wd-appt__sname')?.textContent === 'مریم صادقی');
    if (!row) return { ok: false };
    row.querySelector('.wd-appt__sbtn--err').click();
    return { ok: true };
  });
  await page.waitForTimeout(1100);
  const afterMark = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.wd-appt__student')];
    const row = rows.find((r) => r.querySelector('.wd-appt__sname')?.textContent === 'مریم صادقی');
    const dot = row.closest('.wd-tl__item').querySelector('.wd-tl__dot');
    const cardEl = row.closest('.wd-appt');
    return {
      activeBtn: row.querySelector('.wd-appt__sbtn.is-active')?.dataset.status ?? null,
      pressedErr: row.querySelector('.wd-appt__sbtn--err')?.getAttribute('aria-pressed'),
      dotNoShow: dot.className.includes('wd-tl__dot--no_show'),
      cardNoshow: cardEl.classList.contains('is-noshow')
    };
  });
  t('ثبت غایب درجا (سلول فعال + aria-pressed)', markRes.ok && afterMark.activeBtn === 'absent' && afterMark.pressedErr === 'true', JSON.stringify(afterMark));
  t('نقطهٔ تایم‌لاین و کلاس کارت هم‌زمان پچ شد', afterMark.dotNoShow && afterMark.cardNoshow);
  t('بدون reload در حین اکشن', reloads === beforeNav, `reloads=${reloads}`);

  // برگشت: حاضر دوباره
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.wd-appt__student')];
    const row = rows.find((r) => r.querySelector('.wd-appt__sname')?.textContent === 'مریم صادقی');
    row.querySelector('.wd-appt__sbtn--ok').click();
  });
  await page.waitForTimeout(900);

  // ۵) ویرایش توضیح نوبت درجا
  const noteRes = await page.evaluate(() => {
    const card = document.querySelector('.wd-appt[data-appt-id="e0000000-0000-4000-8000-000000000005"]');
    card.querySelector('.wd-appt__meta .btn--icon:not(.wd-appt__del)').click();
    return true;
  });
  await page.waitForTimeout(700);
  const ta = await page.$('.modal-overlay textarea');
  await ta.fill('توضیح آزمایشی — باید بلافاصله زیر کارت بیاید');
  await page.evaluate(() => {
    const overlay = [...document.querySelectorAll('.modal-overlay')].pop();
    [...overlay.querySelectorAll('button')].find((b) => (b.textContent || '').includes('ذخیره')).click();
  });
  await page.waitForTimeout(1200);
  const noteState = await page.evaluate(() => {
    const card = document.querySelector('.wd-appt[data-appt-id="e0000000-0000-4000-8000-000000000005"]');
    const preview = card.querySelector('.wd-appt__note');
    const editBtn = card.querySelector('.wd-appt__meta .btn--icon:not(.wd-appt__del)');
    return { preview: preview?.textContent ?? null, afterMeta: preview?.previousElementSibling?.classList.contains('wd-appt__meta'), hasNoteCls: editBtn.classList.contains('has-note') };
  });
  t('پیش‌نمایش توضیح درجا بعد از ذخیره', (noteState.preview || '').includes('بلافاصله'), JSON.stringify(noteState));
  t('توضیح بلافاصله بعد از ردیف meta نشست', noteState.afterMeta === true);

  // ۶) چیپ «بدون ثبت» به‌روز شد؟ (مریم حاضر شد → صفر/کم)
  const chipsBox = await page.evaluate(() => document.querySelector('.wd-appts-card .wd-att__chips')?.textContent);
  t('چیپ‌های آماری سربرگ زنده', /جلسه/.test(chipsBox), chipsBox.slice(0, 60));

  console.log(`reloads total: ${reloads}`);
  console.log('console errors:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
