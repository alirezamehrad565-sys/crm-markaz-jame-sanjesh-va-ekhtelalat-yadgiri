/* ═══════════════════════════════════════════════════════════════
   kinds/trail.js — بازی «رد پای دزد» (راه‌یابی نشانه‌ای سبک Trail Making) — ۱.۲۵.۳۲
   ماژول نمایش: صحنهٔ شب کوچه/پشت‌بام، ردپاهای شماره‌دار وکتوری روی موقعیت درصدی،
   تبدیل لمس به ترتیب، نشان ترتیب درست پس از پاسخ تمرین.
   اقتباس مکانیک (فقط الگو، بدون کپی کد):
     · @jspsych-contrib/plugin-trail-making — مخزن jspsych/jspsych-contrib روی GitHub؛
       مجوز MIT (فیلد license در packages/plugin-trail-making/package.json) —
       نشانه‌های {x,y,برچسب}، فاصلهٔ کمینهٔ مراکز نشانه‌ها، توالی لمس،
       بخش A (فقط عدد) و بخش B (یک‌درمیان عدد/حرف)، ثبت ترتیب لمس با مُهر زمان.
     · jsPsych (هسته) — مجوز MIT.
   ایدهٔ پایه: Trail Making Test A/B (مفهوم عمومی آزمون عصب‌شناختی — بدون کد).
   تفاوت با نسخهٔ بالینی: خطا بی‌سرزنش است — لمس ترتیب اشتباه فقط رد را همان‌جا
   قطع می‌کند (پایان موج)؛ هیچ فلاش/صدای خطا/متن ناامیدکننده نیست (§۲ و §۹).
   حس عدی در صحنه است (شب، حاشیهٔ هشدار ایستا، دزد فراری) — هرگز در گفتار با کودک.
   نمره‌دهی فقط سمت سرور است؛ کلید پاسخ (ترتیب درست گره‌ها) هرگز به این ماژول
   نمی‌رسد؛ هیچ درخواست شبکه‌ای ندارد. بی‌صدا؛ جنبش فقط از fx.js (§۹).
   ═══════════════════════════════════════════════════════════════ */

const INK = '#153E50';     /* Navy دفترچهٔ وظیفه — خط جوهری ردپا و برچسب */
const STEP = '#E4AA46';    /* Amber — جوهر ردپای دزد (رد روی شب) */
const MOON = '#F5F0E5';    /* Cream — ماه و وکتورهای پوسته */

/* جنبش تزئینی و صحنهٔ آموزش — همهٔ جنبش از fx با گارد کاهش‌جنبش؛ این ماژول هرگز مستقیم animate نمی‌کند */
import * as fx from '../fx.js';
import { sceneMarkup, kindHero } from '../scene.js';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** برچسب گره — عدد → رقم فارسی؛ حرف فارسی سرراست و همیشه esc */
function faLabel(n) {
  if (typeof n === 'number' && Number.isFinite(n)) return faNum(Math.round(n));
  return esc(n);
}

/** گره‌های آیتم — ناسالم = آرایهٔ خالی؛ x/y درصدی، n برچسب (عدد یا حرف فارسی) */
function nodesOf(item) {
  const s = item && item.stim && typeof item.stim === 'object' ? item.stim : {};
  if (!Array.isArray(s.nodes)) return [];
  return s.nodes.filter((nd) => nd && typeof nd === 'object' &&
    typeof nd.x === 'number' && Number.isFinite(nd.x) &&
    typeof nd.y === 'number' && Number.isFinite(nd.y) &&
    (typeof nd.n === 'number' || typeof nd.n === 'string'));
}

/** حالت آمیختهٔ عدد/حرف (سبک TMT-B) — ناسالم = false */
function altOf(item) {
  const s = item && item.stim && typeof item.stim === 'object' ? item.stim : {};
  return s.alt === true;
}

const DEFAULT_PROMPT = 'دزد فراری ردپا گذاشته؛ ردپاها را به ترتیب شماره لمس کن و رد را کامل کن.';
const DEFAULT_PROMPT_ALT = 'دزد فراری ردپا گذاشته؛ رد را کامل کن — بعد از هر عدد یک حرف می‌آید.';

