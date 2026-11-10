// ─── گزارش باگ سامانه به پشتیبانی CP: سرویس ───
// بازاعمال ۱.۲۵.۵۱ روی درخت ۱.۲۵.۵۳ — فقط DB محلی (مایگریشن 0101)؛
// ارسال به CP در @app/bug-report-forward انجام می‌شود و همین سرویس را به‌روز می‌کند.
// قانون قرارداد: گزارش هرگز حذف فیزیکی نمی‌شود — فقط وضعیت open→sent.
import { BUG_REPORT_AREA_IDS } from '@core/shared';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { BugReportCreateInput, BugReportRecord, BugReportService, BugReportSeverity } from './types';

interface BugReportRow {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  areas: string;
  severity: string;
  description: string | null;
  page: string | null;
  app_version: string | null;
  status: string;
  forward_error: string | null;
  created_at: string;
  forwarded_at: string | null;
}

function recordOf(row: BugReportRow): BugReportRecord {
  let areas: string[] = [];
  try {
    const parsed = JSON.parse(row.areas) as unknown;
    if (Array.isArray(parsed)) areas = parsed.filter((a): a is string => typeof a === 'string');
  } catch {
    areas = [];
  }
  return {
    id: row.id,
    staffId: row.staff_id,
    staffName: row.staff_name,
    areas,
    severity: row.severity as BugReportSeverity,
    description: row.description,
    page: row.page,
    appVersion: row.app_version,
    status: row.status === 'sent' ? 'sent' : 'open',
    forwardError: row.forward_error,
    createdAt: row.created_at,
    forwardedAt: row.forwarded_at
  };
}

/** نگهبان درونی: فقط شناسهٔ ماژول‌های شناخته‌شده می‌روند (CP هم برچسب دارد؛ ناشناخته برچسب خام می‌گیرد) */
function sanitizeAreas(areas: string[]): string[] {
  const seen = new Set<string>();
  for (const a of areas) {
    if (BUG_REPORT_AREA_IDS.includes(a)) seen.add(a);
  }
  return [...seen];
}

export function createBugReportService(db: DbClient, audit: AuditWriter): BugReportService {
  return {
    async create(actor, input, opts) {
      const id = crypto.randomUUID(); // Web Crypto — هم در Workers و هم هارنس
      const now = opts?.now ?? new Date().toISOString().replace('T', ' ').slice(0, 19);
      const areas = sanitizeAreas(input.areas);
      await db.execute(
        `INSERT INTO bug_reports
           (id, staff_id, staff_name, areas, severity, description, page, app_version, status, forward_error, created_at, forwarded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?, NULL)`,
        [
          id,
          actor.id,
          actor.name ?? null,
          JSON.stringify(areas),
          input.severity,
          input.description ?? null,
          input.page ?? null,
          input.appVersion ?? null,
          now
        ]
      );
      await audit.log({
        actorId: actor.id,
        action: 'bug_report.create',
        resourceType: 'bug_report',
        resourceId: id,
        changes: {
          severity: { from: null, to: input.severity },
          areas: { from: null, to: areas.join(',') },
          status: { from: null, to: 'open' }
        }
      });
      const row = await db.queryOne<BugReportRow>('SELECT * FROM bug_reports WHERE id = ? LIMIT 1', [id]);
      return recordOf(row as BugReportRow);
    },

    async list(opts) {
      const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 200);
      const rows = await db.query<BugReportRow>(
        `SELECT * FROM bug_reports ORDER BY created_at DESC, id DESC LIMIT ${limit}`
      );
      return rows.map(recordOf);
    },

    async listOpen(limit) {
      const rows = await db.query<BugReportRow>(
        `SELECT * FROM bug_reports WHERE status = 'open' ORDER BY created_at ASC, id ASC LIMIT ${Math.min(Math.max(limit, 1), 50)}`
      );
      return rows.map(recordOf);
    },

    async markSent(id, forwardedAt) {
      await db.execute(
        "UPDATE bug_reports SET status = 'sent', forwarded_at = ?, forward_error = NULL WHERE id = ?",
        [forwardedAt, id]
      );
    },

    async markForwardError(id, error) {
      await db.execute('UPDATE bug_reports SET forward_error = ? WHERE id = ?', [error.slice(0, 300), id]);
    }
  };
}
