/* ═══════════════════════════════════════════════════════════════
   fx.js — لایهٔ حسی بازی (۱.۲۵.۲۱)
   تمام جنبش‌های تزئینی پخش‌کننده از همین ماژول می‌آیند: با Web
   Animations API (موتور مرکب مرورگر — بدون کتابخانهٔ بیرونی) و گارد
   کامل کاهش‌جنبش. الهام الگو: حلقهٔ پاداش بازی‌های تمرین شناختی —
   بازخورد شناور درست‌جای، پاپ فنری محرک، انفجار ذره‌ای موفقیت،
   ستارهٔ پران به سبد و پیل تشویق — همه بازنویسی اصلی با پالت خودی.
   قواعد حسی §۹: بی‌صدا، بدون فلاش، بدون شمارندهٔ تکرار؛ هیچ ساعت
   اندازه‌گیری این‌جا نیست — جنبش هرگز RT و شواهد فاز ۴ نمی‌بیند.
   ═══════════════════════════════════════════════════════════════ */

const EASE_OUT = 'cubic-bezier(.22,.61,.36,1)';     /* نشست نرم */
const EASE_SPRING = 'cubic-bezier(.34,1.56,.64,1)'; /* فنری ملایم */
const STAR_PATH = 'M60 8 L74 46 L115 46 L81 71 L94 112 L60 87 L26 112 L39 71 L5 46 L46 46 Z';
const BIT_COLORS = ['#E4AA46', '#438C89', '#63B37F', '#E8925A'];

