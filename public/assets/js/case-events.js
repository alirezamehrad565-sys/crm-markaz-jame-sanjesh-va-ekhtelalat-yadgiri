/**
 * رویدادساز — فرانت
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// case-events.js — رویدادهای پرونده (تایم‌لاین + گزارش‌نویسی جلسات) — پیش‌نویس + پیوست
// ماژول مشترک: فرم پویا از تعریف فیلد نوع (فرم‌ساز پنل) + مودال جزئیات رویداد + لغو
// گزارش جلسه می‌تواند «پیش‌نویس» ذخیره شود و بعداً نهایی شود؛ پیوست سند/تصویر دارد
// RBAC ثبت: مدیر/درمانگر (سرور گارد دارد) — منشی فقط خواننده
// جریان واحد گزارش جلسه: اگر «نوع پیش‌فرض» قابل تشخیص باشد (آخرین نوع استفاده‌شدهٔ
// همین همکار یا صریح از تماس‌گیرنده)، مستقیم فرم پویا باز می‌شود — بدون گام انتخاب نوع؛
// تاریخ وقوع هم پیش‌فرض همان جلسه است نه امروز. انتخابگر نوع همچنان با «تغییر نوع فرم» در دسترس است.

import { api } from './api.js';
import { fa, tehranTodayYmd, formatJalaliDateTime, formatJalaliNumeric } from './format.js';
import { el, icon, openModal, formModal, confirmModal, toast, toastError, statusBadge } from './ui.js';
import { jalaliDateInput } from './jalali-picker.js';
import { session } from './state.js';
import { typeIconNode } from './case-event-icons.js';
import { wechslerEventAnalysisSection } from './wechsler-profile.js'; // — نیم‌رخ کامل وکسلر در مودال (m133)
const STATUS_LABELS = { draft: 'پیش‌نویس', completed: 'ثبت‌شده', pending_family: 'در انتظار خانواده', cancelled: 'لغوشده' };

/** برچسب امن نام دانش‌آموز — دیگر هرگز «undefined» در عنوان مودال‌ها */
function studentLabel(student) {
  return [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim() || 'دانش‌آموز';
}

/** کلید حافظهٔ «آخرین نوع فرم استفاده‌شده» — به ازای هر همکار */
function lastTypeKey() {
  return `cs.caseEventLastType:${session.user?.staffId ?? 'anon'}`;
}

function readLastTypeId() {
  try { return localStorage.getItem(lastTypeKey()); } catch { return null; }
}

function writeLastTypeId(typeId) {
  try { localStorage.setItem(lastTypeKey(), typeId); } catch { /* بی‌خیال */ }
}

/** انواع فعال — با کش کوتاه در هر رندر فراخوانی می‌شود */
export async function fetchCaseEventTypes(activeOnly = true) {
  const res = await api.get(`/api/case-events/types${activeOnly ? '?active=true' : ''}`);
  return res.data ?? [];
}

/**
 * — سه‌هدف روشن «چه کسی فرم را پر می‌کند» (دستور کاربر:
 * «فرم‌ها و رویدادها مشخص نیست توسط کی باید پر بشه — سه هدف درمانگر، خانواده، معلم»)
 * - درمانگر: گزارش جلسه/یادداشت/ابزارهای بالینی — همین‌جا در سایت پر می‌شود
 * - خانواده/معلم: چک‌لیست‌های قابل ارسال — پیام بله با لینک امن وب‌فرم
 * با دو فلگ موجود محاسبه می‌شود (بدون مایگریشن): category + familyFillable + audience
 */
export function fillTargetOf(type) {
  // — T5 (m150): پکیج فرم جامع خانواده — دستهٔ session اما مسیر ارسال بله برای خانواده
  if (type?.key === 'ce-comp-family-v2' && type?.familyFillable) {
    return { key: 'family', group: 'family', label: 'خانواده', badge: 'فرم جامع خانواده — با بله', badgeClass: 'badge--accent' };
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

/** آیا کاربر جاری اجازهٔ ثبت رویداد دارد؟ (تصمیم ۸ — نویسنده + مدیر) */
export function canCreateCaseEvents() {
  return Boolean(session.user && ['manager', 'therapist'].includes(session.user.role));
}

/**
 * مودال ثبت رویداد/گزارش — جریان واحد:
 * ۱) اگر defaultTypeId (یا آخرین نوع استفاده‌شدهٔ همین همکار) بین انواع فعال باشد
 * → مستقیم فرم پویا باز می‌شود (بدون گام انتخاب نوع) و تاریخ وقوع = occurredYmd.
 * ۲) وگرنه انتخابگر نوع باز می‌شود (تاریخ هم پیش‌فرض occurredYmd/امروز).
 * «تغییر نوع فرم» داخل فرم پویا، انتخابگر را دوباره باز می‌کند.
 * onSaved(event) بعد از ثبت موفق صدا می‌شود.
 */
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
  // فیلتر هدفمند (گام‌نمای مسیر ارزیابی): فقط کلیدهای خواسته‌شده + بدون «آخرین نوع»
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

  // تشخیص نوع پیش‌فرض: صریح از تماس‌گیرنده → آخرین استفادهٔ همکار → هیچ
  // کل مسیر رندر در گارد است؛ خطای UI دیگر بی‌صدا نیست و به‌صورت toast دیده می‌شود
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

/**
 * انتخابگر نوع (گام ۱ قدیمی) — کارت‌های بصری با آیکون وکتور
 * — گروه‌بندی سه‌هدف: «پر کردن توسط درمانگر (همین‌جا)» / «خانواده (با بله)» / «معلم (با بله)»؛
 * کارت‌های خانواده/معلم مستقیم مودال «ارسال با بله» را باز می‌کنند — دیگر فرم درمانگر با
 * فرم خانواده قاطی نیست و معلوم است هر فرم توسط کی پر می‌شود.
 * — جستجوی فرم + معرفی روایی (description) + زیرنویس هدفمند به‌جای «N فیلد»
 */
function openTypePicker({ student, appointmentId = null, onSaved, allTypes, occurredYmd = null, pickerTitle = null }) {
  const types = allTypes ?? [];

  // تقسیم سه‌هدف بر اساس fillTargetOf — ترتیب داخل هر گروه: رایج‌ترین‌ها اول
  const rank = { session: 0, checklist: 1, note: 2 };
  const ordered = [...types].sort((a, b) => (rank[a.category] ?? 3) - (rank[b.category] ?? 3));
  const byTarget = { therapist: [], family: [], teacher: [] };
  for (const t of ordered) byTarget[fillTargetOf(t).group].push(t);

  // جستجوی فرم (نام سادهٔ روایی جستجو می‌شود)
  const searchInput = el('input', {
    class: 'input', type: 'search', placeholder: 'جستجوی فرم…',
    style: { marginBottom: 'var(--sp-3)', width: '100%' }, autocomplete: 'off'
  });

  // تاریخ وقوع فقط برای فرم‌های درمانگر معنا دارد (فرم خانواده/معلم با ارسال بله ساخته می‌شود)
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

  // زیرنویس هدفمند هر دسته (به‌جای «N فیلد» بی‌معنی)
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
              el('button', {
                class: 'typegrid__item',
                onclick: () => g.pick(t)
              },
              el('span', { class: 'typegrid__icon' }, typeIconNode(t.category, t.icon, 19)),
              el('span', { class: 'typegrid__text' },
                el('b', {}, t.title),
                el('span', { class: 'cell-sub' }, t.description || PURPOSE[t.category] || '')),
              el('span', { class: `badge ${fillTargetOf(t).badgeClass} typegrid__badge` }, fillTargetOf(t).label)
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

/** گام فرم پویا بر اساس فیلدهای نوع — دکمهٔ کناری «ذخیرهٔ پیش‌نویس» — نوار «تغییر نوع فرم»
 * — معرفی روایی (description) در سربرگ فرم + نوار پیشرفت فرم‌های بلند + پیش‌نویس برای چک‌لیست */
function openDynamicForm({ student, type, occurredYmd, appointmentId, onSaved, allTypes = null }) {
  const fields = (type.fields ?? []).map((f) => fieldToForm(f));
  const target = fillTargetOf(type);
  // برچسب صادقانه: ثبت در سایت هیچ چیزی برای کسی ارسال نمی‌کند؛
  // ارسال چک‌لیست به خانواده/معلم فقط از مسیر مودال «ارسال با بله» انجام می‌شود.
  const submitLabel = 'ثبت روی تایم‌لاین';
  // عنوان با وکتور + بج «چه کسی پر می‌کند»
  const titleNode = el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px' } },
    typeIconNode(type.category, type.icon, 18),
    `${type.title} — ${studentLabel(student)}`);
  // پیش‌نویس برای همهٔ دسته‌ها فعال شد (چک‌لیست بلند SCARED/SNAP هم نیمه‌کاره ذخیره می‌شود)
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

  // نوار زمینه بالای فرم: تاریخ وقوع + تغییر نوع فرم (وقتی انواع بیشتری هست)
  // فوری و روی «آخرین» form-grid — نکتهٔ آموخته: setTimeout + querySelector اولین
  // فرم (مودال در حال خروج قبلی) را می‌گرفت و نوار گم می‌شد.
  try {
    const grids = document.querySelectorAll('.modal .form-grid');
    const form = grids[grids.length - 1];
    if (form) {
      // معرفی روایی فرم (یک تا دو جملهٔ ساده — از توضیح سیستمی نوع)
      const intro = (type.description ?? '').trim();
      if (intro) {
        form.prepend(el('div', { class: 'form-intro', style: { gridColumn: '1 / -1' } }, intro));
      }
      const changeBtn = allTypes && allTypes.length > 1
        ? el('button', {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            onclick: () => {
              // بستن همین فرم و بازگشت به انتخابگر نوع
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
      // نوار پیشرفت برای فرم‌های بلند (۸ فیلد و بیشتر) — «۱۲ از ۴۱ پاسخ داده شد»
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

/** ثبت نهایی یا پیش‌نویس — — به‌خاطرسپاری آخرین نوع استفاده‌شده */
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

/** نگاشت فیلد تعریف نوع → فیلد formModal کیت UI
 * — scale با لنگر کلامی (scaleLabels) → چیپ انتخابی؛ heading → سربرگ بخش */
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

/** بخش پیوست‌ها در مودال جزئیات — فهرست + دانلود + حذف + آپلود */
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

/** مودال جزئیات رویداد — payload به شکل برچسب:مقدار + تحلیل چک‌لیست + پیش‌نویس/لغو */
export function openCaseEventDetail(event, { onChanged } = {}) {
  const canEdit = Boolean(session.user && ['manager', 'therapist'].includes(session.user.role));
  const body = el('div', {});

  const head = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' } },
    statusBadge(event.status === 'completed' ? 'done' : event.status === 'pending_family' ? 'pending' : event.status === 'draft' ? 'draft' : 'cancelled'),
    el('span', { class: 'cell-sub' }, STATUS_LABELS[event.status] ?? event.status),
    el('span', { class: 'cell-sub' }, formatJalaliDateTime(event.occurredAt)),
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

    // تحلیل v2 موتور تشخیص: تفسیر خودکار + زیرمقیاس‌ها + آیتم‌های بحرانی
    const a = event.analysis;
    if (a.interpretation) {
      body.appendChild(el('div', {
        style: { background: 'var(--surface-2, #f7f3ea)', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px', whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.9' }
      },
      el('b', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } }, icon('compass', 14), 'تفسیر خودکار موتور تشخیص'),
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
  // m133 — خروجی JSON موتور وکسلر حالا خودش این‌جا رندر می‌شود (نیم‌رخ کامل پیش از فهرست payload)
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
    // نیم‌رخ کامل (شاخص‌ها + فرضیه‌ها + حوزه‌های ضعیف + پرچم‌های روایی) بالای فهرست payload
    const wSection = wechslerEventAnalysisSection(wEng);
    if (wSection) body.appendChild(wSection);
    body.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' } },
      el('span', { class: 'badge badge--accent' }, 'تحلیل موتور وکسلر ۴ ثبت شد')
    ));
  } else if (hasEngineOutput) {
    body.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' } },
      el('span', { class: 'badge badge--accent' }, 'تحلیل موتور وکسلر ۴ ثبت شد'),
      el('span', { class: 'cell-sub' }, 'شاخص‌ها و نیم‌رخ در تب تفسیر بالینی نمایش داده می‌شود')
    ));
  }
  if (keys.length === 0) {
    body.appendChild(el('p', { class: 'cell-sub' }, hasEngineOutput ? 'نمرهٔ خام ثبت و موتور محاسبه کرد.' : 'هنوز پاسخی ثبت نشده است.'));
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
      // حذف رویداد (فقط مدیر — دستور کاربر)
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

// ───────── موتور تشخیص و مداخله: ارسال چک‌لیست با یک کلیک ─────────
/**
 * مودال «ارسال چک‌لیست» — درخواست اصلی کاربر:
 * «با یه دکمه چک‌لیست سیاهه رفتاری اخنباخ یا چک‌لیست بیش فعالی در اختیار خانواده
 * قرار میگیره تو بله و نتیجهش برمیگرده به سایت»
 * جریان: انتخاب قالب (پیشنهاد هوشمند بر اساس برچسب‌های دانش‌آموز) → گیرنده (خانواده/معلم)
 * → یک کلیک: رویداد «در انتظار پاسخ» ساخته + پیام بله با لینک امن وب‌فرم ارسال می‌شود.
 * onSent(event, sendResult) بعد از ارسال موفق صدا می‌شود.
 */
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
    (s) => s.type.familyFillable && (s.type.category === 'checklist' || s.type.key === 'ce-comp-family-v2')
  );
  if (checklists.length === 0) {
    toast('هنوز چک‌لیست قابل ارسالی در کتابخانه نیست — از «رویدادساز» اضافه کنید');
    return;
  }

  const preselected = checklists.find((s) => s.type.id === typeId) ?? null;
  const matchedCount = checklists.filter((s) => s.score > 0).length;
  // برچسب‌های متنی تمیز (بدون ایموجی/ستاره؛ پیشنهادها با پسوند «مناسب» مشخص‌اند)
  const typeOptions = checklists.map((s) => ({
    value: s.type.id,
    label:
      s.type.title +
      (s.score > 0 ? ` — مناسب: ${s.matched.map((m) => m.name).join('، ')}` : '')
  }));

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
        span: 2
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
        span: 2
      },
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
      const created = await api.post(`/api/students/${student.id}/case-events`, {
        eventTypeId: chosen.type.id,
        values: {},
        draft: false
      });
      const send = await api.post(`/api/case-events/${created.data.id}/send`, {
        audience: v.audience,
        note: v.note || null
      });
      if (send.data.sent > 0) {
        toast(`پیام بله برای ${fa(send.data.sent)} نفر ارسال شد — نتیجه خودکار به پرونده برمی‌گردد`);
      } else {
        toast('همین حالا ارسال شده — برای یادآوری مجدد یک دقیقه بعد تلاش کنید', 'warning');
      }
      onSent?.(created.data, send.data);
      return true;
    }
  });
}
