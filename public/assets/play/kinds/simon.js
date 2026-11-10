/* ═══════════════════════════════════════════════════════════════
   kinds/simon.js — بازی «هم‌صداها» (تقلید متوالی — سیمون) — ۱.۲۵.۵۲
   چهار دوستِ ساحل (ماهی/خرچنگ/ستاره/عروس دریایی) یکی‌یکی با نور
   «آواز» می‌خوانند؛ کودک همان ترتیب را هم‌صدا لمس می‌کند.
   اهرم سختی = طول دنباله (۲→۶) + سرعت پخش (تندشونده) — هر دو
   authored روی خود سرور (بانک/مرحله‌ها) — این ماژول فقط نمایش است.
   ماژول نمایش: شبکهٔ ۲×۲ دوستان + پخش دنباله در session.js (فاز نور)
   + فاز یادآوری کودک؛ پایان دنباله با پُرشدن شمار لمس‌ها یا پنجرهٔ
   پاسخ از stim.window_ms. نمره‌دهی فقط سمت سرور است؛ پاسخ {order}
   سرور مقایسه می‌کند و کلید (item.correct) هرگز به این ماژول نمی‌رسد.
   هیچ درخواست شبکه‌ای ندارد؛ بی‌صدا؛ جنبش فقط از fx (§۹).
   پارادایم مرجع — بازی سیمون/MIMM (تقلید متوالی؛ حافظهٔ ترتیب با
   تکرار مجازِ غیرمجاور) — پیاده‌سازی اصیل و هم‌خانوادهٔ قرارداد
   ماژول‌های نوع این سامانه (الگوی kinds/corsi.js)؛ هیچ کد بیرونی
   کپی نشده است. گرافیک وکتوری و همهٔ متن فارسی اصیل‌اند.
   ═══════════════════════════════════════════════════════════════ */

const INK = '#153E50';   /* Navy دفترچهٔ وظیفه — خط جوهری دوستان */

/* جنبش تزئینی و صحنهٔ آموزش — همهٔ جنبش از fx با گارد کاهش‌جنبش؛ این ماژول هرگز مستقیم animate نمی‌کند */
import * as fx from '../fx.js';
import { sceneMarkup, kindHero } from '../scene.js';

const DEFAULT_PROMPT = 'دوستان یکی‌یکی نور می‌گیرند؛ همان ترتیب را لمس کن.';

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

/** دنبالهٔ هم‌صداها از stim — محرک عمومی بازی؛ ناسالم = خالی (markup امن می‌سازد) */
export function seqOf(item) {
  const stim = stimOf(item);
  if (!Array.isArray(stim.seq)) return [];
  return stim.seq.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= 0 && v <= 3);
}

/** چهار دوست ساحل — وکتور ساختاری؛ رنگ هر دوست از پوسته (skins/simon.css) می‌آید.
 *  اندیس ۰ ماهی · ۱ خرچنگ · ۲ ستاره‌دریایی · ۳ عروس دریایی */
