import { api } from './api.js';
import { el, icon, openModal, toast, toastError } from './ui.js';

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
let hotkeysBound = false; // ۱.۲۷.۸۵ — گارد ثبت دوبارهٔ میان‌برها: init هرگز کلیدها را دو بار بند نمی‌کند

/* ۱.۲۷.۷۳ — سرچ هوشمند: اکشن مستقیم روی نتیجه، بدون خروج از پالت.
   «پرینت خام سند» = فایل اصلی سند خام (همان الگوی previewFile مخزن اسناد: بایتِ
   احرازشده → objectURL → تب جدید؛ window.open مستقیم روی /api/* توکن ندارد). */
function isPreviewableFile(file) {
  const m = String(file.mime ?? '').toLowerCase();
  return m === 'application/pdf' || m.startsWith('image/');
}

async function printDocRaw(docId) {
  try {
    const res = await api.get(`/api/docs/${docId}`);
    const doc = res.data ?? res;
    const files = doc.files ?? [];
    const file = files.find(isPreviewableFile) ?? files[0];
    if (!file) { toast('این سند فایلی برای پرینت ندارد', 'error'); return; }
    const { blob } = await api.downloadBlob(`/api/docs/${docId}/files/${file.id}?inline=1`);
    const objUrl = URL.createObjectURL(blob);
    const w = window.open(objUrl, '_blank', 'noopener');
    if (!w) {
      const a = el('a', { href: objUrl, target: '_blank', rel: 'noopener' });
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    toast(`«${doc.title}» برای پرینت باز شد`, 'success');
  } catch (err) {
    toastError(err);
  }
}

/* اکشن‌های مستقیم هر نوع نتیجه — student با دیپ‌لینک ?action= (پروفایل کلاسیک مودال اقدام را باز می‌کند) */
function itemActions(item) {
  if (item.type === 'doc') return [{ icon: 'printer', label: 'پرینت خام', run: () => printDocRaw(item.id) }];
  if (item.type === 'student') return [
    { icon: 'bell', label: 'ثبت رویداد', hash: `#/students/${item.id}?action=event` },
    { icon: 'bot', label: 'گزارش معلم', hash: `#/students/${item.id}?action=teacher-report` },
    { icon: 'file', label: 'گزارش قطعی', hash: `#/students/${item.id}?action=definite` }
  ];
  return [];
}

export function initGlobalSearch() {
  if (hotkeysBound) return; // ۱.۲۷.۸۵ — idempotent: app.js هم lazy فراخوانی می‌کند؛ ثبت دوباره ممنوع
  hotkeysBound = true;
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

  /* ۱.۲۷.۸۵ — دکمهٔ پاک‌کردن جست‌وجو: فقط وقتی ورودی متن دارد دیده می‌شود؛
     کلیک = پاک‌سازی + بازگشت به حالت آغازین پالت (بخش‌های «همین پرونده» یا پیام حداقل نویسه) + برگشت فوکوس */
  const clearBtn = el('button', {
    class: 'search-clear gsearch__clear',
    type: 'button',
    'aria-label': 'پاک‌کردن جست‌وجو',
    onclick: () => {
      input.value = '';
      clearBtn.hidden = true;
      seq++; // پاسخ‌های در راهِ قبلی نادیده گرفته می‌شوند
      renderInitial();
      input.focus();
    }
  }, icon('x', 14));
  const field = el('div', { class: 'gsearch__field' }, input, clearBtn);

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
    /* ۱.۲۷.۶۴ — موج ۳: بخش‌های پروندهٔ باز در پالت (گروه محلی) با hash مستقیم می‌روند */
    if (item.hash) {
      location.hash = item.hash;
      if (closePalette) closePalette();
      return;
    }
    const meta = ENTITY_META[item.type];
    if (!meta) return;
    location.hash = meta.href(item);
    if (closePalette) closePalette();
  }

  /* ۱.۲۷.۶۴ — موج ۳: وقتی پالت از درون یک پرونده باز می‌شود، بخش‌های همان پرونده بالای
     نتایج سراسری می‌آیند — ناوبری بدون خروج از پرونده */
  function localProfileSections() {
    const m = location.hash.match(/#\/students\/([0-9a-f-]{36})(?:\?.*)?$/);
    if (!m) return [];
    const base = `#/students/${m[1]}`;
    return [
      { type: 'profile-section', icon: 'brain', title: 'تفسیر بالینی', hash: `${base}?tab=clinical` }, // ۱.۲۷.۷۱ — دیپ‌لینک کلاسیک
      { type: 'profile-section', icon: 'user', title: 'اطلاعات پایه', hash: `${base}?tab=info` },
      { type: 'profile-section', icon: 'bell', title: 'پیگیری‌ها', hash: `${base}?tab=timeline&filter=followups` },
      { type: 'profile-section', icon: 'clock', title: 'تاریخچهٔ پرونده', hash: `${base}?tab=timeline` },
      { type: 'profile-section', icon: 'file', title: 'گزارش‌های خروجی', hash: `${base}?tab=timeline&filter=reports` },
      { type: 'profile-section', icon: 'calendar', title: 'جلسات', hash: `${base}?tab=sessions` },
      { type: 'profile-section', icon: 'clip', title: 'تمرین‌ها', hash: `${base}?tab=exercises` },
      { type: 'profile-section', icon: 'bot', title: 'ارتباطات', hash: `${base}?tab=comms` }
    ];
  }

  function renderEmpty(text) {
    results.replaceChildren(
      el('div', { class: 'gsearch__empty' }, icon('search', 20), el('span', {}, text))
    );
  }

  /* ۱.۲۷.۸۵ — حالت آغازین پالت: با بخش‌های «همین پرونده» یا پیام حداقل نویسه — همان مسیر openPalette */
  function renderInitial() {
    if (localProfileSections().length > 0) renderGroups({ groups: [] });
    else renderEmpty('برای جستجو حداقل ۲ نویسه بنویسید…');
  }

  function renderItem({ node, iconName, title, sub, actions, goTarget }) {
    flatItems.push(goTarget);
    node.append(
      el('span', { class: 'gsearch__item-icon' }, icon(iconName, 16)),
      el('span', { class: 'gsearch__item-main' },
        el('span', { class: 'gsearch__item-title' }, title),
        sub ? el('span', { class: 'gsearch__item-sub' }, sub) : null
      ),
      /* ۱.۲۷.۷۳ — اکشن‌های مستقیم: کلیک روی آن‌ها از ناوبری ردیف جدا است · ۱.۲۷.۸۵: کیبوردپذیر (tabindex + Enter/Space همان مسیر کلیک) */
      ...(actions ?? []).map((a) => el('span', {
        class: 'gsearch__act',
        role: 'button',
        tabindex: '0',
        title: a.label,
        'aria-label': a.label,
        onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); a.hash ? go({ hash: a.hash }) : a.run(); },
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); a.hash ? go({ hash: a.hash }) : a.run(); } }
      }, icon(a.icon, 13))),
      icon('chevL', 14)
    );
    return node;
  }

  function renderGroups(data) {
    flatItems = [];
    activeIndex = -1;
    const nodes = [];
    const groups = [...(data.groups ?? [])];
    /* ۱.۲۷.۷۳ (خواست کارفرما) — در پروندهٔ باز «اسم دانش‌آموز» بالای بخش‌های «همین پرونده»
       می‌آید؛ قبلاً برعکس بود. */
    const studentIdx = groups.findIndex((g) => g.type === 'student');
    const studentGroup = studentIdx >= 0 ? groups.splice(studentIdx, 1)[0] : null;
    const pushGroup = (group) => {
      const meta = ENTITY_META[group.type];
      if (!meta) return;
      nodes.push(el('div', { class: 'gsearch__group-label' }, icon(meta.iconName, 14), meta.label));
      for (const item of group.items) {
        nodes.push(renderItem({
          node: el('button', {
            type: 'button',
            class: 'gsearch__item',
            dataset: { index: String(flatItems.length) },
            onmousedown: (e) => { e.preventDefault(); go(item); },
            onmousemove: (e) => setActive(Number(e.currentTarget.dataset.index))
          }),
          iconName: meta.iconName,
          title: item.title,
          sub: itemSubtitle(item),
          actions: itemActions(item),
          goTarget: item
        }));
      }
    };
    if (studentGroup) pushGroup(studentGroup);
    const local = localProfileSections();
    if (local.length > 0) {
      nodes.push(el('div', { class: 'gsearch__group-label' }, icon('compass', 14), 'همین پرونده'));
      for (const item of local) {
        nodes.push(renderItem({
          node: el('button', {
            type: 'button',
            class: 'gsearch__item',
            dataset: { index: String(flatItems.length) },
            onmousedown: (e) => { e.preventDefault(); go(item); },
            onmousemove: (e) => setActive(Number(e.currentTarget.dataset.index))
          }),
          iconName: item.icon,
          title: item.title,
          sub: null,
          actions: [],
          goTarget: item
        }));
      }
    }
    for (const group of groups) pushGroup(group);
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
    clearBtn.hidden = !input.value; // ۱.۲۷.۸۵ — دکمهٔ پاک‌کردن فقط با متن ورودی
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
    body: [field, results, hintRow()],
    onClose: () => { opened = false; clearTimeout(debounce); seq++; }
  });
  closePalette = modal.close;
  modal.root.classList.add('modal--gsearch');

  /* ۱.۲۷.۶۴ — موج ۳: در پروندهٔ باز، بخش‌های «همین پرونده» بی‌درنگ و بدون تایپ دیده می‌شوند */
  renderInitial();
  setTimeout(() => input.focus(), 60);
}
