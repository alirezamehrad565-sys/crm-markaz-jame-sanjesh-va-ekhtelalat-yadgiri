// توابع خالص رویدادهای پرونده: امتیازدهی فیلدها، نوارهای تفسیر و اعتبارسنجی فرم — بدون دست‌زدن به دیتابیس.
// سرویس (service.ts) همین‌ها را صدا می‌زند؛ قواعد امتیاز و رنگ نوارها با types.ts مشترک است.
import { z } from 'zod';
import { ValidationError } from '@core/errors';
import { ALLOWED_FILE_MIME_TYPES, MAX_FILE_BYTES } from '@core/shared';
import type {
  CaseEventAnalysis, CaseEventBand, CaseEventField, CaseEventFieldType, CaseEventFlag,
  CaseEventSubscale, CaseEventSubscaleScore, CaseEventScoredOption
} from './types';
import { CASE_EVENT_CATEGORIES, CASE_EVENT_FIELD_TYPES, CASE_EVENT_BAND_COLORS } from './types';

export const TYPE_TITLE_MAX = 120;
export const TYPE_KEY_MAX = 60;
export const TYPE_ICON_MAX = 16;
export const FIELD_LABEL_MAX = 240;
export const FIELD_KEY_MAX = 60;
export const FIELD_OPTION_MAX = 120;
export const FIELD_OPTIONS_MAX = 16;
export const FIELDS_MAX = 45;
export const SCALE_MAX_LIMIT = 10;
export const EVENT_TEXT_MAX = 200;
export const EVENT_LONGTEXT_MAX = 2000;
export const EVENT_SUMMARY_MAX = 300;
export const BANDS_MAX = 5;
export const BAND_LABEL_MAX = 80;
export const BAND_ADVICE_MAX = 400;
export const SUBSCALES_MAX = 8;
export const SUBSCALE_NAME_MAX = 60;
export const SUBSCALE_ID_MAX = 40;
export const OPTION_SCORE_LIMIT = SCALE_MAX_LIMIT;
export const CHECKLIST_BOT_MAX_ITEMS = 8;
export const EVENT_FILES_MAX = 10;
export const NEXT_ACTION_FIELD_KEY = 'next_action';

export const TEACHER_BINDING_KEY = 'teacher_binding';
export const TEACHER_NAME_FIELD_KEY = 'teacher_name';
export const TEACHER_NAME_LABEL = 'پاسخ معلم';
export const TEACHER_NAME_MAX = 120;

export function sanitizeTeacherName(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > TEACHER_NAME_MAX) return null;
  return s;
}

export function teacherBindingOfPayload(payload: unknown): { name: string; teacherId: string | null } | null {
  if (!payload || typeof payload !== 'object') return null;
  const bind = (payload as Record<string, unknown>)[TEACHER_BINDING_KEY];
  if (!bind || typeof bind !== 'object') return null;
  const name = sanitizeTeacherName((bind as Record<string, unknown>).name as string | undefined);
  if (!name) return null;
  const tid = (bind as Record<string, unknown>).teacherId;
  return { name, teacherId: typeof tid === 'string' && tid.length > 0 ? tid : null };
}

export function withTeacherName(
  payload: Record<string, { value: string; label: string }>,
  teacher: { name: string } | null
): Record<string, { value: string; label: string }> {
  if (!teacher) return payload;
  return { ...payload, [TEACHER_NAME_FIELD_KEY]: { value: teacher.name, label: TEACHER_NAME_LABEL } };
}

export const NEXT_ACTION_OPTIONS = ['هیچ', 'پیگیری', 'نوبت بعدی', 'تماس با خانواده', 'ارجاع'] as const;
export const NEXT_ACTION_FOLLOW_UP = 'پیگیری';

export function estimateBase64Bytes(b64: string): number {
  const s = b64.replace(/\s/g, '');
  const padding = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - padding);
}

export function stripDataUrlPrefix(b64: string): string {
  return b64.replace(/^data:[^;]*;base64,/, '');
}

export function isAllowedMimeType(mime: string): boolean {
  return (ALLOWED_FILE_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}

export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? '';
  return base.replace(/\s+/g, ' ').trim().slice(0, 200);
}

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

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const TYPE_DESCRIPTION_MAX = 1200;
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
  scoredOptions: z.array(z.object({
    label: z.string().min(1, 'برچسب گزینه الزامی است').max(FIELD_OPTION_MAX),
    score: z.number().int().min(0).max(OPTION_SCORE_LIMIT)
  })).max(FIELD_OPTIONS_MAX).optional(),
  scaleMax: z.number().int().min(1).max(SCALE_MAX_LIMIT).optional(),
  scaleLabels: z.array(z.string().min(1).max(SCALE_LABEL_MAX)).max(SCALE_MAX_LIMIT + 1).optional(),
  required: z.boolean().optional(),
  reverse: z.boolean().optional(),
  critical: z.boolean().optional(),
  criticalMin: z.number().int().min(0).max(SCALE_MAX_LIMIT).optional(),
  subscaleId: z.string().max(SUBSCALE_ID_MAX).nullish(),
  hint: z.string().min(1).max(FIELD_LABEL_MAX).optional(),
  teacherLabel: z.string().min(1).max(FIELD_LABEL_MAX).optional(),
  teacherHint: z.string().min(1).max(FIELD_LABEL_MAX).optional()
});

export const CaseEventTypeInputSchema = z.object({
  title: z.string().min(2, 'عنوان نوع الزامی است').max(TYPE_TITLE_MAX),
  description: z.string().max(TYPE_DESCRIPTION_MAX).nullish(),
  category: z.enum(CASE_EVENT_CATEGORIES as unknown as [string, ...string[]]),
  icon: z.string().max(TYPE_ICON_MAX).nullish(),
  familyFillable: z.boolean().optional(),
  fields: z.array(CaseEventFieldSchema).min(1, 'حداقل یک فیلد فرم لازم است').max(FIELDS_MAX),
  bands: z.array(CaseEventBandSchema).max(BANDS_MAX).nullish(),
  subscales: z.array(CaseEventSubscaleSchema).max(SUBSCALES_MAX, `حداکثر ${SUBSCALES_MAX} زیرمقیاس`).nullish(),
  tags: z.array(z.string().min(8).max(64)).max(12, 'حداکثر ۱۲ برچسب برای هر قالب').nullish(),
  audience: z.enum(['family', 'teacher', 'both']).nullish()
});

export const CaseEventTypeUpdateSchema = CaseEventTypeInputSchema.partial();

