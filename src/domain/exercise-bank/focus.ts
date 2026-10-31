// درخت هدف‌های کتابخانهٔ کارت آماده: دیدگاه پردازش اطلاعات + کارکردهای اجرایی
// تصمیم بالینی: طبقه‌بندی علمی «در کد» نسخه‌پذیر است (گیت تست دارد)؛ نیازهای آزادِ روزمره
// همچنان با «برچسب دلخواه» (tags) پوشش داده می‌شود — ستون سوم منو (اختلال‌ها) همان برچسب‌های dynamic است.
// هر کارت می‌تواند به چند مهارت هدف متصل شود (پیوند چندبه‌چند در جدول exercise_focus_links).

export interface FocusSkill {
  key: string;
  fa: string;
  hint: string; // راهنمای بالینی کوتاه — در tooltip و فرم اضافه‌کردن
}
export interface FocusDomain {
  key: string;
  fa: string;
  icon: string; // نام آیکون در ui.js PATHS
  skills: FocusSkill[];
}
export interface FocusPillar {
  key: string;
  fa: string;
  icon: string;
  domains: FocusDomain[];
}

// ─── ستون ۱: پردازش اطلاعات (Atkinson–Shiffrin + CHC + PASS + شاخص‌های وکسلر WMI/PSI/PRI/VCI) ───
export const PILLAR_INFO: FocusPillar = {
  key: 'info',
  fa: 'پردازش اطلاعات',
  icon: 'brain',
  domains: [
    {
      key: 'attention',
      fa: 'توجه — دروازهٔ ورودی',
      icon: 'zap',
      skills: [
        { key: 'attention_sustained', fa: 'توجه پایدار', hint: 'ادامهٔ تمرکز روی یک تکلیف در طول زمان بدون افت' },
        { key: 'attention_selective', fa: 'توجه انتخابی', hint: 'جداکردن محرک هدف از نویز و محرک‌های مزاحم' },
        { key: 'attention_divided', fa: 'توجه تقسیم‌شده', hint: 'مدیریت دو منبع همزمان — تکلیف دوگانه' }
      ]
    },
    {
      key: 'perception',
      fa: 'ادراک',
      icon: 'eye',
      skills: [
        { key: 'perception_visual', fa: 'ادراک دیداری', hint: 'تمایز، ثبات، شکل-زمینه، بستار — پیش‌نیاز خواندن' },
        { key: 'perception_auditory', fa: 'ادراک شنیداری', hint: 'تمایز و تحلیل-ترکیب شنیداری — پیش‌نیاز روخوانی' },
        { key: 'perception_visomotor', fa: 'هماهنگی دیداری-حرکتی', hint: 'چشم-دست، بازسازی الگو، کنترل مداد' }
      ]
    },
    {
      key: 'memory',
      fa: 'حافظه',
      icon: 'brain',
      skills: [
        { key: 'memory_working', fa: 'حافظهٔ فعال (کاری)', hint: 'نگهداری + پردازش همزمان — شاخص WMI وکسلر' },
        { key: 'memory_shortterm', fa: 'نگهداری ذهنی (کوتاه‌مدت)', hint: 'فراخنای ساده — بازگویی بلافاصله' },
        { key: 'memory_visual', fa: 'حافظهٔ دیداری', hint: 'به‌خاطرسپاری الگو، شکل و موقعیت' },
        { key: 'memory_auditory', fa: 'حافظهٔ شنیداری', hint: 'به‌خاطرسپاری دستور و پیام شنیداری' },
        { key: 'memory_sequence', fa: 'حافظهٔ ترتیبی', hint: 'به یاد سپردن توالی — ارقام، کلمه، مراحل کار' },
        { key: 'memory_longterm', fa: 'تثبیت و بازیابی بلندمدت', hint: 'یادگیری معنایی، تکرار فاصله‌دار، دستور واکنش' }
      ]
    },
    {
      key: 'language',
      fa: 'زبان و پردازش کلامی',
      icon: 'speech',
      skills: [
        { key: 'lang_phonology', fa: 'آگاهی واج‌شناختی', hint: 'هم‌خوان اول/آخر، تقطیع، حذف واج — پیش‌بینی‌کنندهٔ اصلی نارساخوانی' },
        { key: 'lang_ran', fa: 'نامیدن سریع و بازیابی واژگان', hint: 'RAN — سرعت بازیابی نام محرک از حافظه' },
        { key: 'lang_comprehension', fa: 'درک شنیداری و درک مطلب', hint: 'فهم پیام و متن در سطح کلام و انتزاع' },
        { key: 'lang_expression', fa: 'بیان و ساخت جمله', hint: 'سازماندهی کلامی، روانی بیان، گسترش جمله' }
      ]
    },
    {
      key: 'spatial',
      fa: 'پردازش دیداری-فضایی',
      icon: 'compass',
      skills: [
        { key: 'spatial_relations', fa: 'روابط فضایی', hint: 'جهت و جایگاه — بالا/پایین، راست/چپ، آینه‌شدن حروف' },
        { key: 'spatial_rotation', fa: 'تصویرسازی و چرخش ذهنی', hint: 'چرخاندن شکل در ذهن — شاخص PRI وکسلر' },
        { key: 'spatial_maze', fa: 'مسیریابی و هوش فضایی', hint: 'ماز، نقشه، ترکیب بلوک‌ها، درک تناسب' }
      ]
    },
    {
      key: 'reasoning',
      fa: 'تفکر و استدلال',
      icon: 'sparkles',
      skills: [
        { key: 'reason_verbal', fa: 'استدلال کلامی', hint: 'مفهوم‌یابی کلامی، روابط مفهومی، شباهت‌ها' },
        { key: 'reason_nonverbal', fa: 'استدلال غیرکلامی', hint: 'ماتریس‌ها، تکمیل تصویر، سری‌های دیداری' },
        { key: 'reason_problem', fa: 'حل مسئله و تفکر انتقادی', hint: 'تحلیل مسئله، قاعده‌یابی، تصمیم‌گیری' }
      ]
    },
    {
      key: 'pass',
      fa: 'پردازش همزمان و ترتیبی',
      icon: 'timeline',
      skills: [
        { key: 'proc_successive', fa: 'پردازش ترتیبی', hint: 'زنجیرهٔ محرک‌ها به‌ترتیب — محرک‌های موقت/متوالی (PASS)' },
        { key: 'proc_simultaneous', fa: 'پردازش همزمان', hint: 'ترکیب قطعات در یک کل — دیدن الگوی یکجا (PASS)' }
      ]
    },
    {
      key: 'fluency',
      fa: 'سرعت و روانی پردازش',
      icon: 'trendingUp',
      skills: [
        { key: 'speed_processing', fa: 'سرعت پردازش', hint: 'سرعت تصمیم و اجرای ساده — شاخص PSI وکسلر' },
        { key: 'fluency_auto', fa: 'خودکارشدگی و روانی', hint: 'روانی خواندن/نوشتن/حساب — آزادشدن ظرفیت برای فهم' }
      ]
    }
  ]
};

