/**
 * انتخابگر رویداد (فرم/پرسش‌نامه) از رویدادساز
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// event-pick.js — انتخابگر «رویداد» (فرم/پرسش‌نامه) از رویدادساز برای پیوست جلسه‌ها
// (خواست کاربر: «دکمه افزودن رویداد هم باید توی قالب باشه» — توضیح کاربر:
// «منظورم از دکمه افزودن رویداد همون افزودن فرم و پرسش‌نامه به قالب جلسات مداخله است»)
// کاربرد: قالب‌ساز (views/templates.js) + افزودن/ویرایش جلسهٔ برنامهٔ جلسه به جلسه
// (clinical-insights.js — از طریق قابلیت extra در مودال فرم‌ساز عمومی).
// پیوند رویداد به جلسه متنی است (شِمای سرور: type + text — type تازهٔ 'event') —
// عنوان فرم/پرسش‌نامهٔ انتخابی از رویدادساز به کادر «رویداد (فرم/پرسش‌نامه)» آن جلسه
// اضافه می‌شود؛ سقف ۵۰۰ نویسهٔ آیتم رعایت می‌شود.

import { api } from './api.js';
import { el, icon, toast, openModal, emptyState, skeletonState } from './ui.js';
import { fa } from './format.js';
import { typeIconNode } from './case-event-icons.js';

const ITEM_TEXT_MAX = 500; // PATHWAY_SESSION_ITEM_TEXT_MAX سمت سرور

const CATEGORY_LABELS = { session: 'جلسه', checklist: 'چک‌لیست', note: 'یادداشت' };
const AUDIENCE_LABELS = { family: 'خانواده', teacher: 'معلم کلاس', both: 'خانواده و معلم' };
const CATEGORY_KEYS = ['session', 'checklist', 'note'];

/** افزودن عنوان فرم/پرسش‌نامه به کادر متنی آیتم جلسه — جداکنندهٔ «؛ » و سقف ۵۰۰ نویسه */
export function appendEventToTextarea(ta, title) {
  if (!ta || !title) return;
  const prev = ta.value.trim();
  const sep = !prev ? '' : /[؛;،,.]\s*$/.test(prev) ? ' ' : '؛ ';
  let next = `${prev}${sep}${title}`;
  if (next.length > ITEM_TEXT_MAX) {
    next = `${next.slice(0, ITEM_TEXT_MAX - 1)}…`;
    toast('متن آیتم به سقف ۵۰۰ نویسه رسید — انتهای آن کوتاه شد', 'warning');
  }
  ta.value = next;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** دکمهٔ کوچک «افزودن رویداد» — در ردیف برچسب فیلد فرم/پرسش‌نامهٔ جلسه قرار می‌گیرد */
export function eventPickButton({ onPick }) {
  return el('button', {
    class: 'btn btn--ghost btn--sm expick-open',
    type: 'button',
    title: 'افزودن فرم/پرسش‌نامه از رویدادساز',
    onclick: () => openEventPicker({ onPick })
  }, icon('puzzle', 13), 'افزودن رویداد');
}

/**
 * مودال انتخابگر رویداد (فرم/پرسش‌نامه) — جستجو + چیپ دسته + فهرست انواع فعال رویدادساز.
 * onPick(t) با نوع انتخابی صدا و مودال بسته می‌شود.
 */
export function openEventPicker({ onPick } = {}) {
  const state = { q: '', cat: 'all' };
  let types = null; // null = در حال بارگذاری

  const listBox = el('div', { class: 'expick-list' });
  const foot = el('div', { class: 'cell-sub expick-foot' });

  function chipsRow() {
    return el('div', { class: 'expick-chips' },
      el('button', { class: `chip${state.cat === 'all' ? ' is-active' : ''}`, type: 'button',
        onclick: (e) => { state.cat = 'all'; markChip(e); renderList(); } }, 'همه'),
      ...CATEGORY_KEYS.map((k) => el('button', {
        class: `chip${state.cat === k ? ' is-active' : ''}`, type: 'button',
        onclick: (e) => { state.cat = k; markChip(e); renderList(); }
      }, CATEGORY_LABELS[k]))
    );
  }
  function markChip(e) {
    e.currentTarget.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
    e.currentTarget.classList.add('is-active');
  }

  function row(t) {
    return el('div', { class: 'expick-row' },
      el('div', { class: 'expick-row__main' },
        el('b', { class: 'expick-row__title', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          typeIconNode(t.category, t.icon, 15), t.title),
        el('div', { class: 'expick-row__meta' },
          el('span', { class: 'badge badge--neutral' }, CATEGORY_LABELS[t.category] ?? t.category),
          t.audience && t.category === 'checklist' ? el('span', { class: 'cell-sub' }, AUDIENCE_LABELS[t.audience] ?? '') : null)),
      el('button', {
        class: 'btn btn--soft btn--sm', type: 'button',
        onclick: () => { onPick?.(t); close(); }
      }, icon('plus', 13), 'افزودن')
    );
  }

  function renderList() {
    if (types === null) { listBox.replaceChildren(skeletonState('list', 4)); return; } // در حال بارگذاری
    const all = types;
    const q = state.q;
    const list = all
      .filter((t) => (state.cat === 'all' ? true : t.category === state.cat))
      .filter((t) => !q || (t.title ?? '').includes(q) || (t.key ?? '').includes(q));
    if (!all.length) {
      listBox.replaceChildren(emptyState({
        iconName: 'clipboard',
        title: 'هنوز فرم/پرسش‌نامه‌ای ساخته نشده',
        hint: 'از تب «رویدادساز» فرم یا پرسش‌نامه بسازید — بعد اینجا به جلسه پیوست می‌شود.'
      }));
    } else if (!list.length) {
      listBox.replaceChildren(emptyState({
        iconName: 'search',
        title: 'چیزی پیدا نشد',
        hint: 'جستجو یا دسته را تغییر دهید.'
      }));
    } else {
      listBox.replaceChildren(...list.map(row));
    }
    foot.textContent = all.length
      ? (list.length === all.length ? `${fa(all.length)} فرم/پرسش‌نامهٔ فعال` : `${fa(list.length)} از ${fa(all.length)} فرم/پرسش‌نامهٔ فعال`)
      : '';
  }

  async function load() {
    try {
      const res = await api.get('/api/case-events/types?active=true');
      types = res.data ?? [];
    } catch {
      types = [];
    }
    renderList();
  }

  // نکته: از.exb-search استفاده نمی‌کنیم —.input ساده در بدنهٔ ستونی مودال امن است
  const search = el('input', { class: 'input', placeholder: 'جستجوی عنوان فرم یا پرسش‌نامه…' });
  search.addEventListener('input', () => { state.q = search.value.trim(); renderList(); });

  const { close } = openModal({
    title: 'افزودن رویداد — فرم و پرسش‌نامه',
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      search,
      chipsRow(),
      listBox,
      foot)
  });

  renderList(); // حالت خالی/بارگذاری فوری
  load();
}
