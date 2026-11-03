import { api, qs } from '../api.js';
import {
  addDaysYmd,
  fa,
  formatJalaliFull,
  formatJalaliNumeric,
  iranianWeekdayOfYmd,
  JALALI_MONTHS,
  jalaliMonthLength,
  minuteToLabel,
  relativeDayLabel,
  tehranDayRange,
  tehranTimeOfIso,
  tehranTodayYmd,
  tehranYmdOfIso,
  toGregorian,
  toJalali,
  WEEKDAY_ABBRS,
  WEEKDAY_NAMES
} from '../format.js';
import { el, icon, toast, toastError, skeletonState, errorState, emptyState, statusBadge, formModal, confirmModal } from '../ui.js';
import { hueClass, staffHue } from '../staff-hue.js'; // — رنگ ثابت هر درمانگر روی کارت نوبت
import { sessionTypeOf } from '../session-type.js'; // — نوع جلسه (جدول ۴)
import { openCaseEventForm, canCreateCaseEvents } from '../case-events.js';
import { session } from '../state.js';

const local = { date: tehranTodayYmd(), viewJ: null }; // viewJ: ماه نمایش تقویم {jy, jm}
let currentContainer = null;

const STAFF_STATUS = [
  { key: 'present', label: 'حاضر', cls: 'ok' },
  { key: 'absent', label: 'غایب', cls: 'err' },
  { key: 'late', label: 'تأخیر', cls: 'late' },
  { key: 'leave', label: 'مرخصی', cls: 'info' },
  { key: 'sick', label: 'بیماری', cls: 'sick' }
];

const STAFF_STATUS_LABEL = { present: 'حاضر', absent: 'غایب', late: 'تأخیر', leave: 'مرخصی', sick: 'بیماری' };
const STAFF_STATUS_BADGE = { present: 'success', absent: 'error', late: 'warning', leave: 'info', sick: 'sick' };
const SESSION_STATUS_CLS = { present: 'ok', late: 'warn', absent: 'err', pending: 'muted', cancelled: 'muted' };
const SESSION_STATUS_LABEL = { present: 'حاضر', late: 'تأخیر', absent: 'غایب', pending: 'در انتظار', cancelled: 'لغو' };

/* ۱.۱۸.۰ — سیستم موازی «وضعیت عملیاتی نوبت» (آمد/تأخیر/شروع جلسه/اتمام جلسه/نیامد) حذف شد.
   تنها مرجعِ وضعیت، حضور و غیاب واقعی هر دانش‌آموز است: همهٔ حاضر/تأخیر = برگزارشده؛
   همه غایب = برگزار نشده؛ بقیه = در انتظار. */
function attStateOf(a) {
  if (a.status === 'cancelled') return 'cancelled';
  const rows = (a.students ?? []).filter((s) => s.attendance !== 'cancelled');
  if (rows.length === 0) return 'none';
  if (rows.every((s) => s.attendance === 'present' || s.attendance === 'late')) return 'completed';
  if (rows.every((s) => s.attendance === 'absent')) return 'no_show';
  return 'none';
}

const ATT_DOT = {
  none: 'wd-tl__dot--planned',
  completed: 'wd-tl__dot--completed',
  no_show: 'wd-tl__dot--no_show',
  cancelled: 'wd-tl__dot--cancelled'
};

function canManage() {
  return session.user?.role === 'manager' || session.user?.role === 'secretary';
}

function isTherapist() {
  return session.user?.role === 'therapist';
}

function canDeleteNotes() {
  return session.user?.role === 'manager';
}

/* ۱.۱۹.۰ — جریان پیوسته: هیچ اکشنی کل نما را دوباره نمی‌سازد.
   هر دکمه همان لحظه وضعیت خودش را روی داده و DOM وصله می‌کند (optimistic UI)
   و درخواست در پس‌زمینه می‌رود؛ خطا = برگشت نرم به وضعیت قبل.
   rerender کامل فقط برای ناوبری تاریخ و دکمهٔ دستی «به‌روزرسانی» می‌ماند. */
let currentBoard = null; // مرجع دادهٔ زندهٔ بورد برای وصله‌های جراحی
const inflight = new Set(); // قفل اکشن در جریان — جلوی دابل‌اثر و رقابت پچ‌ها
let overdueMeta = null; // شمارندهٔ کارت «ثبت‌های عقب‌افتاده» برای پچ فوری

/* قرینهٔ sessionStatsFromAppointments سمت سرور — شمارش سطح دانش‌آموز در نوبت‌های غیرلغوشده */
function recomputeSessionStats(board) {
  if (!board) return;
  let present = 0, absent = 0, pending = 0, total = 0;
  const lists = [...(board.staff ?? []).map((c) => c.appointments ?? []), board.unassigned ?? []];
  for (const list of lists) {
    for (const appt of list) {
      if (appt.status === 'cancelled') continue;
      for (const s of appt.students ?? []) {
        total++;
        if (s.attendance === 'present') present++;
        else if (s.attendance === 'absent') absent++;
        else if (s.attendance === 'pending') pending++;
      }
    }
  }
  board.sessionStats = { total, present, absent, pending, cancelledAppointments: board.sessionStats?.cancelledAppointments ?? 0 };
}

function syncBoardJson() {
  if (currentBoard) lastBoardJson = JSON.stringify(currentBoard); // softRefresh این تغییر را «خارجی» نبیند
}

function findAppt(apptId) {
  if (!currentBoard) return null;
  for (const c of currentBoard.staff ?? []) {
    const hit = (c.appointments ?? []).find((a) => a.id === apptId);
    if (hit) return hit;
  }
  return (currentBoard.unassigned ?? []).find((a) => a.id === apptId) ?? null;
}

function pulse(elm) {
  if (!elm || !elm.isConnected) return;
  elm.classList.remove('wd-flash');
  void elm.offsetWidth; // ری‌استارت انیمیشن
  elm.classList.add('wd-flash');
  elm.addEventListener('animationend', () => elm.classList.remove('wd-flash'), { once: true });
}

/* برداشتن نرم یک عنصر: ارتفاع/شفافیت انیمیت می‌شود؛ در مسیر خطا undo عنصر را برمی‌گرداند */
function collapseRemove(elm) {
  if (!elm || !elm.isConnected) return null;
  const parent = elm.parentElement;
  const next = elm.nextSibling;
  elm.style.height = `${Math.round(elm.getBoundingClientRect().height)}px`;
  elm.style.overflow = 'hidden';
  elm.style.pointerEvents = 'none';
  requestAnimationFrame(() => {
    elm.classList.add('is-resolving');
    setTimeout(() => elm.remove(), 260);
  });
  return {
    elm, parent, next,
    undo() {
      elm.classList.remove('is-resolving');
      elm.style.cssText = '';
      if (parent && !elm.isConnected) parent.insertBefore(elm, next);
    }
  };
}

function refreshApptChips() {
  const box = currentContainer?.querySelector?.('.wd-appts-card .wd-att__chips');
  if (!box || !currentBoard) return;
  const ss = currentBoard.sessionStats ?? {};
  box.replaceChildren(...[
    chip(ss.total, 'جلسه', 'primary', 'جلسه‌های این روز'),
    ss.pending > 0 ? chip(ss.pending, 'بدون ثبت', 'neutral', 'جلسات بدون ثبت حضور دانش‌آموز') : null,
    ss.present > 0 ? chip(ss.present, 'حاضر', 'success') : null,
    ss.absent > 0 ? chip(ss.absent, 'غایب', 'error') : null,
    currentBoard.assessmentsToday > 0 ? chip(currentBoard.assessmentsToday, 'ارزیابی امروز', 'accent', 'گزارش‌های جلسهٔ ثبت‌شدهٔ امروز') : null
  ].filter(Boolean));
}

function refreshCalCount() {
  const elc = currentContainer?.querySelector?.('.wd-cal__count');
  if (!elc || !currentBoard) return;
  elc.replaceChildren(icon('board', 13), `${fa(currentBoard.sessionStats?.total ?? 0)} جلسه`);
}

