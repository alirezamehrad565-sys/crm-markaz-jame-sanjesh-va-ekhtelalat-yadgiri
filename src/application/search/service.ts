import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { SEARCH_QUERY_MIN_LENGTH } from '@core/shared';
import type { GlobalSearchResult, SearchGroup, SearchItem, SearchEntityType } from '@core/shared';
import { capItems, faHaystackExpr, isSearchable, likePattern, orderGroups, sanitizeFaQuery } from './pure';

export interface SearchDeps {
  db: DbClient;
  logger: Logger;
}

const PER_GROUP_LIMIT = { students: 6, staff: 4, schools: 3, tags: 4, waitlist: 4 };
const DOCS_LIMIT = 4;

/* ۱.۲۷.۸۵ (sdt164: performance-004) — شش پرس‌وجوی موازیِ جستجوی سراسری یک statement شد:
   هر شاخه در زیر-SELECT خودش ORDER BY + LIMIT می‌گیرد (همان ترتیب و همان سقف قبلی) و ستون
   نخستِ literal «kind» بعداً ردیف‌ها را به همان گروه‌های پاسخ قدیمی برمی‌گرداند. شاخهٔ اسناد
   برای نقش غیرمجاز اصلاً به statement نمی‌نشیند (همان گیت مدیر/منشی). LIKE '%q%' و
   faHaystackExpr دست‌نخورده — بدون تغییر schema. */
interface SearchRow {
  kind: SearchEntityType;
  id: string;
  title: string;
  subtitle: string | null;
}

export interface SearchService {
  // actorRole: برای گیت نمایش گروه «اسناد» فقط به مدیر/منشی (additive و اختیاری)
  globalSearch(rawQuery: string, actorRole?: string | null): Promise<GlobalSearchResult>;
}

export function createSearchService(deps: SearchDeps): SearchService {
  const { db, logger } = deps;

  return {
    async globalSearch(rawQuery: string, actorRole?: string | null): Promise<GlobalSearchResult> {
      /* ۱.۲۷.۷۷ — sanitizeFaQuery: نرمال‌سازی فارسی (ي/ك عربی، أ إ آ، ة، نیم‌فاصله، ارقام)
         علاوه بر بهداشت LIKE — جستجوی سراسری هم‌قرارداد لیست دانش‌آموزان شد */
      const q = sanitizeFaQuery(rawQuery);
      if (!isSearchable(q, SEARCH_QUERY_MIN_LENGTH)) {
        return { query: q, groups: [] };
      }
      const pattern = likePattern(q);
      const started = Date.now();

      // گروه «اسناد» فقط برای مدیر/منشی (اسناد اداری خام)
      const canSeeDocs = actorRole === 'manager' || actorRole === 'secretary';
      const docsBranch = canSeeDocs
        ? `UNION ALL SELECT * FROM (
             SELECT 'doc' AS kind, id, title, category AS subtitle
               FROM docs
              WHERE deleted_at IS NULL
                AND (title LIKE ? OR description LIKE ? OR tags LIKE ?)
              ORDER BY created_at DESC
              LIMIT ${DOCS_LIMIT}
           )`
        : '';

      const rows = await db.query<SearchRow>(
        `SELECT * FROM (
           SELECT 'student' AS kind, id,
                  (first_name || ' ' || last_name) AS title,
                  COALESCE(grade, national_id) AS subtitle
             FROM students
            WHERE active = 1
              AND (${faHaystackExpr('first_name')} LIKE ? OR ${faHaystackExpr('last_name')} LIKE ?
                   OR national_id LIKE ?
                   OR ${faHaystackExpr(`(first_name || ' ' || last_name)`)} LIKE ?)
            ORDER BY last_name, first_name
            LIMIT ${PER_GROUP_LIMIT.students}
         )
         UNION ALL SELECT * FROM (
           SELECT 'staff' AS kind, id, full_name AS title, role AS subtitle
             FROM staff
            WHERE active = 1 AND ${faHaystackExpr('full_name')} LIKE ?
            ORDER BY full_name
            LIMIT ${PER_GROUP_LIMIT.staff}
         )
         UNION ALL SELECT * FROM (
           SELECT 'school' AS kind, id, name AS title, COALESCE(code, kind) AS subtitle
             FROM schools
            WHERE active = 1 AND (${faHaystackExpr('name')} LIKE ? OR (code IS NOT NULL AND code LIKE ?))
            ORDER BY name
            LIMIT ${PER_GROUP_LIMIT.schools}
         )
         UNION ALL SELECT * FROM (
           SELECT 'tag' AS kind, id, name AS title,
                  CASE WHEN usage > 0 THEN CAST(usage AS TEXT) ELSE NULL END AS subtitle
             FROM (
               SELECT t.id, t.name, t.category,
                      (SELECT COUNT(*) FROM student_tags st WHERE st.tag_id = t.id) AS usage
                 FROM tags t
                WHERE t.active = 1 AND t.name LIKE ?
                ORDER BY t.category, t.name
                LIMIT ${PER_GROUP_LIMIT.tags}
             )
         )
         UNION ALL SELECT * FROM (
           SELECT 'waitlist' AS kind, id,
                  (first_name || ' ' || last_name) AS title,
                  phone AS subtitle
             FROM waitlist
            WHERE deleted_at IS NULL
              AND (${faHaystackExpr('first_name')} LIKE ? OR ${faHaystackExpr('last_name')} LIKE ?
                   OR phone LIKE ?
                   OR ${faHaystackExpr(`(first_name || ' ' || last_name)`)} LIKE ?)
            ORDER BY last_name, first_name
            LIMIT ${PER_GROUP_LIMIT.waitlist}
         )
         ${docsBranch}`,
        // الگوی جستجو به ترتیب شاخه‌ها: دانش‌آموز×۴، کارمند×۱، مدرسه×۲، برچسب×۱، انتظار×۴ (+ اسناد×۳)
        (() => {
          const params = [pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern];
          if (canSeeDocs) params.push(pattern, pattern, pattern);
          return params;
        })()
      );

      const ofKind = (kind: SearchRow['kind']): SearchRow[] => rows.filter((r) => r.kind === kind);
      const itemsOf = (kind: SearchRow['kind'], type: SearchEntityType): SearchItem[] =>
        ofKind(kind).map((r): SearchItem => ({ type, id: r.id, title: r.title, subtitle: r.subtitle }));

      const groups: SearchGroup[] = [
        { type: 'student', items: capItems(itemsOf('student', 'student'), PER_GROUP_LIMIT.students) },
        { type: 'staff', items: itemsOf('staff', 'staff') },
        { type: 'school', items: itemsOf('school', 'school') },
        { type: 'tag', items: itemsOf('tag', 'tag') },
        { type: 'waitlist', items: itemsOf('waitlist', 'waitlist') },
        // گروه اسناد
        { type: 'doc', items: itemsOf('doc', 'doc') }
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
