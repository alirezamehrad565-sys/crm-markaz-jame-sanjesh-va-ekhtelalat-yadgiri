import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent
} from '../../test/harness';

// پایش پیشرفت کامل: گزارش دوره‌ای به سه پرسش عددی پاسخ می‌دهد + وفاداری اجرا + شمارش دوز

interface MonitoringBody {
  metric: string | null;
  points: number;
  masteryPct: number | null;
  masteryAchieved: boolean | null;
  slopePerSession: number | null;
  trendKey: string | null;
  fourPointKey: string | null;
  decision: string | null;
  decisionLabel: string | null;
  dosePlanned: number;
  doseDone: number;
  doseAdherencePct: number | null;
  fidelityPct: number | null;
}

interface ReportBody {
  monitoring: MonitoringBody;
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('پایش پیشرفت کامل (سه پرسش عددی گزارش)', () => {
  let A: ReturnType<typeof createTestApp>;
  let ali: Api;
  let studentId: string;
  let pathId: string;

  beforeAll(async () => {
    A = createTestApp();
    ali = await asRole(A, 'therapist');
    studentId = (await createStudent(ali)).id;
    const created = await ali.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'dyslexia', goal: 'روانی خواندن تا ملاک ۸۰ — پروب هفتگی' });
    pathId = dataOf<{ id: string }>(created).id;
  });

  async function addProbe(value: number, day: number): Promise<void> {
    const res = await ali.post(`/api/clinical-paths/${pathId}/probes`, {
      metric: 'واژه درست در دقیقه', value, unit: 'واژه', taken_at: new Date(Date.parse('2026-09-01T09:00:00.000Z') + day * 86400000).toISOString()
    });
    expect(res.status).toBe(201);
  }

  it('پراپ ۸تایی روند رو به سکون + جلسهٔ انجام‌شده با وفاداری → گزارش سه پرسش را عددی پاسخ می‌دهد', async () => {
    for (const v of [40, 40, 41, 40, 40, 41, 40, 40]) await addProbe(v, 0);

    // یک جلسهٔ انجام‌شده با وفاداری کامل + یک جلسهٔ برنامه‌ریزی‌شده (دوز)
    const ses = dataOf<{ id: string }>(await ali.post(`/api/clinical-paths/${pathId}/sessions`, { title: 'جلسهٔ ۱ — آشنایی' }));
    await ali.patch(`/api/clinical-paths/${pathId}/sessions/${ses.id}`, {
      status: 'done',
      outcome: 'آشنایی با حروف هدف انجام شد',
      fidelity: { protocol: true, homework: true, parent: true }
    });
    await ali.post(`/api/clinical-paths/${pathId}/sessions`, { title: 'جلسهٔ ۲ — تمرین رمزگشایی' });

    const rep = dataOf<ReportBody>(await ali.get(`/api/clinical-paths/${pathId}/report`));
    const m = rep.monitoring;
    expect(m.metric).toBe('واژه درست در دقیقه');
    expect(m.points).toBe(8);
    expect(m.trendKey).toBe('plateau');
    expect(m.fourPointKey).toBe('indeterminate');
    expect(m.decision).toBe('dose'); // سکون → افزایش دوز
    expect(m.decisionLabel).toContain('دوز');
    expect(m.dosePlanned).toBe(2); // یک انجام‌شده + یک برنامه‌ریزی‌شده
    expect(m.doseDone).toBe(1);
    expect(m.doseAdherencePct).toBe(50);
    expect(m.fidelityPct).toBe(100); // هر سه بولی جلسهٔ انجام‌شده برقرار
    expect(m.masteryPct).toBe(50); // ۴۰ نسبت به ملاک ۸۰
    expect(m.masteryAchieved).toBe(false);
  });

  it('بدون پراپ → سه پرسش «—» و دوز همچنان عددی؛ وفاداری ثبت‌نشده null', async () => {
    const created = await ali.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'dysgraphia' });
    const pid = dataOf<{ id: string }>(created).id;
    const rep = dataOf<ReportBody>(await ali.get(`/api/clinical-paths/${pid}/report`));
    const m = rep.monitoring;
    expect(m.metric).toBeNull();
    expect(m.decision).toBeNull();
    expect(m.dosePlanned).toBe(0);
    expect(m.doseAdherencePct).toBeNull();
    expect(m.fidelityPct).toBeNull();
  });

  it('probes سری شامل داوری ۴-نقطه و سکون است (مسیر خواندن فرانت)', async () => {
    const probes = dataOf<{ metrics: { metric: string; monitor: { fourPoint: { key: string }; stall: { key: string; label: string } } }[] }>(
      await ali.get(`/api/clinical-paths/${pathId}/probes`)
    );
    const s = probes.metrics.find((x) => x.metric === 'واژه درست در دقیقه');
    expect(s).toBeDefined();
    expect(s!.monitor.fourPoint.key).toBe('indeterminate');
    expect(s!.monitor.stall.key).toBe('dose');
    expect(s!.monitor.stall.label).toContain('دوز');
  });
});
