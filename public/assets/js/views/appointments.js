/**
 * نمای نوبت‌دهی و تقویم هفتگی
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// views/appointments.js — تقویم هفتگی نوبت‌ها (: time-grid + نوبت‌گذاری سریع)
// امکانات:
// * نمای شبکه زمانی هفتگی (۰۶:۰۰ تا ۲۲:۰۰، سلول‌های ۳۰ دقیقه‌ای، اسنپ ۱۵ دقیقه)
// * کلیک روی هر سلول → ایجاد سریع با تاریخ/ساعت پیش‌پر و چیپ‌های مدت
// * درگ‌انددراپ نوبت روی شبکه → جابه‌جایی (move) با 409-safe
// * سایه «خارج از بازه کاری مرکز» (از تنظیمات) + خط «الان»
// * کپی از هفته قبل / برگردان / جزئیات / ویرایش / لغو / حضور / افزودن و حذف دانش‌آموز

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
// تب لیست انتظار به «دانش‌آموزان» منتقل شد (import حذف شد)

// ─────────────── ثابت‌های شبکه ───────────────
const DAY_START = 6 * 60;    // کف مطلق شبکه (فقط پشتیبان)
const DAY_END = 22 * 60;     // سقف مطلق — فقط اگر نوبت واقعی بیرون بزند باز می‌شود
const CELL_MINUTES = 30;     // هر سلول ۳۰ دقیقه
const PPM_WORK_WEEK = 1.9;   // — پیکسل بر دقیقه «داخل بازهٔ کاری» (هفتگی): کارت‌های بلندتر
const PPM_WORK_DAY = 2.6;    // نمای روزانه موبایل: ردیف‌های بلندتر برای لمس راحت‌تر
const PPM_OFF = 0.5;         // — ساعت‌های بیرون بازهٔ کاری فشرده می‌شوند
const WORK_CAP = 21 * 60;    // — شیفت عصر فعال شد: بازهٔ کاری مرکز تا ۲۱:۰۰ رندر می‌شود (قبلاً ۱۸:۰۰)
let WORK_PPM = PPM_WORK_WEEK; // در ابتدای هر رندر بر اساس حالت تنظیم می‌شود

// مقیاس عمودی شبکه: پنجرهٔ دینامیک بر مبنای بازهٔ کاری مرکز + نوبت‌های واقعی؛
// دقیقه‌های داخل بازهٔ کاری با WORK_PPM و بیرون آن با PPM_OFF نگاشت می‌شوند تا
// کل شبکه کوتاه‌تر شود و کارت‌های داخل بازهٔ کاری فضای بیشتری بگیرند.
let SCALE = null; // { start, end, workStart, workEnd, yOf(m), span(a, b), total }

/**
 * — ساخت مقیاس عمودی شبکه.
 * مرزها: پاکت بازهٔ کاری مرکز روی روزهای نمایان (سقف ۲۱:۰۰ از — شیفت عصر؛ دادهٔ واقعی بیرون‌زده همیشه باز می‌شود)،
 * با ۳۰ دقیقه بالشتک فشرده اطراف. اگر تنظیم ساعت مرکز بارگذاری نشده باشد ۸ تا ۱۸ فرض می‌شود.
 */
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

  // مرز داده — نوبت‌های واقعی هرگز نباید از قاب بیرون بزنند
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
const DURATIONS = [15, 30, 45, 60, 90, 120];

// فاز ۲ — گزارش جلسه: اقدام بعدی (D7) + قاعدهٔ نویسنده (§8.2)
const NEXT_ACTION_LABELS = { none: 'هیچ', follow_up: 'پیگیری', next_appointment: 'نوبت بعدی', contact: 'تماس با خانواده', referral: 'ارجاع' };

function canWriteSession(appt) {
  if (!session.user) return false;
  if (session.user.role === 'manager') return true;
  return session.user.role === 'therapist' && session.user.staffId === appt.staffId;
}

// فاز ۵ — مدیریت نوبت (زمان/لغو/دانش‌آموزان): مدیر/منشی همه (نقش ناظر + مداخله)؛
// درمانگر فقط نوبت‌های خودش — هم‌سو با گارد scope سرور
function canManage(appt) {
  if (!session.user) return false;
  const r = session.user.role;
  return r === 'manager' || r === 'secretary' || (r === 'therapist' && session.user.staffId === appt.staffId);
}

