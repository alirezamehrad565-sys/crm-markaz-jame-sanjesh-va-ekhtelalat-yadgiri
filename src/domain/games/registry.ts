// registry.ts — رجیستری نوع-محور بازی‌ها (G4الف / رفع P3-4 / ۱.۲۵.۳۹)
// پیش از این، «چیستیِ هر نوع‌بازی» بین ≥۷ ماژول پخش شده بود (types/pure/scoring/stages/
// service/registry-extra/kind) و افزودن یک بازی یعنی لمس همهٔ آن‌ها — همان fan-out ممیزی M0.
// این فایل تک‌منبع نقشه است: برای هر kind قواعد گذار مرحله، آستانه‌ها، اهرم‌های مرحله،
// کف RT، سنجه‌های موتورمحور و پرچم‌های رفتاری در یک ورودی نشسته‌اند؛ بازی تازه فقط
// یک ورودی به GAME_KINDS اضافه می‌کند و مصرف‌کننده‌ها lookup یک‌خطی می‌خوانند.
//
// قواعد ثابت این بازآرایی:
//   · رفتار عیناً حفظ شده — هیچ عدد/ترتیب/پیامی عوض نشده؛ فقط محلِ تعریف تک‌منبع شد
//     (bundle-smoke و ۲۰۰۵ آزمون طلایی، محافظ برابری رفتار).
//   · ترتیب GAME_KIND_IDS قطعی است (ترتیب تولد نوع‌ها: ۱.۲۵.۰۷/۲۸/۳۰/۳۲) — ترتیب
//     آرایهٔ سنجه‌های موتور از همین ترتیب می‌آید و هرگز جابه‌جا نمی‌شود.
//   · همهٔ آستانه‌ها وضعیت صادقانهٔ «proposed» دارند تا پیلوت مرکز (G6) آن‌ها را
//     به validated برساند — هیچ عددی برچسب تأییدِ بی‌پیلوت نمی‌گیرد.
//   · سمت کلاینت دست نخورده — loadKind آن‌جا قابلیت‌محور است و سود رجیستری صفر،
//     ریسک گیت‌های ایستا.

import type { AgeBandId, ParamStatus } from './protocol';
import type { StageDef } from './stages';
import type { RegistryMetric } from './types';

// ─── شناسه‌های نوع — ترتیب قطعی؛ افزودن بازی تازه فقط این‌جا و یک ورودی نقشه ───

export const GAME_KIND_IDS = ['gonogo', 'numline', 'scan', 'stroop', 'flanker', 'trail'] as const;
export type GameKind = (typeof GAME_KIND_IDS)[number];

/** نوع‌بازی از فیلد mission.game — ناشناخته = گونوگو (سازگاری با بسته‌های قدیمی) */
export function gameKindOf(v: string | null | undefined): GameKind {
  return (GAME_KIND_IDS as readonly string[]).includes(v as string) ? (v as GameKind) : 'gonogo';
}

// ─── شکل‌های قرارداد رجیستری ───

/** ساختار آیتم که پیش‌ماندهٔ مرحله می‌خواند — آیتم کامل مأموریت ساختاری با آن سازگار است */
export interface StageItemLike {
  range?: [number, number] | undefined;
  stim?: Record<string, unknown> | null | undefined;
}

/** آستانه با وضعیت صادقانه — قرارداد §۴ نقشهٔ راه: هر عدد فقط با مبنا و وضعیت ثبت می‌شود */
export interface ThresholdParam {
  value: number;
  /** مبنا: چرا این مقدار؟ (ادعای علمی بی‌منبع ممنوع) */
  rationale: string;
  /** validated = پیلوت‌شدهٔ خود مرکز · pilot = در پیلوت · proposed = پیشنهاد کارشناس */
  status: ParamStatus;
}

/** قاعدهٔ گذار گونوگو — دو ملاک مستقل گو/نوگو (قواعد هرگز با دقت کلی مخلوط نمی‌شوند) */
export interface GoNogoStageRule {
  shape: 'go_nogo';
  pass: { go_pct: ThresholdParam; nogo_pct: ThresholdParam };
  star2: { go_pct: ThresholdParam; nogo_pct: ThresholdParam };
  star3: { go_pct: ThresholdParam; nogo_pct: ThresholdParam };
}

