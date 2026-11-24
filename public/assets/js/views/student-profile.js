import { api, qs } from '../api.js';
import { fa, enDigits, formatJalaliDateTime, formatJalaliNumeric, formatStoredJalaliNumeric, STUDENT_GRADES, gradeLabel, isPlaceholderNid } from '../format.js';
import { el, icon, formModal, openModal, confirmModal, toast, toastError, statusBadge, dataTable, skeletonState, emptyState, errorState, tabs, callBadge, lockBtn, ddOpen } from '../ui.js';
import { openStudentDelete } from '../student-delete.js'; // — حذف کامل پرونده (جریان واحد با فهرست دانش‌آموزان)
import { SPECIAL_NEED_TYPE_LABELS, SPECIAL_NEED_SEVERITY_LABELS, SPECIAL_NEED_SEVERITY_TONES } from '../taxonomy.js'; /* ۱.۲۵.۰۲ — واژه‌نامهٔ مشترک نیاز ویژه */
import { openTeacherManager } from '../student-teachers.js'; // — مدیریت معلم‌ها: افزودن/حذف (APIهای POST/DELETE معلم)
import { session } from '../state.js';
import { fetchTags, fetchStudentTags, tagChip, openTagEditor } from '../tagging.js';
import { fetchStudentFocus, focusLabels, openFocusEditor } from '../student-focus.js'; // درخت هدف در پروفایل
import { openCaseEventForm, openCaseEventDetail, canCreateCaseEvents, openChecklistSendModal, fillTargetOf } from '../case-events.js'; // — رویدادهای پرونده + ارسال چک‌لیست + سه‌هدف
import { openExerciseSendModal, renderExercisesTab } from '../exercise-send.js'; // — ارسال تمرین با بله + تب تمرین‌ها
import { renderClinicalTab } from '../clinical-insights.js'; // — تب تفسیر بالینی + پروتکل قضاوت
import { pathwayChip, canEditPathway, openPathwayModal } from '../session-type.js'; // — مسیر پرونده
import { PATH_STATUS_LABEL, PATH_STATUS_BADGE } from '../clinical-content.js'; // — ۱.۲۷.۵۷ موج C: برچسب فارسی وضعیت مسیر (هم‌منبع با تب تفسیر بالینی؛ در همان چانک)
import { openEducationHistory } from '../archive-form.js'; // — تاریخچهٔ تحصیلی
import { openStudentForm } from '../student-form.js'; // — فرم مشترک ویرایش (کد ملی/مسئول/مسیر) — جایگزین فرم قدیمی داخلی
import { openBotLinkModal, resolveBotUsername, buildBotLink } from '../bot-link.js'; // — لینک احراز خودکار بات (: ساخت لینک در تب ارتباطات هم)
import { renderDocsQuickCard } from '../document-requests.js'; // — : درخواست مدارک با بله + کارت مدارک دریافتی
import { createProfileRegistry } from '../profile/registry.js'; // — موج ۰ اسکلت لولایی: dispatch تب از رجیستری + fallback قدیمی

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
  case_event: { icon: 'clip', tone: 'primary' }, // — رویداد پرونده (فرم جلسه/چک‌لیست)
  report_export: { icon: 'file', tone: 'accent' } // موج ۳ — سند خروجی نسخه‌دار (طرح C)
};

const TIMELINE_FILTERS = [
  { key: 'all', label: 'همه', kinds: null },
  { key: 'sessions', label: 'جلسات', kinds: 'appointment,appointment_moved' },
  { key: 'notes', label: 'یادداشت جلسه', kinds: 'session_note' },
  { key: 'case_events', label: 'رویدادها/گزارش‌ها', kinds: 'case_event' }, //
  { key: 'followups', label: 'پیگیری', kinds: 'followup' },
  { key: 'committee', label: 'کمیسیون', kinds: 'committee' }, //
  { key: 'exercises', label: 'تکلیف تمرین', kinds: 'exercise' },
  { key: 'reports', label: 'گزارش‌های خروجی', kinds: 'report_export' }, // موج ۳ — آرشیو اسناد نسخه‌دار
  { key: 'messages', label: 'پیام‌ها', kinds: 'notification' },
  { key: 'profile', label: 'پرونده', kinds: 'student_created,case_status,special_need,tags,waitlist' }
];

const TIMELINE_PAGE = 30;

/* موج ۱ — فصل‌های روایت (طرح D «فصل‌های پرونده»): برچسب/آیکون هر فاز؛ جمع‌بندی «آمار-و-نقل»
   و نوار روند از سرور می‌آید (periodizeTimeline قطعی — بدون LLM و بدون ادعای بالینی). */
const TIMELINE_PHASE_META = {
  screening: { label: 'غربال و ورود', icon: 'clock' },
  assessment: { label: 'ارزیابی', icon: 'clip' },
  plan: { label: 'طرح درمان', icon: 'target' },
  treatment: { label: 'دورهٔ درمان', icon: 'calendar' },
  review: { label: 'بازسنجی و تصمیم', icon: 'refresh' },
  scattered: { label: 'ثبت‌های پراکنده', icon: 'clock' }
};

