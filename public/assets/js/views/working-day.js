/**
 * نمای بورد روز کاری
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// views/working-day.js — بازطراحی کامل ماژول «روز کاری» — چیدمان عمودی کارت‌به‌کارت
//
// ساختار جدید (به ترتیب صریح کاربر):
// کارت ۱ — تقویم: تقویم ماه جلالی با انتخاب روز با یک کلیک + ناوبری سریع
// (روز قبل/برو به امروز/روز بعد + ماه قبل/ماه بعد)
// کارت ۲ — حضور و غیاب همکاران: کوچک و فشرده؛ فقط همکارانی که امروز شیفت دارند
// (بازهٔ کاری در برنامهٔ هفتگی) وارد فرایند حضور و غیاب می‌شوند؛
// بقیه فقط یک خط اطلاع‌رسانی در پانویس کارت هستند — بدون هیچ دکمهٔ حضوری
// کارت ۳ — درمانگران و نوبت‌ها: تایم‌لاین عمودی به‌ازای هر درمانگر (به ترتیب
// زودترین نوبت) — خط «الان» (تایم‌لاین محبوب) حفظ شده است؛
// ثبت حضور/غیاب دانش‌آموز و اکشن‌های عملیاتی هر نوبت فقط روی خودِ کارت
// نوبت است (حذف صف تکراری ۶۰دقیقه و منوی ⋯ — «یک جا، نه چند جا»)
// کارت ۴ — سنجش‌های این روز (ویجت ماژول سنجش روزانه)
// کارت ۵ — توضیحات روز (لاگ append-only مدیر/منشی)
// پایین — ثبت‌های عقب‌افتاده (روزهای گذشته) + ویجت لیست انتظار
//
// رفع شکایت «چند بار حضور و غیاب می‌گیرد»: با یک ضربه روی «آمد»/«نیامد»، حضورِ
// دانش‌آموزانِ بدونِ ثبتِ همان نوبت هم خودکار ثبت می‌شود (از مسیر رسمی
// PATCH /api/attendance — با audit و اعلان غیبت )؛ ثبت دستی تک‌تک دانش‌آموزان
// فقط برای استثناها (مثلاً یکی از دو نفر نیامد) روی همان کارت باقی می‌ماند.
//
// حفظ‌شده از نسخه‌های قبل: auto-refresh نرم هر ۳۰ ثانیه (فقط امروز، بدون مودال/تایپ)،
// پرامپت گزارش جلسه پس از «اتمام جلسه»، ساخت پیگیری غیبت پس از «نیامد»، تماس سریع
// ولیّ، یادداشت حضور همکار، یادداشت نوبت، حذف توضیح روز (فقط مدیر).

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
import { el, icon, toast, toastError, loadingState, skeletonState, errorState, emptyState, statusBadge, formModal, confirmModal, openModal } from '../ui.js';
import { hueClass, staffHue } from '../staff-hue.js'; // — رنگ ثابت هر درمانگر روی کارت نوبت
import { sessionTypeOf } from '../session-type.js'; // — نوع جلسه (جدول ۴)
import { openCaseEventForm, canCreateCaseEvents } from '../case-events.js';
import { session } from '../state.js';

const local = { date: tehranTodayYmd(), viewJ: null }; // viewJ: ماه نمایش تقویم {jy, jm}
let currentContainer = null;

// تأخیر (کهربایی) اضافه شد؛ بیماری بنفش، مرخصی آبی — رنگ‌ها متمایز
const STAFF_STATUS = [
  { key: 'present', label: 'حاضر', cls: 'ok' },
  { key: 'absent', label: 'غایب', cls: 'err' },
  { key: 'late', label: 'تأخیر', cls: 'late' },
  { key: 'leave', label: 'مرخصی', cls: 'info' },
  { key: 'sick', label: 'بیماری', cls: 'sick' }
];

const STAFF_STATUS_LABEL = { present: 'حاضر', absent: 'غایب', late: 'تأخیر', leave: 'مرخصی', sick: 'بیماری' };
// مرخصی آبی و بیماری بنفش (قبلاً هر دو warning بودند و از هم تفکیک نمی‌شدند)
const STAFF_STATUS_BADGE = { present: 'success', absent: 'error', late: 'warning', leave: 'info', sick: 'sick' };
const SESSION_STATUS_CLS = { present: 'ok', late: 'warn', absent: 'err', pending: 'muted', cancelled: 'muted' };
const SESSION_STATUS_LABEL = { present: 'حاضر', late: 'تأخیر', absent: 'غایب', pending: 'در انتظار', cancelled: 'لغو' };

// فاز ۱ — ماتریس ترنزیشن عملیاتی — قرینه D1 در src/domain/appointment-core/pure.ts
const OPS_LABEL = { checked_in: 'آمد', delayed: 'تأخیر', in_session: 'در جلسه', completed: 'انجام شد', no_show: 'نیامد' };
const OPS_ACTIONS = {
  none: [
    { to: 'checked_in', label: 'آمد', cls: 'primary' },
    { to: 'delayed', label: 'تأخیر', cls: 'ghost' },
    { to: 'no_show', label: 'نیامد', cls: 'danger-ghost' }
  ],
  checked_in: [
    { to: 'in_session', label: 'شروع جلسه', cls: 'primary' },
    { to: 'no_show', label: 'نیامد', cls: 'danger-ghost' }
  ],
  delayed: [
    { to: 'checked_in', label: 'آمد', cls: 'primary' },
    { to: 'in_session', label: 'شروع جلسه', cls: 'ghost' },
    { to: 'no_show', label: 'نیامد', cls: 'danger-ghost' }
  ],
  in_session: [
    { to: 'completed', label: 'اتمام جلسه', cls: 'primary' }
  ],
  completed: [],
  no_show: []
};

// ترتیب نمایش خلاصهٔ عملیاتی سربرگ بلوک درمانگر (فقط غیرصفرها، حداکثر ۳ پیل)
const OPS_STAT_ORDER = ['none', 'checked_in', 'delayed', 'in_session', 'completed', 'no_show'];

// رنگ گرهٔ تایم‌لاین بر اساس وضعیت عملیاتی
const OPS_DOT = {
  none: 'wd-tl__dot--planned',
  checked_in: 'wd-tl__dot--checked_in',
  delayed: 'wd-tl__dot--delayed',
  in_session: 'wd-tl__dot--in_session',
  completed: 'wd-tl__dot--completed',
  no_show: 'wd-tl__dot--no_show'
};

function canManage() {
  return session.user?.role === 'manager' || session.user?.role === 'secretary';
}

// درمانگر: کپی روز کاری با کارت خودش (سرور بورد را نسبت به خودش scope می‌کند)
function isTherapist() {
  return session.user?.role === 'therapist';
}

/** — عملیات بوردی (آمد/شروع/اتمام/نیامد) — دفتر روی همه، درمانگر روی کارت خودش */
function canOperate() {
  return canManage() || isTherapist();
}

