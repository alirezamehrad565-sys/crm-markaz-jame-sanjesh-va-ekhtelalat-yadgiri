// protocol.ts — لایهٔ تنظیمات پروتکل گو/نوگو (فاز ۱ بازطراحی حرفه‌ای / ۱.۲۵.۱۱)
// دفترچهٔ وظیفه §۱: «همهٔ پارامترهای پروتکل در سیستم تنظیمات مستقل می‌نشینند —
// هیچ هاردکدی در UI یا کلاینت مجاز نیست» و §۱۰: «هر پارامتر = مقدار پیشنهادی +
// مبنا + وضعیت تأیید». وضعیت‌ها صادقانه‌اند: چیزی که پیلوت نشده «validated» نوشته نمی‌شود.
//
// دو حالت مستقل (§ دفترچهٔ وظیفه «Training/Assessment دو حالت مستقل»):
//   · training  — آموزش، تمرین، بازخورد فوری، سازگاری خودکار، سبد ستاره
//   · assessment — دستورالعمل ثابت، اجرای بدون بازخورد، پروتکل نسخه‌دارِ ثابت
// تنظیمات هر حالت از این فایل می‌آید؛ موتور و UI فقط این قرارداد را می‌خوانند.

export type ProtocolMode = 'training' | 'assessment';
export type AgeBandId = '4-6' | '7-12';
export type ParamStatus = 'validated' | 'pilot' | 'proposed';

/** نسخهٔ پروتکل — هر تغییر عددی در این فایل باید این نسخه را بامپ کند تا
 *  مقایسهٔ جلسه‌های بین پروتکل‌ها از پیش ممنوع شود (دفترچهٔ وظیفه: پروتکل نسخه‌دار). */
export const PROTOCOL_VERSION = '1.0.0';

/** شناسهٔ پروتکل گو/نوگو در رجیستری بسته‌ها */
export const PROTOCOL_ID = 'gonogo-standard';

export interface ProtocolParam {
  /** مقدار عملیاتی برای این باند سنی */
  value: number;
  /** مبنا: چرا این مقدار؟ (ادعای علمی بدون منبع ممنوع — شواهدِ کلی متعارف آزمون) */
  rationale: string;
  /** وضعیت اعتبارسنجی: validated = با پیلوت خود مرکز تأیید شده؛ pilot = در پیلوت؛ proposed = پیشنهاد کارشناس */
  status: ParamStatus;
}

export interface ProtocolBehavior {
  /** اجرای اصلی بازخورد فوری دارد؟ — ارزیابی: هرگز (خنثی‌سازی واکنش) */
  feedback_in_main: boolean;
  /** سبد ستاره و تشویق شمارشی — فقط تمرین؛ ارزیابی صفر */
  star_basket: boolean;
  /** سازگاری خودکارِ سختی — فقط تمرین (فاز ۶) */
  adaptive: boolean;
  /** نوار پیشرفت در اجرای اصلی — ارزیابی: خیر (عدم مزاحمت برای زمان‌بندی) */
  progress_visible: boolean;
  /** پیش‌نمایش/آموزش پیش از اجرای اصلی — ارزیابی: نسخهٔ دستورالعمل ثابت کوتاه */
  instruction_style: 'playful' | 'standard';
}