// وضعیت ماژول — بین رندرها حفظ می‌شود
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
  lastBatchId: null,
  lastDuration: 45,
  centerHours: [] // [{weekday, startMinute, endMinute}]
};

/** — همه دانش‌آموزان فعال (MAX_PAGE_SIZE سرور ۱۰۰ است — صفحه‌به‌صفحه) */
async function fetchAllStudents() {
  const out = [];
  let page = 1;
  for (;;) {
    const res = await api.get(`/api/students?active=true&page_size=100&page=${page}`);
    out.push(...res.data);
    const totalPages = res.meta?.totalPages ?? 1;
    if (page >= totalPages) break;
    page += 1;
  }
  return out;
}

/**
 * — کلاس وضعیت کارت نوبت برای رنگ‌بندی:
 * لغو (status) → راه‌راه هم‌رنگ · برگزارشده (ops=completed) → تینت عمیق + تیک · نیامد (ops=no_show) → لبهٔ قرمز
 */
function apptStatusClass(a) {
  if (a.status === 'cancelled') return ' is-cancelled';
  if (a.opsStatus === 'completed') return ' is-attended';
  if (a.opsStatus === 'no_show') return ' is-noshow';
  return '';
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function renderAppointments(container, ctx = {}) {
  // لیست انتظار به ماژول «دانش‌آموزان» منتقل شد؛ لینک‌های قدیمی ریدایرکت می‌شوند
  if (ctx.query?.tab === 'waitlist') {
    location.replace('#/waitlist'); // — ماژول مستقل
    return;
  }

  if (!state.weekStart) state.weekStart = weekStartOf(tehranTodayYmd());
  if (!state.viewMode) state.viewMode = 'week'; // — پیش‌فرض هفتگی در همهٔ دستگاه‌ها (تصمیم کاربر)
  if (!state.dayYmd) state.dayYmd = tehranTodayYmd();
  // فاز ۵ — درمانگر: برنامهٔ خودش (فیلتر کارمند قفل روی خودش)
  const isTherapist = session.user?.role === 'therapist';
  if (isTherapist) state.staffFilter = session.user.staffId;
  WORK_PPM = state.viewMode === 'day' ? PPM_WORK_DAY : PPM_WORK_WEEK;
  // هفتهٔ متناظر روز/هفتهٔ جاری — منبع داده fetch (سوییچ حالت بدون refetch اضافه)
  state.weekStart = weekStartOf(state.viewMode === 'day' ? state.dayYmd : state.weekStart);

  // اسکلتون به‌جای اسپینر در بارگذاری اولیهٔ تقویم
  container.replaceChildren(skeletonState('cards', 3));

  const [staffRes, studentsRes, centerRes, myStuRes] = await Promise.allSettled([
    api.get('/api/staff?active=true'),
    fetchAllStudents(),
    api.get('/api/settings/center-hours'),
    isTherapist ? api.get('/api/appointments/my-students') : Promise.resolve(null)
  ]);
  if (staffRes.status === 'fulfilled') state.staffList = staffRes.value.data;
  // نوبت/تقویم ابزار نقش درمانگر است؛ ستون‌ها و انتخاب‌گرها فقط درمانگرها (مدیر/منشی/ناظر ستون نمی‌گیرند)
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

  // ─────────────── نوار ابزار (سوییچ حالت هفته/روز + ناوبری) ───────────────
  const isDay = state.viewMode === 'day';
  const weekLabel = `${formatJalaliShort(state.weekStart)} تا ${formatJalaliShort(weekEnd)}`;

  // تب «لیست انتظار» حذف شد (در «دانش‌آموزان» ادغام شده)
  const modeSeg = el('div', { class: 'seg mode-seg' },
    el('button', { class: `seg__btn${!isDay ? ' is-active' : ''}`, onclick: () => setMode('week') }, 'هفته'),
    el('button', { class: `seg__btn${isDay ? ' is-active' : ''}`, onclick: () => setMode('day') }, 'روز')
  );
  // فاز ۵ — درمانگر: بدون انتخاب کارمند (فقط برنامهٔ خودش)
  // دفتر: چیپ‌های رنگی درمانگر (به‌جای select) — نقطهٔ رنگ = رنگ کارت‌های جلسهٔ او
  const staffSelect = isTherapist
    ? el('span', { class: 'badge badge--neutral', style: { padding: '6px 10px' } }, `برنامهٔ من — ${staffName(session.user.staffId)}`)
    : el(
        'div',
        { class: 'staff-chips', role: 'group', 'aria-label': 'فیلتر درمانگر' },
        el(
          'button',
          { class: `staff-chip${state.staffFilter === '' ? ' is-active' : ''}`, onclick: () => { state.staffFilter = ''; rerender(container); } },
          'همه'
        ),
        state.therapistList.map((s) =>
          el(
            'button',
            // کلاس hue روی خود چیپ: حالت فعال هم‌رنگ کارت‌های جلسهٔ همان درمانگر می‌شود
            // (تا فقط نقطهٔ رنگی داخل چیپ رنگ داشت و tint حالت فعال بی‌اثر بود)
            { class: `staff-chip ${hueClass(s.id)}${state.staffFilter === s.id ? ' is-active' : ''}`, onclick: () => { state.staffFilter = s.id; rerender(container); } },
            hueDot(s.id),
            s.fullName
          )
        )
      );
  const newBtn = el('button', { class: 'btn btn--primary btn--sm', onclick: () => openCreateModal(container) }, icon('zap', 16), 'نوبت جدید');

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
      state.lastBatchId
        ? el('button', { class: 'btn btn--ghost btn--sm', onclick: undoLastCopy }, icon('undo', 16), 'برگردان آخرین کپی')
        : null,
      el('button', { class: 'btn btn--ghost btn--sm', onclick: copyPrevWeek }, icon('copy', 16), 'کپی از هفته قبل')
    ]),
    isDay ? el('div', { class: 'spacer' }) : null,
    staffSelect,
    newBtn
  );

  // ─────────────── شبکه زمانی (هفتگی یا روزانه چندستونی) ───────────────
  const today = tehranTodayYmd();
  const byDay = groupByDay(appointments);

  // پنجرهٔ دینامیک شبکه: بازهٔ کاری مرکز (سقف ۱۸:۰۰) + فشرده‌سازی ساعت‌های بیرون
  const visibleYmds = isDay
    ? [state.dayYmd]
    : Array.from({ length: 7 }, (_, i) => addDaysYmd(state.weekStart, i));
  SCALE = buildScale(visibleYmds, isDay ? (byDay.get(state.dayYmd) ?? []) : appointments);

  const gridInner = el('div', { class: 'grid-inner' });

  if (isDay) {
    // ─── نمای روز: یک ستون برای هر درمانگر (اتاق خودش) — ؛ — فقط درمانگرها ستون می‌گیرند ───
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

    // ستون ساعت (gutter) — برچسب‌ها فقط وقتی جا دارند رندر می‌شوند (منطقهٔ فشرده هر دو ساعت)
    // gutter صریحاً در ردیف بدنه (ر2) می‌نشیند تا برچسب‌ها دقیقاً با خط سلول‌ها تراز باشند
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
    // ─── نمای هفته: هفت ستون روز ───
    gridInner.style.gridTemplateColumns = '';
    const days = Array.from({ length: 7 }, (_, i) => addDaysYmd(state.weekStart, i));

    // ستون ساعت (gutter) — صریحاً در ردیف بدنه (ر2) تا برچسب‌ها با سلول‌ها تراز باشند
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

  // راهنمای رنگ: وقتی بیش از یک درمانگر در نماست (فقط دفتر)
  const visibleHues = new Set(appointments.filter((a) => !state.staffFilter).map((a) => a.staffId));
  const legend = !isTherapist && visibleHues.size > 1
    ? el(
        'div',
        { class: 'appt-legend' },
        el('span', { class: 'appt-legend__name' }, 'راهنمای رنگ:'),
        state.therapistList.filter((s) => visibleHues.has(s.id)).map((s) => el('span', { class: 'appt-legend__item' }, hueDot(s.id), s.fullName)),
        el('span', { class: 'appt-legend__item' }, icon('check', 12), 'برگزارشده'),
        el('span', { class: 'appt-legend__item' }, '▨', 'لغوشده'),
        el('span', { class: 'appt-legend__item' }, icon('x', 12), 'نیامد')
      )
    : null;

  // filter(Boolean): replaceChildren(null) رشتهٔ «null» تزریق می‌کند (نمای روز: راهنمای سوایپ وجود ندارد)
  container.replaceChildren(
    ...[
      bar,
      legend,
      // در موبایل هفته بیش از یک صفحه عرض دارد؛ راهنمای سوایپ نشان بده
      !isDay ? el('div', { class: 'swipe-hint is-week' }, icon('chevL', 14), 'برای دیدن روزهای دیگر، تقویم را بکشید') : null,
      el('div', { class: 'grid-wrap' }, el('div', { class: 'grid-scroll' }, gridInner))
    ].filter(Boolean)
  );

  // اسکرول خودکار به ابتدای بازه کاری مرکز (فقط وقتی صفحه تازه باز شده)
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
        // روز انتخابی به هفتهٔ فعلی نمی‌آید → امروز اگر داخل هفته است، وگرنه شنبه
        state.dayYmd = (state.weekStart <= todayYmd && todayYmd <= weekEndYmd) ? todayYmd : state.weekStart;
      }
    }
    rerender(container);
  }
}

