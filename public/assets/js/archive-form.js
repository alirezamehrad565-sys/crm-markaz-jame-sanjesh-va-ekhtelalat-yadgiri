/**
 * فرم بایگانی و صندوق خروجی
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// archive-form.js — فرم مستقل «دانش‌آموز آرشیو» + پنجرهٔ «تاریخچهٔ تحصیلی»
// به دستور کاربر:
// * «اضافه کردن دانش آموز به ارشیو مشکل داره اول کاری کن که کد ملی اجباری نباشه اونجا
// و فرم نباید عین فرم اضافه کردن دانش آموز فعال باشه»
// * «دانش آموز از سال های قبل اومده باید یه حالت تاریخچه تحصیلی داشته باشه که کجا
// درس خونده دانش اموز سطحش اون سال چی بوده توضیحات — یه فرمی که بشه هی اطلاعات
// سال اضافه کرد»
// تفاوت‌های فرم آرشیو با فرم دانش‌آموز فعال (student-form.js):
// - کد ملی اختیاری است (بدون کد ملی → سرور نگه‌دارندهٔ یکتای «NAS-…» می‌گذارد؛
// بعداً از همان فرم ویرایش قابل ثبت واقعی است)
// - تلفن ولیّ اختیاری است؛ کلاسِ جاری حذف شده (دانش‌آموز سال‌های قبل)
// - پس از ساخت پرونده، پنجرهٔ «تاریخچهٔ تحصیلی» بلافاصله باز می‌شود تا سال‌به‌سال
// سابقه ثبت شود (مدرسه/سطح/توضیحات هر سال)

import { api } from './api.js';
import { el, openModal, formModal, confirmModal, toast, toastError, loadingState, emptyState, icon } from './ui.js';
import { STUDENT_GRADES, isPlaceholderNid, fa } from './format.js';
import { session } from './state.js';
import { ensureFormMeta, normalizePhone } from './student-form.js';

/** دفتر (منشی/مدیر) — ثبت/حذف تاریخچه و تعیین مسئول پرونده */
function isOffice() {
  return session.user?.role === 'manager' || session.user?.role === 'secretary';
}

/**
 * فرم «دانش‌آموز آرشیو» — تعریف جدید یا ویرایش پروندهٔ آرشیو.
 * options:
 * student — پروندهٔ موجود برای ویرایش (null = تعریف جدید)
 * onSaved — پس از ذخیره ({ id, student }) — student فقط در تعریف جدید پر است
 */
