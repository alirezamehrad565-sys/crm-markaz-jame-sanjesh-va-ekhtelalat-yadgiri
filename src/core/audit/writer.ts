import type { DbClient } from '@core/db';

export interface AuditEntry {
  actorId: string;
  action: string; // مثلاً appointment.create
  resourceType: string;
  resourceId: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

export interface AuditWriter {
  log(entry: AuditEntry): Promise<void>;
  logInTransaction(tx: DbClient, entry: AuditEntry): Promise<void>;
  /**
   * نگه‌داری `audit_log` (ف۴ طرح ارتقا — P1-4): حذف ردیف‌های قدیم‌تر از سقف نگه‌داری —
   * فقط از چرخهٔ کرون شبانه (runDigestCycle) صدا زده می‌شود، هرگز مسیر درخواست نیست.
   * تعداد حذف‌شده برمی‌گردد؛ صفر یعنی «خاموش» یا «چیزی برای حذف نبود».
   */
  pruneOld(): Promise<number>;
}

/** پیش‌فرض نگه‌داری audit_log بر حسب روز — P1-4: «۱۸۰ روز + آرشیو سالانه در بکاپ» */
export const AUDIT_RETENTION_DAYS_DEFAULT = 180;

/**
 * تفسیر متغیر محیطی اختیاری `AUDIT_LOG_RETENTION_DAYS` (ف۴):
 *   نبود/رشتهٔ خالی/غیرعددی/منفی → پیش‌فرض ۱۸۰ · صفر → پاکسازی خاموش · عدد مثبت → همان سقف.
 * مقادیر env در Workers رشته می‌آیند؛ پس رشتهٔ «۹۰» هم می‌پذیریم. خروجی همیشه عدد صحیح ≥ ۰.
 */
export function parseAuditRetentionDays(raw: unknown): number {
  // نبودِ مقدار (undefined/null/رشتهٔ خالی) = «تنظیم‌نشده» — پیش‌فرض، نه خاموشی
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return AUDIT_RETENTION_DAYS_DEFAULT;
  }
  const n = typeof raw === 'string' ? Number(raw.trim()) : Number(raw);
  if (!Number.isFinite(n) || n < 0) return AUDIT_RETENTION_DAYS_DEFAULT;
  return Math.trunc(n);
}

function buildInsert(entry: AuditEntry): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO audit_log (id, actor_id, action, resource_type, resource_id, changes)
          VALUES (?, ?, ?, ?, ?, ?)`,
    params: [
      crypto.randomUUID(),
      entry.actorId,
      entry.action,
      entry.resourceType,
      entry.resourceId,
      entry.changes ? JSON.stringify(entry.changes) : null
    ]
  };
}

export function createAuditWriter(db: DbClient, opts?: { retentionDays?: number }): AuditWriter {
  // سقف نگه‌داری هنگام ساخت نویسنده بسته می‌شود (کرون با env می‌سازد؛ بقیهٔ صداها پیش‌فرض ۱۸۰)
  const retentionDays = opts?.retentionDays !== undefined ? parseAuditRetentionDays(opts.retentionDays) : AUDIT_RETENTION_DAYS_DEFAULT;
  return {
    async log(entry: AuditEntry): Promise<void> {
      const { sql, params } = buildInsert(entry);
      await db.execute(sql, params);
    },
    async logInTransaction(tx: DbClient, entry: AuditEntry): Promise<void> {
      const { sql, params } = buildInsert(entry);
      await tx.execute(sql, params);
    },
    async pruneOld(): Promise<number> {
      // خاموشی صریح با ۰ — «نگه‌داری نامحدود» برای عملیات داده‌ای
      if (retentionDays === 0) return 0;
      // برش با فرمت هم‌قرارداد datetime('now') جدول 0001 — 'YYYY-MM-DD HH:MM:SS'
      // مرز: «قدیم‌تر از» سقف حذف می‌شود؛ ردیف دقیقاً روی خطِ برش می‌ماند (هم‌الگوی client_errors/rum)
      const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
      // شمارش از meta.changes (هم‌الگوی games.maintenance) — دقیق روی D1 واقعی و هارنس ماک
      const res = await db.execute(`DELETE FROM audit_log WHERE created_at < ?`, [cutoff]);
      return typeof res?.meta?.changes === 'number' ? res.meta.changes : 0;
    }
  };
}
