import { api, qs } from '../api.js';
import { fa, STUDENT_GRADES, gradeLabel } from '../format.js';
import { el, icon, openModal, statusBadge, dataTable, loadingState, skeletonState, emptyState, errorState } from '../ui.js';
import { session } from '../state.js';

const TYPE_LABELS = {
  dyslexia: 'نارساخوانی (دیس‌لکسی)',
  dysgraphia: 'نارسانویسی (دیس‌گرافی)',
  dyscalculia: 'نارساریاضی (دیس‌کالکولی)',
  adhd: 'بیش‌فعالی و کم‌توجهی',
  autism: 'طیف اتیسم',
  speech_language: 'اختلال زبانی و بیان',
  anxiety: 'اضطراب',
  motor_coordination: 'اختلال هماهنگی حرکتی',
  slow_learner: 'دیرآموز',
  other: 'سایر'
};

const SEVERITY_LABELS = { mild: 'خفیف', moderate: 'متوسط', severe: 'شدید' };
const SEVERITY_TONES = { mild: 'neutral', moderate: 'warning', severe: 'error' };

const REASON_LABELS = {
  overdue_followup: 'پیگیری سررسید گذشته',
  long_open_followup: 'پیگیری باز بیش از ۳۰ روز',
  awaiting_assessment: 'در انتظار ارزیابی',
  no_recent_session: 'بیش از ۳۰ روز جلسه ندارد'
};

const METRICS = [
  { key: 'count', label: 'تعداد' },
  { key: 'percent', label: 'درصد شناسایی' },
  { key: 'ratio', label: 'نسبت توجه' },
  { key: 'attention', label: 'نیازمند توجه' }
];

let state = { schoolId: '', grade: '', severity: '', metric: 'count' };

export async function renderSpecialNeeds(container) {
  container.replaceChildren(skeletonState('table', 5));

  let grid;
  let schools = [];
  try {
    const [gridRes, schoolsRes] = await Promise.all([
      api.get(`/api/special-needs/grid${qs({
        school_id: state.schoolId || undefined,
        grade: state.grade || undefined,
        severity: state.severity || undefined
      })}`),
      api.get('/api/schools?active=true').catch(() => ({ data: [] }))
    ]);
    grid = gridRes.data;
    schools = schoolsRes.data;
  } catch (err) {
    container.replaceChildren(errorState(err, () => renderSpecialNeeds(container)));
    return;
  }

  const canEdit = session.user && ['manager', 'secretary'].includes(session.user.role);

  const sev = grid.overall.bySeverity ?? {};
  const kpis = el('div', { class: 'kpi-grid', style: { marginBottom: 'var(--sp-5)' } },
    kpi('شناسایی‌شده', fa(grid.overall.special), `از ${fa(grid.overall.total)} دانش‌آموز فعال`, 'primary'),
    kpi('نیازمند توجه', fa(grid.overall.attention), 'بر اساس قواعد توجه', grid.overall.attention > 0 ? 'warning' : 'neutral'),
    kpi('خفیف', fa(sev.mild ?? 0), 'شدت نیاز ویژه', 'neutral'),
    kpi('متوسط', fa(sev.moderate ?? 0), 'شدت نیاز ویژه', 'accent'),
    kpi('شدید', fa(sev.severe ?? 0), 'شدت نیاز ویژه', 'error')
  );

  const select = (label, value, options, onchange) => {
    const sel = el('select', { class: 'input', onchange: (e) => onchange(e.target.value) },
      ...options.map((o) => el('option', { value: o.value, selected: o.value === value }, o.label))
    );
    return el('label', { class: 'sn-filter' }, el('span', { class: 'cell-sub' }, label), sel);
  };

  const toolbar = el('div', { class: 'toolbar' },
    select('مدرسه', state.schoolId, [
      { value: '', label: 'همه مدارس' },
      ...schools.map((s) => ({ value: s.id, label: s.name }))
    ], (v) => { state.schoolId = v; renderSpecialNeeds(container); }),
    select('پایه', state.grade, [
      { value: '', label: 'همه پایه‌ها' },
      ...STUDENT_GRADES.map((g) => ({ value: g, label: g }))
    ], (v) => { state.grade = v; renderSpecialNeeds(container); }),
    select('شدت', state.severity, [
      { value: '', label: 'همه شدت‌ها' },
      ...Object.entries(SEVERITY_LABELS).map(([v, l]) => ({ value: v, label: l }))
    ], (v) => { state.severity = v; renderSpecialNeeds(container); }),
    el('div', { class: 'spacer' }),
    el('div', { class: 'sn-metrics' },
      ...METRICS.map((m) => el('button', {
        class: `chip${state.metric === m.key ? ' is-active' : ''}`,
        onclick: () => { state.metric = m.key; renderSpecialNeeds(container); }
      }, m.label))
    )
  );

  const maxVal = maxCellMetric(grid);
  const heatTable = buildHeatmap(grid, maxVal);

  const attentionCard = buildAttentionCard(grid.attention, canEdit, container);

  container.replaceChildren(
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'نیازهای ویژه'),
      el('span', { class: 'badge badge--neutral', title: 'زمان محاسبه' }, fa((grid.generatedAt || '').slice(11, 16)))
    ),
    kpis,
    toolbar,
    el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } },
      el('div', { class: 'card__head' },
        el('div', { class: 'card__title' }, 'گرید مدرسه × پایه'),
        el('span', { class: 'cell-sub' }, metricHint(state.metric))
      ),
      el('div', { class: 'card__body card__body--flush', style: { overflowX: 'auto' } }, heatTable)
    ),
    attentionCard
  );
}

