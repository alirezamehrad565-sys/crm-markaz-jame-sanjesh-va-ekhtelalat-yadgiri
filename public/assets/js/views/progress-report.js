import { api, qs } from '../api.js';
import {
  fa, enDigits, toGregorian, tehranTodayYmd, toUtcIso, tehranYmdOfIso, addDaysYmd,
  formatJalaliNumeric, formatJalaliDateTime, gradeLabel, escapeHtml
} from '../format.js';
import { el, icon, skeletonState, errorState, emptyState, toast } from '../ui.js'; // toast در مسیر چاپ بدون import بود
import { lineChart, deferredChart } from '../charts.js'; // E3
import { OT_PROMPT_LEVELS, NEEDS_KEY } from '../ot-checklist.js';
import { REHAB_FX_KEY, PATH_STATUS_BADGE, PATH_STATUS_LABEL, SESSION_ITEM_LABELS } from '../clinical-content.js';

const PROMPT_ORD = { verbal: 1, gestural: 2, partial_physical: 3, full_physical: 4 };

const FX_PROMPT_ORD = { 'بدون راهنما': 0, 'راهنمای کلامی': 1, 'ژستی / الگودهی': 2, 'لمسی جزئی': 3, 'راهنمای فیزیکی کامل': 4 };

const FX_LABELS = { att_sus: 'توجه پایدار', att_sel: 'توجه انتخابی', wm: 'حافظهٔ کاری', inh: 'بازداری', flex: 'انعطاف ذهنی', ps: 'حل مسئله' };
const FX_DIR = { att_sus: 1, att_sel: -1, wm: 1, inh: -1, flex: 1, ps: 1 };
const FX_RANGE = { att_sus: 15, att_sel: 20, wm: 9, inh: 10, flex: 4, ps: 12 };
const FX_UNIT = { att_sus: 'دقیقه', att_sel: 'خطا', wm: 'رقم', inh: 'خطا', flex: 'کمک', ps: 'تکه' };

const RCI_RELIABILITY = 0.8;

const STATUS_LABELS = { mastered: 'بلد است', with_help: 'با کمک', not_yet: 'هنوز نه' };
const STATUS_CLS = { mastered: 'badge--success', with_help: 'badge--warning', not_yet: 'badge--neutral' };

function num(v) {
  if (v == null) return null;
  const n = Number(enDigits(String(v)));
  return Number.isFinite(n) ? n : null;
}

function sessionScore(s) {
  if (!s.total) return 0;
  return ((s.mastered + 0.5 * s.withHelp) / s.total) * 100;
}

function olsSlope(ys) {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let numr = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    numr += (i - mx) * (ys[i] - my);
    den += (i - mx) * (i - mx);
  }
  return den ? numr / den : 0;
}

function trendVerdict(slope) {
  if (slope >= 5) return { label: 'بهبود روشن', cls: 'badge--success', good: 1, text: 'نمرهٔ ترکیبی تسلط به‌طور متوسط در هر جلسه رشد محسوس دارد.' };
  if (slope >= 2) return { label: 'بهبود تدریجی', cls: 'badge--success', good: 1, text: 'نمرهٔ ترکیبی تسلط روند صعودی آرام اما پیوسته دارد.' };
  if (slope > -2) return { label: 'تقریباً پایدار', cls: 'badge--neutral', good: 0, text: 'نمرهٔ ترکیبی تسلط در این بازه تغییر معنادار نمایشی نداشته است.' };
  if (slope > -5) return { label: 'افت خفیف', cls: 'badge--warning', good: -1, text: 'نمرهٔ ترکیبی تسلط افت خفیف نشان می‌دهد — بازبینی دشواری تکالیف و انگیزش توصیه می‌شود.' };
  return { label: 'افت روشن', cls: 'badge--error', good: -1, text: 'نمرهٔ ترکیبی تسلط روند نزولی آشکار دارد — بازنگری برنامهٔ مداخله لازم است.' };
}

function promptVerdict(slope) {
  if (slope <= -0.15) return { label: 'محو راهنما در جریان', cls: 'badge--success', text: 'میانگین سطح راهنمای «با کمک» جلسه‌به‌جلسه کم می‌شود — استقلال‌یابی در حرکت است.' };
  if (slope < 0.15) return { label: 'بدون تغییر محسوس', cls: 'badge--neutral', text: 'سطح راهنمای موردنیاز تقریباً ثابت مانده است — با خط پایه و ملاک‌ها قضاوت شود.' };
  return { label: 'افزایش وابستگی به راهنما', cls: 'badge--warning', text: 'میانگین سطح راهنما رو به افزایش است — تکلیف را ساده‌تر یا قدم‌ها را ریزتر کنید.' };
}

function rciOf(x1, x2, key) {
  const se = FX_RANGE[key] / Math.sqrt(12); // تخمین محافظه‌کارانهٔ SE از دامنهٔ مقیاس
  const seDiff = Math.SQRT2 * se * Math.sqrt(1 - RCI_RELIABILITY);
  if (seDiff <= 0) return null;
  return ((x2 - x1) * FX_DIR[key]) / seDiff;
}

function fxVals(ev) {
  const p = ev?.payload ?? {};
  const out = {};
  for (const key of Object.keys(FX_LABELS)) {
    const v = num(p[`d_${key}`]?.value);
    if (v == null) continue;
    out[key] = {
      v,
      band: p[`fx_${key}_band`]?.value ?? null,
      prompt: p[`fx_${key}_prompt`]?.value ?? null
    };
  }
  return out;
}

