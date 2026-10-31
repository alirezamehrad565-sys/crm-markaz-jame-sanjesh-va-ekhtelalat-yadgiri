import type { AuthContext, ConflictWarning } from '@core/shared';
import { tehranDayRange } from '@core/shared';
import { ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import type { AppointmentRow } from './repository';
import type { CopyWeekInput, CopyWeekResult } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

interface WeekCopyCtx {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  actor: AuthContext;
}

export async function copyWeek(ctx: WeekCopyCtx & { input: CopyWeekInput }): Promise<CopyWeekResult> {
  const { db, audit, logger, actor, input } = ctx;

  for (const [label, ymd] of [['source_monday', input.sourceMonday], ['target_monday', input.targetMonday]] as const) {
    const day = new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
    if (day !== 1) {
      throw new ValidationError(`${label} باید دوشنبه باشد (${ymd})`);
    }
  }
  if (Date.parse(input.targetMonday) <= Date.parse(input.sourceMonday)) {
    throw new ValidationError('target_monday باید بعد از source_monday باشد');
  }

  if (actor.role === 'therapist' && input.staffId !== actor.staffId) {
    throw new ForbiddenError('کپی هفته فقط برای برنامهٔ خودِ شما مجاز است');
  }

  const sourceRange = tehranDayRange(input.sourceMonday);
  const sourceEnd = new Date(Date.parse(sourceRange.end) + 7 * DAY_MS).toISOString();
  const shiftMs = Date.parse(`${input.targetMonday}T00:00:00.000Z`) - Date.parse(`${input.sourceMonday}T00:00:00.000Z`);

  const conditions = [`start_at >= ?`, `start_at < ?`, `status = 'scheduled'`];
  const params: unknown[] = [sourceRange.start, sourceEnd];
  if (input.staffId) {
    conditions.push('staff_id = ?');
    params.push(input.staffId);
  }

  const sourceRows = await db.query<AppointmentRow>(
    `SELECT id, staff_id, start_at, end_at, status, session_type, note, version, batch_id, created_by, created_at, updated_at
       FROM appointments
      WHERE ${conditions.join(' AND ')}
      ORDER BY start_at`,
    params
  );

  if (sourceRows.length === 0) {
    return { batchId: null, copied: 0, conflicts: [], dryRun: input.dryRun ?? false };
  }

  const ids = sourceRows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const studentRows = await db.query<{ appointment_id: string; student_id: string; facet_id: string | null }>(
    `SELECT appointment_id, student_id, facet_id FROM appointment_students WHERE appointment_id IN (${placeholders})`,
    ids
  );
  const studentsByAppt = new Map<string, { student_id: string; facet_id: string | null }[]>();
  for (const s of studentRows) {
    const list = studentsByAppt.get(s.appointment_id) ?? [];
    list.push(s);
    studentsByAppt.set(s.appointment_id, list);
  }

  const batchId = crypto.randomUUID();
  const conflicts: ConflictWarning[] = [];
  const toCopy: { row: AppointmentRow; startAt: string; endAt: string }[] = [];

  for (const row of sourceRows) {
    const newStart = new Date(Date.parse(row.start_at) + shiftMs).toISOString();
    const newEnd = new Date(Date.parse(row.end_at) + shiftMs).toISOString();

    const overlap = await db.queryOne<{ id: string; start_at: string; end_at: string }>(
      `SELECT id, start_at, end_at FROM appointments
        WHERE staff_id = ? AND status != 'cancelled' AND start_at < ? AND end_at > ? LIMIT 1`,
      [row.staff_id, newEnd, newStart]
    );

    if (overlap) {
      conflicts.push({
        type: 'overlap',
        appointmentId: overlap.id,
        staffId: row.staff_id,
        existingStartAt: overlap.start_at,
        existingEndAt: overlap.end_at,
        proposedStartAt: newStart,
        proposedEndAt: newEnd
      });
      continue;
    }
    toCopy.push({ row, startAt: newStart, endAt: newEnd });
  }

  if (input.dryRun) {
    return { batchId: null, copied: toCopy.length, conflicts, dryRun: true };
  }

  await db.transaction(async (tx) => {
    for (const item of toCopy) {
      const newId = crypto.randomUUID();
      await tx.execute(
        `INSERT INTO appointments (id, staff_id, start_at, end_at, status, session_type, note, version, batch_id, created_by)
         VALUES (?, ?, ?, ?, 'scheduled', ?, ?, 1, ?, ?)`,
        [newId, item.row.staff_id, item.startAt, item.endAt, item.row.session_type, item.row.note, batchId, actor.staffId]
      );
      for (const s of studentsByAppt.get(item.row.id) ?? []) {
        await tx.execute(`INSERT INTO appointment_students (appointment_id, student_id, facet_id) VALUES (?, ?, ?)`, [
          newId,
          s.student_id,
          s.facet_id
        ]);
      }
    }
    await audit.logInTransaction(tx, {
      actorId: actor.staffId,
      action: 'appointment.copy_week',
      resourceType: 'appointment_batch',
      resourceId: batchId,
      changes: {
        source_monday: { from: null, to: input.sourceMonday },
        target_monday: { from: null, to: input.targetMonday },
        copied: { from: null, to: toCopy.length },
        skipped_conflicts: { from: null, to: conflicts.length }
      }
    });
  });

  logger.child('copyWeek').info('appointment.copy_week.done', { copied: toCopy.length, conflicts: conflicts.length });

  return { batchId, copied: toCopy.length, conflicts, dryRun: false };
}

export async function undoCopyWeek(ctx: WeekCopyCtx & { batchId: string }): Promise<{ removed: number }> {
  const { db, audit, logger, actor, batchId } = ctx;

  const batchRows = await db.query<{ id: string }>(`SELECT id FROM appointments WHERE batch_id = ?`, [batchId]);
  if (batchRows.length === 0) {
    throw new NotFoundError('دسته کپی هفته');
  }

  if (actor.role === 'therapist') {
    const staffRows = await db.query<{ staff_id: string }>(
      `SELECT DISTINCT staff_id FROM appointments WHERE batch_id = ?`,
      [batchId]
    );
    if (staffRows.some((r) => r.staff_id !== actor.staffId)) {
      throw new ForbiddenError('برگردانی دستهٔ کپی فقط برای برنامهٔ خودِ شما مجاز است');
    }
  }

  const placeholders = batchRows.map(() => '?').join(',');
  const attended = await db.query<{ appointment_id: string }>(
    `SELECT DISTINCT appointment_id FROM appointment_students
      WHERE appointment_id IN (${placeholders}) AND attendance != 'pending'`,
    batchRows.map((r) => r.id)
  );
  const blockedIds = new Set(attended.map((r) => r.appointment_id));

  const removable = batchRows.map((r) => r.id).filter((id) => !blockedIds.has(id));
  if (removable.length === 0) {
    return { removed: 0 };
  }

  const removablePlaceholders = removable.map(() => '?').join(',');
  await db.transaction(async (tx) => {
    await tx.execute(`DELETE FROM appointment_students WHERE appointment_id IN (${removablePlaceholders})`, removable);
    await tx.execute(`DELETE FROM appointments WHERE id IN (${removablePlaceholders})`, removable);
    await audit.logInTransaction(tx, {
      actorId: actor.staffId,
      action: 'appointment.copy_week.undo',
      resourceType: 'appointment_batch',
      resourceId: batchId,
      changes: { removed: { from: null, to: removable.length }, blocked: { from: null, to: blockedIds.size } }
    });
  });

  logger.child('copyWeek').info('appointment.copy_week.undo.done', { removed: removable.length });
  return { removed: removable.length };
}
