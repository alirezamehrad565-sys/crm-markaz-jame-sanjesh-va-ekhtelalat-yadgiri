/**
 * نمودارهای SVG خام (ستونی/دونات)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// charts.js — نمودارهای سبک SVG بدون وابستگی
// انیمیشن‌های CSS-محور (scaleY / stroke-dashoffset / width) — سبک و روان
// همه توابع Element برمی‌گردانند؛ رنگ‌ها از CSS متغیر می‌خوانند.

import { el } from './ui.js';
import { fa } from './format.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

/** احترام به prefers-reduced-motion */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ─────────────── نمودار ستونی ───────────────

/**
 * نمودار ستونی روزانه — ورودی: {date, total, cancelled}[]
 * maxهای سقف‌دار، انیمیشن رشد از پایین، tooltip بومی با title
 */
export function barChart({ points, height = 170, valueFormatter = (v) => String(v) }) {
  const wrap = el('div', { class: 'chart chart--bars' });
  if (!points.length) {
    wrap.appendChild(el('p', { class: 'chart__empty' }, 'داده‌ای برای نمایش نیست'));
    return wrap;
  }
  const max = Math.max(1, ...points.map((p) => p.total));
  const W = Math.max(320, points.length * 34);
  const pad = { top: 14, bottom: 22 };

  const node = svg('svg', {
    viewBox: `0 0 ${W} ${height}`,
    preserveAspectRatio: 'xMidYMid meet',
    class: 'chart__svg',
    role: 'img'
  });
  // خطوط راهنما (۳ سطح)
  for (const frac of [1, 0.5]) {
    const y = pad.top + (height - pad.top - pad.bottom) * (1 - frac);
    node.appendChild(svg('line', { x1: 0, x2: W, y1: y, y2: y, class: 'chart__grid' }));
  }

  const slot = W / points.length;
  const barW = Math.min(22, slot * 0.62);
  points.forEach((p, i) => {
    const h = ((height - pad.top - pad.bottom) * p.total) / max;
    const x = slot * i + (slot - barW) / 2;
    const y = height - pad.bottom - h;
    const g = svg('g', { class: 'chart__bar-g' });
    const rect = svg('rect', {
      x, y: prefersReducedMotion() ? y : height - pad.bottom,
      width: barW,
      height: prefersReducedMotion() ? h : 0,
      rx: 4,
      class: `chart__bar${p.cancelled > 0 ? ' chart__bar--mixed' : ''}`,
      style: `animation-delay: ${Math.min(i * 18, 500)}ms`
    });
    // انیمیشن رشد — با CSS animation روی attribute? SVG attr animation سخت است؛ با JS transition
    if (!prefersReducedMotion()) {
      requestAnimationFrame(() => {
        rect.setAttribute('y', y);
        rect.setAttribute('height', Math.max(h, p.total > 0 ? 3 : 0));
      });
    }
    const title = svg('title');
    title.textContent = `${p.date}: ${valueFormatter(p.total)}${p.cancelled ? ` (${p.cancelled} لغوشده)` : ''}`;
    g.appendChild(rect);
    g.appendChild(title);
    node.appendChild(g);

    // برچسب روز (هر n تا بسته به عرض)
    if (points.length <= 16 || i % Math.ceil(points.length / 16) === 0) {
      const t = svg('text', { x: slot * i + slot / 2, y: height - 6, class: 'chart__tick', 'text-anchor': 'middle' });
      t.textContent = p.date.slice(8, 10);
      node.appendChild(t);
    }
  });

  wrap.appendChild(node);
  return wrap;
}

// ─────────────── نمودار دونات ───────────────

/**
 * دونات حضور — segments: {label, value, tone}[]
 * با انیمیشن stroke-dashoffset و مقدار مرکزی
 */
export function donut({ segments, centerLabel = '', size = 190, stroke = 26 }) {
  const wrap = el('div', { class: 'chart chart--donut' });
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const node = svg('svg', { viewBox: `0 0 ${size} ${size}`, class: 'chart__svg', role: 'img' });
  node.appendChild(svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', class: 'chart__track', 'stroke-width': stroke }));

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
      'stroke-dasharray': `${Math.max(dash - 2, 0)} ${c - Math.max(dash - 2, 0)}`,
      'stroke-dashoffset': prefersReducedMotion() ? -acc * c + c / 4 : c / 4 - acc * c - c, // شروع خارج از دید
      'stroke-linecap': 'butt',
      style: `animation-delay: ${i * 120}ms`,
      transform: `rotate(90 ${size / 2} ${size / 2})`
    });
    const title = svg('title');
    title.textContent = `${seg.label}: ${seg.value}`;
    circle.appendChild(title);
    node.appendChild(circle);
    acc += frac;
    // انیمیشن به موقعیت نهایی
    if (!prefersReducedMotion()) {
      requestAnimationFrame(() => {
        circle.setAttribute('stroke-dashoffset', c / 4 - acc * c + c); // اصلاح نسبی — با transition
      });
    }
  }

  // عدد مرکزی
  const centerText = svg('text', { x: '50%', y: '50%', class: 'chart__center', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  centerText.textContent = String(total);
  const centerCap = svg('text', { x: '50%', y: `${50 + 18}%`, class: 'chart__center-cap', 'text-anchor': 'middle' });
  centerCap.textContent = centerLabel;
  node.appendChild(centerText);
  node.appendChild(centerCap);

  const legend = el('div', { class: 'chart__legend' },
    segments.map((s) =>
      el('div', { class: 'chart__legend-item' },
        el('span', { class: `chart__dot chart__dot--${s.tone}` }),
        el('span', { class: 'chart__legend-label' }, s.label),
        el('b', {}, String(s.value))
      )
    )
  );

  wrap.appendChild(node);
  wrap.appendChild(legend);
  return wrap;
}

// ─────────────── میله‌های افقی ───────────────

/**
 * رتبه‌بندی افقی — items: {label, value, hint?, tone?}
 * انیمیشن width + مقدار فارسی
 */
export function hbars({ items, valueFormatter = (v) => String(v) }) {
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
          el('div', { class: 'chart__hbar-track' },
            el('div', {
              class: `chart__hbar-fill chart__hbar-fill--${item.tone ?? 'accent'}`,
              style: `width: 0%; animation-delay: ${i * 60}ms`,
              'data-w': String(Math.max((item.value / max) * 100, 2))
            })
          ),
          item.hint ? el('div', { class: 'chart__hbar-hint' }, item.hint) : null
        )
      )
    )
  );
  // انیمیشن width — بعد از paint
  if (!prefersReducedMotion()) {
    requestAnimationFrame(() => {
      wrap.querySelectorAll('.chart__hbar-fill').forEach((f) => {
        f.style.width = `${f.getAttribute('data-w')}%`;
      });
    });
  } else {
    wrap.querySelectorAll('.chart__hbar-fill').forEach((f) => {
      f.style.width = `${f.getAttribute('data-w')}%`;
    });
  }
  return wrap;
}

