export const ANAMNESIS_KEY = 'ce-anamnesis-v3';
export const ANAMNESIS_LEGACY_KEY = 'ce-anamnesis-v2';

export const SCREEN_KEYS = ['sdq-parent', 'ce-sdq-t-v1'];

export const SPECIFIC_KEYS = [
  'ce-snap-iv-p-v1', 'ce-snap-iv-t-v1', 'ce-scared-p-v1', 'ce-dcdq-v1',
  'ce-sld-read-v1', 'ce-sld-wri-v1', 'ce-sld-calc-v1',
  'ce-asd-criteria-v1', 'ce-speech-criteria-v1', 'ce-odd-criteria-v1'
];

export const PROBE_KEYS = ['ce-probe-read-v1', 'ce-probe-write-v1', 'ce-probe-calc-v1'];

export const REHAB_COG_KEY = 'ce-rehab-cog-v1';
export const REHAB_MOTOR_KEY = 'ce-rehab-motor-v1';
export const REHAB_ADL_KEY = 'ce-rehab-adl-v1';
export const REHAB_JOURNEY_KEYS = [REHAB_COG_KEY, REHAB_MOTOR_KEY, REHAB_ADL_KEY];

export const REHAB_FX_KEY = 'ce-rehab-fx-v1';

export const REHAB_FX_GUIDE = {
  title: 'پشتوانهٔ علمی و نحوهٔ استفاده',
  items: [
    'این فرم چیست؟ شش تکلیف کوتاه و ساده که کودک در مرکز انجام می‌دهد. با آن‌ها توجه، حافظه، مهار تکانش، انعطاف و حل‌مسئلهٔ کودک سنجیده می‌شود. الگوی تکلیف‌ها از آزمون‌های شناخته‌شدهٔ کودکان گرفته شده و ساده‌سازی شده است.',
    'نمرهٔ این فرم با «بقیهٔ هم‌سن‌ها» مقایسه نمی‌شود. عدد هر تکلیف با یک ملاک روشن مقایسه می‌شود؛ مثلاً ۱۰ دقیقه توجه پیوسته یا یادآوری ۴ رقم. همین ملاک‌ها پایهٔ هدف جلسهٔ کاردرمانی می‌شوند.',
    '«سطح راهنما» یعنی کودک برای انجام تکلیف به چقدر کمک نیاز داشت: از بدون کمک تا کمک کامل. هرچه کمک کمتری لازم باشد، یعنی کودک مستقل‌تر است. کم‌شدن کمک در جلسه‌های بعدی، یعنی کودک دارد یاد می‌گیرد.',
    'این فرم «خط پایه» است؛ یعنی عکس وضعیت کودک قبل از شروع تمرین‌ها. بدون خط پایه نمی‌شود گفت کودک چقدر بهتر شده است. پیشرفت در پنل پیشرفت با همین اعداد مقایسه می‌شود.',
    'نحوهٔ استفاده: در جلسهٔ اول مسیر حدود ۲۰ دقیقه وقت بگذارید و شش تکلیف را در مرکز اجرا کنید. عدد و سطح راهنمای هر تکلیف را ثبت کنید. سامانه خودش وضعیت (ضعف آشکار / مرزی / قوی) را نشان می‌دهد و روی چک‌لیست مهارتی کاردرمانی اولویت می‌گذارد. ۸ تا ۱۲ جلسه بعد، همان شش تکلیف را دوباره اجرا کنید تا پیشرفت مشخص شود.',
    'این فرم چه چیزی نیست: آزمون رسمی و استاندارد نیست و جای وکسلر یا ارزیابی‌های رسمی را نمی‌گیرد. ابزار کمکیِ درمانگر برای هدف‌گذاری و پیگیری پیشرفت است.'
  ]
};

export const RESULTS_KEY = 'ce-results-v1';

export const WISC4_KEY = 'ce-wechsler-w4-v1';

export const SUSPICION_KEY = 'ce-clinical-suspicion-v1';

export const LEARNING_BLANK_TEMPLATE_KEY = 'tpl-learning-blank';

export const SLD_CHECKLIST_KEYS = ['ce-sld-read-v1', 'ce-sld-wri-v1', 'ce-sld-calc-v1'];

export const CRITERION_STATUS = {
  met: { label: 'برآورده', cls: 'badge--success' },
  partial: { label: 'ناقص', cls: 'badge--warning' },
  not_met: { label: 'برآورده‌نشده', cls: 'badge--neutral' },
  unknown: { label: 'نیاز به بررسی', cls: 'badge--info' }
};

export const CONFIDENCE_BADGE = {
  'کم': 'badge--neutral',
  'متوسط': 'badge--warning',
  'زیاد': 'badge--success'
};

