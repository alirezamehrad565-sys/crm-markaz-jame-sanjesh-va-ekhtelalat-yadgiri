/* ═══════════════════════════════════════════════════════════════
   kinds/stroop.js — بازی «حقه‌باز رنگ‌ها» (استروپ) — ۱.۲۵.۳۲ — ۱۴۰۵/۰۸/۱۷
   ماژول نمایش: واژهٔ رنگ به جوهرِ اشتباه کشیده می‌شود؛ کودک رنگِ جوهر را
   در میان لکه‌های رنگ لمس می‌کند — نه معنی واژه. نشانِ جواب درست فقط تمرین.
   حس عدی در صحنه است (غار شبِ بنفش-نیلی، حاشیهٔ هشدار ایستا، وکتور حقه‌باز
   پیه‌سوز بدجنس ولی کودک‌پسند) — هرگز در گفتار با کودک (§۲).
   نمره‌دهی فقط سمت سرور است؛ کلید پاسخ (اندیس رنگ جوهر) هرگز به این ماژول
   نمی‌رسد؛ هیچ درخواست شبکه‌ای ندارد. بی‌صدا؛ جنبش فقط از fx (§۹).
   منبع اقتباس — مجوز MIT:
   · jspsych/jspsych-timelines — packages/stroop-task (@jspsych-timelines/stroop-task,
     https://github.com/jspsych/jspsych-timelines) — مولد ضرب‌دکارتی واژه×جوهر،
     پرچم congruent، correct_response = اندیس رنگ جوهر در گزینه‌ها، پنجرهٔ
     زمانی پاسخ (trial_timeout) و بازخورد تمرین از همین تایم‌لاین اقتباس و به
     قرارداد این سامانه (timedchoice، stim.window_ms، پاسخ {option}) وفق شد.
   · jsPsych هسته (https://github.com/jspsych/jsPsych) — مجوز MIT.
   گرافیک وکتوری و همهٔ متن فارسی اصیل‌اند (بدون هیچ دارایی بیرونی).
   ═══════════════════════════════════════════════════════════════ */

const INK = '#153E50';     /* Navy دفترچهٔ وظیفه — خط جوهری لکه‌ها و حقه‌باز */
const CREAM = '#F5F0E5';   /* پس‌زمینهٔ کارت واژه در آموزش */

/* پالت ثابت ۶ رنگ — کلیدها قرارداد بانک‌اند؛ برچسب فارسی + رنگ جوهر (کودک‌پسند) */
const PALETTE = {
  red:    { fa: 'قرمز',   hex: '#D9534F' },
  blue:   { fa: 'آبی',    hex: '#3E6FD9' },
  green:  { fa: 'سبز',    hex: '#3E9B5F' },
  yellow: { fa: 'زرد',    hex: '#E9C33C' },
  orange: { fa: 'نارنجی', hex: '#E0762F' },
  purple: { fa: 'بنفش',   hex: '#8E5BB8' }
};

/* کلید ناشناخته از سرور = لکهٔ خاکستری بی‌نام — اندیس گزینه‌ها دست نمی‌خورد */
const FALLBACK_SWATCH = { fa: 'رنگ', hex: '#8A93A6' };

