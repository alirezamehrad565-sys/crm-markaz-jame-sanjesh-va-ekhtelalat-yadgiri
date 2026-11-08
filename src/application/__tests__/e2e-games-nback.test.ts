// گیت سروری G4ب (۱.۲۵.۴۰) — آلبوم خرچنگ (ن‌پشت): جریان کامل کودک + گیت بی‌نشتی واریانت
//  ۱) جلسهٔ ن‌پشت با data-kind="nback" و راهنمای بی‌نشتی بالا می‌آید
//  ۲) نمای آیتم (next-item) هرگز match/correct/answer ندارد — کلید همسانی سرور می‌ماند
//  ۳) رکورد چرخش nback در sequence_json جلسه ثبت می‌شود و آفست روی rot_start می‌افتد
//  ۴) نمره‌دهی سروری دوگزینه‌ای — «همان است»/«فرق دارد» با stim.match authored
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';

interface LinkBody { jti: string; token: string; url: string; expiresAt: string }
interface ItemViewBody { item: { id: string; type: string; stim?: Record<string, unknown> } | null; progress: { done: number; total: number } }

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function todayYmd(): string {
  const tehran = new Date(Date.now() + 3.5 * 3600 * 1000);
  return tehran.toISOString().slice(0, 10);
}

/** بستهٔ ن‌پشت آزمونی — همان شکل بانک authored: تمرین + دو گروه n=1 با لنگر/rot_start */
function nbackBody() {
  const mk = (id: string, phase: 'train' | 'probe', fish: string, match: boolean, n = 1) => ({
    id, phase, type: 'nback',
    prompt: n === 2 ? 'دو قدم به عقب نگاه کن؛ عکسِ تازه از همان ماهیِ دو عکسِ قبل است؟' : 'خرچنگ عکاس عکس تازه گرفته؛ از همان ماهیِ عکسِ قبل است یا یکی دیگر؟',
    correct: match ? 0 : 1,
    options: [{ label: 'همان است' }, { label: 'فرق دارد' }],
    stim: {
      fish, n, match, window_ms: 4200,
      ...(match === false && ['teal', 'pink'].includes(fish) ? { anchor: true, ...(phase === 'probe' && ['a0', 'b0'].includes(id) ? { rot_start: true } : {}) } : {})
    }
  });
  return {
    package_id: 'nback-e2e', version: '1.0.0', title_fa: 'حافظهٔ کاری — آلبوم خرچنگ', evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 },
    body: {
      package_id: 'nback-e2e', goals: ['nback_working_memory'], mastery: { threshold: 78, sessions: 2 },
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'nback_e2e_m', game: 'nback', goal: 'nback_working_memory', metric: 'accuracy_nback',
        metrics: ['accuracy_nback', 'median_rt_nback', 'nback_match_pct', 'nback_nonmatch_pct', 'nback_false_alarm_pct', 'nback_miss_pct'],
        title: 'آلبوم خرچنگ', mastery: { threshold: 78, sessions: 2 },
        items: [
          mk('t1', 'train', 'yellow', false), mk('t2', 'train', 'yellow', true), mk('t3', 'train', 'red', false),
          mk('a0', 'probe', 'teal', false), mk('a1', 'probe', 'blue', false), mk('a2', 'probe', 'blue', true), mk('a3', 'probe', 'green', false),
          mk('b0', 'probe', 'pink', false), mk('b1', 'probe', 'orange', false), mk('b2', 'probe', 'orange', true), mk('b3', 'probe', 'green', false)
        ]
      }],
      parent_copy: { before: 'این بازی تمرین حافظهٔ کاری است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است؛ بی‌عجله.' }
    }
  };
}

