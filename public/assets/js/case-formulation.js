/**
 * جمع‌بندی تشخیصی — تلفیق دو موتور در یک کارت
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// case-formulation.js — کارت «جمع‌بندی تشخیصی» (m134 — بازطراحی فلوی تفسیر بالینی)
// پیش‌تر چهار کارت جدا (سازه‌ها/الگوها/پیوند وکسلر/گام بعدی) + دو فهرست پرچم جدا داشتیم؛
// حالا خروجی موتور صورت‌بندی (GET /case-formulation) و موتور فرضیه‌ها (GET /clinical-insights)
// در «یک» کارت ادغام می‌شود و جزئیات عددی پشت تاشوی «جزئیات موتور تشخیصی» می‌رود.
// قرارداد: خروجی همیشه «الگو/شواهد» است — تشخیص رسمی فقط با متخصص؛ «هدف درمانی نهایی» فقط
// با تصمیم درمانگر (ثبت نیاز ویژه یا مسیر مداخله) — همان خط قرمز پلن §۱.
// نکتهٔ m134: narrative/otLink از payload بک‌اند حذف شده‌اند و این‌جا هم مصرف نمی‌شوند؛
// «چه دیدیم» از insights.narrative (رشته یا {saw}) به‌عنوان خط پیش‌روی کدر کارت می‌آید.

import { api } from './api.js';
import { el, icon } from './ui.js';
import { fa, formatJalaliFull, tehranTodayYmd } from './format.js';
import { openNeedsModal } from './ot-checklist.js'; // — ثبت نتیجهٔ نیاز ویژه (دروازهٔ فاز مداخله)
import { openFeedbackSheetModal } from './feedback-sheet.js'; // — T9/m152: برگهٔ بازخورد خانواده (ترکیب سمت مرورگر)
import { CONFIDENCE_BADGE, SYNTHESIS_META } from './clinical-content.js';

const LEVEL_BADGE = {
  'پایین': 'badge--neutral',
  'مرزی': 'badge--warning',
  'قابل‌توجه': 'badge--warning',
  'هم‌گرای-بالا': 'badge--danger'
};

const LEVEL_BAR = {
  'پایین': 0,
  'مرزی': 1,
  'قابل‌توجه': 2,
  'هم‌گرای-بالا': 3
};

const COHERENCE_BADGE = {
  'هم‌گرا': 'badge--success',
  'ناقص': 'badge--warning',
  'واگرا': 'badge--danger'
};

const PROTOCOL_FA = {
  learning: 'اختلال یادگیری',
  slow_learner: 'دیرآموز',
  mental_ot: 'کاردرمانی ذهنی',
  rehab: 'توانبخشی'
};

function levelBar(level) {
  const n = LEVEL_BAR[level] ?? 0;
  const segs = [];
  for (let i = 0; i < 3; i++) {
    segs.push(el('span', {
      style: {
        display: 'inline-block', width: '14px', height: '6px', borderRadius: '3px',
        background: i < n ? 'var(--brand, #7c5cff)' : 'var(--line, #e5e2f0)',
        marginInlineEnd: '2px'
      }
    }));
  }
  return el('span', { style: { display: 'inline-flex', alignItems: 'center', marginInlineStart: '6px' } }, segs);
}

/** حذف تکرار متنی — کلید: متن نرمال‌شده */
function dedupeTexts(items) {
  const seen = new Set();
  const out = [];
  for (const t of items) {
    const s = String(t ?? '').trim();
    if (!s) continue;
    const key = s.replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** سطر یک سازه — سطح + نوار + شواهد تاشو */
function constructRow(c) {
  const elevated = c.level !== 'پایین';
  const evList = (c.evidenceFa ?? []).map((e) =>
    el('li', { style: { margin: '3px 0', color: 'var(--ink-2, #555)' } },
      el('span', { class: 'badge badge--neutral', style: { fontSize: '10px', padding: '1px 6px', marginInlineEnd: '5px' } }, e.sourceType === 'parent' ? 'خانه' : e.sourceType === 'teacher' ? 'مدرسه' : e.sourceType === 'examiner' ? 'کلینیک' : 'عملکرد'),
      e.textFa
    ));
  return el('details', { class: 'clx-syn__construct', style: { borderTop: '1px solid var(--line, #eee)', padding: '7px 2px' } },
    el('summary', { style: { cursor: elevated ? 'pointer' : 'default', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
      el('span', { style: { fontWeight: elevated ? 700 : 400, minWidth: '190px' } }, c.titleFa),
      el('span', { class: `badge ${LEVEL_BADGE[c.level] ?? 'badge--neutral'}` }, c.level),
      levelBar(c.level),
      c.subtypeFa?.length ? el('span', { class: 'badge badge--info', style: { fontSize: '10px' } }, c.subtypeFa.join(' + ')) : null,
      c.sharedWith ? el('span', { class: 'badge badge--info', style: { fontSize: '10px', title: 'با یک توضیح تلفیقی گزارش شد (پارسیمونی)' } }, 'اشتراکی') : null,
      (c.conflictFa ?? []).length ? el('span', { class: 'badge badge--danger', style: { fontSize: '10px' } }, 'واگرایی') : null
    ),
    elevated
      ? el('ul', { style: { margin: '6px 0 2px', paddingInlineStart: '18px', fontSize: '12px' } },
          evList,
          (c.capsFa ?? []).map((t) => el('li', { style: { margin: '3px 0', color: 'var(--warn, #a06a00)' } }, icon('alert', 12), ' ', t)),
          (c.conflictFa ?? []).map((t) => el('li', { style: { margin: '3px 0', color: 'var(--danger, #b3261e)' } }, icon('alert', 12), ' ', t))
        )
      : null
  );
}

/** کارت الگو (هم‌بودی) — ردشده‌ها حذف */
function patternCard(p) {
  if (!p || p.status === 'ruled_out') return null;
  const cls = p.status === 'active' ? 'badge--success' : p.status === 'candidate' ? 'badge--warning' : 'badge--neutral';
  const label = p.status === 'active' ? 'فعال' : p.status === 'candidate' ? 'نامزد بررسی' : 'ردشده';
  return el('div', { style: { border: '1px solid var(--line, #eee)', borderRadius: '10px', padding: '10px 12px', marginBottom: '8px' } },
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' } },
      el('strong', {}, p.titleFa),
      el('span', { class: `badge ${cls}` }, label),
      el('span', { class: 'cell-sub' }, `شیوع تقریبی: ${p.baseRateFa}`)
    ),
    el('div', { style: { fontSize: '12px', color: 'var(--ink-2, #555)' } }, p.rationaleFa),
    p.status === 'active' && p.actionFa !== '—'
      ? el('div', { style: { fontSize: '12px', marginTop: '4px' } }, icon('compass', 12), ' ', p.actionFa)
      : null
  );
}

/** خط پیش‌روی کارت — «چه دیدیم» (documented choice: رشتهٔ narrative کامل یا narrative.saw) */
function narrativeLead(insights) {
  const n = insights?.narrative;
  if (!n) return null;
  const text = typeof n === 'string' ? n.trim() : (typeof n.saw === 'string' ? n.saw.trim() : '');
  if (!text) return null;
  return el('div', { class: 'clx-syn__lead' }, icon('message', 13), el('span', {}, text));
}

/** «توضیح اصلی» — صورت‌بندی + نزدیک‌ترین فرضیهٔ موتور در یک بلوک */
function primaryBlock({ f, insights }) {
  const primary = f?.primaryProfile ?? null;
  const top = (insights?.ranked ?? [])[0] ?? null;
  if (!primary && !top) return null;

  return el('div', {},
    el('div', { class: 'clx-syn__blocktitle' }, icon('target', 14), ' ', SYNTHESIS_META.primaryTitle),
    el('div', { class: 'cell-sub' }, SYNTHESIS_META.primaryHint),
    el('div', { class: 'clx-syn__primary' },
      primary
        ? el('div', {},
            el('div', { class: 'clx-syn__primarytitle' }, primary.titleFa),
            el('div', { class: 'clx-syn__rationale' }, primary.rationaleFa))
        : null,
      top
        ? el('div', { class: 'clx-syn__tophypo' },
            el('span', { class: 'cell-sub' }, `${SYNTHESIS_META.topHypothesis}:`),
            el('strong', {}, top.targetTitle),
            el('span', { class: `badge ${CONFIDENCE_BADGE[top.confidence] ?? 'badge--neutral'}` }, `اطمینان ${top.confidence}`))
        : null
    )
  );
}

/** «پرچم‌های ارجاع» — تلفیق redFlags صورت‌بندی + referralFlags موتور (حذف تکرار) */
function mergedFlagsBlock({ f, insights }) {
  const rich = (f?.redFlags ?? []).filter((r) => r && r.textFa);
  const plain = dedupeTexts([
    ...rich.map((r) => r.textFa),
    ...(insights?.referralFlags ?? [])
  ]).filter((t) => !rich.some((r) => r.textFa.replace(/\s+/g, ' ') === t.replace(/\s+/g, ' ')));

  if (!rich.length && !plain.length) return null;
  return el('div', {},
    el('div', { class: 'clx-syn__blocktitle' }, icon('alert', 14), ' ', SYNTHESIS_META.flagsTitle),
    el('div', { class: 'clx-flags' },
      ...rich.map((r) => el('div', { class: `clx-flag ${r.urgent ? 'clx-flag--urgent' : ''}` },
        icon('alert', 15),
        el('span', {}, el('strong', {}, r.urgent ? 'ارجاع فوری — ' : ''), r.textFa, ' ', el('span', { class: 'cell-sub' }, r.actionFa)))),
      ...plain.map((t) => el('div', { class: 'clx-flag' }, icon('alert', 15), el('span', {}, t)))));
}

/** «ناهم‌رأیی‌ها» — discrepancies موتور + conflictFa سازه‌ها (حذف تکرار) */
function mergedConflictsBlock({ f, insights }) {
  const fromConstructs = (f?.constructs ?? []).flatMap((c) => c.conflictFa ?? []);
  const items = dedupeTexts([...(insights?.discrepancies ?? []), ...fromConstructs]);
  if (!items.length) return null;
  return el('div', {},
    el('div', { class: 'clx-syn__blocktitle' }, icon('info', 14), ' ', SYNTHESIS_META.conflictsTitle),
    el('ul', { class: 'clx-list' }, items.map((t) => el('li', {}, icon('clock', 14), el('span', {}, t)))));
}

/** «گام بعدی» — اقدام‌ها + پایش + پیشنهاد پروتکل (فقط نمایشی — قاب «پیشنهاد موتور») */
function nextStepsBlock({ f, insights }) {
  const actions = (f?.nextActions ?? []).length ? f.nextActions : (insights?.nextActions ?? []);
  if (!actions.length && !f?.monitoring && !f?.protocolSuggestion) return null;

  const protocolLine = f?.protocolSuggestion
    ? el('div', { style: { marginBottom: '8px' } },
        el('span', { class: 'badge badge--info' }, 'پیشنهاد موتور'),
        el('strong', {}, ' پروتکل پیشنهادی: '),
        PROTOCOL_FA[f.protocolSuggestion.protocol] ?? f.protocolSuggestion.protocol ?? '—',
        f.protocolSuggestion.secondary ? ` + ثانویه: ${PROTOCOL_FA[f.protocolSuggestion.secondary] ?? f.protocolSuggestion.secondary}` : '',
        el('div', { class: 'cell-sub' }, f.protocolSuggestion.rationaleFa)
      )
    : null;

  const monitoringLine = f?.monitoring
    ? el('div', { style: { marginBottom: '8px' } },
        el('strong', {}, 'بازبینی بعدی: '),
        `هر ${fa(f.monitoring.intervalMonths)} ماه`,
        el('div', { class: 'cell-sub' }, f.monitoring.rationaleFa))
      : null;

  const actionList = actions.length
    ? el('ol', { class: 'clx-syn__actions' },
        actions.map((a) => el('li', { style: { margin: '3px 0' } },
          a?.priority === 1 ? el('span', { class: 'badge badge--danger', style: { fontSize: '10px', marginInlineEnd: '4px' } }, 'فوری') : null,
          a.actionFa ?? a)))
    : null;

  const caps = (f?.capsFa ?? []).length
    ? el('div', { class: 'clx-syn__caps' },
        icon('alert', 13), ' محدودیت‌های داده: ',
        el('ul', { style: { margin: '3px 0 0', paddingInlineStart: '18px' } }, f.capsFa.map((t) => el('li', {}, t))))
    : null;

  return el('div', {},
    el('div', { class: 'clx-syn__blocktitle' }, icon('compass', 14), ' ', SYNTHESIS_META.nextTitle),
    protocolLine,
    monitoringLine,
    actionList,
    caps);
}

/**
 * fetch دادهٔ صورت‌بندی — جدا از رندر، تا clinical-insights یک‌بار بگیرد و هم به
 * wechslerConnections بدهد هم به synthesisSection (null-safe؛ خطا هرگز بالا نمی‌آید).
 */
export async function fetchFormulation({ student }) {
  try {
    return (await api.get(`/api/students/${student.id}/case-formulation`)).data;
  } catch {
    return null; // کارت اختیاری است — نباید تب را بشکند
  }
}

/**
 * کارت واحد «جمع‌بندی تشخیصی» — جایگزین ۴ کارت صورت‌بندی + بلوک‌های موازی موتور.
 * formulation: دادهٔ پیش‌گرفته (fetchFormulation) — اگر null بود همین‌جا یک‌بار fetch می‌شود.
 * engineDetails: گره‌های آمادهٔ clinical-insights (جدول DSM + فرضیه‌ها + نتایج + شواهد)
 * که پشت تاشوی «جزئیات موتور تشخیصی» می‌نشینند؛ خالی = تاشو حذف.
 * plan: پلن پیشنهادی چک‌لیست (T3) — بخش «گام‌های بعدی» برگهٔ بازخورد از آن می‌آید (T9/m152).
 * خروجی null یعنی «نمایش نده» — هرگز تب را نمی‌شکند.
 */
export async function synthesisSection({ student, formulation = null, insights = {}, gates = null, canDecide = false, refresh, engineDetails = null, plan = null }) {
  const f = formulation ?? await fetchFormulation({ student });

  const top = (insights?.ranked ?? [])[0] ?? null;
  if (!f && !top && !(insights?.referralFlags ?? []).length) return null;

  // سربرگ — انسجام شواهد + اطمینان + پوشش داده
  const coveragePercent = f?.dataCoverage?.percent ?? insights?.dataCoverage?.percent ?? null;
  const headBadges = [
    f?.coherence ? el('span', { class: `badge ${COHERENCE_BADGE[f.coherence] ?? 'badge--neutral'}` }, `شواهد: ${f.coherence}`) : null,
    f?.confidence != null ? el('span', { class: 'badge badge--neutral' }, `اطمینان: ${fa(Math.round(f.confidence * 100))}٪`) : null,
    coveragePercent != null ? el('span', { class: 'badge badge--info' }, `پوشش داده: ${fa(coveragePercent)}٪`) : null
  ].filter(Boolean);

  // سازه‌های برجسته — فقط غیرِ «پایین»
  const elevated = (f?.constructs ?? []).filter((c) => c && c.level !== 'پایین');
  const constructsBlock = elevated.length
    ? el('div', {},
        el('div', { class: 'clx-syn__blocktitle' }, icon('grid', 14), ' ', SYNTHESIS_META.constructsTitle),
        el('div', { class: 'clx-syn__constructs' }, ...elevated.map(constructRow)))
    : null;

  // الگوها — فعال‌ها (حداکثر ۴) جلو؛ نامزدها پشت تاشو
  const allPatterns = (f?.patterns ?? []).filter((p) => p && p.status !== 'ruled_out');
  const activePatterns = allPatterns.filter((p) => p.status === 'active').slice(0, 4);
  const candidatePatterns = allPatterns.filter((p) => p.status !== 'active');
  const patternsBlock = allPatterns.length
    ? el('div', {},
        el('div', { class: 'clx-syn__blocktitle' }, icon('sparkles', 14), ' ', SYNTHESIS_META.patternsTitle),
        activePatterns.length ? el('div', {}, ...activePatterns.map(patternCard)) : el('div', { class: 'cell-sub' }, 'الگوی فعالی تأیید نشده است.'),
        candidatePatterns.length
          ? el('details', { class: 'clx-syn__candidates' },
              el('summary', {}, `${SYNTHESIS_META.candidatesLabel} (${fa(candidatePatterns.length)})`),
              el('div', {}, ...candidatePatterns.map(patternCard)))
          : null)
    : null;

  // تاشوی جزئیات موتور — محتوا از clinical-insights می‌آید (تک‌منبع؛ این‌جا فقط قاب)
  const detailNodes = Array.isArray(engineDetails) ? engineDetails.filter(Boolean) : [];
  const detailsBlock = detailNodes.length
    ? el('details', { class: 'clx-syn__engine' },
        el('summary', {}, icon('clipboard', 15), ' ', SYNTHESIS_META.detailsTitle),
        el('div', { class: 'clx-syn__enginedetail' }, ...detailNodes))
    : null;

  // اقدام اصلی — دروازهٔ فاز مداخله (گیت ۵؛ پس از ثبت، دکمه حذف می‌شود)
  const needsDone = Boolean((gates?.gates ?? []).find((g) => g.key === 'needs')?.done);
  const needsBtn = canDecide && !needsDone
    ? el('button', {
        class: 'btn btn--primary btn--sm',
        onclick: () => openNeedsModal({ student, gates, canDecide, refresh })
      }, icon('check', 15), 'ثبت نتیجهٔ نیاز ویژه')
    : null;

  // — T9/m152: برگهٔ بازخورد خانواده — ترکیب والدپسند از همین داده‌ها (صفر GET تازه، بدون بک‌اند جدید)
  //   فقط وقتی صورت‌بندی هست (کارت خودش گارد دارد)؛ متن موتور هرگز عیناً برای خانواده نمی‌رود —
  //   composer بازنویسی ساده می‌کند و چاپ/کپی دارد (ارسال بله کار آینده است).
  const feedbackBtn = f
    ? el('button', {
        class: 'btn btn--soft btn--sm',
        onclick: () => openFeedbackSheetModal({ student, formulation: f, plan, todayLabel: formatJalaliFull(tehranTodayYmd()) })
      }, icon('printer', 15), 'برگهٔ بازخورد خانواده')
    : null;
  const primaryActions = (feedbackBtn || needsBtn)
    ? el('div', { class: 'clx-syn__primaryact' }, feedbackBtn, needsBtn)
    : null;

  return el('div', { class: 'card clx-synthesis' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('layers', 16), SYNTHESIS_META.title),
      el('div', { class: 'clx-syn__badges' }, ...headBadges)),
    el('div', { class: 'card__body' },
      narrativeLead(insights),
      primaryBlock({ f, insights }),
      constructsBlock,
      patternsBlock,
      mergedConflictsBlock({ f, insights }),
      mergedFlagsBlock({ f, insights }),
      nextStepsBlock({ f, insights }),
      primaryActions,
      detailsBlock));
}
