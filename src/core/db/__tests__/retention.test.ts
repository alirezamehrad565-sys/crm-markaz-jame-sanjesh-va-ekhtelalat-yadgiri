/**
 * گیت data-002/004 (۱.۲۷.۸۳، sdt160) — ماژول نگه‌داری شبانه:
 * ① pruneRowsOlderThan فقط ردیف‌های کهنه‌تر از cutoff را با RETURNING می‌شمارد
 * ② pruneOrphanExerciseChunks فقط chunk یتیمِ پیشوند exercise/ را می‌بُرد —
 *    chunkِ زنده و chunkِ دامنهٔ دیگر (clearbook/*) هر دو سالم می‌مانند
 */
import { describe, it, expect } from 'vitest';
import { MockD1, DatabaseSync } from '../../../test/mock-d1';
import { cutoffIso, cutoffYmd, pruneOrphanExerciseChunks, pruneRowsOlderThan } from '../retention';

/** DbLike کوچک روی MockD1 — همان قرارداد wrapper تولیدی (query) */
function dbLike(d1: MockD1) {
  return {
    query: async <T>(sql: string, params: unknown[] = []) => {
      const res = await d1.prepare(sql).bind(...params).all<T>();
      return res.results;
    }
  };
}

function freshDb(): MockD1 {
  const store = new DatabaseSync(':memory:');
  store.exec(`
    CREATE TABLE exercise_file_chunks (key TEXT, seq INTEGER, content BLOB, PRIMARY KEY (key, seq));
    CREATE TABLE exercise_attachments (id TEXT PRIMARY KEY, exercise_id TEXT, file_key TEXT);
    INSERT INTO exercise_attachments VALUES ('att-1', 'ex-1', 'exercise/ex-1/f-1');
    INSERT INTO exercise_file_chunks VALUES ('exercise/ex-1/f-1', 0, x'41'), ('exercise/ex-1/f-1', 1, x'42');
    INSERT INTO exercise_file_chunks VALUES ('exercise/ex-9/orphan', 0, x'43');
    INSERT INTO exercise_file_chunks VALUES ('clearbook/entry-1/f-1', 0, x'44');
    CREATE TABLE node_push_events (id TEXT PRIMARY KEY, domain TEXT, received_at TEXT NOT NULL);
    INSERT INTO node_push_events VALUES ('old-1','students','2026-01-01 10:00:00'), ('new-1','students','2026-12-01 10:00:00');
    CREATE TABLE quota_usage (day TEXT PRIMARY KEY, tokens INTEGER);
    INSERT INTO quota_usage VALUES ('2025-01-01', 5), ('2026-12-01', 9);
  `);
  return new MockD1(store);
}

describe('نگه‌داری شبانهٔ سیستم (data-002/004 — ۱.۲۷.۸۳)', () => {
  it('pruneRowsOlderThan — فقط ردیف‌های کهنه‌تر از cutoff', async () => {
    const db = dbLike(freshDb());
    expect(await pruneRowsOlderThan(db, 'node_push_events', 'received_at', '2026-06-01 00:00:00')).toBe(1);
    expect(await pruneRowsOlderThan(db, 'quota_usage', 'day', '2026-06-01')).toBe(1);
  });

  it('pruneRowsOlderThan — نام جدول/ستون بیرون الگو رد می‌شود (گارد SQL)', async () => {
    const db = dbLike(freshDb());
    await expect(pruneRowsOlderThan(db, 'node_push_events; DROP TABLE x', 'received_at', '2026-01-01')).rejects.toThrow(/نامعتبر/);
  });

  it('pruneOrphanExerciseChunks — فقط یتیمِ تمرین می‌بُرد؛ زنده و دامنهٔ دیگر سالم', async () => {
    const d1 = freshDb();
    const db = dbLike(d1);
    expect(await pruneOrphanExerciseChunks(db)).toBe(1); // فقط exercise/ex-9/orphan
    const left = await dbLike(d1).query<{ key: string }>(`SELECT DISTINCT key FROM exercise_file_chunks ORDER BY key`);
    expect(left.map((r) => r.key).sort()).toEqual(['clearbook/entry-1/f-1', 'exercise/ex-1/f-1']);
  });

  it('cutoff helpers — قالب‌های ستون‌سازگار', () => {
    expect(cutoffIso(0, Date.UTC(2026, 10, 25, 12, 0, 0))).toBe('2026-11-25 12:00:00');
    expect(cutoffYmd(0, Date.UTC(2026, 10, 25, 12, 0, 0))).toBe('2026-11-25');
  });
});
