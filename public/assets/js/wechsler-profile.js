/**
 * نیم‌رخ وکسلر ۴ — کارت کامل + بخش تحلیل مودال رویداد
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// wechsler-profile.js — نمایش کامل نیم‌رخ وکسلر (m133 + توسعهٔ m134 + مسیر تودرتوی m135):
// منبع داده یکی از دو است: gates.wechslerSummary (گیت‌های شناسایی؛ خروجی wechslerSummaryOf بک‌اند)
// یا engine_output پارس‌شدهٔ رویداد وکسلر (مودال جزئیات).
// هر دو مسیر به یک view نرمال تبدیل و با یک رندر مشترک (renderProfile) نمایش داده می‌شوند.
// توسعهٔ m134 — وقتی بک‌اند «profile» کامل فرستد (قرارداد ۳۹-۱)، بخش‌های زیر اضافه می‌شود:
//   نیم‌رخ شاخص‌ها (scaled/صدک/طبقه + قوی‌ترین/ضعیف‌ترین + گام ۵) · جدول ۱۵ خرده‌آزمون
//   مقایسه‌های دوبه‌دو · مقایسه‌های خوشه‌ای (جفت‌ها) · پیوند با سایر اطلاعات (connections).
// توسعهٔ m135 (بازسازی تب تفسیر بالینی) — renderProfile دو مسیر دارد:
//   • مسیر مودال (پیش‌فرض؛ flat) — رفتار قبلی بدون تغییر برای case-events.js.
//   • مسیر تودرتوی تب ({nested:true}) — شش <details class="clxacc clxacc--sub"> همیشه‌بسته
//     (§4: نیم‌رخ شاخص‌ها / گام ۵ / جدول خرده‌آزمون با سقف ۱۰ سطر / دوبه‌دو / خوشه‌ای / حوزه‌های ضعیف و پرچم‌های روایی)
//     + پانویس خط قرمز از STAGE2_META (تک‌منبع مشترک مسیر تب و مودال — CONTENT-SPEC یافتهٔ ۵).
// «پیوند با سایر اطلاعات» (connectionsSection) از بدنهٔ وکسلر خارج شد — خروجی آن سمت
// clinical-insights در مرحلهٔ ۵ (جمع‌بندی تشخیصی) رندر می‌شود (UX-SPEC §4).
// T8 (m149) — صحنهٔ فرضیه‌های موتور حذف شد؛ m156 — خوانش مستقل روان‌سنجی نیم‌رخ (psychometrics)
// جای آن را به‌عنوان نخستین بخش گرفت: فقط شواهد نیم‌رخ (FSIQ/شاخص‌ها/پراکندگی/گپ‌ها) — بدون فرضیه.
// هر دو مسیر به یک view نرمال تبدیل و با یک رندر مشترک (renderProfile) نمایش داده می‌شوند. همهٔ بخش‌ها «دفاعی» رندر می‌شوند:
// نبود داده = نبود بخش؛ بدون profile هم رندر چیپ‌محور دست‌نخورده کار می‌کند.

import { el, icon } from './ui.js';
import { fa } from './format.js';
import { GATE_GLOSS, STAGE2_META } from './clinical-content.js'; // — «ثبت دستی» + پانویس خط قرمز یک‌بار در کل کد (رفع تکرار ۳۹-C + یافتهٔ ۵ CONTENT-SPEC)

// ─────────────── نقشه‌های ثابت ───────────────

/** نام فارسی حوزه‌های ضعیف موتور وکسلر — کلید ناشناخته → خود کلید */
export const WEAKEST_FA = { language: 'زبان و بیان', knowledge: 'دانش و شناخت', working_memory: 'حافظهٔ فعال', attention: 'توجه و تمرکز', processing_speed: 'سرعت پردازش', visual_spatial: 'دیداری‌فضایی', fluid_reasoning: 'استدلال سیال', crystallized: 'دانش جابه‌جاشده', fine_motor: 'مهارت حرکتی ظریف', academic: 'مهارت‌های تحصیلی', executive: 'کارکردهای اجرایی', social: 'اجتماعی', adaptive: 'سازشی' };

/** نام فارسی شاخص‌ها — همسان با INDEX_SPEC موتور؛ ورودی بک‌اند می‌تواند fa خودش را بفرستد */
const WISC_INDEX_FA = { VCI: 'درک کلامی', PRI: 'استدلال ادراکی', WMI: 'حافظهٔ فعال', PSI: 'سرعت پردازش', FSIQ: 'مقیاس کامل' };

