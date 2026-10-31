// زمان‌شناسی سامانه — همه‌چیز تهران‌محور: ذخیره ISO UTC و محاسبهٔ «روز» با آفست ثابت +3:30.
// تبدیل جلالی هم همین‌جاست (جدول BREAKS)؛ معادل فرانت در format.js است — دست یکی را دادی، دیگری را هم بده.
import { TEHRAN_OFFSET_MINUTES } from './constants';

const TEHRAN_OFFSET_MS = TEHRAN_OFFSET_MINUTES * 60 * 1000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function tehranTodayYmd(now: Date = new Date()): string {
  const tehran = new Date(now.getTime() + TEHRAN_OFFSET_MS);
  return `${tehran.getUTCFullYear()}-${pad2(tehran.getUTCMonth() + 1)}-${pad2(tehran.getUTCDate())}`;
}

export function tehranDayRange(ymd: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`INVALID_DATE: ${ymd}`);
  }
  const startUtcMs = Date.parse(`${ymd}T00:00:00.000Z`) - TEHRAN_OFFSET_MS;
  const endUtcMs = Date.parse(`${ymd}T00:00:00.000Z`) + 24 * 60 * 60 * 1000 - TEHRAN_OFFSET_MS - 1;
  return {
    start: new Date(startUtcMs).toISOString(),
    end: new Date(endUtcMs).toISOString()
  };
}

export function tehranRange(fromYmd: string, toYmd: string): { start: string; end: string } {
  const a = tehranDayRange(fromYmd);
  const b = tehranDayRange(toYmd);
  return { start: a.start, end: b.end };
}

export function tehranYmdOf(isoUtc: string): string {
  return tehranTodayYmd(new Date(isoUtc));
}

export function isOnGrid(isoUtc: string, slotMinutes: number): boolean {
  const ms = Date.parse(isoUtc);
  if (Number.isNaN(ms)) return false;
  const seconds = ms / 1000;
  return seconds % (slotMinutes * 60) === 0;
}

export function addMinutes(isoUtc: string, minutes: number): string {
  return new Date(Date.parse(isoUtc) + minutes * 60 * 1000).toISOString();
}

export function tehranTimeLabel(isoUtc: string): string {
  const ms = Date.parse(isoUtc);
  if (Number.isNaN(ms)) throw new Error(`INVALID_DATE: ${isoUtc}`);
  const tehran = new Date(ms + TEHRAN_OFFSET_MS);
  return `${pad2(tehran.getUTCHours())}:${pad2(tehran.getUTCMinutes())}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`INVALID_DATE: ${ymd}`);
  }
  const ms = Date.parse(`${ymd}T00:00:00.000Z`) + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

const div = (a: number, b: number): number => Math.trunc(a / b);
const mod = (a: number, b: number): number => a - Math.trunc(a / b) * b;

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

export const WEEKDAY_NAMES_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'] as const;

export const JALALI_MONTHS_FA = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
] as const;

function jalCal(jy: number, withoutLeap: boolean): { leap: number; gy: number; march: number } {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jm = 0;
  let jump = 0;
  let leap = 0;
  let n = 0;
  for (let i = 1; i < bl; i += 1) {
    jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (!withoutLeap) {
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
  }
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number, r: { gy: number; march: number }): number {
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy, false);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm: number;
  let jd: number;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function toJalaliParts(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  return d2j(g2d(gy, gm, gd));
}

export function jalaliToGregorianYmd(jy: number, jm: number, jd: number): string {
  const r = jalCal(jy, false);
  const jdn = j2d(jy, jm, jd, r);
  const g = d2g(jdn);
  return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
}

export function iranianWeekdayOfYmd(ymd: string): number {
  const ms = new Date(`${ymd}T12:00:00.000Z`).getTime() + TEHRAN_OFFSET_MS; // ظهر → امن
  const jsDay = new Date(ms).getUTCDay(); // 0=Sun … 6=Sat
  return (jsDay + 1) % 7;
}

export function faDigits(input: string | number): string {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  return String(input).replace(/\d/g, (d) => fa[Number(d)]);
}

export function minuteToLabel(minute: number): string {
  return `${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`;
}

export function jalaliLabel(ymd: string): string {
  const [gy, gm, gd] = ymd.split('-').map(Number);
  const j = toJalaliParts(gy, gm, gd);
  return faDigits(`${j.jd} ${JALALI_MONTHS_FA[j.jm - 1]} ${j.jy}`);
}

export function jalaliFullLabel(ymd: string): string {
  return `${WEEKDAY_NAMES_FA[iranianWeekdayOfYmd(ymd)]} ${jalaliLabel(ymd)}`;
}