/** قاعدهٔ گذار دقت‌محور — بقیهٔ نوع‌ها بر دقت خلاصهٔ جلسه (درصد) */
export interface AccuracyStageRule {
  shape: 'accuracy';
  pass: ThresholdParam;
  star2: ThresholdParam;
  star3: ThresholdParam;
}

export type StageRule = GoNogoStageRule | AccuracyStageRule;

/** اهرم‌های مرحله — کلید جدول‌ها شناسهٔ مرحلهٔ s1..s5 است؛ null = همهٔ بانک (مرور بزرگ).
 *  اهرم فقط «انتخاب از بانک authored» یا «نمایش» است — محرک/کلید هرگز بازنویسی نمی‌شود. */
export interface KindLevers {
  /** سقف عددی بانک هر مرحله — مثل گسترهٔ جادهٔ خط عددی یا شمار خانه‌های موج اسکن */
  bank_caps?: Record<string, number | null>;
  /** گروه‌های مجاز بانک هر مرحله — بانک authored گروه‌دار (stim.band) */
  bank_bands?: Record<string, string[] | null>;
  /** اهرم فقط-نمایش — مثل پنجرهٔ موج اسکن؛ هرگز محرک آزمون و نه کلید */
  display?: Record<string, number | null>;
}

/** بدنهٔ مشترک ورودی نقشه برای هر نوع — بازی تازه فقط یک GameKindSpec تازه می‌سازد */
export interface GameKindSpecBase {
  /** کف اعتبار RT این نوع (ms) — زیر آن حدس است و از سنجه‌های زمانی حذف می‌شود (§۸) */
  rt_floor_ms: number;
  /** انتخاب زمان‌دار — بی‌پاسخی پنجره سمت سرور اُمیشن ثبت می‌شود و نشانهٔ «بی‌پاسخی
   *  پنجره» در شواهد فقط برای این گروه تعریف است؛ بقیهٔ نوع‌ها false */
  timed_choice: boolean;
  /** مرحله‌های مسیر تمرین — گونوگو باندسنی است (۴–۶ نرم‌تر از ۷–۱۲)؛ بقیه فهرست واحد */
  stageList: (band: AgeBandId) => StageDef[];
  /** اهرم‌های مرحله — گونوگو اهرمش بازنویسی پارامتر زمان‌بندی در خود StageDef است (جدول ندارد) */
  levers: KindLevers;
  /** پیش‌ماندهٔ آیتم در مرحله — بانک authored با سقف/گروهِ مرحله؛ بی‌مرحله/ناشناخته = همهٔ آیتم‌ها
   *  (سازگاری با جلسه‌های بی‌مرحله). نمره‌دهی سرور همیشه روی آیتم authored است. */
  itemInStage: (item: StageItemLike, stageId: string | null | undefined) => boolean;
  /** سنجه‌های موتورمحور این نوع — دستی upsert نمی‌شوند؛ ترتیب درون نوع عیناً حفظ است */
  engine_metrics: readonly RegistryMetric[];
}

/** ورودی نقشه با قاعدهٔ گذار نوع‌دقیق — گونوگو ملاک جفت گو/نوگو، بقیه دقت */
export type GameKindSpec<K extends GameKind = GameKind> = GameKindSpecBase & {
  /** قاعدهٔ گذار مرحله — شکل ملاک + آستانه‌های {value, rationale, status} */
  stage_rule: K extends 'gonogo' ? GoNogoStageRule : AccuracyStageRule;
};

const P = (value: number, rationale: string, status: ParamStatus = 'proposed'): ThresholdParam => ({
  value,
  rationale,
  status
});

// ─── آستانه‌های گذار و ستاره — وضعیت proposed تا پیلوت مرکز (G6) ───