/** نام فارسی ۱۵ خرده‌آزمون — همسان با SUBTESTS موتور (برای مسیر مودال که fa ندارد) */
const WISC_SUBTEST_FA = {
  BD: 'طراحی مکعب‌ها', SI: 'تشابهات', DS: 'فراخنای ارقام', PCn: 'مفاهیم تصویری', CD: 'رمزگذاری',
  VC: 'واژگان', LN: 'توالی حرف-عدد', MR: 'استدلال ماتریسی', CO: 'درک مطلب', SS: 'جستجوی نماد',
  PCm: 'تکمیل تصاویر', CA: 'خط‌زنی', IN: 'اطلاعات', AR: 'حساب', WR: 'استدلال کلمه'
};

/** عدد یک‌رقمی اعشار — «۹٫۴» */
function faFixed1(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return fa(v.toFixed(1)).replace('.', '٫');
}

/** سرتیتر کوچک بخش‌های داخل کارت — هم‌سبک clx-sub__title */
function subTitle(ic, text) {
  return el('div', { class: 'clx-sub__title', style: { marginTop: 'var(--sp-3, 12px)' } }, icon(ic, 14), ' ', text);
}

/** برچسب سطح روایی گام ۵ — قوت/ضعف/بدون برچسب */
const STEP5_BADGE = {
  'قوت': 'badge--success',
  'ضعف': 'badge--warning'
};

/** چیپ منبع تحلیل — موتور یا ثبت دستی (E10/E11 — تک‌منبع برای سربرگ تب و کارت مودال) */
export function wechslerSourceBadge(engine) {
  return engine
    ? el('span', { class: 'badge badge--accent' }, 'موتور')
    : el('span', { class: 'badge badge--warning', title: GATE_GLOSS.wechsler.manualNote }, 'ثبت دستی');
}

// ─────────────── بخش‌های نیم‌رخ کامل (دفاعی — فقط با داده) ───────────────

/** شمار سطرهای معتبر شاخص‌ها — برای بج شمارندهٔ آکاردئون تودرتوی ۳.۱ (m135 §4) */
function indexRowCount(profile) {
  return (profile?.indices ?? []).filter((ix) => ix && (ix.scaled != null || ix.percentile != null)).length;
}

/** «نیم‌رخ شاخص‌ها» — سطر هر شاخص: scaled + صدک + طبقه؛ قوی‌ترین/ضعیف‌ترین هایلایت؛ GAI + میانگین‌های فرد (بدون گام ۵ — جداسازی m135 §4) */
export function indexRowsSection(profile) {
  const rows = (profile.indices ?? []).filter((ix) => ix && (ix.scaled != null || ix.percentile != null));
  if (!rows.length) return null;
  const faOf = (ix) => ix.fa ?? WISC_INDEX_FA[ix.key] ?? ix.key;

  const items = rows.map((ix) => {
    const isWeak = ix.key !== 'FSIQ' && profile.weakestIndex != null && ix.key === profile.weakestIndex;
    const isStrong = ix.key !== 'FSIQ' && profile.strongestIndex != null && ix.key === profile.strongestIndex;
    const spread = profile.spreads?.[ix.key];
    return el('div', { class: `clx-widx__row${isWeak ? ' is-weak' : ''}${isStrong ? ' is-strong' : ''}` },
      el('strong', { class: 'clx-widx__name' }, faOf(ix)),
      el('span', { class: 'clx-widx__key' }, ix.key ?? ''),
      ix.scaled != null ? el('span', { class: 'clx-widx__scaled' }, `نمرهٔ مقیاس ${fa(ix.scaled)}`) : null,
      ix.percentile != null ? el('span', { class: 'badge badge--neutral' }, `صدک ${fa(ix.percentile)}`) : null,
      ix.cls ? el('span', { class: 'badge badge--info' }, ix.cls) : null,
      spread != null && spread > 0 ? el('span', { class: 'cell-sub', title: 'پراکندگی درون‌شاخص (≥۵ ناهمگن)' }, `پراکندگی ${fa(spread)}`) : null,
      isWeak ? el('span', { class: 'badge badge--warning' }, 'ضعیف‌ترین شاخص') : null,
      isStrong ? el('span', { class: 'badge badge--success' }, 'قوی‌ترین شاخص') : null
    );
  });

  // GAI با جزئیات (نمره + صدک + بازهٔ اطمینان) — فقط وقتی gaiMeta هست
  const gaiRow = profile.gaiMeta && profile.gaiMeta.scaled != null
    ? el('div', { class: 'clx-widx__row' },
        el('strong', { class: 'clx-widx__name' }, 'هوشبهر عملی بدون سرعت'),
        el('span', { class: 'clx-widx__key' }, 'GAI'),
        el('span', { class: 'clx-widx__scaled' }, `نمرهٔ مقیاس ${fa(profile.gaiMeta.scaled)}`),
        profile.gaiMeta.percentile != null ? el('span', { class: 'badge badge--neutral' }, `صدک ${fa(profile.gaiMeta.percentile)}`) : null,
        profile.gaiMeta.ci95 ? el('span', { class: 'badge badge--neutral' }, `بازهٔ اطمینان ۹۵٪: ${profile.gaiMeta.ci95}`) : null)
    : null;

  // خط میانگین‌های فرد — بستر تفسیر گام ۵
  const metaBits = [];
  if (profile.personalIndexMean != null && profile.personalIndexMean > 0) metaBits.push(`میانگین شاخص‌های فرد: ${faFixed1(profile.personalIndexMean)}`);
  if (profile.personalSubMean != null && profile.personalSubMean > 0) metaBits.push(`میانگین خرده‌آزمون‌ها: ${faFixed1(profile.personalSubMean)}`);
  if (profile.outOfBandSubs != null && profile.outOfBandSubs > 0) metaBits.push(`${fa(profile.outOfBandSubs)} خرده‌آزمون بیرون از باند فرد`);
  const metaLine = metaBits.length
    ? el('div', { class: 'clx-wconn__empty' }, metaBits.join(' — '))
    : null;

  return el('div', {},
    subTitle('activity', 'نیم‌رخ شاخص‌ها'),
    el('div', { class: 'clx-widx' }, ...items, gaiRow),
    metaLine
  );
}

