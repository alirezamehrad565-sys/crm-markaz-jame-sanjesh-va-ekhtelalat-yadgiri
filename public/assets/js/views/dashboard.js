/**
 * نمای داشبورد
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// views/dashboard.js — بازطراحی کامل داشبورد
// دستور کاربر: «داشبورد خیلی اطلاعات مهمی رو نمیده؛ طراحی شو دوست ندارم —
// برای درمانگران باید شامل اطلاعات رقابتی باشه که تلاششون رو بیشتر کنه
// (تعداد جلسات، افزودن تمرین به لیست تمرین، طراحی رویداد بیشتر و...)؛
// سمت مدیر و منشی هم طراحیش جالب نیست؛ باید بخش‌هایی برای اطلاع‌رسانی و
// دانش‌افزایی بگذاریم»
//
// سه چهرهٔ نقش‌محور:
// درمانگر → «کارنامهٔ من» + تابلوی رقابتی + نردبان گزارش‌نویسی + دانش/اطلاع‌رسانی
// دفتر → KPIهای امروز + عملکرد تیم + سنجش + کارهای داخلی + دانش/اطلاع‌رسانی
// ناظر → KPIهای تجمعی + عملکرد تیم (فقط خواندنی)

import { api, qs } from '../api.js';
import {
  addDaysYmd,
  fa,
  iranianWeekdayOfYmd,
  tehranDayRange,
  tehranTimeOfIso,
  tehranTodayYmd,
  tehranYmdOfIso,
  WEEKDAY_NAMES,
  formatJalaliNumeric
} from '../format.js';
import { el, icon, loadingState, skeletonState, errorState, statusBadge, emptyState, openModal, progressRing } from '../ui.js';
import { hueClass } from '../staff-hue.js'; // — رنگ ثابت درمانگر
import { illoHeroOrnament, illoNoAnnouncements, illoKnowledge } from '../illustrations.js'; // — وکتورها
import { session } from '../state.js';
import { canSeeTodos, renderMyTodosCard } from '../my-todos.js';

// وزن‌ها فقط سمت سرور می‌مانند؛ هیچ متن فرمولی در داشبورد نمایش داده نمی‌شود
// («به صورت خلاصه بدون اینکه از فرمول مطلع بشن»)

// برچسب دسته‌های دانش‌افزایی — هم‌تراز KNOWLEDGE_CATEGORY_LABELS سرور
const KNOWLEDGE_CATEGORY_LABELS = { tip: 'نکتهٔ آموزشی', protocol: 'پروتکل درمانی', article: 'مقاله', news: 'خبر مرکز' };

export async function renderDashboard(container) {
  container.replaceChildren(skeletonState('cards', 4));

  const role = session.user?.role;
  const isTherapist = role === 'therapist';
  const isOffice = role === 'manager' || role === 'secretary';

  const today = tehranTodayYmd();
  const from = addDaysYmd(today, -6);
  const dayRange = tehranDayRange(today);

  // ─── داده‌های نقش‌محور — خطای هر کارت مستقل است و بقیهٔ داشبورد نمی‌شکند ───
  const safe = (p) => p.then((r) => r.data).catch(() => null);

  const [todayData, summaryData, goalData, scoring, myStats, knowledge, announcements, waitlist, dayAppts, followups] = await Promise.all([
    isTherapist ? Promise.resolve(null) : safe(api.get(`/api/dashboard/today${qs({ date: today })}`)),
    isTherapist ? Promise.resolve(null) : safe(api.get(`/api/dashboard/summary${qs({ from, to: today })}`)),
    isOffice ? safe(api.get('/api/dashboard/screening-goal')) : Promise.resolve(null),
    // تابلوی پیشرفت از موتور سراسری امتیاز (۳۰ روز اخیر) — جایگزین leaderboard قدیمی
    safe(api.get('/api/scoring/board?period=month')),
    safe(api.get('/api/dashboard/me')),
    safe(api.get('/api/knowledge')),
    safe(api.get('/api/announcements')),
    isOffice ? safe(api.get('/api/waitlist')) : Promise.resolve(null),
    // نوار خط زمانی امروز (نوبت‌های امروز با رنگ درمانگرها)
    isOffice ? safe(api.get(`/api/appointments${qs({ from: dayRange.start, to: dayRange.end })}`)) : Promise.resolve(null),
    // پیگیری‌های سررسیده (باز فیلتر مهلت در کلاینت)
    isOffice ? safe(api.get(`/api/followups${qs({ group: 'open' })}`)) : Promise.resolve(null)
  ]);

  if (!isTherapist && !todayData) {
    container.replaceChildren(errorState(new Error('بارگذاری داشبورد ناموفق بود'), () => renderDashboard(container)));
    return;
  }

  const parts = [];

  // ─────────────── درمانگر: کارنامهٔ من + تابلوی پیشرفت ───────────────
  if (isTherapist) {
    parts.push(...therapistDashboard(container, { myStats, scoring, knowledge, announcements }));
  } else {
    // today باید پاس داده شود (باگ «داشبورد مدیر باز نمی‌شود»: today is not defined)
    parts.push(...officeDashboard(container, { todayData, summaryData, goalData, scoring, knowledge, announcements, waitlist, dayAppts, followups, today }));
  }

  container.replaceChildren(...parts.filter(Boolean));
}

// ─────────────── داشبورد درمانگر ───────────────

function therapistDashboard(container, { myStats, scoring, knowledge, announcements }) {
  const parts = [];

  parts.push(
    el(
      'div',
      { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'کارنامهٔ من'),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => renderDashboard(container) }, icon('refresh', 16), 'به‌روزرسانی')
    )
  );

  // ─── ۱) هیرو — امتیاز سراسری از شروع دورهٔ امتیاز (: صفرسازی) + رتبه ───
  const scoreRows = scoring?.rows ?? [];
  const scoreRow = scoreRows.find((r) => r.staffId === session.user?.staffId) ?? null;
  if (scoreRow) parts.push(heroScore(scoreRow, scoreRows, scoring?.since));

  if (myStats) {
    // نردبان گزارش‌نویسی — جلسهٔ حاضرِ بدون یادداشت، کار تمام‌شده نیست
    if (myStats.missingNotes > 0) {
      parts.push(
        el(
          'div',
          { class: 'alert alert--warning', style: { marginBottom: 'var(--sp-4)' } },
          icon('edit', 18),
          el('span', {}, `${fa(myStats.missingNotes)} جلسهٔ برگزارشدهٔ این ماه هنوز گزارش جلسه ندارند — گزارشِ نوشته‌شده هم امتیاز رقابت است، هم سند بالینی.`),
          el(
            'button',
            { class: 'btn btn--soft btn--sm', onclick: () => { location.hash = '#/working-day'; } },
            'ثبت گزارش جلسه‌ها'
          )
        )
      );
    }

    // نوبت بعدی من
    if (myStats.nextAppointment) {
      const nx = myStats.nextAppointment;
      parts.push(
        el(
          'div',
          { class: 'alert alert--info', style: { marginBottom: 'var(--sp-4)' } },
          icon('clock', 18),
          el(
            'span',
            {},
            `نوبت بعدی: امروز ساعت ${fa(tehranTimeOfIso(nx.startAt))}${nx.studentNames.length ? ` — ${nx.studentNames.join('، ')}` : ''}`
          )
        )
      );
    }

    // ─── ۲) چهار کاشی تلاش ───
    parts.push(scoreTiles(myStats));
  }

  // ─── ۳) تابلوی پیشرفت — کارت خلاصه از موتور سراسری؛ بدون فرمول ───
  if (scoreRows.length) parts.push(leaderboardCard(scoreRows, 'تابلوی پیشرفت', session.user?.staffId, scoring?.since));

  // ─── ۴) دانش‌افزایی + اطلاع‌رسانی ───
  const info = infoGrid(knowledge, announcements);
  if (info) parts.push(info);

  return parts;
}

/**
 * هیروی امتیاز — امتیاز از موتور سراسری از شروع دورهٔ امتیاز؛ رینگ نسبت به صدر تابلو؛
 *: باجت سطح حذف شد («غیرمحترمانه است — فقط امتیاز») — فقط امتیاز/رتبه + تاریخ شروع شمارش
 */
