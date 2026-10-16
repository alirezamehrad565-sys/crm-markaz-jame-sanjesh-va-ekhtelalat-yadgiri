/**
 * ماژول پیگیری‌ها — توابع خالص منطق محض (بدون I/O)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// منطق خالص پیگیری — بدون دیتابیس، مستقیم قابل تست
// (ماتریس وضعیت، گروه‌بندی §13.4 با مرزهای تهران، مهلت پیش‌فرض)

import type { FollowUpGroup, FollowUpStatus } from '@core/shared';
import { FOLLOWUP_DEFAULT_DUE_DAYS, FOLLOWUP_OPEN_STATUSES } from '@core/shared';
import { addDaysYmd, tehranDayRange, tehranTodayYmd } from '@core/shared';

// ───────────── ماتریس ترنزیشن وضعیت ─────────────
// open → in_progress/done/cancelled · in_progress → done/cancelled
// done/cancelled پایان‌حالت‌اند (قرارداد سایر ماتریس‌های سیستم)

export const FOLLOWUP_TRANSITIONS: Record<FollowUpStatus, FollowUpStatus[]> = {
  open: ['in_progress', 'done', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: [],
  cancelled: []
};

export function canTransition(from: FollowUpStatus, to: FollowUpStatus): boolean {
  return FOLLOWUP_TRANSITIONS[from].includes(to);
}

export function isOpenStatus(status: FollowUpStatus): boolean {
  return (FOLLOWUP_OPEN_STATUSES as readonly string[]).includes(status);
}

// ───────────── مهلت پیش‌فرض ─────────────

/** now + FOLLOWUP_DEFAULT_DUE_DAYS روز — برای پیگیری‌های خودکار هوک‌ها */
export function defaultDueAt(now: Date = new Date()): string {
  return new Date(now.getTime() + FOLLOWUP_DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// ───────────── گروه‌بندی §13.4 ─────────────
// پارتیشن قطعی برای پیگیری‌های بازِ مهلت‌دار (به وقت تهران):
// overdue = due_at < now (تعریف دقیق §13 — computed)
// today = now ≤ due_at ≤ پایان امروز تهران
// week = بعد از امروز تا پایان روز +۷ تهران
// future = بعد از آن
// پیگیریِ بازِ بی‌مهلت فقط در گروه «open» می‌آید؛ بسته‌ها (done/cancelled) هیچ گروهی.

interface Groupable {
  status: FollowUpStatus;
  dueAt: string | null;
}

/** مرزهای UTC گروه‌ها برای یک لحظهٔ now — توسط سرویس برای فیلتر SQL هم استفاده می‌شود */
export function groupBoundaries(now: Date = new Date()): {
  nowIso: string;
  todayEnd: string;
  weekEnd: string;
} {
  const todayYmd = tehranTodayYmd(now);
  const todayEnd = tehranDayRange(todayYmd).end;
  const weekEnd = tehranDayRange(addDaysYmd(todayYmd, FOLLOWUP_DEFAULT_DUE_DAYS)).end;
  return { nowIso: now.toISOString(), todayEnd, weekEnd };
}

export function followUpGroupOf(row: Groupable, now: Date = new Date()): FollowUpGroup | null {
  if (!isOpenStatus(row.status)) return null;
  if (!row.dueAt) return 'open';
  const due = Date.parse(row.dueAt);
  if (Number.isNaN(due)) return 'open';
  const { nowIso, todayEnd, weekEnd } = groupBoundaries(now);
  if (due < Date.parse(nowIso)) return 'overdue';
  if (due <= Date.parse(todayEnd)) return 'today';
  if (due <= Date.parse(weekEnd)) return 'week';
  return 'future';
}
