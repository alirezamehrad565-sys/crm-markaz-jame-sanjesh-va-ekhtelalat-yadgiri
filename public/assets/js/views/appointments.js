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
  WEEKDAY_ABBRS, /* ۱.۲۷.۰ — نوار روز پیجر موبایل */
  gradeLabel
} from '../format.js';
import { el, icon, openModal, confirmModal, formModal, toast, toastError, statusBadge, emptyState, skeletonState, lockBtn } from '../ui.js';
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

/* ۱.۲۷.۰ — آستانهٔ «پیجر روز» برای نمای هفته: گرید ۷ستونه به ۷×۱۱۲px + گاتر نیاز دارد؛
   زیر ۸۶۰px (یا لمسی ≤۱۰۲۴) هفته له می‌شود یا اسکرول افقی می‌گیرد — به‌جای آن روزبه‌روز سوییپ می‌شود */
function isMobileWeek() {
  const mq = (q) => window.matchMedia?.(q)?.matches ?? false;
  return mq('(max-width: 859px)') || (mq('(pointer: coarse)') && mq('(max-width: 1024px)'));
}

/* ۱.۲۷.۰ — عبور از آستانهٔ موبایل/دسکتاپ یا چرخش صفحه: بدنهٔ هفته دوباره رندر/تراز می‌شود
   (یک شنوندهٔ ماندگار در سطح ماژول؛ گارد اتصال باعث می‌شود نمونه‌های کهنه بی‌اثر شوند) */
let resizeTimer = null;
let lastMobileWeek = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!VIEW || !VIEW.container?.isConnected) return;
    const mw = isMobileWeek();
    if (state.viewMode !== 'week' || lastMobileWeek === null || lastMobileWeek === mw) {
      if (state.viewMode === 'week' && mw) VIEW.pagerRelayout?.();
      lastMobileWeek = mw;
      return;
    }
    lastMobileWeek = mw;
    VIEW.refreshGrid?.(); /* تبدیل گرید ↔ پیجر بدون اسکلت */
  }, 160);
});

/* ۱.۲۰.۰ — جریان پیوستهٔ تقویم (الگوی ۱.۱۹.۰ روز کاری): هیچ اکشنی دیگر کل نما را re-render نمی‌کند.
   بعد از هر mutation فقط همان کارت روی گرید زنده پچ می‌شود (upsertApptCard/removeApptCard) و
   ناوبری هفته/روز/فیلتر هم فقط بدنهٔ گرید را بی‌صدا تازه می‌کند (refreshGrid) — بدون اسکلت و پرش اسکرول. */
let VIEW = null; // دستگیره‌های نمای زندهٔ تقویم — در هر لحظه حداکثر یک نمونه
let gridSeq = 0; // گارد نسل: پاسخ کهنهٔ ناوبری سریع نباید روی گرید تازه بنشیند

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

/* ۱.۱۸.۰ — رنگ/تیک نوبت از حضور واقعی دانش‌آموزان می‌آید (سیستم وضعیت عملیاتی حذف شد):
   همهٔ حاضر/تأخیر = برگزارشده (is-attended)؛ همه غایب = برگزارنشده (is-noshow). */
function attStateOf(a) {
  if (a.status === 'cancelled') return 'cancelled';
  const rows = (a.students ?? []).filter((s) => s.attendance !== 'cancelled');
  if (rows.length === 0) return 'none';
  if (rows.every((s) => s.attendance === 'present' || s.attendance === 'late')) return 'completed';
  if (rows.every((s) => s.attendance === 'absent')) return 'no_show';
  return 'none';
}

