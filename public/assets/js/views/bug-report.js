import { api } from '../api.js';
import { fa, formatJalaliNumeric } from '../format.js';
import { el, icon, toast, toastError, emptyState } from '../ui.js';
import { session } from '../state.js';

// ─── گزارش به پشتیبانی (۱.۲۵.۵۷ — ساده‌سازی به خواست کارفرما) ───
// همکار مشکل را تیک می‌زند و می‌فرستد؛ بقیه‌اش خودکار است: صفحهٔ موقع گزارش،
// نام گزارش‌دهنده و نسخهٔ سامانه بی‌سروصدا ضبط می‌شوند. پاسخ پشتیبانی شبکه
// (CP m8) در چرخهٔ دوطرفهٔ سرور pull و همین‌جا با نشان «پاسخ داده شد» می‌نشیند.
// شناسهٔ بخش‌ها هم‌قرارداد نقشهٔ برچسب پنل شبکه است — ناشناخته‌ها برچسب خام می‌گیرند.

const AREAS = [
  { id: 'appointments', label: 'نوبت‌دهی و تقویم' },
  { id: 'working-day', label: 'روز کاری' },
  { id: 'screening', label: 'سنجش روزانه' },
  { id: 'students', label: 'دانش‌آموزان و پرونده' },
  { id: 'treatment-plans', label: 'طرح درمان' },
  { id: 'exercises', label: 'کارت‌های آماده' },
  { id: 'games', label: 'بازی‌ها' },
  { id: 'reports', label: 'گزارش‌ها و شاخص‌ها' },
  { id: 'announcements', label: 'اعلان‌ها' },
  { id: 'finance', label: 'بودجه و مالی' },
  { id: 'staff', label: 'کارکنان و دسترسی‌ها' },
  { id: 'other', label: 'بخش دیگر / کلی' }
];

const SEVERITIES = [
  { id: 'minor', label: 'کم‌اهمیت' },
  { id: 'major', label: 'مهم' },
  { id: 'critical', label: 'بحرانی' }
];

const SEVERITY_CLS = { minor: 'badge--neutral', major: 'badge--accent', critical: 'badge--error' };
const STATUS_META = {
  open: { label: 'در صف ارسال', cls: 'badge--info' },
  sent: { label: 'ارسال‌شده', cls: 'badge--success' }
};

/** نسخهٔ سامانه از لینک base.css (?v=) — همان تکنیک چیپ نسخهٔ شل (app.js) */
function clientVersion() {
  const href = document.querySelector('link[rel="stylesheet"][href*="base.css"]')?.href ?? '';
  return href ? new URL(href).searchParams.get('v') : null;
}

const state = { areas: new Set(['other']), severity: 'major', sending: false };

function areaChip(area) {
  const active = state.areas.has(area.id);
  const btn = el(
    'button',
    {
      type: 'button',
      class: `chip${active ? ' is-active' : ''}`,
      dataset: { area: area.id },
      'aria-pressed': active ? 'true' : 'false',
      onclick: () => {
        const now = !state.areas.has(area.id);
        if (now) state.areas.add(area.id);
        else state.areas.delete(area.id);
        btn.classList.toggle('is-active', now);
        btn.setAttribute('aria-pressed', now ? 'true' : 'false');
      }
    },
    area.label
  );
  return btn;
}

function severityRadio(sev) {
  const id = `bug-sev-${sev.id}`;
  return el(
    'label',
    { class: 'bug-sev', for: id },
    el('input', {
      type: 'radio',
      id,
      name: 'bug-severity',
      value: sev.id,
      checked: state.severity === sev.id,
      onchange: () => { state.severity = sev.id; }
    }),
    el('span', {}, sev.label)
  );
}

