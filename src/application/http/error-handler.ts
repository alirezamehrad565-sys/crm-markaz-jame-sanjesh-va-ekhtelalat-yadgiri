import type { Context } from 'hono';
import { ZodError } from 'zod';
import { AppError, ConflictError } from '@core/errors';
import type { Logger } from '@core/logger';

/** پاکت خطا همیشه request-id همان درخواست را حمل می‌کند (ف۵ — P2-13) تا لاگ/audit/پاسخ با هم بسته شوند */
function requestIdOf(c: Context): string | undefined {
  return c.get('requestId') as string | undefined;
}

export function errorHandler(err: Error, c: Context): Response {
  const requestId = requestIdOf(c);
  // پیوست اختیاری request_id — نبود میدل‌ور (مسیرهای بیرون /api/*) یعنی فیلد اصلاً نمی‌آید
  const withRequestId = (body: Record<string, unknown>): Record<string, unknown> =>
    requestId ? { ...body, request_id: requestId } : body;

  if (err instanceof ZodError) {
    return c.json(
      withRequestId({
        error: 'VALIDATION_ERROR',
        message: 'ورودی نامعتبر است',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      }),
      400
    );
  }

  if (err instanceof ConflictError) {
    return c.json(
      withRequestId({
        error: 'CONFLICT',
        message: err.message,
        ...(err.currentVersion !== undefined ? { current_version: err.currentVersion } : {})
      }),
      409
    );
  }

  if (err instanceof AppError) {
    // ف۵ — جزئیات خطا (مثل retry_after_seconds در ۴۲۹) اکنون به پاکت می‌آید؛ قبلاً ساخته می‌شد ولی هرگز ارسال نمی‌شد
    return c.json(
      withRequestId({
        error: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {})
      }),
      err.status as 400 | 401 | 403 | 404 | 409 | 429 | 500
    );
  }

  if (err instanceof SyntaxError) {
    return c.json(withRequestId({ error: 'INVALID_JSON', message: 'بدنه درخواست JSON معتبر نیست' }), 400);
  }

  (c.get('logger') as Logger | undefined)?.error('unhandled.error', {
    error: err instanceof Error ? err.message : 'unknown',
    path: c.req.path,
    ...(requestId ? { request_id: requestId } : {})
  });
  return c.json(withRequestId({ error: 'INTERNAL_ERROR', message: 'خطای داخلی سرور' }), 500);
}
