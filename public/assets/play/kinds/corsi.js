/* ═══════════════════════════════════════════════════════════════
   kinds/corsi.js — بازی «صدف‌های جادویی» (کرسی بلوک-تپینگ) — G8/۱.۲۵.۴۸
   صدف‌های خلیج مروارید یکی‌یکی روشن می‌شوند؛ کودک همان ترتیب را لمس
   می‌کند. اهرم سختی = طول دنباله (۲→۵) روی خود سرور (رجیستری/مرحله‌ها) —
   این ماژول فقط نمایش است.
   ماژول نمایش: شبکهٔ ۳×۳ صدف + پخش دنباله در session.js (فاز lit) +
   فاز یادآوری کودک؛ پایان دنباله با پرشدن شمار صدف‌ها یا پنجرهٔ پاسخ
   از stim.window_ms. نمره‌دهی فقط سمت سرور است؛ پاسخ {order} سرور
   مقایسه می‌کند و کلید (item.correct) هرگز به این ماژول نمی‌رسد.
   هیچ درخواست شبکه‌ای ندارد؛ بی‌صدا؛ جنبش فقط از fx (§۹).
   پارادایم مرجع — Corsi Block-Tapping (Corsi 1972؛ Kessels و همکاران
   ۲۰۰۰ — مرور استاندارد) — پیاده‌سازی اصیل و هم‌خانوادهٔ قرارداد
   ماژول‌های نوع این سامانه؛ هیچ کد بیرونی کپی نشده است. گرافیک
   وکتوری و همهٔ متن فارسی اصیل‌اند (بدون هیچ دارایی بیرونی).
   ═══════════════════════════════════════════════════════════════ */

const INK = '#153E50';   /* Navy دفترچهٔ وظیفه — خط جوهری صدف‌ها */

/* جنبش تزئینی و صحنهٔ آموزش — همهٔ جنبش از fx با گارد کاهش‌جنبش؛ این ماژول هرگز مستقیم animate نمی‌کند */
import * as fx from '../fx.js';
import { sceneMarkup, kindHero } from '../scene.js';

const DEFAULT_PROMPT = 'صدف‌ها یکی‌یکی روشن می‌شوند؛ همان ترتیب را لمس کن.';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function faNum(n) {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** stim آیتم — ناسالم = شیء خالی */
function stimOf(item) {
  return item && item.stim && typeof item.stim === 'object' ? item.stim : {};
}

/** دنبالهٔ صدف‌ها از stim — محرک عمومی بازی؛ ناسالم = خالی (markup امن می‌سازد) */
export function seqOf(item) {
  const stim = stimOf(item);
  if (!Array.isArray(stim.seq)) return [];
  return stim.seq.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= 0);
}

/** یک صدف وکتوری — کاسهٔ بستهٔ صدف با شیارهای شعاعی؛ حالت‌ها با کلاس CSS روشن می‌شوند */
function shellSvg(idx) {
  return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    /* بدنهٔ بادبزنی صدف */
    '<path class="play-corsi__shell-body" d="M50 88 C28 88 12 72 12 52 C12 34 24 20 42 14 L46 12 C48 11 52 11 54 12 L58 14 C76 20 88 34 88 52 C88 72 72 88 50 88 Z"/>' +
    /* شیارهای شعاعی — جوهر ناویر */
    '<g class="play-corsi__shell-ribs" fill="none" stroke="' + INK + '" stroke-width="2.5" stroke-linecap="round">' +
      '<path d="M50 84 L50 18"/>' +
      '<path d="M38 82 C34 62 32 42 38 20"/>' +
      '<path d="M62 82 C66 62 68 42 62 20"/>' +
      '<path d="M26 74 C24 56 26 38 34 22"/>' +
      '<path d="M74 74 C76 56 74 38 66 22"/>' +
    '</g>' +
    /* مروارید کوچک گوشهٔ صدف — فقط برای جلوهٔ صحنه */
    '<circle class="play-corsi__pearl" cx="50" cy="66" r="7"/>' +
    '</svg>';
}

