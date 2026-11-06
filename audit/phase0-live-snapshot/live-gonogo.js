/* ═══════════════════════════════════════════════════════════════
   kinds/gonogo.js — ماژول بازی گو/نوگو (M2/M3 / ۱.۲۵.۰۹)
   محرک‌ها وکتور درون‌کدند (بدون دارایی خارجی → بدون شبکه و R2) و
   نسخه بی‌صداست: هیچ صدا یا انیمیشن تندی این‌جا نیست (§۹).
   دو نشانهٔ رنگ + شکل — تا کودک کوررنگ حذف نشود (سند محتوا بستهٔ ۳).
   ۱.۲۵.۰۹ — آموزش سه‌گامی، هایلایت نرم محرک‌ها، و کالیبراسیون
   پاسخ‌پنجرهٔ سنی ۹–۱۰ (پنجره‌ها از محتوای بسته می‌آیند نه از این‌جا).
   ═══════════════════════════════════════════════════════════════ */

/* پالت نام‌دار محرک‌ها — کلید انگلیسی و فارسی هر دو پذیرفته می‌شود */
const PALETTE = {
  yellow: '#F2C14E', زرد: '#F2C14E',
  blue: '#4E8DD4', آبی: '#4E8DD4',
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

/* هایلایت سفید نرم روی هر شکل — عمق بصری بدون تصویر بیرونی */
const HIGHLIGHT = {
  star: 'M48 40 L54 58 L44 56 Z',
  circle: 'M42 34 a14 14 0 1 1 0.001 0 Z',
  square: 'M30 30 h22 v14 h-22 Z',
  fish: 'M34 52 C44 40 62 40 74 50 C62 46 46 48 34 52 Z',
  crab: 'M40 44 a14 10 0 1 1 0.001 0 Z',
  boat: 'M56 24 l14 20 h-14 Z',
  balloon: 'M48 30 a8 10 0 1 1 0.001 0 Z',
  heart: 'M38 40 C42 32 52 32 54 38 C50 36 42 36 38 40 Z'
};

const INK = '#12384F';
const SOFT = '#8A8377';

function colorOf(stim) {
  const c = stim && typeof stim.color === 'string' ? stim.color.trim() : '';
  return PALETTE[c] || '#F2C14E'; // پیش‌فرض ملایم زرد — مقدار ناشناخته قرمز پررنگ نمی‌شود
}

function shapePathsOf(stim) {
  const s = stim && typeof stim.shape === 'string' ? stim.shape.trim() : '';
  return SHAPES[s] || SHAPES.star;
}

function shapeKeyOf(stim) {
  const s = stim && typeof stim.shape === 'string' ? stim.shape.trim() : '';
  return SHAPES[s] ? s : 'star';
}

/** وکتور محرک — svg درون‌خطی با دو نشانهٔ شکل و رنگ + هایلایت نرم */
export function stimSvg(stim) {
  const paths = shapePathsOf(stim);
  const glow = HIGHLIGHT[shapeKeyOf(stim)];
  const fill = colorOf(stim);
  return '<svg class="play-svg" viewBox="0 0 120 124" role="img" aria-hidden="true">' +
    '<g fill="' + fill + '" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" ' +
    'stroke-linecap="round"><path d="' + paths + '"/></g>' +
    '<path d="' + glow + '" fill="#FFFFFF" opacity="0.45" stroke="none"/></svg>';
}

/** پنجرهٔ پاسخ آیتم (ms) — از خود محرک محتوا؛ کالیبراسیون سنی در بستهٔ درمانگر */
export function windowMsOf(item) {
  const w = item && item.stim && typeof item.stim.window_ms === 'number'
    ? item.stim.window_ms : 1500;
  return w > 300 && w < 8000 ? w : 1500;
}

/** پاسخ کودک برای touch_report — کل صفحه لمس است، بازداری = عدم لمس تا پایان پنجره */
export function responseOf(item, touched) {
  return { touched: touched === true };
}

/** آموزش سه‌گامی (۱.۲۵.۰۹): هدف ← بازداری ← آماده‌باش.
    فقط از راهنمای آموزشی سرور ساخته می‌شود؛ هیچ ردی از پروب ندارد. */
export function tutorialSteps(hint) {
  const steps = [];
  if (hint && hint.go) {
    steps.push({
      svg: stimSvg(hint.go.stim),
      line: 'این را لمس کن: ' + hint.go.label,
      badge: 'قدم ۱ از ۳ — ستاره می‌گیری!'
    });
  }
  if (hint && hint.nogo) {
    steps.push({
      svg: stimSvg(hint.nogo.stim),
      line: 'این را لمس نکن: ' + hint.nogo.label,
      badge: 'قدم ۲ از ۳ — صبر کنی، ستاره می‌گیری!'
    });
  }
  if (hint && (hint.go || hint.nogo)) {
    steps.push({
      svg: '',
      line: 'آماده‌ای؟ وقتی شکل هدف آمد، صفحه را لمس کن؛ وقتیش نیامد، دست نزن.',
      badge: 'قدم ۳ از ۳ — برای شروع لمس کن'
    });
  }
  return steps;
}

/* سازگاری نسخهٔ قبل — پخش‌کنندهٔ عام از previewSteps هم استفاده می‌کند */
export function previewSteps(hint) {
  return tutorialSteps(hint).map((s) => ({ svg: s.svg, line: s.line }));
}

/** کارت آموزشِ یک‌خطی پیش از شروع */
export const welcomeLine = 'وقتی شکل هدف آمد، صفحه را لمس کن؛ وقتیش نیامد، دست نزن.';
export const restLine = 'یک نفس عمیق بکش؛ هر وقت آماده بودی لمس کن.';
export const soft = { ink: INK, soft: SOFT };
