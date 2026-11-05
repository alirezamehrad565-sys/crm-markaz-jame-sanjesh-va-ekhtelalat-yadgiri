import type { AppHono } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { MAX_REQUEST_BYTES } from './service';
import type { BackupService } from './service';

export function registerBackupRoutes(app: AppHono, service: BackupService): void {
  // وضعیت جداول برای نمایش در پنل پشتیبان‌گیری
  app.get('/api/backup/status', requireRole('manager'), async (c) => {
    const data = await service.getStatus();
    return c.json({ data }, 200);
  });

  // دریافت فایل پشتیبان (استریم) — include_files=1 برای همراه بودن بایت فایل‌های پیوستی
  app.get('/api/backup/export', requireRole('manager'), async (c) => {
    const includeFiles = c.req.query('include_files') === '1';
    const actor = getAuthContext(c);
    const stream = service.buildExportStream(includeFiles);
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    c.executionCtx.waitUntil(service.logExport(actor, includeFiles));
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="backup-${stamp}.json"; filename*=UTF-8''${encodeURIComponent(`پشتیبان-${stamp}.json`)}`,
        'Cache-Control': 'no-store'
      }
    });
  });

  // بررسی فایل پشتیبان بدون هیچ نوشتنی — برای پیش‌نمایش پیش از بازیابی
  app.post('/api/backup/inspect', requireRole('manager'), async (c) => {
    const len = Number(c.req.header('content-length') ?? '0');
    if (len > MAX_REQUEST_BYTES) {
      return c.json(
        { error: 'VALIDATION_ERROR', message: 'حجم فایل پشتیبان بیش از سقف مجاز است (۶۰ مگابایت)' },
        400
      );
    }
    const body = await c.req.json<unknown>();
    const data = await service.inspect(body);
    return c.json({ data }, 200);
  });

  // بازیابی فایل پشتیبان — جایگزینی کامل جداول؛ فقط با تأیید صریح
  app.post('/api/backup/restore', requireRole('manager'), async (c) => {
    const len = Number(c.req.header('content-length') ?? '0');
    if (len > MAX_REQUEST_BYTES) {
      return c.json(
        { error: 'VALIDATION_ERROR', message: 'حجم فایل پشتیبان بیش از سقف مجاز است (۶۰ مگابایت)' },
        400
      );
    }
    const actor = getAuthContext(c);
    const body = await c.req.json<{ backup?: unknown; confirm?: boolean } & Record<string, unknown>>();
    const confirmed = body?.confirm === true;
    const data = await service.restore(actor, body, { confirmed });
    return c.json({ data }, 200);
  });

  // ─── ارسال پشتیبان به آیدی بله (مقصد انتخابی) ───

  // تنظیمات ارسال: مقصدها (آیدی‌های بله) + ارسال خودکار شبانه
  app.get('/api/backup/delivery', requireRole('manager'), async (c) => {
    const data = await service.getDelivery();
    return c.json({ data }, 200);
  });

  app.put('/api/backup/delivery', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<Record<string, unknown>>();
    const data = await service.saveDelivery(actor, body);
    return c.json({ data }, 200);
  });

  // ارسال فایل پشتیبان به مقصدهای انتخاب‌شده (sendDocument ربات بله)
  app.post('/api/backup/send', requireRole('manager'), async (c) => {
    const actor = getAuthContext(c);
    const body = await c.req.json<{ destinations?: unknown; include_files?: boolean }>();
    const data = await service.sendBackup(actor, body ?? {});
    return c.json({ data }, 200);
  });
}
