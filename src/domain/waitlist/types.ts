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

  /* ─── معرفی به مرکز (v1.27.33 — REFERRAL-DESIGN.md) ─── */
  submitReferral(input: PublicReferralSubmitInput, meta: ReferralMeta): Promise<WaitlistReferral[]>;
  listReferrals(filters: ReferralListFilters): Promise<WaitlistReferral[]>;
  acceptReferral(id: string, actor: AuthContext): Promise<WaitlistEntry>;
  rejectReferral(id: string, reason: string, actor: AuthContext): Promise<WaitlistReferral>;

  onAttendanceMarked(appointmentId: string, studentId: string, status: string): Promise<void>;
}

/* ─── معرفی به مرکز — مدل داده (v1.27.33) ─── */
export interface WaitlistReferral {
  id: string;
  refRole: 'family' | 'teacher';
  referrerName: string;
  referrerPhone: string;
  firstName: string;
  birthDate: string | null;
  guardianPhone: string | null;
  schoolText: string | null;
  gradeText: string | null;
  classText: string | null;
  concernCategory: string | null;
  concernTags: string[];
  concernText: string | null;
  priorEval: boolean | null;
  priorEvalNote: string | null;
  channel: string;
  chatId: string | null;
  submissionGroup: string | null;
  status: 'new' | 'accepted' | 'rejected';
  rejectReason: string | null;
  waitlistId: string | null;
  academicYear: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralChildInput {
  first_name: string;
  birth_date?: string | null;
  birth_date_text?: string | null;
  guardian_phone?: string | null;
  school_text?: string;
  grade_text?: string;
  class_text?: string;
  concern_category?: string | null;
  concern_tags?: string[];
  concern_text?: string;
  prior_eval?: boolean | null;
  prior_eval_note?: string;
}

export interface PublicReferralSubmitInput {
  role: 'family' | 'teacher';
  referrer_name: string;
  referrer_phone: string;
  school_text?: string;
  grade_text?: string;
  class_text?: string;
  token?: string;
  children: ReferralChildInput[];
}

export interface ReferralMeta {
  ip?: string;
  chatId?: string | null;
}

export interface ReferralListFilters {
  status?: string;
  year?: string;
}

/* برچسب دستهٔ دغدغه — هم برای service_type ردیف لیست انتظار هنگام پذیرش و هم برای badge اینباکس */
export const REFERRAL_CATEGORY_LABELS: Record<string, string> = {
  delayed: 'دیرآموز',
  learning_disorder: 'اختلال یادگیری',
  intellectual: 'مشکوک به کم‌توانی',
  autism: 'ارجاع اتیسم',
  speech: 'تأخیر گفتار و زبان',
  other: 'سایر'
};
