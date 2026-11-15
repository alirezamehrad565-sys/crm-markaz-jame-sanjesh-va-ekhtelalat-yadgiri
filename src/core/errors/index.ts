export { AppError, AuthError, ConflictError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from './errors';
export type { ErrorCode } from './errors';
export { humanizeError } from './human-messages'; // ۱.۲۶.۴ — رویدادهای انسانی تازه هم از همین نگاشت می‌آیند
export type { HumanErrorKind, HumanMessage } from './human-messages';
