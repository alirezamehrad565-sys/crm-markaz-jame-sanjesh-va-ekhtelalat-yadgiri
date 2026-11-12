// هشدار خودکار (ف۵ طرح ارتقا — P0-3 حداقلی، آیتم صریح ف۵ در §۳-۱): «پنل هرگز خودش زنگ نمی‌زد»
// م۲۱۰ (حکم کارفرما: «هشدارها نباید سمت نود بروند، باید سمت CP بیایند») — قاعدهٔ ① (رانش مُهر
// تلاش/موفقیت درگاه‌های CP) از این نود حذف شد؛ مالکیت آن به کنترل‌پلین منتقل شد (CP m9/۱.۱۳.۰ —
// ماژول node-health: جدول channel_alerts با seal_drift/auth_rejected/silent، ack/resolve فقط-owner،
// رساندن اختیاری تلگرام). این نود دیگر هرگز برای درگاه‌های CP زنگ نمی‌زند — نه پنل، نه اعلان مدیر.
// تنها قاعدهٔ باقی‌مانده — کاملاً محلی-نودی:
//   ② جهش خطاهای مرورگر: COUNT(خطاهای ۲۴ ساعت) > ALERT_CLIENT_ERRORS_MAX (پیش‌فرض ۱۰۰).
// اجرا فقط در چرخهٔ کرون شبانهٔ digest (کنار رشد جدول‌ها — بدون کرون تازه، سقف پلن Free ۵ کرون)؛
// پنل سلامت همان منطق را زنده مشتق می‌کند تا نتیجه بدون رفت‌وبرگشت تازه دیده شود.
// مُهرهای تلاش/موفقیت درگاه‌ها همچنان در جدول CHANNELS پنل به‌عنوان دادهٔ واقعی (ok/stale/never)
// نمایش داده می‌شوند — بدون هیچ پیام هشدار؛ عیب‌یابی خاموش نود بدون دورزدن حکم «هشدار فقط-CP».
// kill-switch: env ALERTS_DISABLED (رشتهٔ راستین) ارزیابی را کامل خاموش می‌کند.
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
// فقط نوع — نه وابستگی ران‌تایم (service.ts خودش deriveAlerts را از همین فایل می‌گیرد؛ چرخهٔ ماژولی ممنوع)
import type { HealthAlert, HealthPanelData, HealthService } from './service';

/** کلید settings برای مُهر آخرین ارزیابی خودکار (هم‌الگوی growth.last_snapshot_at) */
export const ALERTS_SEAL_KEY = 'alerts.last_evaluated_at';
/** پیش‌فرض آستانهٔ هشدار خطاهای مرورگر در ۲۴ ساعت — env اختیاری ALERT_CLIENT_ERRORS_MAX */
export const ALERT_CLIENT_ERRORS_MAX_DEFAULT = 100;

/**
 * تفسیر env اختیاری `ALERT_CLIENT_ERRORS_MAX`:
 *   نبود/رشتهٔ خالی/غیرعددی/منفی → پیش‌فرض ۱۰۰ · صفر → هر خطای مرورگر هشدار می‌گیرد ·
 *   عدد مثبت → همان سقف. مقادیر env در Workers رشته می‌آیند؛ پس رشتهٔ «۵۰» هم می‌پذیریم.
 */
export function parseClientErrorsMax(raw: unknown): number {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return ALERT_CLIENT_ERRORS_MAX_DEFAULT;
  }
  const n = typeof raw === 'string' ? Number(raw.trim()) : Number(raw);
  if (!Number.isFinite(n) || n < 0) return ALERT_CLIENT_ERRORS_MAX_DEFAULT;
  return Math.trunc(n);
}

/** kill-switch env `ALERTS_DISABLED` — رشتهٔ راستین («۱»، «true»، «yes»، «on») یعنی خاموش */
export function alertsDisabledFlag(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  const s = String(raw).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/**
 * مشتقِ محض هشدارها از دادهٔ همان پنل سلامت — هم در panel() و هم در چرخهٔ کرون مصرف می‌شود
 * تا دو حکم هرگز از هم فاصله نگیرند. هیچ کوئری تازه‌ای ندارد؛ ورودی، خروجی کامل panel است.
 * م۲۱۰ — فقط قاعدهٔ محلی-نودی (خطاهای مرورگر)؛ هشدار درگاه‌های CP مالکیتِ کنترل‌پلین است
 * (CP m9 node-health → channel_alerts) و اینجا هرگز مشتق نمی‌شود — رانش مُهر حتی اگر
 * باشد، در این خروجی نمی‌آید: نه پنل نود، نه اعلان مدیر نود.
 */
export function deriveAlerts(panel: HealthPanelData, clientErrorsMax: number): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  // جهش خطاهای مرورگر — شمارش null (قطعی D1) هشدار نمی‌گیرد؛ «هرگز عدد از هوا نمی‌سازیم»
  const clientErrors24h = panel.counts.client_errors_24h;
  if (clientErrors24h !== null && clientErrors24h > clientErrorsMax) {
    alerts.push({
      code: 'client_errors_spike',
      severity: 'warning',
      message: `خطاهای مرورگر در ۲۴ ساعت گذشته (${clientErrors24h} مورد) از آستانهٔ ${clientErrorsMax} گذشته است — نمای «خطاهای مرورگر» را ببینید.`
    });
  }

  return alerts;
}

