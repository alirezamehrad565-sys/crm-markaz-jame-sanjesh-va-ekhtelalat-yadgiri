import { api, qs } from '../api.js';
import { fa, addDaysYmd, formatJalaliNumeric, iranianWeekdayOfYmd, tehranTodayYmd, toJalali, WEEKDAY_NAMES } from '../format.js';
import { el, icon, skeletonState, errorState, dataTable, emptyState, toast, kpi, KPI_ALERT_RATE, statusBadge } from '../ui.js'; /* ۱.۲۵.۰۵ — kpi/آستانه تک‌منبع · ۱.۲۵.۵۶ — statusBadge برای نقش همکار */
import { jalaliDateInput } from '../jalali-picker.js';
import { barChart, donut, hbars, deferredChart } from '../charts.js'; // E3 · countUp به ui.js رفت (۱.۲۵.۰۵)

const local = {
  from: null, // روز به شکل YYYY-MM-DD
  to: null,
  mode: 'periodic' // — 'periodic' | 'advanced'
};

function defaultRange() {
  const today = tehranTodayYmd();
  return { from: addDaysYmd(today, -29), to: today };
}

let renderGen = 0; // F9: گارد نسل — پاسخ کهنهٔ کلیک‌های سریع فیلتر/پریست نباید جایگزین محتوا شود (الگوی waitlist/progress-board)

/* ۱.۲۵.۰۳ جریان پیوسته (زبان ۱.۱۹–۱.۲۱): شِلِ نما — تب‌ها و نوار ابزار هر حالت — یک‌بار مونت می‌شود
   و تغییر بازه/پریست/به‌روزرسانی فقط ناحیهٔ داده (content) را تازه می‌کند.
   قبلاً هر تغییر تاریخ کل نما را با اسکلت بازسازی می‌کرد: پیکر جلالی بسته، فوکوس می‌پرید و
   نوار ابزار هم دوباره ساخته می‌شد. اکنون پیکرها/پریست‌ها سرجایشان می‌مانند و فقط
   KPIها و کارت‌ها با پالس نرم تعویض می‌شوند. تعویض تب همچنان اسکلت کامل دارد (ناوبری است). */
export async function renderReports(container) {
  ++renderGen;
  if (!local.from || !local.to) {
    const d = defaultRange();
    local.from = d.from;
    local.to = d.to;
  }

  const modeSeg = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'نوع گزارش', style: { marginBottom: 'var(--sp-4)' } }, /* S7-04 */
    el('button', { class: 'tab', type: 'button', role: 'tab', 'data-mode': 'periodic', onclick: () => switchMode('periodic') }, 'گزارش دوره'),
    el('button', { class: 'tab', type: 'button', role: 'tab', 'data-mode': 'advanced', onclick: () => switchMode('advanced') }, 'تحلیل پیشرفته'),
    el('button', { class: 'tab', type: 'button', role: 'tab', 'data-mode': 'attendance', onclick: () => switchMode('attendance') }, 'حضور و غیاب همکاران') /* ۱.۲۵.۵۶ — خواست کارفرما: تب CSV حضور همکاران */
  );
  function syncTabs() {
    modeSeg.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.mode === local.mode;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
  }

  const zone = el('div', {});
  container.replaceChildren(modeSeg, zone);

  async function switchMode(mode) {
    if (local.mode === mode && zone.querySelector('.report-content')) { syncTabs(); return; } // دوبارکلیک بی‌اثر
    local.mode = mode;
    syncTabs();
    await mountMode();
  }

  async function mountMode() {
    const myGen = ++renderGen;
    syncTabs();
    zone.replaceChildren(skeletonState('table', 6));
    /* نمای هر حالت، شِل خودش (سربرگ + نوار ابزار) را یک‌بار می‌سازد و load() فقط بدنه را پر می‌کند */
    const view = local.mode === 'advanced' ? buildAdvancedView(zone)
      : local.mode === 'attendance' ? buildAttendanceView(zone) /* ۱.۲۵.۵۶ */
      : buildView(zone);
    try {
      zone.replaceChildren(view.root);
      await view.load(myGen);
    } catch (err) {
      if (myGen !== renderGen || !zone.isConnected) return; // F9
      zone.replaceChildren(errorState(err, () => mountMode()));
    }
  }

  await mountMode();
}

/* ─── گزارش دوره (حالت پیش‌فرض) ─── */

