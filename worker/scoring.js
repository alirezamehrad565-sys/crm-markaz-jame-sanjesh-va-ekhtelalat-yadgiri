// ─────────────────────────────────────────────────────────────────────────────
// scoring.js (v2 — m140) — موتور امتیازدهی سراسری درمانگران + تابلوی پیشرفت
//: صفرسازی + وزن یکنواخت اقدام‌های پایه + سقف اداری مدیر/معاون + شرح امتیاز
// ─────────────────────────────────────────────────────────────────────────────
// خواست کاربر:
// «امتیاز همه کارکنان رو حذف صفر کن از الان همه چیز ها شروع بشه»
// «تعریف دانش آموز و... هر کدوم 1 امتیاز بشه»
// «یه بالانس کن که امتیاز مدیر و معاون بیشتر از درمانگران پیشرفت نکنه برای کارای اداری»
//
// → SCORING_EPOCH: هر فعالیتی قبل از این لحظه در تابلو صفر است (شروع تازه).
// → همهٔ اقدام‌های پایهٔ استفاده از سامانه = ۱ امتیاز (پرونده، نوبت، گزارش، …).
// → نقش‌های دفتری (مدیر و معاون/منشی) هرچقدر هم کار اداری ثبت کنند، سهم «فعالیت
// اداری»‌شان در هر دوره سقف دارد — پیشرفت تابلو با تولید محتوا و کار بالینی است.
// خواست کاربر:
// «فرمول ارجاع و.. رو سراسری کن ما یه تابلوی پیشرفت داریم برای درمانگران»
// «میخوام استفاده ای که از سایت میکنن ملاک امتیازشون بشه»
// «ثبت گزارش، اینکه خودشون نوبت ثبت کنن، دانش آموز تعریف کنن، کسی رو تو لیست
// انتظار بزارن و... سراسری باشه — از قالب ها تمرین ها... همه اطلاعات رو جمع
// کنه لاگ ها رو بخونه و بزاره داخل تابلوی پیشرفت درمانگران»
//
// بازنویسی v2 (m140) — بدون تغییر شکل پاسخ تابلو؛ تغییرها:
// ۱) ضد-اسنپ‌شات (درس 43-A): ایزولیت طولانی‌عمر Worker می‌تواند نشست D1 کهنه را
//    نگه دارد و «مقدار اصلاح‌شدهٔ» created_by را کهنه بخواند → همهٔ خواندن‌های
//    تابلو/شرح از نشست تازهٔ first-primary می‌رود (feature-detect — ماک تست بدون
//    withSession همان env.DB را می‌گیرد تا vitest بشکند).
// ۲) ارجاع تمرین (exerciseRefs): ارسال‌های کلاسی (assigned_by با پیشوند
//    «class:<id>» — معلم مدرسه ردیف staff ندارد) «استفادهٔ همکار» نیستند →
//    از ارجاع حذف شدند؛ ولی در «استفاده» (exerciseUses) همچنان شمرده می‌شوند.
// ۳) ورود مردهٔ «assessment.create» از USAGE_FORMULA حذف شد — هیچ سرویسی
//    هیچ‌وقت این audit action را نمی‌نوشت (grep=0) → ردیف مرده بود.
// ۴) GET /api/scoring/explain (فقط مدیر) — شرح شفاف امتیاز یک همکار در یک دوره؛
//    رتبه/امتیازها از همان computeBoard همان دوره خوانده می‌شود (تک‌منبع حقیقت).
//
// طراحی ثابت:
// - تک‌فرمول سراسری: امتیاز = محتوا (تولید + استفاده + ارجاع)
// + استفادهٔ واقعی از سامانه (projection مستقیم روی audit_log).
// - فرمول در هیچ UI‌ای نشان داده نمی‌شود و در پاسخ API تابلو هم نیست
//   (تنها استثنا: explain — مخصوص مدیر، عمداً با اجازهٔ کاربر).
// - بدون شمارندهٔ نگهداری‌شده — همه‌چیز محاسبهٔ زنده از دادهٔ واقعی است؛
//   حذف یا دستکاری رکورد خودش در امتیاز منعکس می‌شود (شفافیت).
// - این ماژول فقط می‌خواند (READ-ONLY) — هیچ endpoint نوشتنی ندارد.
// - احراز هویت همان نشست HS256 باندل اصلی است (AUTH_SECRET / settings /
// dev-secret — همان ترتیب resolveSessionSecret).
// ─────────────────────────────────────────────────────────────────────────────

// ── فرمول سراسری — تک‌منبع حقیقت وزن‌ها (فقط سمت سرور؛ UI فرمول را نشان نمی‌دهد) ──

/**
 * بخش محتوا — بازتنظیم وزن‌ها به دستور کاربر:
 * «تولید تمرین نمرهش بیاد پایین تر ارجاع نمره رو خیلی بالاتر ببره»
 * تولیدِ محتوا فی‌نفسه امتیاز کمتری دارد؛ محتوایی که همکاران واقعاً مصرف کنند
 * (ارجاع/استفادهٔ همکار) امتیاز چند برابر می‌گیرد — تمرکز تابلو بر محتوای
 * به‌کاررفته است نه انبار تمرین. لنگر: یک اقدام پایهٔ سامانه = ۱ امتیاز.
 * وزن‌ها فقط همین‌جاست (سمت سرور) — هیچ UI‌ای فرمول را نشان نمی‌دهد.
 */
