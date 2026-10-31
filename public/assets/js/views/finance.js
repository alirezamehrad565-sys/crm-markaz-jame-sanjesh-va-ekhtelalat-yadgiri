import { api, qs } from '../api.js';
import {
  el,
  icon,
  toast,
  toastError,
  confirmModal,
  openModal,
  emptyState,
  loadingState,
  errorState,
  tabs
} from '../ui.js';
import { fa, enDigits, formatJalaliNumeric, tehranTodayYmd } from '../format.js';
import { jalaliDateInput } from '../jalali-picker.js';
import { session } from '../state.js';

// ═══════════════════════════════════════════════════════════════
// بودجه و مالی مرکز (دولتی، تک‌بودجه)
//  سه چیز و همین سه چیز: فاکتور هزینه، کمک/دونیشن خانواده‌ها، تراز بودجه
//  دسترسی: فقط مدیر (روتر + سرور + گارد داخل ویو)
//  هیچ فایل CSS جدیدی — استایل‌های fin-* همین‌جا تزریق می‌شود
// ═══════════════════════════════════════════════════════════════

const CATEGORIES = ['اجاره', 'حق‌الزحمه', 'ملزومات اداری', 'خدمات', 'تعمیرات', 'سایر'];
const SEARCH_DEBOUNCE_MS = 280;

// ─── استایل ماژول (یک‌بار در ابتدای ماژول تزریق می‌شود — شامل CSS چاپ اسکوپ‌شده) ───

function ensureFinStyles() {
  if (typeof document === 'undefined' || document.getElementById('fin-print-css')) return;
  const style = document.createElement('style');
  style.id = 'fin-print-css';
  style.textContent = `
/* ── نوار مصرف بودجه ── */
.fin-bar { width: 100%; max-width: 420px; height: 10px; border-radius: var(--radius-full); background: var(--surface-3); overflow: hidden; }
.fin-bar__fill { height: 100%; border-radius: var(--radius-full); background: var(--primary); transition: width .25s ease; }
.fin-bar__meta { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; margin: var(--sp-2) 0 var(--sp-4); }
.fin-bar__text { font-size: var(--fs-xs); color: var(--text-2); }

/* ── چیدمان صفحه ── */
.fin-headrow { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.fin-filters { display: flex; align-items: end; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-4); }
.fin-filters .field { min-width: 150px; }
.fin-panel-head { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-3); }
.fin-panel-head .input { max-width: 280px; }
.fin-actions { display: flex; gap: var(--sp-1); justify-content: flex-end; white-space: nowrap; } /* 2px خام (S9-18) */
.fin-empty-row td { text-align: center; color: var(--text-3); padding: var(--sp-5) var(--sp-3); }
.fin-amount { font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }

/* ── انتخابگر دانش‌آموز (دراپ‌داون کوچک) ── */
.fin-sp { position: relative; }
.fin-sp__dd { position: absolute; inset-inline: 0; top: calc(100% + var(--sp-1)); z-index: 30; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-2); max-height: 220px; overflow-y: auto; }
.fin-sp__item { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; text-align: start;
  padding: 8px var(--sp-3); background: none; border: 0; border-bottom: 1px solid var(--border); cursor: pointer; font: inherit; color: var(--text); }
.fin-sp__item:last-child { border-bottom: 0; }
.fin-sp__item:hover { background: var(--surface-2); }
.fin-sp__item small { color: var(--text-3); font-size: var(--fs-xs); }
.fin-sp__empty { padding: 10px var(--sp-3); color: var(--text-3); font-size: var(--fs-sm); }
.fin-sp__sel { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; padding: 4px 10px;
  background: var(--primary-soft); color: var(--on-primary-soft); border-radius: var(--radius-full); font-size: var(--fs-sm); }
.fin-sp__sel button { background: none; border: 0; color: inherit; cursor: pointer; font-size: var(--fs-md); line-height: 1; padding: 0 2px; } /* 15px خام */

/* ── گزارش چاپی ── */
.fin-report-host { display: none; }
.fin-report { direction: rtl; font-family: inherit; color: var(--text, #111); background: #fff; padding: 4mm 6mm; }
.fin-report__head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; border-bottom: 2px solid var(--text, #111); padding-bottom: 6px; margin-bottom: 10px; }
.fin-report__title { font-size: 16pt; font-weight: 700; margin: 0; }
.fin-report__meta { font-size: 9.5pt; color: #444; margin: 2px 0 14px; }
.fin-report h3 { font-size: 11.5pt; margin: 14px 0 6px; }
.fin-report table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
.fin-report th, .fin-report td { border: 1px solid var(--border-strong); padding: 4px 7px; text-align: right; } /* #bbb به توکن مرز */
.fin-report th { background: var(--surface-3); } /* هاردکد روشن در دارک‌تم جدول تیره را می‌شکست */
.fin-report__sums { margin-top: 6px; }
.fin-report__foot { margin-top: 16px; font-size: 8.5pt; color: #555; border-top: 1px solid #ccc; padding-top: 6px; }

@media print {
  @page { size: A4; margin: 14mm 12mm; }
  body.fin-print-on > *:not(.fin-report-host) { display: none !important; }
  body.fin-print-on .fin-report-host { display: block !important; }
  .fin-report table { break-inside: auto; }
  .fin-report tr { break-inside: avoid; }
  .fin-report thead { display: table-header-group; }
}
`;
  document.head.appendChild(style);
}
ensureFinStyles();

