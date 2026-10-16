/**
 * فرانت لیست انتظار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// waitlist.js — فاز W: لیست انتظار (لیست پشت‌نوبتی‌های مرکز)
// ماژول مستقل شد (NAV «لیست انتظار» #/waitlist)؛ دیگر تب ماژول دانش‌آموزان نیست —
// «لیست دانش‌آموز فعال مرکز با یه لیست دیگه تو این فلو ادغام شده که اونم باید جدا کنیم»
// قواعد UX:
// * ردیف urgent رنگی؛ ستون‌های «آخرین تماس» و «مدت انتظار»
// * اکشن‌های inline متناسب با وضعیت (تماس/نوبت بده/رد/نیامد/انصراف)
// * ترتیب دستی با دکمه‌های بالا/پایین (همان manual_order سرور) + بازگشت به ترتیب خودکار
// * هر تغییر رویداد window «waitlist:changed» را می‌فرستد (badge منو + ویجت بورد)

import { api } from './api.js';
// بازطراحی UI: اکشن‌های فشرده (منوی سرریز ⋯) + ادغام ستون‌های «آخرین تماس/مدت انتظار»
import { el, icon, formModal, confirmModal, openModal, toast, toastError, dataTable, emptyState, skeletonState, phoneCell, rowMenu } from './ui.js';
import { fa, addDaysYmd, relativeDayLabel, tehranTodayYmd, tehranYmdMinuteToIso, tehranYmdOfIso, timeToMinute, gridTimes, toUtcIso } from './format.js';
import { session } from './state.js'; // — دسترسی نقش‌محور (درمانگر: فقط افزودن)

// ─────────────── برچسب‌ها ───────────────

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

/** وضعیت‌های باز — اکشن‌ها فقط برای این‌ها معنا دارد */
function isOpen(entry) {
  return entry.status === 'waiting' || entry.status === 'called';
}

/** «مدت انتظار» — برای ورودی‌های باز: روزهای گذشته از ثبت */
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

// ─────────────── داده‌های پایه فرم‌ها ───────────────

let metaCache = null;
async function ensureMeta() {
  if (metaCache) return metaCache;
  const [staffRes, schoolsRes, studentsRes] = await Promise.allSettled([
    api.get('/api/staff'),
    api.get('/api/schools?active=true'),
    api.get('/api/students?active=true&page_size=100')
  ]);
  metaCache = {
    staff: staffRes.status === 'fulfilled' ? staffRes.value.data ?? [] : [],
    schools: schoolsRes.status === 'fulfilled' ? schoolsRes.value.data ?? [] : [],
    students: studentsRes.status === 'fulfilled' ? studentsRes.value.data?.items ?? studentsRes.value.data ?? [] : []
  };
  return metaCache;
}

// ─────────────── فرم افزودن متقاضی ───────────────

async function openAddModal(container, rerender, prefillName = '') {
  const meta = await ensureMeta();
  // پل سنجش → لیست انتظار: نام کامل از کارت «نیازمند پیگیری» سنجش روزانه پیش‌پُر می‌شود
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
        // پیوند پروندهٔ موجود (جایگزین تیک حذف‌شدهٔ فرم دانش‌آموز): مشخصات از خود پرونده پر می‌شود
        name: 'student_id',
        label: 'پروندهٔ دانش‌آموز موجود (اختیاری — سرچ‌دار)',
        type: 'searchable-select',
        placeholder: 'نام دانش‌آموز را جستجو کنید…',
        options: meta.students.map((st) => ({ value: st.id, label: `${st.firstName} ${st.lastName}` })),
        hint: 'نام و تلفن از خود پرونده برداشته می‌شود'
      },
      { name: 'first_name', label: 'نام', required: true, maxlength: 120 },
      { name: 'last_name', label: 'نام خانوادگی', required: true, maxlength: 120 },
      { name: 'phone', label: 'تلفن ولی (موبایل — اجباری)', required: true, placeholder: '09xxxxxxxxx', ltr: true },
      { name: 'national_id', label: 'کد ملی (اختیاری — برای ساخت پرونده لازم می‌شود)', maxlength: 10, ltr: true },
      { name: 'birth_date', label: 'تاریخ تولد (اختیاری)', type: 'jalali-date' },
      {
        // دراپ‌داون سرچ‌دار (لیست مدارس بلند است)
        name: 'school_id',
        label: 'مدرسه (اختیاری — سرچ‌دار)',
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
        rerender();
      } catch (err) {
        toastError(err);
        throw err;
      }
    }
  });
}