function buddySvg(idx) {
  if (idx === 1) {
    /* خرچنگ — بدنهٔ گرد + دو پنجه */
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<g class="play-simon__limbs" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linecap="round">' +
        '<path d="M30 52 C20 48 14 40 16 32"/>' +
        '<path d="M70 52 C80 48 86 40 84 32"/>' +
        '<path d="M34 74 L28 84 M44 78 L42 88 M56 78 L58 88 M66 74 L72 84"/>' +
      '</g>' +
      '<path class="play-simon__body" d="M28 58 a22 19 0 1 1 44 0 a22 19 0 1 1 -44 0 Z"/>' +
      '<g fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round">' +
        '<circle cx="43" cy="55" r="2.6"/>' +
        '<circle cx="57" cy="55" r="2.6"/>' +
        '<path d="M46 64 Q50 68 54 64"/>' +
        '<path d="M36 42 Q40 34 46 40 M64 42 Q60 34 54 40"/>' +
      '</g>' +
      '</svg>';
  }
  if (idx === 2) {
    /* ستارهٔ دریایی — پنج‌پر با دکمه‌های گوهر */
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<path class="play-simon__body" d="M50 12 L60 38 L88 40 L66 57 L74 85 L50 69 L26 85 L34 57 L12 40 L40 38 Z"/>' +
      '<g fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round">' +
        '<circle cx="50" cy="52" r="3.4"/>' +
        '<circle cx="38" cy="46" r="2.2"/>' +
        '<circle cx="62" cy="46" r="2.2"/>' +
        '<path d="M43 62 Q50 68 57 62"/>' +
      '</g>' +
      '</svg>';
  }
  if (idx === 3) {
    /* عروس دریایی — گنبد + چهار پاهای موجی */
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<path class="play-simon__body" d="M24 52 a26 26 0 0 1 52 0 l0 6 l-52 0 Z"/>' +
      '<g class="play-simon__limbs" fill="none" stroke-width="3.4" stroke-linecap="round">' +
        '<path d="M34 62 C30 72 38 78 34 88"/>' +
        '<path d="M45 64 C41 74 49 80 45 90"/>' +
        '<path d="M56 64 C52 74 60 80 56 90"/>' +
        '<path d="M67 62 C63 72 71 78 67 88"/>' +
      '</g>' +
      '<g fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round">' +
        '<circle cx="41" cy="46" r="2.8"/>' +
        '<circle cx="59" cy="46" r="2.8"/>' +
        '<path d="M46 54 Q50 58 54 54"/>' +
      '</g>' +
      '</svg>';
  }
  /* اندیس ۰ — ماهی (پیش‌فرض اندیس ناسالم هم همین است) */
  return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<path class="play-simon__body" d="M22 50 C32 34 56 28 70 38 L74 41 L88 32 L90 42 L84 50 L90 58 L88 68 L74 59 L70 62 C56 72 32 66 22 50 Z"/>' +
    '<g fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round">' +
      '<circle cx="64" cy="46" r="3"/>' +
      '<path d="M36 42 Q42 32 50 40 M36 58 Q42 68 50 60"/>' +
    '</g>' +
    '</svg>';
}

const BUDDY_NAMES = ['ماهی', 'خرچنگ', 'ستارهٔ دریایی', 'عروس دریایی'];

/** شبکهٔ ۲×۲ دوستان — data-idx قرارداد session.js است (اندیس ۰..۳) */
function gridHtml() {
  let html = '<div class="play-simon__grid" aria-label="چهار دوست هم‌صدا">';
  for (let i = 0; i < 4; i++) {
    html += '<button type="button" class="play-simon__pad play-simon__pad--' + i + '" data-idx="' + i + '" aria-label="' + BUDDY_NAMES[i] + '">' +
      buddySvg(i) + '</button>';
  }
  return html + '</div>';
}

/** کارت آزمون هم‌صداها — پرسش + شبکهٔ دوستان + نوار پنجرهٔ پاسخ (فاز یادآوری روشن می‌شود) */
export function simonMarkup(item) {
  const stim = stimOf(item);
  const prompt = item.prompt && String(item.prompt).trim() !== '' ? esc(item.prompt) : DEFAULT_PROMPT;
  const seqLen = Array.isArray(stim.seq) ? stim.seq.length : 0;
  return '<div class="play-simon">' +
    '<p class="play-simon__prompt">' + prompt + '</p>' +
    '<p class="play-simon__status" aria-live="polite">با دقت نگاه کن...</p>' +
    gridHtml() +
    '<p class="play-simon__count" aria-hidden="true">' + faNum(seqLen) + ' دوست در این آواز</p>' +
    '<div class="play-simon__timer" aria-hidden="true"><span style="width:100%"></span></div>' +
    '</div>';
}

/** آغاز فاز یادآوری — بعد از پخش دنباله؛ پیام «نوبت توست» + شبکه زنده می‌شود */
export function simonBeginRecall(stage, seqLen) {
  if (!stage) return;
  const status = stage.querySelector('.play-simon__status');
  if (status) status.textContent = 'نوبت توست! ' + faNum(seqLen) + ' دوست را به همان ترتیب لمس کن.';
  const grid = stage.querySelector('.play-simon__grid');
  if (grid) grid.classList.add('play-simon__grid--recall');
}

