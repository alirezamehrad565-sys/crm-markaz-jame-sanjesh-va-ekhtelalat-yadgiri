/**
 * پوشش شاخهٔ احراز CF Access — testing-001 ممیزی (high): verifyAccessToken تا ۱.۲۷.۷۵
 * صفر تست داشت و هیچ تستی هدر Cf-Access-Jwt-Assertion نمی‌فرستاد. این آزمون اجرای
 * واقعی RS256 است: کلید RSA تولید و با JWKS ساختگی (fetch mocked) اعتبارسنجی می‌شود.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

type JwtModule = typeof import('../jwt');

const b64url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

async function loadFresh(): Promise<JwtModule> {
  vi.resetModules();
  return await import('../jwt');
}

interface KeyMaterial {
  kid: string;
  jwk: JsonWebKey & { kid: string };
  privateKey: CryptoKey;
}

async function makeKey(kid: string): Promise<KeyMaterial> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey & { kid: string };
  jwk.kid = kid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  return { kid, jwk, privateKey: pair.privateKey };
}

async function signToken(
  key: KeyMaterial,
  payload: Record<string, unknown>,
  alg = 'RS256'
): Promise<string> {
  const headerB64 = b64url(enc(JSON.stringify({ alg, typ: 'JWT', kid: key.kid })));
  const payloadB64 = b64url(enc(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, enc(`${headerB64}.${payloadB64}`));
  return `${headerB64}.${payloadB64}.${b64url(new Uint8Array(sig))}`;
}

function stubJwks(keys: (JsonWebKey & { kid?: string })[]): { fetchMock: ReturnType<typeof vi.fn> } {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ keys }) }));
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verifyAccessToken — شاخهٔ Cf-Access-Jwt-Assertion (testing-001)', () => {
  it('توکن RS256 معتبر با JWKS ساختگی → payload برمی‌گردد', async () => {
    const { verifyAccessToken } = await loadFresh();
    const key = await makeKey('k1');
    const { fetchMock } = stubJwks([key.jwk]);
    const token = await signToken(key, {
      email: 'staff@clinic.example.com',
      exp: Math.floor(Date.now() / 1000) + 600,
      aud: 'org-id.access'
    });
    const payload = await verifyAccessToken(token, 'test.team.example.com');
    expect(payload).not.toBeNull();
    expect(payload?.email).toBe('staff@clinic.example.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cdn-cgi/access/certs');
  });

  it('کش JWKS (TTL پنج‌دقیقه‌ای): فراخوانی دوم fetch نمی‌زند', async () => {
    const { verifyAccessToken } = await loadFresh();
    const key = await makeKey('k1');
    const { fetchMock } = stubJwks([key.jwk]);
    const token = await signToken(key, { email: 'a@b.c', exp: Math.floor(Date.now() / 1000) + 600 });
    await verifyAccessToken(token, 'test.team.example.com');
    await verifyAccessToken(token, 'test.team.example.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('توکن دست‌کاری‌شده (امضای نامعتبر) → null', async () => {
    const { verifyAccessToken } = await loadFresh();
    const key = await makeKey('k1');
    stubJwks([key.jwk]);
    const token = await signToken(key, { email: 'staff@x.y', exp: Math.floor(Date.now() / 1000) + 600 });
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    payload.email = 'evil@x.y';
    const tampered = `${parts[0]}.${b64url(enc(JSON.stringify(payload)))}.${parts[2]}`;
    expect(await verifyAccessToken(tampered, 'test.team.example.com')).toBeNull();
  });

  it('exp گذشته → null', async () => {
    const { verifyAccessToken } = await loadFresh();
    const key = await makeKey('k1');
    stubJwks([key.jwk]);
    const token = await signToken(key, { email: 'staff@x.y', exp: Math.floor(Date.now() / 1000) - 10 });
    expect(await verifyAccessToken(token, 'test.team.example.com')).toBeNull();
  });

  it('alg غیر از RS256 (HS256) → بدون هیچ fetch رد می‌شود', async () => {
    const { verifyAccessToken } = await loadFresh();
    const { fetchMock } = stubJwks([]);
    const forged = [
      b64url(enc(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))),
      b64url(enc(JSON.stringify({ email: 'staff@x.y', exp: Math.floor(Date.now() / 1000) + 600 }))),
      b64url(new Uint8Array([1, 2, 3]))
    ].join('.');
    expect(await verifyAccessToken(forged, 'test.team.example.com')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('امضا با کلیدی که در JWKS نیست → null', async () => {
    const { verifyAccessToken } = await loadFresh();
    const signer = await makeKey('signer');
    const pool = await makeKey('pool');
    stubJwks([pool.jwk]);
    const token = await signToken(signer, { email: 'staff@x.y', exp: Math.floor(Date.now() / 1000) + 600 });
    expect(await verifyAccessToken(token, 'test.team.example.com')).toBeNull();
  });

  it('JWKS fetch ناموفق → JWKS_FETCH_FAILED (رفتار مستندشده: throw به بالادست)', async () => {
    const { verifyAccessToken } = await loadFresh();
    const key = await makeKey('k1');
    // توکن ساختاری معتبر تا جریان تا مرحلهٔ fetch پیش برود
    const token = await signToken(key, { email: 'staff@x.y', exp: Math.floor(Date.now() / 1000) + 600 });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(verifyAccessToken(token, 'test.team.example.com')).rejects.toThrow('JWKS_FETCH_FAILED');
  });
});