/** گاه جنبش: با کاهش‌جنبش سیستم، همهٔ افکت‌ها خاموش می‌شوند — محتوای کارکردی می‌ماند */
function motionOk() {
  try { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (err) { return false; }
}

function animate(el, frames, opts) {
  if (!el || typeof el.animate !== 'function') return null;
  try { return el.animate(frames, opts); } catch (err) { return null; }
}

/* ─── ورود محرک — فنری؛ گزینهٔ fade=false برای نمایش آزمون: محرک از نخستین
   فریم با تپش کامل مرئی است (شفافیت هرگز پنجرهٔ پاسخ را عقب نمی‌برد) ─── */

export function popIn(el, ms, fade) {
  if (!motionOk() || !el) return;
  const frames = fade === false
    ? [{ transform: 'scale(.86)' }, { transform: 'scale(1)' }]
    : [{ opacity: 0, transform: 'scale(.86)' }, { opacity: 1, transform: 'scale(1)' }];
  animate(el, frames, { duration: ms || 240, easing: EASE_SPRING });
}

/* ─── خروج محرک در آغاز ITI — برداشت سریع (~۱۶۰ms) با pointer-events خاموش ─── */

export function outThenRemove(el, ms) {
  if (!el) return;
  if (!motionOk()) { el.remove(); return; }
  const a = animate(el,
    [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.82)' }],
    { duration: ms || 160, easing: EASE_OUT, fill: 'forwards' });
  if (a) a.addEventListener('finish', () => { el.remove(); });
  else el.remove();
}

/* ─── گذار شِمال صحنه — بالا-آمدن نرم محتوا در معرفی/آموزش/استراحت/پایان ─── */

export function revealStage(stage, ms) {
  if (!motionOk() || !stage) return;
  animate(stage,
    [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
    { duration: ms || 340, easing: EASE_OUT });
}

/* ─── انفجار ذره‌ای موفقیت — هشت تکهٔ رنگی از مرکز صحنه؛ بی‌ردپا پس از پایان ─── */

export function burstCenter(stage, count) {
  if (!stage) return;
  const f = stage.getBoundingClientRect();
  burstAt(f.left + f.width / 2, f.top + f.height / 2, count);
}

export function burstAt(x, y, count) {
  if (!motionOk()) return;
  const n = count || 8;
  for (let i = 0; i < n; i++) {
    const size = 7 + Math.round(Math.random() * 8);
    const p = document.createElement('span');
    p.className = 'play-fx-bit';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.left = Math.round(x - size / 2) + 'px';
    p.style.top = Math.round(y - size / 2) + 'px';
    p.style.background = BIT_COLORS[i % BIT_COLORS.length];
    document.body.appendChild(p);
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
    const dist = 54 + Math.random() * 72;
    const dx = Math.round(Math.cos(ang) * dist);
    const dy = Math.round(Math.sin(ang) * dist - 28); /* کشش ملایم رو به بالا */
    const a = animate(p,
      [{ opacity: 1, transform: 'translate(0,0) scale(1) rotate(0deg)' },
       { opacity: 0, transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.35) rotate(' + Math.round(200 + Math.random() * 160) + 'deg)' }],
      { duration: 620 + Math.round(Math.random() * 200), easing: EASE_OUT });
    if (a) a.addEventListener('finish', () => { p.remove(); });
    else p.remove();
  }
}

/* ─── ستارهٔ پران — از مرکز صحنه تا سبد ستاره (حلقهٔ پاداش) ─── */

export function flyStar(fromEl, toEl) {
  if (!motionOk() || !fromEl || !toEl) return;
  const f = fromEl.getBoundingClientRect();
  const t = toEl.getBoundingClientRect();
  if (!f.width || !t.width) return;
  const s = 26;
  const star = document.createElement('div');
  star.className = 'play-fx-star';
  star.innerHTML = '<svg viewBox="0 0 120 124" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>';
  const x0 = f.left + f.width / 2 - s / 2;
  const y0 = f.top + f.height / 2 - s / 2;
  const dx = t.left + t.width / 2 - (x0 + s / 2);
  const dy = t.top + t.height / 2 - (y0 + s / 2);
  star.style.left = Math.round(x0) + 'px';
  star.style.top = Math.round(y0) + 'px';
  document.body.appendChild(star);
  const a = animate(star,
    [{ opacity: 0, transform: 'translate(0,0) scale(.4)' },
     { opacity: 1, transform: 'translate(' + Math.round(dx * .45) + 'px,' + Math.round(dy * .45 - 64) + 'px) scale(1.15)', offset: .55 },
     { opacity: 1, transform: 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px) scale(.7)' }],
    { duration: 700, easing: 'cubic-bezier(.45,.05,.55,.95)' });
  if (a) a.addEventListener('finish', () => { star.remove(); });
  else star.remove();
}

/* ─── تپ شمارندهٔ سبد هنگام رسیدن ستاره ─── */

export function popCount(el, ms) {
  if (!motionOk() || !el) return;
  animate(el,
    [{ transform: 'scale(1)' }, { transform: 'scale(1.45)', offset: .5 }, { transform: 'scale(1)' }],
    { duration: ms || 320, easing: EASE_SPRING });
}

/* ─── ردیف ستارهٔ مرحله (۱.۲۵.۲۲) — سه ستارهٔ مسیر پیشرفت؛ فقط تمرین ───
   نشانه‌گذاری از همین‌جا (تک‌منبع شکل ستاره)؛ جنبش روشن‌شدن هم از fx است
   تا گیت «همهٔ جنبش تزئینی فقط از fx» برقرار بماند. */

export function starRow(lit) {
  const n = Math.max(0, Math.min(3, Math.round(Number(lit) || 0)));
  let out = '<div class="play-stars" aria-hidden="true">';
  for (let i = 1; i <= 3; i++) {
    out += '<svg class="play-stars__star' + (i <= n ? ' play-stars__lit' : '') + '" viewBox="0 0 120 124"><path d="' + STAR_PATH + '"/></svg>';
  }
  return out + '</div>';
}

export function popStars(container, ms) {
  if (!motionOk() || !container) return;
  const stars = container.querySelectorAll('.play-stars__lit');
  stars.forEach((s, i) => {
    animate(s,
      [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: ms || 420, easing: EASE_SPRING, delay: i * 130, fill: 'backwards' });
  });
}

/* ─── حباب بازخورد شناور — بالای صحنه، جایی که نگاه کودک است؛ نه پایین صفحه ───
   متن در عنصر ثابت می‌ماند (ابزار QA می‌خواند)؛ دو لحن: ok / calm ─── */

let bubbleTimer = null;

export function popBubble(bubble, text, kind, ms) {
  if (!bubble) return;
  if (bubbleTimer) { window.clearTimeout(bubbleTimer); bubbleTimer = null; }
  bubble.textContent = text;
  bubble.className = kind === 'ok' ? 'play-bubble play-bubble--ok' : 'play-bubble play-bubble--calm';
  bubble.hidden = false;
  if (motionOk()) {
    animate(bubble,
      [{ opacity: 0, transform: 'translateY(10px) scale(.88)' }, { opacity: 1, transform: 'none' }],
      { duration: 240, easing: EASE_SPRING });
  }
  bubbleTimer = window.setTimeout(() => hideBubble(bubble), Math.max(200, ms || 1400));
}

function hideBubble(bubble) {
  bubbleTimer = null;
  if (motionOk()) {
    const a = animate(bubble,
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(.95)' }],
      { duration: 180, easing: EASE_OUT, fill: 'forwards' });
    if (a) { a.addEventListener('finish', () => { bubble.hidden = true; a.cancel(); }); return; }
  }
  bubble.hidden = true;
}

/* ─── پیل تشویق استریک — یک عنصر یگانه؛ هرگز روی هم انباشته نمی‌شود ─── */

let pillEl = null;
let pillTimer = null;

export function pillShow(text, ms) {
  if (!pillEl) {
    pillEl = document.createElement('div');
    pillEl.className = 'play-pill';
    pillEl.setAttribute('role', 'status');
    document.body.appendChild(pillEl);
  }
  pillEl.textContent = text;
  pillEl.hidden = false;
  if (pillTimer) window.clearTimeout(pillTimer);
  if (motionOk()) {
    animate(pillEl,
      [{ opacity: 0, transform: 'translate(-50%,-8px) scale(.85)' }, { opacity: 1, transform: 'translate(-50%,0) scale(1)' }],
      { duration: 260, easing: EASE_SPRING });
  }
  pillTimer = window.setTimeout(() => {
    if (motionOk()) {
      const a = animate(pillEl,
        [{ opacity: 1, transform: 'translate(-50%,0)' }, { opacity: 0, transform: 'translate(-50%,-6px)' }],
        { duration: 200, easing: EASE_OUT, fill: 'forwards' });
      if (a) { a.addEventListener('finish', () => { pillEl.hidden = true; a.cancel(); }); return; }
    }
    pillEl.hidden = true;
  }, Math.max(200, ms || 1500));
}
