import type { FollowUpGroup, FollowUpStatus } from '@core/shared';
import { FOLLOWUP_DEFAULT_DUE_DAYS, FOLLOWUP_OPEN_STATUSES } from '@core/shared';
import { addDaysYmd, tehranDayRange, tehranTodayYmd } from '@core/shared';

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

export function defaultDueAt(now: Date = new Date()): string {
  return new Date(now.getTime() + FOLLOWUP_DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

interface Groupable {
  status: FollowUpStatus;
  dueAt: string | null;
}

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
