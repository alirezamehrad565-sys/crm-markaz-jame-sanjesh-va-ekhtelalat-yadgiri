// registry.ts — رجیستری نوع-محور بازی‌ها (G4الف / ۱.۲۵.۳۹ — رفع P3-4 ممیزی M0)
// تک‌منبع هر مقدار per-kind: ملاک نمره‌دهی مرحله، آستانه‌های گذار/ستاره، اهرم‌های مرحله،
// کف RT و سنجه‌های موتورمحور. پیش از این این‌ها در switch/if زنجیره‌ایِ stages/service/evidence
// پراکنده بودند و افزودن هر بازی ≥۷ ماژول را لمس می‌کرد؛ حالا بازی تازه = یک ورودی همین نقشه +
// ماژول نمایش (KPI نقشهٔ راه: هر بازی ≤۱ روز پس از رجیستری). آستانه‌ها قرارداد {value, rationale, status}
// نقشهٔ مهاجرت §۴ را دارند و وضعیتشان صادقانه است — تا پیلوت مرکز همه proposed می‌مانند.
// این فایل خالص است و هیچ runtime-importی از همسایه‌ها ندارد (فقط type) تا وابستگی
// stages/pure/registry-extra → registry یک‌طرفه بماند و چرخهٔ ماژول ساخته نشود.
import type { AgeBandId, ParamStatus } from './protocol';
import type { StageDef, StageThresholds, StageOutcome } from './stages';
import type { MissionItem, RegistryMetric } from './types';

/** شناسهٔ نوع‌بازی — کلید رجیستری؛ افزودن بازی تازه از این اتحاد و یک ورودی نقشه آغاز می‌شود.
 *  «رد پای دزد» (trail) ۱۴۰۵/۰۸/۱۹ حذف شد — نقد سه‌گانه (سقف ۷ گره/آموزش کم/کارکرد کم‌بار)
 *  در docs/research/cognitive-games-critique.md؛ جایگاهش را «کولهٔ مرواریدها» (corsi) گرفت */
export type GameKind = 'gonogo' | 'numline' | 'scan' | 'stroop' | 'flanker' | 'nback' | 'corsi';

/** ترتیب قطعی نوع‌ها — flatten سنجه‌های موتور از همین ترتیب می‌گذرد تا ترتیب آرایه‌ها عیناً بماند؛
 *  ن‌پشت (۱.۲۵.۴۰) و کولهٔ مرواریدها (corsi) در انتها افزوده شدند تا ترتیب سنجه‌های نوع‌های قبلی دست‌نخورده بماند */
export const GAME_KIND_IDS = ['gonogo', 'numline', 'scan', 'stroop', 'flanker', 'nback', 'corsi'] as const satisfies readonly GameKind[];

/** پارامتر آستانه با قرارداد انتشار — مقدار + مبنا + وضعیت اعتبارسنجی صادقانه */
export interface KindThresholdParam {
  value: number;
  rationale: string;
  status: ParamStatus;
}

/** آستانهٔ اسکالر (بر دقت) — خط عددی/اسکن/استروپ/فلانکر/رد */
export interface ScalarKindThresholds {
  pass: KindThresholdParam;
  star2: KindThresholdParam;
  star3: KindThresholdParam;
}

/** آستانهٔ دوپایهٔ گو/نوگو — گذار و ستاره هر کدام روی هر دو دسته سنجیده می‌شود */
export interface GoNogoKindThresholds {
  pass: { go_pct: KindThresholdParam; nogo_pct: KindThresholdParam };
  star2: { go_pct: KindThresholdParam; nogo_pct: KindThresholdParam };
  star3: { go_pct: KindThresholdParam; nogo_pct: KindThresholdParam };
}

/** برش خلاصهٔ جلسه که ملاک گذار می‌خواند — همان قرارداد قبلی stageOutcomeFor */
export interface StageOutcomeSummary {
  pct: { correct_go: number | null; correct_nogo: number | null; accuracy: number | null };
}

/** ساختار آیتم که اهرم مرحله می‌خواند — فقط نمایش/انتخاب از بانک؛ نمره‌دهی روی آیتم authored است */
export interface StageItemProbe {
  range?: [number, number] | undefined;
  stim?: Record<string, unknown> | null | undefined;
}

/** یک ورودی رجیستری = هرچیزی که یک نوع‌بازی به سرور تحمیل می‌کند */
export interface GameKindEntry {
  /** آستانه‌های گذار/ستاره — قرارداد {value, rationale, status} */
  thresholds: ScalarKindThresholds | GoNogoKindThresholds;
  /** ملاک نمره‌دهی مرحله — گذار/ستاره از خلاصهٔ جلسه؛ قواعد نوع‌ها هرگز مخلوط نمی‌شوند */
  stageOutcome(summary: StageOutcomeSummary): StageOutcome;
  /** فهرست مرحله‌های مسیر — باند سنی فقط برای گونوگو دوگانه است؛ بقیه باند را نادیده می‌گیرند */
  stageList(band: AgeBandId): StageDef[];
  /** اهرم مرحله: کدام آیتم بانک authored در این مرحله مجاز است — گونوگو همهٔ آیتم‌ها */
  itemInStage(item: StageItemProbe, stageId: string | null | undefined): boolean;
  /** اهرم تندشدن موج (۱.۲۵.۳۲) — فقط اسکن دارد؛ فقط-نمایش، نه محرک و نه کلید */
  waveMsCapOf: ((itemWaveMs: number | null | undefined, stageId: string | null | undefined) => number | null) | null;
  /** «انتخاب زمان‌دار با اُمیشن سروری» — موتور شواهد فقط برای این نوع‌ها نشانهٔ بی‌پاسخی پنجره می‌سازد */
  timedChoice: boolean;
  /** کف اعتبار زمان واکنش (ms) §۸ — زیر این، RT از سنجه‌های زمانی حذف می‌شود */
  rtFloorMs: number;
  /** سنجه‌های موتورمحور این نوع — با نسخهٔ موتور می‌آیند و دستی upsert نمی‌شوند (CHECK دیتابیس می‌پذیرد اما کد اجازه نمی‌دهد) */
  engineMetrics: readonly RegistryMetric[];
}

const THRESH = (value: number, rationale: string): KindThresholdParam => ({ value, rationale, status: 'proposed' });

