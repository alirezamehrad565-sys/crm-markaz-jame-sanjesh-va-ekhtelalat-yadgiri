/**
 * کارت «کارهای من» داشبورد
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// my-todos.js — فاز ۴: کارت «کارهای من» روی داشبورد (هماهنگی داخلی منشی↔مدیر §9)
// دو صندوق با tabs موجود: دریافتی (inbox) / واگذارشدهٔ من (outbox)
// - افزودن سریع inline (عنوان + گیرنده + اولویت + مهلت جلالی اختیاری)
// - — کارِ شخصی: گیرنده = «برای خودم»؛ چک‌لیست موارد دلخواه با تیک و افزودن فوری
// - تکمیل با checkbox (فقط مسئول) · ویرایش inline با formModal (فقط ثبت‌کننده) · حذف نرم
// - بعد از هر تغییر رویداد «todos:changed» پخش می‌شود تا badge منو در app.js تازه شود

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
  errorState
} from './ui.js';
import { fa, formatJalaliNumeric, tehranYmdOfIso } from './format.js';
import { jalaliDateInput } from './jalali-picker.js';
import { session } from './state.js';

/** کارت فقط برای جفت secretary↔manager — §9 (درمانگر اصلاً این ماژول را نمی‌بیند) */
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

/** — کارِ شخصی: ثبت‌کننده و مسئول یک نفرند */
function isPersonal(t) {
  return t.assignerId && t.assigneeId && t.assignerId === t.assigneeId;
}