export interface ProtocolSpec {
  protocol_id: string;
  version: string;
  mode: ProtocolMode;
  age_band: AgeBandId;
  params: {
    /** پنجرهٔ پاسخ محرک گو (ms) — از لحظهٔ نمایش تا سقف پذیرش لمس */
    response_window_go_ms: ProtocolParam;
    /** پنجرهٔ پاسخ محرک نوگو (ms) — مدت شمارش بازداری؛ معمولاً هم‌طول گو */
    response_window_nogo_ms: ProtocolParam;
    /** فاصلهٔ بین‌آزمونشی ISI — حداقل (ms) */
    isi_min_ms: ProtocolParam;
    /** فاصلهٔ بین‌آزمونشی ISI — حداکثر (ms) */
    isi_max_ms: ProtocolParam;
    /** تثبیت پیش از محرک (ms) — مکث خنثی بی‌فلاش بین ISI و نمایش */
    fixation_ms: ProtocolParam;
    /** نسبت محرک گو در دنبالهٔ تولیدی (۰..۱) */
    go_ratio: ProtocolParam;
    /** سقف تکرار پیاپی یک دسته (go یا nogo) — شکستن ریتم قابل حفظ‌کردن */
    max_consecutive_same: ProtocolParam;
    /** طول بلوک (تعداد آزمون در هر بلوک) */
    block_size: ProtocolParam;
    /** استراحت بین بلوک‌ها (ms) — کودک با لمس ادامه می‌دهد */
    break_min_ms: ProtocolParam;
    /** تعداد بلوک در جلسهٔ ارزیابی استاندارد */
    assessment_blocks: ProtocolParam;
    /** مقیاس نمایش محرک — درصد قطر کوچک ویوپورت (سن‌محور، نه عدد جادویی ثابت پیکسل) */
    stimulus_scale_vmin: ProtocolParam;
    /** مدت نمایش بازخورد آموزشی (فقط تمرین؛ ارزیابی بی‌معنا) */
    feedback_ms: ProtocolParam;
    /** مدت هر گام پیش‌نمایش/آموزش (ms) */
    preview_step_ms: ProtocolParam;
  };
  behavior: ProtocolBehavior;
}

const PARAM = (value: number, rationale: string, status: ParamStatus): ProtocolParam => ({ value, rationale, status });

/**
 * باندهای سنی دفترچهٔ وظیفه: ۴–۶ و ۷–۱۲.
 * سن بیرون از باند (زیر ۴ یا بالای ۱۲) به نزدیک‌ترین باند می‌نشیند — با ثبت صریح، نه بی‌صدا.
 */
export function bandForAge(age: number | null | undefined): { band: AgeBandId; clamped: boolean } {
  if (typeof age !== 'number' || !Number.isFinite(age)) return { band: '7-12', clamped: false };
  if (age <= 6) return { band: '4-6', clamped: age < 4 };
  return { band: '7-12', clamped: age > 12 };
}

