export interface HourRange {
  weekday: number;      // 0 = Saturday … 6 = Friday (Iranian week)
  startMinute: number;  // دقیقه از نیمه‌شب
  endMinute: number;
}

export interface OverlapViolation {
  weekday: number;
  first: HourRange;
  second: HourRange;
}

function intersects(a: HourRange, b: HourRange): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

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

export function totalWeeklyMinutes(items: HourRange[]): number {
  return items.reduce((sum, r) => sum + (r.endMinute - r.startMinute), 0);
}

export function minuteToLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
