import { api } from './api.js';
import { el, icon, confirmModal, formModal, openModal, toast, toastError, emptyState, loadingState, scienceNote } from './ui.js';
import { fa, enDigits, formatJalaliDateTime, formatJalaliNumeric, formatJalaliShort, formatStoredJalaliNumeric, parseJalaliInput, tehranDayRange, tehranTodayYmd, tehranYmdOfIso, toJalali, gradeLabel } from './format.js'; // enDigits/جلالی برای فرم پراپ
import { lineChart } from './charts.js'; // روند پراپ پیشروی با خط ملاک
import { session } from './state.js';
import { openExerciseSendModal } from './exercise-send.js';
import { cardListEditor } from './plan-cards.js'; // ویرایشگر کارت جلسه (کارت‌های آماده + کارت‌های قبلی + کارت آزاد)
import { openCaseEventForm, openCaseEventDetail, openChecklistBatchSendModal } from './case-events.js'; // — : ارسال گروهی فرم‌های پلن + : بازکردن جزئیات فرم از ردیف‌های تب بالینی
import { pathwayChip, canEditPathway, openPathwayModal } from './session-type.js'; // — مسیر پرونده
import { otChecklistCard, otProgressPanel, protocolChip, protocolCard, NEEDS_KEY, OT_SESSION_KEY } from './ot-checklist.js'; // — فلو دوفازی شناسایی→مداخله (openNeedsModal در کارت جمع‌بندی) + پنل پیشرفت جلسه‌به‌جلسه
import { synthesisSection, fetchFormulation } from './case-formulation.js'; // — کارت واحد جمع‌بندی تشخیصی ()
import { wechslerProfileBlock, wechslerSourceBadge, connectionsSection, WEAKEST_FA } from './wechsler-profile.js'; // — نیم‌رخ وکسلر (+) + «پیوند با سایر اطلاعات» ( → مرحلهٔ ۵)
import {
  ANAMNESIS_KEY,
  ANAMNESIS_LEGACY_KEY,
  SCREEN_KEYS,
  SPECIFIC_KEYS,
  PROBE_KEYS,
  RESULTS_KEY,
  REHAB_FX_KEY,
  REHAB_FX_GUIDE,
  WISC4_KEY,
  SUSPICION_KEY,
  LEARNING_BLANK_TEMPLATE_KEY,
  SLD_CHECKLIST_KEYS,
  SESSION_ITEM_LABELS,
  PATH_PROBE_METRIC_PRESETS,
  PATH_PROBE_MASTERY_LABELS,
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
  SYNTHESIS_META,
  EXCLUSION_META,
  DIFF_META,
  HYP_LOG_META,
  BASIS_META,
  PLAN_META,
  TOOL_GUIDES
} from './clinical-content.js';

function canDecideFor(student) {
  const u = session.user;
  if (!u) return false;
  if (u.role === 'manager') return true;
  return u.role === 'therapist' && Boolean(student.ownerStaffId) && student.ownerStaffId === u.staffId;
}

const CONV_BADGE = { 'هم‌گرا': 'badge--success', 'تنها': 'badge--info', 'واگرا': 'badge--warning' };
const CONV_ICON = { 'هم‌گرا': 'check', 'تنها': 'eye', 'واگرا': 'alert' };

function convergenceOf(insights, targetKey) {
  return (insights?.convergence ?? []).find((c) => c.targetKey === targetKey) ?? null;
}

const SKILL_MODE_OT = 'ot';
const SKILL_MODE_SLD = 'sld';

function resolveSkillsMode({ gates, student }) {
  const proto = gates?.protocol ?? null;
  if (proto) return (proto === 'rehab' || proto === 'mental_ot') ? SKILL_MODE_OT : SKILL_MODE_SLD;
  return student?.pathway === 'rehab' ? SKILL_MODE_OT : SKILL_MODE_SLD;
}

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

function countChip(label, n, cls) {
  if (!n) return null;
  return el('span', { class: `badge ${cls}`, title: `${label}: ${fa(n)}` }, `${label} ${fa(n)}`);
}

function statItem(label, value, { warn = false, hint = null } = {}) {
  if (value == null || value === '') return null;
  return el('span', { class: `clxacc__stat${warn ? ' clxacc__stat--warn' : ''}`, ...(hint ? { title: hint } : {}) },
    el('span', {}, label),
    el('b', {}, value));
}

function countStat(label, n, opts) {
  return n > 0 ? statItem(label, fa(n), opts) : null;
}

function ageLineFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const s = String(birthDate).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim();
  let jy; let jm; let jd;
  let m = s.match(/(\d{3,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m && Number(m[1]) >= 1200 && Number(m[1]) <= 1500) {
    [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if (m && Number(m[1]) > 1700) {
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

function iconList(items, iconKey, toneClass) {
  return el('ul', { class: 'clx-list' },
    items.map((t) => el('li', {}, icon(iconKey, 14), el('span', {}, t)))
  );
}

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

function stateClassOf(state) {
  if (state === 'done' || state === 'needsDone') return 'is-done';
  if (state === 'current') return 'is-current';
  if (state === 'locked' || state === 'noData') return 'is-locked';
  return 'is-todo';
}

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

function clxaccSection({ key, num, title, glance, stats = [], chips = [], state = 'todo', cta = null, body = [], open = false }) {
  const statNodes = (stats ?? []).filter(Boolean);
  const summary = el('summary', { class: 'clxacc__head', 'aria-expanded': open ? 'true' : 'false' },
    num != null ? el('span', { class: 'clxacc__num', 'aria-hidden': 'true' }, fa(num)) : null,
    el('span', { class: 'clxacc__heading' },
      el('strong', { class: 'clxacc__title' }, title),
      glance ? el('span', { class: 'clxacc__glance' }, glance) : null,
      statNodes.length ? el('span', { class: 'clxacc__stats' }, ...statNodes) : null),
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

function syncAria(details) {
  const s = details.querySelector(':scope > summary');
  if (s) s.setAttribute('aria-expanded', details.open ? 'true' : 'false');
}

function suspicionBlock({ student, gates, typesById, canDecide, refresh }) {
  const sus = gates.suspicion ?? { signals: [], decided: false, decidedAt: null, decidedSummary: null };
  const hasContent = (sus.signals ?? []).length > 0 || sus.decided;
  if (!hasContent) return null;
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
        : null
    ),
    (sus.signals ?? []).length
      ? el('div', { class: 'clx-suspicion__body' }, ...signalRows)
      : null,
    sus.decided && sus.decidedSummary
      ? el('div', { class: 'clx-suspicion__decision' },
          el('span', { class: 'badge badge--info' }, `تصمیم: ${sus.decidedSummary}`),
          sus.decidedAt ? el('span', { class: 'cell-sub' }, formatJalaliDateTime(sus.decidedAt)) : null)
      : null,
    recordBtn ? el('div', { class: 'clx-suspicion__act' }, recordBtn) : null
  );
}

function checklistPlanCard({ student, plan, typesById, canDecide, refresh }) {
  if (!plan) return null;
  const M = PLAN_META;
  const titleOf = (key) => typesById.get(key)?.title ?? key;

  // — : هر آیتم پلن یک تیک انتخاب دارد (همه از پیش علامت‌خورده)؛ درمانگر لازم‌ها را نگه می‌دارد
  const checked = new Map((plan.items ?? []).map((it) => [it.toolKey, true]));
  const itemRows = (plan.items ?? []).map((it) => {
    const pb = M.priorityBadge[it.priority] ?? M.priorityBadge.optional;
    const cb = el('input', {
      type: 'checkbox', checked: true,
      style: { width: '16px', height: '16px', accentColor: 'var(--brand, #229ED9)', flex: 'none', marginTop: '3px' }
    });
    cb.addEventListener('change', () => {
      checked.set(it.toolKey, cb.checked);
      syncActions();
    });
    return el('label', { class: 'clx-plan__item', style: { display: 'flex', gap: '9px', alignItems: 'flex-start', cursor: 'pointer' } },
      cb,
      el('div', { style: { flex: '1', minWidth: '0' } },
        el('div', { class: 'clx-plan__itemhead' },
          el('strong', {}, titleOf(it.toolKey)),
          el('span', { class: `badge ${pb.cls}` }, pb.label)),
        el('div', { class: 'cell-sub' }, it.reasonFa))
    );
  });

  const redLine = plan.referralFa
    ? el('div', { class: 'clx-plan__redline' }, icon('alert', 14),
        el('span', { class: 'badge badge--error' }, M.redLineLabel),
        el('span', { class: 'cell-sub' }, plan.referralFa))
    : null;

  const sendBtn = el('button', { class: 'btn btn--primary btn--sm' }, icon('send', 14), M.sendSelectedLabel);
  const editBtn = el('button', {
    class: 'btn btn--soft btn--sm',
    onclick: () => openCaseEventForm({ student, onSaved: refresh })
  }, icon('edit', 14), M.editLabel);
  const actions = canDecide
    ? el('div', { class: 'clx-actions' }, sendBtn, editBtn)
    : null;
  const syncActions = () => {
    const selectedKeys = (plan.items ?? []).map((i) => i.toolKey).filter((k) => checked.get(k));
    const types = selectedKeys
      .map((k) => typesById.get(k))
      .filter((t) => t && t.familyFillable && t.category === 'checklist');
    sendBtn.disabled = types.length === 0;
    sendBtn.replaceChildren(icon('send', 14), `${M.sendSelectedLabel}${types.length ? ` (${fa(types.length)})` : ''}`);
  };
  sendBtn.addEventListener('click', () => {
    const selectedKeys = (plan.items ?? []).map((i) => i.toolKey).filter((k) => checked.get(k));
    const types = selectedKeys
      .map((k) => typesById.get(k))
      .filter((t) => t && t.familyFillable && t.category === 'checklist');
    if (types.length === 0) {
      toast('حداقل یک فرم قابل ارسال را انتخاب کنید', 'warning');
      return;
    }
    openChecklistBatchSendModal({ student, types, onDone: refresh });
  });
  syncActions();

  return el('div', { class: 'card clx-plan' },
    el('div', { class: 'card__body' },
      el('div', { class: 'clx-plan__head' },
        el('strong', { class: 'clx-plan__title' }, icon('compass', 15), M.title),
        el('span', { class: `badge ${M.planTypeBadge[plan.planType] ?? 'badge--info'}` }, M.planTypeLabel[plan.planType] ?? plan.planType)),
      el('div', { class: 'cell-sub' }, `${M.basisLabel}${plan.basis}`),
      redLine,
      itemRows.length
        ? el('div', { class: 'clx-plan__items' }, ...itemRows)
        : el('div', { class: 'cell-sub' }, M.emptyItems),
      actions,
      actions ? el('div', { class: 'cell-sub' }, M.sendSelectedHint, ' ', M.editHint) : null
    )
  );
}

const SENSORY_CHIP_KEY = 'ce-sensory-chip-v1';
const SENSORY_CHIP_ITEMS = [
  { key: 'sound', label: 'صدا (صوت)' },
  { key: 'light', label: 'نور (نور/رنگ)' },
  { key: 'touch', label: 'لمس و بافت (لمس/جنس لباس/بافت غذا)' }
];
const SENSORY_CHIP_LEVELS = ['بدون حساسیت', 'حساسیت جزئی', 'حساسیت آزارنده'];
const SENSORY_CONCERN_GATE = ['متوسط', 'زیاد — نگران‌کننده'];

function sensoryBandBadge(text, color) {
  const cls = color === 'ok' ? 'badge--success'
    : color === 'warn' ? 'badge--warning'
      : color === 'danger' ? 'badge--error'
        : 'badge--neutral';
  return el('span', { class: `badge ${cls}` }, text);
}

function sensoryChipCard({ student, events, typesById, canDecide, refresh }) {
  const chipTypeId = typesById.get(SENSORY_CHIP_KEY)?.id ?? null;
  const existing = chipTypeId
    ? (events ?? []).find((e) => e.eventTypeId === chipTypeId && e.status !== 'cancelled')
    : null;

  if (existing) {
    const bandLabel = existing.analysis?.band ?? existing.payload?.chip_band?.value ?? null;
    const color = ((existing.typeBands ?? []).find((b) => b.label === bandLabel) ?? {}).color ?? null;
    return el('div', { class: 'card clx-sensory' },
      el('div', { class: 'card__body' },
        el('div', { class: 'clx-plan__head' },
          el('strong', { class: 'clx-plan__title' }, icon('activity', 15), 'حساسیت حسی'),
          sensoryBandBadge(`ثبت شد — ${bandLabel ?? '—'}`, color)),
        existing.summary || existing.payload?.fa_summary?.value
          ? el('div', { class: 'cell-sub' }, existing.summary || existing.payload.fa_summary.value)
          : null,
        existing.occurredAt ? el('div', { class: 'cell-sub' }, `ثبت: ${formatJalaliDateTime(existing.occurredAt)}`) : null));
  }

  const anamId = typesById.get(ANAMNESIS_KEY)?.id ?? null;
  const lastAnam = anamId
    ? (events ?? []).find((e) => e.eventTypeId === anamId && e.status === 'completed' && e.payload?.sensory_concern?.value)
    : null;
  const concern = lastAnam?.payload?.sensory_concern?.value ?? null;
  if (!concern || !SENSORY_CONCERN_GATE.includes(concern)) return null;

  const head = el('div', { class: 'clx-plan__head' },
    el('strong', { class: 'clx-plan__title' }, icon('activity', 15), 'حساسیت حسی'),
    el('span', { class: 'badge badge--warning' }, `نگرانی شرح‌حال: ${concern}`));

  if (!canDecide) {
    return el('div', { class: 'card clx-sensory' },
      el('div', { class: 'card__body' }, head,
        el('div', { class: 'cell-sub' }, 'نگرانی حسی در شرح‌حال ثبت شده — پروفایل مشاهده‌شده توسط درمانگر ثبت می‌شود.')));
  }

  const openChipModal = () => {
    formModal({
      title: 'چیپ غربالگری حسی — سه مشاهده، سه سطح',
      submitLabel: 'ثبت',
      fields: SENSORY_CHIP_ITEMS.map((it) => ({
        name: it.key, type: 'chips', label: it.label, labels: SENSORY_CHIP_LEVELS, value: 0, span: 2
      })),
      onSubmit: async (vals) => {
        try {
          await api.post(`/api/students/${student.id}/case-events/sensory-chip`, {
            levels: { sound: Number(vals.sound), light: Number(vals.light), touch: Number(vals.touch) }
          });
          toast('چیپ حسی ثبت شد — نشان باند در همین ردیف می‌نشیند', 'success');
          refresh();
          return true;
        } catch (err) { toastError(err); return false; }
      }
    });
  };

  return el('div', { class: 'card clx-sensory' },
    el('div', { class: 'card__body' },
      head,
      el('div', { class: 'cell-sub' }, 'پروفایل مشاهده‌شدهٔ حسی در سه مجرا (صدا/نور/لمس و بافت) و سه سطح — جمع ۰ تا ۶.'),
      el('div', { class: 'clx-actions' },
        el('button', { class: 'btn btn--primary btn--sm', onclick: openChipModal }, icon('zap', 14), 'ثبت مشاهدهٔ حسی'))));
}

const READ_CORE_KEY = 'ce-read-core-v1';
const READ_CORE_ITEMS = [
  { key: 'pa', label: 'آگاهی واج‌شناختی (بخشیدن و ترکیب صدا، قافیه)' },
  { key: 'dec', label: 'رمزگشایی (خواندن واژهٔ تازه و بی‌معنی)' },
  { key: 'flu', label: 'روانی خواندن (سرعت و سلاست متن هم‌پایه)' },
  { key: 'voc', label: 'واژگان (فهم معنی واژه‌های متن)' },
  { key: 'comp', label: 'درک مطلب (پاسخ به پرسش‌های متن)' }
];
const READ_CORE_LEVELS = ['برقرار', 'مرزی', 'ضعف آشکار'];
const READ_CONCERN_GATE = ['کم', 'متوسط', 'زیاد — نگران‌کننده'];

function readCoreAdviceRows(payload) {
  const rows = [];
  for (let i = 1; i <= 9; i++) {
    const a = payload?.[`advice_${i}`];
    if (a?.value) rows.push(el('div', { class: 'clx-readcore__advice-row' }, icon('zap', 13), ' ', a.value));
  }
  return rows;
}

function readCoreChipCard({ student, events, typesById, canDecide, refresh }) {
  const chipTypeId = typesById.get(READ_CORE_KEY)?.id ?? null;
  const existing = chipTypeId
    ? (events ?? []).find((e) => e.eventTypeId === chipTypeId && e.status !== 'cancelled')
    : null;

  if (existing) {
    const bandLabel = existing.analysis?.band ?? existing.payload?.chip_band?.value ?? null;
    const color = ((existing.typeBands ?? []).find((b) => b.label === bandLabel) ?? {}).color ?? null;
    const adviceRows = readCoreAdviceRows(existing.payload);
    return el('div', { class: 'card clx-readcore' },
      el('div', { class: 'card__body' },
        el('div', { class: 'clx-plan__head' },
          el('strong', { class: 'clx-plan__title' }, icon('book', 15), 'هستهٔ خواندن'),
          sensoryBandBadge(`ثبت شد — ${bandLabel ?? '—'}`, color)),
        existing.summary || existing.payload?.fa_summary?.value
          ? el('div', { class: 'cell-sub' }, existing.summary || existing.payload.fa_summary.value)
          : null,
        adviceRows.length
          ? el('div', { class: 'clx-readcore__advice' },
            el('div', { class: 'cell-sub' }, el('strong', null, 'پیشنهاد شرطی گام بعد — ابزارهای رسمی باتری:')),
            adviceRows)
          : null,
        existing.occurredAt ? el('div', { class: 'cell-sub' }, `ثبت: ${formatJalaliDateTime(existing.occurredAt)}`) : null));
  }

  const anamId = typesById.get(ANAMNESIS_KEY)?.id ?? null;
  const lastAnam = anamId
    ? (events ?? []).find((e) => e.eventTypeId === anamId && e.status === 'completed' && e.payload?.sld_read_concern?.value)
    : null;
  const concern = lastAnam?.payload?.sld_read_concern?.value ?? null;
  if (!concern || !READ_CONCERN_GATE.includes(concern)) return null;

  const head = el('div', { class: 'clx-plan__head' },
    el('strong', { class: 'clx-plan__title' }, icon('book', 15), 'هستهٔ خواندن'),
    el('span', { class: 'badge badge--warning' }, `نگرانی شرح‌حال: ${concern}`));

  if (!canDecide) {
    return el('div', { class: 'card clx-readcore' },
      el('div', { class: 'card__body' }, head,
        el('div', { class: 'cell-sub' }, 'نگرانی خواندن در شرح‌حال ثبت شده — پروفایل مشاهده‌شدهٔ هستهٔ خواندن توسط درمانگر ثبت می‌شود.')));
  }

  const openChipModal = () => {
    formModal({
      title: 'چیپ هستهٔ خواندن — پنج مؤلفه، سه سطح',
      submitLabel: 'ثبت',
      fields: READ_CORE_ITEMS.map((it) => ({
        name: it.key, type: 'chips', label: it.label, labels: READ_CORE_LEVELS, value: 0, span: 2
      })),
      onSubmit: async (vals) => {
        try {
          await api.post(`/api/students/${student.id}/case-events/read-core`, {
            levels: {
              pa: Number(vals.pa), dec: Number(vals.dec), flu: Number(vals.flu),
              voc: Number(vals.voc), comp: Number(vals.comp)
            }
          });
          toast('چیپ هستهٔ خواندن ثبت شد — پیشنهاد شرطی گام بعد در همین ردیف می‌نشیند', 'success');
          refresh();
          return true;
        } catch (err) { toastError(err); return false; }
      }
    });
  };

  return el('div', { class: 'card clx-readcore' },
    el('div', { class: 'card__body' },
      head,
      el('div', { class: 'cell-sub' }, 'پنج مؤلفهٔ خواندن (آگاهی واج‌شناختی، رمزگشایی، روانی، واژگان، درک مطلب) در سه سطح — جمع ۰ تا ۱۰؛ پس از ثبت، پیشنهاد شرطی ابزار گام بعد می‌نشیند.'),
      el('div', { class: 'clx-actions' },
        el('button', { class: 'btn btn--primary btn--sm', onclick: openChipModal }, icon('zap', 14), 'ثبت مشاهدهٔ خواندن'))));
}

const PROBE_GRADE_OPTS = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم'].map((g) => ({ value: g, label: g }));
const PROBE_SUPPORT_OPTS = ['کم', 'متوسط', 'زیاد', 'بی‌راه‌حل'].map((s) => ({ value: s, label: s }));
const PROBE_AREAS = [
  {
    key: 'read', typeKey: 'ce-probe-read-v1', icon: 'book',
    title: 'آزمون کوتاه خواندن', desc: 'یک دقیقه خواندن بلند از متن هم‌پایه + بیست واژهٔ بی‌معنی؛ نتیجه با انتظار پایه مقایسه می‌شود (صدک ۵۰ مرجع).',
    fields: [
      { name: 'text_grade', type: 'select', label: 'متن استفاده‌شده (پایه)', options: PROBE_GRADE_OPTS, required: true, span: 2 },
      { name: 'wcpm', type: 'number', label: 'واژه‌های درست در یک دقیقه', required: true, span: 1 },
      { name: 'errors', type: 'number', label: 'خطا در همان یک دقیقه', span: 1 },
      { name: 'pseudo_correct', type: 'number', label: 'واژهٔ بی‌معنی درست‌خوانده (از ۲۰)', required: true, span: 1 },
      { name: 'comprehension', type: 'number', label: 'فهم متن (از ۳ پرسش)', span: 1 },
      { name: 'notes', type: 'textarea', label: 'مشاهدهٔ درمانگر (تعقیب با انگشت، خستگی، حدس‌زدن…)', span: 2 }
    ]
  },
  {
    key: 'write', typeKey: 'ce-probe-write-v1', icon: 'edit',
    title: 'آزمون کوتاه نوشتن', desc: 'یک دیکتهٔ هم‌پایه با شمارش خطا به تفکیک نوع + نوشتن حروف در ۱۵ ثانیه برای روانی دست.',
    fields: [
      { name: 'dict_grade', type: 'select', label: 'دیکتهٔ استفاده‌شده (پایه)', options: PROBE_GRADE_OPTS, required: true, span: 2 },
      { name: 'dict_words', type: 'number', label: 'تعداد واژهٔ دیکته', required: true, span: 1 },
      { name: 'alpha15s', type: 'number', label: 'حروف درست در ۱۵ ثانیه', required: true, span: 1 },
      { name: 'err_phonetic', type: 'number', label: 'خطای صدا و حرف', required: true, span: 1 },
      { name: 'err_visual', type: 'number', label: 'خطای شباهت حروف (ب/پ/ت…)', span: 1 },
      { name: 'err_rule', type: 'number', label: 'خطای نگارشی (فاصله، «ان/آن»…)', span: 1 },
      { name: 'handwriting_note', type: 'text', label: 'کیفیت دست‌خط (اندازه، خط، فشار قلم)', span: 2 }
    ]
  },
  {
    key: 'calc', typeKey: 'ce-probe-calc-v1', icon: 'grid',
    title: 'آزمون کوتاه حساب', desc: 'دو دقیقه محاسبهٔ سریع + ده جفت مقایسهٔ عدد + جای‌گذاری روی خط عددی؛ نتیجه با انتظار پایه مقایسه می‌شود.',
    fields: [
      { name: 'calc_grade', type: 'select', label: 'سطح آزمون (پایه)', options: PROBE_GRADE_OPTS, required: true, span: 2 },
      { name: 'digits2min', type: 'number', label: 'ارقام درست در دو دقیقه', required: true, span: 1 },
      { name: 'compare_errors', type: 'number', label: 'خطای مقایسهٔ مقدار (از ۱۰ جفت)', required: true, span: 1 },
      { name: 'number_line_pct', type: 'number', label: 'خطای خط عددی (درصد)', span: 1 },
      { name: 'word_problem_support', type: 'select', label: 'راهنمایی مسئلهٔ کلامی', options: PROBE_SUPPORT_OPTS, span: 1 },
      { name: 'notes', type: 'textarea', label: 'مشاهدهٔ درمانگر (شمارش انگشتی، اضطراب حساب…)', span: 2 }
    ]
  }
];

function probeEventOf(area, events, typesById) {
  const typeId = typesById.get(area.typeKey)?.id ?? null;
  if (!typeId) return null;
  return (events ?? []).find((e) => e.eventTypeId === typeId && e.status !== 'cancelled') ?? null;
}

function openProbeModal(area, student, onDone) {
  formModal({
    title: `${area.title} — ثبت درمانگر در مرکز`,
    submitLabel: 'ثبت آزمون',
    fields: area.fields,
    onSubmit: async (vals) => {
      try {
        await api.post(`/api/students/${student.id}/case-events/probe`, { area: area.key, values: vals });
        toast('آزمون عملکرد ثبت شد — باند و مقایسه با انتظار پایه همین‌جا می‌نشیند', 'success');
        onDone();
        return true;
      } catch (err) { toastError(err); return false; }
    }
  });
  // — : بلوک «پشتوانهٔ علمی و نحوهٔ استفاده» بالای فیلدهای پروب
  try {
    const grids = document.querySelectorAll('.modal .form-grid');
    const form = grids[grids.length - 1];
    const guideNode = scienceNote(TOOL_GUIDES[area.typeKey]);
    if (form && guideNode) {
      guideNode.style.gridColumn = '1 / -1';
      form.prepend(guideNode);
    }
  } catch { /* تزریق راهنما حیاتی نیست */ }
}

function probeAssessSection({ student, events, typesById, canDecide, refresh }) {
  const cards = PROBE_AREAS.map((area) => {
    const existing = probeEventOf(area, events, typesById);
    if (existing) {
      const bandLabel = existing.analysis?.band ?? existing.payload?.chip_band?.value ?? null;
      const color = ((existing.typeBands ?? []).find((b) => b.label === bandLabel) ?? {}).color ?? null;
      const metricRows = [];
      for (let i = 1; i <= 6; i++) {
        const m = existing.payload?.[`chip_metric_${i}`];
        if (m?.value) metricRows.push(el('div', { class: 'clx-probe__metric' }, el('span', {}, m.label), el('b', {}, m.value)));
      }
      return el('div', { class: 'card clx-probe is-done' },
        el('div', { class: 'card__body' },
          el('div', { class: 'clx-plan__head' },
            el('strong', { class: 'clx-plan__title' }, icon(area.icon, 15), area.title),
            sensoryBandBadge(`ثبت شد — ${bandLabel ?? '—'}`, color)),
          existing.payload?.fa_summary?.value
            ? el('div', { class: 'cell-sub clx-probe__summary' }, existing.payload.fa_summary.value)
            : null,
          metricRows.length
            ? el('div', { class: 'clx-probe__metrics' }, ...metricRows)
            : null,
          existing.payload?.norm_fa?.value
            ? el('div', { class: 'cell-sub clx-probe__norm' }, icon('compass', 12), ' ', existing.payload.norm_fa.value)
            : null,
          existing.occurredAt ? el('div', { class: 'cell-sub' }, `ثبت: ${formatJalaliDateTime(existing.occurredAt)}`) : null));
    }
    const act = canDecide
      ? el('div', { class: 'clx-actions' },
          el('button', { class: 'btn btn--primary btn--sm', onclick: () => openProbeModal(area, student, refresh) },
            icon('zap', 14), 'ثبت آزمون'))
      : null;
    return el('div', { class: 'card clx-probe' },
      el('div', { class: 'card__body' },
        el('div', { class: 'clx-plan__head' },
          el('strong', { class: 'clx-plan__title' }, icon(area.icon, 15), area.title),
          el('span', { class: 'badge badge--neutral' }, 'ثبت نشده')),
        el('div', { class: 'cell-sub' }, area.desc),
        act));
  });
  // لنگر مردهٔ func-assess-anchor حذف شد؛ هیچ اسکرولی به آن ارجاع ندارد
  return el('div', { class: 'clx-probe-wrap' },
    el('div', { class: 'clx-probe-wrap__head' },
      el('strong', {}, icon('zap', 15), 'آزمون‌های عملکرد مرکزی — ثبت درمانگر'),
      el('span', { class: 'cell-sub' }, 'در مرکز، حضوری، از خود کودک — چک‌لیست خانواده و معلم جای خود در مرحلهٔ ۲ است.')),
    el('div', { class: 'clx-probe__grid' }, ...cards));
}

const REHAB_FX_PROMPTS = ['بدون راهنما', 'راهنمای کلامی', 'ژستی / الگودهی', 'لمسی جزئی', 'راهنمای فیزیکی کامل'];
const REHAB_FX_AREAS = [
  { key: 'att_sus', label: 'توجه پایدار', unit: 'دقیقهٔ تمرکز پیوسته', max: 15, hint: 'روی یک فعالیت ساخت‌یافته چقدر پیوسته می‌ماند؟ (ملاک: ۱۰ دقیقه بدون یادآوری)' },
  { key: 'att_sel', label: 'توجه انتخابی — حذف هدف', unit: 'خطا از ۲۰ هدف', max: 20, hint: 'در جدول حذف هدف چند خطا؟ (ملاک: حداکثر ۲ خطا)' },
  { key: 'wm', label: 'حافظهٔ کاری', unit: 'طول توالی بازگوشده (رقم)', max: 9, hint: 'بیشترین توالی عددی که برگرداند؟ (ملاک: ۴ رقم)' },
  { key: 'inh', label: 'بازداری — سیگنال معکوس', unit: 'خطا از ۱۰ آزمون', max: 10, hint: 'در بازی سیگنال معکوس چند خطا؟ (ملاک: حداکثر ۲ خطا)' },
  { key: 'flex', label: 'انعطاف ذهنی', unit: 'کمک لازم پس از تغییر قاعده (بار)', max: 4, hint: 'بعد از تغییر قاعدهٔ بازی چند بار کمک خواست؟ (ملاک: بدون گِر)' },
  { key: 'ps', label: 'حل مسئله — پازل', unit: 'تکهٔ درست از ۱۲', max: 12, hint: 'پازل چند تکه را درست گذاشت؟ (ملاک: ۶–۱۲ تکه + ترتیب داستان)' }
];

function rehabFxEventOf(events, typesById) {
  const typeId = typesById.get(REHAB_FX_KEY)?.id ?? null;
  if (!typeId) return null;
  return (events ?? []).find((e) => e.eventTypeId === typeId && e.status !== 'cancelled') ?? null;
}

const FX_TO_OT_DOMAIN = { att_sus: 'cognitive', att_sel: 'cognitive', wm: 'auditory', inh: 'cognitive', flex: 'cognitive', ps: 'cognitive' };
function rehabPriorityDomains(fx) {
  if (!fx?.payload) return [];
  const weak = [];
  const warn = [];
  for (const a of REHAB_FX_AREAS) {
    const band = fx.payload[`fx_${a.key}_band`]?.value;
    const dom = FX_TO_OT_DOMAIN[a.key];
    if (band === 'ضعف آشکار') weak.push(dom);
    else if (band === 'مرزی') warn.push(dom);
  }
  return [...new Set([...weak, ...warn])].slice(0, 2);
}

function openRehabFxModal(student, onDone) {
  const fields = [];
  for (const a of REHAB_FX_AREAS) {
    fields.push({ name: `d_${a.key}`, type: 'number', label: `${a.label} — ${a.unit}`, hint: a.hint, required: true, span: 1 });
  }
  fields.push({ name: 'd_ps_story', type: 'number', label: 'توالی داستان — تصویر درست‌ترتیب از ۴', span: 1 });
  for (const a of REHAB_FX_AREAS) {
    fields.push({
      name: `p_${a.key}`, type: 'select', label: `سطح راهنما — ${a.label}`,
      options: REHAB_FX_PROMPTS.map((p) => ({ value: p, label: p })), span: 1
    });
  }
  fields.push({ name: 'notes', type: 'textarea', label: 'مشاهدهٔ درمانگر (انگیزه، خستگی، راهبرد جالب…)', span: 2 });
  formModal({
    title: 'ارزیابی عملکردی توانبخشی ذهنی — ثبت درمانگر در مرکز',
    submitLabel: 'ثبت ارزیابی',
    fields,
    onSubmit: async (vals) => {
      try {
        await api.post(`/api/students/${student.id}/case-events/rehab-fx`, { values: vals });
        toast('ارزیابی عملکردی ذهنی ثبت شد — باند هر حیطه و پیشنهاد مداخلهٔ حیطه‌ای همین‌جا می‌نشیند', 'success');
        onDone();
        return true;
      } catch (err) { toastError(err); return false; }
    }
  });
  // — : بلوک «پشتوانهٔ علمی و نحوهٔ استفاده» بالای فیلدهای خط پایه
  try {
    const grids = document.querySelectorAll('.modal .form-grid');
    const form = grids[grids.length - 1];
    const guideNode = scienceNote(TOOL_GUIDES[REHAB_FX_KEY]);
    if (form && guideNode) {
      guideNode.style.gridColumn = '1 / -1';
      form.prepend(guideNode);
    }
  } catch { /* تزریق راهنما حیاتی نیست */ }
}

function rehabFxScienceNote() {
  return el('details', { class: 'rehab-fx-guide' },
    el('summary', {}, icon('compass', 13), REHAB_FX_GUIDE.title),
    el('div', { class: 'rehab-fx-guide__body' },
      ...REHAB_FX_GUIDE.items.map((t) => el('div', { class: 'cell-sub' }, t))));
}

function rehabFxSection({ student, events, typesById, canDecide, refresh }) {
  const existing = rehabFxEventOf(events, typesById);
  if (existing) {
    const bandLabel = existing.analysis?.band ?? existing.payload?.chip_band?.value ?? null;
    const color = ((existing.typeBands ?? []).find((b) => b.label === bandLabel) ?? {}).color ?? null;
    const metricRows = [];
    for (let i = 1; i <= 8; i++) {
      const m = existing.payload?.[`chip_metric_${i}`];
      if (m?.value) metricRows.push(el('div', { class: 'clx-probe__metric' }, el('span', {}, m.label), el('b', {}, m.value)));
    }
    const adviceRows = [];
    for (let i = 1; i <= 8; i++) {
      const a = existing.payload?.[`advice_${i}`];
      if (a?.value) adviceRows.push(el('div', { class: 'clx-readcore__advice-row' },
        el('strong', {}, a.label), el('span', {}, a.value)));
    }
    return el('div', { class: 'card clx-probe is-done' },
      el('div', { class: 'card__body' },
        el('div', { class: 'clx-plan__head' },
          el('strong', { class: 'clx-plan__title' }, icon('brain', 15), 'ارزیابی عملکردی توانبخشی ذهنی — خط پایه'),
          sensoryBandBadge(`ثبت شد — ${bandLabel ?? '—'}`, color)),
        existing.payload?.fa_summary?.value
          ? el('div', { class: 'cell-sub clx-probe__summary' }, existing.payload.fa_summary.value)
          : null,
        metricRows.length ? el('div', { class: 'clx-probe__metrics' }, ...metricRows) : null,
        existing.payload?.norm_fa?.value
          ? el('div', { class: 'cell-sub clx-probe__norm' }, icon('compass', 12), ' ', existing.payload.norm_fa.value)
          : null,
        adviceRows.length
          ? el('div', { class: 'clx-readcore__advice' },
            el('div', { class: 'cell-sub' }, el('strong', null, 'پیشنهاد مداخلهٔ حیطه‌ای — از همین‌جا به جلسات:')),
            adviceRows)
          : null,
        existing.occurredAt ? el('div', { class: 'cell-sub' }, `ثبت: ${formatJalaliDateTime(existing.occurredAt)}`) : null,
        rehabFxScienceNote()));
  }
  const act = canDecide
    ? el('div', { class: 'clx-actions' },
      el('button', { class: 'btn btn--primary btn--sm', onclick: () => openRehabFxModal(student, refresh) },
        icon('zap', 14), 'ثبت ارزیابی عملکردی'))
    : null;
  return el('div', { class: 'card clx-probe' },
    el('div', { class: 'card__body' },
      el('div', { class: 'clx-plan__head' },
        el('strong', { class: 'clx-plan__title' }, icon('brain', 15), 'ارزیابی عملکردی توانبخشی ذهنی — خط پایه'),
        el('span', { class: 'badge badge--neutral' }, 'ثبت نشده')),
      el('div', { class: 'cell-sub' }, 'شش حیطهٔ شناختی پایه (توجه پایدار، توجه انتخابی، حافظهٔ کاری، بازداری، انعطاف، حل مسئله) با دادهٔ خام و سطح راهنما — آزمونِ درمانگر در مرکز حین جلسهٔ اول؛ ملاک هر حیطه از چک‌لیست ۷ حیطه‌ای.'),
      el('div', { class: 'clx-probe__metrics' },
        ...REHAB_FX_AREAS.map((a) => el('div', { class: 'clx-probe__metric' }, el('span', {}, a.label), el('b', {}, a.unit)))),
      act,
      rehabFxScienceNote()));
}

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

function gateActionOf(g, { student, gates, typesById, anamnesisTypeId, canDecide, refresh, skillsMode, events, isRehabCase }) {
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
      if (skillsMode === SKILL_MODE_SLD) {
        if (!canDecide) return null;
        const nextProbe = PROBE_AREAS.find((a) => !probeEventOf(a, events, typesById));
        return nextProbe
          ? act(GATE_GLOSS.skills.learningActionLabel, 'btn--soft', () => openProbeModal(nextProbe, student, refresh))
          : null;
      }
      if (isRehabCase) {
        if (!canDecide) return null;
        return act(GATE_GLOSS.skills.rehabActionLabel, 'btn--soft', () => openRehabFxModal(student, refresh));
      }
      return act(GATE_GLOSS.skills.rehabActionLabel, 'btn--soft', () => {
        const iv = document.getElementById('clxacc-intervention');
        if (iv && !iv.open) iv.open = true;
        // A14: اسکرول نرم از گات reduced-motion عبور می‌کرد (الگوی charts.js)
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        requestAnimationFrame(() => document.getElementById('ot-checklist-anchor')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }));
      });
    default:
      return null;
  }
}

// پارامتر بلااستفادهٔ insights حذف شد (کد مردهٔ امضای تابع)
function wechslerConnections({ formulation, gates }) {
  const lines = [];
  const w = gates?.wechslerSummary ?? null;

  const link = formulation?.wechslerLink ?? null;
  if (link) {
    const bits = [];
    if (link.iqValue != null) bits.push(`${link.iqBasis === 'GAI' ? 'GAI' : 'FSIQ'} = ${fa(link.iqValue)}`);
    if ((link.indicesFa ?? []).length) bits.push(link.indicesFa.join(' — '));
    if (bits.length) lines.push(`صورت‌بندی پرونده روی نیم‌رخ وکسلر سوار است: ${bits.join(' · ')}`);
  }

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

const RESULTS_LABELS = {
  ...RESULTS_EVENT_LABELS,
  [NEEDS_KEY]: 'نتیجهٔ نیاز ویژه',
  [OT_SESSION_KEY]: 'جلسهٔ کاردرمانی ذهنی'
};

const rowStatusBadge = (e) =>
  e.status === 'completed' ? el('span', { class: 'badge badge--success' }, 'ثبت‌شده')
    : e.status === 'draft' ? el('span', { class: 'badge badge--warning' }, 'پیش‌نویس')
      : e.status === 'pending_family' ? el('span', { class: 'badge badge--warning' }, 'در انتظار پاسخ')
        : el('span', { class: 'badge badge--neutral' }, e.status ? 'وضعیت دیگر' : '—'); /* S4-16: وضعیت ناشناختهٔ آینده انگلیسی خام نمی‌شود */

// نشان پاسخ‌دهنده: چک‌لیستِ پرشده توسط خانواده/معلم مشخص است
function informantBadgeOf(e) {
  if (!e.filledByChatId) return null;
  const tName = e.payload?.['teacher_name']?.value;
  return el('span', { class: 'badge badge--accent', style: { fontSize: 'var(--fs-2xs)', padding: '1px 8px' } }, /* S4-14 */
    tName ? `پاسخ معلم: ${tName}` : 'پاسخ خانواده');
}

function eventRowsBlock({ events, typesById, keys, cap = 6, expandable = true, onOpen = null }) {
  const wantedIds = new Set(keys.map((k) => typesById.get(k)?.id).filter(Boolean));
  const wantedKeyOf = (typeId) => {
    for (const [k, t] of typesById) if (t.id === typeId) return k;
    return null;
  };
  const mine = (events ?? []).filter((e) => wantedIds.has(e.eventTypeId) && e.status !== 'cancelled');
  if (!mine.length) return { count: 0, node: null };

  const rows = mine.map((e) => {
    const k = wantedKeyOf(e.eventTypeId);
    const clickable = Boolean(onOpen); // ردیف‌ها کلیک‌پذیر: جزئیات + تفسیر مستقیم باز می‌شود
    return el('div', {
      ...(clickable ? {
        role: 'button', tabindex: '0', class: 'clx-row--link',
        onclick: () => onOpen(e),
        onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(e); } } /* S4-19: Space هم */
      } : {})
    },
      el('span', { style: { fontWeight: 600, fontSize: 'var(--fs-sm)' } }, e.typeTitle ?? RESULTS_LABELS[k] ?? 'فرم'),
      rowStatusBadge(e),
      informantBadgeOf(e),
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

function seenChipsBlock(insights) {
  const seenTitles = insights.dataCoverage?.seenTitles ?? [];
  return el('div', { class: 'clx-sub' },
    el('div', { class: 'clx-sub__title' }, icon('clip', 14), SYNTHESIS_META.seenTitle),
    seenTitles.length
      ? el('div', { class: 'clx-chips' }, seenTitles.map((t) => el('span', { class: 'badge badge--neutral' }, t)))
      : el('div', { class: 'cell-sub' }, 'هنوز ابزاری ثبت نشده است.'));
}

// جابه‌جایی رتبهٔ هر هدف نسبت به اسنپ‌شات قبلی لج (آینهٔ rankMovementsOf سمت سرور)
function logMovementOf(current, previous) {
  const map = {};
  const prevIdx = new Map((previous ?? []).map((h, i) => [h.targetKey, i]));
  (current ?? []).forEach((h, i) => {
    const p = prevIdx.get(h.targetKey);
    map[h.targetKey] = p === undefined ? 'new' : i < p ? 'up' : i > p ? 'down' : 'same';
  });
  return map;
}

// نوار مالک‌های استثنایی فعال در سطح پرونده (از دادهٔ موجود، نه ورودی جدید)
function exclusionsStrip(insights) {
  const hits = insights.exclusions ?? [];
  if (!hits.length) return null;
  return el('div', { class: 'clx-sub' },
    el('div', { class: 'clx-sub__title' }, icon('shield', 14), EXCLUSION_META.activeTitle),
    el('div', { class: 'clx-chips' },
      ...hits.map((h) => el('span', {
        class: `badge ${h.strength === 'danger' ? 'badge--warning' : 'badge--neutral'}`,
        title: h.evidenceFa
      }, h.titleFa))));
}

// جدول افتراق سه‌سطری: هر رقیب با وضعیت پوشش و دکمهٔ ارسال فرم مرتبط
function differentialSection({ student, insights, events, typesById, refresh }) {
  const isSld = (k) => ['dyslexia', 'dysgraphia', 'dyscalculia'].includes(k);
  if (!(insights.ranked ?? []).some((h) => isSld(h.targetKey))) return null;
  const completedIds = new Set((events ?? []).filter((e) => e.status === 'completed').map((e) => e.eventTypeId));
  const rows = DIFF_META.rows.map((row) => {
    const covered = row.formKeys.some((k) => completedIds.has(typesById.get(k)?.id));
    const rival = (insights.ranked ?? []).find((h) => h.targetKey === row.key);
    return el('tr', {},
      el('td', {},
        el('strong', {}, row.title),
        el('div', { class: 'cell-sub' }, row.why)),
      el('td', {},
        rival
          ? el('span', { class: `badge ${CONFIDENCE_BADGE[rival.confidence] ?? 'badge--neutral'}` }, `فرضیهٔ رقیب — امتیاز ${fa(rival.score)}`)
          : covered
            ? el('span', { class: 'badge badge--success' }, DIFF_META.coveredLabel)
            : el('span', { class: 'badge badge--neutral' }, DIFF_META.noneLabel)),
      el('td', {},
        el('button', {
          class: 'btn btn--soft btn--sm',
          onclick: () => openCaseEventForm({ student, onlyKeys: row.formKeys, pickerTitle: `فرم مرتبط با «${row.title}»`, onSaved: refresh })
        }, icon('send', 14), DIFF_META.sendLabel))
    );
  });
  return el('div', { class: 'clx-section' },
    el('div', { class: 'clx-section__title' }, icon('compass', 16), DIFF_META.title),
    el('div', { class: 'cell-sub' }, DIFF_META.hint),
    el('div', { class: 'table-wrap' },
      el('table', { class: 'table clx-diff' },
        el('thead', {}, el('tr', {}, el('th', {}, 'رقیب'), el('th', {}, 'وضعیت پوشش'), el('th', { style: { width: '150px' } }, ''))),
        el('tbody', {}, rows))));
}

// لج فرضیه: پنج اسنپ‌شات آخر از رویدادهای پرونده، با نشان جابه‌جایی رتبه
function hypothesisLogSection(events) {
  const logs = (events ?? [])
    .filter((e) => e.status === 'completed' && e.payload?.fingerprint)
    .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
    .slice(0, 5);
  if (!logs.length) return null;
  const rows = logs.map((log, idx) => {
    const cur = log.payload.ranked ?? [];
    const prev = idx + 1 < logs.length ? (logs[idx + 1].payload?.ranked ?? null) : null;
    const mv = logMovementOf(cur, prev);
    return el('div', { class: 'clx-hyplog__row' },
      el('span', { class: 'cell-sub clx-hyplog__date' }, formatJalaliDateTime(log.occurredAt)),
      el('div', { class: 'clx-chips' },
        ...cur.map((h, i) => {
          const m = mv[h.targetKey] ?? 'same';
          const marker = m === 'same' ? '' : ` ${HYP_LOG_META.movement[m] ?? ''}`;
          const ruling = h.needsExclusionRuling ? ` · ${HYP_LOG_META.rulingTag}` : '';
          return el('span', { class: `badge ${HYP_LOG_META.movementCls[m] ?? 'badge--neutral'}`, title: h.targetTitle },
            `${fa(i + 1)}. ${h.targetTitle} — امتیاز ${fa(h.score)}${marker}${ruling}`);
        })));
  });
  return el('div', { class: 'clx-section' },
    el('div', { class: 'clx-section__title' }, icon('clock', 16), HYP_LOG_META.title),
    el('div', { class: 'clx-hyplog' }, ...rows));
}

// ترکیب متن هدف از چهار پرسش SMART — حداقل «رفتار قابل‌مشاهده» لازم است
function composeSmartGoal(v) {
  const behavior = String(v?.behavior ?? '').trim();
  if (!behavior) return null;
  const metric = String(v?.metric ?? '').trim();
  const criterion = String(v?.criterion ?? '').trim();
  const deadline = String(v?.deadline ?? '').trim();
  let text = behavior;
  if (metric) text += ` — با سنجهٔ «${metric}»`;
  if (criterion) text += ` تا ${criterion}`;
  if (deadline) text += ` (مهلت: ${deadline})`;
  return text;
}

// ساخت مسیر با نویسندهٔ هدف SMART: ثبت با هدف یا پرش («ثبت بدون هدف»)
function openPathCreateWithGoal({ student, targetKey, targetTitle, action, refresh }) {
  const proceed = async (goal) => {
    try {
      const created = (await api.post(`/api/students/${student.id}/clinical-paths`, { target_key: targetKey, goal })).data;
      if (action === 'confirm') {
        await api.post(`/api/clinical-paths/${created.id}/decision`, { action: 'confirm' });
        toast('مسیر مداخله فعال شد — چک‌لیست مراحل پایین آماده است', 'success');
      } else {
        toast('پیشنهاد ثبت شد — در «مسیرهای مداخله» پایین برای بازبینی', 'success');
      }
      refresh();
      return true;
    } catch (err) { toastError(err); return false; }
  };
  formModal({
    title: `${BASIS_META.goalModalTitle} — «${targetTitle}»`,
    submitLabel: 'ثبت هدف و ادامه',
    secondary: { label: BASIS_META.goalSkip, onClick: async () => proceed(null) },
    fields: BASIS_META.goalFields.map((f) => ({ ...f, span: 2 })),
    onSubmit: async (vals) => {
      const goal = composeSmartGoal(vals);
      if (!goal) {
        toast('حداقل «رفتار قابل‌مشاهده» را بنویسید — یا «ثبت بدون هدف» را بزنید', 'warning');
        return false;
      }
      return proceed(goal);
    }
  });
}

function hypothesisCard(h, rank, { student, paths, canDecide, refresh, conv, basis }) {
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
              title: `تأیید هدف «${h.targetTitle}»`,
              message: 'با تأیید، این هدف به‌عنوان هدف درمانی نهایی ثبت و مسیر مداخله فعال می‌شود.',
              confirmLabel: 'تأیید و فعال‌سازی'
            });
            if (!ok) return;
            // نویسندهٔ هدف SMART: ثبت با هدف یا پرش («ثبت بدون هدف»)
            openPathCreateWithGoal({ student, targetKey: h.targetKey, targetTitle: h.targetTitle, action: 'confirm', refresh });
          }
        }, icon('check', 15), 'تأیید و فعال‌سازی مسیر'),
        el('button', {
          class: 'btn btn--soft btn--sm',
          onclick: () => {
            // نویسندهٔ هدف SMART برای ثبت پیشنهاد هم
            openPathCreateWithGoal({ student, targetKey: h.targetKey, targetTitle: h.targetTitle, action: 'suggest', refresh });
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
        // بج «نیاز به رد استثنا»: مالک پررنگ فعال است؛ تصمیم مسدود نیست ولی منصفانه دیرتر می‌شود
        h.needsExclusionRuling
          ? el('span', { class: 'badge badge--accent clx-excl-badge', title: EXCLUSION_META.rulingHint }, icon('shield', 13), EXCLUSION_META.rulingBadge)
          : null,
        el('span', { class: 'cell-sub', title: 'جمع وزن شواهد — عدد راهنما' }, `امتیاز شواهد: ${fa(h.score)}`)
      ),
      el('div', { class: 'clx-chips' },
        countChip('برآورده', cs.met, 'badge--success'),
        countChip('ناقص', cs.partial, 'badge--warning'),
        countChip('بررسی', cs.unknown, 'badge--info'),
        countChip('رد', cs.notMet, 'badge--neutral'),
        // کسر رتبهٔ وزن‌دار مالک‌های استثنایی همین فرضیه
        h.exclusionPenalty
          ? el('span', { class: 'badge badge--warning', title: EXCLUSION_META.penaltyHint }, `${EXCLUSION_META.penaltyLabel}: ${fa(h.exclusionPenalty)}`)
          : null
      ),
      conv ? el('div', { class: 'clx-sub' },
        el('div', { class: 'clx-sub__title' }, 'هم‌گرایی منابع:'),
        el('div', { class: 'clx-conv' },
          el('span', { class: `badge ${CONV_BADGE[conv.state] ?? 'badge--neutral'}` }, icon(CONV_ICON[conv.state] ?? 'eye', 13), conv.state),
          el('div', { class: 'cell-sub' }, conv.implicationFa))) : null,
      h.evidenceFa?.length ? el('div', { class: 'clx-sub' },
        el('div', { class: 'clx-sub__title' }, 'شواهد:'),
        iconList(h.evidenceFa, 'check', 'ok')) : null,
      // مالک‌های استثنایی مرتبط با همین فرضیه
      h.exclusionsFa?.length ? el('div', { class: 'clx-sub' },
        el('div', { class: 'clx-sub__title' }, icon('shield', 14), 'مالک‌های استثنایی این فرضیه:'),
        iconList(h.exclusionsFa, 'alert', 'diff')) : null,
      // مبنای پیشنهاد (اگر — آنگاه) از قواعد فعالِ دادهٔ پرونده
      basis?.rules?.length ? el('div', { class: 'clx-sub' },
        el('div', { class: 'clx-sub__title' }, icon('zap', 14), BASIS_META.suggestTitle),
        iconList(basis.rules.map((r) => `اگر ${r.ifFa} ← آنگاه ${r.thenFa} (منبع: ${r.sourceFa})`), 'zap', 'diff')) : null,
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
            // زبان «لایه» از رابط کاربری حذف شد؛ ارجاع فقط به بخش «مداخله»
            `برای این هدف مسیر «${PATH_STATUS_LABEL[livePath.status]}» ثبت است — تصمیم در بخش «مداخله» همین تب، فهرست مسیرهای طرح درمان.`)
        : null,
      actions
    )
  );
}

