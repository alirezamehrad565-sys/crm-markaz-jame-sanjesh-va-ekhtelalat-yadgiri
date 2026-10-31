// پایش پیشروی SLD: محاسبات خالص پراپ مسیر مداخله (شیب OLS، ملاک تسلط ۸۰٪ دوجلسه‌ای، داوری روند).
// این فایل هیچ دسترسی به دیتابیس ندارد — همان الگوی report.ts: سرویس رکوردها را می‌دهد، این‌جا فقط محاسبه است.
// سری ورودی باید صعودی بر اساس takenAt مرتب شده باشد (قرارداد فراخواننده).

// دکترین پایش پیشروی: ملاک تسلط ۸۰٪ و دو جلسهٔ پیاپی (هم‌راستا با معیار تسلط کارت‌های )
export const PATH_PROBE_DEFAULT_THRESHOLD = 80;
export const PATH_PROBE_MASTERY_STREAK = 2;

export interface ProbeVerdict {
  key: 'insufficient' | 'improving' | 'gradual' | 'plateau' | 'slight_decline' | 'regressed';
  label: string;
  text: string;
  good: 1 | 0 | -1;
}

export interface ProbeMasteryEvaluation {
  achieved: boolean;
  threshold: number;
  streak: number;      // طول دنبالهٔ انتهاییِ مقادیر ≥ ملاک
  sinceAt: string | null; // لحظه‌ای که دنبالهٔ لازم تکمیل شد (takenAt اولین عضو زوج/دنبالهٔ واجد شرط)
}

export interface ProbePointLike {
  value: number;
  takenAt: string;
}

// رگرسیون خطی کمینه‌مربع‌ها روی اندیس‌ها؛ فرمول هم‌ارز olsSlope در progress-report.js
// (تقسیم بر دامنهٔ اندیس 0..n-1) — n<2 یعنی شیب معنا ندارد و صفر برمی‌گردد.
export function olsSlopeOf(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let numr = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    numr += (i - mx) * (values[i] - my);
    den += (i - mx) * (i - mx);
  }
  return den ? numr / den : 0;
}

// تسلط = دنبالهٔ انتهاییِ پراپ‌های ≥ ملاک به بلندی حداقل streakNeeded؛
// «پیاپی» یعنی همسایگی در سری سنجه (ورودی‌های کنار هم)، نه همسایگی در تقویم.
export function masteryOf(
  series: ProbePointLike[],
  threshold: number = PATH_PROBE_DEFAULT_THRESHOLD,
  streakNeeded: number = PATH_PROBE_MASTERY_STREAK
): ProbeMasteryEvaluation {
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].value >= threshold) streak += 1;
    else break;
  }
  if (streak >= streakNeeded) {
    // «از چه زمانی»: اولین عضوِ آخرین پنجرهٔ واجد شرط (زوج/دنبالهٔ انتهایی)؛
    // مثلاً با سه پراپِ ≥ملاک، تسلط از پراپِ دوم تأیید شده است نه سوم.
    const sinceIdx = series.length - streakNeeded;
    return { achieved: true, threshold, streak, sinceAt: series[sinceIdx].takenAt };
  }
  return { achieved: false, threshold, streak, sinceAt: null };
}

