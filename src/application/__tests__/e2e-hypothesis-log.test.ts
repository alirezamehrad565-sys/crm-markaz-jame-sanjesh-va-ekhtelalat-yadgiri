import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  createStudent,
  makeNationalId
} from '../../test/harness';

// لج فرضیه: اسنپ‌شات هر محاسبه با «تغییر رتبه» در رویداد پرونده می‌نشیند؛
// تکرار بدون تغییر رکورد نمی‌سازد و ناظر (فقط-خواندن) هرگز چیزی نمی‌نویسد.

interface InsightsBody {
  ranked: { targetKey: string; score: number; confidence: string }[];
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function logRowsOf(A: ReturnType<typeof createTestApp>, studentId: string): { payload: string; summary: string }[] {
  return A.sql
    .prepare(
      `SELECT e.payload, e.summary FROM case_events e
        JOIN case_event_types t ON t.id = e.event_type_id
       WHERE t.key = 'ce-hypothesis-log-v1' AND e.student_id = ? AND e.deleted_at IS NULL
       ORDER BY e.occurred_at DESC`
    )
    .all(studentId) as { payload: string; summary: string }[];
}

async function postAndFill(A: ReturnType<typeof createTestApp>, api: Api, studentId: string, eventTypeId: string, answers: Record<string, number>): Promise<void> {
  const created = await api.post(`/api/students/${studentId}/case-events`, { eventTypeId });
  expect(created.status).toBe(201);
  const id = (created.body as { data: { id: string } }).data.id;
  const token = (A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(id) as { fill_token: string }).fill_token;
  const fill = await api.post(`/public/case-events/${id}/fill`, { token, answers });
  expect(fill.status).toBe(200);
}

describe('لج فرضیه (اسنپ‌شات در رویداد پرونده)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let ali: Api;
  let studentId: string;
  let sldReadTypeId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    ali = await asRole(A, 'therapist');
    studentId = (await createStudent(ali)).id;
    const types = dataOf<{ id: string; key: string }[]>(await ali.get('/api/case-events/types?active=true'));
    sldReadTypeId = types.find((t) => t.key === 'ce-sld-read-v1')!.id;
  });

  it('اولین محاسبه با فرضیه → یک رکورد لج با اثرانگشت و خلاصه؛ GET دوباره → رکورد تکراری نه', async () => {
    const values = { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 };
    await postAndFill(A, ali, studentId, sldReadTypeId, values);
    await postAndFill(A, ali, studentId, sldReadTypeId, values);

    const res = await ali.get(`/api/students/${studentId}/clinical-insights`);
    expect(res.status).toBe(200);
    const body = dataOf<InsightsBody>(res);
    expect(body.ranked.length).toBeGreaterThan(0);

    let rows = logRowsOf(A, studentId);
    expect(rows).toHaveLength(1);
    const payload = JSON.parse(rows[0].payload) as { fingerprint: string; ranked: { targetKey: string }[] };
    expect(payload.ranked[0].targetKey).toBe('dyslexia');
    expect(payload.fingerprint).toContain('dyslexia');
    expect(rows[0].summary).toContain('لج فرضیه');

    // GET تکراری بدون تغییر داده → همان یک رکورد
    await ali.get(`/api/students/${studentId}/clinical-insights`);
    rows = logRowsOf(A, studentId);
    expect(rows).toHaveLength(1);
  });

  it('دادهٔ بی‌اثر بر رتبه (رویداد سوم هم‌ارز) → رکورد جدید نمی‌سازد؛ تغییر رتبه (ADHD تازه) → رکورد دوم', async () => {
    const values = { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 };
    await postAndFill(A, ali, studentId, sldReadTypeId, values);
    await ali.get(`/api/students/${studentId}/clinical-insights`);
    expect(logRowsOf(A, studentId)).toHaveLength(1); // امتیاز/ترتیب همان است

    // SNAP-IV والد با همهٔ آیتم‌ها در بیشینه → فرضیهٔ ADHD تازه وارد فهرست → اثرانگشت عوض می‌شود
    const snapFields = JSON.parse(
      (A.sql.prepare(`SELECT fields FROM case_event_types WHERE key = 'ce-snap-iv-p-v1'`).get() as { fields: string }).fields
    ) as { key: string; type: string }[];
    const snapTypeId = (dataOf<{ id: string; key: string }[]>(await ali.get('/api/case-events/types?active=true')).find((t) => t.key === 'ce-snap-iv-p-v1'))!.id;
    const answers: Record<string, number> = {};
    for (const f of snapFields) if (f.type === 'scale') answers[f.key] = 2;
    await postAndFill(A, ali, studentId, snapTypeId, answers);

    const res = await ali.get(`/api/students/${studentId}/clinical-insights`);
    const body = dataOf<InsightsBody>(res);
    expect(body.ranked.some((h) => h.targetKey === 'adhd')).toBe(true);
    const rows = logRowsOf(A, studentId);
    expect(rows).toHaveLength(2);
    const newest = JSON.parse(rows[0].payload) as { ranked: { targetKey: string }[] };
    expect(newest.ranked.some((h) => h.targetKey === 'adhd')).toBe(true);
  });

  it('مسیر خواندن فرانت: GET case-events لج را با payload کامل برمی‌گرداند', async () => {
    const events = dataOf<{ payload: { fingerprint?: string } | null }[]>(await ali.get(`/api/students/${studentId}/case-events?limit=200`));
    const logEvents = events.filter((e) => e.payload?.fingerprint);
    expect(logEvents.length).toBe(2);
  });

  it('ناظر فقط-خواندن (): GET تفسیر بالینی برای ناظر ۴۰۳ است و هیچ رکورد لجی نمی‌نویسد', async () => {
    const create = await mgr.post('/api/staff', {
      full_name: 'ناظر لج ',
      phone: '09127770123',
      national_id: makeNationalId(),
      username: 'supervisor223',
      role: 'supervisor'
    });
    expect(create.status).toBe(201);
    const sup = new Api(A, await loginToken(A, 'supervisor223'));
    const res = await sup.get(`/api/students/${studentId}/clinical-insights`);
    expect(res.status).toBe(403);
    expect(logRowsOf(A, studentId)).toHaveLength(2); // بدون نوشتن جدید
  });
});
