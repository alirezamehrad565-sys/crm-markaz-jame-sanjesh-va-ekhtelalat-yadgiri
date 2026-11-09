import type { AppHono } from '@core/shared';
import { UuidSchema } from '@core/shared';
import { z } from 'zod';
import { getAuthContext, requireRole } from '@core/auth';
import { NotFoundError } from '@core/errors';
import type { ContentKind, NetworkContentService } from './types';
import { CONTENT_KINDS } from './types';

// ─── کتابخانهٔ شبکه: مسیرها ───
// خواندن: مدیر و منشی · نوشتن/همرسانی: فقط مدیر (تصمیم همرسانی با شبکه تصمیم مرکز است)

const ContentCreateSchema = z.object({
  kind: z.enum(CONTENT_KINDS),
  title: z.string().trim().min(2, 'عنوان حداقل ۲ نویسه است').max(150),
  summary: z.string().trim().max(600).default(''),
  body: z.string().trim().max(8000).default(''),
  tags: z.array(z.string().min(2).max(40)).max(8).default([]),
  source_ref: z.string().max(120).nullish(),
  queue_now: z.boolean().default(false)
});

function parseKind(v: string | undefined): ContentKind | undefined {
  if (!v || v === 'all') return undefined;
  return (CONTENT_KINDS as readonly string[]).includes(v) ? (v as ContentKind) : undefined;
}

function parseOrigin(v: string | undefined): 'local' | 'cp' | undefined {
  if (v === 'local' || v === 'cp') return v;
  return undefined;
}

export function registerNetworkContentRoutes(app: AppHono, service: NetworkContentService): void {
  const office = requireRole('manager', 'secretary');
  const manager = requireRole('manager');
  const staff = requireRole('manager', 'therapist');

  // شناسهٔ ردیف CP — «cp-content-…» (قانون طلایی سینک)؛ UuidSchema نیست
  const CpIdSchema = z.string().trim().min(8).max(140).refine((v) => v.startsWith('cp-content-'), 'شناسهٔ برگزیدهٔ شبکه نامعتبر است');

  // m6 — دانلود فایل آیتم برگزیده (فقط-خواندنی از CP با کلید نود)
  app.get('/api/network-content/cp/:id/file', office, async (c) => {
    const id = CpIdSchema.parse(c.req.param('id'));
    const file = await service.cpFile(id);
    if (!file) return c.json({ error: 'NOT_FOUND', message: 'فایل در دسترس نیست' }, 404);
    const asciiFallback = file.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    return new Response(file.bytes, {
      status: 200,
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Cache-Control': 'private, no-store'
      }
    });
  });

  // m6 — افزودن برگزیدهٔ شبکه به بانک کارت محلی (کارت آماده؛ حفظ اثر طراح)
  app.post('/api/network-content/cp/:id/install', staff, async (c) => {
    const actor = getAuthContext(c);
    const id = CpIdSchema.parse(c.req.param('id'));
    const result = await service.installFromNetwork({ id: actor.staffId }, id);
    return c.json({ data: result }, 200);
  });

  app.get('/api/network-content', office, async (c) => {
    const q = c.req.query();
    const result = await service.list({
      kind: parseKind(q.kind),
      origin: parseOrigin(q.origin),
      q: q.q?.trim() || undefined,
      limit: Number(q.limit ?? 0) || 30,
      offset: Math.max(0, Number(q.offset ?? 0) || 0)
    });
    return c.json({ data: result.items, meta: { hasMore: result.hasMore, counts: result.counts } }, 200);
  });

  app.get('/api/network-content/:id', office, async (c) => {
    const id = UuidSchema.parse(c.req.param('id'));
    const rec = await service.get(id);
    if (!rec) throw new NotFoundError('محتوای شبکه');
    return c.json({ data: rec }, 200);
  });

  app.post('/api/network-content', manager, async (c) => {
    const actor = getAuthContext(c);
    const body = ContentCreateSchema.parse(await c.req.json<unknown>());
    const rec = await service.create(
      { id: actor.staffId },
      {
        kind: body.kind,
        title: body.title,
        summary: body.summary,
        body: body.body,
        tags: body.tags,
        sourceRef: body.source_ref ?? null,
        queueNow: body.queue_now
      }
    );
    return c.json({ data: rec }, 201);
  });

  app.post('/api/network-content/:id/queue', manager, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const rec = await service.queue({ id: actor.staffId }, id);
    return c.json({ data: rec }, 200);
  });

  app.post('/api/network-content/:id/withdraw', manager, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const rec = await service.withdraw({ id: actor.staffId }, id);
    return c.json({ data: rec }, 200);
  });
}