/** «قوت و ضعف فردی — گام ۵» — فاصلهٔ هر شاخص از میانگین شخصی (جداسازی m135 §4 — آکاردئون ۳.۲) */
export function step5Section(profile) {
  const step5 = profile.step5 ?? [];
  if (!step5.length) return null;
  const step5Rows = step5.map((s) => {
    const key = s.key ?? '';
    return el('div', { class: 'clx-widx__row' },
      el('strong', { class: 'clx-widx__name' }, s.fa ?? WISC_INDEX_FA[key] ?? key),
      el('span', { class: 'clx-widx__key' }, key),
      s.scaled != null ? el('span', { class: 'clx-widx__scaled' }, `نمرهٔ مقیاس ${fa(s.scaled)}`) : null,
      s.diff != null ? el('span', { class: 'cell-sub' }, `فاصله از میانگین فرد: ${fa(s.diff)} (آستانهٔ ${fa(s.cut ?? '—')})`) : null,
      s.strength ? el('span', { class: `badge ${STEP5_BADGE[s.strength] ?? 'badge--neutral'}` }, s.strength) : null,
      s.valid ? el('span', { class: 'badge badge--info' }, 'معنادار') : el('span', { class: 'badge badge--neutral', title: 'به آستانهٔ معناداری نرسید — فقط روایت است' }, 'غیرمعنادار'),
      s.unusual ? el('span', { class: 'badge badge--danger', title: 'فراوانی این فاصله در جامعه کمتر از حد انتظار است' }, 'غیرمعمول') : null
    );
  });

  return el('div', {},
    subTitle('sparkles', 'قوت و ضعف فردی — گام ۵ (نسبت به میانگین خود دانش‌آموز)'),
    el('div', { class: 'clx-widx' }, ...step5Rows));
}