function buildView(zone) {
  const content = el('div', { class: 'report-content' });

  const fromWidget = jalaliDateInput({ value: local.from, allowClear: false, onChange: applyRange });
  const toWidget = jalaliDateInput({ value: local.to, allowClear: false, onChange: applyRange });

  function applyRange() {
    const from = fromWidget.getYmd();
    const to = toWidget.getYmd();
    if (!from || !to) return;
    if (from > to) {
      // بازهٔ معکوس بی‌صدا نادیده گرفته نمی‌شود؛ پیام دارد
      toast('بازهٔ نامعتبر: «از تاریخ» بعد از «تا تاریخ» است', 'warning');
      return;
    }
    local.from = from;
    local.to = to;
    load();
  }

  const preset = (days, label) => el('button', {
    class: 'btn btn--ghost btn--sm',
    onclick: () => {
      const today = tehranTodayYmd();
      local.from = addDaysYmd(today, -(days - 1));
      local.to = today;
      // پیکرهای تاریخ با بازهٔ تازه همگام می‌مانند (فقط مقدار — شِل دست‌نخورده)
      fromWidget.setYmd?.(local.from);
      toWidget.setYmd?.(local.to);
      load();
    }
  }, label);

  /* ۱.۲۵.۱۰ — برچسب «از/تا» دیگر از پیکرش جدا نمی‌شود: هر تاریخ یک گروه چفت‌شده است
     و شکستن خط فقط «میان گروه‌ها» رخ می‌دهد (قبلاً در موبایل برچسبِ یتیم و جفت‌شدنِ
     برچسب با پیکرِ اشتباه می‌ساخت). */
  const bar = el('div', { class: 'toolbar rpt-toolbar print-hide' },
    el('div', { class: 'rpt-presets' },
      preset(7, '۷ روز'),
      preset(30, '۳۰ روز'),
      preset(90, '۹۰ روز')),
    el('div', { class: 'rpt-field' },
      el('span', { class: 'rpt-field__label' }, 'از'),
      fromWidget.root),
    el('div', { class: 'rpt-field' },
      el('span', { class: 'rpt-field__label' }, 'تا'),
      toWidget.root),
    el('div', { class: 'spacer' }),
    el('div', { class: 'rpt-actions' },
      el('button', { class: 'btn btn--soft btn--sm', onclick: () => load() }, icon('refresh', 16), 'به‌روزرسانی'),
      el('button', { class: 'btn btn--primary btn--sm', onclick: () => window.print() }, icon('printer', 16), 'چاپ گزارش'))
  );

  const root = el('div', {},
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'گزارش دوره'),
      el('span', { class: 'badge badge--neutral', dataset: { range: '1' } })
    ),
    bar,
    content
  );
  const rangeBadge = root.querySelector('[data-range="1"]');

  async function load(parentGen = null) {
    const myGen = parentGen ?? ++renderGen;
    content.setAttribute('aria-busy', 'true');
    content.classList.add('is-loading');
    let report;
    try {
      report = (await api.get(`/api/reports${qs({ from: local.from, to: local.to })}`)).data;
    } catch (err) {
      if (myGen !== renderGen || !content.isConnected) return; // F9: پاسخ کهنه
      content.classList.remove('is-loading');
      content.removeAttribute('aria-busy');
      content.replaceChildren(errorState(err, () => load()));
      return;
    }
    if (myGen !== renderGen || !content.isConnected) return; // F9: پاسخ کهنه — کلیک جدیدتری در پرواز است
    content.classList.remove('is-loading');
    content.removeAttribute('aria-busy');
    rangeBadge.textContent = `${WEEKDAY_NAMES[iranianWeekdayOfYmd(local.from)]} ${formatJalaliNumeric(local.from)} — ${formatJalaliNumeric(local.to)}`;
    content.replaceChildren(buildPeriodicBody(report));
  }

  return { root, load };
}

