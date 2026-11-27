import type { AuthContext, ConflictWarning } from '@core/shared';
import { tehranDayRange } from '@core/shared';
import { ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import { inParamChunks, inPlaceholders } from '@core/db/in-chunks'; // ۱.۲۵.۷۲ — دروازهٔ IN-list (بدهی ف۶ ⑧)
import { findAssessmentBlockConflict } from '@domain/assessment-blocks'; // ۱.۲۷.۱۵ — سد بلوک سنجش در کپی هفته (نرم، هم‌الگوی تداخل)
import type { AppointmentRow } from './repository';
import type { CopyWeekInput, CopyWeekResult, UndoCopyWeekResult } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

interface WeekCopyCtx {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  actor: AuthContext;
}

export async function copyWeek(ctx: WeekCopyCtx & { input: CopyWeekInput }): Promise<CopyWeekResult> {
  const { db, audit, logger, actor, input } = ctx;

  /* ۱.۲۷.۴۸ — مرز هفته = شنبه (تقویم UI شنبه‌محور است؛ شرط قدیمی دوشنبه دکمهٔ کپی را همیشه می‌شکست) */
  for (const [label, ymd] of [['source_week_start', input.sourceWeekStart], ['target_week_start', input.targetWeekStart]] as const) {
    const day = new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
    if (day !== 6) {
      throw new ValidationError(`${label} باید شنبه باشد (${ymd})`);
    }
  }
  if (Date.parse(input.targetWeekStart) <= Date.parse(input.sourceWeekStart)) {
    throw new ValidationError('target_week_start باید بعد از source_week_start باشد');
  }

  if (actor.role === 'therapist' && input.staffId !== actor.staffId) {
    throw new ForbiddenError('کپی هفته فقط برای برنامهٔ خودِ شما مجاز است');
  }

  const sourceRange = tehranDayRange(input.sourceWeekStart);
  const sourceEnd = new Date(Date.parse(sourceRange.end) + 7 * DAY_MS).toISOString();
  const shiftMs = Date.parse(`${input.targetWeekStart}T00:00:00.000Z`) - Date.parse(`${input.sourceWeekStart}T00:00:00.000Z`);

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
  /* ۱.۲۵.۷۲ — تکه‌بندی ۹۰تایی: کپی هفتهٔ پر (≤ ۷روز × ظرفیت روزانه) از سقف ۱۰۰ بایند D1 می‌گذرد */
  const studentRows: { appointment_id: string; student_id: string; facet_id: string | null }[] = [];
  for (const chunk of inParamChunks(ids)) {
    studentRows.push(...await db.query<{ appointment_id: string; student_id: string; facet_id: string | null }>(
      `SELECT appointment_id, student_id, facet_id FROM appointment_students WHERE appointment_id IN (${inPlaceholders(chunk.length)})`,
      chunk
    ));
  }
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
    // ۱.۲۷.۱۵ — سد بلوک سنجش: نوبتِ درمانگرِ درگیر به درون بازهٔ رزرو کپی نمی‌شود؛
    // هم‌قرارداد سدِ تکی: بلوک با فهرست برای همهٔ نقش‌ها، بلوک بدون فهرست برای درمانگر/منشی
    const blockHit = await findAssessmentBlockConflict(db, { startAt: newStart, endAt: newEnd }, row.staff_id);
    if (blockHit && (blockHit.kind === 'involved' || (actor.role !== 'manager' && actor.role !== 'supervisor'))) {
      conflicts.push({
        type: 'assessment_block',
        staffId: row.staff_id,
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
        source_week_start: { from: null, to: input.sourceWeekStart },
        target_week_start: { from: null, to: input.targetWeekStart },
        copied: { from: null, to: toCopy.length },
        skipped_conflicts: { from: null, to: conflicts.length }
      }
    });
  });

  logger.child('copyWeek').info('appointment.copy_week.done', { copied: toCopy.length, conflicts: conflicts.length });

  return { batchId, copied: toCopy.length, conflicts, dryRun: false };
}

