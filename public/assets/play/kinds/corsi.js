/* ═══════════════════════════════════════════════════════════════
   kinds/corsi.js — بازی «کولهٔ مرواریدها» (حافظهٔ کاری فضایی — کورسی) — ۱۴۰۵/۰۸/۱۹
   ماژول نمایش: تخت صدف ثابت و نامنظم (۹ صدف — تختِ کلاسیک کورسی)، مرواریدها که
   پشت‌سرهم برق می‌زنند، فاز بازتولید لمسی، نشان حقیقت پس از پاسخ تمرین.
   اقتباس مکانیک (فقط الگو، بدون کپی کد):
     · @jspsych-contrib/plugin-corsi-blocks — مخزن jspsych/jspsych-contrib روی GitHub؛
       مجوز MIT (فیلد license در packages/plugin-corsi-blocks/package.json) —
       حالت نمایش (روشن‌شدن پیاپی بلوک‌ها) + حالت ورود (بازتپ همان ترتیب) +
       بازخورد پس از پاسخ؛ بازنویسی کامل روی قرارداد سامانهٔ ما — بدون دارایی بیرونی.
     · jsPsych (هسته) — مجوز MIT.
   ایدهٔ پایه: Corsi Block-Tapping Task (مفهوم عمومی آزمون حافظهٔ فضایی — بدون کد).
   تفاوت با نسخهٔ بالینی: خطا بی‌سرزنش است — لمس ترتیب اشتباه فقط دنباله را همان‌جا
   می‌بندد (پایان بی‌سرزنش)؛ هیچ فلاش/صدای خطا/متن ناامیدکننده نیست (§۲ و §۹).
   بی‌صدا؛ جنبش فقط از fx.js (§۹). کلید بازی = خود دنبالهٔ نمایش‌داده‌شده —
   کودک آن را می‌بیند؛ پاسخ مخفی ندارد و نمره‌دهی فقط سمت سرور است.
   ═══════════════════════════════════════════════════════════════ */

/* جنبش تزئینی و صحنهٔ آموزش — همهٔ جنبش از fx با گارد کاهش‌جنبش؛ این ماژول هرگز مستقیم animate نمی‌کند */
import * as fx from '../fx.js';
import { sceneMarkup } from '../scene.js';

const SHELL_INK = '#4A2438';   /* رز تیرهٔ کتابی — خط صدف و برچسب */
const PEARL = '#C97BA0';       /* رز مرواریدی — جوهر برقِ مروارید */
const CREAM = '#FFF7F9';       /* بدنهٔ صدف */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* تخت صدف ثابت — ۹ جایگاه نامنظم (تختِ کلاسیک کورسی؛ ضد دسته‌بندی کلامی جایگاه‌ها).
   هویت بانک: مولد seed هم همین جاها را می‌نویسد — هرگز بازنویسی آیتمی نمی‌شود. */
const SHELL_SPOTS = [
  { x: 20, y: 26 }, { x: 50, y: 18 }, { x: 80, y: 30 },
  { x: 32, y: 48 }, { x: 66, y: 46 },
  { x: 18, y: 68 }, { x: 48, y: 70 }, { x: 82, y: 72 },
  { x: 50, y: 86 }
];

const DEFAULT_PROMPT = 'مرواریدها پشت‌سرهم برق می‌زنند؛ همان ترتیب را لمس کن.';

