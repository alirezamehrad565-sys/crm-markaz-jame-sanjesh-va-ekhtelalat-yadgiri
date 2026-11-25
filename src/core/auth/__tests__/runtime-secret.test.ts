import { describe, it, expect } from 'vitest';
import {
  resolveSessionSecret,
  isDevEnv,
  DEV_AUTH_SECRET,
  SETTINGS_AUTH_SECRET_KEY
} from '../runtime-secret';

function fakeD1(rows: Map<string, string>): D1Database {
  const store = rows;
  return {
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
              return { success: true };
            }
          };
        }
      };
    }
  } as unknown as D1Database;
}

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

describe('resolveSessionSecret — SEC-12776', () => {
  it('۱ — AUTH_SECRET معتبر (≥۱۶) همیشه برنده است و D1 را لمس نمی‌کند', async () => {
    const db = fakeD1(new Map());
    const secret = await resolveSessionSecret({
      AUTH_SECRET: 'x'.repeat(16),
      ENV: 'production',
      DB: db
    });
    expect(secret).toBe('x'.repeat(16));
  });

  it('۲ — تولید بدون AUTH_SECRET و بدون رکورد: خطای صریح (ساخت بی‌سروصدا حذف شد)', async () => {
    const db = fakeD1(new Map());
    await expect(
      resolveSessionSecret({ ENV: 'production', DB: db })
    ).rejects.toThrow(/AUTH_SECRET/);
  });

  it('۳ — محیط توسعه مقدار ثابت توسعه را می‌گیرد (بدون D1)', async () => {
    const db = fakeD1(new Map());
    const secret = await resolveSessionSecret({ ENV: 'development', DB: db });
    expect(secret).toBe(DEV_AUTH_SECRET);
  });

  it('۴ — تولید بدون AUTH_SECRET: راز ذخیره‌شدهٔ معتبر قبلی (deploy موجود) ادامه می‌یابد', async () => {
    const stored = 'a'.repeat(40);
    const db = fakeD1(new Map([[SETTINGS_AUTH_SECRET_KEY, JSON.stringify(stored)]]));
    const secret = await resolveSessionSecret({ ENV: 'production', DB: db });
    expect(secret).toBe(stored);
  });

  it('۵ — مقدار خراب در settings راز معتبر نیست → خطای صریح (بازتولید حذف شد)', async () => {
    const db = fakeD1(new Map([[SETTINGS_AUTH_SECRET_KEY, 'not-json']]));
    await expect(
      resolveSessionSecret({ ENV: 'production', DB: db })
    ).rejects.toThrow(/AUTH_SECRET/);
  });

  it('۶ — راز ذخیره‌شدهٔ کوتاه (<۳۲) پذیرفته نمی‌شود → خطای صریح', async () => {
    const db = fakeD1(new Map([[SETTINGS_AUTH_SECRET_KEY, JSON.stringify('short')]]));
    await expect(
      resolveSessionSecret({ ENV: 'production', DB: db })
    ).rejects.toThrow(/AUTH_SECRET/);
  });

  it('۷ — پیام خطا دستور رفع را می‌دهد (wrangler secret put)', async () => {
    const db = fakeD1(new Map());
    await expect(
      resolveSessionSecret({ ENV: 'production', DB: db })
    ).rejects.toThrow(/wrangler secret put/);
  });
});
