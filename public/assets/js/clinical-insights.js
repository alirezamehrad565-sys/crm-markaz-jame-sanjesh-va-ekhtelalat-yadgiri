/**
 * مسیر بالینی — قالب‌ساز و جلسات مداخله
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// clinical-insights.js — تب «تفسیر بالینی» پروفایل دانش‌آموز — بازسازی کامل m135 (آکاردئون ۶ مرحله‌ای)
// ساختار (UX-SPEC): نوار باریک (clxacc-toolbar) + فلوی عمودی شش <details> (clxacc-flow) + یک disclaimer.
//   ۱ شرح‌حال → ۲ چک‌لیست‌های خانواده و معلم (+ شک بالینی) → ۳ وکسلر ۴ (افشای تدریجی؛ شش آکاردئون تودرتو
//   همیشه‌بسته) → ۴ ارزیابی عملکردی → ۵ جمع‌بندی تشخیصی (+ پیوند با سایر اطلاعات) → ۶ ورود به قالب مداخله.
// یک چیدمان برای هر دو فاز (P1): فاز فقط گام بازِ پیش‌فرض، بج‌ها و CTAها را عوض می‌کند.
// قرارداد mount دست‌نخورده: renderClinicalTab(box, {student}) از views/student-profile.js.
// بودجهٔ GET ثابت (§8.1): ۳ موازی + ترتیبی؛ پاسخ واحد /case-events بین مراحل ۱/۲/۴ مشترک است.
// خط قرمز پلن §۱: خروجی موتور همیشه «غربالگری/فرضیه» است — «هدف درمانی نهایی» فقط با تأیید
// درمانگر روی مسیر مداخله (active) ثبت می‌شود؛ متن موتور هرگز برای خانواده/معلم ارسال نمی‌شود.

import { api } from './api.js';
import { el, icon, confirmModal, formModal, toast, toastError, emptyState, loadingState } from './ui.js';
import { fa, formatJalaliDateTime, formatStoredJalaliNumeric, tehranTodayYmd, toJalali, gradeLabel } from './format.js';
import { session } from './state.js';
import { openExerciseSendModal } from './exercise-send.js';
import { bankPickButton, appendExerciseToTextarea } from './exercise-pick.js'; // — افزودن تمرین از بانک به جلسه
import { eventPickButton, appendEventToTextarea } from './event-pick.js'; // — افزودن رویداد (فرم/پرسش‌نامه) به جلسه
import { openCaseEventForm } from './case-events.js';
import { pathwayChip, canEditPathway, openPathwayModal } from './session-type.js'; // — مسیر پرونده
import { otChecklistCard, protocolChip, protocolCard, NEEDS_KEY, OT_SESSION_KEY } from './ot-checklist.js'; // — فلو دوفازی شناسایی→مداخله (openNeedsModal در کارت جمع‌بندی)
import { synthesisSection, fetchFormulation } from './case-formulation.js'; // — کارت واحد جمع‌بندی تشخیصی (m134)
import { wechslerProfileBlock, wechslerSourceBadge, connectionsSection, WEAKEST_FA } from './wechsler-profile.js'; // — نیم‌رخ وکسلر (m133+m134) + «پیوند با سایر اطلاعات» (m135 → مرحلهٔ ۵)
// محتوای ثابت (کلیدهای ابزار، برچسب‌ها، متن مراحل) از ماژول محتوا
import {
  ANAMNESIS_KEY,
  SCREEN_KEYS,
  SPECIFIC_KEYS,
  PROBE_KEYS,
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
  STAGE2_META,
  GATE_GLOSS,
  SUSPICION_CONTENT,
  CONTEXT_META,
  SYNTHESIS_META
} from './clinical-content.js';

/** آیا کاربرِ فعلی حق تصمیم دارد؟ (پلن §۷ — مدیر یا درمانگرِ مسئول؛ منشی فقط مشاهده) */
function canDecideFor(student) {
  const u = session.user;
  if (!u) return false;
  if (u.role === 'manager') return true;
  return u.role === 'therapist' && Boolean(student.ownerStaffId) && student.ownerStaffId === u.staffId;
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

// ───────── m135 — سازندهٔ فلوی آکاردئونی (clxacc) — جایگزین کارت‌های همیشه‌باز (§3/§5) ─────────

/** کلاس حالت <details> — ماتریس §5 */
function stateClassOf(state) {
  if (state === 'done' || state === 'needsDone') return 'is-done';
  if (state === 'current') return 'is-current';
  if (state === 'locked' || state === 'noData') return 'is-locked';
  return 'is-todo';
}

/** نشان وضعیت سربرگ — واژگان تک‌منبع STAGE2_META.badges (بازنویسی stageStatusBadge قدیم) */
function clxaccStateBadge(state) {
  const B = STAGE2_META.badges;
  switch (state) {
    case 'done': return el('span', { class: 'badge badge--success' }, B.done);
    case 'needsDone': return el('span', { class: 'badge badge--accent' }, B.needsDone);
    case 'current': return el('span', { class: 'badge badge--info' }, B.current);
    case 'locked': return el('span', { class: 'badge badge--neutral' }, B.locked);
    case 'noData': return el('span', { class: 'badge badge--neutral' }, B.wechslerNoData);
    default: return el('span', { class: 'badge badge--neutral' }, B.todo);
  }
}

/**
 * سازندهٔ یک بخش آکاردئون (سربرگ summary + بدنه) — آناتومی §3.
 * ویژگی open هنگام ساخت ست می‌شود (بدون فلش پس از paint — §8.3)؛ aria-expanded سربرگ آینهٔ open است
 * و با شنوندهٔ واگذارشدهٔ toggle هم‌گام می‌ماند (§8.4).
 */
function clxaccSection({ key, num, title, glance, chips = [], state = 'todo', cta = null, body = [], open = false }) {
  const summary = el('summary', { class: 'clxacc__head', 'aria-expanded': open ? 'true' : 'false' },
    num != null ? el('span', { class: 'clxacc__num', 'aria-hidden': 'true' }, fa(num)) : null,
    el('span', { class: 'clxacc__heading' },
      el('strong', { class: 'clxacc__title' }, title),
      glance ? el('span', { class: 'clxacc__glance' }, glance) : null),
    el('span', { class: 'clxacc__chips' }, clxaccStateBadge(state), ...(chips ?? []).filter(Boolean)),
    cta ? el('span', { class: 'clxacc__act' }, cta) : null,
    el('span', { class: 'clxacc__chev', 'aria-hidden': 'true' }, icon('chevL', 15)));
  return el('details', {
    class: `clxacc ${stateClassOf(state)}`,
    id: `clxacc-${key}`,
    dataset: { clxacc: key, clxaccLevel: 'top' },
    open: open ? true : null
  },
    summary,
    el('div', { class: 'clxacc__body' }, ...body.filter(Boolean)));
}

// ───────── ماندگاری وضعیت باز/بسته (§5 — فقط idها؛ هرگز محتوای بالینی؛ هرگز localStorage) ─────────

const openStateKey = (studentId) => `clxacc.open:${studentId}`;

function loadOpenIds(studentId) {
  try {
    const arr = JSON.parse(sessionStorage.getItem(openStateKey(studentId)) ?? '[]');
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

function saveOpenIds(studentId, ids) {
  try { sessionStorage.setItem(openStateKey(studentId), JSON.stringify(ids)); } catch { /* حالت خصوصی مرورگر */ }
}

/** آینه‌کردن aria-expanded سربرگ با وضعیت details (§8.4 — برای صفحه‌خوان‌های قدیمی) */
function syncAria(details) {
  const s = details.querySelector(':scope > summary');
  if (s) s.setAttribute('aria-expanded', details.open ? 'true' : 'false');
}

// ───────── بلوک تصمیم شک بالینی — بدنهٔ مرحلهٔ ۲ (بدنه تغییر نکرده — MOVE از استپر حذف‌شده) ─────────

/**
 * — بلوک «نقطهٔ تصمیم شک بالینی» — بین مرحلهٔ ۲ (چک‌لیست‌ها) و مرحلهٔ ۳ (وکسلر):
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

/**
 * — بلوک «زمینهٔ تفسیر» — بدنهٔ مرحلهٔ ۳ (بدنه تغییر نکرده — m134)
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
 * — دکمهٔ اقدام هر گیت — CTA سربرگ و بدنهٔ آکاردئون‌ها
 * گیت «needs» این‌جا دکمه ندارد: اقدام اصلی مرحلهٔ ۵ دکمهٔ داخل کارت جمع‌بندی است (تک‌منبع).
 */
function gateActionOf(g, { student, gates, typesById, anamnesisTypeId, canDecide, refresh }) {
  if (!g) return null;
  const typeIdOf = (key) => typesById.get(key)?.id ?? null;
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
      // گیت مرحلهٔ ۴ وابسته به مسیر: یادگیری → چک‌لیست‌های خواندن/نوشتن/ریاضی؛ توانبخشی → چک‌لیست مهارتی
      if (gates?.pathway === 'learning') {
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
    default:
      return null;
  }
}

/**
 * — «پیوند با سایر اطلاعات» (m134 — خواستهٔ اصلی کاربر: وکسلر متصل به بقیهٔ فرم‌ها)
 * خطوط متنی ساخته‌شده از سه منبع؛ رندر آن با connectionsSection در مرحلهٔ ۵ (جمع‌بندی) است (m135).
 * ۱) wechslerLink صورت‌بندی (فرضیهٔ اصلی + شاخص‌ها)  ۲) فرضیه‌های موتور با شواهد وکسلری
 * ۳) حوزه‌های ضعیف وکسلر × سازه‌های برجستهٔ صورت‌بندی.
 */
function wechslerConnections({ formulation, insights, gates }) {
  const lines = [];
  const w = gates?.wechslerSummary ?? null;

  // ۱) صورت‌بندی پرونده — پیوند وکسلر
  const link = formulation?.wechslerLink ?? null;
  if (link) {
    const bits = [];
    if (link.mainNameFa) bits.push(`فرضیهٔ اصلی موتور وکسلر: «${link.mainNameFa}»`);
    if (link.iqValue != null) bits.push(`${link.iqBasis === 'GAI' ? 'GAI' : 'FSIQ'} = ${fa(link.iqValue)}`);
    if ((link.indicesFa ?? []).length) bits.push(link.indicesFa.join(' — '));
    if (bits.length) lines.push(`صورت‌بندی پرونده روی نیم‌رخ وکسلر سوار است: ${bits.join(' · ')}`);
  }

  // ۲) فرضیه‌های موتور که شواهد وکسلری دارند
  for (const h of (insights?.ranked ?? []).slice(0, 3)) {
    const ev = (h.evidenceFa ?? []).find((t) => /وکسلر|هوش|FSIQ|GAI/.test(String(t)));
    if (ev) lines.push(`فرضیهٔ «${h.targetTitle}»: ${ev}`);
  }

  // ۳) هم‌خوانی حوزه‌های ضعیف وکسلر با سازه‌های برجستهٔ صورت‌بندی
  const WEAK_KEYWORDS = {
    language: ['زبان', 'کلام'], attention: ['توجه'], working_memory: ['حافظه'],
    processing_speed: ['سرعت پردازش'], visual_spatial: ['دیداری'], fluid_reasoning: ['استدلال'],
    knowledge: ['دانش'], fine_motor: ['حرکتی'], academic: ['یادگیری', 'تحصیلی'],
    executive: ['اجرایی'], social: ['اجتماعی', 'ارتباطی'], adaptive: ['سازش'], crystallized: ['دانش']
  };
  const elevated = (formulation?.constructs ?? []).filter((c) => c && c.level !== 'پایین');
  const matched = new Set();
  for (const d of (w?.weakDomains ?? [])) {
    const keys = WEAK_KEYWORDS[d] ?? [];
    if (!keys.length) continue;
    const hit = elevated.find((c) => keys.some((k) => String(c.titleFa ?? '').includes(k)));
    if (hit) {
      const key = `${d}:${hit.titleFa}`;
      if (matched.has(key)) continue;
      matched.add(key);
      lines.push(`ضعف وکسلری «${WEAKEST_FA[d] ?? d}» با سازهٔ برجستهٔ «${hit.titleFa}» (سطح ${hit.level}) هم‌خوان است.`);
    }
  }

  return dedupeTexts(lines).slice(0, 6);
}

// ───────── ردیف‌های رویداد مشترک مراحل ۱/۲/۴ (جایگزین latestResultsCard — یک GET مشترک، §8.1) ─────────

// برچسب‌های پایه از ماژول محتوا؛ دو ردیف مختص ot-checklist این‌جا اضافه می‌شود
const RESULTS_LABELS = {
  ...RESULTS_EVENT_LABELS,
  [NEEDS_KEY]: 'نتیجهٔ نیاز ویژه',
  [OT_SESSION_KEY]: 'جلسهٔ کاردرمانی ذهنی'
};

/** نشان وضعیت ثبت رویداد */
const rowStatusBadge = (e) =>
  e.status === 'completed' ? el('span', { class: 'badge badge--success' }, 'ثبت‌شده')
    : e.status === 'draft' ? el('span', { class: 'badge badge--warning' }, 'پیش‌نویس')
      : el('span', { class: 'badge badge--neutral' }, e.status);

/**
 * فهرست ردیف رویداد یک مرحله — از پاسخ واحد /case-events (بدون GET تازه).
 * keys: کلیدهای ابزار؛ cap: سقف ردیف‌های نمایان؛ expandable: مازاد با «{n} مورد دیگر…» تاشو می‌شود (§4).
 * بدون CTA عمومی — اقدام هر مرحله فقط CTA خودِ مرحله است (CONTENT-SPEC یافتهٔ ۷).
 */
function eventRowsBlock({ events, typesById, keys, cap = 6, expandable = true }) {
  const wantedIds = new Set(keys.map((k) => typesById.get(k)?.id).filter(Boolean));
  const wantedKeyOf = (typeId) => {
    for (const [k, t] of typesById) if (t.id === typeId) return k;
    return null;
  };
  const mine = (events ?? []).filter((e) => wantedIds.has(e.eventTypeId) && e.status !== 'cancelled');
  if (!mine.length) return { count: 0, node: null };

  const rows = mine.map((e) => {
    const k = wantedKeyOf(e.eventTypeId);
    return el('div', {},
      el('span', { style: { fontWeight: 600, fontSize: 'var(--fs-sm)' } }, e.typeTitle ?? RESULTS_LABELS[k] ?? 'فرم'),
      rowStatusBadge(e),
      el('span', { class: 'cell-sub' }, formatJalaliDateTime(e.occurredAt)),
      e.summary ? el('span', { class: 'cell-sub', style: { flex: 1, minWidth: '160px' } }, e.summary) : null);
  });

  if (!expandable && rows.length > cap) rows.length = cap;
  if (expandable && rows.length > cap) {
    for (const r of rows.slice(cap)) { r.hidden = true; r.setAttribute('data-clx-hidden', '1'); }
    rows.push(el('button', { class: 'clxacc__more btn btn--ghost btn--sm', type: 'button' },
      STAGE2_META.showMoreItems.replace('{n}', fa(rows.length - cap))));
  }
  return { count: mine.length, node: el('div', { class: 'clxacc-rows', dataset: { clxmore: '1' } }, ...rows) };
}

/** چیپ‌های «شواهد موجود» — جفت کانونی عنوان/متن‌خالی (K3/K4) — دو جای رندر: مرحلهٔ ۴ + تاشوی موتور مرحلهٔ ۵ */
function seenChipsBlock(insights) {
  const seenTitles = insights.dataCoverage?.seenTitles ?? [];
  return el('div', { class: 'clx-sub' },
    el('div', { class: 'clx-sub__title' }, icon('clip', 14), SYNTHESIS_META.seenTitle),
    seenTitles.length
      ? el('div', { class: 'clx-chips' }, seenTitles.map((t) => el('span', { class: 'badge badge--neutral' }, t)))
      : el('div', { class: 'cell-sub' }, 'هنوز ابزاری ثبت نشده است.'));
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
            `برای این هدف مسیر «${PATH_STATUS_LABEL[livePath.status]}» ثبت است — تصمیم در مرحلهٔ ۶، فهرست مسیرها.`)
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

// ───────── کارت مسیر مداخله (پروتکل قضاوت §۷) — بدنهٔ مرحلهٔ ۶ ─────────

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

// ───────── مرحلهٔ ۶ — نوار گام‌های استاندارد پروتکل فعال (§3.6 — MOVE از protocolCard) ─────────

/**
 * برچسب فارسی پروتکل — از PROTOCOL_LABELS درون ot-checklist (export نشده؛ دست‌نخورده) استخراج
 * می‌شود تا واژگان «پروتکل …» تک‌منبع بماند؛ پروتکل ناشناخته → خود کلید (دفاعی).
 */
function protocolLabelOf(protoCardNode, protocol) {
  if (!protocol) return null;
  const title = protoCardNode?.querySelector('.card__title')?.textContent ?? '';
  const parts = title.split('—');
  const label = (parts[parts.length - 1] ?? '').trim();
  return label || String(protocol);
}

/**
 * نوار گام‌های استاندارد پروتکل فعال — محتوای بدنهٔ protocolCard بدون کروم کارت (§6: MOVE).
 * متن‌های PROTOCOL_STEPS verbatim از ot-checklist می‌ماند؛ فقط تیتر نوار از STAGE2_META (I5) است.
 */
function protocolStrip(protoCardNode) {
  if (!protoCardNode) return null;
  const steps = protoCardNode.querySelector('.clx-journey__steps');
  if (!steps) return null;
  return el('div', {},
    el('div', { class: 'clx-sub__title' }, icon('target', 14), STAGE2_META.stages.protocol.protocolStripTitle),
    steps);
}

// ───────── رندر اصلی تب ─────────

/**
 * تب «تفسیر بالینی» پروفایل — فلوی آکاردئونی ۶ مرحله‌ای (m135) + پروتکل قضاوت.
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
    let events = []; // — پاسخ واحد /case-events؛ ردیف‌های مراحل ۱/۲/۴ از همین می‌آید (GET رشد نمی‌کند)
    try {
      const [insRes, pathRes, gatesRes] = await Promise.all([
        api.get(`/api/students/${student.id}/clinical-insights`),
        api.get(`/api/students/${student.id}/clinical-paths`).catch(() => ({ data: [] })),
        api.get(`/api/students/${student.id}/clinical-gates`).catch(() => null)
      ]);
      insights = insRes.data;
      paths = pathRes.data ?? [];
      gates = gatesRes?.data ?? null;
      // پروفایل مهارتی: فاز شناسایی (ورودی گیت ۴) + همهٔ پروتکل‌های مداخله‌ای به‌جز توانبخشی
      // m134: در مداخلهٔ یادگیری/دیرآموز هم لازم است — چک‌لیست ۷ حیطه‌ای نقش «پایش» دارد
      const proto0 = gates?.protocol ?? null;
      const wantOt = !gates || gates.phase === 'identification' || proto0 === 'mental_ot' || proto0 === 'learning' || proto0 === 'slow_learner';
      if (wantOt) {
        otProfile = await api.get(`/api/students/${student.id}/ot/profile`).then((r) => r.data).catch(() => null);
      }
      // شناسهٔ فرم شرح‌حال برای مرحلهٔ ۱ (اگر فعال باشد)
      try {
        const types = (await api.get('/api/case-events/types?active=true')).data ?? [];
        anamnesisTypeId = types.find((t) => t.key === ANAMNESIS_KEY)?.id ?? null;
        typesById = new Map(types.map((t) => [t.key, t]));
      } catch { anamnesisTypeId = null; }
      // پاسخ واحد رویدادها — قبلاً داخل latestResultsCard گرفته می‌شد؛ الان مشترک مراحل ۱/۲/۴ است
      try {
        events = (await api.get(`/api/students/${student.id}/case-events`)).data ?? [];
      } catch { events = []; }
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

    // ── فاز و پروتکل از گیت‌ها؛ fallback: اگر گیت‌ها نیامد، فاز شناسایی ──
    const protocol = gates?.protocol ?? null;
    const phase = protocol ? 'intervention' : 'identification';
    const SM = STAGE2_META.stages;
    // دفاعی (§8.9): ترتیب و تعداد گیت‌ها مالکیت سرور است؛ اگر پاسخ گیت‌ها نیامده باشد،
    // اسکلت استاندارد می‌سازیم تا تب خالی نماند — با پاسخ سرور، هر تعداد/ترتیبی رندر می‌شود.
    const gatesList = (gates?.gates ?? []).length
      ? gates.gates
      : (gates ? [] : ['anamnesis', 'behavioral', 'wechsler', 'skills', 'needs'].map((k) => ({ key: k, done: false, ord: SM[k].num, label: SM[k].title, detail: null })));
    const gateByKey = (key) => gatesList.find((g) => g.key === key) ?? null;
    const stageCtx = { student, gates, typesById, anamnesisTypeId, canDecide, refresh };

    // دادهٔ صورت‌بندی — یک‌بار fetch؛ هم به wechslerConnections می‌رود هم به کارت جمع‌بندی (null-safe)
    const formulation = await fetchFormulation({ student });

    // ── «پیوند با سایر اطلاعات» — خطوط اتصال وکسلر به بقیهٔ ابزارها (m134) — رندر در مرحلهٔ ۵ ──
    const connections = wechslerConnections({ formulation, insights, gates });

    // ── حالت‌های مراحل — §5: iterate گیت‌ها به ترتیب سرور؛ گام جاری = اولین ناتمام؛ پروتکل فعال → مرحلهٔ ۶ ──
    const wSummary = gates?.wechslerSummary ?? null;
    const wechslerEmpty = !wSummary
      || (wSummary.fsiq == null && wSummary.percentile == null && !(wSummary.hypotheses ?? []).length && !wSummary.profile);
    const firstOpenGate = gatesList.find((g) => !g.done) ?? null;
    const currentKey = protocol ? 'intervention' : (firstOpenGate?.key ?? null);
    const hasRanked = (insights.ranked?.length ?? 0) > 0;

    const stateOf = (key) => {
      if (phase === 'intervention') return key === 'intervention' ? 'current' : 'done'; // آرشیو مراحل ۱–۵
      if (key === 'intervention') return 'locked'; // تا ثبت نتیجهٔ نیاز ویژه
      const g = gateByKey(key);
      if (key === 'needs') return g?.done ? 'needsDone' : (currentKey === key ? 'current' : 'todo');
      if (key === 'wechsler' && wechslerEmpty) return 'noData'; // §5 — بدون بازشدن خودکار
      if (g?.done) return 'done';
      return currentKey === key ? 'current' : 'todo';
    };

    // ── خط «در یک نگاه» هر سربرگ — ترکیب طبق قواعد CONTENT-SPEC §3 ──
    const idsOf = (keys) => keys.map((k) => typesById.get(k)?.id).filter(Boolean);
    const countCompleted = (keys) => {
      const ids = new Set(idsOf(keys));
      return (events ?? []).filter((e) => ids.has(e.eventTypeId) && e.status === 'completed').length;
    };
    const glanceOf = {
      anamnesis: () => gateByKey('anamnesis')?.detail || SM.anamnesis.glanceEmpty,
      behavioral: () => {
        const n = countCompleted([...SCREEN_KEYS, ...SPECIFIC_KEYS]);
        const countLine = n === 0 ? SM.behavioral.glanceZero : SM.behavioral.glanceSome.replace('{n}', fa(n));
        const susLine = gates?.suspicion?.decided ? SM.behavioral.glanceSuspicion.decided : SM.behavioral.glanceSuspicion.pending;
        return `${countLine} · ${susLine}`;
      },
      wechsler: () => {
        const W = SM.wechsler;
        if (!wSummary) return W.glanceEmpty;
        const { fsiq, percentile, mainName } = wSummary;
        let line;
        if (fsiq != null && percentile != null && mainName) line = W.glanceFull.replace('{fsiq}', fa(fsiq)).replace('{p}', fa(percentile)).replace('{main}', mainName);
        else if (fsiq != null && percentile != null) line = W.glanceFsiq.replace('{fsiq}', fa(fsiq)).replace('{p}', fa(percentile));
        else if (mainName) line = W.glanceMain.replace('{main}', mainName);
        else if (!wSummary.engine) line = W.glanceManual;
        else line = W.glanceEmpty;
        const date = wSummary.event?.date ? formatJalaliDateTime(wSummary.event.date) : null;
        if (date && line !== W.glanceEmpty) line = `${line} · ${W.glanceDate.replace('{date}', date)}`;
        return line;
      },
      skills: () => {
        const t = otProfile?.totals ?? null;
        if (t) {
          let line = SM.skills.glanceOt.replace('{n}', fa(t.scored)).replace('{m}', fa(t.total));
          if (gates?.pathway === 'learning') {
            const k = countCompleted(PROBE_KEYS);
            if (k > 0) line = SM.skills.glanceOtProbe.replace('{ot}', line).replace('{k}', fa(k));
          }
          return line;
        }
        return gateByKey('skills')?.detail || SM.skills.glanceFallback;
      },
      needs: () => {
        if (formulation?.coherence) {
          return SM.needs.glance
            .replace('{coh}', formulation.coherence)
            .replace('{p}', fa(Math.round((formulation.confidence ?? 0) * 100)));
        }
        const first = (insights.nextActions ?? [])[0] ?? null;
        if (!first) return null;
        const s = String(first);
        return s.length > 64 ? `${s.slice(0, 64)}…` : s;
      },
      intervention: () => {
        if (!protocol) return SM.protocol.glanceLocked;
        const label = protocolLabelOf(protoCardNode, protocol);
        if (!paths.length) return SM.protocol.glanceNoPath.replace('{protocol}', label);
        const statusKey = paths.some((p) => p.status === 'active') ? 'active'
          : paths.some((p) => p.status === 'reviewed') ? 'reviewed'
            : paths[0]?.status;
        return SM.protocol.glanceActive.replace('{protocol}', label).replace('{status}', PATH_STATUS_LABEL[statusKey] ?? statusKey ?? '—');
      }
    };

    // ── ردیف‌های رویداد هر مرحله — از پاسخ واحد (§8.1) ──
    const anamRows = eventRowsBlock({ events, typesById, keys: [ANAMNESIS_KEY], cap: 1, expandable: false });
    const checklistRows = eventRowsBlock({ events, typesById, keys: [...SCREEN_KEYS, ...SPECIFIC_KEYS], cap: 6, expandable: true });
    const probeRows = eventRowsBlock({ events, typesById, keys: [...PROBE_KEYS, RESULTS_KEY], cap: 6, expandable: true });

    // ── داده‌های مرحلهٔ ۵ — جدول DSM + فرضیه‌ها + شواهد موجود، پشت تاشوی «جزئیات موتور تشخیصی» ──
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
    const crits = hasData ? criteriaGroups(insights.criteria, insights.ranked) : null;
    const critsSection = crits
      ? el('div', { class: 'clx-section' },
          el('div', { class: 'clx-section__title' }, icon('clipboard', 16), 'جدول ملاک‌های DSM-5-TR — چهارحالته'),
          crits)
      : null;
    const seenBlock = seenChipsBlock(insights);
    const synthesis = await synthesisSection({
      student, formulation, insights, gates, canDecide, refresh,
      engineDetails: [critsSection, hypotheses, seenBlock].filter(Boolean)
    });

    // ── داده‌های مرحلهٔ ۶ — مسیرها + شروع از قالب + کارت پروتکل (استخراج نوار گام‌ها) ──
    const protoCardNode = protocol ? protocolCard(protocol) : null;
    const quickStart = paths.length || !canDecide
      ? null
      : await templateQuickStart({ student, refresh, canDecide, protocol });
    const emptyPathLine = paths.length
      ? null
      : el('div', { class: 'cell-sub' }, hasData
          ? 'مسیری ثبت نشده — از قالب‌های آماده یا فرضیه‌ها بسازید.'
          : 'مسیری ثبت نشده است.');
    const pathsSection = el('div', { class: 'clx-section' },
      el('div', { class: 'clx-section__title' }, icon('target', 16), 'مسیر مداخله و تصمیم شما',
        canDecide
          ? el('span', { style: { marginInlineStart: 'auto', display: 'inline-flex', gap: '6px', flexWrap: 'wrap' } },
              el('button', {
                class: 'btn btn--ghost btn--sm',
                onclick: () => { location.hash = '#/templates'; }
              }, icon('grid', 14), 'مدیریت قالب‌ها'))
          : null),
      paths.length
        ? el('div', { class: 'clx-paths' }, paths.map((p) => pathCard(p, { student, canDecide, refresh })))
        : emptyPathLine
    );

    // ── کارت چک‌لیست مهارتی مرحلهٔ ۴ — لنگر اسکرول CTA «چک‌لیست مهارتی» ──
    const otCard = otProfile
      ? otChecklistCard({ student, profile: otProfile, canDecide, refresh, scrollTarget: true })
      : null;

    // ── بدنهٔ هر مرحله (§3.1–3.6) ──
    const bodyOf = {
      anamnesis: () => {
        const g = gateByKey('anamnesis');
        const body = [];
        if (g?.detail) body.push(el('div', { class: 'cell-sub' }, g.detail));
        if (anamRows.node) body.push(anamRows.node);
        if (!g?.done) {
          if (!g?.detail && !anamRows.node) {
            body.push(el('div', { class: 'cell-sub' }, SM.anamnesis.emptyHint));
          } else {
            const cta = gateActionOf(g, stageCtx);
            if (cta) {
              cta.classList.remove('btn--soft');
              cta.classList.add('btn--primary');
              body.push(el('div', { class: 'clx-actions' }, cta));
            }
          }
        }
        return body;
      },
      behavioral: () => {
        const g = gateByKey('behavioral');
        const sus = gates?.suspicion ?? null;
        const body = [];
        if (!checklistRows.count && !sus?.decided) body.push(el('div', { class: 'cell-sub' }, SM.behavioral.emptyHint));
        body.push(suspicionBlock({ student, gates, typesById, canDecide, refresh }));
        if (checklistRows.node) body.push(checklistRows.node);
        if (!g?.done) {
          const cta = gateActionOf(g, stageCtx);
          if (cta) body.push(el('div', { class: 'clx-actions' }, cta));
        }
        return body;
      },
      wechsler: () => {
        const profileBody = wechslerProfileBlock({ summary: wSummary, nested: true });
        if (!profileBody) {
          // حالت بدون داده (§3.3 — is-locked + بج «ثبت نشده») — راهنما + CTA ثبت وکسلر
          const body = [emptyState({
            iconName: 'brain',
            title: SM.wechsler.glanceEmpty,
            hint: SM.wechsler.emptyHint
          })];
          const cta = gateActionOf(gateByKey('wechsler'), stageCtx);
          if (cta) body.push(el('div', { class: 'clx-actions' }, cta));
          return body;
        }
        // زمینهٔ تفسیر همیشه بالای بدنه؛ سپس چیپ‌ها + شش آکاردئون تودرتو (همه بسته) + پانویس خط قرمز
        return [interpretationContext({ student, gates }), profileBody];
      },
      skills: () => {
        const g = gateByKey('skills');
        const body = [];
        if (!otProfile && !g?.detail && !probeRows.node) body.push(el('div', { class: 'cell-sub' }, SM.skills.emptyHint));
        if (otCard) body.push(otCard);
        body.push(seenChipsBlock(insights)); // تنها جای چیپ‌های «چه فرم‌هایی آمده» در مرحلهٔ ۴
        if (probeRows.node) body.push(probeRows.node);
        if (!g?.done) {
          const cta = gateActionOf(g, stageCtx);
          if (cta) body.push(el('div', { class: 'clx-actions' }, cta));
        }
        return body;
      },
      needs: () => {
        const body = [];
        if (synthesis) body.push(synthesis);
        if (connections.length) body.push(connectionsSection(connections)); // MOVE از کارت وکسلر → مرحلهٔ ۵
        if (!body.length) body.push(el('div', { class: 'cell-sub' }, SM.needs.emptyHint));
        return body;
      },
      intervention: () => {
        const body = [];
        if (!protocol) body.push(el('div', { class: 'cell-sub' }, SM.protocol.lockedNote));
        if (quickStart) body.push(quickStart);
        body.push(pathsSection);
        if (protocol) {
          const strip = protocolStrip(protoCardNode);
          if (strip) body.push(strip);
          // پیوند مرحلهٔ ۴ — بدون رندر تکراری چک‌لیست مهارتی (§3.6 item 4)
          if (protocol === 'mental_ot' || protocol === 'learning' || protocol === 'slow_learner') {
            body.push(el('div', { class: 'cell-sub' }, icon('clipboard', 13), ' ', SM.protocol.monitoringLink));
          }
        }
        return body;
      }
    };

    // ── ساخت بخش‌ها — به ترتیب سرور گیت‌ها + مرحلهٔ ۶ مشتق (کلید ناشناخته → بخش عمومی با g.label) ──
    const CTA_GATE_KEYS = ['anamnesis', 'behavioral', 'wechsler', 'skills'];
    const sections = [];
    for (const g of gatesList) {
      const meta = SM[g.key] ?? null;
      const state = stateOf(g.key);
      const known = Boolean(meta);
      const glance = known ? (glanceOf[g.key]?.() ?? g.detail ?? null) : (g.detail ?? null);
      const body = known
        ? (bodyOf[g.key]?.() ?? [])
        : (g.detail ? [el('div', { class: 'cell-sub' }, g.detail)] : []);
      sections.push(clxaccSection({
        key: g.key,
        num: meta?.num ?? g.ord ?? null,
        title: meta?.title ?? g.label,
        glance,
        chips: g.key === 'wechsler' && !wechslerEmpty ? [wechslerSourceBadge(Boolean(wSummary.engine))] : [],
        state,
        cta: known && CTA_GATE_KEYS.includes(g.key) && state !== 'noData' ? gateActionOf(g, stageCtx) : null,
        body,
        open: false
      }));
    }
    // مرحلهٔ ۶ — گیت سرور نیست؛ از gates.protocol مشتق می‌شود (§3.6)
    sections.push(clxaccSection({
      key: 'intervention',
      num: SM.protocol.num,
      title: SM.protocol.title,
      glance: glanceOf.intervention(),
      chips: [],
      state: stateOf('intervention'),
      cta: canDecide
        ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => openTemplatePathModal({ student, refresh }) }, icon('puzzle', 14), 'ساخت مسیر از قالب')
        : null,
      body: bodyOf.intervention(),
      open: false
    }));

    // ── بازِ پیش‌فرض — §5: دقیقاً یک بخش top-level = گام جاری؛ cold-start → مرحلهٔ ۱؛ ماندگاری سشن ──
    const persisted = loadOpenIds(student.id);
    let openIds = [];
    if (persisted.length) {
      const byId = new Map(sections.map((s) => [s.id, s]));
      openIds = persisted.filter((id) => {
        const s = byId.get(id);
        return Boolean(s) && !s.classList.contains('is-locked'); // R5 — بخش قفل‌شده بازیابی نمی‌شود
      });
    }
    if (!openIds.length) {
      let def = currentKey;
      if (!protocol && !hasRanked && (gatesList.length === 0 || firstOpenGate?.key === 'anamnesis')) def = 'anamnesis';
      if (def) openIds = [`clxacc-${def}`];
    }
    for (const s of sections) {
      if (openIds.includes(s.id)) { s.open = true; syncAria(s); }
    }

    const flow = el('div', { class: 'clxacc-flow' }, ...sections);

    // ── شنونده‌های واگذارشدهٔ فلوی (§8.4) — یک toggle (capture؛ رویداد details bubble نمی‌شود) + یک click ──
    flow.addEventListener('toggle', (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.matches('details[data-clxacc]')) return;
      syncAria(d);
      if (d.dataset.clxaccLevel === 'top') {
        saveOpenIds(student.id, [...flow.querySelectorAll(':scope > details[data-clxacc][open]')].map((x) => x.id));
      }
    }, true);
    flow.addEventListener('click', (e) => {
      // «{n} سطر/مورد دیگر…» — بازکردن سطرهای پنهان با toggle کلاس (§4 — بدون re-render)
      const more = e.target.closest?.('.clxacc__more');
      if (more) {
        e.preventDefault();
        const host = more.closest('[data-clxmore]') ?? more.parentElement;
        host?.querySelectorAll('.clxacc-table.is-truncated').forEach((t) => {
          t.classList.remove('is-truncated');
          t.classList.add('is-expanded');
        });
        host?.querySelectorAll('[data-clx-hidden]').forEach((r) => {
          r.hidden = false;
          r.removeAttribute('data-clx-hidden');
        });
        more.remove();
        return;
      }
      // CTA داخل <summary> — کلیکِ دکمه نباید آکاردئون را toggle کند (§8.6)
      const summary = e.target.closest?.('summary.clxacc__head');
      if (summary && e.target.closest?.('button')) e.preventDefault();
    });

    // ── نوار باریک بالای تب — فاز/مسیر/پروتکل + تولد/سن/پایه + سه دکمه + آخرین محاسبه (§3) ──
    const ageLine = ageLineFromBirthDate(student.birthDate);
    const profileChips = [
      student.birthDate ? el('span', { class: 'badge badge--neutral' }, `تولد: ${formatStoredJalaliNumeric(student.birthDate)}`) : null,
      ageLine ? el('span', { class: 'badge badge--neutral' }, `سن: ${ageLine}`) : null,
      student.grade ? el('span', { class: 'badge badge--neutral' }, `پایه: ${gradeLabel(student.grade)}`) : null
    ].filter(Boolean);
    const toolbar = el('div', { class: 'clxacc-toolbar' },
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
        el('button', {
          class: 'btn btn--primary btn--sm',
          onclick: () => openCaseEventForm({ student, onSaved: refresh })
        }, icon('send', 15), 'ارسال فرم به خانواده یا معلم'),
        el('button', { class: 'btn btn--ghost btn--sm', onclick: refresh }, icon('refresh', 15), 'به‌روزرسانی'),
        insights.narrative
          ? el('button', {
              class: 'btn btn--soft btn--sm',
              onclick: () => copyText(typeof insights.narrative === 'string' ? insights.narrative : String(insights.narrative?.saw ?? ''), 'خلاصه کپی شد')
            }, icon('copy', 15), 'کپی خلاصه')
          : null
      )
    );

    // ── پانویس خط قرمز — تنها سلب مسئولیتِ صفحه (پلن §۱؛ سه سلب مسئولیت → یکی) ──
    const disclaimer = el('div', { class: 'clx-disclaimer' }, icon('shield', 15), el('span', {}, insights.disclaimer));

    // ── یک قطعهٔ واحد — بدون patch جزئی؛ refresh = load کامل (§8.2) ──
    box.replaceChildren(el('div', { class: 'clx' }, toolbar, flow, disclaimer));
  }

  await load();
}
