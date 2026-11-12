// پنل سلامت (ف۱ طرح ارتقا — CP-3): وضعیت واقعی سامانه و لینک CP از مُهرهای settings
// هیچ زیرساخت تازه‌ای — همهٔ داده همین حالا در settings/جدول‌ها هست (طرح §۳-۹).
// فقط خواندن، فقط‌مدیر؛ هرگز throw نمی‌کند (حکم ماتریس خرابی §۳-۵: سلامت نباید خودش بیمار باشد).
import { APP_VERSION } from '@core/version';
import { CP_SYNC_SETTINGS_KEY, CP_SYNC_ATTEMPT_KEY } from '@app/cp-sync/announcements';
import { CP_CONTENT_SYNC_KEY, CP_CONTENT_PUSH_KEY, CP_CONTENT_ATTEMPT_KEY } from '@app/cp-content/sync';
import { CP_REPORT_PUSH_KEY, CP_REPORT_ATTEMPT_KEY } from '@app/cp-report/ingest';
import { BUG_REPORT_ATTEMPT_KEY, BUG_REPORT_REPLY_SINCE_KEY } from '@app/bug-report-forward';
import { deriveAlerts, readAlertsSeal, parseClientErrorsMax } from './alerts'; // ف۵ (P0-3) — مشتق هشدارها از همین دادهٔ پنل
import type { DbClient } from '@core/db';

export interface HealthChannelStatus {
  key: string;
  label: string;
  direction: 'pull' | 'push';
  /** آخرین تلاش — مُهر رگولاتور مشترک کرون/فرصت‌طلب */
  attempt_at: string | null;
  /** آخرین موفقیت — مُهر since فقط روی موفقیت پیش می‌رود (یا MAX(forwarded_at) برای گزارش باگ) */
  success_at: string | null;
  /** فاصلهٔ آخرین موفقیت تا حال بر حسب ثانیه — هیچ موفقیتی = null */
  age_s: number | null;
  state: 'ok' | 'stale' | 'never';
  /** آستانهٔ ok این درگاه بر حسب ثانیه — سخاوتمندانه، چون چرخه‌ها فرصت‌طلب روی ترافیک زنده‌اند (شب بی‌ترافیک طبیعی است) */
  threshold_s: number;
}

export interface HealthPanelData {
  version: string;
  env: string | null;
  now: string;
  db: { ok: boolean; latency_ms: number | null };
  migrations: { applied: number | null };
  counts: {
    client_errors_24h: number | null;
    rum_events_24h: number | null;
    bug_reports_open: number | null;
  };
  cp_link: {
    configured: boolean;
    channels: HealthChannelStatus[];
  };
  /** ف۵ (P0-3) — هشدارهای فعالِ همین لحظه — م۲۱۰: فقط قاعدهٔ محلی-نودی (جهش خطاهای مرورگر)؛ هشدار درگاه‌های CP مالکیت کنترل‌پلین است (CP m9 → channel_alerts) و در نود مشتق نمی‌شود */
  alerts: HealthAlert[];
  /** ف۵ (P0-3) — مُهر آخرین ارزیابی خودکار کرون شبانه (settings: alerts.last_evaluated_at) */
  alerts_last_evaluated_at: string | null;
}

/**
 * کد پایدار هشدار نود — م۲۱۰: فقط `client_errors_spike` (قاعدهٔ محلی-نودی).
 * کد `cp_seal_drift` از نود حذف شد؛ رانش مُهر درگاه‌های CP فقط در کنترل‌پلین هشدار می‌شود
 * (CP m9/۱.۱۳.۰ — جدول channel_alerts با kind='seal_drift' + ack/resolve + رساندن اختیاری).
 */
export interface HealthAlert {
  code: 'client_errors_spike';
  message: string;
  severity: 'error' | 'warning';
}

export interface HealthDeps {
  db: DbClient;
  /** CP سه‌متغیره کامل است؟ (kill switch معکوس) */
  cpConfigured: boolean;
  envName: string | null;
  /** ف۵ (P0-3) — آستانهٔ هشدار خطاهای مرورگر (env خام ALERT_CLIENT_ERRORS_MAX؛ نبود = پیش‌فرض ۱۰۰) */
  clientErrorsMax?: number | string | null;
}

interface ChannelDef {
  key: string;
  label: string;
  direction: 'pull' | 'push';
  attemptKey: string | null;
  successKey: string | null;
  /** درگاه‌هایی که مُهر موفقیت جدولی دارند به‌جای settings (گزارش باگ: MAX(forwarded_at)) */
  successFromTable?: boolean;
  threshold_s: number;
}

/**
 * آستانه‌ها خیلی بالاتر از ریتم قراردادند چون روی پلن Free چرخه‌ها فرصت‌طلب روی ترافیک زنده‌اند
 * (§۳-۱: «CP_SYNC_CRON ثبت نیست») — شب بی‌ترافیک مرکز کلینیک طبیعی است و نباید stale بنامد.
 */
const CHANNELS: ChannelDef[] = [
  { key: 'announcements', label: 'اعلان‌های شبکه (CP→نود)', direction: 'pull', attemptKey: CP_SYNC_ATTEMPT_KEY, successKey: CP_SYNC_SETTINGS_KEY, threshold_s: 6 * 3600 },
  { key: 'kpi_report', label: 'گزارش KPI روزانه (نود→CP)', direction: 'push', attemptKey: CP_REPORT_ATTEMPT_KEY, successKey: CP_REPORT_PUSH_KEY, threshold_s: 48 * 3600 },
  { key: 'content_push', label: 'همرسانی محتوا (نود→CP)', direction: 'push', attemptKey: CP_CONTENT_ATTEMPT_KEY, successKey: CP_CONTENT_PUSH_KEY, threshold_s: 72 * 3600 },
  { key: 'content_pull', label: 'برگزیده‌های شبکه (CP→نود)', direction: 'pull', attemptKey: CP_CONTENT_ATTEMPT_KEY, successKey: CP_CONTENT_SYNC_KEY, threshold_s: 6 * 3600 },
  { key: 'bug_forward', label: 'گزارش باگ → CP', direction: 'push', attemptKey: BUG_REPORT_ATTEMPT_KEY, successKey: null, successFromTable: true, threshold_s: 72 * 3600 },
  { key: 'bug_replies', label: 'پاسخ پشتیبانی (CP→نود)', direction: 'pull', attemptKey: BUG_REPORT_ATTEMPT_KEY, successKey: BUG_REPORT_REPLY_SINCE_KEY, threshold_s: 6 * 3600 }
];

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