// ─── قالب‌بندی ───

function money(n) {
  return fa(Number(n || 0).toLocaleString('en-US'));
}
function moneyLabel(n) {
  return `${money(n)} تومان`;
}
function dateLabel(ymd) {
  return ymd ? formatJalaliNumeric(ymd) : '—';
}
function rangeLabel() {
  if (state.from && state.to) return `${dateLabel(state.from)} تا ${dateLabel(state.to)}`;
  if (state.from) return `از ${dateLabel(state.from)}`;
  if (state.to) return `تا ${dateLabel(state.to)}`;
  return 'همهٔ تاریخ‌ها';
}
function centerName() {
  // نام مرکز از تنظیمات (مثل clearbook) — اگر هنوز بارگذاری نشده از عنوان سند
  if (state.clinicName) return state.clinicName;
  const t = String(document.title || '').split('—')[0].trim();
  return t || 'مرکز';
}

// ─── وضعیت ویو ───

const state = {
  tab: 'invoices',
  from: '',
  to: '',
  clinicName: '',
  summary: { budgetTotal: 0, donationsTotal: 0, invoicesTotal: 0, balance: 0 },
  invoices: [],
  donations: [],
  budgets: [],
  qInv: '',
  qDon: ''
};

async function loadAll() {
  const query = qs({ from: state.from, to: state.to });
  const [s, i, d, b] = await Promise.all([
    api.get(`/api/finance/summary${query}`),
    api.get(`/api/finance/invoices${query}`),
    api.get(`/api/finance/donations${query}`),
    api.get('/api/finance/budgets')
  ]);
  state.summary = s?.data ?? state.summary;
  state.invoices = i?.data ?? [];
  state.donations = d?.data ?? [];
  state.budgets = b?.data ?? [];
  // نام مرکز برای سربرگ گزارش چاپی/CSV — بهترین تلاش (نبود تنظیمات هم خطا نیست)
  try {
    const st = await api.get('/api/settings');
    if (st?.data?.clinicName) state.clinicName = st.data.clinicName;
  } catch { /* نام پیش‌فرض می‌ماند */ }
}

async function refresh({ silent = false } = {}) {
  try {
    await loadAll();
    repaint();
    if (!silent) toast('به‌روزرسانی شد', 'success', 1800);
  } catch (err) {
    toastError(err);
  }
}

// ─── برگ‌های صفحه (برای repaint) ───

let _root = null;
let _kpis = null;
let _barBlock = null;
let _panel = null;
let _tabCtl = null;

function repaint() {
  if (!_root) return;
  drawKpis();
  drawBar();
  drawPanel();
}

function drawKpis() {
  if (!_kpis) return;
  const s = state.summary;
  const balanceTone = s.balance < 0 ? 'var(--danger)' : 'var(--success)';
  _kpis.replaceChildren(
    kpiCard('بودجهٔ مصوب', s.budgetTotal, 'primary', `بودجهٔ مصوب مرکز: ${moneyLabel(s.budgetTotal)}`),
    kpiCard('کمک‌های دریافتی', s.donationsTotal, 'success', `جمع کمک‌های دریافتی از خانواده‌ها: ${moneyLabel(s.donationsTotal)}`),
    kpiCard('فاکتورها (هزینه)', s.invoicesTotal, 'error', `جمع فاکتورهای هزینه: ${moneyLabel(s.invoicesTotal)}`),
    kpiCard('ماندهٔ تراز', s.balance, s.balance < 0 ? 'error' : 'success', `ماندهٔ تراز بودجه: ${moneyLabel(s.balance)}`, balanceTone)
  );
}

function kpiCard(label, amount, tone, ariaText, valueColor) {
  return el('div', { class: `kpi kpi--${tone}`, role: 'img', 'aria-label': ariaText },
    el('div', { class: 'kpi__label' }, label),
    el('div', { class: 'kpi__value', style: valueColor ? { color: valueColor } : null }, money(amount)),
    el('div', { class: 'kpi__sub' }, 'تومان')
  );
}

function drawBar() {
  if (!_barBlock) return;
  const s = state.summary;
  const realPct = s.budgetTotal > 0 ? Math.round((s.invoicesTotal / s.budgetTotal) * 100) : 0;
  const width = Math.max(0, Math.min(100, realPct));
  const text = s.budgetTotal > 0
    ? `مصرف ${fa(realPct)}٪ از بودجهٔ مصوب`
    : 'هنوز بودجه‌ای ثبت نشده است';
  _barBlock.replaceChildren(
    el('div', { class: 'fin-bar__meta' },
      el('div', { class: 'fin-bar', role: 'img', 'aria-label': `مصرف ${fa(realPct)}٪ از بودجهٔ مصوب` },
        el('div', { class: 'fin-bar__fill', style: { width: `${width}%` } })),
      el('span', { class: 'fin-bar__text' }, text)
    )
  );
}

// ─── تب فاکتورها ───

