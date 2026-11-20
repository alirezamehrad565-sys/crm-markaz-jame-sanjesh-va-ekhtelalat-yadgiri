/**
 * rust-f15 — گیت فاز ۶ «نمایش UI اطلاعیه‌های سینک‌شده از synced_announcements»
 * GET /api/internal/sync/announcements (فقط-موتور + سشن کارمند) → فهرست نمایشی
 * جدیدترین اول (بی‌تاریخ‌ها در انتها)؛ وبِ بدون گیت → ۴۰۴ کم‌دست. هم‌الگوی ingest.test.ts.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, loginToken } from '../../test/harness';
import type { TestApp } from '../../test/harness';

function item(id: string, payload: Record<string, unknown>) {
  return { id, domain: 'announcements', updated_at: '2026-11-20T00:00:00Z', payload };
}

describe('/api/internal/sync/announcements — فهرست نمایشی (rust-f15)', () => {
  it('گیت خاموش (تولید وب): → ۴۰۴ کم‌دست حتی با سشن معتبر', async () => {
    const A = createTestApp(); // env بدون CENTER_DESKTOP_ENGINE
    const token = await loginToken(A, 'manager');
    const api = new Api(A).withToken(token);
    const res = await api.get('/api/internal/sync/announcements');
    expect(res.status).toBe(404);
  });

  describe('گیت روشن (موتور محلی)', () => {
    let A: TestApp;
    let managerToken: string;
    let therapistToken: string;

    beforeAll(async () => {
      A = createTestApp();
      A.env.CENTER_DESKTOP_ENGINE = '1';
      managerToken = await loginToken(A, 'manager');
      therapistToken = await loginToken(A, 'maryam'); // درمانگر seed
    });

    it('دو اطلاعیه ingested → هر دو در فهرست؛ جدیدترین انتشار اول و بی‌تاریخ آخر', async () => {
      const api = new Api(A).withToken(managerToken);
      const ing = await api.post('/api/internal/sync/ingest', {
        items: [
          item('a-old', { title: 'جلسهٔ اولیا', body: 'شنبه ساعت ۱۰', published_at: '2026-11-10T08:00:00Z' }),
          item('a-new', { title: 'تعطیلی مرکز', body: 'چهارشنبه', published_at: '2026-11-18T09:00:00Z' }),
          item('a-nodate', { title: 'بدون تاریخ انتشار' })
        ]
      });
      expect(ing.status).toBe(200);

      const res = await api.get('/api/internal/sync/announcements');
      expect(res.status).toBe(200);
      const rows = (res.body as { data: Array<{ id: string; title: string; publishedAt: string | null; active: number }> }).data;
      const ours = rows.filter((r) => r.id.startsWith('a-'));
      expect(ours.length).toBe(3);
      expect(ours.map((r) => r.id)).toEqual(['a-new', 'a-old', 'a-nodate']); // انتشار جدید → قدیم → بی‌تاریخ
      expect(ours[0]).toMatchObject({ title: 'تعطیلی مرکز', body: 'چهارشنبه', active: 1 });
      expect(ours[2].publishedAt).toBeNull();
    });

    it('بدون title در payload → ردیف synced نمی‌سازد ولی صندوق می‌ماند؛ فهرست شاملش نیست', async () => {
      const api = new Api(A).withToken(managerToken);
      const ing = await api.post('/api/internal/sync/ingest', { items: [item('a-empty', { body: 'بدون عنوان' })] });
      expect(ing.status).toBe(200);
      const res = await api.get('/api/internal/sync/announcements');
      const rows = (res.body as { data: Array<{ id: string }> }).data;
      expect(rows.some((r) => r.id === 'a-empty')).toBe(false);
    });

    it('هر نقش کارمندی دسترسی دارد (نمایشی — بدون دادهٔ بالینی)', async () => {
      const api = new Api(A).withToken(therapistToken);
      const res = await api.get('/api/internal/sync/announcements');
      expect(res.status).toBe(200);
    });

    it('بدون سشن → ۴۰۱', async () => {
      const res = await new Api(A).get('/api/internal/sync/announcements');
      expect(res.status).toBe(401);
    });
  });
});
