/**
 * مسیر بالینی — قالب‌ساز و جلسات مداخله
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// clinical-insights.js — تب «تفسیر بالینی» پروفایل دانش‌آموز — ری‌رایت مسیر بالینی
// محتوا: استپر مرحله‌ای فاز شناسایی + کارت فرضیه‌ها با دکمه‌های تصمیم
// + مسیر مداخله با چک‌لیست مراحل + ارسال تمرین یک‌کلیکی (فلوی موجود ).
// ری‌رایت بر اساس پیشنهادهای تأییدشدهٔ کاربر:
// ۱) جداسازی محتوا از موتور → متن‌ها و کلیدهای ثابت به clinical-content.js منتقل شد
// ۲) استپر مرحله‌ای → کارت گیت‌ها به استپر عمودی با گام جاری تبدیل شد
// ۳) قالب‌محور → کارت‌های «شروع از قالب» با ساخت مسیر یک‌کلیکی
// ۴) داده‌های جمعیت‌شناختی در تفسیر → بلوک «زمینهٔ تفسیر» (سن/پایه × صدک وکسلر)
// ۵) WISC فقط نمرهٔ خام و گیت مهارتی فقط توانبخشی — در استپر بازتاب دارد
// خط قرمز پلن §۱: خروجی موتور همیشه «غربالگری/فرضیه» است — «هدف درمانی نهایی» فقط با تأیید
// درمانگر روی مسیر مداخله (active) ثبت می‌شود؛ متن موتور هرگز برای خانواده/معلم ارسال نمی‌شود.

import { api } from './api.js';
import { el, icon, openModal, confirmModal, formModal, toast, toastError, emptyState, loadingState } from './ui.js';
import { fa, formatJalaliDateTime, formatStoredJalaliNumeric, tehranTodayYmd, toJalali, gradeLabel } from './format.js';
import { session } from './state.js';
import { openExerciseSendModal } from './exercise-send.js';
import { bankPickButton, appendExerciseToTextarea } from './exercise-pick.js'; // — افزودن تمرین از بانک به جلسه
import { eventPickButton, appendEventToTextarea } from './event-pick.js'; // — افزودن رویداد (فرم/پرسش‌نامه) به جلسه
import { openCaseEventForm } from './case-events.js';
import { pathwayChip, canEditPathway, openPathwayModal } from './session-type.js'; // — مسیر پرونده
import { otChecklistCard, openNeedsModal, protocolChip, protocolCard, NEEDS_KEY, OT_SESSION_KEY } from './ot-checklist.js'; // — فلو دوفازی شناسایی→مداخله
import { formulationSection } from './case-formulation.js'; // — صورت‌بندی پرونده (استدلال تلفیقی)
import { wechslerProfileBlock } from './wechsler-profile.js'; // — کارت کامل نیم‌رخ وکسلر (m133)
// محتوای ثابت (کلیدهای ابزار، برچسب‌ها، متن گام‌ها) از ماژول محتوا
import {
  ANAMNESIS_KEY,
  SCREEN_KEYS,
  SPECIFIC_KEYS,
  PROBE_KEYS,
  REHAB_COG_KEY,
  REHAB_MOTOR_KEY,
  REHAB_ADL_KEY,
  REHAB_JOURNEY_KEYS,
  RESULTS_KEY,
  WISC4_KEY,
  SUSPICION_KEY,
  LEARNING_BLANK_TEMPLATE_KEY,
  SLD_CHECKLIST_KEYS,
  SESSION_ITEM_TYPES,
  SESSION_ITEM_LABELS,
  CRITERION_STATUS,
  CONFIDENCE_BADGE,
  PATH_STATUS_BADGE,
  PATH_STATUS_LABEL,
  DECISION_LABEL,
  RESULTS_EVENT_LABELS,
  STEPPER_META,
  GATE_GLOSS,
  SUSPICION_CONTENT,
  CONTEXT_META
} from './clinical-content.js';

/** آیا کاربرِ فعلی حق تصمیم دارد؟ (پلن §۷ — مدیر یا درمانگرِ مسئول؛ منشی فقط مشاهده) */
function canDecideFor(student) {
  const u = session.user;
  if (!u) return false;
  if (u.role === 'manager') return true;
  return u.role === 'therapist' && Boolean(student.ownerStaffId) && student.ownerStaffId === u.staffId;
}

/** چیپ کوچک شمارشی برای خلاصهٔ ملاک‌ها */
function countChip(label, n, cls) {
  if (!n) return null;
  return el('span', { class: `badge ${cls}`, title: `${label}: ${fa(n)}` }, `${label} ${fa(n)}`);
}

/** — سن از تاریخ تولد (شمسی ذخیره‌شده یا میلادی) — «۹ سال و ۴ ماه» */
function ageLineFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const s = String(birthDate).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim();
  let jy; let jm; let jd;
  let m = s.match(/(\d{3,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m && Number(m[1]) >= 1200 && Number(m[1]) <= 1500) {
    [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if (m && Number(m[1]) > 1700) {
    // میلادی ذخیره‌شدهٔ فرم → شمسی
    const j = toJalali(Number(m[1]), Number(m[2]), Number(m[3]));
    [jy, jm, jd] = [j.jy, j.jm, j.jd];
  } else {
    return null;
  }
  const [gy, gm, gd] = tehranTodayYmd().split('-').map(Number);
  const t = toJalali(gy, gm, gd);
  let years = t.jy - jy;
  let months = t.jm - jm;
  if (t.jd < jd) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0 || years > 25) return null;
  return `${fa(years)} سال و ${fa(months)} ماه`;
}

/** لیست آیتم‌دار با آیکون */
function iconList(items, iconKey, toneClass) {
  return el('ul', { class: 'clx-list' },
    items.map((t) => el('li', {}, icon(iconKey, 14), el('span', {}, t)))
  );
}

/** کپی متنی در کلیپ‌بورد با fallback */
async function copyText(text, okMsg) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = el('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(okMsg ?? 'کپی شد', 'success');
  } catch {
    toast('کپی ممکن نشد — متن را دستی انتخاب کنید');
  }
}

// ───────── کارت «مسیر ارزیابی» (توصیهٔ متخصص UX — گام‌نمای پنج‌گامی) ─────────

function journeyCard({ student, insights, paths, anamnesisTypeId, refresh }) {
  const seen = new Set(insights.dataCoverage?.seen ?? []);
  const countOf = (keys) => keys.filter((k) => seen.has(k)).length;

  const nAnam = seen.has(ANAMNESIS_KEY) ? 1 : 0;
  const nScreen = countOf(SCREEN_KEYS);
  const nSpec = countOf(SPECIFIC_KEYS);
  const nProbe = countOf(PROBE_KEYS);
  const activePath = (paths ?? []).some((p) => p.status === 'active');
  const anyPath = (paths ?? []).length > 0;
  const hasRanked = (insights.ranked?.length ?? 0) > 0;

  const statusBadge = (done, total) => {
    if (done >= total) return el('span', { class: 'badge badge--success' }, 'نتیجه آماده');
    if (done > 0) return el('span', { class: 'badge badge--warning' }, 'نیمه‌کاره');
    return el('span', { class: 'badge badge--neutral' }, 'شروع نشده');
  };

  const stepAction = (label, onclick) =>
    el('button', { class: 'btn btn--soft btn--sm', onclick }, icon('send', 14), label);

  const steps = [
    {
      title: '۱ — شرح‌حال',
      hint: 'فرم گفت‌وگوی اول',
      badge: statusBadge(nAnam, 1),
      action: anamnesisTypeId
        ? stepAction('ثبت شرح‌حال', () => openCaseEventForm({ student, defaultTypeId: anamnesisTypeId, onSaved: refresh }))
        : null
    },
    {
      title: '۲ — غربالگری',
      hint: 'SDQ خانواده و معلم — با بله',
      badge: statusBadge(nScreen, 2),
      action: stepAction('ارسال غربالگری', () => openCaseEventForm({ student, onlyKeys: SCREEN_KEYS, pickerTitle: 'غربالگری — خانواده و معلم', onSaved: refresh }))
    },
    {
      title: '۳ — فرم‌های تخصصی',
      hint: 'بنا به نشانه‌ها',
      badge: statusBadge(nSpec, 1),
      action: stepAction('ارسال فرم تخصصی', () => openCaseEventForm({ student, onlyKeys: SPECIFIC_KEYS, pickerTitle: 'پرسش‌نامه‌های تخصصی', onSaved: refresh }))
    },
    {
      title: '۴ — آزمون عملکرد',
      hint: 'خواندن / نوشتن / حساب',
      badge: statusBadge(nProbe, 3),
      action: stepAction('ثبت آزمون عملکرد', () => openCaseEventForm({ student, onlyKeys: PROBE_KEYS, pickerTitle: 'آزمون‌های کوتاه عملکرد', onSaved: refresh }))
    },
    {
      title: '۵ — جمع‌بندی',
      hint: 'فرضیه‌ها و مسیر مداخله',
      badge: activePath
        ? el('span', { class: 'badge badge--success' }, 'هدف فعال شد')
        : anyPath
          ? el('span', { class: 'badge badge--warning' }, 'در بازبینی')
          : hasRanked
            ? el('span', { class: 'badge badge--info' }, 'فرضیه آماده است')
            : el('span', { class: 'badge badge--neutral' }, 'پس از داده‌ها'),
      action: null
    }
  ];

  return el('div', { class: 'card clx-journey' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('compass', 16), 'مسیر ارزیابی — پایش')),
    el('div', { class: 'card__body' },
      el('div', { class: 'clx-journey__steps' },
        ...steps.map((s) =>
          el('div', { class: 'clx-journey__step' },
            el('div', { class: 'clx-journey__head' },
              el('strong', {}, s.title),
              s.badge),
            el('div', { class: 'cell-sub' }, s.hint),
            s.action ? el('div', { class: 'clx-journey__act' }, s.action) : null
          )
        )
      )
    )
  );
}

