import type { AuthContext, SchoolKind, SpecialNeedSeverity, SpecialNeedType, StudentCaseStatus, StudentPathway } from '@core/shared';
import { faDigits, PLACEHOLDER_NATIONAL_ID_PREFIX } from '@core/shared';
import { NotFoundError, ConflictError, ValidationError } from '@core/errors';
import type {
  EducationHistoryEntry,
  NewClassInput,
  NewEducationHistoryInput,
  NewSchoolInput,
  NewStudentInput,
  NewStudentTeacherInput,
  School,
  SchoolClass,
  Student,
  StudentAppointment,
  StudentDirectoryStats,
  StudentProfileDeps,
  StudentProfileService,
  StudentSearchFilters,
  StudentTeacher,
  UpdateClassInput,
  UpdateSchoolInput,
  UpdateStudentInput
} from './types';
import { rowToClass, rowToEducationHistory, rowToSchool, rowToStudent, rowToStudentTeacher, studentSearchQuery, STUDENT_WAIT_PROJECTION, STUDENT_OWNER_PROJECTION, tagsForStudentsQuery, assessmentCountsForStudentsQuery, type EduHistoryRow, type StudentTeacherRow } from './repository';
import type { ClassRow, SchoolRow, StudentRow, StudentTagJoinRow } from './repository';
import type { TagRef } from '@core/shared';

