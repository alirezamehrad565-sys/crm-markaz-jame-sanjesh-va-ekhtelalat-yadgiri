/**
 * تست‌های e2e — screening
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-screening.test.ts — سنجش روزانه روی اپ واقعی (هارنس + D1 ماک)
// RBAC (نوشتن فقط دفتر)، CRUD کامل، فیلتر بازه/جستجو/برچسب OR، KPI، خلاصهٔ برچسب‌ها

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../../test/harness';

interface ScreeningEntryResponse {
  id: string;
  name: string;
  day: string;
  tags: string[];
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

/** استخراج data با تایپ — body در JsonOutcome در حالت پیش‌فرض unknown است */
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
    // day پیش‌فرض = امروز تهران
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
    // خواندن برای درمانگر مجاز است
    expect((await ali.get('/api/screening')).status).toBe(200);
  });

  it('لیست امروز + KPI (عادی/ارجاع/نرخ)', async () => {
    const res = await mgr.get(`/api/screening?from=${todayYmd()}&to=${todayYmd()}`);
    expect(res.status).toBe(200);
    const { entries, stats } = data<{ entries: ScreeningEntryResponse[]; stats: ScreeningStatsResponse }>(res);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(stats.total).toBe(entries.length);
    // عادی = بدون برچسب ثابت (برچسب آزاد کارمند/مهدکودک او را از عادی خارج نمی‌کند)
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
    // ردیف مستقل — تست‌ها به ترتیب اجرای همدیگر وابسته نیستند
    const seed = await sec.post('/api/screening', { name: 'سارا موسوی', day: ymdOffset(-1), tags: ['مهدکودک گلستان'] });
    const id = data<ScreeningEntryResponse>(seed).id;
    const res = await mgr.patch(`/api/screening/${id}`, { tags: ['عدم همکاری', 'زهرا کریمی'] });
    expect(res.status).toBe(200);
    const e = data<ScreeningEntryResponse>(res);
    expect(e.tags).toEqual(['عدم همکاری', 'زهرا کریمی']);

    // ویرایش بدون هیچ فیلد → ۴۰۰
    expect((await mgr.patch(`/api/screening/${id}`, {})).status).toBe(400);
    // ویرایش توسط درمانگر → ۴۰۳
    expect((await ali.patch(`/api/screening/${id}`, { tags: [] })).status).toBe(403);
  });

  it('خلاصهٔ برچسب‌ها — ثابت با kind و آزاد با custom', async () => {
    // ردیف تازه با برچسب آزاد + ثابت — تا ویرایش تست‌های قبلی اثر نگذارد
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
});
