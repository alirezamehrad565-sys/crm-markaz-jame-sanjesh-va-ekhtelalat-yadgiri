// آزمون e2e ۱.۲۷.۱۶ — خواست کارفرما: فلوی ویرایش سوابق سنجش روزانه.
// سرور از همیشه dayِ گذشته را می‌پذیرد (قالب معتبر کافی است) و PATCH/DELETE بدون محدودیت
// روز است — این آزمون قرارداد را قفل می‌کند تا فلوی «روز قبل» UI هرگز به دیوار نخورد:
// ثبت در روزِ گذشته → فهرست همان روز → ویرایش برچسب‌ها/جزئیات → حذف.
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole } from '../../test/harness';
import { tehranTodayYmd, addDaysYmd } from '@core/shared';

let manager: Api;

beforeAll(async () => {
  const A = createTestApp();
  manager = await asRole(A, 'manager');
});

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('سنجش روزانه — فلوی سوابق روزهای گذشته (۱.۲۷.۱۶)', () => {
  it('ثبت در روزِ گذشته ۲۰۱ است و در فهرست همان روز می‌آید', async () => {
    const yesterday = addDaysYmd(tehranTodayYmd(), -1);
    const res = await manager.post('/api/screening', {
      name: 'آوا محمدی',
      tags: ['ارجاع هوش'],
      day: yesterday,
      readiness_score: 27,
      note: 'ثبت جاافتادهٔ دیروز'
    });
    expect(res.status).toBe(201);
    const entry = dataOf<{ id: string; day: string; tags: string[]; note: string | null }>(res);
    expect(entry.day).toBe(yesterday);
    expect(entry.tags).toContain('ارجاع هوش');
    expect(entry.note).toBe('ثبت جاافتادهٔ دیروز');

    const list = await manager.get(`/api/screening?from=${yesterday}&to=${yesterday}`);
    expect(list.status).toBe(200);
    const items = dataOf<{ entries: Array<{ id: string; day: string }> }>(list).entries;
    expect(items.some((e) => e.id === entry.id)).toBe(true);
  });

  it('ویرایش سابقهٔ روزِ گذشته (PATCH) ۲۰۰ است — برچسب/جزئیات اصلاح می‌شود', async () => {
    const yesterday = addDaysYmd(tehranTodayYmd(), -1);
    const created = await manager.post('/api/screening', { name: 'سینا رضایی', tags: [], day: yesterday });
    expect(created.status).toBe(201);
    const id = dataOf<{ id: string }>(created).id;

    const patched = await manager.patch(`/api/screening/${id}`, {
      tags: ['ارجاع هوش'],
      note: 'اشتباه ثبت شد — ارجاع هوش بود',
      readiness_score: 22
    });
    expect(patched.status).toBe(200);
    const after = dataOf<{ id: string; tags: string[]; note: string | null; readinessScore: number | null }>(patched);
    expect(after.id).toBe(id);
    expect(after.tags).toContain('ارجاع هوش');
    expect(after.note).toBe('اشتباه ثبت شد — ارجاع هوش بود');
    expect(after.readinessScore).toBe(22);
  });

  it('حذف سابقهٔ روزِ گذشته (DELETE) ۲۰۴ است و از فهرست روز می‌افتد', async () => {
    const yesterday = addDaysYmd(tehranTodayYmd(), -1);
    const created = await manager.post('/api/screening', { name: 'نیما احمدی', tags: ['ارجاع تخصصی بینایی'], day: yesterday });
    const id = dataOf<{ id: string }>(created).id;
    const del = await manager.delete(`/api/screening/${id}`);
    expect(del.status).toBe(200); // قرارداد این ماژول: { data: { ok: true } } با ۲۰۰

    const list = await manager.get(`/api/screening?from=${yesterday}&to=${yesterday}`);
    const items = dataOf<{ entries: Array<{ id: string }> }>(list).entries;
    expect(items.some((e) => e.id === id)).toBe(false);
  });

  it('ثبت با dayِ بدشکل ۴۰۰ است (هم‌قرارداد قبل)', async () => {
    expect((await manager.post('/api/screening', { name: 'آوا محمدی', tags: [], day: '2026/10/12' })).status).toBe(400);
  });
});
