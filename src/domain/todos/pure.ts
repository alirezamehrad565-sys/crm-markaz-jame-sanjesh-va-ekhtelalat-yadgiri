import type { TodoBadge, TodoStatus } from '@core/shared';

export const TODO_TRANSITIONS: Record<TodoStatus, TodoStatus[]> = {
  pending: ['done'],
  done: []
};

export function canTransition(from: TodoStatus, to: TodoStatus): boolean {
  return TODO_TRANSITIONS[from].includes(to);
}

interface Overdueable {
  status: TodoStatus;
  dueAt: string | null;
}

export function isTodoOverdue(row: Overdueable, now: Date = new Date()): boolean {
  if (row.status !== 'pending' || !row.dueAt) return false;
  const due = Date.parse(row.dueAt);
  if (Number.isNaN(due)) return false;
  return due < now.getTime();
}

export interface Badgeable {
  status: TodoStatus;
  priority: string;
  dueAt: string | null;
}

export function computeBadge(rows: Badgeable[], now: Date = new Date()): TodoBadge {
  let urgent = 0;
  let overdue = 0;
  let attention = 0;
  for (const row of rows) {
    if (row.status !== 'pending') continue;
    const isUrgent = row.priority === 'urgent';
    const isOverdue = isTodoOverdue(row, now);
    if (isUrgent) urgent += 1;
    if (isOverdue) overdue += 1;
    if (isUrgent || isOverdue) attention += 1;
  }
  return { urgent, overdue, attention };
}