// ───────── کارت «مسیر بالینی استاندارد» — ورودی‌های مشترک همهٔ مسیرها (: ترتیب استاندارد + شک بالینی) ─────────
// تا نتیجهٔ نیاز ویژه ثبت نشود، پرونده در فاز شناسایی است و این پنج ورودی دنبال می‌شود.

/**
 * — بلوک «نقطهٔ تصمیم شک بالینی» — بین گام ۲ (چک‌لیست‌ها) و گام ۳ (وکسلر):
 * سیگنال چک‌لیست‌های تازه + تصمیم ثبت‌شدهٔ درمانگر (فرم ce-clinical-suspicion-v1).
 * خط قرمز: سیگنال فقط پیشنهاد است؛ شناسایی و تصمیم با درمانگر است.
 */
function suspicionBlock({ student, gates, typesById, canDecide, refresh }) {
  const sus = gates.suspicion ?? { signals: [], decided: false, decidedAt: null, decidedSummary: null };
  const typeId = typesById.get(SUSPICION_KEY)?.id ?? null;

  const levelBadge = (level) => level === 'high'
    ? el('span', { class: 'badge badge--error' }, SUSPICION_CONTENT.levelHigh)
    : el('span', { class: 'badge badge--warning' }, SUSPICION_CONTENT.levelWatch);

  const signalRows = (sus.signals ?? []).map((s) =>
    el('div', { class: 'clx-suspicion__signal' },
      el('div', { class: 'clx-suspicion__sighead' },
        el('strong', {}, s.label),
        levelBadge(s.level),
        el('span', { class: 'cell-sub' }, `${SUSPICION_CONTENT.sourcesPrefix}${(s.sources ?? []).join(' + ')}`)),
      el('ul', { class: 'clx-list' },
        (s.evidence ?? []).map((t) => el('li', {}, icon('check', 13), el('span', {}, t))))
    )
  );

  const recordBtn = canDecide && typeId
    ? el('button', {
        class: `btn btn--sm ${sus.decided ? 'btn--ghost' : 'btn--primary'}`,
        onclick: () => openCaseEventForm({ student, defaultTypeId: typeId, onSaved: refresh })
      }, icon('alert', 14), sus.decided ? SUSPICION_CONTENT.updateLabel : SUSPICION_CONTENT.recordLabel)
    : null;

  return el('div', { class: `clx-suspicion${sus.decided ? ' is-decided' : ''}` },
    el('div', { class: 'clx-suspicion__head' },
      el('strong', {}, icon('alert', 15), SUSPICION_CONTENT.head),
      sus.decided
        ? el('span', { class: 'badge badge--accent' }, SUSPICION_CONTENT.decidedBadge)
        : el('span', { class: 'badge badge--neutral' }, SUSPICION_CONTENT.pendingBadge)
    ),
    (sus.signals ?? []).length
      ? el('div', { class: 'clx-suspicion__body' }, ...signalRows)
      : el('div', { class: 'cell-sub' }, SUSPICION_CONTENT.emptyHint),
    sus.decided && sus.decidedSummary
      ? el('div', { class: 'clx-suspicion__decision' },
          el('span', { class: 'badge badge--info' }, `تصمیم: ${sus.decidedSummary}`),
          sus.decidedAt ? el('span', { class: 'cell-sub' }, formatJalaliDateTime(sus.decidedAt)) : null)
      : null,
    recordBtn ? el('div', { class: 'clx-suspicion__act' }, recordBtn) : null
  );
}

/** — نیم‌رخ وکسلر (گام ۳) — چیپ‌محور: شاخص‌ها + GAI + پراکندگی + فرضیهٔ اصلی موتور */
function wechslerSummaryLine(summary) {
  if (!summary) return null;
  const chip = (label, v) => v == null ? null : el('span', { class: 'badge badge--neutral' }, `${label} ${fa(v)}`);
  const chips = [];
  if (summary.fsiq != null) {
    const p = summary.percentile != null ? ` (صدک ${fa(summary.percentile)})` : '';
    const c = summary.cls ? ` — ${summary.cls}` : '';
    chips.push(el('span', { class: 'badge badge--accent' }, `FSIQ ${fa(summary.fsiq)}${p}${c}`));
  }
  chips.push(chip('VCI', summary.vci), chip('PRI', summary.pri), chip('WMI', summary.wmi), chip('PSI', summary.psi), chip('GAI', summary.gai));
  if (summary.indexScatter != null && summary.indexScatter > 0) {
    chips.push(el('span', { class: 'badge badge--warning', title: 'ماکس − مین شاخص‌ها (مبنای GAI: ≥۲۳)' }, `پراکندگی ${fa(summary.indexScatter)}`));
  }
  if (summary.mainName) {
    chips.push(el('span', { class: 'badge badge--info' }, `فرضیهٔ اصلی: ${summary.mainName}${summary.mainLevel ? ` — ${summary.mainLevel}` : ''}`));
  }
  if (!chips.length) return null;
  return el('div', { class: 'clx-chips', style: { marginTop: '4px' } },
    el('span', { class: 'cell-sub' }, 'نیم‌رخ وکسلر ۴:'),
    ...chips,
    summary.engine
      ? el('span', { class: 'cell-sub' }, 'موتور')
      : el('span', { class: 'cell-sub', title: 'ثبت دستی — برای تحلیل موتور، نمرهٔ خام ۱۵ خرده‌آزمون را در فرم وکسلر ۴ ثبت کنید' }, 'ثبت دستی')
  );
}

/**
 * — بلوک «زمینهٔ تفسیر» (ری‌رایت پیشنهاد ۴ — داده‌های جمعیت‌شناختی در تفسیر)
 * سن/تولد/پایه/مسیر پرونده کنار خروجی کمی وکسلر (FSIQ/صدک/پراکندگی) — تا نیم‌رخ
 * همیشه در بستر سن و پایهٔ تحصیلی خوانده شود؛ همان بستری که موتور وکسلر با
 * تاریخ تولد نرمال‌سازی می‌کند.
 */
function interpretationContext({ student, gates }) {
  const ageLine = ageLineFromBirthDate(student.birthDate);
  const w = gates?.wechslerSummary ?? null;
  const hasWisc = Boolean(w && (w.fsiq != null || w.percentile != null));

  const row = (label, value, cls = '') =>
    el('div', { class: 'clx-ctx__row' },
      el('span', { class: 'clx-ctx__label' }, label),
      el('span', { class: `clx-ctx__value ${cls}` }, value)
    );

  const rows = el('div', { class: 'clx-ctx__rows' },
    row(CONTEXT_META.rows.age, ageLine ?? '—'),
    student.birthDate ? row(CONTEXT_META.rows.birthDate, formatStoredJalaliNumeric(student.birthDate)) : null,
    student.grade ? row(CONTEXT_META.rows.grade, gradeLabel(student.grade)) : null,
    student.pathway ? row(CONTEXT_META.rows.pathway, student.pathway === 'learning' ? 'اختلال یادگیری' : 'توانبخشی') : null
  );

  const wiscRows = hasWisc
    ? el('div', { class: 'clx-ctx__rows' },
        w.fsiq != null ? row(CONTEXT_META.rows.fsiq, fa(w.fsiq), 'is-strong') : null,
        w.percentile != null ? row(CONTEXT_META.rows.percentile, fa(w.percentile)) : null,
        w.indexScatter != null && w.indexScatter > 0 ? row(CONTEXT_META.rows.scatter, fa(w.indexScatter)) : null,
        el('div', { class: 'clx-ctx__note' }, CONTEXT_META.scatterNote)
      )
    : el('div', { class: 'clx-ctx__empty' }, CONTEXT_META.emptyWechsler);

  const guidance = hasWisc && w.percentile != null && student.grade
    ? el('div', { class: 'clx-ctx__guide' }, icon('compass', 13), CONTEXT_META.gapTemplate(fa(w.percentile), gradeLabel(student.grade)))
    : null;

  return el('div', { class: 'clx-ctx' },
    el('div', { class: 'clx-ctx__title' }, icon('user', 14), CONTEXT_META.title),
    el('div', { class: 'cell-sub' }, CONTEXT_META.hint),
    el('div', { class: 'clx-ctx__grid' }, rows, wiscRows),
    guidance
  );
}

