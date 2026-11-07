// گیت سروری G1 تثبیت موتور و صحت داده (۱.۲۵.۳۵) — رفع‌های P2-2/P2-3 ممیزی M0:
//  · maintenance(): نگهداشت دوره‌ای از cron — سوییپ مأموریت رهاشده + پاکسازی لینک/توکن منقضی
//  · publicError: پیام خام درایور/zod هرگز به زنجیرهٔ عمومی نمی‌رسد؛ پاکت ثابت و آرام
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent, silentLogger } from '../../test/harness';
import { createAuditWriter } from '@core/audit';
import { createDb } from '@core/db';
import { createGamesService } from '@domain/games';

interface LinkBody { jti: string; token: string; url: string; expiresAt: string }

function g1PackageBody() {
  return {
    package_id: 'attention-g1', version: '1.0.0', title_fa: 'توجه G1', evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 15, max_missions_per_day: 2, min_weeks: 5 },
    body: {
      package_id: 'attention-g1', goals: ['inhibition'], mastery: { threshold: 85, sessions: 2 },
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'g1_m', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo', title: 'ستاره‌چین',
        probe: { items: 2, feedback: false, position: 'end' }, mastery: { threshold: 85, sessions: 2 },
        items: [
          { id: 'tr-go', phase: 'train', type: 'touch_report', stim: { shape: 'star', color: 'سبز' }, correct_touch: true },
          { id: 'pr-go', phase: 'probe', type: 'touch_report', stim: { shape: 'star', color: 'سبز' }, correct_touch: true },
          { id: 'pr-nogo', phase: 'probe', type: 'touch_report', stim: { shape: 'square', color: 'آبی' }, correct_touch: false }
        ]
      }],
      parent_copy: { before: 'این بازی تمرین مهارت است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
    }
  };
}

describe('G1/P2-3 — نگهداشت دوره‌ای بازی‌ها از cron', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let missionId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    const studentId = (await createStudent(mgr)).id;
    await mgr.post('/api/games/packages', g1PackageBody());
    const pub = await mgr.post('/api/games/packages/attention-g1/1.0.0/publish', {});
    expect(pub.status).toBe(200);
    const goal = await mgr.post('/api/games/goals', {
      id: 'inhibition_g1', title_fa: 'بازداری G1', package_id: 'attention-g1', metric_id: 'accuracy_gonogo'
    });
    expect(goal.status).toBe(201);
    const rx = await mgr.post('/api/games/prescriptions', {
      child_id: studentId, package_id: 'attention-g1', package_version: '1.0.0', goal_id: 'inhibition_g1'
    });
    expect(rx.status).toBe(201);
    const m = await mgr.post('/api/games/missions', {
      prescription_id: (rx.body as { data: { id: string } }).data.id,
      mission_ref: 'g1_m',
      scheduled_for: new Date().toISOString().slice(0, 10)
    });
    expect(m.status).toBe(201);
    missionId = (m.body as { data: { id: string } }).data.id;
  });

  function gamesService() {
    const db = createDb(A.d1 as unknown as D1Database);
    return createGamesService({
      db,
      audit: createAuditWriter(db),
      logger: silentLogger('g1'),
      publicBaseUrl: null
    });
  }

  it('لینک منقضی و توکن پیش‌نمایش منقضی را پاک می‌کند و خروجی شمارش صادقانه می‌دهد', async () => {
    const svc = gamesService();
    const expired = '2000-01-01T00:00:00.000Z';
    A.sql.prepare(
      `INSERT INTO game_links (jti, mission_id, token_hash, issued_by, expires_at, created_at)
       VALUES (?, ?, 'hash-g1-expired', '00000000-0000-0000-0000-000000000001', ?, ?)`
    ).run('jti-g1-expired', missionId, expired, expired);
    A.sql.prepare(
      `INSERT INTO game_links (jti, mission_id, token_hash, issued_by, expires_at, created_at)
       VALUES (?, ?, 'hash-g1-live', '00000000-0000-0000-0000-000000000001', '2999-01-01T00:00:00.000Z', ?)`
    ).run('jti-g1-live', missionId, expired);
    A.sql.prepare(
      `INSERT INTO game_preview_tokens (jti, package_id, package_version, token_hash, issued_by, expires_at, created_at)
       VALUES (?, 'attention-g1', '1.0.0', ?, '00000000-0000-0000-0000-000000000001', ?, ?)`
    ).run('jti-g1-preview-exp', 'hash-g1-preview-exp', expired, expired);
    const out = await svc.maintenance();
    expect(out.removed_links).toBe(1);
    expect(out.removed_preview_tokens).toBe(1);
    const live = A.sql.prepare(`SELECT COUNT(*) AS n FROM game_links WHERE jti = 'jti-g1-live'`).get() as { n: number };
    expect(live.n).toBe(1); // لینک زنده دست نمی‌خورد
    // دوباره = صفر (idempotent)
    const again = await svc.maintenance();
    expect(again.removed_links).toBe(0);
    expect(again.removed_preview_tokens).toBe(0);
  });

  it('مأموریت رهاشده (بی‌فعالیت >۶ ساعت) به pending برمی‌گردد — سوییپ در maintenance', async () => {
    const svc = gamesService();
    // مأموریت تازه به در جریان می‌رود و جلسهٔ کامی‌آن فعال می‌گیرد
    await mgr.post(`/api/games/missions/${missionId}/link`, {});
    const staleIso = '2000-01-01T00:00:00.000Z';
    A.sql.prepare(`UPDATE game_missions SET status = 'in_progress' WHERE id = ?`).run(missionId);
    A.sql.prepare(
      `INSERT INTO game_sessions (id, mission_id, state, validity, started_at, last_activity_at)
       VALUES (?, ?, 'child_active', 'valid', ?, ?)`
    ).run('sess-g1-stale', missionId, staleIso, staleIso);
    const out = await svc.maintenance();
    expect(out.swept_missions).toBeGreaterThanOrEqual(1);
    const row = A.sql.prepare(`SELECT status FROM game_missions WHERE id = ?`).get(missionId) as { status: string };
    expect(row.status).toBe('pending'); // شمارندهٔ «در جریان» صادق می‌ماند
  });
});