// ─── آستانه‌های گذار و ستاره — وضعیت proposed تا پیلوت مرکز (ممیزی §۵) ───

/** گونوگو — دوپایه: هم گو و هم نوگو باید آستانه را بگیرند */
const GONOGO_THRESHOLDS: GoNogoKindThresholds = {
  pass: {
    go_pct: THRESH(70, 'حداقل گوهای درست برای گذار — پیشنهاد کارشناس، تا پیلوت مرکز proposed'),
    nogo_pct: THRESH(60, 'بازداری سخت‌تر از رفتن است؛ کف پایین‌تر برای نوگو در گذار')
  },
  star2: {
    go_pct: THRESH(80, 'ستارهٔ دوم با گوِ مطمئن‌تر'),
    nogo_pct: THRESH(75, 'ستارهٔ دوم با بازداری مطمئن‌تر')
  },
  star3: {
    go_pct: THRESH(90, 'ستارهٔ سوم = تسلط تقریباً کامل روی گو'),
    nogo_pct: THRESH(85, 'ستارهٔ سوم = تسلط تقریباً کامل روی بازداری')
  }
};

const NUMLINE_THRESHOLDS: ScalarKindThresholds = {
  pass: THRESH(65, 'آستانهٔ گذار بر دقت جای عدد — آستانهٔ پذیرش سن‌محور خود آیتم‌هاست (tolerance authored)'),
  star2: THRESH(78, 'ستارهٔ دوم با دقت بالاتر'),
  star3: THRESH(88, 'ستارهٔ سوم = جای عدد تقریباً همیشه درست')
};

const SCAN_THRESHOLDS: ScalarKindThresholds = {
  pass: THRESH(65, 'آستانهٔ گذار بر دقت موج‌ها — موج کامل یعنی همهٔ جاسوس‌ها و فقط آن‌ها'),
  star2: THRESH(78, 'ستارهٔ دوم با موج‌های مطمئن‌تر'),
  star3: THRESH(88, 'ستارهٔ سوم = شکار تقریباً بی‌خطا')
};

/** آستانهٔ مشترک دو نوع تازهٔ ۱.۲۵.۳۲ — استروپ/فلانکر؛ ملاک گذار هر دو بر دقت است.
 *  (رد که در همین گروه بود ۱۴۰۵/۰۸/۱۹ حذف شد؛ کولهٔ مرواریدها آستانهٔ مستقل خودش را دارد) */
const ACCURACY_THRESHOLDS: ScalarKindThresholds = {
  pass: THRESH(65, 'آستانهٔ گذار بر دقت — همان قرارداد خط عددی/اسکن'),
  star2: THRESH(78, 'ستارهٔ دوم با دقت بالاتر'),
  star3: THRESH(88, 'ستارهٔ سوم = پاسخ تقریباً بی‌خطا')
};

/** آستانهٔ ن‌پشت (۱.۲۵.۴۰) — بر دقت؛ همان قرارداد دقت سایر نوع‌ها تا پیلوت مرکز.
 *  دشواریِ پرش n=1→n=2 خودش را در نردبان مرحله‌ها نشان می‌دهد، نه در آستانهٔ جدا */
const NBACK_THRESHOLDS: ScalarKindThresholds = {
  pass: THRESH(65, 'آستانهٔ گذار بر دقت هم‌سانی/تفکیک — همان قرارداد دقت سایر نوع‌ها؛ سخت‌گیری اضافه برای n=2 با پیلوت سنجیده می‌شود'),
  star2: THRESH(78, 'ستارهٔ دوم با دقت بالاتر'),
  star3: THRESH(88, 'ستارهٔ سوم = هم‌سانی تقریباً همیشه درست')
};

/** آستانهٔ کولهٔ مرواریدها (corsi — ۱۴۰۵/۰۸/۱۹) — بر دقت بازتولید کامل دنباله؛
 *  سقف طول دنباله اهرم مرحله است و آستانهٔ جداگانه تا پیلوت مرکز proposed می‌ماند */
const CORSI_THRESHOLDS: ScalarKindThresholds = {
  pass: THRESH(65, 'آستانهٔ گذار بر دقت بازتولید کامل دنباله — همان قرارداد دقت سایر نوع‌ها'),
  star2: THRESH(78, 'ستارهٔ دوم با دقت بالاتر'),
  star3: THRESH(88, 'ستارهٔ سوم = بازتولید تقریباً همیشه کامل')
};

// ─── عددیِ آستانه‌ها — رفتار نمره‌دهی فقط value را می‌خواند؛ شکل عددی عین قبلی است ───

function pairNumeric(t: GoNogoKindThresholds): StageThresholds {
  return {
    pass: { go_pct: t.pass.go_pct.value, nogo_pct: t.pass.nogo_pct.value },
    star2: { go_pct: t.star2.go_pct.value, nogo_pct: t.star2.nogo_pct.value },
    star3: { go_pct: t.star3.go_pct.value, nogo_pct: t.star3.nogo_pct.value }
  };
}

function scalarNumeric(t: ScalarKindThresholds): { pass: number; star2: number; star3: number } {
  return { pass: t.pass.value, star2: t.star2.value, star3: t.star3.value };
}

/** آستانه‌های گونوگو — شکل عددی همان قرارداد قبلی StageThresholds */
export const STAGE_THRESHOLDS: StageThresholds = pairNumeric(GONOGO_THRESHOLDS);
/** آستانه‌های خط عددی — بر دقت جای عدد (درصد) */
export const NUMLINE_STAGE_THRESHOLDS = scalarNumeric(NUMLINE_THRESHOLDS);
/** آستانه‌های اسکن — بر دقت موج‌ها (درصد) */
export const SCAN_STAGE_THRESHOLDS = scalarNumeric(SCAN_THRESHOLDS);
/** آستانهٔ مشترک استروپ/فلانکر — بر دقت (درصد) */
export const ACCURACY_STAGE_THRESHOLDS = scalarNumeric(ACCURACY_THRESHOLDS);
/** آستانه‌های ن‌پشت — بر دقت (درصد)؛ جدای استروپ/فلانکر تا مسیر تبدیل مستقل داشته باشد */
export const NBACK_STAGE_THRESHOLDS = scalarNumeric(NBACK_THRESHOLDS);
/** آستانه‌های کولهٔ مرواریدها — بر دقت بازتولید (درصد)؛ مستقل تا مسیر تبدیل خودش را داشته باشد */
export const CORSI_STAGE_THRESHOLDS = scalarNumeric(CORSI_THRESHOLDS);

