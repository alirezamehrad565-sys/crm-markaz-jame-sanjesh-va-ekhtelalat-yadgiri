// مسیرهای خطاهای کلاینت: نوشتن عمومی بی‌نام (POST /public/client-errors) + خواندن فقط‌مدیر (GET /api/client-errors)
// نوشتن عمومی طبق الگوی /public/rum بیرون از authMiddleware است — گزارش خطا باید از صفحهٔ ورود،
// لحظهٔ ۴۰۱ و نشست‌های بی‌توکن هم عبور کند؛ گیت ناظر هم فقط /api/* را می‌پوشاند.
import { z } from 'zod';
import type { AppHono } from '@core/shared';
import { requireRole } from '@core/auth';
import { ValidationError } from '@core/errors';
import type { ClientErrorsService } from './service';

// اسکیمای خود ماژول — قانون zod سنترد (design.md §۵)
// سقف‌ها بخشنده‌اند (بندهٔ برش در سرویس است) تا مشتریان کهنه با پشتهٔ بلند ۴۰۰ نگیرند
const ClientErrorSchema = z.object({
  message: z.string().min(1),
  source: z.string().max(500).nullish(),
  line: z.number().int().min(0).max(10_000_000).nullish(),
  col: z.number().int().min(0).max(10_000_000).nullish(),
  stack: z.string().max(16_000).nullish(),
  url: z.string().max(500).nullish(),
  app_version: z.string().max(50).nullish()
});

const MAX_BODY_BYTES = 16_384; // سقف سخت بدنه — پشتهٔ بلندِ یک خطا جا می‌شود؛ بزرگ‌ترش یعنی سوءاستفاده

export function registerClientErrorsRoutes(app: AppHono, service: ClientErrorsService): void {
  app.post('/public/client-errors', async (c) => {
    const contentLength = Number.parseInt(c.req.header('content-length') ?? '0', 10) || 0;
    if (contentLength > MAX_BODY_BYTES) {
      throw new ValidationError('حجم گزارش خطا بیش از حد مجاز است');
    }
    service.assertAllowed();
    const body = ClientErrorSchema.parse(await c.req.json<unknown>());
    const id = await service.record(body);
    c.header('Cache-Control', 'no-store');
    return c.json({ data: { received: 1, id } }, 200);
  });

  app.get('/api/client-errors', requireRole('manager'), async (c) => {
    // NaN (غایب/غیرعددی) به سرویس می‌رود تا خودش پیش‌فرض بگذارد؛ خارج از گیره با گیرهٔ ۱..۹۰ / ۱..۵۰۰
    const days = Number.parseInt(c.req.query('days') ?? '', 10);
    const limit = Number.parseInt(c.req.query('limit') ?? '', 10);
    const data = await service.recent(days, limit);
    return c.json({ data }, 200);
  });
}
