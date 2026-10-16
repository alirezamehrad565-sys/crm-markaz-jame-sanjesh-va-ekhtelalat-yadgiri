/**
 * ماژول کارهای داخلی — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Business logic کارهای داخلی (فاز ۴) — مالک WRITE جدول todos
// قواعد §9 (+):
// - گیرنده فقط manager/secretary — و از کارِ شخصی (گیرنده = خودِ بازیگر) مجاز است
// - ویرایش/حذف نرم فقط توسط ثبت‌کننده (assigner)؛ تکمیل فقط توسط مسئول (assignee)
// - چک‌لیست: افزودن/تغییر مورد توسط ثبت‌کننده یا مسئول؛ تکمیل خودکار کار رخ نمی‌دهد
// - audit هم‌تراکنش (قانون ۴) — title در audit مجاز است (دادهٔ PII نیست؛ §9/§13 هم‌ارز)
// - حذف فقط نرم (deleted_at — §28)؛ کارِ حذف‌شده از همهٔ فهرست‌ها و UPDATEها خارج است (404)
// - اعلان todo_assigned پس از commit با ناظر تزریقی — خطای آن عملیات را fail نمی‌کند؛
// برای کارِ شخصی (گیرنده = ثبت‌کننده) اعلان حذف می‌شود (اعلان به خودی بی‌معناست)

import type { AuthContext, Todo, TodoChecklistItem, TodoStatus } from '@core/shared';
import { ValidationError, ForbiddenError, NotFoundError, ConflictError } from '@core/errors';
import { TODO_CHECKLIST_MAX } from '@core/shared';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import { tehranDayRange } from '@core/shared';
import { canTransition, computeBadge } from './pure';
import type {
  TodoAssignedNotifier,
  TodoDeps,
  TodoListFilters,
  TodoListResult,
  TodosService,
  NewTodoInput,
  UpdateTodoInput
} from './types';

interface TodoRow {
  id: string;
  title: string;
  note: string | null;
  checklist: string | null;
  assigner_id: string;
  assigner_name: string | null;
  assignee_id: string;
  assignee_name: string | null;
  due_at: string | null;
  priority: string;
  status: string;
  completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** — تجزیهٔ امن JSON چک‌لیست؛ شکل خراب → null (هرگز throw نمی‌کند) */
function parseChecklist(raw: string | null): TodoChecklistItem[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const items: TodoChecklistItem[] = [];
    for (const it of arr) {
      if (it && typeof it.text === 'string' && it.text.trim() && typeof it.done === 'boolean') {
        items.push({ text: it.text.trim(), done: it.done });
      }
    }
    return items.length > 0 ? items.slice(0, TODO_CHECKLIST_MAX) : null;
  } catch {
    return null;
  }
}

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    checklist: parseChecklist(row.checklist),
    assignerId: row.assigner_id,
    assignerName: row.assigner_name,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    dueAt: row.due_at,
    priority: row.priority as Todo['priority'],
    status: row.status as TodoStatus,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SELECT_BASE = `
  SELECT t.id, t.title, t.note, t.checklist,
         t.assigner_id, sa.full_name AS assigner_name,
         t.assignee_id, se.full_name AS assignee_name,
         t.due_at, t.priority, t.status, t.completed_at, t.deleted_at,
         t.created_at, t.updated_at
    FROM todos t
    LEFT JOIN staff sa ON sa.id = t.assigner_id
    LEFT JOIN staff se ON se.id = t.assignee_id`;

/**
 * نرمال‌سازی مهلت: تاریخ خالی (YYYY-MM-DD) = پایانِ همان روزِ تهران تا «مهلت روز»
 * معنا پیدا کند؛ ISO کامل عیناً نرمال می‌شود؛ null = حذف مهلت.
 */
function normalizeDueAt(value: string | null | undefined): string | null {
  if (value === null) return null;
  if (value === undefined || value === '') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return tehranDayRange(value).end;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new ValidationError('مهلت (due_at) باید تاریخ یا زمان ISO معتبر باشد');
  return new Date(ms).toISOString();
}

// ── نرمال‌سازی چک‌لیست (سرویس مالک داده؛ دفاع در عمق روی خروجی Zod) ──

/** متن‌های خام → JSON ذخیره‌سازی (همه done=false)؛ خالی/تعریف‌نشده → null */
function m108NormalizeChecklistTexts(texts: string[] | undefined): string | null {
  if (!texts || texts.length === 0) return null;
  const seen = new Set<string>();
  const items: TodoChecklistItem[] = [];
  for (const t of texts) {
    const text = t.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    items.push({ text, done: false });
    if (items.length >= TODO_CHECKLIST_MAX) break;
  }
  return items.length > 0 ? JSON.stringify(items) : null;
}