async function readIsoStamp(db: DbClient, key: string): Promise<string | null> {
  try {
    const row = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    if (!row) return null;
    const parsed: unknown = JSON.parse(row.value);
    return typeof parsed === 'string' && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** مُهر آخرین ارزیابی خودکار — پنل با همین نشان می‌دهد «چه وقت نگاه کردیم» */
export async function readAlertsSeal(db: DbClient): Promise<string | null> {
  return readIsoStamp(db, ALERTS_SEAL_KEY);
}

async function writeAlertsSeal(db: DbClient, iso: string): Promise<void> {
  await db.execute(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES (?, ?, 'alerts-cron', datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [ALERTS_SEAL_KEY, JSON.stringify(iso)]
  );
}

export interface AlertCycleOutcome {
  /** «disabled» یعنی kill-switch روشن بود و هیچ ارزیابی‌ای رخ نداد */
  disabled: boolean;
  evaluated_at: string | null;
  alerts: HealthAlert[];
  /** تعداد اعلان صف‌شده برای مدیر(ها) — صفر یعنی فقط لاگ/پنل */
  enqueued: number;
}

export interface AlertCycleDeps {
  db: DbClient;
  /** سرویس سلامتِ آماده (هم‌چیز از مُهرها می‌خواند) — رانش فقط وقتی CP سه‌متغیره کامل است معنا دارد */
  health: Pick<HealthService, 'panel'>;
  /** صف اعلان اپ‌لایه — enqueueOwnerAlert در بخش هشدارهای @app/notify */
  notify: { enqueueOwnerAlert(text: string, dedupKey: string): Promise<number>; dispatchPending(limit?: number): Promise<{ processed: number; sent: number; failed: number; skipped: number }> };
  logger: Logger;
  /** آستانهٔ خطاهای مرورگر (env خام یا عدد) */
  clientErrorsMax?: number | string | null;
  /** kill-switch خام env ALERTS_DISABLED */
  alertsDisabled?: unknown;
}

/**
 * چرخهٔ ارزیابی هشدار — فقط از کرون شبانهٔ digest صدا زده می‌شود (ف۵؛ بدون کرون تازه):
 * پنل را می‌خواند → هشدارها را مشتق می‌کند → برای هر هشدار logger.error با کد `alert.*`
 * → اگر درگاه اعلان آماده باشد، پیام فارسی برای مدیر(ها) در صف اعلان می‌نشیند و همان‌جا
 * dispatch می‌شود → مُهر alerts.last_evaluated_at را می‌نویسد (حتی با صفر هشدار — نشانِ
 * «دیدیم و چیزی نبود»). هیچ‌کجایش throw نمی‌کند؛ خرابی فقط لاگ می‌شود تا digest نخوابد.
 */
export async function runAlertCycle(deps: AlertCycleDeps): Promise<AlertCycleOutcome> {
  const { db, health, notify, logger } = deps;

  if (alertsDisabledFlag(deps.alertsDisabled)) {
    logger.info('alert.cycle.disabled', { reason: 'ALERTS_DISABLED' });
    return { disabled: true, evaluated_at: null, alerts: [], enqueued: 0 };
  }

  const evaluatedAt = new Date().toISOString();
  const clientErrorsMax = parseClientErrorsMax(deps.clientErrorsMax);

  // ارزیابی با همان دادهٔ پنل — خرابی هر بخش داخل panel() فقط null/degraded است، هرگز throw
  const panel = await health.panel();
  const alerts = deriveAlerts(panel, clientErrorsMax);

  let enqueued = 0;
  if (alerts.length > 0) {
    for (const alert of alerts) {
      logger.error(`alert.${alert.code}`, {
        severity: alert.severity,
        message: alert.message,
        now: evaluatedAt
      });
    }
    // پیام یکجا برای مدیر(ها) — صف اعلان موجود، dedupKey روزانه تا دوباره‌کاری صفر بماند
    const todayYmd = evaluatedAt.slice(0, 10);
    const text = ['هشدار خودکار سامانه', '', ...alerts.map((a) => `• ${a.message}`)].join('\n');
    try {
      enqueued = await notify.enqueueOwnerAlert(text, `alert:${todayYmd}`);
      if (enqueued > 0) await notify.dispatchPending(25);
    } catch (err: unknown) {
      // درگاه اعلان نبود/خراب شد؟ هشدار در لاگ و پنل باقی می‌ماند — ارزیابی نمی‌سوزد
      logger.warn('alert.notify.failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  try {
    await writeAlertsSeal(db, evaluatedAt);
  } catch (err: unknown) {
    logger.warn('alert.seal.failed', { error: err instanceof Error ? err.message : String(err) });
  }

  logger.info('alert.cycle.done', { evaluated_at: evaluatedAt, alerts: alerts.length, enqueued });
  return { disabled: false, evaluated_at: evaluatedAt, alerts, enqueued };
}
