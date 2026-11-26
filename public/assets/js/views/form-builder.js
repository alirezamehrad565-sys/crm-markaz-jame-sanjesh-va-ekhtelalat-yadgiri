/* views/form-builder.js — ویرایشگر بلوکی فرم‌ساز تعاملی (۱.۲۷.۳۴ — REFERRAL-DESIGN §A-1)
 *
 * بازطراحی ۱.۲۷.۴۱ (خواست کارفرما: UI/UX در سطح پرس‌لاین/Typeform/Tally):
 * ① پالت بلوک‌ها از دکمه‌های فشرده به «کتابخانهٔ نوع‌ها» کارتی — هر نوع با جعبهٔ آیکون رنگی
 *    (هشت‌گانهٔ hue توکن‌ها)، برچسب و راهنمای یک‌خطی.
 * ② بلوک‌ها کارت کامل‌اند: شمارهٔ گرادینتی، چیپ نوع، برچسب، متا، سوییچ «الزامی» درجا،
 *    تکرار بلوک، جابه‌جایی با درگ‌ودراپ (HTML5) + دکمه‌های بالا/پایین برای لمس.
 * ③ پیش‌نمایش زندهٔ واقعی در پنل کناری چسبان — کنترل‌های واقعی فرم (input/radio/checkbox/
 *    textarea/صفحهٔ آگاهی)، هم‌گام با هر تغییر؛ در صفحهٔ باریک زیر ویرایشگر می‌آید و
 *    مودال «پیش‌نمایش» همان ردیف‌ها را نشان می‌دهد.
 * ④ نوار ذخیرهٔ شناور (sticky) — ذخیره/انتشار/پیش‌نمایش همیشه در دسترس.
 * ⑤ صندوق پاسخ‌ها: فیلتر «فقط جدید» + شمارنده + پاسخ‌ها با جداسازی خط.
 * فونت و سایز فقط با توکن‌های مقیاس (--fs-*) — کف ۱۲px فارسی رعایت است.
 */
import { api } from '../api.js';
import { el, icon, openModal, formModal, confirmModal, toast, toastError, emptyState, loadingState, flashNode } from '../ui.js';

const KINDS = [
  { kind: 'text', label: 'متن کوتاه', icon: 'edit', hue: 1, hint: 'پاسخ کوتاه یک‌خطی' },
  { kind: 'longtext', label: 'متن بلند', icon: 'clip', hue: 2, hint: 'پاسخ چندخطی آزاد' },
  { kind: 'number', label: 'عدد', icon: 'hash', hue: 3, hint: 'فقط رقم' },
  { kind: 'phone', label: 'موبایل', icon: 'phone', hue: 4, hint: 'قالب ۰۹xx' },
  { kind: 'select', label: 'انتخاب تکی', icon: 'check', hue: 5, hint: 'یک گزینه از فهرست' },
  { kind: 'multi', label: 'انتخاب چندگانه', icon: 'grid', hue: 6, hint: 'چند گزینه هم‌زمان' },
  { kind: 'yes_no', label: 'بله / خیر', icon: 'refresh', hue: 7, hint: 'دوگانهٔ سریع' },
  { kind: 'note', label: 'صفحهٔ آگاهی', icon: 'info', hue: 8, hint: 'فقط اطلاعات — بدون پاسخ' }
];

const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.kind, k.label]));
const KIND_HUE = Object.fromEntries(KINDS.map((k) => [k.kind, k.hue]));

