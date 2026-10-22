import { api } from './api.js';
import { el, icon, toast, toastError, confirmModal, formModal, emptyState, loadingState } from './ui.js';
import { formatJalaliDateTime } from './format.js';

export function drawAnnouncementsAdmin(body) {
  const list = el('div', { class: 'stack' });
  body.replaceChildren(
    el('div', { class: 'ann-admin' },
      el('div', { class: 'card' },
        el('div', { class: 'card__head' },
          el('div', { class: 'card__title' }, 'اعلان جدید'),
          el('span', { class: 'badge badge--neutral' }, 'مدیر مرکز')
        ),
        el('div', { class: 'card__body' }, composeForm(() => loadList(list)))
      ),
      el('div', { class: 'card' },
        el('div', { class: 'card__head' },
          el('div', { class: 'card__title' }, 'اعلان‌های ثبت‌شده'),
          el('button', { class: 'btn btn--ghost btn--sm', onclick: () => loadList(list) }, icon('refresh', 15), 'به‌روزرسانی')
        ),
        el('div', { class: 'card__body' }, list)
      )
    )
  );
  loadList(list);
}

function composeForm(onSaved) {
  const title = el('input', { class: 'input', placeholder: 'عنوان اعلان…', maxlength: 120 });
  const bodyIn = el('textarea', { class: 'textarea', rows: 3, placeholder: 'متن اعلان… (حداکثر ۲۰۰۰ نویسه)', maxlength: 2000 });

  const chkLogin = el('input', { type: 'checkbox' });
  const chkPanel = el('input', { type: 'checkbox' });
  chkLogin.checked = true; // پیش‌فرض منطقی

  const loginLabel = el('label', { class: 'ann-check' }, chkLogin, el('span', {}, 'نمایش در صفحه ورود'));
  const panelLabel = el('label', { class: 'ann-check' }, chkPanel, el('span', {}, 'نمایش در پنل کارمندان'));

  const submit = el('button', { class: 'btn btn--primary' }, icon('plus', 16), 'ثبت اعلان');

  submit.addEventListener('click', async () => {
    if (title.value.trim().length < 2) { toast('عنوان حداقل ۲ نویسه است', 'warning'); title.focus(); return; }
    if (bodyIn.value.trim().length < 2) { toast('متن اعلان حداقل ۲ نویسه است', 'warning'); bodyIn.focus(); return; }
    if (!chkLogin.checked && !chkPanel.checked) { toast('حداقل یک محل نمایش انتخاب کنید', 'warning'); return; }
    submit.disabled = true;
    try {
      await api.post('/api/announcements', {
        title: title.value.trim(),
        body: bodyIn.value.trim(),
        show_login: chkLogin.checked,
        show_panel: chkPanel.checked
      });
      toast('اعلان ثبت شد', 'success');
      title.value = '';
      bodyIn.value = '';
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
    el('div', { class: 'ann-checks' }, loginLabel, panelLabel),
    el('div', { class: 'ann-compose__hint' }, 'ارسال با بات پس از ثبت، از فهرست پایین انجام می‌شود.'),
    el('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, submit)
  );
}

async function loadList(list) {
  list.replaceChildren(loadingState());
  let items;
  try {
    items = (await api.get('/api/announcements/manage')).data;
  } catch (err) {
    list.replaceChildren(el('p', { style: { color: 'var(--error)' } }, err.message));
    return;
  }
  if (items.length === 0) {
    list.replaceChildren(emptyState({ iconName: 'bell', title: 'هنوز اعلانی ثبت نشده', hint: 'از فرم بالا اولین اعلان را بسازید.' }));
    return;
  }
  list.replaceChildren(...items.map((a) => annRow(a, loadList)));
}

function annRow(a, refresh) {
  const badges = el('div', { class: 'ann-badges' },
    a.showLogin ? el('span', { class: 'badge badge--neutral' }, 'صفحه ورود') : null,
    a.showPanel ? el('span', { class: 'badge badge--neutral' }, 'پنل') : null,
    a.botSentStaff ? el('span', { class: 'badge badge--success' }, 'بات همکاران ✓') : null,
    a.botSentFamilies ? el('span', { class: 'badge badge--success' }, 'بات خانواده‌ها ✓') : null,
    !a.active ? el('span', { class: 'badge badge--error' }, 'بایگانی') : null
  );

  const sendStaff = el('button', { class: 'btn btn--sm btn--ghost', title: 'ارسال با بات به همکاران' }, icon('bot', 15), 'همکاران');
  const sendFam = el('button', { class: 'btn btn--sm btn--ghost', title: 'ارسال با بات به خانواده‌ها' }, icon('bot', 15), 'خانواده‌ها');
  const editBtn = el('button', { class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'ویرایش' }, icon('edit', 15));
  const archiveBtn = el('button', { class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': a.active ? 'بایگانی' : 'فعال‌سازی' }, icon(a.active ? 'undo' : 'check', 15));
  const delBtn = el('button', { class: 'btn btn--ghost btn--icon btn--sm btn--danger-ghost', 'aria-label': 'حذف' }, icon('trash', 15));

  const busy = (btn) => { btn.disabled = true; setTimeout(() => { btn.disabled = false; }, 4000); };

  sendStaff.addEventListener('click', async () => {
    busy(sendStaff);
    try {
      const res = await api.post(`/api/announcements/${a.id}/send`, { target: 'staff' });
      toast(`ارسال شد — ${res.data.recipients} مقصد (${res.data.dispatch.sent} موفق)`, 'success', 4200);
      refresh();
    } catch (err) { toastError(err); }
  });
  sendFam.addEventListener('click', async () => {
    busy(sendFam);
    try {
      const res = await api.post(`/api/announcements/${a.id}/send`, { target: 'families' });
      toast(`ارسال شد — ${res.data.recipients} مقصد (${res.data.dispatch.sent} موفق)`, 'success', 4200);
      refresh();
    } catch (err) { toastError(err); }
  });
  editBtn.addEventListener('click', () => openEditModal(a, refresh));
  archiveBtn.addEventListener('click', async () => {
    try {
      await api.patch(`/api/announcements/${a.id}`, { active: !a.active });
      toast(a.active ? 'بایگانی شد' : 'فعال شد', 'success');
      refresh();
    } catch (err) { toastError(err); }
  });
  delBtn.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'حذف اعلان',
      message: `«${a.title}» برای همیشه حذف شود؟`,
      danger: true,
      confirmLabel: 'حذف'
    });
    if (!ok) return;
    try {
      await api.del(`/api/announcements/${a.id}`);
      toast('حذف شد', 'success');
      refresh();
    } catch (err) { toastError(err); }
  });

  return el('div', { class: 'ann-item' },
    el('div', { class: 'ann-item__head' },
      el('b', {}, a.title),
      el('span', { class: 'ann-item__date' }, formatJalaliDateTime(a.createdAt))
    ),
    el('p', { class: 'ann-item__body' }, a.body),
    badges,
    el('div', { class: 'ann-item__actions' }, sendStaff, sendFam, editBtn, archiveBtn, delBtn)
  );
}

function openEditModal(a, refresh) {
  formModal({
    title: 'ویرایش اعلان',
    fields: [
      { name: 'title', label: 'عنوان', required: true, span: 2 },
      { name: 'body', label: 'متن', type: 'textarea', rows: 4, required: true, span: 2 },
      { name: 'show_login', label: 'نمایش در صفحه ورود', type: 'switch' },
      { name: 'show_panel', label: 'نمایش در پنل کارمندان', type: 'switch' }
    ],
    initial: { title: a.title, body: a.body, show_login: a.showLogin, show_panel: a.showPanel },
    wide: true,
    onSubmit: async (values) => {
      await api.patch(`/api/announcements/${a.id}`, {
        title: values.title,
        body: values.body,
        show_login: values.show_login,
        show_panel: values.show_panel
      });
      toast('ذخیره شد', 'success');
      refresh();
    }
  });
}
