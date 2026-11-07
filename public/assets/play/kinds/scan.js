/* ═══════════════════════════════════════════════════════════════
   kinds/scan.js — بازی «حملهٔ جاسوس‌ها» (اسکن/سرکشی از نوع d2) — ۱.۲۵.۳۰
   ماژول نمایش: موج ربات‌ها، تبدیل لمس به انتخاب، نشان جاسوس‌های جامانده.
   حس عدی در صحنه است (شب، آژیر، اسکادران دشمن) — هرگز در گفتار با کودک (§۲).
   نمره‌دهی فقط سمت سرور است؛ کلید پاسخ («کدام خانه جاسوس است») هرگز به
   این ماژول نمی‌رسد؛ هیچ درخواست شبکه‌ای ندارد. بی‌صدا؛ جنبش فقط از fx (§۹).
   تفاوت جاسوس/هم‌نوع فقط شمار آنتن است — الگوی d2: بعد حواس‌پرتی یگانه.
   ═══════════════════════════════════════════════════════════════ */

const INK = '#153E50';     /* Navy دفترچهٔ وظیفه — خط جوهری ربات */
const BODY = '#E4AA46';    /* Amber — بدنهٔ ربات (جاسوس و هم‌نوع یکسان؛ فقط آنتن فرق دارد) */
const ALARM = '#D96C6C';   /* Red — گوی آنتن و نشان جاسوس جامانده */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** امضای معتبر آیتم اسکن — شمار آنتن هدف؛ ناسالم = ۲ (پیش‌فرض d2) */
function signatureOf(item) {
  const s = item && item.stim && typeof item.stim === 'object' ? item.stim : {};
  const sig = typeof s.signature === 'number' && Number.isInteger(s.signature) ? s.signature : 2;
  return Math.max(1, Math.min(4, sig));
}

/** آرایهٔ آنتن‌های هر خانه — ناسالم = آرایهٔ خالی */
function tilesOf(item) {
  const s = item && item.stim && typeof item.stim === 'object' ? item.stim : {};
  return Array.isArray(s.tiles) ? s.tiles.filter((n) => Number.isInteger(n) && n >= 0) : [];
}

/** ستون/ردیف موج — ناسالم = ۴×۳ */
function gridOf(item) {
  const s = item && item.stim && typeof item.stim === 'object' ? item.stim : {};
  const cols = typeof s.cols === 'number' && Number.isInteger(s.cols) && s.cols > 0 ? s.cols : 4;
  const rows = typeof s.rows === 'number' && Number.isInteger(s.rows) && s.rows > 0 ? s.rows : 3;
  return { cols, rows };
}

/* جای آنتن‌ها روی سر ربات — ۱ تا ۴ آنتن با گسترهٔ متقارن */
const ANTENNA_X = {
  1: [50],
  2: [42, 58],
  3: [38, 50, 62],
  4: [36, 45, 55, 64]
};

/** وکتور ربات — بدنه/چشم/دست/پا یکسان؛ فقط شمار آنتن (گوی قرمز) متفاوت است */
export function robotSvg(antennas) {
  const n = Math.max(1, Math.min(4, Number.isInteger(antennas) ? antennas : 2));
  const xs = ANTENNA_X[n] || ANTENNA_X[2];
  let ant = '';
  for (const x of xs) {
    ant += '<path d="M' + x + ' 20 v-10"/>' +
      '<circle cx="' + x + '" cy="7" r="4" fill="' + ALARM + '" stroke="' + INK + '" stroke-width="2"/>';
  }
  return '<svg class="play-scan__bot" viewBox="0 0 100 116" role="img" aria-hidden="true">' +
    '<g fill="none" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">' + ant + '</g>' +
    '<g fill="' + BODY + '" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M30 20 h40 a8 8 0 0 1 8 8 v26 a8 8 0 0 1 -8 8 h-40 a8 8 0 0 1 -8 -8 v-26 a8 8 0 0 1 8 -8 Z"/>' +
      '<path d="M26 70 h48 a6 6 0 0 1 6 6 v20 a6 6 0 0 1 -6 6 h-48 a6 6 0 0 1 -6 -6 v-20 a6 6 0 0 1 6 -6 Z"/>' +
    '</g>' +
    '<g fill="' + INK + '">' +
      '<circle cx="42" cy="38" r="4.5"/><circle cx="58" cy="38" r="4.5"/>' +
    '</g>' +
    '<g fill="none" stroke="' + INK + '" stroke-width="2.5" stroke-linecap="round">' +
      '<path d="M12 76 h8"/><path d="M80 76 h8"/>' +
      '<path d="M36 102 v8"/><path d="M64 102 v8"/>' +
    '</g>' +
    '</svg>';
}

