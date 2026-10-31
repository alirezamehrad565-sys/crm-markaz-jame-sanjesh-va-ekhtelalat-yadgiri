import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  SCHOOL1_ID,
  SCHOOL2_ID,
  SCHOOL3_ID
} from '../../test/harness';

interface StudentResponse {
  id: string;
  specialNeedType: string | null;
  specialNeedSeverity: string | null;
  identifiedAt: string | null;
  caseStatus: string | null;
}

interface GridCellResponse {
  total: number;
  special: number;
  attention: number;
  bySeverity: Record<string, number>;
}

interface GridResponse {
  generatedAt: string;
  grades: string[];
  schools: { schoolId: string | null; schoolName: string | null; kind: string | null; cells: Record<string, GridCellResponse>; totals: GridCellResponse }[];
  overall: GridCellResponse & { byType: Record<string, number> };
  attention: { id: string; reasons: string[] }[];
}

interface OverviewResponse {
  school: { id: string; name: string; kind: string; active: boolean };
  metrics: Record<string, number>;
  attention: { id: string; reasons: string[] }[];
}

const ymd = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString();

describe('فاز ۷ — نیازهای ویژه و وضعیت همکاری مدرسه', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;
  let anon: Api;
  let s1: string; // مدرسه ۱ — سوم — dyslexia/severe
  let s2: string; // مدرسه ۱ — سوم — adhd/mild
  let s3: string; // مدرسه ۲ — چهارم — autism/moderate
  let s4: string; // مهدکودک بدون پایه — بدون نیاز ویژه

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    anon = new Api(A);

    s1 = (await createStudent(mgr, { first_name: 'نیاز', last_name: 'یکم', grade: 'سوم' })).id;
    s2 = (await createStudent(mgr, { first_name: 'نیاز', last_name: 'دوم', grade: 'سوم' })).id;
    s3 = (await createStudent(mgr, { first_name: 'نیاز', last_name: 'سوم', grade: 'چهارم', school_id: SCHOOL2_ID })).id;
    s4 = (await createStudent(mgr, { first_name: 'بی‌نیاز', last_name: 'چهارم', grade: undefined, school_id: SCHOOL3_ID })).id;

    expect((await sec.patch(`/api/students/${s1}/special-need`, { special_need_type: 'dyslexia', special_need_severity: 'severe' })).status).toBe(200);
    expect((await sec.patch(`/api/students/${s2}/special-need`, { special_need_type: 'adhd', special_need_severity: 'mild' })).status).toBe(200);
    expect((await sec.patch(`/api/students/${s3}/special-need`, { special_need_type: 'autism', special_need_severity: 'moderate' })).status).toBe(200);
  });

  it('RBAC — درمانگر و بی‌نشست از گرید و overview ۴۰۳ می‌گیرند؛ منشی/مدیر ۲۰۰', async () => {
    expect((await ali.get('/api/special-needs/grid')).status).toBe(403);
    expect((await anon.get('/api/special-needs/grid')).status).toBe(401);
    expect((await sec.get('/api/special-needs/grid')).status).toBe(200);
    expect((await mgr.get('/api/special-needs/grid')).status).toBe(200);

    expect((await ali.get(`/api/schools/${SCHOOL1_ID}/overview`)).status).toBe(403);
    expect((await sec.get(`/api/schools/${SCHOOL1_ID}/overview`)).status).toBe(200);
  });

  it('RBAC write — درمانگر ۴۰۳؛ مقدار نامعتبر ۴۰۰؛ شدت بدون نوع ۴۰۰', async () => {
    expect(
      (await ali.patch(`/api/students/${s1}/special-need`, { special_need_type: 'dyslexia', special_need_severity: 'mild' })).status
    ).toBe(403);
    expect(
      (await sec.patch(`/api/students/${s1}/special-need`, { special_need_type: 'unknown_type', special_need_severity: 'mild' })).status
    ).toBe(400);
    expect((await sec.patch(`/api/students/${s1}/special-need`, { special_need_type: null, special_need_severity: 'mild' })).status).toBe(400);
  });

  it('شناسایی اول — identified_at خودکار پر می‌شود؛ پاسخ کامل برمی‌گردد', async () => {
    const st = (await sec.get(`/api/students/${s1}`)).body as { data: StudentResponse };
    expect(st.data.specialNeedType).toBe('dyslexia');
    expect(st.data.specialNeedSeverity).toBe('severe');
    expect(st.data.identifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('no-op — همان مقدار دوباره → بدون ردیف audit جدید', async () => {
    const before = (A.sql.prepare(`SELECT COUNT(*) AS c FROM audit_log WHERE action = 'student.special_need.changed' AND resource_id = ?`).get(s1) as { c: number }).c;
    await sec.patch(`/api/students/${s1}/special-need`, { special_need_type: 'dyslexia', special_need_severity: 'severe' });
    const after = (A.sql.prepare(`SELECT COUNT(*) AS c FROM audit_log WHERE action = 'student.special_need.changed' AND resource_id = ?`).get(s1) as { c: number }).c;
    expect(after).toBe(before);
  });

  it('§12.10 — audit فقط id فیلدها دارد؛ هیچ متن تشخیص آزاد وجود ندارد', async () => {
    const row = A.sql.prepare(`SELECT changes FROM audit_log WHERE action = 'student.special_need.changed' AND resource_id = ? ORDER BY created_at DESC LIMIT 1`).get(s1) as { changes: string };
    const changes = JSON.parse(row.changes) as Record<string, { from: unknown; to: unknown }>;
    expect(Object.keys(changes).sort()).toEqual(['special_need_severity', 'special_need_type']);
    expect(changes.special_need_type.to).toBe('dyslexia');
  });

  it('پاک‌کردن نیاز — type/severity/identified_at هر سه NULL و رویداد «حذف» در audit', async () => {
    const tmp = (await createStudent(mgr, { first_name: 'موقت', last_name: 'پاک‌شونده', grade: 'پنجم' })).id;
    await sec.patch(`/api/students/${tmp}/special-need`, { special_need_type: 'anxiety', special_need_severity: 'mild' });
    const res = await sec.patch(`/api/students/${tmp}/special-need`, { special_need_type: null, special_need_severity: null });
    expect(res.status).toBe(200);
    const st = (res.body as { data: StudentResponse }).data;
    expect(st.specialNeedType).toBeNull();
    expect(st.specialNeedSeverity).toBeNull();
    expect(st.identifiedAt).toBeNull();
  });

  it('identified_at صریح — مقدار فرستاده‌شده حفظ می‌شود (بازبینی تاریخ شناسایی)', async () => {
    const tmp2 = (await createStudent(mgr, { first_name: 'موقت', last_name: 'تاریخ‌دار', grade: 'پنجم' })).id;
    const explicit = '2025-06-01T08:30:00.000Z';
    const res = await sec.patch(`/api/students/${tmp2}/special-need`, { special_need_type: 'anxiety', special_need_severity: 'moderate', identified_at: explicit });
    expect((res.body as { data: StudentResponse }).data.identifiedAt).toBe(explicit);
  });

  it('404 — دانش‌آموز ناشناخته', async () => {
    expect(
      (await sec.patch('/api/students/99999999-9999-9999-9999-999999999999/special-need', { special_need_type: 'adhd', special_need_severity: 'mild' })).status
    ).toBe(404);
  });

  it('رویداد special_need در تایم‌لاین با لیبل فارسی نوع و شدت + بازیگر', async () => {
    const res = await mgr.get(`/api/students/${s1}/timeline?kinds=special_need`);
    expect(res.status).toBe(200);
    const body = res.body as { data: { kind: string; title: string; subtitle: string | null; actor: string | null; ref?: { type: string; id: string } | null }[] };
    const ev = body.data.find((e) => e.ref !== undefined) ?? body.data[0];
    expect(body.data.length).toBeGreaterThan(0);
    expect(ev.kind).toBe('special_need');
    expect(ev.title).toBe('نیاز ویژه ثبت شد');
    expect(ev.subtitle).toContain('نارساخوانی');
    expect(ev.subtitle).toContain('شدید');
    expect(ev.actor).toBe('زهرا کریمی'); // منشی — بازیگر واقعی
  });

  it('گرید — گروه‌بندی مدرسه×پایه با شمارش دقیق سلول‌ها', async () => {
    const body = ((await mgr.get('/api/special-needs/grid')).body as { data: GridResponse }).data;

    const school1 = body.schools.find((r) => r.schoolId === SCHOOL1_ID);
    expect(school1).toBeTruthy();
    expect(school1!.cells['سوم'].special).toBe(2);
    expect(school1!.cells['سوم'].total).toBe(3); // seed: حسین + s1 + s2
    expect(school1!.cells['سوم'].bySeverity).toEqual({ severe: 1, mild: 1 });

    const school2 = body.schools.find((r) => r.schoolId === SCHOOL2_ID);
    expect(school2!.cells['چهارم'].special).toBe(1);
    expect(school2!.cells['چهارم'].total).toBeGreaterThanOrEqual(1); // seed: فاطمه ششم است، s3 چهارم

    const school3 = body.schools.find((r) => r.schoolId === SCHOOL3_ID);
    expect(school3).toBeTruthy();
    expect(school3!.cells['—'].total).toBe(2); // seed: زهرا + s4 — هر دو بدون پایه
    expect(school3!.cells['—'].special).toBe(0);

    expect(body.overall.byType['dyslexia']).toBe(1);
    expect(body.overall.byType['adhd']).toBe(1);
    expect(body.overall.byType['autism']).toBe(1);
    expect(body.grades).toContain('سوم');
  });

  it('گرید — فیلتر severity فقط همان شدت را می‌آورد (مخرج دست‌نخورده)', async () => {
    const body = ((await mgr.get('/api/special-needs/grid?severity=severe')).body as { data: GridResponse }).data;
    const school1 = body.schools.find((r) => r.schoolId === SCHOOL1_ID);
    expect(school1!.cells['سوم'].special).toBe(1);
    expect(school1!.cells['سوم'].total).toBe(3);
    expect(body.overall.byType['adhd']).toBeUndefined();
  });

  it('گرید — فیلتر مدرسه و پایه', async () => {
    const body = ((await mgr.get(`/api/special-needs/grid?school_id=${SCHOOL2_ID}&grade=چهارم`)).body as { data: GridResponse }).data;
    expect(body.schools.length).toBe(1);
    expect(body.schools[0].schoolId).toBe(SCHOOL2_ID);
    expect(body.schools[0].cells['چهارم'].special).toBe(1);
  });

  it('توجه — پیگیری سررسیدگذشته و «در انتظار ارزیابی» در گرید ظاهر می‌شوند', async () => {
    const fu = await mgr.post('/api/followups', {
      entity_type: 'student',
      entity_id: s2,
      student_id: s2,
      title: 'تماس با خانواده درباره تمرین‌ها',
      assignee_id: '00000000-0000-0000-0000-000000000001',
      due_at: ymd(-3)
    });
    expect(fu.status).toBe(201);

    expect((await sec.patch(`/api/students/${s3}/case-status`, { case_status: 'awaiting_assessment' })).status).toBe(200);

    const body = ((await mgr.get('/api/special-needs/grid')).body as { data: GridResponse }).data;
    const attentionIds = new Set(body.attention.map((a) => a.id));
    expect(attentionIds.has(s2)).toBe(true);
    expect(attentionIds.has(s3)).toBe(true);
    expect(attentionIds.has(s1)).toBe(false); // سالم — بدون دلیل توجه
    expect(attentionIds.has(s4)).toBe(false); // بدون نیاز ویژه اصلاً در گرید نمی‌آید

    const s2Row = body.attention.find((a) => a.id === s2)!;
    expect(s2Row.reasons).toContain('overdue_followup');
    const s3Row = body.attention.find((a) => a.id === s3)!;
    expect(s3Row.reasons).toContain('awaiting_assessment');

    const school1 = body.schools.find((r) => r.schoolId === SCHOOL1_ID)!;
    expect(school1.cells['سوم'].attention).toBe(1);
  });

  it('overview — متریک‌های مدرسه + بخش توجه همان derivation', async () => {
    const res = await mgr.get(`/api/schools/${SCHOOL2_ID}/overview`);
    expect(res.status).toBe(200);
    const body = (res.body as { data: OverviewResponse }).data;
    expect(body.school.id).toBe(SCHOOL2_ID);
    expect(body.metrics.studentsActive).toBeGreaterThanOrEqual(2); // فاطمه (seed) + s3
    expect(body.metrics.specialNeeds).toBe(1);
    expect(body.metrics.attention).toBe(1);
    expect(body.attention.map((a) => a.id)).toContain(s3);
    expect(body.metrics.admitted).toBe(0); // مهدکودک/مدرسه ۲ در این تست پذیرش ندارد
  });

  it('overview — ۴۰۴ برای مدرسهٔ ناشناخته', async () => {
    expect((await mgr.get('/api/schools/99999999-9999-9999-9999-999999999999/overview')).status).toBe(404);
  });
});
