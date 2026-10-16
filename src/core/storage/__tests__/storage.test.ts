/**
 * تست‌های واحد — storage
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// storage.test.ts — آداپترهای ObjectStore (d1 با MockD1 واقعی + r2 با باکت جعلی)

import { describe, it, expect } from 'vitest';
import { createTestDb } from '../../../test/harness';
import { MockD1 } from '../../../test/mock-d1';
import { createDb } from '@core/db';
import { createD1ObjectStore, createR2ObjectStore } from '@core/storage';
import type { R2LikeBucket } from '@core/storage';

function bytesOf(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('d1-store: چرخهٔ کامل بایت روی MockD1', () => {
  it('put → get → بازنویسی → delete → get null', async () => {
    const sql = createTestDb();
    const db = createDb(new MockD1(sql) as unknown as D1Database);
    const store = createD1ObjectStore(db);

    expect(store.name).toBe('d1');

    await store.put('exercise/a', bytesOf('hello worksheet'), 'application/pdf');
    const first = await store.get('exercise/a');
    expect(first).not.toBeNull();
    expect(new TextDecoder().decode(first!.bytes)).toBe('hello worksheet');
    expect(first!.mime).toBe('application/pdf');
    expect(first!.size).toBe(15);

    // بازنویسی همان کلید
    await store.put('exercise/a', bytesOf('v2'), 'text/html');
    const second = await store.get('exercise/a');
    expect(new TextDecoder().decode(second!.bytes)).toBe('v2');
    expect(second!.mime).toBe('text/html');

    await store.delete('exercise/a');
    expect(await store.get('exercise/a')).toBeNull();
    // حذف کلید ناموجود — خطا نمی‌دهد
    await expect(store.delete('exercise/a')).resolves.toBeUndefined();
    // کلید ناموجود
    expect(await store.get('exercise/nope')).toBeNull();
  });

  it('باینری با بایت‌های بالا (بازنویسی امن UTF-8 در base64)', async () => {
    const sql = createTestDb();
    const db = createDb(new MockD1(sql) as unknown as D1Database);
    const store = createD1ObjectStore(db);

    const big = new Uint8Array(3000);
    for (let i = 0; i < big.length; i++) big[i] = i % 256;
    await store.put('exercise/bin', big, 'image/png');
    const back = await store.get('exercise/bin');
    expect(back!.size).toBe(3000);
    expect(Array.from(back!.bytes)).toEqual(Array.from(big));
  });
});

describe('r2-store: باکت ساختاری جعلی', () => {
  it('put/get/delete روی باکت جعلی', async () => {
    const objects = new Map<string, Uint8Array>();
    const bucket: R2LikeBucket = {
      async put(key, value) {
        objects.set(key, value);
        return {};
      },
      async get(key) {
        const v = objects.get(key);
        if (!v) return null;
        const copy = new Uint8Array(v);
        return {
          arrayBuffer: async () => copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)
        };
      },
      async delete(key) {
        objects.delete(key);
        return {};
      }
    };
    const store = createR2ObjectStore(bucket);
    expect(store.name).toBe('r2');

    await store.put('exercise/r2', bytesOf('cloud file'), 'application/pdf');
    const got = await store.get('exercise/r2');
    expect(new TextDecoder().decode(got!.bytes)).toBe('cloud file');
    // mime در آداپتر R2 خنثی است — منبع حقیقت mime جدول exercises است
    expect(got!.mime).toBe('application/octet-stream');

    await store.delete('exercise/r2');
    expect(await store.get('exercise/r2')).toBeNull();
  });
});