function canDeleteNotes() {
  return session.user?.role === 'manager';
}

// فاز ۳ — غیبت‌هایی که برایشان پیگیری ساخته شده (گارد دوباره‌سازی در همین نشست)
const absenceFollowUpDone = new Set();

function rerender() {
  if (currentContainer) renderWorkingDay(currentContainer);
}

// ─────────────── auto-refresh نرم (فاز ۱ §7.7) ───────────────

const REFRESH_MS = 30000;
let refreshTimer = null;
let lastBoardJson = null;

function stopRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

/** درست پس از رندر — صفحهٔ بازی/حالت ویرایش نباید زیر پای کاربر عوض شود */
function isBoardBusy() {
  if (document.hidden) return true;
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
    /* بی‌صدا — دورهٔ بعد تلاش می‌شود */
  }
}

function startRefresh() {
  stopRefresh();
  refreshTimer = setInterval(softRefresh, REFRESH_MS);
}

// خروج از view (routechange بعد از رندر fire می‌شود) — تایمر فقط برای همین صفحه است
document.addEventListener('routechange', (e) => {
  const path = e.detail?.path ?? '';
  if (!String(path).startsWith('working-day')) stopRefresh();
});

// ─────────────── کمکی‌های تقویم جلالی ───────────────

const pad2 = (n) => (n < 10 ? `0${n}` : String(n));

/** YYYY-MM-DD میلادی → {jy, jm, jd} جلالی */
function jalaliOfYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return toJalali(y, m, d);
}

/** {jy, jm, jd} جلالی → YYYY-MM-DD میلادی */
function ymdOfJalali(jy, jm, jd) {
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
}

/** ماه جلالی ± delta (با لف سال) */
function shiftJalaliMonth(jy, jm, delta) {
  let m = jm + delta;
  let y = jy;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  return { jy: y, jm: m };
}

// ─────────────── رندر اصلی ───────────────

export async function renderWorkingDay(container, opts = {}) {
  currentContainer = container;
  stopRefresh(); // جلوگیری از تایمرهای انباشته
  const scrollY = opts.keepScroll ? window.scrollY : null;

  if (!opts.silent) container.replaceChildren(skeletonState('cards', 3));

  let board;
  try {
    board = await api.get(`/api/working-day${qs({ date: local.date })}`).then((r) => r.data);
  } catch (err) {
    container.replaceChildren(errorState(err, () => renderWorkingDay(container)));
    return;
  }
  lastBoardJson = JSON.stringify(board); // مرجع مقایسهٔ auto-refresh

  const pageHead = el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-head__title' }, 'روز کاری'),
      el('div', { class: 'page-head__desc' },
        isTherapist()
          ? 'تقویم و کارت جلسات خودتان — حضور و غیاب، وضعیت جلسه و گزارش، همه در یک نگاه'
          : 'تقویم، حضور و غیاب همکاران، نوبت‌ها و سنجش — همه در یک نگاه'
      )
    ),
    el('button', { class: 'btn btn--ghost btn--sm', onclick: () => rerender() }, icon('refresh', 16), 'به‌روزرسانی')
  );

  // چیدمان عمودی کارت‌به‌کارت — جایگزین چیدمان دو ستونی قدیمی
  // درمانگر: بدون کارت حضور همکاران و سنجش دفتری؛ فقط تقویم + کارت خودش + توضیحات روز
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

  // نقاط رنگی تقویم: ناهمگام و بی‌صدا؛ بعد از اولین رسم، سلول‌های همین رندر را وصله می‌کند
  fillCalDots();

  // فهرست سنجش‌های همان روز (ابزار دفتر؛ خطاها ویجت را می‌شکند نه بورد را)
  if (canManage()) {
    import('./screening.js')
      .then(({ renderScreeningDayWidget }) => renderScreeningDayWidget(sanjSlot, local.date))
      .catch(() => {});
  }
  // فاز W — ویجت کوچک لیست انتظار
  import('../waitlist.js').then(({ renderWaitlistBoardWidget }) => renderWaitlistBoardWidget(auxSlot)).catch(() => {});
  // صف عقب‌افتاده‌ها (روزهای گذشته) — حفظ از
  drawOverdue(auxSlot, board);

  // فاز ۱ — به‌روزرسانی خودکار فقط روی ورک‌فلوی «امروز»
  if (board.isToday) startRefresh();
  else stopRefresh();
}

