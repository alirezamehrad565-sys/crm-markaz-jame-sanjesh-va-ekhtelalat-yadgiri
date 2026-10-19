/**
 * نمای مدارس و کلاس‌ها
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// views/schools.js — مدیریت مدارس و مهدکودک‌ها + کلاس‌ها با معلم
// — جستجوی زندهٔ مدارس (نام/کد/مدیر/تلفن/نشانی) و کلاس‌ها (نام/معلم/تلفن) —
// فیلتر سمت کلاینت؛ فهرست مدارس کوچک است و درخواست سروری لازم ندارد.

import { api, qs } from '../api.js';
import { session } from '../state.js';
import { fa, enDigits } from '../format.js';
import { el, icon, formModal, confirmModal, openModal, toast, toastError, dataTable, statusBadge, loadingState, skeletonState, emptyState, callBadge } from '../ui.js';
import { invalidateStudentFormMeta } from '../student-form.js'; // — کش فرم دانش‌آموز بعد از هر تغییر مدارس/کلاس تازه شود
import { resolveBotUsername, buildBotLink, botLinkBox } from '../bot-link.js'; // — لینک احراز خودکار بات

let showInactive = false;

/** — غیرفعال‌سازی مدرسه/کلاس فقط مدیر (سرور هم ۴۰۳ می‌دهد) */
function canDeactivate() {
  return session.user?.role === 'manager';
}

/** — نرمال‌سازی برای جستجو: رقم فارسی/عربی → لاتین، حروف عربی → فارسی، بدون حساسیت به ی/ك */
function searchable(text) {
  return enDigits(String(text ?? ''))
    .toLowerCase()
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ');
}

/** — آیا ردیف با عبارت جستجو مطابق است؟ (همهٔ فیلدها به یک رشته چسبانده می‌شوند) */
function matchesQuery(rowFields, query) {
  const q = searchable(query).trim();
  if (!q) return true;
  return searchable(rowFields.join(' ')).includes(q);
}

