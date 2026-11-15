/* ═══════════════════════════════════════════════════════════════
   kinds/flanker.js — بازی «گلهٔ فریبکار» (فلانکر اریکسن) — ۱.۲۵.۳۲
   ماژول نمایش: ردیف گرگ‌های وکتور در شب دشت، دو دکمهٔ درشت چپ/راست،
   نشان حقیقت (گرگِ وسط + دکمهٔ درست) — فقط تمرین.
   منبع اقتباس: @jspsych-contrib/plugin-flanker — مخزن
   github.com/jspsych/jspsych-contrib (packages/plugin-flanker)،
   مجوز MIT (نویسنده Josh de Leeuw؛ فیلد license در package.json).
   مکانیک اقتباسی: آرایهٔ مرکز + فلانکرهای کناری، تعیین جهت هدف از
   گرگِ وسط، پاسخ دکمه‌ای چپ/راست، پنجرهٔ پاسخ با پایان آرام.
   کد از صفر با قرارداد سامانهٔ ما بازنویسی شده — فقط ایده و الگوریتم.
   مرجع مفهومی: Eriksen & Eriksen (1974).
   حس عدی در صحنه است (شب دشت، ماه کامل، گرگ‌های قلابی چشم‌قرمز محو)
   — هرگز در گفتار با کودک (§۲). نمره‌دهی فقط سمت سرور است؛ کلید پاسخ
   («correct») هرگز به این ماژول نمی‌رسد؛ هیچ درخواست شبکه‌ای ندارد.
   بی‌صدا؛ جنبش فقط از fx (§۹)؛ تفاوت گرگ واقعی و قلابی فقط چشم است:
   کهربایی روشن = واقعی، قرمزِ محو = قلابی (بعد حواس‌پرتی یگانه، کودک‌پسند).
   ═══════════════════════════════════════════════════════════════ */

const INK = '#1F2733';       /* شب دشت — خط جوهری گرگ */
const BODY = '#8E97A8';      /* خاکستری-نیلی — بدنهٔ گرگ (واقعی و قلابی یکسان) */
const EYE_REAL = '#FFC46B';  /* کهربایی روشن — چشم گرگ واقعی (وسط) */
const EYE_FAKE = '#C4605F';  /* قرمزِ محو — چشم گرگ قلابی */
const MOON = '#F3EEDC';      /* ماه کامل وکتوری */
const MOON_DARK = '#E2D9BC'; /* دهانه‌های ماه */

const DEFAULT_PROMPT = 'گرگ‌های قلابی سرک می‌کشند؛ فقط نگاهِ گرگِ وسط را دنبال کن.';

const ARROW_L = '<svg class="play-flanker__arrow" viewBox="0 0 48 48" aria-hidden="true">' +
  '<path d="M30 10 L16 24 L30 38" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_R = '<svg class="play-flanker__arrow" viewBox="0 0 48 48" aria-hidden="true">' +
  '<path d="M18 10 L32 24 L18 38" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* جنبش تزئینی و صحنهٔ آموزش — همهٔ جنبش از fx با گارد کاهش‌جنبش؛ این ماژول هرگز مستقیم animate نمی‌کند */
import * as fx from '../fx.js';
import { sceneMarkup, kindHero } from '../scene.js';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** آرایهٔ جهت گرگ‌ها — فقط 'L'/'R'، طول فرد ۳..۷؛ ناسالم = ['L','L','L'] (پیش‌فرض امن) */
function arrowsOf(item) {
  const s = item && item.stim && typeof item.stim === 'object' ? item.stim : {};
  const raw = Array.isArray(s.arrows) ? s.arrows : [];
  const ok = raw.length >= 3 && raw.length <= 7 && raw.length % 2 === 1 &&
    raw.every((v) => v === 'L' || v === 'R');
  return ok ? raw.slice() : ['L', 'L', 'L'];
}