// ─── ستون ۲: کارکردهای اجرایی (Barkley + Dawson & Guare) ───
export const PILLAR_EXEC: FocusPillar = {
  key: 'exec',
  fa: 'کارکردهای اجرایی',
  icon: 'board',
  domains: [
    {
      key: 'control',
      fa: 'مهار و خودتنظیمی',
      icon: 'shield',
      skills: [
        { key: 'ef_inhibition', fa: 'بازداری پاسخ', hint: 'مهار تکانه — فکرکردن پیش از عمل، ادامهٔ توقف' },
        { key: 'ef_emotion', fa: 'تنظیم هیجان', hint: 'تحمل «نه»، آرام‌سازی، تاب‌آوری در شکست' }
      ]
    },
    {
      key: 'organization',
      fa: 'سازماندهی',
      icon: 'archive',
      skills: [
        { key: 'ef_org_materials', fa: 'سازماندهی وسایل و تکالیف', hint: 'کیف، میز، برگه‌ها و زمان‌بندی تحویل' },
        { key: 'ef_org_thoughts', fa: 'سازماندهی فکر و مطلب', hint: 'دسته‌بندی، خلاصه‌سازی، نگارش ساختارمند' }
      ]
    },
    {
      key: 'planning',
      fa: 'برنامه‌ریزی و زمان',
      icon: 'calendarCheck',
      skills: [
        { key: 'ef_planning', fa: 'برنامه‌ریزی', hint: 'گام‌بندی تکلیف، پیش‌بینی موانع، انتخاب راهبرد' },
        { key: 'ef_time', fa: 'مدیریت زمان', hint: 'برآورد زمان، ضرب‌الاجل، درک سپری‌شدن زمان' },
        { key: 'ef_initiation', fa: 'آغازگری', hint: 'شروع کار بدون بهانه‌گیری و تعویق' }
      ]
    },
    {
      key: 'monitor',
      fa: 'پایش و انعطاف',
      icon: 'clipboard',
      skills: [
        { key: 'ef_monitoring', fa: 'خودپایشی', hint: 'بازبینی کار در حین و پایان — وارسی خطا' },
        { key: 'ef_flexibility', fa: 'انعطاف‌پذیری شناختی', hint: 'جابه‌جایی بین قاعده و راهبرد — رفع تثبیت' },
        { key: 'ef_persistence', fa: 'پایداری در پیگیری هدف', hint: 'رساندن کار به سرانجام با وجود مانع و حواس‌پرتی' }
      ]
    }
  ]
};

