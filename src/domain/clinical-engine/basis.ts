// کتابخانهٔ قاعدهٔ «اگر-آنگاه» پیوند نیم‌رخ به مداخله: برای هر یک از هجده هدفِ
// دانش‌نامه، قاعده‌هایی که از دادهٔ موجودِ پرونده تشخیص می‌دهند «مبنای پیشنهاد» فعال است
// یا نه — هیچ دادهٔ ورودی جدیدی به فرایند روزمره اضافه نمی‌شود؛ فقط تفسیرِ همان شواهد.
import type { EvidenceEvent } from './types';
import {
  engineFactsOf,
  anamV3ValueOf,
  ANAMNESIS_V2_KEY,
  PROBES,
  type EngineFacts
} from './infer';
import { FSIQ_BAND_BIF } from './rules';

export interface BasisRule {
  key: string;
  targetKey: string;
  ifFa: string;    // «اگر …» — شرط مشاهده‌شده در داده
  thenFa: string;  // «آنگاه …» — پیشنهاد مداخلهٔ متناظر
  sourceFa: string; // منبع دادهٔ ملاک (برای نمایش مبنا)
  detect: (f: EngineFacts) => boolean;
}

// — کمکی‌های تشخیص روی همان قرارداد موتور —
const WECHSLER_KEY = 'ce-wechsler-w4-v1';
const READ_CORE_KEY = 'ce-read-core-v1';
const READ_CORE_WEAK = 'ضعف آشکار';

function colorOf(f: EngineFacts, toolKey: string, subscaleId?: string): 'ok' | 'warn' | 'danger' | null {
  const event = f.latest.get(toolKey);
  if (!event) return null;
  if (subscaleId) {
    const ss = event.analysis?.subscaleScores?.find((s) => s.id === subscaleId);
    if (!ss) return null;
    if (ss.color) return ss.color;
  }
  return event.analysis?.band === null ? null : ((event.analysis?.band as 'ok' | 'warn' | 'danger' | undefined) ?? null);
}