function criteriaGroups(criteria, ranked) {
  const titleOf = {};
  for (const h of ranked ?? []) titleOf[h.targetKey] = h.targetTitle;
  const groups = new Map();
  for (const c of criteria ?? []) {
    if (!groups.has(c.targetKey)) groups.set(c.targetKey, []);
    groups.get(c.targetKey).push(c);
  }
  if (groups.size === 0) return null;

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
                  el('td', {},
                    el('span', { class: `badge ${st.cls}` }, st.label),
                    // مالک استثنایی فعال روی همین ملاک (معمولاً ملاک D)
                    ...(c.exclusionsFa?.length
                      ? [el('div', { class: 'clx-crit__excl' }, ...c.exclusionsFa.map((x) => el('span', { class: 'badge badge--warning' }, x)))]
                      : [])),
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
        { name: 'note', type: 'textarea', label: 'یادداشت (دلیل اصلاح — برای بهبود جمع‌بندی‌های بعدی)', rows: 2 }
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
        { name: 'note', type: 'textarea', label: 'دلیل رد (اجباری — برای بهبود جمع‌بندی‌های بعدی)', required: true, rows: 3 }
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

const TEMPLATE_PROTOCOL_BADGE = {
  learning: { cls: 'badge--info', label: 'یادگیری' },
  slow_learner: { cls: 'badge--warning', label: 'دیرآموز' },
  mental_ot: { cls: 'badge--accent', label: 'کاردرمانی ذهنی' },
  rehab: { cls: 'badge--success', label: 'توانبخشی' }
};

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
  if (!templates.length) { toast('طرحی فعال نیست — از تب «طرح درمان» بنویسید'); return; }

  const targetOptions = targets.map((t) => ({ value: t.key, label: `${t.title} — ${t.group === 'clinical' ? 'هدف بالینی' : 'پشتیبان'}` }));

  formModal({
    title: 'ساخت مسیر مداخله از طرح درمان',
    submitLabel: 'ساخت مسیر',
    fields: [
      { name: 'template_key', type: 'select', label: 'طرح درمان', required: true, placeholder: 'انتخاب کنید…', value: presetKey,
        options: templates.map((t) => ({
          value: t.key,
          label: t.sessions?.length ? `${t.title} — ${fa(t.sessions.length)} جلسهٔ آماده` : t.title
        })),
        hint: 'طرح درمان، گام‌های استاندارد و پروتکل جلسه‌به‌جلسه (هدف + معیار + کارت‌ها) را روی این پرونده کپی می‌کند — بعداً جلسه‌به‌جلسه قابل ویرایش است.' },
      { name: 'target_key', type: 'select', label: 'هدف درمانی (الزامی برای طرح‌های بی‌هدف)', options: targetOptions, placeholder: 'انتخاب کنید…' },
      { name: 'note', type: 'textarea', label: 'یادداشت (اختیاری)', rows: 2 }
    ],
    onSubmit: async (vals) => {
      if (!vals.template_key) { toast('طرح درمان را انتخاب کنید'); return false; }
      const tpl = templates.find((t) => t.key === vals.template_key);
      if (tpl && !tpl.targetKey && !vals.target_key) {
        toast('این طرح هدف پیش‌فرض ندارد — هدف درمانی را انتخاب کنید'); return false;
      }
      try {
        await api.post(`/api/students/${student.id}/clinical-paths`, {
          template_key: vals.template_key,
          target_key: vals.target_key || null,
          note: vals.note || null
        });
        toast('مسیر از طرح درمان ساخته شد — در فهرست پایین بازبینی/فعال‌سازی کنید', 'success');
        refresh();
        return true;
      } catch (err) { toastError(err); return false; }
    }
  });
}

