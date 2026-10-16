/**
 * موتور چک‌لیست کاردرمانی (OT) — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// موتور چک‌لیست ۷ حیطه‌ای کاردرمانی ذهنی + گیت‌های فاز شناسایی
// حیطه‌ها و وضعیت‌ها enum در کد (بدون CHECK در SQL — الگوی D7)

import type { StudentProtocol } from '@core/shared';

/** کلیدهای هفت حیطه چک‌لیست — ترتیب نمایشی هم همین است */
export const OT_DOMAINS = ['gross', 'fine', 'visual', 'auditory', 'cognitive', 'adl', 'social'] as const;

export type OtDomain = (typeof OT_DOMAINS)[number];

export const OT_DOMAIN_LABELS: Record<OtDomain, string> = {
  gross: 'حرکات درشت',
  fine: 'حرکات ظریف',
  visual: 'ادراک دیداری',
  auditory: 'ادراک شنیداری',
  cognitive: 'توجه و مهارت‌های ذهنی',
  adl: 'خودیاری و زندگی روزمره',
  social: 'مهارت‌های اجتماعی-هیجانی و بازی'
};

/** وضعیت هر مهارت — درمانگر حین مداخله ثبت می‌کند */
export const OT_SKILL_STATUSES = ['mastered', 'with_help', 'not_yet'] as const;

export type OtSkillStatus = (typeof OT_SKILL_STATUSES)[number];

export const OT_SKILL_STATUS_LABELS: Record<OtSkillStatus, string> = {
  mastered: 'بلد است',
  with_help: 'با کمک',
  not_yet: 'هنوز نه'
};

/**
 * سطح راهنما برای وضعیت «با کمک»:
 * سلسله‌مراتب استاندارد کمترترین کمک تا بیشترین — ثبت سطح کمک، سنجش استقلال واقعی را ممکن می‌کند.
 */
export const OT_PROMPT_LEVELS = ['verbal', 'gestural', 'partial_physical', 'full_physical'] as const;

export type OtPromptLevel = (typeof OT_PROMPT_LEVELS)[number];

export const OT_PROMPT_LEVEL_LABELS: Record<OtPromptLevel, string> = {
  verbal: 'راهنمای کلامی',
  gestural: 'ژستی / الگودهی',
  partial_physical: 'لمسی جزئی',
  full_physical: 'راهنمای فیزیکی کامل'
};

/** پنجرهٔ تازگی ورودی‌های شناسایی — داوری روانشناسی P0-4 */
export const OT_GATE_FRESH_MONTHS = 12;

export interface OtSkillRow {
  id: string;
  domain: string;
  ord: number;
  title: string;
  criterion: string;
  /** بازهٔ سنی موردانتظار (مرجع رشدی) — null = ردیف قدیمی */
  expectedAge: string | null;
  /** گروه سازه — مهارت‌های هم‌سازه (مثلاً دکمه در ظریف و خودیاری) — null = مستقل */
  skillGroup: string | null;
  /** فقط مهارت‌های primary در شمارش پیشرفت/پیمایش می‌آیند */
  isPrimary: boolean;
}

/** وضعیت فعلی یک مهارت برای یک دانش‌آموز (مشتق از آخرین ردیف ot_progress) */
export interface OtSkillState {
  skillId: string;
  ord: number;
  title: string;
  criterion: string;
  /** آخرین وضعیت ثبت‌شده — null = هنوز نمره نخورده */
  status: OtSkillStatus | null;
  /** اولین وضعیت ثبت‌شده — برای دیدن مسیر «هنوز نه ← با کمک ← بلد» */
  firstStatus: OtSkillStatus | null;
  /** تسلط تأییدشده = دو جلسهٔ متوالی «بلد است» */
  masteryConfirmed: boolean;
  /** آخرین سطح راهنمای ثبت‌شده برای «با کمک» */
  promptLevel: OtPromptLevel | null;
  expectedAge: string | null;
  skillGroup: string | null;
  isPrimary: boolean;
  latestAt: string | null;
  latestNote: string | null;
  /** چند جلسهٔ متمایز روی این مهارت کار شده */
  sessions: number;
}

export interface OtDomainProgress {
  key: OtDomain;
  title: string;
  skills: OtSkillState[];
  /** نقطهٔ ادامهٔ حیطه = اولین مهارتِ primary که تسلط دوجلسه‌ای ندارد — null = حیطه کامل */
  resumeSkillId: string | null;
  /** تسلط تأییدشده (دوجلسه‌ای) */
  mastered: number;
  /** «بلد است» تک‌جلسه‌ای — منتظر تأیید جلسهٔ دوم */
  masteredPending: number;
  withHelp: number;
  notYet: number;
  /** نمره‌گرفته‌های primary (مبنای پیمایش) */
  scored: number;
  /** شمار مهارت‌های primary حیطه (مبنای درصد پیشرفت) */
  total: number;
  /** همهٔ ردیف‌ها شامل مکمل‌ها — برای نمایش کامل فهرست */
  totalAll: number;
}

export interface OtProfile {
  domains: OtDomainProgress[];
  totals: {
    scored: number;
    total: number;
    mastered: number;
    /** «بلد است» تک‌جلسه‌ای در انتظار تأیید */
    masteredPending: number;
    withHelp: number;
    notYet: number;
    /** شمار مهارت‌های مکمل (غیر primary) — برای نمایش */
    secondarySkills: number;
    /** شمار جلسات متمایز ثبت‌شده (session_id یکتا) */
    sessions: number;
    lastSessionAt: string | null;
  };
}

/** یک گیت فاز شناسایی — ورودی‌های مشترک همهٔ مسیرها */
export interface IdentificationGate {
  key: 'anamnesis' | 'behavioral' | 'wechsler' | 'skills' | 'needs';
  label: string;
  hint: string;
  done: boolean;
  detail: string;
}

export interface GatesOutput {
  phase: 'identification' | 'intervention';
  protocol: StudentProtocol | null;
  gates: IdentificationGate[];
  otCoverage: {
    scored: number;
    total: number;
    domainsCovered: number;
    /** حیطه‌هایی با حداقل ۳ مهارت نمره‌گرفته */
    domainsMin3: number;
    domainTitles: string[];
  };
  /** پیشنهاد پیش‌فرض نیاز→پروتکل (فقط پیشنهاد — تصمیم با درمانگر) */
  protocolSuggestions: Record<string, { protocol: StudentProtocol; secondary: StudentProtocol | null } | null>;
}

export interface OtSessionSaveInput {
  items: { skillId: string; status: OtSkillStatus; note?: string | null; promptLevel?: OtPromptLevel | null }[];
  focus?: string | null;
  summary?: string | null;
  homework?: string | null;
  appointmentId?: string | null;
}

export interface OtSessionSaveResult {
  sessionId: string;
  saved: number;
  /** مهارت‌هایی که با این جلسه تسلط دوجلسه‌ای‌شان تأیید شد */
  masteryConfirmed: number;
  summary: string;
}

export interface NeedsSummaryInput {
  needType: string;
  protocol: StudentProtocol;
  protocolSecondary?: StudentProtocol | null;
  evidence?: string | null;
  goals?: string | null;
  sessionPlan?: string | null;
}

export interface NeedsSummaryResult {
  protocol: StudentProtocol;
  needType: string;
  needTypeLabel: string;
  eventId: string;
}