export async function renderSchools(container) {
  container.replaceChildren(skeletonState('table', 5));

  let rows;
  try {
    rows = (await api.get(`/api/schools${showInactive ? '' : '?active=true'}`)).data;
  } catch (err) {
    container.replaceChildren(emptyState({ iconName: 'alert', title: 'خطا در بارگذاری', hint: err.message }));
    return;
  }

  // — جستجوی زندهٔ مدارس — فقط جدول دوباره رسم می‌شود؛ فوکوس ورودی نمی‌پرد
  const searchInput = el('input', {
    class: 'input', type: 'search',
    placeholder: 'جستجو: نام، کد، مدیر یا تلفن…',
    style: { minWidth: '180px', flex: '1 1 200px', maxWidth: '320px' }
  });
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(drawTable, 200);
  });

  const toolbar = el('div', { class: 'toolbar' },
    searchInput,
    el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-sm)', color: 'var(--text-2)', cursor: 'pointer' } },
      (() => {
        const cb = el('input', { type: 'checkbox', onchange: (e) => { showInactive = e.target.checked; renderSchools(container); } });
        cb.checked = showInactive;
        cb.style.accentColor = 'var(--primary)';
        return cb;
      })(),
      'نمایش غیرفعال‌ها'
    ),
    el('div', { class: 'spacer' }),
    // — دکمهٔ «لینک معلم‌ها» حذف شد (بی‌کاربرد؛ مدیریت کد اتصال از «کلاس‌ها و معلم‌ها»ی هر مدرسه انجام می‌شود)
    el('button', { class: 'btn btn--primary btn--sm', onclick: () => openForm(null, container) }, icon('plus', 16), 'مدرسه جدید')
  );

  const schoolColumns = [
      {
        key: 'name', label: 'نام',
        render: (s) => el('div', {},
          el('div', { class: 'cell-main' }, s.name),
          // — کد رسمی مدرسه زیر نام (برای شناسایی سریع در نظام)
          s.code ? el('div', { class: 'cell-sub', dir: 'ltr' }, fa(s.code)) : null,
          s.address ? el('div', { class: 'cell-sub' }, s.address) : null
        )
      },
      { key: 'kind', label: 'نوع', render: (s) => statusBadge(s.kind) },
      {
        key: 'principal', label: 'مدیر',
        render: (s) => s.principalName
          ? el('div', {},
              el('div', { class: 'cell-main' }, s.principalName),
              // — باجت تماس سریع (الگوی روز کاری) کنار شمارهٔ مدیر
              s.principalPhone
                ? el('div', { class: 'cell-sub cell-phone' },
                    el('span', { dir: 'ltr' }, fa(s.principalPhone)),
                    callBadge(s.principalPhone, `تماس با مدیر «${s.principalName}» مدرسه ${s.name} — ${fa(s.principalPhone)}`))
                : null
            )
          : el('span', { class: 'cell-sub' }, '—')
      },
      { key: 'phone', label: 'تلفن', render: (s) => s.phone
        ? el('span', { class: 'cell-phone' },
            el('span', { dir: 'ltr' }, fa(s.phone)),
            callBadge(s.phone, `تماس با مدرسه ${s.name} — ${fa(s.phone)}`))
        : el('span', { class: 'cell-sub' }, '—') },
      { key: 'active', label: 'وضعیت', render: (s) => statusBadge(s.active ? 'active' : 'inactive') },
      {
        key: 'actions', label: 'عملیات', align: 'end',
        render: (s) => el('div', { class: 'cell-actions' },
          el('button', { class: 'btn btn--ghost btn--sm', title: 'وضعیت همکاری', onclick: () => openSchoolOverview(s) }, icon('zap', 15)),
          el('button', { class: 'btn btn--ghost btn--sm', title: 'کلاس‌ها و معلم‌ها', onclick: () => openClassManager(s, container) }, icon('student', 15)),
          el('button', { class: 'btn btn--ghost btn--sm', title: 'ویرایش', onclick: () => openForm(s, container) }, icon('edit', 15)),
          s.active && canDeactivate()
            ? el('button', {
                class: 'btn btn--danger btn--sm', title: 'غیرفعال‌سازی',
                onclick: async () => {
                  if (!(await confirmModal({ title: 'غیرفعال‌سازی مدرسه', message: `«${s.name}» از انتخاب‌ها حذف می‌شود (اطلاعات حفظ می‌شود).`, confirmLabel: 'غیرفعال کن', danger: true }))) return;
                  try {
                    await api.post(`/api/schools/${s.id}/deactivate`);
                    invalidateStudentFormMeta();
                    toast('مدرسه غیرفعال شد', 'success');
                    renderSchools(container);
                  } catch (err) { toastError(err); }
                }
              }, icon('x', 15))
            : null,
          // — حذف کامل مدرسهٔ ثبت‌شدهٔ اشتباه (فقط اگر خالی باشد — سرور گارد می‌گذارد)
          canDeactivate()
            ? el('button', {
                class: 'btn btn--danger btn--sm', title: 'حذف کامل — فقط اگر دانش‌آموز/کلاس نداشته باشد',
                onclick: async () => {
                  if (!(await confirmModal({ title: 'حذف کامل مدرسه', message: `«${s.name}» به‌کلی پاک می‌شود — برای ثبت‌های اشتباه یا تکراری. اگر دانش‌آموز یا کلاس دارد حذف ممکن نیست (پیام سرور راهنمایی می‌کند). برگشت ندارد.`, confirmLabel: 'حذف کن', danger: true }))) return;
                  try {
                    await api.del(`/api/schools/${s.id}`);
                    toast('مدرسه حذف شد', 'success');
                    renderSchools(container);
                  } catch (err) { toastError(err); }
                }
              }, icon('trash', 15))
            : null
        )
      }
    ];

  const tableWrap = el('div');
  const countBadge = el('span', { class: 'badge badge--neutral' }, `${fa(rows.length)} مورد`);

  function drawTable() {
    const q = searchInput.value.trim();
    const filtered = rows.filter((s) => matchesQuery(
      [s.name, s.code, s.principalName, s.principalPhone, s.phone, s.address, s.kind], q
    ));
    countBadge.textContent = q
      ? `${fa(filtered.length)} از ${fa(rows.length)} مورد`
      : `${fa(rows.length)} مورد`;
    const hasQuery = q.length > 0;
    tableWrap.replaceChildren(dataTable({
      columns: schoolColumns,
      rows: filtered,
      empty: hasQuery
        ? {
            iconName: 'search',
            title: 'موردی مطابق جستجو پیدا نشد',
            hint: 'بخشی از نام، کد مدرسه، نام مدیر یا شماره تلفن را امتحان کنید.'
          }
        : {
            iconName: 'school',
            title: 'هنوز مدرسه‌ای ثبت نشده',
            hint: 'مدارس و مهدکودک‌هایی را که با آن‌ها کار می‌کنید اضافه کنید.',
            actionLabel: 'مدرسه جدید',
            onAction: () => openForm(null, container)
          }
    }));
  }
  drawTable();

  container.replaceChildren(
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'مدارس'),
      countBadge
    ),
    toolbar,
    el('div', { class: 'card card__body--flush', style: { boxShadow: 'var(--shadow-1)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' } }, tableWrap)
  );
}

