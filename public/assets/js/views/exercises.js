/**
 * نمای بانک تمرین
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// exercises.js — بانک تمرین با ناوبری تو در تو + صفحه‌بندی + وکتور (بدون ایموجی)
// ساختار جدید (دستور کاربر: «تمرین‌ها باید حالت تو در تو و صفحه‌بندی شده بر اساس نوع اختلال …»):
// سطح ۱ — کاشی‌های دستهٔ اختلال (با آیکون وکتور و شمارش زنده از facets)
// سطح ۲ — چیپ‌های پایه + جستجو + فیلتر انتشار → کارت‌ها با صفحه‌بندی سرورمحور
// تغییر: بخش «بازگشتی‌ها» طبق دستور کاربر به‌کلی حذف شد (بازگشتی خانواده در
// تایم‌لاین پرونده و پروفایل دانش‌آموز همچنان در جریان است — فقط نمای پنل حذف شد).
// موروثی: آپلود چندفایلی multipart + تکه‌ای، RBAC سه نقش، حذف نرم.

import { api } from '../api.js';
import {
  el,
  icon,
  toast,
  toastError,
  confirmModal,
  openModal,
  formModal,
  emptyState,
  skeletonState,
  errorState
} from '../ui.js';
import { fa, formatJalaliNumeric, safeExternalHref } from '../format.js';
import { session } from '../state.js';
import { hueClass, hueDot } from '../staff-hue.js'; // — رنگ ثابت سازندهٔ تمرین (همان پالت درمانگر)

// سقف‌ها از meta سرور خوانده می‌شوند (آداپتر محور)؛ این‌ها فقط پیش‌فرض اولیه‌اند
const LIMITS = {
  maxFileBytes: 50 * 1024 * 1024,
  maxFilesPerUpload: 10
};
/** MIME از پسوند — برای مرورگرهایی که نوع خالی می‌دهند (.mkv/.avi/…) */
const EXT_MIME_FALLBACK = {
  mp4: 'video/mp4', m4v: 'video/x-m4v', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', mkv: 'video/x-matroska', '3gp': 'video/3gpp', wmv: 'video/x-ms-wmv',
  mpeg: 'video/mpeg', mpg: 'video/mpeg',
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', html: 'text/html',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
const FORMAT_LABELS = { worksheet: 'کاربرگ', game: 'بازی', instruction: 'دستورالعمل خانه' };
const FORMAT_ICONS = { worksheet: 'file', game: 'gamepad', instruction: 'board' };
const PAGE_SIZE = 18;

/** — نگاشت نام اختلال به آیکون وکتور (برچسب‌های disorder از meta سرور می‌آیند) */
const DISORDER_ICON_RULES = [
  [/خواندن|دسلکسی|روخوانی|واکشی/, 'book'],
  [/نوشتن|دیسگرافی|املاء|املا|نگارش/, 'edit'],
  [/ریاض|حساب|دیسکالکولی|عدد/, 'calculator'],
  [/بیش\s?فعال|توجه|نارسا/, 'zap'],
  [/اتیزم|طیف/, 'puzzle'],
  [/گفتار|زبان|کلام/, 'speech'],
  [/اضطراب|نگرانی|ترس/, 'heart'],
  [/حرکت|هماهنگی|موتور|رشد/, 'activity'],
  [/رفتار|نافرمانی|ODD|خلق/, 'shield'],
  [/دیرآموز|کند|توان ذهنی/, 'brain']
];
function disorderIcon(name) {
  const n = String(name ?? '');
  for (const [re, ic] of DISORDER_ICON_RULES) {
    if (re.test(n)) return ic;
  }
  return 'target';
}

function isStaff() {
  return Boolean(session.user && ['manager', 'therapist', 'secretary'].includes(session.user.role));
}

// ─────────────── سازنده + نشان‌های خصوصی/تیمی (m136) ───────────────

/** نگاشت staffId → نام — یک‌بار در هر سشن نما پر می‌شود (GET /api/staff) */
let staffList = [];
const staffNames = new Map();

async function loadStaff() {
  try {
    const res = await api.get('/api/staff');
    staffList = Array.isArray(res.data) ? res.data : res.data?.items ?? [];
    staffNames.clear();
    for (const s of staffList) staffNames.set(s.id, s.fullName);
  } catch {
    /* فهرست کارکنان نیامد — چیپ سازنده فقط نمایش داده نمی‌شود */
  }
}

/** چیپ رنگی سازنده روی سربرگ کارت — «سازنده: نام» */
function ownerChip(createdBy) {
  const name = createdBy ? staffNames.get(createdBy) : null;
  if (!name) return null;
  return el(
    'span',
    { class: `staff-chip exb-owner ${hueClass(createdBy)}`, title: `سازندهٔ تمرین: ${name}` },
    hueDot(createdBy, 9),
    `سازنده: ${name}`
  );
}

function privateBadge() {
  return el('span', { class: 'badge badge--warning' }, 'خصوصی');
}

function teamBadge() {
  return el('span', { class: 'badge badge--neutral' }, 'تیمی');
}

/** فایل‌های قابل پیش‌نمایش درون‌برنامه‌ای — تصویر یا PDF
 * — m137: mime ناشناخته/خالی با پسوند هم حدس زده می‌شود (آپلودها گاهی octet-stream ثبت می‌شوند) */
const PREVIEW_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf'];
function previewable(file) {
  const mime = String(file?.mime ?? '').toLowerCase();
  if (mime.startsWith('image/') || mime === 'application/pdf') return true;
  if (!mime || mime === 'application/octet-stream') {
    const ext = String(file?.filename ?? '').split('.').pop()?.toLowerCase() ?? '';
    return PREVIEW_EXTS.includes(ext);
  }
  return false;
}

function formatBadge(format) {
  return el('span', { class: 'badge badge--neutral exb-format' }, icon(FORMAT_ICONS[format] ?? 'file', 13), FORMAT_LABELS[format] ?? format);
}

function publishedBadge(published) {
  return el('span', { class: `badge ${published ? 'badge--success' : 'badge--warning'}` }, published ? 'منتشرشده' : 'پیش‌نویس');
}

function sizeLabel(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${fa(mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10)}MB`;
  }
  return bytes >= 1024 ? `${fa(Math.round(bytes / 1024))}KB` : `${fa(bytes)}B`;
}

/** — MIME یک فایل محلی: نوع اعلامی مرورگر یا fallback پسوند */
function localMime(file) {
  const t = (file.type || '').toLowerCase();
  if (t && t !== 'application/octet-stream') return t;
  const ext = (file.name || '').split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME_FALLBACK[ext] ?? t ?? 'application/octet-stream';
}

/**
 * — اعتبارسنجی سمت کاربر (همان مرز سرور): نوع + حجم — باینری مستقیم می‌رود،
 * base64 و سقف ۵۱۲KB قدیمی حذف شد
 */
function validateLocalFile(file) {
  const mime = localMime(file);
  const ext = (file.name || '').split('.').pop()?.toLowerCase() ?? '';
  if (!EXT_MIME_FALLBACK[ext] && !(mime && mime !== 'application/octet-stream')) {
    throw new Error(`نوع فایل «${file.name}» شناخته نشد`);
  }
  if (file.size > LIMITS.maxFileBytes) {
    throw new Error(`حجم «${file.name}» بیش از ${sizeLabel(LIMITS.maxFileBytes)} است`);
  }
  if (file.size === 0) {
    throw new Error(`فایل «${file.name}» خالی است`);
  }
  return mime;
}

/** — فهرست فایل‌های انتخاب‌شده به شکل چیپ با دکمهٔ حذف */
function buildPickedChips(files, onChange) {
  const wrap = el('div', { class: 'exb-picked' });
  function draw() {
    wrap.replaceChildren(
      ...files.map((f, i) =>
        el(
          'span',
          { class: 'exb-picked__chip' },
          icon('file', 13),
          el('span', { class: 'exb-picked__name' }, f.name),
          el('span', { class: 'exb-picked__size' }, sizeLabel(f.size)),
          el('button', {
            type: 'button',
            class: 'exb-picked__x',
            title: 'حذف از انتخاب',
            onclick: () => { files.splice(i, 1); draw(); onChange?.(); }
          }, icon('x', 11))
        )
      )
    );
  }
  draw();
  wrap.refresh = draw;
  return wrap;
}

/** ناحیهٔ درگ‌اند‌دراپ چندفایلی + کلیک برای انتخاب — */
function buildDropzone(onFiles) {
  const input = el('input', { type: 'file', multiple: true, style: { display: 'none' } });
  const hint = LIMITS.maxFileBytes >= 1024 * 1024
    ? `${fa(Math.round(LIMITS.maxFileBytes / (1024 * 1024)))} مگابایت`
    : `${fa(Math.round(LIMITS.maxFileBytes / 1024))} کیلوبایت`;
  const zone = el(
    'div',
    { class: 'exb-drop' },
    el('span', {}, icon('upload', 22)),
    el('b', {}, 'فایل‌های تمرین را اینجا رها کنید'),
    el('span', { class: 'exb-drop__hint' }, `یا کلیک کنید — PDF، تصویر، ویدیو، Word، Excel، HTML — هر فایل تا ${hint} — چند فایل همزمان`)
  );
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-over');
    const list = Array.from(e.dataTransfer?.files ?? []);
    if (list.length > 0) onFiles(list);
  });
  input.addEventListener('change', () => {
    const list = Array.from(input.files ?? []);
    if (list.length > 0) onFiles(list);
    input.value = '';
  });
  return el('div', {}, input, zone);
}

/** ردیف برچسب‌های قابل انتخاب — گروه‌بندی دسته‌ها */
function buildTagPicker(tags, selected) {
  const wrap = el('div', { class: 'exb-tags' });
  const groups = [
    { key: 'disorder', label: 'اختلال' },
    { key: 'grade', label: 'پایه' },
    { key: 'other', label: 'سایر' }
  ];
  for (const g of groups) {
    const list = tags[g.key] ?? [];
    if (list.length === 0) continue;
    wrap.append(el('div', { class: 'exb-tags__label' }, g.label));
    const row = el('div', { class: 'exb-tags__row' });
    for (const t of list) {
      const chip = el('button', { type: 'button', class: 'exb-chip', dataset: { tagId: t.id } }, t.name);
      if (selected.has(t.id)) chip.classList.add('is-on');
      chip.addEventListener('click', () => {
        if (selected.has(t.id)) {
          selected.delete(t.id);
          chip.classList.remove('is-on');
        } else {
          selected.add(t.id);
          chip.classList.add('is-on');
        }
      });
      row.append(chip);
    }
    wrap.append(row);
  }
  return wrap;
}

export function renderExercises(container) {
  const toolbar = el('div', { class: 'page-head' });
  const nav = el('div', { class: 'exb-nav' });
  const body = el('div', { class: 'exb-body' });
  container.replaceChildren(toolbar, nav, body);

  let tags = { disorder: [], grade: [], other: [] };
  let storage = 'd1';
  let facets = { counts: {}, total: 0 };
  // ناوبری تو در تو: دستهٔ اختلال (سطح ۱) + پایه (سطح ۲) + جستجو/انتشار
  const state = { cat: '', grade: '', q: '', published: 'all', page: 1 };
  let items = [];
  let total = 0;
  let hasMore = false;

  // ─────────────── داده ───────────────

  async function loadMeta() {
    try {
      const res = await api.get('/api/exercises/meta');
      tags = res.data?.categories ?? tags;
      storage = res.data?.storage ?? 'd1';
      if (res.data?.facets) facets = res.data.facets;
      // سقف‌های واقعی از سرور (آداپتر محور: D1 تکه‌تکه/R2 = ۵۰MB)
      if (res.data?.limits) {
        if (Number.isFinite(res.data.limits.maxFileBytes)) LIMITS.maxFileBytes = res.data.limits.maxFileBytes;
        if (Number.isFinite(res.data.limits.maxFilesPerUpload)) LIMITS.maxFilesPerUpload = res.data.limits.maxFilesPerUpload;
      }
    } catch {
      /* برچسب‌های خالی — نما کار می‌کند */
    }
  }

  /** — بارگذاری چندفایلی برای یک تمرین ثبت‌شده.
   * فایل ≤ ۳MB: یک درخواست multipart — فایل بزرگ‌تر: بارگذاری پیوستهٔ تکه‌به‌تکه
   * (هر درخواست ≤ ۱ مگابایت تا سقف CPU درخواست Worker نسوزد) با نمایش پیشرفت */
  const CHUNK_UPLOAD_BYTES = 1024 * 1024;
  const MULTIPART_MAX_BYTES = 3 * 1024 * 1024;

  async function uploadFiles(exerciseId, files, onProgress) {
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      onProgress?.(i + 1, files.length, f.name, 0);
      if (f.size <= MULTIPART_MAX_BYTES) {
        const form = new FormData();
        form.append('files', f, f.name);
        await api.postForm(`/api/exercises/${exerciseId}/files`, form);
        onProgress?.(i + 1, files.length, f.name, 100);
      } else {
        await uploadChunked(exerciseId, f, (pct) => onProgress?.(i + 1, files.length, f.name, pct));
      }
    }
  }

  async function uploadChunked(exerciseId, file, onPct) {
    const mime = localMime(file);
    const begin = await api.post(`/api/exercises/${exerciseId}/files/begin`, {
      filename: file.name,
      mime,
      size: file.size
    });
    const fileId = begin?.data?.fileId;
    const chunks = Math.ceil(file.size / CHUNK_UPLOAD_BYTES);
    for (let seq = 0; seq < chunks; seq += 1) {
      const start = seq * CHUNK_UPLOAD_BYTES;
      const piece = file.slice(start, Math.min(start + CHUNK_UPLOAD_BYTES, file.size));
      const buf = await piece.arrayBuffer();
      await api.putRaw(`/api/exercises/${exerciseId}/files/${fileId}/chunks/${seq}`, buf);
      onPct?.(Math.round(((seq + 1) / chunks) * 100));
    }
    await api.post(`/api/exercises/${exerciseId}/files/${fileId}/complete`, {});
  }

  async function refresh() {
    body.replaceChildren(skeletonState('cards', 4));
    try {
      const qs = new URLSearchParams({ page: String(state.page), page_size: String(PAGE_SIZE) });
      // ناوبری تو در تو: اختلال + پایه با هم (AND سرورمحور)
      const tagIds = [state.cat, state.grade].filter(Boolean);
      if (tagIds.length > 0) qs.set('tag_ids', tagIds.join(','));
      if (state.q) qs.set('q', state.q);
      if (state.published !== 'all') qs.set('published', state.published);
      const res = await api.get(`/api/exercises?${qs.toString()}`);
      items = res.data?.items ?? [];
      total = res.data?.total ?? 0;
      hasMore = res.data?.hasMore ?? false;
      drawList();
    } catch (err) {
      body.replaceChildren(errorState(err, refresh));
    }
  }

  /** بعد از هر تغییر داده — شمارش کاشی‌ها هم تازه شود */
  async function reloadAll() {
    await loadMeta();
    drawNav();
    await refresh();
  }

  // ─────────────── ناوبری تو در تو (سطح ۱: اختلال، سطح ۲: پایه/جستجو) ───────────────

  function selectCat(id) {
    if (state.cat === id) return;
    state.cat = id;
    state.grade = '';
    state.page = 1;
    drawNav();
    refresh();
  }

  function selectGrade(id) {
    if (state.grade === id) return;
    state.grade = id;
    state.page = 1;
    drawNav();
    refresh();
  }

  function catTile(id, ic, name, count) {
    const active = state.cat === id;
    return el(
      'button',
      {
        class: `exb-cat${active ? ' is-active' : ''}`,
        onclick: () => selectCat(id)
      },
      el('span', { class: 'exb-cat__icon' }, icon(ic, 18)),
      el(
        'span',
        { class: 'exb-cat__text' },
        el('span', { class: 'exb-cat__name', title: name }, name),
        el('span', { class: 'exb-cat__count' }, count > 0 ? `${fa(count)} تمرین` : 'بدون تمرین')
      )
    );
  }

  function drawNav() {
    const parts = [];

    // نان‌مکب — مسیر فعلی با دکمهٔ بازگشت به «همه»
    if (state.cat || state.grade) {
      const catName = tags.disorder.find((t) => t.id === state.cat)?.name;
      const gradeName = tags.grade.find((t) => t.id === state.grade)?.name;
      const crumb = el('div', { class: 'exb-crumb' },
        el('button', {
          class: 'btn btn--ghost btn--sm',
          onclick: () => { state.cat = ''; state.grade = ''; state.page = 1; drawNav(); refresh(); }
        }, icon('chevR', 14), 'همهٔ دسته‌ها'),
        catName ? el('span', { class: 'exb-crumb__sep' }, '‹') : null,
        catName ? el('b', {}, catName) : null,
        gradeName ? el('span', { class: 'exb-crumb__sep' }, '‹') : null,
        gradeName ? el('span', {}, gradeName) : null
      );
      parts.push(crumb);
    }

    // سطح ۱ — کاشی‌های دستهٔ اختلال (+ کاشی «همه»)
    const grid = el('div', { class: 'exb-cats' },
      catTile('', 'grid', 'همهٔ تمرین‌ها', facets.total),
      ...(tags.disorder ?? []).map((t) => catTile(t.id, disorderIcon(t.name), t.name, facets.counts?.[t.id] ?? 0))
    );
    parts.push(grid);

    // سطح ۲ — چیپ‌های پایه + جستجو + فیلتر انتشار
    const search = el('input', {
      class: 'input exb-search',
      placeholder: 'جستجوی عنوان یا توضیح…',
      value: state.q
    });
    let debounce = null;
    search.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.q = search.value.trim();
        state.page = 1;
        refresh();
      }, 350);
    });

    const pubSel = el(
      'select',
      { class: 'select' },
      el('option', { value: 'all', selected: state.published === 'all' }, 'همه'),
      el('option', { value: 'true', selected: state.published === 'true' }, 'منتشرشده'),
      el('option', { value: 'false', selected: state.published === 'false' }, 'پیش‌نویس')
    );
    pubSel.addEventListener('change', () => {
      state.published = pubSel.value;
      state.page = 1;
      refresh();
    });

    const gradeChips = el('div', { class: 'exb-grades' },
      el('span', { class: 'cell-sub' }, 'پایه:'),
      el('button', {
        class: `chip${state.grade === '' ? ' is-active' : ''}`,
        style: { cursor: 'pointer' },
        onclick: () => selectGrade('')
      }, 'همه'),
      ...(tags.grade ?? []).map((g) =>
        el('button', {
          class: `chip${state.grade === g.id ? ' is-active' : ''}`,
          style: { cursor: 'pointer' },
          onclick: () => selectGrade(g.id)
        }, g.name)
      )
    );

    parts.push(
      el('div', { class: 'exb-filters' }, search, pubSel),
      gradeChips
    );

    nav.replaceChildren(...parts);
  }

  // ─────────────── فهرست کارت‌ها + صفحه‌بندی ───────────────

  /** m143 — بندانگشتی پیش‌نمایش روی کارت: اولین تصویر لِیزی-لود می‌شود؛ PDF کاشی ثابت دارد */
  function buildThumb(ex, files) {
    const IMG_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
    const mimeOf = (f) => String(f?.mime ?? '').toLowerCase();
    const extOf = (f) => String(f?.filename ?? '').split('.').pop()?.toLowerCase() ?? '';
    const isImg = (f) => {
      const m = mimeOf(f);
      if (m.startsWith('image/')) return true;
      if (!m || m === 'application/octet-stream') return IMG_EXTS.includes(extOf(f));
      return false;
    };
    const isPdf = (f) => {
      const m = mimeOf(f);
      if (m === 'application/pdf') return true;
      if (!m || m === 'application/octet-stream') return extOf(f) === 'pdf';
      return false;
    };
    const img = files.find(isImg);
    const pdf = files.find(isPdf);
    const previewFiles = files.filter(previewable);
    const fileUrl = (f) => (f?.id ? `/api/exercises/${ex.id}/files/${f.id}` : `/api/exercises/${ex.id}/file`);
    const tile = (ic, label) => el('span', { class: 'exb-thumb__tile' }, icon(ic, 22), el('b', {}, label));
    const clickable = Boolean(img || pdf);
    const startIdxOf = (f) => Math.max(0, previewFiles.indexOf(f));
    const stage = el('div', {
      class: `exb-thumb${clickable ? ' exb-thumb--click' : ''}`,
      role: clickable ? 'button' : undefined,
      'aria-label': clickable ? `پیش‌نمایش ${ex.title}` : undefined,
      title: clickable ? 'پیش‌نمایش' : undefined,
      onclick: clickable ? () => openPreviewModal(ex, previewFiles, startIdxOf(img ?? pdf)) : undefined
    });
    if (img) {
      stage.append(tile('eye', 'پیش‌نمایش…'));
      let started = false;
      const io = new IntersectionObserver((entries, obs) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        obs.disconnect();
        if (started) return;
        started = true;
        (async () => {
          try {
            const res = await fetch(fileUrl(img), {
              headers: { Authorization: `Bearer ${localStorage.getItem('cs.token') ?? ''}` }
            });
            if (!res.ok) throw new Error('بارگذاری پیش‌نمایش ناموفق بود');
            const objUrl = URL.createObjectURL(await res.blob());
            stage.replaceChildren(el('img', { src: objUrl, alt: ex.title }));
          } catch {
            stage.replaceChildren(tile('file', 'پیش‌نمایش در دسترس نیست'));
          }
        })();
      }, { rootMargin: '240px' });
      io.observe(stage);
    } else if (pdf) {
      stage.append(tile('file', 'PDF — پیش‌نمایش'));
    } else {
      stage.append(tile(FORMAT_ICONS[ex.format] ?? 'file', FORMAT_LABELS[ex.format] ?? 'تمرین'));
    }
    return stage;
  }

  function drawList() {
    drawNav();

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (items.length === 0) {
      body.replaceChildren(
        emptyState({
          iconName: state.cat || state.grade || state.q ? 'search' : 'file',
          title: state.cat || state.grade || state.q ? 'در این دسته چیزی پیدا نشد' : 'هنوز تمرینی ثبت نشده',
          hint: state.cat || state.grade || state.q
            ? 'فیلتر پایه یا جستجو را تغییر دهید؛ یا از دسته‌های دیگر شروع کنید.'
            : isStaff()
              ? 'محتوای آماده حذف شده — با «تمرین جدید» اولین تمرین اصیل خودتان را بسازید؛ برچسب پایه و اختلال فراموش نشود تا در بات قابل پیدا کردن باشد.'
              : 'تمرین‌های مرکز اینجا نمایش داده می‌شود.'
        })
      );
      return;
    }

    const cards = items.map((ex) => {
      const files = Array.isArray(ex.files) && ex.files.length > 0
        ? ex.files
        : ex.file
          ? [{ id: '', filename: ex.file.filename, mime: ex.file.mime, size: ex.file.size }]
          : [];
      const previewFiles = files.filter(previewable);
      const actions = el(
        'div',
        { class: 'exb-card__actions' },
        previewFiles.length > 0
          ? el(
              'button',
              {
                class: 'btn btn--ghost btn--sm',
                title: 'پیش‌نمایش',
                onclick: () => openPreviewModal(ex, previewFiles)
              },
              icon('eye', 15)
            )
          : null,
        files.length > 0
          ? el(
              'button',
              {
                class: 'btn btn--ghost btn--sm',
                title: 'دانلود فایل اصلی',
                onclick: () => downloadFile(ex, files[0])
              },
              icon('download', 15)
            )
          : null,
        isStaff()
          ? el('button', { class: 'btn btn--ghost btn--sm', title: 'ویرایش', onclick: () => openEditModal(ex) }, icon('edit', 15))
          : null,
        isStaff()
          ? el('button', { class: 'btn btn--ghost btn--sm', title: 'فایل‌ها', onclick: () => openFilesModal(ex) }, icon('file', 15))
          : null,
        isStaff()
          ? el('button', { class: 'btn btn--ghost btn--sm', title: 'حذف', onclick: () => removeExercise(ex) }, icon('trash', 15))
          : null
      );
      // همهٔ فایل‌ها به شکل چیپ با دانلود/حذف تکی
      const fileChips = files.length === 0
        ? el('span', { class: 'exb-file' }, 'بدون فایل')
        : el(
            'div',
            { class: 'exb-files' },
            files.map((f) =>
              el(
                'span',
                { class: 'exb-file-chip' },
                icon('file', 13),
                el('span', { class: 'exb-file-chip__name', title: f.filename }, f.filename),
                el('span', { class: 'exb-file-chip__size' }, sizeLabel(f.size)),
                previewable(f)
                  ? el('button', { class: 'exb-file-chip__btn', title: 'پیش‌نمایش', onclick: () => openPreviewModal(ex, [f]) }, icon('eye', 12))
                  : null,
                el('button', { class: 'exb-file-chip__btn', title: 'دانلود', onclick: () => downloadFile(ex, f) }, icon('download', 12)),
                isStaff()
                  ? el('button', { class: 'exb-file-chip__btn exb-file-chip__btn--danger', title: 'حذف فایل', onclick: () => removeAttachment(ex, f) }, icon('trash', 12))
                  : null
              )
            )
          );
      // m143 — بندانگشتی پیش‌نمایش سربرگ کارت؛ سربرگ ستونی (عنوان، بعد نشان‌ها)
      const thumb = files.length > 0 ? buildThumb(ex, files) : null;
      return el(
        'div',
        { class: 'card exb-card' },
        thumb,
        el(
          'div',
          { class: 'exb-card__head' },
          el('b', { class: 'exb-card__title' }, ex.title),
          el('div', { class: 'exb-card__badges' },
            ownerChip(ex.createdBy),
            formatBadge(ex.format),
            publishedBadge(ex.published),
            ex.visibility === 'private' ? privateBadge() : null,
            ex.teamCreated ? teamBadge() : null)
        ),
        ex.description ? el('p', { class: 'exb-card__desc', title: ex.description }, ex.description) : null,
        // لینک بازی/تمرین آنلاین بیرونی — وکتور بازی (بدون ایموجی)
        // فقط http/https به‌صورت لینک رندر می‌شود (دفاع دوم در برابر href نامعتبر)
        safeExternalHref(ex.externalUrl)
          ? el('div', { style: { marginBottom: '6px' } },
              el('a', { class: 'exb-file-chip exb-link-chip', href: safeExternalHref(ex.externalUrl), target: '_blank', rel: 'noopener', title: safeExternalHref(ex.externalUrl) },
                icon('gamepad', 13),
                el('span', { class: 'exb-file-chip__name' }, 'باز کردن بازی/تمرین آنلاین')))
          : null,
        el(
          'div',
          { class: 'exb-card__tags' },
          ex.tags.map((t) => el('span', { class: 'badge badge--neutral' }, t.name))
        ),
        el(
          'div',
          { class: 'exb-card__meta' },
          fileChips,
          el('span', { class: 'exb-date' }, formatJalaliNumeric((ex.createdAt || '').slice(0, 10))),
          actions
        )
      );
    });

    const pager = el('div', { class: 'exb-pager' });
    if (state.page > 1) {
      pager.append(el('button', {
        class: 'btn btn--ghost btn--sm',
        onclick: () => { state.page -= 1; refresh(); }
      }, icon('chevR', 14), 'صفحهٔ قبل'));
    }
    pager.append(el('span', { class: 'exb-pager__label' }, `صفحهٔ ${fa(state.page)} از ${fa(totalPages)} — مجموع ${fa(total)} تمرین`));
    if (hasMore) {
      pager.append(el('button', {
        class: 'btn btn--ghost btn--sm',
        onclick: () => { state.page += 1; refresh(); }
      }, 'صفحهٔ بعد', icon('chevL', 14)));
    }

    body.replaceChildren(
      el('div', { class: 'exb-list' }, cards),
      pager
    );
  }

  // ─────────────── دانلود/حذف فایل و تمرین ───────────────

  /** — دانلود یک فایل مشخص از تمرین (فایل اصلی اگر file بدون id) */
  async function downloadFile(ex, file) {
    try {
      const url = file?.id
        ? `/api/exercises/${ex.id}/files/${file.id}`
        : `/api/exercises/${ex.id}/file`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('cs.token') ?? ''}` }
      });
      if (!res.ok) throw new Error('دریافت فایل ناموفق بود');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = el('a', { href: objUrl, download: file?.filename ?? ex.file?.filename ?? 'exercise' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
    } catch (err) {
      toastError(err);
    }
  }

  /** — حذف یک فایل تمرین (با تأیید) */
  async function removeAttachment(ex, file) {
    if (!file.id) {
      toast('این فایل قابل حذف مستقیم نیست — ابتدا فایل‌ها را از سرور همگام کنید', 'warning');
      return;
    }
    const ok = await confirmModal({
      title: 'حذف فایل',
      message: `فایل «${file.filename}» از تمرین «${ex.title}» حذف شود؟`,
      confirmLabel: 'حذف فایل',
      danger: true
    });
    if (!ok) return;
    try {
      await api.del(`/api/exercises/${ex.id}/files/${file.id}`);
      toast('فایل حذف شد', 'success');
      reloadAll();
    } catch (err) {
      toastError(err);
    }
  }

  // ─────────────── پیش‌نمایش درون‌برنامه‌ای (تصویر / PDF) ───────────────

  /** — همان الگوی blob دانلود (Bearer → objectURL) ولی برای نمایش؛
   * مسیر عمومی توکن‌دار خانواده‌ها اینجا هرگز استفاده نمی‌شود.
   * objectURLها هنگام بستن مودال و هنگام جابه‌جایی فایل رها می‌شوند.
   * m137: نوار «باز کردن در تب جدید» برای PDF (سافاری موبایل blob iframe را خالی نشان می‌دهد)
   * + mime از blob/پسوند هم حدس زده می‌شود + پیام خطا کد وضعیت را نشان می‌دهد. */
  function openPreviewModal(ex, files, startIdx = 0) {
    let idx = Math.min(Math.max(startIdx, 0), files.length - 1);
    let currentUrl = null;
    let seq = 0;

    const status = el('div', { class: 'exb-preview__status' });
    const pdfBar = el('div', { class: 'exb-preview__pdfbar' });
    const stage = el('div', { class: 'exb-preview__stage' });

    function dropCurrent() {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
        currentUrl = null;
      }
    }

    /** — mime قطعی: اعلامی سالم → blob.type → پسوند (آپلودها گاهی octet-stream ثبت می‌شوند) */
    function resolvedMime(f, blob) {
      const declared = String(f.mime ?? '').toLowerCase();
      const actual = String(blob.type ?? '').toLowerCase();
      let mime = declared && declared !== 'application/octet-stream' ? declared : actual;
      if (!mime || mime === 'application/octet-stream') {
        const ext = String(f.filename ?? '').split('.').pop()?.toLowerCase() ?? '';
        const guessed = EXT_MIME_FALLBACK[ext] ?? '';
        if (guessed) mime = guessed;
      }
      return mime;
    }

    async function show() {
      const my = ++seq;
      dropCurrent();
      const f = files[idx];
      stage.replaceChildren(el('span', { class: 'exb-preview__status' }, 'در حال دریافت پیش‌نمایش…'));
      pdfBar.replaceChildren();
      status.textContent = `${f.filename} — ${fa(idx + 1)} از ${fa(files.length)}`;
      try {
        const url = f.id
          ? `/api/exercises/${ex.id}/files/${f.id}`
          : `/api/exercises/${ex.id}/file`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${localStorage.getItem('cs.token') ?? ''}` }
        });
        if (!res.ok) throw new Error(`دریافت فایل ناموفق بود (کد ${fa(res.status)})`);
        const blob = await res.blob();
        if (my !== seq) return; // پاسخ کهنه — کاربر فایل دیگری را باز کرده
        const objUrl = URL.createObjectURL(blob);
        const mime = resolvedMime(f, blob);
        if (mime === 'application/pdf') {
          currentUrl = objUrl;
          stage.replaceChildren(el('iframe', { class: 'exb-preview__frame', src: objUrl, title: f.filename }));
          // — جانشین PDF: بعضی مرورگرها (سافاری موبایل) blob iframe را خالی نشان می‌دهند
          pdfBar.replaceChildren(
            el('span', { class: 'cell-sub' }, 'PDF نمایش داده نمی‌شود؟'),
            el('button', {
              class: 'btn btn--ghost btn--sm',
              onclick: () => window.open(objUrl, '_blank', 'noopener')
            }, icon('download', 14), 'باز کردن در تب جدید')
          );
        } else if (mime.startsWith('image/')) {
          currentUrl = objUrl;
          stage.replaceChildren(el('img', { class: 'exb-preview__img', src: objUrl, alt: f.filename }));
        } else {
          URL.revokeObjectURL(objUrl);
          stage.replaceChildren(el('span', { class: 'exb-preview__status' }, 'پیش‌نمایش این نوع فایل ممکن نیست — از دکمهٔ دانلود استفاده کنید'));
        }
      } catch (err) {
        if (my !== seq) return;
        stage.replaceChildren(el('span', { class: 'exb-preview__status' }, 'دریافت پیش‌نمایش ناموفق بود'));
        status.textContent = '';
        toastError(err);
      }
    }

    const prevBtn = files.length > 1
      ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { idx = (idx - 1 + files.length) % files.length; show(); } }, icon('chevR', 14), 'قبلی')
      : null;
    const nextBtn = files.length > 1
      ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { idx = (idx + 1) % files.length; show(); } }, 'بعدی', icon('chevL', 14))
      : null;

    // m143 — ناوبری کلیدی چپ/راست در پیش‌نمایش چندفایلی
    const onKeyNav = (e) => {
      if (!files.length || files.length < 2) return;
      if (e.key === 'ArrowLeft') { idx = (idx + 1) % files.length; show(); } // RTL: چپ = بعدی
      else if (e.key === 'ArrowRight') { idx = (idx - 1 + files.length) % files.length; show(); }
    };
    if (files.length > 1) document.addEventListener('keydown', onKeyNav);

    openModal({
      title: `پیش‌نمایش «${ex.title}»`,
      wide: true,
      body: el(
        'div',
        { class: 'exb-preview' },
        status,
        pdfBar,
        stage,
        files.length > 1 ? el('div', { class: 'exb-preview__nav' }, prevBtn, nextBtn) : null
      ),
      actions: [
        // m143 — دانلود/تب جدید همیشه در دسترس (نه فقط برای PDF مشکل‌دار)
        () => el('button', { class: 'btn btn--ghost', onclick: () => downloadFile(ex, files[idx]) }, icon('download', 15), 'دانلود'),
        () => el('button', {
          class: 'btn btn--ghost',
          title: 'باز کردن فایل فعلی در تب جدید',
          onclick: () => { if (currentUrl) window.open(currentUrl, '_blank', 'noopener'); else toast('فایل هنوز بارگذاری نشده است', 'warning'); }
        }, icon('link', 15), 'تب جدید'),
        (close) => el('button', { class: 'btn btn--primary', onclick: close }, 'بستن')
      ],
      onClose: () => {
        seq += 1; // واکنش‌های در جریه بی‌اثر می‌شوند
        document.removeEventListener('keydown', onKeyNav);
        dropCurrent();
      }
    });
    show();
  }

  // ─────────────── ساخت تمرین (درگ‌اند‌دراپ چندفایلی) ───────────────

  function openCreateModal() {
    const picked = [];
    const selected = new Set();

    const title = el('input', { class: 'input', maxlength: 150, placeholder: 'مثلاً تمرین حروف نقطه‌دار — پایه دوم' });
    const desc = el('textarea', { class: 'textarea', rows: 3, maxlength: 2000, placeholder: 'راهنمای اجرا برای خانواده (اختیاری — در پیام بات هم می‌آید)' });
    // لینک بازی/تمرین آنلاین بیرونی (سرویس خارجی)
    const link = el('input', { class: 'input', dir: 'ltr', maxlength: 500, placeholder: 'https://example.com/game — لینک بازی/تمرین آنلاین (اختیاری)' });
    const fmt = el(
      'select',
      { class: 'select' },
      el('option', { value: 'worksheet' }, 'کاربرگ'),
      el('option', { value: 'game' }, 'بازی'),
      el('option', { value: 'instruction' }, 'دستورالعمل خانه')
    );
    // — دید (m136): خصوصی = فقط سازنده و مدیر در بانک/انتخابگر می‌بینند
    const visSel = el(
      'select',
      { class: 'select' },
      el('option', { value: 'public', selected: 'selected' }, 'عمومی — همهٔ همکاران'),
      el('option', { value: 'private' }, 'خصوصی — فقط من و مدیر')
    );
    // — تمرین تیمی: در تابلوی پیشرفت نصف امتیاز
    const teamChk = el('input', { type: 'checkbox' });
    // — سازندهٔ تمرین (m138): پیش‌فرض حسابِ واردشده؛ برای دستگاه/نشست مشترک قابل اصلاح
    //    ریشهٔ باگ «امتیاز به نام نفر دیگر»: کار با حساب همکار روی دستگاه مشترک (توکن ۳۰روزه)
    const myStaffId = session.user?.staffId ?? '';
    const activeStaff = staffList.filter((s) => s.active === undefined || s.active === 1 || s.active === true);
    const ownerSel = activeStaff.length > 0
      ? el(
          'select',
          { class: 'select' },
          ...activeStaff.map((s) => el('option', { value: s.id, selected: s.id === myStaffId ? 'selected' : undefined }, s.fullName))
        )
      : el('select', { class: 'select' }, el('option', { value: myStaffId, selected: 'selected' }, session.user?.displayName ?? '—'));
    const tagPicker = buildTagPicker(tags, selected);

    let chips = null;
    const dropzoneWrap = buildDropzone((list) => {
      for (const file of list) {
        try {
          validateLocalFile(file);
        } catch (err) {
          toastError(err);
          continue;
        }
        if (picked.length >= LIMITS.maxFilesPerUpload) {
          toast(`حداکثر ${fa(LIMITS.maxFilesPerUpload)} فایل در هر بار بارگذاری`, 'warning');
          break;
        }
        picked.push(file);
      }
      if (picked.length > 0 && !title.value.trim()) {
        title.value = (picked[0].name || '').replace(/\.[^.]+$/, '');
      }
      chips.refresh();
    });
    chips = buildPickedChips(picked);
    dropzoneWrap.append(chips);
    const progressLine = el('div', { class: 'exb-progress', style: { display: 'none' } });
    dropzoneWrap.append(progressLine);

    // m143 — ترتیب UX: عنوان ← فایل‌ها ← قالب/دید ← امتیاز/سازنده ← لینک ← توضیح/برچسب
    const bodyEl = el(
      'div',
      { class: 'form-grid' },
      el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'عنوان تمرین', el('span', { class: 'req' }, ' *')), title,
        el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, 'اگر خالی بماند، از نام اولین فایل پر می‌شود')),
      el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'فایل‌های تمرین (اختیاری — تصویر/PDF/سند، حداکثر ۱۰ فایل)'), dropzoneWrap),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'قالب'), fmt),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'دید'), visSel,
        el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, 'خصوصی: در بانک و انتخابگر فقط شما و مدیر می‌بینید؛ بات/خانواده هرگز')),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'امتیازسازی'),
        el('label', { class: 'exb-check' }, teamChk, el('span', {}, 'ساختهٔ تیمی — امتیاز نصف'))),
      // — سازندهٔ تمرین (m138): فشرده شد ولی سرِ جای خودش ماند (ریشهٔ باگ امتیاز به نام دیگری)
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'سازندهٔ تمرین — امتیاز به نام او'), ownerSel,
        el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, 'روی دستگاه مشترک، نام واقعی سازنده را انتخاب کنید')),
      el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'لینک بازی/تمرین آنلاین (اختیاری)'), link,
        el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, 'در پیام بلهٔ خانواده و پروفایل با دکمهٔ بازی باز می‌شود')),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'توضیح برای خانواده (اختیاری)'), desc),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'برچسب‌ها (پایه، اختلال، …)'), tagPicker)
    );

    // m143 — دکمهٔ ذخیره در حین ثبت قفل می‌شود (جلوگیری از تمرین تکراری با دابل‌کلیک)
    const saveBtn = el('button', { class: 'btn btn--primary', type: 'button', onclick: onSave }, 'افزودن به بانک');
    async function onSave() {
      if (saveBtn.disabled) return;
      if (title.value.trim().length < 2) {
        toast('عنوان تمرین حداقل ۲ نویسه است', 'warning');
        title.focus();
        return;
      }
      saveBtn.disabled = true;
      try {
        // تمرین اول ثبت می‌شود؛ فایل‌ها با multipart باینری می‌روند
        const created = await api.post('/api/exercises', {
          title: title.value.trim(),
          description: desc.value.trim() || null,
          format: fmt.value,
          external_url: link.value.trim() || null,
          tag_ids: [...selected],
          published: true,
          visibility: visSel.value,
          team_created: teamChk.checked,
          owner_staff_id: ownerSel.value || null
        });
        const newId = created?.data?.id;
        if (picked.length > 0 && newId) {
          try {
            progressLine.style.display = '';
            await uploadFiles(newId, picked, (i, tot, name, pct) => {
              progressLine.textContent = `در حال بارگذاری ${fa(i)} از ${fa(tot)} — ${name} (${fa(pct)}٪)`;
            });
          } catch (err) {
            toastError(new Error(`تمرین ثبت شد اما بارگذاری فایل‌ها ناموفق بود — از دکمهٔ «فایل‌ها» دوباره تلاش کنید (${err.message})`));
          }
        }
        toast('تمرین به بانک اضافه شد', 'success');
        close();
        state.page = 1;
        reloadAll();
      } catch (err) {
        toastError(err);
      } finally {
        saveBtn.disabled = false;
      }
    }

    openModal({
      title: 'تمرین جدید',
      body: bodyEl,
      wide: true,
      actions: [
        (close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'انصراف'),
        () => saveBtn
      ]
    });
  }

  // ─────────────── ویرایش تمرین ───────────────

  function openEditModal(ex) {
    const selected = new Set(ex.tags.map((t) => t.id));
    const title = el('input', { class: 'input', maxlength: 150, value: ex.title });
    const desc = el('textarea', { class: 'textarea', rows: 3, maxlength: 2000 }, ex.description ?? '');
    // لینک بازی/تمرین آنلاین بیرونی
    const link = el('input', { class: 'input', dir: 'ltr', maxlength: 500, placeholder: 'https://example.com/game — اختیاری', value: ex.externalUrl ?? '' });
    const fmt = el(
      'select',
      { class: 'select' },
      ...Object.entries(FORMAT_LABELS).map(([value, label]) =>
        el('option', { value, selected: ex.format === value }, label)
      )
    );
    const pub = el(
      'select',
      { class: 'select' },
      el('option', { value: '1', selected: ex.published ? 'selected' : undefined }, 'منتشرشده — در بات دیده می‌شود'),
      el('option', { value: '0', selected: !ex.published ? 'selected' : undefined }, 'پیش‌نویس — فقط پنل')
    );
    // — دید/تیم (m136): قابل ویرایش فقط توسط سازنده یا مدیر
    const canOwn = ex.createdBy === session.user?.staffId || session.user?.role === 'manager';
    const visSel = el(
      'select',
      { class: 'select' },
      el('option', { value: 'public', selected: ex.visibility !== 'private' ? 'selected' : undefined }, 'عمومی — همهٔ همکاران'),
      el('option', { value: 'private', selected: ex.visibility === 'private' ? 'selected' : undefined }, 'خصوصی — فقط من و مدیر')
    );
    const teamChk = el('input', { type: 'checkbox' });
    if (ex.teamCreated) teamChk.checked = true;
    // — سازنده (m140): در ویرایش فقط «نمایشِ فقط-خواندنی» است؛ انتخابگر سازنده حذف شد.
    //   ریشهٔ باگ بازگشت انتساب (۱۳:۴۱ و ۱۴:۲۵ روز ۲۰ اکتبر): فرم ویرایش owner_staff_id
    //   از-پیش-پرشدهٔ ردیف را در هر ذخیره دوباره می‌فرستاد — حتی با پیش‌فرض m139،
    //   کشِ کهنهٔ JS روی مرورگر مدیر همان بازگشت را تکرار کرد. حالا:
    //   ۱) مالکیت دیگر از مسیر ویرایش تغییر نمی‌کند (سرور هم این کلیدها را از PATCH می‌ریزد)
    //   ۲) انتقال فقط با اکشن صریح مدیر روی POST /api/exercises/:id/reassign انجام می‌شود
    const isManager = session.user?.role === 'manager';
    const currentOwnerName = staffList.find((s) => s.id === ex.createdBy)?.fullName ?? 'نامشخص';
    const creatorChip = el(
      'span',
      { class: `staff-chip exb-owner ${hueClass(ex.createdBy)}`, title: `سازندهٔ فعلی: ${currentOwnerName}` },
      hueDot(ex.createdBy, 9),
      `سازندهٔ فعلی: ${currentOwnerName}`
    );
    // — انتقال مالکیت (فقط مدیر): دکمهٔ کوچک + پنل تأیید درون‌مودالی (بدون مودال تودرتو)
    let closeEdit = null;
    let reassignToggle = null;
    let reassignPanel = null;
    if (isManager) {
      const targets = staffList.filter(
        (s) => s.id !== ex.createdBy && (s.active === undefined || s.active === 1 || s.active === true)
      );
      const reSel = el(
        'select',
        { class: 'select' },
        ...targets.map((s) => el('option', { value: s.id }, s.fullName))
      );
      const reReason = el('input', {
        class: 'input',
        maxlength: 200,
        placeholder: 'دلیل انتقال (اختیاری — در تاریخ حسابرسی ثبت می‌شود)'
      });
      const reConfirm = el('button', { class: 'btn btn--primary btn--sm', type: 'button' }, 'ثبت انتقال مالکیت');
      reConfirm.addEventListener('click', async () => {
        if (!reSel.value) {
          toast('اول همکار مقصد را انتخاب کنید', 'warning');
          reSel.focus();
          return;
        }
        reConfirm.disabled = true;
        try {
          const res = await api.post(`/api/exercises/${ex.id}/reassign`, {
            staffId: reSel.value,
            reason: reReason.value.trim() || undefined
          });
          if (res?.unchanged === true) {
            // سرور: سازندهٔ فعلی همان مقصد است — هیچ تغییری نکرد
            toast('سازندهٔ تمرین از قبل همین شخص است', 'info');
            reassignPanel.hidden = true;
            return;
          }
          toast(`مالکیت تمرین به ${staffNames.get(reSel.value) ?? reSel.value} منتقل شد`, 'success');
          closeEdit?.();
          reloadAll();
        } catch (err) {
          // ۴۰۳ (غیرمدیر) / ۴۰۴ (تمرین یا همکار ناموجود) / خطای دیگر — پیام سرور نمایش داده می‌شود
          toastError(err);
        } finally {
          reConfirm.disabled = false;
        }
      });
      reassignToggle = el(
        'button',
        {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          'aria-expanded': 'false',
          onclick: () => {
            const willOpen = reassignPanel.hidden;
            reassignPanel.hidden = !willOpen;
            reassignToggle.setAttribute('aria-expanded', String(willOpen));
            if (willOpen && reSel.value === '') reSel.focus();
          }
        },
        icon('users', 14),
        'انتقال مالکیت به همکار…'
      );
      reassignPanel = el(
        'div',
        { class: 'exb-reassign', hidden: true },
        targets.length > 0
          ? [
              el(
                'div',
                { class: 'exb-reassign__row' },
                el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'همکار مقصد'), reSel),
                el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'دلیل (اختیاری)'), reReason)
              ),
              el(
                'div',
                { class: 'exb-reassign__act' },
                reConfirm,
                el('span', { class: 'cell-sub' }, 'امتیاز تولید محتوا از این پس به نام همکار مقصد ثبت می‌شود')
              )
            ]
          : [el('span', { class: 'cell-sub' }, 'همکار فعالی برای انتقال مالکیت وجود ندارد')]
      );
    }
    const tagPicker = buildTagPicker(tags, selected);

    const bodyEl = el(
      'div',
      { class: 'form-grid' },
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'عنوان تمرین', el('span', { class: 'req' }, ' *')), title),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'قالب'), fmt),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'انتشار'), pub),
      canOwn ? el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'دید'), visSel) : null,
      canOwn ? el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'امتیازسازی'),
        el('label', { class: 'exb-check' }, teamChk, el('span', {}, 'ساختهٔ تیمی — امتیاز نصف'))) : null,
      // — سازندهٔ فعلی (m140): فقط نمایش + دکمهٔ انتقال مالکیت برای مدیر
      el('div', { class: 'field span-2' },
        el('label', { class: 'field__label' }, 'سازندهٔ تمرین'),
        el('div', { class: 'exb-ownerfield__row' }, creatorChip, reassignToggle),
        reassignPanel,
        el('div', { class: 'cell-sub', style: { marginTop: '4px' } },
          `امتیاز تولید محتوا به نام ${currentOwnerName} ثبت می‌شود — ویرایش عادی مالکیت را تغییر نمی‌دهد`)),
      el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'لینک بازی/تمرین آنلاین (اختیاری)'), link,
        el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, 'لینک بازی روی سرویس بیرونی — در پیام بلهٔ خانواده و پروفایل با دکمهٔ بازی باز می‌شود — برای خالی‌کردن، خالی بگذارید')),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'توضیح برای خانواده'), desc),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'برچسب‌ها'), tagPicker)
    );

    openModal({
      title: 'ویرایش تمرین',
      // — body به‌صورت تابع: close مودال برای بستنِ پس از انتقال موفق مالکیت نگه داشته می‌شود
      body: (close) => { closeEdit = close; return bodyEl; },
      wide: true,
      actions: [
        (close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'انصراف'),
        (close) =>
          el(
            'button',
            {
              class: 'btn btn--primary',
              onclick: async (e) => {
                const saveBtn = e.currentTarget;
                if (title.value.trim().length < 2) {
                  toast('عنوان تمرین حداقل ۲ نویسه است', 'warning');
                  title.focus();
                  return;
                }
                if (saveBtn.disabled) return;
                saveBtn.disabled = true;
                try {
                  const patch = {
                    title: title.value.trim(),
                    description: desc.value.trim() || null,
                    format: fmt.value,
                    external_url: link.value.trim() || null,
                    published: pub.value === '1',
                    tag_ids: [...selected]
                  };
                  // دید/تیم فقط سازنده یا مدیر — سرور هم گارد دارد
                  if (canOwn) {
                    patch.visibility = visSel.value;
                    patch.team_created = teamChk.checked;
                  }
                  // m140: هیچ کلید مالکیت‌حمل (owner_staff_id/created_by) در PATCH فرستاده نمی‌شود —
                  // مالکیت فقط با POST /api/exercises/:id/reassign تغییر می‌کند
                  await api.patch(`/api/exercises/${ex.id}`, patch);
                  toast('تمرین به‌روزرسانی شد', 'success');
                  close();
                  reloadAll();
                } catch (err) {
                  toastError(err);
                } finally {
                  saveBtn.disabled = false;
                }
              }
            },
            'ذخیره'
          )
      ]
    });
  }

  // ─────────────── مدیریت فایل‌های تمرین (افزودن چندفایلی + حذف) ───────────────

  function openFilesModal(ex) {
    const picked = [];
    const currentFiles = Array.isArray(ex.files) && ex.files.length > 0
      ? [...ex.files]
      : ex.file
        ? [{ id: '', filename: ex.file.filename, mime: ex.file.mime, size: ex.file.size }]
        : [];
    let chips = null;
    let listWrap = null;

    function drawList() {
      listWrap.replaceChildren(
        currentFiles.length === 0
          ? el('span', { class: 'exb-file' }, 'هنوز فایلی ندارد')
          : el(
              'div',
              { class: 'exb-files' },
              currentFiles.map((f) =>
                el(
                  'span',
                  { class: 'exb-file-chip' },
                  icon('file', 13),
                  el('span', { class: 'exb-file-chip__name', title: f.filename }, f.filename),
                  el('span', { class: 'exb-file-chip__size' }, sizeLabel(f.size)),
                  previewable(f)
                    ? el('button', { class: 'exb-file-chip__btn', title: 'پیش‌نمایش', onclick: () => openPreviewModal(ex, [f]) }, icon('eye', 12))
                    : null,
                  el('button', { class: 'exb-file-chip__btn', title: 'دانلود', onclick: () => downloadFile(ex, f) }, icon('download', 12)),
                  f.id
                    ? el('button', {
                        class: 'exb-file-chip__btn exb-file-chip__btn--danger',
                        title: 'حذف فایل',
                        onclick: async () => {
                          const ok = await confirmModal({
                            title: 'حذف فایل',
                            message: `فایل «${f.filename}» حذف شود؟`,
                            confirmLabel: 'حذف فایل',
                            danger: true
                          });
                          if (!ok) return;
                          try {
                            await api.del(`/api/exercises/${ex.id}/files/${f.id}`);
                            currentFiles.splice(currentFiles.indexOf(f), 1);
                            drawList();
                            toast('فایل حذف شد', 'success');
                            reloadAll();
                          } catch (err) {
                            toastError(err);
                          }
                        }
                      }, icon('trash', 12))
                    : null
                )
              )
            )
      );
    }

    const dropzoneWrap = buildDropzone((list) => {
      for (const file of list) {
        try {
          validateLocalFile(file);
        } catch (err) {
          toastError(err);
          continue;
        }
        if (picked.length >= LIMITS.maxFilesPerUpload) {
          toast(`حداکثر ${fa(LIMITS.maxFilesPerUpload)} فایل در هر بار بارگذاری`, 'warning');
          break;
        }
        picked.push(file);
      }
      chips.refresh();
    });
    chips = buildPickedChips(picked);
    dropzoneWrap.append(chips);
    const progressLine = el('div', { class: 'exb-progress', style: { display: 'none' } });
    dropzoneWrap.append(progressLine);
    listWrap = el('div', {});
    drawList();

    openModal({
      title: `فایل‌های «${ex.title}»`,
      body: el(
        'div',
        { class: 'form-grid' },
        el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'فایل‌های فعلی'), listWrap),
        el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'افزودن فایل (چند فایل همزمان)'), dropzoneWrap)
      ),
      actions: [
        (close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'بستن'),
        (close) =>
          el(
            'button',
            {
              class: 'btn btn--primary',
              onclick: async () => {
                if (picked.length === 0) {
                  toast('اول فایل انتخاب کنید', 'warning');
                  return;
                }
                try {
                  progressLine.style.display = '';
                  await uploadFiles(ex.id, picked, (i, tot, name, pct) => {
                    progressLine.textContent = `در حال بارگذاری ${fa(i)} از ${fa(tot)} — ${name} (${fa(pct)}٪)`;
                  });
                  toast('فایل‌ها اضافه شد', 'success');
                  close();
                  reloadAll();
                } catch (err) {
                  toastError(err);
                }
              }
            },
            'بارگذاری فایل‌ها'
          )
      ]
    });
  }

  // ─────────────── حذف نرم ───────────────

  async function removeExercise(ex) {
    const ok = await confirmModal({
      title: 'حذف تمرین',
      message: `«${ex.title}» از بانک حذف شود؟ حذف نرم است و تکلیف‌های ارسال‌شده سر جایشان می‌مانند.`,
      confirmLabel: 'حذف',
      danger: true
    });
    if (!ok) return;
    try {
      await api.del(`/api/exercises/${ex.id}`);
      toast('تمرین حذف شد', 'success');
      reloadAll();
    } catch (err) {
      toastError(err);
    }
  }

  // ─────────────── راه‌اندازی ───────────────

  function drawToolbar() {
    const newBtn = isStaff()
      ? el('button', { class: 'btn btn--primary', onclick: openCreateModal }, icon('plus', 18), 'تمرین جدید')
      : null;
    toolbar.replaceChildren(
      el(
        'div',
        { class: 'page-head__title' },
        'بانک تمرین',
        newBtn ? el('div', { style: { marginRight: 'auto' } }, newBtn) : null
      ),
      el(
        'div',
        { class: 'page-head__desc' },
        `ابتدا دستهٔ اختلال را انتخاب کنید، بعد پایه و جستجو — برای ارسال، از پروفایل دانش‌آموز «ارسال تمرین با بله» (ذخیره: ${storage === 'r2' ? 'R2' : 'D1'})`
      )
    );
  }

  loadMeta().then(async () => {
    await loadStaff();
    drawToolbar();
    drawNav();
    refresh();
  });
}
