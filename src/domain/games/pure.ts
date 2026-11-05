// pure.ts — موتور نمره‌دهی، گیت‌های انتشار و لینت لحن — بدون وابستگی به DB و رابط (§۸)
// همهٔ فرمول‌ها همین‌جاست تا با نمونهٔ طلایی آزمون شوند؛ سرویس فقط آن‌ها را صدا می‌زند.
import type { ItemView, MissionConfig, MissionItem, PackageBody, SessionValidity } from './types';

// ─── ثابت‌های قاعده (بازبین بالینی فهرست‌ها را تأیید و در همین‌جا نگه می‌دارد) ───

/** چهار قاعدهٔ پایهٔ لحن که هر بسته باید داشته باشد (§۴) */
export const TONE_RULES_BASE = ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'] as const;

/** کف اعتبار زمان واکنش بر اساس نوع بازی (§۸) */
export const DEFAULT_RT_FLOOR_MS: Record<MissionItem['type'], number> = {
  touch_report: 150, // گو/نوگو — زیر ۱۵۰ حدس است
  numline: 0,        // خط عددی کف ندارد
  choice: 200        // فلش‌کارت/انتخاب — لمس تصادفی حذف می‌شود
};

/** آستانهٔ بیکاری برای جلسهٔ ناقص (§۶) */
export const IDLE_PARTIAL_MS = 5 * 60 * 1000;

/** حداقل نسبت آیتم‌های انجام‌شده برای جلسهٔ معتبر (§۸) */
export const MIN_COMPLETION_RATIO = 0.6;

/** لینت لحن — واژه‌های ممنوع در متن‌های والد و کودک (§۱۰؛ فهرست آغازین، تأیید نهایی با بازبین بالینی) */
export const FORBIDDEN_TEXT_PATTERNS: readonly string[] = [
  'درمان شد', 'درمان می‌شود', 'قطعاً بهتر می‌شود', 'تضمین',
  'ADHD داری', 'بیش‌فعال شده‌ای', 'اوتیسم داری',
  'شکست', 'اشتباه کردی', 'باید بیشتر تلاش کنی',
  'بهتر از دیگران', 'رتبهٔ', 'رتبه در', 'امتیاز برتر',
  'تنبل', 'کم‌هوش', 'ضعیف است',
  'سریع‌تر', 'تایمر', 'زمان تمام'
];

/** جفت‌های هم‌آوای فارسی — هرگز آیتم تمایز شنیداری نیستند (قاعدهٔ حیاتی سند محتوا) */
export const HOMOPHONE_SETS: readonly string[][] = [
  ['س', 'ص', 'ث'],
  ['ت', 'ط'],
  ['ح', 'ه'],
  ['ز', 'ذ', 'ض', 'ظ'],
  ['غ', 'ق']
];

// ─── نمره‌دهی ───

export interface ScoredAttempt {
  itemId: string;
  phase: 'train' | 'probe';
  correct: boolean;
  rtMs: number | null;
  rtValid: boolean;
  /** خطای نرمال‌شدهٔ خط عددی (۰ تا ۱۰۰) برای فرمول numline_error */
  numlineErrorPct?: number;
  /** برای فرمول commission: پاسخ به غیرهدف */
  commission?: boolean;
  /** برای فرمول omission: از دست‌دادن هدف */
  omission?: boolean;
}

function rtFloorFor(item: MissionItem, mission: MissionConfig): number {
  return typeof mission.rt_floor_ms === 'number' ? mission.rt_floor_ms : DEFAULT_RT_FLOOR_MS[item.type] ?? 0;
}

function numlineErrorPct(chosen: number, target: number, range: [number, number]): number {
  const span = Math.abs(range[1] - range[0]);
  if (span <= 0) return 0;
  return (Math.abs(chosen - target) / span) * 100;
}

