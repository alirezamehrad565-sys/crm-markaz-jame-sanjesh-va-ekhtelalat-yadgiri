import type { AppHono } from '@core/shared';
import { getAuthContext } from '@core/auth';
import { NotFoundError } from '@core/errors';
import type { DocumentRequestService } from './service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerRoutes(app: AppHono, service: DocumentRequestService): void {
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
        tags: raw.tags ?? raw.templates,
        recipients: raw.recipients,
        customNote: typeof raw.custom_note === 'string' ? raw.custom_note : null,
        dueHint: typeof raw.due_hint === 'string' ? raw.due_hint : null
      },
      actor
    );
    return c.json({ data: result }, 201);
  });

  app.get('/api/students/:id/document-requests', async (c) => {
    const items = await service.listRequests(c.req.param('id'));
    return c.json({ data: items }, 200);
  });

  app.get('/api/students/:id/received-docs', async (c) => {
    const items = await service.listDocs(c.req.param('id'));
    return c.json({ data: items }, 200);
  });

  app.post('/api/requests/:id/close', async (c) => {
    const actor = getAuthContext(c);
    const request = await service.close(c.req.param('id'), actor);
    return c.json({ data: request }, 200);
  });

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
        'Content-Security-Policy': 'sandbox allow-scripts allow-popups'
      }
    });
  });
}
