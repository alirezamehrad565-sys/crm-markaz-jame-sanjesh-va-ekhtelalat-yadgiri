// گیت سروری G3 آموزش و جریان کودک (۱.۲۵.۳۷) — رفع U7/U8 ممیزی:
//  · U7 — ادامهٔ نرم جلسهٔ نیمه‌تمام: فرادادهٔ playResume فقط با حداقل یک پاسخ؛ شمار پاسخ/کل از سرور
//  · U8 — parent_post با محتوای واقعی توصیفی: شمار جلسهٔ هفته + پاسخ‌های امروز + جملهٔ فردا از parent_copy
// هیچ عدد هنجاری/درصدی و هیچ ادعای بالینی روبه‌والد نمی‌آید؛ کلید پاسخ در هیچ‌یک از این نماها نیست.
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';

interface LinkBody { jti: string; token: string; url: string; expiresAt: string }
interface StateBody {
  state: string;
  playResume?: { done: number; total: number } | null;
  parentCopyBefore?: string | null;
  parentPost?: { sessions_week: number; attempts_today: number; tomorrow_fa: string };
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

/** بستهٔ توجه آزمونی — پنج آیتم (۲ آموزش + ۳ پروب) با parent_copy کامل */
function g3PackageBody() {
  return {
    package_id: 'attention-g3',
    version: '1.0.0',
    title_fa: 'توجه G3',
    evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 15, max_missions_per_day: 3, min_weeks: 5 },
    body: {
      package_id: 'attention-g3',
      goals: ['inhibition'],
      mastery: { threshold: 85, sessions: 2 },
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'g3_m', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo',
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

describe('G3/U7 — ادامهٔ نرم جلسهٔ نیمه‌تمام (فرادادهٔ playResume)', () => {
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
    await mgr.post('/api/games/packages', g3PackageBody());
    await mgr.post('/api/games/packages/attention-g3/1.0.0/publish', {});
    const goal = await mgr.post('/api/games/goals', {
      id: 'inhibition_g3', title_fa: 'بازداری G3', package_id: 'attention-g3', metric_id: 'accuracy_gonogo'
    });
    expect(goal.status).toBe(201);
    const rx = await mgr.post('/api/games/prescriptions', {
      child_id: studentId, package_id: 'attention-g3', package_version: '1.0.0', goal_id: 'inhibition_g3'
    });
    expect(rx.status).toBe(201);
    const m = await mgr.post('/api/games/missions', {
      prescription_id: dataOf<{ id: string }>(rx).id, mission_ref: 'g3_m', scheduled_for: todayYmd()
    });
    expect(m.status).toBe(201);
    link = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(m).id}/link`, {}));
  });

  it('جلسهٔ تازه: data-resume خالی است — کارت خوش‌برگشتی هرگز برای شروع تازه نمی‌آید', async () => {
    const st = dataOf<StateBody>(await anon.get(`/api/m/${link.token}/state`));
    expect(st.state).toBe('parent_pre');
    expect(st.parentCopyBefore).toBe('این بازی تمرین مهارت است، نه درمان.');
    await anon.post(`/api/m/${link.token}/start`, {});
    const html = await pageHtml(link.token);
    expect(html).toContain('data-resume="null"');
  });

  it('جلسهٔ نیمه‌تمام (یک پاسخ ثبت‌شده): playResume با done/total واقعی از سرور می‌آید', async () => {
    await anon.post(`/api/m/${link.token}/attempts`, {
      item_id: 'tr-go', response: { touched: true }, rt_ms: 420, idem_key: 'g3-resume-1'
    });
    const st = dataOf<StateBody>(await anon.get(`/api/m/${link.token}/state`));
    expect(st.state).toBe('child_active');
    expect(st.playResume).toEqual({ done: 1, total: 5 });
    const html = await pageHtml(link.token);
    // esc صفحه وال‌های JSON را می‌پوشاند — فراداده با شمارهای واقعی سرور می‌آید
    expect(html).toContain('&quot;done&quot;:1,&quot;total&quot;:5');
    // هیچ کلیدی در فرادادهٔ ادامه نیست — فقط شمارها
    expect(html).not.toContain('correct_touch');
  });
});

describe('G3/U8 — پس‌گفت والد با محتوای واقعی (parent_post)', () => {
  let A: ReturnType<typeof createTestApp>;
  let anon: Api;
  let link: LinkBody;

  async function pageHtml(token: string): Promise<string> {
    const raw = await A.app.request(`/m/${token}`, {}, A.env as never);
    expect(raw.status).toBe(200);
    return raw.text();
  }

  beforeAll(async () => {
    A = createTestApp();
    const mgr = await asRole(A, 'manager');
    anon = new Api(A);
    const studentId = (await createStudent(mgr)).id;
    await mgr.post('/api/games/packages', g3PackageBody());
    await mgr.post('/api/games/packages/attention-g3/1.0.0/publish', {});
    const goal = await mgr.post('/api/games/goals', {
      id: 'inhibition_g3b', title_fa: 'بازداری G3b', package_id: 'attention-g3', metric_id: 'accuracy_gonogo'
    });
    expect(goal.status).toBe(201);
    const rx = await mgr.post('/api/games/prescriptions', {
      child_id: studentId, package_id: 'attention-g3', package_version: '1.0.0', goal_id: 'inhibition_g3b'
    });
    expect(rx.status).toBe(201);
    const m = await mgr.post('/api/games/missions', {
      prescription_id: dataOf<{ id: string }>(rx).id, mission_ref: 'g3_m', scheduled_for: todayYmd()
    });
    expect(m.status).toBe(201);
    link = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${dataOf<{ id: string }>(m).id}/link`, {}));
  });

  it('زنجیرهٔ کامل: پنج پاسخ → finish → parent-gate → parent_post با خلاصهٔ هفته/امروز + جملهٔ فردا', async () => {
    const tk = link.token;
    await anon.post(`/api/m/${tk}/start`, {});
    for (const [i, id] of ['tr-go', 'tr-nogo', 'pr-go', 'pr-nogo', 'pr-go2'].entries()) {
      const touched = !id.includes('nogo');
      const res = await anon.post(`/api/m/${tk}/attempts`, {
        item_id: id, response: { touched }, rt_ms: touched ? 400 + i : null, idem_key: 'g3-u8-' + id
      });
      expect(res.status).toBe(200);
    }
    const fin = await anon.post(`/api/m/${tk}/finish`, {});
    expect(fin.status).toBe(200);
    expect(dataOf<{ state: StateBody }>(fin).state.state).toBe('child_done');

    const gate = await anon.post(`/api/m/${tk}/parent-gate`, {}); // دکمهٔ «من مامان هستم» → گیت والد
    expect(gate.status).toBe(200);
    expect(dataOf<StateBody>(gate).state).toBe('parent_gate');
    const gateSolve = await anon.post(`/api/m/${tk}/parent-gate`, { solve: true }); // تأیید والد → پس‌گفت
    expect(gateSolve.status).toBe(200);
    const st = dataOf<StateBody>(await anon.get(`/api/m/${tk}/state`));
    expect(st.state).toBe('parent_post');
    expect(st.parentPost).toBeDefined();
    expect(st.parentPost!.sessions_week).toBe(1); // جلسهٔ آغازشدهٔ همین هفته
    expect(st.parentPost!.attempts_today).toBe(5);
    expect(st.parentPost!.tomorrow_fa).toBe('فردا ۱۰ دقیقه کافی است.'); // از parent_copy بسته

    const html = await pageHtml(tk);
    expect(html).toContain('جلسه بازی آغاز شده است');
    expect(html).toContain('پاسخ ثبت شد');
    expect(html).toContain('فردا ۱۰ دقیقه کافی است.');
    // جای‌گذار قدیمی رفته است؛ هیچ عدد هنجاری/درصدی و هیچ ادعای بالینی روبه‌والد نمی‌آید
    expect(html).not.toContain('بازخورد توصیفی این‌جا نمایش داده می‌شود');
    expect(html).not.toContain('درصد');
    expect(html).not.toContain('answer_display');
    expect(html).not.toContain('correct_touch');
  });

  it('دو تأیید پایانی والد → closed؛ parentPost در حالت بسته دیگر محتوایی نمی‌سازد', async () => {
    const tk = link.token;
    const conf1 = await anon.post(`/api/m/${tk}/confirm`, {}); // نخستین تأیید — پایبندی اول
    expect(conf1.status).toBe(200);
    expect(dataOf<StateBody>(conf1).state).toBe('parent_post');
    const conf2 = await anon.post(`/api/m/${tk}/confirm`, {}); // دومین تأیید — بستن امروز
    expect(conf2.status).toBe(200);
    const st = dataOf<StateBody>(await anon.get(`/api/m/${tk}/state`));
    expect(st.state).toBe('closed');
    expect(st.parentPost).toBeUndefined();
  });
});
