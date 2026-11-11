import { api } from '../api.js';
import { fa, formatJalaliDateTime, formatJalaliShort } from '../format.js';
import { el, icon, openModal, confirmModal, toast, toastError, emptyState, errorState, skeletonState, collapseRemove, flashNode, kpi, dataTable } from '../ui.js';
import { lineChart, hbars } from '../charts.js';
import { session } from '../state.js';
import { fetchAllStudents } from '../student-fetch.js';

/* ═══ ۱.۲۵.۶۱ — بازطراحی مستقل «نظرسنجی خانواده‌ها» در سه تب ═══
   خواست کارفرما: «این ماژول باید دوباره بازنگری و باز طراحی بشه به صورت مستقل — تحقیق کن
   ببین مهم‌ترین گزارش‌هایی که از سامانه یه مدیر می‌تونه بگیره چیه … چه آمارهایی و چه شکل
   ارائه‌ای برات مهمه … سپس کل ماژول رو باز طراحی کن و اجرا».
   پژوهش مدیر-محور (Valant/CareTap/CSQ-8/NPS سلامت/IBCS): عددِ بدون هدف و بدون مقایسه برای
   مدیر بی‌معنی است — پس تابلوی تازه سه تب دارد:
   ① «تابلوی شاخص‌ها» — باند هشدار استثنا (فقط وقتی چیزی نیازِ توجه دارد) + شش کارت RAG
      با دلتای دورهٔ قبل + روند برشی سه شاخص + مقایسهٔ دو فرم + کارنامهٔ درمانگران.
   ② «نظرسنجی‌ها» — عملیات روزمره (ساخت/لینک/ارسال/لغو/جزئیات پاسخ) — همان رفتار آزمودهٔ ۱.۲۵.۶۰.
   ③ «صدای خانواده» — متن‌های آزاد دسته‌بندی‌شده با تم + پرچم «نیازمند پیگیری» برای نشانهٔ منفی.
   همهٔ اعداد از /api/case-events/surveys/insights می‌آیند (فقط-مدیر، فقط-عددی). */

const KIND_META = {
  discharge: { label: 'پایان دوره', hint: 'ترخیص و اتمام جلسه‌ها — تجربهٔ کل دوره', badge: 'badge--primary' },
  progress: { label: 'حین درمان', hint: 'میانهٔ دوره — نگاه کوتاه و سریع', badge: 'badge--accent' },
  general: { label: 'تاریخی', hint: 'نظرسنجی عمومی نسخه‌های پیشین', badge: 'badge--neutral' }
};

const SURVEY_STATUS = {
  pending_family: { label: 'در انتظار پاسخ', cls: 'badge--warning' },
  completed: { label: 'پاسخ داده شد', cls: 'badge--success' },
  cancelled: { label: 'لغو شده', cls: 'badge--neutral' },
  draft: { label: 'پیش‌نویس', cls: 'badge--neutral' }
};

/* هم‌نام با SURVEY_NOTE_THEMES سرور — برای چیپ تمِ متن‌ها */
const THEME_LABEL = {
  scheduling: 'نوبت‌دهی و زمان',
  therapist: 'درمانگر و برخورد',
  communication: 'اطلاع‌رسانی و پاسخ‌گویی',
  progress: 'پیشرفت و نتیجه',
  facilities: 'فضا و محیط',
  finance: 'هزینه و شهریه'
};

/* آستانه‌های RAG — هم‌قرارداد پژوهش: رضایت ۷۵/۶۰ · نرخ پاسخ ۴۰٪ · NPS ۵۰/۰ */
const SAT_OK = 75;
const SAT_WARN = 60;
const RESP_GOAL = 0.4;

function isManager() {
  return Boolean(session.user && session.user.role === 'manager');
}

const pct = (v) => (v === null || v === undefined ? null : `${fa(v)}٪`);
const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
const satTone = (v) => (v === null || v === undefined ? 'neutral' : v >= SAT_OK ? 'success' : v >= SAT_WARN ? 'warning' : 'error');
const respTone = (rate, sent) => (rate === null || sent < 5 ? 'neutral' : rate >= RESP_GOAL ? 'success' : 'warning');
const npsTone = (v) => (v === null || v === undefined ? 'neutral' : v >= 50 ? 'success' : v >= 0 ? 'warning' : 'error');

/* دلتای پنجرهٔ جاری نسبت به پنجرهٔ قبلی — جهت با ▲▼ و عدد فارسی */
function deltaLine(cur, prev, key, { suffix = '' } = {}) {
  const c = cur?.[key];
  const p = prev?.[key];
  if (c === null || c === undefined || p === null || p === undefined) return 'دادهٔ دورهٔ قبل برای مقایسه نیست'; /* H6 — فعل بی‌فاعل نرم شد */
  const d = Math.round((c - p) * 10) / 10;
  if (Math.abs(d) < 0.5) return 'هم‌سطح دورهٔ قبل';
  return `${d > 0 ? '▲' : '▼'} ${fa(Math.abs(d))}${suffix} نسبت به دورهٔ قبل`;
}

function sectionCard(title, desc, body, { extra = null } = {}) {
  return el('div', { class: 'card', style: { padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)' } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', margin: '0 0 var(--sp-3)' } },
      el('b', { style: { fontSize: 'var(--fs-md)' } }, title),
      desc ? el('span', { class: 'cell-sub' }, desc) : null,
      extra ? el('span', { style: { marginInlineStart: 'auto' } }, extra) : null
    ),
    body
  );
}