function ageLineOf(birthDate) {
  if (!birthDate) return null;
  const s = String(birthDate).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim();
  const m = s.match(/(\d{3,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!m) return null;
  let gy; let gm; let gd;
  const y1 = Number(m[1]);
  if (y1 >= 1200 && y1 <= 1500) {
    const g = toGregorian(y1, Number(m[2]), Number(m[3]));
    gy = g.gy; gm = g.gm; gd = g.gd;
  } else if (y1 > 1700) {
    gy = y1; gm = Number(m[2]); gd = Number(m[3]);
  } else {
    return null;
  }
  const t = tehranTodayYmd().split('-').map(Number);
  let years = t[0] - gy;
  let months = t[1] - gm;
  if (t[2] - gd < 0) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) return null;
  return years > 0 ? `${fa(years)} سال و ${fa(months)} ماه` : `${fa(months)} ماه`;
}

const PROTOCOL_LABELS = {
  rehab: 'توانبخشی ذهنی-جسمی',
  mental_ot: 'کاردرمانی ذهنی',
  learning: 'اختلال یادگیری'
};

export async function renderProgressReport(container, ctx) {
  const id = ctx.params.id;
  const pathwayId = ctx.query?.pathway ?? null; // حضور پارامتر = گزارش دورهٔ طرح درمان
  container.replaceChildren(skeletonState('list', 6));

  let student;
  try {
    student = (await api.get(`/api/students/${id}`)).data;
  } catch (err) {
    container.replaceChildren(emptyState({ iconName: 'alert', title: 'دانش‌آموز پیدا نشد', hint: err.message }));
    return;
  }

  // با پارامتر مسیر، گزارش دورهٔ طرح درمان جایگزین گزارش چک‌لیست می‌شود
  if (pathwayId) {
    return renderPathwayReportView(container, {
      student,
      id,
      pathwayId,
      from: ctx.query?.from ?? null,
      to: ctx.query?.to ?? null
    });
  }

  const [progress, profile, gates, evRes, tyRes, pathsRes] = await Promise.all([
    api.get(`/api/students/${id}/ot/progress`).then((r) => r.data).catch(() => null),
    api.get(`/api/students/${id}/ot/profile`).then((r) => r.data).catch(() => null),
    api.get(`/api/students/${id}/clinical-gates`).then((r) => r.data).catch(() => null),
    api.get(`/api/students/${id}/case-events${qs({ limit: 200 })}`).then((r) => r.data ?? []).catch(() => []),
    api.get('/api/case-events/types').then((r) => r.data ?? []).catch(() => []),
    api.get(`/api/students/${id}/clinical-paths`).then((r) => r.data ?? []).catch(() => []) // انتخابگر گزارش دوره
  ]);
  const protocolKey = gates?.protocol ?? student.protocol ?? null;
  const phaseLabel = gates?.phase === 'intervention' ? 'مداخله' : gates?.phase === 'identification' ? 'شناسایی' : (gates?.phase ?? null);
  const typesById = new Map(tyRes.map((t) => [t.key, t]));
  const events = evRes;

  const rehabTypeId = typesById.get(REHAB_FX_KEY)?.id ?? null;
  const rehabEvents = rehabTypeId
    ? events
      .filter((e) => e.eventTypeId === rehabTypeId && e.status !== 'cancelled')
      .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0))
    : [];
  const fxFirst = rehabEvents[0] ?? null;
  const fxLast = rehabEvents[rehabEvents.length - 1] ?? null;
  const hasRetest = rehabEvents.length >= 2;

  const needsTypeId = typesById.get(NEEDS_KEY)?.id ?? null;
  const needsEvent = needsTypeId
    ? events
      .filter((e) => e.eventTypeId === needsTypeId && e.status !== 'cancelled')
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))[0] ?? null
    : null;

  const sessions = progress?.sessions ?? [];
  const summary = progress?.summary ?? { sessions: sessions.length, confirmedMastered: 0, withHelp: 0, lastAt: null };
  const totals = profile?.totals ?? null;
  const sheetParts = [];

  sheetParts.push(el('div', { class: 'toolbar print-hide' },
    el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { location.hash = `#/students/${id}`; } },
      icon('chevR', 14), 'بازگشت به پروفایل'),
    el('span', { class: 'spacer' }) /* S7-20 */,
    el('button', { class: 'btn btn--primary btn--sm', onclick: () => window.print() },
      icon('printer', 15), 'چاپ / ذخیرهٔ PDF')
  ));

  // انتخابگر گزارش دوره: فهرست طرح‌های درمان دانش‌آموز برای انتخاب (چاپ نمی‌شود)
  const pathwayPicker = buildPathwayPicker(id, pathsRes ?? []);
  if (pathwayPicker) sheetParts.push(pathwayPicker);

  const sessionRange = sessions.length
    ? `${formatJalaliDateTime(sessions[0].occurredAt)} تا ${formatJalaliDateTime(sessions[sessions.length - 1].occurredAt)}`
    : '—';
  const metaItem = (label, value) => el('div', { class: 'pr-meta__item' },
    el('span', { class: 'pr-meta__label' }, label),
    el('span', { class: 'pr-meta__value' }, value ?? '—'));
  sheetParts.push(el('div', { class: 'pr-head' },
    el('div', { class: 'pr-head__brand' }, icon('clipboard', 13), 'سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام'),
    el('h1', { class: 'pr-head__title' }, 'گزارش پیشرفت توانبخشی — مبتنی بر چک‌لیست مهارتی'),
    el('div', { class: 'pr-meta' },
      metaItem('دانش‌آموز', `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim()),
      metaItem('سن', ageLineOf(student.birthDate)),
      metaItem('پایه', student.grade ? gradeLabel(student.grade) : null),
      metaItem('مسیر پرونده', student.pathway ? (student.pathway === 'rehab' ? 'توانبخشی' : 'اختلال یادگیری') : null),
      metaItem('پروتکل فعال', protocolKey ? (PROTOCOL_LABELS[protocolKey] ?? protocolKey) : null),
      metaItem('فاز مسیر', phaseLabel),
      metaItem('بازهٔ جلسات', sessionRange),
      metaItem('تاریخ گزارش', formatJalaliNumeric(tehranTodayYmd()))
    )
  ));

  const kpi = (numv, label) => el('div', { class: 'pr-kpi' },
    el('div', { class: 'pr-kpi__num' }, fa(numv)),
    el('div', { class: 'pr-kpi__label' }, label));
  sheetParts.push(el('div', { class: 'pr-kpis' },
    kpi(summary.sessions ?? 0, 'جلسهٔ ثبت‌شده'),
    kpi(summary.confirmedMastered ?? 0, 'تسلط تأییدشده (دوجلسه‌ای)'),
    kpi((totals?.masteredPending ?? 0) > 0 ? totals.masteredPending : 0, 'بلد — در انتظار تأیید'),
    kpi(summary.withHelp ?? totals?.withHelp ?? 0, 'در حال تمرین با کمک'),
    kpi(totals?.notYet ?? 0, 'هنوز نه'),
    kpi(totals ? `${fa(totals.scored)}/${fa(totals.total)}` : '—', 'مهارت‌های ارزیابی‌شده از چک‌لیست')
  ));

  const scorePoints = sessions.map((s) => ({
    x: `ج${fa(s.ord)}`,
    y: Math.round(sessionScore(s) * 10) / 10,
    note: `${fa(s.mastered)} بلد · ${fa(s.withHelp)} با کمک · ${fa(s.notYet)} هنوز نه`
  }));
  const slope = olsSlope(sessions.map(sessionScore));
  const tv = trendVerdict(slope);
  const firstScore = sessions.length ? sessionScore(sessions[0]) : null;
  const lastScore = sessions.length ? sessionScore(sessions[sessions.length - 1]) : null;
  sheetParts.push(el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('trendingUp', 16), 'روند تسلط مهارتی — جلسه به جلسه'),
      sessions.length ? el('span', { class: `badge ${tv.cls}` }, tv.label) : null),
    el('div', { class: 'card__body' },
      sessions.length
        ? [
            deferredChart(() => lineChart({ points: scorePoints, yMin: 0, yMax: 100 }), { reserveH: 190 }) /* E3 */,
            el('div', { class: 'cell-sub' },
              `نمرهٔ ترکیبی از ${fa(Math.round(firstScore))}٪ در جلسهٔ اول به ${fa(Math.round(lastScore))}٪ در آخرین جلسه رسیده است — ${tv.text}`),
            el('div', { class: 'pr-note' },
              `نمرهٔ جلسه = (بلد×۱ + با‌کمک×۰٫۵) ÷ مهارت‌های ارزیابی‌شدهٔ همان جلسه؛ شیب روند با رگرسیون خطی کمینه‌مربع‌ها: ${slope >= 0 ? '+' : '−'}${fa(Math.abs(Math.round(slope * 10) / 10))} نمره در هر جلسه. تسلط فقط با قاعدهٔ دوجلسه‌ای («بلد» در دو جلسهٔ متوالی) تأیید می‌شود.`)
          ]
        : emptyState({
            iconName: 'trendingUp',
            title: 'هنوز جلسه‌ای ثبت نشده است',
            hint: 'پس از ثبت جلسات چک‌لیست مهارتی، نمودار روند و شیب پیشرفت همین‌جا می‌نشیند.'
          })
    )
  ));

  const promptPoints = sessions.map((s) => {
    if (!s.withHelp || !s.prompts) return null;
    let wsum = 0;
    let cnt = 0;
    for (const [k, c] of Object.entries(s.prompts)) {
      if (PROMPT_ORD[k] == null) continue;
      wsum += PROMPT_ORD[k] * c;
      cnt += c;
    }
    if (!cnt) return null;
    return { x: `ج${fa(s.ord)}`, y: Math.round((wsum / cnt) * 100) / 100 };
  }).filter(Boolean);
  const pSlope = olsSlope(promptPoints.map((p) => p.y));
  const pv = promptVerdict(pSlope);
  const noHelpSessions = sessions.filter((s) => s.withHelp === 0).length;
  sheetParts.push(el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('compass', 16), 'منحنی محو راهنما — استقلال‌یابی'),
      promptPoints.length >= 2 ? el('span', { class: `badge ${pv.cls}` }, pv.label) : null),
    el('div', { class: 'card__body' },
      promptPoints.length >= 2
        ? [
            deferredChart(() => lineChart({ points: promptPoints, yMin: 0, yMax: 4, valueFormatter: (v) => fa(Math.round(v * 100) / 100) }), { reserveH: 190 }) /* E3 */,
            el('div', { class: 'cell-sub' }, pv.text),
            el('div', { class: 'pr-note' },
              `میانگین سطح راهنمای مهارت‌های «با کمک» در هر جلسه — ۱: راهنمای کلامی · ۲: ژستی/الگودهی · ۳: لمسی جزئی · ۴: راهنمای فیزیکی کامل (سلسله‌مراتب least-to-most prompting). شیب: ${pSlope >= 0 ? '+' : '−'}${fa(Math.abs(Math.round(pSlope * 100) / 100))} سطح در هر جلسه.${noHelpSessions ? ` در ${fa(noHelpSessions)} جلسه هیچ مهارتی «با کمک» انجام نشده و نقطه‌ای ندارد.` : ''}`)
          ]
        : emptyState({
            iconName: 'compass',
            title: 'دادهٔ سطح راهنما کافی نیست',
            hint: 'این منحنی پس از حداقل دو جلسهٔ دارای مهارت «با کمک» (با ثبت سطح راهنما) رسم می‌شود.'
          })
    )
  ));

  const checklistCard = buildChecklistCard(profile);
  sheetParts.push(checklistCard);

  sheetParts.push(buildBaselineCard({ fxFirst, fxLast, hasRetest, rehabCount: rehabEvents.length }));

  sheetParts.push(buildGoalsCard({ profile, needsEvent, fxLast, sessions }));

  sheetParts.push(el('div', { class: 'pr-foot' },
    el('span', {}, `تولید خودکار از سامانه — تاریخ گزارش: ${formatJalaliNumeric(tehranTodayYmd())}`),
    el('span', {}, 'این گزارش مبنای استناد بالینی پیشرفت جلسه‌به‌جلسه است؛ تفسیر نهایی با درمانگر.')
  ));

  const root = el('div', { class: 'pr-sheet' }, ...sheetParts);
  container.replaceChildren(root);
  return root;
}

function buildChecklistCard(profile) {
  if (!profile?.domains?.length) {
    return el('div', { class: 'card' },
      el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('clipboard', 16), 'چک‌لیست مهارتی — وضعیت فعلی')),
      el('div', { class: 'card__body' }, emptyState({
        iconName: 'clipboard',
        title: 'چک‌لیست مهارتی در دسترس نیست',
        hint: 'پس از فعال‌سازی پروتکل و چک‌لیست مهارتی، وضعیت هر مهارت این‌جا چاپ می‌شود.'
      })));
  }
  const rows = [];
  for (const d of profile.domains) {
    rows.push(el('tr', { class: 'pr-domain-row' },
      el('td', { colspan: 5, scope: 'rowgroup' }, /* S7-18: سرگروه حیطه */
        `${d.title} — ${fa(d.mastered)} بلدِ تأییدشده · ${fa(d.masteredPending)} در انتظار تأیید · ${fa(d.withHelp)} با کمک · ${fa(d.notYet)} هنوز نه`)));
    for (const sk of d.skills) {
      rows.push(el('tr', null,
        el('td', {}, sk.title, sk.isPrimary ? null : el('span', { class: 'badge badge--info pr-chip' }, 'مکمل')),
        el('td', { class: 'cell-sub' }, sk.criterion ?? '—'),
        el('td', { class: 'is-num' },
          sk.status
            ? el('span', { class: `badge ${STATUS_CLS[sk.status] ?? 'badge--neutral'}` }, STATUS_LABELS[sk.status] ?? sk.status)
            : el('span', { class: 'badge badge--neutral' }, 'ارزیابی نشده')),
        el('td', { class: 'is-num' },
          sk.masteryConfirmed
            ? el('span', { class: 'badge badge--success' }, 'تأییدشده')
            : sk.status === 'mastered'
              ? el('span', { class: 'badge badge--warning' }, 'در انتظار جلسهٔ دوم')
              : '—'),
        el('td', { class: 'is-num' }, sk.promptLevel ? (OT_PROMPT_LEVELS[sk.promptLevel] ?? sk.promptLevel) : '—')
      ));
    }
  }
  return el('div', { class: 'card card--break' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('clipboard', 16), 'چک‌لیست مهارتی — وضعیت فعلی'),
      el('span', { class: 'badge badge--info' }, `${fa(profile.totals?.scored ?? 0)} از ${fa(profile.totals?.total ?? 0)} مهارت ارزیابی‌شده`)),
    el('div', { class: 'card__body' },
      el('div', { class: 'pr-scroll' },
        el('table', { class: 'pr-table', 'aria-label': 'پایش تسلط مهارت‌ها به تفکیک حیطه' }, /* S7-18 */
          el('thead', null, el('tr', null,
            el('th', { scope: 'col' }, 'حیطه / مهارت'),
            el('th', { scope: 'col' }, 'ملاک عملکرد'),
            el('th', { scope: 'col' }, 'وضعیت فعلی'),
            el('th', { scope: 'col' }, 'تسلط دوجلسه‌ای'),
            el('th', { scope: 'col' }, 'سطح راهنمای اخیر'))),
          el('tbody', null, ...rows))),
      el('div', { class: 'pr-note' },
        'وضعیت‌ها از آخرین ثبت هر مهارت در جلسات کاردرمانی ذهنی استخراج شده است. «تسلط دوجلسه‌ای» یعنی «بلد است» در دو جلسهٔ متوالی — طبق قاعدهٔ داوری دوجلسه‌ای سامانه؛ سطح راهنما فقط برای وضعیت «با کمک» معنا دارد.')
    )
  );
}

function buildBaselineCard({ fxFirst, fxLast, hasRetest, rehabCount = 0 }) {
  const head = el('div', { class: 'card__head' },
    el('div', { class: 'card__title' }, icon('brain', 16), 'خط پایهٔ عملکردی ↔ بازسنجی — شش حیطهٔ شناختی'));
  if (!fxLast) {
    return el('div', { class: 'card' }, head,
      el('div', { class: 'card__body' }, emptyState({
        iconName: 'brain',
        title: 'خط پایهٔ عملکردی ثبت نشده است',
        hint: 'شش تکلیف کوتاه خط پایه (≈۲۰ دقیقه) در جلسهٔ اول مسیر ثبت می‌شود؛ مقایسهٔ قبل/بعد و RCI از همین ثبت ساخته می‌شود.'
      })));
  }

  const firstVals = fxVals(fxFirst);
  const lastVals = fxVals(fxLast);
  const rows = [];
  for (const key of Object.keys(FX_LABELS)) {
    const a = firstVals[key];
    const b = lastVals[key];
    if (!a && !b) continue;
    const firstCell = a ? `${fa(a.v)} ${FX_UNIT[key]}` : '—';
    const lastCell = b ? `${fa(b.v)} ${FX_UNIT[key]}` : '—';
    let deltaCell = el('td', { class: 'is-num' }, '—');
    let rciCell = '—';
    if (a && b && hasRetest) {
      const d = (b.v - a.v) * FX_DIR[key];
      let verdict = d > 0
        ? { text: 'بهبود', cls: 'pr-verdict--good' }
        : d < 0
          ? { text: 'افت', cls: 'pr-verdict--bad' }
          : { text: 'بدون تغییر', cls: 'pr-verdict--flat' };
      const p1 = FX_PROMPT_ORD[a.prompt];
      const p2 = FX_PROMPT_ORD[b.prompt];
      if (p1 != null && p2 != null && p1 !== p2) {
        verdict = p2 < p1
          ? { text: d > 0 ? 'بهبود + راهنمای کمتر' : 'بدون تغییر عدد + راهنمای کمتر', cls: 'pr-verdict--good' }
          : { text: d < 0 ? 'افت + راهنمای بیشتر' : 'بدون تغییر عدد + راهنمای بیشتر', cls: 'pr-verdict--bad' };
      }
      deltaCell = el('td', { class: 'is-num' },
        el('b', { class: `pr-verdict ${verdict.cls}` }, verdict.text),
        el('div', { class: 'cell-sub' }, `${d > 0 ? '+' : d < 0 ? '−' : ''}${fa(Math.abs(d))} ${FX_UNIT[key]}`));
      const rci = rciOf(a.v, b.v, key);
      if (rci != null) {
        const sig = Math.abs(rci) >= 1.96;
        rciCell = `${rci >= 0 ? '+' : '−'}${fa(Math.abs(Math.round(rci * 100) / 100))}${sig ? ' (معنادار)' : ''}`;
      }
    }
    rows.push(el('tr', null,
      el('td', {}, FX_LABELS[key]),
      el('td', { class: 'is-num' }, firstCell),
      el('td', { class: 'is-num' }, a?.band ?? '—'),
      el('td', { class: 'is-num' }, lastCell),
      el('td', { class: 'is-num' }, b?.band ?? '—'),
      deltaCell,
      hasRetest ? el('td', { class: 'is-num' }, rciCell) : null
    ));
  }

  const thead = el('thead', null, el('tr', null,
    el('th', { scope: 'col' }, 'حیطه'), /* S7-18 */
    el('th', { scope: 'col' }, hasRetest ? `ثبت اول (${formatJalaliNumeric(tehranYmdOf(fxFirst.occurredAt))})` : 'ثبت اول'),
    el('th', { scope: 'col' }, 'باند'),
    el('th', { scope: 'col' }, hasRetest ? `بازسنجی (${formatJalaliNumeric(tehranYmdOf(fxLast.occurredAt))})` : 'آخرین ثبت'),
    el('th', { scope: 'col' }, 'باند'),
    el('th', {}, 'تغییر و رأی روند'),
    ...(hasRetest ? [el('th', {}, 'RCI')] : [])
  ));

  const noteText = hasRetest
    ? `مقایسهٔ ${fa(rehabCount)} ثبت خط پایهٔ عملکردی. RCI = تغییر جهت‌آگاه ÷ SE_diff؛ SE از دامنهٔ مقیاس (دامنه ÷ √۱۲) تخمین زده شده و پایایی بازآزمایی r=${fa(0.8)} فرض شده است — تخمین محافظه‌کارانه تا هنگام هنجارش ابزار؛ |RCI| ≥ ۱٫۹۶ یعنی تغییر معنادار در سطح ۰٫۰۵. تفسیر همیشه در کنار تغییر باند و سطح راهنما انجام شود.`
    : 'بازسنجی همان شش تکلیف در ۸ تا ۱۲ جلسهٔ مداخله ثبت شود تا ستون مقایسه و شاخص RCI فعال شود — بدون خط پایه، «بهبود» قابل استناد نیست (طرح تک‌آزمودنی A→B).';

  return el('div', { class: 'card' }, head,
    el('div', { class: 'card__body' },
      el('div', { class: 'pr-scroll' },
        el('table', { class: 'pr-table', 'aria-label': 'پایش تسلط مهارت‌ها به تفکیک حیطه' }, /* S7-18 */ thead, el('tbody', null, ...rows))),
      el('div', { class: 'pr-note' }, noteText)
    )
  );
}

function tehranYmdOf(iso) {
  try {
    return tehranYmdOfIso(toUtcIso(iso)); // YMD خام میلادی به وقت تهران — فرمت جلالی در کارفرما
  } catch {
    return null;
  }
}

function buildGoalsCard({ profile, needsEvent, fxLast }) {
  const goals = needsEvent?.payload?.goals?.value ?? null;
  const plan = needsEvent?.payload?.session_plan?.value ?? null;

  const withHelpSkills = [];
  const notYetByDomain = [];
  if (profile?.domains?.length) {
    for (const d of profile.domains) {
      for (const sk of d.skills) {
        if (sk.isPrimary && sk.status === 'with_help') withHelpSkills.push({ title: sk.title, domain: d.title, prompt: sk.promptLevel });
      }
      const ny = d.skills.filter((sk) => sk.isPrimary && sk.status === 'not_yet').length;
      if (ny > 0) notYetByDomain.push({ title: d.title, n: ny });
    }
  }

  const priorityDomains = [];
  if (fxLast) {
    const lastVals = fxVals(fxLast);
    for (const [key, val] of Object.entries(lastVals)) {
      if (val.band === 'ضعف آشکار' || val.band === 'مرزی') priorityDomains.push(`${FX_LABELS[key]} (${val.band})`);
    }
  }

  return el('div', { class: 'card card--break' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('target', 16), 'اهداف دوره و توصیه‌ها')),
    el('div', { class: 'card__body', style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
      goals ? el('div', null,
        el('div', { class: 'cell-sub' }, el('strong', null, 'اهداف ثبت‌شدهٔ دوره (توسط درمانگر):')),
        el('div', { style: { whiteSpace: 'pre-wrap', fontSize: 'var(--fs-sm)' } }, goals)) : null,
      plan ? el('div', null,
        el('div', { class: 'cell-sub' }, el('strong', null, 'برنامهٔ جلسات ثبت‌شده:')),
        el('div', { style: { whiteSpace: 'pre-wrap', fontSize: 'var(--fs-sm)' } }, plan)) : null,
      withHelpSkills.length
        ? el('div', null,
            el('div', { class: 'cell-sub' }, el('strong', null, `اهداف نزدیک — انتقال به «بلد است» (${fa(withHelpSkills.length)} مهارت در حال تمرین با کمک):`)),
            el('div', { class: 'pr-chips' },
              ...withHelpSkills.slice(0, 8).map((s) => el('span', { class: 'chip', title: s.domain },
                s.title, s.prompt ? el('span', { class: 'cell-sub' }, ` — ${OT_PROMPT_LEVELS[s.prompt] ?? s.prompt}`) : null))))
        : el('div', { class: 'cell-sub' }, 'مهارتی در وضعیت «با کمک» نیست — اهداف بعدی از مهارت‌های «هنوز نه» یا بازسنجی خط پایه انتخاب شود.'),
      priorityDomains.length
        ? el('div', { class: 'cell-sub' },
            icon('brain', 12), el('strong', null, ' اولویت‌های خط پایهٔ عملکردی: '), priorityDomains.join(' · '))
        : null,
      el('div', { class: 'pr-note' },
        'پیشنهاد خودکار سامانه صرفاً از دادهٔ ثبت‌شده ساخته می‌شود و جای تصمیم بالینی درمانگر را نمی‌گیرد؛ برای دورهٔ بعد، بازسنجی شش حیطه و تازه‌سازی اهداف SMART توصیه می‌شود.')
    )
  );
}

// ═══ گزارش دوره‌ای طرح درمان (پارامتر ?pathway=) ═══

const PATHWAY_SESSION_BADGE = {
  planned: { label: 'برنامه‌ریزی‌شده', cls: 'badge--info' },
  done: { label: 'انجام‌شده', cls: 'badge--success' },
  skipped: { label: 'رد‌شده', cls: 'badge--neutral' }
};

// انتخابگر دوره: فهرست طرح‌های درمان دانش‌آموز — فقط وقتی مسیری وجود دارد رندر می‌شود
function buildPathwayPicker(studentId, paths) {
  if (!paths.length) return null;
  return el('div', { class: 'card pr-path-picker print-hide' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('target', 16), 'گزارش دورهٔ مداخله — طرح درمان'),
      el('span', { class: 'badge badge--neutral' }, `${fa(paths.length)} طرح`)),
    el('div', { class: 'card__body' },
      el('div', { class: 'pr-path-picker__list' },
        ...paths.map((p) => el('div', { class: 'pr-path-picker__row' },
          el('div', { class: 'pr-path-picker__name' },
            p.targetTitle,
            p.templateTitle ? el('span', { class: 'badge badge--info' }, `طرح: ${p.templateTitle}`) : null,
            el('span', { class: `badge ${PATH_STATUS_BADGE[p.status] ?? 'badge--neutral'}` }, PATH_STATUS_LABEL[p.status] ?? p.status),
            el('span', { class: 'cell-sub' }, `${fa((p.sessions ?? []).filter((s) => s.status === 'done').length)} از ${fa((p.sessions ?? []).length)} جلسه انجام شده`)),
          el('button', {
            class: 'btn btn--soft btn--sm',
            title: 'گزارش چاپی دورهٔ مداخله این طرح — تجمیع جلسات، کارت‌ها و نتیجه‌ها',
            onclick: () => { location.hash = `#/students/${studentId}/progress-report?pathway=${p.id}`; }
          }, icon('printer', 13), 'گزارش دوره')))))
  );
}