async function countSafe(db: DbClient, sql: string, params: unknown[] = []): Promise<number | null> {
  try {
    const row = await db.queryOne<{ n: number }>(sql, params);
    return row?.n ?? null;
  } catch {
    return null; // جدول غایب/قطعی D1 — پنل باید بی‌صدا degraded بماند نه ۵۰۰ بدهد
  }
}

export interface HealthService {
  /** همهٔ شاخص‌ها با یک فراخوانی — خرابی هر جزء فقط null/degraded، هرگز throw */
  panel(): Promise<HealthPanelData>;
}

export function createHealthService(deps: HealthDeps): HealthService {
  const { db, cpConfigured, envName } = deps;
  // آستانهٔ خطاهای مرورگر یک‌بار در ساخت پارس می‌شود (env در طول عمر isolate تغییر نمی‌کند)
  const clientErrorsMax = parseClientErrorsMax(deps.clientErrorsMax);

  return {
    async panel(): Promise<HealthPanelData> {
      const now = new Date();

      // — D1 زنده است؟ + تأخیر واقعی یک SELECT 1
      let dbOk = true;
      let latencyMs: number | null = null;
      const t0 = Date.now();
      try {
        await db.queryOne('SELECT 1 AS ok');
        latencyMs = Date.now() - t0;
      } catch {
        dbOk = false;
        latencyMs = null;
      }

      const migrationsApplied = await countSafe(db, 'SELECT COUNT(*) AS n FROM d1_migrations');

      // — وضعیت درگاه‌های CP از مُهرهای settings + MAX(forwarded_at) جدولی برای گزارش باگ
      const successStamps = new Map<string, string | null>();
      for (const def of CHANNELS) {
        if (def.successFromTable) {
          // گزارش باگ مُهر settings ندارد — آخرین ارسال موفق ردیف‌های status='sent' شاهد است
          try {
            const maxRow = await db.queryOne<{ m: string | null }>("SELECT MAX(forwarded_at) AS m FROM bug_reports WHERE status = 'sent'");
            const m = maxRow?.m ?? null;
            // فرمت جدول 0101 'YYYY-MM-DD HH:MM:SS' → ISO برای هم‌سن‌جلس با مُهرهای settings
            successStamps.set(def.key, m ? m.replace(' ', 'T') + 'Z' : null);
          } catch {
            successStamps.set(def.key, null);
          }
        } else {
          successStamps.set(def.key, await readIsoStamp(db, def.successKey ?? ''));
        }
      }

      const channels: HealthChannelStatus[] = [];
      for (const def of CHANNELS) {
        const successAt = cpConfigured ? successStamps.get(def.key) ?? null : null;
        const attemptAt = cpConfigured && def.attemptKey ? await readIsoStamp(db, def.attemptKey) : null;
        let ageS: number | null = null;
        let state: HealthChannelStatus['state'] = 'never';
        if (!cpConfigured || !successAt) {
          state = 'never'; // خاموش کامل یا هنوز هیچ موفقیتی ثبت نشده
        } else {
          const t = Date.parse(successAt);
          if (!Number.isNaN(t)) {
            ageS = Math.max(0, Math.round((now.getTime() - t) / 1000));
            state = ageS <= def.threshold_s ? 'ok' : 'stale';
          }
        }
        channels.push({
          key: def.key,
          label: def.label,
          direction: def.direction,
          attempt_at: attemptAt,
          success_at: successAt,
          age_s: ageS,
          state,
          threshold_s: def.threshold_s
        });
      }

      const counts = {
        // client_errors/bug_reports: فرمت datetime('now') = 'YYYY-MM-DD HH:MM:SS' — هم‌قرارداد COUNTهای cp-report
        client_errors_24h: await countSafe(db, "SELECT COUNT(*) AS n FROM client_errors WHERE occurred_at >= datetime('now', '-24 hours')"),
        // rum_events: ستون ts با فرمت ISO UTC (0086) — پارامتری، نه datetime()
        rum_events_24h: await countSafe(db, 'SELECT COUNT(*) AS n FROM rum_events WHERE ts >= ?', [new Date(now.getTime() - 86_400_000).toISOString()]),
        bug_reports_open: await countSafe(db, "SELECT COUNT(*) AS n FROM bug_reports WHERE status = 'open'")
      };

      const panelData: HealthPanelData = {
        version: APP_VERSION,
        env: envName,
        now: now.toISOString(),
        db: { ok: dbOk, latency_ms: latencyMs },
        migrations: { applied: migrationsApplied },
        counts,
        cp_link: {
          configured: cpConfigured,
          channels
        },
        alerts: [],
        alerts_last_evaluated_at: await readAlertsSeal(db)
      };
      // ف۵ (P0-3) — هشدارهای فعال از همان دادهٔ همین پنل مشتق می‌شوند (بدون رفت‌وبرگشت تازه)
      panelData.alerts = deriveAlerts(panelData, clientErrorsMax);
      return panelData;
    }
  };
}
