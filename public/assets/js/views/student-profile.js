/**
 * نمای پروندهٔ دانش‌آموز
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// views/student-profile.js — فاز ۶: پروفایل زنده (§14) با تب‌ها + تایم‌لاین (§11)
// اطلاعات پایه / تاریخچه / جلسات / ارزیابی‌ها / پیگیری‌ها / ارتباطات + «وضعیت فعلی» و «اقدام بعدی»

import { api, qs } from '../api.js';
import { fa, formatJalaliDateTime, formatJalaliNumeric, formatStoredJalaliNumeric, STUDENT_GRADES, gradeLabel, isPlaceholderNid } from '../format.js';
import { el, icon, formModal, openModal, confirmModal, toast, toastError, statusBadge, dataTable, skeletonState, emptyState, tabs, callBadge } from '../ui.js';
import { session } from '../state.js';
import { fetchTags, fetchStudentTags, tagChip, openTagEditor } from '../tagging.js';
import { openCaseEventForm, openCaseEventDetail, canCreateCaseEvents, openChecklistSendModal, fillTargetOf } from '../case-events.js'; // — رویدادهای پرونده + ارسال چک‌لیست + سه‌هدف
import { openExerciseSendModal, renderExercisesTab } from '../exercise-send.js'; // — ارسال تمرین با بله + تب تمرین‌ها
import { renderClinicalTab } from '../clinical-insights.js'; // — تب تفسیر بالینی (موتور شناسایی + پروتکل قضاوت)
import { pathwayChip, canEditPathway, openPathwayModal } from '../session-type.js'; // — مسیر پرونده
import { openEducationHistory } from '../archive-form.js'; // — تاریخچهٔ تحصیلی
import { openStudentForm } from '../student-form.js'; // — فرم مشترک ویرایش (کد ملی/مسئول/مسیر) — جایگزین فرم قدیمی داخلی
import { openBotLinkModal } from '../bot-link.js'; // — لینک احراز خودکار بات
import { renderDocsQuickCard } from '../document-requests.js'; // — m151: درخواست مدارک با بله + کارت مدارک دریافتی

// — گارد و مودال مسیر پرونده به session-type.js منتقل شد (مصرف مشترک با تب تفسیر)

const KIND_META = {
  student_created: { icon: 'user', tone: 'success' },
  case_status: { icon: 'refresh', tone: 'accent' },
  special_need: { icon: 'clip', tone: 'warning' },
  tags: { icon: 'tag', tone: 'neutral' },
  waitlist: { icon: 'clock', tone: 'warning' },
  appointment: { icon: 'calendar', tone: 'primary' },
  appointment_moved: { icon: 'undo', tone: 'warning' },
  session_note: { icon: 'file', tone: 'primary' },
  followup: { icon: 'bell', tone: 'error' },
  committee: { icon: 'clip', tone: 'accent' }, // — مصوبهٔ کمیسیون روی تایم‌لاین
  notification: { icon: 'bot', tone: 'success' },
  exercise: { icon: 'file', tone: 'accent' },
  case_event: { icon: 'clip', tone: 'primary' } // — رویداد پرونده (فرم جلسه/چک‌لیست)
};

const TIMELINE_FILTERS = [
  { key: 'all', label: 'همه', kinds: null },
  { key: 'sessions', label: 'جلسات', kinds: 'appointment,appointment_moved' },
  { key: 'notes', label: 'یادداشت جلسه', kinds: 'session_note' },
  { key: 'case_events', label: 'رویدادها/گزارش‌ها', kinds: 'case_event' }, //
  { key: 'followups', label: 'پیگیری', kinds: 'followup' },
  { key: 'committee', label: 'کمیسیون', kinds: 'committee' }, //
  { key: 'exercises', label: 'تکلیف تمرین', kinds: 'exercise' },
  { key: 'messages', label: 'پیام‌ها', kinds: 'notification' },
  { key: 'profile', label: 'پرونده', kinds: 'student_created,case_status,special_need,tags,waitlist' }
];

// فاز ۷ — قرارداد یکسان با pure سمت سرور (§12، D3)
const SPECIAL_NEED_TYPE_LABELS = {
  dyslexia: 'نارساخوانی (دیس‌لکسی)',
  dysgraphia: 'نارسانویسی (دیس‌گرافی)',
  dyscalculia: 'نارساریاضی (دیس‌کالکولی)',
  adhd: 'بیش‌فعالی و کم‌توجهی',
  autism: 'طیف اتیسم',
  speech_language: 'اختلال زبانی و بیان',
  anxiety: 'اضطراب',
  motor_coordination: 'اختلال هماهنگی حرکتی',
  slow_learner: 'دیرآموز',
  other: 'سایر'
};
const SPECIAL_NEED_SEVERITY_LABELS = { mild: 'خفیف', moderate: 'متوسط', severe: 'شدید' };
const SPECIAL_NEED_SEVERITY_TONES = { mild: 'neutral', moderate: 'warning', severe: 'error' };

const TIMELINE_PAGE = 30;

export async function renderStudentProfile(container, ctx) {
  // — اسکلتون بارگذاری پروفایل
  container.replaceChildren(skeletonState('list', 6));
  const id = ctx.params.id;

  let student;
  try {
    student = (await api.get(`/api/students/${id}`)).data;
  } catch (err) {
    container.replaceChildren(emptyState({ iconName: 'alert', title: 'دانش‌آموز پیدا نشد', hint: err.message }));
    return;
  }

  let schools = [];
  let appointments = [];
  let studentTags = [];
  let allTags = [];
  let caseEvents = [];
  let noteEvents = [];
  let staff = [];
  let timeline = { data: [], nextAction: null, meta: { hasMore: false } };
  try {
    const [schoolsRes, apptRes, tagsRes, allTagsRes, evRes, notesRes, staffRes, tlRes] = await Promise.all([
      api.get('/api/schools').catch(() => ({ data: [] })),
      api.get(`/api/students/${id}/appointments${qs({ limit: 50 })}`),
      fetchStudentTags(id),
      fetchTags(),
      api.get(`/api/students/${id}/case-events${qs({ limit: 200 })}`).catch(() => ({ data: [] })),
      api.get(`/api/students/${id}/timeline${qs({ kinds: 'session_note', limit: 200 })}`).catch(() => ({ data: [] })),
      api.get('/api/staff').catch(() => ({ data: [] })),
      api.get(`/api/students/${id}/timeline${qs({ limit: TIMELINE_PAGE })}`)
    ]);
    schools = schoolsRes.data;
    appointments = apptRes.data;
    studentTags = tagsRes;
    allTags = allTagsRes;
    caseEvents = evRes.data;
    noteEvents = notesRes.data;
    staff = staffRes.data;
    timeline = tlRes;
  } catch {
    // نوبت‌ها، برچسب‌ها، رویدادها و تایم‌لاین اختیاری‌اند — ادامه می‌دهیم
  }

  const schoolName = (sid) => schools.find((s) => s.id === sid)?.name ?? null;

  const canManageTags = session.user && ['manager', 'secretary', 'therapist'].includes(session.user.role);
  const canSendReport = session.user && ['manager', 'secretary', 'therapist'].includes(session.user.role);
  const canManageCase = session.user && ['manager', 'secretary'].includes(session.user.role);
  // — تفسیر بالینی (RBAC پلن §۷): مدیر/منشی مشاهده + درمانگرِ مسئول پرونده؛
  // تصمیم فقط مدیر یا درمانگرِ مسئول — منشی فقط می‌خواند (دکمه‌ها داخل ماژول گارد می‌شوند)
  const canSeeClinical = session.user && (
    ['manager', 'secretary'].includes(session.user.role) ||
    (session.user.role === 'therapist' && Boolean(student.ownerStaffId) && student.ownerStaffId === session.user.staffId)
  );

  // ─── وضعیت فعلی (§14) — هدر زنده ───

  // — نردبان «وضعیت پرونده» (شناسایی‌شده/در انتظار ارزیابی/…/تحت پایش) حذف شد؛
  // چرخهٔ واقعی حالا سه‌لیستی است: لیست انتظار ← دانش‌آموزان (با مسئول پرونده) ← آرشیو
  const nextActionBlock = buildNextActionBlock(timeline.nextAction);

  const statusCard = el('div', { class: 'card' },
    el('div', { class: 'card__body' },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' } },
        el('div', { class: 'avatar-lg' }, student.firstName.charAt(0)),
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('h2', { style: { marginBottom: '6px' } }, `${student.firstName} ${student.lastName}`),
          el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
            statusBadge(student.active ? 'active' : 'inactive'),
            student.gender ? statusBadge(student.gender) : null,
            student.grade ? el('span', { class: 'badge badge--neutral' }, gradeLabel(student.grade)) : null,
            // — مسیر پرونده (learning/rehab) + ویرایش سریع
            pathwayChip(student.pathway),
            canEditPathway(student)
              ? el('button', {
                  class: 'btn btn--ghost btn--sm',
                  style: { padding: '2px 8px' },
                  title: 'تغییر مسیر پرونده — تب تفسیر بالینی بر همین اساس شاخه می‌خورد',
                  onclick: () => openPathwayModal(student, () => renderStudentProfile(container, ctx))
                }, icon('edit', 13), 'مسیر')
              : null,
            student.ownerName
              ? el('span', { class: 'badge badge--accent', title: 'مسئول پرونده (m65 — سپردن رسمی پرونده به درمانگر)' }, `مسئول پرونده: ${student.ownerName}`)
              : null,
            student.specialNeedType
              ? el('span', { class: `badge badge--${student.specialNeedSeverity === 'severe' ? 'error' : 'warning'}`, title: 'نیاز ویژهٔ شناسایی‌شده (§12)' },
                  SPECIAL_NEED_TYPE_LABELS[student.specialNeedType] ?? student.specialNeedType)
              : null,
            el('span', { class: 'cell-sub' }, `مدرسه: ${schoolName(student.schoolId) ?? '—'}${student.className ? ` — ${student.className}` : ''}`)
          )
        )
      ),
      el('div', { style: { marginTop: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
        nextActionBlock,
        canCreateCaseEvents()
          ? el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
              el('button', {
                class: 'btn btn--primary btn--sm',
                onclick: () => openCaseEventForm({ student, onSaved: () => renderStudentProfile(container, ctx) })
              }, icon('plus', 15), 'ثبت رویداد پرونده'),
              // — موتور تشخیص و مداخله: ارسال یک‌کلیکی چک‌لیست با بله (پیشنهاد بر اساس برچسب‌ها)
              el('button', {
                class: 'btn btn--soft btn--sm',
                onclick: () => openChecklistSendModal({ student, onSent: () => renderStudentProfile(container, ctx) })
              }, icon('zap', 15), 'ارسال چک‌لیست با بله'),
              // — بانک تمرین ۲.۰: ارسال یک‌کلیکی تمرین/بستهٔ تمرینی با بله (پیشنهاد بر اساس برچسب‌ها)
              el('button', {
                class: 'btn btn--soft btn--sm',
                onclick: () => openExerciseSendModal({ student, onSent: () => renderStudentProfile(container, ctx) })
              }, icon('zap', 15), 'ارسال تمرین با بله')
            )
          : null,
        canManageCase ? buildOwnerEditor(student, () => renderStudentProfile(container, ctx)) : null
      )
    )
  );

  // ─── تب‌ها (§14.4) ───

  const content = el('div', {});

  function selectTab(key) {
    tabBar.setActive(key); // kit خودش کلیک را فعال نمی‌کند — صریح فعال می‌کنیم
    content.replaceChildren(skeletonState('list', 4));
    const renderer = {
      info: renderInfoTab,
      clinical: renderClinicalTabContent, //
      timeline: renderTimelineTab,
      sessions: renderSessionsTab,
      followups: renderFollowupsTab,
      comms: renderCommsTab,
      exercises: renderExercisesTabContent
    }[key];
    (renderer ?? renderInfoTab)(content);
  }

  const tabBar = tabs(
    [
      { key: 'info', label: 'اطلاعات پایه', icon: 'user', onSelect: selectTab },
      // — تب تفسیر بالینی (موتور تشخیص‌گذاری) — فقط برای نقش‌های مجاز
      ...(canSeeClinical ? [{ key: 'clinical', label: 'تفسیر بالینی', icon: 'brain', onSelect: selectTab }] : []),
      { key: 'timeline', label: 'تاریخچه', icon: 'clock', onSelect: selectTab },
      { key: 'sessions', label: `جلسات (${fa(appointments.length)})`, icon: 'calendar', onSelect: selectTab },
      { key: 'exercises', label: 'تمرین‌ها', icon: 'file', onSelect: selectTab },
      { key: 'followups', label: 'پیگیری‌ها', icon: 'bell', onSelect: selectTab },
      { key: 'comms', label: 'ارتباطات', icon: 'bot', onSelect: selectTab }
    ],
    'info'
  );

  // — m151 — کارت «مدارک دریافتی از بله» (پنل دسترسی سریع پرونده)
  const docsMount = el('div', { style: { marginTop: 'var(--sp-4)' } });
  renderDocsQuickCard(docsMount, student, { onChanged: () => renderStudentProfile(container, ctx) });

  container.replaceChildren(
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'پروفایل دانش‌آموز'),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { location.hash = '#/students'; } }, icon('chevR', 16), 'بازگشت به فهرست')
    ),
    statusCard,
    docsMount,
    el('div', { style: { marginTop: 'var(--sp-4)' } }, tabBar.root),
    el('div', { style: { marginTop: 'var(--sp-4)' } }, content)
  );

  // — deep-link تب‌ها: #/students/:id?tab=sessions|timeline|followups|comms|exercises|clinical
  const requestedTab = ctx.query?.tab;
  const knownTabs = ['info', 'timeline', 'sessions', 'followups', 'comms', 'exercises'];
  if (canSeeClinical) knownTabs.splice(1, 0, 'clinical');
  selectTab(knownTabs.includes(requestedTab) ? requestedTab : 'info');

  // ═══════════════ تب — تمرین‌ها ═══════════════

  function renderExercisesTabContent(box) {
    renderExercisesTab(box, { student, onChanged: () => renderStudentProfile(container, ctx) });
  }

  // ═══════════════ تب — تفسیر بالینی ═══════════════

  function renderClinicalTabContent(box) {
    renderClinicalTab(box, { student });
  }

  // ═══════════════ تب ۱ — اطلاعات پایه ═══════════════

  function renderInfoTab(box) {
    const tagsRow = el('div', { class: 'profile-tags' },
      el('div', { class: 'profile-tags__list' },
        studentTags.length === 0
          ? el('span', { class: 'cell-sub' }, 'بدون برچسب — برای دسته‌بندی بر اساس نوع اختلال، پایه و نوع مدرسه برچسب اضافه کنید.')
          : studentTags.map((t) => tagChip(t))
      ),
      canManageTags
        ? el('button', {
            class: 'btn btn--soft btn--sm',
            onclick: () => openTagEditor({
              student,
              tags: allTags,
              current: studentTags,
              canCreateTag: session.user?.role === 'manager',
              onSaved: () => renderStudentProfile(container, ctx)
            })
          }, icon('tag', 15), studentTags.length === 0 ? 'افزودن برچسب' : 'ویرایش برچسب‌ها')
        : null
    );

    box.replaceChildren(
      el('div', { class: 'card' },
        el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'اطلاعات پایه')),
        el('div', { class: 'card__body' },
          el('div', { class: 'info-list' },
            row('کد ملی', el('span', { dir: 'ltr' }, isPlaceholderNid(student.nationalId) ? '— (ثبت نشده)' : fa(student.nationalId))),
            row('تاریخ تولد', student.birthDate ? formatStoredJalaliNumeric(student.birthDate) : '—'),
            row('مدرسه', schoolName(student.schoolId) ?? '—'),
            // — باجت تماس با معلم کنار نام معلم (تلفن از کلاس مدرسه)
            row('کلاس', student.className
              ? el('span', { class: 'cell-phone' },
                  el('span', {}, student.teacherName
                    ? `${student.className} — معلم: ${student.teacherName}`
                    : student.className),
                  student.teacherPhone
                    ? callBadge(student.teacherPhone, `تماس با معلم ${student.teacherName} — ${fa(student.teacherPhone)}`)
                    : null)
              : '—'),
            row('نام ولی', student.guardianName ?? '—'),
            row('نسبت ولی', relationLabel(student.guardianRelation)),
            // — باجت تماس سریع کنار شمارهٔ ولیّ در پروفایل هم
            row('تلفن ولی', student.guardianPhone
              ? el('span', { class: 'cell-phone' },
                  el('span', { dir: 'ltr' }, fa(student.guardianPhone)),
                  callBadge(student.guardianPhone, `تماس با ولیّ ${student.firstName} ${student.lastName} — ${fa(student.guardianPhone)}`))
              : '—'),
            row('تاریخ ثبت', formatJalaliNumeric((student.createdAt || '').slice(0, 10)))
          ),
          el('div', { style: { marginTop: 'var(--sp-4)' } }, tagsRow),
          buildSpecialNeedBlock(student, canManageCase, container, ctx),
          // — تاریخچهٔ تحصیلی: سابقهٔ سال‌به‌سال (به‌خصوص پرونده‌های آرشیو)
          el('div', {
            class: 'card',
            style: { marginTop: 'var(--sp-4)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap' }
          },
            el('div', {},
              el('div', { class: 'card__title', style: { fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' } }, icon('school', 16), 'تاریخچهٔ تحصیلی'),
              el('div', { class: 'cell-sub', style: { marginTop: '2px' } }, 'سابقهٔ سال‌به‌سال: کجا درس خوانده، سطح هر سال و توضیحات')
            ),
            el('button', {
              class: 'btn btn--soft btn--sm',
              onclick: () => openEducationHistory(student, { onChanged: () => renderStudentProfile(container, ctx) })
            }, icon('eye', 15), 'مشاهده / مدیریت')
          ),
          // — T7 (m150-b): کارت «معلم‌ها» — چند معلم = چند لینک مستقل فرم جامع معلم
          renderTeachersCard(student, container, ctx),
          el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginTop: 'var(--sp-4)' } },
            el('button', {
              class: 'btn btn--soft btn--sm',
              // — فرم مشترک student-form.js (کد ملی + مسئول پرونده + مسیر پرونده)
              // به‌جای فرم قدیمی داخلی که کد ملی/مسئول/مسیر نداشت
              onclick: () => openStudentForm({ student, onSaved: () => renderStudentProfile(container, ctx) })
            }, icon('edit', 15), 'ویرایش اطلاعات'),
            canSendReport
              ? el('button', {
                  class: 'btn btn--soft btn--sm',
                  onclick: () => openTeacherReportModal(student)
                }, icon('bot', 15), 'ارسال گزارش به معلم مدرسه')
              : null
          )
        )
      )
    );
  }

  // ═══════════════ تب ۲ — تاریخچه (تایم‌لاین §11) ═══════════════

  function renderTimelineTab(box) {
    const state = { filter: 'all', offset: 0, hasMore: timeline.meta?.hasMore ?? false, events: [...timeline.data], loading: false };

    const list = el('div', { class: 'tl-list' });
    const moreBtn = el('button', { class: 'btn btn--soft btn--sm', style: { marginTop: 'var(--sp-4)' }, onclick: () => loadMore() }, icon('refresh', 15), 'نمایش رویدادهای بیشتر');
    const chips = el('div', { class: 'tl-filters' });

    for (const f of TIMELINE_FILTERS) {
      const chip = el('button', { class: `chip${state.filter === f.key ? ' is-active' : ''}`, onclick: () => setFilter(f.key) }, f.label);
      chip.dataset.key = f.key;
      chips.appendChild(chip);
    }

    function refreshChips() {
      for (const c of chips.children) c.classList.toggle('is-active', c.dataset.key === state.filter);
    }

    function setFilter(key) {
      state.filter = key;
      state.offset = 0;
      state.events = [];
      refreshChips();
      load(false);
    }

    async function load(append) {
      if (state.loading) return;
      state.loading = true;
      const f = TIMELINE_FILTERS.find((x) => x.key === state.filter);
      const query = { limit: TIMELINE_PAGE, offset: state.offset };
      if (f?.kinds) query.kinds = f.kinds;
      try {
        const res = await api.get(`/api/students/${id}/timeline${qs(query)}`);
        state.events = append ? [...state.events, ...res.data] : res.data;
        state.hasMore = Boolean(res.meta?.hasMore);
        paint();
      } catch (err) {
        toastError(err);
      }
      state.loading = false;
    }

    function loadMore() {
      state.offset += TIMELINE_PAGE;
      load(true);
    }

    function paint() {
      if (state.events.length === 0) {
        list.replaceChildren(
          emptyState({ iconName: 'clock', title: 'رویدادی ثبت نشده', hint: 'با ثبت نوبت، گزارش جلسه، ارزیابی یا پیگیری، روایت پرونده اینجا ساخته می‌شود.' })
        );
      } else {
        list.replaceChildren(...state.events.map(timelineItem));
      }
      moreBtn.style.display = state.hasMore ? '' : 'none';
    }

    box.replaceChildren(el('div', { class: 'card' },
      el('div', { class: 'card__head' },
        el('div', { class: 'card__title' }, 'روایت پرونده — تایم‌لاین'),
        canCreateCaseEvents()
          ? el('button', {
              class: 'btn btn--soft btn--sm',
              onclick: () => openCaseEventForm({ student, onSaved: () => renderStudentProfile(container, ctx) })
            }, icon('plus', 15), 'ثبت رویداد پرونده')
          : null
      ),
      el('div', { class: 'card__body' }, chips, list, moreBtn)
    ));

    if (state.events.length === 0) load(false);
    else paint();
  }

  // — نقشهٔ مقصد کلیک هر kind تایم‌لاین — «همه‌چیز روی یک تایم‌لاین» واقعاً کلیک‌پذیر است
  // — بازگردانی: لینک تقویم برای همهٔ نقش‌ها (تقویم برای دفتر هم فعال شد)
  const KIND_LINKS = {
    session_note: { hash: '#/reports', label: 'یادداشت جلسه در «گزارش جلسات من»' },
    exercise: { hash: '#/exercises', label: 'مشاهده در بانک تمرین' },
    followup: { hash: `#/students/${id}?tab=followups`, label: 'مشاهده در تب پیگیری‌ها' },
    // — لینک «کمیسیون» حذف شد (ماژول قطع شد)؛ رویدادهای تاریخی committee بدون لینک می‌مانند
    appointment: { hash: '#/appointments', label: 'مشاهده در تقویم نوبت‌ها' },
    appointment_moved: { hash: '#/appointments', label: 'مشاهده در تقویم نوبت‌ها' },
    notification: { hash: `#/students/${id}?tab=comms`, label: 'مشاهده در تب ارتباطات' },
    waitlist: { hash: '#/waitlist', label: 'مشاهده لیست انتظار' } // — ماژول مستقل
  };

  function timelineItem(e) {
    const meta = KIND_META[e.kind] ?? { icon: 'clock', tone: 'neutral' };
    // — رویداد پرونده: کلیک → مودال جزئیات (فرم کامل + پیوست + تحلیل + لغو)
    const isCaseEvent = e.kind === 'case_event' && e.ref?.type === 'case_event';
    const link = !isCaseEvent ? KIND_LINKS[e.kind] : null;
    const clickable = isCaseEvent || Boolean(link);
    const card = el('div', {
      class: 'tl-item__card',
      style: clickable ? { cursor: 'pointer' } : null,
      onclick: isCaseEvent
        ? async () => {
            try {
              const res = await api.get(`/api/case-events/${e.ref.id}`);
              openCaseEventDetail(res.data, { onChanged: () => renderStudentProfile(container, ctx) });
            } catch (err) {
              toastError(err);
            }
          }
        : link
          ? () => { location.hash = link.hash; }
          : null
    },
      el('div', { class: 'tl-item__head' },
        el('span', { class: 'tl-item__title' }, e.title),
        el('span', { class: 'tl-item__time' }, formatJalaliDateTime(e.at))
      ),
      e.subtitle ? el('div', { class: 'tl-item__sub' }, e.subtitle) : null,
      e.actor ? el('div', { class: 'tl-item__actor' }, `توسط ${e.actor}`) : null,
      // — بج سه‌هدف: این فرم توسط کی پر شده/می‌شود؟ (درمانگر در سایت — خانواده/معلم با بله)
      isCaseEvent ? (() => {
        const ev = caseEvents.find((x) => x.id === e.ref?.id);
        if (!ev) return null;
        const t = fillTargetOf({ category: ev.typeCategory, familyFillable: ev.typeFamilyFillable, audience: ev.typeAudience });
        return el('div', { style: { marginTop: '6px' } }, el('span', { class: `badge ${t.badgeClass}` }, t.badge));
      })() : null,
      link ? el('div', { class: 'tl-item__actor', style: { color: 'var(--primary, #229ED9)' } }, `↗ ${link.label}`) : null
    );
    return el('div', { class: 'tl-item' },
      el('div', { class: `tl-item__dot tl-item__dot--${meta.tone}` }, icon(meta.icon, 17)),
      card
    );
  }

  // ═══════════════ تب ۳ — جلسات ═══════════════

  function renderSessionsTab(box) {
    const counts = { present: 0, absent: 0, pending: 0, cancelled: 0 };
    for (const a of appointments) counts[a.myAttendance] = (counts[a.myAttendance] ?? 0) + 1;

    const statsBar = el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' } },
      el('span', { class: 'badge badge--success' }, `${fa(counts.present)} حاضر`),
      el('span', { class: 'badge badge--error' }, `${fa(counts.absent)} غایب`),
      el('span', { class: 'badge badge--warning' }, `${fa(counts.pending)} در انتظار`)
    );

    // — ستون «گزارش»: رویدادهای ساخت‌یافتهٔ متصل به همان نوبت + یادداشت جلسه
    const noteApptIds = new Set(
      noteEvents
        .map((n) => (n.ref?.id ? String(n.ref.id).split('/')[0] : null))
        .filter(Boolean)
    );
    const eventsOfAppt = (apptId) => caseEvents.filter((e) => e.appointmentId === apptId && e.status !== 'cancelled');
    const canReport = canCreateCaseEvents();

    const reportCell = (a) => {
      const evs = eventsOfAppt(a.appointmentId);
      const hasNote = noteApptIds.has(a.appointmentId);
      const parts = [];
      if (evs.length > 0) {
        parts.push(el('button', {
          class: 'chip is-active',
          title: 'نمایش رویدادهای این جلسه',
          onclick: () => openCaseEventDetail(evs[0], { onChanged: () => renderStudentProfile(container, ctx) })
        }, `رویداد (${fa(evs.length)})`));
      }
      if (hasNote) parts.push(el('span', { class: 'badge badge--neutral' }, 'یادداشت'));
      if (parts.length === 0) {
        return canReport && a.status !== 'cancelled'
          ? el('button', {
              class: 'btn btn--soft btn--sm',
              title: 'ثبت گزارش برای این جلسه',
              onclick: () => openCaseEventForm({ student, appointmentId: a.appointmentId, onSaved: () => renderStudentProfile(container, ctx) })
            }, icon('plus', 13), 'ثبت گزارش')
          : el('span', { class: 'cell-sub' }, '—');
      }
      return el('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' } }, parts);
    };

    box.replaceChildren(
      el('div', { class: 'card' },
        el('div', { class: 'card__head' },
          el('div', { class: 'card__title' }, 'نوبت‌ها و حضور'),
          canReport
            ? el('button', {
                class: 'btn btn--soft btn--sm',
                onclick: () => openCaseEventForm({ student, onSaved: () => renderStudentProfile(container, ctx) })
              }, icon('plus', 15), 'ثبت رویداد پرونده')
            : null
        ),
        el('div', { class: 'card__body' },
          statsBar,
          appointments.length === 0
            ? emptyState({ iconName: 'calendar', title: 'هنوز نوبتی ثبت نشده', hint: 'دفتر از «تقویم نوبت‌ها» و درمانگر از «تقویم من» می‌تواند نوبت ثبت کند.' })
            : dataTable({
                columns: [
                  { key: 'startAt', label: 'زمان', render: (a) => formatJalaliDateTime(a.startAt) },
                  { key: 'staffName', label: 'کارمند', render: (a) => a.staffName ?? '—' },
                  { key: 'status', label: 'وضعیت نوبت', render: (a) => statusBadge(a.status) },
                  { key: 'myAttendance', label: 'حضور', render: (a) => statusBadge(a.myAttendance) },
                  { key: 'report', label: 'گزارش', render: reportCell },
                  { key: 'go', label: '', align: 'end', render: () => el('button', { class: 'btn btn--ghost btn--sm', title: 'مشاهده در تقویم', onclick: () => { location.hash = '#/appointments'; } }, icon('calendar', 15)) }
                ],
                rows: appointments
              })
        )
      )
    );
  }

  // ═══════════════ تب ۵ — پیگیری‌ها (فاز ۳ + نمایش فاز ۶) ═══════════════

  async function renderFollowupsTab(box) {
    box.replaceChildren(skeletonState('list', 4));
    let followups = [];
    try {
      const res = await api.get(`/api/followups${qs({ student_id: id, group: 'all' })}`);
      followups = res.data;
    } catch (err) {
      box.replaceChildren(emptyState({ iconName: 'alert', title: 'خطا در دریافت پیگیری‌ها', hint: err.message }));
      return;
    }

    const canAct = (fu) => ['manager', 'secretary'].includes(session.user?.role) || fu.assigneeId === session.user?.staffId;
    const isOverdue = (fu) => (fu.status === 'open' || fu.status === 'in_progress') && fu.dueAt && new Date(fu.dueAt).getTime() < Date.now();

    async function transition(fu, nextStatus, confirmLabel) {
      if (nextStatus === 'cancelled' || nextStatus === 'done') {
        const ok = await confirmModal({ title: 'تغییر وضعیت پیگیری', message: `"${fu.title}" به وضعیت «${{ done: 'تکمیل شد', cancelled: 'لغوشده' }[nextStatus]}» تغییر کند؟`, confirmLabel, danger: nextStatus === 'cancelled' });
        if (!ok) return;
      }
      try {
        await api.patch(`/api/followups/${fu.id}`, { status: nextStatus });
        toast('وضعیت پیگیری به‌روزرسانی شد', 'success');
        renderStudentProfile(container, ctx);
      } catch (err) {
        toastError(err);
      }
    }

    box.replaceChildren(
      el('div', { class: 'card' },
        el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, `پیگیری‌های این پرونده (${fa(followups.length)})`)),
        el('div', { class: 'card__body' },
          followups.length === 0
            ? emptyState({ iconName: 'bell', title: 'پیگیری بازی وجود ندارد', hint: 'پیگیری‌ها از گزارش جلسه (اقدام بعدی: پیگیری) یا غیبت‌ها ساخته می‌شوند و همین‌جا دیده می‌شوند.' })
            : el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
                ...followups.map((fu) =>
                  el('div', { class: 'tl-item__card', style: { borderInlineStartWidth: '3px', borderInlineStartColor: isOverdue(fu) ? 'var(--error)' : 'var(--border)' } },
                    el('div', { class: 'tl-item__head' },
                      el('b', { class: 'tl-item__title' }, fu.title),
                      statusBadge(fu.status)
                    ),
                    el('div', { class: 'tl-item__sub' },
                      `مسئول: ${fu.assigneeName ?? '—'}`,
                      fu.dueAt ? ` — سررسید: ${formatJalaliDateTime(fu.dueAt)}` : ' — بدون مهلت',
                      isOverdue(fu) ? el('span', { class: 'badge badge--error', style: { marginInlineStart: '6px' } }, 'سررسید گذشته') : null
                    ),
                    canAct(fu) && (fu.status === 'open' || fu.status === 'in_progress')
                      ? el('div', { style: { display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' } },
                          fu.status === 'open'
                            ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => transition(fu, 'in_progress') }, icon('zap', 14), 'شروع')
                            : null,
                          el('button', { class: 'btn btn--soft btn--sm', onclick: () => transition(fu, 'done', 'تکمیل') }, icon('check', 14), 'تکمیل'),
                          el('button', { class: 'btn btn--ghost btn--sm', onclick: () => transition(fu, 'cancelled', 'لغو') }, icon('x', 14), 'لغو')
                        )
                      : null
                  )
                )
              )
        )
      )
    );
  }

  // ═══════════════ تب ۶ — ارتباطات ═══════════════

  async function renderCommsTab(box) {
    const canManageNotify = session.user && ['manager', 'secretary'].includes(session.user.role);
    const notifyCard = canManageNotify ? await buildNotifyCard(id) : null;

    box.replaceChildren(
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' } },
        el('div', { class: 'card' },
          el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'گزارش‌های ارسالی')),
          el('div', { class: 'card__body' },
            el('p', { class: 'cell-sub', style: { margin: '0 0 var(--sp-3)' } },
              'گزارش‌های ثبت‌شده برای خانواده و معلم مدرسه در تب «تاریخچه» (رویدادهای پیام) قابل مشاهده است.'),
            canSendReport
              ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => openTeacherReportModal(student) }, icon('bot', 15), 'ارسال گزارش به معلم مدرسه')
              : null
          )
        ),
        notifyCard
      )
    );
  }
}

// ─────────────── بلوک «اقدام بعدی» (§14) ───────────────

function buildNextActionBlock(nextAction) {
  if (!nextAction) {
    return el('div', { class: 'next-action' },
      el('div', { class: 'next-action__icon' }, icon('zap', 16)),
      el('div', {},
        el('div', { class: 'next-action__title' }, 'اقدام بعدی ثبت نشده'),
        el('div', { class: 'next-action__sub' }, 'با ثبت نوبت آینده یا پیگیری باز، همین‌جا نمایش داده می‌شود.')
      )
    );
  }
  if (nextAction.type === 'appointment') {
    return el('div', { class: 'next-action' },
      el('div', { class: 'next-action__icon' }, icon('calendar', 16)),
      el('div', {},
        el('div', { class: 'next-action__title' }, nextAction.title),
        el('div', { class: 'next-action__sub' }, nextAction.at ? formatJalaliDateTime(nextAction.at) : '—')
      )
    );
  }
  return el('div', { class: 'next-action next-action--followup' },
    el('div', { class: 'next-action__icon' }, icon('bell', 16)),
    el('div', {},
      el('div', { class: 'next-action__title' }, nextAction.title),
      el('div', { class: 'next-action__sub' }, nextAction.at ? `سررسید: ${formatJalaliDateTime(nextAction.at)}` : 'بدون مهلت')
    )
  );
}

// -c — ادیتور «مسئول پرونده» — فقط منشی/مدیر (لایهٔ دوم RBAC؛ سرور هم ۴۰۳)
// — مسئول پرونده در فرم تعریف هم انتخاب می‌شود؛ این ادیتور برای جابه‌جایی بعدی است
function buildOwnerEditor(student, onSaved) {
  let staff = [];
  api.get('/api/staff').then((res) => { staff = (res.data ?? []).filter((s) => s.active !== false); fillSel(); }).catch(() => {});
  const sel = el('select', { class: 'select', style: { maxWidth: '220px' } },
    el('option', { value: '' }, student.ownerStaffId ? 'برداشتن مسئول' : 'بدون مسئول — انتخاب کنید…')
  );
  function fillSel() {
    for (const s of staff) {
      if (s.id === student.ownerStaffId) continue;
      sel.appendChild(el('option', { value: s.id }, `${s.fullName ?? s.full_name ?? ''}`.trim() || s.id));
    }
    if (student.ownerStaffId) {
      const cur = staff.find((s) => s.id === student.ownerStaffId);
      sel.appendChild(el('option', { value: student.ownerStaffId, selected: true }, cur ? `مسئول فعلی: ${cur.fullName ?? cur.full_name}` : 'مسئول فعلی'));
    }
  }
  const btn = el('button', {
    class: 'btn btn--soft btn--sm',
    onclick: async () => {
      btn.disabled = true;
      try {
        await api.patch(`/api/students/${student.id}/owner`, { owner_staff_id: sel.value || null });
        toast(sel.value ? 'مسئول پرونده ثبت شد' : 'مسئول پرونده برداشته شد', 'success');
        onSaved?.();
      } catch (err) {
        toastError(err);
      }
      btn.disabled = false;
    }
  }, icon('user', 15), 'ثبت مسئول');

  return el('div', { class: 'case-status-edit' },
    el('span', { class: 'cell-sub' }, 'مسئول پرونده:'),
    sel,
    btn
  );
}

function row(key, val) {
  return el('div', { class: 'info-list__row' }, el('span', { class: 'info-list__key' }, key), el('span', { class: 'info-list__val' }, val));
}

// ═══════════════ فاز ۷ — بلوک نیاز ویژه (§12، D3) ═══════════════

/** بلوک «نیاز ویژه» در تب اطلاعات پایه — نمایش + فرم ویرایش فقط برای منشی/مدیر */
function buildSpecialNeedBlock(student, canManage, container, ctx) {
  const hasNeed = Boolean(student.specialNeedType);
  const info = el('div', { class: 'sn-profile' },
    hasNeed
      ? [
          el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
            el('span', { class: 'badge badge--primary' }, SPECIAL_NEED_TYPE_LABELS[student.specialNeedType] ?? student.specialNeedType),
            student.specialNeedSeverity
              ? el('span', { class: `badge badge--${SPECIAL_NEED_SEVERITY_TONES[student.specialNeedSeverity] ?? 'neutral'}` },
                  `شدت: ${SPECIAL_NEED_SEVERITY_LABELS[student.specialNeedSeverity] ?? student.specialNeedSeverity}`)
              : null,
            student.identifiedAt
              ? el('span', { class: 'cell-sub' }, `زمان شناسایی: ${formatJalaliNumeric((student.identifiedAt || '').slice(0, 10))}`)
              : null
          )
        ]
      : [el('span', { class: 'cell-sub' }, 'نیاز ویژه‌ای ثبت نشده است. ثبت نیاز ویژه دادهٔ بالینی است و فقط منشی/مدیر انجام می‌دهد؛ در گرید «نیازهای ویژه» و وضعیت همکاری مدرسه شمارش می‌شود.')]
  );

  const editBtn = canManage
    ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => openSpecialNeedForm(student, () => renderStudentProfile(container, ctx)) },
        icon('edit', 15), hasNeed ? 'ویرایش نیاز ویژه' : 'ثبت نیاز ویژه')
    : null;

  return el('div', { class: 'sn-profile-card', style: { marginTop: 'var(--sp-4)' } },
    el('div', { class: 'card__title', style: { marginBottom: 'var(--sp-2)', display: 'flex', alignItems: 'center', gap: '6px' } },
      icon('clip', 16), 'نیاز ویژه'
    ),
    info,
    editBtn ? el('div', { style: { marginTop: 'var(--sp-3)' } }, editBtn) : null
  );
}