function openForm(school, container) {
  formModal({
    title: school ? 'ویرایش مدرسه' : 'مدرسه جدید',
    wide: true,
    fields: [
      { name: 'name', label: 'نام مدرسه', required: true, span: 2, value: school?.name },
      {
        name: 'kind', label: 'نوع', type: 'select', required: true,
        options: [{ value: 'school', label: 'مدرسه' }, { value: 'kindergarten', label: 'مهدکودک' }],
        value: school?.kind ?? 'school'
      },
      {
        name: 'gender_type', label: 'جنسیت', type: 'select',
        options: [{ value: 'mixed', label: 'مختلط' }, { value: 'male', label: 'پسرانه' }, { value: 'female', label: 'دخترانه' }],
        value: school?.genderType ?? 'mixed'
      },
      // — کد رسمی مدرسه (نظام) — یکتا؛ برای جستجو هم به‌کار می‌رود
      { name: 'code', label: 'کد مدرسه', type: 'tel', ltr: true, value: school?.code, hint: 'کد یکتا در نظام آموزش‌وپرورش' },
      { name: 'phone', label: 'تلفن', type: 'tel', ltr: true, value: school?.phone },
      { name: 'principal_name', label: 'نام مدیر', value: school?.principalName, hint: 'برای ارتباط مرکز با مدرسه' },
      { name: 'principal_phone', label: 'تلفن مدیر', type: 'tel', ltr: true, value: school?.principalPhone },
      { name: 'address', label: 'نشانی', type: 'textarea', span: 2, value: school?.address },
      { name: 'notes', label: 'یادداشت', type: 'textarea', span: 2, value: school?.notes, hint: 'نکات داده، شماره‌های جایگزین و…' }
    ],
    onSubmit: async (values) => {
      const payload = {
        name: values.name,
        kind: values.kind,
        gender_type: values.gender_type || undefined,
        code: values.code || undefined,
        phone: values.phone || undefined,
        principal_name: values.principal_name || undefined,
        principal_phone: values.principal_phone || undefined,
        address: values.address || undefined,
        notes: values.notes || undefined
      };
      if (school) {
        await api.patch(`/api/schools/${school.id}`, payload);
        invalidateStudentFormMeta();
        toast('تغییرات ذخیره شد', 'success');
      } else {
        await api.post('/api/schools', payload);
        invalidateStudentFormMeta();
        toast('مدرسه اضافه شد', 'success');
      }
      renderSchools(container);
    }
  });
}

// ─────────────── وضعیت همکاری مدرسه (فاز ۷ — §15) ───────────────