/* ═══ ① تابلوی شاخص‌ها — نمای اجرایی (باند هشدار + کارت‌های RAG + روند + تفکیک + کارنامه) ═══ */
async function renderBoard(zone) {
  zone.replaceChildren(skeletonState('table', 5));
  let ins;
  try {
    ins = (await api.get(`/api/case-events/surveys/insights?days=${local.days}`)).data;
  } catch (err) {
    zone.replaceChildren(errorState(err, () => renderBoard(zone)));
    return;
  }

  /* — باند هشدار استثنا: فقط وقتی چیزی واقعاً نیاز توجه دارد — */
  const alerts = [];
  const cur = ins.current;
  const bk = ins.by_kind;
  if (cur.sent >= 5 && cur.response_rate !== null && cur.response_rate < RESP_GOAL) {
    alerts.push({ tone: 'warning', text: `نرخ پاسخ پایین است (${pct(Math.round(cur.response_rate * 100))}؛ هدف ≥ ${pct(40)}). یادآوری با «ارسال با بله» در تب نظرسنجی‌ها بیشترین اثر را دارد.` });
  }
  if (cur.filled >= 3 && cur.center_avg !== null && cur.center_avg < SAT_WARN) {
    alerts.push({ tone: 'error', text: `رضایت از مرکز ${pct(Math.round(cur.center_avg))} است (زیر آستانهٔ ${pct(SAT_WARN)}) — جزئیات پاسخ‌ها و تم‌های «صدای خانواده» را ببینید.` });
  }
  if (cur.filled >= 3 && cur.therapist_avg !== null && cur.therapist_avg < SAT_WARN) {
    alerts.push({ tone: 'warning', text: `رضایت از درمانگر ${pct(Math.round(cur.therapist_avg))} است — کارنامهٔ درمانگران پایین همین صفحه.` });
  }
  if ((bk.discharge.filled ?? 0) >= 3 && (bk.progress.filled ?? 0) >= 3
    && bk.discharge.center_avg !== null && bk.progress.center_avg !== null
    && bk.discharge.center_avg - bk.progress.center_avg >= 15) {
    alerts.push({ tone: 'info', text: `شکاف رضایت «پایان دوره» با «حین درمان» ≥ ${fa(15)} واحد است — مشکلات میانهٔ دوره ممکن است تا ترخیص حل شده باشند؛ نگاهی به حین درمان بیندازید.` });
  }
  if (ins.notes_negative_count > 0) {
    alerts.push({ tone: 'error', text: `${fa(ins.notes_negative_count)} نظر با نشانهٔ منفی برای پیگیری — در تب «صدای خانواده».` });
  }
  if (ins.pending_expired > 0) {
    alerts.push({ tone: 'warning', text: `${fa(ins.pending_expired)} نظرسنجی مهلت‌گذشتهٔ بی‌پاسخ دارید — در تب «نظرسنجی‌ها» فیلتر «لغو/مهلت‌گذشته» و سپس لغو کنید تا فهرست تمیز بماند.` });
  }

  /* — شش کارت اجرایی با آستانه و دلتا — */
  const kpiGrid = el('div', { class: 'kpi-grid kpi-grid--rpt', style: { marginBottom: 'var(--sp-4)' } },
    kpi('رضایت از مرکز', cur.center_avg,
      `${fa(cur.filled)} پاسخ · ${deltaLine(cur, ins.previous, 'center_avg', { suffix: ' واحد' })}`,
      satTone(cur.center_avg), (x) => `${fa(Math.round(x))}٪`),
    kpi('رضایت از درمانگر', cur.therapist_avg,
      `${deltaLine(cur, ins.previous, 'therapist_avg', { suffix: ' واحد' })}`,
      satTone(cur.therapist_avg), (x) => `${fa(Math.round(x))}٪`),
    kpi('پیشرفت از نگاه خانواده', cur.progress_avg,
      `${deltaLine(cur, ins.previous, 'progress_avg', { suffix: ' واحد' })}`,
      satTone(cur.progress_avg), (x) => `${fa(Math.round(x))}٪`),
    kpi('شاخص توصیه (NPS)', cur.nps_index,
      cur.nps_avg !== null
        ? `میانگین توصیه ${fa(cur.nps_avg)} از ۱۰ · ${deltaLine(cur, ins.previous, 'nps_index')}`
        : 'پاسخی برای توصیه ثبت نشده',
      npsTone(cur.nps_index), (x) => fa(Math.round(x))),
    kpi('نرخ پاسخ خانواده‌ها', cur.response_rate === null ? null : Math.round(cur.response_rate * 100),
      `${fa(cur.filled)} پاسخ از ${fa(cur.sent)} ارسالی · هدف ≥ ${pct(40)}`,
      respTone(cur.response_rate, cur.sent), (x) => `${fa(x)}٪`),
    kpi('نظرسنجی‌های در جریان', ins.pending_open + ins.pending_expired,
      `${fa(ins.pending_open)} در انتظار · ${fa(ins.pending_expired)} مهلت‌گذشته`,
      ins.pending_expired > 0 ? 'warning' : 'neutral', (x) => fa(x))
  );

  /* — روند برشی سه شاخص — */
  const trendChart = (title, key) => {
    const has = ins.trend.some((b) => b[key] !== null);
    const points = ins.trend.map((b) => ({ x: formatJalaliShort(b.from_ymd), y: b[key] ?? 0 }));
    return el('div', { style: { minWidth: '0' } },
      el('div', { style: { fontSize: 'var(--fs-sm)', fontWeight: 600, margin: '0 0 4px' } }, title),
      has
        ? lineChart({ points, yMax: 100, height: 170, valueFormatter: (v) => `${fa(Math.round(v))}٪`, threshold: { value: SAT_OK, label: `هدف ${pct(SAT_OK)}` } })
        : el('p', { class: 'chart__empty' }, 'در این بازه پاسخی ثبت نشده')
    );
  };
  const trendSec = sectionCard('روند در بازه', 'میانگین هر برش زمانی — خط‌چین، هدف رضایت است', el('div',
    { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--sp-3)' } },
    trendChart('رضایت از مرکز', 'center_avg'),
    trendChart('رضایت از درمانگر', 'therapist_avg'),
    trendChart('پیشرفت از نگاه خانواده', 'progress_avg')
  ));

  /* — مقایسهٔ دو فرم (پایان دوره در برابر حین درمان) — */
  const kindBar = (label, stat, key) => {
    const v = stat[key];
    if (v === null || stat.filled === 0) return null;
    return {
      label,
      value: Math.round(v),
      tone: satTone(v) === 'success' ? 'success' : satTone(v) === 'error' ? 'error' : 'warning',
      hint: `${fa(stat.sent)} ارسالی · ${fa(stat.filled)} پاسخ`
    };
  };
  const kindItems = [
    bk.discharge.response_rate !== null ? { label: 'نرخ پاسخ — پایان دوره', value: Math.round(bk.discharge.response_rate * 100), tone: respTone(bk.discharge.response_rate, bk.discharge.sent) === 'success' ? 'success' : 'warning', hint: `${fa(bk.discharge.filled)} از ${fa(bk.discharge.sent)} پاسخ` } : null,
    bk.progress.response_rate !== null ? { label: 'نرخ پاسخ — حین درمان', value: Math.round(bk.progress.response_rate * 100), tone: respTone(bk.progress.response_rate, bk.progress.sent) === 'success' ? 'success' : 'warning', hint: `${fa(bk.progress.filled)} از ${fa(bk.progress.sent)} پاسخ` } : null,
    kindBar('رضایت مرکز — پایان دوره', bk.discharge, 'center_avg'),
    kindBar('رضایت مرکز — حین درمان', bk.progress, 'center_avg'),
    kindBar('رضایت درمانگر — پایان دوره', bk.discharge, 'therapist_avg'),
    kindBar('رضایت درمانگر — حین درمان', bk.progress, 'therapist_avg'),
    kindBar('پیشرفت از نگاه خانواده — پایان دوره', bk.discharge, 'progress_avg'),
    kindBar('پیشرفت از نگاه خانواده — حین درمان', bk.progress, 'progress_avg')
  ].filter(Boolean);
  const kindSec = sectionCard('مقایسهٔ دو فرم', 'پایان دوره (تجربهٔ کل دوره) در برابر حین درمان (میانهٔ دوره)',
    kindItems.length
      ? hbars({ items: kindItems, valueFormatter: (v) => `${fa(v)}٪` })
      : emptyState({ iconName: 'clipboard', title: 'در این بازه پاسخی برای تفکیک نیست', hint: 'با ارسال نظرسنجی تازه، دادهٔ مقایسه ساخته می‌شود.' })
  );

  /* — کارنامهٔ درمانگران — */
  const thSec = sectionCard('کارنامهٔ درمانگران', 'رضایت از درمانگر فقط از پاسخ‌های همین بازه',
    dataTable({
      columns: [
        { key: 'name', label: 'درمانگر مورد ارزیابی' },
        { key: 'sent', label: 'ارسالی', align: 'center' },
        { key: 'filled', label: 'پاسخ', align: 'center' },
        { key: 'resp', label: 'نرخ پاسخ', align: 'center' },
        { key: 'sat', label: 'رضایت از درمانگر', align: 'center' },
        { key: 'prog', label: 'پیشرفت از نگاه خانواده', align: 'center' },
        { key: 'nps', label: 'توصیه (۰-۱۰)', align: 'center' },
        { key: 'last', label: 'آخرین پاسخ', align: 'center' }
      ],
      rows: ins.therapists.map((t) => ({
        id: t.therapist_id ?? '__none',
        name: t.therapist_name ?? 'بدون درمانگر مشخص (ثبت‌کننده)',
        sent: fa(t.sent),
        filled: fa(t.filled),
        resp: t.response_rate === null ? '—' : pct(Math.round(t.response_rate * 100)),
        sat: t.therapist_avg === null ? '—' : pct(Math.round(t.therapist_avg)),
        prog: t.progress_avg === null ? '—' : pct(Math.round(t.progress_avg)),
        nps: t.nps_avg === null ? '—' : fa(t.nps_avg),
        last: t.last_filled_at ? formatJalaliDateTime(t.last_filled_at) : '—'
      })),
      empty: { iconName: 'users', title: 'در این بازه نظرسنجی ثبت نشده', hint: 'پس از ارسال نظرسنجی و پاسخ خانواده‌ها، کارنامهٔ هر درمانگر اینجا می‌نشیند.' }
    }),
    { extra: el('span', { class: 'cell-sub' }, 'نظرسنجیِ بدون درمانگر انتخابی به نام ثبت‌کننده می‌نشیند') }
  );

  const windowChips = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 var(--sp-4)' } },
    el('span', { class: 'cell-sub' }, 'بازه:'),
    dayChip(7, '۷ روز'),
    dayChip(30, '۳۰ روز'),
    dayChip(90, '۹۰ روز'),
    el('span', { class: 'cell-sub', style: { marginInlineStart: 'auto' } },
      `${formatJalaliShort(ins.window.from_ymd)} تا ${formatJalaliShort(ins.window.to_ymd)} · مقایسه با دورهٔ قبلی`)
  );

  const alertBand = alerts.length
    ? el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', margin: '0 0 var(--sp-4)' } },
        ...alerts.map((a) => el('div', { class: `alert alert--${a.tone}` }, icon('alert', 16), el('div', { class: 'alert__body' }, a.text))))
    : null;

  zone.replaceChildren(windowChips, ...(alertBand ? [alertBand] : []), kpiGrid, trendSec, kindSec, thSec);

  function dayChip(days, label) {
    return el('button', {
      class: `chip ${local.days === days ? 'is-active' : ''}`,
      type: 'button',
      'aria-pressed': String(local.days === days),
      style: { cursor: 'pointer' },
      onclick: () => { local.days = days; renderBoard(zone); }
    }, label);
  }
}

