/**
 * نمای برد پیشرفت
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// progress-board.js — تابلوی پیشرفت درمانگران — مؤلفهٔ تعبیه‌شدنی
//
// خواست کاربر:
// «نه این منوی جدید اضافه کاریه — همون سیستم قبلی یعنی به مدیر نشون بده تو
// قسمت کارکنان و درمانگران؛ تو داشبورد کارت تابلوی پیشرفت رو ببینن به صورت
// خلاصه بدون اینکه از فرمول مطلع بشن»
// «بخش های مختلف امتیاز بندی که تو سایت پراکنده شده یکپارچه بشه و محدود بشه
// به این دو قسمت»
//
// → این مؤلفه فقط در «کارکنان» (نمای مدیر) تعبیه می‌شود؛ داشبورد کارت خلاصهٔ
// خودش را جدا دارد. پنل فرمول حذف شد — وزن‌ها فقط سمت سرور می‌مانند.
// سرچشمهٔ امتیاز: فرمول سراسری = محتوا (تولید/استفاده/ارجاع) + استفادهٔ واقعی
// سامانه از audit_log — محاسبهٔ زندهٔ فقط-خواندنی از /api/scoring/board.

import { api } from '../api.js';
import { el, icon, toastError, emptyState, skeletonState, errorState, openModal } from '../ui.js';
import { fa, formatJalaliNumeric, tehranYmdOfIso, tehranTimeOfIso } from '../format.js';
import { session } from '../state.js';

const ROLE_LABELS = { manager: 'مدیر', therapist: 'درمانگر', secretary: 'منشی', supervisor: 'ناظر' };
const PERIOD_TABS = [
  { key: 'all', label: 'کل دوره' },
  { key: 'month', label: '۳۰ روز اخیر' },
  { key: 'week', label: '۷ روز اخیر' }
];

function roleChip(role) {
  return el('span', { class: 'cell-sub' }, ROLE_LABELS[role] ?? role);
}

/** — عدد فارسی با ممیزِ فارسی: «۱۰٫۵» — وزن تیمی ۰٫۵ شمارش تمرین‌ها را اعشاری می‌کند (m140) */
function faScore(n) {
  const v = Math.round(Number(n) * 100) / 100;
  if (!Number.isFinite(v)) return fa(0);
  return fa(Number.isInteger(v) ? String(v) : String(v).replace('.', '٫'));
}

/** سکوی قهرمانی — سه نفر اول */
function podium(rows, meId) {
  const top = rows.filter((r) => r.total > 0).slice(0, 3);
  if (!top.length) return null;
  const medalIcons = ['trophy', 'medal', 'star'];
  return el('div', { class: 'pb-podium' },
    top.map((r, i) =>
      el('div', { class: `pb-podium__card pb-podium__card--${i + 1}${r.staffId === meId ? ' is-me' : ''}` },
        el('div', { class: 'pb-podium__rank' }, icon(medalIcons[i], 22)),
        el('div', { class: 'pb-podium__name' }, r.fullName),
        el('div', { class: 'pb-podium__score' }, fa(r.total), el('span', { class: 'cell-sub' }, ' امتیاز')),
        el('div', { class: 'pb-podium__meta' }, roleChip(r.role))
      )
    )
  );
}