function invoicesPanel() {
  const tbody = el('tbody');
  const table = el('div', { class: 'table-wrap' },
    el('table', { class: 'table' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'عنوان'),
        el('th', {}, 'دسته'),
        el('th', {}, 'مبلغ (تومان)'),
        el('th', {}, 'تاریخ'),
        el('th', {}, 'پیوست'),
        el('th', {}, 'عملیات')
      )),
      tbody
    )
  );

  const search = el('input', {
    class: 'input',
    type: 'search',
    placeholder: 'جستجو در عنوان، دسته و توضیح…',
    value: state.qInv,
    'aria-label': 'جستجوی فاکتور'
  });
  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.qInv = enDigits(search.value).trim();
      drawRows();
    }, SEARCH_DEBOUNCE_MS);
  });

  function filtered() {
    const q = state.qInv;
    if (!q) return state.invoices;
    return state.invoices.filter((inv) =>
      `${inv.title} ${inv.category} ${inv.description}`.includes(q)
    );
  }

  function drawRows() {
    const rows = filtered();
    if (rows.length === 0) {
      tbody.replaceChildren(
        el('tr', { class: 'fin-empty-row' },
          el('td', { colspan: 6 },
            state.invoices.length === 0
              ? 'هنوز فاکتوری ثبت نشده است — با دکمهٔ «ثبت فاکتور» شروع کنید'
              : 'نتیجه‌ای برای این جستجو نیست'))
      );
      return;
    }
    tbody.replaceChildren(...rows.map((inv) => invoiceRow(inv)));
  }

  drawRows();

  return el('div', {},
    el('div', { class: 'fin-panel-head' },
      search,
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn--primary btn--sm', onclick: () => openInvoiceModal() }, icon('plus', 15), 'ثبت فاکتور')
    ),
    table
  );

  function invoiceRow(inv) {
    return el('tr', {},
      el('td', { dataset: { label: 'عنوان' } }, inv.title),
      el('td', { dataset: { label: 'دسته' } }, inv.category || '—'),
      el('td', { class: 'fin-amount', dataset: { label: 'مبلغ (تومان)' } }, money(inv.amount)),
      el('td', { dataset: { label: 'تاریخ' } }, dateLabel(inv.invoiceDate)),
      el('td', { dataset: { label: 'پیوست' } }, inv.attachment
        ? el('span', { class: 'badge badge--neutral', title: inv.attachment.filename }, icon('file', 12), ' پیوست')
        : '—'),
      el('td', { class: 'fin-actions', dataset: { label: 'عملیات' } },
        inv.attachment
          ? el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': `پیش‌نمایش یا دانلود پیوست فاکتور ${inv.title}`, title: 'پیش‌نمایش / دانلود پیوست', onclick: () => openAttachment(inv) }, icon('eye', 16))
          : null,
        el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': `ویرایش فاکتور ${inv.title}`, title: 'ویرایش', onclick: () => openInvoiceModal(inv) }, icon('edit', 16)),
        el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': `حذف فاکتور ${inv.title}`, title: 'حذف', onclick: () => removeInvoice(inv) }, icon('trash', 16))
      )
    );
  }
}

