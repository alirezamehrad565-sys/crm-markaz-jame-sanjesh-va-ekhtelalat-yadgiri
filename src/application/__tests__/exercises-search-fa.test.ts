/**
 * e2e ۱.۲۷.۷۸ (sdt155) — جستجوی هوشمند بانک کارت‌های آماده روی مسیر واقعی API (موج B2، هم‌الگوی B3):
 * سؤال با صفحه‌کلید عربی/نیم‌فاصله باید همان کارت فارسی را بدهد، description هم جستجو می‌شود،
 * wildcard بی‌اثر است (رفتار «بدون فیلتر») و لیست/شمارش از یک قرارداد مشترک می‌خوانند.
 * دادهٔ seed هارنس هم ممکن است در جدول باشد — اظهارات «شاملِ انتظار»اند نه شمارشِ دقیق کل جدول.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole } from '../../test/harness';

describe('GET /api/exercises?q= — نرمال‌سازی فارسی (۱.۲۷.۷۸-B2)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let breathing: { id: string };
  let storedArabic: { id: string };
  let karimi: { id: string };

  const create = async (body: Record<string, unknown>): Promise<{ id: string }> => {
    const res = await manager.post('/api/exercises', body);
    expect([200, 201]).toContain(res.status);
    const payload = res.body as { data: { id: string } };
    return payload.data;
  };

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    breathing = await create({ title: 'تمرین تنفسی آگاهی', description: 'ریتم نفس برای آرام‌سازی' });
    // کارتی که خودش با حروف عربی ذخیره شده (دادهٔ واردشده) — ستون هم باید نرمال شود؛
    // دو واژهٔ عربی در عنوان مجاورند تا سؤال چندواژه‌ای چسبیده (هم‌قرارداد «نام کامل») را بسنجد
    storedArabic = await create({ title: 'کارت مهدي نوري', description: 'بستهٔ آموزشی' });
    karimi = await create({ title: 'کارت کریمی', description: 'آموزش خانواده' });
  });

  const query = async (q: string) => {
    const res = await manager.get(`/api/exercises?q=${encodeURIComponent(q)}`);
    expect(res.status).toBe(200);
    return res.body as { data: { items: Array<{ id: string }>; total: number } };
  };

  it('ی عربی در سؤال → «تمرین تنفسی آگاهی» در نتایج', async () => {
    const r = await query('تنفسي');
    expect(r.data.items.some((i) => i.id === breathing.id)).toBe(true);
    expect(r.data.total).toBeGreaterThanOrEqual(1);
  });

  it('جستجوی description هم فعال است (ریتم نفس)', async () => {
    const r = await query('آرام‌سازی');
    expect(r.data.items.some((i) => i.id === breathing.id)).toBe(true);
  });

  it('ك عربی در سؤال → «کارت کریمی» پیدا می‌شود', async () => {
    const r = await query('كریمی');
    expect(r.data.items.some((i) => i.id === karimi.id)).toBe(true);
  });

  it('رکوردِ ذخیره‌شده با حروف عربی با سؤالِ درست پیدا می‌شود (نرمال‌شدن ستون، سؤال چسبیده)', async () => {
    const r = await query('مهدی نوری');
    expect(r.data.items.some((i) => i.id === storedArabic.id)).toBe(true);
    const r2 = await query('نوري');
    expect(r2.data.items.some((i) => i.id === storedArabic.id)).toBe(true);
  });

  it('نیم‌فاصله در سؤال جستجو را نمی‌شکند («تنف‌سی» با نیم‌فاصله = «تنفسی»)', async () => {
    const r = await query(['تنف', 'سی'].join('\u200c'));
    expect(r.data.items.some((i) => i.id === breathing.id)).toBe(true);
  });

  it('wildcard «%» انفجارِ الگو نیست — رفتار «بدون فیلتر» و هر سه کارت تازه حاضرند', async () => {
    const r = await query('%');
    expect(r.data.total).toBeGreaterThanOrEqual(3);
    const ids = r.data.items.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining([breathing.id, storedArabic.id, karimi.id]));
  });

  it('لیست و شمارش هم‌قراردادند — total با طول صفحهٔ یکتا برابر است', async () => {
    const r = await query('تنفسي');
    expect(r.data.total).toBe(r.data.items.length);
  });
});