// داوری روند نسبی به دامنهٔ سری است نه مطلق: rel = شیب/دامنه×۱۰۰ (درصدِ پهنای تغییر).
// با این نسبی‌بودن، هم سری ٪ (دامنهٔ کوچک) و هم واژه در دقیقه (دامنهٔ بزرگ) با یک برش منطقی طبقه‌بندی می‌شوند.
export function probeVerdictOf(slope: number, span: number, count: number): ProbeVerdict {
  if (count < 2) {
    return {
      key: 'insufficient',
      label: 'دادهٔ کافی نیست',
      text: 'با حداقل دو پراپ، روند و تسلط قضاوت می‌شود.',
      good: 0
    };
  }
  const rel = (slope / Math.max(span, 1)) * 100;
  if (rel >= 5) {
    return {
      key: 'improving',
      label: 'بهبود روشن',
      text: 'روند پراپ صعود آشکار دارد — تداوم مداخله با همین شدت.',
      good: 1
    };
  }
  if (rel >= 2) {
    return {
      key: 'gradual',
      label: 'بهبود تدریجی',
      text: 'روند پراپ صعودی آرام اما پیوسته است.',
      good: 1
    };
  }
  if (rel > -2) {
    return {
      key: 'plateau',
      label: 'تقریباً پایدار',
      text: 'پراپ تغییر معنادار نشان نمی‌دهد — با خط پایه و معیار هدف قضاوت شود.',
      good: 0
    };
  }
  if (rel > -5) {
    return {
      key: 'slight_decline',
      label: 'افت خفیف',
      text: 'افت خفیف در پراپ دیده می‌شود — دشواری تکالیف و انگیزش بازبینی شود.',
      good: -1
    };
  }
  return {
    key: 'regressed',
    label: 'افت روشن',
    text: 'افت روشن در پراپ — بازسنجی و بازنگری برنامهٔ مداخله لازم است.',
    good: -1
  };
}

export interface ProbeSeriesEvaluation {
  slope: number;
  verdict: ProbeVerdict;
  mastery: ProbeMasteryEvaluation;
  latestValue: number | null;
  count: number;
  // داوری خودکار کنار شیب: قاعدهٔ ۴-نقطه + هشدار سکون با پیشنهاد سه‌گانه
  monitor: ProbeMonitor;
}

// ─── پایش پیشرفت کامل: قاعدهٔ ۴-نقطه، هشدار سکون، خط هدف ───

export type FourPointKey = 'insufficient' | 'rising' | 'falling' | 'indeterminate';

export interface FourPointEvaluation {
  key: FourPointKey;
  label: string;
  window: number | null;  // چند نقطهٔ نخست ملاک قرار گرفت (۶ تا ۸)
  above: number | null;   // چند نقطه از چهار تای آخر بالای خط پایه بود (۰..۴)
  baseline: number | null; // میانهٔ نیمهٔ اول پنجره
}

// قاعدهٔ ۴-نقطهٔ کتاب‌درسی: چهار دادهٔ آخر از شش تا هشت دادهٔ نخست نسبت به خط پایه (میانهٔ نیمهٔ اول)
// — سه یا چهار نقطه بالای پایه = صعود، سه یا چهار پایین = نزول، وسط = نامعین
export function fourPointRuleOf(series: ProbePointLike[]): FourPointEvaluation {
  if (series.length < 6) {
    return { key: 'insufficient', label: 'برای قاعدهٔ ۴-نقطه حداقل شش داده لازم است', window: null, above: null, baseline: null };
  }
  const window = Math.min(8, series.length);
  const w = series.slice(0, window).map((p) => p.value);
  const head = w.slice(0, window - 4);
  const tail = w.slice(window - 4);
  const sorted = [...head].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const baseline = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const above = tail.filter((v) => v > baseline).length;
  const below = tail.filter((v) => v < baseline).length;
  if (above >= 3) return { key: 'rising', label: '۴-نقطه: صعود', window, above, baseline };
  if (below >= 3) return { key: 'falling', label: '۴-نقطه: نزول', window, above, baseline };
  return { key: 'indeterminate', label: '۴-نقطه: نامعین', window, above, baseline };
}

export type StallKey = 'continue' | 'dose' | 'change' | 'none';

export interface StallJudgement {
  key: StallKey;
  label: string;
  hint: string; // سه‌گانهٔ ادامه/افزایش دوز/تغییر روش — تصمیم پیشنهادی با دلیل
}

