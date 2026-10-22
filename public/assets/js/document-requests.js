import { api } from './api.js';
import { el, icon, openModal, confirmModal, toast, toastError } from './ui.js';
import { fa, formatJalaliDateTime } from './format.js';

const DOC_TAGS = [
  { key: 'narrative', label: 'نمونهٔ روایی' },
  { key: 'dictation', label: 'نمونهٔ املا' },
  { key: 'exam', label: 'برگهٔ امتحان' },
  { key: 'report_card', label: 'کارنامه' },
  { key: 'homework', label: 'نمونهٔ تکلیف' },
  { key: 'other', label: 'سایر مدارک' }
];

const DOC_LEGACY_TAG_LABELS = {
  teacher_report: 'گزارش کتبی معلم',
  prev_eval: 'ارزیابی/گزارش قبلی'
};

const DOC_RECIPIENTS = [
  { key: 'family', label: 'خانواده' },
  { key: 'teacher', label: 'معلم' }
];

const DOC_TAGS_MAX = 8;

function docTagLabel(tag) {
  const preset = DOC_TAGS.find((x) => x.key === tag);
  if (preset) return preset.label;
  return DOC_LEGACY_TAG_LABELS[tag] ?? String(tag);
}

const DOC_STATUS_BADGE = { sent: 'warning', received: 'success', closed: 'neutral' };
const DOC_STATUS_LABEL = { sent: 'در انتظار مدارک', received: 'مدارک رسید', closed: 'بسته‌شده' };

const docFileUrl = (doc) => `/api/students/${doc.studentId}/received-docs/${doc.id}/file`;