/** صدف موج‌دار — صدپای اسکالوپ؛ مروارید درونی به‌صورت circle جدا (قابل برق‌زدن با CSS) */
export function shellSvg() {
  return '<svg class="play-corsi__shell-svg" viewBox="0 0 72 64" role="img" aria-hidden="true">' +
    '<g stroke="' + SHELL_INK + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">' +
    /* بدنهٔ بادبزنی صدف — ترک‌های موج‌دار */
    '<path d="M36 58 C 18 58 8 44 10 28 C 11 20 16 14 24 12 L 36 56" fill="' + CREAM + '"/>' +
    '<path d="M36 58 C 54 58 64 44 62 28 C 61 20 56 14 48 12 L 36 56" fill="' + CREAM + '"/>' +
    '<path d="M24 12 L 36 58" fill="none"/>' +
    '<path d="M48 12 L 36 58" fill="none"/>' +
    '<path d="M15 22 L 34 54" fill="none"/>' +
    '<path d="M57 22 L 38 54" fill="none"/>' +
    /* مروارید — برقش با کلاس --lit روشن می‌شود */
    '<circle class="play-corsi__pearl" cx="36" cy="34" r="8.5" fill="' + PEARL + '"/>' +
    '</g>' +
    '<circle class="play-corsi__pearl-shine" cx="33.5" cy="31" r="2.4" fill="#FFE4EF"/>' +
    '</svg>';
}

/** خرچنگ کلکتور کوچک — گوشهٔ صحنه؛ کولهٔ مروارید بر دوشش؛ ایستا و بی‌ترس */
function crabCollectorSvg() {
  return '<svg class="play-corsi__crab" viewBox="0 0 110 92" role="img" aria-hidden="true">' +
    '<g fill="#F5F0E5" stroke="' + SHELL_INK + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">' +
    '<path d="M30 58 C 26 46 34 38 46 40 L 66 40 C 78 38 86 46 82 58 C 76 70 36 70 30 58 Z"/>' + /* بدن */
    '<circle cx="46" cy="52" r="3.4" fill="' + SHELL_INK + '"/>' +                              /* چشم */
    '<circle cx="66" cy="52" r="3.4" fill="' + SHELL_INK + '"/>' +
    '<path d="M42 44 L 34 34 L 44 36 Z"/>' +                                                    /* پنجهٔ چپ */
    '<path d="M70 44 L 78 34 L 68 36 Z"/>' +                                                    /* پنجهٔ راست */
    '<path d="M38 70 L 32 82"/><path d="M56 72 L 56 84"/><path d="M74 70 L 80 82"/>' +          /* پاها */
    '</g>' +
    /* کولهٔ مرواریدها */
    '<g stroke="' + SHELL_INK + '" stroke-width="2.6" stroke-linejoin="round">' +
    '<path d="M84 40 L 100 34 L 102 52 L 86 54 Z" fill="' + PEARL + '"/>' +
    '<circle cx="93" cy="44" r="3.4" fill="#FFE4EF"/>' +
    '</g>' +
    '</svg>';
}

/** وکتور محرک برای پیش‌نمایش آموزش — دو صدف با مروارید برق‌زده */
export function stimSvg() {
  return '<svg class="play-svg" viewBox="0 0 120 84" role="img" aria-hidden="true">' +
    '<g transform="translate(4 12) scale(0.78)">' + shellSvg() + '</g>' +
    '<g transform="translate(56 6) scale(0.78)">' +
      shellSvg().replace('<circle class="play-corsi__pearl"', '<circle opacity="0.55"') +
    '</g>' +
    '</svg>';
}

/** جایگاه‌های صدف آیتم — آیتم authored همیشه همین تخت ثابت را می‌فرستد؛ ناسالم = تخت پیش‌فرض */
function spotsOf(item) {
  const s = item && item.stim && typeof item.stim === 'object' ? item.stim : {};
  if (!Array.isArray(s.shells) || s.shells.length === 0) return SHELL_SPOTS;
  const ok = s.shells.filter((p) => p && typeof p === 'object' &&
    typeof p.x === 'number' && Number.isFinite(p.x) &&
    typeof p.y === 'number' && Number.isFinite(p.y));
  return ok.length === 9 ? ok : SHELL_SPOTS;
}

