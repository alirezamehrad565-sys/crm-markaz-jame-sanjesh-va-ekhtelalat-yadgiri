/**
 * نیم‌رخ وکسلر ۴ — کارت کامل + بخش تحلیل مودال رویداد
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// wechsler-profile.js — نمایش کامل نیم‌رخ وکسلر (m133 + توسعهٔ m134):
// منبع داده یکی از دو است: gates.wechslerSummary (گیت‌های شناسایی؛ خروجی wechslerSummaryOf بک‌اند)
// یا engine_output پارس‌شدهٔ رویداد وکسلر (مودال جزئیات).
// هر دو مسیر به یک view نرمال تبدیل و با یک رندر مشترک (renderProfile) نمایش داده می‌شوند.
// توسعهٔ m134 — وقتی بک‌اند «profile» کامل فرستد (قرارداد ۳۹-۱)، بخش‌های زیر اضافه می‌شود:
//   نیم‌رخ شاخص‌ها (scaled/صدک/طبقه + قوی‌ترین/ضعیف‌ترین + گام ۵) · جدول ۱۵ خرده‌آزمون
//   مقایسه‌های دوبه‌دو · مقایسه‌های خوشه‌ای (جفت‌ها) · پیوند با سایر اطلاعات (connections).
// همهٔ بخش‌های تازه «دفاعی» رندر می‌شوند: نبود داده = نبود بخش؛ بدون profile هم
// رندر قدیمی (چیپ شاخص‌ها + فرضیه‌ها) دست‌نخورده کار می‌کند.
// خط قرمز: تحلیل موتور صرفاً پشتیبان تصمیم بالینی است — تفسیر و تشخیص نهایی با روان‌سنج/متخصص.

import { el, icon } from './ui.js';
import { fa } from './format.js';
import { GATE_GLOSS } from './clinical-content.js'; // — متن «ثبت دستی» یک‌بار در کل کد (رفع تکرار ۳۹-C)

// ─────────────── نقشه‌های ثابت ───────────────

/** نام فارسی فرضیه‌های موتور وکسلر — همسان با WECHSLER_HYP_NAMES باندل */
const WECHSLER_HYP_NAMES = { DLD: 'اختلال زبانی (DLD)', BIF: 'عملکرد مرزی/دیرآموزی (BIF)', APD: 'اختلال پردازش شنیداری (APD)', MOOD: 'عامل خلقی/اضطرابی (MOOD)', ADHD: 'بیش‌فعالی/کم‌توجهی (ADHD)', ASD: 'اطیسم (ASD)', ID: 'ناتوانی هوشی (ID)', SLD: 'اختلال یادگیری خاص (SLD)', NVLD: 'یادگیری غیرکلامی (NVLD)', TBI: 'آسیب مغزی اکتسابی (TBI)', TWO_E: 'دواستثنایی (2e)', DOMAIN_WEAK: 'ضعف حوزه‌ای', NORMAL: 'نیم‌رخ عادی' };

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

/** وزن اعشاری دو-رقمی با جداکنندهٔ فارسی: 0.4 → «۰٫۴۰» */
function faWeight(w) {
  const n = Number(w);
  return fa(Number.isFinite(n) ? n.toFixed(2) : String(w ?? '')).replace('.', '٫');
}

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

// ─────────────── بخش‌های نیم‌رخ کامل (دفاعی — فقط با داده) ───────────────

