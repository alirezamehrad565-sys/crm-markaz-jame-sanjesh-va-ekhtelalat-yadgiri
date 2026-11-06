// stages.ts — نظام مرحله‌ها و ستاره‌ها (۱.۲۵.۲۲) — موتور خالص، بدون DB/UI
// ادامهٔ دفترچهٔ وظیفه: «سازگاری» فاز ۶ پنجرهٔ پاسخ را می‌تنانید؛ این لایه
// «مسیر پیشرفت» را می‌سازد — پنج مرحلهٔ تمرین با سختی پله‌ای، ستارهٔ ۱–۳
// برای هر مرحله و گذار قفل‌گشایی‌شده بر پایهٔ جلسه‌های معتبر.
//
// قواعد ثابت (مثل فاز ۶ — هر تغییر عددی = بامپ STAGE_RULES_VERSION):
//   · فقط حالت تمرین — ارزیابی هرگز مرحله نمی‌بیند (C1: دستورالعمل ثابت)
//   · گذار هرگز بر یک جلسهٔ نامعتبر ساخته نمی‌شود — فقط validity='valid'
//   · ستارهٔ هر مرحله = بهترین ستارهٔ تاریخچه (پسرفت ستاره را پاک نمی‌کند)
//   · کلید خاموشی درمانگر (stages_enabled=false) همهٔ نظام را خاموش می‌کند
//   · هیچ برچسب/نتیجهٔ بالینی — «مرحله» روایت بازی است، نه سنجهٔ تشخیصی

import type { AgeBandId } from './protocol';

/** نسخهٔ قواعد مرحله‌ها — هر تغییر عددی در این فایل باید این نسخه را بامپ کند */
export const STAGE_RULES_VERSION = '1.0.0';

/** تعداد مرحله‌های مسیر تمرین */
export const STAGE_TOTAL = 5;

/** کلیدهای پروتکل که مرحله حق بازنویسی‌شان را دارد — بیرون این فهرست ممنوع */
export const STAGE_OVERRIDE_KEYS = [
  'response_window_go_ms',
  'response_window_nogo_ms',
  'isi_min_ms',
  'isi_max_ms',
  'fixation_ms'
] as const;

export type StageOverrideKey = (typeof STAGE_OVERRIDE_KEYS)[number];

export interface StageDef {
  /** شناسهٔ پایدار مرحله ('s1'..'s5') — در game_sessions.stage_id می‌نشیند */
  id: string;
  /** جایگاه یک‌مبنا ۱..۵ */
  index: number;
  title_fa: string;
  /** هدف کوتاه روبه‌کودک — لحن §۲: بی‌رقارت، بدون فشار */
  goal_fa: string;
  /** پلهٔ سختی ۱..۵ — برای نمایش و مرتب‌سازی */
  difficulty: number;
  /** بازنویسی پارامترهای پروتکل برای این مرحله — مقدار مطلق، در کران‌های پروتکل */
  overrides: Partial<Record<StageOverrideKey, number>>;
}

/** آستانه‌های گذار و ستاره — درصد، برای همهٔ باندهای سنی (وضعیت: proposed تا پیلوت مرکز) */
export interface StageThresholds {
  pass: { go_pct: number; nogo_pct: number };
  star2: { go_pct: number; nogo_pct: number };
  star3: { go_pct: number; nogo_pct: number };
}

export const STAGE_THRESHOLDS: StageThresholds = {
  pass: { go_pct: 70, nogo_pct: 60 },
  star2: { go_pct: 80, nogo_pct: 75 },
  star3: { go_pct: 90, nogo_pct: 85 }
};

// ─── پنج مرحلهٔ مسیر تمرین — پارامترها بر پایهٔ باند سنی (۴–۶ نرم‌تر از ۷–۱۲) ───