/** گونوگو — درصدی‌های گو/نوگو (۱.۲۵.۲۲)؛ برای هر دو باند سنی مشترک */
const GONOGO_STAGE_RULE: GoNogoStageRule = {
  shape: 'go_nogo',
  pass: {
    go_pct: P(70, 'گذار با گوِ درست ≥۷۰٪ — بالای نرخ حدس در دنبالهٔ ۷۵٪ گو؛ پیشنهاد کارشناس ۱.۲۵.۲۲'),
    nogo_pct: P(60, 'گذار با بازداری ≥۶۰٪ — بازداری دشوارترین جزء است؛ آستانهٔ پائین‌تر از گو عمدی است')
  },
  star2: {
    go_pct: P(80, 'دوستاره — فاصلهٔ محسوس از گذار تا کودک پیشرفت را حس کند'),
    nogo_pct: P(75, 'دوستاره بازداری — هم‌گام با پلهٔ گو')
  },
  star3: {
    go_pct: P(90, 'سه‌ستاره — اجرای تقریباً بی‌خطا؛ سقف سبد ستاره'),
    nogo_pct: P(85, 'سه‌ستاره بازداری — بازداری عالی ولی بی‌کمال‌گراییِ کودک‌فرسا')
  }
};

/** آستانهٔ مشترک دقت — ۶۵/۷۸/۸۸ (۱.۲۵.۲۸ برای خط عددی؛ ۱.۲۵.۳۰ اسکن؛ ۱.۲۵.۳۲ سه‌تای تازه)
 *  عیناً همان عدد برای همهٔ دقت‌محورها تا مقایسهٔ بین‌بازی گول‌زننده نشود؛ جداسازی آینده
 *  نیازمند پیلوت است و با پیلوت تصمیم می‌گیرد، نه با کپی عدد. */
const ACCURACY_STAGE_RULE: AccuracyStageRule = {
  shape: 'accuracy',
  pass: P(65, 'گذار با دقت ≥۶۵٪ — بالای شانس حدس بانک فعلی؛ پیشنهاد کارشناس ۱.۲۵.۲۸'),
  star2: P(78, 'دوستاره — فاصلهٔ محسوس از گذار؛ پلهٔ انگیزشی میانی'),
  star3: P(88, 'سه‌ستاره — دقت تقریباً بی‌خطا؛ ارتقای آن با دادهٔ پیلوت مرکز')
};

// ─── مرحله‌های مسیر تمرین — پارامترها و متن‌ها عیناً از stages.ts پیشین (۱.۲۵.۲۲..۳۲) ───

// گونوگو: پنج مرحله با اهرم زمان‌بندی — باند سنی جدی گرفته می‌شود (۴–۶ نرم‌تر از ۷–۱۲)
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

const GONOGO_STAGES: Record<AgeBandId, StageDef[]> = { '4-6': GONOGO_STAGES_4_6, '7-12': GONOGO_STAGES_7_12 };

// خط عددی «جادهٔ عددها» (۱.۲۵.۲۸) — اهرم سختی = گسترهٔ جاده؛ بدون بازنویسی پارامتر زمان‌بندی
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

// اسکن «حملهٔ جاسوس‌ها» (۱.۲۵.۳۰) — اهرم = اندازهٔ موج؛ امضای هدف هرگز بازنویسی نمی‌شود
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

// استروپ «حقه‌باز رنگ‌ها» (۱.۲۵.۳۲) — اهرم = آمیختهٔ هم‌خوان/ناهم‌خوان و پنجرهٔ پاسخ
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

// فلانکر «گلهٔ فریبکار» (۱.۲۵.۳۲) — گرگ واقعی وسط گلهٔ قلابی
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

// رد پای دزد (۱.۲۵.۳۲) — اهرم = طول رد و آمیختهٔ عدد/حرف
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

// ─── اهرم‌های مرحله — جدول‌های سقف بانک authored و اهرم نمایشی (کلید = s1..s5) ───

/** سقف گسترهٔ جاده در هر مرحلهٔ خط عددی — null = همهٔ جاده‌ها (مرحلهٔ پایانی مرور بزرگ) */
const NUMLINE_STAGE_MAX: Record<string, number | null> = {
  s1: 10,
  s2: 20,
  s3: 50,
  s4: 100,
  s5: null
};