// ─────────────── فرم ویرایش ورودی ───────────────

/** ویرایش کامل متقاضی — همان فیلدهای ثبت + PATCH — برای همهٔ وضعیت‌ها باز است */
async function openEditModal(entry, rerender) {
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
      { name: 'phone', label: 'تلفن ولی (موبایل — اجباری)', required: true, placeholder: '09xxxxxxxxx', ltr: true },
      { name: 'national_id', label: 'کد ملی (اختیاری — برای ساخت پرونده لازم می‌شود)', maxlength: 10, ltr: true },
      { name: 'birth_date', label: 'تاریخ تولد (اختیاری)', type: 'jalali-date' },
      {
        // دراپ‌داون سرچ‌دار (لیست مدارس بلند است)
        name: 'school_id',
        label: 'مدرسه (اختیاری — سرچ‌دار)',
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
        await api.patch(`/api/waitlist/${entry.id}`, {
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
        rerender();
      } catch (err) {
        toastError(err);
        throw err;
      }
    }
  });
}

/** — ثبت «نیامد» با پیام شفاف (پیگیری خودکار ساخته می‌شود) */
async function openNoShowModal(entry, rerender) {
  const ok = await confirmModal({
    title: `ثبت عدم مراجعه — ${entry.firstName} ${entry.lastName}`,
    message: 'وضعیت به «نیامد» تغییر می‌کند و از صف باز خارج می‌شود. یک پیگیری با مسئول و مهلت پیش‌فرض ساخته می‌شود. بعداً با «بازگشت به صف» قابل بازگشت است.',
    confirmLabel: 'نیامد'
  });
  if (!ok) return;
  try {
    await api.post(`/api/waitlist/${entry.id}/no-show`, {});
    toast('عدم مراجعه ثبت شد + پیگیری ساخته شد', 'success');
    dispatchChanged();
    rerender();
  } catch (err) {
    toastError(err);
  }
}

/** — ثبت «انصراف» با پیام شفاف */
async function openCancelModal(entry, rerender) {
  const ok = await confirmModal({
    title: `ثبت انصراف — ${entry.firstName} ${entry.lastName}`,
    message: 'وضعیت به «منصرف» تغییر می‌کند (خانواده انصراف داده). ورودی از صف باز خارج می‌شود اما با «بازگشت به صف» قابل بازگشت است.',
    confirmLabel: 'منصرف'
  });
  if (!ok) return;
  try {
    await api.post(`/api/waitlist/${entry.id}/cancel`, {});
    toast('انصراف ثبت شد', 'success');
    dispatchChanged();
    rerender();
  } catch (err) {
    toastError(err);
  }
}

/** — بازگشت خروجِ اشتباه به صف انتظار (رد/نیامد/منصرف → در انتظار) */
function openReopenModal(entry, rerender) {
  formModal({
    title: `بازگشت به صف انتظار — ${entry.firstName} ${entry.lastName}`,
    submitLabel: 'بازگشت به صف',
    fields: [{ name: 'note', label: 'دلیل بازگشت (اختیاری — به یادداشت اضافه می‌شود)', type: 'textarea' }],
    onSubmit: async (values) => {
      try {
        await api.post(`/api/waitlist/${entry.id}/reopen`, { note: values.note || undefined });
        toast('به صف انتظار بازگشت', 'success');
        dispatchChanged();
        rerender();
      } catch (err) {
        toastError(err);
        throw err;
      }
    }
  });
}

/**
 * — حذف کامل ورودی لیست انتظار (ثبت اشتباه/تکراری).
 * سرور soft-delete می‌کند (audit می‌ماند) — از همهٔ لیست‌ها پاک می‌شود؛ برگشت ندارد.
 */
async function openDeleteModal(entry, rerender) {
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
    rerender();
  } catch (err) {
    toastError(err);
  }
}

// ─────────────── فرم‌های اکشن ردیف ───────────────

function openCallModal(entry, rerender) {
  formModal({
    title: `ثبت تماس — ${entry.firstName} ${entry.lastName}`,
    submitLabel: 'تماس ثبت شد',
    fields: [{ name: 'note', label: 'نتیجه تماس (به یادداشت اضافه می‌شود)', type: 'textarea' }],
    onSubmit: async (values) => {
      try {
        await api.post(`/api/waitlist/${entry.id}/call`, { note: values.note || undefined });
        toast('تماس ثبت شد', 'success');
        dispatchChanged();
        rerender();
      } catch (err) {
        toastError(err);
        throw err;
      }
    }
  });
}

