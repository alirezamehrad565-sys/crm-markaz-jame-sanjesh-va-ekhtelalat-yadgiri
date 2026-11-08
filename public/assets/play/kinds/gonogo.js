/* ═══════════════════════════════════════════════════════════════
   kinds/gonogo.js — ماژول بازی گو/نوگو (فاز ۲ بازطراحی / ۱.۲۵.۱۲)
   محرک‌ها وکتور درون‌کدند (بدون دارایی خارجی → بدون شبکه و R2) و
   نسخه بی‌صداست: هیچ صدا یا انیمیشن تندی این‌جا نیست (§۹).
   دو نشانهٔ رنگ + شکل — تا کودک کوررنگ حذف نشد (سند محتوا بستهٔ ۳).
   پالت دفترچهٔ وظیفه §۲: گو = ستارهٔ Amber #E4AA46 · نوگو = Teal #438C89 —
   آبی قدیمی محرک حذف شد (تعارض با پالت بازطراحی، یافتهٔ ممیزی §۳.۴).
   ═══════════════════════════════════════════════════════════════ */

/* پالت نام‌دار محرک‌ها — کلید انگلیسی و فارسی هر دو پذیرفته می‌شود */
const PALETTE = {
  yellow: '#E4AA46', زرد: '#E4AA46',   /* Amber دفترچهٔ وظیفه — محرک گو */
  blue: '#438C89', آبی: '#438C89',     /* Teal دفترچهٔ وظیفه — محرک نوگو */
  red: '#D96C6C', قرمز: '#D96C6C',
  green: '#63B37F', سبز: '#63B37F',
  orange: '#E8925A', نارنجی: '#E8925A',
  purple: '#9B7EDE', بنفش: '#9B7EDE'
};

/* شکل‌های وکتوری درون‌کد — viewBox 120×124.
   رشتهٔ ساده = یک مسیر پرشده؛ شیء { d, ink } = مسیر پرشده + خطوط جوهری
   بی‌پر (پنجرهٔ موشک، چراغ بشقاب‌پرنده) تا جزئیات با رنگ جوهر Navy خوانا بماند.
   ۱.۲۵.۲۳ درون‌مایهٔ دیداری مرحله‌ها: گل/پروانه/ابر/موشک/بشقاب‌پرنده —
   امضای دیداری مراحل ۲–۴؛ شکل‌ها فقط نمایش‌اند و کلیدی ندارند. */
const SHAPES = {
  star: 'M60 8 L74 46 L115 46 L81 71 L94 112 L60 87 L26 112 L39 71 L5 46 L46 46 Z',
  circle: 'M60 10 a50 50 0 1 0 0.001 0 Z',
  square: 'M18 18 h84 v84 h-84 Z',
  /* ماهی/خرچنگ — تک‌منبع شخصیت از scene.js (M2/۱.۲۵.۳۶): وکتور حالت آرام (idle) —
     ژست ثابت و آرام برای آزمون؛ حالت‌های دیگر روایت فقط در لحظه‌های تشریفاتی */
  fish: null, /* پایین از HERO_VECTORS پر می‌شود */
  crab: null,
  boat: 'M20 74 h80 l-12 22 h-56 Z M58 12 v56 M58 16 l30 40 h-30 Z',
  balloon: 'M60 14 a30 34 0 1 0 0.001 0 M60 82 q-6 10 0 18 q6 8 0 16',
  heart: 'M60 104 C20 76 10 52 24 34 C36 20 54 24 60 40 C66 24 84 20 96 34 C110 52 100 76 60 104 Z',
  /* ─── مرحلهٔ ۲ باغ ─── */
  flower: {
    d: 'M60 23 a15 15 0 1 0 0.01 0 M60 67 a15 15 0 1 0 0.01 0 M38 45 a15 15 0 1 0 0.01 0 M82 45 a15 15 0 1 0 0.01 0 M60 48 a12 12 0 1 0 0.01 0',
    ink: 'M60 96 Q56 106 60 114 M60 90 Q50 100 44 106'
  },
  butterfly: {
    d: 'M60 48 C36 20 10 34 24 56 C12 70 32 92 58 72 M60 48 C84 20 110 34 96 56 C108 70 88 92 62 72 M58 46 L58 88 M62 46 L62 88',
    ink: 'M58 44 Q52 32 46 28 M62 44 Q68 32 74 28'
  },
  /* ─── مرحلهٔ ۳ آسمان ─── */
  cloud: {
    d: 'M24 84 a16 16 0 0 1 4-31 a22 22 0 0 1 43-6 a16 16 0 0 1 25 13 a14 14 0 0 1-7 24 Z'
  },
  /* ─── مرحلهٔ ۴ فضا ─── */
  rocket: {
    d: 'M60 10 C73 25 78 44 78 63 L78 79 L42 79 L42 63 C42 44 47 25 60 10 Z M42 61 L26 86 L42 86 M78 61 L94 86 L78 86 M52 79 L60 98 L68 79',
    ink: 'M60 38 a9 9 0 1 0 0.01 0'
  },
  ufo: {
    d: 'M43 58 a17 15 0 1 1 34 0 M18 64 a42 13 0 1 0 84 0 a42 13 0 1 0 -84 0',
    ink: 'M45 76 a3 3 0 1 0 0.01 0 M60 78 a3 3 0 1 0 0.01 0 M75 76 a3 3 0 1 0 0.01 0'
  }
};

