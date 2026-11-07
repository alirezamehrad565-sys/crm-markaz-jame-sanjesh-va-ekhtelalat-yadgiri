/* ═══════════════════════════════════════════════════════════════
   scene.js — کتابخانهٔ هنری صحنهٔ دریایی (M2 مسترپرامپت / ۱.۲۵.۳۶ — راه A)
   «Premium 2D Underwater» به‌روش سازگار با قواعد ثابت پروژه:
     · صفر دارایی خارجی — همه‌چیز وکتور درون‌کد با الگوی {d, ink} (پُر + جوهر Navy)
     · صفر شبکه و صفر کلید — این ماژول فقط نمایش است؛ هیچ نمره/پنجره/پروتکلی نمی‌داند
     · صفر تماس با اندازه‌گیری — صحنه فقط در لحظه‌های تشریفاتی (معرفی/استراحت/کارت
       مرحله/پایان/تمرین) می‌آید؛ شاخه‌های آزمون عیناً به‌صورت امروز می‌مانند و
       CSS صحنه در شِمال اجرای اصلی هم display:none است (کمربند و بند)
     · همهٔ جنبش از fx.sceneAmbient با گارد کاهش‌جنبش — این ماژول markup ایستا می‌دهد
   پالت §۲ دفترچهٔ وظیفه: Navy/Teal/Amber/Cream — رنگ متن هرگز عوض نمی‌شود و
   لایه‌های صحنه بی‌متن‌اند (aria-hidden) — کنتراست AA متنی دست‌نخورده می‌ماند.
   ═══════════════════════════════════════════════════════════════ */

const INK = '#153E50';

/* ─── شخصیت‌های چندحالته — ماهی و خرچنگ ───────────────────────────
   چهار حالت روایت: idle (آرام) · swim (شنا) · happy (خوشحال) · oops (وای!).
   حالت آزمون = idle — ژست ثابت و آرام؛ هیچ حالتی در میانهٔ آزمون عوض نمی‌شود.
   هر حالت { d, ink } در viewBox 120×124 — هم‌قوارهٔ محرک‌های SHAPES. */

const FISH = {
  /* ماهی آرام — بدنهٔ پر + بالهٔ پشتی در d؛ چشم/آبشش/لبخند/شیار باله در ink */
  idle: {
    d: 'M14 62 C26 40 52 30 76 40 L84 44 L102 32 L104 44 L98 60 L104 76 L102 88 L84 76 L76 80 C52 90 26 84 14 62 Z ' +
       'M46 40 Q58 20 72 38 Q58 34 50 44 Z ' +
       'M54 84 Q62 94 72 88 Q64 88 58 82 Z',
    ink: 'M80 52 a4.5 4.5 0 1 0 0.01 0 M72 46 Q66 58 72 70 M20 64 Q26 70 34 66 M50 38 Q58 30 66 38'
  },
  /* ماهی در شنا — دم زاویه‌دار، باله‌ها باز، دو خط جریان پشت دم */
  swim: {
    d: 'M12 64 C24 42 50 32 74 42 L84 48 L100 30 L106 42 L98 62 L106 82 L100 94 L84 76 L74 80 C50 90 24 86 12 64 Z ' +
       'M44 42 Q58 20 72 40 Q58 34 48 44 Z ' +
       'M56 82 Q66 96 78 86 Q68 88 60 80 Z',
    ink: 'M82 54 a4.5 4.5 0 1 0 0.01 0 M74 48 Q68 60 74 72 M18 66 Q24 72 32 68 M108 24 L116 20 M110 62 L118 62 M108 100 L116 104'
  },
  /* ماهی خوشحال — چشم بستهٔ قوس‌دار، لبخند بزرگ، حباب کوچک جلو دهان */
  happy: {
    d: 'M14 62 C26 40 52 30 76 40 L84 44 L102 32 L104 44 L98 60 L104 76 L102 88 L84 76 L76 80 C52 90 26 84 14 62 Z ' +
       'M46 40 Q58 20 72 38 Q58 34 50 44 Z ' +
       'M54 84 Q62 94 72 88 Q64 88 58 82 Z ' +
       'M40 46 Q54 28 68 44 Q54 40 44 48 Z',
    ink: 'M74 50 Q80 44 86 50 M20 60 Q28 72 40 66 M72 46 Q66 58 72 70 M10 44 a3 3 0 1 0 0.01 0 M4 36 a2.5 2.5 0 1 0 0.01 0'
  },
  /* ماهی وای! — چشم گرد درشت با مردمک، دهان «اُ» کوچک، باله افتاده */
  oops: {
    d: 'M14 62 C26 40 52 30 76 40 L84 44 L102 36 L102 88 L84 76 L76 80 C52 90 26 84 14 62 Z ' +
       'M48 44 Q58 28 70 42 Q58 38 52 46 Z',
    ink: 'M80 50 a6.5 6.5 0 1 0 0.01 0 M80 50 a2.5 2.5 0 1 1 0.01 0 M20 66 a4 3.4 0 1 0 0.01 0 M74 48 Q70 58 74 66 M56 88 Q64 92 70 86'
  }
};

