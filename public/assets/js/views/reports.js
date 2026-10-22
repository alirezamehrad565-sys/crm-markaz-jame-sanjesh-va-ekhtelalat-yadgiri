import { api, qs } from '../api.js';
import { fa, addDaysYmd, formatJalaliNumeric, iranianWeekdayOfYmd, tehranTodayYmd, toJalali, WEEKDAY_NAMES } from '../format.js';
import { el, icon, skeletonState, errorState, dataTable, emptyState, toast } from '../ui.js';
import { jalaliDateInput } from '../jalali-picker.js';
import { barChart, donut, hbars, countUp } from '../charts.js';

const local = {
  from: null, // YMD
  to: null,
  mode: 'periodic' // — 'periodic' | 'advanced'
};

function defaultRange() {
  const today = tehranTodayYmd();
  return { from: addDaysYmd(today, -29), to: today };
}

export async function renderReports(container) {
  if (!local.from || !local.to) {
    const d = defaultRange();
    local.from = d.from;
    local.to = d.to;
  }
  const modeSeg = el('div', { class: 'tabs', style: { marginBottom: 'var(--sp-4)' } },
    el('button', { class: `tab${local.mode === 'periodic' ? ' is-active' : ''}`, onclick: () => { local.mode = 'periodic'; renderReports(container); } }, 'گزارش دوره'),
    el('button', { class: `tab${local.mode === 'advanced' ? ' is-active' : ''}`, onclick: () => { local.mode = 'advanced'; renderReports(container); } }, 'تحلیل پیشرفته')
  );

  container.replaceChildren(modeSeg, skeletonState('table', 6));
  if (local.mode === 'advanced') {
    let adv;
    try {
      adv = (await api.get(`/api/reports/advanced${qs({ from: local.from, to: local.to })}`)).data;
    } catch (err) {
      container.replaceChildren(modeSeg, errorState(err, () => renderReports(container)));
      return;
    }
    container.replaceChildren(modeSeg, buildAdvancedView(adv, container));
    return;
  }

  let report;
  try {
    report = (await api.get(`/api/reports${qs({ from: local.from, to: local.to })}`)).data;
  } catch (err) {
    container.replaceChildren(modeSeg, errorState(err, () => renderReports(container)));
    return;
  }

  container.replaceChildren(modeSeg, buildView(report, container));
}