/** نشان حقیقت — دنبالهٔ درست از بازخورد سرور (CSV اندیس‌ها)؛ دوستان به ترتیب درست نشان‌گذاری می‌شوند */
export function simonRevealTruth(item, stage, answerDisplay) {
  if (typeof answerDisplay !== 'string' || answerDisplay.trim() === '') return null;
  const idxs = answerDisplay.split(',').map((v) => Number(v.trim())).filter((v) => Number.isInteger(v) && v >= 0);
  const status = stage && stage.querySelector ? stage.querySelector('.play-simon__status') : null;
  if (status) status.textContent = 'ترتیب درست این بود:';
  const pads = stage && stage.querySelectorAll ? stage.querySelectorAll('.play-simon__pad') : null;
  if (!pads || pads.length === 0) return null;
  idxs.forEach((i, order) => {
    const el = stage.querySelector('.play-simon__pad[data-idx="' + i + '"]');
    if (el && el.classList) {
      el.classList.add('play-simon__pad--truth');
      el.setAttribute('data-truth-order', String(order + 1)); // ترتیب نمایش برای دسترس‌پذیری/آموزش
    }
  });
  return pads[0];
}

/** مرکز شبکه برای انفجار ذرات موفقیت (fx.burstAt) */
export function simonResponsePoint(stage) {
  if (!stage || !stage.querySelector) return null;
  const el = stage.querySelector('.play-simon__grid');
  if (!el || !el.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** دو اندیس ناسالم → جفت امن پیش‌فرض (دو دوست متفاوت) */
function padPair(stim) {
  const a = Number.isInteger(stim.a) && stim.a >= 0 && stim.a <= 3 ? stim.a : 0;
  let b = Number.isInteger(stim.b) && stim.b >= 0 && stim.b <= 3 ? stim.b : 2;
  if (b === a) b = a === 3 ? 0 : a + 1;
  return [a, b];
}

/** SVG محرک برای پیش‌نمایش آموزش — دو دوستِ روشن (مهرهٔ قاعده) */
export function stimSvg(stim) {
  const [a, b] = padPair(stim && typeof stim === 'object' ? stim : {});
  let html = '<div class="play-simon play-simon--sample"><div class="play-simon__grid">';
  for (let i = 0; i < 4; i++) {
    const lit = i === a || i === b ? ' play-simon__pad--lit' : '';
    html += '<button type="button" class="play-simon__pad play-simon__pad--' + i + lit + '" data-idx="' + i + '">' + buddySvg(i) + '</button>';
  }
  return html + '</div></div>';
}

/* ─── قدم‌های آموزش — ایستا؛ هیچ ردی از کلید بانک یا آیتم پروب ─── */

/** سه قدم آموزش روبه‌کودک — hint شکل سروری دارد (hint.simon.{label, stim:{a,b}})؛ ناسالم = پیش‌فرض امن */
export function previewSteps(hint) {
  const h = hint && hint.simon && typeof hint.simon === 'object' ? hint.simon : {};
  const rule = typeof h.label === 'string' && h.label.trim() !== '' ? h.label.trim() : DEFAULT_PROMPT;
  const s = h.stim && typeof h.stim === 'object' ? h.stim : {};
  const [a, b] = padPair(s);
  return [
    { svg: stimSvg({ a, b }), line: rule },
    { svg: stimSvg({ a, b }), line: 'دوستان یکی‌یکی نور می‌گیرند؛ جای هر کدام را در ذهنت نگه دار.' },
    { svg: stimSvg({ a, b }), line: 'بعد از چشمک، همان ترتیب را لمس کن — اول دوستِ اول، بعد دومی.' }
  ];
}

/* ═══════════════════════════════════════════════════════════════
   ۱.۲۵.۵۲ — کارت INTRO + تمرین تعاملی «تا موفقیت» (الگوی صدف‌ها):
   دو قدم — نخست دو دوست با نمایش هم‌زمان (قدم‌آموز)، بعد دو دوست با
   پخش واقعی یکی‌یکی. کارت‌های تمرین از پالت ثابت ماژول‌اند و هیچ
   کلیدی ندارند؛ کلید آیتم‌های واقعی فقط سمت سرور می‌ماند. ارزیابی
   هرگز تمرین تعاملی نمی‌بیند (C1).
   ═══════════════════════════════════════════════════════════════ */

/** کارت INTRO — نام + قانون یک‌خطی از راهنمای سرور؛ ناسالم = قانون امن ایستا */
export const intro = {
  name: 'هم‌صداها',
  rule: (hint) => {
    const h = hint && hint.simon && typeof hint.simon.label === 'string' ? hint.simon.label.trim() : '';
    return h !== '' ? h : 'دوستان یکی‌یکی نور می‌گیرند؛ همان ترتیب را لمس کن.';
  }
};

const SIMON_PRACTICE = {
  step1: 'دو دوست نور گرفتند؛ حالا تو همین دو تا را لمس کن.',
  step2: 'حالا دوستان یکی‌یکی نور می‌گیرند؛ به ترتیب لمسش کن.',
  success: 'آفرین! هم‌صدای ساحل شدی.',
  retry: 'دوباره نگاه کن؛ اول دوستِ اول، بعد دوستِ دوم.',
  retryWait: 'هر وقت آماده بودی لمس کن؛ عجله‌ای نیست.',
  practiceDone: 'تمرین تمام شد! حالا آواز واقعی هم‌صداها شروع می‌شود.'
};

const PRACTICE_WINDOW_MS = 20000;

/** صحنهٔ تمرین — دکور پس‌زمینهٔ غروب؛ جنبش از fx؛ بی‌اثر برای پاسخ */
function decoratePractice(stage) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup('teach', { svg: kindHero('simon') })); // قهرمان این بازی — پوستهٔ اختصاصی
  fx.sceneAmbient(stage);
}