function buildPeriodicBody(r) {
  const pct = (v) => `${fa(Math.round((v ?? 0) * 100))}٪`;
  const ratePct = (rate, markedCount) => markedCount > 0 ? pct(rate) : '—';
  const fa1 = (v) => fa(Math.round((v ?? 0) * 10) / 10);
  /* ۱.۲۵.۱۰ — گرید سه‌ستونهٔ گزارش: ۹ شاخص = ۳×۳ و ۶ شاخص = ۳+۳ — سلول یتیم حذف */
  const kpiGrid = el('div', { class: 'kpi-grid kpi-grid--rpt', style: { marginBottom: 'var(--sp-5)' } },
    kpi('نوبت‌های بازه', r.appointments.total, `روزانه ${fa(r.appointments.avgPerDay)}`, 'primary'),
    kpi('مجموع ساعت جلسات', r.appointments.hours, 'جلسات برنامه‌ریزی‌شده', 'accent'),
    kpi('نرخ لغو', r.appointments.total > 0 ? pct(r.appointments.cancellationRate) : '—', `${fa(r.appointments.cancelled)} نوبت لغوشده`, r.appointments.cancellationRate >= KPI_ALERT_RATE ? 'error' : 'neutral'),
    kpi('نرخ غیبت دانش‌آموز', ratePct(r.attendance.absenceRate, r.attendance.present + (r.attendance.late ?? 0) + r.attendance.absent), `${fa(r.attendance.absent)} غیبت از ${fa(r.attendance.present + (r.attendance.late ?? 0) + r.attendance.absent)} جلسه`, (r.attendance.present + (r.attendance.late ?? 0) + r.attendance.absent) === 0 ? 'neutral' : r.attendance.absenceRate >= KPI_ALERT_RATE ? 'error' : 'success') /* S7-08 */,
    kpi('میانگین انتظار تا نوبت', r.waitSchedule.avgDays, r.waitSchedule.scheduled > 0 ? `${fa(r.waitSchedule.scheduled)} نوبت‌دهی از لیست انتظار` : 'نوبت‌دهی از لیست انتظار در این بازه ثبت نشده', 'primary', (v) => `${fa1(v)} روز`),
    kpi('میانگین جلسات هر دانش‌آموز', r.perStudent.avgSessions, r.perStudent.students > 0 ? `${fa(r.perStudent.sessions)} جلسه · ${fa(r.perStudent.students)} دانش‌آموز` : 'جلسه‌ای در این بازه ثبت نشده', 'accent', (v) => fa1(v)),
    kpi('نمرهٔ تولید محتوای تیم', r.practical.score, `تولید ${fa(r.practical.exercises)} کارت · ${fa(r.practical.templates)} قالب · ${fa(r.practical.forms)} فرم`, 'success'),
    kpi('دانش‌آموزان جدید', r.newStudents, 'ثبت‌نام در این بازه', 'primary'),
    kpi('حضور همکاران', ratePct(r.staffAttendance.attendanceRate, r.staffAttendance.present ?? 0), `${fa(r.staffAttendance.absent + r.staffAttendance.leave + r.staffAttendance.sick)} روز عدم حضور`, 'neutral')
  );

  const points = r.byDay.map((p) => ({ date: jalaliTick(p.date), total: p.total, cancelled: p.cancelled }));
  /* UX-ممیزی فاز ۳ (P1): SVG کل بازه تا ۱۰۲۰px در قاب ~۵۳۱px رندر می‌شد و نیمی از نمودار
     نامرئی بود. پیش‌فرض «۱۴ روز اخیر» (در قاب جا می‌شود)؛ نمای «کل بازه» با چیپ در دسترس می‌ماند. */
  const CHART_WINDOW = 14;
  let chartMode = points.length > CHART_WINDOW ? 'recent' : 'all';
  const chartMount = el('div', {});
  function drawTrend() {
    const shown = chartMode === 'recent' ? points.slice(-CHART_WINDOW) : points;
    chartMount.replaceChildren(deferredChart(() => barChart({ points: shown }), { reserveH: 170 })); /* E3: تعویق ساخت تا نزدیک دید */
  }
  drawTrend();
  let trendToggle = null;
  if (points.length > CHART_WINDOW) {
    trendToggle = el('div', { class: 'tl-filters', style: { marginBottom: 'var(--sp-3)' } },
      el('button', { class: 'chip is-active', type: 'button', 'data-mode': 'recent', onclick: () => { chartMode = 'recent'; syncTrendToggle(); drawTrend(); } }, '۱۴ روز اخیر'),
      el('button', { class: 'chip', type: 'button', 'data-mode': 'all', onclick: () => { chartMode = 'all'; syncTrendToggle(); drawTrend(); } }, `کل بازه (${fa(points.length)} روز)`));
    function syncTrendToggle() {
      trendToggle.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c.dataset.mode === chartMode));
    }
  }
  const trendCard = el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'روند روزانه نوبت‌ها'),
      el('span', { class: 'badge badge--neutral' }, chartMode === 'recent' && points.length > CHART_WINDOW
        ? '۱۴ روز اخیر از بازه'
        : `${formatJalaliNumeric(r.from)} تا ${formatJalaliNumeric(r.to)}`)
    ),
    el('div', { class: 'card__body' }, trendToggle, chartMount)
  );

  const attDonut = deferredChart(() => donut({
    segments: [
      { label: 'حاضر', value: r.attendance.present, tone: 'success' },
      { label: 'تأخیر', value: r.attendance.late ?? 0, tone: 'warning' }, //
      { label: 'غایب', value: r.attendance.absent, tone: 'error' },
      { label: 'در انتظار', value: r.attendance.pending, tone: 'info' }, /* C7: دیگر هم‌رنگ تأخیر نیست */
      { label: 'لغوشده', value: r.attendance.cancelled, tone: 'neutral' }
    ],
    centerLabel: 'حضور'
  }), { reserveH: 190 }); /* E3 */
  const donutCard = el('div', { class: 'card' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'وضعیت حضور دانش‌آموزان')),
    el('div', { class: 'card__body' }, attDonut)
  );

  const staffCard = el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'بار کاری همکاران'),
      el('span', { class: 'badge badge--neutral' }, 'تعداد جلسه در بازه')
    ),
    el('div', { class: 'card__body' },
      r.perStaff.length === 0
        ? emptyState({ iconName: 'users', title: 'نوبتی در این بازه ثبت نشده' })
        : deferredChart(() => hbars({
            items: r.perStaff.map((s) => ({
              label: s.staffName,
              value: s.sessions,
              hint: `${fa(s.hours)} ساعت · ${fa(s.cancelled)} لغوشده`,
              tone: 'accent'
            })),
            valueFormatter: (v) => fa(v)
          }), { reserveH: Math.max(1, r.perStaff.length) * 56 + 16 }) /* E3: ارتفاع تقریبی ردیف‌ها */
    )
  );

  const schoolsCard = el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'مدارس مبدأ دانش‌آموزان'),
      el('span', { class: 'badge badge--neutral' }, 'فقط مدارس دارای دانش‌آموز')
    ),
    el('div', { class: 'card__body' },
      r.schools.length === 0
        ? emptyState({ iconName: 'school', title: 'دانش‌آموزی با مدرسه ثبت‌شده نیست' })
        : dataTable({
            columns: [
              { key: 'name', label: 'مدرسه' },
              { key: 'students', label: 'دانش‌آموز', render: (s) => fa(s.students), align: 'end' }
            ],
            rows: r.schools
          })
    )
  );

  const topStudentsCard = el('div', { class: 'card' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'پرتکرارترین دانش‌آموزان')),
    el('div', { class: 'card__body' },
      r.topStudents.length === 0
        ? emptyState({ iconName: 'student', title: 'داده‌ای نیست' })
        : dataTable({
            columns: [
              { key: 'studentName', label: 'دانش‌آموز' },
              { key: 'sessions', label: 'جلسات', render: (s) => fa(s.sessions) },
              { key: 'absents', label: 'غیبت', render: (s) => s.absents > 0 ? el('span', { class: 'badge badge--error' }, fa(s.absents)) : fa(0) },
              /* ۱.۲۵.۱۰ — رکورد بی‌دانش‌آموز (دانش‌آموز حذف‌شده) دیگر دکمهٔ پروفایل مرده ندارد */
              { key: 'go', label: 'پروفایل', align: 'end', render: (s) => s.studentId
                ? el('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'پروفایل', 'aria-label': `پروفایل ${s.studentName ?? 'دانش‌آموز'}`, onclick: () => { location.hash = `#/students/${s.studentId}`; } }, icon('user', 15))
                : el('span', { class: 'cell-sub', title: 'دانش‌آموز این رکورد حذف شده است' }, '—') } /* S7-06 */
            ],
            rows: r.topStudents
          })
    )
  );

  const tagsCard = r.topTags.length > 0
    ? el('div', { class: 'card' },
        el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'برچسب‌های پرتکرار')),
        el('div', { class: 'card__body', style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' } }, /* 8px خام (S7-10) */
          r.topTags.map((t) => el('span', { class: 'badge badge--neutral', title: t.category }, `${t.name} · ${fa(t.count)}`))
        )
      )
    : null;

  /* ۱.۲۵.۵۶ — تلفیق «شاخص‌های مرکز» (۱.۲۵.۴۶) در گزارش دوره (خواست کارفرما): همان بلوک
     GET /api/kpi/summary با انتخابگر بازهٔ خودش، همراه کل گزارش چاپ می‌شود؛ نمای مستقل
     #/center-kpi از ناوبری و روتینگ حذف شد. درون‌ریزی پویا = چانک همان از قبل. */
  const centerKpiMount = el('div', {});
  void import('./center-kpi.js').then((m) => m.renderCenterKpi(centerKpiMount, { embedded: true })).catch(() => {});

  return el('div', {},
    kpiGrid,
    el('div', { class: 'report-grid' }, trendCard, donutCard),
    el('div', { class: 'report-grid' }, staffCard, schoolsCard),
    el('div', { class: 'report-grid' }, topStudentsCard, tagsCard),
    el('div', { class: 'card__head', style: { marginTop: 'var(--sp-5)' } },
      el('div', { class: 'card__title' }, icon('trendingUp', 16), 'شاخص‌های مرکز')),
    centerKpiMount,
    el('div', { class: 'print-footer', style: { marginTop: 'var(--sp-5)', color: 'var(--text-3)', fontSize: 'var(--fs-xs)' } },
      `تاریخ تهیه: ${formatJalaliNumeric(tehranTodayYmd())} — سامانه مرکز جامع`)
  );
}