/** ردیف تفصیلی یک همکار — کلیک = باز/بسته شدن تفکیک (شمارش واقعی، بدون وزن) */
function boardRow(row, meId, period) {
  const isOpen = { v: false };
  const detail = el('div', { class: 'pb-row__detail', hidden: true });

  const usageChips = Object.entries(row.usageDetail)
    .filter(([, c]) => c > 0)
    .map(([action, c]) =>
      el('span', { class: 'badge badge--neutral' }, `${row.usageLabels[action] ?? action}: ${fa(c)}`)
    );

  // — جزئیات کامل امتیاز (m140): هر سطر دکمهٔ خودش را دارد؛ باز کردن مودال با دریافت
  //   تنبلِ GET /api/scoring/explain?staffId=…&period=<دورهٔ فعلی تابلو> — خطا هرگز تابلو را نمی‌شکند
  const explainBtn = el(
    'button',
    {
      class: 'btn btn--ghost btn--sm',
      type: 'button',
      onclick: () => openExplainModal(row, period)
    },
    icon('clipboard', 14),
    'جزئیات امتیاز و شمارش'
  );

  detail.replaceChildren(
    el('div', { class: 'pb-detail-tools' },
      explainBtn,
      el('span', { class: 'cell-sub' }, 'اقلام شمرده‌شده و محاسبهٔ امتیاز همین دوره')),
    el('div', { class: 'pb-detail-grid' },
      el('div', { class: 'pb-detail-cell' },
        el('div', { class: 'cell-sub' }, 'محتوا — تولید'),
        el('b', {}, `تمرین ${faScore(row.content.exercises)} • بسته ${faScore(row.content.packages)} • قالب ${faScore(row.content.templates)} • فرم ${faScore(row.content.forms)}`)),
      el('div', { class: 'pb-detail-cell' },
        el('div', { class: 'cell-sub' }, 'محتوا — استفاده و ارجاع'),
        el('b', {}, `تکلیف ${fa(row.content.exerciseUses)} • مسیر از قالب ${fa(row.content.templateUses)} • فرم ${fa(row.content.formFills)}`)),
      el('div', { class: 'pb-detail-cell' },
        el('div', { class: 'cell-sub' }, 'استفاده از سامانه'),
        el('b', {}, `${fa(row.usagePoints)} امتیاز`,
          row.usageCapped ? el('span', { class: 'badge badge--neutral', style: { marginInlineStart: 'var(--sp-2)' } }, 'سقف فعالیت اداری') : null),
        el('div', { class: 'pb-detail-chips' }, ...(usageChips.length ? usageChips : [el('span', { class: 'cell-sub' }, 'فعالیت ثبت‌شده‌ای در این دوره نیست')]))
      )
    )
  );

  const rowEl = el('button', {
    class: `pb-row${row.staffId === meId ? ' is-me' : ''}`,
    type: 'button',
    onclick: () => {
      isOpen.v = !isOpen.v;
      detail.hidden = !isOpen.v;
      rowEl.classList.toggle('is-open', isOpen.v);
    }
  },
    el('span', { class: 'pb-row__rank' }, row.total > 0 ? fa(row.rank) : '—'),
    el('span', { class: 'pb-row__name' },
      el('b', {}, row.fullName, row.staffId === meId ? el('span', { class: 'badge badge--info pb-you' }, 'شما') : null),
      roleChip(row.role),
      !row.active ? el('span', { class: 'badge badge--neutral' }, 'غیرفعال') : null),
    el('span', { class: 'pb-row__score' }, fa(row.total))
  );

  return el('div', { class: 'pb-rowwrap' }, rowEl, detail);
}

// ── m140 — جزئیات امتیاز (پاسخ GET /api/scoring/explain) ─────────────────────

/** سکشن داخل مودال جزئیات — سربرگ + خلاصهٔ شمارش + بدنه */
function explainSection(title, summary, ...body) {
  return el('div', { class: 'pb-explain__sec' },
    el('div', { class: 'pb-explain__sec-head' },
      el('b', {}, title),
      el('span', { class: 'cell-sub' }, summary)),
    ...body);
}

/** ردیف یک قلم شمرده‌شده — عنوان + نشان اختیاری (تیمی/شمارش) + عدد اختیاری */
function explainItem(titleText, badgeText, valueText) {
  return el('div', { class: 'pb-explain__item' },
    el('span', { class: 'pb-explain__item-title', title: titleText }, titleText),
    badgeText ? el('span', { class: 'badge badge--neutral' }, badgeText) : null,
    valueText ? el('span', { class: 'pb-explain__item-w' }, valueText) : null);
}

/**
 * بدنهٔ مودال «جزئیات امتیاز» پس از رسیدن پاسخ explain.
 * شکل قرارداد: staff/content{exercises,packages,templates,forms}/usage/totals —
 * هر فیلد غایب با پیش‌فرض خنثی جبران می‌شود تا پاسخ ناقص هرگز مودال را نشکند.
 */