async function openAttachment(inv) {
  try {
    const { blob, filename } = await api.downloadBlob(`/api/finance/invoices/${inv.id}/attachment?inline=1`);
    const url = URL.createObjectURL(blob);
    const mime = (blob.type || '').toLowerCase();
    const win = window.open(url, '_blank', 'noopener');
    if (!win) {
      const a = el('a', { href: url, download: filename || 'invoice' });
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    void mime;
  } catch (err) {
    toastError(err);
  }
}

async function removeInvoice(inv) {
  const ok = await confirmModal({
    title: 'حذف فاکتور',
    message: `فاکتور «${inv.title}» به مبلغ ${moneyLabel(inv.amount)} حذف شود؟ از جمع تراز خارج می‌شود.`,
    confirmLabel: 'حذف',
    danger: true
  });
  if (!ok) return;
  try {
    await api.del(`/api/finance/invoices/${inv.id}`);
    toast('فاکتور حذف شد', 'success');
    await refresh({ silent: true });
  } catch (err) {
    toastError(err);
  }
}

// ─── مودال فاکتور (ثبت / ویرایش) ───

function moneyInput(initial) {
  const input = el('input', {
    class: 'input',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    placeholder: 'مثلاً ۲٬۵۰۰٬۰۰۰',
    'aria-label': 'مبلغ (تومان)'
  });
  input.value = initial ? money(initial) : '';
  input.addEventListener('input', () => {
    const digits = enDigits(input.value).replace(/[^\d]/g, '');
    input.value = digits ? fa(Number(digits).toLocaleString('en-US')) : ''; /* S9-14: پیکرهٔ رقم واحد با جدول */
  });
  return input;
}

function amountOf(input) {
  const digits = enDigits(input.value).replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function field(labelText, control, hint) {
  /* S9-16: نام دسترس‌پذیری از مسیر واحد — لیبل برادر با کنترل هم‌نام می‌شود (مگر کنترل خودش aria-label داشته باشد) */
  if (control && typeof control.setAttribute === 'function' && !control.getAttribute('aria-label')) {
    control.setAttribute('aria-label', labelText);
  }
  return el('div', { class: 'field' },
    el('label', { class: 'field__label' }, labelText),
    control,
    hint ? el('span', { class: 'field__hint' }, hint) : null
  );
}

function openInvoiceModal(existing = null) {
  const isEdit = Boolean(existing);
  const title = el('input', { class: 'input', type: 'text', value: existing?.title ?? '', 'aria-label': 'عنوان فاکتور' });
  const amount = moneyInput(existing?.amount);
  const dateCtl = jalaliDateInput({ value: existing?.invoiceDate ?? '', allowClear: false });
  const datalist = el('datalist', { id: 'fin-cat-list' }, CATEGORIES.map((c) => el('option', { value: c })));
  const category = el('input', { class: 'input', type: 'text', list: 'fin-cat-list', value: existing?.category ?? '', 'aria-label': 'دستهٔ هزینه', placeholder: 'اجاره، ملزومات، …' });
  const description = el('input', { class: 'input', type: 'text', value: existing?.description ?? '', 'aria-label': 'توضیح فاکتور' });
  const fileInput = el('input', { class: 'input', type: 'file', accept: 'image/*,.pdf', 'aria-label': 'پیوست اسکن فاکتور' });
  const fileField = field(
    'پیوست اسکن (اختیاری)',
    fileInput,
    isEdit && existing?.attachment ? `پیوست فعلی: ${existing.attachment.filename} — انتخاب فایل جدید، قبلی را جایگزین می‌کند` : 'عکس یا PDF اسکن فاکتور'
  );

  const modal = openModal({
    title: isEdit ? 'ویرایش فاکتور' : 'ثبت فاکتور',
    wide: true,
    body: el('div', { class: 'form-grid' },
      el('div', { class: 'form-grid__bar' }, el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'عنوان فاکتور'), title)),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'مبلغ (تومان)'), amount),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'تاریخ فاکتور'), dateCtl.root),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'دستهٔ هزینه'), category, datalist),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'توضیح'), description),
      el('div', { class: 'form-grid__bar' }, fileField)
    ),
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', onclick: () => close() }, 'انصراف'),
      (close) => el('button', { class: 'btn btn--primary', onclick: () => submit(close) }, isEdit ? 'ذخیره' : 'ثبت فاکتور')
    ]
  });

  async function submit(close) {
    if (!title.value.trim()) { toast('عنوان فاکتور را وارد کنید', 'warning'); return; }
    const amountVal = amountOf(amount);
    if (amountVal <= 0) { toast('مبلغ باید بزرگ‌تر از صفر باشد', 'warning'); return; }
    const invoiceDate = dateCtl.getYmd();
    if (!invoiceDate) { toast('تاریخ فاکتور را انتخاب کنید', 'warning'); return; }
    const payload = {
      title: title.value.trim(),
      amount: amountVal,
      invoice_date: invoiceDate,
      category: category.value.trim(),
      description: description.value.trim()
    };
    try {
      const res = isEdit
        ? await api.patch(`/api/finance/invoices/${existing.id}`, payload)
        : await api.post('/api/finance/invoices', payload);
      const invId = res?.data?.id ?? existing?.id;
      const file = fileInput.files && fileInput.files[0];
      if (file && invId) {
        const fd = new FormData();
        fd.append('file', file);
        await api.postForm(`/api/finance/invoices/${invId}/attachment`, fd);
      }
      close();
      toast(isEdit ? 'فاکتور ویرایش شد' : 'فاکتور ثبت شد', 'success');
      await refresh({ silent: true });
    } catch (err) {
      toastError(err);
    }
  }
  void modal;
}

// ─── انتخابگر دانش‌آموز (جستجو از /api/search) ───