// ─────────────── ستون یک روز ───────────────

function buildDayColumn(ymd, items, isToday, opts = {}) {
  const showStaffName = opts.showStaffName !== false;
  const col = el('div', { class: `grid-day${isToday ? ' is-today' : ''}` });

  // سایه‌های خارج از بازه کاری مرکز
  for (const off of offRanges(ymd)) {
    col.appendChild(el('div', { class: 'grid-off', style: { top: `${off.top}px`, height: `${off.height}px` } }));
  }

  // سلول‌های ۳۰ دقیقه‌ای (کلیک → ایجاد سریع؛ درگ → جابه‌جایی) — ارتفاع متغیر: داخل بازهٔ کاری بلند، بیرون فشرده
  for (let m = SCALE.start; m < SCALE.end; m += CELL_MINUTES) {
    const cell = el('div', {
      class: `grid-cell${m % 60 === 0 ? ' is-hour' : ''}`,
      style: { height: `${SCALE.span(m, m + CELL_MINUTES)}px` },
      dataset: { minute: String(m), ymd }
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

  // کارت‌های نوبت
  for (const a of items) col.appendChild(apptOnGrid(a, ymd, { showStaffName }));

  // خط «الان» برای امروز
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
  const t = new Date(Date.now() + 210 * 60000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

// برچسب/آیکون حضور دانش‌آموز (هم برچسب title کارت، هم آیکون ردیف‌ها)
const STU_ATT_LABEL = { present: 'حاضر', late: 'تأخیر', absent: 'غایب', pending: 'در انتظار', cancelled: 'لغو' };
const STU_ATT_ICON = { present: ['check', 'ok'], late: ['clock', 'late'], absent: ['x', 'err'] };

function apptOnGrid(a, ymd, opts = {}) {
  const showStaffName = opts.showStaffName !== false;
  const startMin = timeToMinute(tehranTimeOfIso(a.startAt));
  const endMin = timeToMinute(tehranTimeOfIso(a.endAt)) + (isoToYmd(a.endAt) !== isoToYmd(a.startAt) ? 1440 : 0);
  const top = Math.max(0, SCALE.yOf(Math.max(startMin, SCALE.start)));
  const height = Math.max(28, SCALE.span(startMin, endMin) - 3);

  // هوشمندی تراکم: کارت بلند (≥۵۶px) ردیف‌های دانش‌آموز با آیکون حضور می‌گیرد؛
  // کارت کوتاه (۱۵–۳۰ دقیقه) مثل قبل تک‌خطی می‌ماند تا بریده نشود
  const tall = height >= 56;
  const students = (a.students ?? []).map((s) => state.studentNames.get(s.studentId) ?? 'دانش‌آموز');

  // title غنی‌شده: یک خط برای هر دانش‌آموز با وضعیت حضورش
  const stType = sessionTypeOf(a.sessionType); // — نوع جلسه در title
  const titleLines = [
    `${fa(tehranTimeOfIso(a.startAt))} – ${fa(tehranTimeOfIso(a.endAt))}`,
    staffName(a.staffId),
    ...(stType ? [`نوع: ${stType.label}`] : []),
    ...((a.students ?? []).length > 0
      ? (a.students ?? []).map((s) => `${state.studentNames.get(s.studentId) ?? 'دانش‌آموز'} — ${STU_ATT_LABEL[s.attendance] ?? s.attendance ?? 'در انتظار'}`)
      : ['بدون دانش‌آموز'])
  ];

  // ردیف‌های دانش‌آموز: حداکثر ۳ ردیف + «+N» برای سرریز (فقط کارت بلند)
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
      // رنگ درمانگر + وضعیت (برگزارشده/لغو/نیامد) روی کارت گرید
      class: `grid-appt${apptStatusClass(a)} ${hueClass(a.staffId)}`,
      style: { top: `${top}px`, height: `${height}px` },
      draggable: 'true',
      dataset: { id: a.id, version: String(a.version), ymd },
      title: titleLines.join('\n')
    },
    el('span', { class: 'grid-appt__time' },
      a.opsStatus === 'completed' && a.status !== 'cancelled' ? el('span', { class: 'appt-tick' }, icon('check', 10)) : null,
      // نشانگر نقطه‌ای «نوبت دارای توضیح» داخل ردیف ساعت
      a.note ? el('span', { class: 'grid-appt__noted', title: a.note }) : null,
      `${fa(tehranTimeOfIso(a.startAt))} – ${fa(tehranTimeOfIso(a.endAt))}`
    ),
    // نشان نوع جلسه روی کارت بلند (فردی/گروهی/خانواده/آموزگاران/ذهنی)
    tall ? sessionTypeChip(a.sessionType) : null,
    tall && showStaffName ? el('span', { class: 'grid-appt__title' }, staffName(a.staffId)) : null,
    tall && stuRows.length > 0
      ? stuRows
      : el('span', { class: 'grid-appt__title' }, students.length > 0 ? students.join('، ') : 'بدون دانش‌آموز')
  );

  card.addEventListener('click', () => openDetailModal(a.id));
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: a.id, version: a.version, fromYmd: ymd }));
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('is-dragging'));

  return card;
}

