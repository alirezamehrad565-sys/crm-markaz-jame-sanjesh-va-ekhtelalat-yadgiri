// stages.ts — نظام مرحله‌ها و ستاره‌ها (۱.۲۵.۲۲) — موتور خالص، بدون DB/UI
// ادامهٔ دفترچهٔ وظیفه: «سازگاری» فاز ۶ پنجرهٔ پاسخ را می‌تنانید؛ این لایه
// «مسیر پیشرفت» را می‌سازد — پنج مرحلهٔ تمرین با سختی پله‌ای، ستارهٔ ۱–۳
// برای هر مرحله و گذار قفل‌گشایی‌شده بر پایهٔ جلسه‌های معتبر.
// مقادیر per-kind (فهرست مرحله‌ها/آستانه‌ها/اهرم‌ها/ملاک گذار) تک‌منبعشان رجیستری
// نوع-محور registry.ts است (G4الف — رفع P3-4)؛ این فایل ماشین عمومی مرحله‌هاست و
// نمادهای نوع‌محور را برای سازگاری فراخوانی‌های موجود دوباره صادر می‌کند.
//
// قواعد ثابت (مثل فاز ۶ — هر تغییر عددی = بامپ STAGE_RULES_VERSION):
//   · فقط حالت تمرین — ارزیابی هرگز مرحله نمی‌بیند (C1: دستورالعمل ثابت)
//   · گذار هرگز بر یک جلسهٔ نامعتبر ساخته نمی‌شود — فقط validity='valid'
//   · ستارهٔ هر مرحله = بهترین ستارهٔ تاریخچه (پسرفت ستاره را پاک نمی‌کند)
//   · کلید خاموشی درمانگر (stages_enabled=false) همهٔ نظام را خاموش می‌کند
//   · هیچ برچسب/نتیجهٔ بالینی — «مرحله» روایت بازی است، نه سنجهٔ تشخیصی

import type { AgeBandId } from './protocol';
import { kindEntryOf } from './registry';
import type { GameKind, StageOutcomeSummary } from './registry';

// نمادهای نوع‌محور — تک‌منبعشان رجیستری است؛ این‌جا فقط دوباره صادر می‌شوند
export { gameKindOf } from './registry';
export {
  STAGE_THRESHOLDS,
  NUMLINE_STAGE_THRESHOLDS,
  SCAN_STAGE_THRESHOLDS,
  ACCURACY_STAGE_THRESHOLDS,
  NBACK_STAGE_THRESHOLDS,
  stageOutcomeOf,
  stageOutcomeNumline,
  stageOutcomeScan,
  stageOutcomeAccuracyKind,
  stageOutcomeNback,
  NUMLINE_STAGE_MAX,
  numlineItemInStage,
  SCAN_STAGE_MAX_TILES,
  scanItemInStage,
  SCAN_STAGE_WAVE_MS,
  scanStageWaveMs,
  STROOP_STAGE_BANDS,
  stroopItemInStage,
  FLANKER_STAGE_MAX_DECOYS,
  FLANKER_STAGE_BANDS,
  flankerItemInStage,
  TRAIL_STAGE_MAX_NODES,
  TRAIL_STAGE_BANDS,
  trailItemInStage,
  NBACK_STAGE_LEVELS,
  nbackItemInStage
} from './registry';
export type { GameKind } from './registry';

/** نسخهٔ قواعد مرحله‌ها — هر تغییر عددی در این فایل باید این نسخه را بامپ کند.
 *  ۱.۱.۰ (۱.۲۵.۲۸): قواعد خط عددی («جادهٔ عددها») افزوده شد — عددهای گو/نوگو دست‌نخورده.
 *  ۱.۲.۰ (۱.۲۵.۳۰): قواعد «حملهٔ جاسوس‌ها» (scan) افزوده شد — دو قاعدهٔ قبلی عیناً.
 *  ۱.۳.۰ (۱.۲۵.۳۲): قواعد سه بازی تازه (stroop/flanker/trail) افزوده شد + اهرم تندشدن موج
 *  اسکن (SCAN_STAGE_WAVE_MS — فقط نمایش، نه محرک) — سه قاعدهٔ قبلی عیناً.
 *  ۱.۴.۰ (۱.۲۵.۴۰): قواعد «آلبوم خرچنگ» (nback) افزوده شد — پرش n (۱→۲) + ISI مرحله؛
 *  شش قاعدهٔ قبلی عیناً. */
