/**
 * سرویس داشبورد و KPI ها — هدف غربالگری داشبورد
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// محاسبهٔ pure هدف‌های سنجش (سال/ماه/بازهٔ سفارشی) — مشترک بین داشبورد و بات بله
// ورودی‌ها: تنظیمات هدفگذاری + شمارش روزانهٔ سنجش + امروز تهران؛ خروجی: کارت‌های هدف مستقل

import type { DashboardScreeningGoalItem, ScreeningTargetConfig } from '@core/shared';
import {
  JALALI_MONTHS_FA,
  addDaysYmd,
  faDigits,
  jalaliToGregorianYmd,
  toJalaliParts
} from '@core/shared';

/** شمارش سنجش یک روز — هم‌شکل ScreeningDayCount دامنه (برای وابستگی کمتر، بازتعریف ساختاری) */
export interface GoalDayCount {
  day: string; // YYYY-MM-DD
  count: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** برچسب عددی جلالیِ یک تاریخ میلادی: «۱۴۰۵/۰۵/۰۱» */
function faJalaliYmd(gYmd: string): string {
  const [gy, gm, gd] = gYmd.split('-').map(Number);
  const j = toJalaliParts(gy, gm, gd);
  return faDigits(`${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`);
}

/** پایان ماه جلالی — با کبیسهٔ واقعی (اول ماه بعد منهای یک روز) */
export function jalaliMonthEndYmd(jy: number, jm: number): string {
  const nextStart = jm >= 12 ? jalaliToGregorianYmd(jy + 1, 1, 1) : jalaliToGregorianYmd(jy, jm + 1, 1);
  return addDaysYmd(nextStart, -1);
}

/** پایان سال جلالی */
export function jalaliYearEndYmd(jy: number): string {
  return addDaysYmd(jalaliToGregorianYmd(jy + 1, 1, 1), -1);
}

/** پنجرهٔ میلادی یک هدف — حالت سفارشی/ماه/سال */
export function goalWindowOf(t: ScreeningTargetConfig): { fromYmd: string; toYmd: string } {
  if (t.from && t.to) return { fromYmd: t.from, toYmd: t.to };
  if (t.month !== null && t.month !== undefined) {
    return { fromYmd: jalaliToGregorianYmd(t.year, t.month, 1), toYmd: jalaliMonthEndYmd(t.year, t.month) };
  }
  return { fromYmd: jalaliToGregorianYmd(t.year, 1, 1), toYmd: jalaliYearEndYmd(t.year) };
}

/** برچسب فارسی بازهٔ هدف — با عنوان اختیاری در ابتدای آن */
export function goalPeriodLabelOf(t: ScreeningTargetConfig): string {
  const base =
    t.from && t.to
      ? `${faJalaliYmd(t.from)} تا ${faJalaliYmd(t.to)}`
      : t.month !== null && t.month !== undefined
        ? `${JALALI_MONTHS_FA[t.month - 1]} ${faDigits(String(t.year))}`
        : `سال ${faDigits(String(t.year))}`;
  const title = t.title?.trim();
  return title ? `${title} — ${base}` : base;
}

/** وضعیت هدف نسبت به امروز */
export function goalStatusOf(fromYmd: string, toYmd: string, todayYmd: string): DashboardScreeningGoalItem['status'] {
  if (todayYmd < fromYmd) return 'upcoming';
  if (todayYmd > toYmd) return 'past';
  return 'active';
}

/** جمع سنجش‌های داخل یک پنجره از شمارش روزانه */
export function goalDoneOf(dayCounts: GoalDayCount[], fromYmd: string, toYmd: string): number {
  let done = 0;
  for (const d of dayCounts) {
    if (d.day >= fromYmd && d.day <= toYmd) done += d.count;
  }
  return done;
}

/** — همهٔ هدف‌ها به کارت مستقل — مرتب: فعال ← آینده ← گذشته و سپس زودترشروع‌تر */
export function summarizeScreeningGoals(
  targets: ScreeningTargetConfig[],
  dayCounts: GoalDayCount[],
  todayYmd: string
): DashboardScreeningGoalItem[] {
  const statusRank = { active: 0, upcoming: 1, past: 2 } as const;
  const items = targets.map((t, idx) => {
    const { fromYmd, toYmd } = goalWindowOf(t);
    const done = goalDoneOf(dayCounts, fromYmd, toYmd);
    const percent = t.target > 0 ? Math.min(100, Math.round((done / t.target) * 100)) : 0;
    return {
      key: `${idx}:${t.year}:${t.month ?? 'all'}:${t.from ?? '-'}:${t.to ?? '-'}:${t.title ?? ''}`,
      mode: (t.from && t.to ? 'custom' : t.month !== null && t.month !== undefined ? 'month' : 'year') as DashboardScreeningGoalItem['mode'],
      title: t.title?.trim() ? t.title.trim() : null,
      periodLabel: goalPeriodLabelOf(t),
      fromYmd,
      toYmd,
      target: t.target,
      done,
      percent,
      remaining: Math.max(0, t.target - done),
      status: goalStatusOf(fromYmd, toYmd, todayYmd)
    };
  });
  return items.sort((a, b) => {
    const s = statusRank[a.status] - statusRank[b.status];
    if (s !== 0) return s;
    return a.fromYmd < b.fromYmd ? -1 : a.fromYmd > b.fromYmd ? 1 : 0;
  });
}

/** پنجرهٔ کوئری شمارش روزانه — حداقل سال جاری تا امروز + همهٔ پنجره‌های هدف‌ها */
export function goalsQueryWindow(
  targets: ScreeningTargetConfig[],
  todayYmd: string
): { fromYmd: string; toYmd: string } {
  const [gy, gm, gd] = todayYmd.split('-').map(Number);
  const j = toJalaliParts(gy, gm, gd);
  let fromYmd = jalaliToGregorianYmd(j.jy, 1, 1);
  let toYmd = todayYmd;
  for (const t of targets) {
    const w = goalWindowOf(t);
    if (w.fromYmd < fromYmd) fromYmd = w.fromYmd;
    if (w.toYmd > toYmd) toYmd = w.toYmd;
  }
  return { fromYmd, toYmd };
}