function heroScore(scoreRow, rows, since = null) {
  const top = Math.max(1, ...rows.map((r) => r.total));

  const rankChip = el(
    'div',
    { class: `hero-score__rank${scoreRow.rank === 1 ? ' hero-score__rank--gold' : ''}` },
    `رتبهٔ ${fa(scoreRow.rank)} از ${fa(rows.length)} همکار`
  );

  const sinceLabel = since ? `شروع شمارش: ${formatJalaliNumeric(tehranYmdOfIso(since))}` : null;

  return el(
    'div',
    { class: 'hero-score' },
    el(
      'div',
      { class: 'hero-score__ring' },
      progressRing(scoreRow.total, top, { size: 96, stroke: 9 }),
      el('div', { class: 'ring-center' }, el('b', {}, fa(scoreRow.total)), el('span', {}, 'امتیاز'))
    ),
    el(
      'div',
      { class: 'hero-score__main' },
      el('div', { class: 'hero-score__label' }, 'تابلوی پیشرفت'),
      sinceLabel
        ? el('div', { class: 'cell-sub', style: { marginTop: 'var(--sp-1)' } }, sinceLabel)
        : null
    ),
    rankChip,
    illoHeroOrnament()
  );
}

function scoreTiles(myStats) {
  const tile = (label, value, prev, route) => {
    const diff = value - prev;
    return el(
      'button',
      { class: 'score-tile', onclick: route ? () => { location.hash = route; } : undefined },
      el('div', { class: 'score-tile__label' }, label),
      el('div', { class: 'score-tile__value' }, fa(value)),
      el(
        'div',
        { class: `score-tile__prev${diff > 0 ? ' is-up' : diff < 0 ? ' is-down' : ''}` },
        `ماه قبل: ${fa(prev)}`,
        diff !== 0 ? el('span', {}, diff > 0 ? ` (+${fa(diff)})` : ` (−${fa(Math.abs(diff))})`) : null
      )
    );
  };
  return el(
    'div',
    { class: 'score-tiles', style: { marginBottom: 'var(--sp-4)' } },
    tile('جلسات برگزارشده', myStats.sessions, myStats.sessionsPrev, '#/reports'),
    tile('تمرین افزوده به بانک', myStats.exercises, myStats.exercisesPrev, '#/exercises'),
    tile('رویداد پروندهٔ ثبت‌شده', myStats.events, myStats.eventsPrev, '#/reports'),
    tile('پیگیری انجام‌شده', myStats.followups, myStats.followupsPrev, '#/reports')
  );
}