/** شبکهٔ ۳×۳ صدف‌ها — data-idx قرارداد session.js است (اندیس ۰..۸) */
function gridHtml() {
  let html = '<div class="play-corsi__grid" aria-label="' + faNum(9) + ' صدف خلیج">';
  for (let i = 0; i < 9; i++) {
    html += '<button type="button" class="play-corsi__tile" data-idx="' + i + '" aria-label="صدف ' + faNum(i + 1) + '">' +
      shellSvg(i) + '</button>';
  }
  return html + '</div>';
}

/** کارت آزمون صدف‌ها — پرسش + شبکهٔ صدف + نوار پنجرهٔ پاسخ (فاز یادآوری روشن می‌شود) */
export function corsiMarkup(item) {
  const stim = stimOf(item);
  const prompt = item.prompt && String(item.prompt).trim() !== '' ? esc(item.prompt) : DEFAULT_PROMPT;
  const spanLen = Array.isArray(stim.seq) ? stim.seq.length : 0;
  return '<div class="play-corsi">' +
    '<p class="play-corsi__prompt">' + prompt + '</p>' +
    '<p class="play-corsi__status" aria-live="polite">با دقت نگاه کن...</p>' +
    gridHtml() +
    '<div class="play-corsi__timer" aria-hidden="true"><span style="width:100%"></span></div>' +
    '</div>';
}

/** آغاز فاز یادآوری — بعد از پخش دنباله؛ پیام «نوبت توست» + نوار پنجره زنده می‌شود */
export function corsiBeginRecall(stage, spanLen) {
  if (!stage) return;
  const status = stage.querySelector('.play-corsi__status');
  if (status) status.textContent = 'نوبت توست! ' + faNum(spanLen) + ' صدف را به همان ترتیب لمس کن.';
  const grid = stage.querySelector('.play-corsi__grid');
  if (grid) grid.classList.add('play-corsi__grid--recall');
}

/** نشان حقیقت — دنبالهٔ درست از بازخورد سرور (CSV اندیس‌ها)؛ صدف‌ها به ترتیب درست نشان‌گذاری می‌شوند */
export function corsiRevealTruth(item, stage, answerDisplay) {
  if (typeof answerDisplay !== 'string' || answerDisplay.trim() === '') return null;
  const idxs = answerDisplay.split(',').map((v) => Number(v.trim())).filter((v) => Number.isInteger(v) && v >= 0);
  const status = stage && stage.querySelector ? stage.querySelector('.play-corsi__status') : null;
  if (status) status.textContent = 'ترتیب درست این بود:';
  const tiles = stage && stage.querySelectorAll ? stage.querySelectorAll('.play-corsi__tile') : null;
  if (!tiles || tiles.length === 0) return null;
  idxs.forEach((i, order) => {
    const el = stage.querySelector('.play-corsi__tile[data-idx="' + i + '"]');
    if (el && el.classList) {
      el.classList.add('play-corsi__tile--truth');
      el.setAttribute('data-truth-order', String(order + 1)); // ترتیب نمایش برای دسترس‌پذیری/آموزش
    }
  });
  return tiles[0];
}

