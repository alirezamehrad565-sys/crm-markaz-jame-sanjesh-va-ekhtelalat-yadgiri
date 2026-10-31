import type { WaitlistStatus } from '@core/shared';
import { WAITLIST_OPEN_STATUSES } from '@core/shared';

export const WAITLIST_TRANSITIONS: Record<WaitlistStatus, WaitlistStatus[]> = {
  waiting: ['called', 'scheduled', 'admitted', 'rejected', 'no_show', 'cancelled'],
  called: ['scheduled', 'admitted', 'rejected', 'no_show', 'cancelled'],
  scheduled: ['admitted', 'no_show', 'cancelled'],
  admitted: [],
  rejected: ['waiting'],
  no_show: ['waiting'],
  cancelled: ['waiting']
};

export function canTransition(from: WaitlistStatus, to: WaitlistStatus): boolean {
  return WAITLIST_TRANSITIONS[from].includes(to);
}

interface SortableEntry {
  status: WaitlistStatus;
  priority: 'normal' | 'urgent';
  manualOrder: number | null;
  createdAt: string;
  updatedAt: string;
}

function isOpen(entry: SortableEntry): boolean {
  return (WAITLIST_OPEN_STATUSES as readonly string[]).includes(entry.status);
}

export function orderWaitlist<T extends SortableEntry>(rows: readonly T[]): T[] {
  const open = rows.filter(isOpen);
  const closed = rows.filter((r) => !isOpen(r));

  const hasManual = open.some((r) => r.manualOrder !== null && r.manualOrder !== undefined);
  const sortedOpen = [...open].sort((a, b) => {
    if (hasManual) {
      const am = a.manualOrder ?? Number.MAX_SAFE_INTEGER;
      const bm = b.manualOrder ?? Number.MAX_SAFE_INTEGER;
      if (am !== bm) return am - bm;
      return a.createdAt.localeCompare(b.createdAt);
    }
    const au = a.priority === 'urgent' ? 0 : 1;
    const bu = b.priority === 'urgent' ? 0 : 1;
    if (au !== bu) return au - bu;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const sortedClosed = [...closed].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...sortedOpen, ...sortedClosed];
}

export function isOverdue(entry: SortableEntry, now: Date, alertDays: number): boolean {
  if (!isOpen(entry)) return false;
  const created = new Date(entry.createdAt.replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(created)) return false;
  return now.getTime() - created >= alertDays * 24 * 60 * 60 * 1000;
}

interface MatchCandidate {
  id: string;
  nationalId: string | null;
  guardianPhone: string | null;
}

export type MatchOutcome =
  | { kind: 'explicit' | 'national_id' | 'phone'; studentId: string }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: string[] };

export function matchStudent(
  probe: { studentId?: string; nationalId?: string; phone?: string },
  students: readonly MatchCandidate[]
): MatchOutcome {
  if (probe.studentId) {
    const hit = students.find((s) => s.id === probe.studentId);
    return hit ? { kind: 'explicit', studentId: hit.id } : { kind: 'none' };
  }
  if (probe.nationalId) {
    const hit = students.find((s) => s.nationalId === probe.nationalId);
    return hit ? { kind: 'national_id', studentId: hit.id } : { kind: 'none' };
  }
  if (probe.phone) {
    const hits = students.filter((s) => s.guardianPhone === probe.phone);
    if (hits.length === 1) return { kind: 'phone', studentId: hits[0].id };
    if (hits.length > 1) return { kind: 'ambiguous', candidates: hits.map((h) => h.id) };
  }
  return { kind: 'none' };
}

export function appendNote(existing: string | null, label: string, text?: string): string {
  const parts = [existing?.trim(), `［${label}］${text?.trim() || ''}`.trim()].filter(Boolean);
  return parts.join('\n');
}