export const CONTENT_FORMULA = {
  production: [
    { key: 'exercises', weight: 4, label: 'تمرین' },
    { key: 'packages', weight: 8, label: 'بستهٔ تمرینی' },
    { key: 'templates', weight: 8, label: 'قالب مسیر' },
    { key: 'forms', weight: 6, label: 'فرم دست‌ساز' }
  ],
  usage: [
    { key: 'exerciseUses', weight: 4, label: 'ارسال تکلیف از تمرین' },
    { key: 'templateUses', weight: 8, label: 'ساخت مسیر از قالب' },
    { key: 'formFills', weight: 3, label: 'تکمیل فرم' }
  ],
  reference: [
    { key: 'exerciseRefs', weight: 20, label: 'استفادهٔ همکار از تمرین' },
    { key: 'templateRefs', weight: 30, label: 'ساخت مسیر توسط همکار' },
    { key: 'formRefs', weight: 14, label: 'تکمیل فرم توسط همکار' }
  ]
};

/**
 * بخش استفادهٔ سراسری — از audit_log
 * فقط اقدام‌های «سازنده» امتیاز دارند؛ ویرایش/حذف/جابه‌جایی امتیاز ندارد.
 * — وزن یکنواخت: هر اقدام پایه = ۱ امتیاز (خواست کاربر: «تعریف دانش آموز
 * و... هر کدوم 1 امتیاز بشه»). تفاوت واقعی امتیاز را تولید محتوا می‌سازد.
 * — v2: «assessment.create» حذف شد — هیچ سرویسی این action را در audit_log
 * نمی‌نویسد (سنجش‌ها از مسیرهای دیگر ثبت می‌شوند) → ورود مرده بود.
 * ترتیب: [action، وزن، برچسب فارسی، گروه]
 */
export const USAGE_FORMULA = [
  ['student.create', 1, 'تشکیل پروندهٔ دانش‌آموز', 'پرونده'],
  ['appointment.create', 1, 'ثبت نوبت', 'نوبت‌دهی'],
  ['appointment.copy_week', 1, 'کپی هفتهٔ کاری', 'نوبت‌دهی'],
  ['session_note.created', 1, 'ثبت گزارش جلسه', 'گزارش'],
  ['case_event.created', 1, 'ثبت رویداد پرونده', 'گزارش'],
  ['case_event.finalized', 1, 'جمع‌بندی رویداد پرونده', 'گزارش'],
  ['waitlist.create', 1, 'ثبت متقاضی جدید', 'لیست انتظار'],
  ['waitlist.call', 1, 'پیگیری تماس متقاضی', 'لیست انتظار'],
  ['waitlist.schedule', 1, 'نوبت‌دهی متقاضی', 'لیست انتظار'],
  ['waitlist.admitted', 1, 'پذیرش متقاضی', 'لیست انتظار'],
  ['screening.create', 1, 'ثبت غربال روزانه', 'سنجش'],
  ['ot.session.saved', 1, 'ثبت جلسهٔ درمانی', 'درمان'],
  ['clinical_path.create', 1, 'ساخت مسیر بالینی', 'درمان'],
  ['followup.created', 1, 'ایجاد پیگیری', 'پیگیری'],
  ['todo.completed', 1, 'انجام کار واگذارشده', 'کار روزانه'],
  ['attendance.mark', 1, 'ثبت حضور و غیاب', 'کار روزانه'],
  ['knowledge.create', 1, 'ثبت محتوای دانشی', 'محتوا'],
  ['announcement.create', 1, 'انتشار اعلان', 'محتوا']
];

// ── صفرسازی و بالانس نقش‌های دفتری ──────────────────────────────────

/**
 * شروع دورهٔ امتیاز (UTC «YYYY-MM-DD HH:MM:SS») — هر فعالیتِ قبل از این لحظه
 * در تابلو صفر است (خواست کاربر: «امتیاز همه کارکنان رو حذف صفر کن از الان
 * همه چیز ها شروع بشه»). — از تنظیمات قابل‌تغییر است (تنظیمات ←
 * «امتیازبندی همکاران»)؛ این ثابت فقط پیش‌فرضِ پیش از ذخیرهٔ تنظیمات است.
 */
export const SCORING_EPOCH = '2026-10-14 20:30:00';

/**
 * — سقف فعالیت اداری نقش‌های دفتری در هر دوره.
 * مدیر و معاون/منشی کار اداری زیاد انجام می‌دهند (پرونده، نوبت، لیست انتظار)؛
 * برای اینکه تابلو با حجم کار اداری جلو نزند، سهم امتیاز «استفادهٔ سامانه»
 * این نقش‌ها در هر دوره سقف دارد. تولید محتوا (تمرین/قالب/فرم) سقف ندارد.
 */
export const ADMIN_CAP_ROLES = ['manager', 'secretary', 'supervisor'];
export const ADMIN_USAGE_CAP = 20;

// ── پیکربندی قابل‌تنظیم امتیازدهی (تنظیمات ← «امتیازبندی همکاران») ────