const TRAINING_PARAMS: Record<AgeBandId, ProtocolSpec['params']> = {
  '4-6': {
    response_window_go_ms: PARAM(2000, 'کودک ۴–۶ سال پردازش و تصمیم کندتر دارد؛ پنجرهٔ متعارف گو/نوگو کودک‌محور بلندتر انتخاب شد — با پیلوت مرکز تأیید قطعی می‌گیرد', 'pilot'),
    response_window_nogo_ms: PARAM(2000, 'هم‌طول گو برای خوانایی مقایسهٔ کمیسیون در این سن', 'proposed'),
    isi_min_ms: PARAM(1000, 'ISI کوتاه‌تر از این در ۴–۶ سال نرخ اُمیشن تصادفی می‌سازد؛ حد پایین محافظه‌کارانه', 'proposed'),
    isi_max_ms: PARAM(1500, 'بازهٔ ۱–۱٫۵ ثانیه سند محتوا بستهٔ ۳ — حفظ شد', 'pilot'),
    fixation_ms: PARAM(400, 'مکث خنثی کوتاه پیش از نمایش — جداکنندهٔ ISI از لحظهٔ محرک؛ بدون فلاش و شمارش (§۹)', 'proposed'),
    go_ratio: PARAM(0.75, 'نسبت متعارف گو/نوگو ~۳:۱ در ادبیات گو/نوگو کودکان؛ نسبت بالاتر برای ۴–۶ سال تا مهار بازداری خسته‌کننده نشود', 'pilot'),
    max_consecutive_same: PARAM(3, 'بیش از سه پیاپی، ریتم قابل حفظ‌کردن می‌سازد (حفظ‌کردن به‌جای بازداری)', 'proposed'),
    block_size: PARAM(20, 'بازهٔ توجه فعال ۴–۶ سال؛ بلوک ۲۰ تایی با استراحت، خستگی انتهای جلسه را می‌شکند', 'pilot'),
    break_min_ms: PARAM(4000, 'استراحت کوتاه لمس‌محور؛ کافی برای تنظیم، کوتاه برای حفظ جریان', 'proposed'),
    assessment_blocks: PARAM(2, 'حالت تمرین دو بلوک کوتاه — تجربهٔ کوتاه‌تر از ارزیابی', 'proposed'),
    stimulus_scale_vmin: PARAM(38, 'محرک درشت برای ۴–۶ سال؛ ۳۸٪ قطر کوچک ویوپورت — پاسخ بازخورد میدانی «آیکون بزرگ» با مقیاس سن‌محور نه عدد ثابت', 'pilot'),
    feedback_ms: PARAM(1400, 'حباب بازخورد کوتاه‌تر از ۱۶۰۰ms فعلی — فاصلهٔ بین‌آزمونشی طولانی، کودک بی‌حوصله را خفه می‌کند (C12 ممیزی)', 'proposed'),
    preview_step_ms: PARAM(2200, 'هر گام آموزش دوضانیه‌ای تا بیشتر از این روی صفحه نمی‌ماند', 'proposed')
  },
  '7-12': {
    response_window_go_ms: PARAM(1500, 'پنجرهٔ متعارف گو/نوگو سنین مدرسه — پاسخ‌های زیر کف ۱۵۰ms جداگانه فیلتر می‌شوند (§۸)', 'pilot'),
    response_window_nogo_ms: PARAM(1500, 'هم‌طول گو — مقایسه‌پذیری بین‌سنی', 'proposed'),
    isi_min_ms: PARAM(800, 'ISI کمی کوتاه‌تر برای سنین بالاتر؛ فشار سرعت متعادل', 'proposed'),
    isi_max_ms: PARAM(1200, 'بازهٔ ۰٫۸–۱٫۲ ثانیه — تنوع برای شکستن انتظار زمانی ثابت', 'proposed'),
    fixation_ms: PARAM(400, 'مکث خنثی پیش از نمایش — هم‌طول دو باند برای مقایسه‌پذیری', 'proposed'),
    go_ratio: PARAM(0.75, 'نسبت ~۳:۱ متعارف؛ با نسخهٔ پروتکل ثابت می‌ماند', 'pilot'),
    max_consecutive_same: PARAM(3, 'همان استدلال ۴–۶ سال', 'proposed'),
    block_size: PARAM(24, 'سنین مدرسه بازهٔ توجه بلندتر — بلوک ۲۴ تایی', 'proposed'),
    break_min_ms: PARAM(3500, 'استراحت لمس‌محور', 'proposed'),
    assessment_blocks: PARAM(3, 'پروتکل ارزیابی استاندارد سه بلوک (~۷۲ آزمون) — دنبالهٔ بلند برای میانه و پراکندگی پایدار', 'proposed'),
    stimulus_scale_vmin: PARAM(30, 'محرک کوچک‌تر برای سنین بالاتر — بازطراحی پاسخ به «آیکون‌ها بزرگ است» با پارامتر سن‌محور', 'pilot'),
    feedback_ms: PARAM(1200, 'بازخورد آموزشی کوتاه‌تر — این سن تحمل فاصلهٔ بلند ندارد', 'proposed'),
    preview_step_ms: PARAM(2000, 'گام آموزش دوضانیه‌ای', 'proposed')
  }
};

const ASSESSMENT_PARAMS: Record<AgeBandId, ProtocolSpec['params']> = {
  '4-6': {
    ...TRAINING_PARAMS['4-6'],
    response_window_go_ms: PARAM(2000, 'ارزیابی: پنجرهٔ ثابت همان تمرین تا مقایسهٔ روند؛ تغییرش یعنی پروتکل جدید و بامپ نسخه', 'pilot'),
    assessment_blocks: PARAM(2, 'ارزیابی ۴–۶ سال: دو بلوک ۲۰ تایی = ۴۰ آزمون — بلندتر از ظرفیت توجه این سن نیست', 'proposed')
  },
  '7-12': {
    ...TRAINING_PARAMS['7-12'],
    response_window_go_ms: PARAM(1500, 'ارزیابی: پنجرهٔ ثابت؛ سازگاری در ارزیابی ممنوع است (C1)', 'pilot'),
    assessment_blocks: PARAM(3, 'ارزیابی ۷–۱۲ سال: سه بلوک ۲۴ تایی = ۷۲ آزمون استاندارد', 'proposed')
  }
};

