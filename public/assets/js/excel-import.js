import { api } from './api.js';
import { el, icon, toast, toastError, openModal } from './ui.js';
import { fa, enDigits, toJalali } from './format.js';

// ─── درون‌ریزی اکسل: ویزارد چهارگامی سمت مرورگر ───
//   گام ۱ دریافت قالب (خالی یا «داده‌های فعلی» برای ویرایش)
//   گام ۲ بارگذاری فایل پرشده (پارس با SheetJS وندورشده — lazy load)
//   گام ۳ بازبینی سطری از سرور (افزودن / ویرایش / خطا)
//   گام ۴ ثبت نهایی + به‌روزرسانی نمای منو
// تعریف ستون‌ها از GET /api/import/registry می‌آید (منبع حقیقت: backend registry)

const XLSX_URL = '/assets/vendor/xlsx.full.min.js';
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const STATUS_META = {
  add: { label: 'افزودن', cls: 'badge--success' },
  update: { label: 'ویرایش', cls: 'badge--info' },
  error: { label: 'خطا', cls: 'badge--error' }
};

let xlsxPromise = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = XLSX_URL;
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => {
        xlsxPromise = null;
        reject(new Error('بارگذاری کتابخانهٔ اکسل ناموفق بود — اتصال را بررسی کنید'));
      };
      document.head.appendChild(s);
    });
  }
  return xlsxPromise;
}

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function headerKey(s) {
  return enDigits(String(s ?? ''))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s\u200c\u200f\u200e_\-./]+/g, '')
    .toLowerCase();
}

/** تاریخ میلادی ذخیره‌شده → شمسی با ارقام لاتین (قالب استاندارد فایل اکسل) */
function gregorianToJalaliLatin(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return String(ymd ?? '');
  const j = toJalali(y, m, d);
  return `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`;
}

function recordValue(record, col) {
  const v = record[col.recordKey ?? col.key];
  if (v === undefined || v === null || v === '') return '';
  if (col.type === 'enum') {
    const opt = (col.options ?? []).find((o) => o.value === v);
    return opt ? opt.label : String(v);
  }
  if (col.type === 'date') return gregorianToJalaliLatin(v);
  return String(v);
}

// ─── ساخت فایل قالب ───

function buildWorkbook(entity, dataAoa) {
  const XLSX = window.XLSX;
  const headers = entity.columns.map((c) => c.label + (c.required ? ' *' : '')); /* I14: ★ فونت‌وابسته به * ساده */
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataAoa]);
  ws['!cols'] = entity.columns.map((c) => ({ wch: c.width ?? 18 }));

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'داده');

  const rules = [
    ['راهنمای درون‌ریزی — ' + entity.title],
    [entity.hint],
    [],
    ['قواعد کلی:'],
    ['۱. سطر اول شیت «داده» سرستون‌ها است؛ نام یا ترتیب آن‌ها را تغییر ندهید (ترتیب مهم نیست، بودن مهم است).'],
    ['۲. هر سطر یک رکورد است؛ سطرهای کاملاً خالی نادیده گرفته می‌شوند.'],
    ['۳. خانهٔ خالی یعنی در ویرایش، مقدار قبلی حفظ شود.'],
    ['۴. تاریخ‌ها شمسی وارد کنید مثل 1404/07/01 یا 1404-7-1 یا 14040701 — خروجی «داده‌های فعلی» هم همین قالب است.'],
    ['۵. ارقام فارسی و لاتین هر دو پذیرفته می‌شود. ستون‌های تلفن و کد را به‌صورت «متن» وارد کنید تا صفر اول حذف نشود.'],
    ['۶. حداکثر ۵۰۰ سطر در هر فایل. سطرهای خطادار ثبت نمی‌شوند و قبل از ثبت به‌صورت قرمز نشان داده می‌شوند.'],
    [`۷. تشخیص ویرایش بر اساس «${entity.keyLabel}» است: اگر همین مقدار قبلاً ثبت شده باشد آن ردیف ویرایش می‌شود، وگرنه اضافه می‌شود.`],
    [],
    ['ستون', 'الزامی', 'توضیح', 'مقادیر مجاز / نمونه'],
    ...entity.columns.map((c) => [
      c.label + (c.required ? ' ★' : ''),
      c.required ? 'بله' : '',
      c.help,
      c.options ? c.options.map((o) => o.label).join(' / ') : (c.example ?? '')
    ])
  ];
  const gws = XLSX.utils.aoa_to_sheet(rules);
  gws['!cols'] = [{ wch: 26 }, { wch: 8 }, { wch: 64 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, gws, 'راهنما');
  return wb;
}

