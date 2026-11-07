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

/** نسخهٔ قواعد مرحله‌ها — هر تغییر عددی در این فایل باید این نسخه را بامپ کند.
 *  ۱.۱.۰ (۱.۲۵.۲۸): قواعد خط عددی («جادهٔ عددها») افزوده شد — عددهای گو/نوگو دست‌نخورده.
 *  ۱.۲.۰ (۱.۲۵.۳۰): قواعد «حملهٔ جاسوس‌ها» (scan) افزوده شد — دو قاعدهٔ قبلی عیناً.
 *  ۱.۳.۰ (۱.۲۵.۳۲): قواعد سه بازی تازه (stroop/flanker/trail) افزوده شد + اهرم تندشدن موج
 *  اسکن (SCAN_STAGE_WAVE_MS — فقط نمایش، نه محرک) — سه قاعدهٔ قبلی عیناً. */
export const STAGE_RULES_VERSION = '1.3.0';

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

// ─── پنج مرحلهٔ «جادهٔ عددها» (۱.۲۵.۲۸) — خط عددی؛ اهرم سختی = گسترهٔ جاده (NUMLINE_STAGE_MAX) ───
// هر مرحله یک جادهٔ تازه است که کودک می‌بیند؛ بدون بازنویسی پارامتر زمان‌بندی —
// اهرم فقط انتخاب آیتم از بانک authored است؛ کلید پاسخ هرگز این‌جا نیست.

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

// ─── پنج مرحلهٔ «حملهٔ جاسوس‌ها» (۱.۲۵.۳۰) — نوع scan؛ حس عدی در قصهٔ صحنه، نه در گفتار با کودک ───
// اهرم سختی = اندازهٔ موج (شمار خانه‌ها) با پیش‌ماندهٔ scanItemInStage روی بانک authored؛
// امضای هدف (شمار آنتن) هرگز بازنویسی نمی‌شود — قاعدهٔ d2: تمرکز روی همان بعد حواس‌پرتی.

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

// ─── پنج مرحلهٔ «حقه‌باز رنگ‌ها» (۱.۲۵.۳۲) — نوع stroop؛ حس عدی در قصهٔ صحنه (حقه‌باز)، نه در گفتار ───
// اهرم سختی = آمیختهٔ هم‌خوان/ناهم‌خوان و پنجرهٔ پاسخ، همه authored روی بانک (STROOP_STAGE_BANDS
// فقط بانک هر مرحله را انتخاب می‌کند؛ محرک و کلید هرگز بازنویسی نمی‌شود).

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

// ─── پنج مرحلهٔ «گلهٔ فریبکار» (۱.۲۵.۳۲) — نوع flanker؛ گرگ واقعی وسط گلهٔ قلابی ───

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

// ─── پنج مرحلهٔ «رد پای دزد» (۱.۲۵.۳۲) — نوع trail؛ اهرم = طول رد و آمیختهٔ عدد/حرف ───

const TRAIL_STAGES: StageDef[] = [
  {
    id: 's1', index: 1, title_fa: 'رد کوتاه', goal_fa: 'ردپاها کم‌اند؛ به ترتیب شماره برو.', difficulty: 1,
    overrides: {}
  },
  {
    id: 's2', index: 2, title_fa: 'رد بلندتر', goal_fa: 'یک قدم بیشتر؛ رد را کامل کن.', difficulty: 2,
    overrides: {}
  },
  {
    id: 's3', index: 3, title_fa: 'رد بلند', goal_fa: 'ردپاها بیشتر شده‌اند؛ رد گم نشود.', difficulty: 3,
    overrides: {}
  },
  {
    id: 's4', index: 4, title_fa: 'رد گم‌شده', goal_fa: 'عدد و حرف یک‌درمیان شده؛ با دقت قدم بزن.', difficulty: 4,
    overrides: {}
  },
  {
    id: 's5', index: 5, title_fa: 'قهرمان رد', goal_fa: 'همهٔ ردها با هم — تو تعقیب‌کننده‌ای!', difficulty: 5,
    overrides: {}
  }
];

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

