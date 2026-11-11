// سرویس خطاهای کلاینت: نوشتن بی‌نام محدودشده روی جدول موجود 0057 + خواندن فقط‌مدیر + نگه‌داری ۹۰روزه
// هم‌الگوی @app/rum — نوشتن عمومی بیرون authMiddleware با سقف بدنه و محدودکنندهٔ نرخ per-isolate
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { RateLimitError } from '@core/errors';
import { makeRateLimiter } from '@app/rum/pure'; // تابع محض عمومی (محدودکنندهٔ نرخ درون‌حافظه) — بدون وابستگی دامنه
import type { RateLimiter } from '@app/rum/pure';

export interface ClientErrorInput {
  message: string;
  source?: string | null;
  line?: number | null;
  col?: number | null;
  stack?: string | null;
  url?: string | null;
  app_version?: string | null;
}

export interface ClientErrorRow {
  id: string;
  occurred_at: string;
  message: string;
  source: string | null;
  line: number | null;
  col: number | null;
  stack: string | null;
  url: string | null;
  app_version: string | null;
}

export interface ClientErrorsWindow {
  window_days: number;
  total: number;
  errors: ClientErrorRow[];
}

export interface ClientErrorsDeps {
  db: DbClient;
  logger: Logger;
  /** سقف درخواست per isolate — پیش‌فرض ۶۰ در دقیقه (کلاینت خودش ≤۱۰ در نشست است) */
  rateLimit?: { max: number; windowMs: number };
}

/** برش دفاعی — قرارداد ستون‌ها؛ کلاینت هم قبل از ارسال می‌بُرد ولی مشتریان کهنه بی‌گارد نمی‌مانند */
function clip(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

const RETENTION_DAYS = 90; // کرون شبانه این سقف را اجرا می‌کند (هم‌سایهٔ rum_events)

export interface ClientErrorsService {
  /** دروازهٔ نرخ برای مسیر عمومی — تخطی ⇒ RateLimitError (۴۲۹) */
  assertAllowed(): void;
  /** ثبت خطای اعتبارسنجی‌شده (توسط zod مسیر) — شناسهٔ ردیف ثبت‌شده */
  record(input: ClientErrorInput): Promise<string>;
  /** خطاهای روزهای اخیر (فقط‌مدیر) — تازه‌ترین اول؛ line_no/col_no با قرارداد line/col */
  recent(days: number, limit: number): Promise<ClientErrorsWindow>;
  /** حذف ردیف‌های قدیم‌تر از سقف نگه‌داری (کرون شبانه) — تعداد حذف‌شده */
  pruneOld(): Promise<number>;
}

export function createClientErrorsService(deps: ClientErrorsDeps): ClientErrorsService {
  const { db, logger } = deps;
  const limiter: RateLimiter = makeRateLimiter(deps.rateLimit?.max ?? 60, deps.rateLimit?.windowMs ?? 60_000);

  return {
    assertAllowed(): void {
      if (!limiter.allow()) {
        throw new RateLimitError(60, 'ترافیک گزارش خطا بیش از حد مجاز است');
      }
    },

    async record(input: ClientErrorInput): Promise<string> {
      const id = crypto.randomUUID();
      // occurred_at با DEFAULT datetime('now') پر می‌شود — هم‌قرارداد COUNTهای cp-report
      // (occurred_at >= datetime('now','-24 hours'))؛ user_agent عمداً هرگز نوشته نمی‌شود (PII)
      await db.execute(
        `INSERT INTO client_errors (id, message, source, line_no, col_no, stack, url, app_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          clip(input.message, 500) ?? '',
          clip(input.source, 300),
          input.line ?? null,
          input.col ?? null,
          clip(input.stack, 2000),
          clip(input.url, 300),
          clip(input.app_version, 20)
        ]
      );
      logger.debug('client_error.recorded', { id });
      return id;
    },

    async recent(days: number, limit: number): Promise<ClientErrorsWindow> {
      // گیرهٔ پنجره: ۱..۹۰ روز؛ گیرهٔ سقف ردیف: ۱..۵۰۰ — NaN از مسیر می‌آید تا پیش‌فرض بماند
      const windowDays = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days), 1), 90) : 7;
      const rowLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 500) : 200;
      const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      const rows = await db.query<ClientErrorRow>(
        `SELECT id, occurred_at, message, source, line_no AS line, col_no AS col, stack, url, app_version
           FROM client_errors
          WHERE occurred_at >= ?
          ORDER BY occurred_at DESC, rowid DESC
          LIMIT ?`,
        [since, rowLimit]
      );
      const countRow = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM client_errors WHERE occurred_at >= ?`,
        [since]
      );
      return { window_days: windowDays, total: countRow?.n ?? rows.length, errors: rows };
    },

    async pruneOld(): Promise<number> {
      // برش با فرمت هم‌قرارداد datetime('now') جدول 0057 — 'YYYY-MM-DD HH:MM:SS'
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      const deleted = await db.query<{ id: string }>(
        `DELETE FROM client_errors WHERE occurred_at < ? RETURNING id`,
        [cutoff]
      );
      return deleted.length;
    }
  };
}
