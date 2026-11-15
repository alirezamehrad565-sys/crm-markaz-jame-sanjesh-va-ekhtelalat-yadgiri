// scripts/engine/adapter/d1.mjs — shim کامل API ـD1 روی node:sqlite (v1.27.03)
//
// زمینه: موتور محلی دسکتاپ از workerd به اجرای in-process باندل‌های همان ورکرها روی Node
// منتقل شد (issueهای باز upstream workerd#4668/#7581 — کرش init ویندوزی؛ گزارش نصاب واقعی
// v1.27.0x). بک‌اند همان Hono + D1 است؛ فقط لایهٔ D1 باید روی node:sqlite بنشیند.
//
// سطح API مصرفی باندل‌ها (پروب worker/bundle.js و worker/games-bundle.js):
//   prepare(...).bind(...).all() / .first(col?) / .run()  ·  batch([...])  ·  exec(sql)
// (raw() مصرف نمی‌شود؛ WebSocket و HTMLRewriter هم در باندل‌ها نیست.)
// نتایج با همان شکل D1 برگردانده می‌شود: { results, success, meta{changes,last_row_id,duration} }.
import { DatabaseSync } from 'node:sqlite';

/** سطح مجاز کش PrepareStatement — سقف ساده؛ عبور از آن = تخلیهٔ کامل (دسکتاپ تک‌کاربره) */
const PREP_CACHE_MAX = 400;

/**
 * یک نمونهٔ D1-سازگار روی فایل SQLite مشخص می‌سازد.
 * همان فایلِ پشتهٔ D1 موتور محلی باز می‌شود (d1SqlitePath — چیدمان عین miniflare)؛
 * پس دادهٔ نصب کارفرما بدون هیچ تبدیلی حفظ می‌ماند.
 */
export function makeD1(dbPath, { log } = {}) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  // حالت journal فایل را همان‌طور که workerd/D1 می‌گذاشت نگه می‌داریم (WAL)
  try { db.exec('PRAGMA journal_mode = WAL;'); } catch (e) { log?.(`تغییر journal_mode رد شد: ${e?.message ?? e}`); }

  const cache = new Map();
  const prep = (sql) => {
    let st = cache.get(sql);
    if (!st) {
      if (cache.size >= PREP_CACHE_MAX) cache.clear();
      st = db.prepare(sql);
      cache.set(sql, st);
    }
    return st;
  };

  // D1 مقدار undefined را نمی‌پذیرد → null؛ Uint8Array/ArrayBuffer → Buffer (blob)
  const conv = (v) => {
    if (v === undefined) return null;
    if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    if (v instanceof ArrayBuffer) return Buffer.from(v);
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  };

  class D1PreparedStatement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new D1PreparedStatement(this.sql, args.map(conv));
    }
    /** اجرای خام node:sqlite — برای run/batch */
    _raw() {
      return prep(this.sql).run(...this.args);
    }
    async all() {
      const stmt = prep(this.sql);
      const results = stmt.all(...this.args);
      return {
        results,
        success: true,
        meta: { duration: 0, rows_read: results.length, rows_written: 0, changes: 0, last_row_id: null },
      };
    }
    async first(col) {
      const row = prep(this.sql).get(...this.args);
      if (row === undefined || row === null) return null;
      if (col === undefined) return row;
      return row[col] ?? null;
    }
    async run() {
      const t0 = Date.now();
      const r = this._raw();
      return {
        success: true,
        meta: { duration: Date.now() - t0, changes: Number(r.changes ?? 0), last_row_id: Number(r.lastInsertRowid ?? 0) },
      };
    }
  }

  const metaOf = (r, t0) => ({
    duration: Date.now() - t0,
    changes: Number(r.changes ?? 0),
    last_row_id: Number(r.lastInsertRowid ?? 0),
  });

  return {
    prepare: (sql) => new D1PreparedStatement(sql),
    /** batch در D1 اتمی است — روی تراکنش واقعی SQLite پیاده شد */
    async batch(statements) {
      const t0 = Date.now();
      db.exec('BEGIN IMMEDIATE');
      try {
        const out = [];
        for (const s of statements) out.push({ success: true, meta: metaOf(prep(s.sql).run(...s.args), t0) });
        db.exec('COMMIT');
        return out;
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch { /* بهترین‌تلاش */ }
        throw err;
      }
    },
    /** exec چند-دستوری (مسیر مایگریشن‌ها) — شکل D1: { count, duration } */
    async exec(sql) {
      const t0 = Date.now();
      db.exec(sql);
      const count = String(sql).split(';').filter((s) => s.trim().length > 0).length;
      return { count, duration: Date.now() - t0 };
    },
    /** خاموشی تمیز — engine.mjs هنگام چک‌پوینت/ری‌استارت صدا می‌زند */
    close() {
      try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* بهترین‌تلاش */ }
      try { cache.clear(); db.close(); } catch (e) { log?.(`بستن DB رد شد: ${e?.message ?? e}`); }
    },
  };
}
