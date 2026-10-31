import { api, qs } from '../api.js';
import {
  addDaysYmd,
  durationLabel,
  fa,
  formatJalaliFull,
  formatJalaliShort,
  iranianWeekdayOfYmd,
  minuteToLabel,
  parseJalaliToYmd,
  relativeDayLabel,
  tehranDayRange,
  tehranTimeOfIso,
  tehranTodayYmd,
  tehranNowShifted, /* S2-07 */
  tehranYmdMinuteToIso,
  tehranYmdOfIso,
  timeToMinute,
  gridTimes,
  WEEKDAY_NAMES,
  gradeLabel
} from '../format.js';
import { el, icon, openModal, confirmModal, formModal, toast, toastError, statusBadge, emptyState, skeletonState } from '../ui.js';
import { hueClass, hueDot } from '../staff-hue.js'; // — رنگ ثابت هر درمانگر
import { sessionTypeOf, sessionTypeChip, sessionTypeOptions } from '../session-type.js'; // — نوع جلسه (جدول ۴)
import { openCaseEventForm, openCaseEventDetail, canCreateCaseEvents } from '../case-events.js';
import { session } from '../state.js';
import { fetchAllStudents } from '../student-fetch.js'; // حلقهٔ صفحه‌بندی مشترک (سقف خاموش ۱۰۰ حذف شد)

const DAY_START = 6 * 60;    // کف مطلق شبکه (فقط پشتیبان)
const DAY_END = 22 * 60;     // سقف مطلق — فقط اگر نوبت واقعی بیرون بزند باز می‌شود
const CELL_MINUTES = 30;     // هر سلول ۳۰ دقیقه
const PPM_WORK_WEEK = 1.9;   // — پیکسل بر دقیقه «داخل بازهٔ کاری» (هفتگی): کارت‌های بلندتر
const PPM_WORK_DAY = 2.6;    // نمای روزانه موبایل: ردیف‌های بلندتر برای لمس راحت‌تر
const PPM_OFF = 0.5;         // — ساعت‌های بیرون بازهٔ کاری فشرده می‌شوند
const WORK_CAP = 21 * 60;    // — شیفت عصر فعال شد: بازهٔ کاری مرکز تا ۲۱:۰۰ رندر می‌شود (قبلاً ۱۸:۰۰)
let WORK_PPM = PPM_WORK_WEEK; // در ابتدای هر رندر بر اساس حالت تنظیم می‌شود

let SCALE = null; // { start, end, workStart, workEnd, yOf(m), span(a, b), total }

function buildScale(visibleYmds, items) {
  const wdSet = new Set(visibleYmds.map((ymd) => iranianWeekdayOfYmd(ymd)));
  let wStart = Infinity, wEnd = -Infinity, hasHours = false;
  for (const r of state.centerHours ?? []) {
    if (!wdSet.has(r.weekday)) continue;
    hasHours = true;
    wStart = Math.min(wStart, r.startMinute);
    wEnd = Math.max(wEnd, r.endMinute);
  }
  if (!hasHours) { wStart = 8 * 60; wEnd = 18 * 60; }

  let dStart = Infinity, dEnd = -Infinity;
  for (const a of items) {
    dStart = Math.min(dStart, timeToMinute(tehranTimeOfIso(a.startAt)));
    dEnd = Math.max(dEnd, timeToMinute(tehranTimeOfIso(a.endAt)));
  }
  const hasData = Number.isFinite(dStart);

  const workStart = Math.min(wStart, hasData ? dStart : wStart);
  const workEnd = Math.max(Math.min(wEnd, WORK_CAP), hasData ? dEnd : 0);

  const start = Math.max(DAY_START, workStart - 30);
  const end = Math.min(DAY_END, Math.max(workEnd + 30, workStart + 60));

  const offBefore = () => (workStart - start) * PPM_OFF;
  const yOf = (m) => {
    if (m <= workStart) return (m - start) * PPM_OFF;
    if (m <= workEnd) return offBefore() + (m - workStart) * WORK_PPM;
    return offBefore() + (workEnd - workStart) * WORK_PPM + (m - workEnd) * PPM_OFF;
  };
  const span = (a, b) => yOf(Math.min(b, end)) - yOf(Math.max(a, start));
  return { start, end, workStart, workEnd, yOf, span, total: yOf(end) };
}
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240]; /* S2-06 */

const NEXT_ACTION_LABELS = { none: 'هیچ', follow_up: 'پیگیری', next_appointment: 'نوبت بعدی', contact: 'تماس با خانواده', referral: 'ارجاع' };

function canWriteSession(appt) {
  if (!session.user) return false;
  if (session.user.role === 'manager') return true;
  return session.user.role === 'therapist' && session.user.staffId === appt.staffId;
}

function canManage(appt) {
  if (!session.user) return false;
  const r = session.user.role;
  return r === 'manager' || r === 'secretary' || (r === 'therapist' && session.user.staffId === appt.staffId);
}

const state = {
  weekStart: null, // YMD شنبه
  viewMode: null,  // 'week' | 'day' — پیش‌فرض همیشه هفتگی (تصمیم کاربر)؛ نمای روزانه با سوییچ دستی
  dayYmd: null,    // روز انتخابی در نمای روزانه
  staffFilter: '',
  staffList: [],
  therapistList: [], // — فقط نقش درمانگر (ستون‌ها/انتخاب‌گرها)
  studentNames: new Map(),
  studentsAll: [], // — همه دانش‌آموزان فعال (همه صفحه‌ها) برای pickerها
  myStudents: [], // فاز ۵ — دانش‌آموزان همکار جاری (picker نقش درمانگر)
  lastBatchId: sessionStorage.getItem('cs.lastBatchId') || null, /* S2-09 */
  lastDuration: 45,
  centerHours: [] // [{weekday, startMinute, endMinute}]
};

