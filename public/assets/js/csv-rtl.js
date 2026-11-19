// public/assets/js/csv-rtl.js — ۱.۲۷.۱۴ خروجی CSV راست‌چین جدولی (خواست کارفرما)
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

/* ۱.۲۷.۱۵ — خواست کارفرما: «format as table» — هر ستون به عرضِ بزرگ‌ترین دادهٔ همان ستون.
   عرض نمایشی = نویسهٔ مرئی؛ نویسه‌های صفرعرض (RLM/ZWJ/BOM…) شمرده نمی‌شوند تا ستون‌های
   متن و عدد در نمایش monospace یک‌درمیان تراز بنشینند. خانه‌ها با فاصلهٔ عادی پر می‌شوند
   (اکسل فضای دور عدد را نادیده می‌گیرد و عدد می‌ماند)؛ ردیف کم‌ستون با خانهٔ خالیِ
   هم‌عرض کامل می‌شود تا همهٔ ردیف‌ها یک عرض داشته باشند. */
const ZERO_WIDTH = /[\u200B\u200C\u200D\u200E\u200F\u2060\uFEFF]/;

function displayWidth(s) {
  let w = 0;
  for (const ch of s) if (!ZERO_WIDTH.test(ch)) w++;
  return w;
}

/** جدول هم‌عرض از آرایهٔ ردیف‌ها (اولی = سرستون) — خروجی خط‌های CSV آمادهٔ downloadCsv */
export function csvTable(rows) {
  const widths = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const w = displayWidth(csvCell(row[i]));
      if (w > (widths[i] ?? 0)) widths[i] = w;
    }
  }
  return rows.map((row) => {
    const cells = [];
    for (let i = 0; i < widths.length; i++) {
      const s = csvCell(row[i]);
      cells.push(csvQuote(s + ' '.repeat(Math.max(widths[i] - displayWidth(s), 0))));
    }
    return cells.join(',');
  });
}
