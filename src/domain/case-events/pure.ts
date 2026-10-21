/**
 * ماژول رویدادساز (فرم/پرسش‌نامه/چک‌لیست) — توابع خالص منطق محض (بدون I/O)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// اعتبارسنجی خالص: تعریف نوع، payload رویداد و تحلیل چک‌لیست
// پیوست فایل (الگوی ) + ماتریس ترنزیشن با پیش‌نویس
// همهٔ توابع بدون db — تست‌پذیری کامل + همان قرارداد سایر دامنه‌ها

import { z } from 'zod';
import { ValidationError } from '@core/errors';
import { ALLOWED_FILE_MIME_TYPES, MAX_FILE_BYTES } from '@core/shared';
import type {
  CaseEventAnalysis, CaseEventBand, CaseEventField, CaseEventFieldType, CaseEventFlag,
  CaseEventSubscale, CaseEventSubscaleScore, CaseEventScoredOption
} from './types';
import { CASE_EVENT_CATEGORIES, CASE_EVENT_FIELD_TYPES, CASE_EVENT_BAND_COLORS } from './types';

// ───────── سقف‌ها ─────────

export const TYPE_TITLE_MAX = 120;
export const TYPE_KEY_MAX = 60;
// ۸→۱۶: آیکون‌های وکتور جدید (clipboard=۹، calculator=۱۰) در سقف ۸ می‌ماندند
// و ساخت هر قالب با پیام عمومی «ورودی نامعتبر است» رد می‌شد (باگ رویدادساز)
export const TYPE_ICON_MAX = 16;
export const FIELD_LABEL_MAX = 120;
export const FIELD_KEY_MAX = 60;
export const FIELD_OPTION_MAX = 120;
/** — ۱۶: سلکت پایهٔ شرح حال v2 (پیش‌دبستانی تا دوازدهم = ۱۳ گزینه) — فرم‌ساز پنل همان ۱۲ را می‌سازد */
export const FIELD_OPTIONS_MAX = 16;
/** — ۴۵: باتری بالینی ثابت (SCARED 41 + SDQ 25 + SNAP-IV 26) — فرم‌ساز آزاد همان سقف را می‌گیرد */
export const FIELDS_MAX = 45;
export const SCALE_MAX_LIMIT = 10;
export const EVENT_TEXT_MAX = 200;
export const EVENT_LONGTEXT_MAX = 2000;
export const EVENT_SUMMARY_MAX = 300;
export const BANDS_MAX = 5;
export const BAND_LABEL_MAX = 80;
/** — توصیه/تفسیر هر باند */
export const BAND_ADVICE_MAX = 400;
/** — زیرمقیاس‌ها */
export const SUBSCALES_MAX = 8;
export const SUBSCALE_NAME_MAX = 60;
export const SUBSCALE_ID_MAX = 40;
/** — نمرهٔ هر گزینه */
export const OPTION_SCORE_LIMIT = SCALE_MAX_LIMIT;
/** آستانهٔ ویزارد بات — چک‌لیست بلندتر → وب‌فرم (تصمیم ۳ طراحی) */
export const CHECKLIST_BOT_MAX_ITEMS = 8;
/** — سقف پیوست هر رویداد — هم‌تراز */
export const EVENT_FILES_MAX = 10;
/** — کلید فیلد «اقدام بعدی» — مقدار follow_up آن هوک ساخت پیگیری دارد */
export const NEXT_ACTION_FIELD_KEY = 'next_action';

// ─── پکیج فرم جامع خانواده (T5 m150 — چند-ابزاری) ───

/** کلید پکیج فرم جامع خانواده — تعریف کامل در clinical-engine/battery-composite.json */
export const COMPOSITE_FAMILY_KEY = 'ce-comp-family-v2';
/**
 * کامپوننت‌های پکیج به‌ترتیب اجرا — آینهٔ packageComponents در battery-composite.json
 * (تست پاریتی دو سمت را گوار می‌کند). هر کامپوننت در submit، رویداد مستقل خودش را می‌گیرد
 * (همان اسکورینگ/زیرمقیاس/باند ابزار تکی) — موتور بعداً هر دو منبع تکی/تجمیعی را با همان قواعد می‌خواند.
 */
