/* ═══════════════════════════════════════════════════════════════
   kinds/nback.js — بازی «آلبوم خرچنگ» (ن‌پشت هم‌سانی دیداری) — ۱.۲۵.۴۰
   خرچنگ عکاس برای ماهی‌ها عکس می‌گیرد؛ کودک باید بگوید عکسِ تازه از
   «همان ماهیِ قدم قبل» است یا ماهی دیگری. اهرم سختی = پرش n (۱→۲)
   روی خود سرور (ریجستری/مرحله‌ها) — این ماژول فقط نمایش است.
   ماژول نمایش: شاخهٔ انتخاب زمان‌دار (timedchoice) — دو گزینهٔ ثابت
   «همان است»=۰ / «فرق دارد»=۱؛ پنجرهٔ پاسخ از stim.window_ms آیتم
   سرور می‌آید و بی‌لمس تا پایان پنجره = بی‌پاسخ (اُمیشن سمت سرور).
   نمره‌دهی فقط سمت سرور است؛ هم‌سانیِ هر محرک (stim.match) هرگز به
   این ماژول نمی‌رسد؛ کلید پاسخ فقط در بازخورد تمرین از سرور می‌آید.
   هیچ درخواست شبکه‌ای ندارد؛ بی‌صدا؛ جنبش فقط از fx (§۹).
   پارادایم مرجع — N-back هم‌سانی (Kirchner 1958؛ Jaeggi و همکاران
   ۲۰۰۳/۲۰۰۸) — پیاده‌سازی اصیل و هم‌خانوادهٔ قرارداد ماژول‌های نوع
   این سامانه (الگوی «حقه‌باز رنگ‌ها» ۱.۲۵.۳۲)؛ هیچ کد بیرونی کپی
   نشده است. گرافیک وکتوری و همهٔ متن فارسی اصیل‌اند (بدون هیچ
   دارایی بیرونی).
   ═══════════════════════════════════════════════════════════════ */

const INK = '#153E50';     /* Navy دفترچهٔ وظیفه — خط جوهری کارت‌ها */
const CREAM = '#F5F0E5';   /* پس‌زمینهٔ کارت عکس در آموزش */

/* جنبش تزئینی و صحنهٔ آموزش — همهٔ جنبش از fx با گارد کاهش‌جنبش؛ این ماژول هرگز مستقیم animate نمی‌کند */
import * as fx from '../fx.js';
import { sceneMarkup, kindHero } from '../scene.js';

/* پالت ماهی — کلیدها قرارداد بانک authored اند؛ برچسب فارسی + رنگ بدنه (کودک‌پسند).
   همان شش رنگ حقه‌باز رنگ‌ها تا درمانگر با یک زبان کار می‌کند */
const FISH = {
  red:    { fa: 'ماهی قرمز',   hex: '#D9534F' },
  blue:   { fa: 'ماهی آبی',    hex: '#3E6FD9' },
  green:  { fa: 'ماهی سبز',    hex: '#3E9B5F' },
  yellow: { fa: 'ماهی زرد',    hex: '#E9C33C' },
  orange: { fa: 'ماهی نارنجی', hex: '#E0762F' },
  purple: { fa: 'ماهی بنفش',   hex: '#8E5BB8' },
  /* چهار کلید بانک authored (nb-a/nb-b/nb-c از ده‌رنگ بانک) — سابقاً در پالت کلاینت نبودند و
     کارتِ اجرای اصلی به پلاسهولدر «این کارت عکس ندارد» می‌افتاد: P0 ممیزی فازها ۱.۲۵.۴۷ */
  teal:   { fa: 'ماهی فیروزه‌ای', hex: '#2E9E9A' },
  pink:   { fa: 'ماهی صورتی',  hex: '#D96C9E' },
  lime:   { fa: 'ماهی لیمویی', hex: '#8FB33C' },
  indigo: { fa: 'ماهی نیلی',   hex: '#4A5BB8' }
};

/* کلید ناشناخته از سرور = ماهی خاکستری بی‌نام — هیچ راهی به کلید نیست */
const FALLBACK_FISH = { fa: 'ماهی', hex: '#8A93A6' };