function apptStatusClass(a) {
  if (a.status === 'cancelled') return ' is-cancelled';
  const st = attStateOf(a);
  if (st === 'completed') return ' is-attended';
  if (st === 'no_show') return ' is-noshow';
  return '';
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function renderAppointments(container, ctx = {}) {
  gridSeq++; /* F8: هر رندر تازه (مثلاً setMode → rerender) پاسخ در پروازِ refreshGrid نمونهٔ قبلی را کهنه می‌کند */
  if (ctx.query?.tab === 'waitlist') {
    location.replace('#/waitlist'); // — ماژول مستقل
    return;
  }

  if (!state.weekStart) state.weekStart = weekStartOf(tehranTodayYmd());
  if (!state.viewMode) {
    /* ۱.۲۷.۰ — تصمیم کاربر: پیش‌فرض در همهٔ دستگاه‌ها «هفته» است؛ انتخاب دستی تا پایان نشست حفظ می‌شود.
       موبایل هفته را به‌صورت «پیجر روز» می‌بیند (سوییپ چپ/راست، کارت‌های تمام-عرض) — نه هفت‌ستونِ له‌شده. */
    try { state.viewMode = sessionStorage.getItem('cs.apptViewMode') === 'day' ? 'day' : 'week'; }
    catch { state.viewMode = 'week'; }
  }
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
  /* ۱.۲۷.۰ — پیجر موبایل همسایه‌ها را دارد: پنجرهٔ واکشی ±۱ روز تا سوییپ از مرز هفته همان‌جا بنشیند */
  const padR = (state.viewMode === 'week' && isMobileWeek()) ? 1 : 0;
  const range = { start: tehranDayRange(addDaysYmd(state.weekStart, -padR)).start, end: tehranDayRange(addDaysYmd(weekEnd, padR)).end };
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
  let dayTitle = null;   // — ۱.۲۰.۰: برچسب زندهٔ روز (refreshGrid فقط متنش را عوض می‌کند)
  let weekTitle = null;  // — ۱.۲۰.۰: برچسب زندهٔ هفته
  let undoBtn = null;    // — ۱.۲۰.۰: دکمهٔ برگردان کپی (نمایانی با syncUndoBtn)
  let staffChipsRoot = null;     // — ۱.۲۰.۰: ریشهٔ چیپ‌های فیلتر برای همگام‌سازی in-place
  let staffDropdownSync = null;  // — ۱.۲۰.۰: همگام‌ساز دکمهٔ دراپ‌داون فیلتر
  function buildStaffDropdown() {
    const panel = el('div', { class: 'dd__panel', style: { display: 'none' } });
    const btn = el('button',
      { class: `btn btn--soft btn--sm${state.staffFilter ? ' is-active' : ''}`, type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', title: 'فیلتر درمانگر', onclick: toggle }, /* S2-02 */
      state.staffFilter ? hueDot(state.staffFilter) : null,
      el('span', {}, state.staffFilter ? staffName(state.staffFilter) : 'همه درمانگرها'),
      icon('chevL', 13)
    );
    const root = el('div', { class: 'dd' }, btn, panel);

    /* ۱.۲۰.۰ — همگام‌سازی in-place دکمهٔ فیلتر (جای rebuild کل نوار) */
    function syncDropdownBtn() {
      btn.classList.toggle('is-active', Boolean(state.staffFilter));
      btn.replaceChildren(
        state.staffFilter ? hueDot(state.staffFilter) : null,
        el('span', {}, state.staffFilter ? staffName(state.staffFilter) : 'همه درمانگرها'),
        icon('chevL', 13)
      );
    }
    staffDropdownSync = syncDropdownBtn;

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
      syncDropdownBtn();
      refreshGrid(); /* ۱.۲۰.۰ — فیلتر فقط گرید را تازه می‌کند؛ نوار و اسکرول سر جایش */
    }

    return root;
  }

  /* ۱.۲۰.۰ — همگام‌سازی in-place ظاهر فیلتر درمانگر بعد از تغییر state.staffFilter */
  function syncStaffFilterUi() {
    if (isTherapist) return;
    if (staffChipsRoot) {
      for (const chip of staffChipsRoot.querySelectorAll('.staff-chip')) {
        const on = (chip.dataset.staff ?? '') === state.staffFilter;
        chip.classList.toggle('is-active', on);
        chip.setAttribute('aria-pressed', String(on));
      }
    }
    staffDropdownSync?.();
  }

  const staffSelect = isTherapist
    ? el('span', { class: 'badge badge--neutral', style: { padding: '6px 10px' } }, `برنامهٔ من — ${staffName(session.user.staffId)}`)
    : state.therapistList.length > 5
      ? buildStaffDropdown()
      : (staffChipsRoot = el(
        'div',
        { class: 'staff-chips', role: 'group', 'aria-label': 'فیلتر درمانگر' },
        el(
          'button',
          { class: `staff-chip${state.staffFilter === '' ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(state.staffFilter === ''), dataset: { staff: '' }, onclick: () => { state.staffFilter = ''; syncStaffFilterUi(); refreshGrid(); } }, /* S2-02 · ۱.۲۰.۰ */
          'همه'
        ),
        state.therapistList.map((s) =>
          el(
            'button',
            { class: `staff-chip ${hueClass(s.id)}${state.staffFilter === s.id ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(state.staffFilter === s.id), dataset: { staff: s.id }, onclick: () => { state.staffFilter = s.id; syncStaffFilterUi(); refreshGrid(); } }, /* S2-02 · ۱.۲۰.۰ */
            hueDot(s.id),
            s.fullName
          )
        )
      ));
  // ناظر فقط-خواندن: دکمهٔ نوشتنی (نوبت جدید/کپی هفته) از نوار تقویم حذف می‌شود
  const isSupervisor = session.user?.role === 'supervisor';
  const newBtn = isSupervisor
    ? null
    : el('button', { class: 'btn btn--primary btn--sm', onclick: () => openCreateModal(container) }, icon('zap', 16), 'نوبت جدید');

  const bar = el('div', { class: 'week-bar' },
    modeSeg,
    ...(isDay ? [
      el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': 'روز قبل', onclick: () => { state.dayYmd = addDaysYmd(state.dayYmd, -1); refreshGrid(); } }, icon('chevR', 18)), /* ۱.۲۰.۰ */
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { state.dayYmd = tehranTodayYmd(); refreshGrid(); } }, 'امروز'), /* ۱.۲۰.۰ */
      el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': 'روز بعد', onclick: () => { state.dayYmd = addDaysYmd(state.dayYmd, 1); refreshGrid(); } }, icon('chevL', 18)), /* ۱.۲۰.۰ */
      dayTitle = el('div', { class: 'week-bar__title' }, formatJalaliFull(state.dayYmd))
    ] : [
      el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': 'هفته قبل', onclick: () => shiftWeek(-1) }, icon('chevR', 18)),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { state.weekStart = weekStartOf(tehranTodayYmd()); refreshGrid(); } }, 'این هفته'), /* ۱.۲۰.۰ */
      el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': 'هفته بعد', onclick: () => shiftWeek(1) }, icon('chevL', 18)),
      weekTitle = el('div', { class: 'week-bar__title' }, weekLabel),
      el('div', { class: 'spacer' }),
      undoBtn = el('button', { class: 'btn btn--ghost btn--sm', onclick: (e) => lockBtn(e.currentTarget, undoLastCopy) /* F7: قفل مشغولی — دوبارکلیک undo دوبار اجرا نمی‌کند */, style: state.lastBatchId && !isSupervisor ? null : { display: 'none' } }, icon('undo', 16), 'برگردان آخرین کپی'), /* ۱.۲۰.۰ — همیشه ساخته می‌شود؛ نمایانی با syncUndoBtn */
      !isSupervisor
        ? el('button', { class: 'btn btn--ghost btn--sm', onclick: (e) => lockBtn(e.currentTarget, copyPrevWeek) /* F7: قفل مشغولی — دوبارکلیک کپی دوبار اجرا نمی‌کند */ }, icon('copy', 16), 'کپی از هفته قبل')
        : null
    ]),
    isDay ? el('div', { class: 'spacer' }) : null,
    staffSelect,
    newBtn // برای ناظر null است
  );

  /* — ۱.۲۰.۰: گرید و راهنمای رنگ در ظرف‌های ماندگار ساخته می‌شوند؛
     refreshGrid فقط همین دو را بازسازی می‌کند (بدون اسکلت، بدون تغییر نوار و اسکرول). */
  const legendEl = el('div', {});
  const gridInner = el('div', { class: 'grid-inner' });

  VIEW = { container, legendEl, gridInner, countEls: new Map(), isDay, refreshGrid };

  container.replaceChildren(
    ...[
      bar,
      legendEl,
      !isDay ? el('div', { class: 'swipe-hint is-week' }, icon('chevL', 14), 'روز قبل/بعد را با کشیدن ببینید — جابه‌جایی نوبت از «ویرایش زمان» داخل جزئیات') : null,
      el('div', { class: 'grid-wrap' }, el('div', { class: 'grid-scroll' }, gridInner))
    ].filter(Boolean)
  );

  drawGrid(appointments);
  autoScrollToWorkingHours();

  function currentRange() {
    const anchor = state.viewMode === 'day' ? state.dayYmd : state.weekStart;
    const ws = weekStartOf(anchor);
    const we = addDaysYmd(ws, 6);
    /* ۱.۲۷.۰ — پنجرهٔ واکشی ±۱ روز در حالت پیجر (سوییپ از مرز هفته) */
    const pad = (state.viewMode === 'week' && isMobileWeek()) ? 1 : 0;
    return { ws, we, from: tehranDayRange(addDaysYmd(ws, -pad)).start, to: tehranDayRange(addDaysYmd(we, pad)).end };
  }

  /* — تازه‌سازی بی‌صدای گرید: ناوبری روز/هفته/فیلتر و عملیات‌های انبوه فقط همین را صدا می‌زنند
     (۱.۲۰.۰ — بدون اسکلت، بدون rebuild نوار، بدون پرش اسکرول) */
  async function refreshGrid() {
    const seq = ++gridSeq;
    const r = currentRange();
    let appts;
    try {
      appts = (await api.get(`/api/appointments${qs({ from: r.from, to: r.to, staff_id: state.staffFilter || undefined })}`)).data;
    } catch (err) {
      toastError(err);
      return;
    }
    if (seq !== gridSeq || VIEW?.container !== container || !container.isConnected) return; // پاسخ کهنه / نمای عوض‌شده
    if (state.viewMode === 'day') { if (dayTitle) dayTitle.textContent = formatJalaliFull(state.dayYmd); }
    else if (weekTitle) weekTitle.textContent = `${formatJalaliShort(r.ws)} تا ${formatJalaliShort(r.we)}`;
    syncUndoBtn();
    syncStaffFilterUi();
    drawGrid(appts);
  }

  function syncUndoBtn() {
    if (undoBtn) undoBtn.style.display = state.lastBatchId && !isSupervisor ? '' : 'none';
  }

  /* بازسازی فقط بدنهٔ گرید + راهنمای رنگ (۱.۲۰.۰) */
  function drawGrid(appts) {
    const isDayNow = state.viewMode === 'day';
    const usePager = !isDayNow && isMobileWeek(); /* ۱.۲۷.۰ — هفتهٔ موبایل = پیجر روز */
    lastMobileWeek = usePager;
    VIEW.isDay = isDayNow;
    VIEW.pagerRelayout = null;
    VIEW.countEls = new Map();
    const today = tehranTodayYmd();
    const byDay = groupByDay(appts);
    const weekEndYmd0 = addDaysYmd(state.weekStart, 6);

    const visibleYmds = isDayNow
      ? [state.dayYmd]
      : Array.from({ length: 7 }, (_, i) => addDaysYmd(state.weekStart, i));
    /* ۱.۲۷.۰ — مقیاس عمودی فقط از نوبت‌های همین هفته (در حالت پیجر، واکشی ±۱ روز هم دارد) */
    const weekItems = isDayNow ? appts : appts.filter((a) => { const y = isoToYmd(a.startAt); return y >= state.weekStart && y <= weekEndYmd0; });
    SCALE = buildScale(visibleYmds, isDayNow ? (byDay.get(state.dayYmd) ?? []) : weekItems);

    /* شمارندهٔ زندهٔ هر سرستون — پچ‌های درجا فقط متن همین span را عوض می‌کنند */
    const countEl = (key, text) => {
      const s = el('span', {}, text);
      VIEW.countEls.set(key, s);
      return s;
    };

    gridInner.replaceChildren();

    if (isDayNow) {
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
          el('span', { class: 'grid-head__date' }, countEl(`${state.dayYmd}|${s.id}`, `${fa(items.length)} نوبت`))
        )
      );
    }
    gridInner.appendChild(el('div', { style: { height: '8px', gridRow: '1', gridColumn: '1' } }));
    for (const s of cols) {
      const isOther = s.id === '_other';
      const items = isOther ? leftovers : dayItems.filter((a) => a.staffId === s.id);
      gridInner.appendChild(buildDayColumn(state.dayYmd, items, state.dayYmd === today, { showStaffName: false, staff: s.id }));
    }
  } else if (usePager) {
    drawMobileWeek(byDay); /* ۱.۲۷.۰ — پیجر روز موبایل */
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
            `${relativeDayLabel(ymd) ? relativeDayLabel(ymd) + ' · ' : ''}${formatJalaliShort(ymd)}`,
            countEl(ymd, ` · ${fa(items.length)} نوبت`))
        )
      );
    }
    gridInner.appendChild(el('div', { style: { height: '8px', gridRow: '1', gridColumn: '1' } }));
    for (const ymd of days) {
      gridInner.appendChild(buildDayColumn(ymd, byDay.get(ymd) ?? [], ymd === today, { showStaffName: true }));
    }
  }

  const visibleHues = new Set(weekItems.filter((a) => !state.staffFilter).map((a) => a.staffId));
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
  legendEl.replaceChildren(...(legend ? [legend] : []));
  }

  /* ۱.۲۷.۰ — نمای هفتهٔ موبایل: پیجر روز (تجربهٔ GCal/Outlook موبایل)
     • نوار روز: هفت دکمهٔ «حرف روز + شماره» — تاریخ فقط یک‌جا (رفع تکرار تاریخِ سربرگ)
     • بدنه: یک روز در هر صفحه با کارت‌های تمام-عرض پشته‌ای زمانی — هیچ موقعیت‌دهی درصدی و هیچ هم‌پوشانی
     • سوییپ راست = روز بعد، سوییپ چپ = روز قبل (آینهٔ RTL، هم‌جهت با فلش‌های نوار)؛ از مرز هفته هم می‌گذرد
       (واکشی ±۱ روز؛ روز مرزیِ بیرون از پنجره اسکلت می‌گیرد و با فرود روی آن داده تازه می‌آید) */
  function drawMobileWeek(byDay) {
    const today = tehranTodayYmd();
    const weekEndYmd2 = addDaysYmd(state.weekStart, 6);
    if (!(state.dayYmd >= state.weekStart && state.dayYmd <= weekEndYmd2)) {
      state.dayYmd = (today >= state.weekStart && today <= weekEndYmd2) ? today : state.weekStart;
    }
    const days7 = Array.from({ length: 7 }, (_, i) => addDaysYmd(state.weekStart, i));

    /* — نوار روز: هفت دکمه (حرف روز + شمارهٔ روز در همان دکمه + شمارندهٔ کوچک) */
    const strip = el('div', { class: 'cal-strip', role: 'tablist', 'aria-label': 'روزهای هفته' });
    const stripBtns = new Map();
    for (const ymd of days7) {
      const wd = iranianWeekdayOfYmd(ymd);
      const n = (byDay.get(ymd) ?? []).length;
      const btn = el('button', {
        class: `cal-strip__day${ymd === today ? ' is-today' : ''}`,
        type: 'button', role: 'tab',
        'aria-label': `${WEEKDAY_NAMES[wd]} ${formatJalaliShort(ymd)} — ${fa(n)} نوبت`,
        dataset: { ymd },
        onclick: () => goToDate(ymd)
      },
        el('span', { class: 'cal-strip__wd' }, WEEKDAY_ABBRS[wd]),
        el('span', { class: 'cal-strip__num' }, formatJalaliShort(ymd).split(' ')[0]),
        n > 0 ? el('span', { class: 'cal-strip__n' }, fa(n)) : null
      );
      stripBtns.set(ymd, btn);
      strip.appendChild(btn);
    }

    const pager = el('div', { class: 'cal-pager' });
    const track = el('div', { class: 'cal-track' });
    pager.appendChild(track);
    gridInner.style.gridTemplateColumns = '';
    gridInner.classList.add('is-pager');
    gridInner.replaceChildren(strip, pager);

    const known = (ymd) => byDay.has(ymd) || (ymd >= state.weekStart && ymd <= weekEndYmd2);

    function pageFor(ymd) {
      const page = el('div', { class: 'cal-page', dataset: { ymd } });
      if (!known(ymd)) {
        page.appendChild(el('div', { class: 'cal-page__load' }, 'بارگذاری روز…'));
        return page;
      }
      const items = byDay.get(ymd) ?? [];
      if (items.length === 0) {
        page.appendChild(el('div', { class: 'cal-empty' }, icon('calendar', 22), 'نوبتی در این روز ثبت نشده'));
        return page;
      }
      for (const a of items) page.appendChild(mobileApptCard(a, ymd));
      return page;
    }

    /* چیدمان فیزیکی RTL: سه صفحه [prev، cur، next] — RTL یعنی prev راست‌ترین است و cur/next به ترتیب به چپ می‌روند:
       بدون جابه‌جایی prev در دید است؛ نمایش cur = translateX(+W)؛ رفتن به بعدی = +2W (ترک به راست)، قبلی = 0 */
    let W = Math.max(pager.clientWidth || 0, 1);
    let pos = W;
    let animating = false;

    function setPos(x, animate) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      track.style.transition = animate && !reduce ? 'transform var(--normal)' : 'none';
      track.style.transform = `translateX(${x}px)`;
    }

    function syncStrip() {
      for (const [ymd, btn] of stripBtns) {
        const on = ymd === state.dayYmd;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', String(on));
      }
    }

    let prevYmd = null, nextYmd = null;
    function buildPages(center) {
      prevYmd = addDaysYmd(center, -1);
      nextYmd = addDaysYmd(center, 1);
      W = Math.max(pager.clientWidth || 0, 1);
      track.replaceChildren(pageFor(prevYmd), pageFor(center), pageFor(nextYmd));
      pos = W;
      setPos(pos, false);
      syncStrip();
    }

    function go(next) {
      if (animating || !prevYmd) return;
      const target = next ? nextYmd : prevYmd;
      const targetX = next ? 2 * W : 0;
      animating = true;
      setPos(targetX, true);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        animating = false;
        state.dayYmd = target;
        const ws2 = weekStartOf(target);
        if (ws2 !== state.weekStart) {
          state.weekStart = ws2;
          refreshGrid(); /* هفتهٔ تازه — پیجر روی روز جدید وسط می‌شود؛ برچسب هفته هم درجا عوض می‌شود */
        } else {
          buildPages(state.dayYmd);
          if (!known(state.dayYmd)) refreshGrid(); /* فرود روی روز مرزیِ بیرون از پنجرهٔ داده */
        }
      };
      track.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, 400); /* بیمه: تب مخفی یا ترنزیشن اجرانشده */
    }

    function goToDate(ymd) {
      if (animating || ymd === state.dayYmd) return;
      if (ymd === nextYmd) return go(true);
      if (ymd === prevYmd) return go(false);
      state.dayYmd = ymd;
      buildPages(ymd);
      if (!known(ymd)) refreshGrid();
    }

    /* — سوییپ لمسی؛ اسکرول عمودی به مرورگر واگذار می‌شود (touch-action: pan-y روی .cal-pager) */
    let drag = null;
    pager.addEventListener('touchstart', (e) => {
      if (animating || e.touches.length !== 1) return;
      drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, locked: false };
    }, { passive: true });
    pager.addEventListener('touchmove', (e) => {
      if (!drag) return;
      const dx = e.touches[0].clientX - drag.x;
      const dy = e.touches[0].clientY - drag.y;
      if (!drag.locked) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        drag.locked = true;
        if (Math.abs(dy) > Math.abs(dx) * 1.2) { drag = null; return; } /* قصد عمودی — مداخله نمی‌کنیم */
      }
      drag.dx = dx;
      track.style.transition = 'none';
      track.style.transform = `translateX(${pos + dx}px)`;
    }, { passive: true });
    pager.addEventListener('touchend', () => {
      if (!drag) return;
      const { dx } = drag;
      drag = null;
      if (dx <= -56) go(false);       /* کشیدن به چپ = روز قبل */
      else if (dx >= 56) go(true);    /* کشیدن به راست = روز بعد */
      else setPos(pos, true);         /* برگشت فنری */
    });
    pager.addEventListener('touchcancel', () => { drag = null; if (!animating) setPos(pos, true); });

    VIEW.pagerRelayout = () => { if (!animating && !drag) buildPages(state.dayYmd); };

    buildPages(state.dayYmd);
    /* اندازهٔ نهایی پس از استراحت چیدمان (فونت/نوار اسکرول) — یک تصحیح نرم */
    requestAnimationFrame(() => {
      if (!VIEW || VIEW.pagerRelayout == null) return;
      const w2 = Math.max(pager.clientWidth || 0, 1);
      if (Math.abs(w2 - W) > 1 && !animating && !drag) { W = w2; pos = W; setPos(pos, false); }
    });
  }

  function autoScrollToWorkingHours() {
    if (state.viewMode === 'week' && isMobileWeek()) return; /* ۱.۲۷.۰ — پیجر گاتر زمان ندارد */
    if (window.scrollY > 120) return; // بعد از عملیات‌های درون‌صفحه صفحه را نجاتک
    const today = tehranTodayYmd();
    const weekday = iranianWeekdayOfYmd(state.viewMode === 'day' ? state.dayYmd : today);
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
    refreshGrid(); /* ۱.۲۰.۰ — بدون اسکلت */
  }

  function setMode(m) {
    if (state.viewMode === m) return;
    state.viewMode = m;
    try { sessionStorage.setItem('cs.apptViewMode', m); } catch { /* خصوصی */ } /* ۱.۲۷.۰ — انتخاب نشست */
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
  const ds = { ymd }; // — ۱.۲۰.۰: ستون با ymd/staff شناس‌پذیر می‌شود تا پچ درجا بتواند پیدایش کند
  if (opts.staff) ds.staff = opts.staff;
  const col = el('div', { class: `grid-day${isToday ? ' is-today' : ''}`, dataset: ds });

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
      dataset: { id: a.id, version: String(a.version), ymd, start: a.startAt },
      title: titleLines.join('\n'),
      /* S2-01: کارت تقویم با کیبورد باز می‌شود */
      role: 'button',
      tabindex: '0',
      'aria-label': titleLines.join(' — ')
    },
    el('span', { class: 'grid-appt__time' },
      attStateOf(a) === 'completed' ? el('span', { class: 'appt-tick' }, icon('check', 10)) : null,
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

/* ۱.۲۷.۰ — کارت تمام-عرض پیجر موبایل: پشته‌ای زمانی، بدون موقعیت‌دهی درصدی — هم‌پوشانی از خودش درنمی‌آید.
   همان زبان رنگ/وضعیت گرید (hueClass + apptStatusClass)؛ لمس بزرگ‌تر: زمان تا مدت، نام دانش‌آموزان، درمانگر + نوع جلسه */
function mobileApptCard(a, ymd) {
  const students = (a.students ?? []).map((s) => state.studentNames.get(s.studentId) ?? 'دانش‌آموز');
  const stuLabel = students.length === 0
    ? 'بدون دانش‌آموز'
    : students.length <= 2 ? students.join('، ') : `${students[0]}، ${students[1]} +${fa(students.length - 2)}`;
  const completed = attStateOf(a) === 'completed';
  const dur = Math.max(0, Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000));
  const titleLines = [
    `${fa(tehranTimeOfIso(a.startAt))} تا ${fa(tehranTimeOfIso(a.endAt))}`,
    staffName(a.staffId),
    ...((a.students ?? []).length > 0
      ? (a.students ?? []).map((s) => `${state.studentNames.get(s.studentId) ?? 'دانش‌آموز'} — ${STU_ATT_LABEL[s.attendance] ?? s.attendance ?? 'در انتظار'}`)
      : ['بدون دانش‌آموز'])
  ];

  const card = el('div', {
    class: `cal-appt${apptStatusClass(a)} ${hueClass(a.staffId)}`,
    dataset: { id: a.id, version: String(a.version), ymd, start: a.startAt },
    role: 'button',
    tabindex: '0',
    title: titleLines.join('\n'),
    'aria-label': titleLines.join(' — ')
  },
    el('span', { class: 'cal-appt__time' },
      completed ? el('span', { class: 'appt-tick' }, icon('check', 10)) : null,
      a.note ? el('span', { class: 'grid-appt__noted', title: a.note }) : null,
      `${fa(tehranTimeOfIso(a.startAt))} تا ${fa(tehranTimeOfIso(a.endAt))}`,
      el('span', { class: 'cal-appt__dur' }, durationLabel(dur))
    ),
    el('span', { class: 'cal-appt__stu' }, stuLabel),
    el('span', { class: 'cal-appt__staff' }, hueDot(a.staffId, 8), staffName(a.staffId), sessionTypeChip(a.sessionType))
  );

  card.addEventListener('click', () => openDetailModal(a.id));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetailModal(a.id); }
  });

  return card;
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
      if (!upsertApptCard(res.data, { animate: true })) await VIEW?.refreshGrid?.(); /* ۱.۲۰.۰ — کارت درجا پرواز می‌کند؛ نه اوتلت، نه refetch */
    } catch (err) {
      toastError(err); /* ۱.۲۰.۰ — DOM دست‌نخورده مانده؛ نیازی به بازسازی نیست */
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

/* — ۱.۲۰.۰ جعبه‌ابزار پچ درجای گرید (همان زبان ۱.۱۹.۰ روز کاری) — */
function collapseRemove(elm) {
  if (!elm || !elm.isConnected) return null;
  elm.style.height = `${Math.round(elm.getBoundingClientRect().height)}px`;
  elm.style.overflow = 'hidden';
  elm.style.pointerEvents = 'none';
  requestAnimationFrame(() => {
    elm.classList.add('is-resolving');
    setTimeout(() => elm.remove(), 260);
  });
  return true;
}

function findGridCol(ymd, staffId) {
  if (!VIEW || !VIEW.container.isConnected) return null;
  const esc = CSS.escape;
  if (VIEW.isDay) {
    return VIEW.gridInner.querySelector(`.grid-day[data-ymd="${esc(ymd)}"][data-staff="${esc(staffId ?? '')}"]`)
      ?? VIEW.gridInner.querySelector(`.grid-day[data-ymd="${esc(ymd)}"][data-staff="_other"]`);
  }
  return VIEW.gridInner.querySelector(`.grid-day[data-ymd="${esc(ymd)}"]`);
}

function apptFitsScale(a) {
  if (!SCALE) return false;
  const s = timeToMinute(tehranTimeOfIso(a.startAt));
  let e = timeToMinute(tehranTimeOfIso(a.endAt));
  if (isoToYmd(a.endAt) !== isoToYmd(a.startAt)) e += 1440;
  return s >= SCALE.start && e <= SCALE.end;
}

function updateColCount(col) {
  if (!VIEW || !col?.isConnected) return;
  const key = VIEW.isDay ? `${col.dataset.ymd}|${col.dataset.staff}` : col.dataset.ymd;
  const elc = VIEW.countEls.get(key);
  if (!elc) return;
  const n = col.querySelectorAll(':scope > .grid-appt').length;
  elc.textContent = VIEW.isDay ? `${fa(n)} نوبت` : ` · ${fa(n)} نوبت`;
}

function insertApptSorted(col, card, a) {
  const next = [...col.querySelectorAll(':scope > .grid-appt')].find((c) => c.dataset.start && c.dataset.start > a.startAt);
  if (next) col.insertBefore(card, next);
  else col.appendChild(card);
}

/* پرواز FLIP تک‌کارت — جایگزین flipMoveAppointment قدیمی که کل اوتلت را رندر می‌کرد */
function flyFrom(card, prevTop) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  requestAnimationFrame(() => {
    const dy = prevTop - card.getBoundingClientRect().top;
    if (Math.abs(dy) < 2) return;
    card.style.transition = 'none';
    card.style.transform = `translateY(${dy}px)`;
    requestAnimationFrame(() => {
      card.style.transition = 'transform var(--normal)';
      card.style.transform = '';
      card.addEventListener('transitionend', () => { card.style.transition = ''; }, { once: true });
    });
  });
}

