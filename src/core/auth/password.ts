// هش رمز عبور با PBKDF2 (۲۵ هزار دور، SHA-256، نمک ۱۶ بایتی) روی WebCrypto.
// مقایسهٔ هش‌ها زمان-ثابت است تا حملهٔ تایمینگ ممکن نشود — حساب‌های تازه با DEFAULT_PASSWORD شروع می‌کنند.
import { hashApiKey } from './api-keys';

export const DEFAULT_PASSWORD = '1234';

const PBKDF2_ITERATIONS = 25_000;

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

export async function hashPassword(password: string): Promise<string> {
  if (!password) throw new Error('password خالی است');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${HASH_PREFIX}$${PBKDF2_ITERATIONS}$${toB64(salt)}$${hash}`;
}

export function isLegacyPasswordHash(storedHash: string): boolean {
  return Boolean(storedHash) && !storedHash.startsWith(`${HASH_PREFIX}$`);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;

  if (storedHash.startsWith(`${HASH_PREFIX}$`)) {
    const parts = storedHash.split('$');
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

  const candidate = await hashApiKey(password);
  return constantTimeEqual(candidate, storedHash);
}