/** جابه‌جایی ایستای فاصله‌ها (مرحلهٔ د) — عدد کلان‌شدهٔ ۸-..۸؛ ناسالم = null */
function jitterOf(item) {
  const s = item && item.stim && typeof item.stim === 'object' ? item.stim : {};
  if (!Array.isArray(s.jitter)) return null;
  const j = s.jitter.map((v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-8, Math.min(8, Math.round(v))) : 0));
  return j.length > 0 ? j : null;
}

/* اندیس گرگ واقعی — همیشه وسط آرایه (قرارداد بانک) */
function midOf(n) {
  return (n - 1) / 2;
}

/* ─── وکتور گرگ — بدنه/گوش/پا یکسان؛ فقط چشم واقعی و قلابی فرق دارد ─── */

/** درون‌ساخت گرگ رو به راست؛ جهت چپ با آینهٔ کامل */
function wolfInner(dir, real) {
  const eye = real ? EYE_REAL : EYE_FAKE;
  const face = real
    ? '<circle cx="76" cy="27" r="3.6" fill="' + eye + '"/><circle cx="77.2" cy="25.6" r="1.2" fill="#FFF7E6"/>'
    : '<circle cx="76" cy="27" r="3.6" fill="' + eye + '" fill-opacity="0.9"/>';
  return (dir === 'L' ? '<g transform="translate(100,0) scale(-1,1)">' : '<g>') +
    '<g stroke="' + INK + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M12 38 Q2 34 4 22 Q12 30 18 28" fill="' + BODY + '"/>' +
      '<rect x="10" y="30" width="52" height="26" rx="12" fill="' + BODY + '"/>' +
      '<rect x="54" y="16" width="34" height="26" rx="9" fill="' + BODY + '"/>' +
      '<path d="M88 24 L97 30 L88 36 Z" fill="' + BODY + '"/>' +
      '<path d="M60 16 L64 5 L72 16 Z" fill="' + BODY + '"/>' +
      '<path d="M72 16 L76 5 L84 16 Z" fill="' + BODY + '"/>' +
      '<path d="M20 56 v10 M32 56 v10 M46 56 v10 M56 56 v10" fill="none"/>' +
      '<circle cx="94.5" cy="30" r="2.2" fill="' + INK + '"/>' +
    '</g>' + face + '</g>';
}

/** گرگ وکتور تکی — dir: 'L' یا 'R'؛ real: چشم کهربایی روشن */
export function wolfSvg(dir, real) {
  return '<svg class="play-flanker__wolf" viewBox="0 0 100 72" role="img" aria-hidden="true">' +
    wolfInner(dir === 'L' ? 'L' : 'R', real === true) + '</svg>';
}

/** ماه کامل وکتوری — تزئین ایستای پوستهٔ شب */
function moonSvg() {
  return '<svg class="play-flanker__moon" viewBox="0 0 60 60" aria-hidden="true">' +
    '<circle cx="30" cy="30" r="26" fill="' + MOON + '"/>' +
    '<circle cx="22" cy="22" r="4" fill="' + MOON_DARK + '"/>' +
    '<circle cx="38" cy="34" r="5.5" fill="' + MOON_DARK + '"/>' +
    '<circle cx="26" cy="42" r="3" fill="' + MOON_DARK + '"/></svg>';
}

/** ردیف گرگ‌ها برای قدم‌های آموزش — نمونهٔ ایستا با گرگِ وسط نشان‌دار */
function packSample(arrows) {
  const mid = midOf(arrows.length);
  const slots = arrows.map((d, i) =>
    '<div class="play-flanker__slot' + (i === mid ? ' play-flanker__slot--real' : '') + '">' +
      wolfSvg(d, i === mid) + '</div>'
  ).join('');
  return '<div class="play-flanker play-flanker--sample"><div class="play-flanker__row">' + slots + '</div></div>';
}

/* ─── موج آیتم فلانکر — قاعده + شب دشت + ردیف گرگ‌ها + دو دکمهٔ درشت ─── */