function buildView(r, container) {
  const fromWidget = jalaliDateInput({ value: r.from, allowClear: false, onChange: applyRange });
  const toWidget = jalaliDateInput({ value: r.to, allowClear: false, onChange: applyRange });

  function applyRange() {
    const from = fromWidget.getYmd();
    const to = toWidget.getYmd();
    if (!from || !to) return;
    if (from > to) return;
    local.from = from;
    local.to = to;
    renderReports(container);
  }

  const preset = (days, label) => el('button', {
    class: 'btn btn--ghost btn--sm',
    onclick: () => {
      const today = tehranTodayYmd();
      local.from = addDaysYmd(today, -(days - 1));
      local.to = today;
      renderReports(container);
    }
  }, label);

  const bar = el('div', { class: 'toolbar print-hide' },
    preset(7, '۷ روز'),
    preset(30, '۳۰ روز'),
    preset(90, '۹۰ روز'),
    el('span', { style: { marginInlineStart: 'var(--sp-2)', color: 'var(--text-3)', fontSize: 'var(--fs-sm)' } }, 'از'),
    fromWidget.root,
    el('span', { style: { color: 'var(--text-3)', fontSize: 'var(--fs-sm)' } }, 'تا'),
    toWidget.root,
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn--soft btn--sm', onclick: () => renderReports(container) }, icon('refresh', 16), 'به‌روزرسانی'),
    el('button', { class: 'btn btn--primary btn--sm', onclick: () => window.print() }, icon('printer', 16), 'چاپ گزارش')
  );

  const pct = (v) => `${fa(Math.round((v ?? 0) * 100))}٪`;
  const ratePct = (rate, markedCount) => markedCount > 0 ? pct(rate) : '—';
  const fa1 = (v) => fa(Math.round((v ?? 0) * 10) / 10);
  const kpiGrid = el('div', { class: 'kpi-grid', style: { marginBottom: 'var(--sp-5)' } },
    kpi('نوبت‌های بازه', r.appointments.total, `روزانه ${fa(r.appointments.avgPerDay)}`, 'primary'),
    kpi('مجموع ساعت جلسات', r.appointments.hours, 'جلسات برنامه‌ریزی‌شده', 'accent'),
    kpi('نرخ لغو', r.appointments.total > 0 ? pct(r.appointments.cancellationRate) : '—', `${fa(r.appointments.cancelled)} نوبت لغوشده`, r.appointments.cancellationRate >= 0.2 ? 'error' : 'neutral'),
    kpi('نرخ غیبت دانش‌آموز', ratePct(r.attendance.absenceRate, r.attendance.present + (r.attendance.late ?? 0) + r.attendance.absent), `${fa(r.attendance.absent)} غیبت از ${fa(r.attendance.present + (r.attendance.late ?? 0) + r.attendance.absent)} جلسه`, r.attendance.absenceRate >= 0.2 ? 'error' : 'success'),
    kpi('میانگین انتظار تا نوبت', r.waitSchedule.avgDays, r.waitSchedule.scheduled > 0 ? `${fa(r.waitSchedule.scheduled)} نوبت‌دهی از لیست انتظار` : 'نوبت‌دهی از لیست انتظار در این بازه ثبت نشده', 'primary', (v) => `${fa1(v)} روز`),
    kpi('میانگین جلسات هر دانش‌آموز', r.perStudent.avgSessions, r.perStudent.students > 0 ? `${fa(r.perStudent.sessions)} جلسه · ${fa(r.perStudent.students)} دانش‌آموز` : 'جلسه‌ای در این بازه ثبت نشده', 'accent', (v) => fa1(v)),
    kpi('نمرهٔ مشارکت عملی تیم', r.practical.score, `تولید ${fa(r.practical.exercises)} تمرین · ${fa(r.practical.templates)} قالب · ${fa(r.practical.forms)} فرم`, 'success'),
    kpi('دانش‌آموزان جدید', r.newStudents, 'ثبت‌نام در این بازه', 'primary'),
    kpi('حضور همکاران', ratePct(r.staffAttendance.attendanceRate, r.staffAttendance.present ?? 0), `${fa(r.staffAttendance.absent + r.staffAttendance.leave + r.staffAttendance.sick)} روز عدم حضور`, 'neutral')
  );

  const points = r.byDay.map((p) => ({ date: jalaliTick(p.date), total: p.total, cancelled: p.cancelled }));
  const trendCard = el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'روند روزانه نوبت‌ها'),
      el('span', { class: 'badge badge--neutral' }, `${formatJalaliNumeric(r.from)} تا ${formatJalaliNumeric(r.to)}`)
    ),
    el('div', { class: 'card__body' }, barChart({ points }))
  );

  const attDonut = donut({
    segments: [
      { label: 'حاضر', value: r.attendance.present, tone: 'success' },
      { label: 'تأخیر', value: r.attendance.late ?? 0, tone: 'warning' }, //
      { label: 'غایب', value: r.attendance.absent, tone: 'error' },
      { label: 'در انتظار', value: r.attendance.pending, tone: 'warning' },
      { label: 'لغوشده', value: r.attendance.cancelled, tone: 'neutral' }
    ],
    centerLabel: 'حضور'
  });
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
        : hbars({
            items: r.perStaff.map((s) => ({
              label: s.staffName,
              value: s.sessions,
              hint: `${fa(s.hours)} ساعت · ${fa(s.cancelled)} لغوشده`,
              tone: 'accent'
            })),
            valueFormatter: (v) => fa(v)
          })
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
              { key: 'go', label: '', align: 'end', render: (s) => el('button', { class: 'btn btn--ghost btn--sm', title: 'پروفایل', onclick: () => { location.hash = `#/students/${s.studentId}`; } }, icon('user', 15)) }
            ],
            rows: r.topStudents
          })
    )
  );

  const tagsCard = r.topTags.length > 0
    ? el('div', { class: 'card' },
        el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'برچسب‌های پرتکرار')),
        el('div', { class: 'card__body', style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
          r.topTags.map((t) => el('span', { class: 'badge badge--neutral', title: t.category }, `${t.name} · ${fa(t.count)}`))
        )
      )
    : null;

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'گزارش دوره'),
      el('span', { class: 'badge badge--neutral' }, `${WEEKDAY_NAMES[iranianWeekdayOfYmd(r.from)]} ${formatJalaliNumeric(r.from)} — ${formatJalaliNumeric(r.to)}`)
    ),
    bar,
    kpiGrid,
    el('div', { class: 'report-grid' }, trendCard, donutCard),
    el('div', { class: 'report-grid' }, staffCard, schoolsCard),
    el('div', { class: 'report-grid' }, topStudentsCard, tagsCard),
    el('div', { class: 'print-footer', style: { marginTop: 'var(--sp-5)', color: 'var(--text-3)', fontSize: 'var(--fs-xs)' } },
      `تاریخ تهیه: ${formatJalaliNumeric(tehranTodayYmd())} — سامانه مرکز جامع`)
  );
}

