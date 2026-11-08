/* ═══════════════════════════════════════════════════════════════
   kinds/nback.js — بازی «آلبوم خرچنگ» (ن‌پشت همسانی دیداری) — ۱.۲۵.۴۰
   ماژول نمایش: صفحهٔ آلبوم عکس ماهی‌ها؛ خرچنگ آلبوم‌دار هر ماهی را در
   کارت خود می‌چیند و کودک حکم می‌دهد «این ماهی n قدم عقب‌تر هم آمده
   بود یا نه» — دو دکمهٔ ثابت «همان است / فرق دارد». نشانِ جواب درست
   فقط تمرین و فقط از برچسب سرور. نمره‌دهی فقط سمت سرور است؛ کلید
   همسانی (match) هرگز به این ماژول نمی‌رسد؛ هیچ درخواست شبکه‌ای ندارد.
   بی‌صدا؛ جنبش فقط از fx (§۹).
   منبع مفهومی — پارادایم کلاسیک n-back (Kirchner 1958؛ نسخهٔ دیداری
   همسانی محرک در ادبیات حافظهٔ کاری). مکانیک از صفر با قرارداد این
   سامانه (timedchoice، stim.window_ms، پاسخ {option}) بازنویسی شده —
   گرافیک وکتوری و همهٔ متن فارسی اصیل‌اند (بدون هیچ دارایی بیرونی).
   ═══════════════════════════════════════════════════════════════ */

const INK = '#153E50';     /* Navy دفترچهٔ وظیفه — خط جوهری ماهی و قاب آلبوم */
const CREAM = '#F5F0E5';   /* کاغذ آلبوم */

/* جنبش تزئینی و صحنهٔ آموزش — همهٔ جنبش از fx با گارد کاهش‌جنبش؛ این ماژول هرگز مستقیم animate نمی‌کند */
import * as fx from '../fx.js';
import { sceneMarkup } from '../scene.js';

/* پالت ثابت ۱۰ ماهی — کلیدها قرارداد بانک‌اند (stim.fish)؛ برچسب فارسی + رنگ بدنه (کودک‌پسند).
   teal/pink/lime/indigo لنگرهای یگانهٔ بانک‌اند (هر کدام یک‌بار در کل جریان) — برچسبشان
   فقط توصیف ظاهری است و هیچ راهی به حکم همسانی ندارد. */
const PALETTE = {
  red:    { fa: 'قرمز',     hex: '#D9534F' },
  blue:   { fa: 'آبی',      hex: '#3E6FD9' },
  green:  { fa: 'سبز',      hex: '#3E9B5F' },
  yellow: { fa: 'زرد',      hex: '#E9C33C' },
  orange: { fa: 'نارنجی',   hex: '#E0762F' },
  purple: { fa: 'بنفش',     hex: '#8E5BB8' },
  teal:   { fa: 'فیروزه‌ای', hex: '#438C89' },
  pink:   { fa: 'صورتی',    hex: '#D96C9C' },
  lime:   { fa: 'لیمویی',   hex: '#9CBF3B' },
  indigo: { fa: 'نیلی',     hex: '#5B5EA6' }
};

/* کلید ناشناخته از سرور = ماهی خاکستری امن — هیچ راهی به کلید نیست */
const FALLBACK_FISH = { fa: 'ماهی', hex: '#8A93A6' };

const DEFAULT_PROMPT = 'به ماهیِ آلبوم نگاه کن؛ اگر همین ماهی چند قدم عقب‌تر هم آمده بود، «همان است» را لمس کن.';

