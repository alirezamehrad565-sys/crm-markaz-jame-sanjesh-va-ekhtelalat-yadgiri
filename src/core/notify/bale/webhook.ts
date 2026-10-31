export interface BalePhotoSize {
  file_id?: string;
  file_size?: number | null;
  width?: number;
  height?: number;
}

export interface BaleDocument {
  file_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number | null;
}

export interface BaleUpdateMessage {
  message_id?: number;
  chat?: { id?: number | string; type?: string };
  from?: { id?: number | string; first_name?: string };
  text?: string;
  photo?: BalePhotoSize[];
  document?: BaleDocument;
  caption?: string;
}

export interface BotMedia {
  type: 'photo' | 'document';
  fileId: string;
  fileName: string | null;
  mime: string | null;
  size: number | null;
}

export interface BaleCallbackQuery {
  id?: number | string;
  data?: string;
  message?: BaleUpdateMessage;
  from?: { id?: number | string; first_name?: string };
}

export interface BaleUpdate {
  update_id?: number;
  message?: BaleUpdateMessage;
  edited_message?: BaleUpdateMessage;
  callback_query?: BaleCallbackQuery;
}

export type IdentityFormat = 'national_id' | 'phone' | 'invalid';

export type BotCommand =
  | { kind: 'start'; chatId: string; firstName?: string; payload?: string }
  | { kind: 'help'; chatId: string }
  | { kind: 'about'; chatId: string }
  | { kind: 'myid'; chatId: string }
  | { kind: 'link'; chatId: string; code: string }
  | { kind: 'schedule'; chatId: string; scope: 'today' | 'week' }
  | { kind: 'my_next'; chatId: string }
  | { kind: 'identify'; chatId: string; format: IdentityFormat; value: string }
  | { kind: 'cancel_ask'; chatId: string; appointmentId: string }
  | { kind: 'cancel_do'; chatId: string; appointmentId: string }
  | { kind: 'followups_me'; chatId: string }
  | { kind: 'followup_done'; chatId: string; followupId: string }
  | { kind: 'attendance_summary'; chatId: string }
  | { kind: 'unlink_ask'; chatId: string }
  | { kind: 'unlink_do'; chatId: string }
  | { kind: 'unlink_no'; chatId: string }
  | { kind: 'contact'; chatId: string }
  | { kind: 'public_files'; chatId: string }
  | { kind: 'pfile_get'; chatId: string; idx: number }
  | { kind: 'services'; chatId: string }
  | { kind: 'auth_guide'; chatId: string }
  | { kind: 'pending_homework'; chatId: string }
  | { kind: 'class_activity'; chatId: string }
  | { kind: 'awareness_root'; chatId: string }
  | { kind: 'awareness_section'; chatId: string; section: AwSection; page: number }
  | { kind: 'awareness_item'; chatId: string; section: AwSection; idx: number }
  | { kind: 'exb_root'; chatId: string }
  | { kind: 'exb_cats'; chatId: string; cat: ExbCat; page: number }
  | { kind: 'exb_list'; chatId: string; cat: ExbCat; tagIdx: number; page: number }
  | { kind: 'exb_item'; chatId: string; idx: number }
  | { kind: 'exb_send'; chatId: string; idx: number } // یک کلیک = ارسال همهٔ فایل‌های تمرین
  | { kind: 'exb_file'; chatId: string; idx: number; fileIdx: number }
  | { kind: 'media_received'; chatId: string; media: BotMedia; caption: string | null }
  | { kind: 'sub_pick'; chatId: string; idx: number }
  | { kind: 'flow_cancel'; chatId: string }
  | { kind: 'clf_list'; chatId: string }
  | { kind: 'clf_fill'; chatId: string; eventId: string }
  | { kind: 'clf_a'; chatId: string; value: number }
  | { kind: 'clf_do'; chatId: string }
  | { kind: 'clf_no'; chatId: string }
  | { kind: 'unknown'; chatId: string; text: string };

export type ExbCat = 'a' | 'd' | 'g' | 'o';

export type AwSection = 't' | 'd';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ZWNJ = '\u200c';
const ZWJ = '\u200d';

export function stripToDigits(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) {
      out += String(p);
      continue;
    }
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) {
      out += String(a);
      continue;
    }
    if (ch >= '0' && ch <= '9') out += ch;
  }
  return out;
}

