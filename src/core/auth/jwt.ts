/**
 * احراز هویت هسته — JWT، رمز، کلید API و گارد نقش — تولید و اعتبارسنجی JWT
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Verify JWT با WebCrypto (Cloudflare Access) — قانون ۷: JWT حتماً verify شود
// کلید عمومی تیم به مدت ۵ دقیقه cache می‌شود.

export interface AccessJwtPayload {
  email: string;
  exp: number;
  iat?: number;
  aud?: string | string[];
  [key: string]: unknown;
}

interface JwksCache {
  keys: JsonWebKey[];
  fetchedAt: number;
}

const JWKS_TTL_MS = 5 * 60 * 1000;
let jwksCache: JwksCache | null = null;

async function fetchTeamJwks(teamDomain: string): Promise<JsonWebKey[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) {
    throw new Error(`JWKS_FETCH_FAILED: ${res.status}`);
  }
  const data = (await res.json()) as { keys: JsonWebKey[] };
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function base64UrlDecode(part: string): Uint8Array {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Verify امضای RS256 و exp یک Cloudflare Access JWT.
 * در صورت نامعتبر بودن، null برمی‌گرداند (به‌جای throw — تصمیم 401 با فراخواننده).
 */
export async function verifyAccessToken(token: string, teamDomain: string): Promise<AccessJwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; kid?: string };
  let payload: AccessJwtPayload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64))) as { alg?: string; kid?: string };
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as AccessJwtPayload;
  } catch {
    return null;
  }

  if (header.alg !== 'RS256') return null;

  const keys = await fetchTeamJwks(teamDomain);
  const jwk = keys.find((k) => (k as { kid?: string }).kid === header.kid) ?? keys[0];
  if (!jwk) return null;

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const dataBytes = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signatureBytes, dataBytes);
  if (!valid) return null;

  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  if (!payload.email) return null;

  return payload;
}

/** تست‌ها/cache را ریست می‌کند (تنها برای محیط تست) */
export function resetJwksCache(): void {
  jwksCache = null;
}
