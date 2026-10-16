/**
 * کلاس های خطای تایپ‌دار — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول errors

export { AppError, AuthError, ConflictError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from './errors';
export type { ErrorCode } from './errors';
