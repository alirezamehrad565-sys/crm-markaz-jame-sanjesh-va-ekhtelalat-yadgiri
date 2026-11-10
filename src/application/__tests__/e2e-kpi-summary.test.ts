/**
 * e2e شاخص‌های مرکز (۱.۲۵.۴۶ — محور اول غنی‌سازی شبکه)
 * GET /api/kpi/summary — تجمیع فقط-عددی از نوبت‌ها/حضور، کیفیت مداخله و
 * ثبت پرونده + بازخورد خانواده. گیت نقش: مدیر و منشی.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, MANAGER_ID, ALI_ID, STUDENT1_ID, STUDENT2_ID, STUDENT3_ID, type TestApp } from '../../test/harness';
import type { Api } from '../../test/harness';

let app: TestApp;
let api: Api;
let therapist: Api;

const DAY = 24 * 60 * 60_000;

// JsonOutcome در harness به‌صورت unknown برمی‌گردد — پاکت {data} اینجا باز می‌شود
function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

interface KpiShape {
  window: { days: number; from_iso: string };
  generated_at: string;
  appointments: Record<string, unknown> & {
    scheduled: number; cancelled: number; cancel_rate: number | null;
    attendance: { present: number; absent: number; pending: number; cancelled: number };
    absent_rate: number | null; pending_overdue: number;
    capacity_minutes: number; fill_rate: number | null; students_served: number;
  };
  intervention: {
    pathway_sessions_done: number; pathway_sessions_skipped: number; session_completion_rate: number | null;
    fidelity_checked: number; fidelity_full: number;
    game_sessions: number; game_valid_rate: number | null;
    assignments_done: number; assignment_done_rate: number | null;
  };
  documentation: {
    students_active: number; case_events_total: number; session_notes: number;
    students_documented: number; documentation_coverage: number | null;
    family_requests: number; family_filled: number; family_response_rate: number | null; family_avg_score: number | null;
  };
}

function iso(daysAgo: number, hourOffsetMin = 0): string {
  return new Date(Date.now() - daysAgo * DAY + hourOffsetMin * 60_000).toISOString();
}

beforeAll(async () => {
  app = createTestApp();
  api = await asRole(app, 'manager');
  therapist = await asRole(app, 'therapist');
  const db = app.db;

  // ─── نوبت‌ها و حضور ───
  const a1 = '30000000-0000-0000-0000-000000000001';
  const a2 = '30000000-0000-0000-0000-000000000002';
  await db.execute(
    `INSERT INTO appointments (id, staff_id, start_at, end_at, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'scheduled', ?, ?, ?)`,
    [a1, ALI_ID, iso(2), iso(2, 45), MANAGER_ID, iso(3), iso(3)]
  );
  await db.execute(
    `INSERT INTO appointments (id, staff_id, start_at, end_at, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'cancelled', ?, ?, ?)`,
    [a2, ALI_ID, iso(10), iso(10, 45), MANAGER_ID, iso(11), iso(11)]
  );
  await db.execute(
    `INSERT INTO appointment_students (appointment_id, student_id, attendance) VALUES
       (?, ?, 'present'), (?, ?, 'absent')`,
    [a1, STUDENT1_ID, a1, STUDENT2_ID]
  );
  await db.execute(
    `INSERT INTO appointment_students (appointment_id, student_id, attendance) VALUES (?, ?, 'pending')`,
    [a2, STUDENT3_ID]
  );
  // ظرفیت اعلام‌شده برای روز هفتهٔ نوبت a1 — فقط برای پر شدن مسیر محاسبهٔ fill_rate
  const weekday = new Date(iso(2)).getUTCDay(); // getUTCDay: یکشنبه=۰ … شنبه=۶ → نگاشت ایرانی: (d+1)٪۷
  await db.execute(
    `INSERT INTO working_hours (id, staff_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, 480, 720)`,
    ['40000000-0000-0000-0000-000000000001', ALI_ID, (weekday + 1) % 7]
  );

  // تمرین پایه — پیش از تکلیف ارجاعی (FK روشن است)
  await db.execute(
    `INSERT INTO exercises (id, title, description, format, published, created_by, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', 'تمرین پایه', 'توضیح', 'worksheet', 1, ?, ?, ?)`,
    [ALI_ID, iso(6), iso(6)]
  );

  // ─── ثبت پرونده + بازخورد خانواده (نوع‌های seed مایگریشن 0029) ───
  await db.execute(
    `INSERT INTO case_events (id, event_type_id, student_id, status, analysis, filled_by_chat_id, created_by, occurred_at, created_at, updated_at)
     VALUES ('50000000-0000-0000-0000-000000000001', 'seed-home-behavior-0001', ?, 'completed', '{"score":10,"band":"در محدودهٔ مطلوب","answered":8,"total":8}', 'web:1700000000', ?, ?, ?, ?)`,
    [STUDENT1_ID, MANAGER_ID, iso(1), iso(1), iso(1)]
  );
  await db.execute(
    `INSERT INTO case_events (id, event_type_id, student_id, status, created_by, occurred_at, created_at, updated_at)
     VALUES ('50000000-0000-0000-0000-000000000002', 'seed-home-behavior-0001', ?, 'pending_family', ?, ?, ?, ?)`,
    [STUDENT2_ID, MANAGER_ID, iso(1), iso(1), iso(1)]
  );
  await db.execute(
    `INSERT INTO case_events (id, event_type_id, student_id, status, payload, created_by, occurred_at, created_at, updated_at)
     VALUES ('50000000-0000-0000-0000-000000000003', 'seed-intervention-0001', ?, 'completed', '{"goal":{"value":"x"}}', ?, ?, ?, ?)`,
    [STUDENT1_ID, MANAGER_ID, iso(1), iso(1), iso(1)]
  );

  // ─── کیفیت مداخله: جلسهٔ طرح درمان با وفاداری کامل ───
  await db.execute(
    `INSERT INTO intervention_paths (id, student_id, target_key, status, created_by, created_at, updated_at)
     VALUES ('60000000-0000-0000-0000-000000000001', ?, 'attention', 'active', ?, ?, ?)`,
    [STUDENT1_ID, ALI_ID, iso(5), iso(5)]
  );
  await db.execute(
    `INSERT INTO pathway_sessions (id, pathway_id, ord, title, status, done_at, fidelity, created_by, created_at, updated_at, items_json)
     VALUES ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 1, 'جلسهٔ اول', 'done', ?, '{"protocol":true,"homework":true,"parent":true}', ?, ?, ?, '[]')`,
    [iso(1), ALI_ID, iso(2), iso(2)]
  );
  await db.execute(
    `INSERT INTO pathway_sessions (id, pathway_id, ord, title, status, created_by, created_at, updated_at, items_json)
     VALUES ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 2, 'جلسهٔ دوم', 'skipped', ?, ?, ?, '[]')`,
    [ALI_ID, iso(1), iso(1)]
  );
  await db.execute(
    `INSERT INTO exercise_assignments (id, exercise_id, student_id, assigned_by, assigned_via, status, created_at)
     VALUES ('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', ?, ?, 'panel', 'done', ?)`,
    [STUDENT1_ID, ALI_ID, iso(1)]
  );
});

describe('GET /api/kpi/summary — گیت‌های نقش و شکل پاسخ', () => {
  it('بدون توکن → 401', async () => {
    const res = await app.app.request('/api/kpi/summary', { method: 'GET' }, app.env as never);
    expect(res.status).toBe(401);
  });

  it('درمانگر → 403', async () => {
    const res = await therapist.get('/api/kpi/summary');
    expect(res.status).toBe(403);
  });

  it('مدیر → 200 با شکل سه‌حوزه‌ای و پنجرهٔ تهران‌محور', async () => {
    const res = await api.get('/api/kpi/summary?days=30');
    expect(res.status).toBe(200);
    const data = dataOf<KpiShape>(res);
    expect(data.window.days).toBe(30);
    expect(typeof data.window.from_iso).toBe('string');
    expect(data.appointments).toBeDefined();
    expect(data.intervention).toBeDefined();
    expect(data.documentation).toBeDefined();
    expect(data.generated_at).toBeDefined();
  });

  it('days نامعتبر → بازگشت به ۳۰', async () => {
    const res = await api.get('/api/kpi/summary?days=12');
    expect(dataOf<{ window: { days: number } }>(res).window.days).toBe(30);
    const res2 = await api.get('/api/kpi/summary?days=90');
    expect(dataOf<{ window: { days: number } }>(res2).window.days).toBe(90);
  });

  it('منشی مجاز است', async () => {
    const secretary = await asRole(app, 'secretary');
    const res = await secretary.get('/api/kpi/summary');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/kpi/summary — صحت تجمیع روی دادهٔ درون‌ریزی‌شده', () => {
  it('نوبت‌ها و حضور: جا نیفتادن، لغو، تأخیر ثبت حضور و دانش‌آموز تحت خدمت', async () => {
    const data = dataOf<KpiShape>(await api.get('/api/kpi/summary?days=30'));
    expect(data.appointments.scheduled).toBe(1); // a1 برنامه‌ریزی‌شده؛ a2 لغوشده است
    expect(data.appointments.cancelled).toBe(1);
    expect(data.appointments.cancel_rate).toBeGreaterThan(0);
    expect(data.appointments.attendance.present).toBe(1);
    expect(data.appointments.attendance.absent).toBe(1);
    expect(data.appointments.absent_rate).toBe(0.5);
    expect(data.appointments.pending_overdue).toBeGreaterThanOrEqual(1);
    expect(data.appointments.students_served).toBe(3);
    expect(data.appointments.capacity_minutes).toBeGreaterThanOrEqual(0);
    // نرخ پر بودن ظرفیت عدد بین ۰ و ۱ یا null (بدون ظرفیت)
    if (data.appointments.fill_rate !== null) {
      expect(data.appointments.fill_rate).toBeGreaterThan(0);
      expect(data.appointments.fill_rate).toBeLessThanOrEqual(1);
    }
  });

  it('کیفیت مداخله: تکمیل جلسات، وفاداری و تکالیف', async () => {
    const data = dataOf<KpiShape>(await api.get('/api/kpi/summary?days=30'));
    expect(data.intervention.pathway_sessions_done).toBe(1);
    expect(data.intervention.pathway_sessions_skipped).toBe(1);
    expect(data.intervention.session_completion_rate).toBe(0.5);
    expect(data.intervention.fidelity_checked).toBe(1);
    expect(data.intervention.fidelity_full).toBe(1);
    expect(data.intervention.game_sessions).toBe(0);
    expect(data.intervention.game_valid_rate).toBeNull();
    expect(data.intervention.assignments_done).toBe(1);
    expect(data.intervention.assignment_done_rate).toBe(1);
  });

  it('ثبت پرونده و بازخورد خانواده: پوشش، پاسخ‌دهی و میانگین نمره', async () => {
    const data = dataOf<KpiShape>(await api.get('/api/kpi/summary?days=30'));
    expect(data.documentation.students_active).toBe(6);
    expect(data.documentation.case_events_total).toBe(3);
    expect(data.documentation.session_notes).toBe(1);
    expect(data.documentation.students_documented).toBe(2);
    expect(data.documentation.documentation_coverage).toBeCloseTo(2 / 6, 3);
    expect(data.documentation.family_requests).toBe(2);
    expect(data.documentation.family_filled).toBe(1);
    expect(data.documentation.family_response_rate).toBe(0.5);
    expect(data.documentation.family_avg_score).toBe(10);
  });
});
