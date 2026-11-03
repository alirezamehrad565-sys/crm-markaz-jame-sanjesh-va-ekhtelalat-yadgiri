import { api } from './api.js';
import { fetchAllStudents } from './student-fetch.js'; // حلقهٔ صفحه‌بندی مشترک (سقف خاموش ۱۰۰ حذف شد)
import { el, icon, formModal, confirmModal, openModal, toast, toastError, emptyState, phoneCell, rowMenu, lockBtn, loadingState, collapseRemove, flashNode } from './ui.js';
import { fa, addDaysYmd, relativeDayLabel, tehranTodayYmd, tehranYmdMinuteToIso, tehranYmdOfIso, timeToMinute, gridTimes, toUtcIso } from './format.js';
import { session } from './state.js'; // — دسترسی نقش‌محور (درمانگر: فقط افزودن)

export const WL_STATUS_LABELS = {
  waiting: 'در انتظار',
  called: 'تماس شد',
  scheduled: 'نوبت داده شد',
  admitted: 'پذیرفته شد',
  rejected: 'رد شد',
  no_show: 'نیامد',
  cancelled: 'منصرف'
};

const WL_SOURCE_LABELS = {
  self: 'مراجعه مستقیم',
  school: 'مدرسه',
  teacher: 'معلم',
  doctor: 'پزشک',
  other: 'سایر'
};

const WL_BADGE_TONES = {
  waiting: 'info',
  called: 'warn',
  scheduled: 'neutral',
  admitted: 'success',
  rejected: 'neutral',
  no_show: 'danger',
  cancelled: 'neutral'
};

function wlBadge(status) {
  return el('span', { class: `badge badge--${WL_BADGE_TONES[status] ?? 'neutral'}` }, WL_STATUS_LABELS[status] ?? status);
}

function isOpen(entry) {
  return entry.status === 'waiting' || entry.status === 'called';
}

function waitDurationLabel(entry, nowMs = Date.now()) {
  if (!isOpen(entry)) return '—';
  const created = toUtcIso(entry.createdAt).getTime();
  if (Number.isNaN(created)) return '—';
  const days = Math.floor((nowMs - created) / 86400000);
  if (days <= 0) return 'امروز';
  return `${fa(days)} روز`;
}

function lastCallLabel(entry) {
  if (!entry.lastCallAt) return '—';
  const ymd = tehranYmdOfIso(entry.lastCallAt);
  return ymd ? relativeDayLabel(ymd) : '—';
}

function dispatchChanged() {
  window.dispatchEvent(new CustomEvent('waitlist:changed'));
}

let metaCache = null;
async function ensureMeta() {
  if (metaCache) return metaCache;
  const [staffRes, schoolsRes, studentsRes] = await Promise.allSettled([
    api.get('/api/staff'),
    api.get('/api/schools?active=true'),
    fetchAllStudents() // حلقهٔ صفحه‌بندی؛ سقف ۱۰۰ گزینهٔ خاموش نبود
  ]);
  metaCache = {
    staff: staffRes.status === 'fulfilled' ? staffRes.value.data ?? [] : [],
    schools: schoolsRes.status === 'fulfilled' ? schoolsRes.value.data ?? [] : [],
    students: studentsRes.status === 'fulfilled' ? studentsRes.value.data?.items ?? studentsRes.value.data ?? [] : []
  };
  return metaCache;
}

