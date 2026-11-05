import { jalaliToGregorianYmd, toJalaliParts } from '@core/shared';

// ─── درون‌ریزی اکسل: منطق خالص (نرمال‌سازی سلول، تاریخ، تطبیق مقادیر) ───

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

/** یکدست‌سازی ارقام فارسی/عربی → لاتین */
export function enDigits(input: unknown): string {
  return String(input ?? '')
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * نرمال‌سازی متن سلول: ارقام لاتین، ی/ک فارسی، نیم‌فاصلهٔ یکدست، فاصله‌های تکراری حذف.
 * همین خروجی هم برای «نمایش» و هم مبنای کلید تطبیق است.
 */
export function normalizeCellText(raw: unknown): string {
  return enDigits(raw)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200f\u200e]/g, '\u200c')
    .replace(/\s+/g, ' ')
    .trim();
}

/** کلید تطبیق رکورد (نام مدرسه / عنوان فاز): بی‌تفاوت به فاصله، نیم‌فاصله، ی/ک و بزرگی‌حرف */
export function nameKey(raw: unknown): string {
  return normalizeCellText(raw)
    .replace(/[\s\u200c\u200f\u200e]/g, '')
    .toLowerCase();
}

/**
 * پذیرش تاریخ شمسی یا میلادی از سلول اکسل:
 *  • شمسی: ۱۴۰۴/۰۷/۰۱ ، 1404-7-1 ، 14040701
 *  • میلادی: 2025-09-23 (سال ≥ ۱۷۰۰)
 * خروجی: YMD میلادی ذخیره‌سازی (YYYY-MM-DD) یا null اگر نامعتبر.
 * تاریخ شمسی با بازگشت‌سنجی کنترل می‌شود (مثل اسفند ۳۰ سال غیرکابیسه رد می‌شود).
 */
export function parseFlexibleDate(raw: unknown): string | null {
  const s = enDigits(raw).trim();
  if (!s) return null;

  let parts: string[] | null = null;
  const compact = s.match(/^(\d{4})(\d{1,2})(\d{1,2})$/);
  if (compact) {
    parts = [compact[1], compact[2], compact[3]];
  } else {
    const seg = s.split(/[/\-.، ]+/).filter((p) => p.length > 0);
    if (seg.length === 3) parts = seg;
  }
  if (!parts) return null;

  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  // سال ≥ ۱۷۰۰ → میلادی
  if (y >= 1700) {
    const ms = Date.UTC(y, m - 1, d);
    const back = new Date(ms);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // شمسی (۱۳۰۰ تا ۱۵۰۰)
  if (y < 1300 || y > 1500) return null;
  const g = jalaliToGregorianYmd(y, m, d);
  const j = toJalaliParts(Number(g.slice(0, 4)), Number(g.slice(5, 7)), Number(g.slice(8, 10)));
  if (j.jy !== y || j.jm !== m || j.jd !== d) return null;
  return g;
}

/** نمایش شمسی با ارقام لاتین از YMD میلادی ذخیره‌شده (برای پیش‌نمایش و خروجی اکسل) */
export function jalaliDisplayOfYmd(ymd: string): string {
  const [gy, gm, gd] = ymd.split('-').map(Number);
  const j = toJalaliParts(gy, gm, gd);
  return `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`;
}

/** تطبیق مقدار سلول با گزینه‌های مجاز (برچسب فارسی / کلید انگلیسی / مترادف) — بی‌تفاوت به فاصله و نیم‌فاصله */
export function matchEnum(
  raw: unknown,
  options: { value: string; label: string; aliases?: string[] }[]
): string | null {
  const needle = nameKey(raw);
  if (!needle) return null;
  for (const o of options) {
    if (nameKey(o.value) === needle || nameKey(o.label) === needle) return o.value;
    if (o.aliases?.some((a) => nameKey(a) === needle)) return o.value;
  }
  return null;
}

/**
 * نرمال‌سازی شماره تلفن: ارقام لاتین، حذف فاصله؛ فقط رقم و + - ( )
 * خروجی value فقط وقتی ok=true معتبر است.
 */
export function normalizePhone(raw: unknown): { ok: boolean; value: string } {
  const s = enDigits(raw).trim();
  if (!s) return { ok: true, value: '' };
  const compact = s.replace(/[\s\u200c]/g, '');
  if (!/^[0-9+\-()]{3,20}$/.test(compact)) return { ok: false, value: compact };
  return { ok: true, value: compact };
}

/** نرمال‌سازی کد (کد مدرسه): ارقام لاتین، بدون فاصله */
export function normalizeCode(raw: unknown): string {
  return enDigits(raw).trim().replace(/[\s\u200c]/g, '');
}
