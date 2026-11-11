import { api } from '../api.js';
import { fa, formatJalaliNumeric } from '../format.js';
import { el, icon, toast, toastError, emptyState } from '../ui.js';
import { session } from '../state.js';

// ─── گزارش به پشتیبانی (۱.۲۵.۶۴ — نقد اسکرین‌شات و رفع ایرادهای UI/UX) ───
// همکار مشکل را تیک می‌زند و می‌فرستد؛ بقیه‌اش خودکار است: صفحهٔ موقع گزارش،
// نام گزارش‌دهنده و نسخهٔ سامانه بی‌سروصدا ضبط می‌شوند. پاسخ پشتیبانی شبکه
// (CP m8) در چرخهٔ دوطرفهٔ سرور pull و همین‌جا با نشان «پاسخ داده شد» می‌نشیند.
// ۱.۲۵.۶۴: قرارداد فیلد نما با سرور هم‌قرارداد شد (snake_case: created_at، staff_name،
// forward_error، reply_at، reply_by — خطای «slice» و خالی‌شدن کل کارت ریشه‌کن شد)،
// ساختار کارت استاندارد card__head/card__body، لیبل‌ها field__label، شمارنده در سطر
// لیبل توضیح، دکمهٔ ارسال در ردیف actions، خطای بارگیری فهرست با «تلاش مجدد» درون‌کارت.
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

/* قرص شدت: input نامرئی + span استایل‌دار (.bug-sev در components.css) */
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

/* بلوک پاسخ پشتیبانی — فیلدهای snake_case هم‌قرارداد shape() سرور */
function replyBlock(rec) {
  if (!rec.reply_text) return null;
  return el(
    'div',
    { class: 'bug-reply' },
    el(
      'div',
      { class: 'bug-row__head' },
      el('span', { class: 'badge badge--success' }, 'پاسخ پشتیبانی'),
      rec.reply_at
        ? el('span', { class: 'field__hint' }, formatJalaliNumeric(rec.reply_at.slice(0, 10)))
        : null
    ),
    el('p', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, rec.reply_text),
    rec.reply_by ? el('p', { class: 'field__hint', style: { margin: 0 } }, rec.reply_by) : null
  );
}

/* ردیف گزارش کارت‌مانند — فیلدهای snake_case هم‌قرارداد shape() سرور */
function reportRow(rec) {
  const st = STATUS_META[rec.status] ?? STATUS_META.open;
  const areaLabels = (rec.areas ?? [])
    .map((a) => AREAS.find((x) => x.id === a)?.label ?? a)
    .join(' + ');
  const replied = Boolean(rec.reply_text);
  return el(
    'div',
    { class: 'bug-row' },
    el(
      'div',
      { class: 'bug-row__head' },
      el('span', { class: `badge ${SEVERITY_CLS[rec.severity] ?? 'badge--neutral'}` }, SEVERITIES.find((s) => s.id === rec.severity)?.label ?? fa(rec.severity)),
      replied
        ? el('span', { class: 'badge badge--success' }, 'پاسخ داده شد')
        : el('span', { class: `badge ${st.cls}` }, st.label),
      rec.forwarded_at && !replied
        ? el('span', { class: 'field__hint' }, `تحویل: ${formatJalaliNumeric(rec.forwarded_at.slice(0, 10))}`)
        : null
    ),
    areaLabels ? el('p', { style: { margin: 0, fontWeight: 600 } }, areaLabels) : null,
    rec.description ? el('p', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, rec.description) : null,
    replyBlock(rec),
    el(
      'p',
      { class: 'field__hint', style: { margin: 0 } },
      [rec.staff_name, formatJalaliNumeric((rec.created_at ?? '').slice(0, 10))].filter(Boolean).map((t, i) => (i ? ` · ${t}` : t))
    ),
    rec.status === 'open' && rec.forward_error && !replied
      ? el('p', { class: 'field__hint', style: { margin: 0, color: 'var(--error)' } }, `خطای ارسال — تلاش دورهٔ بعد: ${rec.forward_error}`)
      : null
  );
}