function jalaliTick(ymd) {
  const [gy, gm, gd] = ymd.split('-').map(Number);
  const j = toJalali(gy, gm, gd);
  const pad = (n) => String(n).padStart(2, '0');
  return `${fa(pad(j.jd))} ${JALALI_MONTHS_SHORT[j.jm - 1] ?? ''}`;
}

const JALALI_MONTHS_SHORT = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

/* ─── تحلیل پیشرفته ─── */

function buildAdvancedView(zone) {
  const content = el('div', { class: 'report-content' });
  let currentAdv = null; // برای خروجی CSV — با هر load تازه می‌شود

  const pct = (v) => (v === null || v === undefined) ? '—' : `${fa(Math.round(v * 100))}٪`;
  const days = (v) => (v === null || v === undefined) ? '—' : `${fa(v)} روز`;

  const fromWidget = jalaliDateInput({ value: local.from, allowClear: false, onChange: applyRange });
  const toWidget = jalaliDateInput({ value: local.to, allowClear: false, onChange: applyRange });
  function applyRange() {
    const from = fromWidget.getYmd();
    const to = toWidget.getYmd();
    if (!from || !to) return;
    if (from > to) {
      toast('بازهٔ نامعتبر: «از تاریخ» بعد از «تا تاریخ» است', 'warning');
      return;
    }
    local.from = from;
    local.to = to;
    load();
  }
  const preset = (daysN, label) => el('button', {
    class: 'btn btn--ghost btn--sm',
    onclick: () => {
      const today = tehranTodayYmd();
      local.from = addDaysYmd(today, -(daysN - 1));
      local.to = today;
      fromWidget.setYmd?.(local.from);
      toWidget.setYmd?.(local.to);
      load();
    }
  }, label);

  const bar = el('div', { class: 'toolbar rpt-toolbar print-hide' },
    el('div', { class: 'rpt-presets' },
      preset(30, '۳۰ روز'),
      preset(90, '۹۰ روز'),
      preset(180, '۶ ماه')),
    el('div', { class: 'rpt-field' },
      el('span', { class: 'rpt-field__label' }, 'از'),
      fromWidget.root),
    el('div', { class: 'rpt-field' },
      el('span', { class: 'rpt-field__label' }, 'تا'),
      toWidget.root),
    el('div', { class: 'spacer' }),
    el('div', { class: 'rpt-actions' },
      el('button', { class: 'btn btn--soft btn--sm', onclick: () => currentAdv ? exportCsv(currentAdv) : null }, icon('download', 16), 'خروجی CSV'))
  );

  const root = el('div', {},
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'تحلیل پیشرفته'),
      el('span', { class: 'badge badge--neutral', dataset: { range: '1' } })
    ),
    bar,
    content
  );
  const rangeBadge = root.querySelector('[data-range="1"]');

  async function load(parentGen = null) {
    const myGen = parentGen ?? ++renderGen;
    content.setAttribute('aria-busy', 'true');
    content.classList.add('is-loading');
    let adv;
    try {
      adv = (await api.get(`/api/reports/advanced${qs({ from: local.from, to: local.to })}`)).data;
    } catch (err) {
      if (myGen !== renderGen || !content.isConnected) return; // F9
      content.classList.remove('is-loading');
      content.removeAttribute('aria-busy');
      content.replaceChildren(errorState(err, () => load()));
      return;
    }
    if (myGen !== renderGen || !content.isConnected) return; // F9
    content.classList.remove('is-loading');
    content.removeAttribute('aria-busy');
    currentAdv = adv;
    rangeBadge.textContent = `${formatJalaliNumeric(adv.from)} — ${formatJalaliNumeric(adv.to)}`;
    content.replaceChildren(buildAdvancedBody(adv, pct, days));
  }

  return { root, load };
}

