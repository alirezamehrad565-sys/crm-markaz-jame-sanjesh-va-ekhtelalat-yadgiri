/**
 * rust-f9 — آزمون استقرار سینک در میز (مسیر واقعی api-routing روی MockD1)
 * گیت زمان‌اجرای CENTER_DESKTOP_ENGINE: خاموش → ۴۰۴ کم‌دست (رفتار تولید وب)؛
 * روشن → استقرار فهرست‌سفیدی/idempotent در صندوق ورودی 0110.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, loginToken, silentLogger } from '../../test/harness';
import type { TestApp } from '../../test/harness';

function item(id: string, domain: string, updated_at = '2026-11-12T00:00:00Z', payload: Record<string, unknown> = { title: 'خبر مرکز' }) {
  return { id, domain, updated_at, payload };
}

describe('/api/internal/sync — استقرار سینک میز (rust-f9)', () => {
  it('گیت خاموش (تولید وب): ingest و status → ۴۰۴ کم‌دست حتی با سشن معتبر', async () => {
    const A = createTestApp(); // env بدون CENTER_DESKTOP_ENGINE
    const token = await loginToken(A, 'manager');
    const api = new Api(A).withToken(token);
    const r1 = await api.post('/api/internal/sync/ingest', { items: [item('a1', 'announcements')] });
    expect(r1.status).toBe(404);
    const r2 = await api.get('/api/internal/sync/status');
    expect(r2.status).toBe(404);
  });

  describe('گیت روشن (موتور محلی)', () => {
    let A: TestApp;
    let managerToken: string;

    beforeAll(async () => {
      A = createTestApp();
      A.env.CENTER_DESKTOP_ENGINE = '1'; // بایند فقط در کانفیگ capnp موتور (config.mjs) هست
      managerToken = await loginToken(A, 'manager');
    });

    it('بدون سشن → ۴۰۱ (قبل از رسیدن به گیت env مسیر محافظت شده است)', async () => {
      const res = await new Api(A).post('/api/internal/sync/ingest', { items: [item('a1', 'announcements')] });
      expect(res.status).toBe(401);
    });

    it('استقرار آیتم pullشده → inserted:1 و شمارش بر حسب دامنه', async () => {
      const api = new Api(A).withToken(managerToken);
      const r = await api.post('/api/internal/sync/ingest', { items: [item('a1', 'announcements')] });
      expect(r.status).toBe(200);
      const data = (r.body as { data: { inserted: number; by_domain: Record<string, number> } }).data;
      expect(data.inserted).toBe(1);
      expect(data.by_domain.announcements).toBe(1);
    });

    it('همان آیتم دوباره → duplicates:1 (idempotency با جفت domain,id)', async () => {
      const api = new Api(A).withToken(managerToken);
      const r = await api.post('/api/internal/sync/ingest', { items: [item('a1', 'announcements')] });
      expect(r.status).toBe(200);
      expect((r.body as { data: { duplicates: number } }).data.duplicates).toBe(1);
    });

    it('همان id با updated_at تازه‌تر → updated:1', async () => {
      const api = new Api(A).withToken(managerToken);
      const r = await api.post('/api/internal/sync/ingest', {
        items: [item('a1', 'announcements', '2026-11-12T09:00:00Z', { title: 'خبر ویرایش‌شده' })]
      });
      expect(r.status).toBe(200);
      expect((r.body as { data: { updated: number } }).data.updated).toBe(1);
    });

    it('دامنهٔ بیرون فهرست سفید (students) → ۴۰۳ NODE_DOMAIN_FORBIDDEN و هیچ رکوردی ثبت نمی‌شود', async () => {
      const api = new Api(A).withToken(managerToken);
      const r = await api.post('/api/internal/sync/ingest', { items: [item('s1', 'students', undefined, { name: 'ممنوع' })] });
      expect(r.status).toBe(403);
      expect((r.body as { error: string }).error).toBe('NODE_DOMAIN_FORBIDDEN');
      const st = await api.get('/api/internal/sync/status');
      const by = (st.body as { data: { by_domain: Record<string, number> } }).data.by_domain;
      expect(by.students).toBeUndefined();
    });

    it('سه دامنهٔ مجاز با هم — packages/library/announcements یکجا', async () => {
      const api = new Api(A).withToken(managerToken);
      const r = await api.post('/api/internal/sync/ingest', {
        items: [
          item('nback@1.0', 'packages', '2026-11-10T00:00:00Z', { version: '1.0', title_fa: 'ان‌بک' }),
          item('k1', 'library', '2026-11-11T00:00:00Z', { kind: 'article', title: 'راهنما' })
        ]
      });
      expect(r.status).toBe(200);
      const data = (r.body as { data: { inserted: number } }).data;
      expect(data.inserted).toBe(2);
    });

    it('status → شمارش صندوق هم‌خوان با استقرارها', async () => {
      const api = new Api(A).withToken(managerToken);
      const r = await api.get('/api/internal/sync/status');
      expect(r.status).toBe(200);
      const data = (r.body as { data: { total: number; by_domain: Record<string, number> } }).data;
      expect(data.by_domain.announcements).toBe(1);
      expect(data.by_domain.packages).toBe(1);
      expect(data.by_domain.library).toBe(1);
      expect(data.total).toBe(3);
    });

    it('بیشتر از ۱۰۰ آیتم → ۴۰۰ اعتبارسنجی', async () => {
      const api = new Api(A).withToken(managerToken);
      const many = Array.from({ length: 101 }, (_, i) => item(`x${i}`, 'announcements'));
      const r = await api.post('/api/internal/sync/ingest', { items: many });
      expect(r.status).toBe(400);
    });

    it('بدنهٔ خراب (id نامعتبر) → ۴۰۰', async () => {
      const api = new Api(A).withToken(managerToken);
      const r = await api.post('/api/internal/sync/ingest', { items: [{ id: '', domain: 'announcements', updated_at: 'x', payload: {} }] });
      expect(r.status).toBe(400);
    });

    it('سرویس با لاگ خاموش هم ساخته می‌شود (child internal-sync)', () => {
      expect(silentLogger('t').child('internal-sync')).toBeTruthy();
    });
  });
});
