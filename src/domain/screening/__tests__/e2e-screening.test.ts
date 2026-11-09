import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../../test/harness';

interface ScreeningEntryResponse {
  id: string;
  name: string;
  day: string;
  tags: string[];
  birthDate: string | null;
  readinessScore: number | null;
  createdBy: string;
  creatorName: string | null;
}

interface ScreeningStatsResponse {
  total: number;
  normal: number;
  referrals: number;
  referralRate: number;
  noCoop: number;
  noReg: number;
  perTag: { label: string; count: number; kind: string }[];
  byDay: { day: string; count: number }[];
}

const data = <T>(res: { body: unknown }): T => (res.body as { data: T }).data;

const todayYmd = (): string => {
  const t = new Date(Date.now() + 210 * 60_000);
  return t.toISOString().slice(0, 10);
};

const ymdOffset = (n: number): string => {
  const t = new Date(Date.now() + 210 * 60_000 + n * 86_400_000);
  return t.toISOString().slice(0, 10);
};

describe('ماژول سنجش روزانه', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
  });

  it('ثبت توسط منشی — نام + هشتگ‌ها؛ «عادی» بدون برچسب', async () => {
    const res = await sec.post('/api/screening', {
      name: 'آوا محمدی #مهدکودک_ستاره',
      tags: ['مرضیه احمدی']
    });
    expect(res.status).toBe(201);
    const e = data<ScreeningEntryResponse>(res);
    expect(e.name).toBe('آوا محمدی');
    expect(e.day).toBe(todayYmd());
    expect(e.tags).toEqual(['مهدکودک ستاره', 'مرضیه احمدی']);
    expect(e.creatorName).toBe('زهرا کریمی');
  });

  it('ثبت توسط مدیر با برچسب ارجاع + روز مشخص', async () => {
    const res = await mgr.post('/api/screening', {
      name: 'امیرعلی قاسمی',
      tags: ['ارجاع تخصصی بینایی'],
      day: ymdOffset(-1)
    });
    expect(res.status).toBe(201);
    expect(data<ScreeningEntryResponse>(res).day).toBe(ymdOffset(-1));
  });

  it('نام نامعتبر → ۴۰۰', async () => {
    const res = await sec.post('/api/screening', { name: 'س' });
    expect(res.status).toBe(400);
  });

  it('بدون احراز هویت → ۴۰۱ و درمانگر → ۴۰۳ (RBAC نوشتن)', async () => {
    const anon = new Api(A);
    expect((await anon.post('/api/screening', { name: 'بی‌نام تست' })).status).toBe(401);
    const denied = await ali.post('/api/screening', { name: 'دانش‌آموز درمانگر' });
    expect(denied.status).toBe(403);
    expect((await ali.get('/api/screening')).status).toBe(200);
  });

  it('لیست امروز + KPI (عادی/ارجاع/نرخ)', async () => {
    const res = await mgr.get(`/api/screening?from=${todayYmd()}&to=${todayYmd()}`);
    expect(res.status).toBe(200);
    const { entries, stats } = data<{ entries: ScreeningEntryResponse[]; stats: ScreeningStatsResponse }>(res);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(stats.total).toBe(entries.length);
    const isNormal = (e: ScreeningEntryResponse) =>
      !e.tags.some((t) => t.startsWith('ارجاع') || t === 'عدم همکاری' || t === 'نداشتن ثبت‌نام');
    expect(stats.normal).toBe(entries.filter(isNormal).length);
    expect(stats.referrals).toBe(entries.filter((e) => e.tags.some((t) => t.startsWith('ارجاع'))).length);
    expect(stats.referralRate).toBe(Math.round((stats.referrals / stats.total) * 100));
  });

  it('فیلتر برچسب با معنای OR', async () => {
    const res = await sec.get('/api/screening?tag=' + encodeURIComponent('ارجاع تخصصی بینایی,عدم همکاری'));
    expect(res.status).toBe(200);
    const { entries } = data<{ entries: ScreeningEntryResponse[] }>(res);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const e of entries) {
      expect(e.tags.some((t) => ['ارجاع تخصصی بینایی', 'عدم همکاری'].includes(t))).toBe(true);
    }
  });

  it('جستجوی نام (contains)', async () => {
    const res = await mgr.get('/api/screening?q=' + encodeURIComponent('آوا'));
    const { entries } = data<{ entries: ScreeningEntryResponse[] }>(res);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].name).toContain('آوا');
  });

  it('ویرایش برچسب‌ها توسط مدیر + audit', async () => {
    const seed = await sec.post('/api/screening', { name: 'سارا موسوی', day: ymdOffset(-1), tags: ['مهدکودک گلستان'] });
    const id = data<ScreeningEntryResponse>(seed).id;
    const res = await mgr.patch(`/api/screening/${id}`, { tags: ['عدم همکاری', 'زهرا کریمی'] });
    expect(res.status).toBe(200);
    const e = data<ScreeningEntryResponse>(res);
    expect(e.tags).toEqual(['عدم همکاری', 'زهرا کریمی']);

    expect((await mgr.patch(`/api/screening/${id}`, {})).status).toBe(400);
    expect((await ali.patch(`/api/screening/${id}`, { tags: [] })).status).toBe(403);
  });

  it('خلاصهٔ برچسب‌ها — ثابت با kind و آزاد با custom', async () => {
    const seed = await sec.post('/api/screening', { name: 'هستی کریمی', tags: ['مهدکودک ستاره', 'عدم همکاری'] });
    expect(seed.status).toBe(201);

    const res = await mgr.get('/api/screening/tags');
    expect(res.status).toBe(200);
    const tags = data<{ label: string; count: number; kind: string }[]>(res);
    const kg = tags.find((t) => t.label === 'مهدکودک ستاره');
    const coop = tags.find((t) => t.label === 'عدم همکاری');
    expect(kg?.kind).toBe('custom');
    expect(coop?.kind).toBe('status');
    expect((kg?.count ?? 0) >= 1).toBe(true);
  });

  it('حذف توسط منشی + ۴۰۴ بعد از حذف', async () => {
    const created = await sec.post('/api/screening', { name: 'موقت حذفی', day: ymdOffset(-2) });
    const id = data<ScreeningEntryResponse>(created).id;
    expect((await sec.delete(`/api/screening/${id}`)).status).toBe(200);
    const after = await mgr.get(`/api/screening?q=${encodeURIComponent('موقت حذفی')}`);
    expect(data<{ entries: ScreeningEntryResponse[] }>(after).entries).toHaveLength(0);
  });

  it('حذف مورد ناموجود → ۴۰۴', async () => {
    expect((await mgr.delete('/api/screening/00000000-0000-4000-8000-0000000000ff')).status).toBe(404);
  });

  /* —— ۱.۲۵.۵۰ — دو فیلد اختیاری ثبت روزانه: تاریخ تولد + نمرهٔ آمادگی تحصیلی —— */

  it('ثبت با تولد و آمادگی + گردش کامل در لیست', async () => {
    const res = await sec.post('/api/screening', {
      name: 'ننی نیک‌پور #مهدکودک_ستاره',
      birth_date: '2020-03-15',
      readiness_score: 85
    });
    expect(res.status).toBe(201);
    const e = data<ScreeningEntryResponse>(res);
    expect(e.birthDate).toBe('2020-03-15');
    expect(e.readinessScore).toBe(85);

    const list = await mgr.get(`/api/screening?q=${encodeURIComponent('ننی نیک‌پور')}`);
    const found = data<{ entries: ScreeningEntryResponse[] }>(list).entries[0];
    expect(found.birthDate).toBe('2020-03-15');
    expect(found.readinessScore).toBe(85);
  });

  it('بدون فیلدهای اختیاری — null می‌نشیند نه رد شدن', async () => {
    const res = await sec.post('/api/screening', { name: 'بی‌فیلد تستی' });
    expect(res.status).toBe(201);
    const e = data<ScreeningEntryResponse>(res);
    expect(e.birthDate).toBeNull();
    expect(e.readinessScore).toBeNull();
  });

  it('نمرهٔ بیرون از ۰..۱۰۰ و تاریخ بدقالب → ۴۰۰', async () => {
    expect((await sec.post('/api/screening', { name: 'نمرهٔ ۱۰۱', readiness_score: 101 })).status).toBe(400);
    expect((await sec.post('/api/screening', { name: 'نمرهٔ اعشاری', readiness_score: 12.5 })).status).toBe(400);
    expect((await sec.post('/api/screening', { name: 'تاریخ بدقالب', birth_date: '۱۴۰۲/۰۵/۱۲' })).status).toBe(400);
  });

  it('ویرایش تولد/آمادگی + پاک‌کردن با null + ماندن فیلد وقتی undefined است', async () => {
    const seed = await sec.post('/api/screening', {
      name: 'ویرایش‌پذیر فیلدها',
      birth_date: '2019-09-21',
      readiness_score: 70
    });
    const id = data<ScreeningEntryResponse>(seed).id;

    /* فقط برچسب را عوض می‌کنیم — تولد/آمادگی باید دست‌نخورده بماند */
    const tagsOnly = await mgr.patch(`/api/screening/${id}`, { tags: ['عدم همکاری'] });
    expect(data<ScreeningEntryResponse>(tagsOnly).birthDate).toBe('2019-09-21');
    expect(data<ScreeningEntryResponse>(tagsOnly).readinessScore).toBe(70);

    /* آمادگی را ویرایش می‌کنیم */
    const rescored = await mgr.patch(`/api/screening/${id}`, { readiness_score: 92 });
    expect(data<ScreeningEntryResponse>(rescored).readinessScore).toBe(92);
    expect(data<ScreeningEntryResponse>(rescored).birthDate).toBe('2019-09-21');

    /* پچ فقط-null — پاک‌کردن هر دو فیلد */
    const cleared = await mgr.patch(`/api/screening/${id}`, { birth_date: null, readiness_score: null });
    expect(data<ScreeningEntryResponse>(cleared).birthDate).toBeNull();
    expect(data<ScreeningEntryResponse>(cleared).readinessScore).toBeNull();
  });

  it('پچ فقط با فیلدهای تازه (بدون نام/برچسب) مجاز است', async () => {
    const seed = await sec.post('/api/screening', { name: 'فقط تولد' });
    const id = data<ScreeningEntryResponse>(seed).id;
    const res = await mgr.patch(`/api/screening/${id}`, { birth_date: '2021-01-02' });
    expect(res.status).toBe(200);
    expect(data<ScreeningEntryResponse>(res).birthDate).toBe('2021-01-02');
  });
});
