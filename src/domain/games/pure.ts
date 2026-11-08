// pure.ts — موتور نمره‌دهی، گیت‌های انتشار و لینت لحن — بدون وابستگی به DB و رابط (§۸)
// همهٔ فرمول‌ها همین‌جاست تا با نمونهٔ طلایی آزمون شوند؛ سرویس فقط آن‌ها را صدا می‌زند.
import type { ItemView, MissionConfig, MissionItem, PackageBody, SessionValidity } from './types';
import { GAME_KINDS } from './registry';
import { PROTOCOL_VERSION, isProtocolVersionSupported } from './protocol';

// ─── ثابت‌های قاعده (بازبین بالینی فهرست‌ها را تأیید و در همین‌جا نگه می‌دارد) ───

/** چهار قاعدهٔ پایهٔ لحن که هر بسته باید داشته باشد (§۴) */
export const TONE_RULES_BASE = ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'] as const;

  /**
   * کف اعتبار زمان واکنش بر اساس نوع بازی (§۸) — مقدار هر نوع تک‌منبعش رجیستری
   * (G4الف/رفع P3-4) است؛ کلید این جدول نوع آیتم است نه kind، و «choice» (فلش‌کارت)
   * خودش نوع‌بازی نیست — به همین دلیل این‌جا کنار نقشه می‌ماند.
   */