export function flankerMarkup(item) {
  const arrows = arrowsOf(item);
  const mid = midOf(arrows.length);
  const prompt = item.prompt && String(item.prompt).trim() !== '' ? esc(item.prompt) : DEFAULT_PROMPT;
  const jit = jitterOf(item);
  const slots = arrows.map((d, i) => {
    const real = i === mid;
    const style = jit && !real && Number.isFinite(jit[i]) && jit[i] !== 0 ? ' style="--jit:' + jit[i] + 'px"' : '';
    return '<div class="play-flanker__slot' + (real ? ' play-flanker__slot--real' : '') + '"' + style + '>' +
      wolfSvg(d, real) + '</div>';
  }).join('');
  return '<div class="play-flanker">' +
    '<p class="play-flanker__prompt">' + prompt + '</p>' +
    '<div class="play-flanker__sky">' + moonSvg() +
      '<div class="play-flanker__row">' + slots + '</div>' +
      '<div class="play-flanker__ground" aria-hidden="true"></div>' +
    '</div>' +
    '<div class="play-flanker__timer" aria-hidden="true"><span style="width:100%"></span></div>' +
    '<div class="play-options play-flanker__answers">' +
      '<button type="button" class="play-option play-flanker__btn" data-option="0">' + ARROW_L + '<span>چپ</span></button>' +
      '<button type="button" class="play-option play-flanker__btn" data-option="1">' + ARROW_R + '<span>راست</span></button>' +
    '</div>' +
    '</div>';
}

/* ─── نشان حقیقت — فقط تمرین، پس از پاسخ؛ برچسب درست از سرور می‌آید ───
   ترجیح با برچسبِ سرور (answerDisplay)؛ اگر نیامد، جهت گرگِ وسط از خود
   محرک عمومی (stim.arrows) — هیچ راهی برای فریب نمره از این مسیر نیست. */

export function flankerRevealTruth(item, stage, answerDisplay) {
  const arrows = arrowsOf(item);
  let dir = arrows[midOf(arrows.length)];
  const said = typeof answerDisplay === 'string' ? answerDisplay : '';
  if (said.indexOf('راست') !== -1) dir = 'R';
  else if (said.indexOf('چپ') !== -1) dir = 'L';
  const marked = [];
  const slot = stage ? stage.querySelector('.play-flanker__slot--real') : null;
  if (slot && slot.classList) { slot.classList.add('play-flanker__slot--truth'); marked.push(slot); }
  const btn = stage ? stage.querySelector('.play-option[data-option="' + (dir === 'L' ? '0' : '1') + '"]') : null;
  if (btn && btn.classList) { btn.classList.add('play-flanker__btn--truth'); marked.push(btn); }
  return marked.length > 0 ? marked : null;
}

