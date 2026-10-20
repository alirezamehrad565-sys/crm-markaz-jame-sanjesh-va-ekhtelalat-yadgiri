/**
 * نیم‌رخ وکسلر ۴ — کارت کامل + بخش تحلیل مودال رویداد
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// wechsler-profile.js — نمایش کامل نیم‌رخ وکسلر (m133):
// منبع داده یکی از دو است: gates.wechslerSummary (گیت‌های شناسایی؛ خروجی wechslerSummaryOf بک‌اند)
// یا engine_output پارس‌شدهٔ رویداد وکسلر (مودال جزئیات).
// هر دو مسیر به یک view نرمال تبدیل و با یک رندر مشترک (renderProfile) نمایش داده می‌شوند.
// خط قرمز: تحلیل موتور صرفاً پشتیبان تصمیم بالینی است — تفسیر و تشخیص نهایی با روان‌سنج/متخصص.

import { el, icon } from './ui.js';
import { fa } from './format.js';

// ─────────────── نقشه‌های ثابت ───────────────

/** نام فارسی فرضیه‌های موتور وکسلر — همسان با WECHSLER_HYP_NAMES باندل */
const WECHSLER_HYP_NAMES = { DLD: 'اختلال زبانی (DLD)', BIF: 'عملکرد مرزی/دیرآموزی (BIF)', APD: 'اختلال پردازش شنیداری (APD)', MOOD: 'عامل خلقی/اضطرابی (MOOD)', ADHD: 'بیش‌فعالی/کم‌توجهی (ADHD)', ASD: 'اطیسم (ASD)', ID: 'ناتوانی هوشی (ID)', SLD: 'اختلال یادگیری خاص (SLD)', NVLD: 'یادگیری غیرکلامی (NVLD)', TBI: 'آسیب مغزی اکتسابی (TBI)', TWO_E: 'دواستثنایی (2e)', DOMAIN_WEAK: 'ضعف حوزه‌ای', NORMAL: 'نیم‌رخ عادی' };

/** نام فارسی حوزه‌های ضعیف موتور وکسلر — کلید ناشناخته → خود کلید */
const WEAKEST_FA = { language: 'زبان و بیان', knowledge: 'دانش و شناخت', working_memory: 'حافظهٔ فعال', attention: 'توجه و تمرکز', processing_speed: 'سرعت پردازش', visual_spatial: 'دیداری‌فضایی', fluid_reasoning: 'استدلال سیال', crystallized: 'دانش جابه‌جاشده', fine_motor: 'مهارت حرکتی ظریف', academic: 'مهارت‌های تحصیلی', executive: 'کارکردهای اجرایی', social: 'اجتماعی', adaptive: 'سازشی' };

/** وزن اعشاری دو-رقمی با جداکنندهٔ فارسی: 0.4 → «۰٫۴۰» */
function faWeight(w) {
  const n = Number(w);
  return fa(Number.isFinite(n) ? n.toFixed(2) : String(w ?? '')).replace('.', '٫');
}

/** سرتیتر کوچک بخش‌های داخل کارت — هم‌سبک clx-sub__title */
function subTitle(ic, text) {
  return el('div', { class: 'clx-sub__title', style: { marginTop: 'var(--sp-3, 12px)' } }, icon(ic, 14), ' ', text);
}

// ─────────────── رندر مشترک نیم‌رخ ───────────────

/**
 * رندر کامل نیم‌رخ از view نرمال‌شده:
 * {fsiq, vci, pri, wmi, psi, gai, indexScatter, percentile, cls, mainName, mainLevel,
 *  hypotheses, weakDomains, flagsFa, monitoringInterval, ageLine, engine}
 */
function renderProfile(view) {
  // سربرگ — چیپ منبع: موتور یا ثبت دستی
  const head = el('div', { class: 'card__head' },
    el('div', { class: 'card__title', style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
      icon('brain', 16),
      'نیم‌رخ وکسلر ۴ — تحلیل موتور',
      view.engine
        ? el('span', { class: 'badge badge--accent' }, 'موتور')
        : el('span', { class: 'badge badge--warning', title: 'ثبت دستی — برای تحلیل موتور، نمرهٔ خام را در فرم وکسلر ۴ ثبت کنید' }, 'ثبت دستی')
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
      el('div', { class: 'clx-disclaimer', style: { marginTop: 'var(--sp-3, 12px)' } },
        icon('shield', 14),
        el('span', {}, 'تحلیل موتور صرفاً پشتیبان تصمیم بالینی است؛ تفسیر و تشخیص نهایی با روان‌سنج/متخصص.'))
    )
  );
}

// ─────────────── export ۱ — کارت تب تفسیر بالینی (از گیت‌ها) ───────────────

/**
 * کارت کامل نیم‌رخ وکسلر برای تب تفسیر بالینی — از gates.wechslerSummary (گسترش‌یافتهٔ m133).
 * null خروجی یعنی «دادهٔ وکسلری معنادار نیست» → کارت حذف می‌شود.
 */
export function wechslerProfileBlock({ summary }) {
  if (!summary) return null;
  if (summary.fsiq == null && summary.percentile == null && !(summary.hypotheses ?? []).length) return null;
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
    engine: Boolean(summary.engine)
  });
}

// ─────────────── export ۲ — بخش مودال رویداد (از engine_output) ───────────────

/**
 * بخش تحلیل نیم‌رخ وکسلر برای مودال جزئیات رویداد — ورودی: engine_output پارس‌شده
 * (آبجکت JSON موتور وکسلر، نه رشته). snapshot + hypotheses + weakDomains + flags → همان view.
 */
export function wechslerEventAnalysisSection(engineOutput) {
  const c = engineOutput;
  if (!c || !c.ok) return null;
  const snap = c.snapshot ?? {};
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
    engine: true
  });
}