// ─── ستون ۳ منو («اختلال‌ها»): برچسب‌های dynamic دیتابیس داخل خانواده‌های بالینی ثابت ───
// برچسب اختلال دادهٔ آزاد کاربر است (سقف محتوایی ندارد)؛ خانواده‌ها چارچوب بالینی ثابت‌اند که
// هر برچسب را با قاعدهٔ تطبیق متنی به یکی از خانواده‌ها می‌برند — برچسب ناشناخته به «سایر» می‌رود.
export interface DisorderFamily {
  key: string;
  fa: string;
  icon: string; // نام آیکون در ui.js PATHS
  hint: string; // راهنمای بالینی کوتاه — tooltip ردیف خانواده
  match: RegExp[]; // قاعدهٔ تطبیق نام برچسب → خانواده (اولین تطبیق برنده است)
}

export const DISORDER_FAMILY_OTHER_KEY = 'fam_other';

export const DISORDER_FAMILIES: DisorderFamily[] = [
  {
    key: 'fam_learning',
    fa: 'ناتوانی‌های یادگیری',
    icon: 'book',
    hint: 'نارساخوانی، نارسانویسی، نارساریاضی و دیرآموز — اختلال‌های مشخص یادگیری تحصیلی',
    match: [/یادگیری/, /دیرآموز/, /نارساخوان/, /نارسانویس/, /نارساریاض/, /دیسلکسی|دیس‌لکسی/, /دیسگرافی|دیس‌گرافی/, /دیسکالکولی|دیس‌کالکولی/, /خوانی/, /نویسی/, /ریاض/, /حساب/]
  },
  {
    key: 'fam_attention',
    fa: 'توجه و فزون‌کنشی',
    icon: 'zap',
    hint: 'بیش‌فعالی/کم‌توجهی و اختلال‌های توجه — هم‌راستا با ستون کارکردهای اجرایی',
    match: [/توجه/, /فعالی/, /ADHD/i]
  },
  {
    key: 'fam_behavior',
    fa: 'رفتار و هیجان',
    icon: 'shield',
    hint: 'نافرمانی، رفتار چالشی و اختلال‌های هیجانی-اضطرابی',
    match: [/نافرمانی/, /رفتار/, /ODD/i, /اضطراب/, /خلق/, /ترس/]
  },
  {
    key: 'fam_language',
    fa: 'گفتار و زبان',
    icon: 'speech',
    hint: 'اختلال زبان، بیان و کلام — پیش‌نیاز پردازش کلامی',
    match: [/گفتار/, /زبانی/, /بیان/, /کلام/, /تلفظ/, /لالی/]
  },
  {
    key: 'fam_development',
    fa: 'رشد و حرکت',
    icon: 'activity',
    hint: 'طیف اتیسم، هماهنگی حرکتی و اختلال‌های دورهٔ رشد',
    match: [/اتیسم/, /طیف/, /هماهنگی/, /حرکت/, /موتور/, /رشد/]
  }
];

