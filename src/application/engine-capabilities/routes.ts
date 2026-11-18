// src/application/engine-capabilities/routes.ts — ۱.۲۷.۱۳ پایانهٔ قابلیت‌های موتور (P0-1 سند ممیزی §۱)
//
// GET /api/engine/capabilities — عمومی و سبک، هم‌الگوی /health و /api/system/restart-status:
// مصرف‌کنندهٔ اصلی «پوستهٔ دسکتاپ و صفحهٔ بوت» است که سشن اپ ندارد — بنابراین «پیش از» گیت
// authMiddleware ثبت می‌شود (api-routing/index.ts، ناحیهٔ عمومی §۵). تنها محتوای پاسخ نسخهٔ
// همین باندل + نقشهٔ مسیرهای ثابت عمومی است — بدون هیچ دادهٔ کاربر (همان سنت حداقلی EXP-4).
//
// نسخه از «منبع یکتا» (@core/version APP_VERSION) می‌آید — خودآزمایی بوت (P0-2) همین فیلد را
// با نسخهٔ پوسته (CARGO_PKG_VERSION) مقایسه می‌کند و هشدار ناهم‌نسخه‌ای پنل سلامت
// (engineAppVersionGapView) با اولویت از همین مسیر خوراک می‌گیرد.
//
// نقشهٔ api در پاسخ: فقط مسیرهایی که آزمون e2e-engine-capabilities واقعاً زنده‌بودنشان را
// می‌آزماید — اگر روزی یکی از این مسیرها حذف شود، آزمون قرمز می‌شود و نقشه نمی‌تواند دروغ بگوید.
import type { AppHono } from '@core/shared';
import { APP_VERSION } from '@core/version';

/** نقشهٔ مسیرهای عمومی این باندل — هر کلید در آزمون e2e با فراخوانی واقعی پشتوانه می‌شود */
export const ENGINE_PUBLIC_API_MAP = {
  health: '/health',
  restartStatus: '/api/system/restart-status',
  instanceSync: '/api/instance-sync',
  healthPanel: '/api/health/panel',
  nodeSyncStatus: '/api/node-sync/status'
} as const;

export function registerEngineCapabilitiesRoutes(app: AppHono): void {
  app.get('/api/engine/capabilities', (c) =>
    c.json(
      {
        ok: true,
        version: APP_VERSION,
        server_ts: new Date().toISOString(),
        api: ENGINE_PUBLIC_API_MAP
      },
      200,
      { 'Cache-Control': 'no-store' }
    )
  );
}
