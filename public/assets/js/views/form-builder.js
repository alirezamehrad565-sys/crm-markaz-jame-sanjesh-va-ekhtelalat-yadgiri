/* views/form-builder.js — ویرایشگر بلوکی فرم‌ساز تعاملی (۱.۲۷.۳۴ — REFERRAL-DESIGN §A-1)
 *
 * فهرست فرم‌ها + ویرایش درجا: پالت بلوک‌ها (متن کوتاه/بلند، عدد، موبایل، انتخاب تکی/چندگانه،
 * بله/خیر، صفحهٔ آگاهی)، ویرایش هر بلوک در مودال، جابه‌جایی بالا/پایین، پیش‌نمایش زنده،
 * انتشار/توقف انتشار + کپی لینک عمومی، صندوق پاسخ‌ها با «خوانده شد».
 * منطق پرش و QR نسخه‌های بعدی‌اند (§A-1) — جریان فعلی خطی با صفحات آگاهی است.
 */
import { api } from '../api.js';
import { el, icon, openModal, formModal, confirmModal, toast, toastError, emptyState, loadingState, flashNode } from '../ui.js';

const KINDS = [
  { kind: 'text', label: 'متن کوتاه', icon: 'edit' },
  { kind: 'longtext', label: 'متن بلند', icon: 'clip' },
  { kind: 'number', label: 'عدد', icon: 'hash' },
  { kind: 'phone', label: 'موبایل', icon: 'phone' },
  { kind: 'select', label: 'انتخاب تکی', icon: 'check' },
  { kind: 'multi', label: 'انتخاب چندگانه', icon: 'plus' },
  { kind: 'yes_no', label: 'بله / خیر', icon: 'refresh' },
  { kind: 'note', label: 'صفحهٔ آگاهی', icon: 'info' }
];

const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.kind, k.label]));

const FB_CSS = `
.fb-pal{display:flex;flex-wrap:wrap;gap:8px;margin:var(--sp-3) 0}
.fb-blk{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);
padding:var(--sp-2) var(--sp-3);margin-bottom:var(--sp-2)}
.fb-blk__head{display:flex;align-items:center;gap:var(--sp-2);flex-wrap:wrap}
.fb-actions{display:flex;gap:6px;margin-inline-start:auto}
.fb-meta{display:grid;gap:var(--sp-2);grid-template-columns:1fr 200px}
@media (max-width:640px){.fb-meta{grid-template-columns:1fr}}
.fb-preview-row{padding:var(--sp-2) var(--sp-3);border-bottom:1px solid var(--border)}
.fb-preview-row:last-child{border-bottom:none}
`;

let cssDone = false;
function ensureCss() {
  if (cssDone) return;
  cssDone = true;
  const style = document.createElement('style');
  style.textContent = FB_CSS;
  document.head.appendChild(style);
}

function kindBadge(kind) {
  return el('span', { class: 'badge badge--neutral' }, KIND_LABEL[kind] ?? kind);
}

