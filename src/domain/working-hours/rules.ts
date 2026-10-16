/**
 * ماژول ساعات کاری — قواعد محض ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Pure rules for weekly working-hour ranges — no I/O, fully unit-testable

export interface HourRange {
  weekday: number;      // 0 = Saturday … 6 = Friday (Iranian week)
  startMinute: number;  // minutes since midnight
  endMinute: number;
}

export interface OverlapViolation {
  weekday: number;
  first: HourRange;
  second: HourRange;
}

/** [start, end) interval intersection on the same weekday */
function intersects(a: HourRange, b: HourRange): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/**
 * Detect overlapping ranges within the same staff week.
 * Returns the first violation found, or null when the week is consistent.
 */
export function findOverlap(items: HourRange[]): OverlapViolation | null {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      if (a.weekday === b.weekday && intersects(a, b)) {
        return { weekday: a.weekday, first: a, second: b };
      }
    }
  }
  return null;
}

/** Total weekly minutes — for the "weekly hours" summary chip */
export function totalWeeklyMinutes(items: HourRange[]): number {
  return items.reduce((sum, r) => sum + (r.endMinute - r.startMinute), 0);
}

/** HH:MM label from minutes-since-midnight (24h forms are allowed: 24:00 for 1440) */
export function minuteToLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
