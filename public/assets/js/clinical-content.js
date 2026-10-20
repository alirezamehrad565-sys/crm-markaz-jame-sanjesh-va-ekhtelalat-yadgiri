// clinical-content.js — محتوای ثابت تب «تفسیر بالینی» — جداسازی محتوا از موتور
// ─────────────────────────────────────────────────────────────────────────────
// همهٔ متن‌ها، برچسب‌ها، کلیدهای ابزار و متادیتای گام‌های «مسیر بالینی» این‌جاست.
// موتور (clinical-insights.js) فقط منطق رندر و ارتباط با API دارد؛ ویرایش محتوا
// (چیدمان گام‌ها، متن راهنما، برچسب وضعیت‌ها) بدون دست‌زدن به منطق از همین فایل انجام می‌شود.
//
// قرارداد کلیدها: کلیدهای ابزار باید با تعریف case_event_types سمت سرور هم‌خوان بمانند
//.

// ───────── کلیدهای ابزار مسیر ارزیابی ─────────

/** گام ۱ — شرح‌حال */
export const ANAMNESIS_KEY = 'ce-anamnesis-v2';

/** گام ۲ — غربالگری: SDQ خانواده (پیوست سامانه) + SDQ معلم */
export const SCREEN_KEYS = ['sdq-parent', 'ce-sdq-t-v1'];

/** گام ۳ — فرم‌های تخصصی بنا به نشانه‌ها */
export const SPECIFIC_KEYS = [
  'ce-snap-iv-p-v1', 'ce-snap-iv-t-v1', 'ce-scared-p-v1', 'ce-dcdq-v1',
  'ce-sld-read-v1', 'ce-sld-wri-v1', 'ce-sld-calc-v1',
  'ce-asd-criteria-v1', 'ce-speech-criteria-v1', 'ce-odd-criteria-v1'
];

/** گام ۴ مسیر یادگیری — آزمون‌های کوتاه عملکرد */
export const PROBE_KEYS = ['ce-probe-read-v1', 'ce-probe-write-v1', 'ce-probe-calc-v1'];

// ───────── شاخهٔ توانبخشی + وکسلر ۴ ─────────

export const REHAB_COG_KEY = 'ce-rehab-cog-v1';
export const REHAB_MOTOR_KEY = 'ce-rehab-motor-v1';
export const REHAB_ADL_KEY = 'ce-rehab-adl-v1';
export const REHAB_JOURNEY_KEYS = [REHAB_COG_KEY, REHAB_MOTOR_KEY, REHAB_ADL_KEY];

/** فرم نتایج عمومی */
export const RESULTS_KEY = 'ce-results-v1';

/** وکسلر ۴ — ثبت نمرهٔ خام (: مربی فقط خام وارد می‌کند؛ موتور استاندارد می‌سازد) */
export const WISC4_KEY = 'ce-wechsler-w4-v1';

/** گام ۲ مسیر استاندارد — فرم تصمیم شک بالینی */
export const SUSPICION_KEY = 'ce-clinical-suspicion-v1';

/** قالب مسیر خالیِ شاخهٔ یادگیری — درمانگر جلسات را بر حسب نیم‌رخ می‌سازد */
export const LEARNING_BLANK_TEMPLATE_KEY = 'tpl-learning-blank';

/** — چک‌لیست‌های خواندن/نوشتن/ریاضی — گیت گام ۴ مسیر یادگیری */
export const SLD_CHECKLIST_KEYS = ['ce-sld-read-v1', 'ce-sld-wri-v1', 'ce-sld-calc-v1'];
// SLD_CHECKLIST_TITLES حذف شد (39-C — export مرده بود؛ برچسب‌ها از تعریف فرم سرور می‌آید)

// ───────── برچسب‌های وضعیت ─────────

/** وضعیت چهارحالتهٔ ملاک‌های DSM (پلن §۵ گام ۱) */
export const CRITERION_STATUS = {
  met: { label: 'برآورده', cls: 'badge--success' },
  partial: { label: 'ناقص', cls: 'badge--warning' },
  not_met: { label: 'برآورده‌نشده', cls: 'badge--neutral' },
  unknown: { label: 'نیاز به بررسی', cls: 'badge--info' }
};

/** اطمینان توصیفی — هرگز قطعیت ادعا نمی‌کند (پلن §۶ قاعدهٔ ۴) */
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

