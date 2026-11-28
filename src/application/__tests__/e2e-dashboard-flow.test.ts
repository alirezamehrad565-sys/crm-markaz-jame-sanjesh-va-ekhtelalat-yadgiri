/**
 * e2e ۱.۲۷.۸۸ — جریان داشبورد درمانگر: «پرونده‌های اخیر من» + «نظرسنجی‌های در انتظار»
 * خواستهٔ کارفرما: درمانگر پرونده‌هایی که اخیراً رویشان کار کرده را ببیند و وضعیت
 * پرسشنامهٔ ارسالی به خانواده (در انتظار/تکمیل‌شده) را بدون کند‌وکاو در تاریخچه بداند.
 * رشتهٔ واقعی پرسشنامه: ساخت نظرسنجی توسط مدیر (POST /api/case-events/surveys → case_events
 * با status='pending_family' و staff_id=درمانگرِ ارزیابی‌شده) → پر کردن خانواده از وب
 * (POST /public/case-events/:id/fill → status='completed').
 * دامنهٔ «دانش‌آموزِ خودم» = همان تعریف my-students (سابقهٔ نوبت یا مالکیت فعال).
 * الگو: e2e-dashboard.test.ts / e2e-family-survey-monitor.test.ts — دادهٔ آزمونی محلی.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { tehranTodayYmd, tehranYmdOf } from '@core/shared';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  createStudent,
  apptBody,
  quarterHourFromNow,
  ALI_ID,
  MARYAM_ID
} from '../../test/harness';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

/* نوبتِ گذشته روی شبکهٔ ۱۵دقیقه‌ای — هم‌الگوی e2e-dashboard.test.ts (پایدار در هر ساعت اجرا) */
const pastOnGridIso = (minutesAgo: number): string => {
  const grid = 15 * 60_000;
  return new Date(Math.floor((Date.now() - minutesAgo * 60_000) / grid) * grid).toISOString();
};

const daysAgoIso = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

interface RecentCase {
  studentId: string;
  displayName: string;
  lastAt: string;
  kind: 'session' | 'event' | 'survey' | 'plan' | 'exercise';
  brief: string;
}

interface SurveyItem {
  studentId: string;
  displayName: string;
  formKey: string;
  formName: string;
  sentAt: string | null;
  status: 'pending' | 'completed';
  completedAt: string | null;
}

interface MePayload {
  staffId: string;
  sessions: number;
  recentCases?: RecentCase[];
  pendingSurveys?: { count: number; items: SurveyItem[] };
}

