import { api } from './api.js';
import { fa, tehranTodayYmd, formatJalaliDateTime, formatJalaliNumeric } from './format.js';
import { el, icon, openModal, formModal, confirmModal, toast, toastError, statusBadge, scienceNote } from './ui.js';
import { TOOL_GUIDES } from './clinical-content.js';
import { jalaliDateInput } from './jalali-picker.js';
import { session } from './state.js';
import { typeIconNode } from './case-event-icons.js';
import { wechslerEventAnalysisSection } from './wechsler-profile.js'; // — نیم‌رخ کامل وکسلر در مودال (m133)
const STATUS_LABELS = { draft: 'پیش‌نویس', completed: 'ثبت‌شده', pending_family: 'در انتظار خانواده', cancelled: 'لغوشده' };

function studentLabel(student) {
  return [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim() || 'دانش‌آموز';
}

function lastTypeKey() {
  return `cs.caseEventLastType:${session.user?.staffId ?? 'anon'}`;
}

function readLastTypeId() {
  try { return localStorage.getItem(lastTypeKey()); } catch { return null; }
}

function writeLastTypeId(typeId) {
  try { localStorage.setItem(lastTypeKey(), typeId); } catch { /* بی‌خیال */ }
}

export async function fetchCaseEventTypes(activeOnly = true) {
  const res = await api.get(`/api/case-events/types${activeOnly ? '?active=true' : ''}`);
  return res.data ?? [];
}

export function fillTargetOf(type) {
  if (type?.key === 'ce-comp-family-v2' && type?.familyFillable) {
    return { key: 'family', group: 'family', label: 'خانواده', badge: 'فرم جامع خانواده — با بله', badgeClass: 'badge--accent' };
  }
  if (type?.key === 'ce-comp-teacher-v2' && type?.familyFillable) {
    return { key: 'teacher', group: 'teacher', label: 'معلم', badge: 'فرم جامع معلم — با بله (انتخاب معلم)', badgeClass: 'badge--warning' };
  }
  if (type?.category === 'checklist' && type?.familyFillable) {
    if (type.audience === 'teacher') {
      return { key: 'teacher', group: 'teacher', label: 'معلم', badge: 'فرم معلم — با بله', badgeClass: 'badge--warning' };
    }
    if (type.audience === 'both') {
      return { key: 'family_teacher', group: 'family', label: 'خانواده و معلم', badge: 'فرم خانواده و معلم — با بله', badgeClass: 'badge--accent' };
    }
    return { key: 'family', group: 'family', label: 'خانواده', badge: 'فرم خانواده — با بله', badgeClass: 'badge--accent' };
  }
  return { key: 'therapist', group: 'therapist', label: 'درمانگر', badge: 'فرم درمانگر — همین‌جا در سایت', badgeClass: 'badge--info' };
}

export function canCreateCaseEvents() {
  return Boolean(session.user && ['manager', 'therapist'].includes(session.user.role));
}

export async function openCaseEventForm({ student, appointmentId = null, onSaved, defaultTypeId = null, occurredYmd = null, onlyKeys = null, pickerTitle = null }) {
  let types = [];
  try {
    types = await fetchCaseEventTypes(true);
  } catch (err) {
    toastError(err);
    return;
  }
  if (types.length === 0) {
    toast('هنوز نوعی رویداد ساخته نشده — مدیر از «فرم‌ها و پرسش‌نامه‌ها» نوع بسازد.');
    return;
  }
  if (onlyKeys && onlyKeys.length > 0) {
    const allowed = new Set(onlyKeys);
    const filtered = types.filter((t) => allowed.has(t.key));
    if (filtered.length === 0) {
      toast('فرم مورد نظر در کتابخانه فعال نیست');
      return;
    }
    openTypePicker({ student, appointmentId, onSaved, allTypes: filtered, occurredYmd, pickerTitle, lockTypePick: false });
    return;
  }

  try {
    const preferred = types.find((t) => t.id === defaultTypeId) ?? types.find((t) => t.id === readLastTypeId()) ?? null;
    if (preferred) {
      openDynamicForm({
        student,
        type: preferred,
        occurredYmd: occurredYmd || tehranTodayYmd(),
        appointmentId,
        onSaved,
        allTypes: types
      });
      return;
    }

    openTypePicker({ student, appointmentId, onSaved, allTypes: types, occurredYmd });
  } catch (err) {
    toastError(err);
  }
}

function openTypePicker({ student, appointmentId = null, onSaved, allTypes, occurredYmd = null, pickerTitle = null }) {
  const types = allTypes ?? [];

  const rank = { session: 0, checklist: 1, note: 2 };
  const ordered = [...types].sort((a, b) => (rank[a.category] ?? 3) - (rank[b.category] ?? 3));
  const byTarget = { therapist: [], family: [], teacher: [] };
  for (const t of ordered) byTarget[fillTargetOf(t).group].push(t);

  const searchInput = el('input', {
    class: 'input', type: 'search', placeholder: 'جستجوی فرم…',
    style: { marginBottom: 'var(--sp-3)', width: '100%' }, autocomplete: 'off'
  });

  const therapistList = byTarget.therapist;
  const dateCtl = therapistList.length > 0 ? jalaliDateInput({ value: occurredYmd || tehranTodayYmd() }) : null;
  const hiddenYmd = dateCtl?.hiddenInput ?? null;
  const dateWrap = dateCtl
    ? el('div', { class: 'field', style: { maxWidth: '260px', marginBottom: 'var(--sp-3)' } },
        el('label', { class: 'field__label' }, 'تاریخ وقوع (فرم‌های درمانگر)'),
        dateCtl.root
      )
    : null;

  const sendByBale = (t) => {
    close();
    openChecklistSendModal({ student, typeId: t.id, onSent: (created) => onSaved?.(created) });
  };

  const groups = [
    {
      key: 'therapist',
      title: 'پر کردن توسط درمانگر — همین‌جا در سایت باز می‌شود',
      tone: 'info',
      list: therapistList,
      before: dateWrap,
      pick: (t) => openDynamicForm({
        student, type: t,
        occurredYmd: hiddenYmd?.value || occurredYmd || tehranTodayYmd(),
        appointmentId, onSaved, allTypes: types
      })
    },
    {
      key: 'family',
      title: 'پر کردن توسط خانواده — پیام بله برای ولیّ ارسال می‌شود',
      tone: 'accent',
      list: byTarget.family,
      before: null,
      pick: sendByBale
    },
    {
      key: 'teacher',
      title: 'پر کردن توسط معلم — پیام بله به چت کلاس ارسال می‌شود',
      tone: 'warning',
      list: byTarget.teacher,
      before: null,
      pick: sendByBale
    }
  ];

  const PURPOSE = {
    session: 'فرم ثبت جلسه/سنجش — پر کردن توسط شما',
    checklist: 'پرسش‌نامهٔ رفتاری — پاسخ‌دهی با علامت زدن',
    note: 'یادداشت آزاد پرونده'
  };

  const gridWrap = el('div', { class: 'typegrid' });
  const modalRef = openModal({
    title: pickerTitle || `انتخاب فرم — ${studentLabel(student)}`,
    wide: true,
    body: el('div', {}, searchInput, gridWrap),
    actions: [(c) => el('button', { class: 'btn btn--ghost', onclick: c }, 'انصراف')]
  });
  const close = modalRef.close;

  const renderGrid = (query) => {
    const q = (query ?? '').trim().toLowerCase();
    gridWrap.replaceChildren();
    let shown = 0;
    for (const g of groups) {
      const list = !q
        ? g.list
        : g.list.filter((t) =>
            t.title.toLowerCase().includes(q) ||
            (t.description ?? '').toLowerCase().includes(q) ||
            (t.key ?? '').toLowerCase().includes(q));
      if (list.length === 0) continue;
      shown += list.length;
      gridWrap.appendChild(
        el('div', { class: 'typegrid__group' },
          el('div', { class: 'typegrid__group-title' },
            el('span', { class: `badge badge--${g.tone}` }, fillTargetOf(g.list[0]).label),
            g.title
          ),
          ...(g.before ? [g.before] : []),
          el('div', { class: 'typegrid__grid' },
            ...list.map((t) =>
              el('div', { class: 'typegrid__cell' },
                el('button', {
                  class: 'typegrid__item',
                  onclick: () => g.pick(t)
                },
                el('span', { class: 'typegrid__icon' }, typeIconNode(t.category, t.icon, 19)),
                el('span', { class: 'typegrid__text' },
                  el('b', {}, t.title),
                  el('span', { class: 'cell-sub' }, t.description || PURPOSE[t.category] || '')),
                el('span', { class: `badge ${fillTargetOf(t).badgeClass} typegrid__badge` }, fillTargetOf(t).label)
                ),
                // — m176: «پشتوانهٔ علمی و نحوهٔ استفاده» زیر هر کارت چک‌لیست
                scienceNote(TOOL_GUIDES[t.key])
              )
            )
          )
        )
      );
    }
    if (shown === 0) {
      gridWrap.appendChild(el('div', { class: 'cell-sub', style: { padding: 'var(--sp-4) 0', textAlign: 'center' } }, 'فرمی با این نام پیدا نشد'));
    }
  };
  renderGrid('');
  searchInput.addEventListener('input', () => renderGrid(searchInput.value));
}

function openDynamicForm({ student, type, occurredYmd, appointmentId, onSaved, allTypes = null }) {
  const fields = (type.fields ?? []).map((f) => fieldToForm(f));
  const target = fillTargetOf(type);
  const submitLabel = 'ثبت روی تایم‌لاین';
  const titleNode = el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px' } },
    typeIconNode(type.category, type.icon, 18),
    `${type.title} — ${studentLabel(student)}`);
  formModal({
    title: titleNode,
    wide: true,
    submitLabel,
    fields,
    secondary: {
      label: 'ذخیرهٔ پیش‌نویس',
      onClick: (values) => submitEvent({ student, type, occurredYmd, appointmentId, values, draft: true, onSaved })
    },
    onSubmit: async (values) => {
      await submitEvent({ student, type, occurredYmd, appointmentId, values, draft: false, onSaved });
      return true;
    }
  });

  try {
    const grids = document.querySelectorAll('.modal .form-grid');
    const form = grids[grids.length - 1];
    if (form) {
      const intro = (type.description ?? '').trim();
      if (intro) {
        form.prepend(el('div', { class: 'form-intro', style: { gridColumn: '1 / -1' } }, intro));
      }
      // — m170: بلوک تاشوی «پشتوانهٔ علمی و نحوهٔ استفاده» — بالای فیلدها، بین معرفی و فرم
      const guideNode = scienceNote(TOOL_GUIDES[type.key]);
      if (guideNode) {
        guideNode.style.gridColumn = '1 / -1';
        const introEl = form.querySelector('.form-intro');
        if (introEl) introEl.after(guideNode);
        else form.prepend(guideNode);
      }
      const changeBtn = allTypes && allTypes.length > 1
        ? el('button', {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            onclick: () => {
              const overlay = form.closest('.modal-overlay');
              if (overlay) {
                const xBtn = overlay.querySelector('.modal__head .btn--icon');
                if (xBtn) xBtn.click();
              }
              openTypePicker({ student, appointmentId, onSaved, allTypes, occurredYmd });
            }
          }, 'تغییر نوع فرم')
        : null;
      const bar = el('div', {
        class: 'muted form-grid__bar', // — grid-column: 1/-1 (اسپن ثابت در گرید تک‌ستونیِ موبایل بهم می‌ریخت)
        style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: 'var(--fs-xs)', margin: '0 0 var(--sp-2)' }
      },
        icon('calendar', 13),
        el('span', {}, `تاریخ وقوع: ${fa(formatJalaliNumeric(occurredYmd || tehranTodayYmd()))}`),
        el('span', { class: `badge ${target.badgeClass}` }, `پرکننده: ${target.label}`),
        el('span', { style: { flex: 1 } }),
        changeBtn
      );
      form.prepend(bar);
      const countable = (type.fields ?? []).filter((f) => f.type !== 'heading');
      if (countable.length >= 8) {
        const progressText = el('span', { style: { fontWeight: '600' } });
        const progressBar = el('div', { class: 'form-progress__bar' }, el('div', { class: 'form-progress__fill' }));
        const progress = el('div', { class: 'form-progress', style: { gridColumn: '1 / -1' } }, progressText, progressBar);
        const update = () => {
          let answered = 0;
          for (const f of countable) {
            const input = form.elements[f.key];
            if (input && input.value && String(input.value).trim() !== '') answered += 1;
          }
          progressText.textContent = `پاسخ داده‌شده: ${fa(answered)} از ${fa(countable.length)}`;
          progressBar.firstChild.style.width = `${Math.round((answered * 100) / countable.length)}%`;
        };
        form.addEventListener('change', update);
        form.addEventListener('input', update);
        form.prepend(progress);
        update();
      }
    }
  } catch { /* تزریق نوار حیاتی نیست */ }
}