function pctOk(v: number | null | undefined, min: number): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= min;
}

// ─── قواعد نمره‌دهی مرحله — هر نوع ملاک خودش را دارد؛ خروجی هر پنج تابع عین قبلی است
// (خدشهٔ رفتار ممنوع: ستاره ۳ بالاترین، جلسهٔ بی‌دادهٔ کامل = ۰ ستاره و عدم گذار) ───

/** نتیجهٔ مرحلهٔ گونوگو از درصدی‌های گو/نوگو */
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

/** نتیجهٔ مرحلهٔ خط عددی از دقت خلاصهٔ جلسه — همان قرارداد StageOutcome */
export function stageOutcomeNumline(accuracy: number | null | undefined): StageOutcome {
  const t = NUMLINE_STAGE_THRESHOLDS;
  if (!pctOk(accuracy, t.pass)) return { passed: false, stars: 0, thresholds: STAGE_THRESHOLDS };
  const stars: 1 | 2 | 3 = pctOk(accuracy, t.star3) ? 3 : pctOk(accuracy, t.star2) ? 2 : 1;
  return { passed: true, stars, thresholds: STAGE_THRESHOLDS };
}

/** نتیجهٔ مرحلهٔ اسکن از دقت موج‌های خلاصهٔ جلسه — همان قرارداد StageOutcome */
export function stageOutcomeScan(accuracy: number | null | undefined): StageOutcome {
  const t = SCAN_STAGE_THRESHOLDS;
  if (!pctOk(accuracy, t.pass)) return { passed: false, stars: 0, thresholds: STAGE_THRESHOLDS };
  const stars: 1 | 2 | 3 = pctOk(accuracy, t.star3) ? 3 : pctOk(accuracy, t.star2) ? 2 : 1;
  return { passed: true, stars, thresholds: STAGE_THRESHOLDS };
}

/** نتیجهٔ مرحلهٔ دو نوع تازه از دقت خلاصهٔ جلسه — همان قرارداد StageOutcome */
export function stageOutcomeAccuracyKind(accuracy: number | null | undefined): StageOutcome {
  const t = ACCURACY_STAGE_THRESHOLDS;
  if (!pctOk(accuracy, t.pass)) return { passed: false, stars: 0, thresholds: STAGE_THRESHOLDS };
  const stars: 1 | 2 | 3 = pctOk(accuracy, t.star3) ? 3 : pctOk(accuracy, t.star2) ? 2 : 1;
  return { passed: true, stars, thresholds: STAGE_THRESHOLDS };
}

/** نتیجهٔ مرحلهٔ ن‌پشت از دقت خلاصهٔ جلسه — آستانهٔ خودش؛ شکل عین قرارداد StageOutcome */
export function stageOutcomeNback(accuracy: number | null | undefined): StageOutcome {
  const t = NBACK_STAGE_THRESHOLDS;
  if (!pctOk(accuracy, t.pass)) return { passed: false, stars: 0, thresholds: STAGE_THRESHOLDS };
  const stars: 1 | 2 | 3 = pctOk(accuracy, t.star3) ? 3 : pctOk(accuracy, t.star2) ? 2 : 1;
  return { passed: true, stars, thresholds: STAGE_THRESHOLDS };
}

/** نتیجهٔ مرحلهٔ کولهٔ مرواریدها از دقت خلاصهٔ جلسه — آستانهٔ خودش؛ شکل عین قرارداد StageOutcome */
export function stageOutcomeCorsi(accuracy: number | null | undefined): StageOutcome {
  const t = CORSI_STAGE_THRESHOLDS;
  if (!pctOk(accuracy, t.pass)) return { passed: false, stars: 0, thresholds: STAGE_THRESHOLDS };
  const stars: 1 | 2 | 3 = pctOk(accuracy, t.star3) ? 3 : pctOk(accuracy, t.star2) ? 2 : 1;
  return { passed: true, stars, thresholds: STAGE_THRESHOLDS };
}

// ─── مرحله‌های مسیر تمرین ───
// گونوگو پارامتر زمان‌بندی را بازنویسی می‌کند (تنها نوعی که اهرمش زمان است)؛ بقیه
// اهرمشان «انتخاب آیتم از بانک authored» است — محرک و کلید هرگز بازنویسی نمی‌شود.

