/**
 * موتور بالینی — باتری‌ها، قواعد، روایت و اهداف مداخله — قواعد محض ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// قواعد هاردکد شواهد و ملاک‌ها (پلن §۵) — موتور (infer.ts) همین را مصرف می‌کند
// آستانه‌ها و وزن‌ها شفاف و در سند قابل مرورند — جعبهٔ سیاه نیست؛ کالیبراسیون با دادهٔ مرکز در

import type { RuleSet } from './types';

/** وزن استاندارد شواهد (پلن §۵ گام ۲) */
export const EVIDENCE_WEIGHTS = {
  probeDanger: 2,
  instrumentDanger: 2,
  instrumentWarn: 1,
  sdqDanger: 1,
  anamnesisFlag: 1,
  /** ضریب هم‌رأیی والد/معلم وقتی هر دو مرجع باند بالا دارند */
  consensusMultiplier: 1.5
} as const;

/** آستانهٔ اطمینان توصیفی روی جمع وزن شواهد */
export const CONFIDENCE_THRESHOLDS = { medium: 2, high: 3.5 } as const;

/** قاعدهٔ ملاکی ODD: دست‌کم ۴ آیتم با نمرهٔ کامل (۲) از ۸ ملاک A */
export const ODD_MIN_FULL_CRITERIA = 4;
/** قاعدهٔ ملاکی ASD: هر سه ملاک A + حداقل ۲ از ۴ ملاک B (در باتری B هفت آیتم دارد) */
export const ASD_B_FULL_CRITERIA = 2;
/** برش اجتناب از مدرسه SCARED (زیرمقیاس sch) */
export const SCARED_SCHOOL_CUTOFF = 1;
/** محدودهٔ IQ دیرآموزی — عملکرد فکری مرزی */
export const BIF_IQ_RANGE = { min: 70, max: 85 } as const;

