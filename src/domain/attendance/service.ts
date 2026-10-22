import type { AuthContext, AttendanceStats, PendingAttendanceItem } from '@core/shared';
import { ForbiddenError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';

export interface AttendanceDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface AttendanceObserver {
  onMarked(appointmentId: string, studentId: string, status: string): Promise<void>;
}

export interface AttendanceService {
  mark(
    appointmentId: string,
    studentId: string,
    status: 'present' | 'late' | 'absent' | 'cancelled',
    note: string | undefined,
    actor: AuthContext
  ): Promise<{ appointmentId: string; studentId: string; status: string }>;
  listPending(staffId?: string): Promise<PendingAttendanceItem[]>;
  getStats(staffId: string, from: string, to: string): Promise<AttendanceStats>;
  setObserver(observer: AttendanceObserver): void;
}

export function createAttendanceService(deps: AttendanceDeps): AttendanceService {
  const { db, audit, logger } = deps;
  let observer: AttendanceObserver | null = null;

  return {
    setObserver(o) {
      observer = o;
    },
    async mark(appointmentId, studentId, status, note, actor) {
      const row = await db.queryOne<{ appt_status: string; attendance: string; staff_id: string }>(
        `SELECT a.status AS appt_status, s.attendance, a.staff_id
           FROM appointments a
           JOIN appointment_students s ON s.appointment_id = a.id
          WHERE a.id = ? AND s.student_id = ?`,
        [appointmentId, studentId]
      );

      if (!row) {
        throw new ValidationError('نوبت یا دانش‌آموز یافت نشد');
      }
      if (actor.role === 'therapist' && row.staff_id !== actor.staffId) {
        throw new ForbiddenError('ثبت حضور و غیاب فقط برای جلسات خودتان مجاز است');
      }
      if (row.appt_status === 'cancelled') {
        throw new ValidationError('ثبت حضور روی نوبت لغوشده مجاز نیست');
      }

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE appointment_students SET attendance = ?, note = COALESCE(?, note) WHERE appointment_id = ? AND student_id = ?`,
          [status, note ?? null, appointmentId, studentId]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'attendance.mark',
          resourceType: 'appointment_student',
          resourceId: `${appointmentId}/${studentId}`,
          changes: { attendance: { from: row.attendance, to: status } }
        });
      });

      logger.child('mark').info('attendance.marked', { status });
      if (observer) {
        try {
          await observer.onMarked(appointmentId, studentId, status);
        } catch (err) {
          logger.child('mark').error('attendance.observer.failed', { error: String(err) });
        }
      }
      return { appointmentId, studentId, status };
    },

    async listPending(staffId?: string): Promise<PendingAttendanceItem[]> {
      const nowIso = new Date().toISOString();
      const sql = `
        SELECT s.appointment_id, s.student_id, st.first_name || ' ' || st.last_name AS student_name,
               a.staff_id, a.start_at, a.end_at
          FROM appointment_students s
          JOIN appointments a ON a.id = s.appointment_id
          JOIN students st ON st.id = s.student_id
         WHERE s.attendance = 'pending'
           AND a.status = 'scheduled'
           AND a.end_at < ?
           ${staffId ? 'AND a.staff_id = ?' : ''}
         ORDER BY a.start_at DESC
         LIMIT 200`;
      const params: unknown[] = staffId ? [nowIso, staffId] : [nowIso];
      const rows = await db.query<{
        appointment_id: string;
        student_id: string;
        student_name: string;
        staff_id: string;
        start_at: string;
        end_at: string;
      }>(sql, params);
      return rows.map((r) => ({
        appointmentId: r.appointment_id,
        studentId: r.student_id,
        studentName: r.student_name,
        staffId: r.staff_id,
        startAt: r.start_at,
        endAt: r.end_at
      }));
    },

    async getStats(staffId: string, from: string, to: string): Promise<AttendanceStats> {
      const rows = await db.query<{ attendance: string; cnt: number }>(
        `SELECT s.attendance, COUNT(*) AS cnt
           FROM appointment_students s
           JOIN appointments a ON a.id = s.appointment_id
          WHERE a.staff_id = ? AND a.start_at >= ? AND a.start_at <= ?
          GROUP BY s.attendance`,
        [staffId, from, to]
      );

      let present = 0;
      let absent = 0;
      let late = 0;
      let pending = 0;
      let cancelled = 0;
      for (const r of rows) {
        switch (r.attendance) {
          case 'present': present = r.cnt; break;
          case 'late': late = r.cnt; break;
          case 'absent': absent = r.cnt; break;
          case 'pending': pending = r.cnt; break;
          case 'cancelled': cancelled = r.cnt; break;
        }
      }
      const denominator = present + late + absent;
      const absenceRate = denominator > 0 ? absent / denominator : 0;
      return { present, absent, late, pending, cancelled, absenceRate };
    }
  };
}