/** «نیم‌رخ شاخص‌ها» — سطر هر شاخص: scaled + صدک + طبقه؛ قوی‌ترین/ضعیف‌ترین هایلایت؛ سپس گام ۵ */
function indexProfileSection(profile) {
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

  // گام ۵ — قوت/ضعف فردی نسبت به میانگین شخصی (فقط معتبرها برجسته می‌شوند)
  const step5 = profile.step5 ?? [];
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
    subTitle('activity', 'نیم‌رخ شاخص‌ها'),
    el('div', { class: 'clx-widx' }, ...items, gaiRow),
    metaLine,
    step5Rows.length
      ? el('div', {},
          subTitle('sparkles', 'قوت و ضعف فردی — گام ۵ (نسبت به میانگین خود دانش‌آموز)'),
          el('div', { class: 'clx-widx' }, ...step5Rows))
      : null
  );
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
function connectionsSection(connections) {
  const list = Array.isArray(connections) ? connections.filter(Boolean) : [];
  return el('div', {},
    subTitle('link', 'پیوند با سایر اطلاعات'),
    list.length
      ? el('ul', { class: 'clx-wconn' }, list.map((t) => el('li', {}, icon('link', 13), el('span', {}, t))))
      : el('div', { class: 'clx-wconn__empty' }, 'هنوز دادهٔ کافی برای پیوند نیم‌رخ با سایر ابزارها وجود ندارد.'));
}

// ─────────────── رندر مشترک نیم‌رخ ───────────────

/**
 * رندر کامل نیم‌رخ از view نرمال‌شده:
 * {fsiq, vci, pri, wmi, psi, gai, indexScatter, percentile, cls, mainName, mainLevel,
 *  hypotheses, weakDomains, flagsFa, monitoringInterval, ageLine, engine,
 *  profile, connections}   ← دو فیلد تازهٔ m134 (دفاعی؛ هر دو اختیاری)
 */
