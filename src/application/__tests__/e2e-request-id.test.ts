// آزمون‌های request-id سراسری (ف۵ طرح ارتقا — P2-13):
// هدر X-Request-Id حاضر و یکتا · پاکت خطا request_id حمل می‌کند · ردیف audit همان درخواست همان شناسه را دارد
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api, loginToken, makeNationalId } from '../../test/harness';
import { createDb } from '@core/db';

const FAKE_CTX = { waitUntil: () => undefined, passThroughOnException: () => undefined } as never;

function envelopeOf(res: { body: unknown }): Record<string, unknown> {
  return res.body as Record<string, unknown>;
}

describe('request-id سراسری — هدر X-Request-Id (P2-13)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
  });

  it('هر پاسخ /api/* هدر X-Request-Id با فرمت req-<uuid> دارد و دو درخواست شناسهٔ متفاوت می‌گیرند', async () => {
    const r1 = await mgr.get('/api/me');
    const r2 = await mgr.get('/api/me');
    expect(r1.status).toBe(200);
    expect(r1.requestId).toMatch(/^req-[0-9a-f-]{36}$/);
    expect(r2.requestId).toMatch(/^req-[0-9a-f-]{36}$/);
    expect(r1.requestId).not.toBe(r2.requestId);
  });

  it('پاکت خطای ۴۰۱ هم request_id همان درخواست را حمل می‌کند (هندلر مرکزی خطا)', async () => {
    const anon = new Api(A);
    const unauth = await anon.get('/api/me'); // بی‌توکن → ۴۰۱ از authMiddleware
    expect(unauth.status).toBe(401);
    const body = envelopeOf(unauth);
    expect(body.error).toBe('AUTH_ERROR');
    expect(body.request_id).toBe(unauth.requestId);
  });

  it('پاکت خطای ۴۰۰ (JSON خراب) هم request_id دارد — حتی وقتی خود مسیر throw می‌کند', async () => {
    const token = await loginToken(A, 'manager');
    const res = await A.app.request(
      '/api/students',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: '{this-is-not-json'
      },
      A.env as never,
      FAKE_CTX
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('INVALID_JSON');
    expect(body.request_id).toBe(res.headers.get('x-request-id'));
    expect(String(body.request_id)).toMatch(/^req-/);
  });

  it('ردیف audit_logِ نوشتنِ درخواست، همان request_id پاسخ را دارد (سیم‌کشی AsyncLocalStorage از اعماق سرویس)', async () => {
    const created = await mgr.post('/api/students', {
      national_id: makeNationalId(),
      first_name: 'ریحانه',
      last_name: 'آزمون-ریپورت-آیدی',
      gender: 'female',
      grade: 'سوم',
      school_id: '10000000-0000-0000-0000-000000000001',
      guardian_name: 'ولی آزمون',
      guardian_relation: 'father',
      guardian_phone: '09121110000'
    });
    expect([200, 201]).toContain(created.status);
    expect(created.requestId).toBeTruthy();

    const db = createDb(A.env.DB as never);
    const row = await db.queryOne<{ request_id: string | null; action: string }>(
      `SELECT request_id, action FROM audit_log WHERE action = 'student.create' ORDER BY rowid DESC LIMIT 1`
    );
    expect(row?.action).toBe('student.create');
    // نویسندهٔ audit سرویس دانش‌آموز چندلایه از میدل‌ور فاصله دارد — ALS باید شناسه را تا آن‌جا برساند
    expect(row?.request_id).toBe(created.requestId);
  });
});