function refreshAttChips() {
  const box = currentContainer?.querySelector?.('.wd-att-card .wd-att__chips');
  if (!box || !currentBoard) return;
  const counts = { present: 0, absent: 0, late: 0, leave: 0, sick: 0, unmarked: 0 };
  for (const c of currentBoard.staff ?? []) {
    if ((c.dayHours ?? []).length === 0) continue;
    const st = c.attendance?.status;
    if (st && counts[st] !== undefined) counts[st] += 1;
    else counts.unmarked += 1;
  }
  box.replaceChildren(...[
    chip(counts.present, 'حاضر', 'success'),
    chip(counts.absent, 'غایب', 'error'),
    chip(counts.late, 'تأخیر', 'warn'),
    chip(counts.leave, 'مرخصی', 'accent'),
    chip(counts.sick, 'بیمار', 'sick'),
    chip(counts.unmarked, 'بدون ثبت', 'neutral')
  ].filter(Boolean));
}

function staffStBits(st, note) {
  return [
    st ? el('span', { class: `badge badge--${STAFF_STATUS_BADGE[st]}` }, STAFF_STATUS_LABEL[st]) : null,
    note
      ? el('span', { class: 'att-note', title: note }, icon('edit', 12), note.length > 26 ? `${note.slice(0, 26)}…` : note)
      : null
  ];
}

function updateStaffRowVisuals(row, st, note) {
  if (!row || !row.isConnected) return;
  row.classList.toggle('wd-att__row--absent', st === 'absent');
  const wrap = row.querySelector('.wd-att__stwrap');
  if (!wrap) return;
  wrap.replaceChildren(...staffStBits(st, note).filter(Boolean));
  pulse(wrap.querySelector('.badge'));
}

function patchStaffBlockBadge(staffId, st) {
  if (!canManage()) return;
  const block = currentContainer?.querySelector?.(`.wd-block[data-staff-id="${staffId}"]`);
  const wrap = block?.querySelector?.('.wd-block__stwrap');
  if (!wrap) return;
  wrap.replaceChildren(...(st ? [el('span', { class: `badge badge--${STAFF_STATUS_BADGE[st]}`, title: 'وضعیت حضور امروز' }, STAFF_STATUS_LABEL[st])] : []));
  pulse(wrap.querySelector('.badge'));
}

/* وصلهٔ نقطهٔ تایم‌لاین و کلاس کارت نوبت بر اساس وضعیت تازهٔ حضورها */
function patchApptVisuals(apptId) {
  if (!currentContainer) return;
  const appt = findAppt(apptId);
  const item = currentContainer.querySelector(`.wd-tl__item[data-appt-id="${apptId}"]`);
  if (!item || !appt) return;
  const dotKey = attStateOf(appt);
  const dot = item.querySelector('.wd-tl__dot');
  if (dot && !dot.classList.contains('wd-tl__dot--now')) {
    dot.className = `wd-tl__dot ${ATT_DOT[dotKey] ?? 'wd-tl__dot--planned'}${appt.status === 'cancelled' ? ' wd-tl__dot--cancelled' : ''}`;
  }
  const cardEl = item.querySelector('.wd-appt');
  if (cardEl) {
    cardEl.classList.toggle('is-attended', dotKey === 'completed');
    cardEl.classList.toggle('is-noshow', dotKey === 'no_show');
  }
}

/* ثبت وضعیت یک دانش‌آموز روی دادهٔ بورد + وصلهٔ فوری DOM — prev را برمی‌گرداند */
function applyStudentStatusInBoard(apptId, studentId, status) {
  const appt = findAppt(apptId);
  if (!appt || !currentBoard) return null;
  const s = (appt.students ?? []).find((x) => x.studentId === studentId);
  if (!s) return null;
  const prev = s.attendance;
  s.attendance = status;
  recomputeSessionStats(currentBoard);
  const rowEl = currentContainer?.querySelector?.(`.wd-appt[data-appt-id="${apptId}"] .wd-appt__student[data-student-id="${studentId}"]`);
  if (rowEl) {
    const markEl = rowEl.querySelector('.wd-mark'); // ۱.۲۵.۰: نشان فقط روی ردیف لغوشده می‌ماند
    if (markEl) {
      markEl.className = `wd-mark wd-mark--${SESSION_STATUS_CLS[status] ?? 'muted'}`;
      markEl.textContent = SESSION_STATUS_LABEL[status] ?? status;
      pulse(markEl);
    }
    rowEl.querySelectorAll('.wd-appt__sbtn').forEach((b) => {
      const on = b.dataset.status === status;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  patchApptVisuals(apptId);
  refreshApptChips();
  refreshCalCount();
  return prev;
}

function removeApptFromBoard(apptId) {
  if (!currentBoard) return null;
  for (const c of currentBoard.staff ?? []) {
    const i = (c.appointments ?? []).findIndex((a) => a.id === apptId);
    if (i >= 0) { c.appointments.splice(i, 1); return c; }
  }
  const j = (currentBoard.unassigned ?? []).findIndex((a) => a.id === apptId);
  if (j >= 0) {
    currentBoard.unassigned.splice(j, 1);
    const badge = currentContainer?.querySelector?.('.wd-block--other .wd-block__head .badge');
    if (badge) badge.textContent = `${fa(currentBoard.unassigned.length)} نوبت`;
  }
  return null;
}

function resolveOverdueRow(apptId, studentId) {
  if (!currentContainer) return;
  const row = currentContainer.querySelector(`.att-row[data-appt-id="${apptId}"][data-student-id="${studentId}"]`);
  if (!row) return;
  const card = row.closest('.card');
  const rowsLeft = card ? card.querySelectorAll('.att-row').length : 0;
  collapseRemove(row);
  if (overdueMeta && overdueMeta.total > 0) overdueMeta.total -= 1;
  refreshOverdueBadge(card);
  if (card && rowsLeft <= 1) collapseRemove(card); // آخرین مورد بود — کل کارت جمع می‌شود
}

function refreshOverdueBadge(card) {
  const badge = card?.querySelector?.('.card__head .badge');
  if (badge && overdueMeta) badge.textContent = `${fa(overdueMeta.total)} نوبت`;
}

let assessmentSyncTimer = null;
function syncAssessmentsLight() { // فقط شمارندهٔ «ارزیابی امروز» — بدون بازسازی نما
  if (assessmentSyncTimer) clearTimeout(assessmentSyncTimer);
  assessmentSyncTimer = setTimeout(async () => {
    assessmentSyncTimer = null;
    if (!currentContainer?.isConnected || !currentBoard) return;
    try {
      const fresh = await api.get(`/api/working-day${qs({ date: local.date })}`).then((r) => r.data);
      if (!currentContainer?.isConnected || !currentBoard) return;
      currentBoard.assessmentsToday = fresh.assessmentsToday;
      refreshApptChips();
      syncBoardJson();
    } catch { /* بی‌اهمیت */ }
  }, 700);
}

function rerender() {
  if (currentContainer) renderWorkingDay(currentContainer);
}

let renderSeq = 0; // — گارد نسل رندر (الگوی router.js): پاسخِ دیرِ تاریخ قبلی اجازه ندارد بورد تاریخ تازه را بازنویسی کند

const REFRESH_MS = 30000;
let refreshTimer = null;
let lastBoardJson = null;

function stopRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function isBoardBusy() {
  if (document.hidden) return true;
  if (inflight.size > 0) return true; // پچ جراحی در جریان است — دست نزن
  if (document.querySelector('.modal-overlay')) return true; // مودال بازی
  const noteInput = document.querySelector('.wd-note-form__input');
  if (noteInput && (noteInput.value || '').trim().length > 0) return true; // در حال تایپ توضیح
  return false;
}

async function softRefresh() {
  if (local.date !== tehranTodayYmd()) return; // فقط امروز
  if (!currentContainer || !currentContainer.isConnected) { stopRefresh(); return; } // از view خارج شدیم
  if (isBoardBusy()) return; // مزاحم نشو — دورهٔ بعد
  try {
    const board = await api.get(`/api/working-day${qs({ date: local.date })}`).then((r) => r.data);
    const json = JSON.stringify(board);
    if (json === lastBoardJson) return; // بدون تغییر — بدون ری‌رندر
    monthApptsCache.clear(); // — بورد عوض شده؛ نقاط تقویم هم از دادهٔ تازه پر شوند
    await renderWorkingDay(currentContainer, { silent: true, keepScroll: true });
  } catch {
  }
}

function startRefresh() {
  stopRefresh();
  refreshTimer = setInterval(softRefresh, REFRESH_MS);
}

document.addEventListener('routechange', (e) => {
  const path = e.detail?.path ?? '';
  if (!String(path).startsWith('working-day')) stopRefresh();
});

const pad2 = (n) => (n < 10 ? `0${n}` : String(n));

function jalaliOfYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return toJalali(y, m, d);
}

function ymdOfJalali(jy, jm, jd) {
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
}

function shiftJalaliMonth(jy, jm, delta) {
  let m = jm + delta;
  let y = jy;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  return { jy: y, jm: m };
}

export async function renderWorkingDay(container, opts = {}) {
  const mySeq = ++renderSeq; // — هر ناوبری/به‌روزرسانی یک نسل تازه؛ دو کلیک سریع نباید بوردِ تاریخ کهنه را رنگ کند
  currentContainer = container;
  currentBoard = null;
  stopRefresh(); // جلوگیری از تایمرهای انباشته
  const scrollY = opts.keepScroll ? window.scrollY : null;

  if (!opts.silent) container.replaceChildren(skeletonState('cards', 3));

  let board;
  try {
    board = await api.get(`/api/working-day${qs({ date: local.date })}`).then((r) => r.data);
  } catch (err) {
    if (mySeq !== renderSeq) return; // — ناوبری/رندر تازه‌تر در جریان است؛ خطای نسخهٔ مرده رنگ نگیرد
    container.replaceChildren(errorState(err, () => renderWorkingDay(container)));
    return;
  }
  if (mySeq !== renderSeq) return; // — پاسخ بوردِ کهنه: تاریخ/رندر عوض شده — دور بریز
  lastBoardJson = JSON.stringify(board); // مرجع مقایسهٔ auto-refresh
  currentBoard = board; // مرجع وصله‌های جراحی (جریان پیوسته)

  const pageHead = el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-head__title' }, 'روز کاری'),
      el('div', { class: 'page-head__desc' },
        isTherapist()
          ? 'تقویم و کارت جلسات خودتان — حضور و غیاب و گزارش، همه در یک نگاه'
          : 'تقویم، حضور و غیاب همکاران، نوبت‌ها و سنجش — همه در یک نگاه'
      )
    ),
    el('button', { class: 'btn btn--ghost btn--sm', onclick: () => rerender() }, icon('refresh', 16), 'به‌روزرسانی')
  );

  const flow = el('div', { class: 'wd-flow' });
  const sanjSlot = el('div', {}); // کارت ۴ — ویجت سنجش (async)
  const auxSlot = el('div', { class: 'wd-aux' }); // پایین: عقب‌افتاده‌ها + لیست انتظار

  flow.append(
    calCard(board),      // کارت ۱
    ...(!isTherapist() ? [attCard(board)] : []), // کارت ۲ — فقط دفتر
    apptsCard(board),    // کارت ۳
    ...(!isTherapist() ? [sanjSlot] : []),       // کارت ۴ (پر شدن async) — فقط دفتر
    notesCard(board),    // کارت ۵
    auxSlot
  );

  const content = el('div', {}, pageHead, flow);
  container.replaceChildren(content);
  if (scrollY !== null) window.scrollTo({ top: scrollY });

  fillCalDots();

  if (canManage()) {
    import('./screening.js')
      .then(({ renderScreeningDayWidget }) => renderScreeningDayWidget(sanjSlot, local.date))
      .catch(() => {});
  }
  import('../waitlist.js').then(({ renderWaitlistBoardWidget }) => renderWaitlistBoardWidget(auxSlot)).catch(() => {});
  drawOverdue(auxSlot, board);

  if (board.isToday) startRefresh();
  else stopRefresh();
}

