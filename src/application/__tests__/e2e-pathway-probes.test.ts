// پایش پیشروی SLD: پراپ‌های سری زمانی مسیر مداخله — ثبت/فهرست/اصلاح، ملاک تسلط ۸۰٪ دوجلسه‌ای،
// فیلتر metric/threshold، دسترسی نقش‌ها، اتصال به جلسه (SET NULL)، مسیر بسته و بج listPaths
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent
} from '../../test/harness';

interface ProbeBody {
  id: string;
  pathwayId: string;
  sessionId: string | null;
  targetKey: string;
  metric: string;
  value: number;
  unit: string | null;
  takenAt: string;
  takenBy: string;
  note: string | null;
}
interface SeriesBody {
  metric: string;
  unit: string | null;
  count: number;
  firstAt: string | null;
  lastAt: string | null;
  latestValue: number | null;
  slope: number;
  verdict: { key: string; label: string; text: string; good: number };
  mastery: { achieved: boolean; threshold: number; streak: number; sinceAt: string | null };
  points: { value: number; takenAt: string }[];
}
interface PathBody {
  id: string;
  probeSummary: { count: number; masteredMetric: string | null } | null;
  sessions: { id: string }[];
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function errorOf(res: { body: unknown }): string {
  const e = (res.body as { error?: unknown }).error;
  return typeof e === 'string' ? e : ((e as { code?: string })?.code ?? '');
}

describe('پراپ‌های پیشروی مسیر', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;
  let studentId: string;
  let pathId: string;
  let probeIds: string[] = [];

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');

    studentId = (await createStudent(ali)).id;
    const created = await ali.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'dyslexia' });
    expect(created.status).toBe(201);
    pathId = dataOf<{ id: string }>(created).id;

    // یک جلسهٔ برنامه برای تست اتصال پراپ به جلسه
    const ses = await ali.post(`/api/clinical-paths/${pathId}/sessions`, { title: 'جلسهٔ ۱ — پراپ خواندن' });
    expect(ses.status).toBe(201);
  });

  it('ثبت پراپ → ۲۰۱ با اسنپ‌شات هدف و واحد و ردیف ممیزی probe_add', async () => {
    const res = await ali.post(`/api/clinical-paths/${pathId}/probes`, {
      metric: 'واژهٔ درست در دقیقه',
      value: 60,
      unit: 'واژه/دقیقه',
      taken_at: '2025-01-06T09:00:00.000Z',
      note: 'خط پایه'
    });
    expect(res.status).toBe(201);
    expect(res.cacheControl).toBe('no-store'); // قرارداد §۵
    const probe = dataOf<ProbeBody>(res);
    expect(probe.pathwayId).toBe(pathId);
    expect(probe.targetKey).toBe('dyslexia'); // اسنپ‌شات هدف مسیر در لحظهٔ ثبت
    expect(probe.metric).toBe('واژهٔ درست در دقیقه');
    expect(probe.value).toBe(60);
    expect(probe.unit).toBe('واژه/دقیقه');
    expect(probe.takenAt).toBe('2025-01-06T09:00:00.000Z');
    expect(probe.note).toBe('خط پایه');
    expect(probe.sessionId).toBeNull();
    const auditRow = A.sql.prepare(
      `SELECT action FROM audit_log WHERE resource_id = ? AND resource_type = 'intervention_path' AND action = 'clinical_path.probe_add'`
    ).get(pathId);
    expect(auditRow).toBeDefined();
    probeIds.push(probe.id);
  });

  it('سه پراپ واژه در دقیقه (۶۰/۷۰/۸۲) → یک سری صعودی با آخرین ۸۲ و شیب مثبت', async () => {
    const more = [
      { value: 70, taken_at: '2025-01-13T09:00:00.000Z' },
      { value: 82, taken_at: '2025-01-20T09:00:00.000Z' }
    ];
    for (const m of more) {
      const r = await ali.post(`/api/clinical-paths/${pathId}/probes`, {
        metric: 'واژهٔ درست در دقیقه',
        value: m.value,
        unit: 'واژه/دقیقه',
        taken_at: m.taken_at
      });
      expect(r.status).toBe(201);
      probeIds.push(dataOf<ProbeBody>(r).id);
    }
    const list = dataOf<{ metrics: SeriesBody[]; total: number }>(
      await mgr.get(`/api/clinical-paths/${pathId}/probes`)
    );
    expect(list.total).toBe(3);
    expect(list.metrics).toHaveLength(1);
    const s = list.metrics[0];
    expect(s.metric).toBe('واژهٔ درست در دقیقه');
    expect(s.unit).toBe('واژه/دقیقه');
    expect(s.count).toBe(3);
    expect(s.points.map((p) => p.value)).toEqual([60, 70, 82]); // صعودی بر اساس taken_at
    expect(s.latestValue).toBe(82);
    expect(s.firstAt).toBe('2025-01-06T09:00:00.000Z');
    expect(s.lastAt).toBe('2025-01-20T09:00:00.000Z');
    expect(s.slope).toBeGreaterThan(0);
    expect(s.verdict.key).toBe('improving'); // rel = ۱۱/۲۲×۱۰۰ ≈ ۵۰ ≥ ۵
    expect(s.mastery.achieved).toBe(false); // فقط ۸۲ بالای ملاک است — دنبالهٔ انتهایی ۱
  });

  it('ملاک تسلط: ۸۰/۸۴ تأیید می‌شود ولی ۸۲/۷۰ دنبالهٔ انتهایی ندارد؛ آستانهٔ ۶۰ داوری را عوض می‌کند', async () => {
    // سنجهٔ آگاهی واجی: ۸۰ بعد ۸۴ → دنبالهٔ انتهایی ۲ → تسلط (هر دو ≥ ملاک)
    await ali.post(`/api/clinical-paths/${pathId}/probes`, { metric: 'آگاهی واجی', value: 80, unit: '٪', taken_at: '2025-02-03T09:00:00.000Z' });
    const r2 = await ali.post(`/api/clinical-paths/${pathId}/probes`, { metric: 'آگاهی واجی', value: 84, unit: '٪', taken_at: '2025-02-10T09:00:00.000Z' });
    const awareness82 = dataOf<ProbeBody>(r2).id;
    // سنجهٔ روانی یادآوری: ۸۲ بعد ۷۰ → دنبالهٔ انتهایی ۱ → بدون تسلط در ۸۰
    await ali.post(`/api/clinical-paths/${pathId}/probes`, { metric: 'روانی یادآوری', value: 82, unit: '٪', taken_at: '2025-02-04T09:00:00.000Z' });
    await ali.post(`/api/clinical-paths/${pathId}/probes`, { metric: 'روانی یادآوری', value: 70, unit: '٪', taken_at: '2025-02-11T09:00:00.000Z' });

    const all = dataOf<{ metrics: SeriesBody[] }>(await mgr.get(`/api/clinical-paths/${pathId}/probes`));
    const byMetric = new Map(all.metrics.map((m) => [m.metric, m]));
    const awareness = byMetric.get('آگاهی واجی')!;
    expect(awareness.mastery.achieved).toBe(true);
    expect(awareness.mastery.streak).toBe(2);
    expect(awareness.mastery.sinceAt).toBe('2025-02-03T09:00:00.000Z'); // اولین عضو زوج
    expect(awareness.mastery.threshold).toBe(80);

    const recall = byMetric.get('روانی یادآوری')!;
    expect(recall.mastery.achieved).toBe(false);
    // «دنباله» انتهایی است: آخرین پراپ (۷۰) زیر ملاک است → دنبالهٔ فعلی صفر، هرچند ۸۲ قبلاً آمده
    expect(recall.mastery.streak).toBe(0);

    // آستانهٔ ۶۰: هر دو مقدارِ روانی یادآوری بالای ملاک می‌روند → تسلط
    const withTh = dataOf<{ metrics: SeriesBody[] }>(
      await mgr.get(`/api/clinical-paths/${pathId}/probes?threshold=60`)
    );
    const recallTh = withTh.metrics.find((m) => m.metric === 'روانی یادآوری')!;
    expect(recallTh.mastery.achieved).toBe(true);
    expect(recallTh.mastery.threshold).toBe(60);

    // ملاک خارج از بازهٔ مجاز → ۴۰۰
    expect((await mgr.get(`/api/clinical-paths/${pathId}/probes?threshold=0`)).status).toBe(400);
    expect((await mgr.get(`/api/clinical-paths/${pathId}/probes?threshold=abc`)).status).toBe(400);
    expect(awareness82).toBeDefined();
  });

  it('فیلتر metric: سنجهٔ ناشناخته → ۲۰۰ خالی؛ سنجهٔ شناخته → فقط همان سری', async () => {
    const unknown = dataOf<{ metrics: SeriesBody[]; total: number }>(
      await mgr.get(`/api/clinical-paths/${pathId}/probes?metric=${encodeURIComponent('سنجهٔ موهوم')}`)
    );
    expect(unknown.total).toBe(0);
    expect(unknown.metrics).toEqual([]);

    const only = dataOf<{ metrics: SeriesBody[]; total: number }>(
      await mgr.get(`/api/clinical-paths/${pathId}/probes?metric=${encodeURIComponent('آگاهی واجی')}`)
    );
    expect(only.total).toBe(2);
    expect(only.metrics).toHaveLength(1);
    expect(only.metrics[0].metric).toBe('آگاهی واجی');
  });

  it('دسترسی: منشی می‌خواند ولی ثبت/اصلاح نمی‌کند؛ بدون توکن ۴۰۱؛ مسیر ناموجود ۴۰۴', async () => {
    expect((await sec.get(`/api/clinical-paths/${pathId}/probes`)).status).toBe(200);
    expect((await sec.post(`/api/clinical-paths/${pathId}/probes`, { metric: 'سنجهٔ منشی', value: 10 })).status).toBe(403);
    expect((await sec.patch(`/api/clinical-paths/${pathId}/probes/${probeIds[0]}`, { value: 99 })).status).toBe(403);
    expect((await new Api(A).get(`/api/clinical-paths/${pathId}/probes`)).status).toBe(401);
    expect((await mgr.get('/api/clinical-paths/00000000-0000-4000-8000-ffffffffffff/probes')).status).toBe(404);
  });

  it('اصلاح پراپ: نمرهٔ تصحیح‌شده در سری می‌نشیند؛ پراپ/مسیر ناموجود ۴۰۴؛ کلید غایب دست‌نخورده', async () => {
    // ۸۲ → ۸۵ فقط با کلید value — بقیهٔ فیلدها باید دست‌نخورده بمانند (درس )
    const fixed = await ali.patch(`/api/clinical-paths/${pathId}/probes/${probeIds[2]}`, { value: 85 });
    expect(fixed.status).toBe(200);
    const body = dataOf<ProbeBody>(fixed);
    expect(body.value).toBe(85);
    expect(body.unit).toBe('واژه/دقیقه');
    expect(body.note).toBeNull();

    const list = dataOf<{ metrics: SeriesBody[] }>(await mgr.get(`/api/clinical-paths/${pathId}/probes`));
    const wpm = list.metrics.find((m) => m.metric === 'واژهٔ درست در دقیقه')!;
    expect(wpm.latestValue).toBe(85);
    expect(wpm.points[wpm.points.length - 1].value).toBe(85);
    expect(wpm.mastery.achieved).toBe(false); // ۶۰/۷۰/۸۵ — فقط ۸۵ بالای ملاک (دنبالهٔ ۱)
    expect(wpm.mastery.streak).toBe(1);

    expect((await ali.patch(`/api/clinical-paths/${pathId}/probes/00000000-0000-4000-8000-ffffffffffff`, { value: 1 })).status).toBe(404);
    expect((await ali.patch(`/api/clinical-paths/00000000-0000-4000-8000-ffffffffffff/probes/${probeIds[2]}`, { value: 1 })).status).toBe(404);
  });

  it('بدنهٔ نامعتبر → ۴۰۰: سنجهٔ کوتاه، مقدار منفی، مهر بی‌آفست', async () => {
    expect((await ali.post(`/api/clinical-paths/${pathId}/probes`, { metric: 'و', value: 10 })).status).toBe(400);
    expect((await ali.post(`/api/clinical-paths/${pathId}/probes`, { metric: 'سنجهٔ سالم', value: -5 })).status).toBe(400);
    expect((await ali.post(`/api/clinical-paths/${pathId}/probes`, { metric: 'سنجهٔ سالم', value: 10, taken_at: '1404/05/01' })).status).toBe(400);
    expect((await ali.post(`/api/clinical-paths/${pathId}/probes`, { metric: 'سنجهٔ سالم', value: 10, taken_at: '2025-01-01' })).status).toBe(400);
    expect((await ali.post(`/api/clinical-paths/${pathId}/probes`, { metric: 'سنجهٔ سالم', value: 20000 })).status).toBe(400);
    expect((await ali.post(`/api/clinical-paths/${pathId}/probes`, { metric: 'سنجهٔ سالم', value: 10, session_id: '00000000-0000-4000-8000-ffffffffffff' })).status).toBe(404);
  });

  it('اتصال به جلسه: پراپ جلسه‌دار sessionId دارد؛ حذف جلسه پراپ را زنده نگه می‌دارد (SET NULL)', async () => {
    const ses = await ali.post(`/api/clinical-paths/${pathId}/sessions`, { title: 'جلسهٔ موقت پراپ' });
    expect(ses.status).toBe(201);
    const sessionId = dataOf<{ id: string }>(ses).id;
    const linked = await ali.post(`/api/clinical-paths/${pathId}/probes`, {
      metric: 'آگاهی واجی',
      value: 88,
      unit: '٪',
      session_id: sessionId,
      taken_at: '2025-02-17T09:00:00.000Z'
    });
    expect(linked.status).toBe(201);
    const linkedId = dataOf<ProbeBody>(linked).id;
    expect(dataOf<ProbeBody>(linked).sessionId).toBe(sessionId);

    const del = await ali.delete(`/api/clinical-paths/${pathId}/sessions/${sessionId}`);
    expect(del.status).toBe(200);
    // پراپ زنده است و پیوندش null شده — اندازه‌گیری متعلق به مسیر است نه جلسه
    const survivor = A.sql.prepare(`SELECT session_id FROM pathway_probes WHERE id = ?`).get(linkedId);
    expect(survivor).toBeDefined();
    expect((survivor as { session_id: string | null }).session_id).toBeNull();
    const list = dataOf<{ metrics: SeriesBody[] }>(await mgr.get(`/api/clinical-paths/${pathId}/probes`));
    const awareness = list.metrics.find((m) => m.metric === 'آگاهی واجی')!;
    expect(awareness.count).toBe(3);
    expect(awareness.mastery.streak).toBe(3); // ۸۸ هم به دنباله اضافه شد
  });

  it('مسیر بسته پراپ جدید نمی‌پذیرد → ۴۰۹', async () => {
    const st2 = (await createStudent(ali)).id;
    const p2 = await ali.post(`/api/students/${st2}/clinical-paths`, { target_key: 'dyslexia' });
    const p2Id = dataOf<{ id: string }>(p2).id;
    const reject = await ali.post(`/api/clinical-paths/${p2Id}/decision`, { action: 'reject', note: 'فرضیه رد شد' });
    expect(reject.status).toBe(200);
    const closed = await ali.post(`/api/clinical-paths/${p2Id}/probes`, { metric: 'واژهٔ درست در دقیقه', value: 50 });
    expect(closed.status).toBe(409);
  });

  it('فهرست مسیرها بج probeSummary را دارد: شمارش + سنجهٔ تسلط‌یافته', async () => {
    const paths = dataOf<PathBody[]>(await mgr.get(`/api/students/${studentId}/clinical-paths`));
    const mine = paths.find((p) => p.id === pathId)!;
    expect(mine.probeSummary).not.toBeNull();
    expect(mine.probeSummary!.count).toBeGreaterThanOrEqual(8);
    // آخرین سنجهٔ تسلط‌یافته: آگاهی واجی (پراپ ۸۸ در ۱۷ فوریه جدیدتر از زوج ۷۰/۸۲ واژه در دقیقه است)
    expect(mine.probeSummary!.masteredMetric).toBe('آگاهی واجی');
  });
});
