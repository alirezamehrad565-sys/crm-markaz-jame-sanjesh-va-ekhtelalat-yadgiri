import { api } from '../api.js';
import { el, icon, toast, toastError, confirmModal, openModal, emptyState, loadingState, errorState } from '../ui.js';
import { fa, formatJalaliDateTime } from '../format.js';

// ═══════════════════════════════════════════════════════════════
// نمون‌برگ‌ها و اسناد خام
// مخزن فایل‌های اداری مرکز — دسته‌ها (): سنجش، اختلالات، حسابداری، بازدیدها، تابلو/مُهر/پوستر، آیین‌نامه‌ها، سایر
//  دسترسی: فقط مدیر و منشی (router + سرور هر دو کنترل می‌کنند)
//  روت‌ها: #/docs (لیست) و #/docs/:id (جزئیات) — ثبت در app.js با عامل اصلی
// ═══════════════════════════════════════════════════════════════

const DOCS_LIST_LIMIT = 100;

// — دسته‌ها: کد + برچسب فارسی + کلاس رنگ (فقط توکن)
const DOC_CATEGORIES = [
  { key: 'sanjesh', label: 'سنجش', tone: 'docs-cat--sanjesh' },
  { key: 'ekhtelalat', label: 'اختلالات', tone: 'docs-cat--ekhtelalat' },
  { key: 'hesabdari', label: 'حسابداری', tone: 'docs-cat--hesabdari' },
  { key: 'bazdidha', label: 'بازدیدها', tone: 'docs-cat--bazdidha' },
  { key: 'tablo_mohr_poster', label: 'تابلو/مُهر/پوستر', tone: 'docs-cat--tablo-mohr-poster' },
  { key: 'ayinnameha', label: 'آیین‌نامه‌ها', tone: 'docs-cat--ayinnameha' },
  { key: 'other', label: 'سایر', tone: 'docs-cat--other' }
];

const CATEGORY_LABEL = Object.fromEntries(DOC_CATEGORIES.map((c) => [c.key, c.label]));
const CATEGORY_TONE = Object.fromEntries(DOC_CATEGORIES.map((c) => [c.key, c.tone]));

// ─── استایل اسکوپ‌شدهٔ ماژول — یک‌بار با id یکتا تزریق می‌شود ───

