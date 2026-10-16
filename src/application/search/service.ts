/**
 * سرویس جستجوی سراسری — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// جستجوی سراسری — چهار منبع: دانش‌آموزان، کارکنان، مدارس، برچسب‌ها
// فقط خواندنی است؛ هیچ writeی انجام نمی‌دهد.

import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { SEARCH_QUERY_MIN_LENGTH } from '@core/shared';
import type { GlobalSearchResult, SearchGroup, SearchItem } from '@core/shared';
import { capItems, isSearchable, likePattern, orderGroups, sanitizeSearchQuery } from './pure';

export interface SearchDeps {
  db: DbClient;
  logger: Logger;
}

/** سقف نتایج هر گروه — کوچک نگه داشتن پاسخ برای UX پالت سرچ */
const PER_GROUP_LIMIT = { students: 6, staff: 4, schools: 3, tags: 4, waitlist: 4 };

/** برچسب سبک برای subtitle کارکنان/برچسب‌ها — نمایش سمت فرانت با label map انجام می‌شود؛
 * اینجا فقط مقدار خام برمی‌گردد تا لایه API از copy فرانت بی‌خبر بماند. */

export interface SearchService {
  globalSearch(rawQuery: string): Promise<GlobalSearchResult>;
}

export function createSearchService(deps: SearchDeps): SearchService {
  const { db, logger } = deps;

  return {
    async globalSearch(rawQuery: string): Promise<GlobalSearchResult> {
      const q = sanitizeSearchQuery(rawQuery);
      if (!isSearchable(q, SEARCH_QUERY_MIN_LENGTH)) {
        return { query: q, groups: [] };
      }
      const pattern = likePattern(q);
      const started = Date.now();

      const [studentRows, staffRows, schoolRows, tagRows, waitlistRows] = await Promise.all([
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
        // فاز W — منبع پنجم: متقاضیان لیست انتظار (نام/تلفن)
        db.query<{ id: string; first_name: string; last_name: string; phone: string; status: string }>(
          `SELECT id, first_name, last_name, phone, status
             FROM waitlist
            WHERE deleted_at IS NULL
              AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?
                   OR (first_name || ' ' || last_name) LIKE ?)
            ORDER BY last_name, first_name
            LIMIT ${PER_GROUP_LIMIT.waitlist}`,
          [pattern, pattern, pattern, pattern]
        )
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
          // زیرنویس: کد مدرسه اگر دارد، وگرنه نوع
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
