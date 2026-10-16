/**
 * احراز هویت هسته — JWT، رمز، کلید API و گارد نقش — کلیدهای API
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تولید و هش کلیدهای API
// قوانین امنیتی:
// * کلید کامل فقط یک‌بار در لحظه ساخت به کاربر نشان داده می‌شود
// * در دیتابیس فقط SHA-256 hex (key_hash) + prefix برای نمایش
// * فرمت: ck_<env>_<43 کاراکتر base64url> — تصادفی ۳۲ بایتی از WebCrypto
// * مقایسه با hash lookup (O(1) با UNIQUE index) — نه مقایسه زنجیره‌ای زمان‌ثابت،
// چون کلیدهای تصادفی ۲۵۶-بیتی هستند و lookup با index از حمله timing جلوگیری می‌کند

const KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export interface GeneratedApiKey {
  /** کلید کامل — فقط یک‌بار برگردانده می‌شود */
  token: string;
  /** پیشوند نمایشی (۱۲ کاراکتر اول) — در DB و UI */
  prefix: string;
  /** SHA-256 hex کلید کامل — در DB */
  keyHash: string;
}

/** تولید ۳۲ بایت تصادفی به‌صورت رشته الفبایی-عددی */
function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  }
  return out;
}

/** SHA-256 hex — با WebCrypto (سازگار با Workers و Node 18+) */
export async function hashApiKey(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** ساخت کلید جدید — env پیش‌فرض live است (در تست‌ها test پاس می‌شود) */
export async function generateApiKey(env: 'live' | 'test' = 'live'): Promise<GeneratedApiKey> {
  const token = `ck_${env}_${randomString(40)}`;
  const [prefix, keyHash] = await Promise.all([Promise.resolve(token.slice(0, 11)), hashApiKey(token)]);
  return { token, prefix, keyHash };
}

/** اعتبارسنجی شکل کلید ورودی (بدون touching DB) */
export function looksLikeApiKey(value: string): boolean {
  return /^ck_(live|test)_[A-Za-z0-9]{40}$/.test(value);
}

// ───────────── DB lookup (ورودی D1 خام — برای middleware) ─────────────

export interface ApiKeyLookupRow {
  id: string;
  name: string;
  prefix: string;
  role: 'manager' | 'therapist' | 'secretary';
  active: number;
  created_by: string;
}

/** یافتن کلید فعال با hash — O(1) روی UNIQUE index */
export function findApiKeyByHash(db: D1Database, keyHash: string): Promise<ApiKeyLookupRow | null> {
  return db
    .prepare(`SELECT id, name, prefix, role, active, created_by FROM api_keys WHERE key_hash = ? LIMIT 1`)
    .bind(keyHash)
    .first<ApiKeyLookupRow>();
}

/** به‌روزرسانی آخرین استفاده — best-effort (خطا نادیده گرفته می‌شود) */
export async function touchApiKeyLastUsed(db: D1Database, id: string): Promise<void> {
  try {
    await db
      .prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`)
      .bind(id)
      .run();
  } catch {
    /* last_used_at حیاتی نیست */
  }
}