/** مرکز شبکه برای انفجار ذرات موفقیت (fx.burstAt) */
export function corsiResponsePoint(stage) {
  if (!stage || !stage.querySelector) return null;
  const el = stage.querySelector('.play-corsi__grid');
  if (!el || !el.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** SVG محرک برای پیش‌نمایش آموزش — دو صدف روشن (مهرهٔ قاعده) */
export function stimSvg(stim) {
  const s = stim && typeof stim === 'object' ? stim : {};
  const a = Number.isInteger(s.a) && s.a >= 0 && s.a <= 8 ? s.a : 1;
  const b = Number.isInteger(s.b) && s.b >= 0 && s.b <= 8 ? s.b : 5;
  return '<div class="play-corsi play-corsi--sample"><div class="play-corsi__grid">' +
    '<button type="button" class="play-corsi__tile play-corsi__tile--lit" data-idx="' + a + '">' + shellSvg(a) + '</button>' +
    '<button type="button" class="play-corsi__tile" data-idx="' + (a === 0 ? 1 : 0) + '">' + shellSvg(0) + '</button>' +
    '<button type="button" class="play-corsi__tile" data-idx="' + (a === 8 ? 7 : 8) + '">' + shellSvg(0) + '</button>' +
    '<button type="button" class="play-corsi__tile" data-idx="3">' + shellSvg(0) + '</button>' +
    '<button type="button" class="play-corsi__tile play-corsi__tile--lit" data-idx="' + b + '">' + shellSvg(0) + '</button>' +
    '<button type="button" class="play-corsi__tile" data-idx="5">' + shellSvg(0) + '</button>' +
    '<button type="button" class="play-corsi__tile" data-idx="6">' + shellSvg(0) + '</button>' +
    '<button type="button" class="play-corsi__tile" data-idx="7">' + shellSvg(0) + '</button>' +
    '<button type="button" class="play-corsi__tile" data-idx="8">' + shellSvg(0) + '</button>' +
    '</div></div>';
}

/* ─── قدم‌های آموزش — ایستا؛ هیچ ردی از کلید بانک یا آیتم پروب ─── */

/** سه قدم آموزش روبه‌کودک — hint شکل سروری دارد (hint.corsi.{label, stim:{a,b}})؛ ناسالم = پیش‌فرض امن */
export function previewSteps(hint) {
  const h = hint && hint.corsi && typeof hint.corsi === 'object' ? hint.corsi : {};
  const rule = typeof h.label === 'string' && h.label.trim() !== '' ? h.label.trim() : DEFAULT_PROMPT;
  const s = h.stim && typeof h.stim === 'object' ? h.stim : {};
  const a = Number.isInteger(s.a) && s.a >= 0 && s.a <= 8 ? s.a : 1;
  const b = Number.isInteger(s.b) && s.b >= 0 && s.b <= 8 ? s.b : 5;
  return [
    { svg: stimSvg({ a, b }), line: rule },
    { svg: stimSvg({ a, b }), line: 'صدف‌ها یکی‌یکی روشن می‌شوند؛ جای هر کدام را در ذهنت نگه دار.' },
    { svg: stimSvg({ a, b }), line: 'بعد از چشمک، همان ترتیب را لمس کن — اول روشن‌شدن اول، بعد دومی.' }
  ];
}

/* ═══════════════════════════════════════════════════════════════
   G8/۱.۲۵.۴۸ — کارت INTRO + تمرین تعاملی «تا موفقیت» (الگوی ن‌پشت):
   دو قدم — نخست دنبالهٔ دو صدفی با نمایش هم‌زمان (قدم‌آموز)، بعد
   دنبالهٔ دو صدفی با پخش واقعی یکی‌یکی. کارت‌های تمرین از پالت ثابت
   ماژول‌اند و هیچ کلیدی ندارند؛ کلید آیتم‌های واقعی فقط سمت سرور
   می‌ماند. ارزیابی هرگز تمرین تعاملی نمی‌بیند (C1).
   ═══════════════════════════════════════════════════════════════ */

/** کارت INTRO — نام + قانون یک‌خطی از راهنمای سرور؛ ناسالم = قانون امن ایستا */
export const intro = {
  name: 'صدف‌های جادویی',
  rule: (hint) => {
    const h = hint && hint.corsi && typeof hint.corsi.label === 'string' ? hint.corsi.label.trim() : '';
    return h !== '' ? h : 'صدف‌ها یکی‌یکی روشن می‌شوند؛ همان ترتیب را لمس کن.';
  }
};

const CORSI_PRACTICE = {
  step1: 'دو صدف روشن شدند؛ حالا تو همین دو تا را لمس کن.',
  step2: 'حالا دنباله یکی‌یکی چشمک می‌زند؛ به ترتیب لمسش کن.',
  success: 'آفرین! حافظهٔ خلیج داری.',
  retry: 'دوباره نگاه کن؛ اول صدفِ اول، بعد صدفِ دوم.',
  retryWait: 'هر وقت آماده بودی لمس کن؛ عجله‌ای نیست.',
  practiceDone: 'تمرین تمام شد! حالا خلیج واقعی صدف‌ها باز می‌شود.'
};

const PRACTICE_WINDOW_MS = 20000;

/** صحنهٔ تمرین — دکور پس‌زمینهٔ خلیج؛ جنبش از fx؛ بی‌اثر برای پاسخ */
function decoratePractice(stage) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup('teach', { svg: kindHero('corsi') })); // قهرمان این بازی — پوستهٔ اختصاصی G8
  fx.sceneAmbient(stage);
}

