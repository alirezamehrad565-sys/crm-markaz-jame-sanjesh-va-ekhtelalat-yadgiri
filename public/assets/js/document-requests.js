/**
 * مدارک بله — درخواست مدارک از خانواده + کارت «مدارک دریافتی از بله» (m151 — T2)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// document-requests.js — پنل دسترسی سریع پرونده:
// «درخواست مدارک» → پیام بله به چت خانواده → خانواده عکس/فایل می‌فرستد →
// همین کارت روی پروفایل همه را با بندانگشتی/تاریخ شمسی/برچسب قالب نشان می‌دهد.
// الگوها: تامبنیل lazy با IntersectionObserver (views/exercises.js) + کارت tl-item__card
// + مودال openModal با چیپ‌های انتخاب — بدون رنگ/فونت جدید (توکن‌های m144 دست‌نخورده).

import { api } from './api.js';
import { el, icon, openModal, confirmModal, toast, toastError } from './ui.js';
import { fa, formatJalaliDateTime } from './format.js';

const DOC_TEMPLATES = [
  { key: 'dictation', label: 'نمونهٔ املا و نوشتن‌های کلاسی' },
  { key: 'report_card', label: 'کارنامه و برگه‌های مدرسه' },
  { key: 'teacher_report', label: 'گزارش کتبی معلم' },
  { key: 'prev_eval', label: 'ارزیابی/گزارش قبلی (بی‌بی‌اسک، گفتاردرمانی و…)' }
];

const DOC_STATUS_BADGE = { sent: 'warning', received: 'success', closed: 'neutral' };
const DOC_STATUS_LABEL = { sent: 'در انتظار مدارک', received: 'مدارک رسید', closed: 'بسته‌شده' };

const IMG_MIME = /^image\//;

const docFileUrl = (doc) => `/api/students/${doc.studentId}/received-docs/${doc.id}/file`;

/** mime قطعی: اعلامی سالم → پسوند (رکوردهای octet-stream) — الگوی exercises.js */
function resolvedMime(doc) {
  const declared = String(doc.mime ?? '').toLowerCase();
  if (declared && declared !== 'application/octet-stream') return declared;
  const ext = String(doc.fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image/jpeg';
  return declared || 'application/octet-stream';
}

/** برچسب قالب‌های درخواستِ متناظر — رکورد بدون درخواست → خنثی */
function templateBadges(doc, requestOfId) {
  const req = doc.requestId ? requestOfId.get(doc.requestId) : null;
  if (!req) return el('span', { class: 'cell-sub' }, 'بدون درخواست باز');
  return el('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
    ...(req.templates ?? []).map((t) => {
      const meta = DOC_TEMPLATES.find((x) => x.key === t);
      return el('span', { class: 'badge badge--neutral' }, meta?.label ?? t);
    })
  );
}

// ─────────────── مودال «درخواست مدارک» ───────────────

export function openDocRequestModal(student, { onSent } = {}) {
  const picked = new Set();
  const chips = DOC_TEMPLATES.map((t) => {
    const chip = el('button', {
      type: 'button',
      class: 'chip',
      onclick: () => {
        if (picked.has(t.key)) picked.delete(t.key);
        else picked.add(t.key);
        chip.classList.toggle('is-active', picked.has(t.key));
      }
    }, t.label);
    return chip;
  });

  const note = el('textarea', {
    class: 'textarea', rows: 3,
    placeholder: 'یادداشت اختیاری — مثلاً: فقط صفحات آخرین کارنامه کافی است.'
  });

  const { close } = openModal({
    title: 'درخواست مدارک از خانواده',
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
      el('p', { style: { margin: 0, color: 'var(--text-2)', fontSize: 'var(--fs-sm)' } },
        `پیام درخواست با بات بله به گفتگوی خانوادهٔ ${student.firstName} ${student.lastName} ارسال می‌شود؛ عکس/فایلی که بفرستند مستقیم به همین پرونده ضمیمه می‌شود.`),
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, ...chips),
      note
    ),
    actions: [
      (c) => el('button', { class: 'btn btn--ghost', onclick: c }, 'انصراف'),
      (c) => {
        const btn = el('button', { class: 'btn btn--primary' }, icon('bot', 16), 'ارسال درخواست');
        btn.onclick = async () => {
          if (picked.size === 0) {
            toast('حداقل یک قالب مدرک انتخاب کنید', 'warning');
            return;
          }
          btn.disabled = true;
          try {
            const res = await api.post(`/api/students/${student.id}/document-requests`, {
              templates: [...picked],
              custom_note: note.value.trim() || null
            });
            toast(`درخواست برای ${fa(res.data.deliveredChats)} گفتگوی خانواده ارسال شد`, 'success');
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

// ─────────────── پیش‌نمایش مدرک (عکس/PDF) — الگوی preview تمرین‌ها ───────────────

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

/** دانلود مستقیم مدرک — همان الگوی blob دانلود تمرین‌ها */
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

// ─────────────── کارت «مدارک دریافتی از بله» ───────────────

/** بندانگشتی مدرک — عکس: lazy objectURL؛ بقیه: کاشی نوع — الگوی تامبنیل بانک تمرین */
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

/**
 * کارت مدارک پرونده — در پروفایل دانش‌آموز (پایین کارت وضعیت) mount می‌شود.
 * onChanged بعد از ارسال درخواست/بستن، رندر دوبارهٔ پروفایل را صدا می‌زند.
 */
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
      // — مدارک اختیاری‌اند؛ خطا کارت را خالی رها می‌کند
    }
    const requestOfId = new Map(requests.map((r) => [r.id, r]));
    const openRequests = requests.filter((r) => r.status !== 'closed');

    // ── ردیف درخواست‌های باز ──
    const requestRows = openRequests.map((r) => {
      const badges = (r.templates ?? []).map((t) => {
        const meta = DOC_TEMPLATES.find((x) => x.key === t);
        return el('span', { class: 'badge badge--neutral' }, meta?.label ?? t);
      });
      return el('div', { class: 'tl-item__card', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
        el('span', { class: `badge badge--${DOC_STATUS_BADGE[r.status] ?? 'neutral'}` }, DOC_STATUS_LABEL[r.status] ?? r.status),
        ...badges,
        r.customNote ? el('span', { class: 'cell-sub' }, r.customNote) : null,
        el('span', { style: { flex: 1 } }),
        el('span', { class: 'cell-sub' }, `${formatJalaliDateTime(r.sentAt)} — ${fa(r.deliveredChats)} گفتگو`),
        el('button', {
          class: 'btn btn--ghost btn--sm',
          title: 'پس از بستن، مدارک جدیدِ خانواده به این درخواست ضمیمه نمی‌شود',
          onclick: async () => {
            const ok = await confirmModal({
              title: 'بستن درخواست مدارک',
              message: 'درخواست بسته شود؟ خانواده دیگر مدارک جدید برای همین درخواست نمی‌فرستد.',
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

    // ── فهرست مدارک دریافتی ──
    const docRows = docs.map((d) => el('div', { class: 'tl-item__card', style: { display: 'flex', gap: 'var(--sp-3)', alignItems: 'stretch' } },
      docThumb(d),
      el('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' } },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
          el('b', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, d.fileName),
          templateBadges(d, requestOfId)
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

/** پیام خالی کارت — کوتاه و راهنما */
function emptyDocsHint(hasOpen) {
  return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' } },
    el('span', { class: 'cell-sub' },
      hasOpen
        ? 'درخواست ارسال شده — به‌محض اینکه خانواده عکس یا فایل بفرستد، همین‌جا جمع می‌شود.'
        : 'درخواست بفرستید تا مدارک خانواده این‌جا جمع شود — عکس املا، کارنامه، گزارش معلم و ارزیابی‌های قبلی با بله به پرونده ضمیمه می‌شود.')
  );
}