/** «جدول خرده‌آزمون‌ها» — ۱۵ سطر: نام | نمرهٔ مقیاس | قوت/ضعف | نقش (هسته/جانشین) */
function subtestTableSection(profile) {
  const subs = profile.subtests ?? [];
  if (!subs.length) return null;
  const faOfSub = (s) => s.fa ?? WISC_SUBTEST_FA[s.code] ?? s.code;
  const strongCodes = new Set((profile.subStrong ?? []).map((s) => s.code));
  const weakCodes = new Set((profile.subWeak ?? []).map((s) => s.code));

  const rows = subs.map((s) => {
    const isStrong = strongCodes.has(s.code);
    const isWeak = weakCodes.has(s.code);
    return el('tr', { class: `${isStrong ? 'is-strong' : ''}${isWeak ? ' is-weak' : ''}` },
      el('td', {}, faOfSub(s)),
      el('td', {}, s.scaled != null ? el('b', {}, fa(s.scaled)) : el('span', { class: 'cell-sub' }, 'اجرا نشده')),
      el('td', {},
        isStrong ? el('span', { class: 'badge badge--success' }, 'قوت') : null,
        isWeak ? el('span', { class: 'badge badge--warning' }, 'ضعف') : null,
        (!isStrong && !isWeak) ? el('span', { class: 'cell-sub' }, '—') : null),
      el('td', {},
        s.core === true ? el('span', { class: 'badge badge--neutral' }, 'هسته') : null,
        s.core === false ? el('span', { class: 'badge badge--info', title: 'جانشینِ خرده‌آزمون اصلی — تفسیر با احتیاط' }, 'جانشین') : null,
        s.core == null ? el('span', { class: 'cell-sub' }, '—') : null)
    );
  });

  return el('div', {},
    subTitle('checklist', 'جدول خرده‌آزمون‌ها — نمرهٔ مقیاس ۱ تا ۱۹'),
    el('div', { class: 'table-wrap' },
      el('table', { class: 'table clx-wsub__table' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'خرده‌آزمون'),
          el('th', { style: { width: '90px' } }, 'نمرهٔ مقیاس'),
          el('th', { style: { width: '90px' } }, 'برچسب'),
          el('th', { style: { width: '90px' } }, 'نقش'))),
        el('tbody', {}, ...rows))));
}

/** همان جدول با سقف ۱۰ سطر + «{n} سطر دیگر…» (m135 §4 — فقط مسیر تودرتوی تب) */
function subtestTableCapped(profile) {
  const node = subtestTableSection(profile);
  if (!node) return null;
  const subs = profile.subtests ?? [];
  if (subs.length <= 10) return node;
  const table = node.querySelector('table');
  if (table) table.classList.add('clxacc-table', 'is-truncated');
  node.dataset.clxmore = '1';
  node.appendChild(el('button', { class: 'clxacc__more btn btn--ghost btn--sm', type: 'button' },
    STAGE2_META.showMoreRows.replace('{n}', fa(subs.length - 10))));
  return node;
}

/** «مقایسه‌های دوبه‌دو خرده‌آزمون‌ها» — اجراشده‌ها نمایان؛ side:'na' پشت تاشو */
function comparisonsSection(profile) {
  const comps = profile.comparisons ?? [];
  if (!comps.length) return null;
  const done = comps.filter((c) => c && c.side !== 'na');
  const skipped = comps.filter((c) => c && c.side === 'na');
  if (!done.length && !skipped.length) return null;

  const VERDICT_CLS = { a: 'badge--accent', b: 'badge--info', balance: 'badge--neutral' };
  const compRow = (c) => el('div', { class: 'clx-wcmp__row' },
    el('div', { class: 'clx-wcmp__head' },
      el('strong', {}, c.title ?? c.id ?? 'مقایسه'),
      c.verdict ? el('span', { class: `badge ${VERDICT_CLS[c.side] ?? 'badge--info'}` }, c.verdict) : null,
      c.focus ? el('span', { class: 'cell-sub' }, c.focus) : null),
    c.note ? el('div', { class: 'clx-wcmp__note' }, c.note) : null);

  return el('div', {},
    subTitle('filter', 'مقایسه‌های دوبه‌دو خرده‌آزمون‌ها'),
    done.length ? el('div', { class: 'clx-wcmp' }, ...done.map(compRow)) : null,
    skipped.length
      ? el('details', { class: 'clx-wcmp__skipped' },
          el('summary', {}, `مقایسه‌های اجرا نشده (${fa(skipped.length)}) — یکی از دو طرف اجرا نشده است`),
          el('div', { class: 'clx-wcmp' }, ...skipped.map(compRow)))
      : null);
}

