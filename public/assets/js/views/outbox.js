import { api } from '../api.js';
import { el, icon, toast, toastError, emptyState, skeletonState, statusBadge, collapseRemove, lockBtn } from '../ui.js';
import { fa, formatJalaliDateTime } from '../format.js';

const TEMPLATE_LABELS = {
  appointment_created: 'ثبت نوبت → خانواده',
  appointment_moved: 'تغییر نوبت',
  appointment_cancelled: 'لغو نوبت',
  appointment_reminder: 'یادآور نوبت',
  staff_appointment_created: 'ثبت نوبت → همکار',
  staff_appointment_moved: 'تغییر نوبت → همکار',
  staff_appointment_cancelled: 'لغو نوبت → همکار',
  teacher_appointment_created: 'ثبت نوبت → معلم کلاس',
  attendance_absent: 'غیبت دانش‌آموز',
  digest_staff: 'خلاصهٔ روز → همکار',
  digest_family: 'خلاصهٔ روز → خانواده',
  digest_class: 'خلاصهٔ روز → معلم کلاس',
  followup_nudge: 'یادآور پیگیری',
  waitlist_slot_freed: 'نوبت خالی شد → دفتر',
  report_to_teacher: 'گزارش → معلم کلاس',
  exercise_assigned: 'تکلیف جدید',
  bot_kpi: 'گزارش KPI هفتگی',
  announcement: 'اعلان عمومی'
};

function templateLabel(t) {
  return TEMPLATE_LABELS[t] ?? t;
}

/* sectionCard قدیمی با makeSection درجای renderOutbox یکی شد (۱.۲۱.۰) */

function recordRow(n, actionButton) {
  const meta = [];
  if (n.recipient) meta.push(`مقصد: ${n.recipient}`);
  if (n.sendAt) meta.push(`ارسال: ${formatJalaliDateTime(n.sendAt)}`);
  if (n.sentAt) meta.push(`فرستاده‌شده: ${formatJalaliDateTime(n.sentAt)}`);
  if (n.attempts > 0) meta.push(`تلاش: ${fa(n.attempts)}`);

  /* ۱.۲۵.۱۰ — ساختار کلاس‌دار: در موبایل متن و کنش‌ها دو ردیف می‌شوند (بدون له‌شدن)؛
     متای خالی دیگر «—» بیهوده رندر نمی‌شود. */
  return el('div', { class: 'ob-row', dataset: { notifId: String(n.id) } },
    el('div', { class: 'ob-row__main' },
      el('div', { class: 'cell-main' }, templateLabel(n.template)),
      meta.length ? el('div', { class: 'cell-sub' }, meta.join(' · ')) : null,
      n.lastError
        ? el('div', { class: 'cell-sub', style: { color: 'var(--danger)' } }, `خطا: ${n.lastError}`) /* fallback متریال حذف (S9-11) */
        : null
    ),
    el('div', { class: 'ob-row__side' },
      statusBadge(n.status),
      actionButton ?? null
    )
  );
}