async function openAddModal(ctl, prefillName = '') { /* ۱.۲۱.۰: rerender کل نما ← همگام‌سازی بی‌صدای tbody */
  const meta = await ensureMeta();
  const prefillParts = prefillName.trim().split(/\s+/);
  const prefillFirst = prefillParts.length > 1 ? prefillParts.slice(0, -1).join(' ') : prefillName.trim();
  const prefillLast = prefillParts.length > 1 ? prefillParts[prefillParts.length - 1] : '';
  formModal({
    title: 'متقاضی جدید لیست انتظار',
    wide: true,
    submitLabel: 'ثبت در لیست انتظار',
    initial: prefillName
      ? { first_name: prefillFirst, last_name: prefillLast, note: 'ارجاع از سنجش روزانه (غربال نوآموزان)' }
      : {},
    fields: [
      {
        name: 'student_id',
        label: 'پروندهٔ دانش‌آموز موجود (اختیاری — با جستجو)',
        type: 'searchable-select',
        placeholder: 'نام دانش‌آموز را جستجو کنید…',
        options: meta.students.map((st) => ({ value: st.id, label: `${st.firstName} ${st.lastName}` })),
        hint: 'نام و تلفن از خود پرونده برداشته می‌شود'
      },
      { name: 'first_name', label: 'نام', required: true, maxlength: 120 },
      { name: 'last_name', label: 'نام خانوادگی', required: true, maxlength: 120 },
      { name: 'phone', label: 'تلفن ولیّ (موبایل)', required: true, placeholder: '09xxxxxxxxx', ltr: true },
      { name: 'national_id', label: 'کد ملی (اختیاری — برای ساخت پرونده لازم می‌شود)', maxlength: 10, ltr: true },
      { name: 'birth_date', label: 'تاریخ تولد (اختیاری)', type: 'jalali-date' },
      {
        name: 'school_id',
        label: 'مدرسه (اختیاری — با جستجو)',
        type: 'searchable-select',
        placeholder: 'نام مدرسه را جستجو کنید…',
        options: meta.schools.map((s) => ({ value: s.id, label: s.name }))
      },
      {
        name: 'source',
        label: 'منبع ارجاع',
        type: 'select',
        options: Object.entries(WL_SOURCE_LABELS).map(([value, label]) => ({ value, label }))
      },
      { name: 'service_type', label: 'نوع خدمت درخواستی (اختیاری)', maxlength: 120 },
      {
        name: 'priority',
        label: 'اولویت',
        type: 'select',
        options: [
          { value: 'normal', label: 'معمولی' },
          { value: 'urgent', label: 'فوری' }
        ]
      },
      { name: 'note', label: 'یادداشت (اختیاری)', type: 'textarea' }
    ],
    onSubmit: async (values) => {
      try {
        await api.post('/api/waitlist', {
          student_id: values.student_id || undefined,
          first_name: values.first_name,
          last_name: values.last_name,
          phone: values.phone,
          national_id: values.national_id || undefined,
          birth_date: values.birth_date || undefined,
          school_id: values.school_id || undefined,
          source: values.source || 'self',
          service_type: values.service_type || undefined,
          priority: values.priority || 'normal',
          note: values.note || undefined
        });
        toast(values.student_id ? 'پروندهٔ موجود به لیست انتظار پیوست' : 'متقاضی در لیست انتظار ثبت شد', 'success');
        dispatchChanged();
        ctl.quietSync(); // ورودی تازه در جای درستِ ترتیبِ سرور می‌نشیند — بدون اسکلت
      } catch (err) {
        toastError(err);
        throw err;
      }
    }
  });
}

async function openEditModal(entry, ctl) {
  const meta = await ensureMeta();
  formModal({
    title: `ویرایش متقاضی — ${entry.firstName} ${entry.lastName}`,
    wide: true,
    submitLabel: 'ذخیرهٔ تغییرات',
    initial: {
      first_name: entry.firstName,
      last_name: entry.lastName,
      phone: entry.phone,
      national_id: entry.nationalId ?? '',
      birth_date: entry.birthDate ?? '',
      school_id: entry.schoolId ?? '',
      source: entry.source ?? 'self',
      service_type: entry.serviceType ?? '',
      priority: entry.priority ?? 'normal',
      note: entry.note ?? ''
    },
    fields: [
      { name: 'first_name', label: 'نام', required: true, maxlength: 120 },
      { name: 'last_name', label: 'نام خانوادگی', required: true, maxlength: 120 },
      { name: 'phone', label: 'تلفن ولیّ (موبایل)', required: true, placeholder: '09xxxxxxxxx', ltr: true },
      { name: 'national_id', label: 'کد ملی (اختیاری — برای ساخت پرونده لازم می‌شود)', maxlength: 10, ltr: true },
      { name: 'birth_date', label: 'تاریخ تولد (اختیاری)', type: 'jalali-date' },
      {
        name: 'school_id',
        label: 'مدرسه (اختیاری — با جستجو)',
        type: 'searchable-select',
        placeholder: 'نام مدرسه را جستجو کنید…',
        options: meta.schools.map((s) => ({ value: s.id, label: s.name }))
      },
      {
        name: 'source',
        label: 'منبع ارجاع',
        type: 'select',
        options: Object.entries(WL_SOURCE_LABELS).map(([value, label]) => ({ value, label }))
      },
      { name: 'service_type', label: 'نوع خدمت درخواستی (اختیاری)', maxlength: 120 },
      {
        name: 'priority',
        label: 'اولویت',
        type: 'select',
        options: [
          { value: 'normal', label: 'معمولی' },
          { value: 'urgent', label: 'فوری' }
        ]
      },
      { name: 'note', label: 'یادداشت (اختیاری)', type: 'textarea' }
    ],
    onSubmit: async (values) => {
      try {
        const res = await api.patch(`/api/waitlist/${entry.id}`, {
          first_name: values.first_name,
          last_name: values.last_name,
          phone: values.phone,
          national_id: values.national_id || null,
          birth_date: values.birth_date || null,
          school_id: values.school_id || null,
          source: values.source || 'self',
          service_type: values.service_type || null,
          priority: values.priority || 'normal',
          note: values.note || null
        });
        toast('تغییرات ذخیره شد', 'success');
        dispatchChanged();
        ctl.patch(res.data); // همان ردیف، درجا
      } catch (err) {
        toastError(err);
        throw err;
      }
    }
  });
}