export async function renderBugReport(container) {
  container.replaceChildren(el('p', { style: { color: 'var(--text-3)' } }, 'در حال بارگذاری…'));

  const chips = el('div', { class: 'chip-row' }, ...AREAS.map(areaChip));
  const sevWrap = el('div', { class: 'chip-row' }, ...SEVERITIES.map(severityRadio));

  const counter = el('span', { class: 'field__hint' }, `${fa(0)} / ${fa(2000)}`);
  const desc = el('textarea', {
    class: 'input',
    rows: 4,
    maxlength: 2000,
    placeholder: 'توضیح مشکل (اختیاری اگر بخشی تیک خورده باشد)',
    'aria-label': 'توضیح مشکل',
    oninput: () => { counter.textContent = `${fa(desc.value.length)} / ${fa(2000)}`; }
  });

  const submitBtn = el('button', { class: 'btn btn--primary', type: 'submit' }, icon('send', 16), 'ارسال گزارش');

  const form = el(
    'form',
    {
      class: 'card bug-form',
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
          counter.textContent = `${fa(0)} / ${fa(2000)}`;
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
    el('div', { class: 'card__head' }, el('h2', { class: 'card__title' }, icon('bug', 18), 'گزارش تازه')),
    el(
      'div',
      { class: 'card__body', style: { display: 'grid', gap: 'var(--sp-4)' } },
      el('div', { class: 'field' },
        el('span', { class: 'field__label' }, 'کدام بخش سامانه؟'),
        chips
      ),
      el('div', { class: 'field' },
        el('span', { class: 'field__label' }, 'شدت'),
        sevWrap,
        el('span', { class: 'field__hint' }, 'بحرانی یعنی کار شما با سامانه متوقف شده است.')
      ),
      el('div', { class: 'field' },
        el('div', { class: 'field__labelrow' }, el('span', { class: 'field__label' }, 'توضیح مشکل'), counter),
        desc
      ),
      el('div', { class: 'bug-actions', style: { display: 'flex', gap: 'var(--sp-2)' } }, submitBtn)
    )
  );

  const listBox = el('div', { class: 'card' });

  async function loadList() {
    listBox.replaceChildren(
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title' }, 'گزارش‌های پیشین'),
        el('span', { class: 'card__meta' }, 'در حال بارگذاری…')
      )
    );
    try {
      const res = await api.get('/api/bug-reports');
      const items = res?.data ?? [];
      listBox.replaceChildren(
        el('div', { class: 'card__head' },
          el('h2', { class: 'card__title' }, 'گزارش‌های پیشین'),
          items.length > 0 ? el('span', { class: 'badge badge--neutral' }, fa(items.length)) : null
        ),
        el('div', { class: 'card__body', style: { display: 'grid', gap: 'var(--sp-2)' } },
          items.length === 0
            ? emptyState({ iconName: 'bug', title: 'هنوز گزارشی ثبت نشده', hint: 'اگر جایی از سامانه اذیت‌تان کرد، از همین فرم بفرستید — به پشتیبانی شبکه می‌رسد.' })
            : el('div', { style: { display: 'grid', gap: 'var(--sp-2)' } }, ...items.map(reportRow))
        )
      );
    } catch (err) {
      toastError(err);
      listBox.replaceChildren(
        el('div', { class: 'card__head' }, el('h2', { class: 'card__title' }, 'گزارش‌های پیشین')),
        el('div', { class: 'card__body' },
          emptyState({ iconName: 'alert', title: 'فهرست گزارش‌ها باز نشد', hint: 'ارتباط با سرور برقرار نشد — گزارش‌های ثبت‌شده‌تان از بین نرفته‌اند.', actionLabel: 'تلاش مجدد', onAction: loadList })
        )
      );
    }
  }

  await loadList();
  container.replaceChildren(
    el(
      'div',
      { class: 'page-head' },
      el('h2', { class: 'page-head__title' }, 'گزارش به پشتیبانی'),
      el('p', { class: 'page-head__desc' }, 'مشکل را تیک بزنید و بفرستید — گزارش خودکار با صفحه، نام شما و نسخهٔ سامانه به پشتیبانی شبکه می‌رسد و پاسخش همین‌جا می‌نشیند.')
    ),
    el(
      'div',
      { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--sp-4)', alignItems: 'start' } },
      form,
      listBox
    )
  );
}