/* ═══ ③ صدای خانواده — متن‌های آزاد با تم و پرچم پیگیری ═══ */
async function renderVoice(zone) {
  zone.replaceChildren(skeletonState('table', 4));
  let ins;
  try {
    ins = (await api.get(`/api/case-events/surveys/insights?days=${local.days}`)).data;
  } catch (err) {
    zone.replaceChildren(errorState(err, () => renderVoice(zone)));
    return;
  }
  const vstate = { theme: 'all', negativeOnly: false };
  const controls = el('div', {});
  const listZone = el('div', {});

  const chip = (label, active, onclick) => el('button', {
    class: `chip ${active ? 'is-active' : ''}`, type: 'button',
    'aria-pressed': String(active), style: { cursor: 'pointer' }, onclick
  }, label);

  function paintControls() {
    controls.replaceChildren(
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 var(--sp-4)' } },
        el('span', { class: 'cell-sub' }, 'تم:'),
        chip('همه', vstate.theme === 'all', () => { vstate.theme = 'all'; paint(); }),
        ...ins.themes.map((t) => chip(`${t.label} (${fa(t.count)})`, vstate.theme === t.id, () => { vstate.theme = t.id; paint(); })),
        el('span', { style: { width: '12px' } }),
        chip(vstate.negativeOnly ? '✓ فقط نیازمند پیگیری' : 'فقط نیازمند پیگیری', vstate.negativeOnly,
          () => { vstate.negativeOnly = !vstate.negativeOnly; paintControls(); paint(); })
      )
    );
  }

  function paint() {
    paintControls();
    const rows = ins.notes.filter((n) =>
      (vstate.theme === 'all' || n.themes.includes(vstate.theme))
      && (!vstate.negativeOnly || n.negative));
    if (ins.notes.length === 0) {
      listZone.replaceChildren(emptyState({
        iconName: 'message',
        title: 'در این بازه متن آزادی ثبت نشده',
        hint: 'خانواده‌ها فیلد نظر/پیشنهاد را اختیاری پر می‌کنند — با تعداد پاسخ بیشتر، صدای خانواده کامل‌تر می‌شود.'
      }));
      return;
    }
    if (rows.length === 0) {
      listZone.replaceChildren(emptyState({ iconName: 'filter', title: 'در این فیلتر متنی نیست', hint: 'فیلتر تم یا «نیازمند پیگیری» را بردارید.' }));
      return;
    }
    listZone.replaceChildren(
      ins.themes.length > 1
        ? sectionCard('فراوانی تم‌ها', 'متن‌ها با کلیدواژه به تم تقسیم شده‌اند — جهت برنامهٔ بهبود',
            hbars({ items: ins.themes.map((t) => ({ label: t.label, value: t.count, tone: t.negative_count > 0 ? 'warning' : 'accent', hint: t.negative_count > 0 ? `${fa(t.negative_count)} متن نیازمند پیگیری` : null })) }))
        : null,
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        ...rows.map((n) => noteCard(n)))
    );
  }

  function noteCard(n) {
    const kind = KIND_META[n.kind] ?? KIND_META.general;
    return el('div', { class: 'card', dataset: { id: n.id }, style: { padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: '6px' } },
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
        n.negative ? el('span', { class: 'badge badge--error' }, icon('alert', 12), ' نیازمند پیگیری') : null,
        ...n.themes.map((t) => el('span', { class: 'badge badge--neutral' }, THEME_LABEL[t] ?? t)),
        el('span', { class: `badge ${kind.badge}` }, kind.label),
        el('span', { class: 'cell-sub', style: { marginInlineStart: 'auto' } },
          n.student_name || '', n.staff_name ? ` · درمانگر: ${n.staff_name}` : '', ` · ${formatJalaliDateTime(n.created_at)}`)
      ),
      el('div', { style: { background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3)', whiteSpace: 'pre-wrap' } }, `«${n.note}»`)
    );
  }

  zone.replaceChildren(controls, listZone);
  paint();
}