async function openNoShowModal(entry, ctl) {
  const ok = await confirmModal({
    title: `ثبت عدم مراجعه — ${entry.firstName} ${entry.lastName}`,
    message: 'وضعیت به «نیامد» تغییر می‌کند و از صف باز خارج می‌شود. یک پیگیری با مسئول و مهلت پیش‌فرض ساخته می‌شود. بعداً با «بازگشت به صف» قابل بازگشت است.',
    confirmLabel: 'نیامد'
  });
  if (!ok) return;
  try {
    const res = await api.post(`/api/waitlist/${entry.id}/no-show`, {});
    toast('عدم مراجعه ثبت شد + پیگیری ساخته شد', 'success');
    dispatchChanged();
    ctl.patch(res.data); // بج وضعیت همان ردیف درجا عوض می‌شود (یا با فیلتر فعال، جمع‌شدن نرم)
  } catch (err) {
    toastError(err);
  }
}

async function openCancelModal(entry, ctl) {
  const ok = await confirmModal({
    title: `ثبت انصراف — ${entry.firstName} ${entry.lastName}`,
    message: 'وضعیت به «منصرف» تغییر می‌کند (خانواده انصراف داده). ورودی از صف باز خارج می‌شود اما با «بازگشت به صف» قابل بازگشت است.',
    confirmLabel: 'منصرف'
  });
  if (!ok) return;
  try {
    const res = await api.post(`/api/waitlist/${entry.id}/cancel`, {});
    toast('انصراف ثبت شد', 'success');
    dispatchChanged();
    ctl.patch(res.data);
  } catch (err) {
    toastError(err);
  }
}

function openReopenModal(entry, ctl) {
  formModal({
    title: `بازگشت به صف انتظار — ${entry.firstName} ${entry.lastName}`,
    submitLabel: 'بازگشت به صف',
    fields: [{ name: 'note', label: 'دلیل بازگشت (اختیاری — به یادداشت اضافه می‌شود)', type: 'textarea' }],
    onSubmit: async (values) => {
      try {
        const res = await api.post(`/api/waitlist/${entry.id}/reopen`, { note: values.note || undefined });
        toast('به صف انتظار بازگشت', 'success');
        dispatchChanged();
        ctl.patch(res.data);
      } catch (err) {
        toastError(err);
        throw err;
      }
    }
  });
}

async function openDeleteModal(entry, ctl) {
  const ok = await confirmModal({
    title: `حذف از لیست انتظار — ${entry.firstName} ${entry.lastName}`,
    message: 'این ورودی به‌کلی از لیست انتظار پاک می‌شود (برای ثبت‌های اشتباه یا تکراری). اگر فقط خواسته‌اید از صف باز خارج شود، «نیامد/انصراف/رد» را انتخاب کنید که قابل بازگشت است.',
    confirmLabel: 'حذف کن',
    danger: true
  });
  if (!ok) return;
  try {
    await api.del(`/api/waitlist/${entry.id}`);
    toast('ورودی حذف شد', 'success');
    dispatchChanged();
    ctl.remove(entry.id); // جمع‌شدن نرم همان ردیف — همسایه‌ها سرجایشان
  } catch (err) {
    toastError(err);
  }
}

function openCallModal(entry, ctl) {
  formModal({
    title: `ثبت تماس — ${entry.firstName} ${entry.lastName}`,
    submitLabel: 'تماس ثبت شد',
    fields: [{ name: 'note', label: 'نتیجه تماس (به یادداشت اضافه می‌شود)', type: 'textarea' }],
    onSubmit: async (values) => {
      try {
        const res = await api.post(`/api/waitlist/${entry.id}/call`, { note: values.note || undefined });
        toast('تماس ثبت شد', 'success');
        dispatchChanged();
        ctl.patch(res.data); // «آخرین تماس» و بج وضعیت همان ردیف درجا
      } catch (err) {
        toastError(err);
        throw err;
      }
    }
  });
}

