// اسکرین‌شات حسابرسی «دو نما» (۱.۲۵.۴۵ — بدون قفل جهت) — فقط /tmp/shots (هرگز داخل مخزن)
// برای هر نوع: عمودی لمسی ۳۹۰×۸۴۴ (کارت والد → INTRO → محرک آزمون واقعی)
//   + عمودی کوچک ۳۶۰×۶۴۰ (گوشی ریز) + افقی لمسی ۸۴۴×۳۹۰ (INTRO → محرک آزمون) + دسکتاپ ۱۲۸۰×۸۰۰
// عمودی دیگر پوشش «بچرخان» نیست — شات عمودی = اجرای واقعی بازی.
// جفت ابزار: scripts/seed-skins-audit.mjs (ساخت لینک) + scripts/shots-pixelcheck.py (پیکسل‌سنجی)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const BASE = 'http://localhost:8787';
const OUT = process.env.SHOTS_DIR || '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const LINKS = readFileSync(process.env.LINKS_FILE || '/tmp/links.txt', 'utf8').trim().split('\n').map((l) => {
  const [kind, url] = l.split('|');
  return { kind, url: url.replace('https://center-system.sanjeshm.workers.dev', BASE) };
});

const browser = await chromium.launch();

async function shoot(ctx, name) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', name, String(e).slice(0, 120)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', name, m.text().slice(0, 120)); });
  return page;
}

/* جریان مشترک: ورود کودک → حرکت تا جریان اصلی واقعی (play-stage--main) → رگبار شات */
async function reachTrial(page, shotPrefix) {
  const btn0 = page.locator('button:has-text("آمادهٔ شروع هستیم")');
  if (await btn0.count()) await btn0.first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${shotPrefix}-intro.png` });

  const startBtn = page.locator('#play-stage button');
  const n = await startBtn.count();
  if (n) await startBtn.nth(n - 1).click().catch(() => {});
  /* نظرسنجی تا showِ جریان اصلی واقعی — در این میان لمس دکمه‌های مرئی (پاسخ واقعی بازی‌های گزینه‌محور) */
  let got = false;
  for (let i = 0; i < 70 && !got; i++) {
    await page.waitForTimeout(1000);
    got = await page.evaluate(() => {
      const st = document.getElementById('play-stage');
      return !!st && st.classList.contains('play-stage--main');
    });
    if (!got) {
      const b = page.locator('#play-stage button:visible');
      if (await b.count()) await b.first().click().catch(() => {});
    }
  }
  /* گونوگو — جریان اصلی کوتاه است (لمس-گزارش بی‌دکمه)؛ اگر از دست رفت، کارت پایان هم سند است */
  if (!got) {
    const endCard = await page.evaluate(() => {
      const st = document.getElementById('play-stage');
      return !!st && (st.textContent.includes('مرحله') || st.className.includes('end'));
    });
    if (endCard) got = true;
  }
  if (got) {
    await page.screenshot({ path: `${OUT}/${shotPrefix}-trial.png` });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${shotPrefix}-trial-mid.png` });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${shotPrefix}-trial-later.png` });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${shotPrefix}-trial-end.png` });
  } else {
    await page.screenshot({ path: `${OUT}/${shotPrefix}-stuck.png` });
  }
  return got;
}

for (const { kind, url } of LINKS) {
  console.log('=== ' + kind + ' ===');

  // ── ۱) عمودی لمسی ۳۹۰×۸۴۴ — نمای اصلی موبایل؛ کارت والد + اجرای واقعی
  const ctxP = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const pageP = await shoot(ctxP, kind + '-portrait');
  try {
    await pageP.goto(url, { waitUntil: 'networkidle' });
    await pageP.waitForTimeout(600);
    await pageP.screenshot({ path: `${OUT}/${kind}-1-parent-portrait.png` });
    await reachTrial(pageP, `${kind}-2p`);
  } catch (e) { console.log('  portrait fail:', String(e).slice(0, 150)); }
  await ctxP.close();

  // ── ۲) عمودی کوچک ۳۶۰×۶۴۰ — گوشی ریز؛ INTRO و محرک باید جا شوند
  const ctxS = await browser.newContext({
    viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const pageS = await shoot(ctxS, kind + '-small');
  try {
    await pageS.goto(url, { waitUntil: 'networkidle' });
    await reachTrial(pageS, `${kind}-3s`);
  } catch (e) { console.log('  small fail:', String(e).slice(0, 150)); }
  await ctxS.close();

  // ── ۳) افقی لمسی ۸۴۴×۳۹۰ — نمای دوم؛ INTRO و محرک آزمون
  const ctxL = await browser.newContext({
    viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const pageL = await shoot(ctxL, kind + '-landscape');
  try {
    await pageL.goto(url, { waitUntil: 'networkidle' });
    await reachTrial(pageL, `${kind}-4l`);
  } catch (e) { console.log('  landscape fail:', String(e).slice(0, 150)); }
  await ctxL.close();

  // ── ۴) افقی دسکتاپ بزرگ — یک نما برای بررسی چیدمان گسترده
  const ctxD = await browser.newContext({
    viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false
  });
  const pageD = await shoot(ctxD, kind + '-desktop');
  try {
    await pageD.goto(url, { waitUntil: 'networkidle' });
    const btn3 = pageD.locator('button:has-text("آمادهٔ شروع هستیم")');
    if (await btn3.count()) await btn3.first().click();
    await pageD.waitForTimeout(1500);
    await pageD.screenshot({ path: `${OUT}/${kind}-7-intro-desktop.png` });
  } catch (e) { console.log('  desktop fail:', String(e).slice(0, 150)); }
  await ctxD.close();
}

await browser.close();
console.log('DONE — shots in ' + OUT);