// ─────────────── چیپ فشردهٔ آمار (سربرگ کارت‌ها) ───────────────

/** چیپ عدد+برچسب؛ شرح کامل در title — چیپ صفر رندر نمی‌شود (قاعده ) */
function chip(num, label, tone, title) {
  if (!num || num <= 0) return null;
  return el('div', { class: `wd-opschip wd-opschip--${tone}`, title: title || label },
    el('b', {}, fa(num)),
    el('span', {}, label)
  );
}

// ─────────────── کارت ۱ — تقویم ───────────────

function calCard(board) {
  // ماه نمایشی: viewJ اگر کاربر ماه را عوض کرده، وگرنه ماهِ روز انتخابی
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

  const grid = el('div', { class: 'wd-cal__grid', role: 'grid' },
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

  // ناوبری سریع روزی — حفظ از نوار روز قدیمی
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

// ─────────────── نقاط رنگی تقویم («تقویم‌ها چیزی نشان ندهند» رفع می‌شود) ───────────────

/** کش نوبت‌های هر ماهِ نمایشی — کلید «jy-jm»؛ جابه‌جایی سریع بین ماه‌ها دوباره نمی‌گیرد.
 * هر مدخل با TTL کوتاه تازه می‌شود و با هر تغییر بورد (auto-refresh) کلاً خالی می‌شود. */
const monthApptsCache = new Map(); // 'jy-jm' → { at, list }
const MONTH_APTS_TTL = 60000;

/** نوبت‌های ماه نمایشی تقویم (from/to میلادیِ ابتدا و انتهای ماه جلالی) */
async function fetchMonthAppts(view) {
  const key = `${view.jy}-${view.jm}`;
  const hit = monthApptsCache.get(key);
  if (hit && Date.now() - hit.at < MONTH_APTS_TTL) return hit.list;

  const firstYmd = ymdOfJalali(view.jy, view.jm, 1);
  const lastYmd = ymdOfJalali(view.jy, view.jm, jalaliMonthLength(view.jy, view.jm));
  const params = { from: tehranDayRange(firstYmd).start, to: tehranDayRange(lastYmd).end };
  // درمانگر فقط نقطه‌های جلسه‌های خودش را می‌بیند (هم‌سو با scope بورد)
  if (isTherapist()) params.staff_id = session.user?.staffId;

  let list = [];
  try {
    list = (await api.get(`/api/appointments${qs(params)}`)).data ?? [];
  } catch {
    /* بی‌صدا — تقویم موقتاً بدون نقطه می‌ماند؛ دورهٔ بعد تلاش می‌شود */
  }
  monthApptsCache.set(key, { at: Date.now(), list });
  return list;
}

/**
 * نقاط رنگی زیر شمارهٔ هر روز: حداکثر ۳ نقطه (هر درمانگرِ آن روز یک نقطه،
 * به ترتیب زودترین نوبت) + «+N» اگر درمانگر بیشتری باشد. نوبت‌های لغوشده
 * کلاً نادیده گرفته می‌شوند. بعد از هر رندر صدا زده می‌شود و فقط داخل سلول‌های
 * آماده (dataset.ymd) وصله می‌کند — ری‌رندر کامل نمی‌کند تا با auto-refresh
 * و اسکرول نجنگد. idempotent است: نقاط قبلی پاک و از نو گذاشته می‌شوند.
 */
async function fillCalDots() {
  const grid = currentContainer?.querySelector?.('.wd-cal__grid');
  if (!grid || !grid.isConnected) return;
  const view = local.viewJ ?? jalaliOfYmd(local.date);
  const list = await fetchMonthAppts(view);
  if (!grid.isConnected) return; // حین گرفتن داده، رندر عوض شده — این نسخه را دور بریز

  // پاک‌سازی نقاط قبلی — فراخوانی دوباره باید بی‌اثر (idempotent) باشد
  for (const old of grid.querySelectorAll('.wd-cal__dots')) old.remove();

  // روز → نوبت‌های غیرلغوشدهٔ آن روز
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

    // زودترین نوبتِ هر درمانگر → ترتیب نقاط همان است
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
    // مثل «۱۴ آبان — ۵ جلسه (۲ درمانگر)» — راهنمای هاور بدون شلوغی
    cell.title = `${fa(jalaliOfYmd(ymd).jd)} ${JALALI_MONTHS[view.jm - 1]} — ${fa(dayList.length)} جلسه (${fa(hues.length)} درمانگر)`;
  }
}

// ─────────────── کارت ۲ — حضور و غیاب همکاران ───────────────

function attCard(board) {
  const canMark = board.isToday && canManage();

  // قاعدهٔ جدید: فقط همکارانی که امروز شیفت دارند (بازهٔ کاری در برنامهٔ هفتگی)
  // وارد فرایند حضور و غیاب می‌شوند؛ بقیه فقط یک خط اطلاع‌رسانی در پانویس کارت‌اند.
  const all = board.staff ?? [];
  const working = all.filter((c) => c.dayHours.length > 0);
  const off = all.filter((c) => c.dayHours.length === 0);

  // آمار فقط روی همکارانِ شیفت‌دار — با summary سرور (همهٔ همکاران) قاطی نمی‌شود
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

  // ── سگمنت وضعیت حضور
  const seg = el('div', { class: 'att-seg wd-att__seg', role: 'group', 'aria-label': `وضعیت حضور ${col.fullName}` });
  const segBtns = new Map();
  for (const s of STAFF_STATUS) {
    const btn = el('button', {
      class: `att-seg__btn att-seg__btn--${s.cls}`,
      type: 'button',
      disabled: !canMark,
      title: canMark ? s.label : (board.isToday ? 'فقط مدیر و منشی مجاز به ثبت هستند' : 'ثبت حضور فقط برای امروز مجاز است'),
      onclick: async () => {
        if (!canMark) return;
        try {
          await api.put('/api/staff-attendance', { staff_id: col.staffId, date: board.date, status: s.key });
          toast(`${col.fullName}: ${STAFF_STATUS_LABEL[s.key]}`, 'success', 2200);
          rerender();
        } catch (err) { toastError(err); }
      }
    }, s.label);
    segBtns.set(s.key, btn);
    seg.appendChild(btn);
  }
  if (st) segBtns.get(st)?.classList.add('is-active');
  else seg.classList.add('wd-seg--unset');

  // ── یادداشت حضور (فقط امروز)
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

  return el('div', { class: `wd-att__row${st === 'absent' ? ' wd-att__row--absent' : ''}` },
    el('div', { class: 'staff-mini__avatar' }, col.fullName.trim().charAt(0)),
    el('div', { class: 'wd-att__who' },
      el('div', { class: 'wd-att__name' }, col.fullName),
      el('div', { class: 'wd-att__meta' }, statusBadge(col.role), hoursChip,
        st ? el('span', { class: `badge badge--${STAFF_STATUS_BADGE[st]}` }, STAFF_STATUS_LABEL[st]) : null,
        col.attendance?.note
          ? el('span', { class: 'att-note', title: col.attendance.note }, icon('edit', 12), col.attendance.note.length > 26 ? `${col.attendance.note.slice(0, 26)}…` : col.attendance.note)
          : null
      )
    ),
    el('div', { class: 'wd-att__actions' }, seg, noteBtn)
  );
}

// ─────────────── کارت ۳ — درمانگران و نوبت‌ها (تایم‌لاین عمودی) ───────────────

function apptsCard(board) {
  const ss = board.sessionStats;
  const ops = board.opsStats;

  // دفاع لایهٔ دوم: درمانگر فقط بلوک خودش (سرور هم scope کرده)
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
        chip(ss.pending, 'بدون ثبت', 'neutral', 'جلسات بدون ثبت حضور دانش‌آموز'),
        chip(ss.present, 'حاضر', 'success'),
        chip(ss.absent, 'غایب', 'error'),
        chip(ops.planned, 'در انتظار عملیات', 'info', 'نوبت‌های بدون وضعیت عملیاتی'),
        chip(ops.checkedIn, 'آمد', 'accent'),
        chip(ops.delayed, 'تأخیر', 'warn'),
        chip(ops.inSession, 'در جلسه', 'primary'),
        chip(ops.completed, 'انجام شد', 'success'),
        chip(ops.noShow, 'نیامد', 'error'),
        chip(ops.cancelled, 'لغو', 'muted'),
        board.assessmentsToday > 0 ? chip(board.assessmentsToday, 'ارزیابی امروز', 'accent', 'گزارش‌های جلسهٔ ثبت‌شدهٔ امروز') : null
      )
    ),
    el('div', { class: 'card__body' }, body)
  );
}

