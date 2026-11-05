// ویرایشگر کارت جلسهٔ طرح درمان (مشترک: نمای «طرح درمان» + پنل جلسات پرونده)
// منابع کارت: کارت‌های آماده (کارتِ پیوسته با linkId — ریبرند )، کارت‌های قبلی تیم، کارت آزاد، رویدادساز
import { api } from './api.js';
import { el, icon, toast, toastError, openModal, emptyState, skeletonState } from './ui.js';
import { fa } from './format.js';
import { openExercisePicker } from './exercise-pick.js';
import { openEventPicker } from './event-pick.js';
import { SESSION_ITEM_TYPES, SESSION_ITEM_LABELS } from './clinical-content.js';

// نگاشت فرمت رکورد کتابخانه → نوع کارت جلسه (کارت‌های آماده = کتابخانهٔ کارت — )
const FORMAT_TO_CARD = { worksheet: 'exercise', homework: 'homework', game: 'game', instruction: 'instruction', family: 'family' };

export function cardTypeBadgeClass(type) {
  return `path-session__item--${type}`;
}

function typeSelect(value, { onchange }) {
  const sel = el('select', { class: 'select plan-cardrow__type', title: 'نوع کارت', 'aria-label': 'نوع کارت' }, /* S6-27 */
    ...SESSION_ITEM_TYPES.map((t) => el('option', { value: t.key }, t.label)));
  sel.value = value;
  sel.addEventListener('change', () => onchange(sel.value));
  return sel;
}

// ─── ویرایشگر فهرست کارت‌های یک جلسه ───
// showDone: تیک «انجام شد» فقط برای جلسهٔ دانش‌آموز معنا دارد؛ در طرحِ کتابخانه‌ای همیشه false می‌ماند
export function cardListEditor({ items = [], showDone = false, canEdit = true } = {}) {
  const state = (items ?? []).map((it) => ({
    type: it.type ?? 'instruction',
    text: it.text ?? '',
    done: it.done === true,
    linkId: it.linkId ?? null
  }));

  const rowsBox = el('div', { class: 'plan-cards' });
  let dragIndex = null;

  function render() {
    rowsBox.replaceChildren();
    state.forEach((card, i) => {
      const textInput = el('input', { class: 'input plan-cardrow__text', placeholder: 'متن کارت…', 'aria-label': `متن کارت ${fa(i + 1)}` }); /* S6-27 */
      textInput.value = card.text;
      textInput.addEventListener('input', () => { state[i].text = textInput.value; });
      textInput.disabled = !canEdit;

      const typeSel = typeSelect(card.type, {
        onchange: (v) => { state[i].type = v; if (v !== 'event') return; }
      });
      typeSel.disabled = !canEdit;

      const linkChip = card.linkId
        ? el('span', { class: 'plan-chip-link', title: 'پیوسته به کارت آماده در کتابخانه' }, icon('link', 11), 'آماده')
        : null;

      const doneBox = showDone
        ? el('label', { class: 'plan-cardrow__done', title: 'انجام شد' },
            el('input', { type: 'checkbox' }), el('span', {}, 'انجام'))
        : null;
      if (doneBox) {
        const cb = doneBox.querySelector('input');
        cb.checked = card.done;
        cb.addEventListener('change', () => { state[i].done = cb.checked; });
      }

      const grip = canEdit && state.length > 1
        ? el('span', { class: 'plan-cardrow__grip', title: 'جابه‌جایی کارت' }, icon('grip', 13))
        : null;

      const row = el('div', { class: `plan-cardrow${card.done && showDone ? ' is-done' : ''}` },
        grip,
        typeSel,
        textInput,
        linkChip,
        doneBox,
        canEdit
          ? el('button', { class: 'btn btn--ghost btn--sm plan-cardrow__del', type: 'button', title: 'حذف کارت',
              onclick: () => { state.splice(i, 1); render(); } }, icon('trash', 12))
          : null
      );
      if (grip) {
        row.draggable = true;
        row.addEventListener('dragstart', (e) => {
          dragIndex = i;
          row.classList.add('is-dragging');
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* اجباری نیست */ }
        });
        row.addEventListener('dragend', () => { row.classList.remove('is-dragging'); });
        row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('is-over'); });
        row.addEventListener('dragleave', () => row.classList.remove('is-over'));
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('is-over');
          if (dragIndex === null || dragIndex === i) return;
          const [moved] = state.splice(dragIndex, 1);
          state.splice(i, 0, moved);
          dragIndex = null;
          render();
        });
      }
      rowsBox.appendChild(row);
    });

    if (!state.length) {
      rowsBox.appendChild(el('div', { class: 'cell-sub plan-cards__empty' },
        'کارت نیست — از دکمه‌های زیر اضافه کنید؛ «کارت آماده» کارت را به رکورد کتابخانه پیوند می‌زند.'));
    }
  }

  function addCard(card) {
    if (state.length >= 10) { toast('حداکثر ۱۰ کارت برای هر جلسه'); return; }
    state.push({ type: card.type ?? 'instruction', text: card.text ?? '', done: false, linkId: card.linkId ?? null });
    render();
  }

  const addFreeBtn = el('button', { class: 'btn btn--soft btn--sm', type: 'button', disabled: !canEdit,
    onclick: () => addCard({ type: 'instruction', text: '' }) }, icon('plus', 12), 'کارت آزاد');
  const addBankBtn = el('button', { class: 'btn btn--soft btn--sm', type: 'button', disabled: !canEdit,
    title: 'از کتابخانهٔ کارت‌های آماده — کارت پیوسته می‌سازد',
    onclick: () => openExercisePicker({ onPick: (ex) => addCard({
      type: FORMAT_TO_CARD[ex.format] ?? 'exercise',
      text: ex.title,
      linkId: ex.id
    }) }) }, icon('download', 12), 'کارت آماده');
  const addRecentBtn = el('button', { class: 'btn btn--soft btn--sm', type: 'button', disabled: !canEdit,
    title: 'افزودن سریع از کارت‌های قبلی تیم — بدون دوباره‌نویسی',
    onclick: () => openRecentCardsPicker({ onPick: (c) => addCard({ type: c.type, text: c.text, linkId: c.linkId }) }) },
    icon('sparkles', 12), 'کارت‌های قبلی');
  const addEventBtn = el('button', { class: 'btn btn--soft btn--sm', type: 'button', disabled: !canEdit,
    onclick: () => openEventPicker({ onPick: (t) => addCard({ type: 'event', text: t.title }) }) },
    icon('clipboard', 12), 'رویداد');

  const wrap = el('div', { class: 'plan-cards-wrap' },
    rowsBox,
    canEdit
      ? el('div', { class: 'plan-cards__ops' }, addFreeBtn, addBankBtn, addRecentBtn, addEventBtn)
      : null
  );

  render();

  return {
    el: wrap,
    collect: () => state
      .map((c) => ({ type: c.type, text: c.text.trim(), done: c.done === true, linkId: c.linkId }))
      .filter((c) => c.text),
    addCard
  };
}

