// زنجیرهٔ کامل خط عددی «جادهٔ عددها» (۱.۲۵.۲۸) — ارسال→مأموریت→لینک→جادهٔ مرحله→بازخورد→پایان→ستاره
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';

interface LinkBody { jti: string; token: string; url: string; expiresAt: string }

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

const TOL = { a: 0.5, b: 1, c: 2, d: 4 };

/** بستهٔ آزمونی جادهٔ عددها — بانک authored با چهار جاده + پروب پایان */
function numlineBody() {
  const train = (id: string, band: 'a' | 'b' | 'c' | 'd', num: number) => ({
    id, phase: 'train', type: 'numline',
    prompt: 'این عدد کجای جاده است؟',
    stim: { number: num },
    range: [0, { a: 10, b: 20, c: 50, d: 100 }[band]] as [number, number],
    correct: num,
    tolerance: TOL[band]
  });
  const probe = (id: string, band: 'a' | 'b' | 'c' | 'd', num: number) => ({
    ...train(id, band, num), phase: 'probe'
  });
  return {
    package_id: 'numline1',
    version: '1.0.0',
    title_fa: 'حس عدد — جادهٔ عددها',
    evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 },
    body: {
      package_id: 'numline1',
      goals: ['numline'],
      mastery: { threshold: 30, sessions: 2 }, // ملاک تسلط: میانگین خطای جای عدد ≤۳۰٪ (lower-is-better)
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'numline_v1', game: 'numline', goal: 'numline', metric: 'pct_error_numline',
        metrics: ['pct_error_numline', 'accuracy_numline'],
        title: 'جادهٔ عددها',
        items: [
          // جادهٔ کوچک ۰–۱۰ (۸)
          train('ta1', 'a', 3), train('ta2', 'a', 7), train('ta3', 'a', 1), train('ta4', 'a', 9),
          train('ta5', 'a', 5), train('ta6', 'a', 2), train('ta7', 'a', 8), train('ta8', 'a', 6),
          // جادهٔ شهر ۰–۲۰ (۶)
          train('tb1', 'b', 12), train('tb2', 'b', 16), train('tb3', 'b', 9),
          train('tb4', 'b', 18), train('tb5', 'b', 13), train('tb6', 'b', 15),
          // جادهٔ بلند ۰–۵۰ (۶)
          train('tc1', 'c', 23), train('tc2', 'c', 37), train('tc3', 'c', 45),
          train('tc4', 'c', 12), train('tc5', 'c', 41), train('tc6', 'c', 29),
          // جادهٔ بزرگ ۰–۱۰۰ (۶)
          train('td1', 'd', 63), train('td2', 'd', 81), train('td3', 'd', 34),
          train('td4', 'd', 92), train('td5', 'd', 47), train('td6', 'd', 75),
          // پروب پایان (۸) — بدون بازخورد
          probe('pa1', 'a', 4), probe('pa2', 'a', 8),
          probe('pb1', 'b', 14), probe('pb2', 'b', 11),
          probe('pc1', 'c', 33), probe('pc2', 'c', 48),
          probe('pd1', 'd', 56), probe('pd2', 'd', 88)
        ]
      }],
      parent_copy: { before: 'این بازی تمرین مهارت است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
    }
  };
}

function todayYmd(): string {
  const now = new Date();
  const tehran = new Date(now.getTime() + 3.5 * 3600 * 1000);
  return tehran.toISOString().slice(0, 10);
}

