export const SCREENING_PREDEFINED_TAGS = [
  { id: 'ref_vision', label: 'ارجاع تخصصی بینایی', kind: 'referral' },
  { id: 'ref_hearing', label: 'ارجاع تخصصی شنوایی', kind: 'referral' },
  { id: 'ref_iq', label: 'ارجاع هوش', kind: 'referral' },
  { id: 'ref_motor', label: 'ارجاع جسمی حرکتی', kind: 'referral' },
  { id: 'st_coop', label: 'عدم همکاری', kind: 'status' },
  { id: 'st_noreg', label: 'نداشتن ثبت‌نام', kind: 'status' }
] as const;

export type ScreeningTagKind = 'referral' | 'status';

export const SCREENING_REFERRAL_TAGS: readonly string[] = SCREENING_PREDEFINED_TAGS.filter(
  (t) => t.kind === 'referral'
).map((t) => t.label);

export interface ScreeningEntry {
  id: string;
  name: string;
  day: string;
  tags: string[];
  /* ۱.۲۵.۵۰ — دو فیلد اختیاری ثبت روزانه */
  birthDate: string | null;      // میلادی YYYY-MM-DD؛ نمایش شمسی سمت کلاینت
  readinessScore: number | null; // ۰..۳۴ (۱.۲۵.۵۷)
  note: string | null;           // ۱.۲۵.۵۷ — توضیحات اختیاری (سقف ۵۰۰ نویسه)
  iqHandledAt: string | null;    // ۱.۲۷.۳۳ — لحظهٔ ثبت نتیجهٔ ارزیابی تخصصی (null = هنوز در پیگیری)
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScreeningTagCount {
  label: string;
  count: number;
  kind: ScreeningTagKind | 'custom';
}

export interface ScreeningDayCount {
  day: string;
  count: number;
}

export interface ScreeningStats {
  total: number;
  normal: number;
  referrals: number;
  referralRate: number;
  noCoop: number;
  noReg: number;
  perTag: ScreeningTagCount[];
  byDay: ScreeningDayCount[];
}

export interface ScreeningListFilters {
  from?: string; // تاریخ به شکل YYYY-MM-DD
  to?: string;   // تاریخ به شکل YYYY-MM-DD
  q?: string;
  tags?: string[];
}

export interface ScreeningListResult {
  entries: ScreeningEntry[];
  stats: ScreeningStats;
}

export interface ScreeningRangeSummary {
  total: number;
  normal: number;
  referrals: number;
  noCoop: number;
  noReg: number;
}

export interface ScreeningEntryInput {
  name: string;
  tags: string[];
  day?: string;
  birth_date?: string | null;      // ۱.۲۵.۵۰ — اختیاری
  readiness_score?: number | null; // ۱.۲۵.۵۰ — اختیاری
  note?: string | null;            // ۱.۲۵.۵۷ — اختیاری
}

export interface ScreeningEntryPatch {
  name?: string;
  tags?: string[];
  birth_date?: string | null;      // ۱.۲۵.۵۰ — اختیاری؛ null = پاک‌کردن
  readiness_score?: number | null; // ۱.۲۵.۵۰ — اختیاری؛ null = پاک‌کردن
  note?: string | null;            // ۱.۲۵.۵۷ — اختیاری؛ null = پاک‌کردن
}

export interface ScreeningService {
  list(filters: ScreeningListFilters): Promise<ScreeningListResult>;
  tagsSummary(): Promise<ScreeningTagCount[]>;
  dayCounts(from: string, to: string): Promise<ScreeningDayCount[]>;
  rangeSummary(from: string, to: string): Promise<ScreeningRangeSummary>;
  create(input: ScreeningEntryInput, actor: ScreeningActor): Promise<ScreeningEntry>;
  update(id: string, input: ScreeningEntryPatch, actor: ScreeningActor): Promise<ScreeningEntry>;
  remove(id: string, actor: ScreeningActor): Promise<void>;
}

export interface ScreeningActor {
  staffId: string;
  displayName: string;
  role: string;
}

/* ─── نتیجهٔ ارزیابی تخصصی «اظهارنظر و پیشنهاد» (v1.27.33 — INTAKE-DESIGN §۳.۵) ───
 * هفت گزینهٔ استاندارد فرم آموزش‌وپرورش استثنایی — عین متن کارفرما؛ UI کارت‌ها را از همین
 * ثابت می‌سازد تا متن در کد و دیتابیس تکرار نشود. انتخاب یکی برای ثبت الزامی است؛
 * ارجاع اتیسم کاملاً مستقل است و با هر گزینه‌ای هم‌زمان می‌شود. */
export const IQ_RESULT_OPTIONS = [
  { option: 1, title: 'گروه عادی (همسن)', text: 'آزمودنی در گروه عادی (همسن) قرار دارد و به مدرسه عادی معرفی می‌گردد.' },
  { option: 2, title: 'گروه دیرآموز (مرزی)', text: 'آزمودنی در گروه دیرآموز (مرزی) قرار دارد و ثبت‌نام نامبرده در سال تحصیلی جاری در مدرسه عادی بلامانع است.' },
  { option: 3, title: 'نارسایی هوشی خفیف (آموزش‌پذیر)', text: 'آزمودنی دارای نارسایی هوشی خفیف (آموزش‌پذیر) بوده و به مدرسه استثنایی معرفی می‌گردد.' },
  { option: 4, title: 'نارسایی هوشی متوسط (آزمایشی)', text: 'آزمودنی دارای نارسایی هوشی متوسط (آزمایشی) بوده و به مدت یک سال به مدرسه استثنایی معرفی می‌گردد؛ در صورت عدم ارتقاء در پایان سال تحصیلی جهت ارزیابی مجدد مراجعه نماید.' },
  { option: 5, title: 'نارسایی هوشی با معرفی به کلاس گروه سنی ۴ تا ۵/۹ سال', text: 'آزمودنی نارسایی هوشی دارد و جهت ثبت‌نام در کلاس گروه سنی (۴-۵/۹) سال مدارس استثنایی معرفی می‌گردد؛ ضروری است در پایان سال تحصیلی ارزیابی مجدد گردد.' },
  { option: 6, title: 'عدم آمادگی برای ورود به مدرسه استثنایی', text: 'آزمودنی در حال حاضر آمادگی لازم برای ورود به مدرسه استثنایی را ندارد؛ لذا به مراکز توانبخشی بهزیستی معرفی می‌گردد، ضروری است در پایان سال تحصیلی ارزیابی مجدد گردد.' },
  { option: 7, title: 'نارسایی هوشی شدید تا عمیق', text: 'آزمودنی دارای نارسایی هوشی شدید تا عمیق است و جهت استفاده از خدمات آموزشی و توانبخشی به سازمان بهزیستی معرفی می‌گردد.' }
] as const;

export interface IqEvaluation {
  id: string;
  screeningEntryId: string;
  resultOption: number;
  autismReferral: boolean;
  leiterScore: number | null;
  wechslerVerbalScore: number | null;
  goodenoughScore: number | null;
  clinicalObservations: string | null;
  academicYear: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/* ورودی ثبت نتیجه — ثبتِ کل‌جایگزین است (ویرایش همیشه با بارگذاری مقادیر قبلی شروع می‌شود)؛
 * نمرهٔ خالی/undefined = null؛ هیچ تفسیر یا سقف علمی روی نمرات اعمال نمی‌شود. */
export interface IqEvaluationInput {
  result_option: number;
  autism_referral?: boolean;
  leiter_score?: number | null;
  wechsler_verbal_score?: number | null;
  goodenough_score?: number | null;
  clinical_observations?: string | null;
}
