// زنجیرهٔ کامل «آلبوم خرچنگ» (ن‌پشت / nback) — بستهٔ آزمونی → انتشار → صفحهٔ کودک → نشتی‌سنجی → چرخش لنگر-مقید (۱.۲۵.۴۰)
// الگو: e2e-games-play.test.ts — سرور-محور؛ کلید همسانی (match) هرگز از هیچ لایه‌ای بیرون نمی‌زند.
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';

interface LinkBody { jti: string; token: string; url: string; expiresAt: string }
interface StateBody { state: string; playGame?: string; playHint?: { go: { label: string }; nback?: { label: string } | null } | null }
interface ItemBody { id: string; phase: string; type: string; prompt?: string; options?: { label: string }[]; stim?: Record<string, unknown> }

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function todayYmd(): string {
  const now = new Date();
  const tehran = new Date(now.getTime() + 3.5 * 3600 * 1000);
  return tehran.toISOString().slice(0, 10);
}

/**
 * بستهٔ آزمونی ن‌پشت — همان شکل بانک عملیاتی، کوچک‌تر:
 * تمرین ۳ (n=1، سر تمرین ثابت) + دو گروه ۴تایی n=1 با rot_start روی سر گروه.
 * حکم همسانی هر آیتم نسبت به یک قدم عقب‌تر در ترتیب authored؛ سرِ هر گروه پنجرهٔ
 * n قدم کامل ندارد = ناهمسان؛ چرخشِ سالم باید حکم‌ها را در هر دو سرِ چرخش نگه دارد
 * (آفست ۰ = ترتیب authored، آفست ۴ = سر گروه دوم — گیت طلایی بانک عملیاتی همین را می‌بندد).
 */
function nbackE2eBody() {
  const item = (id: string, phase: 'train' | 'probe', fish: string, match: boolean, win: number, flags: Record<string, unknown> = {}) => ({
    id, phase, type: 'nback',
    prompt: 'اگر ماهیِ امروزی همانِ یک قدم عقب‌تر بود، «همان است» را لمس کن.',
    options: [{ label: 'همان است' }, { label: 'فرق دارد' }],
    correct: match ? 0 : 1,
    stim: { fish, n: 1, match, window_ms: win, ...flags }
  });
  return {
    package_id: 'nback-e2e',
    version: '1.0.0',
    title_fa: 'حافظهٔ کاری (آزمون ن‌پشت)',
    evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 },
    body: {
      package_id: 'nback-e2e',
      goals: ['nback_working_memory_e2e'],
      mastery: { threshold: 65, sessions: 1 },
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'nback_e2e_m1', game: 'nback', goal: 'nback_working_memory_e2e', metric: 'accuracy_nback',
        metrics: ['accuracy_nback', 'median_rt_nback'],
        title: 'آلبوم خرچنگ',
        mastery: { threshold: 65, sessions: 1 },
        items: [
          // پیشوند تمرین — هرگز نمی‌چرخد: بی‌مرجع / همسان / ناهمسان
          item('nbm-t1', 'train', 'red', false, 4200),
          item('nbm-t2', 'train', 'red', true, 4200),   // همسان با nbm-t1
          item('nbm-t3', 'train', 'blue', false, 4200), // ناهمسان با nbm-t2
          // گروه اول — سر زنجیره با rot_start؛ ماهی‌ها در هر گروه دو همسان دارند
          item('nbm-e1', 'probe', 'green', false, 4200, { rot_start: true }),
          item('nbm-e2', 'probe', 'green', true, 4200),
          item('nbm-e3', 'probe', 'yellow', false, 4200),
          item('nbm-e4', 'probe', 'orange', false, 4200),
          // گروه دوم — سر زنجیرهٔ دوم؛ ناهمسانیِ سر نسبت به گروه اول و پیش‌موج تمرین بسته است
          item('nbm-f1', 'probe', 'purple', false, 3600, { rot_start: true }),
          item('nbm-f2', 'probe', 'purple', true, 3600),
          item('nbm-f3', 'probe', 'blue', false, 3600),
          item('nbm-f4', 'probe', 'yellow', false, 3600)
        ]
      }],
      parent_copy: { before: 'این بازی تمرین نگه‌داشتن و یادآوری است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
    }
  };
}