/** لمس دو صدف مشخص به ترتیب — یا پنجرهٔ زمانی؛ خواب یدکی در هر دو مسیر cancel می‌شود */
function tapTwoWithin(stage, wantA, wantB, ms, sleeper) {
  return new Promise((resolve) => {
    const tiles = Array.from(stage.querySelectorAll('.play-corsi__tile'));
    const picked = [];
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      tiles.forEach((b) => b.removeEventListener('pointerdown', onTap));
      sleeper.cancel(); // خواب یدکی یتیم نمی‌ماند — قاعدهٔ پنجرهٔ گو/نوگو
      resolve(ok === true);
    };
    const onTap = (ev) => {
      const btn = ev.target.closest('.play-corsi__tile');
      if (!btn || btn.classList.contains('play-corsi__tile--picked')) return;
      ev.preventDefault();
      btn.classList.add('play-corsi__tile--picked');
      picked.push(Number(btn.dataset.idx));
      if (picked.length >= 2) {
        finish(picked[0] === wantA && picked[1] === wantB);
      }
    };
    tiles.forEach((b) => b.addEventListener('pointerdown', onTap));
    sleeper.sleep(ms).then(() => finish(false));
  });
}

/** کارت تمرین — شبکهٔ صدف + پیام؛ حالت‌های روشن/انتخاب با کلاس */
function practiceCardHtml(badge, line) {
  return (badge ? '<span class="play-step-badge">' + esc(badge) + '</span>' : '') +
    '<div class="play-corsi play-corsi--sample">' +
      '<p class="play-corsi__status">' + esc(line) + '</p>' +
      gridHtml() +
    '</div>';
}

/** چشمک دو صدف پشت‌سرهم — پخش واقعی دنباله در تمرین؛ همهٔ صدف‌ها خاموش شروع می‌شوند */
async function flashTwo(stage, a, b, sleeper) {
  for (const idx of [a, b]) {
    const tileEl = stage.querySelector('.play-corsi__tile[data-idx="' + idx + '"]');
    if (tileEl) tileEl.classList.add('play-corsi__tile--lit');
    await sleeper.sleep(620);
    if (tileEl) tileEl.classList.remove('play-corsi__tile--lit');
    await sleeper.sleep(240);
  }
}

/** پاک‌کردن انتخاب‌ها برای تلاش دوباره */
function resetPicks(stage) {
  if (!stage || !stage.querySelectorAll) return;
  stage.querySelectorAll('.play-corsi__tile--picked').forEach((el) => el.classList.remove('play-corsi__tile--picked'));
}