function buildAdvancedBody(adv, pct, days) {
  const kpiGrid = el('div', { class: 'kpi-grid kpi-grid--rpt', style: { marginBottom: 'var(--sp-5)' } },
    kpi('پوشش گزارش پرونده', pct(adv.assessments.coverageRate), `${fa(adv.assessments.withAny)} از ${fa(adv.assessments.activeStudents)} پروندهٔ فعال`, 'primary'),
    kpi('پوشش گزارش جلسه', pct(adv.sessionNotes.coverageRate), `${fa(adv.sessionNotes.withNote)} از ${fa(adv.sessionNotes.sessions)} جلسه`, 'accent'),
    kpi('نرخ تبدیل لیست انتظار', pct(adv.waitlist.conversionRate), `${fa(adv.waitlist.admitted)} پذیرش · ${fa(adv.waitlist.open)} در صف`, 'neutral'),
    kpi('میانگین انتظار تا پذیرش', days(adv.waitlist.avgWaitDays), `${fa(adv.waitlist.total)} متقاضی کل`, 'primary'),
    kpi('پیگیری‌های معوق', fa(adv.followups.overdue), `${fa(adv.followups.open)} باز · تکمیل ${pct(adv.followups.completionRate)}`, adv.followups.overdue > 0 ? 'error' : 'success'),
    kpi('مصوبات کمیسیون', pct(adv.committee.approvalRate), `${fa(adv.committee.heldMeetings)} جلسهٔ برگزارشده`, 'accent')
  );

  const weeklyCard = el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'روند هفتگی جلسات'),
      el('span', { class: 'badge badge--neutral' }, `${formatJalaliNumeric(adv.from)} تا ${formatJalaliNumeric(adv.to)}`)
    ),
    el('div', { class: 'card__body' },
      deferredChart(() => barChart({
        points: adv.weeks.map((w) => ({
          date: jalaliTick(w.weekStart),
          total: w.sessions,
          cancelled: w.cancelled
        }))
      }), { reserveH: 170 }) /* E3 */,
      adv.weeks.length > 0
        ? el('p', { class: 'kpi__sub', style: { marginTop: 'var(--sp-2)' } }, 'هر ستون: جلسات هفته (شنبه‌محور) — بخش روشن: لغوشده')
        : null
    )
  );

  const funnelDonut = deferredChart(() => donut({
    segments: [
      { label: 'در صف', value: adv.waitlist.open, tone: 'warning' },
      { label: 'نوبت‌داده‌شده', value: adv.waitlist.scheduled, tone: 'primary' },
      { label: 'پذیرش‌شده', value: adv.waitlist.admitted, tone: 'success' },
      { label: 'ردشده', value: adv.waitlist.rejected, tone: 'error' },
      { label: 'عدم حضور', value: adv.waitlist.noShow, tone: 'accent' }, /* C7: از ردشده جداشد */
      { label: 'لغوشده', value: adv.waitlist.cancelled, tone: 'neutral' }
    ],
    centerLabel: 'لیست انتظار'
  }), { reserveH: 190 }); /* E3 */
  const funnelCard = el('div', { class: 'card' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'قیف لیست انتظار — کل تاریخ')),
    el('div', { class: 'card__body' },
      adv.waitlist.total === 0
        ? emptyState({ iconName: 'clock', title: 'متقاضی‌ای ثبت نشده' })
        : funnelDonut
    )
  );

  const weeksTable = dataTable({
    columns: [
      { label: 'هفته (شنبه)', render: (w) => formatJalaliNumeric(w.weekStart) },
      { label: 'جلسات', render: (w) => fa(w.sessions) },
      { label: 'برگزارشده', render: (w) => fa(w.completed) },
      { label: 'لغوشده', render: (w) => fa(w.cancelled) },
      { label: 'نرخ حضور', render: (w) => w.attendanceRate === null ? '—' : pct(w.attendanceRate) }
    ],
    rows: [...adv.weeks].reverse(),
    empty: emptyState({ iconName: 'calendar', title: 'هفته‌ای در این بازه نیست' })
  });
  const weeksCard = el('div', { class: 'card' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'جزئیات هفته‌ها')),
    el('div', { class: 'card__body' }, weeksTable.root ?? weeksTable)
  );

  return el('div', {},
    kpiGrid,
    el('div', { class: 'report-grid' }, weeklyCard, funnelCard),
    weeksCard
  );
}