function renderExplain(d) {
  const c = d.content ?? {};
  const ex = c.exercises ?? { count: 0, weighted: 0, items: [] };
  const pk = c.packages ?? { count: 0, weight: 0, items: [] };
  const tp = c.templates ?? { count: 0, weight: 0, items: [] };
  const fm = c.forms ?? { count: 0, weight: 0, items: [] };
  const u = d.usage ?? {};
  const t = d.totals ?? {};
  const emptyNote = () => el('span', { class: 'cell-sub' }, 'در این دوره موردی نیست');

  // سربرگ — همکار + دوره + شروع شمارش + زمان محاسبه (جلالی، وقت تهران)
  const head = el('div', { class: 'pb-explain__head' },
    el('b', {}, `${d.staff?.fullName ?? '—'}${d.staff?.role ? ` — ${ROLE_LABELS[d.staff.role] ?? d.staff.role}` : ''}`),
    el('span', { class: 'cell-sub' }, `دوره: ${d.periodLabel ?? d.period ?? '—'}`),
    d.since ? el('span', { class: 'cell-sub' }, `شروع شمارش امتیازها: ${formatJalaliNumeric(tehranYmdOfIso(d.since))}`) : null,
    d.generatedAt
      ? el('span', { class: 'cell-sub' },
        `محاسبه: ${formatJalaliNumeric(tehranYmdOfIso(d.generatedAt))} — ${fa(String(tehranTimeOfIso(d.generatedAt)))}`)
      : null);

  // تمرین‌ها — قلم‌به‌قلم با وزن مؤثر (تمرین تیمی = نصف)
  const exItems = (ex.items ?? []).map((it) =>
    explainItem(it.title ?? it.id, it.teamCreated ? 'تیمی → نصف امتیاز' : null,
      `${faScore(it.effectiveWeight)} امتیاز`));
  const exSec = explainSection('تمرین‌های شمرده‌شده',
    `${faScore(ex.count)} مورد — جمع وزن‌دار ${faScore(ex.weighted)} امتیاز`,
    el('div', { class: 'pb-explain__items' }, ...(exItems.length ? exItems : [emptyNote()])));

  // بسته‌ها / قالب‌ها / فرم‌ها — شمارش + جمع وزن (امتیاز) + فهرست عناوین
  const listSec = (label, box, nameKey) => {
    const items = (box.items ?? []).map((it) => explainItem(it[nameKey] ?? it.id, null, null));
    return explainSection(label,
      `${fa(box.count ?? 0)} مورد — جمع وزن‌دار ${faScore(box.weighted ?? (box.count ?? 0) * (box.weight ?? 0))} امتیاز`,
      el('div', { class: 'pb-explain__items' }, ...(items.length ? items : [emptyNote()])));
  };

  // اقدام‌های سامانه — برچسب × شمارش = امتیاز؛ با سقف اداری اگر خورده باشد
  const actions = (u.actions ?? []).filter((a) => (a.count ?? 0) > 0);
  const usageItems = actions.map((a) =>
    explainItem(a.label ?? a.action, `${fa(a.count ?? 0)} بار`, `${faScore(a.points ?? 0)} امتیاز`));
  const usageSec = explainSection('اقدام‌های سامانه',
    u.capped
      ? `خام ${faScore(u.rawPoints ?? 0)} → اعمال‌شده ${faScore(u.appliedPoints ?? 0)}`
      : `${faScore(u.rawPoints ?? 0)} امتیاز`,
    u.capped
      ? el('div', { class: 'pb-explain__cap' }, `سقف اداری: ${faScore(u.adminCap ?? 0)} → اعمال‌شده ${faScore(u.appliedPoints ?? 0)}`)
      : null,
    el('div', { class: 'pb-explain__items' },
      ...(usageItems.length ? usageItems : [el('span', { class: 'cell-sub' }, 'فعالیت ثبت‌شده‌ای در این دوره نیست')])));

  // پانوشت — مجموع‌ها + رتبه
  const totals = el('div', { class: 'pb-explain__totals' },
    el('div', { class: 'pb-explain__total' }, el('span', { class: 'cell-sub' }, 'مجموع محتوا'), el('b', {}, faScore(t.contentScore ?? 0))),
    el('div', { class: 'pb-explain__total' }, el('span', { class: 'cell-sub' }, 'استفادهٔ سامانه'), el('b', {}, faScore(t.usagePoints ?? 0))),
    el('div', { class: 'pb-explain__total pb-explain__total--sum' }, el('span', { class: 'cell-sub' }, 'کل امتیاز'), el('b', {}, faScore(t.total ?? 0))),
    el('div', { class: 'pb-explain__total' }, el('span', { class: 'cell-sub' }, 'رتبه'), el('b', {}, t.rank ? fa(t.rank) : '—')));

  return el('div', { class: 'pb-explain' },
    head,
    exSec,
    listSec('بسته‌ها', pk, 'title'),
    listSec('قالب‌ها', tp, 'title'),
    listSec('فرم‌ها', fm, 'name'),
    usageSec,
    totals);
}