function openRejectModal(entry, ctl) {
  formModal({
    title: `رد درخواست — ${entry.firstName} ${entry.lastName}`,
    submitLabel: 'رد',
    fields: [{ name: 'note', label: 'دلیل رد (اختیاری — به یادداشت اضافه می‌شود)', type: 'textarea' }],
    onSubmit: async (values) => {
      try {
        const res = await api.post(`/api/waitlist/${entry.id}/reject`, { note: values.note || undefined });
        toast('درخواست رد شد', 'success');
        dispatchChanged();
        ctl.patch(res.data);
      } catch (err) {
        toastError(err);
        throw err;
      }
    }
  });
}

async function openScheduleModal(entry, ctl) {
  const meta = await ensureMeta();
  const tomorrow = addDaysYmd(tehranTodayYmd(), 1);
  formModal({
    title: `نوبت‌دهی — ${entry.firstName} ${entry.lastName}`,
    wide: true,
    submitLabel: 'ثبت نوبت',
    fields: [
      {
        name: 'staff_id',
        label: 'درمانگر',
        type: 'select',
        required: true,
        value: meta.staff.find((s) => s.role === 'therapist' && s.active !== false)?.id,
        options: meta.staff.filter((s) => s.active !== false && s.role === 'therapist').map((s) => ({ value: s.id, label: `${s.fullName ?? s.full_name ?? ''}` }))
      },
      { name: 'date', label: 'تاریخ', type: 'jalali-date', required: true, value: tomorrow },
      {
        name: 'start_at',
        label: 'ساعت شروع',
        type: 'select',
        options: gridTimeOptions(),
        value: '10:00'
      },
      {
        name: 'end_at',
        label: 'ساعت پایان',
        type: 'select',
        options: gridTimeOptions(),
        value: '10:45'
      },
      {
        name: 'student_id',
        label: 'دانش‌آموز موجود (اختیاری — خالی بگذارید برای تطبیق خودکار)',
        type: 'select',
        options: [
          { value: '', label: '— تطبیق خودکار با کد ملی/تلفن —' },
          ...meta.students.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))
        ]
      },
      {
        name: 'national_id',
        label: 'کد ملی برای پروندهٔ جدید (اگر پرونده ندارد)',
        maxlength: 10,
        ltr: true,
        hint: entry.nationalId ? `کد ملی ثبت‌شده: ${fa(entry.nationalId)}` : 'با این کد ملی پرونده ساخته می‌شود'
      },
      { name: 'note', label: 'یادداشت نوبت (اختیاری)', type: 'textarea' }
    ],
    onSubmit: async (values) => {
      if (!values.staff_id) {
        toast('همکار را انتخاب کنید', 'error');
        throw new Error('staff required');
      }
      const startIso = toIso(values.date, values.start_at);
      const endIso = toIso(values.date, values.end_at);
      if (!startIso || !endIso) {
        toast('تاریخ و ساعت معتبر انتخاب کنید', 'error');
        throw new Error('invalid time');
      }
      try {
        const res = await api.post(`/api/waitlist/${entry.id}/schedule`, {
          staff_id: values.staff_id,
          start_at: startIso,
          end_at: endIso,
          student_id: values.student_id || undefined,
          national_id: values.national_id || undefined,
          note: values.note || undefined
        });
        const warnings = res.data?.warnings ?? [];
        toast(warnings.length > 0 ? 'نوبت ثبت شد — با نوبت دیگری هم‌پوشانی دارد' : 'نوبت ثبت شد و از لیست انتظار خارج شد', warnings.length > 0 ? 'warning' : 'success');
        dispatchChanged();
        ctl.quietSync(); // وضعیت خروج از صف را سرور تعیین می‌کند — فقط tbody همگام می‌شود
      } catch (err) {
        toastError(err);
        throw err;
      }
    }
  });
}

function toIso(ymd, hhmm) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd ?? '') || !/^\d{2}:\d{2}$/.test(hhmm ?? '')) return null;
  return tehranYmdMinuteToIso(ymd, timeToMinute(hhmm));
}

function gridTimeOptions() {
  return gridTimes('06:00', '22:00').map((t) => ({ value: t, label: fa(t) })); // ساعت فارسی، هم‌زبان پیکر نوبت‌ها
}

/* ۱.۲۱.۰: همان دو درخواستِ همیشه (GET برای ترتیبِ صحیحِ کل صفِ باز — با فیلتر فعال هم درست)،
   اما دیگر rebuild کل نما نیست: پاسخ reorder فهرست تازه را می‌دهد و فقط tbody عوض می‌شود
   + فلش کوتاه روی ردیف جابه‌جاشده. */
