// گزارش دوره‌ای طرح درمان: تجمیع جلسات/کارت‌ها، فیلتر بازه با مرز روز تهران،
// خلاصهٔ خانواده، ۴۰۳ برای نقش بیرون از فهرست و ۴۰۴ برای مسیر ناموجود
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  createStudent,
  makeNationalId
} from '../../test/harness';

interface ReportSession {
  ord: number;
  title: string;
  status: string;
  goal: string | null;
  criterion: string | null;
  outcome: string | null;
  doneAt: string | null;
  items: { type: string; text: string; done: boolean; linkId: string | null }[];
  cards: { type: string; text: string; done: boolean; linkId: string | null }[];
  cardsDone: number;
  cardsTotal: number;
}
interface ReportSummary {
  sessionsTotal: number;
  sessionsDone: number;
  sessionsSkipped: number;
  sessionsPlanned: number;
  outcomeCoverage: number | null;
  cardsTotal: number;
  cardsDone: number;
  cardsDonePct: number | null;
  probeCardsPlanned: number;
  probeCardsDone: number;
  firstOutcome: string | null;
  latestOutcome: string | null;
  doneDateFirst: string | null;
  doneDateLast: string | null;
}
interface PathwayReportBody {
  pathway: { id: string; studentId: string; studentName: string; targetKey: string; targetTitle: string; status: string; templateTitle: string | null };
  period: { from: string | null; to: string | null };
  summary: ReportSummary;
  sessions: ReportSession[];
  familySummary: string;
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function errorOf(res: { body: unknown }): string {
  const e = (res.body as { error?: unknown }).error;
  return typeof e === 'string' ? e : ((e as { code?: string })?.code ?? '');
}

describe('گزارش دوره‌ای طرح درمان', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;
  let studentId: string;
  let pathId: string;
  const sessionIds: string[] = [];

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');

    const ex = await mgr.post('/api/exercises', { title: 'تمرین آگاهی واجی — گزارش دوره', format: 'worksheet' });
    expect(ex.status).toBe(201);
    const exerciseId = dataOf<{ id: string }>(ex).id;

    // طرح درمان چهار جلسه‌ای — مبنای گزارش
    const tpl = await ali.post('/api/pathway-templates', {
      key: 'tpl--report',
      title: 'طرح گزارش دوره — چهار جلسه',
      protocol: 'learning',
      target_key: 'dyslexia',
      sessions: [
        {
          title: 'جلسهٔ ۱ — خط‌مایه',
          plan: 'تفکیک آواهای اول واژه',
          criterion: 'حذف درست آوا در ۸۰٪ پراپ‌ها',
          items: [
            { type: 'exercise', text: 'تمرین آگاهی واجی — گزارش دوره', link_id: exerciseId },
            { type: 'probe', text: 'پراپ: واژه در دقیقه — خط پایه' }
          ]
        },
        { title: 'جلسهٔ ۲ — ادغام', plan: 'تثبیت با بازی', items: [{ type: 'game', text: 'بازی کارت‌های هم‌خانواده' }] },
        {
          title: 'جلسهٔ ۳ — روان‌خوانی',
          plan: 'افزایش سرعت و دقت',
          criterion: '۹۰ واژه در دقیقه',
          items: [
            { type: 'family', text: 'آموزش والدین: تمرین روزانهٔ خواندن' },
            { type: 'probe', text: 'پراپ: واژه در دقیقه — پیشروی' }
          ]
        },
        { title: 'جلسهٔ ۴ — جمع‌بندی', plan: 'بازسنجی و جمع‌بندی دوره', items: [] }
      ]
    });
    expect(tpl.status).toBe(201);

    studentId = (await createStudent(ali)).id;
    const created = await ali.post(`/api/students/${studentId}/clinical-paths`, {
      template_key: 'tpl--report',
      target_key: 'dyslexia'
    });
    expect(created.status).toBe(201);
    pathId = dataOf<{ id: string }>(created).id;
    const sessions = dataOf<{ sessions: { id: string }[] }>(created).sessions;
    expect(sessions).toHaveLength(4);
    sessionIds.push(...sessions.map((s) => s.id));

    // جلسهٔ پنجم اضافه و رد (skipped) می‌شود — برای شمارش رد‌شده‌ها
    const extra = await ali.post(`/api/clinical-paths/${pathId}/sessions`, { title: 'جلسهٔ ۵ — جبرانی', plan: 'جبران جلسهٔ عقب‌افتاده' });
    expect(extra.status).toBe(201);
    sessionIds.push(dataOf<{ id: string }>(extra).id);

    // جلسهٔ ۱ انجام: نتیجه + هر دو کارت تیک‌خورده
    const paths = dataOf<{ id: string; sessions: ReportSession[] }[]>(
      await ali.get(`/api/students/${studentId}/clinical-paths`)
    );
    const mine = paths.find((p) => p.id === pathId)!;
    const baseItems = mine.sessions[0].items;

    const done1 = await ali.patch(`/api/clinical-paths/${pathId}/sessions/${sessionIds[0]}`, {
      status: 'done',
      outcome: 'نتیجهٔ جلسهٔ یک — تفکیک آواها تثبیت شد',
      items: baseItems.map((it) => ({ type: it.type, text: it.text, done: true, link_id: it.linkId }))
    });
    expect(done1.status).toBe(200);

    // جلسهٔ ۲ انجام: کارت تیک‌خورده، بدون نتیجه (برای پوشش نتیجه‌نویسی ناقص)
    const done2 = await ali.patch(`/api/clinical-paths/${pathId}/sessions/${sessionIds[1]}`, {
      status: 'done',
      items: [{ type: 'game', text: 'بازی کارت‌های هم‌خانواده', done: true, link_id: null }]
    });
    expect(done2.status).toBe(200);

    // جلسهٔ ۳ انجام: نتیجهٔ آخر، کارت‌ها تیک نخورده
    const done3 = await ali.patch(`/api/clinical-paths/${pathId}/sessions/${sessionIds[2]}`, {
      status: 'done',
      outcome: 'نتیجهٔ آخر — روان‌خوانی به ۹۰ واژه رسید'
    });
    expect(done3.status).toBe(200);

    // جلسهٔ ۵ رد می‌شود
    const skip5 = await ali.patch(`/api/clinical-paths/${pathId}/sessions/${sessionIds[4]}`, { status: 'skipped' });
    expect(skip5.status).toBe(200);

    // مهر زمانیِ انجام در تست ثابت می‌شود تا بازهٔ گزارش قطعی باشد؛
    // جلسهٔ ۱ عمداً ۲۱:۰۰ UTC روز ۹ ژانویه است = ۰۰:۳۰ روز ۱۰ ژانویه تهران (مرز روز)
    const setDoneAt = A.sql.prepare(`UPDATE pathway_sessions SET done_at = ? WHERE id = ?`);
    setDoneAt.run('2025-01-09T21:00:00.000Z', sessionIds[0]);
    setDoneAt.run('2025-01-10T09:00:00.000Z', sessionIds[1]);
    setDoneAt.run('2025-02-20T09:00:00.000Z', sessionIds[2]);
  });

  it('گزارش کل دوره — تجمیع جلسات/کارت‌ها/پراپ/پوشش نتیجه + خلاصهٔ خانواده با اعداد فارسی', async () => {
    const res = await mgr.get(`/api/clinical-paths/${pathId}/report`);
    expect(res.status).toBe(200);
    expect(res.cacheControl).toBe('no-store'); // قرارداد §۵ — پاسخ API کش نمی‌شود
    const report = dataOf<PathwayReportBody>(res);

    expect(report.pathway.id).toBe(pathId);
    expect(report.pathway.studentId).toBe(studentId);
    expect(report.pathway.targetKey).toBe('dyslexia');
    expect(report.pathway.status).toBe('suggested'); // مسیر بدون تصمیم — گزارش مستقل از وضعیت مسیر است
    expect(report.period).toEqual({ from: null, to: null });

    const s = report.summary;
    expect(s.sessionsTotal).toBe(5);
    expect(s.sessionsDone).toBe(3);
    expect(s.sessionsSkipped).toBe(1);
    expect(s.sessionsPlanned).toBe(1);
    expect(s.cardsTotal).toBe(5);
    expect(s.cardsDone).toBe(3);
    expect(s.cardsDonePct).toBe(60);
    expect(s.probeCardsPlanned).toBe(2);
    expect(s.probeCardsDone).toBe(1);
    expect(s.outcomeCoverage).not.toBeNull();
    expect(Math.abs((s.outcomeCoverage as number) - 2 / 3)).toBeLessThan(1e-9); // ۲ جلسهٔ دارای نتیجه از ۳ جلسه
    expect(s.firstOutcome).toBe('نتیجهٔ جلسهٔ یک — تفکیک آواها تثبیت شد'); // مرتب بر اساس مهر انجام، نه ترتیب برنامه
    expect(s.latestOutcome).toBe('نتیجهٔ آخر — روان‌خوانی به ۹۰ واژه رسید');
    expect(s.doneDateFirst).toBe('2025-01-09T21:00:00.000Z');
    expect(s.doneDateLast).toBe('2025-02-20T09:00:00.000Z');

    // جلسات به ترتیب ord و با هدف/معیار/کارت‌ها
    expect(report.sessions.map((x) => x.ord)).toEqual([1, 2, 3, 4, 5]);
    const first = report.sessions[0];
    expect(first.goal).toBe('تفکیک آواهای اول واژه');
    expect(first.criterion).toBe('حذف درست آوا در ۸۰٪ پراپ‌ها');
    expect(first.cardsTotal).toBe(2);
    expect(first.cardsDone).toBe(2);
    expect(first.cards[0].linkId).not.toBeNull(); // کارت پیوسته به بانک تمرین حفظ شده
    expect(first.doneAt).toBe('2025-01-09T21:00:00.000Z');
    expect(report.sessions[3].status).toBe('planned');
    expect(report.sessions[4].status).toBe('skipped');

    // خلاصهٔ خانواده: قطعی، با اعداد فارسی و بدون جملات فنی
    expect(report.familySummary).toContain('در این دوره ۳ جلسه برگزار شد');
    expect(report.familySummary).toContain('۱ جلسه هم برنامه‌ریزی شده بود اما اجرا نشد');
    expect(report.familySummary).toContain('از ۵ تمرین و کارت برنامه، ۳ کارت انجام شد (۶۰٪)');
    expect(report.familySummary).toContain('آخرین نتیجه‌ای که درمانگر ثبت کرده است');
  });

  it('فیلتر بازه از/تا با مرز روز تهران — جلسهٔ ۰۰:۳۰ تهران جزو همان روز است', async () => {
    // روز ۱۰ ژانویه تهران (شروع ۹ ژانویه ۲۰:۳۰ UTC): جلسهٔ ۱ و ۲ هر دو داخل این روزند
    const dayRes = dataOf<PathwayReportBody>(
      (await mgr.get(`/api/clinical-paths/${pathId}/report?from=2025-01-10&to=2025-01-10`))
    );
    expect(dayRes.period).toEqual({ from: '2025-01-10', to: '2025-01-10' });
    expect(dayRes.summary.sessionsTotal).toBe(2);
    expect(dayRes.summary.sessionsDone).toBe(2);
    expect(dayRes.summary.sessionsPlanned).toBe(0); // در گزارش دوره‌ای فقط جلسات دارای مهر می‌آیند
    expect(dayRes.summary.cardsTotal).toBe(3);
    expect(dayRes.summary.cardsDone).toBe(3);
    expect(dayRes.summary.cardsDonePct).toBe(100);
    expect(dayRes.summary.doneDateFirst).toBe('2025-01-09T21:00:00.000Z');
    expect(dayRes.sessions.map((x) => x.ord)).toEqual([1, 2]);

    // تا ۹ ژانویه — هیچ جلسه‌ای (جلسهٔ ۱ از ۰۰:۳۰ تهرانِ ۱۰ ژانویه است)
    const beforeRes = dataOf<PathwayReportBody>(
      (await mgr.get(`/api/clinical-paths/${pathId}/report?to=2025-01-09`))
    );
    expect(beforeRes.summary.sessionsTotal).toBe(0);
    expect(beforeRes.summary.outcomeCoverage).toBeNull();
    expect(beforeRes.familySummary).toContain('در این بازه جلسه‌ای برگزار نشده است');

    // فقط فوریه — جلسهٔ ۳ با پوشش نتیجهٔ کامل
    const febRes = dataOf<PathwayReportBody>(
      (await mgr.get(`/api/clinical-paths/${pathId}/report?from=2025-02-01&to=2025-02-28`))
    );
    expect(febRes.summary.sessionsTotal).toBe(1);
    expect(febRes.summary.sessionsDone).toBe(1);
    expect(febRes.summary.outcomeCoverage).toBe(1);
    expect(febRes.summary.firstOutcome).toBe('نتیجهٔ آخر — روان‌خوانی به ۹۰ واژه رسید');
    expect(febRes.familySummary).toContain('در این دوره ۱ جلسه برگزار شد');

    // بازهٔ وارونه → ۴۰۰
    const bad = await mgr.get(`/api/clinical-paths/${pathId}/report?from=2025-03-01&to=2025-02-01`);
    expect(bad.status).toBe(400);
    expect(errorOf(bad)).toBe('VALIDATION_ERROR');

    // قالب تاریخ غیر میلادی (جلالی) → ۴۰۰
    const badFormat = await mgr.get(`/api/clinical-paths/${pathId}/report?from=1404/01/01`);
    expect(badFormat.status).toBe(400);
  });

  it('دسترسی: منشی مجاز، ناظر اداره ۴۰۳، بدون توکن ۴۰۱، مسیر ناموجود ۴۰۴', async () => {
    expect((await sec.get(`/api/clinical-paths/${pathId}/report`)).status).toBe(200);

    // نقش بیرون از فهرست (ناظر اداره) → ۴۰۳
    const createSup = await mgr.post('/api/staff', {
      full_name: 'ناظر گزارش دوره',
      phone: '09123330099',
      national_id: makeNationalId(),
      username: 'sup--report',
      role: 'supervisor'
    });
    expect(createSup.status).toBe(201);
    const sup = new Api(A, await loginToken(A, 'sup--report'));
    expect((await sup.get(`/api/clinical-paths/${pathId}/report`)).status).toBe(403);

    // بدون احراز → ۴۰۱
    expect((await new Api(A).get(`/api/clinical-paths/${pathId}/report`)).status).toBe(401);

    // مسیر ناموجود → ۴۰۴
    const missing = await mgr.get('/api/clinical-paths/00000000-0000-4000-8000-ffffffffffff/report');
    expect(missing.status).toBe(404);
    expect(errorOf(missing)).toBe('NOT_FOUND');
  });
});