/* ═══ ② نظرسنجی‌ها — عملیات روزمره (ساخت/لینک/ارسال/لغو/جزئیات) — رفتار آزمودهٔ ۱.۲۵.۶۰ ═══ */
async function renderSurveys(zone, { openCreate = false } = {}) {
  zone.replaceChildren(skeletonState('table', 4));
  let surveys;
  try {
    surveys = await api.get('/api/case-events/surveys').then((r) => r.data ?? []);
  } catch (err) {
    zone.replaceChildren(errorState(err, () => renderSurveys(zone)));
    return;
  }

  const state = { surveys, kind: 'all', status: 'all' };
  const listZone = el('div', {});
  const summaryZone = el('div', {});
  const searchInput = el('input', { class: 'input', type: 'search', placeholder: 'جستجوی نام دانش‌آموز…', style: { maxWidth: '260px' } });

  const chips = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '0 0 var(--sp-4)', alignItems: 'center' } },
    el('span', { class: 'cell-sub' }, 'فرم:'),
    kindChip('all', 'همه'),
    kindChip('discharge', 'پایان دوره'),
    kindChip('progress', 'حین درمان'),
    el('span', { style: { width: '12px' } }),
    el('span', { class: 'cell-sub' }, 'وضعیت:'),
    statusChip('all', 'همه'),
    statusChip('pending', 'در انتظار پاسخ'),
    statusChip('completed', 'پاسخ داده شد'),
    statusChip('cancelled', 'لغو/مهلت‌گذشته'),
    el('span', { style: { width: '12px' } }),
    searchInput
  );

  const newBtn = el('button', { class: 'btn btn--primary', onclick: () => openCreateModal() },
    icon('send', 16), 'نظرسنجی جدید');

  function matchesFilter(s) {
    const q = (searchInput.value ?? '').trim();
    const qOk = !q || (s.studentName ?? '').includes(q);
    const kindOk = state.kind === 'all' || s.kind === state.kind;
    const expired = s.status === 'pending_family' && s.fillExpiresAt && new Date(s.fillExpiresAt).getTime() < Date.now();
    const statusOk = state.status === 'all'
      || (state.status === 'pending' && s.status === 'pending_family' && !expired)
      || (state.status === 'completed' && s.status === 'completed')
      || (state.status === 'cancelled' && (s.status === 'cancelled' || expired));
    return qOk && kindOk && statusOk;
  }

  function paintSummary() {
    if (!summaryZone.isConnected) return;
    const all = state.surveys ?? [];
    const filled = all.filter((s) => s.status === 'completed');
    const pendingN = all.filter((s) => s.status === 'pending_family').length;
    const centerAvg = avg(filled.map((s) => s.centerScore).filter((x) => x !== null && x !== undefined));
    const therapistAvg = avg(filled.map((s) => s.therapistScore).filter((x) => x !== null && x !== undefined));
    const progressAvg = avg(filled.map((s) => s.progressScore).filter((x) => x !== null && x !== undefined));
    const npsVals = filled.map((s) => s.nps).filter((x) => x !== null && x !== undefined);
    const npsAvg = npsVals.length ? Math.round((npsVals.reduce((a, b) => a + b, 0) / npsVals.length) * 10) / 10 : null;
    const dischargeN = all.filter((s) => s.kind === 'discharge').length;
    const progressN = all.filter((s) => s.kind === 'progress').length;

    summaryZone.replaceChildren(
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 var(--sp-4)', alignItems: 'center' } },
        el('span', { class: 'badge badge--accent' }, `ارسال‌شده: ${fa(all.length)}`),
        el('span', { class: 'badge badge--warning' }, `در انتظار: ${fa(pendingN)}`),
        el('span', { class: 'badge badge--success' }, `پاسخ‌گرفته: ${fa(filled.length)}`),
        el('span', { class: 'badge badge--neutral' }, `پایان دوره: ${fa(dischargeN)} · حین درمان: ${fa(progressN)}`),
        centerAvg !== null ? el('span', { class: 'badge badge--info' }, `میانگین مرکز: ${fa(centerAvg)}٪`) : null,
        therapistAvg !== null ? el('span', { class: 'badge badge--info' }, `میانگین درمانگر: ${fa(therapistAvg)}٪`) : null,
        progressAvg !== null ? el('span', { class: 'badge badge--info' }, `پیشرفت از نگاه خانواده: ${fa(progressAvg)}٪`) : null,
        npsAvg !== null ? el('span', { class: 'badge badge--neutral' }, `توصیه به آشنایان: ${fa(npsAvg)} از ۱۰`) : null
      )
    );
  }

  function paintChips() {
    for (const b of chips.querySelectorAll('button.chip')) {
      const on = b.dataset.chip === 'kind' ? state.kind === b.dataset.val : state.status === b.dataset.val;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  function paintList() {
    if (!listZone.isConnected) return;
    paintSummary();
    const rows = (state.surveys ?? []).filter(matchesFilter);
    if (rows.length === 0) {
      listZone.replaceChildren(emptyState({
        iconName: 'clipboard',
        title: (state.surveys ?? []).length === 0 ? 'هنوز نظرسنجی‌ای ارسال نشده' : 'نظرسنجی‌ای در این فیلتر نیست',
        hint: (state.surveys ?? []).length === 0
          ? 'با «نظرسنجی جدید» از خانواده‌های فعال دعوت کنید — هر خانواده لینک امن ۷روزهٔ خودش را می‌گیرد و نتیجه در تابلوی شاخص‌ها می‌نشیند.'
          : 'فیلتر فرم/وضعیت را عوض کنید یا عبارت جستجو را خالی کنید.'
      }));
      return;
    }
    listZone.replaceChildren(
      el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--sp-4)' } },
        ...rows.map((s) => surveyCard(s)))
    );
  }

  function kindChip(key, label) {
    return el('button', {
      class: `chip ${state.kind === key ? 'is-active' : ''}`,
      type: 'button',
      'aria-pressed': String(state.kind === key),
      dataset: { chip: 'kind', val: key },
      style: { cursor: 'pointer' },
      onclick: () => { state.kind = key; paintChips(); paintList(); }
    }, label);
  }
  function statusChip(key, label) {
    return el('button', {
      class: `chip ${state.status === key ? 'is-active' : ''}`,
      type: 'button',
      'aria-pressed': String(state.status === key),
      dataset: { chip: 'status', val: key },
      style: { cursor: 'pointer' },
      onclick: () => { state.status = key; paintChips(); paintList(); }
    }, label);
  }

  function surveyCard(s) {
    const st = SURVEY_STATUS[s.status] ?? { label: s.status, cls: 'badge--neutral' };
    const kind = KIND_META[s.kind] ?? KIND_META.general;
    const expired = s.status === 'pending_family' && s.fillExpiresAt && new Date(s.fillExpiresAt).getTime() < Date.now();
    const scoreBadges = s.status === 'completed'
      ? el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '6px 0 0' } },
          s.centerScore !== null && s.centerScore !== undefined ? el('span', { class: 'badge badge--neutral' }, `مرکز: ${fa(s.centerScore)}٪`) : null,
          s.therapistScore !== null && s.therapistScore !== undefined ? el('span', { class: 'badge badge--neutral' }, `درمانگر: ${fa(s.therapistScore)}٪`) : null,
          s.progressScore !== null && s.progressScore !== undefined ? el('span', { class: 'badge badge--neutral' }, `پیشرفت: ${fa(s.progressScore)}٪`) : null,
          s.nps !== null && s.nps !== undefined ? el('span', { class: 'badge badge--neutral' }, `توصیه: ${fa(s.nps)}/۱۰`) : null)
      : null;
    const note = s.note
      ? el('div', { class: 'cell-sub', style: { marginTop: '6px', whiteSpace: 'pre-wrap' } }, `«${s.note}»`)
      : null;
    return el('div', { class: 'card', dataset: { id: s.id }, style: { padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: '6px' } },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
        el('b', { style: { flex: '1', minWidth: '0' } }, s.studentName || 'دانش‌آموز'),
        el('span', { class: `badge ${kind.badge}` }, kind.label),
        el('span', { class: `badge ${expired ? 'badge--error' : st.cls}` }, expired ? 'مهلت تمام شده' : st.label)
      ),
      el('div', { class: 'cell-sub' },
        s.typeTitle || '',
        s.therapistName ? ` · درمانگر مورد ارزیابی: ${s.therapistName}` : '',
        ` · ساخت: ${formatJalaliDateTime(s.createdAt)}`
      ),
      scoreBadges,
      note,
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 'auto' } },
        s.status === 'completed'
          ? el('button', { class: 'btn btn--sm btn--soft', onclick: () => openDetailsModal(s) }, icon('info', 14), 'جزئیات پاسخ')
          : null,
        s.status === 'pending_family' && s.link
          ? el('button', { class: 'btn btn--sm btn--soft', onclick: async () => {
              try { await navigator.clipboard.writeText(s.link); toast('لینک فرم کپی شد — برای خانواده بفرستید'); }
              catch { toastError(new Error('کپی لینک ممکن نشد — مرورگر اجازه نداد')); }
            } }, icon('copy', 14), 'کپی لینک')
          : null,
        s.status === 'pending_family'
          ? el('button', { class: 'btn btn--sm btn--soft', onclick: async (ev) => {
              const btn = ev.currentTarget;
              btn.disabled = true;
              try {
                const res = await api.post(`/api/case-events/${s.id}/send`, { audience: 'family' });
                toast(`برای ${fa(res.data?.sent ?? 0)} چت بله ارسال شد`);
                s.sentAt = new Date().toISOString();
                refresh();
              } catch (err) {
                toastError(err);
                btn.disabled = false;
              }
            } }, icon('send', 14), 'ارسال با بله')
          : null,
        s.status === 'pending_family'
          ? el('button', { class: 'btn btn--sm btn--soft', onclick: async () => {
              const ok = await confirmModal({ title: 'لغو نظرسنجی', message: `نظرسنجی «${s.studentName}» لغو شود؟ خانواده دیگر نمی‌تواند پاسخ دهد.`, confirmLabel: 'لغو نظرسنجی', danger: true });
              if (!ok) return;
              try {
                await api.post(`/api/case-events/${s.id}/cancel`, {});
                toast('نظرسنجی لغو شد');
                removeSurvey(s.id);
              } catch (err) { toastError(err); }
            } }, icon('x', 14), 'لغو')
          : null
      )
    );
  }

  function openDetailsModal(s) {
    const rows = [
      ['رضایت از مرکز', pct(s.centerScore)],
      ['رضایت از درمانگر', pct(s.therapistScore)],
      ['پیشرفت مشاهده‌شده', pct(s.progressScore)],
      ['احتمال توصیه (۰-۱۰)', s.nps === null || s.nps === undefined ? null : fa(s.nps)]
    ].filter(([, v]) => v !== null);
    openModal({
      title: `پاسخ نظرسنجی — ${s.studentName}`,
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
        rows.length
          ? el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
              ...rows.map(([k, v]) => el('span', { class: 'badge badge--neutral' }, `${k}: ${v}`)))
          : el('div', { class: 'cell-sub' }, 'امتیاز زیرمقیاسی ثبت نشده است.'),
        el('div', { class: 'cell-sub' }, `فرم: ${s.typeTitle || KIND_META[s.kind]?.label || ''} · پاسخ: ${formatJalaliDateTime(s.sentAt ?? s.createdAt)}`),
        s.note
          ? el('div', { style: { background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3)', whiteSpace: 'pre-wrap' } }, `«${s.note}»`)
          : el('div', { class: 'cell-sub' }, 'متن پیشنهادی ثبت نشده — پاسخ بی‌نام در شاخص‌های مرکز تجمیع شده است.')
      ),
      actions: []
    });
  }

  function removeSurvey(id) {
    state.surveys = state.surveys.filter((x) => x.id !== id);
    const old = listZone.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
    if (old) collapseRemove(old);
    setTimeout(() => {
      if (listZone.isConnected) paintList();
    }, 320);
  }

  async function refresh({ flashId = null } = {}) {
    try {
      const res = await api.get('/api/case-events/surveys');
      state.surveys = res.data ?? [];
      paintList();
      if (flashId) {
        const fresh = listZone.querySelector(`[data-id="${CSS.escape(String(flashId))}"]`);
        if (fresh) flashNode(fresh);
      }
    } catch (err) {
      toastError(err);
    }
  }

  /* ─── ساخت نظرسنجی جدید: انتخاب فرم ساخت‌یافته + خانواده‌ها + درمانگر اختیاری ─── */
  async function openCreateModal() {
    let students = [];
    let staffList = [];
    listZone.replaceChildren(skeletonState('table', 3));
    try {
      [students, staffList] = await Promise.all([
        fetchAllStudents(),
        api.get('/api/staff').then((r) => r.data ?? []).catch(() => [])
      ]);
    } catch (err) {
      toastError(err);
      paintList();
      return;
    }
    if (students.length === 0) {
      toast('دانش‌آموز فعالی برای نظرسنجی نیست');
      paintList();
      return;
    }

    let kind = 'discharge';
    const checked = new Map(students.map((s) => [s.id, false]));
    const searchStudent = el('input', { class: 'input', type: 'search', placeholder: 'جستجوی نام دانش‌آموز…', style: { margin: '0 0 var(--sp-2)' } });
    const listWrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '280px', overflowY: 'auto', padding: '4px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' } });
    const footNote = el('div', { class: 'cell-sub', style: { marginTop: '6px' } });
    const therapists = staffList.filter((x) => !x.role || x.role === 'therapist');
    const therapistSel = el('select', { class: 'input' },
      el('option', { value: '' }, '— درمانگر مورد ارزیابی (اختیاری) —'),
      ...therapists.map((t) => el('option', { value: t.id }, t.full_name ?? t.fullName ?? t.name ?? t.id))
    );

    const kindCard = (key, title, hint, minutes) => {
      const btn = el('button', {
        type: 'button',
        class: `card ${kind === key ? 'is-selected' : ''}`,
        style: { padding: 'var(--sp-3)', textAlign: 'right', cursor: 'pointer', border: kind === key ? '2px solid var(--brand)' : '1px solid var(--border)', flex: '1', minWidth: '0' },
        onclick: () => {
          kind = key;
          for (const b of kindRow.querySelectorAll('button.card')) {
            b.style.border = '1px solid var(--border)';
            b.classList.remove('is-selected');
          }
          btn.style.border = '2px solid var(--brand)';
          btn.classList.add('is-selected');
        }
      },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          icon(key === 'discharge' ? 'medal' : 'activity', 15),
          el('b', { style: { fontSize: 'var(--fs-sm)' } }, title)),
        el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, `${hint} — حدود ${minutes} دقیقه`)
      );
      return btn;
    };
    const kindRow = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      kindCard('discharge', 'پایان دوره', 'ترخیص و اتمام جلسه‌ها — تجربهٔ کل دوره + پیشرفت', '۴'),
      kindCard('progress', 'حین درمان', 'میانهٔ دوره — کوتاه‌تر برای نرخ پاسخ بالاتر', '۲')
    );

    const studentNameOf = (s) => {
      const nm = [s.firstName ?? s.first_name, s.lastName ?? s.last_name].filter(Boolean).join(' ').trim();
      return nm || s.fullName || s.full_name || s.name || s.id;
    };

    const rowOf = (s) => {
      const cb = el('input', { type: 'checkbox', checked: checked.get(s.id), style: { width: '17px', height: '17px', accentColor: 'var(--brand)', flex: 'none' } });
      cb.addEventListener('change', () => { checked.set(s.id, cb.checked); syncFooter(); });
      return el('label', { dataset: { sid: s.id }, style: { display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' } },
        cb,
        el('span', { style: { flex: '1', minWidth: '0', fontSize: '13px' } }, studentNameOf(s))
      );
    };
    const paintStudentList = (q) => {
      const query = (q ?? '').trim();
      listWrap.replaceChildren(...students
        .filter((s) => !query || studentNameOf(s).includes(query))
        .map(rowOf));
    };
    searchStudent.addEventListener('input', () => paintStudentList(searchStudent.value));
    const syncFooter = () => {
      const n = [...checked.values()].filter(Boolean).length;
      footNote.textContent = n === 0 ? 'حداقل یک خانواده را انتخاب کنید' : `${fa(n)} خانواده انتخاب شده — هرکدام لینک امن ۷روزهٔ خودش را می‌گیرد.`;
      submitBtn.disabled = n === 0;
    };
    const submitBtn = el('button', { class: 'btn btn--primary', disabled: true, onclick: async () => {
      const ids = [...checked.entries()].filter(([, v]) => v).map(([k]) => k);
      submitBtn.disabled = true;
      try {
        const res = await api.post('/api/case-events/surveys', {
          student_ids: ids,
          therapist_id: therapistSel.value || null,
          kind
        });
        const createdN = res.data?.created?.length ?? 0;
        toast(`نظرسنجی «${kind === 'discharge' ? 'پایان دوره' : 'حین درمان'}» برای ${fa(createdN)} خانواده ساخته شد — لینک‌ها آمادهٔ کپی/ارسال‌اند`, 'success');
        shell.close();
        await refresh({ flashId: null });
      } catch (err) {
        toastError(err);
        submitBtn.disabled = false;
      }
    } }, icon('send', 15), 'ساخت و صدور لینک‌ها');

    const shell = openModal({
      title: 'نظرسنجی جدید از خانواده‌ها',
      wide: true,
      onClose: () => { if (listZone.isConnected && !listZone.querySelector('[data-id]')) paintList(); },
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
        el('div', { class: 'field' },
          el('label', { class: 'field__label' }, 'فرم نظرسنجی — ساخت‌یافتهٔ سیستمی'),
          kindRow
        ),
        el('div', { class: 'field' },
          el('label', { class: 'field__label' }, 'درمانگر مورد ارزیابی — اگر نظرسنجی دربارهٔ یک درمانگر خاص است انتخاب کنید'),
          therapistSel
        ),
        el('div', { class: 'field' },
          el('label', { class: 'field__label' }, `خانواده‌های هدف (${fa(students.length)} دانش‌آموز فعال) — هر خانواده یک نظرسنجی مستقل با لینک خودش می‌گیرد`),
          searchStudent, listWrap, footNote
        )
      ),
      actions: [(closeShell) => submitBtn], /* قرارداد openModal: هر اکشن تابعی است که close می‌گیرد و گره می‌دهد — ریشهٔ باگ «باز نمی‌شد» ۱.۲۵.۵۹ */
    });
    paintStudentList('');
    syncFooter();
  }

  zone.replaceChildren(summaryZone, chips, listZone);
  paintSummary();
  paintList();
  searchInput.addEventListener('input', () => paintList());

  if (openCreate) openCreateModal();
}

