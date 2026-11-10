/* QA زندهٔ «هم‌صداها» (simon — ۱.۲۵.۵۲) — رانش کامل لمسی محلی 8787:
   والد → INTRO → تمرین تا-موفقیت (دو قدم) → کارت مرحله → اجرای اصلی
   (پخش واقعی دنباله + یادآوری با ثبت ترتیب نور) → کارت پایان → پس‌گفت.
   ترتیب نور با ناظر کلاس --lit در صفحه ضبط می‌شود (هیچ کلیدی از سرور نمی‌آید —
   ناظر فقط کلاس CSS عمومی پخش را می‌بیند، همان چیزی که کودک می‌بیند).
   خروجی: نتیجهٔ هر فاز + شمار خطاهای کنسول + دقت پس‌گفت. اسکرین‌شات‌ها در /tmp. */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const BASE = 'http://localhost:8787';
const OUT = '/tmp/shots-simon';
mkdirSync(OUT, { recursive: true });

const LINKS = readFileSync('/tmp/links-simon.txt', 'utf8').trim().split('\n').map((l) => {
  const [kind, url] = l.split('|');
  return { kind, url: url.replace('https://center-system.sanjeshm.workers.dev', BASE) };
});

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: UA });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

const log = (...a) => console.log('·', ...a);

/* ثبت‌کنندهٔ ترتیب نور — یک‌بار در آغاز صفحه نصب می‌شود؛ نمونه‌برداری ۶۰ms با
   آستانه‌گذاری حالت (هر FALSE→TRUE یک رویداد) — تکرارِ دوستِ تکراری در دنباله
   را هم می‌گیرد (امضای سیمون). ثبت‌ها مونوتونیک و با مُهر زمانی‌اند؛ هر خواندن
   فقط رویدادهای بعد از خواندن قبلی را می‌برد (بدون پاک‌سازی — بدون رقابت مرزی).
   فقط کلاس CSS عمومی پخش را می‌بیند — همان چیزی که کودک می‌بیند؛ هیچ کلیدی از سرور نمی‌آید. */
async function installLitPoller() {
  await page.evaluate(() => {
    window.__simonEv = [];
    window.__simonLitState = {};
    window.__simonMark = 0;
    if (window.__simonPoller) return;
    window.__simonPoller = setInterval(() => {
      const now = performance.now();
      document.querySelectorAll('.play-simon__pad--lit').forEach((el) => {
        const idx = Number(el.getAttribute('data-idx'));
        if (!window.__simonLitState[idx]) {
          window.__simonLitState[idx] = true;
          window.__simonEv.push({ idx, t: now });
        }
      });
      document.querySelectorAll('.play-simon__pad:not(.play-simon__pad--lit)').forEach((el) => {
        window.__simonLitState[Number(el.getAttribute('data-idx'))] = false;
      });
    }, 60);
  });
}

/** رویدادهای نور بعد از خواندن قبلی — مُهر آخرین رویداد برده‌شده جلو می‌رود */
async function litOrder() {
  return page.evaluate(() => {
    const evs = (window.__simonEv || []).filter((e) => e.t > (window.__simonMark || 0));
    if (evs.length > 0) window.__simonMark = evs[evs.length - 1].t;
    return evs.map((e) => e.idx);
  });
}

async function tapPads(order) {
  for (const idx of order) {
    const el = page.locator(`#play-stage .play-simon__pad[data-idx="${idx}"]`).first();
    await el.click({ force: true });
    await page.waitForTimeout(260);
  }
}

async function stageText() {
  return page.evaluate(() => (document.getElementById('play-stage')?.textContent || '').trim().slice(0, 400));
}

async function hasClass(cls) {
  return page.evaluate((c) => (document.getElementById('play-stage')?.className || '').includes(c), cls);
}

