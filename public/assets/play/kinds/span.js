/* ═══════════════════════════════════════════════════════════════
   kinds/span.js — بازی «حباب‌های عدد» (بازهٔ عدد رو به جلو) — G8/۱.۲۵.۴۸
   حباب‌های عدد در شبِ فانوس یکی‌یکی بالا می‌آیند؛ کودک همان عددها را
   با صفحه‌کلید بزرگ به ترتیب وارد می‌کند و ✓ می‌زند. اهرم سختی = شمار
   عددها (۳→۶) روی خود سرور (رجیستری/مرحله‌ها) — این ماژول فقط نمایش است.
   ماژول نمایش: حباب نمایش عدد + صفحهٔ ورود اسلات‌دار + صفحه‌کلید ۰..۹
   با پاک‌کن و ✓؛ نمایش عددها و جمع‌آوری ورود در session.js انجام
   می‌شود. نمره‌دهی فقط سمت سرور است؛ پاسخ {digits} سرور مقایسه می‌کند
   و کلید (item.correct) هرگز به این ماژول نمی‌رسد.
   هیچ درخواست شبکه‌ای ندارد؛ بی‌صدا؛ جنبش فقط از fx (§۹).
   پارادایم مرجع — Digit Span (Wechsler؛ استاندارد WAIS/بررسی‌های
   حافظهٔ کاری) — پیاده‌سازی اصیل و هم‌خانوادهٔ قرارداد ماژول‌های نوع
   این سامانه؛ هیچ کد بیرونی کپی نشده است. عددها به شکل لاتین (مطابق
   جادهٔ عددها — داخل جاده dir='ltr' است) و همهٔ متن فارسی اصیل‌اند
   (بدون هیچ دارایی بیرونی).
   ═══════════════════════════════════════════════════════════════ */

const INK = '#153E50';   /* Navy دفترچهٔ وظیفه — خط جوهری حباب و صفحه‌کلید */

/* جنبش تزئینی و صحنهٔ آموزش — همهٔ جنبش از fx با گارد کاهش‌جنبش؛ این ماژول هرگز مستقیم animate نمی‌کند */
import * as fx from '../fx.js';
import { sceneMarkup, kindHero } from '../scene.js';

const DEFAULT_PROMPT = 'عددها یکی‌یکی می‌آیند؛ همان‌ها را به ترتیب وارد کن.';

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

/** فانوس وکتوری — ستون نور نارنجیِ گرم روی شبِ فانوس (هویت پوسته) */
function lanternSvg() {
  return '<svg viewBox="0 0 100 130" aria-hidden="true">' +
    '<g stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M38 22 C38 14 44 8 50 8 C56 8 62 14 62 22 Z" fill="#E86F9E"/>' + /* سر فانوس */
      '<rect x="34" y="22" width="32" height="8" rx="3" fill="#E86F9E"/>' +
      '<path d="M36 30 L64 30 L68 78 L32 78 Z" fill="#F5D9A8"/>' + /* بدنهٔ شیشه‌ای روشن */
      '<path d="M40 34 L60 34 L62 74 L38 74 Z" fill="none" opacity="0.6"/>' +
      '<rect x="42" y="46" width="16" height="20" rx="4" fill="#F0B23E"/>' + /* شعله */
      '<path d="M32 78 L68 78 L66 90 L34 90 Z" fill="#E86F9E"/>' +
      '<path d="M44 90 L56 90 L54 104 L46 104 Z" fill="#B8537A"/>' +
      '<path d="M50 104 L50 118" fill="none"/>' +
      '<path d="M42 118 L58 118" fill="none"/>' +
    '</g>' +
    '</svg>';
}

/** کارت آزمون حباب‌های عدد — پرسش + حباب نمایش + نوار ورود + صفحه‌کلید (ورود پنهان شروع می‌شود) */
export function spanMarkup(item) {
  const stim = stimOf(item);
  const prompt = item.prompt && String(item.prompt).trim() !== '' ? esc(item.prompt) : DEFAULT_PROMPT;
  return '<div class="play-span">' +
    '<p class="play-span__prompt">' + prompt + '</p>' +
    '<div class="play-span__stage" aria-hidden="true">' +
      '<span class="play-span__lantern">' + lanternSvg() + '</span>' +
      '<span class="play-span__bubble" aria-live="polite"></span>' +
    '</div>' +
    '<div class="play-span__entry" aria-label="عددهای واردشده"></div>' +
    '<p class="play-span__status" aria-live="polite">با دقت نگاه کن...</p>' +
    keypadHtml() +
    '<div class="play-span__timer" aria-hidden="true"><span style="width:100%"></span></div>' +
    '</div>';
}