describe('آلبوم خرچنگ (ن‌پشت) — زنجیرهٔ کامل کودک (۱.۲۵.۴۰)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let anon: Api;
  let studentId: string;
  let link: LinkBody;
  let missionId: string;

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

    // سنجه‌ها و هدف پیش از انتشار — گیت انتشار واژه‌نامهٔ سنجه/هدف را می‌خواند
    await mgr.post('/api/games/metrics', { id: 'accuracy_nback', title_fa: 'دقت حکم همسانی ن‌پشت', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'accuracy' });
    await mgr.post('/api/games/metrics', { id: 'median_rt_nback', title_fa: 'میانهٔ زمان حکم همسانی', unit: 'ms', higher_is_better: false, source: 'auto', formula: 'median_rt' });
    await mgr.post('/api/games/packages', nbackE2eBody());
    await mgr.post('/api/games/goals', {
      id: 'nback_working_memory_e2e', title_fa: 'حافظهٔ کاری (آزمون ن‌پشت)', package_id: 'nback-e2e', metric_id: 'accuracy_nback'
    });
    const pub = await mgr.post('/api/games/packages/nback-e2e/1.0.0/publish', {});
    expect(pub.status).toBe(200);

    const rx = await mgr.post('/api/games/prescriptions', {
      child_id: studentId, package_id: 'nback-e2e', package_version: '1.0.0', goal_id: 'nback_working_memory_e2e'
    });
    expect(rx.status).toBe(201);
    const rxId = dataOf<{ id: string }>(rx).id;
    const m = await mgr.post('/api/games/missions', { prescription_id: rxId, mission_ref: 'nback_e2e_m1', scheduled_for: todayYmd() });
    expect(m.status).toBe(201);
    missionId = dataOf<{ id: string }>(m).id;
    link = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${missionId}/link`, {}));
    await anon.post(`/api/m/${link.token}/start`, {});
  });

  it('صفحهٔ کودک با data-kind="nback" سرو می‌شود و هیچ کلیدی در HTML نیست', async () => {
    const html = await pageHtml(link.token);
    expect(html).toContain('id="play-root"');
    expect(html).toContain('data-kind="nback"');
    // سد نشتی — کلید همسانی و هر کلید پاسخی در HTML نیست (راهنما از stripAnswerKeys می‌گذرد)
    expect(html).not.toContain('"match"');
    expect(html).not.toContain('correct');
    const st = dataOf<StateBody>(await anon.get(`/api/m/${link.token}/state`));
    expect(st.playGame).toBe('nback');
    // راهنما فقط از آیتم تمرین — قاعدهٔ بازی روبه‌کودک، بدون حکم همسانی
    expect(st.playHint?.nback?.label).toContain('همان است');
  });

  it('next-item آیتم ن‌پشت با stim.fish/window_ms می‌دهد — بدون match/correct/answer', async () => {
    const nx = dataOf<{ item: ItemBody | null }>(await anon.get(`/api/m/${link.token}/next-item`));
    expect(nx.item).toBeTruthy();
    const raw = JSON.stringify(nx.item);
    expect(raw).not.toContain('match');
    expect(raw).not.toContain('correct');
    expect(raw).not.toContain('answer');
    expect(nx.item!.type).toBe('nback');
    expect(nx.item!.phase).toBe('train');
    expect(typeof nx.item!.stim!.fish).toBe('string');
    expect(typeof nx.item!.stim!.window_ms).toBe('number');
    expect(nx.item!.stim!.window_ms).toBe(4200);
    expect(nx.item!.options?.map((o) => o.label)).toEqual(['همان است', 'فرق دارد']);
  });

  it('رکورد چرخش لنگر-مقید در جلسه می‌نشیند — آفست روی سرهای rot_start', () => {
    const sess = A.sql.prepare(`SELECT sequence_json FROM game_sessions ORDER BY created_at DESC LIMIT 1`).get() as { sequence_json: string };
    const rec = JSON.parse(sess.sequence_json) as { kind: string; v: number; train_count: number; probe_count: number; offset: number };
    expect(rec.kind).toBe('nback');
    expect(rec.v).toBe(1);
    expect(rec.train_count).toBe(3); // پیشوند تمرین ثابت
    expect(rec.probe_count).toBe(8); // دو گروه ۴تایی
    // آفست فقط از میان جایگاه‌های rot_start پسوند پروب برمی‌آید (۰ و ۴)
    expect([0, 4]).toContain(rec.offset);
  });

  it('دو پاسخ تمرین هم‌گام با کلید سرور ثبت می‌شود و پیشرفت done=2 می‌رسد', async () => {
    const tk = link.token;
    // حکم آیتم‌های تمرین از بانک خود آزمون: nbm-t1 ناهمسان (۱) و nbm-t2 همسان (۰) — کلید سرور همین را می‌داند
    const first = dataOf<{ item: ItemBody | null }>(await anon.get(`/api/m/${tk}/next-item`));
    expect(first.item!.id).toBe('nbm-t1');
    const fb1 = dataOf<{ correct: boolean; message?: string }>(await anon.post(`/api/m/${tk}/attempts`, {
      item_id: first.item!.id, response: { option: 1, timed_out: false }, rt_ms: 600, idem_key: 'nback-e2e-t1'
    }));
    expect(fb1.correct).toBe(true); // «فرق دارد» برای بی‌مرجع — درست

    const second = dataOf<{ item: ItemBody | null }>(await anon.get(`/api/m/${tk}/next-item`));
    expect(second.item!.id).toBe('nbm-t2');
    const fb2 = dataOf<{ correct: boolean; message?: string }>(await anon.post(`/api/m/${tk}/attempts`, {
      item_id: second.item!.id, response: { option: 0, timed_out: false }, rt_ms: 700, idem_key: 'nback-e2e-t2'
    }));
    expect(fb2.correct).toBe(true); // «همان است» برای همسان — درست

    const third = dataOf<{ item: ItemBody | null; progress: { done: number; total: number } }>(await anon.get(`/api/m/${tk}/next-item`));
    expect(third.progress.done).toBe(2);
    expect(third.item!.id).toBe('nbm-t3'); // جریان تمرین به ترتیب پیش می‌رود
  });
});