/** کلید خانوادهٔ هر برچسب اختلال — اولین تطبیق برنده است؛ ناشناخته → «سایر» */
export function disorderFamilyOf(name: string): string {
  const n = String(name ?? '');
  for (const fam of DISORDER_FAMILIES) {
    if (fam.match.some((re) => re.test(n))) return fam.key;
  }
  return DISORDER_FAMILY_OTHER_KEY;
}

export function isDisorderFamilyKey(key: string): boolean {
  return key === DISORDER_FAMILY_OTHER_KEY || DISORDER_FAMILIES.some((f) => f.key === key);
}

export interface DisorderTreeTag {
  id: string;
  name: string;
}
export interface DisorderTreeFamily {
  key: string;
  fa: string;
  icon: string;
  hint: string;
  tags: DisorderTreeTag[];
}

/**
 * درخت ستون اختلال‌ها برای meta: خانواده‌های ثابت به ترتیب بالینی + «سایر» فقط اگر عضو دارد.
 * خانوادهٔ خالی نمایش داده نمی‌شود تا درخت همیشه پرمحتوا بماند.
 */
export function buildDisorderTree(disorderTags: DisorderTreeTag[]): DisorderTreeFamily[] {
  const list = Array.isArray(disorderTags) ? disorderTags : [];
  const tree: DisorderTreeFamily[] = [];
  for (const fam of DISORDER_FAMILIES) {
    const members = list.filter((t) => disorderFamilyOf(t.name) === fam.key);
    if (members.length > 0) tree.push({ key: fam.key, fa: fam.fa, icon: fam.icon, hint: fam.hint, tags: members });
  }
  const others = list.filter((t) => disorderFamilyOf(t.name) === DISORDER_FAMILY_OTHER_KEY);
  if (others.length > 0) {
    tree.push({ key: DISORDER_FAMILY_OTHER_KEY, fa: 'سایر اختلال‌ها', icon: 'puzzle', hint: 'برچسب‌های اختلالی خارج از خانواده‌های بالا', tags: others });
  }
  return tree;
}

/**
 * گسترش انتخاب ستون اختلال‌ها به شناسهٔ برچسب — آینهٔ expandFocusKeys:
 * کلید خانواده → همهٔ برچسب‌های عضو؛ شناسهٔ برچسب → خودش (فقط شناسه‌های شناخته‌شده)؛ بدون تکرار.
 * خروجی به ترتیب ورودی برچسب‌ها پایدار است؛ خروجی خالی یعنی هیچ شرطی به فیلتر اضافه نشود.
 */
export function expandDisorderSelection(keys: string[], disorderTags: DisorderTreeTag[]): string[] {
  const byId = new Map((Array.isArray(disorderTags) ? disorderTags : []).map((t) => [t.id, t]));
  const out = new Set<string>();
  for (const k of Array.isArray(keys) ? keys : []) {
    if (!k) continue;
    if (isDisorderFamilyKey(k)) {
      for (const t of byId.values()) {
        if (disorderFamilyOf(t.name) === k) out.add(t.id);
      }
    } else if (byId.has(k)) {
      out.add(k);
    }
  }
  return [...byId.keys()].filter((id) => out.has(id));
}