/* ═══ شِل ماژول: سربرگ + سه تب + مونت هر تب ═══ */
const local = { tab: 'board', days: 30 }; /* بین مراجعه‌های درون جلسه می‌ماند */

export async function renderFamilySurveys(container) {
  if (!isManager()) {
    container.replaceChildren(emptyState({
      iconName: 'shield',
      title: 'دسترسی مجاز نیست',
      hint: '«نظرسنجی خانواده‌ها» فقط از دسترسی مدیر فعال است — ساخت، ارسال و لغو نظرسنجی و دیدن پاسخ‌ها همه منحصر به مدیر مرکز است.'
    }));
    return;
  }

  const zone = el('div', {});

  function tabBtn(id, label, iconName) {
    return el('button', {
      class: `tab ${local.tab === id ? 'is-active' : ''}`,
      type: 'button', role: 'tab',
      'aria-selected': String(local.tab === id),
      dataset: { tab: id },
      onclick: () => { if (local.tab !== id) mount(id); }
    }, icon(iconName, 15), ' ', label);
  }

  const tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'بخش‌های نظرسنجی خانواده‌ها', style: { marginBottom: 'var(--sp-4)' } },
    tabBtn('board', 'تابلوی شاخص‌ها', 'dashboard'),
    tabBtn('surveys', 'نظرسنجی‌ها', 'clipboard'),
    tabBtn('voice', 'صدای خانواده', 'message')
  );

  const head = el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-head__title' }, 'نظرسنجی خانواده‌ها — تابلوی بازخورد و شاخص‌های مرکز'),
      el('div', { class: 'page-head__desc' },
        'دو فرم سیستم («پایان دوره» و «حین درمان») را خانواده‌ها پر می‌کنند؛ پاسخ‌ها این‌جا به شاخص تبدیل می‌شود: نمره با مقایسهٔ دورهٔ قبل، روند زمانی، مقایسهٔ دو فرم، کارنامهٔ درمانگران و صدای خانواده. پاسخ‌ها بی‌نام جمع می‌شوند و فقط متن پیشنهاد با نام خانواده می‌آید.' /* H2 — جملهٔ دیوار‌مانند به سه جملهٔ کوتاه شکسته شد؛ هیچ مفهومی حذف نشد */
      )
    ),
    el('button', { class: 'btn btn--primary', onclick: async () => { await mount('surveys', { openCreate: true }); } },
      icon('send', 16), 'نظرسنجی جدید')
  );

  function syncTabs() {
    for (const t of tabs.querySelectorAll('button.tab')) {
      const on = t.dataset.tab === local.tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    }
  }

  async function mount(tab, { openCreate = false } = {}) {
    local.tab = tab;
    syncTabs();
    try {
      if (tab === 'board') await renderBoard(zone);
      else if (tab === 'voice') await renderVoice(zone);
      else await renderSurveys(zone, { openCreate });
    } catch (err) {
      zone.replaceChildren(errorState(err, () => mount(tab)));
    }
  }

  container.replaceChildren(head, tabs, zone);
  syncTabs();
  await mount(local.tab);
}