function apptStatusClass(a) {
  if (a.status === 'cancelled') return ' is-cancelled';
  if (a.opsStatus === 'completed') return ' is-attended';
  if (a.opsStatus === 'no_show') return ' is-noshow';
  return '';
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function renderAppointments(container, ctx = {}) {
  if (ctx.query?.tab === 'waitlist') {
    location.replace('#/waitlist'); // — ماژول مستقل
    return;
  }

  if (!state.weekStart) state.weekStart = weekStartOf(tehranTodayYmd());
  if (!state.viewMode) state.viewMode = 'week'; // — پیش‌فرض هفتگی در همهٔ دستگاه‌ها (تصمیم کاربر)
  if (!state.dayYmd) state.dayYmd = tehranTodayYmd();
  const isTherapist = session.user?.role === 'therapist';
  if (isTherapist) state.staffFilter = session.user.staffId;
  WORK_PPM = state.viewMode === 'day' ? PPM_WORK_DAY : PPM_WORK_WEEK;
  state.weekStart = weekStartOf(state.viewMode === 'day' ? state.dayYmd : state.weekStart);

  container.replaceChildren(skeletonState('cards', 3));

  const [staffRes, studentsRes, centerRes, myStuRes] = await Promise.allSettled([
    api.get('/api/staff?active=true'),
    fetchAllStudents(),
    api.get('/api/settings/center-hours'),
    isTherapist ? api.get('/api/appointments/my-students') : Promise.resolve(null)
  ]);
  if (staffRes.status === 'fulfilled') state.staffList = staffRes.value.data;
  state.therapistList = state.staffList.filter((s) => s.role === 'therapist');
  if (studentsRes.status === 'fulfilled') {
    state.studentsAll = studentsRes.value;
    state.studentNames = new Map(studentsRes.value.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
  }
  if (centerRes.status === 'fulfilled') state.centerHours = centerRes.value.data;
  if (myStuRes.status === 'fulfilled' && myStuRes.value) {
    state.myStudents = myStuRes.value.data ?? [];
    for (const s of state.myStudents) state.studentNames.set(s.id, `${s.firstName} ${s.lastName}`);
  }

  const weekEnd = addDaysYmd(state.weekStart, 6);
  const range = { start: tehranDayRange(state.weekStart).start, end: tehranDayRange(weekEnd).end };
  let appointments = [];
  try {
    const res = await api.get(`/api/appointments${qs({ from: range.start, to: range.end, staff_id: state.staffFilter || undefined })}`);
    appointments = res.data;
  } catch (err) {
    container.replaceChildren(errorView(err));
    return;
  }

  const isDay = state.viewMode === 'day';
  const weekLabel = `${formatJalaliShort(state.weekStart)} تا ${formatJalaliShort(weekEnd)}`;

  const modeSeg = el('div', { class: 'seg mode-seg', role: 'group', 'aria-label': 'حالت تقویم' },
    el('button', { class: `seg__btn${!isDay ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(!isDay), onclick: () => setMode('week') }, 'هفته'), /* S2-02 */
    el('button', { class: `seg__btn${isDay ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(isDay), onclick: () => setMode('day') }, 'روز')
  );
  // فیلتر درمانگر نوار هفته: بیش از ۵ نفر به منوی کشویی می‌رود (همان الگوی تب دانش‌آموزان)؛
  // ردیف چیپ‌ها داخل فلکسِ week-bar با تعداد زیاد درمانگر چیدمان را می‌شکست
  function buildStaffDropdown() {
    const panel = el('div', { class: 'dd__panel', style: { display: 'none' } });
    const btn = el('button',
      { class: `btn btn--soft btn--sm${state.staffFilter ? ' is-active' : ''}`, type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', title: 'فیلتر درمانگر', onclick: toggle }, /* S2-02 */
      state.staffFilter ? hueDot(state.staffFilter) : null,
      el('span', {}, state.staffFilter ? staffName(state.staffFilter) : 'همه درمانگرها'),
      icon('chevL', 13)
    );
    const root = el('div', { class: 'dd' }, btn, panel);

    function drawPanel() {
      const items = [
        el('button', {
          class: `dd__item dd__all${state.staffFilter === '' ? ' is-on' : ''}`,
          onclick: () => pick('')
        }, 'همه درمانگرها')
      ];
      for (const s of state.therapistList) {
        const isOn = state.staffFilter === s.id;
        items.push(el('button', {
          class: `dd__item${isOn ? ' is-on' : ''}`,
          onclick: () => pick(isOn ? '' : s.id)
        }, hueDot(s.id), s.fullName));
      }
      panel.replaceChildren(...items);
    }

    function toggle() {
      const open = panel.style.display !== 'none';
      if (open) { panel.style.display = 'none'; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); } /* S2-02 */
      else { drawPanel(); panel.style.display = 'block'; btn.setAttribute('aria-expanded', 'true'); document.addEventListener('mousedown', outside, true); }
    }

    function outside(e) {
      if (!root.contains(e.target)) { panel.style.display = 'none'; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); }
    }

    function pick(id) {
      panel.style.display = 'none';
      document.removeEventListener('mousedown', outside, true);
      state.staffFilter = id;
      rerender(container);
    }

    return root;
  }

  const staffSelect = isTherapist
    ? el('span', { class: 'badge badge--neutral', style: { padding: '6px 10px' } }, `برنامهٔ من — ${staffName(session.user.staffId)}`)
    : state.therapistList.length > 5
      ? buildStaffDropdown()
      : el(
        'div',
        { class: 'staff-chips', role: 'group', 'aria-label': 'فیلتر درمانگر' },
        el(
          'button',
          { class: `staff-chip${state.staffFilter === '' ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(state.staffFilter === ''), onclick: () => { state.staffFilter = ''; rerender(container); } }, /* S2-02 */
          'همه'
        ),
        state.therapistList.map((s) =>
          el(
            'button',
            { class: `staff-chip ${hueClass(s.id)}${state.staffFilter === s.id ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(state.staffFilter === s.id), onclick: () => { state.staffFilter = s.id; rerender(container); } }, /* S2-02 */
            hueDot(s.id),
            s.fullName
          )
        )
      );
  // ناظر فقط-خواندن: دکمهٔ نوشتنی (نوبت جدید/کپی هفته) از نوار تقویم حذف می‌شود
  const isSupervisor = session.user?.role === 'supervisor';
  const newBtn = isSupervisor
    ? null
    : el('button', { class: 'btn btn--primary btn--sm', onclick: () => openCreateModal(container) }, icon('zap', 16), 'نوبت جدید');

  const bar = el('div', { class: 'week-bar' },
    modeSeg,
    ...(isDay ? [
      el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': 'روز قبل', onclick: () => { state.dayYmd = addDaysYmd(state.dayYmd, -1); rerender(container); } }, icon('chevR', 18)),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { state.dayYmd = tehranTodayYmd(); rerender(container); } }, 'امروز'),
      el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': 'روز بعد', onclick: () => { state.dayYmd = addDaysYmd(state.dayYmd, 1); rerender(container); } }, icon('chevL', 18)),
      el('div', { class: 'week-bar__title' }, formatJalaliFull(state.dayYmd))
    ] : [
      el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': 'هفته قبل', onclick: () => shiftWeek(-1) }, icon('chevR', 18)),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { state.weekStart = weekStartOf(tehranTodayYmd()); rerender(container); } }, 'این هفته'),
      el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': 'هفته بعد', onclick: () => shiftWeek(1) }, icon('chevL', 18)),
      el('div', { class: 'week-bar__title' }, weekLabel),
      el('div', { class: 'spacer' }),
      state.lastBatchId && !isSupervisor
        ? el('button', { class: 'btn btn--ghost btn--sm', onclick: undoLastCopy }, icon('undo', 16), 'برگردان آخرین کپی')
        : null,
      !isSupervisor
        ? el('button', { class: 'btn btn--ghost btn--sm', onclick: copyPrevWeek }, icon('copy', 16), 'کپی از هفته قبل')
        : null
    ]),
    isDay ? el('div', { class: 'spacer' }) : null,
    staffSelect,
    newBtn // برای ناظر null است
  );

  const today = tehranTodayYmd();
  const byDay = groupByDay(appointments);

  const visibleYmds = isDay
    ? [state.dayYmd]
    : Array.from({ length: 7 }, (_, i) => addDaysYmd(state.weekStart, i));
  SCALE = buildScale(visibleYmds, isDay ? (byDay.get(state.dayYmd) ?? []) : appointments);

  const gridInner = el('div', { class: 'grid-inner' });

  if (isDay) {
    const dayItems = byDay.get(state.dayYmd) ?? [];
    const dayStaff = state.staffFilter
      ? state.therapistList.filter((s) => s.id === state.staffFilter)
      : state.therapistList;
    const staffIds = new Set(dayStaff.map((s) => s.id));
    const leftovers = dayItems.filter((a) => !staffIds.has(a.staffId));

    const cols = [...dayStaff, ...(leftovers.length > 0 ? [{ id: '_other', fullName: 'سایر' }] : [])];
    gridInner.style.gridTemplateColumns = cols.length === 1
      ? '56px minmax(0, 1fr)'
      : `56px repeat(${cols.length}, minmax(170px, 1fr))`;

    const gutter = el('div', { style: { position: 'relative', height: `${SCALE.total}px`, gridRow: '2', gridColumn: '1' } });
    let lastLabelY = -100;
    for (let m = SCALE.start; m < SCALE.end; m += CELL_MINUTES) {
      if (m % 60 === 0) {
        const y = SCALE.yOf(m);
        if (y - lastLabelY >= 26) {
          gutter.appendChild(
            el('div', { class: 'gutter', style: { position: 'absolute', top: `${y}px`, insetInlineStart: '0', width: '52px' } }, fa(minuteToLabel(m)))
          );
          lastLabelY = y;
        }
      }
    }
    gridInner.appendChild(gutter);

    for (const s of cols) {
      const isOther = s.id === '_other';
      const items = isOther ? leftovers : dayItems.filter((a) => a.staffId === s.id);
      gridInner.appendChild(
        el('div', { class: 'grid-head grid-head--staff' },
          el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, isOther ? null : hueDot(s.id, 9), s.fullName),
          el('span', { class: 'grid-head__date' }, `${fa(items.length)} نوبت`)
        )
      );
    }
    gridInner.appendChild(el('div', { style: { height: '8px', gridRow: '1', gridColumn: '1' } }));
    for (const s of cols) {
      const isOther = s.id === '_other';
      const items = isOther ? leftovers : dayItems.filter((a) => a.staffId === s.id);
      gridInner.appendChild(buildDayColumn(state.dayYmd, items, state.dayYmd === today, { showStaffName: false }));
    }
  } else {
    gridInner.style.gridTemplateColumns = '';
    const days = Array.from({ length: 7 }, (_, i) => addDaysYmd(state.weekStart, i));

    const gutter = el('div', { style: { position: 'relative', height: `${SCALE.total}px`, gridRow: '2', gridColumn: '1' } });
    let lastLabelY = -100;
    for (let m = SCALE.start; m < SCALE.end; m += CELL_MINUTES) {
      if (m % 60 === 0) {
        const y = SCALE.yOf(m);
        if (y - lastLabelY >= 26) {
          gutter.appendChild(
            el('div', { class: 'gutter', style: { position: 'absolute', top: `${y}px`, insetInlineStart: '0', width: '52px' } }, fa(minuteToLabel(m)))
          );
          lastLabelY = y;
        }
      }
    }
    gridInner.appendChild(gutter);

    for (const ymd of days) {
      const isToday = ymd === today;
      const items = byDay.get(ymd) ?? [];

      gridInner.appendChild(
        el('div', { class: `grid-head${isToday ? ' is-today' : ''}` },
          WEEKDAY_NAMES[iranianWeekdayOfYmd(ymd)],
          el('span', { class: 'grid-head__date' },
            `${relativeDayLabel(ymd) ? relativeDayLabel(ymd) + ' · ' : ''}${formatJalaliShort(ymd)} · ${fa(items.length)} نوبت`)
        )
      );
    }
    gridInner.appendChild(el('div', { style: { height: '8px', gridRow: '1', gridColumn: '1' } }));
    for (const ymd of days) {
      gridInner.appendChild(buildDayColumn(ymd, byDay.get(ymd) ?? [], ymd === today, { showStaffName: true }));
    }
  }

  const visibleHues = new Set(appointments.filter((a) => !state.staffFilter).map((a) => a.staffId));
  const legend = !isTherapist && visibleHues.size > 1
    ? el(
        'div',
        { class: 'appt-legend' },
        el('span', { class: 'appt-legend__name' }, 'راهنمای رنگ:'),
        state.therapistList.filter((s) => visibleHues.has(s.id)).map((s) => el('span', { class: 'appt-legend__item' }, hueDot(s.id), s.fullName)),
        el('span', { class: 'appt-legend__item' }, icon('check', 12), 'برگزارشده'),
        el('span', { class: 'appt-legend__item' }, icon('grid', 11), 'لغوشده') /* S2-04 */,
        el('span', { class: 'appt-legend__item' }, icon('x', 12), 'نیامد')
      )
    : null;

  container.replaceChildren(
    ...[
      bar,
      legend,
      !isDay ? el('div', { class: 'swipe-hint is-week' }, icon('chevL', 14), 'برای دیدن روزهای دیگر بکشید — جابه‌جایی نوبت روی لمس از «ویرایش زمان» داخل جزئیات') : null,
      el('div', { class: 'grid-wrap' }, el('div', { class: 'grid-scroll' }, gridInner))
    ].filter(Boolean)
  );

  autoScrollToWorkingHours();

  function autoScrollToWorkingHours() {
    if (window.scrollY > 120) return; // بعد از عملیات‌های درون‌صفحه صفحه را نجاتک
    const weekday = iranianWeekdayOfYmd(isDay ? state.dayYmd : today);
    const ranges = state.centerHours.filter((r) => r.weekday === weekday);
    const startMin = ranges.length > 0 ? Math.min(...ranges.map((r) => r.startMinute)) : 8 * 60;
    const anchor = Math.max(SCALE.start, startMin - 30);
    const wrap = document.querySelector('.grid-wrap');
    if (!wrap) return;
    const top = wrap.getBoundingClientRect().top + window.scrollY + SCALE.yOf(anchor);
    window.scrollTo({ top: Math.max(0, top - 64) });
  }

  function shiftWeek(n) {
    state.weekStart = addDaysYmd(state.weekStart, n * 7);
    rerender(container);
  }

  function setMode(m) {
    if (state.viewMode === m) return;
    state.viewMode = m;
    if (m === 'day') {
      const todayYmd = tehranTodayYmd();
      const weekEndYmd = addDaysYmd(state.weekStart, 6);
      const dayInThisWeek = state.weekStart <= state.dayYmd && state.dayYmd <= weekEndYmd;
      if (!dayInThisWeek) {
        state.dayYmd = (state.weekStart <= todayYmd && todayYmd <= weekEndYmd) ? todayYmd : state.weekStart;
      }
    }
    rerender(container);
  }
}

function buildDayColumn(ymd, items, isToday, opts = {}) {
  const showStaffName = opts.showStaffName !== false;
  const col = el('div', { class: `grid-day${isToday ? ' is-today' : ''}` });

  for (const off of offRanges(ymd)) {
    col.appendChild(el('div', { class: 'grid-off', style: { top: `${off.top}px`, height: `${off.height}px` } }));
  }

  for (let m = SCALE.start; m < SCALE.end; m += CELL_MINUTES) {
    const cell = el('div', {
      class: `grid-cell${m % 60 === 0 ? ' is-hour' : ''}`,
      style: { height: `${SCALE.span(m, m + CELL_MINUTES)}px` },
      dataset: { minute: String(m), ymd }
      /* S2-01: سلول عمداً فوکوس‌پذیر نیست — صدها تاب‌استاپ می‌ساخت؛ ساخت نوبت با کیبورد از دکمهٔ «نوبت تازه» نوار ابزار و کارت‌های فوکوس‌پذیر می‌گذرد */
    });
    cell.addEventListener('click', () => openQuickCreate(ymd, m));
    cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drop-target'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('drop-target'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('drop-target');
      handleDrop(e, ymd, m, cell);
    });
    col.appendChild(cell);
  }

  for (const a of items) col.appendChild(apptOnGrid(a, ymd, { showStaffName }));

  if (isToday) {
    const nowMin = currentTehranMinute();
    if (nowMin >= SCALE.start && nowMin <= SCALE.end) {
      col.appendChild(el('div', { class: 'grid-now', style: { top: `${SCALE.yOf(nowMin)}px` } }));
    }
  }

  return col;
}

