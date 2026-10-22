/**
 * ماژول درخواست مدارک از خانواده/معلم با بله — توابع خالص منطق محض (بدون I/O)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// منطق خالص مدارک — قابل تست بدون دیتابیس
// الگوی exercise-bank/pure: اعتبارسنجی ورودی + نرمال‌سازی + گاردهای رسانه
// m166: قالب‌های ساخت‌یافته → تگ‌های روشن پیش‌فرض + تگ دلخواه کوتاه؛ دستهٔ مبهم
// «گزارش بی‌بی‌اسک» حذف شد — کلیدهای قدیمی فقط برای نمایش درست رکوردهای قدیمی می‌مانند.

import { ALLOWED_EXERCISE_FILE_MIME_TYPES, MAX_EXERCISE_FILE_BYTES } from '@core/shared';
import type { DocMediaKind, DocRecipient, DocTagKey } from './types';

/** تگ‌های پیش‌فرض درخواست مدارک — به‌زبان روزمرهٔ درمانگر/معلم (m166) */
export const DOC_TAG_PRESET_LABELS: Record<DocTagKey, string> = {
  narrative: 'نمونهٔ روایی',
  dictation: 'نمونهٔ املا',
  exam: 'برگهٔ امتحان',
  report_card: 'کارنامه',
  homework: 'نمونهٔ تکلیف',
  other: 'سایر مدارک'
};

/** برچسب کلیدهای قدیمی (m151) — فقط برای نمایش رکوردهای قدیمی؛ در فرم جدید نمی‌آید */
export const DOC_TAG_LEGACY_LABELS: Record<string, string> = {
  teacher_report: 'گزارش کتبی معلم',
  prev_eval: 'ارزیابی/گزارش قبلی'
};

const PRESET_KEYS = Object.keys(DOC_TAG_PRESET_LABELS) as DocTagKey[];

/** برچسب فارسی گیرنده‌ها — کارت پنل */
export const DOC_RECIPIENT_LABELS: Record<DocRecipient, string> = {
  family: 'خانواده',
  teacher: 'معلم'
};

/** سقف نویسهٔ هر تگ دلخواه / تعداد تگ‌ها — ضد شلوغی کارت و پیام */
export const DOC_TAG_MAX_CHARS = 40;
export const DOC_TAGS_MAX = 8;

/** سقف نویسهٔ یادداشت/مهلت — هم‌تراز کپشن پیام بله */
export const DOC_NOTE_MAX = 500;

/** برچسب فارسی وضعیت درخواست — کارت پنل */
export const DOC_REQUEST_STATUS_LABELS: Record<string, string> = {
  sent: 'در انتظار مدارک',
  received: 'مدارک رسید',
  closed: 'بسته‌شده'
};

/** برچسب یک تگ — پیش‌فرض/قدیمی → برچسب فارسی؛ تگ دلخواه → متن خودش */
export function docTagLabel(tag: string): string {
  return DOC_TAG_PRESET_LABELS[tag as DocTagKey] ?? DOC_TAG_LEGACY_LABELS[tag] ?? tag;
}

/** نرمال‌سازی یک تگ دلخواه — فروکاستن فاصله + سقف نویسه (Array.from — امن برای نیم‌فاصله/اموجی) */
export function normalizeDocTag(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length === 0) return null;
  return Array.from(s).slice(0, DOC_TAG_MAX_CHARS).join('');
}

/**
 * پارس تگ‌های درخواست — کلید پیش‌فرض عیناً؛ بقیه به‌عنوان تگ دلخواه نرمال می‌شود.
 * غیر آرایه/آیتم غیر رشته‌ای → null (خطای ۴۰۰)؛ آیتم خالی حذف؛ تکرار حذف؛ سقف ۸ تگ.
 */
export function parseDocTags(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') return null;
    const tag = PRESET_KEYS.includes(item as DocTagKey) ? item : normalizeDocTag(item);
    if (!tag || out.includes(tag)) continue;
    out.push(tag);
  }
  return out.length > 0 ? out.slice(0, DOC_TAGS_MAX) : null;
}

/** پارس گیرنده‌ها — زیرمجموعهٔ family/teacher بدون تکرار؛ نامعتبر یا خالی → null */
export function parseDocRecipients(raw: unknown): DocRecipient[] | null {
  if (!Array.isArray(raw)) return null;
  const out: DocRecipient[] = [];
  for (const item of raw) {
    if (item !== 'family' && item !== 'teacher') return null;
    if (!out.includes(item)) out.push(item);
  }
  return out.length > 0 ? out : null;
}

/** فروکاستن فاصله‌ها + سقف نویسه (Array.from — امن برای نیم‌فاصله/اموجی) */
export function normalizeDocNote(raw: string | null | undefined, max = DOC_NOTE_MAX): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s.length === 0) return null;
  return Array.from(s).slice(0, max).join('');
}

/** پاک‌سازی نام فایل: حذف مسیر (../ و / و \) + فروکاستن فاصله — الگوی exercise-bank */
export function sanitizeDocFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? '';
  return base.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * نام فایل نهایی مدرک — سند: نام اعلامی بله؛ عکس: نام تولیدی خوانا
 * (الگوی resolveFileName بات بازگشت تکلیف)
 */
export function resolveDocFileName(media: { type: DocMediaKind; fileName: string | null }, fetchedMime: string, stampIso: string): string {
  if (media.type === 'document' && media.fileName) {
    return sanitizeDocFilename(media.fileName);
  }
  const stamp = stampIso.slice(0, 19).replace(/[-:T]/g, '');
  const ext = fetchedMime.includes('png') ? 'png' : fetchedMime.includes('webp') ? 'webp' : 'jpg';
  return `مدرک-${stamp}.${ext}`;
}

/** گارد رسانهٔ خانواده/معلم — عکس همیشه مجاز؛ سند با whitelist همان تمرین‌ها؛ سقف حجم مشترک */
export function guardDocMedia(media: { type: DocMediaKind; mime: string | null; size: number | null }): 'ok' | 'bad_type' | 'too_large' {
  if (media.type === 'document') {
    const declaredMime = (media.mime ?? 'application/octet-stream').toLowerCase();
    if (!(ALLOWED_EXERCISE_FILE_MIME_TYPES as readonly string[]).includes(declaredMime)) {
      return 'bad_type';
    }
  }
  if (media.size !== null && media.size > MAX_EXERCISE_FILE_BYTES) {
    return 'too_large';
  }
  return 'ok';
}

/** متن بدنهٔ پیام درخواست (بدون سلام/پانویس — آن‌ها در قالب notify است) */
export function buildDocRequestBody(tags: string[], customNote: string | null, dueHint: string | null): string {
  const lines = ['این مدارک را برای پرونده نیاز داریم:'];
  for (const t of tags) {
    lines.push(`• ${docTagLabel(t)}`);
  }
  if (customNote) lines.push('', customNote);
  if (dueHint) lines.push(`مهلت پیشنهادی: ${dueHint}`);
  return lines.join('\n');
}
