import { el, icon } from './ui.js';
import { fa } from './format.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, textContent = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    node.setAttribute(k, String(v));
  }
  if (textContent !== null && textContent !== undefined) node.textContent = String(textContent);
  return node;
}

function svgTitle(text) {
  const t = svg('title');
  t.textContent = text;
  return t;
}

const INDEX_FA = { VCI: 'درک کلامی', PRI: 'استدلال ادراکی', WMI: 'حافظهٔ فعال', PSI: 'سرعت پردازش', FSIQ: 'مقیاس کامل', GAI: 'هوشبهر عملی بدون سرعت' };

const INDEX_COLOR = {
  VCI: 'var(--info, #229ED9)',
  PRI: 'var(--success, #3F8F68)',
  WMI: 'var(--accent, #D89428)',
  PSI: 'var(--hue-7-strong, #8A63C9)',
  FSIQ: 'var(--text-2, #687078)',
  GAI: 'var(--hue-2-strong, #1F9E85)'
};

const SUBTEST_GROUPS = [
  { key: 'VCI', codes: ['SI', 'VC', 'CO', 'IN', 'WR'] },
  { key: 'PRI', codes: ['BD', 'PCn', 'MR', 'PCm'] },
  { key: 'WMI', codes: ['DS', 'LN', 'AR'] },
  { key: 'PSI', codes: ['CD', 'SS', 'CA'] }
];

const SUPPLEMENTAL = new Set(['IN', 'WR', 'PCm', 'AR', 'CA']);

const SUBTEST_FA = {
  BD: 'طراحی مکعب‌ها', SI: 'تشابهات', DS: 'فراخنای ارقام', PCn: 'مفاهیم تصویری', CD: 'رمزگذاری',
  VC: 'واژگان', LN: 'توالی حرف-عدد', MR: 'استدلال ماتریسی', CO: 'درک مطلب', SS: 'جستجوی نماد',
  PCm: 'تکمیل تصاویر', CA: 'خط‌زنی', IN: 'اطلاعات', AR: 'حساب', WR: 'استدلال کلمه'
};

