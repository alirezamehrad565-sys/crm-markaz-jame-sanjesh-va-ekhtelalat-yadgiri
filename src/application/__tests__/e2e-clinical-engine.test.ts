import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  createStudent,
  STUDENT1_ID
} from '../../test/harness';

interface RankedBody {
  targetKey: string;
  targetTitle: string;
  confidence: string;
  score: number;
  evidenceFa: string[];
  missingFa: string[];
  criteriaSummary: { met: number; partial: number; unknown: number; notMet: number };
  narrative: { targetKey: string; saw: string; means: string; next: string };
}

interface InsightsBody {
  batteryVersion: string;
  generatedAt: string;
  criteria: { targetKey: string; criterionId: string; status: string }[];
  ranked: RankedBody[];
  discrepancies: string[];
  nextActions: string[];
  dataCoverage: { seen: string[]; seenTitles: string[] };
  referralFlags: string[];
  student: { id: string; name: string; grade: string | null };
  narrative: string;
}

interface PathBody {
  id: string;
  studentId: string;
  targetKey: string;
  targetTitle: string;
  status: string;
  engineHypothesis: RankedBody | null;
  decision: { action: string; by: string; byName: string; at: string; note: string | null } | null;
  steps: { key: string; title: string; doneAt: string | null }[];
  exerciseIds: string[];
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('تفسیر بالینی (GET clinical-insights)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api; // درمانگر
  let maryam: Api; // درمانگر دیگر
  let studentId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    maryam = new Api(A, await loginToken(A, 'maryam'));
    studentId = (await createStudent(ali)).id;
  });

  it('پروندهٔ بی‌داده → ۲۰۰ با خروجی خالیِ سالم + پانویس', async () => {
    const res = await ali.get(`/api/students/${studentId}/clinical-insights`);
    expect(res.status).toBe(200);
    const body = dataOf<InsightsBody>(res);
    expect(body.batteryVersion).toBe('battery-v1');
    expect(body.ranked).toHaveLength(0);
    expect(body.criteria).toHaveLength(0);
    expect('disclaimer' in body).toBe(false); // m156: پانویس انکار حذف شد
    expect(body.student.id).toBe(studentId);
    expect(body.narrative).toContain('فرضیهٔ روشنی ساخته نشده');
  });

  it('RBAC — مسئول ۲۰۰؛ مدیر/منشی ۲۰۰؛ درمانگرِ غیرمسئول ۴۰۳', async () => {
    expect((await ali.get(`/api/students/${studentId}/clinical-insights`)).status).toBe(200);
    expect((await mgr.get(`/api/students/${studentId}/clinical-insights`)).status).toBe(200);
    expect((await sec.get(`/api/students/${studentId}/clinical-insights`)).status).toBe(200);
    const other = await maryam.get(`/api/students/${studentId}/clinical-insights`);
    expect(other.status).toBe(403);
  });

  it('با دو چک‌لیست ملاکی والد+معلم → فرضیهٔ نارساخوانی با هم‌رأیی + snapshot', async () => {
    const types = dataOf<{ id: string; key: string }[]>(await ali.get('/api/case-events/types?active=true'));
    const sldRead = types.find((t) => t.key === 'ce-sld-read-v1');
    expect(sldRead).toBeDefined();

    const values = { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 };
    for (let i = 0; i < 2; i++) {
      const created = await ali.post(`/api/students/${studentId}/case-events`, { eventTypeId: sldRead!.id });
      expect(created.status).toBe(201);
      const id = (created.body as { data: { id: string } }).data.id;
      const token = (A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(id) as { fill_token: string }).fill_token;
      const fill = await ali.post(`/public/case-events/${id}/fill`, { token, answers: values });
      expect(fill.status).toBe(200);
    }

    const res = await ali.get(`/api/students/${studentId}/clinical-insights`);
    expect(res.status).toBe(200);
    const body = dataOf<InsightsBody>(res);
    const dys = body.ranked.find((h) => h.targetKey === 'dyslexia');
    expect(dys).toBeDefined();
    expect(dys!.confidence).toBe('زیاد');
    expect(dys!.evidenceFa.some((e) => e.includes('خانه و مدرسه'))).toBe(true);
    const dysCrit = body.criteria.filter((c) => c.targetKey === 'dyslexia');
    expect(dysCrit.length).toBeGreaterThanOrEqual(6);
    expect(dysCrit.filter((c) => c.status === 'met').length).toBeGreaterThanOrEqual(4);
    expect(body.narrative).toContain('چه دیدیم');
    expect(body.narrative).toContain('یعنی چه');
    expect(body.narrative).toContain('گام بعدی');
    expect(dys!.narrative.targetKey).toBe('dyslexia');
    expect(dys!.narrative.saw).toContain('خانه و مدرسه');
    expect(dys!.narrative.means).toContain('نارساخوانی');
    expect(dys!.narrative.next.length).toBeGreaterThan(0);
  });
});

