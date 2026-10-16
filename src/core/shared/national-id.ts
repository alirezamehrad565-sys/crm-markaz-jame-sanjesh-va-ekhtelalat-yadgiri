/**
 * زیرساخت مشترک — زمان تهران، کدملی، اسکیمای Zod و ثابت‌ها — اعتبارسنجی و پردازش کد ملی
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// اعتبارسنجی کد ملی ایران با الگوریتم رسمی checksum
// + نرمال‌سازی و تبدیل ارقام فارسی/عربی به انگلیسی

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * تبدیل ارقام فارسی/عربی به انگلیسی و حذف هر کاراکتر غیررقمی.
 * کد ملی‌هایی که با صفر شروع می‌شوند گاهی بدون صفر ذخیره شده‌اند → padding با صفر تا ۱۰ رقم.
 */
export function normalizeNationalId(raw: string): string {
  if (!raw) return '';
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
  if (out.length > 0 && out.length < 10) {
    out = out.padStart(10, '0');
  }
  return out;
}

/**
 * الگوریتم رسمی checksum کد ملی:
 * ۱) رقم‌های ۱ تا ۹ در وزن‌های [10,9,8,7,6,5,4,3,2] ضرب می‌شوند
 * ۲) باقیمانده مجموع بر ۱۱ محاسبه می‌شود
 * ۳) اگر باقیمانده < ۲ باشد رقم کنترلی همان باقیمانده است، وگرنه ۱۱ منهای باقیمانده
 */
export function isValidIranianNationalId(value: string): boolean {
  const nid = normalizeNationalId(value);
  if (!/^\d{10}$/.test(nid)) return false;
  // کدهای با همه ارقام یکسان نامعتبرند
  if (/^(\d)\1{9}$/.test(nid)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(nid[i]) * (10 - i);
  }
  const remainder = sum % 11;
  const expected = remainder < 2 ? remainder : 11 - remainder;
  return Number(nid[9]) === expected;
}