function probeColor(f: EngineFacts, probeKey: string): 'ok' | 'danger' | null {
  const def = PROBES.find((p) => p.toolKey === probeKey);
  const event = f.latest.get(probeKey);
  if (!def || !event) return null;
  const raw = event.payload?.[def.valueField]?.value;
  const grade = event.payload?.[def.gradeField]?.value;
  if (raw === undefined || !grade) return null;
  const value = Number(String(raw).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  const n = def.norm[grade];
  if (!Number.isFinite(value) || !n) return null;
  return value < n * 0.8 ? 'danger' : 'ok';
}

function readCoreLevel(f: EngineFacts, itemKey: string): string | null {
  return f.latest.get(READ_CORE_KEY)?.payload?.[itemKey]?.value ?? null;
}

function anamNum(f: EngineFacts, fieldKey: string): number | null {
  const label = f.latest.get(f.anamKey)?.payload?.[fieldKey]?.value ?? '';
  if (!label) return null;
  if (f.anamKey === ANAMNESIS_V2_KEY) return null; // قواعد ساخت‌یافته فقط روی v3
  return anamV3ValueOf(fieldKey, label);
}

const weakIndex = (v: number | null) => v !== null && v < 85;

export const BASIS_RULES: BasisRule[] = [
  // ─── نارساخوانی ───
  {
    key: 'dyslexia_pa', targetKey: 'dyslexia',
    ifFa: 'آگاهی واج‌شناختی در هستهٔ خواندن «ضعف آشکار» است',
    thenFa: 'تمرین‌های واج‌شناسی (بخشیدن، ترکیب، قافیه) روزانهٔ کوتاه + رمزگشایی هدایت‌شده روی واژهٔ تازه',
    sourceFa: 'هستهٔ خواندن',
    detect: (f) => readCoreLevel(f, 'pa') === READ_CORE_WEAK
  },
  {
    key: 'dyslexia_fluency', targetKey: 'dyslexia',
    ifFa: 'روانی‌خواندن در پروب زیر ۸۰٪ انتظار پایه است',
    thenFa: 'تمرین روانی و تکرار — خواندن تکراریِ متن هم‌پایه با نمودار پیشرفت',
    sourceFa: 'پروب روانی‌خواندن',
    detect: (f) => probeColor(f, 'ce-probe-read-v1') === 'danger'
  },
  // ─── نارسانویسی ───
  {
    key: 'dysgraphia_probe', targetKey: 'dysgraphia',
    ifFa: 'روانی‌نوشتن/املا در پروب زیر انتظار پایه است',
    thenFa: 'کپی‌برداری زمان‌دار + بازنویسی املای قاعده‌مند (الگو به الگو، نه کلمه‌حفظی)',
    sourceFa: 'پروب روانی‌نوشتن',
    detect: (f) => probeColor(f, 'ce-probe-write-v1') === 'danger'
  },
  {
    key: 'dysgraphia_checklist', targetKey: 'dysgraphia',
    ifFa: 'چک‌لیست ملاکی نوشتن نشانه‌های محوری را بالا گزارش کرده است',
    thenFa: 'برنامه‌ریزی نوشتار (طرح جمله → متن) با آسان‌سازی بار املا در مرحلهٔ پیش‌نویس',
    sourceFa: 'چک‌لیست ملاکی نوشتن',
    detect: (f) => colorOf(f, 'ce-sld-wri-v1', 'crita') === 'danger'
  },
  // ─── نارساحساب ───
  {
    key: 'dyscalculia_probe', targetKey: 'dyscalculia',
    ifFa: 'سلیقۀ حساب در پروب زیر انتظار پایه است',
    thenFa: 'تمرین بازی‌وار حقایق عددی + مصورسازی مفاهیم (خط عدد، بلوک، نمایش دیداری)',
    sourceFa: 'پروب سلیقۀ حساب',
    detect: (f) => probeColor(f, 'ce-probe-calc-v1') === 'danger'
  },
  {
    key: 'dyscalculia_checklist', targetKey: 'dyscalculia',
    ifFa: 'چک‌لیست ملاکی حساب نشانه‌های محوری را بالا گزارش کرده است',
    thenFa: 'آموزش چندحسی مفاهیم عددی با تمرین روزانهٔ کوتاه و پایش پراپ هفتگی',
    sourceFa: 'چک‌لیست ملاکی حساب',
    detect: (f) => colorOf(f, 'ce-sld-calc-v1', 'crita') === 'danger'
  },
  // ─── ADHD ───
  {
    key: 'adhd_attention', targetKey: 'adhd',
    ifFa: 'کم‌توجهی در SNAP-IV (والد یا معلم) بالای برش است',
    thenFa: 'مدیریت رفتار محیطی (قواعد کوتاه، نشستن نزدیک معلم، تقویت مثبت) + شکستن تکلیف به پله‌های کوچک',
    sourceFa: 'SNAP-IV',
    detect: (f) => colorOf(f, 'ce-snap-iv-p-v1', 'ia') === 'danger' || colorOf(f, 'ce-snap-iv-t-v1', 'ia') === 'danger'
  },
  {
    key: 'adhd_hyper', targetKey: 'adhd',
    ifFa: 'بی‌قراری/تکانش در SNAP-IV (والد یا معلم) بالای برش است',
    thenFa: 'آموزش خودآرام‌سازی + فاصله‌های حرکتی مجاز در کلاس + تقویت «مکث پیش از پاسخ»',
    sourceFa: 'SNAP-IV',
    detect: (f) => colorOf(f, 'ce-snap-iv-p-v1', 'hi') === 'danger' || colorOf(f, 'ce-snap-iv-t-v1', 'hi') === 'danger'
  },
  // ─── اتیسم ───
  {
    key: 'autism_criteria', targetKey: 'autism',
    ifFa: 'چک‌لیست ملاکی اتیسم نشانه‌های محوری را بالا گزارش کرده است',
    thenFa: 'ارجاع تشخیصی تخصصی + ساختاربندی بصری روتین‌ها؛ مداخلهٔ آموزشی پس از جمع‌بندی تخصصی',
    sourceFa: 'چک‌لیست ملاکی اتیسم',
    detect: (f) => colorOf(f, 'ce-asd-criteria-v1', 'crita') === 'danger' || colorOf(f, 'ce-asd-criteria-v1', 'critb') === 'danger'
  },
  // ─── اختلال زبان ───
  {
    key: 'speech_criteria', targetKey: 'speech_language',
    ifFa: 'چک‌لیست ملاکی زبان و گفتار نشانه‌ها را بالا گزارش کرده است',
    thenFa: 'تمرین واژگان هدفمند و درک شنیداری + هماهنگی با گفتاردرمانگر برای ارزیابی تخصصی',
    sourceFa: 'چک‌لیست ملاکی زبان',
    detect: (f) => colorOf(f, 'ce-speech-criteria-v1', 'lang') === 'danger' || colorOf(f, 'ce-speech-criteria-v1', 'speech') === 'danger'
  },
  // ─── اضطراب ───
  {
    key: 'anxiety_gad', targetKey: 'anxiety',
    ifFa: 'نمرهٔ اضطراب فراگیر در SCARED بالای برش است',
    thenFa: 'آموزش آرام‌سازی + مواجههٔ پله‌پله با موقعیت اضطراب‌ساز + هماهنگی خانه و مدرسه',
    sourceFa: 'SCARED',
    detect: (f) => colorOf(f, 'ce-scared-p-v1', 'gad') === 'danger'
  },
  {
    key: 'anxiety_school', targetKey: 'anxiety',
    ifFa: 'اجتناب از مدرسه (زیرمقیاس مدرسهٔ SCARED) بالای برش است',
    thenFa: 'بازگشت پله‌پله به مدرسه با قرارداد رفتاری و پشتیبانی معلم پایه',
    sourceFa: 'SCARED — اجتناب از مدرسه',
    detect: (f) => {
      const ss = f.latest.get('ce-scared-p-v1')?.analysis?.subscaleScores?.find((s) => s.id === 'sch');
      return Boolean(ss && ss.score >= 3);
    }
  },
  // ─── هماهنگی حرکتی ───
  {
    key: 'motor_dcdq', targetKey: 'motor_coordination',
    ifFa: 'DCDQ هماهنگی حرکتی را پایین گزارش کرده است',
    thenFa: 'مسیر دیداری-حرکتی کاردرمانی (visual OT) + تمرین‌های تعادلی و برش/نقاشی هدفمند',
    sourceFa: 'DCDQ',
    detect: (f) => colorOf(f, 'ce-dcdq-v1') === 'danger'
  },
  // ─── نافرمانی ───
  {
    key: 'odd_criteria', targetKey: 'odd',
    ifFa: 'چک‌لیست ملاکی نافرمانی ملاک‌های A را پوشش داده است',
    thenFa: 'قرارداد رفتاری خانه-مدرسه + تقویت تمایزمند با زمان‌بندی پاداش؛ تفکیک تکانش از مقابله‌گری',
    sourceFa: 'چک‌لیست ملاکی ODD',
    detect: (f) => colorOf(f, 'ce-odd-criteria-v1', 'crita') === 'danger'
  },
  // ─── دیرآموز ───
  {
    key: 'slow_learner_bif', targetKey: 'slow_learner',
    ifFa: 'هوش‌بهر کل در بازهٔ مرزی (۷۰–۸۴) با شاخص‌های نسبتاً یکنواخت است',
    thenFa: 'تدریس تطبیقی با گام‌های کوچک‌تر، زمان اضافه و تکرار فاصله‌دار؛ هدف‌ها را ملموس و کوتاه‌مدت ببندید',
    sourceFa: 'وکسلر — بازهٔ BIF',
    detect: (f) => f.wFacts.fsiq !== null && f.wFacts.fsiq >= FSIQ_BAND_BIF.min && f.wFacts.fsiq <= FSIQ_BAND_BIF.max && (f.adapt === 'normal' || f.adapt === 'unknown')
  },
  {
    key: 'slow_learner_decline', targetKey: 'slow_learner',
    ifFa: 'افت تحصیلی در «همهٔ درس‌ها با هم» گزارش شده است',
    thenFa: 'پرونده را با نگاه ظرفیت پایه مدیریت کنید — محتوای ساده‌شده و هدف‌های کوتاه‌مدت، نه تمرین اختصاصی یک مهارت',
    sourceFa: 'شرح‌حال — دامنهٔ افت',
    detect: (f) => (anamNum(f, 'decline_scope') ?? 0) >= 0.67
  },
  // ─── حافظهٔ کاری ───
  {
    key: 'wm_wmi', targetKey: 'working_memory',
    ifFa: 'حافظهٔ فعال (WMI) در وکسلر پایین‌تر از توان کلی است',
    thenFa: 'تمرین حافظهٔ کاری (بازگویی، دامنهٔ رقم، دستور چندمرحله‌ای) + بیرونی‌سازی حافظه (چک‌لیست، تصویر، یادداشت)',
    sourceFa: 'وکسلر — WMI',
    detect: (f) => weakIndex(f.wFacts.wmi) && f.wFacts.fsiq !== null && f.wFacts.fsiq >= 90
  },
  // ─── شکاف فرصت آموزشی ───
  {
    key: 'gap_absence', targetKey: 'opportunity_gap',
    ifFa: 'غیبت از مدرسه فرصت آموزش را کم کرده است',
    thenFa: 'جبران پرتکرار پیش‌نیازهای پایه + هماهنگی معلم برای تکالیف جبرانی شفاف',
    sourceFa: 'شرح‌حال — غیبت',
    detect: (f) => (anamNum(f, 'absence_level') ?? 0) >= 0.33
  },
  // ─── بی‌انگیزگی ───
  {
    key: 'demotivation_gap', targetKey: 'demotivation',
    ifFa: 'افت گزارش‌شده هست ولی مهارت پایه در پروب برقرار است',
    thenFa: 'به‌جای تمرین مهارتی، موقعیت و انگیزه را بررسی کنید — هدف‌های کوچک قابل‌دستیابی و بازخورد فوری',
    sourceFa: 'پروب + شرح‌حال',
    detect: (f) => (anamNum(f, 'decline_scope') ?? 0) >= 0.33 && probeColor(f, 'ce-probe-read-v1') === 'ok'
  },
  // ─── اضطراب امتحان ───
  {
    key: 'test_anxiety_anam', targetKey: 'test_anxiety',
    ifFa: 'اضطراب امتحان در شرح‌حال «متوسط» یا بیشتر گزارش شده است',
    thenFa: 'آموزش آرام‌سازی پیش از آزمون + شبیه‌سازی امتحان با زمان‌سنج + بازخورد فرایندی به‌جای نمره',
    sourceFa: 'شرح‌حال — اضطراب امتحان',
    detect: (f) => (anamNum(f, 'exam_anxiety') ?? 0) >= 0.67
  },
  // ─── عادت مطالعه ───
  {
    key: 'study_habits_scope', targetKey: 'study_habits',
    ifFa: 'افت محدود به یکی دو درس مشخص است و غیبت مهمی نیست',
    thenFa: 'بازسازی عادت مطالعه — برنامهٔ شب ثابت، تمرین فاصله‌دار و مرور فعال همان درس‌ها',
    sourceFa: 'شرح‌حال — دامنهٔ افت/غیبت',
    detect: (f) => (anamNum(f, 'decline_scope') ?? 0) >= 0.33 && (anamNum(f, 'absence_level') ?? 0) < 0.33
  },
  // ─── گذار ───
  {
    key: 'transition_change', targetKey: 'transition',
    ifFa: 'تغییر مدرسه در سه سال اخیر گزارش شده است',
    thenFa: 'گذار را مدیریت کنید — اتصال زودهنگام با معلم جدید، بازتعریف انتظارات و دو هفته پایش نزدیک',
    sourceFa: 'شرح‌حال — تغییر مدرسه',
    detect: (f) => (anamNum(f, 'school_change') ?? 0) >= 0.33
  },
  // ─── استرس خانوادگی ───
  {
    key: 'family_stress_crisis', targetKey: 'family_stress',
    ifFa: 'رویداد بحرانی اخیر در خانواده یا برای خود کودک گزارش شده است',
    thenFa: 'پشتیبانی هیجانی پیش از مداخلهٔ آموزشی — هماهنگی با خانواده و در صورت نیاز ارجاع مشاوره',
    sourceFa: 'شرح‌حال — رویداد بحرانی',
    detect: (f) => (anamNum(f, 'crisis_event') ?? 0) >= 0.5
  },
  // ─── تک‌درس ضعیف ───
  {
    key: 'single_subject_probe', targetKey: 'single_subject',
    ifFa: 'فقط یکی از پروب‌ها زیر انتظار پایه است و بقیه برقرارند',
    thenFa: 'جبران اختصاصی همان درس با معلم — آموزش مستقیم پیش‌نیازهای همان درس، نه برنامهٔ کلی',
    sourceFa: 'پروب‌ها',
    detect: (f) => {
      const colors = PROBES.map((p) => probeColor(f, p.toolKey));
      return colors.filter((c) => c === 'danger').length === 1 && colors.includes('ok');
    }
  }
];

export interface BasisSuggestion {
  targetKey: string;
  rules: { key: string; ifFa: string; thenFa: string; sourceFa: string }[];
}

// مبناهای فعال پرونده — گروه‌شده بر هدف؛ فقط قاعده‌هایی که شرطشان در دادهٔ فعلی برقرار است
export function basisSuggestionsOf(events: EvidenceEvent[]): BasisSuggestion[] {
  const facts = engineFactsOf(events);
  const map = new Map<string, BasisSuggestion>();
  for (const rule of BASIS_RULES) {
    let fired = false;
    try {
      fired = rule.detect(facts);
    } catch {
      fired = false; // قاعده نباید مسیر تفسیر را بشکند
    }
    if (!fired) continue;
    let entry = map.get(rule.targetKey);
    if (!entry) {
      entry = { targetKey: rule.targetKey, rules: [] };
      map.set(rule.targetKey, entry);
    }
    entry.rules.push({ key: rule.key, ifFa: rule.ifFa, thenFa: rule.thenFa, sourceFa: rule.sourceFa });
  }
  return [...map.values()];
}

// اسنپ‌شات مبنا برای ذخیره روی مسیر — فقط قواعد همان هدف
export function basisSnapshotForTarget(events: EvidenceEvent[], targetKey: string): BasisSuggestion | null {
  const found = basisSuggestionsOf(events).find((b) => b.targetKey === targetKey);
  return found ?? null;
}

// پوشش کتابخانه: هر هدفِ غیرتوانبخشی (۱۸ هدف) دست‌کم یک قاعده دارد
export function basisTargetsCovered(): string[] {
  return [...new Set(BASIS_RULES.map((r) => r.targetKey))];
}