function copyPublicLink(slug) {
  const url = `${location.origin}/public/form/${slug}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(
      () => toast('لینک عمومی کپی شد: ' + url, 'success'),
      () => window.prompt('لینک عمومی فرم:', url)
    );
  } else {
    window.prompt('لینک عمومی فرم:', url);
  }
}

function openBlockEditor(block, index, onSave) {
  const isNote = block.kind === 'note';
  const needsOptions = block.kind === 'select' || block.kind === 'multi';
  formModal({
    title: `ویرایش بلوک — ${KIND_LABEL[block.kind]}`,
    wide: true,
    submitLabel: 'ذخیرهٔ بلوک',
    initial: {
      label: block.label ?? '',
      required: block.required ? '1' : '',
      options: (block.options ?? []).map((o) => o.label).join('\n'),
      note: block.note ?? ''
    },
    fields: [
      { name: 'label', label: 'پرسش / برچسب بلوک', required: true, value: block.label, hint: 'همان چیزی که پاسخ‌دهنده می‌بیند' },
      isNote
        ? { name: 'note', label: 'متن صفحهٔ آگاهی', type: 'textarea', required: true, value: block.note ?? '', hint: 'متن فقط-اطلاعات — پاسخ نمی‌گیرد' }
        : { name: 'required', label: 'الزامی؟', type: 'select', options: [{ value: '', label: 'اختیاری' }, { value: '1', label: 'الزامی' }], value: block.required ? '1' : '' },
      needsOptions
        ? { name: 'options', label: 'گزینه‌ها (هر خط یک گزینه)', type: 'textarea', required: true, value: (block.options ?? []).map((o) => o.label).join('\n'), hint: 'حداقل دو گزینه — حداکثر ۱۲ خط' }
        : null
    ].filter(Boolean),
    onSubmit: (values) => {
      const label = String(values.label ?? '').trim();
      if (label.length < 2) {
        toastError(new Error('برچسب بلوک حداقل ۲ نویسه است'));
        return false;
      }
      const next = { kind: block.kind, label, required: Boolean(values.required) };
      if (needsOptions) {
        const lines = String(values.options ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          toastError(new Error('برای انتخاب، حداقل دو گزینه لازم است'));
          return false;
        }
        if (lines.length > 12) {
          toastError(new Error('حداکثر ۱۲ گزینه'));
          return false;
        }
        next.options = lines.map((l, i) => ({ value: `o${i + 1}`, label: l }));
      }
      if (isNote) {
        const note = String(values.note ?? '').trim();
        if (note.length < 4) {
          toastError(new Error('متن صفحهٔ آگاهی لازم است'));
          return false;
        }
        next.note = note;
      }
      onSave(next);
      toast('بلوک ذخیره شد', 'success');
      return true;
    }
  });
}

function openPreview(form) {
  const body = el('div', { style: { maxHeight: '55vh', overflow: 'auto' } },
    ...form.blocks.map((b, i) =>
      el('div', { class: 'fb-preview-row' },
        el('div', { style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' } },
          el('span', { class: 'badge badge--neutral' }, `${fa(i + 1)}`),
          kindBadge(b.kind),
          el('b', {}, b.label),
          b.required ? el('span', { class: 'badge badge--error' }, 'الزامی') : null
        ),
        b.kind === 'note'
          ? el('div', { class: 'muted', style: { fontSize: '13px', marginTop: '4px', whiteSpace: 'pre-wrap' } }, b.note ?? '')
          : (b.options?.length
              ? el('div', { class: 'muted', style: { fontSize: '13px', marginTop: '4px' } }, `گزینه‌ها: ${b.options.map((o) => o.label).join(' · ')}`)
              : null)
      )
    )
  );
  openModal({
    title: `پیش‌نمایش بلوک‌ها — ${form.title || 'فرم تازه'}`,
    wide: true,
    body,
    actions: [(close) => el('button', { class: 'btn btn--ghost btn--sm', onclick: close }, 'بستن')]
  });
}

function fa(n) {
  const d = '۰۱۲۳۴۵۶۷۸۹';
  return String(n).replace(/\d/g, (x) => d[Number(x)]);
}

function openResponses(form) {
  const shell = openModal({
    title: `پاسخ‌های «${form.title}»`,
    wide: true,
    body: el('div', {}, loadingState('بارگذاری پاسخ‌ها…')),
    actions: [(close) => el('button', { class: 'btn btn--ghost btn--sm', onclick: close }, 'بستن')]
  });
  api.get(`/api/forms/${form.id}/responses`).then((res) => {
    const rows = res.data ?? [];
    if (rows.length === 0) {
      shell.root.querySelector('.modal__body')?.replaceChildren(
        emptyState({ iconName: 'check', title: 'هنوز پاسخی ثبت نشده', hint: `لینک عمومی: /public/form/${form.slug}` })
      );
      return;
    }
    const renderRow = (r) => el('div', { class: 'fb-blk' },
      el('div', { class: 'fb-blk__head' },
        el('b', {}, r.respondentName),
        r.respondentPhone ? el('span', { class: 'muted', style: { fontSize: '12px' } }, fa(r.respondentPhone)) : null,
        el('span', { class: `badge ${r.status === 'new' ? 'badge--error' : 'badge--success'}` }, r.status === 'new' ? 'جدید' : 'خوانده‌شده'),
        el('span', { class: 'muted', style: { fontSize: '12px' } }, r.createdAt?.slice(0, 10) ?? ''),
        el('div', { class: 'fb-actions' },
          r.status === 'new'
            ? el('button', {
                class: 'btn btn--soft btn--sm',
                onclick: async () => {
                  try {
                    await api.post(`/api/forms/${form.id}/responses/${r.id}/seen`, {});
                    toast('خوانده شد', 'success');
                    openResponses(form); shell.close();
                  } catch (err) { toastError(err); }
                }
              }, 'خوانده شد')
            : null
        )
      ),
      el('div', { style: { fontSize: '13.5px', marginTop: '6px', lineHeight: 1.9 } },
        ...(r.answers ?? []).map((a) => {
          const b = (form.blocks ?? [])[a.index];
          let val = a.value;
          if (b && (b.kind === 'select' || b.kind === 'multi')) {
            const arr = Array.isArray(val) ? val : [val];
            val = arr.map((x) => (b.options ?? []).find((o) => o.value === x)?.label ?? x).join('، ');
          } else if (b && b.kind === 'yes_no') {
            val = val === 'yes' ? 'بله' : val === 'no' ? 'خیر' : val;
          }
          return el('div', {}, el('b', {}, (b?.label ?? `سؤال ${a.index + 1}`) + ': '), String(val ?? '—'));
        })
      )
    );
    const bodyZone = shell.root.querySelector('.modal__body');
    if (bodyZone) bodyZone.replaceChildren(el('div', { style: { maxHeight: '60vh', overflow: 'auto' } }, ...rows.map(renderRow)));
  }).catch((err) => { toastError(err); shell.close(); });
}

async function saveForm(existing, payload, after) {
  try {
    if (existing) {
      const res = await api.patch(`/api/forms/${existing.id}`, payload);
      toast('فرم ذخیره شد', 'success');
      after(res.data);
    } else {
      const res = await api.post('/api/forms', payload);
      toast('فرم ساخته شد — می‌توانید بلوک‌ها را کامل کنید و منتشر کنید', 'success');
      after(res.data);
    }
  } catch (err) {
    toastError(err);
  }
}

async function removeForm(form, refresh) {
  const ok = await confirmModal({
    title: 'حذف فرم',
    message: `«${form.title}» از فهرست حذف می‌شود (حذف نرم — پاسخ‌های ثبت‌شده در گزارش‌ها می‌ماند).`,
    confirmLabel: 'حذف'
  });
  if (!ok) return;
  try {
    await api.delete(`/api/forms/${form.id}`);
    toast('فرم حذف شد', 'success');
    refresh();
  } catch (err) {
    toastError(err);
  }
}

function togglePublish(form, refresh) {
  saveForm(form, {
    title: form.title,
    slug: form.slug,
    description: form.description ?? undefined,
    blocks: form.blocks,
    published: !form.published
  }, refresh);
}

function openEditor(container, existing, backToList) {
  ensureCss();
  let blocks = (existing?.blocks ?? []).map((b) => ({ ...b }));
  let published = Boolean(existing?.published);
  const titleIn = el('input', { class: 'input', value: existing?.title ?? '', placeholder: 'مثلاً: نظرسنجی کلاس تابستان' });
  const slugIn = el('input', { class: 'input', dir: 'ltr', value: existing?.slug ?? '', placeholder: 'summer-survey' });
  const descIn = el('textarea', { class: 'input', style: { minHeight: '70px' }, placeholder: 'توضیح کوتاه بالای فرم (اختیاری)' });
  if (existing?.description) descIn.value = existing.description;

  const blocksZone = el('div', {});

  function paintBlocks() {
    const emptyHint = el('div', { class: 'muted', style: { padding: 'var(--sp-3)', fontSize: '13px' } },
      'هنوز بلوکی نیست — از پالت پایین بلوک اضافه کنید؛ هر بلوک یک صفحهٔ مستقل در حالت تعاملی می‌شود.');
    const rows = blocks.map((b, i) =>
      el('div', { class: 'fb-blk' },
        el('div', { class: 'fb-blk__head' },
          el('span', { class: 'badge badge--neutral' }, fa(i + 1)),
          kindBadge(b.kind),
          el('b', {}, b.label),
          b.required ? el('span', { class: 'badge badge--error' }, 'الزامی') : null,
          el('div', { class: 'fb-actions' },
            el('button', { class: 'btn btn--ghost btn--sm', title: 'بالا', disabled: i === 0 ? true : null, onclick: () => { [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]]; paintBlocks(); } }, icon('chevR', 13)),
            el('button', { class: 'btn btn--ghost btn--sm', title: 'پایین', disabled: i === blocks.length - 1 ? true : null, onclick: () => { [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]]; paintBlocks(); } }, icon('chevL', 13)),
            el('button', { class: 'btn btn--soft btn--sm', onclick: () => openBlockEditor(b, i, (next) => { blocks[i] = next; paintBlocks(); }) }, 'ویرایش'),
            el('button', { class: 'btn btn--soft btn--sm', onclick: () => { blocks.splice(i, 1); paintBlocks(); } }, 'حذف')
          )
        ),
        b.kind === 'note' && b.note
          ? el('div', { class: 'muted', style: { fontSize: '12.5px', marginTop: '4px', whiteSpace: 'pre-wrap' } }, b.note.slice(0, 140))
          : (b.options?.length ? el('div', { class: 'muted', style: { fontSize: '12.5px', marginTop: '4px' } }, `گزینه‌ها: ${b.options.map((o) => o.label).join(' · ')}`) : null)
      )
    );
    blocksZone.replaceChildren(...(rows.length ? rows : [emptyHint]));
  }

  const palette = el('div', { class: 'fb-pal' },
    ...KINDS.map((k) =>
      el('button', {
        class: 'btn btn--soft btn--sm',
        onclick: () => {
          if (blocks.length >= 60) { toastError(new Error('حداکثر ۶۰ بلوک در هر فرم')); return; }
          const fresh = k.kind === 'note'
            ? { kind: 'note', label: 'صفحهٔ آگاهی', required: false, note: 'متن توضیحی این صفحه…' }
            : { kind: k.kind, label: k.label, required: false };
          openBlockEditor(fresh, blocks.length, (next) => { blocks.push(next); paintBlocks(); });
        }
      }, icon(k.icon, 14), k.label)
    )
  );

  const editor = el('div', {},
    el('div', { class: 'card' },
      el('div', { class: 'card__head' },
        el('div', { class: 'card__title' }, existing ? `ویرایش فرم — ${existing.title}` : 'فرم تازه'),
        el('span', { class: `badge ${published ? 'badge--success' : 'badge--warning'}` }, published ? 'منتشرشده' : 'پیش‌نویس')
      ),
      el('div', { class: 'card__body' },
        el('div', { class: 'fb-meta' },
          el('div', {}, el('label', { class: 'f' }, 'عنوان فرم'), titleIn),
          el('div', {}, el('label', { class: 'f' }, 'اسلاگ لینک عمومی'), slugIn,
            el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, 'لینک عمومی: /public/form/اسلاگ — تغییر اسلاگِ منتشرشده لینک قبلی را می‌شکند'))
        ),
        el('div', { style: { marginTop: 'var(--sp-2)' } }, el('label', { class: 'f' }, 'توضیح (اختیاری)'), descIn),
        el('hr', { style: { border: 'none', borderTop: '1px solid var(--border)', margin: 'var(--sp-3) 0' } }),
        el('div', { style: { fontWeight: '700' } }, 'بلوک‌ها — هر بلوک یک صفحه'),
        palette,
        blocksZone,
        el('div', { class: 'btnrow' },
          el('button', { class: 'btn btn--ghost', onclick: () => openPreview({ title: titleIn.value, blocks }) }, icon('search', 15), 'پیش‌نمایش'),
          el('button', {
            class: 'btn btn--primary',
            onclick: async () => {
              const title = titleIn.value.trim();
              const slug = slugIn.value.trim().toLowerCase();
              if (title.length < 2) { toastError(new Error('عنوان فرم حداقل ۲ نویسه است')); return; }
              if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)) { toastError(new Error('اسلاگ فقط لاتین کوچک، رقم و خط‌تیره (۳ تا ۶۰)')); return; }
              await saveForm(existing, { title, slug, description: descIn.value.trim() || undefined, blocks, published }, () => backToList(true));
            }
          }, icon('check', 15), 'ذخیرهٔ فرم'),
          existing
            ? el('button', { class: 'btn btn--soft', onclick: () => togglePublish({ ...existing, title: titleIn.value.trim(), slug: slugIn.value.trim().toLowerCase(), description: descIn.value.trim() || undefined, blocks, published }, () => backToList(true)) }, published ? 'توقف انتشار' : 'انتشار فرم')
            : null,
          el('button', { class: 'btn btn--ghost', onclick: () => backToList(false) }, 'بازگشت به فهرست')
        )
      )
    )
  );
  paintBlocks();
  container.replaceChildren(editor);
}

export async function renderFormBuilder(container) {
  ensureCss();
  let gen = 0;

  async function paintList(flash = false) {
    const myGen = ++gen;
    container.replaceChildren(el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } }, el('div', { class: 'card__body' }, loadingState('بارگذاری فرم‌ها…'))));
    let forms = [];
    try {
      const res = await api.get('/api/forms');
      forms = res.data ?? [];
    } catch (err) {
      if (myGen !== gen) return;
      container.replaceChildren(el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } },
        el('div', { class: 'card__body' }, emptyState({ iconName: 'alert', title: 'خطا در دریافت فرم‌ها', hint: String(err?.message ?? err) }))));
      return;
    }
    if (myGen !== gen) return;

    const backToList = (flashList) => { void paintList(flashList); };

    const cards = forms.map((f) =>
      el('div', { class: 'card', style: { marginBottom: 'var(--sp-3)' } },
        el('div', { class: 'card__body' },
          el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', alignItems: 'center' } },
            el('strong', { style: { fontSize: '15.5px' } }, f.title),
            el('code', { style: { fontSize: '12px', color: 'var(--muted)', direction: 'ltr' } }, `/public/form/${f.slug}`),
            el('span', { class: `badge ${f.published ? 'badge--success' : 'badge--warning'}` }, f.published ? 'منتشرشده' : 'پیش‌نویس'),
            el('span', { class: 'badge badge--neutral' }, `${fa(f.blocks?.length ?? 0)} بلوک`)
          ),
          f.description ? el('div', { class: 'muted', style: { fontSize: '13px', marginTop: '4px' } }, f.description) : null,
          el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' } },
            el('button', { class: 'btn btn--primary btn--sm', onclick: () => openEditor(container, f, backToList) }, icon('edit', 14), 'ویرایش'),
            el('button', { class: 'btn btn--soft btn--sm', onclick: () => openResponses(f) }, icon('clip', 14), 'پاسخ‌ها'),
            f.published ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => copyPublicLink(f.slug) }, icon('plus', 14), 'کپی لینک عمومی') : null,
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => togglePublish(f, () => paintList(true)) }, f.published ? 'توقف انتشار' : 'انتشار'),
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => removeForm(f, () => paintList(false)) }, 'حذف')
          ),
          f.published
            ? el('div', { class: 'muted', style: { fontSize: '12px', marginTop: 'var(--sp-2)' } },
                `لینک عمومی برای خانواده و معلم‌ها: ${location.origin}/public/form/${f.slug} — می‌توانید در بات و تابلوی پذیرش بگذارید.`)
            : null
        )
      )
    );

    container.replaceChildren(
      el('div', { class: 'week-bar', style: { marginBottom: 'var(--sp-3)' } },
        el('button', { class: 'btn btn--primary btn--sm', onclick: () => openEditor(container, null, backToList) }, icon('plus', 15), 'فرم جدید'),
        el('div', { class: 'spacer' }),
        el('span', { class: 'badge badge--neutral' }, `${fa(forms.length)} فرم`)
      ),
      cards.length === 0
        ? el('div', { class: 'card' }, el('div', { class: 'card__body' },
            emptyState({
              iconName: 'clipboard',
              title: 'هنوز فرمی ساخته نشده',
              hint: 'با «فرم جدید» شروع کنید: بلوک‌ها را بچینید، منتشر کنید و لینک عمومی را برای خانواده‌ها بفرستید.'
            })))
        : el('div', {}, ...cards)
    );
    if (flash && cards.length) flashNode(cards[0]);
  }

  await paintList();
}