function resolvedMime(doc) {
  const declared = String(doc.mime ?? '').toLowerCase();
  if (declared && declared !== 'application/octet-stream') return declared;
  const ext = String(doc.fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image/jpeg';
  return declared || 'application/octet-stream';
}

function tagBadges(doc, requestOfId) {
  const req = doc.requestId ? requestOfId.get(doc.requestId) : null;
  if (!req) return el('span', { class: 'cell-sub' }, 'بدون درخواست باز');
  return el('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
    ...(req.tags ?? []).map((t) => el('span', { class: 'badge badge--neutral' }, docTagLabel(t)))
  );
}

export function openDocRequestModal(student, { onSent } = {}) {
  const pickedRecipients = new Set(['family']); // — خانواده پیش‌فرض؛ معلم به‌اختیار
  const pickedTags = new Set();

  const recipientChips = DOC_RECIPIENTS.map((r) => {
    const chip = el('button', {
      type: 'button',
      class: 'chip',
      onclick: () => {
        if (pickedRecipients.has(r.key)) pickedRecipients.delete(r.key);
        else pickedRecipients.add(r.key);
        chip.classList.toggle('is-active', pickedRecipients.has(r.key));
      }
    }, r.label);
    if (pickedRecipients.has(r.key)) chip.classList.add('is-active');
    return chip;
  });

  const tagBox = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });

  function paintTags() {
    const chips = DOC_TAGS.map((t) => el('button', {
      type: 'button',
      class: `chip${pickedTags.has(t.key) ? ' is-active' : ''}`,
      onclick: () => {
        if (pickedTags.has(t.key)) pickedTags.delete(t.key);
        else if (pickedTags.size >= DOC_TAGS_MAX) {
          toast(`بیش از ${fa(DOC_TAGS_MAX)} تگ نمی‌شود`, 'warning');
          return;
        } else pickedTags.add(t.key);
        paintTags();
      }
    }, t.label));
    for (const t of pickedTags) {
      if (DOC_TAGS.some((x) => x.key === t)) continue;
      chips.push(el('button', {
        type: 'button',
        class: 'chip is-active',
        title: 'حذف تگ دلخواه',
        onclick: () => {
          pickedTags.delete(t);
          paintTags();
        }
      }, t, ' ', icon('x', 11)));
    }
    tagBox.replaceChildren(...chips);
  }
  paintTags();

  const customTag = el('input', {
    class: 'input',
    placeholder: 'تگ دلخواه — مثل «گزارش معلم خصوصی»',
    maxlength: 40
  });
  const addCustomTag = () => {
    const text = String(customTag.value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (pickedTags.size >= DOC_TAGS_MAX) {
      toast(`بیش از ${fa(DOC_TAGS_MAX)} تگ نمی‌شود`, 'warning');
      return;
    }
    pickedTags.add(text.slice(0, 40));
    customTag.value = '';
    paintTags();
  };
  customTag.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      addCustomTag();
    }
  });

  const note = el('textarea', {
    class: 'textarea', rows: 3,
    placeholder: 'توضیح آزاد (اختیاری) — مثلاً: چند نمونه املای ماه اخیر و آخرین کارنامه کافی است.'
  });

  const { close } = openModal({
    title: 'درخواست مدارک',
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
      el('p', { style: { margin: 0, color: 'var(--text-2)', fontSize: 'var(--fs-sm)' } },
        `پیام درخواست با بات بله به گیرنده‌های انتخابی (خانواده و/یا معلم) ارسال می‌شود؛ عکس/فایلی که بفرستند مستقیم به پروندهٔ ${student.firstName} ${student.lastName} ضمیمه می‌شود.`),
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
        el('span', { class: 'cell-sub' }, 'گیرنده:'),
        ...recipientChips),
      tagBox,
      el('div', { style: { display: 'flex', gap: '6px' } },
        customTag,
        el('button', { class: 'btn btn--soft btn--sm', type: 'button', onclick: addCustomTag }, icon('plus', 14), 'افزودن')),
      note
    ),
    actions: [
      (c) => el('button', { class: 'btn btn--ghost', onclick: c }, 'انصراف'),
      (c) => {
        const btn = el('button', { class: 'btn btn--primary' }, icon('bot', 16), 'ارسال درخواست');
        btn.onclick = async () => {
          if (pickedRecipients.size === 0) {
            toast('حداقل یک گیرنده انتخاب کنید', 'warning');
            return;
          }
          if (pickedTags.size === 0) {
            toast('حداقل یک تگ مدرک انتخاب کنید', 'warning');
            return;
          }
          btn.disabled = true;
          try {
            const res = await api.post(`/api/students/${student.id}/document-requests`, {
              tags: [...pickedTags],
              recipients: [...pickedRecipients],
              custom_note: note.value.trim() || null
            });
            toast(`درخواست برای ${fa(res.data.deliveredChats)} گفتگو ارسال شد`, 'success');
            c();
            onSent?.();
          } catch (err) {
            toastError(err);
            btn.disabled = false;
          }
        };
        return btn;
      }
    ]
  });
  void close;
}

function openDocPreviewModal(doc) {
  let currentUrl = null;
  const status = el('div', { class: 'exb-preview__status' });
  const pdfBar = el('div', { class: 'exb-preview__pdfbar' });
  const stage = el('div', { class: 'exb-preview__stage' });

  const { close } = openModal({
    title: doc.fileName,
    wide: true,
    body: el('div', { class: 'exb-preview' }, status, stage, pdfBar),
    actions: [
      (c) => el('button', {
        class: 'btn btn--soft',
        onclick: () => {
          close();
          openDocDownload(doc);
        }
      }, icon('download', 15), 'دانلود'),
      (c) => el('button', { class: 'btn btn--ghost', onclick: c }, 'بستن')
    ],
    onClose: () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    }
  });
  void close;

  (async () => {
    stage.replaceChildren(el('span', { class: 'exb-preview__status' }, 'در حال دریافت پیش‌نمایش…'));
    try {
      const res = await fetch(docFileUrl(doc), {
        headers: { Authorization: `Bearer ${localStorage.getItem('cs.token') ?? ''}` }
      });
      if (!res.ok) throw new Error(`دریافت فایل ناموفق بود (کد ${fa(res.status)})`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const mime = resolvedMime(doc) === 'application/octet-stream' ? String(blob.type ?? '') : resolvedMime(doc);
      if (mime === 'application/pdf') {
        currentUrl = objUrl;
        stage.replaceChildren(el('iframe', { class: 'exb-preview__frame', src: objUrl, title: doc.fileName }));
        pdfBar.replaceChildren(
          el('span', { class: 'cell-sub' }, 'PDF نمایش داده نمی‌شود؟'),
          el('button', { class: 'btn btn--ghost btn--sm', onclick: () => window.open(objUrl, '_blank', 'noopener') },
            icon('download', 14), 'باز کردن در تب جدید')
        );
      } else if (mime.startsWith('image/')) {
        currentUrl = objUrl;
        stage.replaceChildren(el('img', { class: 'exb-preview__img', src: objUrl, alt: doc.fileName }));
      } else {
        URL.revokeObjectURL(objUrl);
        stage.replaceChildren(el('span', { class: 'exb-preview__status' }, 'پیش‌نمایش این نوع فایل ممکن نیست — از دانلود استفاده کنید'));
      }
    } catch (err) {
      stage.replaceChildren(el('span', { class: 'exb-preview__status' }, 'دریافت پیش‌نمایش ناموفق بود'));
      toastError(err);
    }
  })();
}

