// پخش‌کنندهٔ کودک — صفحهٔ /m/:token در حالت کودک، راهنمای بی‌نشت و بازخورد گو/نوگو (M2 / ۱.۲۵.۰۸)
// قرارداد §۹ سند طراحی: پیش‌نمایش «این هدف است / این نه» فقط از آیتم‌های آموزشی؛ پروب هرگز لو نمی‌رود.
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';
import { APP_VERSION } from '../../core/version';

interface LinkBody { jti: string; token: string; url: string; expiresAt: string }
interface StateBody { state: string; missionRef: string; missionTitle: string; packageTitle: string; expiresAt: string; playGame?: string; playHint?: { go: { label: string }; nogo: { label: string } | null } | null }

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

/** بستهٔ توجه آزمونی: آموزش سبز/آبی + پروب با غیرهدف بنفش — برای آزمون نشت */
function gonogoM2Body() {
  return {
    package_id: 'attention2',
    version: '1.0.0',
    title_fa: 'توجه و بازداری پاسخ',
    evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 15, max_missions_per_day: 2, min_weeks: 5 },
    body: {
      package_id: 'attention2',
      goals: ['inhibition'],
      mastery: { threshold: 85, sessions: 2 },
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'gonogo_m2', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo',
        title: 'ستاره‌چین',
        probe: { items: 3, feedback: false, position: 'end' },
        mastery: { threshold: 85, sessions: 2 },
        items: [
          { id: 'tr-go', phase: 'train', type: 'touch_report', stim: { shape: 'star', color: 'سبز' }, correct_touch: true },
          { id: 'tr-nogo', phase: 'train', type: 'touch_report', stim: { shape: 'square', color: 'آبی' }, correct_touch: false },
          { id: 'pr-go', phase: 'probe', type: 'touch_report', stim: { shape: 'star', color: 'سبز' }, correct_touch: true },
          { id: 'pr-nogo', phase: 'probe', type: 'touch_report', stim: { shape: 'star', color: 'بنفش' }, correct_touch: false },
          { id: 'pr-go2', phase: 'probe', type: 'touch_report', stim: { shape: 'circle', color: 'سبز' }, correct_touch: true }
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

describe('پخش‌کنندهٔ کودک (M2) — صفحه، راهنمای بی‌نشت و بازخورد گو/نوگو', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let anon: Api;
  let studentId: string;
  let link: LinkBody;

  async function pageHtml(token: string): Promise<string> {
    const raw = await A.app.request(`/m/${token}`, {}, A.env as never);
    expect(raw.status).toBe(200);
    return raw.text();
  }

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    anon = new Api(A);
    studentId = (await createStudent(mgr)).id;

    await mgr.post('/api/games/packages', gonogoM2Body());
    await mgr.post('/api/games/packages/attention2/1.0.0/publish', {});
    // هدف آزمونی همین بسته — هدف seed به بستهٔ دیگری تعلق دارد
    const goal = await mgr.post('/api/games/goals', {
      id: 'inhibition_m2', title_fa: 'بازداری پاسخ (آزمون M2)', package_id: 'attention2', metric_id: 'accuracy_gonogo'
    });
    expect(goal.status).toBe(201);
    const rx = await mgr.post('/api/games/prescriptions', {
      child_id: studentId, package_id: 'attention2', package_version: '1.0.0', goal_id: 'inhibition_m2'
    });
    expect(rx.status).toBe(201);
    const rxId = dataOf<{ id: string }>(rx).id;
    const m = await mgr.post('/api/games/missions', { prescription_id: rxId, mission_ref: 'gonogo_m2', scheduled_for: todayYmd() });
    link = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(m).id}/link`, {}));
  });

  it('صفحهٔ parent_pre دارایی بازی ندارد — پخش‌کننده فقط در حالت کودک سرو می‌شود', async () => {
    const html = await pageHtml(link.token);
    expect(html).toContain('آمادهٔ شروع هستیم');
    expect(html).not.toContain('play-root');
    expect(html).not.toContain('/assets/play/');
  });

  it('child_active: پخش‌کننده با نوع‌بازی و راهنمای آموزشی بار می‌شود', async () => {
    await anon.post(`/api/m/${link.token}/start`, {});
    const html = await pageHtml(link.token);
    expect(html).toContain('id="play-root"');
    expect(html).toContain('data-kind="gonogo"');
    expect(html).toContain(`/assets/play/play.js?v=${APP_VERSION}`);
    expect(html).toContain(`/assets/play/play.css?v=${APP_VERSION}`);
    // راهنما فقط از آموزش: «ستاره سبز» و «مربع آبی»
    expect(html).toContain('ستاره سبز');
    expect(html).toContain('مربع آبی');
    const st = dataOf<StateBody>(await anon.get(`/api/m/${link.token}/state`));
    expect(st.playGame).toBe('gonogo');
    expect(st.playHint?.go.label).toBe('ستاره سبز');
    expect(st.playHint?.nogo?.label).toBe('مربع آبی');
  });

  it('شناسهٔ غیرهدف پروب به هیچ‌جای صفحه و state درز نمی‌کند', async () => {
    const html = await pageHtml(link.token);
    const st = await anon.get(`/api/m/${link.token}/state`);
    expect(html).not.toContain('بنفش');
    expect(JSON.stringify(st.body)).not.toContain('بنفش');
  });

  it('بازخورد گو/نوگو: لمس درست «گرفتی!»، بازداری درست «عالی، صبر کردی!»، اشتباه بدون سرزنش', async () => {
    const tk = link.token;
    const go = dataOf<{ message: string }>(await anon.post(`/api/m/${tk}/attempts`, { item_id: 'tr-go', response: { touched: true }, rt_ms: 420, idem_key: 'm2-tr-go' }));
    expect(go.message).toBe('گرفتی!');

    const withhold = dataOf<{ message: string; correct: boolean }>(await anon.post(`/api/m/${tk}/attempts`, { item_id: 'tr-nogo', response: { touched: false }, rt_ms: null, idem_key: 'm2-tr-nogo' }));
    expect(withhold.correct).toBe(true);
    expect(withhold.message).toBe('عالی، صبر کردی!');

    const touch = dataOf<{ message: string; correct: boolean }>(await anon.post(`/api/m/${tk}/attempts`, { item_id: 'tr-nogo', response: { touched: true }, rt_ms: 300, idem_key: 'm2-tr-nogo-x' }));
    expect(touch.correct).toBe(false);
    expect(touch.message).toBe('این یکی سخته؛ بیا با هم دوباره نگاهش کنیم.');
  });

  it('پروب همچنان هیچ بازخوردی ندارد و پایان جلسه صفحهٔ کودک را عوض می‌کند', async () => {
    const tk = link.token;
    const p1 = dataOf<Record<string, unknown>>(await anon.post(`/api/m/${tk}/attempts`, { item_id: 'pr-go', response: { touched: true }, rt_ms: 350, idem_key: 'm2-probe-1' }));
    expect(p1).not.toHaveProperty('message');

    await anon.post(`/api/m/${tk}/attempts`, { item_id: 'pr-nogo', response: { touched: false }, rt_ms: null, idem_key: 'm2-probe-2' });
    await anon.post(`/api/m/${tk}/attempts`, { item_id: 'pr-go2', response: { touched: true }, rt_ms: 400, idem_key: 'm2-probe-3' });

    const fin = await anon.post(`/api/m/${tk}/finish`, {});
    expect(fin.status).toBe(200);
    expect(dataOf<{ state: StateBody }>(fin).state.state).toBe('child_done');

    const html = await pageHtml(tk);
    expect(html).toContain('گوشی را به مامان بده');
    expect(html).not.toContain('play-root');
  });
});