/* سرصفهٔ هر فصل در جریان خط زمانی — فقط از دادهٔ همان پاسخ؛ بدون fetch تازه */
function chapterHeader(ch) {
  const meta = TIMELINE_PHASE_META[ch.phase] ?? TIMELINE_PHASE_META.scattered;
  const s = ch.summary ?? {};
  const bits = [];
  if (s.sessions > 0) bits.push(`${fa(s.sessions)} جلسه`);
  if (s.absent > 0) bits.push(`${fa(s.absent)} غایب`);
  if (s.cancelledSessions > 0) bits.push(`${fa(s.cancelledSessions)} لغو`);
  if (s.pendingSessions > 0) bits.push(`${fa(s.pendingSessions)} در انتظار`);
  if (s.exercisesAssigned > 0) bits.push(`${fa(s.exercisesAssigned)} تمرین ارسالی`);
  if (s.exercisesCorrected > 0) bits.push(`${fa(s.exercisesCorrected)} بازخورد تمرین`);
  if (s.followupsCreated > 0) bits.push(`${fa(s.followupsCreated)} پیگیری جدید`);
  if (s.caseEvents > 0) bits.push(`${fa(s.caseEvents)} رویداد`);
  const otherMilestones = Math.max(0, (s.milestones ?? 0) - (s.committeeDecisions ?? 0));
  if (otherMilestones > 0) bits.push(`${fa(otherMilestones)} نقطهٔ کلیدی`);
  const scores = ch.trend?.scores ?? [];
  const bars = scores.length > 1
    ? el('span', { style: { display: 'inline-flex', alignItems: 'flex-end', gap: '2px', height: '14px' } },
        scores.map((x) => el('span', { style: { width: '4px', height: `${Math.max(2, Math.round((x.pct * 14) / 100))}px`, background: 'var(--primary)', opacity: '0.75', borderRadius: '1px', display: 'inline-block' } })))
    : null;
  const ap = ch.trend?.attendancePct;
  return el('div', { style: { margin: 'var(--sp-4) 0 var(--sp-2)', paddingBottom: 'var(--sp-2)', borderBottom: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' } },
    el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
      el('span', { class: 'badge badge--primary' }, icon(meta.icon, 12), ch.phase === 'treatment' && (ch.run ?? 1) > 1 ? `${meta.label} ${fa(ch.run)}` : meta.label),
      el('span', { class: 'cell-sub' }, `${formatJalaliNumeric(String(ch.from).slice(0, 10))} تا ${formatJalaliNumeric(String(ch.to).slice(0, 10))}`),
      (ap !== null && ap !== undefined) ? el('span', { class: 'badge badge--neutral' }, `حضور ${fa(ap)}٪`) : null,
      bars
    ),
    bits.length > 0 ? el('div', { class: 'cell-sub' }, bits.join(' · ')) : null
  );
}

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
  let studentFocus = []; // [{key, fa}] هدف‌های شناختی پروفایل با برچسب فارسی
  let caseEvents = [];
  let noteEvents = [];
  let staff = [];
  let timeline = { data: [], nextAction: null, meta: { hasMore: false } };
  /* UX-ممیزی فاز ۳ (P1 «تا تکمیل ۹ درخواست موازی فقط اسکلت»): درخواست‌های موازی به پس‌زمینه
     رفتند؛ کروم صفحه (کارت وضعیت + نوار تب‌ها) بلافاصله با دادهٔ خود دانش‌آموز رندر می‌شود و
     وقتی پاسخ‌ها رسید، کارت و تب‌ها درجا تازه و تب درخواستی با دادهٔ کامل رندر می‌شود. */
  let auxDone = false;
  let pendingTab = null;
  const auxPromise = (async () => {
    try {
      const [schoolsRes, apptRes, tagsRes, allTagsRes, evRes, notesRes, staffRes, tlRes, focusKeysRes, focusLabelMap] = await Promise.all([
        api.get('/api/schools').catch(() => ({ data: [] })),
        api.get(`/api/students/${id}/appointments${qs({ limit: 50 })}`),
        fetchStudentTags(id),
        fetchTags(),
        api.get(`/api/students/${id}/case-events${qs({ limit: 200 })}`).catch(() => ({ data: [] })),
        api.get(`/api/students/${id}/timeline${qs({ kinds: 'session_note', limit: 200 })}`).catch(() => ({ data: [] })),
        api.get('/api/staff').catch(() => ({ data: [] })),
        api.get(`/api/students/${id}/timeline${qs({ limit: TIMELINE_PAGE })}`),
        fetchStudentFocus(id), //
        focusLabels() // برچسب فارسی کلیدها از درخت واحد
      ]);
      schools = schoolsRes.data;
      appointments = apptRes.data;
      studentTags = tagsRes;
      allTags = allTagsRes;
      studentFocus = focusKeysRes.map((k) => ({ key: k, fa: focusLabelMap[k] ?? k })); //
      caseEvents = evRes.data;
      noteEvents = notesRes.data;
      staff = staffRes.data;
      timeline = tlRes;
    } catch (err) {
      // پیش‌تر catch خالی بود: خطای واکشی مثل «پروندهٔ خالی» رندر می‌شد؛ حالا بازخورد دارد
      toastError(err);
    }
  })();

  const schoolName = (sid) => schools.find((s) => s.id === sid)?.name ?? null;

  const canManageTags = session.user && ['manager', 'secretary', 'therapist'].includes(session.user.role);
  const canSendReport = session.user && ['manager', 'secretary', 'therapist'].includes(session.user.role);
  const canManageCase = session.user && ['manager', 'secretary'].includes(session.user.role);
  const canSeeClinical = session.user && (
    ['manager', 'secretary'].includes(session.user.role) ||
    (session.user.role === 'therapist' && Boolean(student.ownerStaffId) && student.ownerStaffId === session.user.staffId)
  );
  /* ۱.۲۵.۲۴ — تب بازی‌ها: هم‌سطح دسترسی سرور (تجویز/گزارش فقط مدیر/درمانگر)؛
     chunk مخصوص خودش دارد (import داینامیک در renderGamesTabContent) تا از بار پروفایل سبک بماند */
  const canSeeGames = session.user && ['manager', 'therapist'].includes(session.user.role);

  /* موج ۲ — ابزارهای جلسه/پیگیری در سطح نما: هم برگهٔ جلسه (طرح B)، هم تب جلسات و خط زمانی از همین می‌خوانند */
  const eventsOfAppt = (apptId) => caseEvents.filter((e) => e.appointmentId === apptId && e.status !== 'cancelled');
  const noteApptIdSet = () => new Set(noteEvents.map((n) => (n.ref?.id ? String(n.ref.id).split('/')[0] : null)).filter(Boolean));
  const isProfileOwner = () => Boolean(session.user?.staffId && student.ownerStaffId && student.ownerStaffId === session.user.staffId);
  const canCompleteFollowup = () => session.user && ['manager', 'secretary', 'therapist'].includes(session.user.role);

  /* موج ۲ — «ثبت نتیجه» روی صف پیگیری: PATCH موجود /api/followups/:id؛ حلقهٔ پیگیری بسته می‌شود */
  async function completeFollowup(e) {
    try {
      await api.patch(`/api/followups/${e.ref?.id}`, { status: 'done' });
      toast('پیگیری تکمیل شد', 'success');
      if (await refreshEventsData()) { repaintChrome(); rerenderTabIf(['timeline', 'sessions']); }
    } catch (err) {
      toastError(err);
    }
  }

  /* موج ۲ (طرح D §۳) — «جدیدها» فقط سمت کلاینت با seen-at محلی؛ صفر ریسک audit/حریم */
  const seenKey = `cs.profile.seen.${id}`;
  let seenAt = null;
  try { seenAt = localStorage.getItem(seenKey); } catch { seenAt = null; }
  const isNewEvent = (e) => Boolean(seenAt && e.at > seenAt);
  setTimeout(() => { try { localStorage.setItem(seenKey, new Date().toISOString()); } catch { /* حالت خصوصی مرورگر */ } }, 5000);

  /* ۱.۲۷.۵۶ — موج A بازطراحی پرونده (برندهٔ مسابقهٔ شش‌طرح: «فلوهای هدایت‌شده» + قاعدهٔ طرح ۱
     «هر عمل یک خانهٔ ثابت»): منطق معلق‌ها یک منبع است — هم کارت وضعیت و هم برگهٔ جلسه از همین می‌خوانند. */
  const upcomingAppt = () => {
    const nowMs = Date.now();
    return appointments
      .filter((a) => a.status === 'scheduled' && Date.parse(a.startAt) > nowMs)
      .sort((a, b) => (a.startAt < b.startAt ? -1 : 1))[0] ?? null;
  };
  const missingReportAppts = () => {
    const nowMs = Date.now();
    const notes = noteApptIdSet();
    return appointments
      .filter((a) => a.status === 'scheduled' && Date.parse(a.startAt) <= nowMs && a.myAttendance !== 'cancelled'
        && !notes.has(a.appointmentId) && eventsOfAppt(a.appointmentId).length === 0)
      .sort((a, b) => (a.startAt > b.startAt ? -1 : 1)); // قدیمی‌ترین اول
  };

  /* ۱.۲۷.۵۷ — موج B: برچسب فصل در یک نقطه — هم کارت وضعیت هم ریل تاریخچه از همین می‌خوانند
     (نسخهٔ قبلی داخل اسکوپ تب تاریخچه بود و از کارت وضعیت دیده نمی‌شد) */
  const chapterLabelOf = (ch) => {
    const meta = TIMELINE_PHASE_META[ch.phase] ?? TIMELINE_PHASE_META.scattered;
    return ch.phase === 'treatment' && (ch.run ?? 1) > 1 ? `${meta.label} ${fa(ch.run)}` : meta.label;
  };

  /* ۱.۲۷.۵۷ — موج B: ارجاع «ادامه از جلسهٔ قبل» — آخرین رویداد قطعی جلسه‌های پیشین؛
     مستقل از ترتیب آرایه نوبت‌ها (صعودی/نزولی) با مقایسهٔ زمان، نه اندیس؛
     تعریف فیلدهای فرم قبلی در case-events حل می‌شود چون کتابخانهٔ انواع آن‌جاست */
  const previousSessionEvent = (apptId) => {
    const cur = appointments.find((a) => a.appointmentId === apptId);
    if (!cur) return null;
    const before = appointments
      .filter((a) => a.appointmentId !== apptId && Date.parse(a.startAt) < Date.parse(cur.startAt))
      .sort((a, b) => (a.startAt > b.startAt ? -1 : 1)); // نزدیک‌ترین جلسهٔ قبل اول
    for (const a of before) {
      const ev = caseEvents
        .filter((e) => e.appointmentId === a.appointmentId && e.status !== 'cancelled' && e.status !== 'draft')
        .sort((x, y) => (x.at > y.at ? -1 : 1))[0];
      if (ev) return { eventTypeId: ev.eventTypeId, at: ev.occurredAt ?? ev.createdAt, payload: ev.payload ?? {} };
    }
    return null;
  };

  /* ۱.۲۷.۵۶ — حضور از خود پرونده ثبت‌شدنی می‌شود (گپ واقعی بازطراحی):
     PATCH موجود /api/attendance/:apptId/:studentId؛ سرور گیت دارد (درمانگر فقط جلسهٔ خودش). */
  async function markAttendance(a, status) {
    try {
      await api.patch(`/api/attendance/${a.appointmentId}/${id}`, { status });
      toast('حضور جلسه ثبت شد', 'success');
      if (await refreshCore()) { repaintChrome(); rerenderTabIf(['sessions', 'timeline']); }
    } catch (err) {
      toastError(err);
    }
  }
  function openAttendanceModal(a) {
    const { close } = openModal({
      title: `ثبت حضور — جلسهٔ ${formatJalaliDateTime(a.startAt)}`,
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
        [['present', 'حاضر'], ['late', 'حضور با تأخیر'], ['absent', 'غایب'], ['cancelled', 'لغو جلسه']].map(([st, lbl]) =>
          el('button', {
            class: 'btn btn--soft btn--sm', type: 'button',
            onclick: (ev) => lockBtn(ev.currentTarget, async () => { await markAttendance(a, st); close(); })
          }, lbl))
      )
    });
    void close;
  }

  /* ۱.۱۵.۰ — دکمه‌های دایره‌ای سادهٔ اقدام، روی خودِ کارت پرونده (به‌جای کاوش در تب‌ها و منوها):
     ویرایش · برچسب‌ها · هدف‌ها · معلم · تاریخچهٔ تحصیلی · حذف — همیشه جلوی چشم.
     هر دکمه با الگوی واحد قفل مشغولی (lockBtn) در برابر اسپم/دوبارکلیک محفوظ است و
     هر کدام مستقیم API خودش را می‌کوبد: PATCH پرونده، PUT هدف‌ها، POST/DELETE معلم، DELETE پرونده. */
  function buildCardCircles() {
    const circle = (iconName, label, onclick, danger = false) =>
      el('button', {
        class: `icon-circle${danger ? ' icon-circle--danger' : ''}`,
        type: 'button', title: label, 'aria-label': label,
        onclick: (e) => lockBtn(e.currentTarget, onclick)
      }, icon(iconName, 17));

    return el('div', { class: 'card-circles', role: 'group', 'aria-label': 'اقدامات پرونده' },
      circle('edit', 'ویرایش اطلاعات', () =>
        openStudentForm({ student, onSaved: onStudentSaved })),
      canManageTags
        ? circle('tag', 'برچسب‌ها', async () => {
            let tags = [];
            try { tags = await fetchTags(); } catch { tags = []; }
            openTagEditor({
              student,
              tags,
              current: studentTags,
              canCreateTag: session.user?.role === 'manager',
              onSaved: onTagsSaved
            });
          })
        : null,
      canManageTags
        ? circle('target', 'هدف‌های شناختی', () =>
            openFocusEditor({ student, onSaved: onFocusSaved }))
        : null,
      circle('users', 'معلم‌های پرونده — افزودن و حذف', () =>
        openTeacherManager(student, { onChanged: () => rerenderTabIf(['info']) })),
      circle('school', 'تاریخچهٔ تحصیلی', () =>
        openEducationHistory(student)), // — ۱.۲۰.۰: تاریخچه چیزی از این نما را عوض نمی‌کند؛ بدون rebuild
      canManageCase
        ? circle('trash', 'حذف کامل پرونده', () =>
            openStudentDelete(student, { onDeleted: () => { location.hash = '#/students'; } }), true)
        : null
    );
  }

  /* کارت وضعیت دو مرحله‌ای: در رندر فوری فقط هویت و بج‌های پایه (دادهٔ خود دانش‌آموز)؛
     پس از رسیدن دادهٔ موازی، «اقدام بعدی» و ردیف اقدامات هم اضافه می‌شوند. */
  function buildStatusCard() {
    const nextActionBlock = auxDone ? buildNextActionBlock(timeline.nextAction) : null;
    return el('div', { class: 'card' },
      el('div', { class: 'card__body' },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' } },
          el('div', { class: 'avatar-lg' }, student.firstName.charAt(0)),
          el('div', { style: { flex: 1, minWidth: 0 } },
            el('h2', { style: { marginBottom: 'var(--sp-2)' } }, `${student.firstName} ${student.lastName}`),
            el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' } },
              statusBadge(student.active ? 'active' : 'inactive'),
              student.gender ? statusBadge(student.gender) : null,
              student.grade ? el('span', { class: 'badge badge--neutral' }, gradeLabel(student.grade)) : null,
              pathwayChip(student.pathway),
              canEditPathway(student)
                ? el('button', {
                    class: 'btn btn--ghost btn--sm',
                    style: { padding: 'var(--sp-1) var(--sp-2)' },
                    title: 'تغییر مسیر پرونده — تب تفسیر بالینی بر همین اساس شاخه می‌خورد',
                    onclick: () => openPathwayModal(student, onPathwaySaved)
                  }, icon('edit', 13), 'مسیر')
                : null,
              /* ۱.۲۷.۵۷ — موج B: فصل جاری پرونده در یک نگاه — از همان فصل‌بندی تاریخچه (یک منبع) */
              auxDone && Array.isArray(timeline?.meta?.chapters) && timeline.meta.chapters.length > 0
                ? el('span', { class: 'badge badge--primary', title: 'فصل جاری پرونده — از فصل‌بندی تاریخچه' },
                    `فصل جاری: ${chapterLabelOf(timeline.meta.chapters.at(-1))}`)
                : null,
              student.ownerName
                ? el('span', { class: 'badge badge--accent', title: 'مسئول پرونده — سپردن رسمی پرونده به درمانگر' }, `مسئول پرونده: ${student.ownerName}`)
                : null,
              student.specialNeedType
                ? el('span', { class: `badge badge--${student.specialNeedSeverity === 'severe' ? 'error' : 'warning'}`, title: 'نیاز ویژهٔ شناسایی‌شده' },
                    SPECIAL_NEED_TYPE_LABELS[student.specialNeedType] ?? student.specialNeedType)
                : null,
              el('span', { class: 'cell-sub' }, `مدرسه: ${schoolName(student.schoolId) ?? '—'}${student.className ? ` — ${student.className}` : ''}`)
            )
          ),
          buildCardCircles() /* ۱.۱۵.۰ — دایره‌های اقدام گوشهٔ کارت؛ وابسته به دادهٔ موازی نیستند */
        ),
          auxDone
          ? el('div', { class: 'profile-actions' },
              nextActionBlock,
              /* ۱.۲۷.۵۶ — موج A: جلسه‌های بی‌گزارش از دلِ تب جلسات به ردیف اقدام می‌آیند (یک منبع با برگهٔ جلسه) */
              missingReportAppts().length > 0
                ? el('button', {
                    class: 'chip', type: 'button',
                    title: 'ثبت گزارش برای قدیمی‌ترین جلسهٔ بی‌گزارش',
                    onclick: () => { const m = missingReportAppts()[0]; openCaseEventForm({ student, appointmentId: m.appointmentId, previousEventRef: previousSessionEvent(m.appointmentId), onSaved: onCaseEventSaved }); }
                  }, icon('file', 13), `${fa(missingReportAppts().length)} جلسهٔ بی‌گزارش`)
                : null,
              /* ۱.۲۷.۵۶ — موج A: خانهٔ ثابتِ «شروع ثبت» — هر عمل با گیت خودش (منشی هم گزارش و صدور دارد) */
              (canCreateCaseEvents() || canSendReport)
                ? el('div', { class: 'profile-actions__row' },
                    canCreateCaseEvents()
                      ? el('button', {
                          class: 'btn btn--primary btn--sm',
                          onclick: () => openCaseEventForm({ student, onSaved: onCaseEventSaved })
                        }, icon('plus', 15), 'ثبت رویداد پرونده')
                      : null,
                    canCreateCaseEvents()
                      ? /* UX-ممیزی: دو دکمهٔ هم‌شکل که فقط در یک واژه فرق داشتند («ارسال چک‌لیست با بله» / «ارسال تمرین با بله»)
                           در یک منوی «ارسال با بله» ادغام شدند */
                        baleSendMenu()
                      : null,
                    canSendReport
                      ? el('button', {
                          class: 'btn btn--soft btn--sm',
                          onclick: () => openTeacherReportModal(student)
                        }, icon('bot', 15), 'ارسال گزارش به معلم مدرسه')
                      : null,
                    canSendReport
                      ? el('button', {
                          class: 'btn btn--soft btn--sm',
                          onclick: () => openSnapshotBuilder()
                        }, icon('file', 15), 'صدور گزارش قطعی')
                      : null
                  )
                : null,
              canManageCase ? buildOwnerEditor(student, onOwnerSaved) : null
            )
          : null
      )
    );
  }

  const content = el('div', {});
  let activeTabKey = 'info'; // تب فعال — برای بازسازی نوار پس از رسیدن داده

  /* موج ۰ طرح ارتقای پرونده (PROFILE-UPGRADE-DESIGN §۵) — سه تب کم‌اتصال (فقط student لازم دارند)
     از رجیستری سرو می‌گیرند؛ info/sessions/comms/exercises/timeline فعلاً روی fallback قدیمی‌اند
     (S4..S7 مهاجرت بعدی). رندررهای پایین عیناً به‌عنوان fallback می‌مانند — رفتار امروز دست‌نخورده. */
  const profileTabs = createProfileRegistry([
    { key: 'clinical', when: () => canSeeClinical, mount: (box) => renderClinicalTabContent(box) },
    { key: 'narrative', when: () => canSeeClinical, mount: (box) => renderNarrativeTabContent(box) },
    { key: 'games', when: () => canSeeGames, mount: (box) => renderGamesTabContent(box) } // ۱.۲۵.۲۴ — chunk داینامیک حفظ می‌شود
  ]);


  function selectTab(key, { silent = false } = {}) {
    activeTabKey = key;
    tabBar.setActive(key); // kit خودش کلیک را فعال نمی‌کند — صریح فعال می‌کنیم
    if (!silent) content.replaceChildren(skeletonState('list', 4)); /* silent = بازسازی درجای تب فعال (جریان پیوستهٔ ۱.۲۰.۰) */
    if (!auxDone) { pendingTab = key; return; } // دادهٔ موازی هنوز نرسیده — بعد از رسیدن رندر می‌شود
    /* موج ۰ — dispatch رجیستری‌اول؛ null یعنی fallback (نقشهٔ کامل قدیمی پایین حفظ شده است) */
    const desc = profileTabs.resolve(key, ctx);
    if (desc) { desc.mount(content, ctx); return; }
    const renderer = {
      info: renderInfoTab,
      clinical: renderClinicalTabContent, //
      timeline: renderTimelineTab,
      sessions: renderSessionsTab,
      comms: renderCommsTab,
      exercises: renderExercisesTabContent,
      games: renderGamesTabContent, // ۱.۲۵.۲۴ — میز تجویز بازی در خود پرونده
      narrative: renderNarrativeTabContent // ۱.۲۷.۲۶ — M3 POLISH-3: روایت بالینی
    }[key];
    (renderer ?? renderInfoTab)(content);
  }

  /* UX-ممیزی: منوی «ارسال با بله» — جای دو دکمهٔ دوقلو */
  function baleSendMenu() {
    const panel = el('div', { class: 'dd__panel', style: { display: 'none' } });
    const btn = el('button', { class: 'btn btn--soft btn--sm', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
      icon('send', 14), 'ارسال با بله', icon('chevD', 12));
    const root = el('div', { class: 'dd' }, btn, panel);
    function close() {
      panel.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', esc, true);
    }
    function outside(e) { if (!root.contains(e.target)) close(); }
    function esc(e) { if (e.key === 'Escape') { close(); btn.focus(); } }
    btn.addEventListener('click', () => {
      const open = panel.style.display !== 'none';
      if (open) { close(); return; }
      panel.replaceChildren(
        el('button', { class: 'dd__item', onclick: () => { close(); openChecklistSendModal({ student, onSent: onCaseEventSaved }); } }, icon('checklist', 14), el('span', {}, 'چک‌لیست جلسه')), 
        el('button', { class: 'dd__item', onclick: () => { close(); openExerciseSendModal({ student, onSent: onBaleSent }); } }, icon('file', 14), el('span', {}, 'تمرین‌های دانش‌آموز'))
      );
      ddOpen(btn, panel); /* ۱.۲۷.۷۲ — منو زیر دکمه لنگر می‌شود؛ دیگر در اسکرول موبایل جدا نمی‌افتد */
      document.addEventListener('mousedown', outside, true);
      document.addEventListener('keydown', esc, true);
    });
    return root;
  }

  function tabItems() {
    return [
      { key: 'info', label: 'اطلاعات پایه', icon: 'user', onSelect: selectTab },
      ...(canSeeClinical ? [{ key: 'clinical', label: 'تفسیر بالینی', icon: 'brain', onSelect: selectTab }] : []),
      ...(canSeeClinical ? [{ key: 'narrative', label: 'روایت بالینی', icon: 'book', onSelect: selectTab }] : []), // ۱.۲۷.۲۶ — M3 POLISH-3: خط زمان «از فرضیه تا نتیجه»
      { key: 'timeline', label: 'تاریخچه', icon: 'clock', onSelect: selectTab },
      { key: 'sessions', label: auxDone ? `جلسات (${fa(appointments.length)})` : 'جلسات', icon: 'calendar', onSelect: selectTab },
      { key: 'exercises', label: 'تمرین‌ها', icon: 'file', onSelect: selectTab },
      ...(canSeeGames ? [{ key: 'games', label: 'بازی‌ها', icon: 'gamepad', onSelect: selectTab }] : []), // ۱.۲۵.۲۴
      { key: 'comms', label: 'ارتباطات', icon: 'bot', onSelect: selectTab }
    ];
  }
  let tabBar = tabs(tabItems(), 'info');

  const docsMount = el('div', { style: { marginTop: 'var(--sp-4)' } });
  renderDocsQuickCard(docsMount, student); // — ۱.۲۰.۰: کارت مدارک خودگردان است؛ نیازی به rebuild کل نما ندارد

  let statusCard = buildStatusCard();

    container.replaceChildren(
      el('div', { class: 'page-head' },
        el('div', { class: 'page-head__title' }, 'پروفایل دانش‌آموز'),
        el('div', { style: { display: 'flex', gap: 'var(--sp-2)' } },
          el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { location.hash = '#/students'; } }, icon('chevR', 16), 'بازگشت به فهرست')
        )
      ),
    statusCard,
    docsMount,
    el('div', { style: { marginTop: 'var(--sp-4)' } }, tabBar.root),
    el('div', { style: { marginTop: 'var(--sp-4)' } }, content)
  );

  const requestedTab = ctx.query?.tab;
  const timelineDeepFilter = ctx.query?.filter ?? (requestedTab === 'followups' ? 'followups' : null);
  const knownTabs = ['info', 'timeline', 'sessions', 'comms', 'exercises'];
  if (canSeeClinical) knownTabs.splice(1, 0, 'clinical', 'narrative');
  selectTab(requestedTab === 'followups' ? 'timeline' : (knownTabs.includes(requestedTab) ? requestedTab : 'info'));

  /* رسیدن دادهٔ پس‌زمینه: کارت وضعیت و نوار تب‌ها درجا تازه می‌شوند و تب در انتظار (یا تب فعال)
     با دادهٔ کامل رندر می‌شود. */
  auxPromise.then(() => {
    auxDone = true;
    repaintChrome();
    /* موج ۲ (طرح B) — لندینگ نقش‌محور: فقط وقتی کاربر خودش تب درخواست نکرده و درمانگرِ مسئول
       نوبت امروز/فردای نزدیک دارد، برگهٔ جلسه (تب جلسات) جای اطلاعات پایه می‌نشیند؛
       دیپ‌لینک‌ها عیناً محترم‌اند. */
    const nowMs = Date.now();
    if (!requestedTab && !pendingTab && isProfileOwner()
      && appointments.some((a) => a.status === 'scheduled' && Date.parse(a.startAt) > nowMs && Date.parse(a.startAt) - nowMs <= 2 * 86_400_000)) {
      selectTab('sessions');
      return;
    }
    const target = pendingTab ?? activeTabKey;
    pendingTab = null;
    selectTab(target);
  });

  /* — ۱.۲۰.۰ جریان پیوستهٔ پروفایل (الگوی ۱.۱۹.۰ روز کاری): هیچ اکشنی دیگر کل نما را re-render نمی‌کند.
     هر mutation فقط دادهٔ خودش را بی‌صدا تازه می‌کند و کارت وضعیت/نوار تب‌ها درجا عوض می‌شوند؛
     تب فعال فقط وقتی دوباره رندر می‌شود که دادهٔ آن واقعاً عوض شده — بدون اسکلت کل صفحه و پرش اسکرول. */
  let refreshSeq = 0;
  const seqGuard = () => { const s = ++refreshSeq; return () => s === refreshSeq; };

  /* تعویض درجای کارت وضعیت + نوار تب‌ها (همان الگوی رسیدن دادهٔ پس‌زمینه) */
  function repaintChrome() {
    const freshCard = buildStatusCard();
    statusCard.replaceWith(freshCard);
    statusCard = freshCard;
    const freshBar = tabs(tabItems(), activeTabKey);
    tabBar.root.replaceWith(freshBar.root);
    tabBar = freshBar;
  }

  /* تب فعال فقط وقتی دوباره رندر می‌شود که دادهٔ آن واقعاً عوض شده — صفحه‌بندی/فیلتر محلی بقیهٔ تب‌ها می‌ماند */
  function rerenderTabIf(keys) {
    if (keys.includes(activeTabKey)) selectTab(activeTabKey, { silent: true });
  }

  async function refreshCore() {
    const isStale = seqGuard();
    try { student = (await api.get(`/api/students/${id}`)).data; } catch (err) { toastError(err); return false; }
    return isStale();
  }

  async function refreshTagsData() {
    const isStale = seqGuard();
    try { studentTags = await fetchStudentTags(id); allTags = await fetchTags(); } catch (err) { toastError(err); return false; }
    return isStale();
  }

  async function refreshFocusData() {
    const isStale = seqGuard();
    try {
      const [keys, map] = await Promise.all([fetchStudentFocus(id), focusLabels()]);
      studentFocus = keys.map((k) => ({ key: k, fa: map[k] ?? k }));
    } catch (err) { toastError(err); return false; }
    return isStale();
  }

  /* رویدادها + صفحهٔ اول تایم‌لاین: nextAction کارت وضعیت هم از همین تایم‌لاین می‌آید */
  async function refreshEventsData() {
    const isStale = seqGuard();
    try {
      const [evRes, tlRes] = await Promise.all([
        api.get(`/api/students/${id}/case-events${qs({ limit: 200 })}`).catch(() => ({ data: [] })),
        api.get(`/api/students/${id}/timeline${qs({ limit: TIMELINE_PAGE })}`)
      ]);
      caseEvents = evRes.data;
      timeline = tlRes;
    } catch (err) { toastError(err); return false; }
    return isStale();
  }

  const onStudentSaved = async () => { if (await refreshCore()) { repaintChrome(); rerenderTabIf(['info', 'comms']); } };
  const onTagsSaved = async () => { if (await refreshTagsData()) { repaintChrome(); rerenderTabIf(['info']); } };
  const onFocusSaved = async () => { if (await refreshFocusData()) { repaintChrome(); rerenderTabIf(['info']); } };
  const onPathwaySaved = async () => { if (await refreshCore()) { repaintChrome(); rerenderTabIf(['info', 'clinical']); } };
  const onOwnerSaved = async () => { if (await refreshCore()) repaintChrome(); };
  const onSpecialNeedSaved = async () => { if (await refreshCore()) { repaintChrome(); rerenderTabIf(['info']); } };
  const onCaseEventSaved = async () => { if (await refreshEventsData()) { repaintChrome(); rerenderTabIf(['timeline', 'sessions']); } };
  const onBaleSent = async () => { if (await refreshEventsData()) { repaintChrome(); rerenderTabIf(['timeline', 'sessions', 'exercises']); } };

  function renderExercisesTabContent(box) {
    renderExercisesTab(box, { student, onChanged: async () => { if (await refreshEventsData()) rerenderTabIf(['timeline', 'sessions']); } }); /* ۱.۲۰.۰ */
  }

  /* ۱.۲۵.۲۴ — تب بازی‌ها: میز تجویز/مأموریت/لینک در خود پرونده؛
     chunk بازی‌ها فقط با ورود به این تب fetch می‌شود (خارج از بوت و خارج از chunk پروفایل) */
  function renderGamesTabContent(box) {
    box.replaceChildren(skeletonState('list', 3));
    import('../games-console.js')
      .then((m) => {
        m.renderRxPanel(box, { childId: student.id, childName: `${student.firstName} ${student.lastName}`, embedded: true });
      })
      .catch((err) => {
        box.replaceChildren(errorState(err, () => renderGamesTabContent(box)));
      });
  }

  /* ۱.۲۷.۲۶ — M3 POLISH-3: تب روایت بالینی — chunk فقط با ورود به تب fetch می‌شود (الگوی games-console) */
  function renderNarrativeTabContent(box) {
    box.replaceChildren(skeletonState('list', 3));
    import('../student-narrative.js')
      .then((m) => m.renderNarrativeTab(box, { student }))
      .catch((err) => box.replaceChildren(errorState(err, () => renderNarrativeTabContent(box))));
  }

  function renderClinicalTabContent(box) {
    renderClinicalTab(box, { student });
  }

  function renderInfoTab(box) {
    // بج هدف‌های شناختی پروفایل (نیمهٔ علمی درخت؛ برچسب فارسی از درخت واحد)
    const focusBadges = studentFocus.length > 0
      ? el('div', { class: 'profile-tags__list' }, studentFocus.map((f) =>
          el('span', { class: 'tag-chip', title: 'هدف شناختی پروفایل' }, icon('target', 12), f.fa)))
      : el('span', { class: 'cell-sub' }, 'بدون هدف شناختی — برای پیشنهاد هدفمند کارت در «ارسال تمرین»، هدف‌ها را انتخاب کنید.');
    const focusRow = el('div', { class: 'profile-tags' },
      focusBadges,
      canManageTags
        ? el('button', {
            class: 'btn btn--soft btn--sm',
            onclick: () => openFocusEditor({ student, onSaved: onFocusSaved })
          }, icon('target', 15), studentFocus.length === 0 ? 'افزودن هدف' : 'ویرایش هدف‌ها')
        : null
    );

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
              onSaved: onTagsSaved
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
          el('div', { style: { marginTop: 'var(--sp-4)' } }, focusRow), // هدف‌های شناختی، بالای برچسب‌ها
          el('div', { style: { marginTop: 'var(--sp-4)' } }, tagsRow),
          buildSpecialNeedBlock(student, canManageCase, container, ctx),
          el('div', {
            class: 'card',
            style: { marginTop: 'var(--sp-4)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap' }
          },
            el('div', {},
              el('div', { class: 'card__title', style: { fontSize: '14px', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } }, icon('school', 16), 'تاریخچهٔ تحصیلی'),
              el('div', { class: 'cell-sub', style: { marginTop: 'var(--sp-1)' } }, 'سابقهٔ سال‌به‌سال: کجا درس خوانده، سطح هر سال و توضیحات')
            ),
            el('button', {
              class: 'btn btn--soft btn--sm',
              onclick: () => openEducationHistory(student) // — ۱.۲۰.۰
            }, icon('eye', 15), 'مشاهده / مدیریت')
          ),
          renderTeachersCard(student, container, ctx)
          /* ۱.۲۷.۵۶ — موج A: ردیف تکراری انتهای تب info حذف شد — «ویرایش اطلاعات» در دایره‌های
             اقدام کارت وضعیت است و «گزارش به معلم» و «صدور گزارش قطعی» خانهٔ ثابت‌شان ردیف
             اقدامِ همان کارت است (همیشه نمایان، مستقل از تب فعال) */
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
      loading: false,
      chapters: Array.isArray(timeline.chapters) ? timeline.chapters : [], // موج ۱ — فصل‌های کل خط زمانی
      range: null, // موج ۱ — نمای یک فصل با from/to سرور (پارامتر موجود)
      lastChapterId: null, // موج ۱ — سرصفهٔ فصل در append ادامه می‌یابد
      q: null // موج ۲ — جست‌وجوی متنی سرور-محور
    };

    const list = el('div', { class: 'tl-list' });
    const moreBtn = el('button', { class: 'btn btn--soft btn--sm', type: 'button', style: { marginTop: 'var(--sp-4)' }, onclick: (e) => { const btn = e.currentTarget; /* F1: currentTarget بعد از dispatch تهی می‌شود — پیش از کار ناهمگام گرفتارش کن */ btn.disabled = true; btn.setAttribute('aria-busy', 'true'); loadMore().finally(() => { btn.disabled = false; btn.removeAttribute('aria-busy'); }); } /* S4-23 */ }, icon('refresh', 15), 'نمایش رویدادهای بیشتر');
    /* موج ۲ — جست‌وجوی متنی سرور-محور (طرح D §۳): q با debounce؛ گارد نسل همان F2 */
    let searchTimer = 0;
    const searchInput = el('input', {
      class: 'input', type: 'search',
      placeholder: 'جست‌وجو در تاریخچه (عنوان، توضیح، ثبت‌کننده)…',
      'aria-label': 'جست‌وجو در تاریخچهٔ پرونده',
      style: { marginBottom: 'var(--sp-2)', maxWidth: '420px' },
      oninput: (e) => {
        clearTimeout(searchTimer);
        const v = e.currentTarget.value.trim();
        searchTimer = setTimeout(() => {
          state.q = v.length >= 2 ? v : null;
          state.offset = 0;
          state.events = [];
          load(false);
        }, 300);
      }
    });

    const chips = el('div', { class: 'tl-filters' });

    for (const f of TIMELINE_FILTERS) {
      const chip = el('button', { class: `chip${state.filter === f.key ? ' is-active' : ''}`, onclick: () => setFilter(f.key) }, f.label);
      chip.dataset.key = f.key;
      chips.appendChild(chip);
    }

    /* موج ۱ — ریل فصل‌ها: کلیک روی هر فصل = نمای همان بازه با from/to سرور؛ بدون endpoint تازه */
    const rail = el('div', { class: 'tl-filters', style: { marginBottom: 'var(--sp-2)' } });
    function chapterLabel(ch) {
      return chapterLabelOf(ch); /* ۱.۲۷.۵۷ — موج B: یک منبع، هم کارت وضعیت هم ریل */
    }
    function paintRail() {
      const chs = state.chapters ?? [];
      if (chs.length < 2) { rail.replaceChildren(); rail.style.display = 'none'; return; }
      rail.replaceChildren(
        el('button', { class: `chip${state.range ? '' : ' is-active'}`, onclick: () => setRange(null) }, 'همهٔ دوره‌ها'),
        ...chs.map((ch) => el('button', {
          class: `chip${state.range?.from === ch.from ? ' is-active' : ''}`,
          title: `${chapterLabel(ch)} — از ${formatJalaliNumeric(String(ch.from).slice(0, 10))}`,
          onclick: () => setRange({ from: ch.from, to: ch.to })
        }, chapterLabel(ch)))
      );
      rail.style.display = '';
    }
    function setRange(range) {
      state.range = range;
      state.offset = 0;
      state.events = [];
      refreshChips();
      paintRail();
      load(false);
    }

    function refreshChips() {
      for (const c of chips.children) c.classList.toggle('is-active', c.dataset.key === state.filter);
    }

    function setFilter(key) {
      state.filter = key;
      state.offset = 0;
      state.events = [];
      state.range = null; // موج ۱ — فیلتر نوع، نمای فصل را پاک می‌کند
      refreshChips();
      paintRail();
      load(false);
    }

    let gen = 0; // F2: گارد نسل — پاسخ کهنهٔ فیلتر عوض‌شده نباید زیر چیپ فعال بنشیند (الگوی waitlist/progress-board)
    async function load(append) {
      const myGen = ++gen;
      state.loading = true;
      if (!append) state.lastChapterId = null; // موج ۱ — سرصفه از نو
      const f = TIMELINE_FILTERS.find((x) => x.key === state.filter);
      const query = { limit: TIMELINE_PAGE, offset: state.offset };
      if (f?.kinds) query.kinds = f.kinds;
      if (state.range) { query.from = state.range.from; query.to = state.range.to; }
      if (state.q) query.q = state.q; // موج ۲
      try {
        const res = await api.get(`/api/students/${id}/timeline${qs(query)}`);
        if (myGen !== gen) return; // F2: پاسخ کهنه — فیلتر/صفحهٔ جدیدتری در پرواز است
        state.events = append ? [...state.events, ...res.data] : res.data;
        state.hasMore = Boolean(res.meta?.hasMore);
        if (Array.isArray(res.meta?.chapters) && res.meta.chapters.length > 0) { // موج ۱ — فصل‌ها همیشه از کل خط زمانی
          state.chapters = res.meta.chapters;
          paintRail();
        }
        paint();
      } catch (err) {
        if (myGen === gen) toastError(err);
      }
      if (myGen === gen) state.loading = false;
    }

    function loadMore() {
      if (state.loading) return; // بار در پرواز است — «بیشتر» تا پایانش صفحه می‌پرد
      state.offset += TIMELINE_PAGE;
      load(true);
    }

    function paint() {
      if (state.events.length === 0) {
        list.replaceChildren(
          emptyState({ iconName: 'clock', title: 'رویدادی ثبت نشده', hint: 'با ثبت نوبت، گزارش جلسه، ارزیابی یا پیگیری، تاریخچهٔ پرونده اینجا ساخته می‌شود.' })
        );
      } else {
        /* موج ۱ — سرصفهٔ فصل پیش از اولین رویداد هر فصل در جریان (هم در صفحهٔ اول، هم در append)؛
           موج ۲ — در «صف پیگیری» ترتیب سررسیدی حاکم است و سرصفه فصل نمی‌گیرد (نمای وظیفه‌محور) */
        const queueMode = state.filter === 'followups';
        let evs = state.events;
        if (queueMode) {
          const nowIso = new Date().toISOString();
          evs = [...evs].sort((a, b) => {
            const pr = (x) => (x.open && (!x.dueAt || x.dueAt < nowIso) ? 0 : x.open ? 1 : 2);
            const pa = pr(a); const pb = pr(b);
            if (pa !== pb) return pa - pb;
            const da = a.dueAt ?? '9999-12-31T23:59:59.999Z';
            const db = b.dueAt ?? '9999-12-31T23:59:59.999Z';
            if (da !== db) return da < db ? -1 : 1;
            return a.at > b.at ? -1 : 1;
          });
        }
        const parts = [];
        let lastCh = state.lastChapterId;
        for (const e of evs) {
          if (!queueMode && e.chapterId && e.chapterId !== lastCh) {
            const ch = (state.chapters ?? []).find((c) => c.id === e.chapterId);
            if (ch) parts.push(chapterHeader(ch));
            lastCh = e.chapterId;
          }
          parts.push(timelineItem(e));
        }
        state.lastChapterId = lastCh;
        list.replaceChildren(...parts);
      }
      moreBtn.style.display = state.hasMore ? '' : 'none';
    }

    box.replaceChildren(el('div', { class: 'card' },
      el('div', { class: 'card__head' },
        el('div', { class: 'card__title' }, 'تاریخچهٔ پرونده')
        /* ۱.۲۷.۵۶ — موج A: دکمهٔ «ثبت رویداد» از سرصفه حذف شد — خانهٔ ثابتِ آن ردیف اقدام کارت
           وضعیت است (همیشه نمایان)؛ میان‌بر تکراری گیج‌کننده بود */
      ),
      el('div', { class: 'card__body' }, rail, searchInput, chips, list, moreBtn)
    ));

    paintRail();
    if (state.events.length === 0) load(false);
    else paint();
  }

  const KIND_LINKS = {
    session_note: { hash: '#/reports', label: 'یادداشت جلسه در «گزارش جلسات من»' },
    exercise: { hash: '#/exercises', label: 'مشاهده در کارت‌های آماده' }, // ریبرند
    followup: { hash: `#/students/${id}?tab=timeline&filter=followups`, label: 'مشاهده در تاریخچه (فیلتر پیگیری)' },
    appointment: { hash: '#/appointments', label: 'مشاهده در تقویم نوبت‌ها' },
    appointment_moved: { hash: '#/appointments', label: 'مشاهده در تقویم نوبت‌ها' },
    notification: { hash: `#/students/${id}?tab=comms`, label: 'مشاهده در تب ارتباطات' },
    waitlist: { hash: '#/waitlist', label: 'مشاهده لیست انتظار' } // — ماژول مستقل
  };

  function timelineItem(e) {
    const meta = KIND_META[e.kind] ?? { icon: 'clock', tone: 'neutral' };
    const isCaseEvent = e.kind === 'case_event' && e.ref?.type === 'case_event';
    const isSnapshot = e.kind === 'report_export' && e.ref?.type === 'report_snapshot'; // موج ۳
    const link = !isCaseEvent && !isSnapshot ? KIND_LINKS[e.kind] : null;
    const clickable = isCaseEvent || isSnapshot || Boolean(link);
    const openAction = isSnapshot
      ? () => openSnapshotModal(String(e.ref.id))
      : isCaseEvent
      ? async () => {
          try {
            const res = await api.get(`/api/case-events/${e.ref.id}`);
            openCaseEventDetail(res.data, { onChanged: onCaseEventSaved });
          } catch (err) {
            toastError(err);
          }
        }
      : link
        ? () => { location.hash = link.hash; }
        : null;
    const card = el('div', {
      class: 'tl-item__card',
      style: clickable ? { cursor: 'pointer' } : null,
      /* S4-22: آیتم کلیک‌پذیرِ تایم‌لاین با کیبورد هم باز می‌شود */
      ...(clickable ? { role: 'button', tabindex: '0' } : {}),
      onclick: openAction
    },
      el('div', { class: 'tl-item__head' },
        el('span', { class: 'tl-item__title' }, e.title),
        e.milestone ? el('span', { title: e.milestoneLabel ?? 'لحظهٔ کلیدی تاریخچهٔ پرونده', 'aria-label': 'لحظهٔ کلیدی' }, icon('star', 13)) : null, // موج ۱
        isNewEvent(e) ? el('span', { class: 'badge badge--primary' }, 'جدید') : null, // موج ۲
        el('span', { class: 'tl-item__time' }, formatJalaliDateTime(e.at))
      ),
      e.subtitle ? el('div', { class: 'tl-item__sub' }, e.subtitle) : null,
      e.actor ? el('div', { class: 'tl-item__actor' }, `توسط ${e.actor}`) : null,
      e.kind === 'followup' && e.open
        ? el('div', { style: { marginTop: 'var(--sp-2)', display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' } },
            (e.dueAt && e.dueAt < new Date().toISOString())
              ? el('span', { class: 'badge badge--error' }, 'عقب‌افتاده')
              : el('span', { class: 'badge badge--warning' }, 'باز'),
            canCompleteFollowup()
              ? el('button', { class: 'btn btn--soft btn--sm', type: 'button', onclick: (ev2) => lockBtn(ev2.currentTarget, () => completeFollowup(e)) }, icon('check', 12), 'ثبت نتیجه')
              : null)
        : null, // موج ۲ — صف پیگیری اکشن‌محور (طرح B/E)
      isCaseEvent ? (() => {
        const ev = caseEvents.find((x) => x.id === e.ref?.id);
        if (!ev) return null;
        const t = fillTargetOf({ category: ev.typeCategory, familyFillable: ev.typeFamilyFillable, audience: ev.typeAudience });
        return el('div', { style: { marginTop: 'var(--sp-2)' } }, el('span', { class: `badge ${t.badgeClass}` }, t.badge));
      })() : null,
      link ? el('div', { class: 'tl-item__actor', style: { color: 'var(--primary)' } }, `↖ ${link.label}` /* S4-06 */) : null
    );
    if (openAction) card.addEventListener('keydown', (e) => { /* S4-22 */
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAction(); }
    });
    return el('div', { class: 'tl-item' },
      el('div', { class: `tl-item__dot tl-item__dot--${meta.tone}` }, icon(meta.icon, 17)),
      card
    );
  }

  /* موج ۲ (طرح B) — برگهٔ جلسه: پاسخ سه‌سؤالِ قبل از جلسه («از قبل چه گذشت / چه معلق است / جلسهٔ بعد کی»)
     فقط از دادهٔ همین نما — صفر fetch تازه؛ بدون برگه معنادار، اصلاً رندر نمی‌شود (بدون placeholder) */
  function buildSessionSheet() {
    if (!canCreateCaseEvents()) return null;
    const nowMs = Date.now();
    const upcoming = upcomingAppt(); // ۱.۲۷.۵۶ — منبع واحد معلق‌ها با کارت وضعیت
    const missingReports = missingReportAppts();
    const openFollowup = timeline.nextAction?.type === 'followup' ? timeline.nextAction : null;
    if (!upcoming && missingReports.length === 0 && !openFollowup) return null;
    const lastAppt = appointments
      .filter((a) => Date.parse(a.startAt) <= nowMs && a.myAttendance !== 'cancelled' && a.myAttendance !== 'absent')
      .sort((a, b) => (a.startAt > b.startAt ? -1 : 1))[0] ?? null;
    const lastEvs = lastAppt ? eventsOfAppt(lastAppt.appointmentId) : [];
    const strip = [];
    if (openFollowup) {
      const overdue = !openFollowup.at || Date.parse(openFollowup.at) < nowMs;
      strip.push(el('button', {
        class: 'chip', type: 'button',
        title: 'مشاهده در خط زمانی (فیلتر پیگیری)',
        onclick: () => { location.hash = `#/students/${id}?tab=timeline&filter=followups`; }
      }, icon('bell', 13), overdue ? 'پیگیری عقب‌افتاده' : 'پیگیری باز', openFollowup.at ? el('span', { class: 'cell-sub' }, `— سررسید: ${formatJalaliDateTime(openFollowup.at)}`) : null));
    }
    if (missingReports.length > 0) {
      strip.push(el('button', {
        class: 'chip', type: 'button',
        title: 'ثبت گزارش برای قدیمی‌ترین جلسهٔ بی‌گزارش',
        onclick: () => openCaseEventForm({ student, appointmentId: missingReports[0].appointmentId, onSaved: onCaseEventSaved })
      }, icon('file', 13), `${fa(missingReports.length)} جلسهٔ گذشتهٔ بی‌گزارش`));
    }
    const continueRow = lastAppt
      ? el('div', { style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' } },
          el('span', { class: 'cell-sub' }, `ادامه از جلسهٔ قبل — ${formatJalaliDateTime(lastAppt.startAt)}:`),
          lastEvs.length > 0
            ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => openCaseEventDetail(lastEvs[0], { onChanged: onCaseEventSaved }) }, icon('eye', 13), `رویداد جلسهٔ قبل${lastEvs.length > 1 ? ` (${fa(lastEvs.length)})` : ''}`)
            : el('span', { class: 'cell-sub' }, 'بدون رویداد ثبت‌شده'))
      : null;
    return el('div', { class: 'card', style: { border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-4)' } },
      el('div', { class: 'card__title', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '14px' } }, icon('calendar', 15), upcoming ? 'برگهٔ جلسهٔ پیش رو' : 'برگهٔ جلسه'),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' } },
        upcoming
          ? el('div', { class: 'cell-sub' }, `جلسهٔ بعدی: ${formatJalaliDateTime(upcoming.startAt)}${upcoming.staffName ? ` — ${upcoming.staffName}` : ''}`)
          : null,
        continueRow,
        strip.length > 0
          ? el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' } }, strip)
          : el('div', { class: 'cell-sub' }, 'معلقی نیست — گزارش جلسات و پیگیری‌های این پرونده به‌روز است.')
      )
    );
  }

  /* ═══ موج ۳ (طرح C «پروندهٔ ناشر») — خروجی نسخه‌دار ═══
     فلوی سه‌گامی: انتخاب مسیر → قطعی‌سازی (snapshot با شمارهٔ سالانه/SHA-256/امضا) → بازکردن نسخهٔ قطعی.
     بازخوانی فقط از snapshot نه دادهٔ زنده؛ رندر نسخهٔ قطعی از سند ذخیره‌شده است (snapshot-first). */

  function renderSnapshotBody(content, rec, variant) {
    const sec = rec.sections ?? {};
    const s = sec.summary ?? {};
    const m = sec.monitoring ?? {};
    const sessions = Array.isArray(sec.sessions) ? sec.sessions : [];
    const kv = (k, v) => row(k, v ?? '—');
    const fmtJal = (v) => (v ? formatJalaliNumeric(String(v).slice(0, 10)) : '—');
    const pctOf = (v) => (v === null || v === undefined) ? '—' : `${fa(v)}٪`;

    if (variant === 'family') {
      const p = sec.parent ?? {};
      content.replaceChildren(
        el('div', { class: 'card' },
          el('div', { class: 'card__body' },
            p.headline ? el('h3', { style: { margin: '0 0 var(--sp-2)', fontSize: '15px' } }, p.headline) : null,
            ...(p.paragraphs ?? []).map((t) => el('p', { style: { margin: '0 0 var(--sp-2)', lineHeight: '1.9' } }, t)),
            Array.isArray(p.tips) && p.tips.length > 0
              ? el('div', { style: { marginTop: 'var(--sp-2)' } },
                  el('div', { class: 'card__title', style: { fontSize: '13px', marginBottom: 'var(--sp-1)' } }, 'توصیه‌ها'),
                  ...p.tips.map((t) => el('div', { class: 'cell-sub', style: { margin: '0 0 var(--sp-1)' } }, `• ${t}`)))
              : null,
            sec.familySummary ? el('p', { class: 'cell-sub', style: { marginTop: 'var(--sp-3)', lineHeight: '1.9' } }, sec.familySummary) : null
          )
        )
      );
      return;
    }

    if (variant === 'school') {
      const sc = sec.school ?? {};
      content.replaceChildren(
        el('div', { class: 'card' },
          el('div', { class: 'card__body' },
            sc.headline ? el('h3', { style: { margin: '0 0 var(--sp-2)', fontSize: '15px' } }, sc.headline) : null,
            ...(sc.performance ?? []).map((t) => el('p', { style: { margin: '0 0 var(--sp-2)', lineHeight: '1.9' } }, t)),
            Array.isArray(sc.actions) && sc.actions.length > 0
              ? el('div', { style: { marginTop: 'var(--sp-2)' } },
                  el('div', { class: 'card__title', style: { fontSize: '13px', marginBottom: 'var(--sp-1)' } }, 'اقدام‌های پیشنهادی'),
                  ...sc.actions.map((t) => el('div', { class: 'cell-sub', style: { margin: '0 0 var(--sp-1)' } }, `• ${t}`)))
              : null
          )
        )
      );
      return;
    }

    // واریانت متخصص: جمع‌بندی + پایش سه‌پرسشی + جدول جلسات + خلاصهٔ خانواده
    content.replaceChildren(
      el('div', { class: 'card' },
        el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'جمع‌بندی دوره')),
        el('div', { class: 'card__body' },
          el('div', { class: 'info-list' },
            kv('هدف مداخله', sec.pathway?.targetTitle),
            kv('قالب', sec.pathway?.templateTitle),
            kv('جلسات برگزار', `${fa(s.sessionsDone ?? 0)} از ${fa(s.sessionsTotal ?? 0)}${s.sessionsSkipped ? ` — ${fa(s.sessionsSkipped)} اجرا نشده` : ''}`),
            kv('کارت‌های انجام‌شده', `${fa(s.cardsDone ?? 0)} از ${fa(s.cardsTotal ?? 0)}${s.cardsDonePct != null ? ` (${fa(s.cardsDonePct)}٪)` : ''}`),
            kv('بازهٔ نتایج', `${fmtJal(s.doneDateFirst)} تا ${fmtJal(s.doneDateLast)}`),
            kv('تسلط آخرین سنجش', m.masteryPct != null ? `${pctOf(m.masteryPct)}${m.masteryAchieved ? ' — به هدف رسیده' : ''}` : null),
            kv('شیب به‌ازای جلسه', m.slopePerSession != null ? fa(m.slopePerSession) : null),
            kv('پایبندی دوز', m.doseAdherencePct != null ? pctOf(m.doseAdherencePct) : null),
            kv('وفاداری اجرا', m.fidelityPct != null ? pctOf(m.fidelityPct) : null),
            kv('تصمیم پایش', m.decisionLabel ?? null)
          ),
          sec.familySummary ? el('p', { class: 'cell-sub', style: { marginTop: 'var(--sp-3)', lineHeight: '1.9' } }, sec.familySummary) : null
        )
      ),
      el('div', { class: 'card', style: { marginTop: 'var(--sp-3)' } },
        el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, `جلسات (${fa(sessions.length)})`)),
        el('div', { class: 'card__body' },
          sessions.length === 0
            ? el('div', { class: 'cell-sub' }, 'جلسه‌ای در این دوره ثبت نشده بود — بخش خالی صادقانه می‌گوید، جای‌نگهدار نیست.')
            : dataTable({
                columns: [
                  { key: 'ord', label: '#', render: (r) => fa(r.ord) },
                  { key: 'title', label: 'جلسه', render: (r) => r.title ?? '—' },
                  { key: 'status', label: 'وضعیت', render: (r) => statusBadge(r.status) },
                  { key: 'doneAt', label: 'انجام', render: (r) => fmtJal(r.doneAt) },
                  { key: 'cards', label: 'کارت‌ها', render: (r) => `${fa(r.cardsDone ?? 0)}/${fa(r.cardsTotal ?? 0)}` },
                  { key: 'outcome', label: 'نتیجه', render: (r) => r.outcome ?? '—' }
                ],
                rows: sessions
              })
        )
      )
    );
  }

  /* ۱.۲۷.۵۷ — موج C: چاپ A4 از snapshot — همان محتوای واریانت جاری با سربرگ سند؛ فقط از سند
     قطعی رندر می‌شود نه دادهٔ زندهٔ پرونده (snapshot-first) */
  function printSnapshot(rec, variant, contentNode) {
    const audienceLabel = { clinical: 'برای مخاطب: متخصص', family: 'برای مخاطب: خانواده', school: 'برای مخاطب: مدرسه' }[variant] ?? '';
    let root = document.getElementById('print-root');
    if (!root) { root = el('div', { id: 'print-root' }); document.body.appendChild(root); }
    root.replaceChildren(
      el('div', { class: 'print-doc' },
        el('div', { class: 'print-doc__head' },
          el('div', { class: 'print-doc__title' }, 'گزارش قطعی دورهٔ مداخله'),
          el('div', {}, `${student.firstName} ${student.lastName} — کد ملی: ${fa(student.nationalId ?? '—')}${student.grade ? ` — پایهٔ ${gradeLabel(student.grade)}` : ''}`),
          el('div', {}, `شمارهٔ گزارش: ${fa(rec.reportNo)} — تاریخ قطعی: ${formatJalaliDateTime(rec.createdAt)}${rec.signedName ? ` — امضا: ${rec.signedName}${rec.signedRole ? ` (${rec.signedRole})` : ''}` : ''}`),
          el('div', {}, audienceLabel)
        ),
        contentNode.cloneNode(true)
      )
    );
    const cleanup = () => { root.replaceChildren(); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  async function openSnapshotModal(sid) {
    let rec;
    try {
      rec = (await api.get(`/api/students/${id}/report-snapshots/${sid}`)).data;
    } catch (err) {
      toastError(err);
      return;
    }
    let variant = 'clinical';
    const content = el('div', {});
    const variantRow = el('div', { class: 'tl-filters' });
    function paintVariant() {
      variantRow.replaceChildren(...[
        { key: 'clinical', label: 'متخصص' },
        { key: 'family', label: 'خانواده' },
        { key: 'school', label: 'مدرسه' }
      ].map((v) => el('button', { class: `chip${variant === v.key ? ' is-active' : ''}`, onclick: () => { variant = v.key; paintVariant(); } }, v.label)));
      renderSnapshotBody(content, rec, variant);
    }
    paintVariant();
    openModal({
      title: `گزارش قطعی — شمارهٔ ${fa(rec.reportNo)}`,
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
        el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' } },
          rec.createdAt ? el('span', { class: 'cell-sub' }, `تاریخ قطعی: ${formatJalaliDateTime(rec.createdAt)}`) : null,
          rec.signedName ? el('span', { class: 'cell-sub' }, `امضا: ${rec.signedName}${rec.signedRole ? ` — ${rec.signedRole}` : ''}`) : null,
          rec.hashVerified === true
            ? el('span', { class: 'badge badge--success', title: `محتوای سند مو‌به‌مو با لحظهٔ صدور یکی است — کد کنترل: ${rec.contentHash}` }, 'اصالت سند: تأیید')
            : el('span', { class: 'badge badge--error', title: `کد کنترل ثبت‌شده: ${rec.contentHash}` }, 'اصالت سند: هم‌خوان نیست'),
          el('button', { class: 'btn btn--soft btn--sm', type: 'button', onclick: () => printSnapshot(rec, variant, content) }, icon('printer', 14), 'چاپ A4')
        ),
        variantRow,
        content
      )
    });
  }

  async function openSnapshotBuilder() {
    let paths = [];
    try {
      paths = (await api.get(`/api/students/${id}/clinical-paths`)).data ?? [];
    } catch (err) {
      toastError(err);
      return;
    }
    if (!Array.isArray(paths) || paths.length === 0) {
      /* ۱.۲۷.۵۴ — بازتولید باگ «دکمهٔ خروجی کار نمی‌کند»: پیام بن‌بست جای اقدام بود.
         گزارش نسخه‌دار از مسیر مداخله ساخته می‌شود؛ اگر مسیری نیست، کاربر مستقیم به جای
         ساختنش برود — نه یک toast بی‌خروجی. */
      const { close } = openModal({
        title: 'پیش‌نیاز گزارش: مسیر مداخله',
        body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
          el('p', { style: { margin: 0, lineHeight: '1.9' } },
            'گزارش قطعی، «گزارش دورهٔ مداخله»ی این پرونده است: جمع‌بندی جلسات، کارت‌ها و سنجش‌های یک مسیر. این پرونده هنوز مسیری ندارد — اول در تب «تفسیر بالینی» مسیر را بسازید و تأیید کنید؛ بعد همین دکمه گزارش را با شماره و تاریخ قطعی صادر می‌کند.'),
          el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
            el('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => { close(); location.hash = `#/students/${id}?tab=clinical`; } }, icon('brain', 14), 'رفتن به تفسیر بالینی'),
            el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => close() }, 'بعداً')
          )
        )
      });
      void close;
      return;
    }
    const rows = paths.map((p) => el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-2) var(--sp-3)' } },
      el('div', {},
        el('div', { style: { fontWeight: 600 } }, p.targetTitle ?? p.title ?? 'مسیر مداخله'),
        /* ۱.۲۷.۵۷ — موج C: پیش‌نمایش پیش از صدور — وضعیت با بج درست (نشتی کلید انگلیسی بسته شد) +
           شمار جلسات ثبت‌شدهٔ مسیر؛ کاربر قبل از قطعی‌شدن می‌داند در چه چیزی شماره می‌گیرد */
        el('div', { style: { display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', alignItems: 'center' } },
          p.templateTitle ? el('span', { class: 'cell-sub' }, p.templateTitle) : null,
          el('span', { class: `badge ${PATH_STATUS_BADGE[p.status] ?? 'badge--neutral'}` }, PATH_STATUS_LABEL[p.status] ?? p.status),
          el('span', { class: 'cell-sub' }, `${fa(p.sessions?.length ?? 0)} جلسهٔ ثبت‌شده در این مسیر`))),
      el('button', {
        class: 'btn btn--primary btn--sm', type: 'button',
        onclick: (ev) => lockBtn(ev.currentTarget, async () => {
          try {
            const res = await api.post(`/api/students/${id}/report-snapshots`, { path_id: p.id });
            const rec = res.data;
            toast(`گزارش شمارهٔ ${fa(rec.reportNo)} صادر و قطعی شد — ردپایش در «گزارش‌های خروجی» تاریخچه است`, 'success');
            close();
            if (await refreshEventsData()) { repaintChrome(); rerenderTabIf(['timeline', 'comms']); }
            openSnapshotModal(rec.id);
          } catch (err) {
            toastError(err);
          }
        })
      }, icon('file', 14), 'صدور گزارش قطعی')
    ));
    const { close } = openModal({
      title: 'صدور گزارش قطعی — گزارش دورهٔ مداخله',
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
        el('p', { class: 'cell-sub', style: { margin: 0 } },
          'این گزارش همان لحظه شماره می‌گیرد (شمارهٔ سالانهٔ مرکز)، ثبت قطعی می‌شود و نام صادرکننده کنارش می‌ماند. بعداً هرچه در پرونده عوض شود، این گزارش همان می‌ماند که روز صدور بود. ردپایش هم در تاریخچه، فیلتر «گزارش‌های خروجی» می‌ماند.'),
        rows
      )
    });
    void close;
  }

  function renderSessionsTab(box) {
    const counts = { present: 0, absent: 0, pending: 0, cancelled: 0 };
    for (const a of appointments) counts[a.myAttendance] = (counts[a.myAttendance] ?? 0) + 1;

    const statsBar = el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' } },
      el('span', { class: 'badge badge--success' }, `${fa(counts.present)} حاضر`),
      el('span', { class: 'badge badge--error' }, `${fa(counts.absent)} غایب`),
      el('span', { class: 'badge badge--warning' }, `${fa(counts.pending)} در انتظار`)
    );

    const canReport = canCreateCaseEvents();
    const noteApptIds = noteApptIdSet(); // موج ۲ — منبع واحد با برگهٔ جلسه

    const reportCell = (a) => {
      const evs = eventsOfAppt(a.appointmentId);
      const hasNote = noteApptIds.has(a.appointmentId);
      const parts = [];
      if (evs.length > 0) {
        parts.push(el('button', {
          class: 'chip is-active',
          type: 'button',
          title: evs.length > 1 ? `نمایش رویدادها — آخرین از ${fa(evs.length)} رویداد این جلسه` : 'نمایش رویدادهای این جلسه',
          'aria-label': evs.length > 1 ? `رویدادهای جلسه (${fa(evs.length)} رویداد — گشودن آخرین)` : 'نمایش رویدادهای این جلسه', /* S4-24/S4-25 */
          onclick: () => openCaseEventDetail(evs[0], { onChanged: onCaseEventSaved })
        }, `رویداد (${fa(evs.length)})`));
      }
      if (hasNote) parts.push(el('span', { class: 'badge badge--neutral' }, 'یادداشت'));
      if (parts.length === 0) {
        return canReport && a.status !== 'cancelled'
          ? el('button', {
              class: 'btn btn--soft btn--sm',
              title: 'ثبت گزارش برای این جلسه',
              onclick: () => openCaseEventForm({ student, appointmentId: a.appointmentId, previousEventRef: previousSessionEvent(a.appointmentId), onSaved: onCaseEventSaved })
            }, icon('plus', 13), 'ثبت گزارش')
          : el('span', { class: 'cell-sub' }, '—');
      }
      return el('div', { style: { display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', justifyContent: 'flex-end' } }, parts);
    };

    box.replaceChildren(
      el('div', { class: 'card' },
        el('div', { class: 'card__head' },
          el('div', { class: 'card__title' }, 'نوبت‌ها و حضور')
          /* ۱.۲۷.۵۶ — موج A: دکمهٔ تکراری «ثبت رویداد» حذف شد؛ ثبت گزارش هر جلسه در ستون «گزارش»
             همان جدول است و خانهٔ ثابتِ اقدام، کارت وضعیت */
        ),
        el('div', { class: 'card__body' },
          buildSessionSheet(),
          statsBar,
          appointments.length === 0
            ? emptyState({ iconName: 'calendar', title: 'هنوز نوبتی ثبت نشده', hint: 'دفتر از «تقویم نوبت‌ها» و درمانگر از «تقویم من» می‌تواند نوبت ثبت کند.' })
            : dataTable({
                columns: [
                  { key: 'startAt', label: 'زمان', render: (a) => formatJalaliDateTime(a.startAt) },
                  { key: 'staffName', label: 'کارمند', render: (a) => a.staffName ?? '—' },
                  { key: 'status', label: 'وضعیت نوبت', render: (a) => statusBadge(a.status) },
                  { key: 'myAttendance', label: 'حضور', render: (a) => canReport && a.status === 'scheduled'
                    ? el('button', { class: 'chip', type: 'button', title: 'ثبت/تغییر حضور', onclick: () => openAttendanceModal(a) }, statusBadge(a.myAttendance))
                    : statusBadge(a.myAttendance) }, // ۱.۲۷.۵۶ — حضور از خود پرونده ثبت‌شدنی شد
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
    const canManageNotify = Boolean(session.user && ['manager', 'secretary', 'therapist'].includes(session.user.role)); // درمانگر هم می‌تواند لینک دعوت خانواده/معلم بسازد

    let familyCard = null;
    let teacherCard = null;
    let teacherMessageCard = null;
    try {
      familyCard = await buildFamilyInviteCard(student, { canManage: canManageNotify });
      teacherCard = await buildTeacherInviteCard(student, { canManage: canManageNotify });
      // کارت «یادآوری و اعلان‌ها» (زمان‌بندی اعلان) حذف شد؛ جای آن پیام آزاد به معلم نشست
      // F3: داخل try — رد شدنش تب ارتباطات را تا ابد روی اسکلت نمی‌گذارد
      if (canManageNotify) teacherMessageCard = await buildTeacherMessageCard(student);
    } catch (err) {
      box.replaceChildren(errorState(err, () => renderCommsTab(box)));
      return;
    }

    const reportsCard = el('div', { class: 'card' },
      el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, 'گزارش‌های ارسالی')),
      el('div', { class: 'card__body' },
        el('p', { class: 'cell-sub', style: { margin: '0 0 var(--sp-3)' } },
          'گزارش‌های ثبت‌شده برای خانواده و معلم مدرسه در تب «تاریخچه» (رویدادهای پیام) قابل مشاهده است. دکمهٔ ارسال تازه در ردیف اقدام کارت وضعیت بالای پرونده است.')
      )
    );

    // کارت «یادآوری و اعلان‌ها» حذف شد (بالا در try ساخته می‌شود)

    box.replaceChildren(
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' } },
        familyCard,
        teacherCard,
        teacherMessageCard,
        reportsCard
      )
    );
  }
}

function buildNextActionBlock(nextAction) {
  // — : مکانیک پیگیری/اقدام بعدی حذف شده؛ وقتی اقدام واقعی وجود ندارد هیچ بلوکی رندر نمی‌شود (جای‌نگهدار حذف شد)
  if (!nextAction) return null;
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
  // پیش از این: fetch فروخورده و پیش‌فرض گزینه‌ها «برداشتن مسئول» بود؛
  // ثبت زودهنگام یا شکست فهرست، مسئول فعلی را بی‌صدا حذف می‌کرد. الان پیش‌فرض =
  // «مسئول فعلی»، دکمه تا پایان بارگیری فهرست قفل است و «برداشتن» گزینهٔ صریح جداست.
  const NONE = '__none__';
  let staff = [];
  const sel = el('select', { class: 'select select--sm', 'aria-label': 'مسئول پرونده', style: { width: 'auto', minWidth: '210px', maxWidth: '300px', flex: '1 1 210px' } }, /* S4-08 */
    el('option', { value: '', selected: true }, student.ownerStaffId ? 'در حال بارگذاری…' : 'بدون مسئول — انتخاب کنید…')
  );
  const btn = el('button', {
    class: 'btn btn--soft btn--sm',
    disabled: true,
    title: 'در حال بارگذاری فهرست همکاران…',
    onclick: async () => {
      const v = sel.value;
      if (!student.ownerStaffId && !v) { toast('همکار مسئول را انتخاب کنید', 'warning'); return; }
      btn.disabled = true;
      try {
        const owner = v === NONE ? null : (v || null);
        await api.patch(`/api/students/${student.id}/owner`, { owner_staff_id: owner });
        toast(owner ? 'مسئول پرونده ثبت شد' : 'مسئول پرونده برداشته شد', 'success');
        onSaved?.();
      } catch (err) {
        toastError(err);
      }
      btn.disabled = false;
    }
  }, icon('user', 15), 'ثبت مسئول');
  function fillSel() {
    sel.replaceChildren();
    if (student.ownerStaffId) {
      const cur = staff.find((s) => s.id === student.ownerStaffId);
      sel.appendChild(el('option', { value: student.ownerStaffId, selected: true }, cur ? `مسئول فعلی: ${cur.fullName ?? cur.full_name}` : 'مسئول فعلی'));
    } else {
      sel.appendChild(el('option', { value: '', selected: true }, 'بدون مسئول — انتخاب کنید…'));
    }
    for (const s of staff) {
      if (s.id === student.ownerStaffId) continue;
      sel.appendChild(el('option', { value: s.id }, `${s.fullName ?? s.full_name ?? ''}`.trim() || s.id));
    }
    if (student.ownerStaffId) sel.appendChild(el('option', { value: NONE }, 'برداشتن مسئول'));
  }
  api.get('/api/staff').then((res) => {
    staff = (res.data ?? []).filter((s) => s.active !== false);
    fillSel();
    btn.disabled = false;
    btn.removeAttribute('title');
  }).catch((err) => {
    btn.title = 'فهرست همکاران بارگیری نشد — دوباره تلاش کنید';
    toastError(err);
  });

  return el('div', { class: 'case-status-edit' },
    el('span', { class: 'cell-sub', style: { flexShrink: 0, whiteSpace: 'nowrap' } }, 'مسئول پرونده:'),
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
          el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' } },
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
    ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => openSpecialNeedForm(student, onSpecialNeedSaved) },
        icon('edit', 15), hasNeed ? 'ویرایش نیاز ویژه' : 'ثبت نیاز ویژه')
    : null;

  return el('div', { class: 'sn-profile-card', style: { marginTop: 'var(--sp-4)' } },
    el('div', { class: 'card__title', style: { marginBottom: 'var(--sp-2)', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
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
        hint: 'هم‌تراز برچسب‌های اختلال؛ شمارش گرید «نیازهای ویژه» از همین فیلد ساخته می‌شود'
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
      listWrap.replaceChildren(el('div', { class: 'cell-sub' }, 'فهرست معلم‌ها بارگذاری نشد — صفحه را دوباره باز کنید.'));
    }
  }

  reload();
  return el('div', {
    class: 'card',
    style: { marginTop: 'var(--sp-4)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-3)' }
  },
    el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-2)' } },
      el('div', {},
        el('div', { class: 'card__title', style: { fontSize: '14px', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } }, icon('users', 16), 'معلم'),
        el('div', { class: 'cell-sub', style: { marginTop: 'var(--sp-1)' } }, 'پاسخ فرم جامع معلم با نام او روی پرونده می‌نشیند — دورهٔ ابتدایی یک معلمِ کلاس دارد')
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
        onclick: (e) => lockBtn(e.currentTarget, async () => { /* F4: قفل مشغولی — دوبارکلیک ارسال تکراری نمی‌زند (هم‌الگوی دکمهٔ بله) */
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
        })
      }, icon('bot', 16), 'ارسال')
    ]
  });
  void close;
}

function relationLabel(rel) {
  return { father: 'پدر', mother: 'مادر', other: 'سایر' }[rel] ?? rel ?? '—';
}

/* پیام آزاد به معلم / معلم مدرسه (جایگزین کارت حذف‌شدهٔ زمان‌بندی اعلان):
   درمانگر/منشی/مدیر متن دلخواه می‌نویسد و با دو کانال می‌فرستد:
   • «ارسال با پیامک» — لینک sms: با شمارهٔ معلم (اپ پیامک گوشی کاربر)
   • «ارسال به بله» — POST /api/notifications/teacher-report (بات اتصالیافتهٔ کلاس)
   گیرندهٔ «خانواده» هم اضافه شد: ولیّ دانش‌آموز (نام/تلفن از رکورد) +
   «ارسال به بله» خانواده → POST /api/notifications/family-report (گفتگوهای متصل خانواده) */
async function buildTeacherMessageCard(student) {
  const hasClass = Boolean(student.classId);

  let teacherItems = [];
  try {
    teacherItems = (await api.get(`/api/students/${student.id}/teachers`)).data ?? [];
  } catch { teacherItems = []; }

  // گیرنده‌ها: معلم کلاس (از رکورد دانش‌آموز) + معلم‌های ثبت‌شدهٔ پرونده + خانواده (ولیّ) — بدون تکرار نام
  const recipients = [];
  if (student.className) {
    recipients.push({
      type: 'teacher',
      name: student.teacherName || `معلم کلاس «${student.className}»`,
      phone: normalizePhoneValue(student.teacherPhone) || null,
      sub: student.teacherName ? `معلم کلاس «${student.className}»` : 'نام معلم هنوز ثبت نشده'
    });
  }
  for (const t of teacherItems) {
    if (recipients.some((r) => r.name === t.name)) continue;
    recipients.push({
      type: 'teacher',
      name: t.name,
      phone: normalizePhoneValue(t.contact) || null,
      sub: [t.classLabel, t.contact].filter(Boolean).join(' — ') || 'معلم پرونده'
    });
  }
  // خانواده — ولیّ دانش‌آموز از رکورد (همیشه پیشنهاد می‌شود؛ بله با اتصال خانواده کار می‌کند)
  recipients.push({
    type: 'family',
    name: student.guardianName || 'خانواده (ولیّ)',
    phone: normalizePhoneValue(student.guardianPhone) || null,
    sub: [relationLabel(student.guardianRelation), student.guardianName ? 'خانواده' : null].filter(Boolean).join(' — ') || 'خانوادهٔ دانش‌آموز'
  });

  if (recipients.length === 0) {
    return el('div', { class: 'card' },
      el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('message', 16), 'پیام آزاد به معلم و خانواده')),
      el('div', { class: 'card__body' },
        el('p', { class: 'cell-sub', style: { margin: 0 } },
          'گیرنده‌ای برای این پرونده ثبت نشده است — با انتخاب کلاس مدرسه در «ویرایش اطلاعات» یا پاسخ فرم معلم، معلم ثبت می‌شود؛ ولیّ را هم در «ویرایش اطلاعات» وارد کنید.')
      )
    );
  }

  const sel = recipients.length > 1
    ? el('select', { class: 'select', 'aria-label': 'گیرنده', style: { maxWidth: '360px' } }, /* S4-08 */
        ...recipients.map((r, i) => el('option', { value: String(i) }, r.type === 'family' ? `${r.name} — خانواده` : r.name)))
    : null;
  const currentRecipient = () => (sel ? recipients[Number(sel.value || 0)] : recipients[0]) ?? null;

  const textarea = el('textarea', {
    class: 'textarea', rows: 5, maxlength: 2000,
    placeholder: 'متن پیام را اینجا بنویسید… (مثلاً: لطفاً امروز تمرین تنفس را با علی مرور کنید)'
  });

  const smsLink = el('a', { class: 'btn btn--soft', role: 'button', tabindex: '0', style: { textDecoration: 'none' } }, icon('message', 15), 'ارسال با پیامک');
  smsLink.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); smsLink.click(); } }); /* S4-29: لنگر بی‌href با کیبورد فعال می‌شود */
  const baleBtn = el('button', {
    class: 'btn btn--primary',
    onclick: async () => {
      const text = textarea.value.trim();
      if (text.length < 2) { toast('متن پیام را بنویسید', 'warning'); textarea.focus(); return; }
      const r = currentRecipient();
      if (r?.type === 'family') {
        baleBtn.disabled = true;
        try {
          const res = await api.post('/api/notifications/family-report', { student_id: student.id, text });
          const n = res.data?.enqueued ?? 0;
          toast(`پیام به گفتگوی متصل خانواده ارسال شد${n > 1 ? ` (${fa(n)} گیرنده)` : ''}`, 'success');
          textarea.value = '';
        } catch (err) {
          toastError(err);
        }
        baleBtn.disabled = false;
        return;
      }
      if (!hasClass) { toast('این دانش‌آموز کلاسی ندارد — ابتدا در «ویرایش اطلاعات» کلاس مدرسه را انتخاب کنید', 'warning'); return; }
      baleBtn.disabled = true;
      try {
        const res = await api.post('/api/notifications/teacher-report', { student_id: student.id, text });
        const n = res.data?.enqueued ?? 0;
        toast(`پیام به بات معلم کلاس «${res.data?.className ?? student.className ?? ''}» ارسال شد${n > 1 ? ` (${fa(n)} گیرنده)` : ''}`, 'success');
        textarea.value = '';
      } catch (err) {
        toastError(err);
      }
      baleBtn.disabled = false;
    }
  }, icon('bot', 15), 'ارسال به بله');

  smsLink.addEventListener('click', (e) => {
    const text = textarea.value.trim();
    const r = currentRecipient();
    if (text.length < 2) { e.preventDefault(); toast('متن پیام را بنویسید', 'warning'); textarea.focus(); return; }
    if (!r?.phone || r.phone.length < 7) {
      e.preventDefault();
      toast(`شمارهٔ «${r?.name ?? 'این گیرنده'}» ثبت نشده — پیامک در دسترس نیست`, 'warning');
      return;
    }
    smsLink.href = `sms:${r.phone}?&body=${encodeURIComponent(text)}`;
  });

  const describeChannel = () => {
    const r = currentRecipient();
    if (r?.type === 'family') {
      return 'پیام دلخواه شما به خانواده می‌رسد: «بله» به گفتگوهایی که با «لینک اتصال خانواده» وصل شده‌اند و «پیامک» از اپ پیامک گوشی شما با شمارهٔ ولیّ.';
    }
    return hasClass
      ? 'پیام دلخواه شما به معلم می‌رسد: «بله» از طریق بات اتصالیافتهٔ کلاس و «پیامک» از اپ پیامک گوشی شما.'
      : 'این دانش‌آموز هنوز کلاسی ندارد — «ارسال به بله» برای معلم فعال نمی‌شود؛ ابتدا در «ویرایش اطلاعات» کلاس مدرسه را انتخاب کنید.';
  };
  const channelHint = el('p', { class: 'cell-sub', style: { margin: 0 } }, describeChannel());
  sel?.addEventListener('change', () => { channelHint.textContent = describeChannel(); });

  const recipientRow = sel
    ? el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'گیرنده'), sel)
    : (() => {
        const r = recipients[0];
        return el('div', { class: 'field' },
          el('label', { class: 'field__label' }, 'گیرنده'),
          el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
            el('b', {}, r.name),
            r.phone ? el('span', { class: 'cell-phone', dir: 'ltr' }, fa(r.phone)) : null,
            r.sub ? el('span', { class: 'cell-sub' }, r.sub) : null
          )
        );
      })();

  const baleHintText = () => {
    const r = currentRecipient();
    if (r?.type === 'family') {
      return '«ارسال به بله» به گفتگوهای خانواده‌ای می‌رود که با «لینک اتصال خانواده» وصل شده‌اند — اگر خانواده هنوز بات را وصل نکرده، اول از کارت «لینک‌های اتصال خانواده» بالا لینک بسازید.';
    }
    return hasClass
      ? '«ارسال به بله» به گفتگوی باتی می‌رود که با «کد اتصال معلم» ساخته می‌شود — اگر معلم هنوز بات را وصل نکرده، اول از کارت بالا کد اتصال بسازید.'
      : null;
  };
  const baleHint = el('div', { class: 'cell-sub', style: { margin: 0 } }, baleHintText());
  sel?.addEventListener('change', () => {
    channelHint.textContent = describeChannel();
    const t = baleHintText();
    baleHint.textContent = t ?? '';
    baleHint.style.display = t ? '' : 'none';
  });

  return el('div', { class: 'card' },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('message', 16), 'پیام آزاد به معلم و خانواده')),
    el('div', { class: 'card__body', style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
      channelHint,
      recipientRow,
      textarea,
      baleHint,
      el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' } }, smsLink, baleBtn)
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

  const smsLink = el('a', { class: 'btn btn--primary btn--sm', role: 'button', tabindex: '0', style: { textDecoration: 'none' } }, icon('send', 15), 'دعوت با پیامک');
  smsLink.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); smsLink.click(); } }); /* S4-29 */
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
      el('div', { class: 'card__title', style: { fontSize: '14px', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } }, icon('message', 15), heading),
      previewBox,
      phoneRow,
      actionsRow
    ),
    refresh
  };
}

