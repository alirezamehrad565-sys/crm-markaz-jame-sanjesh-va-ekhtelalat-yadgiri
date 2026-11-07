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

/* جنبش تزئینی و صحنهٔ آموزش — همهٔ جنبش از fx با گارد کاهش‌جنبش؛ این ماژول هرگز مستقیم animate نمی‌کند */
import * as fx from '../fx.js';
import { sceneMarkup } from '../scene.js';

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

/* ═══════════════════════════════════════════════════════════════
   G3 / ۱.۲۵.۳۷ — کارت INTRO + تمرین تعاملی «تا موفقیت» (همان الگوی
   حلقهٔ تمرین گونوگو، اقتباس jsPsych): یک موج کوچک آموزشی با تکرار
   بی‌سرزنش. ترکیب موج تمرین را خود ماژول می‌سازد — «کدام خانه جاسوس است»
   در تمرین دانش عمومی قاعده است (شمار آنتن روبه‌کودک)، پس هیچ کلیدی
   لو نمی‌رود؛ کلید آیتم‌های واقعی فقط سمت سرور می‌ماند. ارزیابی هرگز
   تمرین تعاملی نمی‌بیند (C1). نوار زمان موج در تمرین بی‌جنبش می‌ماند
   (بدون شمارش‌معکوس نمایشی — §۹).
   ═══════════════════════════════════════════════════════════════ */

/** کارت INTRO — نام + قانون یک‌خطی از راهنمای سرور؛ ناسالم = قانون امن ایستا */
export const intro = {
  name: 'حملهٔ جاسوس‌ها',
  rule: (hint) => {
    const h = hint && hint.scan && typeof hint.scan.label === 'string' ? hint.scan.label.trim() : '';
    return h !== '' ? h : 'جاسوس‌ها ربات‌هایی با آنتن‌های بیشترند؛ همه را بگیر، هم‌نوع‌ها را دست نزن.';
  }
};

const SCAN_PRACTICE = {
  stepLine: 'جاسوس‌ها را پیدا کن و همه را انتخاب کن؛ بعد «گزارش بده!» را لمس کن.',
  success: 'آفرین! همهٔ جاسوس‌ها را گرفتی و گزارش دادی.',
  retryConfirm: 'انتخاب‌ها خوب بود؛ حالا «گزارش بده!» را هم لمس کن.',
  retryWait: 'هر وقت آماده بودی شروع کن؛ موج عجله ندارد.',
  practiceDone: 'تمرین تمام شد! حالا موج واقعی شروع می‌شود.'
};

/* موج تمرین — چهار خانه در یک ردیف: جاسوس/هم‌نوع/جاسوس/هم‌نوع با امضای هدف */
const PRACTICE_WINDOW_MS = 20000;

function neighborOf(sig) {
  return sig === 1 ? 2 : sig - 1;
}

/** صحنهٔ تمرین — دکور پس‌زمینهٔ لایه‌های دریا؛ جنبش از fx؛ بی‌اثر برای پاسخ */
function decoratePractice(stage) {
  if (!stage) return;
  stage.insertAdjacentHTML('afterbegin', sceneMarkup('teach'));
  fx.sceneAmbient(stage);
}

/** یک موج تمرین کامل یا پنجرهٔ زمانی — تیک هر خانه برمی‌گردد؛ گزارش یا پایان پنجره بسته می‌شود.
 *  موفقیت = همهٔ جاسوس‌ها تیک‌خورده و همهٔ هم‌نوع‌ها تیک‌نخورده در لحظهٔ بستن موج. */
function tapWaveWithin(stage, spyIdxs, ms, sleeper) {
  return new Promise((resolve) => {
    const tiles = Array.from(stage.querySelectorAll('.play-scan__tile'));
    const confirmBtn = stage.querySelector('.play-scan__confirm');
    const hits = new Set();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      tiles.forEach((b) => b.removeEventListener('pointerdown', onTile));
      if (confirmBtn) confirmBtn.removeEventListener('pointerdown', onConfirm);
      sleeper.cancel(); // خواب یدکی یتیم نمی‌ماند — قاعدهٔ پنجرهٔ گو/نوگو
      resolve(spyIdxs.every((i) => hits.has(i)) && hits.size === spyIdxs.length); // همهٔ جاسوس‌ها و فقط جاسوس‌ها
    };
    const onTile = (ev) => {
      const btn = ev.target.closest('.play-scan__tile');
      if (!btn) return;
      ev.preventDefault();
      const idx = Number(btn.dataset.idx);
      if (hits.has(idx)) { hits.delete(idx); btn.classList.remove('play-scan__tile--catch'); }
      else { hits.add(idx); btn.classList.add('play-scan__tile--catch'); }
    };
    const onConfirm = (ev) => { ev.preventDefault(); finish(); };
    tiles.forEach((b) => b.addEventListener('pointerdown', onTile));
    if (confirmBtn) confirmBtn.addEventListener('pointerdown', onConfirm);
    sleeper.sleep(ms).then(finish);
  });
}

