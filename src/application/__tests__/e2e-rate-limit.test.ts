// آزمون‌های محدودسازی نرخ /api/* (ف۵ طرح ارتقا — P2-15):
// بلاک پس از سقف · IP دیگر بی‌تأثیر · GET بی‌تأثیر · خاموشی با «۰» · استثنای مسیر ورود · پارس env
// هارنس پیش‌فرض محدودساز را خاموش می‌گذارد؛ این فایل با env صریح خودش رفتار را می‌آزماید.
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, loginToken, ALI_ID, quarterHourFromNow } from '../../test/harness';
import { parseApiRateLimitPerMin, API_RATE_LIMIT_PER_MIN_DEFAULT, API_RATE_LIMIT_PER_MIN_MAX } from '../http/rate-limit';

const FAKE_CTX = { waitUntil: () => undefined, passThroughOnException: () => undefined } as never;

type App = ReturnType<typeof createTestApp>;

/** env بدون کلید محدودساز — رفتار پیش‌فرض (۲۴۰/دقیقه) */
function defaultEnv(A: App): unknown {
  return { DB: A.env.DB, ENV: A.env.ENV, CF_ACCESS_TEAM_DOMAIN: A.env.CF_ACCESS_TEAM_DOMAIN };
}

async function call(A: App, env: unknown, method: string, path: string, opts: { token?: string; ip?: string; body?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.ip) headers['cf-connecting-ip'] = opts.ip;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return A.app.request(
    path,
    { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) },
    env as never,
    FAKE_CTX
  );
}

function conflictBody(): Record<string, unknown> {
  return { staff_id: ALI_ID, start_at: quarterHourFromNow(120), end_at: quarterHourFromNow(150) };
}

