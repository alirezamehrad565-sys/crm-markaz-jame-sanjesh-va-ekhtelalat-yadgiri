/**
 * ماژول بانک تمرین — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// REST endpoints بانک تمرین — بدون business logic، فقط سیم به سرویس
// RBAC: خواندن برای همهٔ کارکنان؛ نوشتن (ساخت/ویرایش/حذف/فایل) برای هر سه نقش مرکز
// + گارد سرویس (assertStaffRole) — الگوی دولایه.
// مسیر عمومی /public/exercise-files/:id در api-routing (قبل از authMiddleware) رجیستر می‌شود.

import type { AppHono } from '@core/shared';
import { CreateExerciseBatchSchema, NewExercisePackageSchema, NewExerciseSchema, ReassignExerciseSchema, ReplaceExerciseFileSchema, UpdateExercisePackageSchema, UpdateExerciseSchema, UuidSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { NotFoundError, ValidationError } from '@core/errors';
import type { ExerciseBankService } from './types';
import { parseMultipartStream } from './multipart';

/** — MIME از پسوند برای مرورگرهایی که نوع خالی می‌دهند (.mkv/.avi/…) */
const EXT_MIME_FALLBACK: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
  wmv: 'video/x-ms-wmv',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  txt: 'text/plain',
  csv: 'text/csv',
  html: 'text/html',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function guessMime(filename: string, declared: string): string {
  const t = (declared || '').toLowerCase();
  if (t && t !== 'application/octet-stream') return t;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME_FALLBACK[ext] ?? t ?? 'application/octet-stream';
}

/** Content-Disposition امن با نام فایل UTF-8 */
function downloadHeaders(filename: string, mimeType: string, inline: boolean): Record<string, string> {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const type = mimeType === 'text/html' ? 'text/html; charset=utf-8' : mimeType;
  return {
    'Content-Type': type,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  };
}

