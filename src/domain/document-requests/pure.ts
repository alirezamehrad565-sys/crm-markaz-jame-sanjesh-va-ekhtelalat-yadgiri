import { ALLOWED_EXERCISE_FILE_MIME_TYPES, MAX_EXERCISE_FILE_BYTES } from '@core/shared';
import type { DocMediaKind, DocRecipient, DocTagKey } from './types';

export const DOC_TAG_PRESET_LABELS: Record<DocTagKey, string> = {
  narrative: 'نمونهٔ روایی',
  dictation: 'نمونهٔ املا',
  exam: 'برگهٔ امتحان',
  report_card: 'کارنامه',
  homework: 'نمونهٔ تکلیف',
  other: 'سایر مدارک'
};

export const DOC_TAG_LEGACY_LABELS: Record<string, string> = {
  teacher_report: 'گزارش کتبی معلم',
  prev_eval: 'ارزیابی/گزارش قبلی'
};

const PRESET_KEYS = Object.keys(DOC_TAG_PRESET_LABELS) as DocTagKey[];

export const DOC_RECIPIENT_LABELS: Record<DocRecipient, string> = {
  family: 'خانواده',
  teacher: 'معلم'
};

export const DOC_TAG_MAX_CHARS = 40;
export const DOC_TAGS_MAX = 8;

export const DOC_NOTE_MAX = 500;

export const DOC_REQUEST_STATUS_LABELS: Record<string, string> = {
  sent: 'در انتظار مدارک',
  received: 'مدارک رسید',
  closed: 'بسته‌شده'
};

export function docTagLabel(tag: string): string {
  return DOC_TAG_PRESET_LABELS[tag as DocTagKey] ?? DOC_TAG_LEGACY_LABELS[tag] ?? tag;
}

export function normalizeDocTag(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length === 0) return null;
  return Array.from(s).slice(0, DOC_TAG_MAX_CHARS).join('');
}

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

export function parseDocRecipients(raw: unknown): DocRecipient[] | null {
  if (!Array.isArray(raw)) return null;
  const out: DocRecipient[] = [];
  for (const item of raw) {
    if (item !== 'family' && item !== 'teacher') return null;
    if (!out.includes(item)) out.push(item);
  }
  return out.length > 0 ? out : null;
}

export function normalizeDocNote(raw: string | null | undefined, max = DOC_NOTE_MAX): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s.length === 0) return null;
  return Array.from(s).slice(0, max).join('');
}

export function sanitizeDocFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? '';
  return base.replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function resolveDocFileName(media: { type: DocMediaKind; fileName: string | null }, fetchedMime: string, stampIso: string): string {
  if (media.type === 'document' && media.fileName) {
    return sanitizeDocFilename(media.fileName);
  }
  const stamp = stampIso.slice(0, 19).replace(/[-:T]/g, '');
  const ext = fetchedMime.includes('png') ? 'png' : fetchedMime.includes('webp') ? 'webp' : 'jpg';
  return `مدرک-${stamp}.${ext}`;
}

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

export function buildDocRequestBody(tags: string[], customNote: string | null, dueHint: string | null): string {
  const lines = ['این مدارک را برای پرونده نیاز داریم:'];
  for (const t of tags) {
    lines.push(`• ${docTagLabel(t)}`);
  }
  if (customNote) lines.push('', customNote);
  if (dueHint) lines.push(`مهلت پیشنهادی: ${dueHint}`);
  return lines.join('\n');
}