/** سقف شمار خانه‌های موج در هر مرحلهٔ اسکن — null = همهٔ موج‌ها */
const SCAN_STAGE_MAX_TILES: Record<string, number | null> = {
  s1: 6,
  s2: 9,
  s3: 12,
  s4: 15,
  s5: null
};

/** پنجرهٔ نمایش موج (ms) در هر مرحلهٔ اسکن — اهرم فقط-نمایش؛ null = دست‌نخوردهٔ آیتم.
 *  قاعده: زمان مرحله فقط اگر از آیتم authored کوتاه‌تر یا برابر باشد — کودک همیشه
 *  حداقلِ زمان authored را دارد. */
const SCAN_STAGE_WAVE_MS: Record<string, number | null> = {
  s1: 22000,
  s2: 19000,
  s3: 17000,
  s4: 15000,
  s5: 13000
};

/** بانک مجاز هر مرحلهٔ استروپ — گروه‌های authored بانک (a=مرحلهٔ ۱ … d=مرحلهٔ ۴، p=پروب) */
const STROOP_STAGE_BANDS: Record<string, string[] | null> = {
  s1: ['a'],
  s2: ['a', 'b'],
  s3: ['a', 'b', 'c'],
  s4: ['a', 'b', 'c', 'd'],
  s5: null // همهٔ بانک — مرور بزرگ
};

/** سقف شمار گرگ قلابی در هر مرحلهٔ فلانکر — null = همهٔ گله‌ها */
const FLANKER_STAGE_MAX_DECOYS: Record<string, number | null> = {
  s1: 0,   // گلهٔ آرام — هیچ قلابی
  s2: 1,   // حداکثر یک قلابی
  s3: 3,   // نگاه‌های فریبکار
  s4: null, // گلهٔ فریبکار — همهٔ گله‌ها
  s5: null
};

/** بانک مجاز هر مرحلهٔ فلانکر — ناسالم بودن گروه = بازگشت ساختاری (شمار قلابی‌ها) */
const FLANKER_STAGE_BANDS: Record<string, string[] | null> = {
  s1: ['a'],
  s2: ['a', 'b'],
  s3: ['a', 'b', 'c'],
  s4: ['a', 'b', 'c', 'd'],
  s5: null
};

/** سقف شمار ردپاها در هر مرحلهٔ رد — null = همهٔ ردها */
const TRAIL_STAGE_MAX_NODES: Record<string, number | null> = {
  s1: 4,
  s2: 5,
  s3: 6,
  s4: 7,
  s5: null
};

/** بانک مجاز هر مرحلهٔ رد — ناسالم بودن گروه = بازگشت ساختاری (شمار ردپاها) */
const TRAIL_STAGE_BANDS: Record<string, string[] | null> = {
  s1: ['a'],
  s2: ['a', 'b'],
  s3: ['a', 'b', 'c'],
  s4: ['a', 'b', 'c', 'd'],
  s5: null
};

// ─── پیش‌ماندهٔ آیتم در مرحله — منطق هر نوع کنار جدول خودش نشسته تا با هم خوانده شوند ───

/** شمار گرگ قلابی فلانکر — فلانکرهای مخالف مرکز؛ ناسالم = صفر */
function flankerIncongruentCountOf(item: StageItemLike): number {
  const s = (item.stim ?? {}) as Record<string, unknown>;
  const arrows = Array.isArray(s.arrows) ? s.arrows.filter((v) => v === 'L' || v === 'R') : [];
  const mid = Math.floor(arrows.length / 2);
  const center = arrows[mid];
  if (center === undefined) return 0;
  return arrows.filter((a) => a !== center).length;
}

// ─── سنجه‌های موتورمحور هر نوع — عیناً از registry-extra.ts پیشین؛ ترتیب قطعی ───
// این سنجه‌ها با نسخهٔ موتور می‌آیند، دستی upsert نمی‌شوند و در metrics_json عیناً
// مثل بقیه ثبت می‌شوند؛ تعریف‌های شمارشی DB دست‌نخورده (تصمیم فاز ۱ بازطراحی).

