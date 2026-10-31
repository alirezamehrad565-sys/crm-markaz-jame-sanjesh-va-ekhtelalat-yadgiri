import { api } from '../api.js';
import { fa, formatJalaliNumeric, tehranYmdOfIso } from '../format.js';
import { el, icon, formModal, confirmModal, openModal, toast, toastError, dataTable, statusBadge, loadingState, skeletonState, emptyState, phoneCell } from '../ui.js';
import { renderProgressBoardCard } from './progress-board.js'; // — تابلوی پیشرفت (مدیر)
import { invalidateStudentFormMeta } from '../student-form.js'; // — کش فرم دانش‌آموز بعد از هر تغییر کارکنان تازه شود
import { openBotLinkModal } from '../bot-link.js'; // — لینک احراز خودکار بات

let filter = ''; // مقادیر مجاز: '' | 'true' | 'false'

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
    el('select', { class: 'select', 'aria-label': 'فیلتر وضعیت کارکنان', onchange: (e) => { filter = e.target.value; renderStaff(container); } }, /* S9-07 */
      el('option', { value: '', selected: filter === '' }, 'همه کارکنان'),
      el('option', { value: 'true', selected: filter === 'true' }, 'فقط فعال'),
      el('option', { value: 'false', selected: filter === 'false' }, 'فقط غیرفعال')
    ),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn--primary btn--sm', onclick: () => openStaffForm(null, container) }, icon('plus', 16), 'همکار جدید')
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
        render: (s) => el('div', { class: 'cell-sub' },
          s.phone
            ? el('div', { dir: 'ltr', style: { textAlign: 'end' } }, phoneCell(s.phone, `تماس با همکار ${s.fullName} — ${fa(s.phone)}`))
            : el('div', { dir: 'ltr', style: { textAlign: 'end' } }, '—'),
          el('div', { dir: 'ltr', style: { textAlign: 'end' } }, fa(s.nationalId ?? '—'))
        )
      },
      { key: 'role', label: 'نقش', render: (s) => statusBadge(s.role) },
      { key: 'notify', label: 'اعلان بله', render: (s) => el('span', { class: `badge ${s.notifyEnabled ? 'badge--success' : 'badge--neutral'}` }, s.notifyEnabled ? 'دریافت می‌کند' : 'دریافت نمی‌کند') },
      { key: 'active', label: 'وضعیت', render: (s) => statusBadge(s.active ? 'active' : 'inactive') },
      { key: 'createdAt', label: 'تاریخ ایجاد', render: (s) => (s.createdAt ? formatJalaliNumeric(tehranYmdOfIso(s.createdAt)) : '—') }, // مرز روز تهران (حساب‌های بعد ۲۰:۳۰ یک روز جابه‌جا نشان داده می‌شد)
      {
        key: 'actions',
        label: 'عملیات',
        align: 'end',
        render: (s) =>
          el('div', { class: 'cell-actions' },
            el('button', { class: 'btn btn--ghost btn--sm', title: 'بازه‌های کاری', 'aria-label': 'بازه‌های کاری', onclick: () => { location.hash = `#/settings?tab=staff-hours&staff=${s.id}`; } }, icon('clock', 15)),
            el('button', { class: 'btn btn--ghost btn--sm', title: 'کد اتصال بات', 'aria-label': 'کد اتصال بات', onclick: () => createBotLink(s, container) }, icon('link', 15)),
            el('button', { class: 'btn btn--ghost btn--sm', title: 'ویرایش', 'aria-label': 'ویرایش', onclick: () => openStaffForm(s, container) }, icon('edit', 15)),
            s.active
              ? el('button', {
                  class: 'btn btn--danger btn--sm', title: 'غیرفعال‌سازی', 'aria-label': 'غیرفعال‌سازی',
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
                  class: 'btn btn--soft btn--sm', title: 'فعال‌سازی', 'aria-label': 'فعال‌سازی',
                  onclick: async () => {
                    try {
                      await api.post(`/api/staff/${s.id}/activate`);
                      invalidateStudentFormMeta();
                      toast('کارمند فعال شد', 'success');
                      renderStaff(container);
                    } catch (err) { toastError(err); }
                  }
                }, icon('check', 15)),
            el('button', {
              class: 'btn btn--danger btn--sm', title: 'حذف کامل — فقط اگر هیچ سابقه‌ای نداشته باشد', 'aria-label': 'حذف کامل — فقط اگر هیچ سابقه‌ای نداشته باشد',
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
      actionLabel: 'همکار جدید',
      onAction: () => openStaffForm(null, container)
    }
  });

  const boardMount = el('div', {});

  container.replaceChildren(
    el('div', { class: 'page-head' },
      el('h2', { class: 'page-head__title' }, 'کارکنان') /* S9-04 */,
      el('span', { class: 'badge badge--neutral', title: 'شمار نتیجهٔ فیلتر فعلی' }, `نتیجه: ${fa(rows.length)} نفر`) /* S9-05 */
    ),
    toolbar,
    el('div', { class: 'card card__body--flush card--table' }, table),
    el('div', { class: 'page-head', style: { marginTop: 'var(--sp-5)' } },
      el('div', { class: 'page-head__title' }, icon('trophy', 18), ' تابلوی پیشرفت درمانگران'),
      el('span', { class: 'cell-sub' }, 'امتیاز سراسری از فعالیت واقعی و محتوای تولیدشده — محاسبهٔ زنده')),
    boardMount
  );
  renderProgressBoardCard(boardMount);
}