function paintLinkChips(box, links, { emptyText }) {
  const shown = links.slice(0, 4);
  box.replaceChildren(
    ...(links.length === 0
      ? [el('span', { class: 'cell-sub' }, emptyText)]
      : [
          ...shown.map((l) =>
            el('div', { class: 'chip', style: { gap: 'var(--sp-2)' } },
              el('b', { dir: 'ltr' }, l.code),
              statusBadge(l.status),
              el('button', {
                class: 'btn btn--ghost btn--sm',
                onclick: () => openBotLinkModal(l.code, { intro: 'این لینک چندبارمصرف است — برای گفتگوی جدید همان را بفرستید:' })
              }, 'دیدن لینک')
            )),
          /* S4-30: مازاد بی‌صدا پنهان نمی‌شود */
          links.length > shown.length ? el('span', { class: 'cell-sub' }, `+ ${fa(links.length - shown.length)} لینک دیگر`) : null
        ])
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

  const listBox = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } });
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
      : 'هنوز لینک اتصالی ساخته نشده است — ساخت لینک در دست منشی/مدیر/درمانگر است.'
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
      /* ۱.۲۷.۲۷ — M4 POLISH-3: برگهٔ پیشرفت خانواده — صفحهٔ فقط‌خواندنی توکن‌محور (بدون لاگین، ۱۸۰ روز) */
      el('div', { class: 'field' },
        el('label', { class: 'field__label' }, 'برگهٔ پیشرفت خانواده'),
        el('div', { style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' } },
          el('span', { class: 'cell-sub', style: { flex: '1', minWidth: '200px', margin: 0 } }, 'صفحهٔ «از فرضیه تا نتیجه»: مسیرهای مداخله، جلسات و روند پراپ — با پیوند امضاشده بدون لاگین باز می‌شود و فقط همین دانش‌آموز را نشان می‌دهد.'),
          canManage ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => openProgressSheetModal(student, { familyCode: pickActiveLinkCode(links), botUsername }) }, icon('file', 14), 'ساخت پیوند برگه') : null)),
      smsSection.root
    )
  );
}