/** فرمول‌هایی که فقط از موتور می‌آیند — upsert دستی ممنوع (CHECK دیتابیس می‌پذیرد اما کد اجازه نمی‌دهد) */
export const ENGINE_ONLY_FORMULAS: readonly string[] = [
  'correct_go_pct',
  'correct_nogo_pct',
  'commission_pct',
  'omission_pct',
  'scan_fa',
  'scan_miss',
  'congruent_acc',
  'incongruent_acc',
  'interference_ms',
  'trail_prefix'
];

// ─── نقشهٔ نوع-محور — تک‌منبع؛ ترتیب کلیدها = ترتیب قطعی GAME_KIND_IDS ───

export const GAME_KINDS: { [K in GameKind]: GameKindSpec<K> } = {
  gonogo: {
    // گو/نوگو — کف ۱۵۰ms: زیر آن حدس است (§۸)
    rt_floor_ms: 150,
    timed_choice: false, // اُمیشن گونوگو از خودِ لمس تعریف می‌شود، نه از پایان پنجره
    stage_rule: GONOGO_STAGE_RULE,
    stageList: (band) => GONOGO_STAGES[band] ?? GONOGO_STAGES['7-12'],
    // اهرم سختی گونوگو بازنویسی پارامتر زمان‌بندی در خود StageDef است — فیلتر بانک ندارد
    levers: {},
    itemInStage: () => true,
    engine_metrics: [
      { id: 'correct_go_pct_gonogo', title_fa: 'درصد گوهای درست', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'correct_go_pct' },
      { id: 'correct_nogo_pct_gonogo', title_fa: 'درصد بازداری درست نوگو', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'correct_nogo_pct' },
      { id: 'commission_pct_gonogo', title_fa: 'درصد خطای پاسخ به غیرهدف', unit: 'percent', higher_is_better: false, source: 'auto', formula: 'commission_pct' },
      { id: 'omission_pct_gonogo', title_fa: 'درصد از دست‌دادن هدف', unit: 'percent', higher_is_better: false, source: 'auto', formula: 'omission_pct' }
    ]
  },
  numline: {
    // خط عددی — کف صفر: اندازه‌گیری جای عدد است نه سرعت؛ RT ملاک نیست
    rt_floor_ms: 0,
    timed_choice: false,
    stage_rule: ACCURACY_STAGE_RULE,
    stageList: () => NUMLINE_STAGES,
    levers: { bank_caps: NUMLINE_STAGE_MAX },
    itemInStage: (item, stageId) => {
      const max = typeof stageId === 'string' && stageId in NUMLINE_STAGE_MAX ? NUMLINE_STAGE_MAX[stageId] : null;
      if (max === null) return true;
      return Array.isArray(item.range) && item.range[1] <= max;
    },
    // سنجهٔ خط عددی (numline_error) از فرمول DB می‌آید — سنجهٔ موتور-فقط ندارد
    engine_metrics: []
  },
  scan: {
    // اسکن — کف ۱۵۰ms روی نخستین لمس موج؛ زیر آن حدس است
    rt_floor_ms: 150,
    timed_choice: false,
    stage_rule: ACCURACY_STAGE_RULE,
    stageList: () => SWARM_STAGES,
    levers: { bank_caps: SCAN_STAGE_MAX_TILES, display: SCAN_STAGE_WAVE_MS },
    itemInStage: (item, stageId) => {
      const max = typeof stageId === 'string' && stageId in SCAN_STAGE_MAX_TILES ? SCAN_STAGE_MAX_TILES[stageId] : null;
      if (max === null) return true;
      const s = (item.stim ?? {}) as Record<string, unknown>;
      const cols = typeof s.cols === 'number' && Number.isInteger(s.cols) && s.cols > 0 ? s.cols : 0;
      const rows = typeof s.rows === 'number' && Number.isInteger(s.rows) && s.rows > 0 ? s.rows : 0;
      const tiles = cols * rows;
      return tiles > 0 && tiles <= max;
    },
    // دقت موج‌ها از فرمول 'accuracy' در DB می‌آید (accuracy_scan) — دو سنجهٔ تبعی موتور-فقط‌اند
    engine_metrics: [
      { id: 'scan_fa_pct', title_fa: 'درصد گرفتن هم‌نوع در موج', unit: 'percent', higher_is_better: false, source: 'auto', formula: 'scan_fa' },
      { id: 'scan_miss_pct', title_fa: 'درصد جاانداختن جاسوس', unit: 'percent', higher_is_better: false, source: 'auto', formula: 'scan_miss' }
    ]
  },
  stroop: {
    // استروپ — کف ۲۰۰ms: لمس تصادفی حذف می‌شود (۱.۲۵.۳۲)
    rt_floor_ms: 200,
    // انتخاب زمان‌دار — بی‌پاسخی پنجره سمت سرور اُمیشن است
    timed_choice: true,
    stage_rule: ACCURACY_STAGE_RULE,
    stageList: () => STROOP_STAGES,
    levers: { bank_bands: STROOP_STAGE_BANDS },
    itemInStage: (item, stageId) => {
      const allowed = typeof stageId === 'string' && stageId in STROOP_STAGE_BANDS ? STROOP_STAGE_BANDS[stageId] : null;
      if (allowed === null) return true;
      const s = (item.stim ?? {}) as Record<string, unknown>;
      const band = typeof s.band === 'string' ? s.band : '';
      if (band === '') return true; // آیتم بی‌گروه (بانک قدیمی) — همیشه حاضر
      return allowed.includes(band);
    },
    engine_metrics: [
      { id: 'stroop_congruent_acc_pct', title_fa: 'دقت هم‌خوان استروپ (واژه و جوهر یکی)', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'congruent_acc' },
      { id: 'stroop_incongruent_acc_pct', title_fa: 'دقت ناهم‌خوان استروپ (حقهٔ جوهر)', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'incongruent_acc' },
      { id: 'stroop_interference_ms', title_fa: 'هزینهٔ تداخل استروپ (میانهٔ ناهم‌خوان − میانهٔ هم‌خوان)', unit: 'ms', higher_is_better: false, source: 'auto', formula: 'interference_ms' }
    ]
  },
  flanker: {
    // فلانکر — کف ۲۰۰ms: لمس تصادفی حذف می‌شود (۱.۲۵.۳۲)
    rt_floor_ms: 200,
    timed_choice: true,
    stage_rule: ACCURACY_STAGE_RULE,
    stageList: () => FLANKER_STAGES,
    levers: { bank_caps: FLANKER_STAGE_MAX_DECOYS, bank_bands: FLANKER_STAGE_BANDS },
    itemInStage: (item, stageId) => {
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
    },
    engine_metrics: [
      { id: 'flanker_congruent_acc_pct', title_fa: 'دقت گلهٔ هم‌سو (بدون فریب)', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'congruent_acc' },
      { id: 'flanker_incongruent_acc_pct', title_fa: 'دقت گلهٔ فریبکار (فلانکر مخالف)', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'incongruent_acc' },
      { id: 'flanker_interference_ms', title_fa: 'هزینهٔ تداخل فلانکر (میانهٔ ناهم‌خوان − میانهٔ هم‌خوان)', unit: 'ms', higher_is_better: false, source: 'auto', formula: 'interference_ms' }
    ]
  },
  trail: {
    // رد پای دزد — کف ۱۵۰ms روی نخستین لمس رد؛ زیر آن حدس است (۱.۲۵.۳۲)
    rt_floor_ms: 150,
    timed_choice: false,
    stage_rule: ACCURACY_STAGE_RULE,
    stageList: () => TRAIL_STAGES,
    levers: { bank_caps: TRAIL_STAGE_MAX_NODES, bank_bands: TRAIL_STAGE_BANDS },
    itemInStage: (item, stageId) => {
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
    },
    engine_metrics: [
      { id: 'trail_prefix_pct', title_fa: 'درصد پیش‌ماند صحیح رد ردپاها', unit: 'percent', higher_is_better: true, source: 'auto', formula: 'trail_prefix' }
    ]
  }
};