function faNum(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

export function validateTypeDefinition(input: {
  category: string;
  fields: CaseEventField[];
  bands?: CaseEventBand[] | null;
  familyFillable?: boolean;
  subscales?: CaseEventSubscale[] | null;
}): void {
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
    if (f.subscaleId && !subscaleIds.has(f.subscaleId)) {
      throw new ValidationError(`آیتم «${f.label}» به زیرمقیاس تعریف‌نشده وصل است`);
    }
  }

  if (isChecklist && input.fields.some((f) => f.type !== 'scale' && f.type !== 'single')) {
    throw new ValidationError('فیلدهای چک‌لیست فقط از نوع نمره‌ای یا گزینه‌ای نمره‌دار می‌توانند باشند');
  }

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
      throw new ValidationError('سقف آخرین باند باید برابر حداکثر نمرهٔ ممکن چک‌لیست باشد');
    }
  }
  if (!isChecklist && (input.familyFillable || (input.bands && input.bands.length > 0) || (input.subscales && input.subscales.length > 0))) {
    throw new ValidationError('فقط دستهٔ چک‌لیست قابل پر کردن توسط خانواده، دارای باند تحلیل یا زیرمقیاس است');
  }
}

export function itemMaxScore(f: CaseEventField): number {
  if (f.type === 'single') {
    const opts = f.scoredOptions ?? [];
    return opts.length > 0 ? Math.max(...opts.map((o) => o.score)) : 0;
  }
  return f.scaleMax ?? 3;
}
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

export function totalPossible(fields: CaseEventField[], subscales?: CaseEventSubscale[] | null): number {
  const excluded = new Set((subscales ?? []).filter((s) => s.excludeFromTotal).map((s) => s.id));
  return fields.reduce((sum, f) => (f.subscaleId && excluded.has(f.subscaleId) ? sum : sum + itemMaxScore(f)), 0);
}

export interface PayloadEntry {
  value: string;
  label: string;
}

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

export function resolveBand(score: number, bands: CaseEventBand[] | null): string | null {
  const hit = resolveBandV2(score, bands);
  return hit ? hit.label : null;
}

export function resolveBandV2(score: number, bands: CaseEventBand[] | null): CaseEventBand | null {
  if (!bands || bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => a.max - b.max);
  const hit = sorted.find((b) => score <= b.max);
  return hit ?? sorted[sorted.length - 1] ?? null;
}

function faN(n: number): string {
  return faNum(n);
}

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

export const SENSORY_CHIP_KEY = 'ce-sensory-chip-v1';
export const SENSORY_CHIP_TYPE_ID = 'bbbbbbbb-8200-4000-8000-000000000031';

export const SENSORY_CHIP_LEVEL_LABELS: readonly string[] = ['بدون حساسیت', 'حساسیت جزئی', 'حساسیت آزارنده'];

export const SENSORY_CHIP_ITEMS: readonly { key: string; label: string }[] = [
  { key: 'sound', label: 'صدا (صوت)' },
  { key: 'light', label: 'نور (نور/رنگ)' },
  { key: 'touch', label: 'لمس و بافت (لمس/جنس لباس/بافت غذا)' }
];

export const SENSORY_CHIP_FIELDS: CaseEventField[] = SENSORY_CHIP_ITEMS.map((it) => ({
  key: it.key,
  label: it.label,
  type: 'scale' as const,
  scaleMax: 2,
  scaleLabels: [...SENSORY_CHIP_LEVEL_LABELS],
  required: true,
  subscaleId: 'sens'
}));

export const SENSORY_CHIP_SUBSCALES: CaseEventSubscale[] = [
  { id: 'sens', name: 'پروفایل حسی', bands: null }
];

export const SENSORY_CHIP_BANDS: CaseEventBand[] = [
  { max: 1, label: 'بدون نشان', color: 'ok', advice: 'حساسیت حسی برجسته نیست — پایش دوره‌ای در جلسات عادی کافی است.' },
  { max: 3, label: 'حساسیت جزئی', color: 'warn', advice: 'حساسیت جزئی — در تنظیم محیط جلسه و توصیه‌های خانه لحاظ شود.' },
  { max: 6, label: 'حساسیت قابل توجه', color: 'danger', advice: 'حساسیت قابل توجه — در چیدمان مداخله و هماهنگی خانه/مدرسه لحاظ شود؛ ابزار حسی استاندارد در صورت تداوم بررسی شود.' }
];

export interface SensoryChipLevels {
  sound: number;
  light: number;
  touch: number;
}

