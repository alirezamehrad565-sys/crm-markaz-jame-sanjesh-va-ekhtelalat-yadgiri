// QA زندهٔ ۱.۲۵.۵۱ — سخت‌سازی استروپ: حیله در س۱، نردبان گزینه‌ها، پنجرهٔ تند؛ + نبود trail در کنسول
// اجرا: سرور محلی 8787 باید بالا باشد؛ لینک‌ها از scripts/seed-skins-audit.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';

const BASE = 'http://localhost:8787';
const OUT = '/tmp/shots-12551';
mkdirSync(OUT, { recursive: true });

const LINKS = readFileSync(process.env.LINKS_FILE || '/tmp/links.txt', 'utf8').trim().split('\n').map((l) => {
  const [kind, url] = l.split('|');
  return { kind, url: url.replace('https://center-system.sanjeshm.workers.dev', BASE) };
});

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  isMobile: true
});

let consoleErrors = 0;
const results = {};

/* حرکت تا جریان اصلی — الگوی shots-audit.mjs */
async function reachMain(page) {
  const btn0 = page.locator('button:has-text("آمادهٔ شروع هستیم")');
  if (await btn0.count()) await btn0.first().click();
  await page.waitForTimeout(1500);
  const startBtn = page.locator('#play-stage button');
  const n = await startBtn.count();
  if (n) await startBtn.nth(n - 1).click().catch(() => {});
  let got = false;
  for (let i = 0; i < 70 && !got; i++) {
    await page.waitForTimeout(1000);
    got = await page.evaluate(() => {
      const st = document.getElementById('play-stage');
      return !!st && st.classList.contains('play-stage--main');
    });
    if (!got) {
      const b = page.locator('#play-stage button:visible');
      if (await b.count()) {
        await b.first().click().catch(() => {});
      } else {
        // کارت مرحله/صحنهٔ آموزش با لمس هرجای صحنه جلو می‌رود (tapToContinue)
        await page.locator('#play-stage').click({ position: { x: 195, y: 420 } }).catch(() => {});
      }
    }
  }
  return got;
}

/* ── استروپ: حسابرسی ۵ آیتم نخستِ جریان اصلی ── */
const stroop = LINKS.find((l) => l.kind === 'stroop');
{
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') { consoleErrors++; console.log('[console.error stroop]', m.text().slice(0, 140)); } });
  page.on('pageerror', (e) => { consoleErrors++; console.log('[pageerror stroop]', String(e).slice(0, 140)); });
  await page.goto(stroop.url);
  const got = await reachMain(page);
  const items = [];
  for (let i = 0; i < 5 && got; i++) {
    const snap = await page.evaluate(() => {
      const st = document.getElementById('play-stage');
      if (!st || !st.classList.contains('play-stage--main')) return null;
      const w = st.querySelector('.play-stroop__word');
      const opts = st.querySelectorAll('.play-stroop__opt');
      const bar = st.querySelector('.play-stroop__timer > span');
      const opts0 = st.querySelector('.play-stroop__options');
      return {
        word: w ? w.textContent : null,
        color: w ? getComputedStyle(w).color : null,
        aria: w ? w.getAttribute('aria-label') : null,
        optCount: opts.length,
        optNames: Array.from(opts).map((b) => b.querySelector('.play-stroop__optname')?.textContent),
        barWidth: bar ? bar.style.width : null,
        cols: opts0 ? opts0.style.getPropertyValue('--stroop-cols') : null
      };
    });
    if (snap) items.push(snap);
    await page.screenshot({ path: `${OUT}/stroop-main-${i + 1}.png` });
    // پاسخ واقعی: نخستین گزینه — جلسه جلو می‌رود
    const b = page.locator('#play-stage .play-stroop__opt');
    if (await b.count()) await b.first().click().catch(() => {});
    await page.waitForTimeout(2600);
  }
  results.stroop = { reachedMain: got, items, shots: `${OUT}/stroop-main-*.png` };
  await page.close();
}

/* ── کنسول بازی‌ها: trail نباید در فهرست نسخه‌های بازیپذیر باشد؛ stroop1@1.1.0 باید باشد ── */
{
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') { consoleErrors++; console.log('[console.error console]', m.text().slice(0, 140)); } });
  await page.goto(BASE + '/#games');
  await page.waitForTimeout(2200);
  const body = await page.evaluate(() => document.body.innerText);
  results.console_has_trail = body.includes('رد پای دزد');
  results.console_has_stroop110 = body.includes('نسخهٔ ۱.۱.۰');
  writeFileSync(`${OUT}/console.txt`, body.slice(0, 3000), 'utf8');
  await page.close();
}

/* ── رگرسیون سریع چهار نوع دیگر: فقط رسیدن به جریان اصلی بدون خطای کنسول ── */
for (const l of LINKS.filter((x) => ['gonogo', 'numline', 'scan', 'flanker', 'nback'].includes(x.kind))) {
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') { consoleErrors++; console.log(`[console.error ${l.kind}]`, m.text().slice(0, 140)); } });
  page.on('pageerror', (e) => { consoleErrors++; console.log(`[pageerror ${l.kind}]`, String(e).slice(0, 140)); });
  await page.goto(l.url);
  const got = await reachMain(page);
  await page.screenshot({ path: `${OUT}/${l.kind}-main.png` });
  results[l.kind] = { reachedMain: got };
  await page.close();
}

await browser.close();
console.log('\n════════ RESULT ════════');
console.log(JSON.stringify(results, null, 1));
console.log('console_errors =', consoleErrors);
const s = results.stroop.items || [];
const incong = s.filter((x) => x.aria && x.aria.includes('نوشته‌شده با جوهرِ') && !x.aria.includes('واژهٔ ' + (x.word || '') + ' نوشته')).length;
console.log('stroop items captured =', s.length, '| option counts =', s.map((x) => x.optCount).join(','), '| cols =', s.map((x) => x.cols).join(','));
