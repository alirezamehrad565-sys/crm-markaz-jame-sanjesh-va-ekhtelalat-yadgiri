/**
 * ارسال تمرین به خانواده
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// exercise-send.js — ارسال تمرین با بله + تب «تمرین‌ها»ی پروفایل دانش‌آموز
// جریان یک‌کلیکی هم‌تراز موتور چک‌لیست:
// پیشنهاد برچسب‌محور (★) → انتخاب تمرین/بستهٔ آماده → پیام بله به چت ولیّ‌ها با لینک امن دانلود
// تب پروفایل: تاریخچهٔ بسته‌های تکلیف با وضعیت هر تمرین، بازگشتی خانواده و یادآوری.

import { api } from './api.js';
import { el, icon, toast, toastError, confirmModal, openModal, statusBadge, emptyState, loadingState, errorState } from './ui.js';
import { fa, formatJalaliNumeric, safeExternalHref } from './format.js';
import { session } from './state.js';

function isStaff() {
  return session.user && ['manager', 'therapist', 'secretary'].includes(session.user.role);
}

function studentLabel(student) {
  return `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() || 'دانش‌آموز';
}

/** دانلود فایل بازگشتی خانواده (با توکن پنل) */
export async function downloadSubmissionFile(submissionId, filename) {
  try {
    const res = await fetch(`/api/exercises/submissions/${submissionId}/file`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('cs.token') ?? ''}` }
    });
    if (!res.ok) throw new Error('دریافت فایل بازگشتی ناموفق بود');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename ?? 'submission' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    toastError(err);
  }
}

/**
 * مودال «ارسال تمرین با بله» — انتخاب چندتایی تمرین ( — بدون تقسیم‌بندی بسته:
 * هرچند تمرین انتخاب شود در یک پیام می‌رود)
 * پیشنهاد ★ = تطبیق برچسب دانش‌آموز با برچسب تمرین (موتور )
 * onSent(batch, sendResult) بعد از ارسال صدا می‌شود.
 */
export async function openExerciseSendModal({ student, onSent }) {
  if (!isStaff()) {
    toast('ارسال تمرین برای نقش شما فعال نیست');
    return;
  }
  let suggestions;
  try {
    suggestions = (await api.get(`/api/students/${student.id}/exercises/suggest`)).data;
  } catch (err) {
    toastError(err);
    return;
  }
  const exercises = suggestions?.exercises ?? [];
  if (exercises.length === 0) {
    toast('بانک تمرین خالی است — اول از «بانک تمرین» تمرین ثبت کنید');
    return;
  }

  const picked = new Set(); // exerciseId → انتخاب‌ها
  if (exercises.some((s) => s.score > 0)) {
    // پیشنهادهای ★ از قبل تیک می‌خورند — درمانگر فقط تنظیم می‌کند
    for (const s of exercises) if (s.score > 0) picked.add(s.exercise.id);
  }

  // ─── بدنهٔ مودال ───
  const search = el('input', { class: 'input exb-search', placeholder: 'جستجوی تمرین…', style: { marginBottom: 'var(--sp-2)' } });
  const listBox = el('div', { style: { maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-2)' } });
  const hint = el('div', { class: 'cell-sub', style: { marginTop: 'var(--sp-1)' } });

  const note = el('textarea', {
    class: 'textarea',
    rows: 2,
    maxlength: 500,
    placeholder: 'یادداشت برای خانواده (اختیاری — مثل «روزی ۱۰ دقیقه») …'
  });

  function matchQ(title) {
    const q = search.value.trim();
    if (!q) return true;
    return title.includes(q);
  }

  function drawList() {
    const filtered = exercises.filter((s) => matchQ(s.exercise.title));
    const rows = filtered.map((s) => {
      // پیشنهاد برچسب با وکتور ستاره به‌جای نویسهٔ ★ متن
      const star = s.score > 0;
      const box = el('input', { type: 'checkbox', value: s.exercise.id });
      box.checked = picked.has(s.exercise.id);
      box.addEventListener('change', () => {
        if (box.checked) picked.add(s.exercise.id);
        else picked.delete(s.exercise.id);
        updateCount();
      });
      // زیرنویس: پیشنهاد برچسب / قالب + نشان لینک بیرونی
      const subParts = [];
      if (s.matched.length > 0) subParts.push(`مناسب: ${s.matched.map((m) => m.name).join('، ')}`);
      else subParts.push(s.exercise.format === 'game' ? 'بازی' : s.exercise.format === 'instruction' ? 'دستورالعمل' : 'کاربرگ');
      if (s.exercise.externalUrl) subParts.push('بازی آنلاین');
      return el(
        'label',
        { class: 'exb-pick-row', style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 4px', cursor: 'pointer' } },
        box,
        el('span', { style: { flex: 1 } },
          el('b', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, star ? icon('star', 13) : null, s.exercise.title),
          el('span', { class: 'cell-sub' }, ` — ${subParts.join(' — ')}`))
      );
    });
    listBox.replaceChildren(...(rows.length ? rows : [el('div', { class: 'cell-sub', style: { padding: '8px' } }, 'تمرینی با این جستجو پیدا نشد')]));
    updateCount();
  }

  function updateCount() {
    hint.textContent = picked.size > 0 ? `${fa(picked.size)} تمرین انتخاب شده — همه در یک پیام می‌روند.` : 'حداقل یک تمرین انتخاب کنید.';
  }

  search.addEventListener('input', drawList);
  drawList();

  const body = el(
    'div',
    {},
    search,
    listBox,
    hint,
    el('div', { class: 'field', style: { marginTop: 'var(--sp-3)' } }, el('label', { class: 'field__label' }, 'یادداشت برای خانواده (اختیاری)'), note)
  );

  const actions = [
    (close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'انصراف'),
    (close) =>
      el(
        'button',
        {
          class: 'btn btn--primary',
          onclick: async () => {
            try {
              if (picked.size === 0) {
                toast('حداقل یک تمرین انتخاب کنید', 'warning');
                return;
              }
              const payload = { exercise_ids: [...picked], note: note.value.trim() || null };
              const created = await api.post(`/api/students/${student.id}/exercises/batches`, payload);
              const batch = created.data;
              const send = await api.post(`/api/exercises/batches/${batch.id}/send`, {});
              if (send.data.sent > 0) {
                toast(`تمرین‌ها برای ${studentLabel(student)} به چت خانواده ارسال شد (${fa(send.data.sent)} پیام)`);
              } else {
                toast('تمرین‌ها در پرونده ثبت شد — ولیّ هنوز به بات متصل نیست', 'warning');
              }
              onSent?.(batch, send.data);
              close();
            } catch (err) {
              toastError(err);
            }
          }
        },
        icon('zap', 16),
        'ارسال با بله'
      )
  ];

  openModal({
    title: `ارسال تمرین با بله — ${studentLabel(student)}`,
    body,
    wide: true,
    actions
  });
}

/**
 * تب «تمرین‌ها»ی پروفایل دانش‌آموز — بسته‌های تکلیف با وضعیت هر تمرین + بازگشتی‌ها + یادآوری
 */
export async function renderExercisesTab(box, { student, onChanged }) {
  box.replaceChildren(loadingState());
  let batches;
  try {
    batches = (await api.get(`/api/students/${student.id}/exercises/batches?limit=30`)).data ?? [];
  } catch (err) {
    box.replaceChildren(errorState(err, () => renderExercisesTab(box, { student, onChanged })));
    return;
  }

  const sendBtn = isStaff()
    ? el(
        'button',
        { class: 'btn btn--primary btn--sm', onclick: () => openExerciseSendModal({ student, onSent: () => renderExercisesTab(box, { student, onChanged }) }) },
        icon('zap', 15),
        'ارسال تمرین با بله'
      )
    : null;

  const head = el(
    'div',
    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' } },
    el('div', {},
      el('div', { class: 'card__title' }, 'تمرین‌های خانه'),
      el('div', { class: 'cell-sub' }, 'هر ارسال یک «بستهٔ تکلیف» است — وضعیت هر تمرین و بازگشت خانواده اینجا دیده می‌شود.')
    ),
    sendBtn
  );

  if (batches.length === 0) {
    box.replaceChildren(
      head,
      emptyState({
        iconName: 'file',
        title: 'هنوز تمرینی ارسال نشده',
        hint: 'با «ارسال تمرین با بله»، کاربرگ یا بستهٔ آماده را با یک کلیک برای خانواده بفرستید.'
      })
    );
    return;
  }

  function itemStatusMeta(status) {
    if (status === 'corrected') return { badge: statusBadge('corrected') };
    if (status === 'done') return { badge: el('span', { class: 'badge badge--success' }, 'انجام شد') };
    if (status === 'cancelled') return { badge: statusBadge('cancelled') };
    return { badge: statusBadge('assigned') };
  }

  async function remind(batch) {
    const ok = await confirmModal({
      title: 'یادآوری تمرین',
      message: `پیام «${batch.title}» دوباره به چت خانواده ارسال شود؟`,
      confirmLabel: 'ارسال یادآوری'
    });
    if (!ok) return;
    try {
      const res = await api.post(`/api/exercises/batches/${batch.id}/send`, {});
      if (res.data.sent > 0) toast(`یادآوری ارسال شد (${fa(res.data.sent)} پیام)`);
      else toast('همین حالا ارسال شده — یک دقیقه بعد تلاش کنید', 'warning');
      renderExercisesTab(box, { student, onChanged });
    } catch (err) {
      toastError(err);
    }
  }

  const cards = batches.map((b) => {
    const done = b.items.filter((i) => i.status === 'done' || i.status === 'corrected').length;
    const itemRows = b.items.map((item) => {
      const { badge } = itemStatusMeta(item.status);
      return el(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--border)' } },
        el('b', { style: { flex: 1, minWidth: '140px' } }, item.exerciseTitle),
        badge,
        // لینک بازی/تمرین آنلاین بیرونی
        // فقط http/https به‌صورت لینک رندر می‌شود (دفاع دوم در برابر href نامعتبر)
        safeExternalHref(item.externalUrl)
          ? el('a', { class: 'btn btn--ghost btn--sm', href: safeExternalHref(item.externalUrl), target: '_blank', rel: 'noopener', title: `باز کردن بازی/تمرین آنلاین — ${item.externalUrl}` }, icon('zap', 13), 'بازی')
          : null,
        item.submission
          ? el(
              'button',
              { class: 'btn btn--ghost btn--sm', title: `بازگشتی: ${item.submission.filename ?? '—'}`, onclick: () => downloadSubmissionFile(item.submission.id, item.submission.filename ?? 'submission') },
              icon('download', 13)
            )
          : null
      );
    });

    return el(
      'div',
      { class: 'card' },
      el(
        'div',
        { class: 'card__head', style: { flexWrap: 'wrap', gap: 'var(--sp-2)' } },
        el('div', { class: 'card__title' }, b.title),
        el(
          'div',
          { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } },
          el('span', { class: 'badge badge--neutral' }, `${fa(b.items.length)} تمرین`),
          done > 0 ? el('span', { class: 'badge badge--success' }, `${fa(done)} انجام‌شده`) : null,
          b.sentAt ? el('span', { class: 'badge badge--primary', title: 'پیام بله ارسال شد' }, 'ارسال‌شده') : el('span', { class: 'badge badge--warning' }, 'ارسال نشده')
        )
      ),
      el(
        'div',
        { class: 'card__body' },
        el('div', { class: 'cell-sub', style: { marginBottom: 'var(--sp-2)' } },
          `${formatJalaliNumeric((b.createdAt || '').slice(0, 10))}${b.assignedByName ? ` — ثبت: ${b.assignedByName}` : ''}${b.assignedVia === 'bot' ? ' — از بات' : ''}`
        ),
        b.note ? el('p', { class: 'cell-sub', style: { marginBottom: 'var(--sp-2)' } }, `یادداشت: ${b.note}`) : null,
        ...itemRows,
        el(
          'div',
          { style: { display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)', flexWrap: 'wrap' } },
          isStaff()
            ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => remind(b) }, icon('bell', 14), 'یادآوری')
            : null,
          el('div', { class: 'cell-sub', style: { alignSelf: 'center' } }, b.sentCount > 1 ? `${fa(b.sentCount)} بار پیام رفته` : '')
        )
      )
    );
  });

  box.replaceChildren(head, el('div', { class: 'exb-list', style: { display: 'grid', gap: 'var(--sp-3)' } }, cards));
}