/** فرم ثبت/ویرایش نیاز ویژه — PATCH /api/students/:id/special-need (فقط منشی/مدیر) */
function openSpecialNeedForm(student, onSaved) {
  const current = student.specialNeedType ?? '';
  const currentSev = student.specialNeedSeverity ?? '';
  formModal({
    title: student.specialNeedType ? 'ویرایش نیاز ویژه' : 'ثبت نیاز ویژه',
    fields: [
      {
        name: 'special_need_type', label: 'نوع نیاز ویژه', type: 'select', span: 2, required: false,
        options: [
          { value: '', label: '— بدون نیاز ویژه (پاک‌کردن) —' },
          ...Object.entries(SPECIAL_NEED_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))
        ],
        value: current,
        hint: 'هم‌تراز برچسب‌های اختلال؛ منبع حقیقت گرید همین فیلد ساختاریافته است (D3)'
      },
      {
        name: 'special_need_severity', label: 'شدت', type: 'select', span: 2,
        options: [
          { value: '', label: '— بدون شدت —' },
          ...Object.entries(SPECIAL_NEED_SEVERITY_LABELS).map(([v, l]) => ({ value: v, label: l }))
        ],
        value: currentSev
      }
    ],
    onSubmit: async (values) => {
      await api.patch(`/api/students/${student.id}/special-need`, {
        special_need_type: values.special_need_type || null,
        special_need_severity: values.special_need_severity || null
      });
      toast(values.special_need_type ? 'نیاز ویژه ذخیره شد' : 'نیاز ویژه حذف شد', 'success');
      onSaved();
    }
  });
}