/** بلوک یک درمانگر: سربرگ + تایم‌لاین نوبت‌ها */
function staffBlock(col, board) {
  const st = col.attendance?.status;
  const hoursChip = col.dayHours.length > 0
    ? el('span', { class: 'wd-hours', title: 'بازهٔ کاری این روز از برنامهٔ هفتگی' },
        icon('clock', 13),
        col.dayHours.map((h) => `${fa(minuteToLabel(h.startMinute))}–${fa(minuteToLabel(h.endMinute))}`).join(' ، ')
      )
    : el('span', { class: 'wd-hours wd-hours--off' }, 'بدون بازهٔ کاری');

  // خلاصهٔ عملیاتی کوچک کنار باج شمارنده: شمارش وضعیت‌های غیرصفر (لغوشده‌ها حساب نمی‌شوند؛
  // حداکثر ۳ پیل + باج تا سربرگ یک‌خطی بماند — فضای کم می‌شکند، نه بیرون بزند)
  const opsCounts = new Map();
  for (const ap of col.appointments) {
    if (ap.status === 'cancelled') continue;
    const key = ap.opsStatus ?? 'none';
    opsCounts.set(key, (opsCounts.get(key) ?? 0) + 1);
  }
  const statPills = OPS_STAT_ORDER
    .filter((k) => (opsCounts.get(k) ?? 0) > 0)
    .slice(0, 3)
    .map((k) => el('span', { class: 'wd-mark wd-mark--muted', title: 'وضعیت عملیاتی نوبت‌های این درمانگر امروز' },
      `${fa(opsCounts.get(k))} ${OPS_LABEL[k] ?? 'بدون ثبت'}`));

  return el('div', { class: `wd-block${st === 'absent' ? ' wd-block--absent' : ''}` },
    el('div', { class: 'wd-block__head' },
      // آواتار با هویت رنگی همان درمانگر (رنگش هم‌رنگ لبهٔ کارت‌های نوبتش)
      el('div', { class: `staff-mini__avatar ${hueClass(col.staffId)}` }, col.fullName.trim().charAt(0)),
      el('div', { class: 'wd-block__title' },
        el('div', { class: 'wd-block__name' }, col.fullName),
        el('div', { class: 'wd-block__meta' },
          statusBadge(col.role),
          hoursChip,
          st && canManage()
            ? el('span', { class: `badge badge--${STAFF_STATUS_BADGE[st]}`, title: 'وضعیت حضور امروز' }, STAFF_STATUS_LABEL[st])
            : null
        )
      ),
      el('div', { class: 'wd-block__stats' },
        el('span', { class: 'badge badge--neutral' }, `${fa(col.appointments.length)} نوبت`),
        ...statPills
      )
    ),
    timeline(col.appointments, board)
  );
}