/** نمره‌دهی یک پاسخ سمت سرور — کلید فقط از آیتم ذخیره‌شده می‌آید */
export function scoreAttempt(item: MissionItem, mission: MissionConfig, response: unknown, rtMs: number | null): ScoredAttempt {
  const floor = rtFloorFor(item, mission);
  // زمان منفی = خطای ساعت → بدون اندازه‌گیری (نه صفرِ زیر کف)
  const rt = typeof rtMs === 'number' && Number.isFinite(rtMs) && rtMs >= 0 ? Math.round(rtMs) : null;
  const rtValid = rt === null ? true : rt >= floor;
  const res = (response ?? {}) as Record<string, unknown>;

  let correct = false;
  let errorPct: number | undefined;
  let commission = false;
  let omission = false;

  if (item.type === 'choice') {
    correct = typeof res.option === 'number' && res.option === item.correct;
  } else if (item.type === 'numline') {
    const chosen = typeof res.chosen === 'number' ? res.chosen : null;
    if (chosen !== null && typeof item.correct === 'number' && item.range) {
      correct = chosen === item.correct;
      errorPct = numlineErrorPct(chosen, item.correct, item.range);
    }
  } else if (item.type === 'touch_report') {
    const touched = res.touched === true;
    const want = item.correct_touch === true; // هدف واقعی (go)
    correct = touched === want;
    // commission = لمس غیرهدف؛ omission = نلمس‌کردن هدف
    commission = !want && touched;
    omission = want && !touched;
  }

  return {
    itemId: item.id,
    phase: item.phase,
    correct,
    rtMs: rt,
    rtValid,
    ...(errorPct !== undefined ? { numlineErrorPct: errorPct } : {}),
    commission,
    omission
  };
}

/** پاسخ درست به شکل نمایشی برای بازخورد آموزشی — هرگز در پروب استفاده نمی‌شود */
export function answerDisplayOf(item: MissionItem): string | null {
  if (item.type === 'choice') {
    return typeof item.correct === 'number' ? (item.options?.[item.correct]?.label ?? null) : null;
  }
  if (item.type === 'numline') return typeof item.correct === 'number' ? String(item.correct) : null;
  return null; // touch_report: بازپخش محرک، نه نمایش پاسخ
}

// ─── فرمول‌های سنجه (§۸) — ورودی فقط پاسخ‌های معتبر پروب ───

export function accuracyOf(scored: ScoredAttempt[]): number | null {
  if (scored.length === 0) return null;
  return round2((scored.filter((s) => s.correct).length / scored.length) * 100);
}

export function meanNumlineErrorOf(scored: ScoredAttempt[]): number | null {
  const errs = scored.map((s) => s.numlineErrorPct).filter((v): v is number => typeof v === 'number');
  if (errs.length === 0) return null;
  return round2(errs.reduce((a, b) => a + b, 0) / errs.length);
}

export function medianRtOf(scored: ScoredAttempt[]): number | null {
  const rts = scored
    .filter((s) => s.correct && s.rtValid && typeof s.rtMs === 'number')
    .map((s) => s.rtMs as number)
    .sort((a, b) => a - b);
  if (rts.length === 0) return null;
  const mid = Math.floor(rts.length / 2);
  return rts.length % 2 === 1 ? rts[mid] : Math.round((rts[mid - 1] + rts[mid]) / 2);
}

export function commissionCountOf(scored: ScoredAttempt[]): number {
  return scored.filter((s) => s.commission).length;
}

export function omissionCountOf(scored: ScoredAttempt[]): number {
  return scored.filter((s) => s.omission).length;
}

