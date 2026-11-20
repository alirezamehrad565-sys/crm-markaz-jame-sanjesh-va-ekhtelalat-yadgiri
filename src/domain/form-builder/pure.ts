/* form-builder/pure.ts — منطق خالص فرم‌ساز (v1.27.34 — REFERRAL-DESIGN §A-2)
 * اعتبارسنجی پاسخ‌ها در برابر بلوک‌های فرم + نرمال‌سازی — هیچ دسترسی به db/audit ندارد. */
import type { FormAnswer, FormBlock, FormBlockKind } from './types';

/* برچسب انواع بلوک — آینهٔ کلاینت در views/form-builder.js */
export const FORM_KIND_LABELS: Record<FormBlockKind, string> = {
  text: 'متن کوتاه',
  longtext: 'متن بلند',
  number: 'عدد',
  phone: 'موبایل',
  select: 'انتخاب تکی',
  multi: 'انتخاب چندگانه',
  yes_no: 'بله / خیر',
  note: 'صفحهٔ آگاهی'
};

/* ارقام فارسی/عربی → لاتین (هم‌الگوی GuardianPhoneSchema) */
export function normalizeLatinDigits(raw: string): string {
  return String(raw ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function normalizePhone(raw: string): string {
  let s = normalizeLatinDigits(raw).replace(/[\s\-().]/g, '');
  if (s.startsWith('+98')) s = '0' + s.slice(3);
  else if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2);
  return s;
}

export interface AnswersValidation {
  ok: boolean;
  error?: string;
  normalized: FormAnswer[];
}

/* اعتبارسنجی پاسخ‌ها در برابر بلوک‌های منتشرشده:
 *  - اندیس‌های ناشناخته رد می‌شوند؛ بلوک note پاسخ نمی‌گیرد؛
 *  - بلوک اجباری باید پاسخ غیرخالی داشته باشد؛
 *  - select/multi فقط از میان گزینه‌های تعریف‌شده؛ yes_no فقط yes/no؛
 *  - number عدد متناهی؛ phone نرمال و ۱۱رقم با ۰۹. */
export function validateAnswers(blocks: FormBlock[], answers: { index: number; value: unknown }[]): AnswersValidation {
  const byIndex = new Map<number, unknown>();
  for (const a of answers) {
    if (!Number.isInteger(a.index) || a.index < 0 || a.index >= blocks.length) {
      return { ok: false, error: 'پاسخ به بلوکی ناموجود است', normalized: [] };
    }
    byIndex.set(a.index, a.value);
  }
  const normalized: FormAnswer[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind === 'note') continue; // صفحهٔ آگاهی پاسخ ندارد
    const raw = byIndex.get(i);
    const present = raw !== undefined && raw !== null && !(typeof raw === 'string' && raw.trim().length === 0) && !(Array.isArray(raw) && raw.length === 0);
    if (block.required && !present) {
      return { ok: false, error: `پاسخ به «${block.label}» الزامی است`, normalized: [] };
    }
    if (!present) continue; // اختیاریِ خالی = بدون پاسخ

    if (block.kind === 'select') {
      const v = String(raw);
      if (!block.options?.some((o) => o.value === v)) {
        return { ok: false, error: `پاسخ «${block.label}» یکی از گزینه‌های تعریف‌شده نیست`, normalized: [] };
      }
      normalized.push({ index: i, value: v });
      continue;
    }
    if (block.kind === 'multi') {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      if (arr.some((v) => !block.options?.some((o) => o.value === v))) {
        return { ok: false, error: `پاسخ «${block.label}» گزینهٔ ناشناخته دارد`, normalized: [] };
      }
      if (new Set(arr).size !== arr.length) {
        return { ok: false, error: `پاسخ «${block.label}» تکراری دارد`, normalized: [] };
      }
      normalized.push({ index: i, value: arr });
      continue;
    }
    if (block.kind === 'yes_no') {
      const v = String(raw);
      if (v !== 'yes' && v !== 'no') {
        return { ok: false, error: `پاسخ «${block.label}» باید بله یا خیر باشد`, normalized: [] };
      }
      normalized.push({ index: i, value: v });
      continue;
    }
    if (block.kind === 'number') {
      const n = typeof raw === 'number' ? raw : Number(normalizeLatinDigits(String(raw)));
      if (!Number.isFinite(n)) {
        return { ok: false, error: `پاسخ «${block.label}» باید عدد باشد`, normalized: [] };
      }
      normalized.push({ index: i, value: n });
      continue;
    }
    if (block.kind === 'phone') {
      const v = normalizePhone(String(raw));
      if (!/^09\d{9}$/.test(v)) {
        return { ok: false, error: `شمارهٔ «${block.label}» معتبر نیست — باید ۱۱ رقم و با ۰۹ شروع شود`, normalized: [] };
      }
      normalized.push({ index: i, value: v });
      continue;
    }
    // text / longtext — رشتهٔ عیناً (بدون تغییر ذخیره می‌شود)
    const v = String(raw);
    if (v.length > 2000) {
      return { ok: false, error: `پاسخ «${block.label}» حداکثر ۲۰۰۰ نویسه است`, normalized: [] };
    }
    normalized.push({ index: i, value: v });
  }
  return { ok: true, normalized };
}

/* گزینه‌های تکراری در select/multi — در ذخیرهٔ فرم رد می‌شود (نه در پاسخ) */
export function hasDuplicateOptionValues(block: FormBlock): boolean {
  if (!block.options) return false;
  const values = block.options.map((o) => o.value);
  return new Set(values).size !== values.length;
}
