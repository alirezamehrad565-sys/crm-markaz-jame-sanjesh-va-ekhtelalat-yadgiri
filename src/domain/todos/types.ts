/**
 * ماژول کارهای داخلی — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تایپ‌های ماژول کارهای داخلی (فاز ۴) — مالک WRITE جدول todos
// قاعدهٔ نقش §9: گیرنده باید manager/secretary باشد؛ از کارِ شخصی (خودم) هم مجاز است

import type { AuthContext, Todo, TodoBadge, TodoBox, TodoChecklistItem } from '@core/shared';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';

/** ورودی ساخت کار — گیرنده همکارِ privileged یا خودِ بازیگر (کار شخصی) */
export interface NewTodoInput {
  title: string;
  note?: string | null;
  assigneeId: string;
  /** تاریخ YYYY-MM-DD (پایان روز تهران) یا ISO کامل؛ undefined = بدون مهلت؛ null = بدون مهلت */
  dueAt?: string | null;
  priority?: 'normal' | 'urgent';
  /** — موارد اولیهٔ چک‌لیست (فقط متن؛ همهٔ done=false) */
  checklist?: string[];
}

/** ورودی ویرایش inline + حذف نرم — فقط ثبت‌کننده (assigner) مجاز است */
export interface UpdateTodoInput {
  title?: string;
  note?: string | null;
  dueAt?: string | null;
  priority?: 'normal' | 'urgent';
  /** — جایگزینی کامل چک‌لیست؛ null = حذف چک‌لیست */
  checklist?: TodoChecklistItem[] | null;
  /** true = soft delete (deleted_at) — §28 هیچ حذف فیزیکی نیست */
  deleted?: boolean;
}

export interface TodoListFilters {
  /** inbox = کارهای روی میز من (assignee) · outbox = کارهای واگذارشدهٔ من (assigner) */
  box: TodoBox;
}

/** خروجی فهرست — badge فقط در صندوق inbox معنا دارد (شمارش فوری/عقب‌افتادهٔ من) */
export interface TodoListResult {
  data: Todo[];
  badge: TodoBadge;
}

/** ناظر اعلان — api-routing به NotifyAppService وصل می‌کند (خطا عملیات را fail نمی‌کند) */
export type TodoAssignedNotifier = (todo: Todo) => Promise<void>;

export interface TodoDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface TodosService {
  list(filters: TodoListFilters, actor: AuthContext): Promise<TodoListResult>;
  create(input: NewTodoInput, actor: AuthContext): Promise<Todo>;
  /**
   * ویرایش inline + حذف نرم — RBAC: فقط ثبت‌کنندهٔ کار (assigner)؛
   * کار انجام‌شده پایان‌حالت است (409)؛ کارِ حذف‌شده 404 می‌دهد.
   */
  update(id: string, patch: UpdateTodoInput, actor: AuthContext): Promise<Todo>;
  /**
   * تکمیل کار — RBAC: فقط مسئول انجام (assignee)؛
   * رسیدن به done → completed_at + action «todo.completed»؛ تکرار → 409.
   */
  complete(id: string, actor: AuthContext): Promise<Todo>;
  /**
   * — افزودن مورد به چک‌لیست کارِ باز — RBAC: ثبت‌کننده یا مسئول؛
   * سقف ۲۰ مورد در سرویس چک می‌شود.
   */
  addChecklistItem(id: string, text: string, actor: AuthContext): Promise<Todo>;
  /**
   * — تغییر وضعیت یک مورد چک‌لیست — RBAC: ثبت‌کننده یا مسئول؛
   * تکمیل خودکار کار رخ نمی‌دهد (تکمیل همچنان دستی و فقط مسئول است).
   */
  toggleChecklistItem(id: string, index: number, done: boolean, actor: AuthContext): Promise<Todo>;
  /** تزریق ناظر اعلان todo_assigned (الگوی setter injection ناظرهای موجود) */
  setNotifier(notifier: TodoAssignedNotifier): void;
}