export const PATH_STATUS_BADGE = {
  suggested: 'badge--info',
  reviewed: 'badge--warning',
  active: 'badge--success',
  closed: 'badge--neutral'
};

export const PATH_STATUS_LABEL = {
  suggested: 'پیشنهاد موتور',
  reviewed: 'بازبینی‌شده',
  active: 'در مداخله',
  closed: 'بسته‌شده'
};

export const DECISION_LABEL = {
  confirm: 'تأیید',
  edit: 'اصلاح هدف',
  reject: 'رد',
  need_info: 'نیاز به اطلاعات بیشتر'
};

export const SESSION_ITEM_TYPES = [
  { key: 'exercise', label: 'تمرین', placeholder: 'مثلاً: تمرین آگاهی واجی — حذف صدای اول واژه (۵ دقیقه)' },
  { key: 'homework', label: 'تکلیف', placeholder: 'مثلاً: خواندن برگهٔ تمرین برای خانواده + ثبت زمان' },
  { key: 'game', label: 'بازی', placeholder: 'مثلاً: بازی کارت‌های هم‌خانواده (۱۰ دقیقه)' },
  { key: 'event', label: 'رویداد (فرم/پرسش‌نامه)', placeholder: 'فرم یا پرسش‌نامهٔ این جلسه — با «افزودن رویداد» از رویدادساز انتخاب کنید' },
  { key: 'instruction', label: 'دستورالعمل', placeholder: 'مثلاً: برای جلسهٔ بعد متن جلسه را آماده کنید — نوار پیشرفت پر شود' }
];

export const SESSION_ITEM_LABELS = Object.fromEntries(SESSION_ITEM_TYPES.map((t) => [t.key, t.label]));

export const RESULTS_EVENT_LABELS = {
  [REHAB_COG_KEY]: 'ارزیابی شناختی',
  [REHAB_MOTOR_KEY]: 'ارزیابی حرکتی-جسمی',
  [REHAB_ADL_KEY]: 'مهارت‌های خودیاری',
  [REHAB_FX_KEY]: 'ارزیابی عملکردی توانبخشی ذهنی',
  [RESULTS_KEY]: 'فرم نتایج',
  [WISC4_KEY]: 'وکسلر ۴',
  [SUSPICION_KEY]: 'تصمیم شک بالینی'
};

export const GATE_GLOSS = {
  anamnesis: {
    actionLabel: 'ثبت شرح‌حال'
  },
  behavioral: {
    actionLabel: 'ارسال چک‌لیست خانواده و معلم'
  },
  wechsler: {
    actionLabel: 'ثبت نمرهٔ خام وکسلر ۴',
    manualNote: 'ثبت دستی — برای تحلیل موتور، نمرهٔ خام ۱۵ خرده‌آزمون را در فرم وکسلر ۴ ثبت کنید'
  },
  skills: {
    learningActionLabel: 'ثبت آزمون عملکرد مرکزی',
    rehabActionLabel: 'ثبت ارزیابی عملکردی توانبخشی'
  },
  needs: {
    actionLabel: 'ثبت نتیجهٔ درمانگر و انتخاب مسیر'
  }
};

export const SUSPICION_CONTENT = {
  head: 'تصمیم شک بالینی',
  decidedBadge: 'تصمیم ثبت شد',
  recordLabel: 'ثبت تصمیم شک بالینی',
  updateLabel: 'ثبت/به‌روزرسانی تصمیم',
  levelHigh: 'محتمل — شواهد هم‌گرا',
  levelWatch: 'قابل پایش',
  sourcesPrefix: 'منابع: '
};

export const CONTEXT_META = {
  title: 'زمینهٔ تفسیر — دانش‌آموز در آینهٔ داده‌ها',
  hint: 'خروجی موتور همیشه در بستر سن و پایهٔ تحصیلی خوانده شود — همان چیزی که وکسلر با تاریخ تولد نرمال‌سازی می‌کند.',
  rows: {
    age: 'سن',
    birthDate: 'تاریخ تولد',
    grade: 'پایه',
    pathway: 'مسیر پرونده',
    fsiq: 'FSIQ',
    percentile: 'صدک',
    scatter: 'پراکندگی شاخص‌ها'
  },
  scatterNote: 'پراکندگی شاخص‌ها ≥۲۳ یعنی نیم‌رخ ناهمگن است — در این وضعیت FSIQ به‌تنهایی کافی نیست و تفسیر روی شاخص‌ها انجام می‌شود.',
  emptyWechsler: 'با ثبت نمرهٔ خام وکسلر ۴، صدک و نیم‌رخ این‌جا کنار سن و پایه می‌نشیند.',
  gapTemplate: (percentile, grade) =>
    `با صدک ${percentile} و پایهٔ تحصیلی جاری، انتظار عملکرد کلاس را با نیم‌رخ شناختی بسنجید — فاصلهٔ معنادار، شاخص اصلی مسیر یادگیری است.`
};

