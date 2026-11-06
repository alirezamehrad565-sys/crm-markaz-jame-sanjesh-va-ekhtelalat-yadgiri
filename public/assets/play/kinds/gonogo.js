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

/* شکل‌های وکتوری درون‌کد — viewBox 120×120 */
const SHAPES = {
  star: 'M60 8 L74 46 L115 46 L81 71 L94 112 L60 87 L26 112 L39 71 L5 46 L46 46 Z',
  circle: 'M60 10 a50 50 0 1 0 0.001 0 Z',
  square: 'M18 18 h84 v84 h-84 Z',
  fish: 'M14 60 C34 30 74 28 96 52 L110 40 L110 80 L96 68 C74 92 34 90 14 60 Z M100 54 a6 6 0 1 0 0.001 0',
  crab: 'M28 52 a32 26 0 1 0 64 0 a32 26 0 1 0 -64 0 M22 46 a10 10 0 1 0 0.001 0 M98 46 a10 10 0 1 0 0.001 0 M34 80 l-10 14 M50 84 l-4 16 M70 84 l4 16 M86 80 l10 14',
  boat: 'M20 74 h80 l-12 22 h-56 Z M58 12 v56 M58 16 l30 40 h-30 Z',
  balloon: 'M60 14 a30 34 0 1 0 0.001 0 M60 82 q-6 10 0 18 q6 8 0 16',
  heart: 'M60 104 C20 76 10 52 24 34 C36 20 54 24 60 40 C66 24 84 20 96 34 C110 52 100 76 60 104 Z'
};

const INK = '#153E50';  /* Navy دفترچهٔ وظیفه — خط جوهری محرک */

function colorOf(stim) {
  const c = stim && typeof stim.color === 'string' ? stim.color.trim() : '';
  return PALETTE[c] || '#E4AA46'; // پیش‌فرض ملایم Amber — مقدار ناشناخته رنگ قرمز پررنگ نمی‌شود
}

function shapePathsOf(stim) {
  const s = stim && typeof stim.shape === 'string' ? stim.shape.trim() : '';
  return SHAPES[s] || SHAPES.star;
}

/** وکتور محرک — svg درون‌خطی با دو نشانهٔ شکل و رنگ */
export function stimSvg(stim) {
  const paths = shapePathsOf(stim);
  const fill = colorOf(stim);
  return '<svg class="play-svg" viewBox="0 0 120 124" role="img" aria-hidden="true">' +
    '<g fill="' + fill + '" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" ' +
    'stroke-linecap="round"><path d="' + paths + '"/></g></svg>';
}

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
