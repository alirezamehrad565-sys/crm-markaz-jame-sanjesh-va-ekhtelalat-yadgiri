// حسابرسی فاز-به-فاز جلسهٔ کودک (بعد از ۱.۲۵.۴۶) — پاسخ به «بیشتر روی هر بازی کلیک کن؛ مرحله و فاز بعد»
// برای هر نوع: والد → INTRO → کارت مرحله → تمرین (میانه/بازخورد) → اجرای اصلی → کارت پایان → پس‌گفت والد
// سه زمینه: پرترهٔ ۳۹۰×۸۴۴ (تمام فازها) + ریز ۳۶۰×۶۴۰ و افقی ۸۴۴×۳۹۰ (فازهای کلیدی)
// خروجی فقط /tmp/shots-phases (هرگز داخل مخزن) — جفت: seed-skins-audit.mjs + shots-pixelcheck.py
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const BASE = 'http://localhost:8787';
const OUT = process.env.SHOTS_DIR || '/tmp/shots-phases';
const CONTEXTS = (process.env.PHASE_CONTEXTS || 'portrait,small,landscape').split(',');
mkdirSync(OUT, { recursive: true });

const LINKS = readFileSync(process.env.LINKS_FILE || '/tmp/links.txt', 'utf8').trim().split('\n').map((l) => {
  const [kind, url] = l.split('|');
  return { kind, url: url.replace('https://center-system.sanjeshm.workers.dev', BASE) };
}).filter((l) => !process.env.PHASE_KINDS || process.env.PHASE_KINDS.split(',').includes(l.kind));

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CTX = {
  portrait: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ua: UA, all: true },
  small: { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, ua: UA, all: false },
  landscape: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, ua: UA, all: false }
};

