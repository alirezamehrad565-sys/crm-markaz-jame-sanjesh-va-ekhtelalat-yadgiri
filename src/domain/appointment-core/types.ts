import type { Appointment, AppointmentOpsStatus, AppointmentStudent, AuthContext, ConflictWarning, CopyWeekInput, CopyWeekResult, NewAppointmentInput } from '@core/shared';
import type { DbClient } from '@core/db';

export interface AppointmentUpdatePatch {
  note?: string | null;
}

export interface ListFilters {
  staffId?: string;
  from?: string;
  to?: string;
  studentId?: string;
}

export interface MyStudent {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  schoolId: string | null;
  schoolName: string | null;
  classId: string | null;
  className: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  waitStatus: 'waiting' | 'admitted' | null;
  waitSince: string | null;
}

export interface AppointmentDeps {
  db: DbClient;
  audit: import('@core/audit').AuditWriter;
  logger: import('@core/logger').Logger;
}

export interface AppointmentLifecycleObserver {
  onCreated(appointment: Appointment): Promise<void>;
  onMoved(appointment: Appointment, previous: { startAt: string; endAt: string }): Promise<void>;
  onCancelled(appointment: Appointment): Promise<void>;
}

export interface AppointmentOpsObserver {
  onOpsStatusChanged(
    appointment: Appointment,
    students: Array<{ studentId: string }>,
    from: AppointmentOpsStatus | null,
    to: AppointmentOpsStatus
  ): Promise<void>;
}

export interface AppointmentService {
  create(input: NewAppointmentInput, actor: AuthContext): Promise<{ appointment: Appointment; warnings: ConflictWarning[] }>;
  createWithinTx(tx: DbClient, input: NewAppointmentInput, actor: AuthContext): Promise<{ appointment: Appointment; warnings: ConflictWarning[] }>;
  notifyCreated(appointment: Appointment): Promise<void>;
  getById(id: string): Promise<Appointment | null>;
  list(filters: ListFilters): Promise<Appointment[]>;
  listMyStudents(actor: AuthContext): Promise<MyStudent[]>;
  update(id: string, patch: AppointmentUpdatePatch, version: number, actor: AuthContext): Promise<Appointment>;
  move(id: string, newStartAt: string, version: number, actor: AuthContext): Promise<{ appointment: Appointment; warnings: ConflictWarning[] }>;
  resize(id: string, newEndAt: string, version: number, actor: AuthContext): Promise<{ appointment: Appointment; warnings: ConflictWarning[] }>;
  cancel(id: string, version: number, actor: AuthContext): Promise<Appointment>;
  restore(id: string, version: number, actor: AuthContext): Promise<Appointment>;
  remove(id: string, actor: AuthContext): Promise<void>;
  setOpsStatus(id: string, opsStatus: AppointmentOpsStatus, actor: AuthContext): Promise<Appointment>;
  addStudent(appointmentId: string, studentId: string, facetId: string | undefined, actor: AuthContext): Promise<void>;
  removeStudent(appointmentId: string, studentId: string, actor: AuthContext): Promise<void>;
  copyWeek(input: CopyWeekInput, actor: AuthContext): Promise<CopyWeekResult>;
  undoCopyWeek(batchId: string, actor: AuthContext): Promise<{ removed: number }>;

  setConflictEngine(engine: {
    checkOverlap(proposed: {
      staffId: string;
      startAt: string;
      endAt: string;
      excludeId?: string;
    }): Promise<ConflictWarning[]>;
  }): void;

  setLifecycleObserver(observer: AppointmentLifecycleObserver): void;
  setOpsObserver(observer: AppointmentOpsObserver): void;
}

export type { Appointment, AppointmentOpsStatus, AppointmentStudent, ConflictWarning, CopyWeekInput, CopyWeekResult, NewAppointmentInput };