/** «مقایسه‌های خوشه‌ای» (جفت‌ها) — برنده + فاصله؛ تفسیر و پیشنهاد تاشو */
function pairsSection(profile) {
  const pairs = profile.pairs ?? [];
  if (!pairs.length) return null;
  const items = pairs.map((p) =>
    el('div', { class: 'clx-wpair' },
      el('div', { class: 'clx-wpair__head' },
        el('strong', {}, p.label ?? ''),
        p.winner ? el('span', { class: 'badge badge--info' }, `${p.winner} قوی‌تر`) : null,
        p.diff != null ? el('span', { class: 'badge badge--neutral' }, `فاصله: ${fa(p.diff)}`) : null),
      (p.text || p.advice)
        ? el('details', { class: 'clx-wpair__more' },
            el('summary', {}, 'تفسیر و پیشنهاد'),
            p.text ? el('div', { class: 'clx-wpair__text' }, p.text) : null,
            p.advice ? el('div', { class: 'clx-wpair__advice' }, icon('compass', 12), ' ', p.advice) : null)
        : null));
  return el('div', {},
    subTitle('layers', 'مقایسه‌های خوشه‌ای — تحلیل تفاضلی'),
    el('div', { class: 'clx-wpairs' }, ...items));
}

/** «پیوند با سایر اطلاعات» — خطوط ساخته‌شده در clinical-insights (فرمولاسیون + فرضیه‌ها) */
export function connectionsSection(connections) {
  const list = Array.isArray(connections) ? connections.filter(Boolean) : [];
  return el('div', {},
    subTitle('link', 'پیوند با سایر اطلاعات'),
    list.length
      ? el('ul', { class: 'clx-wconn' }, list.map((t) => el('li', {}, icon('link', 13), el('span', {}, t))))
      : el('div', { class: 'clx-wconn__empty' }, 'هنوز دادهٔ کافی برای پیوند نیم‌رخ با سایر ابزارها وجود ندارد.'));
}

// ─────────────── بلوک‌های مشترک هر دو مسیر رندر ───────────────

/** ردیف چیپ‌های خلاصه — FSIQ/شاخص‌ها/پراکندگی/سن/بازهٔ پایش */
function chipsRow(view) {
  const chips = [];
  if (view.fsiq != null) {
    const p = view.percentile != null ? ` (صدک ${fa(view.percentile)})` : '';
    const c = view.cls ? ` — ${view.cls}` : '';
    chips.push(el('span', { class: 'badge badge--accent' }, `FSIQ ${fa(view.fsiq)}${p}${c}`));
  }
  const idxChip = (label, v) => v == null ? null : el('span', { class: 'badge badge--neutral' }, `${label} ${fa(v)}`);
  chips.push(
    idxChip('VCI', view.vci),
    idxChip('PRI', view.pri),
    idxChip('WMI', view.wmi),
    idxChip('PSI', view.psi),
    idxChip('GAI', view.gai)
  );
  // K2 (CONTENT-SPEC): پراکندگی ماکس−مین ربطی به گیت GAI ندارد (موتور GAI را روی فاصلهٔ VCI−PRI می‌بندد)
  if (view.indexScatter != null && view.indexScatter > 0) {
    chips.push(el('span', { class: 'badge badge--warning', title: 'ماکس − مین شاخص‌ها؛ پراکندگی ≥۲۳ یعنی نیم‌رخ ناهمگن' }, `پراکندگی ${fa(view.indexScatter)}`));
  }
  if (view.ageLine) chips.push(el('span', { class: 'badge badge--neutral' }, `سن آزمون: ${view.ageLine}`));
  if (view.monitoringInterval != null) chips.push(el('span', { class: 'badge badge--neutral' }, `بازهٔ پایش: ${fa(view.monitoringInterval)} ماه`));
  return chips.length ? el('div', { class: 'clx-chips' }, ...chips) : null;
}

/** «خوانش روان‌سنجی نیم‌رخ» — m156: خوانش مستقل نیم‌رخ هوشی؛ فقط شواهد (بدون فرضیه/سناریو/وزن).
 * ورودی: view.psychometrics — از gates.wechslerSummary یا engine_output رویداد.
 */
