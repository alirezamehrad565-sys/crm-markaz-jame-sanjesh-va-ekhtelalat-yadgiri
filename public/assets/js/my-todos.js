import { api } from './api.js';
import {
  el,
  icon,
  tabs,
  toast,
  toastError,
  confirmModal,
  formModal,
  emptyState,
  loadingState,
  skeletonState,
  errorState,
  lockBtn,
  collapseRemove,
  flashNode
} from './ui.js';
import { fa, formatJalaliNumeric, tehranYmdOfIso } from './format.js';
import { jalaliDateInput } from './jalali-picker.js';
import { session } from './state.js';

export function canSeeTodos() {
  return Boolean(session.user && (session.user.role === 'manager' || session.user.role === 'secretary'));
}

const SELF_VALUE = '__self__';
const CHECKLIST_MAX = 20;

function isOverdue(t) {
  return t.status === 'pending' && t.dueAt && new Date(t.dueAt).getTime() < Date.now();
}

function dueLabel(t) {
  return `مهلت: ${fa(formatJalaliNumeric(tehranYmdOfIso(t.dueAt)))}`;
}

function isPersonal(t) {
  return t.assignerId && t.assigneeId && t.assignerId === t.assigneeId;
}

function progressBadge(t) {
  if (!t.checklist || t.checklist.length === 0) return null;
  const done = t.checklist.filter((i) => i.done).length;
  const complete = done === t.checklist.length;
  return el(
    'span',
    { class: `badge todo-progress ${complete ? 'badge--success' : 'badge--neutral'}`, title: 'پیشرفت چک‌لیست' },
    `${fa(done)}/${fa(t.checklist.length)}`
  );
}