/** متریک‌های همکاری + بخش «نیاز به توجه دارد» — بازخواندن از /api/schools/:id/overview */
async function openSchoolOverview(school) {
  const box = openModal({
    title: `وضعیت همکاری — ${school.name}`,
    wide: true,
    body: () => el('div', { style: { minHeight: '160px' } }, loadingState('در حال محاسبه…'))
  });
  const modalBody = box.root.querySelector('.modal__body');

  try {
    const ov = (await api.get(`/api/schools/${school.id}/overview`)).data;
    const m = ov.metrics;
    const trend = m.sessionsLast30 === m.sessionsPrev30 ? 'ثابت' : m.sessionsLast30 > m.sessionsPrev30 ? 'رو به رشد' : 'کاهشی';

    const metric = (label, value, hint) => el('div', { class: 'so-metric' },
      el('div', { class: 'kpi__value' }, fa(value)),
      el('div', { class: 'kpi__label' }, label),
      el('div', { class: 'kpi__hint' }, hint)
    );

    const attentionList = ov.attention.length === 0
      ? el('p', { style: { margin: 0, color: 'var(--text-2)', fontSize: 'var(--fs-sm)' } },
          'در حال حاضر دانش‌آموزی از این مدرسه نیازمند توجه فوری نیست.')
      : el('div', { class: 'sn-attention-list' },
          ...ov.attention.map((a) => el('div', { class: 'sn-attention-item' },
            el('div', { style: { flex: 1, minWidth: 0 } },
              el('div', { class: 'cell-main' }, `${a.firstName} ${a.lastName}`),
              el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' } },
                ...(a.reasons ?? []).map((r) => el('span', { class: 'badge badge--warning' }, REASON_LABELS[r] ?? r))
              )
            ),
            el('button', { class: 'btn btn--soft btn--sm', onclick: () => { box.close(); location.hash = `#/students/${a.id}`; } }, icon('user', 15), 'پروفایل')
          ))
        );

    modalBody.replaceChildren(
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' } },
        el('div', { class: 'so-metrics' },
          metric('دانش‌آموز فعال', m.studentsActive, `پذیرش‌شده ${fa(m.admitted)} · منتظر ${fa(m.waiting)}`),
          metric('کلاس فعال', m.classesActive, `با معلم ${fa(m.classesWithTeacher)} · متصل به بات ${fa(m.classesBotLinked)}`),
          metric('جلسات ۳۰ روز اخیر', m.sessionsLast30, `۳۰ روز قبل: ${fa(m.sessionsPrev30)} — ${trend}`),
          metric('نیازهای ویژه', m.specialNeeds, `نیازمند توجه: ${fa(m.attention)}`)
        ),
        el('div', {},
          el('div', { class: 'card__title', style: { marginBottom: 'var(--sp-2)' } }, 'نیاز به توجه دارد'),
          attentionList
        )
      )
    );
  } catch (err) {
    toastError(err);
    box.close();
  }
}

const REASON_LABELS = {
  overdue_followup: 'پیگیری سررسید گذشته',
  long_open_followup: 'پیگیری باز بیش از ۳۰ روز',
  awaiting_assessment: 'در انتظار ارزیابی',
  no_recent_session: 'بیش از ۳۰ روز جلسه ندارد'
};

// ─────────────── مدیریت کلاس‌ها و معلم‌ها ───────────────