const ASSESSMENT_BEHAVIOR: ProtocolBehavior = {
  feedback_in_main: false,
  star_basket: false,
  adaptive: false,
  progress_visible: false,
  instruction_style: 'standard'
};

const TRAINING_BEHAVIOR: ProtocolBehavior = {
  feedback_in_main: true,
  star_basket: true,
  adaptive: true,
  progress_visible: true,
  instruction_style: 'playful'
};

/** پروتکل کامل برای حالت و باند سنی — تنها ورودی مجاز موتور و UI */
export function protocolFor(mode: ProtocolMode, band: AgeBandId): ProtocolSpec {
  const params = mode === 'assessment' ? ASSESSMENT_PARAMS[band] : TRAINING_PARAMS[band];
  return {
    protocol_id: PROTOCOL_ID,
    version: PROTOCOL_VERSION,
    mode,
    age_band: band,
    params,
    behavior: mode === 'assessment' ? ASSESSMENT_BEHAVIOR : TRAINING_BEHAVIOR
  };
}

/** پروتکل از سن کودک — باند بیرونی با پرچم clamp ثبت می‌شود، بی‌صدا نه */
export function protocolForAge(mode: ProtocolMode, age: number | null | undefined): ProtocolSpec & { age_clamped: boolean } {
  const { band, clamped } = bandForAge(age);
  return { ...protocolFor(mode, band), age_clamped: clamped };
}

/** گارد سروری: نسخهٔ پروتکلِ بسته باید با نسخهٔ جاری هم‌خوان باشد، وگرنه انتشار رد می‌شود */
export function isProtocolVersionSupported(v: string | undefined | null): boolean {
  return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) && v === PROTOCOL_VERSION;
}

/** پروفایل سریالی پروتکل برای ذخیره در جلسه — فقط اعداد عملیاتی، بدون متن مبنا (صرفهٔ ذخیره‌سازی) */
export interface ProtocolSnapshot {
  protocol_id: string;
  version: string;
  mode: ProtocolMode;
  age_band: AgeBandId;
  params: Record<string, number>;
  behavior: ProtocolBehavior;
}

export function protocolSnapshotOf(p: ProtocolSpec): ProtocolSnapshot {
  const params: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.params)) params[k] = v.value;
  return {
    protocol_id: p.protocol_id, version: p.version, mode: p.mode, age_band: p.age_band,
    params, behavior: { ...p.behavior }
  };
}

// ─── پروتکل «آلبوم خرچنگ» — ن‌پشت هم‌سانی دیداری (G4ب / ۱.۲۵.۴۰) ───
// گو/نوگو پروتکل خودش را دارد؛ ن‌پشت پارامترهای زمان‌بندی متفاوت می‌خواهد (ISI بلندتر برای
// رمزگذاری در حافظهٔ کاری) و پارامترهای محتوایی خودش (نرخ همسانی، سقف همسانِ پیاپی).
// قرارداد همان §۱۰ COGNITIVE_SPEC است: هر پارامتر {value, rationale, status} با وضعیت صادقانه؛
// نسخهٔ مستقل از گو/نوگو — مقایسهٔ جلسه‌های ن‌پشت فقط درون همین نسخه مجاز است.

/** شناسهٔ پروتکل ن‌پشت — هویت مستقل در اسنپ‌شات جلسه‌های nback */
export const NBACK_PROTOCOL_ID = 'nback-standard';

/** نسخهٔ پارامترهای ن‌پشت — هر تغییر عددی در NBACK_PARAMS این نسخه را بامپ می‌کند */
export const NBACK_PROTOCOL_VERSION = '1.0.0';

export interface NbackParam {
  value: number;
  rationale: string;
  status: ParamStatus;
}

