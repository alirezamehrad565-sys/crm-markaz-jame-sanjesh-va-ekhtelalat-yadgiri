import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent
} from '../../test/harness';

// — بازسازی هوک وکسلر و خلاصهٔ گیت‌ها (رگرسیون → )
// ریشه: پس از بازسازی باندل از src ()، هوک «تحلیل خودکار وکسلر ۴» هنگام ثبت فرم
// و فیلد wechslerSummary/suspicion در /clinical-gates از سرویس‌های TS افتاده بود —
// نتیجه: فرم وکسلر در تاریخچه دیده می‌شد ولی تب تفسیر بالینی همیشه «بدون داده» بود.

interface GatesBody {
  phase: string;
  protocol: string | null;
  gates: { key: string; done: boolean; detail: string }[];
  suspicion?: { signals: { construct: string; level: string; label: string; evidence: string[] }[]; decided: boolean; decidedSummary: string | null } | null;
  wechslerSummary?: {
    fsiq: number | null;
    vci: number | null;
    pri: number | null;
    wmi: number | null;
    psi: number | null;
    percentile: number | null;
    cls: string | null;
    engine: boolean;
    occurredAt: string | null;
    event: { date: string } | null;
    profile: { indices: { key: string; scaled: number | null }[]; subtests: { code: string; scaled: number | null }[] } | null;
    psychometrics: Record<string, unknown> | null;
  } | null;
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

const RAW_CORE = {
  raw_bd: 10, raw_si: 11, raw_ds: 9, raw_pcn: 10, raw_cd: 10,
  raw_vc: 11, raw_ln: 9, raw_mr: 11, raw_co: 10, raw_ss: 10
};
const RAW_SUBS = { raw_pcm: 8, raw_ca: 30, raw_in: 9, raw_ar: 7, raw_wr: 6 };

async function typeIdOf(A: ReturnType<typeof createTestApp>, key: string): Promise<string> {
  const row = await A.db.queryOne<{ id: string }>(`SELECT id FROM case_event_types WHERE key = ?`, [key]);
  if (!row) throw new Error(`event type ${key} not found`);
  return row.id;
}

describe('/ — هوک وکسلر + wechslerSummary + suspicion در گیت‌ها', () => {
  let A: ReturnType<typeof createTestApp>;
  let ali: Api;
  let studentA: { id: string };
  let studentB: { id: string };
  let studentC: { id: string };

  beforeAll(async () => {
    A = createTestApp();
    ali = await asRole(A, 'therapist');
    studentA = await createStudent(ali, { birth_date: '2016-02-04' });
    studentB = await createStudent(ali, { birth_date: '2016-02-04' });
    studentC = await createStudent(ali, { birth_date: '2016-02-04' });
  });

  it('ثبت فرم وکسلر → engine_output در payload ذخیره می‌شود و خلاصه JSON را لو نمی‌دهد', async () => {
    const typeId = await typeIdOf(A, 'ce-wechsler-w4-v1');
    const res = await ali.post(`/api/students/${studentA.id}/case-events`, {
      eventTypeId: typeId,
      occurredAt: '2026-10-20T12:00:00.000Z',
      values: { test_date: '1404/07/01', ...RAW_CORE, ...RAW_SUBS }
    });
    expect(res.status).toBe(201);
    const event = dataOf<{ payload: Record<string, { value: string; label: string }>; summary: string | null }>(res);
    expect(event.payload['engine_output']).toBeTruthy();
    const eng = JSON.parse(event.payload['engine_output'].value) as { ok: boolean; snapshot: { fsiq: number | null } };
    expect(eng.ok).toBe(true);
    expect(eng.snapshot.fsiq).not.toBeNull();
    // — buildSummary از summarySafePayload می‌خواند؛ JSON موتور نباید در خلاصه باشد
    expect(event.summary ?? '').not.toContain('engineVersion');
  });

  it('گیت‌ها → wechslerSummary از engine_output ساخته می‌شود (نیم‌رخ کامل، engine: true)', async () => {
    const gates = dataOf<GatesBody>(await ali.get(`/api/students/${studentA.id}/clinical-gates`));
    const w = gates.wechslerSummary;
    expect(w).toBeTruthy();
    expect(w!.engine).toBe(true);
    expect(w!.fsiq).not.toBeNull();
    expect(w!.vci).not.toBeNull();
    expect(w!.psi).not.toBeNull();
    expect(w!.event?.date).toBeTruthy();
    expect(w!.profile).toBeTruthy();
    expect((w!.profile!.indices ?? []).length).toBeGreaterThanOrEqual(4);
    expect((w!.profile!.subtests ?? []).length).toBeGreaterThanOrEqual(10);
    const gate = gates.gates.find((g) => g.key === 'wechsler')!;
    expect(gate.done).toBe(true);
  });

  it('ویرایش رویداد وکسلر → موتور دوباره می‌چرخد و خروجی تازه می‌شود', async () => {
    const typeId = await typeIdOf(A, 'ce-wechsler-w4-v1');
    const created = dataOf<{ id: string }>(await ali.post(`/api/students/${studentB.id}/case-events`, {
      eventTypeId: typeId,
      occurredAt: '2026-10-21T12:00:00.000Z',
      values: { test_date: '1404/07/01', ...RAW_CORE, ...RAW_SUBS }
    }));
    const before = dataOf<GatesBody>(await ali.get(`/api/students/${studentB.id}/clinical-gates`));
    const fsiqBefore = before.wechslerSummary!.fsiq;
    const changed = { ...RAW_CORE, raw_si: 2, raw_vc: 1, raw_co: 2, raw_mr: 1, raw_bd: 2 };
    const upd = await ali.patch(`/api/case-events/${created.id}`, { values: { test_date: '1404/07/01', ...changed, ...RAW_SUBS } });
    expect(upd.status).toBe(200);
    const after = dataOf<GatesBody>(await ali.get(`/api/students/${studentB.id}/clinical-gates`));
    expect(after.wechslerSummary!.engine).toBe(true);
    expect(after.wechslerSummary!.fsiq).not.toBeNull();
    expect(after.wechslerSummary!.fsiq).not.toBe(fsiqBefore);
  });

  it('رویداد قدیمی بدون engine_output ولی با فیلد دستی → مسیر دستی (engine: false)', async () => {
    const typeId = await typeIdOf(A, 'ce-wechsler-w4-v1');
    await A.db.execute(
      `INSERT INTO case_events (id, event_type_id, student_id, occurred_at, status, payload, summary, created_by)
       VALUES (?, ?, ?, ?, 'completed', ?, 'فرم دستی', 'e2e')`,
      [
        crypto.randomUUID(),
        typeId,
        studentC.id,
        '2026-03-01T12:00:00.000Z',
        JSON.stringify({ fsiq: { value: '92', label: 'FSIQ' }, vci: { value: '۸۸', label: 'VCI' } })
      ]
    );
    const gates = dataOf<GatesBody>(await ali.get(`/api/students/${studentC.id}/clinical-gates`));
    const w = gates.wechslerSummary!;
    expect(w.engine).toBe(false);
    expect(w.fsiq).toBe(92);
    expect(w.vci).toBe(88);
    expect(w.profile).toBeNull();
  });

  it('suspicion — SNAP-IV والد پرخطر + تصمیم ثبت‌شده → سیگنال adhd سطح high + decided', async () => {
    const snapId = await typeIdOf(A, 'ce-snap-iv-p-v1');
    const susId = await typeIdOf(A, 'ce-clinical-suspicion-v1');
    const iso = new Date().toISOString();
    await A.db.execute(
      `INSERT INTO case_events (id, event_type_id, student_id, occurred_at, status, payload, analysis, summary, created_by)
       VALUES (?, ?, ?, ?, 'completed', ?, ?, 'SNAP', 'e2e')`,
      [
        crypto.randomUUID(),
        snapId,
        studentC.id,
        iso,
        JSON.stringify({ ia_total: { value: '18', label: 'نمرهٔ بی‌توجهی' } }),
        JSON.stringify({ score: 18, band: null, answered: 9, total: 9, maxScore: 27, subscaleScores: [{ id: 'ia', name: 'بی‌توجهی', score: 18, max: 27, band: 'پرخطر', color: 'danger' }] })
      ]
    );
    await A.db.execute(
      `INSERT INTO case_events (id, event_type_id, student_id, occurred_at, status, payload, summary, created_by)
       VALUES (?, ?, ?, ?, 'completed', ?, 'تصمیم', 'e2e')`,
      [crypto.randomUUID(), susId, studentC.id, iso, JSON.stringify({ decision: { value: 'بیش‌فعالی محتمل', label: 'تصمیم شک بالینی' } })]
    );
    const gates = dataOf<GatesBody>(await ali.get(`/api/students/${studentC.id}/clinical-gates`));
    const sus = gates.suspicion!;
    expect(sus.decided).toBe(true);
    expect(sus.decidedSummary).toBe('بیش‌فعالی محتمل');
    const adhd = sus.signals.find((s) => s.construct === 'adhd');
    expect(adhd).toBeTruthy();
    expect(adhd!.level).toBe('high');
    expect((adhd!.evidence ?? []).length).toBeGreaterThan(0);
  });

  it('نمرهٔ خام نامعتبر → ۴۰۰ با پیام موتور (رفتار باندل اصلی)', async () => {
    const typeId = await typeIdOf(A, 'ce-wechsler-w4-v1');
    const res = await ali.post(`/api/students/${studentA.id}/case-events`, {
      eventTypeId: typeId,
      values: { test_date: '1404/07/01', raw_si: -5 }
    });
    expect(res.status).toBe(400);
    const msg = JSON.stringify((res.body as { message?: string }).message ?? '');
    expect(msg).toContain('موتور وکسلر');
  });
});