export function renderMyTodosCard() {
  const countBadge = el('span', { class: 'badge badge--error', hidden: true });
  const body = el('div', { class: 'card__body' });
  const card = el(
    'div',
    { class: 'card todos-card', style: { marginBottom: 'var(--sp-4)' } },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('check', 18), 'کارهای من'), countBadge),
    body
  );

  let box = 'inbox';
  let assignees = null; // کش سبک — کارکنان privileged غیر از خودم
  let items = []; // — کش محلی برای پچ درجای آیتم‌ها
  let gen = 0; // — گارد نسل: پاسخ کهنه رندر نمی‌شود
  let chromeBuilt = false;
  let listZone = null;
  let tabApi = null;

  /* —— ۱.۲۱.۰ جریان پیوسته (زبان ۱.۱۹/۱.۲۰):
     شِل کارت — ردیف افزودن + تب‌ها — یک‌بار ساخته می‌شود؛ اسکلت فقط در نخستین mount.
     هر اکشن (انجام/ویرایش/حذف/افزودن/تیک چک‌لیست) آیتم خودش را درجا پچ می‌کند
     (upsertTodoItem) و بج توجه را بی‌صدا همگام می‌کند (syncQuiet) —
     دیگر هیچ مسیری کل بدنهٔ کارت را با اسکلت rebuild نمی‌کند. —— */
  async function refresh({ silent = false } = {}) {
    const myGen = ++gen;
    if (!silent) body.replaceChildren(skeletonState('list', 5));
    try {
      const [todosRes, staffRes] = await Promise.all([
        api.get(`/api/todos?box=${box}`),
        assignees ? Promise.resolve(null) : api.get('/api/staff?active=true')
      ]);
      if (myGen !== gen) return;
      if (staffRes) {
        assignees = staffRes.data.filter(
          (s) => (s.role === 'manager' || s.role === 'secretary') && s.id !== session.user?.staffId
        );
      }
      items = todosRes.data ?? [];
      if (!chromeBuilt) buildChrome();
      syncBadge(todosRes.badge ?? { urgent: 0, overdue: 0, attention: 0 });
      renderList();
    } catch (err) {
      if (myGen !== gen) return;
      chromeBuilt = false; // — بدنه عوض شد؛ شِل در موفقیت بعدی از نو مونت شود
      listZone = null;
      body.replaceChildren(errorState(err, () => refresh()));
    }
  }

  /* همگام‌سازی بی‌صدای فهرست + بج پس از mutation — بدون اسکلت، ردیف افزودن و تب‌ها دست‌نخورده */
  async function syncQuiet() {
    const myGen = ++gen;
    try {
      const res = await api.get(`/api/todos?box=${box}`);
      if (myGen !== gen) return;
      items = res.data ?? [];
      syncBadge(res.badge ?? { urgent: 0, overdue: 0, attention: 0 });
      renderList();
    } catch {
      /* بی‌صدا — پچ درجای قبلاً اعمال شده؛ سرور در همگام‌سازی بعدی حاکم می‌شود */
    }
  }

  function syncBadge(badge) {
    if (box === 'inbox' && badge.attention > 0) {
      countBadge.textContent = `نیازمند توجه: ${fa(badge.attention)}`;
      countBadge.hidden = false;
    } else {
      countBadge.hidden = true;
    }
  }

  function buildChrome() {
    chromeBuilt = true;
    /* UX-ممیزی گلایهٔ ۴: ردیف ۶ کنترلیِ افزودن، همیشه بالا بود و ناحیهٔ میانی را خالی نشان می‌داد؛
       اکنون پشت دکمهٔ «کار جدید» جمع می‌شود و با باز شدن فوکوس مستقیم روی عنوان می‌رود */
    if (!quickRow) quickRow = quickAddRow();
    addToggle.classList.toggle('is-active', !quickRow.hidden);
    // — رفع باگ واقعی: tabs بدون onSelect ساخته می‌شد؛ کلیک تب TypeError می‌داد و جعبه هرگز عوض نمی‌شد
    tabApi = tabs(
      [
        { key: 'inbox', label: 'دریافتی', icon: 'check', onSelect: switchBox },
        { key: 'outbox', label: 'واگذارشدهٔ من', icon: 'edit', onSelect: switchBox }
      ],
      box
    );
    listZone = el('div', {});
    body.replaceChildren(
      el('div', { class: 'todo-quick__bar' }, addToggle),
      quickRow,
      tabApi.root,
      listZone
    );
  }

  function switchBox(key) {
    if (key === box) return;
    box = key;
    tabApi?.setActive(key);
    refresh({ silent: true }); // — تعویض جعبه: GET تازه فقط برای محلهٔ فهرست، بدون اسکلت کل کارت
  }

  function renderList() {
    if (!listZone) return;
    listZone.replaceChildren(box === 'inbox' ? inboxList(items) : outboxList(items));
  }

  /* به‌روزرسانی درجای یک آیتم از بدنهٔ پاسخ mutation — همسایه‌ها، اسکرول و فوکوس سرجایشان */
  function upsertTodoItem(t) {
    if (!t?.id) { syncQuiet(); return; }
    const i = items.findIndex((x) => x.id === t.id);
    if (i >= 0) items[i] = t;
    else items.unshift(t);
    const oldEl = listZone?.querySelector(`.todo-item[data-id="${CSS.escape(String(t.id))}"]`);
    if (!listZone || !oldEl) { syncQuiet(); return; } // در جعبهٔ فعلی نیست (مثلاً واگذاری از دریافتی) — همگام آرام
    const fresh = box === 'inbox' ? buildInboxItem(t) : buildOutboxItem(t);
    oldEl.replaceWith(fresh);
    flashNode(fresh);
  }

  let quickRow = null;
  const addToggle = el(
    'button',
    {
      class: 'btn btn--soft btn--sm',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': 'todo-quick-row',
      onclick: () => {
        if (!quickRow) quickRow = quickAddRow();
        quickRow.hidden = !quickRow.hidden;
        addToggle.setAttribute('aria-expanded', String(!quickRow.hidden));
        if (!quickRow.hidden) quickRow.querySelector('input.input')?.focus();
      }
    },
    icon('plus', 15),
    'کار جدید'
  );

  function quickAddRow() {
    const title = el('input', { class: 'input', placeholder: 'کار جدید… (شخصی یا واگذاری)', maxlength: 200, autocomplete: 'off', 'aria-label': 'عنوان کار جدید' }); /* S1-12 */
    const sel = el(
      'select',
      { class: 'select', title: 'مسئول کار', 'aria-label': 'مسئول کار' },
      el('option', { value: SELF_VALUE }, 'برای خودم'),
      (assignees ?? []).map((s) => el('option', { value: s.id }, s.fullName))
    );
    sel.value = SELF_VALUE; // — پیش‌فرض: کارِ شخصی (چک‌لیست خودم)
    const prio = el(
      'select',
      { class: 'select', 'aria-label': 'اولویت' }, /* S1-12 */
      el('option', { value: 'normal' }, 'عادی'),
      el('option', { value: 'urgent' }, 'فوری')
    );
    const due = jalaliDateInput({ value: '', allowClear: true });

    const checkToggle = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: toggleChecklist }, icon('plus', 14), 'چک‌لیست');
    const checkArea = el('textarea', {
      class: 'input todo-quick__checklist',
      rows: 3,
      placeholder: 'هر خط یک مورد:\nتماس با مدرسه\nآماده‌سازی گزارش',
      hidden: true
    });

    function toggleChecklist() {
      checkArea.hidden = !checkArea.hidden;
      if (!checkArea.hidden) checkArea.focus();
    }

    async function submit() {
      const t = title.value.trim();
      if (t.length < 2) {
        toast('عنوان کار حداقل ۲ نویسه است', 'warning');
        title.focus();
        return;
      }
      if (!sel.value) {
        toast('مسئول کار را انتخاب کنید', 'warning');
        return;
      }
      const checklist = checkArea.hidden
        ? undefined
        : checkArea.value.split('\n').map((l) => l.trim()).filter(Boolean);
      if (checklist && checklist.length > CHECKLIST_MAX) {
        toast(`چک‌لیست بیش از ${fa(CHECKLIST_MAX)} مورد ندارد`, 'warning');
        return;
      }
      try {
        const res = await api.post('/api/todos', {
          title: t,
          assignee_id: sel.value === SELF_VALUE ? session.user.staffId : sel.value,
          priority: prio.value,
          due_at: due.hiddenInput.value || null,
          ...(checklist && checklist.length > 0 ? { checklist } : {})
        });
        toast(sel.value === SELF_VALUE ? 'کار شخصی ثبت شد' : 'کار ثبت و واگذار شد', 'success');
        title.value = '';
        prio.value = 'normal';
        due.setYmd('', true);
        checkArea.value = '';
        checkArea.hidden = true;
        window.dispatchEvent(new Event('todos:changed'));
        quickRow.hidden = true; /* UX-ممیزی: پس از ثبت، ردیف افزودن دوباره جمع می‌شود */
        addToggle.setAttribute('aria-expanded', 'false');
        addToggle.classList.remove('is-active');
        /* ۱.۲۱.۰: پرش اجباری به تب «واگذارشده‌ها» حذف شد — کاربر روی همین تب می‌ماند؛
           کار تازه اگر متعلق به جعبهٔ فعلی باشد همان‌جا با فلش ظاهر می‌شود */
        await syncQuiet();
        flashNode(listZone?.querySelector(`.todo-item[data-id="${CSS.escape(String(res.data?.id ?? ''))}"]`));
      } catch (err) {
        toastError(err);
      }
    }
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    return el(
      'div',
      { class: 'todo-quick', id: 'todo-quick-row', hidden: true },
      title,
      sel,
      prio,
      due.root,
      checkToggle,
      el('button', { class: 'btn btn--primary btn--sm', onclick: submit }, icon('plus', 16), 'افزودن'),
      checkArea
    );
  }

  async function toggleItem(t, index, done, scopeEl, listEl) {
    try {
      const res = await api.post(`/api/todos/${t.id}/checklist`, { index, done });
      t.checklist = res.data.checklist;
      const fresh = progressBadge(t);
      const old = scopeEl?.querySelector('.todo-progress');
      if (old && fresh) old.replaceWith(fresh);
      if (listEl) {
        const freshList = checklistBlock(t);
        listEl.replaceWith(freshList);
      }
      window.dispatchEvent(new Event('todos:changed'));
    } catch (err) {
      toastError(err);
      refresh();
    }
  }

  async function appendItem(t, text, listEl) {
    try {
      const res = await api.post(`/api/todos/${t.id}/checklist`, { text });
      t.checklist = res.data.checklist;
      redrawChecklist(t, listEl);
      window.dispatchEvent(new Event('todos:changed'));
    } catch (err) {
      toastError(err);
    }
  }

  function redrawChecklist(t, listEl) {
    const fresh = checklistBlock(t);
    listEl.replaceWith(fresh);
  }

  function checklistBlock(t) {
    if (!t.checklist || t.checklist.length === 0) return null;
    const isDoneTask = t.status === 'done';
    const listEl = el('div', { class: 'todo-checklist' });
    t.checklist.forEach((item, idx) => {
      const cb = el('input', {
        type: 'checkbox',
        class: 'todo-check todo-checklist__check',
        checked: item.done,
        disabled: isDoneTask,
        title: item.done ? 'انجام شده' : 'انجام مورد'
      });
      if (!isDoneTask) {
        cb.addEventListener('change', () =>
          toggleItem(
            t,
            idx,
            cb.checked,
            cb.closest('.todo-main') ?? cb.closest('.todo-item') ?? null,
            cb.closest('.todo-checklist')
          )
        );
      }
      listEl.appendChild(
        el('div', { class: `todo-checklist__item${item.done ? ' is-done' : ''}` }, cb, el('span', {}, item.text))
      );
    });

    if (!isDoneTask) {
      const input = el('input', { class: 'input todo-checklist__add', placeholder: 'مورد جدید…', maxlength: 200 });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const text = input.value.trim();
          if (!text) return;
          appendItem(t, text, listEl);
        }
      });
      listEl.appendChild(el('div', { class: 'todo-checklist__item todo-checklist__item--add' }, icon('plus', 14), input));
    }
    return listEl;
  }

  function inboxList(list) {
    if (list.length === 0) {
      return emptyState({
        iconName: 'check',
        title: 'کاری روی میز شما نیست',
        hint: 'کار شخصی بسازید یا از ردیف بالای کارت، کاری به خودتان یا همکار واگذار کنید.'
      });
    }
    return el('div', { class: 'todo-list' }, list.map((t) => buildInboxItem(t)));
  }

  /* سازندهٔ تک‌آیتم (۱.۲۱.۰) — شناسه‌دار برای پچ درجای upsertTodoItem */
  function buildInboxItem(t) {
    const meta = [];
    if (t.priority === 'urgent') meta.push(el('span', { class: 'badge badge--error' }, 'فوری'));
    if (t.dueAt) {
      meta.push(el('span', { class: `badge ${isOverdue(t) ? 'badge--error' : 'badge--neutral'}` }, dueLabel(t)));
    }
    meta.push(progressBadge(t));
    if (t.note) meta.push(el('span', { class: 'todo-note', title: t.note }, t.note));
    meta.push(
      isPersonal(t)
        ? el('span', { class: 'badge badge--neutral' }, 'شخصی')
        : el('span', { class: 'todo-by' }, `ثبت‌کننده: ${t.assignerName ?? '—'}`)
    );
    const checkEl = el('div', { class: 'todo-checklist-zone' }, checklistBlock(t));
    return el(
      'div',
      { class: `todo-item${isOverdue(t) ? ' is-overdue' : ''}${t.status === 'done' ? ' is-done' : ''}`, dataset: { id: String(t.id) } },
      t.status === 'done'
        ? el('input', { type: 'checkbox', class: 'todo-check', checked: true, disabled: true, title: 'انجام شده' })
        : el('input', { type: 'checkbox', class: 'todo-check', title: 'انجام شد', onchange: (e) => lockBtn(e.target, () => completeTodo(t, e.target)) }),
      el(
        'div',
        { class: 'todo-main' },
        el('div', { class: 'todo-item__title' }, t.title),
        el('div', { class: 'todo-item__meta' }, meta),
        checkEl
      )
    );
  }

  function outboxList(list) {
    if (list.length === 0) {
      return emptyState({
        iconName: 'edit',
        title: 'کاری واگذار نکرده‌اید',
        hint: 'از ردیف «کار جدید» بالای همین کارت، برای خودتان (شخصی) یا همکار مقابل ثبت کنید.'
      });
    }
    return el('div', { class: 'todo-list' }, list.map((t) => buildOutboxItem(t)));
  }

  function buildOutboxItem(t) {
    return el(
      'div',
      { class: `todo-item${t.status === 'done' ? ' is-done' : ''}`, dataset: { id: String(t.id) } },
      el(
        'div',
        { class: 'todo-main' },
        el('div', { class: 'todo-item__title' }, t.title),
        el(
          'div',
          { class: 'todo-item__meta' },
          t.priority === 'urgent' ? el('span', { class: 'badge badge--error' }, 'فوری') : null,
          el('span', { class: `badge ${t.status === 'done' ? 'badge--success' : 'badge--neutral'}` }, t.status === 'done' ? 'انجام شد' : 'در انتظار'),
          progressBadge(t),
          isPersonal(t) ? el('span', { class: 'badge badge--neutral' }, 'شخصی') : el('span', { class: 'todo-by' }, `مسئول: ${t.assigneeName ?? '—'}`),
          t.dueAt ? el('span', {}, dueLabel(t)) : null
        ),
        el('div', { class: 'todo-checklist-zone' }, checklistBlock(t))
      ),
      el(
        'div',
        { class: 'todo-item__actions' },
        t.status === 'pending'
          ? el('button', { class: 'btn btn--ghost btn--sm', title: 'ویرایش', onclick: () => editTodo(t) }, icon('edit', 16))
          : null,
        el('button', { class: 'btn btn--ghost btn--sm', title: 'حذف', onclick: () => deleteTodo(t) }, icon('trash', 16))
      )
    );
  }

  /* ۱.۲۱.۰: تیک انجام — آیتم درجا is-done می‌شود (پاسخ سرور)، بج توجه بی‌صدا تازه می‌شود؛
     دیگر اسکلت و rebuild کل کارت در کار نیست */
  async function completeTodo(t, cb) {
    try {
      const res = await api.post(`/api/todos/${t.id}/complete`);
      toast(`«${t.title}» انجام شد`, 'success');
      window.dispatchEvent(new Event('todos:changed'));
      upsertTodoItem(res.data ?? { ...t, status: 'done' });
      syncQuiet();
    } catch (err) {
      toastError(err);
      if (cb) cb.checked = false; // — برگرداندن تیک در خطا
    }
  }

  function editTodo(t) {
    formModal({
      title: 'ویرایش کار',
      initial: {
        title: t.title,
        note: t.note ?? '',
        priority: t.priority,
        due: t.dueAt ? tehranYmdOfIso(t.dueAt) : '',
        checklist: (t.checklist ?? []).map((i) => i.text).join('\n')
      },
      fields: [
        { name: 'title', label: 'عنوان', required: true, maxlength: 200 },
        { name: 'note', label: 'توضیح', type: 'textarea', rows: 2, maxlength: 1000 },
        {
          name: 'priority',
          label: 'اولویت',
          type: 'select',
          options: [
            { value: 'normal', label: 'عادی' },
            { value: 'urgent', label: 'فوری' }
          ]
        },
        { name: 'due', label: 'مهلت', type: 'jalali-date' },
        { name: 'checklist', label: 'چک‌لیست (هر خط یک مورد)', type: 'textarea', rows: 4, hint: 'موارد تازه انجام‌نشده اضافه می‌شوند؛ وضعیت تیک مواردِ قبلی حفظ می‌شود' }
      ],
      submitLabel: 'ذخیره',
      onSubmit: async (v) => {
        const lines = String(v.checklist ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length > CHECKLIST_MAX) throw new Error(`چک‌لیست بیش از ${fa(CHECKLIST_MAX)} مورد ندارد`);
        const prevMap = new Map((t.checklist ?? []).map((i) => [i.text, i.done]));
        const checklist = lines.map((text) => ({ text, done: prevMap.get(text) ?? false }));
        const res = await api.patch(`/api/todos/${t.id}`, {
          title: v.title,
          note: v.note ? v.note : null,
          priority: v.priority,
          due_at: v.due || null,
          checklist: checklist.length > 0 ? checklist : null
        });
        toast('تغییرات ذخیره شد', 'success');
        window.dispatchEvent(new Event('todos:changed'));
        upsertTodoItem(res.data ?? t); // — همان آیتم درجا؛ بدون rebuild فهرست
        syncQuiet();
      }
    });
  }

  async function deleteTodo(t) {
    const ok = await confirmModal({
      title: 'حذف کار',
      message: `«${t.title}» حذف شود؟ این کار از فهرست هر دو نفر محو می‌شود.`,
      confirmLabel: 'حذف',
      danger: true
    });
    if (!ok) return;
    try {
      await api.patch(`/api/todos/${t.id}`, { deleted: true });
      toast('کار حذف شد', 'success');
      window.dispatchEvent(new Event('todos:changed'));
      items = items.filter((x) => x.id !== t.id);
      const row = listZone?.querySelector(`.todo-item[data-id="${CSS.escape(String(t.id))}"]`);
      if (row) collapseRemove(row); // — جمع‌شدن نرم همان آیتم
      setTimeout(() => {
        if (listZone?.isConnected && !listZone.querySelector('.todo-item')) renderList(); // حالت خالی بدون قطع انیمیشن
      }, 300);
      setTimeout(syncQuiet, 300); // بج توجه پس از پایان انیمیشن تازه می‌شود
    } catch (err) {
      toastError(err);
    }
  }

  refresh();
  return card;
}