/** لمس دو دوست مشخص به ترتیب — یا پنجرهٔ زمانی؛ خواب یدکی در هر دو مسیر cancel می‌شود */
function tapTwoWithin(stage, wantA, wantB, ms, sleeper) {
  return new Promise((resolve) => {
    const pads = Array.from(stage.querySelectorAll('.play-simon__pad'));
    const picked = [];
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      pads.forEach((b) => b.removeEventListener('pointerdown', onTap));
      sleeper.cancel(); // خواب یدکی یتیم نمی‌ماند — قاعدهٔ پنجرهٔ گو/نوگو
      resolve(ok === true);
    };
    const onTap = (ev) => {
      const btn = ev.target.closest('.play-simon__pad');
      if (!btn || btn.classList.contains('play-simon__pad--picked')) return;
      ev.preventDefault();
      btn.classList.add('play-simon__pad--picked');
      picked.push(Number(btn.dataset.idx));
      if (picked.length >= 2) {
        finish(picked[0] === wantA && picked[1] === wantB);
      }
    };
    pads.forEach((b) => b.addEventListener('pointerdown', onTap));
    sleeper.sleep(ms).then(() => finish(false));
  });
}

/** کارت تمرین — شبکهٔ دوستان + پیام؛ حالت‌های روشن/انتخاب با کلاس */
function practiceCardHtml(badge, line) {
  return (badge ? '<span class="play-step-badge">' + esc(badge) + '</span>' : '') +
    '<div class="play-simon play-simon--sample">' +
      '<p class="play-simon__status">' + esc(line) + '</p>' +
      gridHtml() +
    '</div>';
}

/** چشمک دو دوست پشت‌سرهم — پخش واقعی دنباله در تمرین؛ همهٔ دوستان خاموش شروع می‌شوند */
async function flashTwo(stage, a, b, sleeper) {
  for (const idx of [a, b]) {
    const padEl = stage.querySelector('.play-simon__pad[data-idx="' + idx + '"]');
    if (padEl) padEl.classList.add('play-simon__pad--lit');
    await sleeper.sleep(620);
    if (padEl) padEl.classList.remove('play-simon__pad--lit');
    await sleeper.sleep(240);
  }
}

/** پاک‌کردن انتخاب‌ها برای تلاش دوباره */
function resetPicks(stage) {
  if (!stage || !stage.querySelectorAll) return;
  stage.querySelectorAll('.play-simon__pad--picked').forEach((el) => el.classList.remove('play-simon__pad--picked'));
}

/**
 * تمرین تعاملی «هم‌صداها» — دو قدم با تکرار بی‌سرزنش تا موفقیت:
 *   قدم ۱: دو دوست هم‌زمان روشن (نشان‌گذاری آرام) → همان دو را لمس کن.
 *   قدم ۲: پخش واقعی یکی‌یکی → همان ترتیب را لمس کن.
 *   کارت‌های تمرین از پالت ثابت ماژول‌اند — کلید آیتم‌های بانک سرور نمی‌بیند.
 *   پس از دو تلاش، دوستان درست آرام نشان‌گذاری می‌شوند (آموزش پس از پاسخ).
 * خروجی: { applied, retries, go_retries: 0, nogo_retries: 0 } — صفرهای نام‌دار فقط
 *   برای سازگاری با قرارداد practiceRetries جلسه‌اند و تلاش واقعی در retries می‌آید.
 */