/** صفحه‌کلید بزرگ ۱..۹ + ۰ + پاک‌کن + ✓ — data-key قرارداد session.js است؛ ورود تا آغاز فاز ورود پنهان است */
function keypadHtml() {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  let html = '<div class="play-span__pad play-span__pad--hidden">';
  for (const k of keys) {
    html += '<button type="button" class="play-span__key" data-key="' + k + '" aria-label="' + faNum(k) + '">' + faNum(k) + '</button>';
  }
  html += '<button type="button" class="play-span__key play-span__key--zero" data-key="0" aria-label="صفر">۰</button>' +
    '<button type="button" class="play-span__key play-span__key--back" data-key="back" aria-label="پاک‌کردن">⌫</button>' +
    '<button type="button" class="play-span__key play-span__key--go" data-key="go" aria-label="ثبت">✓</button>' +
    '</div>';
  return html;
}

/** آغاز فاز ورود — صفحه‌کلید و نوار پنجره روشن می‌شوند؛ پیام «نوبت توست» */
export function spanBeginInput(stage, spanLen) {
  if (!stage) return;
  const pad = stage.querySelector('.play-span__pad');
  if (pad) pad.classList.remove('play-span__pad--hidden');
  const status = stage.querySelector('.play-span__status');
  if (status) status.textContent = 'نوبت توست! ' + faNum(spanLen) + ' عدد را به همان ترتیب وارد کن و ✓ بزن.';
  const bubble = stage.querySelector('.play-span__bubble');
  if (bubble) bubble.classList.add('play-span__bubble--wait');
}

/** نشان حقیقت — دنبالهٔ عدد درست از بازخورد سرور (CSV)؛ اسلات‌های نوار ورود پر می‌شوند */
export function spanRevealTruth(item, stage, answerDisplay) {
  if (typeof answerDisplay !== 'string' || answerDisplay.trim() === '') return null;
  const digits = answerDisplay.split(',').map((v) => Number(v.trim())).filter((v) => Number.isInteger(v) && v >= 0);
  const entryEl = stage && stage.querySelector ? stage.querySelector('.play-span__entry') : null;
  const status = stage && stage.querySelector ? stage.querySelector('.play-span__status') : null;
  if (status) status.textContent = 'ترتیب درست این بود:';
  if (!entryEl) return null;
  let html = '';
  for (const d of digits) {
    html += '<span class="play-span__slot play-span__slot--truth">' + faNum(d) + '</span>';
  }
  entryEl.innerHTML = html;
  const pad = stage.querySelector('.play-span__pad');
  if (pad) pad.classList.add('play-span__pad--hidden'); // صفحه‌کلید در آموزش حقیقت جمع می‌شود
  return entryEl;
}