function numOrNull(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export function collectWechslerChartData(view) {
  if (!view || typeof view !== 'object') return null;
  const fsiq = numOrNull(view.fsiq);
  const gai = numOrNull(view.gai);
  const indices = ['VCI', 'PRI', 'WMI', 'PSI']
    .map((key) => ({ key, value: numOrNull(view[key.toLowerCase()]) }))
    .filter((r) => r.value !== null);
  const hasIndices = indices.length > 0 || fsiq !== null || gai !== null;

  const raw = Array.isArray(view.profile?.subtests) ? view.profile.subtests : [];
  const subtests = [];
  SUBTEST_GROUPS.forEach((g, gi) => {
    for (const code of g.codes) {
      const hit = raw.find((s) => s && s.code === code);
      const scaled = hit ? numOrNull(hit.scaled) : null;
      if (scaled === null || scaled < 1 || scaled > 19) continue;
      const supplemental = hit.core === false || (hit.core == null && SUPPLEMENTAL.has(code));
      subtests.push({ code, fa: hit.fa ?? SUBTEST_FA[code] ?? code, scaled, gi, supplemental });
    }
  });
  const hasSubs = subtests.length >= 2;

  if (!hasIndices && !hasSubs) return null;
  return {
    fsiq,
    gai,
    indices,
    bandFa: view.psychometrics?.fsiq?.bandFa ?? null,
    percentile: numOrNull(view.psychometrics?.fsiq?.percentile),
    subtests: hasSubs ? subtests : [],
    personalSubMean: numOrNull(view.profile?.personalSubMean)
  };
}

const P1 = { W: 1000, H: 292, x0: 118, x1: 938, min: 40, max: 160, top: 14, axisY: 248, rowH: 36 };

function p1X(v) {
  const clamped = Math.max(P1.min, Math.min(P1.max, v));
  return P1.x0 + ((clamped - P1.min) / (P1.max - P1.min)) * (P1.x1 - P1.x0);
}

function panelIndicesSVG(data) {
  const rows = [];
  for (const ix of data.indices) rows.push({ key: ix.key, value: ix.value, composite: false });
  if (data.fsiq !== null) rows.push({ key: 'FSIQ', value: data.fsiq, composite: true });
  if (data.gai !== null) rows.push({ key: 'GAI', value: data.gai, composite: false });
  if (!rows.length) return null;

  const s = svg('svg', {
    viewBox: `0 0 ${P1.W} ${P1.H}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': 'نمودار شاخص‌های شناختی وکسلر',
    style: 'display:block;width:100%;height:auto;direction:ltr'
  });

  s.appendChild(svg('rect', { x: p1X(85).toFixed(1), y: P1.top, width: (p1X(115) - p1X(85)).toFixed(1), height: P1.axisY - P1.top, fill: 'var(--info-soft, #E2F3FC)', opacity: '0.85' }));
  s.appendChild(svg('line', { x1: p1X(100), y1: P1.top, x2: p1X(100), y2: P1.axisY, stroke: 'var(--text-3)', 'stroke-width': '1.4', opacity: '0.75' }));
  s.appendChild(svg('line', { x1: p1X(85), y1: P1.top, x2: p1X(85), y2: P1.axisY, stroke: 'var(--danger)', 'stroke-width': '2' }));

  s.appendChild(svg('line', { x1: P1.x0 - 14, y1: P1.axisY, x2: P1.x1 + 14, y2: P1.axisY, stroke: 'var(--border)', 'stroke-width': '1.2' }));
  for (const t of [40, 60, 80, 85, 100, 120, 140, 160]) {
    const isRed = t === 85;
    s.appendChild(svg('text', {
      x: p1X(t).toFixed(1), y: P1.axisY + 24, 'text-anchor': 'middle', 'font-size': isRed ? '22' : '20', /* C17: در مقیاس viewBox ≥۱۲px مؤثر */
      'font-weight': isRed ? '700' : '400', fill: isRed ? 'var(--danger)' : 'var(--text-3)'
    }, String(fa(t))));
  }

  rows.forEach((r, i) => {
    const cy = 38 + i * P1.rowH;
    const color = INDEX_COLOR[r.key] ?? 'var(--text-2, #687078)';
    const g = svg('g');
    g.appendChild(svgTitle(`${INDEX_FA[r.key] ?? r.key} — نمرهٔ استاندارد ${fa(r.value)}`));
    g.appendChild(svg('text', { x: 10, y: cy + 5.5, 'text-anchor': 'start', 'font-size': '22', 'font-weight': '700', fill: 'var(--text-1)' }, r.key));
    const cx = p1X(r.value);
    g.appendChild(svg('circle', {
      cx: cx.toFixed(1), cy: cy.toFixed(1), r: r.composite ? '5.5' : '6',
      fill: r.composite ? color : 'var(--surface, #FFFFFF)',
      stroke: color, 'stroke-width': r.composite ? '1.5' : '2.6'
    }));
    const nearRight = cx > P1.x1 - 70;
    g.appendChild(svg('text', {
      x: (nearRight ? cx - 13 : cx + 13).toFixed(1), y: cy + 5, 'text-anchor': nearRight ? 'end' : 'start',
      'font-size': '21', 'font-weight': '600', fill: color
    }, String(fa(r.value))));
    s.appendChild(g);
  });

  return s;
}

const P2 = { W: 1000, H: 296, x0: 118, x1: 938, top: 22, bottom: 252, subX0: 140, subStep: 57 };

function p2Y(sc) {
  const s = Math.max(1, Math.min(19, sc));
  return P2.top + ((19 - s) / 18) * (P2.bottom - P2.top);
}
function p2X(i) {
  return P2.subX0 + i * P2.subStep;
}

function panelSubtestsSVG(data) {
  const subs = data.subtests;
  if (subs.length < 2) return null;

  const s = svg('svg', {
    viewBox: `0 0 ${P2.W} ${P2.H}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': 'نمودار پروفایل خرده‌آزمون‌های وکسلر',
    style: 'display:block;width:100%;height:auto;direction:ltr'
  });

  for (let sc = 1; sc <= 19; sc += 2) {
    const y = p2Y(sc).toFixed(1);
    s.appendChild(svg('line', { x1: P2.x0 - 14, y1: y, x2: P2.x1 + 14, y2: y, stroke: 'var(--border)', 'stroke-width': sc === 1 ? '1.2' : '0.8', opacity: sc === 1 ? '1' : '0.55' }));
    s.appendChild(svg('text', { x: P2.x0 - 22, y: Number(y) + 4.5, 'text-anchor': 'end', 'font-size': '19', fill: 'var(--text-3)' /* C17 + fallback میراثی حذف */ }, String(fa(sc))));
  }

  const bandTop = p2Y(13).toFixed(1);
  s.appendChild(svg('rect', { x: P2.x0 - 14, y: bandTop, width: (P2.x1 - P2.x0 + 28).toFixed(1), height: (p2Y(7) - p2Y(13)).toFixed(1), fill: 'var(--info-soft, #E2F3FC)', opacity: '0.85' }));

  if (data.personalSubMean !== null && data.personalSubMean > 1 && data.personalSubMean < 19) {
    const my = p2Y(data.personalSubMean);
    s.appendChild(svg('line', { x1: P2.x0 - 14, y1: my.toFixed(1), x2: P2.x1 + 14, y2: my.toFixed(1), stroke: 'var(--danger)', 'stroke-width': '1.4', 'stroke-dasharray': '5 4', opacity: '0.9' }));
    s.appendChild(svg('text', { x: P2.x1 + 14, y: (my - 7).toFixed(1), 'text-anchor': 'end', 'font-size': '19', 'font-weight': '700', fill: 'var(--danger)' }, `میانگین فرد ${fa(data.personalSubMean.toFixed(1)).replace('.', '٫')}`));
  }

  for (let i = 0; i < subs.length - 1; i++) {
    const a = subs[i];
    const b = subs[i + 1];
    const sameGroup = a.gi === b.gi;
    const color = sameGroup ? INDEX_COLOR[SUBTEST_GROUPS[a.gi].key] : 'var(--text-3)';
    s.appendChild(svg('line', {
      x1: p2X(i).toFixed(1), y1: p2Y(a.scaled).toFixed(1),
      x2: p2X(i + 1).toFixed(1), y2: p2Y(b.scaled).toFixed(1),
      stroke: color, 'stroke-width': sameGroup ? '2' : '1.4',
      'stroke-dasharray': sameGroup ? 'none' : '4 4', opacity: sameGroup ? '0.9' : '0.8'
    }));
  }

  subs.forEach((sub, i) => {
    const color = INDEX_COLOR[SUBTEST_GROUPS[sub.gi].key] ?? 'var(--text-2, #687078)';
    const cx = p2X(i);
    const cy = p2Y(sub.scaled);
    const g = svg('g');
    g.appendChild(svgTitle(`${sub.fa} (${sub.code}) — نمرهٔ مقیاس ${fa(sub.scaled)}${sub.supplemental ? ' · جانشین' : ''}`));
    g.appendChild(svg('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: '13', fill: 'transparent' }));
    g.appendChild(svg('circle', {
      cx: cx.toFixed(1), cy: cy.toFixed(1), r: '5.5',
      fill: sub.supplemental ? 'var(--surface, #FFFFFF)' : color,
      stroke: color, 'stroke-width': sub.supplemental ? '2.4' : '1.2'
    }));
    g.appendChild(svg('text', { x: cx.toFixed(1), y: P2.bottom + 26, 'text-anchor': 'middle', 'font-size': '20', 'font-weight': '700', fill: color }, sub.code));
    s.appendChild(g);
  });

  s.appendChild(svg('line', { x1: P2.x0 - 14, y1: P2.bottom + 4, x2: P2.x1 + 14, y2: P2.bottom + 4, stroke: 'var(--border)', 'stroke-width': '1.2' }));

  return s;
}

function panelTitle(ic, text) {
  return el('div', { class: 'clx-sub__title', style: { marginTop: 'var(--sp-2, 10px)' } }, icon(ic, 14), ' ', text);
}

function legendChip(color, label) {
  return el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } },
    el('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 } }),
    label);
}

export function wechslerProfileChart(view) {
  const data = collectWechslerChartData(view);
  if (!data) return null;

  const panels = [];

  const idxSvg = panelIndicesSVG(data);
  if (idxSvg) {
    panels.push(el('div', {},
      panelTitle('activity', 'شاخص‌های شناختی — نمرهٔ استاندارد ۴۰ تا ۱۶۰'),
      idxSvg,
      el('div', { class: 'cell-sub', style: { fontSize: 'var(--fs-2xs)', marginTop: '2px' } }, /* کف ۱۲px */
        'باند روشن: باند میانگین ۸۵–۱۱۵ · خط عمودی خاکستری: میانگین ۱۰۰ · خط قرمز: مرز ۸۵')));
  }

  const subSvg = panelSubtestsSVG(data);
  if (subSvg) {
    const legend = el('div', { class: 'clx-chips', style: { marginTop: '6px', fontSize: 'var(--fs-2xs)', gap: '10px', flexWrap: 'wrap' } }, /* */
      ...SUBTEST_GROUPS.map((g) => legendChip(INDEX_COLOR[g.key], `${INDEX_FA[g.key]} (${g.key})`)));
    panels.push(el('div', {},
      panelTitle('checklist', 'پروفایل خرده‌آزمون‌ها — نمرهٔ مقیاس ۱ تا ۱۹'),
      subSvg,
      legend,
      el('div', { class: 'cell-sub', style: { fontSize: 'var(--fs-2xs)', marginTop: '2px' } }, /* کف ۱۲px */
        'باند روشن: باند میانگین ۷–۱۳ · نقطهٔ توخالی: خرده‌آزمون جانشین',
        data.personalSubMean !== null ? ' · خط‌چین قرمز: میانگین فرد خرده‌آزمون‌های همین دانش‌آموز' : '')));
  }

  if (!panels.length) return null;
  return el('div', { class: 'clx-wchart', style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3, 14px)', marginTop: '2px' } }, ...panels);
}