export function classifyIdentityDigits(digits: string): IdentityFormat {
  if (digits.length === 10) return 'national_id';
  if (digits.length === 11 && digits.startsWith('09')) return 'phone';
  if (digits.length === 12 && digits.startsWith('98')) return 'phone';
  return 'invalid';
}

export function normalizePhoneDigits(digits: string): string {
  if (digits.length === 12 && digits.startsWith('98')) return '0' + digits.slice(2);
  return digits;
}

function normalizeMenuText(text: string): string {
  return text.split(ZWNJ).join('').split(ZWJ).join('').trim();
}

const IDENTITY_SEPARATORS = /[\s+\-()./،,ـ_]/g;

export function isIdentityText(text: string): boolean {
  const withoutSeparators = text.replace(IDENTITY_SEPARATORS, '');
  if (withoutSeparators.length === 0) return false;
  for (const ch of withoutSeparators) {
    const isAsciiDigit = ch >= '0' && ch <= '9';
    const isPersian = PERSIAN_DIGITS.indexOf(ch) >= 0;
    const isArabic = ARABIC_DIGITS.indexOf(ch) >= 0;
    if (!isAsciiDigit && !isPersian && !isArabic) return false;
  }
  return true;
}

const MY_NEXT_LABELS = new Set(['نوبت‌های من', 'نوبتهای من', 'نوبت های من', 'نوبت‌های دانش‌آموز من', 'نوبت های دانش آموز من', 'نوبتهای دانش آموز من', 'نوبتهای دانشآموز من', 'نوبت های دانشآموز من']);
const HELP_LABELS = new Set(['راهنما', 'کمک']);
const ABOUT_LABELS = new Set(['درباره مرکز', 'درباره مرکز', 'درباره ما', 'دربارهی مرکز', 'درباره ی مرکز', 'معرفی مرکز', 'معرفی مرکز', 'معرفی ما']);
const FOLLOWUPS_LABELS = new Set(['پیگیریهای من', 'پیگیری های من']);
const ATTENDANCE_LABELS = new Set(['حضور فرزند', 'حضور']);
const UNLINK_LABELS = new Set(['قطع اتصال', 'خروج از نقش', 'قطع ارتباط', 'جدا کردن گفتگو']);
const EXB_LABELS = new Set(['بانک تمرین', 'بانک تمرینها', 'بانک تمرین ها', 'بانکتمرین', 'بانکتمرینها', 'کارت‌های آماده', 'کارت های آماده', 'کارتهای آماده', 'کارت‌های آمادهها', 'کارت‌های آماده ها', 'کارتهایآماده']); // نام جدید + قدیم (سازگاری منوهای باز)
const CONTACT_LABELS = new Set(['شماره تماس', 'شمارهٔ تماس', 'تماس با ما', 'راه‌های ارتباطی', 'راه های ارتباطی', 'راههای ارتباطی', 'ارتباط با ما']);
const FILES_LABELS = new Set(['فایل‌های آموزشی', 'فایلهای آموزشی', 'فایل های آموزشی']);
const SERVICES_LABELS = new Set(['خدمات مرکز', 'معرفی خدمات مرکز', 'معرفی خدمات', 'خدمات']);
const AUTH_LABELS = new Set(['احراز هویت', 'ورود به بات', 'اتصال گفتگو', 'اتصال']);
const PENDING_HW_LABELS = new Set(['تمرین‌های انجام‌نشده', 'تمرینهای انجام نشده', 'تمرین های انجام نشده', 'تمرینهای انجامنشده', 'تکلیف‌های انجام‌نشده', 'تکلیفهای انجام نشده', 'تکلیفهای انجامنشده']);
const CLASS_ACTIVITY_LABELS = new Set(['فعالیت کلاس', 'فعالیت های کلاس', 'فعالیت‌های کلاس', 'فعالیتهای کلاس']);
const AWARENESS_LABELS = new Set(['آگاهی‌های اختلالات', 'آگاهی های اختلالات', 'آگاهیهای اختلالات', 'بانک آگاهی', 'اختلال‌ها', 'اختلالها']);
const CLASS_APPTS_LABELS = new Set(['نوبت‌های کلاس من', 'نوبت های کلاس من', 'نوبتهای کلاس من']);

export const CLF_LIST_LABELS = new Set([
  'چک‌لیست‌های من',
  'چکلیستهای من',
  'چکلیست های من',
  'چک لیست های من',
  'چکلیست‌های من',
  'چک لیست‌های من'
]);