/** مرکز نوار ورود برای انفجار ذرات موفقیت (fx.burstAt) */
export function spanResponsePoint(stage) {
  if (!stage || !stage.querySelector) return null;
  const el = stage.querySelector('.play-span__entry');
  if (!el || !el.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** SVG محرک برای پیش‌نمایش آموزش — حباب با عدد + فانوس */
export function stimSvg(stim) {
  const s = stim && typeof stim === 'object' ? stim : {};
  const d = Number.isInteger(s.d) && s.d >= 0 && s.d <= 9 ? s.d : 4;
  return '<div class="play-span play-span--sample">' +
    '<div class="play-span__stage" aria-hidden="true">' +
      '<span class="play-span__lantern">' + lanternSvg() + '</span>' +
      '<span class="play-span__bubble play-span__bubble--show">' + faNum(d) + '</span>' +
    '</div>' +
    '</div>';
}

/* ─── قدم‌های آموزش — ایستا؛ هیچ ردی از کلید بانک یا آیتم پروب ─── */

/** سه قدم آموزش روبه‌کودک — hint شکل سروری دارد (hint.span.{label, stim:{d}})؛ ناسالم = پیش‌فرض امن */
export function previewSteps(hint) {
  const h = hint && hint.span && typeof hint.span === 'object' ? hint.span : {};
  const rule = typeof h.label === 'string' && h.label.trim() !== '' ? h.label.trim() : DEFAULT_PROMPT;
  const s = h.stim && typeof h.stim === 'object' ? h.stim : {};
  const d = Number.isInteger(s.d) && s.d >= 0 && s.d <= 9 ? s.d : 4;
  return [
    { svg: stimSvg({ d }), line: rule },
    { svg: stimSvg({ d }), line: 'هر عدد کمی می‌ماند و می‌رود؛ جای‌خالی‌ها را در ذهنت پر نگه دار.' },
    { svg: stimSvg({ d }), line: 'بعد، همان عددها را به ترتیب با صفحه‌کلید وارد کن و ✓ بزن.' }
  ];
}

/* ═══════════════════════════════════════════════════════════════
   G8/۱.۲۵.۴۸ — کارت INTRO + تمرین تعاملی «تا موفقیت» (الگوی ن‌پشت):
   دو قدم — نخست یک عدد (قدم‌آموز با حباب ثابت)، بعد دو عدد با نمایش
   یکی‌یکی و ورود صفحه‌کلیدی. کارت‌های تمرین از پالت ثابت ماژول‌اند و
   هیچ کلیدی ندارند؛ کلید آیتم‌های واقعی فقط سمت سرور می‌ماند.
   ارزیابی هرگز تمرین تعاملی نمی‌بیند (C1).
   ═══════════════════════════════════════════════════════════════ */

/** کارت INTRO — نام + قانون یک‌خطی از راهنمای سرور؛ ناسالم = قانون امن ایستا */
export const intro = {
  name: 'حباب‌های عدد',
  rule: (hint) => {
    const h = hint && hint.span && typeof hint.span.label === 'string' ? hint.span.label.trim() : '';
    return h !== '' ? h : 'عددها یکی‌یکی می‌آیند؛ همان‌ها را به ترتیب وارد کن.';
  }
};

const SPAN_PRACTICE = {
  step1: 'این عدد ۴ است؛ روی دکمهٔ ۴ لمس کن.',
  step2: 'دو عدد می‌آیند؛ اول اولی، بعد دومی را به ترتیب وارد کن.',
  success: 'آفرین! حافظهٔ عددی داری.',
  retry: 'دوباره نگاه کن؛ اول عدد اول، بعد عدد دوم.',
  retryWait: 'هر وقت آماده بودی لمس کن؛ عجله‌ای نیست.',
  practiceDone: 'تمرین تمام شد! حالا شبِ واقعی فانوس باز می‌شود.'
};

const PRACTICE_WINDOW_MS = 25000;

/** صحنهٔ تمرین — دکور پس‌زمینهٔ شب فانوس؛ جنبش از fx؛ بی‌اثر برای پاسخ */
function decoratePractice(stage) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup('teach', { svg: kindHero('span') })); // قهرمان این بازی — پوستهٔ اختصاصی G8
  fx.sceneAmbient(stage);
}

/** یک لمس روی کلید مشخص — یا پنجرهٔ زمانی؛ خواب یدکی در هر دو مسیر cancel می‌شود */
function tapKeyWithin(stage, wantKey, ms, sleeper) {
  return new Promise((resolve) => {
    const pad = stage.querySelector('.play-span__pad');
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (pad) pad.removeEventListener('pointerdown', onTap);
      sleeper.cancel(); // خواب یدکی یتیم نمی‌ماند — قاعدهٔ پنجره
      resolve(ok === true);
    };
    const onTap = (ev) => {
      const key = ev.target.closest('[data-key]');
      if (!key) return;
      ev.preventDefault();
      finish(key.getAttribute('data-key') === String(wantKey));
    };
    if (pad) pad.addEventListener('pointerdown', onTap);
    sleeper.sleep(ms).then(() => finish(false));
  });
}

/** کارت تمرین — حباب + نوار ورود + صفحه‌کلید (الگوی آزمون، بی‌فانوس برای سبک‌تر بودن تمرین) */
function practiceCardHtml(badge, line, digit) {
  return (badge ? '<span class="play-step-badge">' + esc(badge) + '</span>' : '') +
    '<div class="play-span play-span--sample">' +
      '<p class="play-span__status">' + esc(line) + '</p>' +
      '<div class="play-span__stage" aria-hidden="true">' +
        '<span class="play-span__bubble' + (digit !== undefined ? ' play-span__bubble--show' : '') + '">' +
          (digit !== undefined ? faNum(digit) : '') + '</span>' +
      '</div>' +
      '<div class="play-span__entry" aria-label="عددهای واردشده"></div>' +
      keypadHtml() +
    '</div>';
}

/** آغاز فاز ورود در تمرین — همان قرارداد آزمون */
function beginPad(stage, line) {
  const pad = stage.querySelector('.play-span__pad');
  if (pad) pad.classList.remove('play-span__pad--hidden');
  const status = stage.querySelector('.play-span__status');
  if (status && line) status.textContent = line;
}