export async function openDocDownload(doc) {
  try {
    const res = await fetch(docFileUrl(doc), {
      headers: { Authorization: `Bearer ${localStorage.getItem('cs.token') ?? ''}` }
    });
    if (!res.ok) throw new Error('دریافت فایل ناموفق بود');
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = el('a', { href: objUrl, download: doc.fileName ?? 'document' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
  } catch (err) {
    toastError(err);
  }
}

function docThumb(doc) {
  const mime = resolvedMime(doc);
  const stage = el('div', {
    class: `exb-thumb${mime === 'application/pdf' || mime.startsWith('image/') ? ' exb-thumb--click' : ''}`,
    role: 'button',
    'aria-label': `مشاهدهٔ ${doc.fileName}`,
    title: 'مشاهده',
    onclick: mime === 'application/pdf' || mime.startsWith('image/')
      ? () => openDocPreviewModal(doc)
      : null
  });
  if (mime.startsWith('image/')) {
    stage.append(el('span', { class: 'exb-thumb__tile' }, icon('eye', 20), el('b', {}, 'پیش‌نمایش…')));
    const io = new IntersectionObserver((entries, obs) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      obs.disconnect();
      (async () => {
        try {
          const res = await fetch(docFileUrl(doc), {
            headers: { Authorization: `Bearer ${localStorage.getItem('cs.token') ?? ''}` }
          });
          if (!res.ok) throw new Error('بارگذاری پیش‌نمایش ناموفق بود');
          const objUrl = URL.createObjectURL(await res.blob());
          stage.replaceChildren(el('img', { src: objUrl, alt: doc.fileName }));
        } catch {
          stage.replaceChildren(el('span', { class: 'exb-thumb__tile' }, icon('file', 20), el('b', {}, 'در دسترس نیست')));
        }
      })();
    }, { rootMargin: '240px' });
    io.observe(stage);
  } else if (mime === 'application/pdf') {
    stage.append(el('span', { class: 'exb-thumb__tile' }, icon('file', 20), el('b', {}, 'PDF')));
  } else {
    stage.append(el('span', { class: 'exb-thumb__tile' }, icon('file', 20), el('b', {}, 'فایل')));
  }
  return stage;
}

export function renderDocsQuickCard(mount, student, { onChanged } = {}) {
  mount.replaceChildren(el('div', { class: 'card' }, el('div', { class: 'card__body' }, el('span', { class: 'cell-sub' }, 'در حال بارگذاری مدارک…'))));

  (async () => {
    let requests = [];
    let docs = [];
    try {
      const [reqRes, docsRes] = await Promise.all([
        api.get(`/api/students/${student.id}/document-requests`).catch(() => ({ data: [] })),
        api.get(`/api/students/${student.id}/received-docs`).catch(() => ({ data: [] }))
      ]);
      requests = reqRes.data ?? [];
      docs = docsRes.data ?? [];
    } catch {
    }
    const requestOfId = new Map(requests.map((r) => [r.id, r]));
    const openRequests = requests.filter((r) => r.status !== 'closed');

    const requestRows = openRequests.map((r) => {
      const recipientBadges = (r.recipients ?? ['family']).map((rc) => {
        const meta = DOC_RECIPIENTS.find((x) => x.key === rc);
        return el('span', { class: 'badge badge--info' }, `به ${meta?.label ?? rc}`);
      });
      const tagBadges = (r.tags ?? []).map((t) => el('span', { class: 'badge badge--neutral' }, docTagLabel(t)));
      return el('div', { class: 'tl-item__card', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
        el('span', { class: `badge badge--${DOC_STATUS_BADGE[r.status] ?? 'neutral'}` }, DOC_STATUS_LABEL[r.status] ?? r.status),
        ...recipientBadges,
        ...tagBadges,
        r.customNote ? el('span', { class: 'cell-sub' }, r.customNote) : null,
        el('span', { style: { flex: 1 } }),
        el('span', { class: 'cell-sub' }, `${formatJalaliDateTime(r.sentAt)} — ${fa(r.deliveredChats)} گفتگو`),
        el('button', {
          class: 'btn btn--ghost btn--sm',
          title: 'پس از بستن، مدارک جدیدِ گیرنده‌ها به این درخواست ضمیمه نمی‌شود',
          onclick: async () => {
            const ok = await confirmModal({
              title: 'بستن درخواست مدارک',
              message: 'درخواست بسته شود؟ خانواده و معلم دیگر مدارک جدید برای همین درخواست نمی‌فرستند.',
              confirmLabel: 'بستن درخواست'
            });
            if (!ok) return;
            try {
              await api.post(`/api/requests/${r.id}/close`);
              toast('درخواست بسته شد', 'success');
              onChanged?.();
            } catch (err) {
              toastError(err);
            }
          }
        }, icon('x', 13), 'بستن')
      );
    });

    const docRows = docs.map((d) => el('div', { class: 'tl-item__card', style: { display: 'flex', gap: 'var(--sp-3)', alignItems: 'stretch' } },
      docThumb(d),
      el('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' } },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
          el('b', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, d.fileName),
          tagBadges(d, requestOfId)
        ),
        el('div', { class: 'cell-sub' },
          `${formatJalaliDateTime(d.storedAt)} — ${d.mediaKind === 'photo' ? 'عکس' : 'فایل'}${d.caption ? ` — «${d.caption}»` : ''}`)
      ),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' } },
        el('button', { class: 'btn btn--ghost btn--sm', title: 'دانلود', onclick: () => openDocDownload(d) }, icon('download', 15)),
        mimePreviewable(d)
          ? el('button', { class: 'btn btn--ghost btn--sm', title: 'پیش‌نمایش', onclick: () => openDocPreviewModal(d) }, icon('eye', 15))
          : null
      )
    ));

    mount.replaceChildren(
      el('div', { class: 'card' },
        el('div', { class: 'card__head' },
          el('div', { class: 'card__title' }, `مدارک دریافتی از بله (${fa(docs.length)})`),
          el('button', {
            class: 'btn btn--primary btn--sm',
            onclick: () => openDocRequestModal(student, { onSent: onChanged })
          }, icon('bot', 15), 'درخواست مدارک')
        ),
        el('div', { class: 'card__body', style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
          requestRows.length > 0
            ? el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } }, ...requestRows)
            : null,
          docs.length === 0
            ? emptyDocsHint(openRequests.length > 0)
            : el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } }, ...docRows)
        )
      )
    );
  })();
}

function mimePreviewable(doc) {
  const mime = resolvedMime(doc);
  return mime === 'application/pdf' || mime.startsWith('image/');
}

function emptyDocsHint(hasOpen) {
  return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' } },
    el('span', { class: 'cell-sub' },
      hasOpen
        ? 'درخواست ارسال شده — به‌محض اینکه خانواده یا معلم عکس یا فایل بفرستد، همین‌جا جمع می‌شود.'
        : 'درخواست بفرستید تا مدارک این‌جا جمع شود — نمونهٔ روایی، املا، برگهٔ امتحان و کارنامه از خانواده یا معلم با بله به پرونده ضمیمه می‌شود.')
  );
}