/* تک‌منبع شخصیت دریایی — وکتور حالت آرام ماهی/خرچنگ از کتابخانهٔ صحنه (M2) */
import { HERO_VECTORS, sceneMarkup, kindHero } from '../scene.js';
SHAPES.fish = HERO_VECTORS.fish;
SHAPES.crab = HERO_VECTORS.crab;

const INK = '#153E50';  /* Navy دفترچهٔ وظیفه — خط جوهری محرک */

function colorOf(stim) {
  const c = stim && typeof stim.color === 'string' ? stim.color.trim() : '';
  return PALETTE[c] || '#E4AA46'; // پیش‌فرض ملایم Amber — مقدار ناشناخته رنگ قرمز پررنگ نمی‌شود
}

function shapeOf(stim) {
  const s = stim && typeof stim.shape === 'string' ? stim.shape.trim() : '';
  const v = SHAPES[s] || SHAPES.star;
  return typeof v === 'string' ? { d: v, ink: null } : v;
}

/** وکتور محرک — svg درون‌خطی با دو نشانهٔ شکل و رنگ (+ جزئیات جوهری اختیاری) */
export function stimSvg(stim) {
  const shape = shapeOf(stim);
  const fill = colorOf(stim);
  return '<svg class="play-svg" viewBox="0 0 120 124" role="img" aria-hidden="true">' +
    '<g fill="' + fill + '" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" ' +
    'stroke-linecap="round"><path d="' + shape.d + '"/></g>' +
    (shape.ink
      ? '<g fill="none" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" ' +
        'stroke-linecap="round"><path d="' + shape.ink + '"/></g>'
      : '') +
    '</svg>';
}

/** کارت INTRO — بسته‌بندی معرفی بازی (G3/۱.۲۵.۳۷): نام + قانون یک‌خطی از راهنمای سرور.
 *  ۱.۲۵.۴۱ (ممیزی): الگوی قدیمی «ماهی «ماهی نارنجی»» دوباره‌گویی عجیب می‌ساخت؛
 *  قانون تازه با فعل سادهٔ لمس‌کن/دست‌نزن — برچسب‌های سرور حکم توضیح رنگ‌ها را دارند.
 *  قانون از labelهای راهنمای آموزشی سرور می‌آید (فقط آیتم‌های train)؛ ناسالم = قانون امن ایستا.
 *  ارزیابی هرگز INTRO نمی‌بیند — مسیر ارزیابی دستورالعمل ثابت کوتاه خودش را دارد (C1). */
export const intro = {
  name: 'ماهی و خرچنگ',
  rule: (hint) => {
    const go = hint && hint.go && typeof hint.go.label === 'string' ? hint.go.label.trim() : '';
    const nogo = hint && hint.nogo && typeof hint.nogo.label === 'string' ? hint.nogo.label.trim() : '';
    if (go !== '' && nogo !== '') {
      return 'هر وقت ' + go + ' آمد صفحه را لمس کن؛ وقتی ' + nogo + ' آمد دست نزن.';
    }
    return 'هر وقت ماهی آمد صفحه را لمس کن؛ وقتی خرچنگ آمد دست نزن.';
  }
};