function studentPicker(initialId, initialName) {
  const picked = { id: initialId ?? null, name: initialName ?? '' };

  const input = el('input', {
    class: 'input',
    type: 'search',
    placeholder: 'نام دانش‌آموز را بنویسید…',
    autocomplete: 'off',
    'aria-label': 'جستجوی دانش‌آموز برای اتصال کمک'
  });
  const dd = el('div', { class: 'fin-sp__dd', role: 'listbox', 'aria-label': 'نتایج دانش‌آموز', hidden: true });
  const clearBtn = el('button', { type: 'button', 'aria-label': 'لغو اتصال دانش‌آموز', title: 'لغو اتصال', onclick: clear }, '×');
  const selChip = el('div', { class: 'fin-sp__sel', hidden: !picked.id }, el('span', {}, picked.name || ''), clearBtn);
  const wrap = el('div', { class: 'fin-sp' }, input, dd, selChip);
  input.setAttribute('role', 'combobox'); /* S9-17 */
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', 'fin-sp-dd');
  dd.id = 'fin-sp-dd';
  const syncOpen = (open) => { dd.hidden = !open; input.setAttribute('aria-expanded', String(open)); };

  let timer = null;

  function closeDd() { syncOpen(false); }

  function pick(item) {
    picked.id = item.id;
    picked.name = item.title;
    input.value = item.title;
    selChip.replaceChildren(el('span', {}, item.title), clearBtn);
    selChip.hidden = false;
    closeDd();
  }

  function clear() {
    picked.id = null;
    picked.name = '';
    input.value = '';
    selChip.hidden = true;
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = enDigits(input.value).trim();
    if (q.length < 2) { closeDd(); return; }
    timer = setTimeout(async () => {
      try {
        const res = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
        const students = (res?.data?.groups ?? [])
          .filter((g) => g.type === 'student')
          .flatMap((g) => g.items ?? []);
        if (students.length === 0) {
          dd.replaceChildren(el('div', { class: 'fin-sp__empty' }, 'دانش‌آموزی پیدا نشد'));
          syncOpen(true);
          return;
        }
        dd.replaceChildren(...students.map((s) =>
          el('button', { type: 'button', class: 'fin-sp__item', role: 'option', onclick: () => pick(s) },
            el('span', {}, s.title),
            s.subtitle ? el('small', {}, s.subtitle) : null)
        ));
        syncOpen(true);
      } catch {
        closeDd();
      }
    }, SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener('keydown', (e) => { /* S9-17: فلش‌ها بین گزینه‌ها حرکت می‌کنند */
    if (e.key === 'Escape') { closeDd(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (dd.hidden) return;
      e.preventDefault();
      const opts = [...dd.querySelectorAll('.fin-sp__item')];
      if (!opts.length) return;
      const cur = opts.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? Math.min(cur + 1, opts.length - 1) : Math.max(cur - 1, 0);
      (cur === -1 ? opts[0] : opts[next]).focus();
    }
  });
  // شنوندهٔ سطح سند با close() جمع می‌شود تا هر بار بازشدن مودال کمک نشت نکند
  const onDocClick = (e) => { if (!wrap.isConnected) { detach(); return; } if (!wrap.contains(e.target)) closeDd(); };
  function detach() { document.removeEventListener('click', onDocClick); }
  document.addEventListener('click', onDocClick);

  return {
    root: wrap,
    get studentId() { return picked.id; },
    dispose: detach
  };
}

// ─── تب کمک‌ها ───

function donationsPanel() {
  const tbody = el('tbody');
  const table = el('div', { class: 'table-wrap' },
    el('table', { class: 'table' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'اهداکننده'),
        el('th', {}, 'مبلغ (تومان)'),
        el('th', {}, 'تاریخ'),
        el('th', {}, 'دانش‌آموز متصل'),
        el('th', {}, 'یادداشت'),
        el('th', {}, 'عملیات')
      )),
      tbody
    )
  );

  const search = el('input', {
    class: 'input',
    type: 'search',
    placeholder: 'جستجو در نام اهداکننده و یادداشت…',
    value: state.qDon,
    'aria-label': 'جستجوی کمک مالی'
  });
  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.qDon = enDigits(search.value).trim();
      drawRows();
    }, SEARCH_DEBOUNCE_MS);
  });

  function filtered() {
    const q = state.qDon;
    if (!q) return state.donations;
    return state.donations.filter((d) => `${d.donorName} ${d.note}`.includes(q));
  }

  function drawRows() {
    const rows = filtered();
    if (rows.length === 0) {
      tbody.replaceChildren(
        el('tr', { class: 'fin-empty-row' },
          el('td', { colspan: 6 },
            state.donations.length === 0
              ? 'کمکی ثبت نشده است — با دکمهٔ «ثبت کمک» شروع کنید'
              : 'نتیجه‌ای برای این جستجو نیست'))
      );
      return;
    }
    tbody.replaceChildren(...rows.map((d) =>
      el('tr', {},
        el('td', { dataset: { label: 'اهداکننده' } }, d.donorName), // برچسب کارت موبایل
        el('td', { class: 'fin-amount', dataset: { label: 'مبلغ (تومان)' } }, money(d.amount)),
        el('td', { dataset: { label: 'تاریخ' } }, dateLabel(d.donationDate)),
        el('td', { dataset: { label: 'دانش‌آموز متصل' } }, d.studentName || '—'),
        el('td', { dataset: { label: 'یادداشت' } }, d.note || '—'),
        el('td', { class: 'fin-actions', dataset: { label: 'عملیات' } },
          el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': `ویرایش کمک ${d.donorName}`, title: 'ویرایش', onclick: () => openDonationModal(d) }, icon('edit', 16)),
          el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': `حذف کمک ${d.donorName}`, title: 'حذف', onclick: () => removeDonation(d) }, icon('trash', 16))
        )
      )
    ));
  }

  drawRows();

  return el('div', {},
    el('div', { class: 'fin-panel-head' },
      search,
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn--primary btn--sm', onclick: () => openDonationModal() }, icon('plus', 15), 'ثبت کمک')
    ),
    table
  );
}

async function removeDonation(don) {
  const ok = await confirmModal({
    title: 'حذف کمک',
    message: `کمک «${don.donorName}» به مبلغ ${moneyLabel(don.amount)} حذف شود؟ از جمع کمک‌ها خارج می‌شود.`,
    confirmLabel: 'حذف',
    danger: true
  });
  if (!ok) return;
  try {
    await api.del(`/api/finance/donations/${don.id}`);
    toast('کمک حذف شد', 'success');
    await refresh({ silent: true });
  } catch (err) {
    toastError(err);
  }
}

