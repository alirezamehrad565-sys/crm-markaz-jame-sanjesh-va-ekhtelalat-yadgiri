/**
 * تست‌های واحد — password
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تست هش رمز صفحه ورود (PBKDF2 نسخه‌دار + سازگاری legacy SHA-256)

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, isLegacyPasswordHash, DEFAULT_PASSWORD } from '../password';

/** SHA-256 «1234» — فرمت legacy که در migration 0011 و bootstrap.sql نشسته */
const LEGACY_1234 = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

describe('hashPassword', () => {
  it('فرمت نسخه‌دار pbkdf2$iter$salt$hash می‌دهد و legacy نیست', async () => {
    const h = await hashPassword('1234');
    expect(h.startsWith('pbkdf2$')).toBe(true);
    expect(h.split('$')).toHaveLength(4);
    expect(isLegacyPasswordHash(h)).toBe(false);
  });

  it('با salt تصادفی — هر بار خروجی متفاوت (فقط verify معنا دارد)', async () => {
    const h1 = await hashPassword('abc');
    const h2 = await hashPassword('abc');
    expect(h1).not.toBe(h2);
    expect(await verifyPassword('abc', h1)).toBe(true);
    expect(await verifyPassword('abc', h2)).toBe(true);
  });

  it('ورودی متفاوت هش متفاوت می‌دهد', async () => {
    expect(await verifyPassword('1235', await hashPassword('1234'))).toBe(false);
  });
});

describe('verifyPassword', () => {
  it('رمز درست تأیید می‌شود', async () => {
    const h = await hashPassword('my-secret');
    expect(await verifyPassword('my-secret', h)).toBe(true);
  });

  it('رمز اشتباه رد می‌شود', async () => {
    const h = await hashPassword('my-secret');
    expect(await verifyPassword('wrong', h)).toBe(false);
  });

  it('ورودی خالی یا hash خالی نامعتبر است', async () => {
    expect(await verifyPassword('', LEGACY_1234)).toBe(false);
    expect(await verifyPassword('1234', '')).toBe(false);
  });

  it('هش legacy SHA-256 (migration 0011 / bootstrap) همچنان تأیید می‌شود', async () => {
    expect(isLegacyPasswordHash(LEGACY_1234)).toBe(true);
    expect(await verifyPassword('1234', LEGACY_1234)).toBe(true);
    expect(await verifyPassword('1235', LEGACY_1234)).toBe(false);
  });

  it('فرمت pbkdf2 خراب/دستکاری‌شده نامعتبر است (نه crash)', async () => {
    expect(await verifyPassword('1234', 'pbkdf2$bad$salt$hash')).toBe(false);
    expect(await verifyPassword('1234', 'pbkdf2$0$AAAA$AAAA')).toBe(false);
    expect(await verifyPassword('1234', 'pbkdf2$99999999$AAAA$AAAA')).toBe(false);
    expect(await verifyPassword('1234', 'pbkdf2$25000$%%%$AAAA')).toBe(false);
  });

  it('رمز پیش‌فرض سامانه ۱۲۳۴ است — هم legacy و هم فرمت جدید تأیید می‌شود', async () => {
    expect(DEFAULT_PASSWORD).toBe('1234');
    // legacy (چیزی که bootstrap/seed می‌سازد)
    expect(await verifyPassword(DEFAULT_PASSWORD, LEGACY_1234)).toBe(true);
    // فرمت جدید (چیزی که staff service الان می‌سازد)
    expect(await verifyPassword(DEFAULT_PASSWORD, await hashPassword(DEFAULT_PASSWORD))).toBe(true);
  });
});
