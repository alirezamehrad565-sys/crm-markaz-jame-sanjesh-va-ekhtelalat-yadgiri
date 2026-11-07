// e2e نظام مرحله‌ها و ستاره‌ها (۱.۲۵.۲۲) — مسیر پیشرفت فقط-تمرین، ستارهٔ پایان، گذار قفل‌گشایی
// قرارداد: ارزیابی هرگز مرحله نمی‌بیند (C1) · کلید خاموشی محترم است · گذار فقط از جلسهٔ معتبر
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';

interface LinkBody { jti: string; token: string; url: string; expiresAt: string }
interface StageMeta { id: string; index: number; total: number; title_fa: string; goal_fa: string; difficulty: number; best_stars: number }
interface StateBody { state: string; playStage?: StageMeta; playStageResult?: { id: string; index: number; title_fa: string; stars: number; passed: boolean; next_title_fa: string | null; stars_total: number } }

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function todayYmd(): string {
  const now = new Date();
  const tehran = new Date(now.getTime() + 3.5 * 3600 * 1000);
  return tehran.toISOString().slice(0, 10);
}

/** بستهٔ تمرین با دوز ۶ مأموریت در روز — برای زنجیرهٔ گذار مرحله در همان روز آزمون */
function trainingBody() {
  return {
    package_id: 'stage-train', version: '1.0.0', title_fa: 'بستهٔ مرحله‌دار تمرین', evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 15, max_missions_per_day: 6, min_weeks: 5 },
    body: {
      package_id: 'stage-train', goals: ['inhibition'],
      mastery: { threshold: 85, sessions: 2 },
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'gonogo_stage', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo',
        title: 'ستاره‌چین مرحله‌دار',
        probe: { items: 3, feedback: false, position: 'end' },
        mastery: { threshold: 85, sessions: 2 },
        items: [
          { id: 'tr-go1', phase: 'train', type: 'touch_report', stim: { shape: 'star', color: 'yellow' }, correct_touch: true },
          { id: 'tr-go2', phase: 'train', type: 'touch_report', stim: { shape: 'circle', color: 'yellow' }, correct_touch: true },
          { id: 'tr-nogo1', phase: 'train', type: 'touch_report', stim: { shape: 'square', color: 'blue' }, correct_touch: false },
          { id: 'pr-go1', phase: 'probe', type: 'touch_report', stim: { shape: 'star', color: 'yellow' }, correct_touch: true },
          { id: 'pr-go2', phase: 'probe', type: 'touch_report', stim: { shape: 'circle', color: 'yellow' }, correct_touch: true },
          { id: 'pr-nogo1', phase: 'probe', type: 'touch_report', stim: { shape: 'square', color: 'blue' }, correct_touch: false }
        ]
      }],
      parent_copy: { before: 'این بازی تمرین مهارت است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
    }
  };
}

function assessmentBody() {
  const t = trainingBody();
  const items = (t.body.missions[0].items as Array<Record<string, unknown>>).map((it) => ({ ...it, phase: 'probe' }));
  return {
    ...t,
    package_id: 'stage-assess', version: '1.0.0', title_fa: 'بستهٔ ارزیابی ثابت',
    body: {
      ...t.body,
      package_id: 'stage-assess',
      mode: 'assessment' as const,
      protocol: { id: 'gonogo-standard', version: '1.0.0' },
      missions: [{ ...t.body.missions[0], items }]
    }
  };
}

/** بازی کامل درست — همهٔ گوها لمس، همهٔ نوگوها بازداری؛ RT سالم */
async function playAllCorrect(anon: Api, token: string) {
  const nx = dataOf<{ item: { id: string } | null; progress: { done: number; total: number } }>(await anon.get(`/api/m/${token}/next-item`));
  const itemIds: string[] = [];
  for (let i = 0; i < nx.progress.total; i++) {
    const it = dataOf<{ item: { id: string } | null }>(await anon.get(`/api/m/${token}/next-item`)).item;
    if (!it) break;
    itemIds.push(it.id);
    await anon.post(`/api/m/${token}/attempts`, {
      item_id: it.id,
      response: { touched: it.id.includes('nogo') ? false : true, touch_count: 1, premature_count: 0, multiple_count: 0, out_of_surface_count: 0, presented_at: 0, frame_drops: 0, window_ms: 1500 },
      rt_ms: 420,
      idem_key: 'st-' + it.id + '-' + Math.random().toString(36).slice(2, 8)
    });
  }
  return itemIds;
}