/**
 * خواست کاربر:
 * «یه دسترسی بده که تاریخ شروع محاسبه نمره همکاران که الان 23 ام هست رو
 * خودم انتخاب کنم تو تنظیمات و فرمول امتیاز بندی هم همچنین»
 *
 * → SCORING_EPOCH و وزن‌های فرمول دیگر ثابت نیستند؛ مدیر از تنظیمات (فقط خودش)
 * «تاریخ شروع شمارش» و وزن‌های فرمول را عوض می‌کند. مقادیر در جدول settings
 * با کلید SCORING_CONFIG_KEY ذخیره می‌شود و موتور در هر درخواست می‌خواند.
 * شکل ذخیره‌شده: { epoch: "YYYY-MM-DD HH:MM:SS" (UTC), weights: { … } }
 * هر مقدار غایب/نامعتبر = پیش‌فرض همان ثابت‌های بالای فایل.
 */
export const SCORING_CONFIG_KEY = 'scoring_config';

/** وزن مؤثر — عدد صحیح مجاز، وگرنه پیش‌فرض */
export function clampWeight(v, fallback) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 10000) return fallback;
  return n;
}

/**
 * فرمول محتوای مؤثر — وزن‌های ذخیره‌شده در تنظیمات روی پیش‌فرض سوار می‌شود.
 * کلیدها همان کلیدهای CONTENT_FORMULA هستند (تک‌منبع حقیقت).
 */
export function effectiveContentFormula(weights) {
  if (!weights || typeof weights !== 'object') return CONTENT_FORMULA;
  const pick = (list) => list.map((x) => ({ ...x, weight: clampWeight(weights[x.key], x.weight) }));
  return {
    production: pick(CONTENT_FORMULA.production),
    usage: pick(CONTENT_FORMULA.usage),
    reference: pick(CONTENT_FORMULA.reference)
  };
}

/**
 * فرمول استفادهٔ مؤثر — «وزن هر اقدام پایه» (baseAction) روی همهٔ اقدام‌های
 * پایه یکنواخت سوار می‌شود (: اقدام‌های پایه وزن یکنواخت دارند).
 */
export function effectiveUsageFormula(weights) {
  const base = clampWeight(weights?.baseAction ?? 1, 1);
  return USAGE_FORMULA.map(([action, , label, group]) => [action, base, label, group]);
}

/** سقف فعالیت اداری مؤثر */
export function effectiveAdminCap(weights) {
  return clampWeight(weights?.adminCap ?? ADMIN_USAGE_CAP, ADMIN_USAGE_CAP);
}

/**
 * خواندن پیکربندی امتیازدهی از جدول settings — هر خطا/شکل نامعتبر = پیش‌فرض.
 * @param {D1Database} d1
 * @returns {Promise<{epoch?: string, weights?: Record<string, number>}>}
 */
export async function readScoringConfig(d1) {
  try {
    const row = await d1.prepare(`SELECT value FROM settings WHERE key = ? LIMIT 1`).bind(SCORING_CONFIG_KEY).first();
    if (!row || typeof row.value !== 'string') return {};
    const parsed = JSON.parse(row.value);
    if (!parsed || typeof parsed !== 'object') return {};
    const out = {};
    if (typeof parsed.epoch === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(parsed.epoch)) {
      out.epoch = parsed.epoch;
    }
    if (parsed.weights && typeof parsed.weights === 'object') out.weights = parsed.weights;
    return out;
  } catch {
    return {}; // سطر خراب یا جدول در دسترس نیست → پیش‌فرض‌ها
  }
}

/**
 * cutoff مؤثر دوره = بزرگ‌ترِ cutoff دورهٔ انتخابی و SCORING_EPOCH.
 * نتیجه: همهٔ دوره‌ها هرگز از «شروع دورهٔ امتیاز» قدیمی‌تر نمی‌شوند.
 */
export function effectiveSince(periodKey, periods = PERIODS, now = new Date(), epoch = SCORING_EPOCH) {
  const cut = periodSinceUtc(periodKey, periods, now);
  if (!cut) return epoch;
  return cut > epoch ? cut : epoch;
}

/** — سطح‌بندی (تازه‌کار/فعال/…) حذف شد: «باجت‌ها غیرمحترمانه است — فقط امتیاز» */

/** بازه‌های زمانی تابلو — محاسبه روی created_at UTC */
export const PERIODS = {
  all: { key: 'all', label: 'کل دوره', sinceIso: null },
  month: { key: 'month', label: '۳۰ روز اخیر', days: 30 },
  week: { key: 'week', label: '۷ روز اخیر', days: 7 }
};

// ── توابع محض (قابل تست بدون Workers runtime) ────────────────────────────────

/** وزن هر action — Map برای lookup سریع */
export function usageWeightMap(formula = USAGE_FORMULA) {
  return new Map(formula.map(([action, weight]) => [action, weight]));
}

/**
 * اعمال وزن‌ها روی سطرهای تجمیع‌شدهٔ audit_log
 * @param {Array<{actorId:string, action:string, count:number}>} aggRows
 * @returns {{ points: Record<string, number>, counts: Record<string, Record<string, number>> }}
 */
export function applyUsageWeights(aggRows, formula = USAGE_FORMULA) {
  const weights = usageWeightMap(formula);
  const points = {};
  const counts = {};
  for (const row of aggRows) {
    const w = weights.get(row.action);
    if (!w) continue; // اقدام‌های بی‌وزن (ویرایش/حذف/سیستمی) امتیازی ندارند
    points[row.actorId] = (points[row.actorId] ?? 0) + w * row.count;
    (counts[row.actorId] ??= {})[row.action] = (counts[row.actorId]?.[row.action] ?? 0) + row.count;
  }
  return { points, counts };
}