/** بلوک «سایر نوبت‌ها» — نوبت‌های بی‌صاحب یا همکار غیرفعال (حفظ از ) */
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

// ─────────────── تایم‌لاین عمودی نوبت‌ها (حفظ + تقویت) ───────────────

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
  const dotKey = cancelled ? 'cancelled' : (a.opsStatus ?? 'none');
  return el('div', { class: `wd-tl__item${cancelled ? ' wd-tl__item--cancelled' : ''}` },
    el('div', { class: 'wd-tl__time' },
      fa(tehranTimeOfIso(a.startAt)),
      el('span', {}, `تا ${fa(tehranTimeOfIso(a.endAt))}`)
    ),
    el('div', { class: 'wd-tl__rail' },
      el('span', { class: `wd-tl__dot ${OPS_DOT[dotKey] ?? 'wd-tl__dot--planned'}${cancelled ? ' wd-tl__dot--cancelled' : ''}`, 'aria-hidden': 'true' })
    ),
    el('div', { class: 'wd-tl__body' }, apptCard(a))
  );
}

/** خط «الان» — تایم‌لاین زندهٔ روز (فقط امروز) */
function nowItem(nowLabel) {
  return el('div', { class: 'wd-tl__item wd-tl__item--now' },
    el('div', { class: 'wd-tl__time' }),
    el('div', { class: 'wd-tl__rail' }, el('span', { class: 'wd-tl__dot wd-tl__dot--now', 'aria-hidden': 'true' })),
    el('div', { class: 'wd-tl__body' },
      el('div', { class: 'wd-tl__nowline' }, icon('clock', 12), `الان — ${fa(nowLabel)}`)
    )
  );
}

// ─────────────── کارت نوبت روی تایم‌لاین ───────────────

/** — کلاس وضعیت برای رنگ‌بندی کارت (مشابه appointments.js) */
function wdApptStatusClass(a) {
  if (a.status === 'cancelled') return '';
  if (a.opsStatus === 'completed') return ' is-attended';
  if (a.opsStatus === 'no_show') return ' is-noshow';
  return '';
}

