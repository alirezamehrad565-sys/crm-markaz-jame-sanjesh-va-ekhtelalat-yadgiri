/**
 * انتخابگر تمرین از بانک تمرین
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// exercise-pick.js — انتخابگر تمرین از بانک تمرین برای پیوست جلسه‌ها
// (خواست کاربر: «امکان اضافه کردن تمرین از بانک تمرین رو به جلسه ها اضافه کن»)
// کاربرد: قالب‌ساز (views/templates.js) + افزودن/ویرایش جلسهٔ برنامهٔ جلسه به جلسه
// (clinical-insights.js — از طریق قابلیت extra در formModal).
// پیوند تمرین به جلسه متنی است (شِمای سرور: type + text) — عنوان تمرین انتخابی
// به کادر «تمرین» آن جلسه اضافه می‌شود؛ سقف ۵۰۰ نویسهٔ آیتم رعایت می‌شود.

import { api } from './api.js';
import { el, icon, toast, toastError, openModal, skeletonState, emptyState } from './ui.js';
import { fa } from './format.js';
import { hueDot } from './staff-hue.js'; // — چیپ رنگی سازندهٔ تمرین (m136)

const PAGE_SIZE = 50; // با جستجو + چیپ دسته کافی است — مرور کامل در تب «بانک تمرین»
const ITEM_TEXT_MAX = 500; // PATHWAY_SESSION_ITEM_TEXT_MAX سمت سرور

/** افزودن عنوان تمرین به کادر متنی آیتم جلسه — جداکنندهٔ «؛ » و سقف ۵۰۰ نویسه */
export function appendExerciseToTextarea(ta, title) {
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

/** دکمهٔ کوچک «از بانک تمرین» — در ردیف برچسب فیلد تمرین قرار می‌گیرد */
export function bankPickButton({ onPick }) {
  return el('button', {
    class: 'btn btn--ghost btn--sm expick-open',
    type: 'button',
    title: 'افزودن تمرین از بانک تمرین',
    onclick: () => openExercisePicker({ onPick })
  }, icon('download', 13), 'از بانک تمرین');
}

/**
 * مودال انتخابگر تمرین — جستجو + چیپ دستهٔ اختلال/پایه + فهرست تمرین‌ها.
 * onPick(ex) با تمرین انتخابی صدا و مودال بسته می‌شود.
 */
export function openExercisePicker({ onPick } = {}) {
  const state = { q: '', tagIds: [] };
  let tags = { disorder: [], grade: [] };
  let seq = 0; // پاسخ‌های کهنهٔ جستجو نادیده گرفته شوند
  // نگاشت سازنده برای چیپ رنگی — با فهرست تمرین‌ها موازی می‌آید؛ خطا بی‌صدا
  let staffNames = new Map();
  const staffReady = (async () => {
    try {
      const res = await api.get('/api/staff');
      const items = Array.isArray(res.data) ? res.data : res.data?.items ?? [];
      staffNames = new Map(items.map((s) => [s.id, s.fullName]));
    } catch { /* چیپ سازنده نمایش داده نمی‌شود */ }
  })();

  const listBox = el('div', { class: 'expick-list' });
  const foot = el('div', { class: 'cell-sub expick-foot' });

  function chipsRow(kind) {
    const list = tags[kind] ?? [];
    if (!list.length) return null;
    return el('div', { class: 'expick-chips', dataset: { kind } },
      list.map((t) => {
        const on = state.tagIds.includes(t.id);
        return el('button', {
          class: `chip${on ? ' is-active' : ''}`,
          type: 'button',
          onclick: (e) => {
            const idx = state.tagIds.indexOf(t.id);
            if (idx >= 0) state.tagIds.splice(idx, 1);
            else state.tagIds.push(t.id);
            const row = e.currentTarget.parentElement;
            row.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
            if (state.tagIds.includes(t.id)) e.currentTarget.classList.add('is-active');
            load();
          }
        }, t.name);
      })
    );
  }

  function row(ex) {
    const fileCount = Array.isArray(ex.files) ? ex.files.length : 0;
    const ownerName = ex.createdBy ? staffNames.get(ex.createdBy) : null;
    return el('div', { class: 'expick-row' },
      el('div', { class: 'expick-row__main' },
        el('b', { class: 'expick-row__title' }, ex.title),
        el('div', { class: 'expick-row__meta' },
          ownerName ? el('span', { class: 'staff-chip exb-owner expick-owner' }, hueDot(ex.createdBy, 9), ownerName) : null,
          ex.visibility === 'private' ? el('span', { class: 'badge badge--warning' }, 'خصوصی') : null,
          ex.teamCreated ? el('span', { class: 'badge badge--neutral' }, 'تیمی') : null,
          fileCount ? el('span', { class: 'cell-sub' }, `${fa(fileCount)} فایل`) : null,
          ex.externalUrl ? el('span', { class: 'cell-sub' }, 'بازی آنلاین') : null,
          (ex.tags ?? []).slice(0, 3).map((t) => el('span', { class: 'badge badge--neutral' }, t.name)))),
      el('button', {
        class: 'btn btn--soft btn--sm', type: 'button',
        onclick: () => { onPick?.(ex); close(); }
      }, icon('plus', 13), 'افزودن')
    );
  }

  async function load() {
    const mySeq = ++seq;
    await staffReady; // چیپ سازنده بدون رقابت با فهرست
    listBox.replaceChildren(skeletonState('list', 5));
    try {
      const qs = new URLSearchParams({ page: '1', page_size: String(PAGE_SIZE) });
      if (state.tagIds.length) qs.set('tag_ids', state.tagIds.join(','));
      if (state.q) qs.set('q', state.q);
      const res = await api.get(`/api/exercises?${qs.toString()}`);
      if (mySeq !== seq) return; // پاسخ کهنه
      const items = res.data?.items ?? [];
      const total = res.data?.total ?? 0;
      if (!items.length) {
        listBox.replaceChildren(emptyState({
          iconName: 'search',
          title: 'تمرینی پیدا نشد',
          hint: state.q || state.tagIds.length ? 'جستجو یا دسته‌ها را تغییر دهید.' : 'بانک تمرین خالی است — اول از تب «بانک تمرین» تمرین ثبت کنید.'
        }));
      } else {
        listBox.replaceChildren(...items.map(row));
      }
      foot.textContent = total > items.length
        ? `${fa(items.length)} از ${fa(total)} تمرین — بقیه را با جستجو یا دسته‌ها پیدا کنید.`
        : total > 0 ? `${fa(total)} تمرین` : '';
    } catch (err) {
      if (mySeq !== seq) return;
      listBox.replaceChildren(emptyState({
        iconName: 'alert',
        title: 'بارگذاری بانک تمرین ناموفق بود',
        hint: err?.message ?? '',
        actionLabel: 'تلاش مجدد',
        onAction: load
      }));
    }
  }

  // نکته: از.exb-search استفاده نمی‌کنیم — flex:1 1 220px آن در بدنهٔ ستونی مودال،
  // ورودی جستجو را غول‌پیکر می‌کند (در مرورگر دیده شد) —.input ساده کافی است
  const search = el('input', { class: 'input', placeholder: 'جستجوی عنوان یا توضیح تمرین…' });
  let debounce = null;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = search.value.trim(); load(); }, 300);
  });

  const chipsWrap = el('div', { class: 'expick-chipswrap', hidden: true });

  const { close } = openModal({
    title: 'افزودن تمرین از بانک تمرین',
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      search,
      chipsWrap,
      listBox,
      foot)
  });

  // متا (دستهٔ اختلال + پایه) — بی‌صدا؛ اگر نیامد فقط جستجو کار می‌کند
  (async () => {
    try {
      const res = await api.get('/api/exercises/meta');
      tags = res.data?.categories ?? tags;
    } catch { /* برچسب خالی — جستجو کار می‌کند */ }
    const disorderRow = chipsRow('disorder');
    const gradeRow = chipsRow('grade');
    if (!disorderRow && !gradeRow) return;
    chipsWrap.replaceChildren(disorderRow ?? el('span'), gradeRow ?? el('span'));
    chipsWrap.hidden = false;
  })();

  load();
}
