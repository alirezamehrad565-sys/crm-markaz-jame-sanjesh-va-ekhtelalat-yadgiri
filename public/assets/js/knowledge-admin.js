/**
 * پنل پایگاه دانش
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// knowledge-admin.js — مدیریت دانش‌افزایی (تب تنظیمات، دفتر)
// دستور کاربر: «باید بخش‌هایی برای اطلاع‌رسانی و دانش‌افزایی بگذاریم»
// ساخت/ویرایش/انتشار/حذف مقالهٔ دانش — نمایش روی داشبورد همهٔ همکاران

import { api } from './api.js';
import { el, icon, toast, toastError, confirmModal, formModal, emptyState, loadingState, openModal } from './ui.js';
import { session } from './state.js';
import { formatJalaliDateTime } from './format.js';

const CATEGORY_LABELS = { tip: 'نکتهٔ آموزشی', protocol: 'پروتکل درمانی', article: 'مقاله', news: 'خبر مرکز' };
const CATEGORY_BADGE = { tip: 'badge--primary', protocol: 'badge--success', article: 'badge--accent', news: 'badge--neutral' };

export function drawKnowledgeAdmin(body) {
  const list = el('div', { class: 'stack' });
  body.replaceChildren(
    el(
      'div',
      { class: 'card' },
      el(
        'div',
        { class: 'card__head' },
        el('div', { class: 'card__title' }, 'مقالهٔ دانش جدید'),
        el('span', { class: 'badge badge--neutral' }, 'دفتر مرکز')
      ),
      el('div', { class: 'card__body' }, composeForm(() => loadList(list)))
    ),
    el(
      'div',
      { class: 'card' },
      el(
        'div',
        { class: 'card__head' },
        el('div', { class: 'card__title' }, 'مقاله‌های ثبت‌شده'),
        el('button', { class: 'btn btn--ghost btn--sm', onclick: () => loadList(list) }, icon('refresh', 15), 'به‌روزرسانی')
      ),
      el('div', { class: 'card__body' }, list)
    )
  );
  loadList(list);
}

// ─────────────── فرم ساخت ───────────────

function composeForm(onSaved) {
  const title = el('input', { class: 'input', placeholder: 'عنوان مقاله…', maxlength: 140 });
  const bodyIn = el('textarea', { class: 'textarea', rows: 5, placeholder: 'متن مقاله — نکتهٔ آموزشی، پروتکل، راهنما یا خبر مرکز…', maxlength: 6000 });

  const selCategory = el('select', { class: 'input' },
    ...Object.entries(CATEGORY_LABELS).map(([value, label]) => el('option', { value }, label))
  );
  selCategory.value = 'tip';

  const chkPinned = el('input', { type: 'checkbox' });
  const chkPublished = el('input', { type: 'checkbox' });
  chkPublished.checked = true; // پیش‌فرض منطقی — انتشار فوری

  const submit = el('button', { class: 'btn btn--primary' }, icon('plus', 16), 'ثبت مقاله');

  submit.addEventListener('click', async () => {
    if (title.value.trim().length < 2) { toast('عنوان حداقل ۲ نویسه است', 'warning'); title.focus(); return; }
    if (bodyIn.value.trim().length < 2) { toast('متن مقاله حداقل ۲ نویسه است', 'warning'); bodyIn.focus(); return; }
    submit.disabled = true;
    try {
      await api.post('/api/knowledge', {
        title: title.value.trim(),
        body: bodyIn.value.trim(),
        category: selCategory.value,
        pinned: chkPinned.checked,
        published: chkPublished.checked
      });
      toast('مقاله ثبت شد و روی داشبورد همکاران نمایش داده می‌شود', 'success');
      title.value = '';
      bodyIn.value = '';
      chkPinned.checked = false;
      onSaved();
    } catch (err) {
      toastError(err);
    } finally {
      submit.disabled = false;
    }
  });

  return el('div', { class: 'ann-compose' },
    title,
    bodyIn,
    el('div', { class: 'ann-checks' },
      el('label', { class: 'ann-check', style: { gap: '6px' } }, selCategory),
      el('label', { class: 'ann-check' }, chkPinned, el('span', {}, 'سنجاق در بالای فهرست')),
      el('label', { class: 'ann-check' }, chkPublished, el('span', {}, 'انتشار برای همکاران'))
    ),
    el('div', { class: 'ann-compose__hint' }, 'مقاله‌های منتشرشده روی داشبورد همهٔ همکاران (کارت «دانش‌افزایی») دیده می‌شوند.'),
    el('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, submit)
  );
}

// ─────────────── فهرست ───────────────

async function loadList(list) {
  list.replaceChildren(loadingState());
  let items;
  try {
    items = (await api.get('/api/knowledge/manage')).data;
  } catch (err) {
    list.replaceChildren(el('p', { style: { color: 'var(--error)' } }, err.message));
    return;
  }
  if (items.length === 0) {
    list.replaceChildren(emptyState({ iconName: 'file', title: 'هنوز مقاله‌ای ثبت نشده', hint: 'از فرم بالا اولین مقالهٔ دانش را بسازید.' }));
    return;
  }
  list.replaceChildren(...items.map((k) => knRow(k, loadList)));
}

function knRow(k, refresh) {
  const isManager = session.user?.role === 'manager';
  const badges = el('div', { class: 'ann-badges' },
    el('span', { class: `badge ${CATEGORY_BADGE[k.category] ?? 'badge--neutral'}` }, CATEGORY_LABELS[k.category] ?? k.category),
    k.pinned ? el('span', { class: 'badge badge--accent' }, 'سنجاق‌شده') : null,
    k.published ? el('span', { class: 'badge badge--success' }, 'منتشرشده') : el('span', { class: 'badge badge--error' }, 'پیش‌نویس')
  );

  const viewBtn = el('button', { class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'مشاهده' }, icon('eye', 15));
  const editBtn = el('button', { class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'ویرایش' }, icon('edit', 15));
  const pubBtn = el('button', { class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': k.published ? 'پیش‌نویس کردن' : 'انتشار' }, icon(k.published ? 'undo' : 'check', 15));
  const delBtn = isManager ? el('button', { class: 'btn btn--ghost btn--icon btn--sm btn--danger-ghost', 'aria-label': 'حذف' }, icon('trash', 15)) : null;

  viewBtn.addEventListener('click', () => {
    openModal({
      title: `${CATEGORY_LABELS[k.category] ?? k.category} — ${k.title}`,
      wide: true,
      body: el('div', { class: 'kn-reader' }, k.body),
      actions: []
    });
  });
  editBtn.addEventListener('click', () => openEditModal(k, refresh));
  pubBtn.addEventListener('click', async () => {
    try {
      await api.patch(`/api/knowledge/${k.id}`, { published: !k.published });
      toast(k.published ? 'به پیش‌نویس رفت' : 'منتشر شد', 'success');
      refresh();
    } catch (err) { toastError(err); }
  });
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'حذف مقالهٔ دانش',
        message: `«${k.title}» برای همیشه حذف شود؟`,
        danger: true,
        confirmLabel: 'حذف'
      });
      if (!ok) return;
      try {
        await api.del(`/api/knowledge/${k.id}`);
        toast('حذف شد', 'success');
        refresh();
      } catch (err) { toastError(err); }
    });
  }

  return el('div', { class: 'ann-item' },
    el('div', { class: 'ann-item__head' },
      el('b', {}, k.title),
      el('span', { class: 'ann-item__date' }, formatJalaliDateTime(k.createdAt))
    ),
    el('p', { class: 'ann-item__body' }, k.body.length > 160 ? k.body.slice(0, 160) + '…' : k.body),
    badges,
    el('div', { class: 'ann-item__actions' }, viewBtn, editBtn, pubBtn, delBtn)
  );
}

function openEditModal(k, refresh) {
  formModal({
    title: 'ویرایش مقالهٔ دانش',
    fields: [
      { name: 'title', label: 'عنوان', required: true, span: 2 },
      { name: 'category', label: 'دسته', type: 'select', options: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })), span: 1 },
      { name: 'body', label: 'متن', type: 'textarea', rows: 6, required: true, span: 2 },
      { name: 'pinned', label: 'سنجاق در بالای فهرست', type: 'switch' },
      { name: 'published', label: 'منتشرشده', type: 'switch' }
    ],
    initial: { title: k.title, body: k.body, category: k.category, pinned: k.pinned, published: k.published },
    wide: true,
    onSubmit: async (values) => {
      await api.patch(`/api/knowledge/${k.id}`, {
        title: values.title,
        body: values.body,
        category: values.category,
        pinned: values.pinned,
        published: values.published
      });
      toast('ذخیره شد', 'success');
      refresh();
    }
  });
}