export const STAGE2_META = {
  stages: {
    anamnesis: {
      num: 1,
      title: 'شرح‌حال',
      glanceEmpty: 'فرم گفت‌وگوی اول با خانواده ثبت نشده است',
      emptyHint: 'مسیر بالینی با شرح‌حال شروع می‌شود — گفت‌وگوی اول، خط پایهٔ نشانه‌ها و تاریخچهٔ خانواده را می‌سازد.'
    },
    behavioral: {
      num: 3,
      title: 'چک‌لیست‌های خانواده و معلم',
      glanceZero: 'چک‌لیستی پاسخ نشده است',
      glanceSome: '{n} چک‌لیست پاسخ‌شده',
      glanceSuspicion: { decided: 'شک: ثبت‌شده' },
      emptyHint: 'نتایج چک‌لیست‌های خانواده و معلم این‌جا جمع می‌شود — با SDQ خانواده و معلم شروع کنید.',
    },
    wechsler: {
      num: 2,
      title: 'وکسلر ۴ — نیم‌رخ هوشی',
      glanceFsiq: 'FSIQ {fsiq} (صدک {p})',
      glanceFsiqOnly: 'FSIQ {fsiq}',
      glanceManual: 'ثبت دستی — نیم‌رخ موتور برای این ثبت ساخته نشده',
      glanceEmpty: 'نمرهٔ خام وکسلر ثبت نشده است',
      glanceDate: 'ثبت: {date}',
      bodyCta: 'ثبت نمرهٔ خام وکسلر ۴',
      emptyHint: 'با ثبت نمرهٔ خام ۱۵ خرده‌آزمون، موتور FSIQ، شاخص‌ها، پراکندگی و خوانش روان‌سنجی نیم‌رخ را همین‌جا محاسبه و نمایش می‌دهد.'
    },
    skills: {
      num: 4,
      title: 'ارزیابی عملکردی',
      glanceOt: 'پیمایش {n} از {m} مهارت',
      glanceSld: '{n} از ۳ آزمون عملکرد مرکزی ثبت شده',
      glanceSldZero: 'آزمون عملکرد مرکزی ثبت نشده است',
      glanceFallback: 'پس از تعیین مسیر پرونده فعال می‌شود',
      glanceFxNone: 'ارزیابی عملکردی توانبخشی ثبت نشده است',
      glanceFxDone: 'خط پایهٔ ذهنی ثبت شد — {ok} حیطه در انتظار از ۶',
      emptyHint: 'ارزیابی عملکردی = آزمونِ درمانگر در مرکز (خواندن، نوشتن، حساب) — در جلسهٔ حضوری از کودک گرفته می‌شود و همین‌جا ثبت می‌گردد. چک‌لیست‌های خانواده و معلم جای خود در مرحلهٔ ۲ است.'
    },
    needs: {
      num: 5,
      title: 'جمع‌بندی تشخیصی',
      glance: 'شواهد: {coh} — اطمینان {p}٪',
      emptyHint: 'جمع‌بندی از هم‌گرایی شواهد مراحل ۱ تا ۴ ساخته می‌شود — با ثبت داده‌ها، توضیح اصلی و فرضیه‌ها همین‌جا می‌نشیند.'
    },
    protocol: {
      num: 6,
      title: 'مداخله',
      glanceActive: '{protocol} · مسیر: {status}',
      glanceNoPath: '{protocol} · مسیری ثبت نشده',
      glanceLocked: 'پس از ثبت نتیجهٔ نیاز ویژه باز می‌شود',
      glanceWorkspace: 'میزکار مداخله — چک‌لیست مهارتی و ثبت جلسه‌به‌جلسه',
      workspaceNote: 'مسیر و پروتکل پس از جمع‌بندی تشخیصی فعال می‌شود؛ ثبت جلسه‌به‌جلسهٔ چک‌لیست مهارتی از همین میزکار انجام می‌شود.',
      lockedNote: 'این مرحله با ثبت نتیجهٔ نیاز ویژه در مرحلهٔ ۵ باز می‌شود — آن‌جا جمع‌بندی شواهد و پروتکل مداخله انتخاب می‌شود.',
      protocolStripTitle: 'گام‌های استاندارد پروتکل فعال',
      monitoringMoved: 'پایش مهارتی و ثبت جلسهٔ بعد به مرحلهٔ مداخله (آخرین مرحله) منتقل شده است — آن‌جا پنل پیشرفت جلسه‌به‌جلسه هم دارد',
      monitoringMovedRehab: 'خط پایهٔ عملکردی ثبت‌شده در پنل پیشرفت (مرحلهٔ مداخله) مرجع مقایسهٔ جلسه‌به‌جلسه است و بازسنجی هم از همان‌جا — این‌جا تکرار نمی‌شود',
      monitoringLink: 'پایش مهارتی و پیشرفت جلسه‌به‌جلسه در همین مرحله ادامه دارد'
    }
  },
  badges: {
    done: 'ثبت شده',
    current: 'گام جاری',
    todo: 'در انتظار',
    needsDone: 'پروتکل فعال شد',
    locked: 'پس از ثبت نتیجهٔ نیاز ویژه',
    wechslerNoData: 'ثبت نشده'
  },
  sub: {
    profile:     { label: 'نیم‌رخ شاخص‌ها', count: '{n} شاخص' },
    step5:       { label: 'قوت و ضعف فردی — گام ۵', count: '{n} مورد' },
    subtests:    { label: 'جدول خرده‌آزمون‌ها', count: '{n} آزمون' },
    comparisons: { label: 'مقایسه‌های دوبه‌دو خرده‌آزمون‌ها', count: '{n} مقایسه' },
    pairs:       { label: 'مقایسه‌های خوشه‌ای — تحلیل تفاضلی', count: '{n} جفت' },
    weakflags:   { label: 'حوزه‌های ضعیف و پرچم‌های روایی', count: '{n} مورد' }
  },
  showMoreRows: '{n} سطر دیگر…',
  showMoreItems: '{n} مورد دیگر…',
  stats: {
    anamnesisLast: 'آخرین شرح‌حال',
    anamnesisStaleLabel: 'تازگی',
    anamnesisStale: 'کهنه است — بازثبت لازم',
    behavioralAnswered: 'چک‌لیست پاسخ‌شده',
    suspicionSignals: 'سیگنال شک',
    wechslerScatter: 'پراکندگی شاخص‌ها',
    wechslerReassess: 'بازسنجی',
    skillsCoverage: 'مهارت پیمایش‌شده',
    skillsDomains: 'حیطهٔ فعال',
    skillsSld: 'آزمون مرکزی',
    skillsProbe: 'چک‌لیست درسی',
    skillsFx: 'حیطهٔ پایه در انتظار',
    needsCoverage: 'پوشش داده',
    needsConstructs: 'سازهٔ برجسته',
    needsPatterns: 'الگوی فعال',
    pathSteps: 'گام مسیر',
    pathSessions: 'جلسهٔ برنامه‌ریزی‌شده',
    protocolSuggestion: 'پیشنهاد:'
  }
};