describe('نظام مرحله‌ها و ستاره‌ها (۱.۲۵.۲۲) — مسیر پیشرفت فقط-تمرین', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let anon: Api;
  let trainLink: LinkBody;
  let assessLink: LinkBody;
  let rxId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    anon = new Api(A);
    const kid = (await createStudent(mgr, {
      birth_date: new Date(Date.now() - 8 * 365.2425 * 24 * 3600 * 1000).toISOString().slice(0, 10) // ۸ سال — باند ۷–۱۲
    })).id;

    await mgr.post('/api/games/packages', trainingBody());
    await mgr.post('/api/games/packages/stage-train/1.0.0/publish', {});
    await mgr.post('/api/games/goals', { id: 'inhibition_stage', title_fa: 'بازداری پاسخ (مرحله‌دار)', package_id: 'stage-train', metric_id: 'accuracy_gonogo' });
    rxId = dataOf<{ id: string }>(await mgr.post('/api/games/prescriptions', {
      child_id: kid, package_id: 'stage-train', package_version: '1.0.0', goal_id: 'inhibition_stage'
    })).id;
    const m1 = await mgr.post('/api/games/missions', { prescription_id: rxId, mission_ref: 'gonogo_stage', scheduled_for: todayYmd() });
    trainLink = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(m1).id}/link`, {}));

    await mgr.post('/api/games/packages', assessmentBody());
    await mgr.post('/api/games/packages/stage-assess/1.0.0/publish', {});
    await mgr.post('/api/games/goals', { id: 'inhibition_stage_a', title_fa: 'بازداری پاسخ (ارزیابی ثابت)', package_id: 'stage-assess', metric_id: 'accuracy_gonogo' });
    const rxA = dataOf<{ id: string }>(await mgr.post('/api/games/prescriptions', {
      child_id: kid, package_id: 'stage-assess', package_version: '1.0.0', goal_id: 'inhibition_stage_a'
    })).id;
    const mA = await mgr.post('/api/games/missions', { prescription_id: rxA, mission_ref: 'gonogo_stage', scheduled_for: todayYmd() });
    assessLink = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(mA).id}/link`, {}));
  });

  it('شروع تمرین: مرحلهٔ ۱ «گرم‌کردن» با فرادادهٔ کامل و ویژگی data-stage در صفحه', async () => {
    await anon.post(`/api/m/${trainLink.token}/start`, {});
    const st = dataOf<StateBody>(await anon.get(`/api/m/${trainLink.token}/state`));
    expect(st.playStage).toBeDefined();
    expect(st.playStage!.id).toBe('s1');
    expect(st.playStage!.index).toBe(1);
    expect(st.playStage!.total).toBe(5);
    expect(st.playStage!.title_fa).toBe('گرم‌کردن');
    expect(st.playStage!.best_stars).toBe(0);
    const raw = await A.app.request(`/m/${trainLink.token}`, {}, A.env as never);
    const html = await raw.text();
    expect(html).toContain('data-stage=');
    expect(html).toContain('گرم‌کردن');
    // هیچ آستانه‌ای به کلاینت نمی‌رود — فقط فرادادهٔ نمایش
    expect(html).not.toContain('nogo_pct');
    expect(html).not.toContain('go_pct');
  });

  it('پایان کامل و درست: سه ستاره، گذار، و کارت پایان ستاره‌دار', async () => {
    await playAllCorrect(anon, trainLink.token);
    const fin = dataOf<{ state: { state: string } }>(await anon.post(`/api/m/${trainLink.token}/finish`, {}));
    expect(fin.state.state).toBe('child_done');
    const st = dataOf<StateBody>(await anon.get(`/api/m/${trainLink.token}/state`));
    expect(st.playStageResult).toBeDefined();
    expect(st.playStageResult!.index).toBe(1);
    expect(st.playStageResult!.title_fa).toBe('گرم‌کردن');
    expect(st.playStageResult!.stars).toBe(3);
    expect(st.playStageResult!.passed).toBe(true);
    expect(st.playStageResult!.next_title_fa).toBe('تمرین');
    expect(st.playStageResult!.stars_total).toBe(3);
    const raw = await A.app.request(`/m/${trainLink.token}`, {}, A.env as never);
    const html = await raw.text();
    expect(html).toContain('<div class="stage-done">');
    expect(html).toContain('star--lit');
    expect(html).toContain('این مرحله را کامل کردی!');
    expect(html).toContain('مرحلهٔ بعدی: تمرین');
  });

  it('گذار: جلسهٔ بعدی مأموریت تازه روی مرحلهٔ ۲ می‌نشیند', async () => {
    const m2 = await mgr.post('/api/games/missions', { prescription_id: rxId, mission_ref: 'gonogo_stage', scheduled_for: todayYmd() });
    const link2 = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(m2).id}/link`, {}));
    await anon.post(`/api/m/${link2.token}/start`, {});
    const st = dataOf<StateBody>(await anon.get(`/api/m/${link2.token}/state`));
    expect(st.playStage!.id).toBe('s2');
    expect(st.playStage!.index).toBe(2);
    expect(st.playStage!.title_fa).toBe('تمرین');
    // بهترین ستارهٔ مرحلهٔ فعلی صفر است (نخستین رویارویی با s2)
    expect(st.playStage!.best_stars).toBe(0);
  });

  it('جلسهٔ ناقص گذار نمی‌سازد — ستاره فقط از جلسهٔ معتبر', async () => {
    const m3 = await mgr.post('/api/games/missions', { prescription_id: rxId, mission_ref: 'gonogo_stage', scheduled_for: todayYmd() });
    const link3 = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(m3).id}/link`, {}));
    await anon.post(`/api/m/${link3.token}/start`, {});
    // فقط یک آیتم — جلسه ناقص می‌ماند
    const it = dataOf<{ item: { id: string } | null }>(await anon.get(`/api/m/${link3.token}/next-item`)).item!;
    await anon.post(`/api/m/${link3.token}/attempts`, {
      item_id: it.id,
      response: { touched: it.id.includes('nogo') ? false : true, touch_count: 1, premature_count: 0, multiple_count: 0, out_of_surface_count: 0, presented_at: 0, frame_drops: 0, window_ms: 1500 },
      rt_ms: 400,
      idem_key: 'st-partial-' + Math.random().toString(36).slice(2, 8)
    });
    await anon.post(`/api/m/${link3.token}/finish`, {});
    const st = dataOf<StateBody>(await anon.get(`/api/m/${link3.token}/state`));
    // کارت پایان بدون ستاره — جلسهٔ partial نتیجهٔ مرحله ندارد
    expect(st.playStageResult).toBeUndefined();
    const raw = await A.app.request(`/m/${link3.token}`, {}, A.env as never);
    const html = await raw.text();
    expect(html).not.toContain('<div class="stage-done">');
    const m4 = await mgr.post('/api/games/missions', { prescription_id: rxId, mission_ref: 'gonogo_stage', scheduled_for: todayYmd() });
    const link4 = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(m4).id}/link`, {}));
    await anon.post(`/api/m/${link4.token}/start`, {});
    // گذار از s1 به s2 قبلاً رخ داده؛ جلسهٔ ناقص s2 را به s3 نمی‌برد
    const st2 = dataOf<StateBody>(await anon.get(`/api/m/${link4.token}/state`));
    expect(st2.playStage!.index).toBe(2);
  });

  it('ارزیابی هرگز مرحله نمی‌بیند — نه در state، نه در صفحه، نه در پایان (C1)', async () => {
    await anon.post(`/api/m/${assessLink.token}/start`, {});
    const st = dataOf<StateBody>(await anon.get(`/api/m/${assessLink.token}/state`));
    expect(st.playStage).toBeUndefined();
    const raw = await A.app.request(`/m/${assessLink.token}`, {}, A.env as never);
    const html = await raw.text();
    expect(html).not.toContain('data-stage');
    expect(html).not.toContain('گرم‌کردن');
    await playAllCorrect(anon, assessLink.token);
    await anon.post(`/api/m/${assessLink.token}/finish`, {});
    const st2 = dataOf<StateBody>(await anon.get(`/api/m/${assessLink.token}/state`));
    expect(st2.playStageResult).toBeUndefined();
    const raw2 = await A.app.request(`/m/${assessLink.token}`, {}, A.env as never);
    expect(await raw2.text()).not.toContain('<div class="stage-done">');
  });
});
