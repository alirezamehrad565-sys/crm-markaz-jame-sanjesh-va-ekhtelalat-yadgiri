// public/assets/js/csv-rtl.js — ۱.۲۵.۷۶ خروجی CSV راست‌چین جدولی (خواست کارفرما)
//
// مشکل کلاسیک CSV فارسی در اکسل: با BOM حروف فارسی درست می‌خوانند ولی جهت پاراگرافِ
// سلول‌های مختلط/مبهم چپ‌به‌راست می‌ماند. راه‌حل استاندارد CSV-متعارف: پیشوند RLM (U+200F)
// روی سلول‌های متنی — جهت رندر داخل سلول راست‌به‌چپ می‌شود و سلول‌های عددی به‌صورت عدد
// می‌مانند (بدون RLM تا اکسل آن‌ها را متن نگیرد). BOM هم حفظ می‌شود.
// همهٔ خروجی‌های CSV سامانه (سنجش روزانه/گزارش مدیر، تحلیل پیشرفته، حضور همکاران) از این
// helper می‌روند تا شکل یکدست داشته باشند؛ تابع‌ها خالص‌اند و در vitest آزمون می‌شوند.

const RLM = '\u200F';

/** سلول CSV: متن فارسی/مختلط → RLM + متن؛ عدد خالص → بدون RLM (عدد می‌ماند)؛ خالی → '' */
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(v) : '';
  }
  const s = String(v);
  if (s === '') return '';
  if (/^-?\d+(?:[.,]\d+)?$/.test(s)) return s; // عدد رشته‌ای خالص — عدد بماند
  return RLM + s;
}

/** نقل‌قول استاندارد CSV — فقط وقتی لازم است (ویرگول/کوتیشن/خط جدید) */
export function csvQuote(s) {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** یک ردیف کامل از آرایهٔ سلول‌ها — خانه‌ها RTL و نقل‌قول‌شده */
export function csvRow(cells) {
  return cells.map((c) => csvQuote(csvCell(c))).join(',');
}

/** دانلود استاندارد: BOM + خط‌ها — همهٔ خروجی‌های CSV سامانه از همین می‌روند */
export function downloadCsv(filename, lines) {
  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