function practiceCardHtml(badge, fakeItem, line) {
  return (badge ? '<span class="play-step-badge">' + esc(badge) + '</span>' : '') +
    scanMarkup(fakeItem) +
    '<p class="play-line">' + esc(line) + '</p>';
}

/**
 * تمرین تعاملی «حملهٔ جاسوس‌ها» — یک موج کوچک چهارخانه با تکرار بی‌سرزنش تا موفقیت.
 * پس از دو تلاشِ بی‌موفقیت، جاسوس‌های موج تمرین آرام نشان داده می‌شوند (آموزش پس از پاسخ؛
 * فهرست جاسوس‌های موج تمرین دانش عمومی قاعده است، نه کلید). خروجی: { applied, retries }.
 */
export async function practiceInteractive(ctx) {
  const { stage, sleeper, hint } = ctx || {};
  if (!stage || !sleeper) return { applied: false, retries: 0 };
  const sig = hint && hint.scan && hint.scan.stim && typeof hint.scan.stim.signature === 'number'
    ? Math.max(1, Math.min(4, hint.scan.stim.signature)) : 2;
  const fakeItem = {
    stim: { tiles: [sig, neighborOf(sig), sig, neighborOf(sig)], cols: 4, rows: 1, signature: sig },
    prompt: SCAN_PRACTICE.stepLine
  };
  const spyIdxs = [0, 2];
  let retries = 0;
  let misses = 0;

  for (;;) {
    stage.className = 'play-stage';
    stage.classList.add('play-stage--teach');
    stage.innerHTML = practiceCardHtml('قدم ۱ از ۱', fakeItem, SCAN_PRACTICE.stepLine);
    decoratePractice(stage);
    fx.revealStage(stage);
    fx.popIn(stage.querySelector('.play-scan__grid'), 240, false);
    const ok = await tapWaveWithin(stage, spyIdxs, PRACTICE_WINDOW_MS, sleeper);
    const tappedAny = stage.querySelectorAll('.play-scan__tile--catch').length > 0;
    if (ok) {
      stage.innerHTML = practiceCardHtml('قدم ۱ از ۱', fakeItem, SCAN_PRACTICE.success);
      decoratePractice(stage);
      fx.revealStage(stage);
      const t = stage.querySelector('.play-scan__tile');
      if (t) {
        const r = t.getBoundingClientRect();
        if (r.width) fx.burstAt(r.left + r.width / 2, r.top + r.height / 2);
      }
      await sleeper.sleep(1200);
      break;
    }
    retries += 1;
    misses += 1;
    const line = tappedAny ? SCAN_PRACTICE.retryConfirm : SCAN_PRACTICE.retryWait;
    stage.innerHTML = practiceCardHtml('قدم ۱ از ۱', fakeItem, line);
    decoratePractice(stage);
    fx.revealStage(stage);
    if (misses >= 2) scanRevealTruth(fakeItem, stage, spyIdxs.join(',')); // آموزش پس از پاسخ
    await sleeper.sleep(1600);
  }

  stage.className = 'play-stage';
  stage.classList.add('play-stage--teach');
  stage.innerHTML = '<p class="play-line">' + esc(SCAN_PRACTICE.practiceDone) + '</p>';
  decoratePractice(stage);
  fx.revealStage(stage);
  await sleeper.sleep(1600);
  stage.className = 'play-stage';
  stage.innerHTML = '';
  return { applied: true, retries };
}

function faSig(n) {
  const FA = '۰۱۲۳۴۵۶۷۸۹';
  return String(n).replace(/[0-9]/g, (d) => FA[Number(d)]);
}