/** مرکز گرگِ واقعی — هدف انفجار ذرات موفقیت (fx.burstAt)؛ جایگزین: نخستین دکمه */
export function flankerResponsePoint(stage) {
  const slot = stage ? stage.querySelector('.play-flanker__slot--real') : null;
  const r = slot ? slot.getBoundingClientRect() : null;
  if (r && r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const btn = stage ? stage.querySelector('.play-option') : null;
  const rb = btn ? btn.getBoundingClientRect() : null;
  if (rb && rb.width) return { x: rb.left + rb.width / 2, y: rb.top + rb.height / 2 };
  return null;
}

/* ─── SVG محرک برای پیش‌نمایش آموزش — کل ردیف در یک وکتور ─── */

export function stimSvg(stim) {
  const s = stim && typeof stim === 'object' ? stim : {};
  const raw = Array.isArray(s.arrows) ? s.arrows : [];
  const ok = raw.length >= 3 && raw.length <= 7 && raw.length % 2 === 1 && raw.every((v) => v === 'L' || v === 'R');
  const arrows = ok ? raw : ['R', 'L', 'R'];
  const mid = midOf(arrows.length);
  const step = 84;
  const width = arrows.length * step;
  const group = arrows.map((d, i) =>
    '<g transform="translate(' + (i * step + (step - 100) / 2) + ',0)">' + wolfInner(d, i === mid) + '</g>'
  ).join('');
  return '<svg class="play-flanker__pack" viewBox="0 0 ' + width + ' 72" role="img" aria-hidden="true">' + group + '</svg>';
}

/* ─── قدم‌های آموزش — ایستا؛ هیچ ردی از کلید پاسخ یا آیتم پروب ─── */

export function previewSteps(hint) {
  const h = hint && hint.flanker && hint.flanker.stim && typeof hint.flanker.stim === 'object'
    ? hint.flanker.stim : null;
  const raw = h && Array.isArray(h.arrows) ? h.arrows : [];
  const ok = raw.length >= 3 && raw.length <= 7 && raw.length % 2 === 1 && raw.every((v) => v === 'L' || v === 'R');
  const arrows = ok ? raw : ['L', 'L', 'L'];
  const mid = midOf(arrows.length);
  const rule = hint && hint.flanker && typeof hint.flanker.label === 'string' && hint.flanker.label.trim() !== ''
    ? hint.flanker.label
    : 'فقط نگاهِ گرگِ وسط مهم است؛ جهتش را لمس کن.';
  const flipped = arrows.map((d, i) => (i === mid ? d : (d === 'L' ? 'R' : 'L')));
  const answers = '<div class="play-options play-flanker__answers play-flanker__answers--demo">' +
    '<span class="play-flanker__demo">' + ARROW_L + 'چپ</span>' +
    '<span class="play-flanker__demo">' + ARROW_R + 'راست</span>' +
    '</div>';
  return [
    { svg: packSample(arrows), line: rule },
    { svg: packSample(flipped), line: 'گرگ‌های کناری ممکن است به آن‌سو نگاه کنند؛ تو فریبشان را نمی‌خوری.' },
    { svg: packSample(arrows) + answers, line: 'فقط جهت گرگِ وسط را لمس کن — چپ یا راست.' }
  ];
}

/* ═══════════════════════════════════════════════════════════════
   G3 / ۱.۲۵.۳۷ — کارت INTRO + تمرین تعاملی «تا موفقیت» (همان الگوی
   حلقهٔ تمرین گونوگو، اقتباس jsPsych): دو قدم — نخست گلهٔ هم‌جهت (آسان)،
   بعد گلهٔ ناهم‌جهت (درسِ اصلی: فقط گرگِ وسط). جهتِ گرگِ وسطِ کارت تمرین
   روبه‌کودک پیدا است (قانون خود بازی)، پس تمرین هیچ کلیدی ندارد؛ کلید
   آیتم‌های واقعی فقط سمت سرور می‌ماند. ارزیابی هرگز تمرین تعاملی نمی‌بیند
   (C1). نوار پنجره در تمرین بی‌جنبش می‌ماند (§۹).
   ═══════════════════════════════════════════════════════════════ */

/** کارت INTRO — نام + قانون یک‌خطی از راهنمای سرور؛ ناسالم = قانون امن ایستا */
export const intro = {
  name: 'گلهٔ فریبکار',
  rule: (hint) => {
    const h = hint && hint.flanker && typeof hint.flanker.label === 'string' ? hint.flanker.label.trim() : '';
    return h !== '' ? h : 'فقط نگاهِ گرگِ وسط را دنبال کن؛ گرگ‌های کناری داستان خودشان را دارند.';
  }
};

const FLANKER_PRACTICE = {
  step1: 'گرگِ وسط به کدام‌سو نگاه می‌کند؟ همان دکمه را لمس کن.',
  step2: 'حالا گرگ‌های کناری به آن‌سو نگاه می‌کنند؛ تو فقط به گرگِ وسط نگاه کن.',
  success: 'آفرین! گلهٔ فریبکار تو را فریب نداد.',
  retry: 'فقط نگاهِ گرگِ وسط مهم است؛ گرگ‌های کناری را نادیده بگیر.',
  retryWait: 'هر وقت آماده بودی لمس کن؛ عجله‌ای نیست.',
  practiceDone: 'تمرین تمام شد! حالا گلهٔ واقعی شروع می‌شود.'
};

const PRACTICE_WINDOW_MS = 15000;

/** صحنهٔ تمرین — دکور پس‌زمینهٔ لایه‌های دریا؛ جنبش از fx؛ بی‌اثر برای پاسخ */
function decoratePractice(stage) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup('teach', { svg: kindHero('flanker') })); // قهرمان این بازی — پوستهٔ اختصاصی ۱.۲۵.۴۱
  fx.sceneAmbient(stage);
}

