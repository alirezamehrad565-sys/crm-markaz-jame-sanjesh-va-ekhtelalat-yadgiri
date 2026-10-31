import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent
} from '../../test/harness';

// اعتبارسنجی بیرونی: چهار KPI از دادهٔ موجود (بدون ورودی دستی جدید) + حسابرسی موردی دو-ارزیاب

interface KpiShareBody { pct: number | null; base: number; hit: number }
interface KpisBody {
  hypothesisConvergence: KpiShareBody;
  interventionResponse: KpiShareBody;
  reassessOnTime: KpiShareBody;
  startToIdentification: { medianDays: number | null; students: number };
}

interface AuditBody {
  id: string; studentName: string; reviewerA: string; reviewerB: string; agreed: boolean;
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('اعتبارسنجی بیرونی (KPI از دادهٔ موجود + حسابرسی)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let ali: Api;
  let studentId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    ali = await asRole(A, 'therapist');
    studentId = (await createStudent(ali)).id;
  });

  it('KPIها روی پروندهٔ بی‌داده صفرِ سالم می‌دهند — بدون ورودی دستی', async () => {
    const res = await mgr.get('/api/validation-kpis');
    expect(res.status).toBe(200);
    const k = dataOf<KpisBody>(res);
    expect(k.hypothesisConvergence.pct).toBeNull(); // هیچ مسیر تصمیم‌گرفته نیست
    expect(k.interventionResponse.pct).toBeNull();
    expect(k.reassessOnTime.pct).toBeNull();
    expect(k.startToIdentification.medianDays).toBeNull();
  });

  it('با دادهٔ واقعی: مسیر موتور-تأییدشده + پراپ بهبود + موعد بازنگری + گزارش نتایج → هر چهار KPI عددی', async () => {
    // مسیر با اسنپ‌شات موتور (دو چک‌لیست SLD) → تصمیم تأیید
    const types = dataOf<{ id: string; key: string }[]>(await ali.get('/api/case-events/types?active=true'));
    const sldRead = types.find((t) => t.key === 'ce-sld-read-v1')!.id;
    const values = { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 };
    for (let i = 0; i < 2; i++) {
      const created = await ali.post(`/api/students/${studentId}/case-events`, { eventTypeId: sldRead });
      const id = (created.body as { data: { id: string } }).data.id;
      const token = (A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(id) as { fill_token: string }).fill_token;
      await ali.post(`/public/case-events/${id}/fill`, { token, answers: values });
    }
    const path = dataOf<{ id: string }>(await ali.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'dyslexia' }));
    // مسیر با اسنپ‌شات موتور — engineHypothesis باید پر باشد (فرضیهٔ موتور صدرنشین)
    const pathRow = A.sql.prepare(`SELECT engine_hypothesis, reassess_at FROM intervention_paths WHERE id = ?`).get(path.id) as { engine_hypothesis: string | null; reassess_at: string | null };
    expect(pathRow.engine_hypothesis).toBeTruthy();
    await ali.post(`/api/clinical-paths/${path.id}/decision`, { action: 'confirm' });
    // موعد بازنگری سرآمده + جلسهٔ انجام‌شده بعد از آن
    A.sql.prepare(`UPDATE intervention_paths SET reassess_at = ? WHERE id = ?`)
      .run('2026-01-05T00:00:00.000Z', path.id);
    const ses = dataOf<{ id: string }>(await ali.post(`/api/clinical-paths/${path.id}/sessions`, { title: 'جلسهٔ بازنگری' }));
    await ali.patch(`/api/clinical-paths/${path.id}/sessions/${ses.id}`, { status: 'done' });
    // پراپ بهبود (سه نقطهٔ صعودی)
    for (const [i, v] of [40, 48, 56].entries()) {
      await ali.post(`/api/clinical-paths/${path.id}/probes`, {
        metric: 'واژه درست در دقیقه', value: v, unit: 'واژه',
        taken_at: new Date(Date.parse('2026-01-10T09:00:00.000Z') + i * 7 * 86400000).toISOString()
      });
    }
    // گزارش نتایج (شروع تا جمع‌بندی) — fixture مستقیم در DB؛ تاریخش بعد از ساخت پرونده است تا بازهٔ روز مثبت بماند
    const resultsType = types.find((t) => t.key === 'ce-results-v1')!.id;
    A.sql.prepare(
      `INSERT INTO case_events (id, event_type_id, student_id, staff_id, occurred_at, status, payload, summary, created_by, created_at, updated_at)
       VALUES ('test-results-0001', ?, ?, ?, '2027-01-02T09:00:00.000Z', 'completed', '{}', 'نتایج ارزیابی ثبت شد', ?, datetime('now'), datetime('now'))`
    ).run(resultsType, studentId, '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002');

    const k = dataOf<KpisBody>(await mgr.get('/api/validation-kpis'));
    expect(k.hypothesisConvergence.base).toBe(1);
    expect(k.hypothesisConvergence.hit).toBe(1); // تأیید با اسنپ‌شات موتور
    expect(k.hypothesisConvergence.pct).toBe(100);
    expect(k.interventionResponse.base).toBe(1);
    expect(k.interventionResponse.pct).toBe(100); // پراپ صعودی
    expect(k.reassessOnTime.base).toBe(1);
    expect(k.reassessOnTime.hit).toBe(1); // جلسهٔ انجام‌شده بعد از موعد
    expect(k.startToIdentification.students).toBe(1);
    expect(k.startToIdentification.medianDays).toBeGreaterThanOrEqual(0);
  });

  it('حسابرسی موردی: مدیر ثبت می‌کند، درمانگر ۴۰۳؛ ثبت با audit', async () => {
    const created = await mgr.post('/api/case-audits', {
      student_id: studentId,
      reviewer_a: 'روان‌سنج الف',
      reviewer_b: 'درمانگر ب',
      agreed: true,
      note: 'هر دو به نارساخوانی رسیدند'
    });
    expect(created.status).toBe(201);
    const audit = dataOf<AuditBody>(created);
    expect(audit.agreed).toBe(true);
    expect(audit.studentName).toBeTruthy();

    const denied = await ali.post('/api/case-audits', {
      student_id: studentId, reviewer_a: 'الف', reviewer_b: 'ب', agreed: true
    });
    expect(denied.status).toBe(403);

    const list = dataOf<AuditBody[]>(await mgr.get(`/api/case-audits?student_id=${studentId}`));
    expect(list.some((a) => a.id === audit.id)).toBe(true);

    const rows = A.sql.prepare(`SELECT action FROM audit_log WHERE action = 'case_audit.create'`).all() as { action: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('KPI برای درمانگر ۴۰۳ است (شاخص کلینیک — فقط مدیر)', async () => {
    expect((await ali.get('/api/validation-kpis')).status).toBe(403);
    expect((await ali.get('/api/case-audits')).status).toBe(403);
  });

  it('فرم پیگیری سه‌تا-شش‌ماهه در کتابخانهٔ فرم‌ها نشسته و خانواده‌پذیر است', async () => {
    const types = dataOf<{ id: string; key: string; familyFillable: boolean; title: string }[]>(await ali.get('/api/case-events/types?active=true'));
    const fu = types.find((t) => t.key === 'ce-followup-3m-v1');
    expect(fu).toBeDefined();
    expect(fu!.familyFillable).toBe(true);
    expect(fu!.title).toContain('پیگیری');
  });
});