async function moveRow(entry, direction, ctl) {
  try {
    const res = await api.get('/api/waitlist');
    const rows = res.data ?? [];
    const openIds = rows.filter(isOpen).map((r) => r.id);
    const idx = openIds.indexOf(entry.id);
    const swapWith = idx + direction;
    if (idx < 0 || swapWith < 0 || swapWith >= openIds.length) return;
    const next = [...openIds];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    const r2 = await api.post('/api/waitlist/reorder', { ids: next });
    dispatchChanged();
    ctl.applyList(r2.data ?? rows, entry.id);
  } catch (err) {
    toastError(err);
  }
}

async function resetOrder(ctl) {
  const ok = await confirmModal({
    title: 'بازگشت به ترتیب خودکار',
    message: 'ترتیب دستی همه ورودی‌ها پاک می‌شود و دوباره «فوری‌ها بالای لیست + نوبت ثبت» حاکم می‌شود.',
    confirmLabel: 'بازگشت به خودکار'
  });
  if (!ok) return;
  try {
    const res = await api.post('/api/waitlist/auto-order', {});
    toast('ترتیب خودکار فعال شد', 'success');
    dispatchChanged();
    ctl.applyList(res.data ?? []); // پاسخ خودِ سرور = فهرست تازه — بدون GET اضافه و بدون اسکلت
  } catch (err) {
    toastError(err);
  }
}