// ───────── انواع آیتم پیوست جلسه (خواستهٔ کاربر) — +رویداد (فرم/پرسش‌نامه) ─────────

export const SESSION_ITEM_TYPES = [
  { key: 'exercise', label: 'تمرین', placeholder: 'مثلاً: تمرین آگاهی واجی — حذف صدای اول واژه (۵ دقیقه)' },
  { key: 'homework', label: 'تکلیف', placeholder: 'مثلاً: خواندن برگهٔ تمرین برای خانواده + ثبت زمان' },
  { key: 'game', label: 'بازی', placeholder: 'مثلاً: بازی کارت‌های هم‌خانواده (۱۰ دقیقه)' },
  { key: 'event', label: 'رویداد (فرم/پرسش‌نامه)', placeholder: 'فرم یا پرسش‌نامهٔ این جلسه — با «افزودن رویداد» از رویدادساز انتخاب کنید' },
  { key: 'instruction', label: 'دستورالعمل', placeholder: 'مثلاً: برای جلسهٔ بعد متن جلسه را آماده کنید — نوار پیشرفت پر شود' }
];

export const SESSION_ITEM_LABELS = Object.fromEntries(SESSION_ITEM_TYPES.map((t) => [t.key, t.label]));

// ───────── برچسب فرم‌های نتایج (کارت «نتایج ارزیابی») ─────────

export const RESULTS_EVENT_LABELS = {
  [REHAB_COG_KEY]: 'ارزیابی شناختی',
  [REHAB_MOTOR_KEY]: 'ارزیابی حرکتی-جسمی',
  [REHAB_ADL_KEY]: 'مهارت‌های خودیاری',
  [RESULTS_KEY]: 'فرم نتایج',
  [WISC4_KEY]: 'وکسلر ۴',
  [SUSPICION_KEY]: 'تصمیم شک بالینی'
};

/** مکمل متنی برای هر گام — کلیدها با کلیدهای گیت سرور (STANDARD_PATHWAY_ORDER) هم‌خوان‌اند */
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
    learningActionLabel: 'ثبت چک‌لیست خواندن/نوشتن/ریاضی',
    rehabActionLabel: 'چک‌لیست مهارتی'
  },
  needs: {
    actionLabel: 'ثبت نتیجهٔ درمانگر و انتخاب مسیر'
  }
};

/** بلوک تصمیم شک بالینی — عنوان و متن‌ها */
export const SUSPICION_CONTENT = {
  head: 'شک بیش‌فعالی/اضطراب — تصمیم مرحلهٔ ۲',
  decidedBadge: 'تصمیم ثبت شد',
  pendingBadge: 'بدون تصمیم',
  emptyHint: 'با رسیدن نتایج چک‌لیست‌ها، تصمیم شک همین‌جا — قبل از وکسلر — ثبت می‌شود.',
  recordLabel: 'ثبت تصمیم شک بالینی',
  updateLabel: 'ثبت/به‌روزرسانی تصمیم',
  levelHigh: 'محتمل — شواهد هم‌گرا',
  levelWatch: 'قابل پایش',
  sourcesPrefix: 'منابع: '
};

// ───────── زمینهٔ تفسیر (داده‌های جمعیت‌شناختی × خروجی موتور) ─────────

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

// ───────── مراحل آکاردئونی تب تفسیر بالینی (m135 — جایگزین STEPPER_META و STAGE_META) ─────────

/**
 * متادیتای ۶ مرحلهٔ آکاردئونی — کلیدهای گیت با STANDARD_PATHWAY_ORDER سرور هم‌خوان‌اند؛
 * «protocol» گیت سرور نیست (از gates.protocol می‌آید — UX-SPEC §3.6). سرور مالک
 * label/detail گیت‌هاست؛ این‌جا فقط عنوان سربرگ، خط «در یک نگاه» و متن‌های حالت خالی/قفل.
 * قرارداد placeholder‌ها: {n} {m} {k} اعداد فارسی‌شده با fa()؛ {date} با formatJalaliDateTime؛
 * {main} نام فرضیهٔ اصلی؛ {coh} هم‌گرا/ناقص/واگرا؛ {p} درصد اطمینان؛ {protocol}/{status}
 * برچسب‌های PROTOCOL_LABELS و PATH_STATUS_LABEL. هیچ عدد لاتینی در متن‌ها مجاز نیست.
 */
