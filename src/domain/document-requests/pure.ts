/**
 * ماژول درخواست مدارک از خانواده با بله — توابع خالص منطق محض (بدون I/O)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// منطق خالص مدارک — قابل تست بدون دیتابیس
// الگوی exercise-bank/pure: اعتبارسنجی ورودی + نرمال‌سازی + گاردهای رسانه

import { ALLOWED_EXERCISE_FILE_MIME_TYPES, MAX_EXERCISE_FILE_BYTES } from '@core/shared';
import type { DocMediaKind, DocRequestTemplate } from './types';

/** برچسب فارسی قالب‌های مدارک — متن پیام درخواست و برچسب کارت پنل */
export const DOC_REQUEST_TEMPLATE_LABELS: Record<DocRequestTemplate, string> = {
  dictation: 'نمونهٔ املا و نوشتن‌های کلاسی',
  report_card: 'کارنامه و برگه‌های مدرسه',
  teacher_report: 'گزارش کتبی معلم',
  prev_eval: 'ارزیابی/گزارش قبلی (بی‌بی‌اسک، گفتاردرمانی و…)'
};

const TEMPLATE_KEYS = Object.keys(DOC_REQUEST_TEMPLATE_LABELS) as DocRequestTemplate[];

/** سقف نویسهٔ یادداشت/مهلت — هم‌تراز کپشن پیام بله */
export const DOC_NOTE_MAX = 500;

/** برچسب فارسی وضعیت درخواست — کارت پنل */
export const DOC_REQUEST_STATUS_LABELS: Record<string, string> = {
  sent: 'در انتظار مدارک',
  received: 'مدارک رسید',
  closed: 'بسته‌شده'
};

/**
 * پارس/اعتبارسنجی قالب‌های درخواست — آرایهٔ خالی یا ناشناخته → null
 * ترتیب ورودی حفظ و تکرار حذف می‌شود (سقف = همهٔ قالب‌ها)
 */
export function parseDocTemplates(raw: unknown): DocRequestTemplate[] | null {
  if (!Array.isArray(raw)) return null;
  const out: DocRequestTemplate[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') return null;
    if (!TEMPLATE_KEYS.includes(item as DocRequestTemplate)) return null;
    if (!out.includes(item as DocRequestTemplate)) out.push(item as DocRequestTemplate);
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

/** گارد رسانهٔ خانواده — عکس همیشه مجاز؛ سند با whitelist همان تمرین‌ها؛ سقف حجم مشترک */
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
export function buildDocRequestBody(templates: DocRequestTemplate[], customNote: string | null, dueHint: string | null): string {
  const lines = ['این مدارک را برای پرونده نیاز داریم:'];
  for (const t of templates) {
    lines.push(`• ${DOC_REQUEST_TEMPLATE_LABELS[t]}`);
  }
  if (customNote) lines.push('', customNote);
  if (dueHint) lines.push(`مهلت پیشنهادی: ${dueHint}`);
  return lines.join('\n');
}
