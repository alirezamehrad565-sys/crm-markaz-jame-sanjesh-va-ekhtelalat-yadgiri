// مسیرهای RUM: نوشتن عمومی بی‌نام (POST /public/rum) + جمع‌بندی فقط‌مدیر (GET /api/rum/summary)
// مسیر عمومی طبق الگوی /public/announcements و /public/case-events بیرون از authMiddleware است؛
// گیت ناظر () هم فقط /api/* را می‌پوشاند — پس تله‌متریِ مرورگر ناظر هم از دست نمی‌رود.
import { z } from 'zod';
import type { AppHono } from '@core/shared';
import { requireRole } from '@core/auth';
import { ValidationError } from '@core/errors';
import type { RumService } from './service';

// اسکیمای خود ماژول — قانون zod سنترد (design.md §۵: «اسکیمای خود ماژول» مجاز است)
const RUM_METRICS = ['LCP', 'CLS', 'INP', 'FCP', 'TTFB'] as const;
const RUM_RATINGS = ['good', 'needs-improvement', 'poor'] as const;

const RumEventSchema = z.object({
  metric: z.enum(RUM_METRICS),
  value: z.number().min(0).max(120_000),
  rating: z.enum(RUM_RATINGS),
  nav_id: z.string().min(4).max(64),
  path: z.string().min(1).max(300),
  viewport_w: z.number().int().min(0).max(20_000),
  viewport_h: z.number().int().min(0).max(20_000),
  conn: z.string().max(20).nullish(),
  device_memory: z.number().int().min(0).max(16).nullish(),
  prm: z.boolean(),
  theme: z.enum(['light', 'dark'])
});

const RumPayloadSchema = z.object({
  events: z.array(RumEventSchema).min(1).max(10)
});

const MAX_BODY_BYTES = 4096; // سقف سخت بدنه — تله‌متری کوچک است؛ بزرگ‌ترش یعنی سوءاستفاده یا باگ

export function registerRumRoutes(app: AppHono, service: RumService): void {
  app.post('/public/rum', async (c) => {
    const contentLength = Number.parseInt(c.req.header('content-length') ?? '0', 10) || 0;
    if (contentLength > MAX_BODY_BYTES) {
      throw new ValidationError('حجم درخواست تله‌متری بیش از حد مجاز است');
    }
    service.assertAllowed();
    const body = RumPayloadSchema.parse(await c.req.json<unknown>());
    const received = await service.record(body.events);
    c.header('Cache-Control', 'no-store');
    return c.json({ data: { received } }, 200);
  });

  app.get('/api/rum/summary', requireRole('manager'), async (c) => {
    // NaN (غایب/غیرعددی) به سرویس می‌رود تا خودش پیش‌فرض ۷ را بگذارد؛ صفر و منفی با گیرهٔ ۱..۹۰ گرفته می‌شود
    const days = Number.parseInt(c.req.query('days') ?? '', 10);
    const data = await service.summary(days);
    return c.json({ data }, 200);
  });
}