export async function openArchiveStudentForm({ student = null, onSaved } = {}) {
  const meta = await ensureFormMeta();
  const isEdit = Boolean(student);

  formModal({
    title: isEdit ? 'ویرایش پروندهٔ آرشیو' : 'دانش‌آموز جدید در آرشیو',
    wide: true,
    submitLabel: isEdit ? 'ذخیره' : 'ثبت در آرشیو',
    fields: [
      student
        ? isPlaceholderNid(student.nationalId)
          ? { name: 'national_id', label: 'کد ملی (ثبت نشده — اختیاری)', ltr: true, hint: 'اگر بعداً کد ملی را از خانواده گرفتید همین‌جا ثبت کنید — پس از ثبت قابل تغییر نیست', placeholder: '0012345679' }
          : { name: '_nid', label: 'کد ملی (غیرقابل تغییر)', ltr: true, value: student.nationalId, hint: 'برای تغییر کد ملی با مدیر سامانه تماس بگیرید' }
        : { name: 'national_id', label: 'کد ملی (اختیاری)', ltr: true, hint: 'برای پروندهٔ سال‌های قبل می‌تواند خالی بماند — بعداً هم قابل ثبت است', placeholder: '0012345679' },
      { name: 'first_name', label: 'نام', required: true, value: student?.firstName },
      { name: 'last_name', label: 'نام خانوادگی', required: true, value: student?.lastName },
      { name: 'birth_date', label: 'تاریخ تولد', type: 'jalali-date', value: student?.birthDate, hint: 'اختیاری — از تقویم انتخاب کنید' },
      {
        name: 'gender', label: 'جنسیت', type: 'select',
        options: [{ value: 'male', label: 'پسر' }, { value: 'female', label: 'دختر' }],
        value: student?.gender ?? ''
      },
      {
        // سطح/پایهٔ فعلی — برای پروندهٔ سال‌های قبل می‌تواند خالی بماند؛
        // سابقهٔ سال‌های قبل در «تاریخچهٔ تحصیلی» ثبت می‌شود
        name: 'grade', label: 'سطح/پایهٔ فعلی', type: 'select',
        placeholder: 'بدون پایه',
        options: STUDENT_GRADES.map((g) => ({ value: g, label: g })),
        value: student?.grade ?? ''
      },
      {
        name: 'school_id', label: 'مدرسه (سرچ‌دار)', type: 'searchable-select',
        placeholder: 'نام مدرسه را جستجو کنید… (اختیاری)',
        options: meta.schools.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name })),
        value: student?.schoolId ?? ''
      },
      { name: 'guardian_name', label: 'نام ولی (اختیاری)', value: student?.guardianName },
      {
        name: 'guardian_phone', label: 'تلفن ولی (اختیاری)',
        type: 'tel', ltr: true, value: student?.guardianPhone,
        hint: 'اگر بعداً پرونده فعال شود و ولیّ بات را متصل کند، یادآوری‌ها به همین شماره می‌رسد',
        placeholder: '09123456789'
      },
      ...(isOffice() ? [
        {
          name: 'owner_staff_id', label: 'مسئول پرونده', type: 'select', span: 2,
          placeholder: '— (اختیاری)',
          options: meta.staff.map((s) => ({ value: s.id, label: `${s.fullName ?? s.full_name ?? ''}`.trim() || s.id })),
          value: student?.ownerStaffId ?? '',
          hint: 'اگر بعداً پرونده به چرخهٔ مرکز برگردد، به «لیست دانش‌آموزهای» این همکار می‌رود'
        }
      ] : [])
    ],
    onSubmit: async (values) => {
      // تلفن اختیاری است — ولی اگر پر شده باید معتبر باشد
      let phone = '';
      if (values.guardian_phone) {
        phone = normalizePhone(values.guardian_phone);
        if (!/^09\d{9}$/.test(phone)) {
          throw new Error('شماره موبایل ولیّ معتبر نیست — باید ۱۱ رقم و با ۰۹ شروع شود (یا خالی بماند)');
        }
      }

      let savedStudent = null;
      if (student) {
        const res = await api.patch(`/api/students/${student.id}`, {
          first_name: values.first_name,
          last_name: values.last_name,
          birth_date: values.birth_date || undefined,
          gender: values.gender || undefined,
          grade: values.grade || undefined,
          school_id: values.school_id || null,
          guardian_name: values.guardian_name || undefined,
          guardian_phone: phone || undefined,
          // ثبت کد ملی پروندهٔ نگه‌دارنده‌دار (فقط وقتی فیلد پر شده باشد)
          ...(isPlaceholderNid(student.nationalId) && values.national_id ? { national_id: values.national_id } : {})
        });
        savedStudent = res.data ?? student;
        if (isOffice() && values.owner_staff_id !== undefined && (values.owner_staff_id || null) !== (student.ownerStaffId ?? null)) {
          await api.patch(`/api/students/${student.id}/owner`, { owner_staff_id: values.owner_staff_id || null });
        }
        toast('تغییرات پروندهٔ آرشیو ذخیره شد', 'success');
      } else {
        const res = await api.post('/api/students', {
          // کد ملی اختیاری — خالی = سرور نگه‌دارندهٔ یکتای «NAS-…» می‌گذارد
          ...(values.national_id ? { national_id: values.national_id } : {}),
          first_name: values.first_name,
          last_name: values.last_name,
          birth_date: values.birth_date || undefined,
          gender: values.gender || undefined,
          grade: values.grade || undefined,
          school_id: values.school_id || undefined,
          guardian_name: values.guardian_name || undefined,
          guardian_phone: phone || undefined,
          owner_staff_id: isOffice() ? (values.owner_staff_id || undefined) : undefined,
          archived: true
        });
        savedStudent = res.data;
        toast('دانش‌آموز در آرشیو ثبت شد — حالا سابقهٔ تحصیلی سال‌های قبل را اضافه کنید', 'success');
      }
      onSaved?.({ id: savedStudent?.id ?? student?.id, student: savedStudent });
    }
  });
}

/**
 * پنجرهٔ «تاریخچهٔ تحصیلی» — سابقهٔ سال‌به‌سال: کجا درس خوانده، سطح همان سال، توضیحات.
 * دفتر (منشی/مدیر) می‌تواند پشت‌سرهم سال اضافه/حذف کند؛ بقیه فقط می‌بینند.
 * options:
 * student — پرونده (id/firstName/lastName لازم است)
 * onChanged — پس از هر افزودن/حذف (اختیاری)
 */