/** فهرست مرحله‌های هر نوع‌بازی — شناسه‌های s1..s5 در همهٔ نوع‌ها هم‌شکل‌اند */
function stageListOf(kind: GameKind, band: AgeBandId): StageDef[] {
  switch (kind) {
    case 'numline': return NUMLINE_STAGES;
    case 'scan': return SWARM_STAGES;
    case 'stroop': return STROOP_STAGES;
    case 'flanker': return FLANKER_STAGES;
    case 'trail': return TRAIL_STAGES;
    default: return STAGES[band] ?? STAGES['7-12'];
  }
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

/** نوع‌بازی از فیلد mission.game — ناشناخته = گونوگو (سازگاری با بسته‌های قدیمی) */
export type GameKind = 'gonogo' | 'numline' | 'scan' | 'stroop' | 'flanker' | 'trail';
export function gameKindOf(v: string | null | undefined): GameKind {
  return v === 'numline' ? 'numline'
    : v === 'scan' ? 'scan'
    : v === 'stroop' ? 'stroop'
    : v === 'flanker' ? 'flanker'
    : v === 'trail' ? 'trail'
    : 'gonogo';
}

/** آستانه‌های گذار و ستارهٔ خط عددی — بر دقت جای عدد (درصد)؛ وضعیت proposed تا پیلوت مرکز */
export const NUMLINE_STAGE_THRESHOLDS = {
  pass: 65,
  star2: 78,
  star3: 88
} as const;

/** نتیجهٔ مرحلهٔ خط عددی از دقت خلاصهٔ جلسه — همان قرارداد StageOutcome */
export function stageOutcomeNumline(accuracy: number | null | undefined): StageOutcome {
  const t = NUMLINE_STAGE_THRESHOLDS;
  if (!pctOk(accuracy, t.pass)) return { passed: false, stars: 0, thresholds: STAGE_THRESHOLDS };
  const stars: 1 | 2 | 3 = pctOk(accuracy, t.star3) ? 3 : pctOk(accuracy, t.star2) ? 2 : 1;
  return { passed: true, stars, thresholds: STAGE_THRESHOLDS };
}

/** نتیجهٔ مرحله از نوع‌بازی — هر نوع‌بازی ملاک خودش را دارد؛ قواعد هرگز مخلوط نمی‌شوند */
export function stageOutcomeFor(
  kind: GameKind,
  summary: { pct: { correct_go: number | null; correct_nogo: number | null; accuracy: number | null } }
): StageOutcome {
  return kind === 'numline'
    ? stageOutcomeNumline(summary.pct.accuracy)
    : kind === 'scan'
      ? stageOutcomeScan(summary.pct.accuracy)
      : kind === 'stroop' || kind === 'flanker' || kind === 'trail'
        ? stageOutcomeAccuracyKind(summary.pct.accuracy)
        : stageOutcomeOf(summary.pct.correct_go, summary.pct.correct_nogo);
}

/** سقف گسترهٔ جاده در هر مرحلهٔ خط عددی — null = همهٔ جاده‌ها (مرحلهٔ پایانی مرور بزرگ) */
export const NUMLINE_STAGE_MAX: Record<string, number | null> = {
  s1: 10,
  s2: 20,
  s3: 50,
  s4: 100,
  s5: null
};

/**
 * پیش‌ماندهٔ آیتم خط عددی در مرحله — فقط نمایش/انتخاب از بانک authored؛ نمره‌دهی سرور روی
 * آیتم authored است. بی‌مرحله/مرحلهٔ ناشناخته = همهٔ آیتم‌ها (سازگاری با جلسه‌های بی‌مرحله).
 */
export function numlineItemInStage(
  item: { range?: [number, number] | undefined },
  stageId: string | null | undefined
): boolean {
  const max = typeof stageId === 'string' && stageId in NUMLINE_STAGE_MAX ? NUMLINE_STAGE_MAX[stageId] : null;
  if (max === null) return true;
  return Array.isArray(item.range) && item.range[1] <= max;
}

// ─── مراحل «حملهٔ جاسوس‌ها» (۱.۲۵.۳۰) ───

/** آستانه‌های گذار و ستارهٔ اسکن — بر دقت موج‌ها (درصد)؛ وضعیت proposed تا پیلوت مرکز */
export const SCAN_STAGE_THRESHOLDS = {
  pass: 65,
  star2: 78,
  star3: 88
} as const;

/** نتیجهٔ مرحلهٔ اسکن از دقت موج‌های خلاصهٔ جلسه — همان قرارداد StageOutcome */
export function stageOutcomeScan(accuracy: number | null | undefined): StageOutcome {
  const t = SCAN_STAGE_THRESHOLDS;
  if (!pctOk(accuracy, t.pass)) return { passed: false, stars: 0, thresholds: STAGE_THRESHOLDS };
  const stars: 1 | 2 | 3 = pctOk(accuracy, t.star3) ? 3 : pctOk(accuracy, t.star2) ? 2 : 1;
  return { passed: true, stars, thresholds: STAGE_THRESHOLDS };
}

/** سقف شمار خانه‌های موج در هر مرحلهٔ اسکن — null = همهٔ موج‌ها (مرحلهٔ پایانی مرور بزرگ) */
export const SCAN_STAGE_MAX_TILES: Record<string, number | null> = {
  s1: 6,
  s2: 9,
  s3: 12,
  s4: 15,
  s5: null
};

/**
 * پیش‌ماندهٔ آیتم اسکن در مرحله — انتخاب از بانک authored؛ نمره‌دهی سرور روی آیتم authored است.
 * بی‌مرحله/مرحلهٔ ناشناخته = همهٔ آیتم‌ها (سازگاری با جلسه‌های بی‌مرحله).
 */
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

// ─── مراحل سه بازی تازه (۱.۲۵.۳۲) — استروپ/فلانکر/رد پای دزد ───
// ملاک گذار هر سه = دقت خلاصهٔ جلسه (درصد) — همان قرارداد خط عددی/اسکن؛
// آستانه‌ها مشترک و proposed تا پیلوت مرکز. اهرم سختی authored روی بانک است؛
// این‌جا فقط «انتخاب بانک هر مرحله» تعریف می‌شود — محرک/کلید هرگز بازنویسی نمی‌شود.

/** آستانهٔ گذار و ستارهٔ سه نوع تازه — بر دقت (درصد)؛ وضعیت proposed تا پیلوت مرکز */
export const ACCURACY_STAGE_THRESHOLDS = {
  pass: 65,
  star2: 78,
  star3: 88
} as const;

/** نتیجهٔ مرحلهٔ سه نوع تازه از دقت خلاصهٔ جلسه — همان قرارداد StageOutcome */
export function stageOutcomeAccuracyKind(accuracy: number | null | undefined): StageOutcome {
  const t = ACCURACY_STAGE_THRESHOLDS;
  if (!pctOk(accuracy, t.pass)) return { passed: false, stars: 0, thresholds: STAGE_THRESHOLDS };
  const stars: 1 | 2 | 3 = pctOk(accuracy, t.star3) ? 3 : pctOk(accuracy, t.star2) ? 2 : 1;
  return { passed: true, stars, thresholds: STAGE_THRESHOLDS };
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

/** سقف شمار ردپاها در هر مرحلهٔ رد پای دزد — null = همهٔ ردها */
export const TRAIL_STAGE_MAX_NODES: Record<string, number | null> = {
  s1: 4,
  s2: 5,
  s3: 6,
  s4: 7,
  s5: null
};

/** بانک مجاز هر مرحلهٔ رد — گروه‌های authored بانک؛ ناسالم = ساختاری (شمار ردپاها) */
export const TRAIL_STAGE_BANDS: Record<string, string[] | null> = {
  s1: ['a'],
  s2: ['a', 'b'],
  s3: ['a', 'b', 'c'],
  s4: ['a', 'b', 'c', 'd'],
  s5: null
};

export function trailItemInStage(
  item: { stim?: Record<string, unknown> | null | undefined },
  stageId: string | null | undefined
): boolean {
  const allowed = typeof stageId === 'string' && stageId in TRAIL_STAGE_BANDS ? TRAIL_STAGE_BANDS[stageId] : null;
  if (allowed === null) return true;
  const s = (item.stim ?? {}) as Record<string, unknown>;
  const band = typeof s.band === 'string' ? s.band : '';
  if (band !== '') return allowed.includes(band);
  // بانک بی‌گروه (سازگاری قدیمی) — قاعدهٔ ساختاری: شمار ردپاها
  const max = typeof stageId === 'string' && stageId in TRAIL_STAGE_MAX_NODES ? TRAIL_STAGE_MAX_NODES[stageId] : null;
  if (max === null) return true;
  const nodes = Array.isArray(s.nodes) ? s.nodes.length : 0;
  return nodes > 0 && nodes <= max;
}

// ─── اهرم تندشدن موج اسکن (۱.۲۵.۳۲) — فقط نمایش؛ نه محرک و نه کلید ───
// موج authored زمان خودش را دارد؛ مرحلهٔ فعال سقف آرام‌تری می‌گذارد تا پله‌ها واقعاً
// «تندتر» حس شوند. قاعده: زمان مرحله فقط اگر از آیتم authored کوتاه‌تر یا برابر باشد —
// هیچ‌گاه آیتم سریع‌تر از بانک نمی‌شود (کودک همیشه حداقلِ زمان authored را دارد).

/** پنجرهٔ نمایش موج (ms) در هر مرحلهٔ اسکن — null = دست‌نخوردهٔ آیتم */
export const SCAN_STAGE_WAVE_MS: Record<string, number | null> = {
  s1: 22000,
  s2: 19000,
  s3: 17000,
  s4: 15000,
  s5: 13000
};

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
