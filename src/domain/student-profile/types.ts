import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext, SchoolKind, SpecialNeedSeverity, SpecialNeedType, StaffRole, StudentCaseStatus, StudentPathway, TagRef } from '@core/shared';

export interface School {
  id: string;
  name: string;
  kind: SchoolKind;
  genderType: string | null;
  phone: string | null;
  address: string | null;
  principalName: string | null;
  principalPhone: string | null;
  code: string | null;
  notes: string | null;
  active: boolean;
}

export interface SchoolClass {
  id: string;
  schoolId: string;
  schoolName?: string;
  name: string;
  teacherName: string | null;
  teacherPhone: string | null;
  active: boolean;
  studentCount?: number;
}

export interface Student {
  id: string;
  nationalId: string | null;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  gender: 'male' | 'female' | null;
  grade: string | null;
  schoolId: string | null;
  classId: string | null;
  className: string | null;
  teacherName: string | null;
  teacherPhone: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  guardianPhone: string | null;
  active: boolean;
  createdAt: string;
  tags?: TagRef[];
  waitStatus?: 'waiting' | 'admitted' | null;
  waitSince?: string | null;
  caseStatus?: StudentCaseStatus | null;
  pathway?: StudentPathway | null;
  ownerStaffId?: string | null;
  ownerName?: string | null;
  specialNeedType?: SpecialNeedType | null;
  specialNeedSeverity?: SpecialNeedSeverity | null;
  identifiedAt?: string | null;
  assessmentCount?: number;
}

export interface NewSchoolInput {
  name: string;
  kind: SchoolKind;
  genderType?: string;
  phone?: string;
  address?: string;
  principalName?: string;
  principalPhone?: string;
  code?: string;
  notes?: string;
}

export interface UpdateSchoolInput {
  name?: string;
  kind?: SchoolKind;
  genderType?: string;
  phone?: string;
  address?: string;
  principalName?: string;
  principalPhone?: string;
  code?: string;
  notes?: string;
}

export interface NewClassInput {
  schoolId: string;
  name: string;
  teacherName?: string;
  teacherPhone?: string;
}

export interface UpdateClassInput {
  name?: string;
  teacherName?: string | null;
  teacherPhone?: string | null;
}

export interface NewStudentInput {
  nationalId?: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  gender?: 'male' | 'female';
  grade?: string;
  schoolId?: string;
  classId?: string;
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
  ownerStaffId?: string;
  archived?: boolean;
  pathway?: StudentPathway;
}

export interface UpdateStudentInput {
  firstName?: string;
  lastName?: string;
  nationalId?: string;
  birthDate?: string;
  gender?: 'male' | 'female';
  grade?: string;
  schoolId?: string | null;
  classId?: string | null;
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
}

export interface StudentSearchFilters {
  query?: string;
  schoolId?: string;
  grade?: string;
  tagId?: string;
  active?: boolean;
  ownerId?: string;
  staffScope?: string;
  page: number;
  pageSize: number;
}

export interface StudentDirectoryStats {
  totalStudents: number;
  totalSchools: number;
  activeSchools: number;
}

export interface EducationHistoryEntry {
  id: string;
  studentId: string;
  studyYear: string;
  schoolName: string | null;
  level: string | null;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface NewEducationHistoryInput {
  studyYear: string;
  schoolName?: string;
  level?: string;
  notes?: string;
}

export interface StudentAppointment {
  appointmentId: string;
  staffId: string;
  staffName: string | null;
  startAt: string;
  endAt: string;
  status: string;
  myAttendance: string;
  note: string | null;
}

export interface StudentTeacher {
  id: string;
  studentId: string;
  name: string;
  classLabel: string | null;
  contact: string | null;
  createdAt: string;
}

export interface NewStudentTeacherInput {
  name: string;
  classLabel?: string;
  contact?: string;
}

export interface StudentProfileDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface StudentProfileService {
  createSchool(input: NewSchoolInput, actor: AuthContext): Promise<School>;
  listSchools(filters: { kind?: SchoolKind; active?: boolean }): Promise<School[]>;
  getSchoolById(id: string): Promise<School | null>;
  updateSchool(id: string, patch: UpdateSchoolInput, actor: AuthContext): Promise<School>;
  deactivateSchool(id: string, actor: AuthContext): Promise<School>;
  deleteSchool(id: string, actor: AuthContext): Promise<void>;

  createClass(input: NewClassInput, actor: AuthContext): Promise<SchoolClass>;
  listClasses(filters: { schoolId?: string; active?: boolean }): Promise<SchoolClass[]>;
  getClassById(id: string): Promise<SchoolClass | null>;
  updateClass(id: string, patch: UpdateClassInput, actor: AuthContext): Promise<SchoolClass>;
  deactivateClass(id: string, actor: AuthContext): Promise<SchoolClass>;
  deleteClass(id: string, actor: AuthContext): Promise<void>;
  listStudentIdsByClass(classId: string): Promise<string[]>;
  getClassesForStudents(studentIds: string[]): Promise<Map<string, { classId: string; className: string; teacherName: string | null }>>;

  createStudent(input: NewStudentInput, actor: AuthContext): Promise<Student>;
  createStudentWithin(tx: DbClient, input: NewStudentInput, actor: AuthContext): Promise<Student>;
  searchStudents(filters: StudentSearchFilters): Promise<{ items: Student[]; total: number }>;
  getStudentById(id: string): Promise<Student | null>;
  getStudentByNationalId(nationalId: string): Promise<Student | null>;
  updateStudent(id: string, patch: UpdateStudentInput, actor: AuthContext): Promise<Student>;
  deactivateStudent(id: string, actor: AuthContext): Promise<Student>;
  activateStudent(id: string, actor: AuthContext): Promise<Student>;
  deleteStudent(id: string, actor: AuthContext): Promise<void>;
  changeCaseStatus(id: string, caseStatus: StudentCaseStatus, actor: AuthContext): Promise<Student>;
  changePathway(id: string, pathway: StudentPathway | null, actor: AuthContext): Promise<Student>;
  changeOwner(id: string, ownerStaffId: string | null, actor: AuthContext): Promise<Student>;
  changeSpecialNeed(
    id: string,
    patch: { specialNeedType: SpecialNeedType | null; specialNeedSeverity: SpecialNeedSeverity | null; identifiedAt?: string | null },
    actor: AuthContext
  ): Promise<Student>;

  listEducationHistory(studentId: string): Promise<EducationHistoryEntry[]>;
  addEducationHistory(studentId: string, input: NewEducationHistoryInput, actor: AuthContext): Promise<EducationHistoryEntry>;
  deleteEducationHistory(studentId: string, entryId: string, actor: AuthContext): Promise<void>;

  listStudentAppointments(studentId: string, filters?: { from?: string; to?: string; limit?: number }): Promise<StudentAppointment[]>;

  listStudentTeachers(studentId: string): Promise<StudentTeacher[]>;
  addStudentTeacher(studentId: string, input: NewStudentTeacherInput, actor: AuthContext): Promise<StudentTeacher>;
  deleteStudentTeacher(studentId: string, teacherId: string, actor: AuthContext): Promise<void>;

  getDirectoryStats(): Promise<StudentDirectoryStats>;
}