const STAGES_4_6: StageDef[] = [
  {
    id: 's1', index: 1, title_fa: 'گرم‌کردن', goal_fa: 'با ستاره‌ها دوست شو؛ آهسته و خوش‌حال.', difficulty: 1,
    overrides: { response_window_go_ms: 2400, response_window_nogo_ms: 2400, isi_min_ms: 1200, isi_max_ms: 1800, fixation_ms: 400 }
  },
  {
    id: 's2', index: 2, title_fa: 'تمرین', goal_fa: 'همان‌طور که یاد گرفتی ادامه بده.', difficulty: 2,
    overrides: {} // پارامترهای پایهٔ پروتکل — بدون بازنویسی
  },
  {
    id: 's3', index: 3, title_fa: 'تندتر', goal_fa: 'حالا کمی تندتر می‌شود؛ حواست کنار نباشه.', difficulty: 3,
    overrides: { response_window_go_ms: 1800, response_window_nogo_ms: 1800, isi_min_ms: 900, isi_max_ms: 1350, fixation_ms: 400 }
  },
  {
    id: 's4', index: 4, title_fa: 'دقت', goal_fa: 'چشم‌هایت تیز است؛ فقط وقتی مطمئنی لمس کن.', difficulty: 4,
    overrides: { response_window_go_ms: 1600, response_window_nogo_ms: 1600, isi_min_ms: 850, isi_max_ms: 1250, fixation_ms: 350 }
  },
  {
    id: 's5', index: 5, title_fa: 'قهرمان', goal_fa: 'سریع‌ترین مرحله! تو آماده‌ای.', difficulty: 5,
    overrides: { response_window_go_ms: 1400, response_window_nogo_ms: 1400, isi_min_ms: 800, isi_max_ms: 1200, fixation_ms: 350 }
  }
];

const STAGES_7_12: StageDef[] = [
  {
    id: 's1', index: 1, title_fa: 'گرم‌کردن', goal_fa: 'با ستاره‌ها دوست شو؛ آهسته و خوش‌حال.', difficulty: 1,
    overrides: { response_window_go_ms: 1900, response_window_nogo_ms: 1900, isi_min_ms: 1000, isi_max_ms: 1400, fixation_ms: 400 }
  },
  {
    id: 's2', index: 2, title_fa: 'تمرین', goal_fa: 'همان‌طور که یاد گرفتی ادامه بده.', difficulty: 2,
    overrides: {}
  },
  {
    id: 's3', index: 3, title_fa: 'تندتر', goal_fa: 'حالا کمی تندتر می‌شود؛ حواست کنار نباشه.', difficulty: 3,
    overrides: { response_window_go_ms: 1300, response_window_nogo_ms: 1300, isi_min_ms: 700, isi_max_ms: 1050, fixation_ms: 400 }
  },
  {
    id: 's4', index: 4, title_fa: 'دقت', goal_fa: 'چشم‌هایت تیز است؛ فقط وقتی مطمئنی لمس کن.', difficulty: 4,
    overrides: { response_window_go_ms: 1150, response_window_nogo_ms: 1150, isi_min_ms: 650, isi_max_ms: 1000, fixation_ms: 350 }
  },
  {
    id: 's5', index: 5, title_fa: 'قهرمان', goal_fa: 'سریع‌ترین مرحله! تو آماده‌ای.', difficulty: 5,
    overrides: { response_window_go_ms: 1000, response_window_nogo_ms: 1000, isi_min_ms: 600, isi_max_ms: 900, fixation_ms: 350 }
  }
];

const STAGES: Record<AgeBandId, StageDef[]> = { '4-6': STAGES_4_6, '7-12': STAGES_7_12 };

/** مرحله از جایگاه یک‌مبنا — باند سنی جدی گرفته می‌شود */
export function stageByIndex(band: AgeBandId, index: number): StageDef | null {
  const list = STAGES[band] ?? STAGES['7-12'];
  return list.find((s) => s.index === index) ?? null;
}

/** مرحله از شناسهٔ ذخیره‌شده در جلسه — شناسهٔ ناشناخته = null (جلسه بی‌مرحله می‌ماند) */
export function stageById(band: AgeBandId, id: string | null | undefined): StageDef | null {
  if (!id || typeof id !== 'string') return null;
  return STAGES[band]?.find((s) => s.id === id) ?? null;
}

/** بازنویسی پارامترهای پروتکل با تنظیمات مرحله — فقط کلیدهای مجاز؛ بقیه دست‌نخورده */
export function applyStageOverrides(
  params: Record<string, number>,
  stage: StageDef | null
): Record<string, number> {
  const out = { ...params };
  if (!stage) return out;
  for (const key of STAGE_OVERRIDE_KEYS) {
    const v = stage.overrides[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[key] = v;
  }
  return out;
}

// ─── نتیجهٔ مرحله و ستاره‌ها ───

export interface StageOutcome {
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  thresholds: StageThresholds;
}

function pctOk(v: number | null | undefined, min: number): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= min;
}