export function pickLargestPhoto(list: BalePhotoSize[]): BalePhotoSize | null {
  let best: BalePhotoSize | null = null;
  let bestScore = -1;
  for (const p of list) {
    if (!p || typeof p.file_id !== 'string' || p.file_id.length === 0) continue;
    const size = typeof p.file_size === 'number' && p.file_size > 0 ? p.file_size : null;
    const area = typeof p.width === 'number' && typeof p.height === 'number' ? p.width * p.height : null;
    const score = size ?? area ?? 0;
    if (score >= bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

export function extractMedia(msg: BaleUpdateMessage): BotMedia | null {
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const best = pickLargestPhoto(msg.photo);
    if (best?.file_id) {
      return {
        type: 'photo',
        fileId: best.file_id,
        fileName: null,
        mime: 'image/jpeg',
        size: typeof best.file_size === 'number' ? best.file_size : null
      };
    }
  }
  const doc = msg.document;
  if (doc && typeof doc === 'object' && typeof doc.file_id === 'string' && doc.file_id.length > 0) {
    return {
      type: 'document',
      fileId: doc.file_id,
      fileName: typeof doc.file_name === 'string' && doc.file_name.trim().length > 0 ? doc.file_name.trim() : null,
      mime: typeof doc.mime_type === 'string' && doc.mime_type.trim().length > 0 ? doc.mime_type.trim() : null,
      size: typeof doc.file_size === 'number' ? doc.file_size : null
    };
  }
  return null;
}

export function normalizeCaption(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s.length === 0) return null;
  return Array.from(s).slice(0, 500).join('');
}

export function parseSubCallback(data: string, chatId: string): BotCommand | null {
  const parts = data.split(':');
  if (parts[1] === 'pick') {
    const idx = toIndex(parts[2]);
    if (Number.isNaN(idx)) return null;
    return { kind: 'sub_pick', chatId, idx };
  }
  return null;
}

function parseCallbackData(data: string): { action: 'ask' | 'cancel' | 'fudone'; targetId: string } | null {
  const sep = data.indexOf(':');
  if (sep <= 0) return null;
  const action = data.slice(0, sep);
  const targetId = data.slice(sep + 1).trim();
  if (targetId.length === 0) return null;
  if (action === 'ask') return { action: 'ask', targetId };
  if (action === 'cancel') return { action: 'cancel', targetId };
  if (action === 'fudone') return { action: 'fudone', targetId };
  return null;
}

function toIndex(raw: string | undefined): number {
  if (!raw) return NaN;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

const EXB_CATS = new Set(['a', 'd', 'g', 'o']);

export function parseAwarenessCallback(data: string, chatId: string): BotCommand | null {
  const parts = data.split(':');
  if (parts[1] !== 'root' && parts[1] !== 't' && parts[1] !== 'd') return null;
  if (parts[1] === 'root') return { kind: 'awareness_root', chatId };
  const section = parts[1] as AwSection;
  if (parts.length === 2) return { kind: 'awareness_section', chatId, section, page: 1 };
  const idx = toIndex(parts[2]);
  if (Number.isNaN(idx)) return null;
  return { kind: 'awareness_item', chatId, section, idx };
}

export function parseClfCallback(data: string, chatId: string): BotCommand | null {
  const parts = data.split(':');
  if (parts[1] === 'fill') {
    const eventId = (parts[2] ?? '').trim();
    if (!/^[0-9a-fA-F-]{8,64}$/.test(eventId)) return null;
    return { kind: 'clf_fill', chatId, eventId };
  }
  if (parts[1] === 'a') {
    const value = toIndex(parts[2]);
    if (Number.isNaN(value)) return null;
    return { kind: 'clf_a', chatId, value };
  }
  if (parts[1] === 'do') return { kind: 'clf_do', chatId };
  if (parts[1] === 'no') return { kind: 'clf_no', chatId };
  return null;
}

export function parseExbCallback(data: string, chatId: string): BotCommand | null {
  const parts = data.split(':');
  switch (parts[1]) {
    case 'root':
      return { kind: 'exb_root', chatId };
    case 'cats': {
      const cat = parts[2];
      const page = toIndex(parts[3]);
      if (!cat || !EXB_CATS.has(cat) || Number.isNaN(page)) return null;
      return { kind: 'exb_cats', chatId, cat: cat as ExbCat, page };
    }
    case 'lst': {
      const cat = parts[2];
      const tagIdx = toIndex(parts[3]);
      const page = toIndex(parts[4]);
      if (!cat || !EXB_CATS.has(cat) || Number.isNaN(tagIdx) || Number.isNaN(page)) return null;
      return { kind: 'exb_list', chatId, cat: cat as ExbCat, tagIdx, page };
    }
    case 'item': {
      const idx = toIndex(parts[2]);
      if (Number.isNaN(idx)) return null;
      return { kind: 'exb_item', chatId, idx };
    }
    case 'get': {
      // یک کلیک روی تمرین در فهرست → ارسال همهٔ فایل‌ها (جزئیات با exb:item در دسترس می‌ماند)
      const idx = toIndex(parts[2]);
      if (Number.isNaN(idx)) return null;
      return { kind: 'exb_send', chatId, idx };
    }
    case 'file': {
      const idx = toIndex(parts[2]);
      const fileIdx = toIndex(parts[3]);
      if (Number.isNaN(idx) || Number.isNaN(fileIdx)) return null;
      return { kind: 'exb_file', chatId, idx, fileIdx };
    }
    case 'lfile': {
      const idx = toIndex(parts[2]);
      if (Number.isNaN(idx)) return null;
      return { kind: 'exb_file', chatId, idx, fileIdx: -1 };
    }
    default:
      return null;
  }
}

export function parseBotUpdate(update: unknown): BotCommand | null {
  if (typeof update !== 'object' || update === null) return null;

  const u = update as BaleUpdate;

  if (u.callback_query && typeof u.callback_query === 'object') {
    const cbChatId = u.callback_query.message?.chat?.id;
    if (cbChatId === undefined || cbChatId === null) return null;
    const data = typeof u.callback_query.data === 'string' ? u.callback_query.data.trim() : '';
    if (data.startsWith('exb:')) {
      return parseExbCallback(data, String(cbChatId));
    }
    if (data.startsWith('sub:')) {
      return parseSubCallback(data, String(cbChatId));
    }
    if (data.startsWith('pfl:')) {
      const parts = data.split(':');
      if (parts[1] === 'get') {
        const idx = toIndex(parts[2]);
        if (Number.isNaN(idx)) return null;
        return { kind: 'pfile_get', chatId: String(cbChatId), idx };
      }
      return null;
    }
    if (data === 'unlink:do') return { kind: 'unlink_do', chatId: String(cbChatId) };
    if (data === 'unlink:no') return { kind: 'unlink_no', chatId: String(cbChatId) };
    if (data.startsWith('dis:')) return parseAwarenessCallback(data, String(cbChatId));
    if (data.startsWith('clf:')) return parseClfCallback(data, String(cbChatId));
    const parsed = parseCallbackData(data);
    if (!parsed) return null;
    if (parsed.action === 'ask') return { kind: 'cancel_ask', chatId: String(cbChatId), appointmentId: parsed.targetId };
    if (parsed.action === 'cancel') return { kind: 'cancel_do', chatId: String(cbChatId), appointmentId: parsed.targetId };
    return { kind: 'followup_done', chatId: String(cbChatId), followupId: parsed.targetId };
  }

  const msg = u.message ?? u.edited_message;
  if (!msg || typeof msg !== 'object') return null;

  const chatId = msg.chat?.id;
  if (chatId === undefined || chatId === null) return null;
  const chatIdStr = String(chatId);

  const media = extractMedia(msg);
  if (media) {
    return { kind: 'media_received', chatId: chatIdStr, media, caption: normalizeCaption(msg.caption) };
  }

  const text = typeof msg.text === 'string' ? msg.text.trim() : '';
  if (text.length === 0) return null;

  const menuText = normalizeMenuText(text);
  if (MY_NEXT_LABELS.has(menuText)) return { kind: 'my_next', chatId: chatIdStr };
  if (HELP_LABELS.has(menuText)) return { kind: 'help', chatId: chatIdStr };
  if (ABOUT_LABELS.has(menuText)) return { kind: 'about', chatId: chatIdStr };
  if (FOLLOWUPS_LABELS.has(menuText)) return { kind: 'followups_me', chatId: chatIdStr };
  if (ATTENDANCE_LABELS.has(menuText)) return { kind: 'attendance_summary', chatId: chatIdStr };
  if (UNLINK_LABELS.has(menuText)) return { kind: 'unlink_ask', chatId: chatIdStr };
  if (EXB_LABELS.has(menuText)) return { kind: 'exb_root', chatId: chatIdStr };
  if (CONTACT_LABELS.has(menuText)) return { kind: 'contact', chatId: chatIdStr };
  if (FILES_LABELS.has(menuText)) return { kind: 'public_files', chatId: chatIdStr };
  if (SERVICES_LABELS.has(menuText)) return { kind: 'services', chatId: chatIdStr };
  if (AUTH_LABELS.has(menuText)) return { kind: 'auth_guide', chatId: chatIdStr };
  if (PENDING_HW_LABELS.has(menuText)) return { kind: 'pending_homework', chatId: chatIdStr };
  if (CLASS_ACTIVITY_LABELS.has(menuText)) return { kind: 'class_activity', chatId: chatIdStr };
  if (AWARENESS_LABELS.has(menuText)) return { kind: 'awareness_root', chatId: chatIdStr };
  if (CLASS_APPTS_LABELS.has(menuText)) return { kind: 'my_next', chatId: chatIdStr };
  if (CLF_LIST_LABELS.has(menuText)) return { kind: 'clf_list', chatId: chatIdStr };

  if (!text.startsWith('/')) {
    if (!isIdentityText(text)) return null;
    const digits = stripToDigits(text);
    if (digits.length >= 4 && digits.length <= 15) {
      return { kind: 'identify', chatId: chatIdStr, format: classifyIdentityDigits(digits), value: digits };
    }
    return null;
  }

  const spaceIndex = text.indexOf(' ');
  const rawCommand = (spaceIndex === -1 ? text : text.slice(0, spaceIndex)).toLowerCase();
  const arg = spaceIndex === -1 ? '' : text.slice(spaceIndex + 1).trim();

  switch (rawCommand) {
    case '/start': {
      const startPayload = arg.replace(/\s+/g, '').toUpperCase().slice(0, 32);
      return { kind: 'start', chatId: chatIdStr, firstName: msg.from?.first_name, payload: startPayload.length > 0 ? startPayload : undefined };
    }
    case '/help':
      return { kind: 'help', chatId: chatIdStr };
    case '/about':
      return { kind: 'about', chatId: chatIdStr };
    case '/myid':
      return { kind: 'myid', chatId: chatIdStr };
    case '/today':
      return { kind: 'schedule', chatId: chatIdStr, scope: 'today' };
    case '/week':
      return { kind: 'schedule', chatId: chatIdStr, scope: 'week' };
    case '/mynext':
      return { kind: 'my_next', chatId: chatIdStr };
    case '/followups':
      return { kind: 'followups_me', chatId: chatIdStr };
    case '/attendance':
      return { kind: 'attendance_summary', chatId: chatIdStr };
    case '/unlink':
      return { kind: 'unlink_ask', chatId: chatIdStr };
    case '/bank':
      return { kind: 'exb_root', chatId: chatIdStr };
    case '/contact':
    case '/phone':
      return { kind: 'contact', chatId: chatIdStr };
    case '/files':
      return { kind: 'public_files', chatId: chatIdStr };
    case '/services':
      return { kind: 'services', chatId: chatIdStr };
    case '/auth':
      return { kind: 'auth_guide', chatId: chatIdStr };
    case '/pending':
      return { kind: 'pending_homework', chatId: chatIdStr };
    case '/activity':
      return { kind: 'class_activity', chatId: chatIdStr };
    case '/awareness':
      return { kind: 'awareness_root', chatId: chatIdStr };
    case '/checklist':
      return { kind: 'clf_list', chatId: chatIdStr };
    case '/link': {
      const code = arg.replace(/\s+/g, '').toUpperCase();
      if (code.length === 0) return { kind: 'unknown', chatId: chatIdStr, text };
      return { kind: 'link', chatId: chatIdStr, code };
    }
    case '/cancel':
      return { kind: 'flow_cancel', chatId: chatIdStr };
    default:
      return { kind: 'unknown', chatId: chatIdStr, text };
  }
}

const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateLinkCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += LINK_CODE_ALPHABET[bytes[i] % LINK_CODE_ALPHABET.length];
  }
  return out;
}
