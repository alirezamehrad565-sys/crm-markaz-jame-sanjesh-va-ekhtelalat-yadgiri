/**
 * فرمولاسیون مورد
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// case-formulation.js — کارت «صورت‌بندی پرونده» (موتور استدلال تلفیقی)
// هشت سازه + الگوهای هم‌بودی + روایت سه‌بخشی + پوشش داده + پیشنهاد پروتکل و پایش.
// خط قرمز: خروجی همیشه «الگو/شواهد» است — تشخیص رسمی فقط با متخصص مجاز (پانویس ثابت).

import { api } from './api.js';
import { el, icon, emptyState, loadingState } from './ui.js';
import { fa, formatJalaliDateTime } from './format.js';

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

/** سطر یک سازه — سطح + نوار + شواهد تاشو */
function constructRow(c) {
  const elevated = c.level !== 'پایین';
  const evList = (c.evidenceFa ?? []).map((e) =>
    el('li', { style: { margin: '3px 0', color: 'var(--ink-2, #555)' } },
      el('span', { class: 'badge badge--neutral', style: { fontSize: '10px', padding: '1px 6px', marginInlineEnd: '5px' } }, e.sourceType === 'parent' ? 'خانه' : e.sourceType === 'teacher' ? 'مدرسه' : e.sourceType === 'examiner' ? 'کلینیک' : 'عملکرد'),
      e.textFa
    ));
  return el('details', { style: { borderTop: '1px solid var(--line, #eee)', padding: '7px 2px' } },
    el('summary', { style: { cursor: elevated ? 'pointer' : 'default', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
      el('span', { style: { fontWeight: elevated ? 700 : 400, minWidth: '190px' } }, c.titleFa),
      el('span', { class: `badge ${LEVEL_BADGE[c.level] ?? 'badge--neutral'}` }, c.level),
      levelBar(c.level),
      c.subtypeFa?.length ? el('span', { class: 'badge badge--info', style: { fontSize: '10px' } }, c.subtypeFa.join(' + ')) : null,
      c.sharedWith ? el('span', { class: 'badge badge--info', style: { fontSize: '10px' }, title: 'با یک توضیح تلفیقی گزارش شد (پارسیمونی)' }, 'اشتراکی') : null,
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

/** کارت الگو (هم‌بودی) */
function patternCard(p) {
  const cls = p.status === 'active' ? 'badge--success' : p.status === 'candidate' ? 'badge--warning' : 'badge--neutral';
  const label = p.status === 'active' ? 'فعال' : p.status === 'candidate' ? 'نامزد بررسی' : 'ردشده';
  if (p.status === 'ruled_out') return null;
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

export async function formulationSection({ student }) {
  let f = null;
  try {
    f = (await api.get(`/api/students/${student.id}/case-formulation`)).data;
  } catch {
    return null; // کارت اختیاری است — نباید تب را بشکند
  }
  if (!f) return null;

  const elevated = (f.constructs ?? []).filter((c) => c.level !== 'پایین');

  // روایت سه‌بخشی
  const narrative = el('div', { class: 'card', style: { marginBottom: 'var(--sp-3)' } },
    el('div', { class: 'card__title', style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' } },
      icon('message', 15), 'روایت صورت‌بندی — چه دیدیم / یعنی چه / گام بعدی'),
    el('div', { style: { fontSize: '13px', lineHeight: 1.9 } },
      el('div', {}, el('strong', {}, 'چه دیدیم: '), f.narrative.saw),
      el('div', { style: { marginTop: '4px' } }, el('strong', {}, 'یعنی چه: '), f.narrative.means),
      el('div', { style: { marginTop: '4px' } }, el('strong', {}, 'گام بعدی: '), f.narrative.next)
    )
  );

  // سازه‌ها
  const constructsCard = el('div', { class: 'card', style: { marginBottom: 'var(--sp-3)' } },
    el('div', { class: 'card__title', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
      icon('grid', 15), 'هشت سازهٔ بالینی — سطح هر حوزه از همهٔ ابزارها'),
    el('div', { style: { marginTop: '4px' } },
      (f.constructs ?? []).map(constructRow)
    )
  );

  // الگوها + توضیح اصلی
  const activePatterns = (f.patterns ?? []).filter((p) => p.status !== 'ruled_out');
  const patternsCard = activePatterns.length
    ? el('div', { class: 'card', style: { marginBottom: 'var(--sp-3)' } },
        el('div', { class: 'card__title', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          icon('sparkles', 15), 'الگوهای شناخته‌شده — هم‌بودی و توضیح تلفیقی'),
        el('div', { style: { marginTop: '6px' } },
          el('div', { style: { border: '1px solid var(--brand, #7c5cff)', borderRadius: '10px', padding: '10px 12px', marginBottom: '8px', background: 'rgba(124,92,255,0.05)' } },
            el('div', { style: { fontWeight: 700, marginBottom: '3px' } }, icon('target', 14), ' توضیح اصلی: ', f.primaryProfile.titleFa),
            el('div', { style: { fontSize: '12px', color: 'var(--ink-2, #555)' } }, f.primaryProfile.rationaleFa)
          ),
          activePatterns.map(patternCard),
          (f.differentialsFa ?? []).length
            ? el('div', { style: { fontSize: '12px', marginTop: '6px' } },
                el('strong', {}, 'تفسیرهای جداگانه لازم: '),
                el('ul', { style: { margin: '4px 0 0', paddingInlineStart: '18px' } },
                  f.differentialsFa.map((t) => el('li', {}, t))))
            : null
        )
      )
    : null;

  // پوشش داده + اقدام بعدی + پروتکل/پایش
  const actionsCard = el('div', { class: 'card', style: { marginBottom: 'var(--sp-3)' } },
    el('div', { class: 'card__title', style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
      icon('compass', 15), 'گام‌های بعدی و جمع‌بندی',
      el('span', { class: 'badge badge--info' }, `پوشش داده: ${fa(f.dataCoverage.percent)}٪`),
      el('span', { class: `badge ${COHERENCE_BADGE[f.coherence] ?? 'badge--neutral'}` }, `شواهد: ${f.coherence}`),
      el('span', { class: 'badge badge--neutral' }, `اطمینان: ${fa(Math.round(f.confidence * 100))}٪`)
    ),
    el('div', { style: { marginTop: '6px', fontSize: '13px' } },
      f.protocolSuggestion
        ? el('div', { style: { marginBottom: '8px' } },
            el('strong', {}, 'پیشنهاد پروتکل: '),
            f.protocolSuggestion.protocol === 'learning' ? 'اختلال یادگیری' : f.protocolSuggestion.protocol === 'slow_learner' ? 'دیرآموز' : f.protocolSuggestion.protocol === 'mental_ot' ? 'کاردرمانی ذهنی' : 'توانبخشی',
            f.protocolSuggestion.secondary ? ` + ثانویه: ${f.protocolSuggestion.secondary === 'learning' ? 'اختلال یادگیری' : f.protocolSuggestion.secondary === 'slow_learner' ? 'دیرآموز' : f.protocolSuggestion.secondary === 'mental_ot' ? 'کاردرمانی ذهنی' : 'توانبخشی'}` : '',
            el('div', { class: 'cell-sub' }, f.protocolSuggestion.rationaleFa)
          )
        : null,
      el('div', { style: { marginBottom: '8px' } },
        el('strong', {}, 'بازبینی بعدی: '),
        `هر ${fa(f.monitoring.intervalMonths)} ماه`,
        el('div', { class: 'cell-sub' }, f.monitoring.rationaleFa)
      ),
      (f.nextActions ?? []).length
        ? el('div', {},
            el('strong', {}, 'اقدام‌های اولویت‌دار:'),
            el('ol', { style: { margin: '4px 0 0', paddingInlineStart: '20px' } },
              f.nextActions.map((a) => el('li', { style: { margin: '3px 0' } },
                a.priority === 1 ? el('span', { class: 'badge badge--danger', style: { fontSize: '10px', marginInlineEnd: '4px' } }, 'فوری') : null,
                a.actionFa
              ))))
        : null,
      (f.capsFa ?? []).length
        ? el('div', { style: { marginTop: '8px', fontSize: '12px', color: 'var(--warn, #a06a00)' } },
            icon('alert', 13), ' محدودیت‌های داده: ',
            el('ul', { style: { margin: '3px 0 0', paddingInlineStart: '18px' } }, f.capsFa.map((t) => el('li', {}, t))))
        : null
    )
  );

  // پیوند وکسلر (اگر هست)
  const wiscCard = f.wechslerLink
    ? el('div', { class: 'card', style: { marginBottom: 'var(--sp-3)' } },
        el('div', { class: 'card__title', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          icon('brain', 15), 'پیوند نیمرخ وکسلر',
          f.wechslerLink.iqValue != null ? el('span', { class: 'badge badge--neutral' }, `${f.wechslerLink.iqBasis === 'GAI' ? 'GAI' : 'FSIQ'}: ${fa(f.wechslerLink.iqValue)}`) : null,
          f.wechslerLink.main ? el('span', { class: 'badge badge--info' }, `فرضیهٔ موتور: ${f.wechslerLink.mainNameFa ?? f.wechslerLink.main}`) : null
        ),
        el('div', { style: { marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          (f.wechslerLink.indicesFa ?? []).map((l) => el('span', { class: 'badge badge--neutral' }, l))
        ),
        (f.wechslerLink.validityFlagsFa ?? []).length
          ? el('div', { style: { fontSize: '12px', color: 'var(--warn, #a06a00)', marginTop: '5px' } }, icon('alert', 12), ' ', f.wechslerLink.validityFlagsFa.join(' — '))
          : null
      )
    : null;

  const header = el('div', { class: 'clx-section__title', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', margin: 'var(--sp-4) 0 var(--sp-2)' } },
    icon('layers', 17), 'صورت‌بندی پرونده — استدلال تلفیقی روی همهٔ ابزارها',
    el('span', { class: 'cell-sub' }, `m93 · ${formatJalaliDateTime(f.generatedAt)}`)
  );

  return el('div', { class: 'clx-formulation' },
    header,
    (f.redFlags ?? []).length
      ? el('div', { class: 'clx-flags', style: { marginBottom: 'var(--sp-3)' } },
          ...f.redFlags.map((r) => el('div', { class: `clx-flag ${r.urgent ? 'clx-flag--urgent' : ''}` },
            icon('alert', 15),
            el('span', {}, el('strong', {}, r.urgent ? 'ارجاع فوری — ' : ''), r.textFa, ' ', el('span', { class: 'cell-sub' }, r.actionFa)))))
      : null,
    narrative,
    elevated.length ? constructsCard : null,
    patternsCard,
    wiscCard,
    actionsCard,
    el('div', { class: 'clx-disclaimer' }, icon('shield', 15), el('span', {}, f.disclaimer))
  );
}
