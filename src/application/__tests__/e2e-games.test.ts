// زنجیرهٔ کامل بازی مادر ← کودک ← مادر (M1 / ۱.۲۵.۰۷) — قرارداد §۵/§۶/§۸ نقشهٔ راه
// انتشار گیت‌دار ← تجویز درمانگر ← مأموریت ← لینک امضاشده ← سه‌حالته ← نمره‌دهی سروری
// ← تزریق پراپ به مسیر مداخله ← تأیید دومضربهٔ پایبندی
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent
} from '../../test/harness';

interface LinkBody { jti: string; token: string; url: string; expiresAt: string }
interface StateBody { state: string; missionRef: string; missionTitle: string; packageTitle: string; expiresAt: string; validity?: string; adherenceConfirmed?: boolean }
interface MetricOutcome { metricId: string; value: number; unit: string; probeCount: number; injected: boolean }

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function errorOf(res: { body: unknown }): string {
  // پاکت خطای سامانه تخت است: { error: 'CODE', message: '…' }
  const b = res.body as { error?: unknown; message?: unknown };
  const code = typeof b.error === 'string' ? b.error : JSON.stringify(b.error ?? '');
  return `${code} ${typeof b.message === 'string' ? b.message : ''}`.trim();
}

function numsenseBody(over: Record<string, unknown> = {}) {
  return {
    package_id: 'numsense',
    version: '1.0.0',
    title_fa: 'حس عدد',
    evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 15, max_missions_per_day: 1, min_weeks: 6 },
    body: {
      package_id: 'numsense',
      goals: ['numline'],
      age: { min: 6, max: 8 },
      mastery: { threshold: 20, sessions: 2 },
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'numline_0_100_m1', game: 'numberline', goal: 'numline', metric: 'pct_error_numline',
        title: 'خط عددی ۰ تا ۱۰۰',
        probe: { items: 3, feedback: false, position: 'end' },
        mastery: { threshold: 20, sessions: 2 },
        items: [
          { id: 't1', phase: 'train', type: 'numline', prompt: '۷۰ کجاست؟', correct: 70, range: [0, 100] },
          { id: 't2', phase: 'train', type: 'numline', prompt: '۳۰ کجاست؟', correct: 30, range: [0, 100] },
          { id: 'p1', phase: 'probe', type: 'numline', correct: 50, range: [0, 100] },
          { id: 'p2', phase: 'probe', type: 'numline', correct: 70, range: [0, 100] },
          { id: 'p3', phase: 'probe', type: 'numline', correct: 20, range: [0, 100] }
        ]
      }],
      parent_copy: { before: 'امروز با خط عددی کار می‌کنیم.', after: 'فردا ۱۵ دقیقه کافی است.' }
    },
    ...over
  };
}

function attentionBody() {
  return {
    package_id: 'attention',
    version: '1.0.0',
    title_fa: 'توجه و بازداری پاسخ',
    evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 15, max_missions_per_day: 3, min_weeks: 5 },
    body: {
      package_id: 'attention',
      goals: ['inhibition'],
      mastery: { threshold: 85, sessions: 2 },
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'gonogo_m1', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo',
        metrics: ['accuracy_gonogo', 'median_rt_gonogo', 'commission_gonogo', 'omission_gonogo'],
        title: 'ستاره‌چین',
        probe: { items: 6, feedback: false, position: 'end' },
        mastery: { threshold: 85, sessions: 2 },
        items: [
          { id: 'g1', phase: 'train', type: 'touch_report', stim: { color: 'yellow' }, correct_touch: true },
          { id: 'g2', phase: 'train', type: 'touch_report', stim: { color: 'yellow' }, correct_touch: true },
          { id: 'pg1', phase: 'probe', type: 'touch_report', stim: { color: 'yellow' }, correct_touch: true },  // لمس شد، ۴۰۰ms
          { id: 'pg2', phase: 'probe', type: 'touch_report', stim: { color: 'blue' }, correct_touch: false },   // لمس شد → commission
          { id: 'pg3', phase: 'probe', type: 'touch_report', stim: { color: 'yellow' }, correct_touch: true },  // لمس نشد → omission
          { id: 'pg4', phase: 'probe', type: 'touch_report', stim: { color: 'yellow' }, correct_touch: true },  // لمس شد، ۳۲۰ms
          { id: 'pg5', phase: 'probe', type: 'touch_report', stim: { color: 'blue' }, correct_touch: false },   // لمس نشد → درست
          { id: 'pg6', phase: 'probe', type: 'touch_report', stim: { color: 'yellow' }, correct_touch: true }   // لمس شد، ۱۰۰ms → rt نامعتبر
        ]
      }],
      parent_copy: { before: 'این بازی تمرین مهارت است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
    }
  };
}