const STYLE_ID = 'docs-view-styles';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = el('style', { id: STYLE_ID }, `
.docs-root { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; }
.docs-toolbar { display: flex; flex-direction: column; gap: var(--sp-3); }
.docs-tools-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; min-width: 0; }
.docs-search { max-width: 340px; width: 100%; }
.docs-chips { display: flex; gap: var(--sp-1); flex-wrap: wrap; align-items: center; }
.docs-chips__label { font-size: var(--fs-xs); color: var(--text-3); font-weight: 600; }
.docs-list { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; }
.docs-card { display: flex; flex-direction: column; gap: var(--sp-2); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-4); cursor: pointer; text-align: start; width: 100%; font: inherit; color: inherit; transition: border-color var(--fast); }
.docs-card:focus-visible, .docs-file:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.docs-card:hover { border-color: var(--primary); }
.docs-card__head { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; min-width: 0; }
.docs-card__title { font-size: var(--fs-md); font-weight: 700; line-height: var(--lh-heading, 1.4); margin: 0; min-width: 0; overflow-wrap: anywhere; }
.docs-card__spacer { margin-inline-start: auto; }
.docs-cat { display: inline-flex; align-items: center; font-size: var(--fs-xs); font-weight: 700; padding: 3px 10px; border-radius: var(--radius-full); white-space: nowrap; }
.docs-cat--sanjesh { background: var(--primary-soft); color: var(--on-primary-soft); }
.docs-cat--ekhtelalat { background: color-mix(in srgb, var(--sick, #9333EA) 13%, transparent); color: var(--sick, #9333EA); }
.docs-cat--hesabdari { background: var(--warning-soft); color: var(--warning); }
.docs-cat--bazdidha { background: var(--success-soft); color: var(--success); }
.docs-cat--tablo-mohr-poster { background: var(--accent-soft); color: var(--on-accent-soft); }
.docs-cat--ayinnameha { background: var(--error-soft); color: var(--error); }
.docs-cat--other { background: var(--surface-3); color: var(--text-2); }
.docs-tags { display: flex; gap: var(--sp-1); flex-wrap: wrap; }
.docs-tag { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-xs); color: var(--text-2); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-full); padding: 2px 9px; white-space: nowrap; }
.docs-fmt { display: inline-flex; align-items: center; font-size: var(--fs-2xs); font-weight: 800; letter-spacing: 0; padding: 2px 7px; border-radius: var(--radius-xs); white-space: nowrap; } /* S8-20: کف ۱۲px؛ اتصال حروف برای برچسب فارسی */
.docs-fmt--lat { letter-spacing: 0.3px; } /* S8-20: فاصلهٔ حروف فقط برای برچسب لاتین */
.docs-fmt--pdf { background: var(--error-soft); color: var(--error); }
.docs-fmt--img { background: var(--success-soft); color: var(--success); }
.docs-fmt--doc { background: var(--primary-soft); color: var(--on-primary-soft); }
.docs-fmt--xls { background: var(--success-soft); color: var(--success); }
.docs-fmt--gen { background: var(--surface-3); color: var(--text-2); }
.docs-meta { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; font-size: var(--fs-xs); color: var(--text-3); min-width: 0; }
.docs-meta .docs-fmt { flex-shrink: 0; }
.docs-desc { margin: 0; color: var(--text-2); font-size: var(--fs-sm); line-height: var(--lh-body, 1.8); overflow-wrap: anywhere; }
.docs-filelist { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); overflow: hidden; }
.docs-file { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border); min-width: 0; }
.docs-file:last-child { border-bottom: none; }
.docs-file__name { font-weight: 600; font-size: var(--fs-sm); min-width: 0; overflow-wrap: anywhere; }
.docs-file__actions { display: flex; gap: var(--sp-1); margin-inline-start: auto; flex-wrap: wrap; }
.docs-file__spacer { margin-inline-start: auto; }
.docs-detail { display: flex; flex-direction: column; gap: var(--sp-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-5); min-width: 0; }
.docs-detail__head { display: flex; align-items: flex-start; gap: var(--sp-2); flex-wrap: wrap; }
.docs-detail__title { font-size: var(--fs-lg); font-weight: 700; margin: 0; line-height: var(--lh-heading, 1.4); min-width: 0; overflow-wrap: anywhere; }
.docs-crumb { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--primary); font: inherit; font-size: var(--fs-sm); font-weight: 600; cursor: pointer; padding: var(--sp-1) 0; }
.docs-crumb:hover { text-decoration: underline; }
.docs-section-title { font-size: var(--fs-sm); font-weight: 700; color: var(--text-2); margin: var(--sp-2) 0 var(--sp-2); }
.docs-uploadlist { display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-2); }
.docs-uploadlist__row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; font-size: var(--fs-xs); color: var(--text-2); border: 1px dashed var(--border); border-radius: var(--radius-sm); padding: var(--sp-2) var(--sp-3); min-width: 0; }
.docs-uploadlist__name { min-width: 0; overflow-wrap: anywhere; font-weight: 600; color: var(--text); }
.docs-empty-inline { padding: var(--sp-5); text-align: center; color: var(--text-3); font-size: var(--fs-sm); }
@media (max-width: 640px) {
  .docs-tools-row { align-items: stretch; flex-direction: column; }
  .docs-search { max-width: none; }
  .docs-card { padding: var(--sp-3); }
  .docs-file { padding: var(--sp-3); }
  .docs-file__actions { margin-inline-start: 0; width: 100%; }
  .docs-detail { padding: var(--sp-4); }
}
`);

  document.head.appendChild(style);
}

// ─── کمک‌های محلی ───