async function submitEvent({ student, type, occurredYmd, appointmentId, values, draft, onSaved }) {
  const body = { eventTypeId: type.id, values: {}, draft };
  if (occurredYmd) body.occurredAt = `${occurredYmd}T12:00:00.000Z`;
  if (appointmentId) body.appointmentId = appointmentId;
  for (const f of type.fields) {
    const raw = values[f.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      body.values[f.key] = null;
    } else if (f.type === 'number' || f.type === 'scale') {
      body.values[f.key] = Number(raw);
    } else {
      body.values[f.key] = String(raw).trim();
    }
  }
  const res = await api.post(`/api/students/${student.id}/case-events`, body);
  if (!draft) writeLastTypeId(type.id); // — دفعهٔ بعد مستقیم همین فرم باز شود
  toast(draft ? 'پیش‌نویس ذخیره شد — بعداً از جزئیات نهایی کنید' : 'گزارش روی تایم‌لاین ثبت شد');
  onSaved?.(res.data);
}

function fieldToForm(f) {
  if (f.type === 'heading') {
    return { name: f.key, label: f.label, type: 'heading', span: 2 };
  }
  const base = { name: f.key, label: f.label + (f.required ? '' : ' (اختیاری)'), required: Boolean(f.required), span: 2 };
  switch (f.type) {
    case 'longtext':
      return { ...base, type: 'textarea', rows: 4 };
    case 'text':
      return { ...base, type: 'text' };
    case 'number':
      return { ...base, type: 'number' };
    case 'scale':
      if (f.scaleLabels && f.scaleLabels.length > 0) {
        return { ...base, type: 'chips', labels: f.scaleLabels, hint: 'یکی از گزینه‌ها را انتخاب کنید' };
      }
      return { ...base, type: 'number', min: 0, max: f.scaleMax ?? 3, hint: `نمرهٔ ۰ تا ${fa(f.scaleMax ?? 3)}` };
    case 'select':
      return {
        ...base,
        type: 'select',
        options: (f.options ?? []).map((o) => ({ value: o, label: o }))
      };
    default:
      return { ...base, type: 'text' };
  }
}

