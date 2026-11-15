/* ═══════════════════════════════════════════════════════════════
   kinds/numline.js — بازی «جادهٔ عددها» (خط عددی) — ۱.۲۵.۲۸
   ماژول نمایش: ساخت جادهٔ عددی، تبدیل لمس به مقدار، نشان‌های حدس/حقیقت.
   نمره‌دهی فقط سمت سرور است؛ این ماژول هیچ کلیدی نمی‌داند و هیچ
   درخواست شبکه‌ای ندارد. بی‌صدا؛ بدون فلاش؛ جنبش فقط از fx.js (§۹).
   جادهٔ عدد ریاضی چپ‌به‌راست است (۰ در چپ) — مطابق کتاب درسی؛ داخل
   جاده dir='ltr' تا جهت فارسی صفحه آن را برنگرداند.
   ═══════════════════════════════════════════════════════════════ */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

/* جنبش تزئینی و صحنهٔ آموزش — همهٔ جنبش از fx با گارد کاهش‌جنبش؛ این ماژول هرگز مستقیم animate نمی‌کند */
import * as fx from '../fx.js';
import { sceneMarkup, kindHero } from '../scene.js';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function rangeOf(item) {
  const r = item && Array.isArray(item.range) ? item.range : null;
  if (!r || r.length !== 2 || typeof r[0] !== 'number' || typeof r[1] !== 'number' || r[1] <= r[0]) return null;
  return r;
}

/* گام تیک و برچسب از خود گستره — هیچ عدد جادویی؛ جادهٔ بزرگ‌تر تیک خلاصه‌تر */
function stepsOf(span) {
  if (span <= 10) return { tick: 1, label: 1 };
  if (span <= 20) return { tick: 2, label: 5 };
  if (span <= 50) return { tick: 5, label: 10 };
  return { tick: 10, label: 20 };
}

/** جادهٔ عددی آیتم — پرامپت + چیپ عدد + ریل با تیک/برچسب + دو جای نشان (حدس/حقیقت) */
export function numlineMarkup(item) {
  const r = rangeOf(item);
  if (!r) return '<p class="play-muted">این آیتم جاده ندارد.</p>';
  const [min, max] = r;
  const span = max - min;
  const { tick, label } = stepsOf(span);
  const num = item.stim && typeof item.stim.number === 'number' ? item.stim.number : null;
  let ticks = '';
  let labels = '';
  for (let v = min; v <= max; v += tick) {
    const pct = ((v - min) / span) * 100;
    const isLabel = (v - min) % label === 0;
    ticks += '<span class="play-numline__tick' + (isLabel ? ' play-numline__tick--lab' : '') +
      '" style="left:' + pct + '%"></span>';
    if (isLabel) labels += '<span class="play-numline__lab" style="left:' + pct + '%">' + faNum(v) + '</span>';
  }
  return '<div class="play-numline">' +
    (item.prompt ? '<p class="play-numline__prompt">' + esc(item.prompt) + '</p>' : '') +
    (num !== null ? '<div class="play-numline__chip">' + faNum(num) + '</div>' : '') +
    '<div class="play-numline__road" dir="ltr">' +
      '<div class="play-numline__rail"></div>' + ticks + labels +
      '<span class="play-numline__mark play-numline__mark--truth" hidden></span>' +
      '<span class="play-numline__mark play-numline__mark--guess" hidden></span>' +
    '</div>' +
    '</div>';
}

/** تبدیل لمس روی جاده به مقدار — گرد به صحیح، کران‌دار به گسترهٔ آیتم */
export function numlineValueFromTap(item, stage, ev) {
  const r = rangeOf(item);
  const road = stage.querySelector('.play-numline__road');
  if (!r || !road) return null;
  const box = road.getBoundingClientRect();
  if (!box.width) return null;
  let frac = (ev.clientX - box.left) / box.width;
  frac = Math.max(0, Math.min(1, frac));
  const raw = r[0] + frac * (r[1] - r[0]);
  return Math.max(r[0], Math.min(r[1], Math.round(raw)));
}

function placeMark(stage, cls, value, item) {
  const r = rangeOf(item);
  const mark = stage.querySelector(cls);
  if (!r || !mark) return null;
  const pct = ((value - r[0]) / (r[1] - r[0])) * 100;
  mark.style.left = Math.max(0, Math.min(100, pct)) + '%';
  mark.hidden = false;
  return mark;
}

/** نشان حدس کودک — پس از لمس؛ عنصر برای جنبش پاپ از fx */
export function numlinePlaceGuess(item, stage, value) {
  return placeMark(stage, '.play-numline__mark--guess', value, item);
}

/** نشان حقیقت — فقط پس از پاسخ، از بازخورد آموزشی سرور؛ فقط تمرین */
export function numlineRevealTruth(item, stage, value) {
  return placeMark(stage, '.play-numline__mark--truth', value, item);
}