export async function renderWaitlist(container, initialQuery = '', prefillName = '') {
  const state = { status: '', priority: '', q: initialQuery, rows: [] };
  let gen = 0; // — گارد نسل: پاسخ کهنهٔ درخواست قبلی نباید روی دادهٔ تازه بنشیند
  const isOfficeUser = session.user?.role === 'manager' || session.user?.role === 'secretary';

  /* —— ۱.۲۱.۰ جریان پیوسته (زبان ۱.۱۹/۱.۲۰): شِلِ نما — نوار ابزار، راهنما و جدول — یک‌بار
     مونت می‌شود؛ هیچ اکشنی دیگر کل container را rebuild نمی‌کند.
     هر mutation فقط ردیف خودش را پچ می‌کند (ctl.patch/remove) یا tbody را بی‌صدا
     همگام می‌کند (ctl.quietSync/applyList). هک بازگشتِ مکان‌نمای جستجو هم با این کار
     بی‌معنا شد و حذف شد — گرهٔ input دیگر هیچ‌وقت بازسازی نمی‌شود. —— */

  const statusSel = el(
    'select',
    { class: 'select', style: { width: 'auto' }, onchange: (e) => { state.status = e.target.value; refreshRows(); } },
    el('option', { value: '' }, 'همه وضعیت‌ها'),
    Object.entries(WL_STATUS_LABELS).filter(([value]) => value !== 'admitted')
      .map(([value, label]) => el('option', { value, selected: value === state.status }, label))
  );
  const prioritySel = el(
    'select',
    { class: 'select', style: { width: 'auto' }, onchange: (e) => { state.priority = e.target.value; refreshRows(); } },
    el('option', { value: '' }, 'همه اولویت‌ها'),
    el('option', { value: 'urgent', selected: state.priority === 'urgent' }, 'فوری'),
    el('option', { value: 'normal', selected: state.priority === 'normal' }, 'معمولی')
  );
  const searchInput = el('input', {
    class: 'input',
    type: 'search',
    placeholder: 'جستجوی نام یا تلفن…',
    value: state.q,
    oninput: (e) => {
      state.q = e.target.value.trim();
      clearTimeout(searchInput._t);
      searchInput._t = setTimeout(refreshRows, 250);
    }
  });
  const addBtn = el('button', { class: 'btn btn--primary btn--sm', onclick: () => openAddModal(ctl, prefillName) }, icon('plus', 16), 'متقاضی جدید');
  const autoBtn = isOfficeUser
    ? el('button', { class: 'btn btn--ghost btn--sm', onclick: (e) => lockBtn(e.currentTarget, () => resetOrder(ctl)) }, icon('refresh', 16), 'ترتیب خودکار')
    : null;

  const columns = [
    {
      key: 'name',
      label: 'نام متقاضی',
      render: (r) => el('div', {},
        el('strong', {}, `${r.firstName} ${r.lastName}`),
        r.serviceType ? el('div', { class: 'muted', style: { fontSize: '12px' } }, r.serviceType) : null,
        r.studentId
          ? el('button', {
              class: 'linklike', style: { fontSize: '12px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--primary)', padding: '0' },
              onclick: (e) => { e.stopPropagation(); location.hash = `#/students/${r.studentId}`; }
            }, icon('user', 12), ' پرونده')
          : el('div', { class: 'muted', style: { fontSize: 'var(--fs-2xs)' } }, 'بدون پرونده') /* S2-20 */
      )
    },
    { key: 'phone', label: 'تلفن ولیّ', render: (r) => phoneCell(r.phone, `تماس با ولیّ ${[r.firstName, r.lastName].filter(Boolean).join(' ') || 'ثبت‌نکننده'} — ${fa(r.phone)}`) } /* S2-19 */,
    { key: 'source', label: 'منبع', render: (r) => WL_SOURCE_LABELS[r.source] ?? r.source },
    {
      key: 'priority',
      label: 'اولویت',
      render: (r) => (r.priority === 'urgent' ? el('span', { class: 'badge badge--danger' }, 'فوری') : el('span', { class: 'badge' }, 'معمولی'))
    },
    { key: 'status', label: 'وضعیت', render: (r) => wlBadge(r.status) },
    {
      key: 'follow',
      label: 'انتظار / تماس',
      render: (r) => {
        const dur = waitDurationLabel(r);
        if (dur === '—') return '—';
        const last = lastCallLabel(r);
        return el('div', {},
          el('strong', {}, dur),
          el('div', { class: 'muted', style: { fontSize: '12px' } }, last === '—' ? 'بدون تماس' : `آخرین تماس: ${last}`)
        );
      }
    },
    ...(isOfficeUser ? [{
      key: 'actions',
      label: 'عملیات',
      thStyle: { width: '150px' },
      tdStyle: { width: '150px' },
      render: (r) => wlActions(r)
    }] : [])
  ];
  const colCount = columns.length;
  const thead = el('thead', {}, el('tr', {}, columns.map((c) => el('th', { scope: 'col', style: c.thStyle ?? null }, c.label))));
  const tbody = el('tbody');
  const table = el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, thead, tbody));

  function matchesFilter(r) {
    if (state.status && r.status !== state.status) return false;
    if (state.priority && r.priority !== state.priority) return false;
    if (state.q) {
      const hay = `${r.firstName ?? ''} ${r.lastName ?? ''} ${r.phone ?? ''}`.toLowerCase();
      if (!hay.includes(state.q.toLowerCase())) return false;
    }
    return true;
  }

  function rowEl(r) {
    return el(
      'tr',
      { dataset: { id: String(r.id) }, class: r.priority === 'urgent' && isOpen(r) ? 'wl-row--urgent' : null },
      columns.map((c) =>
        el('td', { style: c.tdStyle ?? null, dataset: { label: c.label } }, c.render ? c.render(r) : r[c.key] ?? '—')
      )
    );
  }

  function stateRow(content) {
    return el('tr', {}, el('td', { colspan: colCount, style: { padding: 'var(--sp-2)' } }, content));
  }

  function emptyRow() {
    const hasFilter = Boolean(state.status || state.priority || state.q);
    return stateRow(
      emptyState({
        iconName: 'clock',
        title: 'لیست انتظار خالی است',
        hint: hasFilter ? 'موردی با این فیلترها نیست — فیلترها را باز کنید.' : 'متقاضیان نوبت که هنوز پرونده نشده‌اند اینجا نگه داشته می‌شوند.',
        ...(hasFilter ? {} : { actionLabel: 'ثبت اولین متقاضی', onAction: () => openAddModal(ctl, prefillName) })
      })
    );
  }

  function renderTbody(rows, { flashId = null } = {}) {
    state.rows = rows;
    const visible = rows.filter(matchesFilter);
    tbody.replaceChildren(...(visible.length ? visible.map((r) => rowEl(r)) : [emptyRow()]));
    if (flashId) flashNode(tbody.querySelector(`tr[data-id="${CSS.escape(String(flashId))}"]`));
  }

  /* پس از جمع‌شدن نرمِ آخرین ردیفِ یک بخش، حالت خالی بنشیند (بدون قطع انیمیشن) */
  function ensureNonEmptyPaint() {
    setTimeout(() => {
      if (tbody.isConnected && !tbody.querySelector('tr[data-id]')) renderTbody(state.rows);
    }, 320);
  }

  async function refreshRows() {
    const myGen = ++gen;
    const params = new URLSearchParams();
    if (state.status) params.set('status', state.status);
    if (state.priority) params.set('priority', state.priority);
    if (state.q) params.set('q', state.q);
    try {
      const res = await api.get(`/api/waitlist${params.toString() ? `?${params}` : ''}`);
      if (myGen !== gen || !tbody.isConnected) return;
      renderTbody(res.data ?? []);
    } catch (err) {
      if (myGen !== gen || !tbody.isConnected) return;
      tbody.replaceChildren(stateRow(emptyState({ iconName: 'alert', title: 'خطا در دریافت لیست انتظار', hint: String(err?.message ?? err) })));
    }
  }

  const ctl = {
    /* پچ درجای یک ردیف از بدنهٔ پاسخ mutation — بدون GET، بدون اسکلت، بدون پرش اسکرول */
    patch(entry) {
      if (!entry?.id || !tbody.isConnected) { ctl.quietSync(); return; }
      state.rows = state.rows.map((r) => (r.id === entry.id ? entry : r));
      const old = tbody.querySelector(`tr[data-id="${CSS.escape(String(entry.id))}"]`);
      if (!old) { ctl.quietSync(); return; } // با فیلتر فعلی تازه وارد دید شده — همگام‌سازی آرام
      if (!matchesFilter(entry)) { collapseRemove(old); ensureNonEmptyPaint(); return; } // از فیلتر خارج شد
      const fresh = rowEl(entry);
      old.replaceWith(fresh);
      flashNode(fresh);
    },
    /* حذف کامل (۲۰۴ بی‌بدنه): جمع‌شدن نرم همان ردیف */
    remove(id) {
      state.rows = state.rows.filter((r) => r.id !== id);
      const old = tbody.querySelector(`tr[data-id="${CSS.escape(String(id))}"]`);
      if (old) { collapseRemove(old); ensureNonEmptyPaint(); }
    },
    /* همگام‌سازی بی‌صدا: GET با فیلترهای فعلی و تعویض فقط tbody — نوار ابزار/مکان‌نما دست‌نخورده */
    quietSync: refreshRows,
    /* نشاندن فهرست آمادهٔ سرور (پاسخ reorder/auto-order) — بدون GET اضافه */
    applyList(rows, flashId = null) {
      if (tbody.isConnected) renderTbody(rows ?? [], { flashId });
    }
  };

  const legend = el('div', { class: 'muted', style: { fontSize: '12px', margin: '0 4px', lineHeight: 1.9 } },
    'چرخهٔ وضعیت: ',
    el('strong', {}, 'در انتظار'), ' ← ',
    el('strong', {}, 'تماس شد'), ' ← ',
    el('strong', {}, 'نوبت داده شد'),
    ' · پذیرش = خروج خودکار از لیست'
  );
  const toolbar = el('div', { class: 'week-bar' },
    statusSel, prioritySel, searchInput,
    el('div', { class: 'spacer' }),
    autoBtn, addBtn
  );
  const roleNote = isOfficeUser
    ? null
    : el('div', { class: 'alert alert--info', style: { marginBottom: 'var(--sp-3)' } },
        icon('info', 17),
        el('span', {}, 'دسترسی شما: فقط ثبت متقاضی جدید.'));

  container.replaceChildren(...[roleNote, toolbar, legend, table].filter(Boolean));
  tbody.replaceChildren(stateRow(loadingState('بارگذاری لیست انتظار…')));
  await refreshRows();

  function wlActions(r) {
    const wrap = el('div', { class: 'wl-actions', onclick: (e) => e.stopPropagation() });
    if (isOpen(r)) {
      wrap.append(
        el('button', { class: 'btn btn--primary btn--sm', title: 'تبدیل به نوبت', onclick: () => openScheduleModal(r, ctl) }, icon('calendar', 14), 'نوبت بده'),
        el('button', { class: 'btn btn--ghost btn--sm', title: 'ثبت تماس', onclick: () => openCallModal(r, ctl) }, icon('bell', 14), 'تماس'),
        rowMenu({ items: [
          { label: 'ویرایش اطلاعات', icon: 'edit', onclick: () => openEditModal(r, ctl) },
          { label: 'اولویت بالاتر', icon: 'chevR', onclick: () => moveRow(r, -1, ctl) },
          { label: 'اولویت پایین‌تر', icon: 'chevL', onclick: () => moveRow(r, +1, ctl) },
          { sep: true },
          { label: 'نیامد', onclick: () => openNoShowModal(r, ctl) },
          { label: 'انصراف خانواده', onclick: () => openCancelModal(r, ctl) },
          { label: 'رد درخواست', onclick: () => openRejectModal(r, ctl) },
          { sep: true },
          { label: 'حذف کامل', danger: true, onclick: () => openDeleteModal(r, ctl) }
        ] })
      );
    } else if (r.status === 'scheduled') {
      wrap.append(
        el('span', { class: 'muted', style: { fontSize: '12px' } }, 'در انتظار جلسه'),
        rowMenu({ items: [
          { label: 'ویرایش اطلاعات', icon: 'edit', onclick: () => openEditModal(r, ctl) },
          { label: 'نیامد', onclick: () => openNoShowModal(r, ctl) },
          { label: 'انصراف خانواده', onclick: () => openCancelModal(r, ctl) },
          { sep: true },
          { label: 'حذف کامل', danger: true, onclick: () => openDeleteModal(r, ctl) }
        ] })
      );
    } else if (r.status === 'admitted') {
      wrap.append(
        el('span', { class: 'muted', style: { fontSize: '12px' } }, 'پذیرش نهایی — پرونده فعال در «دانش‌آموزان»')
      );
    } else {
      wrap.append(
        el('button', { class: 'btn btn--ghost btn--sm', title: 'بازگشت به صف انتظار', onclick: () => openReopenModal(r, ctl) }, icon('undo', 14), 'بازگشت به صف'),
        rowMenu({ items: [
          { label: 'ویرایش اطلاعات', icon: 'edit', onclick: () => openEditModal(r, ctl) },
          { sep: true },
          { label: 'حذف کامل', danger: true, onclick: () => openDeleteModal(r, ctl) }
        ] })
      );
    }
    return wrap;
  }
}