// ─────────────── درگ‌انددراپ → move ───────────────

async function handleDrop(e, targetYmd, cellMinute, cell) {
  let payload;
  try {
    payload = JSON.parse(e.dataTransfer.getData('text/plain'));
  } catch {
    return;
  }
  if (!payload?.id) return;

  // اسنپ ۱۵ دقیقه‌ای داخل سلول ۳۰ دقیقه‌ای (ارتفاع سلول‌ها متغیر است → نسبت واقعی سلول)
  const rect = cell.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  const inner = Math.floor(((offsetY / Math.max(rect.height, 1)) * CELL_MINUTES) / 15) * 15;
  const newMinute = Math.min(cellMinute + inner, 24 * 60 - 15);
  const snapped = Math.round(newMinute / 15) * 15;

  // فقط جابه‌جایی زمان در همان روز از طریق درگ — تغییر روز از ویرایش
  if (targetYmd === payload.fromYmd) {
    const newStartAt = tehranYmdMinuteToIso(targetYmd, snapped);
    try {
      const res = await api.patch(`/api/appointments/${payload.id}/move`, { start_at: newStartAt, version: payload.version });
      toast(`نوبت به ${fa(minuteToLabel(snapped))} جابه‌جا شد`, 'success');
      if (res.warnings?.length) toast(`${fa(res.warnings.length)} تداخل نرم — جابه‌جایی انجام شد`, 'warning', 6000);
      rerender(document.getElementById('outlet'));
    } catch (err) {
      toastError(err);
      rerender(document.getElementById('outlet'));
    }
  } else {
    // روز متفاوت → ویرایشگر زمان باز می‌شود (تاریخ جدید = روز مقصد)
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

// ─────────────── helpers ───────────────

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

// پیش‌فرض نمای روزانه بر اساس عرض صفحه حذف شد: تقویم همیشه هفتگی باز می‌شود
// (نمای روزانه با سوییچ «روزانه» در نوار بالا در دسترس است)

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
  return new Date(new Date(iso).getTime() + 210 * 60000).toISOString().slice(0, 10);
}

function staffName(id) {
  return state.staffList.find((s) => s.id === id)?.fullName ?? 'کارمند';
}

// ─────────────── ایجاد سریع نوبت (کلیک روی سلول) ───────────────

function openQuickCreate(ymd, minute) {
  openCreateModal(document.getElementById('outlet'), { ymd, minute });
}

function openCreateModal(container, preset = {}) {
  const picked = new Set();
  // فاز ۵ — درمانگر: picker فقط از «دانش‌آموزان من» (اشتقاق D4) — منشی/مدیر همهٔ فعال‌ها
  const isTher = session.user?.role === 'therapist';
  const allStudents = isTher ? state.myStudents : state.studentsAll;
  const defaultYmd = preset.ymd ?? (state.weekStart === weekStartOf(tehranTodayYmd()) ? tehranTodayYmd() : state.weekStart);
  const defaultMinute = preset.minute ?? (9 * 60);

  const searchInput = el('input', { class: 'input', placeholder: 'جستجوی نام دانش‌آموز…' });
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
              // badge «پذیرش شده» حذف شد: با پذیرشِ ورودی لیست انتظار پاک می‌شود و
              // projection دیگر هرگز 'admitted' برنمی‌گرداند (شاخهٔ مرده)
              isTher && s.waitStatus === 'waiting' ? el('span', { class: 'badge badge--warning' }, 'منتظر') : null,
              el('span', { style: { marginInlineStart: 'auto', fontSize: 'var(--fs-xs)', color: 'var(--text-3)' } }, s.grade ? `پایه ${gradeLabel(s.grade)}` : '')
            )
          ))
    );
  };
  drawList();

  let durationValue = preset.duration ?? state.lastDuration;
  let chipBox = null;

  // نوع جلسه: انتخاب نوع، مدت پیش‌فرض همان نوع (جدول ۴) را ست می‌کند (قابل تغییر)
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

  // تزریق: چیپ‌های مدت سریع + انتخاب دانش‌آموز + اتصال نوع جلسه → مدت پیش‌فرض
  setTimeout(() => {
    const form = document.querySelector('.modal .form-grid');
    if (!form) return;

    // چیپ‌ها بعد از فیلد مدت
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
            dataset: { d: String(d) },
            onclick: () => { durationSelect.value = String(d); drawChips(); }
          }, durationLabel(d))
        );
      }
      durationSelect.addEventListener('change', drawChips);
      durationSelect.closest('.field').insertAdjacentElement('afterend', chipBox);
    }

    // انتخاب نوع جلسه → مدت پیش‌فرض همان نوع + چیپ فعال‌شونده
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

