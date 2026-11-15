// src/application/system/routes.ts — سه دکمهٔ نجات سمت موتور (۴-۲ طرح ارتقا، موج ۴)
//
// ① POST /api/system/restart — ری‌استارت تمیز سامانه از پنل:
//    مُهر «خروج عمدی» در settings (sys_restart_scheduled) گذاشته می‌شود؛ ناظر (engine.mjs
//    سمت node و engine.rs سمت Rust) آن را می‌بیند، workerd را تمیز خاموش و دوباره بالا
//    می‌آورد و چون خروج عمدی است، واچ‌داگ آن را کرش حساب نمی‌کند (همان مهر ۱.۲۶.۲).
// ② GET /api/support/error-package — بستهٔ گزارش خطا (zip بدون dep) برای ارسال به پشتیبانی.
// هر دو با همان احراز سشن پنل (requireRole('manager')) — هم‌الگوی /api/health/panel.
import type { AppHono } from '@core/shared';
import { getAuthContext, requireRole } from '@core/auth';
import { humanizeError } from '@core/errors';
import { pushHumanEvent } from '@core/human-events';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import { buildErrorPackage } from './error-package';

/** کلید مُهر ری‌استارت در settings — هم‌قرارداد ناظر node (scripts/engine/engine.mjs) */
export const RESTART_MARKER_KEY = 'sys_restart_scheduled';

// نشان درون‌حافظهٔ همین isolate — زنده‌ترین سیگنال برای /health (مصرف صفر) ؛
// ردیف settings همان مُهر durable است که ناظرِ بیرونی مصرف می‌کند.
let restartFlag = false;

/** وضعیت ری‌استارتِ در نوبت — /health همین را به‌صورت فقط-افزودنی می‌خواند */
export function isRestartScheduled(): boolean {
  return restartFlag;
}

export interface SystemRoutesDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  envName?: string | null;
}

/**
 * مسیر عمومی سبک برای ناظرِ بیرونی (node/Rust) — احراز ندارد چون ناظر سشن اپ ندارد و
 * تنها محتوایش یک بولینِ بدون حساسیت است؛ در تولید وب هم بی‌ضرر است (ناظری نیست).
 * شکل: GET /api/system/restart-status → {ok:true, scheduled:bool}
 * (پرس‌وجوی مُهر durable نیازمند دسترسی DB ناظر است؛ در Rust این endpoint تنها راه است.)
 */
export function registerSystemPublicRoutes(app: AppHono, deps: Pick<SystemRoutesDeps, 'db'>): void {
  app.get('/api/system/restart-status', async (c) => {
    // مُهر دیرپا مرجع حقیقت است — فلگ درون‌حافظه با بازچرخش isolate گمراه‌کننده می‌شود
    // (ناظر با «false شدن» این بولین مطمئن می‌شود مُهر واقعاً مصرف شده است).
    let scheduled = false;
    try {
      const row = await deps.db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
        RESTART_MARKER_KEY
      ]);
      scheduled = Boolean(row?.value);
    } catch {
      scheduled = isRestartScheduled();
    }
    return c.json({ ok: true, scheduled }, 200, { 'Cache-Control': 'no-store' });
  });
}

export function registerSystemRoutes(app: AppHono, deps: SystemRoutesDeps): void {
  // ① راه‌اندازی دوبارهٔ سامانه از پنل — پاسخ قرارداد ثابت UI: {ok, scheduled[, already]}
  app.post('/api/system/restart', requireRole('manager'), async (c) => {    const actor = getAuthContext(c);
    const already = restartFlag;
    restartFlag = true;
    // مُهر durable برای ناظر — حتی اگر isolate اپ بازچرخد ناظر آن را می‌بیند
    try {
      await deps.db.execute(
        `INSERT INTO settings (key, value, updated_by, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
        [RESTART_MARKER_KEY, JSON.stringify({ ts: new Date().toISOString(), actor_id: actor.staffId }), actor.staffId]
      );
    } catch (err) {
      deps.logger.warn('system.restart.marker_failed', { error: err instanceof Error ? err.message : String(err) });
    }
    // رویداد ممیزی با بازیگر واقعی + رویداد انسانی فارسی (۴-۳)
    try {
      await deps.audit.log({
        actorId: actor.staffId,
        action: 'system.restart_request',
        resourceType: 'system',
        resourceId: 'engine',
        changes: { scheduled: { from: null, to: true }, already: { from: null, to: already } }
      });
    } catch (err) {
      deps.logger.warn('system.restart.audit_failed', { error: err instanceof Error ? err.message : String(err) });
    }
    // متن لاگ انسانی مستقل از عنوان UI — قرارداد smoke: «راه‌اندازی دوبارهٔ سامانه از پنل»
    await pushHumanEvent(deps.db, 'راه‌اندازی دوبارهٔ سامانه از پنل', 'panel');
    return c.json(already ? { ok: true, scheduled: true, already: true } : { ok: true, scheduled: true }, 200, {
      'Cache-Control': 'no-store'
    });
  });

  // ② بستهٔ گزارش خطا — zip سبک بدون وابستگی تازه (STORE) با نام قراردادی
  app.get('/api/support/error-package', requireRole('manager'), async (c) => {
    const pkg = await buildErrorPackage(deps.db, { envName: deps.envName ?? null });
    try {
      await deps.audit.log({
        actorId: getAuthContext(c).staffId,
        action: 'system.error_package',
        resourceType: 'support',
        resourceId: pkg.filename
      });
    } catch (err) {
      deps.logger.warn('system.error_package.audit_failed', { error: err instanceof Error ? err.message : String(err) });
    }
    return new Response(pkg.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${pkg.filename}"`,
        'Cache-Control': 'no-store'
      }
    });
  });
}