export async function undoCopyWeek(ctx: WeekCopyCtx & { batchId: string }): Promise<UndoCopyWeekResult> {
  const { db, audit, logger, actor, batchId } = ctx;

  /* ممیزی صفحهٔ تقویم (۱.۲۷.۸۸) — یک پرس‌وجو، همهٔ نگهبان‌ها. تا اینجا فقط «attendance != pending»
     سد می‌شد: یادداشت جلسه و نسخهٔ ویرایش‌شده بی‌صدا پاک می‌شدند، و ردیفِ دارای گزارش جلسه یا
     ارجاع لیست انتظار کل batch را با خطای FK (۵۰۰) می‌شکست. حالا هر نوبتِ دارای سابقه نگه داشته
     می‌شود و فقط بقیهٔ دسته حذف می‌شوند (هم‌نگهبان‌های remove تکی). */
  interface BatchRow {
    id: string;
    staff_id: string;
    status: string;
    version: number;
    history_cnt: number;
    has_case_event: number;
    has_waitlist: number;
  }
  const batchRows = await db.query<BatchRow>(
    `SELECT a.id, a.staff_id, a.status, a.version,
            (SELECT COUNT(*) FROM appointment_students asn
              WHERE asn.appointment_id = a.id
                AND (asn.attendance IN ('present', 'late', 'absent')
                     OR asn.session_note IS NOT NULL OR asn.next_action IS NOT NULL OR asn.note IS NOT NULL)) AS history_cnt,
            EXISTS (SELECT 1 FROM case_events ce WHERE ce.appointment_id = a.id AND ce.deleted_at IS NULL) AS has_case_event,
            EXISTS (SELECT 1 FROM waitlist w WHERE w.scheduled_appointment_id = a.id AND w.deleted_at IS NULL) AS has_waitlist
       FROM appointments a
      WHERE a.batch_id = ?`,
    [batchId]
  );
  if (batchRows.length === 0) {
    throw new NotFoundError('دسته کپی هفته');
  }

  if (actor.role === 'therapist') {
    if (batchRows.some((r) => r.staff_id !== actor.staffId)) {
      throw new ForbiddenError('برگردانی دستهٔ کپی فقط برای برنامهٔ خودِ شما مجاز است');
    }
  }

  const reasons = { case_event: 0, history: 0, edited: 0, waitlist: 0, status: 0 };
  const removable: string[] = [];
  for (const r of batchRows) {
    let blocked = false;
    if (r.has_case_event) { reasons.case_event += 1; blocked = true; }
    if (r.history_cnt > 0) { reasons.history += 1; blocked = true; }
    if (r.version > 1) { reasons.edited += 1; blocked = true; }
    if (r.has_waitlist) { reasons.waitlist += 1; blocked = true; }
    if (r.status !== 'scheduled') { reasons.status += 1; blocked = true; }
    if (!blocked) removable.push(r.id);
  }
  const blockedCount = batchRows.length - removable.length;
  if (removable.length === 0) {
    return { removed: 0, blocked: blockedCount };
  }

  await db.transaction(async (tx) => {
    for (const chunk of inParamChunks(removable)) {
      await tx.execute(`DELETE FROM appointment_students WHERE appointment_id IN (${inPlaceholders(chunk.length)})`, chunk);
      await tx.execute(`DELETE FROM appointments WHERE id IN (${inPlaceholders(chunk.length)})`, chunk);
    }
    await audit.logInTransaction(tx, {
      actorId: actor.staffId,
      action: 'appointment.copy_week.undo',
      resourceType: 'appointment_batch',
      resourceId: batchId,
      changes: {
        removed: { from: null, to: removable.length },
        blocked: { from: null, to: blockedCount },
        blocked_reasons: { from: null, to: reasons }
      }
    });
  });

  logger.child('copyWeek').info('appointment.copy_week.undo.done', { removed: removable.length, blocked: blockedCount });
  return { removed: removable.length, blocked: blockedCount };
}