/** صحنهٔ آیتم corsi — پرامپت + تخت صدف (۹ دکمهٔ لمسی) + نوار پنجرهٔ بازتولید */
export function corsiMarkup(item) {
  const spots = spotsOf(item);
  const prompt = item.prompt && String(item.prompt).trim() !== ''
    ? esc(item.prompt)
    : DEFAULT_PROMPT;
  const dots = spots.map((p, i) =>
    '<button type="button" class="play-corsi__shell" data-idx="' + i + '" ' +
      'style="left:' + p.x + '%;top:' + p.y + '%" aria-label="صدف ' + (i + 1) + '">' +
      shellSvg() +
    '</button>'
  ).join('');
  return '<div class="play-corsi">' +
    '<p class="play-corsi__prompt">' + prompt + '</p>' +
    '<div class="play-corsi__field">' + crabCollectorSvg() + dots + '</div>' +
    '<div class="play-corsi__timer" aria-hidden="true"><span style="width:100%"></span></div>' +
    '</div>';
}

/** نشان حقیقت — بازپخش دنبالهٔ نمایش‌داده‌شده با بج شمارهٔ قدم؛ فقط تمرین، پس از پاسخ.
 *  دنباله از خود stim آیتم می‌آید (کودک آن را در فاز نمایش دیده)؛ csv آرگومان عام
 *  قرارداد سایر ماژول‌هاست و این‌جا بی‌استفاده می‌ماند. بازگشت: عناصر نشان‌شده یا null */
