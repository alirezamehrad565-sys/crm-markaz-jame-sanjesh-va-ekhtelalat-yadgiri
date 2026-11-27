/* ۱.۲۷.۸۸ — موتور «پرونده‌های اخیر من» و «نظرسنجی‌های در انتظار» برای GET /api/dashboard/me.
   اصل: ADDITIVE — فقط فیلدهای تازه به JSON اضافه می‌شود؛ هیچ شِما/مایگریشن‌ای در کار نیست و
   همهٔ ستون‌های خوانده‌شده موجودند (نسخهٔ تولید D1: 1.27.87).
   دامنه (همان تعریف my-students در appointment-core/service.ts::listMyStudents):
     دانش‌آموزِ فعالِ من = سابقهٔ نوبت با من (appointments.staff_id = من) یا مالکِ فعالِ من
     (students.owner_staff_id = من). برای نظرسنجی‌ها، «درمانگرِ ارزیابی‌شده»
     (case_events.staff_id — createSurveyEvents) هم شریک دامنه است.
   پرسشنامهٔ خانواده در همین جدول case_events زندگی می‌کند:
     ساخت/ارسال: status='pending_family' (createSurveyEvents/sendChecklistLink — sent_at هنگام ارسال لینک)
     تکمیل: fillByFamily → status='completed' + updated_at همان لحظه (ستون completed_at وجود ندارد). */
import type { DbClient } from '@core/db';
import type { MyPendingSurveyItem, MyPendingSurveys, MyRecentCase, MyRecentCaseKind } from './types';

/* سقف هر شاخهٔ UNION قبل از ادغام — کافی برای پوشش ۶ دانش‌آموز متمایز حتی با تکرار */
const PER_ARM_LIMIT = 50;
const RECENT_CASES_MAX = 6;
const SURVEY_ITEMS_MAX = 5;

/* created_at/updated_at در D1 با datetime('now') ممکن است با فاصله ذخیره شده باشد
   ('YYYY-MM-DD HH:MM:SS') در حالی که سرویس‌ها ISO می‌نویسند؛ مرتب‌سازی SQL روی
   replace(x,' ','T') یکدست است و خروجی هم نرمال می‌شود. */
function isoOf(raw: string): string {
  if (raw.includes('T')) return raw;
  return `${raw.replace(' ', 'T')}Z`;
}

interface RecentRow {
  kind: string;
  student_id: string;
  display_name: string;
  last_at: string;
  brief: string;
}

/* قاعدهٔ دامنهٔ مشترک شاخه‌های غیر-نوبتی: دانش‌آموز فعال + (مالک من یا سابقهٔ نوبت با من) */
const STUDENT_SCOPE_SQL = `st.active = 1
     AND (st.owner_staff_id = ? OR EXISTS (
       SELECT 1 FROM appointments sa
         JOIN appointment_students sas ON sas.appointment_id = sa.id
        WHERE sa.staff_id = ? AND sas.student_id = st.id
     ))`;

const RECENT_CASES_SQL = `
  SELECT * FROM (
    SELECT 'session' AS kind, st.id AS student_id,
           trim(st.first_name || ' ' || st.last_name) AS display_name,
           replace(a.start_at, ' ', 'T') AS last_at,
           'جلسهٔ درمان' AS brief
      FROM appointments a
      JOIN appointment_students asn ON asn.appointment_id = a.id
      JOIN students st ON st.id = asn.student_id
     WHERE a.staff_id = ? AND a.status <> 'cancelled' AND a.start_at <= ? AND st.active = 1
     ORDER BY a.start_at DESC LIMIT ${PER_ARM_LIMIT}
  )
  UNION ALL
  SELECT * FROM (
    SELECT CASE WHEN t.category = 'checklist' THEN 'survey' ELSE 'event' END AS kind,
           st.id AS student_id,
           trim(st.first_name || ' ' || st.last_name) AS display_name,
           replace(e.occurred_at, ' ', 'T') AS last_at,
           t.title AS brief
      FROM case_events e
      JOIN case_event_types t ON t.id = e.event_type_id
      JOIN students st ON st.id = e.student_id
     WHERE e.deleted_at IS NULL AND e.status <> 'cancelled' AND e.staff_id = ?
       AND ${STUDENT_SCOPE_SQL}
     ORDER BY replace(e.occurred_at, ' ', 'T') DESC LIMIT ${PER_ARM_LIMIT}
  )
  UNION ALL
  SELECT * FROM (
    SELECT 'plan' AS kind, st.id AS student_id,
           trim(st.first_name || ' ' || st.last_name) AS display_name,
           replace(ip.updated_at, ' ', 'T') AS last_at,
           'به‌روزرسانی طرح درمان' AS brief
      FROM intervention_paths ip
      JOIN students st ON st.id = ip.student_id
     WHERE ip.deleted_at IS NULL AND ip.created_by = ?
       AND ${STUDENT_SCOPE_SQL}
     ORDER BY replace(ip.updated_at, ' ', 'T') DESC LIMIT ${PER_ARM_LIMIT}
  )
  UNION ALL
  SELECT * FROM (
    SELECT 'exercise' AS kind, st.id AS student_id,
           trim(st.first_name || ' ' || st.last_name) AS display_name,
           replace(ea.created_at, ' ', 'T') AS last_at,
           'تمرین: ' || substr(ex.title, 1, 40) AS brief
      FROM exercise_assignments ea
      JOIN exercises ex ON ex.id = ea.exercise_id
      JOIN students st ON st.id = ea.student_id
     WHERE ea.assigned_by = ?
       AND ${STUDENT_SCOPE_SQL}
     ORDER BY replace(ea.created_at, ' ', 'T') DESC LIMIT ${PER_ARM_LIMIT}
  )
  ORDER BY last_at DESC`;