/** پنجرهٔ پاسخ آیتم — در موتور مرکزی (engine/machine.js windowMsFor)؛ این ماژول فقط نمایش است */

/** پیش‌نمایش شروع «این هدف است / این نه» — فقط از راهنمای آموزشی سرور (هیچ ردی از پروب) */
export function previewSteps(hint) {
  const steps = [];
  if (hint && hint.go) {
    steps.push({ svg: stimSvg(hint.go.stim), line: 'این را لمس کن: ' + hint.go.label });
  }
  if (hint && hint.nogo) {
    steps.push({ svg: stimSvg(hint.nogo.stim), line: 'این را لمس نکن: ' + hint.nogo.label });
  }
  return steps;
}

/* ═══════════════════════════════════════════════════════════════
   لایهٔ اقتباس jsPsych-timelines/go-nogo (MIT) — ۱.۲۵.۳۴
   ═══════════════════════════════════════════════════════════════ */

import * as fx from '../fx.js';

/** صحنهٔ تمرین — دکور پس‌زمینهٔ لایه‌های دریا (M2)؛ جنبش از fx؛ بی‌اثر برای پاسخ */
function decoratePractice(stage) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup('teach', { svg: kindHero('gonogo') })); // قهرمان این بازی — پوستهٔ اختصاصی ۱.۲۵.۴۱
  fx.sceneAmbient(stage);
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
const faDec = (x) => String(x).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]).replace('.', '٫');

function esc(s) {
  return s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* متن‌های بازی — الگوی text_object بستهٔ jsPsych؛ همه‌چیز فارسی و بی‌سرزنش (§۲).
   هیچ واژهٔ فهرست ممنوع لینت — بازخورد تکرار توصیف وضعیت است، نه سرزنش کودک. */
export const GO_NOGO_TEXT = {
  goStepLine: (label) => 'این را لمس کن: ' + label,
  goStepWait: 'هر وقت ماهی آمد، صفحه را لمس کن',
  goSuccess: 'آفرین! ماهی را گرفتی.',
  goRetry: 'ماهی زود رفت؛ دوباره امتحان می‌کنیم.',
  goRetryCalm: 'یک نفس عمیق بکش؛ ماهی دوباره برمی‌گردد.',
  nogoStepLine: (label) => 'این را لمس نکن: ' + label,
  nogoStepWait: 'دستت را نگه دار تا خرچنگ آرام آرام برود',
  nogoSuccess: 'چه دستِ آرامی! خرچنگ هم آرام رفت.',
  nogoRetry: 'خرچنگ را نباید لمس کرد؛ یک‌بار دیگر تمرین می‌کنیم.',
  nogoRetryCalm: 'دستت را روی زانو بگذار؛ خرچنگ دوباره می‌آید.',
  practiceDone: 'تمرین تمام شد! حالا مأموریت واقعی شروع می‌شود.',
  debriefAccuracy: (pct) => 'دقت امروز تو: ' + faNum(pct) + '٪',
  debriefMedianRt: (sec) => 'میانهٔ زمان لمس‌های درست: ' + faDec(sec) + ' ثانیه',
  debriefPractice: (n) => 'در تمرین شروع، ' + faNum(n) + ' بار دیگر تلاش کردی و موفق شدی.'
};

/** پارامترهای تمرین تعاملی — نگاشت go_practice_timeout/nogo_practice_timeout بستهٔ jsPsych
 *  (پیش‌فرض همان ۱۰۰۰۰/۳۰۰۰ آن بسته)؛ سقف امن ۳۰ ثانیه تا جلسه گیر نکند */
export const PRACTICE_LIMITS = { go_ms: 10000, nogo_ms: 3000, min_ms: 800, max_ms: 30000 };

/** بسته‌بندی امن پنجرهٔ تمرین — خالص؛ بیرون بازه = پیش‌فرض نوع‌بازی */
export function practiceLimitOf(type, rawMs) {
  const d = type === 'nogo' ? PRACTICE_LIMITS.nogo_ms : PRACTICE_LIMITS.go_ms;
  const v = typeof rawMs === 'number' && Number.isFinite(rawMs) ? Math.round(rawMs) : d;
  if (v < PRACTICE_LIMITS.min_ms || v > PRACTICE_LIMITS.max_ms) return d;
  return v;
}

/** دسته‌بندی خروجی تمرین — آینهٔ on_finish بستهٔ jsPsych:
 *  گو: لمس = موفقیت، بی‌لمس تا پایان پنجره = تکرار؛ نوگو: برعکس.
 *  خروجی 'success' | 'retry' — تکرار تا موفقیت همان قدم ادامه دارد. */
export function practiceOutcome(type, touched) {
  return type === 'nogo' ? (touched ? 'retry' : 'success') : (touched ? 'success' : 'retry');
}

/** یک لمس یا یک پنجرهٔ زمانی — هر کدام زودتر. یک لمس فیزیکی فقط یک‌بار ثبت می‌شود
 *  (شنونده پس از نخستین رخداد برداشته می‌شود؛ pointerdown نه click — بدون تأخیر لمسی).
 *  sleeper تک‌شکافه است — در هر دو مسیر cancel می‌شود تا شمارندهٔ یدکی هرگز
 *  در میانهٔ خواب بعدی نترکد (همان قاعدهٔ پنجرهٔ گو/نوگو در موتور). */
function tapWithin(stage, ms, sleeper) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (touched) => {
      if (done) return;
      done = true;
      stage.removeEventListener('pointerdown', onTap);
      sleeper.cancel(); // شمارندهٔ پنجره یتیم نمی‌ماند — لمس یا پایان، هر دو مسیر
      resolve(touched);
    };
    const onTap = () => finish(true);
    stage.addEventListener('pointerdown', onTap);
    sleeper.sleep(ms).then(() => finish(false));
  });
}