const DEFAULT_PROMPT = 'خرچنگ عکاس عکس تازه گرفته؛ از همان ماهیِ عکسِ قبل است یا یکی دیگر؟';

/* دو گزینهٔ ثابت ن‌پشت — اندیس‌ها قرارداد نمره‌دهی سرورند (۰=همان است، ۱=فرق دارد)؛ جابه‌جا نمی‌شوند */
const OPTIONS = [
  { label: 'همان است', cls: 'same' },
  { label: 'فرق دارد', cls: 'diff' }
];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function faNum(n) {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

function fishOf(key) {
  return key && FISH[key] ? FISH[key] : FALLBACK_FISH;
}

/** stim آیتم — ناسالم = شیء خالی */
function stimOf(item) {
  return item && item.stim && typeof item.stim === 'object' ? item.stim : {};
}

/** ماهیِ محرک — ناسالم = خاکستری امن (هیچ راهی به کلید نیست) */
function fishKeyOf(stim) {
  return typeof stim.fish === 'string' && FISH[stim.fish] ? stim.fish : null;
}

/** سطح n برای برچسب داستانی روی کارت — ناسالم/صفر = بدون برچسب؛ فقط نمایش است */
function nLabelOf(stim) {
  const n = typeof stim.n === 'number' && Number.isInteger(stim.n) && stim.n > 0 ? stim.n : 0;
  return n === 1 ? 'یک قدم به عقب' : n === 2 ? 'دو قدم به عقب' : null;
}

/** کارت عکس ماهی — قاب آلبوم با گوشهٔ نوار چسب و ماهی وکتوری؛ ایستا (جنبش از fx).
 *  ۱.۲۵.۴۱ (ممیزی): ماهی قبلی سرِ کرم‌رنگ و دم بی‌پر داشت و نیمه‌کاره دیده می‌شد؛
 *  ماهی تازه تک‌شکلِ پر است (بدنه + دم + دو باله همه با رنگ ماهی)، نوار چسب
 *  گوشهٔ راست (RTL) — تفاوت ماهی‌ها فقط در رنگ و چشم می‌ماند و هرگز از
 *  نیم‌پرِی گرافیک برداشت نمی‌شود. */
export function fishCardSvg(key) {
  const f = fishOf(key);
  return '<svg class="play-nback__card" viewBox="0 0 150 110" role="img" aria-label="' + esc(f.fa) + '">' +
    '<rect x="4" y="4" width="142" height="102" rx="14" fill="' + CREAM + '" stroke="' + INK + '" stroke-width="3"/>' +
    '<path d="M106 4 h30 v10 q0 4 -4 4 h-22 q-4 0 -4 -4 Z" fill="#E4AA46" stroke="' + INK + '" stroke-width="2"/>' +
    '<g stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M42 55 L24 42 C27 50 27 60 24 68 Z" fill="' + f.hex + '"/>' +
      '<path d="M42 55 C42 38 59 28 75 30 C91 32 101 44 105 55 C101 66 91 78 75 80 C59 82 42 72 42 55 Z" fill="' + f.hex + '"/>' +
      '<path d="M60 31 Q68 16 84 23 Q72 23 66 32 Z" fill="' + f.hex + '"/>' +
      '<path d="M64 79 Q73 91 84 81 Q75 81 70 76 Z" fill="' + f.hex + '"/>' +
      '<path d="M84 41 Q88 55 84 69" fill="none"/>' +
      '<path d="M103 60 q-4 4 -9 3" fill="none"/>' +
    '</g>' +
    '<circle cx="93" cy="50" r="5.5" fill="#FFFFFF" stroke="' + INK + '" stroke-width="2"/>' +
    '<circle cx="94.5" cy="51.5" r="2.4" fill="' + INK + '"/>' +
    '</svg>';
}

/** دکمهٔ گزینه — دو گزینهٔ ثابت با نشان خرچنگ کوچک؛ اندیس data-option قرارداد سرور است */
function optionBtn(i) {
  const o = OPTIONS[i];
  return '<button type="button" class="play-option play-nback__opt play-nback__opt--' + o.cls + '" data-option="' + i +
    '" aria-label="' + esc(o.label) + '">' + esc(o.label) + '</button>';
}

/** کارت آزمون ن‌پشت — عکس تازه + پرسش + دو گزینه + نوار پنجرهٔ پاسخ */
export function nbackMarkup(item) {
  const stim = stimOf(item);
  const key = fishKeyOf(stim);
  if (!key) return '<p class="play-muted">این کارت عکس ندارد.</p>';
  const prompt = item.prompt && String(item.prompt).trim() !== '' ? esc(item.prompt) : DEFAULT_PROMPT;
  const nLabel = nLabelOf(stim);
  return '<div class="play-nback">' +
    '<div class="play-nback__photorew">' +
      '<p class="play-nback__prompt">' + prompt + '</p>' +
      (nLabel ? '<span class="play-nback__nlabel">' + esc(nLabel) + '</span>' : '') +
    '</div>' +
    '<div class="play-nback__photo">' + fishCardSvg(key) + '</div>' +
    '<div class="play-nback__options" aria-label="' + faNum(OPTIONS.length) + ' گزینه">' +
      OPTIONS.map((_, i) => optionBtn(i)).join('') +
    '</div>' +
    '<div class="play-nback__timer" aria-hidden="true"><span style="width:100%"></span></div>' +
    '</div>';
}

/** نشان حقیقت — برچسب گزینهٔ درست از سرور (فقط تمرین، پس از پاسخ)؛ دکمهٔ هم‌نام را آرام نشان می‌دهد */
export function nbackRevealTruth(item, stage, answerDisplay) {
  if (typeof answerDisplay !== 'string' || answerDisplay.trim() === '') return null;
  const opts = stage && stage.querySelectorAll ? stage.querySelectorAll('.play-nback__opt') : null;
  if (!opts || opts.length === 0) return null;
  const want = answerDisplay.trim();
  for (const b of opts) {
    if (b.textContent && b.textContent.trim() === want && b.classList) {
      b.classList.add('play-nback__opt--truth');
      return b;
    }
  }
  return null;
}

/** مرکز اولین پاسخ برای انفجار ذرات موفقیت (fx.burstAt) — دکمهٔ انتخاب‌شده یا کارت عکس */
export function nbackResponsePoint(stage) {
  if (!stage || !stage.querySelector) return null;
  const picked = stage.querySelector('.play-nback__opt--picked, .play-option--picked, .play-nback__opt--truth');
  const el = picked || stage.querySelector('.play-nback__card');
  if (!el || !el.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** SVG محرک برای پیش‌نمایش آموزش — کارت عکس ماهی */
export function stimSvg(stim) {
  const s = stim && typeof stim === 'object' ? stim : {};
  return fishCardSvg(typeof s.fish === 'string' ? s.fish : null);
}

/* ─── قدم‌های آموزش — ایستا؛ هیچ ردی از کلید پاسخ یا آیتم پروب ─── */

function sampleCard(key) {
  return '<div class="play-nback play-nback--sample">' + fishCardSvg(key) + '</div>';
}

function sampleOptions(truthIdx) {
  const row = OPTIONS.map((o, i) => {
    const truth = i === truthIdx ? ' play-nback__opt--truth' : '';
    return '<div class="play-option play-nback__opt play-nback__opt--' + o.cls + truth + '" data-option="' + i + '">' + esc(o.label) + '</div>';
  }).join('');
  return '<div class="play-nback play-nback--sample">' +
    '<div class="play-nback__options">' + row + '</div>' +
    '</div>';
}

/** سه قدم آموزش روبه‌کودک — hint شکل سروری دارد (hint.nback.{label, stim:{fish}})؛ ناسالم = پیش‌فرض امن */
export function previewSteps(hint) {
  const h = hint && hint.nback && typeof hint.nback === 'object' ? hint.nback : {};
  const s = h.stim && typeof h.stim === 'object' ? h.stim : {};
  const key = typeof s.fish === 'string' && FISH[s.fish] ? s.fish : 'orange';
  const otherKey = key === 'blue' ? 'yellow' : 'blue';
  const rule = typeof h.label === 'string' && h.label.trim() !== '' ? h.label.trim() : DEFAULT_PROMPT;
  return [
    { svg: sampleCard(key), line: rule },
    { svg: sampleOptions(-1), line: 'عکس تازه که آمد، به یادت بیاورد: عکسِ قبل چه ماهی‌ای بود؟' },
    { svg: sampleOptions(0), line: 'ماهیِ تازه همانِ عکسِ قبل بود؟ «همان است» را لمس کن؛ ماهی دیگری بود؟ «فرق دارد».' }
  ];
}

/* ═══════════════════════════════════════════════════════════════
   G3 / ۱.۲۵.۴۰ — کارت INTRO + تمرین تعاملی «تا موفقیت» (الگوی
   حقه‌باز رنگ‌ها): دو قدم — نخست دو عکسِ همان ماهی (پاسخ: همان است)،
   بعد دو عکسِ ماهیِ دیگر (پاسخ: فرق دارد). کارت‌های تمرین از پالت
   ثابت ماژول‌اند و هیچ کلیدی ندارند؛ کلید آیتم‌های واقعی فقط سمت
   سرور می‌ماند. ارزیابی هرگز تمرین تعاملی نمی‌بیند (C1). نوار پنجره
   در تمرین بی‌جنبش می‌ماند (§۹).
   ═══════════════════════════════════════════════════════════════ */

/** کارت INTRO — نام + قانون یک‌خطی از راهنمای سرور؛ ناسالم = قانون امن ایستا */
export const intro = {
  name: 'آلبوم خرچنگ',
  rule: (hint) => {
    const h = hint && hint.nback && typeof hint.nback.label === 'string' ? hint.nback.label.trim() : '';
    return h !== '' ? h : 'عکس تازه از همان ماهیِ عکسِ قبل است؟ «همان است»؛ ماهی دیگری است؟ «فرق دارد».';
  }
};

const NBACK_PRACTICE = {
  step1: 'عکسِ قبل را خوب نگاه کن... حالا عکس تازه! همان ماهی است؟ «همان است» را لمس کن.',
  step2: 'حالا دو ماهیِ متفاوت! این یکی همانِ عکسِ قبل نیست؛ «فرق دارد» را لمس کن.',
  success: 'آفرین! حافظهٔ دریایی داری.',
  retry: 'عکسِ قبل را دوباره در ذهنت نگاه کن؛ بعد انتخاب کن.',
  retryWait: 'هر وقت آماده بودی لمس کن؛ عجله‌ای نیست.',
  practiceDone: 'تمرین تمام شد! حالا آلبوم واقعی خرچنگ باز می‌شود.'
};

const PRACTICE_WINDOW_MS = 15000;

/** صحنهٔ تمرین — دکور پس‌زمینهٔ لایه‌های دریا؛ جنبش از fx؛ بی‌اثر برای پاسخ */
function decoratePractice(stage) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup('teach', { svg: kindHero('nback') })); // قهرمان این بازی — پوستهٔ اختصاصی ۱.۲۵.۴۱
  fx.sceneAmbient(stage);
}

/** یک لمس روی دو گزینه یا یک پنجرهٔ زمانی — هر کدام زودتر؛ خواب یدکی در هر دو مسیر cancel می‌شود */
function tapOptionWithin(stage, ms, sleeper) {
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

/** قدم تمرین — دو عکس پشت‌سرهم با فاصلهٔ آرام؛ پاسخ روی عکسِ دوم سنجیده می‌شود */
function practicePairHtml(badge, firstKey, secondKey, line) {
  return (badge ? '<span class="play-step-badge">' + esc(badge) + '</span>' : '') +
    '<div class="play-nback play-nback--sample">' +
      '<div class="play-nback__pair">' +
        '<div class="play-nback__pair-item">' + fishCardSvg(firstKey) + '<span class="play-nback__pair-label">عکسِ قبل</span></div>' +
        '<div class="play-nback__pair-item">' + fishCardSvg(secondKey) + '<span class="play-nback__pair-label">عکسِ تازه</span></div>' +
      '</div>' +
    '</div>' +
    '<p class="play-line">' + esc(line) + '</p>' +
    sampleOptions(-1);
}

/**
 * تمرین تعاملی «آلبوم خرچنگ» — دو قدم با تکرار بی‌سرزنش تا موفقیت:
 *   قدم ۱: دو عکسِ همان ماهی → «همان است»؛ قدم ۲: دو ماهیِ متفاوت → «فرق دارد».
 *   هر دو عکس از پالت ثابت ماژول‌اند (کارت تمرین، نه آیتم بانک) — کلید سرور نمی‌بیند.
 *   پس از دو تلاش، گزینهٔ درست آرام نشان داده می‌شود (آموزش پس از پاسخ).
 * خروجی: { applied, retries, go_retries: 0, nogo_retries: 0 } — صفرهای نام‌دار فقط
 *   برای سازگاری با قرارداد practiceRetries جلسه‌اند و تلاش واقعی در retries می‌آید.
 */
export async function practiceInteractive(ctx) {
  const { stage, sleeper, hint } = ctx || {};
  if (!stage || !sleeper) return { applied: false, retries: 0 };
  const h = hint && hint.nback && typeof hint.nback === 'object' ? hint.nback : {};
  const s = h.stim && typeof h.stim === 'object' ? h.stim : {};
  const key = typeof s.fish === 'string' && FISH[s.fish] ? s.fish : 'orange';
  const otherKey = key === 'blue' ? 'yellow' : 'blue';
  const steps = [
    { badge: 'قدم ۱ از ۲', first: key, second: key, want: 0, line: NBACK_PRACTICE.step1 },
    { badge: 'قدم ۲ از ۲', first: key, second: otherKey, want: 1, line: NBACK_PRACTICE.step2 }
  ];
  let retries = 0;

  for (const step of steps) {
    let misses = 0;
    for (;;) {
      stage.className = 'play-stage';
      stage.classList.add('play-stage--teach');
      stage.innerHTML = practicePairHtml(step.badge, step.first, step.second, step.line);
      decoratePractice(stage);
      fx.revealStage(stage);
      fx.popIn(stage.querySelector('.play-nback__card'), 240, false);
      const picked = await tapOptionWithin(stage, PRACTICE_WINDOW_MS, sleeper);
      if (picked !== null && picked === step.want) {
        stage.innerHTML = practicePairHtml(step.badge, step.first, step.second, NBACK_PRACTICE.success);
        decoratePractice(stage);
        fx.revealStage(stage);
        const el = stage.querySelector('.play-nback__opt');
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
      stage.innerHTML = practicePairHtml(step.badge, step.first, step.second, line);
      decoratePractice(stage);
      fx.revealStage(stage);
      if (misses >= 2) {
        const opts = stage.querySelectorAll('.play-nback__opt');
        if (opts && opts[step.want] && opts[step.want].classList) opts[step.want].classList.add('play-nback__opt--truth');
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

/** خلاصهٔ پایان جلسه — الگوی createDebrief با قاعدهٔ دامنهٔ صفر: جلسهٔ بی‌آزمون
 *  نمره‌خورده = '' (هیچ عدد ساختگی نمی‌آید)؛ فقط مسیر تمرین صدا می‌زند — ارزیابی
 *  هرگز عدد نمی‌بیند (C1). ورودی از session.js ساخته می‌شود و فقط دادهٔ مجاز
 *  کلاینت را می‌بیند: scored_total/scored_correct از بازخورد سرور (فقط آیتم‌های
 *  train نمره برمی‌گردانند؛ پروب‌ها هرگز)، median_rt از رکورد موتور. */
export function debriefMarkup(summary, extra) {
  const s = summary && typeof summary === 'object' ? summary : {};
  const total = s.scored_total ?? 0;
  const correct = s.scored_correct ?? 0;
  if (!Number.isFinite(total) || total <= 0) return '';
  const pct = Math.round((correct / total) * 100);
  let html = '<div class="play-debrief">' +
    '<p class="play-debrief__line">دقت امروزت در آلبوم خرچنگ: ٪' + esc(faNum(pct)) + '</p>';
  if (Number.isFinite(s.median_rt) && s.median_rt > 0) {
    html += '<p class="play-debrief__muted">میانهٔ زمان پاسخ‌هایت: ' +
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