function chip(num, label, tone, title) {
  if (!num || num <= 0) return null;
  return el('div', { class: `wd-opschip wd-opschip--${tone}`, title: title || label },
    el('b', {}, fa(num)),
    el('span', {}, label)
  );
}

function calCard(board) {
  const view = local.viewJ ?? jalaliOfYmd(local.date);
  const firstYmd = ymdOfJalali(view.jy, view.jm, 1);
  const firstWd = iranianWeekdayOfYmd(firstYmd);
  const monthLen = jalaliMonthLength(view.jy, view.jm);

  const cells = [];
  for (let i = 0; i < firstWd; i++) cells.push(el('span', { class: 'wd-cal__cell wd-cal__cell--blank' }));
  for (let d = 1; d <= monthLen; d++) {
    const ymd = ymdOfJalali(view.jy, view.jm, d);
    const isSel = ymd === local.date;
    const isToday = ymd === tehranTodayYmd();
    cells.push(el('button', {
      class: `wd-cal__cell${isSel ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`,
      type: 'button',
      'aria-label': formatJalaliFull(ymd),
      'aria-pressed': isSel ? 'true' : 'false',
      dataset: { ymd }, // — لنگر وصله‌کردن نقاط رنگی بعد از گرفتن دادهٔ ماه
      onclick: () => { local.date = ymd; local.viewJ = null; rerender(); }
    }, fa(d)));
  }

  const grid = el('div', { class: 'wd-cal__grid', role: 'group', 'aria-label': 'تقویم ماه' }, /* S1-24: خانه‌ها دکمهٔ واقعی‌اند؛ role=grid بدون سطر/gridcell نقض ARIA بود */
    ...WEEKDAY_ABBRS.map((w, i) => el('span', { class: 'wd-cal__dow', title: WEEKDAY_NAMES[i] }, w)),
    cells
  );

  const prevM = shiftJalaliMonth(view.jy, view.jm, -1);
  const nextM = shiftJalaliMonth(view.jy, view.jm, 1);
  const monthNav = el('div', { class: 'wd-cal__month' },
    el('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': 'ماه قبل', title: 'ماه قبل', onclick: () => { local.viewJ = prevM; rerender(); } }, icon('chevR', 16)),
    el('b', {}, `${JALALI_MONTHS[view.jm - 1]} ${fa(view.jy)}`),
    el('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': 'ماه بعد', title: 'ماه بعد', onclick: () => { local.viewJ = nextM; rerender(); } }, icon('chevL', 16))
  );

  const quick = el('div', { class: 'wd-cal__quick' },
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { local.date = addDaysYmd(local.date, -1); local.viewJ = null; rerender(); } }, icon('chevR', 15), 'روز قبل'),
    el('button', { class: 'btn btn--soft btn--sm', type: 'button', disabled: board.isToday, title: board.isToday ? 'همین الان روی امروز هستید' : 'پرش به امروز', onclick: () => { local.date = tehranTodayYmd(); local.viewJ = null; rerender(); } }, 'برو به امروز'),
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { local.date = addDaysYmd(local.date, 1); local.viewJ = null; rerender(); } }, 'روز بعد', icon('chevL', 15))
  );

  const rel = relativeDayLabel(local.date);
  return el('div', { class: 'card wd-cal-card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('calendar', 16), 'تقویم'),
      quick
    ),
    el('div', { class: 'card__body' },
      el('div', { class: 'wd-cal__bar' },
        el('b', { class: 'wd-cal__date' }, formatJalaliFull(local.date)),
        board.isToday
          ? el('span', { class: 'badge badge--success' }, 'امروز')
          : el('span', { class: 'badge badge--neutral' }, rel ?? formatJalaliNumeric(local.date)),
        el('span', { class: 'wd-cal__count', title: 'جلسه‌های این روز (بدون لغوشده)' }, icon('board', 13), `${fa(board.sessionStats.total)} جلسه`)
      ),
      el('div', { class: 'wd-cal__wrap' }, monthNav, grid)
    )
  );
}