export const SYNTHESIS_META = {
  title: 'جمع‌بندی تشخیصی',
  primaryTitle: 'توضیح اصلی',
  primaryHint: 'صورت‌بندی پرونده + نزدیک‌ترین فرضیهٔ موتور — دو نگاه به یک روایت',
  topHypothesis: 'نزدیک‌ترین فرضیهٔ موتور',
  constructsTitle: 'سازه‌های برجسته',
  patternsTitle: 'الگوهای تلفیقی',
  candidatesLabel: 'الگوهای نامزد',
  conflictsTitle: 'ناهم‌رأیی‌ها',
  flagsTitle: 'پرچم‌های ارجاع',
  nextTitle: 'گام بعدی',
  detailsTitle: 'جزئیات موتور تشخیصی',
  seenTitle: 'شواهد موجود'
};

export const PLAN_META = {
  title: 'ابزارهای پیشنهادی گام بعد',
  planTypeLabel: { جامع: 'پلن جامع', تکی: 'پلن تکی' },
  planTypeBadge: { جامع: 'badge--accent', تکی: 'badge--info' },
  basisLabel: 'مبنای پیشنهاد: ',
  priorityBadge: {
    core: { label: 'اساسی', cls: 'badge--accent' },
    recommended: { label: 'توصیه‌شده', cls: 'badge--info' },
    optional: { label: 'اختیاری', cls: 'badge--neutral' }
  },
  confirmLabel: 'تأیید یک‌کلیکی — ارسال ابزارهای پیشنهادی',
  confirmPickerTitle: 'ابزارهای پیشنهادی — به ترتیب اولویت (تأیید یک‌کلیکی)',
  editLabel: 'ویرایش / انتخاب دستی',
  editHint: 'برگشت به انتخاب دستی همیشه ممکن است — هیچ گزینه‌ای قفل نمی‌شود.',
  emptyItems: 'آیتم تازه‌ای برای ارسال نیست — همهٔ ابزارهای پیشنهادی در پرونده ثبت شده‌اند.',
  redLineLabel: 'خط قرمز ارجاع'
};