function pathBand(p) {
  const steps = p.steps ?? [];
  if (!steps.length) return null;
  const doneCount = steps.filter((s) => s.doneAt).length;
  return el('div', { class: 'path-band', role: 'progressbar', title: `نوار مداخله — ${fa(doneCount)} از ${fa(steps.length)} سگمنت`, 'aria-label': `پیشروی مسیر — ${fa(doneCount)} از ${fa(steps.length)} جلسه`, 'aria-valuemin': '0', 'aria-valuemax': String(steps.length), 'aria-valuenow': String(doneCount) }, /* S4-18 */
    ...steps.map((s) => el('div', {
      class: `path-band__seg${s.doneAt ? ' is-done' : ''}`,
      title: `${s.title}${s.doneAt ? ' — انجام‌شده' : ''}`
    }))
  );
}

// پیش‌نمایش کارتِ پیوسته (کارتِ لینک‌دار → رکورد زندهٔ «کارت‌های آماده» — )
async function openLinkedExercisePreview(exerciseId) {
  let ex;
  try {
    const res = await api.get(`/api/exercises/${exerciseId}`);
    ex = res.data;
  } catch (err) { toastError(err); return; }
  if (!ex) { toast('تمرین یافت نشد — ممکن است حذف شده باشد', 'warning'); return; }
  const FORMAT_LABELS = { worksheet: 'کاربرگ', game: 'بازی', instruction: 'دستورالعمل خانه', family: 'آموزش خانواده' };
  const files = Array.isArray(ex.files) ? ex.files : [];
  const downloadFile = async (f) => {
    try {
      const url = f?.id ? `/api/exercises/${ex.id}/files/${f.id}` : `/api/exercises/${ex.id}/file`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('cs.token') ?? ''}` } });
      if (!res.ok) throw new Error('دریافت فایل ناموفق بود');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = el('a', { href: objUrl, download: f?.filename ?? 'exercise' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
    } catch (err) { toastError(err); }
  };
  openModal({
    title: 'کارت پیوسته به کتابخانه',
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
        el('b', {}, ex.title),
        el('span', { class: 'badge badge--neutral' }, FORMAT_LABELS[ex.format] ?? ex.format),
        ...((ex.tags ?? []).slice(0, 4).map((t) => el('span', { class: 'badge badge--neutral' }, t.name)))),
      ex.description ? el('div', { class: 'cell-sub' }, ex.description) : null,
      ex.externalUrl ? el('a', { class: 'btn btn--soft btn--sm', href: ex.externalUrl, target: '_blank', rel: 'noopener' }, icon('link', 13), 'بازی/منبع آنلاین') : null,
      ...(files.length ? files.map((f) => el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        el('span', { class: 'cell-sub' }, f.filename),
        el('button', { class: 'btn btn--soft btn--sm', onclick: () => downloadFile(f) }, icon('download', 12), 'دانلود'))) : []),
      el('div', { class: 'cell-sub' }, 'متن کارت در جلسه، اسنپ‌شاتِ عنوان در لحظهٔ درج است — تغییر نام کارت در کتابخانه، کارت‌های قبلی را نمی‌شکند.'))
  });
}

// برچسب سنجه از متن کارت پراپ (پیشوند «پراپ:» برداشته می‌شود) برای پیش‌پرکردن فرم
function probeMetricFromCard(text) {
  return String(text ?? '').replace(/^\s*پراپ\s*[:：]\s*/, '').trim().slice(0, 40);
}

// پنل «پیشروی پراپ»: fetch تنبل (اولین باز شدن)، فرم ثبت برای مدیر/درمانگرِ مسئول،
// کارت روند با خط ملاک، داوری روند و بج تسلط. ملاک پیش‌فرض ۸۰٪ و با ورودی عددی عوض می‌شود (?threshold=).
function pathProbesPanel(p, { sessions, canManage, refresh }) {
  const VERDICT_BADGE = {
    improving: 'badge--success',
    gradual: 'badge--success',
    plateau: 'badge--neutral',
    insufficient: 'badge--neutral',
    slight_decline: 'badge--warning',
    regressed: 'badge--error'
  };

  let threshold = 80;
  let state = null; // { metrics, total } از GET /probes
  let selectedMetric = null;
  let loaded = false;

  const countBadge = el('span', { class: 'badge badge--neutral' }, `${fa(p.probeSummary?.count ?? 0)} پراپ`);
  const verdictBadge = el('span', { class: 'badge badge--neutral', style: { display: 'none' } });
  const masteryBadge = el('span', { class: 'badge badge--success', style: { display: 'none' } });

  const metricInput = el('input', { class: 'input', list: `probe-metrics-${p.id}`, placeholder: 'سنجه — مثلاً: واژهٔ درست در دقیقه' });
  const datalist = el('datalist', { id: `probe-metrics-${p.id}` }, PATH_PROBE_METRIC_PRESETS.map((m) => el('option', { value: m.metric })));
  const valueInput = el('input', { class: 'input', inputmode: 'decimal', placeholder: 'اندازه — مثلاً ۸۲' });
  const unitInput = el('input', { class: 'input', placeholder: 'واحد' });
  const dateInput = el('input', { class: 'input', inputmode: 'numeric', placeholder: `تاریخ — خالی = امروز (${formatJalaliNumeric(tehranTodayYmd())})` });
  const sessionSel = el('select', { class: 'input' },
    el('option', { value: '' }, 'بدون اتصال به جلسه'),
    ...sessions.map((s) => el('option', { value: s.id }, `جلسهٔ ${fa(s.ord)} — ${s.title.slice(0, 34)}`)));

  // واحد خودکار: انتخاب سنجه از پیش‌فرض‌ها، واحد را پر می‌کند (دستی هم قابل ویرایش)
  metricInput.addEventListener('input', () => {
    const preset = PATH_PROBE_METRIC_PRESETS.find((m) => m.metric === metricInput.value.trim());
    if (preset) unitInput.value = preset.unit;
  });

  function currentSeries() {
    if (!state || !state.metrics.length) return null;
    return state.metrics.find((m) => m.metric === selectedMetric) ?? state.metrics[0];
  }

  function updateHeader() {
    const s = currentSeries();
    countBadge.textContent = `${fa(state ? state.total : (p.probeSummary?.count ?? 0))} پراپ`;
    if (!s) {
      verdictBadge.style.display = 'none';
      masteryBadge.style.display = 'none';
      return;
    }
    verdictBadge.className = `badge ${VERDICT_BADGE[s.verdict.key] ?? 'badge--neutral'}`;
    verdictBadge.textContent = s.verdict.label;
    verdictBadge.style.display = '';
    if (s.mastery.achieved) {
      masteryBadge.className = 'badge badge--success';
      masteryBadge.textContent = PATH_PROBE_MASTERY_LABELS.achieved(fa(s.mastery.threshold));
    } else {
      masteryBadge.className = 'badge badge--neutral';
      masteryBadge.textContent = PATH_PROBE_MASTERY_LABELS.pending(fa(s.mastery.threshold));
    }
    masteryBadge.style.display = '';
  }

  const bodyBox = el('div', { class: 'path-probes__body' });

  function seriesCard(s) {
    const th = s.mastery.threshold;
    const pts = s.points.map((pt) => ({ x: formatJalaliShort(tehranYmdOfIso(pt.takenAt)), y: pt.value }));
    const yHi = Math.max(...s.points.map((pt) => pt.value), th);
    // خط هدف: از خط پایه با گام هفتگی ثابت (ملاک − پایه)/۶ هفته تا آخرین داده؛ فقط برای ترسیم
    let goalLine = null;
    if (pts.length > 1 && th > pts[0].y) {
      const days = (new Date(s.points[s.points.length - 1].takenAt) - new Date(s.points[0].takenAt)) / 864e5;
      const weeks = Math.min(6, Math.max(days / 7, 1 / 7));
      const toY = Math.min(th, pts[0].y + ((th - pts[0].y) / 6) * weeks);
      if (toY > pts[0].y) goalLine = { fromY: pts[0].y, toY, label: `خط هدف (${fa(Math.round(((th - pts[0].y) / 6) * 100) / 100)} در هفته)` };
    }
    const FOUR_BADGE = { rising: 'badge--success', falling: 'badge--warning', indeterminate: 'badge--neutral', insufficient: 'badge--neutral' };
    const STALL_BADGE = { continue: 'badge--success', dose: 'badge--warning', change: 'badge--error', none: 'badge--info' };
    const monitorRow = s.monitor
      ? el('div', { class: 'path-probes__monitor' },
          el('span', { class: `badge ${FOUR_BADGE[s.monitor.fourPoint.key] ?? 'badge--neutral'}`, title: 'قاعدهٔ ۴-نقطه: چهار دادهٔ آخر از ۶–۸ دادهٔ نخست نسبت به خط پایه' }, s.monitor.fourPoint.label),
          el('span', { class: `badge ${STALL_BADGE[s.monitor.stall.key] ?? 'badge--neutral'}`, title: s.monitor.stall.hint }, `تصمیم پیشنهادی: ${s.monitor.stall.label}`),
          el('span', { class: 'cell-sub' }, s.monitor.stall.hint))
      : null;
    return el('div', { class: 'path-probes__trend' },
      el('div', { class: 'path-probes__trendhead' },
        el('b', {}, s.metric),
        s.unit ? el('span', { class: 'badge badge--neutral' }, `واحد: ${s.unit}`) : null,
        el('span', { class: 'cell-sub' },
          `آخرین: ${s.latestValue != null ? fa(Math.round(s.latestValue * 100) / 100) : '—'} · ${fa(s.count)} پراپ`)),
      lineChart({ points: pts, yMin: 0, yMax: yHi, threshold: { value: th, label: `خط ملاک ${fa(th)}٪` }, goalLine }),
      monitorRow,
      el('p', { class: 'cell-sub path-probes__verdicttext' }, s.verdict.text));
  }

  function renderBody() {
    const s = currentSeries();
    if (!s) {
      bodyBox.replaceChildren(el('p', { class: 'cell-sub' }, 'هنوز پراپی ثبت نشده — با فرم زیر اولین اندازه‌گیری را ثبت کنید.'));
      return;
    }
    const metricPick = state.metrics.length > 1
      ? el('select', { class: 'input path-probes__metricpick', 'aria-label': 'انتخاب سنجه', onchange: (e) => { selectedMetric = e.target.value; updateHeader(); renderBody(); } },
          ...state.metrics.map((m) => el('option', { value: m.metric, selected: m.metric === s.metric }, m.metric)))
      : null;
    const thresholdInput = el('input', { class: 'input path-probes__threshold-in', type: 'number', min: '1', max: '100', value: String(threshold) });
    thresholdInput.addEventListener('change', async () => {
      const v = Number(thresholdInput.value);
      if (!Number.isFinite(v) || v < 1 || v > 100) { thresholdInput.value = String(threshold); return; }
      threshold = v;
      await load(); // ملاک عوض شد: با ?threshold= دوباره خوانده می‌شود
    });
    bodyBox.replaceChildren(
      el('div', { class: 'path-probes__toolbar' }, metricPick, thresholdPickRow(thresholdInput)),
      seriesCard(s)
    );
  }

  function thresholdPickRow(input) {
    return el('label', { class: 'path-probes__threshold' }, 'ملاک تسلط (٪):', input);
  }

  async function load() {
    try {
      const qs = threshold !== 80 ? `?threshold=${threshold}` : '';
      const res = await api.get(`/api/clinical-paths/${p.id}/probes${qs}`);
      state = res.data;
      if (!selectedMetric || !state.metrics.some((m) => m.metric === selectedMetric)) {
        selectedMetric = state.metrics[0]?.metric ?? null;
      }
      loaded = true;
      updateHeader();
      renderBody();
    } catch (err) { toastError(err); }
  }

  const submitBtn = el('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('plus', 13), 'ثبت پراپ');
  submitBtn.addEventListener('click', async () => {
    const metric = metricInput.value.trim();
    if (metric.length < 2) { toast('نام سنجه را بنویسید (حداقل ۲ نویسه)'); metricInput.focus(); return; }
    const raw = enDigits(valueInput.value).replace('٫', '.').trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value < 0) { toast('اندازهٔ پراپ را به‌صورت عدد وارد کنید'); valueInput.focus(); return; }
    const payload = { metric, value };
    if (unitInput.value.trim()) payload.unit = unitInput.value.trim();
    if (dateInput.value.trim()) {
      const gYmd = parseJalaliInput(dateInput.value);
      if (!gYmd) { toast('تاریخ را به شکل ۱۴۰۴/۰۵/۱۲ وارد کنید'); dateInput.focus(); return; }
      payload.taken_at = tehranDayRange(gYmd).start; // پراپِ تاریخ‌دار در ابتدای همان روز تهران ثبت می‌شود
    }
    if (sessionSel.value) payload.session_id = sessionSel.value;
    submitBtn.disabled = true;
    try {
      await api.post(`/api/clinical-paths/${p.id}/probes`, payload);
      toast('پراپ ثبت شد', 'success');
      valueInput.value = '';
      await load();
      refresh(); // شمارش/بج سرستون کارت هم به‌روز شود
    } catch (err) { toastError(err); }
    finally { submitBtn.disabled = false; }
  });

  const formBox = canManage
    ? el('div', { class: 'path-probes__form' },
        fieldWrap('سنجه', metricInput),
        fieldWrap('اندازه', valueInput),
        fieldWrap('واحد', unitInput),
        fieldWrap('تاریخ', dateInput),
        el('div', { class: 'path-probes__submit' }, submitBtn),
        el('div', { class: 'path-probes__session' }, sessionSel))
    : null;

  function fieldWrap(label, input) {
    return el('label', { class: 'path-probes__field' }, el('span', { class: 'path-probes__label' }, label), input);
  }

  const details = el('details', { class: 'path-probes' },
    el('summary', {}, icon('activity', 14), el('span', { class: 'path-probes__title' }, 'پیشروی پراپ'), countBadge, verdictBadge, masteryBadge),
    bodyBox,
    formBox,
    datalist);
  details.addEventListener('toggle', () => { if (details.open && !loaded) load(); });

  return {
    el: details,
    // «ثبت نتیجه» روی کارت پراپ: باز کردن پنل + پیش‌پرکردن سنجه از متن کارت
    openWith(metric) {
      details.open = true;
      if (metric) {
        metricInput.value = metric;
        metricInput.dispatchEvent(new Event('input'));
      }
      if (!loaded) load();
      metricInput.focus();
    }
  };
}

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

  // ساخت/ویرایش جلسه با ویرایشگر کارت: هدف + معیار تسلط + (نتیجه در ویرایش) + کارت‌ها
  function openSessionModal(s = null) {
    const isEdit = Boolean(s);
    const titleInput = el('input', { class: 'input', placeholder: 'مثلاً: جلسهٔ ۱ — آشنایی و خط‌مایهٔ خواندن' });
    titleInput.value = s?.title ?? '';
    const planTa = el('textarea', { class: 'textarea', rows: 2, placeholder: 'هدف این جلسه چیست؟ (مثلاً: تفکیک آواهای اول واژه)' });
    planTa.value = s?.plan ?? '';
    const critTa = el('textarea', { class: 'textarea', rows: 2, placeholder: 'معیار تسلط — چطور بفهمیم جلسه موفق بود؟ (مثلاً: ۸۰٪ ایتم‌های پراپ)' });
    critTa.value = s?.criterion ?? '';
    const outcomeTa = el('textarea', { class: 'textarea', rows: 2, placeholder: 'نتیجهٔ جلسه پس از اجرا — پراپ/مشاهدهٔ درمانگر' });
    outcomeTa.value = s?.outcome ?? '';
    // چک‌لیست وفاداری اجرا (فقط در ویرایش جلسه — مال جلسهٔ انجام‌شده است)
    const FIDELITY_ITEMS = [
      { key: 'protocol', label: 'پروتکل کامل اجرا شد' },
      { key: 'homework', label: 'تمرین خانگی تنظیم شد' },
      { key: 'parent', label: 'حضور/هماهنگی والد برقرار بود' }
    ];
    const fidelityBoxes = isEdit
      ? FIDELITY_ITEMS.map((it) => {
          const cb = el('input', { type: 'checkbox' });
          cb.checked = Boolean(s?.fidelity?.[it.key]);
          return { key: it.key, label: it.label, cb };
        })
      : null;
    const cards = cardListEditor({ items: s?.items ?? [], showDone: isEdit, canEdit: true });

    const saveBtn = el('button', { class: 'btn btn--primary', type: 'button', onclick: onSave }, isEdit ? 'ذخیره جلسه' : 'افزودن جلسه');
    let closeFn = null;
    async function onSave() {
      const title = titleInput.value.trim();
      if (title.length < 2) { toast('عنوان جلسه را بنویسید'); titleInput.focus(); return; }
      const payload = {
        title,
        plan: planTa.value.trim() || null,
        criterion: critTa.value.trim() || null,
        items: cards.collect()
      };
      if (isEdit) payload.outcome = outcomeTa.value.trim() || null;
      if (isEdit && fidelityBoxes) {
        // وفاداری اجرا همیشه با ذخیرهٔ جلسهٔ انجام‌شده می‌آید (سه بولی)
        payload.fidelity = Object.fromEntries(fidelityBoxes.map((f) => [f.key, f.cb.checked]));
      }
      saveBtn.disabled = true;
      try {
        if (isEdit) await api.patch(`/api/clinical-paths/${p.id}/sessions/${s.id}`, payload);
        else await api.post(`/api/clinical-paths/${p.id}/sessions`, payload);
        toast(isEdit ? 'جلسه به‌روزرسانی شد' : 'جلسه به برنامه اضافه شد', 'success');
        if (closeFn) closeFn();
        refresh();
      } catch (err) { toastError(err); }
      finally { saveBtn.disabled = false; }
    }
    openModal({
      title: isEdit ? `ویرایش جلسهٔ ${fa(s.ord)}` : `افزودن جلسهٔ ${fa(sessions.length + 1)} به برنامه`,
      wide: true,
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'عنوان جلسه'), titleInput),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'هدف جلسه'), planTa),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'معیار تسلط'), critTa),
        isEdit ? el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'نتیجهٔ جلسه'), outcomeTa) : null,
        isEdit && fidelityBoxes
          ? el('div', { class: 'field' },
              el('label', { class: 'field__label' }, 'وفاداری اجرا'),
              el('div', { class: 'fidelity-row' }, ...fidelityBoxes.map((f) => el('label', {}, f.cb, ` ${f.label}`))))
          : null,
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'کارت‌های جلسه'), cards.el)),
      actions: [
        (c) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: c }, 'انصراف'),
        (c) => { closeFn = c; return saveBtn; }
      ]
    });
  }

  // تیک کارت — بدون باز کردن مودال؛ همان لحظه در جلسه علامت می‌خورد
  async function toggleCardDone(s, card) {
    const items = (s.items ?? []).map((it) => ({
      type: it.type,
      text: it.text,
      done: it === card ? !it.done : Boolean(it.done),
      link_id: it.linkId ?? null
    }));
    try {
      await api.patch(`/api/clinical-paths/${p.id}/sessions/${s.id}`, { items });
      refresh();
    } catch (err) { toastError(err); }
  }

  const rowsBox = el('div', { class: 'path-sessions__rows' });
  let dragRow = null;

  // پنل پیشروی پراپ؛ قبل از ساخت ردیف‌ها ساخته می‌شود تا «ثبت نتیجه» کارت‌های پراپ به آن دسترسی داشته باشد
  const probesPanel = pathProbesPanel(p, { sessions, canManage, refresh });

  const rows = sessions.map((s) => {
    const cardRows = (s.items ?? []).map((it) => {
      const doneBox = canManage
        ? el('label', { class: 'path-session__carddone', title: 'انجام شد' },
            el('input', { type: 'checkbox' }))
        : null;
      if (doneBox) {
        const cb = doneBox.querySelector('input');
        cb.checked = it.done === true;
        cb.addEventListener('change', () => toggleCardDone(s, it));
      }
      return el('div', { class: `path-session__card${it.done ? ' is-done' : ''}` },
        doneBox,
        el('span', { class: `path-session__item path-session__item--${it.type}` },
          el('b', {}, `${SESSION_ITEM_LABELS[it.type] ?? it.type}:`), ' ', it.text),
        it.linkId
          ? el('button', { class: 'plan-chip-link', type: 'button', title: 'کارت پیوسته به کتابخانه — باز کردن پیش‌نمایش',
              onclick: () => openLinkedExercisePreview(it.linkId) }, icon('link', 11), 'کتابخانه')
          : null,
        // «ثبت نتیجه» روی کارت پراپ: باز کردن پنل پیشروی + پیش‌پرکردن سنجه از متن کارت
        it.type === 'probe' && canManage
          ? el('button', { class: 'btn btn--ghost btn--sm path-probes__cardbtn', type: 'button',
              title: 'ثبت اندازه‌گیری این پراپ در پایش پیشروی',
              onclick: () => probesPanel.openWith(probeMetricFromCard(it.text)) }, icon('activity', 11), 'ثبت نتیجه')
          : null);
    });

    return el('div', { class: `path-session is-${s.status}`, dataset: { id: s.id }, draggable: canManage },
      canManage && sessions.length > 1
        ? el('span', { class: 'path-session__grip', title: 'جابه‌جایی جلسه' }, icon('grip', 13))
        : null,
      el('span', { class: 'path-session__ord' }, fa(s.ord)),
      el('div', { class: 'path-session__main' },
        el('div', { class: 'path-session__title' }, s.title,
          el('span', { class: `badge ${STATUS_BADGE[s.status] ?? 'badge--neutral'}` }, STATUS_LABEL[s.status] ?? s.status)),
        s.plan ? el('div', { class: 'cell-sub path-session__goal' }, 'هدف: ', s.plan) : null,
        s.criterion ? el('div', { class: 'cell-sub path-session__crit' }, 'معیار تسلط: ', s.criterion) : null,
        cardRows.length ? el('div', { class: 'path-session__cards' }, ...cardRows) : null,
        s.status === 'done' && s.doneAt ? el('div', { class: 'cell-sub' }, `انجام: ${formatJalaliDateTime(s.doneAt)}`) : null,
        s.outcome ? el('div', { class: 'cell-sub path-session__outcome' }, 'نتیجه: ', s.outcome) : null,
        s.note ? el('div', { class: 'cell-sub' }, `یادداشت: ${s.note}`) : null
      ),
      canManage
        ? el('div', { class: 'path-session__ops' },
            el('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'ویرایش جلسه و کارت‌ها', 'aria-label': `ویرایش جلسهٔ ${fa(s.ord)}`,
              onclick: () => openSessionModal(s) }, icon('edit', 13)),
            s.status !== 'done'
              ? el('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'علامت‌زدن انجام‌شده', 'aria-label': `علامت‌زدن جلسهٔ ${fa(s.ord)} انجام‌شده`,
                  onclick: async () => { try { await api.patch(`/api/clinical-paths/${p.id}/sessions/${s.id}`, { status: 'done' }); refresh(); } catch (err) { toastError(err); } } }, icon('check', 13))
              : el('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'برگشت به برنامه‌ریزی‌شده', 'aria-label': `برگشت جلسهٔ ${fa(s.ord)} به برنامه‌ریزی‌شده`,
                  onclick: async () => { try { await api.patch(`/api/clinical-paths/${p.id}/sessions/${s.id}`, { status: 'planned' }); refresh(); } catch (err) { toastError(err); } } }, icon('undo', 13)),
            el('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'حذف جلسه', 'aria-label': `حذف جلسهٔ ${fa(s.ord)}`,
              onclick: async () => {
                const ok = await confirmModal({ title: `حذف جلسهٔ ${fa(s.ord)}`, message: `«${s.title}» از برنامهٔ جلسه به جلسه حذف شود؟`, confirmLabel: 'حذف' });
                if (!ok) return;
                try { await api.del(`/api/clinical-paths/${p.id}/sessions/${s.id}`); refresh(); } catch (err) { toastError(err); }
              } }, icon('trash', 13))
          )
        : null
    );
  });

  // درگ‌ودراپ جلسات؛ رهاسازی = یک فراخوان reorder روی سرور
  if (canManage && sessions.length > 1) {
    for (const row of rows) {
      row.addEventListener('dragstart', (e) => {
        dragRow = row;
        row.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', 'path-session'); } catch { /* اجباری نیست */ }
      });
      row.addEventListener('dragend', () => { row.classList.remove('is-dragging'); });
      row.addEventListener('dragover', (e) => {
        if (!dragRow || dragRow === row) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        const above = e.clientY < rect.top + rect.height / 2;
        rowsBox.insertBefore(dragRow, above ? row : row.nextSibling);
      });
      row.addEventListener('drop', async (e) => {
        e.preventDefault();
        const orderedIds = [...rowsBox.querySelectorAll('.path-session')].map((r) => r.dataset.id);
        if (orderedIds.join() === sessions.map((s) => s.id).join()) return; // ترتیب عوض نشد
        try {
          await api.post(`/api/clinical-paths/${p.id}/sessions/reorder`, { session_ids: orderedIds });
          toast('ترتیب جلسات ذخیره شد', 'success');
          refresh();
        } catch (err) { toastError(err); refresh(); }
      });
    }
  }
  rowsBox.replaceChildren(...rows);

  const addBtn = canManage
    ? el('button', {
        class: 'btn btn--soft btn--sm',
        onclick: () => openSessionModal(null)
      }, icon('plus', 14), 'افزودن جلسه')
    : null;

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

  // لینک «گزارش دوره»: گزارش چاپی تجمیعی همین طرح درمان (جلسات، کارت‌ها، نتیجه‌ها)
  const reportBtn = student?.id
    ? el('button', {
        class: 'btn btn--soft btn--sm',
        title: 'گزارش چاپی دورهٔ مداخله — تجمیع جلسات، کارت‌ها و نتیجه‌ها',
        onclick: () => { location.hash = `#/students/${student.id}/progress-report?pathway=${p.id}`; }
      }, icon('printer', 13), 'گزارش دوره')
    : null;

  return el('div', { class: 'path-sessions' },
    el('div', { class: 'clx-sub__title' }, 'برنامهٔ جلسه به جلسه',
      sessions.length ? el('span', { class: 'badge badge--neutral' }, `${fa(sessions.length)} جلسه`) : null,
      addBtn,
      reportBtn),
    canManage && sessions.length > 1 ? el('div', { class: 'cell-sub path-session__hint' }, 'جلسه‌ها را با دستگیرهٔ ⠿ جابه‌جا کنید — ترتیب همان‌جا ذخیره می‌شود.') : null,
    emptyLine,
    rowsBox,
    nextLine,
    probesPanel.el // پنل پیشروی پراپ (fetch تنبل روی باز شدن)
  );
}