// داوری سکون: ترکیب داوری OLS و قاعدهٔ ۴-نقطه و تسلط — «تصمیم پیشنهادی» می‌دهد، تصمیم نهایی دست درمانگر است
export function stallJudgementOf(
  verdict: ProbeVerdict,
  fourPoint: FourPointEvaluation,
  mastery: ProbeMasteryEvaluation
): StallJudgement {
  const threeWay = 'گزینه‌ها: ادامهٔ همین برنامه / افزایش دوز (تعداد و تناوب جلسه) / تغییر روش مداخله.';
  if (mastery.achieved) {
    return { key: 'none', label: 'تسلط تأییدشده', hint: `ملاک تسلط در دنبالهٔ پیاپی برقرار است — به فاز تعمیم و کاهش دوز پایش فکر کنید. ${threeWay}` };
  }
  if (verdict.good === 1 && fourPoint.key === 'rising') {
    return { key: 'continue', label: 'روند مثبت — ادامه', hint: `شیب و قاعدهٔ ۴-نقطه هر دو صعودند؛ همین برنامه با همین دوز ادامه یابد. ${threeWay}` };
  }
  if (verdict.good === -1 || fourPoint.key === 'falling') {
    return { key: 'change', label: 'افت — تغییر روش', hint: `شیب یا قاعدهٔ ۴-نقطه نزولی است؛ ادامهٔ همین دوز منطقی نیست — روش مداخله بازنگری شود. ${threeWay}` };
  }
  if (verdict.key === 'gradual') {
    return { key: 'continue', label: 'بهبود آرام — ادامه با پایش', hint: `صعود آرام اما پیوسته؛ برنامه ادامه یابد و دوز در بازنگری هفتگی سنجیده شود. ${threeWay}` };
  }
  // سکون: شیب تقریباً صفر یا نامعین — پیشنهاد پیش‌فرض افزایش دوز پیش از تغییر روش
  return { key: 'dose', label: 'سکون — افزایش دوز', hint: `روند هنوز حرکتی نکرده؛ پیش از تغییر روش، دوز (تعداد/تناوب جلسه و تمرین خانگی) افزایش یابد. ${threeWay}` };
}

// خط هدف: از خط پایه (اولین پراپ) با گام هفتگی ثابت تا ملاک تسلط در پنجرهٔ پیش‌فرض شش‌هفته‌ای؛
// برگشتی برای ترسیم روی نمودار موجود — خواندنی، بدون ذخیره.
export const GOAL_LINE_WINDOW_WEEKS = 6;

export interface GoalLineSpec {
  startAt: string;
  startValue: number;
  weeklyGain: number;
  windowWeeks: number;
  criterion: number;
}

export function goalLineOf(
  series: ProbePointLike[],
  criterion: number,
  windowWeeks: number = GOAL_LINE_WINDOW_WEEKS
): GoalLineSpec | null {
  if (series.length < 2) return null;
  const first = series[0];
  const weeklyGain = (criterion - first.value) / Math.max(windowWeeks, 1);
  return {
    startAt: first.takenAt,
    startValue: first.value,
    weeklyGain: Math.round(weeklyGain * 100) / 100,
    windowWeeks,
    criterion
  };
}

// ارزیابی کامل یک سنجه: شیب، داوری، تسلط و آخرین اندازه — سرویس به‌ازای هر metric صدا می‌زند.
// به‌همراه داوری خودکار قاعدهٔ ۴-نقطه و هشدار سکون (کنار شیب OLS، جانشینش نیست).
export interface ProbeMonitor {
  fourPoint: FourPointEvaluation;
  stall: StallJudgement;
}

export function evaluateProbeSeries(
  series: ProbePointLike[],
  threshold: number = PATH_PROBE_DEFAULT_THRESHOLD
): ProbeSeriesEvaluation {
  const count = series.length;
  const values = series.map((p) => p.value);
  const slope = olsSlopeOf(values);
  const span = count ? Math.max(...values) - Math.min(...values) : 0;
  const verdict = probeVerdictOf(slope, span, count);
  const mastery = masteryOf(series, threshold);
  const fourPoint = fourPointRuleOf(series);
  const stall = stallJudgementOf(verdict, fourPoint, mastery);
  return {
    slope,
    verdict,
    mastery,
    latestValue: count ? values[count - 1] : null,
    count,
    monitor: { fourPoint, stall }
  };
}