function sensoryChipNumber(raw: unknown, label: string): number {
  const n = typeof raw === 'number'
    ? raw
    : Number(String(raw ?? '').trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  if (!Number.isInteger(n) || n < 0 || n > 2) {
    throw new ValidationError(`سطح «${label}» باید بین ۰ تا ۲ باشد`);
  }
  return n;
}

export function validateSensoryChipLevels(values: unknown): SensoryChipLevels {
  const raw = (values && typeof values === 'object' ? values : {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const it of SENSORY_CHIP_ITEMS) {
    const v = raw[it.key];
    if (v === undefined || v === null || String(v).trim() === '') {
      throw new ValidationError(`آیتم «${it.label}» بی‌پاسخ مانده است`);
    }
    out[it.key] = sensoryChipNumber(v, it.label);
  }
  return { sound: out.sound, light: out.light, touch: out.touch };
}

export function sensoryChipTotalOf(levels: SensoryChipLevels): number {
  return levels.sound + levels.light + levels.touch;
}

export function resolveSensoryChipBand(total: number): CaseEventBand {
  return resolveBandV2(total, SENSORY_CHIP_BANDS) ?? SENSORY_CHIP_BANDS[SENSORY_CHIP_BANDS.length - 1];
}

export function sensoryChipFaSummary(levels: SensoryChipLevels): string {
  const total = sensoryChipTotalOf(levels);
  return `حساسیت حسی: ${faNum(total)} از ${faNum(6)} — ${resolveSensoryChipBand(total).label}`;
}

export function buildSensoryChipPayload(levels: SensoryChipLevels): Record<string, PayloadEntry> {
  const total = sensoryChipTotalOf(levels);
  const band = resolveSensoryChipBand(total);
  const payload: Record<string, PayloadEntry> = {};
  for (const it of SENSORY_CHIP_ITEMS) {
    payload[it.key] = { value: SENSORY_CHIP_LEVEL_LABELS[levels[it.key as keyof SensoryChipLevels]], label: it.label };
  }
  payload['chip_total'] = { value: String(total), label: 'نمرهٔ کل' };
  payload['chip_band'] = { value: band.label, label: 'باند' };
  payload['fa_summary'] = { value: sensoryChipFaSummary(levels), label: 'خلاصهٔ چیپ حسی' };
  return payload;
}

export function analyzeSensoryChip(levels: SensoryChipLevels): CaseEventAnalysis {
  return analyzeChecklist(SENSORY_CHIP_FIELDS, SENSORY_CHIP_BANDS, { ...levels }, SENSORY_CHIP_SUBSCALES);
}

export const READ_CORE_KEY = 'ce-read-core-v1';
export const READ_CORE_TYPE_ID = 'bbbbbbbb-8200-4000-8000-000000000032';

export const READ_CORE_LEVEL_LABELS: readonly string[] = ['برقرار', 'مرزی', 'ضعف آشکار'];

export const READ_CORE_ITEMS: readonly { key: string; label: string }[] = [
  { key: 'pa', label: 'آگاهی واج‌شناختی (بخشیدن و ترکیب صدا، قافیه)' },
  { key: 'dec', label: 'رمزگشایی (خواندن واژهٔ تازه و بی‌معنی)' },
  { key: 'flu', label: 'روانی خواندن (سرعت و سلاست متن هم‌پایه)' },
  { key: 'voc', label: 'واژگان (فهم معنی واژه‌های متن)' },
  { key: 'comp', label: 'درک مطلب (پاسخ به پرسش‌های متن)' }
];

export const READ_CORE_FIELDS: CaseEventField[] = READ_CORE_ITEMS.map((it) => ({
  key: it.key,
  label: it.label,
  type: 'scale' as const,
  scaleMax: 2,
  scaleLabels: [...READ_CORE_LEVEL_LABELS],
  required: true,
  subscaleId: 'rdcore'
}));

export const READ_CORE_SUBSCALES: CaseEventSubscale[] = [
  { id: 'rdcore', name: 'هستهٔ خواندن', bands: null }
];

export const READ_CORE_BANDS: CaseEventBand[] = [
  { max: 1, label: 'بدون نشان', color: 'ok', advice: 'هستهٔ خواندن برقرار است — پایش دوره‌ای در جلسات عادی کافی است.' },
  { max: 3, label: 'گیر مرزی', color: 'warn', advice: 'گیرهای مرزی در مؤلفه‌های خواندن — در جلسات تقویتی هدفمند لحاظ شود و پس از ۸ هفته بازبینی شود.' },
  { max: 10, label: 'ضعف آشکار', color: 'danger', advice: 'ضعف آشکار در هستهٔ خواندن — ارزیابی هدفمند خواندن (چک‌لیست ملاکی + پروب) آغاز شود.' }
];

export interface ReadCoreLevels {
  pa: number;
  dec: number;
  flu: number;
  voc: number;
  comp: number;
}

function readCoreNumber(raw: unknown, label: string): number {
  const n = typeof raw === 'number'
    ? raw
    : Number(String(raw ?? '').trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  if (!Number.isInteger(n) || n < 0 || n > 2) {
    throw new ValidationError(`سطح «${label}» باید بین ۰ تا ۲ باشد`);
  }
  return n;
}

export function validateReadCoreLevels(values: unknown): ReadCoreLevels {
  const raw = (values && typeof values === 'object' ? values : {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const it of READ_CORE_ITEMS) {
    const v = raw[it.key];
    if (v === undefined || v === null || String(v).trim() === '') {
      throw new ValidationError(`آیتم «${it.label}» بی‌پاسخ مانده است`);
    }
    out[it.key] = readCoreNumber(v, it.label);
  }
  return { pa: out.pa, dec: out.dec, flu: out.flu, voc: out.voc, comp: out.comp };
}

export function readCoreTotalOf(levels: ReadCoreLevels): number {
  return levels.pa + levels.dec + levels.flu + levels.voc + levels.comp;
}

export function resolveReadCoreBand(total: number): CaseEventBand {
  return resolveBandV2(total, READ_CORE_BANDS) ?? READ_CORE_BANDS[READ_CORE_BANDS.length - 1];
}

export function readCoreFaSummary(levels: ReadCoreLevels): string {
  const total = readCoreTotalOf(levels);
  return `هستهٔ خواندن: ${faNum(total)} از ${faNum(10)} — ${resolveReadCoreBand(total).label}`;
}

export const READ_CORE_TOOL_FA: Record<string, string> = {
  'ce-sld-read-v1': 'چک‌لیست دشواری خواندن',
  'ce-probe-read-v1': 'آزمون کوتاه خواندن',
  'ce-speech-criteria-v1': 'چک‌لیست زبان و گفتار'
};

export interface ReadCoreAdvice {
  toolKey: string;
  text: string;
}

export function readCoreAdviceOf(levels: ReadCoreLevels): ReadCoreAdvice[] {
  const texts = new Map<string, string[]>();
  const add = (toolKey: string, text: string): void => {
    const arr = texts.get(toolKey) ?? [];
    arr.push(text);
    texts.set(toolKey, arr);
  };
  if (levels.pa >= 1) {
    add('ce-sld-read-v1', 'آگاهی واج‌شناختی گیر می‌کند — چک‌لیست ملاکی خواندن برای هم‌گرایی خانه و مدرسه و تمرکز جلسه روی بخشیدن و ترکیب صدا.');
  }
  if (levels.dec >= 1) {
    add('ce-probe-read-v1', 'رمزگشایی گیر می‌کند — آزمون کوتاه خواندن با بخش واژهٔ بی‌معنی (۲۰ مورد) برای اندازه‌گیری دقیق کدگشایی.');
  }
  if (levels.flu >= 1) {
    add('ce-probe-read-v1', 'روانی گیر می‌کند — آزمون کوتاه خواندن (واژهٔ درست در دقیقه) با متن هم‌پایه.');
  }
  if (levels.voc >= 1) {
    add('ce-speech-criteria-v1', 'واژگان گیر می‌کند — چک‌لیست زبان و گفتار برای تفریق ریشهٔ زبانی.');
  }
  if (levels.comp >= 1 && levels.dec === 0 && levels.flu === 0) {
    add('ce-speech-criteria-v1', 'درک مطلب گیر می‌کند با رمزگشایی و روانی برقرار — الگوی «درک زبانی» (نمای سادهٔ خواندن): ارزیابی فهم شنیداری و زبان.');
  }
  if (readCoreTotalOf(levels) >= 4) {
    add('ce-sld-read-v1', 'الگوی ضعف گسترده در هستهٔ خواندن — چک‌لیست ملاکی خواندن و پروب خواندن پیش از جلسهٔ بعد آغاز شود.');
  }
  const order = ['ce-sld-read-v1', 'ce-probe-read-v1', 'ce-speech-criteria-v1'];
  return order
    .filter((k) => texts.has(k))
    .map((toolKey) => ({ toolKey, text: (texts.get(toolKey) ?? []).join(' ') }));
}

export function buildReadCorePayload(levels: ReadCoreLevels): Record<string, PayloadEntry> {
  const total = readCoreTotalOf(levels);
  const band = resolveReadCoreBand(total);
  const payload: Record<string, PayloadEntry> = {};
  for (const it of READ_CORE_ITEMS) {
    payload[it.key] = { value: READ_CORE_LEVEL_LABELS[levels[it.key as keyof ReadCoreLevels]], label: it.label };
  }
  payload['chip_total'] = { value: String(total), label: 'نمرهٔ کل' };
  payload['chip_band'] = { value: band.label, label: 'باند' };
  payload['fa_summary'] = { value: readCoreFaSummary(levels), label: 'خلاصهٔ چیپ هستهٔ خواندن' };
  readCoreAdviceOf(levels).forEach((a, i) => {
    payload[`advice_${i + 1}`] = { value: a.text, label: `پیشنهاد گام بعد — ${READ_CORE_TOOL_FA[a.toolKey] ?? a.toolKey}` };
  });
  return payload;
}

export function analyzeReadCore(levels: ReadCoreLevels): CaseEventAnalysis {
  return analyzeChecklist(READ_CORE_FIELDS, READ_CORE_BANDS, { ...levels }, READ_CORE_SUBSCALES);
}

const PROBE_GRADE_OPTIONS: readonly string[] = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم'];

export const PROBE_WCPM_NORM_50TH: Record<string, number> = {
  'اول': 60, 'دوم': 89, 'سوم': 107, 'چهارم': 123, 'پنجم': 139, 'ششم': 150, 'هفتم': 150, 'هشتم': 150
};
export const PROBE_ALPHA_15S_NORM: Record<string, number> = {
  'اول': 20, 'دوم': 35, 'سوم': 45, 'چهارم': 50, 'پنجم': 55, 'ششم': 60, 'هفتم': 60, 'هشتم': 60
};
export const PROBE_DIGITS_2MIN_NORM: Record<string, number> = {
  'اول': 15, 'دوم': 25, 'سوم': 35, 'چهارم': 45, 'پنجم': 55, 'ششم': 55, 'هفتم': 55, 'هشتم': 55
};

export const PROBE_BANDS: CaseEventBand[] = [
  { max: 69, label: 'پایین‌تر از انتظار پایه', color: 'danger', advice: 'عملکرد پایین‌تر از انتظار هم‌پایه‌ها — ارزیابی هدفمند حوزه و طراحی مداخلهٔ مستقیم آغاز شود.' },
  { max: 89, label: 'مرزی', color: 'warn', advice: 'عملکرد مرزی نزدیک انتظار پایه — پایش هفتگی پروب و تمرین هدفمند در جلسات توصیه می‌شود.' },
  { max: 2147483647, label: 'در انتظار پایه', color: 'ok', advice: 'عملکرد در انتظار پایه است — پایش دوره‌ای با پروب کافی است.' }
];

export const PROBE_AREA_KEYS = {
  read: 'ce-probe-read-v1',
  write: 'ce-probe-write-v1',
  calc: 'ce-probe-calc-v1'
} as const;
export type ProbeArea = keyof typeof PROBE_AREA_KEYS;
export const PROBE_AREA_LABELS: Record<ProbeArea, string> = {
  read: 'خواندن', write: 'نوشتن', calc: 'حساب'
};

interface ProbeNumSpec { key: string; label: string; min: number; max: number; required: boolean }
interface ProbeGradeSpec { key: string; label: string; required: boolean; grade: true }
interface ProbeSelectSpec { key: string; label: string; required: boolean; options: readonly string[] }
interface ProbeTextSpec { key: string; label: string; required: boolean; text: true }
type ProbeFieldSpec = ProbeNumSpec | ProbeGradeSpec | ProbeSelectSpec | ProbeTextSpec;

const PROBE_FIELD_SPECS: Record<ProbeArea, readonly ProbeFieldSpec[]> = {
  read: [
    { key: 'text_grade', label: 'متن استفاده‌شده (پایه)', required: true, grade: true },
    { key: 'wcpm', label: 'تعداد واژه‌های درست در یک دقیقه', min: 0, max: 400, required: true },
    { key: 'errors', label: 'تعداد خطا در همان یک دقیقه', min: 0, max: 200, required: false },
    { key: 'pseudo_correct', label: 'واژه‌های بی‌معنی که درست خواند (از ۲۰)', min: 0, max: 20, required: true },
    { key: 'comprehension', label: 'فهم متن (پاسخ درست از ۳ پرسش ساده)', min: 0, max: 3, required: false },
    { key: 'notes', label: 'مشاهدهٔ درمانگر', required: false, text: true }
  ],
  write: [
    { key: 'dict_grade', label: 'دیکتهٔ استفاده‌شده (پایه)', required: true, grade: true },
    { key: 'dict_words', label: 'تعداد واژهٔ دیکته', min: 1, max: 100, required: true },
    { key: 'err_phonetic', label: 'خطای صدا و حرف', min: 0, max: 100, required: true },
    { key: 'err_visual', label: 'خطای شباهت حروف (ب/پ/ت…)', min: 0, max: 100, required: false },
    { key: 'err_rule', label: 'خطای نگارشی (فاصله، «ان/آن»…)', min: 0, max: 100, required: false },
    { key: 'alpha15s', label: 'حروف درست نوشته‌شده در ۱۵ ثانیه', min: 0, max: 120, required: true },
    { key: 'handwriting_note', label: 'کیفیت دست‌خط', required: false, text: true }
  ],
  calc: [
    { key: 'calc_grade', label: 'سطح آزمون (پایه)', required: true, grade: true },
    { key: 'digits2min', label: 'ارقام درست در دو دقیقه', min: 0, max: 400, required: true },
    { key: 'compare_errors', label: 'خطای مقایسهٔ مقدار از ۱۰ جفت', min: 0, max: 10, required: true },
    { key: 'number_line_pct', label: 'میانگین خطای جای‌گذاری روی خط عددی (درصد)', min: 0, max: 100, required: false },
    { key: 'word_problem_support', label: 'نیاز به راهنمایی در مسئلهٔ کلامی', required: false, options: ['کم', 'متوسط', 'زیاد', 'بی‌راه‌حل'] },
    { key: 'notes', label: 'مشاهدهٔ درمانگر', required: false, text: true }
  ]
};

function probeNumber(raw: unknown, spec: ProbeNumSpec): number {
  const n = typeof raw === 'number'
    ? raw
    : Number(String(raw ?? '').trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  if (!Number.isInteger(n) || n < spec.min || n > spec.max) {
    throw new ValidationError(`«${spec.label}» باید بین ${faNum(spec.min)} تا ${faNum(spec.max)} باشد`);
  }
  return n;
}

export function validateProbeValues(area: ProbeArea, values: unknown): Record<string, string | number> {
  const raw = (values && typeof values === 'object' ? values : {}) as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  for (const spec of PROBE_FIELD_SPECS[area]) {
    const v = raw[spec.key];
    if (v === undefined || v === null || String(v).trim() === '') {
      if (spec.required) throw new ValidationError(`آیتم «${spec.label}» بی‌پاسخ مانده است`);
      continue;
    }
    if ('grade' in spec) {
      const s = String(v).trim();
      if (!PROBE_GRADE_OPTIONS.includes(s)) {
        throw new ValidationError(`«${spec.label}» از گزینه‌های مجاز نیست`);
      }
      out[spec.key] = s;
    } else if ('options' in spec) {
      const s = String(v).trim();
      if (!spec.options.includes(s)) {
        throw new ValidationError(`«${spec.label}» از گزینه‌های مجاز نیست`);
      }
      out[spec.key] = s;
    } else if ('text' in spec) {
      out[spec.key] = String(v).trim().slice(0, 600);
    } else {
      out[spec.key] = probeNumber(v, spec);
    }
  }
  return out;
}

export interface ProbeResult {
  pct: number;
  band: CaseEventBand;
  metrics: { value: string; label: string }[];
  flags: CaseEventFlag[];
  normFa: string;
  faSummary: string;
}

function probePct(value: number, norm: number): number {
  return Math.round((value / norm) * 100);
}

function probeBandOf(pct: number): CaseEventBand {
  return resolveBandV2(pct, PROBE_BANDS) ?? PROBE_BANDS[PROBE_BANDS.length - 1];
}

const faNumProbe = (n: number): string => faNum(n);

export function analyzeProbe(area: ProbeArea, v: Record<string, string | number>): ProbeResult {
  const flags: CaseEventFlag[] = [];
  const metrics: { value: string; label: string }[] = [];

  if (area === 'read') {
    const grade = String(v.text_grade);
    const norm = PROBE_WCPM_NORM_50TH[grade];
    const wcpm = Number(v.wcpm);
    const pct = probePct(wcpm, norm);
    const band = probeBandOf(pct);
    metrics.push({ value: `${faNumProbe(wcpm)} (انتظار پایهٔ ${grade}: ${faNumProbe(norm)})`, label: 'واژهٔ درست در دقیقه' });
    const pseudo = Number(v.pseudo_correct);
    metrics.push({ value: `${faNumProbe(pseudo)} از ${faNumProbe(20)}`, label: 'رمزگشایی واژهٔ بی‌معنی' });
    if (pseudo < 10) flags.push({ key: 'pseudo_correct', label: 'رمزگشایی واژهٔ بی‌معنی پایین (کمتر از ۱۰ از ۲۰)', value: pseudo });
    if (v.comprehension !== undefined) {
      const comp = Number(v.comprehension);
      metrics.push({ value: `${faNumProbe(comp)} از ${faNumProbe(3)}`, label: 'فهم متن' });
      if (comp <= 1) flags.push({ key: 'comprehension', label: 'فهم متن پایین (۱ پرسش یا کمتر از ۳)', value: comp });
    }
    if (v.errors !== undefined) {
      metrics.push({ value: `${faNumProbe(Number(v.errors))} خطا`, label: 'خطای خواندن در همان دقیقه' });
    }
    const normFa = `انتظار پایهٔ ${grade}: حدود ${faNumProbe(norm)} واژه درست در دقیقه (هنجار داخلی مرکز — برای پیگیری پیشرفت)`;
    return { pct, band, metrics, flags, normFa, faSummary: `آزمون خواندن: ${faNumProbe(pct)}٪ انتظار پایهٔ ${grade} — ${band.label}` };
  }

  if (area === 'write') {
    const grade = String(v.dict_grade);
    const words = Number(v.dict_words);
    const phon = Number(v.err_phonetic);
    const visual = Number(v.err_visual ?? 0);
    const rule = Number(v.err_rule ?? 0);
    const totalErr = phon + visual + rule;
    const errRate = words > 0 ? totalErr / words : 1;
    const spellPct = Math.round((1 - errRate) * 100);
    const alpha = Number(v.alpha15s);
    const norm = PROBE_ALPHA_15S_NORM[grade];
    const fluPct = probePct(alpha, norm);
    const band = (errRate > 0.25 || fluPct < 70) ? PROBE_BANDS[0]
      : (errRate > 0.10 || fluPct < 90) ? PROBE_BANDS[1]
        : PROBE_BANDS[2];
    metrics.push({ value: `${faNumProbe(spellPct)}٪ (${faNumProbe(totalErr)} خطا از ${faNumProbe(words)} واژه)`, label: 'دقت املایی' });
    metrics.push({ value: `${faNumProbe(alpha)} حرف (انتظار پایهٔ ${grade}: ${faNumProbe(norm)})`, label: 'روانی نوشتن در ۱۵ ثانیه' });
    if (phon > 0) metrics.push({ value: faNumProbe(phon), label: 'خطای صدا و حرف' });
    if (visual > 0) metrics.push({ value: faNumProbe(visual), label: 'خطای شباهت حروف' });
    if (rule > 0) metrics.push({ value: faNumProbe(rule), label: 'خطای نگارشی' });
    if (fluPct < 80) flags.push({ key: 'alpha15s', label: `روانی نوشتن پایین‌تر از انتظار پایه (${faNumProbe(fluPct)}٪)`, value: alpha });
    const normFa = `انتظار پایهٔ ${grade}: حدود ${faNumProbe(norm)} حرف درست در ۱۵ ثانیه (هنجار داخلی مرکز — برای پیگیری پیشرفت)`;
    const head = spellPct >= 0 && spellPct <= 100
      ? `${faNumProbe(spellPct)}٪`
      : `بیش از انتظار — ${faNumProbe(totalErr)} خطا از ${faNumProbe(words)} واژه`;
    return { pct: Math.max(0, spellPct), band, metrics, flags, normFa, faSummary: `آزمون نوشتن: دقت املایی ${head} — ${band.label}` };
  }

  const grade = String(v.calc_grade);
  const norm = PROBE_DIGITS_2MIN_NORM[grade];
  const digits = Number(v.digits2min);
  const pct = probePct(digits, norm);
  let band = probeBandOf(pct);
  const compareErr = Number(v.compare_errors);
  metrics.push({ value: `${faNumProbe(digits)} (انتظار پایهٔ ${grade}: ${faNumProbe(norm)})`, label: 'ارقام درست در دو دقیقه' });
  metrics.push({ value: `${faNumProbe(compareErr)} از ${faNumProbe(10)}`, label: 'خطای مقایسهٔ مقدار' });
  if (v.number_line_pct !== undefined) {
    const nl = Number(v.number_line_pct);
    metrics.push({ value: `${faNumProbe(nl)}٪`, label: 'خطای خط عددی' });
  }
  if (v.word_problem_support !== undefined) {
    metrics.push({ value: String(v.word_problem_support), label: 'راهنمایی مسئلهٔ کلامی' });
  }
  const nlPct = v.number_line_pct !== undefined ? Number(v.number_line_pct) : 0;
  const support = v.word_problem_support !== undefined ? String(v.word_problem_support) : 'کم';
  if (compareErr >= 6 || nlPct >= 25 || support === 'بی‌راه‌حل') band = PROBE_BANDS[0];
  else if ((compareErr >= 4 || nlPct >= 15 || support === 'زیاد') && band === PROBE_BANDS[2]) band = PROBE_BANDS[1];
  if (compareErr >= 4) flags.push({ key: 'compare_errors', label: `مقایسهٔ مقدار ضعیف (${faNumProbe(compareErr)} خطا از ۱۰)`, value: compareErr });
  if (nlPct >= 25) flags.push({ key: 'number_line_pct', label: `برآورد خط عددی ضعیف (${faNumProbe(nlPct)}٪ خطا)`, value: nlPct });
  const normFa = `انتظار پایهٔ ${grade}: حدود ${faNumProbe(norm)} رقم درست در دو دقیقه (هنجار داخلی مرکز — برای پیگیری پیشرفت)`;
  return { pct, band, metrics, flags, normFa, faSummary: `آزمون حساب: ${faNumProbe(pct)}٪ انتظار پایهٔ ${grade} — ${band.label}` };
}

export function buildProbePayload(area: ProbeArea, v: Record<string, string | number>, result: ProbeResult): Record<string, PayloadEntry> {
  const payload: Record<string, PayloadEntry> = {};
  for (const spec of PROBE_FIELD_SPECS[area]) {
    const val = v[spec.key];
    if (val === undefined) continue;
    const display = typeof val === 'number' ? faNum(val) : val;
    payload[spec.key] = { value: display, label: spec.label };
  }
  result.metrics.forEach((m, i) => {
    payload[`chip_metric_${i + 1}`] = { value: m.value, label: m.label };
  });
  payload['chip_band'] = { value: result.band.label, label: 'باند' };
  payload['norm_fa'] = { value: result.normFa, label: 'انتظار پایه (هنجار داخلی مرکز)' };
  payload['fa_summary'] = { value: result.faSummary, label: `خلاصهٔ آزمون ${PROBE_AREA_LABELS[area]}` };
  return payload;
}

export function probeAnalysisOf(area: ProbeArea, v: Record<string, string | number>, result: ProbeResult): CaseEventAnalysis {
  const spec = PROBE_FIELD_SPECS[area];
  const interpretationLines = [
    result.faSummary,
    result.normFa,
    ...(result.flags ?? []).map((f) => `پرچم: ${f.label}`)
  ];
  return {
    score: result.pct,
    band: result.band.label,
    answered: Object.keys(v).length,
    total: spec.length,
    maxScore: 100,
    flags: result.flags.length > 0 ? result.flags : undefined,
    interpretation: interpretationLines.join('\n')
  };
}

export const REHAB_FX_KEY = 'ce-rehab-fx-v1';
export const REHAB_FX_TYPE_ID = 'bbbbbbbb-8200-4000-8000-000000000033';

export const REHAB_FX_PROMPT_OPTIONS: readonly string[] = [
  'بدون راهنما', 'راهنمای کلامی', 'ژستی / الگودهی', 'لمسی جزئی', 'راهنمای فیزیکی کامل'
];
export const REHAB_FX_PROMPT_DEFAULT = 'بدون راهنما';

export const REHAB_FX_STORY_MAX = 4;

export interface RehabFxDomainSpec {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  kind: 'higher_better' | 'lower_better';
  weakMax: number;
  okMin: number;
  criterionFa: string;
  adviceFa: string;
}

export const REHAB_FX_DOMAINS: readonly RehabFxDomainSpec[] = [
  {
    key: 'att_sus', label: 'توجه پایدار', unit: 'دقیقهٔ تمرکز پیوسته', min: 0, max: 15,
    kind: 'higher_better', weakMax: 4, okMin: 10,
    criterionFa: 'پایان‌رساندن کار ساخت‌یافتهٔ ۱۰ دقیقه‌ای بدون یادآوری (ملاک ot-cog-07)',
    adviceFa: 'توجه پایدار گیر دارد — فعالیت ساخت‌یافته با مدت پلکانی از ۵ دقیقه + تایمر دیداری و استراحت حرکتی کوتاه بین بازه‌ها (حیطهٔ «توجه و مهارت‌های ذهنی» چک‌لیست مهارتی).'
  },
  {
    key: 'att_sel', label: 'توجه انتخابی — حذف هدف', unit: 'خطا از ۲۰ هدف', min: 0, max: 20,
    kind: 'lower_better', weakMax: 4, okMin: 2,
    criterionFa: 'حذف هدف در جدول تصویر/حرف با حداکثر ۲ خطا (ملاک ot-cog-08)',
    adviceFa: 'توجه انتخابی گیر دارد — تمرین حذف هدف روزانه (۵ دقیقه، از جدول ساده به شلوغ) + کاهش محرک میز کار در جلسه.'
  },
  {
    key: 'wm', label: 'حافظهٔ کاری', unit: 'طول توالی بازگوشده (رقم)', min: 1, max: 9,
    kind: 'higher_better', weakMax: 2, okMin: 4,
    criterionFa: 'تکرار ۴ رقم در ۲ از ۳ بار (ملاک ot-aud-06)',
    adviceFa: 'حافظهٔ کاری گیر دارد — بازی دنبالهٔ چندکاری و توالی عددی پلکانی از ۳ رقم؛ دستورهای دو مرحله‌ای با یادآور دیداری.'
  },
  {
    key: 'inh', label: 'بازداری — سیگنال معکوس', unit: 'خطا از ۱۰ آزمون', min: 0, max: 10,
    kind: 'lower_better', weakMax: 4, okMin: 2,
    criterionFa: 'بازی سیگنال معکوس با حداکثر ۲ خطا در ۱۰ آزمون (ملاک ot-cog-10)',
    adviceFa: 'بازداری گیر دارد — بازی توقف-شروع و سیگنال معکوس با تکرار روزانه؛ قاعدهٔ «اول فکر، بعد عمل» با جمله‌سازی آشکار پیش از هر پاسخ.'
  },
  {
    key: 'flex', label: 'انعطاف ذهنی', unit: 'کمک لازم پس از تغییر قاعده (بار)', min: 0, max: 4,
    kind: 'lower_better', weakMax: 2, okMin: 1,
    criterionFa: 'تغییر قاعدهٔ طبقه‌بندی و ادامهٔ کار بدون گِر (ملاک ot-cog-11)',
    adviceFa: 'انعطاف ذهنی گیر دارد — تغییر قاعدهٔ عمدی در بازی با پیش‌اعلام و کارت «قاعدهٔ جدید»؛ سقف کمک در تکرار بعدی باید یک پله کم شود.'
  },
  {
    key: 'ps', label: 'حل مسئله — پازل', unit: 'تکهٔ درست از ۱۲', min: 0, max: 12,
    kind: 'higher_better', weakMax: 5, okMin: 9,
    criterionFa: 'پازل ۶–۱۲ تکه و ترتیب درست ۴ تصویر داستانی (ملاک ot-cog-12)',
    adviceFa: 'حل مسئله گیر دارد — پازل پلکانی و توالی داستان با تحلیل «کجا گیر کرد» پیش از هر کمک؛ تمرین گام‌به‌گام با طرح کلی دیداری.'
  }
];

export function rehabFxTypeFields(): CaseEventField[] {
  const fields: CaseEventField[] = [];
  for (const d of REHAB_FX_DOMAINS) {
    fields.push({ key: `d_${d.key}`, label: `${d.label} — ${d.unit} (${faNum(d.min)}–${faNum(d.max)})`, type: 'number', required: true });
  }
  fields.push({ key: 'd_ps_story', label: `توالی داستان — تصویر درست‌ترتیب از ${faNum(REHAB_FX_STORY_MAX)}`, type: 'number', required: false });
  for (const d of REHAB_FX_DOMAINS) {
    fields.push({ key: `p_${d.key}`, label: `سطح راهنما — ${d.label}`, type: 'select', options: [...REHAB_FX_PROMPT_OPTIONS], required: false });
  }
  fields.push({ key: 'notes', label: 'مشاهدهٔ درمانگر (انگیزه، خستگی، راهبرد جالب…)', type: 'longtext', required: false });
  return fields;
}

export const REHAB_FX_BANDS: CaseEventBand[] = [
  { max: 2, label: 'نیاز به مداخلهٔ همه‌جانبهٔ ذهنی', color: 'danger', advice: 'سه حیطه یا بیشتر ضعیف است — برنامهٔ جلسات از حیطه‌های پایه (توجه/بازداری) شروع شود و هر حیطه یک هدف کوچک هفتگی بگیرد.' },
  { max: 4, label: 'گیرهای نقطه‌ای — مداخلهٔ حیطه‌ای هدفمند', color: 'warn', advice: 'ترکیب قوت/ضعف نقطه‌ای است — مداخله از حیطه‌های ضعیف آغاز و حیطه‌های قوت به‌عنوان پل انگیزشی به‌کار رود؛ بازسنجی ۸ تا ۱۲ جلسه.' },
  { max: 2147483647, label: 'نیم‌رخ پایه در انتظار', color: 'ok', advice: 'نیم‌رخ پایه در انتظار سن است — مداخله روی اهداف عملکردی خانواده‌محور و پایش جلسه‌به‌جلسه ادامه یابد.' }
];

const rehabFxNumber = (raw: unknown, d: RehabFxDomainSpec): number => {
  const n = typeof raw === 'number'
    ? raw
    : Number(String(raw ?? '').trim().replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))));
  if (!Number.isInteger(n) || n < d.min || n > d.max) {
    throw new ValidationError(`«${d.label}» باید بین ${faNum(d.min)} تا ${faNum(d.max)} باشد (${d.unit})`);
  }
  return n;
};

export interface RehabFxDomainResult {
  key: string;
  label: string;
  value: number;
  valueFa: string;
  band: CaseEventBand;
  prompt: string;
  criterionFa: string;
}

export interface RehabFxResult {
  domains: RehabFxDomainResult[];
  counts: { ok: number; warn: number; weak: number };
  band: CaseEventBand;
  flags: CaseEventFlag[];
  metrics: { value: string; label: string }[];
  normFa: string;
  faSummary: string;
}

function rehabFxDomainBand(d: RehabFxDomainSpec, value: number): CaseEventBand {
  const OK: CaseEventBand = { max: 0, label: 'در انتظار', color: 'ok', advice: REHAB_FX_BANDS[2].advice };
  const WARN: CaseEventBand = { max: 0, label: 'مرزی', color: 'warn', advice: REHAB_FX_BANDS[1].advice };
  const WEAK: CaseEventBand = { max: 0, label: 'ضعف آشکار', color: 'danger', advice: REHAB_FX_BANDS[0].advice };
  if (d.kind === 'higher_better') {
    if (value >= d.okMin) return OK;
    if (value > d.weakMax) return WARN;
    return WEAK;
  }
  if (value <= d.okMin) return OK;
  if (value <= d.weakMax) return WARN;
  return WEAK;
}

export function analyzeRehabFx(v: Record<string, string | number>): RehabFxResult {
  const domains: RehabFxDomainResult[] = [];
  const flags: CaseEventFlag[] = [];
  const metrics: { value: string; label: string }[] = [];
  let ok = 0, warn = 0, weak = 0;
  for (const d of REHAB_FX_DOMAINS) {
    const value = rehabFxNumber(v[`d_${d.key}`], d);
    const band = rehabFxDomainBand(d, value);
    if (band.color === 'ok') ok += 1;
    else if (band.color === 'warn') warn += 1;
    else weak += 1;
    const promptRaw = v[`p_${d.key}`];
    const prompt = promptRaw !== undefined && String(promptRaw).trim() !== ''
      ? String(promptRaw).trim()
      : REHAB_FX_PROMPT_DEFAULT;
    if (!REHAB_FX_PROMPT_OPTIONS.includes(prompt)) {
      throw new ValidationError(`«سطح راهنما — ${d.label}» از گزینه‌های مجاز نیست`);
    }
    domains.push({ key: d.key, label: d.label, value, valueFa: `${faNum(value)} ${d.unit}`, band, prompt, criterionFa: d.criterionFa });
    if (band.color !== 'ok') {
      flags.push({ key: d.key, label: `${d.label}: ${band.label} — ${faNum(value)} ${d.unit} (ملاک: ${d.criterionFa})`, value });
    }
    metrics.push({ value: `${faNum(value)} ${d.unit} — ${band.label}`, label: d.label });
  }
  if (v.d_ps_story !== undefined && String(v.d_ps_story).trim() !== '') {
    const story = rehabFxNumber(v.d_ps_story, { key: 'ps_story', label: 'توالی داستان', unit: 'تصویر', min: 0, max: REHAB_FX_STORY_MAX, kind: 'higher_better', weakMax: 0, okMin: 3, criterionFa: '', adviceFa: '' });
    metrics.push({ value: `${faNum(story)} از ${faNum(REHAB_FX_STORY_MAX)}`, label: 'توالی داستان' });
    if (story <= 1) flags.push({ key: 'ps_story', label: `توالی داستان ضعیف (${faNum(story)} از ${faNum(REHAB_FX_STORY_MAX)}) — ترتیب‌سازی تصویری روزانه اضافه شود`, value: story });
  }
  const band = ok >= 5 ? REHAB_FX_BANDS[2] : weak >= 3 ? REHAB_FX_BANDS[0] : REHAB_FX_BANDS[1];
  const notes = typeof v.notes === 'string' ? v.notes.trim().slice(0, 600) : '';
  if (notes) metrics.push({ value: notes, label: 'مشاهدهٔ درمانگر' });
  const normFa = 'ملاک‌ها برگرفته از معیار قبولی مهارت‌های «توجه و مهارت‌های ذهنی/ادراک شنیداری» چک‌لیست ۷ حیطه‌ای است (رشدی-ملاکی — ot-cog-07/08/10/11/12، ot-aud-06)؛ سطح راهنمای هر حیطه، خط پایهٔ محوشدن راهنماست.';
  const faSummary = `ارزیابی عملکردی ذهنی: ${faNum(ok)} حیطه در انتظار، ${faNum(warn)} مرزی، ${faNum(weak)} ضعف از ${faNum(REHAB_FX_DOMAINS.length)} — ${band.label}`;
  return { domains, counts: { ok, warn, weak }, band, flags, metrics, normFa, faSummary };
}

export function rehabFxAdviceOf(result: RehabFxResult): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  for (const dom of result.domains) {
    if (dom.band.color === 'ok') continue;
    const spec = REHAB_FX_DOMAINS.find((d) => d.key === dom.key);
    if (spec) out.push({ label: `${spec.label} — ${dom.band.label}`, text: spec.adviceFa });
  }
  return out;
}

export function buildRehabFxPayload(v: Record<string, string | number>, result: RehabFxResult): Record<string, PayloadEntry> {
  const payload: Record<string, PayloadEntry> = {};
  for (const d of REHAB_FX_DOMAINS) {
    const dom = result.domains.find((x) => x.key === d.key);
    payload[`d_${d.key}`] = { value: faNum(dom?.value ?? Number(v[`d_${d.key}`])), label: `${d.label} — ${d.unit}` };
    if (dom) {
      payload[`fx_${d.key}_band`] = { value: dom.band.label, label: `باند ${d.label}` };
      payload[`fx_${d.key}_prompt`] = { value: dom.prompt, label: `سطح راهنما — ${d.label}` };
    }
  }
  if (v.d_ps_story !== undefined && String(v.d_ps_story).trim() !== '') {
    const storyNum = typeof v.d_ps_story === 'number'
      ? v.d_ps_story
      : Number(String(v.d_ps_story).trim().replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))));
    payload['d_ps_story'] = { value: faNum(storyNum), label: `توالی داستان از ${faNum(REHAB_FX_STORY_MAX)}` };
  }
  for (const d of REHAB_FX_DOMAINS) {
    const p = v[`p_${d.key}`];
    if (p !== undefined && String(p).trim() !== '') payload[`p_${d.key}`] = { value: String(p).trim(), label: `سطح راهنما — ${d.label}` };
  }
  if (typeof v.notes === 'string' && v.notes.trim() !== '') {
    payload['notes'] = { value: v.notes.trim().slice(0, 600), label: 'مشاهدهٔ درمانگر' };
  }
  result.metrics.forEach((m, i) => {
    payload[`chip_metric_${i + 1}`] = { value: m.value, label: m.label };
  });
  payload['chip_band'] = { value: result.band.label, label: 'باند کلی' };
  payload['norm_fa'] = { value: result.normFa, label: 'ملاک مرجع' };
  payload['fa_summary'] = { value: result.faSummary, label: 'خلاصهٔ ارزیابی عملکردی' };
  rehabFxAdviceOf(result).forEach((a, i) => {
    payload[`advice_${i + 1}`] = { value: a.text, label: `پیشنهاد حیطه‌ای — ${a.label}` };
  });
  return payload;
}