export const RULES: RuleSet[] = [
  // ─── نارساخوانی ───
  {
    targetKey: 'dyslexia',
    batteryVersion: 'battery-v1',
    evidence: [
      { kind: 'probe', toolKey: 'ce-probe-read-v1', band: 'danger', weight: EVIDENCE_WEIGHTS.probeDanger, fa: 'در پروب خواندن، سرعت یا دقت پایین‌تر از انتظار پایه بود.' },
      { kind: 'instrument', toolKey: 'ce-sld-read-v1', subscaleId: 'crita', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'چک‌لیست ملاکی خواندن، نشانه‌های محوری را بالا گزارش کرده است.' },
      { kind: 'instrument', toolKey: 'ce-sld-read-v1', subscaleId: 'crita', band: 'warn', weight: EVIDENCE_WEIGHTS.instrumentWarn, fa: 'چند نشانهٔ محوری خواندن گزارش شده است.' }
    ],
    consensus: { parent: 'ce-sld-read-v1', teacher: 'ce-sld-read-v1' },
    criteriaMap: [
      { criterionId: 'dyslexia.a1', toolKey: 'ce-sld-read-v1', itemRefs: ['rA1', 'rA2'], passScore: 2 },
      { criterionId: 'dyslexia.a2', toolKey: 'ce-sld-read-v1', itemRefs: ['rA3', 'rA4', 'rA5'], passScore: 2 },
      { criterionId: 'dyslexia.a3', toolKey: 'ce-sld-read-v1', itemRefs: ['rA6'], passScore: 2 },
      { criterionId: 'sld.b', toolKey: 'ce-sld-read-v1', itemRefs: ['rB1', 'rB2'], passScore: 2 },
      { criterionId: 'sld.c', toolKey: 'ce-sld-read-v1', itemRefs: ['rC1'], passScore: 2 },
      { criterionId: 'sld.d', toolKey: 'ce-sld-read-v1', itemRefs: ['rD1'], passScore: 2 }
    ],
    differentials: [
      { targetKey: 'opportunity_gap', fa: 'اگر استدلال سالم است، شکاف در پایه‌های مشخص و سابقهٔ جابه‌جایی/غیبت دارد → فقر فرصت آموزشی را بررسی کنید.' },
      { targetKey: 'dysgraphia', fa: 'اگر خطای املای آوایی با WCPM پایین همراه است، خواندن و نوشتن با هم ارزیابی شوند.' }
    ],
    nextInstrument: ['ce-probe-read-v1', 'ce-sld-read-v1']
  },
  // ─── نارسانویسی ───
  {
    targetKey: 'dysgraphia',
    batteryVersion: 'battery-v1',
    evidence: [
      { kind: 'probe', toolKey: 'ce-probe-write-v1', band: 'danger', weight: EVIDENCE_WEIGHTS.probeDanger, fa: 'در پروب نوشتن، خطای دیکته یا روانی نوشتن پایین‌تر از انتظار پایه بود.' },
      { kind: 'instrument', toolKey: 'ce-sld-wri-v1', subscaleId: 'crita', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'چک‌لیست ملاکی نوشتن، نشانه‌های محوری را بالا گزارش کرده است.' },
      { kind: 'instrument', toolKey: 'ce-sld-wri-v1', subscaleId: 'crita', band: 'warn', weight: EVIDENCE_WEIGHTS.instrumentWarn, fa: 'چند نشانهٔ محوری نوشتن گزارش شده است.' }
    ],
    consensus: { parent: 'ce-sld-wri-v1', teacher: 'ce-sld-wri-v1' },
    criteriaMap: [
      { criterionId: 'dysgraphia.a1', toolKey: 'ce-sld-wri-v1', itemRefs: ['wA1', 'wA3', 'wA4'], passScore: 2 },
      { criterionId: 'dysgraphia.a2', toolKey: 'ce-sld-wri-v1', itemRefs: ['wA2'], passScore: 2 },
      { criterionId: 'dysgraphia.a3', toolKey: 'ce-sld-wri-v1', itemRefs: ['wA5'], passScore: 2 },
      { criterionId: 'sld.b', toolKey: 'ce-sld-wri-v1', itemRefs: ['wB1', 'wB2'], passScore: 2 },
      { criterionId: 'sld.c', toolKey: 'ce-sld-wri-v1', itemRefs: ['wC1'], passScore: 2 },
      { criterionId: 'sld.d', toolKey: 'ce-sld-wri-v1', itemRefs: ['wD1'], passScore: 2 }
    ],
    differentials: [
      { targetKey: 'motor_coordination', fa: 'اگر دکمه/قیچی/توپ هم مشکل دارند → DCDQ بگیرید؛ مشکل ممکن است حرکتی باشد نه صرفاً نوشتاری.' },
      { targetKey: 'dyslexia', fa: 'خطای دیکتهٔ آوایی + WCPM پایین → نارساخوانی همراه را بررسی کنید.' }
    ],
    nextInstrument: ['ce-probe-write-v1', 'ce-sld-wri-v1']
  },
  // ─── نارساریاضی ───
  {
    targetKey: 'dyscalculia',
    batteryVersion: 'battery-v1',
    evidence: [
      { kind: 'probe', toolKey: 'ce-probe-calc-v1', band: 'danger', weight: EVIDENCE_WEIGHTS.probeDanger, fa: 'در پروب حساب، سلیقه یا مقایسهٔ مقدار پایین‌تر از انتظار پایه بود.' },
      { kind: 'instrument', toolKey: 'ce-sld-calc-v1', subscaleId: 'crita', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'چک‌لیست ملاکی ریاضی، نشانه‌های محوری را بالا گزارش کرده است.' },
      { kind: 'instrument', toolKey: 'ce-sld-calc-v1', subscaleId: 'crita', band: 'warn', weight: EVIDENCE_WEIGHTS.instrumentWarn, fa: 'چند نشانهٔ محوری ریاضی گزارش شده است.' }
    ],
    consensus: { parent: 'ce-sld-calc-v1', teacher: 'ce-sld-calc-v1' },
    criteriaMap: [
      { criterionId: 'dyscalculia.a1', toolKey: 'ce-sld-calc-v1', itemRefs: ['cA1', 'cA6'], passScore: 2 },
      { criterionId: 'dyscalculia.a2', toolKey: 'ce-sld-calc-v1', itemRefs: ['cA2', 'cA3', 'cA4'], passScore: 2 },
      { criterionId: 'dyscalculia.a3', toolKey: 'ce-sld-calc-v1', itemRefs: ['cA5'], passScore: 2 },
      { criterionId: 'sld.b', toolKey: 'ce-sld-calc-v1', itemRefs: ['cB1', 'cB2'], passScore: 2 },
      { criterionId: 'sld.c', toolKey: 'ce-sld-calc-v1', itemRefs: ['cC1'], passScore: 2 },
      { criterionId: 'sld.d', toolKey: 'ce-sld-calc-v1', itemRefs: ['cD1'], passScore: 2 }
    ],
    differentials: [
      { targetKey: 'opportunity_gap', fa: 'اگر فقط جدول ضرب نخوانده و استدلال سالم است → فقر فرصت آموزشی.' },
      { targetKey: 'test_anxiety', fa: 'اگر خطا فقط زیر فشار ارزشیابی است → اضطراب امتحان را بررسی کنید.' }
    ],
    nextInstrument: ['ce-probe-calc-v1', 'ce-sld-calc-v1']
  },
  // ─── ADHD ───
  {
    targetKey: 'adhd',
    batteryVersion: 'battery-v1',
    evidence: [
      { kind: 'instrument', toolKey: 'ce-snap-iv-p-v1', subscaleId: 'ia', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'نمرهٔ کم‌توجهی در فرم والد بالای برش (صدک ۹۵) است.' },
      { kind: 'instrument', toolKey: 'ce-snap-iv-p-v1', subscaleId: 'hi', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'نمرهٔ بیش‌فعالی/تکانشگری در فرم والد بالای برش است.' },
      { kind: 'instrument', toolKey: 'ce-snap-iv-t-v1', subscaleId: 'ia', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'نمرهٔ کم‌توجهی در فرم معلم بالای برش است.' },
      { kind: 'instrument', toolKey: 'ce-snap-iv-t-v1', subscaleId: 'hi', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'نمرهٔ بیش‌فعالی/تکانشگری در فرم معلم بالای برش است.' },
      { kind: 'sdq', toolKey: 'sdq-parent', subscaleId: 'hyper', band: 'danger', weight: EVIDENCE_WEIGHTS.sdqDanger, fa: 'زیرمقیاس بیش‌فعالی SDQ والد قابل توجه است.' },
      { kind: 'sdq', toolKey: 'ce-sdq-t-v1', subscaleId: 'hyper', band: 'danger', weight: EVIDENCE_WEIGHTS.sdqDanger, fa: 'زیرمقیاس بیش‌فعالی SDQ معلم قابل توجه است.' }
    ],
    consensus: { parent: 'ce-snap-iv-p-v1', teacher: 'ce-snap-iv-t-v1' },
    criteriaMap: [
      { criterionId: 'adhd.a1', toolKey: 'ce-snap-iv-p-v1', itemRefs: [], passScore: 0 },
      { criterionId: 'adhd.a2', toolKey: 'ce-snap-iv-p-v1', itemRefs: [], passScore: 0 },
      { criterionId: 'adhd.c', toolKey: 'ce-snap-iv-p-v1', itemRefs: [], passScore: 0 }
    ],
    differentials: [
      { targetKey: 'odd', fa: 'اگر نافرمانی بر تکانشگری غالب است → چک‌لیست ODD بگیرید و تفکیک کنید.' },
      { targetKey: 'working_memory', fa: 'اگر فقط دستورهای چندمرحله‌ای ناقص می‌ماند ولی کار کوتاه را کامل می‌کند → حافظهٔ کاری را بررسی کنید.' },
      { targetKey: 'anxiety', fa: 'اگر بی‌دقتی با نگرانی فراوان و نشانهٔ جسمانی همراه است → SCARED بگیرید.' }
    ],
    nextInstrument: ['ce-snap-iv-t-v1', 'ce-snap-iv-p-v1']
  },
  // ─── اتیسم ───
  {
    targetKey: 'autism',
    batteryVersion: 'battery-v1',
    evidence: [
      { kind: 'instrument', toolKey: 'ce-asd-criteria-v1', subscaleId: 'crita', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'نشانه‌های محوری ارتباط اجتماعی بالا گزارش شده است.' },
      { kind: 'instrument', toolKey: 'ce-asd-criteria-v1', subscaleId: 'critb', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'الگوهای تکراری/حسی بالا گزارش شده است.' },
      { kind: 'instrument', toolKey: 'ce-asd-criteria-v1', subscaleId: 'crita', band: 'warn', weight: EVIDENCE_WEIGHTS.instrumentWarn, fa: 'چند نشانهٔ اجتماعی گزارش شده است.' }
    ],
    consensus: { parent: 'ce-asd-criteria-v1', teacher: 'ce-asd-criteria-v1' },
    criteriaMap: [
      { criterionId: 'autism.a1', toolKey: 'ce-asd-criteria-v1', itemRefs: ['aA1', 'aA2', 'aA3'], passScore: 2 },
      { criterionId: 'autism.a2', toolKey: 'ce-asd-criteria-v1', itemRefs: ['aA4', 'aA5'], passScore: 2 },
      { criterionId: 'autism.a3', toolKey: 'ce-asd-criteria-v1', itemRefs: ['aA6'], passScore: 2 },
      { criterionId: 'autism.b1', toolKey: 'ce-asd-criteria-v1', itemRefs: ['aB1', 'aB2'], passScore: 2 },
      { criterionId: 'autism.b2', toolKey: 'ce-asd-criteria-v1', itemRefs: ['aB3', 'aB4'], passScore: 2 },
      { criterionId: 'autism.b3', toolKey: 'ce-asd-criteria-v1', itemRefs: ['aB5'], passScore: 2 },
      { criterionId: 'autism.b4', toolKey: 'ce-asd-criteria-v1', itemRefs: ['aB6', 'aB7'], passScore: 2 }
    ],
    differentials: [
      { targetKey: 'speech_language', fa: 'اگر فقط فهم/بیان زبان دشوار است و الگوی تکراری/حسی ندارد → چک‌لیست زبان بگیرید.' },
      { targetKey: 'anxiety', fa: 'اگر اجتناب اجتماعی فقط در جمع‌های جدید است و رابطهٔ صمیمی سالم دارد → اضطراب اجتماعی را بررسی کنید.' }
    ],
    nextInstrument: ['ce-asd-criteria-v1']
  },
  // ─── زبان/گفتار ───
  {
    targetKey: 'speech_language',
    batteryVersion: 'battery-v1',
    evidence: [
      { kind: 'instrument', toolKey: 'ce-speech-criteria-v1', subscaleId: 'lang', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'فهم/ساخت زبان بالای برش گزارش شده است.' },
      { kind: 'instrument', toolKey: 'ce-speech-criteria-v1', subscaleId: 'speech', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'تلفظ اصوات بالای برش گزارش شده است.' },
      { kind: 'instrument', toolKey: 'ce-speech-criteria-v1', subscaleId: 'fluency', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'روانی گفتار بالای برش گزارش شده است.' }
    ],
    consensus: { parent: 'ce-speech-criteria-v1', teacher: 'ce-speech-criteria-v1' },
    criteriaMap: [
      { criterionId: 'speech.a1', toolKey: 'ce-speech-criteria-v1', itemRefs: ['spL1', 'spL2', 'spL3', 'spL4', 'spL5', 'spL6'], passScore: 2 },
      { criterionId: 'speech.a2', toolKey: 'ce-speech-criteria-v1', itemRefs: ['spS1', 'spS2', 'spS3', 'spF1', 'spF2'], passScore: 2 },
      { criterionId: 'speech.d', toolKey: 'ce-speech-criteria-v1', itemRefs: ['spB1'], passScore: 2 },
      { criterionId: 'speech.e', toolKey: 'ce-speech-criteria-v1', itemRefs: ['spR1'], passScore: 0 }
    ],
    differentials: [
      { targetKey: 'autism', fa: 'اگر الگوی تکراری/حسی و کمبود تقابل اجتماعی هست → چک‌لیست اتیسم بگیرید.' },
      { targetKey: 'opportunity_gap', fa: 'اگر زبان خانه غیرفارسی/دوزبانه و محرک کم است → بررسی محیط زبانی.' }
    ],
    nextInstrument: ['ce-speech-criteria-v1']
  },
  // ─── اضطراب ───
  {
    targetKey: 'anxiety',
    batteryVersion: 'battery-v1',
    evidence: [
      { kind: 'instrument', toolKey: 'ce-scared-p-v1', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'نمرهٔ کل SCARED بالای برش ۲۵ است.' },
      { kind: 'instrument', toolKey: 'ce-scared-p-v1', subscaleId: 'gad', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'عامل اضطراب فراگیر بالای برش است.' },
      { kind: 'sdq', toolKey: 'sdq-parent', subscaleId: 'emo', band: 'danger', weight: EVIDENCE_WEIGHTS.sdqDanger, fa: 'زیرمقیاس هیجانی SDQ والد قابل توجه است.' },
      { kind: 'sdq', toolKey: 'ce-sdq-t-v1', subscaleId: 'emo', band: 'danger', weight: EVIDENCE_WEIGHTS.sdqDanger, fa: 'زیرمقیاس هیجانی SDQ معلم قابل توجه است.' },
      { kind: 'anamnesis', toolKey: 'ce-anamnesis-v2', band: 'danger', weight: EVIDENCE_WEIGHTS.anamnesisFlag, fa: 'نشانهٔ جسمانی صبحگاهی بدون علت پزشکی در شرح حال ثبت شده است.' }
    ],
    consensus: { parent: 'ce-scared-p-v1', teacher: 'ce-sdq-t-v1' },
    criteriaMap: [
      { criterionId: 'anxiety.a1', toolKey: 'ce-scared-p-v1', itemRefs: ['sc04', 'sc14', 'sc16'], passScore: 2 },
      { criterionId: 'anxiety.a3', toolKey: 'ce-scared-p-v1', itemRefs: ['sc02', 'sc11', 'sc21'], passScore: 2 }
    ],
    differentials: [
      { targetKey: 'test_anxiety', fa: 'اگر فقط به موقعیت ارزشیابی محدود است → اضطراب امتحان (وضعیت غیراختلالی).' },
      { targetKey: 'family_stress', fa: 'اگر شروع ناگهانی هم‌زمان با بحران خانوادگی است → استرس محیطی را بررسی کنید.' },
      { targetKey: 'autism', fa: 'اگر اجتناب اجتماعی همه‌جانبه و با الگوی حسی همراه است → چک‌لیست اتیسم.' }
    ],
    nextInstrument: ['ce-scared-p-v1']
  },
  // ─── DCD ───
  {
    targetKey: 'motor_coordination',
    batteryVersion: 'battery-v1',
    evidence: [
      { kind: 'instrument', toolKey: 'ce-dcdq-v1', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'نمرهٔ کل DCDQ پایین‌تر از برش سنی است.' },
      { kind: 'instrument', toolKey: 'ce-dcdq-v1', band: 'warn', weight: EVIDENCE_WEIGHTS.instrumentWarn, fa: 'نمرهٔ کل DCDQ در ناحیهٔ مرزی سنی است.' }
    ],
    consensus: undefined,
    criteriaMap: [
      { criterionId: 'dcd.a', toolKey: 'ce-dcdq-v1', itemRefs: [], passScore: 0 },
      { criterionId: 'dcd.b', toolKey: 'ce-dcdq-v1', itemRefs: [], passScore: 0 }
    ],
    differentials: [
      { targetKey: 'dysgraphia', fa: 'اگر فقط نوشتن ضعیف است → چک‌لیست نوشتن و پروب دیکته بگیرید.' },
      { targetKey: 'adhd', fa: 'اگر افتادگی از تکانشگری است (نه بی‌برنامگی حرکت) → SNAP-IV.' }
    ],
    nextInstrument: ['ce-dcdq-v1']
  },
  // ─── ODD ───
  {
    targetKey: 'odd',
    batteryVersion: 'battery-v1',
    evidence: [
      { kind: 'instrument', toolKey: 'ce-odd-criteria-v1', subscaleId: 'crita', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'الگوی مقابله‌گری بالای برش گزارش شده است.' },
      { kind: 'instrument', toolKey: 'ce-odd-criteria-v1', subscaleId: 'crita', band: 'warn', weight: EVIDENCE_WEIGHTS.instrumentWarn, fa: 'چند ملاک مقابله‌گری با نمرهٔ کامل گزارش شده است.' },
      { kind: 'instrument', toolKey: 'ce-snap-iv-p-v1', subscaleId: 'odd', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentWarn, fa: 'زیرمقیاس نافرمانی SNAP-IV والد بالای برش است.' },
      { kind: 'sdq', toolKey: 'sdq-parent', subscaleId: 'cond', band: 'danger', weight: EVIDENCE_WEIGHTS.sdqDanger, fa: 'زیرمقیاس رفتاری SDQ والد قابل توجه است.' }
    ],
    consensus: { parent: 'ce-odd-criteria-v1', teacher: 'ce-odd-criteria-v1' },
    criteriaMap: [
      { criterionId: 'odd.a1', toolKey: 'ce-odd-criteria-v1', itemRefs: ['oA1', 'oA6'], passScore: 2 },
      { criterionId: 'odd.a2', toolKey: 'ce-odd-criteria-v1', itemRefs: ['oA2'], passScore: 2 },
      { criterionId: 'odd.a3', toolKey: 'ce-odd-criteria-v1', itemRefs: ['oA3'], passScore: 2 },
      { criterionId: 'odd.a4', toolKey: 'ce-odd-criteria-v1', itemRefs: ['oA4'], passScore: 2 },
      { criterionId: 'odd.a5', toolKey: 'ce-odd-criteria-v1', itemRefs: ['oA5'], passScore: 2 },
      { criterionId: 'odd.a7', toolKey: 'ce-odd-criteria-v1', itemRefs: ['oA7'], passScore: 2 },
      { criterionId: 'odd.a8', toolKey: 'ce-odd-criteria-v1', itemRefs: ['oA8'], passScore: 2 },
      { criterionId: 'odd.b', toolKey: 'ce-odd-criteria-v1', itemRefs: ['oB1'], passScore: 2 },
      { criterionId: 'odd.c', toolKey: 'ce-odd-criteria-v1', itemRefs: ['oC1'], passScore: 2 },
      { criterionId: 'odd.d', toolKey: 'ce-odd-criteria-v1', itemRefs: ['oD1'], passScore: 2 }
    ],
    differentials: [
      { targetKey: 'adhd', fa: 'اگر بدرفتاری از تکانه است (نه مقابله‌گری هدفمند) → SNAP-IV هر دو مرجع.' },
      { targetKey: 'family_stress', fa: 'اگر شروع هم‌زمان با بحران خانوادگی است → استرس محیطی را بررسی کنید.' }
    ],
    nextInstrument: ['ce-odd-criteria-v1']
  },
  // ─── دیرآموزی ───
  {
    targetKey: 'slow_learner',
    batteryVersion: 'battery-v1',
    evidence: [
      { kind: 'wechsler', toolKey: 'wechsler', band: 'danger', weight: EVIDENCE_WEIGHTS.instrumentDanger, fa: 'هوشبهر کلی وکسلر در محدودهٔ مرزی (۷۰ تا ۸۵) است.' },
      { kind: 'anamnesis', toolKey: 'ce-anamnesis-v2', band: 'danger', weight: EVIDENCE_WEIGHTS.anamnesisFlag, fa: 'افت تحصیلی تدریجی همه‌درسی در شرح حال ثبت شده است.' }
    ],
    consensus: undefined,
    criteriaMap: [
      { criterionId: 'bif.a', toolKey: 'wechsler', itemRefs: [], passScore: 0 },
      { criterionId: 'bif.b', toolKey: 'ce-anamnesis-v2', itemRefs: [], passScore: 0 },
      { criterionId: 'bif.c', toolKey: 'ce-anamnesis-v2', itemRefs: [], passScore: 0 }
    ],
    differentials: [
      { targetKey: 'opportunity_gap', fa: 'اگر استدلال سالم و شکاف پایه‌ای است → فقر فرصت؛ وکسلر فرق اصلی را می‌گوید.' },
      { targetKey: 'working_memory', fa: 'اگر فقط بار پردازش مشکل دارد و استدلال خوب است → حافظهٔ کاری.' }
    ],
    nextInstrument: ['ce-anamnesis-v2']
  }
];

/** قواعد یک هدف */
export function rulesOf(targetKey: string): RuleSet | undefined {
  return RULES.find((r) => r.targetKey === targetKey);
}
