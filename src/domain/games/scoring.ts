// scoring.ts — موتور نمره‌دهی جلسه (فاز ۵ بازطراحی گو/نوگو / ۱.۲۵.۱۵)
// دفترچهٔ وظیفه §۵: مجموع‌ها، درصدها، میانه/پراکندگی RT، عملکرد بلوکی —
// مستقل از UI، با قاعدهٔ دامنهٔ صفر (مخرج صفر = null، هرگز صفرِ ساختگی) و
// جایگاه رزرو d-prime (بدون برقراری پایهٔ نُرم هیچ مقداری تولید نمی‌شود).
// تعریف‌های فرمولی موجود در pure.ts دست‌نخورده — این لایه تجمیعِ گزارش است.
// «خام در برابر محاسبه‌شده»: خروجی این ماژول لایهٔ محاسبه‌شده است؛ دادهٔ خام
// (response_json + شواهد فاز ۴) جدا در game_attempts می‌ماند.

import { commissionCountOf, commissionPctOf, correctGoPctOf, correctNogoPctOf, meanNumlineErrorOf, medianRtOf, omissionCountOf, omissionPctOf, accuracyOf, type ScoredAttempt } from './pure';

/** شواهد نمایش واقعی هر آزمون (فاز ۴) — همه nullable */
export interface AttemptEvidence {
  presented_at_ms?: number | null;
  frame_drops?: number | null;
  max_frame_delta_ms?: number | null;
  touch_count?: number | null;
  premature_count?: number | null;
  multiple_count?: number | null;
  out_of_surface_count?: number | null;
  window_ms?: number | null;
}

export interface BlockPerformance {
  block: number;
  total: number;
  correct: number;
  correct_pct: number;
  commission: number;
  omission: number;
  median_rt: number | null;
}

export interface SessionSummary {
  totals: {
    total: number;
    go: number;
    nogo: number;
    correct_go: number;
    correct_nogo: number;
    commission: number;
    omission: number;
  };
  pct: {
    accuracy: number | null;
    correct_go: number | null;
    correct_nogo: number | null;
    commission: number | null;
    omission: number | null;
  };
  rt: {
    median: number | null;
    mean: number | null;
    sd: number | null;
    /** ضریب تغییرپذیری (SD/میانگین) — پراکندگی نسبی؛ دادهٔ کافی نبود: null */
    cv: number | null;
    min: number | null;
    max: number | null;
    count: number;
  };
  blocks: BlockPerformance[];
  behavior: {
    premature_total: number;
    multiple_total: number;
    out_of_surface_total: number;
    frame_drops_total: number;
    max_frame_delta_ms: number | null;
    /** نسبت آزمون‌های دارای شواهد نمایش — شفافیت کیفیت داده، نه ادعای دقت */
    evidence_coverage: number | null;
  };
  /** رزرو — بدون پایهٔ نُرم هیچ مقداری تولید نمی‌شود (دفترچهٔ وظیفه §۵) */
  dprime: null;
  /** خط عددی (۱.۲۵.۲۸) — میانگین خطای نرمال‌شدهٔ جای عدد (۰..۱۰۰)؛ بدون آیتم خط عددی = null */
  numline: { mean_error_pct: number | null };
  /** ردیابی قاعدهٔ دامنهٔ صفر — گزارش شفاف می‌گوید کدام سنجه قابل محاسبه نبود و چرا */
  zero_denominator: string[];
}

const CV_MIN_RT_COUNT = 5; // کمتر از ۵ RT درست: CV ناپایدار → null (صادقانه)

