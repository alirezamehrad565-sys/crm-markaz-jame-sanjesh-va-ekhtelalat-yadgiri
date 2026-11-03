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

  return el('div', { dataset: { notifId: String(n.id) }, style: {
    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
    padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--border)'
  } },
    el('div', { style: { flex: 1, minWidth: 0 } },
      el('div', { class: 'cell-main' }, templateLabel(n.template)),
      el('div', { class: 'cell-sub' }, meta.join(' · ') || '—'),
      n.lastError
        ? el('div', { class: 'cell-sub', style: { color: 'var(--danger)' } }, `خطا: ${n.lastError}`) /* fallback متریال حذف (S9-11) */
        : null
    ),
    statusBadge(n.status),
    actionButton ?? null
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

  function makeSection(key, title, hint) {
    const countBadge = el('span', { class: 'badge badge--neutral' });
    const bodyEl = el('div', {});
    const card = el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
      el('div', { style: { padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--border)' } },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
          el('h3', { style: { margin: 0 } }, title),
          countBadge
        ),
        el('p', { class: 'hint-text', style: { margin: '4px 0 0' } }, hint)
      ),
      bodyEl
    );
    sections[key] = { countBadge, bodyEl };
    return card;
  }

  function sectionBodyRow(key, n) {
    if (key === 'drafts') {
      return recordRow(n,
        el('button', { class: 'btn btn--primary btn--sm', onclick: () => release(n) }, icon('zap', 15), 'ارسال فوری'));
    }
    if (key === 'ready') {
      return recordRow(n,
        el('button', { class: 'btn btn--soft btn--sm', onclick: () => release(n) }, icon('zap', 15), 'ارسال فوری'));
    }
    return recordRow(n,
      el('button', { class: 'btn btn--soft btn--sm', onclick: () => release(n) }, icon('refresh', 15), 'تلاش دوباره'));
  }

  function renderSections() {
    for (const key of ['drafts', 'ready', 'failed']) {
      const arr = data[key] ?? [];
      const { countBadge, bodyEl } = sections[key];
      countBadge.textContent = fa(arr.length);
      bodyEl.replaceChildren(
        ...(arr.length
          ? arr.map((n) => sectionBodyRow(key, n))
          : [el('div', { class: 'sanj-widget__empty', style: { padding: 'var(--sp-4)' } }, icon('check', 15), el('span', {}, 'موردی در این بخش نیست'))])
      );
    }
    headBadge.textContent = `پیش‌نویس ${fa((data.drafts ?? []).length)} · آماده ${fa((data.ready ?? []).length)} · ناموفق ${fa((data.failed ?? []).length)}`;
    syncRetryBtn();
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

  const retryAllBtn = el('button', { class: 'btn btn--soft btn--sm', onclick: (e) => lockBtn(e.currentTarget, retryAll) }, icon('refresh', 15), 'تلاش دوبارهٔ همه');
  const retryRow = el('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, retryAllBtn);

  function syncRetryBtn() {
    const show = (data.failed ?? []).length > 0;
    if (show && !retryRow.isConnected) outlet.append(retryRow);
    if (!show && retryRow.isConnected) retryRow.remove();
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
      'اعلان‌های ثبت نوبت تا «ساعت ارسال» (پیش‌فرض ۱۸:۰۰) پیش‌نویس می‌مانند و یک‌جا می‌روند؛ تغییر، لغو، تکلیف و غیبت فوری ارسال می‌شوند.'), /* UX-ممیزی گلایهٔ ۶: پاراگراف ۵ خطی خلاصه شد — جزئیات در hint هر بخش */
    makeSection('drafts', 'پیش‌نویس‌ها (در انتظار ساعت ارسال)', 'با «ارسال فوری» پیش از ساعت مقرر هم می‌توانید بفرستید.'),
    makeSection('ready', 'آمادهٔ ارسال', 'اعلان‌های فوری که در چرخهٔ بعدی (چند دقیقه) ارسال می‌شوند.'),
    makeSection('failed', 'ناموفق‌ها', 'پس از ۵ تلاش رها شده‌اند — علت در ستون خطا؛ با «ارسال فوری» یا «تلاش دوبارهٔ همه» دوباره می‌روند.')
  );
  renderSections();
}