/**
 * تمرین تعاملی «حباب‌های عدد» — دو قدم با تکرار بی‌سرزنش تا موفقیت:
 *   قدم ۱: یک عدد ثابت در حباب (۴) → لمس ۴.
 *   قدم ۲: نمایش یکی‌یکی دو عدد (۳ سپس ۷) → ورود ۳ و ۷ به ترتیب.
 *   کارت‌های تمرین از پالت ثابت ماژول‌اند — کلید آیتم‌های بانک سرور نمی‌بیند.
 *   پس از دو تلاش، عدد درست آرام نشان داده می‌شود (آموزش پس از پاسخ).
 * خروجی: { applied, retries, go_retries: 0, nogo_retries: 0 } — صفرهای نام‌دار فقط
 *   برای سازگاری با قرارداد practiceRetries جلسه‌اند و تلاش واقعی در retries می‌آید.
 */
export async function practiceInteractive(ctx) {
  const { stage, sleeper, hint } = ctx || {};
  if (!stage || !sleeper) return { applied: false, retries: 0 };
  const h = hint && hint.span && typeof hint.span === 'object' ? hint.span : {};
  const s = h.stim && typeof h.stim === 'object' ? h.stim : {};
  const d1 = Number.isInteger(s.d) && s.d >= 0 && s.d <= 9 ? s.d : 4;
  const d2 = d1 === 3 ? 7 : 3; // عدد دوم تمرین — همیشه متفاوت از اولی
  let retries = 0;

  /* قدم ۱ — یک عدد ثابت؛ آشنایی با صفحه‌کلید */
  {
    let misses = 0;
    for (;;) {
      stage.className = 'play-stage';
      stage.classList.add('play-stage--teach');
      stage.innerHTML = practiceCardHtml('قدم ۱ از ۲', SPAN_PRACTICE.step1, d1);
      decoratePractice(stage);
      fx.revealStage(stage);
      beginPad(stage, null);
      const ok = await tapKeyWithin(stage, d1, PRACTICE_WINDOW_MS, sleeper);
      if (ok) {
        const status = stage.querySelector('.play-span__status');
        if (status) status.textContent = SPAN_PRACTICE.success;
        const el = stage.querySelector('.play-span__entry');
        if (el) el.innerHTML = '<span class="play-span__slot play-span__slot--filled">' + faNum(d1) + '</span>';
        const point = stage.querySelector('.play-span__entry');
        if (point) {
          const r = point.getBoundingClientRect();
          if (r.width) fx.burstAt(r.left + r.width / 2, r.top + r.height / 2);
        }
        await sleeper.sleep(1200);
        break;
      }
      retries += 1;
      misses += 1;
      const status = stage.querySelector('.play-span__status');
      if (status) status.textContent = misses >= 2 ? SPAN_PRACTICE.retryWait : SPAN_PRACTICE.retry;
      if (misses >= 2) {
        const key = stage.querySelector('.play-span__key[data-key="' + d1 + '"]');
        if (key) key.classList.add('play-span__key--truth');
      }
      await sleeper.sleep(1600);
    }
  }

  /* قدم ۲ — دو عدد یکی‌یکی؛ بازهٔ واقعی */
  {
    let misses = 0;
    for (;;) {
      stage.className = 'play-stage';
      stage.classList.add('play-stage--teach');
      stage.innerHTML = practiceCardHtml('قدم ۲ از ۲', SPAN_PRACTICE.step2, undefined);
      decoratePractice(stage);
      fx.revealStage(stage);
      /* پخش دو عدد — یکی‌یکی؛ همان قرارداد آزمون */
      const bubble = stage.querySelector('.play-span__bubble');
      for (const d of [d1, d2]) {
        if (bubble) {
          bubble.textContent = faNum(d);
          bubble.classList.add('play-span__bubble--show');
        }
        await sleeper.sleep(760);
        if (bubble) bubble.classList.remove('play-span__bubble--show');
        await sleeper.sleep(340);
      }
      beginPad(stage, 'نوبت توست! دو عدد را به همان ترتیب وارد کن و ✓ بزن.');
      const entryEl = stage.querySelector('.play-span__entry');
      if (entryEl) entryEl.innerHTML = '<span class="play-span__slot"></span><span class="play-span__slot"></span>';
      const picked = [];
      let done = false;
      const collect = new Promise((resolve) => {
        const pad = stage.querySelector('.play-span__pad');
        const onTap = (ev) => {
          const key = ev.target.closest('[data-key]');
          if (!key) return;
          ev.preventDefault();
          const k = key.getAttribute('data-key');
          if (k === 'back') { picked.pop(); if (entryEl) entryEl.innerHTML = '<span class="play-span__slot"></span><span class="play-span__slot"></span>'; return; }
          if (k === 'go') {
            if (!done) { done = true; if (pad) pad.removeEventListener('pointerdown', onTap); sleeper.cancel(); resolve(picked.slice()); }
            return;
          }
          if (picked.length < 2) {
            picked.push(Number(k));
            if (entryEl) entryEl.innerHTML = picked.map((v) => '<span class="play-span__slot play-span__slot--filled">' + faNum(v) + '</span>').join('') +
              (picked.length < 2 ? '<span class="play-span__slot"></span>' : '');
          }
        };
        if (pad) pad.addEventListener('pointerdown', onTap);
        sleeper.sleep(PRACTICE_WINDOW_MS).then(() => { if (!done) { done = true; if (pad) pad.removeEventListener('pointerdown', onTap); resolve(picked.slice()); } });
      });
      const entered = await collect;
      const ok = entered.length === 2 && entered[0] === d1 && entered[1] === d2;
      if (ok) {
        const status = stage.querySelector('.play-span__status');
        if (status) status.textContent = SPAN_PRACTICE.success;
        const point = stage.querySelector('.play-span__entry');
        if (point) {
          const r = point.getBoundingClientRect();
          if (r.width) fx.burstAt(r.left + r.width / 2, r.top + r.height / 2);
        }
        await sleeper.sleep(1200);
        break;
      }
      retries += 1;
      misses += 1;
      const status = stage.querySelector('.play-span__status');
      if (status) status.textContent = misses >= 2 ? SPAN_PRACTICE.retryWait : SPAN_PRACTICE.retry;
      if (misses >= 2) {
        if (entryEl) entryEl.innerHTML =
          '<span class="play-span__slot play-span__slot--truth">' + faNum(d1) + '</span>' +
          '<span class="play-span__slot play-span__slot--truth">' + faNum(d2) + '</span>';
      }
      await sleeper.sleep(1600);
    }
  }

  stage.className = 'play-stage';
  stage.classList.add('play-stage--teach');
  stage.innerHTML = '<p class="play-line">' + esc(SPAN_PRACTICE.practiceDone) + '</p>';
  decoratePractice(stage);
  fx.revealStage(stage);
  await sleeper.sleep(1600);
  stage.className = 'play-stage';
  stage.innerHTML = '';
  return { applied: true, retries, go_retries: 0, nogo_retries: 0 };
}