export async function practiceInteractive(ctx) {
  const { stage, sleeper, hint } = ctx || {};
  if (!stage || !sleeper) return { applied: false, retries: 0 };
  const h = hint && hint.simon && typeof hint.simon === 'object' ? hint.simon : {};
  const [a, b] = padPair(h.stim && typeof h.stim === 'object' ? h.stim : {});
  let retries = 0;

  /* قدم ۱ — دو دوست هم‌زمان روشن (مهرهٔ قاعده؛ آسان) */
  {
    let misses = 0;
    for (;;) {
      stage.className = 'play-stage';
      stage.classList.add('play-stage--teach');
      stage.innerHTML = practiceCardHtml('قدم ۱ از ۲', SIMON_PRACTICE.step1);
      decoratePractice(stage);
      fx.revealStage(stage);
      const pa = stage.querySelector('.play-simon__pad[data-idx="' + a + '"]');
      const pb = stage.querySelector('.play-simon__pad[data-idx="' + b + '"]');
      if (pa) pa.classList.add('play-simon__pad--lit');
      if (pb) pb.classList.add('play-simon__pad--lit');
      const ok = await tapTwoWithin(stage, a, b, PRACTICE_WINDOW_MS, sleeper);
      if (ok) {
        const status = stage.querySelector('.play-simon__status');
        if (status) status.textContent = SIMON_PRACTICE.success;
        if (pa) pa.classList.remove('play-simon__pad--lit');
        if (pb) pb.classList.remove('play-simon__pad--lit');
        if (pa) pa.classList.add('play-simon__pad--picked');
        if (pb) pb.classList.add('play-simon__pad--picked');
        const el = stage.querySelector('.play-simon__grid');
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
      const status = stage.querySelector('.play-simon__status');
      if (status) status.textContent = misses >= 2 ? SIMON_PRACTICE.retryWait : SIMON_PRACTICE.retry;
      if (misses >= 2) {
        if (pa) { pa.classList.add('play-simon__pad--truth'); pa.setAttribute('data-truth-order', '1'); }
        if (pb) { pb.classList.add('play-simon__pad--truth'); pb.setAttribute('data-truth-order', '2'); }
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
      stage.innerHTML = practiceCardHtml('قدم ۲ از ۲', SIMON_PRACTICE.step2);
      decoratePractice(stage);
      fx.revealStage(stage);
      await flashTwo(stage, a, b, sleeper);
      const status = stage.querySelector('.play-simon__status');
      if (status) status.textContent = 'نوبت توست! دو دوست را به همان ترتیب لمس کن.';
      const ok = await tapTwoWithin(stage, a, b, PRACTICE_WINDOW_MS, sleeper);
      if (ok) {
        const done = stage.querySelector('.play-simon__status');
        if (done) done.textContent = SIMON_PRACTICE.success;
        const el = stage.querySelector('.play-simon__grid');
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
      const again = stage.querySelector('.play-simon__status');
      if (again) again.textContent = misses >= 2 ? SIMON_PRACTICE.retryWait : SIMON_PRACTICE.retry;
      if (misses >= 2) {
        const pa = stage.querySelector('.play-simon__pad[data-idx="' + a + '"]');
        const pb = stage.querySelector('.play-simon__pad[data-idx="' + b + '"]');
        if (pa) { pa.classList.add('play-simon__pad--truth'); pa.setAttribute('data-truth-order', '1'); }
        if (pb) { pb.classList.add('play-simon__pad--truth'); pb.setAttribute('data-truth-order', '2'); }
      }
      await sleeper.sleep(1600);
    }
  }

  stage.className = 'play-stage';
  stage.classList.add('play-stage--teach');
  stage.innerHTML = '<p class="play-line">' + esc(SIMON_PRACTICE.practiceDone) + '</p>';
  decoratePractice(stage);
  fx.revealStage(stage);
  await sleeper.sleep(1600);
  stage.className = 'play-stage';
  stage.innerHTML = '';
  return { applied: true, retries, go_retries: 0, nogo_retries: 0 };
}

/** خلاصهٔ پایان جلسه — الگوی صدف‌ها با قاعدهٔ دامنهٔ صفر: جلسهٔ بی‌آزمون
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
    '<p class="play-debrief__line">دقت امروزت در آواز هم‌صداها: ٪' + esc(faNum(pct)) + '</p>';
  if (Number.isFinite(s.span_best) && s.span_best > 0) {
    html += '<p class="play-debrief__line">بلندترین آواز کامل امروزت: ' + esc(faNum(s.span_best)) + ' دوست</p>';
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