const monthApptsCache = new Map(); // 'jy-jm' → { at, list }
const MONTH_APTS_TTL = 60000;

async function fetchMonthAppts(view) {
  const key = `${view.jy}-${view.jm}`;
  const hit = monthApptsCache.get(key);
  if (hit && Date.now() - hit.at < MONTH_APTS_TTL) return hit.list;

  const firstYmd = ymdOfJalali(view.jy, view.jm, 1);
  const lastYmd = ymdOfJalali(view.jy, view.jm, jalaliMonthLength(view.jy, view.jm));
  const params = { from: tehranDayRange(firstYmd).start, to: tehranDayRange(lastYmd).end };
  if (isTherapist()) params.staff_id = session.user?.staffId;

  let list = [];
  try {
    list = (await api.get(`/api/appointments${qs(params)}`)).data ?? [];
  } catch {
  }
  monthApptsCache.set(key, { at: Date.now(), list });
  return list;
}

async function fillCalDots() {
  const grid = currentContainer?.querySelector?.('.wd-cal__grid');
  if (!grid || !grid.isConnected) return;
  const view = local.viewJ ?? jalaliOfYmd(local.date);
  const list = await fetchMonthAppts(view);
  if (!grid.isConnected) return; // حین گرفتن داده، رندر عوض شده — این نسخه را دور بریز

  for (const old of grid.querySelectorAll('.wd-cal__dots')) old.remove();

  const byDay = new Map();
  for (const ap of list) {
    if (ap.status === 'cancelled') continue;
    const ymd = tehranYmdOfIso(ap.startAt);
    if (!byDay.has(ymd)) byDay.set(ymd, []);
    byDay.get(ymd).push(ap);
  }

  for (const [ymd, dayList] of byDay) {
    const cell = grid.querySelector(`.wd-cal__cell[data-ymd="${ymd}"]`);
    if (!cell) continue;

    const earliest = new Map();
    for (const ap of dayList) {
      const prev = earliest.get(ap.staffId);
      if (!prev || ap.startAt < prev) earliest.set(ap.staffId, ap.startAt);
    }
    const hues = [...earliest.entries()]
      .sort((x, y) => (x[1] < y[1] ? -1 : 1))
      .map(([id]) => staffHue(id));

    cell.appendChild(el('span', { class: 'wd-cal__dots', 'aria-hidden': 'true' },
      hues.slice(0, 3).map((h) => el('span', { class: `wd-cal__dot hue-${h}` })),
      hues.length > 3 ? el('span', { class: 'wd-cal__more' }, `+${fa(hues.length - 3)}`) : null
    ));
    cell.title = `${fa(jalaliOfYmd(ymd).jd)} ${JALALI_MONTHS[view.jm - 1]} — ${fa(dayList.length)} جلسه (${fa(hues.length)} درمانگر)`;
    /* S1-24: شمار جلسات در aria-label هم هست، نه فقط tooltip */
    cell.setAttribute('aria-label', `${formatJalaliFull(ymd)} — ${dayList.length ? `${fa(dayList.length)} جلسه` : 'بدون جلسه'}`);
  }
}

function attCard(board) {
  const canMark = board.isToday && canManage();

  const all = board.staff ?? [];
  const working = all.filter((c) => c.dayHours.length > 0);
  const off = all.filter((c) => c.dayHours.length === 0);

  const counts = { present: 0, absent: 0, late: 0, leave: 0, sick: 0, unmarked: 0 };
  for (const c of working) {
    const st = c.attendance?.status;
    if (st && counts[st] !== undefined) counts[st] += 1;
    else counts.unmarked += 1;
  }

  const rows = working.map((col) => attRow(col, board, canMark));

  const body = rows.length > 0
    ? el('div', { class: 'wd-att' }, rows)
    : el('div', { class: 'wd-att' },
        emptyState({ iconName: 'users', title: 'امروز شیفت‌داری ثبت نشده', hint: 'برنامهٔ هفتگی همکاران از ماژول «ساعات کاری» تنظیم می‌شود.' })
      );

  const offLine = off.length > 0
    ? el('div', { class: 'wd-att__off', title: 'این همکاران در برنامهٔ هفتگی امروز بازهٔ کاری ندارند و در فرایند حضور و غیاب نیستند' },
        icon('moon', 13),
        el('span', {}, `امروز شیفت ندارند (${fa(off.length)}): `, el('b', {}, off.map((c) => c.fullName).join('، ')))
      )
    : null;

  return el('div', { class: 'card wd-att-card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('users', 16), 'حضور و غیاب همکاران'),
      el('div', { class: 'wd-att__chips' },
        chip(counts.present, 'حاضر', 'success'),
        chip(counts.absent, 'غایب', 'error'),
        chip(counts.late, 'تأخیر', 'warn'),
        chip(counts.leave, 'مرخصی', 'accent'),
        chip(counts.sick, 'بیمار', 'sick'),
        chip(counts.unmarked, 'بدون ثبت', 'neutral')
      )
    ),
    el('div', { class: 'card__body' }, body, offLine)
  );
}

function attRow(col, board, canMark) {
  const st = col.attendance?.status;

  const seg = el('div', { class: 'att-seg wd-att__seg', role: 'group', 'aria-label': `وضعیت حضور ${col.fullName}` });
  const segBtns = new Map();
  for (const s of STAFF_STATUS) {
    const btn = el('button', {
      class: `att-seg__btn att-seg__btn--${s.cls}`,
      type: 'button',
      /* S1-25: به‌جای disabled واقعی، aria-disabled — دکمه فوکوس‌پذیر می‌ماند و دلیل در aria-label خوانده می‌شود */
      ...(canMark ? {} : { 'aria-disabled': 'true' }),
      'aria-label': canMark ? s.label : (board.isToday ? `${s.label} — فقط مدیر و منشی مجاز به ثبت هستند` : `${s.label} — ثبت حضور فقط برای امروز مجاز است`),
      title: canMark ? s.label : (board.isToday ? 'فقط مدیر و منشی مجاز به ثبت هستند' : 'ثبت حضور فقط برای امروز مجاز است'),
      /* جریان پیوسته: کلید همان لحظه فعال می‌شود؛ PUT در پس‌زمینه */
      onclick: (e) => markStaffAttendance(col, board, s.key, e.currentTarget, { seg, segBtns, row })
    }, s.label);
    btn.setAttribute('aria-pressed', 'false'); /* S1-25: وضعیت فعال مثل بقیهٔ سگمنت‌ها اعلام شود */
    segBtns.set(s.key, btn);
    seg.appendChild(btn);
  }
  if (st) {
    segBtns.get(st)?.classList.add('is-active');
    segBtns.get(st)?.setAttribute('aria-pressed', 'true');
  }
  else seg.classList.add('wd-seg--unset');

  const noteBtn = canMark
    ? el('button', {
        class: 'btn btn--ghost btn--icon btn--sm',
        type: 'button',
        'aria-label': `یادداشت حضور ${col.fullName}`,
        title: st === 'leave' || st === 'sick' ? 'یادداشت حضور (مثلاً مرخصی ساعتی)' : 'یادداشت حضور',
        onclick: () => openAttendanceNoteModal(col, board)
      }, icon('edit', 14))
    : null;

  const hoursChip = col.dayHours.length > 0
    ? el('span', { class: 'wd-hours', title: 'بازهٔ کاری این روز از برنامهٔ هفتگی' },
        icon('clock', 13),
        col.dayHours.map((h) => `${fa(minuteToLabel(h.startMinute))}–${fa(minuteToLabel(h.endMinute))}`).join(' ، ')
      )
    : null;

  const row = el('div', { class: `wd-att__row${st === 'absent' ? ' wd-att__row--absent' : ''}`, dataset: { staffId: col.staffId } },
    el('div', { class: 'staff-mini__avatar' }, col.fullName.trim().charAt(0)),
    el('div', { class: 'wd-att__who' },
      el('div', { class: 'wd-att__name' }, col.fullName),
      el('div', { class: 'wd-att__meta' }, statusBadge(col.role), hoursChip,
        el('span', { class: 'wd-att__stwrap' }, ...staffStBits(st, col.attendance?.note ?? null).filter(Boolean))
      )
    ),
    el('div', { class: 'wd-att__actions' }, seg, noteBtn)
  );
  return row;
}

