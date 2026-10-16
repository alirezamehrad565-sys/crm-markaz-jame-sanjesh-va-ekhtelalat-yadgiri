/**
 * ماژول غربالگری — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تایپ‌های ماژول سنجش روزانه (غربال نوآموزان بدو ورود به دبستان)
// اصل طراحی: بدون پروفایل — فقط «نام + روز + برچسب‌ها»؛ پیگیری بعدی بر حسب برچسب.

/** ۶ برچسب ثابت سامانه — در UI چیپ تاگل یک‌لمسی دارند */
export const SCREENING_PREDEFINED_TAGS = [
  { id: 'ref_vision', label: 'ارجاع تخصصی بینایی', kind: 'referral' },
  { id: 'ref_hearing', label: 'ارجاع تخصصی شنوایی', kind: 'referral' },
  { id: 'ref_iq', label: 'ارجاع هوش', kind: 'referral' },
  { id: 'ref_motor', label: 'ارجاع جسمی حرکتی', kind: 'referral' },
  { id: 'st_coop', label: 'عدم همکاری', kind: 'status' },
  { id: 'st_noreg', label: 'نداشتن ثبت‌نام', kind: 'status' }
] as const;

export type ScreeningTagKind = 'referral' | 'status';

/** برچسب‌های «ارجاع تخصصی» — پریست پیگیری + شمارندهٔ KPI ارجاع */
export const SCREENING_REFERRAL_TAGS: readonly string[] = SCREENING_PREDEFINED_TAGS.filter(
  (t) => t.kind === 'referral'
).map((t) => t.label);

export interface ScreeningEntry {
  id: string;
  /** نام و فامیل نوآموز — متن آزاد (بدون ساختار پروفایلی) */
  name: string;
  /** روز سنجش — YYYY-MM-DD به وقت تهران */
  day: string;
  /** برچسب‌های ثابت + برچسب‌های آزاد # (کارمند سنجش‌گر، مهدکودک مبدأ، …) */
  tags: string[];
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScreeningTagCount {
  label: string;
  count: number;
  /** ثابت ارجاع / ثابت وضعیت / آزاد (#) */
  kind: ScreeningTagKind | 'custom';
}

export interface ScreeningDayCount {
  day: string;
  count: number;
}

/** KPIهای مدیر — روی همان ورودی‌های فیلترشده محاسبه می‌شود (pure) */
export interface ScreeningStats {
  total: number;
  /** عادی = بدون برچسب ثابت (ارجاع تخصصی یا وضعیت) — برچسب آزاد کارمند/مهدکودک تاثیری ندارد */
  normal: number;
  /** ورودی‌های دارای حداقل یک برچسب ارجاع تخصصی */
  referrals: number;
  /** درصد ارجاع = referrals / total (۰ تا ۱۰۰) */
  referralRate: number;
  noCoop: number;
  noReg: number;
  perTag: ScreeningTagCount[];
  byDay: ScreeningDayCount[];
}

export interface ScreeningListFilters {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  /** جستجوی متنی در نام (contains) */
  q?: string;
  /** فیلتر برچسب — OR: ورودی که «هر یک» از این برچسب‌ها را دارد */
  tags?: string[];
}

export interface ScreeningListResult {
  entries: ScreeningEntry[];
  stats: ScreeningStats;
}

/** — خلاصهٔ یک بازه برای گزارش کوتاه داشبورد (بدون ردیف‌ها) */
export interface ScreeningRangeSummary {
  total: number;
  /** عادی = بدون برچسب ثابت (ارجاع/وضعیت) — برچسب آزاد کارمند/مهدکودک تأثیر ندارد */
  normal: number;
  referrals: number;
  noCoop: number;
  noReg: number;
}

export interface ScreeningService {
  list(filters: ScreeningListFilters): Promise<ScreeningListResult>;
  tagsSummary(): Promise<ScreeningTagCount[]>;
  /** — شمارش سنجش هر روز در بازه (برای نمودار تحقق هدفگذاری داشبورد) */
  dayCounts(from: string, to: string): Promise<ScreeningDayCount[]>;
  /** — خلاصهٔ بازه: کل/عادی/ارجاع — برچسب‌ها در JS ارزیابی می‌شوند (تعریف ) */
  rangeSummary(from: string, to: string): Promise<ScreeningRangeSummary>;
  create(input: { name: string; tags: string[]; day?: string }, actor: ScreeningActor): Promise<ScreeningEntry>;
  update(id: string, input: { name?: string; tags?: string[] }, actor: ScreeningActor): Promise<ScreeningEntry>;
  remove(id: string, actor: ScreeningActor): Promise<void>;
}

/** بازیگر — همان AuthContext هسته که در سرویس مصرف می‌شود */
export interface ScreeningActor {
  staffId: string;
  displayName: string;
  role: string;
}
