import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, looksLikeApiKey } from '../api-keys';

describe('api-keys', () => {
  it('کلید تولیدی شکل استاندارد دارد', async () => {
    const { token, prefix, keyHash } = await generateApiKey('test');
    expect(token).toMatch(/^ck_test_[A-Za-z0-9]{40}$/);
    expect(prefix).toBe(token.slice(0, 11));
    expect(prefix).toMatch(/^ck_test_/);
    expect(keyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('هش SHA-256 قطعی و هگز ۶۴ نویسه است', async () => {
    const h1 = await hashApiKey('ck_test_abcdefghijklmnopqrst');
    const h2 = await hashApiKey('ck_test_abcdefghijklmnopqrst');
    const h3 = await hashApiKey('ck_test_abcdefghijklmnopqrsu'); // یک حرف فرق دارد
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(64);
  });

  it('دو کلید متوالی یکسان نیستند (تصادفی بودن)', async () => {
    const a = await generateApiKey('test');
    const b = await generateApiKey('test');
    expect(a.token).not.toBe(b.token);
    expect(a.keyHash).not.toBe(b.keyHash);
  });

  it('looksLikeApiKey فقط شکل درست را می‌پذیرد', () => {
    expect(looksLikeApiKey(`ck_live_${'A1b2'.repeat(10)}`)).toBe(true);
    expect(looksLikeApiKey(`ck_test_${'x'.repeat(40)}`)).toBe(true);
    expect(looksLikeApiKey(`ck_live_${'x'.repeat(39)}`)).toBe(false); // کوتاه
    expect(looksLikeApiKey(`ck_live_${'x'.repeat(41)}`)).toBe(false); // بلند
    expect(looksLikeApiKey('sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(false);
    expect(looksLikeApiKey('')).toBe(false);
  });

  it('هش کلید با hashApiKey مستقل بازتولید می‌شود (جریان verify middleware)', async () => {
    const { token, keyHash } = await generateApiKey('live');
    const lookup = await hashApiKey(token);
    expect(lookup).toBe(keyHash);
  });
});