describe('جریان داشبورد درمانگر — پرونده‌های اخیر من + نظرسنجی‌های در انتظار', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let ther: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let sec: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let maryam: Api;
  let sMine1 = '';
  let sMine2 = '';
  let sMine3 = '';
  let sForeign = '';
  let surveyId = '';
  let surveyToken = '';

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    ther = await asRole(A, 'therapist'); // علی (ALI_ID)
    sec = await asRole(A, 'secretary');
    maryam = new Api(A, await loginToken(A, 'maryam')); // درمانگر دوم

    sMine1 = (await createStudent(mgr, { first_name: 'آرش', last_name: 'جریان‌۱' })).id;
    sMine2 = (await createStudent(mgr, { first_name: 'بهنام', last_name: 'جریان‌۲' })).id;
    sMine3 = (await createStudent(mgr, { first_name: 'پویا', last_name: 'جریان‌۳' })).id;
    sForeign = (await createStudent(mgr, { first_name: 'تینا', last_name: 'بیگانه' })).id;
    for (const sid of [sMine1, sMine2, sMine3]) {
      expect((await mgr.patch(`/api/students/${sid}/owner`, { owner_staff_id: ALI_ID })).status).toBe(200);
    }

    // جلسهٔ گذشتهٔ علی با sMine1 + جلسهٔ مریم با دانش‌آموز بیگانه (سابقهٔ نوبت هرکدام با خودشان)
    expect((await mgr.post('/api/appointments', apptBody(ALI_ID, pastOnGridIso(30), 45, [sMine1]))).status).toBe(201);
    expect((await mgr.post('/api/appointments', apptBody(MARYAM_ID, pastOnGridIso(45), 45, [sForeign]))).status).toBe(201);

    // رویداد پروندهٔ ثبت‌شده توسط علی روی sMine3
    const t = await mgr.post('/api/case-events/types', {
      title: 'یادداشت مشاهدهٔ جریان',
      category: 'session',
      fields: [{ key: 'note', label: 'یادداشت', type: 'text' }]
    });
    expect(t.status).toBe(201);
    const typeId = dataOf<{ id: string }>(t).id;
    expect(
      (await ther.post(`/api/students/${sMine3}/case-events`, { eventTypeId: typeId, values: { note: 'ارزیابی نخست' } })).status
    ).toBe(201);

    // تمرینِ حواله‌شده توسط علی به sMine2 (assigned_by = علی)
    const ex = await ther.post('/api/exercises', { title: 'کاربرگ جریان داشبورد', description: null, format: 'worksheet', published: true });
    expect(ex.status).toBe(201);
    const exerciseId = dataOf<{ id: string }>(ex).id;
    expect((await ther.post(`/api/students/${sMine2}/exercises/batches`, { exercise_ids: [exerciseId] })).status).toBe(201);

    // طرح درمانِ قدیمیِ علی برای sMine2 — seed مستقیم، هم‌الگوی e2e-kpi-summary.test.ts
    await A.db.execute(
      `INSERT INTO intervention_paths (id, student_id, target_key, status, created_by, created_at, updated_at)
       VALUES ('6f100000-0000-0000-0000-000000000001', ?, 'attention', 'active', ?, ?, ?)`,
      [sMine2, ALI_ID, daysAgoIso(5), daysAgoIso(5)]
    );

    // نظرسنجی حین درمان برای sMine1 — مدیر می‌سازد؛ درمانگرِ ارزیابی‌شده: علی
    const sv = await mgr.post('/api/case-events/surveys', { student_ids: [sMine1], therapist_id: ALI_ID, kind: 'progress' });
    expect(sv.status).toBe(201);
    const created = dataOf<{ created: { id: string }[] }>(sv).created;
    expect(created).toHaveLength(1);
    surveyId = created[0].id;
    const row = A.sql
      .prepare(`SELECT fill_token, staff_id, status, sent_at FROM case_events WHERE id = ?`)
      .get(surveyId) as { fill_token: string; staff_id: string; status: string; sent_at: string | null };
    expect(row.staff_id).toBe(ALI_ID);
    expect(row.status).toBe('pending_family');
    expect(row.sent_at).toBeNull();
    surveyToken = row.fill_token;

    // نظرسنجیِ مریم روی دانش‌آموز بیگانه — نباید در خروجی علی دیده شود
    expect((await mgr.post('/api/case-events/surveys', { student_ids: [sForeign], therapist_id: MARYAM_ID, kind: 'progress' })).status).toBe(201);
  });

  it('پرونده‌های اخیر — فقط دانش‌آموزان خودم، بدون بیگانه، با kind و brief درست', async () => {
    const me = dataOf<MePayload>(await ther.get('/api/dashboard/me'));
    const rc = me.recentCases ?? [];
    const ids = rc.map((r) => r.studentId);
    expect(ids).toContain(sMine1);
    expect(ids).toContain(sMine2);
    expect(ids).toContain(sMine3);
    expect(ids).not.toContain(sForeign);
    expect(rc.length).toBeLessThanOrEqual(6);

    // تازه‌ترین فعالیت علی = نظرسنجیِ ساخته‌شده برای sMine1
    expect(rc[0].studentId).toBe(sMine1);
    const first = rc.find((r) => r.studentId === sMine1)!;
    expect(first.kind).toBe('survey');
    expect(first.brief).toContain('حین درمان'); // عنوان فارسی فرم ce-survey-progress-v1
    expect(first.lastAt).toContain('T');

    const second = rc.find((r) => r.studentId === sMine2)!;
    expect(second.kind).toBe('exercise');
    expect(second.brief).toContain('کاربرگ جریان داشبورد');

    const third = rc.find((r) => r.studentId === sMine3)!;
    expect(third.kind).toBe('event');
    expect(third.brief).toContain('یادداشت مشاهدهٔ جریان');

    // ترتیب نزولی lastAt (فقط جفت‌های قطعی — ممیزِ ثانیه‌ای تمرین با رویداد نامعین است)
    const i1 = rc.indexOf(first);
    for (let i = i1 + 1; i < rc.length; i++) {
      expect(rc[i - 1].lastAt >= rc[i].lastAt).toBe(true);
    }
  });

  /* ۱.۲۷.۹۴ — شاخهٔ جلسه: نوبت پیش‌روی «همین امروزِ تهران» هم پروندهٔ اخیر می‌سازد
     (باگ: درمانگری که روزش را با نوبت‌های پیش‌رو شروع کرده، کارنامهٔ خالی می‌دید).
     رد شدن در پنجرهٔ ~۳۵دقیقه‌ای نزدیک نیمه‌شب تهران صادقانه skip می‌شود — آن‌جا
     دیگر اسلوت شبکهٔ ۱۵دقیقه‌ایِ «بعد از الان» داخل امروزِ تهران وجود ندارد. */
  const upcomingStart = quarterHourFromNow(20); // اولین اسلوت شبکهٔ ۱۵دقیقه‌ای، دست‌کم ۲۰ دقیقه بعد
  const upcomingIsToday = tehranYmdOf(upcomingStart) === tehranTodayYmd();

  it.skipIf(!upcomingIsToday)(
    'جلسهٔ پیش‌روی امروز در پرونده‌های اخیر هست — kind=session با برچسب پیش‌رو',
    async () => {
      const sUp = (await createStudent(mgr, { first_name: 'ثمانیه', last_name: 'پیش‌رو' })).id;
      expect((await mgr.patch(`/api/students/${sUp}/owner`, { owner_staff_id: ALI_ID })).status).toBe(200);
      expect((await mgr.post('/api/appointments', apptBody(ALI_ID, upcomingStart, 45, [sUp]))).status).toBe(201);

      const me = dataOf<MePayload>(await ther.get('/api/dashboard/me'));
      const row = (me.recentCases ?? []).find((r) => r.studentId === sUp);
      expect(row).toBeDefined();
      expect(row!.kind).toBe('session');
      expect(row!.brief).toContain('پیش‌رو'); // برچسب «جلسهٔ امروز — پیش‌رو» — شکل payload دست‌نخورده
      expect(row!.lastAt).toContain('T');
    }
  );

  /* ۱.۲۷.۹۴ — شاخهٔ تازهٔ «جلسات طرح»: ویرایش جلسهٔ طرح درمان و کارت‌های پیوندشده در آن
     (pathway_sessions.items_json با linkId) پروندهٔ اخیر می‌سازد. ستون updated_by روی
     intervention_paths وجود ندارد (0044/0051) — پوششِ ویرایش‌ها از همین منبع می‌آید. */
  it('ویرایش جلسهٔ طرح درمان (pathway_sessions) در پرونده‌های اخیر هست — kind=plan', async () => {
    const sPlan = (await createStudent(mgr, { first_name: 'چهارم', last_name: 'جلسهٔ طرح' })).id;
    expect((await mgr.patch(`/api/students/${sPlan}/owner`, { owner_staff_id: ALI_ID })).status).toBe(200);
    // طرح دو روز پیش ساخته شده و جلسه‌اش همین حالا ویرایش شده — ویرایش جلسه تازه‌ترین فعالیت است
    await A.db.execute(
      `INSERT INTO intervention_paths (id, student_id, target_key, status, created_by, created_at, updated_at)
       VALUES ('6f100000-0000-0000-0000-000000000009', ?, 'attention', 'active', ?, ?, ?)`,
      [sPlan, ALI_ID, daysAgoIso(2), daysAgoIso(2)]
    );
    await A.db.execute(
      `INSERT INTO pathway_sessions (id, pathway_id, ord, title, plan, status, items_json, created_by, created_at, updated_at)
       VALUES ('6f200000-0000-0000-0000-000000000009', '6f100000-0000-0000-0000-000000000009', 1,
               'جلسهٔ اول — آهنگ‌سازی', 'ورم‌سازی هجاوایی', 'planned', ?, ?, ?, ?)`,
      [JSON.stringify([{ type: 'exercise', text: 'کاربرگ هجاوایی', done: false, linkId: 'ex-flowplan0001' }]), ALI_ID, new Date().toISOString(), new Date().toISOString()]
    );

    const me = dataOf<MePayload>(await ther.get('/api/dashboard/me'));
    const row = (me.recentCases ?? []).find((r) => r.studentId === sPlan);
    expect(row).toBeDefined();
    expect(row!.kind).toBe('plan');
    expect(row!.brief).toContain('جلسهٔ طرح درمان');
  });

  it('pendingSurveys پیش از پاسخ — count=۱ و status=pending و sentAt=null', async () => {
    const me = dataOf<MePayload>(await ther.get('/api/dashboard/me'));
    const ps = me.pendingSurveys!;
    expect(ps.count).toBe(1);
    expect(ps.items).toHaveLength(1);
    const item = ps.items[0];
    expect(item.studentId).toBe(sMine1);
    expect(item.displayName).toContain('آرش');
    expect(item.formKey).toBe('ce-survey-progress-v1');
    expect(item.formName).toContain('حین درمان');
    expect(item.status).toBe('pending');
    expect(item.completedAt).toBeNull();
    expect(item.sentAt).toBeNull(); // با /send ارسال نشده (لینک هنگام ساخت داده شد) — ستون واقعی sent_at
  });

  it('پس از پر کردن خانواده از وب — status=completed و completedAt و count صفر', async () => {
    const answers: Record<string, number> = {};
    for (const k of ['sv_cen1', 'sv_cen2']) answers[k] = 4;
    for (const k of ['sv_thr1', 'sv_thr2', 'sv_thr3']) answers[k] = 3;
    for (const k of ['sv_prg1', 'sv_prg2']) answers[k] = 4;
    answers['sv_nps'] = 9;
    const post = await A.app.request(`/public/case-events/${surveyId}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: surveyToken, answers })
    });
    expect(post.status).toBe(200);

    const me = dataOf<MePayload>(await ther.get('/api/dashboard/me'));
    const ps = me.pendingSurveys!;
    expect(ps.count).toBe(0);
    const item = ps.items.find((i) => i.studentId === sMine1)!;
    expect(item.status).toBe('completed');
    expect(item.completedAt).not.toBeNull();
    expect(item.sentAt).toBeNull();
  });

  it('عزلت دامنه — جلسه/نظرسنجیِ مریم در کارنامهٔ علی نیست ولی در کارنامهٔ مریم هست', async () => {
    const ali = dataOf<MePayload>(await ther.get('/api/dashboard/me'));
    expect((ali.pendingSurveys?.items ?? []).some((i) => i.studentId === sForeign)).toBe(false);
    expect((ali.recentCases ?? []).some((r) => r.studentId === sForeign)).toBe(false);

    const m = dataOf<MePayload>(await maryam.get('/api/dashboard/me'));
    expect((m.recentCases ?? []).some((r) => r.studentId === sForeign)).toBe(true);
    expect((m.pendingSurveys?.items ?? []).some((i) => i.studentId === sForeign && i.status === 'pending')).toBe(true);
    expect(m.pendingSurveys?.count ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('مسیر مدیر/منشی دست‌نخورده — ۲۰۰ با شکل کامل و فیلدهای الحاقیِ سازگار', async () => {
    for (const client of [mgr, sec]) {
      const me = dataOf<MePayload>(await client.get('/api/dashboard/me'));
      expect(typeof me.staffId).toBe('string');
      expect(typeof me.sessions).toBe('number');
      expect(Array.isArray(me.recentCases)).toBe(true);
      expect(typeof me.pendingSurveys?.count).toBe('number');
      expect(Array.isArray(me.pendingSurveys?.items)).toBe(true);
    }
  });
});