/* جوهر ردپا — پنجهٔ گرد + پاشنهٔ جدا با کمان قوس؛ tilt چپ/راست مثل قدم‌زدن */
function footInk(tilt) {
  return '<g fill="' + STEP + '" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" ' +
    'stroke-linecap="round" transform="rotate(' + tilt + ' 30 42)">' +
    '<path d="M30 4 C 42 4 48 14 47 28 C 46.4 38 41 46 30 46 C 19 46 13.6 38 13 28 C 12 14 18 4 30 4 Z"/>' +
    '<path d="M21 54 h18 a7 7 0 0 1 7 7 v8 a7 7 0 0 1 -7 7 h-18 a7 7 0 0 1 -7 -7 v-8 a7 7 0 0 1 7 -7 Z"/>' +
    '</g>';
}

/** وکتور ردپا — یک قدم از رد دزد؛ چپ/راست فقط تیلت قدم است (بدون نشانهٔ کلید) */
export function footSvg(side) {
  return '<svg class="play-trail__foot" viewBox="0 0 60 84" role="img" aria-hidden="true">' +
    footInk(side === 'L' ? -12 : 12) + '</svg>';
}

/** ماه — گوشهٔ صحنهٔ شب؛ ایستا و کم‌رنگ */
function moonSvg() {
  return '<svg class="play-trail__moon" viewBox="0 0 64 64" role="img" aria-hidden="true">' +
    '<circle cx="32" cy="32" r="24" fill="' + MOON + '" opacity="0.85"/>' +
    '<circle cx="24" cy="26" r="5" fill="#E3DCC9"/>' +
    '<circle cx="38" cy="40" r="3.5" fill="#E3DCC9"/>' +
    '</svg>';
}

/** دزد کوچک فراری — کودک‌پسند و بی‌ترس: کلاه، کولهٔ کوچک، حالت دویدن */
function thiefSvg() {
  return '<svg class="play-trail__thief" viewBox="0 0 100 92" role="img" aria-hidden="true">' +
    '<g fill="' + MOON + '" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">' +
      '<circle cx="58" cy="24" r="11"/>' +                                   /* سر */
      '<path d="M46 16 h24 l-3 -8 h-18 Z"/>' +                               /* کلاه */
      '<path d="M46 34 C 58 30 70 32 74 42 L 70 58 C 62 62 52 62 46 58 Z"/>' + /* بدن خمیده */
    '</g>' +
    '<g fill="' + STEP + '" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round">' +
      '<circle cx="78" cy="52" r="9"/>' +                                    /* کولهٔ کوچک */
    '</g>' +
    '<g fill="none" stroke="' + MOON + '" stroke-width="4" stroke-linecap="round">' +
      '<path d="M50 60 L 40 76"/>' +                                         /* پای عقب */
      '<path d="M66 60 L 78 74"/>' +                                         /* پای جلو — در حال دویدن */
      '<path d="M48 40 L 34 46"/>' +                                         /* دست عقب */
    '</g>' +
    '<g fill="none" stroke="' + MOON + '" stroke-width="3" stroke-linecap="round" opacity="0.5">' +
      '<path d="M88 40 L 96 38"/><path d="M90 48 L 98 50"/>' +               /* خطوط سرعت */
    '</g>' +
    '</svg>';
}

/** وکتور محرک برای قرارداد stimSvg — دو ردپا با خط‌چین رد (پیش‌نمایش آموزش) */
export function stimSvg() {
  return '<svg class="play-svg" viewBox="0 0 120 84" role="img" aria-hidden="true">' +
    '<path d="M30 58 L92 24" stroke="' + INK + '" stroke-width="3" stroke-dasharray="6 8" ' +
      'stroke-linecap="round" fill="none" opacity="0.45"/>' +
    '<g transform="translate(2 4) scale(0.72)">' + footInk(-12) + '</g>' +
    '<g transform="translate(64 -16) scale(0.72)">' + footInk(12) + '</g>' +
    '</svg>';
}

