/**
 * ماژول کارهای داخلی — توابع خالص منطق محض (بدون I/O)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// منطق خالص کارهای داخلی — بدون دیتابیس، مستقیم قابل تست
// (ماتریس وضعیت، تشخیص عقب‌افتادگی، شمارش‌های badge)

import type { TodoBadge, TodoStatus } from '@core/shared';

// ───────────── ماتریس ترنزیشن وضعیت ─────────────
// pending → done · done پایان‌حالت است (قرارداد سایر ماتریس‌های سیستم؛
// بازگشت از done وجود ندارد — ویرایش هم روی کارِ انجام‌شده بسته است)

export const TODO_TRANSITIONS: Record<TodoStatus, TodoStatus[]> = {
  pending: ['done'],
  done: []
};

export function canTransition(from: TodoStatus, to: TodoStatus): boolean {
  return TODO_TRANSITIONS[from].includes(to);
}

// ───────────── عقب‌افتادگی (computed — بدون ستون) ─────────────

interface Overdueable {
  status: TodoStatus;
  dueAt: string | null;
}

/** عقب‌افتاده = باز ∧ مهلت‌دار ∧ مهلت گذشته (تعریف computed — مثل followups) */
export function isTodoOverdue(row: Overdueable, now: Date = new Date()): boolean {
  if (row.status !== 'pending' || !row.dueAt) return false;
  const due = Date.parse(row.dueAt);
  if (Number.isNaN(due)) return false;
  return due < now.getTime();
}

// ───────────── شمارش‌های badge (§9) ─────────────
// urgent = باز ∧ فوری
// overdue = باز ∧ عقب‌افتاده
// attention = شمارِ یکتای باز∧(فوری∨عقب‌افتاده) — همان عدد badge قرمز منو؛
// کارِ «فوری و عقب‌افتاده» یک‌بار شمرده می‌شود (نه دو‌بار)

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