/** یک لمس روی دو دکمهٔ چپ/راست یا یک پنجرهٔ زمانی — هر کدام زودتر؛ خواب یدکی cancel می‌شود */
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

function practiceCardHtml(badge, fakeItem, line) {
  return (badge ? '<span class="play-step-badge">' + esc(badge) + '</span>' : '') +
    flankerMarkup(fakeItem) +
    '<p class="play-line">' + esc(line) + '</p>';
}

/**
 * تمرین تعاملی «گلهٔ فریبکار» — دو قدم با تکرار بی‌سرزنش تا موفقیت:
 * قدم ۱ گلهٔ هم‌جهت، قدم ۲ گلهٔ ناهم‌جهت (جهتِ گرگِ وسط عوض می‌شود، کناری‌ها برعکس).
 * پس از دو تلاش، گرگِ وسط و دکمهٔ درست آرام نشان داده می‌شوند (آموزش پس از پاسخ؛
 * جهت گرگِ وسطِ کارت تمرین دانش عمومی است، نه کلید). خروجی: { applied, retries }.
 */
export async function practiceInteractive(ctx) {
  const { stage, sleeper } = ctx || {};
  if (!stage || !sleeper) return { applied: false, retries: 0 };
  const steps = [
    { badge: 'قدم ۱ از ۲', arrows: ['L', 'L', 'L'], line: FLANKER_PRACTICE.step1 },
    { badge: 'قدم ۲ از ۲', arrows: ['R', 'L', 'R'], line: FLANKER_PRACTICE.step2 }
  ];
  let retries = 0;

  for (const step of steps) {
    const fakeItem = { stim: { arrows: step.arrows.slice() }, prompt: '' };
    const want = arrowsOf(fakeItem)[midOf(step.arrows.length)] === 'L' ? 0 : 1;
    let misses = 0;
    for (;;) {
      stage.className = 'play-stage';
      stage.classList.add('play-stage--teach');
      stage.innerHTML = practiceCardHtml(step.badge, fakeItem, step.line);
      decoratePractice(stage);
      fx.revealStage(stage);
      fx.popIn(stage.querySelector('.play-flanker__row'), 240, false);
      const picked = await tapAnswerWithin(stage, PRACTICE_WINDOW_MS, sleeper);
      if (picked !== null && picked === want) {
        stage.innerHTML = practiceCardHtml(step.badge, fakeItem, FLANKER_PRACTICE.success);
        decoratePractice(stage);
        fx.revealStage(stage);
        const el = stage.querySelector('.play-flanker__slot--real');
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width) fx.burstAt(r.left + r.width / 2, r.top + r.height / 2);
        }
        await sleeper.sleep(1200);
        break;
      }
      retries += 1;
      misses += 1;
      const line = picked === null ? FLANKER_PRACTICE.retryWait : FLANKER_PRACTICE.retry;
      stage.innerHTML = practiceCardHtml(step.badge, fakeItem, line);
      decoratePractice(stage);
      fx.revealStage(stage);
      if (misses >= 2) flankerRevealTruth(fakeItem, stage, want === 0 ? 'چپ' : 'راست'); // آموزش پس از پاسخ
      await sleeper.sleep(1600);
    }
  }

  stage.className = 'play-stage';
  stage.classList.add('play-stage--teach');
  stage.innerHTML = '<p class="play-line">' + esc(FLANKER_PRACTICE.practiceDone) + '</p>';
  decoratePractice(stage);
  fx.revealStage(stage);
  await sleeper.sleep(1600);
  stage.className = 'play-stage';
  stage.innerHTML = '';
  return { applied: true, retries };
}