// ─── مودال کمک (ثبت / ویرایش) ───

function openDonationModal(existing = null) {
  const isEdit = Boolean(existing);
  const donor = el('input', { class: 'input', type: 'text', value: existing?.donorName ?? '', 'aria-label': 'نام اهداکننده' });
  const amount = moneyInput(existing?.amount);
  const dateCtl = jalaliDateInput({ value: existing?.donationDate ?? '', allowClear: false });
  const note = el('input', { class: 'input', type: 'text', value: existing?.note ?? '', 'aria-label': 'یادداشت کمک' });
  const picker = studentPicker(existing?.studentId, existing?.studentName);

  openModal({
    title: isEdit ? 'ویرایش کمک' : 'ثبت کمک',
    wide: true,
    onClose: () => picker.dispose?.(),
    body: el('div', { class: 'form-grid' },
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'نام اهداکننده / خانواده'), donor),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'مبلغ (تومان)'), amount),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'تاریخ کمک'), dateCtl.root),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'یادداشت'), note),
      el('div', { class: 'form-grid__bar' }, field('اتصال به دانش‌آموز (اختیاری)', picker.root, 'با انتخاب، کمک به پروندهٔ دانش‌آموز گره می‌خورد'))
    ),
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', onclick: () => close() }, 'انصراف'),
      (close) => el('button', { class: 'btn btn--primary', onclick: () => submit(close) }, isEdit ? 'ذخیره' : 'ثبت کمک')
    ]
  });

  async function submit(close) {
    if (!donor.value.trim()) { toast('نام اهداکننده را وارد کنید', 'warning'); return; }
    const amountVal = amountOf(amount);
    if (amountVal <= 0) { toast('مبلغ باید بزرگ‌تر از صفر باشد', 'warning'); return; }
    const donationDate = dateCtl.getYmd();
    if (!donationDate) { toast('تاریخ کمک را انتخاب کنید', 'warning'); return; }
    const payload = {
      donor_name: donor.value.trim(),
      amount: amountVal,
      donation_date: donationDate,
      student_id: picker.studentId,
      note: note.value.trim()
    };
    try {
      if (isEdit) await api.patch(`/api/finance/donations/${existing.id}`, payload);
      else await api.post('/api/finance/donations', payload);
      close();
      toast(isEdit ? 'کمک ویرایش شد' : 'کمک ثبت شد', 'success');
      await refresh({ silent: true });
    } catch (err) {
      toastError(err);
    }
  }
}

// ─── تب بودجه‌ها ───

function budgetsPanel() {
  const tbody = el('tbody');
  const table = el('div', { class: 'table-wrap' },
    el('table', { class: 'table' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'عنوان'),
        el('th', {}, 'مبلغ (تومان)'),
        el('th', {}, 'بازه'),
        el('th', {}, 'یادداشت'),
        el('th', {}, 'عملیات')
      )),
      tbody
    )
  );

  function drawRows() {
    if (state.budgets.length === 0) {
      tbody.replaceChildren(
        el('tr', { class: 'fin-empty-row' }, el('td', { colspan: 5 }, 'بودجه‌ای ثبت نشده است — بودجهٔ مصوب مرکز را وارد کنید'))
      );
      return;
    }
    tbody.replaceChildren(...state.budgets.map((b) =>
      el('tr', {},
        el('td', { dataset: { label: 'عنوان' } }, b.title), // برچسب کارت موبایل
        el('td', { class: 'fin-amount', dataset: { label: 'مبلغ (تومان)' } }, money(b.amount)),
        el('td', { dataset: { label: 'بازه' } }, b.periodFrom || b.periodTo ? `${b.periodFrom ? dateLabel(b.periodFrom) : '…'} تا ${b.periodTo ? dateLabel(b.periodTo) : '…'}` : '—'),
        el('td', { dataset: { label: 'یادداشت' } }, b.notes || '—'),
        el('td', { class: 'fin-actions', dataset: { label: 'عملیات' } },
          el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': `ویرایش بودجه ${b.title}`, title: 'ویرایش', onclick: () => openBudgetModal(b) }, icon('edit', 16)),
          el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': `حذف بودجه ${b.title}`, title: 'حذف', onclick: () => removeBudget(b) }, icon('trash', 16))
        )
      )
    ));
  }

  drawRows();

  return el('div', {},
    el('div', { class: 'fin-panel-head' },
      el('span', { class: 'fin-bar__text' }, 'مرکز دولتی است و یک بودجهٔ مصوب دارد — جمع بودجه‌های غیرحذف‌شده مبنای تراز است.'),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn--primary btn--sm', onclick: () => openBudgetModal() }, icon('plus', 15), 'ثبت بودجه')
    ),
    table
  );
}

async function removeBudget(b) {
  const ok = await confirmModal({
    title: 'حذف بودجه',
    message: `بودجهٔ «${b.title}» به مبلغ ${moneyLabel(b.amount)} حذف شود؟ از جمع بودجه خارج می‌شود.`,
    confirmLabel: 'حذف',
    danger: true
  });
  if (!ok) return;
  try {
    await api.del(`/api/finance/budgets/${b.id}`);
    toast('بودجه حذف شد', 'success');
    await refresh({ silent: true });
  } catch (err) {
    toastError(err);
  }
}