/* ۱.۲۵.۵۷ — بلوک پاسخ پشتیبانی: فقط وقتی پاسخی رسیده باشد رندر می‌شود */
function replyBlock(rec) {
  if (!rec.reply_text) return null;
  return el(
    'div',
    {
      class: 'bug-reply',
      style: {
        borderInlineStart: '3px solid var(--success)',
        background: 'var(--success-soft)',
        borderRadius: 'var(--radius-2, 8px)',
        padding: 'var(--sp-2) var(--sp-3)',
        display: 'grid',
        gap: 'var(--sp-1)'
      }
    },
    el(
      'div',
      { style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' } },
      el('span', { class: 'badge badge--success' }, 'پاسخ پشتیبانی'),
      rec.replyAt
        ? el('span', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-3)' } }, formatJalaliNumeric(rec.replyAt.slice(0, 10)))
        : null
    ),
    el('p', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, rec.reply_text),
    rec.replyBy ? el('p', { style: { margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-3)' } }, rec.replyBy) : null
  );
}

function reportRow(rec) {
  const st = STATUS_META[rec.status] ?? STATUS_META.open;
  const areaLabels = (rec.areas ?? [])
    .map((a) => AREAS.find((x) => x.id === a)?.label ?? a)
    .join(' + ');
  const replied = Boolean(rec.reply_text);
  return el(
    'div',
    { class: 'bug-row', style: { display: 'grid', gap: 'var(--sp-2)' } },
    el(
      'div',
      { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' } },
      el('span', { class: `badge ${SEVERITY_CLS[rec.severity] ?? 'badge--neutral'}` }, SEVERITIES.find((s) => s.id === rec.severity)?.label ?? fa(rec.severity)),
      replied
        ? el('span', { class: 'badge badge--success' }, 'پاسخ داده شد')
        : el('span', { class: `badge ${st.cls}` }, st.label),
      rec.forwardedAt && !replied
        ? el('span', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-3)' } }, `تحویل: ${formatJalaliNumeric(rec.forwardedAt.slice(0, 10))}`)
        : null
    ),
    areaLabels ? el('p', { style: { margin: 0 } }, areaLabels) : null,
    rec.description ? el('p', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, rec.description) : null,
    replyBlock(rec),
    el(
      'p',
      { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-3)', margin: 0 } },
      [rec.staffName, formatJalaliNumeric(rec.createdAt.slice(0, 10))].filter(Boolean).map((t, i) => (i ? ` · ${t}` : t))
    ),
    rec.status === 'open' && rec.forwardError && !replied
      ? el('p', { style: { fontSize: 'var(--fs-xs)', color: 'var(--error)', margin: 0 } }, `خطای ارسال — تلاش دورهٔ بعد: ${rec.forwardError}`)
      : null
  );
}

export async function renderBugReport(container) {
  container.replaceChildren(el('p', { style: { color: 'var(--text-3)' } }, 'در حال بارگذاری…'));

  const chips = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' } }, ...AREAS.map(areaChip));
  const sevWrap = el(
    'div',
    { style: { display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' } },
    ...SEVERITIES.map(severityRadio)
  );
  const desc = el('textarea', {
    class: 'input',
    rows: 4,
    maxlength: 2000,
    style: { width: '100%' },
    placeholder: 'توضیح مشکل (اختیاری اگر بخشی تیک خورده باشد)',
    'aria-label': 'توضیح مشکل'
  });

  const submitBtn = el(
    'button',
    { class: 'btn btn--primary', type: 'submit' },
    icon('send', 16),
    'ارسال'
  );

  const form = el(
    'form',
    {
      class: 'card',
      style: { display: 'grid', gap: 'var(--sp-2)' },
      onsubmit: async (e) => {
        e.preventDefault();
        if (state.sending) return;
        if (state.areas.size === 0 && !desc.value.trim()) {
          toast('حداقل یک بخش را تیک بزنید یا توضیح بنویسید', 'warning');
          return;
        }
        state.sending = true;
        submitBtn.disabled = true;
        try {
          await api.post('/api/bug-reports', {
            areas: [...state.areas],
            severity: state.severity,
            description: desc.value.trim() || null,
            page: location.hash || null,
            app_version: clientVersion()
          });
          toast('گزارش ثبت شد — خودکار به پشتیبانی می‌رود', 'success');
          desc.value = '';
          state.areas.clear();
          state.areas.add('other');
          chips.querySelectorAll('.chip').forEach((c) => {
            const on = c.dataset.area === 'other';
            c.classList.toggle('is-active', on);
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          await loadList();
        } catch (err) {
          toastError(err);
        } finally {
          state.sending = false;
          submitBtn.disabled = false;
        }
      }
    },
    el('h2', { class: 'card__title' }, 'گزارش به پشتیبانی'),
    el(
      'p',
      { style: { color: 'var(--text-3)', fontSize: 'var(--fs-sm)', margin: 0 } },
      'مشکل را تیک بزنید و بفرستید — صفحه، نام شما و نسخهٔ سامانه خودکار ضبط می‌شود.'
    ),
    el('p', { style: { fontWeight: 600, margin: 0 } }, 'کدام بخش؟'),
    chips,
    el('p', { style: { fontWeight: 600, margin: 0 } }, 'شدت'),
    sevWrap,
    desc,
    submitBtn
  );

  const listBox = el('div', { class: 'card', style: { display: 'grid', gap: 'var(--sp-2)' } });

  async function loadList() {
    try {
      const res = await api.get('/api/bug-reports');
      const items = res?.data ?? [];
      listBox.replaceChildren(
        el('h2', { class: 'card__title' }, 'گزارش‌های پیشین'),
        items.length === 0
          ? emptyState({ iconName: 'check', title: 'هنوز گزارشی ثبت نشده', hint: 'اولین گزارش را همین بالا بفرستید.' })
          : el('div', { style: { display: 'grid', gap: 'var(--sp-3)' } }, ...items.map(reportRow))
      );
    } catch (err) {
      toastError(err);
      listBox.replaceChildren();
    }
  }

  await loadList();
  container.replaceChildren(
    el(
      'div',
      { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--sp-3)', alignItems: 'start' } },
      form,
      listBox
    )
  );
}