function safeFileName(title) {
  return String(title).replace(/[\\/:*?"<>|]/g, '-');
}

async function downloadWorkbook(entity, withData, btn) {
  await loadXlsx();
  let dataAoa = [];
  if (withData) {
    const res = await api.get(entity.listUrl);
    const records = res.data ?? [];
    dataAoa = records.map((rec) => entity.columns.map((c) => recordValue(rec, c)));
  }
  const wb = buildWorkbook(entity, dataAoa);
  const name = withData
    ? `${safeFileName(entity.title)} — داده‌های فعلی.xlsx`
    : `قالب ${safeFileName(entity.title)}.xlsx`;
  window.XLSX.writeFile(wb, name);
  toast(withData ? 'فایل داده‌های فعلی دانلود شد' : 'قالب اکسل دانلود شد', 'success');
}

// ─── پارس فایل بارگذاری‌شده ───

function normalizeCell(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  }
  return String(v).trim();
}

function knownHeaderMap(entity) {
  const map = new Map();
  for (const c of entity.columns) {
    map.set(headerKey(c.label), c);
    map.set(headerKey(c.key), c);
  }
  return map;
}

function findHeaderRow(entity, grid) {
  const known = knownHeaderMap(entity);
  let bestIdx = -1;
  let best = 0;
  for (let i = 0; i < Math.min(grid.length, 8); i++) {
    const cells = (grid[i] ?? []).map((v) => headerKey(v));
    const hits = cells.filter((c) => known.has(c)).length;
    if (hits > best) {
      best = hits;
      bestIdx = i;
    }
  }
  return best > 0 ? bestIdx : -1;
}

function parseWorkbook(entity, buf) {
  const XLSX = window.XLSX;
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const names = wb.SheetNames ?? [];
  if (names.length === 0) throw new Error('فایل هیچ شیتی ندارد');

  let chosen = null;
  let grid = null;
  const ordered = [...names.filter((n) => headerKey(n) === headerKey('داده')), ...names.filter((n) => headerKey(n) !== headerKey('داده'))];
  for (const n of ordered) {
    const ws = wb.Sheets[n];
    if (!ws) continue;
    const g = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (findHeaderRow(entity, g) >= 0) {
      chosen = n;
      grid = g;
      break;
    }
  }
  if (!grid) {
    throw new Error('سرستون‌های قالب در فایل پیدا نشد — همان فایل قالبی که از سیستم گرفتید را بارگذاری کنید.');
  }

  const headerIdx = findHeaderRow(entity, grid);
  const headerCells = grid[headerIdx] ?? [];
  const known = knownHeaderMap(entity);
  const colMap = headerCells.map((h) => known.get(headerKey(h)) ?? null);
  const unknown = headerCells
    .map((h, i) => ({ h, i }))
    .filter((x) => String(x.h ?? '').trim() !== '' && !colMap[x.i])
    .map((x) => String(x.h).trim());

  const rows = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const cells = grid[i] ?? [];
    const obj = {};
    let any = false;
    colMap.forEach((c, ci) => {
      if (!c) return;
      const v = normalizeCell(cells[ci]);
      obj[c.key] = v;
      if (v !== '') any = true;
    });
    if (any) rows.push(obj);
  }
  return { rows, unknown, sheetName: chosen };
}

// ─── ویزارد ───

const STEP_LABELS = ['دریافت قالب', 'بارگذاری فایل', 'بازبینی داده‌ها', 'ثبت'];