export function corsiRevealTruth(item, stage, _csv) {
  const s = item && item.stim && typeof item.stim === 'object' ? item.stim : {};
  if (!Array.isArray(s.sequence)) return null;
  const seq = s.sequence.filter((n) => Number.isInteger(n) && n >= 0);
  if (seq.length === 0) return null;
  const shells = stage ? stage.querySelectorAll('.play-corsi__shell') : null;
  if (!shells || shells.length === 0) return null;
  const marked = [];
  let pos = 0;
  for (const i of seq) {
    const t = shells[i];
    if (!t || !t.classList) continue;
    pos += 1;
    t.classList.add('play-corsi__shell--truth');
    const badge = document.createElement('span');
    badge.className = 'play-corsi__order';
    badge.textContent = faNum(pos);
    t.appendChild(badge);
    marked.push(t);
  }
  return marked.length > 0 ? marked : null;
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

/** مرکز نخستین صدف گرفته‌شده در همین پاسخ — هدف انفجار ذرات موفقیت (fx.burstAt) */
export function corsiResponsePoint(stage) {
  const t = stage ? stage.querySelector('.play-corsi__shell--step') : null;
  if (!t) return null;
  const r = t.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/* ─── قدم‌های آموزش — ایستا؛ هیچ ردی از آیتم پروب ─── */

/** نمونهٔ آموزش با سه صدف — شکل کار را نشان می‌دهد؛ بی‌لمس (div، نه button) */
function corsiSample(state) {
  const spots = [SHELL_SPOTS[0], SHELL_SPOTS[1], SHELL_SPOTS[3]];
  const litIdx = state === 'first' ? [0] : state === 'second' ? [0, 1] : [];
  const done = state === 'done';
  let dots = '';
  for (let i = 0; i < 3; i++) {
    const lit = litIdx.includes(i) ? ' play-corsi__shell--lit' : '';
    const step = done ? ' play-corsi__shell--step' : '';
    dots += '<div class="play-corsi__shell' + lit + step + '" style="left:' + spots[i].x + '%;top:' + spots[i].y + '%">' +
      shellSvg() +
      (done ? '<span class="play-corsi__order">' + faNum(i + 1) + '</span>' : '') +
      '</div>';
  }
  return '<div class="play-corsi play-corsi--sample"><div class="play-corsi__field">' + dots + '</div></div>';
}

/** سه قدم آموزش «کولهٔ مرواریدها» — hint شکل سروری دارد؛ ناسالم = پیش‌فرض امن */
export function previewSteps(hint) {
  const rule = hint && hint.corsi && typeof hint.corsi.label === 'string' && hint.corsi.label.trim() !== ''
    ? hint.corsi.label
    : DEFAULT_PROMPT;
  return [
    { svg: corsiSample('first'), line: rule },
    { svg: corsiSample('second'), line: 'خوب شد! مروارید بعدی هم برق می‌زند؛ ترتیب را یادت نگه دار.' },
    { svg: corsiSample('done'), line: 'دنباله کامل شد! اگر یادت رفت، مهم نیست؛ دوباره با هم نگاه می‌کنیم.' }
  ];
}

/* ═══════════════════════════════════════════════════════════════
   کارت INTRO + تمرین تعاملی «تا موفقیت» (الگوی حلقهٔ تمرین گونوگو/رد سابق):
   یک دنبالهٔ دومردپایی ثابت با تکرار بی‌سرزنش. دنبالهٔ تمرین «دانش عمومی خود
   بازی» است (دو صدف روشن، ترتیب مشهود) — پاسخ مخفی ندارد. پس از دو تلاشِ
   ناتمام، دنبالهٔ درست با بج قدم نشان می‌شود (آموزش پس از پاسخ).
   ارزیابی هرگز تمرین تعاملی نمی‌بیند (C1). نوار پنجره در تمرین بی‌جنبش می‌ماند (§۹).
   ═══════════════════════════════════════════════════════════════ */

/** کارت INTRO — نام + قانون یک‌خطی از راهنمای سرور؛ ناسالم = قانون امن ایستا */
export const intro = {
  name: 'کولهٔ مرواریدها',
  rule: (hint) => {
    const h = hint && hint.corsi && typeof hint.corsi.label === 'string' ? hint.corsi.label.trim() : '';
    return h !== '' ? h : DEFAULT_PROMPT;
  }
};

const CORSI_PRACTICE = {
  watchLine: 'حواست باشد: مرواریدها به ترتیب برق می‌زنند؛ بعد تو همان ترتیب را لمس کن.',
  tapLine: 'حالا نوبت توست — همان ترتیبی که برق زد را لمس کن.',
  success: 'آفرین! دنباله کامل شد.',
  retry: 'یادت رفت؛ مهم نیست — دوباره با هم نگاه می‌کنیم.',
  practiceDone: 'تمرین تمام شد! حالا مرواریدهای واقعی می‌آیند.'
};

const PRACTICE_LIT_MS = 650;
const PRACTICE_GAP_MS = 250;

/* صحنهٔ تمرین — دو صدف ثابت با دنبالهٔ مشهود ۰→۱؛ جای صدف‌ها بی‌کلید */
const PRACTICE_SPOTS = [
  { x: 34, y: 44 },
  { x: 66, y: 58 }
];

function practiceCardHtml(badge, line) {
  let dots = '';
  for (let i = 0; i < PRACTICE_SPOTS.length; i++) {
    dots += '<button type="button" class="play-corsi__shell" ' +
      'data-idx="' + i + '" style="left:' + PRACTICE_SPOTS[i].x + '%;top:' + PRACTICE_SPOTS[i].y + '%" aria-label="صدف تمرین">' +
      shellSvg() + '</button>';
  }
  return (badge ? '<span class="play-step-badge">' + esc(badge) + '</span>' : '') +
    '<div class="play-corsi play-corsi--sample"><div class="play-corsi__field">' + dots + '</div></div>' +
    '<p class="play-line">' + esc(line) + '</p>';
}

/** صحنهٔ تمرین — دکور پس‌زمینهٔ لایه‌های دریا؛ جنبش از fx؛ بی‌اثر برای پاسخ */
function decoratePractice(stage) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup('teach'));
  fx.sceneAmbient(stage);
}

/** حلقهٔ یک تلاش تمرین: نمایش دوضانیه‌ای دنبالهٔ ۰→۱ + پنجرهٔ بازتپ.
 *  شنونده‌ها فقط پس از پایان نمایش نصب می‌شوند (الگوی موتور) — لمس حین نمایش
 *  هیچ اثری ندارد. خروجی: true فقط اگر ترتیب کامل درست لمس شد؛ خواب یدکی در هر
 *  مسیر cancel می‌شود. */