function apptCard(a) {
  const cancelled = a.status === 'cancelled';
  const opsKey = a.opsStatus ?? 'none';
  // مدت نوبت برای چیپ فشردهٔ سربرگ
  const durMin = Math.round((Date.parse(a.endAt) - Date.parse(a.startAt)) / 60000);
  // نوع جلسه برای چیپ نوع (جدول ۴)
  const stType = sessionTypeOf(a.sessionType);

  const head = el('div', { class: 'wd-appt__time' },
    a.opsStatus ? statusBadge(a.opsStatus) : null,
    cancelled ? el('span', { class: 'badge badge--neutral' }, 'لغوشده') : null,
    // نشان نوع جلسه (فردی/گروهی/خانواده/آموزگاران/ذهنی)
    stType ? el('span', { class: `st-chip st-chip--${stType.key}`, title: stType.hint }, stType.short) : null,
    // چیپ‌های فشردهٔ اطلاعات: مدت + شمار دانش‌آموز (هم‌سبک چیپ بازهٔ کاری)
    el('span', { class: 'wd-hours', title: 'مدت این نوبت' }, `${fa(Math.max(0, durMin))} دقیقه`),
    a.students.length > 0
      ? el('span', { class: 'wd-hours', title: 'تعداد دانش‌آموزان این نوبت' }, `${fa(a.students.length)} دانش‌آموز`)
      : null,
    el('span', { class: 'spacer' }),
    el('button', {
      class: `btn btn--ghost btn--icon btn--sm${a.note ? ' has-note' : ''}`,
      type: 'button',
      'aria-label': 'توضیحات نوبت',
      title: a.note || 'افزودن/ویرایش توضیحات نوبت',
      onclick: () => openAppointmentNoteModal(a)
    }, icon('edit', 13)),
    // حذف کامل نوبت ثبت‌شدهٔ اشتباه/تکراری از روی تایم‌لاین روز کاری
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

  /**
   * — حذف کامل نوبت از تقویم (نه لغو). سابقهٔ جلسه/گزارش جلسه → 409 سرور
   * با پیام راهنما؛ ورودی لیست انتظار متصل خودکار به صف برمی‌گردد.
   */
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
      toast('نوبت حذف شد', 'success');
      rerender();
    } catch (err) {
      toastError(err);
    }
  }

  const notePreview = a.note
    ? el('div', { class: 'wd-appt__note', title: a.note }, a.note.length > 90 ? `${a.note.slice(0, 90)}…` : a.note)
    : null;

  const studentRows = a.students.map((s) => {
    const cls = SESSION_STATUS_CLS[s.attendance] ?? 'muted';
    return el('div', { class: 'wd-appt__student' },
      // آواتار حرفی کوچک دانش‌آموز: تشخیص سریع‌تر ردیف‌ها — خنثی، بدون رنگ درمانگر
      // (رنگ درمانگر عمداً فقط روی لبهٔ کارت است تا دو کد رنگی قاطی نشوند)
      el('span', { class: 'wd-appt__savatar', 'aria-hidden': 'true' }, String(s.name ?? '').trim().charAt(0)),
      el('a', {
        class: 'wd-appt__sname',
        title: `پروفایل ${s.name}`,
        href: `#/students/${s.studentId}?tab=timeline`,
        onclick: (e) => e.stopPropagation()
      }, s.name),
      // تماس سریع با ولیّ از روی بورد (همان دسترسی صفحهٔ دانش‌آموزان)
      s.phone
        ? el('a', {
            class: 'wd-appt__sphone',
            href: `tel:${s.phone}`,
            title: `تماس با ولیّ ${s.name} — ${fa(s.phone)}`,
            'aria-label': `تماس با ولیّ ${s.name} — ${fa(s.phone)}`,
            onclick: (e) => e.stopPropagation()
          }, icon('phone', 12))
        : null,
      // گزارش جلسه (فرم رسمی ) از روی کارت روز کاری — دکمهٔ رسمی ثانویه یادداشت سریع
      // برای مدیر و درمانگر؛ فرم با نوع پیش‌فرض و تاریخ همان روز جلسه باز می‌شود
      !cancelled && canCreateCaseEvents()
        ? el('button', {
            class: 'btn btn--ghost btn--icon btn--sm wd-appt__report',
            type: 'button',
            'aria-label': `گزارش جلسه — ${s.name}`,
            title: `گزارش جلسه — ${s.name} (فرم رسمی، متصل به همین جلسه)`,
            onclick: () => openSessionReport(a, s)
          }, icon('file', 12))
        : null,
      el('span', { class: `wd-mark wd-mark--${cls}` }, SESSION_STATUS_LABEL[s.attendance] ?? s.attendance),
      !cancelled
        ? el('span', { class: 'wd-appt__sactions' },
            el('button', {
              class: 'wd-appt__sbtn wd-appt__sbtn--ok',
              type: 'button',
              'aria-label': `حاضر — ${s.name}`,
              title: `حاضر — ${s.name}`,
              onclick: () => markStudent(a, s, 'present')
            }, icon('check', 13)),
            // تأخیر: حاضر با تأخیر — غیبت حساب نمی‌شود
            el('button', {
              class: 'wd-appt__sbtn wd-appt__sbtn--warn',
              type: 'button',
              'aria-label': `تأخیر — ${s.name}`,
              title: `تأخیر — ${s.name}`,
              onclick: () => markStudent(a, s, 'late')
            }, icon('clock', 13)),
            el('button', {
              class: 'wd-appt__sbtn wd-appt__sbtn--err',
              type: 'button',
              'aria-label': `غایب — ${s.name}`,
              title: `غایب — ${s.name}`,
              onclick: () => markStudent(a, s, 'absent')
            }, icon('x', 13))
          )
        : null
    );
  });

  // اکشن‌های عملیاتی روی خود کارت (جایگزین صف تکراری و منوی ⋯)
  // درمانگر هم روی کارت جلسات خودش: آمد/تأخیر/شروع/اتمام/نیامد (سرور هم مالکیت را می‌سنجد)
  const acts = (!cancelled && canOperate()) ? (OPS_ACTIONS[opsKey] ?? []) : [];
  // فاز ۳ — بعد از «نیامد»، اقدام بعدی ساخت پیگیری غیبت است (context پرشده) — ابزار دفتر
  const followUp = opsKey === 'no_show' && canManage() && !absenceFollowUpDone.has(a.id);
  const opsRow = (acts.length > 0 || followUp)
    ? el('div', { class: 'wd-appt__ops' },
        acts.map((act) =>
          el('button', {
            class: `btn btn--${act.cls} btn--sm`,
            type: 'button',
            title: `ثبت وضعیت «${act.label}» — حضور دانش‌آموزانِ بدونِ ثبت هم خودکار ثبت می‌شود`,
            onclick: () => setOps(a, act.to)
          }, act.label)
        ),
        followUp
          ? el('button', {
              class: 'btn btn--ghost btn--sm',
              type: 'button',
              title: 'ساخت پیگیری برای این غیبت (مسئول: شما، مهلت: ۷ روز)',
              onclick: () => createAbsenceFollowUp(a)
            }, icon('bell', 13), 'ایجاد پیگیری غیبت')
          : null
      )
    : null;

  // رنگ ثابت درمانگر + وضعیت روی کارت روز کاری (لغو با wd-appt--cancelled v1)
  return el('div', { class: `wd-appt${cancelled ? ' wd-appt--cancelled' : ''}${wdApptStatusClass(a)} ${hueClass(a.staffId)}` },
    head,
    notePreview,
    studentRows.length > 0 ? el('div', { class: 'wd-appt__students' }, studentRows) : el('div', { class: 'wd-appt__student wd-appt__student--none' }, 'بدون دانش‌آموز'),
    opsRow
  );
}