// ─── پیکر «کارت‌های قبلی» — کتابخانهٔ استفادهٔ مجدد تیم (حذف دوباره‌کاری) ───
export function openRecentCardsPicker({ onPick } = {}) {
  const listBox = el('div', { class: 'expick-list' });
  const search = el('input', { class: 'input', placeholder: 'جستجو در کارت‌های قبلی…' });
  let all = [];
  let q = '';

  function visible() {
    if (!q) return all;
    return all.filter((c) => c.text.includes(q) || (SESSION_ITEM_LABELS[c.type] ?? '').includes(q));
  }

  function render() {
    const items = visible();
    if (!items.length) {
      listBox.replaceChildren(emptyState({
        iconName: 'search',
        title: all.length ? 'کارتی با این عبارت پیدا نشد' : 'هنوز کارتی ثبت نشده',
        hint: all.length ? 'عبارت را تغییر دهید.' : 'با نوشتن طرح درمان، کارت‌های تیم این‌جا جمع می‌شود.'
      }));
      return;
    }
    listBox.replaceChildren(...items.map((c) => el('div', { class: 'expick-row' },
      el('div', { class: 'expick-row__main' },
        el('b', { class: 'expick-row__title' }, c.text),
        el('div', { class: 'expick-row__meta' },
          el('span', { class: `badge badge--neutral path-session__item ${cardTypeBadgeClass(c.type)}` }, SESSION_ITEM_LABELS[c.type] ?? c.type),
          c.usageCount > 1 ? el('span', { class: 'cell-sub' }, `${fa(c.usageCount)} بار استفاده`) : null,
          c.linkId ? el('span', { class: 'cell-sub' }, 'پیوسته به کتابخانه') : null)),
      el('button', { class: 'btn btn--soft btn--sm', type: 'button',
        onclick: () => { onPick?.(c); close(); } }, icon('plus', 13), 'افزودن')
    )));
  }

  search.addEventListener('input', () => { q = search.value.trim(); render(); });

  const { close } = openModal({
    title: 'کارت‌های قبلی تیم',
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, search, listBox)
  });

  listBox.replaceChildren(skeletonState('list', 5));
  api.get('/api/clinical-cards').then((res) => {
    all = res.data ?? [];
    render();
  }).catch((err) => {
    listBox.replaceChildren(emptyState({
      iconName: 'alert',
      title: 'بارگذاری کارت‌ها ناموفق بود',
      hint: err?.message ?? '',
      actionLabel: 'تلاش مجدد',
      onAction: () => openRecentCardsPicker({ onPick })
    }));
  });
}
