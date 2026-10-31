import type { Context } from 'hono';
import { ZodError } from 'zod';
import { AppError, ConflictError } from '@core/errors';
import type { Logger } from '@core/logger';

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof ZodError) {
    return c.json(
      {
        error: 'VALIDATION_ERROR',
        message: 'ورودی نامعتبر است',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      },
      400
    );
  }

  if (err instanceof ConflictError) {
    return c.json(
      {
        error: 'CONFLICT',
        message: err.message,
        ...(err.currentVersion !== undefined ? { current_version: err.currentVersion } : {})
      },
      409
    );
  }

  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message }, err.status as 400 | 401 | 403 | 404 | 409 | 500);
  }

  if (err instanceof SyntaxError) {
    return c.json({ error: 'INVALID_JSON', message: 'بدنه درخواست JSON معتبر نیست' }, 400);
  }

  (c.get('logger') as Logger | undefined)?.error('unhandled.error', {
    error: err instanceof Error ? err.message : 'unknown',
    path: c.req.path
  });
  return c.json({ error: 'INTERNAL_ERROR', message: 'خطای داخلی سرور' }, 500);
}
