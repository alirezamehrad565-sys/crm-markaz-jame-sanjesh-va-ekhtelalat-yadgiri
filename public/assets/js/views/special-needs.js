import { api, qs } from '../api.js';
import { fa, STUDENT_GRADES, gradeLabel, tehranTimeOfIso } from '../format.js'; // ساعت تهران برای برچسب زمان محاسبه
import { el, icon, toast, openModal, statusBadge, dataTable, loadingState, skeletonState, emptyState, errorState } from '../ui.js';
import { session } from '../state.js';
import { SPECIAL_NEED_TYPE_LABELS, SPECIAL_NEED_SEVERITY_LABELS, SPECIAL_NEED_SEVERITY_TONES } from '../taxonomy.js'; /* ۱.۲۵.۰۲ */

/* ۱.۲۵.۰۲ — واژه‌نامهٔ نیاز ویژه از taxonomy.js (کپی محلی حذف شد — خطر واگرایی) */
const TYPE_LABELS = SPECIAL_NEED_TYPE_LABELS;
const SEVERITY_LABELS = SPECIAL_NEED_SEVERITY_LABELS;
const SEVERITY_TONES = SPECIAL_NEED_SEVERITY_TONES;

const REASON_LABELS = {
  overdue_followup: 'پیگیری سررسیدگذشته',
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

const state = { schoolId: '', grade: '', severity: '', metric: 'count' };

let snGen = 0; // F10: گارد نسل — پاسخ کهنهٔ فیلترهای سریع نباید جایگزین محتوا شود (الگوی reports/waitlist)

/* ۱.۲۵.۰۴ جریان پیوسته (زبان ۱.۲۵.۰۳ گزارش‌ها): شِل نما — سربرگ، فیلترها و چیپ‌های سنجه —
   یک‌بار مونت می‌شود و تغییر فیلتر فقط ناحیهٔ داده (data-zone) را با پالس نرم تازه می‌کند.
   سوییچ سنجهٔ heatmap کاملاً سمت کلاینت است (همان گرید، تجمیع دیگر) — بدون هیچ درخواستی، درجا.
   قبلاً هر فیلتر/سنجه کل نما را با اسکلت بازسازی می‌کرد: سلکت بسته می‌شد، فوکوس می‌پرید
   و فهرست مدارس هم با هر کلیک دوباره واکشی می‌شد. */
export async function renderSpecialNeeds(container) {
  const myGen = ++snGen;
  container.replaceChildren(skeletonState('table', 5)); // اسکلت فقط برای سوارشدن نما (ناوبری)

  let schools = [];
  try {
    const schoolsRes = await api.get('/api/schools?active=true');
    if (myGen !== snGen) return; // F10: پاسخ کهنه
    schools = schoolsRes.data ?? [];
  } catch { /* فهرست مدرسه نیامد — فیلتر مدرسه خالی می‌ماند؛ گرید مستقل است */ }

  const generatedAtBadge = el('span', { class: 'badge badge--neutral', title: 'زمان محاسبه' });

  const pageHead = el('div', { class: 'page-head' },
    el('div', { class: 'page-head__title' }, 'نیازهای ویژه'),
    generatedAtBadge
  );

  const select = (label, value, options, onchange) => {
    const sel = el('select', { class: 'input', onchange: (e) => onchange(e.target.value) },
      ...options.map((o) => el('option', { value: o.value, selected: o.value === value }, o.label))
    );
    return el('label', { class: 'sn-filter' }, el('span', { class: 'cell-sub' }, label), sel);
  };

  const metricGroup = el('div', { class: 'sn-metrics', role: 'group', 'aria-label': 'سنجهٔ heatmap' },
    ...METRICS.map((m) => el('button', {
      class: `chip${state.metric === m.key ? ' is-active' : ''}`,
      type: 'button',
      dataset: { metric: m.key },
      'aria-pressed': String(state.metric === m.key), /* S9-26 */
      onclick: () => setMetric(m.key)
    }, m.label))
  );

  function setMetric(key) {
    if (state.metric === key) return; // دوبارکلیک بی‌اثر
    state.metric = key;
    metricGroup.querySelectorAll('.chip').forEach((c) => {
      const on = c.dataset.metric === key;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-pressed', String(on));
    });
    repaintData(); // سوییچ سنجه هیچ درخواستی ندارد — از گرید کش‌شده تجمیع می‌شود
  }

  const toolbar = el('div', { class: 'toolbar' },
    select('مدرسه', state.schoolId, [
      { value: '', label: 'همه مدارس' },
      ...schools.map((s) => ({ value: s.id, label: s.name }))
    ], (v) => { state.schoolId = v; load(); }),
    select('پایه', state.grade, [
      { value: '', label: 'همه پایه‌ها' },
      ...STUDENT_GRADES.map((g) => ({ value: g, label: g }))
    ], (v) => { state.grade = v; load(); }),
    select('شدت', state.severity, [
      { value: '', label: 'همه شدت‌ها' },
      ...Object.entries(SEVERITY_LABELS).map(([v, l]) => ({ value: v, label: l }))
    ], (v) => { state.severity = v; load(); }),
    el('div', { class: 'spacer' }),
    metricGroup
  );

  const dataZone = el('div', { class: 'data-zone', style: { marginTop: 'var(--sp-4)' } });

  container.replaceChildren(pageHead, toolbar, dataZone);

  let grid = null; // گرید کش‌شده برای سوییچ بی‌درخواستِ سنجه

  async function load(parentGen = null) {
    const myGen = parentGen ?? ++snGen;
    dataZone.setAttribute('aria-busy', 'true');
    dataZone.classList.add('is-loading');
    let fresh;
    try {
      fresh = (await api.get(`/api/special-needs/grid${qs({
        school_id: state.schoolId || undefined,
        grade: state.grade || undefined,
        severity: state.severity || undefined
      })}`)).data;
    } catch (err) {
      if (myGen !== snGen || !dataZone.isConnected) return; // F10: پاسخ کهنه
      dataZone.classList.remove('is-loading');
      dataZone.removeAttribute('aria-busy');
      dataZone.replaceChildren(errorState(err, () => load()));
      return;
    }
    if (myGen !== snGen || !dataZone.isConnected) return; // F10: پاسخ کهنه — فیلتر جدیدتری در پرواز است
    dataZone.classList.remove('is-loading');
    dataZone.removeAttribute('aria-busy');
    grid = fresh;
    generatedAtBadge.textContent = grid.generatedAt
      ? `محاسبه: ${fa(tehranTimeOfIso(grid.generatedAt))}` /* S9-23: ساعت با پیشوند */
      : '';
    dataZone.replaceChildren(buildDataBody(grid));
  }

  function repaintData() {
    if (!grid || !dataZone.isConnected) return;
    dataZone.replaceChildren(buildDataBody(grid));
  }

  await load(myGen);
}

function buildDataBody(g) {
  const maxVal = maxCellMetric(g);
  const heatTable = buildHeatmap(g, maxVal);
  return el('div', {},
    buildKpis(g),
    el('div', { class: 'card' },
      el('div', { class: 'card__head' },
        el('div', { class: 'card__title' }, 'گرید مدرسه × پایه'),
        el('span', { class: 'cell-sub' }, metricHint(state.metric))
      ),
      el('div', { class: 'card__body card__body--flush', style: { overflowX: 'auto' } }, heatTable)
    ),
    buildAttentionCard(g.attention)
  );
}

function buildKpis(g) {
  const sev = g.overall.bySeverity ?? {};
  return el('div', { class: 'kpi-grid', style: { marginBottom: 'var(--sp-5)' } },
    kpi('شناسایی‌شده', fa(g.overall.special), `از ${fa(g.overall.total)} دانش‌آموز فعال`, 'primary'),
    kpi('نیازمند توجه', fa(g.overall.attention), 'بر اساس قواعد توجه', g.overall.attention > 0 ? 'warning' : 'neutral'),
    kpi('خفیف', fa(sev.mild ?? 0), 'شدت نیاز ویژه', 'neutral'),
    kpi('متوسط', fa(sev.moderate ?? 0), 'شدت نیاز ویژه', 'accent'),
    kpi('شدید', fa(sev.severe ?? 0), 'شدت نیاز ویژه', 'error')
  );
}

function kpi(label, value, hint, tone) {
  return el('div', { class: `kpi kpi--${tone}` }, // data-tone قاعدهٔ CSS نداشت؛ الگوی finance.js
    el('div', { class: 'kpi__value' }, value),
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
      // کنش اصلی نما فقط با ماوس بود؛ حالا کیبورد/صفحه‌خوان هم دارد
      return el('td', {
        class: `sn-cell ${intensityClass(v ?? 0, maxVal)}`,
        role: 'button',
        tabindex: '0',
        'aria-label': `${row.schoolName ?? 'بدون مدرسه'} — ${gradeLabel(g) || g}: ${v === null || v === undefined ? 'بدون مورد' : `${fa(v)} مورد`} — نمایش جزئیات`,
        onclick: () => cellDetail(row.schoolName, row.schoolId, g),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cellDetail(row.schoolName, row.schoolId, g); } }
      },
        v === null || v === undefined ? el('span', { class: 'cell-sub' }, '—') : state.metric === 'percent' ? `${fa(v)}٪` : fa(v), /* S9-22: ٪ برای حالت درصد */
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
      el('td', { class: 'sn-cell sn-cell--total' }, t === null || t === undefined ? '—' : state.metric === 'percent' ? `${fa(t)}٪` : fa(t)) /* S9-22 */
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
  if (!schoolId) { toast('مدرسه‌ای برای این سطر ثبت نشده است', 'warning'); return; } /* S9-24 */
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

function buildAttentionCard(attention) {
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