/**
 * — استپر مرحله‌ای «مسیر بالینی استاندارد — فاز شناسایی» (ری‌رایت پیشنهاد ۲)
 * گرهٔ عمودی شماره‌دار + خط اتصال؛ گام جاری (اولین گام ناتمام قابل اقدام) هایلایت است.
 * بلوک تصمیم شک بالینی روی ستون فقرات، بین گام ۲ و ۳ می‌نشیند.
 */
function identificationStepper({ student, gates, typesById, anamnesisTypeId, canDecide, refresh }) {
  const typeIdOf = (key) => typesById.get(key)?.id ?? null;
  const gatesList = gates.gates ?? [];
  const doneCount = gatesList.filter((g) => g.done).length;

  const badgeOf = (g) => {
    if (g.key === 'needs' && g.done) return el('span', { class: 'badge badge--accent' }, 'پروتکل فعال شد');
    if (g.done) return el('span', { class: 'badge badge--success' }, 'ثبت شده');
    return el('span', { class: 'badge badge--neutral' }, 'ثبت نشده');
  };

  const actionOf = (g) => {
    const act = (label, cls, onclick) => el('button', { class: `btn ${cls} btn--sm`, onclick }, icon('send', 14), label);
    switch (g.key) {
      case 'anamnesis':
        return anamnesisTypeId
          ? act(GATE_GLOSS.anamnesis.actionLabel, 'btn--soft', () => openCaseEventForm({ student, defaultTypeId: anamnesisTypeId, onSaved: refresh }))
          : null;
      case 'behavioral':
        return act(GATE_GLOSS.behavioral.actionLabel, 'btn--soft', () => openCaseEventForm({
          student,
          onlyKeys: [...SCREEN_KEYS, ...SPECIFIC_KEYS],
          pickerTitle: 'چک‌لیست‌های خانواده و معلم‌محور',
          onSaved: refresh
        }));
      case 'wechsler':
        return typeIdOf(WISC4_KEY)
          ? act(GATE_GLOSS.wechsler.actionLabel, 'btn--soft', () => openCaseEventForm({ student, defaultTypeId: typeIdOf(WISC4_KEY), onSaved: refresh }))
          : null;
      case 'skills':
        // گیت گام ۴ وابسته به مسیر: یادگیری → چک‌لیست‌های خواندن/نوشتن/ریاضی؛ توانبخشی → چک‌لیست مهارتی
        if (gates.pathway === 'learning') {
          return act(GATE_GLOSS.skills.learningActionLabel, 'btn--soft', () => openCaseEventForm({
            student,
            onlyKeys: SLD_CHECKLIST_KEYS,
            pickerTitle: 'چک‌لیست‌های خواندن، نوشتن و ریاضی',
            onSaved: refresh
          }));
        }
        return act(GATE_GLOSS.skills.rehabActionLabel, 'btn--soft', () => {
          document.getElementById('ot-checklist-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      case 'needs':
        if (g.done || !canDecide) return null;
        return act(GATE_GLOSS.needs.actionLabel, 'btn--primary', () => openNeedsModal({ student, gates, canDecide, refresh }));
      default:
        return null;
    }
  };

  // گام جاری = اولین گام ناتمام (بعد از آن که شک بالینی تصمیم ندارد، فرعی حساب نمی‌شود)
  const firstOpenIdx = gatesList.findIndex((g) => !g.done);

  /** آیتم استپر برای یک گیت */
  const gateItem = (g, idx) => {
    const isDone = Boolean(g.done);
    const isCurrent = idx === firstOpenIdx;
    const state = isDone ? 'is-done' : isCurrent ? 'is-current' : 'is-todo';
    const action = actionOf(g);
    return el('li', { class: `clx-stepper__item ${state}` },
      el('span', { class: 'clx-stepper__node', 'aria-hidden': 'true' }, isDone ? icon('check', 13) : el('span', { class: 'clx-stepper__num' }, fa(g.ord ?? ''))),
      el('div', { class: 'clx-stepper__panel' },
        el('div', { class: 'clx-stepper__head' },
          el('strong', {}, g.label),
          badgeOf(g),
          action ? el('span', { class: 'clx-stepper__act' }, action) : null
        ),
        g.hint ? el('div', { class: 'cell-sub' }, g.hint) : null,
        g.detail ? el('div', { class: 'clx-stepper__detail' }, g.detail) : null,
        g.key === 'wechsler' ? wechslerSummaryLine(gates.wechslerSummary) : null
      )
    );
  };

  /** گره تصمیم شک بالینی روی ستون فقرات — بین گام ۲ و ۳ */
  const suspicionNode = () => {
    const sus = gates.suspicion ?? { decided: false };
    return el('li', { class: `clx-stepper__item clx-stepper__item--decision ${sus.decided ? 'is-done' : 'is-todo'}` },
      el('span', { class: 'clx-stepper__node clx-stepper__node--alert', 'aria-hidden': 'true' }, icon('alert', 13)),
      el('div', { class: 'clx-stepper__panel' },
        suspicionBlock({ student, gates, typesById, canDecide, refresh })
      )
    );
  };

  const items = [];
  for (let idx = 0; idx < gatesList.length; idx++) {
    const g = gatesList[idx];
    items.push(gateItem(g, idx));
    if (g.key === 'behavioral') items.push(suspicionNode());
  }

  const pct = gatesList.length ? Math.round((doneCount / gatesList.length) * 100) : 0;
  const allDone = doneCount === gatesList.length && gatesList.length > 0;

  return el('div', { class: 'card clx-stepper-card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('compass', 16), STEPPER_META.title),
      el('span', { class: `badge ${allDone ? 'badge--success' : 'badge--info'}` },
        allDone ? STEPPER_META.allDone : `${fa(doneCount)} از ${fa(gatesList.length)} گام کامل`)),
    el('div', { class: 'card__body' },
      el('div', { class: 'clx-stepper-card__bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        el('span', { class: 'clx-stepper-card__fill', style: { width: `${pct}%` } })),
      el('div', { class: 'cell-sub' }, STEPPER_META.subtitle),
      el('ol', { class: 'clx-stepper' }, ...items)
    )
  );
}

// ───────── / — کارت نتایج (فرم نتایج + وکسلر ۴ — هر دو مسیر) ─────────

// برچسب‌های پایه از ماژول محتوا؛ دو ردیف مختص ot-checklist این‌جا اضافه می‌شود
const RESULTS_LABELS = {
  ...RESULTS_EVENT_LABELS,
  [NEEDS_KEY]: 'نتیجهٔ نیاز ویژه',
  [OT_SESSION_KEY]: 'جلسهٔ کاردرمانی ذهنی'
};

async function latestResultsCard({ student, typesById, refresh }) {
  const wanted = new Set([REHAB_COG_KEY, REHAB_MOTOR_KEY, REHAB_ADL_KEY, RESULTS_KEY, WISC4_KEY, NEEDS_KEY, OT_SESSION_KEY].map((k) => typesById.get(k)?.id).filter(Boolean));
  const wantedKeyOf = (typeId) => {
    for (const [k, t] of typesById) if (t.id === typeId) return k;
    return null;
  };

  let events = [];
  try {
    events = (await api.get(`/api/students/${student.id}/case-events`)).data ?? [];
  } catch { events = []; }
  const mine = events.filter((e) => wanted.has(e.eventTypeId) && e.status !== 'cancelled').slice(0, 8);

  const statusBadgeFor = (e) =>
    e.status === 'completed' ? el('span', { class: 'badge badge--success' }, 'ثبت‌شده')
      : e.status === 'draft' ? el('span', { class: 'badge badge--warning' }, 'پیش‌نویس')
      : el('span', { class: 'badge badge--neutral' }, e.status);

  return el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('clipboard', 16), 'نتایج ارزیابی — آخرین ثبت‌ها'),
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        el('button', { class: 'btn btn--soft btn--sm', onclick: () => openCaseEventForm({ student, onlyKeys: [RESULTS_KEY, WISC4_KEY, ...REHAB_JOURNEY_KEYS], pickerTitle: 'ثبت نتایج و ارزیابی‌ها', onSaved: refresh }) }, icon('plus', 14), 'ثبت جدید')
      )
    ),
    el('div', { class: 'card__body' },
      mine.length === 0
        ? el('div', { class: 'cell-sub' }, 'ثبتی نیست.')
        : el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            mine.map((e) => {
              const k = wantedKeyOf(e.eventTypeId);
              return el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid var(--line)' } },
                el('span', { style: { fontWeight: 600, fontSize: 'var(--fs-sm)' } }, e.typeTitle ?? RESULTS_LABELS[k] ?? 'فرم'),
                statusBadgeFor(e),
                el('span', { class: 'cell-sub' }, formatJalaliDateTime(e.occurredAt)),
                e.summary ? el('span', { class: 'cell-sub', style: { flex: 1, minWidth: '160px' } }, e.summary) : null
              );
            })
          )
    )
  );
}