export function openExcelImport({ entity: entityKey, onDone }) {
  const state = {
    step: 1,
    entity: null,
    parsed: null,
    validation: null,
    result: null,
    busy: false
  };

  const box = openModal({
    title: 'درون‌ریزی از اکسل',
    wide: true,
    body: () => el('div', { class: 'imp-root' }, loadingStateLocal('در حال آماده‌سازی…'))
  });

  // پیش‌تر try دور یک IIFE async بود: خطای registry به‌صورت unhandled rejection
  // رها می‌شد و مودال برای همیشه روی «در حال آماده‌سازی…» می‌ماند؛ حالا catch واقعی دارد
  (async () => {
    try {
      const reg = (await api.get('/api/import/registry')).data ?? [];
      const entity = reg.find((e) => e.key === entityKey);
      if (!entity) throw new Error('این بخش برای نقش شما فعال نیست');
      state.entity = entity;
      box.root.querySelector('.modal__title').textContent = `درون‌ریزی از اکسل — ${entity.title}`;
      render();
    } catch (err) {
      toastError(err);
      box.close();
    }
  })();

  function loadingStateLocal(text) {
    return el('div', { class: 'imp-loading' }, el('span', { class: 'spinner' }), text);
  }

  function setBusy(b, text) {
    state.busy = b;
    const foot = box.root.querySelector('.imp-foot');
    if (foot) foot.replaceWith(buildFooter(text));
  }

  function stepper() {
    return el('div', { class: 'imp-steps' },
      ...STEP_LABELS.map((label, i) => {
        const n = i + 1;
        return el('div', { class: `imp-step${n === state.step ? ' is-active' : ''}${n < state.step ? ' is-done' : ''}` },
          el('span', { class: 'imp-step__num' }, n < state.step ? icon('check', 12) : fa(n)),
          el('span', { class: 'imp-step__label' }, label),
          n < STEP_LABELS.length ? el('span', { class: 'imp-step__line', 'aria-hidden': 'true' }) : null
        );
      })
    );
  }

  function buildFooter(busyText) {
    const foot = el('div', { class: 'imp-foot' });
    if (state.busy) {
      foot.append(el('div', { class: 'imp-foot__busy' }, el('span', { class: 'spinner' }), busyText ?? 'در حال کار…'));
      return foot;
    }
    if (state.step === 1) {
      foot.append(
        el('button', { class: 'btn btn--soft btn--sm', onclick: () => goStep(2) }, icon('upload', 15), 'فایل پرشده را دارم — بارگذاری')
      );
    } else if (state.step === 2) {
      foot.append(
        el('button', { class: 'btn btn--ghost btn--sm', onclick: () => goStep(1) }, 'دریافت قالب'),
        state.parsed
          ? el('button', { class: 'btn btn--primary btn--sm', onclick: () => goStep(3) },
              `بررسی داده‌ها (${fa(state.parsed.rows.length)} سطر)`)
          : null
      );
    } else if (state.step === 3) {
      const s = state.validation?.summary ?? { add: 0, update: 0, error: 0 };
      const valid = s.add + s.update;
      foot.append(
        el('button', { class: 'btn btn--ghost btn--sm', onclick: () => goStep(2) }, icon('chevL', 14), 'بارگذاری دوباره'), /* I14: → در RTL به عقبِ جریان اشاره می‌کرد؛ chevL = جلو */
        el('button', {
          class: 'btn btn--primary btn--sm',
          disabled: valid === 0,
          onclick: () => goStep(4)
        }, `ثبت نهایی — ${fa(s.add)} افزودن، ${fa(s.update)} ویرایش`)
      );
    } else if (state.step === 4) {
      foot.append(
        el('button', {
          class: 'btn btn--primary btn--sm',
          onclick: () => { box.close(); if (onDone) onDone(); }
        }, 'بستن و به‌روزرسانی صفحه')
      );
    }
    return foot;
  }

  function render() {
    const body = box.root.querySelector('.modal__body');
    body.replaceChildren(stepper(), stepBody(), buildFooter());
  }

  function goStep(n) {
    state.step = n;
    render();
    if (n === 3) runValidate();
    if (n === 4) runCommit();
  }

  // ─── بدنهٔ هر گام ───

  function stepBody() {
    if (state.step === 1) return step1Body();
    if (state.step === 2) return step2Body();
    if (state.step === 3) return step3Body();
    return step4Body();
  }

  function step1Body() {
    const e = state.entity;
    return el('div', { class: 'imp-step1' },
      el('p', { class: 'imp-hint' }, e.hint),
      el('div', { class: 'imp-cards' },
        el('button', { class: 'imp-card', onclick: (ev) => withBtnBusy(ev, (b) => downloadWorkbook(e, false, b)) },
          el('span', { class: 'imp-card__icon' }, icon('download', 20)),
          el('span', { class: 'imp-card__txt' },
            el('b', {}, 'قالب خالی'),
            el('small', {}, 'فایل اکسل با سرستون‌ها + شیت راهنما')
          )
        ),
        el('button', { class: 'imp-card', onclick: (ev) => withBtnBusy(ev, (b) => downloadWorkbook(e, true, b)) },
          el('span', { class: 'imp-card__icon' }, icon('clipboard', 20)),
          el('span', { class: 'imp-card__txt' },
            el('b', {}, 'داده‌های فعلی (برای ویرایش)'),
            el('small', {}, 'رکوردهای ثبت‌شده در همان قالب — تغییر بدهید و بازگردانید')
          )
        )
      ),
      el('ul', { class: 'imp-tips' },
        el('li', {}, 'خانهٔ خالی در ویرایش یعنی «بدون تغییر» — فقط ستون‌هایی را پر کنید که می‌خواهید عوض شوند.'),
        el('li', {}, 'تاریخ‌ها شمسی مثل ', el('b', { dir: 'ltr' }, '1404/07/01'), ' و وضعیت با برچسب فارسی («در جریان»، «تکمیل»…).'),
        el('li', {}, `بعد از پر کردن، فایل را در گام بعد بارگذاری کنید؛ قبل از ثبت، همهٔ سطرها بازبینی می‌شوند.`)
      )
    );
  }

  async function withBtnBusy(ev, fn) {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.classList.add('is-busy');
    try {
      await fn(btn);
    } catch (err) {
      toastError(err);
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  }

  function step2Body() {
    const e = state.entity;
    const input = el('input', { type: 'file', accept: '.xlsx,.xls', style: { display: 'none' } });
    input.addEventListener('change', () => {
      if (input.files?.[0]) handleFile(input.files[0]);
      input.value = '';
    });

    const zone = el('div', { class: 'imp-dropzone', tabindex: '0', role: 'button', 'aria-label': 'انتخاب فایل اکسل' },
      el('span', { class: 'imp-dropzone__icon' }, icon('upload', 26)),
      el('b', {}, 'فایل اکسل را اینجا رها کنید یا کلیک کنید'),
      el('small', {}, `قالب «${e.title}» — پسوند xlsx یا xls (حداکثر ۸ مگابایت)`)
    );
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); } });
    zone.addEventListener('dragover', (ev) => { ev.preventDefault(); zone.classList.add('is-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (ev) => {
      ev.preventDefault();
      zone.classList.remove('is-over');
      const f = ev.dataTransfer?.files?.[0];
      if (f) handleFile(f);
    });

    const info = el('div', { class: 'imp-fileinfo' });

    if (state.parseError) {
      info.append(el('div', { class: 'imp-alert imp-alert--error' }, icon('alert', 16), state.parseError));
    }
    if (state.parsed) {
      info.append(
        el('div', { class: 'imp-alert imp-alert--ok' },
          icon('check', 16),
          el('span', {},
            `فایل «${state.parsed.fileName}» — شیت «${state.parsed.sheetName}» — `,
            el('b', {}, `${fa(state.parsed.rows.length)} سطر`), ' آمادهٔ بررسی است.'
          )
        ),
        state.parsed.unknown.length > 0
          ? el('div', { class: 'imp-alert imp-alert--warn' },
              icon('info', 16),
              `این سرستون‌ها شناخته نشدند و نادیده گرفته می‌شوند: ${state.parsed.unknown.join('، ')}`
            )
          : null
      );
    }

    return el('div', { class: 'imp-step2' }, zone, info, input);
  }

  async function handleFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      state.parsed = null;
      state.parseError = 'حجم فایل بیش از ۸ مگابایت است.';
      render();
      return;
    }
    setBusy(true, 'در حال خواندن فایل…');
    try {
      await loadXlsx();
      const buf = await file.arrayBuffer();
      state.parsed = parseWorkbook(state.entity, buf);
      state.parsed.fileName = file.name;
      state.parseError = null;
      if (state.parsed.rows.length === 0) {
        state.parseError = 'هیچ سطر داده‌ای در فایل پیدا نشد — سطر اول بعد از سرستون‌ها باید پر باشد.';
        state.parsed = null;
      }
    } catch (err) {
      state.parsed = null;
      state.parseError = err?.message ?? 'خواندن فایل ناموفق بود';
    } finally {
      state.busy = false;
      render();
    }
  }

  function step3Body() {
    const v = state.validation;
    if (!v) {
      return el('div', { class: 'imp-loading-wrap' }, loadingStateLocal('سرور داده‌ها را بررسی می‌کند…'));
    }
    const head = el('div', { class: 'imp-summary' },
      el('span', { class: 'badge badge--neutral' }, `${fa(v.total)} سطر در فایل`),
      el('span', { class: 'badge badge--success' }, `افزودن: ${fa(v.summary.add)}`),
      el('span', { class: 'badge badge--info' }, `ویرایش: ${fa(v.summary.update)}`),
      el('span', { class: 'badge badge--error' }, `خطا: ${fa(v.summary.error)}`)
    );

    const cols = state.entity.columns;
    const table = el('table', { class: 'imp-table' },
      el('thead', {},
        el('tr', {},
          el('th', { class: 'imp-table__idx' }, 'سطر'),
          el('th', {}, 'وضعیت'),
          ...cols.map((c) => el('th', {}, c.label)),
          el('th', { class: 'imp-table__err' }, 'توضیح')
        )
      ),
      el('tbody', {},
        ...v.rows.map((r) =>
          el('tr', { class: r.status === 'error' ? 'imp-row--error' : '' },
            el('td', { class: 'imp-table__idx' }, fa(r.index)),
            el('td', {}, el('span', { class: `badge ${STATUS_META[r.status].cls}` }, STATUS_META[r.status].label)),
            ...cols.map((c) => el('td', {}, r.display[c.key] ?? '')),
            el('td', { class: 'imp-table__err' },
              r.errors.length > 0 ? r.errors.join(' — ') : el('span', { class: 'imp-muted' }, '—')
            )
          )
        )
      )
    );

    return el('div', { class: 'imp-step3' },
      head,
      v.summary.error > 0
        ? el('p', { class: 'imp-note' }, 'سطرهای قرمز ثبت نمی‌شوند — می‌توانید فایل را اصلاح کنید و دوباره بارگذاری کنید؛ بقیهٔ سطرها بدون آن‌ها ثبت می‌شوند.')
        : el('p', { class: 'imp-note' }, 'همهٔ سطرها آمادهٔ ثبت‌اند — «ثبت نهایی» را بزنید.'),
      el('div', { class: 'imp-table-scroll' }, table)
    );
  }

  async function runValidate() {
    setBusy(true, 'سرور داده‌ها را بررسی می‌کند…');
    try {
      const res = await api.post(`/api/import/${state.entity.key}/validate`, { rows: state.parsed.rows });
      state.validation = res.data;
      state.busy = false;
      render();
    } catch (err) {
      state.busy = false;
      state.step = 2;
      state.parseError = err?.message ?? 'بررسی داده‌ها ناموفق بود';
      render();
    }
  }

  function step4Body() {
    const r = state.result;
    if (!r) {
      return el('div', { class: 'imp-loading-wrap' }, loadingStateLocal('در حال ثبت نهایی…'));
    }
    return el('div', { class: 'imp-done' },
      el('span', { class: 'imp-done__icon' }, icon('check', 30)),
      el('h3', {}, 'درون‌ریزی انجام شد'),
      el('p', {},
        el('b', {}, `${fa(r.added)} ردیف اضافه شد`),
        ' · ',
        el('b', {}, `${fa(r.updated)} ردیف ویرایش شد`),
        r.skipped > 0 ? ` · ${fa(r.skipped)} ردیف خطادار ثبت نشد` : ''
      ),
      el('p', { class: 'imp-muted' }, 'تغییرات با یک رکورد ثبت رخداد در تاریخچهٔ سامانه ثبت شد.')
    );
  }

  async function runCommit() {
    setBusy(true, 'در حال ثبت نهایی…');
    try {
      const res = await api.post(`/api/import/${state.entity.key}/commit`, { rows: state.parsed.rows });
      state.result = res.data;
      state.busy = false;
      toast(`درون‌ریزی انجام شد — ${fa(res.data.added)} افزودن، ${fa(res.data.updated)} ویرایش`, 'success');
      render();
    } catch (err) {
      state.busy = false;
      state.step = 3;
      toastError(err);
      render();
    }
  }

  return box;
}