/* جریان پیوسته — حضور همکار: سگمنت و بج‌ها همان لحظه عوض می‌شوند، PUT در پس‌زمینه؛ خطا = برگشت نرم */
async function markStaffAttendance(col, board, status, btn, bits = {}) {
  if (!(board.isToday && canManage())) return;
  const key = `staff:${col.staffId}`;
  if (inflight.has(key)) return;
  inflight.add(key);
  const { seg, segBtns, row } = bits;
  const prevAtt = col.attendance ?? null; // — کل شکل قبلی؛ برای برگشت نرم خطا
  const prevStatus = prevAtt?.status ?? null;
  const prevNote = prevAtt?.note ?? null;
  /* F12: دادهٔ بورد قبل از apply به‌روز شود — وگرنه refreshAttChips داخل apply چیپ‌ها را
     با وضعیت «قبلی» می‌شمارد و چیپ‌ها تا پایان PUT یک جهش عقب می‌مانند */
  col.attendance = { ...(prevAtt ?? {}), status, note: prevNote };
  const apply = (st) => {
    seg?.classList.toggle('wd-seg--unset', !st);
    if (segBtns) for (const [k, b] of segBtns) {
      b.classList.toggle('is-active', k === st);
      b.setAttribute('aria-pressed', k === st ? 'true' : 'false');
    }
    updateStaffRowVisuals(row, st, col.attendance?.note ?? prevNote);
    patchStaffBlockBadge(col.staffId, st);
    refreshAttChips();
  };
  apply(status);
  try {
    await api.put('/api/staff-attendance', { staff_id: col.staffId, date: board.date, status });
    toast(`${col.fullName}: ${STAFF_STATUS_LABEL[status]}`, 'success', 2200);
    syncBoardJson();
  } catch (err) {
    col.attendance = prevAtt; // — برگشت نرم به دادهٔ قبل؛ apply زیر چیپ‌ها و بج‌ها را هم برمی‌گرداند
    apply(prevStatus);
    toastError(err);
  } finally {
    inflight.delete(key);
  }
}

function apptsCard(board) {
  const ss = board.sessionStats;

  const selfId = session.user?.staffId ?? null;
  const staffBlocks = (board.staff ?? [])
    .filter((c) => !isTherapist() || c.staffId === selfId)
    .filter((c) => c.appointments.length > 0)
    .sort((a, b) => (a.appointments[0].startAt < b.appointments[0].startAt ? -1 : 1)) // جریان روز: زودترین نوبت اول
    .map((col) => staffBlock(col, board));

  const otherBlock = board.unassigned.length > 0 && !isTherapist() ? otherStaffBlock(board) : null;

  const body = (staffBlocks.length === 0 && !otherBlock)
    ? emptyState({
        iconName: 'calendar',
        title: isTherapist() ? 'امروز برای شما نوبتی ثبت نشده است' : 'امروز نوبتی ثبت نشده است',
        hint: isTherapist()
          ? 'نوبت‌های شما از «تقویم من» یا دفتر مرکز ثبت می‌شود.'
          : 'برای ثبت نوبت از پروندهٔ دانش‌آموز یا «تقویم نوبت‌ها» استفاده کنید.'
      })
    : el('div', { class: 'wd-blocks' }, staffBlocks, otherBlock);

  return el('div', { class: 'card wd-appts-card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('board', 16), isTherapist() ? 'جلسات من' : 'درمانگران و نوبت‌ها'),
      el('div', { class: 'wd-att__chips' },
        chip(ss.total, 'جلسه', 'primary', 'جلسه‌های این روز'),
        /* UX-ممیزی فاز ۳: دوازده چیپ آماری هم‌زمان سربرگ را پر می‌کرد —
           چیپ‌های صفر اطلاعی ندارند و فقط شلوغی‌اند؛ فقط شمارنده‌های غیرصفر رندر می‌شوند */
        ss.pending > 0 ? chip(ss.pending, 'بدون ثبت', 'neutral', 'جلسات بدون ثبت حضور دانش‌آموز') : null,
        ss.present > 0 ? chip(ss.present, 'حاضر', 'success') : null,
        ss.absent > 0 ? chip(ss.absent, 'غایب', 'error') : null,
        board.assessmentsToday > 0 ? chip(board.assessmentsToday, 'ارزیابی امروز', 'accent', 'گزارش‌های جلسهٔ ثبت‌شدهٔ امروز') : null
      )
    ),
    el('div', { class: 'card__body' }, body)
  );
}

function staffBlock(col, board) {
  const st = col.attendance?.status;
  const hoursChip = col.dayHours.length > 0
    ? el('span', { class: 'wd-hours', title: 'بازهٔ کاری این روز از برنامهٔ هفتگی' },
        icon('clock', 13),
        col.dayHours.map((h) => `${fa(minuteToLabel(h.startMinute))}–${fa(minuteToLabel(h.endMinute))}`).join(' ، ')
      )
    : el('span', { class: 'wd-hours wd-hours--off' }, 'بدون بازهٔ کاری');

  /* ۱.۲۵.۰ — رنگ درمانگر روی کل بلوک نشسته تا بج شمارش و حاشیهٔ کارت‌ها و آواتار سربرگ
     همه از یک جفت متغیر hue تغذیه شوند (وحدت رنگی سربرگ ↔ کارت‌ها) */
  return el('div', { class: `wd-block ${hueClass(col.staffId)}${st === 'absent' ? ' wd-block--absent' : ''}`, dataset: { staffId: col.staffId } },
    el('div', { class: 'wd-block__head' },
      el('div', { class: `staff-mini__avatar ${hueClass(col.staffId)}`, 'aria-hidden': 'true' }, col.fullName.trim().charAt(0)),
      el('div', { class: 'wd-block__title' },
        el('div', { class: 'wd-block__name' }, col.fullName),
        el('div', { class: 'wd-block__meta' },
          statusBadge(col.role),
          hoursChip,
          el('span', { class: 'wd-block__stwrap' },
            st && canManage()
              ? el('span', { class: `badge badge--${STAFF_STATUS_BADGE[st]}`, title: 'وضعیت حضور امروز' }, STAFF_STATUS_LABEL[st])
              : null
          )
        )
      ),
      el('div', { class: 'wd-block__stats' },
        el('span', { class: 'wd-block__count', title: 'تعداد نوبت‌های این درمانگر امروز (شامل لغوشده)' }, `${fa(col.appointments.length)} نوبت`)
      )
    ),
    timeline(col.appointments, board)
  );
}

function otherStaffBlock(board) {
  return el('div', { class: 'wd-block wd-block--other' },
    el('div', { class: 'wd-block__head' },
      el('div', { class: 'staff-mini__avatar staff-mini__avatar--alt' }, '؟'),
      el('div', { class: 'wd-block__title' },
        el('div', { class: 'wd-block__name' }, 'سایر نوبت‌ها'),
        el('div', { class: 'wd-block__meta' }, el('span', { class: 'cell-sub' }, 'بی‌صاحب یا همکار غیرفعال'))
      ),
      el('span', { class: 'badge badge--neutral' }, `${fa(board.unassigned.length)} نوبت`)
    ),
    timeline(board.unassigned, { isToday: false })
  );
}

