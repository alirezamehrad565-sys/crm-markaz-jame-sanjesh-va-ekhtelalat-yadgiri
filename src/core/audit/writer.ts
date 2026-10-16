/**
 * ثبت رخدادهای audit به‌صورت append-only — نویسندهٔ رخداد audit
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Audit log helper — ثبت تغییرات به‌صورت هم‌تراکنش (قانون ۴)
// قوانین داخلی:
// - audit در همان transaction با تغییر اصلی نوشته می‌شود (logInTransaction)
// - فقط فیلدهای تغییرکرده (changes)
// - append-only — هیچ‌وقت UPDATE یا DELETE روی audit_log
// - no PII در action

import type { DbClient } from '@core/db';

export interface AuditEntry {
  actorId: string;
  action: string; // e.g. 'appointment.create'
  resourceType: string;
  resourceId: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

export interface AuditWriter {
  /** ثبت مستقیم روی db (خارج از تراکنش) */
  log(entry: AuditEntry): Promise<void>;
  /** ثبت داخل تراکنش — در همان batch با تغییر اصلی اجرا می‌شود */
  logInTransaction(tx: DbClient, entry: AuditEntry): Promise<void>;
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

export function createAuditWriter(db: DbClient): AuditWriter {
  return {
    async log(entry: AuditEntry): Promise<void> {
      const { sql, params } = buildInsert(entry);
      await db.execute(sql, params);
    },
    async logInTransaction(tx: DbClient, entry: AuditEntry): Promise<void> {
      const { sql, params } = buildInsert(entry);
      await tx.execute(sql, params);
    }
  };
}
