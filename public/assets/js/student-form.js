/**
 * فرم افزودن/ویرایش دانش‌آموز
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// student-form.js — فرم مشترک تعریف/ویرایش دانش‌آموز
// مصرف‌کنندگان: views/students.js (چرخهٔ فعال) + views/archive.js (آرشیو — دیتابیس شهر)
// به دستور کاربر:
// * «مسئول پرونده» همین‌جا در لحظهٔ تعریف به یکی از همکاران سپرده می‌شود
// (دیگر نیاز به ثبت مجدد و ویرایش دوباره در پروفایل نیست)
// * حالت آرشیو: پرونده با active=0 ساخته می‌شود (دیتابیس دانش‌آموزان نیاز ویژهٔ شهر)
// * تیک «منتظر دریافت خدمت» حذف شد — لیست انتظار ماژول مستقل شد (#/waitlist)

import { api } from './api.js';
import { el, formModal, toast, toastError } from './ui.js';
import { STUDENT_GRADES, isPlaceholderNid } from './format.js';
import { STUDENT_PATHWAYS } from './session-type.js'; // — مسیر پرونده
import { session } from './state.js';

// ─────────────── فرادادهٔ فرم (مدارس/کلاس‌ها/همکاران) ───────────────

let metaCache = null;
/** — بین فرم دانش‌آموز فعال و فرم آرشیو مشترک است */
export async function ensureFormMeta() {
  if (metaCache) return metaCache;
  const [schoolsRes, classesRes, staffRes] = await Promise.allSettled([
    api.get('/api/schools'),
    api.get('/api/classes?active=true'),
    api.get('/api/staff')
  ]);
  metaCache = {
    schools: schoolsRes.status === 'fulfilled' ? schoolsRes.value.data ?? [] : [],
    classes: classesRes.status === 'fulfilled' ? classesRes.value.data ?? [] : [],
    staff: staffRes.status === 'fulfilled' ? (staffRes.value.data ?? []).filter((s) => s.active !== false) : []
  };
  return metaCache;
}

/** دفتر (منشی/مدیر) می‌تواند مسئول پرونده را تعیین کند — endpoint سرور هم همان RBAC را دارد */
function canAssignOwner() {
  return session.user?.role === 'manager' || session.user?.role === 'secretary';
}

/**
 * فرم دانش‌آموز — تعریف جدید یا ویرایش.
 * options:
 * student — پروندهٔ موجود برای ویرایش (null = تعریف جدید)
 * archived — تعریف در آرشیو (active=0 — دیتابیس شهر)
 * onSaved — پس از ذخیرهٔ موفق (پروندهٔ ذخیره‌شده پاس داده می‌شود)
 */
