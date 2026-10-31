import { api } from './api.js';
import { el, icon, toast, toastError, openModal, skeletonState, emptyState } from './ui.js';
import { fa } from './format.js';
import { hueDot } from './staff-hue.js'; // — چیپ رنگی سازندهٔ تمرین ()
import { buildTaxonomyPicker } from './taxonomy.js'; // درخت واحد طبقه‌بندی (یک کامپوننت برای منو/فرم/پیکر)

const PAGE_SIZE = 50; // با جستجو + فیلتر درخت کافی است — مرور کامل در نمای «کارت‌های آماده»
// زبان کارت: هر رکورد کتابخانه یک نوع کارت جلسه دارد (هم‌راستا با FORMAT_LABELS نمای کتابخانه)
const CARD_TYPE_LIST = [
  { key: 'worksheet', label: 'تمرین' },
  { key: 'homework', label: 'تکلیف' },
  { key: 'game', label: 'بازی' },
  { key: 'instruction', label: 'دستورالعمل' },
  { key: 'family', label: 'آموزش خانواده' }
];
const CARD_TYPE_LABELS = Object.fromEntries(CARD_TYPE_LIST.map((t) => [t.key, t.label]));
const ITEM_TEXT_MAX = 500; // PATHWAY_SESSION_ITEM_TEXT_MAX سمت سرور

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

export function bankPickButton({ onPick }) {
  return el('button', {
    class: 'btn btn--ghost btn--sm expick-open',
    type: 'button',
    title: 'افزودن کارت آماده از کتابخانه',
    onclick: () => openExercisePicker({ onPick })
  }, icon('download', 13), 'کارت آماده');
}