function prMetaItem(label, value) {
  return el('div', { class: 'pr-meta__item' },
    el('span', { class: 'pr-meta__label' }, label),
    el('span', { class: 'pr-meta__value' }, value ?? '—'));
}

async function renderPathwayReportView(container, { student, id, pathwayId, from, to }) {
  let report;
  try {
    report = (await api.get(`/api/clinical-paths/${pathwayId}/report${qs({ from, to })}`)).data;
  } catch (err) {
    container.replaceChildren(emptyState({
      iconName: 'alert',
      title: 'گزارش دوره ساخته نشد',
      hint: err?.message ?? 'مسیر مداخله پیدا نشد یا دسترسی مجاز نیست.'
    }));
    return;
  }
  const { pathway, period, summary, sessions, familySummary } = report;
  const parts = [];

  // سه گزارش از یک داده: بالینی (موجود) / والدپسند / مدرسه — هر سه با یک دکمه چاپ/PDF
  let audience = 'clinical';
  const AUD_CHIPS = [
    { key: 'clinical', label: 'بالینی' },
    { key: 'family', label: 'والدپسند' },
    { key: 'school', label: 'مدرسه' }
  ];
  const variantHost = el('div', { class: 'pr-variants' });
  const chipHost = el('span', { class: 'pr-period', role: 'group', 'aria-label': 'نسخهٔ گزارش' });
  const audienceChip = (a) => el('button', {
    class: `btn btn--sm ${audience === a.key ? 'btn--primary' : 'btn--ghost'}`,
    type: 'button',
    'aria-pressed': String(audience === a.key), /* S7-15 خانواده */
    onclick: () => { audience = a.key; renderVariant(); }
  }, a.label);
  function variantCardNode() {
    if (audience === 'family') {
      const v = report.parent;
      return el('div', { class: 'card' },
        el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('heart', 16), v.headline)),
        el('div', { class: 'card__body' },
          ...v.paragraphs.map((p) => el('p', { style: { margin: 'var(--sp-2) 0', lineHeight: 'var(--lh-relaxed)' } }, p)), /* ۱٫۹ جادویی → توکن (S7-16) */
          el('div', { class: 'clx-sub__title', style: { marginTop: 'var(--sp-3)' } }, 'پیشنهادهای خانه:'),
          el('ul', { class: 'pr-variant-list' }, ...v.tips.map((t) => el('li', {}, t)))));
    }
    if (audience === 'school') {
      const v = report.school;
      return el('div', { class: 'card' },
        el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('book', 16), v.headline)),
        el('div', { class: 'card__body' },
          el('div', { class: 'clx-sub__title' }, 'عملکرد کلاس:'),
          el('ul', { class: 'pr-variant-list' }, ...v.performance.map((p) => el('li', {}, p))),
          el('div', { class: 'clx-sub__title', style: { marginTop: 'var(--sp-3)' } }, 'توصیه‌های اجرایی برای معلم:'),
          el('ul', { class: 'pr-variant-list' }, ...v.actions.map((a) => el('li', {}, a)))));
    }
    return null;
  }
  function renderVariant() {
    const node = variantCardNode();
    variantHost.replaceChildren(...(node ? [node] : []));
    const focused = document.activeElement;
    const focusedIdx = [...chipHost.children].findIndex((b) => b === focused); /* S7-15: فوکوس پس از بازسازی چپ‌ها نماند */
    chipHost.replaceChildren(...AUD_CHIPS.map(audienceChip));
    if (focusedIdx >= 0 && chipHost.children[focusedIdx]) chipHost.children[focusedIdx].focus();
  }
  function printVariant() {
    if (audience === 'clinical') { window.print(); return; } // گزارش بالینی با استایل چاپ موجود
    const v = audience === 'family' ? report.parent : report.school;
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { toast('پنجرهٔ چاپ باز نشد — مسدودکنندهٔ پاپ‌آپ را خاموش کنید', 'warning'); return; }
    const esc = escapeHtml; // فرار درست تک‌کاراکترها (regex قبلی فقط جفت‌دوتایی می‌گرفت)
    const body = audience === 'family'
      ? `<h1>${esc(v.headline)}</h1><p class="meta">دانش‌آموز: ${esc(pathway.studentName)} · هدف: ${esc(pathway.targetTitle)} · بازه: ${esc(periodLabel)}</p>${v.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}<h2>پیشنهادهای خانه</h2><ul>${v.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
      : `<h1>${esc(v.headline)}</h1><p class="meta">دانش‌آموز: ${esc(pathway.studentName)} · برنامه: ${esc(pathway.targetTitle)} · بازه: ${esc(periodLabel)}</p><h2>عملکرد کلاس</h2><ul>${v.performance.map((p) => `<li>${esc(p)}</li>`).join('')}</ul><h2>توصیه‌های اجرایی</h2><ul>${v.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`;
    w.document.write(`<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(v.headline)}</title><style>@page{size:A4;margin:18mm}body{font-family:Vazirmatn,Tahoma,sans-serif;line-height:1.9;color:#1c1c1c;max-width:174mm;margin:0 auto}h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}h2{font-size:15px;margin-top:22px}p{margin:8px 0;text-align:justify}ul{padding-inline-start:22px}li{margin:6px 0;text-align:justify}.meta{color:#555;font-size:12px;border-bottom:1px solid #ddd;padding-bottom:10px}.brand{font-size:11px;color:#777;margin-top:26px;border-top:1px solid #ddd;padding-top:8px}</style></head><body>${body}<div class="brand">سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام — ${esc(formatJalaliNumeric(today))}</div></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300); // صبر برای رندر صفحه قبل از گفت‌وگوی ذخیره PDF
  }

    // نوار ابزار (چاپ نمی‌شود): بازگشت + انتخاب بازه + چاپ
  const periodHash = (f, t) =>
    `#/students/${id}/progress-report?pathway=${pathwayId}${f ? `&from=${f}` : ''}${t ? `&to=${t}` : ''}`;
  const today = tehranTodayYmd();
  const periodChip = (label, f, t) => el('button', {
    class: `btn btn--sm ${(period.from ?? null) === f && (period.to ?? null) === t ? 'btn--primary' : 'btn--ghost'}`,
    onclick: () => { location.hash = periodHash(f, t); }
  }, label);
  parts.push(el('div', { class: 'toolbar print-hide' },
    el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { location.hash = `#/students/${id}`; } },
      icon('chevR', 14), 'بازگشت به پروفایل'),
    el('span', { class: 'pr-period' },
      periodChip('کل دوره', null, null),
      periodChip('۳۰ روز اخیر', addDaysYmd(today, -29), today),
      periodChip('۹۰ روز اخیر', addDaysYmd(today, -89), today)),
    el('span', { class: 'spacer' }) /* S7-20 */,
    chipHost, // انتخاب گزارش: بالینی / والدپسند / مدرسه
    el('button', { class: 'btn btn--primary btn--sm', onclick: printVariant },
      icon('printer', 15), 'چاپ / ذخیرهٔ PDF')
  ));

  // سربرگ گزارش
  const periodLabel = period.from || period.to
    ? `${period.from ? formatJalaliNumeric(period.from) : '…'} تا ${period.to ? formatJalaliNumeric(period.to) : '…'}`
    : summary.doneDateFirst
      ? `${formatJalaliNumeric(tehranYmdOf(summary.doneDateFirst))} تا ${formatJalaliNumeric(tehranYmdOf(summary.doneDateLast))}`
      : 'کل دوره — هنوز جلسه‌ای انجام نشده';
  parts.push(el('div', { class: 'pr-head' },
    el('div', { class: 'pr-head__brand' }, icon('clipboard', 13), 'سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام'),
    el('h1', { class: 'pr-head__title' }, 'گزارش دورهٔ مداخله — طرح درمان'),
    el('div', { class: 'pr-meta' },
      prMetaItem('دانش‌آموز', pathway.studentName),
      prMetaItem('هدف مداخله', pathway.targetTitle),
      prMetaItem('وضعیت مسیر', PATH_STATUS_LABEL[pathway.status] ?? pathway.status),
      prMetaItem('طرح درمان', pathway.templateTitle ?? 'دستی درمانگر'),
      prMetaItem('بازهٔ گزارش', periodLabel),
      prMetaItem('تاریخ گزارش', formatJalaliNumeric(today))
    )
  ));

  // ردیف شاخص‌ها
  parts.push(variantHost); // کارت واریانت والدپسند/مدرسه همین‌جا می‌نشیند (بالینی = خالی)
  const kpi = (numv, label) => el('div', { class: 'pr-kpi' },
    el('div', { class: 'pr-kpi__num' }, numv),
    el('div', { class: 'pr-kpi__label' }, label));
  parts.push(el('div', { class: 'pr-kpis' },
    kpi(fa(summary.sessionsDone), 'جلسهٔ انجام‌شده'),
    kpi(fa(summary.sessionsPlanned), 'در برنامه — اجرا نشده'),
    kpi(fa(summary.sessionsSkipped), 'جلسهٔ رد‌شده'),
    kpi(summary.outcomeCoverage != null ? `${fa(Math.round(summary.outcomeCoverage * 100))}٪` : '—', 'پوشش نتیجه‌نویسی جلسات'),
    kpi(summary.cardsTotal ? `${fa(summary.cardsDone)}/${fa(summary.cardsTotal)}` : '—', 'کارت انجام‌شده از برنامه'),
    kpi(summary.probeCardsPlanned ? `${fa(summary.probeCardsDone)}/${fa(summary.probeCardsPlanned)}` : '—', 'سنجش پیشروی (پراپ)')
  ));

  // پاسخ عددی سه پرسش پایش: تسلط؟ روند؟ تصمیم پیشنهادی؟ + دوز و وفاداری اجرا
  if (report.monitoring) {
    const m = report.monitoring;
    const TREND_FA = {
      improving: 'بهبود روشن', gradual: 'بهبود تدریجی', plateau: 'تقریباً پایدار',
      insufficient: 'دادهٔ کافی نیست', slight_decline: 'افت خفیف', regressed: 'افت روشن'
    };
    const FOUR_FA = { rising: 'صعود', falling: 'نزول', indeterminate: 'نامعین', insufficient: 'دادهٔ کافی نیست' };
    const DEC_FA = { continue: 'ادامهٔ همین برنامه', dose: 'افزایش دوز', change: 'تغییر روش', none: 'تسلط برقرار — کاهش پایش' };
    const answer = (q, value, hint) => el('div', { class: 'monitor-answer' },
      el('b', {}, q),
      el('div', {}, value),
      hint ? el('div', { class: 'cell-sub' }, hint) : null);
    parts.push(el('div', { class: 'monitor-answers' },
      answer('تسلط؟',
        m.masteryAchieved === null
          ? '— پراپی ثبت نشده'
          : m.masteryAchieved
            ? `بله — ملاک برقرار است (${m.masteryPct != null ? `${fa(m.masteryPct)}٪ ملاک` : ''})`
            : m.masteryPct != null ? `هنوز نه — ${fa(m.masteryPct)}٪ ملاک` : '—',
        m.metric ? `سنجهٔ «${m.metric}» با ${fa(m.points)} داده` : null),
      answer('روند؟',
        m.trendKey ? (TREND_FA[m.trendKey] ?? m.trendKey) + (m.slopePerSession != null ? ` — شیب ${fa(m.slopePerSession)} در هر پراپ` : '') : '—',
        m.fourPointKey ? `قاعدهٔ ۴-نقطه: ${FOUR_FA[m.fourPointKey] ?? m.fourPointKey}` : null),
      answer('تصمیم پیشنهادی؟',
        m.decisionLabel ? (DEC_FA[m.decision] ?? m.decisionLabel) : '—',
        m.decision === 'dose' ? 'پیش از تغییر روش، تعداد/تناوب جلسه و تمرین خانگی بیشتر شود' : null),
      answer('دوز و وفاداری؟',
        `دوز: ${fa(m.doseDone)}/${fa(m.dosePlanned)} جلسه${m.doseAdherencePct != null ? ` (${fa(m.doseAdherencePct)}٪)` : ''} · وفاداری: ${m.fidelityPct != null ? `${fa(m.fidelityPct)}٪` : 'ثبت نشده'}`,
        'دوز بر مبنای جلسات برنامه‌ریزی‌شده — وفاداری از چک‌لیست سه‌گانهٔ جلسات انجام‌شده')
    ));
  }

  // روند تجمعی کارت‌های انجام‌شده روی جلسات انجام‌شده (فقط وقتی دو نقطه یا بیشتر باشد معنا دارد)
  const doneSessions = sessions.filter((s) => s.status === 'done');
  let cardsAcc = 0;
  const trendPoints = doneSessions.map((s) => {
    cardsAcc += s.cardsDone;
    return { x: `ج${fa(s.ord)}`, y: cardsAcc, note: `${fa(s.cardsDone)} کارت از ${fa(s.cardsTotal)} در همین جلسه` };
  });
  parts.push(el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('trendingUp', 16), 'روند تجمعی کارت‌های انجام‌شده — جلسه به جلسه'),
      trendPoints.length >= 2 ? el('span', { class: 'badge badge--info' }, `${fa(cardsAcc)} کارت تا پایان دوره`) : null),
    el('div', { class: 'card__body' },
      trendPoints.length >= 2 && summary.cardsTotal > 0
        ? [
            deferredChart(() => lineChart({ points: trendPoints, yMin: 0, yMax: summary.cardsTotal }), { reserveH: 190 }) /* E3 */,
            el('div', { class: 'pr-note' },
              `هر نقطه، مجموع کارت‌های انجام‌شده تا پایان آن جلسه است — از ${fa(summary.cardsTotal)} کارتِ برنامه‌ریزی‌شده در جلسات این بازه. نرخ کل: ${summary.cardsDonePct != null ? `${fa(summary.cardsDonePct)}٪` : '—'}.`)
          ]
        : emptyState({
            iconName: 'trendingUp',
            title: 'دادهٔ کافی برای رسم روند نیست',
            hint: 'این نمودار پس از حداقل دو جلسهٔ انجام‌شدهٔ دارای کارت رسم می‌شود.'
          })
    )
  ));

  // جدول جلسه‌به‌جلسه: هدف / معیار / وضعیت / نتیجه / کارت‌ها
  parts.push(buildPathwaySessionsCard(sessions, period));

  // خلاصه برای خانواده — پاراگراف قطعیِ سرور
  parts.push(el('div', { class: 'card card--break' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('heart', 16), 'خلاصه برای خانواده'),
      el('span', { class: 'badge badge--success' }, 'قابل ارائه به والد')),
    el('div', { class: 'card__body' },
      el('p', { class: 'pr-family' }, familySummary),
      el('div', { class: 'pr-note' },
        'این خلاصه به‌طور خودکار از اعداد همین گزارش ساخته می‌شود؛ متن کامل نتیجه‌ها در جدول جلسات است و تفسیر نهایی با درمانگر.'))
  ));

  parts.push(el('div', { class: 'pr-foot' },
    el('span', {}, `تولید خودکار از سامانه — تاریخ گزارش: ${formatJalaliNumeric(today)}`),
    el('span', {}, 'گزارش دورهٔ طرح درمان — مبنای گفت‌وگوی جلسهٔ بازنگری و بازسنجی.')
  ));

  const root = el('div', { class: 'pr-sheet' }, ...parts);
  renderVariant(); // چیپ‌ها و واریانت پیش‌فرض (بالینی)
  container.replaceChildren(root);
  return root;
}

