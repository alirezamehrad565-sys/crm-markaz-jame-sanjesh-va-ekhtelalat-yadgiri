/**
 * کلاس های خطای تایپ‌دار — کلاس‌های خطا
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Typed error classes — هر خطا یک HTTP status مشخص دارد

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_ERROR'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'ورودی نامعتبر است', details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 400, message, details);
    this.name = 'ValidationError';
  }
}

export class AuthError extends AppError {
  constructor(message = 'احراز هویت ناموفق بود') {
    super('AUTH_ERROR', 401, message);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'دسترسی مجاز نیست') {
    super('FORBIDDEN', 403, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'منبع', message?: string) {
    super('NOT_FOUND', 404, message ?? `${resource} پیدا نشد`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  readonly currentVersion?: number;

  constructor(message = 'تعارض در وضعیت فعلی رکورد', currentVersion?: number) {
    super('CONFLICT', 409, message, currentVersion !== undefined ? { currentVersion } : undefined);
    this.name = 'ConflictError';
    this.currentVersion = currentVersion;
  }
}

/** — هم‌سنگ باندل زنده: تلاش ناموفق بیش از حد (ورود/دود کردن) — 429 با Retry-After */
export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(
    retryAfterSeconds: number,
    message = 'تلاش‌های ناموفق بیش از حد مجاز است — کمی بعد دوباره تلاش کنید'
  ) {
    super('RATE_LIMITED', 429, message, { retryAfterSeconds });
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
