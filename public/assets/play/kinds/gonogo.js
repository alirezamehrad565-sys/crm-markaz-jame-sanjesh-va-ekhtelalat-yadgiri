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

/* شکل‌های وکتوری درون‌کد — viewBox 120×124.
   رشتهٔ ساده = یک مسیر پرشده؛ شیء { d, ink } = مسیر پرشده + خطوط جوهری
   بی‌پر (پنجرهٔ موشک، چراغ بشقاب‌پرنده) تا جزئیات با رنگ جوهر Navy خوانا بماند.
   ۱.۲۵.۲۳ درون‌مایهٔ دیداری مرحله‌ها: گل/پروانه/ابر/موشک/بشقاب‌پرنده —
   امضای دیداری مراحل ۲–۴؛ شکل‌ها فقط نمایش‌اند و کلیدی ندارند. */
const SHAPES = {
  star: 'M60 8 L74 46 L115 46 L81 71 L94 112 L60 87 L26 112 L39 71 L5 46 L46 46 Z',
  circle: 'M60 10 a50 50 0 1 0 0.001 0 Z',
  square: 'M18 18 h84 v84 h-84 Z',
  fish: 'M14 60 C34 30 74 28 96 52 L110 40 L110 80 L96 68 C74 92 34 90 14 60 Z M100 54 a6 6 0 1 0 0.001 0',
  crab: 'M28 52 a32 26 0 1 0 64 0 a32 26 0 1 0 -64 0 M22 46 a10 10 0 1 0 0.001 0 M98 46 a10 10 0 1 0 0.001 0 M34 80 l-10 14 M50 84 l-4 16 M70 84 l4 16 M86 80 l10 14',
  boat: 'M20 74 h80 l-12 22 h-56 Z M58 12 v56 M58 16 l30 40 h-30 Z',
  balloon: 'M60 14 a30 34 0 1 0 0.001 0 M60 82 q-6 10 0 18 q6 8 0 16',
  heart: 'M60 104 C20 76 10 52 24 34 C36 20 54 24 60 40 C66 24 84 20 96 34 C110 52 100 76 60 104 Z',
  /* ─── مرحلهٔ ۲ باغ ─── */
  flower: {
    d: 'M60 23 a15 15 0 1 0 0.01 0 M60 67 a15 15 0 1 0 0.01 0 M38 45 a15 15 0 1 0 0.01 0 M82 45 a15 15 0 1 0 0.01 0 M60 48 a12 12 0 1 0 0.01 0',
    ink: 'M60 96 Q56 106 60 114 M60 90 Q50 100 44 106'
  },
  butterfly: {
    d: 'M60 48 C36 20 10 34 24 56 C12 70 32 92 58 72 M60 48 C84 20 110 34 96 56 C108 70 88 92 62 72 M58 46 L58 88 M62 46 L62 88',
    ink: 'M58 44 Q52 32 46 28 M62 44 Q68 32 74 28'
  },
  /* ─── مرحلهٔ ۳ آسمان ─── */
  cloud: {
    d: 'M24 84 a16 16 0 0 1 4-31 a22 22 0 0 1 43-6 a16 16 0 0 1 25 13 a14 14 0 0 1-7 24 Z'
  },
  /* ─── مرحلهٔ ۴ فضا ─── */
  rocket: {
    d: 'M60 10 C73 25 78 44 78 63 L78 79 L42 79 L42 63 C42 44 47 25 60 10 Z M42 61 L26 86 L42 86 M78 61 L94 86 L78 86 M52 79 L60 98 L68 79',
    ink: 'M60 38 a9 9 0 1 0 0.01 0'
  },
  ufo: {
    d: 'M43 58 a17 15 0 1 1 34 0 M18 64 a42 13 0 1 0 84 0 a42 13 0 1 0 -84 0',
    ink: 'M45 76 a3 3 0 1 0 0.01 0 M60 78 a3 3 0 1 0 0.01 0 M75 76 a3 3 0 1 0 0.01 0'
  }
};

const INK = '#153E50';  /* Navy دفترچهٔ وظیفه — خط جوهری محرک */

function colorOf(stim) {
  const c = stim && typeof stim.color === 'string' ? stim.color.trim() : '';
  return PALETTE[c] || '#E4AA46'; // پیش‌فرض ملایم Amber — مقدار ناشناخته رنگ قرمز پررنگ نمی‌شود
}

function shapeOf(stim) {
  const s = stim && typeof stim.shape === 'string' ? stim.shape.trim() : '';
  const v = SHAPES[s] || SHAPES.star;
  return typeof v === 'string' ? { d: v, ink: null } : v;
}

/** وکتور محرک — svg درون‌خطی با دو نشانهٔ شکل و رنگ (+ جزئیات جوهری اختیاری) */
export function stimSvg(stim) {
  const shape = shapeOf(stim);
  const fill = colorOf(stim);
  return '<svg class="play-svg" viewBox="0 0 120 124" role="img" aria-hidden="true">' +
    '<g fill="' + fill + '" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" ' +
    'stroke-linecap="round"><path d="' + shape.d + '"/></g>' +
    (shape.ink
      ? '<g fill="none" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" ' +
        'stroke-linecap="round"><path d="' + shape.ink + '"/></g>'
      : '') +
    '</svg>';
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