/** — T7 (m150-b): کارت «معلم‌ها» روی پرونده — فهرست + افزودن/حذف
 * مکملِ فیلد تک‌معلم کلاس (که در «اطلاعات پایه» همان قبل می‌ماند — دست‌نخورده)؛
 * «چند معلم = چند لینک مستقل» فرم جامع معلم — پاسخ هر معلم با نامش («پاسخ معلم: X»)
 * روی پرونده می‌نشیند و در جریان ارسال فرم معلم به‌عنوان «انتخاب معلم» مصرف می‌شود.
 */
function renderTeachersCard(student, container, ctx) {
  const canManage = Boolean(session.user && ['manager', 'secretary', 'therapist'].includes(session.user.role));
  const listWrap = el('div', { style: { display: 'grid', gap: 'var(--sp-2)' } }, el('div', { class: 'cell-sub' }, 'در حال بارگذاری…'));
  const addBtn = canManage
    ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => openAddTeacher() }, icon('plus', 15), 'افزودن معلم')
    : null;

  async function reload() {
    try {
      const res = await api.get(`/api/students/${student.id}/teachers`);
      const items = res.data ?? [];
      listWrap.replaceChildren(
        ...(items.length === 0
          ? [el('div', { class: 'cell-sub' }, canManage
            ? 'هنوز معلمی ثبت نشده — برای فرم جامع معلم، معلم‌ها را اضافه کنید.'
            : 'معلمی ثبت نشده است.')]
          : items.map((t) => el('div', {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-2) var(--sp-3)' }
          },
            el('div', {},
              el('div', { style: { fontWeight: 600 } }, t.name),
              el('div', { class: 'cell-sub' }, [t.classLabel, t.contact].filter(Boolean).join(' — ') || '—')),
            canManage
              ? el('button', {
                class: 'btn btn--ghost btn--sm', 'aria-label': 'حذف معلم',
                onclick: async () => {
                  const ok = await confirmModal({
                    title: 'حذف معلم',
                    message: `«${t.name}» از فهرست معلم‌های این پرونده حذف شود؟ لینک‌های صادرشدهٔ قبلی معتبر می‌مانند؛ فقط گره‌زدن پاسخ‌های بعدی به نام او برداشته می‌شود.`,
                    confirmLabel: 'حذف معلم',
                    danger: true
                  });
                  if (!ok) return;
                  try {
                    await api.del(`/api/students/${student.id}/teachers/${t.id}`);
                    toast('معلم حذف شد');
                    reload();
                  } catch (err) { toastError(err); }
                }
              }, icon('trash', 15), 'حذف')
              : null
          )))
      );
    } catch {
      listWrap.replaceChildren(el('div', { class: 'cell-sub' }, 'فهرست معلم‌ها بارگذاری نشد.'));
    }
  }

  function openAddTeacher() {
    formModal({
      title: 'افزودن معلم — پروندهٔ دانش‌آموز',
      submitLabel: 'افزودن',
      fields: [
        { name: 'name', label: 'نام و نام خانوادگی معلم', type: 'text', required: true, maxlength: 120, span: 2, placeholder: 'مثلاً سرکار موسوی' },
        { name: 'class_label', label: 'کلاس/درس (اختیاری)', type: 'text', maxlength: 120, span: 2, placeholder: 'مثل «چهارم ب — ریاضی»' },
        { name: 'contact', label: 'راه ارتباطی (اختیاری — تلفن/بله)', type: 'text', maxlength: 60, ltr: true, span: 2 }
      ],
      onSubmit: async (v) => {
        await api.post(`/api/students/${student.id}/teachers`, {
          name: v.name,
          class_label: v.class_label || undefined,
          contact: v.contact || undefined
        });
        toast('معلم اضافه شد');
        reload();
        return true;
      }
    });
  }

  reload();
  return el('div', {
    class: 'card',
    style: { marginTop: 'var(--sp-4)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-3)' }
  },
    el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-2)' } },
      el('div', {},
        el('div', { class: 'card__title', style: { fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' } }, icon('users', 16), 'معلم‌ها'),
        el('div', { class: 'cell-sub', style: { marginTop: '2px' } }, 'چند معلم = چند لینک مستقل فرم جامع معلم — پاسخ هر معلم با نامش روی پرونده می‌نشیند')
      ),
      addBtn
    ),
    listWrap
  );
}