function kpi(label, value, hint, tone) {
  return el('div', { class: 'kpi' },
    el('div', { class: 'kpi__value', 'data-tone': tone }, value),
    el('div', { class: 'kpi__label' }, label),
    el('div', { class: 'kpi__hint' }, hint)
  );
}

function metricHint(metric) {
  return {
    count: 'عدد سلول = تعداد شناسایی‌شده (شدت رنگ نسبت به بیشینه)',
    percent: 'درصد شناسایی‌شده از کل دانش‌آموزان فعال همان سلول',
    ratio: 'توجه به‌ازای هر ۱۰ شناسایی‌شده (×۱۰)',
    attention: 'فقط شمارش نیازمندان توجه'
  }[metric] ?? '';
}

function cellMetricValue(cell, metric) {
  if (!cell) return null;
  switch (metric) {
    case 'percent': return cell.total === 0 ? null : Math.round((cell.special / cell.total) * 100);
    case 'ratio': return cell.special === 0 ? null : Math.round((cell.attention / cell.special) * 10);
    case 'attention': return cell.attention;
    default: return cell.special;
  }
}

function maxCellMetric(grid) {
  let max = 0;
  for (const row of grid.schools) {
    for (const cell of Object.values(row.cells)) {
      const v = cellMetricValue(cell, state.metric) ?? 0;
      if (v > max) max = v;
    }
    const t = cellMetricValue(row.totals, state.metric) ?? 0;
    if (t > max) max = t;
  }
  return max;
}

function intensityClass(value, max) {
  if (max <= 0 || value <= 0) return '';
  const level = Math.min(4, Math.max(1, Math.ceil((value / max) * 4)));
  return `sn-cell--${level}`;
}

function buildHeatmap(grid, maxVal) {
  const head = el('tr', {},
    el('th', {}, 'مدرسه'),
    ...grid.grades.map((g) => el('th', {}, gradeLabel(g) || g)),
    el('th', { class: 'sn-cell--total' }, 'جمع')
  );

  const bodyRows = grid.schools.map((row) => {
    const cells = grid.grades.map((g) => {
      const cell = row.cells[g];
      const v = cellMetricValue(cell, state.metric);
      return el('td', { class: `sn-cell ${intensityClass(v ?? 0, maxVal)}`, onclick: () => cellDetail(row.schoolName, row.schoolId, g) },
        v === null || v === undefined ? el('span', { class: 'cell-sub' }, '—') : fa(v),
        cell && cell.attention > 0 ? el('span', { class: 'sn-attention-dot', title: 'نیازمند توجه' } ) : null
      );
    });
    const t = cellMetricValue(row.totals, state.metric);
    return el('tr', {},
      el('th', { class: 'sn-row-head' },
        el('div', { class: 'cell-main' }, row.schoolName ?? 'بدون مدرسه'),
        row.kind ? statusBadge(row.kind) : null
      ),
      ...cells,
      el('td', { class: 'sn-cell sn-cell--total' }, t === null || t === undefined ? '—' : fa(t))
    );
  });

  if (grid.schools.length === 0) {
    return emptyState({
      iconName: 'clip',
      title: 'داده‌ای برای این فیلترها نیست',
      hint: 'نیاز ویژه از پروفایل هر دانش‌آموز توسط منشی/مدیر ثبت می‌شود.'
    });
  }

  return el('table', { class: 'sn-heatmap' },
    el('thead', {}, head),
    el('tbody', {}, ...bodyRows)
  );
}