/* برچسب پلهٔ n — زبان کودک؛ ناسالم = پلهٔ یک (پیش‌فرض امن) */
const LEVEL_LABELS = { 1: 'یک قدم به عقب', 2: 'دو قدم به عقب' };

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function faNum(n) {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

function paletteOf(key) {
  return key && PALETTE[key] ? PALETTE[key] : FALLBACK_FISH;
}

/** stim آیتم — ناسالم = شیء خالی */
function stimOf(item) {
  return item && item.stim && typeof item.stim === 'object' ? item.stim : {};
}

/** کلید ماهی — ناسالم = خاکستری امن (هیچ راهی به کلید نیست) */
function fishKeyOf(stim) {
  return typeof stim.fish === 'string' && PALETTE[stim.fish] ? stim.fish : null;
}

/** پلهٔ n — فقط ۱ یا ۲؛ هر چیز دیگر = ۱ (پیش‌فرض امن) */
function levelOf(stim) {
  return stim.n === 2 ? 2 : 1;
}

/* ─── وکتور ماهی — {d,ink} درون‌کد؛ بدنه با رنگ پالت، خط Navy ─── */

/** درون‌ساخت ماهی رو به چپ (مسیر آلبوم)؛ body رنگ پالت می‌گیرد */
function fishInner(hex) {
  return '<g stroke="' + INK + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">' +
    '<path d="M92 30 L112 14 L110 40 L114 66 L92 50 C88 56 82 60 74 62 L74 18 C82 20 88 24 92 30 Z" fill="' + hex + '"/>' +
    '<path d="M12 40 C22 18 48 8 66 14 C80 18 88 28 88 40 C88 52 80 62 66 66 C48 72 22 62 12 40 Z" fill="' + hex + '"/>' +
    '<path d="M46 14 C52 6 62 6 66 12" fill="' + hex + '"/>' +
    '<path d="M44 64 C50 72 60 72 64 66" fill="' + hex + '"/>' +
    '<path d="M52 36 C56 30 64 30 68 36" fill="none"/>' +
    '</g>' +
    '<circle cx="32" cy="34" r="6" fill="' + CREAM + '"/>' +
    '<circle cx="31" cy="34" r="3" fill="' + INK + '"/>' +
    '<path d="M20 46 C26 50 34 50 40 47" fill="none" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/>';
}

/** ماهی وکتور تکی — key کلید پالت؛ ناشناخته = خاکستری امن */
export function fishSvg(key) {
  const c = paletteOf(key);
  return '<svg class="play-nback__fish" viewBox="0 0 124 80" role="img" aria-label="ماهی ' + esc(c.fa) + '">' +
    fishInner(c.hex) + '</svg>';
}

/** کارت آلبوم — عکس ماهی در قاب کرم + برچسب پلهٔ n زیر عکس */
function albumCard(key, n, cls) {
  const level = LEVEL_LABELS[levelOf({ n })] ?? LEVEL_LABELS[1];
  return '<div class="play-nback__album' + (cls ? ' ' + cls : '') + '">' +
    fishSvg(key) +
    '<span class="play-nback__level">' + esc(level) + '</span>' +
    '</div>';
}

/** جفت کارت تمرین — عکس «قدم عقب» کوچک کنار عکس امروزی؛ فقط صحنهٔ آموزش */
function practicePairHtml(prevKey, curKey) {
  const prev = paletteOf(prevKey);
  const cur = paletteOf(curKey);
  return '<div class="play-nback__memo">' +
    '<div class="play-nback__memo-card"><span class="play-nback__memo-tag">قدم عقب</span>' +
      '<svg class="play-nback__memo-fish" viewBox="0 0 124 80" role="img" aria-label="ماهی ' + esc(prev.fa) + '">' + fishInner(prev.hex) + '</svg>' +
    '</div>' +
    '<svg class="play-nback__memo-arrow" viewBox="0 0 40 24" aria-hidden="true">' +
      '<path d="M4 12 H30 M22 4 L32 12 L22 20" fill="none" stroke="' + INK + '" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '<div class="play-nback__memo-card play-nback__memo-card--now"><span class="play-nback__memo-tag">امروز</span>' +
      '<svg class="play-nback__memo-fish" viewBox="0 0 124 80" role="img" aria-label="ماهی ' + esc(cur.fa) + '">' + fishInner(cur.hex) + '</svg>' +
    '</div>' +
    '</div>';
}

function optionBtn(i, label) {
  return '<button type="button" class="play-option play-nback__opt" data-option="' + i + '" aria-label="' + esc(label) + '">' +
    '<span class="play-nback__optname">' + esc(label) + '</span>' +
    '</button>';
}

/** دکمهٔ نمایشی قدم آموزش — بی‌لمس و ایستا (span، نه button) */
function demoBtn(label) {
  return '<span class="play-nback__demo">' + esc(label) + '</span>';
}

/* ─── موج آیتم ن‌پشت — قاعده + کارت آلبوم + دو دکمهٔ ثابت + نوار پنجرهٔ پاسخ ─── */

export function nbackMarkup(item) {
  const stim = stimOf(item);
  const prompt = item.prompt && String(item.prompt).trim() !== '' ? esc(item.prompt) : DEFAULT_PROMPT;
  return '<div class="play-nback">' +
    '<p class="play-nback__prompt">' + prompt + '</p>' +
    albumCard(fishKeyOf(stim), levelOf(stim), '') +
    '<div class="play-options play-nback__answers">' +
      optionBtn(0, 'همان است') +
      optionBtn(1, 'فرق دارد') +
    '</div>' +
    '<div class="play-nback__timer" aria-hidden="true"><span style="width:100%"></span></div>' +
    '</div>';
}

/* ─── نشان حقیقت — فقط تمرین، پس از پاسخ؛ برچسب درست از سرور می‌آید ───
   برجسته‌سازی دکمهٔ هم‌نام با برچسب سرور — هیچ محاسبه‌ای از محرک نیست. */

export function nbackRevealTruth(item, stage, answerDisplay) {
  if (typeof answerDisplay !== 'string' || answerDisplay.trim() === '') return null;
  const said = answerDisplay.trim();
  const idx = said.indexOf('همان') !== -1 ? 0 : said.indexOf('فرق') !== -1 ? 1 : null;
  if (idx === null) return null;
  const btn = stage && stage.querySelector ? stage.querySelector('.play-nback__opt[data-option="' + idx + '"]') : null;
  if (btn && btn.classList) {
    btn.classList.add('play-nback__opt--truth');
    return btn;
  }
  return null;
}

/**
 * مرکز نخستین پاسخ برای انفجار ذرات موفقیت (fx.burstAt) —
 * دکمهٔ نشان‌گذاری‌شدهٔ برنچ timedchoice اگر باشد، وگرنه مرکز کارت آلبوم.
 */
export function nbackResponsePoint(stage) {
  if (!stage || !stage.querySelector) return null;
  const picked = stage.querySelector('.play-nback__opt--picked, .play-option--picked, .play-nback__opt--truth');
  const el = picked || stage.querySelector('.play-nback__album');
  if (!el || !el.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** SVG محرک برای پیش‌نمایش آموزش — ماهی تنها روی کاغذ آلبوم */
export function stimSvg(stim) {
  const s = stim && typeof stim === 'object' ? stim : {};
  return albumCard(fishKeyOf(s), levelOf(s), 'play-nback__album--demo');
}

/* ─── قدم‌های آموزش — ایستا؛ هیچ ردی از کلید همسانی یا آیتم پروب ─── */

/** کارت‌های نمونهٔ آموزش از پالت ماژول‌اند — ماهی راهنمای سرور مهمانِ قدم اول است */
export function previewSteps(hint) {
  const h = hint && hint.nback && typeof hint.nback === 'object' ? hint.nback : {};
  const s = h.stim && typeof h.stim === 'object' ? h.stim : {};
  const guestKey = fishKeyOf(s) || 'orange';
  const rule = typeof h.label === 'string' && h.label.trim() !== '' ? h.label.trim() : DEFAULT_PROMPT;
  /* جفت‌های نمونه از پالت ثابت ماژول — «همان» و «فرق» هر دو روبه‌کودک پیدااند (آموزش، نه آزمون) */
  const pairA = practicePairHtml(guestKey, guestKey);
  const pairB = practicePairHtml('green', 'yellow');
  const demoAnswers = '<div class="play-options play-nback__answers play-nback__answers--demo">' +
    demoBtn('همان است') + demoBtn('فرق دارد') +
    '</div>';
  return [
    { svg: albumCard(guestKey, 1, 'play-nback__album--demo'), line: rule },
    { svg: pairA, line: 'گاهی ماهی امروزی، همان ماهیِ قدم عقب‌تر است — آن‌وقت «همان است» را لمس می‌کنی.' },
    { svg: pairB + demoAnswers, line: 'گاهی فرق دارد — آن‌وقت «فرق دارد» را لمس کن. حواست فقط به ماهیِ قدم عقب‌تر باشد.' }
  ];
}

/* ═══════════════════════════════════════════════════════════════
   G3 / ۱.۲۵.۴۰ — کارت INTRO + تمرین تعاملی «تا موفقیت» (همان الگوی
   حلقهٔ تمرین گونوگو/استروپ): دو قدم — نخست دو عکس همسان («همان است»)،
   بعد دو عکس ناهمسان («فرق دارد»). عکس‌های تمرین از پالت همین ماژول‌اند
   و مقایسهٔ روبه‌کودک پیدا است — تمرین هیچ کلیدی ندارد؛ کلید آیتم‌های
   واقعی (match) فقط سمت سرور می‌ماند. ارزیابی هرگز تمرین تعاملی
   نمی‌بیند (C1). نوار پنجره در تمرین بی‌جنبش می‌ماند (§۹).
   ═══════════════════════════════════════════════════════════════ */

/** کارت INTRO — نام + قانون یک‌خطی از راهنمای سرور؛ ناسالم = قانون امن ایستا */
export const intro = {
  name: 'آلبوم خرچنگ',
  rule: (hint) => {
    const h = hint && hint.nback && typeof hint.nback.label === 'string' ? hint.nback.label.trim() : '';
    return h !== '' ? h : 'به ماهی‌های آلبوم نگاه کن؛ اگر ماهیِ امروزی همانِ قدم عقب‌تر بود، «همان است» را لمس کن.';
  }
};

const NBACK_PRACTICE = {
  step1: 'ماهیِ «امروز» همان ماهیِ «قدم عقب» است؛ دکمهٔ «همان است» را لمس کن.',
  step2: 'حالا ماهی «امروز» عوض شد؛ با «قدم عقب» یکی نیست — «فرق دارد» را لمس کن.',
  success: 'آفرین! حکمت درست بود.',
  retry: 'دوباره نگاه کن: ماهی «امروز» با ماهی «قدم عقب» یکی است یا نه؟',
  retryWait: 'هر وقت آماده بودی لمس کن؛ عجله‌ای نیست.',
  practiceDone: 'تمرین تمام شد! حالا آلبوم واقعی شروع می‌شود.'
};

const PRACTICE_WINDOW_MS = 15000;

/** صحنهٔ تمرین — دکور پس‌زمینهٔ لایه‌های دریا؛ جنبش از fx؛ بی‌اثر برای پاسخ */
function decoratePractice(stage) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup('teach'));
  fx.sceneAmbient(stage);
}

/** یک لمس روی دو دکمهٔ حکم یا یک پنجرهٔ زمانی — هر کدام زودتر؛ خواب یدکی cancel می‌شود */
function tapAnswerWithin(stage, ms, sleeper) {
  return new Promise((resolve) => {
    const buttons = Array.from(stage.querySelectorAll('.play-option'));
    let done = false;
    const finish = (idx) => {
      if (done) return;
      done = true;
      buttons.forEach((b) => b.removeEventListener('pointerdown', onTap));
      sleeper.cancel(); // خواب یدکی یتیم نمی‌ماند — قاعدهٔ پنجرهٔ گو/نوگو
      resolve(idx === null || idx === undefined ? null : idx);
    };
    const onTap = (ev) => {
      const btn = ev.target.closest('.play-option');
      if (!btn) return;
      ev.preventDefault();
      finish(Number(btn.dataset.option));
    };
    buttons.forEach((b) => b.addEventListener('pointerdown', onTap));
    sleeper.sleep(ms).then(() => finish(null));
  });
}

/** کارت تمرین — جفت عکس پیدا + دو دکمهٔ حکم؛ مقایسه روبه‌کودک باز است (تمرین، نه آزمون) */
function practiceCardHtml(badge, prevKey, curKey, line) {
  return (badge ? '<span class="play-step-badge">' + esc(badge) + '</span>' : '') +
    '<div class="play-nback play-nback--practice">' +
    practicePairHtml(prevKey, curKey) +
    '<div class="play-options play-nback__answers">' +
      optionBtn(0, 'همان است') +
      optionBtn(1, 'فرق دارد') +
    '</div>' +
    '</div>' +
    '<p class="play-line">' + esc(line) + '</p>';
}

/**
 * تمرین تعاملی «آلبوم خرچنگ» — دو قدم با تکرار بی‌سرزنش تا موفقیت:
 * قدم ۱ جفت همسان (پاسخ «همان است»)، قدم ۲ جفت ناهمسان (پاسخ «فرق دارد»).
 * مقایسهٔ دو عکس در کارت تمرین روبه‌کودک پیدا است — قانون خود بازی، نه کلید بانک.
 * پس از دو تلاش، دکمهٔ درست آرام نشان داده می‌شود (آموزش پس از پاسخ).
 * خروجی: { applied, retries, go_retries: 0, nogo_retries: 0 } — applied=false یعنی صحنه/ساعت آماده نبود.
 */
export async function practiceInteractive(ctx) {
  const { stage, sleeper } = ctx || {};
  if (!stage || !sleeper) return { applied: false, retries: 0, go_retries: 0, nogo_retries: 0 };
  /* جفت‌های تمرین از پالت ماژول — هیچ کلیدی از سرور نمی‌آید */
  const steps = [
    { badge: 'قدم ۱ از ۲', prev: 'red', cur: 'red', want: 0, line: NBACK_PRACTICE.step1 },
    { badge: 'قدم ۲ از ۲', prev: 'green', cur: 'yellow', want: 1, line: NBACK_PRACTICE.step2 }
  ];
  let retries = 0;

  for (const step of steps) {
    let misses = 0;
    for (;;) {
      stage.className = 'play-stage';
      stage.classList.add('play-stage--teach');
      stage.innerHTML = practiceCardHtml(step.badge, step.prev, step.cur, step.line);
      decoratePractice(stage);
      fx.revealStage(stage);
      fx.popIn(stage.querySelector('.play-nback__memo-card--now'), 240, false);
      const picked = await tapAnswerWithin(stage, PRACTICE_WINDOW_MS, sleeper);
      if (picked !== null && picked === step.want) {
        stage.innerHTML = practiceCardHtml(step.badge, step.prev, step.cur, NBACK_PRACTICE.success);
        decoratePractice(stage);
        fx.revealStage(stage);
        const el = stage.querySelector('.play-nback__memo-card--now');
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width) fx.burstAt(r.left + r.width / 2, r.top + r.height / 2);
        }
        await sleeper.sleep(1200);
        break;
      }
      retries += 1;
      misses += 1;
      const line = picked === null ? NBACK_PRACTICE.retryWait : NBACK_PRACTICE.retry;
      stage.innerHTML = practiceCardHtml(step.badge, step.prev, step.cur, line);
      decoratePractice(stage);
      fx.revealStage(stage);
      if (misses >= 2) {
        // آموزش پس از پاسخ — دکمهٔ درستِ قانونِ روبه‌کودک، نه کلید آیتم بانک
        const btn = stage.querySelector('.play-nback__opt[data-option="' + step.want + '"]');
        if (btn && btn.classList) btn.classList.add('play-nback__opt--truth');
      }
      await sleeper.sleep(1600);
    }
  }

  stage.className = 'play-stage';
  stage.classList.add('play-stage--teach');
  stage.innerHTML = '<p class="play-line">' + esc(NBACK_PRACTICE.practiceDone) + '</p>';
  decoratePractice(stage);
  fx.revealStage(stage);
  await sleeper.sleep(1600);
  stage.className = 'play-stage';
  stage.innerHTML = '';
  return { applied: true, retries, go_retries: 0, nogo_retries: 0 };
}

