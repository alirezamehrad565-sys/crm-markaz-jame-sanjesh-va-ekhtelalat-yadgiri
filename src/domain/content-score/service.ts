// سرویس «امتیاز شناسنامهٔ آیتم» — 1.25.48 m6
// مولد امتیاز خودِ سامانهٔ کلاینت: refs/uses را از دادهٔ واقعی همین مرکز می‌شمارد و
// با فرمول v1 در content_score_report مادی می‌کند — CP فقط-خواندنی همان را می‌خواند.
// هیچ PII نمی‌شمارد — فقط COUNT ماشینی.

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import { computeItemScore, SCORE_FORMULA_VERSION } from './pure';
import type { ScoreRefreshResult } from './types';
import type { ScoreSourceTable } from './pure';

export interface ContentScoreService {
  /** بازتولید کامل گزارش امتیاز — idempotent روی (source_table, source_id) با UPSERT */
  refresh(): Promise<ScoreRefreshResult>;
  /** شناسنامهٔ امتیاز یک آیتم — null یعنی هنوز تولید نشده */
  get(sourceTable: ScoreSourceTable, sourceId: string): Promise<{ refs: number; uses: number; score: number; formulaVersion: number } | null>;
}

interface CountRow {
  id: string;
  refs: number;
  uses: number;
}

export function createContentScoreService(db: DbClient, audit: AuditWriter): ContentScoreService {
  return {
    async refresh() {
      const startMs = Date.now();
      const nowIso = new Date().toISOString();

      // کارت‌های آماده: refs = ارجاع در کارت‌های جلسهٔ pathway + exercise_ids مسیر فعال؛
      // uses = تخصیص واقعی (لغوشده شمرده نمی‌شود)
      const exerciseRows = await db.query<CountRow>(
        `SELECT e.id,
                (SELECT COUNT(*) FROM pathway_sessions ps JOIN intervention_paths ip ON ip.id = ps.pathway_id
                  WHERE ip.deleted_at IS NULL
                    AND (ps.items_json LIKE '%' || e.id || '%' OR ip.exercise_ids LIKE '%' || e.id || '%')) AS refs,
                (SELECT COUNT(*) FROM exercise_assignments a
                  WHERE a.exercise_id = e.id AND a.status != 'cancelled') AS uses
           FROM exercises e
          WHERE e.deleted_at IS NULL`,
        []
      );

      // قالب‌های طرح درمان: uses = مسیر مداخلهٔ فعال برخاسته از قالب
      const templateRows = await db.query<CountRow>(
        `SELECT t.id,
                0 AS refs,
                (SELECT COUNT(*) FROM intervention_paths ip
                  WHERE ip.template_key = t.key AND ip.deleted_at IS NULL) AS uses
           FROM pathway_templates t
          WHERE t.active = 1`,
        []
      );

      const upsert = (table: string, id: string, refs: number, uses: number) => {
        const s = computeItemScore(refs, uses, nowIso);
        return db.prepare(
          `INSERT INTO content_score_report (source_table, source_id, refs, uses, score, formula_version, generated_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(source_table, source_id) DO UPDATE SET
             refs = excluded.refs, uses = excluded.uses, score = excluded.score,
             formula_version = excluded.formula_version, updated_at = excluded.updated_at`,
          [table, id, s.refs, s.uses, s.score, SCORE_FORMULA_VERSION, s.generatedAt, nowIso]
        );
      };

      const statements = [
        ...exerciseRows.map((r) => upsert('exercises', r.id, Number(r.refs ?? 0), Number(r.uses ?? 0))),
        ...templateRows.map((r) => upsert('pathway_templates', r.id, Number(r.refs ?? 0), Number(r.uses ?? 0)))
      ];
      for (let i = 0; i < statements.length; i += 50) {
        await db.batch(statements.slice(i, i + 50));
      }

      const result: ScoreRefreshResult = {
        exercises: exerciseRows.length,
        templates: templateRows.length,
        durationMs: Math.max(0, Date.now() - startMs)
      };
      await audit.log({
        actorId: 'system:score-engine',
        action: 'content_score.refresh',
        resourceType: 'content_score_report',
        resourceId: 'full',
        changes: {
          exercises: { from: null, to: result.exercises },
          templates: { from: null, to: result.templates }
        }
      });
      return result;
    },

    async get(sourceTable, sourceId) {
      const row = await db.queryOne<{ refs: number; uses: number; score: number; formula_version: number }>(
        'SELECT refs, uses, score, formula_version FROM content_score_report WHERE source_table = ? AND source_id = ? LIMIT 1',
        [sourceTable, sourceId]
      );
      if (!row) return null;
      return {
        refs: Number(row.refs ?? 0),
        uses: Number(row.uses ?? 0),
        score: Number(row.score ?? 0),
        formulaVersion: Number(row.formula_version ?? SCORE_FORMULA_VERSION)
      };
    }
  };
}