// ─── ستون ۴ درخت واحد: «پایه تحصیلی» — همان الگوی اختلال‌ها () ───
// حوزه‌های تحصیلی «در کد» نسخه‌پذیرند؛ اعضا برچسب‌های dynamic با category=grade هستند.
// قاعدهٔ تطبیق متنی (اولین تطبیق برنده)؛ برچسب ناشناخته به «سایر پایه‌ها»ی پویا می‌رود.
// به تصمیم کاربر، کلینیک فقط پیش‌دبستانی تا ششم دبستان را پوشش می‌دهد؛
// دوره‌های متوسطهٔ اول/دوم حذف شدند و برچسب‌های seed آن‌ها با مهاجرت 0084 از DB پاک شد.
// برچسب پایهٔ خارج از این دامنه (اگر روزی ساخته شود) خودکار زیر «سایر پایه‌ها» می‌رود.
export interface GradeBand {
  key: string;
  fa: string;
  icon: string; // نام آیکون در ui.js PATHS
  hint: string; // راهنمای کوتاه — tooltip ردیف حوزه
  match: RegExp[]; // قاعدهٔ تطبیق نام برچسب پایه → حوزه (اولین تطبیق برنده است)
}

export const GRADE_BAND_OTHER_KEY = 'band_other';

export const GRADE_BANDS: GradeBand[] = [
  {
    key: 'band_preschool',
    fa: 'پیش‌دبستانی',
    icon: 'heart',
    hint: 'آماده‌سازی پیش از دبستان — پیش‌نیازهای آوایی، دیداری-حرکتی و مفاهیم پایه',
    match: [/پیش.?دبستانی/, /مهدکودک/]
  },
  {
    key: 'band_primary',
    fa: 'دبستان — اول تا ششم',
    icon: 'book',
    hint: 'دورهٔ ابتدایی — جای اصلی مداخله‌های خواندن، نوشتن و حساب',
    // قاعدهٔ تطبیق = زیررشتهٔ ساده (سبک \b با خط فارسی کار نمی‌کند)؛ اولین تطبیق برنده است
    match: [/اول/, /دوم/, /سوم/, /چهارم/, /پنجم/, /ششم/, /ابتدایی/]
  }
];

/** حوزهٔ هر برچسب پایه — اولین تطبیق برنده است؛ ناشناخته → «سایر پایه‌ها» */
export function gradeBandOf(name: string): string {
  const n = String(name ?? '');
  for (const band of GRADE_BANDS) {
    if (band.match.some((re) => re.test(n))) return band.key;
  }
  return GRADE_BAND_OTHER_KEY;
}

export function isGradeBandKey(key: string): boolean {
  return key === GRADE_BAND_OTHER_KEY || GRADE_BANDS.some((b) => b.key === key);
}

export interface GradeTreeTag {
  id: string;
  name: string;
}
export interface GradeTreeBand {
  key: string;
  fa: string;
  icon: string;
  hint: string;
  tags: GradeTreeTag[];
}

/**
 * درخت ستون پایه تحصیلی برای درخت واحد: حوزه‌های ثابت به ترتیب دوره + «سایر پایه‌ها» فقط اگر عضو دارد.
 * حوزهٔ خالی نمایش داده نمی‌شود تا درخت همیشه پرمحتوا بماند (آینهٔ buildDisorderTree).
 */
export function buildGradeTree(gradeTags: GradeTreeTag[]): GradeTreeBand[] {
  const list = Array.isArray(gradeTags) ? gradeTags : [];
  const tree: GradeTreeBand[] = [];
  for (const band of GRADE_BANDS) {
    const members = list.filter((t) => gradeBandOf(t.name) === band.key);
    if (members.length > 0) tree.push({ key: band.key, fa: band.fa, icon: band.icon, hint: band.hint, tags: members });
  }
  const others = list.filter((t) => gradeBandOf(t.name) === GRADE_BAND_OTHER_KEY);
  if (others.length > 0) {
    tree.push({ key: GRADE_BAND_OTHER_KEY, fa: 'سایر پایه‌ها', icon: 'puzzle', hint: 'برچسب‌های پایه خارج از دوره‌های بالا', tags: others });
  }
  return tree;
}

