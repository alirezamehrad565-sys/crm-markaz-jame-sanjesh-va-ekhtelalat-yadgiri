// زنجیرهٔ کامل «حملهٔ جاسوس‌ها» (۱.۲۵.۳۰) — ارسال→مأموریت→لینک→موج مرحله→بازخورد→پایان→ستاره
// قرارداد: کلید («کدام خانه جاسوس است») هرگز به کلاینت نمی‌رود · ارزیابی/بازخورد جدا · ستاره فقط تمرین
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';

interface LinkBody { jti: string; token: string; url: string; expiresAt: string }

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

/** موج authored — شبکهٔ cols×rows با جاسوس‌های معلوم (2) و هم‌نوع‌ها (other) */
function wave(
  id: string, phase: 'train' | 'probe',
  cols: number, rows: number, correct: number[], other: number, waveMs: number
) {
  const tiles = Array(cols * rows).fill(other);
  for (const i of correct) tiles[i] = 2;
  return {
    id, phase, type: 'scan',
    prompt: 'جاسوس‌ها ربات‌هایی با ۲ آنتن‌اند — همه را بگیر، هم‌نوع‌ها را دست نزن.',
    correct,
    stim: { cols, rows, wave_ms: waveMs, signature: 2, tiles }
  };
}

/** بستهٔ آزمونی اسکن — مرحلهٔ ۱ (موج ۶ خانه‌ای) + دو موج تمرین بزرگ‌تر + چهار پروب */
function scanBody() {
  return {
    package_id: 'swarm1',
    version: '1.0.0',
    title_fa: 'توجه و تمرکز — حملهٔ جاسوس‌ها',
    evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 },
    body: {
      package_id: 'swarm1',
      goals: ['scan_attention'],
      mastery: { threshold: 78, sessions: 2 },
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'scan_v1', game: 'scan', goal: 'scan_attention', metric: 'accuracy_scan',
        metrics: ['accuracy_scan', 'scan_fa_pct', 'scan_miss_pct', 'median_rt_scan'],
        title: 'حملهٔ جاسوس‌ها',
        items: [
          // کاوش شب اول — موج ۶ خانه‌ای (۸+... چهار تمرین)
          wave('wa1', 'train', 3, 2, [0, 3], 1, 20000),
          wave('wa2', 'train', 3, 2, [1, 4], 4, 20000),
          wave('wa3', 'train', 3, 2, [2, 5], 1, 20000),
          wave('wa4', 'train', 3, 2, [0, 5], 3, 20000),
          // گشت دوم — موج ۹ خانه‌ای (دو تمرین؛ بیرون سقف مرحلهٔ ۱)
          wave('wb1', 'train', 3, 3, [0, 4, 8], 1, 18000),
          wave('wb2', 'train', 3, 3, [2, 4], 3, 18000),
          // پروب — دو موج ۶ خانه‌ای (در سقف مرحلهٔ ۱) + دو موج ۱۲ خانه‌ای
          wave('wp1', 'probe', 3, 2, [0, 3], 4, 20000),
          wave('wp2', 'probe', 3, 2, [1, 4], 1, 20000),
          wave('wp3', 'probe', 4, 3, [0, 5, 10], 1, 16000),
          wave('wp4', 'probe', 4, 3, [3, 6, 9], 4, 16000)
        ]
      }],
      parent_copy: { before: 'این بازی تمرین دقت و تمرکز است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
    }
  };
}

function todayYmd(): string {
  const now = new Date();
  const tehran = new Date(now.getTime() + 3.5 * 3600 * 1000);
  return tehran.toISOString().slice(0, 10);
}

