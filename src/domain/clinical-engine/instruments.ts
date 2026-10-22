/**
 * موتور بالینی — باتری‌ها، قواعد، روایت و اهداف مداخله — ابزارها و باتری‌های سنجش
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// باتری ابزارهای روان‌سنجی ثابت (battery-v1) — پلن §۴
// منبع حقیقت: چهار فایل JSON کنار همین ماژول (همین ساختار در migration seed می‌شود؛
// battery-composite.json — T5/m150: فرم جامع خانواده)
// هر تغییر ملاک/آیتم = نسخهٔ جدید (battery-v2) — گزارش‌های قدیم دست‌نخورده می‌مانند.

import screeningJson from './battery-screening.json';
import specificJson from './battery-specific.json';
import clinicalJson from './battery-clinical.json';
// — T5 (m150): باتری جامع خانواده — SDQ والد (رسمی‌سازی legacy sdq-parent) + سنجهٔ انطباق
// روزمره + تعریف پکیج چند-ابزاری ce-comp-family-v2. تعریف پکیج فقط از مسیر فرم عمومی
// پکیجی مصرف می‌شود (رندر بخش‌به‌بخش + رویداد مستقل به‌ازای هر کامپوننت — case-events)؛
// ابزار تکیِ داخل آن مستقیم هم عضو باتری است و پنل/موتور همان‌طور می‌خوانند.
import compositeJson from './battery-composite.json';
import type { BatteryDef } from './types';

type RawBatteryDef = BatteryDef;

const RAW: RawBatteryDef[] = [
  ...(screeningJson as unknown as RawBatteryDef[]),
  ...(specificJson as unknown as RawBatteryDef[]),
  ...(clinicalJson as unknown as RawBatteryDef[]),
  ...(compositeJson as unknown as RawBatteryDef[])
];

/** resolve sameItemsAs: فقط آیتم‌ها از تعریف مرجع کپی می‌شوند — زیرمقیاس‌ها/باندهای خودِ ابزار می‌مانند (برش والد≠معلم) */
function resolveBattery(defs: RawBatteryDef[]): BatteryDef[] {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  return defs.map((d) => {
    if (!d.sameItemsAs) return d;
    const src = byKey.get(d.sameItemsAs);
    if (!src) throw new Error(`battery: sameItemsAs پیدا نشد — ${d.key} → ${d.sameItemsAs}`);
    return { ...d, fields: src.fields };
  });
}

/** باتری کامل — ۱۹ ابزار ثابت نسخهٔ battery-v1 (T5: +SDQ والد، +سنجهٔ انطباق، +پکیج فرم جامع) */
export const BATTERY: BatteryDef[] = resolveBattery(RAW);

const BY_KEY = new Map(BATTERY.map((d) => [d.key, d]));

/** یک ابزار باتری با کلید ثابت */
export function batteryDef(key: string): BatteryDef | undefined {
  return BY_KEY.get(key);
}

/**
 * هنجار پروب خواندن — واژهٔ درست در دقیقه (صدک ۵۰ مرجع بین‌المللی Hasbrouck & Tindal 2017)
 * هنجار فارسی رسمی منتشرنشده — برآورد اولیه؛ کالیبراسیون با دادهٔ مرکز در
 */
export const WCPM_NORM_50TH: Record<string, number> = {
  'اول': 60, 'دوم': 89, 'سوم': 107, 'چهارم': 123, 'پنجم': 139, 'ششم': 150, 'هفتم': 150, 'هشتم': 150
};

/** هنجار پروب نوشتن — حروف درست در ۱۵ ثانیه (برآورد اولیه — کالیبراسیون ) */
export const ALPHA_15S_NORM: Record<string, number> = {
  'اول': 20, 'دوم': 35, 'سوم': 45, 'چهارم': 50, 'پنجم': 55, 'ششم': 60, 'هفتم': 60, 'هشتم': 60
};

/** هنجار پروب حساب — ارقام درست در ۲ دقیقه (برآورد اولیه — کالیبراسیون ) */
export const DIGITS_2MIN_NORM: Record<string, number> = {
  'اول': 15, 'دوم': 25, 'سوم': 35, 'چهارم': 45, 'پنجم': 55, 'ششم': 55, 'هفتم': 55, 'هشتم': 55
};

/** وضعیت یک پروب نسبت به هنجار پایه — «پایین از انتظار / در انتظار / بالا» */
// (حذف شد — مصرف‌کنندهٔ واقعی این قرارداد در ruleColor داخل infer.ts است)