function openRejectModal(entry, rerender) {
  formModal({
    title: `رد درخواست — ${entry.firstName} ${entry.lastName}`,
    submitLabel: 'رد',
    fields: [{ name: 'note', label: 'دلیل رد (اختیاری — به یادداشت اضافه می‌شود)', type: 'textarea' }],
    onSubmit: async (values) => {
      try {
        await api.post(`/api/waitlist/${entry.id}/reject`, { note: values.note || undefined });
        toast('درخواست رد شد', 'success');
        dispatchChanged();
        rerender();
      } catch (err) {
        toastError(err);
        throw err;
      }
    }
  });
}

/** تبدیل به نوبت — همان قرارداد فرم «نوبت جدید» با پروندهٔ خودکار */
async function openScheduleModal(entry, rerender) {
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
        // نوبت فقط به درمانگر داده می‌شود (مدیر/منشی ارائه‌دهندهٔ جلسه نیستند)
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
        rerender();
      } catch (err) {
        toastError(err);
        throw err;
      }
    }
  });
}

/** تاریخ جلالی ذخیره‌شده (YYYY-MM-DD) + «HH:MM» → ISO UTC — همان قرارداد appointments */
function toIso(ymd, hhmm) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd ?? '') || !/^\d{2}:\d{2}$/.test(hhmm ?? '')) return null;
  return tehranYmdMinuteToIso(ymd, timeToMinute(hhmm));
}

/** گزینه‌های ساعت روی شبکه ۱۵ دقیقه‌ای */
function gridTimeOptions() {
  return gridTimes('06:00', '22:00').map((t) => ({ value: t, label: t }));
}

// ─────────────── ترتیب دستی (بالا/پایین) ───────────────

