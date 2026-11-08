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
//
// G4الف (رفع P3-4): فهرست مرحله‌ها، آستانه‌ها، اهرم‌های بانک و سنجه‌های موتورمحور
// هر نوع‌بازی به رجیستری نوع-محور (registry.ts) منتقل شد — این فایل رفتار مرحله‌ها
// و ستاره‌ها را اجرا می‌کند و داده‌ها را با lookup یک‌خطی از نقشه می‌خواند؛
// خروجی همهٔ توابع عیناً پیشین است (بامپ نسخه/عدد در این جابه‌جایی صفر بود).

import { GAME_KINDS, type AccuracyStageRule, type GameKind } from './registry';
import type { AgeBandId } from './protocol';

// نام نوع و تجزیهٔ kind تک‌منبعشان رجیستری است — این‌جا برای سازگاری فراخوانی‌های موجود صادر می‌شود
export { GAME_KIND_IDS, gameKindOf } from './registry';
export type { GameKind } from './registry';

/** نسخهٔ قواعد مرحله‌ها — هر تغییر عددی در این فایل باید این نسخه را بامپ کند.
 *  ۱.۱.۰ (۱.۲۵.۲۸): قواعد خط عددی («جادهٔ عددها») افزوده شد — عددهای گو/نوگو دست‌خورده.
 *  ۱.۲.۰ (۱.۲۵.۳۰): قواعد «حملهٔ جاسوس‌ها» (scan) افزوده شد — دو قاعدهٔ قبلی عیناً.
 *  ۱.۳.۰ (۱.۲۵.۳۲): قواعد سه بازی تازه (stroop/flanker/trail) افزوده شد + اهرم تندشدن موج
 *  اسکن (SCAN_STAGE_WAVE_MS — فقط نمایش، نه محرک) — سه قاعدهٔ قبلی عیناً.
 *  ۱.۲۵.۳۹ (G4الف): جابه‌جایی به رجیستری نوع-محور — صفر تغییر عددی؛ نسخه عیناً.
 *  ۱.۴.۰ (۱.۲۵.۴۰): قواعد «آلبوم خرچنگ» (nback) افزوده شد — نردبان دو باند با پلهٔ n
 *  (s1/s2 سطح ۱، s3..s5 سطح ۲؛ overrides فقط ISI/تثبیت) — قواعد شش نوع پیشین عیناً. */
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

// آستانه‌ها از رجیستری می‌آیند — مقدارها عیناً ۷۰/۶۰ · ۸۰/۷۵ · ۹۰/۸۵ (۱.۲۵.۲۲)
const GONOGO_RULE = GAME_KINDS.gonogo.stage_rule;

export const STAGE_THRESHOLDS: StageThresholds = {
  pass: { go_pct: GONOGO_RULE.pass.go_pct.value, nogo_pct: GONOGO_RULE.pass.nogo_pct.value },
  star2: { go_pct: GONOGO_RULE.star2.go_pct.value, nogo_pct: GONOGO_RULE.star2.nogo_pct.value },
  star3: { go_pct: GONOGO_RULE.star3.go_pct.value, nogo_pct: GONOGO_RULE.star3.nogo_pct.value }
};

