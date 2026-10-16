/**
 * سرویس کلیدهای API — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// ماژول کلیدهای API — مالک جدول api_keys
// قوانین:
// * مقدار کلید هرگز ذخیره نمی‌شود (فقط SHA-256) و فقط یک‌بار برگردانده می‌شود
// * ساخت/ابطال فقط مدیر (RBAC در routes) + audit همیشگی
// * کلیدهای باطل‌شده حذف نمی‌شوند — append-only برای trace

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { ApiKeyCreated, ApiKeyRecord, AuthContext, StaffRole } from '@core/shared';
import { NotFoundError } from '@core/errors';
import { generateApiKey } from '@core/auth';

export interface KeysDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface KeysService {
  create(name: string, role: StaffRole, actor: AuthContext): Promise<ApiKeyCreated>;
  list(): Promise<ApiKeyRecord[]>;
  revoke(id: string, actor: AuthContext): Promise<ApiKeyRecord>;
}

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  role: StaffRole;
  active: number;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

function toRecord(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    role: row.role,
    active: row.active === 1,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at
  };
}

export function createKeysService(deps: KeysDeps): KeysService {
  const { db, audit, logger } = deps;
  const log = logger.child('keys');

  return {
    async create(name: string, role: StaffRole, actor: AuthContext): Promise<ApiKeyCreated> {
      const { token, prefix, keyHash } = await generateApiKey('live');
      const id = crypto.randomUUID();
      // تاریخ‌ها در کد تولید می‌شوند تا record بدون read-after-write داخل tx ساخته شود
      // (batch collector — writes داخل tx تا پایان batch اعمال نمی‌شوند)
      const createdAt = new Date().toISOString();

      const record: ApiKeyRecord = await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO api_keys (id, name, prefix, key_hash, role, active, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
          [id, name, prefix, keyHash, role, actor.staffId, createdAt]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'apikey.create',
          resourceType: 'api_key',
          resourceId: id,
          changes: {
            name: { from: null, to: name },
            role: { from: null, to: role },
            prefix: { from: null, to: prefix }
          }
        });
        return {
          id, name, prefix, role,
          active: true,
          lastUsedAt: null,
          createdAt,
          revokedAt: null
        };
      });

      log.info('apikey.created', { prefix, role });
      return { record, token };
    },

    async list(): Promise<ApiKeyRecord[]> {
      const rows = await db.query<ApiKeyRow>(
        `SELECT id, name, prefix, role, active, last_used_at, created_at, revoked_at
         FROM api_keys ORDER BY created_at DESC, id DESC`,
        []
      );
      return rows.map(toRecord);
    },

    async revoke(id: string, actor: AuthContext): Promise<ApiKeyRecord> {
      const current = await db.queryOne<ApiKeyRow>(`SELECT * FROM api_keys WHERE id = ?`, [id]);
      if (!current) {
        throw new NotFoundError('کلید یافت نشد');
      }
      const revokedAt = new Date().toISOString();

      const record: ApiKeyRecord = await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE api_keys SET active = 0, revoked_at = ? WHERE id = ?`,
          [revokedAt, id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'apikey.revoke',
          resourceType: 'api_key',
          resourceId: id,
          changes: {
            active: { from: current.active === 1, to: false },
            prefix: { from: current.prefix, to: current.prefix }
          }
        });
        return toRecord({ ...current, active: 0, revoked_at: revokedAt });
      });

      log.info('apikey.revoked', { prefix: record.prefix });
      return record;
    }
  };
}
