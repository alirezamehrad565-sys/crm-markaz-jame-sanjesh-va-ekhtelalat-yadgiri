import type { AppHono } from '@core/shared';
import {
  ClearbookCaptionSchema,
  ClearbookCopyYearSchema,
  ClearbookEntryCreateSchema,
  ClearbookEntryUpdateSchema,
  ClearbookPlanCreateSchema,
  ClearbookPlanReorderSchema,
  ClearbookPlanUpdateSchema,
  ClearbookSeedTemplateSchema,
  UuidSchema
} from '@core/shared';
import { NotFoundError, ValidationError } from '@core/errors';
import { getAuthContext, requireRole } from '@core/auth';
import { parseMultipartStream } from '@domain/exercise-bank/multipart';
import type { ClearbookService } from './types';

// ─── کلر بوک مرکز: مسیرها (همه فقط مدیر/منشی) ───

const EXT_MIME_FALLBACK: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  txt: 'text/plain',
  csv: 'text/csv',
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

function fileHeaders(filename: string, mimeType: string, inline: boolean): Record<string, string> {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const type = mimeType.startsWith('text/') ? `${mimeType}; charset=utf-8` : mimeType;
  return {
    'Content-Type': type,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  };
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function optYmd(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!YMD_RE.test(raw)) throw new ValidationError('بازهٔ تاریخ نامعتبر است');
  return raw;
}

export function registerClearbookRoutes(app: AppHono, service: ClearbookService): void {
  const office = requireRole('manager', 'secretary');

  // ─── رویدادها ───

  app.get('/api/clearbook/entries', office, async (c) => {
    const q = c.req.query();
    const result = await service.listEntries({
      from: optYmd(q.from),
      to: optYmd(q.to),
      tag: q.tag || undefined,
      q: q.q || undefined,
      planId: q.plan_id ? UuidSchema.parse(q.plan_id) : undefined,
      limit: Number(q.limit ?? 0) || 50,
      offset: Math.max(0, Number(q.offset ?? 0) || 0)
    });
    return c.json({ data: result.items, meta: { hasMore: result.hasMore } }, 200);
  });

  app.post('/api/clearbook/entries', office, async (c) => {
    const actor = getAuthContext(c);
    const body = ClearbookEntryCreateSchema.parse(await c.req.json<unknown>());
    const result = await service.createEntry(
      {
        title: body.title,
        body: body.body ?? '',
        eventDate: body.event_date,
        planId: body.plan_id ?? null,
        tags: body.tags ?? []
      },
      actor
    );
    return c.json({ data: result }, 201);
  });

  app.patch('/api/clearbook/entries/:id', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const body = ClearbookEntryUpdateSchema.parse(await c.req.json<unknown>());
    const result = await service.updateEntry(
      id,
      {
        title: body.title,
        body: body.body,
        eventDate: body.event_date,
        planId: body.plan_id,
        tags: body.tags
      },
      actor
    );
    return c.json({ data: result }, 200);
  });

  app.delete('/api/clearbook/entries/:id', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const result = await service.removeEntry(id, actor);
    return c.json({ data: result }, 200);
  });

  // ─── پیوست‌ها ───

  app.post('/api/clearbook/entries/:id/files', office, async (c) => {
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

  app.post('/api/clearbook/entries/:id/files/begin', office, async (c) => {
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

  app.put('/api/clearbook/entries/:id/files/:fileId/chunks/:seq', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const seq = Number(c.req.param('seq'));
    const buf = await c.req.arrayBuffer();
    const result = await service.putUploadChunk(id, fileId, seq, new Uint8Array(buf), actor);
    return c.json({ data: result }, 200);
  });

  app.post('/api/clearbook/entries/:id/files/:fileId/complete', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const updated = await service.completeChunkedUpload(id, fileId, actor);
    return c.json({ data: updated }, 200);
  });

  app.patch('/api/clearbook/entries/:id/files/:fileId', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const body = ClearbookCaptionSchema.parse(await c.req.json<unknown>());
    const updated = await service.updateAttachmentCaption(id, fileId, body.caption, actor);
    return c.json({ data: updated }, 200);
  });

  app.get('/api/clearbook/entries/:id/files/:fileId', office, async (c) => {
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const file = await service.getAttachmentFile(id, fileId);
    if (!file) throw new NotFoundError('فایل رویداد');
    return new Response(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: fileHeaders(file.filename, file.mime, file.kind === 'image')
    });
  });

  app.delete('/api/clearbook/entries/:id/files/:fileId', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const updated = await service.deleteAttachment(id, fileId, actor);
    return c.json({ data: updated }, 200);
  });

  // ─── تقویم اجرایی ───

  app.get('/api/clearbook/plans', office, async (c) => {
    const items = await service.listPlans();
    return c.json({ data: items }, 200);
  });

  app.post('/api/clearbook/plans', office, async (c) => {
    const actor = getAuthContext(c);
    const body = ClearbookPlanCreateSchema.parse(await c.req.json<unknown>());
    const result = await service.createPlan(
      {
        title: body.title,
        adminActions: body.admin_actions ?? '',
        centerActions: body.center_actions ?? '',
        fromDate: body.from_date,
        toDate: body.to_date ?? null,
        status: body.status,
        tag: body.tag ?? null
      },
      actor
    );
    return c.json({ data: result }, 201);
  });

  app.patch('/api/clearbook/plans/:id', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const body = ClearbookPlanUpdateSchema.parse(await c.req.json<unknown>());
    const result = await service.updatePlan(
      id,
      {
        title: body.title,
        adminActions: body.admin_actions,
        centerActions: body.center_actions,
        fromDate: body.from_date,
        toDate: body.to_date,
        status: body.status,
        tag: body.tag
      },
      actor
    );
    return c.json({ data: result }, 200);
  });

  app.delete('/api/clearbook/plans/:id', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const result = await service.removePlan(id, actor);
    return c.json({ data: result }, 200);
  });

  app.post('/api/clearbook/plans/reorder', office, async (c) => {
    const actor = getAuthContext(c);
    const body = ClearbookPlanReorderSchema.parse(await c.req.json<unknown>());
    const result = await service.reorderPlans(body.ids, actor);
    return c.json({ data: result }, 200);
  });

  app.post('/api/clearbook/plans/seed-template', office, async (c) => {
    const actor = getAuthContext(c);
    const body = ClearbookSeedTemplateSchema.parse(await c.req.json<unknown>());
    const result = await service.seedTemplate(body.start_year, actor);
    return c.json({ data: result }, 201);
  });

  app.post('/api/clearbook/plans/copy', office, async (c) => {
    const actor = getAuthContext(c);
    const body = ClearbookCopyYearSchema.parse(await c.req.json<unknown>());
    const result = await service.copyYear(body.from_year, body.to_year, actor);
    return c.json({ data: result }, 201);
  });

  // ─── فیلترها ───

  app.get('/api/clearbook/tags', office, async (c) => {
    const items = await service.listTags();
    return c.json({ data: items }, 200);
  });

  app.get('/api/clearbook/years', office, async (c) => {
    const items = await service.listYears();
    return c.json({ data: items }, 200);
  });
}