/** امتیاز بخش محتوا — فرمول مؤثر (: وزن‌های تنظیم‌شده یا پیش‌فرض) */
export function contentScoreOf(c, formula = CONTENT_FORMULA) {
  const prod = formula.production.reduce((s, x) => s + x.weight * (c[x.key] ?? 0), 0);
  const use = formula.usage.reduce((s, x) => s + x.weight * (c[x.key] ?? 0), 0);
  const ref = formula.reference.reduce((s, x) => s + x.weight * (c[x.key] ?? 0), 0);
  return { production: prod, usage: use, reference: ref, total: prod + use + ref };
}

/**
 * — نمرهٔ مشارکت عملی برای «آمار دوره»: جمع وزن‌دار بخش تولید محتوا
 * (تمرین/بسته/قالب/فرم) برای شمارش‌های خام یک بازه — تک‌منبع وزن‌ها همان
 * CONTENT_FORMULA است تا فرمول هیچ‌وقت دو جا نشیند. — formula اختیاری:
 * گزارش دوره هم با وزن‌های تنظیم‌شدهٔ مدیر محاسبه می‌شود.
 * — m140: شمارش تمرینِ ورودی باید وزن‌دار تیمی باشد
 * (SUM(CASE WHEN team_created=1 THEN 0.5 ELSE 1 END)) نه COUNT(*).
 * @param {{exercises?:number, packages?:number, templates?:number, forms?:number}} counts
 * @param {{production?: Array<{key:string, weight:number}>}} [formula]
 */
export function productionScoreOf(counts, formula = CONTENT_FORMULA) {
  return (formula.production ?? CONTENT_FORMULA.production).reduce((s, x) => s + x.weight * (counts?.[x.key] ?? 0), 0);
}

/** رتبه‌بندی مسابقه‌ای — امتیاز برابر = رتبه برابر */
export function rankRows(rows) {
  const sorted = [...rows].sort(
    (a, b) => b.total - a.total || a.fullName.localeCompare(b.fullName, 'fa')
  );
  let prevScore = null;
  let prevRank = 0;
  return sorted.map((r, i) => {
    const rank = r.total === prevScore ? prevRank : i + 1;
    prevScore = r.total;
    prevRank = rank;
    return { ...r, rank };
  });
}