/**
 * نتیجهٔ مرحله از درصدی‌های خلاصهٔ جلسه — ستاره ۳ بالاترین؛ هرگز نزولی نمی‌شود
 * (بهترین ستاره در progress نگه داشته می‌شود، این تابع فقط جلسهٔ جاری است).
 * جلسهٔ بدون دادهٔ کامل (pct تهی) = ۰ ستاره و عدم گذار.
 */
export function stageOutcomeOf(
  correctGoPct: number | null | undefined,
  correctNogoPct: number | null | undefined
): StageOutcome {
  const t = STAGE_THRESHOLDS;
  if (!pctOk(correctGoPct, t.pass.go_pct) || !pctOk(correctNogoPct, t.pass.nogo_pct)) {
    return { passed: false, stars: 0, thresholds: t };
  }
  const three = pctOk(correctGoPct, t.star3.go_pct) && pctOk(correctNogoPct, t.star3.nogo_pct);
  const two = pctOk(correctGoPct, t.star2.go_pct) && pctOk(correctNogoPct, t.star2.nogo_pct);
  return { passed: true, stars: three ? 3 : two ? 2 : 1, thresholds: t };
}

// ─── پیشرفت مسیر از تاریخچهٔ جلسه‌ها ───

/** سطر تاریخچهٔ مرحله — از جلسه‌های تجویز (قدیمی→جدید) */
export interface StageHistoryRow {
  stage_id: string | null;
  validity: string | null;
  correct_go_pct: number | null;
  correct_nogo_pct: number | null;
}

export interface StageProgress {
  /** بالاترین مرحلهٔ قفل‌گشایی‌شده (۱..۵) — جلسهٔ بعد همین را می‌بیند */
  unlocked_index: number;
  /** بهترین ستارهٔ هر مرحلهٔ تاریخچه — کلید = شناسهٔ مرحله */
  best: Record<string, { stars: number; passed: boolean }>;
  /** مجموع ستاره‌های جمع‌شدهٔ مسیر */
  stars_total: number;
}

/**
 * پیشرفت مسیر از تاریخچهٔ جلسه‌ها (قدیمی→جدید):
 *   · فقط جلسه‌های valid گذار می‌سازند و ستاره ثبت می‌کنند
 *   · مرحلهٔ ۱ همیشه باز است؛ مرحلهٔ i وقتی باز می‌شود که i−1 گذار شده باشد
 *   · بهترین ستارهٔ هر مرحله حفظ می‌شود — تجربهٔ بدتر، ستارهٔ قبلی را نمی‌گیرد
 */
export function stageProgressOf(history: StageHistoryRow[]): StageProgress {
  const best: Record<string, { stars: number; passed: boolean }> = {};
  let unlocked = 1;
  for (const row of history) {
    if (!row || row.validity !== 'valid' || !row.stage_id) continue;
    const stage = stageById('7-12', row.stage_id) ?? stageById('4-6', row.stage_id);
    if (!stage) continue;
    const outcome = stageOutcomeOf(row.correct_go_pct, row.correct_nogo_pct);
    // جلسهٔ زیر آستانهٔ گذار (۰ ستاره) در «بهترین‌ها» ثبت نمی‌شود — best فقط دستاوردهاست
    if (outcome.stars === 0) continue;
    const prev = best[stage.id];
    if (!prev || outcome.stars > prev.stars) {
      best[stage.id] = { stars: outcome.stars, passed: prev?.passed || outcome.passed };
    } else if (outcome.passed) {
      best[stage.id] = { ...prev, passed: true };
    }
    if (outcome.passed && stage.index + 1 > unlocked && stage.index + 1 <= STAGE_TOTAL) {
      unlocked = stage.index + 1;
    }
  }
  const starsTotal = Object.values(best).reduce((sum, b) => sum + b.stars, 0);
  return { unlocked_index: unlocked, best, stars_total: starsTotal };
}

/** مرحلهٔ فعال کودک — بالاترین مرحلهٔ قفل‌گشایی‌شده */
export function currentStageOf(progress: StageProgress, band: AgeBandId): StageDef | null {
  return stageByIndex(band, progress.unlocked_index);
}
