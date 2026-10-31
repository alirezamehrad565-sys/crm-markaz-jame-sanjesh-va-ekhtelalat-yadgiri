// سرویس پایش کارایی (RUM): ثبت بی‌نام رویدادها + جمع‌بندی صدک برای مدیر
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { RateLimitError } from '@core/errors';
import { makeRateLimiter, percentile } from './pure';
import type { RateLimiter } from './pure';

export interface RumEventInput {
  metric: string;
  value: number;
  rating: string;
  nav_id: string;
  path: string;
  viewport_w: number;
  viewport_h: number;
  conn?: string | null;
  device_memory?: number | null;
  prm: boolean;
  theme: string;
}

export interface RumMetricSummary {
  metric: string;
  count: number;
  p50: number;
  p75: number;
  poor_share: number; // سهم نمونه‌های «ضعیف» بین ۰ و ۱
}

export interface RumSummary {
  window_days: number;
  total: number;
  metrics: RumMetricSummary[];
}

export interface RumDeps {
  db: DbClient;
  logger: Logger;
  /** سقف درخواست تله‌متری per isolate — پیش‌فرض ۱۲۰ در دقیقه */
  rateLimit?: { max: number; windowMs: number };
}

const MAX_SUMMARY_ROWS = 20_000; // سقف خواندن برای محاسبهٔ صدک — حجم تله‌متری کلینیک خیلی زیر این است

export interface RumService {
  /** دروازهٔ نرخ برای مسیر عمومی — تخطی ⇒ RateLimitError (۴۲۹) */
  assertAllowed(): void;
  /** ثبت رویدادهای اعتبارسنجی‌شده (توسط zod مسیر) — تعداد ثبت‌شده برمی‌گردد */
  record(events: RumEventInput[]): Promise<number>;
  /** جمع‌بندی صدک سنجه‌ها در پنجرهٔ چندروز اخیر (فقط مدیر) */
  summary(days: number): Promise<RumSummary>;
}

export function createRumService(deps: RumDeps): RumService {
  const { db, logger } = deps;
  const limiter: RateLimiter = makeRateLimiter(deps.rateLimit?.max ?? 120, deps.rateLimit?.windowMs ?? 60_000);

  return {
    assertAllowed(): void {
      if (!limiter.allow()) {
        throw new RateLimitError(60, 'ترافیک تله‌متری بیش از حد مجاز است');
      }
    },

    async record(events: RumEventInput[]): Promise<number> {
      const ts = new Date().toISOString();
      let inserted = 0;
      for (const e of events) {
        await db.query(
          `INSERT INTO rum_events (ts, metric, value, rating, nav_id, path, viewport_w, viewport_h, conn, device_memory, prm, theme)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ts,
            e.metric,
            e.value,
            e.rating,
            e.nav_id,
            e.path,
            e.viewport_w,
            e.viewport_h,
            e.conn ?? null,
            e.device_memory ?? null,
            e.prm ? 1 : 0,
            e.theme
          ]
        );
        inserted += 1;
      }
      if (inserted > 0) {
        logger.child('rum').debug('recorded', { count: inserted });
      }
      return inserted;
    },

    async summary(days: number): Promise<RumSummary> {
      // پیش‌فرض ۷ فقط برای غایب/NaN؛ صفر و منفی با گیرهٔ ۱..۹۰ گرفته می‌شود
      const requested = Number.isFinite(days) ? Math.floor(days) : 7;
      const windowDays = Math.min(Math.max(requested, 1), 90);
      const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
      const rows = await db.query<{ metric: string; value: number; rating: string }>(
        `SELECT metric, value, rating FROM rum_events WHERE ts >= ? ORDER BY metric, value LIMIT ${MAX_SUMMARY_ROWS}`,
        [since]
      );

      const byMetric = new Map<string, { values: number[]; poor: number }>();
      for (const row of rows) {
        let bucket = byMetric.get(row.metric);
        if (!bucket) {
          bucket = { values: [], poor: 0 };
          byMetric.set(row.metric, bucket);
        }
        bucket.values.push(row.value);
        if (row.rating === 'poor') bucket.poor += 1;
      }

      const metrics: RumMetricSummary[] = [...byMetric.entries()].map(([metric, bucket]) => ({
        metric,
        count: bucket.values.length,
        p50: Math.round(percentile(bucket.values, 0.5) * 1000) / 1000,
        p75: Math.round(percentile(bucket.values, 0.75) * 1000) / 1000,
        poor_share: bucket.values.length ? Math.round((bucket.poor / bucket.values.length) * 1000) / 1000 : 0
      }));

      return { window_days: windowDays, total: rows.length, metrics };
    }
  };
}