/** timestamp UTC cutoff برای دوره — null یعنی از ابتدا */
export function periodSinceUtc(periodKey, periods = PERIODS, now = new Date()) {
  const p = periods[periodKey];
  if (!p) throw new Error(`دورهٔ نامعتبر: ${periodKey}`);
  if (p.key === 'all') return null;
  return new Date(now.getTime() - p.days * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
}

// ── اجرای واقعی روی D1 ────────────────────────────────────────────────────────

/**
 * — v3 (m141): کل تابلو در «یک» کوئری و «یک» اسنپ‌شات.
 *
 * درس واقعی م۱۳۹/م۱۴۰ (بازگشتِ دوبارهٔ باگ در م۱۴۰): خواندن‌های موازی (Promise.all)
 * روی یک نشست D1 — حتی با withSession('first-primary') — می‌توانند اسنپ‌شات‌های
 * «متفاوت» ببینند؛ نتیجهٔ زنده: فهرست آیتم‌ها ۹ تمرین نشان می‌داد و جمع وزن‌دارِ
 * همان پاسخ صفر بود. راه‌حل ریشه‌ای: شمارش همهٔ دسته‌ها + استفادهٔ سامانه + ردیفِ
 * همهٔ کارکنان در «یک» SELECT (زیرکوئری‌های همبسته) — کوئریِ اولِ نشستِ
 * first-primary همیشه از primary می‌خواند و همهٔ ستون‌ها از یک لحظهٔ واحد می‌آیند؛
 * مسیر ساختاریِ واگراییِ «فهرست در برابر جمع» کاملاً بسته می‌شود.
 * nonce تصادفی هم هر کش احتمالی سطح statement را دور می‌زند.
 *
 * @param {string|null} sinceUtc — null یعنی بدون فیلتر دوره
 * @param {Array<string>} usageActions — کلیدهای اقدام‌های وزن‌دار استفاده
 * @returns {{sql: string, params: Array}} — ترتیب پارامترها دقیقاً مطابق ظهورِ ? در SQL
 */
function boardSqlAndParams(sinceUtc, usageActions) {
  const P = [];
  const since = (col) => {
    if (!sinceUtc) return '';
    P.push(sinceUtc);
    return ` AND ${col} >= ?`;
  };
  // ستون‌های محتوا — هر کدام یک زیرکوئری همبسته روی s.id (همان فیلترهای نسخهٔ قبل)
  const metrics = [
    ['exercises',
      // تولید محتوا — m166: تمرین با هم‌ساز واقعی (co_created_by) نصف وزن برای هر دو نفر
      // (سازندهٔ اصلی ۰٫۵ + هم‌ساز ۰٫۵ = ۱)؛ تمرین تیمیِ قدیمی (team_created=1) هم ۰٫۵.
      // همان زیرکوئری برای ردیفِ هم‌ساز هم ۰٫۵ می‌دهد — جمعِ هر تمرین در تابلو = ۱.
      `(SELECT COALESCE(SUM(CASE WHEN e.co_created_by IS NOT NULL OR e.team_created = 1 THEN 0.5 ELSE 1 END), 0)
          FROM exercises e
         WHERE e.deleted_at IS NULL
           AND (e.created_by = s.id OR e.co_created_by = s.id)${since('e.created_at')})`],
    ['packages',
      `(SELECT COUNT(*) FROM exercise_packages p
        WHERE p.deleted_at IS NULL AND p.created_by = s.id${since('p.created_at')})`],
    ['templates',
      `(SELECT COUNT(*) FROM pathway_templates t
        WHERE t.active = 1 AND t.created_by = s.id${since('t.created_at')})`],
    ['forms',
      `(SELECT COUNT(*) FROM case_event_types f
        WHERE f.is_system = 0 AND f.active = 1 AND f.created_by = s.id${since('f.created_at')})`],
    ['exerciseUses',
      // استفاده از تمرین‌ها (ارسال‌های کلاسی هم «استفاده» هستند)
      `(SELECT COUNT(*)
          FROM exercise_assignments a JOIN exercises e ON e.id = a.exercise_id
         WHERE e.deleted_at IS NULL AND e.created_by = s.id
           AND a.status != 'cancelled'${since('a.created_at')})`],
    ['exerciseRefs',
      // ارجاع تمرین — مصرف توسط همکار دیگر؛ ارسال‌های کلاسی ('class:<id>'))
      // معلم مدرسه ردیف staff ندارد → «استفادهٔ همکار» نیست (در استفاده می‌آید)
      `(SELECT COUNT(*)
          FROM exercise_assignments a JOIN exercises e ON e.id = a.exercise_id
         WHERE e.deleted_at IS NULL AND e.created_by = s.id
           AND a.status != 'cancelled' AND a.assigned_by != e.created_by
           AND (a.assigned_by IS NULL OR a.assigned_by NOT LIKE 'class:%')${since('a.created_at')})`],
    ['templateUses',
      // استفاده از قالب‌ها — مسیر ساخته‌شده از قالب
      `(SELECT COUNT(*)
          FROM intervention_paths p JOIN pathway_templates t ON t.key = p.template_key
         WHERE p.deleted_at IS NULL AND t.created_by = s.id${since('p.created_at')})`],
    ['templateRefs',
      // ارجاع قالب — ساخت مسیر توسط همکار دیگر
      `(SELECT COUNT(*)
          FROM intervention_paths p JOIN pathway_templates t ON t.key = p.template_key
         WHERE p.deleted_at IS NULL AND t.created_by = s.id
           AND p.created_by != t.created_by${since('p.created_at')})`],
    ['formFills',
      // استفاده از فرم‌های دست‌ساز
      `(SELECT COUNT(*)
          FROM case_events ce JOIN case_event_types f ON f.id = ce.event_type_id
         WHERE f.is_system = 0 AND f.created_by = s.id
           AND ce.status != 'cancelled'${since('ce.created_at')})`],
    ['formRefs',
      // ارجاع فرم — ثبت توسط همکار دیگر
      `(SELECT COUNT(*)
          FROM case_events ce JOIN case_event_types f ON f.id = ce.event_type_id
         WHERE f.is_system = 0 AND f.created_by = s.id AND ce.status != 'cancelled'
           AND ce.staff_id IS NOT NULL AND ce.staff_id != f.created_by${since('ce.created_at')})`]
  ];
  // استفادهٔ سامانه — JSON تجمیعی audit_log در همان ردیف (پارامترهایش بعد از since ها)
  P.push(...usageActions);
  const actionList = usageActions.map(() => '?').join(',');
  const usageJson = `(SELECT COALESCE(json_group_array(json_object('a', u.action, 'c', u.c)), '[]')
                        FROM (SELECT al.action AS action, COUNT(*) AS c
                                FROM audit_log al
                               WHERE al.actor_id = s.id
                                 AND al.action IN (${actionList})${since('al.created_at')}
                               GROUP BY al.action) u)`;
  const nonce = Math.random().toString(36).slice(2, 10);
  const sql = `SELECT s.id AS staffId, s.full_name AS fullName,
         COALESCE(s.role_ext, s.role) AS role, s.active AS active,
         ${metrics.map(([k, expr]) => `${expr} AS ${k}`).join(',\n         ')},
         ${usageJson} AS usageJson
    FROM staff s
   ORDER BY s.full_name /* board:${nonce} */`;
  return { sql, params: P };
}

/**
 * محاسبهٔ تابلوی پیشرفت برای یک دوره — v3: تک‌کوئریِ تک‌اسنپ‌شات
 * @param {D1Database} d1
 * @param {string|null} sinceUtc «YYYY-MM-DD HH:MM:SS» UTC یا null (پیش از فراخوانی، effectiveSince اعمال شود)
 * @param {{contentFormula?: object, usageFormula?: Array, adminCap?: number}} [cfg] — وزن‌های مؤثر
 */
export async function computeBoard(d1, sinceUtc, cfg = {}) {
  const contentFormula = cfg.contentFormula ?? CONTENT_FORMULA;
  const usageFormula = cfg.usageFormula ?? USAGE_FORMULA;
  const adminCap = Number.isInteger(cfg.adminCap) ? cfg.adminCap : ADMIN_USAGE_CAP;
  const usageActions = usageFormula.map(([a]) => a);

  const { sql, params } = boardSqlAndParams(sinceUtc, usageActions);
  const boardRows = await d1.prepare(sql).bind(...params).all();

  // استفادهٔ سراسری — از usageJsonِ همان ردیف‌ها (همان projection قبلی روی audit_log)
  const agg = [];
  for (const r of boardRows.results) {
    let arr = [];
    try {
      arr = JSON.parse(r.usageJson ?? '[]');
    } catch {
      arr = []; // سطر خراب → استفادهٔ صفر برای همین همکار
    }
    for (const u of arr) {
      if (u && u.a) agg.push({ actorId: r.staffId, action: String(u.a), count: Number(u.c) || 0 });
    }
  }
  const { points: usagePoints, counts: usageCounts } = applyUsageWeights(agg, usageFormula);

  const usageLabels = Object.fromEntries(USAGE_FORMULA.map(([a, , label]) => [a, label]));
  const rows = boardRows.results.map((r) => {
    const content = {
      exercises: Number(r.exercises) || 0,
      packages: Number(r.packages) || 0,
      templates: Number(r.templates) || 0,
      forms: Number(r.forms) || 0,
      exerciseUses: Number(r.exerciseUses) || 0,
      exerciseRefs: Number(r.exerciseRefs) || 0,
      templateUses: Number(r.templateUses) || 0,
      templateRefs: Number(r.templateRefs) || 0,
      formFills: Number(r.formFills) || 0,
      formRefs: Number(r.formRefs) || 0
    };
    const cs = contentScoreOf(content, contentFormula);
    // سقف فعالیت اداری نقش‌های دفتری (مدیر و معاون): پیشرفت تابلو
    // با حجم کار اداری بالا نمی‌رود؛ تولید محتوا کامل حساب می‌شود.
    const rawUsage = usagePoints[r.staffId] ?? 0;
    const isAdminRole = ADMIN_CAP_ROLES.includes(r.role);
    const usage = isAdminRole ? Math.min(rawUsage, adminCap) : rawUsage;
    const usageDetail = Object.fromEntries(
      Object.entries(usageCounts[r.staffId] ?? {}).map(([a, c]) => [a, c])
    );
    const total = cs.total + usage;
    return {
      staffId: r.staffId,
      fullName: r.fullName,
      role: r.role,
      active: r.active === 1,
      content,
      contentScore: cs,
      usagePoints: usage,
      usageCapped: isAdminRole && rawUsage > adminCap,
      usageDetail,
      usageLabels,
      total
    };
  });
  return rankRows(rows);
}

// ── احراز هویت نشست — همان قرارداد باندل اصلی (HS256) ────────────────────────

function b64uDecode(part) {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

async function verifySessionJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64uDecode(p)));
  } catch {
    return null;
  }
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify('HMAC', key, b64uDecode(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!valid) return null;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  if (!payload.sub) return null;
  return payload;
}