function pathCard(p, { student, canDecide, refresh, insights }) {
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
    ? el('div', { class: 'cell-sub' }, `هدف پیشنهادی هنگام ثبت: ${p.engineHypothesis.targetTitle} — اطمینان ${p.engineHypothesis.confidence}`)
    : el('div', { class: 'cell-sub' }, 'هدف دستی درمانگر');

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

  // زنجیرهٔ «مبنا ← هدف ← معیار» روی کارت مسیر + برچسب «بدون هدف اندازه‌پذیر»
  const liveBasis = (insights?.basis ?? []).find((b) => b.targetKey === p.targetKey) ?? null;
  const chainBasis = p.goalBasis?.rules?.length
    ? p.goalBasis.rules.map((r) => r.ifFa).join(' · ')
    : (liveBasis?.rules?.length ? liveBasis.rules.map((r) => r.ifFa).join(' · ') : null);
  const chainCriterion = (p.sessions ?? []).find((s) => s.criterion)?.criterion ?? null;
  const chainBlock = (chainBasis || p.goal || chainCriterion)
    ? el('div', { class: 'clx-chain' },
        el('div', { class: 'clx-sub__title' }, icon('link', 14), BASIS_META.chainTitle),
        el('div', { class: 'clx-chain__row' },
          el('span', { class: 'badge badge--neutral' }, BASIS_META.chainBasis),
          el('span', { class: 'cell-sub' }, chainBasis ?? BASIS_META.chainEmpty)),
        el('div', { class: 'clx-chain__row' },
          el('span', { class: 'badge badge--info' }, BASIS_META.chainGoal),
          el('span', { class: 'cell-sub' }, p.goal ?? BASIS_META.chainEmpty)),
        el('div', { class: 'clx-chain__row' },
          el('span', { class: 'badge badge--accent' }, BASIS_META.chainCriterion),
          el('span', { class: 'cell-sub' }, chainCriterion ?? BASIS_META.chainEmpty)))
    : null;
  const noGoalBadge = p.goal
    ? null
    : el('span', { class: 'badge badge--warning', title: BASIS_META.noGoalHint }, icon('alert', 12), BASIS_META.noGoalBadge);
  if (canDecide) {
    footer.push(el('button', {
      class: 'btn btn--soft btn--sm',
      onclick: () => {
        formModal({
          title: `${BASIS_META.goalModalTitle} — «${p.targetTitle}»`,
          submitLabel: 'ذخیرهٔ هدف',
          secondary: {
            label: 'حذف هدف',
            onClick: async () => {
              try {
                await api.patch(`/api/clinical-paths/${p.id}/goal`, { goal: null });
                toast('هدف مسیر حذف شد — مسیر «بدون هدف اندازه‌پذیر» برچسب می‌گیرد', 'success');
                refresh();
                return true;
              } catch (err) { toastError(err); return false; }
            }
          },
          fields: BASIS_META.goalFields.map((f) => ({ ...f, span: 2 })),
          onSubmit: async (vals) => {
            const text = composeSmartGoal(vals);
            if (!text) {
              toast('حداقل «رفتار قابل‌مشاهده» را بنویسید — یا «حذف هدف» را بزنید', 'warning');
              return false;
            }
            try {
              await api.patch(`/api/clinical-paths/${p.id}/goal`, { goal: text });
              toast('هدف اندازه‌پذیر ذخیره شد — در زنجیرهٔ تصمیم همین کارت می‌نشیند', 'success');
              refresh();
              return true;
            } catch (err) { toastError(err); return false; }
          }
        });
      }
    }, icon('target', 14), BASIS_META.goalBtn));
  }

  return el('div', { class: `card clx-path${isActive ? ' clx-path--active' : ''}` },
    el('div', { class: 'card__body' },
      el('div', { class: 'clx-hyp__head' },
        el('strong', { class: 'clx-hyp__title' }, icon('target', 16), p.targetTitle),
        el('span', { class: `badge ${PATH_STATUS_BADGE[p.status] ?? 'badge--neutral'}` }, PATH_STATUS_LABEL[p.status] ?? p.status),
        p.templateTitle ? el('span', { class: 'badge badge--info', title: 'این مسیر از قالب سیستمی ساخته شده است' }, `قالب: ${p.templateTitle}`) : null,
        // بج تسلط پراپ از probeSummary فهرست مسیر (بدون فراخوان اضافه)
        p.probeSummary?.masteredMetric
          ? el('span', { class: 'badge badge--success', title: `ملاک ۸۰٪ در دو جلسهٔ پیاپی — سنجهٔ «${p.probeSummary.masteredMetric}»` }, icon('medal', 12), 'تسلط پراپ')
          : null,
        el('span', { class: 'cell-sub' }, `ثبت: ${formatJalaliDateTime(p.createdAt)}`)
      ),
      engineLine,
      // بج «بدون هدف اندازه‌پذیر» + زنجیرهٔ مبنا ← هدف ← معیار
      noGoalBadge,
      chainBlock,
      decisionLine,
      p.templateKey ? pathBand(p) : null,
      stepsBlock,
      pathSessionsBlock(p, { student, canDecide, refresh }),
      footer.length ? el('div', { class: 'clx-actions' }, ...footer) : null
    )
  );
}

