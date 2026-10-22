import { api } from '../api.js';
import { el, icon, toast, toastError, emptyState, skeletonState, statusBadge } from '../ui.js';
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

function sectionCard(title, hint, items, actionsBuilder) {
  const rows = items.length
    ? items.map(actionsBuilder)
    : [el('div', { class: 'hint-text', style: { padding: 'var(--sp-3)' } }, '— ردیفی نیست —')];

  return el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
    el('div', { style: { padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--border)' } },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
        el('h3', { style: { margin: 0 } }, title),
        el('span', { class: 'badge badge--neutral' }, fa(items.length))
      ),
      el('p', { class: 'hint-text', style: { margin: '4px 0 0' } }, hint)
    ),
    el('div', {}, ...rows)
  );
}

function recordRow(n, actionButton) {
  const meta = [];
  if (n.recipient) meta.push(`مقصد: ${n.recipient}`);
  if (n.sendAt) meta.push(`ارسال: ${formatJalaliDateTime(n.sendAt)}`);
  if (n.sentAt) meta.push(`فرستاده‌شده: ${formatJalaliDateTime(n.sentAt)}`);
  if (n.attempts > 0) meta.push(`تلاش: ${fa(n.attempts)}`);

  return el('div', { style: {
    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
    padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--border)'
  } },
    el('div', { style: { flex: 1, minWidth: 0 } },
      el('div', { class: 'cell-main' }, templateLabel(n.template)),
      el('div', { class: 'cell-sub' }, meta.join(' · ') || '—'),
      n.lastError
        ? el('div', { class: 'cell-sub', style: { color: 'var(--danger, #b3261e)' } }, `خطا: ${n.lastError}`)
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

  const { drafts, ready, failed } = data;

  const refresh = () => renderOutbox(outlet);

  async function release(n) {
    try {
      await api.post(`/api/notifications/${n.id}/release`);
      toast('اعلان ارسال شد', 'success');
      refresh();
    } catch (err) {
      toastError(err);
    }
  }

  async function retryAll() {
    try {
      const res = await api.post('/api/notifications/failed/retry');
      const retried = res.data ?? 0;
      toast(`تلاش دوباره برای ${fa(retried)} اعلان ناموفق انجام شد`, 'success');
      refresh();
    } catch (err) {
      toastError(err);
    }
  }

  const retryAllBtn = failed.length
    ? el('button', { class: 'btn btn--soft btn--sm', onclick: retryAll }, icon('refresh', 15), 'تلاش دوبارهٔ همه')
    : null;

  outlet.replaceChildren(
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'صندوق اعلان‌ها'),
      el('span', { class: 'badge badge--neutral' },
        `پیش‌نویس ${fa(drafts.length)} · آماده ${fa(ready.length)} · ناموفق ${fa(failed.length)}`)
    ),
    el('p', { class: 'hint-text', style: { marginTop: '0' } },
      'اعلان «ثبت نوبت جدید» تا «ساعت ارسال» روز (پیش‌فرض ۱۸:۰۰) پیش‌نویس می‌ماند و یک‌جا فرستاده می‌شود؛ تغییر، لغو، تکلیف و غیبت همیشه فوری می‌رود. پیش‌نویسِ منتظر را همین‌جا می‌توانید فوراً بفرستید.'),
    sectionCard(
      'پیش‌نویس‌ها (در انتظار ساعت ارسال)',
      'با «ارسال فوری» پیش از ساعت مقرر هم می‌توانید بفرستید.',
      drafts,
      (n) => recordRow(n,
        el('button', { class: 'btn btn--primary btn--sm', onclick: () => release(n) }, icon('zap', 15), 'ارسال فوری'))
    ),
    sectionCard(
      'آمادهٔ ارسال',
      'اعلان‌های فوری که در چرخهٔ بعدی (چند دقیقه) ارسال می‌شوند.',
      ready,
      (n) => recordRow(n,
        el('button', { class: 'btn btn--soft btn--sm', onclick: () => release(n) }, icon('zap', 15), 'ارسال فوری'))
    ),
    sectionCard(
      'ناموفق‌ها',
      'پس از ۵ تلاش رها شده‌اند — علت در ستون خطا؛ با «ارسال فوری» یا «تلاش دوبارهٔ همه» دوباره می‌روند.',
      failed,
      (n) => recordRow(n,
        el('button', { class: 'btn btn--soft btn--sm', onclick: () => release(n) }, icon('refresh', 15), 'تلاش دوباره'))
    ),
    retryAllBtn
      ? el('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, retryAllBtn)
      : null
  );
}