function hypothesisCard(h, rank, { student, paths, canDecide, refresh }) {
  const livePath = (paths ?? []).find(
    (p) => p.targetKey === h.targetKey && ['suggested', 'reviewed', 'active'].includes(p.status)
  );
  const cs = h.criteriaSummary ?? { met: 0, partial: 0, unknown: 0, notMet: 0 };

  const actions = canDecide && !livePath
    ? el('div', { class: 'clx-actions' },
        el('button', {
          class: 'btn btn--primary btn--sm',
          onclick: async () => {
            const ok = await confirmModal({
              title: `تأیید فرضیه «${h.targetTitle}»`,
              message: 'با تأیید، این هدف به‌عنوان هدف درمانی نهایی ثبت و مسیر مداخله فعال می‌شود. این ثبت، قضاوت بالینی شماست — خروجی موتور فقط پیشنهاد بود.',
              confirmLabel: 'تأیید و فعال‌سازی'
            });
            if (!ok) return;
            try {
              const created = (await api.post(`/api/students/${student.id}/clinical-paths`, { target_key: h.targetKey })).data;
              await api.post(`/api/clinical-paths/${created.id}/decision`, { action: 'confirm' });
              toast('مسیر مداخله فعال شد — چک‌لیست مراحل پایین آماده است', 'success');
              refresh();
            } catch (err) { toastError(err); }
          }
        }, icon('check', 15), 'تأیید و فعال‌سازی مسیر'),
        el('button', {
          class: 'btn btn--soft btn--sm',
          onclick: async () => {
            try {
              await api.post(`/api/students/${student.id}/clinical-paths`, { target_key: h.targetKey });
              toast('پیشنهاد ثبت شد — در «مسیرهای مداخله» پایین برای بازبینی', 'success');
              refresh();
            } catch (err) { toastError(err); }
          }
        }, icon('clock', 15), 'ثبت پیشنهاد — بازبینی بعداً')
      )
    : null;

  return el('div', { class: 'card clx-hyp' },
    el('div', { class: 'card__body' },
      el('div', { class: 'clx-hyp__head' },
        el('span', { class: 'clx-hyp__rank' }, fa(rank)),
        el('strong', { class: 'clx-hyp__title' }, h.targetTitle),
        el('span', { class: `badge ${CONFIDENCE_BADGE[h.confidence] ?? 'badge--neutral'}` }, `اطمینان ${h.confidence}`),
        el('span', { class: 'cell-sub', title: 'جمع وزن شواهد — عدد فنی موتور' }, `امتیاز شواهد: ${fa(h.score)}`)
      ),
      el('div', { class: 'clx-chips' },
        countChip('برآورده', cs.met, 'badge--success'),
        countChip('ناقص', cs.partial, 'badge--warning'),
        countChip('بررسی', cs.unknown, 'badge--info'),
        countChip('رد', cs.notMet, 'badge--neutral')
      ),
      h.evidenceFa?.length ? el('div', { class: 'clx-sub' },
        el('div', { class: 'clx-sub__title' }, 'شواهد:'),
        iconList(h.evidenceFa, 'check', 'ok')) : null,
      h.missingFa?.length ? el('div', { class: 'clx-sub' },
        el('div', { class: 'clx-sub__title' }, 'ناقص برای این فرضیه (کلیک = ارسال فرم):'),
        el('div', { class: 'clx-chips' },
          ...h.missingFa.map((m) => el('button', {
            class: 'badge badge--warning clx-missing-btn',
            onclick: () => openCaseEventForm({ student, onSaved: refresh })
          }, icon('send', 13), m)))
        ) : null,
      h.differentialsFa?.length ? el('details', { class: 'clx-sub' },
        el('summary', { class: 'clx-sub__title', style: { cursor: 'pointer', listStyle: 'revert' } }, 'تفریق تشخیصی'),
        iconList(h.differentialsFa, 'compass', 'diff')) : null,
      livePath
        ? el('div', { class: 'clx-livenote' }, icon('eye', 14),
            `برای این هدف مسیر «${PATH_STATUS_LABEL[livePath.status]}» ثبت است — تصمیم در فهرست مسیرهای پایین.`)
        : null,
      actions
    )
  );
}

// ───────── جدول ملاک‌های DSM چهارحالته (پلن §۵ گام ۱ — همیشه کامل نمایش داده می‌شود) ─────────

function criteriaGroups(criteria, ranked) {
  const titleOf = {};
  for (const h of ranked ?? []) titleOf[h.targetKey] = h.targetTitle;
  const groups = new Map();
  for (const c of criteria ?? []) {
    if (!groups.has(c.targetKey)) groups.set(c.targetKey, []);
    groups.get(c.targetKey).push(c);
  }
  if (groups.size === 0) return null;

  // هدفِ فرضیهٔ برتر به‌صورت پیش‌فرض باز است
  const topKey = (ranked ?? [])[0]?.targetKey ?? null;

  return el('div', { class: 'clx-crits' },
    [...groups.entries()].map(([targetKey, list]) => {
      const metCount = list.filter((c) => c.status === 'met').length;
      const isOpen = targetKey === topKey;
      return el('details', { class: 'clx-crit', open: isOpen ? true : null },
        el('summary', {},
          el('span', { class: 'clx-crit__title' }, icon('clipboard', 15), titleOf[targetKey] ?? targetKey),
          el('span', { class: 'cell-sub' }, `${fa(metCount)} از ${fa(list.length)} ملاک برآورده`)
        ),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'table clx-crit__table' },
            el('thead', {}, el('tr', {},
              el('th', {}, 'ملاک DSM-5-TR'),
              el('th', { style: { width: '130px' } }, 'وضعیت'),
              el('th', { style: { width: '80px' } }, 'منبع')
            )),
            el('tbody', {},
              list.map((c) => {
                const st = CRITERION_STATUS[c.status] ?? CRITERION_STATUS.unknown;
                return el('tr', {},
                  el('td', {},
                    el('span', { class: 'badge badge--neutral clx-crit__grp', title: 'گروه ملاک' }, c.group ?? '—'),
                    el('span', { class: 'clx-crit__text' }, c.textFa)
                  ),
                  el('td', {}, el('span', { class: `badge ${st.cls}` }, st.label)),
                  el('td', {}, el('span', { class: 'cell-sub' }, c.sources?.length ? `${fa(c.sources.length)} منبع` : '—'))
                );
              })
            )
          )
        )
      );
    })
  );
}

// ───────── کارت مسیر مداخله (پروتکل قضاوت §۷) ─────────

function decisionButtons(path, { student, refresh, canDecide }) {
  if (!canDecide) return null;
  if (!['suggested', 'reviewed'].includes(path.status)) return null;

  const decide = (payload, okMsg) => async () => {
    try {
      await api.post(`/api/clinical-paths/${path.id}/decision`, payload);
      toast(okMsg, 'success');
      refresh();
    } catch (err) { toastError(err); }
  };

  const editTarget = async () => {
    let targets;
    try {
      targets = (await api.get('/api/clinical-targets')).data;
    } catch (err) { toastError(err); return; }
    const options = (targets ?? [])
      .filter((t) => t.key !== path.targetKey)
      .map((t) => ({ value: t.key, label: `${t.title} — ${t.group === 'clinical' ? 'هدف بالینی' : 'پشتیبان'}` }));
    formModal({
      title: 'اصلاح فرضیه — انتخاب هدف جدید',
      submitLabel: 'ثبت اصلاح',
      fields: [
        { name: 'target_key', type: 'select', label: 'هدف درمانی جدید', required: true, options, placeholder: 'انتخاب کنید…' },
        { name: 'note', type: 'textarea', label: 'یادداشت (دلیل اصلاح — برای کالیبراسیون موتور)', rows: 2 }
      ],
      onSubmit: async (vals) => {
        if (!vals.target_key) { toast('هدف جدید را انتخاب کنید'); return false; }
        await decide({ action: 'edit', target_key: vals.target_key, note: vals.note || null }, 'اصلاح ثبت شد — مسیر «بازبینی‌شده» شد')();
        return true;
      }
    });
  };

  const rejectPath = () => {
    formModal({
      title: `رد فرضیه «${path.targetTitle}»`,
      submitLabel: 'ثبت رد',
      fields: [
        { name: 'note', type: 'textarea', label: 'دلیل رد (اجباری — دادهٔ کالیبراسیون موتور)', required: true, rows: 3 }
      ],
      onSubmit: async (vals) => {
        if (!vals.note?.trim()) { toast('رد بدون یادداشت مجاز نیست'); return false; }
        await decide({ action: 'reject', note: vals.note.trim() }, 'رد ثبت شد — مسیر بسته شد')();
        return true;
      }
    });
  };

  const needInfo = () => {
    formModal({
      title: 'نیاز به اطلاعات بیشتر',
      submitLabel: 'ثبت',
      fields: [
        { name: 'note', type: 'textarea', label: 'چه چیزی کم است؟ (مثلاً: چک‌لیست معلم نیامده)', rows: 2 }
      ],
      onSubmit: async (vals) => {
        await decide({ action: 'need_info', note: vals.note?.trim() || null }, 'ثبت شد — مسیر «بازبینی‌شده» شد')();
        return true;
      }
    });
  };

  return el('div', { class: 'clx-actions' },
    el('button', { class: 'btn btn--primary btn--sm', onclick: async () => {
      const ok = await confirmModal({
        title: `تأیید هدف «${path.targetTitle}»`,
        message: 'مسیر مداخله فعال می‌شود و چک‌لیست مراحل برای اجرا باز می‌شود. «هدف درمانی نهایی» همین‌جا ثبت می‌شود.',
        confirmLabel: 'تأیید و فعال‌سازی'
      });
      if (ok) await decide({ action: 'confirm' }, 'مسیر مداخله فعال شد')();
    } }, icon('check', 15), 'تأیید و فعال‌سازی'),
    el('button', { class: 'btn btn--soft btn--sm', onclick: editTarget }, icon('edit', 15), 'اصلاح هدف'),
    el('button', { class: 'btn btn--soft btn--sm', onclick: needInfo }, icon('bell', 15), 'نیاز به اطلاعات بیشتر'),
    el('button', { class: 'btn btn--danger-ghost btn--sm', onclick: rejectPath }, icon('x', 15), 'رد فرضیه')
  );
}

