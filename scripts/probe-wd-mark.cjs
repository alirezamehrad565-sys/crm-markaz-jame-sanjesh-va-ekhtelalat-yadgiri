/* اثبات زنده: آیا بعد از کلیک «حاضر»، نشان وضعیت دانش‌آموز درجا عوض می‌شود؟ */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8787';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1700);
  await page.getByPlaceholder('مثلاً manager').fill('local-mgr2');
  await page.getByPlaceholder('••••••').fill('Local-Test-1405!x');
  await page.locator('.btn--primary').first().click();
  await page.waitForTimeout(4000);
  await page.evaluate(() => { location.hash = '#/working-day'; });
  await page.waitForTimeout(3000);

  // وضعیت قبل
  const before = await page.evaluate(() => {
    const row = document.querySelector('.wd-appt__student[data-student-id]');
    if (!row) return null;
    return {
      mark: row.querySelector('.wd-mark')?.textContent ?? null,
      activeBtns: [...row.querySelectorAll('.wd-appt__sbtn.is-active')].map((b) => b.dataset.status),
      cardAnchored: !!row.closest('.wd-appt')?.dataset.apptId
    };
  });
  console.log('BEFORE:', JSON.stringify(before));

  // کلیک «حاضر» روی اولین دانش‌آموز pending
  const clicked = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.wd-appt__student[data-student-id]')];
    const pending = rows.find((r) => (r.querySelector('.wd-mark')?.textContent || '').includes('در انتظار'));
    if (!pending) return { ok: false, reason: 'no pending row' };
    const btn = pending.querySelector('.wd-appt__sbtn--ok');
    btn.click();
    return { ok: true, student: pending.querySelector('.wd-appt__sname')?.textContent };
  });
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.wd-appt__student[data-student-id]')];
    const row = rows.find((r) => (r.querySelector('.wd-mark')?.textContent || '') !== 'در انتظار') || rows[0];
    return {
      firstRowMark: row.querySelector('.wd-mark')?.textContent ?? null,
      firstRowActive: [...row.querySelectorAll('.wd-appt__sbtn.is-active')].map((b) => b.dataset.status),
      dotClass: row.closest('.wd-tl__item')?.querySelector('.wd-tl__dot')?.className
    };
  });
  console.log('CLICK:', JSON.stringify(clicked));
  console.log('AFTER :', JSON.stringify(after));
  console.log('PAGEERRORS:', errs.length ? errs.join(' | ') : 'none');

  // تست پچ توضیح نوبت (modal → save → آیا پیش‌نمایش درجا می‌آید؟)
  const noteProbe = await page.evaluate(() => {
    const card = document.querySelector('.wd-appt');
    const editBtn = card.querySelector('.wd-appt__time .btn--icon:not(.wd-appt__del)');
    editBtn.click();
    return true;
  });
  await page.waitForTimeout(700);
  const ta = await page.$('.modal-overlay textarea');
  if (ta) {
    await ta.fill('تست پچ توضیح — نمایش فوری');
    await page.evaluate(() => {
      const overlay = [...document.querySelectorAll('.modal-overlay')].pop();
      const save = [...overlay.querySelectorAll('button')].find((b) => (b.textContent || '').includes('ذخیره'));
      save.click();
    });
    await page.waitForTimeout(1500);
    const noteState = await page.evaluate(() => {
      const card = document.querySelector('.wd-appt');
      return { preview: card.querySelector('.wd-appt__note')?.textContent ?? null };
    });
    console.log('NOTE-PATCH:', JSON.stringify(noteState));
  }
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
