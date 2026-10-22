export interface SchoolRow {
  id: string;
  name: string;
  kind: string;
  gender_type: string | null;
  phone: string | null;
  address: string | null;
  principal_name: string | null;
  principal_phone: string | null;
  code: string | null;
  notes: string | null;
  active: number;
}

export interface ClassRow {
  id: string;
  school_id: string;
  school_name?: string;
  name: string;
  teacher_name: string | null;
  teacher_phone: string | null;
  active: number;
  student_count?: number;
}

export interface StudentRow {
  id: string;
  national_id: string | null;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender: string | null;
  grade: string | null;
  school_id: string | null;
  class_id: string | null;
  class_name: string | null;
  teacher_name: string | null;
  teacher_phone: string | null;
  guardian_name: string | null;
  guardian_relation: string | null;
  guardian_phone: string | null;
  active: number;
  created_at: string;
  case_status: string | null;
  pathway: string | null;
  special_need_type: string | null;
  special_need_severity: string | null;
  identified_at: string | null;
  wait_status: string | null;
  wait_since: string | null;
  owner_staff_id: string | null;
  owner_name: string | null;
}

export function rowToSchool(row: SchoolRow): import('./types').School {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as import('./types').School['kind'],
    genderType: row.gender_type,
    phone: row.phone,
    address: row.address,
    principalName: row.principal_name,
    principalPhone: row.principal_phone,
    code: row.code,
    notes: row.notes,
    active: row.active === 1
  };
}

export function rowToClass(row: ClassRow): import('./types').SchoolClass {
  return {
    id: row.id,
    schoolId: row.school_id,
    schoolName: row.school_name,
    name: row.name,
    teacherName: row.teacher_name,
    teacherPhone: row.teacher_phone,
    active: row.active === 1,
    studentCount: row.student_count
  };
}

export function rowToStudent(row: StudentRow): import('./types').Student {
  return {
    id: row.id,
    nationalId: row.national_id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthDate: row.birth_date,
    gender: (row.gender as 'male' | 'female' | null) ?? null,
    grade: row.grade,
    schoolId: row.school_id,
    classId: row.class_id,
    className: row.class_name,
    teacherName: row.teacher_name,
    teacherPhone: row.teacher_phone,
    guardianName: row.guardian_name,
    guardianRelation: row.guardian_relation,
    guardianPhone: row.guardian_phone,
    active: row.active === 1,
    createdAt: row.created_at,
    caseStatus: (row.case_status as import('./types').Student['caseStatus']) ?? null,
    pathway: (row.pathway as import('@core/shared').StudentPathway | null) ?? null,
    specialNeedType: (row.special_need_type as import('./types').Student['specialNeedType']) ?? null,
    specialNeedSeverity: (row.special_need_severity as import('./types').Student['specialNeedSeverity']) ?? null,
    identifiedAt: row.identified_at ?? null,
    waitStatus: (row.wait_status as 'waiting' | 'admitted' | null) ?? null,
    waitSince: row.wait_since ?? null,
    ownerStaffId: row.owner_staff_id ?? null,
    ownerName: row.owner_name ?? null
  };
}