export function openEducationHistory(student, { onChanged } = {}) {
  const canEdit = isOffice();
  const listWrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } });
  let entries = [];

  async function reload() {
    listWrap.replaceChildren(loadingState());
    try {
      const res = await api.get(`/api/students/${student.id}/education-history`);
      entries = res.data ?? [];
      paint();
    } catch (err) {
      listWrap.replaceChildren(emptyState({ iconName: 'alert', title: 'خطا در بارگذاری تاریخچه', hint: err.message }));
    }
  }

  function paint() {
    if (entries.length === 0) {
      listWrap.replaceChildren(
        emptyState({
          iconName: 'school',
          title: 'سابقه‌ای ثبت نشده',
          hint: canEdit
            ? 'سال‌های تحصیلی قبلی دانش‌آموز را از فرم پایین اضافه کنید — هر سال: کجا درس خوانده، سطحش چه بوده و توضیحات.'
            : 'هنوز سابقهٔ تحصیلی برای این دانش‌آموز ثبت نشده است.'
        })
      );
      return;
    }
    listWrap.replaceChildren(...entries.map((h) => {
      const actions = el('div', { style: { display: 'flex', gap: 'var(--sp-1)', alignItems: 'center' } });
      if (canEdit) {
        actions.appendChild(el('button', {
          class: 'btn btn--ghost btn--sm', title: 'حذف این سال',
          onclick: async () => {
            if (!(await confirmModal({
              title: 'حذف سابقهٔ تحصیلی',
              message: `سابقهٔ سال «${h.studyYear}» از تاریخچه حذف می‌شود — برگشت ندارد.`,
              confirmLabel: 'حذف کن', danger: true
            }))) return;
            try {
              await api.del(`/api/students/${student.id}/education-history/${h.id}`);
              toast('سابقه حذف شد', 'success');
              await reload();
              onChanged?.();
            } catch (err) { toastError(err); }
          }
        }, icon('trash', 15)));
      }
      return el('div', {
        class: 'card',
        style: { border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-3)' }
      },
        el('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)', justifyContent: 'space-between' } },
          el('div', { style: { flex: 1, minWidth: 0 } },
            el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
              el('span', { class: 'badge badge--accent' }, h.studyYear),
              h.level ? el('span', { class: 'cell-main' }, `سطح: ${h.level}`) : null
            ),
            h.schoolName ? el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, `مدرسه/آموزشگاه: ${h.schoolName}`) : null,
            h.notes ? el('div', { class: 'cell-sub', style: { marginTop: '4px', whiteSpace: 'pre-wrap' } }, h.notes) : null,
            el('div', { class: 'cell-sub', style: { marginTop: '6px', fontSize: '12px' } },
              h.createdByName ? `ثبت: ${h.createdByName} — ` : '', fa((h.createdAt || '').slice(0, 10)))
          ),
          actions
        )
      );
    }));
  }

  // ─── فرم «افزودن سال» — فقط دفتر ───
  let addBlock = null;
  if (canEdit) {
    const yearIn = el('input', { class: 'input', placeholder: 'مثلاً ۱۴۰۲–۱۴۰۳', maxlength: '20', autocomplete: 'off' });
    const schoolIn = el('input', { class: 'input', placeholder: 'مثلاً دبستان شهید مطهری', maxlength: '200', autocomplete: 'off' });
    const levelIn = el('input', { class: 'input', placeholder: 'مثلاً سوم ابتدایی / پیش‌دبستانی', maxlength: '100', autocomplete: 'off' });
    const notesIn = el('textarea', { class: 'textarea', rows: '2', placeholder: 'توضیحات همان سال — اختیاری (مثلاً «نیم‌سال اول دبستان غیردولتی بود»)', maxlength: '1000' });

    const submitBtn = el('button', { class: 'btn btn--primary btn--sm' }, icon('plus', 15), 'افزودن به تاریخچه');
    submitBtn.addEventListener('click', async () => {
      const study_year = yearIn.value.trim();
      if (!study_year) {
        yearIn.classList.add('is-invalid');
        toast('«سال تحصیلی» را بنویسید', 'warning');
        yearIn.focus();
        return;
      }
      yearIn.classList.remove('is-invalid');
      submitBtn.disabled = true;
      try {
        await api.post(`/api/students/${student.id}/education-history`, {
          study_year,
          school_name: schoolIn.value.trim() || undefined,
          level: levelIn.value.trim() || undefined,
          notes: notesIn.value.trim() || undefined
        });
        toast('سال به تاریخچه اضافه شد', 'success');
        yearIn.value = ''; schoolIn.value = ''; levelIn.value = ''; notesIn.value = '';
        await reload();
        onChanged?.();
        yearIn.focus(); // برای ثبت پشت‌سرهم سال‌ها
      } catch (err) {
        toastError(err);
      }
      submitBtn.disabled = false;
    });

    addBlock = el('div', {
      class: 'card',
      style: { border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-3)', background: 'var(--surface-2)' }
    },
      el('div', { class: 'card__title', style: { marginBottom: 'var(--sp-2)', fontSize: '14px' } }, 'افزودن سال تحصیلی'),
      el('div', { class: 'form-grid', style: { gap: 'var(--sp-2)' } },
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'سال تحصیلی', el('span', { class: 'req' }, ' *')), yearIn),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'مدرسه/آموزشگاه'), schoolIn),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'سطح/پایهٔ همان سال'), levelIn),
        el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'توضیحات'), notesIn)
      ),
      el('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-2)' } }, submitBtn)
    );
  }

  openModal({
    title: `تاریخچهٔ تحصیلی — ${student.firstName} ${student.lastName}`,
    wide: true,
    body: [listWrap, addBlock].filter(Boolean),
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'بستن')
    ]
  });

  reload();
}
