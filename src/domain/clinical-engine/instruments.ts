import screeningJson from './battery-screening.json';
import specificJson from './battery-specific.json';
import clinicalJson from './battery-clinical.json';
import type { BatteryDef } from './types';

type RawBatteryDef = BatteryDef;

const RAW: RawBatteryDef[] = [
  ...(screeningJson as unknown as RawBatteryDef[]),
  ...(specificJson as unknown as RawBatteryDef[]),
  ...(clinicalJson as unknown as RawBatteryDef[])
];

function resolveBattery(defs: RawBatteryDef[]): BatteryDef[] {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  return defs.map((d) => {
    if (!d.sameItemsAs) return d;
    const src = byKey.get(d.sameItemsAs);
    if (!src) throw new Error(`battery: sameItemsAs پیدا نشد — ${d.key} → ${d.sameItemsAs}`);
    return { ...d, fields: src.fields };
  });
}

export const BATTERY: BatteryDef[] = resolveBattery(RAW);

const BY_KEY = new Map(BATTERY.map((d) => [d.key, d]));

export function batteryDef(key: string): BatteryDef | undefined {
  return BY_KEY.get(key);
}

export const WCPM_NORM_50TH: Record<string, number> = {
  'اول': 60, 'دوم': 89, 'سوم': 107, 'چهارم': 123, 'پنجم': 139, 'ششم': 150, 'هفتم': 150, 'هشتم': 150
};

export const ALPHA_15S_NORM: Record<string, number> = {
  'اول': 20, 'دوم': 35, 'سوم': 45, 'چهارم': 50, 'پنجم': 55, 'ششم': 60, 'هفتم': 60, 'هشتم': 60
};

export const DIGITS_2MIN_NORM: Record<string, number> = {
  'اول': 15, 'دوم': 25, 'سوم': 35, 'چهارم': 45, 'پنجم': 55, 'ششم': 55, 'هفتم': 55, 'هشتم': 55
};

/* ─── ۱.۲۵.۰۶ — تک‌منبع برش‌های پرسشنامه‌های گزارش‌دهنده ───
   قبلاً دو کپی واگرا در کد وجود داشت: ot-engine/service.ts (بدون odd) و fork موتور صورت‌بندی
   (case-formulation/engine.js)؛ باندهای نمایشی DB (m176) هم جدول جداگانهٔ خودش را دارد.
   از این پس موتورها و گیت‌ها همه از همین جدول می‌خوانند. اعداد = ارزش‌های عملیاتیِ جاری
   (خانوادهٔ Swanson 95th برای والد: IA ۱۶ · HI ۱۳ — همان‌هایی که گیت رفتاری از اول می‌شناخت).
   تفاوت عمدی با باندهای نمایشی m176 (severity tiers) در CHANGELOG ۱.۲۵.۰۶ ثبت شده است. */
export const SNAP_IV_CUTOFFS = {
  parent: { ia: { warn: 11, danger: 16 }, hi: { danger: 13 }, odd: { warn: 10, danger: 14 } },
  teacher: { ia: { warn: 14, danger: 16 }, hi: { danger: 11 }, odd: { warn: 12, danger: 16 } }
} as const;

export const SCARED_CUTOFFS = { danger: 25, warnMin: 20, strong: 30 } as const; // نمرهٔ کل — سه کپی قبلی هم‌عدد بودند

/* DCDQ: مرزهای سنی مستند بازبینی بیرونی مرکز (m176 راهنمای باند «بسته به سن»):
   ۵ تا ۷ سال → ۳۱ · ۸ تا ۹ سال → ۴۰ · ۱۰ تا ۱۵ سال → ۴۲؛ نمرهٔ کل ≤ مرزِ سن = خطر.
   سن نامعلوم → ۳۱ (سخت‌گیرانه‌ترین = همان تیرِ همگانی «پایین‌تر از مرز همهٔ گروه‌های سنی» m176).
   سقف تیرِ مرزی (warn) = ۴۲ — سقف مطلق مرز سنی؛ بالاتر از آن «در انتظار سن یا بالاتر» (m176). */
export const DCDQ_WARN_CEILING = 42;
export function dcdqDangerCutoffFor(ageYears: number | null | undefined): number {
  if (ageYears === null || ageYears === undefined) return 31;
  if (ageYears < 8) return 31;
  if (ageYears < 10) return 40;
  return 42;
}