function psychometricsSection(view) {
  const ps = view.psychometrics ?? null;
  if (!ps) return null;
  const blocks = [];
  if (ps.summaryFa) blocks.push(el('div', { style: { lineHeight: 1.9, fontSize: '13px' } }, ps.summaryFa));
  if ((ps.gaps ?? []).length) {
    blocks.push(el('div', { class: 'clx-chips', style: { marginTop: '6px' } },
      ...ps.gaps.map((g) => el('span', { class: 'badge badge--warning', title: g.textFa }, `${g.fa}: فاصلهٔ ${fa(g.diff)} نمره`))));
  }
  if ((ps.patterns ?? []).length) {
    blocks.push(el('div', { style: { marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' } },
      ...ps.patterns.map((p) => el('div', { style: { fontSize: '12px', color: 'var(--ink-2, #555)' } }, icon('sparkles', 12), ' ', p.textFa))));
  }
  if (!blocks.length) return null;
  return el('div', {}, subTitle('brain', 'خوانش روان‌سنجی نیم‌رخ'), ...blocks);
}

/** بلوک حوزه‌های ضعیف */
function weakBlock(view) {
  const weakChips = (view.weakDomains ?? []).map((d) =>
    el('span', { class: 'badge badge--warning' }, WEAKEST_FA[d] ?? d)
  );
  if (!weakChips.length) return null;
  return el('div', {},
    subTitle('activity', 'حوزه‌های ضعیف'),
    el('div', { class: 'clx-chips' }, ...weakChips));
}

/** بلوک پرچم‌های روایی */
function flagsBlock(view) {
  const flags = (view.flagsFa ?? []).map((f) =>
    el('div', { style: { display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--warn, #a06a00)', lineHeight: 1.8 } },
      icon('alert', 12),
      el('span', {}, f)
    )
  );
  if (!flags.length) return null;
  return el('div', {},
    subTitle('alert', 'پرچم‌های روایی (با احتیاط بخوانید)'),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' } }, ...flags));
}

// ─────────────── مسیر تودرتوی تب (m135 §4 — شش آکاردئون همیشه‌بسته) ───────────────

/** بج شمارندهٔ سربرگ‌های تودرتو — صفر یا نبود داده = بدون بج (R3: هرگز «۱۰ مقایسه» قطعی نمی‌گوییم) */
function subCount(tpl, n) {
  return n > 0 && tpl ? tpl.replace('{n}', fa(n)) : null;
}

/**
 * آکاردئون تودرتوی وکسلر — همان آناتومی clxaccSection تب ولی بدون وضعیت/CTA/«در یک نگاه».
 * نسخهٔ محلی برای پرهیز از چرخهٔ import با clinical-insights (این ماژول زیرِ آن است).
 */
function subAcc({ key, label, count, body }) {
  const nodes = (Array.isArray(body) ? body : [body]).filter(Boolean);
  if (!nodes.length) return null;
  return el('details', { class: 'clxacc clxacc--sub', id: `clxacc-w-${key}`, dataset: { clxacc: `w-${key}`, clxaccLevel: 'sub' } },
    el('summary', { class: 'clxacc__head', 'aria-expanded': 'false' },
      el('span', { class: 'clxacc__heading' },
        el('strong', { class: 'clxacc__title' }, label)),
      count ? el('span', { class: 'clxacc__count' }, count) : null,
      el('span', { class: 'clxacc__chev', 'aria-hidden': 'true' }, icon('chevL', 14))),
    el('div', { class: 'clxacc__body' }, ...nodes));
}

/**
 * بدنهٔ تودرتوی مرحلهٔ ۳ تب — چیپ‌ها + شش <details class="clxacc clxacc--sub"> (همه بسته) + پانویس خط قرمز.
 * «زمینهٔ تفسیر» (interpretationContext) سمت clinical-insights بالای همین نود می‌نشیند (§3.3 body order).
 * ثبت دستی (engine:false بدون profile) → آکاردئون‌های عددی ۳.۱–۳.۵ حذف؛ فقط ۳.۶ حوزه‌های ضعیف/پرچم‌ها (R2).
 * T8 (m149) — آکاردئون ۳.۶ دیگر فرضیه‌های موتور ندارد؛ فقط حوزه‌های ضعیف + پرچم‌های روایی.
 */
function nestedProfileBody(view) {
  const p = view.profile ?? null;
  const S = STAGE2_META.sub;

  const subs = [];
  // m156 — خوانش روان‌سنجی نیم‌رخ: نخستین آکاردئون؛ حتی برای رویدادهای قدیمیِ بدون profile
  const psych = psychometricsSection(view);
  if (psych) subs.push(subAcc({ key: 'psych', label: 'خوانش روان‌سنجی نیم‌رخ', count: null, body: psych }));
  if (p) {
    const idxCount = indexRowCount(p);
    const idx = idxCount ? indexRowsSection(p) : null;
    if (idx) subs.push(subAcc({ key: 'profile', label: S.profile.label, count: subCount(S.profile.count, idxCount), body: idx }));

    const s5 = step5Section(p);
    if (s5) subs.push(subAcc({ key: 'step5', label: S.step5.label, count: subCount(S.step5.count, (p.step5 ?? []).length), body: s5 }));

    const st = subtestTableCapped(p);
    if (st) subs.push(subAcc({ key: 'subtests', label: S.subtests.label, count: subCount(S.subtests.count, (p.subtests ?? []).length), body: st }));

    const comps = comparisonsSection(p);
    if (comps) {
      const doneCount = (p.comparisons ?? []).filter((c) => c && c.side !== 'na').length;
      subs.push(subAcc({ key: 'comparisons', label: S.comparisons.label, count: subCount(S.comparisons.count, doneCount), body: comps }));
    }

    const prs = pairsSection(p);
    if (prs) subs.push(subAcc({ key: 'pairs', label: S.pairs.label, count: subCount(S.pairs.count, (p.pairs ?? []).length), body: prs }));
  }

  // ۳.۶ — حوزه‌های ضعیف + پرچم‌های روایی (با هر داده‌ای که هست) — T8/m149: فرضیه‌های موتور حذف شدند
  const weakBlk = weakBlock(view);
  const flagsBlk = flagsBlock(view);
  if (weakBlk || flagsBlk) {
    const metaCount = (view.weakDomains ?? []).length + (view.flagsFa ?? []).length;
    subs.push(subAcc({ key: 'weakflags', label: S.weakflags.label, count: subCount(S.weakflags.count, metaCount), body: [weakBlk, flagsBlk] }));
  }

  const chips = chipsRow(view);
  return el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3, 14px)' } },
    chips,
    ...subs);
}

// ─────────────── رندر مشترک نیم‌رخ ───────────────

/**
 * رندر کامل نیم‌رخ از view نرمال‌شده:
 * {fsiq, vci, pri, wmi, psi, gai, indexScatter, percentile, cls,
 *  weakDomains, flagsFa, monitoringInterval, ageLine, engine, profile}
 * T8 (m149) — mainName/mainLevel/hypotheses از view حذف شدند (صحنهٔ فرضیه‌ها برداشته شد).
 *
 * دو مسیر (m135):
 *  • پیش‌فرض flat — کارت کامل مودال (case-events.js)؛ رفتار m134 بدون تغییر.
 *  • {nested:true} — بدنهٔ تودرتوی تب (شش آکاردئون بسته؛ بدون سربرگ کارت).
 * «پیوند با سایر اطلاعات» از هر دو مسیر خارج شد — رندر آن در مرحلهٔ ۵ تب (clinical-insights).
 */
function renderProfile(view, { nested = false } = {}) {
  if (nested) return nestedProfileBody(view);

  // مسیر مودال (flat) — سربرگ کارت + چیپ منبع: موتور یا ثبت دستی
  const head = el('div', { class: 'card__head' },
    el('div', { class: 'card__title', style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
      icon('brain', 16),
      'نیم‌رخ وکسلر ۴ — تحلیل موتور',
      wechslerSourceBadge(view.engine)
    )
  );

  // بخش‌های نیم‌رخ کامل (m134) — هر کدام فقط با دادهٔ موجود
  const p = view.profile ?? null;

  return el('div', { class: 'card', style: { marginBottom: 'var(--sp-3, 14px)' } },
    head,
    el('div', { class: 'card__body' },
      chipsRow(view),
      psychometricsSection(view),
      p ? indexRowsSection(p) : null,
      p ? step5Section(p) : null,
      p ? subtestTableSection(p) : null,
      p ? comparisonsSection(p) : null,
      p ? pairsSection(p) : null,
      weakBlock(view),
      flagsBlock(view)
    )
  );
}

// ─────────────── export ۱ — بدنهٔ تب تفسیر بالینی (از گیت‌ها) ───────────────

/**
 * نیم‌رخ وکسلر برای تب تفسیر بالینی — از gates.wechslerSummary.
 * summary.profile (قرارداد ۳۹-۱) اختیاری است: نبودش = رندر چیپ‌محور (T8/m149: بدون صحنهٔ فرضیه‌ها).
 * nested:true → مسیر تودرتوی تب (m135 §4)؛ پیش‌فرض flat برای سازگاری.
 * null خروجی یعنی «دادهٔ وکسلری معنادار نیست» → تب بدنهٔ حالت خالی می‌سازد.
 */
export function wechslerProfileBlock({ summary, nested = false }) {
  if (!summary) return null;
  if (summary.fsiq == null && summary.percentile == null && !summary.profile) return null;
  return renderProfile({
    fsiq: summary.fsiq ?? null,
    vci: summary.vci ?? null,
    pri: summary.pri ?? null,
    wmi: summary.wmi ?? null,
    psi: summary.psi ?? null,
    gai: summary.gai ?? null,
    indexScatter: summary.indexScatter ?? null,
    percentile: summary.percentile ?? null,
    cls: summary.cls ?? null,
    weakDomains: summary.weakDomains ?? [],
    flagsFa: summary.flagsFa ?? [],
    monitoringInterval: summary.monitoringInterval ?? null,
    ageLine: summary.ageLine ?? null,
    engine: Boolean(summary.engine),
    profile: summary.profile ?? null,
    psychometrics: summary.psychometrics ?? null
  }, { nested });
}

// ─────────────── export ۲ — بخش مودال رویداد (از engine_output) ───────────────

/**
 * بخش تحلیل نیم‌رخ وکسلر برای مودال جزئیات رویداد — ورودی: engine_output پارس‌شده.
 * snapshot موتور → همان view؛ بخش‌های نیم‌رخ کامل از snapshot ساخته می‌شوند
 * (snapshot پارس‌شدهٔ ذخیره‌شده: indices/subtests/s5rows/pairs/subStrong/subWeak/...).
 * مقایسه‌های دوبه‌دو در engine_output ذخیره نمی‌شوند (compact) → بخش دوبه‌دو در مودال نمی‌آید.
 */
export function wechslerEventAnalysisSection(engineOutput) {
  const c = engineOutput;
  if (!c || !c.ok) return null;
  const snap = c.snapshot ?? {};

  // snapshot.indices: {VCI:{scaled,percentile,ci,cls}, ...} → قرارداد profile.indices
  const indices = ['VCI', 'PRI', 'WMI', 'PSI', 'FSIQ']
    .map((k) => {
      const ix = snap.indices?.[k];
      if (!ix || (ix.scaled == null && ix.percentile == null)) return null;
      return { key: k, fa: WISC_INDEX_FA[k], scaled: ix.scaled ?? null, percentile: ix.percentile ?? null, cls: ix.cls || null };
    })
    .filter(Boolean);

  const profile = indices.length || (snap.subtests ?? []).length
    ? {
        indices,
        gaiMeta: snap.gaiMeta ?? null,
        spreads: snap.spreads ?? {},
        weakestIndex: snap.weakestIndex ?? null,
        strongestIndex: snap.strongestIndex ?? null,
        personalIndexMean: snap.personalIndexMean ?? null,
        personalSubMean: snap.personalSubMean ?? null,
        outOfBandSubs: snap.outOfBandSubs ?? null,
        subtests: (snap.subtests ?? []).map((s) => ({
          code: s.code, fa: WISC_SUBTEST_FA[s.code] ?? s.code, scaled: s.scaled ?? null, core: null
        })),
        subStrong: (snap.subStrong ?? []).map((s) => ({ ...s, fa: s.fa ?? WISC_SUBTEST_FA[s.code] ?? s.code })),
        subWeak: (snap.subWeak ?? []).map((s) => ({ ...s, fa: s.fa ?? WISC_SUBTEST_FA[s.code] ?? s.code })),
        step5: snap.s5rows ?? [],
        pairs: snap.pairs ?? [],
        comparisons: null
      }
    : null;

  return renderProfile({
    fsiq: snap.fsiq ?? null,
    vci: snap.indices?.VCI?.scaled ?? null,
    pri: snap.indices?.PRI?.scaled ?? null,
    wmi: snap.indices?.WMI?.scaled ?? null,
    psi: snap.indices?.PSI?.scaled ?? null,
    gai: snap.gai ?? null,
    indexScatter: snap.indexScatter ?? null,
    percentile: typeof snap.indices?.FSIQ?.percentile === 'number' ? snap.indices.FSIQ.percentile : null,
    cls: snap.indices?.FSIQ?.cls ?? null,
    weakDomains: c.weakDomains ?? [],
    flagsFa: (c.flags ?? []).map((f) => f.fa),
    monitoringInterval: c.monitoringInterval ?? null,
    ageLine: c.ageLine ?? null,
    engine: true,
    profile,
    psychometrics: c.psychometrics ?? null
  });
}