export const DEFAULT_RT_FLOOR_MS: Record<MissionItem['type'], number> = {
  touch_report: GAME_KINDS.gonogo.rt_floor_ms, // گو/نوگو — زیر ۱۵۰ حدس است
  numline: GAME_KINDS.numline.rt_floor_ms,     // خط عددی کف ندارد
  choice: 200,       // فلش‌کارت/انتخاب — لمس تصادفی حذف می‌شود
  scan: GAME_KINDS.scan.rt_floor_ms,         // حملهٔ جاسوس‌ها — کف نخستین لمس موج؛ زیر آن حدس است
  stroop: GAME_KINDS.stroop.rt_floor_ms,       // حقه‌باز رنگ‌ها — لمس تصادفی حذف می‌شود (۱.۲۵.۳۲)
  flanker: GAME_KINDS.flanker.rt_floor_ms,      // گلهٔ فریبکار — لمس تصادفی حذف می‌شود (۱.۲۵.۳۲)
  trail: GAME_KINDS.trail.rt_floor_ms        // رد پای دزد — کف نخستین لمس رد؛ زیر آن حدس است (۱.۲۵.۳۲)
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
  /** آیتم گو بود؟ (فقط touch_report) — مبنای جمع‌های گو/نوگو و فرمول‌های درصدی (فاز ۱ بازطراحی) */
  isGo?: boolean;
  /** پاسخ زودتر از محرک (لمس حین ISI) — فاز ۳ موتور پر می‌کند؛ سرور فقط حامل است */
  premature?: boolean;
  /** حملهٔ جاسوس‌ها (۱.۲۵.۳۰) — گرفتن هم‌نوع (خطای کمسیون موج) */
  scanFalse?: number;
  /** جاسوس جامانده (اُمیشن موج) */
  scanMissed?: number;
  /** شمار هم‌نوع‌ها (مخرج fa_pct) */
  scanDistractors?: number;
  /** شمار جاسوس‌های موج (مخرج miss_pct) */
  scanSpies?: number;
  /** پنجرهٔ پاسخ بدون لمس بسته شد — انتخاب زمان‌دار (استروپ/فلانکر ۱.۲۵.۳۲)؛ اُمیشن سمت سرور */
  timedOut?: boolean;
  /** محرک هم‌خوان (استروپ: واژه=جوهر · فلانکر: بدون فریب) — مبنای سنجهٔ تداخل */
  congruent?: boolean;
  /** رد پای دزد — طول پیش‌ماند صحیح و طول کل رد (۱.۲۵.۳۲) */
  trailNodes?: number;
  trailNodesTotal?: number;
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
  let isGo: boolean | undefined;
  let scanFalse: number | undefined;
  let scanMissed: number | undefined;
  let scanDistractors: number | undefined;
  let scanSpies: number | undefined;
  let timedOut: boolean | undefined;
  let congruent: boolean | undefined;
  let trailNodes: number | undefined;
  let trailNodesTotal: number | undefined;

  if (item.type === 'choice') {
    correct = typeof res.option === 'number' && res.option === item.correct;
  } else if (item.type === 'numline') {
    const chosen = typeof res.chosen === 'number' ? res.chosen : null;
    if (chosen !== null && typeof item.correct === 'number' && item.range) {
      // آستانهٔ پذیرش سن‌محور (۱.۲۵.۲۸) — پیش‌فرض ۰٫۵ = لمس صحیح همان عدد (سازگار با رفتار قبلی)؛
      // گستره‌های بزرگ‌تر آستانهٔ خود را می‌برند تا دقت انگشت‌نگاری کودک جریمه نشود
      const tol = typeof item.tolerance === 'number' && Number.isFinite(item.tolerance) && item.tolerance >= 0
        ? item.tolerance
        : 0.5;
      correct = Math.abs(chosen - item.correct) <= tol;
      errorPct = numlineErrorPct(chosen, item.correct, item.range);
    }
  } else if (item.type === 'stroop' || item.type === 'flanker') {
    // انتخاب زمان‌دار (۱.۲۵.۳۲) — استروپ/فلانکر: پنجرهٔ پاسخ از خود آیتم؛ بی‌لمس = اُمیشن،
    // کمسیون نداریم (پاسخ به گزینهٔ نادرست در accuracy خلاصه می‌شود، مثل choice)
    const opt = typeof res.option === 'number' && Number.isInteger(res.option) ? res.option : null;
    correct = opt !== null && opt === item.correct;
    omission = opt === null;
    timedOut = opt === null;
    congruent = item.stim?.congruent === true || item.stim?.cond === 'congruent';
  } else if (item.type === 'trail') {
    // رد پای دزد (۱.۲۵.۳۲) — ترتیب دقیق گره‌ها؛ طول پیش‌ماند صحیح برای سنجهٔ درصدی رد
    const key = Array.isArray(item.correct) ? item.correct.filter((n) => Number.isInteger(n) && n >= 0) : [];
    const rawOrder = Array.isArray(res.order) ? res.order : [];
    // تکرار گره بی‌معناست؛ ترتیب حفظ می‌شود (نخستین ورود هر اندیس)
    const seen = new Set<string>();
    const orderSeq: number[] = [];
    for (const v of rawOrder.filter((n) => Number.isInteger(n) && n >= 0)) {
      const k = String(v);
      if (!seen.has(k)) { seen.add(k); orderSeq.push(v); }
    }
    let prefix = 0;
    while (prefix < orderSeq.length && prefix < key.length && orderSeq[prefix] === key[prefix]) prefix++;
    correct = key.length === orderSeq.length && orderSeq.every((v, i) => v === key[i]);
    trailNodes = prefix;
    trailNodesTotal = key.length;
  } else if (item.type === 'touch_report') {
    const touched = res.touched === true;
    const want = item.correct_touch === true; // هدف واقعی (go)
    correct = touched === want;
    // commission = لمس غیرهدف؛ omission = نلمس‌کردن هدف
    commission = !want && touched;
    omission = want && !touched;
    isGo = want;
  } else if (item.type === 'scan') {
    // حملهٔ جاسوس‌ها (۱.۲۵.۳۰) — دقیقاً همان مجموعهٔ جاسوس‌ها؛ ترتیب/تکرار لمس بی‌اثر،
    // گرفتن هم‌نوع یا جاانداختن جاسوس = موج نادرست. کلید فقط سرور می‌داند.
    const key = Array.isArray(item.correct) ? item.correct.filter((n) => Number.isInteger(n) && n >= 0) : [];
    const rawHits = Array.isArray(res.hits) ? res.hits : [];
    const hits = [...new Set(rawHits.filter((n) => Number.isInteger(n) && n >= 0))];
    const keySet = new Set(key);
    const hitSet = new Set(hits);
    correct = key.length === hits.length && hits.every((h) => keySet.has(h));
    const falseHits = hits.filter((h) => !keySet.has(h)).length;
    const missed = key.filter((k) => !hitSet.has(k)).length;
    const tiles = tilesCountOf(item);
    scanFalse = falseHits;
    scanMissed = missed;
    scanDistractors = Math.max(0, tiles - key.length);
    scanSpies = key.length;
  }

  return {
    itemId: item.id,
    phase: item.phase,
    correct,
    rtMs: rt,
    rtValid,
    ...(errorPct !== undefined ? { numlineErrorPct: errorPct } : {}),
    commission,
    omission,
    ...(isGo !== undefined ? { isGo } : {}),
    ...(scanFalse !== undefined ? { scanFalse, scanMissed: scanMissed, scanDistractors: scanDistractors, scanSpies: scanSpies } : {}),
    ...(timedOut !== undefined ? { timedOut } : {}),
    ...(congruent !== undefined ? { congruent } : {}),
    ...(trailNodes !== undefined ? { trailNodes, trailNodesTotal: trailNodesTotal ?? 0 } : {})
  };
}

