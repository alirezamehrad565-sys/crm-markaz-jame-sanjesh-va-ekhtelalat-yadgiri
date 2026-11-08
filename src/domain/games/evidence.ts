// evidence.ts — موتور جمع‌کردن شواهد (۱.۲۵.۳۲) — خالص، بدون DB/UI (الگوی stages/pure)
// «شواهد» در این سامانه = نشانه‌های کمی رفتاری یک جلسه + پرچم‌های کیفیت + توصیهٔ غیربالینی.
// قواعد ثابت این ماژول:
//   · هیچ برچسب/تشخیص بالینی — فقط توصیف و پرچم؛ تفسیر با درمانگر است (§۸ گزارش)
//   · قاعدهٔ دامنهٔ صفر — هر نشانه بدون دادهٔ کافی null است، نه صفرِ ساختگی
//   · توصیه فقط «پلهٔ تمرین» را جابه‌جا پیشنهاد می‌دهد — هیچ تغییری در داده نمی‌سازد
//   · هر تغییر عددی = بامپ EVIDENCE_RULES_VERSION تا گزارش‌ها قابل‌استناد بمانند

import type { SessionSummary } from './scoring';
import { GAME_KINDS, type GameKind } from './registry';

/** نسخهٔ قواعد موتور شواهد — هر تغییر عددی این نسخه را بامپ می‌کند */
export const EVIDENCE_RULES_VERSION = '1.0.0';

/** پرچم هر نشانه — ok درون محدودهٔ آرام، watch مرز هشدار، poor بیرون محدوده */
export type EvidenceFlag = 'ok' | 'watch' | 'poor' | null;

export interface EvidenceSignal {
  id: string;
  title_fa: string;
  value: number | null;
  unit: 'percent' | 'ms' | 'ratio' | 'pp';
  flag: EvidenceFlag;
  /** چرا این پرچم — توضیح کوتاه برای درمانگر؛ تهی = خودبه‌خود روشن است */
  note_fa: string | null;
}

export interface EvidenceDossier {
  rules_version: string;
  kind: GameKind;
  /** نشانه‌های کمی — هر یک با پرچم و توضیح */
  signals: EvidenceSignal[];
  /** پرچم‌های رفتاری — ورودی توصیه، هرگز برچسب کودک */
  flags: {
    fatigue: boolean;       // افت دقت انتهای جلسه نسبت به آغاز
    instability: boolean;   // پراکندگی زیاد زمان واکنش
    impulsivity: boolean;   // پاسخ‌دهی شتاب‌زده (کمسیون/پیش‌ضربه)
    disengagement: boolean; // پوشش کمِ شواهد نمایش / بی‌پاسخی پنجره‌ها
  };
  /** توصیهٔ پلهٔ تمرین — non-binding؛ ملاک گذار همان قواعد stage می‌ماند */
  recommendation: { action: 'promote' | 'hold' | 'review'; reason_fa: string };
}

const CV_OK = 0.35;
const CV_WATCH = 0.5;
const DRIFT_OK_PP = 5;
const DRIFT_WATCH_PP = 20;
const PREMATURE_OK_PCT = 10;
const PREMATURE_WATCH_PCT = 25;
const TIMEOUT_OK_PCT = 10;
const TIMEOUT_WATCH_PCT = 25;
const COVERAGE_OK = 0.9;
const COVERAGE_WATCH = 0.7;
/** حداقل بلوک معیار برای سنجش افت انتهای جلسه */
const MIN_BLOCKS_FOR_DRIFT = 3;

function flagOf(value: number | null, okMax: number, watchMax: number, lowerIsBetter = true): EvidenceFlag {
  if (value === null || !Number.isFinite(value)) return null;
  if (lowerIsBetter) return value <= okMax ? 'ok' : value <= watchMax ? 'watch' : 'poor';
  return value >= okMax ? 'ok' : value >= watchMax ? 'watch' : 'poor';
}

/** افت دقت انتهای جلسه (pp) — بلوک آخر منهای بلوک اول؛ کمتر از ۳ بلوک معیار = null */
function accuracyDriftPpOf(summary: SessionSummary): number | null {
  const blocks = (summary.blocks ?? []).filter((b) => b.total > 0);
  if (blocks.length < MIN_BLOCKS_FOR_DRIFT) return null;
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  return Math.round((last.correct_pct - first.correct_pct) * 100) / 100;
}

/** درصد بی‌پاسخی پنجره — از اُمیشن‌های «انتخاب زمان‌دار»؛ پرچم timed_choice هر نوع
 *  تک‌منبعش رجیستری است (G4الف) — افزودن نوع زمان‌دار تازه بدون دست‌زدن به شواهد */
function windowMissPctOf(summary: SessionSummary, kind: GameKind): number | null {
  if (!GAME_KINDS[kind].timed_choice) return null;
  const total = summary.totals?.total ?? 0;
  const omission = summary.totals?.omission ?? 0;
  if (total <= 0) return null;
  return Math.round((omission / total) * 10000) / 100;
}

/**
 * پروندهٔ شواهد جلسه — از خلاصهٔ محاسبه‌شده؛ هیچ دسترسی DB/UI ندارد.
 * passed = نتیجهٔ ملاک گذار مرحله (قواعد stages) — توصیه این‌جا مستقل می‌سازد.
 */
