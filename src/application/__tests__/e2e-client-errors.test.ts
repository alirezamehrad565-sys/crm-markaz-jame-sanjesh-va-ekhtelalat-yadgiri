// آزمون‌های لولهٔ خطای مرورگر (۱.۲۵.۶۶): نوشتن عمومی بی‌احراز + خواندن فقط‌مدیر + نگه‌داری ۹۰روزه
// زمینه: تا امروز کلاینت به /api/client-errors (مسیرِ موجود نبود) پست می‌کرد و ۴۰۱ می‌گرفت —
// هیچ خطای مرورگری به سرور نمی‌رسید؛ این گیت قرارداد مسیر تازهٔ /public/client-errors را قفل می‌کند
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../test/harness';
import { createDb } from '@core/db';
import { createClientErrorsService } from '../client-errors/service';
import type { Logger } from '@core/logger';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function validError(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    message: 'TypeError: Cannot read properties of undefined (reading "slice")',
    source: 'https://x.test/assets/dist/views/schools.js',
    line: 120,
    col: 35,
    stack: 'TypeError: ...\n    at x (schools.js:1:10841)',
    url: 'https://x.test/#/schools',
    app_version: '1.25.66',
    ...overrides
  };
}

const silentLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger()
} as unknown as Logger);

describe('خطاهای کلاینت — نوشتن عمومی POST /public/client-errors', () => {
  let A: ReturnType<typeof createTestApp>;
  let anon: Api;

  beforeAll(() => {
    A = createTestApp();
    anon = new Api(A); // بی‌توکن — خطاهای صفحهٔ ورود هم باید گزارش شوند
  });

  it('گزارش معتبر بی‌احراز ثبت می‌شود — ۲۰۰ و no-store', async () => {
    const res = await anon.post('/public/client-errors', validError());
    expect(res.status).toBe(200);
    expect(dataOf<{ received: number }>(res).received).toBe(1);
    expect(res.cacheControl).toBe('no-store');
  });

  it('حداقلِ قرارداد: فقط message کافی است — بقیهٔ فیلدها اختیاری/پوچ', async () => {
    const res = await anon.post('/public/client-errors', { message: 'unhandledrejection: boom' });
    expect(res.status).toBe(200);
  });

  it('پیام خالی → ۴۰۰ VALIDATION_ERROR', async () => {
    const res = await anon.post('/public/client-errors', validError({ message: '' }));
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('VALIDATION_ERROR');
  });

  it('line غیرصحیح → ۴۰۰', async () => {
    const res = await anon.post('/public/client-errors', validError({ line: 1.5 }));
    expect(res.status).toBe(400);
  });

  it('stack بیش از ۱۶هزار نویسه → ۴۰۰ (سقف اسکیمای مسیر)', async () => {
    const res = await anon.post('/public/client-errors', validError({ stack: 'x'.repeat(17_000) }));
    expect(res.status).toBe(400);
  });

  it('content-length بزرگ‌تر از ۱۶KB → ۴۰۰ (بدون خواندن بدنه)', async () => {
    const res = await A.app.request(
      '/public/client-errors',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '99999' },
        body: JSON.stringify(validError())
      },
      A.env as never
    );
    expect(res.status).toBe(400);
  });

  it('محدودکنندهٔ نرخ مسیر عمومی: پس از سقف ۶۰ درخواست، ۴۲۹', async () => {
    const B = createTestApp();
    const flood = new Api(B);
    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      const res = await flood.post('/public/client-errors', { message: `flood ${i}` });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe('خطاهای کلاینت — خواندن فقط‌مدیر GET /api/client-errors', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(async () => {
    A = createTestApp();
    const anon = new Api(A);
    await anon.post('/public/client-errors', validError({ message: 'خطای اول' }));
    await anon.post('/public/client-errors', validError({ message: 'خطای دوم', app_version: '1.25.65' }));
  });

  it('مدیر ردیف‌ها را تازه‌ترین‌اول می‌گیرد + پنجره/سقف گیره دارد', async () => {
    const mgr = await asRole(A, 'manager');
    const res = await mgr.get('/api/client-errors?days=7&limit=50');
    expect(res.status).toBe(200);
    const data = dataOf<{ window_days: number; total: number; errors: Array<{ message: string; app_version: string | null }> }>(res);
    expect(data.window_days).toBe(7);
    expect(data.total).toBe(2);
    expect(data.errors[0]?.message).toBe('خطای دوم');
    expect(data.errors[1]?.app_version).toBe('1.25.66');
    const clamped = await mgr.get('/api/client-errors?days=999&limit=9999');
    expect(dataOf<{ window_days: number }>(clamped).window_days).toBe(90);
  });

  it('پنجرهٔ غایب → پیش‌فرض ۷ روز', async () => {
    const mgr = await asRole(A, 'manager');
    const res = await mgr.get('/api/client-errors');
    expect(dataOf<{ window_days: number }>(res).window_days).toBe(7);
  });

  it('درمانگر ۴۰۳ می‌گیرد', async () => {
    const ther = await asRole(A, 'therapist');
    expect((await ther.get('/api/client-errors')).status).toBe(403);
  });

  it('بی‌احراز ۴۰۱ می‌گیرد (مسیر /api گارد دارد)', async () => {
    const anon = new Api(A);
    expect((await anon.get('/api/client-errors')).status).toBe(401);
  });
});

describe('خطاهای کلاینت — برش دفاعی و نگه‌داری سرویس', () => {
  it('رشته‌های بلند پیش از ذخیره به قرارداد ستون‌ها بریده می‌شوند', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const svc = createClientErrorsService({ db, logger: silentLogger() });
    await svc.record({ message: 'm'.repeat(5000), stack: 's'.repeat(50_000), url: 'u'.repeat(5000), app_version: 'v'.repeat(100) });
    const win = await svc.recent(7, 10);
    const row = win.errors[0];
    expect(row?.message.length).toBe(500);
    expect(row?.stack?.length).toBe(2000);
    expect(row?.url?.length).toBe(300);
    expect(row?.app_version?.length).toBe(20);
  });

  it('pruneOld ردیف‌های کهنه‌تر از ۹۰ روز را حذف می‌کند و تازه‌ها می‌مانند', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const svc = createClientErrorsService({ db, logger: silentLogger() });
    await svc.record({ message: 'تازه' });
    // ردیف کهنه — مستقیم با فرمت هم‌قرارداد datetime('now') جدول 0057، صدروز پیش
    const old = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await db.execute(`INSERT INTO client_errors (id, occurred_at, message) VALUES ('old-1', '${old}', 'کهنه')`);
    await svc.pruneOld();
    const win = await svc.recent(90, 100);
    expect(win.total).toBe(1);
    expect(win.errors[0]?.message).toBe('تازه');
  });
});
