import type { DbClient } from '@core/db';
import { MAX_EXERCISE_PANEL_FILE_BYTES } from '@core/shared';
import type { ObjectStore, StoredObject } from './types';

const CHUNK_BYTES = 1_500_000;
const PAGE_CHUNKS = 6;
/** صفحه‌ها به‌ازای هر بچ خواندن — ۳ صفحه × ۶ تکه × ~۲MB ردیف ≈ ۳۶MB، زیر سقف ۵۰MB نتیجهٔ D1 */
const PAGES_PER_BATCH = 3;

interface ChunkRow {
  seq: number;
  content: Uint8Array | string;
}

function chunkToBytes(row: ChunkRow): Uint8Array {
  const c = row.content;
  if (typeof c === 'string') {
    const bin = atob(c);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(c);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function writeSegments(db: DbClient, key: string, segments: Uint8Array[]): Promise<void> {
  // (performance-001 — 1.27.79-B2) نوشتن اتمیک در یک رفت‌وبرگشت: transaction موجود در @core/db
  // همهٔ DELETE+INSERTها را بافر و با یک d1.batch تخلیه می‌کند — قبلاً K رفت‌وبرگشت متوالی بود و
  // خرابی میانهٔ نوشتن، تکه‌های یتیم/فایل ناقص بر جا می‌گذاشت. tx.execute بلافاصله resolve
  // می‌کند (بافر) و همین الگوی transaction در کل مخزن جاافتاده است.
  await db.transaction(async (tx) => {
    await tx.execute(`DELETE FROM exercise_file_chunks WHERE key = ?`, [key]);
    const chunk = new Uint8Array(CHUNK_BYTES);
    let fill = 0;
    let seq = 0;
    const flushChunk = async () => {
      if (fill === 0) return;
      await tx.execute(
        `INSERT INTO exercise_file_chunks (key, seq, content) VALUES (?, ?, ?)`,
        [key, seq, bytesToBase64(chunk.subarray(0, fill))]
      );
      seq += 1;
      fill = 0;
    };
    for (const seg of segments) {
      let off = 0;
      while (off < seg.length) {
        const n = Math.min(CHUNK_BYTES - fill, seg.length - off);
        chunk.set(seg.subarray(off, off + n), fill);
        fill += n;
        off += n;
        if (fill === CHUNK_BYTES) await flushChunk();
      }
    }
    await flushChunk();
  });
}

export function createChunkedD1ObjectStore(db: DbClient): ObjectStore {
  return {
    name: 'd1',
    maxObjectBytes: MAX_EXERCISE_PANEL_FILE_BYTES,

    async put(key: string, bytes: Uint8Array): Promise<void> {
      await writeSegments(db, key, [bytes]);
    },

    async putSegments(key: string, segments: Uint8Array[]): Promise<void> {
      await writeSegments(db, key, segments);
    },

    async get(key: string): Promise<StoredObject | null> {
      const countRow = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key = ?`,
        [key]
      );
      const total = countRow?.n ?? 0;
      if (total === 0) return null;

      // (performance-001 — 1.27.79-B2) خواندن با بچ بازه‌ای: ⌈صفحات/PAGES_PER_BATCH⌉ رفت‌وبرگشت
      // به‌جای کوئری‌های متوالی OFFSET (که هر OFFSET صفحات پیشین را دوباره می‌پیمود)؛ OFFSET با
      // bind به‌جای درون‌ریزی رشته‌ای در SQL. نتایج SELECT از batch از 1.27.79 در mock/node-d1
      // هم‌قرارداد D1 واقعی برمی‌گردند.
      const pages = Math.ceil(total / PAGE_CHUNKS);
      const parts: Uint8Array[] = [];
      let size = 0;
      for (let firstPage = 0; firstPage < pages; firstPage += PAGES_PER_BATCH) {
        const stmts: D1PreparedStatement[] = [];
        for (let p = firstPage; p < Math.min(firstPage + PAGES_PER_BATCH, pages); p += 1) {
          stmts.push(db.prepare(
            `SELECT seq, content FROM exercise_file_chunks WHERE key = ? ORDER BY seq LIMIT ${PAGE_CHUNKS} OFFSET ?`,
            [key, p * PAGE_CHUNKS]
          ));
        }
        const results = await db.batch(stmts);
        for (const res of results) {
          for (const r of (res.results ?? []) as ChunkRow[]) {
            const b = chunkToBytes(r);
            parts.push(b);
            size += b.length;
          }
        }
      }

      const out = new Uint8Array(size);
      let cursor = 0;
      for (const p of parts) {
        out.set(p, cursor);
        cursor += p.length;
      }
      return { bytes: out, mime: 'application/octet-stream', size };
    },

    async delete(key: string): Promise<void> {
      await db.execute(`DELETE FROM exercise_file_chunks WHERE key = ?`, [key]);
    }
  };
}