/** مرکز نشان حدس در مختصات صفحه — هدف انفجار ذره‌ای موفقیت (fx.burstAt) */
export function numlineGuessPoint(stage) {
  const m = stage.querySelector('.play-numline__mark--guess');
  if (!m || m.hidden) return null;
  const r = m.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** نمونهٔ کوچک جاده برای قدم آموزش — بی‌کلید؛ فقط شکل کار */
function roadSample(withMark) {
  let ticks = '';
  for (let v = 0; v <= 10; v++) {
    const pct = v * 10;
    ticks += '<span class="play-numline__tick' + (v % 1 === 0 ? ' play-numline__tick--lab' : '') +
      '" style="left:' + pct + '%"></span>';
    ticks += '<span class="play-numline__lab" style="left:' + pct + '%">' + faNum(v) + '</span>';
  }
  const mark = withMark
    ? '<span class="play-numline__mark play-numline__mark--guess" style="left:70%"></span>'
    : '';
  return '<div class="play-numline play-numline--sample">' +
    '<div class="play-numline__road" dir="ltr">' +
      '<div class="play-numline__rail"></div>' + ticks + mark +
    '</div></div>';
}

/** وکتور سادهٔ جاده برای قرارداد stimSvg — در تمرین گو/نوگو استفاده نمی‌شود */
export function stimSvg() {
  return '<svg class="play-svg" viewBox="0 0 120 40" role="img" aria-hidden="true">' +
    '<line x1="8" y1="20" x2="112" y2="20" stroke="#438C89" stroke-width="4" stroke-linecap="round"/>' +
    '<circle cx="8" cy="20" r="5" fill="#E4AA46" stroke="#153E50" stroke-width="2"/>' +
    '<circle cx="112" cy="20" r="5" fill="#E4AA46" stroke="#153E50" stroke-width="2"/>' +
    '</svg>';
}

/** قدم آموزش «جادهٔ عددها» — ایستا؛ هیچ ردی از کلید پاسخ یا آیتم پروب */
export function previewSteps() {
  return [
    { svg: roadSample(false), line: 'این جادهٔ عددهاست؛ از ۰ شروع می‌شود و تا انتهای جاده می‌رود.' },
    { svg: '<div class="play-numline play-numline--sample"><div class="play-numline__chip">۷</div></div>',
      line: 'یک عدد می‌آید؛ جای درستش را روی جاده لمس کن.' },
    { svg: roadSample(true), line: 'هر چه دقیق‌تر، ستارهٔ بیشتر! اگر سخت بود، با هم نگاهش می‌کنیم.' }
  ];
}

/* ═══════════════════════════════════════════════════════════════
   G3 / ۱.۲۵.۳۷ — کارت INTRO + تمرین تعاملی «تا موفقیت» (اقتباس حلقهٔ
   تمرین بستهٔ jsPsych-timelines/go-nogo، همان الگوی گونوگو ۱.۲۵.۳۴):
   تکرار بی‌نهایتِ هر قدم با بازخورد آرام بی‌سرزنش تا موفقیت؛ پنجرهٔ
   سخاوتمند؛ محتوای تمرین دانش عمومی خود جاده است (جای عدد ۰..۱۰) —
   کلید پاسخ آیتم‌های واقعی هرگز این‌جا نیست؛ نمره فقط سرور می‌دهد.
   ارزیابی هرگز تمرین تعاملی نمی‌بیند (C1 — مصرف تمرین).
   ═══════════════════════════════════════════════════════════════ */

/** کارت INTRO — نام + قانون یک‌خطی از راهنمای سرور؛ ناسالم = قانون امن ایستا */
export const intro = {
  name: 'جادهٔ عددها',
  rule: (hint) => {
    const h = hint && hint.numline && typeof hint.numline.label === 'string' ? hint.numline.label.trim() : '';
    return h !== '' ? h : 'عدد که آمد، جای درستش را روی جاده لمس کن.';
  }
};

const NUMLINE_PRACTICE = {
  stepLine: (n) => 'جای عدد ' + faNum(n) + ' روی جاده را لمس کن.',
  success: (n) => 'آفرین! جای عدد ' + faNum(n) + ' را پیدا کردی.',
  retryNear: 'نزدیک بود! کمی دقیق‌تر لمس کن.',
  retryWait: 'هر وقت آماده بودی لمس کن؛ جای عدد تغییر نمی‌کند.',
  practiceDone: 'تمرین تمام شد! حالا جادهٔ واقعی شروع می‌شود.'
};

/* جادهٔ تمرین ۰..۱۰ و دو عدد قدم آموزش — ثابت و امن؛ جای عدد روی جاده دانش عمومی است
   (مثل برچسب ردپاهای رد پای دزد)، پس لمسِ تمرین هیچ کلیدی را لو نمی‌دهد.
   کنارِ سخاوتمند آموزش: فاصله تا عدد هدف = یک واحد — آموزش است نه سنجه. */
const PRACTICE_RANGE = [0, 10];
const PRACTICE_TARGETS = [7, 3];
const PRACTICE_NEAR = 1;
const PRACTICE_WINDOW_MS = 15000;

/** صحنهٔ تمرین — دکور پس‌زمینهٔ لایه‌های دریا؛ جنبش از fx؛ بی‌اثر برای پاسخ */
function decoratePractice(stage) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup('teach', { svg: kindHero('numline') })); // قهرمان این بازی — پوستهٔ اختصاصی ۱.۲۵.۴۱
  fx.sceneAmbient(stage);
}