/** — ارسال گزارش درباره دانش‌آموز به معلم مدرسه‌اش (چت متصل کلاس) */
function openTeacherReportModal(student) {
  const textarea = el('textarea', {
    class: 'textarea', rows: 5,
    placeholder: 'مثلاً: علی در جلسات اخیر تمرین تنفس را خوب پیش برد؛ لطفاً روزهای مراجعه او در کلاس یادآوری شود.'
  });
  const { close } = openModal({
    title: 'ارسال گزارش به معلم مدرسه',
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
      el('p', { style: { margin: 0, color: 'var(--text-2)', fontSize: 'var(--fs-sm)' } },
        student.classId
          ? `گزارش برای معلم کلاس «${student.className}» با بات بله ارسال می‌شود.`
          : 'این دانش‌آموز هنوز کلاسی ندارد — ابتدا در ویرایش اطلاعات، کلاس مدرسه را انتخاب کنید.'),
      textarea
    ),
    actions: [
      (c) => el('button', { class: 'btn btn--ghost', onclick: c }, 'انصراف'),
      (c) => el('button', {
        class: 'btn btn--primary',
        onclick: async () => {
          const text = textarea.value.trim();
          if (text.length < 2) {
            toast('متن گزارش را بنویسید', 'warning');
            return;
          }
          try {
            const res = await api.post('/api/notifications/teacher-report', { student_id: student.id, text });
            toast(`گزارش برای معلم کلاس «${res.data.className}» ارسال شد`, 'success');
            c();
          } catch (err) {
            toastError(err);
          }
        }
      }, icon('bot', 16), 'ارسال')
    ]
  });
  void close;
}