function stepCard(badge, svg, line, muted) {
  return '<span class="play-step-badge">' + esc(badge) + '</span>' +
    (svg || '') +
    '<p class="play-line">' + esc(line) + '</p>' +
    (muted ? '<p class="play-muted">' + esc(muted) + '</p>' : '');
}

/**
 * تمرین تعاملی شروع — اقتباس حلقهٔ retry بی‌نهایت بستهٔ jsPsych با محرک راهنمای سرور
 * (hint.go/hint.nogo از آیتم‌های train ساخته می‌شود؛ امضای ماهی/خرچنگ هر مرحله را
 * سرور می‌فرستد — کلید پاسخ هرگز به کلاینت نمی‌رسد). گو = لمس همه‌جای صحنه؛
 * نوگو = بازداری تا پایان پنجرهٔ کوتاه. ارزیابی هرگز این‌جا نمی‌آید (مصرف تمرین).
 * خروجی: { applied, go_retries, nogo_retries } — applied=false یعنی راهنمای سرور نبود
 * و مدار قدیمی previewSteps باید برقرار بماند.
 */
export async function practiceInteractive(ctx) {
  const { stage, sleeper, hint } = ctx || {};
  if (!stage || !sleeper || !hint || !hint.go || !hint.nogo) {
    return { applied: false, go_retries: 0, nogo_retries: 0 };
  }
  const goMs = practiceLimitOf('go', hint.go.window_ms);
  const nogoMs = practiceLimitOf('nogo', hint.nogo.window_ms);
  let goRetries = 0;
  let nogoRetries = 0;

  /* قدم گو — ماهی: لمس در پنجرهٔ بلند؛ بی‌لمس = بازخورد آرام + همان قدم تکرار می‌شود */
  for (;;) {
    stage.className = 'play-stage';
    stage.classList.add('play-stage--teach');
    stage.innerHTML = stepCard('قدم ۱ از ۲', stimSvg(hint.go.stim),
      GO_NOGO_TEXT.goStepLine(hint.go.label), GO_NOGO_TEXT.goStepWait);
    decoratePractice(stage);
    fx.revealStage(stage);
    fx.popIn(stage.querySelector('.play-svg'));
    const out = practiceOutcome('go', await tapWithin(stage, goMs, sleeper));
    if (out === 'success') {
      stage.innerHTML = stepCard('قدم ۱ از ۲', stimSvg(hint.go.stim), GO_NOGO_TEXT.goSuccess);
      decoratePractice(stage);
      fx.revealStage(stage);
      await sleeper.sleep(1200);
      break;
    }
    goRetries += 1;
    stage.innerHTML = stepCard('قدم ۱ از ۲', stimSvg(hint.go.stim),
      goRetries >= 2 ? GO_NOGO_TEXT.goRetryCalm : GO_NOGO_TEXT.goRetry);
    decoratePractice(stage);
    fx.revealStage(stage);
    await sleeper.sleep(1600);
  }

  /* قدم نوگو — خرچنگ: بازداری تا پایان پنجرهٔ کوتاه؛ لمس = بازخورد آرام + تکرار */
  for (;;) {
    stage.className = 'play-stage';
    stage.classList.add('play-stage--teach');
    stage.innerHTML = stepCard('قدم ۲ از ۲', stimSvg(hint.nogo.stim),
      GO_NOGO_TEXT.nogoStepLine(hint.nogo.label), GO_NOGO_TEXT.nogoStepWait);
    decoratePractice(stage);
    fx.revealStage(stage);
    fx.popIn(stage.querySelector('.play-svg'));
    const out = practiceOutcome('nogo', await tapWithin(stage, nogoMs, sleeper));
    if (out === 'success') {
      stage.innerHTML = stepCard('قدم ۲ از ۲', stimSvg(hint.nogo.stim), GO_NOGO_TEXT.nogoSuccess);
      decoratePractice(stage);
      fx.revealStage(stage);
      await sleeper.sleep(1200);
      break;
    }
    nogoRetries += 1;
    stage.innerHTML = stepCard('قدم ۲ از ۲', stimSvg(hint.nogo.stim),
      nogoRetries >= 2 ? GO_NOGO_TEXT.nogoRetryCalm : GO_NOGO_TEXT.nogoRetry);
    decoratePractice(stage);
    fx.revealStage(stage);
    await sleeper.sleep(1600);
  }

  /* کارت پایان تمرین — الگوی createPracticeCompletion بستهٔ jsPsych؛ بدون دکمه، خودکار */
  stage.className = 'play-stage';
  stage.classList.add('play-stage--teach');
  stage.innerHTML = stepCard(null, null, GO_NOGO_TEXT.practiceDone);
  decoratePractice(stage);
  fx.revealStage(stage);
  await sleeper.sleep(1600);
  stage.className = 'play-stage';
  stage.innerHTML = '';
  return { applied: true, go_retries: goRetries, nogo_retries: nogoRetries };
}

