// format.js — توابع کمکی خالص: ارقام فارسی، تقویم جلالی، زمان تهران
// بدون DOM تا در Node (vitest) هم واحد-تست‌پذیر باشد.

// ─────────────── ارقام فارسی ───────────────

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** تبدیل همهٔ ارقام لاتین رشته به ارقام فارسی — برای نمایش به کاربر */
export function fa(input) {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** وارونهٔ fa: رقم‌های فارسی (۰-۹) و عربی (٠-٩) → رقم لاتین — برای پارس ورودی کاربر */
export function enDigits(input) {
  return String(input)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/**
 * — نگه‌دارندهٔ کد ملی (پرونده‌های ثبت‌شدهٔ بدون کد ملی — آرشیو):
 * سرور مقدار یکتای «NAS-…» می‌گذارد تا قید UNIQUE حفظ شود؛ در UI مثل «بدون کد ملی»
 * نمایش داده می‌شود و از فرم ویرایش قابل ثبت واقعی است.
 */
export const PLACEHOLDER_NID_PREFIX = 'NAS-';

export function isPlaceholderNid(nid) {
  return Boolean(nid) && String(nid).startsWith(PLACEHOLDER_NID_PREFIX);
}

// ─────────────── تهران (+03:30 ثابت) ───────────────

// اختلاف ساعت تهران نسبت به UTC به میلی‌ثانیه (3:30) — ایران DST ندارد
const TEHRAN_OFFSET_MS = 210 * 60 * 1000;

/** دو-رقمی‌سازی ساده برای HH:MM و YYYY-MM-DD */
const pad2 = (n) => (n < 10 ? `0${n}` : String(n));

/**
 * — نرمال‌ساز ورودی زمان به Date (UTC معادل). نمایش زمان نباید به TZ مرورگر
 * وابسته باشد — هر رشته‌ای از بک‌اند به شکل یکسان تفسیر می‌شود:
 * - «…Z» یا «…±HH:MM» → همان‌طور (از قبل کامل)
 * - «YYYY-MM-DD HH:MM:SS[.sss]» (قرارداد SQLite datetime('now') = UTC) → فاصله→T + Z
 * - «YYYY-MM-DDTHH:MM:SS[.sss]» بدون منطقه → + Z (قرارداد بک‌اند: naive یعنی UTC)
 * - «YYYY-MM-DD» (تاریخ خالص) → T00:00:00Z
 * خروجی همیشه Date است؛ ورودی نامعتبر → Invalid Date (بدون throw — مثل رفتار قبلی).
 */
export function toUtcIso(value) {
  if (value instanceof Date) return value;
  const s = String(value ?? '').trim();
  if (!s) return new Date(NaN);
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) return new Date(s);
  // تاریخ خالص (بدون زمان)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00.000Z`);
  // naive با فاصله یا T
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)$/);
  if (m) return new Date(`${m[1]}T${m[2]}Z`);
  // هر چیز دیگر — به مرورگر بسپار (رفتار قبلی)
  return new Date(s);
}