describe('مسیر مداخله و پروتکل قضاوت', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;
  let maryam: Api;
  let studentId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    maryam = new Api(A, await loginToken(A, 'maryam'));
    studentId = (await createStudent(ali)).id;
  });

  async function createPath(api: Api, targetKey = 'dyslexia'): Promise<{ status: number; body: PathBody }> {
    const res = await api.post(`/api/students/${studentId}/clinical-paths`, { target_key: targetKey });
    return { status: res.status, body: dataOf<PathBody>(res) };
  }

  it('ساخت مسیر توسط مسئول — suggested + گام‌های مسیر + snapshot فرضیه', async () => {
    const { status, body } = await createPath(ali);
    expect(status).toBe(201);
    expect(body.status).toBe('suggested');
    expect(body.targetTitle).toBe('نارساخوانی');
    expect(body.steps.map((s) => s.key)).toEqual(['observe', 'assess', 'intervene', 'monitor']);
    expect(body.steps.every((s) => s.doneAt === null)).toBe(true);
    expect(body.engineHypothesis).toBeNull(); // بدون داده — هدف دستی درمانگر
  });

  it('RBAC — منشی ساخت/تصمیم ۴۰۳؛ درمانگر غیرمسئول ۴۰۳؛ مشاهده ۲۰۰', async () => {
    const { body } = await createPath(ali);
    expect((await sec.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'adhd' })).status).toBe(403);
    expect((await maryam.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'adhd' })).status).toBe(403);
    expect((await sec.get(`/api/students/${studentId}/clinical-paths`)).status).toBe(200);
    expect((await maryam.post(`/api/clinical-paths/${body.id}/decision`, { action: 'confirm' })).status).toBe(403);
  });

  it('تأیید → active + تصمیم ثبت‌شده + audit؛ تصمیم دوم روی مسیر فعال ۴۰۹', async () => {
    const { body } = await createPath(ali);
    const res = await ali.post(`/api/clinical-paths/${body.id}/decision`, {
      action: 'confirm',
      note: 'با پروب تأیید شد',
      exercise_ids: ['ex-1', 'ex-2']
    });
    expect(res.status).toBe(200);
    const decided = dataOf<PathBody>(res);
    expect(decided.status).toBe('active');
    expect(decided.decision?.action).toBe('confirm');
    expect(decided.decision?.byName).toBeTruthy();
    expect(decided.exerciseIds).toEqual(['ex-1', 'ex-2']);

    const again = await ali.post(`/api/clinical-paths/${body.id}/decision`, { action: 'reject', note: 'x' });
    expect(again.status).toBe(409);

    const p2 = await createPath(ali, 'adhd');
    expect(p2.status).toBe(201);
    expect((await ali.post(`/api/clinical-paths/${p2.body.id}/decision`, { action: 'confirm' })).status).toBe(200);
    const p3 = await createPath(ali, 'anxiety');
    expect(p3.status).toBe(201); // ساخت پیشنهاد آزاد است
    const cap = await ali.post(`/api/clinical-paths/${p3.body.id}/decision`, { action: 'confirm' });
    expect(cap.status).toBe(409);
  });

  it('رد بدون یادداشت ۴۰۰؛ رد با یادداشت → closed + تصمیم برای کالیبراسیون', async () => {
    const { body } = await createPath(ali);
    const noNote = await ali.post(`/api/clinical-paths/${body.id}/decision`, { action: 'reject' });
    expect(noNote.status).toBe(400);
    const res = await ali.post(`/api/clinical-paths/${body.id}/decision`, { action: 'reject', note: 'شواهد کافی نیست — به ADHD نزدیک‌تر است' });
    expect(res.status).toBe(200);
    const decided = dataOf<PathBody>(res);
    expect(decided.status).toBe('closed');
    expect(decided.decision?.note).toContain('ADHD');
  });

  it('اصلاح هدف → reviewed + targetKey جدید؛ target ناموجود ۴۰۰', async () => {
    const { body } = await createPath(ali);
    const bad = await ali.post(`/api/clinical-paths/${body.id}/decision`, { action: 'edit', target_key: 'nope' });
    expect(bad.status).toBe(400);
    const res = await ali.post(`/api/clinical-paths/${body.id}/decision`, { action: 'edit', target_key: 'dysgraphia', note: 'خطای املایی غالب است' });
    expect(res.status).toBe(200);
    const decided = dataOf<PathBody>(res);
    expect(decided.status).toBe('reviewed');
    expect(decided.targetKey).toBe('dysgraphia');
  });

  it('هدف ناموجود در دانش‌نامه → ساخت ۴۰۰؛ مسیر پروندهٔ ناموجود ۴۰۴', async () => {
    expect((await ali.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'nope' })).status).toBe(400);
    expect((await ali.get('/api/students/99999999-0000-0000-0000-000000000001/clinical-insights')).status).toBe(404);
  });

  it('audit — clinical_path.create و clinical_path.decision با changes', async () => {
    const { body } = await createPath(ali);
    await ali.post(`/api/clinical-paths/${body.id}/decision`, { action: 'need_info', note: 'SCARED معلم لازم است' });
    const rows = A.sql
      .prepare(`SELECT action FROM audit_log WHERE resource_id = ? AND resource_type = 'intervention_path' ORDER BY rowid`)
      .all(body.id) as Array<{ action: string }>;
    expect(rows.map((r) => r.action)).toEqual(['clinical_path.create', 'clinical_path.decision']);
  });

  it('مسیر تکی حذف شده (m134) → ۴۰۴ + دانش‌نامهٔ اهداف', async () => {
    const { body } = await createPath(ali);
    expect((await ali.get(`/api/clinical-paths/${body.id}`)).status).toBe(404);
    const targets = dataOf<{ key: string; group: string }[]>(await ali.get('/api/clinical-targets'));
    expect(targets.filter((t) => t.group === 'clinical')).toHaveLength(10);
    expect(targets.filter((t) => t.group === 'support')).toHaveLength(12);
    for (const key of ['rehab_cognitive', 'rehab_motor', 'rehab_adl', 'rehab_family']) {
      expect(targets.some((t) => t.key === key)).toBe(true);
    }
  });
});