/* ۱.۲۷.۲۷ — M4 POLISH-3: برگهٔ پیشرفت خانواده — پیوند توکن‌محور (کپی) + ارسال با بات بله */
async function openProgressSheetModal(student, { familyCode = null, botUsername = null } = {}) {
  let res;
  try {
    res = await api.post(`/api/students/${student.id}/progress-sheet-link`);
  } catch (err) {
    toastError(err);
    return;
  }
  const url = res.data?.url ?? '';
  const expires = res.data?.expiresAt ? formatJalaliNumeric(res.data.expiresAt.slice(0, 10)) : null;
  const input = el('input', { class: 'input', dir: 'ltr', readonly: '', value: url, onclick: () => input.select() });
  const copyBtn = el('button', {
    class: 'btn btn--soft btn--sm', type: 'button',
    onclick: async () => {
      try { await navigator.clipboard.writeText(url); } catch { input.select(); document.execCommand('copy'); }
      toast('پیوند برگه کپی شد', 'success');
    }
  }, icon('copy', 14), 'کپی');
  const botRow = familyCode && botUsername
    ? el('div', { style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' } },
        el('span', { class: 'cell-sub', style: { margin: 0 } }, 'ارسال با بات بله — گفتگوی متصل خانواده:'),
        el('a', { class: 'btn btn--soft btn--sm', href: buildBotLink(botUsername, familyCode), target: '_blank', rel: 'noopener' }, icon('bot', 14), 'باز کردن بله'))
    : null;
  openModal({
    title: 'برگهٔ پیشرفت خانواده',
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
      el('p', { class: 'cell-sub', style: { margin: 0 } }, `این پیوند برگهٔ پیشرفت ${student.firstName} را بدون لاگین باز می‌کند${expires ? ` — تا ${expires} معتبر است` : ''}؛ فقط برای خانوادهٔ همین دانش‌آموز بفرستید.`),
      el('div', { style: { display: 'flex', gap: 'var(--sp-2)' } }, input, copyBtn),
      botRow)
  });
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

  const listBox = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } });
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
      : 'هنوز کد اتصالی برای این کلاس ساخته نشده است — ساخت کد در دست منشی/مدیر/درمانگر است.'
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