function offRanges(ymd) {
  const weekday = iranianWeekdayOfYmd(ymd);
  const ranges = state.centerHours.filter((r) => r.weekday === weekday);
  const out = [];
  let cursor = SCALE.start;
  const sorted = [...ranges].sort((a, b) => a.startMinute - b.startMinute);
  for (const r of sorted) {
    const s = Math.max(r.startMinute, SCALE.start);
    const e = Math.min(r.endMinute, SCALE.end);
    if (e <= s) continue;
    if (s > cursor) out.push({ top: SCALE.yOf(cursor), height: SCALE.span(cursor, s) });
    cursor = Math.max(cursor, e);
  }
  if (cursor < SCALE.end) out.push({ top: SCALE.yOf(cursor), height: SCALE.span(cursor, SCALE.end) });
  return out;
}

function currentTehranMinute() {
  const t = tehranNowShifted(); /* S2-07 */
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

const STU_ATT_LABEL = { present: 'حاضر', late: 'تأخیر', absent: 'غایب', pending: 'در انتظار', cancelled: 'لغو' };
const STU_ATT_ICON = { present: ['check', 'ok'], late: ['clock', 'late'], absent: ['x', 'err'] };

function apptOnGrid(a, ymd, opts = {}) {
  const showStaffName = opts.showStaffName !== false;
  const startMin = timeToMinute(tehranTimeOfIso(a.startAt));
  const endMin = timeToMinute(tehranTimeOfIso(a.endAt)) + (isoToYmd(a.endAt) !== isoToYmd(a.startAt) ? 1440 : 0);
  const top = Math.max(0, SCALE.yOf(Math.max(startMin, SCALE.start)));
  const height = Math.max(28, SCALE.span(startMin, endMin) - 3);

  const tall = height >= 56;
  const students = (a.students ?? []).map((s) => state.studentNames.get(s.studentId) ?? 'دانش‌آموز');

  const stType = sessionTypeOf(a.sessionType); // — نوع جلسه در title
  const titleLines = [
    `${fa(tehranTimeOfIso(a.startAt))} – ${fa(tehranTimeOfIso(a.endAt))}`,
    staffName(a.staffId),
    ...(stType ? [`نوع: ${stType.label}`] : []),
    ...((a.students ?? []).length > 0
      ? (a.students ?? []).map((s) => `${state.studentNames.get(s.studentId) ?? 'دانش‌آموز'} — ${STU_ATT_LABEL[s.attendance] ?? s.attendance ?? 'در انتظار'}`)
      : ['بدون دانش‌آموز'])
  ];

  const stuRows = (a.students ?? []).slice(0, 3).map((s) => {
    const name = state.studentNames.get(s.studentId) ?? 'دانش‌آموز';
    const ic = STU_ATT_ICON[s.attendance];
    return el('span', { class: 'grid-appt__stu' },
      ic ? el('span', { class: `stu-ic stu-ic--${ic[1]}`, title: `${name} — ${STU_ATT_LABEL[s.attendance] ?? ''}` }, icon(ic[0], 10)) : null,
      name
    );
  });
  if ((a.students ?? []).length > 3) {
    stuRows.push(el('span', { class: 'grid-appt__stu grid-appt__stu--more' }, `+${fa(a.students.length - 3)}`));
  }

  const card = el(
    'div',
    {
      class: `grid-appt${apptStatusClass(a)} ${hueClass(a.staffId)}`,
      style: { top: `${top}px`, height: `${height}px` },
      draggable: 'true',
      dataset: { id: a.id, version: String(a.version), ymd },
      title: titleLines.join('\n'),
      /* S2-01: کارت تقویم با کیبورد باز می‌شود */
      role: 'button',
      tabindex: '0',
      'aria-label': titleLines.join(' — ')
    },
    el('span', { class: 'grid-appt__time' },
      a.opsStatus === 'completed' && a.status !== 'cancelled' ? el('span', { class: 'appt-tick' }, icon('check', 10)) : null,
      a.note ? el('span', { class: 'grid-appt__noted', title: a.note }) : null,
      `${fa(tehranTimeOfIso(a.startAt))} – ${fa(tehranTimeOfIso(a.endAt))}`
    ),
    tall ? sessionTypeChip(a.sessionType) : null,
    tall && showStaffName ? el('span', { class: 'grid-appt__title' }, staffName(a.staffId)) : null,
    tall && stuRows.length > 0
      ? stuRows
      : el('span', { class: 'grid-appt__title' }, students.length > 0 ? students.join('، ') : 'بدون دانش‌آموز')
  );

  card.addEventListener('click', () => openDetailModal(a.id));
  card.addEventListener('keydown', (e) => { /* S2-01 */
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetailModal(a.id); }
  });
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: a.id, version: a.version, fromYmd: ymd }));
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('is-dragging'));

  return card;
}