function openBudgetModal(existing = null) {
  const isEdit = Boolean(existing);
  const title = el('input', { class: 'input', type: 'text', value: existing?.title ?? '', 'aria-label': 'عنوان بودجه' });
  const amount = moneyInput(existing?.amount);
  const fromCtl = jalaliDateInput({ value: existing?.periodFrom ?? '' });
  const toCtl = jalaliDateInput({ value: existing?.periodTo ?? '' });
  const notes = el('input', { class: 'input', type: 'text', value: existing?.notes ?? '', 'aria-label': 'یادداشت بودجه' });

  openModal({
    title: isEdit ? 'ویرایش بودجه' : 'ثبت بودجه',
    wide: true,
    body: el('div', { class: 'form-grid' },
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'عنوان بودجه'), title),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'مبلغ (تومان)'), amount),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'از تاریخ (اختیاری)'), fromCtl.root),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'تا تاریخ (اختیاری)'), toCtl.root),
      el('div', { class: 'form-grid__bar' }, field('یادداشت', notes))
    ),
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', onclick: () => close() }, 'انصراف'),
      (close) => el('button', { class: 'btn btn--primary', onclick: () => submit(close) }, isEdit ? 'ذخیره' : 'ثبت بودجه')
    ]
  });

  async function submit(close) {
    if (!title.value.trim()) { toast('عنوان بودجه را وارد کنید', 'warning'); return; }
    const amountVal = amountOf(amount);
    if (amountVal <= 0) { toast('مبلغ باید بزرگ‌تر از صفر باشد', 'warning'); return; }
    const periodFrom = fromCtl.getYmd() || null;
    const periodTo = toCtl.getYmd() || null;
    if (periodFrom && periodTo && periodTo < periodFrom) {
      toast('«تا» نباید قبل از «از» باشد', 'warning');
      return;
    }
    const payload = {
      title: title.value.trim(),
      amount: amountVal,
      period_from: periodFrom,
      period_to: periodTo,
      notes: notes.value.trim()
    };
    try {
      if (isEdit) await api.patch(`/api/finance/budgets/${existing.id}`, payload);
      else await api.post('/api/finance/budgets', payload);
      close();
      toast(isEdit ? 'بودجه ویرایش شد' : 'بودجه ثبت شد', 'success');
      await refresh({ silent: true });
    } catch (err) {
      toastError(err);
    }
  }
}

// ─── گزارش چاپی ───

function reportTable(headers, rows) {
  return el('table', {},
    el('thead', {}, el('tr', {}, headers.map((h) => el('th', {}, h)))),
    el('tbody', {}, rows.map((cells) => el('tr', {}, cells.map((c) => el('td', {}, c)))))
  );
}

function buildReportSheet() {
  const s = state.summary;
  const invRows = state.invoices.map((inv) => [
    inv.title,
    inv.category || '—',
    money(inv.amount),
    dateLabel(inv.invoiceDate)
  ]);
  const donRows = state.donations.map((d) => [
    d.donorName,
    money(d.amount),
    dateLabel(d.donationDate),
    d.studentName || '—',
    d.note || '—'
  ]);

  return el('div', { class: 'fin-report' },
    el('div', { class: 'fin-report__head' },
      el('h2', { class: 'fin-report__title' }, `${centerName()} — گزارش بودجه و مالی`),
      el('div', {}, dateLabel(tehranTodayYmd()))
    ),
    el('p', { class: 'fin-report__meta' }, `بازهٔ گزارش: ${rangeLabel()}`),
    el('h3', {}, 'تراز بودجه'),
    reportTable(['شرح', 'مبلغ (تومان)'], [
      ['بودجهٔ مصوب', money(s.budgetTotal)],
      ['کمک‌های دریافتی (در بازه)', money(s.donationsTotal)],
      ['فاکتورها — هزینه (در بازه)', money(s.invoicesTotal)],
      ['ماندهٔ تراز', money(s.balance)]
    ]),
    el('h3', {}, `فاکتورها (${fa(invRows.length)} مورد)`),
    invRows.length > 0
      ? reportTable(['عنوان', 'دسته', 'مبلغ (تومان)', 'تاریخ'], invRows)
      : el('p', { class: 'fin-report__meta' }, 'فاکتوری در این بازه ثبت نشده است.'),
    el('h3', {}, `کمک‌های دریافتی (${fa(donRows.length)} مورد)`),
    donRows.length > 0
      ? reportTable(['اهداکننده', 'مبلغ (تومان)', 'تاریخ', 'دانش‌آموز', 'یادداشت'], donRows)
      : el('p', { class: 'fin-report__meta' }, 'کمکی در این بازه ثبت نشده است.'),
    el('div', { class: 'fin-report__foot' },
      `تراز = بودجهٔ مصوب + کمک‌های دریافتی − فاکتورهای هزینه • ماندهٔ فعلی: ${moneyLabel(s.balance)} • این گزارش به‌صورت خودکار از سامانهٔ ${centerName()} تولید شده است.`)
  );
}