// ─────────────── داشبورد دفتر (مدیر/منشی) و ناظر ───────────────

function officeDashboard(container, { todayData, summaryData, goalData, scoring, knowledge, announcements, waitlist, dayAppts, followups, today }) {
  const parts = [];

  parts.push(
    el(
      'div',
      { class: 'page-head' },
      el('div', { class: 'page-head__title' }, formatJalaliNumeric(todayData.date ?? tehranTodayYmd())),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => renderDashboard(container) }, icon('refresh', 16), 'به‌روزرسانی')
    )
  );

  // نوبت بعدی
  if (todayData.nextAppointment) {
    const next = todayData.nextAppointment;
    const staffName = todayData.perStaff.find((s) => s.staffId === next.staffId)?.staffName ?? '';
    parts.push(
      el(
        'div',
        { class: 'alert alert--info', style: { marginBottom: 'var(--sp-4)' } },
        icon('clock', 18),
        el('span', {}, `نوبت بعدی امروز: ساعت ${fa(tehranTimeOfIso(next.startAt))} — ${staffName}`)
      )
    );
  }

  // KPIهای امروز — ماتریس تصمیم روز دفتر
  const attendance = todayData.attendance ?? null;
  const hasAttendanceData = attendance ? attendance.present + attendance.absent > 0 : false;
  const absencePct = Math.round((todayData.absenceRate ?? 0) * 100);
  const waitingCount = Array.isArray(waitlist?.data ?? waitlist)
    ? (waitlist.data ?? waitlist).filter((w) => w.status === 'waiting' || w.status === 'called').length
    : null;

  parts.push(
    el(
      'div',
      { class: 'kpi-grid stagger', style: { marginBottom: 'var(--sp-5)' } },
      kpi('نوبت‌های امروز', fa(todayData.appointments.total), `برنامه‌ریزی‌شده ${fa(todayData.appointments.scheduled)} · لغوشده ${fa(todayData.appointments.cancelled)}`, 'primary'),
      kpi('در انتظار حضور و غیاب', fa(todayData.pendingAttendance), 'نوبت‌های امروز بدون وضعیت', 'accent'),
      kpi('نرخ غیبت', hasAttendanceData ? `${fa(absencePct)}٪` : '—', hasAttendanceData ? 'آمار حضور امروز' : 'هنوز حاضری امروز ثبت نشده', hasAttendanceData ? (absencePct >= 20 ? 'error' : 'success') : 'neutral'),
      waitingCount !== null
        ? kpi('لیست انتظار', fa(waitingCount), 'متقاضیِ در صف (در انتظار/فراخوانده)', waitingCount > 0 ? 'accent' : 'neutral')
        : null,
      kpi('دانش‌آموزان فعال', fa(todayData.studentsSummary.totalStudents), `در ${fa(todayData.studentsSummary.totalSchools)} مدرسه`, 'primary'),
      kpi('تداخل‌های فعال', fa(todayData.activeConflicts), 'تداخل زمانی نوبت‌ها', todayData.activeConflicts > 0 ? 'error' : 'neutral')
    )
  );

  // کارهای داخلی منشی/مدیر
  if (canSeeTodos()) parts.push(renderMyTodosCard());

  // خط زمانی امروز: ساعت‌ها با نقطهٔ رنگ درمانگرها
  const timeline = todayTimelineCard(dayAppts, todayData);
  if (timeline) parts.push(timeline);

  // عملکرد تیم — دید دفتری
  const scoreRows = scoring?.rows ?? [];
  if (scoreRows.length) {
    parts.push(leaderboardCard(scoreRows, 'تابلوی پیشرفت درمانگران', session.user?.staffId, scoring?.since));
  }

  // پیگیری‌های سررسیده + پیرشدن لیست انتظار
  const fuCard = followupsDueCard(followups, today);
  if (fuCard) parts.push(fuCard);
  const agingCard = waitlistAgingCard(waitlist);
  if (agingCard) parts.push(agingCard);

  // روند ۷ روز + سنجش
  if (summaryData) {
    const maxTotal = Math.max(1, ...summaryData.byDay.map((d) => d.total));
    parts.push(
      el(
        'div',
        // m145 — کارت بدون حاشیهٔ پایین به کارت بعدی می‌چسبید (0px seam) — ریتم یکنواخت ۱۶px
        { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
        el(
          'div',
          { class: 'card__head' },
          el('div', { class: 'card__title' }, 'روند ۷ روز اخیر'),
          el('span', { class: 'badge badge--neutral' }, `${formatJalaliNumeric(addDaysYmd(todayData.date ?? tehranTodayYmd(), -6))} تا ${formatJalaliNumeric(todayData.date ?? tehranTodayYmd())}`)
        ),
        el(
          'div',
          { class: 'card__body' },
          el(
            'div',
            { class: 'spark' },
            summaryData.byDay.map((d) =>
              el(
                'div',
                { class: 'spark__col', title: `${formatJalaliNumeric(d.date)} — ${fa(d.total)} نوبت` },
                el('div', { class: 'spark__num' }, fa(d.total)),
                el('div', { class: 'spark__bar', style: { height: `${Math.max(4, Math.round((d.total / maxTotal) * 72))}px` } }),
                el('div', { class: 'spark__day' }, WEEKDAY_NAMES[iranianWeekdayOfYmd(d.date)])
              )
            )
          )
        )
      )
    );
  }

  if (goalData) parts.push(drawScreeningGoalCard(goalData));

  const info = infoGrid(knowledge, announcements);
  if (info) parts.push(info);

  return parts;
}