async function resolveSessionSecret(env) {
  if (env.AUTH_SECRET && env.AUTH_SECRET.length >= 16) return env.AUTH_SECRET;
  if (env.ENV === 'development' || env.ENV === 'test') return 'center-dev-session-secret';
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'sys_auth_secret' LIMIT 1`).first();
  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      if (typeof parsed === 'string' && parsed.length >= 32) return parsed;
    } catch { /* سطر خراب → ساخت secret جدید در باندل اصلی */ }
  }
  // secret در settings نیست — نمی‌سازیم (سازندهٔ رسمی همان باندل است)؛ بی‌مجاز پاس می‌دهیم
  throw new Error('sys_auth_secret یافت نشد');
}

async function requireAuth(request, env) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const secret = await resolveSessionSecret(env);
  return verifySessionJwt(token, secret);
}

// ── هندلر مسیرهای /api/scoring/* ──────────────────────────────────────────────

/**
 * — v2 (درس 43-A): ضد-اسنپ‌شاتِ نشست D1.
 * ایزولیت طولانی‌عمر Worker ممکن است نشست (session) قدیمی D1 را نگه دارد و
 * اسنپ‌شات «پیش از اصلاحِ داده» بخواند — باگ واقعی م139: تابلو پس از اصلاح
 * مستقیم created_by هنوز مقدار کهنه را نشان می‌داد تا دیپلوی سرد.
 * راه‌حل: همهٔ خواندن‌های تابلو/شرح روی نشست تازهٔ «first-primary» انجام می‌شود
 * (خواندن همیشه از primary = آخرین نوشته). feature-detect: ماک D1 تست‌ها
 * (node:sqlite) withSession ندارد → همان binding اصلی برمی‌گردد تا vitest نشکند.
 * @param {{DB?: unknown}} env
 */
function scoringDb(env) {
  if (env.DB && typeof env.DB.withSession === 'function') {
    return env.DB.withSession('first-primary');
  }
  return env.DB;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

/**
 * لمسِ بی‌اثر برای پیش‌بردن bookmark نشست D1 — درس تکرارشدهٔ م۱۳۹/م۱۴۰.
 * یک UPDATE بی‌اثر روی settings (مقدار = خودش) تراکنشِ نوشتنِ کوچکی می‌سازد که
 * bookmark نشست را به «آخرین حالت ثابت‌شده» می‌برد؛ همهٔ خواندن‌های بعدیِ همان
 * نشست read-your-writes می‌شوند و دیگر اسنپ‌شات کهنه برنمی‌گردند.
 * در محیط تست (جدول settings نیست) بی‌صدا رد می‌شود.
 */
const BOOKMARK_TOUCH_SQL = `INSERT INTO settings (key, value) VALUES ('scoring_config', '{}')
                             ON CONFLICT(key) DO UPDATE SET value = settings.value`;

export async function bumpSessionBookmark(db) {
  try {
    await db.prepare(BOOKMARK_TOUCH_SQL).run();
  } catch {
    // بی‌خطر: در ماک/تست‌ها جدول settings نیست؛ خواندن‌ها به قرارداد نشست
    // («first-primary») تکیه می‌کنند.
  }
}

export async function handleScoring(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  const authed = await requireAuth(request, env).catch(() => null);
  if (!authed) {
    return json({ error: 'UNAUTHORIZED', message: 'ابتدا وارد حساب شوید' }, 401);
  }

  // — v2: نشست تازهٔ D1 برای همهٔ خواندن‌ها (ضد-اسنپ‌شات — درس 43-A)
  const db = scoringDb(env);
  // — v3 (m141): پیش‌بردن bookmark نشست با لمسِ بی‌اثر — خواندن‌های بعدی
  // همین نشست تضمینی «آخرین نوشته» را می‌بینند (درس تکرارشدهٔ م۱۳۹/م۱۴۰).
  await bumpSessionBookmark(db);

  // GET /api/scoring/board?period=all|month|week — تابلوی پیشرفت درمانگران
  if (path === '/api/scoring/board' && request.method === 'GET') {
    const periodKey = url.searchParams.get('period') ?? 'all';
    if (!PERIODS[periodKey]) {
      return json({ error: 'VALIDATION_ERROR', message: 'دورهٔ نامعتبر است' }, 400);
    }
    // پیکربندی از تنظیمات: تاریخ شروع شمارش + وزن‌های فرمول (مدیر)
    const cfg = await readScoringConfig(db);
    // صفرسازی: cutoff مؤثر هرگز قدیمی‌تر از تاریخ شروع انتخابی نیست
    const since = effectiveSince(periodKey, PERIODS, new Date(), cfg.epoch ?? SCORING_EPOCH);
    const rows = await computeBoard(db, since, {
      contentFormula: effectiveContentFormula(cfg.weights),
      usageFormula: effectiveUsageFormula(cfg.weights),
      adminCap: effectiveAdminCap(cfg.weights)
    });
    // فرمول دیگر در پاسخ نیست: وزن‌ها سمت سرور می‌مانند و هیچ UI‌ای
    // آن را نمایش نمی‌دهد («بدون اینکه از فرمول مطلع بشن»)
    return json({
      data: {
        period: PERIODS[periodKey].key,
        periodLabel: PERIODS[periodKey].label,
        since,
        generatedAt: new Date().toISOString(),
        rows
      }
    });
  }

  // GET /api/scoring/explain?staffId=<uuid>&period=all|month|week
  // — v2: شرح شفاف امتیاز یک همکار — فقط مدیر مرکز (عمداً؛ فرمول برای کارکنان پنهان می‌ماند)
  if (path === '/api/scoring/explain' && request.method === 'GET') {
    // نقش فراخوان همیشه تازه از DB خوانده می‌شود (نه فقط از توکن)
    const meRow = await db
      .prepare(`SELECT id, COALESCE(role_ext, role) AS role FROM staff WHERE id = ? LIMIT 1`)
      .bind(authed.sub)
      .first();
    if (!meRow) {
      return json({ error: 'UNAUTHORIZED', message: 'ابتدا وارد حساب شوید' }, 401);
    }
    if (meRow.role !== 'manager') {
      return json({ error: 'FORBIDDEN', message: 'شرح امتیاز فقط برای مدیر مرکز مجاز است' }, 403);
    }
    const staffId = url.searchParams.get('staffId') ?? '';
    if (!staffId) {
      return json({ error: 'VALIDATION_ERROR', message: 'staffId الزامی است' }, 400);
    }
    const periodKey = url.searchParams.get('period') ?? 'all';
    if (!PERIODS[periodKey]) {
      return json({ error: 'VALIDATION_ERROR', message: 'دورهٔ نامعتبر است' }, 400);
    }

    const cfg = await readScoringConfig(db);
    const since = effectiveSince(periodKey, PERIODS, new Date(), cfg.epoch ?? SCORING_EPOCH);
    const contentFormula = effectiveContentFormula(cfg.weights);
    const usageFormula = effectiveUsageFormula(cfg.weights);
    const adminCap = effectiveAdminCap(cfg.weights);

    // تابلو همان دوره — رتبه و امتیازها از همان computeBoard خوانده می‌شود
    // (تک‌منبع حقیقت: شرح هرگز با تابلو نمی‌خواند)
    const rows = await computeBoard(db, since, { contentFormula, usageFormula, adminCap });
    const row = rows.find((r) => r.staffId === staffId);
    if (!row) {
      return json({ error: 'NOT_FOUND', message: 'کارمند یافت نشد' }, 404);
    }

    // آیتم‌های محتوا per-staff — دقیقاً همان فیلترهای کوئری تابلوی تک‌اسنپ‌شات
    // — v3: ترتیبی (نه Promise.all) — خواندن‌های پشت‌سرهمِ یک نشست هرگز از
    // اسنپ‌شاتِ خواندن قبلیِ همان نشست عقب‌تر نیستند.
    const W = since ? ' AND created_at >= ?' : '';
    const P = since ? [since] : [];
    // m166: آیتم‌های تمرین — تمرین‌های ساختهٔ این همکار + تمرین‌هایی که هم‌سازش بوده
    const exerciseItems = await db
      .prepare(`SELECT id, title, team_created, co_created_by FROM exercises WHERE deleted_at IS NULL AND (created_by = ? OR co_created_by = ?)${W} ORDER BY created_at`)
      .bind(staffId, staffId, ...P).all();
    const packageItems = await db
      .prepare(`SELECT id, title FROM exercise_packages WHERE deleted_at IS NULL AND created_by = ?${W} ORDER BY created_at`)
      .bind(staffId, ...P).all();
    const templateItems = await db
      .prepare(`SELECT key, title FROM pathway_templates WHERE active = 1 AND created_by = ?${W} ORDER BY created_at`)
      .bind(staffId, ...P).all();
    const formItems = await db
      .prepare(`SELECT id, title FROM case_event_types WHERE is_system = 0 AND active = 1 AND created_by = ?${W} ORDER BY created_at`)
      .bind(staffId, ...P).all();

    const prodW = (key) => contentFormula.production.find((x) => x.key === key)?.weight ?? 0;
    const exWeight = prodW('exercises');
    // تمرین: count = شمارش خام؛ effectiveWeight = وزن مؤثر هر قلم (تیمی/هم‌سازدار نصف)
    const exerciseList = exerciseItems.results.map((r) => {
      // m166: هم‌ساز بودن هم «نصف امتیاز» است — تمرینِ ساختهٔ دیگری که این همکار
      // هم‌سازش بوده در همین فهرست با وزن ۰٫۵ می‌آید
      const teamCreated = r.team_created === 1 || Boolean(r.co_created_by);
      return {
        id: r.id,
        title: r.title,
        teamCreated,
        effectiveWeight: exWeight * (teamCreated ? 0.5 : 1)
      };
    });

    // استفادهٔ سامانه — از usageDetail همان ردیف تابلو (شمارش‌های audit_log) + برچسب/وزن فرمول مؤثر
    const uWeights = usageWeightMap(usageFormula);
    const uLabels = Object.fromEntries(usageFormula.map(([a, , label]) => [a, label]));
    const actions = Object.entries(row.usageDetail)
      .map(([action, count]) => ({
        action,
        label: uLabels[action] ?? action,
        count,
        points: (uWeights.get(action) ?? 0) * count
      }))
      .sort((a, b) => b.points - a.points || b.count - a.count || a.action.localeCompare(b.action));
    const rawPoints = actions.reduce((s, a) => s + a.points, 0);
    const isAdminRole = ADMIN_CAP_ROLES.includes(row.role);

    return json({
      data: {
        period: PERIODS[periodKey].key,
        periodLabel: PERIODS[periodKey].label,
        since,
        generatedAt: new Date().toISOString(),
        staff: { staffId: row.staffId, fullName: row.fullName, role: row.role },
        content: {
          // — v3 (m141): weighted = «جمع وزن‌دار به امتیاز» = شمارش وزن‌دار تیمی × وزن
          // فرمول مؤثر (همان عددی که در سرجمع بخش دیده می‌شود — ۱۱ تمرین × ۱۰ = ۱۱۰)
          exercises: {
            count: exerciseList.length,
            weighted: row.content.exercises * exWeight,
            weight: exWeight,
            items: exerciseList
          },
          packages: {
            count: row.content.packages,
            weighted: row.content.packages * prodW('packages'),
            weight: prodW('packages'),
            items: packageItems.results.map((r) => ({ id: r.id, title: r.title }))
          },
          templates: {
            count: row.content.templates,
            weighted: row.content.templates * prodW('templates'),
            weight: prodW('templates'),
            // — ستون انسانی قالب «title» است؛ شناسهٔ منطقی «key»
            items: templateItems.results.map((r) => ({ id: r.key, title: r.title }))
          },
          forms: {
            count: row.content.forms,
            weighted: row.content.forms * prodW('forms'),
            weight: prodW('forms'),
            // — قرارداد پین‌شده: فیلد «name» (ستون واقعی جدول: title)
            items: formItems.results.map((r) => ({ id: r.id, name: r.title }))
          }
        },
        usage: {
          actions,
          rawPoints,
          adminCap: isAdminRole ? adminCap : null,
          capped: row.usageCapped,
          appliedPoints: row.usagePoints
        },
        totals: {
          contentScore: row.contentScore.total,
          usagePoints: row.usagePoints,
          total: row.total,
          rank: row.rank
        },
        config: {
          epoch: cfg.epoch ?? SCORING_EPOCH,
          weightsFromSettings: Boolean(cfg.weights)
        }
      }
    });
  }

  return json({ error: 'NOT_FOUND', message: 'مسیر درخواستی یافت نشد' }, 404);
}