function timeline(appointments, board) {
  const isToday = board.isToday;
  const nowLabel = isToday ? tehranTimeOfIso(new Date().toISOString()) : null;

  const items = [];
  let nowInserted = false;
  for (const a of appointments) {
    if (nowLabel && !nowInserted && tehranTimeOfIso(a.startAt) > nowLabel) {
      items.push(nowItem(nowLabel));
      nowInserted = true;
    }
    items.push(apptItem(a));
  }
  if (nowLabel && !nowInserted) items.push(nowItem(nowLabel)); // بعد از همهٔ نوبت‌ها

  return el('div', { class: 'wd-tl' }, items);
}

function apptItem(a) {
  const cancelled = a.status === 'cancelled';
  const dotKey = attStateOf(a);
  return el('div', { class: `wd-tl__item${cancelled ? ' wd-tl__item--cancelled' : ''}`, dataset: { apptId: a.id } },
    el('div', { class: 'wd-tl__time' },
      el('b', {}, fa(tehranTimeOfIso(a.startAt))), // ۱.۲۵.۰ — شروع پررنگ‌تر از پایان
      el('span', {}, `تا ${fa(tehranTimeOfIso(a.endAt))}`)
    ),
    el('div', { class: 'wd-tl__rail' },
      el('span', { class: `wd-tl__dot ${ATT_DOT[dotKey] ?? 'wd-tl__dot--planned'}${cancelled ? ' wd-tl__dot--cancelled' : ''}`, 'aria-hidden': 'true' })
    ),
    el('div', { class: 'wd-tl__body' }, apptCard(a))
  );
}

function nowItem(nowLabel) {
  return el('div', { class: 'wd-tl__item wd-tl__item--now' },
    el('div', { class: 'wd-tl__time' }),
    el('div', { class: 'wd-tl__rail' }, el('span', { class: 'wd-tl__dot wd-tl__dot--now', 'aria-hidden': 'true' })),
    el('div', { class: 'wd-tl__body' },
      el('div', { class: 'wd-tl__nowline' }, icon('clock', 12), `الان — ${fa(nowLabel)}`)
    )
  );
}

function wdApptStatusClass(a) {
  const st = attStateOf(a);
  if (st === 'completed') return ' is-attended';
  if (st === 'no_show') return ' is-noshow';
  return '';
}

function apptCard(a) {
  const cancelled = a.status === 'cancelled';
  const durMin = Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000);
  const stType = sessionTypeOf(a.sessionType);

  /* ۱.۲۵.۰ — بازطراحی کارت نوبت (فقط پیکربندی DOM، بدون تغییر منطق):
     ① نام دانش‌آموز خط اول و برجسته است؛ نوع خدمت/مدت/وضعیت در ردیف فرودی زیر آن
     ② چیپ‌های «۴۵ دقیقه» و «۱ دانش‌آموز» حذف شدند — مدت در ستون تایم‌لاین (شروع–پایان) و
        شمارش در خود ردیف‌ها دیده می‌شود؛ آواتار حرفی دانش‌آموز هم برداشته شد
     ③ سه دکمهٔ حاضر/تأخیر/غایب به یک سگمنت یکپارچه با وضعیت فعال در زمان رندر تبدیل شد
     ④ data-appt-id روی کارت نشست — وصله‌های جراحی جریان پیوسته (نشان حضور + پیش‌نمایش توضیح)
        تا ۱.۲۴.۰ انتخابگر مرده داشتند و درجا اعمال نمی‌شدند (رفع باگ واقعی) */
  const meta = el('div', { class: 'wd-appt__meta' },
    cancelled ? el('span', { class: 'badge badge--neutral' }, 'لغوشده') : null,
    stType ? el('span', { class: `st-chip st-chip--${stType.key}`, title: stType.hint }, stType.short) : null,
    el('span', { class: 'wd-appt__dur', title: 'مدت این نوبت' }, `${fa(Math.max(0, durMin))} دقیقه`),
    el('span', { class: 'spacer' }),
    el('button', {
      class: `btn btn--ghost btn--icon btn--sm${a.note ? ' has-note' : ''}`,
      type: 'button',
      'aria-label': 'توضیحات نوبت',
      title: a.note || 'افزودن/ویرایش توضیحات نوبت',
      onclick: () => openAppointmentNoteModal(a)
    }, icon('edit', 13)),
    canManage()
      ? el('button', {
          class: 'btn btn--ghost btn--icon btn--sm wd-appt__del',
          type: 'button',
          'aria-label': 'حذف نوبت',
          title: 'حذف کامل نوبت — برای ثبت اشتباه/تکراری',
          onclick: () => deleteAppointment(a)
        }, icon('trash', 13))
      : null
  );

  async function deleteAppointment(appt) {
    const ok = await confirmModal({
      title: 'حذف کامل نوبت',
      message: `نوبت ${fa(tehranTimeOfIso(appt.startAt))} به‌کلی از تقویم پاک می‌شود و در هیچ لیستی دیده نمی‌شود — برای ثبت‌های اشتباه یا تکراری. اگر جلسه برگزار شده حذف ممکن نیست. برگشت ندارد.`,
      confirmLabel: 'حذف کن',
      danger: true
    });
    if (!ok) return;
    try {
      await api.del(`/api/appointments/${appt.id}`);
      const col = removeApptFromBoard(appt.id);
      recomputeSessionStats(currentBoard);
      /* F14: بورد ممکن است حین DELETE بازسازی شده باشد؛ گرهٔ کهنه جداافتاده و no-op می‌شد —
         بعد از پاسخ، آیتم را از لنگر data-appt-id دوباره می‌گیریم */
      const item = currentContainer?.querySelector?.(`.wd-tl__item[data-appt-id="${appt.id}"]`);
      collapseRemove(item); // جریان پیوسته: آیتم همان لحظه جمع می‌شود — نه رفرش کل نما
      if (col) {
        const badge = currentContainer?.querySelector?.(`.wd-block[data-staff-id="${col.staffId}"] .wd-block__stats .badge`);
        if (badge) badge.textContent = `${fa(col.appointments.length)} نوبت`;
        if ((col.appointments ?? []).length === 0) {
          const block = currentContainer?.querySelector?.(`.wd-block[data-staff-id="${col.staffId}"]`);
          if (block) collapseRemove(block); // بلوک خالی مثل رندر تازه جمع می‌شود
        }
      }
      if ((currentBoard?.unassigned ?? []).length === 0) {
        const ob = currentContainer?.querySelector?.('.wd-block--other');
        if (ob) collapseRemove(ob);
      }
      refreshApptChips();
      refreshCalCount();
      syncBoardJson();
      toast('نوبت حذف شد', 'success');
    } catch (err) {
      toastError(err);
    }
  }

  const notePreview = a.note
    ? el('div', { class: 'wd-appt__note', title: a.note }, a.note.length > 90 ? `${a.note.slice(0, 90)}…` : a.note)
    : null;

  const studentRows = a.students.map((s) => {
    const cls = SESSION_STATUS_CLS[s.attendance] ?? 'muted';
    const segBtn = (status, sbtnCls, ic, label) => el('button', {
      class: `wd-appt__sbtn ${sbtnCls}${!cancelled && s.attendance === status ? ' is-active' : ''}`,
      type: 'button',
      dataset: { status },
      'aria-pressed': !cancelled && s.attendance === status ? 'true' : 'false',
      'aria-label': `${label} — ${s.name}`,
      title: `${label} — ${s.name}`,
      onclick: (e) => markStudent(a, s, status, e.currentTarget)
    }, icon(ic, 13));
    return el('div', { class: 'wd-appt__student', dataset: { studentId: s.studentId } },
      el('a', {
        class: 'wd-appt__sname',
        title: `پروفایل ${s.name}`,
        href: `#/students/${s.studentId}?tab=timeline`,
        onclick: (e) => e.stopPropagation()
      }, s.name),
      s.phone
        ? el('a', {
            class: 'wd-appt__sphone',
            href: `tel:${s.phone}`,
            title: `تماس با ولیّ ${s.name} — ${fa(s.phone)}`,
            'aria-label': `تماس با ولیّ ${s.name} — ${fa(s.phone)}`,
            onclick: (e) => e.stopPropagation()
          }, icon('phone', 12))
        : null,
      !cancelled && canCreateCaseEvents()
        ? el('button', {
            class: 'btn btn--ghost btn--icon btn--sm wd-appt__report',
            type: 'button',
            'aria-label': `گزارش جلسه — ${s.name}`,
            title: `گزارش جلسه — ${s.name} (فرم رسمی، متصل به همین جلسه)`,
            onclick: () => openSessionReport(a, s)
          }, icon('file', 12))
        : null,
      cancelled
        ? el('span', { class: `wd-mark wd-mark--${cls}` }, SESSION_STATUS_LABEL[s.attendance] ?? s.attendance)
        : el('span', { class: 'wd-appt__sactions', role: 'group', 'aria-label': `ثبت حضور ${s.name}` },
            segBtn('present', 'wd-appt__sbtn--ok', 'check', 'حاضر'),
            segBtn('late', 'wd-appt__sbtn--warn', 'clock', 'تأخیر'),
            segBtn('absent', 'wd-appt__sbtn--err', 'x', 'غایب')
          )
    );
  });

  return el('div', { class: `wd-appt${cancelled ? ' wd-appt--cancelled' : ''}${wdApptStatusClass(a)} ${hueClass(a.staffId)}`, dataset: { apptId: a.id } },
    studentRows.length > 0 ? el('div', { class: 'wd-appt__students' }, studentRows) : el('div', { class: 'wd-appt__student wd-appt__student--none' }, 'بدون دانش‌آموز'),
    meta,
    notePreview
  );
}