function sizeLabel(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${fa(mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10)} مگابایت`;
  }
  return bytes >= 1024 ? `${fa(Math.round(bytes / 1024))} کیلوبایت` : `${fa(bytes)} بایت`;
}

/** بج فرمت فایل — PDF/IMG/DOC/XLS/CSV/TXT/… */
function fmtOf(file) {
  const m = String(file.mime ?? '').toLowerCase();
  if (m === 'application/pdf') return { label: 'PDF', tone: 'docs-fmt--pdf' };
  if (m.startsWith('image/')) return { label: 'IMG', tone: 'docs-fmt--img' };
  if (m.includes('wordprocessingml') || m === 'application/msword') return { label: 'DOC', tone: 'docs-fmt--doc' };
  if (m.includes('spreadsheetml') || m === 'application/vnd.ms-excel') return { label: 'XLS', tone: 'docs-fmt--xls' };
  if (m === 'text/csv') return { label: 'CSV', tone: 'docs-fmt--xls' };
  if (m === 'text/plain') return { label: 'TXT', tone: 'docs-fmt--gen' };
  const ext = String(file.filename ?? '').split('.').pop() ?? '';
  const label = ext && ext.length <= 4 ? ext.toUpperCase() : 'فایل';
  return { label, lat: /^[A-Z0-9]+$/.test(label), tone: 'docs-fmt--gen' }; /* S8-20 */
}

function fmtBadge(file) {
  const f = fmtOf(file);
  return el('span', { class: `docs-fmt ${f.tone}${f.lat ? ' docs-fmt--lat' : ''}` }, f.label); /* S8-20 */
}

function catBadge(code) {
  return el('span', { class: `docs-cat ${CATEGORY_TONE[code] ?? 'docs-cat--other'}` }, CATEGORY_LABEL[code] ?? 'سایر');
}

function tagChips(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  return el('div', { class: 'docs-tags' },
    tags.map((t) => el('span', { class: 'docs-tag' }, icon('tag', 11), t)));
}

function totalSizeOf(doc) {
  return (doc.files ?? []).reduce((n, f) => n + (Number(f.size) || 0), 0);
}

/** فقط PDF و تصویر پیش‌نمایش/پرینت در تب جدید دارند */
function isPreviewable(file) {
  const m = String(file.mime ?? '').toLowerCase();
  return m === 'application/pdf' || m.startsWith('image/');
}

async function downloadFile(docId, file) {
  try {
    const { blob, filename } = await api.downloadBlob(`/api/docs/${docId}/files/${file.id}`);
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename || file.filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (err) {
    toastError(err);
  }
}

/** انتخاب فایل‌ها — فهرست قابل حذف زیر input */
function filePicker({ accept = '', hint = '' } = {}) {
  const picked = []; // آرایهٔ File خام
  const input = el('input', { class: 'input', type: 'file', multiple: true, accept, 'aria-label': 'انتخاب فایل‌ها' });
  const list = el('div', { class: 'docs-uploadlist' });

  function draw() {
    list.replaceChildren(...picked.map((f, i) => el('div', { class: 'docs-uploadlist__row' },
      icon('file', 14),
      el('span', { class: 'docs-uploadlist__name' }, f.name),
      el('span', {}, sizeLabel(f.size)),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon btn--sm',
        'aria-label': `حذف ${f.name} از فهرست`,
        onclick: () => { picked.splice(i, 1); draw(); }
      }, icon('x', 13))
    )));
  }

  input.addEventListener('change', () => {
    for (const f of Array.from(input.files ?? [])) {
      if (f.size > 50 * 1024 * 1024) {
        toast(`حجم «${f.name}» بیش از ${sizeLabel(50 * 1024 * 1024)} است`, 'error');
        continue;
      }
      picked.push(f);
    }
    input.value = '';
    draw();
  });

  return {
    root: el('div', { class: 'field' },
      el('label', { class: 'field__label' }, 'فایل‌ها (چندتایی مجاز است)'),
      input,
      hint ? el('div', { class: 'field__hint' }, hint) : null,
      list),
    files: () => [...picked]
  };
}

function parseTagsInput(raw) {
  return String(raw ?? '')
    .split(/[،,]/)
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 2)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 8);
}

// ─── مودال ساخت سند (+ بارگذاری اولین فایل‌ها) ───

function openCreateDocModal({ onDone }) {
  const titleInput = el('input', { class: 'input', type: 'text', maxlength: '150', placeholder: 'مثلاً: بخشنامهٔ ارزشیابی بدو ورود', 'aria-label': 'عنوان سند' }); /* S8-08 */
  const catSelect = el('select', { class: 'select', 'aria-label': 'دستهٔ سند' },
    DOC_CATEGORIES.map((c) => el('option', { value: c.key }, c.label)));
  catSelect.value = 'other';
  const descInput = el('textarea', { class: 'textarea', rows: '3', maxlength: '4000', placeholder: 'توضیح کوتاه سند (اختیاری)', 'aria-label': 'توضیح سند' }); /* S8-08 */
  const tagsInput = el('input', {
    class: 'input', type: 'text', maxlength: '200',
    placeholder: 'جدا با ویرگول، مثلاً: ارزشیابی، بدو ورود',
    'aria-label': 'برچسب‌ها'
  });
  const picker = filePicker({ accept: '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv', hint: 'سند PDF/Word/Excel/متن یا تصویر — حداکثر ۵۰ مگابایت برای هر فایل' });

  const body = el('div', {},
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, el('span', {}, 'عنوان سند '), el('span', { class: 'req' }, '*')), titleInput),
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'دسته'), catSelect),
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'توضیح'), descInput),
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'برچسب‌های آزاد'), tagsInput),
    picker.root
  );

  openModal({
    title: 'بارگذاری سند',
    body,
    wide: true,
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', onclick: () => close() }, 'انصراف'),
      (close) => {
        const submitBtn = el('button', {
          class: 'btn btn--primary',
          onclick: async () => {
            const title = titleInput.value.trim();
            if (title.length < 2) { toast('عنوان سند حداقل ۲ نویسه است', 'error'); return; }
            submitBtn.disabled = true; // دوبارکلیک = سند تکراری + آپلود دوباره
            try {
              const payload = {
                title,
                category: catSelect.value,
                description: descInput.value.trim(),
                tags: parseTagsInput(tagsInput.value)
              };
              let docId = null;
              try {
                const created = await api.post('/api/docs', payload);
                docId = created?.data?.id ?? null;
              } catch (err) {
                toastError(err);
                return;
              }
              const files = picker.files();
              if (files.length > 0 && docId) {
                try {
                  const form = new FormData();
                  for (const f of files) form.append('files', f, f.name); // — فیلد فایل: files (مثل knowledge)
                  await api.postForm(`/api/docs/${docId}/files`, form);
                } catch (err) {
                  toastError(err);
                  toast('سند ثبت شد ولی بارگذاری فایل‌ها ناموفق بود — از صفحهٔ خود سند دوباره تلاش کنید', 'warning', 6000);
                  close();
                  onDone?.(docId);
                  return;
                }
              }
              toast('سند ثبت شد', 'success');
              close();
              onDone?.(docId);
            } finally {
              submitBtn.disabled = false;
            }
          }
        }, icon('upload', 15), 'ثبت سند');
        return submitBtn;
      }
    ]
  });
}

// ─── مودال ویرایش مشخصات سند (بدون فایل) ───

function openEditDocModal(doc, { onDone }) {
  const titleInput = el('input', { class: 'input', type: 'text', maxlength: '150', value: doc.title, 'aria-label': 'عنوان سند' }); /* S8-08 */
  const catSelect = el('select', { class: 'select', 'aria-label': 'دستهٔ سند' },
    DOC_CATEGORIES.map((c) => el('option', { value: c.key }, c.label)));
  catSelect.value = doc.category ?? 'other';
  const descInput = el('textarea', { class: 'textarea', rows: '3', maxlength: '4000', 'aria-label': 'توضیح سند' }, doc.description ?? ''); /* S8-08 */
  const tagsInput = el('input', {
    class: 'input', type: 'text', maxlength: '200',
    value: (doc.tags ?? []).join('، '),
    placeholder: 'جدا با ویرگول',
    'aria-label': 'برچسب‌ها'
  });

  openModal({
    title: 'ویرایش مشخصات سند',
    body: el('div', {},
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, el('span', {}, 'عنوان سند '), el('span', { class: 'req' }, '*')), titleInput),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'دسته'), catSelect),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'توضیح'), descInput),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'برچسب‌های آزاد'), tagsInput)),
    wide: true,
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', onclick: () => close() }, 'انصراف'),
      (close) => el('button', {
        class: 'btn btn--primary',
        onclick: async () => {
          const title = titleInput.value.trim();
          if (title.length < 2) { toast('عنوان سند حداقل ۲ نویسه است', 'error'); return; }
          try {
            await api.patch(`/api/docs/${doc.id}`, {
              title,
              category: catSelect.value,
              description: descInput.value.trim(),
              tags: parseTagsInput(tagsInput.value)
            });
            toast('مشخصات سند ذخیره شد', 'success');
            close();
            onDone?.();
          } catch (err) { toastError(err); }
        }
      }, icon('save', 15), 'ذخیره تغییرات')
    ]
  });
}

// ─── مودال افزودن فایل به سند موجود ───

function openAddFilesModal(doc, { onDone }) {
  const picker = filePicker({ accept: '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv', hint: 'PDF/Word/Excel/متن یا تصویر — چند فایل هم‌زمان' });
  openModal({
    title: `افزودن فایل — ${doc.title}`,
    body: picker.root,
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', onclick: () => close() }, 'انصراف'),
      (close) => el('button', {
        class: 'btn btn--primary',
        onclick: async () => {
          const files = picker.files();
          if (files.length === 0) { toast('حداقل یک فایل انتخاب کنید', 'error'); return; }
          try {
            const form = new FormData();
            for (const f of files) form.append('files', f, f.name); // — فیلد فایل: files (مثل knowledge)
            await api.postForm(`/api/docs/${doc.id}/files`, form);
            toast('فایل(ها) اضافه شد', 'success');
            close();
            onDone?.();
          } catch (err) { toastError(err); }
        }
      }, icon('upload', 15), 'بارگذاری')
    ]
  });
}

// ─── حذف سند (نرم) با تأیید ───

async function deleteDocWithConfirm(doc, onDone) {
  const ok = await confirmModal({
    title: 'حذف سند',
    message: `سند «${doc.title}» حذف شود؟ سند از فهرست نمون‌برگ‌ها حذف می‌شود (حذف نرم).`,
    confirmLabel: 'حذف',
    danger: true
  });
  if (!ok) return;
  try {
    await api.del(`/api/docs/${doc.id}`);
    toast('سند حذف شد', 'success');
    onDone?.();
  } catch (err) { toastError(err); }
}

async function deleteFileWithConfirm(doc, file, onDone) {
  const ok = await confirmModal({
    title: 'حذف فایل',
    message: `فایل «${file.filename}» از سند حذف شود؟ این عمل بازگشت‌پذیر نیست.`,
    confirmLabel: 'حذف',
    danger: true
  });
  if (!ok) return;
  try {
    await api.del(`/api/docs/${doc.id}/files/${file.id}`);
    toast('فایل حذف شد', 'success');
    onDone?.();
  } catch (err) { toastError(err); }
}

// ─── ویو: لیست نمون‌برگ‌ها ───

export async function renderDocsList(container, ctx) {
  ensureStyles();
  const state = {
    q: String(ctx?.query?.q ?? ''),
    category: String(ctx?.query?.category ?? 'all')
  };
  if (!DOC_CATEGORIES.some((c) => c.key === state.category) && state.category !== 'all') state.category = 'all';
  let listItems = []; // فهرست انباشته برای «نمایش بیشتر»
  let docsHasMore = false;

  // ─── سربرگ صفحه ───
  const head = el('div', { class: 'page-head' },
    el('div', {},
      el('h2', { class: 'page-head__title' }, 'نمون‌برگ‌ها و اسناد خام'),
      el('p', { class: 'page-head__desc' }, 'مخزن فایل‌های اداری مرکز — بخشنامه، فرم، آیین‌نامه و گزارش‌ها با دسته و برچسب')),
    el('div', { class: 'spacer' }),
    el('button', {
      class: 'btn btn--primary btn--sm',
      onclick: () => openCreateDocModal({ onDone: () => refreshList() })
    }, icon('upload', 15), 'بارگذاری سند')
  );

  // ─── جستجوی زنده + فیلتر دسته ───
  const search = el('input', {
    class: 'input docs-search',
    type: 'search',
    placeholder: 'جستجو در عنوان، توضیح و برچسب‌ها…',
    value: state.q,
    'aria-label': 'جستجو در اسناد'
  });
  let debounce = null;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.q = search.value.trim();
      refreshList(); // — فقط محتوای لیست آپدیت می‌شود؛ نما مونت می‌ماند
    }, 250);
  });

  const chipsWrap = el('div', { class: 'docs-chips', role: 'group', 'aria-label': 'فیلتر دسته' },
    el('span', { class: 'docs-chips__label' }, 'دسته:'));
  const chipButtons = new Map();
  for (const c of [{ key: 'all', label: 'همه' }, ...DOC_CATEGORIES]) {
    const chip = el('button', {
      class: `chip${state.category === c.key ? ' is-active' : ''}`,
      onclick: () => {
        state.category = c.key;
        for (const [k, b] of chipButtons) b.classList.toggle('is-active', k === c.key);
        refreshList();
      }
    }, c.label);
    chipButtons.set(c.key, chip);
    chipsWrap.appendChild(chip);
  }

  const toolbar = el('div', { class: 'docs-toolbar' },
    el('div', { class: 'docs-tools-row' }, search),
    chipsWrap
  );

  // ─── بدنهٔ لیست — تا پایان عمر نما مونت می‌ماند (جستجوی زنده بدون فلش) ───
  const listArea = el('div', { class: 'docs-list' }, loadingState('در حال بارگذاری اسناد…'));

  const page = el('div', { class: 'docs-root' }, head, toolbar, listArea);
  container.replaceChildren(page);

  async function refreshList({ reset = true } = {}) {
    // سقف خاموش ۱۰۰ حذف شد: meta.hasMore خوانده می‌شود و «نمایش بیشتر» دارد
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category && state.category !== 'all') params.set('category', state.category);
    params.set('limit', String(DOCS_LIST_LIMIT));
    params.set('offset', String(reset ? 0 : listItems.length));
    let items = [];
    let hasMore = false;
    try {
      const res = await api.get(`/api/docs?${params.toString()}`);
      items = res?.data ?? [];
      hasMore = Boolean(res?.meta?.hasMore);
    } catch (err) {
      listArea.replaceChildren(errorState(err, () => refreshList({ reset })));
      return;
    }
    listItems = reset ? items : listItems.concat(items);
    docsHasMore = hasMore;
    drawList();
  }

  function drawList() {
    if (!Array.isArray(listItems) || listItems.length === 0) {
      listArea.replaceChildren(emptyState({
        iconName: 'file',
        title: state.q || state.category !== 'all' ? 'سندی با این شرایط پیدا نشد' : 'هنوز سندی بارگذاری نشده است',
        hint: 'با دکمهٔ «بارگذاری سند»، بخشنامه‌ها و فرم‌های اداری مرکز را با دسته و برچسب همین‌جا نگه دارید.',
        actionLabel: 'بارگذاری سند',
        onAction: () => openCreateDocModal({ onDone: () => refreshList() })
      }));
      return;
    }
    const moreBtn = docsHasMore
      ? el('div', { style: { display: 'flex', justifyContent: 'center', padding: 'var(--sp-3)' } },
          el('button', { class: 'btn btn--ghost btn--sm', onclick: () => refreshList({ reset: false }) },
            icon('chevL', 14), 'نمایش بیشتر'))
      : null;
    listArea.replaceChildren(...listItems.map(docCard), ...(moreBtn ? [moreBtn] : []));
  }

  function docCard(doc) {
    const files = doc.files ?? [];
    const metaRow = el('div', { class: 'docs-meta' },
      files.length > 0
        ? [
          ...uniqFormats(files).map((b) => b),
          el('span', {}, `${fa(files.length)} فایل — ${sizeLabel(totalSizeOf(doc))}`)
        ]
        : el('span', {}, 'بدون فایل'),
      el('span', {}, formatJalaliDateTime(doc.createdAt)),
      doc.createdByName ? el('span', {}, `ثبت: ${doc.createdByName}`) : null
    );

    const deleteBtn = el('button', {
      class: 'btn btn--ghost btn--icon btn--sm',
      'aria-label': `حذف سند ${doc.title}`,
      title: 'حذف سند',
      onclick: (e) => {
        e.stopPropagation();
        deleteDocWithConfirm(doc, () => refreshList());
      }
    }, icon('trash', 14));

    const card = el('div', {
      class: 'docs-card',
      role: 'button',
      tabindex: '0',
      'aria-label': `نمایش جزئیات سند ${doc.title}`,
      onclick: () => { location.hash = `#/docs/${doc.id}`; },
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          location.hash = `#/docs/${doc.id}`;
        }
      }
    },
    el('div', { class: 'docs-card__head' },
      el('h3', { class: 'docs-card__title' }, doc.title),
      catBadge(doc.category),
      el('span', { class: 'docs-card__spacer' }),
      deleteBtn
    ),
    tagChips(doc.tags),
    doc.description ? el('p', { class: 'docs-desc' }, doc.description.length > 160 ? doc.description.slice(0, 160) + '…' : doc.description) : null,
    metaRow
    );
    return card;
  }

  function uniqFormats(files) {
    const seen = new Map();
    for (const f of files) {
      const b = fmtOf(f);
      if (!seen.has(b.label)) seen.set(b.label, fmtBadge(f));
    }
    return [...seen.values()];
  }

  await refreshList();
}