function renderProfile(view) {
  // سربرگ — چیپ منبع: موتور یا ثبت دستی
  const head = el('div', { class: 'card__head' },
    el('div', { class: 'card__title', style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
      icon('brain', 16),
      'نیم‌رخ وکسلر ۴ — تحلیل موتور',
      view.engine
        ? el('span', { class: 'badge badge--accent' }, 'موتور')
        : el('span', { class: 'badge badge--warning', title: GATE_GLOSS.wechsler.manualNote }, 'ثبت دستی')
    )
  );

  // ردیف شاخص‌ها — FSIQ با صدک/طبقه + شاخص‌های اصلی + پراکندگی + فرضیهٔ اصلی + سن + بازهٔ پایش
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
  if (view.indexScatter != null && view.indexScatter > 0) {
    chips.push(el('span', { class: 'badge badge--warning', title: 'ماکس − مین شاخص‌ها (مبنای GAI: ≥۲۳)' }, `پراکندگی ${fa(view.indexScatter)}`));
  }
  if (view.mainName) {
    chips.push(el('span', { class: 'badge badge--info' }, `فرضیهٔ اصلی: ${view.mainName}${view.mainLevel ? ` — ${view.mainLevel}` : ''}`));
  }
  if (view.ageLine) chips.push(el('span', { class: 'badge badge--neutral' }, `سن آزمون: ${view.ageLine}`));
  if (view.monitoringInterval != null) chips.push(el('span', { class: 'badge badge--neutral' }, `بازهٔ پایش: ${fa(view.monitoringInterval)} ماه`));

  // بخش‌های نیم‌رخ کامل (m134) — هر کدام فقط با دادهٔ موجود
  const p = view.profile ?? null;

  // فرضیه‌های موتور — مرتب نزولی بر اساس وزن
  const hyps = [...(view.hypotheses ?? [])].sort((a, b) => (Number(b?.weight) || 0) - (Number(a?.weight) || 0));
  const hypRows = hyps.map((h) =>
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '6px 2px', borderTop: '1px solid var(--line, #eee)' } },
      el('span', { style: { fontWeight: 600 } }, h?.name ?? WECHSLER_HYP_NAMES[h?.id] ?? h?.id ?? ''),
      el('span', { class: `badge ${Number(h?.weight) >= 0.3 ? 'badge--accent' : 'badge--neutral'}` }, `وزن ${faWeight(h?.weight)}`)
    )
  );

  // حوزه‌های ضعیف
  const weakChips = (view.weakDomains ?? []).map((d) =>
    el('span', { class: 'badge badge--warning' }, WEAKEST_FA[d] ?? d)
  );

  // پرچم‌های روایی
  const flags = (view.flagsFa ?? []).map((f) =>
    el('div', { style: { display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--warn, #a06a00)', lineHeight: 1.8 } },
      icon('alert', 12),
      el('span', {}, f)
    )
  );

  return el('div', { class: 'card', style: { marginBottom: 'var(--sp-3, 14px)' } },
    head,
    el('div', { class: 'card__body' },
      chips.length ? el('div', { class: 'clx-chips' }, ...chips) : null,
      p ? indexProfileSection(p) : null,
      p ? subtestTableSection(p) : null,
      p ? comparisonsSection(p) : null,
      p ? pairsSection(p) : null,
      hyps.length
        ? el('div', {},
            subTitle('sparkles', 'فرضیه‌های موتور — به ترتیب وزن'),
            el('div', { style: { marginTop: '4px' } }, ...hypRows))
        : el('div', { class: 'cell-sub', style: { marginTop: 'var(--sp-2, 8px)' } }, 'فرضیهٔ غالب واحدی ثبت نشد — نیم‌رخ پراکنده است.'),
      weakChips.length
        ? el('div', {},
            subTitle('activity', 'حوزه‌های ضعیف'),
            el('div', { class: 'clx-chips' }, ...weakChips))
        : null,
      flags.length
        ? el('div', {},
            subTitle('alert', 'پرچم‌های روایی (با احتیاط بخوانید)'),
            el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' } }, ...flags))
        : null,
      connectionsSection(view.connections),
      // یادآوری خط قرمز — یک خط کوتاه؛ سلب مسئولیت کامل تب فقط یک‌بار در پانویس صفحه می‌آید
      el('div', { class: 'clx-wconn__empty' },
        'تحلیل موتور صرفاً پشتیبان تصمیم بالینی است؛ تفسیر و تشخیص نهایی با روان‌سنج/متخصص.')
    )
  );
}

// ─────────────── export ۱ — کارت تب تفسیر بالینی (از گیت‌ها) ───────────────

/**
 * کارت کامل نیم‌رخ وکسلر برای تب تفسیر بالینی — از gates.wechslerSummary.
 * summary.profile (قرارداد ۳۹-۱) اختیاری است: نبودش = رندر قبلی.
 * connections: آرایهٔ خطوط متنی «پیوند با سایر اطلاعات» — ساخته‌شده در clinical-insights.
 * null خروجی یعنی «دادهٔ وکسلری معنادار نیست» → کارت حذف می‌شود.
 */
export function wechslerProfileBlock({ summary, connections = null }) {
  if (!summary) return null;
  if (summary.fsiq == null && summary.percentile == null && !(summary.hypotheses ?? []).length && !summary.profile) return null;
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
    mainName: summary.mainName ?? null,
    mainLevel: summary.mainLevel ?? null,
    hypotheses: summary.hypotheses ?? [],
    weakDomains: summary.weakDomains ?? [],
    flagsFa: summary.flagsFa ?? [],
    monitoringInterval: summary.monitoringInterval ?? null,
    ageLine: summary.ageLine ?? null,
    engine: Boolean(summary.engine),
    profile: summary.profile ?? null,
    connections
  });
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
    mainName: c.main?.name ?? null,
    mainLevel: c.main?.level ?? null,
    hypotheses: (c.hypotheses ?? []).map((h) => ({ id: h.id, weight: h.weight, name: WECHSLER_HYP_NAMES[h.id] ?? h.id })),
    weakDomains: c.weakDomains ?? [],
    flagsFa: (c.flags ?? []).map((f) => f.fa),
    monitoringInterval: c.monitoringInterval ?? null,
    ageLine: c.ageLine ?? null,
    engine: true,
    profile,
    connections: null
  });
}
