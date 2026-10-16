/**
 * نمای کارکنان
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// views/staff.js — مدیریت کارکنان: فهرست + ایجاد/ویرایش + فعال/غیرفعال
// تابلوی پیشرفت درمانگران همین‌جا (نمای مدیر) تعبیه می‌شود — به دستور کاربر:
// «به مدیر نشون بده تو قسمت کارکنان و درمانگران» — جایگزین کارت «امتیاز محتوا»

import { api } from '../api.js';
import { fa, formatJalaliNumeric } from '../format.js';
import { el, icon, formModal, confirmModal, openModal, toast, toastError, dataTable, statusBadge, loadingState, skeletonState, emptyState, phoneCell } from '../ui.js';
import { renderProgressBoardCard } from './progress-board.js'; // — تابلوی پیشرفت (مدیر)
import { invalidateStudentFormMeta } from '../student-form.js'; // — کش فرم دانش‌آموز بعد از هر تغییر کارکنان تازه شود

let filter = ''; // '', 'true', 'false'

export async function renderStaff(container) {
  container.replaceChildren(skeletonState('table', 5));

  let rows;
  try {
    const staffRes = await api.get(`/api/staff${filter ? `?active=${filter}` : ''}`);
    rows = staffRes.data;
  } catch (err) {
    container.replaceChildren(emptyState({ iconName: 'alert', title: 'خطا در بارگذاری', hint: err.message }));
    return;
  }

  const toolbar = el(
    'div',
    { class: 'toolbar' },
    el('select', { class: 'select', onchange: (e) => { filter = e.target.value; renderStaff(container); } },
      el('option', { value: '', selected: filter === '' }, 'همه کارکنان'),
      el('option', { value: 'true', selected: filter === 'true' }, 'فقط فعال'),
      el('option', { value: 'false', selected: filter === 'false' }, 'فقط غیرفعال')
    ),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn--primary btn--sm', onclick: () => openStaffForm(null, container) }, icon('plus', 16), 'کارمند جدید')
  );

  const table = dataTable({
    columns: [
      {
        key: 'fullName',
        label: 'نام',
        render: (s) => el('div', {},
          el('div', { class: 'cell-main' }, s.fullName),
          el('div', { class: 'cell-sub', dir: 'ltr', style: { textAlign: 'end' } }, `@${s.username ?? '—'}`)
        )
      },
      {
        key: 'contact',
        label: 'تلفن / کد ملی',
        // باجت تماس سیستمی کنار شمارهٔ همکار
        render: (s) => el('div', { class: 'cell-sub' },
          s.phone
            ? el('div', { dir: 'ltr', style: { textAlign: 'end' } }, phoneCell(s.phone, `تماس با همکار ${s.fullName} — ${fa(s.phone)}`))
            : el('div', { dir: 'ltr', style: { textAlign: 'end' } }, '—'),
          el('div', { dir: 'ltr', style: { textAlign: 'end' } }, fa(s.nationalId ?? '—'))
        )
      },
      { key: 'role', label: 'نقش', render: (s) => statusBadge(s.role) },
      { key: 'notify', label: 'اعلان بله', render: (s) => el('span', { class: `badge ${s.notifyEnabled ? 'badge--success' : 'badge--neutral'}` }, s.notifyEnabled ? 'فعال' : 'غیرفعال') },
      { key: 'active', label: 'وضعیت', render: (s) => statusBadge(s.active ? 'active' : 'inactive') },
      { key: 'createdAt', label: 'تاریخ ایجاد', render: (s) => formatJalaliNumeric((s.createdAt || '').slice(0, 10)) },
      {
        key: 'actions',
        label: 'عملیات',
        align: 'end',
        render: (s) =>
          el('div', { class: 'cell-actions' },
            el('button', { class: 'btn btn--ghost btn--sm', title: 'بازه‌های کاری', onclick: () => { location.hash = `#/settings?tab=staff-hours&staff=${s.id}`; } }, icon('clock', 15)),
            el('button', { class: 'btn btn--ghost btn--sm', title: 'کد اتصال بات', onclick: () => createBotLink(s, container) }, icon('link', 15)),
            el('button', { class: 'btn btn--ghost btn--sm', title: 'ویرایش', onclick: () => openStaffForm(s, container) }, icon('edit', 15)),
            s.active
              ? el('button', {
                  class: 'btn btn--danger btn--sm', title: 'غیرفعال‌سازی',
                  onclick: async () => {
                    if (!(await confirmModal({ title: 'غیرفعال‌سازی کارمند', message: `«${s.fullName}» غیرفعال می‌شود و دیگر نمی‌تواند وارد شود.`, confirmLabel: 'غیرفعال کن', danger: true }))) return;
                    try {
                      await api.post(`/api/staff/${s.id}/deactivate`);
                      invalidateStudentFormMeta();
                      toast('کارمند غیرفعال شد', 'success');
                      renderStaff(container);
                    } catch (err) { toastError(err); }
                  }
                }, icon('x', 15))
              : el('button', {
                  class: 'btn btn--soft btn--sm', title: 'فعال‌سازی',
                  onclick: async () => {
                    try {
                      await api.post(`/api/staff/${s.id}/activate`);
                      invalidateStudentFormMeta();
                      toast('کارمند فعال شد', 'success');
                      renderStaff(container);
                    } catch (err) { toastError(err); }
                  }
                }, icon('check', 15)),
            // حذف کامل همکار ثبت‌شدهٔ اشتباه/تکراری (فقط مدیر؛ سرور گارد سابقه دارد)
            el('button', {
              class: 'btn btn--danger btn--sm', title: 'حذف کامل — فقط اگر هیچ سابقه‌ای نداشته باشد',
              onclick: async () => {
                if (!(await confirmModal({ title: 'حذف کامل همکار', message: `«${s.fullName}» به‌کلی پاک می‌شود و دیگر وارد نمی‌شود — برای ثبت‌های اشتباه یا تکراری. اگر نوبت/سابقهٔ کاری دارد حذف ممکن نیست (از «غیرفعال‌سازی» استفاده کنید). برگشت ندارد.`, confirmLabel: 'حذف کن', danger: true }))) return;
                try {
                  await api.del(`/api/staff/${s.id}`);
                  toast('همکار حذف شد', 'success');
                  renderStaff(container);
                } catch (err) { toastError(err); }
              }
            }, icon('trash', 15))
          )
      }
    ],
    rows,
    empty: {
      iconName: 'users',
      title: 'هنوز کارمندی ثبت نشده',
      hint: 'اولین کارمند (مدیر، درمانگر یا منشی) را اضافه کنید.',
      actionLabel: 'کارمند جدید',
      onAction: () => openStaffForm(null, container)
    }
  });

  // تابلوی پیشرفت درمانگران (فرمول سراسری: محتوا + استفادهٔ واقعی از سامانه)
  const boardMount = el('div', {});

  container.replaceChildren(
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'کارکنان'),
      el('span', { class: 'badge badge--neutral' }, `${fa(rows.length)} نفر`)
    ),
    toolbar,
    el('div', { class: 'card card__body--flush', style: { boxShadow: 'var(--shadow-1)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' } }, table),
    el('div', { class: 'page-head', style: { marginTop: 'var(--sp-5)' } },
      el('div', { class: 'page-head__title' }, icon('trophy', 18), ' تابلوی پیشرفت درمانگران'),
      el('span', { class: 'cell-sub' }, 'امتیاز سراسری از فعالیت واقعی و محتوای تولیدشده — محاسبهٔ زنده')),
    boardMount
  );
  renderProgressBoardCard(boardMount);
}

function openStaffForm(member, container) {
  formModal({
    title: member ? 'ویرایش کارمند' : 'کارمند جدید',
    fields: [
      { name: 'full_name', label: 'نام و نام خانوادگی', required: true, value: member?.fullName },
      { name: 'phone', label: 'شماره تلفن', type: 'tel', required: true, ltr: true, value: member?.phone, hint: 'مثلاً ۰۹۱۲۱۲۳۴۵۶۷', placeholder: '09121234567' },
      { name: 'national_id', label: 'کد ملی', type: 'text', required: true, ltr: true, value: member?.nationalId, hint: '۱۰ رقم — با checksum اعتبارسنجی می‌شود', placeholder: 'XXXXXXXXXX', maxlength: 10 },
      { name: 'username', label: 'نام کاربری ورود', required: true, ltr: true, value: member?.username, hint: 'فقط حروف لاتین، عدد و ._ـ -', placeholder: 'manager' },
      {
        name: 'password',
        label: member ? 'رمز عبور جدید (اختیاری)' : 'رمز عبور (اختیاری)',
        type: 'password',
        ltr: true,
        hint: member ? 'خالی = رمز فعلی حفظ می‌شود' : 'خالی = رمز پیش‌فرض ۱۲۳۴'
      },
      {
        name: 'role', label: 'نقش', type: 'select', required: true,
        options: [
          { value: 'manager', label: 'مدیر' },
          { value: 'therapist', label: 'درمانگر' },
          { value: 'secretary', label: 'منشی' },
          { value: 'supervisor', label: 'ناظر اداره — فقط گزارش تجمیعی' }
        ],
        value: member?.role ?? 'therapist'
      },
      member
        ? { name: 'notify_enabled', label: 'دریافت اعلان بله (نوبت جدید/تغییر/لغو)', type: 'switch', value: member.notifyEnabled }
        : null
    ].filter(Boolean),
    onSubmit: async (values) => {
      const base = {
        full_name: values.full_name,
        phone: values.phone,
        national_id: values.national_id,
        username: values.username,
        role: values.role
      };
      if (member) {
        await api.patch(`/api/staff/${member.id}`, {
          ...base,
          notify_enabled: values.notify_enabled,
          password: values.password ? values.password : undefined
        });
        invalidateStudentFormMeta();
        toast('تغییرات ذخیره شد', 'success');
      } else {
        await api.post('/api/staff', {
          ...base,
          password: values.password ? values.password : undefined
        });
        invalidateStudentFormMeta();
        toast('کارمند اضافه شد', 'success');
      }
      renderStaff(container);
    }
  });
}

/** — ساخت کد اتصال بات برای کارمند (معلم) */
async function createBotLink(member, container) {
  void container;
  try {
    const res = await api.post('/api/notifications/staff-links', { staff_id: member.id });
    openModal({
      title: 'کد اتصال بات بله',
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        el('p', { style: { margin: 0, color: 'var(--text-2)' } },
          `این کد را به ${member.fullName} بدهید تا در گفتگوی بات بفرستد:`),
        el('div', {
          style: {
            fontSize: '28px', fontWeight: '800', letterSpacing: '6px', textAlign: 'center',
            background: 'var(--surface-2)', border: '1px dashed var(--border)',
            borderRadius: 'var(--radius)', padding: '14px', direction: 'ltr', userSelect: 'all'
          }
        }, res.data.code),
        el('p', { style: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-3)' } },
          'کافی است در بات این پیام را بفرستد: /link ' + res.data.code +
          ' — پس از اتصال، اعلان نوبت‌ها و برنامه کلاس‌ها (/today و /week) دریافت می‌کند.')
      ),
      actions: [
        (close) => el('button', { class: 'btn btn--primary', onclick: () => { navigator.clipboard?.writeText(`/link ${res.data.code}`); toast('دستور کپی شد', 'success'); } }, 'کپی دستور'),
        (close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'بستن')
      ]
    });
  } catch (err) {
    toastError(err);
  }
}