export const STAGE2_META = {
  stages: {
    anamnesis: {
      num: 1,
      title: 'شرح‌حال',
      glanceEmpty: 'فرم گفت‌وگوی اول با خانواده ثبت نشده است',
      emptyHint: 'مسیر بالینی با شرح‌حال شروع می‌شود — گفت‌وگوی اول، خط پایهٔ نشانه‌ها و تاریخچهٔ خانواده را می‌سازد.'
    },
    behavioral: {
      num: 2,
      title: 'چک‌لیست‌های خانواده و معلم',
      glanceZero: 'چک‌لیستی پاسخ نشده است',
      glanceSome: '{n} چک‌لیست پاسخ‌شده',
      glanceSuspicion: { decided: 'شک: ثبت‌شده', pending: 'شک: بدون تصمیم' },
      emptyHint: 'نتایج چک‌لیست‌های خانواده و معلم مبنای تصمیم شک بالینی است — با SDQ خانواده و معلم شروع کنید.'
    },
    wechsler: {
      num: 3,
      title: 'وکسلر ۴ — نیم‌رخ هوشی',
      glanceFull: 'FSIQ {fsiq} (صدک {p}) — فرضیهٔ اصلی: {main}',
      glanceFsiq: 'FSIQ {fsiq} (صدک {p})',
      glanceMain: 'فرضیهٔ اصلی: {main}',
      glanceManual: 'ثبت دستی — نیم‌رخ موتور برای این ثبت ساخته نشده',
      glanceEmpty: 'نمرهٔ خام وکسلر ثبت نشده است',
      glanceDate: 'ثبت: {date}',
      bodyCta: 'ثبت نمرهٔ خام وکسلر ۴',
      emptyHint: 'با ثبت نمرهٔ خام ۱۵ خرده‌آزمون، موتور FSIQ و شاخص‌ها و فرضیهٔ اصلی را می‌سازد و همین‌جا نمایش می‌دهد.',
      footnote: 'تحلیل موتور پشتیبان تصمیم بالینی است و به‌تنهایی تشخیص نیست — تفسیر نهایی با روان‌سنج یا متخصص پرونده است.'
    },
    skills: {
      num: 4,
      title: 'ارزیابی عملکردی',
      glanceOt: 'پیمایش {n} از {m} مهارت',
      glanceOtProbe: '{ot} · {k} آزمون عملکرد',
      glanceFallback: 'پس از تعیین مسیر پرونده فعال می‌شود',
      emptyHint: 'ارزیابی عملکردی بسته به مسیر پرونده انتخاب می‌شود — چک‌لیست خواندن/نوشتن/ریاضی یا چک‌لیست مهارتی پس از تعیین مسیر فعال می‌شود.'
    },
    needs: {
      num: 5,
      title: 'جمع‌بندی تشخیصی',
      glance: 'شواهد: {coh} — اطمینان {p}٪',
      emptyHint: 'جمع‌بندی از هم‌گرایی شواهد مراحل ۱ تا ۴ ساخته می‌شود — با ثبت داده‌ها، توضیح اصلی و فرضیه‌ها همین‌جا می‌نشیند.'
    },
    protocol: {
      num: 6,
      title: 'ورود به قالب مداخله',
      glanceActive: '{protocol} · مسیر: {status}',
      glanceNoPath: '{protocol} · مسیری ثبت نشده',
      glanceLocked: 'پس از ثبت نتیجهٔ نیاز ویژه باز می‌شود',
      lockedNote: 'این مرحله با ثبت نتیجهٔ نیاز ویژه در مرحلهٔ ۵ باز می‌شود — آن‌جا جمع‌بندی شواهد و پروتکل مداخله انتخاب می‌شود.',
      protocolStripTitle: 'گام‌های استاندارد پروتکل فعال',
      monitoringLink: 'پایش مهارتی در مرحلهٔ ۴ ادامه دارد'
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
    hypotheses:  { label: 'فرضیه‌ها، حوزه‌های ضعیف و پرچم‌های روایی', count: '{n} فرضیه' }
  },
  showMoreRows: '{n} سطر دیگر…',
  showMoreItems: '{n} مورد دیگر…'
};

/** کارت جمع‌بندی تشخیصی — تیترهای بخش‌های داخلی */
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
