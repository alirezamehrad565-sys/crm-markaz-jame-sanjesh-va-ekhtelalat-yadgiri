/**
 * rust-f9 — مسیرهای استقرار سینک نود در میز (فقط-موتور محلی)
 *
 * جای ثبت: در api-routing «بعد از» گیت authMiddleware/supervisorGate — احراز این
 * مسیرها سشن کارمند است (هر نقشی جز ناظر طبق). گیت زمان‌اجرای میز: متغیر محیطی
 * CENTER_DESKTOP_ENGINE فقط در کانفیگ capnp موتور محلی (config.mjs) بایند می‌شود؛
 * در تولید وب این binding وجود ندارد → ۴۰۴ کم‌دست — رفتار تولید بایت‌به‌بایت دست‌نخورده
 * (باندل یکسان، شاخهٔ زمان‌اجرای خاموش).
 *  • POST /api/internal/sync/ingest — آیتم‌های pullشدهٔ کلاینت → صندوق ورودی (0110)
 *  • GET  /api/internal/sync/status — شمارش صندوق بر حسب دامنه (نشانگر/drill)
 * هیچ دادهٔ بالینی در هیچ مسیری نیست — فهرست سفید سه‌لایه (ابر/کلاینت/سرور میز).
 */
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppHono, AppBindings, AppVariables } from '@core/shared';
import { getAuthContext } from '@core/auth';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { NotFoundError, ValidationError } from '@core/errors';
import { IngestBodySchema, ingestInboxItem, inboxStatusCounts, splitByWhitelist } from './service';

export interface InternalSyncRoutesDeps {
  db: DbClient;
  logger: Logger;
}

type Env = { Bindings: AppBindings; Variables: AppVariables };

/** گیت زمان‌اجرای میز — در تولید وب binding غایب است و مسیر ۴۰۴ کم‌دست می‌دهد */
function requireDesktopEngine(c: Context<Env>): void {
  if ((c.env as unknown as Record<string, unknown>)?.CENTER_DESKTOP_ENGINE !== '1') {
    throw new NotFoundError('مسیر یافت نشد');
  }
}

export function registerInternalSyncRoutes(app: AppHono, deps: InternalSyncRoutesDeps): void {
  const log = deps.logger.child('internal-sync');

  app.post('/api/internal/sync/ingest', async (c) => {
    requireDesktopEngine(c);
    const ctx = getAuthContext(c);
    // zod4 — خطای اعتبارسنجی با پاکت استاندارد ۴۰۰ به خطای سراسری می‌رود
    const parsed = IngestBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError('بدنهٔ استقرار نامعتبر است');
    const { allowed, forbiddenDomains } = splitByWhitelist(parsed.data.items);
    if (forbiddenDomains.length > 0) {
      return c.json({ error: 'NODE_DOMAIN_FORBIDDEN', message: 'دامنهٔ بیرون فهرست سفید سینک است' }, 403);
    }
    const counts = { inserted: 0, updated: 0, duplicates: 0 };
    const by_domain: Record<string, number> = {};
    for (const item of allowed) {
      const r = await ingestInboxItem(deps.db, item);
      if (r === 'inserted') counts.inserted += 1;
      else if (r === 'updated') counts.updated += 1;
      else counts.duplicates += 1;
      by_domain[item.domain] = (by_domain[item.domain] ?? 0) + 1;
    }
    log.info('ingest.ok', { staffId: ctx.staffId, ...counts });
    return c.json({ data: { ...counts, by_domain } }, 200);
  });

  app.get('/api/internal/sync/status', async (c) => {
    requireDesktopEngine(c);
    getAuthContext(c); // همان گیت سشن — فراخوانی برای یکدستی ۴۰۱
    const status = await inboxStatusCounts(deps.db);
    return c.json({ data: status }, 200);
  });
}