describe('خط عددی «جادهٔ عددها» — زنجیرهٔ کامل کودک', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let anon: Api;
  let studentId: string;
  let rxId: string;
  let link: LinkBody;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    anon = new Api(A);
    studentId = (await createStudent(mgr)).id;

    // سنجهٔ دقت خط عددی (میانگین خطا از مایگریشن ۰۰۸۷ حاضر است)
    const metric = await mgr.post('/api/games/metrics', {
      id: 'accuracy_numline', title_fa: 'دقت جای عدد', unit: 'percent',
      higher_is_better: true, source: 'auto', formula: 'accuracy'
    });
    expect([200, 201, 409]).toContain(metric.status);

    await mgr.post('/api/games/packages', numlineBody());
    await mgr.post('/api/games/packages/numline1/1.0.0/publish', {});
    const goal = await mgr.post('/api/games/goals', {
      id: 'numline_road', title_fa: 'حس عدد و جای عدد (آزمون)', package_id: 'numline1', metric_id: 'pct_error_numline'
    });
    expect(goal.status).toBe(201);
    const rx = await mgr.post('/api/games/prescriptions', {
      child_id: studentId, package_id: 'numline1', package_version: '1.0.0', goal_id: 'numline_road'
    });
    expect(rx.status).toBe(201);
    rxId = dataOf<{ id: string }>(rx).id;
    const m = await mgr.post('/api/games/missions', {
      prescription_id: rxId, mission_ref: 'numline_v1', scheduled_for: todayYmd()
    });
    link = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(m).id}/link`, {}));
  });

  it('start: مرحلهٔ ۱ «جادهٔ کوچک» با انتخاب آیتم‌های همان جاده — کلاینت هیچ کلیدی نمی‌بیند', async () => {
    const st = dataOf<Record<string, unknown>>(await anon.post(`/api/m/${link.token}/start`, {}));
    expect(st.playGame).toBe('numline');
    const stage = st.playStage as { id: string; title_fa: string; total: number; index: number };
    expect(stage.id).toBe('s1');
    expect(stage.title_fa).toBe('جادهٔ کوچک');
    expect(st.playHint ?? null).toBeNull(); // راهنمای آموزشی خط عددی ایستا است (فرانت می‌سازد)
    const html = await (await A.app.request(`/m/${link.token}`, {}, A.env as never)).text();
    expect(html).toContain('data-kind="numline"');
  });

  it('nextItem: فقط آیتم‌های جادهٔ s1 — مجموع ۱۰ (۸ آموزش + ۲ پروب)؛ بدون correct/tolerance', async () => {
    const first = dataOf<{ item: Record<string, unknown>; progress: { done: number; total: number } }>(
      await anon.get(`/api/m/${link.token}/next-item`));
    expect(first.item?.id).toBe('ta1');
    expect(first.item?.type).toBe('numline');
    expect(first.item?.range).toEqual([0, 10]);
    expect(first.progress.total).toBe(10);
    const s = JSON.stringify(first);
    expect(s).not.toContain('correct');
    expect(s).not.toContain('tolerance');
    expect(s).not.toContain('42'); // شمارهٔ پروب جاده‌های بلند هرگز در جادهٔ کوچک نیست
  });

  it('بازخورد دو-سطحی: دقیق / نزدیک / بی‌سرزنش با نمایش پاسخ', async () => {
    const tk = link.token;
    const exact = dataOf<{ message: string; correct: boolean; answer_display: string | null }>(
      await anon.post(`/api/m/${tk}/attempts`, { item_id: 'ta1', response: { chosen: 3 }, rt_ms: 1200, idem_key: 'nl-exact-01' }));
    expect(exact.correct).toBe(true);
    expect(exact.message).toBe('دقیقاً همان‌جا! آفرین.');
    const near = dataOf<{ message: string; correct: boolean }>(
      await anon.post(`/api/m/${tk}/attempts`, { item_id: 'tb1', response: { chosen: 13 }, rt_ms: 1100, idem_key: 'nl-near-001' }));
    expect(near.correct).toBe(true); // |13−12|=۱ ≤ آستانهٔ ۱
    expect(near.message).toBe('خیلی نزدیک بود! گرفتی.');
    const miss = dataOf<{ message: string; correct: boolean; answer_display: string | null }>(
      await anon.post(`/api/m/${tk}/attempts`, { item_id: 'tb2', response: { chosen: 9 }, rt_ms: 1000, idem_key: 'nl-miss-001' }));
    expect(miss.correct).toBe(false); // |9−16|=۷ > ۱
    expect(miss.message).toBe('این یکی سخته؛ بیا با هم دوباره نگاهش کنیم.');
    expect(miss.answer_display).toBe('16');
    const probe = dataOf<{ phase: string; message?: string; correct?: boolean }>(
      await anon.post(`/api/m/${tk}/attempts`, { item_id: 'pa1', response: { chosen: 4 }, rt_ms: 900, idem_key: 'nl-probe-1' }));
    expect(probe.phase).toBe('probe');
    expect(probe.message).toBeUndefined();
    expect(probe.correct).toBeUndefined();
  });

  it('سد سروری آیتم پاسخ‌داده‌شده — idem_key تازه پاسخ دوم نمی‌سازد (G1)', async () => {
    const again = dataOf<{ correct: boolean; message: string }>(
      await anon.post(`/api/m/${link.token}/attempts`, { item_id: 'ta1', response: { chosen: 9 }, rt_ms: 500, idem_key: 'nl-exact-02' }));
    expect(again.correct).toBe(true); // پاسخ اول (۳) — نه ۹
    expect(again.message).toBe('دقیقاً همان‌جا! آفرین.');
  });

  it('finish: سنجه‌های خط عددی + ستارهٔ مرحله + دعوت جادهٔ بعد — همه از خلاصهٔ محاسبه‌شده', async () => {
    const tk = link.token;
    // بقیهٔ جادهٔ s1: ta2..ta8 درستِ دقیق + pa2 پروب درست — می‌ماندها همه دقیق
    for (const id of ['ta2', 'ta3', 'ta4', 'ta5', 'ta6', 'ta7', 'ta8', 'pa2']) {
      const num = { ta2: 7, ta3: 1, ta4: 9, ta5: 5, ta6: 2, ta7: 8, ta8: 6, pa2: 8 }[id];
      await anon.post(`/api/m/${tk}/attempts`, { item_id: id, response: { chosen: num }, rt_ms: 900, idem_key: 'nl-fin-' + id });
    }
    const fin = dataOf<{ state: { state: string; playStageResult?: { title_fa: string; stars: number; next_title_fa: string | null; passed: boolean; stars_total: number } }; metrics: { metricId: string; value: number }[] }>(
      await anon.post(`/api/m/${tk}/finish`, { session_evidence: { pause_count: 0, pause_total_ms: 0 } }));
    expect(fin.state.state).toBe('child_done');
    // ۱۰ پاسخ دقیق از ۱۰ → دقت ۱۰۰ → ستارهٔ ۳
    const res = fin.state.playStageResult;
    expect(res?.title_fa).toBe('جادهٔ کوچک');
    expect(res?.stars).toBe(3);
    expect(res?.passed).toBe(true);
    expect(res?.next_title_fa).toBe('جادهٔ شهر');
    // سنجه‌ها فقط از پروب (پا1 + پا2 دقیق): میانگین خطا ۰ و دقت ۱۰۰
    const byId = Object.fromEntries(fin.metrics.map((x) => [x.metricId, x.value]));
    expect(byId['pct_error_numline']).toBe(0);
    expect(byId['accuracy_numline']).toBe(100);
  });

  it('جلسهٔ بعد: جادهٔ شهر باز می‌شود — تاریخچهٔ مرحله از خلاصهٔ جلسه‌ها خوانده می‌شود', async () => {
    // سقف دوز امروز ۲ است — مأموریت دوم مجاز؛ لینک تازه برای جلسهٔ تازه
    const m2 = await mgr.post('/api/games/missions', {
      prescription_id: rxId, mission_ref: 'numline_v1', scheduled_for: todayYmd()
    });
    expect(m2.status).toBe(201);
    const link2 = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(m2).id}/link`, {}));
    const st = dataOf<{ playStage?: { id: string; title_fa: string } }>(
      await anon.post(`/api/m/${link2.token}/start`, {}));
    expect(st.playStage?.id).toBe('s2');
    expect(st.playStage?.title_fa).toBe('جادهٔ شهر');
    const first = dataOf<{ item: { id: string }; progress: { done: number; total: number } }>(
      await anon.get(`/api/m/${link2.token}/next-item`));
    if (first.progress.total !== 18) console.error('DEBUG next:', JSON.stringify(first.progress));
    expect(first.item?.id).toBe('ta1'); // گرم‌کردن جادهٔ کوچک همیشه اول است
    expect(first.progress.total).toBe(18); // ۸ جادهٔ کوچک + ۶ جادهٔ شهر + ۴ پروب (پا+پب)
  });

  it('پیش‌نمایش درمانگر: آیتم authored بدون کلید + بازخورد دو-سطحی بی‌نوشت', async () => {
    const pv = dataOf<{ url: string; token: string }>(
      await mgr.post('/api/games/preview', { package_id: 'numline1', version: '1.0.0' }));
    expect(pv.url).toContain('/play/preview/');
    const html = await (await A.app.request(`/play/preview/${pv.token}`, {}, A.env as never)).text();
    expect(html).toContain('data-kind="numline"');
    const item0 = (await (await A.app.request(`/api/play/preview/${pv.token}/item/0`, {}, A.env as never)).json()) as { data: { item: { id: string; type: string } | null; progress: { total: number } } };
    expect(item0.data.item?.id).toBe('ta1'); // ترتیب authored — بدون دنبالهٔ g/n
    expect(item0.data.progress.total).toBe(34); // کل بانک در پیش‌نمایش
    const fb = (await (await A.app.request(`/api/play/preview/${pv.token}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ item_id: 'ta1', response: { chosen: 3 }, rt_ms: 800 })
    }, A.env as never)).json()) as { data: { message: string; correct: boolean } };
    expect(fb.data.correct).toBe(true); // لمس دقیقاً همان عدد
    expect(fb.data.message).toBe('دقیقاً همان‌جا! آفرین.');
  });

  it('گزارش درمانگر: خام/محاسبه‌شده جدا — خلاصه با میانگین خطا و مرحله', async () => {
    const rep = dataOf<{ sessions: { computed: { summary: { numline?: { mean_error_pct: number | null }; stage?: { stars: number } } } }[] }>(
      await mgr.get(`/api/games/children/${studentId}/report`));
    expect(rep.sessions.length).toBeGreaterThan(0);
    const sum = rep.sessions[0].computed.summary;
    // میانگین خطا روی همهٔ آزمون جلسه — تبی1 خطا ۵٪ و تبی2 خطا ۳۵٪ دارد → میانگین ۳٫۳۳
    expect(sum.numline?.mean_error_pct).toBeCloseTo(3.33, 1);
    expect(sum.stage?.stars).toBe(3);
  });
});