// ─── ویو: جزئیات سند ───

export async function renderDocsDetail(container, ctx) {
  ensureStyles();
  const docId = String(ctx?.params?.id ?? '');

  // — crumb دستی بازگشت به لیست
  const crumb = el('button', { class: 'docs-crumb', type: 'button', onclick: () => { location.hash = '#/docs'; } },
    icon('chevR', 14), 'نمون‌برگ‌ها و اسناد خام');

  let doc = null;
  try {
    const res = await api.get(`/api/docs/${encodeURIComponent(docId)}`);
    doc = res?.data ?? null;
  } catch (err) {
    container.replaceChildren(
      el('div', { class: 'docs-root' }, crumb, errorState(err, () => renderDocsDetail(container, ctx)))
    );
    return;
  }
  if (!doc) {
    container.replaceChildren(crumb, emptyState({ iconName: 'file', title: 'سند پیدا نشد' }));
    return;
  }

  // ─── کارت مشخصات سند ───
  const actionsRow = el('div', { class: 'docs-tools-row' },
    el('button', { class: 'btn btn--primary btn--sm', onclick: () => openAddFilesModal(doc, () => rerender()) },
      icon('upload', 14), 'افزودن فایل'),
    el('button', { class: 'btn btn--soft btn--sm', onclick: () => openEditDocModal(doc, () => rerender()) },
      icon('edit', 14), 'ویرایش مشخصات'),
    el('button', {
      class: 'btn btn--ghost btn--sm',
      style: { color: 'var(--danger)' },
      onclick: () => deleteDocWithConfirm(doc, () => { location.hash = '#/docs'; })
    }, icon('trash', 14), 'حذف سند')
  );

  const headCard = el('div', { class: 'docs-detail' },
    el('div', { class: 'docs-detail__head' },
      el('h2', { class: 'docs-detail__title' }, doc.title),
      catBadge(doc.category)
    ),
    doc.description ? el('p', { class: 'docs-desc' }, doc.description) : null,
    tagChips(doc.tags),
    el('div', { class: 'docs-meta' },
      el('span', {}, formatJalaliDateTime(doc.createdAt)),
      doc.createdByName ? el('span', {}, `ثبت: ${doc.createdByName}`) : null
    ),
    actionsRow
  );

  // ─── فهرست فایل‌ها ───
  const fileArea = el('div', { class: 'docs-list' });

  function fileRow(file) {
    const actions = el('div', { class: 'docs-file__actions' });
    if (isPreviewable(file)) {
      actions.appendChild(el('button', {
        class: 'btn btn--soft btn--sm',
        onclick: () => window.open(`/api/docs/${docId}/files/${file.id}?inline=1`, '_blank', 'noopener') /* S8-26 */
      }, icon('printer', 14), 'پیش‌نمایش / پرینت'));
    }
    actions.appendChild(el('button', {
      class: 'btn btn--ghost btn--sm',
      onclick: () => downloadFile(docId, file)
    }, icon('download', 14), 'دانلود'));
    actions.appendChild(el('button', {
      class: 'btn btn--ghost btn--icon btn--sm',
      style: { color: 'var(--danger)' },
      'aria-label': `حذف فایل ${file.filename}`,
      title: 'حذف فایل',
      onclick: () => deleteFileWithConfirm(doc, file, () => rerender())
    }, icon('trash', 14)));

    return el('div', { class: 'docs-file' },
      fmtBadge(file),
      el('span', { class: 'docs-file__name' }, file.filename),
      el('span', { class: 'docs-meta' }, sizeLabel(file.size)),
      actions
    );
  }

  function drawFiles() {
    const files = doc.files ?? [];
    if (files.length === 0) {
      fileArea.replaceChildren(
        el('div', { class: 'docs-filelist' },
          el('div', { class: 'docs-empty-inline' }, 'هنوز فایلی به این سند پیوست نشده است — با «افزودن فایل» بخشنامه یا فرم را بارگذاری کنید.'))
      );
      return;
    }
    fileArea.replaceChildren(el('div', { class: 'docs-filelist' }, ...files.map(fileRow)));
  }

  const root = el('div', { class: 'docs-root' },
    crumb,
    headCard,
    el('h3', { class: 'docs-section-title' }, `فایل‌های سند (${fa((doc.files ?? []).length)})`),
    fileArea
  );
  container.replaceChildren(root);
  drawFiles();

  // — پس از هر تغییر (ویرایش/افزودن/حذف فایل) کل جزئیات تازه می‌شود
  function rerender() {
    renderDocsDetail(container, ctx);
  }
}
