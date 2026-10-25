import { jalaliToGregorianYmd, toJalaliParts } from '@core/shared';

// ─── m188 — کلر بوک مرکز: منطق خالص (تقویم شمسی، برچسب‌ها، قالب استاندارد) ───

export function normalizeTag(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u200c\u200f\u200e]/g, '\u200c') // نیم‌فاصله و کاراکترهای جهت یکدست شود
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const norm = normalizeTag(t);
    if (norm.length < 2) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

export function escapeLike(raw: string): string {
  return String(raw ?? '').replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

// ─── تقویم شمسی ───

export function jalaliYearOfYmd(ymd: string): number {
  const [gy, gm, gd] = ymd.split('-').map(Number);
  return toJalaliParts(gy, gm, gd).jy;
}

/** سال تحصیلی (مهر تا شهریور): مهر ۱۴۰۴ تا شهریور ۱۴۰۵ = سال تحصیلی ۱۴۰۴ */
export function schoolYearOfYmd(ymd: string): number {
  const [gy, gm, gd] = ymd.split('-').map(Number);
  const j = toJalaliParts(gy, gm, gd);
  return j.jm >= 7 ? j.jy : j.jy - 1;
}

/** جابه‌جایی تاریخ میلادی ذخیره‌شده به اندازهٔ n سال شمسی (با اصلاح روز نامعتبر مثل اسفند ۳۰) */
export function shiftYmdByJalaliYears(ymd: string, n: number): string {
  const [gy, gm, gd] = ymd.split('-').map(Number);
  const j = toJalaliParts(gy, gm, gd);
  const target = { jy: j.jy + n, jm: j.jm, jd: j.jd };
  let jd = target.jd;
  for (; jd >= 29; jd -= 1) {
    const g = jalaliToGregorianYmd(target.jy, target.jm, jd);
    const back = toJalaliParts(Number(g.slice(0, 4)), Number(g.slice(5, 7)), Number(g.slice(8, 10)));
    if (back.jy === target.jy && back.jm === target.jm && back.jd === jd) break;
  }
  return jalaliToGregorianYmd(target.jy, target.jm, Math.max(jd, 1));
}

/** بازهٔ میلادی یک سال شمسی کامل (فروردین ۱ تا اسفند پایان) */
export function jalaliYearBounds(jy: number): { from: string; to: string } {
  const from = jalaliToGregorianYmd(jy, 1, 1);
  // اسفند ۳۰ فقط در سال کابیسه معتبر است؛ بازگشت ناموفق → ۲۹
  let to = jalaliToGregorianYmd(jy, 12, 30);
  const back = toJalaliParts(Number(to.slice(0, 4)), Number(to.slice(5, 7)), Number(to.slice(8, 10)));
  if (back.jy !== jy || back.jm !== 12 || back.jd !== 30) to = jalaliToGregorianYmd(jy, 12, 29);
  return { from, to };
}

// ─── قالب استاندارد تقویم اجرایی (برگرفته از سند «تقویم اجرایی و عملیاتی مرکز جامع سنجش») ───

export interface ClearbookSeedRow {
  title: string;
  adminActions: string;
  centerActions: string;
  /** ماه/روز شروع در سال شمسی (ماه‌های ۷..۱۲ در سال شروع؛ ۱..۶ در سال بعد) */
  fromMonth: number;
  fromDay: number;
  toMonth: number;
  toDay: number;
  tag: string;
}

export const CLEARBOOK_SEED_TEMPLATE: ClearbookSeedRow[] = [
  {
    title: 'سازمان‌دهی و هماهنگی اولیه',
    adminActions: 'جلسه با اداره: هماهنگی ظرفیت سنجش نوآموزان ایرانی، درخواست بخشنامه به مهدکودک‌ها.',
    centerActions: 'دریافت آمار موالید ایرانی از ثبت‌احوال (متولدین واجد شرایط پیش‌دبستانی و پیش از دبستان)؛ تدوین جدول قطعی زمان‌بندی سنجش بین مهدکودک‌ها و اطلاع‌رسانی به خانواده‌ها.',
    fromMonth: 7, fromDay: 1, toMonth: 7, toDay: 7,
    tag: 'سازمان‌دهی'
  },
  {
    title: 'شروع سنجش بدو ورود به دبستان',
    adminActions: 'ارسال گزارش هفتگی پیشرفت سنجش به اداره (جهت پایش پوشش آماری).',
    centerActions: 'سنجش روزانه ۲۰ نفر (۳ روز در هفته)؛ اجرای تست تخصصی ارجاعات در بازه ۱۰ روزه و آغاز کاردرمانی.',
    fromMonth: 7, fromDay: 8, toMonth: 8, toDay: 30,
    tag: 'سنجش بدو ورود'
  },
  {
    title: 'بسترسازی اختلالات یادگیری',
    adminActions: 'صدور بخشنامه از اداره به مدارس: معرفی مرکز و ابلاغ رویه ارجاع دانش‌آموزان دارای اختلال یادگیری (SLD) و دیرآموز.',
    centerActions: 'آماده‌سازی ظرفیت مرکز برای شیفت از «سنجش» به «اختلالات یادگیری».',
    fromMonth: 8, fromDay: 1, toMonth: 8, toDay: 10,
    tag: 'اختلالات یادگیری'
  },
  {
    title: 'فاز اختلالات یادگیری (SLD)',
    adminActions: 'جلسات توجیهی حضوری در مدارس: حضور در شورای معلمان برای آموزش نشانه‌های اختلالات یادگیری و نحوه ارجاع.',
    centerActions: 'پذیرش مستمر ارجاعات مدارس؛ کاهش روزهای سنجش و افزایش ظرفیت درمان (۵ تا ۳۰ جلسه).',
    fromMonth: 8, fromDay: 11, toMonth: 10, toDay: 30,
    tag: 'اختلالات یادگیری'
  },
  {
    title: 'سنجش اتباع',
    adminActions: 'هماهنگی سامانه‌ای: پیگیری از اداره برای فعال شدن دسترسی ثبت‌نام اتباع در سامانه‌ها (سیرت/سهما/کد یکتا)؛ صدور بخشنامه اتباع: اطلاع‌رسانی به مدارس و مراجع محلی برای نوبت‌گیری متمرکز اتباع.',
    centerActions: 'اختصاص شیفت‌های کاری مرکز صرفاً به غربالگری و تست تخصصی نوآموزان اتباع؛ اتمام ارزیابی‌های ناتمام.',
    fromMonth: 11, fromDay: 1, toMonth: 11, toDay: 30,
    tag: 'سنجش اتباع'
  },
  {
    title: 'کمیته جای‌دهی تحصیلی',
    adminActions: 'دعوت‌نامه رسمی: دعوت از نماینده اداره، مدیران مدارس استثنایی و والدین برای حضور در کمیته.',
    centerActions: 'برگزاری جلسات و صدور رای نهایی (جای‌دهی در سیستم عادی یا استثنایی).',
    fromMonth: 12, fromDay: 1, toMonth: 12, toDay: 7,
    tag: 'کمیته جای‌دهی'
  },
  {
    title: 'تداوم درمان و پیگیری',
    adminActions: 'ارسال گزارش عملکرد شش‌ماهه به اداره؛ جمع‌بندی و ترخیص پرونده‌ها.',
    centerActions: 'ادامه درمان‌های اختلالات یادگیری و مداخلات بهنگام.',
    fromMonth: 1, fromDay: 1, toMonth: 2, toDay: 31,
    tag: 'تداوم درمان'
  },
  {
    title: 'آماده‌سازی جهش تحصیلی',
    adminActions: 'درخواست صدور بخشنامه جهش از اداره: اطلاع‌رسانی شرایط، مدارک و زمان ثبت‌نام جهش تحصیلی.',
    centerActions: 'تنظیم سیستم نوبت‌دهی ویژه جهش در مرکز.',
    fromMonth: 2, fromDay: 1, toMonth: 2, toDay: 15,
    tag: 'جهش تحصیلی'
  },
  {
    title: 'ارزیابی جهش تحصیلی',
    adminActions: 'اطلاع‌رسانی مجدد به مدارس جامانده.',
    centerActions: 'اجرای آزمون‌های شناختی جهش و اعلام نتایج به مدارس.',
    fromMonth: 3, fromDay: 1, toMonth: 3, toDay: 31,
    tag: 'جهش تحصیلی'
  },
  {
    title: 'سنجش تکمیلی (تابستانه)',
    adminActions: 'اطلاعیه عمومی: فراخوان سنجش نوآموزان جامانده (ایرانی و اتباع جامانده).',
    centerActions: 'بازگشایی ظرفیت سنجش.',
    fromMonth: 4, fromDay: 1, toMonth: 5, toDay: 31,
    tag: 'سنجش تابستانه'
  },
  {
    title: 'آماده‌سازی تست مجدد',
    adminActions: 'صدور بخشنامه تست مجدد از سوی اداره: ابلاغ به مدیران مدارس جهت معرفی دانش‌آموزان کاندیدای انتقال آموزشی.',
    centerActions: 'توجیه مدیران مدارس برای تکمیل فرم‌های عملکرد تحصیلی دانش‌آموز پیش از ارجاع.',
    fromMonth: 5, fromDay: 1, toMonth: 5, toDay: 7,
    tag: 'تست مجدد'
  },
  {
    title: 'اجرای تست مجدد',
    adminActions: 'ارسال لیست نهایی تغییر جایگاه دانش‌آموزان به اداره جهت ثبت در سامانه سیدا.',
    centerActions: 'اجرای ارزیابی‌های تشخیصی و تعیین جایگاه نهایی آموزشی برای سال تحصیلی جدید.',
    fromMonth: 6, fromDay: 1, toMonth: 6, toDay: 31,
    tag: 'تست مجدد'
  }
];

export interface ClearbookSeedPlan {
  title: string;
  admin_actions: string;
  center_actions: string;
  from_date: string;
  to_date: string | null;
  tag: string;
  sort_order: number;
}

/** ساخت ۱۲ فاز قالب استاندارد برای سال شروع شمسی (مهرِ سال شروع تا شهریورِ سال بعد) */
export function buildSeedPlans(startYear: number): ClearbookSeedPlan[] {
  return CLEARBOOK_SEED_TEMPLATE.map((row, i) => {
    const fromYear = row.fromMonth >= 7 ? startYear : startYear + 1;
    const toYear = row.toMonth >= 7 ? startYear : startYear + 1;
    return {
      title: row.title,
      admin_actions: row.adminActions,
      center_actions: row.centerActions,
      from_date: jalaliToGregorianYmd(fromYear, row.fromMonth, row.fromDay),
      to_date: jalaliToGregorianYmd(toYear, row.toMonth, row.toDay),
      tag: row.tag,
      sort_order: i
    };
  });
}
