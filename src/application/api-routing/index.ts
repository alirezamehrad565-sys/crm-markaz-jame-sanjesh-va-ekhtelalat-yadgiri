/**
 * createApp باریک — ۱.۲۷.۸۰ (architecture-001 — sdt157): تفکیک سه نقشِ api-routing.
 * ریشهٔ ترکیب (ساخت ۴۸ سرویس + نصب ۸ ناظر) در ./composition است، میان‌افزار سراسری در
 * ./middleware و رجیستری مسیرها در ./routes. این فایل فقط ترتیبِ چیدمان را نگه می‌دارد —
 * ترتیبی که خودش رفتار است: میان‌افزارها → روت‌های عمومی و subappها → گیت auth/ناظر →
 * روت‌های محافظت‌شده → خطا/۴۰۴. افزودن یک ماژول دامنه فقط یک ورودی به ./routes است
 * (done_when یافتهٔ architecture-001 رجیستری ممیزی).
 */
import { Hono } from 'hono';
import type { AppHono, AppBindings, AppVariables } from '@core/shared';
import { authMiddleware, supervisorGate } from '@core/auth';
import { errorHandler } from '@app/http';
import { createServices } from './composition';
import type { AppDeps, Services } from './composition';
import { installGlobalMiddleware } from './middleware';
import { registerPublicRoutes, registerProtectedRoutes } from './routes';

export { createServices } from './composition';
export type { AppDeps, Services } from './composition';

export function createApp(deps: AppDeps): AppHono {
  const services = createServices(deps);

  const app: AppHono = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

  // — هوک تستی: دسترسی به سرویس‌ها برای e2e (مثلاً setFillObserver در آزمون)
  (app as unknown as { __services?: Services }).__services = services;

  installGlobalMiddleware(app, services);

  registerPublicRoutes(app, services, deps);

  app.use('/api/*', authMiddleware());
  app.use('/api/*', supervisorGate(services.audit));

  registerProtectedRoutes(app, services, deps);

  app.onError(errorHandler);

  app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'مسیر درخواستی یافت نشد' }, 404));

  return app;
}
