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

/** نشان حقیقت — فقط پس از پاسخ، از بازخورد آموزشی سرور (answer_display) */
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