const FB_CSS = `
.fb-wrap{display:grid;grid-template-columns:minmax(0,1fr) 370px;gap:var(--sp-4);align-items:start}
@media (max-width:1080px){.fb-wrap{grid-template-columns:1fr}}
.fb-side{position:sticky;top:78px}
@media (max-width:1080px){.fb-side{position:static}}
.fb-pal{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:8px}
.fb-kind{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;text-align:start;width:100%;font-family:inherit;transition:border-color var(--fast),box-shadow var(--fast),transform var(--fast)}
.fb-kind:hover{border-color:var(--primary);box-shadow:var(--shadow-1);transform:translateY(-1px)}
.fb-kind:focus-visible{box-shadow:var(--focus-ring)}
.fb-kind__ico{width:32px;height:32px;border-radius:var(--radius-sm);display:grid;place-items:center;flex-shrink:0}
.fb-kind__txt b{display:block;font-size:var(--fs-sm);font-weight:600;line-height:var(--lh-ui)}
.fb-kind__txt span{display:block;font-size:var(--fs-2xs);color:var(--text-3);margin-top:1px}
.fb-blk{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--sp-3);margin-bottom:var(--sp-2);display:flex;gap:var(--sp-3);cursor:grab;transition:border-color var(--fast),box-shadow var(--fast)}
.fb-blk:hover{border-color:color-mix(in srgb,var(--primary) 45%,var(--border))}
.fb-blk.is-drag{opacity:.4;border-style:dashed}
.fb-blk.is-over{border-color:var(--primary);box-shadow:var(--focus-ring)}
.fb-blk__main{flex:1;min-width:0}
.fb-num{width:26px;height:26px;border-radius:var(--radius-full);background:var(--grad-primary);color:var(--on-primary);font-size:var(--fs-2xs);font-weight:700;display:grid;place-items:center;flex-shrink:0;margin-top:1px}
.fb-blk__title{display:flex;align-items:center;gap:var(--sp-2);flex-wrap:wrap}
.fb-blk__meta{font-size:var(--fs-2xs);color:var(--text-3);margin-top:5px;line-height:var(--lh-snug);white-space:pre-wrap}
.fb-blk__side{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0}
.fb-blk__acts{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
@media (hover:hover){.fb-blk__acts .btn{opacity:.55}.fb-blk:hover .fb-blk__acts .btn,.fb-blk:focus-within .fb-blk__acts .btn{opacity:1}}
.fb-zone-empty{border:1.5px dashed var(--border-strong);border-radius:var(--radius-md);padding:var(--sp-6) var(--sp-4);text-align:center;color:var(--text-3);font-size:var(--fs-sm);display:grid;gap:8px;justify-items:center}
.fb-addrow{width:100%;border:1.5px dashed var(--border-strong);background:transparent;border-radius:var(--radius-md);padding:12px;color:var(--primary);font-family:inherit;font-size:var(--fs-sm);font-weight:600;cursor:pointer;display:flex;gap:8px;align-items:center;justify-content:center;transition:border-color var(--fast),background var(--fast);margin-top:var(--sp-1)}
.fb-addrow:hover{border-color:var(--primary);background:var(--primary-soft)}
.fb-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:var(--radius-full);font-size:var(--fs-2xs);font-weight:600;line-height:var(--lh-ui)}
${KINDS.map((k) => `.fb-chip--h${k.hue}{background:var(--hue-${k.hue}-soft);color:var(--hue-${k.hue}-on)}\n.fb-ico--h${k.hue}{background:var(--hue-${k.hue}-soft);color:var(--hue-${k.hue}-strong)}`).join('\n')}
.fb-prev__body{max-height:calc(100vh - 290px);min-height:200px;overflow:auto;padding:var(--sp-4)}
@media (max-width:1080px){.fb-prev__body{max-height:60vh}}
.fb-prev-row{padding:var(--sp-3);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:var(--sp-2);background:var(--surface)}
.fb-prev-row:last-child{margin-bottom:0}
.fb-prev-label{font-weight:600;font-size:var(--fs-sm);display:block;margin-bottom:7px;line-height:var(--lh-snug)}
.fb-prev-req{color:var(--error);font-weight:700;margin-inline-start:3px}
.fb-opt{display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:var(--fs-sm);cursor:pointer;transition:border-color var(--fast),background var(--fast)}
.fb-opt:last-child{margin-bottom:0}
.fb-opt:hover{border-color:var(--primary);background:var(--primary-soft)}
.fb-note{display:flex;gap:10px;align-items:flex-start;background:var(--info-soft);border:1px solid color-mix(in srgb,var(--info) 28%,transparent);border-radius:var(--radius-sm);padding:var(--sp-3);font-size:var(--fs-sm);line-height:var(--lh-body);color:var(--text)}
.fb-savebar{position:sticky;bottom:12px;display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-2);padding:var(--sp-3) var(--sp-4);margin-top:var(--sp-4);z-index:var(--z-sticky)}
.fb-res{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--sp-3);margin-bottom:var(--sp-2)}
.fb-res:last-child{margin-bottom:0}
.fb-res__ans{font-size:var(--fs-sm);line-height:var(--lh-body);margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)}
.fb-head-hint{font-size:var(--fs-2xs);color:var(--text-3);margin-top:3px}
`;

