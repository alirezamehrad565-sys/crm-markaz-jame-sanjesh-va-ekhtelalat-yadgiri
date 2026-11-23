// موج ۳ ارتقای پرونده — طرح C «پروندهٔ ناشر»: قطعی‌سازی (snapshot) خروجی‌های پرونده.
// این ماژول هیچ موتور گزارشی را دوباره‌تعریف نمی‌کند؛ سازندهٔ گزارش تزریقی است و این‌جا فقط
// قطعی‌سازی (hash + شمارهٔ سالانه + امضا) و بازخوانیِ راستی‌آزمایی‌شده انجام می‌شود.
import { NotFoundError } from '@core/errors';
import { tehranYmdOf, toJalaliParts } from '@core/shared';
import type { AuthContext } from '@core/shared';
import type { AuditWriter } from '@core/audit';
import type { ReportSnapshotDeps, ReportSnapshotRecord } from './types';

const TEMPLATE_PATHWAY = 'pathway_report';

/* شمارهٔ گزارش: `سال جلالی-ترتیب` با چهار رقم — 1405-0047؛ UNIQUE در جدول رقابت دو صدور هم‌زمان را می‌بندد */
export function reportNoOf(jy: number, seq: number): string {
  return `${jy}-${String(seq).padStart(4, '0')}`;
}

/* سال جلالی لحظهٔ قطعی‌سازی — از ymd تهران (قرارداد مخزن: ملاک تقویم مرکز تهران است) */
export function jalaliYearOfIso(iso: string): number {
  const ymd = tehranYmdOf(iso);
  const [gy, gm, gd] = ymd.split('-').map((x) => Number.parseInt(x, 10));
  return toJalaliParts(gy, gm, gd).jy;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface SnapshotRow {
  id: string;
  student_id: string;
  template_key: string;
  path_id: string | null;
  period_from: string | null;
  period_to: string | null;
  sections_json: string;
  content_hash: string;
  report_no: string;
  signed_by: string | null;
  signed_name: string | null;
  signed_role: string | null;
  created_at: string;
}

function rowToRecord(row: SnapshotRow): ReportSnapshotRecord {
  let sections: unknown = null;
  try { sections = JSON.parse(row.sections_json); } catch { sections = null; }
  return {
    id: row.id,
    studentId: row.student_id,
    templateKey: row.template_key,
    pathId: row.path_id,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    reportNo: row.report_no,
    contentHash: row.content_hash,
    hashVerified: false, // در getOne با بازمحاسبه پر می‌شود؛ لیست صرفاً فهرست است
    signedBy: row.signed_by,
    signedName: row.signed_name,
    signedRole: row.signed_role,
    createdAt: row.created_at,
    sections
  };
}

export function createReportExportService(deps: ReportSnapshotDeps) {
  const { db, audit } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    /* قطعی‌سازی: گزارش زندهٔ مسیر → JSON قطعی + هش + شمارهٔ سالانه + امضاکننده → snapshot مُهر می‌شود */
    async create(studentId: string, input: { pathId: string }, actor: AuthContext): Promise<ReportSnapshotRecord> {
      const report = (await deps.buildReport(input.pathId, actor)) as { pathway?: { studentId?: string } } | null;
      if (!report?.pathway || report.pathway.studentId !== studentId) {
        throw new NotFoundError('مسیر مداخله برای این دانش‌آموز');
      }
      const sectionsJson = JSON.stringify(report);
      const contentHash = await sha256Hex(sectionsJson);
      const nowIso = now().toISOString();
      const jy = jalaliYearOfIso(nowIso);
      const id = crypto.randomUUID();

      // شمارندهٔ سالانهٔ مرکز — UNIQUE(report_no) رقابت دو صدور هم‌زمان را می‌بندد؛ تا ۳ تلاش دوباره‌شمارش
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const cnt = await db.queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM report_snapshots WHERE report_no LIKE ?`,
          [`${jy}-%`]
        );
        const reportNo = reportNoOf(jy, (cnt?.n ?? 0) + 1);
        try {
          await db.execute(
            `INSERT INTO report_snapshots
               (id, student_id, template_key, path_id, period_from, period_to,
                sections_json, content_hash, report_no, signed_by, signed_name, signed_role, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
            [id, studentId, TEMPLATE_PATHWAY, input.pathId, null, null,
              sectionsJson, contentHash, reportNo, actor.staffId, actor.displayName, actor.role]
          );
          await audit.log({
            actorId: actor.staffId,
            action: 'report.snapshot.created',
            resourceType: 'report_snapshot',
            resourceId: id,
            changes: { report_no: { from: null, to: reportNo } }
          });
          return {
            id,
            studentId,
            templateKey: TEMPLATE_PATHWAY,
            pathId: input.pathId,
            periodFrom: null,
            periodTo: null,
            reportNo,
            contentHash,
            hashVerified: true,
            signedBy: actor.staffId,
            signedName: actor.displayName,
            signedRole: actor.role,
            createdAt: nowIso,
            sections: report
          };
        } catch (err) {
          lastErr = err;
          // فقط برخورد UNIQUE شماره = تلاش دوباره؛ بقیهٔ خطاها واقعی‌اند
          if (!String((err as Error)?.message ?? '').includes('UNIQUE')) throw err;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('صدور شمارهٔ گزارش سه تلاش ناموفق داشت');
    },

    async list(studentId: string): Promise<ReportSnapshotRecord[]> {
      const rows = await db.query<SnapshotRow>(
        `SELECT id, student_id, template_key, path_id, period_from, period_to,
                sections_json, content_hash, report_no, signed_by, signed_name, signed_role,
                strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at
           FROM report_snapshots
          WHERE student_id = ?
          ORDER BY created_at DESC, report_no DESC
          LIMIT 100`,
        [studentId]
      );
      return rows.map(rowToRecord);
    },

    /* بازخوانی نسخهٔ قطعی — هش در لحظهٔ خواندن بازمحاسبه می‌شود: «بازتولید عین محتوا» */
    async getOne(studentId: string, id: string): Promise<ReportSnapshotRecord> {
      const row = await db.queryOne<SnapshotRow>(
        `SELECT id, student_id, template_key, path_id, period_from, period_to,
                sections_json, content_hash, report_no, signed_by, signed_name, signed_role,
                strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at
           FROM report_snapshots
          WHERE student_id = ? AND id = ?`,
        [studentId, id]
      );
      if (!row) throw new NotFoundError('نسخهٔ قطعی گزارش');
      const rec = rowToRecord(row);
      rec.hashVerified = (await sha256Hex(row.sections_json)) === row.content_hash;
      return rec;
    }
  };
}

export type ReportExportService2 = ReturnType<typeof createReportExportService>;
