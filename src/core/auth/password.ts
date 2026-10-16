/**
 * احراز هویت هسته — JWT، رمز، کلید API و گارد نقش — هش و بررسی رمز
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// رمز ورود صفحه لاگین
// ارتقای امنیتی: SHA-256 بدون salt → PBKDF2-HMAC-SHA256 با salt تصادفی
// * هش جدید: «pbkdf2$<iterations>$<salt b64>$<hash b64>» — نسخه‌دار و قابل ارتقای آینده
// * هش قدیمی (SHA-256 hex — ۶۴ نویسهٔ hex) همچنان تأیید می‌شود (سازگاری با
// bootstrap.sql/seed و migration 0011) و در اولین ورود موفق به PBKDF2 ارتقا می‌یابد
// (کد فراخوان: application/auth/routes.ts → upgradeLegacyPassword)
// * ثابت‌ها: PBKDF2 با WebCrypto — سازگار با Workers و Node 18+ (بدون وابستگی)
// رمز پیش‌فرض همه کارکنان: ۱۲۳۴ (تا وقتی مدیر رمز دیگری تعیین نکند)

import { hashApiKey } from './api-keys';

/** رمز پیش‌فرض سیستم — تا وقتی مدیر برای کارمند رمز دیگری تعیین نکرده */
export const DEFAULT_PASSWORD = '1234';

/** تکرار PBKDF2 — ترازوی هزینه/زمان روی Workers (login کم‌تکرار است؛ ~۱۰-۳۰ms بومی) */
const PBKDF2_ITERATIONS = 25_000;

/** طول salt تصادفی (بایت) و خروجی مشتق (بیت) */
const SALT_BYTES = 16;
const DERIVED_BITS = 256;

const HASH_PREFIX = 'pbkdf2';

const encoder = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** مقایسهٔ زمان-ثابت برای جلوگیری از timing attack */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits'
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    DERIVED_BITS
  );
  return toB64(new Uint8Array(bits));
}

/**
 * هش رمز برای ذخیره — PBKDF2-HMAC-SHA256 با salt تصادفی (فرمت نسخه‌دار).
 * خروجی: «pbkdf2$25000$<salt b64>$<hash b64>»
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password) throw new Error('password خالی است');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${HASH_PREFIX}$${PBKDF2_ITERATIONS}$${toB64(salt)}$${hash}`;
}

/**
 * آیا هش ذخیره‌شده از الگوی قدیمی (SHA-256 hex بدون salt) است؟
 * اگر بله — پس از اولین ورود موفق باید با upgradeLegacyPassword ارتقا یابد.
 */
export function isLegacyPasswordHash(storedHash: string): boolean {
  return Boolean(storedHash) && !storedHash.startsWith(`${HASH_PREFIX}$`);
}

/**
 * بررسی رمز ورودی:
 * - فرمت جدید (pbkdf2$…) → مقایسهٔ PBKDF2 با salt ذخیره‌شده
 * - فرمت قدیمی (SHA-256 hex) → مقایسهٔ legacy (سازگاری؛ ارتقا در ورود موفق)
 * - اگر رمز ورودی خالی بود → نامعتبر
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;

  if (storedHash.startsWith(`${HASH_PREFIX}$`)) {
    const parts = storedHash.split('$');
    // pbkdf2 | iterations | salt | hash
    if (parts.length !== 4) return false;
    const iterations = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(iterations) || iterations < 1 || iterations > 5_000_000) return false;
    let salt: Uint8Array;
    try {
      salt = fromB64(parts[2]);
    } catch {
      return false;
    }
    const candidate = await pbkdf2(password, salt, iterations);
    return constantTimeEqual(candidate, parts[3]);
  }

  // legacy — SHA-256 hex (هم‌الگوی api-keys)
  const candidate = await hashApiKey(password);
  return constantTimeEqual(candidate, storedHash);
}