export function buildEvidenceDossier(
  kind: GameKind,
  summary: SessionSummary,
  passed: boolean
): EvidenceDossier {
  const signals: EvidenceSignal[] = [];

  // ۱) پایداری زمان واکنش — ضریب تغییرپذیری (SD/میانگین)
  const cv = summary.rt?.cv ?? null;
  signals.push({
    id: 'rt_cv',
    title_fa: 'پراکندگی نسبی زمان واکنش',
    value: cv,
    unit: 'ratio',
    flag: flagOf(cv, CV_OK, CV_WATCH),
    note_fa: cv === null ? 'دادهٔ کافی برای سنجش پراکندگی نبود (حداقل ۵ زمان واکنش درست لازم است).' : null
  });

  // ۲) افت دقت انتهای جلسه — نشانهٔ خستگی/بی‌حوصلگی
  const drift = accuracyDriftPpOf(summary);
  signals.push({
    id: 'accuracy_drift_pp',
    title_fa: 'افت دقت انتهای جلسه نسبت به آغاز',
    value: drift,
    unit: 'pp',
    flag: flagOf(drift, DRIFT_OK_PP, DRIFT_WATCH_PP),
    note_fa: drift === null ? `سنجش افت فقط با ${MIN_BLOCKS_FOR_DRIFT} بلوک یا بیشتر معنا دارد.` : null
  });

  // ۳) پاسخ پیش‌ضربه — نشانهٔ شتاب‌زدگی
  const totalAll = summary.totals?.total ?? 0;
  const prematurePct = totalAll > 0 && (summary.behavior?.premature_total ?? 0) >= 0
    ? Math.round(((summary.behavior?.premature_total ?? 0) / totalAll) * 10000) / 100
    : null;
  signals.push({
    id: 'premature_pct',
    title_fa: 'نسبت پاسخ‌های پیش‌ضربه',
    value: prematurePct,
    unit: 'percent',
    flag: flagOf(prematurePct, PREMATURE_OK_PCT, PREMATURE_WATCH_PCT),
    note_fa: prematurePct === null ? 'بدون آیتم لمسی/شواهد پیش‌ضربه، این نشانه تعریف‌نشده است.' : null
  });

  // ۴) بی‌پاسخی پنجره — فقط انتخاب زمان‌دار
  const windowMiss = windowMissPctOf(summary, kind);
  signals.push({
    id: 'window_miss_pct',
    title_fa: 'نسبت پنجره‌های بدون پاسخ',
    value: windowMiss,
    unit: 'percent',
    flag: flagOf(windowMiss, TIMEOUT_OK_PCT, TIMEOUT_WATCH_PCT),
    note_fa: windowMiss === null ? 'این نشانه فقط برای انتخاب زمان‌دار (استروپ/فلانکر) تعریف می‌شود.' : null
  });

  // ۵) پوشش شواهد نمایش — شفافیت کیفیت داده
  const coverage = summary.behavior?.evidence_coverage ?? null;
  const coveragePct = coverage === null ? null : Math.round(coverage * 100);
  signals.push({
    id: 'evidence_coverage_pct',
    title_fa: 'پوشش شواهد نمایش آزمون‌ها',
    value: coveragePct,
    unit: 'percent',
    flag: flagOf(coveragePct, COVERAGE_OK * 100, COVERAGE_WATCH * 100, false),
    note_fa: coveragePct === null ? 'شواهد نمایشی ثبت نشده بود.' : null
  });

  const flags = {
    fatigue: drift !== null && drift <= -DRIFT_WATCH_PP,
    instability: cv !== null && cv > CV_WATCH,
    impulsivity:
      ((summary.pct?.commission ?? null) !== null && (summary.pct?.commission as number) >= 30) ||
      (prematurePct !== null && prematurePct > PREMATURE_WATCH_PCT),
    disengagement:
      (coverage !== null && coverage < COVERAGE_WATCH) ||
      (windowMiss !== null && windowMiss > TIMEOUT_WATCH_PCT)
  };

  // توصیه — بی‌رقارت، بی‌سرزنش؛ هرگز «تشخیص» نیست
  let action: EvidenceDossier['recommendation']['action'] = passed ? 'promote' : 'review';
  let reasonFa = passed
    ? 'ملاک گذار این مرحله کامل شد؛ با شواهد آرام، پلهٔ بعد پیشنهاد می‌شود.'
    : 'ملاک گذار هنوز کامل نشده؛ همین مرحله با تنظیم آرام ادامه می‌یابد.';
  if (passed && (flags.fatigue || flags.instability)) {
    action = 'hold';
    reasonFa = 'ملاک گذار روی کاغذ کامل شد اما نشانه‌های افت دقت انتهای جلسه یا پراکندگی واکنش دیده می‌شود؛ تکرار آرام همین مرحله بهتر است.';
  } else if (!passed && flags.disengagement) {
    reasonFa = 'ملاک گذار کامل نشده و پوشش شواهد پایین است؛ جلسهٔ بعد در حالت آرام‌تر و کوتاه‌تر پیشنهاد می‌شود.';
  }

  return {
    rules_version: EVIDENCE_RULES_VERSION,
    kind,
    signals,
    flags,
    recommendation: { action, reason_fa: reasonFa }
  };
}