/* A10: FLIP سه‌خطی vanilla — درگ نوبت قبلاً کل اوتلت را از صفر رندر می‌کرد و کارت «پرش» می‌زد.
   قبل از رندر جای کارت را می‌گیریم؛ بعد از رندر کارت جدید را از فاصلهٔ عمودی معکوس به جای خودش پرواز می‌دهیم. */
function flipMoveAppointment(id, rerenderFn) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const prev = document.querySelector(`.grid-appt[data-id="${CSS.escape(String(id))}"]`);
  const prevTop = prev?.getBoundingClientRect().top ?? null;
  rerenderFn();
  if (reduce || prevTop == null) return;
  requestAnimationFrame(() => {
    const next = document.querySelector(`.grid-appt[data-id="${CSS.escape(String(id))}"]`);
    if (!next) return;
    const dy = prevTop - next.getBoundingClientRect().top;
    if (Math.abs(dy) < 2) return;
    next.style.transition = 'none';
    next.style.transform = `translateY(${dy}px)`;
    requestAnimationFrame(() => {
      next.style.transition = 'transform var(--normal)';
      next.style.transform = '';
      next.addEventListener('transitionend', () => { next.style.transition = ''; }, { once: true });
    });
  });
}

async function handleDrop(e, targetYmd, cellMinute, cell) {
  let payload;
  try {
    payload = JSON.parse(e.dataTransfer.getData('text/plain'));
  } catch {
    return;
  }
  if (!payload?.id) return;

  const rect = cell.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  const inner = Math.floor(((offsetY / Math.max(rect.height, 1)) * CELL_MINUTES) / 15) * 15;
  const newMinute = Math.min(cellMinute + inner, 24 * 60 - 15);
  const snapped = Math.round(newMinute / 15) * 15;

  if (targetYmd === payload.fromYmd) {
    const newStartAt = tehranYmdMinuteToIso(targetYmd, snapped);
    try {
      const res = await api.patch(`/api/appointments/${payload.id}/move`, { start_at: newStartAt, version: payload.version });
      toast(`نوبت به ${fa(minuteToLabel(snapped))} جابه‌جا شد`, 'success');
      if (res.warnings?.length) toast(`${fa(res.warnings.length)} تداخل نرم — جابه‌جایی انجام شد`, 'warning', 6000);
      flipMoveAppointment(payload.id, () => rerender(document.getElementById('outlet'))); /* A10 */
    } catch (err) {
      toastError(err);
      rerender(document.getElementById('outlet'));
    }
  } else {
    let a;
    try {
      a = (await api.get(`/api/appointments${qs({ id: payload.id })}`)).data;
    } catch (err) {
      toastError(err);
      return;
    }
    openEditModal(a, Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000), {
      ymd: targetYmd,
      minute: snapped
    });
  }
}

