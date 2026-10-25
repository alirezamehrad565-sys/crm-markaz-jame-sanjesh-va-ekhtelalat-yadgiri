import { api } from '../api.js';
import { el, icon, toast, toastError, confirmModal, openModal, emptyState, loadingState, errorState } from '../ui.js';
import {
  fa,
  tehranTodayYmd,
  toJalali,
  toGregorian,
  JALALI_MONTHS,
  formatJalaliNumeric
} from '../format.js';
import { jalaliDateInput } from '../jalali-picker.js';

// ═══════════════════════════════════════════════════════════════
//  m188 — کلر بوک مرکز
//  خط زمانی یکپارچه: فازهای تقویم اجرایی (خاکستری/کم‌رنگ) + رویدادهای
//  انجام‌شده (رنگی با عکس/مستند) + دو خروجی چاپ (آلبوم فعالیت‌ها، تقویم رسمی)
//  دسترسی: فقط مدیر و منشی (router + سرور هر دو کنترل می‌کنند)
// ═══════════════════════════════════════════════════════════════

const CHUNK_UPLOAD_BYTES = 1024 * 1024;      // هر درخواست تکه‌ای ≤ ۱ مگابایت
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const PAGE_SIZE = 50;
const STATUS_LABELS = { planned: 'برنامه‌ریزی‌شده', active: 'در جریان', done: 'تکمیل' };