export function createStudentProfileService(deps: StudentProfileDeps): StudentProfileService {
  const { db, audit, logger } = deps;

  async function requireClassForStudent(classId: string, schoolId: string | null | undefined): Promise<ClassRow> {
    const cls = await db.queryOne<ClassRow>(`SELECT id, school_id, name, teacher_name, teacher_phone, active FROM classes WHERE id = ?`, [classId]);
    if (!cls || cls.active !== 1) throw new NotFoundError('کلاس');
    if (schoolId && cls.school_id !== schoolId) {
      throw new ConflictError('کلاس انتخاب‌شده به مدرسه دیگری تعلق دارد');
    }
    return cls;
  }

  const service: StudentProfileService = {

    async createSchool(input: NewSchoolInput, actor: AuthContext): Promise<School> {
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        if (input.code) {
          const dup = await tx.queryOne<{ id: string }>(`SELECT id FROM schools WHERE code = ?`, [input.code]);
          if (dup) throw new ConflictError('این کد مدرسه قبلاً برای مدرسهٔ دیگری ثبت شده است');
        }
        await tx.execute(
          `INSERT INTO schools (id, name, kind, gender_type, phone, address, principal_name, principal_phone, code, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, input.name, input.kind, input.genderType ?? null, input.phone ?? null, input.address ?? null, input.principalName ?? null, input.principalPhone ?? null, input.code ?? null, input.notes ?? null]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'school.create',
          resourceType: 'school',
          resourceId: id,
          changes: { name: { from: null, to: input.name }, kind: { from: null, to: input.kind } }
        });
      });
      logger.child('createSchool').info('school.created');
      const school = await this.getSchoolById(id);
      return school as School;
    },

    async listSchools(filters: { kind?: SchoolKind; active?: boolean }): Promise<School[]> {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (filters.kind) {
        conditions.push('kind = ?');
        params.push(filters.kind);
      }
      if (filters.active !== undefined) {
        conditions.push('active = ?');
        params.push(filters.active ? 1 : 0);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await db.query<SchoolRow>(
        `SELECT id, name, kind, gender_type, phone, address, principal_name, principal_phone, code, notes, active FROM schools ${where} ORDER BY name`,
        params
      );
      return rows.map(rowToSchool);
    },

    async getSchoolById(id: string): Promise<School | null> {
      const row = await db.queryOne<SchoolRow>(
        `SELECT id, name, kind, gender_type, phone, address, principal_name, principal_phone, code, notes, active FROM schools WHERE id = ?`,
        [id]
      );
      return row ? rowToSchool(row) : null;
    },

    async updateSchool(id: string, patch: UpdateSchoolInput, actor: AuthContext): Promise<School> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<SchoolRow>(`SELECT id, name, kind, gender_type, phone, address, principal_name, principal_phone, code, notes, active FROM schools WHERE id = ?`, [id]);
        if (!row) throw new NotFoundError('مدرسه');

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const sets: string[] = [];
        if (patch.name !== undefined && patch.name !== row.name) {
          sets.push('name = ?');
          changes.name = { from: row.name, to: patch.name };
        }
        if (patch.code !== undefined && patch.code !== row.code) {
          if (patch.code) {
            const dup = await tx.queryOne<{ id: string }>(`SELECT id FROM schools WHERE code = ? AND id != ?`, [patch.code, id]);
            if (dup) throw new ConflictError('این کد مدرسه قبلاً برای مدرسهٔ دیگری ثبت شده است');
          }
          sets.push('code = ?');
          changes.code = { from: row.code, to: patch.code };
        }
        if (patch.notes !== undefined && patch.notes !== row.notes) {
          sets.push('notes = ?');
          changes.notes = { from: row.notes, to: patch.notes };
        }
        if (patch.kind !== undefined && patch.kind !== row.kind) {
          sets.push('kind = ?');
          changes.kind = { from: row.kind, to: patch.kind };
        }
        if (patch.genderType !== undefined && patch.genderType !== row.gender_type) {
          sets.push('gender_type = ?');
          changes.gender_type = { from: row.gender_type, to: patch.genderType };
        }
        if (patch.phone !== undefined && patch.phone !== row.phone) {
          sets.push('phone = ?');
          changes.phone = { from: row.phone, to: patch.phone };
        }
        if (patch.address !== undefined && patch.address !== row.address) {
          sets.push('address = ?');
          changes.address = { from: row.address, to: patch.address };
        }
        if (patch.principalName !== undefined && patch.principalName !== row.principal_name) {
          sets.push('principal_name = ?');
          changes.principal_name = { from: row.principal_name, to: patch.principalName };
        }
        if (patch.principalPhone !== undefined && patch.principalPhone !== row.principal_phone) {
          sets.push('principal_phone = ?');
          changes.principal_phone = { from: row.principal_phone, to: patch.principalPhone };
        }

        if (sets.length > 0) {
          const setIndex: Record<string, unknown> = {
            'name = ?': patch.name,
            'kind = ?': patch.kind,
            'gender_type = ?': patch.genderType,
            'phone = ?': patch.phone,
            'address = ?': patch.address,
            'principal_name = ?': patch.principalName,
            'principal_phone = ?': patch.principalPhone,
            'code = ?': patch.code,
            'notes = ?': patch.notes
          };
          const orderedParams: unknown[] = sets.map((s) => setIndex[s]);
          await tx.execute(`UPDATE schools SET ${sets.join(', ')} WHERE id = ?`, [...orderedParams, id]);
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'school.update',
            resourceType: 'school',
            resourceId: id,
            changes
          });
        }

        const merged: Record<string, unknown> = { ...row };
        if (sets.includes('name = ?')) merged.name = patch.name;
        if (sets.includes('kind = ?')) merged.kind = patch.kind;
        if (sets.includes('gender_type = ?')) merged.gender_type = patch.genderType;
        if (sets.includes('phone = ?')) merged.phone = patch.phone;
        if (sets.includes('address = ?')) merged.address = patch.address;
        if (sets.includes('principal_name = ?')) merged.principal_name = patch.principalName;
        if (sets.includes('principal_phone = ?')) merged.principal_phone = patch.principalPhone;
        if (sets.includes('code = ?')) merged.code = patch.code;
        if (sets.includes('notes = ?')) merged.notes = patch.notes;
        return rowToSchool(merged as unknown as SchoolRow);
      });
    },

    async deactivateSchool(id: string, actor: AuthContext): Promise<School> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<SchoolRow>(`SELECT id, name, kind, gender_type, phone, address, principal_name, principal_phone, active FROM schools WHERE id = ?`, [id]);
        if (!row) throw new NotFoundError('مدرسه');
        if (row.active === 0) throw new ConflictError('مدرسه قبلاً غیرفعال شده است');

        await tx.execute(`UPDATE schools SET active = 0 WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'school.deactivate',
          resourceType: 'school',
          resourceId: id,
          changes: { active: { from: 1, to: 0 } }
        });
        return rowToSchool({ ...row, active: 0 });
      });
    },

    async deleteSchool(id: string, actor: AuthContext): Promise<void> {
      await db.transaction(async (tx) => {
        const row = await tx.queryOne<{ id: string; name: string }>(`SELECT id, name FROM schools WHERE id = ?`, [id]);
        if (!row) throw new NotFoundError('مدرسه');

        const students = await tx.queryOne<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM students WHERE school_id = ?`, [id]);
        const classes = await tx.queryOne<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM classes WHERE school_id = ?`, [id]);
        if ((students?.cnt ?? 0) > 0 || (classes?.cnt ?? 0) > 0) {
          throw new ConflictError(`مدرسهٔ «${row.name}» ${faDigits((students?.cnt ?? 0) + (classes?.cnt ?? 0))} ردیف دانش‌آموز/کلاس دارد و حذف نمی‌شود — از «غیرفعال‌سازی» استفاده کنید`);
        }

        await tx.execute(`DELETE FROM schools WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'school.delete',
          resourceType: 'school',
          resourceId: id,
          changes: { name: { from: row.name, to: null } }
        });
      });
      logger.child('school').info('school.deleted', { id });
    },

    async createClass(input: NewClassInput, actor: AuthContext): Promise<SchoolClass> {
      const school = await db.queryOne<{ id: string }>(`SELECT id FROM schools WHERE id = ? AND active = 1`, [input.schoolId]);
      if (!school) throw new NotFoundError('مدرسه');

      const countRow = await db.queryOne<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM classes WHERE school_id = ? AND active = 1`, [input.schoolId]);
      if ((countRow?.cnt ?? 0) >= 60) throw new ConflictError('حداکثر ۶۰ کلاس فعال برای هر مدرسه مجاز است');

      const dup = await db.queryOne<{ id: string }>(`SELECT id FROM classes WHERE school_id = ? AND name = ? AND active = 1`, [input.schoolId, input.name]);
      if (dup) throw new ConflictError('کلاسی با این نام در این مدرسه ثبت شده است');

      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO classes (id, school_id, name, teacher_name, teacher_phone) VALUES (?, ?, ?, ?, ?)`,
          [id, input.schoolId, input.name, input.teacherName ?? null, input.teacherPhone ?? null]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'class.create',
          resourceType: 'class',
          resourceId: id,
          changes: { name: { from: null, to: input.name }, schoolId: { from: null, to: input.schoolId } }
        });
      });
      const row = await db.queryOne<ClassRow>(
        `SELECT c.id, c.school_id, sc.name AS school_name, c.name, c.teacher_name, c.teacher_phone, c.active,
                (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id AND st.active = 1) AS student_count
           FROM classes c JOIN schools sc ON sc.id = c.school_id WHERE c.id = ?`,
        [id]
      );
      return rowToClass(row as ClassRow);
    },

    async listClasses(filters: { schoolId?: string; active?: boolean }): Promise<SchoolClass[]> {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (filters.schoolId) {
        conditions.push('c.school_id = ?');
        params.push(filters.schoolId);
      }
      if (filters.active !== undefined) {
        conditions.push('c.active = ?');
        params.push(filters.active ? 1 : 0);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await db.query<ClassRow>(
        `SELECT c.id, c.school_id, sc.name AS school_name, c.name, c.teacher_name, c.teacher_phone, c.active,
                (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id AND st.active = 1) AS student_count
           FROM classes c JOIN schools sc ON sc.id = c.school_id ${where}
          ORDER BY sc.name, c.name`,
        params
      );
      return rows.map(rowToClass);
    },

    async getClassById(id: string): Promise<SchoolClass | null> {
      const row = await db.queryOne<ClassRow>(
        `SELECT c.id, c.school_id, sc.name AS school_name, c.name, c.teacher_name, c.teacher_phone, c.active,
                (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id AND st.active = 1) AS student_count
           FROM classes c JOIN schools sc ON sc.id = c.school_id WHERE c.id = ?`,
        [id]
      );
      return row ? rowToClass(row) : null;
    },

    async updateClass(id: string, patch: UpdateClassInput, actor: AuthContext): Promise<SchoolClass> {
      await db.transaction(async (tx) => {
        const row = await tx.queryOne<ClassRow>(`SELECT id, school_id, name, teacher_name, teacher_phone, active FROM classes WHERE id = ?`, [id]);
        if (!row) throw new NotFoundError('کلاس');

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const setMap: [string, unknown, unknown][] = [];
        if (patch.name !== undefined && patch.name !== row.name) {
          setMap.push(['name', patch.name, row.name]);
        }
        if (patch.teacherName !== undefined && patch.teacherName !== row.teacher_name) setMap.push(['teacher_name', patch.teacherName, row.teacher_name]);
        if (patch.teacherPhone !== undefined && patch.teacherPhone !== row.teacher_phone) setMap.push(['teacher_phone', patch.teacherPhone, row.teacher_phone]);

        if (setMap.length > 0) {
          if (patch.name !== undefined && patch.name !== row.name) {
            const dup = await tx.queryOne<{ id: string }>(`SELECT id FROM classes WHERE school_id = ? AND name = ? AND active = 1 AND id != ?`, [row.school_id, patch.name, id]);
            if (dup) throw new ConflictError('کلاسی با این نام در این مدرسه ثبت شده است');
          }
          const sets = setMap.map(([col]) => `${col} = ?`).join(', ');
          await tx.execute(`UPDATE classes SET ${sets} WHERE id = ?`, [...setMap.map(([, v]) => v), id]);
          for (const [col, to, from] of setMap) changes[col] = { from, to };
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'class.update',
            resourceType: 'class',
            resourceId: id,
            changes
          });
        }
      });

      const updated = await db.queryOne<ClassRow>(
        `SELECT c.id, c.school_id, sc.name AS school_name, c.name, c.teacher_name, c.teacher_phone, c.active,
                (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id AND st.active = 1) AS student_count
           FROM classes c JOIN schools sc ON sc.id = c.school_id WHERE c.id = ?`,
        [id]
      );
      return rowToClass(updated as ClassRow);
    },

    async deactivateClass(id: string, actor: AuthContext): Promise<SchoolClass> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<ClassRow>(`SELECT id, school_id, name, teacher_name, teacher_phone, active FROM classes WHERE id = ?`, [id]);
        if (!row) throw new NotFoundError('کلاس');
        if (row.active === 0) throw new ConflictError('کلاس قبلاً غیرفعال شده است');

        await tx.execute(`UPDATE students SET class_id = NULL WHERE class_id = ?`, [id]);
        await tx.execute(`UPDATE classes SET active = 0 WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'class.deactivate',
          resourceType: 'class',
          resourceId: id,
          changes: { active: { from: 1, to: 0 } }
        });
        return rowToClass({ ...row, active: 0 });
      });
    },

    async deleteClass(id: string, actor: AuthContext): Promise<void> {
      await db.transaction(async (tx) => {
        const row = await tx.queryOne<{ id: string; name: string }>(`SELECT id, name FROM classes WHERE id = ?`, [id]);
        if (!row) throw new NotFoundError('کلاس');

        const students = await tx.queryOne<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM students WHERE class_id = ?`, [id]);
        if ((students?.cnt ?? 0) > 0) {
          throw new ConflictError(`کلاس «${row.name}» دانش‌آموز دارد و حذف نمی‌شود — ابتدا دانش‌آموزان را جابه‌جا یا کلاس را غیرفعال کنید`);
        }

        await tx.execute(`DELETE FROM class_bot_links WHERE class_id = ?`, [id]);
        await tx.execute(`DELETE FROM classes WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'class.delete',
          resourceType: 'class',
          resourceId: id,
          changes: { name: { from: row.name, to: null } }
        });
      });
      logger.child('class').info('class.deleted', { id });
    },

    async listStudentIdsByClass(classId: string): Promise<string[]> {
      const rows = await db.query<{ id: string }>(`SELECT id FROM students WHERE class_id = ? AND active = 1`, [classId]);
      return rows.map((r) => r.id);
    },

    async getClassesForStudents(studentIds: string[]): Promise<Map<string, { classId: string; className: string; teacherName: string | null }>> {
      const map = new Map<string, { classId: string; className: string; teacherName: string | null }>();
      if (studentIds.length === 0) return map;
      const placeholders = studentIds.map(() => '?').join(', ');
      const rows = await db.query<{ id: string; class_id: string; name: string; teacher_name: string | null }>(
        `SELECT id, class_id, (SELECT name FROM classes WHERE id = s.class_id) AS name,
                (SELECT teacher_name FROM classes WHERE id = s.class_id) AS teacher_name
           FROM students s WHERE s.id IN (${placeholders}) AND s.class_id IS NOT NULL`,
        studentIds
      );
      for (const r of rows) {
        if (r.class_id && r.name) {
          map.set(r.id, { classId: r.class_id, className: r.name, teacherName: r.teacher_name });
        }
      }
      return map;
    },

    async createStudent(input: NewStudentInput, actor: AuthContext): Promise<Student> {
      const student = await db.transaction((tx) => service.createStudentWithin(tx, input, actor));
      logger.child('createStudent').info('student.created');
      const fresh = await this.getStudentById(student.id);
      return fresh as Student;
    },

    async createStudentWithin(tx, input, actor): Promise<Student> {
      const id = crypto.randomUUID();

      let nationalId = input.nationalId ?? null;
      if (!nationalId) {
        for (;;) {
          const candidate = `${PLACEHOLDER_NATIONAL_ID_PREFIX}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
          const taken = await tx.queryOne<{ id: string }>(`SELECT id FROM students WHERE national_id = ?`, [candidate]);
          if (!taken) {
            nationalId = candidate;
            break;
          }
        }
      }

      if (input.nationalId) {
        const existing = await tx.queryOne<{ id: string }>(`SELECT id FROM students WHERE national_id = ?`, [input.nationalId]);
        if (existing) throw new ConflictError('این کد ملی قبلاً ثبت شده است');
      }

      if (input.schoolId) {
        const school = await tx.queryOne<{ id: string }>(`SELECT id FROM schools WHERE id = ? AND active = 1`, [input.schoolId]);
        if (!school) throw new NotFoundError('مدرسه');
      }
      if (input.classId) {
        await requireClassForStudent(input.classId, input.schoolId);
      }

      if (input.ownerStaffId) {
        const owner = await tx.queryOne<{ id: string; active: number }>(`SELECT id, active FROM staff WHERE id = ?`, [input.ownerStaffId]);
        if (!owner || owner.active !== 1) throw new NotFoundError('همکار');
      }

      const active = input.archived ? 0 : 1;

      const nowIso = new Date().toISOString();
      await tx.execute(
        `INSERT INTO students (id, national_id, first_name, last_name, birth_date, gender, grade, school_id, class_id,
                               guardian_name, guardian_relation, guardian_phone, owner_staff_id, active, pathway)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          nationalId,
          input.firstName,
          input.lastName,
          input.birthDate ?? null,
          input.gender ?? null,
          input.grade ?? null,
          input.schoolId ?? null,
          input.classId ?? null,
          input.guardianName ?? null,
          input.guardianRelation ?? null,
          input.guardianPhone ?? null,
          input.ownerStaffId ?? null,
          active,
          input.pathway ?? null
        ]
      );
      await audit.logInTransaction(tx, {
        actorId: actor.staffId,
        action: 'student.create',
        resourceType: 'student',
        resourceId: id,
        changes: {
          national_id: input.nationalId ? { from: null, to: '***' } : { from: null, to: 'NAS-placeholder' }, // بدون PII در action — فقط نشانه
          grade: { from: null, to: input.grade ?? null },
          owner_staff_id: { from: null, to: input.ownerStaffId ?? null },
          active: { from: null, to: active },
          pathway: { from: null, to: input.pathway ?? null }
        }
      });

      const student: Student = {
        id,
        nationalId,
        firstName: input.firstName,
        lastName: input.lastName,
        birthDate: input.birthDate ?? null,
        gender: input.gender ?? null,
        grade: input.grade ?? null,
        schoolId: input.schoolId ?? null,
        classId: input.classId ?? null,
        className: null,
        teacherName: null,
        teacherPhone: null,
        guardianName: input.guardianName ?? null,
        guardianRelation: input.guardianRelation ?? null,
        guardianPhone: input.guardianPhone ?? null,
        active: active === 1,
        ownerStaffId: input.ownerStaffId ?? null,
        pathway: input.pathway ?? null,
        createdAt: nowIso
      };
      return student;
    },

    async searchStudents(filters: StudentSearchFilters): Promise<{ items: Student[]; total: number }> {
      const { sql, params } = studentSearchQuery({
        query: filters.query,
        schoolId: filters.schoolId,
        grade: filters.grade,
        tagId: filters.tagId,
        active: filters.active,
        ownerId: filters.ownerId,
        staffScope: filters.staffScope
      });
      const limit = filters.pageSize;
      const offset = (filters.page - 1) * filters.pageSize;
      const rows = await db.query<StudentRow>(sql, [...params, limit, offset]);

      const countConditions: string[] = [];
      const countParams: unknown[] = [];
      if (filters.query) {
        countConditions.push(`(first_name LIKE ? OR last_name LIKE ? OR national_id LIKE ?)`);
        const q = `%${filters.query}%`;
        countParams.push(q, q, q);
      }
      if (filters.schoolId) {
        countConditions.push('school_id = ?');
        countParams.push(filters.schoolId);
      }
      if (filters.grade) {
        countConditions.push('grade = ?');
        countParams.push(filters.grade);
      }
      if (filters.tagId) {
        countConditions.push(`id IN (SELECT student_id FROM student_tags WHERE tag_id = ?)`);
        countParams.push(filters.tagId);
      }
      if (filters.active !== undefined) {
        countConditions.push('active = ?');
        countParams.push(filters.active ? 1 : 0);
      }
      if (filters.ownerId) {
        countConditions.push('owner_staff_id = ?');
        countParams.push(filters.ownerId);
      }
      if (filters.staffScope) {
        countConditions.push(
          `(owner_staff_id = ? OR EXISTS (
             SELECT 1 FROM appointments a
               JOIN appointment_students asn ON asn.appointment_id = a.id
              WHERE a.staff_id = ? AND asn.student_id = students.id
           ))`
        );
        countParams.push(filters.staffScope, filters.staffScope);
      }
      const where = countConditions.length > 0 ? `WHERE ${countConditions.join(' AND ')}` : '';
      const totalRow = await db.queryOne<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM students ${where}`, countParams);

      const items = rows.map(rowToStudent);

      if (items.length > 0) {
        const { sql: tagSql, params: tagParams } = tagsForStudentsQuery(items.map((s) => s.id));
        const tagRows = await db.query<StudentTagJoinRow>(tagSql, tagParams);
        const byStudent = new Map<string, TagRef[]>();
        for (const r of tagRows) {
          const arr = byStudent.get(r.student_id) ?? [];
          arr.push({ id: r.id, name: r.name, category: r.category as TagRef['category'], color: r.color });
          byStudent.set(r.student_id, arr);
        }
        for (const s of items) s.tags = byStudent.get(s.id) ?? [];
      }

      if (items.length > 0) {
        const { sql: cntSql, params: cntParams } = assessmentCountsForStudentsQuery(items.map((s) => s.id));
        const cntRows = await db.query<{ student_id: string; n: number }>(cntSql, cntParams);
        const countByStudent = new Map(cntRows.map((r) => [r.student_id, r.n]));
        for (const s of items) s.assessmentCount = countByStudent.get(s.id) ?? 0;
      }

      return { items, total: totalRow?.cnt ?? 0 };
    },

    async getStudentById(id: string): Promise<Student | null> {
      const row = await db.queryOne<StudentRow>(
        `SELECT s.id, s.national_id, s.first_name, s.last_name, s.birth_date, s.gender, s.grade, s.school_id,
                s.class_id, c.name AS class_name, c.teacher_name, c.teacher_phone,
                s.guardian_name, s.guardian_relation, s.guardian_phone, s.active, s.created_at, s.case_status, s.pathway,
                s.special_need_type, s.special_need_severity, s.identified_at
                ${STUDENT_WAIT_PROJECTION}
                ${STUDENT_OWNER_PROJECTION}
           FROM students s
           LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
        [id]
      );
      return row ? rowToStudent(row) : null;
    },

    async getStudentByNationalId(nationalId: string): Promise<Student | null> {
      const row = await db.queryOne<StudentRow>(
        `SELECT s.id, s.national_id, s.first_name, s.last_name, s.birth_date, s.gender, s.grade, s.school_id,
                s.class_id, c.name AS class_name, c.teacher_name, c.teacher_phone,
                s.guardian_name, s.guardian_relation, s.guardian_phone, s.active, s.created_at, s.case_status, s.pathway,
                s.special_need_type, s.special_need_severity, s.identified_at
                ${STUDENT_WAIT_PROJECTION}
                ${STUDENT_OWNER_PROJECTION}
           FROM students s
           LEFT JOIN classes c ON c.id = s.class_id WHERE s.national_id = ?`,
        [nationalId]
      );
      return row ? rowToStudent(row) : null;
    },

    async updateStudent(id: string, patch: UpdateStudentInput, actor: AuthContext): Promise<Student> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<StudentRow>(
          `SELECT s.id, s.national_id, s.first_name, s.last_name, s.birth_date, s.gender, s.grade, s.school_id,
                  s.class_id, c.name AS class_name, c.teacher_name, c.teacher_phone,
                  s.guardian_name, s.guardian_relation, s.guardian_phone, s.active, s.created_at
             FROM students s
             LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
          [id]
        );
        if (!row) throw new NotFoundError('دانش‌آموز');

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const setMap: [string, unknown, unknown][] = []; // [column, newValue, oldValue]
        if (patch.firstName !== undefined && patch.firstName !== row.first_name) setMap.push(['first_name', patch.firstName, row.first_name]);
        if (patch.lastName !== undefined && patch.lastName !== row.last_name) setMap.push(['last_name', patch.lastName, row.last_name]);
        if (patch.birthDate !== undefined && patch.birthDate !== row.birth_date) setMap.push(['birth_date', patch.birthDate, row.birth_date]);
        if (patch.gender !== undefined && patch.gender !== row.gender) setMap.push(['gender', patch.gender, row.gender]);
        if (patch.grade !== undefined && patch.grade !== row.grade) setMap.push(['grade', patch.grade, row.grade]);
        if (patch.schoolId !== undefined && patch.schoolId !== row.school_id) setMap.push(['school_id', patch.schoolId, row.school_id]);
        if (patch.classId !== undefined && patch.classId !== row.class_id) setMap.push(['class_id', patch.classId, row.class_id]);
        if (patch.guardianName !== undefined && patch.guardianName !== row.guardian_name) setMap.push(['guardian_name', patch.guardianName, row.guardian_name]);
        if (patch.guardianRelation !== undefined && patch.guardianRelation !== row.guardian_relation) setMap.push(['guardian_relation', patch.guardianRelation, row.guardian_relation]);
        if (patch.guardianPhone !== undefined && patch.guardianPhone !== row.guardian_phone) setMap.push(['guardian_phone', patch.guardianPhone, row.guardian_phone]);

        if (patch.nationalId !== undefined && patch.nationalId !== row.national_id) {
          if (!(row.national_id ?? '').startsWith(PLACEHOLDER_NATIONAL_ID_PREFIX)) {
            throw new ConflictError('کد ملی این پرونده قبلاً ثبت شده و قابل تغییر نیست');
          }
          const dupe = await tx.queryOne<{ id: string }>(`SELECT id FROM students WHERE national_id = ? AND id != ?`, [patch.nationalId, id]);
          if (dupe) throw new ConflictError('این کد ملی قبلاً ثبت شده است');
          setMap.push(['national_id', patch.nationalId, row.national_id]);
        }

        if (setMap.length > 0) {
          if (patch.schoolId) {
            const school = await tx.queryOne<{ id: string }>(`SELECT id FROM schools WHERE id = ? AND active = 1`, [patch.schoolId]);
            if (!school) throw new NotFoundError('مدرسه');
          }
          if (patch.classId) {
            const effectiveSchool = patch.schoolId !== undefined ? patch.schoolId : row.school_id;
            await requireClassForStudent(patch.classId, effectiveSchool);
          }
          const sets = setMap.map(([col]) => `${col} = ?`).join(', ');
          await tx.execute(`UPDATE students SET ${sets} WHERE id = ?`, [...setMap.map(([, v]) => v), id]);
          for (const [col, to, from] of setMap) {
            changes[col] = { from, to };
          }
          if (changes.national_id) changes.national_id = { from: 'NAS-placeholder', to: '***' };
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'student.update',
            resourceType: 'student',
            resourceId: id,
            changes
          });
        }

        const merged: Record<string, unknown> = { ...row };
        for (const [col, to] of setMap) merged[col] = to;
        return rowToStudent(merged as unknown as StudentRow);
      });
    },

    async changeCaseStatus(id: string, caseStatus: StudentCaseStatus, actor: AuthContext): Promise<Student> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<StudentRow>(
          `SELECT s.id, s.national_id, s.first_name, s.last_name, s.birth_date, s.gender, s.grade, s.school_id,
                  s.class_id, c.name AS class_name, c.teacher_name, c.teacher_phone,
                  s.guardian_name, s.guardian_relation, s.guardian_phone, s.active, s.created_at, s.case_status, s.pathway,
                s.special_need_type, s.special_need_severity, s.identified_at
                ${STUDENT_OWNER_PROJECTION}
             FROM students s
             LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
          [id]
        );
        if (!row) throw new NotFoundError('دانش‌آموز');

        if (row.case_status === caseStatus) {
          return rowToStudent(row);
        }

        await tx.execute(`UPDATE students SET case_status = ? WHERE id = ?`, [caseStatus, id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.case_status.changed',
          resourceType: 'student',
          resourceId: id,
          changes: { case_status: { from: row.case_status, to: caseStatus } }
        });
        logger.child('case-status').info('student.case_status.changed', { studentId: id, to: caseStatus });
        return rowToStudent({ ...row, case_status: caseStatus });
      });
    },

    async changePathway(id: string, pathway: StudentPathway | null, actor: AuthContext): Promise<Student> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<StudentRow>(
          `SELECT s.id, s.national_id, s.first_name, s.last_name, s.birth_date, s.gender, s.grade, s.school_id,
                  s.class_id, c.name AS class_name, c.teacher_name, c.teacher_phone,
                  s.guardian_name, s.guardian_relation, s.guardian_phone, s.active, s.created_at, s.case_status, s.pathway,
                  s.special_need_type, s.special_need_severity, s.identified_at
                  ${STUDENT_OWNER_PROJECTION}
             FROM students s
             LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
          [id]
        );
        if (!row) throw new NotFoundError('دانش‌آموز');

        if (row.pathway === pathway) {
          return rowToStudent(row);
        }

        await tx.execute(`UPDATE students SET pathway = ? WHERE id = ?`, [pathway, id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.pathway.changed',
          resourceType: 'student',
          resourceId: id,
          changes: { pathway: { from: row.pathway, to: pathway } }
        });
        logger.child('pathway').info('student.pathway.changed', { studentId: id, to: pathway });
        return rowToStudent({ ...row, pathway });
      });
    },

    async changeOwner(id: string, ownerStaffId: string | null, actor: AuthContext): Promise<Student> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<StudentRow>(
          `SELECT s.id, s.national_id, s.first_name, s.last_name, s.birth_date, s.gender, s.grade, s.school_id,
                  s.class_id, c.name AS class_name, c.teacher_name, c.teacher_phone,
                  s.guardian_name, s.guardian_relation, s.guardian_phone, s.active, s.created_at, s.case_status, s.pathway,
                s.special_need_type, s.special_need_severity, s.identified_at,
                  s.owner_staff_id,
                  (SELECT st3.full_name FROM staff st3 WHERE st3.id = s.owner_staff_id) AS owner_name
             FROM students s
             LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
          [id]
        );
        if (!row) throw new NotFoundError('دانش‌آموز');

        if (row.owner_staff_id === ownerStaffId) {
          return rowToStudent(row);
        }

        if (ownerStaffId !== null) {
          const staff = await tx.queryOne<{ id: string; active: number }>(
            `SELECT id, active FROM staff WHERE id = ?`,
            [ownerStaffId]
          );
          if (!staff || staff.active !== 1) throw new NotFoundError('همکار');
        }

        await tx.execute(`UPDATE students SET owner_staff_id = ? WHERE id = ?`, [ownerStaffId, id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.owner.changed',
          resourceType: 'student',
          resourceId: id,
          changes: { owner_staff_id: { from: row.owner_staff_id, to: ownerStaffId } }
        });
        logger.child('owner').info('student.owner.changed', { studentId: id, to: ownerStaffId });
        const ownerName = ownerStaffId
          ? (await tx.queryOne<{ full_name: string }>(`SELECT full_name FROM staff WHERE id = ?`, [ownerStaffId]))?.full_name ?? null
          : null;
        return rowToStudent({ ...row, owner_staff_id: ownerStaffId, owner_name: ownerName });
      });
    },

    async changeSpecialNeed(
      id: string,
      patch: { specialNeedType: SpecialNeedType | null; specialNeedSeverity: SpecialNeedSeverity | null; identifiedAt?: string | null },
      actor: AuthContext
    ): Promise<Student> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<StudentRow>(
          `SELECT s.id, s.national_id, s.first_name, s.last_name, s.birth_date, s.gender, s.grade, s.school_id,
                  s.class_id, c.name AS class_name, c.teacher_name, c.teacher_phone,
                  s.guardian_name, s.guardian_relation, s.guardian_phone, s.active, s.created_at, s.case_status, s.pathway,
                s.special_need_type, s.special_need_severity, s.identified_at,
                  s.special_need_type, s.special_need_severity, s.identified_at
             FROM students s
             LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
          [id]
        );
        if (!row) throw new NotFoundError('دانش‌آموز');

        const noOp =
          row.special_need_type === patch.specialNeedType &&
          row.special_need_severity === patch.specialNeedSeverity &&
          patch.identifiedAt === undefined;
        if (noOp) {
          return rowToStudent(row);
        }

        let identifiedAt: string | null;
        if (patch.specialNeedType === null) {
          identifiedAt = null;
        } else if (patch.identifiedAt !== undefined) {
          identifiedAt = patch.identifiedAt;
        } else if (row.special_need_type === null) {
          identifiedAt = new Date().toISOString();
        } else {
          identifiedAt = row.identified_at;
        }

        await tx.execute(
          `UPDATE students SET special_need_type = ?, special_need_severity = ?, identified_at = ? WHERE id = ?`,
          [patch.specialNeedType, patch.specialNeedSeverity, identifiedAt, id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.special_need.changed',
          resourceType: 'student',
          resourceId: id,
          changes: {
            special_need_type: { from: row.special_need_type, to: patch.specialNeedType },
            special_need_severity: { from: row.special_need_severity, to: patch.specialNeedSeverity }
          }
        });
        logger.child('special-needs').info('student.special_need.changed', { studentId: id, to: patch.specialNeedType });
        return rowToStudent({
          ...row,
          special_need_type: patch.specialNeedType,
          special_need_severity: patch.specialNeedSeverity,
          identified_at: identifiedAt
        });
      });
    },

    async deactivateStudent(id: string, actor: AuthContext): Promise<Student> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<StudentRow>(
          `SELECT s.id, s.national_id, s.first_name, s.last_name, s.birth_date, s.gender, s.grade, s.school_id,
                  s.class_id, c.name AS class_name, c.teacher_name, c.teacher_phone,
                  s.guardian_name, s.guardian_relation, s.guardian_phone, s.active, s.created_at
             FROM students s
             LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
          [id]
        );
        if (!row) throw new NotFoundError('دانش‌آموز');
        if (row.active === 0) throw new ConflictError('دانش‌آموز قبلاً غیرفعال شده است');

        await tx.execute(`UPDATE students SET active = 0 WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.deactivate',
          resourceType: 'student',
          resourceId: id,
          changes: { active: { from: 1, to: 0 } }
        });
        return rowToStudent({ ...row, active: 0 });
      });
    },

    async activateStudent(id: string, actor: AuthContext): Promise<Student> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<StudentRow>(
          `SELECT s.id, s.national_id, s.first_name, s.last_name, s.birth_date, s.gender, s.grade, s.school_id,
                  s.class_id, c.name AS class_name, c.teacher_name, c.teacher_phone,
                  s.guardian_name, s.guardian_relation, s.guardian_phone, s.active, s.created_at
             FROM students s
             LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
          [id]
        );
        if (!row) throw new NotFoundError('دانش‌آموز');
        if (row.active === 1) throw new ConflictError('این دانش‌آموز فعال است');

        await tx.execute(`UPDATE students SET active = 1 WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.activate',
          resourceType: 'student',
          resourceId: id,
          changes: { active: { from: 0, to: 1 } }
        });
        return rowToStudent({ ...row, active: 1 });
      });
    },

    async deleteStudent(id: string, actor: AuthContext): Promise<void> {
      await db.transaction(async (tx) => {
        const row = await tx.queryOne<{ id: string; first_name: string; last_name: string }>(
          `SELECT id, first_name, last_name FROM students WHERE id = ?`,
          [id]
        );
        if (!row) throw new NotFoundError('دانش‌آموز');
        const fullName = `${row.first_name} ${row.last_name}`;

        const refs: Array<[string, string]> = [
          ['appointment_students', `SELECT COUNT(*) AS cnt FROM appointment_students WHERE student_id = ?`],
          ['waitlist', `SELECT COUNT(*) AS cnt FROM waitlist WHERE (student_id = ? OR admitted_student_id = ?) AND deleted_at IS NULL`],
          ['case_events', `SELECT COUNT(*) AS cnt FROM case_events WHERE student_id = ? AND deleted_at IS NULL`],
          ['followups', `SELECT COUNT(*) AS cnt FROM followups WHERE student_id = ?`],
          ['exercise_assignments', `SELECT COUNT(*) AS cnt FROM exercise_assignments WHERE student_id = ?`],
          ['exercise_submissions', `SELECT COUNT(*) AS cnt FROM exercise_submissions WHERE student_id = ?`],
          ['committee_items', `SELECT COUNT(*) AS cnt FROM committee_items WHERE student_id = ? AND deleted_at IS NULL`]
        ];
        for (const [label, sql] of refs) {
          const params = sql.includes('admitted_student_id') ? [id, id] : [id];
          const hit = await tx.queryOne<{ cnt: number }>(sql, params);
          if ((hit?.cnt ?? 0) > 0) {
            throw new ConflictError(`پروندهٔ «${fullName}» سابقهٔ ${label} دارد و حذف نمی‌شود — از «انتقال به آرشیو» استفاده کنید`);
          }
        }

        await tx.execute(`DELETE FROM student_tags WHERE student_id = ?`, [id]);
        await tx.execute(`DELETE FROM case_events WHERE student_id = ?`, [id]);
        await tx.execute(`DELETE FROM intervention_paths WHERE student_id = ?`, [id]);
        await tx.execute(`DELETE FROM students WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.delete',
          resourceType: 'student',
          resourceId: id,
          changes: { full_name: { from: fullName, to: null } }
        });
      });
      logger.child('student').info('student.deleted', { id });
    },

    async getDirectoryStats(): Promise<StudentDirectoryStats> {
      const students = await db.queryOne<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM students WHERE active = 1`, []);
      const schools = await db.queryOne<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM schools`, []);
      const activeSchools = await db.queryOne<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM schools WHERE active = 1`, []);
      return {
        totalStudents: students?.cnt ?? 0,
        totalSchools: schools?.cnt ?? 0,
        activeSchools: activeSchools?.cnt ?? 0
      };
    },

    async listStudentAppointments(
      studentId: string,
      filters?: { from?: string; to?: string; limit?: number }
    ): Promise<StudentAppointment[]> {
      const student = await db.queryOne<{ id: string }>(`SELECT id FROM students WHERE id = ?`, [studentId]);
      if (!student) throw new NotFoundError('دانش‌آموز');

      const conditions = [`a_s.student_id = ?`];
      const params: unknown[] = [studentId];
      if (filters?.from) {
        conditions.push(`a.start_at >= ?`);
        params.push(filters.from);
      }
      if (filters?.to) {
        conditions.push(`a.start_at <= ?`);
        params.push(filters.to);
      }
      const limit = Math.min(Math.max(1, filters?.limit ?? 100), 200);

      const rows = await db.query<{
        appointment_id: string;
        staff_id: string;
        staff_name: string | null;
        start_at: string;
        end_at: string;
        status: string;
        my_attendance: string;
        note: string | null;
      }>(
        `SELECT a.id AS appointment_id, a.staff_id, s.full_name AS staff_name,
                a.start_at, a.end_at, a.status, a_s.attendance AS my_attendance, a.note
           FROM appointment_students a_s
           JOIN appointments a ON a.id = a_s.appointment_id
           LEFT JOIN staff s ON s.id = a.staff_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY a.start_at DESC
          LIMIT ${limit}`,
        params
      );

      return rows.map((r) => ({
        appointmentId: r.appointment_id,
        staffId: r.staff_id,
        staffName: r.staff_name,
        startAt: r.start_at,
        endAt: r.end_at,
        status: r.status,
        myAttendance: r.my_attendance,
        note: r.note
      }));
    },

    async listEducationHistory(studentId: string): Promise<EducationHistoryEntry[]> {
      const student = await db.queryOne<{ id: string }>(`SELECT id FROM students WHERE id = ?`, [studentId]);
      if (!student) throw new NotFoundError('دانش‌آموز');
      const rows = await db.query<EduHistoryRow>(
        `SELECT h.id, h.student_id, h.study_year, h.school_name, h.level, h.notes, h.created_by, h.created_at,
                (SELECT st2.full_name FROM staff st2 WHERE st2.id = h.created_by) AS created_by_name
           FROM student_education_history h
          WHERE h.student_id = ?
          ORDER BY h.created_at, h.rowid`,
        [studentId]
      );
      return rows.map(rowToEducationHistory);
    },

    async addEducationHistory(studentId: string, input: NewEducationHistoryInput, actor: AuthContext): Promise<EducationHistoryEntry> {
      const entryId = await db.transaction(async (tx) => {
        const student = await tx.queryOne<{ id: string }>(`SELECT id FROM students WHERE id = ?`, [studentId]);
        if (!student) throw new NotFoundError('دانش‌آموز');
        const newId = crypto.randomUUID();
        await tx.execute(
          `INSERT INTO student_education_history (id, student_id, study_year, school_name, level, notes, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f','now'))`,
          [newId, studentId, input.studyYear, input.schoolName ?? null, input.level ?? null, input.notes ?? null, actor.staffId ?? null]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.education_history.add',
          resourceType: 'student',
          resourceId: studentId,
          changes: { entry_id: { from: null, to: newId }, study_year: { from: null, to: input.studyYear } }
        });
        return newId;
      });
      logger.child('student').info('student.education_history.added', { studentId });
      const row = await db.queryOne<EduHistoryRow>(
        `SELECT h.id, h.student_id, h.study_year, h.school_name, h.level, h.notes, h.created_by, h.created_at,
                (SELECT st2.full_name FROM staff st2 WHERE st2.id = h.created_by) AS created_by_name
           FROM student_education_history h WHERE h.id = ?`,
        [entryId]
      );
      return rowToEducationHistory(row as EduHistoryRow);
    },

    async deleteEducationHistory(studentId: string, entryId: string, actor: AuthContext): Promise<void> {
      await db.transaction(async (tx) => {
        const row = await tx.queryOne<{ id: string; study_year: string }>(
          `SELECT id, study_year FROM student_education_history WHERE id = ? AND student_id = ?`,
          [entryId, studentId]
        );
        if (!row) throw new NotFoundError('سابقهٔ تحصیلی');
        await tx.execute(`DELETE FROM student_education_history WHERE id = ?`, [entryId]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.education_history.delete',
          resourceType: 'student',
          resourceId: studentId,
          changes: { entry_id: { from: entryId, to: null }, study_year: { from: row.study_year, to: null } }
        });
      });
      logger.child('student').info('student.education_history.deleted', { studentId });
    },

    async listStudentTeachers(studentId: string): Promise<StudentTeacher[]> {
      const student = await db.queryOne<{ id: string }>(`SELECT id FROM students WHERE id = ?`, [studentId]);
      if (!student) throw new NotFoundError('دانش‌آموز');
      const rows = await db.query<StudentTeacherRow>(
        `SELECT id, student_id, name, class_label, contact, created_at
           FROM student_teachers WHERE student_id = ? ORDER BY created_at, rowid`,
        [studentId]
      );
      return rows.map(rowToStudentTeacher);
    },

    async addStudentTeacher(studentId: string, input: NewStudentTeacherInput, actor: AuthContext): Promise<StudentTeacher> {
      const name = input.name.replace(/\s+/g, ' ').trim();
      if (name.length < 2 || name.length > 120) {
        throw new ValidationError('نام معلم الزامی است (۲ تا ۱۲۰ نویسه)');
      }
      const classLabel = input.classLabel?.replace(/\s+/g, ' ').trim().slice(0, 120) || null;
      const contact = input.contact?.trim().slice(0, 60) || null;
      const teacherId = await db.transaction(async (tx) => {
        const student = await tx.queryOne<{ id: string }>(`SELECT id FROM students WHERE id = ?`, [studentId]);
        if (!student) throw new NotFoundError('دانش‌آموز');
        const dup = await tx.queryOne<{ id: string }>(
          `SELECT id FROM student_teachers WHERE student_id = ? AND name = ?`,
          [studentId, name]
        );
        if (dup) throw new ConflictError('این معلم قبلاً روی پرونده ثبت شده است');
        const newId = crypto.randomUUID();
        await tx.execute(
          `INSERT INTO student_teachers (id, student_id, name, class_label, contact) VALUES (?, ?, ?, ?, ?)`,
          [newId, studentId, name, classLabel, contact]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.teachers.add',
          resourceType: 'student',
          resourceId: studentId,
          changes: { teacher_id: { from: null, to: newId }, name: { from: null, to: name } }
        });
        return newId;
      });
      logger.child('student').info('student.teachers.added', { studentId });
      const row = await db.queryOne<StudentTeacherRow>(
        `SELECT id, student_id, name, class_label, contact, created_at FROM student_teachers WHERE id = ?`,
        [teacherId]
      );
      return rowToStudentTeacher(row as StudentTeacherRow);
    },

    async deleteStudentTeacher(studentId: string, teacherId: string, actor: AuthContext): Promise<void> {
      await db.transaction(async (tx) => {
        const row = await tx.queryOne<{ id: string; name: string }>(
          `SELECT id, name FROM student_teachers WHERE id = ? AND student_id = ?`,
          [teacherId, studentId]
        );
        if (!row) throw new NotFoundError('معلم');
        await tx.execute(`DELETE FROM student_teachers WHERE id = ?`, [teacherId]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.teachers.delete',
          resourceType: 'student',
          resourceId: studentId,
          changes: { teacher_id: { from: teacherId, to: null }, name: { from: row.name, to: null } }
        });
      });
      logger.child('student').info('student.teachers.deleted', { studentId });
    }
  };
  return service;
}
