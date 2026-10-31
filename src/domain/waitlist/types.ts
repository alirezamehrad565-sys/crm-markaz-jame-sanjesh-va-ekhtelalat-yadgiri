import type { AuthContext, ConflictWarning, Appointment, WaitlistBadge, WaitlistEntry, WaitlistPriority, WaitlistSource, WaitlistStatus } from '@core/shared';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { Student, StudentProfileService } from '../student-profile/types';
import type { AppointmentService } from '../appointment-core/types';
import type { FollowUpsService } from '../followups/types';

export interface NewWaitlistInput {
  firstName: string;
  lastName: string;
  phone: string;
  nationalId?: string;
  birthDate?: string;
  schoolId?: string;
  classId?: string;
  source: WaitlistSource;
  serviceType?: string;
  note?: string;
  priority: WaitlistPriority;
  studentId?: string;
}

export interface UpdateWaitlistInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  nationalId?: string | null;
  birthDate?: string | null;
  schoolId?: string | null;
  classId?: string | null;
  source?: WaitlistSource;
  serviceType?: string | null;
  note?: string | null;
  priority?: WaitlistPriority;
}

export interface WaitlistListFilters {
  status?: WaitlistStatus;
  priority?: WaitlistPriority;
  q?: string;
}

export interface StudentWaitStatusInput {
  awaiting: boolean;
  source: WaitlistSource;
  serviceType?: string;
  priority: WaitlistPriority;
}

export interface WaitlistScheduleInput {
  staffId: string;
  startAt: string;
  endAt: string;
  studentId?: string;
  nationalId?: string;
  note?: string;
}

export interface WaitlistScheduleResult {
  entry: WaitlistEntry;
  appointment: Appointment;
  student: Student;
  warnings: ConflictWarning[];
}

export interface WaitlistDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  appointments: Pick<AppointmentService, 'createWithinTx' | 'getById' | 'notifyCreated'>;
  students: Pick<StudentProfileService, 'createStudentWithin' | 'getStudentById'>;
  followups: Pick<FollowUpsService, 'createWithinTx'>;
}

export interface WaitlistService {
  list(filters: WaitlistListFilters): Promise<WaitlistEntry[]>;
  getById(id: string): Promise<WaitlistEntry | null>;
  create(input: NewWaitlistInput, actor: AuthContext): Promise<WaitlistEntry>;
  update(id: string, patch: UpdateWaitlistInput, actor: AuthContext): Promise<WaitlistEntry>;
  call(id: string, note: string | undefined, actor: AuthContext): Promise<WaitlistEntry>;
  schedule(id: string, input: WaitlistScheduleInput, actor: AuthContext): Promise<WaitlistScheduleResult>;
  setStudentWaiting(studentId: string, input: StudentWaitStatusInput, actor: AuthContext): Promise<WaitlistEntry | null>;
  reject(id: string, reason: string | undefined, actor: AuthContext): Promise<WaitlistEntry>;
  noShow(id: string, actor: AuthContext): Promise<WaitlistEntry>;
  cancel(id: string, actor: AuthContext): Promise<WaitlistEntry>;
  reopen(id: string, note: string | undefined, actor: AuthContext): Promise<WaitlistEntry>;
  reorder(ids: string[], actor: AuthContext): Promise<WaitlistEntry[]>;
  autoOrder(actor: AuthContext): Promise<WaitlistEntry[]>;
  badge(): Promise<WaitlistBadge>;
  softDelete(id: string, actor: AuthContext): Promise<void>;

  onAttendanceMarked(appointmentId: string, studentId: string, status: string): Promise<void>;
}
