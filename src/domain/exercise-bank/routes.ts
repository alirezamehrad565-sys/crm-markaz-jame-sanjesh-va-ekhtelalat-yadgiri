import type { AppHono } from '@core/shared';
import { CreateExerciseBatchSchema, NewExercisePackageSchema, NewExerciseSchema, ReassignExerciseSchema, ReplaceExerciseFileSchema, ReplaceStudentFocusSchema, UpdateExercisePackageSchema, UpdateExerciseSchema, UuidSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { NotFoundError, ValidationError } from '@core/errors';
import type { ExerciseBankService, ListExercisesFilters } from './types';
import { buildTaxonomyTree } from './focus'; // درخت واحد طبقه‌بندی
import { parseMultipartStream } from './multipart';
import type { SendResult } from '@core/notify/types';
import type { BaleApiResponse, SendDocumentOptions } from '@core/notify/bale/documents';

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

function downloadHeaders(filename: string, mimeType: string, inline: boolean): Record<string, string> {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const type = mimeType === 'text/html' ? 'text/html; charset=utf-8' : mimeType;
  return {
    'Content-Type': type,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  };
}

export function registerExerciseBankRoutes(app: AppHono, service: ExerciseBankService): void {
  app.get('/api/exercises/meta', async (c) => {
    const categories = await service.categories();
    const facets = await service.facets();
    const focusFacets = await service.focusFacets(); // شمارندهٔ درخت هدف
    const disorderFacets = await service.disorderFacets(); // شمارندهٔ خانواده‌های اختلال
    const gradeFacets = await service.gradeFacets(); // شمارندهٔ دوره‌های پایه تحصیلی
    // درخت واحد طبقه‌بندی: چهار ستون در یک payload
    // کلیدهای legacy (focusTree/disorderTree) حذف شدند — از هیچ‌جا خوانده نمی‌شدند
    const taxonomyTree = buildTaxonomyTree({ disorderTags: categories.disorder ?? [], gradeTags: categories.grade ?? [] });
    return c.json({ data: { storage: service.storageName, limits: service.limits, categories, facets, focusFacets: focusFacets.counts, disorderFacets: disorderFacets.counts, gradeFacets: gradeFacets.counts, taxonomyTree } }, 200);
  });

  app.get('/api/exercises', async (c) => {
    const actor = getAuthContext(c);
    const tagIds = (c.req.query('tag_ids') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const focusKeys = (c.req.query('focus') ?? '') // فیلتر هدفمند (کلید ستون/حوزه/مهارت)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const disorderKeys = (c.req.query('disorder') ?? '') // ستون اختلال‌ها (کلید خانواده یا شناسهٔ برچسب)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const gradeKeys = (c.req.query('grade') ?? '') // ستون پایه تحصیلی (کلید دوره یا شناسهٔ برچسب)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const result = await service.list(
      {
        q: c.req.query('q') || undefined,
        tagId: c.req.query('tag_id') || undefined,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
        focus: focusKeys.length > 0 ? focusKeys : undefined,
        disorder: disorderKeys.length > 0 ? disorderKeys : undefined,
        grade: gradeKeys.length > 0 ? gradeKeys : undefined,
        format: (c.req.query('format') || undefined) as ListExercisesFilters['format'] | undefined, // 
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
        focus: body.focus ?? [], // پیوند کارت به درخت هدف
        coCreatedBy: body.co_created_by ?? null,
        published: body.published,
        file: body.file
          ? { filename: body.file.filename, mimeType: body.file.mime_type, contentB64: body.file.content_b64 }
          : null
      },
      actor
    );
    return c.json({ data: created }, 201);
  });

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

  app.post('/api/exercises/assignments/:id/grade', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ feedback?: string }>();
    const record = await service.gradeAssignment(UuidSchema.parse(c.req.param('id')), { feedback: body.feedback ?? '' }, actor);
    return c.json({ data: record }, 200);
  });

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
        focus: body.focus, // جایگزینی پیوندهای هدف (undefined = بدون تغییر)
        coCreatedBy: body.co_created_by,
        published: body.published
      },
      actor
    );
    return c.json({ data: updated }, 200);
  });

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

  app.get('/api/exercises/:id/assignments', async (c) => {
    const items = await service.listAssignments({
      exerciseId: c.req.param('id'),
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined
    });
    return c.json({ data: items }, 200);
  });

  app.get('/api/students/:id/exercises/suggest', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const suggestions = await service.suggestForStudent(UuidSchema.parse(c.req.param('id')));
    return c.json({ data: suggestions }, 200);
  });

  // درخت هدف در پروفایل دانش‌آموز؛ الگوی دسترسی = برچسب‌های دانش‌آموز (GET باز، نوشتن با گیت سراسری)
  app.get('/api/students/:id/focus', async (c) => {
    const keys = await service.focusForStudent(UuidSchema.parse(c.req.param('id')));
    return c.json({ data: keys }, 200);
  });

  app.put('/api/students/:id/focus', async (c) => {
    const actor = getAuthContext(c);
    const body = ReplaceStudentFocusSchema.parse(await c.req.json<unknown>());
    const keys = await service.replaceFocusForStudent(UuidSchema.parse(c.req.param('id')), body.focus_keys, actor);
    return c.json({ data: keys }, 200);
  });

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

  app.get('/api/students/:id/exercises/batches', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const studentId = UuidSchema.parse(c.req.param('id'));
    const items = await service.listBatches({
      studentId,
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined
    });
    return c.json({ data: items }, 200);
  });

  app.post('/api/exercises/batches/:id/send', requireRole('manager', 'therapist', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ note?: string | null }>().catch(() => ({ note: null }));
    const result = await service.sendBatch(UuidSchema.parse(c.req.param('id')), { note: body?.note ?? null }, actor);
    return c.json({ data: result }, 200);
  });
}

/** ارسال مستند به بله با multipart/form-data — : از core/notify/bale/documents به اینجا منتقل شد
 * (هم فرانت پنل و هم سیم‌کشی فایل‌های تمرین از همین نقطه استفاده می‌کنند) */
export async function sendBaleDocument(options: SendDocumentOptions): Promise<SendResult> {
  const base = (options.apiBase ?? 'https://tapi.bale.ai').replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${base}/bot${options.token}/sendDocument`;

  try {
    const form = new FormData();
    form.append('chat_id', options.chatId);
    if (options.caption) form.append('caption', options.caption);
    form.append(
      'document',
      new File([options.bytes.slice().buffer as ArrayBuffer], options.filename, {
        type: options.mime ?? 'application/octet-stream'
      })
    );

    const res = await doFetch(url, { method: 'POST', body: form });
    const body = (await res.json().catch(() => ({}))) as BaleApiResponse;

    if (!res.ok || body.ok === false) {
      return {
        ok: false,
        error: `BALE_${res.status}: ${body.description ?? 'unknown error'}`
      };
    }

    const messageId = body.result?.message_id;
    return {
      ok: true,
      externalId: messageId != null ? String(messageId) : undefined
    };
  } catch (err) {
    return {
      ok: false,
      error: `BALE_NETWORK: ${err instanceof Error ? err.message : 'unknown'}`
    };
  }
}
