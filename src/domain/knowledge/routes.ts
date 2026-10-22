/**
 * ماژول پایگاه دانش — مسیرهای REST ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// دانش‌افزایی
// RBAC: خواندن همهٔ همکاران احرازشده؛ ساخت/ویرایش دفتر (مدیر/منشی)؛ حذف فقط مدیر
// — پیوست فایل/تصویر: آپلود multipart پخش‌جریانی + بارگذاری پیوستهٔ تکه‌ای برای
// فایل‌های بزرگ + دانلود تکی — همان الگوی بانک تمرین؛ مجوز نوشتن پیوست = دفتر.

import type { AppHono } from '@core/shared';
import { NewKnowledgeSchema, UpdateKnowledgeSchema, UuidSchema } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { NotFoundError, ValidationError } from '@core/errors';
import { parseMultipartStream } from '@domain/exercise-bank/multipart';
import type { KnowledgeService } from './types';

/** — MIME از پسوند برای مرورگرهایی که نوع خالی می‌دهند — همان نگاشت بانک تمرین */
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

/** Content-Disposition امن با نام فایل UTF-8 — همیشه attachment (الگوی تمرین) */
function downloadHeaders(filename: string, mimeType: string): Record<string, string> {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return {
    'Content-Type': mimeType,
    'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  };
}

export function registerKnowledgeRoutes(app: AppHono, service: KnowledgeService): void {
  // فهرست برای همهٔ همکاران (داشبورد → کارت دانش‌افزایی)
  app.get('/api/knowledge', async (c) => {
    const items = await service.listPublished();
    return c.json({ data: items }, 200);
  });

  // فهرست مدیریتی (تنظیمات → تب دانش)
  app.get('/api/knowledge/manage', requireRole('manager', 'secretary'), async (c) => {
    const items = await service.listAll();
    return c.json({ data: items }, 200);
  });

  // ساخت (دفتر)
  app.post('/api/knowledge', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = NewKnowledgeSchema.parse(await c.req.json<unknown>());
    const result = await service.create(
      { title: body.title, body: body.body, category: body.category, pinned: body.pinned, published: body.published },
      actor
    );
    return c.json({ data: result }, 201);
  });

  // ویرایش (دفتر)
  app.patch('/api/knowledge/:id', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const body = UpdateKnowledgeSchema.parse(await c.req.json<unknown>());
    const result = await service.update(
      c.req.param('id'),
      {
        title: body.title,
        body: body.body,
        category: body.category,
        pinned: body.pinned,
        published: body.published
      },
      actor
    );
    return c.json({ data: result }, 200);
  });

  // حذف کامل (فقط مدیر — الگوی اعلان‌ها)
  app.delete('/api/knowledge/:id', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const result = await service.remove(c.req.param('id'), actor);
    return c.json({ data: result }, 200);
  });

  // ─── پیوست‌های مقاله — چندفایلی multipart پخش‌جریانی (الگوی بانک تمرین) ───
  app.post('/api/knowledge/:id/files', requireRole('manager', 'secretary'), async (c) => {
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
  app.post('/api/knowledge/:id/files/begin', requireRole('manager', 'secretary'), async (c) => {
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

  app.put('/api/knowledge/:id/files/:fileId/chunks/:seq', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const seq = Number(c.req.param('seq'));
    const buf = await c.req.arrayBuffer();
    const result = await service.putUploadChunk(id, fileId, seq, new Uint8Array(buf), actor);
    return c.json({ data: result }, 200);
  });

  app.post('/api/knowledge/:id/files/:fileId/complete', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const updated = await service.completeChunkedUpload(id, fileId, actor);
    return c.json({ data: updated }, 200);
  });

  // ─── دانلود/حذف یک پیوست ───
  app.get('/api/knowledge/:id/files/:fileId', async (c) => {
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const file = await service.getAttachmentFile(id, fileId);
    if (!file) throw new NotFoundError('فایل مقاله');
    return new Response(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: downloadHeaders(file.filename, file.mime)
    });
  });

  app.delete('/api/knowledge/:id/files/:fileId', requireRole('manager', 'secretary'), async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const fileId = UuidSchema.parse(c.req.param('fileId'));
    const updated = await service.deleteAttachment(id, fileId, actor);
    return c.json({ data: updated }, 200);
  });
}