// ─── گسترش انتخاب ستون پایه تحصیلی به شناسهٔ برچسب (فیلتر GET /api/exercises?grade=) ───
// آینهٔ expandDisorderSelection: کلید دوره → همهٔ برچسب‌های عضو؛ شناسهٔ برچسب → خودش
// (فقط شناسه‌های شناخته‌شده)؛ بدون تکرار و پایدار به ترتیب ورودی برچسب‌ها.
export function expandGradeSelection(keys: string[], gradeTags: GradeTreeTag[]): string[] {
  const byId = new Map((Array.isArray(gradeTags) ? gradeTags : []).map((t) => [t.id, t]));
  const out = new Set<string>();
  for (const k of Array.isArray(keys) ? keys : []) {
    if (!k) continue;
    if (isGradeBandKey(k)) {
      for (const t of byId.values()) {
        if (gradeBandOf(t.name) === k) out.add(t.id);
      }
    } else if (byId.has(k)) {
      out.add(k);
    }
  }
  return [...byId.keys()].filter((id) => out.has(id));
}

// ─── درخت واحد طبقه‌بندی کارت: چهار ستون، یک شکل ───
// «برچسب‌ها» و «درخت هدف» دو منبعِ یک درخت واحدند (تصمیم ):
// ستون‌های علمی (info/exec) برگ‌شان کلید هدف است؛ ستون‌های dynamic (disorder/grade) برگ‌شان شناسهٔ برچسب.
// ذخیره‌سازی تفکیک‌شده می‌ماند: کلید info/exec → exercise_focus_links · شناسهٔ برچسب → exercise_tags.
export interface TaxonomyLeaf {
  key: string; // کلید مهارت هدف یا شناسهٔ برچسب — یکتا در کل درخت
  fa: string;
  hint?: string;
  tagId?: string; // ستون‌های dynamic — برگ = برچسب واقعی DB
}
export interface TaxonomyDomain {
  key: string; // کلید حوزه/خانواده — برای ستون dynamic انتخاب خانواده یعنی همهٔ برگ‌ها
  fa: string;
  icon: string;
  hint?: string;
  leaves: TaxonomyLeaf[];
}
export interface TaxonomyPillar {
  key: string;
  fa: string;
  icon: string;
  source: 'focus' | 'tag'; // مقصد ذخیره: کلید هدف (focus) یا شناسهٔ برچسب (tagIds)
  domains: TaxonomyDomain[];
}

export interface TaxonomySources {
  disorderTags: DisorderTreeTag[];
  gradeTags: GradeTreeTag[];
}

/** درخت واحد چهارستونه برای meta — ترتیب: پردازش اطلاعات، کارکردهای اجرایی، اختلال‌ها، پایه تحصیلی */
export function buildTaxonomyTree(sources: TaxonomySources): TaxonomyPillar[] {
  const disorder = buildDisorderTree(sources.disorderTags ?? []);
  const grade = buildGradeTree(sources.gradeTags ?? []);
  const focusPillars: TaxonomyPillar[] = FOCUS_TREE.map((p) => ({
    key: p.key,
    fa: p.fa,
    icon: p.icon,
    source: 'focus' as const,
    domains: p.domains.map((d) => ({
      key: d.key,
      fa: d.fa,
      icon: d.icon,
      leaves: d.skills.map((s) => ({ key: s.key, fa: s.fa, hint: s.hint }))
    }))
  }));
  const tagPillar = (key: string, fa: string, icon: string, families: { key: string; fa: string; icon: string; hint: string; tags: { id: string; name: string }[] }[]): TaxonomyPillar => ({
    key,
    fa,
    icon,
    source: 'tag' as const,
    domains: families.map((f) => ({
      key: f.key,
      fa: f.fa,
      icon: f.icon,
      hint: f.hint,
      leaves: f.tags.map((t) => ({ key: t.id, fa: t.name, tagId: t.id }))
    }))
  });
  return [
    ...focusPillars,
    tagPillar('disorder', 'اختلال‌ها', 'puzzle', disorder),
    tagPillar('grade', 'پایه تحصیلی', 'school', grade)
  ];
}

export const FOCUS_TREE: FocusPillar[] = [PILLAR_INFO, PILLAR_EXEC];