function practiceRound(stage, sleeper) {
  return new Promise((resolve) => {
    const buttons = Array.from(stage.querySelectorAll('.play-corsi__shell'));
    const order = [];
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      buttons.forEach((b) => b.removeEventListener('pointerdown', onNode));
      sleeper.cancel(); // خواب یدکی یتیم نمی‌ماند — قاعدهٔ پنجرهٔ گو/نوگو
      resolve(ok);
    };
    const onNode = (ev) => {
      const btn = ev.target.closest('.play-corsi__shell');
      if (!btn || btn.disabled) return;
      ev.preventDefault();
      if (Number(btn.dataset.idx) === order.length) {
        order.push(Number(btn.dataset.idx));
        btn.classList.add('play-corsi__shell--step');
        if (order.length >= buttons.length) finish(true); // دنبالهٔ تمرین کامل شد
      } else {
        finish(false); // ترتیب قطع شد — پایان بی‌سرزنش
      }
    };
    /* فاز نمایش — برق‌زدن دو صدف به ترتیب ۰→۱؛ دکمه‌ها بی‌اثر تا پایان نمایش */
    const displaySeq = async () => {
      for (let i = 0; i < buttons.length; i++) {
        buttons[i].classList.add('play-corsi__shell--lit');
        await sleeper.sleep(PRACTICE_LIT_MS);
        buttons[i].classList.remove('play-corsi__shell--lit');
        await sleeper.sleep(PRACTICE_GAP_MS);
      }
    };
    displaySeq().then(() => {
      if (settled) return;
      buttons.forEach((b) => b.addEventListener('pointerdown', onNode));
      sleeper.sleep(9000).then(() => finish(false));
    });
  });
}

/**
 * تمرین تعاملی «کولهٔ مرواریدها» — یک دنبالهٔ دومردپایی با تکرار بی‌سرزنش تا موفقیت.
 * پس از دو تلاشِ ناتمام، ترتیب درست با بج شمارهٔ قدم آرام نشان می‌شود (آموزش پس از پاسخ).
 * خروجی: { applied, retries } — applied=false یعنی صحنه/ساعت آماده نبود.
 */
export async function practiceInteractive(ctx) {
  const { stage, sleeper } = ctx || {};
  if (!stage || !sleeper) return { applied: false, retries: 0 };
  let retries = 0;
  let misses = 0;

  for (;;) {
    stage.className = 'play-stage';
    stage.classList.add('play-stage--teach');
    stage.innerHTML = practiceCardHtml('قدم ۱ از ۱', CORSI_PRACTICE.watchLine);
    decoratePractice(stage);
    fx.revealStage(stage);
    fx.popIn(stage.querySelector('.play-corsi__field'), 240, false);
    const ok = await practiceRound(stage, sleeper);
    if (ok) {
      stage.innerHTML = practiceCardHtml('قدم ۱ از ۱', CORSI_PRACTICE.success);
      decoratePractice(stage);
      fx.revealStage(stage);
      const el = stage.querySelector('.play-corsi__shell--step');
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width) fx.burstAt(r.left + r.width / 2, r.top + r.height / 2);
      }
      await sleeper.sleep(1200);
      break;
    }
    retries += 1;
    misses += 1;
    stage.innerHTML = practiceCardHtml('قدم ۱ از ۱', CORSI_PRACTICE.retry);
    decoratePractice(stage);
    fx.revealStage(stage);
    if (misses >= 2) {
      // آموزش پس از پاسخ — دنبالهٔ تمرین دانش عمومی است: صدف‌ها با بج قدم نشان می‌شوند
      const shells = stage.querySelectorAll('.play-corsi__shell');
      shells.forEach((t, i) => {
        t.classList.add('play-corsi__shell--truth');
        const badge = document.createElement('span');
        badge.className = 'play-corsi__order';
        badge.textContent = faNum(i + 1);
        t.appendChild(badge);
      });
    }
    await sleeper.sleep(1600);
  }

  stage.className = 'play-stage';
  stage.classList.add('play-stage--teach');
  stage.innerHTML = '<p class="play-line">' + esc(CORSI_PRACTICE.practiceDone) + '</p>';
  decoratePractice(stage);
  fx.revealStage(stage);
  await sleeper.sleep(1600);
  stage.className = 'play-stage';
  stage.innerHTML = '';
  return { applied: true, retries };
}