/** فرمول ثبت‌شدهٔ سنجه → مقدار جلسه (ورودی فقط Attemptهای پروب معتبر) */
export function computeMetricValue(formula: string, scored: ScoredAttempt[]): number | null {
  switch (formula) {
    case 'accuracy': return accuracyOf(scored);
    case 'numline_error': return meanNumlineErrorOf(scored);
    case 'median_rt': return medianRtOf(scored);
    case 'commission': return commissionCountOf(scored);
    case 'omission': return omissionCountOf(scored);
    default: return null;
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── اعتبار جلسه (§۶ و §۸) ───

/**
 * تصمیم validity از سرنخ زمانی فعالیت:
 *  · شکاف بیکاری بیش از ۵ دقیقه بین دو فعالیت → partial
 *  · انجام کمتر از ۶۰٪ آیتم‌های مأموریت → partial
 * activityTimes: زمان هر فعالیت کلاینت (attempt/next-item) به ms epoch، صعودی.
 */
export function decideValidity(activityTimes: number[], doneItems: number, totalItems: number): SessionValidity {
  for (let i = 1; i < activityTimes.length; i++) {
    if (activityTimes[i] - activityTimes[i - 1] > IDLE_PARTIAL_MS) return 'partial';
  }
  if (totalItems > 0 && doneItems / totalItems < MIN_COMPLETION_RATIO) return 'partial';
  return 'valid';
}

// ─── تسلط (§۸) — ملاک ۸۰٪ در دو جلسهٔ معتبر پیاپی ───

export function masteryAchieved(validPoints: number[], threshold: number, sessions = 2, higherIsBetter = true): boolean {
  if (threshold === null || threshold === undefined || !Number.isFinite(threshold)) return false;
  if (validPoints.length < sessions) return false;
  const recent = validPoints.slice(-sessions);
  return recent.every((v) => (higherIsBetter ? v >= threshold : v <= threshold));
}

// ─── گیت‌های انتشار (§۴) ───

export interface PublishGateContext {
  metricIds: Set<string>;
  goalIds: Set<string>;
}

export interface PublishGateError {
  rule: string;
  message: string;
}

const MISSION_GOAL_ERROR = 'goal';

/** اجرای همهٔ گیت‌های خودکار انتشار؛ خروجی تهی = مجاز */
export function runPublishGates(
  body: PackageBody,
  dose: { days_per_week: number; minutes: number; max_missions_per_day: number; min_weeks: number },
  evidenceLevel: string,
  ctx: PublishGateContext
): PublishGateError[] {
  const errors: PublishGateError[] = [];

  // ۱) هر مأموریت goal موجود در Goal Registry دارد
  if (!Array.isArray(body.goals) || body.goals.length === 0) {
    errors.push({ rule: MISSION_GOAL_ERROR, message: 'بسته حداقل یک هدف registered لازم دارد' });
  }
  for (const g of body.goals ?? []) {
    if (!ctx.goalIds.has(g)) errors.push({ rule: MISSION_GOAL_ERROR, message: `هدف «${g}» در واژه‌نامه نیست` });
  }

  // ۲) metric تعریف‌شده و آستانهٔ تسلط پر است
  for (const m of body.missions ?? []) {
    if (!ctx.metricIds.has(m.metric)) {
      errors.push({ rule: 'metric', message: `سنجهٔ «${m.metric}» در مأموریت ${m.id} تعریف نشده است` });
    }
    const th = m.mastery?.threshold !== undefined ? m.mastery.threshold : body.mastery?.threshold;
    if (th === null || th === undefined || !Number.isFinite(Number(th))) {
      errors.push({ rule: 'threshold', message: `آستانهٔ تسلط مأموریت ${m.id} تهی است — بالینی‌ساز باید پیش از انتشار تعیین کند` });
    }
    if (!Array.isArray(m.items) || m.items.length === 0) {
      errors.push({ rule: 'items', message: `مأموریت ${m.id} آیتم ندارد` });
    } else if (!m.items.some((it) => it.phase === 'probe')) {
      errors.push({ rule: 'probe', message: `مأموریت ${m.id} آیتم پروب ندارد — سنجه فقط از پروب ساخته می‌شود` });
    }
  }

  // ۳) برچسب شواهد و دوز کامل
  if (!['A', 'B', 'C'].includes(evidenceLevel)) {
    errors.push({ rule: 'evidence', message: 'برچسب شواهد A/B/C لازم است' });
  }
  if (!(dose.days_per_week > 0) || !(dose.minutes > 0) || !(dose.max_missions_per_day > 0) || !(dose.min_weeks > 0)) {
    errors.push({ rule: 'dose', message: 'دوز ناقص است: تناوب، مدت، سقف روزانه و دورهٔ حداقلی لازم است' });
  }

  // ۴) قواعد لحن پایه
  const tones = new Set(body.tone_rules ?? []);
  for (const t of TONE_RULES_BASE) {
    if (!tones.has(t)) errors.push({ rule: 'tone', message: `قاعدهٔ لحن «${t}» در بسته نیست` });
  }

  // ۵) لینت واژه‌های ممنوع روی متن‌های والد
  for (const v of lintTexts(body.parent_copy ?? {})) {
    errors.push({ rule: 'tone_lint', message: v });
  }

  // ۶) گیت جفت هم‌آوا در بستهٔ واجی — هر آیتم انتخابی (هر فازی) بازرسی می‌شود
  if (body.pa_phonemic === true) {
    for (const m of body.missions ?? []) {
      for (const it of m.items ?? []) {
        if (it.type === 'touch_report') continue; // آیتم لمسی/گو-نوگو تمایز شنیداری نیست
        const letters = collectLetters(it);
        if (letters.length > 0 && containsHomophonePair(letters)) {
          errors.push({ rule: 'homophone', message: `آیتم «${it.id}» در مأموریت ${m.id} جفت هم‌آوا دارد — تمایز شنیداری ممنوع است` });
        }
      }
    }
  }

  return errors;
}

/** همهٔ رشته‌های تختِ شیء متنی والد را لینت می‌کند */
export function lintTexts(obj: unknown, path = 'parent_copy'): string[] {
  const violations: string[] = [];
  const walk = (v: unknown, p: string): void => {
    if (typeof v === 'string') {
      for (const w of FORBIDDEN_TEXT_PATTERNS) {
        if (v.includes(w)) violations.push(`${p}: واژهٔ ممنوع «${w}»`);
      }
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${p}[${i}]`));
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${p}.${k}`);
    }
  };
  walk(obj, path);
  return violations;
}

/** لینت آزاد متن (برای آزمون و مصرف آینده) */
export function lintSentence(text: string): string[] {
  return FORBIDDEN_TEXT_PATTERNS.filter((w) => text.includes(w));
}

function collectLetters(item: MissionItem): string[] {
  const out: string[] = [];
  const push = (v: unknown): void => {
    if (typeof v === 'string') out.push(...Array.from(v));
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const x of Object.values(v as Record<string, unknown>)) push(x);
    } else if (Array.isArray(v)) for (const x of v) push(x);
  };
  push(item.prompt);
  push(item.stim);
  for (const o of item.options ?? []) push(o.label);
  return out.filter((ch) => /[\u0600-\u06FF]/.test(ch));
}

