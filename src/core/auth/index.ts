/**
 * احراز هویت هسته — JWT، رمز، کلید API و گارد نقش — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول auth

export { authMiddleware, requireRole, getAuthContext, supervisorGate } from './middleware';
export { getStaffById, listStaff, resolveStaffByEmail } from './staff';
export type { StaffRow } from './staff';
export { resetJwksCache } from './jwt';
export type { AccessJwtPayload } from './jwt';
export { generateApiKey, hashApiKey, looksLikeApiKey } from './api-keys';
export type { GeneratedApiKey } from './api-keys';
export { hashPassword, verifyPassword, isLegacyPasswordHash, DEFAULT_PASSWORD } from './password';
export { signSessionJwt, verifySessionJwt } from './session-jwt';
export type { SessionJwtPayload } from './session-jwt';
export { resolveSessionSecret, getOrCreateRuntimeSecret, resetRuntimeSecretCache, DEV_AUTH_SECRET } from './runtime-secret';
export { findStaffByUsername } from './login';
export type { LoginStaffRow } from './login';
