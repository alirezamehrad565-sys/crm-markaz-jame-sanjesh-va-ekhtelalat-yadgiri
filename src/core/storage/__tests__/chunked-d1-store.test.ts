/**
 * واحد ۱.۲۷.۷۹ (sdt156) — ذخیره‌ساز تکه‌ای D1 (بستن performance-001 رجیستری ممیزی):
 * مرز دقیق تکه‌ها، برابری بایتی بازسازی، بازنویسی با تکهٔ کمتر، رفتار کلید ناموجود/حذف تکراری،
 * parity بچ با D1 واقعی، و اظهار ساختاری رفت‌وبرگشت‌ها: نوشتن همه از مسیر transaction→batch
 * می‌گذرد (execute متوالی صفر) و خواندن چندتکه‌ای با بچ بازه‌ای است (query متوالی صفر).
 * اظهارهای ساختاری بر پایهٔ شمارش کوئری‌اند نه سنجهٔ زمان — پایدار در هر ماشینی.
 */
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../../../test/harness';
import { MockD1 } from '../../../test/mock-d1';
import { createDb } from '@core/db';
import type { DbClient } from '@core/db';
import { createChunkedD1ObjectStore } from '../chunked-d1-store';

const CHUNK_BYTES = 1_500_000;

function patterned(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) out[i] = i % 251;
  return out;
}

function expectBytesEqual(a: Uint8Array, b: Uint8Array): void {
  expect(a.length).toBe(b.length);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff += 1;
  expect(diff).toBe(0);
}

/** wrapper شمارندهٔ رفت‌وبرگشت روی DbClient — flush درونِ transaction به این لایه نمی‌رسد */
function counting(db: DbClient): {
  client: DbClient;
  counts: { query: number; queryOne: number; execute: number; batch: number; batchStatements: number };
} {
  const counts = { query: 0, queryOne: 0, execute: 0, batch: 0, batchStatements: 0 };
  const client: DbClient = {
    query: async (sql, params) => {
      counts.query += 1;
      return db.query(sql, params);
    },
    queryOne: async (sql, params) => {
      counts.queryOne += 1;
      return db.queryOne(sql, params);
    },
    execute: async (sql, params) => {
      counts.execute += 1;
      return db.execute(sql, params);
    },
    prepare: (sql, params = []) => db.prepare(sql, params),
    batch: async (stmts) => {
      counts.batch += 1;
      counts.batchStatements += stmts.length;
      return db.batch(stmts);
    },
    transaction: (fn) => db.transaction(fn)
  };
  return { client, counts };
}

async function chunkCount(db: DbClient, key: string): Promise<number> {
  const row = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key = ?`,
    [key]
  );
  return row?.n ?? 0;
}

function setup() {
  const db = createDb(new MockD1(createTestDb()) as unknown as D1Database);
  const store = createChunkedD1ObjectStore(db);
  return { db, store };
}

describe('ذخیره‌ساز تکه‌ای D1 — مرز و بازسازی', () => {
  it('مرز تکه: دقیق CHUNK_BYTES → ۱ تکه؛ +۱ → ۲ تکه؛ ۲×+۱ → ۳ تکه', async () => {
    const { db, store } = setup();
    await store.put('k/1', patterned(CHUNK_BYTES), 'application/pdf');
    expect(await chunkCount(db, 'k/1')).toBe(1);
    await store.put('k/2', patterned(CHUNK_BYTES + 1), 'application/pdf');
    expect(await chunkCount(db, 'k/2')).toBe(2);
    await store.put('k/3', patterned(2 * CHUNK_BYTES + 1), 'application/pdf');
    expect(await chunkCount(db, 'k/3')).toBe(3);
  });

  it('بازسازی بایت‌به‌بایت شیء سه‌تکه‌ای', async () => {
    const { store } = setup();
    const src = patterned(2 * CHUNK_BYTES + 157);
    await store.put('k/p', src, 'application/pdf');
    const got = await store.get('k/p');
    expect(got).not.toBeNull();
    expect(got!.size).toBe(src.length);
    expectBytesEqual(got!.bytes, src);
  });

  it('بازنویسی با تکهٔ کمتر — تکهٔ جامانده نمی‌ماند', async () => {
    const { db, store } = setup();
    await store.put('k/r', patterned(2 * CHUNK_BYTES + 1), 'application/pdf');
    expect(await chunkCount(db, 'k/r')).toBe(3);
    await store.put('k/r', patterned(10), 'application/pdf');
    expect(await chunkCount(db, 'k/r')).toBe(1);
    const got = await store.get('k/r');
    expect(got!.size).toBe(10);
    expect(new TextDecoder().decode(got!.bytes.subarray(0, 10))).toBe(
      new TextDecoder().decode(patterned(10))
    );
  });

  it('کلید ناموجود → null؛ حذف تکراری بی‌خطا و جدول خالی', async () => {
    const { db, store } = setup();
    expect(await store.get('k/nope')).toBeNull();
    await store.put('k/d', patterned(50), 'application/pdf');
    await store.delete('k/d');
    await store.delete('k/d');
    expect(await chunkCount(db, 'k/d')).toBe(0);
    expect(await store.get('k/d')).toBeNull();
  });
});

describe('اثار ساختاری رفت‌وبرگشت (performance-001)', () => {
  it('نوشتن همه از transaction→batch می‌گذرد — execute متوالی صفر', async () => {
    const { db } = setup();
    const { client, counts } = counting(db);
    const store = createChunkedD1ObjectStore(client);
    await store.put('k/w', patterned(2 * CHUNK_BYTES + 1), 'application/pdf'); // ۳ تکه
    expect(counts.execute).toBe(0); // قبلاً ۴ execute متوالی بود (DELETE + ۳ INSERT)
    expect(counts.query).toBe(0);
    expect(counts.batch).toBe(0); // تخلیه درون transaction است — بیرون از wrapper
    expect(await chunkCount(db, 'k/w')).toBe(3); // و داده واقعاً نوشته شده
  });

  it('خواندن هفت‌تکه‌ای با یک بچ بازه‌ای دوصفحه‌ای — query متوالی صفر', async () => {
    const { db, store } = setup();
    const src = patterned(6 * CHUNK_BYTES + 1); // ۷ تکه → ۲ صفحه → یک بچ
    await store.put('k/g', src, 'application/pdf');
    const { client, counts } = counting(db);
    const reader = createChunkedD1ObjectStore(client);
    const got = await reader.get('k/g');
    expect(counts.queryOne).toBe(1); // فقط COUNT
    expect(counts.query).toBe(0); // کوئری متوالی OFFSET حذف شد
    expect(counts.batch).toBe(1);
    expect(counts.batchStatements).toBe(2);
    expect(got!.size).toBe(src.length);
    expectBytesEqual(got!.bytes, src);
  });

  it('parity بچ: MockD1.batch ردیف‌های SELECT را در results برمی‌گرداند (هم‌قرارداد D1)', async () => {
    const { db } = setup();
    await db.execute(
      `INSERT INTO exercise_file_chunks (key, seq, content) VALUES ('px', 0, 'AAA')`
    );
    const res = await db.batch([
      db.prepare(`SELECT seq, content FROM exercise_file_chunks WHERE key = ?`, ['px'])
    ]);
    expect((res[0].results as Array<{ content: string }>)[0]?.content).toBe('AAA');
  });
});