async function openSessionReport(appt, s) {
  try {
    const prof = await api.get(`/api/students/${s.studentId}`);
    openCaseEventForm({
      student: prof.data,
      appointmentId: appt.id,
      occurredYmd: tehranYmdOfIso(appt.startAt),
      onSaved: () => {
        toast('گزارش روی خط زمانی پرونده ثبت شد', 'success', 2400);
        syncAssessmentsLight(); // فقط چیپ «ارزیابی امروز» در پس‌زمینه — بدون بازسازی نما
      }
    });
  } catch (err) {
    toastError(err);
  }
}

/* جریان پیوسته — حضور دانش‌آموز: نشان همان لحظه عوض می‌شود، نقطهٔ تایم‌لاین و چیپ‌ها در جا پچ می‌شوند؛
   PATCH در پس‌زمینه می‌رود و در خطا همه‌چیز نرم برمی‌گردد. هیچ re-render کلی رخ نمی‌دهد. */
async function markStudent(appt, student, status, btn) {
  const key = `st:${appt.id}:${student.studentId}`;
  if (inflight.has(key)) return;
  inflight.add(key);
  const prev = applyStudentStatusInBoard(appt.id, student.studentId, status);
  try {
    await api.patch(`/api/attendance/${appt.id}/${student.studentId}`, { status });
    toast(`${student.name}: ${SESSION_STATUS_LABEL[status] ?? status}`, 'success', 2000);
    resolveOverdueRow(appt.id, student.studentId);
    syncBoardJson();
  } catch (err) {
    applyStudentStatusInBoard(appt.id, student.studentId, prev ?? 'pending');
    toastError(err);
  } finally {
    inflight.delete(key);
  }
}

function buildNoteEl(n) {
  const isSystem = n.kind === 'system'; // فاز ۱ — D2: تفکیک انسانی/سیستمی
  return el('div', { class: `wd-note${isSystem ? ' wd-note--system' : ''}`, dataset: { noteId: n.id } },
    isSystem ? el('div', { class: 'wd-note__kind' }, icon('bot', 12), 'سیستمی') : null,
    el('div', { class: 'wd-note__body' }, n.body),
    el('div', { class: 'wd-note__meta' },
      el('span', {}, n.creatorName),
      el('span', { class: 'wd-note__time' }, formatJalaliNumeric(tehranYmdOfIso(n.createdAt)) + ' · ساعت ' + fa(tehranTimeOfIso(n.createdAt))),
      !isSystem && canDeleteNotes()
        ? el('button', {
            class: 'btn btn--ghost btn--icon btn--sm',
            type: 'button',
            'aria-label': 'حذف توضیح',
            title: 'حذف (فقط مدیر)',
            /* جریان پیوسته: توضیح فوری جمع می‌شود؛ در خطای شبکه با undo برمی‌گردد */
            onclick: async (e) => {
              const btn = e.currentTarget;
              const ok = await confirmModal({
                title: 'حذف توضیح روز',
                message: 'این توضیح از لاگ روز حذف می‌شود. در لاگ ممیزی (audit) ثبت می‌ماند. ادامه می‌دهید؟',
                confirmLabel: 'حذف کن',
                danger: true
              });
              if (!ok) return;
              const noteEl = btn.closest('.wd-note');
              const cardEl = noteEl?.closest('.wd-notes-card');
              const rm = collapseRemove(noteEl);
              try {
                await api.del(`/api/working-day/notes/${n.id}`);
                const i = currentBoard?.notes?.findIndex((x) => x.id === n.id) ?? -1;
                if (i >= 0) currentBoard.notes.splice(i, 1);
                syncBoardJson();
                refreshNotesCount(cardEl);
                toast('توضیح حذف شد', 'success');
              } catch (err) {
                rm?.undo();
                toastError(err);
              }
            }
          }, icon('trash', 14))
        : null
    )
  );
}

function refreshNotesCount(cardEl) {
  if (!cardEl || !currentBoard) return;
  const badge = cardEl.querySelector('.card__head .badge');
  if (badge) badge.textContent = `${fa(currentBoard.notes.length)} ثبت`;
}

function appendNoteToBoard(note) {
  const cardEl = currentContainer?.querySelector?.('.wd-notes-card');
  if (!cardEl) return;
  const empty = cardEl.querySelector('.wd-notes--empty');
  if (empty) {
    empty.replaceWith(el('div', { class: 'wd-notes' }, buildNoteEl(note)));
    return;
  }
  const list = cardEl.querySelector('.wd-notes');
  if (!list) return;
  const elm = buildNoteEl(note);
  elm.classList.add('wd-note--fresh');
  list.appendChild(elm);
  pulse(elm);
  list.scrollTop = list.scrollHeight;
}

function notesCard(board) {
  const list = board.notes.length > 0
    ? el('div', { class: 'wd-notes' }, board.notes.map((n) => buildNoteEl(n)))
    : el('div', { class: 'wd-notes wd-notes--empty' }, 'برای این روز توضیحی ثبت نشده است');

  const addForm = canManage()
    ? el('div', { class: 'wd-note-form' },
        el('textarea', {
          class: 'input wd-note-form__input',
          rows: 3,
          placeholder: 'توضیح برای این روز کاری… (مثلاً: آقای رضایی مرخصی ساعتی دارد؛ جلسه اولی‌ها با تأخیر شروع شد)',
          maxlength: 2000
        }),
        el('button', {
          class: 'btn btn--primary btn--sm',
          type: 'button',
          onclick: async (e) => {
            const btn = e.currentTarget;
            const textarea = btn.parentElement.querySelector('textarea');
            const body = (textarea.value || '').trim();
            if (body.length < 2) {
              toast('متن توضیحات حداقل ۲ نویسه است', 'warning'); /* S1-23 */
              return;
            }
            btn.disabled = true;
            try {
              const res = await api.post('/api/working-day/notes', { date: board.date, body });
              const note = res?.data ?? null;
              if (note) {
                currentBoard?.notes?.push(note);
                syncBoardJson();
                appendNoteToBoard(note);
                refreshNotesCount(currentContainer?.querySelector?.('.wd-notes-card'));
              }
              textarea.value = ''; // حس پیوستگی: فرم فوراً خالی می‌شود و توضیح در جا می‌نشیند
              toast('توضیح ثبت شد', 'success');
            } catch (err) {
              toastError(err);
            } finally {
              btn.disabled = false; // — F11: بعد از موفقیت هم دکمه زنده بماند؛ ثبت توضیح زنجیره‌ای ممکن شود
            }
          }
        }, icon('plus', 15), 'افزودن توضیح')
      )
    : el('div', { class: 'hint-text' }, 'ثبت توضیحات روز فقط برای مدیر و منشی مجاز است.');

  return el('div', { class: 'card wd-notes-card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('edit', 16), 'توضیحات روز'),
      el('span', { class: 'badge badge--neutral' }, `${fa(board.notes.length)} ثبت`)
    ),
    el('div', { class: 'card__body' }, list, addForm)
  );
}