export async function renderWaitlistModule(container, ctx = {}) {
  const body = el('div', {});
  container.replaceChildren(
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'لیست انتظار')
    ),
    body
  );
  await renderWaitlist(body, ctx.query?.q ?? '', ctx.query?.prefill ?? '');
}

export async function fetchWaitlistBadge() {
  try {
    const res = await api.get('/api/waitlist/badge');
    return res.data ?? { overdue: 0, urgent: 0, waiting: 0 };
  } catch {
    return { overdue: 0, urgent: 0, waiting: 0 };
  }
}

export async function renderWaitlistBoardWidget(asideEl) {
  const badge = await fetchWaitlistBadge();
  if (badge.waiting === 0 && badge.urgent === 0) {
    asideEl.append(
      el('div', { class: 'card wl-board-card' },
        el('div', { class: 'card__title' }, icon('clock', 16), 'لیست انتظار'),
        el('div', { class: 'muted', style: { fontSize: '13px' } }, 'متقاضی در انتظاری نیست')
      )
    );
    return;
  }
  const openBtn = el('button', { class: 'btn btn--ghost btn--sm' }, 'مشاهده');
  const card = el('div', { class: `card wl-board-card${badge.overdue > 0 ? ' wl-board-card--alert' : ''}` },
    el('div', { class: 'card__title' }, icon('clock', 16), 'لیست انتظار'),
    el('div', { class: 'wl-board-card__counts' },
      el('span', {}, `در انتظار: `, el('strong', {}, fa(badge.waiting))),
      badge.urgent > 0 ? el('span', { class: 'badge badge--danger' }, `فوری: ${fa(badge.urgent)}`) : null,
      badge.overdue > 0 ? el('span', { class: 'badge badge--warn' }, `سررسید: ${fa(badge.overdue)}`) : null
    ),
    openBtn
  );
  openBtn.addEventListener('click', async () => {
    const listWrap = el('div', { class: 'table-wrap' });
    try {
      const res = await api.get('/api/waitlist');
      const rows = (res.data ?? []).filter(isOpen);
      listWrap.replaceChildren(
        rows.length === 0
          ? el('p', { class: 'muted' }, 'موردی در صف باز نیست')
          : el('table', { class: 'table' },
              el('thead', {}, el('tr', {}, el('th', {}, 'نام'), el('th', {}, 'تلفن'), el('th', {}, 'اولویت'), el('th', {}, 'مدت انتظار'))),
              el('tbody', {}, rows.map((r) =>
                el('tr', { class: r.priority === 'urgent' ? 'wl-row--urgent' : null },
                  el('td', {}, `${r.firstName} ${r.lastName}`),
                  el('td', {}, phoneCell(r.phone, `تماس با ولیّ ${r.firstName} ${r.lastName} — ${fa(r.phone)}`)),
                  el('td', {}, r.priority === 'urgent' ? 'فوری' : 'معمولی'),
                  el('td', {}, waitDurationLabel(r))
                )
              ))
            )
      );
    } catch (err) {
      listWrap.replaceChildren(el('p', { class: 'muted' }, 'خطا در دریافت لیست'));
    }
    openModal({
      title: 'لیست انتظار — ورودی‌های باز',
      body: listWrap,
      actions: [
        (close) => el('button', { class: 'btn btn--primary', onclick: () => { close(); location.hash = '#/waitlist'; } }, 'رفتن به لیست کامل'),
        (close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'بستن')
      ]
    });
  });
  asideEl.append(card);
}