export function registerExerciseBankRoutes(app: AppHono, service: ExerciseBankService): void {
  // ─── meta — قبل از مسیر:id تا با پارامتر اشتباه نشود ───
  app.get('/api/exercises/meta', async (c) => {
    const categories = await service.categories();
    // شمارش تمرین هر برچسب برای کاشی‌های دستهٔ اختلال (ناوبری تو در تو)
    const facets = await service.facets();
    return c.json({ data: { storage: service.storageName, limits: service.limits, categories, facets } }, 200);
  });

  // ─── فهرست + ساخت ───
  app.get('/api/exercises', async (c) => {
    const actor = getAuthContext(c);
    // tag_ids جداشده با ویرگول: فیلتر AND چندبرچسبی (اختلال + پایه)
    const tagIds = (c.req.query('tag_ids') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const result = await service.list(
      {
        q: c.req.query('q') || undefined,
        tagId: c.req.query('tag_id') || undefined,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
        publishedOnly: c.req.query('published') === undefined ? undefined : c.req.query('published') === 'true',
        page: c.req.query('page') ? Number(c.req.query('page')) : undefined,
        pageSize: c.req.query('page_size') ? Number(c.req.query('page_size')) : undefined
      },
      actor
    );
    return c.json({ data: result }, 200);
  });

  app.post('/api/exercises', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewExerciseSchema.parse(await c.req.json<unknown>());
    const created = await service.create(
      {
        title: body.title,
        description: body.description ?? null,
        format: body.format,
        externalUrl: body.external_url ?? null,
        tagIds: body.tag_ids ?? [],
        published: body.published,
        file: body.file
          ? { filename: body.file.filename, mimeType: body.file.mime_type, contentB64: body.file.content_b64 }
          : null
      },
      actor
    );
    return c.json({ data: created }, 201);
  });

  // ─── بازگشتی‌ها (پنل) — قبل از:id تا با پارامتر اشتباه نشود ───
  app.get('/api/exercises/submissions', async (c) => {
    const studentId = c.req.query('student_id') || undefined;
    if (studentId) UuidSchema.parse(studentId);
    const assignmentId = c.req.query('assignment_id') || undefined;
    if (assignmentId) UuidSchema.parse(assignmentId);
    const items = await service.listSubmissions({
      studentId,
      assignmentId,
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined
    });
    return c.json({ data: items }, 200);
  });

  app.get('/api/exercises/submissions/:id/file', async (c) => {
    const file = await service.getSubmissionFile(UuidSchema.parse(c.req.param('id')));
    if (!file) throw new NotFoundError('فایل بازگشتی');
    return new Response(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: downloadHeaders(file.filename, file.mime, false)
    });
  });

  // ─── c — تصحیح تکلیف (وضعیت + بازخورد متنی؛ اعلان خانواده از ناظر) ───
  app.post('/api/exercises/assignments/:id/grade', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ feedback?: string }>();
    const record = await service.gradeAssignment(UuidSchema.parse(c.req.param('id')), { feedback: body.feedback ?? '' }, actor);
    return c.json({ data: record }, 200);
  });

  // ═══════ — بسته‌های تمرینی ═══════

  app.get('/api/exercises/packages', async (c) => {
    const actor = getAuthContext(c);
    const result = await service.listPackages(
      {
        q: c.req.query('q') || undefined,
        tagId: c.req.query('tag_id') || undefined,
        publishedOnly: c.req.query('published') === undefined ? undefined : c.req.query('published') === 'true',
        page: c.req.query('page') ? Number(c.req.query('page')) : undefined,
        pageSize: c.req.query('page_size') ? Number(c.req.query('page_size')) : undefined
      },
      actor
    );
    return c.json({ data: result }, 200);
  });

  app.post('/api/exercises/packages', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewExercisePackageSchema.parse(await c.req.json<unknown>());
    const created = await service.createPackage(
      {
        title: body.title,
        description: body.description ?? null,
        exerciseIds: body.exercise_ids,
        tagIds: body.tag_ids ?? [],
        published: body.published
      },
      actor
    );
    return c.json({ data: created }, 201);
  });

  app.get('/api/exercises/packages/:id', async (c) => {
    const pkg = await service.getPackageById(UuidSchema.parse(c.req.param('id')));
    if (!pkg) throw new NotFoundError('بستهٔ تمرینی');
    return c.json({ data: pkg }, 200);
  });

  app.patch('/api/exercises/packages/:id', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateExercisePackageSchema.parse(await c.req.json<unknown>());
    const updated = await service.updatePackage(
      UuidSchema.parse(c.req.param('id')),
      {
        title: body.title,
        description: body.description,
        exerciseIds: body.exercise_ids,
        tagIds: body.tag_ids,
        published: body.published
      },
      actor
    );
    return c.json({ data: updated }, 200);
  });

  app.delete('/api/exercises/packages/:id', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    await service.softDeletePackage(UuidSchema.parse(c.req.param('id')), actor);
    return c.json({ data: { ok: true } }, 200);
  });

  // ─── یک تمرین ───
  app.get('/api/exercises/:id', async (c) => {
    const exercise = await service.getById(c.req.param('id'));
    if (!exercise) throw new NotFoundError('تمرین');
    return c.json({ data: exercise }, 200);
  });

  app.patch('/api/exercises/:id', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateExerciseSchema.parse(await c.req.json<unknown>());
    const updated = await service.update(
      c.req.param('id'),
      {
        title: body.title,
        description: body.description,
        format: body.format,
        externalUrl: body.external_url,
        tagIds: body.tag_ids,
        published: body.published
      },
      actor
    );
    return c.json({ data: updated }, 200);
  });

  // — m140: انتقال مالکیت تمرین — فقط مدیر (ویرایش ساده دیگر owner_staff_id نمی‌پذیرد؛ درس 43-A)
  // پاسخ: تغییر → { data } ، بدون‌عمل (مالک از قبل همان) → { data, unchanged: true }
  app.post('/api/exercises/:id/reassign', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = ReassignExerciseSchema.parse(await c.req.json<unknown>());
    const result = await service.reassign(
      UuidSchema.parse(c.req.param('id')),
      { staffId: body.staffId, reason: body.reason ?? null },
      actor
    );
    return result.unchanged
      ? c.json({ data: result.record, unchanged: true }, 200)
      : c.json({ data: result.record }, 200);
  });

  app.delete('/api/exercises/:id', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    await service.softDelete(c.req.param('id'), actor);
    return c.json({ data: { ok: true } }, 200);
  });

  // ─── فایل ───
  app.put('/api/exercises/:id/file', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = ReplaceExerciseFileSchema.parse(await c.req.json<unknown>());
    const updated = await service.putFile(
      c.req.param('id'),
      { filename: body.filename, mimeType: body.mime_type, contentB64: body.content_b64 },
      actor
    );
    return c.json({ data: updated }, 200);
  });

  app.get('/api/exercises/:id/file', async (c) => {
    const file = await service.getFile(c.req.param('id'));
    if (!file) throw new NotFoundError('فایل تمرین');
    return new Response(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: downloadHeaders(file.filename, file.mime, false)
    });
  });

  // ─── پیوست‌های چندگانه (multipart پخش‌جریانی — بدون formData و بدون OOM) ───
  app.post('/api/exercises/:id/files', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const contentType = c.req.header('content-type') ?? '';
    const parsed = await parseMultipartStream(c.req.raw.body as ReadableStream<Uint8Array>, contentType);
    if (parsed.files.length === 0) throw new ValidationError('حداقل یک فایل لازم است');
    const files = parsed.files
      .filter((f) => f.size > 0)
      .map((f) => ({
        filename: f.filename || 'file',
        mimeType: guessMime(f.filename ?? '', f.mimeType ?? ''),
        segments: f.segments,
        size: f.size
      }));
    if (files.length === 0) throw new ValidationError('محتوای فایل‌ها خالی است');
    const updated = await service.addFiles(id, files, actor);
    return c.json({ data: updated }, 201);
  });

  // ─── بارگذاری پیوستهٔ فایل‌های بزرگ (هر تکه یک درخواست کوچک — امن با سقف CPU) ───
  app.post('/api/exercises/:id/files/begin', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const body = await c.req.json<{ filename?: string; mime?: string; mime_type?: string; size?: number }>();
    const result = await service.beginChunkedUpload(
      id,
      {
        filename: String(body.filename ?? 'file'),
        mimeType: String(body.mime ?? body.mime_type ?? 'application/octet-stream'),
        size: Number(body.size ?? 0)
      },
      actor
    );
    return c.json({ data: result }, 201);
  });

  app.put('/api/exercises/:id/files/:fileId/chunks/:seq', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const seq = Number(c.req.param('seq'));
    const buf = await c.req.arrayBuffer();
    const result = await service.putUploadChunk(id, fileId, seq, new Uint8Array(buf), actor);
    return c.json({ data: result }, 200);
  });

  app.post('/api/exercises/:id/files/:fileId/complete', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const updated = await service.completeChunkedUpload(id, fileId, actor);
    return c.json({ data: updated }, 200);
  });

  app.get('/api/exercises/:id/files/:fileId', async (c) => {
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const file = await service.getAttachmentFile(id, fileId);
    if (!file) throw new NotFoundError('فایل تمرین');
    return new Response(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: downloadHeaders(file.filename, file.mime, false)
    });
  });

  app.delete('/api/exercises/:id/files/:fileId', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const updated = await service.deleteAttachment(id, fileId, actor);
    return c.json({ data: updated }, 200);
  });

  // ─── تکلیف‌های یک تمرین (پنل) ───
  app.get('/api/exercises/:id/assignments', async (c) => {
    const items = await service.listAssignments({
      exerciseId: c.req.param('id'),
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined
    });
    return c.json({ data: items }, 200);
  });

  // ═══════ — پیشنهاد برچسب‌محور + بستهٔ تکلیف (پروفایل دانش‌آموز) ═══════

  /** پیشنهاد تمرین/بستهٔ مناسب بر اساس برچسب‌های دانش‌آموز */
  app.get('/api/students/:id/exercises/suggest', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const suggestions = await service.suggestForStudent(UuidSchema.parse(c.req.param('id')));
    return c.json({ data: suggestions }, 200);
  });

  /** ساخت بستهٔ تکلیف (بدون ارسال) — ارسال با POST /api/exercises/batches/:id/send */
  app.post('/api/students/:id/exercises/batches', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const studentId = UuidSchema.parse(c.req.param('id'));
    const body = CreateExerciseBatchSchema.parse(await c.req.json<unknown>());
    const batch = await service.createBatch(
      {
        studentId,
        packageId: body.package_id ?? null,
        exerciseIds: body.exercise_ids ?? [],
        note: body.note ?? null,
        assignedBy: actor.staffId,
        via: 'panel'
      },
      actor
    );
    return c.json({ data: batch }, 201);
  });

  /** فهرست بسته‌های تکلیف دانش‌آموز — تب «تمرین‌ها»ی پروفایل */
  app.get('/api/students/:id/exercises/batches', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const studentId = UuidSchema.parse(c.req.param('id'));
    const items = await service.listBatches({
      studentId,
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined
    });
    return c.json({ data: items }, 200);
  });

  /** ارسال/یادآوری بستهٔ تکلیف به چت ولیّ‌ها با لینک امن دانلود */
  app.post('/api/exercises/batches/:id/send', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ note?: string | null }>().catch(() => ({ note: null }));
    const result = await service.sendBatch(UuidSchema.parse(c.req.param('id')), { note: body?.note ?? null }, actor);
    return c.json({ data: result }, 200);
  });
}