export function rehabFxAnalysisOf(v: Record<string, string | number>, result: RehabFxResult): CaseEventAnalysis {
  const interpretationLines = [
    result.faSummary,
    result.normFa,
    ...result.domains.map((d) => `${d.label}: ${d.valueFa} — ${d.band.label}${d.prompt !== REHAB_FX_PROMPT_DEFAULT ? ` (${d.prompt})` : ''}`),
    ...(result.flags ?? []).map((f) => `پرچم: ${f.label}`)
  ];
  return {
    score: result.counts.ok,
    band: result.band.label,
    answered: REHAB_FX_DOMAINS.length,
    total: REHAB_FX_DOMAINS.length,
    maxScore: REHAB_FX_DOMAINS.length,
    flags: result.flags.length > 0 ? result.flags : undefined,
    interpretation: interpretationLines.join('\n')
  };
}

export function validateRehabFxValues(values: unknown): Record<string, string | number> {
  const raw = (values && typeof values === 'object' ? values : {}) as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  for (const d of REHAB_FX_DOMAINS) {
    const v = raw[`d_${d.key}`];
    if (v === undefined || v === null || String(v).trim() === '') {
      throw new ValidationError(`حیطهٔ «${d.label}» بی‌پاسخ مانده است`);
    }
    out[`d_${d.key}`] = typeof v === 'number' ? v : String(v).trim();
    const p = raw[`p_${d.key}`];
    if (p !== undefined && p !== null && String(p).trim() !== '') out[`p_${d.key}`] = String(p).trim();
  }
  const story = raw['d_ps_story'];
  if (story !== undefined && story !== null && String(story).trim() !== '') {
    out['d_ps_story'] = typeof story === 'number' ? story : String(story).trim();
  }
  if (typeof raw['notes'] === 'string' && (raw['notes'] as string).trim() !== '') {
    out['notes'] = (raw['notes'] as string).trim();
  }
  return out;
}

export const CASE_EVENT_TRANSITIONS: Record<string, string[]> = {
  draft: ['completed', 'cancelled'],
  completed: ['cancelled'],
  pending_family: ['completed', 'cancelled'],
  cancelled: []
};

export function canTransitionStatus(from: string, to: string): boolean {
  return (CASE_EVENT_TRANSITIONS[from] ?? []).includes(to);
}

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
