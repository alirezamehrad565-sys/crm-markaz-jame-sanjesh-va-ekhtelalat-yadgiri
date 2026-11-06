// میز حلقهٔ درمانگر بازی‌ها (۱.۲۵.۲۴) — بازنشستگی بسته، فهرست غنی تجویزها،
// لینک زنده در فهرست مأموریت‌ها و خروجی CSV گزارش.
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent, loginToken } from '../../test/harness';
import { reportToCsv } from '../../domain/games/report';
import type { ChildGameReport } from '../../domain/games/report';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function consolePkgBody(pkgId: string) {
  return {
    package_id: pkgId,
    version: '1.0.0',
    title_fa: `بستهٔ میز ${pkgId}`,
    evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 15, max_missions_per_day: 2, min_weeks: 4 },
    body: {
      package_id: pkgId,
      goals: ['inhibition'],
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'mz_m1', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo', title: 'ستاره‌چین میز',
        probe: { items: 1, feedback: false, position: 'end' },
        mastery: { threshold: 85, sessions: 2 },
        items: [
          { id: 'mz-g1', phase: 'train', type: 'touch_report', stim: { shape: 'star', color: 'سبز' }, correct_touch: true },
          { id: 'mz-n1', phase: 'train', type: 'touch_report', stim: { shape: 'square', color: 'آبی' }, correct_touch: false },
          { id: 'mz-p1', phase: 'probe', type: 'touch_report', stim: { shape: 'star', color: 'سبز' }, correct_touch: true }
        ]
      }]
    }
  };
}

function todayYmd(): string {
  const now = new Date();
  const tehran = new Date(now.getTime() + 3.5 * 3600 * 1000);
  return tehran.toISOString().slice(0, 10);
}

function yesterdayYmd(): string {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString();
}

interface RxRow { id: string; childId: string; childName: string | null; packageTitleFa: string | null; goalTitleFa: string | null; missionTotal: number; missionDone: number; missionLive: number; status: string }
interface MissionRow { id: string; missionRef: string; title: string | null; status: string; link: { jti: string; expiresAt: string } | null }

