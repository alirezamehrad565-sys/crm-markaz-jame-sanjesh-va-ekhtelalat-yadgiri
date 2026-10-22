import type { AppointmentOpsStatus, AppointmentStatus, AppointmentStudent, NextAction } from '@core/shared';

export interface AppointmentRow {
  id: string;
  staff_id: string;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  ops_status: AppointmentOpsStatus | null;
  session_type: string | null;
  note: string | null;
  version: number;
  batch_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AppointmentStudentRow {
  appointment_id: string;
  student_id: string;
  facet_id: string | null;
  attendance: string;
  note: string | null;
  session_note: string | null;
  next_action: string | null;
}

export function rowToAppointment(row: AppointmentRow, students: AppointmentStudent[]): import('@core/shared').Appointment {
  return {
    id: row.id,
    staffId: row.staff_id,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    opsStatus: row.ops_status ?? null,
    sessionType: (row.session_type ?? null) as import('@core/shared').Appointment['sessionType'],
    note: row.note,
    version: row.version,
    batchId: row.batch_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    students
  };
}

export function rowToStudent(row: AppointmentStudentRow): AppointmentStudent {
  return {
    studentId: row.student_id,
    facetId: row.facet_id,
    attendance: row.attendance as AppointmentStudent['attendance'],
    note: row.note,
    sessionNote: row.session_note ?? null,
    nextAction: (row.next_action ?? null) as NextAction | null
  };
}

const APPOINTMENT_COLS = 'id, staff_id, start_at, end_at, status, ops_status, session_type, note, version, batch_id, created_by, created_at, updated_at';

export function selectAppointmentById(id: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT ${APPOINTMENT_COLS} FROM appointments WHERE id = ?`,
    params: [id]
  };
}

export function selectAppointments(filters: { staffId?: string; studentId?: string; from?: string; to?: string }): {
  sql: string;
  params: unknown[];
} {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.staffId) {
    conditions.push('staff_id = ?');
    params.push(filters.staffId);
  }
  if (filters.studentId) {
    conditions.push(`EXISTS (SELECT 1 FROM appointment_students a_s
                              WHERE a_s.appointment_id = appointments.id AND a_s.student_id = ?)`);
    params.push(filters.studentId);
  }
  if (filters.from) {
    conditions.push('start_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push('start_at <= ?');
    params.push(filters.to);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return {
    sql: `SELECT ${APPOINTMENT_COLS} FROM appointments ${where} ORDER BY start_at`,
    params
  };
}

export function selectStudentsOfAppointments(ids: string[]): { sql: string; params: unknown[] } {
  const placeholders = ids.map(() => '?').join(',');
  return {
    sql: `SELECT appointment_id, student_id, facet_id, attendance, note, session_note, next_action
            FROM appointment_students
           WHERE appointment_id IN (${placeholders})
           ORDER BY student_id`,
    params: ids
  };
}
