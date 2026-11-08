// اسکرین‌شات حسابرسی پوستهٔ بازی‌ها — فقط /tmp/shots (هرگز داخل مخزن)
// برای هر نوع: کارت والد (عمودی) → INTRO (افقی کوچک 844×390) → محرک آزمون (افقی) → حالت آزمون (عمودی)
// جفت ابزار: scripts/seed-skins-audit.mjs (ساخت لینک) + scripts/shots-pixelcheck.py (پیکسل‌سنجی)
// توجه: روی پایهٔ G7 لمسیِ عمودی «قفل» است (پوشش چرخش) — شات عمودیِ آزمون همان پوشش است؛
// راستیِ «دو نما» برای پوسته‌های G7 از قفل+مکث می‌آید (تصمیم ثبت‌شدهٔ G7).
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const BASE = 'http://localhost:8787';
const OUT = '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const LINKS = readFileSync('/tmp/links.txt', 'utf8').trim().split('\n').map((l) => {
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

for (const { kind, url } of LINKS) {
  console.log('=== ' + kind + ' ===');

  // ── ۱) کارت والد — عمودی موبایل لمسی (کارت والد زیر قفل نیست)
  const ctxP = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const pageP = await shoot(ctxP, kind + '-parent');
  try {
    await pageP.goto(url, { waitUntil: 'networkidle' });
    await pageP.waitForTimeout(600);
    await pageP.screenshot({ path: `${OUT}/${kind}-1-parent-portrait.png` });
    const btn = pageP.locator('button:has-text("آمادهٔ شروع هستیم")');
    if (await btn.count()) await btn.first().click();
    await pageP.waitForTimeout(1500);
    await pageP.screenshot({ path: `${OUT}/${kind}-2-child-portrait.png` });
  } catch (e) { console.log('  portrait fail:', String(e).slice(0, 150)); }
  await ctxP.close();

  // ── ۲) حالت افقی کوچک (آیفون SE منهای نوار) — INTRO و محرک آزمون
  const ctxL = await browser.newContext({
    viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const pageL = await shoot(ctxL, kind + '-landscape');
  try {
    await pageL.goto(url, { waitUntil: 'networkidle' });
    const btn2 = pageL.locator('button:has-text("آمادهٔ شروع هستیم")');
    if (await btn2.count()) await btn2.first().click();
    await pageL.waitForTimeout(1600);
    await pageL.screenshot({ path: `${OUT}/${kind}-3-intro-landscape.png` });

    const startBtn = pageL.locator('#play-stage button');
    const n = await startBtn.count();
    if (n) {
      await startBtn.nth(n - 1).click().catch(() => {});
      await pageL.waitForTimeout(1200);
    }
    let got = false;
    try { await pageL.waitForSelector('#play-stage svg', { timeout: 20000 }); got = true; } catch {}
    if (!got) {
      for (let i = 0; i < 6 && !got; i++) {
        const b = pageL.locator('#play-stage button:visible');
        if (await b.count()) { await b.first().click().catch(() => {}); }
        await pageL.waitForTimeout(1500);
        try { await pageL.waitForSelector('#play-stage svg', { timeout: 3000 }); got = true; } catch {}
      }
    }
    if (got) {
      await pageL.screenshot({ path: `${OUT}/${kind}-4-trial-landscape.png` });
      await pageL.waitForTimeout(1400);
      await pageL.screenshot({ path: `${OUT}/${kind}-5-trial-later-landscape.png` });
    } else {
      await pageL.screenshot({ path: `${OUT}/${kind}-4-stuck-landscape.png` });
    }
  } catch (e) { console.log('  landscape fail:', String(e).slice(0, 150)); }
  await ctxL.close();

  // ── ۳) افقیِ دسکتاپ (بزرگ) — یک نما برای بررسی چیدمان گسترده
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
