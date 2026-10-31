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
import { buildTaxonomyPicker } from '../taxonomy.js'; // درخت واحد طبقه‌بندی (یک کامپوننت برای منو/فرم/پیکر)

// «کارت‌های آماده»: ریبرند بانک تمرین — هر رکورد یک کارت آمادهٔ طرح درمان است
// حلقهٔ تکلیف (ارسال به خانواده با بله + بازگشت نتیجه) دست‌نخورده می‌ماند؛ روت #/exercises برای پایداری لینک‌ها عوض نشده
const LIMITS = {
  maxFileBytes: 50 * 1024 * 1024,
  maxFilesPerUpload: 10
};
const EXT_MIME_FALLBACK = {
  mp4: 'video/mp4', m4v: 'video/x-m4v', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', mkv: 'video/x-matroska', '3gp': 'video/3gpp', wmv: 'video/x-ms-wmv',
  mpeg: 'video/mpeg', mpg: 'video/mpeg',
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', html: 'text/html',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
// برچسب هر رکورد = نوع کارت جلسه در طرح درمان (homework = تکلیف، additive)
const FORMAT_LABELS = { worksheet: 'تمرین', homework: 'تکلیف', game: 'بازی', instruction: 'دستورالعمل', family: 'آموزش خانواده' };
const FORMAT_ICONS = { worksheet: 'file', homework: 'checklist', game: 'gamepad', instruction: 'board', family: 'heart' };
const PAGE_SIZE = 18;

// /درخت واحد طبقه‌بندی (چهار ستون) از meta.taxonomyTree — یک زبان برای منو/فرم/پیکر
// کلیدهای legacy (focusTree/disorderTree) از payload حذف شدند؛ هیچ‌جا خوانده نمی‌شوند
let TAX_TREE = [];
const TAX_LABELS = new Map(); // کلید ستون/حوزه/برگ → برچسب فارسی (بج هدف روی کارت‌ها)
const TAX_ICONS = new Map();
const TAX_KEY_PILLAR = new Map(); // کلید حوزه/برگ ستون برچسبی → کلید ستون (تفکیک disorder/grade برای فیلتر)

function setTaxonomyTree(tree) {
  TAX_TREE = Array.isArray(tree) ? tree : [];
  TAX_LABELS.clear();
  TAX_ICONS.clear();
  TAX_KEY_PILLAR.clear();
  for (const px of TAX_TREE) {
    TAX_LABELS.set(px.key, px.fa);
    TAX_ICONS.set(px.key, px.icon ?? 'target');
    for (const d of px.domains ?? []) {
      TAX_LABELS.set(d.key, d.fa);
      TAX_ICONS.set(d.key, d.icon ?? 'target');
      if (px.source === 'tag') TAX_KEY_PILLAR.set(d.key, px.key);
      for (const lf of d.leaves ?? []) {
        TAX_LABELS.set(lf.key, lf.fa);
        TAX_ICONS.set(lf.key, d.icon ?? 'target');
        if (px.source === 'tag') TAX_KEY_PILLAR.set(lf.key, px.key);
      }
    }
  }
}

const DEFAULT_EXERCISE_TAGS = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000301', name: 'فارسی' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000302', name: 'ریاضی' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000303', name: 'دیکته' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000304', name: 'روخوانی' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000305', name: 'درک مطلب' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000306', name: 'نوشتن' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000307', name: 'دقت و تمرکز' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000308', name: 'حافظهٔ فعال' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000309', name: 'هماهنگی حرکتی' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000310', name: 'تنظیم رفتار' }
];

const MAX_CARD_FILES = 3;

function isStaff() {
  return Boolean(session.user && ['manager', 'therapist', 'secretary'].includes(session.user.role));
}

let staffList = [];
const staffNames = new Map();

async function loadStaff() {
  try {
    const res = await api.get('/api/staff');
    staffList = Array.isArray(res.data) ? res.data : res.data?.items ?? [];
    staffNames.clear();
    for (const s of staffList) staffNames.set(s.id, s.fullName);
  } catch {
  }
}

function ownerChip(createdBy) {
  const name = createdBy ? staffNames.get(createdBy) : null;
  if (!name) return null;
  return el(
    'span',
    { class: `staff-chip exb-owner ${hueClass(createdBy)}`, title: `سازندهٔ کارت: ${name}` },
    hueDot(createdBy, 9),
    `سازنده: ${name}`
  );
}

function privateBadge() {
  return el('span', { class: 'badge badge--warning' }, 'خصوصی');
}

function coCreatorChip(coId) {
  const name = coId ? staffNames.get(coId) : null;
  if (!name) return null;
  return el(
    'span',
    { class: `staff-chip exb-owner ${hueClass(coId)}`, title: 'هم‌ساز تمرین — امتیاز تولید محتوا نصف می‌شود' },
    hueDot(coId, 9),
    `هم‌ساز: ${name}`
  );
}

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

function localMime(file) {
  const t = (file.type || '').toLowerCase();
  if (t && t !== 'application/octet-stream') return t;
  const ext = (file.name || '').split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME_FALLBACK[ext] ?? t ?? 'application/octet-stream';
}

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
            'aria-label': 'حذف از انتخاب', /* S6-13 */
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