function errorView(err) {
  return el('div', {},
    el('div', { class: 'week-bar' },
      el('button', { class: 'btn btn--primary btn--sm', onclick: () => location.reload() }, icon('refresh', 16), 'تلاش مجدد')
    ),
    emptyState({ iconName: 'alert', title: 'خطا در بارگذاری نوبت‌ها', hint: err.message })
  );
}

function rerender(container) {
  renderAppointments(container);
}

function weekStartOf(ymd) {
  return addDaysYmd(ymd, -iranianWeekdayOfYmd(ymd));
}

function groupByDay(appointments) {
  const map = new Map();
  for (const a of appointments) {
    const ymd = isoToYmd(a.startAt);
    if (!map.has(ymd)) map.set(ymd, []);
    map.get(ymd).push(a);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
  return map;
}

function isoToYmd(iso) {
  return tehranYmdOfIso(iso); /* S2-07: هلپر مشترک */
}

function staffName(id) {
  return state.staffList.find((s) => s.id === id)?.fullName ?? 'کارمند';
}

function openQuickCreate(ymd, minute) {
  openCreateModal(document.getElementById('outlet'), { ymd, minute });
}

function openCreateModal(container, preset = {}) {
  const picked = new Set();
  const isTher = session.user?.role === 'therapist';
  const allStudents = isTher ? state.myStudents : state.studentsAll;
  const defaultYmd = preset.ymd ?? (state.weekStart === weekStartOf(tehranTodayYmd()) ? tehranTodayYmd() : state.weekStart);
  const defaultMinute = preset.minute ?? (9 * 60);

  const searchInput = el('input', { class: 'input', placeholder: 'جستجوی نام دانش‌آموز…', 'aria-label': 'جستجوی نام دانش‌آموز' }); /* S2-10 */
  const listBox = el('div', { class: 'pick-list' });

  const drawList = () => {
    const q = searchInput.value.trim();
    const filtered = allStudents.filter((s) => !q || `${s.firstName} ${s.lastName}`.includes(q));
    listBox.replaceChildren(
      ...(filtered.length === 0
        ? [el('div', { style: { padding: '10px', color: 'var(--text-3)', fontSize: 'var(--fs-sm)' } }, isTher ? 'دانش‌آموزی در فهرست شما نیست — نوبت اول را منشی ثبت می‌کند' : 'دانش‌آموزی یافت نشد')]
        : filtered.map((s) =>
            el('label', { class: `pick-list__item${picked.has(s.id) ? ' is-picked' : ''}` },
              el('input', { type: 'checkbox', checked: picked.has(s.id), onchange: (e) => { e.target.checked ? picked.add(s.id) : picked.delete(s.id); drawList(); } }),
              el('span', {}, `${s.firstName} ${s.lastName}`),
              isTher && s.waitStatus === 'waiting' ? el('span', { class: 'badge badge--warning' }, 'منتظر') : null,
              el('span', { style: { marginInlineStart: 'auto', fontSize: 'var(--fs-xs)', color: 'var(--text-3)' } }, s.grade ? `پایه ${gradeLabel(s.grade)}` : '')
            )
          ))
    );
  };
  drawList();

  let durationValue = preset.duration ?? state.lastDuration;
  let chipBox = null;

  const sessionTypeField = () => document.querySelector('.modal select[name="session_type"]');
  const durationField = () => document.querySelector('.modal select[name="duration"]');

  formModal({
    title: 'نوبت جدید',
    wide: true,
    submitLabel: 'ثبت نوبت',
    fields: [
      { name: 'staff_id', label: 'درمانگر', type: 'select', required: true, placeholder: 'انتخاب کنید…', options: isTher ? [{ value: session.user.staffId, label: `${session.user.displayName} (خودم)` }] : state.therapistList.map((s) => ({ value: s.id, label: s.fullName })), value: isTher ? session.user.staffId : undefined },
      { name: 'date', label: 'تاریخ', type: 'jalali-date', required: true, value: defaultYmd },
      { name: 'start', label: 'ساعت شروع', type: 'select', required: true, options: gridTimes('06:00', '21:45').map((t) => ({ value: t, label: fa(t) })), value: minuteToLabel(defaultMinute) },
      { name: 'session_type', label: 'نوع جلسه', type: 'select', options: sessionTypeOptions(), value: preset.sessionType ?? '', hint: 'مدت پیش‌فرض هر نوع طبق جدول ۴ اساس‌نامه ست می‌شود — قابل تغییر' },
      { name: 'duration', label: 'مدت', type: 'select', required: true, options: [15, 30, 45, 60, 90, 120, 180, 240].map((m) => ({ value: String(m), label: durationLabel(m) })), value: String(durationValue) },
      { name: 'note', label: 'یادداشت (اختیاری)', type: 'textarea', span: 2 }
    ],
    onSubmit: async (values) => {
      const ymd = YMD_RE.test(values.date) ? values.date : parseJalaliToYmd(values.date);
      if (!ymd) throw new Error('تاریخ نامعتبر است — از تقویم انتخاب کنید');
      const startMinute = timeToMinute(values.start);
      const startAt = tehranYmdMinuteToIso(ymd, startMinute);
      const endAt = tehranYmdMinuteToIso(ymd, startMinute + Number(values.duration));
      state.lastDuration = Number(values.duration);
      const res = await api.post('/api/appointments', {
        staff_id: values.staff_id,
        start_at: startAt,
        end_at: endAt,
        session_type: values.session_type || null,
        students: [...picked].map((id) => ({ student_id: id })),
        note: values.note || undefined
      });
      toast(`نوبت ثبت شد${res.warnings?.length ? ' — با هشدار تداخل' : ''}`, res.warnings?.length ? 'warning' : 'success');
      if (res.warnings?.length) {
        toast(`${fa(res.warnings.length)} تداخل زمانی نرم شناسایی شد (نوبت ثبت ماند)`, 'warning', 6000);
      }
      rerender(container);
    }
  });

  setTimeout(() => {
    const form = document.querySelector('.modal .form-grid');
    if (!form) return;

    const durationSelect = durationField();
    if (durationSelect) {
      chipBox = el('div', { class: 'chip-row', style: { marginTop: '-10px', marginBottom: 'var(--sp-3)' } });
      const drawChips = () => {
        for (const chip of chipBox.querySelectorAll('.chip')) {
          chip.classList.toggle('is-active', Number(chip.dataset.d) === Number(durationSelect.value));
        }
      };
      for (const d of DURATIONS) {
        chipBox.appendChild(
          el('button', {
            type: 'button',
            class: `chip${Number(durationSelect.value) === d ? ' is-active' : ''}`,
            'aria-pressed': String(Number(durationSelect.value) === d), /* S2-02 */
            dataset: { d: String(d) },
            onclick: () => { durationSelect.value = String(d); drawChips(); }
          }, durationLabel(d))
        );
      }
      durationSelect.addEventListener('change', drawChips);
      durationSelect.closest('.field').insertAdjacentElement('afterend', chipBox);
    }

    const typeSelect = sessionTypeField();
    if (typeSelect && durationSelect) {
      typeSelect.addEventListener('change', () => {
        const t = sessionTypeOf(typeSelect.value);
        if (!t) return;
        durationSelect.value = String(t.durationMin);
        durationSelect.dispatchEvent(new Event('change'));
      });
    }

    const block = el('div', { class: 'field span-2' },
      el('label', { class: 'field__label' }, 'دانش‌آموزان (اختیاری)'),
      searchInput, listBox
    );
    searchInput.style.marginBottom = '8px';
    searchInput.addEventListener('input', drawList);
    form.appendChild(block);
  }, 50);
}

async function openDetailModal(appointmentId) {
  let a;
  try {
    a = (await api.get(`/api/appointments${qs({ id: appointmentId })}`)).data;
  } catch (err) {
    toastError(err);
    return;
  }

  const studentsBox = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });

  function sessionReportBlock(a, s) {
    const writable = canWriteSession(a) && a.status !== 'cancelled';

    if (writable) {
      const ta = el('textarea', {
        class: 'textarea',
        rows: 3,
        maxlength: 2000,
        placeholder: 'نتیجه و مشاهده‌های این جلسه برای همین دانش‌آموز… (فقط همکار نوبت و مدیر می‌بینند و می‌نویسند)',
        style: { width: '100%', resize: 'vertical', minHeight: '56px', fontSize: 'var(--fs-sm)' }
      });
      ta.value = s.sessionNote ?? '';

      const sel = el('select', { class: 'select', style: { width: 'auto', padding: '4px 8px', fontSize: 'var(--fs-xs)' } },
        ...Object.entries(NEXT_ACTION_LABELS).map(([v, label]) => el('option', { value: v }, label))
      );
      sel.value = s.nextAction ?? 'none';

      const saveBtn = el('button', {
        class: 'btn btn--primary btn--sm',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const res = await api.put(`/api/appointments/${a.id}/students/${s.studentId}/note`, {
              session_note: ta.value ?? '',
              next_action: sel.value
            });
            const saved = res.data ?? {};
            s.sessionNote = saved.sessionNote ?? null;
            s.nextAction = saved.nextAction ?? null;
            toast('گزارش جلسه ذخیره شد', 'success', 2200);
            renderStudents();
          } catch (err) {
            toastError(err);
            btn.disabled = false;
          }
        }
      }, icon('check', 14), 'ذخیره گزارش');

      return el('div', { class: 'sess-note' },
        el('div', { class: 'sess-note__head' }, icon('file', 13), 'یادداشت سریع (داخلی)',
          canCreateCaseEvents()
            ? el('button', {
                class: 'btn btn--primary btn--sm',
                style: { marginInlineStart: 'auto' },
                title: 'فرم رسمی گزارش جلسه — روی خط زمانی پرونده می‌نشیند و به این جلسه متصل می‌شود',
                onclick: async () => {
                  try {
                    const prof = await api.get(`/api/students/${s.studentId}`);
                    const lastType = [...apptEvents]
                      .filter((e) => e.status !== 'cancelled' && e.eventTypeId)
                      .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))[0]?.eventTypeId ?? null;
                    openCaseEventForm({
                      student: prof.data,
                      appointmentId: a.id,
                      defaultTypeId: lastType,
                      occurredYmd: tehranYmdOfIso(a.startAt),
                      onSaved: () => setTimeout(() => openDetailModal(a.id), 100)
                    });
                  } catch (err) { toastError(err); }
                }
              }, icon('edit', 14), 'گزارش جلسه')
            : null
        ),
        ta,
        el('div', { class: 'sess-note__actions' },
          el('span', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-3)' } }, 'اقدام بعدی:'),
          sel,
          el('span', { style: { flex: 1 } }),
          saveBtn
        )
      );
    }

    const hasNote = Boolean(s.sessionNote && s.sessionNote.trim());
    const hasAction = Boolean(s.nextAction && s.nextAction !== 'none');
    if (!hasNote && !hasAction) return null;
    return el('div', { class: 'sess-note sess-note--ro' },
      el('div', { class: 'sess-note__head' }, icon('file', 13), 'یادداشت سریع جلسه'),
      hasNote ? el('div', { class: 'sess-note__body' }, s.sessionNote) : null,
      hasAction
        ? el('div', {}, el('span', { class: 'badge badge--accent' }, `اقدام بعدی: ${NEXT_ACTION_LABELS[s.nextAction] ?? s.nextAction}`))
        : null
    );
  }

  let apptEvents = [];
  try {
    apptEvents = (await api.get(`/api/appointments/${a.id}/case-events`)).data ?? [];
  } catch { /* اختیاری */ }
  const eventsOf = (sid) => apptEvents.filter((e) => e.studentId === sid && e.status !== 'cancelled');
  const eventsBlock = (sid) => {
    const evs = eventsOf(sid);
    if (evs.length === 0) return null;
    return el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      evs.map((e) =>
        el('button', {
          class: 'chip is-active',
          title: 'نمایش جزئیات رویداد ثبت‌شده',
          onclick: () => openCaseEventDetail(e, { onChanged: () => openDetailModal(a.id) })
        }, el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, icon('clipboard', 13), `${e.typeTitle}${e.status === 'draft' ? ' (پیش‌نویس)' : ''}`))
      )
    );
  };

  const renderStudents = () => {
    studentsBox.replaceChildren(
      ...(a.students ?? []).map((s) =>
        el(
          'div',
          { class: 'pick-list__item', style: { border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch' } },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
            el('a', {
              href: `#/students/${s.studentId}`,
              class: 'cell-main',
              style: { fontSize: 'var(--fs-sm)', color: 'var(--text-1)', textDecoration: 'none' },
              title: 'مشاهده پروفایل دانش‌آموز',
              onclick: () => close() // مودال روی نمای جدید معنا ندارد
            }, state.studentNames.get(s.studentId) ?? s.studentId),
            el('span', { style: { marginInlineStart: 'auto' } },
              canManage(a) ? el('select', {
                class: 'select',
                style: { width: 'auto', padding: '4px 8px', fontSize: 'var(--fs-sm)' },
                'aria-label': `وضعیت حضور ${state.studentNames.get(s.studentId) ?? ''}`, /* S2-08 */
                onchange: async (e) => {
                  try {
                    await api.patch(`/api/attendance/${a.id}/${s.studentId}`, { status: e.target.value });
                    toast('وضعیت حضور ثبت شد', 'success');
                  } catch (err) {
                    toastError(err);
                  }
                }
              },
              el('option', { value: 'pending', selected: s.attendance === 'pending' }, 'در انتظار'),
              el('option', { value: 'present', selected: s.attendance === 'present' }, 'حاضر'),
              el('option', { value: 'late', selected: s.attendance === 'late' }, 'تأخیر'),
              el('option', { value: 'absent', selected: s.attendance === 'absent' }, 'غایب'),
              el('option', { value: 'cancelled', selected: s.attendance === 'cancelled' }, 'لغو حضور')
              )
              : el('span', { class: 'badge badge--neutral' }, { pending: 'در انتظار', present: 'حاضر', late: 'تأخیر', absent: 'غایب', cancelled: 'لغو حضور' }[s.attendance] ?? s.attendance)
            ),
            canManage(a) ? el('button', {
              class: 'range-chip__x', type: 'button', title: 'حذف از نوبت', 'aria-label': `حذف ${state.studentNames.get(s.studentId) ?? ''} از نوبت`, /* S4-05 خانواده */
              onclick: async () => {
                try {
                  await api.del(`/api/appointments/${a.id}/students/${s.studentId}`);
                  toast('دانش‌آموز از نوبت حذف شد', 'success');
                  close();
                  setTimeout(() => openDetailModal(a.id), 100);
                } catch (err) {
                  toastError(err);
                }
              }
            }, icon('x', 14)) : null
          ),
          eventsBlock(s.studentId),
          sessionReportBlock(a, s)
        )
      ),
      ...((a.students ?? []).length === 0
        ? [el('p', { style: { color: 'var(--text-3)', fontSize: 'var(--fs-sm)', margin: 0 } }, 'هنوز دانش‌آموزی به این نوبت اضافه نشده است.')]
        : [])
    );
  };
  renderStudents();

  const isTherapistHere = session.user?.role === 'therapist';
  const addPool = isTherapistHere ? state.myStudents : state.studentsAll;
  const addSearch = el('input', { class: 'input', placeholder: isTherapistHere ? 'جستجو در دانش‌آموزان من…' : 'جستجوی نام دانش‌آموز…', style: { marginBottom: '6px' } });
  const addList = el('div', { class: 'pick-list', style: { maxHeight: '160px' } });
  const drawAddList = () => {
    const existing = new Set((a.students ?? []).map((s) => s.studentId));
    const q = addSearch.value.trim();
    const filtered = addPool.filter((s) => !existing.has(s.id) && (!q || `${s.firstName} ${s.lastName}`.includes(q)));
    addList.replaceChildren(
      ...(filtered.length === 0
        ? [el('div', { style: { padding: '8px', color: 'var(--text-3)', fontSize: 'var(--fs-sm)' } }, q ? 'دانش‌آموزی یافت نشد' : (isTherapistHere ? 'دانش‌آموز دیگری در فهرست شما نیست' : 'همه دانش‌آموزان فعال در این نوبت هستند'))]
        : filtered.map((s) =>
            el('button', {
              type: 'button',
              class: 'pick-list__item',
              onclick: async () => {
                try {
                  await api.post(`/api/appointments/${a.id}/students`, { student_id: s.id });
                  toast('دانش‌آموز اضافه شد', 'success');
                  close();
                  setTimeout(() => openDetailModal(a.id), 100);
                } catch (err) {
                  toastError(err);
                }
              }
            }, `${s.firstName} ${s.lastName}`)
          ))
    );
  };
  addSearch.addEventListener('input', drawAddList);
  drawAddList();

  const durationMin = Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000);

  const { close } = openModal({
    title: `نوبت ${formatJalaliFull(isoToYmd(a.startAt))}`,
    wide: true,
    body: [
      el('div', { class: 'info-list' },
        row('ساعت', `${fa(tehranTimeOfIso(a.startAt))} تا ${fa(tehranTimeOfIso(a.endAt))} (${durationLabel(durationMin)})`),
        row('کارمند', staffName(a.staffId)),
        row('وضعیت', statusBadge(a.status)),
        sessionTypeChip(a.sessionType) ? row('نوع جلسه', sessionTypeChip(a.sessionType)) : null,
        a.note ? row('یادداشت', a.note) : null
      ),
      el('div', { class: 'field' },
        el('label', { class: 'field__label' }, 'دانش‌آموزان نوبت — نام = مشاهده پروفایل'),
        studentsBox,
        a.status === 'cancelled' ? null : (canManage(a) ? el('div', {}, addSearch, addList) : null)
      )
    ],
    actions: [
      a.status === 'cancelled'
        ? (canManage(a) ? (closeRoot) =>
            el('button', {
              class: 'btn btn--soft',
              onclick: async () => {
                if (!(await confirmModal({ title: 'برگرداندن نوبت', message: 'این نوبت دوباره به وضعیت «برنامه‌ریزی‌شده» برمی‌گردد و اعلان آن صف می‌شود. ادامه می‌دهید؟', confirmLabel: 'برگردان' }))) return;
                try {
                  await api.post(`/api/appointments/${a.id}/restore`, { version: a.version });
                  toast('نوبت دوباره برقرار شد', 'success');
                  closeRoot();
                  rerender(document.getElementById('outlet'));
                } catch (err) {
                  toastError(err);
                }
              }
            }, icon('undo', 16), 'برگرداندن نوبت') : null)
        : (canManage(a) ? (closeRoot) => el('button', { class: 'btn btn--soft', onclick: () => { closeRoot(); openEditModal(a, durationMin); } }, icon('edit', 16), 'ویرایش زمان') : null),
      a.status === 'scheduled' && canManage(a)
        ? (closeRoot) =>
            el('button', {
              class: 'btn btn--danger',
              onclick: async () => {
                if (!(await confirmModal({ title: 'لغو نوبت', message: 'این نوبت لغو خواهد شد. آیا مطمئن هستید؟', confirmLabel: 'لغو نوبت', danger: true }))) return;
                try {
                  await api.post(`/api/appointments/${a.id}/cancel`, { version: a.version });
                  toast('نوبت لغو شد (اعلان لغو صف شد)', 'success');
                  closeRoot();
                  rerender(document.getElementById('outlet'));
                } catch (err) {
                  toastError(err);
                }
              }
            }, icon('x', 16), 'لغو نوبت')
        : null,
      canManage(a)
        ? (closeRoot) =>
            el('button', {
              class: 'btn btn--danger',
              onclick: async () => {
                const ok = await confirmModal({
                  title: 'حذف کامل نوبت',
                  message: 'این نوبت به‌کلی از تقویم پاک می‌شود و دیگر در هیچ لیستی دیده نمی‌شود — برای ثبت‌های اشتباه یا تکراری. اگر جلسه واقعاً برگزار شده، حذف ممکن نیست (پیام سرور راهنمایی می‌کند). برگشت ندارد.',
                  confirmLabel: 'حذف کن',
                  danger: true
                });
                if (!ok) return;
                try {
                  await api.del(`/api/appointments/${a.id}`);
                  toast('نوبت حذف شد', 'success');
                  closeRoot();
                  rerender(document.getElementById('outlet'));
                } catch (err) {
                  toastError(err);
                }
              }
            }, icon('trash', 16), 'حذف نوبت')
        : null
    ].filter(Boolean)
  });
  void close;
}

