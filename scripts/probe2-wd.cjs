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
    const cards = [...document.querySelectorAll('.wd-appt')];
    return {
      cardCount: cards.length,
      anchored: cards.map((c) => c.dataset.apptId ?? '-'),
      items: [...document.querySelectorAll('.wd-tl__item')].map((i) => i.dataset.apptId ?? '-').slice(0, 12)
    };
  });
  console.log(JSON.stringify(info, null, 1));
  // کلیک حاضر روی در انتظار (فاطمه جوادی)
  const res = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.wd-appt__student[data-student-id]')];
    const row = rows.find((r) => (r.querySelector('.wd-mark')?.textContent || '').includes('در انتظار'));
    if (!row) return { ok: false };
    const name = row.querySelector('.wd-appt__sname').textContent;
    row.querySelector('.wd-appt__sbtn--ok').click();
    return { ok: true, name };
  });
  await page.waitForTimeout(1300);
  const after = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.wd-appt__student[data-student-id]')];
    const row = rows.find((r) => r.querySelector('.wd-appt__sname')?.textContent === 'فاطمه جوادی')
      ?? rows.find((r) => r.dataset.marked === '1');
    return rows.map((r) => `${r.querySelector('.wd-appt__sname')?.textContent}=${r.querySelector('.wd-mark')?.textContent}/act:${[...r.querySelectorAll('.wd-appt__sbtn.is-active')].map(b=>b.dataset.status).join('+')||'none'}`);
  });
  console.log('CLICK:', JSON.stringify(res));
  console.log(after.join('\n'));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
