/**
 * گیت e2e m6 (۱.۲۵.۴۸) — «امتیاز شناسنامهٔ آیتم» + «برگزیده‌های غنی‌شده»
 * ۱) مولد امتیاز خودِ سامانهٔ کلاینت: فرمول v1، مادی‌سازی idempotent
 * ۲) pull غنی‌شده: طراح/امتیاز/فایل/زیردسته در network_content می‌نشیند
 * ۳) افزودن به بانک کارت با حفظ اثر + دانلود فایل تزریقی
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, MANAGER_ID } from '../../test/harness';
import { createAuditWriter } from '@core/audit';
import { createContentScoreService, computeItemScore, refScoreOf, useScoreOf } from '@domain/content-score';
import { runCpContentCycle } from '@app/cp-content/sync';
import { createNetworkContentService } from '@domain/network-content';

const CFG = {
  cpOrigin: 'https://cp.test',
  cpNodeCode: 'demo-a',
  cpNodeKey: 'k',
  cpSyncStaffId: MANAGER_ID
};

function fetchOk(items: unknown[]) {
  return (async () => new Response(
    JSON.stringify({ data: { server_time: '2026-11-09T10:00:00.000Z', items } }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )) as typeof fetch;
}

function netItem(over: Record<string, unknown> = {}) {
  return {
    id: 'cp-content-cc-00000000-0000-4000-8000-00000000000a',
    kind: 'exercise',
    title: 'کارت تقویت دقت شنیداری',
    summary: 'خلاصهٔ ناشناس',
    body: 'مراحل اجرا…',
    tags: ['worksheet'],
    subcategory: null,
    author_name: 'سمیرا محمدی',
    co_author_name: null,
    file_name: 'dokat.pdf',
    file_size: 2048,
    external_url: null,
    quality: { score: { score: 39, refs: 3, uses: 12, refScore: 15, useScore: 24, formulaVersion: 1, source: 'client', generatedAt: '2026-11-09T08:00:00Z' } },
    status: 'approved',
    source_center_code: 'node-src',
    source_center_name: 'مرکز مبدأ',
    created_at: '2026-11-09T08:00:00.000Z',
    updated_at: '2026-11-09T09:00:00.000Z',
    ...over
  };
}

describe('m6 — امتیاز شناسنامه (مولد خودِ سامانهٔ کلاینت)', () => {
  it('فرمول v1: min(50,refs×5)+min(50,uses×2) با سقف ۱۰۰ و منبع client', () => {
    expect(refScoreOf(6)).toBe(30);
    expect(useScoreOf(10)).toBe(20);
    expect(computeItemScore(6, 10, 'T').score).toBe(50);
    expect(computeItemScore(200, 500, 'T').score).toBe(100);
    expect(computeItemScore(3, 12, 'T')).toMatchObject({ score: 39, refScore: 15, useScore: 24, source: 'client' });
  });

  it('refresh: امتیاز از دادهٔ واقعی مرکز مادی و idempotent می‌شود', async () => {
    const A = createTestApp();
    const svc = createContentScoreService(A.db, createAuditWriter(A.db));
    await A.db.execute("INSERT INTO exercises (id, title, format, published, created_by) VALUES ('ex-t1', 'کارت تست', 'worksheet', 1, ?)", [MANAGER_ID]);
    const r1 = await svc.refresh();
    expect(r1.exercises).toBeGreaterThanOrEqual(1);
    expect(await svc.get('exercises', 'ex-t1')).toMatchObject({ refs: 0, uses: 0, score: 0 });
    await svc.refresh();
    const rows = await A.db.query<{ n: number }>("SELECT COUNT(*) AS n FROM content_score_report WHERE source_id = 'ex-t1'");
    expect(Number(rows[0]?.n ?? 0)).toBe(1);
  });
});

describe('m6 — برگزیده‌های غنی‌شده و افزودن به بانک کارت', () => {
  let A: ReturnType<typeof createTestApp>;
  beforeAll(async () => {
    A = createTestApp();
    await runCpContentCycle({
      db: A.db,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: { child: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }) } as any,
      config: CFG,
      fetchFn: fetchOk([netItem()]),
      minIntervalMs: 0
    });
  });

  it('pull غنی‌شده: طراح + امتیاز + فایل + مرکز مبدأ در network_content می‌نشیند', async () => {
    const row = await A.db.queryOne<{ author_name: string | null; quality: string | null; file_name: string | null; source_center: string | null; active: number }>(
      'SELECT author_name, quality, file_name, source_center, active FROM network_content WHERE id = ?',
      ['cp-content-cc-00000000-0000-4000-8000-00000000000a']
    );
    expect(row?.author_name).toBe('سمیرا محمدی');
    expect(row?.file_name).toBe('dokat.pdf');
    expect(row?.source_center).toBe('مرکز مبدأ');
    expect(row?.active).toBe(1);
    const parsed = JSON.parse(row!.quality ?? '{}') as { score?: { score: number } };
    expect(parsed.score?.score).toBe(39);
  });

  it('فهرست: DTO با طراح و امتیاز + فیلتر origin=cp', async () => {
    const svc = createNetworkContentService({ db: A.db, audit: createAuditWriter(A.db) });
    const list = await svc.list({ origin: 'cp', limit: 10, offset: 0 });
    const item = list.items.find((i) => i.id.endsWith('000a'))!;
    expect(item.authorName).toBe('سمیرا محمدی');
    expect(item.score?.score).toBe(39);
    expect(item.score?.source).toBe('client');
    expect(item.fileName).toBe('dokat.pdf');
  });

  it('افزودن به بانک کارت: کپی با اثر طراح در توضیحات؛ دوباره = خطا؛ غیرکارت = خطا', async () => {
    const svc = createNetworkContentService({ db: A.db, audit: createAuditWriter(A.db) });
    const r = await svc.installFromNetwork({ id: MANAGER_ID }, 'cp-content-cc-00000000-0000-4000-8000-00000000000a');
    expect(r.localExerciseId).toBeTruthy();
    const local = await A.db.queryOne<{ description: string; format: string; source_ref_network: string | null }>(
      'SELECT description, format, source_ref_network FROM exercises WHERE id = ?',
      [r.localExerciseId]
    );
    expect(local?.description).toContain('طراح: سمیرا محمدی');
    expect(local?.description).toContain('کتابخانهٔ شبکه');
    expect(local?.format).toBe('worksheet');
    expect(local?.source_ref_network).toBe('cp-content-cc-00000000-0000-4000-8000-00000000000a');
    await expect(svc.installFromNetwork({ id: MANAGER_ID }, 'cp-content-cc-00000000-0000-4000-8000-00000000000a')).rejects.toThrow();
    await expect(svc.installFromNetwork({ id: MANAGER_ID }, 'cp-content-cc-nonexistent')).rejects.toThrow();
  });

  it('دانلود فایل تزریقی + گیت بایگانی', async () => {
    const svc = createNetworkContentService({
      db: A.db,
      audit: createAuditWriter(A.db),
      fetchCpFile: async () => ({ bytes: new TextEncoder().encode('PDFBYTES').buffer as ArrayBuffer, mime: 'application/pdf' })
    });
    const file = await svc.cpFile('cp-content-cc-00000000-0000-4000-8000-00000000000a');
    expect(new TextDecoder().decode(file!.bytes)).toBe('PDFBYTES');
    // بایگانی از CP → دانلود بسته
    await runCpContentCycle({
      db: A.db,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: { child: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }) } as any,
      config: CFG,
      fetchFn: fetchOk([netItem({ status: 'retired', updated_at: '2026-11-09T11:00:00.000Z' })]),
      minIntervalMs: 0
    });
    await expect(svc.cpFile('cp-content-cc-00000000-0000-4000-8000-00000000000a')).rejects.toThrow();
  });

  it('گیت نقش: درمانگر می‌تواند نصب کند؛ منشی نمی‌تواند', async () => {
    const th = await asRole(A, 'therapist');
    // کارت قبلاً نصب شده — پاسخ خطای منطقی (۴۰۰+) نه ۴۰۳
    const res = await th.post('/api/network-content/cp/cp-content-cc-00000000-0000-4000-8000-00000000000a/install', {});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(403);
    const sec = await asRole(A, 'secretary');
    const denied = await sec.post('/api/network-content/cp/cp-content-cc-00000000-0000-4000-8000-00000000000a/install', {});
    expect(denied.status).toBe(403);
  });
});
