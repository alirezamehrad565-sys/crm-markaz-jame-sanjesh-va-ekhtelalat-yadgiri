import { ALLOWED_EXERCISE_FILE_MIME_TYPES, MAX_EXERCISE_FILE_BYTES } from '@core/shared';

function faNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

export function normalizeExerciseTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function estimateBase64Bytes(b64: string): number {
  const s = b64.replace(/\s/g, '');
  const padding = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - padding);
}

export function stripDataUrlPrefix(b64: string): string {
  return b64.replace(/^data:[^;]*;base64,/, '');
}

export function isAllowedExerciseMimeType(mime: string): boolean {
  return (ALLOWED_EXERCISE_FILE_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}

export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? '';
  return base.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function sizeLimitMessage(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const limitLabel = mb >= 1 ? `${faNum(Math.round(mb))} مگابایت` : `${faNum(Math.round(bytes / 1024))} کیلوبایت`;
  return `حجم فایل بیش از ${limitLabel} است`;
}

export function validateExerciseFileInput(
  input: {
    filename: string;
    mimeType: string;
    contentB64: string;
  },
  maxBytes: number = MAX_EXERCISE_FILE_BYTES
): { ok: true } | { ok: false; reason: string } {
  const filename = sanitizeFilename(input.filename);
  if (filename.length === 0) return { ok: false, reason: 'نام فایل نامعتبر است' };
  if (!isAllowedExerciseMimeType(input.mimeType)) {
    return { ok: false, reason: 'این نوع فایل مجاز نیست — فقط سند، تصویر، ویدیو و HTML کاربرگ' };
  }
  const bytes = estimateBase64Bytes(stripDataUrlPrefix(input.contentB64));
  if (bytes <= 0) return { ok: false, reason: 'محتوای فایل خالی است' };
  if (bytes > maxBytes) return { ok: false, reason: sizeLimitMessage(maxBytes) };
  return { ok: true };
}

export function validateExerciseFileBytes(
  input: {
    filename: string;
    mimeType: string;
    size: number;
  },
  maxBytes: number
): { ok: true } | { ok: false; reason: string } {
  const filename = sanitizeFilename(input.filename);
  if (filename.length === 0) return { ok: false, reason: 'نام فایل نامعتبر است' };
  if (!isAllowedExerciseMimeType(input.mimeType)) {
    return { ok: false, reason: 'این نوع فایل مجاز نیست — فقط سند، تصویر، ویدیو و HTML کاربرگ' };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, reason: 'محتوای فایل خالی است' };
  if (input.size > maxBytes) return { ok: false, reason: sizeLimitMessage(maxBytes) };
  return { ok: true };
}

export function clampPage(page: number | undefined): number {
  const n = Number(page);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export interface PageWindow {
  page: number;
  offset: number;
  totalPages: number;
  hasMore: boolean;
}

export function pageWindow(total: number, page: number, pageSize: number): PageWindow {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  return {
    page: safePage,
    offset: (safePage - 1) * pageSize,
    totalPages,
    hasMore: safePage < totalPages
  };
}

export function truncateLabel(raw: string, max = 26): string {
  const s = raw.trim();
  if (s.length <= max) return s;
  return Array.from(s).slice(0, max - 1).join('') + '…';
}