/** — نشان پیشرفت چک‌لیست «۲/۵» یا null */
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
    // m145 — ریتم فاصلهٔ یکنواخت داشبورد: کارت بدون حاشیهٔ پایین به کارت قبلی می‌چسبید (0px seam)
    { class: 'card todos-card', style: { marginBottom: 'var(--sp-4)' } },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('check', 18), 'کارهای من'), countBadge),
    body
  );

  let box = 'inbox';
  let assignees = null; // کش سبک — کارکنان privileged غیر از خودم

  async function refresh() {
    body.replaceChildren(skeletonState('list', 5));
    try {
      const [todosRes, staffRes] = await Promise.all([
        api.get(`/api/todos?box=${box}`),
        assignees ? Promise.resolve(null) : api.get('/api/staff?active=true')
      ]);
      if (staffRes) {
        assignees = staffRes.data.filter(
          (s) => (s.role === 'manager' || s.role === 'secretary') && s.id !== session.user?.staffId
        );
      }
      draw(todosRes.data ?? [], todosRes.badge ?? { urgent: 0, overdue: 0, attention: 0 });
    } catch (err) {
      body.replaceChildren(errorState(err, refresh));
    }
  }

  function draw(items, badge) {
    if (box === 'inbox' && badge.attention > 0) {
      countBadge.textContent = `نیازمند توجه: ${fa(badge.attention)}`;
      countBadge.hidden = false;
    } else {
      countBadge.hidden = true;
    }

    const tb = tabs(
      [
        { key: 'inbox', label: 'دریافتی', icon: 'check' },
        { key: 'outbox', label: 'واگذارشدهٔ من', icon: 'edit' }
      ],
      box
    );

    body.replaceChildren(
      quickAddRow(),
      tb.root,
      box === 'inbox' ? inboxList(items) : outboxList(items)
    );
  }

  // ─────────────── افزودن سریع ───────────────

  function quickAddRow() {
    const title = el('input', { class: 'input', placeholder: 'کار جدید… (شخصی یا واگذاری)', maxlength: 200, autocomplete: 'off' });
    const sel = el(
      'select',
      { class: 'select', title: 'مسئول کار' },
      el('option', { value: SELF_VALUE }, 'برای خودم'),
      (assignees ?? []).map((s) => el('option', { value: s.id }, s.fullName))
    );
    sel.value = SELF_VALUE; // — پیش‌فرض: کارِ شخصی (چک‌لیست خودم)
    const prio = el(
      'select',
      { class: 'select' },
      el('option', { value: 'normal' }, 'عادی'),
      el('option', { value: 'urgent' }, 'فوری')
    );
    const due = jalaliDateInput({ value: '', allowClear: true });

    // ردیف بازشوی چک‌لیست (هر خط یک مورد)
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
        await api.post('/api/todos', {
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
        box = 'outbox';
        refresh();
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
      { class: 'todo-quick' },
      title,
      sel,
      prio,
      due.root,
      checkToggle,
      el('button', { class: 'btn btn--primary btn--sm', onclick: submit }, icon('plus', 16), 'افزودن'),
      checkArea
    );
  }

  // ─────────────── چک‌لیست هر کار ───────────────

  /** تیک یک مورد */
  async function toggleItem(t, index, done, scopeEl, listEl) {
    try {
      const res = await api.post(`/api/todos/${t.id}/checklist`, { index, done });
      t.checklist = res.data.checklist;
      const fresh = progressBadge(t);
      const old = scopeEl?.querySelector('.todo-progress');
      if (old && fresh) old.replaceWith(fresh);
      // بازترسیم بلوک چک‌لیست برای خط‌خوردگی بصری مورد
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

  /** افزودن مورد از داخل کارت */
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

  /** بازترسیم بلوک چک‌لیست بعد از افزودن مورد */
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

    // افزودن مورد — برای کارِ باز که من در آن دخالتم (مسئول یا ثبت‌کننده)
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

  // ─────────────── صندوق دریافتی ───────────────

  function inboxList(items) {
    if (items.length === 0) {
      return emptyState({
        iconName: 'check',
        title: 'کاری روی میز شما نیست',
        hint: 'کار شخصی بسازید یا از ردیف بالای کارت، کاری به خودتان یا همکار واگذار کنید.'
      });
    }
    return el(
      'div',
      { class: 'todo-list' },
      items.map((t) => {
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
          { class: `todo-item${isOverdue(t) ? ' is-overdue' : ''}${t.status === 'done' ? ' is-done' : ''}` },
          t.status === 'done'
            ? el('input', { type: 'checkbox', class: 'todo-check', checked: true, disabled: true, title: 'انجام شده' })
            : el('input', { type: 'checkbox', class: 'todo-check', title: 'انجام شد', onchange: () => completeTodo(t) }),
          el(
            'div',
            { class: 'todo-main' },
            el('div', { class: 'todo-item__title' }, t.title),
            el('div', { class: 'todo-item__meta' }, meta),
            checkEl
          )
        );
      })
    );
  }

  // ─────────────── صندوق واگذارشده ───────────────

  function outboxList(items) {
    if (items.length === 0) {
      return emptyState({
        iconName: 'edit',
        title: 'کاری واگذار نکرده‌اید',
        hint: 'از ردیف «کار جدید» بالای همین کارت، برای خودتان (شخصی) یا همکار مقابل ثبت کنید.'
      });
    }
    return el(
      'div',
      { class: 'todo-list' },
      items.map((t) =>
        el(
          'div',
          { class: `todo-item${t.status === 'done' ? ' is-done' : ''}` },
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
        )
      )
    );
  }

  // ─────────────── اکشن‌ها ───────────────

  async function completeTodo(t) {
    try {
      await api.post(`/api/todos/${t.id}/complete`);
      toast(`«${t.title}» انجام شد`, 'success');
      window.dispatchEvent(new Event('todos:changed'));
    } catch (err) {
      toastError(err);
    }
    refresh();
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
        // تشخیص حفظ وضعیت تیک: موردِ هم‌متن، done قبلی‌اش می‌ماند
        const lines = String(v.checklist ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length > CHECKLIST_MAX) throw new Error(`چک‌لیست بیش از ${fa(CHECKLIST_MAX)} مورد ندارد`);
        const prevMap = new Map((t.checklist ?? []).map((i) => [i.text, i.done]));
        const checklist = lines.map((text) => ({ text, done: prevMap.get(text) ?? false }));
        await api.patch(`/api/todos/${t.id}`, {
          title: v.title,
          note: v.note ? v.note : null,
          priority: v.priority,
          due_at: v.due || null,
          checklist: checklist.length > 0 ? checklist : null
        });
        toast('تغییرات ذخیره شد', 'success');
        window.dispatchEvent(new Event('todos:changed'));
        refresh();
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
    } catch (err) {
      toastError(err);
    }
    refresh();
  }

  refresh();
  return card;
}