function printReport() {
  const host = el('div', { class: 'fin-report-host' }, buildReportSheet());
  document.body.appendChild(host);
  document.body.classList.add('fin-print-on');
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    document.body.classList.remove('fin-print-on');
    host.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 60_000); // محافظ: اگر afterprint نیامد
  window.print();
}

// ─── خروجی CSV ───

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  const s = state.summary;
  const rows = [];
  rows.push([`${centerName()} — گزارش بودجه و مالی`]);
  rows.push([`بازهٔ گزارش: ${rangeLabel()}`]);
  rows.push([`تاریخ گزارش: ${dateLabel(tehranTodayYmd())}`]);
  rows.push([]);
  rows.push(['بودجهٔ مصوب (تومان)', s.budgetTotal]);
  rows.push(['کمک‌های دریافتی (تومان)', s.donationsTotal]);
  rows.push(['فاکتورها — هزینه (تومان)', s.invoicesTotal]);
  rows.push(['ماندهٔ تراز (تومان)', s.balance]);
  rows.push([]);
  rows.push(['فاکتورها (هزینه)']);
  rows.push(['عنوان', 'دسته', 'مبلغ (تومان)', 'تاریخ']);
  for (const inv of state.invoices) rows.push([inv.title, inv.category, inv.amount, inv.invoiceDate]);
  rows.push(['جمع فاکتورها', '', s.invoicesTotal, '']);
  rows.push([]);
  rows.push(['کمک‌های دریافتی']);
  rows.push(['اهداکننده', 'مبلغ (تومان)', 'تاریخ', 'دانش‌آموز', 'یادداشت']);
  for (const d of state.donations) rows.push([d.donorName, d.amount, d.donationDate, d.studentName ?? '', d.note]);
  rows.push(['جمع کمک‌ها', s.donationsTotal, '', '', '']);

  const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: 'گزارش-مالی.csv' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast('فایل CSV ساخته شد', 'success', 2200);
}

// ─── پانل‌ها و تب‌ها ───

function drawPanel() {
  if (!_panel) return;
  if (state.tab === 'invoices') _panel.replaceChildren(invoicesPanel());
  else if (state.tab === 'donations') _panel.replaceChildren(donationsPanel());
  else _panel.replaceChildren(budgetsPanel());
}

function buildTabs() {
  const ctl = tabs([
    { key: 'invoices', icon: 'file', label: 'فاکتورها', onSelect: (k) => { state.tab = k; ctl.setActive(k); drawPanel(); } },
    { key: 'donations', icon: 'heart', label: 'کمک‌ها', onSelect: (k) => { state.tab = k; ctl.setActive(k); drawPanel(); } },
    { key: 'budgets', icon: 'target', label: 'بودجه‌ها', onSelect: (k) => { state.tab = k; ctl.setActive(k); drawPanel(); } }
  ], state.tab);
  return ctl;
}

// ─── نقطهٔ ورود ویو ───

export async function renderFinance(container, ctx) {
  void ctx; // روتر ctx = { params, query, path } — اینجا لازم نیست

  // گارد نقش — روتر هم roleOnly(['manager']) می‌گذارد؛ این لایهٔ دوم است
  if (session.user?.role !== 'manager') {
    container.replaceChildren(
      el('div', { class: 'view-pad' },
        emptyState({ title: 'دسترسی مجاز نیست', hint: 'بودجه و مالی مرکز فقط برای مدیر فعال است.' }))
    );
    return;
  }

  container.replaceChildren(loadingState('در حال بارگذاری اطلاعات مالی…'));

  try {
    await loadAll();
  } catch (err) {
    container.replaceChildren(errorState(err, () => renderFinance(container)));
    return;
  }

  _root = el('div', { class: 'fin-root' });

  // فیلتر بازهٔ تاریخ (اختیاری)
  const fromCtl = jalaliDateInput({
    value: state.from,
    onChange: (v) => {
      state.from = v;
      refresh({ silent: true });
    }
  });
  const toCtl = jalaliDateInput({
    value: state.to,
    onChange: (v) => {
      state.to = v;
      refresh({ silent: true });
    }
  });

  _tabCtl = buildTabs();
  _kpis = el('div', { class: 'kpi-grid' });
  _barBlock = el('div', {});
  _panel = el('div', {});

  const header = el('div', { class: 'page-head' },
    el('div', {},
      el('h2', { class: 'page-head__title' }, 'بودجه و مالی مرکز'),
      el('p', { class: 'page-head__desc' }, 'فاکتور هزینه، کمک خانواده‌ها و تراز بودجهٔ مصوب — فقط مدیر')
    ),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn--soft btn--sm', onclick: printReport }, icon('printer', 15), 'گزارش چاپی'),
    el('button', { class: 'btn btn--soft btn--sm', onclick: exportCsv }, icon('download', 15), 'خروجی CSV')
  );

  _root.append(
    header,
    el('div', { class: 'fin-filters' },
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'از تاریخ (اختیاری)'), fromCtl.root),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'تا تاریخ (اختیاری)'), toCtl.root)
    ),
    _kpis,
    _barBlock,
    _tabCtl.root,
    _panel
  );

  container.replaceChildren(_root);
  repaint();
}