describe('چک‌لیست مراحل مسیر مداخله (toggle)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;
  let maryam: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    maryam = new Api(A, await loginToken(A, 'maryam'));
  });

  async function newActiveCase(): Promise<{ studentId: string; pathId: string }> {
    const studentId = (await createStudent(ali)).id;
    const created = await ali.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'dyslexia' });
    const pathId = dataOf<PathBody>(created).id;
    const conf = await ali.post(`/api/clinical-paths/${pathId}/decision`, { action: 'confirm' });
    expect(conf.status).toBe(200);
    return { studentId, pathId };
  }

  it('toggle روی مسیر پیشنهادی ۴۰۹؛ روی فعال → doneAt ثبت و دوباره لغو', async () => {
    const studentId = (await createStudent(ali)).id;
    const created = await ali.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'adhd' });
    const suggested = dataOf<PathBody>(created);
    const early = await ali.post(`/api/clinical-paths/${suggested.id}/steps/toggle`, { step_key: 'observe' });
    expect(early.status).toBe(409);

    const { pathId } = await newActiveCase();
    const on = await ali.post(`/api/clinical-paths/${pathId}/steps/toggle`, { step_key: 'observe' });
    expect(on.status).toBe(200);
    const onBody = dataOf<PathBody>(on);
    expect(onBody.steps.find((s) => s.key === 'observe')?.doneAt).toBeTruthy();
    expect(onBody.steps.filter((s) => s.key !== 'observe').every((s) => s.doneAt === null)).toBe(true);

    const off = await ali.post(`/api/clinical-paths/${pathId}/steps/toggle`, { step_key: 'observe' });
    expect(off.status).toBe(200);
    expect(dataOf<PathBody>(off).steps.find((s) => s.key === 'observe')?.doneAt).toBeNull();
  });

  it('RBAC — منشی ۴۰۳؛ درمانگر غیرمسئول ۴۰۳؛ مدیر ۲۰۰؛ گام قلابی ۴۰۴', async () => {
    const { pathId } = await newActiveCase();
    expect((await sec.post(`/api/clinical-paths/${pathId}/steps/toggle`, { step_key: 'observe' })).status).toBe(403);
    expect((await maryam.post(`/api/clinical-paths/${pathId}/steps/toggle`, { step_key: 'observe' })).status).toBe(403);
    expect((await mgr.post(`/api/clinical-paths/${pathId}/steps/toggle`, { step_key: 'observe' })).status).toBe(200);
    expect((await ali.post(`/api/clinical-paths/${pathId}/steps/toggle`, { step_key: 'nope' })).status).toBe(404);
  });

  it('audit — clinical_path.step_toggle روی مسیر', async () => {
    const { pathId } = await newActiveCase();
    await ali.post(`/api/clinical-paths/${pathId}/steps/toggle`, { step_key: 'intervene' });
    const rows = A.sql
      .prepare(`SELECT action FROM audit_log WHERE resource_id = ? AND action = 'clinical_path.step_toggle'`)
      .all(pathId) as Array<{ action: string }>;
    expect(rows).toHaveLength(1);
  });
});