// ───────── / — ساخت مسیر از قالب + نوار مداخله + برنامهٔ جلسه به جلسه ─────────

/** — نشان پروتکل قالب */
const TEMPLATE_PROTOCOL_BADGE = {
  learning: { cls: 'badge--info', label: 'یادگیری' },
  slow_learner: { cls: 'badge--warning', label: 'دیرآموز' },
  mental_ot: { cls: 'badge--accent', label: 'کاردرمانی ذهنی' },
  rehab: { cls: 'badge--success', label: 'توانبخشی' }
};

/**
 * — کارت‌های «شروع از قالب» (ری‌رایت پیشنهاد ۳ — قالب‌محور)
 * وقتی هنوز مسیری ثبت نشده، قالب‌های فعالِ هم‌راستا با پروتکل اول نمایش داده می‌شوند؛
 * «ساخت مسیر» مودال قالب را با همان قالبِ پیش‌انتخاب‌شده باز می‌کند.
 */
async function templateQuickStart({ student, refresh, canDecide, protocol }) {
  let templates = [];
  try {
    templates = (await api.get('/api/pathway-templates')).data ?? [];
  } catch { return null; }
  if (!templates.length || !canDecide) return null;

  // قالب‌های هم‌راستا با پروتکل پرونده اول؛ اگر پروتکل نداریم، همهٔ فعال‌ها
  const ordered = protocol
    ? [...templates.filter((t) => t.protocol === protocol), ...templates.filter((t) => !t.protocol || t.protocol !== protocol)]
    : templates;
  const shown = ordered.slice(0, 3);
  if (!shown.length) return null;

  const cards = shown.map((t) => {
    const pb = TEMPLATE_PROTOCOL_BADGE[t.protocol] ?? null;
    const nSteps = (t.steps ?? []).length;
    const nSessions = (t.sessions ?? []).length;
    return el('div', { class: 'clx-tpl' },
      el('div', { class: 'clx-tpl__head' },
        el('strong', { class: 'clx-tpl__title' }, t.title),
        pb ? el('span', { class: `badge ${pb.cls}` }, pb.label) : null,
        t.isSystem ? el('span', { class: 'badge badge--neutral' }, 'سیستمی') : null
      ),
      t.description ? el('div', { class: 'cell-sub clx-tpl__desc' }, t.description) : null,
      el('div', { class: 'clx-tpl__meta' },
        nSteps ? el('span', { class: 'badge badge--neutral' }, `${fa(nSteps)} گام`) : null,
        nSessions ? el('span', { class: 'badge badge--neutral' }, `${fa(nSessions)} جلسهٔ آماده`) : null,
        (!nSteps && !nSessions) ? el('span', { class: 'badge badge--neutral' }, 'بدون گام آماده') : null
      ),
      el('div', { class: 'clx-tpl__act' },
        el('button', {
          class: 'btn btn--primary btn--sm',
          onclick: () => openTemplatePathModal({ student, refresh, presetKey: t.key })
        }, icon('zap', 14), 'ساخت مسیر')
      )
    );
  });

  return el('div', { class: 'clx-quickstart' },
    el('div', { class: 'clx-quickstart__title' }, icon('puzzle', 15), 'شروع از قالب — مسیر آماده'),
    el('div', { class: 'clx-quickstart__grid' }, ...cards),
    shown.length < templates.length
      ? el('div', { class: 'cell-sub' }, `${fa(templates.length - shown.length)} قالب فعال دیگر در «مدیریت قالب‌ها» موجود است.`)
      : null
  );
}

/** مودال «ساخت مسیر از قالب» — قالب‌های سیستمی pathway_templates (: پشتیبانی presetKey) */
async function openTemplatePathModal({ student, refresh, presetKey = null }) {
  let templates = [];
  let targets = [];
  try {
    const [tplRes, tgtRes] = await Promise.all([
      api.get('/api/pathway-templates'),
      api.get('/api/clinical-targets')
    ]);
    templates = tplRes.data ?? [];
    targets = tgtRes.data ?? [];
  } catch (err) { toastError(err); return; }
  if (!templates.length) { toast('قالبی فعال نیست'); return; }

  const targetOptions = targets.map((t) => ({ value: t.key, label: `${t.title} — ${t.group === 'clinical' ? 'هدف بالینی' : 'پشتیبان'}` }));

  formModal({
    title: 'ساخت مسیر مداخله از قالب',
    submitLabel: 'ساخت مسیر',
    fields: [
      { name: 'template_key', type: 'select', label: 'قالب مسیر', required: true, placeholder: 'انتخاب کنید…', value: presetKey,
        options: templates.map((t) => ({
          value: t.key,
          label: t.sessions?.length ? `${t.title} — ${fa(t.sessions.length)} جلسهٔ آماده` : t.title
        })),
        hint: 'قالب، گام‌های استاندارد و پروتکل جلسه به جلسهٔ آماده را می‌سازد.' },
      { name: 'target_key', type: 'select', label: 'هدف درمانی (الزامی برای قالب‌های بی‌هدف)', options: targetOptions, placeholder: 'انتخاب کنید…' },
      { name: 'note', type: 'textarea', label: 'یادداشت (اختیاری)', rows: 2 }
    ],
    onSubmit: async (vals) => {
      if (!vals.template_key) { toast('قالب مسیر را انتخاب کنید'); return false; }
      const tpl = templates.find((t) => t.key === vals.template_key);
      if (tpl && !tpl.targetKey && !vals.target_key) {
        toast('این قالب هدف پیش‌فرض ندارد — هدف درمانی را انتخاب کنید'); return false;
      }
      try {
        await api.post(`/api/students/${student.id}/clinical-paths`, {
          template_key: vals.template_key,
          target_key: vals.target_key || null,
          note: vals.note || null
        });
        toast('مسیر از قالب ساخته شد — در فهرست پایین بازبینی/فعال‌سازی کنید', 'success');
        refresh();
        return true;
      } catch (err) { toastError(err); return false; }
    }
  });
}

// ───────── پروتکل جلسه به جلسه — UI قالب‌ساز به تب مستقل «مدیریت قالب‌ها» (views/templates.js, ) منتقل شد ─────────

/** — نوار مداخله — پیشرفت سگمنت‌های مسیر (گام‌های قالب) */
function pathBand(p) {
  const steps = p.steps ?? [];
  if (!steps.length) return null;
  const doneCount = steps.filter((s) => s.doneAt).length;
  return el('div', { class: 'path-band', role: 'progressbar', title: `نوار مداخله — ${fa(doneCount)} از ${fa(steps.length)} سگمنت` },
    ...steps.map((s) => el('div', {
      class: `path-band__seg${s.doneAt ? ' is-done' : ''}`,
      title: `${s.title}${s.doneAt ? ' — انجام‌شده' : ''}`
    }))
  );
}