function exportCsv(adv) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [];
  lines.push('# روند هفتگی');
  lines.push(['هفته (شنبه)', 'جلسات', 'برگزارشده', 'لغوشده', 'نرخ حضور'].map(esc).join(','));
  for (const w of adv.weeks) {
    lines.push([w.weekStart, w.sessions, w.completed, w.cancelled, w.attendanceRate ?? ''].map(esc).join(','));
  }
  lines.push('');
  lines.push('# قیف لیست انتظار');
  lines.push(['کل', 'در صف', 'نوبت‌داده‌شده', 'پذیرش‌شده', 'ردشده', 'عدم حضور', 'لغوشده', 'میانگین انتظار (روز)', 'نرخ تبدیل'].map(esc).join(','));
  lines.push([adv.waitlist.total, adv.waitlist.open, adv.waitlist.scheduled, adv.waitlist.admitted, adv.waitlist.rejected, adv.waitlist.noShow, adv.waitlist.cancelled, adv.waitlist.avgWaitDays ?? '', adv.waitlist.conversionRate ?? ''].map(esc).join(','));
  lines.push('');
  lines.push('# پوشش‌ها');
  lines.push(['پوشش گزارش پرونده', adv.assessments.withAny, adv.assessments.activeStudents, adv.assessments.coverageRate ?? ''].map(esc).join(','));
  lines.push(['پوشش گزارش جلسه', adv.sessionNotes.withNote, adv.sessionNotes.sessions, adv.sessionNotes.coverageRate ?? ''].map(esc).join(','));
  lines.push(['مصوبات کمیسیون', adv.committee.approved, adv.committee.itemsTotal, adv.committee.approvalRate ?? ''].map(esc).join(','));

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `advanced-report-${adv.from}_${adv.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('فایل CSV دانلود شد', 'success');
}

/* ─── حضور و غیاب همکاران (۱.۲۵.۵۶ — خواست کارفرما: تب CSV در گزارش دوره) ───
   منبع داده همان ماژول حضور همکاران است: GET /api/staff (همکاران فعال) +
   GET /api/staff-attendance?from&to (رکوردهای ثبت‌شده). خروجی CSV = دفتر روزبه‌روز
   (ردیف=همکار، ستون=روز بازه) + راهنما — هم‌سبک CSV تحلیل پیشرفته (BOM + سکشن #). */

const STAFF_ATT_LABEL = { present: 'حاضر', absent: 'غایب', late: 'تأخیر', leave: 'مرخصی', sick: 'بیماری' }; // هم‌واژگان working-day
const STAFF_ATT_SYM = { present: '✓', absent: 'غ', late: 'ت', leave: 'م', sick: 'ب' };
const STAFF_ATT_TONE = { present: 'success', absent: 'error', late: 'warning', leave: 'info', sick: 'accent' };
const STAFF_ROLE_FA = { manager: 'مدیر', therapist: 'درمانگر', secretary: 'منشی', supervisor: 'ناظر' }; // هم‌واژگان ui.BADGE_LABELS

function attCell(st) {
  if (!st) return el('span', { class: 'cell-sub', title: 'ثبت‌نشده' }, '—');
  return el('span', { class: `badge badge--${STAFF_ATT_TONE[st] ?? 'neutral'}`, title: STAFF_ATT_LABEL[st] ?? st }, STAFF_ATT_SYM[st] ?? '—');
}

function buildAttendanceModel(from, to, activeStaff, records) {
  const days = [];
  let cur = from;
  while (cur <= to && days.length < 400) { days.push(cur); cur = addDaysYmd(cur, 1); } /* سقف گارد: بیش از یک‌سال در یک دفتر معنا ندارد */
  const cell = new Map();
  for (const r of records) cell.set(`${r.staffId}|${r.date}`, r.status);
  const people = activeStaff.map((s) => {
    const counts = { present: 0, absent: 0, late: 0, leave: 0, sick: 0, unmarked: 0 };
    const marks = days.map((d) => {
      const st = cell.get(`${s.id}|${d}`);
      if (!st) { counts.unmarked++; return null; }
      counts[st] = (counts[st] ?? 0) + 1;
      return st;
    });
    return { id: s.id, name: s.fullName ?? '', role: s.role ?? '', marks, counts };
  });
  return { from, to, days, people };
}

function buildAttendanceView(zone) {
  const content = el('div', { class: 'report-content' });
  let currentAtt = null; // برای خروجی CSV — با هر load تازه می‌شود (الگوی تحلیل پیشرفته)

  const fromWidget = jalaliDateInput({ value: local.from, allowClear: false, onChange: applyRange });
  const toWidget = jalaliDateInput({ value: local.to, allowClear: false, onChange: applyRange });
  function applyRange() {
    const from = fromWidget.getYmd();
    const to = toWidget.getYmd();
    if (!from || !to) return;
    if (from > to) {
      toast('بازهٔ نامعتبر: «از تاریخ» بعد از «تا تاریخ» است', 'warning');
      return;
    }
    local.from = from;
    local.to = to;
    load();
  }
  const preset = (daysN, label) => el('button', {
    class: 'btn btn--ghost btn--sm',
    onclick: () => {
      const today = tehranTodayYmd();
      local.from = addDaysYmd(today, -(daysN - 1));
      local.to = today;
      fromWidget.setYmd?.(local.from);
      toWidget.setYmd?.(local.to);
      load();
    }
  }, label);

  const bar = el('div', { class: 'toolbar rpt-toolbar print-hide' },
    el('div', { class: 'rpt-presets' },
      preset(7, '۷ روز'),
      preset(30, '۳۰ روز'),
      preset(90, '۹۰ روز')),
    el('div', { class: 'rpt-field' },
      el('span', { class: 'rpt-field__label' }, 'از'),
      fromWidget.root),
    el('div', { class: 'rpt-field' },
      el('span', { class: 'rpt-field__label' }, 'تا'),
      toWidget.root),
    el('div', { class: 'spacer' }),
    el('div', { class: 'rpt-actions' },
      el('button', { class: 'btn btn--soft btn--sm', onclick: () => currentAtt ? exportAttendanceCsv(currentAtt) : null }, icon('download', 16), 'خروجی CSV'))
  );

  const root = el('div', {},
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'حضور و غیاب همکاران'),
      el('span', { class: 'badge badge--neutral', dataset: { range: '1' } })
    ),
    bar,
    content
  );
  const rangeBadge = root.querySelector('[data-range="1"]');

  async function load(parentGen = null) {
    const myGen = parentGen ?? ++renderGen;
    content.setAttribute('aria-busy', 'true');
    content.classList.add('is-loading');
    let model;
    try {
      const [staffRes, recRes] = await Promise.all([
        api.get('/api/staff'),
        api.get(`/api/staff-attendance${qs({ from: local.from, to: local.to })}`)
      ]);
      model = buildAttendanceModel(local.from, local.to, (staffRes.data ?? []).filter((s) => s.active), recRes.data ?? []);
    } catch (err) {
      if (myGen !== renderGen || !content.isConnected) return; // F9: پاسخ کهنه
      content.classList.remove('is-loading');
      content.removeAttribute('aria-busy');
      content.replaceChildren(errorState(err, () => load()));
      return;
    }
    if (myGen !== renderGen || !content.isConnected) return; // F9
    content.classList.remove('is-loading');
    content.removeAttribute('aria-busy');
    currentAtt = model;
    rangeBadge.textContent = `${WEEKDAY_NAMES[iranianWeekdayOfYmd(model.from)]} ${formatJalaliNumeric(model.from)} — ${formatJalaliNumeric(model.to)}`;
    content.replaceChildren(buildAttendanceBody(model));
  }

  return { root, load };
}

function buildAttendanceBody(model) {
  if (model.people.length === 0) {
    return emptyState({ iconName: 'users', title: 'همکار فعالی ثبت نشده است' });
  }
  const summaryTable = dataTable({
    columns: [
      { key: 'name', label: 'همکار' },
      { key: 'role', label: 'نقش', render: (p) => statusBadge(p.role) },
      { key: 'present', label: 'حاضر', render: (p) => fa(p.counts.present), align: 'end' },
      { key: 'late', label: 'تأخیر', render: (p) => fa(p.counts.late), align: 'end' },
      { key: 'absent', label: 'غایب', render: (p) => p.counts.absent > 0 ? el('span', { class: 'badge badge--error' }, fa(p.counts.absent)) : fa(0), align: 'end' },
      { key: 'leave', label: 'مرخصی', render: (p) => fa(p.counts.leave), align: 'end' },
      { key: 'sick', label: 'بیماری', render: (p) => fa(p.counts.sick), align: 'end' },
      { key: 'unmarked', label: 'ثبت‌نشده', render: (p) => fa(p.counts.unmarked), align: 'end' }
    ],
    rows: model.people
  });

  /* دفتر روزبه‌روز: ردیف = همکار، ستون = روز بازه — در قاب اسکرول افقی */
  const matrixTable = dataTable({
    columns: [
      { key: 'name', label: 'همکار', render: (p) => el('span', { style: { whiteSpace: 'nowrap' } }, p.name) },
      ...model.days.map((d, i) => ({
        key: `d${i}`,
        label: jalaliTick(d),
        render: (p) => attCell(p.marks[i])
      }))
    ],
    rows: model.people
  });

  return el('div', {},
    el('div', { class: 'card' },
      el('div', { class: 'card__head' },
        el('div', { class: 'card__title' }, 'خلاصهٔ هر همکار'),
        el('span', { class: 'badge badge--neutral' }, `${fa(model.days.length)} روز`)),
      el('div', { class: 'card__body' }, summaryTable)),
    el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } },
      el('div', { class: 'card__head' },
        el('div', { class: 'card__title' }, 'دفتر روزبه‌روز'),
        el('span', { class: 'badge badge--neutral' }, 'اسکرول افقی')),
      el('div', { class: 'card__body', style: { overflowX: 'auto' } }, matrixTable)),
    el('div', { class: 'wgrid__hint', style: { marginTop: 'var(--sp-3)' } },
      icon('info', 14),
      'راهنما: ✓ حاضر · ت تأخیر · غ غایب · م مرخصی · ب بیماری · — ثبت‌نشده. خروجی CSV همین دفتر روزبه‌روز را با سرستون تاریخ شمسی می‌دهد.'),
    el('div', { class: 'print-footer', style: { marginTop: 'var(--sp-5)', color: 'var(--text-3)', fontSize: 'var(--fs-xs)' } },
      `تاریخ تهیه: ${formatJalaliNumeric(tehranTodayYmd())} — سامانه مرکز جامع`)
  );
}

function exportAttendanceCsv(model) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [];
  lines.push(`# دفتر حضور و غیاب همکاران — از ${formatJalaliNumeric(model.from)} تا ${formatJalaliNumeric(model.to)}`);
  lines.push(['همکار', 'نقش', ...model.days.map((d) => jalaliTick(d)), 'حاضر', 'تأخیر', 'غایب', 'مرخصی', 'بیماری', 'ثبت‌نشده'].map(esc).join(','));
  for (const p of model.people) {
    lines.push([
      p.name,
      STAFF_ROLE_FA[p.role] ?? p.role,
      ...p.marks.map((st) => (st ? (STAFF_ATT_SYM[st] ?? st) : '—')),
      p.counts.present, p.counts.late, p.counts.absent, p.counts.leave, p.counts.sick, p.counts.unmarked
    ].map(esc).join(','));
  }
  lines.push('');
  lines.push('# راهنما: ✓ حاضر · ت تأخیر · غ غایب · م مرخصی · ب بیماری · — ثبت‌نشده');

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `staff-attendance-${model.from}_${model.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('فایل CSV دانلود شد', 'success');
}