function renderFilesSection(event, canEdit, onChanged) {
  const wrap = el('div', {});
  const listWrap = el('div', {});
  wrap.appendChild(el('div', { style: { margin: '14px 0 6px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' } }, icon('clip', 15), 'پیوست‌ها'));

  async function reload() {
    let files = [];
    try {
      files = (await api.get(`/api/case-events/${event.id}/files`)).data ?? [];
    } catch {
      files = [];
    }
    listWrap.replaceChildren(
      ...(files.length === 0
        ? [el('p', { class: 'cell-sub' }, 'پیوستی ثبت نشده است.')]
        : files.map((f) =>
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--line, #eee)' } },
              el('span', { style: { flex: '1', display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: '0' } }, icon('file', 14), el('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, f.filename)),
              el('span', { class: 'cell-sub' }, `${fa(Math.max(1, Math.round(f.sizeBytes / 1024)))} KB`),
              el('a', { class: 'btn btn--ghost btn--sm', href: `/api/case-events/${event.id}/files/${f.id}`, target: '_blank', rel: 'noopener' }, 'دانلود'),
              canEdit
                ? el('button', {
                    class: 'btn btn--danger btn--sm',
                    onclick: async () => {
                      const ok = await confirmModal({ title: 'حذف پیوست', message: `«${f.filename}» حذف شود؟`, confirmLabel: 'حذف', danger: true });
                      if (!ok) return;
                      try {
                        await api.del(`/api/case-events/${event.id}/files/${f.id}`);
                        toast('پیوست حذف شد');
                        reload();
                        onChanged?.();
                      } catch (err) {
                        toastError(err);
                      }
                    }
                  }, 'حذف')
                : null
            )
          ))
    );
  }

  if (canEdit && event.status !== 'cancelled') {
    const fileInput = el('input', { type: 'file', style: { display: 'none' }, accept: '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv' });
    const upBtn = el('button', { class: 'btn btn--ghost btn--sm', style: { marginBottom: '8px' } }, icon('plus', 14), 'افزودن پیوست');
    upBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > 512 * 1024) {
        toast('حجم فایل بیش از ۵۱۲ کیلوبایت است', 'warning');
        fileInput.value = '';
        return;
      }
      upBtn.disabled = true;
      try {
        const b64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        await api.post(`/api/case-events/${event.id}/files`, {
          filename: file.name,
          mime_type: file.type || 'application/octet-stream',
          content_b64: b64
        });
        toast('پیوست افزوده شد');
        reload();
        onChanged?.();
      } catch (err) {
        toastError(err);
      } finally {
        upBtn.disabled = false;
        fileInput.value = '';
      }
    });
    wrap.appendChild(upBtn);
    wrap.appendChild(fileInput);
  }

  wrap.appendChild(listWrap);
  reload();
  return wrap;
}