/** — برنامهٔ جلسه به جلسه (بدنهٔ نوار مداخلهٔ توانبخشی) */
function pathSessionsBlock(p, { student, canDecide, refresh }) {
  const sessions = p.sessions ?? [];
  const planned = sessions.filter((s) => s.status === 'planned');
  const canManage = canDecide && p.status !== 'closed';
  const isLearningBlank = p.templateKey === LEARNING_BLANK_TEMPLATE_KEY;

  const STATUS_BADGE = {
    planned: 'badge--info',
    done: 'badge--success',
    skipped: 'badge--neutral'
  };
  const STATUS_LABEL = { planned: 'برنامه‌ریزی‌شده', done: 'انجام‌شده', skipped: 'رد‌شده' };

  const addBtn = canManage
    ? el('button', {
        class: 'btn btn--soft btn--sm',
        onclick: () => {
          formModal({
            title: `افزودن جلسهٔ ${fa(sessions.length + 1)} به برنامه`,
            submitLabel: 'افزودن جلسه',
            fields: [
              { name: 'title', type: 'text', label: 'عنوان جلسه', required: true, placeholder: 'مثلاً: جلسهٔ ۱ — آشنایی و خط‌مایهٔ خواندن' },
              { name: 'plan', type: 'textarea', label: 'هدف جلسه', rows: 2, placeholder: 'هدف کلی جلسه…' },
              { type: 'heading', label: 'پیوست‌های جلسه — هر کدام را که لازم است پر کنید' },
              ...SESSION_ITEM_TYPES.map((t) => ({
                name: `item_${t.key}`, type: 'textarea', label: t.label, rows: 2,
                placeholder: t.placeholder, span: 2,
                // فیلد تمرین: دکمهٔ «از بانک تمرین» کنار برچسب
                // فیلد رویداد: دکمهٔ «افزودن رویداد» (فرم/پرسش‌نامه از رویدادساز) کنار برچسب
                ...(t.key === 'exercise' ? { extra: (ta) => bankPickButton({ onPick: (ex) => appendExerciseToTextarea(ta, ex.title) }) } : {}),
                ...(t.key === 'event' ? { extra: (ta) => eventPickButton({ onPick: (t2) => appendEventToTextarea(ta, t2.title) }) } : {})
              }))
            ],
            onSubmit: async (vals) => {
              if (!vals.title?.trim() || vals.title.trim().length < 2) { toast('عنوان جلسه را بنویسید'); return false; }
              const items = SESSION_ITEM_TYPES
                .map((t) => ({ type: t.key, text: (vals[`item_${t.key}`] ?? '').trim() }))
                .filter((it) => it.text);
              try {
                await api.post(`/api/clinical-paths/${p.id}/sessions`, { title: vals.title.trim(), plan: vals.plan || null, items });
                toast('جلسه به برنامه اضافه شد', 'success');
                refresh();
                return true;
              } catch (err) { toastError(err); return false; }
            }
          });
        }
      }, icon('plus', 14), 'افزودن جلسه')
    : null;

  /** ویرایش جلسه — عنوان/هدف + آیتم‌های پیوست */
  const openEditSessionModal = (s) => {
    const current = Object.fromEntries((s.items ?? []).map((it) => [it.type, it.text]));
    formModal({
      title: `ویرایش جلسهٔ ${fa(s.ord)}`,
      submitLabel: 'ذخیره',
      fields: [
        { name: 'title', type: 'text', label: 'عنوان جلسه', required: true, value: s.title },
        { name: 'plan', type: 'textarea', label: 'هدف جلسه', rows: 2, value: s.plan ?? '' },
        ...SESSION_ITEM_TYPES.map((t) => ({
          name: `item_${t.key}`, type: 'textarea', label: t.label, rows: 2,
          value: current[t.key] ?? '', placeholder: t.placeholder, span: 2,
          // فیلد تمرین: دکمهٔ «از بانک تمرین» کنار برچسب
          // فیلد رویداد: دکمهٔ «افزودن رویداد» (فرم/پرسش‌نامه از رویدادساز) کنار برچسب
          ...(t.key === 'exercise' ? { extra: (ta) => bankPickButton({ onPick: (ex) => appendExerciseToTextarea(ta, ex.title) }) } : {}),
          ...(t.key === 'event' ? { extra: (ta) => eventPickButton({ onPick: (t2) => appendEventToTextarea(ta, t2.title) }) } : {})
        }))
      ],
      onSubmit: async (vals) => {
        if (!vals.title?.trim() || vals.title.trim().length < 2) { toast('عنوان جلسه را بنویسید'); return false; }
        const items = SESSION_ITEM_TYPES
          .map((t) => ({ type: t.key, text: (vals[`item_${t.key}`] ?? '').trim() }))
          .filter((it) => it.text);
        try {
          await api.patch(`/api/clinical-paths/${p.id}/sessions/${s.id}`, { title: vals.title.trim(), plan: vals.plan || null, items });
          toast('جلسه به‌روزرسانی شد', 'success');
          refresh();
          return true;
        } catch (err) { toastError(err); return false; }
      }
    });
  };

  const rows = sessions.map((s) =>
    el('div', { class: `path-session is-${s.status}` },
      el('span', { class: 'path-session__ord' }, fa(s.ord)),
      el('div', { class: 'path-session__main' },
        el('div', { class: 'path-session__title' }, s.title,
          el('span', { class: `badge ${STATUS_BADGE[s.status] ?? 'badge--neutral'}` }, STATUS_LABEL[s.status] ?? s.status)),
        s.plan ? el('div', { class: 'cell-sub' }, s.plan) : null,
        (s.items ?? []).length
          ? el('div', { class: 'path-session__items' },
              ...(s.items ?? []).map((it) =>
                el('span', { class: `path-session__item path-session__item--${it.type}` },
                  el('b', {}, `${SESSION_ITEM_LABELS[it.type] ?? it.type}:`), ' ', it.text)))
          : null,
        s.status === 'done' && s.doneAt ? el('div', { class: 'cell-sub' }, `انجام: ${formatJalaliDateTime(s.doneAt)}`) : null,
        s.note ? el('div', { class: 'cell-sub' }, `یادداشت: ${s.note}`) : null
      ),
      canManage
        ? el('div', { class: 'path-session__ops' },
            el('button', { class: 'btn btn--ghost btn--sm', title: 'ویرایش جلسه و پیوست‌ها',
              onclick: () => openEditSessionModal(s) }, icon('edit', 13)),
            s.status !== 'done'
              ? el('button', { class: 'btn btn--ghost btn--sm', title: 'علامت‌زدن انجام‌شده',
                  onclick: async () => { try { await api.patch(`/api/clinical-paths/${p.id}/sessions/${s.id}`, { status: 'done' }); refresh(); } catch (err) { toastError(err); } } }, icon('check', 13))
              : el('button', { class: 'btn btn--ghost btn--sm', title: 'برگشت به برنامه‌ریزی‌شده',
                  onclick: async () => { try { await api.patch(`/api/clinical-paths/${p.id}/sessions/${s.id}`, { status: 'planned' }); refresh(); } catch (err) { toastError(err); } } }, icon('undo', 13)),
            el('button', { class: 'btn btn--ghost btn--sm', title: 'حذف جلسه',
              onclick: async () => {
                const ok = await confirmModal({ title: `حذف جلسهٔ ${fa(s.ord)}`, message: `«${s.title}» از برنامهٔ جلسه به جلسه حذف شود؟`, confirmLabel: 'حذف' });
                if (!ok) return;
                try { await api.del(`/api/clinical-paths/${p.id}/sessions/${s.id}`); refresh(); } catch (err) { toastError(err); }
              } }, icon('trash', 13))
          )
        : null
    )
  );

  const emptyLine = sessions.length === 0
    ? (isLearningBlank
        ? el('div', { class: 'cell-sub path-session__placeholder' },
            'خالی — درمانگر بر حسب پایهٔ تحصیلی و نیم‌رخ وکسلر ۴ جلسات را تعیین می‌کند.')
        : el('div', { class: 'cell-sub' }, 'جلسه‌ای ثبت نشده است.'))
    : null;

  const nextLine = planned.length
    ? el('div', { class: 'cell-sub path-session__next' },
        icon('clock', 13), `جلسهٔ بعد: ${fa(planned[0].ord)} — ${planned[0].title}`)
    : null;

  return el('div', { class: 'path-sessions' },
    el('div', { class: 'clx-sub__title' }, 'برنامهٔ جلسه به جلسه',
      sessions.length ? el('span', { class: 'badge badge--neutral' }, `${fa(sessions.length)} جلسه`) : null,
      addBtn),
    emptyLine,
    ...(rows.length ? rows : []),
    nextLine
  );
}

