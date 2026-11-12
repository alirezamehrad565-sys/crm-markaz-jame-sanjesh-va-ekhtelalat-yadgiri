// e2e بستهٔ مستقل بازی‌ها (۱.۲۵.۷۵) — createGamesApp باید بدون اپ کامل CRM کامل کار کند:
// سلامت ماژول، گیت احراز، ورود مستقل، چرخهٔ کامل تجویز→مأموریت→لینک→زنجیرهٔ عمومی §۵.
// نکته: بستهٔ مستقل فقط بازی‌ها را سرو می‌کند — /api/students ندارد؛ دانش‌آموز از seed می‌آید.
import { describe, expect, test } from 'vitest';
import { APP_VERSION } from '@core/version';
import {
  Api,
  STUDENT1_ID,
  createTestGamesApp,
  asRole,
  type TestApp
} from '../../test/harness';

let A: TestApp;

function tehranTodayYmd(): string {
  return new Date(Date.now() + 210 * 60_000).toISOString().slice(0, 10);
}

function g1PackageBody() {
  // هم‌الگوی e2e-games-g1 — بستهٔ حداقلی معتبر؛ هدف از واژه‌نامهٔ رسمی ('inhibition')
  return {
    package_id: 'standalone-g1', version: '1.0.0', title_fa: 'توجه G1 مستقل', evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 15, max_missions_per_day: 2, min_weeks: 5 },
    body: {
      package_id: 'standalone-g1', goals: ['inhibition'], mastery: { threshold: 85, sessions: 2 },
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'sa_m', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo', title: 'ستاره‌چین',
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

describe('بستهٔ مستقل بازی‌ها — createGamesApp (۱.۲۵.۷۵)', () => {
  test('/health — سلامت ماژول با نشان games و نسخهٔ هم‌گام', async () => {
    A = createTestGamesApp();
    const res = await new Api(A).get('/health');
    expect(res.status).toBe(200);
    const body = res.body as { ok: boolean; db: string; module: string; version: string };
    expect(body.ok).toBe(true);
    expect(body.db).toBe('up');
    expect(body.module).toBe('games');
    expect(body.version).toBe(APP_VERSION);
  });

  test('بدون احراز: API پرسنلی بسته است؛ زنجیرهٔ عمومی §۵ با توکن نامعتبر کم‌دست رد می‌شود', async () => {
    const anon = new Api(A);
    expect((await anon.get('/api/games/packages')).status).toBe(401);
    // توکن نامعتبر → ۴۰۴ کم‌دست (بدون هیچ اطلاعات بالینی — قرارداد §۵)
    expect((await anon.get('/api/m/does-not-exist/next-item')).status).toBe(404);
  });

  test('ورود مستقل + ثبت بسته/انتشار/فهرست روی همان قرارداد اپ اصلی', async () => {
    const mgr = await asRole(A, 'manager'); // ورود از خودِ بستهٔ مستقل (registerAuthRoutes داخل createGamesApp)
    const created = await mgr.post('/api/games/packages', g1PackageBody());
    expect([200, 201]).toContain(created.status);
    const pub = await mgr.post('/api/games/packages/standalone-g1/1.0.0/publish', {});
    expect(pub.status).toBe(200);
    const list = await mgr.get('/api/games/packages?status=published');
    expect(list.status).toBe(200);
    const items = (list.body as { data: Array<{ id: string; version: string }> }).data;
    expect(items.some((p) => p.id === 'standalone-g1' && p.version === '1.0.0')).toBe(true);
    // چرخهٔ کامل: هدف → تجویز (دانش‌آموز seed) → مأموریت → لینک → start → next-item
    const goal = await mgr.post('/api/games/goals', {
      id: 'inhibition_sa', title_fa: 'بازداری مستقل', package_id: 'standalone-g1', metric_id: 'accuracy_gonogo'
    });
    expect([200, 201]).toContain(goal.status);
    const rx = await mgr.post('/api/games/prescriptions', {
      child_id: STUDENT1_ID, package_id: 'standalone-g1', package_version: '1.0.0', goal_id: 'inhibition_sa'
    });
    expect(rx.status).toBe(201);
    const rxId = (rx.body as { data: { id: string } }).data.id;
    const mission = await mgr.post('/api/games/missions', {
      prescription_id: rxId, mission_ref: 'sa_m', scheduled_for: tehranTodayYmd()
    });
    expect(mission.status).toBe(201);
    const missionId = (mission.body as { data: { id: string } }).data.id;
    const link = await mgr.post(`/api/games/missions/${missionId}/link`, {});
    expect(link.status).toBe(201); // قرارداد موجود: صدور لینک ۲۰۱ می‌دهد (routes.ts — issueLink)
    const token = (link.body as { data: { url: string } }).data.url.split('/m/')[1];
    expect(token).toBeTruthy();
    const start = await new Api(A).post(`/api/m/${token}/start`);
    expect(start.status).toBe(200);
    const next = await new Api(A).get(`/api/m/${token}/next-item`);
    expect(next.status).toBe(200);
    const nextBody = next.body as { data?: { progress?: { total?: number } } };
    expect(nextBody.data?.progress?.total ?? 0).toBe(3); // train ۱ + probe ۲ — کل زنجیره از بستهٔ مستقل سرو می‌شود
  });
});
