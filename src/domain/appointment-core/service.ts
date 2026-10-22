import type { AppointmentStudent, AuthContext, ConflictWarning } from '@core/shared';
import { addMinutes, isOnGrid, SLOT_MINUTES } from '@core/shared';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import { rowToAppointment, rowToStudent, selectAppointmentById, selectAppointments, selectStudentsOfAppointments } from './repository';
import type { AppointmentRow, AppointmentStudentRow } from './repository';
import type { Appointment, AppointmentDeps, AppointmentLifecycleObserver, AppointmentOpsObserver, AppointmentOpsStatus, AppointmentService, AppointmentUpdatePatch, CopyWeekInput, CopyWeekResult, ListFilters, MyStudent, NewAppointmentInput } from './types';
import { canTransitionOps, opsFromDb, opsTransitionMessage } from './pure';
import { copyWeek as copyWeekImpl, undoCopyWeek as undoCopyWeekImpl } from './week-copy';

interface ConflictChecker {
  checkOverlap(proposed: { staffId: string; startAt: string; endAt: string; excludeId?: string }): Promise<ConflictWarning[]>;
}

interface MyStudentRow {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  school_id: string | null;
  school_name: string | null;
  class_id: string | null;
  class_name: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  wait_status: string | null;
  wait_since: string | null;
}

const MY_STUDENT_WAIT_PROJECTION = `,
       CASE WHEN EXISTS (SELECT 1 FROM waitlist wq WHERE wq.student_id = s.id AND wq.deleted_at IS NULL AND wq.status IN ('waiting','called','scheduled')) THEN 'waiting'
            WHEN EXISTS (SELECT 1 FROM waitlist wa WHERE wa.student_id = s.id AND wa.deleted_at IS NULL AND wa.status = 'admitted') THEN 'admitted'
            ELSE NULL END AS wait_status,
       (SELECT wq2.created_at FROM waitlist wq2 WHERE wq2.student_id = s.id AND wq2.deleted_at IS NULL AND wq2.status IN ('waiting','called','scheduled') ORDER BY wq2.created_at LIMIT 1) AS wait_since`;

function assertAppointmentScope(actor: AuthContext, targetStaffId: string): void {
  if (actor.role === 'manager' || actor.role === 'secretary') return;
  if (actor.role === 'therapist' && actor.staffId === targetStaffId) return;
  throw new ForbiddenError('شما فقط به نوبت‌های خودتان دسترسی دارید');
}

async function assertStudentsInScope(
  reader: { query<T>(sql: string, params?: unknown[]): Promise<T[]> },
  actor: AuthContext,
  studentIds: string[]
): Promise<void> {
  if (actor.role !== 'therapist' || studentIds.length === 0) return;
  const placeholders = studentIds.map(() => '?').join(', ');
  const outside = await reader.query<{ id: string }>(
    `SELECT s.id FROM students s
      WHERE s.id IN (${placeholders})
        AND NOT EXISTS (
          SELECT 1 FROM appointments a
            JOIN appointment_students asn ON asn.appointment_id = a.id
           WHERE a.staff_id = ? AND asn.student_id = s.id
        )`,
    [...studentIds, actor.staffId]
  );
  if (outside.length > 0) {
    throw new ForbiddenError('نوبت‌دهی درمانگر فقط برای دانش‌آموزانِ خودِ او مجاز است');
  }
}

async function loadStudents(tx: { queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>; query<T>(sql: string, params?: unknown[]): Promise<T[]> }, appointmentId: string): Promise<AppointmentStudentRow[]> {
  return tx.query<AppointmentStudentRow>(
    `SELECT appointment_id, student_id, facet_id, attendance, note, session_note, next_action
       FROM appointment_students
      WHERE appointment_id = ?
      ORDER BY student_id`,
    [appointmentId]
  );
}