export async function openStudentForm({ student = null, archived = false, onSaved } = {}) {
  const meta = await ensureFormMeta();
  const isEdit = Boolean(student);
  const isOffice = canAssignOwner();
  // درمانگر: «دانش‌آموز فعال برای خودش» — مسئول پرونده همیشه خودش (سرور هم اجبار می‌کند)
  const isTherapist = session.user?.role === 'therapist';

  formModal({
    title: isEdit
      ? 'ویرایش دانش‌آموز'
      : archived
        ? 'دانش‌آموز جدید در آرشیو'
        : isTherapist
          ? 'دانش‌آموز جدید — به فهرست من اضافه می‌شود'
          : 'دانش‌آموز جدید',
    wide: true,
    fields: [
      student
        ? // — پروندهٔ نگه‌دارنده‌دار (NAS-…) = «بدون کد ملی» — ثبت واقعی همین‌جا ممکن است
          isPlaceholderNid(student.nationalId)
          ? { name: 'national_id', label: 'کد ملی (ثبت نشده — اختیاری)', ltr: true, hint: 'اگر کد ملی را از خانواده گرفتید این‌جا ثبت کنید — بعد از ثبت قابل تغییر نیست', placeholder: '0012345679' }
          : { name: '_nid', label: 'کد ملی (غیرقابل تغییر)', ltr: true, value: student.nationalId, hint: 'برای تغییر کد ملی با مدیر سامانه تماس بگیرید' }
        : { name: 'national_id', label: 'کد ملی', required: true, ltr: true, hint: 'کد ۱۰ رقمی معتبر — checksum بررسی می‌شود', placeholder: '0012345679' },
      { name: 'first_name', label: 'نام', required: true, value: student?.firstName },
      { name: 'last_name', label: 'نام خانوادگی', required: true, value: student?.lastName },
      { name: 'birth_date', label: 'تاریخ تولد', type: 'jalali-date', value: student?.birthDate, hint: 'اختیاری — از تقویم انتخاب کنید' },
      {
        name: 'gender', label: 'جنسیت', type: 'select',
        options: [{ value: 'male', label: 'پسر' }, { value: 'female', label: 'دختر' }],
        value: student?.gender ?? ''
      },
      {
        // پایه تحصیلی هاردکد (آموزش‌وپرورش: تا ششم ابتدایی)
        name: 'grade', label: 'پایه تحصیلی', type: 'select',
        placeholder: 'بدون پایه',
        options: STUDENT_GRADES.map((g) => ({ value: g, label: g })),
        value: student?.grade ?? ''
      },
      {
        // دراپ‌داون سرچ‌دار — با ۴۰+ مدرسه انتخاب با تایپ انجام می‌شود
        name: 'school_id', label: 'مدرسه (سرچ‌دار)', type: 'searchable-select',
        placeholder: 'نام مدرسه را جستجو کنید…',
        options: meta.schools.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name })),
        value: student?.schoolId ?? ''
      },
      {
        name: 'class_id', label: 'کلاس مدرسه', type: 'select',
        placeholder: 'اول مدرسه را انتخاب کنید…',
        options: [],
        value: student?.classId ?? '',
        hint: 'کلاس‌ها در بخش «مدارس» تعریف می‌شوند — اعلان نوبت به معلم کلاس هم ارسال می‌شود'
      },
      { name: 'guardian_name', label: 'نام ولی', value: student?.guardianName },
      {
        name: 'guardian_relation', label: 'نسبت', type: 'select',
        placeholder: '—',
        options: [{ value: 'father', label: 'پدر' }, { value: 'mother', label: 'مادر' }, { value: 'other', label: 'سایر' }],
        value: student?.guardianRelation ?? ''
      },
      {
        name: 'guardian_phone', label: isTherapist && !isEdit ? 'تلفن ولی (اجباری — بعداً برای بات/یادآوری وصل می‌شود)' : 'تلفن ولی (بله/یادآوری‌ها به همین شماره متصل می‌شود)',
        type: 'tel', ltr: true, required: true, value: student?.guardianPhone, span: 2,
        hint: 'موبایل ۱۱ رقمی — مثل ۰۹۱۲۳۴۵۶۷۸۹. برای دریافت اعلان بات، ولیّ با /link CODE بات را متصل می‌کند.',
        placeholder: '09123456789'
      },
      // ─── مسئول پرونده در لحظهٔ تعریف ───
      ...(isOffice ? [
        {
          name: 'owner_staff_id', label: 'مسئول پرونده', type: 'select', span: 2,
          placeholder: archived ? '— (اختیاری)' : '— می‌توانید بعداً هم تغییر دهید',
          options: meta.staff.map((s) => ({ value: s.id, label: `${s.fullName ?? s.full_name ?? ''}`.trim() || s.id })),
          value: student?.ownerStaffId ?? '',
          hint: 'پرونده به این همکار سپرده می‌شود و در «لیست دانش‌آموزهای» او نمایش داده می‌شود — درمانگرِ نوبت اول هم به‌طور خودکار مسئول می‌شود.'
        }
      ] : []),
      // ─── مسیر پرونده (موتور مسیر تفسیر بالینی) — در پذیرش تعیین، بعداً قابل تغییر ───
      {
        name: 'pathway', label: 'مسیر پرونده', type: 'select', span: 2,
        placeholder: '— هنوز تعیین نشده (تفسیر پیش‌فرض: مسیر یادگیری)',
        options: STUDENT_PATHWAYS.map((p) => ({ value: p.key, label: p.label })),
        value: student?.pathway ?? '',
        hint: 'مسیر اختلال یادگیری یا مسیر توانبخشی ذهنی-جسمی — تب «تفسیر بالینی» و فرم‌های پیشنهادی بر همین اساس شاخه می‌خورد؛ از پروفایل هم قابل تغییر است.'
      }
    ],
    onSubmit: async (values) => {
      // اعتبارسنجی موبایل ولیّ — ارقام فارسی هم پذیرفته می‌شود
      const phone = normalizePhone(values.guardian_phone);
      if (!/^09\d{9}$/.test(phone)) {
        throw new Error('شماره موبایل ولیّ معتبر نیست — باید ۱۱ رقم و با ۰۹ شروع شود');
      }
      let savedId = student?.id;
      if (student) {
        await api.patch(`/api/students/${student.id}`, {
          first_name: values.first_name,
          last_name: values.last_name,
          birth_date: values.birth_date || undefined,
          gender: values.gender || undefined,
          grade: values.grade || undefined,
          school_id: values.school_id || null,
          class_id: values.class_id || null,
          guardian_name: values.guardian_name || undefined,
          guardian_relation: values.guardian_relation || undefined,
          guardian_phone: phone,
          // ثبت کد ملی پروندهٔ نگه‌دارنده‌دار (فقط وقتی فیلد واقعاً پر شده باشد)
          ...(isPlaceholderNid(student.nationalId) && values.national_id ? { national_id: values.national_id } : {})
        });
        // تغییر مسئول پرونده در همان فرم (endpoint اختصاصی با audit خودش)
        if (isOffice && values.owner_staff_id !== undefined && (values.owner_staff_id || null) !== (student.ownerStaffId ?? null)) {
          await api.patch(`/api/students/${student.id}/owner`, { owner_staff_id: values.owner_staff_id || null });
        }
        // تغییر مسیر پرونده از همان فرم (endpoint اختصاصی با audit خودش)
        if ((values.pathway || null) !== (student.pathway ?? null)) {
          await api.patch(`/api/students/${student.id}/pathway`, { pathway: values.pathway || null });
        }
        toast('تغییرات ذخیره شد', 'success');
      } else {
        const created = await api.post('/api/students', {
          national_id: values.national_id,
          first_name: values.first_name,
          last_name: values.last_name,
          birth_date: values.birth_date || undefined,
          gender: values.gender || undefined,
          grade: values.grade || undefined,
          school_id: values.school_id || undefined,
          class_id: values.class_id || undefined,
          guardian_name: values.guardian_name || undefined,
          guardian_relation: values.guardian_relation || undefined,
          guardian_phone: phone,
          // / — مسئول پرونده در لحظهٔ تعریف؛ درمانگر اجباراً خودش
          owner_staff_id: isOffice ? (values.owner_staff_id || undefined) : (isTherapist ? session.user.staffId : undefined),
          archived: archived || undefined,
          // مسیر پرونده در لحظهٔ تعریف (پذیرش)
          pathway: values.pathway || undefined
        });
        savedId = created.data?.id;
        toast(isTherapist ? 'دانش‌آموز اضافه شد — مسئول پرونده: خود شما' : 'دانش‌آموز اضافه شد', 'success');
      }
      onSaved?.({ id: savedId, student });
    }
  });

  // cascade کلاس بر اساس مدرسه انتخابی — مدرسه کمبوباکس سرچ‌دار است (input hidden)
  setTimeout(() => {
    const form = document.querySelector('.modal .form-grid');
    if (!form) return;
    const schoolSel = form.querySelector('select[name="school_id"], input[type="hidden"][name="school_id"]');
    const classSel = form.querySelector('select[name="class_id"]');
    if (!schoolSel || !classSel) return;

    const refill = () => {
      const sid = schoolSel.value;
      const list = meta.classes.filter((c) => c.schoolId === sid);
      const prev = classSel.value;
      classSel.replaceChildren(
        el('option', { value: '' }, list.length === 0 ? 'کلاسی ثبت نشده' : 'بدون کلاس'),
        ...list.map((c) => el('option', { value: c.id }, c.teacherName ? `${c.name} — ${c.teacherName}` : c.name))
      );
      // حفظ انتخاب قبلی اگر هنوز معتبر است
      if (prev && list.some((c) => c.id === prev)) classSel.value = prev;
    };

    schoolSel.addEventListener('change', refill);
    // پیش‌فرض: کلاس‌های مدرسه فعلی دانش‌آموز
    const initialSchool = student?.schoolId ?? '';
    if (initialSchool) {
      schoolSel.value = initialSchool;
    }
    refill();
    if (student?.classId) classSel.value = student.classId;
  }, 50);
}

/** نرمال‌سازی شماره: ارقام فارسی → لاتین، حذف فاصله و خط تیره و +۹۸ */
export function normalizePhone(raw) {
  let v = String(raw || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[\s-().]/g, '');
  if (v.startsWith('+98')) v = '0' + v.slice(3);
  else if (v.startsWith('98') && v.length === 12) v = '0' + v.slice(2);
  return v;
}

/** پاک‌سازی کش فراداده — بعد از عملیات مدارس/کارکنان صدا زده می‌شود */
export function invalidateStudentFormMeta() {
  metaCache = null;
}