/** یک لمس روی جاده یا یک پنجرهٔ زمانی — هر کدام زودتر؛ خواب یدکی در هر دو مسیر cancel می‌شود */
function tapRoadWithin(stage, fakeItem, ms, sleeper) {
  return new Promise((resolve) => {
    const road = stage.querySelector('.play-numline__road');
    let done = false;
    const finish = (ev) => {
      if (done) return;
      done = true;
      if (road) road.removeEventListener('pointerdown', onTap);
      sleeper.cancel(); // خواب یدکی یتیم نمی‌ماند — همان قاعدهٔ پنجرهٔ گو/نوگو
      resolve(ev && road ? numlineValueFromTap(fakeItem, stage, ev) : null);
    };
    const onTap = (ev) => { ev.preventDefault(); finish(ev); };
    if (road) road.addEventListener('pointerdown', onTap);
    sleeper.sleep(ms).then(() => finish(null));
  });
}

function practiceCardHtml(badge, fakeItem, line) {
  return (badge ? '<span class="play-step-badge">' + esc(badge) + '</span>' : '') +
    numlineMarkup(fakeItem) +
    '<p class="play-line">' + esc(line) + '</p>';
}

/**
 * تمرین تعاملی «جادهٔ عددها» — دو قدم لمس جای عدد با تکرار بی‌سرزنش تا موفقیت.
 * پس از دو تلاشِ بی‌موفقیت، نشان حقیقت همان قدم آرام نشان داده می‌شود (آموزش پس از پاسخ).
 * خروجی: { applied, retries } — applied=false یعنی صحنه/ساعت آماده نبود و مدار قدیمی
 * previewSteps باید برقرار بماند. هیچ listener و شبکه‌ای بیرون این تابع زنده نمی‌ماند.
 */
export async function practiceInteractive(ctx) {
  const { stage, sleeper } = ctx || {};
  if (!stage || !sleeper) return { applied: false, retries: 0 };
  let retries = 0;

  for (let i = 0; i < PRACTICE_TARGETS.length; i++) {
    const target = PRACTICE_TARGETS[i];
    const fakeItem = { range: PRACTICE_RANGE.slice(), stim: { number: target }, prompt: '' };
    const badge = 'قدم ' + faNum(i + 1) + ' از ' + faNum(PRACTICE_TARGETS.length);
    let misses = 0;
    for (;;) {
      stage.className = 'play-stage';
      stage.classList.add('play-stage--teach');
      stage.innerHTML = practiceCardHtml(badge, fakeItem, NUMLINE_PRACTICE.stepLine(target));
      decoratePractice(stage);
      fx.revealStage(stage);
      fx.popIn(stage.querySelector('.play-numline__chip'), 240, false);
      const value = await tapRoadWithin(stage, fakeItem, PRACTICE_WINDOW_MS, sleeper);
      if (value !== null && Math.abs(value - target) <= PRACTICE_NEAR) {
        stage.innerHTML = practiceCardHtml(badge, fakeItem, NUMLINE_PRACTICE.success(target));
        decoratePractice(stage);
        fx.revealStage(stage);
        fx.popIn(numlinePlaceGuess(fakeItem, stage, value), 240, false);
        const pt = numlineGuessPoint(stage);
        if (pt) fx.burstAt(pt.x, pt.y);
        await sleeper.sleep(1200);
        break;
      }
      retries += 1;
      misses += 1;
      const line = value === null ? NUMLINE_PRACTICE.retryWait
        : (Math.abs(value - target) <= 2 ? NUMLINE_PRACTICE.retryNear : NUMLINE_PRACTICE.retryWait);
      stage.innerHTML = practiceCardHtml(badge, fakeItem, line);
      decoratePractice(stage);
      fx.revealStage(stage);
      if (misses >= 2) fx.popIn(numlineRevealTruth(fakeItem, stage, target), 300); // آموزش پس از پاسخ
      await sleeper.sleep(1600);
    }
  }

  stage.className = 'play-stage';
  stage.classList.add('play-stage--teach');
  stage.innerHTML = '<p class="play-line">' + esc(NUMLINE_PRACTICE.practiceDone) + '</p>';
  decoratePractice(stage);
  fx.revealStage(stage);
  await sleeper.sleep(1600);
  stage.className = 'play-stage';
  stage.innerHTML = '';
  return { applied: true, retries };
}