const DEFAULT_PROMPT = 'حقه‌باز رنگِ واژه را عوض می‌کند؛ تو رنگِ واقعی را لمس کن.';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function faNum(n) {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

function paletteOf(key) {
  return key && PALETTE[key] ? PALETTE[key] : FALLBACK_SWATCH;
}

/** stim آیتم — ناسالم = شیء خالی */
function stimOf(item) {
  return item && item.stim && typeof item.stim === 'object' ? item.stim : {};
}

/** واژهٔ محرک — ناسالم = پیش‌فرض امن آموزش (هیچ راهی به کلید نیست) */
function wordOf(stim) {
  return typeof stim.word === 'string' && stim.word.trim() !== '' ? stim.word : 'قرمز';
}

/** کلید جوهر — ناسالم = آبی (پیش‌فرض امن) */
function inkKeyOf(stim) {
  return typeof stim.ink === 'string' && PALETTE[stim.ink] ? stim.ink : 'blue';
}

/**
 * گزینه‌ها — ترتیب عیناً بانک می‌ماند تا اندیس‌ها با کلید سرور هم‌تراز بمانند؛
 * کلید ناشناخته حذف نمی‌شود (فقط لکهٔ خاکستری می‌شود) — اندیس‌ها یگانه می‌مانند.
 */
function optionsOf(item) {
  return item && Array.isArray(item.options) ? item.options.filter((k) => typeof k === 'string') : [];
}

/* ستون‌های شبکهٔ گزینه‌ها — ۲ ستون تا ۴ گزینه، ۳ ستون برای ۵ و ۶ گزینه */
function colsFor(n) {
  return n >= 5 ? 3 : 2;
}

/** وکتور حقه‌باز — چهرهٔ شیطان‌مَس پیه‌سوز با لکهٔ دودهٔ بنفش؛ بدجنس ولی کودک‌پسند، بی‌ترس */
export function tricksterSvg() {
  const SOOT = '#4A3F63';
  return '<svg class="play-stroop__trickster" viewBox="0 0 120 108" role="img" aria-hidden="true">' +
    '<g fill="#E4AA46" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M38 26 C30 12 44 6 50 16"/>' +
      '<path d="M82 26 C90 12 76 6 70 16"/>' +
      '<path d="M20 52 C8 48 10 62 22 62"/>' +
      '<path d="M100 52 C112 48 110 62 98 62"/>' +
      '<path d="M60 12 C88 12 102 34 100 58 C98 84 82 98 60 98 C38 98 22 84 20 58 C18 34 32 12 60 12 Z"/>' +
    '</g>' +
    '<path d="M34 42 q10 -7 20 -1 q7 5 3 13 q-13 5 -21 -1 q-7 -5 -2 -11 Z" fill="#4A3F63" opacity="0.85"/>' +
    '<g fill="' + INK + '"><circle cx="44" cy="50" r="4.5"/><circle cx="75" cy="48" r="5.5"/></g>' +
    '<circle cx="77" cy="46" r="1.8" fill="' + CREAM + '"/>' +
    '<g fill="none" stroke="' + INK + '" stroke-width="2.5" stroke-linecap="round">' +
      '<path d="M33 38 q9 -6 18 -3"/><path d="M67 35 q10 -1 16 5"/>' +
      '<path d="M42 68 Q61 84 81 65"/><path d="M50 88 q10 6 22 2"/>' +
    '</g>' +
    '<path d="M56 76 q3 3 7 0 l0 5 q-3.5 3 -7 0 Z" fill="' + CREAM + '" stroke="' + INK + '" stroke-width="1.6"/>' +
    '<path d="M62 82 q2 9 12 7 q0 -7 -8 -9 Z" fill="#D96C6C" stroke="' + INK + '" stroke-width="1.8"/>' +
    '</svg>';
}

/** لکهٔ رنگ گزینه — قطرهٔ جوهر با حاشیهٔ Navy و برق کوچک */
function blobSvg(hex) {
  return '<svg class="play-stroop__blob" viewBox="0 0 64 64" aria-hidden="true">' +
    '<path d="M32 7 C45 5 56 14 58 27 C60 40 53 52 40 56 C27 60 12 55 8 43 C4 31 10 13 23 9 C26 8 29 8 32 7 Z" fill="' + hex +
      '" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<ellipse cx="24" cy="22" rx="7" ry="5" fill="#FFFFFF" opacity="0.4" transform="rotate(-18 24 22)"/>' +
    '</svg>';
}

/** کارت واژهٔ آموزش — واژه با جوهر رنگِ اشتباه روی کارت کرم (ایستا) */
function wordCardSvg(word, hex, inkFa) {
  return '<svg class="play-stroop__card" viewBox="0 0 160 92" role="img" aria-label="واژهٔ ' + esc(word) + ' با جوهرِ ' + esc(inkFa) + '">' +
    '<rect x="3" y="3" width="154" height="86" rx="18" fill="' + CREAM + '" stroke="' + INK + '" stroke-width="3"/>' +
    '<text x="80" y="58" text-anchor="middle" font-size="34" font-weight="700" fill="' + hex + '" style="font-family:inherit">' + esc(word) + '</text>' +
    '</svg>';
}

function optionBtn(key, i) {
  const c = paletteOf(key);
  return '<button type="button" class="play-option play-stroop__opt" data-option="' + i + '" aria-label="' + esc(c.fa) + '">' +
    blobSvg(c.hex) +
    '<span class="play-stroop__optname">' + esc(c.fa) + '</span>' +
    '</button>';
}

/** کارت آزمون استروپ — قاعده + واژهٔ حقه‌باز‌شده + لکه‌های رنگ + نوار پنجرهٔ پاسخ */
export function stroopMarkup(item) {
  const opts = optionsOf(item);
  if (opts.length === 0) return '<p class="play-muted">این کارت رنگ ندارد.</p>';
  const stim = stimOf(item);
  const word = wordOf(stim);
  const ink = paletteOf(inkKeyOf(stim));
  const prompt = item.prompt && String(item.prompt).trim() !== '' ? esc(item.prompt) : DEFAULT_PROMPT;
  return '<div class="play-stroop">' +
    '<div class="play-stroop__trickrow">' + tricksterSvg() +
      '<p class="play-stroop__prompt">' + prompt + '</p>' +
    '</div>' +
    '<div class="play-stroop__word" style="color:' + ink.hex + '" role="img" aria-label="واژهٔ ' + esc(word) +
      ' نوشته‌شده با جوهرِ ' + esc(ink.fa) + '">' + esc(word) + '</div>' +
    '<div class="play-stroop__options" style="--stroop-cols:' + colsFor(opts.length) +
      '" aria-label="' + faNum(opts.length) + ' لکهٔ رنگ">' +
      opts.map((k, i) => optionBtn(k, i)).join('') +
    '</div>' +
    '<div class="play-stroop__timer" aria-hidden="true"><span style="width:100%"></span></div>' +
    '</div>';
}

/** نشان حقیقت — برچسب گزینهٔ درست از سرور (فقط تمرین، پس از پاسخ)؛ لکهٔ هم‌نام را آرام نشان می‌دهد */
export function stroopRevealTruth(item, stage, answerDisplay) {
  if (typeof answerDisplay !== 'string' || answerDisplay.trim() === '') return null;
  const opts = stage && stage.querySelectorAll ? stage.querySelectorAll('.play-stroop__opt') : null;
  if (!opts || opts.length === 0) return null;
  const want = answerDisplay.trim();
  for (const b of opts) {
    const name = b.querySelector ? b.querySelector('.play-stroop__optname') : null;
    if (name && name.textContent && name.textContent.trim() === want && b.classList) {
      b.classList.add('play-stroop__opt--truth');
      return b;
    }
  }
  return null;
}

/**
 * مرکز اولین پاسخ برای انفجار ذرات موفقیت (fx.burstAt) —
 * دکمهٔ نشان‌گذاری‌شدهٔ برنچ timedchoice اگر باشد، وگرنه مرکز واژهٔ محرک.
 */
export function stroopResponsePoint(stage) {
  if (!stage || !stage.querySelector) return null;
  const picked = stage.querySelector('.play-stroop__opt--picked, .play-option--picked, .play-stroop__opt--truth');
  const el = picked || stage.querySelector('.play-stroop__word');
  if (!el || !el.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** SVG محرک برای پیش‌نمایش آموزش — کارت واژه با جوهر رنگ */
export function stimSvg(stim) {
  const s = stim && typeof stim === 'object' ? stim : {};
  const word = typeof s.word === 'string' && s.word.trim() !== '' ? s.word : 'آبی';
  const ink = s.ink && PALETTE[s.ink] ? PALETTE[s.ink] : PALETTE.red;
  return wordCardSvg(word, ink.hex, ink.fa);
}

/* ─── قدم‌های آموزش — ایستا؛ هیچ ردی از کلید پاسخ یا آیتم پروب ─── */

function sampleWordCard(word, inkKey) {
  const ink = paletteOf(inkKey);
  return '<div class="play-stroop play-stroop--sample">' + wordCardSvg(word, ink.hex, ink.fa) + '</div>';
}

function sampleOptions(keys, truthIdx) {
  const row = keys.map((k, i) => {
    const c = paletteOf(k);
    const truth = i === truthIdx ? ' play-stroop__opt--truth' : '';
    return '<div class="play-option play-stroop__opt' + truth + '">' + blobSvg(c.hex) +
      '<span class="play-stroop__optname">' + esc(c.fa) + '</span></div>';
  }).join('');
  return '<div class="play-stroop play-stroop--sample">' +
    '<div class="play-stroop__options" style="--stroop-cols:' + colsFor(keys.length) + '">' + row + '</div>' +
    '</div>';
}

/** سه قدم آموزش روبه‌کودک — hint شکل سروری دارد (hint.stroop.{label, stim:{word, ink}})؛ ناسالم = پیش‌فرض امن */
export function previewSteps(hint) {
  const h = hint && hint.stroop && typeof hint.stroop === 'object' ? hint.stroop : {};
  const s = h.stim && typeof h.stim === 'object' ? h.stim : {};
  const word = typeof s.word === 'string' && s.word.trim() !== '' ? s.word : 'آبی';
  const inkKey = typeof s.ink === 'string' && PALETTE[s.ink] ? s.ink : 'red';
  const ink = PALETTE[inkKey];
  const otherKey = inkKey === 'blue' ? 'yellow' : 'blue';
  const rule = typeof h.label === 'string' && h.label.trim() !== '' ? h.label.trim() : DEFAULT_PROMPT;
  return [
    { svg: sampleWordCard(word, inkKey), line: rule },
    { svg: sampleOptions([inkKey, otherKey], -1), line: 'رنگی را لمس کن که واژه با آن نوشته شده — نه چیزی که واژه می‌گوید.' },
    { svg: sampleOptions([inkKey, otherKey], 0), line: 'مثلاً «' + word + '» با جوهرِ ' + ink.fa + ' نوشته شده؛ ' + ink.fa + ' را لمس کن.' }
  ];
}