export function openExercisePicker({ onPick } = {}) {
  // فیلترها با درخت واحد: کلید هدف (info/exec) + کلید/شناسهٔ برچسب (disorder/grade)
  // جمعِ درون ستون، اجتماعِ بین ستون‌ها — همان زبان منوی کتابخانه
  const state = { q: '', format: '', focus: [], disorders: [], grades: [] };
  const pickFocusSel = new Set(); // انتخاب زندهٔ ستون‌های علمی — کامپوننت پر می‌کند
  const pickTagSel = new Set(); // انتخاب زندهٔ ستون‌های برچسبی
  let taxLabels = new Map(); // کلید → برچسب فارسی (بج هدف سطرها)
  let taxKeyPillar = new Map(); // کلید حوزه/برگ برچسبی → کلید ستون (تفکیک disorder/grade)
  let seq = 0; // پاسخ‌های کهنهٔ جستجو نادیده گرفته شوند
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

  function row(ex) {
    const fileCount = Array.isArray(ex.files) ? ex.files.length : 0;
    const ownerName = ex.createdBy ? staffNames.get(ex.createdBy) : null;
    // نگاشت کلید/شناسه → برچسب از درخت واحد
    const focusLabelOf = (k) => taxLabels.get(k) ?? null;
    return el('div', { class: 'expick-row' },
      el('div', { class: 'expick-row__main' },
        el('b', { class: 'expick-row__title' }, ex.title),
        el('div', { class: 'expick-row__meta' },
          el('span', { class: 'badge badge--neutral' }, CARD_TYPE_LABELS[ex.format] ?? ex.format), // نوع کارت جلوی چشم
          ownerName ? el('span', { class: 'staff-chip exb-owner expick-owner' }, hueDot(ex.createdBy, 9), ownerName) : null,
          ex.visibility === 'private' ? el('span', { class: 'badge badge--warning' }, 'خصوصی') : null,
          ex.teamCreated ? el('span', { class: 'badge badge--neutral' }, 'تیمی') : null,
          fileCount ? el('span', { class: 'cell-sub' }, `${fa(fileCount)} فایل`) : null,
          ex.externalUrl ? el('span', { class: 'cell-sub' }, 'بازی آنلاین') : null,
          (Array.isArray(ex.focus) ? ex.focus : []).slice(0, 2).map((k) => focusLabelOf(k))
            .filter(Boolean)
            .map((lbl) => el('span', { class: 'badge badge--neutral expick-focus' }, lbl)),
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
      if (state.format) qs.set('format', state.format); // فیلتر نوع کارت
      if (state.focus.length) qs.set('focus', state.focus.join(',')); // فیلتر هدفمند (گسترش درختی سمت سرور)
      if (state.disorders.length) qs.set('disorder', state.disorders.join(',')); // ستون اختلال‌ها
      if (state.grades.length) qs.set('grade', state.grades.join(',')); // ستون پایه تحصیلی
      if (state.q) qs.set('q', state.q);
      const res = await api.get(`/api/exercises?${qs.toString()}`);
      if (mySeq !== seq) return; // پاسخ کهنه
      const items = res.data?.items ?? [];
      const total = res.data?.total ?? 0;
      if (!items.length) {
        listBox.replaceChildren(emptyState({
          iconName: 'search',
          title: 'کارتی پیدا نشد',
          hint: state.q || state.focus.length || state.disorders.length || state.grades.length || state.format
            ? 'جستجو، نوع کارت یا فیلترهای درخت را تغییر دهید.'
            : 'کتابخانه خالی است — اول از نمای «کارت‌های آماده» کارت بسازید.'
        }));
      } else {
        listBox.replaceChildren(...items.map(row));
      }
      foot.textContent = total > items.length
        ? `${fa(items.length)} از ${fa(total)} کارت — بقیه را با جستجو یا فیلتر درخت پیدا کنید.`
        : total > 0 ? `${fa(total)} کارت` : '';
    } catch (err) {
      if (mySeq !== seq) return;
      listBox.replaceChildren(emptyState({
        iconName: 'alert',
        title: 'بارگذاری کارت‌های آماده ناموفق بود',
        hint: err?.message ?? '',
        actionLabel: 'تلاش مجدد',
        onAction: load
      }));
    }
  }

  const search = el('input', { class: 'input', placeholder: 'جستجوی عنوان یا توضیح تمرین…' });
  let debounce = null;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = search.value.trim(); load(); }, 300);
  });

  // پاپ‌اُور درخت واحد: جایگزین select کشویی هدف و چیپ‌های تخت اختلال/پایه
  const treeSummary = el('span', {}, '');
  const treeChev = el('span', { class: 'expick-treebtn__chev' }, icon('chevL', 13));
  const treePanel = el('div', { class: 'expick-treepanel', id: 'expick-treepanel', hidden: true }); /* S6-25: id برای aria-controls */
  let taxPicker = null;

  function treeBtnLabel() {
    const n = state.focus.length + state.disorders.length + state.grades.length;
    treeSummary.textContent = n === 0
      ? 'همهٔ کارت‌ها — فیلتر طبقه‌بندی'
      : `فیلتر فعال — ${fa(state.focus.length)} هدف و ${fa(state.disorders.length + state.grades.length)} برچسب`;
  }

  const treeBtn = el('button', {
    class: 'btn btn--soft btn--sm expick-treebtn',
    type: 'button',
    title: 'فیلتر طبقه‌بندی با درخت واحد — چهار ستون',
    'aria-expanded': 'false', /* S6-25 */
    'aria-controls': 'expick-treepanel',
    onclick: () => {
      treePanel.hidden = !treePanel.hidden;
      treeBtn.classList.toggle('is-open', !treePanel.hidden);
      treeBtn.setAttribute('aria-expanded', String(!treePanel.hidden));
    }
  }, icon('board', 14), treeSummary, treeChev);

  function buildPicker(tree) {
    taxLabels = new Map();
    taxKeyPillar = new Map();
    for (const px of tree) {
      taxLabels.set(px.key, px.fa);
      for (const d of px.domains ?? []) {
        taxLabels.set(d.key, d.fa);
        if (px.source === 'tag') taxKeyPillar.set(d.key, px.key);
        for (const lf of d.leaves ?? []) {
          taxLabels.set(lf.key, lf.fa);
          if (px.source === 'tag') taxKeyPillar.set(lf.key, px.key);
        }
      }
    }
    taxPicker = buildTaxonomyPicker({
      tree,
      focusSel: pickFocusSel,
      tagSel: pickTagSel,
      maxFocus: Infinity, // فیلتر — سقف ۸ پیوند مالِ ذخیرهٔ کارت است نه جستجو
      summaryHint: 'فیلتر پیکر با درخت واحد — ستون را باز کنید و هدف/اختلال/پایه را برگزینید؛ انتخاب خانواده یعنی همهٔ برچسب‌های عضو',
      onChange: () => {
        state.focus = [...pickFocusSel];
        state.disorders = [...pickTagSel].filter((k) => taxKeyPillar.get(k) === 'disorder');
        state.grades = [...pickTagSel].filter((k) => taxKeyPillar.get(k) === 'grade');
        treeBtnLabel();
        load();
      }
    });
    treePanel.replaceChildren(taxPicker.el);
    treeBtnLabel();
  }

  // ردیف «نوع کارت»: انتخاب تکی
  const typeRow = el('div', { class: 'expick-chips' },
    el('button', {
      class: `chip${state.format === '' ? ' is-active' : ''}`, type: 'button',
      onclick: (e) => { state.format = ''; toggleTypeChip(e.currentTarget); load(); }
    }, 'همه'),
    ...CARD_TYPE_LIST.map((t) => el('button', {
      class: `chip${state.format === t.key ? ' is-active' : ''}`, type: 'button',
      title: 'در جلسه به کارتِ «' + t.label + '» تبدیل می‌شود',
      onclick: (e) => { state.format = t.key; toggleTypeChip(e.currentTarget); load(); }
    }, t.label))
  );

  const { close } = openModal({
    title: 'افزودن کارت آماده',
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      search,
      treeBtn, // دکمهٔ بازکردن پاپ‌اُور درخت
      treePanel,
      typeRow,
      listBox,
      foot)
  });

  function toggleTypeChip(btn) {
    btn.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
    btn.classList.add('is-active');
  }

  (async () => {
    try {
      const res = await api.get('/api/exercises/meta');
      const tree = res.data?.taxonomyTree; // درخت واحد
      if (Array.isArray(tree) && tree.length) buildPicker(tree);
    } catch { /* درخت خالی — جستجو کار می‌کند */ }
  })();

  load();
}