// ─────────────── جزئیات نوبت ───────────────

async function openDetailModal(appointmentId) {
  let a;
  try {
    a = (await api.get(`/api/appointments${qs({ id: appointmentId })}`)).data;
  } catch (err) {
    toastError(err);
    return;
  }

  const studentsBox = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });

  // ─────────────── فاز ۲: بلوک گزارش جلسه (per-student) ───────────────

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
                title: 'فرم رسمی گزارش جلسه — روی تایم‌لاین پرونده می‌نشیند و به این جلسه متصل می‌شود',
                onclick: async () => {
                  try {
                    const prof = await api.get(`/api/students/${s.studentId}`);
                    // جریان واحد: نوع پیش‌فرض = آخرین نوع همین جلسه، تاریخ = روز جلسه
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

    // فقط-خواندن (منشی / درمانگر غیرمالک / نوبت لغوشده) — فقط وقتی محتوا دارد
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

  // رویدادهای ساخت‌یافتهٔ این جلسه (نشانگر «گزارش ثبت شد» + باز کردن جزئیات)
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
              class: 'range-chip__x', title: 'حذف از نوبت',
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

  // افزودن دانش‌آموز با جستجو (هم‌سو با فرم نوبت جدید) به‌جای select بلند
  // درمانگر فقط از «دانش‌آموزان من» انتخاب می‌کند (سرور هم assertStudentsInScope دارد)
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
        // نوع جلسه (جدول ۴) — نوبت‌های قدیمی بدون نوع
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
      // حذف کامل نوبت ثبت‌شدهٔ اشتباه/تکراری (نه لغو — پاک‌شدن از تقویم)؛
      // سابقهٔ جلسه یا گزارش جلسه → سرور 409 می‌دهد و پیام راهنما نمایش داده می‌شود
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

// ─────────────── ویرایش زمان (move + resize) ───────────────

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
        if (res.warnings?.length) toast(`${fa(res.warnings.length)} تداخل نرم — نوبت جابجا شد`, 'warning', 6000);
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

// ─────────────── کپی هفته / برگردان ───────────────

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