/** وکتور محرک برای راهنمای آموزش — ربات با امضای هدف */
export function stimSvg(stim) {
  const sig = stim && typeof stim.signature === 'number' ? stim.signature : 2;
  return robotSvg(sig);
}

/** موج آیتم اسکن — قاعده + شبکهٔ ربات‌ها + نوار زمان موج + دکمهٔ «گزارش بده!» */
export function scanMarkup(item) {
  const tiles = tilesOf(item);
  const { cols } = gridOf(item);
  if (tiles.length === 0) return '<p class="play-muted">این موج ربات ندارد.</p>';
  const sig = signatureOf(item);
  const prompt = item.prompt && String(item.prompt).trim() !== ''
    ? esc(item.prompt)
    : 'جاسوس‌ها ربات‌هایی با ' + faSig(sig) + ' آنتن‌اند — همه را بگیر، هم‌نوع‌ها را دست نزن.';
  const cells = tiles.map((n, i) =>
    '<button type="button" class="play-scan__tile" data-idx="' + i + '" aria-label="ربات">' +
      robotSvg(n) +
    '</button>'
  ).join('');
  return '<div class="play-scan">' +
    '<p class="play-scan__prompt">' + prompt + '</p>' +
    '<div class="play-scan__grid" data-cols="' + cols + '" style="--scan-cols:' + cols + '">' + cells + '</div>' +
    '<div class="play-scan__timer" aria-hidden="true"><span style="width:100%"></span></div>' +
    '<button type="button" class="play-btn play-scan__confirm">گزارش بده!</button>' +
    '</div>';
}

/** نشان حقیقت — جاسوس‌های جامانده از CSV بازخورد سرور؛ فقط تمرین، پس از پاسخ */
export function scanRevealTruth(item, stage, missedCsv) {
  if (typeof missedCsv !== 'string') return null;
  const idxs = missedCsv.split(',').map((v) => Number(v.trim())).filter((v) => Number.isInteger(v) && v >= 0);
  const tiles = stage ? stage.querySelectorAll('.play-scan__tile') : null;
  if (!tiles || tiles.length === 0) return null;
  const marked = [];
  for (const i of idxs) {
    const t = tiles[i];
    if (t && t.classList) { t.classList.add('play-scan__tile--miss'); marked.push(t); }
  }
  return marked.length > 0 ? marked : null;
}

/** مرکز خانهٔ گرفته‌شدهٔ نخست — هدف انفجار ذرات موفقیت (fx.burstAt) */
export function scanCatchPoint(stage) {
  const t = stage ? stage.querySelector('.play-scan__tile--catch') : null;
  if (!t) return null;
  const r = t.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/* ─── قدم‌های آموزش — ایستا؛ هیچ ردی از کلید پاسخ یا آیتم پروب ─── */

function robotSample(antennas, mark) {
  return '<div class="play-scan play-scan--sample">' +
    '<div class="play-scan__grid" data-cols="1">' +
      '<div class="play-scan__tile' + (mark ? ' play-scan__tile--catch' : '') + '">' + robotSvg(antennas) + '</div>' +
    '</div></div>';
}

export function previewSteps(hint) {
  const sig = hint && hint.scan && hint.scan.stim && typeof hint.scan.stim.signature === 'number'
    ? hint.scan.stim.signature : 2;
  const rule = hint && hint.scan && typeof hint.scan.label === 'string' && hint.scan.label.trim() !== ''
    ? hint.scan.label
    : 'جاسوس‌ها ربات‌هایی با ' + faSig(sig) + ' آنتن‌اند؛ فقط این‌ها را بگیر.';
  return [
    { svg: robotSample(sig, true), line: rule },
    { svg: robotSample(sig === 2 ? 1 : sig + 1 > 4 ? 1 : sig + 1, false), line: 'این هم‌نوع است؛ دست نزن.' },
    { svg: robotSample(sig, true), line: 'همهٔ جاسوس‌ها را انتخاب کن و «گزارش بده!» را لمس کن.' }
  ];
}

function faSig(n) {
  const FA = '۰۱۲۳۴۵۶۷۸۹';
  return String(n).replace(/[0-9]/g, (d) => FA[Number(d)]);
}
