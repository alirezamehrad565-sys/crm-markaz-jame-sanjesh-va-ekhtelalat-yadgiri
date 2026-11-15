// آزمون‌های پنل سلامت (۱.۲۵.۶۷ — ف۱ طرح ارتقا، CP-2/CP-3):
// GET /api/health/panel فقط‌مدیر · شکل قرارداد · مُهرها → وضعیت درگاه‌ها · degraded بی‌صدا
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api, silentLogger } from '../../test/harness';
import { createDb } from '@core/db';
import { createHealthService } from '../health/service';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('پنل سلامت — GET /api/health/panel (فقط‌مدیر)', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    A = createTestApp();
  });

  it('مدیر ۲۰۰ می‌گیرد: نسخه، D1 سالم، شش درگاه CP با قرارداد کامل', async () => {
    const mgr = await asRole(A, 'manager');
    const res = await mgr.get('/api/health/panel');
    expect(res.status).toBe(200);
    expect(res.cacheControl).toBe('no-store');
    const d = dataOf<{
      version: string; env: string | null; now: string;
      db: { ok: boolean; latency_ms: number | null };
      migrations: { applied: number | null };
      counts: { client_errors_24h: number | null; rum_events_24h: number | null; bug_reports_open: number | null };
      cp_link: { configured: boolean; channels: Array<{ key: string; state: string; threshold_s: number; age_s: number | null }> };
    }>(res);
    expect(d.version).toBeTruthy();
    expect(d.db.ok).toBe(true);
    expect(d.db.latency_ms).toBeGreaterThanOrEqual(0);
    expect(d.counts.client_errors_24h).toBe(0);
    expect(d.counts.rum_events_24h).toBe(0);
    expect(d.counts.bug_reports_open).toBe(0);
    // هارنس بدون env CP → خاموش کامل، ولی شش درگاه با قرارداد کامل برمی‌گردد
    expect(d.cp_link.configured).toBe(false);
    expect(d.cp_link.channels).toHaveLength(6);
    expect(d.cp_link.channels.map((c) => c.key)).toEqual([
      'announcements', 'kpi_report', 'content_push', 'content_pull', 'bug_forward', 'bug_replies'
    ]);
    expect(d.cp_link.channels.every((c) => c.state === 'never')).toBe(true);
    expect(d.cp_link.channels.every((c) => c.threshold_s > 0)).toBe(true);
  });

  it('درمانگر ۴۰۳ و بی‌احراز ۴۰۱ می‌گیرد', async () => {
    const ther = await asRole(A, 'therapist');
    expect((await ther.get('/api/health/panel')).status).toBe(403);
    expect((await new Api(A).get('/api/health/panel')).status).toBe(401);
  });
});

describe('پنل سلامت — مُهرها → وضعیت درگاه‌ها و degraded بی‌صدا', () => {
  it('با env CP کامل و مُهر تازه، درگاه announcements حالت ok می‌گیرد؛ مُهر کهنه → stale', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const fresh = new Date(Date.now() - 10 * 60_000).toISOString();
    const stale = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await db.execute(
      `INSERT INTO settings (key, value, updated_by, updated_at) VALUES
         ('cp_sync.last_sync_at', ?, 'test', ?),
         ('cp_sync.last_attempt_at', ?, 'test', ?),
         ('cp_content.last_sync_at', ?, 'test', ?)`,
      [JSON.stringify(fresh), fresh, JSON.stringify(fresh), fresh, JSON.stringify(stale), stale]
    );
    const svc = createHealthService({ db, cpConfigured: true, envName: 'test' });
    const d = await svc.panel();
    expect(d.env).toBe('test');
    const ann = d.cp_link.channels.find((c) => c.key === 'announcements');
    const pull = d.cp_link.channels.find((c) => c.key === 'content_pull');
    expect(ann?.state).toBe('ok');
    expect(ann?.age_s).not.toBeNull();
    expect(ann?.age_s ?? 0).toBeLessThan(3600);
    expect(pull?.state).toBe('stale'); // ده روز بی‌موفقیت از آستانهٔ ۶ساعته گذشته
    expect(pull?.age_s ?? 0).toBeGreaterThan(6 * 3600);
    // درگاه بی‌مُهر → never
    const kpi = d.cp_link.channels.find((c) => c.key === 'kpi_report');
    expect(kpi?.state).toBe('never');
  });

  it('config خاموش → همهٔ درگاه‌ها never با مُهرهای پوچ (kill switch معکوس در پنل هم رعایت شود)', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const fresh = new Date().toISOString();
    await db.execute(
      `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ('cp_sync.last_sync_at', ?, 'test', ?)`,
      [JSON.stringify(fresh), fresh]
    );
    const svc = createHealthService({ db, cpConfigured: false, envName: null });
    const d = await svc.panel();
    expect(d.cp_link.configured).toBe(false);
    expect(d.cp_link.channels.every((c) => c.state === 'never' && c.success_at === null && c.attempt_at === null)).toBe(true);
  });
});
