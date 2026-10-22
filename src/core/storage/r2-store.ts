import type { ObjectStore, R2LikeBucket, StoredObject } from './types';
import { MAX_EXERCISE_PANEL_FILE_BYTES } from '@core/shared';

export function createR2ObjectStore(bucket: R2LikeBucket): ObjectStore {
  return {
    name: 'r2',
    maxObjectBytes: MAX_EXERCISE_PANEL_FILE_BYTES,

    async put(key, bytes, _mime): Promise<void> {
      await bucket.put(key, bytes);
    },

    async putSegments(key, segments): Promise<void> {
      const blob = new Blob(segments as unknown as ArrayBufferView[]);
      await bucket.put(key, blob as unknown as Uint8Array);
    },

    async get(key): Promise<StoredObject | null> {
      const obj = await bucket.get(key);
      if (!obj) return null;
      const buf = await obj.arrayBuffer();
      const bytes = new Uint8Array(buf);
      return { bytes, mime: 'application/octet-stream', size: bytes.length };
    },

    async delete(key): Promise<void> {
      await bucket.delete(key);
    }
  };
}
