/**
 * rust-f9 — آزمون استقرار سینک در میز (مسیر واقعی api-routing روی MockD1)
 * گیت زمان‌اجرای CENTER_DESKTOP_ENGINE: خاموش → ۴۰۴ کم‌دست (رفتار تولید وب)؛
 * روشن → استقرار فهرست‌سفیدی/idempotent در صندوق ورودی 0110.
 * rust-f12-A — نگاشت نمایشی: payload اطلاعیه پس از استقرار موفق در صندوق، با UPSERT
 * به synced_announcements (0112) هم می‌نشیند؛ بدون title نرم رد می‌شود و صندوق می‌ماند.
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

describe('rust-f12-A — نگاشت نمایشی اطلاعیه‌ها به synced_announcements (0112)', () => {
  let A: TestApp;
  let managerToken: string;

  beforeAll(async () => {
    A = createTestApp(); // مایگریشن‌ها (از جمله 0112) در هارنس خودکار اعمال می‌شوند
    A.env.CENTER_DESKTOP_ENGINE = '1';
    managerToken = await loginToken(A, 'manager');
  });

  const syncedRow = (id: string): Record<string, unknown> | undefined =>
    A.sql.prepare('SELECT * FROM synced_announcements WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  const syncedCount = (): number => Number(A.sql.prepare('SELECT COUNT(*) AS n FROM synced_announcements').get()?.n);

  it('استقرار اطلاعیه → هم ردیف صندوق و هم ردیف synced_announcements با title/body درست', async () => {
    const api = new Api(A).withToken(managerToken);
    const r = await api.post('/api/internal/sync/ingest', {
      items: [item('ann-f12-1', 'announcements', '2026-11-12T10:00:00Z', {
        title: 'خبر مرکز', body: 'متن کامل خبر', created_at: '2026-11-12T08:00:00Z', active: true
      })]
    });
    expect(r.status).toBe(200);
    expect((r.body as { data: { inserted: number } }).data.inserted).toBe(1);
    // ردیف صندوق (transport log) سر جایش است — منبع حقیقت
    const inbox = A.sql.prepare('SELECT * FROM node_sync_inbox WHERE domain = ? AND id = ?')
      .get('announcements', 'ann-f12-1') as Record<string, unknown> | undefined;
    expect(inbox).toBeDefined();
    expect(JSON.parse(inbox?.payload as string)).toMatchObject({ title: 'خبر مرکز' });
    // ردیف نمایشی: title/body درست؛ published_at از created_at پروژektion؛ active=1
    const row = syncedRow('ann-f12-1');
    expect(row).toBeDefined();
    expect(row?.title).toBe('خبر مرکز');
    expect(row?.body).toBe('متن کامل خبر');
    expect(row?.published_at).toBe('2026-11-12T08:00:00Z');
    expect(row?.active).toBe(1);
    expect(typeof row?.received_at).toBe('string');
    expect((row?.received_at as string).length).toBeGreaterThan(0);
  });

  it('استقرار تکراری همان id → duplicates مسیر فعلی و هنوز دقیقاً یک ردیف synced (upsert نه دوبل)', async () => {
    const api = new Api(A).withToken(managerToken);
    const r = await api.post('/api/internal/sync/ingest', {
      items: [item('ann-f12-1', 'announcements', '2026-11-12T10:00:00Z', {
        title: 'خبر مرکز', body: 'متن کامل خبر', created_at: '2026-11-12T08:00:00Z', active: true
      })]
    });
    expect(r.status).toBe(200);
    expect((r.body as { data: { duplicates: number } }).data.duplicates).toBe(1);
    expect(syncedCount()).toBe(1);
    expect(syncedRow('ann-f12-1')?.title).toBe('خبر مرکز');
  });

  it('همان id با payload تازه‌تر → title در synced به‌روز و باز هم دقیقاً یک ردیف', async () => {
    const api = new Api(A).withToken(managerToken);
    const r = await api.post('/api/internal/sync/ingest', {
      items: [item('ann-f12-1', 'announcements', '2026-11-12T09:00:00Z', {
        title: 'خبر ویرایش‌شده', body: 'متن ویرایش‌شده', created_at: '2026-11-12T08:00:00Z', active: true
      })]
    });
    expect(r.status).toBe(200);
    expect((r.body as { data: { updated: number } }).data.updated).toBe(1);
    expect(syncedCount()).toBe(1);
    const row = syncedRow('ann-f12-1');
    expect(row?.title).toBe('خبر ویرایش‌شده');
    expect(row?.body).toBe('متن ویرایش‌شده');
  });

  it('received_at در هر نگاشت تازه می‌شود (عقب‌کشیده → استقرار دوباره → تازه)', async () => {
    A.sql.prepare('UPDATE synced_announcements SET received_at = ? WHERE id = ?').run('2000-01-01 00:00:00', 'ann-f12-1');
    const api = new Api(A).withToken(managerToken);
    const r = await api.post('/api/internal/sync/ingest', {
      items: [item('ann-f12-1', 'announcements', '2026-11-12T09:00:00Z', {
        title: 'خبر ویرایش‌شده', body: 'متن ویرایش‌شده', created_at: '2026-11-12T08:00:00Z', active: true
      })]
    });
    expect(r.status).toBe(200);
    const row = syncedRow('ann-f12-1');
    expect(row?.received_at).not.toBe('2000-01-01 00:00:00'); // تازه شد — هم‌مُهر اکنون SQLite
    expect(row?.title).toBe('خبر ویرایش‌شده'); // title به‌روز ماند
  });

  it('payload بدون title → صندوق می‌نشیند ولی ردیف synced ساخته نمی‌شود', async () => {
    const api = new Api(A).withToken(managerToken);
    const r = await api.post('/api/internal/sync/ingest', {
      items: [item('ann-f12-2', 'announcements', '2026-11-12T11:00:00Z', { body: 'بی‌عنوان' })]
    });
    expect(r.status).toBe(200);
    expect((r.body as { data: { inserted: number } }).data.inserted).toBe(1); // صندوق دست‌نخورده
    const inbox = A.sql.prepare('SELECT * FROM node_sync_inbox WHERE domain = ? AND id = ?')
      .get('announcements', 'ann-f12-2') as Record<string, unknown> | undefined;
    expect(inbox).toBeDefined();
    expect(syncedRow('ann-f12-2')).toBeUndefined(); // نگاشت نرم رد شد
    expect(syncedCount()).toBe(1); // فقط همان ردیف قبلی
  });

  it('status → فیلد جدید synced_announcements هم‌خوان با COUNT جدول و فیلدهای موجود هم‌قبل', async () => {
    const api = new Api(A).withToken(managerToken);
    const r = await api.get('/api/internal/sync/status');
    expect(r.status).toBe(200);
    const data = (r.body as { data: { total: number; by_domain: Record<string, number>; synced_announcements: number } }).data;
    expect(data.synced_announcements).toBe(1);
    expect(data.synced_announcements).toBe(syncedCount());
    expect(data.by_domain.announcements).toBe(2); // دو آیتم صندوق (یکی بی‌title)
    expect(data.total).toBe(2);
  });

  it('دامنهٔ غیر announcements (library) → رفتار قبلی: صندوق می‌نشیند و شمارش synced تغییری نمی‌کند', async () => {
    const api = new Api(A).withToken(managerToken);
    const r = await api.post('/api/internal/sync/ingest', {
      items: [item('k-f12', 'library', '2026-11-12T12:00:00Z', { kind: 'article', title: 'راهنمای کتابخانه' })]
    });
    expect(r.status).toBe(200);
    expect((r.body as { data: { inserted: number } }).data.inserted).toBe(1);
    const inbox = A.sql.prepare('SELECT * FROM node_sync_inbox WHERE domain = ? AND id = ?')
      .get('library', 'k-f12') as Record<string, unknown> | undefined;
    expect(inbox).toBeDefined(); // مسیر قبلی دست‌نخورده
    expect(syncedCount()).toBe(1); // به جدول نمایشی اطلاعیه‌ها چیزی اضافه نشد
    const st = await api.get('/api/internal/sync/status');
    expect((st.body as { data: { synced_announcements: number } }).data.synced_announcements).toBe(1);
  });
});