function openStaffForm(member, container) {
  // ناظر فقط نام کاربری + رمز: تلفن/کد ملی برای نقش ناظر اختیاری است و با تغییر نقش زنده عوض می‌شود
  const isSupervisorRole = (r) => r === 'supervisor';
  const phoneField = {
    name: 'phone', label: 'شماره تلفن', type: 'tel', ltr: true,
    required: !isSupervisorRole(member?.role),
    value: member?.phone, hint: 'مثلاً ۰۹۱۲۱۲۳۴۵۶۷ — برای نقش ناظر اختیاری است', placeholder: '09121234567'
  };
  const nidField = {
    name: 'national_id', label: 'کد ملی', type: 'text', ltr: true,
    required: !isSupervisorRole(member?.role),
    value: member?.nationalId, hint: '۱۰ رقم — با checksum اعتبارسنجی می‌شود؛ برای نقش ناظر اختیاری است', placeholder: 'XXXXXXXXXX', maxlength: 10
  };
  formModal({
    title: member ? 'ویرایش کارمند' : 'همکار جدید',
    fields: [
      { name: 'full_name', label: 'نام و نام خانوادگی', required: true, value: member?.fullName },
      phoneField,
      nidField,
      { name: 'username', label: 'نام کاربری ورود', required: true, ltr: true, value: member?.username, hint: 'فقط حروف لاتین، عدد و نقطه، خط تیره و زیرخط' /* S9-03 */, placeholder: 'manager' },
      {
        name: 'password',
        label: member ? 'رمز عبور جدید (اختیاری)' : 'رمز عبور (اختیاری)',
        type: 'password',
        ltr: true,
        hint: member ? 'خالی = رمز فعلی حفظ می‌شود' : 'خالی = رمز پیش‌فرض سامانه'
      },
      {
        name: 'role', label: 'نقش', type: 'select', required: true,
        options: [
          { value: 'manager', label: 'مدیر' },
          { value: 'therapist', label: 'درمانگر' },
          { value: 'secretary', label: 'منشی' },
          { value: 'supervisor', label: 'ناظر — فقط مشاهده (نام کاربری و رمز کافی است)' }
        ],
        value: member?.role ?? 'therapist',
        onChange: (val) => {
          const sup = isSupervisorRole(val); // الزام تلفن/کد ملی فقط برای غیرناظر
          phoneField.required = !sup;
          nidField.required = !sup;
        }
      },
      member
        ? { name: 'notify_enabled', label: 'دریافت اعلان بله (نوبت جدید/تغییر/لغو)', type: 'switch', value: member.notifyEnabled }
        : null
    ].filter(Boolean),
    onSubmit: async (values) => {
      const base = {
        full_name: values.full_name,
        phone: values.phone || undefined, // ناظر ممکن است خالی بگذارد
        national_id: values.national_id || undefined,
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

async function createBotLink(member, container) {
  void container;
  try {
    const res = await api.post('/api/notifications/staff-links', { staff_id: member.id });
    await openBotLinkModal(res.data.code, {
      intro: `این کد/لینک را به ${member.fullName} بدهید تا گفتگوی باتش متصل شود:`,
      extraHint: 'پس از اتصال، اعلان نوبت‌ها و برنامه کلاس‌ها (/today و /week) دریافت می‌کند.'
    });
  } catch (err) {
    toastError(err);
  }
}