const GONOGO_STAGES_4_6: StageDef[] = [
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

const GONOGO_STAGES_7_12: StageDef[] = [
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

const GONOGO_STAGES_BY_BAND: Record<AgeBandId, StageDef[]> = { '4-6': GONOGO_STAGES_4_6, '7-12': GONOGO_STAGES_7_12 };

// پنج مرحلهٔ «جادهٔ عددها» (۱.۲۵.۲۸) — اهرم سختی = گسترهٔ جاده (NUMLINE_STAGE_MAX)
const NUMLINE_STAGES: StageDef[] = [
  {
    id: 's1', index: 1, title_fa: 'جادهٔ کوچک', goal_fa: 'عددهای ۰ تا ۱۰؛ آهسته و خوش‌حال.', difficulty: 1,
    overrides: {}
  },
  {
    id: 's2', index: 2, title_fa: 'جادهٔ شهر', goal_fa: 'حالا تا ۲۰ ادامه دارد؛ همان‌طور که یاد گرفتی.', difficulty: 2,
    overrides: {}
  },
  {
    id: 's3', index: 3, title_fa: 'جادهٔ بلند', goal_fa: 'جاده تا ۵۰ می‌رسد؛ چشم‌هایت تیز است.', difficulty: 3,
    overrides: {}
  },
  {
    id: 's4', index: 4, title_fa: 'جادهٔ بزرگ', goal_fa: 'جاده تا ۱۰۰! تو خیلی راه رفته‌ای.', difficulty: 4,
    overrides: {}
  },
  {
    id: 's5', index: 5, title_fa: 'جادهٔ قهرمان‌ها', goal_fa: 'همهٔ جاده‌ها با هم — تو آماده‌ای!', difficulty: 5,
    overrides: {}
  }
];

// پنج مرحلهٔ «حملهٔ جاسوس‌ها» (۱.۲۵.۳۰) — اهرم سختی = اندازهٔ موج (SCAN_STAGE_MAX_TILES)
const SWARM_STAGES: StageDef[] = [
  {
    id: 's1', index: 1, title_fa: 'کاوش شب اول', goal_fa: 'جاسوس‌ها کم‌اند؛ آهسته و خوش‌حال بگیرشان.', difficulty: 1,
    overrides: {}
  },
  {
    id: 's2', index: 2, title_fa: 'گشت دوم', goal_fa: 'موج بزرگ‌تر شده؛ همان قاعده، چشم‌های تیز.', difficulty: 2,
    overrides: {}
  },
  {
    id: 's3', index: 3, title_fa: 'رگبار سوم', goal_fa: 'اسکادران کامل آمده؛ آرام باش و دقیق بگیر.', difficulty: 3,
    overrides: {}
  },
  {
    id: 's4', index: 4, title_fa: 'حملهٔ بزرگ', goal_fa: 'همهٔ جاسوس‌های ۲ آنتن را بگیر؛ هم‌نوع‌ها را دست نزن.', difficulty: 4,
    overrides: {}
  },
  {
    id: 's5', index: 5, title_fa: 'دفاع قهرمان‌ها', goal_fa: 'همهٔ موج‌ها با هم — تو نگهبان سیاره‌ای!', difficulty: 5,
    overrides: {}
  }
];

// پنج مرحلهٔ «حقه‌باز رنگ‌ها» (۱.۲۵.۳۲) — اهرم سختی = آمیختهٔ هم‌خوان/ناهم‌خوان روی بانک
const STROOP_STAGES: StageDef[] = [
  {
    id: 's1', index: 1, title_fa: 'غار آرام', goal_fa: 'واژه‌ها هنوز رنگِ خودشان را دارند؛ با طمأنینه لمس کن.', difficulty: 1,
    overrides: {}
  },
  {
    id: 's2', index: 2, title_fa: 'رنگ‌ها قاطی می‌شوند', goal_fa: 'حقه‌باز شروع کرده؛ فقط به رنگِ جوهر نگاه کن.', difficulty: 2,
    overrides: {}
  },
  {
    id: 's3', index: 3, title_fa: 'حقهٔ تمام‌عیار', goal_fa: 'واژه‌ها همیشه دروغ می‌گویند؛ رنگِ واقعی را بگیر.', difficulty: 3,
    overrides: {}
  },
  {
    id: 's4', index: 4, title_fa: 'تلهٔ معنی واژه', goal_fa: 'چشم‌هایت تیز است؛ معنی واژه فریبت نمی‌دهد.', difficulty: 4,
    overrides: {}
  },
  {
    id: 's5', index: 5, title_fa: 'قهرمان رنگ‌ها', goal_fa: 'همهٔ حقه‌های غار با هم — تو آماده‌ای!', difficulty: 5,
    overrides: {}
  }
];

// پنج مرحلهٔ «گلهٔ فریبکار» (۱.۲۵.۳۲) — گرگ واقعی وسط گلهٔ قلابی
const FLANKER_STAGES: StageDef[] = [
  {
    id: 's1', index: 1, title_fa: 'گلهٔ آرام', goal_fa: 'همهٔ گرگ‌ها یک‌سو نگاه می‌کنند؛ آهسته و خوش‌حال.', difficulty: 1,
    overrides: {}
  },
  {
    id: 's2', index: 2, title_fa: 'گرگ‌های اضافه', goal_fa: 'گله شلوغ‌تر شده؛ فقط نگاه گرگِ وسط.', difficulty: 2,
    overrides: {}
  },
  {
    id: 's3', index: 3, title_fa: 'نگاه‌های فریبکار', goal_fa: 'برخی گرگ‌ها قلابی‌اند؛ سرشان به آن‌سو نگاه می‌کند.', difficulty: 3,
    overrides: {}
  },
  {
    id: 's4', index: 4, title_fa: 'گلهٔ فریبکار', goal_fa: 'همه به یک‌سو نگاه می‌کنند جز گرگِ واقعی؛ حواست کنار نره.', difficulty: 4,
    overrides: {}
  },
  {
    id: 's5', index: 5, title_fa: 'قهرمان دشت', goal_fa: 'همهٔ گله‌ها با هم — تو نگهبان دشتی!', difficulty: 5,
    overrides: {}
  }
];

// پنج مرحلهٔ «کولهٔ مرواریدها» (corsi — ۱۴۰۵/۰۸/۱۹) — اهرم سختی = سقف طول دنباله
// (الگوی CORSI_STAGE_MAX_LEN). تخت صدف ثابت است؛ فقط دنبالهٔ مرواریدها بلندتر می‌شود.
const CORSI_STAGES: StageDef[] = [
  {
    id: 's1', index: 1, title_fa: 'دو مروارید', goal_fa: 'دو صدف برق می‌زند؛ همان ترتیب را لمس کن.', difficulty: 1,
    overrides: {}
  },
  {
    id: 's2', index: 2, title_fa: 'سه مروارید', goal_fa: 'یک مروارید بیشتر شد؛ حواست به ترتیب باشد.', difficulty: 2,
    overrides: {}
  },
  {
    id: 's3', index: 3, title_fa: 'چهار مروارید', goal_fa: 'دنباله بلندتر شده؛ آهسته و خوش‌حال.', difficulty: 3,
    overrides: {}
  },
  {
    id: 's4', index: 4, title_fa: 'پنج مروارید', goal_fa: 'حافظه‌ات عمیق شد؛ مثل قبل ادامه بده.', difficulty: 4,
    overrides: {}
  },
  {
    id: 's5', index: 5, title_fa: 'قهرمان کوله', goal_fa: 'همهٔ دنباله‌ها با هم — تو حافظهٔ دریایی!', difficulty: 5,
    overrides: {}
  }
];

// پنج مرحلهٔ «آلبوم خرچنگ» (ن‌پشت — ۱.۲۵.۴۰) — اهرم سختی = پرش n (۱→۲) + ISI مرحله.
// نردبان دو باند سنی دارد (الگوی گونوگو): باند ۴–۶ ISI بلندتر برای رمزگذاری آرام‌تر.
// s1/s2 جریان n=1، s3/s4/s5 جریان n=2 — پرش n در s3 با ISI نرم‌تر فرود می‌آید.
const NBACK_STAGES_4_6: StageDef[] = [
  {
    id: 's1', index: 1, title_fa: 'آلبوم گرم', goal_fa: 'ماهی‌ها آهسته می‌آیند؛ عکسِ قدم قبل را یادت نگه دار.', difficulty: 1,
    overrides: { isi_min_ms: 2600, isi_max_ms: 3200, fixation_ms: 400 }
  },
  {
    id: 's2', index: 2, title_fa: 'عکس‌های تازه', goal_fa: 'همان بازی با تمرین بیشتر؛ حواست به قدم قبل باشد.', difficulty: 2,
    overrides: {} // پایهٔ پروتکل ن‌پشت — بدون بازنویسی
  },
  {
    id: 's3', index: 3, title_fa: 'دو قدم به عقب', goal_fa: 'حالا دو قدم به عقب نگاه کن؛ آهسته و خوش‌حال.', difficulty: 3,
    overrides: { isi_min_ms: 2800, isi_max_ms: 3400, fixation_ms: 400 } // فرود نرم پرش n=2
  },
  {
    id: 's4', index: 4, title_fa: 'حافظهٔ عمیق', goal_fa: 'دو قدم به عقب، مثل قبل؛ تو خوب یاد گرفتی.', difficulty: 4,
    overrides: {}
  },
  {
    id: 's5', index: 5, title_fa: 'قهرمان آلبوم', goal_fa: 'تندترین پلهٔ آلبوم! تو حافظهٔ دریایی.', difficulty: 5,
    overrides: { isi_min_ms: 1800, isi_max_ms: 2400, fixation_ms: 350 }
  }
];

const NBACK_STAGES_7_12: StageDef[] = [
  {
    id: 's1', index: 1, title_fa: 'آلبوم گرم', goal_fa: 'ماهی‌ها آهسته می‌آیند؛ عکسِ قدم قبل را یادت نگه دار.', difficulty: 1,
    overrides: { isi_min_ms: 2200, isi_max_ms: 2800, fixation_ms: 400 }
  },
  {
    id: 's2', index: 2, title_fa: 'عکس‌های تازه', goal_fa: 'همان بازی با تمرین بیشتر؛ حواست به قدم قبل باشد.', difficulty: 2,
    overrides: {}
  },
  {
    id: 's3', index: 3, title_fa: 'دو قدم به عقب', goal_fa: 'حالا دو قدم به عقب نگاه کن؛ آهسته و خوش‌حال.', difficulty: 3,
    overrides: { isi_min_ms: 2400, isi_max_ms: 3000, fixation_ms: 400 }
  },
  {
    id: 's4', index: 4, title_fa: 'حافظهٔ عمیق', goal_fa: 'دو قدم به عقب، مثل قبل؛ تو خوب یاد گرفتی.', difficulty: 4,
    overrides: {}
  },
  {
    id: 's5', index: 5, title_fa: 'قهرمان آلبوم', goal_fa: 'تندترین پلهٔ آلبوم! تو حافظهٔ دریایی.', difficulty: 5,
    overrides: { isi_min_ms: 1500, isi_max_ms: 2100, fixation_ms: 350 }
  }
];

const NBACK_STAGES_BY_BAND: Record<AgeBandId, StageDef[]> = { '4-6': NBACK_STAGES_4_6, '7-12': NBACK_STAGES_7_12 };

// ─── اهرم‌های مرحله (stage-levers) — فقط انتخاب از بانک authored؛ نمره‌دهی سرور روی
// آیتم authored می‌ماند. بی‌مرحله/مرحلهٔ ناشناخته = همهٔ آیتم‌ها (سازگاری با جلسه‌های بی‌مرحله) ───

/** سقف گسترهٔ جاده در هر مرحلهٔ خط عددی — null = همهٔ جاده‌ها (مرحلهٔ پایانی مرور بزرگ) */
export const NUMLINE_STAGE_MAX: Record<string, number | null> = {
  s1: 10,
  s2: 20,
  s3: 50,
  s4: 100,
  s5: null
};

/** پیش‌ماندهٔ آیتم خط عددی در مرحله — محرک authored هرگز بازنویسی نمی‌شود */
export function numlineItemInStage(
  item: { range?: [number, number] | undefined },
  stageId: string | null | undefined
): boolean {
  const max = typeof stageId === 'string' && stageId in NUMLINE_STAGE_MAX ? NUMLINE_STAGE_MAX[stageId] : null;
  if (max === null) return true;
  return Array.isArray(item.range) && item.range[1] <= max;
}

/** سقف شمار خانه‌های موج در هر مرحلهٔ اسکن — null = همهٔ موج‌ها (مرحلهٔ پایانی مرور بزرگ) */
export const SCAN_STAGE_MAX_TILES: Record<string, number | null> = {
  s1: 6,
  s2: 9,
  s3: 12,
  s4: 15,
  s5: null
};

/** پیش‌ماندهٔ آیتم اسکن در مرحله — امضای هدف (شمار آنتن) هرگز بازنویسی نمی‌شود (قاعدهٔ d2) */
export function scanItemInStage(
  item: { stim?: Record<string, unknown> | null | undefined },
  stageId: string | null | undefined
): boolean {
  const max = typeof stageId === 'string' && stageId in SCAN_STAGE_MAX_TILES ? SCAN_STAGE_MAX_TILES[stageId] : null;
  if (max === null) return true;
  const s = (item.stim ?? {}) as Record<string, unknown>;
  const cols = typeof s.cols === 'number' && Number.isInteger(s.cols) && s.cols > 0 ? s.cols : 0;
  const rows = typeof s.rows === 'number' && Number.isInteger(s.rows) && s.rows > 0 ? s.rows : 0;
  const tiles = cols * rows;
  return tiles > 0 && tiles <= max;
}

/** پنجرهٔ نمایش موج (ms) در هر مرحلهٔ اسکن — null = دست‌نخوردهٔ آیتم؛ فقط-نمایش، نه محرک و نه کلید */
export const SCAN_STAGE_WAVE_MS: Record<string, number | null> = {
  s1: 22000,
  s2: 19000,
  s3: 17000,
  s4: 15000,
  s5: 13000
};

/**
 * پنجرهٔ موج مرحله برای نمای کلاینت — کمینهٔ زمان authored و سقف مرحله.
 * بی‌مرحله/مرحلهٔ ناشناخته = null (عیناً آیتم authored). قاعده: زمان مرحله فقط اگر از
 * آیتم authored کوتاه‌تر یا برابر باشد — کودک همیشه حداقلِ زمان authored را دارد.
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

/** بانک مجاز هر مرحلهٔ استروپ — گروه‌های authored بانک (a=مرحلهٔ ۱ … d=مرحلهٔ ۴، p=پروب) */
export const STROOP_STAGE_BANDS: Record<string, string[] | null> = {
  s1: ['a'],
  s2: ['a', 'b'],
  s3: ['a', 'b', 'c'],
  s4: ['a', 'b', 'c', 'd'],
  s5: null // همهٔ بانک — مرور بزرگ
};

export function stroopItemInStage(
  item: { stim?: Record<string, unknown> | null | undefined },
  stageId: string | null | undefined
): boolean {
  const allowed = typeof stageId === 'string' && stageId in STROOP_STAGE_BANDS ? STROOP_STAGE_BANDS[stageId] : null;
  if (allowed === null) return true;
  const s = (item.stim ?? {}) as Record<string, unknown>;
  const band = typeof s.band === 'string' ? s.band : '';
  if (band === '') return true; // آیتم بی‌گروه (بانک قدیمی) — همیشه حاضر
  return allowed.includes(band);
}

/** شمار گرگ قلابی فلانکر — فلانکرهای مخالف مرکز؛ ناسالم = صفر */
function flankerIncongruentCountOf(item: { stim?: Record<string, unknown> | null | undefined }): number {
  const s = (item.stim ?? {}) as Record<string, unknown>;
  const arrows = Array.isArray(s.arrows) ? s.arrows.filter((v) => v === 'L' || v === 'R') : [];
  const mid = Math.floor(arrows.length / 2);
  const center = arrows[mid];
  if (center === undefined) return 0;
  return arrows.filter((a) => a !== center).length;
}

/** سقف شمار گرگ قلابی در هر مرحلهٔ فلانکر — null = همهٔ گله‌ها */
export const FLANKER_STAGE_MAX_DECOYS: Record<string, number | null> = {
  s1: 0,   // گلهٔ آرام — هیچ قلابی
  s2: 1,   // حداکثر یک قلابی
  s3: 3,   // نگاه‌های فریبکار
  s4: null, // گلهٔ فریبکار — همهٔ گله‌ها
  s5: null
};

/** بانک مجاز هر مرحلهٔ فلانکر — گروه‌های authored بانک؛ ناسالم = ساختاری (شمار قلابی‌ها) */
export const FLANKER_STAGE_BANDS: Record<string, string[] | null> = {
  s1: ['a'],
  s2: ['a', 'b'],
  s3: ['a', 'b', 'c'],
  s4: ['a', 'b', 'c', 'd'],
  s5: null
};

export function flankerItemInStage(
  item: { stim?: Record<string, unknown> | null | undefined },
  stageId: string | null | undefined
): boolean {
  const allowed = typeof stageId === 'string' && stageId in FLANKER_STAGE_BANDS ? FLANKER_STAGE_BANDS[stageId] : null;
  if (allowed === null) return true;
  const s = (item.stim ?? {}) as Record<string, unknown>;
  const band = typeof s.band === 'string' ? s.band : '';
  if (band !== '') return allowed.includes(band);
  // بانک بی‌گروه (سازگاری قدیمی) — قاعدهٔ ساختاری: شمار گرگ قلابی
  const max = typeof stageId === 'string' && stageId in FLANKER_STAGE_MAX_DECOYS ? FLANKER_STAGE_MAX_DECOYS[stageId] : null;
  if (max === null) return true;
  const decoys = flankerIncongruentCountOf(item);
  return decoys === 0 || decoys <= max;
}

/** سقف طول دنبالهٔ مروارید در هر مرحلهٔ کولهٔ مرواریدها — null = همهٔ دنباله‌ها */
export const CORSI_STAGE_MAX_LEN: Record<string, number | null> = {
  s1: 2,
  s2: 3,
  s3: 4,
  s4: 5,
  s5: null
};

/** بانک مجاز هر مرحلهٔ کولهٔ مرواریدها — گروه‌های authored بانک؛ ناسالم = ساختاری (طول دنباله) */
export const CORSI_STAGE_BANDS: Record<string, string[] | null> = {
  s1: ['a'],
  s2: ['a', 'b'],
  s3: ['a', 'b', 'c'],
  s4: ['a', 'b', 'c', 'd'],
  s5: null
};

/**
 * پیش‌ماندهٔ آیتم کولهٔ مرواریدها در مرحله — انتخاب از بانک بر طول دنبالهٔ authored.
 * کلید بازتولید = دنبالهٔ نمایش‌داده‌شدهٔ خود آیتم است (کودک آن را می‌بیند)؛ بنابراین
 * stim دنباله دارد و هیچ کلید مخفی‌ای در بانک نیست — ناسالم = قاعدهٔ ساختاری طول.
 */
export function corsiItemInStage(
  item: { stim?: Record<string, unknown> | null | undefined },
  stageId: string | null | undefined
): boolean {
  const allowed = typeof stageId === 'string' && stageId in CORSI_STAGE_BANDS ? CORSI_STAGE_BANDS[stageId] : null;
  if (allowed === null) return true;
  const s = (item.stim ?? {}) as Record<string, unknown>;
  const band = typeof s.band === 'string' ? s.band : '';
  if (band !== '') return allowed.includes(band);
  // بانک بی‌گروه (سازگاری) — قاعدهٔ ساختاری: طول دنباله
  const max = typeof stageId === 'string' && stageId in CORSI_STAGE_MAX_LEN ? CORSI_STAGE_MAX_LEN[stageId] : null;
  if (max === null) return true;
  const len = Array.isArray(s.sequence) ? s.sequence.length : 0;
  return len > 0 && len <= max;
}

/** سطح n مجاز هر مرحلهٔ ن‌پشت — اهرم مرحله همان پرش n است؛ null معنا ندارد (همهٔ مراحل سطح مشخص دارند) */
export const NBACK_STAGE_LEVELS: Record<string, number[]> = {
  s1: [1],
  s2: [1],
  s3: [2], // پرش n — دو قدم به عقب
  s4: [2],
  s5: [2]
};

/**
 * پیش‌ماندهٔ آیتم ن‌پشت در مرحله — انتخاب جریان authored بر سطح n آیتم.
 * جریان ن‌پشت هم‌بسته است (هم‌سانی هر آیتم به قدم قبل از خودش ارجاع دارد)؛ بی‌مرحله/
 * مرحلهٔ ناشناخته = همهٔ آیتم‌ها (قرارداد سازگاری سایر نوع‌ها) — بسته‌های ارزیابی ن‌پشت
 * تک‌جریان‌اند و این گیت در آن‌ها بی‌اثر است.
 */
export function nbackItemInStage(
  item: { stim?: Record<string, unknown> | null | undefined },
  stageId: string | null | undefined
): boolean {
  const levels = typeof stageId === 'string' && stageId in NBACK_STAGE_LEVELS ? NBACK_STAGE_LEVELS[stageId] : null;
  if (levels === null) return true;
  const s = (item.stim ?? {}) as Record<string, unknown>;
  const n = typeof s.n === 'number' && Number.isInteger(s.n) && s.n > 0 ? s.n : 0;
  return n > 0 && levels.includes(n);
}

// ─── سنجه‌های موتورمحور هر نوع — تعریف‌ها عیناً از registry-extra آمده؛ ترتیب داخل هر
// نوع همان ترتیب قبلی آرایهٔ ENGINE_METRICS است تا flatten هیچ چیزی را جابه‌جا نکند ───

const GONOGO_ENGINE_METRICS: readonly RegistryMetric[] = [
  { id: 'correct_go_pct_gonogo', title_fa: 'درصد گوهای درست', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'correct_go_pct' },
  { id: 'correct_nogo_pct_gonogo', title_fa: 'درصد بازداری درست نوگو', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'correct_nogo_pct' },
  { id: 'commission_pct_gonogo', title_fa: 'درصد خطای پاسخ به غیرهدف', unit: 'percent', higher_is_better: false, source: 'auto', formula: 'commission_pct' },
  { id: 'omission_pct_gonogo', title_fa: 'درصد از دست‌دادن هدف', unit: 'percent', higher_is_better: false, source: 'auto', formula: 'omission_pct' }
];

// حملهٔ جاسوس‌ها (۱.۲۵.۳۰) — دقت موج‌ها از فرمول 'accuracy' در DB می‌آید (accuracy_scan)
const SCAN_ENGINE_METRICS: readonly RegistryMetric[] = [
  { id: 'scan_fa_pct', title_fa: 'درصد گرفتن هم‌نوع در موج', unit: 'percent', higher_is_better: false, source: 'auto', formula: 'scan_fa' },
  { id: 'scan_miss_pct', title_fa: 'درصد جاانداختن جاسوس', unit: 'percent', higher_is_better: false, source: 'auto', formula: 'scan_miss' }
];

// سه بازی تازه (۱.۲۵.۳۲) — دقت شرطی و هزینهٔ تداخل استروپ/فلانکر + درصد پیش‌ماند رد
const STROOP_ENGINE_METRICS: readonly RegistryMetric[] = [
  { id: 'stroop_congruent_acc_pct', title_fa: 'دقت هم‌خوان استروپ (واژه و جوهر یکی)', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'congruent_acc' },
  { id: 'stroop_incongruent_acc_pct', title_fa: 'دقت ناهم‌خوان استروپ (حقهٔ جوهر)', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'incongruent_acc' },
  { id: 'stroop_interference_ms', title_fa: 'هزینهٔ تداخل استروپ (میانهٔ ناهم‌خوان − میانهٔ هم‌خوان)', unit: 'ms', higher_is_better: false, source: 'auto', formula: 'interference_ms' }
];

const FLANKER_ENGINE_METRICS: readonly RegistryMetric[] = [
  { id: 'flanker_congruent_acc_pct', title_fa: 'دقت گلهٔ هم‌سو (بدون فریب)', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'congruent_acc' },
  { id: 'flanker_incongruent_acc_pct', title_fa: 'دقت گلهٔ فریبکار (فلانکر مخالف)', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'incongruent_acc' },
  { id: 'flanker_interference_ms', title_fa: 'هزینهٔ تداخل فلانکر (میانهٔ ناهم‌خوان − میانهٔ هم‌خوان)', unit: 'ms', higher_is_better: false, source: 'auto', formula: 'interference_ms' }
];

// کولهٔ مرواریدها (corsi — ۱۴۰۵/۰۸/۱۹) — دقت بازتولید کامل + بلندترین دنبالهٔ درست (دامنه)
const CORSI_ENGINE_METRICS: readonly RegistryMetric[] = [
  { id: 'corsi_seq_acc_pct', title_fa: 'درصد بازتولید کامل دنبالهٔ مرواریدها', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'corsi_seq' },
  { id: 'corsi_span_max', title_fa: 'بلندترین دنبالهٔ درست این جلسه (دامنهٔ حافظهٔ فضایی)', unit: 'count', higher_is_better: true, source: 'auto', formula: 'corsi_span' }
];

// آلبوم خرچنگ (ن‌پشت — ۱.۲۵.۴۰) — دقت شرطی هم‌سانی/تفکیک + دو خطای مکمل؛
// همه با قاعدهٔ دامنهٔ صفر (مخرج صفر = null) مثل scan_fa/scan_miss
const NBACK_ENGINE_METRICS: readonly RegistryMetric[] = [
  { id: 'nback_match_pct', title_fa: 'درصد تشخیص هم‌سانی (ماهیِ همانِ قدم قبل)', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'nback_match' },
  { id: 'nback_nonmatch_pct', title_fa: 'درصد تفکیک درست (ماهیِ متفاوت)', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'nback_nonmatch' },
  { id: 'nback_false_alarm_pct', title_fa: 'درصد «همان است» روی ماهیِ متفاوت', unit: 'percent', higher_is_better: false, source: 'auto', formula: 'nback_false_alarm' },
  { id: 'nback_miss_pct', title_fa: 'درصد جاانداختن هم‌سانی', unit: 'percent', higher_is_better: false, source: 'auto', formula: 'nback_miss' }
];

// ─── نقشهٔ نوع‌محور — تک‌منبع؛ افزودن بازی تازه فقط یک ورودی این‌جا می‌خواهد ───

export const GAME_KINDS: Record<GameKind, GameKindEntry> = {
  gonogo: {
    thresholds: GONOGO_THRESHOLDS,
    stageOutcome: (summary) => stageOutcomeOf(summary.pct.correct_go, summary.pct.correct_nogo),
    stageList: (band) => GONOGO_STAGES_BY_BAND[band] ?? GONOGO_STAGES_BY_BAND['7-12'],
    itemInStage: () => true, // گونوگو و بی‌مرحله = همهٔ آیتم‌ها — اهرم مرحله‌اش زمان است نه بانک
    waveMsCapOf: null,
    timedChoice: false,
    rtFloorMs: 150, // گو/نوگو — زیر ۱۵۰ حدس است
    engineMetrics: GONOGO_ENGINE_METRICS
  },
  numline: {
    thresholds: NUMLINE_THRESHOLDS,
    stageOutcome: (summary) => stageOutcomeNumline(summary.pct.accuracy),
    stageList: () => NUMLINE_STAGES,
    itemInStage: numlineItemInStage,
    waveMsCapOf: null,
    timedChoice: false,
    rtFloorMs: 0, // خط عددی کف ندارد
    engineMetrics: [] // دقت جای عدد از فرمول 'accuracy' در DB می‌آید
  },
  scan: {
    thresholds: SCAN_THRESHOLDS,
    stageOutcome: (summary) => stageOutcomeScan(summary.pct.accuracy),
    stageList: () => SWARM_STAGES,
    itemInStage: scanItemInStage,
    waveMsCapOf: scanStageWaveMs, // اهرم تندشدن موج — فقط-نمایش (۱.۲۵.۳۲)
    timedChoice: false,
    rtFloorMs: 150, // کف نخستین لمس موج؛ زیر آن حدس است
    engineMetrics: SCAN_ENGINE_METRICS
  },
  stroop: {
    thresholds: ACCURACY_THRESHOLDS,
    stageOutcome: (summary) => stageOutcomeAccuracyKind(summary.pct.accuracy),
    stageList: () => STROOP_STAGES,
    itemInStage: stroopItemInStage,
    waveMsCapOf: null,
    timedChoice: true, // انتخاب زمان‌دار — بی‌لمس = اُمیشن سمت سرور
    rtFloorMs: 200, // لمس تصادفی حذف می‌شود (۱.۲۵.۳۲)
    engineMetrics: STROOP_ENGINE_METRICS
  },
  flanker: {
    thresholds: ACCURACY_THRESHOLDS,
    stageOutcome: (summary) => stageOutcomeAccuracyKind(summary.pct.accuracy),
    stageList: () => FLANKER_STAGES,
    itemInStage: flankerItemInStage,
    waveMsCapOf: null,
    timedChoice: true, // انتخاب زمان‌دار — بی‌لمس = اُمیشن سمت سرور
    rtFloorMs: 200, // لمس تصادفی حذف می‌شود (۱.۲۵.۳۲)
    engineMetrics: FLANKER_ENGINE_METRICS
  },
  nback: {
    thresholds: NBACK_THRESHOLDS,
    stageOutcome: (summary) => stageOutcomeNback(summary.pct.accuracy),
    stageList: (band) => NBACK_STAGES_BY_BAND[band] ?? NBACK_STAGES_BY_BAND['7-12'],
    itemInStage: nbackItemInStage,
    waveMsCapOf: null,
    timedChoice: true, // انتخاب زمان‌دار دوگزینه‌ای — بی‌لمس = اُمیشن سمت سرور
    rtFloorMs: 200, // لمس تصادفی حذف می‌شود — همان قرارداد انتخاب زمان‌دار
    engineMetrics: NBACK_ENGINE_METRICS
  },
  corsi: {
    thresholds: CORSI_THRESHOLDS,
    stageOutcome: (summary) => stageOutcomeCorsi(summary.pct.accuracy),
    stageList: () => CORSI_STAGES,
    itemInStage: corsiItemInStage,
    waveMsCapOf: null,
    timedChoice: false, // بازتولید دنباله مثل رد: پنجرهٔ authored آیتم؛ پیش‌ماند/نیمه‌کاره نمره می‌گیرد
    rtFloorMs: 150, // کف نخستین لمس بازتولید؛ زیر آن حدس است
    engineMetrics: CORSI_ENGINE_METRICS
  }
};

/**
 * نوع‌بازی از فیلد mission.game — ناشناخته/تهی = گونوگو (سازگاری با بسته‌های قدیمی).
 * رفتار عین زنجیرهٔ سه‌تایی قبلی است: فقط شش شناسهٔ شناخته‌شده عبور می‌کنند.
 */
export function gameKindOf(v: string | null | undefined): GameKind {
  return typeof v === 'string' && (GAME_KIND_IDS as readonly string[]).includes(v) ? (v as GameKind) : 'gonogo';
}

/** ورودی رجیستری از شناسه — مقدار بیرون اتحاد (نمی‌رسد، ولی گارد دفاعی) = گونوگو؛
 *  همان معنای defaultِ switchهای قبلی تا هیچ مسیری با ورود غیرمنتظره نسوزد */
export function kindEntryOf(kind: GameKind): GameKindEntry {
  return GAME_KINDS[kind] ?? GAME_KINDS.gonogo;
}

/** اهرم انتخاب آیتم هر مرحله برای نوع‌بازی — جایگزین زنجیره‌های if per-kind در سرویس */
export function itemInStageOf(kind: GameKind): (item: StageItemProbe, stageId: string | null | undefined) => boolean {
  return kindEntryOf(kind).itemInStage;
}

/** کف RT بر نوع آیتم — کف سمت سرور §۸؛ «choice» نوع قدیمی فلش‌کارت است و نوع‌بازی امروزی ندارد */
export const ITEM_TYPE_RT_FLOOR_MS: Record<MissionItem['type'], number> = {
  touch_report: GAME_KINDS.gonogo.rtFloorMs,
  numline: GAME_KINDS.numline.rtFloorMs,
  choice: 200, // فلش‌کارت/انتخاب — لمس تصادفی حذف می‌شود
  scan: GAME_KINDS.scan.rtFloorMs,
  stroop: GAME_KINDS.stroop.rtFloorMs,
  flanker: GAME_KINDS.flanker.rtFloorMs,
  nback: GAME_KINDS.nback.rtFloorMs,
  corsi: GAME_KINDS.corsi.rtFloorMs
};