function buildDropzone(onFiles) {
  const input = el('input', { type: 'file', multiple: true, 'aria-label': 'انتخاب فایل‌های تمرین', style: { display: 'none' } }); /* S6-17 */
  const hint = LIMITS.maxFileBytes >= 1024 * 1024
    ? `${fa(Math.round(LIMITS.maxFileBytes / (1024 * 1024)))} مگابایت`
    : `${fa(Math.round(LIMITS.maxFileBytes / 1024))} کیلوبایت`;
  const openPicker = () => input.click();
  const zone = el(
    'button',
    { class: 'exb-drop', type: 'button', 'aria-label': `افزودن فایل تمرین — یا رهاکردن فایل — تا ${hint}` } /* S6-17: دکمهٔ واقعی = کیبوردپذیر */
  );
  zone.append(
    el('span', {}, icon('upload', 22)),
    el('b', {}, 'فایل‌های تمرین را اینجا رها کنید'),
    el('span', { class: 'exb-drop__hint' }, `یا کلیک کنید — PDF، تصویر، ویدیو، Word، Excel، HTML — هر فایل تا ${hint} — چند فایل همزمان`)
  );
  zone.addEventListener('click', openPicker);
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

// ردیف «برچسب دلخواه» فرم: دادهٔ آزاد جستجو (پیش‌فرض/سفارشی) — عضو درخت واحد نیست
// (اختصال و پایه تحصیلی از در ستون‌های درخت واحد انتخاب می‌شوند؛ اینجا دیگر تکرار نمی‌شوند)
function buildFreeTagPicker(tags, selected) {
  const wrap = el('div', { class: 'exb-tags' });
  const allCustom = [...(tags.other ?? [])];
  const defaults = DEFAULT_EXERCISE_TAGS
    .map((d) => allCustom.find((t) => t.id === d.id || t.name === d.name))
    .filter(Boolean);
  const defaultIds = new Set(defaults.map((t) => t.id));
  const treeTagIds = new Set([...(tags.disorder ?? []), ...(tags.grade ?? [])].map((t) => t.id)); // در درخت رندر می‌شوند
  const byId = new Map(
    [...(tags.disorder ?? []), ...(tags.grade ?? []), ...(tags.other ?? [])].map((t) => [t.id, t])
  );
  const strayTags = () =>
    [...selected]
      .map((id) => byId.get(id))
      .filter((t) => t && !defaultIds.has(t.id) && !treeTagIds.has(t.id) && !allCustom.some((c) => c.id === t.id));

  function chipOf(t) {
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
    return chip;
  }

  function draw() {
    wrap.replaceChildren();
    const groups = [
      { label: 'پیش‌فرض', list: defaults },
      { label: 'سفارشی', list: allCustom.filter((t) => !defaultIds.has(t.id)) },
      { label: 'سایر — از قبل روی این کارت', list: strayTags() }
    ];
    for (const g of groups) {
      if (g.list.length === 0) continue;
      wrap.append(el('div', { class: 'exb-tags__label' }, g.label));
      const row = el('div', { class: 'exb-tags__row' });
      for (const t of g.list) row.append(chipOf(t));
      wrap.append(row);
    }
    if (isStaff()) {
      const nameInput = el('input', { class: 'input', placeholder: 'نام برچسب دلخواه…', maxlength: '60' });
      const addBtn = el('button', { type: 'button', class: 'btn btn--soft btn--sm' }, icon('plus', 14), 'افزودن');
      addBtn.addEventListener('click', async () => {
        const name = nameInput.value.replace(/\s+/g, ' ').trim();
        if (name.length < 2) {
          toast('نام برچسب حداقل ۲ نویسه است', 'warning');
          nameInput.focus();
          return;
        }
        addBtn.disabled = true;
        try {
          const res = await api.post('/api/tags', { name, category: 'custom' });
          const tag = res.data;
          if (tag && !allCustom.some((t) => t.id === tag.id)) allCustom.push(tag);
          if (tag) selected.add(tag.id);
          nameInput.value = '';
          draw();
          toast('برچسب ساخته شد و انتخاب شد', 'success');
        } catch (err) {
          toastError(err);
        } finally {
          addBtn.disabled = false;
        }
      });
      wrap.append(el('div', { class: 'exb-tags__label' }, 'برچسب دلخواه (برای شما و هم‌ساز)'));
      wrap.append(el('div', { class: 'exb-tags__row' }, nameInput, addBtn));
    }
  }
  draw();
  return wrap;
}

// ─── /اجزای فرم مشترک: بخش‌بندی و درخت واحد طبقه‌بندی ───

// سربرگ بخش‌بندی‌شدهٔ فرم — شمارهٔ فارسی + توضیح کوتاه
function formSection(num, title, sub, fields) {
  return el(
    'div',
    { class: 'exb-formsec' },
    el(
      'div',
      { class: 'exb-formsec__head' },
      el('span', { class: 'exb-formsec__num' }, fa(num)),
      el(
        'div',
        { class: 'exb-formsec__titles' },
        el('b', { class: 'exb-formsec__title' }, title),
        el('div', { class: 'cell-sub' }, sub)
      )
    ),
    el('div', { class: 'form-grid' }, ...fields)
  );
}

// انتخابگر درختی هدف از در ماژول مشترک taxonomy.js است — buildFocusPicker حذف شد

export function renderExercises(container) {
  const toolbar = el('div', { class: 'page-head' });
  const nav = el('div', { class: 'exb-nav' });
  const body = el('div', { class: 'exb-body' });
  container.replaceChildren(toolbar, nav, body);

  let tags = { disorder: [], grade: [], other: [] };
  let storage = 'd1';
  let facets = { counts: {}, total: 0 };
  let focusFacets = {}; // شمارندهٔ کلیدهای درخت هدف
  let disFacets = {}; // شمارندهٔ خانواده‌های اختلال
  let gradeFacets = {}; // شمارندهٔ دوره‌های پایه تحصیلی
  // فیلترهای درخت واحد: کلیدهای هدف (info/exec) + شناسه/کلید برچسب‌های اختلال و پایه (ستون برچسبی)
  const state = { format: '', q: '', published: 'all', page: 1, focus: [], disorders: [], grades: [] };
  const menuFocusSel = new Set(); // انتخاب زندهٔ ستون‌های علمی — با state.focus همگام می‌ماند
  const menuTagSel = new Set(); // انتخاب زندهٔ ستون‌های برچسبی — با state.disorders/grades همگام می‌ماند
  let taxPicker = null; // نمونهٔ کامپوننت مشترک taxonomy.js — ماندگار در طول عمر نما
  let items = [];
  let total = 0;
  let hasMore = false;

  async function loadMeta() {
    try {
      const res = await api.get('/api/exercises/meta');
      tags = res.data?.categories ?? tags;
      storage = res.data?.storage ?? 'd1';
      if (res.data?.facets) facets = res.data.facets;
      if (res.data?.focusFacets) focusFacets = res.data.focusFacets;
      if (res.data?.disorderFacets) disFacets = res.data.disorderFacets;
      if (res.data?.gradeFacets) gradeFacets = res.data.gradeFacets; // 
      if (res.data?.taxonomyTree) setTaxonomyTree(res.data.taxonomyTree); // درخت واحد (منو/فرم/پیکر)
      if (res.data?.limits) {
        if (Number.isFinite(res.data.limits.maxFileBytes)) LIMITS.maxFileBytes = res.data.limits.maxFileBytes;
        if (Number.isFinite(res.data.limits.maxFilesPerUpload)) LIMITS.maxFilesPerUpload = res.data.limits.maxFilesPerUpload;
      }
    } catch {
    }
  }

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
      if (state.format) qs.set('format', state.format); // فیلتر نوع کارت (سرویس از آماده است)
      if (state.focus.length > 0) qs.set('focus', state.focus.join(',')); // فیلتر هدفمند
      if (state.disorders.length > 0) qs.set('disorder', state.disorders.join(',')); // ستون اختلال‌ها
      if (state.grades.length > 0) qs.set('grade', state.grades.join(',')); // ستون پایه تحصیلی
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

  async function reloadAll() {
    await loadMeta();
    computeCounts(); // شمارنده‌های تازه — تب/حوزه/چیپ بازرسم می‌شوند
    taxPicker?.refresh();
    await refresh();
  }

  // ─── ناوبری کتابخانه با درخت واحد: همان کامپوننت taxonomy.js برای چهار ستون ───

  // شمارندهٔ کارت هر گره از facets سرور — حوزهٔ ستون علمی = خودش + برگ‌ها؛ حوزهٔ ستون برچسبی = شمارندهٔ distinct
  const NODE_COUNTS = new Map();
  function computeCounts() {
    NODE_COUNTS.clear();
    for (const px of TAX_TREE) {
      let pillarN = 0;
      for (const d of px.domains ?? []) {
        let dn = 0;
        if (px.source === 'focus') dn = focusFacets[d.key] ?? 0;
        else if (px.key === 'disorder') dn = disFacets[d.key] ?? 0;
        else dn = gradeFacets[d.key] ?? 0;
        for (const lf of d.leaves ?? []) {
          const ln = px.source === 'focus' ? (focusFacets[lf.key] ?? 0) : (facets.counts?.[lf.key] ?? 0);
          NODE_COUNTS.set(lf.key, ln);
          dn += ln;
        }
        NODE_COUNTS.set(d.key, dn);
        pillarN += dn;
      }
      NODE_COUNTS.set(px.key, pillarN);
    }
  }
  const countOf = (key) => (NODE_COUNTS.has(key) ? NODE_COUNTS.get(key) : null);

  const PILLAR_HINTS = {
    info: 'کارت‌ها بر دیدگاه پردازش اطلاعات دسته‌بندی شده‌اند — حوزه را باز کنید و مهارت هدف را برگزینید',
    exec: 'کارت‌های پیوسته به کارکردهای اجرایی — سازماندهی، برنامه‌ریزی، مهار و پایش',
    disorder: 'کارت‌ها بر پایهٔ اختلالِ هدف برچسب خورده‌اند — خانواده را باز کنید و اختلال موردنظر را برگزینید',
    grade: 'کارت‌ها بر پایهٔ تحصیلی برچسب خورده‌اند — دوره را باز کنید و پایهٔ موردنظر را برگزینید'
  };

  function buildNav() {
    taxPicker = buildTaxonomyPicker({
      tree: TAX_TREE,
      focusSel: menuFocusSel,
      tagSel: menuTagSel,
      maxFocus: Infinity, // فیلتر — سقف ۸ پیوند مالِ ذخیرهٔ کارت است نه جستجو
      countOf,
      summaryHint: 'فیلتر کتابخانه با درخت واحد — ستون را باز کنید و هدف/اختلال/پایه را برگزینید',
      hintOf: (pk) => PILLAR_HINTS[pk] ?? null,
      onChange: () => {
        state.focus = [...menuFocusSel];
        state.disorders = [...menuTagSel].filter((k) => TAX_KEY_PILLAR.get(k) === 'disorder');
        state.grades = [...menuTagSel].filter((k) => TAX_KEY_PILLAR.get(k) === 'grade');
        state.page = 1;
        refresh();
      }
    });

    const search = el('input', {
      class: 'input exb-search',
      type: 'search',
      placeholder: 'جستجوی عنوان یا توضیح…',
      'aria-label': 'جستجوی عنوان یا توضیح کارت', /* S6-16 */
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
      { class: 'select', 'aria-label': 'وضعیت انتشار' }, /* S6-16 */
      el('option', { value: 'all', selected: state.published === 'all' }, 'همه'),
      el('option', { value: 'true', selected: state.published === 'true' }, 'منتشرشده'),
      el('option', { value: 'false', selected: state.published === 'false' }, 'پیش‌نویس')
    );
    pubSel.addEventListener('change', () => {
      state.published = pubSel.value;
      state.page = 1;
      refresh();
    });

    // فیلتر «نوع کارت»: همین نگاشت، نوع کارت جلسه در طرح درمان را می‌سازد
    const typeChips = el('div', { class: 'exb-grades', role: 'group', 'aria-label': 'فیلتر نوع کارت' },
      el('span', { class: 'cell-sub' }, 'نوع کارت:'),
      el('button', {
        class: `chip${state.format === '' ? ' is-active' : ''}`,
        type: 'button',
        'aria-pressed': String(state.format === ''), /* S6-15 */
        style: { cursor: 'pointer' },
        onclick: () => { state.format = ''; refresh(); }
      }, 'همه'),
      ...Object.entries(FORMAT_LABELS).map(([k, label]) =>
        el('button', {
          class: `chip${state.format === k ? ' is-active' : ''}`,
          type: 'button',
          'aria-pressed': String(state.format === k), /* S6-15 */
          style: { cursor: 'pointer' },
          title: 'در طرح درمان به کارتِ «' + label + '» تبدیل می‌شود',
          onclick: () => { state.format = k; refresh(); }
        }, label)
      )
    );

    nav.replaceChildren(
      taxPicker.el, // چهار ستون با یک زبان: تب + خلاصهٔ انتخاب‌ها + درخت
      el('div', { class: 'exb-filters' }, search, pubSel),
      typeChips
    );
  }

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
      stage.append(tile(FORMAT_ICONS[ex.format] ?? 'file', FORMAT_LABELS[ex.format] ?? 'کارت'));
    }
    return stage;
  }

  function buildCardFiles(ex, files) {
    const chipOf = (f) =>
      el(
        'span',
        { class: 'exb-file-chip' },
        icon('file', 13),
        el('span', { class: 'exb-file-chip__name', title: f.filename }, f.filename),
        el('span', { class: 'exb-file-chip__size' }, sizeLabel(f.size)),
        previewable(f)
          ? el('button', { class: 'exb-file-chip__btn', type: 'button', title: 'پیش‌نمایش', 'aria-label': `پیش‌نمایش ${f.name ?? 'فایل'}`, onclick: () => openPreviewModal(ex, [f]) } /* S6-13 */, icon('eye', 12))
          : null,
        el('button', { class: 'exb-file-chip__btn', type: 'button', title: 'دانلود', 'aria-label': `دانلود ${f.name ?? 'فایل'}`, onclick: () => downloadFile(ex, f) } /* S6-13 */, icon('download', 12)),
        isStaff() && f.id
          ? el('button', { class: 'exb-file-chip__btn exb-file-chip__btn--danger', type: 'button', title: 'حذف فایل', 'aria-label': `حذف ${f.name ?? 'فایل'}`, onclick: () => removeAttachment(ex, f) } /* S6-13 */, icon('trash', 12))
          : null
      );
    const wrap = el('div', { class: 'exb-files' });
    let expanded = false;
    function draw() {
      const shown = expanded ? files : files.slice(0, MAX_CARD_FILES);
      const parts = shown.map(chipOf);
      if (files.length > MAX_CARD_FILES) {
        parts.push(el('button', {
          class: 'chip',
          type: 'button',
          style: { cursor: 'pointer' },
          'aria-expanded': expanded ? 'true' : 'false',
          onclick: () => { expanded = !expanded; draw(); }
        }, expanded ? 'نمایش کمتر' : `نمایش همه (${fa(files.length)})`));
      }
      wrap.replaceChildren(...parts);
    }
    draw();
    return wrap;
  }

  function drawList() {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (items.length === 0) {
      const filtered = state.format || state.q || state.focus.length || state.disorders.length || state.grades.length;
      body.replaceChildren(
        emptyState({
          iconName: filtered ? 'search' : 'grid',
          title: filtered ? 'با این فیلترها کارتی پیدا نشد' : 'هنوز کارت آماده‌ای ثبت نشده',
          hint: filtered
            ? 'فیلترهای درخت واحد (هدف/اختلال/پایه)، نوع کارت یا جستجو را تغییر دهید؛ یا از ستون‌های دیگر شروع کنید.'
            : isStaff()
              ? 'با «کارت جدید» اولین کارت آماده را بسازید — هدف شناختی، نوع کارت و پایه/اختلال را انتخاب کنید تا کارت در طرح درمان و بات هدفمند پیدا شود.'
              : 'کارت‌های آمادهٔ مرکز برای طرح درمان اینجا نمایش داده می‌شود.'
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
                type: 'button',
                title: 'پیش‌نمایش',
                'aria-label': `پیش‌نمایش «${ex.title ?? 'کارت'}»`, /* S6-13 */
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
                type: 'button',
                title: 'دانلود فایل اصلی',
                'aria-label': `دانلود فایل اصلی «${ex.title ?? 'کارت'}»`, /* S6-13 */
                onclick: () => downloadFile(ex, files[0])
              },
              icon('download', 15)
            )
          : null,
        isStaff()
          ? el('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'ویرایش', 'aria-label': `ویرایش «${ex.title ?? 'کارت'}»`, onclick: () => openEditModal(ex) }, icon('edit', 15)) /* S6-13 */
          : null,
        isStaff()
          ? el('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'فایل‌ها', 'aria-label': `فایل‌های «${ex.title ?? 'کارت'}»`, onclick: () => openFilesModal(ex) }, icon('file', 15))
          : null,
        isStaff()
          ? el('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'حذف', 'aria-label': `حذف «${ex.title ?? 'کارت'}»`, onclick: () => removeExercise(ex) }, icon('trash', 15))
          : null
      );
      const fileChips = files.length === 0
        ? el('span', { class: 'exb-file' }, 'بدون فایل')
        : buildCardFiles(ex, files);
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
            coCreatorChip(ex.coCreatedBy),
            formatBadge(ex.format),
            publishedBadge(ex.published),
            ex.visibility === 'private' ? privateBadge() : null)
        ),
        ex.description ? el('p', { class: 'exb-card__desc', title: ex.description }, ex.description) : null,
        safeExternalHref(ex.externalUrl)
          ? el('div', { style: { marginBottom: '6px' } },
              el('a', { class: 'exb-file-chip exb-link-chip', href: safeExternalHref(ex.externalUrl), target: '_blank', rel: 'noopener', title: safeExternalHref(ex.externalUrl) },
                icon('gamepad', 13),
                el('span', { class: 'exb-file-chip__name' }, 'باز کردن بازی/تمرین آنلاین')))
          : null,
        // بج هدف‌های شناختی کارت (حداکثر ۳ + شمارندهٔ باقی‌مانده)
        Array.isArray(ex.focus) && ex.focus.length > 0
          ? el(
              'div',
              { class: 'exb-card__focus' },
              ex.focus.slice(0, 3).map((k) =>
                el('span', { class: 'badge badge--info exb-focus', title: TAX_LABELS.get(k) ?? 'برچسب آزاد' /* S6-14 */ },
                  icon(TAX_ICONS.get(k) ?? 'target', 12),
                  TAX_LABELS.get(k) ?? 'برچسب آزاد' /* S6-14 */)
              ),
              ex.focus.length > 3 ? el('span', { class: 'badge badge--neutral' }, `+${fa(ex.focus.length - 3)}`) : null
            )
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
    pager.append(el('span', { class: 'exb-pager__label' }, `صفحهٔ ${fa(state.page)} از ${fa(totalPages)} — مجموع ${fa(total)} کارت`));
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

  async function removeAttachment(ex, file) {
    if (!file.id) {
      toast('بارگذاری این فایل کامل نشده است — پس از اتمام بارگذاری کارت، فایل قابل حذف است', 'warning');
      return;
    }
    const ok = await confirmModal({
      title: 'حذف فایل',
      message: `فایل «${file.filename}» از کارت «${ex.title}» حذف شود؟`,
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

  async function openCreateModal() {
    if (!TAX_TREE.length) await loadMeta(); // درخت واحد هنوز نیامده؟ یک‌بار دیگر بگیر (ریسک جوابِ خطای بی‌صدای meta)
    const picked = [];
    const tagSel = new Set(); // شناسهٔ برچسب‌ها (اختلال/پایه از درخت واحد + برچسب دلخواه)
    const focusSel = new Set(); // کلیدهای درخت هدف

    const title = el('input', { class: 'input', maxlength: 150, placeholder: 'مثلاً: تمرین حروف نقطه‌دار — پایهٔ دوم', 'aria-label': 'عنوان کارت' }); /* S6-18 */
    const desc = el('textarea', { class: 'textarea', rows: 3, maxlength: 2000, placeholder: 'راهنمای اجرا برای خانواده (اختیاری — در پیام بات هم می‌آید)', 'aria-label': 'توضیح برای خانواده' }); /* S6-18 */
    const link = el('input', { class: 'input', dir: 'ltr', maxlength: 500, placeholder: 'https://example.com/game — لینک بازی/تمرین آنلاین (اختیاری)', 'aria-label': 'لینک بازی یا تمرین آنلاین' }); /* S6-18 */
    // /«نوع کارت» به‌صورت چیپ آیکون‌دار (هر گزینه همان نوع کارت جلسه در طرح درمان است)
    let fmtValue = 'worksheet';
    const fmtChips = el(
      'div',
      { class: 'exb-fmtchips', role: 'radiogroup', 'aria-label': 'نوع کارت' } /* S6-18 */,
      ...Object.entries(FORMAT_LABELS).map(([k, label]) =>
        el(
          'button',
          {
            type: 'button',
            class: `exb-fmtchip${k === fmtValue ? ' is-active' : ''}`,
            role: 'radio', /* S6-18 */
            'aria-checked': String(k === fmtValue),
            title: 'در طرح درمان به کارتِ «' + label + '» تبدیل می‌شود',
            onclick: (e) => {
              fmtValue = k;
              e.currentTarget.parentElement.querySelectorAll('.exb-fmtchip').forEach((c) => {
                c.classList.remove('is-active');
                c.setAttribute('aria-checked', 'false');
              });
              e.currentTarget.classList.add('is-active');
              e.currentTarget.setAttribute('aria-checked', 'true');
            }
          },
          icon(FORMAT_ICONS[k] ?? 'file', 15),
          label
        )
      )
    );
    const visSel = el(
      'select',
      { class: 'select', 'aria-label': 'دید کارت' } /* S6-18 */,
      el('option', { value: 'public', selected: 'selected' }, 'عمومی — همهٔ همکاران'),
      el('option', { value: 'private' }, 'خصوصی — فقط من و مدیر')
    );
    const myStaffId = session.user?.staffId ?? '';
    const activeStaff = staffList.filter((s) => s.active === undefined || s.active === 1 || s.active === true);
    const ownerSel = activeStaff.length > 0
      ? el(
          'select',
          { class: 'select' },
          ...activeStaff.map((s) => el('option', { value: s.id, selected: s.id === myStaffId ? 'selected' : undefined }, s.fullName))
        )
      : el('select', { class: 'select' }, el('option', { value: myStaffId, selected: 'selected' }, session.user?.displayName ?? '—'));
    const coSel = el(
      'select',
      { class: 'select' },
      el('option', { value: '' }, '— بدون هم‌ساز (امتیاز کامل)'),
      ...activeStaff
        .filter((s) => s.id && s.id !== myStaffId)
        .map((s) => el('option', { value: s.id }, s.fullName))
    );
    const freeTagPicker = buildFreeTagPicker(tags, tagSel); // برچسب دلخواه (دادهٔ آزاد جستجو)
    const taxonomyPicker = buildTaxonomyPicker({ tree: TAX_TREE, focusSel, tagSel }); // درخت واحد چهارستونه

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

    // فرم سه‌بخشی: هویت → طبقه‌بندی کارت (درخت واحد + برچسب دلخواه) → محتوا
    const bodyEl = el(
      'div',
      { class: 'exb-form' },
      formSection(1, 'هویت کارت', 'عنوان و نوع کارت — هر کارت در طرح درمان به یک کارت جلسه تبدیل می‌شود', [
        el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'عنوان کارت', el('span', { class: 'req' }, ' *')), title,
          el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, 'اگر خالی بماند، از نام اولین فایل پر می‌شود')),
        el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'نوع کارت (در طرح درمان)'), fmtChips),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'سازندهٔ کارت — امتیاز به نام او'), ownerSel,
          el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, 'روی دستگاه مشترک، نام واقعی سازنده را انتخاب کنید')),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'هم‌ساز کارت (سازندهٔ دوم)'), coSel,
          el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, 'اختیاری — با انتخاب همکار، امتیاز تولید محتوا بین دو نفر نصف می‌شود')),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'دید'), visSel,
          el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, 'خصوصی: در کتابخانه و انتخابگر فقط شما و مدیر می‌بینید؛ بات/خانواده هرگز'))
      ]),
      formSection(2, 'طبقه‌بندی کارت — درخت واحد', 'هم‌زمان در چهار ستون: پردازش اطلاعات، کارکردهای اجرایی، اختلال‌ها و پایه تحصیلی — انتخاب خانواده یعنی همهٔ برچسب‌های عضو؛ کارتِ طبقه‌بندی‌شده در طرح درمان و پیکر هدفمند پیدا می‌شود', [
        el('div', { class: 'field span-2' }, taxonomyPicker.el),
        el('div', { class: 'field span-2 exb-taxfree' }, el('div', { class: 'field__label' }, 'برچسب دلخواه — جستجوی سریع (عضو درخت نیست)'), freeTagPicker)
      ]),
      formSection(3, 'محتوای کارت', 'فایل کاربرگ/بازی، لینک آنلاین و راهنمای اجرا برای خانواده', [
        el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'فایل‌های کارت (اختیاری — تصویر/PDF/سند، حداکثر ۱۰ فایل)'), dropzoneWrap),
        el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'لینک بازی/تمرین آنلاین (اختیاری)'), link,
          el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, 'روی کارت‌های بازی — در پیام بلهٔ خانواده و پروفایل با دکمهٔ بازی باز می‌شود')),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'توضیح برای خانواده (اختیاری)'), desc)
      ])
    );

    const saveBtn = el('button', { class: 'btn btn--primary', type: 'button', onclick: onSave }, 'افزودن کارت');
    async function onSave() {
      if (saveBtn.disabled) return;
      if (title.value.trim().length < 2) {
        toast('عنوان کارت حداقل ۲ نویسه است', 'warning');
        title.focus();
        return;
      }
      saveBtn.disabled = true;
      try {
        const created = await api.post('/api/exercises', {
          title: title.value.trim(),
          description: desc.value.trim() || null,
          format: fmtValue, // چیپ نوع کارت
          external_url: link.value.trim() || null,
          tag_ids: [...tagSel], // اختلال/پایه از درخت واحد + برچسب دلخواه
          focus: [...focusSel], // پیوند به درخت هدف
          co_created_by: coSel.value || null,
          published: true,
          visibility: visSel.value,
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
            toastError(new Error(`کارت ثبت شد اما بارگذاری فایل‌ها ناموفق بود — از دکمهٔ «فایل‌ها» دوباره تلاش کنید (${err.message})`));
          }
        }
        toast('کارت آماده ساخته شد', 'success');
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
      title: 'کارت آمادهٔ جدید',
      body: bodyEl,
      wide: true,
      actions: [
        (close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'انصراف'),
        () => saveBtn
      ]
    });
  }

  async function openEditModal(ex) {
    if (!TAX_TREE.length) await loadMeta(); // درخت واحد هنوز نیامده؟ یک‌بار دیگر بگیر
    const tagSel = new Set(ex.tags.map((t) => t.id)); // شناسهٔ برچسب‌ها (زنده — درخت واحد و برچسب دلخواه مشترک)
    const title = el('input', { class: 'input', maxlength: 150, value: ex.title });
    const desc = el('textarea', { class: 'textarea', rows: 3, maxlength: 2000 }, ex.description ?? '');
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
    const canOwn = ex.createdBy === session.user?.staffId || session.user?.role === 'manager';
    const visSel = el(
      'select',
      { class: 'select', 'aria-label': 'دید کارت' } /* S6-18 */,
      el('option', { value: 'public', selected: ex.visibility !== 'private' ? 'selected' : undefined }, 'عمومی — همهٔ همکاران'),
      el('option', { value: 'private', selected: ex.visibility === 'private' ? 'selected' : undefined }, 'خصوصی — فقط من و مدیر')
    );
    const activeStaff = staffList.filter(
      (s) => s.active === undefined || s.active === 1 || s.active === true
    );
    const coOptions = activeStaff.filter((s) => s.id && s.id !== ex.createdBy);
    if (ex.coCreatedBy && !coOptions.some((s) => s.id === ex.coCreatedBy)) {
      const known = staffList.find((s) => s.id === ex.coCreatedBy);
      coOptions.unshift({ id: ex.coCreatedBy, fullName: known?.fullName ?? ex.coCreatedBy });
    }
    const coSel = el(
      'select',
      { class: 'select' },
      el('option', { value: '', selected: !ex.coCreatedBy }, '— بدون هم‌ساز (امتیاز کامل)'),
      ...coOptions.map((s) => el('option', { value: s.id, selected: s.id === ex.coCreatedBy }, s.fullName))
    );
    const isManager = session.user?.role === 'manager';
    const currentOwnerName = staffList.find((s) => s.id === ex.createdBy)?.fullName ?? 'نامشخص';
    const creatorChip = el(
      'span',
      { class: `staff-chip exb-owner ${hueClass(ex.createdBy)}`, title: `سازندهٔ فعلی: ${currentOwnerName}` },
      hueDot(ex.createdBy, 9),
      `سازندهٔ فعلی: ${currentOwnerName}`
    );
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
            toast('سازندهٔ تمرین از قبل همین شخص است', 'info');
            reassignPanel.hidden = true;
            return;
          }
          toast(`مالکیت کارت به ${staffNames.get(reSel.value) ?? reSel.value} منتقل شد`, 'success');
          closeEdit?.();
          reloadAll();
        } catch (err) {
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
    const freeTagPicker = buildFreeTagPicker(tags, tagSel); // برچسب دلخواه (دادهٔ آزاد جستجو)
    const focusSel = new Set(Array.isArray(ex.focus) ? ex.focus : []); // پیش‌فرض از رکورد
    const taxonomyPicker = buildTaxonomyPicker({ tree: TAX_TREE, focusSel, tagSel }); // درخت واحد چهارستونه

    // فرم سه‌بخشی ویرایش: هویت → طبقه‌بندی کارت (درخت واحد + برچسب دلخواه) → محتوا
    const bodyEl = el(
      'div',
      { class: 'exb-form' },
      formSection(1, 'هویت کارت', 'عنوان، نوع کارت و وضعیت انتشار', [
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'عنوان کارت', el('span', { class: 'req' }, ' *')), title),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'نوع کارت (در طرح درمان)'), fmt),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'انتشار'), pub),
        canOwn ? el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'دید'), visSel) : null,
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'هم‌ساز کارت (سازندهٔ دوم)'), coSel,
          el('div', { class: 'cell-sub', style: { marginTop: '4px' } },
            'اختیاری — با انتخاب همکار، امتیاز تولید محتوا بین سازندهٔ اصلی و او نصف می‌شود')),
        el('div', { class: 'field span-2' },
          el('label', { class: 'field__label' }, 'سازندهٔ کارت'),
          el('div', { class: 'exb-ownerfield__row' }, creatorChip, reassignToggle),
          reassignPanel,
          el('div', { class: 'cell-sub', style: { marginTop: '4px' } },
            `امتیاز تولید محتوا به نام ${currentOwnerName} ثبت می‌شود — ویرایش عادی مالکیت را تغییر نمی‌دهد`))
      ]),
      formSection(2, 'طبقه‌بندی کارت — درخت واحد', 'هم‌زمان در چهار ستون: پردازش اطلاعات، کارکردهای اجرایی، اختلال‌ها و پایه تحصیلی — انتخاب خانواده یعنی همهٔ برچسب‌های عضو', [
        el('div', { class: 'field span-2' }, taxonomyPicker.el),
        el('div', { class: 'field span-2 exb-taxfree' }, el('div', { class: 'field__label' }, 'برچسب دلخواه — جستجوی سریع (عضو درخت نیست)'), freeTagPicker)
      ]),
      formSection(3, 'محتوای کارت', 'لینک بازی آنلاین و راهنمای اجرا برای خانواده', [
        el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'لینک بازی/تمرین آنلاین (اختیاری)'), link,
          el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, 'لینک بازی روی سرویس بیرونی — در پیام بلهٔ خانواده و پروفایل با دکمهٔ بازی باز می‌شود — برای خالی‌کردن، خالی بگذارید')),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'توضیح برای خانواده'), desc)
      ])
    );

    openModal({
      title: 'ویرایش کارت آماده',
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
                  toast('عنوان کارت حداقل ۲ نویسه است', 'warning');
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
                    tag_ids: [...tagSel], // اختلال/پایه از درخت واحد + برچسب دلخواه
                    focus: [...focusSel], // جایگزینی کامل پیوندهای هدف
                    co_created_by: coSel.value || null
                  };
                  if (canOwn) {
                    patch.visibility = visSel.value;
                  }
                  await api.patch(`/api/exercises/${ex.id}`, patch);
                  toast('کارت به‌روزرسانی شد', 'success');
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
                    ? el('button', { class: 'exb-file-chip__btn', type: 'button', title: 'پیش‌نمایش', 'aria-label': `پیش‌نمایش ${f.name ?? 'فایل'}`, onclick: () => openPreviewModal(ex, [f]) } /* S6-13 */, icon('eye', 12))
                    : null,
                  el('button', { class: 'exb-file-chip__btn', type: 'button', title: 'دانلود', 'aria-label': `دانلود ${f.name ?? 'فایل'}`, onclick: () => downloadFile(ex, f) } /* S6-13 */, icon('download', 12)),
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

  async function removeExercise(ex) {
    const ok = await confirmModal({
      title: 'حذف کارت آماده',
      message: `«${ex.title}» از کتابخانه حذف شود؟ حذف نرم است — کارت‌های درج‌شده در طرح‌ها و تکلیف‌های ارسال‌شده سر جایشان می‌مانند.`,
      confirmLabel: 'حذف',
      danger: true
    });
    if (!ok) return;
    try {
      await api.del(`/api/exercises/${ex.id}`);
      toast('کارت حذف شد', 'success');
      reloadAll();
    } catch (err) {
      toastError(err);
    }
  }

  function drawToolbar() {
    const newBtn = isStaff()
      ? el('button', { class: 'btn btn--primary', onclick: openCreateModal }, icon('plus', 18), 'کارت جدید')
      : null;
    toolbar.replaceChildren(
      el(
        'div',
        { class: 'page-head__title' },
        'کارت‌های آماده',
        newBtn ? el('div', { style: { marginRight: 'auto' } }, newBtn) : null
      ),
      el(
        'div',
        { class: 'page-head__desc' },
        // ریبرند: کتابخانهٔ کارت‌های آمادهٔ طرح درمان؛ حلقهٔ تکلیف همان مسیر قبلی
        `کتابخانهٔ کارت‌های آمادهٔ طرح درمان — هر کارت را در «طرح درمان» به جلسه اضافه کنید؛ ارسال به خانواده از پروفایل دانش‌آموز «ارسال تمرین با بله» و بازگشت نتیجه در همان پروفایل دنبال می‌شود (ذخیره: ${storage === 'r2' ? 'R2' : 'D1'})`
      )
    );
  }

  loadMeta().then(async () => {
    if (!TAX_TREE.length) await loadMeta(); // یک تلاش دوباره (ریسک خطای بی‌صدای meta)
    await loadStaff();
    drawToolbar();
    computeCounts();
    buildNav();
    refresh();
  });
}