/** خلاصهٔ پایان جلسه — الگوی ن‌پشت با قاعدهٔ دامنهٔ صفر: جلسهٔ بی‌آزمون
 *  نمره‌خورده = '' (هیچ عدد ساختگی نمی‌آید)؛ فقط مسیر تمرین صدا می‌زند — ارزیابی
 *  هرگز عدد نمی‌بیند (C1). span_best (بازهٔ امروز) از دنباله‌های کاملِ درستِ
 *  رکوردهای موتور می‌آید؛ median_rt در این بازی فقط توصیفی است (ورود صفحه‌کلیدی). */
export function debriefMarkup(summary, extra) {
  const s = summary && typeof summary === 'object' ? summary : {};
  const total = s.scored_total ?? 0;
  const correct = s.scored_correct ?? 0;
  if (!Number.isFinite(total) || total <= 0) return '';
  const pct = Math.round((correct / total) * 100);
  let html = '<div class="play-debrief">' +
    '<p class="play-debrief__line">دقت امروزت در شب فانوس: ٪' + esc(faNum(pct)) + '</p>';
  if (Number.isFinite(s.span_best) && s.span_best > 0) {
    html += '<p class="play-debrief__line">بلندترین دنبالهٔ کامل امروزت: ' + esc(faNum(s.span_best)) + ' عدد</p>';
  }
  const retries = extra && Number.isFinite(extra.retries) ? extra.retries
    : (extra && Number.isFinite(extra.go_retries) && Number.isFinite(extra.nogo_retries)
      ? extra.go_retries + extra.nogo_retries : 0);
  if (retries > 0) {
    html += '<p class="play-debrief__muted">' + esc(faNum(retries)) + ' بار در تمرین از نو شروع کردی — و حالا آماده‌ای.</p>';
  }
  return html + '</div>';
}