function pathCard(p, { student, canDecide, refresh }) {
  const isActive = p.status === 'active';
  const doneCount = (p.steps ?? []).filter((s) => s.doneAt).length;

  const stepsBlock = (p.steps ?? []).length
    ? el('div', { class: 'clx-steps' },
        el('div', { class: 'clx-sub__title' }, isActive
          ? `چک‌لیست مراحل — ${fa(doneCount)} از ${fa(p.steps.length)} انجام شده:`
          : 'مراحل استاندارد این هدف:'),
        ...(p.steps ?? []).map((s) => {
          const done = Boolean(s.doneAt);
          if (!isActive) {
            return el('div', { class: 'clx-step' },
              el('span', { class: `clx-step__dot${done ? ' is-done' : ''}` }, done ? icon('check', 12) : null),
              el('span', { class: 'clx-step__title' }, s.title)
            );
          }
          return el('button', {
            class: `clx-step clx-step--btn${done ? ' is-done' : ''}`,
            onclick: async () => {
              try {
                await api.post(`/api/clinical-paths/${p.id}/steps/toggle`, { step_key: s.key });
                refresh();
              } catch (err) { toastError(err); }
            },
            title: s.hint ? `${s.title} — ${s.hint}` : (done ? 'لغو علامت' : 'علامت‌زدن به‌عنوان انجام‌شده')
          },
            el('span', { class: 'clx-step__dot' }, done ? icon('check', 12) : null),
            el('span', { class: 'clx-step__title' }, s.title),
            done ? el('span', { class: 'cell-sub' }, formatJalaliDateTime(s.doneAt)) : null
          );
        })
      )
    : null;

  const engineLine = p.engineHypothesis
    ? el('div', { class: 'cell-sub' }, `فرضیهٔ موتور هنگام ثبت: ${p.engineHypothesis.targetTitle} — اطمینان ${p.engineHypothesis.confidence} (وزن ${fa(p.engineHypothesis.score)})`)
    : el('div', { class: 'cell-sub' }, 'هدف دستی درمانگر — بدون فرضیهٔ موتور');

  const decisionLine = p.decision
    ? el('div', { class: 'clx-decision' },
        el('span', { class: 'badge badge--accent' }, `تصمیم: ${DECISION_LABEL[p.decision.action] ?? p.decision.action}`),
        el('span', { class: 'cell-sub' }, `${p.decision.byName} · ${formatJalaliDateTime(p.decision.at)}`),
        p.decision.note ? el('div', { class: 'clx-decision__note' }, `«${p.decision.note}»`) : null
      )
    : null;

  const footer = [];
  if (isActive) {
    footer.push(el('button', {
      class: 'btn btn--primary btn--sm',
      onclick: () => openExerciseSendModal({ student, onSent: refresh })
    }, icon('zap', 15), 'ارسال تمرین با بله'));
    if (p.exerciseIds?.length) {
      footer.push(el('span', { class: 'cell-sub' }, `${fa(p.exerciseIds.length)} تمرین روی مسیر ثبت است`));
    }
  }
  const decisions = decisionButtons(p, { student, refresh, canDecide });
  if (decisions) footer.push(decisions);

  return el('div', { class: `card clx-path${isActive ? ' clx-path--active' : ''}` },
    el('div', { class: 'card__body' },
      el('div', { class: 'clx-hyp__head' },
        el('strong', { class: 'clx-hyp__title' }, icon('target', 16), p.targetTitle),
        el('span', { class: `badge ${PATH_STATUS_BADGE[p.status] ?? 'badge--neutral'}` }, PATH_STATUS_LABEL[p.status] ?? p.status),
        p.templateTitle ? el('span', { class: 'badge badge--info', title: 'این مسیر از قالب سیستمی ساخته شده است (m97)' }, `قالب: ${p.templateTitle}`) : null,
        el('span', { class: 'cell-sub' }, `ثبت: ${formatJalaliDateTime(p.createdAt)}`)
      ),
      engineLine,
      decisionLine,
      p.templateKey ? pathBand(p) : null,
      stepsBlock,
      pathSessionsBlock(p, { student, canDecide, refresh }),
      footer.length ? el('div', { class: 'clx-actions' }, ...footer) : null
    )
  );
}

// ───────── رندر اصلی تب ─────────

/**
 * تب «تفسیر بالینی» پروفایل — محاسبهٔ زندهٔ موتور + پروتکل قضاوت.
 * data.refresh داخلی است (فقط این تب دوباره بار می‌شود نه کل پروفایل).
 */