// ─────────────── اکشن‌های عملیاتی + همگام‌سازی حضور ───────────────

/**
 * ترنزیشن وضعیت عملیاتی — قرینه ماتریس سرور؛ ترنزیشن نامعتبر سمت سرور 409 می‌دهد.
 * — رفع «چند بار حضور و غیاب گرفتن»: «آمد» حضورِ دانش‌آموزانِ بدونِ ثبت را
 * «حاضر» و «نیامد» آن‌ها را «غایب» ثبت می‌کند — از مسیر رسمی
 * PATCH /api/attendance (با audit و اعلان هوشمند غیبت )؛ ثبت‌های دستیِ قبلی
 * دست‌نخورده می‌مانند و ثبت تک‌تک دانش‌آموزان فقط برای استثناها باقی است.
 */
async function setOps(appt, to) {
  try {
    await api.post(`/api/appointments/${appt.id}/ops-status`, { ops_status: to });

    let synced = 0;
    if (to === 'checked_in' || to === 'no_show') {
      const status = to === 'checked_in' ? 'present' : 'absent';
      for (const s of appt.students ?? []) {
        // تأخیرِ ثبت‌شده با «آمد» بازنویسی نمی‌شود
        if (s.attendance !== 'present' && s.attendance !== 'late' && s.attendance !== 'absent' && s.attendance !== 'cancelled') {
          try {
            await api.patch(`/api/attendance/${appt.id}/${s.studentId}`, { status });
            synced += 1;
          } catch { /* ادامه با بقیه — وضعیت واقعی بعد از ری‌رندر دیده می‌شود */ }
        }
      }
    }

    if (synced > 0 && to === 'checked_in') toast(`آمد ثبت شد — حضور ${fa(synced)} دانش‌آموز حاضر شد`, 'success', 2600);
    else if (synced > 0 && to === 'no_show') toast(`نیامد ثبت شد — ${fa(synced)} دانش‌آموز غایب ثبت شد`, 'success', 2600);
    else toast(`«${OPS_LABEL[to]}» ثبت شد`, 'success', 2200);

    if (to === 'completed') await promptSessionReport(appt.id);
    rerender();
  } catch (err) {
    toastError(err);
  }
}

// گزارش جلسه از روی کارت روز کاری (همان جریان واحد ):
// پروفایل → فرم رسمی رویداد با نوع پیش‌فرض و تاریخِ روزِ جلسه — متصل به همین نوبت
async function openSessionReport(appt, s) {
  try {
    const prof = await api.get(`/api/students/${s.studentId}`);
    openCaseEventForm({
      student: prof.data,
      appointmentId: appt.id,
      occurredYmd: tehranYmdOfIso(appt.startAt),
      onSaved: () => {
        toast('گزارش روی تایم‌لاین پرونده ثبت شد', 'success', 2400);
        rerender();
      }
    });
  } catch (err) {
    toastError(err);
  }
}

// «بستن جلسه = گرفتن گزارش»: بعد از «اتمام جلسه» پرامپت ثبت گزارش
// گزارش ساخت‌یافته (رویداد پرونده) برای هر دانش‌آموز حاضر از پروفایلش ثبت می‌شود.
async function promptSessionReport(appointmentId) {
  if (!canCreateCaseEvents()) return;
  let students = [];
  try {
    const board = await api.get(`/api/working-day${qs({ date: local.date })}`).then((r) => r.data);
    const cols = [...(board.staff ?? []), ...(board.unassigned ?? [])];
    for (const col of cols) {
      for (const a of col.appointments ?? []) {
        if (a.id !== appointmentId) continue;
        for (const s of a.students ?? []) if (s.attendance === 'present' || s.attendance === 'late') students.push(s); // — تأخیر هم حاضر است
      }
    }
  } catch { /* بی‌خطر — پرامپت نمی‌آید */ }
  if (students.length === 0) return;
  openModal({
    title: 'گزارش جلسه — یادتان نرود',
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      el('p', { style: { margin: 0 } }, 'جلسه تمام شد. برای هر دانش‌آموز حاضر، گزارش جلسه (رویداد ساخت‌یافته) را روی پرونده ثبت کنید:'),
      ...students.map((s) =>
        el('button', {
          class: 'btn btn--soft',
          style: { justifyContent: 'space-between', display: 'flex', alignItems: 'center' },
          onclick: async () => {
            try {
              const prof = await api.get(`/api/students/${s.studentId}`);
              openCaseEventForm({ student: prof.data, appointmentId, onSaved: () => toast('گزارش روی تایم‌لاین ثبت شد', 'success') });
            } catch (err) { toastError(err); }
          }
        }, el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, icon('clipboard', 13), s.name), icon('chevL', 15))
      )
    ),
    actions: [(close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'بعداً')]
  });
}