export function openCaseEventDetail(event, { onChanged } = {}) {
  const canEdit = Boolean(session.user && ['manager', 'therapist'].includes(session.user.role));
  const body = el('div', {});

  const head = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' } },
    statusBadge(event.status === 'completed' ? 'done' : event.status === 'pending_family' ? 'pending' : event.status === 'draft' ? 'draft' : 'cancelled'),
    el('span', { class: 'cell-sub' }, STATUS_LABELS[event.status] ?? event.status),
    el('span', { class: 'cell-sub' }, formatJalaliDateTime(event.occurredAt)),
    // m172 — پاسخ‌دهندهٔ واقعی (خانواده/معلم) جدا از ثبت‌کنندهٔ درمانگر؛ دیگر «ثبت: درمانگر» برای پاسخ خانواده گمراه‌کننده نیست
    event.filledByChatId
      ? el('span', { class: 'badge badge--accent' },
          event.payload?.['teacher_name']?.value ? `پاسخ معلم: ${event.payload['teacher_name'].value}` : 'پاسخ خانواده')
      : null,
    event.staffName ? el('span', { class: 'cell-sub' }, `ثبت: ${event.staffName}`) : null
  );
  body.appendChild(head);

  if (event.analysis) {
    const maxTotal = event.analysis.maxScore ?? event.analysis.total * 3;
    const bandTone = (event.analysis.band ?? '').includes('جدی') ? 'error' : (event.analysis.band ?? '').includes('توجه') ? 'warning' : 'success';
    body.appendChild(el('div', {
      class: `badge badge--${bandTone}`,
      style: { fontSize: '13px', padding: '8px 12px', marginBottom: '12px' }
    }, `امتیاز تحلیل: ${fa(event.analysis.score)} از ${fa(maxTotal)}${event.analysis.band ? ` — ${event.analysis.band}` : ''}`));

    const a = event.analysis;
    if (a.interpretation) {
      body.appendChild(el('div', {
        style: { background: 'var(--surface-2, #f7f3ea)', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px', whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.9' }
      },
      el('b', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } }, icon('compass', 14), 'تفسیر خودکار سامانه'),
      a.interpretation));
    }
    if (a.subscaleScores && a.subscaleScores.length > 0) {
      const subWrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' } },
        el('b', { style: { fontSize: '13px' } }, 'نیمرخ زیرمقیاس‌ها'));
      for (const s of a.subscaleScores) {
        const pct = s.max > 0 ? Math.round((s.score / s.max) * 100) : 0;
        const barColor = s.color === 'danger' ? 'var(--danger, #d9534f)' : s.color === 'warn' ? 'var(--warning, #e0a800)' : 'var(--success, #2e9e5b)';
        subWrap.appendChild(el('div', {},
          el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' } },
            el('span', {}, s.name),
            el('span', { class: 'cell-sub' }, `${fa(s.score)} از ${fa(s.max)}${s.band ? ` — ${s.band}` : ''}`)),
          el('div', { style: { height: '7px', borderRadius: '4px', background: 'var(--surface-2, #eee)', overflow: 'hidden' } },
            el('div', { style: { height: '100%', width: `${pct}%`, borderRadius: '4px', background: barColor } }))
        ));
      }
      body.appendChild(subWrap);
    }
    if (a.flags && a.flags.length > 0) {
      body.appendChild(el('div', { class: 'badge badge--error', style: { fontSize: '12px', padding: '7px 10px', marginBottom: '12px', whiteSpace: 'normal', textAlign: 'right', lineHeight: '1.8' } },
        `آیتم بحرانی (${fa(a.flags.length)}): ${a.flags.map((fl) => fl.label).join('، ')}`));
    }
  }

  if (event.status === 'pending_family') {
    body.appendChild(el('div', { class: 'badge badge--warning', style: { marginBottom: '12px' } }, 'در انتظار پاسخ خانواده — با دکمهٔ «چک‌لیست‌های من» بات پر می‌شود'));
  }
  if (event.status === 'draft') {
    body.appendChild(el('div', { class: 'badge badge--warning', style: { marginBottom: '12px' } }, 'پیش‌نویس — پس از تکمیل فیلدهای الزامی نهایی کنید'));
  }

  const payload = event.payload ?? {};
  const hasEngineOutput = 'engine_output' in payload && String(payload['engine_output']?.value ?? '').length > 0;
  let wEng = null;
  if (hasEngineOutput) {
    try {
      const c = JSON.parse(String(payload['engine_output'].value));
      if (c && c.ok) wEng = c;
    } catch {}
  }
  const keys = Object.keys(payload).filter((k) => k !== 'engine_output' && payload[k] && String(payload[k].value ?? '').length > 0);
  if (wEng) {
    const wSection = wechslerEventAnalysisSection(wEng);
    if (wSection) body.appendChild(wSection);
    body.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' } },
      el('span', { class: 'badge badge--accent' }, 'تحلیل خودکار وکسلر ۴ ثبت شد')
    ));
  } else if (hasEngineOutput) {
    body.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' } },
      el('span', { class: 'badge badge--accent' }, 'تحلیل خودکار وکسلر ۴ ثبت شد'),
      el('span', { class: 'cell-sub' }, 'شاخص‌ها و نیم‌رخ در تب تفسیر بالینی نمایش داده می‌شود')
    ));
  }
  if (keys.length === 0) {
    body.appendChild(el('p', { class: 'cell-sub' }, hasEngineOutput ? 'نمرهٔ خام ثبت و تحلیل خودکار انجام شد.' : 'هنوز پاسخی ثبت نشده است.'));
  } else {
    const list = el('div', { class: 'info-list' });
    for (const k of keys) {
      list.appendChild(el('div', { style: { padding: '8px 0', borderBottom: '1px solid var(--line, #eee)' } },
        el('div', { style: { fontSize: '12px', color: 'var(--muted, #777)', marginBottom: '2px' } }, payload[k].label),
        el('div', { style: { whiteSpace: 'pre-wrap' } }, payload[k].value)
      ));
    }
    body.appendChild(list);
  }

  body.appendChild(renderFilesSection(event, canEdit, onChanged));

  const detailTitle = el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px' } },
    typeIconNode(event.typeCategory, event.typeIcon, 18),
    `رویداد: ${event.typeTitle}`);
  openModal({
    title: detailTitle,
    wide: true,
    body,
    actions: [
      canEdit && event.status === 'draft'
        ? (close) =>
            el('button', {
              class: 'btn btn--primary',
              onclick: async () => {
                try {
                  await api.post(`/api/case-events/${event.id}/finalize`, {});
                  toast('گزارش نهایی شد و روی تایم‌لاین ثبت‌شده شد');
                  onChanged?.();
                  close();
                } catch (err) {
                  toastError(err);
                }
              }
            }, icon('check', 15), 'نهایی‌سازی گزارش')
        : null,
      canEdit && event.status !== 'cancelled'
        ? (close) =>
            el('button', {
              class: 'btn btn--danger',
              onclick: async () => {
                const ok = await confirmModal({
                  title: 'لغو رویداد',
                  message: 'رویداد لغو شود؟ رویدادهای لغوشده با حالت کم‌رنگ در تایم‌لاین می‌مانند.',
                  confirmLabel: 'لغو رویداد',
                  danger: true
                });
                if (!ok) return;
                try {
                  await api.post(`/api/case-events/${event.id}/cancel`, {});
                  toast('رویداد لغو شد');
                  onChanged?.();
                  close();
                } catch (err) {
                  toastError(err);
                }
              }
            }, 'لغو رویداد')
        : null,
      session.user?.role === 'manager'
        ? (close) =>
            el('button', {
              class: 'btn btn--danger',
              onclick: async () => {
                const ok = await confirmModal({
                  title: 'حذف رویداد (مدیر)',
                  message: 'رویداد برای همیشه از پرونده حذف شود؟ از همهٔ فهرست‌ها و تایم‌لاین پنهان می‌شود و این عمل در گزارش رخدادها ثبت می‌گردد.',
                  confirmLabel: 'حذف رویداد',
                  danger: true
                });
                if (!ok) return;
                try {
                  await api.del(`/api/case-events/${event.id}`);
                  toast('رویداد حذف شد');
                  onChanged?.();
                  close();
                } catch (err) {
                  toastError(err);
                }
              }
            }, 'حذف (مدیر)')
        : null,
      (close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'بستن')
    ].filter(Boolean)
  });
}

