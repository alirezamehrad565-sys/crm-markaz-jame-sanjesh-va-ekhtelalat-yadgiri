import type { DbClient } from '@core/db';
import { MAX_EXERCISE_FILE_BYTES } from '@core/shared';
import type { ObjectStore, StoredObject } from './types';

interface BlobRow {
  mime: string;
  size_bytes: number;
  content_b64: string;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function createD1ObjectStore(db: DbClient): ObjectStore {
  return {
    name: 'd1',
    maxObjectBytes: MAX_EXERCISE_FILE_BYTES,

    async put(key, bytes, mime): Promise<void> {
      await db.execute(
        `INSERT INTO exercise_files (key, mime, size_bytes, content_b64)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           mime = excluded.mime,
           size_bytes = excluded.size_bytes,
           content_b64 = excluded.content_b64`,
        [key, mime, bytes.length, bytesToBase64(bytes)]
      );
    },

    async get(key): Promise<StoredObject | null> {
      const row = await db.queryOne<BlobRow>(
        `SELECT mime, size_bytes, content_b64 FROM exercise_files WHERE key = ?`,
        [key]
      );
      if (!row) return null;
      const bytes = base64ToBytes(row.content_b64);
      return { bytes, mime: row.mime, size: bytes.length };
    },

    async delete(key): Promise<void> {
      await db.execute(`DELETE FROM exercise_files WHERE key = ?`, [key]);
    }
  };
}
