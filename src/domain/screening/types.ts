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
