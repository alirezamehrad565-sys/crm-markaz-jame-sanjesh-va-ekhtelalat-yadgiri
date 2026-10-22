/**
 * ماژول درخواست مدارک از خانواده/معلم با بله — مسیرهای REST ماژول (m151 — T2 · بازطراحی m166)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// REST endpoints مدارک — بدون business logic، فقط سیم به سرویس
// RBAC: همان coarse-gate مسیرهای فعلی student-profile — همهٔ کارکنان واردشده؛
// ساخت/بستن درخواست هم مانند POST /api/students بدون requireRole اضافه است.

import type { AppHono } from '@core/shared';
import { getAuthContext } from '@core/auth';
import { NotFoundError } from '@core/errors';
import type { DocumentRequestService } from './service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerRoutes(app: AppHono, service: DocumentRequestService): void {
  // ─── ثبت درخواست + ارسال پیام بله به گیرنده‌ها (خانواده و/یا معلم) ───
  app.post('/api/students/:id/document-requests', async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<unknown>().catch(() => ({}));
    const raw = (body ?? {}) as {
      tags?: unknown;
      templates?: unknown;
      recipients?: unknown;
      custom_note?: unknown;
      due_hint?: unknown;
    };
    const result = await service.create(
      c.req.param('id'),
      {
        // — m166: tags جدید؛ templates کلید قدیمی برای سازگاری فراخوان‌های قبلی
        tags: raw.tags ?? raw.templates,
        recipients: raw.recipients,
        customNote: typeof raw.custom_note === 'string' ? raw.custom_note : null,
        dueHint: typeof raw.due_hint === 'string' ? raw.due_hint : null
      },
      actor
    );
    return c.json({ data: result }, 201);
  });

  // ─── فهرست درخواست‌های پرونده ───
  app.get('/api/students/:id/document-requests', async (c) => {
    const items = await service.listRequests(c.req.param('id'));
    return c.json({ data: items }, 200);
  });

  // ─── مدارک دریافتی پرونده (کارت «مدارک دریافتی از بله») ───
  app.get('/api/students/:id/received-docs', async (c) => {
    const items = await service.listDocs(c.req.param('id'));
    return c.json({ data: items }, 200);
  });

  // ─── بستن درخواست ───
  app.post('/api/requests/:id/close', async (c) => {
    const actor = getAuthContext(c);
    const request = await service.close(c.req.param('id'), actor);
    return c.json({ data: request }, 200);
  });

  // ─── دانلود/نمایش فایل مدرک برای کارکنان (بندانگشتی پنل) ───
  app.get('/api/students/:id/received-docs/:docId/file', async (c) => {
    const docId = c.req.param('docId');
    if (!UUID_RE.test(docId)) throw new NotFoundError('مدرک');
    const file = await service.getDocFile(docId);
    if (!file) throw new NotFoundError('مدرک');
    const asciiFallback = file.filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    const mime = file.mime === 'text/html' ? 'text/html; charset=utf-8' : file.mime;
    return new Response(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        // — هم‌سنگ مسیر فایل تمرین: محتوای آپلودی در origin سندباکس‌شده اجرا می‌شود
        'Content-Security-Policy': 'sandbox allow-scripts allow-popups'
      }
    });
  });
}
