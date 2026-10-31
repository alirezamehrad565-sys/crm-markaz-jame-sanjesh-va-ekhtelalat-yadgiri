import type { AppHono } from '@core/shared';
import { UuidSchema } from '@core/shared';
import { z } from 'zod';
import { getAuthContext, requireRole } from '@core/auth';
import { NotFoundError, ValidationError } from '@core/errors';
import { parseMultipartStream } from '@domain/exercise-bank/multipart';
import type { DocsService, DocCategory } from './types';
import { DOC_CATEGORIES } from './types';

// ─── نمون‌برگ‌ها و اسناد خام: مسیرها (همه فقط مدیر/منشی به‌جز دانلود) ───

// اسکیمای Zod لوکال دامنه — @core/shared دست‌نخورده
const DocCreateSchema = z.object({
  title: z.string().trim().min(2, 'عنوان سند حداقل ۲ نویسه است').max(150),
  category: z.enum(DOC_CATEGORIES).default('other'),
  description: z.string().max(4000).default(''),
  tags: z.array(z.string().min(2).max(40)).max(8).default([])
});

// ویرایش جزئی — بدون default تا فیلد غایب = حفظ موجود
const DocUpdateSchema = z.object({
  title: z.string().trim().min(2).max(150).optional(),
  category: z.enum(DOC_CATEGORIES).optional(),
  description: z.string().max(4000).optional(),
  tags: z.array(z.string().min(2).max(40)).max(8).optional()
});

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

function isPreviewable(mime: string): boolean {
  // فقط PDF و تصویر در تب جدید پیش‌نمایش/پرینت می‌شوند — متن/HTML همیشه attachment (امنیت)
  return mime === 'application/pdf' || mime.startsWith('image/');
}

function fileHeaders(filename: string, mimeType: string, inline: boolean): Record<string, string> {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const type = mimeType.startsWith('text/') ? `${mimeType}; charset=utf-8` : mimeType;
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  };
  if (inline) {
    // مثل /public/exercise-files — محتوای inline در کانتکست ایزوله رندر شود
    headers['Content-Security-Policy'] = 'sandbox';
  }
  return headers;
}

export function registerDocsRoutes(app: AppHono, service: DocsService): void {
  const office = requireRole('manager', 'secretary');

  // ─── اسناد ───

  app.get('/api/docs', office, async (c) => {
    const q = c.req.query();
    const category = q.category && q.category !== 'all' ? (q.category as DocCategory) : undefined;
    const result = await service.list({
      q: q.q?.trim() || undefined,
      category,
      limit: Number(q.limit ?? 0) || 100,
      offset: Math.max(0, Number(q.offset ?? 0) || 0)
    });
    return c.json({ data: result.items, meta: { hasMore: result.hasMore } }, 200);
  });

  app.get('/api/docs/:id', office, async (c) => {
    const id = UuidSchema.parse(c.req.param('id'));
    const doc = await service.get(id);
    if (!doc) throw new NotFoundError('سند');
    return c.json({ data: doc }, 200);
  });

  app.post('/api/docs', office, async (c) => {
    const actor = getAuthContext(c);
    const body = DocCreateSchema.parse(await c.req.json<unknown>());
    const result = await service.create(
      {
        title: body.title,
        category: body.category,
        description: body.description ?? '',
        tags: body.tags ?? []
      },
      actor
    );
    return c.json({ data: result }, 201);
  });

  app.patch('/api/docs/:id', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const body = DocUpdateSchema.parse(await c.req.json<unknown>());
    const result = await service.update(
      id,
      {
        title: body.title,
        category: body.category,
        description: body.description,
        tags: body.tags
      },
      actor
    );
    return c.json({ data: result }, 200);
  });

  app.delete('/api/docs/:id', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const result = await service.remove(id, actor);
    return c.json({ data: result }, 200);
  });

  // ─── فایل‌ها ───

  app.post('/api/docs/:id/files', office, async (c) => {
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

  app.post('/api/docs/:id/files/begin', office, async (c) => {
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

  app.put('/api/docs/:id/files/:fileId/chunks/:seq', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const seq = Number(c.req.param('seq'));
    const buf = await c.req.arrayBuffer();
    const result = await service.putUploadChunk(id, fileId, seq, new Uint8Array(buf), actor);
    return c.json({ data: result }, 200);
  });

  app.post('/api/docs/:id/files/:fileId/complete', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const updated = await service.completeChunkedUpload(id, fileId, actor);
    return c.json({ data: updated }, 200);
  });

  // دانلود/پیش‌نمایش — مثل knowledge فقط authMiddleware سراسری کافی است (بدون requireRole)
  app.get('/api/docs/:id/files/:fileId', async (c) => {
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const file = await service.getFile(id, fileId);
    if (!file) throw new NotFoundError('فایل سند');
    const wantsInline = c.req.query('inline') === '1';
    // متن/HTML حتی با inline=1 هم attachment می‌ماند (امنیت)
    const inline = wantsInline && isPreviewable(file.mime);
    return new Response(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: fileHeaders(file.filename, file.mime, inline)
    });
  });

  app.delete('/api/docs/:id/files/:fileId', office, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const updated = await service.deleteFile(id, fileId, actor);
    return c.json({ data: updated }, 200);
  });
}
