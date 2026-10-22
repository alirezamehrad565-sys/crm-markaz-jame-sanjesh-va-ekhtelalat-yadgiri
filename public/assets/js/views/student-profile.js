import { api, qs } from '../api.js';
import { fa, enDigits, formatJalaliDateTime, formatJalaliNumeric, formatStoredJalaliNumeric, STUDENT_GRADES, gradeLabel, isPlaceholderNid } from '../format.js';
import { el, icon, formModal, openModal, confirmModal, toast, toastError, statusBadge, dataTable, skeletonState, emptyState, tabs, callBadge } from '../ui.js';
import { session } from '../state.js';
import { fetchTags, fetchStudentTags, tagChip, openTagEditor } from '../tagging.js';
import { openCaseEventForm, openCaseEventDetail, canCreateCaseEvents, openChecklistSendModal, fillTargetOf } from '../case-events.js'; // — رویدادهای پرونده + ارسال چک‌لیست + سه‌هدف
import { openExerciseSendModal, renderExercisesTab } from '../exercise-send.js'; // — ارسال تمرین با بله + تب تمرین‌ها
import { renderClinicalTab } from '../clinical-insights.js'; // — تب تفسیر بالینی (موتور شناسایی + پروتکل قضاوت)
import { pathwayChip, canEditPathway, openPathwayModal } from '../session-type.js'; // — مسیر پرونده
import { openEducationHistory } from '../archive-form.js'; // — تاریخچهٔ تحصیلی
import { openStudentForm } from '../student-form.js'; // — فرم مشترک ویرایش (کد ملی/مسئول/مسیر) — جایگزین فرم قدیمی داخلی
import { openBotLinkModal, resolveBotUsername, buildBotLink } from '../bot-link.js'; // — لینک احراز خودکار بات (m166: ساخت لینک در تب ارتباطات هم)
import { renderDocsQuickCard } from '../document-requests.js'; // — m151: درخواست مدارک با بله + کارت مدارک دریافتی

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
  }

  const schoolName = (sid) => schools.find((s) => s.id === sid)?.name ?? null;

  const canManageTags = session.user && ['manager', 'secretary', 'therapist'].includes(session.user.role);
  const canSendReport = session.user && ['manager', 'secretary', 'therapist'].includes(session.user.role);
  const canManageCase = session.user && ['manager', 'secretary'].includes(session.user.role);
  const canSeeClinical = session.user && (
    ['manager', 'secretary'].includes(session.user.role) ||
    (session.user.role === 'therapist' && Boolean(student.ownerStaffId) && student.ownerStaffId === session.user.staffId)
  );

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
              el('button', {
                class: 'btn btn--soft btn--sm',
                onclick: () => openChecklistSendModal({ student, onSent: () => renderStudentProfile(container, ctx) })
              }, icon('zap', 15), 'ارسال چک‌لیست با بله'),
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

  const content = el('div', {});

  function selectTab(key) {
    tabBar.setActive(key); // kit خودش کلیک را فعال نمی‌کند — صریح فعال می‌کنیم
    content.replaceChildren(skeletonState('list', 4));
    const renderer = {
      info: renderInfoTab,
      clinical: renderClinicalTabContent, //
      timeline: renderTimelineTab,
      sessions: renderSessionsTab,
      comms: renderCommsTab,
      exercises: renderExercisesTabContent
    }[key];
    (renderer ?? renderInfoTab)(content);
  }

  const tabBar = tabs(
    [
      { key: 'info', label: 'اطلاعات پایه', icon: 'user', onSelect: selectTab },
      ...(canSeeClinical ? [{ key: 'clinical', label: 'تفسیر بالینی', icon: 'brain', onSelect: selectTab }] : []),
      { key: 'timeline', label: 'تاریخچه', icon: 'clock', onSelect: selectTab },
      { key: 'sessions', label: `جلسات (${fa(appointments.length)})`, icon: 'calendar', onSelect: selectTab },
      { key: 'exercises', label: 'تمرین‌ها', icon: 'file', onSelect: selectTab },
      { key: 'comms', label: 'ارتباطات', icon: 'bot', onSelect: selectTab }
    ],
    'info'
  );

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

  const requestedTab = ctx.query?.tab;
  const timelineDeepFilter = ctx.query?.filter ?? (requestedTab === 'followups' ? 'followups' : null);
  const knownTabs = ['info', 'timeline', 'sessions', 'comms', 'exercises'];
  if (canSeeClinical) knownTabs.splice(1, 0, 'clinical');
  if (requestedTab === 'followups') selectTab('timeline');
  else selectTab(knownTabs.includes(requestedTab) ? requestedTab : 'info');

  function renderExercisesTabContent(box) {
    renderExercisesTab(box, { student, onChanged: () => renderStudentProfile(container, ctx) });
  }

  function renderClinicalTabContent(box) {
    renderClinicalTab(box, { student });
  }

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
            row('تلفن ولی', student.guardianPhone
              ? el('span', { class: 'cell-phone' },
                  el('span', { dir: 'ltr' }, fa(student.guardianPhone)),
                  callBadge(student.guardianPhone, `تماس با ولیّ ${student.firstName} ${student.lastName} — ${fa(student.guardianPhone)}`))
              : '—'),
            row('تاریخ ثبت', formatJalaliNumeric((student.createdAt || '').slice(0, 10)))
          ),
          el('div', { style: { marginTop: 'var(--sp-4)' } }, tagsRow),
          buildSpecialNeedBlock(student, canManageCase, container, ctx),
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
          renderTeachersCard(student, container, ctx),
          el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginTop: 'var(--sp-4)' } },
            el('button', {
              class: 'btn btn--soft btn--sm',
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

  function renderTimelineTab(box) {
    const deepFilter = TIMELINE_FILTERS.some((f) => f.key === timelineDeepFilter) ? timelineDeepFilter : null;
    const state = {
      filter: deepFilter ?? 'all',
      offset: 0,
      hasMore: deepFilter ? false : (timeline.meta?.hasMore ?? false),
      events: deepFilter ? [] : [...timeline.data],
      loading: false
    };

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

  const KIND_LINKS = {
    session_note: { hash: '#/reports', label: 'یادداشت جلسه در «گزارش جلسات من»' },
    exercise: { hash: '#/exercises', label: 'مشاهده در بانک تمرین' },
    followup: { hash: `#/students/${id}?tab=timeline&filter=followups`, label: 'مشاهده در تاریخچه (فیلتر پیگیری)' },
    appointment: { hash: '#/appointments', label: 'مشاهده در تقویم نوبت‌ها' },
    appointment_moved: { hash: '#/appointments', label: 'مشاهده در تقویم نوبت‌ها' },
    notification: { hash: `#/students/${id}?tab=comms`, label: 'مشاهده در تب ارتباطات' },
    waitlist: { hash: '#/waitlist', label: 'مشاهده لیست انتظار' } // — ماژول مستقل
  };

  function timelineItem(e) {
    const meta = KIND_META[e.kind] ?? { icon: 'clock', tone: 'neutral' };
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

  function renderSessionsTab(box) {
    const counts = { present: 0, absent: 0, pending: 0, cancelled: 0 };
    for (const a of appointments) counts[a.myAttendance] = (counts[a.myAttendance] ?? 0) + 1;

    const statsBar = el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' } },
      el('span', { class: 'badge badge--success' }, `${fa(counts.present)} حاضر`),
      el('span', { class: 'badge badge--error' }, `${fa(counts.absent)} غایب`),
      el('span', { class: 'badge badge--warning' }, `${fa(counts.pending)} در انتظار`)
    );

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

  async function renderCommsTab(box) {
    box.replaceChildren(skeletonState('list', 4));
    const canManageNotify = Boolean(session.user && ['manager', 'secretary'].includes(session.user.role));

    let familyCard = null;
    let teacherCard = null;
    try {
      familyCard = await buildFamilyInviteCard(student, { canManage: canManageNotify });
      teacherCard = await buildTeacherInviteCard(student, { canManage: canManageNotify });
    } catch (err) {
      box.replaceChildren(emptyState({ iconName: 'alert', title: 'بارگذاری بخش ارتباطات ناموفق بود', hint: err?.message ?? '' }));
      return;
    }

    const reportsCard = el('div', { class: 'card' },
      el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'گزارش‌های ارسالی')),
      el('div', { class: 'card__body' },
        el('p', { class: 'cell-sub', style: { margin: '0 0 var(--sp-3)' } },
          'گزارش‌های ثبت‌شده برای خانواده و معلم مدرسه در تب «تاریخچه» (رویدادهای پیام) قابل مشاهده است.'),
        canSendReport
          ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => openTeacherReportModal(student) }, icon('bot', 15), 'ارسال گزارش به معلم مدرسه')
          : null
      )
    );

    const notifyCard = canManageNotify ? await buildNotifyCard(student.id) : null;

    box.replaceChildren(
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' } },
        familyCard,
        teacherCard,
        reportsCard,
        notifyCard
      )
    );
  }
}

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