/** شکل کامل {text, done} → JSON ذخیره‌سازی؛ null/خالی → null (حذف چک‌لیست) */
function m108NormalizeChecklistItems(items: TodoChecklistItem[] | null | undefined): string | null {
  if (!items || items.length === 0) return null;
  const seen = new Set<string>();
  const clean: TodoChecklistItem[] = [];
  for (const it of items) {
    const text = it.text.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    clean.push({ text, done: Boolean(it.done) });
    if (clean.length >= TODO_CHECKLIST_MAX) break;
  }
  return clean.length > 0 ? JSON.stringify(clean) : null;
}

export function createTodosService(deps: TodoDeps): TodosService {
  const { db, audit, logger } = deps;
  const log = logger.child('todos');

  let notifier: TodoAssignedNotifier | null = null;

  /** رکورد فعال (حذف‌نشده) — کارِ حذف‌شده 404 است، انگار وجود ندارد */
  async function loadActiveRow(tx: Pick<DbClient, 'queryOne'>, id: string): Promise<TodoRow> {
    const row = await tx.queryOne<TodoRow>(`${SELECT_BASE} WHERE t.id = ? AND t.deleted_at IS NULL`, [id]);
    if (!row) throw new NotFoundError('کار');
    return row;
  }

  /**
   * اعتبارسنجی گیرنده — قاعدهٔ جفت secretary↔manager (§9)
   * — کارِ شخصی (گیرنده = خودِ بازیگر) مجاز است؛ فقط باید privileged باشد
   * (کل ماژول manager/secretary است — بازیگر همیشه privileged است؛ برای قرارداد
   * آینده نقش گیرندهٔ غیرخودی هم همین‌جا چک می‌شود).
   */
  async function assertValidAssignee(tx: Pick<DbClient, 'queryOne'>, assigneeId: string, actor: AuthContext): Promise<void> {
    if (assigneeId === actor.staffId) return; // — کار شخصی
    const row = await tx.queryOne<{ id: string; role: string; active: number }>(
      `SELECT id, role, active FROM staff WHERE id = ?`,
      [assigneeId]
    );
    if (!row) throw new NotFoundError('همکار گیرنده');
    if (!row.active) throw new NotFoundError('همکار گیرنده');
    if (row.role !== 'manager' && row.role !== 'secretary') {
      throw new ValidationError('گیرندهٔ کار داخلی فقط مدیر یا منشی است — درمانگر در این چرخه نیست');
    }
  }

  const service: TodosService = {
    async list(filters: TodoListFilters, actor: AuthContext): Promise<TodoListResult> {
      // نقش خواندن: کل ماژول manager/secretary است (routes هم requireRole دارد) — گارد محافظتی
      if (actor.role !== 'manager' && actor.role !== 'secretary') {
        throw new ForbiddenError('کارهای داخلی فقط بین منشی و مدیر رد و بدل می‌شود');
      }
      const boxColumn = filters.box === 'outbox' ? 't.assigner_id' : 't.assignee_id';
      const rows = await db.query<TodoRow>(
        `${SELECT_BASE}
          WHERE ${boxColumn} = ? AND t.deleted_at IS NULL
          ORDER BY CASE WHEN t.status = 'pending' THEN 0 ELSE 1 END,
                   CASE WHEN t.priority = 'urgent' THEN 0 ELSE 1 END,
                   CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
                   t.due_at ASC, t.created_at DESC
          LIMIT 200`,
        [actor.staffId]
      );
      // badge فقط برای inbox معنا دارد؛ outbox هم همان ساختار را با صفرها برمی‌گرداند
      const badge =
        filters.box === 'inbox'
          ? computeBadge(rows.map((r) => ({ status: r.status as TodoStatus, priority: r.priority, dueAt: r.due_at })))
          : { urgent: 0, overdue: 0, attention: 0 };
      return { data: rows.map(rowToTodo), badge };
    },

    async create(input: NewTodoInput, actor: AuthContext): Promise<Todo> {
      const title = input.title.trim();
      if (title.length < 2) throw new ValidationError('عنوان کار حداقل ۲ نویسه است');
      const dueAt = normalizeDueAt(input.dueAt);
      const priority = input.priority ?? 'normal';
      // موارد اولیهٔ چک‌لیست: نرمال‌سازی متن؛ همهٔ done=false؛ سقف ۲۰
      const checklistRaw = m108NormalizeChecklistTexts(input.checklist);

      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await assertValidAssignee(tx, input.assigneeId, actor);
        await tx.execute(
          `INSERT INTO todos (id, title, note, checklist, assigner_id, assignee_id, due_at, priority, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [id, title, input.note ?? null, checklistRaw, actor.staffId, input.assigneeId, dueAt, priority]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'todo.created',
          resourceType: 'todo',
          resourceId: id,
          changes: {
            title: { from: null, to: title },
            assignee_id: { from: null, to: input.assigneeId },
            due_at: { from: null, to: dueAt },
            priority: { from: null, to: priority },
            ...(checklistRaw !== null ? { checklist: { from: null, to: `${input.checklist?.length ?? 0} مورد` } } : {})
          }
        });
      });
      log.info('todo.created', { id, personal: input.assigneeId === actor.staffId });

      // اعلان بعد از commit — خطای ناظر هرگز عملیات اصلی را fail نمی‌کند
      // کارِ شخصی (گیرنده = ثبت‌کننده) اعلان نمی‌گیرد
      if (input.assigneeId === actor.staffId) {
        const created = (await service.list({ box: 'outbox' }, actor)).data.find((t) => t.id === id);
        if (!created) throw new NotFoundError('کار');
        return created;
      }
      const created = (await service.list({ box: 'outbox' }, actor)).data.find((t) => t.id === id);
      if (created && notifier) {
        try {
          await notifier(created);
        } catch (err) {
          log.warn('todo.assigned.notify.failed', { id, error: err instanceof Error ? err.message : 'UNKNOWN' });
        }
      }
      if (!created) throw new NotFoundError('کار');
      return created;
    },

    async update(id: string, patch: UpdateTodoInput, actor: AuthContext): Promise<Todo> {
      await db.transaction(async (tx) => {
        const row = await loadActiveRow(tx, id);

        // RBAC: ویرایش/حذف فقط توسط ثبت‌کننده (assigner)
        if (row.assigner_id !== actor.staffId) {
          throw new ForbiddenError('ویرایش کار فقط توسط ثبت‌کنندهٔ آن مجاز است');
        }

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const sets: string[] = [];
        const params: unknown[] = [];

        if (patch.deleted === true) {
          // حذف نرم — روی کارِ انجام‌شده هم مجاز (خانه‌تکانی)؛ §28
          sets.push(`deleted_at = ?`);
          params.push(new Date().toISOString());
          changes.deleted_at = { from: null, to: 'set' };
        } else {
          if (row.status !== 'pending') {
            throw new ConflictError('این کار انجام شده و دیگر ویرایش نمی‌شود');
          }
          if (patch.title !== undefined && patch.title !== row.title) {
            sets.push('title = ?');
            params.push(patch.title);
            changes.title = { from: row.title, to: patch.title };
          }
          if (patch.note !== undefined) {
            const note = patch.note === null ? null : patch.note;
            if (note !== row.note) {
              sets.push('note = ?');
              params.push(note);
              changes.note = { from: row.note, to: note };
            }
          }
          if (patch.dueAt !== undefined) {
            const dueAt = normalizeDueAt(patch.dueAt);
            if (dueAt !== row.due_at) {
              sets.push('due_at = ?');
              params.push(dueAt);
              changes.due_at = { from: row.due_at, to: dueAt };
            }
          }
          if (patch.priority !== undefined && patch.priority !== row.priority) {
            sets.push('priority = ?');
            params.push(patch.priority);
            changes.priority = { from: row.priority, to: patch.priority };
          }
          if (patch.checklist !== undefined) {
            // جایگزینی کامل چک‌لیست؛ null = حذف؛ شکل نهایی از Zod می‌آید ولی
            // سقف/شکل را دوباره نرمال می‌کنیم (دفاع در عمق — سرویس مالک داده است)
            const nextRaw = m108NormalizeChecklistItems(patch.checklist);
            const currentRaw = row.checklist;
            if (nextRaw !== currentRaw) {
              sets.push('checklist = ?');
              params.push(nextRaw);
              const fromItems = parseChecklist(currentRaw);
              const toItems = parseChecklist(nextRaw);
              changes.checklist = {
                from: fromItems ? `${fromItems.length} مورد` : null,
                to: toItems ? `${toItems.length} مورد` : null
              };
            }
          }
        }

        if (sets.length === 0) return; // no-op idempotent — بدون audit

        sets.push(`updated_at = datetime('now')`);
        await tx.execute(`UPDATE todos SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'todo.updated',
          resourceType: 'todo',
          resourceId: id,
          changes
        });
      });
      // read-back بعد از commit — برای حذف نرم هم پاسخ همان رکورد (با deleted_at) برمی‌گردد
      const updated = await db.queryOne<TodoRow>(`${SELECT_BASE} WHERE t.id = ?`, [id]);
      if (!updated) throw new NotFoundError('کار');
      return rowToTodo(updated);
    },

    async complete(id: string, actor: AuthContext): Promise<Todo> {
      await db.transaction(async (tx) => {
        const row = await loadActiveRow(tx, id);

        // RBAC: تکمیل فقط توسط مسئول انجام (assignee) — ثبت‌کننده هم 403 است
        if (row.assignee_id !== actor.staffId) {
          throw new ForbiddenError('انجام کار فقط توسط مسئول همان کار ثبت می‌شود');
        }

        const status = row.status as TodoStatus;
        if (!canTransition(status, 'done')) {
          throw new ConflictError('این کار قبلاً انجام شده است');
        }

        const completedAt = new Date().toISOString();
        await tx.execute(
          `UPDATE todos SET status = 'done', completed_at = ?, updated_at = datetime('now') WHERE id = ?`,
          [completedAt, id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'todo.completed',
          resourceType: 'todo',
          resourceId: id,
          changes: {
            status: { from: status, to: 'done' },
            completed_at: { from: null, to: completedAt }
          }
        });
      });
      log.info('todo.completed', { id });
      const updated = await db.queryOne<TodoRow>(`${SELECT_BASE} WHERE t.id = ?`, [id]);
      if (!updated) throw new NotFoundError('کار');
      return rowToTodo(updated);
    },

    // ── چک‌لیست کار (ثبت‌کننده یا مسئول؛ فقط کارِ باز) ──

    async addChecklistItem(id: string, text: string, actor: AuthContext): Promise<Todo> {
      const clean = text.trim();
      if (!clean) throw new ValidationError('مورد چک‌لیست خالی است');
      if (clean.length > 200) throw new ValidationError('مورد چک‌لیست بیش از ۲۰۰ نویسه است');
      await db.transaction(async (tx) => {
        const row = await loadActiveRow(tx, id);
        if (row.assigner_id !== actor.staffId && row.assignee_id !== actor.staffId) {
          throw new ForbiddenError('فقط ثبت‌کننده یا مسئول کار می‌تواند چک‌لیست را تغییر دهد');
        }
        if (row.status !== 'pending') {
          throw new ConflictError('این کار انجام شده و چک‌لیستش تغییر نمی‌کند');
        }
        const items = parseChecklist(row.checklist) ?? [];
        if (items.length >= TODO_CHECKLIST_MAX) {
          throw new ValidationError(`چک‌لیست بیش از ${TODO_CHECKLIST_MAX} مورد ندارد`);
        }
        if (items.some((it) => it.text === clean)) {
          throw new ConflictError('این مورد از قبل در چک‌لیست هست');
        }
        items.push({ text: clean, done: false });
        await tx.execute(`UPDATE todos SET checklist = ?, updated_at = datetime('now') WHERE id = ?`, [
          JSON.stringify(items),
          id
        ]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'todo.updated',
          resourceType: 'todo',
          resourceId: id,
          changes: { checklist: { from: `${items.length - 1} مورد`, to: `${items.length} مورد` } }
        });
      });
      const updated = await db.queryOne<TodoRow>(`${SELECT_BASE} WHERE t.id = ?`, [id]);
      if (!updated) throw new NotFoundError('کار');
      return rowToTodo(updated);
    },

    async toggleChecklistItem(id: string, index: number, done: boolean, actor: AuthContext): Promise<Todo> {
      if (!Number.isInteger(index) || index < 0) throw new ValidationError('شمارهٔ مورد چک‌لیست نامعتبر است');
      await db.transaction(async (tx) => {
        const row = await loadActiveRow(tx, id);
        if (row.assigner_id !== actor.staffId && row.assignee_id !== actor.staffId) {
          throw new ForbiddenError('فقط ثبت‌کننده یا مسئول کار می‌تواند چک‌لیست را تغییر دهد');
        }
        if (row.status !== 'pending') {
          throw new ConflictError('این کار انجام شده و چک‌لیستش تغییر نمی‌کند');
        }
        const items = parseChecklist(row.checklist);
        if (!items || index >= items.length) throw new NotFoundError('مورد چک‌لیست');
        if (items[index].done === done) return; // no-op — وضعیت همان است
        const openBefore = items.filter((i) => !i.done).length;
        items[index] = { ...items[index], done };
        const openAfter = items.filter((i) => !i.done).length;
        await tx.execute(`UPDATE todos SET checklist = ?, updated_at = datetime('now') WHERE id = ?`, [
          JSON.stringify(items),
          id
        ]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'todo.updated',
          resourceType: 'todo',
          resourceId: id,
          changes: { checklist: { from: `${openBefore} باز`, to: `${openAfter} باز` } }
        });
      });
      const updated = await db.queryOne<TodoRow>(`${SELECT_BASE} WHERE t.id = ?`, [id]);
      if (!updated) throw new NotFoundError('کار');
      return rowToTodo(updated);
    },

    setNotifier(fn: TodoAssignedNotifier): void {
      notifier = fn;
    }
  };

  return service;
}