/**
 * تمرین تعاملی «صدف‌های جادویی» — دو قدم با تکرار بی‌سرزنش تا موفقیت:
 *   قدم ۱: دو صدف هم‌زمان روشن (نشان‌گذاری آرام) → همان دو را لمس کن.
 *   قدم ۲: پخش واقعی یکی‌یکی → همان ترتیب را لمس کن.
 *   کارت‌های تمرین از پالت ثابت ماژول‌اند — کلید آیتم‌های بانک سرور نمی‌بیند.
 *   پس از دو تلاش، صدف‌های درست آرام نشان‌گذاری می‌شوند (آموزش پس از پاسخ).
 * خروجی: { applied, retries, go_retries: 0, nogo_retries: 0 } — صفرهای نام‌دار فقط
 *   برای سازگاری با قرارداد practiceRetries جلسه‌اند و تلاش واقعی در retries می‌آید.
 */
export async function practiceInteractive(ctx) {
  const { stage, sleeper, hint } = ctx || {};
  if (!stage || !sleeper) return { applied: false, retries: 0 };
  const h = hint && hint.corsi && typeof hint.corsi === 'object' ? hint.corsi : {};
  const s = h.stim && typeof h.stim === 'object' ? h.stim : {};
  const a = Number.isInteger(s.a) && s.a >= 0 && s.a <= 8 ? s.a : 1;
  const b = Number.isInteger(s.b) && s.b >= 0 && s.b <= 8 ? s.b : 5;
  let retries = 0;

  /* قدم ۱ — دو صدف هم‌زمان روشن (مهرهٔ قاعده؛ آسان) */
  {
    let misses = 0;
    for (;;) {
      stage.className = 'play-stage';
      stage.classList.add('play-stage--teach');
      stage.innerHTML = practiceCardHtml('قدم ۱ از ۲', CORSI_PRACTICE.step1);
      decoratePractice(stage);
      fx.revealStage(stage);
      const ta = stage.querySelector('.play-corsi__tile[data-idx="' + a + '"]');
      const tb = stage.querySelector('.play-corsi__tile[data-idx="' + b + '"]');
      if (ta) ta.classList.add('play-corsi__tile--lit');
      if (tb) tb.classList.add('play-corsi__tile--lit');
      const ok = await tapTwoWithin(stage, a, b, PRACTICE_WINDOW_MS, sleeper);
      if (ok) {
        const status = stage.querySelector('.play-corsi__status');
        if (status) status.textContent = CORSI_PRACTICE.success;
        if (ta) ta.classList.remove('play-corsi__tile--lit');
        if (tb) tb.classList.remove('play-corsi__tile--lit');
        if (ta) ta.classList.add('play-corsi__tile--picked');
        if (tb) tb.classList.add('play-corsi__tile--picked');
        const el = stage.querySelector('.play-corsi__grid');
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width) fx.burstAt(r.left + r.width / 2, r.top + r.height / 2);
        }
        await sleeper.sleep(1200);
        break;
      }
      retries += 1;
      misses += 1;
      resetPicks(stage);
      const status = stage.querySelector('.play-corsi__status');
      if (status) status.textContent = misses >= 2 ? CORSI_PRACTICE.retryWait : CORSI_PRACTICE.retry;
      if (misses >= 2) {
        if (ta) { ta.classList.add('play-corsi__tile--truth'); ta.setAttribute('data-truth-order', '1'); }
        if (tb) { tb.classList.add('play-corsi__tile--truth'); tb.setAttribute('data-truth-order', '2'); }
      }
      await sleeper.sleep(1600);
    }
  }

  /* قدم ۲ — پخش واقعی یکی‌یکی و یادآوری */
  {
    let misses = 0;
    for (;;) {
      stage.className = 'play-stage';
      stage.classList.add('play-stage--teach');
      stage.innerHTML = practiceCardHtml('قدم ۲ از ۲', CORSI_PRACTICE.step2);
      decoratePractice(stage);
      fx.revealStage(stage);
      await flashTwo(stage, a, b, sleeper);
      const status = stage.querySelector('.play-corsi__status');
      if (status) status.textContent = 'نوبت توست! دو صدف را به همان ترتیب لمس کن.';
      const ok = await tapTwoWithin(stage, a, b, PRACTICE_WINDOW_MS, sleeper);
      if (ok) {
        const done = stage.querySelector('.play-corsi__status');
        if (done) done.textContent = CORSI_PRACTICE.success;
        const el = stage.querySelector('.play-corsi__grid');
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width) fx.burstAt(r.left + r.width / 2, r.top + r.height / 2);
        }
        await sleeper.sleep(1200);
        break;
      }
      retries += 1;
      misses += 1;
      resetPicks(stage);
      const again = stage.querySelector('.play-corsi__status');
      if (again) again.textContent = misses >= 2 ? CORSI_PRACTICE.retryWait : CORSI_PRACTICE.retry;
      if (misses >= 2) {
        const ta = stage.querySelector('.play-corsi__tile[data-idx="' + a + '"]');
        const tb = stage.querySelector('.play-corsi__tile[data-idx="' + b + '"]');
        if (ta) { ta.classList.add('play-corsi__tile--truth'); ta.setAttribute('data-truth-order', '1'); }
        if (tb) { tb.classList.add('play-corsi__tile--truth'); tb.setAttribute('data-truth-order', '2'); }
      }
      await sleeper.sleep(1600);
    }
  }

  stage.className = 'play-stage';
  stage.classList.add('play-stage--teach');
  stage.innerHTML = '<p class="play-line">' + esc(CORSI_PRACTICE.practiceDone) + '</p>';
  decoratePractice(stage);
  fx.revealStage(stage);
  await sleeper.sleep(1600);
  stage.className = 'play-stage';
  stage.innerHTML = '';
  return { applied: true, retries, go_retries: 0, nogo_retries: 0 };
}