/** پارامترهای پایهٔ ن‌پشت — پیش از بازنویسی مرحله (ISI مرحله روی همین می‌نشیند) */
const NBACK_PARAMS: Record<AgeBandId, Record<string, NbackParam>> = {
  '4-6': {
    isi_min_ms: PARAM(2200, 'فاصلهٔ بین‌محركی ن‌پشت؛ رمزگذاری ماهیِ قدم قبل در حافظهٔ کاری کودکِ کوچک‌تر به فاصلهٔ آرام‌تر نیاز دارد — متعارف وظایف هم‌سانی کودکانه', 'proposed'),
    isi_max_ms: PARAM(2800, 'بالای بازه ~۲٫۵ ثانیه — تنوع ملایم برای شکستن انتظار زمانی ثابت', 'proposed'),
    fixation_ms: PARAM(400, 'مکث خنثی پیش از نمایش — هم‌طول گو/نوگو برای یکدستی تجربه', 'proposed'),
    block_size: PARAM(30, 'جریان هم‌سانی نباید با استراحت بلوکی بشکند (مقایسهٔ قدم قبل از حافظه می‌گذرد) — جلسهٔ ~۲۶ محرکی بی‌استراحت', 'proposed'),
    match_ratio: PARAM(0.3, 'نرخ همسانی ~۳۰٪ — تعادل متعارف سهمیهٔ همسان/ناهمسان در وظایف هم‌سانی؛ تصادفی‌نمای پاسخ به ~۵۰٪ نمی‌رسد', 'proposed'),
    max_consecutive_match: PARAM(2, 'بیش از دو همسانِ پیاپی، پاسخ تکراریِ بی‌مقایسه می‌سازد', 'proposed'),
    response_window_ms: PARAM(3800, 'پنجرهٔ پاسخ دوگزینه‌ای «همان است/فرق دارد» — پایهٔ مرجع؛ پنجرهٔ عملیاتی روی خود آیتم authored می‌نشیند', 'proposed')
  },
  '7-12': {
    isi_min_ms: PARAM(1800, 'فاصلهٔ بین‌محركی ن‌پشت برای سنین مدرسه — کوتاه‌تر از ۴–۶ سال، بلندتر از گو/نوگو', 'proposed'),
    isi_max_ms: PARAM(2400, 'بالای بازه ~۲٫۱ ثانیه — حول هدف ~۲٫۵ ثانیهٔ بین‌محركی', 'proposed'),
    fixation_ms: PARAM(400, 'مکث خنثی پیش از نمایش — هم‌طول دو باند', 'proposed'),
    block_size: PARAM(30, 'جریان هم‌سانی بی‌استراحت بلوکی — همان استدلال ۴–۶ سال', 'proposed'),
    match_ratio: PARAM(0.3, 'نرخ همسانی ~۳۰٪ — یکسان دو باند برای مقایسه‌پذیری', 'proposed'),
    max_consecutive_match: PARAM(2, 'سقف همسانِ پیاپی — یکسان دو باند', 'proposed'),
    response_window_ms: PARAM(3400, 'پنجرهٔ پاسخ دوگزینه‌ای برای سنین بالاتر — پایهٔ مرجع؛ پنجرهٔ عملیاتی authored است', 'proposed')
  }
};

/** پارامترهای عملیاتی ن‌پشت برای باند سنی — فقط اعداد، بدون متن مبنا (شکل اسنپ‌شات) */
export function nbackParamsOf(band: AgeBandId): Record<string, number> {
  const src = NBACK_PARAMS[band] ?? NBACK_PARAMS['7-12'];
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) out[k] = v.value;
  return out;
}

/**
 * اسنپ‌شات پروتکل جلسهٔ ن‌پشت — هویت و پارامترهای ن‌پشت جایگزین پایهٔ گو/نوگو می‌شوند.
 * بازنویسی مرحله (applyStageOverrides در سرویس) بعد از این اعمال می‌شود تا ISI مرحله
 * روی پایهٔ ن‌پشت بنشیند — رفتار گو/نوگو و سایر نوع‌ها صفر تغییری نمی‌کند.
 */
export function applyNbackProtocol(snap: ProtocolSnapshot, band: AgeBandId): ProtocolSnapshot {
  return {
    ...snap,
    protocol_id: NBACK_PROTOCOL_ID,
    version: NBACK_PROTOCOL_VERSION,
    params: { ...snap.params, ...nbackParamsOf(band) }
  };
}