function renderTeachersCard(student, container, ctx) {
  const canManage = Boolean(session.user && ['manager', 'secretary', 'therapist'].includes(session.user.role));
  const listWrap = el('div', { style: { display: 'grid', gap: 'var(--sp-2)' } }, el('div', { class: 'cell-sub' }, 'در حال بارگذاری…'));

  async function reload() {
    try {
      const res = await api.get(`/api/students/${student.id}/teachers`);
      const items = res.data ?? [];
      listWrap.replaceChildren(
        ...(items.length === 0
          ? [el('div', { class: 'cell-sub' }, 'معلمی ثبت نشده است — با انتخاب کلاس مدرسه یا ارسال فرم معلم، معلم کلاس خودکار ثبت می‌شود.')]
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

  reload();
  return el('div', {
    class: 'card',
    style: { marginTop: 'var(--sp-4)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-3)' }
  },
    el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-2)' } },
      el('div', {},
        el('div', { class: 'card__title', style: { fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' } }, icon('users', 16), 'معلم'),
        el('div', { class: 'cell-sub', style: { marginTop: '2px' } }, 'پاسخ فرم جامع معلم با نام او روی پرونده می‌نشیند — دورهٔ ابتدایی یک معلمِ کلاس دارد')
      )
    ),
    listWrap
  );
}

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

async function buildNotifyCard(studentId) {
  let prefs = null;
  try {
    const prefsRes = await api.get(`/api/notifications/prefs/${studentId}`).catch(() => null);
    prefs = prefsRes?.data ?? null;
  } catch {
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
      el('div', { style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' } }, saveBtn),
      prefs?.chatId ? el('div', { class: 'alert alert--info' }, icon('bot', 16), el('span', {}, `اتصال فعال — chat_id: ${fa(prefs.chatId)}`)) : null
    )
  );
}

function normalizePhoneValue(phone) {
  return enDigits(String(phone ?? '')).trim().replace(/[^\d+]/g, '');
}

async function copyTextFallback(text) {
  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    try {
      const tmp = el('textarea', { style: { position: 'fixed', opacity: '0' } });
      tmp.value = text;
      document.body.appendChild(tmp);
      tmp.select();
      const ok = document.execCommand('copy');
      tmp.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function pickActiveLinkCode(links) {
  return links.find((l) => l.status === 'pending')?.code
    ?? links.find((l) => l.status === 'linked')?.code
    ?? links[0]?.code
    ?? null;
}

function buildSmsInviteSection({ heading, storedPhone, phonePlaceholder, getInvite, noCodeHint }) {
  const phoneInput = el('input', {
    class: 'input', type: 'tel', dir: 'ltr', maxlength: 20,
    placeholder: phonePlaceholder ?? 'شمارهٔ همراه…',
    style: { maxWidth: '220px' }
  });

  const previewBox = el('div', {});
  const phoneRow = el('div', { style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' } });
  const actionsRow = el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' } });

  const smsLink = el('a', { class: 'btn btn--primary btn--sm', style: { textDecoration: 'none' } }, icon('send', 15), 'دعوت با پیامک');
  const copyBtn = el('button', {
    class: 'btn btn--soft btn--sm',
    onclick: async () => {
      const inv = getInvite();
      if (!inv?.text) { toast(noCodeHint ?? 'اول لینک اتصال را بسازید', 'warning'); return; }
      const ok = await copyTextFallback(inv.text);
      toast(ok ? 'متن دعوت کپی شد' : 'کپی نشد — متن را دستی انتخاب کنید', ok ? 'success' : 'error');
    }
  }, icon('copy', 14), 'کپی متن دعوت');

  smsLink.addEventListener('click', (e) => {
    const inv = getInvite();
    const phone = storedPhone || normalizePhoneValue(phoneInput.value);
    if (!inv?.text) { e.preventDefault(); toast(noCodeHint ?? 'اول لینک اتصال را بسازید', 'warning'); return; }
    if (!phone || phone.length < 7) {
      e.preventDefault();
      toast('شمارهٔ گیرنده را وارد کنید', 'warning');
      if (!storedPhone) phoneInput.focus();
      return;
    }
    smsLink.href = `sms:${phone}?&body=${encodeURIComponent(inv.text)}`;
  });

  function refresh() {
    const inv = getInvite();
    phoneRow.replaceChildren(
      el('span', { class: 'field__label', style: { margin: 0 } }, 'شمارهٔ گیرنده:'),
      storedPhone ? el('b', { dir: 'ltr' }, fa(storedPhone)) : phoneInput
    );
    if (!inv?.text) {
      smsLink.removeAttribute('href');
      smsLink.title = noCodeHint ?? 'اول لینک اتصال بسازید';
      previewBox.replaceChildren(el('p', { class: 'cell-sub', style: { margin: 0 } }, noCodeHint ?? 'هنوز لینک اتصالی ساخته نشده است.'));
      actionsRow.replaceChildren(copyBtn);
      return;
    }
    smsLink.removeAttribute('title');
    previewBox.replaceChildren(
      el('div', { class: 'token-box', style: { fontFamily: 'inherit', wordBreak: 'break-word', margin: 0, lineHeight: '1.9', userSelect: 'all' } }, inv.text)
    );
    actionsRow.replaceChildren(smsLink, copyBtn);
  }
  refresh();

  return {
    root: el('div', { style: { borderTop: '1px dashed var(--border)', paddingTop: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)' } },
      el('div', { class: 'card__title', style: { fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' } }, icon('message', 15), heading),
      previewBox,
      phoneRow,
      actionsRow
    ),
    refresh
  };
}

function paintLinkChips(box, links, { emptyText }) {
  box.replaceChildren(
    ...(links.length === 0
      ? [el('span', { class: 'cell-sub' }, emptyText)]
      : links.slice(0, 4).map((l) =>
          el('div', { class: 'chip', style: { gap: '8px' } },
            el('b', { dir: 'ltr' }, l.code),
            statusBadge(l.status),
            el('button', {
              class: 'btn btn--ghost btn--sm',
              onclick: () => openBotLinkModal(l.code, { intro: 'این لینک چندبارمصرف است — برای گفتگوی جدید همان را بفرستید:' })
            }, 'دیدن لینک')
          )
        ))
  );
}

async function buildFamilyInviteCard(student, { canManage }) {
  let links = [];
  try {
    links = (await api.get(`/api/notifications/links${qs({ student_id: student.id })}`)).data ?? [];
  } catch { links = []; }
  const botUsername = await resolveBotUsername();

  const getInvite = () => {
    const code = pickActiveLinkCode(links);
    if (!code) return null;
    const link = buildBotLink(botUsername, code);
    return {
      code, link,
      text: `والد گرامی، ${student.firstName} ${student.lastName}؛ برای همکاری‌های بیشتر با مرکز اختلال یادگیری لطفاً از طریق بات زیر در بله اقدام فرمایید. ${link ?? `کد اتصال: ${code} — در بات بله، دستور /link ${code} را بفرستید`}`
    };
  };

  const listBox = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
  const paintLinks = () => paintLinkChips(listBox, links, {
    emptyText: canManage ? 'هنوز لینکی ساخته نشده — با «ساخت لینک اتصال» یکی بسازید.' : 'هنوز لینکی ساخته نشده است.'
  });
  paintLinks();

  const smsSection = buildSmsInviteSection({
    heading: 'دعوت ولیّ دانش‌آموز با پیامک',
    storedPhone: normalizePhoneValue(student.guardianPhone) || null,
    phonePlaceholder: 'مثلاً ۰۹۱۲۳۴۵۶۷۸۹',
    getInvite,
    noCodeHint: canManage
      ? 'برای دعوت پیامکی، اول با «ساخت لینک اتصال» لینک بسازید.'
      : 'هنوز لینک اتصالی ساخته نشده است — ساخت لینک در دست منشی/مدیر است.'
  });

  const genBtn = canManage
    ? el('button', {
        class: 'btn btn--primary btn--sm',
        onclick: async () => {
          genBtn.disabled = true;
          try {
            const res = await api.post('/api/notifications/links', { student_id: student.id });
            links = [res.data, ...links];
            toast('لینک اتصال خانواده ساخته شد', 'success');
            paintLinks();
            smsSection.refresh();
            await openBotLinkModal(res.data.code, { intro: 'این کد/لینک را به ولیّ دانش‌آموز بدهید تا گفتگوی باتش متصل شود:' });
          } catch (err) {
            toastError(err);
          }
          genBtn.disabled = false;
        }
      }, icon('plus', 15), 'ساخت لینک اتصال')
    : null;

  return el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('users', 16), 'خانواده'),
      genBtn
    ),
    el('div', { class: 'card__body', style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
      el('p', { class: 'cell-sub', style: { margin: 0 } },
        'لینک احراز خودکار بات بله — ولیّ با کلیک روی لینک به بات متصل می‌شود و اعلان نوبت‌ها و گزارش‌ها را می‌گیرد. لینک چندبارمصرف است و منقضی نمی‌شود.'),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'لینک‌های اتصال خانواده'), listBox),
      smsSection.root
    )
  );
}

async function buildTeacherInviteCard(student, { canManage }) {
  if (!student.classId) {
    return el('div', { class: 'card' },
      el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('school', 16), 'معلم')),
      el('div', { class: 'card__body' },
        el('p', { class: 'cell-sub', style: { margin: 0 } },
          'این دانش‌آموز هنوز کلاسی ندارد — برای لینک و دعوت معلم، ابتدا در «ویرایش اطلاعات» کلاس مدرسه را انتخاب کنید.')
      )
    );
  }

  let links = [];
  try {
    links = (await api.get(`/api/notifications/class-links${qs({ class_id: student.classId })}`)).data ?? [];
  } catch { links = []; }
  const botUsername = await resolveBotUsername();

  const getInvite = () => {
    const code = pickActiveLinkCode(links);
    if (!code) return null;
    const link = buildBotLink(botUsername, code);
    const opening = student.teacherName
      ? `همکار گرامی، ${student.teacherName}؛ یکی از دانش‌آموزان کلاس شما به مرکز اختلال یادگیری شهرستان مراجعه کرده است. برای دریافت گزارش‌ها و همکاری با مرکز جامع از لینک زیر اقدام فرمایید.`
      : 'همکار گرامی؛ یکی از دانش‌آموزان کلاس شما به مرکز اختلال یادگیری شهرستان مراجعه کرده است. برای دریافت گزارش‌ها و همکاری با مرکز جامع از لینک زیر اقدام فرمایید.';
    return {
      code, link,
      text: `${opening} ${link ?? `کد اتصال: ${code} — در بات بله، دستور /link ${code} را بفرستید`}`
    };
  };

  const listBox = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
  const paintLinks = () => paintLinkChips(listBox, links, {
    emptyText: canManage ? 'هنوز کد اتصالی برای این کلاس ساخته نشده — با «تولید کد جدید» یکی بسازید.' : 'هنوز کد اتصالی برای این کلاس ساخته نشده است.'
  });
  paintLinks();

  const smsSection = buildSmsInviteSection({
    heading: 'دعوت معلم با پیامک',
    storedPhone: normalizePhoneValue(student.teacherPhone) || null,
    phonePlaceholder: 'مثلاً ۰۹۱۲۳۴۵۶۷۸۹',
    getInvite,
    noCodeHint: canManage
      ? 'برای دعوت پیامکی، اول با «تولید کد جدید» لینک بسازید.'
      : 'هنوز کد اتصالی برای این کلاس ساخته نشده است — ساخت کد در دست منشی/مدیر است.'
  });

  const genBtn = canManage
    ? el('button', {
        class: 'btn btn--primary btn--sm',
        onclick: async () => {
          genBtn.disabled = true;
          try {
            const res = await api.post('/api/notifications/class-links', { class_id: student.classId });
            links = [res.data, ...links];
            toast('کد اتصال معلم ساخته شد', 'success');
            paintLinks();
            smsSection.refresh();
            await openBotLinkModal(res.data.code, { intro: 'این کد/لینک را به معلم کلاس بدهید تا گفتگوی باتش متصل شود:' });
          } catch (err) {
            toastError(err);
          }
          genBtn.disabled = false;
        }
      }, icon('plus', 15), 'تولید کد جدید')
    : null;

  return el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('school', 16), 'معلم'),
      genBtn
    ),
    el('div', { class: 'card__body', style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
      el('p', { class: 'cell-sub', style: { margin: 0 } },
        student.teacherName
          ? `اتصال بات معلم کلاس «${student.className ?? ''}» — معلم: ${student.teacherName}. با کلیک روی لینک، بات معلم باز و اتصال خودکار انجام می‌گیرد؛ اعلان مراجعهٔ دانش‌آموزان کلاس و برنامهٔ روز/هفته می‌گیرد.`
          : `اتصال بات معلم کلاس «${student.className ?? ''}» — با کلیک روی لینک، بات معلم باز و اتصال خودکار انجام می‌گیرد.`),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'کدهای اتصال معلم'), listBox),
      smsSection.root
    )
  );
}
