/**
 * تست‌های e2e — screening-goal
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-screening-goal.test.ts — شاخص سنجش (تنظیمات) + گزارش کوتاه/تحقق هدفگذاری داشبورد
// مسیر کامل: PUT /api/settings (فقط مدیر) → ثبت سنجش → GET /api/dashboard/screening-goal

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../../test/harness';
import { toJalaliParts, tehranTodayYmd, jalaliToGregorianYmd } from '@core/shared';

const data = <T>(res: { body: unknown }): T => (res.body as { data: T }).data;

describe('شاخص سنجش و تحقق هدفگذاری', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;

  const today = tehranTodayYmd();
  const [gy, gm, gd] = today.split('-').map(Number);
  const j = toJalaliParts(gy, gm, gd);

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
  });

  it('بدون هدفگذاری → target=null و بدون سنجش → referralRate=null', async () => {
    const res = await mgr.get('/api/dashboard/screening-goal');
    expect(res.status).toBe(200);
    const goal = data<Record<string, unknown>>(res);
    expect(goal.target).toBeNull();
    expect(goal.targetPercent).toBeNull();
    expect(goal.referralRate).toBeNull();
    expect(goal.jalaliYear).toBe(j.jy);
    expect(goal.yearDone).toBe(0);
    expect(Array.isArray(goal.months)).toBe(true);
    // تا ماه جاری ماه‌ها ساخته شده‌اند
    expect((goal.months as unknown[]).length).toBe(j.jm);
  });

  it('ذخیرهٔ شاخص سنجش فقط توسط مدیر + خواندن از GET /api/settings', async () => {
    expect((await sec.put('/api/settings', { screening_targets: [{ year: j.jy, month: null, target: 400 }] })).status).toBe(403);

    const res = await mgr.put('/api/settings', { screening_targets: [{ year: j.jy, month: null, target: 400 }] });
    expect(res.status).toBe(200);
    const settings = data<{ screeningTargets: { year: number; month: number | null; target: number }[] }>(res);
    expect(settings.screeningTargets).toEqual([{ year: j.jy, month: null, target: 400 }]);
  });

  it('اعتبارسنجی: هدف صفر / ماه نامعتبر / سال خارج بازه → ۴۰۰', async () => {
    expect((await mgr.put('/api/settings', { screening_targets: [{ year: j.jy, month: null, target: 0 }] })).status).toBe(400);
    expect((await mgr.put('/api/settings', { screening_targets: [{ year: j.jy, month: 13, target: 10 }] })).status).toBe(400);
    expect((await mgr.put('/api/settings', { screening_targets: [{ year: 1200, month: null, target: 10 }] })).status).toBe(400);
  });

  it('ثبت سنجش امروز (عادی + ارجاع) در KPI هدفگذاری منعکس می‌شود', async () => {
    expect((await sec.post('/api/screening', { name: 'آوا تستی', tags: ['مهدکودک ستاره'] })).status).toBe(201);
    expect((await mgr.post('/api/screening', { name: 'امیر تستی', tags: ['ارجاع تخصصی بینایی'] })).status).toBe(201);

    const res = await mgr.get('/api/dashboard/screening-goal');
    expect(res.status).toBe(200);
    const goal = data<{
      todayCount: number;
      weekCount: number;
      monthCount: number;
      yearDone: number;
      yearNormal: number;
      yearReferrals: number;
      referralRate: number | null;
      target: number | null;
      targetPercent: number | null;
      targetRemaining: number | null;
      monthlyTarget: number | null;
      months: { month: number; done: number }[];
    }>(res);

    // برچسب آزاد «مهدکودک ستاره» عادی را کم نمی‌کند (قاعدهٔ )
    expect(goal.todayCount).toBe(2);
    expect(goal.weekCount).toBe(2);
    expect(goal.monthCount).toBe(2);
    expect(goal.yearDone).toBe(2);
    expect(goal.yearNormal).toBe(1);
    expect(goal.yearReferrals).toBe(1);
    expect(goal.referralRate).toBe(50);

    // تحقق هدف: ۲ از ۴۰۰ → ۱٪ (round) و باقی‌مانده ۳۹۸
    expect(goal.target).toBe(400);
    expect(goal.targetPercent).toBe(Math.round((goal.yearDone / 400) * 100));
    expect(goal.targetRemaining).toBe(400 - goal.yearDone);
    // هدف ماه تنظیم نشده → null ولی monthlyDone = ۲
    expect(goal.monthlyTarget).toBeNull();
    const cur = goal.months.find((m) => m.month === j.jm);
    expect(cur?.done).toBe(2);
  });

  it('هدف ماه جاری جداگانه در monthlyTarget ظاهر می‌شود', async () => {
    const put = await mgr.put('/api/settings', {
      screening_targets: [
        { year: j.jy, month: null, target: 400 },
        { year: j.jy, month: j.jm, target: 30 }
      ]
    });
    expect(put.status).toBe(200);

    const goal = data<{ monthlyTarget: number | null; monthlyDone: number }>(
      await mgr.get('/api/dashboard/screening-goal')
    );
    expect(goal.monthlyTarget).toBe(30);
    expect(goal.monthlyDone).toBe(2);
  });

  it('سنجش‌های سال قبل در سال جاری جمع نمی‌شوند', async () => {
    // روزی قطعاً قبل از ابتدای سال شمسی جاری (۳۷۰ روز عقب)
    const prevYearDay = new Date(Date.now() + 210 * 60_000 - 370 * 86_400_000).toISOString().slice(0, 10);
    const res = await mgr.post('/api/screening', { name: 'قدیمی تستی', tags: [], day: prevYearDay });
    expect(res.status).toBe(201);

    const goal = data<{ yearDone: number; todayCount: number }>(
      await mgr.get('/api/dashboard/screening-goal')
    );
    expect(goal.yearDone).toBe(2); // هنوز همان دو سنجش امروز
    expect(goal.todayCount).toBe(2);
  });
});

// ───────────── بازهٔ سفارشی + اهداف همزمان ─────────────

describe('بازهٔ زمانی سفارشی و چند هدف همزمان', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;

  const today = tehranTodayYmd();
  const [gy, gm, gd] = today.split('-').map(Number);
  const j = toJalaliParts(gy, gm, gd);

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
  });

  it('ذخیرهٔ سه هدف همزمان (سال + ماه + بازهٔ سفارشی همپوشان) و محاسبهٔ مستقل هرکدام', async () => {
    const monthStart = jalaliToGregorianYmd(j.jy, j.jm, 1);
    const put = await mgr.put('/api/settings', {
      screening_targets: [
        { year: j.jy, month: null, target: 400, title: 'هدف کل سال' },
        { year: j.jy, month: j.jm, target: 50, title: 'هدف ماه جاری' },
        { year: j.jy, month: null, target: 30, title: 'کمپین این ماه', from: monthStart, to: today }
      ]
    });
    expect(put.status).toBe(200);
    const saved = data<{ screeningTargets: { title: string | null; from: string | null; to: string | null }[] }>(put);
    expect(saved.screeningTargets[2]).toEqual({ title: 'کمپین این ماه', from: monthStart, to: today, year: j.jy, month: null, target: 30 });

    const goal = data<{ goals: { key: string; mode: string; title: string | null; periodLabel: string; fromYmd: string; toYmd: string; target: number; done: number; percent: number; remaining: number; status: string }[] }>(
      await mgr.get('/api/dashboard/screening-goal')
    );
    expect(goal.goals.length).toBe(3);
    const custom = goal.goals.find((g) => g.mode === 'custom');
    expect(custom).toBeTruthy();
    expect(custom!.fromYmd).toBe(monthStart);
    expect(custom!.toYmd).toBe(today);
    expect(custom!.done).toBe(0);
    expect(custom!.status).toBe('active');
    expect(custom!.periodLabel).toContain('کمپین این ماه');
  });

  it('ثبت سنجش امروز → همهٔ اهداف فعالِ شامل امروز همزمان به‌روز می‌شوند', async () => {
    expect((await mgr.post('/api/screening', { name: 'م۷۱ تستی', tags: [] })).status).toBe(201);

    const goal = data<{ goals: { mode: string; done: number; percent: number; remaining: number; status: string }[]; yearDone: number }>(
      await mgr.get('/api/dashboard/screening-goal')
    );
    const year = goal.goals.find((g) => g.mode === 'year');
    const month = goal.goals.find((g) => g.mode === 'month');
    const custom = goal.goals.find((g) => g.mode === 'custom');
    expect(year!.done).toBe(1);
    expect(month!.done).toBe(1);
    expect(custom!.done).toBe(1);
    expect(month!.percent).toBe(Math.round((1 / 50) * 100));
    expect(custom!.remaining).toBe(29);
  });

  it('هدف آینده → status=upcoming و past جدا محاسبه می‌شود', async () => {
    const put = await mgr.put('/api/settings', {
      screening_targets: [
        { year: j.jy, month: null, target: 400, title: 'هدف کل سال' },
        { year: j.jy + 1, month: null, target: 500, title: 'هدف سال بعد' }
      ]
    });
    expect(put.status).toBe(200);
    const goal = data<{ goals: { mode: string; title: string | null; status: string; done: number }[] }>(
      await mgr.get('/api/dashboard/screening-goal')
    );
    const upcoming = goal.goals.find((g) => g.title === 'هدف کل سال');
    const nextYear = goal.goals.find((g) => g.title === 'هدف سال بعد');
    expect(upcoming!.status).toBe('active');
    expect(nextYear!.status).toBe('upcoming');
    expect(nextYear!.done).toBe(0);
  });

  it('اعتبارسنجی: از/تا ناقص → ۴۰۰؛ از > تا → ۴۰۰؛ سفارشی همراه ماه → ۴۰۰', async () => {
    const monthStart = jalaliToGregorianYmd(j.jy, j.jm, 1);
    expect((await mgr.put('/api/settings', { screening_targets: [{ year: j.jy, month: null, target: 10, from: monthStart }] })).status).toBe(400);
    expect((await mgr.put('/api/settings', { screening_targets: [{ year: j.jy, month: null, target: 10, from: today, to: monthStart }] })).status).toBe(400);
    expect((await mgr.put('/api/settings', { screening_targets: [{ year: j.jy, month: j.jm, target: 10, from: monthStart, to: today }] })).status).toBe(400);
  });
});