/** صحنهٔ آیتم trail — پرامپت + میدان ردپاها (موقعیت درصدی از خود stim) + نوار رد */
export function trailMarkup(item) {
  const nodes = nodesOf(item);
  if (nodes.length === 0) return '<p class="play-muted">این رد ردپا ندارد.</p>';
  const prompt = item.prompt && String(item.prompt).trim() !== ''
    ? esc(item.prompt)
    : (altOf(item) ? DEFAULT_PROMPT_ALT : DEFAULT_PROMPT);
  const dots = nodes.map((nd, i) =>
    '<button type="button" class="play-trail__node" data-idx="' + i + '" ' +
      'style="left:' + nd.x + '%;top:' + nd.y + '%" aria-label="ردپا">' +
      footSvg(i % 2 === 0 ? 'L' : 'R') +
      '<span class="play-trail__label">' + faLabel(nd.n) + '</span>' +
    '</button>'
  ).join('');
  return '<div class="play-trail">' +
    '<p class="play-trail__prompt">' + prompt + '</p>' +
    '<div class="play-trail__field">' + moonSvg() + thiefSvg() + dots + '</div>' +
    '<div class="play-trail__timer" aria-hidden="true"><span style="width:100%"></span></div>' +
    '</div>';
}

/** نشان حقیقت — ترتیب درست گره‌ها از CSV بازخورد سرور؛ فقط تمرین، پس از پاسخ.
    هر گره حلقهٔ خط‌چین کهربایی + بج شمارهٔ قدم می‌گیرد؛ بازگشت: عناصر نشان‌شده یا null */
export function trailRevealTruth(item, stage, orderCsv) {
  if (typeof orderCsv !== 'string') return null;
  const idxs = orderCsv.split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '') // CSV تهی هرگز گرهٔ صفر را نشان نمی‌دهد
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 0);
  if (idxs.length === 0) return null;
  const nodes = stage ? stage.querySelectorAll('.play-trail__node') : null;
  if (!nodes || nodes.length === 0) return null;
  const marked = [];
  let pos = 0;
  for (const i of idxs) {
    const t = nodes[i];
    if (!t || !t.classList) continue;
    pos += 1;
    t.classList.add('play-trail__node--truth');
    const badge = document.createElement('span');
    badge.className = 'play-trail__order';
    badge.textContent = faNum(pos);
    t.appendChild(badge);
    marked.push(t);
  }
  return marked.length > 0 ? marked : null;
}