/** شمار خانه‌های موج scan از خود stim — ستون×ردیف؛ ناسالم = صفر (مخرج بی‌دامنه می‌ماند) */
export function tilesCountOf(item: MissionItem): number {
  const s = (item.stim ?? {}) as Record<string, unknown>;
  const cols = typeof s.cols === 'number' && Number.isInteger(s.cols) && s.cols > 0 ? s.cols : 0;
  const rows = typeof s.rows === 'number' && Number.isInteger(s.rows) && s.rows > 0 ? s.rows : 0;
  return cols * rows;
}

// ─── برچسب فارسی محرک برای راهنمای شروع بازی کودک (M2) ───
// کلیدهای انگلیسی بستهٔ محتوا به فارسی نمایشی می‌رسند؛ مقدار فارسی از خودش عبور می‌کند.

const FA_COLOR_KEYS: Record<string, string> = {
  yellow: 'زرد', blue: 'آبی', red: 'قرمز', green: 'سبز', orange: 'نارنجی', purple: 'بنفش',
  زرد: 'زرد', آبی: 'آبی', قرمز: 'قرمز', سبز: 'سبز', نارنجی: 'نارنجی', بنفش: 'بنفش'
};

const FA_SHAPE_KEYS: Record<string, string> = {
  star: 'ستاره', circle: 'دایره', square: 'مربع', fish: 'ماهی', crab: 'خرچنگ', boat: 'قایق',
  balloon: 'بادکنک', heart: 'قلب', flower: 'گل', cat: 'گربه',
  butterfly: 'پروانه', cloud: 'ابر', rocket: 'موشک', ufo: 'بشقاب‌پرنده',
  ستاره: 'ستاره', دایره: 'دایره', مربع: 'مربع', ماهی: 'ماهی'
};

function faKeyOf(map: Record<string, string>, raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') return '';
  const v = raw.trim();
  if (map[v]) return map[v];
  return /[\u0600-\u06FF]/.test(v) ? v : ''; // کلید ناشناختهٔ لاتین نمایش داده نمی‌شود
}

/** برچسب نمایشی محرک («ستاره زرد») — فقط توصیف ظاهری، هیچ نشانی از درستی ندارد */
export function stimLabelOf(stim: Record<string, unknown> | null | undefined): string {
  if (!stim) return 'هدف';
  const shape = faKeyOf(FA_SHAPE_KEYS, stim.shape);
  const color = faKeyOf(FA_COLOR_KEYS, stim.color);
  const label = [shape, color].filter(Boolean).join(' ').trim();
  return label || 'هدف';
}