/* ─── ورود از لینک والد ─── */
const link = LINKS.find((l) => l.kind === 'simon');
if (!link) throw new Error('لینک simon در /tmp/links-simon.txt نیست');
await page.goto(link.url, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
log('والد:', (await page.title()).slice(0, 40));

/* دکمهٔ ورود کودک — همان قاعدهٔ ابزارهای پیشین: بزرگ‌ترین دکمهٔ کارت */
const enterBtn = page.locator('button:has-text("ورود کودک"), a:has-text("ورود کودک"), button:has-text("شروع"), a:has-text("شروع")').first();
await enterBtn.click({ force: true });
await page.waitForTimeout(1400);

/* INTRO — نام بازی و قانون (جلسهٔ نیمه‌تمام ممکن است مستقیم به تمرین برود — U7) */
await page.screenshot({ path: OUT + '/01-intro.png' });
const introTxt = await page.evaluate(() => document.body.textContent.slice(0, 2000));
const introOk = introTxt.includes('هم‌صداها');
log('INTRO نام «هم‌صداها»:', introOk ? '✓' : '✗ (شاید ادامهٔ نرم جلسه)');
const introStart = page.locator('#play-root button:has-text("شروع"), .play-intro button, button:has-text("بریم")').first();
if (await introStart.count()) {
  await introStart.click({ force: true });
  await page.waitForTimeout(1600);
} else {
  log('دکمهٔ شروع INTRO نبود — ادامهٔ جلسهٔ باز');
}

/* ثبت‌کنندهٔ نور — پس از ناوبری کودک (هر فراخوانی idempotent) */
await installLitPoller();

/* تمرین — دو قدم تا موفقیت (هر قدم ممکن است چند تلاش بخواهد) */
for (let step = 1; step <= 2; step++) {
  let done = false;
  for (let attempt = 0; attempt < 6 && !done; attempt++) {
    await page.waitForTimeout(2300); // صبر برای پخش/نمایش قدم تمرین
    const txt = await stageText();
    if (txt.includes('تمرین تمام شد')) { done = true; break; }
    if (txt.includes('مرحلهٔ') && txt.includes('از ۵')) { done = true; break; } // تمرین تمام و کارت مرحله
    const order = await litOrder();
    if (order.length >= 2) {
      log(`تمرین قدم ${step} تلاش ${attempt + 1}: لمس ${order.join('→')}`);
      await tapPads(order);
    } else {
      log(`تمرین قدم ${step} تلاش ${attempt + 1}: نور دیده نشد — متن: ${txt.slice(0, 80)}`);
    }
    await page.waitForTimeout(1800);
  }
  if (!done) {
    const t = await stageText();
    log(`قدم ${step} تمام نشد — متن: ${t.slice(0, 120)}`);
  }
}
await page.screenshot({ path: OUT + '/02-after-practice.png' });

/* اجرای اصلی — تا کارت پایان؛ هر آیتم: پخش → یادآوری با ترتیب ناظر */
let mainItems = 0;
for (let guard = 0; guard < 60; guard++) {
  const txt = await stageText();
  if (txt.includes('پایان') || txt.includes('آفرین') && txt.includes('امروز')) { log('کارت پایان دیده شد'); break; }
  const inSimon = await hasClass('play-stage--simon');
  if (!inSimon) {
    /* کارت مرحله/استراحت — tapToContinue: لمس هر جای صحنه جلو می‌برد؛
       مرز آیتم — این‌جا بافر نور خالی می‌شود تا فقط رویدادهای آیتم بعدی بمانند */
    await page.waitForTimeout(1500);
    const stageEl = page.locator('#play-stage').first();
    if (await stageEl.count()) {
      await stageEl.dispatchEvent('pointerdown', { pointerId: 1, bubbles: true }).catch(() => {});
      await page.waitForTimeout(900);
      /* اگر دکمهٔ واقعی هم بود (کارت پایان و…) — لمسش کن */
      const cont = page.locator('#play-stage button, #play-stage [role="button"]').first();
      if (await cont.count()) { await cont.click({ force: true }).catch(() => {}); await page.waitForTimeout(700); }
    }
    continue;
  }
  /* صحنهٔ simon — منتظر پایان پخش («نوبت توست»)؛ خواندن بعدی فقط رویدادهای
     بعد از خواندن قبلی را می‌برد — بدون پاک‌سازی، بدون رقابت مرزی */
  let recall = false;
  for (let w = 0; w < 40; w++) {
    const t = await stageText();
    if (t.includes('نوبت توست')) { recall = true; break; }
    await page.waitForTimeout(400);
  }
  if (!recall) { await page.waitForTimeout(1200); continue; }
  const order = await litOrder();
  if (order.length < 2) {
    const diag = await page.evaluate(() => ({
      poller: typeof window.__simonPoller,
      evs: (window.__simonEv || []).length,
      mark: window.__simonMark || 0,
      lastEvs: (window.__simonEv || []).slice(-5).map((e) => e.idx + '@' + Math.round(e.t)),
      litNow: document.querySelectorAll('.play-simon__pad--lit').length,
      status: (document.querySelector('#play-stage .play-simon__status') || {}).textContent || ''
    }));
    log('پخش بدون نور ثبت‌شده — منتظر بستن پنجره (تایم‌اوت نمره می‌خورد)…', JSON.stringify(diag));
    /* صبر تا پایان پنجرهٔ همین آیتم — سپس آیتم بعدی؛ پاسخ ناتمام = اُمیشن سرور */
    for (let w2 = 0; w2 < 60; w2++) {
      await page.waitForTimeout(700);
      const t2 = await stageText();
      if (!t2.includes('نوبت توست')) break;
      if (!(await hasClass('play-stage--simon'))) break;
    }
    continue;
  }
  log(`آیتم ${mainItems + 1}: پخش ${order.join('→')} → همان را لمس می‌کنیم`);
  await tapPads(order);
  mainItems += 1;
  await page.waitForTimeout(1600);
}
await page.screenshot({ path: OUT + '/03-end.png' });

/* پس‌گفت والد */
await page.waitForTimeout(1500);
const endTxt = await page.evaluate(() => document.body.textContent.slice(0, 2500));
const accOk = endTxt.includes('٪۱۰۰') || endTxt.includes('۱۰۰');
log('آیتم‌های اصلی پاسخ‌داده‌شده:', mainItems, '| دقت ۱۰۰ در پس‌گفت:', accOk ? '✓' : '—');
log('خطاهای کنسول:', errors.length === 0 ? 'صفر ✓' : errors.slice(0, 5));
await browser.close();
console.log('SIMON-LIVE-' + (errors.length === 0 && introOk && mainItems >= 5 ? 'PASS' : 'CHECK'));