/** آیا دو حرف از یک جفت هم‌آوا هر دو حاضرند؟ (جفت خودِ «هم‌آوا» یعنی صدای یکسان) */
export function containsHomophonePair(letters: string[]): boolean {
  const set = new Set(letters);
  return HOMOPHONE_SETS.some((pair) => {
    const present = pair.filter((ch) => set.has(ch));
    return present.length >= 2;
  });
}

// ─── پاک‌سازی آیتم برای کلاینت (§۵: کلید پاسخ هرگز نمی‌رود) ───

const ANSWER_KEYS = new Set(['correct', 'correct_touch', 'answer', 'answer_display']);

/** هر کلید حاوی «correct» یا پاسخ، از درخت حذف می‌شود */
export function stripAnswerKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripAnswerKeys(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (ANSWER_KEYS.has(k) || k.toLowerCase().includes('correct')) continue;
      out[k] = stripAnswerKeys(v);
    }
    return out as T;
  }
  return value;
}

export function toItemView(item: MissionItem): ItemView {
  const stripped = stripAnswerKeys(item as unknown as Record<string, unknown>);
  return {
    id: item.id,
    phase: item.phase,
    type: item.type,
    ...(typeof stripped.prompt === 'string' ? { prompt: stripped.prompt } : {}),
    ...(Array.isArray(stripped.options) ? { options: stripped.options as { label: string }[] } : {}),
    ...(Array.isArray(item.range) ? { range: item.range } : {}),
    ...(stripped.stim !== undefined ? { stim: stripped.stim as Record<string, unknown> } : {}),
    ...(item.media ? { media: item.media } : {})
  };
}