/** پاسخ درست به شکل نمایشی برای بازخورد آموزشی — هرگز در پروب استفاده نمی‌شود */
export function answerDisplayOf(item: MissionItem): string | null {
  if (item.type === 'choice') {
    return typeof item.correct === 'number' ? (optionLabelAt(item.options, item.correct) ?? null) : null;
  }
  if (item.type === 'numline') return typeof item.correct === 'number' ? String(item.correct) : null;
  if (item.type === 'stroop') {
    // برچسب فارسی رنگ جوهر — گزینهٔ درست؛ بانک گزینه‌ها رشتهٔ رنگ لاتین است
    if (typeof item.correct !== 'number') return null;
    const key = optionLabelAt(item.options, item.correct);
    return key ? (faKeyOf(FA_COLOR_KEYS, key) || String(key)) : null;
  }
  if (item.type === 'flanker') {
    return item.correct === 0 ? 'چپ' : item.correct === 1 ? 'راست' : null;
  }
  if (item.type === 'trail') {
    // CSV اندیس‌های ترتیب درست — مثل جاسوس‌های جاماندهٔ scan؛ فقط تمرین
    return Array.isArray(item.correct) ? item.correct.filter((n) => Number.isInteger(n) && n >= 0).join(',') : null;
  }
  return null; // touch_report: بازپخش محرک، نه نمایش پاسخ؛ scan: CSV جاسوس‌های جامانده در scanMissedCsv
}

/** برچسب گزینهٔ i — بانک گزینه یا رشته یا شئ label‌دار؛ ناسالم = null */
function optionLabelAt(options: MissionItem['options'], i: number): string | null {
  if (!Array.isArray(options) || i < 0 || i >= options.length) return null;
  const o = options[i] as unknown;
  if (typeof o === 'string') return o;
  if (o && typeof o === 'object' && typeof (o as { label?: unknown }).label === 'string') {
    return (o as { label: string }).label;
  }
  return null;
}

// ─── بازخورد خط عددی (۱.۲۵.۲۸) — دو سطح موفقیت برای حس ادیکتو بدون رقارت:
//   · لمس دقیقاً همان عدد → تحسین دقیق
//   · درون آستانه ولی نه همان عدد → «خیلی نزدیک بود» — کنجکاوی بماند، سرزنش ممنوع
//   · بیرون آستانه → متن پیش‌فرض §۲ (بی‌سرزنش)؛ جای درست با نشانگر آموزش داده می‌شود

export const NUMLINE_FB_EXACT = 'دقیقاً همان‌جا! آفرین.';
export const NUMLINE_FB_NEAR = 'خیلی نزدیک بود! گرفتی.';

/** پیام بازخورد خط عددی — فقط برای پاسخ درست؛ نادرست = null (سرور متن پیش‌فرض §۲ می‌گذارد) */
export function numlineFeedbackOf(item: MissionItem, correct: boolean, response: unknown): string | null {
  if (item.type !== 'numline' || !correct) return null;
  const chosen = (response ?? {}) === Object(response)
    ? (response as Record<string, unknown>).chosen
    : null;
  if (typeof chosen === 'number' && typeof item.correct === 'number' && chosen === item.correct) {
    return NUMLINE_FB_EXACT;
  }
  return NUMLINE_FB_NEAR;
}

// ─── بازخورد حملهٔ جاسوس‌ها (۱.۲۵.۳۰) — حس عدی در دشمن است، نه در گفتار با کودک (§۲):
//   · موج کامل → تحسین دقیق بی‌رقارت
//   · موج ناقص → متن آرام + نشان‌گذاری جاسوس‌های جامانده (آموزش پس از پاسخ)
//   · هیچ سرزنش/فشاری — دشمن فقط قصهٔ صحنه است

export const SCAN_FB_ALL = 'همهٔ جاسوس‌ها را گرفتی! چشم‌هایت تیز بود.';

