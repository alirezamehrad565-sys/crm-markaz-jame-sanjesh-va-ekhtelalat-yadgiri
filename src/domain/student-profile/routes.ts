import type { AppHono, SchoolKind } from '@core/shared';
import { ChangeCaseStatusSchema, ChangeOwnerSchema, ChangePathwaySchema, ChangeSpecialNeedSchema, NewClassSchema, NewEducationHistorySchema, NewSchoolSchema, NewStudentSchema, UpdateClassSchema, UpdateSchoolSchema, UpdateStudentSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { NotFoundError } from '@core/errors';
import { normalizeNationalId } from '@core/shared';
import { pageParams } from '@app/http';
import { z } from 'zod';
import type { StudentProfileService } from './types';

const StudentTeacherSchema = z.object({
  name: z.string().min(2, 'نام معلم الزامی است (۲ تا ۱۲۰ نویسه)').max(120, 'نام معلم حداکثر ۱۲۰ نویسه است'),
  class_label: z.string().max(120).optional(),
  contact: z.string().max(60).optional()
});

export function registerRoutes(app: AppHono, service: StudentProfileService): void {

  app.post('/api/schools', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewSchoolSchema.parse(await c.req.json<unknown>());
    const school = await service.createSchool(
      { name: body.name, kind: body.kind, genderType: body.gender_type, phone: body.phone, address: body.address, principalName: body.principal_name, principalPhone: body.principal_phone, code: body.code, notes: body.notes },
      actor
    );
    return c.json({ data: school }, 201);
  });

  app.get('/api/schools', async (c) => {
    const kind = c.req.query('kind') as SchoolKind | undefined;
    const activeRaw = c.req.query('active');
    const schools = await service.listSchools({
      kind,
      active: activeRaw === undefined ? undefined : activeRaw === 'true'
    });
    return c.json({ data: schools }, 200);
  });

  app.get('/api/schools/:id', async (c) => {
    const school = await service.getSchoolById(c.req.param('id'));
    if (!school) throw new NotFoundError('مدرسه');
    return c.json({ data: school }, 200);
  });

  app.patch('/api/schools/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateSchoolSchema.parse(await c.req.json<unknown>());
    const school = await service.updateSchool(
      c.req.param('id'),
      { name: body.name, kind: body.kind, genderType: body.gender_type, phone: body.phone, address: body.address, principalName: body.principal_name, principalPhone: body.principal_phone, code: body.code, notes: body.notes },
      actor
    );
    return c.json({ data: school }, 200);
  });

  app.post('/api/schools/:id/deactivate', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const school = await service.deactivateSchool(c.req.param('id'), actor);
    return c.json({ data: school }, 200);
  });

  app.delete('/api/schools/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    await service.deleteSchool(c.req.param('id'), actor);
    return c.body(null, 204);
  });

  app.post('/api/classes', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewClassSchema.parse(await c.req.json<unknown>());
    const cls = await service.createClass(
      { schoolId: body.school_id, name: body.name, teacherName: body.teacher_name, teacherPhone: body.teacher_phone },
      actor
    );
    return c.json({ data: cls }, 201);
  });

  app.get('/api/classes', async (c) => {
    const activeRaw = c.req.query('active');
    const classes = await service.listClasses({
      schoolId: c.req.query('school_id') || undefined,
      active: activeRaw === undefined ? undefined : activeRaw === 'true'
    });
    return c.json({ data: classes }, 200);
  });

  app.get('/api/classes/:id', async (c) => {
    const cls = await service.getClassById(c.req.param('id'));
    if (!cls) throw new NotFoundError('کلاس');
    return c.json({ data: cls }, 200);
  });

  app.patch('/api/classes/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateClassSchema.parse(await c.req.json<unknown>());
    const cls = await service.updateClass(
      c.req.param('id'),
      { name: body.name, teacherName: body.teacher_name, teacherPhone: body.teacher_phone },
      actor
    );
    return c.json({ data: cls }, 200);
  });

  app.post('/api/classes/:id/deactivate', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const cls = await service.deactivateClass(c.req.param('id'), actor);
    return c.json({ data: cls }, 200);
  });

  app.delete('/api/classes/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    await service.deleteClass(c.req.param('id'), actor);
    return c.body(null, 204);
  });

  app.post('/api/students', async (c) => {
    const actor = getAuthContext(c);
    const body = NewStudentSchema.parse(await c.req.json<unknown>());
    const ownerStaffId = actor.role === 'therapist' ? actor.staffId : body.owner_staff_id;
    const archived = actor.role === 'therapist' ? false : body.archived;
    const student = await service.createStudent(
      {
        nationalId: body.national_id,
        firstName: body.first_name,
        lastName: body.last_name,
        birthDate: body.birth_date,
        gender: body.gender,
        grade: body.grade,
        schoolId: body.school_id,
        classId: body.class_id,
        guardianName: body.guardian_name,
        guardianRelation: body.guardian_relation,
        guardianPhone: body.guardian_phone,
        ownerStaffId,
        archived,
        pathway: body.pathway
      },
      actor
    );
    return c.json({ data: student }, 201);
  });

  app.get('/api/students', async (c) => {
    const actor = getAuthContext(c);
    const { page, pageSize } = pageParams(c.req.query() as Record<string, string | undefined>);
    const staffScope = actor.role === 'therapist' ? actor.staffId : undefined;
    const ownerRaw = c.req.query('owner_id') || undefined;
    const ownerId = actor.role === 'therapist' ? undefined : (ownerRaw && /^[0-9a-f-]{36}$/i.test(ownerRaw) ? ownerRaw : undefined);
    const result = await service.searchStudents({
      query: c.req.query('query'),
      schoolId: c.req.query('school_id'),
      grade: c.req.query('grade'),
      tagId: c.req.query('tag_id') || undefined,
      active: c.req.query('active') === undefined ? undefined : c.req.query('active') === 'true',
      ownerId,
      staffScope,
      page,
      pageSize
    });
    return c.json(
      {
        data: result.items,
        meta: { page, pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / pageSize)) }
      },
      200
    );
  });

  app.get('/api/students/by-national-id/:nationalId', async (c) => {
    const nationalId = normalizeNationalId(c.req.param('nationalId'));
    const student = await service.getStudentByNationalId(nationalId);
    if (!student) throw new NotFoundError('دانش‌آموز');
    return c.json({ data: student }, 200);
  });

  app.get('/api/students/:id', async (c) => {
    const student = await service.getStudentById(c.req.param('id'));
    if (!student) throw new NotFoundError('دانش‌آموز');
    return c.json({ data: student }, 200);
  });

  app.patch('/api/students/:id', async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateStudentSchema.parse(await c.req.json<unknown>());
    const student = await service.updateStudent(
      c.req.param('id'),
      {
        firstName: body.first_name,
        lastName: body.last_name,
        birthDate: body.birth_date,
        gender: body.gender,
        grade: body.grade,
        schoolId: body.school_id,
        classId: body.class_id,
        guardianName: body.guardian_name,
        guardianRelation: body.guardian_relation,
        guardianPhone: body.guardian_phone,
        nationalId: body.national_id
      },
      actor
    );
    return c.json({ data: student }, 200);
  });

  app.post('/api/students/:id/deactivate', async (c) => {
    const actor = getAuthContext(c);
    const student = await service.deactivateStudent(c.req.param('id'), actor);
    return c.json({ data: student }, 200);
  });

  app.post('/api/students/:id/activate', async (c) => {
    const actor = getAuthContext(c);
    const student = await service.activateStudent(c.req.param('id'), actor);
    return c.json({ data: student }, 200);
  });

  app.delete('/api/students/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    await service.deleteStudent(c.req.param('id'), actor);
    return c.body(null, 204);
  });

  app.patch('/api/students/:id/case-status', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = ChangeCaseStatusSchema.parse(await c.req.json<unknown>());
    const student = await service.changeCaseStatus(c.req.param('id'), body.case_status, actor);
    return c.json({ data: student }, 200);
  });

  app.patch('/api/students/:id/pathway', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = ChangePathwaySchema.parse(await c.req.json<unknown>());
    if (actor.role === 'therapist') {
      const owned = await service.getStudentById(c.req.param('id'));
      if (!owned) throw new NotFoundError('دانش‌آموز');
      if (owned.ownerStaffId !== actor.staffId) throw new NotFoundError('دانش‌آموز');
    }
    const student = await service.changePathway(c.req.param('id'), body.pathway, actor);
    return c.json({ data: student }, 200);
  });

  app.patch('/api/students/:id/owner', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = ChangeOwnerSchema.parse(await c.req.json<unknown>());
    const student = await service.changeOwner(c.req.param('id'), body.owner_staff_id, actor);
    return c.json({ data: student }, 200);
  });

  app.patch('/api/students/:id/special-need', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = ChangeSpecialNeedSchema.parse(await c.req.json<unknown>());
    const student = await service.changeSpecialNeed(
      c.req.param('id'),
      {
        specialNeedType: body.special_need_type,
        specialNeedSeverity: body.special_need_severity,
        identifiedAt: body.identified_at
      },
      actor
    );
    return c.json({ data: student }, 200);
  });

  app.get('/api/students/:id/appointments', async (c) => {
    const items = await service.listStudentAppointments(c.req.param('id'), {
      from: c.req.query('from') || undefined,
      to: c.req.query('to') || undefined,
      limit: c.req.query('limit') ? Number.parseInt(c.req.query('limit')!, 10) : undefined
    });
    return c.json({ data: items }, 200);
  });

  app.get('/api/students/:id/education-history', async (c) => {
    const items = await service.listEducationHistory(c.req.param('id'));
    return c.json({ data: items }, 200);
  });

  app.post('/api/students/:id/education-history', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewEducationHistorySchema.parse(await c.req.json<unknown>());
    const entry = await service.addEducationHistory(
      c.req.param('id'),
      { studyYear: body.study_year, schoolName: body.school_name, level: body.level, notes: body.notes },
      actor
    );
    return c.json({ data: entry }, 201);
  });

  app.delete('/api/students/:id/education-history/:entryId', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    await service.deleteEducationHistory(c.req.param('id'), c.req.param('entryId'), actor);
    return c.body(null, 204);
  });

  app.get('/api/students/:id/teachers', async (c) => {
    const items = await service.listStudentTeachers(c.req.param('id'));
    return c.json({ data: items }, 200);
  });

  app.post('/api/students/:id/teachers', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    const body = StudentTeacherSchema.parse(await c.req.json<unknown>());
    const item = await service.addStudentTeacher(
      c.req.param('id'),
      { name: body.name, classLabel: body.class_label, contact: body.contact },
      actor
    );
    return c.json({ data: item }, 201);
  });

  app.delete('/api/students/:id/teachers/:teacherId', requireRole('manager', 'secretary', 'therapist'), async (c) => {
    const actor = getAuthContext(c);
    await service.deleteStudentTeacher(c.req.param('id'), c.req.param('teacherId'), actor);
    return c.body(null, 204);
  });
}