/* ساخت/به‌روزرسانی یک کارت نوبت روی گرید زنده؛ false یعنی خارج از دید/مقیاس است → refreshGrid */
function upsertApptCard(a, { animate = false } = {}) {
  if (!VIEW || !SCALE || !a?.id) return false;
  const ymd = isoToYmd(a.startAt);
  const col = findGridCol(ymd, a.staffId);
  if (!col || !apptFitsScale(a)) return false;
  const old = VIEW.gridInner.querySelector(`.grid-appt[data-id="${CSS.escape(String(a.id))}"]`);
  const oldCol = old?.parentElement ?? null;
  const oldTop = old?.getBoundingClientRect().top ?? null;
  const card = apptOnGrid(a, ymd, { showStaffName: !VIEW.isDay });
  if (old) old.remove();
  insertApptSorted(col, card, a);
  if (oldCol && oldCol !== col) updateColCount(oldCol);
  updateColCount(col);
  if (animate && oldTop != null) flyFrom(card, oldTop);
  return true;
}

function removeApptCard(id) {
  if (!VIEW || !VIEW.container.isConnected || id == null) return false;
  const card = VIEW.gridInner.querySelector(`.grid-appt[data-id="${CSS.escape(String(id))}"]`);
  if (!card) return false;
  const col = card.parentElement;
  collapseRemove(card);
  updateColCount(col);
  return true;
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
      if (!upsertApptCard(res.data)) await VIEW?.refreshGrid?.(); /* ۱.۲۰.۰ — کارت نو همان لحظه روی گرید می‌نشیند */
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

  /* ۱.۲۰.۰ — بعد از تغییر حضور/دانش‌آموزان، کارت همین نوبت روی گرید بی‌صدا پچ می‌شود
     (رفع stale کهن: قبلاً گرید تا ناوبری بعدی قدیمی می‌ماند) */
  async function syncGridCard() {
    try {
      const fresh = (await api.get(`/api/appointments${qs({ id: a.id })}`)).data;
      if (!upsertApptCard(fresh)) await VIEW?.refreshGrid?.();
    } catch { /* بی‌صدا — گرید در ناوبری بعدی تازه می‌شود */ }
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
                  const prev = s.attendance ?? 'pending'; /* F6: آخرین مقدار ذخیره‌شده برای برگرداندن انتخاب در خطا */
                  try {
                    await api.patch(`/api/attendance/${a.id}/${s.studentId}`, { status: e.target.value });
                    s.attendance = e.target.value; /* F6: مدل محلی همگام بماند تا revert بعدی مقدار درست را دارد */
                    toast('وضعیت حضور ثبت شد', 'success');
                    syncGridCard(); /* ۱.۲۰.۰ — تیک/رنگ کارت همان لحظه */
                  } catch (err) {
                    e.target.value = prev; /* F6: وضعیت ردشده روی select نماند */
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
                  syncGridCard(); /* ۱.۲۰.۰ */
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
                  syncGridCard(); /* ۱.۲۰.۰ */
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
                  const res = await api.post(`/api/appointments/${a.id}/restore`, { version: a.version });
                  toast('نوبت دوباره برقرار شد', 'success');
                  closeRoot();
                  if (!upsertApptCard(res.data, { animate: true })) await VIEW?.refreshGrid?.(); /* ۱.۲۰.۰ */
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
                  const res = await api.post(`/api/appointments/${a.id}/cancel`, { version: a.version });
                  toast('نوبت لغو شد (اعلان لغو صف شد)', 'success');
                  closeRoot();
                  if (!upsertApptCard(res.data, { animate: true })) await VIEW?.refreshGrid?.(); /* ۱.۲۰.۰ */
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
                  if (!removeApptCard(a.id)) await VIEW?.refreshGrid?.(); /* ۱.۲۰.۰ — جمع‌شدن انیمیشنی کارت */
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
        current = res.data ?? current; /* ۱.۲۰.۰ — نسخهٔ تازه برای پچ درجا */
        if (res.warnings?.length) toast(`${fa(res.warnings.length)} تداخل نرم — مدت تغییر کرد`, 'warning', 6000);
      }
      toast('نوبت به‌روزرسانی شد', 'success');
      if (!upsertApptCard(current, { animate: true })) await VIEW?.refreshGrid?.(); /* ۱.۲۰.۰ */
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
    await VIEW?.refreshGrid?.(); /* ۱.۲۰.۰ — بدون اسکلت؛ دکمهٔ برگردان با syncUndoBtn ظاهر می‌شود */
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
    try { sessionStorage.removeItem('cs.lastBatchId'); } catch { /* خصوصی */ } /* F5: بعد از reload دکمهٔ برگردان برای دستهٔ انجام‌شده دوباره ظاهر نشود */
    await VIEW?.refreshGrid?.(); /* ۱.۲۰.۰ */
  } catch (err) {
    toastError(err);
  }
}