describe('G1/P2-2 — پاکت خطای عمومی بی‌نشتی', () => {
  let A: ReturnType<typeof createTestApp>;
  let anon: Api;
  let mgr: Api;
  let link: LinkBody;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    anon = new Api(A);
    const studentId = (await createStudent(mgr)).id;
    await mgr.post('/api/games/packages', g1PackageBody());
    await mgr.post('/api/games/packages/attention-g1/1.0.0/publish', {});
    await mgr.post('/api/games/goals', {
      id: 'inhibition_g1b', title_fa: 'بازداری G1b', package_id: 'attention-g1', metric_id: 'accuracy_gonogo'
    });
    const rx = await mgr.post('/api/games/prescriptions', {
      child_id: studentId, package_id: 'attention-g1', package_version: '1.0.0', goal_id: 'inhibition_g1b'
    });
    const m = await mgr.post('/api/games/missions', {
      prescription_id: (rx.body as { data: { id: string } }).data.id,
      mission_ref: 'g1_m',
      scheduled_for: new Date().toISOString().slice(0, 10)
    });
    expect(m.status).toBe(201);
    // لینک از نقطهٔ رسمی link صادر می‌شود — توکن زندهٔ مأموریت
    const issued = await mgr.post(`/api/games/missions/${(m.body as { data: { id: string } }).data.id}/link`, {});
    expect(issued.status).toBe(201);
    link = (issued.body as { data: LinkBody }).data;
    await anon.post(`/api/m/${link.token}/start`, {});
  });

  it('ورودی نامعتبر (zod) — پاکت ثابت؛ بدون متن خام شِمای zod', async () => {
    const res = await anon.post(`/api/m/${link.token}/attempts`, { item_id: 'tr-go', response: {}, idem_key: ' short' });
    expect(res.status).toBe(400);
    const b = res.body as { error?: string; message?: string };
    expect(b.error).toBe('VALIDATION_ERROR');
    expect(b.message).toBe('ورودی نامعتبر است'); // پیش از G1 متن خام zod نشت می‌کرد
  });

  it('آیتم ناشناس — همان پیام آرام سروری (مسیر AppError دست‌نخورده)', async () => {
    const res = await anon.post(`/api/m/${link.token}/attempts`, { item_id: 'hack', response: {}, idem_key: 'idem-g1-hack' });
    expect(res.status).toBe(400);
    expect((res.body as { error?: string }).error).toBe('VALIDATION_ERROR');
    expect((res.body as { message?: string }).message).toContain('مأموریت');
  });
});
