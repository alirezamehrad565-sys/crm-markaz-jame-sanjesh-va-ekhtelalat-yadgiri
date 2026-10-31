import { el } from './ui.js';
import { fa } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
let uidSeq = 0; // شناسهٔ یکتای گرادیان‌ها (چند نمودار در یک صفحه)

function svg(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* E3: ساخت نمودارهای زیرِ فولد تعویق می‌شود. wrap با ارتفاع رزروشده (minHeight) فوراً
   برمی‌گردد تا CLS صفر بماند؛ ساخت SVG سنگین فقط وقتی ~۳۲۰px به دید نزدیک شد انجام می‌شود.
   در محیط بدون IntersectionObserver (تست) ساخت فوری است؛ PRM ربطی به تعویقِ رندر ندارد. */
export function deferredChart(build, { reserveH = 190 } = {}) {
  const wrap = el('div', { class: 'chart chart--deferred', style: { minHeight: `${reserveH}px` }, 'aria-busy': 'true' });
  let io = null;
  const flush = () => {
    if (io) io.disconnect();
    wrap.classList.remove('chart--deferred');
    wrap.removeAttribute('aria-busy');
    wrap.style.minHeight = '';
    wrap.appendChild(build());
  };
  if (typeof IntersectionObserver === 'undefined') { flush(); return wrap; }
  io = new IntersectionObserver(
    (entries) => { if (entries.some((e) => e.isIntersecting)) flush(); },
    { rootMargin: '320px 0px' }
  );
  io.observe(wrap);
  return wrap;
}

/* ─── C4: لایهٔ tooltip مشترک (جانشین <title> بومی: بدون تأخیر، با لمس و فوکوس) ───
   tip.show(html, targetEl) بالای هدف می‌نشیند و از لبهٔ wrap بیرون نمی‌زند. */
function makeTip(wrap) {
  const tip = el('div', { class: 'chart-tip', 'aria-hidden': 'true' });
  wrap.classList.add('chart--tipped');
  wrap.appendChild(tip);
  const show = (html, target) => {
    tip.innerHTML = html;
    tip.classList.add('is-on');
    const wr = wrap.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const tw = tip.offsetWidth;
    let x = tr.left + tr.width / 2 - wr.left;
    x = Math.max(6, Math.min(x - tw / 2, wr.width - tw - 6));
    const above = tr.top - wr.top - tip.offsetHeight - 8;
    const y = above >= 0 ? above : tr.bottom - wr.top + 8;
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const hide = () => tip.classList.remove('is-on');
  return { show, hide };
}

/* هیت‌تارگت شفاف قابل‌فوکوس روی یک نقطه/ستون — event ها به tip وصل می‌شوند */
function hitTarget({ wrap, tip, x, y, w = 16, h = 16, label, html }) {
  const hit = svg('rect', {
    x, y, width: w, height: h, fill: 'transparent', class: 'chart__hit',
    tabindex: '0', role: 'img', 'aria-label': label
  });
  const on = () => tip.show(html, hit);
  hit.addEventListener('pointerenter', on);
  hit.addEventListener('pointermove', on);
  hit.addEventListener('pointerleave', tip.hide);
  hit.addEventListener('focus', on);
  hit.addEventListener('blur', tip.hide);
  return hit;
}

/* C9: مسیر مونوتون-کوبیک (Catmull-Rom → Bezier با کلمپ Y) — جانشین polyline شکسته */
function smoothPath(xs, ys) {
  if (xs.length < 2) return '';
  const n = xs.length;
  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[Math.max(i - 1, 0)], y0 = ys[Math.max(i - 1, 0)];
    const x1 = xs[i], y1 = ys[i];
    const x2 = xs[i + 1], y2 = ys[i + 1];
    const x3 = xs[Math.min(i + 2, n - 1)], y3 = ys[Math.min(i + 2, n - 1)];
    const t = 0.2; // — کشش کم تا overshoot ندهد (مونوتون عملی)
    const cp1x = x1 + (x2 - x0) * t, cp1y = y1 + (y2 - y0) * t;
    const cp2x = x2 - (x3 - x1) * t, cp2y = y2 - (y3 - y1) * t;
    d += ` C${cp1x.toFixed(1)},${Math.max(ys[i], Math.min(ys[i + 1], cp1y)).toFixed(1)} ${cp2x.toFixed(1)},${Math.max(ys[i], Math.min(ys[i + 1], cp2y)).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return d;
}

/* C11: میله با فقط گوشهٔ بالای داده گرد (rx چهارگوشه فرم قالبی بود) */
function roundedTopBar(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  const bottom = y + h;
  if (h <= 0.5) return `M${x},${bottom} h${w} v${-h} h${-w} Z`;
  return `M${x},${bottom} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${bottom} Z`;
}

export function barChart({ points, height = 170, valueFormatter = (v) => fa(v) }) { // پیش‌فرض ارقام فارسی
  const wrap = el('div', { class: 'chart chart--bars' });
  if (!points.length) {
    wrap.appendChild(el('p', { class: 'chart__empty' }, 'داده‌ای برای نمایش نیست'));
    return wrap;
  }
  const max = Math.max(1, ...points.map((p) => p.total));
  const W = Math.max(320, points.length * 34);
  const pad = { top: 18, bottom: 22, right: 34, left: 8 }; // C3: پدینگ راست برای برچسب مقادیر (RTL)

  const hasCancelled = points.some((p) => p.cancelled > 0);
  const node = svg('svg', {
    viewBox: `0 0 ${W} ${height}`,
    width: W, height, // C1: رندر ۱:۱ (متن‌ها دیگر با viewBox له نمی‌شوند)؛ عرض زیاد در اسکرول رپر
    preserveAspectRatio: 'xMidYMid meet',
    class: 'chart__svg',
    role: 'img',
    'aria-label': `نمودار ستونی نوبت‌ها در ${fa(points.length)} روز؛ بیشینهٔ روزانه ${valueFormatter(max)}`,
  });
  const desc = svg('desc');
  desc.textContent = `ستون‌های نوبت روزانه؛${hasCancelled ? ' بخش کهرباییِ هر ستون سهم لغوشده است.' : ''}`;
  node.appendChild(desc);
  for (const [frac, lab] of [[1, max], [0.5, max / 2]]) { // C10: گرید با برچسب مقدار
    const y = pad.top + (height - pad.top - pad.bottom) * (1 - frac);
    node.appendChild(svg('line', { x1: pad.left, x2: W - pad.right, y1: y, y2: y, class: 'chart__grid' }));
    const t = svg('text', { x: W - pad.right + 6, y: y + 4, class: 'chart__axis', 'text-anchor': 'start' });
    t.textContent = valueFormatter(Math.round(lab));
    node.appendChild(t);
  }

  const slot = W / points.length;
  const barW = Math.min(22, slot * 0.62);
  const tip = makeTip(wrap);
  const plotH = height - pad.top - pad.bottom;
  points.forEach((p, i) => {
    const hTot = (plotH * p.total) / max;
    const hCancel = hasCancelled ? (plotH * (p.cancelled ?? 0)) / max : 0;
    const hBase = hTot - hCancel;
    const x = slot * i + (slot - barW) / 2;
    const yBase = height - pad.bottom - hBase;
    const g = svg('g', { class: 'chart__bar-g' });
    const rect = svg('path', {
      d: roundedTopBar(x, prefersReducedMotion() ? yBase : height - pad.bottom, barW, prefersReducedMotion() ? hBase : 0, 4),
      class: `chart__bar`,
      style: `transition-delay: ${Math.min(i * 18, 500)}ms` /* C6: stagger واقعی با transition-delay */
    });
    g.appendChild(rect);
    if (hCancel > 0) { // C11: لغوشده = سگمنت انباشتهٔ جدا (نه رنگ مخلوط مبهم)
      g.appendChild(svg('rect', {
        x, y: yBase - hCancel, width: barW, height: prefersReducedMotion() ? hCancel : 0,
        class: 'chart__bar-cancel',
        style: `transition-delay: ${Math.min(i * 18 + 60, 560)}ms`
      }));
    }
    if (!prefersReducedMotion()) {
      requestAnimationFrame(() => {
        rect.setAttribute('d', roundedTopBar(x, yBase, barW, Math.max(hBase, p.total > 0 ? 3 : 0), 4));
        if (hCancel > 0) {
          const cancelRect = g.querySelector('.chart__bar-cancel');
          cancelRect.setAttribute('y', yBase - hCancel);
          cancelRect.setAttribute('height', hCancel);
        }
      });
    }
    const label = `${p.date}: ${valueFormatter(p.total)}${p.cancelled ? ` (${fa(p.cancelled)} لغوشده)` : ''}`;
    g.appendChild(hitTarget({
      wrap, tip, x: slot * i, y: pad.top, w: slot, h: height - pad.top - pad.bottom, label,
      html: `<b>${p.date}</b><span>${valueFormatter(p.total)} نوبت${p.cancelled ? ` · ${fa(p.cancelled)} لغوشده` : ''}</span>`
    }));
    node.appendChild(g);

    if (points.length <= 16 || i % Math.ceil(points.length / 16) === 0) {
      const t = svg('text', { x: slot * i + slot / 2, y: height - 6, class: 'chart__tick', 'text-anchor': 'middle' });
      // برچسب جلالی (حاوی فاصله) همان‌طور نمایش داده می‌شود؛ ISO فقط بخش روز
      t.textContent = typeof p.date === 'string' && p.date.includes(' ') ? p.date : String(p.date ?? '').slice(8, 10);
      node.appendChild(t);
    }
  });

  if (hasCancelled) { // C11: کپشن مشترک برای ستون‌های دارای لغوشده
    wrap.appendChild(el('p', { class: 'chart__caption' }, 'بخش کهربایی هر ستون: نوبت‌های لغوشدهٔ همان روز'));
  }

  // C1: سری متراکم داخل اسکرول افقی (عرض واقعی حفظ می‌شود؛ متن خوانا می‌ماند)
  if (W > 640) {
    wrap.appendChild(el('div', { class: 'chart__scroll' }, node));
  } else {
    node.removeAttribute('width'); node.removeAttribute('height');
    wrap.appendChild(node);
  }
  return wrap;
}

export function donut({ segments, centerLabel = '', size = 190, stroke = 26 }) {
  const wrap = el('div', { class: 'chart chart--donut' });
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const node = svg('svg', {
    viewBox: `0 0 ${size} ${size}`, class: 'chart__svg', role: 'img',
    'aria-label': `${centerLabel || 'نمودار دونات'} — مجموع ${fa(total)}`
  });
  const desc = svg('desc');
  desc.textContent = segments.map((s) => `${s.label}: ${fa(s.value)}`).join('؛ ');
  node.appendChild(desc);
  node.appendChild(svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', class: 'chart__track', 'stroke-width': stroke }));

  const tip = makeTip(wrap);
  let acc = 0;
  for (const [i, seg] of segments.entries()) {
    if (seg.value <= 0) continue;
    const frac = seg.value / total;
    const dash = frac * c;
    const circle = svg('circle', {
      cx: size / 2,
      cy: size / 2,
      r,
      fill: 'none',
      class: `chart__seg chart__seg--${seg.tone}`,
      'stroke-width': stroke,
      // C8: کف دید ۱٫۵ — سهم‌های ریز دیگر کاملاً نامرئی نمی‌شوند
      'stroke-dasharray': `${Math.max(dash - 2, 1.5)} ${c - Math.max(dash - 2, 1.5)}`,
      'stroke-dashoffset': prefersReducedMotion() ? -acc * c + c / 4 : c / 4 - acc * c - c, // شروع خارج از دید
      'stroke-linecap': 'butt',
      style: `transition-delay: ${i * 120}ms`, /* C6 */
      transform: `rotate(90 ${size / 2} ${size / 2})`,
      tabindex: '0', role: 'img', 'aria-label': `${seg.label}: ${fa(seg.value)} (${fa(Math.round(frac * 100))}٪)`
    });
    // C4: سگمنت خودش رویداد پوینتر/فوکوس می‌گیرد (جانشین <title> بومی)
    const on = () => tip.show(`<b>${seg.label}</b><span>${fa(seg.value)} · ${fa(Math.round(frac * 1000) / 10)}٪</span>`, circle);
    circle.addEventListener('pointerenter', on);
    circle.addEventListener('pointermove', on);
    circle.addEventListener('pointerleave', tip.hide);
    circle.addEventListener('focus', on);
    circle.addEventListener('blur', tip.hide);
    node.appendChild(circle);
    acc += frac;
    if (!prefersReducedMotion()) {
      requestAnimationFrame(() => {
        circle.setAttribute('stroke-dashoffset', c / 4 - acc * c + c); // اصلاح نسبی — با transition
      });
    }
  }

  const centerText = svg('text', { x: '50%', y: '50%', class: 'chart__center', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  centerText.textContent = fa(total); // ارقام فارسی مرکز دونات
  const centerCap = svg('text', { x: '50%', y: `${50 + 18}%`, class: 'chart__center-cap', 'text-anchor': 'middle' });
  centerCap.textContent = centerLabel;
  node.appendChild(centerText);
  node.appendChild(centerCap);

  const legend = el('div', { class: 'chart__legend' },
    segments.map((s) =>
      el('div', { class: 'chart__legend-item' },
        el('span', { class: `chart__dot chart__dot--${s.tone}` }),
        el('span', { class: 'chart__legend-label' }, s.label),
        el('b', {}, fa(s.value)) // ارقام فارسی legend
      )
    )
  );

  wrap.appendChild(node);
  wrap.appendChild(legend);
  return wrap;
}

export function hbars({ items, valueFormatter = (v) => fa(v) }) { // پیش‌فرض ارقام فارسی
  const wrap = el('div', { class: 'chart chart--hbars' });
  if (!items.length) {
    wrap.appendChild(el('p', { class: 'chart__empty' }, 'داده‌ای برای نمایش نیست'));
    return wrap;
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  wrap.appendChild(
    el('div', { class: 'chart__hbar-list' },
      items.map((item, i) =>
        el('div', { class: 'chart__hbar' },
          el('div', { class: 'chart__hbar-head' },
            el('span', { class: 'chart__hbar-label' }, item.label),
            el('b', { class: 'chart__hbar-value' }, valueFormatter(item.value))
          ),
          // C19: نقش progressbar با مقدار (الگوی goal-bar داشبورد)
          el('div', {
            class: 'chart__hbar-track', role: 'progressbar',
            'aria-valuemin': '0', 'aria-valuemax': max, 'aria-valuenow': item.value,
            'aria-label': `${item.label}: ${valueFormatter(item.value)}`
          },
            // E1: پرشدن با scaleX (composite) به‌جای width (layout) — origin راست در CSS
            el('div', {
              class: `chart__hbar-fill chart__hbar-fill--${item.tone ?? 'accent'}`,
              style: `transform: scaleX(0); transition-delay: ${i * 60}ms`, /* C6: stagger واقعی */
              'data-sx': String(Math.max(item.value / max, 0.02))
            })
          ),
          item.hint ? el('div', { class: 'chart__hbar-hint' }, item.hint) : null
        )
      )
    )
  );
  if (!prefersReducedMotion()) {
    requestAnimationFrame(() => {
      wrap.querySelectorAll('.chart__hbar-fill').forEach((f) => {
        f.style.transform = `scaleX(${f.getAttribute('data-sx')})`;
      });
    });
  } else {
    wrap.querySelectorAll('.chart__hbar-fill').forEach((f) => {
      f.style.transform = `scaleX(${f.getAttribute('data-sx')})`;
    });
  }
  return wrap;
}

export function countUp(el_, value, { duration = 700, formatter = (v) => String(v) } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    el_.textContent = formatter(value);
    return;
  }
  if (prefersReducedMotion()) {
    el_.textContent = formatter(value);
    return;
  }
  const start = performance.now();
  const from = 0;
  function frame(t) {
    const p = Math.min((t - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3); // منحنی حرکت easeOutCubic
    el_.textContent = formatter(Math.round(from + (value - from) * eased));
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

export function lineChart({ points, yMin = 0, yMax = null, height = 190, valueFormatter = (v) => fa(Math.round(v)), threshold = null, goalLine = null, ticks = null }) { // goalLine · ticks اختیاری (C21)
  const wrap = el('div', { class: 'chart chart--line' });
  if (!points.length) {
    wrap.appendChild(el('p', { class: 'chart__empty' }, 'داده‌ای برای نمایش نیست'));
    return wrap;
  }
  const lo = yMin;
  const hi = yMax ?? Math.max(...points.map((p) => p.y));
  const span = Math.max(1e-9, hi - lo);
  const W = Math.max(320, Math.min(760, points.length * 68));
  const pad = { top: 18, right: 38, bottom: 26, left: 12 }; // C3: محور Y سمت راست (RTL)
  const node = svg('svg', {
    viewBox: `0 0 ${W} ${height}`,
    width: W > 640 ? W : null, height: W > 640 ? height : null, // C1: ۱:۱ برای سری متراکم
    preserveAspectRatio: 'xMidYMid meet',
    class: 'chart__svg',
    role: 'img',
    'aria-label': `نمودار خطی با ${fa(points.length)} نقطه؛ از ${valueFormatter(points[0]?.y ?? lo)} تا ${valueFormatter(points[points.length - 1]?.y ?? hi)}`
  });
  const desc = svg('desc');
  desc.textContent = `روند زمانی از «${points[0]?.x ?? ''}» تا «${points[points.length - 1]?.x ?? ''}» — زمان از چپ به راست می‌خواند (قدیم به جدید).`;
  node.appendChild(desc);
  const plotH = height - pad.top - pad.bottom;
  const plotW = W - pad.left - pad.right;
  const yOf = (v) => pad.top + plotH * (1 - (v - lo) / span);
  // C21: تیک‌های معنادار اختیاری (مثلاً پراپ: ۱ تا ۴) — تیک ۰ بی‌معنا حذف
  const tickVals = (Array.isArray(ticks) && ticks.length ? ticks : [lo, lo + span / 2, hi])
    .filter((v) => v >= lo && v <= hi);
  for (const v of tickVals) {
    const y = yOf(v);
    node.appendChild(svg('line', { x1: pad.left, x2: W - pad.right, y1: y, y2: y, class: 'chart__grid' }));
    const t = svg('text', { x: W - pad.right + 6, y: y + 4, class: 'chart__axis', 'text-anchor': 'start' });
    t.textContent = valueFormatter(v);
    node.appendChild(t);
  }
  // خط ملاک اختیاری (مثلاً «خط ملاک ۸۰٪»): خط‌چین + برچسب کوچک؛ بیرون از بازهٔ محور رسم نمی‌شود
  if (threshold && typeof threshold.value === 'number' && threshold.value >= lo && threshold.value <= hi) {
    const ty = yOf(threshold.value);
    node.appendChild(svg('line', {
      x1: pad.left, x2: W - pad.right, y1: ty.toFixed(1), y2: ty.toFixed(1),
      class: 'chart__threshold-line'
    }));
    const tl = svg('text', { x: pad.left + 4, y: Math.max(ty - 4, 9), class: 'chart__threshold-label', 'text-anchor': 'start' });
    tl.textContent = threshold.label ? `${threshold.label}: ${valueFormatter(threshold.value)}` : valueFormatter(threshold.value);
    node.appendChild(tl);
  }
  const xOf = (i) => (points.length > 1
    ? pad.left + (plotW * i) / (points.length - 1)
    : pad.left + plotW / 2);
  // خط هدف اختیاری: از خط پایه با گام هفتگی تا ملاک — خط‌چین بین دو نقطهٔ اندیس‌دار
  if (goalLine && points.length > 1
    && goalLine.fromY >= lo && goalLine.fromY <= hi && goalLine.toY >= lo && goalLine.toY <= hi) {
    node.appendChild(svg('line', {
      x1: xOf(0).toFixed(1), y1: yOf(goalLine.fromY).toFixed(1),
      x2: xOf(points.length - 1).toFixed(1), y2: yOf(goalLine.toY).toFixed(1),
      class: 'chart__goalline'
    }));
    const gl = svg('text', { x: pad.left + 4, y: Math.max(yOf(goalLine.toY) - 5, 9), class: 'chart__threshold-label chart__goalline-label', 'text-anchor': 'start' });
    gl.textContent = goalLine.label ?? 'خط هدف';
    node.appendChild(gl);
  }

  const xs = points.map((_, i) => xOf(i));
  const ys = points.map((p) => yOf(p.y));
  const uid = `chart-grad-${(uidSeq += 1)}`;
  // C9: ناحیهٔ زیر منحنی با گرادیان توکن‌محور + مسیر نرم مونوتون
  const defs = svg('defs');
  const grad = svg('linearGradient', { id: uid, x1: '0', y1: '0', x2: '0', y2: '1' });
  const s1 = svg('stop', { offset: '0' }); s1.setAttribute('style', 'stop-color: var(--primary); stop-opacity: 0.16;');
  const s2 = svg('stop', { offset: '1' }); s2.setAttribute('style', 'stop-color: var(--primary); stop-opacity: 0;');
  grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad);
  node.appendChild(defs);
  if (points.length > 1) {
    const area = `${smoothPath(xs, ys)} L${xs[xs.length - 1].toFixed(1)},${(height - pad.bottom).toFixed(1)} L${xs[0].toFixed(1)},${(height - pad.bottom).toFixed(1)} Z`;
    node.appendChild(svg('path', { d: area, fill: `url(#${uid})`, class: 'chart__area', stroke: 'none' }));
    node.appendChild(svg('path', { d: smoothPath(xs, ys), class: 'chart__line', fill: 'none' }));
  } else {
    node.appendChild(svg('polyline', { points: points.map((p, i) => `${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(' '), class: 'chart__line', fill: 'none' }));
  }

  const tip = makeTip(wrap);
  // C22: گام برچسب X بر اساس عرض تخمینی (در موبایل دیگر روی‌هم نمی‌افتد)
  const step = Math.max(1, Math.ceil((points.length * 46) / W));
  points.forEach((p, i) => {
    const last = i === points.length - 1;
    if (last) { // C9: نقطهٔ آخر برجسته با هاله و بج مقدار
      node.appendChild(svg('circle', { cx: xs[i].toFixed(1), cy: ys[i].toFixed(1), r: 9, class: 'chart__dot-halo' }));
      const badge = svg('text', { x: xs[i].toFixed(1), y: (ys[i] - 12).toFixed(1), class: 'chart__lastval', 'text-anchor': 'middle' });
      badge.textContent = valueFormatter(p.y);
      node.appendChild(badge);
    }
    const c = svg('circle', { cx: xs[i].toFixed(1), cy: ys[i].toFixed(1), r: last ? 4.5 : 3.4, class: last ? 'chart__dot chart__dot--last' : 'chart__dot' });
    node.appendChild(c);
    node.appendChild(hitTarget({
      wrap, tip, x: xs[i] - 11, y: ys[i] - 11, w: 22, h: 22,
      label: `${p.x}: ${valueFormatter(p.y)}${p.note ? ` — ${p.note}` : ''}`,
      html: `<b>${p.x}</b><span>${valueFormatter(p.y)}${p.note ? ` — ${p.note}` : ''}</span>`
    }));
    if (points.length <= 12 || i % step === 0 || last) {
      const t = svg('text', { x: xs[i].toFixed(1), y: height - 9, class: 'chart__axis', 'text-anchor': 'middle' });
      t.textContent = p.x;
      node.appendChild(t);
    }
  });
  if (W > 640) {
    wrap.appendChild(el('div', { class: 'chart__scroll' }, node));
  } else {
    wrap.appendChild(node);
  }
  return wrap;
}
