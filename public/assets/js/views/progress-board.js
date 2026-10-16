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
import { el, icon, toastError, emptyState, skeletonState, errorState } from '../ui.js';
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
function boardRow(row, meId) {
  const isOpen = { v: false };
  const detail = el('div', { class: 'pb-row__detail', hidden: true });

  const usageChips = Object.entries(row.usageDetail)
    .filter(([, c]) => c > 0)
    .map(([action, c]) =>
      el('span', { class: 'badge badge--neutral' }, `${row.usageLabels[action] ?? action}: ${fa(c)}`)
    );

  detail.replaceChildren(
    el('div', { class: 'pb-detail-grid' },
      el('div', { class: 'pb-detail-cell' },
        el('div', { class: 'cell-sub' }, 'محتوا — تولید'),
        el('b', {}, `تمرین ${fa(row.content.exercises)} • بسته ${fa(row.content.packages)} • قالب ${fa(row.content.templates)} • فرم ${fa(row.content.forms)}`)),
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
      data.rows.map((r) => boardRow(r, meId)));
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
