// مالک‌های استثنایی (بند D ویرایش DSM-5-TR): شش عاملی که می‌توانند نشانه‌های
// یادگیری/رفتاری را «به‌جای» اختلال توضیح بدهند. خروجی این ماژول مستقیم بر رتبهٔ فرضیه
// (کسر رتبه‌ای وزن‌دار)، سقف اطمینان و وضعیت ملاک D جدول ملاک‌ها اثر می‌گذارد —
// تصمیم‌گیری را نمی‌بندد، فقط منصفانه دیرترش می‌کند.
import type { EvidenceEvent, ExclusionFactorKey, ExclusionHit } from './types';

export interface ExclusionFactorDef {
  key: ExclusionFactorKey;
  titleFa: string;
  weight: number; // وزن رتبه در حالت «پررنگ» (danger) — در حالت هشدار نصف می‌شود
}

// وزن‌ها عدد راهنمای رتبه‌اند، نه تشخیص: رقیبی که مالک فعال ندارد جلوتر می‌افتد.
export const EXCLUSION_FACTORS: ExclusionFactorDef[] = [
  { key: 'id_deficit', titleFa: 'نقص ذهنی', weight: 2 },
  { key: 'sensory', titleFa: 'نقص حسی', weight: 1.5 },
  { key: 'insufficient_education', titleFa: 'آموزش ناکافی', weight: 1.5 },
  { key: 'absenteeism', titleFa: 'غیبت', weight: 1.5 },
  { key: 'bilingualism', titleFa: 'دوزبانگی', weight: 1.5 },
  { key: 'psychosocial', titleFa: 'عامل روانی-اجتماعی', weight: 1 }
];

// کدام مالک می‌تواند کدام فرضیه را توضیح بدهد — مبنای بند D: نارسایی فکری،
// اختلال حسی، آموزش ناکافی، غیبت، زبان دومِ آموزش و فقر روانی-اجتماعی.
// «دیرآموز» عمداً در فهرست id_deficit نیست — هوش پایین خودِ فرضیهٔ دیرآموزی است نه مالک آن.
export const EXCLUSION_APPLIES: Record<ExclusionFactorKey, string[]> = {
  id_deficit: ['dyslexia', 'dysgraphia', 'dyscalculia'],
  sensory: ['dyslexia', 'dysgraphia', 'dyscalculia'],
  insufficient_education: ['dyslexia', 'dysgraphia', 'dyscalculia'],
  absenteeism: ['dyslexia', 'dysgraphia', 'dyscalculia'],
  bilingualism: ['dyslexia', 'dysgraphia', 'dyscalculia', 'speech_language'],
  psychosocial: ['adhd', 'anxiety', 'odd']
};

// — نگاشت برچسب شرح‌حال v3 به عدد (همان قرارداد ANAMNESIS_V3_SIGNAL_SPEC در infer —
//   اینجا جدا نگه داشته شده تا infer ↔ exclusions همدیگر را import نکنند) —
const HOME_LANGUAGE: Record<string, number> = { 'فارسی': 0, 'دوزبانه': 0.5, 'غیرفارسی': 1 };
const ABSENCE: Record<string, number> = { 'ندارد': 0, 'کمتر از یک ماه': 0.33, 'یک تا سه ماه': 0.67, 'بیش از سه ماه': 1 };
const SCHOOL_CHANGE: Record<string, number> = { 'هیچ': 0, 'یک بار': 0.33, 'دو بار': 0.67, 'سه بار یا بیشتر': 1 };
const SENSORY: Record<string, number> = { 'بدون نگرانی': 0, 'کم': 0.33, 'متوسط': 0.67, 'زیاد — نگران‌کننده': 1 };
const CRISIS: Record<string, number> = { 'نه': 0, 'بله — برای خود کودک': 1, 'بله — برای خانواده': 0.75, 'نمی‌خواهم بگویم': 0.5 };