function row(key, val) {
  return el('div', { class: 'info-list__row' }, el('span', { class: 'info-list__key' }, key), el('span', { class: 'info-list__val' }, val));
}

function openEditModal(a, currentDuration, preset = {}) {
  const ymd = preset.ymd ?? isoToYmd(a.startAt);
  const currentMinute = preset.minute ?? timeToMinute(tehranTimeOfIso(a.startAt));

  formModal({
    title: 'ویرایش زمان نوبت',
    submitLabel: 'ذخیره',
    fields: [
      { name: 'date', label: 'تاریخ جدید', type: 'jalali-date', required: true, value: ymd },
      { name: 'start', label: 'ساعت شروع', type: 'select', required: true, options: gridTimes('06:00', '21:45').map((t) => ({ value: t, label: fa(t) })), value: minuteToLabel(currentMinute) },
      {
        name: 'duration', label: 'مدت', type: 'select', required: true,
        options: [15, 30, 45, 60, 90, 120, 180, 240].map((m) => ({ value: String(m), label: durationLabel(m) })),
        value: String(currentDuration)
      }
    ],
    onSubmit: async (values) => {
      const newYmd = YMD_RE.test(values.date) ? values.date : parseJalaliToYmd(values.date);
      if (!newYmd) throw new Error('تاریخ نامعتبر است — از تقویم انتخاب کنید');
      const newStartMinute = timeToMinute(values.start);
      const newStartAt = tehranYmdMinuteToIso(newYmd, newStartMinute);
      const newDuration = Number(values.duration);
      const oldStartMinute = timeToMinute(tehranTimeOfIso(a.startAt));
      const oldYmd = isoToYmd(a.startAt);
      const oldDuration = Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000);

      let current = a;
      if (newYmd !== oldYmd || newStartMinute !== oldStartMinute) {
        const res = await api.patch(`/api/appointments/${a.id}/move`, { start_at: newStartAt, version: current.version });
        current = res.data;
        if (res.warnings?.length) toast(`${fa(res.warnings.length)} تداخل نرم — نوبت جابه‌جا شد`, 'warning', 6000);
      }
      if (newDuration !== oldDuration) {
        const res = await api.patch(`/api/appointments/${a.id}/resize`, {
          end_at: tehranYmdMinuteToIso(newYmd, newStartMinute + newDuration),
          version: current.version
        });
        if (res.warnings?.length) toast(`${fa(res.warnings.length)} تداخل نرم — مدت تغییر کرد`, 'warning', 6000);
      }
      toast('نوبت به‌روزرسانی شد', 'success');
      rerender(document.getElementById('outlet'));
    }
  });
}