describe('میز حلقهٔ درمانگر بازی‌ها (۱.۲۵.۲۴)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let th: Api;
  let secretary: Api;
  let anon: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    th = await asRole(A, 'therapist');
    secretary = await asRole(A, 'secretary');
    anon = new Api(A);
    // دو بسته: console-pkg برای سناریوی بازنشستگی، console-pkg2 برای بقیهٔ آزمون‌ها (منتشر می‌ماند)
    for (const pkgId of ['console-pkg', 'console-pkg2']) {
      const pkg = await mgr.post('/api/games/packages', consolePkgBody(pkgId));
      expect(pkg.status).toBe(201);
      const goal = await mgr.post('/api/games/goals', {
        id: `inhibition_${pkgId.replace(/-/g, '_')}`, title_fa: `بازداری پاسخ (${pkgId})`, package_id: pkgId, metric_id: 'accuracy_gonogo'
      });
      expect(goal.status).toBe(201);
      const pub = await mgr.post(`/api/games/packages/${pkgId}/1.0.0/publish`, {});
      expect(pub.status).toBe(200);
    }
  });

  it('بازنشستگی: ناشناس ۴۰۱، درمانگر ۴۰۳ — فقط مدیر', async () => {
    expect((await anon.post('/api/games/packages/console-pkg/1.0.0/retire', {})).status).toBe(401);
    expect((await th.post('/api/games/packages/console-pkg/1.0.0/retire', {})).status).toBe(403);
  });

  it('بازنشستگی: تجویز تازه می‌بندد؛ تجویز موجود نسخه‌قفل می‌ماند؛ بازنشسته دوباره منتشر نمی‌شود', async () => {
    // تجویز «موجود» پیش از بازنشستگی ساخته می‌شود
    const studentKeep = await createStudent(mgr);
    const rxKeep = dataOf<{ id: string }>(await mgr.post('/api/games/prescriptions', {
      child_id: studentKeep.id, package_id: 'console-pkg', package_version: '1.0.0', goal_id: 'inhibition_console_pkg'
    }));
    const missionKeep = dataOf<{ id: string }>(await mgr.post('/api/games/missions', {
      prescription_id: rxKeep.id, mission_ref: 'mz_m1', scheduled_for: todayYmd()
    }));

    const ret = await mgr.post('/api/games/packages/console-pkg/1.0.0/retire', {});
    expect(ret.status).toBe(200);
    expect(dataOf<{ status: string }>(ret).status).toBe('retired');

    // تجویز تازه از نسخهٔ بازنشسته رد می‌شود
    const studentNew = await createStudent(mgr);
    const rxNew = await mgr.post('/api/games/prescriptions', {
      child_id: studentNew.id, package_id: 'console-pkg', package_version: '1.0.0', goal_id: 'inhibition_console_pkg'
    });
    expect(rxNew.status).toBe(400);

    // نسخهٔ بازنشسته دوباره منتشر نمی‌شود
    expect((await mgr.post('/api/games/packages/console-pkg/1.0.0/publish', {})).status).toBe(409);

    // تجویز موجود سالم است: مأموریت تازه و لینک همان نسخهٔ قفل‌شده کار می‌کند
    const link = await mgr.post(`/api/games/missions/${missionKeep.id}/link`, {});
    expect(link.status).toBe(201);

    // بازنشستگی دوباره = بی‌اثر و موفق (idempotent)
    expect((await mgr.post('/api/games/packages/console-pkg/1.0.0/retire', {})).status).toBe(200);
  });

  it('فهرست تجویزها: هویت انسانی + شمار مأموریت‌ها + فیلتر وضعیت + حد + سازگاری child_id قدیمی', async () => {
    const student = await createStudent(mgr);
    const rx1 = dataOf<{ id: string }>(await mgr.post('/api/games/prescriptions', {
      child_id: student.id, package_id: 'console-pkg2', package_version: '1.0.0', goal_id: 'inhibition_console_pkg2'
    }));
    await mgr.post('/api/games/missions', { prescription_id: rx1.id, mission_ref: 'mz_m1', scheduled_for: todayYmd() });
    const rx2 = dataOf<{ id: string }>(await mgr.post('/api/games/prescriptions', {
      child_id: student.id, package_id: 'console-pkg2', package_version: '1.0.0', goal_id: 'inhibition_console_pkg2'
    }));
    await mgr.post(`/api/games/prescriptions/${rx2.id}/status`, { action: 'pause' });

    const list = dataOf<RxRow[]>(await mgr.get(`/api/games/prescriptions?child_id=${student.id}`));
    expect(list.length).toBe(2);
    const withMissions = list.find((r) => r.id === rx1.id)!;
    expect(withMissions.childName).toContain('خانواده');
    expect(withMissions.packageTitleFa).toBe('بستهٔ میز console-pkg2');
    expect(withMissions.goalTitleFa).toBe('بازداری پاسخ (console-pkg2)');
    expect(withMissions.missionTotal).toBe(1);
    expect(withMissions.missionDone).toBe(0);
    expect(withMissions.missionLive).toBe(1);

    // فیلتر وضعیت
    const paused = dataOf<RxRow[]>(await mgr.get(`/api/games/prescriptions?child_id=${student.id}&status=paused`));
    expect(paused.length).toBe(1);
    expect(paused[0].id).toBe(rx2.id);

    // حد
    const one = dataOf<RxRow[]>(await mgr.get(`/api/games/prescriptions?limit=1`));
    expect(one.length).toBe(1);

    // سازگاری قدیمی: فراخوانی بدون پارامتر = فهرست محدود پیش‌فرض؛ منشی فهرست را می‌بیند ولی نمی‌نویسد
    const all = dataOf<RxRow[]>(await secretary.get('/api/games/prescriptions'));
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect((await secretary.post('/api/games/prescriptions', {
      child_id: student.id, package_id: 'console-pkg2', package_version: '1.0.0', goal_id: 'inhibition_console_pkg2'
    })).status).toBe(403);
  });

  it('فهرست مأموریت‌ها: عنوان از بدنهٔ بسته + لینک زنده (صدور/ابطال) در جا دیده می‌شود', async () => {
    const student = await createStudent(mgr);
    const rx = dataOf<{ id: string }>(await mgr.post('/api/games/prescriptions', {
      child_id: student.id, package_id: 'console-pkg2', package_version: '1.0.0', goal_id: 'inhibition_console_pkg2'
    }));
    const mission = dataOf<{ id: string }>(await mgr.post('/api/games/missions', {
      prescription_id: rx.id, mission_ref: 'mz_m1', scheduled_for: todayYmd()
    }));

    let rows = dataOf<MissionRow[]>(await mgr.get(`/api/games/missions?prescription_id=${rx.id}`));
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('ستاره‌چین میز'); // عنوان از بدنهٔ بسته — نه شناسهٔ خام
    expect(rows[0].link).toBeNull();

    const link = dataOf<{ jti: string; expiresAt: string }>(await mgr.post(`/api/games/missions/${mission.id}/link`, {}));
    rows = dataOf<MissionRow[]>(await mgr.get(`/api/games/missions?prescription_id=${rx.id}`));
    expect(rows[0].link?.jti).toBe(link.jti);
    expect(typeof rows[0].link?.expiresAt).toBe('string');

    await mgr.post(`/api/games/links/${link.jti}/revoke`, {});
    rows = dataOf<MissionRow[]>(await mgr.get(`/api/games/missions?prescription_id=${rx.id}`));
    expect(rows[0].link).toBeNull();
  });

  it('گزارش CSV: ناشناس ۴۰۱، منشی ۴۰۳؛ کودک بدون جلسه = فقط سرستون با BOM', async () => {
    const student = await createStudent(mgr);
    expect((await anon.get(`/api/games/children/${student.id}/report?format=csv`)).status).toBe(401);
    expect((await secretary.get(`/api/games/children/${student.id}/report?format=csv`)).status).toBe(403);

    const token = await loginToken(A, 'manager');
    const res = await A.app.request(`/api/games/children/${student.id}/report?format=csv`, {
      headers: { authorization: `Bearer ${token}` }
    }, A.env as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    // WHATWG text() خودِ BOM را می‌کندد — BOM از بایت‌های خام (UTF-8: EF BB BF برای Excel) راست‌آزمایی می‌شود
    const buf = await res.clone().arrayBuffer(); // بدنه یک‌بارمصرف است — clone پیش از خواندن متنی
    const text = await res.text();
    expect(Array.from(new Uint8Array(buf).slice(0, 3))).toEqual([0xEF, 0xBB, 0xBF]);
    const lines = text.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines).toHaveLength(1); // بدون جلسه = فقط سرستون
    expect(lines[0]).toContain('session_id');
    expect(lines[0]).toContain('correct_go_pct');
    expect(lines[0]).toContain('quality_verdict');
  });

  it('reportToCsv (خالص): ردیف به‌ازای هر جلسه، گریز کاما و نقل‌قول، ترتیب سرستون پایدار', () => {
    const report: ChildGameReport = {
      child_id: 'c1',
      generated_at: '2026-01-01T00:00:00Z',
      session_count: 2,
      disclaimer: 'no_clinical_conclusion',
      comparison: { by_metric: [] },
      sessions: [
        {
          session_id: 's1', mission_ref: 'm1', mission_title: 'بازی, با کاما', purpose: 'training',
          started_at: '2026-01-01T08:00:00Z',
          computed: {
            session_id: 's1', purpose: 'training', validity: 'valid', quality_verdict: 'explainable',
            started_at: '2026-01-01T08:00:00Z', ended_at: '2026-01-01T08:12:00Z', summary: null, metrics: null
          },
          raw: { attempt_count: 5, attempts: [], sequence: null },
          adaptive: null
        },
        {
          session_id: 's2', mission_ref: 'm1', mission_title: 'ستاره‌چین', purpose: 'training',
          started_at: '2026-01-02T08:00:00Z',
          computed: {
            session_id: 's2', purpose: 'training', validity: 'valid', quality_verdict: 'needs_caution',
            started_at: '2026-01-02T08:00:00Z', ended_at: '2026-01-02T08:10:00Z',
            summary: {
              totals: { total: 8 },
              pct: { correct_go: 90.5, correct_nogo: 80, commission: 20, omission: 10 },
              rt: { median: 612 },
              stage: { title_fa: 'گرم‌کردن', stars: 2 }
            },
            metrics: null
          },
          raw: { attempt_count: 8, attempts: [], sequence: null },
          adaptive: null
        }
      ]
    } as unknown as ChildGameReport;
    const csv = reportToCsv(report);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines).toHaveLength(3);
    const cells2 = lines[2].split(',');
    expect(cells2[2]).toBe('ستاره‌چین');
    expect(cells2[8]).toBe('8'); // total
    expect(cells2[9]).toBe('90.5'); // correct_go_pct
    expect(cells2[13]).toBe('612'); // median_rt_ms
    expect(cells2[14]).toBe('گرم‌کردن');
    expect(cells2[15]).toBe('2'); // stars
    // ردیف اول: عنوان حاوی کاما باید نقل‌قول شود
    expect(lines[1]).toContain('"بازی, با کاما"');
  });

  // ─── میز پیگیری تبعیت + سوییپ + ممیزی خروج داده + بهداشت حذف (۱.۲۵.۲۵) ───

  it('میز پیگیری: ناشناس ۴۰۱؛ تجویزِ بی‌مأموریت، رکود، تاریخ‌گذشته و امروزِ بی‌لینک با دلیل درست', async () => {
    expect((await anon.get('/api/games/followups')).status).toBe(401);
    expect((await secretary.get('/api/games/followups')).status).toBe(200);

    // کودک الف — تجویز بدون هیچ مأموریت → never_scheduled
    const stNever = await createStudent(mgr);
    await mgr.post('/api/games/prescriptions', {
      child_id: stNever.id, package_id: 'console-pkg2', package_version: '1.0.0', goal_id: 'inhibition_console_pkg2'
    });

    // کودک ب — مأموریت دیروز اجرانشده (pending_overdue) + مأموریت امروز بدون لینک (today_unlinked)
    const stToday = await createStudent(mgr);
    const rxBusy = dataOf<{ id: string }>(await mgr.post('/api/games/prescriptions', {
      child_id: stToday.id, package_id: 'console-pkg2', package_version: '1.0.0', goal_id: 'inhibition_console_pkg2'
    }));
    await mgr.post('/api/games/missions', { prescription_id: rxBusy.id, mission_ref: 'mz_m1', scheduled_for: yesterdayYmd() });
    await mgr.post('/api/games/missions', { prescription_id: rxBusy.id, mission_ref: 'mz_m1', scheduled_for: todayYmd() });

    // کودک ج — جلسهٔ تمام‌شدهٔ ۱۰ روز پیش + مأموریت باقی‌مانده → stalled (≥۷ روز)
    const stStall = await createStudent(mgr);
    const rxStall = dataOf<{ id: string }>(await mgr.post('/api/games/prescriptions', {
      child_id: stStall.id, package_id: 'console-pkg2', package_version: '1.0.0', goal_id: 'inhibition_console_pkg2'
    }));
    const mStall = dataOf<{ id: string }>(await mgr.post('/api/games/missions', {
      prescription_id: rxStall.id, mission_ref: 'mz_m1', scheduled_for: yesterdayYmd()
    }));
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    A.sql.prepare(`INSERT INTO game_sessions (id, mission_id, state, validity, started_at, ended_at, last_activity_at, created_at)
      VALUES ('sess-stall', ?, 'child_done', 'valid', ?, ?, ?, ?)`).run(mStall.id, tenDaysAgo, tenDaysAgo, tenDaysAgo, tenDaysAgo);

    const rows = dataOf<Array<{ prescriptionId: string; childName: string | null; reasons: string[]; idleDays: number | null; pendingOverdue: number; todayUnlinked: number }>>(
      await mgr.get('/api/games/followups')
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const never = rows.find((r) => r.reasons.includes('never_scheduled'));
    expect(never).toBeTruthy();
    const busy = rows.find((r) => r.pendingOverdue === 1 && r.todayUnlinked === 1);
    expect(busy?.reasons).toContain('pending_overdue');
    expect(busy?.reasons).toContain('today_unlinked');
    const stall = rows.find((r) => r.reasons.includes('stalled'));
    expect(stall?.idleDays ?? 0).toBeGreaterThanOrEqual(7);
    // هیچ ردیفی بدون دلیل نیست — میز فقط نیازمندان توجه
    for (const r of rows) expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('سوییپ جلسهٔ رهاشده: in_progress با بی‌فعالیتی >۶ ساعت به pending برمی‌گردد؛ جلسهٔ تازه دست نمی‌خورد', async () => {
    const st = await createStudent(mgr);
    const rx = dataOf<{ id: string }>(await mgr.post('/api/games/prescriptions', {
      child_id: st.id, package_id: 'console-pkg2', package_version: '1.0.0', goal_id: 'inhibition_console_pkg2'
    }));
    const mStale = dataOf<{ id: string }>(await mgr.post('/api/games/missions', {
      prescription_id: rx.id, mission_ref: 'mz_m1', scheduled_for: todayYmd()
    }));
    const mFresh = dataOf<{ id: string }>(await mgr.post('/api/games/missions', {
      prescription_id: rx.id, mission_ref: 'mz_m1', scheduled_for: todayYmd()
    }));
    // هر دو مأموریت in_progress با جلسهٔ child_active؛ یکی رهاشده (۷ ساعت پیش) یکی تازه
    const staleAt = new Date(Date.now() - 7 * 3600 * 1000).toISOString();
    A.sql.prepare(`UPDATE game_missions SET status = 'in_progress' WHERE id IN (?, ?)`).run(mStale.id, mFresh.id);
    A.sql.prepare(`INSERT INTO game_sessions (id, mission_id, state, validity, started_at, last_activity_at, created_at)
      VALUES ('sess-stale', ?, 'child_active', 'valid', ?, ?, ?)`).run(mStale.id, staleAt, staleAt, staleAt);
    A.sql.prepare(`INSERT INTO game_sessions (id, mission_id, state, validity, started_at, last_activity_at, created_at)
      VALUES ('sess-fresh', ?, 'child_active', 'valid', ?, ?, ?)`).run(mFresh.id, todayIso(), todayIso(), todayIso());

    await mgr.get('/api/games/prescriptions'); // سوییپ تنبل در فهرست اجرا می‌شود

    const staleStatus = (A.sql.prepare(`SELECT status FROM game_missions WHERE id = ?`).get(mStale.id) as { status: string }).status;
    const freshStatus = (A.sql.prepare(`SELECT status FROM game_missions WHERE id = ?`).get(mFresh.id) as { status: string }).status;
    expect(staleStatus).toBe('pending'); // رهاشده برگشت
    expect(freshStatus).toBe('in_progress'); // جلسهٔ زنده دست نمی‌خورد
  });

  it('ممیزی خروج داده: گزارش JSON/CSV با game_report_export در دفترچهٔ حسابرسی می‌ماند', async () => {
    const st = await createStudent(mgr);
    await mgr.get(`/api/games/children/${st.id}/report`);
    await mgr.get(`/api/games/children/${st.id}/report?format=csv`);
    const logs = A.sql.prepare(
      `SELECT action, resource_id, changes FROM audit_log WHERE action = 'game_report_export' AND resource_id = ? ORDER BY created_at`
    ).all(st.id) as Array<{ action: string; resource_id: string; changes: string }>;
    expect(logs.length).toBe(2);
    expect(logs[0].changes).toContain('json');
    expect(logs[1].changes).toContain('csv');
  });

  it('بهداشت حذف: تجویز بازی حذفِ آزاد را می‌بندد؛ حذف با سابقهٔ مدیر آبشار کامل دادهٔ بازی را پاک می‌کند', async () => {
    const st = await createStudent(mgr);
    const rx = dataOf<{ id: string }>(await mgr.post('/api/games/prescriptions', {
      child_id: st.id, package_id: 'console-pkg2', package_version: '1.0.0', goal_id: 'inhibition_console_pkg2'
    }));
    const m = dataOf<{ id: string }>(await mgr.post('/api/games/missions', {
      prescription_id: rx.id, mission_ref: 'mz_m1', scheduled_for: todayYmd()
    }));
    const link = dataOf<{ jti: string; token: string }>(await mgr.post(`/api/games/missions/${m.id}/link`, {}));

    // سد نرم: بدون force، حذف رد می‌شود با برچسب «تجویز بازی»
    const soft = await secretary.req('DELETE', `/api/students/${st.id}`);
    expect(soft.status).toBe(409);
    expect(JSON.stringify(soft.body)).toContain('تجویز بازی');

    // حذف با سابقهٔ مدیر: آبشار کامل — links/adherence/sessions/missions/prescriptions
    expect((await mgr.req('DELETE', `/api/students/${st.id}?force=true`)).status).toBe(204);
    const rxLeft = (A.sql.prepare(`SELECT COUNT(*) AS n FROM game_prescriptions WHERE child_id = ?`).get(st.id) as { n: number }).n;
    const mLeft = (A.sql.prepare(`SELECT COUNT(*) AS n FROM game_missions WHERE id = ?`).get(m.id) as { n: number }).n;
    const linkLeft = (A.sql.prepare(`SELECT COUNT(*) AS n FROM game_links WHERE jti = ?`).get(link.jti) as { n: number }).n;
    const adherenceLeft = (A.sql.prepare(`SELECT COUNT(*) AS n FROM game_adherence WHERE mission_id = ?`).get(m.id) as { n: number }).n;
    expect(rxLeft).toBe(0);
    expect(mLeft).toBe(0);
    expect(linkLeft).toBe(0);
    expect(adherenceLeft).toBe(0);
    // لینک کودک بعد از حذف پرونده زنده نمی‌ماند
    expect((await anon.get(`/api/m/${link.token}/state`)).status).toBe(404);
  });
});
