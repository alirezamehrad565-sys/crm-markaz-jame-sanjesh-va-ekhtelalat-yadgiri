/**
 * احراز هویت هسته — JWT، رمز، کلید API و گارد نقش — خواندن امن secret در زمان اجرا
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// هم‌سنگ باندل زنده: کلید امضای نشست بدون fallback هاردکد در تولید.
// ترتیب: env.AUTH_SECRET (≥۱۶ نویسه) → dev/test مقدار ثابت توسعه → تولید: secret تصادفی
// که یک‌بار در settings (sys_auth_secret) ساخته و کش می‌شود.
// انگیزه: حذف ریسک «امضای نشست با secret عمومی» در استقرار بدون secret (A04/CWE-798).

/** کلید settings برای secret ران‌تایم — هم‌نام باندل زنده */
export const SETTINGS_AUTH_SECRET_KEY = 'sys_auth_secret';

/** فقط برای توسعه/تست — هرگز در production مسیر امضا نیست (resolveSessionSecret) */
export const DEV_AUTH_SECRET = 'center-dev-session-secret';

export function isDevEnv(envValue: string | undefined): boolean {
  return envValue === 'development' || envValue === 'test';
}

interface SecretStore {
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}

/** D1 خام → SecretStore (همان الگوی باندل زنده) */
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

function randomHexSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let cachedSecret: string | null = null;

/** خواندن/ساخت secret ران‌تایم در settings — idempotent و کش در ایزولیت */
export async function getOrCreateRuntimeSecret(store: SecretStore): Promise<string> {
  if (cachedSecret) return cachedSecret;

  const row = await store.queryOne<{ value: string }>(
    `SELECT value FROM settings WHERE key = ? LIMIT 1`,
    [SETTINGS_AUTH_SECRET_KEY]
  );
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as unknown;
      if (typeof parsed === 'string' && parsed.length >= 32) {
        cachedSecret = parsed;
        return cachedSecret;
      }
    } catch {
      /* مقدار خراب → بازسازی در ادامه */
    }
  }

  const secret = randomHexSecret();
  await store.execute(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES (?, ?, NULL, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    [SETTINGS_AUTH_SECRET_KEY, JSON.stringify(secret)]
  );
  cachedSecret = secret;
  return secret;
}

/** فقط برای تست — کش ایزولیت را خالی می‌کند */
export function resetRuntimeSecretCache(): void {
  cachedSecret = null;
}

/**
 * کلید امضای نشست:
 * ۱) env.AUTH_SECRET معتبر (≥۱۶) — مسیر تولید با wrangler secret
 * ۲) dev/test — مقدار ثابت توسعه (بدون D1)
 * ۳) تولید بدون secret — secret ران‌تایم تصادفی از settings
 */
export async function resolveSessionSecret(env: {
  AUTH_SECRET?: string;
  ENV: string;
  DB: D1Database;
}): Promise<string> {
  if (env.AUTH_SECRET && env.AUTH_SECRET.length >= 16) return env.AUTH_SECRET;
  if (isDevEnv(env.ENV)) return DEV_AUTH_SECRET;
  return getOrCreateRuntimeSecret(d1AsSecretStore(env.DB));
}