/** مودال جزئیات امتیاز — دریافت تنبل؛ خطا درون مودال نشان داده می‌شود و تابلو سالم می‌ماند */
function openExplainModal(row, period) {
  const box = el('div', { class: 'pb-explain' },
    el('div', { class: 'pb-explain__loading' }, 'در حال دریافت جزئیات امتیاز…'));
  openModal({
    title: `جزئیات امتیاز — ${row.fullName}`,
    wide: true,
    body: box,
    actions: [(close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'بستن')]
  });
  api.get(`/api/scoring/explain?staffId=${encodeURIComponent(row.staffId)}&period=${encodeURIComponent(period)}`)
    .then(({ data }) => box.replaceChildren(renderExplain(data ?? {})))
    .catch((err) => box.replaceChildren(
      el('div', { class: 'pb-explain__error' },
        el('b', {}, 'دریافت جزئیات ناموفق بود'),
        el('span', { class: 'cell-sub' }, err?.message ?? ''))));
}

/**
 * تابلوی پیشرفت درمانگران — مؤلفهٔ تعبیه‌شدنی در بخش «کارکنان» (مدیر).
 * بازهٔ زمانی + سکو + رتبه‌بندی با تفکیک بازشدنی — بدون نمایش فرمول.
 */
export function renderProgressBoardCard(container) {
  const tabs = el('div', { class: 'pb-tabs' },
    PERIOD_TABS.map((t) =>
      el('button', { class: 'btn btn--sm pb-tab', 'data-period': t.key, onclick: () => load(t.key) }, t.label)
    ));

  const body = el('div', {});
  container.replaceChildren(tabs, body);

  let currentPeriod = 'all';

  async function load(period) {
    currentPeriod = period;
    tabs.querySelectorAll('.pb-tab').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.period === period));
    body.replaceChildren(skeletonState('table', 5));
    try {
      const { data } = await api.get(`/api/scoring/board?period=${encodeURIComponent(period)}`);
      if (currentPeriod !== period) return; // پاسخ کهنه — کاربر دورهٔ دیگری زده
      render(data);
    } catch (err) {
      body.replaceChildren(errorState(err?.message ?? 'خطا در دریافت تابلو', () => load(period)));
    }
  }

  function render(data) {
    const meId = session.user?.staffId;
    if (!data.rows.length) {
      body.replaceChildren(emptyState({ iconName: 'users', title: 'همکاری ثبت نشده است' }));
      return;
    }
    const board = el('div', { class: 'card card__body--flush pb-board' },
      data.rows.map((r) => boardRow(r, meId, currentPeriod)));
    const podiumEl = podium(data.rows, meId);
    const updatedAt = `${formatJalaliNumeric(tehranYmdOfIso(data.generatedAt))} — ${fa(String(tehranTimeOfIso(data.generatedAt)))}`;
    // شروع دورهٔ امتیاز (صفرسازی): هر فعالیتی قبل از این تاریخ در تابلو نیست
    const sinceNote = data.since
      ? `شروع شمارش امتیازها: ${formatJalaliNumeric(tehranYmdOfIso(data.since))}`
      : null;

    body.replaceChildren(
      ...(podiumEl ? [podiumEl] : [emptyState({ iconName: 'trendingUp', title: 'هنوز امتیازی ثبت نشده', hint: 'با ثبت نوبت، پرونده، گزارش یا محتوا امتیاز جمع می‌کند' })]),
      board,
      el('div', { class: 'cell-sub', style: { margin: 'var(--sp-3) 0 var(--sp-4)' } },
        `محاسبهٔ زنده از فعالیت واقعی سامانه${sinceNote ? ` — ${sinceNote}` : ''} — ${updatedAt}`)
    );
  }

  load('all').catch((err) => toastError(err));
}