/* پرسشنامه‌های خانواده — وضعیت واقعی از case_events.status می‌آید؛ لغوشده‌ها حذف می‌شوند */
const SURVEY_SCOPE_SQL = `(e.staff_id = ? OR (${STUDENT_SCOPE_SQL}))`;

const PENDING_SURVEYS_COUNT_SQL = `
  SELECT COUNT(*) AS cnt
    FROM case_events e
    JOIN case_event_types t ON t.id = e.event_type_id
    JOIN students st ON st.id = e.student_id
   WHERE e.deleted_at IS NULL AND t.category = 'checklist'
     AND e.status = 'pending_family'
     AND ${SURVEY_SCOPE_SQL}`;

const PENDING_SURVEYS_ITEMS_SQL = `
  SELECT e.id, e.student_id,
         trim(st.first_name || ' ' || st.last_name) AS display_name,
         t.key AS form_key, t.title AS form_name,
         e.sent_at, e.status, replace(e.updated_at, ' ', 'T') AS updated_iso,
         replace(COALESCE(e.sent_at, e.occurred_at), ' ', 'T') AS order_at
    FROM case_events e
    JOIN case_event_types t ON t.id = e.event_type_id
    JOIN students st ON st.id = e.student_id
   WHERE e.deleted_at IS NULL AND t.category = 'checklist'
     AND e.status IN ('pending_family', 'completed')
     AND ${SURVEY_SCOPE_SQL}
   ORDER BY order_at DESC
   LIMIT ${SURVEY_ITEMS_MAX}`;

interface SurveyRow {
  student_id: string;
  display_name: string;
  form_key: string;
  form_name: string;
  sent_at: string | null;
  status: string;
  updated_iso: string;
}

function recentCasesOf(rows: RecentRow[]): MyRecentCase[] {
  const seen = new Set<string>();
  const out: MyRecentCase[] = [];
  for (const r of rows) {
    if (seen.has(r.student_id)) continue;
    seen.add(r.student_id);
    out.push({
      studentId: r.student_id,
      displayName: r.display_name,
      lastAt: isoOf(r.last_at),
      kind: r.kind as MyRecentCaseKind,
      brief: r.brief
    });
    if (out.length >= RECENT_CASES_MAX) break;
  }
  return out;
}

function surveyItemOf(r: SurveyRow): MyPendingSurveyItem {
  const completed = r.status === 'completed';
  return {
    studentId: r.student_id,
    displayName: r.display_name,
    formKey: r.form_key,
    formName: r.form_name,
    sentAt: r.sent_at ? isoOf(r.sent_at) : null,
    status: completed ? 'completed' : 'pending',
    completedAt: completed ? isoOf(r.updated_iso) : null
  };
}

export interface MyActivityPayload {
  recentCases: MyRecentCase[];
  pendingSurveys: MyPendingSurveys;
}

/* سه پرس‌وجوی مستقل موازی — بدون حلقهٔ N+1؛ هر شاخهٔ UNION با LIMIT سقف‌دار */
export async function loadMyActivity(db: DbClient, actorStaffId: string): Promise<MyActivityPayload> {
  /* پارامترها به ترتیب جایگاهی: جلسه(۲) + رویداد(۳) + طرح(۳) + تمرین(۳) */
  const recentRows = db.query<RecentRow>(RECENT_CASES_SQL, [
    actorStaffId, new Date().toISOString(),
    actorStaffId, actorStaffId, actorStaffId,
    actorStaffId, actorStaffId, actorStaffId,
    actorStaffId, actorStaffId, actorStaffId
  ]);
  const countRows = db.query<{ cnt: number }>(PENDING_SURVEYS_COUNT_SQL, [actorStaffId, actorStaffId, actorStaffId]);
  const itemRows = db.query<SurveyRow>(PENDING_SURVEYS_ITEMS_SQL, [actorStaffId, actorStaffId, actorStaffId]);
  const [recent, count, items] = await Promise.all([recentRows, countRows, itemRows]);
  return {
    recentCases: recentCasesOf(recent),
    pendingSurveys: {
      count: count[0]?.cnt ?? 0,
      items: items.map(surveyItemOf)
    }
  };
}