function openClassManager(school, container) {
  let classes = [];
  let classSearch = null; // — ورودی جستجو در body مودال ساخته می‌شود؛ در این اسکوپ نگه داشته می‌شود
  const listBox = el('div', { style: { minHeight: '120px' } }, loadingState('در حال بارگذاری کلاس‌ها…'));
  const countBadge = el('span', { class: 'badge badge--neutral' }, '—');

  const modal = openModal({
    title: `کلاس‌های «${school.name}»`,
    wide: true,
    body: (close) => {
      const addBtn = el('button', { class: 'btn btn--primary btn--sm', onclick: () => openClassForm(school, null, refresh) }, icon('plus', 15), 'کلاس جدید');

      // — جستجوی کلاس‌ها (نام کلاس/معلم/تلفن) — همان فیلتر سمت کلاینت
      classSearch = el('input', {
        class: 'input', type: 'search',
        placeholder: 'جستجوی کلاس یا معلم…',
        style: { flex: '1 1 150px', minWidth: '140px' }
      });
      let searchTimer;
      classSearch.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(drawList, 200);
      });

      const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
        el('p', { style: { margin: 0, color: 'var(--text-2)', fontSize: 'var(--fs-sm)' } },
          'هر کلاس نام معلم و تلفن او را دارد. درمانگرها برای ارسال گزارش و اعلان نوبت با معلم در ارتباط هستند. با «کد اتصال معلم»، معلم با /link CODE بات را متصل می‌کند.'),
        el('div', { class: 'toolbar', style: { marginBottom: 0 } },
          countBadge,
          classSearch,
          el('div', { class: 'spacer' }),
          addBtn
        ),
        listBox
      );
      refresh();
      return wrap;
    }
  });

  async function refresh() {
    try {
      const res = await api.get(`/api/classes${qs({ school_id: school.id })}`);
      classes = res.data;
      countBadge.textContent = `${fa(classes.length)} کلاس`;
      drawList();
    } catch (err) {
      listBox.replaceChildren(emptyState({ iconName: 'alert', title: 'خطا در بارگذاری', hint: err.message }));
    }
  }

  function drawList() {
    if (classes.length === 0) {
      listBox.replaceChildren(emptyState({
        iconName: 'student',
        title: 'هنوز کلاسی تعریف نشده',
        hint: 'کلاس‌های مدرسه را با نام معلم و تلفن اضافه کنید؛ بعداً در فرم دانش‌آموز انتخاب می‌شوند.'
      }));
      return;
    }
    // — فیلتر زنده با عبارت جستجو
    const q = classSearch ? classSearch.value.trim() : '';
    const filtered = classes.filter((c) => matchesQuery(
      [c.name, c.teacherName, c.teacherPhone], q
    ));
    listBox.replaceChildren(
      dataTable({
        columns: [
          {
            key: 'name', label: 'کلاس',
            render: (c) => el('div', {},
              el('div', { class: 'cell-main' }, c.name),
              el('div', { class: 'cell-sub' }, `${fa(c.studentCount ?? 0)} دانش‌آموز`)
            )
          },
          { key: 'teacherName', label: 'معلم', render: (c) => c.teacherName ?? el('span', { class: 'cell-sub' }, '—') },
          // — باجت تماس سریع کنار تلفن معلم
          { key: 'teacherPhone', label: 'تلفن معلم', render: (c) => c.teacherPhone
            ? el('span', { class: 'cell-phone' },
                el('span', { dir: 'ltr' }, fa(c.teacherPhone)),
                callBadge(c.teacherPhone, `تماس با معلم ${c.teacherName ?? 'کلاس ' + c.name} — ${fa(c.teacherPhone)}`))
            : el('span', { class: 'cell-sub' }, '—') },
          {
            key: 'actions', label: 'عملیات', align: 'end',
            render: (c) => el('div', { class: 'cell-actions' },
              c.active ? el('button', { class: 'btn btn--ghost btn--sm', title: 'کد اتصال معلم (بات)', onclick: () => openTeacherLink(c) }, icon('bot', 15)) : null,
              c.active ? el('button', { class: 'btn btn--ghost btn--sm', title: 'ویرایش', onclick: () => openClassForm(school, c, refresh) }, icon('edit', 15)) : null,
              c.active && canDeactivate() ? el('button', {
                class: 'btn btn--danger btn--sm', title: 'غیرفعال‌سازی کلاس',
                onclick: async () => {
                  if (!(await confirmModal({
                    title: 'غیرفعال‌سازی کلاس',
                    message: `کلاس «${c.name}» غیرفعال می‌شود و دانش‌آموزانش از کلاس خارج می‌شوند (سابقه حفظ می‌شود).`,
                    confirmLabel: 'غیرفعال کن', danger: true
                  }))) return;
                  try {
                    await api.post(`/api/classes/${c.id}/deactivate`);
                    invalidateStudentFormMeta();
                    toast('کلاس غیرفعال شد', 'success');
                    refresh();
                  } catch (err) { toastError(err); }
                }
              }, icon('x', 15)) : null,
              // — حذف کامل کلاس ثبت‌شدهٔ اشتباه (فقط اگر خالی باشد — سرور گارد می‌گذارد)
              canDeactivate() ? el('button', {
                class: 'btn btn--danger btn--sm', title: 'حذف کامل کلاس — فقط اگر دانش‌آموز نداشته باشد',
                onclick: async () => {
                  if (!(await confirmModal({
                    title: 'حذف کامل کلاس',
                    message: `کلاس «${c.name}» به‌کلی پاک می‌شود — برای ثبت‌های اشتباه یا تکراری. اگر دانش‌آموز دارد حذف ممکن نیست (پیام سرور راهنمایی می‌کند). برگشت ندارد.`,
                    confirmLabel: 'حذف کن', danger: true
                  }))) return;
                  try {
                    await api.del(`/api/classes/${c.id}`);
                    toast('کلاس حذف شد', 'success');
                    refresh();
                  } catch (err) { toastError(err); }
                }
              }, icon('trash', 15)) : null
            )
          }
        ],
        rows: filtered,
        // — وقتی جستجو نتیجه ندارد، پیام هدفمند به‌جای خالیِ عمومی
        empty: q
          ? { iconName: 'search', title: 'کلاسی مطابق جستجو پیدا نشد', hint: 'بخشی از نام کلاس یا نام/تلفن معلم را امتحان کنید.' }
          : undefined
      })
    );
  }

  function openClassForm(schoolRef, cls, done) {
    formModal({
      title: cls ? `ویرایش کلاس «${cls.name}»` : 'کلاس جدید',
      fields: [
        { name: 'name', label: 'نام کلاس', required: true, value: cls?.name, hint: 'مثلاً «دوم الف» یا «پیش‌دبستانی زرد»' },
        { name: 'teacher_name', label: 'نام معلم', value: cls?.teacherName },
        { name: 'teacher_phone', label: 'تلفن معلم', type: 'tel', ltr: true, value: cls?.teacherPhone, hint: 'برای هماهنگی جلسات و ارسال گزارش' }
      ],
      onSubmit: async (values) => {
        if (cls) {
          await api.patch(`/api/classes/${cls.id}`, {
            name: values.name,
            teacher_name: values.teacher_name || null,
            teacher_phone: values.teacher_phone || null
          });
          invalidateStudentFormMeta();
          toast('کلاس به‌روزرسانی شد', 'success');
        } else {
          await api.post('/api/classes', {
            school_id: schoolRef.id,
            name: values.name,
            teacher_name: values.teacher_name || undefined,
            teacher_phone: values.teacher_phone || undefined
          });
          invalidateStudentFormMeta();
          toast('کلاس اضافه شد', 'success');
        }
        done();
        renderSchools(container);
      }
    });
  }

  /** لغو کد اتصال معلم — از پنجرهٔ «کد اتصال معلم» هر کلاس (؛ در پنجرهٔ سراسری حذف شد، این مسیر می‌ماند) */
  async function revoke(link, after) {
    if (!(await confirmModal({
      title: 'لغو کد اتصال',
      message: link.status === 'linked'
        ? `کد ${link.code} «متصل» است — با لغو، اتصال بات معلم قطع می‌شود و باید کد جدید بگیرد. مطمئنید؟`
        : `کد ${link.code} لغو می‌شود و دیگر قابل استفاده نیست. مطمئنید؟`,
      confirmLabel: 'لغو کن',
      danger: true
    }))) return;
    try {
      await api.del(`/api/notifications/class-links/${link.id}`);
      toast('کد اتصال لغو شد', 'success');
      await after();
    } catch (err) {
      toastError(err);
    }
  }

  async function openTeacherLink(cls) {
    // — کد قبلی «مشاهده» می‌شود؛ کد جدید فقط با دکمهٔ صریح «تولید کد جدید» ساخته می‌شود
    let links;
    try {
      links = (await api.get(`/api/notifications/class-links${qs({ class_id: cls.id })}`)).data;
    } catch (err) {
      toastError(err);
      return;
    }
    // — نام کاربری بات برای لینک احراز خودکار (ذخیره‌شده یا تشخیص خودکار؛ ناموفق → null)
    const botUsername = await resolveBotUsername();

    const listBox = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } });
    const modal = openModal({
      title: `کد اتصال معلم — کلاس ${cls.name}`,
      body: () => listBox
    });

    function render(linksList) {
      const activePending = linksList.filter((l) => l.status === 'pending');
      const linkedList = linksList.filter((l) => l.status === 'linked');
      const others = linksList.filter((l) => l.status !== 'pending' && l.status !== 'linked');

      // — کد متصل: لینک دوباره قابل استفاده است (انتقال به گفتگوی جدید)
      const linkedBlock = linkedList.length > 0
        ? linkedList.slice(0, 1).map((l) =>
            el('div', { class: 'token-box' },
              el('span', { style: { fontSize: 'var(--fs-sm)', color: 'var(--text-2)' } }, 'اتصال فعال — برای انتقال به گفتگوی جدید، همین لینک را دوباره برای معلم بفرستید:'),
              el('b', { dir: 'ltr', style: { fontSize: 'var(--fs-xl)', letterSpacing: '3px', display: 'block', marginTop: '8px', textAlign: 'center' } }, l.code),
              botLinkBox(buildBotLink(botUsername, l.code), l.code)
            )
          )
        : null;

      const intro = el('p', { style: { margin: 0, color: 'var(--text-3)', fontSize: 'var(--fs-sm)' } },
        botUsername
          ? 'لینک احراز خودکار را به معلم بدهید — با کلیک، بات باز می‌شود و اتصال خودکار انجام می‌گیرد (روش پیشنهادی). روش دستی: /link CODE — لینک منقضی نمی‌شود؛ اگر گفتگوی معلم عوض شد، همان لینک دوباره استفاده می‌شود.'
          : 'کدِ در انتظار را به معلم بدهید تا در بات بله بفرستد: /link CODE — بعد از اتصال، اعلان مراجعه دانش‌آموزان کلاس و برنامه /today و /week را می‌گیرد. لینک/کد چندبارمصرف است.');

      const pendingBlock = activePending.length > 0
        ? activePending.slice(0, 2).map((l) =>
            el('div', { class: 'token-box' },
              el('span', { style: { fontSize: 'var(--fs-sm)', color: 'var(--text-2)' } }, 'کد فعال (در انتظار اتصال):'),
              el('b', { dir: 'ltr', style: { fontSize: 'var(--fs-xl)', letterSpacing: '3px', display: 'block', marginTop: '8px', textAlign: 'center' } }, l.code),
              // — لینک احراز خودکار (وقتی نام کاربری بات در دسترس است)
              botLinkBox(buildBotLink(botUsername, l.code), l.code),
              el('div', { style: { display: 'flex', justifyContent: 'center', marginTop: '10px' } },
                canDeactivate() || session.user?.role === 'secretary'
                  ? el('button', {
                      class: 'btn btn--danger btn--sm',
                      onclick: () => revoke(l, () => refresh())
                    }, 'لغو این کد')
                  : null
              )
            )
          )
        : el('div', { style: { color: 'var(--text-3)', fontSize: 'var(--fs-sm)' } },
            'کد فعالی در انتظار اتصال نیست — با «تولید کد جدید» یکی بسازید.');

      const othersBlock = others.length > 0
        ? el('div', {},
            el('div', { class: 'field__label', style: { marginBottom: '6px' } }, 'کدهای قبلی'),
            el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
              others.slice(0, 6).map((l) => el('div', { class: 'chip' }, el('b', { dir: 'ltr' }, l.code), statusBadge(l.status)))
            )
          )
        : null;

      const generateRow = el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-start' } },
        el('button', { class: 'btn btn--primary btn--sm', onclick: () => generate() }, icon('plus', 15), 'تولید کد جدید')
      );

      listBox.replaceChildren(...[intro, pendingBlock, linkedBlock, othersBlock, generateRow].flat().filter(Boolean));
    }

    async function refresh() {
      try {
        const res = (await api.get(`/api/notifications/class-links${qs({ class_id: cls.id })}`)).data;
        render(res);
      } catch (err) {
        toastError(err);
      }
    }

    async function generate() {
      try {
        await api.post('/api/notifications/class-links', { class_id: cls.id });
        toast('کد جدید ساخته شد — کدهای قبلیِ در انتظار را می‌توانید لغو کنید', 'success');
        await refresh();
      } catch (err) {
        toastError(err);
      }
    }

    render(links);
  }
}