const CRAB = {
  /* خرچنگ آرام — لاک‌پُر، دو پنجهٔ بالا، ساقه‌چشم و پاهای کوتاه در ink */
  idle: {
    d: 'M34 58 a28 22 0 1 0 56 0 a28 22 0 1 0 -56 0 ' +
       'M22 42 a9 9 0 1 0 0.01 0 M102 42 a9 9 0 1 0 0.01 0 ' +
       'M14 36 Q22 30 28 36 M96 36 Q102 30 110 36',
    ink: 'M52 48 a3.5 3.5 0 1 0 0.01 0 M72 48 a3.5 3.5 0 1 0 0.01 0 ' +
         'M52 40 L50 32 M72 40 L74 32 ' +
         'M58 58 Q62 62 66 58 ' +
         'M40 78 L32 90 M50 80 L46 94 M74 80 L78 94 M84 78 L92 90'
  },
  /* خرچنگ در شنای بازیگوش — پنجه‌ها بالاتر، پاها بازتر */
  swim: {
    d: 'M34 56 a28 22 0 1 0 56 0 a28 22 0 1 0 -56 0 ' +
       'M20 34 a9 9 0 1 0 0.01 0 M104 34 a9 9 0 1 0 0.01 0 ' +
       'M12 26 Q20 20 26 26 M98 26 Q104 20 112 26',
    ink: 'M52 46 a3.5 3.5 0 1 0 0.01 0 M72 46 a3.5 3.5 0 1 0 0.01 0 ' +
         'M52 38 L49 28 M72 38 L75 28 ' +
         'M57 56 Q62 62 67 56 ' +
         'M38 76 L26 86 M46 80 L38 96 M78 80 L86 96 M86 76 L98 86'
  },
  /* خرچنگ خوشحال — چشم‌های قوس‌دار، پنجه‌ها با ها-ها */
  happy: {
    d: 'M34 58 a28 22 0 1 0 56 0 a28 22 0 1 0 -56 0 ' +
       'M22 38 a9 9 0 1 0 0.01 0 M102 38 a9 9 0 1 0 0.01 0 ' +
       'M14 32 Q22 26 28 32 M96 32 Q102 26 110 32',
    ink: 'M50 46 Q54 42 58 46 M66 46 Q70 42 74 46 ' +
         'M52 38 L50 30 M72 38 L74 30 ' +
         'M56 56 Q62 64 68 56 ' +
         'M40 78 L32 90 M50 80 L46 94 M74 80 L78 94 M84 78 L92 90'
  },
  /* خرچنگ وای! — چشم‌های درشت، دهان اُ، پنجه‌ها جمع */
  oops: {
    d: 'M34 58 a28 22 0 1 0 56 0 a28 22 0 1 0 -56 0 ' +
       'M24 42 a9 9 0 1 0 0.01 0 M100 42 a9 9 0 1 0 0.01 0',
    ink: 'M52 46 a5 5 0 1 0 0.01 0 M72 46 a5 5 0 1 0 0.01 0 ' +
         'M52 40 L50 32 M72 40 L74 32 ' +
         'M60 58 a3 3 0 1 0 0.01 0 ' +
         'M42 78 L36 88 M52 80 L50 92 M72 80 L74 92 M82 78 L88 88'
  }
};

function puppetSvg(set, state, color, cls) {
  const pose = set[state] || set.idle;
  return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 120 124" aria-hidden="true">' +
    '<g fill="' + color + '" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="' + pose.d + '"/></g>' +
    '<g fill="none" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="' + pose.ink + '"/></g>' +
    '</svg>';
}

/** وکتور شخصیت — ماهی/خرچنگ در یکی از چهار حالت روایت؛ رنگ از پالت محرک‌ها */
export function fishPuppet(state, color, cls) {
  return puppetSvg(FISH, state, color || '#E4AA46', cls);
}

export function crabPuppet(state, color, cls) {
  return puppetSvg(CRAB, state, color || '#438C89', cls);
}

/** وکتور حالت آرام برای مصرف محرک — gonogo.js از همین ثابت می‌خواند (تک‌منبع شخصیت) */
export const HERO_VECTORS = { fish: FISH.idle, crab: CRAB.idle };

/* ─── محیط دریا — عناصر تزئینی لایه‌های عمق ───────────────────────── */

const WEED_D = [
  'M30 160 C22 130 34 110 26 80 C22 62 30 44 26 24 C36 46 40 70 38 92 C36 116 40 140 34 160 Z',
  'M62 160 C56 128 68 106 60 76 C56 58 64 40 58 16 C70 40 76 66 72 92 C68 118 74 142 66 160 Z',
  'M94 160 C88 136 98 118 92 92 C88 74 96 56 92 36 C102 58 106 84 102 108 C98 132 102 148 98 160 Z'
];
const CORAL_D = [
  'M40 160 L40 120 C40 108 32 104 32 92 C32 82 40 76 40 66 C40 58 44 52 50 50 C46 60 48 68 48 76 C48 88 54 92 54 104 L54 160 Z',
  'M70 160 L70 112 C70 100 78 96 78 84 C78 74 72 68 74 58 C80 64 84 74 84 84 C84 96 78 102 78 114 L78 160 Z'
];
const SAND_D = 'M0 30 C40 18 80 34 120 26 C160 18 200 34 240 26 C280 18 330 34 390 24 L390 60 L0 60 Z';
const STARFISH_D = 'M60 22 L72 50 L104 52 L80 72 L88 104 L60 86 L32 104 L40 72 L16 52 L48 50 Z';
const SHELL_D = 'M60 90 C36 90 22 74 22 56 C34 62 44 60 50 52 C54 60 60 64 60 64 C60 64 66 60 70 52 C76 60 86 62 98 56 C98 74 84 90 60 90 Z M60 64 L60 88 M50 54 L58 86 M70 54 L62 86';