function kpi(label, value, sub, tone = 'primary', fmt) {
  if (value === null || value === undefined) {
    return el('div', { class: `kpi kpi--${tone}` },
      el('div', { class: 'kpi__label' }, label),
      el('div', { class: 'kpi__value' }, '—'),
      sub ? el('div', { class: 'kpi__sub' }, sub) : null
    );
  }
  const valueEl = el('div', { class: 'kpi__value' }, '۰');
  if (fmt) {
    valueEl.textContent = fmt(value);
  } else {
    countUp(valueEl, value, { formatter: (v) => fa(v) });
  }
  return el('div', { class: `kpi kpi--${tone}` },
    el('div', { class: 'kpi__label' }, label),
    valueEl,
    sub ? el('div', { class: 'kpi__sub' }, sub) : null
  );
}

function jalaliTick(ymd) {
  const [gy, gm, gd] = ymd.split('-').map(Number);
  const j = toJalali(gy, gm, gd);
  const pad = (n) => String(n).padStart(2, '0');
  return `${fa(pad(j.jd))} ${JALALI_MONTHS_SHORT[j.jm - 1] ?? ''}`;
}

const JALALI_MONTHS_SHORT = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

function buildAdvancedView(adv, container) {
  const pct = (v) => (v === null || v === undefined) ? '—' : `${fa(Math.round(v * 100))}٪`;
  const days = (v) => (v === null || v === undefined) ? '—' : `${fa(v)} روز`;

  const fromWidget = jalaliDateInput({ value: adv.from, allowClear: false, onChange: applyRange });
  const toWidget = jalaliDateInput({ value: adv.to, allowClear: false, onChange: applyRange });
  function applyRange() {
    const from = fromWidget.getYmd();
    const to = toWidget.getYmd();
    if (!from || !to || from > to) return;
    local.from = from;
    local.to = to;
    renderReports(container);
  }
  const preset = (daysN, label) => el('button', {
    class: 'btn btn--ghost btn--sm',
    onclick: () => {
      const today = tehranTodayYmd();
      local.from = addDaysYmd(today, -(daysN - 1));
      local.to = today;
      renderReports(container);
    }
  }, label);

  const bar = el('div', { class: 'toolbar print-hide' },
    preset(30, '۳۰ روز'),
    preset(90, '۹۰ روز'),
    preset(180, '۶ ماه'),
    el('span', { style: { marginInlineStart: 'var(--sp-2)', color: 'var(--text-3)', fontSize: 'var(--fs-sm)' } }, 'از'),
    fromWidget.root,
    el('span', { style: { color: 'var(--text-3)', fontSize: 'var(--fs-sm)' } }, 'تا'),
    toWidget.root,
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn--soft btn--sm', onclick: () => exportCsv(adv) }, icon('download', 16), 'خروجی CSV')
  );

  const kpiGrid = el('div', { class: 'kpi-grid', style: { marginBottom: 'var(--sp-5)' } },
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
      barChart({
        points: adv.weeks.map((w) => ({
          date: jalaliTick(w.weekStart),
          total: w.sessions,
          cancelled: w.cancelled
        }))
      }),
      adv.weeks.length > 0
        ? el('p', { class: 'kpi__sub', style: { marginTop: 'var(--sp-2)' } }, 'هر ستون: جلسات هفته (شنبه‌محور) — بخش روشن: لغوشده')
        : null
    )
  );

  const funnelDonut = donut({
    segments: [
      { label: 'در صف', value: adv.waitlist.open, tone: 'warning' },
      { label: 'نوبت‌داده‌شده', value: adv.waitlist.scheduled, tone: 'primary' },
      { label: 'پذیرش‌شده', value: adv.waitlist.admitted, tone: 'success' },
      { label: 'ردشده', value: adv.waitlist.rejected, tone: 'error' },
      { label: 'عدم حضور', value: adv.waitlist.noShow, tone: 'error' },
      { label: 'لغوشده', value: adv.waitlist.cancelled, tone: 'neutral' }
    ],
    centerLabel: 'لیست انتظار'
  });
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
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'تحلیل پیشرفته'),
      el('span', { class: 'badge badge--neutral' }, `${formatJalaliNumeric(adv.from)} — ${formatJalaliNumeric(adv.to)}`)
    ),
    bar,
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