export async function openChecklistSendModal({ student, typeId = null, onSent }) {
  if (!canCreateCaseEvents()) {
    toast('ثبت چک‌لیست برای نقش شما فعال نیست');
    return;
  }
  let suggestions = [];
  try {
    suggestions = (await api.get(`/api/students/${student.id}/case-events/suggest`)).data ?? [];
  } catch (err) {
    toastError(err);
    return;
  }
  const checklists = suggestions.filter(
    (s) => s.type.familyFillable && (s.type.category === 'checklist' || s.type.key === 'ce-comp-family-v2' || s.type.key === 'ce-comp-teacher-v2')
  );
  if (checklists.length === 0) {
    toast('هنوز چک‌لیست قابل ارسالی در کتابخانه نیست — از «رویدادساز» اضافه کنید');
    return;
  }

  let teachers = [];
  try {
    teachers = (await api.get(`/api/students/${student.id}/teachers`)).data ?? [];
  } catch { teachers = []; }

  const preselected = checklists.find((s) => s.type.id === typeId) ?? null;
  const matchedCount = checklists.filter((s) => s.score > 0).length;
  const typeOptions = checklists.map((s) => ({
    value: s.type.id,
    label:
      s.type.title +
      (s.score > 0 ? ` — مناسب: ${s.matched.map((m) => m.name).join('، ')}` : '')
  }));

  const isTeacherFlow = (typeIdVal, audienceVal) => {
    const chosen = checklists.find((s) => s.type.id === typeIdVal);
    if (!chosen) return false;
    return chosen.type.key === 'ce-comp-teacher-v2' || chosen.type.audience === 'teacher' || audienceVal === 'teacher';
  };

  const teacherOptions = [
    ...teachers.map((t) => ({ value: t.id, label: `${t.name}${t.classLabel ? ` — ${t.classLabel}` : ''}` })),
    { value: '__new__', label: '＋ معلم تازه…' }
  ];

  formModal({
    title: `ارسال چک‌لیست — ${studentLabel(student)}`,
    wide: true,
    submitLabel: 'ارسال با بله',
    fields: [
      {
        name: 'type_id',
        label: matchedCount > 0 ? 'قالب چک‌لیست (گزینه‌های «مناسب» مطابق برچسب‌های او پیشنهاد شده‌اند)' : 'قالب چک‌لیست',
        type: 'select',
        required: true,
        options: typeOptions,
        value: preselected?.type.id ?? checklists[0]?.type.id,
        span: 2,
        onChange: (val, inputs) => {
          const show = isTeacherFlow(val, inputs.audience?.value) ? '' : 'none';
          for (const k of ['teacher_pick', 'teacher_new_name', 'teacher_new_class', 'teacher_new_contact']) {
            const field = inputs[k]?.closest('.field');
            if (field) field.style.display = show;
          }
          if (show === 'none' && inputs.teacher_pick) inputs.teacher_pick.value = '';
        }
      },
      {
        name: 'audience',
        label: 'گیرنده',
        type: 'select',
        required: true,
        options: [
          { value: 'family', label: 'خانواده (ولیّ‌های متصل بله)' },
          { value: 'teacher', label: 'معلم کلاس (چت متصل کلاس)' },
          { value: 'both', label: 'خانواده و معلم' }
        ],
        value: preselected?.type.audience ?? checklists[0]?.type.audience ?? 'family',
        hint: 'پیام بله شامل لینک امن فرم است — پاسخ‌دهنده بدون ورود به پنل، فرم را وب پر می‌کند.',
        span: 2,
        onChange: (val, inputs) => {
          const show = isTeacherFlow(inputs.type_id?.value, val) ? '' : 'none';
          for (const k of ['teacher_pick', 'teacher_new_name', 'teacher_new_class', 'teacher_new_contact']) {
            const field = inputs[k]?.closest('.field');
            if (field) field.style.display = show;
          }
          if (show === 'none' && inputs.teacher_pick) inputs.teacher_pick.value = '';
        }
      },
      {
        name: 'teacher_pick',
        label: 'انتخاب معلم — هر معلم لینک مستقل خودش را می‌گیرد',
        type: 'select',
        options: teacherOptions,
        placeholder: '— معلم را انتخاب کنید —',
        value: teachers.length === 1 ? teachers[0].id : '',
        hint: 'پاسخ فرم با نام همین معلم روی پرونده ثبت می‌شود («پاسخ معلم: نام معلم»).',
        span: 2,
        onChange: (val, inputs) => {
          const isNew = val === '__new__';
          for (const k of ['teacher_new_name', 'teacher_new_class', 'teacher_new_contact']) {
            const field = inputs[k]?.closest('.field');
            if (field) field.style.display = isNew ? '' : 'none';
          }
          if (isNew && inputs.teacher_new_name) inputs.teacher_new_name.focus();
        }
      },
      { name: 'teacher_new_name', label: 'نام و نام خانوادگی معلم تازه', type: 'text', span: 2, maxlength: 120 },
      { name: 'teacher_new_class', label: 'کلاس/درس (اختیاری — مثل «چهارم ب — ریاضی»)', type: 'text', span: 2, maxlength: 120 },
      { name: 'teacher_new_contact', label: 'راه ارتباطی معلم (اختیاری — تلفن/بله)', type: 'text', span: 2, maxlength: 60, ltr: true },
      {
        name: 'note',
        label: 'یادداشت برای گیرنده (اختیاری)',
        type: 'textarea',
        rows: 2,
        span: 2
      }
    ],
    onSubmit: async (v) => {
      const chosen = checklists.find((s) => s.type.id === v.type_id);
      if (!chosen) throw new Error('قالب نامعتبر است');
      const teacherFlow = isTeacherFlow(v.type_id, v.audience);
      let teacherName = null;
      let teacherId = null;
      if (teacherFlow) {
        if (v.teacher_pick === '__new__') {
          if (!v.teacher_new_name || v.teacher_new_name.trim().length < 2) {
            throw new Error('نام و نام خانوادگی معلم تازه را بنویسید');
          }
          const added = await api.post(`/api/students/${student.id}/teachers`, {
            name: v.teacher_new_name,
            class_label: v.teacher_new_class || undefined,
            contact: v.teacher_new_contact || undefined
          });
          teacherName = added.data.name;
          teacherId = added.data.id;
        } else if (v.teacher_pick) {
          const t = teachers.find((x) => x.id === v.teacher_pick);
          if (!t) throw new Error('معلم انتخابی پیدا نشد');
          teacherName = t.name;
          teacherId = t.id;
        } else {
          throw new Error('معلم فرم را انتخاب کنید — هر معلم لینک مستقل خودش را می‌گیرد');
        }
      }

      const created = await api.post(`/api/students/${student.id}/case-events`, {
        eventTypeId: chosen.type.id,
        values: {},
        draft: false
      });
      let send = null;
      let link = null;
      try {
        send = await api.post(`/api/case-events/${created.data.id}/send`, {
          audience: v.audience,
          note: v.note || null,
          teacher_name: teacherName,
          teacher_id: teacherId
        });
        link = send.data?.link ?? null;
        if (send.data.sent > 0) {
          toast(`پیام بله برای ${fa(send.data.sent)} نفر ارسال شد — نتیجه خودکار به پرونده برمی‌گردد`);
        } else {
          toast('همین حالا ارسال شده — برای یادآوری مجدد یک دقیقه بعد تلاش کنید', 'warning');
        }
      } catch (err) {
        if (!teacherName) throw err;
        const issued = await api.post(`/api/case-events/${created.data.id}/teacher-link`, {
          teacher_name: teacherName,
          teacher_id: teacherId
        });
        link = issued.data?.link ?? null;
        toast('چت کلاس در بله متصل نیست — لینک فرم آماده است؛ آن را کپی کنید و برای معلم بفرستید', 'warning');
      }
      onSent?.(created.data, send?.data ?? { sent: 0, targets: [], link });
      if (teacherName && link) openTeacherLinkResult({ link, teacherName, student });
      return true;
    }
  });

  // — m170: «پشتوانهٔ علمی و نحوهٔ استفاده» چک‌لیست انتخابی — با تغییر قالب به‌روز می‌شود
  try {
    const grids = document.querySelectorAll('.modal .form-grid');
    const form = grids[grids.length - 1];
    if (form) {
      const wrap = el('div', { style: { gridColumn: '1 / -1' } });
      const idToKey = new Map(checklists.map((s) => [s.type.id, s.type.key]));
      const renderGuide = () => {
        const sel = form.elements['type_id'];
        const guide = scienceNote(idToKey.has(sel?.value) ? TOOL_GUIDES[idToKey.get(sel.value)] : null);
        wrap.replaceChildren(...(guide ? [guide] : []));
      };
      renderGuide();
      const anchor = form.elements['type_id']?.closest('.field');
      if (anchor) anchor.after(wrap);
      else form.prepend(wrap);
      form.addEventListener('change', renderGuide);
    }
  } catch { /* تزریق راهنما حیاتی نیست */ }
}

function openTeacherLinkResult({ link, teacherName, student }) {
  const copyBtn = el('button', { class: 'btn btn--soft btn--sm' }, icon('copy', 15), 'کپی لینک');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('لینک فرم کپی شد — برای معلم بفرستید', 'success');
    } catch {
      toast('کپی خودکار ممکن نشد — لینک را دستی انتخاب کنید', 'warning');
    }
  });
  openModal({
    title: `لینک فرم معلم — ${teacherName}`,
    body: el('div', {},
      el('div', { class: 'cell-sub', style: { marginBottom: 'var(--sp-2)' } },
        `فرم «${studentLabel(student)}» برای این معلم ساخته شد؛ پاسخش با نام او روی پرونده ثبت می‌شود.`),
      el('div', { class: 'field', style: { marginBottom: 'var(--sp-2)' } },
        el('input', { class: 'input', type: 'text', readonly: true, dir: 'ltr', value: link, onclick: (e) => e.target.select() })),
      el('div', { class: 'cell-sub' }, 'چند معلم = چند لینک مستقل — برای هر معلم، ارسال را تکرار کنید.')
    ),
    actions: [
      () => copyBtn,
      (close) => el('button', { class: 'btn btn--primary', onclick: close }, 'بستن')
    ]
  });
}