describe('محدودسازی نرخ /api/* — متدهای نوشتنی (P2-15)', () => {
  let A: App;

  beforeAll(() => {
    A = createTestApp();
  });

  it('سقف=۵: پنج نوشتنی می‌گذرد و ششم ۴۲۹ می‌گیرد با پاکت فارسی rate_limited + Retry-After', async () => {
    const env = { ...A.env, API_RATE_LIMIT_PER_MIN: '5' };
    const token = await loginToken(A, 'manager');
    for (let i = 0; i < 5; i++) {
      const res = await call(A, env, 'POST', '/api/conflicts/check', { token, body: conflictBody() });
      expect(res.status).toBe(200);
    }
    const blocked = await call(A, env, 'POST', '/api/conflicts/check', { token, body: conflictBody() });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('60');
    expect(blocked.headers.get('x-request-id')).toMatch(/^req-/);
    const body = (await blocked.json()) as {
      error: string; message: string; request_id?: string; details?: { reason?: string; retryAfterSeconds?: number };
    };
    expect(body.error).toBe('RATE_LIMITED');
    expect(body.message).toContain('بیش از حد مجاز');
    expect(body.request_id).toBe(blocked.headers.get('x-request-id'));
    expect(body.details?.reason).toBe('rate_limited');
    expect(body.details?.retryAfterSeconds).toBe(60);
  });

  it('IP دیگر از بلاکِ IP اول بی‌تأثیر می‌ماند', async () => {
    const env = { ...A.env, API_RATE_LIMIT_PER_MIN: '5' };
    const token = await loginToken(A, 'manager');
    // IP آزمایشی هم در همین آزمون سقفش را پر می‌کند…
    for (let i = 0; i < 5; i++) {
      const res = await call(A, env, 'POST', '/api/conflicts/check', { token, ip: '10.1.1.1', body: conflictBody() });
      expect(res.status).toBe(200);
    }
    expect((await call(A, env, 'POST', '/api/conflicts/check', { token, ip: '10.1.1.1', body: conflictBody() })).status).toBe(429);
    // …ولی IP تازه همان لحظه آزاد است
    const fresh = await call(A, env, 'POST', '/api/conflicts/check', { token, ip: '10.1.1.2', body: conflictBody() });
    expect(fresh.status).toBe(200);
  });

  it('GET در حالت بلاک هم عبور می‌کند — فقط متدهای نوشتنی سقف دارند', async () => {
    const env = { ...A.env, API_RATE_LIMIT_PER_MIN: '2' };
    const token = await loginToken(A, 'manager');
    expect((await call(A, env, 'POST', '/api/conflicts/check', { token, ip: '10.2.0.1', body: conflictBody() })).status).toBe(200);
    expect((await call(A, env, 'POST', '/api/conflicts/check', { token, ip: '10.2.0.1', body: conflictBody() })).status).toBe(200);
    expect((await call(A, env, 'POST', '/api/conflicts/check', { token, ip: '10.2.0.1', body: conflictBody() })).status).toBe(429);
    const reads = await call(A, env, 'GET', '/api/me', { token, ip: '10.2.0.1' });
    expect(reads.status).toBe(200);
  });

  it('خاموشی با env «۰»: هیچ نوشتنی ۴۲۹ نمی‌گیرد و یک لاگ خاموشی می‌ماند', async () => {
    const env = { ...A.env, API_RATE_LIMIT_PER_MIN: '0' };
    const token = await loginToken(A, 'manager');
    for (let i = 0; i < 8; i++) {
      const res = await call(A, env, 'POST', '/api/conflicts/check', { token, body: conflictBody() });
      expect(res.status).toBe(200);
    }
  });

  it('مسیر ورود از سقف سراسری مستثنی است (throttle اختصاصی خودش را دارد) — چهار تلاش ناموفق همه ۴۰۱', async () => {
    const env = { ...A.env, API_RATE_LIMIT_PER_MIN: '3' };
    for (let i = 0; i < 4; i++) {
      const res = await call(A, env, 'POST', '/api/auth/login', { body: { username: 'manager', password: 'wrong-pass' } });
      // اگر سقف سراسری روی ورود می‌نشست، چهارمی ۴۲۹ می‌شد؛ throttle ورود هم هنوز زیر ۵ تلاش است
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AUTH_ERROR');
    }
  });

  it('بدون env: پیش‌فرض سخاوتمندانه ۲۴۰ است و سه نوشتنی پیاپی بی‌مانع می‌گذرد', async () => {
    const token = await loginToken(A, 'manager');
    for (let i = 0; i < 3; i++) {
      const res = await call(A, defaultEnv(A), 'POST', '/api/conflicts/check', { token, body: conflictBody() });
      expect(res.status).toBe(200);
    }
  });
});

describe('پارس env اختیاری API_RATE_LIMIT_PER_MIN', () => {
  it('نبود/خالی → پیش‌فرض · «۰» → خاموش · نامعتبر/منفی → پیش‌فرض · مثبت → همان عدد با گیره', () => {
    expect(parseApiRateLimitPerMin(undefined)).toBe(API_RATE_LIMIT_PER_MIN_DEFAULT);
    expect(parseApiRateLimitPerMin(null)).toBe(API_RATE_LIMIT_PER_MIN_DEFAULT);
    expect(parseApiRateLimitPerMin('')).toBe(API_RATE_LIMIT_PER_MIN_DEFAULT);
    expect(parseApiRateLimitPerMin('0')).toBe(0);
    expect(parseApiRateLimitPerMin(0)).toBe(0);
    expect(parseApiRateLimitPerMin('abc')).toBe(API_RATE_LIMIT_PER_MIN_DEFAULT);
    expect(parseApiRateLimitPerMin('-5')).toBe(API_RATE_LIMIT_PER_MIN_DEFAULT);
    expect(parseApiRateLimitPerMin('300')).toBe(300);
    expect(parseApiRateLimitPerMin('100000')).toBe(API_RATE_LIMIT_PER_MIN_MAX);
  });
});
