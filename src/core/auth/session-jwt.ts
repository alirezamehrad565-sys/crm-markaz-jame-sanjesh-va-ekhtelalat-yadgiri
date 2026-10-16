/**
 * احراز هویت هسته — JWT، رمز، کلید API و گارد نقش — نشست JWT پنل
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// JWT نشست صفحه ورود (HS256 با WebCrypto)
// جریان: POST /api/auth/login → signSessionJwt → فرانت در Authorization: Bearer می‌فرستد
// middleware ترتیب: dev bypass → API key → session JWT → Cloudflare Access JWT
// عمر توکن: ۳۰ روز — محیط آموزشی/داخلی؛ امنیت اولویت بالا نیست (تصمیم کاربر)

export interface SessionJwtPayload {
  sub: string;              // staff id
  name: string;             // نام نمایشی
  /** — supervisor (ناظر اداره) از role_ext می‌آید — COALESCE(role_ext, role) در login */
  role: 'manager' | 'therapist' | 'secretary' | 'supervisor';
  email: string;            // legacy — ممکن است synthetic باشد
  iat: number;
  exp: number;
}

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // ۳۰ روز

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(part: string): Uint8Array {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** ساخت توکن نشست — secret از env.AUTH_SECRET (fallback توسعه‌ای) */
export async function signSessionJwt(
  staff: { id: string; fullName: string; role: SessionJwtPayload['role']; email: string },
  secret: string
): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionJwtPayload = {
    sub: staff.id,
    name: staff.fullName,
    role: staff.role,
    email: staff.email,
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;

  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const token = `${data}.${base64UrlEncode(new Uint8Array(sig))}`;

  return { token, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

/** verify امضا + انقضا — نامعتبر → null (تصمیم 401 با فراخواننده) */
export async function verifySessionJwt(token: string, secret: string): Promise<SessionJwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string };
  let payload: SessionJwtPayload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64))) as { alg?: string };
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as SessionJwtPayload;
  } catch {
    return null;
  }

  if (header.alg !== 'HS256') return null;

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(signatureB64) as unknown as ArrayBuffer,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) return null;

  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  if (!payload.sub) return null;

  return payload;
}
