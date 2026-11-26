/**
 * e2e ۱.۲۷.۷۷ (sdt154) — جستجوی هوشمند دانش‌آموز روی مسیر واقعی API (موج B3 پیام ۱۶):
 * سؤال با صفحه‌کلید عربی/نیم‌فاصله/ارقام فارسی باید همان نتیجهٔ فارسیِ درست را بدهد،
 * نامِ کاملِ چسبیده و نام ولیّ هم جستجو می‌شوند، و wildcard بی‌اثر است (نه صفرِ غلط، نه انفجار الگو).
 * دادهٔ seed هارنس هم در جدول است — اظهارات «شاملِ انتظار»اند نه شمارشِ دقیق کل جدول.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';

describe('GET /api/students?query= — نرمال‌سازی فارسی (۱.۲۷.۷۷-B3)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let ali: { id: string; nationalId: string };
  let storedArabic: { id: string; nationalId: string };
  let karimi: { id: string; nationalId: string };

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    ali = await createStudent(manager, {
      first_name: 'علی',
      last_name: 'رضایی',
      guardian_name: 'زهرا محمدی'
    });
    // رکوردی که خودش با حروف عربی ذخیره شده (دادهٔ واردشده) — ستون هم باید نرمال شود
    storedArabic = await createStudent(manager, { first_name: 'مهدي', last_name: 'نوري' });
    karimi = await createStudent(manager, { first_name: 'سارا', last_name: 'کریمی' });
  });

  const query = async (q: string) => {
    const res = await manager.get(`/api/students?query=${encodeURIComponent(q)}`);
    expect(res.status).toBe(200);
    return res.body as { data: Array<{ id: string; firstName: string }>; meta: { total: number } };
  };

  it('ی عربی در سؤال → «علی رضایی» در نتایج', async () => {
    const r = await query('علي');
    expect(r.data.some((i) => i.id === ali.id)).toBe(true);
  });

  it('نامِ کاملِ چسبیده («علی رض») → «علی رضایی»', async () => {
    const r = await query('علی رض');
    expect(r.data.some((i) => i.id === ali.id)).toBe(true);
  });

  it('ك عربی در سؤال → «کریمی» پیدا می‌شود', async () => {
    const r = await query('كریمی');
    expect(r.data.some((i) => i.id === karimi.id)).toBe(true);
  });

  it('نام ولیّ (عربی و درست) → علی رضایی', async () => {
    const r1 = await query('زهرا');
    expect(r1.data.some((i) => i.id === ali.id)).toBe(true);
    const r2 = await query('محمدي');
    expect(r2.data.some((i) => i.id === ali.id)).toBe(true);
  });

  it('ارقام فارسیِ کد ملی → همان دانش‌آموز', async () => {
    const tail = ali.nationalId.slice(-4);
    const faTail = tail.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
    const r = await query(faTail);
    expect(r.data.some((i) => i.id === ali.id)).toBe(true);
  });

  it('رکوردِ ذخیره‌شده با حروف عربی با سؤالِ درست پیدا می‌شود (نرمال‌شدن ستون)', async () => {
    const r = await query('مهدی');
    expect(r.data.some((i) => i.id === storedArabic.id)).toBe(true);
  });

  it('نیم‌فاصله در سؤال جستجو را نمی‌شکند («رضا‌ایی» با نیم‌فاصله = «رضایی»)', async () => {
    const r = await query(['رض', 'ایی'].join('\u200c'));
    expect(r.data.some((i) => i.id === ali.id)).toBe(true);
  });

  it('wildcard «%» انفجارِ الگو نیست — رفتار «بدون فیلتر» و هر سه رکورد تازه حاضرند', async () => {
    const r = await query('%');
    expect(r.meta.total).toBeGreaterThanOrEqual(3);
    const ids = r.data.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining([ali.id, storedArabic.id, karimi.id]));
  });

  it('جستجوی سراسری هم‌قرارداد است: /api/search?q=علي → گروه دانش‌آموز', async () => {
    const res = await manager.get(`/api/search?q=${encodeURIComponent('علي')}`);
    expect(res.status).toBe(200);
    const body = res.body as { data: { groups: Array<{ type: string; items: Array<{ id: string }> }> } };
    const students = body.data.groups.find((g) => g.type === 'student');
    expect(students?.items.some((i) => i.id === ali.id)).toBe(true);
  });
});