async function drawOverdue(slot, board) {
  let pending;
  try {
    pending = await api.get('/api/attendance/pending').then((r) => r.data);
  } catch {
    return; // اهمیتی ندارد — بورد نباید به‌خاطر آن شکست بخورد
  }
  if (pending.length === 0 || !slot.isConnected) return;
  overdueMeta = { total: pending.length }; // مرجع پچ فوری کارت

  const shown = pending.slice(0, 8);
  const card = el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('bell', 16), 'ثبت‌های عقب‌افتاده'),
      el('span', { class: 'badge badge--warning' }, `${fa(pending.length)} نوبت`)
    ),
    el('div', { class: 'card__body att-list' },
      shown.map((p) =>
        el('div', { class: 'att-row att-row--student', dataset: { apptId: p.appointmentId, studentId: p.studentId } },
          el('div', { class: 'att-row__id' },
            el('div', { class: 'staff-mini__avatar staff-mini__avatar--alt' }, p.studentName.trim().charAt(0)),
            el('div', {},
              el('div', { class: 'att-row__name' }, p.studentName),
              el('div', { class: 'att-row__meta' }, `${formatJalaliNumeric(p.startAt.slice(0, 10))} · ساعت ${fa(tehranTimeOfIso(p.startAt))}`)
            )
          ),
          el('div', { class: 'att-row__seg att-row__seg--actions' },
            el('button', { class: 'btn btn--sm btn--primary', type: 'button', onclick: (e) => markOverdue(p, 'present', e.currentTarget) }, icon('check', 15), 'حاضر'),
            el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', onclick: (e) => markOverdue(p, 'absent', e.currentTarget) }, icon('x', 15), 'غایب')
          )
        )
      ),
      pending.length > shown.length
        ? el('div', { class: 'hint-text', style: { marginTop: 'var(--sp-3)' } }, `و ${fa(pending.length - shown.length)} مورد دیگر — پس از ثبت همین‌ها به‌روزرسانی می‌شود`)
        : null
    )
  );
  slot.appendChild(card);
}

/* جریان پیوسته — عقب‌افتاده‌ها: ردیف فوری قفل/محو می‌شود، پس از موفقیت جمع و شمارندهٔ کارت پچ می‌شود */
async function markOverdue(p, status, btn) {
  const key = `ov:${p.appointmentId}:${p.studentId}`;
  if (inflight.has(key)) return;
  inflight.add(key);
  const row = btn?.closest('.att-row');
  const card = row?.closest('.card');
  const btns = row ? [...row.querySelectorAll('button')] : [];
  const rowsLeft = card ? card.querySelectorAll('.att-row').length : 0;
  btns.forEach((b) => { b.disabled = true; });
  row?.classList.add('is-busy');
  try {
    await api.patch(`/api/attendance/${p.appointmentId}/${p.studentId}`, { status });
    toast(`${p.studentName}: ${status === 'present' ? 'حاضر' : 'غایب'}`, 'success', 2200);
    applyStudentStatusInBoard(p.appointmentId, p.studentId, status); // اگر همین نوبت روی بورد امروز دیده می‌شود
    collapseRemove(row);
    if (overdueMeta && overdueMeta.total > 0) overdueMeta.total -= 1;
    refreshOverdueBadge(card);
    if (card && rowsLeft <= 1) collapseRemove(card); // آخرین مورد بود — کل کارت جمع می‌شود
    syncBoardJson();
  } catch (err) {
    btns.forEach((b) => { b.disabled = false; });
    row?.classList.remove('is-busy');
    toastError(err);
  } finally {
    inflight.delete(key);
  }
}

function openAttendanceNoteModal(col, board) {
  formModal({
    title: `یادداشت حضور — ${col.fullName}`,
    fields: [
      { name: 'note', label: 'یادداشت (اختیاری)', type: 'textarea', rows: 3, placeholder: 'مثلاً: مرخصی ساعتی با هماهنگی مدیر' }
    ],
    initial: { note: col.attendance?.note ?? '' },
    submitLabel: 'ذخیره',
    onSubmit: async (values) => {
      const status = col.attendance?.status ?? 'present';
      await api.put('/api/staff-attendance', {
        staff_id: col.staffId,
        date: board.date,
        status,
        note: values.note || undefined
      });
      col.attendance = { ...(col.attendance ?? { status }), status, note: values.note || null };
      /* جریان پیوسته: فقط همین ردیف در جا تعویض می‌شود — نه کل نما */
      const rowEl = currentContainer?.querySelector?.(`.wd-att__row[data-staff-id="${col.staffId}"]`);
      if (rowEl && rowEl.isConnected) rowEl.replaceWith(attRow(col, board, board.isToday && canManage()));
      refreshAttChips();
      syncBoardJson();
      toast('یادداشت ذخیره شد', 'success');
    }
  });
}

function openAppointmentNoteModal(appt) {
  formModal({
    title: 'توضیحات نوبت',
    fields: [
      { name: 'note', label: 'توضیحات (برای همین نوبت — در لاگ نوبت ثبت می‌شود)', type: 'textarea', rows: 4, placeholder: 'مثلاً: والدین در جریان‌اند؛ جلسه جبرانی هفته بعد گذاشته شود' }
    ],
    initial: { note: appt.note ?? '' },
    submitLabel: 'ذخیره توضیحات',
    onSubmit: async (values) => {
      const res = await api.patch(`/api/appointments/${appt.id}`, {
        note: values.note || '',
        version: appt.version
      });
      const fresh = res?.data;
      if (fresh?.version != null) appt.version = fresh.version; // برای ویرایش بعدی
      appt.note = values.note || '';
      /* جریان پیوسته: فقط پیش‌نمایش توضیح همین کارت پچ می‌شود (لنگر data-appt-id — ۱.۲۵.۰ زنده شد) */
      const cardEl = currentContainer?.querySelector?.(`.wd-appt[data-appt-id="${appt.id}"]`);
      if (cardEl) {
        const preview = cardEl.querySelector('.wd-appt__note');
        const editBtn = cardEl.querySelector('.wd-appt__meta .btn--icon:not(.wd-appt__del)');
        if (appt.note) {
          const text = appt.note.length > 90 ? `${appt.note.slice(0, 90)}…` : appt.note;
          if (preview) { preview.textContent = text; preview.title = appt.note; }
          else cardEl.querySelector('.wd-appt__meta')?.insertAdjacentElement('afterend', el('div', { class: 'wd-appt__note', title: appt.note }, text));
          if (editBtn) { editBtn.classList.add('has-note'); editBtn.title = appt.note; }
          pulse(cardEl.querySelector('.wd-appt__note'));
        } else {
          preview?.remove();
          if (editBtn) { editBtn.classList.remove('has-note'); editBtn.title = 'افزودن/ویرایش توضیحات نوبت'; }
        }
      }
      syncBoardJson();
      toast('توضیحات نوبت ذخیره شد', 'success');
    }
  });
}
