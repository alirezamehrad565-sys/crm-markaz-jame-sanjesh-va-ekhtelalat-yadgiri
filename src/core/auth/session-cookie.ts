/**
 * کوکی نشست — ۱.۲۷.۸۲ (security-009/ADR-005): توکن نشست از localStorage به کوکی httpOnly
 * مهاجرت کرد — اسکریپت صفحه هیچ راهی برای خواندنش ندارد. Bearer برای کلاینت‌های غیرمرورگری
 * (wizard ابری با مبدأ متفاوت، node-tools، گذار آزمون‌ها) دست‌نخورده می‌ماند.
 */
import { SESSION_TTL_SECONDS } from './session-jwt';

export const SESSION_COOKIE_NAME = 'cs_session';

/** کوکی نشست ورود — SameSite=Strict لایهٔ اول CSRF؛ بررسی Origin در authMiddleware لایهٔ دوم است */
export function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

/** پاک‌سازی کوکی در خروج (ابطال سمت‌سرورِ sid جداگانه در registerLogoutRoute انجام می‌شود) */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/** خوانش کوکی نشست از هدر Cookie — بدون وابستگی به helper هونو */
export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE_NAME) return part.slice(idx + 1).trim();
  }
  return undefined;
}
