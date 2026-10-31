import type { DbClient } from '@core/db';
import { MAX_EXERCISE_PANEL_FILE_BYTES } from '@core/shared';
import type { ObjectStore, StoredObject } from './types';

const CHUNK_BYTES = 1_500_000;
const PAGE_CHUNKS = 6;

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
  await db.execute(`DELETE FROM exercise_file_chunks WHERE key = ?`, [key]);
  const chunk = new Uint8Array(CHUNK_BYTES);
  let fill = 0;
  let seq = 0;
  const flushChunk = async () => {
    if (fill === 0) return;
    await db.execute(
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

      const parts: Uint8Array[] = [];
      let size = 0;
      for (let offset = 0; offset < total; offset += PAGE_CHUNKS) {
        const rows = await db.query<ChunkRow>(
          `SELECT seq, content FROM exercise_file_chunks WHERE key = ? ORDER BY seq LIMIT ${PAGE_CHUNKS} OFFSET ${offset}`,
          [key]
        );
        for (const r of rows) {
          const b = chunkToBytes(r);
          parts.push(b);
          size += b.length;
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