/** فاز ۳ — هوک ② (§37): ساخت پیگیری غیبت با context پرشده — بدون مودال چندمرحله‌ای */
async function createAbsenceFollowUp(appt) {
  const single = appt.students.length === 1 ? appt.students[0] : null;
  const timeLabel = fa(tehranTimeOfIso(appt.startAt));
  const title = single
    ? `پیگیری غیبت — ${single.name} (${timeLabel})`
    : `پیگیری غیبت جلسه — ${timeLabel}`;
  try {
    await api.post('/api/followups', {
      entity_type: 'appointment',
      entity_id: appt.id,
      student_id: single ? single.studentId : undefined,
      title,
      assignee_id: session.user.staffId,
      due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    absenceFollowUpDone.add(appt.id);
    toast('پیگیری غیبت ساخته شد — مسئول: خود شما، مهلت: ۷ روز بعد', 'success', 2600);
    rerender();
  } catch (err) {
    toastError(err);
  }
}

async function markStudent(appt, student, status) {
  const LABEL = { present: 'حاضر', late: 'تأخیر', absent: 'غایب' };
  try {
    await api.patch(`/api/attendance/${appt.id}/${student.studentId}`, { status });
    toast(`${student.name}: ${LABEL[status] ?? status}`, 'success', 2000);
    rerender();
  } catch (err) {
    toastError(err);
  }
}

// ─────────────── کارت ۵ — توضیحات روز (لاگ) ───────────────

function notesCard(board) {
  const list = board.notes.length > 0
    ? el('div', { class: 'wd-notes' },
        board.notes.map((n) => {
          const isSystem = n.kind === 'system'; // فاز ۱ — D2: تفکیک انسانی/سیستمی
          return el('div', { class: `wd-note${isSystem ? ' wd-note--system' : ''}` },
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
                    onclick: async () => {
                      const ok = await confirmModal({
                        title: 'حذف توضیح روز',
                        message: 'این توضیح از لاگ روز حذف می‌شود. در لاگ ممیزی (audit) ثبت می‌ماند. ادامه می‌دهید؟',
                        confirmLabel: 'حذف کن',
                        danger: true
                      });
                      if (!ok) return;
                      try {
                        await api.del(`/api/working-day/notes/${n.id}`);
                        toast('توضیح حذف شد', 'success');
                        rerender();
                      } catch (err) { toastError(err); }
                    }
                  }, icon('trash', 14))
                : null
            )
          );
        })
      )
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
              toast('متن توضیحات حداقل ۲ نویسه است', 'error');
              return;
            }
            btn.disabled = true;
            try {
              await api.post('/api/working-day/notes', { date: board.date, body });
              toast('توضیح ثبت شد', 'success');
              rerender();
            } catch (err) {
              toastError(err);
              btn.disabled = false;
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

// ─────────────── ثبت‌های عقب‌افتاده (حفظ از — روزهای گذشته) ───────────────

async function drawOverdue(slot, board) {
  let pending;
  try {
    pending = await api.get('/api/attendance/pending').then((r) => r.data);
  } catch {
    return; // اهمیتی ندارد — بورد نباید به‌خاطر آن شکست بخورد
  }
  if (pending.length === 0 || !slot.isConnected) return;

  const shown = pending.slice(0, 8);
  const card = el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('bell', 16), 'ثبت‌های عقب‌افتاده'),
      el('span', { class: 'badge badge--warning' }, `${fa(pending.length)} نوبت`)
    ),
    el('div', { class: 'card__body att-list' },
      shown.map((p) =>
        el('div', { class: 'att-row att-row--student' },
          el('div', { class: 'att-row__id' },
            el('div', { class: 'staff-mini__avatar staff-mini__avatar--alt' }, p.studentName.trim().charAt(0)),
            el('div', {},
              el('div', { class: 'att-row__name' }, p.studentName),
              el('div', { class: 'att-row__meta' }, `${formatJalaliNumeric(p.startAt.slice(0, 10))} · ساعت ${fa(tehranTimeOfIso(p.startAt))}`)
            )
          ),
          el('div', { class: 'att-row__seg att-row__seg--actions' },
            el('button', { class: 'btn btn--sm btn--primary', type: 'button', onclick: () => markOverdue(p, 'present') }, icon('check', 15), 'حاضر'),
            el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', onclick: () => markOverdue(p, 'absent') }, icon('x', 15), 'غایب')
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

async function markOverdue(p, status) {
  try {
    await api.patch(`/api/attendance/${p.appointmentId}/${p.studentId}`, { status });
    toast(`${p.studentName}: ${status === 'present' ? 'حاضر' : 'غایب'}`, 'success', 2200);
    rerender();
  } catch (err) {
    toastError(err);
  }
}

// ─────────────── مودال‌های یادداشت ───────────────

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
      toast('یادداشت ذخیره شد', 'success');
      rerender();
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
      await api.patch(`/api/appointments/${appt.id}`, {
        note: values.note || '',
        version: appt.version
      });
      toast('توضیحات نوبت ذخیره شد', 'success');
      rerender();
    }
  });
}