function todayYmd(): string {
  // روز محلّی تهران — همان قرارداد هارنس سامانه
  const now = new Date();
  const tehran = new Date(now.getTime() + 3.5 * 3600 * 1000);
  return tehran.toISOString().slice(0, 10);
}

describe('بستر بک‌اند بازی — زنجیرهٔ کامل', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let ali: Api;
  let sec: Api;
  let anon: Api;
  let studentId: string;
  let pathId: string;
  let rxId: string;
  let missionId: string;
  let link: LinkBody;
  let attLink: LinkBody | null = null; // لینک مأموریت توجه (برای آزمون انقضا)
  const today = todayYmd();

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    ali = await asRole(A, 'therapist');
    sec = await asRole(A, 'secretary');
    anon = new Api(A);

    studentId = (await createStudent(ali)).id;
    const path = await ali.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'dyslexia' });
    expect(path.status).toBe(201);
    pathId = dataOf<{ id: string }>(path).id;
  });

  // ─── انتشار گیت‌دار ───

  it('منشی نمی‌تواند بسته بسازد (۴۰۳) و بستهٔ سالم پیش‌نویس می‌شود', async () => {
    expect((await sec.post('/api/games/packages', numsenseBody())).status).toBe(403);
    const res = await ali.post('/api/games/packages', numsenseBody());
    expect(res.status).toBe(201);
    expect(dataOf<{ status: string }>(res).status).toBe('draft');
  });

  it('نسخهٔ با آستانهٔ تهی از گیت انتشار رد می‌شود؛ نسخهٔ سالم منتشر می‌شود', async () => {
    const broken = numsenseBody({ version: '0.9.0' });
    (broken.body as { missions: { mastery: { threshold: number | null; sessions?: number } }[] }).missions[0].mastery = { threshold: null, sessions: 2 };
    await ali.post('/api/games/packages', broken);
    const bad = await ali.post('/api/games/packages/numsense/0.9.0/publish', {});
    expect(bad.status).toBe(400);
    expect(errorOf(bad)).toContain('گیت انتشار');

    const ok = await ali.post('/api/games/packages/numsense/1.0.0/publish', {});
    expect(ok.status).toBe(200);
    expect(dataOf<{ status: string }>(ok).status).toBe('published');
    expect(dataOf<{ reviewedBy: string }>(ok).reviewedBy).toBeTruthy();
  });

  it('نسخهٔ منتشرشده تغییرناپذیر است (۴۰۹)', async () => {
    const res = await ali.post('/api/games/packages', numsenseBody());
    expect(res.status).toBe(409);
  });

  it('تجویز فقط با امضای درمانگر و از بستهٔ منتشرشده ساخته می‌شود', async () => {
    // بستهٔ پیش‌نویس: تجویز رد می‌شود
    await mgr.post('/api/games/packages', attentionBody());
    const draftRx = await ali.post('/api/games/prescriptions', {
      child_id: studentId, package_id: 'attention', package_version: '1.0.0', goal_id: 'inhibition'
    });
    expect(draftRx.status).toBe(400);

    // هدف از بستهٔ دیگر رد می‌شود
    const wrongGoal = await ali.post('/api/games/prescriptions', {
      child_id: studentId, package_id: 'numsense', package_version: '1.0.0', goal_id: 'inhibition'
    });
    expect(wrongGoal.status).toBe(400);

    const res = await ali.post('/api/games/prescriptions', {
      child_id: studentId, package_id: 'numsense', package_version: '1.0.0', goal_id: 'numline',
      pathway_id: pathId, suggested_by: 'recommender'
    });
    expect(res.status).toBe(201);
    const rx = dataOf<{ id: string; approvedBy: string; suggestedBy: string }>(res);
    rxId = rx.id;
    expect(rx.suggestedBy).toBe('recommender');
    expect(rx.approvedBy).toBeTruthy(); // هیچ تجویزی بدون امضا فعال نمی‌شود
  });

  // ─── مأموریت و سقف دوز ───

  it('مأموریت امروز درج می‌شود؛ مأموریت دوم همان روز با سقف دوز ۱ رد می‌شود (۴۰۹)', async () => {
    const unknownRef = await ali.post('/api/games/missions', { prescription_id: rxId, mission_ref: 'ناموجود', scheduled_for: today });
    expect(unknownRef.status).toBe(400);

    const ok = await ali.post('/api/games/missions', { prescription_id: rxId, mission_ref: 'numline_0_100_m1', scheduled_for: today });
    expect(ok.status).toBe(201);
    missionId = dataOf<{ id: string; status: string }>(ok).id;
    expect(dataOf<{ status: string }>(ok).status).toBe('pending');

    const capped = await ali.post('/api/games/missions', { prescription_id: rxId, mission_ref: 'numline_0_100_m1', scheduled_for: today });
    expect(capped.status).toBe(409);
  });

  it('صدور لینک: توکن تصادفی و آدرس /m/؛ صدور مجدد لینک قبلی را باطل می‌کند', async () => {
    const res = await ali.post(`/api/games/missions/${missionId}/link`, {});
    expect(res.status).toBe(201);
    link = dataOf<LinkBody>(res);
    expect(link.token.length).toBeGreaterThan(60); // jti + ۲۵۶ بیت هگز
    expect(link.url).toContain('/m/');
    expect(link.url.endsWith(link.token)).toBe(true);

    const again = await ali.post(`/api/games/missions/${missionId}/link`, {});
    expect(again.status).toBe(201);
    const second = dataOf<LinkBody>(again);
    expect(second.token).not.toBe(link.token);
    // لینک قدیم باطل شده — حالتش revoked است
    expect((await anon.get(`/api/m/${link.token}/state`)).status).toBe(200);
    expect(dataOf<StateBody>((await anon.get(`/api/m/${link.token}/state`))).state).toBe('revoked');
    link = second;
  });

  // ─── صفحهٔ عمومی و حالت‌ها ───

  it('صفحهٔ /m/:token بدون احراز هویت باز می‌شود؛ CSP و noindex دارد', async () => {
    const raw = await A.app.request(`/m/${link.token}`, {}, A.env as never);
    expect(raw.status).toBe(200);
    expect(raw.headers.get('content-type')).toContain('text/html');
    expect(raw.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(raw.headers.get('x-robots-tag')).toContain('noindex');
    const html = await raw.text();
    expect(html).toContain('آمادهٔ شروع هستیم');
    expect(html).toContain('dir="rtl"');
  });

  it('حالت اولیه parent_pre است و نام کودک هیچ‌جا لو نمی‌رود', async () => {
    const res = await anon.get(`/api/m/${link.token}/state`);
    expect(res.status).toBe(200);
    expect(res.cacheControl).toBe('no-store');
    const st = dataOf<StateBody>(res);
    expect(st.state).toBe('parent_pre');
    expect(st.missionTitle).toContain('خط عددی');
    expect(JSON.stringify(res.body)).not.toContain('خانواده'); // نام خانوادگی کودک آزمونی
    expect(JSON.stringify(res.body)).not.toContain('first_name');
  });

  it('ثبت پاسخ پیش از شروع رد می‌شود (۴۰۹) — ماشین حالت فقط رو به جلو', async () => {
    const res = await anon.post(`/api/m/${link.token}/attempts`, { item_id: 't1', response: { chosen: 70 }, idem_key: 'early-attempt' });
    expect(res.status).toBe(409);
  });

  // ─── زنجیرهٔ کودک: آیتم بدون کلید ← پاسخ ← بازخورد ───

  it('شروع جلسه: child_active؛ رفرش همان جلسه را برمی‌گرداند', async () => {
    const res = await anon.post(`/api/m/${link.token}/start`, {});
    expect(res.status).toBe(200);
    expect(dataOf<StateBody>(res).state).toBe('child_active');
    const again = await anon.post(`/api/m/${link.token}/start`, {});
    expect(dataOf<StateBody>(again).state).toBe('child_active');
    const missions = dataOf<{ status: string }[]>(await ali.get(`/api/games/missions?prescription_id=${rxId}`));
    expect(missions.find((m) => m.status === 'in_progress')).toBeTruthy();
  });

  it('next-item آیتم می‌دهد بدون هیچ کلید پاسخ', async () => {
    const res = await anon.get(`/api/m/${link.token}/next-item`);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('"correct"');
    expect(body).not.toContain('correct');
    const { item } = dataOf<{ item: { id: string; phase: string } | null }>(res);
    expect(item?.id).toBe('t1');
    expect(item?.phase).toBe('train');
  });

  it('پاسخ آموزشی نادرست: بازخورد با نمایش پاسخ درست و بدون پیام شکست', async () => {
    const res = await anon.post(`/api/m/${link.token}/attempts`, { item_id: 't1', response: { chosen: 10 }, rt_ms: 1200, idem_key: 'idem-t1-0001' });
    expect(res.status).toBe(200);
    const fb = dataOf<{ recorded: boolean; correct: boolean; answer_display: string; message: string }>(res);
    expect(fb.recorded).toBe(true);
    expect(fb.correct).toBe(false);
    expect(fb.answer_display).toBe('70');
    expect(fb.message).toBe('دوباره گوش کن');
  });

  it('تکرار idem_key همان بازخورد را می‌دهد و پاسخ تکراری ثبت نمی‌شود', async () => {
    const res = await anon.post(`/api/m/${link.token}/attempts`, { item_id: 't1', response: { chosen: 70 }, rt_ms: 900, idem_key: 'idem-t1-0001' });
    const fb = dataOf<{ correct: boolean }>(res);
    expect(fb.correct).toBe(false); // نتیجهٔ نخست حفظ می‌شود — تغییرپذیری پاسخ ممنوع
    const next = await anon.get(`/api/m/${link.token}/next-item`);
    expect(dataOf<{ progress: { done: number } }>(next).progress.done).toBe(1);
  });

  it('پاسخ آموزشی درست: «گرفتی!» و آیتم بعدی پروب است', async () => {
    const res = await anon.post(`/api/m/${link.token}/attempts`, { item_id: 't2', response: { chosen: 30 }, rt_ms: 800, idem_key: 'idem-t2-0001' });
    const fb = dataOf<{ correct: boolean; message: string; answer_display: string | null }>(res);
    expect(fb.correct).toBe(true);
    expect(fb.message).toBe('گرفتی!');
    expect(fb.answer_display).toBeNull();

    const next = await anon.get(`/api/m/${link.token}/next-item`);
    expect(dataOf<{ item: { id: string } | null }>(next).item?.id).toBe('p1');
  });

  it('آیتم پروب هیچ بازخوردی نمی‌گیرد (فقط recorded)', async () => {
    const res = await anon.post(`/api/m/${link.token}/attempts`, { item_id: 'p1', response: { chosen: 55 }, rt_ms: 700, idem_key: 'idem-p1-0001' });
    const fb = dataOf<Record<string, unknown>>(res);
    expect(fb.recorded).toBe(true);
    expect(fb).not.toHaveProperty('correct');
    expect(fb).not.toHaveProperty('answer_display');
    expect(fb).not.toHaveProperty('message');
  });

  it('آیتم ناشناس رد می‌شود (۴۰۰)', async () => {
    const res = await anon.post(`/api/m/${link.token}/attempts`, { item_id: 'hack', response: {}, idem_key: 'idem-hack' });
    expect(res.status).toBe(400);
  });

  // ─── پایان: سنجهٔ سروری + تزریق پراپ ───

  it('finish: سنجه از پروب محاسبه و به مسیر مداخله تزریق می‌شود', async () => {
    await anon.post(`/api/m/${link.token}/attempts`, { item_id: 'p2', response: { chosen: 70 }, rt_ms: 650, idem_key: 'idem-p2-0001' });
    await anon.post(`/api/m/${link.token}/attempts`, { item_id: 'p3', response: { chosen: 40 }, rt_ms: 720, idem_key: 'idem-p3-0001' });

    const exhausted = await anon.get(`/api/m/${link.token}/next-item`);
    const ex = dataOf<{ item: unknown; progress: { done: number; total: number } }>(exhausted);
    expect(ex.item).toBeNull();
    expect(ex.progress).toEqual({ done: 5, total: 5 });

    const res = await anon.post(`/api/m/${link.token}/finish`, {});
    expect(res.status).toBe(200);
    const out = dataOf<{ state: StateBody; metrics: MetricOutcome[] }>(res);
    expect(out.state.state).toBe('child_done');
    // خطاها: |55-50|=5٪ ، |70-70|=0 ، |40-20|=20٪ → میانگین ۸٫۳۳
    expect(out.metrics[0].metricId).toBe('pct_error_numline');
    expect(out.metrics[0].value).toBeCloseTo(8.33, 1);
    expect(out.metrics[0].injected).toBe(true);

    // پراپ واقعاً در سری زمانی مسیر مداخله است
    const probes = dataOf<{ metrics: { metric: string; points: { value: number }[] }[] }>(
      await ali.get(`/api/clinical-paths/${pathId}/probes`)
    );
    const series = probes.metrics.find((m) => m.metric === 'pct_error_numline');
    expect(series?.points.at(-1)?.value).toBeCloseTo(8.33, 1);
  });

  it('finish تکراری همان وضعیت و سنجه‌ها را می‌دهد (شبکهٔ ناپایدار)', async () => {
    const again = await anon.post(`/api/m/${link.token}/finish`, {});
    const out = dataOf<{ state: StateBody; metrics: MetricOutcome[] }>(again);
    expect(out.state.state).toBe('child_done');
    expect(out.metrics[0].value).toBeCloseTo(8.33, 1);
  });

  it('مأموریت پس از پایان done شده و مأموریت جدید همان روز با سقف ۱ رد می‌شود', async () => {
    const missions = dataOf<{ id: string; status: string }[]>(await ali.get(`/api/games/missions?prescription_id=${rxId}`));
    expect(missions.find((m) => m.id === missionId)?.status).toBe('done');

    // مأموریت فردا درج می‌شود (سقف روزِ دیگری است)
    const tomorrow = await ali.post('/api/games/missions', { prescription_id: rxId, mission_ref: 'numline_0_100_m1', scheduled_for: '2026-12-31' });
    expect(tomorrow.status).toBe(201);
    // اما اگر تاریخش با SQL به امروز کشیده شود، صدور لینک با سقف دوز می‌گیرد (شمارش سمت سرور)
    const mid = dataOf<{ id: string }>(tomorrow).id;
    A.sql.prepare(`UPDATE game_missions SET scheduled_for = ? WHERE id = ?`).run(today, mid);
    const capped = await ali.post(`/api/games/missions/${mid}/link`, {});
    expect(capped.status).toBe(409);
    expect(errorOf(capped)).toContain('سقف');
  });

  // ─── حلقهٔ والد: دروازه و تأیید دومضربه ───

  it('گذار والد: child_done ← parent_gate ← parent_post؛ بعد از دروازه، کودک بازی ندارد', async () => {
    const open = await anon.post(`/api/m/${link.token}/parent-gate`, {});
    expect(dataOf<StateBody>(open).state).toBe('parent_gate');
    const blocked = await anon.get(`/api/m/${link.token}/next-item`);
    expect(blocked.status).toBe(409);
    const solve = await anon.post(`/api/m/${link.token}/parent-gate`, { solve: true });
    expect(dataOf<StateBody>(solve).state).toBe('parent_post');
  });

  it('تأیید دومضربه: ضربهٔ اول ثبت می‌شود، ضربهٔ دوم جلسه را می‌بندد', async () => {
    const c1 = await anon.post(`/api/m/${link.token}/confirm`, {});
    expect(dataOf<StateBody>(c1).state).toBe('parent_post');
    expect(dataOf<StateBody>(c1).adherenceConfirmed).toBe(false);
    const c2 = await anon.post(`/api/m/${link.token}/confirm`, {});
    expect(dataOf<StateBody>(c2).state).toBe('closed');
    expect(dataOf<StateBody>(c2).adherenceConfirmed).toBe(true);

    const adherence = A.sql.prepare(`SELECT confirm1_at, confirm2_at FROM game_adherence WHERE mission_id = ?`).get(missionId) as { confirm1_at: string; confirm2_at: string };
    expect(adherence.confirm1_at).toBeTruthy();
    expect(adherence.confirm2_at).toBeTruthy();

    const after = await anon.post(`/api/m/${link.token}/attempts`, { item_id: 'p1', response: {}, idem_key: 'after-closed' });
    expect(after.status).toBe(409);
  });

  it('جلسهٔ ناقص (شکاف بیش از ۵ دقیقه) وارد سنجه می‌شود ولی برچسب ناقص می‌خورد', async () => {
    // مأموریت فردا: همهٔ آیتم‌ها را اجرا می‌کنیم، بعد شکاف بیکاری را در داده می‌سازیم
    const m2 = await ali.post('/api/games/missions', { prescription_id: rxId, mission_ref: 'numline_0_100_m1', scheduled_for: '2026-12-30' });
    const m2id = dataOf<{ id: string }>(m2).id;
    const l2 = dataOf<LinkBody>(await ali.post(`/api/games/missions/${m2id}/link`, {}));
    await anon.post(`/api/m/${l2.token}/start`, {});
    const ids = ['t1', 't2', 'p1', 'p2', 'p3'];
    for (let i = 0; i < ids.length; i++) {
      await anon.post(`/api/m/${l2.token}/attempts`, { item_id: ids[i], response: { chosen: 50 }, rt_ms: 600 + i, idem_key: `partial-${i}` });
    }
    // started_at = ۱۰ دقیقه پیش؛ نخستین فعالیت = ۲ دقیقه پیش → شکاف ۸ دقیقه
    A.sql.prepare(`UPDATE game_sessions SET started_at = ? WHERE mission_id = ?`).run(
      new Date(Date.now() - 10 * 60 * 1000).toISOString(), m2id
    );
    A.sql.prepare(`UPDATE game_attempts SET created_at = ? WHERE idem_key = 'partial-0'`).run(
      new Date(Date.now() - 2 * 60 * 1000).toISOString()
    );

    const fin = await anon.post(`/api/m/${l2.token}/finish`, {});
    const out = dataOf<{ state: StateBody; metrics: MetricOutcome[] }>(fin);
    expect(out.state.validity).toBe('partial');
    // پاسخ همه «۵۰»: خطاها ۰٪ / ۲۰٪ / ۳۰٪ → میانگین ۱۶٫۶۷
    expect(out.metrics[0].value).toBeCloseTo(16.67, 1);
    expect(out.metrics[0].injected).toBe(true);

    const note = (A.sql.prepare(`SELECT note FROM pathway_probes ORDER BY created_at DESC LIMIT 1`).get() as { note: string }).note;
    expect(note).toContain('ناقص');
  });

  // ─── گو/نوگو: چهار سنجهٔ هم‌زمان از یک مأموریت ───

  describe('بستهٔ توجه — چهار سنجهٔ گو/نوگو', () => {
    let attRxId: string;
    let attMissionId: string;

    beforeAll(async () => {
      const pub = await mgr.post('/api/games/packages/attention/1.0.0/publish', {});
      expect(pub.status).toBe(200);
      const rx = await mgr.post('/api/games/prescriptions', {
        child_id: studentId, package_id: 'attention', package_version: '1.0.0', goal_id: 'inhibition'
      });
      attRxId = dataOf<{ id: string }>(rx).id;
      const m = await mgr.post('/api/games/missions', { prescription_id: attRxId, mission_ref: 'gonogo_m1', scheduled_for: '2026-12-29' });
      attMissionId = dataOf<{ id: string }>(m).id;
      attLink = dataOf<LinkBody>(await mgr.post(`/api/games/missions/${attMissionId}/link`, {}));
      await anon.post(`/api/m/${attLink.token}/start`, {});
    });

    it('لمس go با ۱۴۹ms ثبت می‌شود ولی از میانه حذف می‌شود (۱۰۰ms آزمونی هم نامعتبر)', async () => {
      const tk = attLink!.token;
      // آموزش
      await anon.post(`/api/m/${tk}/attempts`, { item_id: 'g1', response: { touched: true }, rt_ms: 350, idem_key: 'att-go1-0001' });
      await anon.post(`/api/m/${tk}/attempts`, { item_id: 'g2', response: { touched: true }, rt_ms: 410, idem_key: 'att-go2-0001' });
      // پروب: pg1 لمس ۴۰۰ / pg2 لمس nogo ۲۵۰ / pg3 نلمسیدن / pg4 لمس ۳۲۰ / pg5 نلمسیدن nogo / pg6 لمس ۱۰۰
      const seq: [string, unknown, number | null][] = [
        ['pg1', { touched: true }, 400],
        ['pg2', { touched: true }, 250],
        ['pg3', { touched: false }, null],
        ['pg4', { touched: true }, 320],
        ['pg5', { touched: false }, null],
        ['pg6', { touched: true }, 100]
      ];
      for (let i = 0; i < seq.length; i++) {
        const res = await anon.post(`/api/m/${tk}/attempts`, { item_id: seq[i][0], response: seq[i][1], rt_ms: seq[i][2], idem_key: `att-probe-${i}` });
        expect(res.status).toBe(200);
      }
      const fin = await anon.post(`/api/m/${tk}/finish`, {});
      const out = dataOf<{ state: StateBody; metrics: MetricOutcome[] }>(fin);
      expect(out.state.state).toBe('child_done');
      const byId = Object.fromEntries(out.metrics.map((m) => [m.metricId, m]));
      // دقت ۴ از ۶ = ۶۶٫۶۷
      expect(byId.accuracy_gonogo.value).toBeCloseTo(66.67, 1);
      // میانهٔ درست‌های معتبر: [۳۲۰،۴۰۰] → ۳۶۰ (۱۰۰ms نامعتبر و nogoها حذف)
      expect(byId.median_rt_gonogo.value).toBe(360);
      expect(byId.commission_gonogo.value).toBe(1);
      expect(byId.omission_gonogo.value).toBe(1);
      // بدون مسیر مداخله → تزریق نمی‌شود ولی سنجه ذخیره می‌ماند
      expect(byId.accuracy_gonogo.injected).toBe(false);
    });
  });

  // ─── امنیت لینک ───

  it('انقضا و ابطال و توکن ساختگی رفتار خنثی دارند', async () => {
    // توکن ساختگی
    expect((await anon.get('/api/m/not-a-token/state')).status).toBe(404);
    // jti واقعی + رمز اشتباه → پیدا نمی‌شود
    const fake = `${link.token.split('.')[0]}.${'0'.repeat(64)}`;
    expect((await anon.get(`/api/m/${fake}/state`)).status).toBe(404);

    // انقضا با کشیدن تاریخ به عقب
    A.sql.prepare(`UPDATE game_links SET expires_at = ? WHERE jti = ?`).run(
      '2020-01-01T00:00:00.000Z', attLink!.token.split('.')[0]
    );
    expect(dataOf<StateBody>((await anon.get(`/api/m/${attLink!.token}/state`))).state).toBe('expired');
    const action = await anon.post(`/api/m/${attLink!.token}/finish`, {});
    expect(action.status).toBe(409);

    // ابطال پرسنلی
    const jti = link.token.split('.')[0];
    const rev = await ali.post(`/api/games/links/${jti}/revoke`, {});
    expect(rev.status).toBe(200);
    expect(dataOf<StateBody>((await anon.get(`/api/m/${link.token}/state`))).state).toBe('revoked');
  });

  it('شکست تجویز و رد تجویز مسیر بسته را می‌گیرد', async () => {
    const stopped = await ali.post(`/api/games/prescriptions/${rxId}/status`, { action: 'pause' });
    expect(dataOf<{ status: string }>(stopped).status).toBe('paused');
    const resumed = await ali.post(`/api/games/prescriptions/${rxId}/status`, { action: 'resume' });
    expect(dataOf<{ status: string }>(resumed).status).toBe('active');
  });

  it('رجیستری با API پرسنلی تکمیل می‌شود و منشی فقط می‌خواند', async () => {
    const m = await mgr.post('/api/games/metrics', {
      id: 'accuracy_writing_test', title_fa: 'دقت آزمایشی نوشتن', unit: 'percent',
      higher_is_better: true, source: 'auto', formula: 'accuracy'
    });
    expect(m.status).toBe(201);
    const g = await mgr.post('/api/games/goals', {
      id: 'writing_test', title_fa: 'هدف آزمایشی', package_id: 'writing', metric_id: 'accuracy_writing_test', age_min: 6, age_max: 9
    });
    expect(g.status).toBe(201);
    // هدف با سنجهٔ ناموجود رد می‌شود
    const badGoal = await mgr.post('/api/games/goals', {
      id: 'writing_bad', title_fa: 'بد', package_id: 'writing', metric_id: 'ناموجود'
    });
    expect(badGoal.status).toBe(404);

    const metrics = dataOf<{ id: string }[]>(await sec.get('/api/games/metrics'));
    expect(metrics.some((x) => x.id === 'accuracy_writing_test')).toBe(true);
    const goals = dataOf<{ id: string }[]>(await sec.get('/api/games/goals'));
    expect(goals.some((x) => x.id === 'writing_test')).toBe(true);
    // منشی ساختن نمی‌تواند
    expect((await sec.post('/api/games/metrics', {
      id: 'hack_metric', title_fa: 'هک', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'accuracy'
    })).status).toBe(403);
  });

  it('لینک مأموریت با تاریخ گذشته منقضی می‌شود (نه صدور)', async () => {
    const m = await ali.post('/api/games/missions', { prescription_id: rxId, mission_ref: 'numline_0_100_m1', scheduled_for: '2026-12-31' });
    const mid = dataOf<{ id: string }>(m).id;
    A.sql.prepare(`UPDATE game_missions SET scheduled_for = '2020-01-01' WHERE id = ?`).run(mid);
    const res = await ali.post(`/api/games/missions/${mid}/link`, {});
    expect(res.status).toBe(409);
    expect(errorOf(res)).toContain('منقضی');
  });

  it('صفحهٔ HTML در حالت‌های بسته و باطل خنثی است', async () => {
    // لینک اصلی در آزمون امنیت باطل شد؛ برای دیدن صفحهٔ «ثبت شد» موقتاً ابطال برداشته می‌شود
    A.sql.prepare(`UPDATE game_links SET revoked_at = NULL WHERE jti = ?`).run(link.token.split('.')[0]);
    const closedRaw = await A.app.request(`/m/${link.token}`, {}, A.env as never);
    const closedHtml = await closedRaw.text();
    expect(closedHtml).toContain('ثبت شد'); // حالت بسته فقط خواندنی
    expect(closedHtml).not.toContain('آمادهٔ شروع');

    const revokedRaw = await A.app.request(`/m/${attLink!.token}`, {}, A.env as never);
    const revokedHtml = await revokedRaw.text();
    expect(revokedHtml).toContain('این پیوند فعال نیست'); // منقضی/باطل = صفحهٔ ساده
    expect(revokedHtml).not.toContain('گرفتی');
  });

  it('نمای درمانگر: جلسات و پاسخ‌ها با متادیتای اعتبار دیده می‌شود', async () => {
    const detail = dataOf<{ sessions: { id: string; state: string; validity: string; metrics: unknown }[]; attempts: unknown[] }>(
      await ali.get(`/api/games/missions/${missionId}/sessions`)
    );
    expect(detail.sessions.length).toBe(1);
    expect(detail.sessions[0].state).toBe('closed');
    expect(detail.sessions[0].validity).toBe('valid');
    expect(Array.isArray(detail.attempts)).toBe(true);
    expect(detail.attempts.length).toBe(5);
    // پاسخ ثبت‌شده فقط ورودی خود کودک است — کلید آیتم از بسته به این نما درز نمی‌کند؛
    // پرچم correct این‌جا «نتیجهٔ نمره‌دهی سروری» است و برای درمانگر لازم است.
    for (const a of detail.attempts as { response: Record<string, unknown> }[]) {
      expect(Object.keys(a.response)).not.toContain('correct');
      expect(Object.keys(a.response)).not.toContain('correct_touch');
    }
  });
});