// ─────────────── شمارنده متحرک ───────────────

/**
 * شمارش انیمیشنی عدد فارسی — از ۰ تا value در مدت کوتاه
 */
export function countUp(el_, value, { duration = 700, formatter = (v) => String(v) } = {}) {
  // مقادیر غیرعددی (مثل «۱۰٪») مستقیم نمایش داده می‌شوند
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
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    el_.textContent = formatter(Math.round(from + (value - from) * eased));
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ─────────────── نمودار خطی (m164 — گزارش پیشرفت چک‌لیست‌محور) ───────────────

/**
 * نمودار خطی SVG چاپ‌پسند — بدون انیمیشن سنگین (خروجی چاپ باید کامل و قابل استناد باشد).
 * ورودی: points: [{ x: برچسب محور, y: عدد, note? }] · yMin/yMax اختیاری · خطوط راهنما + نقاط + برچسب محور.
 * محور زمان چپ→راست (قدیم→جدید) — قرارداد استاندارد نمودار روند حتی در متن RTL.
 */
export function lineChart({ points, yMin = 0, yMax = null, height = 190, valueFormatter = (v) => fa(Math.round(v)) }) {
  const wrap = el('div', { class: 'chart chart--line' });
  if (!points.length) {
    wrap.appendChild(el('p', { class: 'chart__empty' }, 'داده‌ای برای نمایش نیست'));
    return wrap;
  }
  const lo = yMin;
  const hi = yMax ?? Math.max(...points.map((p) => p.y));
  const span = Math.max(1e-9, hi - lo);
  const W = Math.max(320, Math.min(760, points.length * 68));
  const pad = { top: 14, right: 14, bottom: 26, left: 40 };
  const node = svg('svg', {
    viewBox: `0 0 ${W} ${height}`,
    preserveAspectRatio: 'xMidYMid meet',
    class: 'chart__svg',
    role: 'img'
  });
  const plotH = height - pad.top - pad.bottom;
  const plotW = W - pad.left - pad.right;
  const yOf = (v) => pad.top + plotH * (1 - (v - lo) / span);
  // خطوط راهنما — سه سطح با برچسب مقدار
  for (const frac of [0, 0.5, 1]) {
    const v = lo + span * frac;
    const y = yOf(v);
    node.appendChild(svg('line', { x1: pad.left, x2: W - pad.right, y1: y, y2: y, class: 'chart__grid' }));
    const t = svg('text', { x: pad.left - 7, y: y + 4, class: 'chart__axis', 'text-anchor': 'end' });
    t.textContent = valueFormatter(v);
    node.appendChild(t);
  }
  const xOf = (i) => (points.length > 1
    ? pad.left + (plotW * i) / (points.length - 1)
    : pad.left + plotW / 2);
  // خط روند + نقاط
  const poly = points.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.y).toFixed(1)}`).join(' ');
  node.appendChild(svg('polyline', { points: poly, class: 'chart__line', fill: 'none' }));
  points.forEach((p, i) => {
    const c = svg('circle', { cx: xOf(i).toFixed(1), cy: yOf(p.y).toFixed(1), r: 3.4, class: 'chart__dot' });
    const ti = svg('title');
    ti.textContent = `${p.x}: ${valueFormatter(p.y)}${p.note ? ` — ${p.note}` : ''}`;
    c.appendChild(ti);
    node.appendChild(c);
    // برچسب محور X — تا ۱۲ نقطه همه؛ بیشتر → هر نقطهٔ زوج
    if (points.length <= 12 || i % 2 === 0) {
      const t = svg('text', { x: xOf(i).toFixed(1), y: height - 9, class: 'chart__axis', 'text-anchor': 'middle' });
      t.textContent = p.x;
      node.appendChild(t);
    }
  });
  wrap.appendChild(node);
  return wrap;
}