function buildPathwaySessionsCard(sessions, period) {
  const rows = sessions.map((s) => {
    const st = PATHWAY_SESSION_BADGE[s.status] ?? { label: s.status, cls: 'badge--neutral' };
    const cardLines = (s.cards ?? []).map((it) => el('div', { class: `pr-cards-line${it.done ? ' is-done' : ''}` },
      `${it.done ? '✓' : '—'} ${SESSION_ITEM_LABELS[it.type] ?? it.type}: ${it.text}`));
    return el('tr', null,
      el('td', { class: 'is-num' }, fa(s.ord), el('div', { class: 'cell-sub' }, s.title)),
      el('td', {}, s.goal ?? '—'),
      el('td', { class: 'cell-sub' }, s.criterion ?? '—'),
      el('td', { class: 'is-num' }, el('span', { class: `badge ${st.cls}` }, st.label)),
      el('td', { class: 'is-num' }, s.doneAt ? formatJalaliNumeric(tehranYmdOf(s.doneAt)) : '—'),
      el('td', {}, s.outcome ?? '—'),
      el('td', {},
        el('div', { class: 'cell-sub' }, s.cardsTotal ? `${fa(s.cardsDone)} از ${fa(s.cardsTotal)} انجام شد` : 'کارت نداشت'),
        cardLines.length ? el('div', { class: 'pr-cards' }, ...cardLines) : null)
    );
  });
  return el('div', { class: 'card card--break' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('clipboard', 16), 'جلسات طرح درمان — هدف، معیار تسلط و نتیجه'),
      el('span', { class: 'badge badge--neutral' }, `${fa(sessions.length)} جلسه در این بازه`)),
    el('div', { class: 'card__body' },
      rows.length
        ? el('div', { class: 'pr-scroll' },
            el('table', { class: 'pr-table', 'aria-label': 'پایش تسلط مهارت‌ها به تفکیک حیطه' }, /* S7-18 */
              el('thead', null, el('tr', null,
                el('th', {}, 'جلسه'),
                el('th', {}, 'هدف جلسه'),
                el('th', {}, 'معیار تسلط'),
                el('th', {}, 'وضعیت'),
                el('th', {}, 'تاریخ انجام'),
                el('th', {}, 'نتیجهٔ جلسه'),
                el('th', {}, 'کارت‌های جلسه'))),
              el('tbody', null, ...rows)),
            el('div', { class: 'pr-note' },
              period.from || period.to
                ? 'در گزارش دوره‌ای فقط جلسات انجام‌شدهٔ همین بازه می‌آیند — جلسات برنامه‌ریزی‌شده و رد‌شده در گزارش «کل دوره» دیده می‌شوند.'
                : 'وضعیت و نتیجهٔ هر جلسه از ثبت درمانگر در پنل «برنامهٔ جلسه به جلسه» پرونده می‌آید؛ علامت ✓ یعنی کارت در جلسه انجام شده است.'))
        : emptyState({
            iconName: 'clipboard',
            title: 'در این بازه جلسه‌ای ثبت نشده است',
            hint: 'بازهٔ «کل دوره» را انتخاب کنید یا پس از ثبت جلسات، گزارش را دوباره باز کنید.'
          })
    )
  );
}
