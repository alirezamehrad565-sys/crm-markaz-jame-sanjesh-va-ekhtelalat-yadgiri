import { api, qs } from '../api.js';
import {
  fa, enDigits, toGregorian, tehranTodayYmd, toUtcIso, tehranYmdOfIso,
  formatJalaliNumeric, formatJalaliDateTime, gradeLabel
} from '../format.js';
import { el, icon, skeletonState, errorState, emptyState } from '../ui.js';
import { lineChart } from '../charts.js';
import { OT_PROMPT_LEVELS, NEEDS_KEY } from '../ot-checklist.js';
import { REHAB_FX_KEY } from '../clinical-content.js';

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
  container.replaceChildren(skeletonState('list', 6));
  const id = ctx.params.id;

  let student;
  try {
    student = (await api.get(`/api/students/${id}`)).data;
  } catch (err) {
    container.replaceChildren(emptyState({ iconName: 'alert', title: 'دانش‌آموز پیدا نشد', hint: err.message }));
    return;
  }

  const [progress, profile, gates, evRes, tyRes] = await Promise.all([
    api.get(`/api/students/${id}/ot/progress`).then((r) => r.data).catch(() => null),
    api.get(`/api/students/${id}/ot/profile`).then((r) => r.data).catch(() => null),
    api.get(`/api/students/${id}/clinical-gates`).then((r) => r.data).catch(() => null),
    api.get(`/api/students/${id}/case-events${qs({ limit: 200 })}`).then((r) => r.data ?? []).catch(() => []),
    api.get('/api/case-events/types').then((r) => r.data ?? []).catch(() => [])
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
    el('span', { style: { flex: '1' } }),
    el('button', { class: 'btn btn--primary btn--sm', onclick: () => window.print() },
      icon('printer', 15), 'چاپ / ذخیرهٔ PDF')
  ));

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
            lineChart({ points: scorePoints, yMin: 0, yMax: 100 }),
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
            lineChart({ points: promptPoints, yMin: 0, yMax: 4, valueFormatter: (v) => fa(Math.round(v * 100) / 100) }),
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
      el('td', { colspan: 5 },
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
        el('table', { class: 'pr-table' },
          el('thead', null, el('tr', null,
            el('th', {}, 'حیطه / مهارت'),
            el('th', {}, 'ملاک عملکرد'),
            el('th', {}, 'وضعیت فعلی'),
            el('th', {}, 'تسلط دوجلسه‌ای'),
            el('th', {}, 'سطح راهنمای اخیر'))),
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
    el('th', {}, 'حیطه'),
    el('th', {}, hasRetest ? `ثبت اول (${formatJalaliNumeric(tehranYmdOf(fxFirst.occurredAt))})` : 'ثبت اول'),
    el('th', {}, 'باند'),
    el('th', {}, hasRetest ? `بازسنجی (${formatJalaliNumeric(tehranYmdOf(fxLast.occurredAt))})` : 'آخرین ثبت'),
    el('th', {}, 'باند'),
    el('th', {}, 'تغییر و رأی روند'),
    ...(hasRetest ? [el('th', {}, 'RCI')] : [])
  ));

  const noteText = hasRetest
    ? `مقایسهٔ ${fa(rehabCount)} ثبت خط پایهٔ عملکردی. RCI = تغییر جهت‌آگاه ÷ SE_diff؛ SE از دامنهٔ مقیاس (دامنه ÷ √۱۲) تخمین زده شده و پایایی بازآزمایی r=${fa(0.8)} فرض شده است — تخمین محافظه‌کارانه تا هنگام هنجارش ابزار؛ |RCI| ≥ ۱٫۹۶ یعنی تغییر معنادار در سطح ۰٫۰۵. تفسیر همیشه در کنار تغییر باند و سطح راهنما انجام شود.`
    : 'بازسنجی همان شش تکلیف در ۸ تا ۱۲ جلسهٔ مداخله ثبت شود تا ستون مقایسه و شاخص RCI فعال شود — بدون خط پایه، «بهبود» قابل استناد نیست (طرح تک‌آزمودنی A→B).';

  return el('div', { class: 'card' }, head,
    el('div', { class: 'card__body' },
      el('div', { class: 'pr-scroll' },
        el('table', { class: 'pr-table' }, thead, el('tbody', null, ...rows))),
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
