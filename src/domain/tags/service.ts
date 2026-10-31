import type { TagCategory, TagRecord, TagRef } from '@core/shared';
import { ConflictError, NotFoundError } from '@core/errors';
import { diffStudentTags, normalizeTagName } from './pure';
import type { ListTagsFilters, NewTagInput, TagDeps, TagService } from './types';

interface TagRow {
  id: string;
  name: string;
  category: TagCategory;
  color: string | null;
  active: number;
  usage?: number;
}

function rowToTag(row: TagRow): TagRecord {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    color: row.color,
    active: row.active === 1,
    usageCount: row.usage ?? 0
  };
}

function rowToRef(row: TagRow): TagRef {
  return { id: row.id, name: row.name, category: row.category, color: row.color };
}

const USAGE_SUBQUERY = `(SELECT COUNT(*) FROM student_tags st WHERE st.tag_id = t.id) AS usage`;

export function createTagService(deps: TagDeps): TagService {
  const { db, audit, logger } = deps;

  return {
    async list(filters: ListTagsFilters): Promise<TagRecord[]> {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (filters.category) {
        conditions.push('t.category = ?');
        params.push(filters.category);
      }
      if (filters.active !== undefined) {
        conditions.push('t.active = ?');
        params.push(filters.active ? 1 : 0);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await db.query<TagRow>(
        `SELECT t.id, t.name, t.category, t.color, t.active, ${USAGE_SUBQUERY}
           FROM tags t ${where}
          ORDER BY t.category, t.name`,
        params
      );
      return rows.map(rowToTag);
    },

    async getById(id: string): Promise<TagRecord | null> {
      const row = await db.queryOne<TagRow>(
        `SELECT t.id, t.name, t.category, t.color, t.active, ${USAGE_SUBQUERY}
           FROM tags t WHERE t.id = ?`,
        [id]
      );
      return row ? rowToTag(row) : null;
    },

    async create(input: NewTagInput, actor): Promise<TagRecord> {
      const name = normalizeTagName(input.name);

      const dup = await db.queryOne<{ id: string }>(
        `SELECT id FROM tags WHERE category = ? AND name = ?`,
        [input.category, name]
      );
      if (dup) throw new ConflictError('برچسب هم‌نام در این دسته قبلاً ثبت شده است');

      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO tags (id, name, category, color) VALUES (?, ?, ?, ?)`,
          [id, name, input.category, input.color ?? null]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'tag.create',
          resourceType: 'tag',
          resourceId: id,
          changes: {
            name: { from: null, to: name },
            category: { from: null, to: input.category }
          }
        });
      });
      logger.child('tags').info('tag.created', { category: input.category });
      const created = await this.getById(id);
      return created as TagRecord;
    },

    async deactivate(id: string, actor): Promise<TagRecord> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<TagRow>(
          `SELECT t.id, t.name, t.category, t.color, t.active, ${USAGE_SUBQUERY}
             FROM tags t WHERE t.id = ?`,
          [id]
        );
        if (!row) throw new NotFoundError('برچسب');
        if (row.active === 0) throw new ConflictError('برچسب قبلاً غیرفعال شده است');

        await tx.execute(`UPDATE tags SET active = 0 WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'tag.deactivate',
          resourceType: 'tag',
          resourceId: id,
          changes: { active: { from: 1, to: 0 } }
        });
        logger.child('tags').info('tag.deactivated');
        return rowToTag({ ...row, active: 0 });
      });
    },

    async forStudent(studentId: string): Promise<TagRef[]> {
      const rows = await db.query<TagRow>(
        `SELECT t.id, t.name, t.category, t.color, t.active
           FROM student_tags st
           JOIN tags t ON t.id = st.tag_id
          WHERE st.student_id = ? AND t.active = 1
          ORDER BY t.category, t.name`,
        [studentId]
      );
      return rows.map(rowToRef);
    },

    async replaceForStudent(studentId: string, tagIds: string[], actor): Promise<TagRef[]> {
      return db.transaction(async (tx) => {
        const student = await tx.queryOne<{ id: string }>(`SELECT id FROM students WHERE id = ?`, [studentId]);
        if (!student) throw new NotFoundError('دانش‌آموز');

        const unique = [...new Set(tagIds)];

        if (unique.length > 0) {
          const placeholders = unique.map(() => '?').join(', ');
          const found = await tx.query<{ id: string }>(
            `SELECT id FROM tags WHERE active = 1 AND id IN (${placeholders})`,
            unique
          );
          if (found.length !== unique.length) throw new NotFoundError('برچسب');
        }

        const currentRows = await tx.query<TagRow>(
          `SELECT t.id, t.name, t.category, t.color, t.active
             FROM student_tags st JOIN tags t ON t.id = st.tag_id
            WHERE st.student_id = ? AND t.active = 1`,
          [studentId]
        );
        const nextRows =
          unique.length > 0
            ? await tx.query<TagRow>(
                `SELECT t.id, t.name, t.category, t.color, t.active
                   FROM tags t WHERE t.active = 1 AND t.id IN (${unique.map(() => '?').join(', ')})`,
                unique
              )
            : [];

        const current = currentRows.map(rowToRef);
        const next = nextRows.map(rowToRef);
        const diff = diffStudentTags(current, next);

        if (diff.added.length === 0 && diff.removed.length === 0) {
          return current;
        }

        await tx.execute(`DELETE FROM student_tags WHERE student_id = ?`, [studentId]);
        for (const tag of next) {
          await tx.execute(
            `INSERT INTO student_tags (student_id, tag_id) VALUES (?, ?)`,
            [studentId, tag.id]
          );
        }

        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.tags.replace',
          resourceType: 'student',
          resourceId: studentId,
          changes: {
            added: { from: null, to: diff.added },
            removed: { from: null, to: diff.removed }
          }
        });

        logger.child('tags').info('student.tags.replaced', {
          added: diff.added.length,
          removed: diff.removed.length
        });
        return next;
      });
    }
  };
}