async function copyPrevWeek() {
  const source = addDaysYmd(state.weekStart, -7);
  if (!(await confirmModal({
    title: 'کپی از هفته قبل',
    message: 'نوبت‌های هفته گذشته (با همان ساعت‌ها) در این هفته ساخته می‌شوند. ادامه می‌دهید؟',
    confirmLabel: 'کپی کن'
  }))) return;
  try {
    const res = await api.post('/api/appointments/copy-week', {
      source_monday: source,
      target_monday: state.weekStart,
      staff_id: state.staffFilter || undefined,
      dry_run: false
    });
    state.lastBatchId = res.data.batchId;
    try { sessionStorage.setItem('cs.lastBatchId', state.lastBatchId); } catch { /* خصوصی */ } /* S2-09 */
    toast(`${fa(res.data.copied)} نوبت کپی شد${res.data.conflicts?.length ? ` — ${fa(res.data.conflicts.length)} تداخل` : ''}`, res.data.conflicts?.length ? 'warning' : 'success', 6000);
    rerender(document.getElementById('outlet'));
  } catch (err) {
    toastError(err);
  }
}

async function undoLastCopy() {
  if (!state.lastBatchId) return;
  try {
    const res = await api.post(`/api/appointments/copy-week/${state.lastBatchId}/undo`);
    toast(`${fa(res.data.removed)} نوبت برگردانده شد`, 'success');
    state.lastBatchId = null;
    rerender(document.getElementById('outlet'));
  } catch (err) {
    toastError(err);
  }
}