function anamLabelOf(event: EvidenceEvent | undefined, fieldKey: string): number | null {
  const label = event?.payload?.[fieldKey]?.value;
  if (!label) return null;
  const map = { home_language: HOME_LANGUAGE, absence_level: ABSENCE, school_change: SCHOOL_CHANGE, sensory_concern: SENSORY, crisis_event: CRISIS }[fieldKey];
  const v = map?.[label];
  return v === undefined ? null : v; // گزینهٔ خارج از قرارداد — نادیده (دادهٔ آینده‌پذیر)
}

export interface ExclusionContext {
  anamV3: EvidenceEvent | undefined; // آخرین شرح‌حال v3 تکمیل‌شده
  fsiq: number | null;               // هوش‌بهر کل وکسلر (null = ثبت نشده)
  adaptLow: boolean;                 // انطباق روزمرهٔ «پایین» از سنجهٔ id-adapt
}

export function collectExclusions(ctx: ExclusionContext): ExclusionHit[] {
  const hits: ExclusionHit[] = [];
  const push = (key: ExclusionFactorKey, strength: 'warn' | 'danger', evidenceFa: string) => {
    const def = EXCLUSION_FACTORS.find((f) => f.key === key);
    if (!def) return;
    hits.push({ key, titleFa: def.titleFa, strength, weight: strength === 'danger' ? def.weight : def.weight * 0.5, evidenceFa });
  };

  // نقص ذهنی — هوش‌بهر کل ۷۰ یا کمتر پررنگ است؛ انطباق پایینِ بی‌وکسلر فقط هشدار
  if (ctx.fsiq !== null && ctx.fsiq <= 70) {
    push('id_deficit', 'danger', `هوش‌بهر کل ${String(ctx.fsiq).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])} (۷۰ یا کمتر)`);
  } else if (ctx.adaptLow) {
    push('id_deficit', 'warn', 'انطباق روزمرهٔ «پایین» در سنجهٔ خانواده — بدون هوش‌بهر ثبت‌شده');
  }

  const sensory = anamLabelOf(ctx.anamV3, 'sensory_concern');
  if (sensory !== null && sensory >= 0.67) {
    push('sensory', sensory >= 1 ? 'danger' : 'warn', 'حساسیت حسی در شرح‌حال بالا — شنوایی/بینایی رد نشده');
  }

  const schoolChange = anamLabelOf(ctx.anamV3, 'school_change');
  if (schoolChange !== null && schoolChange >= 0.67) {
    push('insufficient_education', schoolChange >= 1 ? 'danger' : 'warn', 'تغییر مکرر مدرسه در سه سال اخیر — پیوستگی آموزش مختل');
  }

  const absence = anamLabelOf(ctx.anamV3, 'absence_level');
  if (absence !== null && absence >= 0.67) {
    push('absenteeism', absence >= 1 ? 'danger' : 'warn', 'غیبت طولانی از مدرسه در شرح‌حال');
  }

  const homeLang = anamLabelOf(ctx.anamV3, 'home_language');
  if (homeLang !== null && homeLang >= 0.5) {
    push('bilingualism', homeLang >= 1 ? 'danger' : 'warn', 'زبان گفت‌وگوی خانه غیرفارسی/دوزبانه');
  }

  const crisis = anamLabelOf(ctx.anamV3, 'crisis_event');
  if (crisis !== null && crisis >= 0.5) {
    push('psychosocial', crisis >= 1 ? 'danger' : 'warn', 'رویداد بحرانی اخیر در شرح‌حال');
  }

  return hits;
}

// مالک‌های فعالِ مرتبط با یک هدف — مبنای کسر رتبه، سقف اطمینان و ملاک D
export function exclusionsForTarget(hits: ExclusionHit[], targetKey: string): ExclusionHit[] {
  return hits.filter((h) => EXCLUSION_APPLIES[h.key]?.includes(targetKey) ?? false);
}

export function exclusionPenaltyOf(hits: ExclusionHit[]): number {
  return Math.round(hits.reduce((sum, h) => sum + h.weight, 0) * 10) / 10;
}

export function needsExclusionRulingOf(hits: ExclusionHit[]): boolean {
  return hits.some((h) => h.strength === 'danger');
}