/** مرکز نخستین ردپای گرفته‌شده در همین پاسخ — هدف انفجار ذرات موفقیت (fx.burstAt) */
export function trailResponsePoint(stage) {
  const t = stage ? stage.querySelector('.play-trail__node--step') : null;
  if (!t) return null;
  const r = t.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/* ─── قدم‌های آموزش — ایستا؛ هیچ ردی از کلید پاسخ یا آیتم پروب ─── */

/** نمونهٔ سه‌ردپایی برای آموزش — گره‌های بی‌لمس (div، نه button)؛ فقط شکل کار */
function trailSample(state) {
  const labels = ['۱', '۲', '۳'];
  const pos = [{ x: 20, y: 64 }, { x: 52, y: 28 }, { x: 84, y: 60 }];
  const lit = state === 'start' ? 1 : state === 'middle' ? 2 : 3;
  let dots = '';
  for (let i = 0; i < 3; i++) {
    dots += '<div class="play-trail__node' + (i < lit ? ' play-trail__node--step' : '') +
      '" style="left:' + pos[i].x + '%;top:' + pos[i].y + '%">' +
      footSvg(i % 2 === 0 ? 'L' : 'R') +
      '<span class="play-trail__label">' + labels[i] + '</span></div>';
  }
  return '<div class="play-trail play-trail--sample"><div class="play-trail__field">' +
    (state === 'done' ? thiefSvg() : '') + dots + '</div></div>';
}

/** سه قدم آموزش «رد پای دزد» — hint شکل سروری دارد؛ ناسالم = پیش‌فرض امن */
export function previewSteps(hint) {
  const alt = !!(hint && hint.trail && hint.trail.stim && hint.trail.stim.alt === true);
  const rule = hint && hint.trail && typeof hint.trail.label === 'string' && hint.trail.label.trim() !== ''
    ? hint.trail.label
    : (alt ? DEFAULT_PROMPT_ALT : DEFAULT_PROMPT);
  return [
    { svg: trailSample('start'), line: rule },
    {
      svg: trailSample('middle'),
      line: alt
        ? 'خوب شد! ادامهٔ رد: بعد از عدد، حرف می‌آید؛ بعد از حرف، عدد.'
        : 'خوب شد! ردپای بعدی همیشه شمارهٔ بعدی است؛ رد ادامه پیدا می‌کند.'
    },
    { svg: trailSample('done'), line: 'رد کامل شد! اگر رد قطع شود، مهم نیست؛ دوباره قدم می‌زنیم.' }
  ];
}

/* ═══════════════════════════════════════════════════════════════
   G3 / ۱.۲۵.۳۷ — کارت INTRO + تمرین تعاملی «تا موفقیت» (همان الگوی
   حلقهٔ تمرین گونوگو، اقتباس jsPsych): یک رد کوتاه سه‌ردپایی با تکرار
   بی‌سرزنش. ترتیب رد تمرین = برچسب‌های روبه‌کودک ۱→۲→۳ (دانش عمومی خود
   بازی — همان قرارداد ترتیب برچسب‌ها در آزمون)، پس تمرین هیچ کلیدی
   ندارد؛ نگاشت گره→جایگاه کلید سروری می‌ماند و هرگز این‌جا نیست.
   ارزیابی هرگز تمرین تعاملی نمی‌بیند (C1). نوار رد در تمرین بی‌جنبش
   می‌ماند (بدون شمارش‌معکوس نمایشی — §۹).
   ═══════════════════════════════════════════════════════════════ */

/** کارت INTRO — نام + قانون یک‌خطی از راهنمای سرور؛ ناسالم = قانون امن ایستا */
export const intro = {
  name: 'رد پای دزد',
  rule: (hint) => {
    const h = hint && hint.trail && typeof hint.trail.label === 'string' ? hint.trail.label.trim() : '';
    return h !== '' ? h : DEFAULT_PROMPT;
  }
};

const TRAIL_PRACTICE = {
  stepLine: 'ردپاها را به ترتیب شماره لمس کن: ۱، بعد ۲، بعد ۳.',
  success: 'آفرین! رد کامل شد.',
  retry: 'رد قطع شد؛ مهم نیست — از ردپای ۱ دوباره قدم می‌زنیم.',
  retryWait: 'هر وقت آماده بودی قدم بزن؛ دزد جای دیگری نمی‌رود.',
  practiceDone: 'تمرین تمام شد! حالا رد واقعی شروع می‌شود.'
};

const PRACTICE_WINDOW_MS = 15000;

/* صحنهٔ تمرین — همان سه‌ردپای آموزش با برچسب ۱..۳؛ جای گره‌ها ثابت و بی‌کلید */
const PRACTICE_NODES = [
  { x: 20, y: 64, n: 1 },
  { x: 52, y: 28, n: 2 },
  { x: 84, y: 60, n: 3 }
];

/** صحنهٔ تمرین — دکور پس‌زمینهٔ لایه‌های دریا؛ جنبش از fx؛ بی‌اثر برای پاسخ */
function decoratePractice(stage) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup('teach', { svg: kindHero('trail') })); // قهرمان این بازی — پوستهٔ اختصاصی ۱.۲۵.۴۱
  fx.sceneAmbient(stage);
}

/** دنبالهٔ لمس رد تمرین یا یک پنجرهٔ زمانی — موفقیت = کامل‌شدن رد به ترتیب ۱→۲→۳.
 *  لمس ترتیب اشتباه رد را همان‌جا می‌بندد (همان حس بازی؛ پایان بی‌سرزنش)؛
 *  خواب یدکی در هر مسیر cancel می‌شود — قاعدهٔ پنجرهٔ گو/نوگو. */