export interface EduHistoryRow {
  id: string;
  student_id: string;
  study_year: string;
  school_name: string | null;
  level: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export function rowToEducationHistory(row: EduHistoryRow): import('./types').EducationHistoryEntry {
  return {
    id: row.id,
    studentId: row.student_id,
    studyYear: row.study_year,
    schoolName: row.school_name,
    level: row.level,
    notes: row.notes,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at
  };
}

export interface StudentTeacherRow {
  id: string;
  student_id: string;
  name: string;
  class_label: string | null;
  contact: string | null;
  created_at: string;
}

export function rowToStudentTeacher(row: StudentTeacherRow): import('./types').StudentTeacher {
  return {
    id: row.id,
    studentId: row.student_id,
    name: row.name,
    classLabel: row.class_label,
    contact: row.contact,
    createdAt: row.created_at
  };
}

export const STUDENT_WAIT_PROJECTION = `,
       CASE WHEN EXISTS (SELECT 1 FROM waitlist wq WHERE wq.student_id = s.id AND wq.deleted_at IS NULL AND wq.status IN ('waiting','called','scheduled')) THEN 'waiting'
            WHEN EXISTS (SELECT 1 FROM waitlist wa WHERE wa.student_id = s.id AND wa.deleted_at IS NULL AND wa.status = 'admitted') THEN 'admitted'
            ELSE NULL END AS wait_status,
       (SELECT wq2.created_at FROM waitlist wq2 WHERE wq2.student_id = s.id AND wq2.deleted_at IS NULL AND wq2.status IN ('waiting','called','scheduled') ORDER BY wq2.created_at LIMIT 1) AS wait_since`;

export const STUDENT_OWNER_PROJECTION = `,
       s.owner_staff_id,
       (SELECT st2.full_name FROM staff st2 WHERE st2.id = s.owner_staff_id) AS owner_name`;

export function studentSearchQuery(filters: {
  query?: string;
  schoolId?: string;
  grade?: string;
  tagId?: string;
  active?: boolean;
  ownerId?: string;
  staffScope?: string;
}): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.query) {
    conditions.push(`(s.first_name LIKE ? OR s.last_name LIKE ? OR s.national_id LIKE ?)`);
    const q = `%${filters.query}%`;
    params.push(q, q, q);
  }
  if (filters.schoolId) {
    conditions.push('s.school_id = ?');
    params.push(filters.schoolId);
  }
  if (filters.grade) {
    conditions.push('s.grade = ?');
    params.push(filters.grade);
  }
  if (filters.tagId) {
    conditions.push(`s.id IN (SELECT student_id FROM student_tags WHERE tag_id = ?)`);
    params.push(filters.tagId);
  }
  if (filters.active !== undefined) {
    conditions.push('s.active = ?');
    params.push(filters.active ? 1 : 0);
  }
  if (filters.ownerId) {
    conditions.push('s.owner_staff_id = ?');
    params.push(filters.ownerId);
  }
  if (filters.staffScope) {
    conditions.push(
      `(s.owner_staff_id = ? OR EXISTS (
         SELECT 1 FROM appointments a
           JOIN appointment_students asn ON asn.appointment_id = a.id
          WHERE a.staff_id = ? AND asn.student_id = s.id
       ))`
    );
    params.push(filters.staffScope, filters.staffScope);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return {
    sql: `SELECT s.id, s.national_id, s.first_name, s.last_name, s.birth_date, s.gender, s.grade, s.school_id,
                 s.class_id, c.name AS class_name, c.teacher_name, c.teacher_phone,
                 s.guardian_name, s.guardian_relation, s.guardian_phone, s.active, s.created_at, s.case_status, s.pathway,
                 s.special_need_type, s.special_need_severity, s.identified_at
                 ${STUDENT_WAIT_PROJECTION}
                 ${STUDENT_OWNER_PROJECTION}
            FROM students s
            LEFT JOIN classes c ON c.id = s.class_id ${where} ORDER BY s.last_name, s.first_name LIMIT ? OFFSET ?`,
    params
  };
}

export interface StudentTagJoinRow {
  student_id: string;
  id: string;
  name: string;
  category: string;
  color: string | null;
}

export function tagsForStudentsQuery(studentIds: string[]): { sql: string; params: unknown[] } {
  if (studentIds.length === 0) return { sql: '', params: [] };
  const placeholders = studentIds.map(() => '?').join(', ');
  return {
    sql: `SELECT st.student_id, t.id, t.name, t.category, t.color
            FROM student_tags st
            JOIN tags t ON t.id = st.tag_id
           WHERE t.active = 1 AND st.student_id IN (${placeholders})
           ORDER BY t.category, t.name`,
    params: studentIds
  };
}

export function assessmentCountsForStudentsQuery(studentIds: string[]): { sql: string; params: unknown[] } {
  if (studentIds.length === 0) return { sql: '', params: [] };
  const placeholders = studentIds.map(() => '?').join(', ');
  return {
    sql: `SELECT e.student_id, COUNT(*) AS n
            FROM case_events e
           WHERE e.status != 'cancelled' AND e.deleted_at IS NULL AND e.student_id IN (${placeholders})
           GROUP BY e.student_id`,
    params: studentIds
  };
}