type KeyEntry =
  | { kind: 'pillar'; pillar: FocusPillar }
  | { kind: 'domain'; pillar: FocusPillar; domain: FocusDomain }
  | { kind: 'skill'; pillar: FocusPillar; domain: FocusDomain; skill: FocusSkill };

const KEY_INDEX: Map<string, KeyEntry> = (() => {
  const map = new Map<string, KeyEntry>();
  for (const p of FOCUS_TREE) {
    map.set(p.key, { kind: 'pillar', pillar: p });
    for (const d of p.domains) {
      map.set(d.key, { kind: 'domain', pillar: p, domain: d });
      for (const s of d.skills) map.set(s.key, { kind: 'skill', pillar: p, domain: d, skill: s });
    }
  }
  return map;
})();

/** همهٔ کلیدهای مجاز — ستون‌ها، حوزه‌ها و مهارت‌های برگ */
export function allFocusKeys(): string[] {
  return [...KEY_INDEX.keys()];
}

export function isValidFocusKey(key: string): boolean {
  return KEY_INDEX.has(key);
}

/** برچسب فارسی هر کلید (برای خطاهای اعتبارسنجی و بج‌ها) */
export function focusLabel(key: string): string | undefined {
  const e = KEY_INDEX.get(key);
  if (!e) return undefined;
  if (e.kind === 'skill') return e.skill.fa;
  if (e.kind === 'domain') return e.domain.fa;
  return e.pillar.fa;
}

/**
 * گسترش هر کلید به «خودش + همهٔ مهارت‌های برگ زیرمجموعه‌اش»:
 * انتخاب ستون = خود ستون و همهٔ مهارت‌ها؛ انتخاب حوزه = خودش و مهارت‌هایش؛ انتخاب مهارت = خودش.
 * کارت می‌تواند در هر سطحی (ستون/حوزه/مهارت) متصل شده باشد؛ گسترش خودکلید، پوشش آن را تضمین می‌کند.
 * خروجی به ترتیب درخت (برای پرس‌وجوی پایدار) و بدون تکرار.
 */
export function expandFocusKeys(keys: string[]): string[] {
  const out = new Set<string>();
  for (const k of keys) {
    const e = KEY_INDEX.get(k);
    if (!e) continue;
    out.add(k);
    if (e.kind === 'domain') {
      for (const s of e.domain.skills) out.add(s.key);
    } else if (e.kind === 'pillar') {
      for (const d of e.pillar.domains) {
        out.add(d.key);
        for (const s of d.skills) out.add(s.key);
      }
    }
  }
  // ترتیب درختی پایدار — کلیدهای ذخیره‌شده می‌توانند ستون/حوزه/مهارت باشند (خودکلید حفظ می‌شود)
  return allFocusKeys().filter((k) => out.has(k));
}

export function allSkillKeys(): string[] {
  return FOCUS_TREE.flatMap((p) => p.domains.flatMap((d) => d.skills.map((s) => s.key)));
}

/** مرتب‌سازی کلیدهای ذخیره‌شدهٔ یک کارت به ترتیب درخت (بدون افزودن یا حذف عضو) */
export function sortFocusKeys(keys: string[]): string[] {
  const set = new Set(keys);
  return allFocusKeys().filter((k) => set.has(k));
}

// نگاشت backfill برچسب‌های موجود → مهارت هدف (در مهاجرت 0083 به‌کار رفته؛ این ثابت برای گاه‌شمار و تست هم‌خوانی است)
export const FOCUS_BACKFILL_BY_TAG_NAME: Record<string, string> = {
  'حافظهٔ فعال': 'memory_working',
  'حافظهٔ کاری': 'memory_working',
  'دقت و تمرکز': 'attention_sustained',
  'هماهنگی حرکتی': 'perception_visomotor',
  'تنظیم رفتار': 'ef_inhibition',
  'روخوانی': 'fluency_auto',
  'درک مطلب': 'lang_comprehension',
  'توجه': 'attention_sustained'
};
