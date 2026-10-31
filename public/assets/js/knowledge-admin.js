import { api } from './api.js';
import { el, icon, toast, toastError, confirmModal, formModal, emptyState, loadingState, openModal } from './ui.js';
import { session } from './state.js';
import { fa, formatJalaliDateTime } from './format.js';

const CATEGORY_LABELS = { tip: 'نکتهٔ آموزشی', protocol: 'پروتکل درمانی', article: 'مقاله', news: 'خبر مرکز' };
const CATEGORY_BADGE = { tip: 'badge--primary', protocol: 'badge--success', article: 'badge--accent', news: 'badge--neutral' };

const LIMITS = { maxFileBytes: 50 * 1024 * 1024, maxFilesPerUpload: 10, maxAttachments: 20 };
const EXT_MIME_FALLBACK = {
  mp4: 'video/mp4', m4v: 'video/x-m4v', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', mkv: 'video/x-matroska', '3gp': 'video/3gpp', wmv: 'video/x-ms-wmv',
  mpeg: 'video/mpeg', mpg: 'video/mpeg',
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', html: 'text/html',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
const CHUNK_UPLOAD_BYTES = 1024 * 1024;      // هر درخواست تکه‌ای ≤ ۱ مگابایت — امن با سقف CPU
const MULTIPART_MAX_BYTES = 3 * 1024 * 1024; // تا ۳ مگابایت یک‌جا می‌رود؛ بزرگ‌تر تکه‌تکه

function isImageMime(mime) {
  return String(mime ?? '').toLowerCase().startsWith('image/');
}

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

async function uploadAttachment(itemId, file) {
  if (file.size <= MULTIPART_MAX_BYTES) {
    const form = new FormData();
    form.append('files', file, file.name);
    await api.postForm(`/api/knowledge/${itemId}/files`, form);
    return;
  }
  const mime = localMime(file);
  const begin = await api.post(`/api/knowledge/${itemId}/files/begin`, { filename: file.name, mime, size: file.size });
  const fileId = begin?.data?.fileId;
  if (!fileId) throw new Error('شروع بارگذاری فایل ناموفق بود');
  const chunks = Math.ceil(file.size / CHUNK_UPLOAD_BYTES);
  for (let seq = 0; seq < chunks; seq += 1) {
    const piece = file.slice(seq * CHUNK_UPLOAD_BYTES, Math.min((seq + 1) * CHUNK_UPLOAD_BYTES, file.size));
    await api.putRaw(`/api/knowledge/${itemId}/files/${fileId}/chunks/${seq}`, await piece.arrayBuffer());
  }
  await api.post(`/api/knowledge/${itemId}/files/${fileId}/complete`, {});
}

async function uploadAttachments(itemId, files, onProgress) {
  for (let i = 0; i < files.length; i += 1) {
    onProgress?.(i + 1, files.length, files[i].name);
    await uploadAttachment(itemId, files[i]);
  }
}

async function fetchAttachmentBlob(itemId, file) {
  const token = localStorage.getItem('cs.token') ?? '';
  const res = await fetch(`/api/knowledge/${itemId}/files/${file.id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`دریافت فایل ناموفق بود (کد ${fa(res.status)})`);
  return res.blob();
}

function openAttachmentInTab(itemId, file) {
  fetchAttachmentBlob(itemId, file)
    .then((blob) => {
      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
    })
    .catch(toastError);
}

function buildThumb(itemId, file) {
  const img = el('img', {
    alt: file.filename, /* S10-24: درخواست اضافهٔ src='' حذف شد */
    title: `${file.filename} — ${sizeLabel(file.size)}`,
    style: {
      width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px',
      border: '1px solid var(--border)', cursor: 'zoom-in', background: 'var(--bg-2)'
    }
  });
  fetchAttachmentBlob(itemId, file)
    .then((blob) => {
      const objUrl = URL.createObjectURL(blob);
      img.src = objUrl;
      setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
    })
    .catch(() => {
      img.replaceWith(el('span', { class: 'exb-file-chip__name' }, file.filename));
    });
  img.addEventListener('click', () => openAttachmentInTab(itemId, file));
  return img;
}

function attachmentChip(itemId, file, onChanged) {
  const name = el('span', { class: 'exb-file-chip__name', title: file.filename }, file.filename);
  const size = el('span', { class: 'exb-file-chip__size' }, sizeLabel(file.size));
  const openBtn = el('button', { class: 'exb-file-chip__btn', type: 'button', title: 'بازکردن در تب جدید', 'aria-label': `بازکردن ${file.filename} در تب جدید` }, icon('link', 12)); /* S10-20 */
  openBtn.addEventListener('click', () => openAttachmentInTab(itemId, file));
  const delBtn = el('button', { class: 'exb-file-chip__btn exb-file-chip__btn--danger', type: 'button', title: 'حذف فایل', 'aria-label': `حذف ${file.filename}` }, icon('trash', 12)); /* S10-20 */
  delBtn.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'حذف پیوست',
      message: `فایل «${file.filename}» از مقاله حذف شود؟`,
      confirmLabel: 'حذف فایل',
      danger: true
    });
    if (!ok) return;
    try {
      await api.del(`/api/knowledge/${itemId}/files/${file.id}`);
      toast('پیوست حذف شد', 'success');
      onChanged?.();
    } catch (err) { toastError(err); }
  });

  if (isImageMime(file.mime)) {
    const wrap = el('span', { class: 'exb-file-chip', style: { padding: '4px', gap: '6px' } },
      buildThumb(itemId, file),
      el('span', { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } }, name, size),
      openBtn,
      delBtn
    );
    return wrap;
  }
  return el('span', { class: 'exb-file-chip' },
    el('span', { style: { display: 'flex' } }, icon('file', 14)),
    name,
    size,
    openBtn,
    delBtn
  );
}

function attachmentsSection(k, refresh) {
  const wrap = el('div', { class: 'exb-picked', style: { marginTop: '8px' } });
  const input = el('input', { type: 'file', multiple: true, style: { display: 'none' } });
  const status = el('span', { class: 'exb-picked__size', style: { alignSelf: 'center' } }, '');

  async function handleFiles(list) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    if (files.length > LIMITS.maxFilesPerUpload) {
      toast(`حداکثر ${fa(LIMITS.maxFilesPerUpload)} فایل در هر بار بارگذاری`, 'warning');
      return;
    }
    if ((k.attachments?.length ?? 0) + files.length > LIMITS.maxAttachments) {
      toast(`حداکثر ${fa(LIMITS.maxAttachments)} پیوست برای هر مقاله`, 'warning');
      return;
    }
    try {
      for (const f of files) validateLocalFile(f); // اعتبارسنجی همه قبل از ارسال
    } catch (err) {
      toastError(err);
      return;
    }
    status.textContent = 'در حال بارگذاری…';
    try {
      await uploadAttachments(k.id, files, (i, tot, name) => {
        status.textContent = `بارگذاری ${fa(i)} از ${fa(tot)} — «${name}»`;
      });
      toast('پیوست‌ها ذخیره شدند', 'success');
      refresh();
    } catch (err) {
      toastError(err);
      status.textContent = '';
    }
  }

  const addBtn = el('button', { class: 'btn btn--ghost btn--sm' }, icon('upload', 14), 'افزودن فایل');
  addBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const list = Array.from(input.files ?? []);
    input.value = '';
    handleFiles(list);
  });
  wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('is-over'); }); /* S10-23 */
  wrap.addEventListener('dragleave', () => wrap.classList.remove('is-over'));
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    wrap.classList.remove('is-over');
    handleFiles(e.dataTransfer?.files);
  });

  const chips = (k.attachments ?? []).map((f) => attachmentChip(k.id, f, refresh));
  wrap.replaceChildren(...chips, addBtn, input, status);
  return wrap;
}

export function drawKnowledgeAdmin(body) {
  const list = el('div', { class: 'stack' });
  body.replaceChildren(
    el(
      'div',
      { class: 'card' },
      el(
        'div',
        { class: 'card__head' },
        el('div', { class: 'card__title' }, 'مقالهٔ دانش جدید'),
        el('span', { class: 'badge badge--neutral' }, 'دفتر مرکز')
      ),
      el('div', { class: 'card__body' }, composeForm(() => loadList(list)))
    ),
    el(
      'div',
      { class: 'card' },
      el(
        'div',
        { class: 'card__head' },
        el('div', { class: 'card__title' }, 'مقاله‌های ثبت‌شده'),
        el('button', { class: 'btn btn--ghost btn--sm', onclick: () => loadList(list) }, icon('refresh', 15), 'به‌روزرسانی')
      ),
      el('div', { class: 'card__body' }, list)
    )
  );
  loadList(list);
}

function buildDropzone(onFiles) {
  const input = el('input', { type: 'file', multiple: true, style: { display: 'none' } });
  const hint = `${fa(Math.round(LIMITS.maxFileBytes / (1024 * 1024)))} مگابایت`;
  const zone = el(
    'div',
    { class: 'exb-drop', style: { marginTop: '10px' } },
    el('span', {}, icon('upload', 20)),
    el('b', {}, 'فایل مقاله یا تصویر را اینجا رها کنید'),
    el('span', { class: 'exb-drop__hint' }, `یا کلیک کنید — PDF، تصویر، Word، ویدیو — هر فایل تا ${hint} — چند فایل همزمان`)
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

function composeForm(onSaved) {
  const title = el('input', { class: 'input', placeholder: 'عنوان مقاله…', maxlength: 140, 'aria-label': 'عنوان مقاله' }); /* S10-21 */
  const bodyIn = el('textarea', { class: 'textarea', rows: 5, placeholder: 'متن مقاله — نکتهٔ آموزشی، پروتکل، راهنما یا خبر مرکز…', maxlength: 6000, 'aria-label': 'متن مقاله' }); /* S10-21 */

  const selCategory = el('select', { class: 'input', 'aria-label': 'دستهٔ مقاله' }, /* S10-21 */
    ...Object.entries(CATEGORY_LABELS).map(([value, label]) => el('option', { value }, label))
  );
  selCategory.value = 'tip';

  const chkPinned = el('input', { type: 'checkbox' });
  const chkPublished = el('input', { type: 'checkbox' });
  chkPublished.checked = true; // پیش‌فرض منطقی — انتشار فوری

  const picked = [];
  let chips = null;
  const dropzoneWrap = el('div', {});
  const dropStatus = el('div', { class: 'exb-picked__size', style: { marginTop: '6px' } }, '');
  dropzoneWrap.append(
    buildDropzone((list) => {
      for (const f of list) {
        try {
          validateLocalFile(f);
          picked.push(f);
        } catch (err) {
          toastError(err);
        }
      }
      chips.refresh();
    })
  );
  chips = buildPickedChips(picked);
  dropzoneWrap.append(chips, dropStatus);

  const submit = el('button', { class: 'btn btn--primary' }, icon('plus', 16), 'ثبت مقاله');

  submit.addEventListener('click', async () => {
    if (title.value.trim().length < 2) { toast('عنوان حداقل ۲ نویسه است', 'warning'); title.focus(); return; }
    if (bodyIn.value.trim().length < 2) { toast('متن مقاله حداقل ۲ نویسه است', 'warning'); bodyIn.focus(); return; }
    if (picked.length > LIMITS.maxFilesPerUpload) { toast(`حداکثر ${fa(LIMITS.maxFilesPerUpload)} فایل در هر بار بارگذاری`, 'warning'); return; }
    submit.disabled = true;
    let createdId = null;
    try {
      const res = await api.post('/api/knowledge', {
        title: title.value.trim(),
        body: bodyIn.value.trim(),
        category: selCategory.value,
        pinned: chkPinned.checked,
        published: chkPublished.checked
      });
      createdId = res?.data?.id ?? null;
      if (picked.length > 0 && createdId) {
        await uploadAttachments(createdId, picked, (i, tot, name) => {
          dropStatus.textContent = `بارگذاری پیوست ${fa(i)} از ${fa(tot)} — «${name}»`;
        });
      }
      toast(picked.length > 0 ? 'مقاله و پیوست‌هایش ثبت شد' : 'مقاله ثبت شد و روی داشبورد همکاران نمایش داده می‌شود', 'success');
      title.value = '';
      bodyIn.value = '';
      chkPinned.checked = false;
      picked.length = 0;
      chips.refresh();
      dropStatus.textContent = '';
      onSaved();
    } catch (err) {
      toastError(err);
      if (createdId) onSaved();
    } finally {
      submit.disabled = false;
    }
  });

  return el('div', { class: 'ann-compose' },
    title,
    bodyIn,
    dropzoneWrap,
    el('div', { class: 'ann-checks' },
      el('label', { class: 'ann-check', style: { gap: '6px' } }, selCategory),
      el('label', { class: 'ann-check' }, chkPinned, el('span', {}, 'سنجاق در بالای فهرست')),
      el('label', { class: 'ann-check' }, chkPublished, el('span', {}, 'انتشار برای همکاران'))
    ),
    el('div', { class: 'ann-compose__hint' }, 'مقاله‌های منتشرشده روی داشبورد همهٔ همکاران (کارت «دانش‌افزایی») دیده می‌شوند. پیوست‌ها پس از ثبت مقاله بارگذاری می‌شوند.'),
    el('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, submit)
  );
}

async function loadList(list) {
  list.replaceChildren(loadingState());
  let items;
  try {
    items = (await api.get('/api/knowledge/manage')).data;
  } catch (err) {
    list.replaceChildren(el('p', { style: { color: 'var(--error)' } }, err.message));
    return;
  }
  if (items.length === 0) {
    list.replaceChildren(emptyState({ iconName: 'file', title: 'هنوز مقاله‌ای ثبت نشده', hint: 'از فرم بالا اولین مقالهٔ دانش را بسازید.' }));
    return;
  }
  list.replaceChildren(...items.map((k) => knRow(k, loadList)));
}

function knRow(k, refresh) {
  const isManager = session.user?.role === 'manager';
  const badges = el('div', { class: 'ann-badges' },
    el('span', { class: `badge ${CATEGORY_BADGE[k.category] ?? 'badge--neutral'}` }, CATEGORY_LABELS[k.category] ?? k.category),
    k.pinned ? el('span', { class: 'badge badge--accent' }, 'سنجاق‌شده') : null,
    k.published ? el('span', { class: 'badge badge--success' }, 'منتشرشده') : el('span', { class: 'badge badge--warning' }, 'پیش‌نویس') /* S10-22 */,
    (k.attachments?.length ?? 0) > 0 ? el('span', { class: 'badge badge--neutral' }, icon('file', 12), ` ${fa(k.attachments.length)} پیوست`) : null
  );

  const viewBtn = el('button', { class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'مشاهده' }, icon('eye', 15));
  const editBtn = el('button', { class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'ویرایش' }, icon('edit', 15));
  const pubBtn = el('button', { class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': k.published ? 'پیش‌نویس کردن' : 'انتشار' }, icon(k.published ? 'undo' : 'check', 15));
  const delBtn = isManager ? el('button', { class: 'btn btn--ghost btn--icon btn--sm btn--danger-ghost', 'aria-label': 'حذف' }, icon('trash', 15)) : null;

  viewBtn.addEventListener('click', () => {
    openModal({
      title: `${CATEGORY_LABELS[k.category] ?? k.category} — ${k.title}`,
      wide: true,
      body: el('div', { class: 'kn-reader' },
        k.body,
        (k.attachments?.length ?? 0) > 0
          ? el('div', { class: 'exb-picked', style: { marginTop: '14px' } },
              ...k.attachments.map((f) => {
                const open = el('button', { class: 'exb-file-chip__btn', type: 'button', title: 'بازکردن در تب جدید', 'aria-label': 'بازکردن پیوست در تب جدید' }, icon('link', 12)); /* S10-20 */
                open.addEventListener('click', () => openAttachmentInTab(k.id, f));
                return el('span', { class: 'exb-file-chip' },
                  el('span', { style: { display: 'flex' } }, icon('file', 14)),
                  el('span', { class: 'exb-file-chip__name' }, f.filename),
                  el('span', { class: 'exb-file-chip__size' }, sizeLabel(f.size)),
                  open
                );
              })
            )
          : null
      ),
      actions: []
    });
  });
  editBtn.addEventListener('click', () => openEditModal(k, refresh));
  pubBtn.addEventListener('click', async () => {
    try {
      await api.patch(`/api/knowledge/${k.id}`, { published: !k.published });
      toast(k.published ? 'به پیش‌نویس رفت' : 'منتشر شد', 'success');
      refresh();
    } catch (err) { toastError(err); }
  });
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'حذف مقالهٔ دانش',
        message: `«${k.title}» برای همیشه حذف شود؟${(k.attachments?.length ?? 0) > 0 ? ` پیوست‌های آن (${fa(k.attachments.length)} فایل) هم حذف می‌شود.` : ''}`,
        danger: true,
        confirmLabel: 'حذف'
      });
      if (!ok) return;
      try {
        await api.del(`/api/knowledge/${k.id}`);
        toast('حذف شد', 'success');
        refresh();
      } catch (err) { toastError(err); }
    });
  }

  return el('div', { class: 'ann-item' },
    el('div', { class: 'ann-item__head' },
      el('b', {}, k.title),
      el('span', { class: 'ann-item__date' }, formatJalaliDateTime(k.createdAt))
    ),
    el('p', { class: 'ann-item__body' }, k.body.length > 160 ? k.body.slice(0, 160) + '…' : k.body),
    badges,
    attachmentsSection(k, refresh),
    el('div', { class: 'ann-item__actions' }, viewBtn, editBtn, pubBtn, delBtn)
  );
}

function openEditModal(k, refresh) {
  formModal({
    title: 'ویرایش مقالهٔ دانش',
    fields: [
      { name: 'title', label: 'عنوان', required: true, span: 2 },
      { name: 'category', label: 'دسته', type: 'select', options: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })), span: 1 },
      { name: 'body', label: 'متن', type: 'textarea', rows: 6, required: true, span: 2 },
      { name: 'pinned', label: 'سنجاق در بالای فهرست', type: 'switch' },
      { name: 'published', label: 'منتشرشده', type: 'switch' }
    ],
    initial: { title: k.title, body: k.body, category: k.category, pinned: k.pinned, published: k.published },
    wide: true,
    onSubmit: async (values) => {
      await api.patch(`/api/knowledge/${k.id}`, {
        title: values.title,
        body: values.body,
        category: values.category,
        pinned: values.pinned,
        published: values.published
      });
      toast('ذخیره شد', 'success');
      refresh();
    }
  });
}