describe('G4ب — جریان کودک ن‌پشت و گیت بی‌نشتی واریانت', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let anon: Api;
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
    const studentId = (await createStudent(mgr)).id;
    const pkg = await mgr.post('/api/games/packages', nbackBody());
    expect(pkg.status).toBe(201);
    // سنجه و هدف — پیش از انتشار (گیت انتشار هر دو را از رجیستری می‌خواهد)
    const metric = await mgr.post('/api/games/metrics', {
      id: 'accuracy_nback', title_fa: 'دقت هم‌سانی/تفکیک ن‌پشت', unit: 'percent',
      higher_is_better: true, source: 'auto', formula: 'accuracy'
    });
    expect(metric.status).toBe(201);
    const goal = await mgr.post('/api/games/goals', {
      id: 'nback_working_memory', title_fa: 'حافظهٔ کاری — آلبوم خرچنگ', package_id: 'nback-e2e', metric_id: 'accuracy_nback'
    });
    expect(goal.status).toBe(201);
    const pub = await mgr.post('/api/games/packages/nback-e2e/1.0.0/publish', {});
    expect(pub.status).toBe(200);
    const rx = await mgr.post('/api/games/prescriptions', {
      child_id: studentId, package_id: 'nback-e2e', package_version: '1.0.0', goal_id: 'nback_working_memory'
    });
    expect(rx.status).toBe(201);
    const m = await mgr.post('/api/games/missions', {
      prescription_id: dataOf<{ id: string }>(rx).id, mission_ref: 'nback_e2e_m', scheduled_for: todayYmd()
    });
    expect(m.status).toBe(201);
    link = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(m).id}/link`, {}));
  });

  it('child_active: پخش‌کننده با data-kind="nback" بالا می‌آید و راهنما match ندارد', async () => {
    await anon.post(`/api/m/${link.token}/start`, {});
    const html = await pageHtml(link.token);
    expect(html).toContain('id="play-root"');
    expect(html).toContain('data-kind="nback"');
    // گیت نشتی راهنما — پرچم match تمرین نباید در data-hint بیاید
    expect(html).not.toContain('"match"');
    expect(html).not.toContain('correct');
  });

  it('next-item: نمای آیتم بی‌کلید است — fish/n می‌آیند، match/correct هرگز', async () => {
    const first = dataOf<ItemViewBody>(await anon.get(`/api/m/${link.token}/next-item`));
    expect(first.item).not.toBeNull();
    expect(first.item!.type).toBe('nback');
    const raw = JSON.stringify(first.item);
    expect(raw).not.toContain('match');
    expect(raw).not.toContain('correct');
    expect(raw).not.toContain('answer');
    expect(first.item!.stim).toBeDefined();
    expect(typeof (first.item!.stim as Record<string, unknown>).fish).toBe('string');
    expect(typeof (first.item!.stim as Record<string, unknown>).window_ms).toBe('number');
  });

  it('رکورد چرخش nback در sequence_json جلسه — آفست روی rot_start', async () => {
    const db = A.d1 as unknown as { prepare: (sql: string) => { bind: (...a: unknown[]) => { first: () => Promise<Record<string, unknown> | null> } } };
    const row = await db.prepare(`SELECT sequence_json FROM game_sessions ORDER BY started_at DESC LIMIT 1`).bind().first();
    expect(row).not.toBeNull();
    const seq = JSON.parse(String(row!.sequence_json)) as { kind: string; offset: number; train_count: number };
    expect(seq.kind).toBe('nback');
    expect(seq.train_count).toBe(3);
    expect([0, 4]).toContain(seq.offset); // rot_startهای a0/b0 در پسوند پروب ۸تایی
  });

  it('نمره‌دهی سروری — «همان است» روی همسان درست؛ بازخورد تمرین آرام', async () => {
    // t2 (دومین آیتم تمرین) همسانِ t1 است — پاسخ درست «همان است» = گزینهٔ ۰
    const fb = dataOf<{ correct: boolean; message?: string }>(await anon.post(`/api/m/${link.token}/attempts`, {
      item_id: 't1', response: { option: 1 }, rt_ms: 1500, idem_key: 'nback-e2e-t1'
    }));
    expect(fb).toHaveProperty('correct');
    const fb2 = dataOf<{ correct: boolean }>(await anon.post(`/api/m/${link.token}/attempts`, {
      item_id: 't2', response: { option: 0 }, rt_ms: 1400, idem_key: 'nback-e2e-t2'
    }));
    expect(fb2.correct).toBe(true);
    const prog = dataOf<ItemViewBody>(await anon.get(`/api/m/${link.token}/next-item`));
    expect(prog.progress.done).toBe(2); // سد دوبارشماری — دو پاسخ ثبت شد
    expect(prog.progress.total).toBe(11);
  });
});