/** خلاصهٔ پایان جلسه — الگوی ن‌پشت با قاعدهٔ دامنهٔ صفر: جلسهٔ بی‌آزمون
 *  نمره‌خورده = '' (هیچ عدد ساختگی نمی‌آید)؛ فقط مسیر تمرین صدا می‌زند — ارزیابی
 *  هرگز عدد نمی‌بیند (C1). ورودی از session.js ساخته می‌شود و فقط دادهٔ مجاز
 *  کلاینت را می‌بیند: scored_total/scored_correct از بازخورد سرور، median_rt از رکورد موتور؛
 *  span_best (بازهٔ امروز) از دنباله‌های کاملِ درستِ رکوردهای موتور می‌آید. */
export function debriefMarkup(summary, extra) {
  const s = summary && typeof summary === 'object' ? summary : {};
  const total = s.scored_total ?? 0;
  const correct = s.scored_correct ?? 0;
  if (!Number.isFinite(total) || total <= 0) return '';
  const pct = Math.round((correct / total) * 100);
  let html = '<div class="play-debrief">' +
    '<p class="play-debrief__line">دقت امروزت در خلیج صدف‌ها: ٪' + esc(faNum(pct)) + '</p>';
  if (Number.isFinite(s.span_best) && s.span_best > 0) {
    html += '<p class="play-debrief__line">بلندترین دنبالهٔ کامل امروزت: ' + esc(faNum(s.span_best)) + ' صدف</p>';
  }
  if (Number.isFinite(s.median_rt) && s.median_rt > 0) {
    html += '<p class="play-debrief__muted">میانهٔ زمان نخستین لمس‌هایت: ' +
      esc(faNum(Math.round(s.median_rt / 100) / 10)) + ' ثانیه</p>';
  }
  const retries = extra && Number.isFinite(extra.retries) ? extra.retries
    : (extra && Number.isFinite(extra.go_retries) && Number.isFinite(extra.nogo_retries)
      ? extra.go_retries + extra.nogo_retries : 0);
  if (retries > 0) {
    html += '<p class="play-debrief__muted">' + esc(faNum(retries)) + ' بار در تمرین از نو شروع کردی — و حالا آماده‌ای.</p>';
  }
  return html + '</div>';
}