function relationLabel(rel) {
  return { father: 'پدر', mother: 'مادر', other: 'سایر' }[rel] ?? rel ?? '—';
}

// ─────────────── کارت اعلان‌ها ───────────────
// — فرم قدیمی ویرایش (openEditForm) حذف شد — openStudentForm مشترک جایگزین شد
// (کد ملی/مسئول پرونده/مسیر پرونده در فرم مشترک هست؛ دوبله‌سازی برداشته شد)

async function buildNotifyCard(studentId) {
  let prefs = null;
  let links = [];
  try {
    const prefsRes = await api.get(`/api/notifications/prefs/${studentId}`).catch(() => null);
    prefs = prefsRes?.data ?? null;
    const linksRes = await api.get(`/api/notifications/links${qs({ student_id: studentId })}`);
    links = linksRes.data;
  } catch {
    // اعلان‌ها اختیاری‌اند
  }

  const channelSel = el('select', { class: 'select' },
    el('option', { value: 'bale' }, 'بات بله'),
    el('option', { value: 'internal' }, 'داخلی (آزمایشی)')
  );
  channelSel.value = prefs?.channel ?? 'bale';

  const hoursInput = el('input', { class: 'input', type: 'number', min: '1', max: '48', value: String(prefs?.reminderHoursBefore ?? 2) });
  const enabledCb = el('input', { type: 'checkbox' });
  enabledCb.checked = prefs?.remindersEnabled ?? false;
  enabledCb.style.accentColor = 'var(--primary)';

  const saveBtn = el('button', {
    class: 'btn btn--primary btn--sm',
    onclick: async () => {
      saveBtn.disabled = true;
      try {
        await api.put(`/api/notifications/prefs/${studentId}`, {
          channel: channelSel.value,
          reminders_enabled: enabledCb.checked,
          reminder_hours_before: Number(hoursInput.value) || 2
        });
        toast('تنظیمات اعلان ذخیره شد', 'success');
      } catch (err) {
        toastError(err);
      }
      saveBtn.disabled = false;
    }
  }, 'ذخیره');

  const linkListBox = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
    links.length === 0
      ? el('span', { style: { fontSize: 'var(--fs-sm)', color: 'var(--text-3)' } }, 'لینکی ساخته نشده است.')
      : links.slice(0, 4).map((l) =>
          // — لینک‌ها چندبارمصرف‌اند؛ «دیدن لینک» برای ارسال دوباره/انتقال به گفتگوی جدید
          el('div', { class: 'chip', style: { gap: '8px' } },
            el('b', { dir: 'ltr' }, l.code),
            statusBadge(l.status),
            el('button', {
              class: 'btn btn--ghost btn--sm',
              onclick: () => openBotLinkModal(l.code, {
                intro: 'این لینک دوباره قابل استفاده است — برای گفتگوی جدید همان را بفرستید:'
              })
            }, 'دیدن لینک')
          )
        )
  );

  const linkBtn = el('button', {
    class: 'btn btn--soft btn--sm',
    onclick: async () => {
      linkBtn.disabled = true;
      try {
        const res = await api.post('/api/notifications/links', { student_id: studentId });
        toast('لینک اتصال خانواده ساخته شد', 'success');
        linkListBox.prepend(el('div', { class: 'chip', style: { gap: '8px' } },
          el('b', { dir: 'ltr' }, res.data.code),
          statusBadge(res.data.status),
          el('button', {
            class: 'btn btn--ghost btn--sm',
            onclick: () => openBotLinkModal(res.data.code, {
              intro: 'این لینک دوباره قابل استفاده است — برای گفتگوی جدید همان را بفرستید:'
            })
          }, 'دیدن لینک')
        ));
        // — نمایش کد + لینک احراز خودکار (خانواده با کلیک متصل می‌شود)
        await openBotLinkModal(res.data.code, {
          intro: 'این کد/لینک را به ولیّ دانش‌آموز بدهید تا گفتگوی باتش متصل شود:'
        });
      } catch (err) {
        toastError(err);
      }
      linkBtn.disabled = false;
    }
  }, icon('bot', 15), 'ساخت لینک اتصال خانواده');

  return el('div', { class: 'card' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'یادآوری و اعلان‌ها')),
    el('div', { class: 'card__body', style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' } },
      el('div', { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'کانال'), channelSel),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'ساعت قبل از نوبت'), hoursInput)
      ),
      el('label', { style: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' } },
        enabledCb,
        el('span', { style: { fontSize: 'var(--fs-sm)' } }, 'یادآوری خودکار فعال باشد')
      ),
      el('div', { style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' } }, saveBtn, linkBtn),
      prefs?.chatId ? el('div', { class: 'alert alert--info' }, icon('bot', 16), el('span', {}, `اتصال فعال — chat_id: ${fa(prefs.chatId)}`)) : null,
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'لینک‌های اتصال اخیر'), linkListBox)
    )
  );
}