const EXT_MIME_FALLBACK = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', txt: 'text/plain', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function pad2(n) { return n < 10 ? `0${n}` : String(n); }
function localMime(file) {
  const t = (file.type || '').toLowerCase();
  if (t && t !== 'application/octet-stream') return t;
  const ext = (file.name || '').split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME_FALLBACK[ext] ?? t ?? 'application/octet-stream';
}
function sizeLabel(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${fa(mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10)} مگابایت`;
  }
  return bytes >= 1024 ? `${fa(Math.round(bytes / 1024))} کیلوبایت` : `${fa(bytes)} بایت`;
}
function isImageFile(file) { return String(localMime(file) ?? '').startsWith('image/'); }

// ─── تقویم شمسی ───

function jalaliPartsOf(ymd) {
  const [gy, gm, gd] = String(ymd).split('-').map(Number);
  return toJalali(gy, gm, gd);
}
function ymdOfJalali(j) {
  const g = toGregorian(j.jy, j.jm, j.jd);
  return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
}
/** سال تحصیلی (مهر تا شهریور): مهر ۱۴۰۴ تا شهریور ۱۴۰۵ = ۱۴۰۴ */
function schoolYearOf(ymd) {
  const j = jalaliPartsOf(ymd);
  return j.jm >= 7 ? j.jy : j.jy - 1;
}
function schoolYearBounds(jy) {
  return { from: ymdOfJalali({ jy, jm: 7, jd: 1 }), to: ymdOfJalali({ jy: jy + 1, jm: 6, jd: 31 }) };
}
function schoolYearLabel(jy) {
  return `${fa(jy)}–${fa(String(jy + 1).slice(2))}`;
}
function monthKeyOf(ymd) {
  const j = jalaliPartsOf(ymd);
  return `${j.jy}-${pad2(j.jm)}`;
}
function monthLabelOf(ymd) {
  const j = jalaliPartsOf(ymd);
  return `${JALALI_MONTHS[j.jm - 1]} ${fa(j.jy)}`;
}
function dateLabelOf(ymd) {
  return fa(formatJalaliNumeric(ymd));
}
function rangeLabel(from, to) {
  if (!to || to === from) return dateLabelOf(from);
  const jf = jalaliPartsOf(from);
  const jt = jalaliPartsOf(to);
  if (jf.jy === jt.jy && jf.jm === jt.jm) return `${fa(jf.jd)} تا ${dateLabelOf(to)}`;
  return `${dateLabelOf(from)} تا ${dateLabelOf(to)}`;
}

// ─── وضعیت ویو ───

let plans = [];
let tagList = [];
let yearList = [];
let entries = [];
let hasMore = false;
let entryOffset = 0;
let clinicName = 'مرکز جامع';
const filters = { year: null, tag: null, from: '', to: '', q: '' };
const urlCache = new Map(); // `${entryId}/${fileId}` → objectURL
let _shellBody = null;
let _toolbar = null;
let _docCtl = null; // شنیده‌های سطح سند نوار ابزار (چاپ/Escape) — با rebuild کنسل می‌شود

async function fileObjectUrl(entryId, fileId) {
  const key = `${entryId}/${fileId}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const token = localStorage.getItem('cs.token') ?? '';
  const res = await fetch(`/api/clearbook/entries/${entryId}/files/${fileId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('دریافت فایل ناموفق بود');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

async function downloadAttachment(entryId, file) {
  try {
    const url = await fileObjectUrl(entryId, file.id);
    const a = el('a', { href: url, download: file.filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    toastError(err);
  }
}

/** فشرده‌سازی خودکار عکس در مرورگر — حداکثر ۱۶۰۰ پیکسل، JPEG با کیفیت ۰٫۸۲ */
async function compressImage(file) {
  try {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    if (file.size <= 350 * 1024) return file;
    const bitmap = await createImageBitmap(file);
    const maxSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 1600 / maxSide);
    if (scale >= 1 && file.size <= 1024 * 1024) { bitmap.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    const name = (file.name || 'aks.jpg').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file; // فشرده‌سازی نشد — همان فایل اصلی می‌رود
  }
}

async function uploadChunked(entryId, file, onPct) {
  const mime = localMime(file);
  const begin = await api.post(`/api/clearbook/entries/${entryId}/files/begin`, {
    filename: file.name,
    mime,
    size: file.size
  });
  const fileId = begin?.data?.fileId;
  if (!fileId) throw new Error('شروع بارگذاری فایل ناموفق بود');
  const chunks = Math.ceil(file.size / CHUNK_UPLOAD_BYTES);
  for (let seq = 0; seq < chunks; seq += 1) {
    const piece = file.slice(seq * CHUNK_UPLOAD_BYTES, Math.min((seq + 1) * CHUNK_UPLOAD_BYTES, file.size));
    await api.putRaw(`/api/clearbook/entries/${entryId}/files/${fileId}/chunks/${seq}`, await piece.arrayBuffer());
    onPct?.(Math.round(((seq + 1) / chunks) * 100));
  }
  await api.post(`/api/clearbook/entries/${entryId}/files/${fileId}/complete`, {});
  return fileId;
}

// ─── نقطهٔ ورود ویو ───

export async function renderClearbook(container) {
  container.replaceChildren(loadingState());
  try {
    const [plansRes, tagsRes, yearsRes] = await Promise.all([
      api.get('/api/clearbook/plans'),
      api.get('/api/clearbook/tags'),
      api.get('/api/clearbook/years')
    ]);
    plans = plansRes.data ?? [];
    tagList = tagsRes.data ?? [];
    yearList = yearsRes.data ?? [];
  } catch (err) {
    container.replaceChildren(errorState(err, () => renderClearbook(container)));
    return;
  }

  try {
    const settings = await api.get('/api/settings');
    if (settings?.data?.clinicName) clinicName = settings.data.clinicName;
  } catch { /* نام پیش‌فرض می‌ماند */ }

  if (filters.year === null && !filters.from && !filters.to) {
    filters.year = schoolYearOf(tehranTodayYmd());
    if (!yearList.includes(filters.year)) yearList.unshift(filters.year);
    const b = schoolYearBounds(filters.year);
    filters.from = b.from;
    filters.to = b.to;
  }

  const page = el('div', { class: 'cb-root' });
  _toolbar = buildToolbar();
  _shellBody = el('div', { class: 'cb-body' });
  page.append(_toolbar, _shellBody);
  container.replaceChildren(page);
  await refreshEntries({ reset: true });
}

// ─── نوار ابزار ───

function buildToolbar() {
  const yearChips = el('div', { class: 'cb-chips', role: 'group', 'aria-label': 'سال تحصیلی' });
  const allChip = el('button', {
    class: `chip cb-chip${filters.year === null ? ' is-active' : ''}`,
    onclick: () => { filters.year = null; filters.from = ''; filters.to = ''; refreshAll(); }
  }, 'همه سال‌ها');
  yearChips.appendChild(allChip);
  for (const y of yearList) {
    yearChips.appendChild(el('button', {
      class: `chip cb-chip${filters.year === y ? ' is-active' : ''}`,
      onclick: () => {
        filters.year = y;
        const b = schoolYearBounds(y);
        filters.from = b.from;
        filters.to = b.to;
        refreshAll();
      }
    }, schoolYearLabel(y)));
  }

  const tagChips = el('div', { class: 'cb-chips', role: 'group', 'aria-label': 'برچسب‌ها' });
  for (const t of tagList) {
    tagChips.appendChild(el('button', {
      class: `chip cb-chip cb-chip--tag${filters.tag === t.tag ? ' is-active' : ''}`,
      title: `${fa(t.count)} رویداد`,
      onclick: () => { filters.tag = filters.tag === t.tag ? null : t.tag; refreshAll(); }
    }, icon('tag', 12), t.tag));
  }

  const fromPicker = jalaliDateInput({ value: filters.from, onChange: (v) => { filters.from = v; } });
  const toPicker = jalaliDateInput({ value: filters.to, onChange: (v) => { filters.to = v; } });

  const search = el('input', {
    class: 'input cb-search',
    type: 'search',
    placeholder: 'جستجو در عنوان و متن…',
    value: filters.q,
    'aria-label': 'جستجو'
  });
  let debounce = null;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { filters.q = search.value.trim(); refreshAll(); }, 350);
  });

  const applyBtn = el('button', {
    class: 'btn btn--soft btn--sm',
    title: 'بازهٔ دلخواه را بدون محدودیت سال تحصیلی اعمال می‌کند',
    onclick: () => { filters.year = null; refreshAll(); }
  }, icon('filter', 14), 'اعمال بازه');

  const printWrap = el('div', { class: 'cb-print-menu' });
  const printBtn = el('button', { class: 'btn btn--soft btn--sm', onclick: togglePrintMenu }, icon('printer', 15), 'چاپ');
  const menu = el('div', { class: 'cb-print-menu__pop', hidden: true },
    el('button', { class: 'cb-print-menu__item', onclick: () => { togglePrintMenu(); printAlbum(); } },
      icon('book', 16), el('span', {}, el('b', {}, 'آلبوم فعالیت‌ها'), el('small', {}, 'جلد + عکس‌ها با کپشن — خروجی کلر بوک'))),
    el('button', { class: 'cb-print-menu__item', onclick: () => { togglePrintMenu(); printCalendar(); } },
      icon('clipboard', 16), el('span', {}, el('b', {}, 'تقویم اجرایی'), el('small', {}, 'جدول رسمی فازها برای اداره')))
  );
  function togglePrintMenu() { menu.hidden = !menu.hidden; }
  // شنیدهٔ سطح سند: با بازسازی نوار ابزار، شنیدهٔ قبلی با AbortController جمع می‌شود (نبود نشت)
  _docCtl?.abort();
  _docCtl = new AbortController();
  document.addEventListener('click', (e) => {
    if (!printWrap.contains(e.target)) menu.hidden = true;
  }, { signal: _docCtl.signal });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') menu.hidden = true;
  }, { signal: _docCtl.signal });
  printWrap.append(printBtn, menu);

  const filtersPanel = el('div', { class: 'cb-filters print-hide' },
    el('div', { class: 'cb-fgroup' },
      el('span', { class: 'cb-fgroup__label' }, 'سال تحصیلی'),
      yearChips
    ),
    tagList.length > 0 ? el('div', { class: 'cb-fgroup' },
      el('span', { class: 'cb-fgroup__label' }, 'برچسب‌ها'),
      tagChips
    ) : null,
    el('div', { class: 'cb-fgroup' },
      el('span', { class: 'cb-fgroup__label' }, 'بازهٔ تاریخ'),
      el('div', { class: 'cb-fgroup__row cb-range' },
        el('span', { class: 'cb-range__label' }, 'از'), fromPicker.root,
        el('span', { class: 'cb-range__label' }, 'تا'), toPicker.root,
        applyBtn
      )
    ),
    el('div', { class: 'cb-fgroup' },
      el('span', { class: 'cb-fgroup__label' }, 'جستجو'),
      search
    )
  );

  const toolbar = el('div', { class: 'toolbar cb-toolbar print-hide' },
    el('div', { class: 'cb-toolbar__row' },
      el('div', { class: 'page-head', style: { marginBottom: '0' } },
        el('div', {},
          el('h2', { class: 'page-head__title' }, 'کلر بوک مرکز'),
          el('p', { class: 'page-head__desc' }, 'برنامهٔ سالانه و شواهد اجرا — هر فاز را با عکس و مستند زنده کنید')),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn--soft btn--sm', onclick: openPlansManager }, icon('clipboard', 14), 'تقویم اجرایی'),
        el('button', { class: 'btn btn--soft btn--sm', onclick: () => openPlanModal() }, icon('target', 14), 'فاز جدید'),
        el('button', { class: 'btn btn--primary btn--sm', onclick: () => openEntryModal() }, icon('plus', 14), 'رویداد جدید'),
        printWrap
      )
    ),
    filtersPanel
  );
  return toolbar;
}

// ─── بارگذاری و ترسیم خط زمانی ───

async function refreshAll() {
  try {
    const [plansRes, tagsRes, yearsRes] = await Promise.all([
      api.get('/api/clearbook/plans'),
      api.get('/api/clearbook/tags'),
      api.get('/api/clearbook/years')
    ]);
    plans = plansRes.data ?? [];
    tagList = tagsRes.data ?? [];
    yearList = yearsRes.data ?? [];
    if (filters.year !== null && !yearList.includes(filters.year)) yearList.unshift(filters.year);
  } catch (err) {
    toastError(err);
  }
  _toolbar.replaceWith(buildToolbar());
  await refreshEntries({ reset: true });
}

async function refreshEntries({ reset = false, append = false } = {}) {
  if (reset) entryOffset = 0;
  const params = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.tag) params.tag = filters.tag;
  if (filters.q) params.q = filters.q;
  params.limit = PAGE_SIZE;
  params.offset = append ? entryOffset : 0;
  const query = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

  if (!append) _shellBody?.replaceChildren(loadingState('در حال بارگذاری خط زمانی…'));
  try {
    const res = await api.get(`/api/clearbook/entries?${query}`);
    const items = res.data ?? [];
    hasMore = Boolean(res.meta?.hasMore);
    entries = append ? entries.concat(items) : items;
    entryOffset = entries.length;
    drawTimeline();
  } catch (err) {
    _shellBody?.replaceChildren(errorState(err, () => refreshEntries({ reset: true })));
  }
}

function plansInRange() {
  const from = filters.from || null;
  const to = filters.to || null;
  return plans.filter((p) => {
    if (from && (p.toDate || p.fromDate) < from) return false;
    if (to && p.fromDate > to) return false;
    return true;
  });
}

/** فهرست روز اول هر ماه شمسی بین دو تاریخ — حداکثر max ماه (اسکلت خط زمانی) */
function monthSpanBetween(fromYmd, toYmd, max = 14) {
  if (!fromYmd || !toYmd || toYmd < fromYmd) return [];
  const endJ = jalaliPartsOf(toYmd);
  const out = [];
  let j = jalaliPartsOf(fromYmd);
  for (let guard = 0; guard <= max; guard++) {
    if (j.jy > endJ.jy || (j.jy === endJ.jy && j.jm > endJ.jm)) break;
    out.push(ymdOfJalali({ jy: j.jy, jm: j.jm, jd: 1 }));
    if (out.length >= max) break;
    j.jm += 1;
    if (j.jm > 12) { j.jm = 1; j.jy += 1; }
  }
  return out;
}

function monthHeader(sampleYmd, isNow) {
  return el('div', { class: `cb-month${isNow ? ' is-now' : ''}` },
    el('span', { class: 'cb-month__dot' }),
    el('h3', { class: 'cb-month__label' }, monthLabelOf(sampleYmd))
  );
}

function emptySlot() {
  return el('div', { class: 'cb-empty-slot' }, 'فعالیتی در این ماه ثبت نشده است');
}

function drawTimeline() {
  if (!_shellBody) return;
  const todayYmd = tehranTodayYmd();
  const planItems = plansInRange().map((p) => ({ kind: 'plan', date: p.fromDate, plan: p }));
  const entryItems = entries.map((e) => ({ kind: 'entry', date: e.eventDate, entry: e }));
  const items = planItems.concat(entryItems).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // گروه‌بندی بر حسب ماه — sample برای برچسب ماه
  const byMonth = new Map(); // 'jy-mm' → { list: [], sample: ymd }
  for (const item of items) {
    const mk = monthKeyOf(item.date);
    if (!byMonth.has(mk)) byMonth.set(mk, { list: [], sample: item.date });
    byMonth.get(mk).list.push(item);
  }

  // اسکلت ماه‌ها: وقتی بازهٔ مشخصی (سال تحصیلی یا بازهٔ دلخواه ≤ ۱۴ ماه) انتخاب شده،
  // ساختار خط زمانی — خط عمودی و برچسب ماه‌ها — همیشه رسم می‌شود، حتی بدون هیچ فعالیتی
  let span = [];
  if (filters.from && filters.to) span = monthSpanBetween(filters.from, filters.to, 14);
  if (span.length === 0 && items.length === 0) {
    // «همه سال‌ها» بدون هیچ داده‌ای → اسکلت سال تحصیلی جاری
    const b = schoolYearBounds(schoolYearOf(todayYmd));
    span = monthSpanBetween(b.from, b.to, 14);
  }
  const useSkeleton = span.length > 0;

  const timeline = el('div', { class: 'cb-timeline' });
  const monthKeys = useSkeleton ? span.map((d) => monthKeyOf(d)) : [...byMonth.keys()];
  const planNoByMonthPlan = { n: 0 };
  const totalPlans = planItems.length;
  let anyCard = false;

  for (const mk of monthKeys) {
    const bucket = byMonth.get(mk);
    const sampleYmd = bucket?.sample ?? span.find((d) => monthKeyOf(d) === mk);
    const isNow = monthKeyOf(todayYmd) === mk;
    timeline.appendChild(monthHeader(sampleYmd, isNow));

    if (!bucket || bucket.list.length === 0) {
      timeline.appendChild(emptySlot());
      continue;
    }
    for (const item of bucket.list) {
      if (item.kind === 'plan') {
        planNoByMonthPlan.n += 1;
        timeline.appendChild(planCard(item.plan, planNoByMonthPlan.n, totalPlans, todayYmd));
      } else {
        timeline.appendChild(entryCard(item.entry));
      }
      anyCard = true;
    }
  }

  const wrap = el('div', { class: 'cb-timeline-wrap' });

  // راهنمای حالت خالی — بالای اسکلت، جمع‌وجور
  if (!anyCard) {
    wrap.appendChild(el('div', { class: 'cb-empty-hint print-hide' },
      icon('info', 17),
      el('div', {},
        el('b', {}, 'هنوز فعالیتی در این بازه ثبت نشده است. '),
        'برنامهٔ سالانه را با «فاز جدید» بسازید یا از «تقویم اجرایی» قالب استاندارد ۱۲ فازه را درج کنید؛ فازها به‌صورت خاکستری روی همین خط می‌نشینند. پس از اجرای هر برنامه، عکس و مستندش را با «رویداد جدید» به همان فاز بچسبانید تا خط زمانی زنده شود.')
    ));
  }

  wrap.appendChild(timeline);
  if (hasMore) {
    wrap.appendChild(el('div', { class: 'cb-more' },
      el('button', {
        class: 'btn btn--soft',
        onclick: (e) => {
          e.target.disabled = true;
          refreshEntries({ append: true });
        }
      }, 'نمایش رویدادهای بیشتر')
    ));
  }
  _shellBody.replaceChildren(wrap);
}

// ─── کارت‌ها ───

function statusChip(status) {
  return el('span', { class: `cb-status cb-status--${status}` }, STATUS_LABELS[status] ?? status);
}

function planCard(p, order, total, todayYmd) {
  const inProgress = todayYmd >= p.fromDate && (!p.toDate || todayYmd <= p.toDate);
  const hasEvidence = p.evidence?.count > 0;
  const details = el('div', { class: 'cb-plan__details', hidden: true },
    p.adminActions ? el('div', { class: 'cb-plan__sec' }, el('b', {}, 'اقدامات اداری و جلسات'), el('p', {}, p.adminActions)) : null,
    p.centerActions ? el('div', { class: 'cb-plan__sec' }, el('b', {}, 'خروجی / اقدام عملیاتی مرکز'), el('p', {}, p.centerActions)) : null,
    (!p.adminActions && !p.centerActions) ? el('p', { class: 'cb-plan__sec cb-plan__sec--empty' }, 'برای این فاز شرح اقدامات ثبت نشده است.') : null
  );

  const head = el('div', { class: 'cb-card__head' },
    el('span', { class: 'cb-badge cb-badge--plan' }, icon('target', 12), `فاز ${fa(order)}/${fa(total)}`),
    el('h3', { class: 'cb-card__title' }, p.title),
    el('span', { class: 'cb-card__date' }, rangeLabel(p.fromDate, p.toDate)),
    el('span', { class: 'spacer' }),
    statusChip(p.status),
    inProgress ? el('span', { class: 'cb-now', title: 'امروز در بازهٔ اجرای این فاز است' }, 'اکنون') : null
  );

  const evidence = el('div', { class: 'cb-plan__evidence' },
    hasEvidence
      ? [
        el('span', { class: 'cb-plan__count' }, `${fa(p.evidence.count)} فعالیت ثبت‌شده`),
        ...p.evidence.thumbs.map((t) => el('span', { class: 'cb-plan__thumb', dataset: { entry: t.entryId, file: t.fileId } }))
      ]
      : el('span', { class: 'cb-plan__empty' }, 'هنوز مدرکی ثبت نشده — با «ثبت فعالیت برای این برنامه» عکس و مستند اجرا را همین‌جا بگذارید')
  );
  for (const thumb of evidence.querySelectorAll('.cb-plan__thumb')) {
    const { entry, file } = thumb.dataset;
    fileObjectUrl(entry, file)
      .then((url) => {
        thumb.style.backgroundImage = `url('${url}')`;
        thumb.classList.add('is-loaded');
      })
      .catch(() => thumb.remove());
  }

  const actions = el('div', { class: 'cb-card__actions print-hide' },
    el('button', { class: 'btn btn--primary btn--sm', onclick: () => openEntryModal({ plan: p }) }, icon('plus', 14), 'ثبت فعالیت برای این برنامه'),
    el('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'جزئیات برنامه', 'aria-label': 'نمایش جزئیات برنامه', onclick: () => { details.hidden = !details.hidden; } }, icon('eye', 14)),
    el('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'ویرایش فاز', 'aria-label': 'ویرایش فاز', onclick: () => openPlanModal({ plan: p }) }, icon('edit', 14)),
    el('button', {
      class: 'btn btn--ghost btn--icon btn--sm cb-danger',
      title: 'حذف فاز', 'aria-label': 'حذف فاز',
      onclick: async () => {
        const ok = await confirmModal({ title: 'حذف فاز برنامه', message: `فاز «${p.title}» حذف شود؟ رویدادهای ثبت‌شده حذف نمی‌شوند و فقط اتصالشان باز می‌شود.`, confirmLabel: 'حذف', danger: true });
        if (!ok) return;
        try {
          await api.del(`/api/clearbook/plans/${p.id}`);
          toast('فاز حذف شد', 'success');
          refreshAll();
        } catch (err) { toastError(err); }
      }
    }, icon('trash', 14))
  );

  return el('article', { class: `cb-card cb-card--plan is-${p.status}${hasEvidence ? ' has-evidence' : ''}` },
    head,
    evidence,
    details,
    actions
  );
}

function entryCard(e) {
  const planTitle = e.planId ? plans.find((p) => p.id === e.planId)?.title ?? null : null;
  const images = e.attachments.filter((a) => a.kind === 'image');
  const docs = e.attachments.filter((a) => a.kind === 'doc');

  const head = el('div', { class: 'cb-card__head' },
    el('span', { class: 'cb-card__date' }, dateLabelOf(e.eventDate)),
    el('h3', { class: 'cb-card__title' }, e.title),
    el('span', { class: 'spacer' }),
    planTitle ? el('span', { class: 'cb-planlink', title: 'این رویداد به این فاز برنامه متصل است' }, icon('link', 12), planTitle) : null
  );

  const tagRow = e.tags.length > 0
    ? el('div', { class: 'cb-tags' },
      e.tags.map((t) => el('button', {
        class: `chip cb-chip cb-chip--tag${filters.tag === t ? ' is-active' : ''}`,
        onclick: () => { filters.tag = filters.tag === t ? null : t; refreshAll(); }
      }, icon('tag', 11), t))
    )
    : null;

  let bodyText = null;
  if (e.body) {
    const long = e.body.length > 220;
    const p = el('p', { class: 'cb-card__body' }, long ? e.body.slice(0, 220) + '…' : e.body);
    if (long) {
      const toggle = el('button', { class: 'cb-morelink print-hide' }, 'نمایش کامل');
      toggle.addEventListener('click', () => {
        const expanded = p.textContent.length > 221;
        p.textContent = expanded ? e.body.slice(0, 220) + '…' : e.body;
        toggle.textContent = expanded ? 'نمایش کامل' : 'جمع کردن';
      });
      bodyText = el('div', { class: 'cb-card__bodywrap' }, p, toggle);
    } else {
      bodyText = el('div', { class: 'cb-card__bodywrap' }, p);
    }
  }

  const media = el('div', { class: 'cb-media' });
  for (const img of images) {
    const thumb = el('button', {
      class: 'cb-thumb',
      title: `${img.filename}${img.caption ? ' — ' + img.caption : ''}`,
      'aria-label': img.caption || img.filename,
      onclick: () => openImageModal(e, img)
    }, img.caption ? el('figcaption', { class: 'cb-thumb__cap' }, img.caption) : null);
    fileObjectUrl(e.id, img.id)
      .then((url) => {
        thumb.style.setProperty('--img', `url('${url}')`);
        thumb.classList.add('is-loaded');
      })
      .catch(() => {
        thumb.replaceChildren(icon('alert', 16));
      });
    media.appendChild(thumb);
  }
  for (const doc of docs) {
    media.appendChild(el('button', {
      class: 'cb-doc',
      title: `${doc.filename} — ${sizeLabel(doc.size)}`,
      onclick: () => downloadAttachment(e.id, doc)
    }, icon('file', 15), el('span', { class: 'cb-doc__name' }, doc.filename), el('span', { class: 'cb-doc__size' }, sizeLabel(doc.size))));
  }

  const actions = el('div', { class: 'cb-card__actions print-hide' },
    el('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'ویرایش رویداد', 'aria-label': 'ویرایش رویداد', onclick: () => openEntryModal({ entry: e }) }, icon('edit', 14)),
    el('button', {
      class: 'btn btn--ghost btn--icon btn--sm cb-danger',
      title: 'حذف رویداد', 'aria-label': 'حذف رویداد',
      onclick: async () => {
        const ok = await confirmModal({ title: 'حذف رویداد', message: `رویداد «${e.title}» و همهٔ عکس‌ها و مستنداتش حذف شود؟`, confirmLabel: 'حذف', danger: true });
        if (!ok) return;
        try {
          await api.del(`/api/clearbook/entries/${e.id}`);
          toast('رویداد حذف شد', 'success');
          refreshAll();
        } catch (err) { toastError(err); }
      }
    }, icon('trash', 14))
  );

  return el('article', { class: 'cb-card cb-card--entry' }, head, tagRow, bodyText, media, actions);
}

// ─── نمایشگر عکس (کپشن + حذف) ───

function openImageModal(entry, file) {
  let url = null;
  const img = el('img', { class: 'cb-viewer__img', alt: file.filename });
  const captionInput = el('input', { class: 'input', value: file.caption ?? '', maxlength: '120', placeholder: 'کپشن اختیاری — زیر عکس در آلبوم چاپی می‌آید', 'aria-label': 'کپشن عکس' });

  fileObjectUrl(entry.id, file.id).then((u) => {
    url = u;
    img.src = u;
  }).catch(() => img.replaceWith(el('p', {}, 'دریافت تصویر ناموفق بود')));

  const body = el('div', { class: 'cb-viewer' },
    img,
    el('div', { class: 'cb-viewer__meta' },
      el('span', { class: 'cb-doc__name' }, file.filename),
      el('span', { class: 'cb-doc__size' }, sizeLabel(file.size))
    ),
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'کپشن عکس'), captionInput)
  );

  const modal = openModal({
    title: 'مشاهده عکس',
    body,
    wide: true,
    actions: [
      (close) => el('button', { class: 'btn btn--soft', onclick: () => downloadAttachment(entry.id, file) }, icon('download', 15), 'دانلود'),
      (close) => el('button', {
        class: 'btn btn--danger',
        onclick: async () => {
          const ok = await confirmModal({ title: 'حذف عکس', message: 'این عکس از رویداد حذف شود؟', confirmLabel: 'حذف', danger: true });
          if (!ok) return;
          try {
            await api.del(`/api/clearbook/entries/${entry.id}/files/${file.id}`);
            toast('عکس حذف شد', 'success');
            close();
            refreshEntries({ reset: true });
          } catch (err) { toastError(err); }
        }
      }, icon('trash', 15), 'حذف عکس'),
      (close) => el('button', {
        class: 'btn btn--primary',
        onclick: async () => {
          try {
            await api.patch(`/api/clearbook/entries/${entry.id}/files/${file.id}`, { caption: captionInput.value.trim() || null });
            toast('کپشن ذخیره شد', 'success');
            close();
            refreshEntries({ reset: true });
          } catch (err) { toastError(err); }
        }
      }, icon('check', 15), 'ذخیره کپشن')
    ]
  });
}

// ─── مودال ثبت/ویرایش رویداد ───

function tagsEditor(initialTags = []) {
  const state = [...initialTags];
  const chips = el('div', { class: 'cb-tagbox__chips' });
  const input = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'برچسب تایپ کنید و Enter بزنید…',
    'aria-label': 'برچسب‌ها',
    list: 'cb-tag-suggestions'
  });
  const datalist = el('datalist', { id: 'cb-tag-suggestions' },
    tagList.map((t) => el('option', { value: t.tag })));

  function draw() {
    chips.replaceChildren(
      ...state.map((t, i) => el('span', { class: 'chip cb-chip cb-chip--tag is-active' },
        icon('tag', 11), t,
        el('button', { type: 'button', class: 'cb-tagbox__x', 'aria-label': `حذف برچسب ${t}`, onclick: () => { state.splice(i, 1); draw(); } }, icon('x', 10))
      ))
    );
  }
  function commit() {
    const v = input.value.replace(/\s+/g, ' ').trim();
    if (v.length >= 2 && !state.includes(v) && state.length < 8) state.push(v);
    input.value = '';
    draw();
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !input.value && state.length) {
      state.pop();
      draw();
    }
  });
  input.addEventListener('blur', commit);
  draw();
  return { root: el('div', { class: 'cb-tagbox' }, chips, input, datalist), tags: () => state };
}

function openEntryModal({ entry = null, plan = null } = {}) {
  const isEdit = Boolean(entry);
  const photos = []; // { file, caption, url }
  const docs = []; // { file }

  const titleInput = el('input', { class: 'input', type: 'text', value: entry?.title ?? '', maxlength: '150', placeholder: 'مثلاً: جشن پایان سال مرکز' });
  const dateInput = jalaliDateInput({ value: entry?.eventDate ?? plan?.fromDate ?? tehranTodayYmd(), allowClear: false });
  const bodyInput = el('textarea', { class: 'textarea', rows: '3', maxlength: '4000', placeholder: 'توضیح کوتاه رویداد (اختیاری)' }, entry?.body ?? '');

  const planSelect = el('select', { class: 'select' },
    el('option', { value: '' }, 'بدون اتصال به فاز برنامه'),
    ...plans.map((p) => el('option', { value: p.id }, `${p.title} (${rangeLabel(p.fromDate, p.toDate)})`))
  );
  planSelect.value = entry?.planId ?? plan?.id ?? '';

  const editor = tagsEditor(entry?.tags ?? (plan?.tag ? [plan.tag] : []));

  // انتخاب عکس‌ها
  const photoList = el('div', { class: 'cb-uploadlist' });
  const photoInput = el('input', { class: 'input', type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true });
  photoInput.addEventListener('change', () => {
    for (const f of Array.from(photoInput.files ?? [])) {
      if (!isImageFile(f)) continue;
      if (f.size > MAX_FILE_BYTES) { toast(`حجم «${f.name}» بیش از ${sizeLabel(MAX_FILE_BYTES)} است`, 'error'); continue; }
      const item = { file: f, caption: '', url: URL.createObjectURL(f) };
      photos.push(item);
      const capInput = el('input', {
        class: 'input input--sm', type: 'text', maxlength: '120',
        placeholder: 'کپشن اختیاری این عکس'
      });
      capInput.addEventListener('input', () => { item.caption = capInput.value.trim(); });
      const row = el('div', { class: 'cb-uploadlist__row' },
        el('img', { class: 'cb-uploadlist__thumb', src: item.url, alt: f.name }),
        el('div', { class: 'cb-uploadlist__meta' },
          el('span', { class: 'cb-doc__name' }, f.name),
          el('span', { class: 'cb-doc__size' }, sizeLabel(f.size)),
          capInput
        ),
        el('button', { type: 'button', class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'حذف از فهرست', onclick: () => { photos.splice(photos.indexOf(item), 1); row.remove(); } }, icon('x', 14))
      );
      photoList.appendChild(row);
    }
    photoInput.value = '';
  });

  const docList = el('div', { class: 'cb-uploadlist' });
  const docInput = el('input', { class: 'input', type: 'file', accept: '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv', multiple: true });
  docInput.addEventListener('change', () => {
    for (const f of Array.from(docInput.files ?? [])) {
      if (isImageFile(f)) continue;
      if (f.size > MAX_FILE_BYTES) { toast(`حجم «${f.name}» بیش از ${sizeLabel(MAX_FILE_BYTES)} است`, 'error'); continue; }
      docs.push({ file: f });
      docList.appendChild(el('div', { class: 'cb-uploadlist__row' },
        icon('file', 16),
        el('div', { class: 'cb-uploadlist__meta' },
          el('span', { class: 'cb-doc__name' }, f.name),
          el('span', { class: 'cb-doc__size' }, sizeLabel(f.size))
        ),
        el('button', { type: 'button', class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'حذف از فهرست', onclick: (e) => { const i = docs.findIndex((d) => d.file === f); if (i >= 0) docs.splice(i, 1); e.currentTarget.closest('.cb-uploadlist__row').remove(); } }, icon('x', 14))
      ));
    }
    docInput.value = '';
  });

  const progress = el('p', { class: 'cb-progress', 'aria-live': 'polite' });

  const body = el('div', { class: 'cb-form' },
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'عنوان رویداد *'), titleInput),
    el('div', { class: 'cb-form__grid' },
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'تاریخ رویداد *'), dateInput.root),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'اتصال به فاز برنامه'), planSelect)
    ),
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'برچسب‌ها (برای فیلتر خط زمانی)'), editor.root),
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'توضیح'), bodyInput),
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'عکس‌ها (فشرده‌سازی خودکار)'), photoInput, photoList),
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'مستندات (PDF/Word/Excel)'), docInput, docList),
    progress
  );

  openModal({
    title: isEdit ? 'ویرایش رویداد' : 'ثبت رویداد جدید',
    body,
    wide: true,
    onClose: () => {
      for (const p of photos) URL.revokeObjectURL(p.url);
    },
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', onclick: () => close() }, 'انصراف'),
      (close) => el('button', {
        class: 'btn btn--primary',
        onclick: async () => {
          const title = titleInput.value.trim();
          const eventDate = dateInput.getYmd();
          if (title.length < 2) { toast('عنوان حداقل ۲ نویسه است', 'error'); return; }
          if (!eventDate) { toast('تاریخ رویداد را انتخاب کنید', 'error'); return; }
          if (photos.length + docs.length > 10) { toast('حداکثر ۱۰ فایل در هر بار بارگذاری', 'error'); return; }

          try {
            let entryId = entry?.id;
            if (isEdit) {
              await api.patch(`/api/clearbook/entries/${entryId}`, {
                title,
                body: bodyInput.value.trim(),
                event_date: eventDate,
                plan_id: planSelect.value || null,
                tags: editor.tags()
              });
            } else {
              const created = await api.post('/api/clearbook/entries', {
                title,
                body: bodyInput.value.trim(),
                event_date: eventDate,
                plan_id: planSelect.value || null,
                tags: editor.tags()
              });
              entryId = created.data.id;
            }

            const total = photos.length + docs.length;
            let done = 0;
            for (const item of photos) {
              done += 1;
              progress.textContent = `بارگذاری عکس ${fa(done)} از ${fa(total)}…`;
              const compressed = await compressImage(item.file);
              const fileId = await uploadChunked(entryId, compressed, (pct) => {
                progress.textContent = `بارگذاری عکس ${fa(done)} از ${fa(total)} — ${fa(pct)}٪`;
              });
              if (item.caption) {
                await api.patch(`/api/clearbook/entries/${entryId}/files/${fileId}`, { caption: item.caption });
              }
            }
            for (const item of docs) {
              done += 1;
              progress.textContent = `بارگذاری سند ${fa(done)} از ${fa(total)}…`;
              await uploadChunked(entryId, item.file, (pct) => {
                progress.textContent = `بارگذاری سند ${fa(done)} از ${fa(total)} — ${fa(pct)}٪`;
              });
            }

            toast(isEdit ? 'رویداد به‌روزرسانی شد' : 'رویداد ثبت شد', 'success');
            close();
            refreshAll();
          } catch (err) {
            toastError(err);
          }
        }
      }, icon('save', 15), isEdit ? 'ذخیره تغییرات' : 'ثبت رویداد')
    ]
  });
}

// ─── مودال ثبت/ویرایش فاز برنامه ───

function openPlanModal({ plan = null } = {}) {
  const isEdit = Boolean(plan);
  const titleInput = el('input', { class: 'input', type: 'text', value: plan?.title ?? '', maxlength: '150', placeholder: 'مثلاً: فاز اختلالات یادگیری (SLD)' });
  const fromInput = jalaliDateInput({ value: plan?.fromDate ?? '', allowClear: false });
  const toInput = jalaliDateInput({ value: plan?.toDate ?? '' });
  const tagInput = el('input', { class: 'input', type: 'text', value: plan?.tag ?? '', maxlength: '40', list: 'cb-tag-suggestions', placeholder: 'مثلاً: اختلالات یادگیری — پیشنهاد برچسب برای فعالیت‌های این فاز' });
  const datalist = el('datalist', { id: 'cb-tag-suggestions-2' }, tagList.map((t) => el('option', { value: t.tag })));
  tagInput.setAttribute('list', 'cb-tag-suggestions-2');

  const statusSelect = el('select', { class: 'select' },
    el('option', { value: 'planned' }, STATUS_LABELS.planned),
    el('option', { value: 'active' }, STATUS_LABELS.active),
    el('option', { value: 'done' }, STATUS_LABELS.done)
  );
  statusSelect.value = plan?.status ?? 'planned';

  const adminInput = el('textarea', { class: 'textarea', rows: '3', maxlength: '2000', placeholder: 'بخشنامه‌ها، جلسات با اداره، توجیهی‌ها…' }, plan?.adminActions ?? '');
  const centerInput = el('textarea', { class: 'textarea', rows: '3', maxlength: '2000', placeholder: 'خروجی و اقدام عملیاتی مرکز در این بازه…' }, plan?.centerActions ?? '');

  const body = el('div', { class: 'cb-form' },
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'عنوان فاز (خطیه اجرایی) *'), titleInput),
    el('div', { class: 'cb-form__grid cb-form__grid--3' },
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'از تاریخ *'), fromInput.root),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'تا تاریخ'), toInput.root),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'وضعیت'), statusSelect)
    ),
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'برچسب پیشنهادی فاز'), tagInput, datalist),
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'اقدامات اداری و جلسات'), adminInput),
    el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'خروجی / اقدام عملیاتی مرکز'), centerInput)
  );

  openModal({
    title: isEdit ? 'ویرایش فاز برنامه' : 'فاز جدید تقویم اجرایی',
    body,
    wide: true,
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', onclick: () => close() }, 'انصراف'),
      (close) => el('button', {
        class: 'btn btn--primary',
        onclick: async () => {
          const title = titleInput.value.trim();
          const fromDate = fromInput.getYmd();
          if (title.length < 2) { toast('عنوان فاز حداقل ۲ نویسه است', 'error'); return; }
          if (!fromDate) { toast('تاریخ شروع فاز را انتخاب کنید', 'error'); return; }
          const toDate = toInput.getYmd() || null;
          if (toDate && toDate < fromDate) { toast('«تا تاریخ» نمی‌تواند قبل از «از تاریخ» باشد', 'error'); return; }
          const tag = tagInput.value.replace(/\s+/g, ' ').trim();
          const payload = {
            title,
            admin_actions: adminInput.value.trim(),
            center_actions: centerInput.value.trim(),
            from_date: fromDate,
            to_date: toDate,
            status: statusSelect.value,
            tag: tag.length >= 2 ? tag : null
          };
          try {
            if (isEdit) await api.patch(`/api/clearbook/plans/${plan.id}`, payload);
            else await api.post('/api/clearbook/plans', payload);
            toast(isEdit ? 'فاز به‌روزرسانی شد' : 'فاز افزوده شد — روی خط زمانی خاکستری نمایش داده می‌شود', 'success');
            close();
            refreshAll();
          } catch (err) { toastError(err); }
        }
      }, icon('save', 15), isEdit ? 'ذخیره تغییرات' : 'افزودن فاز')
    ]
  });
}

// ─── مدیریت تقویم اجرایی (جدول فازها) ───

function openPlansManager() {
  const list = el('div', { class: 'cb-plansmgr' });

  function draw() {
    const sorted = [...plans].sort((a, b) => (a.fromDate < b.fromDate ? -1 : a.fromDate > b.fromDate ? 1 : a.sortOrder - b.sortOrder));
    if (sorted.length === 0) {
      list.replaceChildren(
        emptyState({
          iconName: 'clipboard',
          title: 'تقویم اجرایی خالی است',
          hint: 'قالب استاندارد ۱۲ فازهٔ مرکز (مهر تا شهریور) را درج کنید یا فازها را دستی بسازید.'
        })
      );
      return;
    }
    const rows = sorted.map((p, idx) => {
      const statusSel = el('select', { class: 'select select--sm', 'aria-label': 'وضعیت' },
        el('option', { value: 'planned' }, STATUS_LABELS.planned),
        el('option', { value: 'active' }, STATUS_LABELS.active),
        el('option', { value: 'done' }, STATUS_LABELS.done)
      );
      statusSel.value = p.status;
      statusSel.addEventListener('change', async () => {
        try {
          await api.patch(`/api/clearbook/plans/${p.id}`, { status: statusSel.value });
          p.status = statusSel.value;
          toast('وضعیت فاز به‌روزرسانی شد', 'success');
        } catch (err) { toastError(err); }
      });

      const move = async (dir) => {
        const ids = sorted.map((x) => x.id);
        const j = idx + dir;
        if (j < 0 || j >= ids.length) return;
        [ids[idx], ids[j]] = [ids[j], ids[idx]];
        try {
          await api.post('/api/clearbook/plans/reorder', { ids });
          await loadPlans();
          draw();
        } catch (err) { toastError(err); }
      };

      return el('div', { class: 'cb-plansmgr__row' },
        el('div', { class: 'cb-plansmgr__main' },
          el('b', {}, p.title),
          el('span', { class: 'cb-doc__size' }, `${rangeLabel(p.fromDate, p.toDate)} · ${fa(p.evidence?.count ?? 0)} فعالیت${p.tag ? ` · ${p.tag}` : ''}`)
        ),
        statusSel,
        el('div', { class: 'cb-plansmgr__ops' },
          el('button', { class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'بالا', disabled: idx === 0, onclick: () => move(-1) }, icon('chevR', 14)),
          el('button', { class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'پایین', disabled: idx === sorted.length - 1, onclick: () => move(1) }, icon('chevL', 14)),
          el('button', { class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'ویرایش', onclick: () => openPlanModal({ plan: p }) }, icon('edit', 14)),
          el('button', {
            class: 'btn btn--ghost btn--icon btn--sm cb-danger', 'aria-label': 'حذف',
            onclick: async () => {
              const ok = await confirmModal({ title: 'حذف فاز', message: `فاز «${p.title}» حذف شود؟ رویدادهای متصل حذف نمی‌شوند.`, confirmLabel: 'حذف', danger: true });
              if (!ok) return;
              try {
                await api.del(`/api/clearbook/plans/${p.id}`);
                await loadPlans();
                draw();
                toast('فاز حذف شد', 'success');
              } catch (err) { toastError(err); }
            }
          }, icon('trash', 14))
        )
      );
    });
    list.replaceChildren(...rows);
  }

  async function loadPlans() {
    const res = await api.get('/api/clearbook/plans');
    plans = res.data ?? [];
  }

  draw();

  const currentSchoolYear = filters.year ?? schoolYearOf(tehranTodayYmd());

  openModal({
    title: 'تقویم اجرایی — فازهای برنامهٔ سالانه',
    body: el('div', {}, list),
    wide: true,
    actions: [
      (close) => el('button', {
        class: 'btn btn--soft',
        onclick: async () => {
          const ok = await confirmModal({
            title: 'درج قالب استاندارد',
            message: `۱۲ فاز استاندارد مرکز (مهر ${schoolYearLabel(currentSchoolYear)}) درج شود؟ اگر برای این بازه قبلاً فاز ثبت شده باشد، درج رد می‌شود.`,
            confirmLabel: 'درج قالب'
          });
          if (!ok) return;
          try {
            const res = await api.post('/api/clearbook/plans/seed-template', { start_year: currentSchoolYear });
            toast(`${fa(res.data.count)} فاز استاندارد درج شد`, 'success');
            close();
            refreshAll();
          } catch (err) { toastError(err); }
        }
      }, icon('download', 15), 'درج قالب استاندارد'),
      (close) => el('button', {
        class: 'btn btn--soft',
        onclick: async () => {
          const ok = await confirmModal({
            title: 'کپی تقویم برای سال تحصیلی بعد',
            message: `همهٔ فازهای سال ${schoolYearLabel(currentSchoolYear)} با تاریخ‌های یک‌سال جابه‌جا شده برای سال ${schoolYearLabel(currentSchoolYear + 1)} کپی شود؟ وضعیت‌ها به «برنامه‌ریزی‌شده» برمی‌گردند.`,
            confirmLabel: 'کپی'
          });
          if (!ok) return;
          try {
            const res = await api.post('/api/clearbook/plans/copy', { from_year: currentSchoolYear, to_year: currentSchoolYear + 1 });
            toast(`${fa(res.data.count)} فاز برای سال بعد کپی شد`, 'success');
            close();
            refreshAll();
          } catch (err) { toastError(err); }
        }
      }, icon('copy', 15), 'کپی برای سال بعد'),
      (close) => el('button', { class: 'btn btn--primary', onclick: () => { close(); openPlanModal(); } }, icon('plus', 15), 'فاز جدید')
    ]
  });
}

// ─── چاپ ───

function printRootMount(content) {
  let root = document.getElementById('cb-print-root');
  if (!root) {
    root = el('div', { id: 'cb-print-root' });
    document.body.appendChild(root);
  }
  root.replaceChildren(content);
  document.body.classList.add('cb-printing');
  const cleanup = () => {
    document.body.classList.remove('cb-printing');
    root.replaceChildren(); // خالی‌سازی — تا قاعدهٔ @page تزریق‌شده روی چاپ‌های دیگر اثر نگذارد
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(() => window.print(), 400);
}

function printStats(items, entriesList) {
  let images = 0;
  let docs = 0;
  for (const e of entriesList) {
    images += e.attachments.filter((a) => a.kind === 'image').length;
    docs += e.attachments.filter((a) => a.kind === 'doc').length;
  }
  return { plans: items.filter((i) => i.kind === 'plan').length, entries: entriesList.length, images, docs };
}

async function fetchAllEntriesForPrint() {
  const all = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.q) params.set('q', filters.q);
    params.set('limit', '200');
    params.set('offset', String(offset));
    const res = await api.get(`/api/clearbook/entries?${params.toString()}`);
    const items = res.data ?? [];
    all.push(...items);
    if (!res.meta?.hasMore || items.length === 0) break;
    offset += items.length;
  }
  return all;
}

async function printAlbum() {
  try {
    toast('در حال آماده‌سازی آلبوم چاپی…');
    const entriesList = await fetchAllEntriesForPrint();
    const planItems = plansInRange().map((p) => ({ kind: 'plan', date: p.fromDate, plan: p }));
    const items = planItems.concat(entriesList.map((e) => ({ kind: 'entry', date: e.eventDate, entry: e })))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (items.length === 0) {
      toast('برای این بازه چیزی برای چاپ نیست', 'error');
      return;
    }
    const stats = printStats(items, entriesList);
    const rangeText = filters.from ? `بازهٔ ${rangeLabel(filters.from, filters.to || filters.from)}` : 'همهٔ بازه‌ها';

    const cover = el('div', { class: 'cbp-cover' },
      el('div', { class: 'cbp-cover__brand' }, clinicName),
      el('h1', { class: 'cbp-cover__title' }, 'آلبوم فعالیت‌های مرکز'),
      el('p', { class: 'cbp-cover__sub' }, rangeText),
      el('p', { class: 'cbp-cover__stats' },
        `فازهای برنامه: ${fa(stats.plans)} · رویدادهای ثبت‌شده: ${fa(stats.entries)} · عکس: ${fa(stats.images)} · مستند: ${fa(stats.docs)}`)
    );

    const content = el('div', { class: 'cbp' });
    let lastMonthKey = '';
    let order = 0;
    const totalPlans = planItems.length;

    for (const item of items) {
      const mk = monthKeyOf(item.date);
      if (mk !== lastMonthKey) {
        lastMonthKey = mk;
        content.appendChild(el('h2', { class: 'cbp-month' }, monthLabelOf(item.date)));
      }
      if (item.kind === 'plan') {
        order += 1;
        const p = item.plan;
        content.appendChild(el('div', { class: 'cbp-plan' },
          el('div', { class: 'cbp-plan__head' },
            el('span', { class: 'cbp-plan__badge' }, `فاز ${fa(order)}/${fa(totalPlans)} — برنامه`),
            el('b', {}, p.title),
            el('span', { class: 'cbp-plan__date' }, rangeLabel(p.fromDate, p.toDate)),
            el('span', { class: 'cbp-plan__status' }, `وضعیت: ${STATUS_LABELS[p.status] ?? p.status} — ${fa(p.evidence?.count ?? 0)} فعالیت ثبت‌شده`)
          ),
          p.adminActions ? el('p', { class: 'cbp-plan__sec' }, el('b', {}, 'اقدامات اداری و جلسات: '), p.adminActions) : null,
          p.centerActions ? el('p', { class: 'cbp-plan__sec' }, el('b', {}, 'خروجی / اقدام عملیاتی مرکز: '), p.centerActions) : null
        ));
        continue;
      }
      const e = item.entry;
      const block = el('div', { class: 'cbp-entry' },
        el('div', { class: 'cbp-entry__head' },
          el('b', {}, e.title),
          el('span', { class: 'cbp-entry__date' }, dateLabelOf(e.eventDate)),
          e.tags.length ? el('span', { class: 'cbp-entry__tags' }, e.tags.join(' · ')) : null
        ),
        e.body ? el('p', { class: 'cbp-entry__body' }, e.body) : null
      );
      const imgs = e.attachments.filter((a) => a.kind === 'image');
      const docsList = e.attachments.filter((a) => a.kind === 'doc');
      if (imgs.length > 0) {
        const grid = el('div', { class: 'cbp-grid' });
        for (const img of imgs) {
          try {
            const url = await fileObjectUrl(e.id, img.id);
            grid.appendChild(el('figure', { class: 'cbp-fig' },
              el('img', { src: url, alt: img.caption || img.filename }),
              img.caption ? el('figcaption', {}, img.caption) : null
            ));
          } catch { /* عکس در دسترس نبود — رد می‌شود */ }
        }
        block.appendChild(grid);
      }
      if (docsList.length > 0) {
        block.appendChild(el('p', { class: 'cbp-entry__docs' },
          `مستندات پیوست: ${docsList.map((d) => d.filename).join('، ')}`));
      }
      content.appendChild(block);
    }

    const printDom = el('div', {},
      cover,
      content,
      el('p', { class: 'cbp-foot' }, `تاریخ تهیه: ${fa(formatJalaliNumeric(tehranTodayYmd()))} — ${clinicName}`)
    );
    printRootMount(printDom);
  } catch (err) {
    toastError(err);
  }
}

function printCalendar() {
  const planItems = plansInRange();
  if (planItems.length === 0) {
    toast('برای این بازه فازی ثبت نشده است', 'error');
    return;
  }
  const sorted = [...planItems].sort((a, b) => (a.fromDate < b.fromDate ? -1 : 1));
  const rangeText = filters.from ? `بازهٔ ${rangeLabel(filters.from, filters.to || filters.from)}` : 'همهٔ بازه‌ها';

  const table = el('table', { class: 'cbp-table' },
    el('thead', {},
      el('tr', {},
        el('th', {}, '#'),
        el('th', {}, 'بازهٔ زمانی'),
        el('th', {}, 'خطیهٔ اجرایی'),
        el('th', {}, 'اقدامات اداری و جلسات'),
        el('th', {}, 'خروجی / اقدام عملیاتی مرکز'),
        el('th', {}, 'وضعیت'),
        el('th', {}, 'شواهد اجرا')
      )
    ),
    el('tbody', {},
      sorted.map((p, i) => el('tr', {},
        el('td', {}, fa(i + 1)),
        el('td', {}, rangeLabel(p.fromDate, p.toDate)),
        el('td', { class: 'cbp-table__title' }, p.title, p.tag ? el('span', { class: 'cbp-table__tag' }, p.tag) : null),
        el('td', { class: 'cbp-table__text' }, p.adminActions || '—'),
        el('td', { class: 'cbp-table__text' }, p.centerActions || '—'),
        el('td', {}, STATUS_LABELS[p.status] ?? p.status),
        el('td', {}, fa(p.evidence?.count ?? 0))
      ))
    )
  );

  printRootMount(el('div', {},
    el('style', {}, '@page { size: A4 landscape; margin: 10mm; }'), // فقط برای همین چاپ تزریق می‌شود
    el('div', { class: 'cbp cbp--landscape' },
      el('div', { class: 'cbp-cover cbp-cover--compact' },
        el('div', { class: 'cbp-cover__brand' }, clinicName),
        el('h1', { class: 'cbp-cover__title cbp-cover__title--sm' }, 'تقویم اجرایی و عملیاتی مرکز'),
        el('p', { class: 'cbp-cover__sub' }, rangeText)
      ),
      table,
      el('p', { class: 'cbp-foot' }, `تاریخ تهیه: ${fa(formatJalaliNumeric(tehranTodayYmd()))} — ${clinicName}`)
    )
  ));
}
