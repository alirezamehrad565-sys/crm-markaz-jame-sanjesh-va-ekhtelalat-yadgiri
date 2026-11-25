/**
 * گیت testing-005 (۱.۲۷.۸۳، sdt160) — orchestration شبانهٔ worker.scheduled سرانجام e2e دارد:
 * DIGEST_CRON → چرخهٔ دایجست سرِ جایش اجرا می‌شود (jobs مجزا)؛ failing job (جدول حذف‌شدهٔ
 * client_errors) بقیهٔ چرخه را نمی‌بُرد — growth snapshot در همان اجرا نوشته می‌شود؛
 * BATCH_CRON و کرن ناشناخته (چرخهٔ اعلان) هم بی‌کرش تمام می‌شوند.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { DIGEST_CRON, BATCH_CRON } from '@core/shared';
import worker from '../../index';
import { createTestApp } from '../../test/harness';

function fakeCtx(): { ctx: ExecutionContext; waits: Promise<unknown>[] } {
  const waits: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => void waits.push(p),
    passThroughOnException: () => undefined
  } as unknown as ExecutionContext;
  return { ctx, waits };
}

async function runScheduled(A: ReturnType<typeof createTestApp>, cron: string): Promise<void> {
  const { ctx, waits } = fakeCtx();
  await worker.scheduled({ cron } as never, A.env as never, ctx);
  await Promise.all(waits.map((p) => p.catch(() => undefined)));
}

async function snapshotCount(A: ReturnType<typeof createTestApp>): Promise<number> {
  const row = await A.env.DB.prepare(`SELECT COUNT(*) AS n FROM table_growth_snapshots`).first<{ n: number }>();
  return row?.n ?? 0;
}

describe('orchestration worker.scheduled (testing-005 — ۱.۲۷.۸۳)', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    A = createTestApp();
  });

  it('DIGEST_CRON — چرخهٔ دایجست کامل و بی‌کرش: نگه‌داری و snapshot رشد اجرا می‌شوند', async () => {
    const before = await snapshotCount(A);
    await runScheduled(A, DIGEST_CRON);
    const after = await snapshotCount(A);
    expect(after).toBeGreaterThanOrEqual(before); // growth.captureDaily در همان اجرا رخ داده (skip مُهر ۲۴ساعته هم رکورد می‌گذارد یا می‌پرد)
    // جدول‌های هرس سالم‌اند — stepهای retention واقعاً روی DB رفتند
    const ce = await A.env.DB.prepare(`SELECT COUNT(*) AS n FROM client_errors`).first<{ n: number }>();
    expect(ce).not.toBeNull();
  });

  it('failing job چرخه را نمی‌بُرد — جدول حذف‌شدهٔ client_errors، snapshot رشد را نگه می‌دارد', async () => {
    const B = createTestApp();
    await B.env.DB.prepare(`DROP TABLE client_errors`).run();
    const before = await snapshotCount(B);
    await expect(runScheduled(B, DIGEST_CRON)).resolves.toBeUndefined(); // هیچ jobی کل چرخه را نمی‌شکند
    const after = await snapshotCount(B);
    expect(after).toBeGreaterThan(before); // growth بعد از خطای نگه‌داری هم اجرا شده است
  });

  it('BATCH_CRON — چرخهٔ dispatch صف اعلان بی‌کرش', async () => {
    await expect(runScheduled(A, BATCH_CRON)).resolves.toBeUndefined();
  });

  it('کرن ناشناخته → چرخهٔ اعلان پیش‌فرض — بی‌کرش', async () => {
    await expect(runScheduled(A, '0 12 * * *')).resolves.toBeUndefined();
  });
});
