import { api } from './api.js';
import { el, icon, openModal } from './ui.js';

const ENTITY_META = {
  student: { label: 'دانش‌آموزان', iconName: 'student', href: (it) => `#/students/${it.id}` },
  staff: { label: 'کارکنان', iconName: 'users', href: () => '#/staff' },
  school: { label: 'مدارس', iconName: 'school', href: () => '#/schools' },
  tag: { label: 'برچسب‌ها', iconName: 'tag', href: (it) => `#/students?tag_id=${it.id}` },
  waitlist: { label: 'لیست انتظار', iconName: 'clock', href: (it) => `#/waitlist?q=${encodeURIComponent(it.title ?? '')}` }, // — ماژول مستقل
  doc: { label: 'نمون‌برگ‌ها و اسناد', iconName: 'file', href: (it) => `#/docs/${it.id}` } // مخزن اسناد خام
};

const DOC_CATEGORY_LABELS = { sanjesh: 'سنجش', ekhtelalat: 'اختلالات', hesabdari: 'حسابداری', bazdidha: 'بازدیدها', tablo_mohr_poster: 'تابلو/مُهر/پوستر', ayinnameha: 'آیین‌نامه‌ها', other: 'سایر' }; // · // 

const ROLE_LABELS = { manager: 'مدیر', therapist: 'درمانگر', secretory: 'منشی', secretary: 'منشی' };
const KIND_LABELS = { school: 'مدرسه', kindergarten: 'مهدکودک' };

let opened = false;

export function initGlobalSearch() {
  const btn = document.getElementById('global-search-btn');
  if (btn) btn.addEventListener('click', openPalette);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
      return;
    }
    if (e.key === '/' && !opened) {
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag !== 'input' && tag !== 'select' && tag !== 'textarea' && !(t && t.isContentEditable)) {
        e.preventDefault();
        openPalette();
      }
    }
  });
}

export function openPalette() {
  if (opened) return;
  opened = true;

  let debounce = null;
  let seq = 0; // پاسخ‌های کهنه نادیده گرفته می‌شوند
  let flatItems = [];
  let activeIndex = -1;

  const input = el('input', {
    class: 'input gsearch__input',
    placeholder: 'نام دانش‌آموز، همکار، مدرسه، برچسب، متقاضی یا سند…',
    autocomplete: 'off',
    spellcheck: 'false'
  });
  const results = el('div', { class: 'gsearch__results' });

  function hintRow() {
    return el('div', { class: 'gsearch__hint' },
      el('span', {}, 'حرکت با '), el('kbd', {}, '↑'), ' ', el('kbd', {}, '↓'),
      el('span', {}, 'انتخاب با '), el('kbd', {}, 'Enter'),
      el('span', {}, 'بستن با '), el('kbd', {}, 'Esc')
    );
  }

  function clearActive() {
    results.querySelectorAll('.gsearch__item.is-active').forEach((n) => n.classList.remove('is-active'));
  }

  function setActive(index) {
    const items = results.querySelectorAll('.gsearch__item');
    if (items.length === 0) return;
    activeIndex = Math.max(0, Math.min(index, items.length - 1));
    clearActive();
    const node = items[activeIndex];
    node.classList.add('is-active');
    node.scrollIntoView({ block: 'nearest' });
  }

  let closePalette = null;

  function go(item) {
    const meta = ENTITY_META[item.type];
    if (!meta) return;
    location.hash = meta.href(item);
    if (closePalette) closePalette();
  }

  function renderEmpty(text) {
    results.replaceChildren(
      el('div', { class: 'gsearch__empty' }, icon('search', 20), el('span', {}, text))
    );
  }

  function renderGroups(data) {
    flatItems = [];
    activeIndex = -1;
    const nodes = [];
    for (const group of data.groups ?? []) {
      const meta = ENTITY_META[group.type];
      if (!meta) continue;
      nodes.push(el('div', { class: 'gsearch__group-label' }, icon(meta.iconName, 14), meta.label));
      for (const item of group.items) {
        flatItems.push(item);
        const sub = itemSubtitle(item);
        nodes.push(
          el('button', {
            type: 'button',
            class: 'gsearch__item',
            dataset: { index: String(flatItems.length - 1) },
            onmousedown: (e) => { e.preventDefault(); go(item); },
            onmousemove: (e) => setActive(Number(e.currentTarget.dataset.index))
          },
            el('span', { class: 'gsearch__item-icon' }, icon(meta.iconName, 16)),
            el('span', { class: 'gsearch__item-main' },
              el('span', { class: 'gsearch__item-title' }, item.title),
              sub ? el('span', { class: 'gsearch__item-sub' }, sub) : null
            ),
            icon('chevL', 14)
          )
        );
      }
    }
    if (flatItems.length === 0) {
      renderEmpty('نتیجه‌ای پیدا نشد — عبارت دیگری را امتحان کنید');
      return;
    }
    results.replaceChildren(...nodes);
    setActive(0);
  }

  function itemSubtitle(item) {
    if (item.type === 'staff') return ROLE_LABELS[item.subtitle] ?? null;
    if (item.type === 'school') return KIND_LABELS[item.subtitle] ?? item.subtitle ?? null;
    if (item.type === 'doc') return DOC_CATEGORY_LABELS[item.subtitle] ?? null; // 
    if (item.type === 'tag') {
      const n = Number.parseInt(item.subtitle ?? '', 10);
      return Number.isFinite(n) && n > 0 ? `${fa(n)} دانش‌آموز` : null;
    }
    return item.subtitle ?? null;
  }

  function fa(n) {
    return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  }

  async function run() {
    const q = input.value.trim();
    const mySeq = ++seq;
    if (q.length < 2) {
      renderEmpty('حداقل ۲ نویسه بنویسید…');
      return;
    }
    results.replaceChildren(el('div', { class: 'gsearch__loading' }, el('span', { class: 'spinner spinner--sm' })));
    try {
      const res = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
      if (mySeq !== seq) return; // پاسخ کهنه
      renderGroups(res.data ?? {});
    } catch (err) {
      if (mySeq !== seq) return;
      renderEmpty(err.message || 'خطا در جستجو');
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(run, 220);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) go(item);
    }
  });

  const modal = openModal({
    title: 'جستجوی سراسری',
    body: [input, results, hintRow()],
    onClose: () => { opened = false; clearTimeout(debounce); seq++; }
  });
  closePalette = modal.close;
  modal.root.classList.add('modal--gsearch');

  renderEmpty('برای جستجو حداقل ۲ نویسه بنویسید…');
  setTimeout(() => input.focus(), 60);
}
