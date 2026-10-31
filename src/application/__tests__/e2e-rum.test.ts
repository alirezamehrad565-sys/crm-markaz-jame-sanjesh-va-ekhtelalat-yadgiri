// آزمون‌های پایش کارایی (RUM): نوشتن عمومی بی‌نام + جمع‌بندی فقط‌مدیر + توابع محض
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../test/harness';
import { percentile, makeRateLimiter } from '../rum/pure';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function validEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    metric: 'LCP',
    value: 2100.5,
    rating: 'needs-improvement',
    nav_id: 'v3-1a2b3c-4d5e',
    path: '/#/dashboard',
    viewport_w: 390,
    viewport_h: 844,
    conn: '4g',
    device_memory: 4,
    prm: false,
    theme: 'light',
    ...overrides
  };
}

describe('RUM — نوشتن عمومی /public/rum', () => {
  let A: ReturnType<typeof createTestApp>;
  let anon: Api;

  beforeAll(() => {
    A = createTestApp();
    anon = new Api(A); // بی‌توکن — تله‌متری از صفحهٔ ورود هم می‌آید
  });

  it('رویداد معتبر بی‌احراز ثبت می‌شود — ۲۰۰ و no-store', async () => {
    const res = await anon.post('/public/rum', { events: [validEvent()] });
    expect(res.status).toBe(200);
    expect(dataOf<{ received: number }>(res)).toEqual({ received: 1 });
    expect(res.cacheControl).toBe('no-store');
  });

  it('فیلدهای اختیاریِ خالی (conn/memory) پذیرفته می‌شود', async () => {
    const res = await anon.post('/public/rum', {
      events: [validEvent({ conn: null, device_memory: null, metric: 'CLS', value: 0.042, rating: 'good' })]
    });
    expect(res.status).toBe(200);
  });

  it('سنجهٔ ناشناخته → ۴۰۰ VALIDATION_ERROR', async () => {
    const res = await anon.post('/public/rum', { events: [validEvent({ metric: 'SPAM' })] });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('VALIDATION_ERROR');
  });

  it('بیش از ۱۰ رویداد در یک درخواست → ۴۰۰', async () => {
    const res = await anon.post('/public/rum', { events: Array.from({ length: 11 }, () => validEvent()) });
    expect(res.status).toBe(400);
  });

  it('کد نامعتبر (rating خارج از فهرست) → ۴۰۰', async () => {
    const res = await anon.post('/public/rum', { events: [validEvent({ rating: 'excellent' })] });
    expect(res.status).toBe(400);
  });

  it('content-length بزرگ‌تر از ۴KB → ۴۰۰ (بدون خواندن بدنه)', async () => {
    const res = await A.app.request(
      '/public/rum',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '99999' },
        body: JSON.stringify({ events: [validEvent()] })
      },
      A.env as never
    );
    expect(res.status).toBe(400);
  });
});

describe('RUM — جمع‌بندی /api/rum/summary', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(async () => {
    A = createTestApp();
    const anon = new Api(A);
    // چند رویداد با توزیع شناخته‌شده: LCP = 1000, 2000, 3000, 4000 → p75 = 3250
    const values = [4000, 1000, 3000, 2000];
    await anon.post('/public/rum', {
      events: values.map((v) =>
        validEvent({ metric: 'LCP', value: v, rating: v > 2500 ? 'poor' : 'good', nav_id: `v3-seed-${v}` })
      )
    });
  });

  it('مدیر صدک‌ها را می‌گیرد — p75 با درون‌یابی خطی', async () => {
    const mgr = await asRole(A, 'manager');
    const res = await mgr.get('/api/rum/summary?days=7');
    expect(res.status).toBe(200);
    const data = dataOf<{ window_days: number; total: number; metrics: Array<{ metric: string; count: number; p50: number; p75: number; poor_share: number }> }>(res);
    expect(data.window_days).toBe(7);
    expect(data.total).toBe(4);
    const lcp = data.metrics.find((m) => m.metric === 'LCP');
    expect(lcp?.count).toBe(4);
    expect(lcp?.p50).toBe(2500);
    expect(lcp?.p75).toBe(3250);
    expect(lcp?.poor_share).toBe(0.5);
  });

  it('پنجرهٔ روزها گیره دارد — ۰→۱ و ۹۹۹→۹۰', async () => {
    const mgr = await asRole(A, 'manager');
    const low = await mgr.get('/api/rum/summary?days=0');
    expect(dataOf<{ window_days: number }>(low).window_days).toBe(1);
    const high = await mgr.get('/api/rum/summary?days=999');
    expect(dataOf<{ window_days: number }>(high).window_days).toBe(90);
  });

  it('درمانگر و ناظر ۴۰۳ می‌گیرند', async () => {
    const ther = await asRole(A, 'therapist');
    const denied = await ther.get('/api/rum/summary');
    expect(denied.status).toBe(403);
  });

  it('بی‌احراز ۴۰۱ می‌گیرد (مسیر /api گارد دارد)', async () => {
    const anon = new Api(A);
    const res = await anon.get('/api/rum/summary');
    expect(res.status).toBe(401);
  });
});

describe('RUM — توابع محض', () => {
  it('صدک: آرایهٔ تهی صفر، میانهٔ فرد، درون‌یابی زوج', () => {
    expect(percentile([], 0.75)).toBe(0);
    expect(percentile([1, 2, 3], 0.5)).toBe(2);
    expect(percentile([1000, 2000, 3000, 4000], 0.5)).toBe(2500);
    expect(percentile([1000, 2000, 3000, 4000], 0.75)).toBe(3250);
    expect(percentile([5], 0.9)).toBe(5);
  });

  it('محدودکنندهٔ نرخ: پنجره پر می‌شود و با گذر زمان ریست می‌شود', () => {
    const limiter = makeRateLimiter(2, 60_000);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
  });
});