export const COMPOSITE_FAMILY_COMPONENTS: readonly string[] = [
  'ce-snap-iv-p-v1',
  'ce-sdq-p-v1',
  'ce-scared-p-v1',
  'ce-id-adapt-v1'
];

/** آیا این نوع، پکیج چند-ابزاری است؟ کامپوننت‌ها را به‌ترتیب می‌دهد؛ وگرنه null */
export function packageComponentsOf(typeKey: string | null | undefined): readonly string[] | null {
  if (typeKey === COMPOSITE_FAMILY_KEY) return COMPOSITE_FAMILY_COMPONENTS;
  return null;
}

/** — مقدارهای مجاز فیلد اقدام بعدی — هم‌تراز NEXT_ACTION_VALUES بدون none */
export const NEXT_ACTION_OPTIONS = ['هیچ', 'پیگیری', 'نوبت بعدی', 'تماس با خانواده', 'ارجاع'] as const;
/** مقداری که هوک پیگیری می‌سازد */
export const NEXT_ACTION_FOLLOW_UP = 'پیگیری';

// ─── اعتبارسنجی پیوست (هم‌ارز assessments/pure ) ───

/** برآورد حجم باینری از طول رشته base64 (بدون decode) — padding لحاظ می‌شود */
export function estimateBase64Bytes(b64: string): number {
  const s = b64.replace(/\s/g, '');
  const padding = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - padding);
}

/** حذف پیشوند data-URL اگر مخاطب کل محتوا را با FileReader خوانده باشد */
export function stripDataUrlPrefix(b64: string): string {
  return b64.replace(/^data:[^;]*;base64,/, '');
}