async function moveRow(entry, direction, container, rerender) {
  const res = await api.get('/api/waitlist');
  const rows = res.data ?? [];
  const openIds = rows.filter(isOpen).map((r) => r.id);
  const idx = openIds.indexOf(entry.id);
  const swapWith = idx + direction;
  if (idx < 0 || swapWith < 0 || swapWith >= openIds.length) return;
  const next = [...openIds];
  [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
  try {
    await api.post('/api/waitlist/reorder', { ids: next });
    dispatchChanged();
    rerender();
  } catch (err) {
    toastError(err);
  }
}

async function resetOrder(rerender) {
  const ok = await confirmModal({
    title: 'بازگشت به ترتیب خودکار',
    message: 'ترتیب دستی همه ورودی‌ها پاک می‌شود و دوباره «فوری‌ها بالای لیست + نوبت ثبت» حاکم می‌شود.',
    confirmLabel: 'بازگشت به خودکار'
  });
  if (!ok) return;
  try {
    await api.post('/api/waitlist/auto-order', {});
    toast('ترتیب خودکار فعال شد', 'success');
    dispatchChanged();
    rerender();
  } catch (err) {
    toastError(err);
  }
}

// ─────────────── رندر اصلی ───────────────

export async function renderWaitlist(container, initialQuery = '', prefillName = '') {
  container.replaceChildren(skeletonState('table', 5));

  const state = { status: '', priority: '', q: initialQuery };

  async function rerender() {
    await renderList();
  }

  async function renderList() {
    const params = new URLSearchParams();
    if (state.status) params.set('status', state.status);
    if (state.priority) params.set('priority', state.priority);
    if (state.q) params.set('q', state.q);
    let rows = [];
    try {
      const res = await api.get(`/api/waitlist${params.toString() ? `?${params}` : ''}`);
      rows = res.data ?? [];
    } catch (err) {
      container.replaceChildren(emptyState({ title: 'خطا در دریافت لیست انتظار', hint: String(err?.message ?? err) }));
      return;
    }

    const statusSel = el(
      'select',
      { class: 'select', style: { width: 'auto' }, onchange: (e) => { state.status = e.target.value; renderList(); } },
      el('option', { value: '' }, 'همه وضعیت‌ها'),
      // «پذیرفته شد» دیگر در فهرست نیست: با پذیرش، ورودی soft delete می‌شود و از لیست پاک است
      Object.entries(WL_STATUS_LABELS).filter(([value]) => value !== 'admitted')
        .map(([value, label]) => el('option', { value, selected: value === state.status }, label))
    );
    const prioritySel = el(
      'select',
      { class: 'select', style: { width: 'auto' }, onchange: (e) => { state.priority = e.target.value; renderList(); } },
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
        searchInput._t = setTimeout(renderList, 250);
      }
    });
    const addBtn = el('button', { class: 'btn btn--primary btn--sm', onclick: () => openAddModal(container, rerender, prefillName) }, icon('plus', 16), 'متقاضی جدید');
    // «ترتیب خودکار» و جابه‌جایی دستی ابزار دفتر است؛ درمانگر دسترسی ندارد
    const isOfficeUser = session.user?.role === 'manager' || session.user?.role === 'secretary';
    const autoBtn = isOfficeUser
      ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => resetOrder(rerender) }, icon('refresh', 16), 'ترتیب خودکار')
      : null;

    const table = dataTable({
      columns: [
        {
          key: 'name',
          label: 'نام متقاضی',
          render: (r) => el('div', {},
            el('strong', {}, `${r.firstName} ${r.lastName}`),
            r.serviceType ? el('div', { class: 'muted', style: { fontSize: '12px' } }, r.serviceType) : null,
            // لینک پروندهٔ متصل
            r.studentId
              ? el('button', {
                  class: 'linklike', style: { fontSize: '12px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--primary)', padding: '0' },
                  onclick: (e) => { e.stopPropagation(); location.hash = `#/students/${r.studentId}`; }
                }, icon('user', 12), ' پرونده')
              : el('div', { class: 'muted', style: { fontSize: '11px' } }, 'بدون پرونده')
          )
        },
        // باجت تماس سیستمی کنار تلفن ولیّ در لیست انتظار
        { key: 'phone', label: 'تلفن ولی', render: (r) => phoneCell(r.phone, `تماس با ولیّ ${r.name ?? ''} — ${fa(r.phone)}`) },
        { key: 'source', label: 'منبع', render: (r) => WL_SOURCE_LABELS[r.source] ?? r.source },
        {
          key: 'priority',
          label: 'اولویت',
          render: (r) => (r.priority === 'urgent' ? el('span', { class: 'badge badge--danger' }, 'فوری') : el('span', { class: 'badge' }, 'معمولی'))
        },
        { key: 'status', label: 'وضعیت', render: (r) => wlBadge(r.status) },
        // «مدت انتظار» + «آخرین تماس» در یک ستون دوخطی (کاهش عرض جدول)
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
        // درمانگر بدون ستون عملیات (فقط افزودن) — دفتر همهٔ اکشن‌ها را دارد
        // عرض ثابت ستون عملیات: سلول با اکشن‌های فشرده دیگر جدول را نمی‌شکند
        ...(isOfficeUser ? [{
          key: 'actions',
          label: 'عملیات',
          thStyle: { width: '150px' },
          tdStyle: { width: '150px' },
          render: (r) => wlActions(r)
        }] : [])
      ],
      rows,
      empty: {
        iconName: 'clock',
        title: 'لیست انتظار خالی است',
        hint: 'متقاضیان نوبت که هنوز پرونده نشده‌اند اینجا نگه داشته می‌شوند.',
        actionLabel: 'ثبت اولین متقاضی',
        onAction: () => openAddModal(container, rerender)
      },
      rowClass: (r) => (r.priority === 'urgent' && isOpen(r) ? 'wl-row--urgent' : null)
    });

    // راهنمای وضعیت‌ها — فشرده‌سازی به یک خط کوتاه (خواست کاربر: کاهش راهنمایی‌ها)
    const legend = el('div', { class: 'muted', style: { fontSize: '12px', margin: '0 4px', lineHeight: 1.9 } },
      'چرخهٔ وضعیت: ',
      el('strong', {}, 'در انتظار'), ' ← ',
      el('strong', {}, 'تماس شد'), ' ← ',
      el('strong', {}, 'نوبت داده شد'),
      ' · پذیرش = خروج خودکار از لیست'
    );
    // عنوان تکراری حذف شد (سربرگ صفحه «لیست انتظار» را دارد) — فیلترها + اکشن‌ها
    const toolbar = el('div', { class: 'week-bar' },
      statusSel, prioritySel, searchInput,
      el('div', { class: 'spacer' }),
      autoBtn, addBtn
    );

    // راهنمای دسترسی درمانگر — کوتاه‌شده
    const roleNote = isOfficeUser
      ? null
      : el('div', { class: 'alert alert--info', style: { marginBottom: 'var(--sp-3)' } },
          icon('info', 17),
          el('span', {}, 'دسترسی شما: فقط ثبت متقاضی جدید.'));

    // roleNote فقط برای درمانگر است؛ null هرگز به DOM نرود (درس: null → متن "null")
    container.replaceChildren(...[roleNote, toolbar, legend, table].filter(Boolean));
  }

  /**
   * — اکشن‌های فشردهٔ ردیف: ۱–۲ اکشن اصلی inline + بقیه در منوی سرریز ⋯ (rowMenu).
   * قبلاً تا ۹ دکمه در یک سلول رندر می‌شد و ردیف‌ها چندخطی و بهم‌ریخته می‌شدند.
   * قواعد وضعیت همان است — فقط چیدمان فشرده شد.
   */
  function wlActions(r) {
    const wrap = el('div', { class: 'wl-actions', onclick: (e) => e.stopPropagation() });
    if (isOpen(r)) {
      wrap.append(
        el('button', { class: 'btn btn--primary btn--sm', title: 'تبدیل به نوبت', onclick: () => openScheduleModal(r, rerender) }, icon('calendar', 14), 'نوبت بده'),
        el('button', { class: 'btn btn--ghost btn--sm', title: 'ثبت تماس', onclick: () => openCallModal(r, rerender) }, icon('bell', 14), 'تماس'),
        rowMenu({ items: [
          { label: 'ویرایش اطلاعات', icon: 'edit', onclick: () => openEditModal(r, rerender) },
          { label: 'اولویت بالاتر', icon: 'chevR', onclick: () => moveRow(r, -1, container, rerender) },
          { label: 'اولویت پایین‌تر', icon: 'chevL', onclick: () => moveRow(r, +1, container, rerender) },
          { sep: true },
          { label: 'نیامد', onclick: () => openNoShowModal(r, rerender) },
          { label: 'انصراف خانواده', onclick: () => openCancelModal(r, rerender) },
          { label: 'رد درخواست', onclick: () => openRejectModal(r, rerender) },
          { sep: true },
          { label: 'حذف کامل', danger: true, onclick: () => openDeleteModal(r, rerender) }
        ] })
      );
    } else if (r.status === 'scheduled') {
      wrap.append(
        el('span', { class: 'muted', style: { fontSize: '12px' } }, 'در انتظار جلسه'),
        rowMenu({ items: [
          { label: 'ویرایش اطلاعات', icon: 'edit', onclick: () => openEditModal(r, rerender) },
          { label: 'نیامد', onclick: () => openNoShowModal(r, rerender) },
          { label: 'انصراف خانواده', onclick: () => openCancelModal(r, rerender) },
          { sep: true },
          { label: 'حذف کامل', danger: true, onclick: () => openDeleteModal(r, rerender) }
        ] })
      );
    } else if (r.status === 'admitted') {
      // پذیرفته‌شده‌ها از لیست پاک می‌شوند؛ این شاخه فقط برای ردیف‌های گذرا دیده می‌شود
      wrap.append(
        el('span', { class: 'muted', style: { fontSize: '12px' } }, 'پذیرش نهایی — پرونده فعال در «دانش‌آموزان»')
      );
    } else {
      // rejected / no_show / cancelled — خروج‌های قابل بازگشت
      wrap.append(
        el('button', { class: 'btn btn--ghost btn--sm', title: 'بازگشت به صف انتظار', onclick: () => openReopenModal(r, rerender) }, icon('undo', 14), 'بازگشت به صف'),
        rowMenu({ items: [
          { label: 'ویرایش اطلاعات', icon: 'edit', onclick: () => openEditModal(r, rerender) },
          { sep: true },
          { label: 'حذف کامل', danger: true, onclick: () => openDeleteModal(r, rerender) }
        ] })
      );
    }
    return wrap;
  }

  await renderList();
}

// ─────────────── نمای ماژول مستقل «لیست انتظار» (#/waitlist) ───────────────

/** صفحهٔ کامل ماژول لیست انتظار — سربرگ + بدنه (q/prefill از query مسیر) */
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

// ─────────────── ویجت بورد منشی + badge ───────────────

/** شمارنده‌ها برای بورد/منو — یک درخواست سبک */
export async function fetchWaitlistBadge() {
  try {
    const res = await api.get('/api/waitlist/badge');
    return res.data ?? { overdue: 0, urgent: 0, waiting: 0 };
  } catch {
    return { overdue: 0, urgent: 0, waiting: 0 };
  }
}

/** کارت کوچک «لیست انتظار» برای گوشهٔ بورد روز کاری — کلیک: مودال فهرست کامل */
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
          ? el('p', { class: 'muted' }, 'ورودی بازی نیست')
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