function cellDetail(schoolName, schoolId, grade) {
  if (!schoolId) return;
  openModal({
    title: `${schoolName} — پایه «${gradeLabel(grade) || grade}»`,
    wide: true,
    body: (close) => {
      const listBox = el('div', { style: { minHeight: '120px' } }, loadingState('در حال بارگذاری دانش‌آموزان…'));
      loadStudents(listBox, schoolId, grade, close);
      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
        el('p', { style: { margin: 0, color: 'var(--text-2)', fontSize: 'var(--fs-sm)' } },
          'دانش‌آموزان فعال با نیاز ویژهٔ شناسایی‌شده. برای ثبت/ویرایش نیاز به پروفایل دانش‌آموز بروید.'),
        listBox
      );
    }
  });
}

async function loadStudents(listBox, schoolId, grade, close) {
  try {
    const res = await api.get(`/api/students${qs({ school_id: schoolId, active: 'true', page_size: 200 })}`);
    const students = (res.data || []).filter((s) => s.specialNeedType);
    const filtered = grade ? students.filter((s) => s.grade === grade) : students;
    if (filtered.length === 0) {
      listBox.replaceChildren(emptyState({ iconName: 'student', title: 'در این سلول دانش‌آموز ویژه‌ای نیست' }));
      return;
    }
    listBox.replaceChildren(
      dataTable({
        columns: [
          {
            key: 'name', label: 'دانش‌آموز',
            render: (s) => el('div', {},
              el('div', { class: 'cell-main' }, `${s.firstName} ${s.lastName}`),
              el('div', { class: 'cell-sub' }, `${s.className ? s.className + ' — ' : ''}پایه ${s.grade ? gradeLabel(s.grade) : '—'}`)
            )
          },
          { key: 'type', label: 'نیاز ویژه', render: (s) => el('span', { class: 'badge badge--primary' }, TYPE_LABELS[s.specialNeedType] ?? s.specialNeedType) },
          { key: 'sev', label: 'شدت', render: (s) => s.specialNeedSeverity ? el('span', { class: `badge badge--${SEVERITY_TONES[s.specialNeedSeverity] ?? 'neutral'}` }, SEVERITY_LABELS[s.specialNeedSeverity] ?? s.specialNeedSeverity) : el('span', { class: 'cell-sub' }, '—') },
          {
            key: 'actions', label: '', align: 'end',
            render: (s) => el('button', {
              class: 'btn btn--ghost btn--sm',
              onclick: () => { close(); location.hash = `#/students/${s.id}`; }
            }, icon('user', 15), 'پروفایل')
          }
        ],
        rows: filtered
      })
    );
  } catch (err) {
    listBox.replaceChildren(errorState(err, () => loadStudents(listBox, schoolId, grade, close)));
  }
}

function buildAttentionCard(attention, canEdit, container) {
  const list = attention.length === 0
    ? emptyState({
        iconName: 'check',
        title: 'کسی نیازمند توجه فوری نیست',
        hint: 'قواعد توجه: پیگیری سررسیدگذشته، پیگیری باز بیش از ۳۰ روز، در انتظار ارزیابی، بیش از ۳۰ روز بدون جلسه.'
      })
    : el('div', { class: 'sn-attention-list' },
        ...attention.map((a) => el('div', { class: 'sn-attention-item' },
          el('div', { style: { flex: 1, minWidth: 0 } },
            el('div', { class: 'cell-main' }, `${a.firstName} ${a.lastName}`),
            el('div', { class: 'cell-sub' },
              `${a.schoolName ?? 'بدون مدرسه'}${a.className ? ` — ${a.className}` : ''}${a.grade ? ` — پایه ${gradeLabel(a.grade)}` : ''}`
            ),
            el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } },
              a.specialNeedType ? el('span', { class: 'badge badge--primary' }, TYPE_LABELS[a.specialNeedType] ?? a.specialNeedType) : null,
              a.specialNeedSeverity ? el('span', { class: `badge badge--${SEVERITY_TONES[a.specialNeedSeverity] ?? 'neutral'}` }, SEVERITY_LABELS[a.specialNeedSeverity] ?? a.specialNeedSeverity) : null,
              ...a.reasons.map((r) => el('span', { class: 'badge badge--warning' }, REASON_LABELS[r] ?? r))
            )
          ),
          el('button', { class: 'btn btn--soft btn--sm', onclick: () => { location.hash = `#/students/${a.id}`; } },
            icon('user', 15), 'پروفایل')
        ))
      );

  return el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'نیاز به توجه دارد'),
      el('span', { class: `badge ${attention.length > 0 ? 'badge--warning' : 'badge--success'}` }, fa(attention.length))
    ),
    el('div', { class: 'card__body' }, list)
  );
}