export async function renderClinicalTab(box, { student }) {
  const canDecide = canDecideFor(student);

  async function load() {
    box.replaceChildren(loadingState());

    let insights = null;
    let paths = [];
    let anamnesisTypeId = null;
    let typesById = new Map(); // — کلید → تعریف نوع (فرم‌های نتایج/وکسلر/توانبخشی)
    let gates = null; // — گیت‌های شناسایی + فاز/پروتکل
    let otProfile = null; // — پروفایل چک‌لیست ۷ حیطه‌ای
    try {
      const [insRes, pathRes, gatesRes] = await Promise.all([
        api.get(`/api/students/${student.id}/clinical-insights`),
        api.get(`/api/students/${student.id}/clinical-paths`).catch(() => ({ data: [] })),
        api.get(`/api/students/${student.id}/clinical-gates`).catch(() => null)
      ]);
      insights = insRes.data;
      paths = pathRes.data ?? [];
      gates = gatesRes?.data ?? null;
      // پروفایل مهارتی: در فاز شناسایی (ورودی گیت ۴) و پروتکل کاردرمانی ذهنی لازم است
      // چک‌لیست مهارتی فقط مسیر توانبخشی/کاردرمانی ذهنی — مسیر یادگیری آن را نمی‌بیند
      const hideOtForLearning = student.pathway === 'learning' && gates?.protocol !== 'mental_ot';
      if (!hideOtForLearning && (!gates || gates.phase === 'identification' || gates.protocol === 'mental_ot')) {
        otProfile = await api.get(`/api/students/${student.id}/ot/profile`).then((r) => r.data).catch(() => null);
      }
      // شناسهٔ فرم شرح‌حال برای گام ۱ مسیر ارزیابی (اگر فعال باشد)
      try {
        const types = (await api.get('/api/case-events/types?active=true')).data ?? [];
        anamnesisTypeId = types.find((t) => t.key === ANAMNESIS_KEY)?.id ?? null;
        typesById = new Map(types.map((t) => [t.key, t]));
      } catch { anamnesisTypeId = null; }
    } catch (err) {
      box.replaceChildren(emptyState({
        iconName: 'shield',
        title: 'تفسیر بالینی در دسترس نیست',
        hint: err?.message ?? 'خطای نامشخص'
      }));
      return;
    }

    const refresh = () => { load(); };
    const hasData = (insights.ranked?.length ?? 0) > 0 || (insights.criteria?.length ?? 0) > 0;

    // صورت‌بندی پرونده: خودش fetch و خطا را می‌بلعد (null = کارت حذف)
    const formulation = await formulationSection({ student });

    // کارت کامل نیم‌رخ وکسلر — از گیت‌های شناسایی (خروجی گسترش‌یافتهٔ wechslerSummaryOf)
    // null = دادهٔ وکسلری معنادار نیست؛ الگوی null-safe مثل formulation/flagsCard
    const wechslerCard = wechslerProfileBlock({ summary: gates?.wechslerSummary ?? null });

    // ── فاز و پروتکل از گیت‌ها؛ fallback: اگر گیت‌ها نیامد، فاز شناسایی ──
    const protocol = gates?.protocol ?? null;
    const phase = protocol ? 'intervention' : 'identification';

    // ── نوار بالای تب — تاریخ تولد/سن/پایه از پروفایل به تفسیر بالینی متصل شد ──
    const ageLine = ageLineFromBirthDate(student.birthDate);
    const profileChips = [
      student.birthDate ? el('span', { class: 'badge badge--neutral' }, `تولد: ${formatStoredJalaliNumeric(student.birthDate)}`) : null,
      ageLine ? el('span', { class: 'badge badge--neutral' }, `سن: ${ageLine}`) : null,
      student.grade ? el('span', { class: 'badge badge--neutral' }, `پایه: ${gradeLabel(student.grade)}`) : null
    ].filter(Boolean);
    const toolbar = el('div', { class: 'clx-toolbar' },
      el('div', {},
        el('div', { class: 'card__title', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          icon('brain', 17), 'تفسیر بالینی'),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
          el('span', { class: `badge ${phase === 'intervention' ? 'badge--success' : 'badge--info'}` },
            icon('compass', 12), phase === 'intervention' ? 'فاز مداخله' : 'فاز شناسایی'),
          pathwayChip(student.pathway) ?? el('span', { class: 'badge badge--neutral', title: 'مسیر پرونده هنوز تعیین نشده — پیش‌فرض: مسیر اختلال یادگیری' }, 'مسیر: تعیین‌نشده'),
          protocolChip(protocol),
          ...profileChips,
          canEditPathway(student)
            ? el('button', { class: 'btn btn--ghost btn--sm', style: { padding: '1px 8px' }, onclick: () => openPathwayModal(student, refresh) }, icon('edit', 12), 'تغییر مسیر')
            : null
        ),
        el('div', { class: 'cell-sub' }, `آخرین محاسبه: ${formatJalaliDateTime(insights.generatedAt)}`)
      ),
      el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
        // دکمهٔ اقدام داخل تب (توصیهٔ متخصص UX: تبِ نتیجه، دکمهٔ حرکت دارد)
        el('button', {
          class: 'btn btn--primary btn--sm',
          onclick: () => openCaseEventForm({ student, onSaved: refresh })
        }, icon('send', 15), 'ارسال فرم به خانواده یا معلم'),
        el('button', { class: 'btn btn--ghost btn--sm', onclick: refresh }, icon('refresh', 15), 'به‌روزرسانی'),
        el('button', {
          class: 'btn btn--soft btn--sm',
          onclick: () => copyText(insights.narrative, 'خلاصهٔ سه‌بخشی کپی شد')
        }, icon('copy', 15), 'کپی خلاصه')
      )
    );

    // ── کارت مسیر ارزیابی — در فاز مداخلهٔ یادگیری/دیرآموز نقش «پایش» دارد ──
    const journey = journeyCard({ student, insights, paths, anamnesisTypeId, refresh });

    // ── خلاصهٔ سه‌بخشی (پلن §۶) + زمینهٔ تفسیر (جمعیت‌شناختی × خروجی موتور) ──
    const narrativeCard = el('div', { class: 'card' },
      el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('message', 16), 'خلاصهٔ سه‌بخشی — چه دیدیم / یعنی چه / گام بعدی')),
      el('div', { class: 'card__body' },
        interpretationContext({ student, gates }),
        el('div', { class: 'clx-narrative' }, insights.narrative)
      )
    );

    // ── پرچم‌های خط قرمز (ارجاع فوری) ──
    const flagsCard = (insights.referralFlags ?? []).length
      ? el('div', { class: 'clx-flags' },
          ...insights.referralFlags.map((f) => el('div', { class: 'clx-flag' }, icon('alert', 15), el('span', {}, f))))
      : null;

    // ── فرضیه‌ها ──
    const hypotheses = hasData
      ? el('div', { class: 'clx-section' },
          el('div', { class: 'clx-section__title' }, icon('sparkles', 16), 'فرضیه‌ها — به ترتیب شواهد'),
          insights.ranked.length
            ? el('div', { class: 'clx-hyps' },
                insights.ranked.map((h, i) => hypothesisCard(h, i + 1, { student, paths, canDecide, refresh })))
            : emptyState({
                iconName: 'compass',
                title: 'هنوز فرضیه‌ای ساخته نشده است',
                hint: (insights.nextActions ?? [])[0] ?? 'با ارسال چک‌لیست به خانواده و معلم شروع کنید.'
              })
        )
      : null;

    // ── جدول ملاک‌های DSM ──
    const crits = hasData ? criteriaGroups(insights.criteria, insights.ranked) : null;
    const critsSection = crits
      ? el('div', { class: 'clx-section' },
          el('div', { class: 'clx-section__title' }, icon('clipboard', 16), 'جدول ملاک‌های DSM-5-TR — چهارحالته'),
          crits)
      : null;

    // ── ناهم‌رأیی / گپ اطلاعاتی / پوشش داده ──
    const metaCard = (insights.discrepancies?.length || insights.nextActions?.length || insights.dataCoverage?.seenTitles?.length)
      ? el('div', { class: 'card' },
          el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('info', 16), 'بررسی‌های تکمیلی')),
          el('div', { class: 'card__body' },
            insights.discrepancies?.length ? el('div', { class: 'clx-sub' },
              el('div', { class: 'clx-sub__title' }, icon('alert', 14), 'ناهم‌رأیی خانه و مدرسه:'),
              iconList(insights.discrepancies, 'clock', 'warn')) : null,
            insights.nextActions?.length ? el('div', { class: 'clx-sub' },
              el('div', { class: 'clx-sub__title' }, icon('compass', 14), 'گام بعدی:'),
              iconList(insights.nextActions, 'check', 'ok')) : null,
            insights.dataCoverage?.seenTitles?.length ? el('div', { class: 'clx-sub' },
              el('div', { class: 'clx-sub__title' }, icon('clip', 14), 'شواهد موجود:'),
              el('div', { class: 'clx-chips' }, insights.dataCoverage.seenTitles.map((t) =>
                el('span', { class: 'badge badge--neutral' }, t))))
              : el('div', { class: 'cell-sub' }, 'هنوز ابزاری ثبت نشده است.')
          )
        )
      : null;

    // ── مسیرهای مداخله + قالب‌محور: بدون مسیر → کارت‌های «شروع از قالب» ──
    const emptyPathLine = paths.length
      ? null
      : el('div', { class: 'cell-sub' }, hasData
          ? 'مسیری ثبت نشده — از قالب‌های آماده یا فرضیه‌ها بسازید.'
          : 'مسیری ثبت نشده است.');
    const quickStart = paths.length || !canDecide
      ? null
      : await templateQuickStart({ student, refresh, canDecide, protocol });
    const pathsSection = el('div', { class: 'clx-section' },
      el('div', { class: 'clx-section__title' }, icon('target', 16), 'مسیر مداخله و تصمیم شما',
        canDecide
          ? el('span', { style: { marginInlineStart: 'auto', display: 'inline-flex', gap: '6px', flexWrap: 'wrap' } },
              el('button', {
                class: 'btn btn--ghost btn--sm',
                onclick: () => { location.hash = '#/templates'; }
              }, icon('grid', 14), 'مدیریت قالب‌ها'),
              el('button', {
                class: 'btn btn--soft btn--sm',
                onclick: () => openTemplatePathModal({ student, refresh })
              }, icon('puzzle', 14), 'ساخت مسیر از قالب'))
          : null),
      paths.length
        ? el('div', { class: 'clx-paths' }, paths.map((p) => pathCard(p, { student, canDecide, refresh })))
        : emptyPathLine,
      quickStart
    );

    // ── پانویس خط قرمز (پلن §۱ — بدون استثنا) ──
    const disclaimer = el('div', { class: 'clx-disclaimer' }, icon('shield', 15), el('span', {}, insights.disclaimer));

    // ── کارت‌های مشترک هر دو فاز ──
    const resultsCard = await latestResultsCard({ student, typesById, refresh });
    const otCard = (otProfile && (student.pathway !== 'learning' || gates?.protocol === 'mental_ot'))
      ? otChecklistCard({ student, profile: otProfile, canDecide, refresh, scrollTarget: true })
      : null;

    // موتور تاشو — برای پروتکل‌های غیر یادگیری (افتراق و هم‌پوشانی)
    // m133: narrativeCard دیگر داخل موتور تاشو نیست — خودش مستقیم پس از formulation می‌آید
    const engineDetails = () => el('details', { class: 'clx-engine-toggle' },
      el('summary', { class: 'clx-section__title', style: { cursor: 'pointer', listStyle: 'revert' } },
        icon('sparkles', 16), 'تفسیر استاندارد — موتور اختلال یادگیری (برای افتراق و هم‌پوشانی)'),
      el('div', { style: { marginTop: 'var(--sp-3)' } },
        hypotheses,
        critsSection,
        metaCard
      )
    );

    // ════════ فاز ۱ — شناسایی: استپر مرحله‌ای + پشتیبان تصمیم ════════
    if (phase === 'identification') {
      const stepperCard = gates
        ? identificationStepper({ student, gates, typesById, anamnesisTypeId, canDecide, refresh })
        : null;

      box.replaceChildren(
        el('div', { class: 'clx' },
          toolbar,
          stepperCard,
          formulation,
          wechslerCard,
          flagsCard,
          otCard,
          narrativeCard,
          hypotheses,
          critsSection,
          metaCard,
          resultsCard,
          pathsSection,
          disclaimer
        )
      );
      return;
    }

    // ════════ فاز ۲ — مداخله: UI مخصوص پروتکل فعال ════════
    const protoCard = protocolCard(protocol);

    if (protocol === 'mental_ot') {
      // کاردرمانی ذهنی: چک‌لیست ۷ حیطه‌ای ابزار اصلی جلسات است؛ موتور تاشو برای افتراق
      box.replaceChildren(
        el('div', { class: 'clx' },
          toolbar,
          protoCard,
          formulation,
          wechslerCard,
          narrativeCard,
          otCard,
          resultsCard,
          pathsSection,
          engineDetails(),
          disclaimer
        )
      );
      return;
    }

    if (protocol === 'rehab') {
      // توانبخشی ذهنی-جسمی: ارزیابی‌ها و جلسات مخصوص توانبخشی؛ موتور تاشو برای افتراق
      box.replaceChildren(
        el('div', { class: 'clx' },
          toolbar,
          protoCard,
          formulation,
          wechslerCard,
          narrativeCard,
          resultsCard,
          pathsSection,
          engineDetails(),
          disclaimer
        )
      );
      return;
    }

    // learning / slow_learner — چیدمان با پشتیبانی مسیر ارزیابی (پایش پروب‌ها)
    box.replaceChildren(
      el('div', { class: 'clx' },
        toolbar,
        protoCard,
        formulation,
        wechslerCard,
        journey,
        flagsCard,
        narrativeCard,
        hypotheses,
        critsSection,
        metaCard,
        resultsCard,
        pathsSection,
        disclaimer
      )
    );
  }

  await load();
}
