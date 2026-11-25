/**
 * گیت testing-003 (۱.۲۷.۸۳، sdt160) — قرارداد MockD1 با D1 واقعی:
 * ① پسوند RETURNING سطر برمی‌گرداند (pruneOld-style در تست هم حقیقی می‌شمارد)
 * ② bind بولی همان‌طور که D1 رد می‌کند رد می‌شود (نه تبدیل بی‌صدای 1/0)
 * ③ batch نتیجهٔ هر جمله را جدا برمی‌گرداند (parity از ۱.۲۷.۷۹ پابرجاست)
 */
import { describe, it, expect } from 'vitest';
import { MockD1, DatabaseSync } from '../mock-d1';

function freshDb(): MockD1 {
  const store = new DatabaseSync(':memory:');
  store.exec(`CREATE TABLE client_errors (
    id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, message TEXT NOT NULL)`);
  store.exec(`INSERT INTO client_errors VALUES ('old-1','2026-01-01 00:00:00','a'), ('old-2','2026-01-02 00:00:00','b'), ('new-1','2026-12-01 00:00:00','c')`);
  return new MockD1(store);
}

describe('قرارداد MockD1 با D1 واقعی (testing-003 — ۱.۲۷.۸۳)', () => {
  it('DELETE … RETURNING سطرهای حذف‌شده را برمی‌گرداند — شمارش pruneOld حقیقی می‌شود', async () => {
    const db = freshDb();
    const rows = await db.prepare(`DELETE FROM client_errors WHERE occurred_at < ? RETURNING id`)
      .bind('2026-06-01 00:00:00')
      .all<{ id: string }>();
    expect(rows.results.map((r) => r.id).sort()).toEqual(['old-1', 'old-2']);
    const left = await db.prepare(`SELECT COUNT(*) AS n FROM client_errors`).first<{ n: number }>();
    expect(left?.n).toBe(1); // فقط ردیف تازه مانده است
  });

  it('INSERT … RETURNING هم سطر برمی‌گرداند', async () => {
    const db = freshDb();
    const rows = await db.prepare(`INSERT INTO client_errors (id, occurred_at, message) VALUES ('x','2026-06-05 10:00:00','m') RETURNING id`)
      .all<{ id: string }>();
    expect(rows.results[0]?.id).toBe('x');
  });

  it('bind بولی رد می‌شود — همان رفتار D1 واقعی', async () => {
    const db = freshDb();
    await expect(
      db.prepare(`SELECT * FROM client_errors WHERE rowid = ?`).bind(true).all()
    ).rejects.toThrow(/boolean/);
    await expect(
      db.prepare(`SELECT * FROM client_errors WHERE rowid = ?`).bind(false).all()
    ).rejects.toThrow(/boolean/);
  });

  it('batch نتیجهٔ هر جمله را جدا برمی‌گرداند (SELECT + INSERT در یک رفت‌وبرگشت)', async () => {
    const db = freshDb();
    const results = await db.batch([
      db.prepare(`SELECT id FROM client_errors WHERE occurred_at < ?`).bind('2026-06-01 00:00:00'),
      db.prepare(`DELETE FROM client_errors WHERE id = 'new-1'`)
    ]);
    expect(results[0].results).toHaveLength(2);
    expect(results[1].meta.changes).toBe(1);
  });
});