let cssDone = false;
function ensureCss() {
  if (cssDone) return;
  cssDone = true;
  const style = document.createElement('style');
  style.textContent = FB_CSS;
  document.head.appendChild(style);
}

function kindChip(kind, withIcon = true) {
  const hue = KIND_HUE[kind] ?? 1;
  return el('span', { class: `fb-chip fb-chip--h${hue}` },
    withIcon ? icon((KINDS.find((k) => k.kind === kind) ?? {}).icon ?? 'note', 12) : null,
    KIND_LABEL[kind] ?? kind);
}

function kindIco(kind, size = 16) {
  const hue = KIND_HUE[kind] ?? 1;
  return el('span', { class: `fb-kind__ico fb-ico--h${hue}` }, icon((KINDS.find((k) => k.kind === kind) ?? {}).icon ?? 'note', size));
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

function openBlockEditor(block, onSave) {
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

/* ردیف پیش‌نمایش — کنترل واقعی فرم، هم‌شکلِ آنچه پاسخ‌دهنده می‌بیند (بدون ثبت) */
function previewRow(b, i) {
  const num = fa(i + 1);
  const label = el('span', { class: 'fb-prev-label' },
    `${num}. `, b.label,
    b.required && b.kind !== 'note' ? el('span', { class: 'fb-prev-req', title: 'الزامی' }, '*') : null);
  let control;
  if (b.kind === 'note') {
    control = el('div', { class: 'fb-note' }, icon('info', 16), el('div', {}, b.note ?? ''));
  } else if (b.kind === 'longtext') {
    control = el('textarea', { class: 'input', rows: 3, placeholder: 'پاسخ بلند…', tabindex: -1 });
  } else if (b.kind === 'select') {
    control = el('div', {}, ...(b.options ?? []).map((o) =>
      el('label', { class: 'fb-opt' }, el('input', { type: 'radio', name: `prev-${i}`, tabindex: -1 }), o.label)));
  } else if (b.kind === 'multi') {
    control = el('div', {}, ...(b.options ?? []).map((o) =>
      el('label', { class: 'fb-opt' }, el('input', { type: 'checkbox', tabindex: -1 }), o.label)));
  } else if (b.kind === 'yes_no') {
    control = el('div', {},
      el('label', { class: 'fb-opt' }, el('input', { type: 'radio', name: `prev-yn-${i}`, tabindex: -1 }), 'بله'),
      el('label', { class: 'fb-opt' }, el('input', { type: 'radio', name: `prev-yn-${i}`, tabindex: -1 }), 'خیر'));
  } else if (b.kind === 'phone') {
    control = el('input', { class: 'input', dir: 'ltr', inputmode: 'tel', placeholder: '09xxxxxxxxx', tabindex: -1 });
  } else if (b.kind === 'number') {
    control = el('input', { class: 'input', inputmode: 'numeric', placeholder: 'یک عدد وارد کنید…', tabindex: -1 });
  } else {
    control = el('input', { class: 'input', placeholder: 'پاسخ کوتاه…', tabindex: -1 });
  }
  return el('div', { class: 'fb-prev-row' }, label, control);
}

function renderPreviewBody(form) {
  return el('div', { class: 'fb-prev__body', 'aria-hidden': 'true' },
    el('div', { class: 'fb-prev-row', style: { background: 'var(--surface-2)', marginBottom: 'var(--sp-3)' } },
      el('b', { style: { fontSize: 'var(--fs-md)', display: 'block' } }, form.title || 'فرم تازه'),
      form.description ? el('div', { class: 'fb-blk__meta' }, form.description) : null),
    ...(form.blocks ?? []).map((b, i) => previewRow(b, i)),
    (form.blocks ?? []).length === 0
      ? el('div', { class: 'fb-zone-empty' }, icon('layers', 22), 'با افزودن بلوک از پالت، پیش‌نمایش همین‌جا زنده می‌شود')
      : null);
}

function openPreviewModal(form) {
  openModal({
    title: `پیش‌نمایش — ${form.title || 'فرم تازه'}`,
    wide: true,
    body: renderPreviewBody(form),
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
    const bodyZone = shell.root.querySelector('.modal__body');
    let onlyNew = false;

    const paint = () => {
      if (rows.length === 0) {
        bodyZone?.replaceChildren(
          emptyState({ iconName: 'check', title: 'هنوز پاسخی ثبت نشده', hint: `لینک عمومی: /public/form/${form.slug}` })
        );
        return;
      }
      const newCount = rows.filter((r) => r.status === 'new').length;
      const visible = onlyNew ? rows.filter((r) => r.status === 'new') : rows;
      const renderRow = (r) => el('div', { class: 'fb-res' },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
          el('b', {}, r.respondentName),
          r.respondentPhone ? el('span', { class: 'muted', style: { fontSize: 'var(--fs-2xs)' } }, fa(r.respondentPhone)) : null,
          el('span', { class: `badge ${r.status === 'new' ? 'badge--error' : 'badge--success'}` }, r.status === 'new' ? 'جدید' : 'خوانده‌شده'),
          el('span', { class: 'muted', style: { fontSize: 'var(--fs-2xs)' } }, r.createdAt?.slice(0, 10) ?? ''),
          el('div', { style: { marginInlineStart: 'auto' } },
            r.status === 'new'
              ? el('button', {
                  class: 'btn btn--soft btn--sm',
                  onclick: async () => {
                    try {
                      await api.post(`/api/forms/${form.id}/responses/${r.id}/seen`, {});
                      toast('خوانده شد', 'success');
                      r.status = 'read';
                      paint();
                    } catch (err) { toastError(err); }
                  }
                }, 'خوانده شد')
              : null)
        ),
        el('div', { class: 'fb-res__ans' },
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
          }))
      );
      bodyZone?.replaceChildren(
        el('div', { class: 'week-bar', style: { marginBottom: 'var(--sp-3)' } },
          el('span', { class: 'badge badge--neutral' }, `${fa(newCount)} جدید از ${fa(rows.length)}`),
          el('div', { class: 'spacer' }),
          newCount > 0
            ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { onlyNew = !onlyNew; paint(); } },
                onlyNew ? 'نمایش همه' : 'فقط جدید')
            : null),
        ...visible.map(renderRow),
        visible.length === 0
          ? el('div', { class: 'fb-zone-empty' }, 'همهٔ پاسخ‌های جدید خوانده شدند ✓')
          : null
      );
    };
    paint();
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
  const blocksBadge = el('span', { class: 'badge badge--neutral' }, `${fa(blocks.length)} از ۶۰ بلوک`);
  const liveTitle = el('span', {}, existing ? existing.title : 'فرم تازه');
  const liveDesc = el('div', {});
  /* ۱.۲۷.۴۲ — وصلهٔ پیش‌نمایش زنده: body یک‌بار ساخته نمی‌شد؛ با هر تغییر دوباره رندر می‌شود */
  const prevBody = el('div', {});
  function paintPreview() {
    prevBody.replaceChildren(renderPreviewBody({
      title: titleIn.value,
      description: descIn.value,
      blocks
    }));
  }
  titleIn.addEventListener('input', () => { liveTitle.textContent = titleIn.value.trim() || 'فرم تازه'; paintPreview(); });
  descIn.addEventListener('input', () => { liveDesc.textContent = descIn.value.trim() ? descIn.value : ''; paintPreview(); });

  function paintBlocks() {
    if (blocks.length === 0) {
      blocksZone.replaceChildren(
        el('div', { class: 'fb-zone-empty' },
          icon('layers', 24),
          'هنوز بلوکی نیست — از پالت بالا نوع بلوک را انتخاب کنید؛ هر بلوک یک صفحهٔ مستقل در حالت تعاملی می‌شود.',
          el('span', { style: { fontSize: 'var(--fs-2xs)' } }, 'بلوک‌ها را می‌توانید با درگ جابه‌جا کنید')
        ));
      return;
    }
    let dragIdx = null;
    const clearMarks = (root) => root.querySelectorAll('.fb-blk').forEach((n) => n.classList.remove('is-over', 'is-drag'));
    const rows = blocks.map((b, i) => {
      const meta = b.kind === 'note' && b.note
        ? b.note.slice(0, 140)
        : (b.options?.length ? `گزینه‌ها: ${b.options.map((o) => o.label).join(' · ')}` : null);
      return el('div', {
        class: 'fb-blk', draggable: 'true', dataset: { i: String(i) },
        onclick: () => openBlockEditor(b, (next) => { blocks[i] = next; paintBlocks(); }),
        ondragstart: (e) => {
          dragIdx = i;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(i));
          e.currentTarget.classList.add('is-drag');
        },
        ondragover: (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (dragIdx !== null && dragIdx !== i) e.currentTarget.classList.add('is-over');
        },
        ondragleave: (e) => e.currentTarget.classList.remove('is-over'),
        ondrop: (e) => {
          e.preventDefault();
          if (dragIdx !== null && dragIdx !== i) {
            const [moved] = blocks.splice(dragIdx, 1);
            blocks.splice(i, 0, moved);
            paintBlocks();
          }
        },
        ondragend: (e) => { dragIdx = null; clearMarks(e.currentTarget.parentNode ?? blocksZone); }
      },
        el('div', { class: 'fb-num' }, fa(i + 1)),
        el('div', { class: 'fb-blk__main' },
          el('div', { class: 'fb-blk__title' },
            kindChip(b.kind),
            el('b', {}, b.label)),
          meta ? el('div', { class: 'fb-blk__meta' }, meta) : null),
        el('div', { class: 'fb-blk__side' },
          b.kind !== 'note'
            ? el('label', { class: 'switch', title: 'الزامی؟', onclick: (e) => e.stopPropagation() },
                el('input', { type: 'checkbox', checked: Boolean(b.required), onchange: (e) => { b.required = e.target.checked; paintBlocks(); } }),
                el('span', { class: 'switch__track' }))
            : null,
          el('div', { class: 'fb-blk__acts', onclick: (e) => e.stopPropagation() },
            el('button', { class: 'btn btn--ghost btn--sm', title: 'بالا', disabled: i === 0 ? true : null, onclick: () => { [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]]; paintBlocks(); } }, icon('chevR', 13)),
            el('button', { class: 'btn btn--ghost btn--sm', title: 'پایین', disabled: i === blocks.length - 1 ? true : null, onclick: () => { [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]]; paintBlocks(); } }, icon('chevL', 13)),
            el('button', { class: 'btn btn--ghost btn--sm', title: 'ویرایش', onclick: () => openBlockEditor(b, (next) => { blocks[i] = next; paintBlocks(); }) }, icon('edit', 13)),
            el('button', {
              class: 'btn btn--ghost btn--sm', title: 'تکرار بلوک',
              onclick: () => {
                if (blocks.length >= 60) { toastError(new Error('حداکثر ۶۰ بلوک در هر فرم')); return; }
                const copy = { ...b, options: b.options?.map((o) => ({ ...o })) };
                blocks.splice(i + 1, 0, copy);
                paintBlocks();
              }
            }, icon('copy', 13)),
            el('button', { class: 'btn btn--ghost btn--sm', title: 'حذف', onclick: () => { blocks.splice(i, 1); paintBlocks(); } }, icon('trash', 13))
          ))
      );
    });
    blocksZone.replaceChildren(...rows,
      el('button', { class: 'fb-addrow', onclick: () => openPaletteModal() }, icon('plus', 15), 'بلوک تازه'));
    blocksBadge.textContent = `${fa(blocks.length)} از ۶۰ بلوک`;
    paintPreview();
  }

  const palette = el('div', { class: 'fb-pal' },
    ...KINDS.map((k) =>
      el('button', {
        class: 'fb-kind',
        onclick: () => addBlockOf(k.kind)
      },
        kindIco(k.kind),
        el('span', { class: 'fb-kind__txt' }, el('b', {}, k.label), el('span', {}, k.hint)))
    )
  );

  /* ۱.۲۷.۴۲ — افزودن بلوک از پالت یا ردیف پایانی فهرست (سبک Tally): یک مسیر واحد */
  function addBlockOf(kind) {
    if (blocks.length >= 60) { toastError(new Error('حداکثر ۶۰ بلوک در هر فرم')); return; }
    const fresh = kind === 'note'
      ? { kind: 'note', label: 'صفحهٔ آگاهی', required: false, note: 'متن توضیحی این صفحه…' }
      : { kind, label: KIND_LABEL[kind] ?? kind, required: false };
    openBlockEditor(fresh, (next) => { blocks.push(next); paintBlocks(); });
  }

  /* پالت داخل مودال — ردیف «بلوک تازه» انتهای فهرست همان پالت را باز می‌کند */
  function openPaletteModal() {
    openModal({
      title: 'افزودن بلوک',
      wide: true,
      body: el('div', { class: 'fb-pal' },
        ...KINDS.map((k) =>
          el('button', {
            class: 'fb-kind',
            onclick: (e) => {
              const overlay = e.currentTarget.closest('.modal-overlay');
              addBlockOf(k.kind);
              const x = overlay?.querySelector('[data-close],.modal__close');
              if (x) x.click();
            }
          },
            kindIco(k.kind),
            el('span', { class: 'fb-kind__txt' }, el('b', {}, k.label), el('span', {}, k.hint)))
        )),
      actions: [(close) => el('button', { class: 'btn btn--ghost btn--sm', onclick: close }, 'بستن')]
    });
  }

  const editor = el('div', {},
    el('div', { class: 'fb-wrap' },
      el('div', { class: 'fb-main' },
        el('div', { class: 'card' },
          el('div', { class: 'card__head' },
            el('div', { class: 'card__title' }, existing ? `ویرایش فرم — ${existing.title}` : 'فرم تازه'),
            el('span', { class: `badge ${published ? 'badge--success' : 'badge--warning'}` }, published ? 'منتشرشده' : 'پیش‌نویس')
          ),
          el('div', { class: 'card__body' },
            el('div', { class: 'fb-meta' },
              el('div', {}, el('label', { class: 'f' }, 'عنوان فرم'), titleIn),
              el('div', {}, el('label', { class: 'f' }, 'اسلاگ لینک عمومی'), slugIn,
                el('div', { class: 'fb-head-hint' }, 'لینک عمومی: /public/form/اسلاگ — تغییر اسلاگِ منتشرشده لینک قبلی را می‌شکند'))
            ),
            el('div', { style: { marginTop: 'var(--sp-2)' } }, el('label', { class: 'f' }, 'توضیح (اختیاری)'), descIn)
          )
        ),
        el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } },
          el('div', { class: 'card__head' },
            el('div', { class: 'card__title' }, 'پالت بلوک‌ها'),
            el('span', { class: 'badge badge--neutral' }, 'کلیک = افزودن به انتها')
          ),
          el('div', { class: 'card__body' }, palette)
        ),
        el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } },
          el('div', { class: 'card__head' },
            el('div', { class: 'card__title' }, 'بلوک‌ها — هر بلوک یک صفحه'),
            blocksBadge
          ),
          el('div', { class: 'card__body' }, blocksZone)
        )
      ),
      el('aside', { class: 'fb-side', 'aria-hidden': 'true' },
        el('div', { class: 'card' },
          el('div', { class: 'card__head' },
            el('div', { class: 'card__title' }, icon('eye', 16), ' پیش‌نمایش زنده'),
            el('span', { class: 'badge badge--neutral' }, 'نمای پاسخ‌دهنده')
          ),
          prevBody
        )
      )
    ),
    el('div', { class: 'fb-savebar' },
      el('button', { class: 'btn btn--ghost', onclick: () => backToList(false) }, 'بازگشت به فهرست'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn--ghost', onclick: () => openPreviewModal({ title: titleIn.value, description: descIn.value, blocks }) }, icon('search', 15), 'پیش‌نمایش'),
      existing
        ? el('button', { class: 'btn btn--soft', onclick: () => togglePublish({ ...existing, title: titleIn.value.trim(), slug: slugIn.value.trim().toLowerCase(), description: descIn.value.trim() || undefined, blocks, published }, () => backToList(true)) }, published ? 'توقف انتشار' : 'انتشار فرم')
        : null,
      el('button', {
        class: 'btn btn--primary',
        onclick: async () => {
          const title = titleIn.value.trim();
          const slug = slugIn.value.trim().toLowerCase();
          if (title.length < 2) { toastError(new Error('عنوان فرم حداقل ۲ نویسه است')); return; }
          if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)) { toastError(new Error('اسلاگ فقط لاتین کوچک، رقم و خط‌تیره (۳ تا ۶۰)')); return; }
          await saveForm(existing, { title, slug, description: descIn.value.trim() || undefined, blocks, published }, () => backToList(true));
        }
      }, icon('check', 15), 'ذخیرهٔ فرم')
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
            el('strong', { style: { fontSize: 'var(--fs-md)' } }, f.title),
            el('code', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--muted)', direction: 'ltr' } }, `/public/form/${f.slug}`),
            el('span', { class: `badge ${f.published ? 'badge--success' : 'badge--warning'}` }, f.published ? 'منتشرشده' : 'پیش‌نویس'),
            el('span', { class: 'badge badge--neutral' }, `${fa(f.blocks?.length ?? 0)} بلوک`)
          ),
          f.description ? el('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)', marginTop: '4px' } }, f.description) : null,
          el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' } },
            el('button', { class: 'btn btn--primary btn--sm', onclick: () => openEditor(container, f, backToList) }, icon('edit', 14), 'ویرایش'),
            el('button', { class: 'btn btn--soft btn--sm', onclick: () => openResponses(f) }, icon('clip', 14), 'پاسخ‌ها'),
            f.published ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => copyPublicLink(f.slug) }, icon('link', 14), 'کپی لینک عمومی') : null,
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => togglePublish(f, () => paintList(true)) }, f.published ? 'توقف انتشار' : 'انتشار'),
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => removeForm(f, () => paintList(false)) }, 'حذف')
          ),
          f.published
            ? el('div', { class: 'muted', style: { fontSize: 'var(--fs-2xs)', marginTop: 'var(--sp-2)' } },
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