/** CSV جاسوس‌های جامانده برای نشان حقیقت کلاینت — فقط برای موج نادرست آموزشی؛ رقم‌های لاتین با کاما */
export function scanMissedCsv(item: MissionItem, response: unknown): string | null {
  if (item.type !== 'scan' || !Array.isArray(item.correct)) return null;
  const rawHits = (response ?? {}) === Object(response)
    ? (response as Record<string, unknown>).hits
    : null;
  const hits = new Set(Array.isArray(rawHits) ? rawHits.filter((n) => Number.isInteger(n) && n >= 0) : []);
  const missed = item.correct.filter((k) => !hits.has(k));
  return missed.length > 0 ? missed.join(',') : null;
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

// ─── فرمول‌های حملهٔ جاسوس‌ها (۱.۲۵.۳۰) — دامنه از خود موج: fa روی هم‌نوع‌ها، miss روی جاسوس‌ها ───

export function scanFaPctOf(scored: ScoredAttempt[]): number | null {
  const denom = scored.reduce((a, s) => a + (typeof s.scanDistractors === 'number' ? s.scanDistractors : 0), 0);
  if (denom <= 0) return null;
  const fa = scored.reduce((a, s) => a + (typeof s.scanFalse === 'number' ? s.scanFalse : 0), 0);
  return round2((fa / denom) * 100);
}

export function scanMissPctOf(scored: ScoredAttempt[]): number | null {
  const denom = scored.reduce((a, s) => a + (typeof s.scanSpies === 'number' ? s.scanSpies : 0), 0);
  if (denom <= 0) return null;
  const miss = scored.reduce((a, s) => a + (typeof s.scanMissed === 'number' ? s.scanMissed : 0), 0);
  return round2((miss / denom) * 100);
}

// ─── فرمول‌های انتخاب زمان‌دار و رد دنباله‌ای (۱.۲۵.۳۲) — قاعدهٔ دامنهٔ صفر عیناً ───
// دقت شرطی هم‌خوان/ناهم‌خوان و هزینهٔ تداخل (میانهٔ ناهم‌خوان − میانهٔ هم‌خوان، ms)؛
// هزینه فقط وقتی هر دو سمت ≥۲ RT معتبر دارند تعریف می‌شود — وگرنه null (صادقانه)

function congruentSubset(scored: ScoredAttempt[], congruent: boolean): ScoredAttempt[] {
  return scored.filter((s) => s.congruent === congruent);
}

export function congruentAccPctOf(scored: ScoredAttempt[]): number | null {
  const sub = congruentSubset(scored, true);
  if (sub.length === 0) return null;
  return accuracyOf(sub);
}

export function incongruentAccPctOf(scored: ScoredAttempt[]): number | null {
  const sub = congruentSubset(scored, false);
  if (sub.length === 0) return null;
  return accuracyOf(sub);
}

export function interferenceMsOf(scored: ScoredAttempt[]): number | null {
  const okRt = (list: ScoredAttempt[]) => list
    .filter((s) => s.correct && s.rtValid && typeof s.rtMs === 'number' && (s.rtMs as number) >= 0)
    .map((s) => s.rtMs as number);
  const cong = okRt(congruentSubset(scored, true));
  const inc = okRt(congruentSubset(scored, false));
  if (cong.length < 2 || inc.length < 2) return null;
  const congMed = medianRtOf(congruentSubset(scored, true));
  const incMed = medianRtOf(congruentSubset(scored, false));
  if (congMed === null || incMed === null) return null;
  return round2(incMed - congMed);
}

export function trailPrefixPctOf(scored: ScoredAttempt[]): number | null {
  const rows = scored.filter((s) => typeof s.trailNodes === 'number' && typeof s.trailNodesTotal === 'number' && (s.trailNodesTotal as number) > 0);
  if (rows.length === 0) return null;
  const nodes = rows.reduce((a, s) => a + (s.trailNodes as number), 0);
  const total = rows.reduce((a, s) => a + (s.trailNodesTotal as number), 0);
  if (total <= 0) return null;
  return round2((nodes / total) * 100);
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

// ─── فرمول‌های درصدی گو/نوگو (فاز ۱ بازطراحی) — قاعدهٔ دامنهٔ صفر: مخرج صفر = null، نه صفرِ ساختگی ───
// دفترچهٔ وظیفه §۵: Commission% = CE/کل نوگو×۱۰۰ · Omission% = OE/کل گو×۱۰۰ ·
// Correct Go% = گوهای درست/کل گو×۱۰۰ · Correct NoGo% (بازداری درست) = بازداری‌های درست/کل نوگو×۱۰۰
// تعریف‌های شمارشیِ موجود دست نمی‌خورند — این‌ها افزوده‌اند.

function goNogoDenoms(scored: ScoredAttempt[]): { totalGo: number; totalNogo: number } {
  // آیتم‌های touch_report با isGo پر شده‌اند؛ آیتمِ غایبِ isGo به هیچ جمعی وارد نمی‌شود (صفرِ ساختگی ممنوع)
  let totalGo = 0;
  let totalNogo = 0;
  for (const s of scored) {
    if (s.isGo === true) totalGo++;
    else if (s.isGo === false) totalNogo++;
  }
  return { totalGo, totalNogo };
}

/** درصد گوهای درست — بدون دامنهٔ گو: null (دفترچهٔ وظیفه §۵: قاعدهٔ دامنهٔ صفر) */
export function correctGoPctOf(scored: ScoredAttempt[]): number | null {
  const { totalGo } = goNogoDenoms(scored);
  if (totalGo === 0) return null;
  const ok = scored.filter((s) => s.isGo === true && s.correct).length;
  return round2((ok / totalGo) * 100);
}

/** درصد بازداری درست (Correct NoGo%) — بدون دامنهٔ نوگو: null */
export function correctNogoPctOf(scored: ScoredAttempt[]): number | null {
  const { totalNogo } = goNogoDenoms(scored);
  if (totalNogo === 0) return null;
  const ok = scored.filter((s) => s.isGo === false && s.correct).length;
  return round2((ok / totalNogo) * 100);
}

/** Commission% — بدون محرک نوگو: null (تقسیم بر صفر ممنوع) */
export function commissionPctOf(scored: ScoredAttempt[]): number | null {
  const { totalNogo } = goNogoDenoms(scored);
  if (totalNogo === 0) return null;
  const ce = scored.filter((s) => s.commission).length;
  return round2((ce / totalNogo) * 100);
}

/** Omission% — بدون محرک گو: null */
export function omissionPctOf(scored: ScoredAttempt[]): number | null {
  const { totalGo } = goNogoDenoms(scored);
  if (totalGo === 0) return null;
  const oe = scored.filter((s) => s.omission).length;
  return round2((oe / totalGo) * 100);
}

/** فرمول ثبت‌شدهٔ سنجه → مقدار جلسه (ورودی فقط Attemptهای پروب معتبر) */
export function computeMetricValue(formula: string, scored: ScoredAttempt[]): number | null {
  switch (formula) {
    case 'accuracy': return accuracyOf(scored);
    case 'numline_error': return meanNumlineErrorOf(scored);
    case 'median_rt': return medianRtOf(scored);
    case 'commission': return commissionCountOf(scored);
    case 'omission': return omissionCountOf(scored);
    case 'correct_go_pct': return correctGoPctOf(scored);
    case 'correct_nogo_pct': return correctNogoPctOf(scored);
    case 'commission_pct': return commissionPctOf(scored);
    case 'omission_pct': return omissionPctOf(scored);
    case 'scan_fa': return scanFaPctOf(scored);
    case 'scan_miss': return scanMissPctOf(scored);
    case 'congruent_acc': return congruentAccPctOf(scored);
    case 'incongruent_acc': return incongruentAccPctOf(scored);
    case 'interference_ms': return interferenceMsOf(scored);
    case 'trail_prefix': return trailPrefixPctOf(scored);
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

  // ۶) حالت مستقل (فاز ۱ بازطراحی): ارزیابی بدون پروتکل نسخه‌دارِ هم‌نسخهٔ جاری انتشار نمی‌گیرد؛
  //    mode ناشناخته هم رد می‌شود. بسته‌های قدیمی بدون mode = training و بی‌گیتِ تازه.
  const mode = body.mode ?? 'training';
  if (mode !== 'training' && mode !== 'assessment') {
    errors.push({ rule: 'mode', message: `حالت «${String(mode)}» شناخته‌شده نیست — training یا assessment` });
  }
  if (mode === 'assessment') {
    const ref = body.protocol;
    if (!ref || typeof ref.id !== 'string' || ref.id.trim() === '') {
      errors.push({ rule: 'protocol', message: 'بستهٔ ارزیابی بدون ارجاع پروتکل — سنجه‌های ارزیابی قابل استناد نیستند' });
    } else if (typeof ref.version !== 'string' || !isProtocolVersionSupported(ref.version)) {
      errors.push({ rule: 'protocol', message: `نسخهٔ پروتکل ارزیابی با پروتکل جاری (${PROTOCOL_VERSION}) هم‌خوان نیست — بازسنجی غیرقابل‌تفسیر می‌شود` });
    }
    // ارزیابی = اجرای بی‌بازخورد: هیچ آیتم آموزشی حق ورود به بستهٔ ارزیابی ندارد (فاز ۳)
    for (const m of body.missions ?? []) {
      for (const it of m.items ?? []) {
        if (it.phase !== 'probe') {
          errors.push({ rule: 'assessment_items', message: `آیتم «${it.id}» در مأموریت ${m.id} فاز آموزشی دارد — بستهٔ ارزیابی فقط آیتم پروب می‌پذیرد` });
        }
      }
    }
  }

  // ۷) گیت جفت هم‌آوا در بستهٔ واجی — هر آیتم انتخابی (هر فازی) بازرسی می‌شود
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

// ─── پیش‌نمایش فقط-پرسنلی (۱.۲۵.۲۰) — نگاشت بی‌حالتِ موقعیت به آیتم؛ هم‌تراز انتخاب جلسهٔ واقعی ───

/** مأموریت پیش‌نمایش: نخستین مأموریت دارای آیتم لمسی، وگرنه نخستین مأموریت بسته */
export function previewMissionOf(body: PackageBody): MissionConfig | null {
  const ms = Array.isArray(body.missions) ? body.missions : [];
  return ms.find((m) => (m.items ?? []).some((it) => it.type === 'touch_report')) ?? ms[0] ?? null;
}

/**
 * موقعیت n از دنبالهٔ قطعی → آیتم همان جایگاه — بازتولید همان انتخاب جلسهٔ واقعی بدون هیچ حالت:
 * با دنبالهٔ seed-دار، دستهٔ g/n جایگاه n تعیین‌کننده است و «k-مین آیتم هم‌دسته در ترتیب authored»
 * برگزیده می‌شود — همان چیزی که «نخستین پاسخ‌ندادهٔ هم‌دسته» در جریان کودک می‌بُرد (بی‌حالت = قطعی).
 * بدون دنباله (بستهٔ بی‌پروتکل) = ترتیب authored عیناً.
 */
export function previewItemAt(
  mission: MissionConfig,
  seq: { trials: ReadonlyArray<{ kind: 'go' | 'nogo' }> } | null,
  position: number
): { item: MissionItem | null; progress: { done: number; total: number } } {
  const items = mission.items ?? [];
  const total = items.length;
  if (!Number.isInteger(position) || position < 0 || position >= total) {
    return { item: null, progress: { done: Math.max(0, position), total } };
  }
  if (seq && seq.trials.length > 0) {
    const idx = Math.min(position, seq.trials.length - 1);
    const kind = seq.trials[idx].kind;
    const touch = items.filter((it) => it.type === 'touch_report');
    let k = 0;
    for (let j = 0; j < idx; j++) if (seq.trials[j].kind === kind) k++;
    const candidates = touch.filter((it) => (it.correct_touch === true) === (kind === 'go'));
    const item = candidates[k] ?? touch[k] ?? items[position];
    return { item: item ?? null, progress: { done: position, total } };
  }
  return { item: items[position] ?? null, progress: { done: position, total } };
}
