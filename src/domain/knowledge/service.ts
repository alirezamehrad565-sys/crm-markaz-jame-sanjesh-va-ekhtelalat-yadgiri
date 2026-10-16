/**
 * ماژول پایگاه دانش — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// دانش‌افزایی مرکز
// پایگاه دانش داخلی همکاران (نکتهٔ آموزشی/پروتکل/مقاله/خبر) — الگوی اعلان‌های
// مالکیت WRITE: دفتر (مدیر/منشی) — حذف کامل فقط مدیر؛ خواندن همهٔ همکاران احرازشده

import type { AuthContext, KnowledgeCategory, KnowledgeRecord } from '@core/shared';
import { NotFoundError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import type { KnowledgeService, NewKnowledgeInput, UpdateKnowledgeInput } from './types';

interface KnowledgeRow {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: number;
  published: number;
  created_by: string;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: KnowledgeRow): KnowledgeRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category as KnowledgeCategory,
    pinned: row.pinned === 1,
    published: row.published === 1,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SELECT_COLS = `k.id, k.title, k.body, k.category, k.pinned, k.published,
       k.created_by, s.full_name AS created_by_name, k.created_at, k.updated_at`;

export interface KnowledgeDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export function createKnowledgeService(deps: KnowledgeDeps): KnowledgeService {
  const { db, audit, logger } = deps;

  async function getById(id: string): Promise<KnowledgeRecord | null> {
    const row = await db.queryOne<KnowledgeRow>(
      `SELECT ${SELECT_COLS} FROM knowledge_items k JOIN staff s ON s.id = k.created_by WHERE k.id = ?`,
      [id]
    );
    return row ? rowToRecord(row) : null;
  }

  return {
    async listPublished() {
      // سنجاق‌شده اول، سپس تازه‌ترین — فقط منتشرشده‌ها
      const rows = await db.query<KnowledgeRow>(
        `SELECT ${SELECT_COLS} FROM knowledge_items k JOIN staff s ON s.id = k.created_by
          WHERE k.published = 1
          ORDER BY k.pinned DESC, k.created_at DESC
          LIMIT 30`
      );
      return rows.map(rowToRecord);
    },

    async listAll() {
      const rows = await db.query<KnowledgeRow>(
        `SELECT ${SELECT_COLS} FROM knowledge_items k JOIN staff s ON s.id = k.created_by
          ORDER BY k.pinned DESC, k.created_at DESC
          LIMIT 200`
      );
      return rows.map(rowToRecord);
    },

    async create(input, actor) {
      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO knowledge_items (id, title, body, category, pinned, published, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, input.title, input.body, input.category, input.pinned ? 1 : 0, input.published ? 1 : 0, actor.staffId, nowIso, nowIso]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'knowledge.create',
          resourceType: 'knowledge',
          resourceId: id,
          changes: {
            title: { from: null, to: input.title },
            category: { from: null, to: input.category },
            published: { from: null, to: input.published ? 1 : 0 }
          }
        });
      });
      logger.child('knowledge').info('knowledge.created', { id });
      return (await getById(id)) as KnowledgeRecord;
    },

    async update(id, input, actor) {
      const existing = await getById(id);
      if (!existing) throw new NotFoundError('مقالهٔ دانش');

      const next = {
        title: input.title ?? existing.title,
        body: input.body ?? existing.body,
        category: input.category ?? existing.category,
        pinned: input.pinned ?? existing.pinned,
        published: input.published ?? existing.published
      };

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE knowledge_items
              SET title = ?, body = ?, category = ?, pinned = ?, published = ?, updated_at = ?
            WHERE id = ?`,
          [next.title, next.body, next.category, next.pinned ? 1 : 0, next.published ? 1 : 0, new Date().toISOString(), id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'knowledge.update',
          resourceType: 'knowledge',
          resourceId: id,
          changes: {
            title: { from: existing.title, to: next.title },
            published: { from: existing.published ? 1 : 0, to: next.published ? 1 : 0 },
            pinned: { from: existing.pinned ? 1 : 0, to: next.pinned ? 1 : 0 }
          }
        });
      });
      logger.child('knowledge').info('knowledge.updated', { id });
      return (await getById(id)) as KnowledgeRecord;
    },

    async remove(id, actor) {
      const existing = await getById(id);
      if (!existing) throw new NotFoundError('مقالهٔ دانش');
      await db.transaction(async (tx) => {
        await tx.execute(`DELETE FROM knowledge_items WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'knowledge.delete',
          resourceType: 'knowledge',
          resourceId: id,
          changes: { title: { from: existing.title, to: null } }
        });
      });
      logger.child('knowledge').info('knowledge.deleted', { id });
      return { id };
    }
  };
}