export function summarizeAttempts(
  scored: ScoredAttempt[],
  evidence: AttemptEvidence[] = [],
  blockSize = 24
): SessionSummary {
  const t = Array.isArray(scored) ? scored : [];
  const ev = Array.isArray(evidence) ? evidence : [];
  const zeroDenominator: string[] = [];

  const go = t.filter((s) => s.isGo === true);
  const nogo = t.filter((s) => s.isGo === false);
  const correctGo = go.filter((s) => s.correct);
  const correctNogo = nogo.filter((s) => s.correct);
  const commission = commissionCountOf(t);
  const omission = omissionCountOf(t);

  const accuracy = accuracyOf(t);
  const correctGoPct = correctGoPctOf(t);
  const correctNogoPct = correctNogoPctOf(t);
  const commissionPct = commissionPctOf(t);
  const omissionPct = omissionPctOf(t);
  if (go.length === 0) zeroDenominator.push('go=0 — correct_go/omission درصدشان تعریف‌نشده');
  if (nogo.length === 0) zeroDenominator.push('nogo=0 — correct_nogo/commission درصدشان تعریف‌نشده');

  const rts = t
    .filter((s) => s.correct && s.rtValid && typeof s.rtMs === 'number' && (s.rtMs as number) >= 0)
    .map((s) => s.rtMs as number)
    .sort((a, b) => a - b);
  const median = medianRtOf(t);
  const mean = rts.length > 0 ? Math.round((rts.reduce((a, b) => a + b, 0) / rts.length) * 100) / 100 : null;
  let sd: number | null = null;
  let cv: number | null = null;
  if (rts.length >= 2 && mean !== null) {
    sd = Math.round(Math.sqrt(rts.reduce((a, b) => a + (b - mean!) * (b - mean!), 0) / (rts.length - 1)) * 100) / 100;
    if (rts.length >= CV_MIN_RT_COUNT && mean > 0) cv = Math.round((sd / mean) * 1000) / 1000;
  }

  // عملکرد بلوکی — بر جایگاه آزمون (ترتیب ثبت) با بلوک پروتکل
  const size = Math.max(1, Math.floor(blockSize));
  const blockCount = Math.ceil(t.length / size);
  const blocks: BlockPerformance[] = [];
  for (let b = 1; b <= blockCount; b++) {
    const slice = t.slice((b - 1) * size, b * size);
    const correct = slice.filter((s) => s.correct).length;
    blocks.push({
      block: b,
      total: slice.length,
      correct,
      correct_pct: slice.length > 0 ? Math.round((correct / slice.length) * 10000) / 100 : 0,
      commission: slice.filter((s) => s.commission).length,
      omission: slice.filter((s) => s.omission).length,
      median_rt: medianRtOf(slice)
    });
  }

  const frameDrops = ev.map((e) => e.frame_drops ?? 0);
  const maxDelta = ev.map((e) => e.max_frame_delta_ms ?? 0).filter((v) => v > 0);
  const evWithPresentation = ev.filter((e) => typeof e.presented_at_ms === 'number').length;

  return {
    totals: {
      total: t.length,
      go: go.length,
      nogo: nogo.length,
      correct_go: correctGo.length,
      correct_nogo: correctNogo.length,
      commission,
      omission
    },
    pct: {
      accuracy,
      correct_go: correctGoPct,
      correct_nogo: correctNogoPct,
      commission: commissionPct,
      omission: omissionPct
    },
    rt: {
      median,
      mean,
      sd,
      cv,
      min: rts.length > 0 ? rts[0] : null,
      max: rts.length > 0 ? rts[rts.length - 1] : null,
      count: rts.length
    },
    blocks,
    behavior: {
      premature_total: ev.reduce((a, e) => a + (e.premature_count ?? 0), 0),
      multiple_total: ev.reduce((a, e) => a + (e.multiple_count ?? 0), 0),
      out_of_surface_total: ev.reduce((a, e) => a + (e.out_of_surface_count ?? 0), 0),
      frame_drops_total: frameDrops.reduce((a, b) => a + b, 0),
      max_frame_delta_ms: maxDelta.length > 0 ? Math.max(...maxDelta) : null,
      evidence_coverage: ev.length > 0 ? Math.round((evWithPresentation / ev.length) * 100) / 100 : null
    },
    dprime: null,
    numline: { mean_error_pct: meanNumlineErrorOf(t) },
    zero_denominator: zeroDenominator
  };
}
