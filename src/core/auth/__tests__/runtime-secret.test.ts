import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveSessionSecret,
  getOrCreateRuntimeSecret,
  resetRuntimeSecretCache,
  isDevEnv,
  DEV_AUTH_SECRET,
  SETTINGS_AUTH_SECRET_KEY
} from '../runtime-secret';

function fakeD1(rows: Map<string, string>, writes: string[] = []): D1Database {
  const store = rows;
  const db = {
    prepare(sql: string) {
      return {
        bind(..._params: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('SELECT value FROM settings')) {
                const key = _params[0] as string;
                const value = store.get(key);
                return (value !== undefined ? { value } : null) as T | null;
              }
              return null;
            },
            async run() {
              if (sql.includes('INSERT INTO settings')) {
                const [key, rawValue] = _params as [string, string];
                const previous = store.get(key);
                writes.push(previous === undefined ? 'insert' : 'update');
                store.set(key, rawValue);
              }
              return { success: true };
            }
          };
        }
      };
    }
  } as unknown as D1Database;
  return db;
}

beforeEach(() => {
  resetRuntimeSecretCache();
});

describe('isDevEnv', () => {
  it('development و test محیط توسعه‌اند', () => {
    expect(isDevEnv('development')).toBe(true);
    expect(isDevEnv('test')).toBe(true);
  });

  it('production و undefined محیط توسعه نیستند', () => {
    expect(isDevEnv('production')).toBe(false);
    expect(isDevEnv(undefined)).toBe(false);
  });
});

describe('resolveSessionSecret', () => {
  it('۱ — AUTH_SECRET معتبر (≥۱۶) همیشه برنده است و D1 را لمس نمی‌کند', async () => {
    const db = fakeD1(new Map());
    const secret = await resolveSessionSecret({
      AUTH_SECRET: 'x'.repeat(16),
      ENV: 'production',
      DB: db
    });
    expect(secret).toBe('x'.repeat(16));
  });

  it('۲ — AUTH_SECRET کوتاه (<۱۶) پذیرفته نمی‌شود', async () => {
    const db = fakeD1(new Map());
    const secret = await resolveSessionSecret({ AUTH_SECRET: 'short', ENV: 'production', DB: db });
    expect(secret).not.toBe('short');
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });

  it('۳ — محیط توسعه مقدار ثابت توسعه را می‌گیرد (بدون D1)', async () => {
    const db = fakeD1(new Map());
    const secret = await resolveSessionSecret({ ENV: 'development', DB: db });
    expect(secret).toBe(DEV_AUTH_SECRET);
  });

  it('۴ — تولید بدون secret: secret ذخیره‌شدهٔ معتبر settings خوانده می‌شود', async () => {
    const stored = 'a'.repeat(40);
    const db = fakeD1(new Map([[SETTINGS_AUTH_SECRET_KEY, JSON.stringify(stored)]]));
    const secret = await resolveSessionSecret({ ENV: 'production', DB: db });
    expect(secret).toBe(stored);
  });

  it('۵ — تولید بدون secret و بدون رکورد: secret تصادفی می‌سازد و درج می‌کند (فقط یک‌بار)', async () => {
    const writes: string[] = [];
    const db = fakeD1(new Map(), writes);
    const secret1 = await resolveSessionSecret({ ENV: 'production', DB: db });
    expect(secret1).toMatch(/^[0-9a-f]{64}$/);
    expect(writes).toEqual(['insert']);

    const secret2 = await resolveSessionSecret({ ENV: 'production', DB: db });
    expect(secret2).toBe(secret1);
    expect(writes).toEqual(['insert']);
  });

  it('۶ — مقدار خراب در settings بازسازی می‌شود', async () => {
    const writes: string[] = [];
    const db = fakeD1(new Map([[SETTINGS_AUTH_SECRET_KEY, 'not-json']]), writes);
    const secret = await resolveSessionSecret({ ENV: 'production', DB: db });
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(writes).toEqual(['update']);
  });
});

describe('getOrCreateRuntimeSecret', () => {
  it('secret با طول کمتر از ۳۲ قابل قبول نیست و بازسازی می‌شود', async () => {
    const writes: string[] = [];
    const db = fakeD1(new Map([[SETTINGS_AUTH_SECRET_KEY, JSON.stringify('short')]]), writes);
    const secret = await getOrCreateRuntimeSecret((await import('../runtime-secret')).d1AsSecretStore(db));
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(writes.length).toBe(1);
  });
});
