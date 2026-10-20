/**
 * اعلان‌های کاربردی و بات‌های نقش‌آگاه بله — خلاصهٔ روز بات
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// برنامه‌ریز pure «خلاصهٔ روز» و «یادآور پیگیری» بات اطلاع‌رسان
// بدون دیتابیس/شبکه — گروه‌بندی و متن‌سازی؛ اجرا در service.ts (همان الگوی reminders.ts)

import { faDigits, jalaliFullLabel, tehranYmdOf } from '@core/shared';
import type { FollowUp } from '@core/shared';
import { followUpGroupOf } from '@domain/followups';
import type { FollowupListGroups, FollowupListItem } from '@core/notify';

/** خلاصهٔ یک چرخهٔ «خلاصهٔ روز» — شمارش کامل برای لاگ/audit/API */
export interface DigestSummary {
  dateYmd: string;
  /** پرچم notify_digest از تنظیمات — در صورت خاموشی همهٔ شمارنده‌ها صفر است */
  flagEnabled: boolean;
  staffSent: number;
  familySent: number;
  classSent: number;
  followupNudges: number;
  /** یادآور بازسنجی مسیرهای فعال (reassess_at ≤ ۷ روز) — فاز بهبود §۱۰.۳ */
  reassessNudges: number;
  enqueued: number;
  duplicates: number;
  /** chatهایی که امروز برنامه‌ای نداشتند — پوش نمی‌گیرند (بدون اسپم) */
  skippedEmpty: number;
  /** — پیام KPI هفتگی ناظرهای اداره (فقط شنبه‌ها؛ غیرشنبه ۰) */
  kpiSent: number;
}

/** آیتم پیگیری بات — از رکورد دامنه با برچسب جلالی مهلت */
function toListItem(f: FollowUp): FollowupListItem {
  return {
    id: f.id,
    title: f.title,
    dueLabel: f.dueAt ? jalaliFullLabel(tehranYmdOf(f.dueAt)) : null
  };
}

/**
 * گروه‌بندی پیگیری‌های باز یک مسئول بر اساس مرزهای §13.4 (تهران) — pure.
 * رکوردهای بسته (done/cancelled) نادیده گرفته می‌شوند — ورودی از فهرست «open» می‌آید.
 */
export function groupFollowUpsForBot(list: FollowUp[], now: Date): FollowupListGroups {
  const groups: FollowupListGroups = { overdue: [], today: [], week: [], future: [], open: [] };
  for (const f of list) {
    const g = followUpGroupOf({ status: f.status, dueAt: f.dueAt }, now);
    if (!g) continue;
    groups[g].push(toListItem(f));
  }
  return groups;
}

/**
 * بدنهٔ پوش «یادآور پیگیری» — خطوط شمارش + حداکثر ۸ آیتم اول (عقب‌افتاده → امروز) — pure.
 * خروجی برای vars.extra قالب followup_nudge.
 */
export function followupsNudgeBody(list: FollowUp[], now: Date): {
  total: number;
  overdue: number;
  today: number;
  extra: string;
} {
  const groups = groupFollowUpsForBot(list, now);
  const overdue = groups.overdue.length;
  const today = groups.today.length;
  const lines: string[] = [];
  if (overdue > 0) lines.push(`⚠️ عقب‌افتاده: ${faDigits(String(overdue))}`);
  if (today > 0) lines.push(`🕐 امروز: ${faDigits(String(today))}`);

  const items = [...groups.overdue, ...groups.today].slice(0, 8);
  for (const it of items) {
    lines.push(`• ${it.title}${it.dueLabel ? ` — مهلت: ${it.dueLabel}` : ''}`);
  }
  const rest = overdue + today - items.length;
  if (rest > 0) lines.push(`و ${faDigits(String(rest))} پیگیری دیگر…`);

  return { total: overdue + today, overdue, today, extra: lines.join('\n') };
}
