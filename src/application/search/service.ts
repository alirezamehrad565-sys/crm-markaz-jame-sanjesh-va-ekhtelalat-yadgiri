import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { SEARCH_QUERY_MIN_LENGTH } from '@core/shared';
import type { GlobalSearchResult, SearchGroup, SearchItem } from '@core/shared';
import { capItems, isSearchable, likePattern, orderGroups, sanitizeSearchQuery } from './pure';

export interface SearchDeps {
  db: DbClient;
  logger: Logger;
}

const PER_GROUP_LIMIT = { students: 6, staff: 4, schools: 3, tags: 4, waitlist: 4 };

export interface SearchService {
  // actorRole: برای گیت نمایش گروه «اسناد» فقط به مدیر/منشی (additive و اختیاری)
  globalSearch(rawQuery: string, actorRole?: string | null): Promise<GlobalSearchResult>;
}

export function createSearchService(deps: SearchDeps): SearchService {
  const { db, logger } = deps;

  return {
    async globalSearch(rawQuery: string, actorRole?: string | null): Promise<GlobalSearchResult> {
      const q = sanitizeSearchQuery(rawQuery);
      if (!isSearchable(q, SEARCH_QUERY_MIN_LENGTH)) {
        return { query: q, groups: [] };
      }
      const pattern = likePattern(q);
      const started = Date.now();

      // گروه «اسناد» فقط برای مدیر/منشی (اسناد اداری خام)
      const canSeeDocs = actorRole === 'manager' || actorRole === 'secretary';
      const [studentRows, staffRows, schoolRows, tagRows, waitlistRows, docRows] = await Promise.all([
        db.query<{
          id: string;
          first_name: string;
          last_name: string;
          grade: string | null;
          national_id: string;
        }>(
          `SELECT id, first_name, last_name, grade, national_id
             FROM students
            WHERE active = 1
              AND (first_name LIKE ? OR last_name LIKE ? OR national_id LIKE ?
                   OR (first_name || ' ' || last_name) LIKE ?)
            ORDER BY last_name, first_name
            LIMIT ${PER_GROUP_LIMIT.students}`,
          [pattern, pattern, pattern, pattern]
        ),
        db.query<{ id: string; full_name: string; role: string }>(
          `SELECT id, full_name, role
             FROM staff
            WHERE active = 1 AND full_name LIKE ?
            ORDER BY full_name
            LIMIT ${PER_GROUP_LIMIT.staff}`,
          [pattern]
        ),
        db.query<{ id: string; name: string; kind: string; code: string | null }>(
          `SELECT id, name, kind, code
             FROM schools
            WHERE active = 1 AND (name LIKE ? OR (code IS NOT NULL AND code LIKE ?))
            ORDER BY name
            LIMIT ${PER_GROUP_LIMIT.schools}`,
          [pattern, pattern]
        ),
        db.query<{ id: string; name: string; category: string; usage: number }>(
          `SELECT t.id, t.name, t.category,
                  (SELECT COUNT(*) FROM student_tags st WHERE st.tag_id = t.id) AS usage
             FROM tags t
            WHERE t.active = 1 AND t.name LIKE ?
            ORDER BY t.category, t.name
            LIMIT ${PER_GROUP_LIMIT.tags}`,
          [pattern]
        ),
        db.query<{ id: string; first_name: string; last_name: string; phone: string; status: string }>(
          `SELECT id, first_name, last_name, phone, status
             FROM waitlist
            WHERE deleted_at IS NULL
              AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?
                   OR (first_name || ' ' || last_name) LIKE ?)
            ORDER BY last_name, first_name
            LIMIT ${PER_GROUP_LIMIT.waitlist}`,
          [pattern, pattern, pattern, pattern]
        ),
        // جستجوی اسناد (عنوان/توضیح/برچسب‌ها) — فقط برای مدیر/منشی اجرا می‌شود
        canSeeDocs
          ? db.query<{ id: string; title: string; category: string }>(
              `SELECT id, title, category
                 FROM docs
                WHERE deleted_at IS NULL
                  AND (title LIKE ? OR description LIKE ? OR tags LIKE ?)
                ORDER BY created_at DESC
                LIMIT 4`,
              [pattern, pattern, pattern]
            )
          : Promise.resolve([] as { id: string; title: string; category: string }[])
      ]);

      const groups: SearchGroup[] = [
        {
          type: 'student',
          items: capItems(
            studentRows.map(
              (r): SearchItem => ({
                type: 'student',
                id: r.id,
                title: `${r.first_name} ${r.last_name}`,
                subtitle: r.grade ?? r.national_id
              })
            ),
            PER_GROUP_LIMIT.students
          )
        },
        {
          type: 'staff',
          items: staffRows.map(
            (r): SearchItem => ({ type: 'staff', id: r.id, title: r.full_name, subtitle: r.role })
          )
        },
        {
          type: 'school',
          items: schoolRows.map(
            (r): SearchItem => ({ type: 'school', id: r.id, title: r.name, subtitle: r.code ?? r.kind })
          )
        },
        {
          type: 'tag',
          items: tagRows.map(
            (r): SearchItem => ({
              type: 'tag',
              id: r.id,
              title: r.name,
              subtitle: r.usage > 0 ? String(r.usage) : null
            })
          )
        },
        {
          type: 'waitlist',
          items: waitlistRows.map(
            (r): SearchItem => ({
              type: 'waitlist',
              id: r.id,
              title: `${r.first_name} ${r.last_name}`,
              subtitle: r.phone
            })
          )
        },
        // گروه اسناد
        {
          type: 'doc',
          items: docRows.map(
            (r): SearchItem => ({
              type: 'doc',
              id: r.id,
              title: r.title,
              subtitle: r.category
            })
          )
        }
      ];

      const result: GlobalSearchResult = { query: q, groups: orderGroups(groups) };
      logger
        .child('search')
        .info('global.search', {
          ms: Date.now() - started,
          hits: result.groups.reduce((n, g) => n + g.items.length, 0)
        });
      return result;
    }
  };
}
