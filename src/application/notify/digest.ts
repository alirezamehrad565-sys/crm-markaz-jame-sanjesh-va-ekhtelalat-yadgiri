import { faDigits, jalaliFullLabel, tehranYmdOf } from '@core/shared';
import type { FollowUp } from '@core/shared';
import { followUpGroupOf } from '@domain/followups';
import type { FollowupListGroups, FollowupListItem } from '@core/notify';

export interface DigestSummary {
  dateYmd: string;
  flagEnabled: boolean;
  staffSent: number;
  familySent: number;
  classSent: number;
  followupNudges: number;
  reassessNudges: number;
  enqueued: number;
  duplicates: number;
  skippedEmpty: number;
  kpiSent: number;
}

function toListItem(f: FollowUp): FollowupListItem {
  return {
    id: f.id,
    title: f.title,
    dueLabel: f.dueAt ? jalaliFullLabel(tehranYmdOf(f.dueAt)) : null
  };
}

export function groupFollowUpsForBot(list: FollowUp[], now: Date): FollowupListGroups {
  const groups: FollowupListGroups = { overdue: [], today: [], week: [], future: [], open: [] };
  for (const f of list) {
    const g = followUpGroupOf({ status: f.status, dueAt: f.dueAt }, now);
    if (!g) continue;
    groups[g].push(toListItem(f));
  }
  return groups;
}

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
