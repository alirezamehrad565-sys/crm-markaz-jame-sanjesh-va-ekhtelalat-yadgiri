import { describe, expect, it } from 'vitest';
import { findOverlap, minuteToLabel, totalWeeklyMinutes } from '../rules';
import type { HourRange } from '../rules';

const r = (weekday: number, startMinute: number, endMinute: number): HourRange => ({
  weekday,
  startMinute,
  endMinute
});

describe('working-hours rules', () => {
  it('accepts a clean week (different days, touching edges are fine)', () => {
    const week = [
      r(0, 480, 720), // Saturday 08:00–12:00
      r(0, 720, 960), // Saturday 12:00–16:00 — touching edge is OK ([,))
      r(1, 480, 720), // یکشنبه
      r(6, 480, 720)  // جمعه
    ];
    expect(findOverlap(week)).toBeNull();
  });

  it('detects overlap on the same day', () => {
    const week = [r(0, 480, 720), r(0, 600, 800)];
    const violation = findOverlap(week);
    expect(violation).not.toBeNull();
    expect(violation?.weekday).toBe(0);
  });

  it('detects containment overlap', () => {
    const week = [r(2, 480, 960), r(2, 540, 600)];
    expect(findOverlap(week)).not.toBeNull();
  });

  it('does not flag identical ranges on different days', () => {
    const week = [r(0, 480, 720), r(3, 480, 720)];
    expect(findOverlap(week)).toBeNull();
  });

  it('empty week has no violations and zero total', () => {
    expect(findOverlap([])).toBeNull();
    expect(totalWeeklyMinutes([])).toBe(0);
  });

  it('totalWeeklyMinutes sums durations across days', () => {
    const week = [r(0, 480, 720), r(0, 720, 780), r(1, 540, 900)];
    expect(totalWeeklyMinutes(week)).toBe(240 + 60 + 360);
  });

  it('minuteToLabel formats HH:MM including 24:00 boundary', () => {
    expect(minuteToLabel(480)).toBe('08:00');
    expect(minuteToLabel(0)).toBe('00:00');
    expect(minuteToLabel(1440)).toBe('24:00');
    expect(minuteToLabel(765)).toBe('12:45');
  });
});