// ─────────────── اجزای مشترک ───────────────

/** تابلوی پیشرفت — کارت خلاصهٔ داشبورد: هر ردیف سه سطر مستقل (نام+امتیاز / میله / سطح)
 * هیچ هم‌پوشانی ممکن نیست: نام برش می‌خورد، اعداد ستون خودشان را دارند؛ بدون فرمول */
function leaderboardCard(rows, title, meStaffId, since = null) {
  const max = Math.max(1, ...rows.map((x) => x.total));
  const body =
    rows.length === 0
      ? emptyState({ iconName: 'users', title: 'درمانگری ثبت نشده است', hint: 'کارکنان ← افزودن همکار با نقش درمانگر' })
      : el(
          'div',
          { class: 'lb-list' },
          rows.map((e) => {
            const isMe = e.staffId === meStaffId;
            const medal = e.rank <= 3 && e.total > 0 ? ` lb-rank--${e.rank}` : '';
            return el(
              'div',
              { class: `lb-row${isMe ? ' lb-row--me' : ''}` },
              el('span', { class: `lb-rank${medal}` }, e.total > 0 ? fa(e.rank) : '—'),
              el(
                'div',
                { class: 'lb-row__body' },
                // سطر ۱ — نام (برش امن) + امتیاز (ستون ثابت)
                el(
                  'div',
                  { class: 'lb-row__top' },
                  el(
                    'span',
                    { class: 'lb-row__name', title: e.fullName },
                    e.fullName,
                    isMe ? el('span', { class: 'badge badge--primary' }, 'من') : null
                  ),
                  el(
                    'div',
                    { class: 'lb-score' },
                    el('b', {}, fa(e.total)),
                    el('span', {}, 'امتیاز')
                  )
                ),
                // سطر ۲ — میلهٔ پیشرفت
                el(
                  'div',
                  { class: 'lb-row__bar' },
                  el('div', { class: 'lb-row__fill', style: { width: `${Math.max(2, Math.round((e.total / max) * 100))}%` } })
                )
              )
            );
          })
        );

  // بج سربرگ: از شروع دورهٔ امتیاز (صفرسازی) — نه «۳۰ روز اخیر»
  const headBadge = since
    ? el('span', { class: 'badge badge--accent' }, `از ${formatJalaliNumeric(tehranYmdOfIso(since))}`)
    : el('span', { class: 'badge badge--accent' }, 'کل دوره');

  return el(
    'div',
    { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
    el(
      'div',
      { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('trophy', 16), title),
      headBadge
    ),
    el('div', { class: 'card__body' }, body)
  );
}

// ─────────────── کارت‌های تازهٔ دفتر ───────────────

/** خط زمانی امروز — ساعت ۰۶ تا ۲۱؛ هر نقطه = یک نوبت با رنگ درمانگر */
function todayTimelineCard(appts, todayData) {
  if (!Array.isArray(appts) || appts.length === 0) return null;
  const staffNames = new Map((todayData?.perStaff ?? []).map((s) => [s.staffId, s.staffName]));
  const nowHour = new Date(Date.now() + 210 * 60000).getUTCHours();
  const cols = [];
  for (let h = 6; h <= 21; h += 1) {
    const inHour = appts.filter((a) => Number(String(tehranTimeOfIso(a.startAt)).slice(0, 2)) === h);
    cols.push(
      el(
        'div',
        { class: `tl-strip__hour${h === nowHour ? ' is-now' : ''}` },
        el('div', { class: 'tl-strip__dots' },
          inHour.map((a) =>
            el('span', {
              class: `tl-strip__dot ${hueClass(a.staffId)}${a.status === 'cancelled' ? ' is-cancelled' : ''}`,
              title: `${fa(tehranTimeOfIso(a.startAt))} — ${staffNames.get(a.staffId) ?? 'درمانگر'}${a.status === 'cancelled' ? ' (لغوشده)' : ''}`
            })
          )
        ),
        el('div', { class: 'tl-strip__label' }, fa(String(h).padStart(2, '0')))
      )
    );
  }
  return el(
    'div',
    { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
    el(
      'div',
      { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('timeline', 16), 'خط زمانی امروز'),
      el('span', { class: 'badge badge--neutral' }, `${fa(appts.length)} نوبت`)
    ),
    el('div', { class: 'card__body', style: { padding: 'var(--sp-3)' } }, el('div', { class: 'tl-strip' }, cols))
  );
}

/** پیگیری‌های سررسیده — فقط مواردی که مهلتشان امروز یا قبل است */
function followupsDueCard(rows, todayYmd) {
  const open = (Array.isArray(rows) ? rows : (rows?.data ?? [])).filter((f) => (f.status === 'open' || f.status === 'in_progress') && f.dueAt);
  const due = open
    .filter((f) => String(f.dueAt).slice(0, 10) <= todayYmd)
    .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))
    .slice(0, 6);
  if (due.length === 0) return null;
  return el(
    'div',
    { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
    el(
      'div',
      { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('bell', 16), 'پیگیری‌های سررسیده'),
      el('span', { class: 'badge badge--error' }, `${fa(due.length)} مورد`)
    ),
    el(
      'div',
      { class: 'card__body', style: { paddingTop: 'var(--sp-2)', paddingBottom: 'var(--sp-2)' } },
      due.map((f) => {
        const overdue = String(f.dueAt).slice(0, 10) < todayYmd;
        return el(
          'div',
          { class: 'fu-row' },
          el(
            'div',
            { class: 'fu-row__main' },
            el('div', { class: 'fu-row__title' }, f.title),
            el('div', { class: 'cell-sub' }, f.studentName ? `دانش‌آموز: ${f.studentName}` : f.assigneeName ? `مسئول: ${f.assigneeName}` : '')
          ),
          el('span', { class: `badge ${overdue ? 'badge--error' : 'badge--warning'}` }, overdue ? 'عقب‌افتاده' : 'امروز')
        );
      })
    )
  );
}

/** «چه مدت در انتظارند؟» — سنین صف لیست انتظار در سه بازه */
function waitlistAgingCard(waitlist) {
  const rows = Array.isArray(waitlist) ? waitlist : (Array.isArray(waitlist?.data) ? waitlist.data : []);
  const active = rows.filter((w) => w.status === 'waiting' || w.status === 'called');
  if (active.length === 0) return null;
  const today = tehranTodayYmd();
  const dayDiff = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
  const buckets = { ok: [], warn: [], late: [] };
  for (const w of active) {
    const created = String(w.createdAt ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(created)) continue;
    const days = dayDiff(created, today);
    if (days <= 7) buckets.ok.push(w);
    else if (days <= 14) buckets.warn.push(w);
    else buckets.late.push(w);
  }
  const total = buckets.ok.length + buckets.warn.length + buckets.late.length;
  if (total === 0) return null;
  const row = (label, arr, cls) =>
    el(
      'div',
      { class: 'aging-row' },
      el('span', { class: 'aging-row__label' }, label),
      el('div', { class: 'aging-row__bar' }, el('div', { class: `aging-row__fill aging-row__fill--${cls}`, style: { width: `${Math.max(3, Math.round((arr.length / total) * 100))}%` } })),
      el('b', { class: 'aging-row__num' }, fa(arr.length))
    );
  return el(
    'div',
    { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
    el(
      'div',
      { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('hourglass', 16), 'چه مدت در انتظارند؟'),
      el('span', { class: 'badge badge--neutral' }, `${fa(total)} متقاضی`)
    ),
    el('div', { class: 'card__body' }, row('۰ تا ۷ روز', buckets.ok, 'ok'), row('۸ تا ۱۴ روز', buckets.warn, 'warn'), row('۱۵ روز و بیشتر', buckets.late, 'late'))
  );
}

/** کارت‌های اطلاع‌رسانی + دانش‌افزایی — حتی بدون محتوا هم دیده می‌شوند (: حالت خالی + میان‌بر دفتر) */
function infoGrid(knowledge, announcements) {
  const anItems = (announcements ?? []).slice(0, 3);
  const knItems = (knowledge ?? []).slice(0, 4);
  const isOffice = ['manager', 'secretary'].includes(session.user?.role);

  const anCard = el(
    'div',
    { class: 'card' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('bell', 16), 'اطلاع‌رسانی مرکز')),
    el(
      'div',
      { class: 'card__body' },
      anItems.length
        ? anItems.map((a) =>
            el(
              'div',
              { class: 'an-item' },
              el('div', { class: 'an-item__title' }, a.title),
              el('div', { class: 'an-item__body' }, a.body),
              el('div', { class: 'cell-sub' }, a.createdByName ? a.createdByName : '')
            )
          )
        : el(
            'div',
            { class: 'an-empty' },
            illoNoAnnouncements(),
            el('div', { class: 'cell-sub', style: { padding: 'var(--sp-2) 0', textAlign: 'center' } },
              'اعلانی منتشر نشده است.',
              isOffice ? el('span', {}, ' — از تنظیمات ← تب «اعلان‌های مدیر» می‌توانید اعلان فعال ثبت کنید.') : null
            )
          )
    )
  );

  const knCard = el(
    'div',
    { class: 'card' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('file', 16), 'دانش‌افزایی'), knItems.length ? el('span', { class: 'badge badge--neutral' }, `${fa(knowledge.length)} مقاله`) : null),
    el(
      'div',
      { class: 'card__body' },
      knItems.length
        ? knItems.map((k) =>
            el(
              'button',
              { class: 'kn-item', onclick: () => openKnowledgeReader(k) },
              el('span', { class: `kn-badge kn-badge--${k.category}` }, KNOWLEDGE_CATEGORY_LABELS[k.category] ?? k.category),
              el('span', { class: 'kn-item__title' }, k.title)
            )
          )
        : el(
            'div',
            { class: 'an-empty' },
            illoKnowledge(),
            el('div', { class: 'cell-sub', style: { padding: 'var(--sp-2) 0', textAlign: 'center' } },
              'هنوز محتوایی در پایگاه دانش ثبت نشده است.',
              isOffice
                ? el('button', { class: 'btn btn--ghost btn--sm', style: { marginInlineStart: 'var(--sp-2)' }, onclick: () => { location.hash = '#/settings?tab=knowledge'; } }, 'ثبت اولین نکته')
                : null
            )
          )
    )
  );

  return el(
    'div',
    { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' } },
    anCard,
    knCard
  );
}

function openKnowledgeReader(k) {
  openModal({
    title: `${KNOWLEDGE_CATEGORY_LABELS[k.category] ?? k.category} — ${k.title}`,
    wide: true,
    body: el(
      'div',
      {},
      el('div', { class: 'kn-reader' }, k.body),
      el('div', { class: 'cell-sub', style: { marginTop: 'var(--sp-3)' } }, k.createdByName ? `ثبت‌کننده: ${k.createdByName}` : '')
    ),
    actions: []
  });
}

function kpi(label, value, sub, tone = 'primary') {
  return el(
    'div',
    { class: `kpi kpi--${tone}` },
    el('div', { class: 'kpi__label' }, label),
    el('div', { class: 'kpi__value' }, value),
    sub ? el('div', { class: 'kpi__sub' }, sub) : null
  );
}

// ─────────────── کارت سنجش روزانه (نگه‌داشته از طراحی قبل) ───────────────

function goalMini(value, label, tone) {
  return el(
    'div',
    { class: 'goal-mini' },
    el('b', { class: `goal-mini__val${tone ? ` goal-mini__val--${tone}` : ''}` }, value),
    el('span', { class: 'goal-mini__label' }, label)
  );
}

/** — یک ردیف هدف مستقل (ماه/سفارشی) در کارت سنجش داشبورد */
function goalRowItem(g) {
  const statusBadge =
    g.status === 'upcoming'
      ? el('span', { class: 'badge badge--neutral' }, 'شروع نشده')
      : g.status === 'past'
        ? el('span', { class: 'badge badge--neutral' }, 'پایان‌یافته')
        : el('span', { class: `badge ${g.percent >= 100 ? 'badge--success' : 'badge--primary'}` }, `${fa(g.percent)}٪`);
  const sub =
    g.status === 'upcoming'
      ? `هدف: ${fa(g.target)} سنجش — این بازه هنوز شروع نشده است`
      : g.percent >= 100
        ? `${fa(g.done)} از ${fa(g.target)} سنجش — هدف تکمیل شد`
        : `${fa(g.done)} از ${fa(g.target)} سنجش${g.remaining > 0 ? ` — ${fa(g.remaining)} باقی‌مانده` : ''}`;
  return el(
    'div',
    { class: 'goal-block' },
    el('div', { class: 'goal-head' }, el('b', {}, g.periodLabel), statusBadge),
    el(
      'div',
      { class: 'goal-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': g.percent },
      el('div', { class: 'goal-bar__fill', style: { width: `${Math.max(2, g.percent)}%` } })
    ),
    el('div', { class: 'cell-sub' }, sub)
  );
}

function drawScreeningGoalCard(goal) {
  const monthMax = Math.max(1, ...goal.months.map((m) => m.done));
  const monthlyAvg = goal.target ? goal.target / 12 : null;
  const canOpenScreening = ['manager', 'secretary'].includes(session.user?.role);
  // اهداف غیر از «هدف سالِ پرچم‌دار» — ماه‌ها و بازه‌های سفارشی، هرکدام با نوار تحقق مستقل
  const otherGoals = Array.isArray(goal.goals) ? goal.goals.filter((g) => g.mode !== 'year') : [];

  return el(
    'div',
    // m145 — فاصلهٔ یکنواخت با کارت «روند ۷ روز» بالا و بلاک اطلاع‌رسانی پایین
    { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
    el(
      'div',
      { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('board', 16), 'سنجش روزانه — گزارش کوتاه'),
      el('span', { class: 'badge badge--primary' }, `سال ${fa(goal.jalaliYear)}`)
    ),
    el(
      'div',
      { class: 'card__body' },
      el(
        'div',
        { class: 'goal-report' },
        goalMini(fa(goal.todayCount), 'امروز'),
        goalMini(fa(goal.weekCount), '۷ روز اخیر'),
        goalMini(fa(goal.monthCount), '۳۰ روز اخیر'),
        goalMini(goal.referralRate === null ? '—' : `${fa(goal.referralRate)}٪`, 'نرخ ارجاع سال', goal.referralRate !== null && goal.referralRate >= 15 ? 'warn' : '')
      ),
      goal.target !== null
        ? el(
            'div',
            { class: 'goal-block' },
            el(
              'div',
              { class: 'goal-head' },
              el('b', {}, `تحقق هدفگذاری: ${fa(goal.yearDone)} از ${fa(goal.target)} سنجش`),
              el('span', { class: `badge ${goal.targetPercent >= 100 ? 'badge--success' : 'badge--primary'}` }, `${fa(goal.targetPercent)}٪`)
            ),
            el(
              'div',
              { class: 'goal-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': goal.targetPercent },
              el('div', { class: 'goal-bar__fill', style: { width: `${Math.max(2, goal.targetPercent)}%` } })
            ),
            el(
              'div',
              { class: 'cell-sub' },
              goal.targetRemaining > 0
                ? `${fa(goal.targetRemaining)} سنجش دیگر تا تحقق هدف ${fa(goal.jalaliYear)}`
                : `هدف سال ${fa(goal.jalaliYear)} تکمیل شد — جمع ${fa(goal.yearDone)} سنجش`
            )
          )
        : otherGoals.length > 0
          ? null
          : el(
              'div',
              { class: 'alert alert--info goal-noset' },
              'شاخص سنجش هنوز تنظیم نشده است — از «تنظیمات ← شاخص سنجش» عدد هدف سال را وارد کنید تا نمودار تحقق اینجا ساخته شود.'
            ),
      el(
        'div',
        { class: 'spark goal-spark' },
        goal.months.map((m) =>
          el(
            'div',
            { class: 'spark__col', title: `${m.label} ${fa(goal.jalaliYear)} — ${fa(m.done)} سنجش` },
            el('div', { class: 'spark__num' }, fa(m.done)),
            el('div', {
              class: `spark__bar${monthlyAvg !== null && m.done >= monthlyAvg ? ' spark__bar--ahead' : ''}`,
              style: { height: `${Math.max(4, Math.round((m.done / monthMax) * 64))}px` }
            }),
            el('div', { class: 'spark__day' }, m.label.slice(0, 3))
          )
        )
      ),
      otherGoals.length > 0
        ? el(
            'div',
            { class: 'goal-rows' },
            el('div', { class: 'goal-rows__title' }, icon('board', 14), 'اهداف همزمان'),
            ...otherGoals.map((g) => goalRowItem(g))
          )
        : null,
      el(
        'div',
        { class: 'goal-foot' },
        el('span', { class: 'cell-sub' }, `${fa(goal.yearNormal)} عادی • ${fa(goal.yearReferrals)} ارجاع/خاص — جمع سال ${fa(goal.yearDone)}`),
        canOpenScreening
          ? el(
              'button',
              { class: 'btn btn--soft btn--sm', onclick: () => { location.hash = '#/screening'; } },
              'مشاهدهٔ سنجش روزانه'
            )
          : null
      ),
      goal.monthlyTarget !== null && !otherGoals.some((g) => g.mode === 'month')
        ? el('div', { class: 'cell-sub', style: { textAlign: 'center', marginTop: 'var(--sp-2)' } }, `هدف ماه جاری: ${fa(goal.monthlyDone)} از ${fa(goal.monthlyTarget)}`)
        : null
    )
  );
}
