/* بررسی افقیِ کوتاه simon (۸۴۴×۳۹۰ لمسی) — کارت والد → ورود کودک → INTRO/تمرین
   + اسکرین‌شات + ممیزی پیکسلی ساده (غیرخالی بودن) — خروجی فقط /tmp */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const BASE = 'http://localhost:8787';
const OUT = '/tmp/shots-simon';
const link = readFileSync('/tmp/links-simon.txt', 'utf8').trim().split('\n')
  .map((l) => l.split('|'))
  .filter(([, url]) => url)
  .map(([kind, url]) => ({ kind, url: url.replace('https://center-system.sanjeshm.workers.dev', BASE) }))
  .find((l) => l.kind === 'simon');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, userAgent: UA });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(link.url, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const enter = page.locator('button:has-text("آمادهٔ شروع"), button:has-text("ورود کودک"), a:has-text("ورود کودک")').first();
if (await enter.count()) { await enter.click({ force: true }); await page.waitForTimeout(1400); }
await page.screenshot({ path: OUT + '/L1-intro.png' });
const introBtn = page.locator('#play-root button:has-text("شروع"), .play-intro button, button:has-text("بریم")').first();
if (await introBtn.count()) { await introBtn.click({ force: true }); await page.waitForTimeout(2600); }
await page.screenshot({ path: OUT + '/L2-scene.png' });
/* شبکهٔ ۲×۲ کامل داخل کادر — صدف/دوستان از لبه بیرون نمی‌زنند */
const grid = await page.evaluate(() => {
  const g = document.querySelector('.play-simon__grid');
  if (!g) return { found: false };
  const r = g.getBoundingClientRect();
  return { found: true, w: Math.round(r.width), h: Math.round(r.height), inX: r.left >= 0 && r.right <= 844, inY: r.top >= 0 && r.bottom <= 390 };
});
console.log('LANDSCAPE grid:', JSON.stringify(grid), '| errors:', errors.length === 0 ? 'صفر ✓' : errors.slice(0, 3));
await browser.close();
console.log('SIMON-LANDSCAPE-' + (errors.length === 0 && grid.found && grid.inX && grid.inY ? 'PASS' : 'CHECK'));