const browser = await chromium.launch();
const errors = [];
async function openPage(ctxCfg, tag) {
  const ctx = await browser.newContext({
    viewport: ctxCfg.viewport, hasTouch: ctxCfg.hasTouch, isMobile: ctxCfg.isMobile, userAgent: ctxCfg.ua
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${tag}] ${String(e).slice(0, 160)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text().slice(0, 160)}`); });
  return { ctx, page };
}

async function shoot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('  📸 ' + name);
}

const FA_DIGITS = { '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9 };

/* وضعیت فعلی #play-stage را می‌خواند */
async function phaseOf(page) {
  return page.evaluate(() => {
    const st = document.getElementById('play-stage');
    if (!st) return { phase: 'nostage', text: '' };
    const cls = st.className || '';
    const t = (st.textContent || '').slice(0, 500);
    const hold = t.includes('لمس نکن') || t.includes('دستت را نگه');
    const chipEl = st.querySelector('.play-numline__chip');
    const chip = chipEl ? chipEl.textContent.trim() : null;
    /* INTRO اول از همه — کارت معرفی با کلاس --teach هم رندر می‌شود (رفع شات جامانِ intro) */
    if (st.querySelector('.play-intro__name') || (t.includes('سلام') && t.includes('لمس کن'))) {
      return { phase: 'intro', text: t, hold, chip };
    }
    if (cls.includes('play-stage--end')) return { phase: 'end', text: t, hold, chip };
    if (cls.includes('play-stage--main')) return { phase: 'main', text: t, hold, chip };
    if (cls.includes('play-stage--teach')) {
      if (t.includes('مرحلهٔ') && t.includes('از')) return { phase: 'stage-card', text: t, hold, chip };
      return { phase: 'practice', text: t, hold, chip };
    }
    return { phase: 'other', text: t, hold, chip };
  });
}

/* لمس مرکز صحنه برای بازی‌های گزارش-لمسی (گونوگو/اسکن) وقتی دکمه‌ای نیست */
async function tapCenter(page) {
  await page.evaluate(() => {
    const st = document.getElementById('play-stage');
    if (!st) return;
    const r = st.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) || st;
    ['pointerdown', 'pointerup'].forEach((ty) => el.dispatchEvent(new PointerEvent(ty, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
    })));
  });
}

/* حلقهٔ تعامل: مثل کودک عمل می‌کند — «لمس نکن» = دست نگه‌دار؛ عدد راه = برچسب همان عدد؛
   بقیه = دکمهٔ مرئی؛ هیچ‌کدام نبود = لمس مرکز برای بازی‌های گزارش-لمسی */
async function walk(page, kind, prefix, { maxTicks = 300, tickMs = 650, allPhases = true }) {
  const KEY = allPhases
    ? ['intro', 'stage-card', 'practice', 'main', 'end']
    : ['intro', 'main', 'end'];
  const seen = new Set();
  const SETTLE = ['intro', 'stage-card', 'end']; // کارت‌ها با fx.reveal/popIn محو-ظاهر می‌شوند — پس از آرام‌گرفتن شات بگیر
  const shot = async (ph) => {
    if (!KEY.includes(ph) || seen.has(ph)) return;
    seen.add(ph);
    if (SETTLE.includes(ph)) await page.waitForTimeout(600); // fade ≈۴۰۰ms تمام شود — کارت خالی ثبت نشود
    return shoot(page, `${prefix}-${ph}`);
  };
  const mainShots = [];
  let practiceTicks = 0;
  let endReached = false;

  for (let i = 0; i < maxTicks && !endReached; i++) {
    const ph = await phaseOf(page);
    if (process.env.PHASE_DEBUG) console.log(`    [${i}] ${ph.phase} cls-hold=${ph.hold} chip=${ph.chip ?? '-'}`);
    if (ph.phase === 'end') {
      await shot('end'); // شات‌ها باید await شوند — وگرنه تعاملِ همان تیک قبل از فریم کارت را پاک می‌کند
      endReached = true;
      break;
    }
    if (ph.phase === 'stage-card') await shot('stage-card');
    else if (ph.phase === 'practice') {
      await shot('practice');
      practiceTicks++;
      if (practiceTicks === 3) await shoot(page, `${prefix}-practice-mid`);
      if (practiceTicks === 7) await shoot(page, `${prefix}-practice-late`);
    } else if (ph.phase === 'intro') await shot('intro');
    else if (ph.phase === 'main') {
      if (!seen.has('main')) await shot('main');
      else {
        mainShots.push(1);
        if (mainShots.length === 5) await shoot(page, `${prefix}-main-2`);
        if (mainShots.length === 10) await shoot(page, `${prefix}-main-3`);
      }
    }

    if (ph.hold) { /* «لمس نکن» — دست نگه‌دار، فقط صبر */ }
    else {
      let done = false;
      // راه عددی (هر فاز): چیپ هدف را می‌خواند و همان عدد را روی جاده لمس می‌کند
      const chipDig = ph.chip ? (ph.chip.match(/[\u06F0-\u06F9]/) || [null])[0] : null;
      if (chipDig) { // آیتم‌های train حلقه کلاس خام دارند — محدود به تمرین نیست
        const lab = page.locator(`.play-numline__lab:text-is("${chipDig}")`);
        if (await lab.count().catch(() => 0)) {
          await lab.first().click({ timeout: 700 }).catch(() => {});
          done = true;
        }
      }
      // پاسخ‌های authored تمرین‌ها — ثابت در kinds/*.js (آموزش قدم‌نما)
      if (!done && (ph.phase === 'practice' || ph.phase === 'other')) {
        done = await kindPractice(page, kind, ph);
      }
      if (!done) {
        const btn = page.locator('#play-stage button:visible, #play-root button:visible');
        const n = await btn.count().catch(() => 0);
        if (n) {
          // چرخش بین همهٔ دکمه‌های مرئی (کاشی‌های اسکن/گزینه‌های چندتایی) — نه همیشه اولی
          await btn.nth(i % n).click({ timeout: 700 }).catch(() => {});
        } else {
          await tapCenter(page);
        }
      }
    }
    await page.waitForTimeout(tickMs);
  }
  if (!endReached) await shoot(page, `${prefix}-stuck-${(await phaseOf(page)).phase}`);
  return endReached;
}

/* پاسخ درست تمرین هر نوع — از کد authored kinds/*.js خوانده شده (قدم‌نماهای ثابت) */
async function kindPractice(page, kind, ph) {
  const t = ph.text || '';
  if (kind === 'scan') {
    // جاسوس‌ها = کاشی ۰ و ۲؛ سپس «گزارش بده!»
    const t0 = page.locator('.play-scan__tile[data-idx="0"]');
    const t2 = page.locator('.play-scan__tile[data-idx="2"]');
    if (await t0.count().catch(() => 0)) {
      await t0.click({ timeout: 500 }).catch(() => {});
      await page.waitForTimeout(150);
      await t2.click({ timeout: 500 }).catch(() => {});
      await page.waitForTimeout(150);
      const conf = page.locator('.play-scan__confirm');
      if (await conf.count().catch(() => 0)) await conf.first().click({ timeout: 500 }).catch(() => {});
      return true;
    }
    return false;
  }
  if (kind === 'nback') {
    // قدم ۱ → «همان است» (اندیس ۰)؛ قدم ۲ → «فرق دارد» (اندیس ۱)
    const opts = page.locator('.play-nback__opt');
    if (await opts.count().catch(() => 0) >= 2) {
      const want = t.includes('قدم ۲') ? 1 : 0;
      await opts.nth(want).click({ timeout: 500 }).catch(() => {});
      return true;
    }
    return false;
  }
  if (kind === 'stroop') {
    // هر دو قدم: گزینهٔ هم‌رنگ جوهر = گزینهٔ اول
    const opt = page.locator('.play-stroop__opt');
    if (await opt.count().catch(() => 0)) {
      await opt.first().click({ timeout: 500 }).catch(() => {});
      return true;
    }
    return false;
  }
  if (kind === 'flanker') {
    // هر دو قدم: جهت وسط L → دکمهٔ اول
    const ans = page.locator('.play-flanker__answers button');
    if (await ans.count().catch(() => 0)) {
      await ans.first().click({ timeout: 500 }).catch(() => {});
      return true;
    }
    return false;
  }
  return false;
}

for (const { kind, url } of LINKS) {
  console.log('=== ' + kind + ' ===');
  for (const name of CONTEXTS.map((c) => c.trim()).filter(Boolean)) {
    const cfg = CTX[name];
    if (!cfg) continue;
    const tag = kind + '/' + name;
    const { ctx, page } = await openPage(cfg, tag);
    const prefix = `${kind}-${name}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      if (name === 'portrait') await shoot(page, `${prefix}-parent`);
      const start = page.locator('#btn-start');
      if (await start.count()) await start.first().click();
      await page.waitForTimeout(1400);
      const ok = await walk(page, kind, prefix, { allPhases: cfg.all });
      console.log(`  ${name}: ${ok ? 'full walk ✅' : 'incomplete ⚠️'}`);
      // پس‌گفت والد (فقط پرتره): اول «اتمام» را می‌زنیم تا گیت واقعی والد بیاید، بعد شات
      if (name === 'portrait') {
        let gateShot = false;
        for (let i = 0; i < 14; i++) {
          const b = page.locator('#play-root button:visible, #play-stage button:visible');
          if (!(await b.count().catch(() => 0))) break;
          await b.first().click({ timeout: 800 }).catch(() => {});
          await page.waitForTimeout(600);
          if (!gateShot && (await phaseOf(page)).phase !== 'end') {
            await shoot(page, `${prefix}-parent-gate`).catch(() => {});
            gateShot = true;
          }
        }
        const closed = await page.evaluate(() => (document.body.textContent || '').includes('بسته') || (document.body.textContent || '').includes('مرسی'));
        if (closed) console.log('  parent debrief closed ✅');
      }
    } catch (e) {
      console.log(`  ${name} fail: ` + String(e).slice(0, 150));
      await shoot(page, `${prefix}-error`).catch(() => {});
    }
    await ctx.close();
  }
}

await browser.close();
if (errors.length) {
  console.log('\n── console/page errors (' + errors.length + ') ──');
  [...new Set(errors)].slice(0, 12).forEach((e) => console.log('  ' + e));
} else {
  console.log('\n✅ صفر خطای کنسول در همهٔ زمینه‌ها');
}
console.log('DONE — shots in ' + OUT);
