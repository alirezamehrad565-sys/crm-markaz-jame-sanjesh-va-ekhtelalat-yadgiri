const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

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

export function isValidIranianNationalId(value: string): boolean {
  const nid = normalizeNationalId(value);
  if (!/^\d{10}$/.test(nid)) return false;
  if (/^(\d)\1{9}$/.test(nid)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(nid[i]) * (10 - i);
  }
  const remainder = sum % 11;
  const expected = remainder < 2 ? remainder : 11 - remainder;
  return Number(nid[9]) === expected;
}