export async function renderOutbox(outlet) {
  outlet.replaceChildren(skeletonState('list', 6));
  let data;
  try {
    data = (await api.get('/api/notifications/outbox')).data;
  } catch (err) {
    outlet.replaceChildren(emptyState({
      iconName: 'alert',
      title: 'بارگذاری صندوق اعلان‌ها ناموفق بود',
      hint: err?.message ?? 'خطای نامشخص'
    }));
    return;
  }

  /* —— ۱.۲۱.۰ جریان پیوسته (زبان ۱.۱۹/۱.۲۰): شِل صفحه یک‌بار مونت می‌شود؛
     «ارسال فوری» ردیف خودش را جمع‌وشون می‌کند و بج‌های شمارش را درجا به‌روز می‌کند؛
     «تلاش دوبارهٔ همه» فقط بدنهٔ سه بخش را بی‌صدا همگام می‌کند.
     دیگر هیچ اکشنی کل صندوق را با اسکلت rebuild نمی‌کند. —— */

  const headBadge = el('span', { class: 'badge badge--neutral' });
  const sections = {};

  /* ۱.۲۵.۱۰ — «تلاش دوبارهٔ همه» از پایین صفحه به سربرگِ همان بخش «ناموفق‌ها» رفت
     (نزدیکی کنش به داده‌اش) — قبلاً دکمه‌ای رها در انتهای صفحه بود. */
  const retryAllBtn = el('button', { class: 'btn btn--soft btn--sm', style: { marginInlineStart: 'auto' }, onclick: (e) => lockBtn(e.currentTarget, retryAll) }, icon('refresh', 15), 'تلاش دوبارهٔ همه');

  function makeSection(key, title, hint, extraHead) {
    const countBadge = el('span', { class: 'badge badge--neutral' });
    const bodyEl = el('div', {});
    const card = el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
      el('div', { class: 'ob-section__head' },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
          el('h3', { style: { margin: 0 } }, title),
          countBadge,
          extraHead ?? null
        ),
        hint ? el('p', { class: 'hint-text', style: { margin: '4px 0 0' } }, hint) : null
      ),
      bodyEl
    );
    sections[key] = { countBadge, bodyEl };
    return card;
  }

  function sectionBodyRow(key, n) {
    if (key === 'drafts') {
      return recordRow(n,
        el('button', { class: 'btn btn--primary btn--sm', onclick: (e) => lockBtn(e.currentTarget, () => release(n)) }, icon('zap', 15), 'ارسال فوری'));
    }
    if (key === 'ready') {
      return recordRow(n,
        el('button', { class: 'btn btn--soft btn--sm', onclick: (e) => lockBtn(e.currentTarget, () => release(n)) }, icon('zap', 15), 'ارسال فوری'));
    }
    return recordRow(n,
      el('button', { class: 'btn btn--soft btn--sm', onclick: (e) => lockBtn(e.currentTarget, () => release(n)) }, icon('refresh', 15), 'تلاش دوباره'));
  }

  function renderSections() {
    for (const key of ['drafts', 'ready', 'failed']) {
      const arr = data[key] ?? [];
      const { bodyEl } = sections[key];
      bodyEl.replaceChildren(
        ...(arr.length
          ? arr.map((n) => sectionBodyRow(key, n))
          : [el('div', { class: 'sanj-widget__empty', style: { padding: 'var(--sp-4)' } }, icon('check', 15), el('span', {}, 'موردی در این بخش نیست'))])
      );
    }
    updateBadges(); /* بج‌ها/هدر/دکمهٔ تلاش‌دوباره فقط از یک‌جا — منطق تکراری حذف شد */
  }

  /* فقط بج‌های شمارش و دکمهٔ تلاش‌دوباره — بدون دست‌زدن به بدنه‌ها (انیمیشن جمع‌شدن سالم می‌ماند) */
  function updateBadges() {
    for (const key of ['drafts', 'ready', 'failed']) {
      sections[key].countBadge.textContent = fa((data[key] ?? []).length);
    }
    headBadge.textContent = `پیش‌نویس ${fa((data.drafts ?? []).length)} · آماده ${fa((data.ready ?? []).length)} · ناموفق ${fa((data.failed ?? []).length)}`;
    syncRetryBtn();
  }

  /* پس از پایان انیمیشن جمع‌شدن، حالت خالی هر بخشی که تخلیه شده بنشیند */
  function paintEmptyIfDrained() {
    if (!outlet.isConnected) return;
    for (const key of ['drafts', 'ready', 'failed']) {
      const { bodyEl } = sections[key];
      if ((data[key] ?? []).length === 0 && !bodyEl.querySelector('[data-notif-id]')) {
        bodyEl.replaceChildren(el('div', { class: 'sanj-widget__empty', style: { padding: 'var(--sp-4)' } }, icon('check', 15), el('span', {}, 'موردی در این بخش نیست')));
      }
    }
  }

  function syncRetryBtn() {
    const show = (data.failed ?? []).length > 0;
    retryAllBtn.style.display = show ? '' : 'none';
  }

  async function release(n) {
    try {
      await api.post(`/api/notifications/${n.id}/release`);
      toast('اعلان ارسال شد', 'success');
      // — حذف محلی از بخش خودش + جمع‌شدن نرم همان ردیف؛ بج‌ها درجا
      for (const key of ['drafts', 'ready', 'failed']) {
        const arr = data[key] ?? [];
        const i = arr.findIndex((x) => x.id === n.id);
        if (i >= 0) { arr.splice(i, 1); break; }
      }
      const row = outlet.querySelector(`[data-notif-id="${CSS.escape(String(n.id))}"]`);
      if (row) collapseRemove(row);
      updateBadges(); // فقط بج‌ها درجا؛ بدنه‌ها و انیمیشن دست‌نخورده
      setTimeout(paintEmptyIfDrained, 300);
    } catch (err) {
      toastError(err);
    }
  }

  async function retryAll() {
    try {
      const res = await api.post('/api/notifications/failed/retry');
      const retried = res.data ?? 0;
      toast(`تلاش دوباره برای ${fa(retried)} اعلان ناموفق انجام شد`, 'success');
      data = (await api.get('/api/notifications/outbox')).data; // — همگام‌سازی بی‌صدا؛ بدون اسکلت
      renderSections();
    } catch (err) {
      toastError(err);
    }
  }

  outlet.replaceChildren(
    el('div', { class: 'page-head' },
      el('h2', { class: 'page-head__title' }, 'صندوق اعلان‌ها') /* S9-04 */,
      headBadge
    ),
    el('p', { class: 'hint-text', style: { marginTop: '0' } },
      'اعلان‌های ثبت نوبت تا «ساعت ارسال» (پیش‌فرض ۱۸:۰۰) پیش‌نویس می‌مانند؛ بقیه فوری می‌روند.'),
    makeSection('drafts', 'پیش‌نویس‌ها (در انتظار ساعت ارسال)', 'ارسال پیش از موعد با «ارسال فوری».'),
    makeSection('ready', 'آمادهٔ ارسال', 'در چرخهٔ بعدی (چند دقیقه) خودکار می‌رود.'),
    makeSection('failed', 'ناموفق‌ها', 'پس از ۵ تلاش متوقف شده‌اند — علت در خطای ردیف.', retryAllBtn)
  );
  renderSections();
}