function tapTrailWithin(stage, nodes, ms, sleeper) {
  return new Promise((resolve) => {
    const buttons = Array.from(stage.querySelectorAll('.play-trail__node'));
    const order = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      buttons.forEach((b) => b.removeEventListener('pointerdown', onNode));
      sleeper.cancel(); // خواب یدکی یتیم نمی‌ماند — قاعدهٔ پنجرهٔ گو/نوگو
      resolve(order.length >= nodes.length);
    };
    const onNode = (ev) => {
      const btn = ev.target.closest('.play-trail__node');
      if (!btn || btn.disabled) return;
      ev.preventDefault();
      const nd = nodes[Number(btn.dataset.idx)];
      if (nd && String(nd.n) === String(order.length + 1)) {
        order.push(Number(btn.dataset.idx));
        btn.classList.add('play-trail__node--step');
        if (order.length >= nodes.length) finish(); // رد کامل شد
      } else {
        finish(); // رد قطع شد — پایان بی‌سرزنش؛ تکرار با بازخورد آرام
      }
    };
    buttons.forEach((b) => b.addEventListener('pointerdown', onNode));
    sleeper.sleep(ms).then(finish);
  });
}

function practiceCardHtml(badge, fakeItem, line) {
  return (badge ? '<span class="play-step-badge">' + esc(badge) + '</span>' : '') +
    trailMarkup(fakeItem) +
    '<p class="play-line">' + esc(line) + '</p>';
}

/**
 * تمرین تعاملی «رد پای دزد» — یک رد سه‌ردپایی با تکرار بی‌سرزنش تا موفقیت.
 * پس از دو تلاشِ ناتمام، ترتیب درست رد تمرین با بج شمارهٔ قدم آرام نشان می‌شود
 * (آموزش پس از پاسخ؛ ترتیب برچسب‌های رد تمرین دانش عمومی است، نه کلید).
 * خروجی: { applied, retries } — applied=false یعنی صحنه/ساعت آماده نبود.
 */
export async function practiceInteractive(ctx) {
  const { stage, sleeper } = ctx || {};
  if (!stage || !sleeper) return { applied: false, retries: 0 };
  const nodes = PRACTICE_NODES.map((nd) => ({ ...nd }));
  const fakeItem = { stim: { nodes }, prompt: '' };
  let retries = 0;
  let misses = 0;

  for (;;) {
    stage.className = 'play-stage';
    stage.classList.add('play-stage--teach');
    stage.innerHTML = practiceCardHtml('قدم ۱ از ۱', fakeItem, TRAIL_PRACTICE.stepLine);
    decoratePractice(stage);
    fx.revealStage(stage);
    fx.popIn(stage.querySelector('.play-trail__field'), 240, false);
    const ok = await tapTrailWithin(stage, nodes, PRACTICE_WINDOW_MS, sleeper);
    if (ok) {
      stage.innerHTML = practiceCardHtml('قدم ۱ از ۱', fakeItem, TRAIL_PRACTICE.success);
      decoratePractice(stage);
      fx.revealStage(stage);
      const el = stage.querySelector('.play-trail__node--step');
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width) fx.burstAt(r.left + r.width / 2, r.top + r.height / 2);
      }
      await sleeper.sleep(1200);
      break;
    }
    retries += 1;
    misses += 1;
    stage.innerHTML = practiceCardHtml('قدم ۱ از ۱', fakeItem, TRAIL_PRACTICE.retry);
    decoratePractice(stage);
    fx.revealStage(stage);
    if (misses >= 2) trailRevealTruth(fakeItem, stage, '0,1,2'); // آموزش پس از پاسخ
    await sleeper.sleep(1600);
  }

  stage.className = 'play-stage';
  stage.classList.add('play-stage--teach');
  stage.innerHTML = '<p class="play-line">' + esc(TRAIL_PRACTICE.practiceDone) + '</p>';
  decoratePractice(stage);
  fx.revealStage(stage);
  await sleeper.sleep(1600);
  stage.className = 'play-stage';
  stage.innerHTML = '';
  return { applied: true, retries };
}
