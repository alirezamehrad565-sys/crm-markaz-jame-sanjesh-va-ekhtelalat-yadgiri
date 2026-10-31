const KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export interface GeneratedApiKey {
  token: string;
  prefix: string;
  keyHash: string;
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  }
  return out;
}

export async function hashApiKey(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateApiKey(env: 'live' | 'test' = 'live'): Promise<GeneratedApiKey> {
  const token = `ck_${env}_${randomString(40)}`;
  const [prefix, keyHash] = await Promise.all([Promise.resolve(token.slice(0, 11)), hashApiKey(token)]);
  return { token, prefix, keyHash };
}

export function looksLikeApiKey(value: string): boolean {
  return /^ck_(live|test)_[A-Za-z0-9]{40}$/.test(value);
}

export interface ApiKeyLookupRow {
  id: string;
  name: string;
  prefix: string;
  role: 'manager' | 'therapist' | 'secretary';
  active: number;
  created_by: string;
}

export function findApiKeyByHash(db: D1Database, keyHash: string): Promise<ApiKeyLookupRow | null> {
  return db
    .prepare(`SELECT id, name, prefix, role, active, created_by FROM api_keys WHERE key_hash = ? LIMIT 1`)
    .bind(keyHash)
    .first<ApiKeyLookupRow>();
}

export async function touchApiKeyLastUsed(db: D1Database, id: string): Promise<void> {
  try {
    await db
      .prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`)
      .bind(id)
      .run();
  } catch {
  }
}