/** فهرست مرحله‌های هر نوع‌بازی — lookup از رجیستری؛ شناسه‌های s1..s5 در همهٔ نوع‌ها هم‌شکل‌اند */
function stageListOf(kind: GameKind, band: AgeBandId) {
  return GAME_KINDS[kind].stageList(band);
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

// ─── نوع‌بازی و مراحل خط عددی «جادهٔ عددها» (۱.۲۵.۲۸) ───
// اهرم سختی خط عددی پارامتر زمان‌بندی نیست — «گسترهٔ جاده» است: مرحلهٔ بعد جادهٔ بلندتر
// با آستانهٔ پذیرش سن‌محور خودش (tolerance authored روی آیتم‌ها). اهرم مرحله = انتخاب
// آیتم از بانک authored با پیش‌ماندهٔ numlineItemInStage — محرک authored هرگز بازنویسی نمی‌شود.

/** آستانه‌های گذار و ستارهٔ دقت‌محور از رجیستری — شکل تختِ مقدارها برای سازگاری فراخوانی */
function accuracyThresholdsOf(rule: AccuracyStageRule): { pass: number; star2: number; star3: number } {
  return { pass: rule.pass.value, star2: rule.star2.value, star3: rule.star3.value };
}

/** آستانه‌های گذار و ستارهٔ خط عددی — بر دقت جای عدد (درصد)؛ وضعیت proposed تا پیلوت مرکز */
export const NUMLINE_STAGE_THRESHOLDS = accuracyThresholdsOf(GAME_KINDS.numline.stage_rule);

/** نتیجهٔ مرحلهٔ دقت‌محور از دقت خلاصهٔ جلسه — بدنهٔ مشترک هر سه تابع؛ thresholds
 *  عیناً STAGE_THRESHOLDS می‌ماند (رفتار پیشین ۱.۲۵.۲۸ — هرگز تغییر نکرد). */
function accuracyOutcomeOf(rule: AccuracyStageRule, accuracy: number | null | undefined): StageOutcome {
  if (!pctOk(accuracy, rule.pass.value)) return { passed: false, stars: 0, thresholds: STAGE_THRESHOLDS };
  const stars: 1 | 2 | 3 = pctOk(accuracy, rule.star3.value) ? 3 : pctOk(accuracy, rule.star2.value) ? 2 : 1;
  return { passed: true, stars, thresholds: STAGE_THRESHOLDS };
}

/** نتیجهٔ مرحلهٔ خط عددی از دقت خلاصهٔ جلسه — همان قرارداد StageOutcome */
export function stageOutcomeNumline(accuracy: number | null | undefined): StageOutcome {
  return accuracyOutcomeOf(GAME_KINDS.numline.stage_rule, accuracy);
}

/** نتیجهٔ مرحله از نوع‌بازی — ملاک از رجیستری می‌آید؛ قواعد هرگز مخلوط نمی‌شوند */
export function stageOutcomeFor(
  kind: GameKind,
  summary: { pct: { correct_go: number | null; correct_nogo: number | null; accuracy: number | null } }
): StageOutcome {
  const rule = GAME_KINDS[kind].stage_rule;
  // دو شکل ملاک: جفت گو/نوگو (گونوگو) یا دقت خلاصهٔ جلسه (بقیه) — افزودن نوع تازه
  // بدون دست‌زدن به این تابع ممکن است؛ فقط ورودی نقشه را قاعده‌دار می‌کند
  return rule.shape === 'go_nogo'
    ? stageOutcomeOf(summary.pct.correct_go, summary.pct.correct_nogo)
    : accuracyOutcomeOf(rule, summary.pct.accuracy);
}

/** سقف گسترهٔ جاده در هر مرحلهٔ خط عددی — null = همهٔ جاده‌ها (مرحلهٔ پایانی مرور بزرگ) */
export const NUMLINE_STAGE_MAX: Record<string, number | null> = GAME_KINDS.numline.levers.bank_caps!;

/**
 * پیش‌ماندهٔ آیتم خط عددی در مرحله — فقط نمایش/انتخاب از بانک authored؛ نمره‌دهی سرور روی
 * آیتم authored است. بی‌مرحله/مرحلهٔ ناشناخته = همهٔ آیتم‌ها (سازگاری با جلسه‌های بی‌مرحله).
 */
export function numlineItemInStage(
  item: { range?: [number, number] | undefined },
  stageId: string | null | undefined
): boolean {
  return GAME_KINDS.numline.itemInStage(item, stageId);
}

// ─── مراحل «حملهٔ جاسوس‌ها» (۱.۲۵.۳۰) ───

/** آستانه‌های گذار و ستارهٔ اسکن — بر دقت موج‌ها (درصد)؛ وضعیت proposed تا پیلوت مرکز */
export const SCAN_STAGE_THRESHOLDS = accuracyThresholdsOf(GAME_KINDS.scan.stage_rule);

/** نتیجهٔ مرحلهٔ اسکن از دقت موج‌های خلاصهٔ جلسه — همان قرارداد StageOutcome */
export function stageOutcomeScan(accuracy: number | null | undefined): StageOutcome {
  return accuracyOutcomeOf(GAME_KINDS.scan.stage_rule, accuracy);
}

/** سقف شمار خانه‌های موج در هر مرحلهٔ اسکن — null = همهٔ موج‌ها (مرحلهٔ پایانی مرور بزرگ) */
export const SCAN_STAGE_MAX_TILES: Record<string, number | null> = GAME_KINDS.scan.levers.bank_caps!;

/**
 * پیش‌ماندهٔ آیتم اسکن در مرحله — انتخاب از بانک authored؛ نمره‌دهی سرور روی آیتم authored است.
 * بی‌مرحله/مرحلهٔ ناشناخته = همهٔ آیتم‌ها (سازگاری با جلسه‌های بی‌مرحله).
 */
export function scanItemInStage(
  item: { stim?: Record<string, unknown> | null | undefined },
  stageId: string | null | undefined
): boolean {
  return GAME_KINDS.scan.itemInStage(item, stageId);
}

// ─── مراحل سه بازی تازه (۱.۲۵.۳۲) — استروپ/فلانکر/رد پای دزد ───
// ملاک گذار هر سه = دقت خلاصهٔ جلسه (درصد) — همان قرارداد خط عددی/اسکن؛
// آستانه‌ها مشترک و proposed تا پیلوت مرکز. اهرم سختی authored روی بانک است؛
// «انتخاب بانک هر مرحله» در رجیستری است — محرک/کلید هرگز بازنویسی نمی‌شود.

/** آستانهٔ گذار و ستارهٔ سه نوع تازه — بر دقت (درصد)؛ وضعیت proposed تا پیلوت مرکز */
export const ACCURACY_STAGE_THRESHOLDS = accuracyThresholdsOf(GAME_KINDS.stroop.stage_rule);

/** نتیجهٔ مرحلهٔ سه نوع تازه از دقت خلاصهٔ جلسه — همان قرارداد StageOutcome */
export function stageOutcomeAccuracyKind(accuracy: number | null | undefined): StageOutcome {
  return accuracyOutcomeOf(GAME_KINDS.stroop.stage_rule, accuracy);
}

/** بانک مجاز هر مرحلهٔ استروپ — گروه‌های authored بانک (a=مرحلهٔ ۱ … d=مرحلهٔ ۴، p=پروب) */
export const STROOP_STAGE_BANDS: Record<string, string[] | null> = GAME_KINDS.stroop.levers.bank_bands!;

export function stroopItemInStage(
  item: { stim?: Record<string, unknown> | null | undefined },
  stageId: string | null | undefined
): boolean {
  return GAME_KINDS.stroop.itemInStage(item, stageId);
}

/** سقف شمار گرگ قلابی در هر مرحلهٔ فلانکر — null = همهٔ گله‌ها */
export const FLANKER_STAGE_MAX_DECOYS: Record<string, number | null> = GAME_KINDS.flanker.levers.bank_caps!;

/** بانک مجاز هر مرحلهٔ فلانکر — گروه‌های authored بانک؛ ناسالم = ساختاری (شمار قلابی‌ها) */
export const FLANKER_STAGE_BANDS: Record<string, string[] | null> = GAME_KINDS.flanker.levers.bank_bands!;

export function flankerItemInStage(
  item: { stim?: Record<string, unknown> | null | undefined },
  stageId: string | null | undefined
): boolean {
  return GAME_KINDS.flanker.itemInStage(item, stageId);
}

/** سقف شمار ردپاها در هر مرحلهٔ رد پای دزد — null = همهٔ ردها */
export const TRAIL_STAGE_MAX_NODES: Record<string, number | null> = GAME_KINDS.trail.levers.bank_caps!;

/** بانک مجاز هر مرحلهٔ رد — گروه‌های authored بانک؛ ناسالم = ساختاری (شمار ردپاها) */
export const TRAIL_STAGE_BANDS: Record<string, string[] | null> = GAME_KINDS.trail.levers.bank_bands!;

export function trailItemInStage(
  item: { stim?: Record<string, unknown> | null | undefined },
  stageId: string | null | undefined
): boolean {
  return GAME_KINDS.trail.itemInStage(item, stageId);
}

/**
 * پیش‌ماندهٔ آیتم در مرحله به‌قولِ رجیستری —lookup یک‌خطی به‌جای زنجیرهٔ if per-kind؛
 * مصرف‌کننده‌های service (nextItem/resume/finish) همه از همین می‌خوانند.
 * بی‌مرحله/مرحلهٔ ناشناخته = قاعدهٔ خود نوع (همهٔ آیتم‌ها برای گونوگو و سقف‌های null).
 */
export function itemInStageFor(
  kind: GameKind,
  item: { range?: [number, number] | undefined; stim?: Record<string, unknown> | null | undefined },
  stageId: string | null | undefined
): boolean {
  return GAME_KINDS[kind].itemInStage(item, stageId);
}

// ─── اهرم تندشدن موج اسکن (۱.۲۵.۳۲) — فقط نمایش؛ نه محرک و نه کلید ───
// موج authored زمان خودش را دارد؛ مرحلهٔ فعال سقف آرام‌تری می‌گذارد تا پله‌ها واقعاً
// «تندتر» حس شوند. جدول سقف‌ها اهرم نمایشی رجیستری است؛ قاعدهٔ ترکیب این‌جاست:
// زمان مرحله فقط اگر از آیتم authored کوتاه‌تر یا برابر باشد — هیچ‌گاه آیتم سریع‌تر
// از بانک نمی‌شود (کودک همیشه حداقلِ زمان authored را دارد).

/** پنجرهٔ نمایش موج (ms) در هر مرحلهٔ اسکن — null = دست‌نخوردهٔ آیتم */
export const SCAN_STAGE_WAVE_MS: Record<string, number | null> = GAME_KINDS.scan.levers.display!;

/**
 * پنجرهٔ موج مرحله برای نمای کلاینت — کمینهٔ زمان authored و سقف مرحله.
 * بی‌مرحله/مرحلهٔ ناشناخته = null (عیناً آیتم authored).
 */
export function scanStageWaveMs(
  itemWaveMs: number | null | undefined,
  stageId: string | null | undefined
): number | null {
  if (typeof stageId !== 'string' || !(stageId in SCAN_STAGE_WAVE_MS)) return null;
  const cap = SCAN_STAGE_WAVE_MS[stageId];
  if (typeof cap !== 'number' || cap <= 0) return null;
  if (typeof itemWaveMs !== 'number' || !Number.isFinite(itemWaveMs) || itemWaveMs <= 0) return cap;
  return Math.min(itemWaveMs, cap);
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
 * نگه می‌دارد و شکل/رنگ مرحله را رویش می‌نشیاند (بقیهٔ فیلدها دست‌خورده).
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
