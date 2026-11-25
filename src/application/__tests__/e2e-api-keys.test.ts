/**
 * گیت testing-004 (۱.۲۷.۸۳، sdt160) — شاخهٔ X-Api-Key در authMiddleware سرانجام e2e دارد:
 * کلید معتبر → ۲۰۰ با هویت api-key · باطل‌شده → ۴۰۱ · مالک غیرفعال → ۴۰۱ · کلید بدشکل → ۴۰۱
 * الگو: e2e-auth.test.ts — ردیف api_keys با هارنس seed می‌شود.
 */
import { describe, it, expect, beforeAll } from 'vitest';

const FAKE_CTX = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;
import { hashApiKey } from '@core/auth';
import type { D1Database } from '@cloudflare/workers-types';
import { createTestApp, MANAGER_ID, ALI_ID } from '../../test/harness';

const dbOf = (A: ReturnType<typeof createTestApp>): D1Database => (A.env as unknown as { DB: D1Database }).DB;

/** کلید هم‌قالب looksLikeApiKey: ck_(live|test)_ + ۴۰ نویسهٔ الفبا-رقم */
function makeKeyToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let tail = '';
  for (let i = 0; i < 40; i += 1) tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `ck_test_${tail}`;
}

describe('X-Api-Key — شاخهٔ کلید API (testing-004 — ۱.۲۷.۸۳)', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    A = createTestApp();
  });

  async function seedKey(opts: { role?: string; createdBy?: string; active?: number }): Promise<string> {
    const token = makeKeyToken();
    await dbOf(A).prepare(
      `INSERT INTO api_keys (id, name, prefix, key_hash, role, active, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      crypto.randomUUID(),
      'کلید آزمون',
      token.slice(0, 11),
      await hashApiKey(token),
      opts.role ?? 'secretary',
      opts.active ?? 1,
      opts.createdBy ?? MANAGER_ID
    ).run();
    return token;
  }

  it('کلید معتبر → ۲۰۰ با هویت «کلید: …» و نقش کلید', async () => {
    const token = await seedKey({ role: 'secretary' });
    const res = await A.app.request('/api/me', {}, A.env as never, FAKE_CTX);
    void res;
    const raw = await A.app.request('/api/me', { headers: { 'X-Api-Key': token } }, A.env as never, FAKE_CTX);
    expect(raw.status).toBe(200);
    const body = (await raw.json()) as { data: { role: string; displayName: string } };
    expect(body.data.role).toBe('secretary');
    expect(body.data.displayName).toContain('کلید:');
  });

  it('کلید باطل‌شده → ۴۰۱', async () => {
    const token = await seedKey({ active: 0 });
    const raw = await A.app.request('/api/me', { headers: { 'X-Api-Key': token } }, A.env as never, FAKE_CTX);
    expect(raw.status).toBe(401);
  });

  it('مالک غیرفعال → ۴۰۱ (حتی با کلید فعال)', async () => {
    await dbOf(A).prepare(`UPDATE staff SET active = 0 WHERE id = ?`).bind(ALI_ID).run();
    try {
      const token = await seedKey({ createdBy: ALI_ID });
      const raw = await A.app.request('/api/me', { headers: { 'X-Api-Key': token } }, A.env as never, FAKE_CTX);
      expect(raw.status).toBe(401);
    } finally {
      await dbOf(A).prepare(`UPDATE staff SET active = 1 WHERE id = ?`).bind(ALI_ID).run();
    }
  });

  it('کلید بدشکل → ۴۰۱ (شکل کلید معتبر نیست)', async () => {
    const raw = await A.app.request('/api/me', { headers: { 'X-Api-Key': 'not-a-real-key' } }, A.env as never, FAKE_CTX);
    expect(raw.status).toBe(401);
  });

  it('بدون کلید و بدون توکن → ۴۰۱ (مسیر fallback دست‌نخورده)', async () => {
    const raw = await A.app.request('/api/me', {}, A.env as never, FAKE_CTX);
    expect(raw.status).toBe(401);
  });

  afterAll(() => {
    void A;
  });
});
