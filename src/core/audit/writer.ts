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