/** خلاصهٔ پایان جلسه — نگاشت createDebrief بستهٔ jsPsych (دقت + زمان واکنش) با
 *  قاعدهٔ دامنهٔ صفر: جلسهٔ خالی یا بی‌آزمون نمره‌خورده = '' (هیچ عدد ساختگی نمی‌آید)؛
 *  فقط مسیر تمرین صدا می‌زند — ارزیابی هرگز عدد نمی‌بیند (C1 دستورالعمل ثابت).
 *  ورودی از session.js ساخته می‌شود و فقط دادهٔ مجاز کلاینت را می‌بیند:
 *    scored_total/scored_correct — شمار و درستی از بازخورد سرور (فقط آیتم‌های train
 *    نمره برمی‌گردانند؛ پروب‌ها هرگز در نسبت دقت نمی‌آیند — ملاک سرور است)؛
 *    median_rt — میانهٔ RT لمس‌ها از رکوردهای موتور. کلید پاسخ هرگز این‌جا نیست. */
export function debriefMarkup(summary, extra) {
  const s = summary && typeof summary === 'object' ? summary : {};
  const total = s.scored_total ?? 0;
  const correct = s.scored_correct ?? 0;
  if (!Number.isFinite(total) || total <= 0) return '';
  const pct = Math.round((correct / total) * 100);
  let html = '<div class="play-debrief">' +
    '<p class="play-debrief__line">' + esc(GO_NOGO_TEXT.debriefAccuracy(pct)) + '</p>';
  if (Number.isFinite(s.median_rt) && s.median_rt > 0) {
    html += '<p class="play-debrief__muted">' +
      esc(GO_NOGO_TEXT.debriefMedianRt(Math.round(s.median_rt / 100) / 10)) + '</p>';
  }
  const retries = extra && Number.isFinite(extra.go_retries) && Number.isFinite(extra.nogo_retries)
    ? extra.go_retries + extra.nogo_retries : 0;
  if (retries > 0) {
    html += '<p class="play-debrief__muted">' + esc(GO_NOGO_TEXT.debriefPractice(retries)) + '</p>';
  }
  return html + '</div>';
}