/** ISO UTC → تاریخ YYYY-MM-DD به وقت تهران */
export function tehranYmdOfIso(iso) {
  const t = new Date(toUtcIso(iso).getTime() + TEHRAN_OFFSET_MS);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** ISO UTC → ساعت HH:MM به وقت تهران */
export function tehranTimeOfIso(iso) {
  const t = new Date(toUtcIso(iso).getTime() + TEHRAN_OFFSET_MS);
  return `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
}

/** الآن → YYYY-MM-DD تهران */
export function tehranTodayYmd(now = new Date()) {
  return tehranYmdOfIso(now.toISOString());
}

/** YYYY-MM-DD تهران → مرز UTC آن روز {start, end} (ISO) */
export function tehranDayRange(ymd) {
  const startMs = Date.parse(`${ymd}T00:00:00.000Z`) - TEHRAN_OFFSET_MS;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 24 * 60 * 60 * 1000 - 1).toISOString()
  };
}

/** افزودن n روز تقویمی به YMD (خود تاریخ — بدون درگیری ساعت) */
export function addDaysYmd(ymd, n) {
  const ms = Date.parse(`${ymd}T00:00:00.000Z`) + n * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** روز هفتهٔ ایرانیِ YMD تهران: ۰ = شنبه … ۶ = جمعه */
export function iranianWeekdayOfYmd(ymd) {
  const ms = new Date(`${ymd}T12:00:00.000Z`).getTime() + TEHRAN_OFFSET_MS; // midday → safe
  const jsDay = new Date(ms).getUTCDay(); // 0=Sun … 6=Sat
  return (jsDay + 1) % 7;
}

// ─────────────── تبدیل جلالی (الگوریتم jalaali-js، مجوز MIT) ───────────────

const div = (a, b) => Math.trunc(a / b);
const mod = (a, b) => a - Math.trunc(a / b) * b;

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy, withoutLeap) {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jm = 0;
  let jump = 0;
  let leap = 0;
  let n = 0;
  for (let i = 1; i < bl; i += 1) {
    jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (!withoutLeap) {
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
  }
  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

/** میلادی YMD → {jy, jm, jd} جلالی */
export function toJalali(gy, gm, gd) {
  const jdn = g2d(gy, gm, gd);
  return d2j(jdn);
}

/** جلالی {jy, jm, jd} → میلادی {gy, gm, gd} */
export function toGregorian(jy, jm, jd) {
  const r = jalCal(jy, true);
  return d2g(j2d(jy, jm, jd, r));
}

function j2d(jy, jm, jd, r) {
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

/**
 * پارس تاریخ جلالی از ورودی آزاد: «۱۴۰۴/۷/۱۴»، «۱۴۰۴-۰۷-۱۴»، «۱۴۰۴۰۷۱۴»
 * → YYYY-MM-DD میلادی یا null
 *: جداسازی با جداکننده هم پذیرفته می‌شود (روز/ماه یک‌رقمی اشکال ندارد)
 */
export function parseJalaliToYmd(input) {
  if (!input) return null;
  const latin = String(input)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .trim();
  let jy; let jm; let jd;
  const parts = latin.split(/[\/\-.]/).filter((p) => p.length > 0);
  if (parts.length === 3) {
    [jy, jm, jd] = parts.map(Number);
  } else {
    const digits = latin.replace(/[^\d]/g, '');
    if (digits.length !== 8) return null;
    jy = Number(digits.slice(0, 4));
    jm = Number(digits.slice(4, 6));
    jd = Number(digits.slice(6, 8));
  }
  if (jy < 1200 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
}

/** YYYY-MM-DD تهران + دقیقه از نیمه‌شب → ISO UTC */
export function tehranYmdMinuteToIso(ymd, minute) {
  const startMs = Date.parse(`${ymd}T00:00:00.000Z`) - TEHRAN_OFFSET_MS;
  return new Date(startMs + minute * 60 * 1000).toISOString();
}

function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy, false);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm;
  let jd;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

// ─────────────── قالب‌بندی‌های نمایشی ───────────────

export const WEEKDAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

/** — نام تک‌حرفی روزها برای گرید هفتگی در موبایل (هم‌اندیس با WEEKDAY_NAMES) */
export const WEEKDAY_ABBRS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

/** — پایه‌های تحصیلی ثابت (هم‌سان با STUDENT_GRADES سمت سرور) */
export const STUDENT_GRADES = ['پیش‌دبستانی', 'اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم'];

/** — نمایش مقاوم پایه: مقادیر قدیمی (grade-3، ارقام فارسی/لاتین، «کلاس سوم») → لیبل استاندارد */
export function gradeLabel(grade) {
  if (!grade) return '';
  if (STUDENT_GRADES.includes(grade)) return grade;
  const latin = String(grade)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .trim();
  const m = latin.match(/grade[-_ ]?(\d)/i) ?? latin.match(/(\d)/);
  if (m) {
    const n = Number(m[1]);
    if (n === 0) return 'پیش‌دبستانی';
    if (n >= 1 && n <= 6) return STUDENT_GRADES[n];
  }
  if (latin.includes('پیش')) return 'پیش‌دبستانی';
  return grade;
}

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

/** YYYY-MM-DD → «۱۴۰۴/۰۷/۱۴» */
export function formatJalaliNumeric(ymd) {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  const j = toJalali(y, m, d);
  return fa(`${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`);
}

/**
 * — تشخیص قالب تاریخ ذخیره‌شده: رکوردهای قدیمی/seed جلالی‌اند (سال ۱۲۰۰–۱۵۰۰)
 * و مقادیر جدید (خروجی jalali-picker و بات بله) میلادی (سال ≥۱۷۰۰).
 * همان قرارداد ageLineFromBirthDate (clinical-insights) و parseBirthDateLoose (باندل).
 */
export function storedDateKind(ymd) {
  const y = Number(String(ymd ?? '').slice(0, 4));
  return y >= 1700 ? 'gregorian' : 'jalali';
}

/**
 * تاریخ ذخیره‌شدهٔ تولد → همیشه «۱۳۹۱/۰۷/۰۲» (شمسیِ نمایشی)
 * مقدار DB دو-قالبی است: رکوردهای قدیمی جلالی (seed) و جدید میلادی (خروجی picker/بات)
 * → میلادی ≥۱۷۰۰ به جلالی تبدیل می‌شود؛ جلالیِ ذخیره‌شده همان‌طور نمایش داده می‌شود (m131).
 */
export function formatStoredJalaliNumeric(ymd) {
  if (!ymd) return '—';
  const s = String(ymd);
  if (storedDateKind(s) === 'gregorian') return formatJalaliNumeric(s);
  return fa(s.replace(/-/g, '/'));
}

// ─────────────── پارس ورودی آزاد تاریخ جلالی (تقویم فرم‌ها) ───────────────

/** تعداد روزهای یک ماه جلالی (با کبیسهٔ واقعی از خود الگوریتم jalaali) */
export function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const g = toGregorian(jy, 12, 30);
  const back = toJalali(g.gy, g.gm, g.gd);
  return back.jm === 12 && back.jd === 30 ? 30 : 29;
}

/**
 * پارس ورودی آزاد تاریخ جلالی → YMD میلادی، null = نامعتبر، '' = خالی
 * «۱۴۰۲/۵/۱۴» یا «1402-05-14» یا «۱۴۰۲.۵.۱۴» یا «۱۴۰۲ ۵ ۱۴» یا فشردهٔ ۸رقمی «۱۴۰۲۰۵۱۴»
 * با رقم فارسی/عربی/لاتین. اعتبارسنجی با گردش کامل جلالی→میلادی→جلالی —
 * روز نامعتبر (مثل ۳۰ اسفند سال غیرکبیسه) و ماه/سال خارج از بازه را می‌گیرد.
 */
export function parseJalaliInput(raw) {
  const s = enDigits(String(raw ?? '')).trim();
  if (!s) return '';
  let segs;
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/); // ۱۴۰۲۰۵۱۴
  if (compact) {
    segs = [compact[1], compact[2], compact[3]];
  } else {
    segs = s.split(/[\/\-.، ]+/).filter(Boolean);
    if (segs.length !== 3) return null;
  }
  const [ys, ms, ds] = segs;
  if (!/^\d{4}$/.test(ys) || !/^\d{1,2}$/.test(ms) || !/^\d{1,2}$/.test(ds)) return null;
  const jy = Number(ys);
  const jm = Number(ms);
  const jd = Number(ds);
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  const g = toGregorian(jy, jm, jd);
  const back = toJalali(g.gy, g.gm, g.gd);
  if (back.jy !== jy || back.jm !== jm || back.jd !== jd) return null;
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

/** YYYY-MM-DD → «شنبه ۱۴ مهر ۱۴۰۴» */
export function formatJalaliFull(ymd) {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  const j = toJalali(y, m, d);
  return `${WEEKDAY_NAMES[iranianWeekdayOfYmd(ymd)]} ${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${fa(j.jy)}`;
}

/** YYYY-MM-DD → «۱۴ مهر» */
export function formatJalaliShort(ymd) {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  const j = toJalali(y, m, d);
  return `${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]}`;
}

/** ISO UTC → «شنبه ۱۴ مهر، ۰۸:۳۰» */
export function formatJalaliDateTime(iso) {
  if (!iso) return '—';
  const ymd = tehranYmdOfIso(iso);
  return `${formatJalaliShort(ymd)}، ${fa(tehranTimeOfIso(iso))}`;
}

/** برچسب امروز/فردا/دیروز برای YMD تهران */
export function relativeDayLabel(ymd) {
  const today = tehranTodayYmd();
  if (ymd === today) return 'امروز';
  if (ymd === addDaysYmd(today, 1)) return 'فردا';
  if (ymd === addDaysYmd(today, -1)) return 'دیروز';
  return null;
}

// ─────────────── دقیقه ↔ HH:MM ───────────────

/** دقیقه از نیمه‌شب → برچسب «۰۸:۳۰» */
export function minuteToLabel(minute) {
  return `${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`;
}

/** برچسب «۰۸:۳۰» → دقیقه از نیمه‌شب */
export function timeToMinute(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** گزینه‌های شبکه ۱۵ دقیقه‌ای بین دو ساعت — ['06:00','06:15',…] */
export function gridTimes(from = '06:00', to = '22:00') {
  const out = [];
  for (let m = timeToMinute(from); m <= timeToMinute(to); m += 15) {
    out.push(minuteToLabel(m));
  }
  return out;
}

/** فاصله انسانی دو لحظه (دقیقه) → «۹۰ دقیقه» */
export function durationLabel(minutes) {
  if (minutes < 60) return `${fa(minutes)} دقیقه`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${fa(h)} ساعت` : `${fa(h)} ساعت و ${fa(m)} دقیقه`;
}

/** ساعت‌های هفتگی: «۲۳٫۵ ساعت» */
export function weeklyHoursLabel(minutes) {
  const hours = minutes / 60;
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace('.', '٫');
  return `${fa(text)} ساعت`;
}

/** — فقط http/https به‌عنوان href بیرونی امن است (دفاع دوم در برابر javascript:/data:) */
export function safeExternalHref(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}