describe('حملهٔ جاسوس‌ها — زنجیرهٔ کامل کودک', () => {
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

    // سنجه‌های DB اسکن (دو سنجهٔ موتوری scan_fa/scan_miss از ENGINE_METRICS حاضرند)
    for (const metric of [
      { id: 'accuracy_scan', title_fa: 'دقت گرفتن جاسوس‌ها', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'accuracy' },
      { id: 'median_rt_scan', title_fa: 'میانهٔ زمان نخستین لمس موج', unit: 'ms', higher_is_better: false, source: 'auto', formula: 'median_rt' }
    ]) {
      const r = await mgr.post('/api/games/metrics', metric);
      expect([200, 201, 409]).toContain(r.status);
    }
    // هدف پیش از انتشار — گیت انتشار goal ثبت‌شده می‌خواهد
    const goal = await mgr.post('/api/games/goals', {
      id: 'scan_attention', title_fa: 'توجه و تمرکز — کشف جاسوس‌ها (آزمون)', package_id: 'swarm1', metric_id: 'accuracy_scan'
    });
    expect([200, 201, 409]).toContain(goal.status);
    await mgr.post('/api/games/packages', scanBody());
    await mgr.post('/api/games/packages/swarm1/1.0.0/publish', {});
    const rx = await mgr.post('/api/games/prescriptions', {
      child_id: studentId, package_id: 'swarm1', package_version: '1.0.0', goal_id: 'scan_attention'
    });
    expect(rx.status).toBe(201);
    rxId = dataOf<{ id: string }>(rx).id;
    const m = await mgr.post('/api/games/missions', {
      prescription_id: rxId, mission_ref: 'scan_v1', scheduled_for: todayYmd()
    });
    link = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(m).id}/link`, {}));
  });

  it('start: نوع‌بازی scan با مرحلهٔ «کاوش شب اول» و راهنمای قاعدهٔ موج — کلید هرگز نمی‌آید', async () => {
    const st = dataOf<Record<string, unknown>>(await anon.post(`/api/m/${link.token}/start`, {}));
    expect(st.playGame).toBe('scan');
    const stage = st.playStage as { id: string; title_fa: string };
    expect(stage.id).toBe('s1');
    expect(stage.title_fa).toBe('کاوش شب اول');
    const hint = st.playHint as { go: { stim: { signature: number } }; nogo: unknown; scan: { label: string; stim: { signature: number } } } | null;
    expect(hint?.scan?.stim.signature).toBe(2);
    expect(hint?.go?.stim.signature).toBe(2);
    expect(hint?.nogo ?? null).toBeNull(); // اسکن جفت گو/نوگو ندارد — قاعده از scan می‌آید
    const html = await (await A.app.request(`/m/${link.token}`, {}, A.env as never)).text();
    expect(html).toContain('data-kind="scan"');
  });

  it('nextItem: فقط موج‌های سقف مرحلهٔ ۱ (۶ خانه) — بدون correct؛ tiles عمومی است', async () => {
    const first = dataOf<{ item: Record<string, unknown>; progress: { done: number; total: number } }>(
      await anon.get(`/api/m/${link.token}/next-item`));
    expect(first.item?.id).toBe('wa1');
    expect(first.item?.type).toBe('scan');
    expect(first.progress.total).toBe(6); // چهار موج تمرین + دو پروب ۶ خانه‌ای
    const s = JSON.stringify(first);
    expect(s).not.toContain('correct'); // کلید پاسخ هرگز
    expect(s).not.toContain('"signature":3');
    const stim = first.item?.stim as { tiles: number[]; cols: number; wave_ms: number };
    expect(Array.isArray(stim.tiles)).toBe(true);
    expect(stim.cols).toBe(3);
    expect(stim.wave_ms).toBe(20000);
  });

  it('بازخورد موج: کامل = تحسین دقیق · جامانده = آرام + CSV جاسوس‌های جامانده', async () => {
    const tk = link.token;
    const ok = dataOf<{ message: string; correct: boolean; answer_display: string | null }>(
      await anon.post(`/api/m/${tk}/attempts`, { item_id: 'wa1', response: { hits: [0, 3], wave_used_ms: 4200, touch_count: 2 }, rt_ms: 700, idem_key: 'sc-ok-01' }));
    expect(ok.correct).toBe(true);
    expect(ok.message).toBe('همهٔ جاسوس‌ها را گرفتی! چشم‌هایت تیز بود.');
    expect(ok.answer_display).toBeNull();
    const miss = dataOf<{ message: string; correct: boolean; answer_display: string | null }>(
      await anon.post(`/api/m/${tk}/attempts`, { item_id: 'wa2', response: { hits: [1], wave_used_ms: 6000, touch_count: 1 }, rt_ms: 800, idem_key: 'sc-miss-1' }));
    expect(miss.correct).toBe(false); // جاسوس دوم (4) جامانده
    expect(miss.message).toBe('این یکی سخته؛ بیا با هم دوباره نگاهش کنیم.');
    expect(miss.answer_display).toBe('4'); // CSV — فقط اندیس جاسوس جامانده
    const fa = dataOf<{ correct: boolean }>(
      await anon.post(`/api/m/${tk}/attempts`, { item_id: 'wa3', response: { hits: [2, 5, 0], wave_used_ms: 5000, touch_count: 3 }, rt_ms: 600, idem_key: 'sc-fa-01' }));
    expect(fa.correct).toBe(false); // گرفتن هم‌نوع (خانهٔ ۰)
    const probe = dataOf<{ phase: string; message?: string; correct?: boolean }>(
      await anon.post(`/api/m/${tk}/attempts`, { item_id: 'wp1', response: { hits: [0, 3], wave_used_ms: 5000, touch_count: 2 }, rt_ms: 650, idem_key: 'sc-probe-1' }));
    expect(probe.phase).toBe('probe');
    expect(probe.message).toBeUndefined(); // پروب: هیچ بازخوردی (§۵)
    expect(probe.correct).toBeUndefined();
  });

  it('سد سروری آیتم پاسخ‌داده‌شده — idem_key تازه پاسخ دوم نمی‌سازد (G1)', async () => {
    const again = dataOf<{ correct: boolean; message: string }>(
      await anon.post(`/api/m/${link.token}/attempts`, { item_id: 'wa1', response: { hits: [1], wave_used_ms: 3000, touch_count: 1 }, rt_ms: 500, idem_key: 'sc-ok-02' }));
    expect(again.correct).toBe(true); // پاسخ اول ([0,3]) — نه [1]
    expect(again.message).toBe('همهٔ جاسوس‌ها را گرفتی! چشم‌هایت تیز بود.');
  });

  it('finish: سنجه‌های اسکن + ستارهٔ مرحله + دعوت «گشت دوم» — از خلاصهٔ محاسبه‌شده', async () => {
    const tk = link.token;
    // بقیهٔ موج‌های مرحلهٔ ۱ کامل: wa4 + wp2 (پروب) — همهٔ جاسوس‌ها
    await anon.post(`/api/m/${tk}/attempts`, { item_id: 'wa4', response: { hits: [0, 5], wave_used_ms: 5000, touch_count: 2 }, rt_ms: 700, idem_key: 'sc-fin-wa4' });
    await anon.post(`/api/m/${tk}/attempts`, { item_id: 'wp2', response: { hits: [1, 4], wave_used_ms: 5200, touch_count: 2 }, rt_ms: 680, idem_key: 'sc-fin-wp2' });
    const fin = dataOf<{ state: { state: string; playStageResult?: { title_fa: string; stars: number; next_title_fa: string | null; passed: boolean; stars_total: number } }; metrics: { metricId: string; value: number }[] }>(
      await anon.post(`/api/m/${tk}/finish`, { session_evidence: { pause_count: 0, pause_total_ms: 0 } }));
    expect(fin.state.state).toBe('child_done');
    // ۴ موج کامل از ۶ (wa2 جاافتاده و wa3 هم‌نوع عمداً نادرست) → دقت ۶۶٫۶۷ ≥ ۶۵ → گذار با ستارهٔ ۱
    const res = fin.state.playStageResult;
    expect(res?.title_fa).toBe('کاوش شب اول');
    expect(res?.stars).toBe(1);
    expect(res?.passed).toBe(true);
    expect(res?.next_title_fa).toBe('گشت دوم');
    // سنجه‌ها فقط از پروب (wp1 + wp2 کامل): دقت ۱۰۰ · fa و miss صفر (سنجه‌های موتوری)
    const byId = Object.fromEntries(fin.metrics.map((x) => [x.metricId, x.value]));
    expect(byId['accuracy_scan']).toBe(100);
    expect(byId['scan_fa_pct']).toBe(0);
    expect(byId['scan_miss_pct']).toBe(0);
  });

  it('جلسهٔ بعد: «گشت دوم» باز می‌شود — موج‌های ۹ خانه‌ای به استخر می‌آیند', async () => {
    const m2 = await mgr.post('/api/games/missions', {
      prescription_id: rxId, mission_ref: 'scan_v1', scheduled_for: todayYmd()
    });
    expect(m2.status).toBe(201);
    const link2 = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(m2).id}/link`, {}));
    const st = dataOf<{ playStage?: { id: string; title_fa: string } }>(
      await anon.post(`/api/m/${link2.token}/start`, {}));
    expect(st.playStage?.id).toBe('s2');
    expect(st.playStage?.title_fa).toBe('گشت دوم');
    const first = dataOf<{ item: { id: string }; progress: { done: number; total: number } }>(
      await anon.get(`/api/m/${link2.token}/next-item`));
    expect(first.item?.id).toBe('wa1'); // بانک authored از سر — سقف جدید موج‌های ≤۹ را می‌گیرد
    expect(first.progress.total).toBe(8); // چهار موج ۶ خانه‌ای + دو موج ۹ خانه‌ای + دو پروب ۶ خانه‌ای
  });

  it('پیش‌نمایش درمانگر: موج authored بدون کلید + بازخورد بی‌نوشت', async () => {
    const pv = dataOf<{ url: string; token: string }>(
      await mgr.post('/api/games/preview', { package_id: 'swarm1', version: '1.0.0' }));
    expect(pv.url).toContain('/play/preview/');
    const html = await (await A.app.request(`/play/preview/${pv.token}`, {}, A.env as never)).text();
    expect(html).toContain('data-kind="scan"');
    const item0 = (await (await A.app.request(`/api/play/preview/${pv.token}/item/0`, {}, A.env as never)).json()) as { data: { item: { id: string; type: string } | null; progress: { total: number } } };
    expect(item0.data.item?.id).toBe('wa1'); // ترتیب authored — اسکن دنبالهٔ g/n ندارد
    expect(item0.data.progress.total).toBe(10); // کل بانک در پیش‌نمایش
    const fb = (await (await A.app.request(`/api/play/preview/${pv.token}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ item_id: 'wa1', response: { hits: [0, 3] }, rt_ms: 800 })
    }, A.env as never)).json()) as { data: { message: string; correct: boolean } };
    expect(fb.data.correct).toBe(true);
    expect(fb.data.message).toBe('همهٔ جاسوس‌ها را گرفتی! چشم‌هایت تیز بود.');
  });

  it('گزارش درمانگر: خام/محاسبه‌شده جدا — خلاصهٔ اسکن با دقت موج‌ها و مرحله', async () => {
    const rep = dataOf<{ sessions: { computed: { summary: { scan?: { correct_waves_pct: number | null }; stage?: { stars: number } } } }[] }>(
      await mgr.get(`/api/games/children/${studentId}/report`));
    expect(rep.sessions.length).toBeGreaterThan(0);
    const sum = rep.sessions[0].computed.summary;
    expect(sum.scan?.correct_waves_pct).toBeCloseTo(66.67, 1); // ۴ موج کامل از ۶
    expect(sum.stage?.stars).toBe(1);
  });
});
