/* architecture-005 (۱.۲۷.۸۴): گروه اعتبارسنجی فایل به @core/shared/file-sanitize رفت —
   این مسیر فقط سازگاری برای مصرف‌کنندگان درون-دامنه است */
export {
  estimateBase64Bytes,
  stripDataUrlPrefix,
  isAllowedExerciseMimeType,
  sanitizeFilename,
  validateExerciseFileInput,
  validateExerciseFileBytes
} from '@core/shared';

export function normalizeExerciseTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
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
