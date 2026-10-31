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