/** پیوست فقط سند و تصویر — اجرایی/اسکریپت/آرشیو ممنوع */
export function isAllowedMimeType(mime: string): boolean {
  return (ALLOWED_FILE_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}

/** پاک‌سازی نام فایل: حذف مسیر (../ و / و \) + فروکاستن فاصله */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? '';
  return base.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** اعتبارسنجی کامل پیوست قبل از نوشتن — پیام فارسی برای ConflictError/ValidationError */
export function validateFileInput(input: {
  filename: string;
  mimeType: string;
  contentB64: string;
}): { ok: true } | { ok: false; reason: string } {
  const filename = sanitizeFilename(input.filename);
  if (filename.length === 0) return { ok: false, reason: 'نام فایل نامعتبر است' };
  if (!isAllowedMimeType(input.mimeType)) {
    return { ok: false, reason: 'این نوع فایل مجاز نیست — فقط سند و تصویر' };
  }
  const bytes = estimateBase64Bytes(stripDataUrlPrefix(input.contentB64));
  if (bytes <= 0) return { ok: false, reason: 'محتوای فایل خالی است' };
  if (bytes > MAX_FILE_BYTES) {
    return { ok: false, reason: 'حجم فایل بیش از ۵۱۲ کیلوبایت است' };
  }
  return { ok: true };
}

/** decode base64 → بایت (محیط Workers: atob در دسترس است) */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ───────── Zod — بدنهٔ API ─────────

// ───── اسکیمای باند/زیرمقیاس/گزینهٔ نمره‌دار ─────

/** — سقف معرفی روایی فرم */
export const TYPE_DESCRIPTION_MAX = 500;
/** — برچسب‌های کلامی لنگر پاسخ (تا سقف SCALE_MAX_LIMIT) */
export const SCALE_LABEL_MAX = 60;

export const CaseEventBandSchema = z.object({
  max: z.number().int().min(1),
  label: z.string().min(1).max(BAND_LABEL_MAX),
  color: z.enum(['ok', 'warn', 'danger']).nullish(),
  advice: z.string().max(BAND_ADVICE_MAX).nullish()
});

export const CaseEventSubscaleSchema = z.object({
  id: z.string().min(1).max(SUBSCALE_ID_MAX).regex(/^[a-zA-Z0-9_]+$/, 'شناسهٔ زیرمقیاس فقط حروف لاتین، رقم و زیرخط'),
  name: z.string().min(1, 'نام زیرمقیاس الزامی است').max(SUBSCALE_NAME_MAX),
  excludeFromTotal: z.boolean().optional(),
  bands: z.array(CaseEventBandSchema).max(BANDS_MAX).nullish()
});

export const CaseEventFieldSchema = z.object({
  key: z.string().min(1).max(FIELD_KEY_MAX).regex(/^[a-zA-Z0-9_]+$/, 'کلید فیلد فقط حروف لاتین، رقم و زیرخط'),
  label: z.string().min(1, 'برچسب فیلد الزامی است').max(FIELD_LABEL_MAX),
  type: z.enum(CASE_EVENT_FIELD_TYPES as unknown as [CaseEventFieldType, ...CaseEventFieldType[]]),
  options: z.array(z.string().min(1).max(FIELD_OPTION_MAX)).max(FIELD_OPTIONS_MAX).optional(),
  // گزینه‌های نمره‌دار (فقط single) — نمره از گیرنده پنهان می‌ماند
  scoredOptions: z.array(z.object({
    label: z.string().min(1, 'برچسب گزینه الزامی است').max(FIELD_OPTION_MAX),
    score: z.number().int().min(0).max(OPTION_SCORE_LIMIT)
  })).max(FIELD_OPTIONS_MAX).optional(),
  scaleMax: z.number().int().min(1).max(SCALE_MAX_LIMIT).optional(),
  // لنگرهای کلامی پاسخ (۰ تا scaleMax) — نمرهٔ ذخیره‌شده عددی می‌ماند
  scaleLabels: z.array(z.string().min(1).max(SCALE_LABEL_MAX)).max(SCALE_MAX_LIMIT + 1).optional(),
  required: z.boolean().optional(),
  // روان‌سنجی: معکوس / بحرانی / زیرمقیاس
  reverse: z.boolean().optional(),
  critical: z.boolean().optional(),
  criticalMin: z.number().int().min(0).max(SCALE_MAX_LIMIT).optional(),
  subscaleId: z.string().max(SUBSCALE_ID_MAX).nullish()
});

export const CaseEventTypeInputSchema = z.object({
  title: z.string().min(2, 'عنوان نوع الزامی است').max(TYPE_TITLE_MAX),
  description: z.string().max(TYPE_DESCRIPTION_MAX).nullish(),
  category: z.enum(CASE_EVENT_CATEGORIES as unknown as [string, ...string[]]),
  icon: z.string().max(TYPE_ICON_MAX).nullish(),
  familyFillable: z.boolean().optional(),
  fields: z.array(CaseEventFieldSchema).min(1, 'حداقل یک فیلد فرم لازم است').max(FIELDS_MAX),
  bands: z.array(CaseEventBandSchema).max(BANDS_MAX).nullish(),
  // زیرمقیاس‌های چک‌لیست
  subscales: z.array(CaseEventSubscaleSchema).max(SUBSCALES_MAX, `حداکثر ${SUBSCALES_MAX} زیرمقیاس`).nullish(),
  // برچسب‌های قالب (tag id) + مخاطب چک‌لیست
  tags: z.array(z.string().min(8).max(64)).max(12, 'حداکثر ۱۲ برچسب برای هر قالب').nullish(),
  audience: z.enum(['family', 'teacher', 'both']).nullish()
});

export const CaseEventTypeUpdateSchema = CaseEventTypeInputSchema.partial();

/** تبدیل ارقام لاتین به فارسی برای پیام‌های کاربر */
function faNum(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

/**
 * بررسی‌های معنایی تعریف فیلد — پیام فارسی برای فرم‌ساز پنل (: نمره‌گذاری روان‌سنجی v2)
 * — packageComponents (T5): پکیج چند-ابزاری — فرم زمینهٔ غیرنمره‌دار + اعلام کامپوننت‌ها؛
 *   نمره‌دهی فقط در کامپوننت‌هاست (هر type سقف ۴۵ فیلد/۸ زیرمقیاس خودش را دارد)
 */
export function validateTypeDefinition(input: {
  category: string;
  fields: CaseEventField[];
  bands?: CaseEventBand[] | null;
  familyFillable?: boolean;
  subscales?: CaseEventSubscale[] | null;
  packageComponents?: string[] | null;
}): void {
  // پکیج چند-ابزاری — قواعد خودش (قبل از قواعد چک‌لیست/جلسه)
  const pkg = input.packageComponents ?? null;
  if (pkg && pkg.length > 0) {
    if (input.familyFillable !== true) {
      throw new ValidationError('فرم پکیجی برای پر کردن توسط خانواده طراحی نشده است');
    }
    if (input.bands && input.bands.length > 0) {
      throw new ValidationError('فرم پکیجی باند کل ندارد — نمره‌دهی در کامپوننت‌هاست');
    }
    if (input.subscales && input.subscales.length > 0) {
      throw new ValidationError('فرم پکیجی زیرمقیاس ندارد — زیرمقیاس‌ها در کامپوننت‌هاست');
    }
    if (new Set(pkg).size !== pkg.length) {
      throw new ValidationError('کامپوننت‌های پکیج تکراری‌اند');
    }
    const ctxKeys = new Set<string>();
    for (const f of input.fields) {
      if (f.type === 'heading') {
        if (!f.label || f.label.trim().length === 0) {
          throw new ValidationError('متن سربرگ بخش نمی‌تواند خالی باشد');
        }
        continue;
      }
      if (f.type === 'scale' || f.type === 'single') {
        throw new ValidationError(`آیتم نمره‌دار «${f.label}» در فرم پکیجی مجاز نیست — نمره‌دهی در کامپوننت‌هاست`);
      }
      if (ctxKeys.has(f.key)) throw new ValidationError(`کلید فیلد تکراری است: ${f.key}`);
      ctxKeys.add(f.key);
      if (f.type === 'select' && (!f.options || f.options.length < 2)) {
        throw new ValidationError(`فیلد انتخابی «${f.label}» حداقل به دو گزینه نیاز دارد`);
      }
      if (f.type !== 'select' && f.options) {
        throw new ValidationError(`فیلد «${f.label}» گزینهٔ انتخابی ندارد — نوع آن select نیست`);
      }
    }
    return;
  }

  const keys = new Set<string>();
  const isChecklist = input.category === 'checklist';
  const subscaleIds = new Set((input.subscales ?? []).map((s) => s.id));

  for (const s of input.subscales ?? []) {
    if (subscaleIds.has(s.id) && [...(input.subscales ?? [])].filter((x) => x.id === s.id).length > 1) {
      throw new ValidationError(`شناسهٔ زیرمقیاس تکراری است: ${s.id}`);
    }
  }

  for (const f of input.fields) {
    if (f.type === 'heading') {
      // سربرگ بخش: فقط متن — نه مقدار، نه گزینه، نه نمره
      if (!f.label || f.label.trim().length === 0) {
        throw new ValidationError('متن سربرگ بخش نمی‌تواند خالی باشد');
      }
      continue;
    }
    if (keys.has(f.key)) throw new ValidationError(`کلید فیلد تکراری است: ${f.key}`);
    keys.add(f.key);
    if (f.type === 'scale' && f.scaleLabels && f.scaleLabels.length > 0) {
      const max = f.scaleMax ?? 3;
      if (f.scaleLabels.length !== max + 1) {
        throw new ValidationError(`برچسب‌های نمرهٔ «${f.label}» باید دقیقاً ${faNum(max + 1)} عدد باشد (از ۰ تا ${faNum(max)})`);
      }
    }
    if (f.type === 'select' && (!f.options || f.options.length < 2)) {
      throw new ValidationError(`فیلد انتخابی «${f.label}» حداقل به دو گزینه نیاز دارد`);
    }
    if (f.type !== 'select' && f.options) {
      throw new ValidationError(`فیلد «${f.label}» گزینهٔ انتخابی ندارد — نوع آن select نیست`);
    }
    // گزینه‌های نمره‌دار فقط برای single
    if (f.type === 'single') {
      if (!isChecklist) {
        throw new ValidationError(`نوع گزینه‌ای نمره‌دار «${f.label}» فقط در دستهٔ چک‌لیست مجاز است`);
      }
      if (!f.scoredOptions || f.scoredOptions.length < 2) {
        throw new ValidationError(`آیتم گزینه‌ای نمره‌دار «${f.label}» حداقل به دو گزینهٔ نمره‌دار نیاز دارد`);
      }
      const optLabels = new Set<string>();
      for (const o of f.scoredOptions) {
        if (optLabels.has(o.label)) throw new ValidationError(`برچسب گزینهٔ تکراری در «${f.label}»`);
        optLabels.add(o.label);
      }
    }
    if (f.type !== 'single' && f.scoredOptions) {
      throw new ValidationError(`فیلد «${f.label}» گزینهٔ نمره‌دار ندارد — نوع آن گزینه‌ای نمره‌دار نیست`);
    }
    if (f.type === 'scale' && f.scaleMax !== undefined && (f.scaleMax < 1 || f.scaleMax > SCALE_MAX_LIMIT)) {
      throw new ValidationError(`سقف نمرهٔ «${f.label}» باید ۱ تا ${SCALE_MAX_LIMIT} باشد`);
    }
    // معکوس فقط برای scale؛ بحرانی فقط برای نوع نمره‌دار (و نه آیتم معکوس)
    if (f.reverse && f.type !== 'scale') {
      throw new ValidationError(`آیتم معکوس فقط برای نوع نمره‌ای مجاز است — «${f.label}»`);
    }
    if (f.critical && (f.type !== 'scale' && f.type !== 'single')) {
      throw new ValidationError(`آیتم بحرانی فقط برای نوع نمره‌دار مجاز است — «${f.label}»`);
    }
    if (f.critical && f.reverse) {
      throw new ValidationError(`آیتم «${f.label}» هم‌زمان معکوس و بحرانی نمی‌تواند باشد`);
    }
    if (f.criticalMin !== undefined && !f.critical) {
      throw new ValidationError(`آستانهٔ بحرانی فقط همراه با آیتم بحرانی معنا دارد — «${f.label}»`);
    }
    // زیرمقیاس باید تعریف شده باشد
    if (f.subscaleId && !subscaleIds.has(f.subscaleId)) {
      throw new ValidationError(`آیتم «${f.label}» به زیرمقیاس تعریف‌نشده وصل است`);
    }
  }

  // چک‌لیست: همهٔ آیتم‌ها باید نمره‌دار باشند (scale یا گزینه‌ای نمره‌دار) — سربرگ هم مجاز نیست
  if (isChecklist && input.fields.some((f) => f.type !== 'scale' && f.type !== 'single')) {
    throw new ValidationError('فیلدهای چک‌لیست فقط از نوع نمره‌ای یا گزینه‌ای نمره‌دار می‌توانند باشند');
  }

  // باندهای زیرمقیاس — سقف آخر باید کل بازهٔ زیرمقیاس را بپوشاند
  for (const s of input.subscales ?? []) {
    if (!s.bands || s.bands.length === 0) continue;
    const maxOfSub = input.fields.filter((f) => f.subscaleId === s.id).reduce((sum, f) => sum + itemMaxScore(f), 0);
    const sorted = [...s.bands].sort((a, b) => a.max - b.max);
    if (sorted[sorted.length - 1].max < maxOfSub) {
      throw new ValidationError(`سقف آخرین باند زیرمقیاس «${s.name}» باید برابر حداکثر نمرهٔ آن (${faNum(maxOfSub)}) باشد`);
    }
  }

  if (isChecklist && input.familyFillable !== false && input.bands && input.bands.length > 0) {
    const sorted = [...input.bands].sort((a, b) => a.max - b.max);
    if (sorted[input.bands.length - 1].max < totalPossible(input.fields, input.subscales)) {
      // سقف آخر باید همهٔ نمره‌ها را بپوشاند — وگرنه نمرهٔ ماکسیمم بی‌باند می‌ماند
      throw new ValidationError('سقف آخرین باند باید برابر حداکثر نمرهٔ ممکن چک‌لیست باشد');
    }
  }
  if (!isChecklist && (input.familyFillable || (input.bands && input.bands.length > 0) || (input.subscales && input.subscales.length > 0))) {
    throw new ValidationError('فقط دستهٔ چک‌لیست قابل پر کردن توسط خانواده، دارای باند تحلیل یا زیرمقیاس است');
  }
}

/** ماکسیمم نمرهٔ یک آیتم نمره‌دار */
export function itemMaxScore(f: CaseEventField): number {
  if (f.type === 'single') {
    const opts = f.scoredOptions ?? [];
    return opts.length > 0 ? Math.max(...opts.map((o) => o.score)) : 0;
  }
  return f.scaleMax ?? 3;
}
/**
 * نمرهٔ مؤثر یک آیتم از پاسخ خام:
 * - scale: raw ۰..scaleMax — معکوس: scaleMax - raw
 * - single: raw = اندیس گزینه در scoredOptions — نمره از جدول گزینه‌ها
 * پاسخ خالی → null (بی‌پاسخ)
 */
export function itemScoreOf(f: CaseEventField, raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) return null;
  const v = Number(raw);
  if (f.type === 'single') {
    const opts = f.scoredOptions ?? [];
    if (!Number.isInteger(v) || v < 0 || v >= opts.length) {
      throw new ValidationError(`پاسخ آیتم «${f.label}» از گزینه‌های مجاز نیست`);
    }
    return opts[v].score;
  }
  const max = f.scaleMax ?? 3;
  if (!Number.isFinite(v) || v < 0 || v > max) {
    throw new ValidationError(`نمرهٔ آیتم «${f.label}» باید بین ۰ تا ${faNum(max)} باشد`);
  }
  return f.reverse ? max - v : v;
}

/** حداکثر نمرهٔ ممکن چک‌لیست — فقط زیرمقیاس‌های داخلِ جمع (: +excludeFromTotal) */
export function totalPossible(fields: CaseEventField[], subscales?: CaseEventSubscale[] | null): number {
  const excluded = new Set((subscales ?? []).filter((s) => s.excludeFromTotal).map((s) => s.id));
  return fields.reduce((sum, f) => (f.subscaleId && excluded.has(f.subscaleId) ? sum : sum + itemMaxScore(f)), 0);
}

// ───────── payload رویداد ─────────

export interface PayloadEntry {
  value: string;
  label: string;
}

/**
 * اعتبارسنجی مقادیر فرم بر اساس تعریف نوع — خروجی payload نهایی با label.
 * قرارداد: فیلد خالیِ اختیاری حذف می‌شود؛ الزامی خالی → خطا.
 * — strict=false (پیش‌نویس): الزامی هم می‌تواند خالی بماند.
 */
export function buildEventPayload(fields: CaseEventField[], values: Record<string, string | number | null | undefined>, strict = true): Record<string, PayloadEntry> {
  const payload: Record<string, PayloadEntry> = {};
  for (const f of fields) {
    if (f.type === 'heading') continue; // — سربرگ بخش مقدار ندارد
    const raw = values[f.key];
    const isMissing = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
    if (isMissing) {
      if (f.required && strict) throw new ValidationError(`فیلد الزامی «${f.label}» خالی است`);
      continue;
    }
    let normalized: string;
    switch (f.type) {
      case 'select': {
        const s = String(raw).trim();
        if (!f.options || !f.options.includes(s)) {
          throw new ValidationError(`مقدار «${s}» برای فیلد «${f.label}» از گزینه‌های مجاز نیست`);
        }
        normalized = s;
        break;
      }
      // گزینه‌ای نمره‌دار: raw = اندیس گزینه؛ نمایش = برچسب گزینه
      case 'single': {
        const idx = typeof raw === 'number'
          ? raw
          : Number(String(raw).trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
        const opts = f.scoredOptions ?? [];
        if (!Number.isInteger(idx) || idx < 0 || idx >= opts.length) {
          throw new ValidationError(`پاسخ «${f.label}» از گزینه‌های مجاز نیست`);
        }
        normalized = opts[idx].label;
        break;
      }
      case 'number':
      case 'scale': {
        const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
        if (!Number.isFinite(n)) throw new ValidationError(`مقدار فیلد «${f.label}» باید عدد باشد`);
        const max = f.type === 'scale' ? (f.scaleMax ?? 3) : undefined;
        if (max !== undefined && (n < 0 || n > max)) {
          throw new ValidationError(`نمرهٔ «${f.label}» باید بین ۰ تا ${faNum(max)} باشد`);
        }
        normalized = String(n);
        break;
      }
      case 'text': {
        normalized = Array.from(String(raw).trim()).slice(0, EVENT_TEXT_MAX).join('');
        break;
      }
      case 'longtext': {
        normalized = String(raw).trim();
        if (Array.from(normalized).length > EVENT_LONGTEXT_MAX) {
          throw new ValidationError(`متن «${f.label}» بیشتر از ${faNum(EVENT_LONGTEXT_MAX)} نویسه است`);
        }
        break;
      }
    }
    payload[f.key] = { value: normalized, label: f.label };
  }
  return payload;
}

// ───────── تحلیل چک‌لیست ─────────

/**
 * تحلیل چک‌لیست — موتور نمره‌گذاری روان‌سنجی v2:
 * - نمرهٔ مؤثر با آیتم‌های معکوس و جدول نمرهٔ گزینه‌ها
 * - نمرهٔ کل فقط از زیرمقیاس‌های داخلِ جمع (excludeFromTotal مثل SDQ)
 * - پرچم آیتم‌های بحرانی (مستقل از جمع کل)
 * - نمره و باند مستقل هر زیرمقیاس
 * - تفسیر خودکار فارسی (باند کل + زیرمقیاس‌ها + پرچم‌ها + توصیهٔ باندها)
 * سازگار با قالب‌های قدیمی (بدون زیرمقیاس/معکوس → نتیجهٔ v1)
 */
export function analyzeChecklist(
  fields: CaseEventField[],
  bands: CaseEventBand[] | null,
  values: Record<string, number>,
  subscales?: CaseEventSubscale[] | null
): CaseEventAnalysis {
  const subs = subscales ?? [];
  const excluded = new Set(subs.filter((s) => s.excludeFromTotal).map((s) => s.id));
  const subAcc = new Map<string, { score: number; max: number; answered: number; count: number }>();
  for (const s of subs) subAcc.set(s.id, { score: 0, max: 0, answered: 0, count: 0 });

  let score = 0;
  let answered = 0;
  let maxScore = 0;
  const flags: CaseEventFlag[] = [];

  for (const f of fields) {
    const itemMax = itemMaxScore(f);
    const isScored = f.type === 'scale' || f.type === 'single';
    if (isScored && !(f.subscaleId && excluded.has(f.subscaleId))) {
      maxScore += itemMax;
    }
    if (f.subscaleId && subAcc.has(f.subscaleId)) {
      subAcc.get(f.subscaleId)!.max += itemMax;
      subAcc.get(f.subscaleId)!.count += 1;
    }
    const v = values[f.key];
    if (v === undefined || v === null) continue;
    const eff = itemScoreOf(f, v);
    if (eff === null) continue;
    if (!(f.subscaleId && excluded.has(f.subscaleId))) {
      score += eff;
    }
    if (f.subscaleId && subAcc.has(f.subscaleId)) {
      const acc = subAcc.get(f.subscaleId)!;
      acc.score += eff;
      acc.answered += 1;
    }
    answered += 1;
    // آیتم بحرانی — پرچم مستقل از جمع کل (خط قرمز بالینی)
    if (f.critical) {
      const threshold = f.criticalMin ?? itemMax;
      if (eff >= threshold) {
        flags.push({ key: f.key, label: f.label, value: eff });
      }
    }
  }

  const hit = resolveBandV2(score, bands);
  const subscaleScores: CaseEventSubscaleScore[] = subs.map((s) => {
    const acc = subAcc.get(s.id)!;
    const bh = resolveBandV2(acc.score, s.bands ?? null);
    return {
      id: s.id,
      name: s.name,
      score: acc.score,
      max: acc.max,
      band: bh ? bh.label : null,
      color: bh?.color ?? null
    };
  });

  return {
    score,
    band: hit ? hit.label : null,
    answered,
    total: fields.length,
    maxScore,
    subscaleScores,
    flags: flags.length > 0 ? flags : undefined,
    interpretation: buildInterpretation(score, maxScore, hit, subscaleScores, flags)
  };
}

/** یافتن باند از تعریف صعودی — v1 */
export function resolveBand(score: number, bands: CaseEventBand[] | null): string | null {
  const hit = resolveBandV2(score, bands);
  return hit ? hit.label : null;
}

/** یافتن باند با رنگ و توصیه — v2 */
export function resolveBandV2(score: number, bands: CaseEventBand[] | null): CaseEventBand | null {
  if (!bands || bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => a.max - b.max);
  const hit = sorted.find((b) => score <= b.max);
  return hit ?? sorted[sorted.length - 1] ?? null;
}

/** تبدیل ارقام برای تفسیر خودکار */
function faN(n: number): string {
  return faNum(n);
}

/**
 * تفسیر خودکار موتور تشخیص — متن فارسی ساخت‌یافته:
 * «نمرهٔ کل: ۱۸ از ۴۰ — مرزی — نیاز به توجه» + توصیهٔ باند + زیرمقیاس‌های باندخورده + آیتم‌های بحرانی
 */
export function buildInterpretation(
  score: number,
  maxScore: number,
  hit: CaseEventBand | null,
  subscaleScores: CaseEventSubscaleScore[],
  flags: CaseEventFlag[]
): string {
  const lines: string[] = [];
  const head = hit
    ? `نمرهٔ کل: ${faN(score)} از ${faN(maxScore)} — ${hit.label}`
    : `نمرهٔ کل: ${faN(score)} از ${faN(maxScore)}`;
  lines.push(head);
  if (hit?.advice) lines.push(`توصیه: ${hit.advice}`);
  const flagged = subscaleScores.filter((s) => s.band && s.color === 'danger');
  if (flagged.length > 0) {
    lines.push(`زیرمقیاس‌های قابل توجه: ${flagged.map((s) => `${s.name} (${faN(s.score)} از ${faN(s.max)})`).join('، ')}`);
  }
  if (flags.length > 0) {
    lines.push(`آیتم بحرانی (${faN(flags.length)} مورد): ${flags.map((f) => f.label).join('، ')}`);
  }
  return lines.join('\n');
}

// ───────── خلاصهٔ تایم‌لاین ─────────

/** خط خلاصهٔ رویداد — معنادارترین متن فرم (اولین مقدار ≥۱۰ نویسه)؛ وگرنه اولین مقدار */
export function buildSummary(payload: Record<string, PayloadEntry> | null, analysis: CaseEventAnalysis | null): string | null {
  if (analysis) {
    const maxTotal = analysis.maxScore ?? analysis.total * 3;
    const parts = [`امتیاز: ${faNum(String(analysis.score))} از ${faNum(String(maxTotal))}`];
    if (analysis.band) parts.push(analysis.band);
    if (analysis.flags && analysis.flags.length > 0) parts.push(`آیتم بحرانی: ${faNum(analysis.flags.length)} مورد`);
    return parts.join(' — ');
  }
  if (!payload) return null;
  const entries = Object.values(payload).filter((p) => p.value && p.value.length > 0);
  if (entries.length === 0) return null;
  const first = entries.find((p) => p.value.length >= 10) ?? entries[0];
  const text = `${first.label}: ${first.value}`;
  return Array.from(text).slice(0, EVENT_SUMMARY_MAX).join('');
}

// ───────── ماتریس ترنزیشن وضعیت ─────────

export const CASE_EVENT_TRANSITIONS: Record<string, string[]> = {
  draft: ['completed', 'cancelled'],
  completed: ['cancelled'],
  pending_family: ['completed', 'cancelled'],
  cancelled: []
};

export function canTransitionStatus(from: string, to: string): boolean {
  return (CASE_EVENT_TRANSITIONS[from] ?? []).includes(to);
}

/** — آیا فیلد «اقدام بعدی» در تعریف نوع هست و مقدار follow_up دارد؟ */
export function extractFollowUpAction(
  fields: CaseEventField[],
  payload: Record<string, PayloadEntry> | null
): boolean {
  if (!payload) return false;
  const field = fields.find((f) => f.key === NEXT_ACTION_FIELD_KEY && f.type === 'select');
  if (!field) return false;
  const entry = payload[field.key];
  return entry?.value === NEXT_ACTION_FOLLOW_UP;
}