function svgWrap(cls, body, viewBox) {
  return '<svg class="' + cls + '" viewBox="' + (viewBox || '0 0 390 200') + '" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' + body + '</svg>';
}

function strokeGroup(d, color, w, opacity) {
  return '<g fill="none" stroke="' + color + '" stroke-width="' + (w || 5) + '" stroke-linecap="round" stroke-linejoin="round"' +
    (opacity ? ' opacity="' + opacity + '"' : '') + '><path d="' + d + '"/></g>';
}

/** لایهٔ دور — جلبک‌های محو دوردست (کم‌رنگ، پشت همه) */
export function farLayer() {
  return svgWrap('play-scene__far',
    strokeGroup(WEED_D.join(' '), '#438C89', 7, 0.5));
}

/** لایهٔ میانی — مرجان‌های قلمی و ستارهٔ دریایی */
export function midLayer() {
  return svgWrap('play-scene__mid',
    strokeGroup(CORAL_D.join(' '), '#E8925A', 6, 0.75) +
    '<g fill="#E4AA46" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round" opacity="0.85" transform="translate(300 96) scale(0.42)"><path d="' + STARFISH_D + '"/></g>');
}

/** لایهٔ نزدیک — بستر شنی + صدف */
export function nearLayer() {
  return svgWrap('play-scene__near',
    '<g fill="#F0E7D2" stroke="#E3DCC9" stroke-width="3"><path d="' + SAND_D + '"/></g>' +
    '<g fill="#F5F0E5" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" opacity="0.8" transform="translate(64 8) scale(0.34)"><path d="' + SHELL_D + '"/></g>',
    '0 0 390 60');
}

/** خوشهٔ حباب — سه حباب تزئینی؛ جنبش آرامش از fx.sceneAmbient می‌آید */
export function bubbleCluster() {
  return '<span class="play-scene__bubbles" aria-hidden="true">' +
    [0, 1, 2].map((i) =>
      '<svg class="play-scene__bubble play-scene__bubble--' + i + '" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="9" fill="rgba(255,255,255,.55)" stroke="#438C89" stroke-width="2"/>' +
      '<path d="M7.5 9.5 a5 5 0 0 1 4 -2.5" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>' +
      '</svg>').join('') +
    '</span>';
}

/**
 * صحنهٔ کامل — سه لایهٔ عمق + حباب‌ها (+ اختیاری: شخصیت قهرمان).
 *   variant: 'teach' (معرفی/استراحت/تمرین) | 'end' (پایان)
 *   hero: { svg, cls } — وکتور شخصیت روی صحنه (معرفی/پایان)
 * خروجی فقط markup ایستا؛ نصب جنبش با fx.sceneAmbient(stage) جدا صدا می‌شود.
 */
export function sceneMarkup(variant, hero) {
  return '<div class="play-scene play-scene--' + (variant === 'end' ? 'end' : 'teach') + '" aria-hidden="true">' +
    farLayer() + midLayer() + nearLayer() + bubbleCluster() +
    (hero && hero.svg ? '<span class="play-scene__hero' + (hero.cls ? ' ' + hero.cls : '') + '">' + hero.svg + '</span>' : '') +
    '</div>';
}

/** تزریق صحنه به آغاز صحنهٔ صحنه (به‌عنوان نخستین فرزند — زیر محتوا می‌نشیند) */
export function decorateStage(stage, variant, hero) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup(variant, hero));
}

/* جلبک‌ها برای جنبش تاب‌آرام fx — همان مسیرهای لایهٔ دور، به‌صورت تک-عنصر نزدیک */
export function weedPair() {
  return '<span class="play-scene__weeds" aria-hidden="true">' +
    '<svg class="play-scene__weed play-scene__weed--a" viewBox="0 0 40 80">' +
    '<path d="M20 78 C14 58 24 44 18 24 C16 14 20 8 18 2 C26 14 28 30 26 44 C24 60 26 70 22 78 Z" fill="#438C89" opacity="0.6"/></svg>' +
    '<svg class="play-scene__weed play-scene__weed--b" viewBox="0 0 40 80">' +
    '<path d="M22 78 C16 60 26 46 20 28 C18 18 22 10 20 4 C28 16 30 34 28 48 C26 62 28 70 24 78 Z" fill="#63B37F" opacity="0.55"/></svg>' +
    '</span>';
}
