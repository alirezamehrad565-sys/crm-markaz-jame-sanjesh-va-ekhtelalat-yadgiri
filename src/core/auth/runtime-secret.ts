export const SETTINGS_AUTH_SECRET_KEY = 'sys_auth_secret';

export const DEV_AUTH_SECRET = 'center-dev-session-secret';

export function isDevEnv(envValue: string | undefined): boolean {
  return envValue === 'development' || envValue === 'test';
}

interface SecretStore {
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}

export function d1AsSecretStore(db: D1Database): SecretStore {
  return {
    async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      return (await db.prepare(sql).bind(...params).first<T>()) ?? null;
    },
    async execute(sql: string, params: unknown[] = []) {
      return db.prepare(sql).bind(...params).run();
    }
  };
}

/**
 * SEC-12776 (security-003 ممیزی) — سیاست راز نشست در تولید، بسته:
 *   ① AUTH_SECRET صریح (≥۱۶) همیشه برنده است.
 *   ② محیط توسعه (development/test) راز ثابت توسعه می‌گیرد.
 *   ③ تولید بدون AUTH_SECRET فقط با رازِ ذخیره‌شدهٔ معتبرِ قبلی (deployهای موجود که
 *      پیش‌تر fallback تصادفی برایشان ساخته بود) ادامه می‌یابد؛
 *   ④ تولیدِ بدون هیچ راز = خطای صریح — ساختِ بی‌سروصدا حذف شد تا راز نشست هرگز
 *      پنهانی در settings/backups ننشیند و استقرار تازه راز قوی بخواهد.
 */
export async function resolveSessionSecret(env: {
  AUTH_SECRET?: string;
  ENV: string;
  DB: D1Database;
}): Promise<string> {
  if (env.AUTH_SECRET && env.AUTH_SECRET.length >= 16) return env.AUTH_SECRET;
  if (isDevEnv(env.ENV)) return DEV_AUTH_SECRET;
  const row = await d1AsSecretStore(env.DB).queryOne<{ value: string }>(
    `SELECT value FROM settings WHERE key = ? LIMIT 1`,
    [SETTINGS_AUTH_SECRET_KEY]
  );
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as unknown;
      if (typeof parsed === 'string' && parsed.length >= 32) return parsed;
    } catch {
      /* نرم — مقدار خراب راز معتبر نیست؛ به خطای صریح می‌رسیم */
    }
  }
  throw new Error(
    'SEC-12776: در محیط تولید AUTH_SECRET تنظیم نشده است — با «npx wrangler secret put AUTH_SECRET» راز قوی (حداقل ۱۶ کاراکتر) بگذارید؛ ساخت خودکار راز نشست حذف شده است.'
  );
}