export function createAppointmentService(deps: AppointmentDeps): AppointmentService {
  const { db, audit, logger } = deps;
  let conflictEngine: ConflictChecker | null = null;
  let lifecycleObserver: AppointmentLifecycleObserver | null = null;
  let opsObserver: AppointmentOpsObserver | null = null;

  const logNotify = logger.child('appointment.notify');

  async function fireLifecycle(
    event: 'created' | 'moved' | 'cancelled',
    appointment: Appointment,
    previous?: { startAt: string; endAt: string }
  ): Promise<void> {
    if (!lifecycleObserver) return;
    try {
      if (event === 'created') await lifecycleObserver.onCreated(appointment);
      else if (event === 'moved') await lifecycleObserver.onMoved(appointment, previous ?? { startAt: appointment.startAt, endAt: appointment.endAt });
      else await lifecycleObserver.onCancelled(appointment);
    } catch (err) {
      logNotify.warn(`lifecycle.${event}.failed`, {
        appointmentId: appointment.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const service: AppointmentService = {
    setConflictEngine(engine: ConflictChecker): void {
      conflictEngine = engine;
    },

    setLifecycleObserver(observer: AppointmentLifecycleObserver): void {
      lifecycleObserver = observer;
    },

    setOpsObserver(observer: AppointmentOpsObserver): void {
      opsObserver = observer;
    },

    async getById(id: string): Promise<Appointment | null> {
      const q = selectAppointmentById(id);
      const row = await db.queryOne<AppointmentRow>(q.sql, q.params);
      if (!row) return null;
      const students = await loadStudents(db, id);
      return rowToAppointment(row, students.map(rowToStudent));
    },

    async list(filters: ListFilters): Promise<Appointment[]> {
      const { sql, params } = selectAppointments({
        staffId: filters.staffId,
        studentId: filters.studentId,
        from: filters.from,
        to: filters.to
      });
      const rows = await db.query<AppointmentRow>(sql, params);
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const { sql: ssql, params: sparams } = selectStudentsOfAppointments(ids);
      const studentRows = await db.query<AppointmentStudentRow>(ssql, sparams);
      const byAppointment = new Map<string, AppointmentStudentRow[]>();
      for (const s of studentRows) {
        const list = byAppointment.get(s.appointment_id) ?? [];
        list.push(s);
        byAppointment.set(s.appointment_id, list);
      }
      return rows.map((r) => rowToAppointment(r, (byAppointment.get(r.id) ?? []).map(rowToStudent)));
    },

    async listMyStudents(actor: AuthContext): Promise<MyStudent[]> {
      const rows = await db.query<MyStudentRow>(
        `SELECT s.id, s.first_name, s.last_name, s.grade, s.school_id,
                sc.name AS school_name, s.class_id, c.name AS class_name,
                s.guardian_name, s.guardian_phone
                ${MY_STUDENT_WAIT_PROJECTION}
           FROM students s
           LEFT JOIN classes c ON c.id = s.class_id
           LEFT JOIN schools sc ON sc.id = s.school_id
          WHERE s.active = 1
            AND (
              EXISTS (
                SELECT 1 FROM appointments a
                  JOIN appointment_students asn ON asn.appointment_id = a.id
                 WHERE a.staff_id = ? AND asn.student_id = s.id
              )
              OR s.owner_staff_id = ?
            )
          ORDER BY CASE WHEN EXISTS (
                   SELECT 1 FROM waitlist wq
                    WHERE wq.student_id = s.id AND wq.deleted_at IS NULL AND wq.status = 'admitted'
                 ) THEN 0 ELSE 1 END,
                  s.last_name, s.first_name`,
        [actor.staffId, actor.staffId]
      );
      return rows.map((r) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        grade: r.grade ?? null,
        schoolId: r.school_id ?? null,
        schoolName: r.school_name ?? null,
        classId: r.class_id ?? null,
        className: r.class_name ?? null,
        guardianName: r.guardian_name ?? null,
        guardianPhone: r.guardian_phone ?? null,
        waitStatus: (r.wait_status as 'waiting' | 'admitted' | null) ?? null,
        waitSince: r.wait_since ?? null
      }));
    },

    async create(input: NewAppointmentInput, actor: AuthContext): Promise<{ appointment: Appointment; warnings: ConflictWarning[] }> {
      logger.child('create').debug('appointment.create.requested', {
        durationMin: (Date.parse(input.endAt) - Date.parse(input.startAt)) / 60000
      });

      const { appointment, warnings } = await db.transaction((tx) => service.createWithinTx(tx, input, actor));

      await fireLifecycle('created', appointment);

      return { appointment, warnings };
    },

    async createWithinTx(tx, input, actor): Promise<{ appointment: Appointment; warnings: ConflictWarning[] }> {
      if (!isOnGrid(input.startAt, SLOT_MINUTES) || !isOnGrid(input.endAt, SLOT_MINUTES)) {
        throw new ValidationError('زمان نوبت باید روی شبکه ۱۵ دقیقه‌ای باشد');
      }
      if (input.students.length === 0) {
        throw new ValidationError('حداقل یک دانش‌آموز لازم است');
      }

      assertAppointmentScope(actor, input.staffId);
      await assertStudentsInScope(tx, actor, input.students.map((s) => s.studentId));

      const id = crypto.randomUUID();
      await tx.execute(
        `INSERT INTO appointments (id, staff_id, start_at, end_at, status, session_type, note, version, created_by)
         VALUES (?, ?, ?, ?, 'scheduled', ?, ?, 1, ?)`,
        [id, input.staffId, input.startAt, input.endAt, input.sessionType ?? null, input.note ?? null, actor.staffId]
      );
      for (const s of input.students) {
        await tx.execute(`INSERT INTO appointment_students (appointment_id, student_id, facet_id) VALUES (?, ?, ?)`, [
          id,
          s.studentId,
          s.facetId ?? null
        ]);
      }
      await audit.logInTransaction(tx, {
        actorId: actor.staffId,
        action: 'appointment.create',
        resourceType: 'appointment',
        resourceId: id,
        changes: {
          start_at: { from: null, to: input.startAt },
          end_at: { from: null, to: input.endAt },
          students: { from: null, to: input.students.map((s) => s.studentId) }
        }
      });

      const appointment: Appointment = {
        id,
        staffId: input.staffId,
        startAt: input.startAt,
        endAt: input.endAt,
        status: 'scheduled',
        opsStatus: null,
        sessionType: input.sessionType ?? null,
        note: input.note ?? null,
        version: 1,
        batchId: null,
        createdBy: actor.staffId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        students: input.students.map(
          (s): AppointmentStudent => ({
            studentId: s.studentId,
            facetId: s.facetId ?? null,
            attendance: 'pending',
            note: null
          })
        )
      };

      let warnings: ConflictWarning[] = [];
      if (conflictEngine) {
        warnings = await conflictEngine.checkOverlap({
          staffId: input.staffId,
          startAt: input.startAt,
          endAt: input.endAt,
          excludeId: id
        });
      }

      return { appointment, warnings };
    },

    async notifyCreated(appointment: Appointment): Promise<void> {
      await fireLifecycle('created', appointment);
    },

    async update(id: string, patch: AppointmentUpdatePatch, version: number, actor: AuthContext): Promise<Appointment> {
      return db.transaction(async (tx) => {
        const q = selectAppointmentById(id);
        const row = await tx.queryOne<AppointmentRow>(q.sql, q.params);
        if (!row) throw new NotFoundError('نوبت');
        assertAppointmentScope(actor, row.staff_id); // فاز ۵ — قبل از بررسی وضعیت
        if (row.status === 'cancelled') throw new ConflictError('نوبت لغوشده قابل ویرایش نیست', row.version);
        if (row.version !== version) throw new ConflictError('این نوبت همین الان توسط کاربر دیگری تغییر کرد.', row.version);

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        let noteChanged = false;
        if (patch.note !== undefined && patch.note !== row.note) {
          await tx.execute(`UPDATE appointments SET note = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?`, [
            patch.note,
            id
          ]);
          changes.note = { from: row.note, to: patch.note };
          noteChanged = true;
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'appointment.update',
            resourceType: 'appointment',
            resourceId: id,
            changes
          });
        }

        const students = await loadStudents(tx, id);
        const merged = noteChanged ? { ...row, note: patch.note, version: row.version + 1 } : row;
        return rowToAppointment(merged as AppointmentRow, students.map(rowToStudent));
      });
    },

    async move(id: string, newStartAt: string, version: number, actor: AuthContext): Promise<{ appointment: Appointment; warnings: ConflictWarning[] }> {
      if (!isOnGrid(newStartAt, SLOT_MINUTES)) {
        throw new ValidationError('زمان نوبت باید روی شبکه ۱۵ دقیقه‌ای باشد');
      }

      const current = await service.getById(id);
      if (!current) throw new NotFoundError('نوبت');
      assertAppointmentScope(actor, current.staffId); // فاز ۵ — قبل از بررسی وضعیت
      if (current.status === 'cancelled') throw new ConflictError('نوبت لغوشده قابل جابه‌جایی نیست', current.version);
      if (current.version !== version) throw new ConflictError('این نوبت همین الان توسط کاربر دیگری تغییر کرد.', current.version);

      const durationMin = (Date.parse(current.endAt) - Date.parse(current.startAt)) / 60000;
      const newEndAt = addMinutes(newStartAt, durationMin);

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE appointments SET start_at = ?, end_at = ?, version = version + 1, updated_at = datetime('now') WHERE id = ? AND version = ?`,
          [newStartAt, newEndAt, id, version]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'appointment.move',
          resourceType: 'appointment',
          resourceId: id,
          changes: {
            start_at: { from: current.startAt, to: newStartAt },
            end_at: { from: current.endAt, to: newEndAt }
          }
        });
      });

      const appointment = (await service.getById(id)) as Appointment;
      let warnings: ConflictWarning[] = [];
      if (conflictEngine) {
        warnings = await conflictEngine.checkOverlap({
          staffId: current.staffId,
          startAt: newStartAt,
          endAt: newEndAt,
          excludeId: id
        });
      }

      await fireLifecycle('moved', appointment, { startAt: current.startAt, endAt: current.endAt });

      return { appointment, warnings };
    },

    async resize(id: string, newEndAt: string, version: number, actor: AuthContext): Promise<{ appointment: Appointment; warnings: ConflictWarning[] }> {
      const current = await service.getById(id);
      if (!current) throw new NotFoundError('نوبت');
      assertAppointmentScope(actor, current.staffId); // فاز ۵ — قبل از بررسی وضعیت
      if (current.status === 'cancelled') throw new ConflictError('نوبت لغوشده قابل تغییر مدت نیست', current.version);
      if (current.version !== version) throw new ConflictError('این نوبت همین الان توسط کاربر دیگری تغییر کرد.', current.version);

      const minutes = (Date.parse(newEndAt) - Date.parse(current.startAt)) / 60000;
      if (minutes < 15 || minutes > 240) {
        throw new ValidationError('مدت نوبت باید بین ۱۵ تا ۲۴۰ دقیقه باشد');
      }
      if (!isOnGrid(newEndAt, SLOT_MINUTES)) {
        throw new ValidationError('زمان پایان باید روی شبکه ۱۵ دقیقه‌ای باشد');
      }

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE appointments SET end_at = ?, version = version + 1, updated_at = datetime('now') WHERE id = ? AND version = ?`,
          [newEndAt, id, version]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'appointment.resize',
          resourceType: 'appointment',
          resourceId: id,
          changes: { end_at: { from: current.endAt, to: newEndAt } }
        });
      });

      const appointment = (await service.getById(id)) as Appointment;
      let warnings: ConflictWarning[] = [];
      if (conflictEngine) {
        warnings = await conflictEngine.checkOverlap({
          staffId: current.staffId,
          startAt: current.startAt,
          endAt: newEndAt,
          excludeId: id
        });
      }
      return { appointment, warnings };
    },

    async cancel(id: string, version: number, actor: AuthContext): Promise<Appointment> {
      const current = await service.getById(id);
      if (!current) throw new NotFoundError('نوبت');
      assertAppointmentScope(actor, current.staffId); // فاز ۵ — قبل از بررسی وضعیت
      if (current.status === 'cancelled') {
        throw new ConflictError('نوبت قبلاً لغو شده است', current.version);
      }
      if (current.version !== version) throw new ConflictError('این نوبت همین الان توسط کاربر دیگری تغییر کرد.', current.version);

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE appointments SET status = 'cancelled', version = version + 1, updated_at = datetime('now') WHERE id = ? AND version = ?`,
          [id, version]
        );
        await tx.execute(`UPDATE appointment_students SET attendance = 'cancelled' WHERE appointment_id = ? AND attendance != 'cancelled'`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'appointment.cancel',
          resourceType: 'appointment',
          resourceId: id,
          changes: { status: { from: 'scheduled', to: 'cancelled' } }
        });
      });

      const cancelled = (await service.getById(id)) as Appointment;

      await fireLifecycle('cancelled', cancelled);

      return cancelled;
    },

    async remove(id: string, actor: AuthContext): Promise<void> {
      const current = await service.getById(id);
      if (!current) throw new NotFoundError('نوبت');
      assertAppointmentScope(actor, current.staffId);

      await db.transaction(async (tx) => {
        const events = await tx.queryOne<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM case_events WHERE appointment_id = ?`,
          [id]
        );
        if ((events?.cnt ?? 0) > 0) {
          throw new ConflictError('برای این نوبت گزارش جلسه در تایم‌لاین ثبت شده — حذف مجاز نیست');
        }

        const finished = current.endAt <= new Date().toISOString();
        if (finished) {
          const history = await tx.queryOne<{ cnt: number }>(
            `SELECT COUNT(*) AS cnt FROM appointment_students
              WHERE appointment_id = ?
                AND (attendance IN ('present', 'late', 'absent') OR session_note IS NOT NULL)`,
            [id]
          );
          if ((history?.cnt ?? 0) > 0) {
            throw new ConflictError('این نوبت سابقهٔ جلسه (حضور/یادداشت) دارد و حذف نمی‌شود — از «لغو نوبت» استفاده کنید');
          }
        }

        const linked = await tx.query<{ id: string; status: string }>(
          `SELECT id, status FROM waitlist
            WHERE scheduled_appointment_id = ? AND deleted_at IS NULL`,
          [id]
        );
        const stillScheduled = linked.filter((w) => w.status === 'scheduled');
        const staleRefs = linked.filter((w) => w.status !== 'scheduled');
        if (stillScheduled.length > 0) {
          await tx.execute(
            `UPDATE waitlist
                SET status = 'waiting', scheduled_appointment_id = NULL, updated_at = datetime('now')
              WHERE scheduled_appointment_id = ? AND status = 'scheduled' AND deleted_at IS NULL`,
            [id]
          );
          for (const w of stillScheduled) {
            await audit.logInTransaction(tx, {
              actorId: actor.staffId,
              action: 'waitlist.auto_reopened',
              resourceType: 'waitlist',
              resourceId: w.id,
              changes: { status: { from: 'scheduled', to: 'waiting' }, reason: { from: null, to: 'appointment.deleted' } }
            });
          }
        }
        if (staleRefs.length > 0) {
          await tx.execute(
            `UPDATE waitlist SET scheduled_appointment_id = NULL, updated_at = datetime('now')
              WHERE scheduled_appointment_id = ? AND status != 'scheduled' AND deleted_at IS NULL`,
            [id]
          );
          for (const w of staleRefs) {
            await audit.logInTransaction(tx, {
              actorId: actor.staffId,
              action: 'waitlist.stale_ref_cleared',
              resourceType: 'waitlist',
              resourceId: w.id,
              changes: { scheduled_appointment_id: { from: id, to: null }, reason: { from: null, to: 'appointment.deleted' } }
            });
          }
        }

        await tx.execute(`DELETE FROM appointment_students WHERE appointment_id = ?`, [id]);
        await tx.execute(`DELETE FROM appointments WHERE id = ?`, [id]);

        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'appointment.delete',
          resourceType: 'appointment',
          resourceId: id,
          changes: {
            start_at: { from: current.startAt, to: null },
            staff_id: { from: current.staffId, to: null },
            students_count: { from: current.students.length, to: 0 }
          }
        });
      });

      logger.child('appointment.delete').info('appointment.deleted', { id });
    },

    async setOpsStatus(id: string, opsStatus: AppointmentOpsStatus, actor: AuthContext): Promise<Appointment> {
      const { result, changed, studentIds, from } = await db.transaction(async (tx) => {
        const q = selectAppointmentById(id);
        const row = await tx.queryOne<AppointmentRow>(q.sql, q.params);
        if (!row) throw new NotFoundError('نوبت');
        assertAppointmentScope(actor, row.staff_id); // — درمانگر فقط نوبت‌های خودش؛ دفتر آزاد
        if (row.status === 'cancelled') {
          throw new ConflictError('نوبت لغوشده وضعیت عملیاتی نمی‌گیرد');
        }

        const from = opsFromDb(row.ops_status);
        if (from !== opsStatus && !canTransitionOps(from, opsStatus)) {
          throw new ConflictError(opsTransitionMessage(from, opsStatus));
        }

        if (from !== opsStatus) {
          await tx.execute(
            `UPDATE appointments SET ops_status = ?, updated_at = datetime('now') WHERE id = ?`,
            [opsStatus, id]
          );
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'appointment.ops_status.changed',
            resourceType: 'appointment',
            resourceId: id,
            changes: { ops_status: { from: row.ops_status, to: opsStatus } }
          });
        }

        const students = await loadStudents(tx, id);
        const merged = from !== opsStatus ? { ...row, ops_status: opsStatus } : row;
        return {
          result: rowToAppointment(merged as AppointmentRow, students.map(rowToStudent)),
          changed: from !== opsStatus,
          studentIds: students.map((s) => s.student_id),
          from
        };
      });

      if (opsObserver && changed) {
        try {
          await opsObserver.onOpsStatusChanged(
            result,
            studentIds.map((studentId) => ({ studentId })),
            from === 'none' ? null : from,
            opsStatus
          );
        } catch (err) {
          logger.child('appointment.ops').warn('ops.observer.failed', {
            appointmentId: id,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }

      return result;
    },

    async restore(id: string, version: number, actor: AuthContext): Promise<Appointment> {
      const current = await service.getById(id);
      if (!current) throw new NotFoundError('نوبت');
      assertAppointmentScope(actor, current.staffId); // فاز ۵ — قبل از بررسی وضعیت
      if (current.status !== 'cancelled') {
        throw new ConflictError('فقط نوبت لغوشده قابل برگرداندن است', current.version);
      }
      if (current.version !== version) throw new ConflictError('این نوبت همین الان توسط کاربر دیگری تغییر کرد.', current.version);

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE appointments SET status = 'scheduled', version = version + 1, updated_at = datetime('now') WHERE id = ? AND version = ?`,
          [id, version]
        );
        await tx.execute(`UPDATE appointment_students SET attendance = 'pending' WHERE appointment_id = ? AND attendance = 'cancelled'`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'appointment.restore',
          resourceType: 'appointment',
          resourceId: id,
          changes: { status: { from: 'cancelled', to: 'scheduled' } }
        });
      });

      const restored = (await service.getById(id)) as Appointment;

      await fireLifecycle('created', restored);

      return restored;
    },

    async addStudent(appointmentId: string, studentId: string, facetId: string | undefined, actor: AuthContext): Promise<void> {
      await db.transaction(async (tx) => {
        const q = selectAppointmentById(appointmentId);
        const row = await tx.queryOne<AppointmentRow>(q.sql, q.params);
        if (!row) throw new NotFoundError('نوبت');
        assertAppointmentScope(actor, row.staff_id); // فاز ۵ — قبل از بررسی وضعیت
        if (row.status === 'cancelled') throw new ConflictError('به نوبت لغوشده نمی‌توان دانش‌آموز افزود', row.version);
        await assertStudentsInScope(tx, actor, [studentId]); // فاز ۵

        const exists = await tx.queryOne<{ student_id: string }>(
          `SELECT student_id FROM appointment_students WHERE appointment_id = ? AND student_id = ?`,
          [appointmentId, studentId]
        );
        if (exists) throw new ConflictError('این دانش‌آموز قبلاً به نوبت اضافه شده است', row.version);

        await tx.execute(`INSERT INTO appointment_students (appointment_id, student_id, facet_id) VALUES (?, ?, ?)`, [
          appointmentId,
          studentId,
          facetId ?? null
        ]);
        await tx.execute(`UPDATE appointments SET version = version + 1, updated_at = datetime('now') WHERE id = ?`, [appointmentId]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'appointment.add_student',
          resourceType: 'appointment',
          resourceId: appointmentId,
          changes: { students: { from: null, to: studentId } }
        });
      });
    },

    async removeStudent(appointmentId: string, studentId: string, actor: AuthContext): Promise<void> {
      await db.transaction(async (tx) => {
        const q = selectAppointmentById(appointmentId);
        const row = await tx.queryOne<AppointmentRow>(q.sql, q.params);
        if (!row) throw new NotFoundError('نوبت');
        assertAppointmentScope(actor, row.staff_id); // فاز ۵ — قبل از بررسی وضعیت

        const existing = await tx.queryOne<{ student_id: string }>(
          `SELECT student_id FROM appointment_students WHERE appointment_id = ? AND student_id = ?`,
          [appointmentId, studentId]
        );
        if (!existing) {
          throw new NotFoundError('دانش‌آموز در این نوبت');
        }
        await tx.execute(`DELETE FROM appointment_students WHERE appointment_id = ? AND student_id = ?`, [
          appointmentId,
          studentId
        ]);
        await tx.execute(`UPDATE appointments SET version = version + 1, updated_at = datetime('now') WHERE id = ?`, [appointmentId]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'appointment.remove_student',
          resourceType: 'appointment',
          resourceId: appointmentId,
          changes: { students: { from: studentId, to: null } }
        });
      });
    },

    async copyWeek(input: CopyWeekInput, actor: AuthContext): Promise<CopyWeekResult> {
      return copyWeekImpl({ db, audit, logger, actor, input });
    },

    async undoCopyWeek(batchId: string, actor: AuthContext): Promise<{ removed: number }> {
      return undoCopyWeekImpl({ db, audit, logger, actor, batchId });
    }
  };

  return service;
}