function protocolLabelOf(protoCardNode, protocol) {
  if (!protocol) return null;
  const title = protoCardNode?.querySelector('.card__title')?.textContent ?? '';
  const parts = title.split('—');
  const label = (parts[parts.length - 1] ?? '').trim();
  return label || String(protocol);
}

function protocolStrip(protoCardNode) {
  if (!protoCardNode) return null;
  const steps = protoCardNode.querySelector('.clx-journey__steps');
  if (!steps) return null;
  return el('div', {},
    el('div', { class: 'clx-sub__title' }, icon('target', 14), STAGE2_META.stages.protocol.protocolStripTitle),
    steps);
}

export async function renderClinicalTab(box, { student }) {
  const canDecide = canDecideFor(student);

  async function load() {
    box.replaceChildren(loadingState());

    let insights = null;
    let paths = [];
    let anamnesisTypeId = null;
    let typesById = new Map(); // — کلید → تعریف نوع (فرم‌های نتایج/وکسلر/توانبخشی)
    let gates = null; // — گیت‌های شناسایی + فاز/پروتکل
    let otProfile = null; // — پروفایل چک‌لیست ۷ حیطه‌ای (فقط MODE_OT واکشی می‌شود — )
    let otProgress = null; // — پیشرفت جلسه‌به‌جلسه (فقط MODE_OT واکشی می‌شود)
    let skillsMode = SKILL_MODE_SLD; // — حالت مرحلهٔ ۴؛ درست زیر از گیت‌ها/مسیر حل می‌شود
    let events = []; // — پاسخ واحد /case-events؛ ردیف‌های مراحل ۱/۲/۴ از همین می‌آید (GET رشد نمی‌کند)
    let plan = null; // — پلن پیشنهادی چک‌لیست (T3/) — کارت مرحلهٔ وکسلر
    try {
      const [insRes, pathRes, gatesRes, planRes] = await Promise.all([
        api.get(`/api/students/${student.id}/clinical-insights`),
        api.get(`/api/students/${student.id}/clinical-paths`).catch(() => ({ data: [] })),
        api.get(`/api/students/${student.id}/clinical-gates`).catch(() => null),
        api.get(`/api/students/${student.id}/checklist-plan`).catch(() => null) // T3 — پیشنهاد پلن (خواندن ارزان و قطعی)
      ]);
      insights = insRes.data;
      paths = pathRes.data ?? [];
      gates = gatesRes?.data ?? null;
      plan = planRes?.data ?? null;
      skillsMode = resolveSkillsMode({ gates, student });
      if (skillsMode === SKILL_MODE_OT) {
        const [profRes, progRes] = await Promise.all([
          api.get(`/api/students/${student.id}/ot/profile`).catch(() => null),
          api.get(`/api/students/${student.id}/ot/progress`).catch(() => null)
        ]);
        otProfile = profRes?.data ?? null;
        otProgress = progRes?.data ?? null;
      }
      try {
        const types = (await api.get('/api/case-events/types')).data ?? [];
        anamnesisTypeId = types.find((t) => t.key === ANAMNESIS_KEY && t.active)?.id ?? null;
        typesById = new Map(types.map((t) => [t.key, t]));
      } catch { anamnesisTypeId = null; }
      try {
        events = (await api.get(`/api/students/${student.id}/case-events?limit=200`)).data ?? []; // : حد پیش‌فرض ۵۰ تاریخچه را بی‌صدا می‌بُرید
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

    // کلیدهای چک‌لیست خانواده/معلم از خود تعریف نوع‌ها خوانده می‌شود، نه فهرست هاردکد؛
    // هیچ فرم پرشدهٔ خانواده/معلم از ردیف‌های مرحلهٔ رفتاری جا نمی‌ماند
    const staticChecklistKeys = [...SCREEN_KEYS, ...SPECIFIC_KEYS];
    const dynamicChecklistKeys = [];
    for (const [k, t] of typesById) {
      if (!t || !t.active || t.category !== 'checklist') continue;
      if (staticChecklistKeys.includes(k)) continue;
      if (!['family', 'teacher', 'both'].includes(String(t.audience ?? ''))) continue;
      dynamicChecklistKeys.push(k);
    }
    const checklistAllKeys = [...staticChecklistKeys, ...dynamicChecklistKeys];

    const openEventDetailOf = async (e) => { // ردیف‌ها کلیک‌پذیر
      try {
        const full = (await api.get(`/api/case-events/${e.id}`)).data;
        openCaseEventDetail(full, { onChanged: refresh });
      } catch (err) { toastError(err); }
    };

    const hasData = (insights.ranked?.length ?? 0) > 0 || (insights.criteria?.length ?? 0) > 0;

    const protocol = gates?.protocol ?? null;
    const isRehabCase = student.pathway === 'rehab' || protocol === 'rehab';
    const phase = protocol ? 'intervention' : 'identification';
    const SM = STAGE2_META.stages;
    const gatesList = (gates?.gates ?? []).length
      ? gates.gates
      : (gates ? [] : ['anamnesis', 'wechsler', 'behavioral', 'skills', 'needs'].map((k) => ({ key: k, done: false, ord: SM[k].num, label: SM[k].title, detail: null })));
    const gateByKey = (key) => gatesList.find((g) => g.key === key) ?? null;
    const stageCtx = { student, gates, typesById, anamnesisTypeId, canDecide, refresh, skillsMode, events, isRehabCase };

    const formulation = await fetchFormulation({ student });

    const connections = wechslerConnections({ formulation, gates });

    const wSummary = gates?.wechslerSummary ?? null;
    const wechslerEmpty = !wSummary
      || (wSummary.fsiq == null && wSummary.percentile == null && !wSummary.profile);
    const firstOpenGate = gatesList.find((g) => !g.done) ?? null;
    const currentKey = protocol ? 'intervention' : (firstOpenGate?.key ?? null);
    const hasRanked = (insights.ranked?.length ?? 0) > 0;

    const stateOf = (key) => {
      if (phase === 'intervention') return key === 'intervention' ? 'current' : 'done'; // آرشیو مراحل ۱–۵
      if (key === 'intervention') return skillsMode === SKILL_MODE_OT ? 'todo' : 'locked';
      const g = gateByKey(key);
      if (key === 'needs') return g?.done ? 'needsDone' : (currentKey === key ? 'current' : 'todo');
      if (key === 'wechsler' && wechslerEmpty) return 'noData'; // §5 — بدون بازشدن خودکار
      if (g?.done) return 'done';
      return currentKey === key ? 'current' : 'todo';
    };

    const idsOf = (keys) => keys.map((k) => typesById.get(k)?.id).filter(Boolean);
    const countCompleted = (keys) => {
      const ids = new Set(idsOf(keys));
      return (events ?? []).filter((e) => ids.has(e.eventTypeId) && e.status === 'completed').length;
    };
    const glanceOf = {
      anamnesis: () => gateByKey('anamnesis')?.detail || SM.anamnesis.glanceEmpty,
      behavioral: () => {
        const n = countCompleted(checklistAllKeys);
        const countLine = n === 0 ? SM.behavioral.glanceZero : SM.behavioral.glanceSome.replace('{n}', fa(n));
        const susLine = gates?.suspicion?.decided ? ` · ${SM.behavioral.glanceSuspicion.decided}` : '';
        return `${countLine}${susLine}`;
      },
      wechsler: () => {
        const W = SM.wechsler;
        if (!wSummary) return W.glanceEmpty;
        const { fsiq, percentile } = wSummary;
        let line;
        if (fsiq != null && percentile != null) line = W.glanceFsiq.replace('{fsiq}', fa(fsiq)).replace('{p}', fa(percentile));
        else if (fsiq != null) line = W.glanceFsiqOnly.replace('{fsiq}', fa(fsiq));
        else if (!wSummary.engine) line = W.glanceManual;
        else line = W.glanceEmpty;
        const date = wSummary.event?.date ? formatJalaliDateTime(wSummary.event.date) : null;
        if (date && line !== W.glanceEmpty) line = `${line} · ${W.glanceDate.replace('{date}', date)}`;
        return line;
      },
      skills: () => {
        if (skillsMode === SKILL_MODE_OT) {
          if (isRehabCase) {
            const fx = rehabFxEventOf(events, typesById);
            if (fx && fx.analysis?.score != null) {
              return SM.skills.glanceFxDone.replace('{ok}', fa(Number(fx.analysis.score)));
            }
            return SM.skills.glanceFxNone;
          }
          const cov = gates?.otCoverage
            ?? (otProfile?.totals ? { scored: otProfile.totals.scored, total: otProfile.totals.total } : null);
          if (cov?.total) return SM.skills.glanceOt.replace('{n}', fa(cov.scored)).replace('{m}', fa(cov.total));
          return gateByKey('skills')?.detail || SM.skills.glanceFallback;
        }
        const k = countCompleted(PROBE_KEYS);
        return k > 0 ? SM.skills.glanceSld.replace('{n}', fa(k)) : SM.skills.glanceSldZero;
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
        if (!protocol) return skillsMode === SKILL_MODE_OT ? SM.protocol.glanceWorkspace : SM.protocol.glanceLocked;
        const label = protocolLabelOf(protoCardNode, protocol);
        if (!paths.length) return SM.protocol.glanceNoPath.replace('{protocol}', label);
        const statusKey = paths.some((p) => p.status === 'active') ? 'active'
          : paths.some((p) => p.status === 'reviewed') ? 'reviewed'
            : paths[0]?.status;
        return SM.protocol.glanceActive.replace('{protocol}', label).replace('{status}', PATH_STATUS_LABEL[statusKey] ?? statusKey ?? '—');
      }
    };

    const ST = STAGE2_META.stats;
    const anamTypeIds = new Set([ANAMNESIS_KEY, ANAMNESIS_LEGACY_KEY].map((k) => typesById.get(k)?.id).filter(Boolean));
    const lastAnamAt = (events ?? [])
      .filter((e) => anamTypeIds.has(e.eventTypeId) && e.status !== 'cancelled')
      .reduce((m, e) => (e.occurredAt && (!m || e.occurredAt > m) ? e.occurredAt : m), null);
    const anamStale = String(gateByKey('anamnesis')?.detail ?? '').includes('کهنه');
    const statsOf = {
      anamnesis: () => [
        statItem(ST.anamnesisLast, lastAnamAt ? formatJalaliDateTime(lastAnamAt) : null),
        anamStale ? statItem(ST.anamnesisStaleLabel, ST.anamnesisStale, { warn: true }) : null
      ],
      behavioral: () => {
        const sig = gates?.suspicion?.signals ?? [];
        const anyHigh = sig.some((s) => s?.level === 'high');
        return [
          countStat(ST.behavioralAnswered, countCompleted(checklistAllKeys)),
          sig.length
            ? statItem(ST.suspicionSignals, fa(sig.length), {
                warn: anyHigh,
                hint: anyHigh ? 'حداقل یک سیگنال با شواهد هم‌گرا — سطح «محتمل»' : null
              })
            : null
        ];
      },
      wechsler: () => [
        wSummary?.indexScatter != null && wSummary.indexScatter > 0
          ? statItem(ST.wechslerScatter, fa(wSummary.indexScatter), { hint: CONTEXT_META.scatterNote })
          : null,
        wSummary?.monitoringInterval != null
          ? statItem(ST.wechslerReassess, `${fa(wSummary.monitoringInterval)} ماه`)
          : null
      ],
      skills: () => {
        if (skillsMode === SKILL_MODE_OT) {
          const stats = [];
          if (isRehabCase) {
            const fx = rehabFxEventOf(events, typesById);
            if (fx?.analysis?.score != null) stats.push(statItem(ST.skillsFx, `${fa(Number(fx.analysis.score))} از ${fa(6)}`));
            // آمار چک‌لیست ۷ حیطه‌ای (خودِ طرح درمان) زیر «ارزیابی عملکردی» نمی‌نشیند — به بخش مداخله رفت
            return stats;
          }
          const cov = gates?.otCoverage ?? null;
          if (cov?.total) stats.push(statItem(ST.skillsCoverage, `${fa(cov.scored)} از ${fa(cov.total)}`));
          if (cov?.domainsMin3 != null) {
            stats.push(statItem(ST.skillsDomains, fa(cov.domainsMin3), { hint: 'حیطه‌هایی با حداقل ۳ مهارت نمره‌گرفته' }));
          }
          return stats;
        }
        return [
          countStat(ST.skillsSld, countCompleted(PROBE_KEYS)),
          countStat(ST.skillsProbe, countCompleted(SLD_CHECKLIST_KEYS))
        ];
      },
      needs: () => {
        if (!formulation) return [];
        const elevated = (formulation.constructs ?? []).filter((c) => c && c.level !== 'پایین').length;
        const activeP = (formulation.patterns ?? []).filter((p) => p?.status === 'active').length;
        return [
          formulation.dataCoverage?.percent != null
            ? statItem(ST.needsCoverage, `${fa(formulation.dataCoverage.percent)}٪`)
            : null,
          countStat(ST.needsConstructs, elevated),
          countStat(ST.needsPatterns, activeP)
        ];
      },
      intervention: () => {
        const stats = [];
        // در مسیر توانبخشی چک‌لیست ۷ حیطه‌ای خودش طرح درمان است؛ آمارش کنار کارت چک‌لیست در همین بخش می‌نشیند
        if (skillsMode === SKILL_MODE_OT && isRehabCase) {
          const cov = gates?.otCoverage ?? (otProfile?.totals ? { scored: otProfile.totals.scored, total: otProfile.totals.total } : null);
          if (cov?.total) stats.push(statItem(ST.skillsCoverage, `${fa(cov.scored)} از ${fa(cov.total)}`));
          if (cov?.domainsMin3 != null) stats.push(statItem(ST.skillsDomains, fa(cov.domainsMin3), { hint: 'حیطه‌هایی با حداقل ۳ مهارت نمره‌گرفته' }));
        }
        if (!protocol && formulation?.protocolSuggestion?.protocol) {
          const sug = formulation.protocolSuggestion.protocol;
          stats.push(el('span', {
            class: 'badge badge--info clxacc__stat',
            ...(formulation.protocolSuggestion.rationaleFa ? { title: formulation.protocolSuggestion.rationaleFa } : {})
          }, icon('compass', 12), `${ST.protocolSuggestion} ${TEMPLATE_PROTOCOL_BADGE[sug]?.label ?? sug}`));
        }
        let stepsDone = 0;
        let stepsTotal = 0;
        let planned = 0;
        for (const p of paths) {
          stepsTotal += (p.steps ?? []).length;
          stepsDone += (p.steps ?? []).filter((s) => s.doneAt).length;
          planned += (p.sessions ?? []).filter((s) => s.status === 'planned').length;
        }
        if (stepsTotal) stats.push(statItem(ST.pathSteps, `${fa(stepsDone)} از ${fa(stepsTotal)}`));
        stats.push(countStat(ST.pathSessions, planned));
        // آماری که پیش‌تر در سرگروه «لایهٔ ۲» می‌نشست به خودِ بخش مداخله آمد (بدون زبانِ لایه)
        const activePaths = paths.filter((p) => p.status === 'active').length;
        const masteredN = paths.filter((p) => p.probeSummary?.masteredMetric).length;
        const nextPlanned = paths
          .flatMap((p) => (p.sessions ?? []).filter((s) => s.status === 'planned'))
          .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))[0] ?? null;
        if (activePaths) stats.push(countStat(ST.pathActive, activePaths));
        if (nextPlanned) stats.push(statItem(ST.pathNext, `${fa(nextPlanned.ord)} — ${nextPlanned.title.slice(0, 28)}`));
        if (masteredN) stats.push(countStat(ST.pathMastered, masteredN, { hint: 'ملاک تسلط در دو جلسهٔ پیاپی تأیید شده است' }));
        return stats;
      }
    };

    const anamRows = eventRowsBlock({ events, typesById, keys: [ANAMNESIS_KEY, ANAMNESIS_LEGACY_KEY], cap: 1, expandable: false, onOpen: openEventDetailOf }); // — T4: v3 + تاریخچهٔ v2
    const checklistRows = eventRowsBlock({ events, typesById, keys: checklistAllKeys, cap: 6, expandable: true, onOpen: openEventDetailOf });
    const resultsRows = eventRowsBlock({ events, typesById, keys: [RESULTS_KEY], cap: 6, expandable: true, onOpen: openEventDetailOf });

    const hypotheses = hasData
      ? el('div', { class: 'clx-section' },
          el('div', { class: 'clx-section__title' }, icon('sparkles', 16), 'فرضیه‌ها — به ترتیب شواهد'),
          insights.ranked.length
            ? el('div', { class: 'clx-hyps' },
                insights.ranked.map((h, i) => hypothesisCard(h, i + 1, { student, paths, canDecide, refresh, conv: convergenceOf(insights, h.targetKey), basis: (insights.basis ?? []).find((b) => b.targetKey === h.targetKey) ?? null })))
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
    const exclStrip = hasData ? exclusionsStrip(insights) : null; // نوار مالک‌های فعال
    const synthesis = await synthesisSection({
      student, formulation, insights, gates, canDecide, refresh, plan,
      engineDetails: [critsSection, hypotheses, exclStrip, seenBlock].filter(Boolean)
    });
    // جدول افتراق و لج فرضیه: دو بخش مستقل در مرحلهٔ ۵ (جمع‌بندی) برای دیده‌شدن
    const diffSection = hasData ? differentialSection({ student, insights, events, typesById, refresh }) : null;
    const logSection = hypothesisLogSection(events);

    const otStage6Home = skillsMode === SKILL_MODE_OT;
    const protoCardNode = protocol ? protocolCard(protocol) : null;
    const emptyPathLine = paths.length
      ? null
      : el('div', { class: 'cell-sub' }, hasData
          ? 'مسیری ثبت نشده است — در صورت نیاز از «تغییر قالب مداخله» در انتهای همین تب استفاده کنید.'
          : 'مسیری ثبت نشده است.');
    const pathsSection = el('div', { class: 'clx-section' },
      el('div', { class: 'clx-section__title' }, icon('target', 16), 'مسیر مداخله و تصمیم شما'),
      paths.length
        ? el('div', { class: 'clx-paths' }, paths.map((p) => pathCard(p, { student, canDecide, refresh, insights })))
        : emptyPathLine
    );
    const tplChangeRow = canDecide && (phase === 'intervention' || otStage6Home)
      ? el('div', { class: 'clx-actions clx-tplchange' },
          el('button', {
            class: 'btn btn--soft btn--sm',
            onclick: () => openTemplatePathModal({ student, refresh })
          }, icon('puzzle', 14), 'تغییر قالب مداخله'))
      : null;

    const otProtocolLabel = (protocol === 'rehab' || (!protocol && student.pathway === 'rehab'))
      ? 'توانبخشی ذهنی-جسمی'
      : 'کاردرمانی ذهنی';
    const otPriorityDomains = isRehabCase
      ? rehabPriorityDomains(rehabFxEventOf(events, typesById))
      : [];
    const otCard = skillsMode === SKILL_MODE_OT && otProfile
      ? otChecklistCard({
          student, profile: otProfile, canDecide, refresh,
          scrollTarget: true, // fix — لنگر اسکرول CTA مرحلهٔ ۴؛ کارت حالا همیشه در تب مداخله است
          protocolLabel: otProtocolLabel,
          priorityDomains: otPriorityDomains
        })
      : null;
    const otProgressNode = otStage6Home
      ? otProgressPanel({
          progress: otProgress,
          protocolLabel: otProtocolLabel,
          studentId: student.id,
          onReassess: isRehabCase && canDecide ? () => openRehabFxModal(student, refresh) : null
        })
      : null;

    const bodyOf = {
      anamnesis: () => {
        const g = gateByKey('anamnesis');
        const body = [];
        if (g?.detail) body.push(el('div', { class: 'cell-sub' }, g.detail));
        if (anamRows.node) body.push(anamRows.node);
        const sensoryChip = sensoryChipCard({ student, events, typesById, canDecide, refresh });
        if (sensoryChip) body.push(sensoryChip);
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
        const body = [];
        if (!checklistRows.count && !(gates?.suspicion?.decided)) body.push(el('div', { class: 'cell-sub' }, SM.behavioral.emptyHint));
        const sus = suspicionBlock({ student, gates, typesById, canDecide, refresh });
        if (sus) body.push(sus); // فقط با سیگنال/تصمیم؛ بدون بلوک خالی
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
          const body = [emptyState({
            iconName: 'brain',
            title: SM.wechsler.glanceEmpty,
            hint: SM.wechsler.emptyHint
          })];
          const cta = gateActionOf(gateByKey('wechsler'), stageCtx);
          if (cta) body.push(el('div', { class: 'clx-actions' }, cta));
          return body;
        }
        const body = [interpretationContext({ student, gates }), profileBody];
        const planCard = checklistPlanCard({ student, plan, typesById, canDecide, refresh });
        if (planCard) body.push(planCard);
        return body;
      },
      skills: () => {
        const g = gateByKey('skills');
        const body = [];
        if (skillsMode === SKILL_MODE_OT) {
          if (isRehabCase && phase !== 'intervention') {
            body.push(rehabFxSection({ student, events, typesById, canDecide, refresh }));
          }
          body.push(el('div', { class: 'cell-sub' }, icon('clipboard', 13), ' ',
            phase === 'intervention'
              ? (isRehabCase ? SM.protocol.monitoringMovedRehab : SM.protocol.monitoringMoved)
              : SM.protocol.monitoringMoved));
          if (!isRehabCase && !g?.detail) body.push(el('div', { class: 'cell-sub' }, SM.skills.emptyHint));
          body.push(seenChipsBlock(insights)); // تنها جای چیپ‌های «چه فرم‌هایی آمده» در مرحلهٔ ۴
          if (!g?.done) {
            const cta = gateActionOf(g, stageCtx);
            if (cta) body.push(el('div', { class: 'clx-actions' }, cta));
          }
          return body;
        }
        body.push(probeAssessSection({ student, events, typesById, canDecide, refresh }));
        const readCore = readCoreChipCard({ student, events, typesById, canDecide, refresh });
        if (readCore) body.push(readCore);
        body.push(seenChipsBlock(insights)); // تنها جای چیپ‌های «چه فرم‌هایی آمده» در مرحلهٔ ۴
        if (resultsRows.node) body.push(resultsRows.node);
        if (!g?.done) {
          const cta = gateActionOf(g, stageCtx);
          if (cta) body.push(el('div', { class: 'clx-actions' }, cta));
        }
        return body;
      },
      needs: () => {
        const body = [];
        if (synthesis) body.push(synthesis);
        if (diffSection) body.push(diffSection); // افتراق سه‌سطری
        if (logSection) body.push(logSection); // لج فرضیه
        if (connections.length) body.push(connectionsSection(connections)); // MOVE از کارت وکسلر → مرحلهٔ ۵
        if (!body.length) body.push(el('div', { class: 'cell-sub' }, SM.needs.emptyHint));
        return body;
      },
      intervention: () => {
        const body = [];
        if (!protocol) body.push(el('div', { class: 'cell-sub' }, otStage6Home ? SM.protocol.workspaceNote : SM.protocol.lockedNote));
        if (otStage6Home && otCard) body.push(otCard);
        if (otStage6Home && otProgressNode) body.push(otProgressNode);
        body.push(pathsSection);
        if (protocol) {
          const strip = protocolStrip(protoCardNode);
          if (strip) body.push(strip);
          if ((protocol === 'mental_ot' || protocol === 'rehab') && !otCard) {
            body.push(el('div', { class: 'cell-sub' }, icon('clipboard', 13), ' ', SM.protocol.monitoringLink));
          }
        }
        if (tplChangeRow) body.push(tplChangeRow);
        return body;
      }
    };

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
      const stats = known ? ((statsOf[g.key]?.() ?? []).filter(Boolean)) : [];
      sections.push(clxaccSection({
        key: g.key,
        num: g.ord ?? meta?.num ?? null,
        title: meta?.title ?? g.label,
        glance,
        stats,
        chips: g.key === 'wechsler' && !wechslerEmpty ? [wechslerSourceBadge(Boolean(wSummary.engine))] : [],
        state,
        cta: known && CTA_GATE_KEYS.includes(g.key) && state !== 'noData' ? gateActionOf(g, stageCtx) : null,
        body,
        open: false
      }));
    }
    sections.push(clxaccSection({
      key: 'intervention',
      num: (gatesList.length || 5) + 1,
      title: SM.protocol.title,
      glance: glanceOf.intervention(),
      stats: statsOf.intervention().filter(Boolean),
      chips: [],
      state: stateOf('intervention'),
      cta: null,
      body: bodyOf.intervention(),
      open: false
    }));

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

    // مدل دولایه (قرارداد design.md §۳) پشت صحنه ماند (داده و منطق)، ولی ظاهر یک
    // آکاردئون پیوسته است: نه دکمهٔ «لایهٔ ۱/لایهٔ ۲»، نه نوار سفر، نه برچسب لایه.
    // بخش کشویی «مداخله» خودش حامل لایهٔ ۲ است؛ پل لایهٔ ۱ → لایهٔ ۲ از CTA کارت فرضیه انجام می‌شود.
    const flow = el('div', { class: 'clxacc-flow' }, ...sections);

    flow.addEventListener('toggle', (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.matches('details[data-clxacc]')) return;
      syncAria(d);
      if (d.dataset.clxaccLevel === 'top') {
        // با حذف سرگروه‌های لایه، بخش‌ها دوباره فرزند مستقیمِ flow هستند
        saveOpenIds(student.id, [...flow.querySelectorAll('details[data-clxacc][data-clxacc-level="top"][open]')].map((x) => x.id));
      }
    }, true);
    flow.addEventListener('click', (e) => {
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
      const summary = e.target.closest?.('summary.clxacc__head');
      if (summary && e.target.closest?.('button')) e.preventDefault();
    });

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
          // نه بج فاز، نه نوار سفر: ترتیب بخش‌ها خودش روند را نشان می‌دهد
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

    box.replaceChildren(el('div', { class: 'clx' }, toolbar, flow));
  }

  await load();
}
