import type { AuthContext, FollowUp, FollowUpGroup, FollowUpStatus } from '@core/shared';
import { FOLLOWUP_LIST_LIMIT, FOLLOWUP_OPEN_STATUSES } from '@core/shared';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import { canTransition, defaultDueAt, groupBoundaries } from './pure';
import type { FollowUpDeps, FollowUpListFilters, FollowUpsService, NewFollowUpInput, UpdateFollowUpInput } from './types';

interface FollowUpRow {
  id: string;
  entity_type: string;
  entity_id: string;
  student_id: string | null;
  student_name: string | null;
  title: string;
  assignee_id: string;
  assignee_name: string | null;
  created_by: string;
  creator_name: string | null;
  due_at: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToFollowUp(row: FollowUpRow): FollowUp {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    studentId: row.student_id,
    studentName: row.student_name,
    title: row.title,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    createdBy: row.created_by,
    createdByName: row.creator_name,
    dueAt: row.due_at,
    status: row.status as FollowUp['status'],
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const OPEN_LIST = FOLLOWUP_OPEN_STATUSES.map((s) => `'${s}'`).join(',');

const SELECT_BASE = `
  SELECT f.id, f.entity_type, f.entity_id, f.student_id,
         (st.first_name || ' ' || st.last_name) AS student_name,
         f.title, f.assignee_id, sa.full_name AS assignee_name,
         f.created_by, sc.full_name AS creator_name,
         f.due_at, f.status, f.completed_at, f.created_at, f.updated_at
    FROM followups f
    LEFT JOIN students st ON st.id = f.student_id
    LEFT JOIN staff sa ON sa.id = f.assignee_id
    LEFT JOIN staff sc ON sc.id = f.created_by`;

function normalizeDueAt(value: string | null | undefined, now: Date): string | null {
  if (value === null) return null;
  if (value === undefined) return defaultDueAt(now);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new ValidationError('مهلت (due_at) باید زمان ISO معتبر باشد');
  return new Date(ms).toISOString();
}

export function createFollowUpsService(deps: FollowUpDeps): FollowUpsService {
  const { db, audit, logger } = deps;
  const log = logger.child('followups');

  async function loadRow(tx: Pick<DbClient, 'queryOne'>, id: string): Promise<FollowUpRow> {
    const row = await tx.queryOne<FollowUpRow>(`${SELECT_BASE} WHERE f.id = ?`, [id]);
    if (!row) throw new NotFoundError('پیگیری');
    return row;
  }

  function groupCondition(group: FollowUpGroup | 'all' | undefined, params: unknown[]): string {
    if (group === 'all') return '1=1';
    if (!group || group === 'open') return `f.status IN (${OPEN_LIST})`;
    const { nowIso, todayEnd, weekEnd } = groupBoundaries(new Date());
    const dated = `f.status IN (${OPEN_LIST}) AND f.due_at IS NOT NULL`;
    if (group === 'overdue') {
      params.push(nowIso);
      return `${dated} AND f.due_at < ?`;
    }
    if (group === 'today') {
      params.push(nowIso, todayEnd);
      return `${dated} AND f.due_at >= ? AND f.due_at <= ?`;
    }
    if (group === 'week') {
      params.push(todayEnd, weekEnd);
      return `${dated} AND f.due_at > ? AND f.due_at <= ?`;
    }
    params.push(weekEnd);
    return `${dated} AND f.due_at > ?`;
  }

  async function insertWithinTx(
    tx: DbClient,
    id: string,
    input: NewFollowUpInput,
    dueAt: string | null,
    actor: AuthContext
  ): Promise<FollowUp> {
    const title = input.title.trim();
    await tx.execute(
      `INSERT INTO followups (id, entity_type, entity_id, student_id, title, assignee_id, created_by, due_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      [id, input.entityType, input.entityId, input.studentId ?? null, title, input.assigneeId, actor.staffId, dueAt]
    );
    await audit.logInTransaction(tx, {
      actorId: actor.staffId,
      action: 'followup.created',
      resourceType: 'followup',
      resourceId: id,
      changes: {
        status: { from: null, to: 'open' },
        entity: { from: null, to: `${input.entityType}/${input.entityId}` },
        student_id: { from: null, to: input.studentId ?? null },
        title: { from: null, to: title },
        assignee_id: { from: null, to: input.assigneeId },
        due_at: { from: null, to: dueAt }
      }
    });
    const nowIso = new Date().toISOString();
    return {
      id,
      entityType: input.entityType,
      entityId: input.entityId,
      studentId: input.studentId ?? null,
      studentName: null,
      title,
      assigneeId: input.assigneeId,
      assigneeName: null,
      createdBy: actor.staffId,
      createdByName: null,
      dueAt,
      status: 'open',
      completedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso
    };
  }

  const service: FollowUpsService = {
    async list(filters: FollowUpListFilters, actor: AuthContext): Promise<FollowUp[]> {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (filters.mine) {
        conditions.push('f.assignee_id = ?');
        params.push(actor.staffId);
      }
      if (filters.assigneeId) {
        conditions.push('f.assignee_id = ?');
        params.push(filters.assigneeId);
      }
      if (filters.entityType) {
        conditions.push('f.entity_type = ?');
        params.push(filters.entityType);
      }
      if (filters.entityId) {
        conditions.push('f.entity_id = ?');
        params.push(filters.entityId);
      }
      if (filters.studentId) {
        conditions.push('f.student_id = ?');
        params.push(filters.studentId);
      }
      conditions.push(groupCondition(filters.group, params));

      const sql = `${SELECT_BASE} WHERE ${conditions.join(' AND ')}
        ORDER BY CASE WHEN f.status IN (${OPEN_LIST}) THEN 0 ELSE 1 END,
                 CASE WHEN f.due_at IS NULL THEN 1 ELSE 0 END,
                 f.due_at ASC, f.updated_at DESC
        LIMIT ${FOLLOWUP_LIST_LIMIT}`;
      const rows = await db.query<FollowUpRow>(sql, params);
      return rows.map(rowToFollowUp);
    },

    async getById(id: string): Promise<FollowUp | null> {
      const row = await db.queryOne<FollowUpRow>(`${SELECT_BASE} WHERE f.id = ?`, [id]);
      return row ? rowToFollowUp(row) : null;
    },

    async create(input: NewFollowUpInput, actor: AuthContext): Promise<FollowUp> {
      const title = input.title.trim();
      if (title.length < 2) throw new ValidationError('عنوان پیگیری حداقل ۲ نویسه است');
      if (!input.entityId) throw new ValidationError('شناسهٔ موجودیت لازم است');

      const dueAt = normalizeDueAt(input.dueAt, new Date());
      const assignee = await db.queryOne<{ id: string }>(`SELECT id FROM staff WHERE id = ? AND active = 1`, [
        input.assigneeId
      ]);
      if (!assignee) throw new NotFoundError('مسئول پیگیری');

      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await insertWithinTx(tx, id, { ...input, title }, dueAt, actor);
      });
      log.info('followup.created', { id, entity: input.entityType });
      const created = await service.getById(id);
      if (!created) throw new NotFoundError('پیگیری');
      return created;
    },

    async update(id: string, patch: UpdateFollowUpInput, actor: AuthContext): Promise<FollowUp> {
      await db.transaction(async (tx) => {
        const row = await loadRow(tx, id);
        const status = row.status as FollowUpStatus;

        const privileged = actor.role === 'manager' || actor.role === 'secretary';
        if (!privileged && row.assignee_id !== actor.staffId) {
          throw new ForbiddenError('ویرایش پیگیری فقط توسط مسئول همان پیگیری یا مدیر/منشی مجاز است');
        }

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const sets: string[] = [];
        const params: unknown[] = [];

        let newStatus = status;
        if (patch.status !== undefined && patch.status !== status) {
          if (!canTransition(status, patch.status)) {
            throw new ConflictError(
              status === 'done' || status === 'cancelled'
                ? `این پیگیری بسته شده (وضعیت «${status}») و دوباره تغییر نمی‌کند`
                : `تغییر وضعیت از «${status}» به «${patch.status}» مجاز نیست`,
              undefined
            );
          }
          newStatus = patch.status;
          changes.status = { from: status, to: patch.status };
        }

        if (patch.assigneeId !== undefined && patch.assigneeId !== row.assignee_id) {
          const assignee = await tx.queryOne<{ id: string }>(`SELECT id FROM staff WHERE id = ? AND active = 1`, [
            patch.assigneeId
          ]);
          if (!assignee) throw new NotFoundError('مسئول پیگیری');
          sets.push('assignee_id = ?');
          params.push(patch.assigneeId);
          changes.assignee_id = { from: row.assignee_id, to: patch.assigneeId };
        }

        if (patch.dueAt !== undefined) {
          const dueAt = normalizeDueAt(patch.dueAt, new Date());
          if (dueAt !== row.due_at) {
            sets.push('due_at = ?');
            params.push(dueAt);
            changes.due_at = { from: row.due_at, to: dueAt };
          }
        }

        const statusChanged = newStatus !== status;
        if (statusChanged) {
          sets.push('status = ?');
          params.push(newStatus);
          if (newStatus === 'done') {
            sets.push('completed_at = ?');
            params.push(new Date().toISOString());
          }
        }

        if (sets.length === 0) return; // no-op idempotent — بدون audit

        sets.push(`updated_at = datetime('now')`);
        await tx.execute(`UPDATE followups SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: statusChanged && newStatus === 'done' ? 'followup.completed' : 'followup.updated',
          resourceType: 'followup',
          resourceId: id,
          changes
        });
      });
      return (await service.getById(id)) as FollowUp;
    },

    async createWithinTx(tx: DbClient, input: NewFollowUpInput, actor: AuthContext): Promise<FollowUp> {
      const title = input.title.trim();
      if (title.length < 2) throw new ValidationError('عنوان پیگیری حداقل ۲ نویسه است');
      if (!input.entityId) throw new ValidationError('شناسهٔ موجودیت لازم است');
      const dueAt = normalizeDueAt(input.dueAt, new Date());
      const id = crypto.randomUUID();
      const created = await insertWithinTx(tx, id, { ...input, title }, dueAt, actor);
      log.info('followup.created.hook', { id, entity: input.entityType });
      return created;
    }
  };

  return service;
}