/* ─── خلاصهٔ پایان — نگاشت debrief (۱.۲۵.۳۴): فقط تمرین؛ ارزیابی هرگز عدد نمی‌بیند ───
   قاعدهٔ دامنهٔ صفر: جلسهٔ بی‌نمره (هیچ آزمون نمره‌خوردهٔ سرور) = '' — هیچ کارتی نمی‌سازد. */

const NBACK_DEBRIEF = {
  accuracy: (pct) => 'دقت امروز تو: ' + faNum(pct) + '٪',
  medianRt: (sec) => 'میانهٔ زمان حکم‌هایت: ' + faNum(sec) + ' ثانیه',
  practice: (n) => 'در تمرین شروع، ' + faNum(n) + ' بار دیگر تلاش کردی و موفق شدی.'
};

export function debriefMarkup(summary, extra) {
  const s = summary && typeof summary === 'object' ? summary : {};
  const total = s.scored_total ?? 0;
  if (!Number.isFinite(total) || total <= 0) return '';
  const correct = s.scored_correct ?? 0;
  const pct = Math.round((correct / total) * 100);
  let html = '<div class="play-debrief">' +
    '<p class="play-debrief__line">' + esc(NBACK_DEBRIEF.accuracy(pct)) + '</p>';
  if (Number.isFinite(s.median_rt) && s.median_rt > 0) {
    html += '<p class="play-debrief__muted">' +
      esc(NBACK_DEBRIEF.medianRt(Math.round(s.median_rt / 100) / 10)) + '</p>';
  }
  const retries = extra && Number.isFinite(extra.retries) ? extra.retries
    : extra && Number.isFinite(extra.go_retries) && Number.isFinite(extra.nogo_retries)
      ? extra.go_retries + extra.nogo_retries : 0;
  if (retries > 0) {
    html += '<p class="play-debrief__muted">' + esc(NBACK_DEBRIEF.practice(retries)) + '</p>';
  }
  return html + '</div>';
}