export const STAGE_RULES_VERSION = '1.4.0';

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

export interface StageOutcome {
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  thresholds: StageThresholds;
}

/** فهرست مرحله‌های هر نوع‌بازی — از رجیستری نوع-محور؛ شناسه‌های s1..s5 در همهٔ نوع‌ها هم‌شکل‌اند */
function stageListOf(kind: GameKind, band: AgeBandId): StageDef[] {
  return kindEntryOf(kind).stageList(band);
}

/** مرحله از جایگاه یک‌مبنا — باند سنی و نوع‌بازی جدی گرفته می‌شود */
export function stageByIndex(band: AgeBandId, index: number, kind: GameKind = 'gonogo'): StageDef | null {
  const list = stageListOf(kind, band);
  return list.find((s) => s.index === index) ?? null;
}

/** مرحله از شناسهٔ ذخیره‌شده در جلسه — شناسهٔ ناشناخته = null (جلسه بی‌مرحله می‌ماند) */
export function stageById(band: AgeBandId, id: string | null | undefined, kind: GameKind = 'gonogo'): StageDef | null {
  if (!id || typeof id !== 'string') return null;
  const list = stageListOf(kind, band);
  return list.find((s) => s.id === id) ?? null;
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

/** نتیجهٔ مرحله از نوع‌بازی — lookup یک‌خطی از رجیستری؛ هر نوع‌بازی ملاک خودش را دارد
 *  و قواعد هرگز مخلوط نمی‌شوند (رفتار عین زنجیرهٔ سه‌تایی قبلی است) */
export function stageOutcomeFor(
  kind: GameKind,
  summary: StageOutcomeSummary
): StageOutcome {
  return kindEntryOf(kind).stageOutcome(summary);
}

// ─── پیشرفت مسیر از تاریخچهٔ جلسه‌ها ───

/** سطر تاریخچهٔ مرحله — از جلسه‌های تجویز (قدیمی→جدید) */
export interface StageHistoryRow {
  stage_id: string | null;
  validity: string | null;
  correct_go_pct: number | null;
  correct_nogo_pct: number | null;
  /** دقت جلسه (۱.۲۵.۲۸) — ملاک خط عددی؛ گونوگو هم همیشه پر است (از خلاصهٔ محاسبه‌شده) */
  accuracy?: number | null;
  /** میانگین خطای جای عدد — فقط خط عددی معنا دارد */
  numline_error_pct?: number | null;
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
 * پیشرفت مسیر از تاریخچهٔ جلسه‌ها (قدیمی→جدید) — مسیر نوع‌بازی‌آگاه:
 *   · فقط جلسه‌های valid گذار می‌سازند و ستاره ثبت می‌کنند
 *   · مرحلهٔ ۱ همیشه باز است؛ مرحلهٔ i وقتی باز می‌شود که i−1 گذار شده باشد
 *   · بهترین ستارهٔ هر مرحله حفظ می‌شود — تجربهٔ بدتر، ستارهٔ قبلی را نمی‌گیرد
 *   · ملاک گذار از نوع‌بازی می‌آید — گونوگو: گو/نوگو؛ خط عددی: دقت جای عدد
 */
export function stageProgressOfKind(kind: GameKind, history: StageHistoryRow[]): StageProgress {
  const best: Record<string, { stars: number; passed: boolean }> = {};
  let unlocked = 1;
  for (const row of history) {
    if (!row || row.validity !== 'valid' || !row.stage_id) continue;
    const stage = stageById('7-12', row.stage_id) ?? stageById('4-6', row.stage_id);
    if (!stage) continue;
    const outcome = stageOutcomeFor(kind, {
      pct: {
        correct_go: row.correct_go_pct,
        correct_nogo: row.correct_nogo_pct,
        accuracy: row.accuracy ?? null
      }
    });
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

/** پیشرفت مسیر گونوگو — همان قرارداد قبلی (سازگاری کامل با فراخوانی‌های موجود) */
export function stageProgressOf(history: StageHistoryRow[]): StageProgress {
  return stageProgressOfKind('gonogo', history);
}

/** مرحلهٔ فعال کودک — بالاترین مرحلهٔ قفل‌گشایی‌شده؛ عنوان‌ها از نوع‌بازی می‌آیند */
export function currentStageOf(progress: StageProgress, band: AgeBandId, kind: GameKind = 'gonogo'): StageDef | null {
  return stageByIndex(band, progress.unlocked_index, kind);
}

// ─── درون‌مایهٔ دیداری مرحله‌ها (۱.۲۵.۲۳) — فقط نمایش؛ هیچ کلیدی این‌جا نیست ───
// نظام مرحله‌ها (۱.۲۵.۲۲) عمداً پارامتر زمان‌بندی را بازنویسی می‌کند و محرک را دست
// نمی‌زند؛ نتیجه: همهٔ مرحله‌ها از نظر دیداری یکسان‌اند و «مرحلهٔ تازه» کودک دیده نمی‌شود.
// این لایه همان خلأ را پر می‌کند: هر مرحله یک جفت امضای دیداری دارد — بدون هیچ
// اثری بر نمره‌دهی (آیتم authored می‌ماند) و بدون افشای کلید (correct_touch هرگز
// به کلاینت نمی‌رود). قاعدهٔ رنگ ثابت می‌ماند: گو گرم · نوگو سرد — یادگیری
// بین‌مرحله‌ها به‌هم نمی‌ریزد؛ قدم آموزش («این را لمس کن: ماهی نارنجی») همیشه
// با همین امضا هم‌خوان است.

export interface StageVisualStim {
  shape: string;
  color: string;
  /** نمای باز — امضا روی هر stim authored می‌نشیند و بقیهٔ فیلدهایش حفظ می‌شوند */
  [k: string]: unknown;
}

export interface StageVisual {
  go: StageVisualStim;
  nogo: StageVisualStim;
}

/** امضای دیداری پنج مرحله — شناسه‌ها با StageDef.id هم‌خوان‌اند */
export const STAGE_VISUALS: Record<string, StageVisual> = {
  s1: { go: { shape: 'fish', color: 'orange' }, nogo: { shape: 'crab', color: 'blue' } },      // گرم‌کردن — دریا
  s2: { go: { shape: 'flower', color: 'red' }, nogo: { shape: 'butterfly', color: 'purple' } }, // تمرین — باغ
  s3: { go: { shape: 'balloon', color: 'yellow' }, nogo: { shape: 'cloud', color: 'blue' } },  // تندتر — آسمان
  s4: { go: { shape: 'rocket', color: 'orange' }, nogo: { shape: 'ufo', color: 'purple' } },   // دقت — فضا
  s5: { go: { shape: 'star', color: 'yellow' }, nogo: { shape: 'square', color: 'blue' } }     // قهرمان — جفت کلاسیک آموزش
};

/** امضای دیداری مرحله — شناسهٔ ناشناخته/بی‌مرحله = null (محرک authored عیناً) */
export function stageVisualFor(stageId: string | null | undefined): StageVisual | null {
  if (typeof stageId !== 'string' || stageId === '') return null;
  return STAGE_VISUALS[stageId] ?? null;
}

/**
 * نمای محرک آیتم لمسی با امضای مرحله — فقط نمایش؛ همیشه کلید stim authored را
 * نگه می‌دارد و شکل/رنگ مرحله را رویش می‌نشیاند (بقیهٔ فیلدها دست‌نخورده).
 * نمره‌دهی سرور روی آیتم authored است — این خروجی هرگز به scoreAttempt نمی‌رود.
 */
export function stageStimViewOf(
  stim: Record<string, unknown> | null | undefined,
  correctTouch: boolean,
  stageId: string | null | undefined
): Record<string, unknown> {
  const v = stageVisualFor(stageId);
  const base = (stim ?? {}) as Record<string, unknown>;
  if (!v) return { ...base };
  return { ...base, ...(correctTouch ? v.go : v.nogo) };
}
